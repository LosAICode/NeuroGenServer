/**
 * Blueprint API Service
 * 
 * Centralized API service for Flask Blueprint architecture with cross-platform support.
 * Handles all HTTP communication with Blueprint endpoints including proper error handling,
 * retry logic, and cross-platform path conversion.
 * 
 * @module services/blueprintApi
 * @version 3.0.0
 */

import { 
  API_ENDPOINTS, 
  BLUEPRINT_ROUTES,
  buildEndpoint, 
  buildUrlWithQuery,
  getEndpointMethods,
  getEndpointTimeout,
  validateEndpoint,
  sanitizePathForLinuxServer,
  sanitizeFilenameForWindows
} from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, ERROR_MESSAGES } from '../config/constants.js';

/**
 * Blueprint API Service Class
 */
class BlueprintApiService {
  constructor() {
    this.baseURL = API_CONFIG.API_BASE_URL;
    this.retryAttempts = API_CONFIG.API_RETRY_ATTEMPTS;
    this.retryDelay = API_CONFIG.API_RETRY_DELAY;
    this.concurrentRequests = API_CONFIG.API_CONCURRENT_REQUESTS;
    
    // Track active requests for cancellation
    this.activeRequests = new Map();
    
    // Request queue for rate limiting
    this.requestQueue = [];
    this.processingQueue = false;
    
    // Blueprint-specific configurations
    this.blueprintConfigs = new Map();
    this.initializeBlueprintConfigs();
    
    // Cross-platform settings
    this.crossPlatformEnabled = CONSTANTS.FEATURE_FLAGS.ENABLE_CROSS_PLATFORM_PATHS;
    this.serverPlatform = 'linux'; // Production default
    this.clientPlatform = this.detectClientPlatform();
  }

  /**
   * Initialize Blueprint-specific configurations
   */
  initializeBlueprintConfigs() {
    Object.entries(BLUEPRINT_ROUTES).forEach(([name, config]) => {
      this.blueprintConfigs.set(name, {
        ...config,
        timeout: API_CONFIG.BLUEPRINT_TIMEOUTS[name] || API_CONFIG.API_TIMEOUT,
        retryAttempts: name === 'file_processor' ? 5 : 3, // More retries for file processing
        rateLimit: name === 'academic_search' ? 2 : 10 // Lower rate limit for academic APIs
      });
    });
  }

  /**
   * Detect client platform for cross-platform operations
   */
  detectClientPlatform() {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('win')) return 'windows';
    if (platform.includes('mac')) return 'mac';
    return 'linux';
  }

  /**
   * Make API request with Blueprint-aware error handling
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {string} blueprint - Blueprint name (optional, auto-detected)
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}, blueprint = null) {
    // Validate endpoint
    const validation = validateEndpoint(endpoint);
    if (!validation.valid) {
      throw new Error(`Invalid endpoint: ${endpoint} - ${validation.error}`);
    }

    blueprint = blueprint || validation.blueprint;
    const blueprintConfig = this.blueprintConfigs.get(blueprint);
    
    // Prepare request configuration
    const requestConfig = {
      method: options.method || getEndpointMethods(endpoint)[0] || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || blueprintConfig?.timeout || getEndpointTimeout(endpoint),
      ...options
    };

    // Handle cross-platform path conversion
    if (this.crossPlatformEnabled && requestConfig.body && typeof requestConfig.body === 'object') {
      requestConfig.body = this.convertPathsForServer(requestConfig.body);
    }

    // Create request ID for tracking
    const requestId = this.generateRequestId();
    
    try {
      // Add to rate limiting queue
      const response = await this.queueRequest(endpoint, requestConfig, requestId);
      
      // Handle cross-platform response conversion
      if (this.crossPlatformEnabled && response && typeof response === 'object') {
        return this.convertPathsForClient(response);
      }
      
      return response;
    } catch (error) {
      this.handleRequestError(error, endpoint, blueprint, requestId);
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Queue request for rate limiting
   * @param {string} endpoint - API endpoint
   * @param {Object} config - Request configuration
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} Response data
   */
  async queueRequest(endpoint, config, requestId) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        endpoint,
        config,
        requestId,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      this.processRequestQueue();
    });
  }

  /**
   * Process request queue with rate limiting
   */
  async processRequestQueue() {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.requestQueue.length > 0 && this.activeRequests.size < this.concurrentRequests) {
      const queueItem = this.requestQueue.shift();
      
      // Start request without waiting
      this.executeRequest(queueItem)
        .then(queueItem.resolve)
        .catch(queueItem.reject);
      
      // Small delay for rate limiting
      await this.sleep(100);
    }

    this.processingQueue = false;
    
    // Continue processing if there are more requests
    if (this.requestQueue.length > 0) {
      setTimeout(() => this.processRequestQueue(), 200);
    }
  }

  /**
   * Execute individual request with retry logic
   * @param {Object} queueItem - Queue item
   * @returns {Promise<Object>} Response data
   */
  async executeRequest(queueItem) {
    const { endpoint, config, requestId } = queueItem;
    
    // Create abort controller for cancellation
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);
    
    config.signal = controller.signal;

    let lastError;
    const maxRetries = config.retryAttempts || this.retryAttempts;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(endpoint, config);
        
        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response);
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse response based on content type
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else if (contentType && contentType.includes('text/')) {
          return await response.text();
        } else {
          return response;
        }

      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.name === 'AbortError' || error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Calculate backoff delay
        const delay = this.retryDelay * Math.pow(API_CONFIG.API_RETRY_BACKOFF_MULTIPLIER, attempt);
        await this.sleep(Math.min(delay, API_CONFIG.API_MAX_RETRY_DELAY));
      }
    }

    throw lastError;
  }

  /**
   * Fetch with timeout support
   * @param {string} endpoint - API endpoint
   * @param {Object} config - Request configuration
   * @returns {Promise<Response>} Fetch response
   */
  async fetchWithTimeout(endpoint, config) {
    const { timeout, ...fetchConfig } = config;
    
    if (timeout) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });
      
      return Promise.race([
        fetch(endpoint, fetchConfig),
        timeoutPromise
      ]);
    }
    
    return fetch(endpoint, fetchConfig);
  }

  /**
   * Parse error response from server
   * @param {Response} response - Fetch response
   * @returns {Promise<Object>} Error data
   */
  async parseErrorResponse(response) {
    try {
      const errorData = await response.json();
      
      // Handle Blueprint error format
      if (errorData.error && typeof errorData.error === 'object') {
        return {
          code: errorData.error.code,
          message: errorData.error.message,
          details: errorData.error.details
        };
      }
      
      return errorData;
    } catch (error) {
      return {
        message: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status
      };
    }
  }

  /**
   * Handle request errors with Blueprint-specific logic
   * @param {Error} error - Error object
   * @param {string} endpoint - API endpoint
   * @param {string} blueprint - Blueprint name
   * @param {string} requestId - Request ID
   */
  handleRequestError(error, endpoint, blueprint, requestId) {
    console.error(`Blueprint API Error [${blueprint}]:`, {
      endpoint,
      requestId,
      error: error.message,
      stack: error.stack
    });

    // Add Blueprint context to error
    error.blueprint = blueprint;
    error.endpoint = endpoint;
    error.requestId = requestId;
    
    // Emit error event for global error handling
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('blueprint-api-error', {
        detail: { error, endpoint, blueprint, requestId }
      }));
    }
  }

  /**
   * Convert request paths for Linux server
   * @param {Object} data - Request data
   * @returns {Object} Converted data
   */
  convertPathsForServer(data) {
    if (!this.crossPlatformEnabled || this.clientPlatform !== 'windows') {
      return data;
    }

    const converted = { ...data };
    
    // Convert common path fields
    const pathFields = ['input_dir', 'output_file', 'root_directory', 'file_path', 'directory'];
    
    pathFields.forEach(field => {
      if (converted[field] && typeof converted[field] === 'string') {
        converted[field] = sanitizePathForLinuxServer(converted[field]);
      }
    });

    return converted;
  }

  /**
   * Convert response paths for Windows client
   * @param {Object} data - Response data
   * @returns {Object} Converted data
   */
  convertPathsForClient(data) {
    if (!this.crossPlatformEnabled || this.clientPlatform !== 'windows') {
      return data;
    }

    const converted = { ...data };
    
    // Convert filenames for Windows compatibility
    const filenameFields = ['output_file', 'filename', 'file_name'];
    
    filenameFields.forEach(field => {
      if (converted[field] && typeof converted[field] === 'string') {
        converted[field] = sanitizeFilenameForWindows(converted[field]);
      }
    });

    // Convert file arrays
    if (converted.files && Array.isArray(converted.files)) {
      converted.files = converted.files.map(file => ({
        ...file,
        name: sanitizeFilenameForWindows(file.name || file.filename || '')
      }));
    }

    return converted;
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel request by ID
   * @param {string} requestId - Request ID
   * @returns {boolean} True if cancelled
   */
  cancelRequest(requestId) {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
    this.requestQueue.length = 0;
  }

  /**
   * Get active request count
   * @returns {number} Active request count
   */
  getActiveRequestCount() {
    return this.activeRequests.size;
  }

  // Blueprint-specific methods

  /**
   * File Processor API methods
   */
  async processFiles(inputDir, outputFile, options = {}) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.PROCESS), {
      method: 'POST',
      body: JSON.stringify({
        input_dir: inputDir,
        output_file: outputFile,
        ...options
      })
    }, 'file_processor');
  }

  async processFileUpload(formData, timeout = null) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.PROCESS), {
      method: 'POST',
      body: formData,
      timeout: timeout
    }, 'file_processor');
  }

  async getTaskStatus(taskId, blueprint = null) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.STATUS, { taskId }), {
      method: 'GET'
    }, blueprint);
  }

  async downloadTaskResult(taskId) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.DOWNLOAD, { taskId }), {
      method: 'GET'
    }, 'file_processor');
  }

  async verifyPath(path) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.VERIFY_PATH), {
      method: 'POST',
      body: JSON.stringify({ path })
    }, 'file_processor');
  }

  async createDirectory(path) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.CREATE_DIRECTORY), {
      method: 'POST',
      body: JSON.stringify({ path })
    }, 'file_processor');
  }

  async openFile(path) {
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.OPEN_FILE), {
      method: 'POST',
      body: JSON.stringify({ path })
    }, 'file_processor');
  }

  async detectPath(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    return this.request(buildEndpoint(API_ENDPOINTS.FILE_PROCESSING.DETECT_PATH), {
      method: 'POST',
      body: formData
    }, 'file_processor');
  }

  /**
   * Playlist Downloader API methods
   */
  async startPlaylistDownload(playlists, rootDirectory, outputFile) {
    return this.request(buildEndpoint(API_ENDPOINTS.PLAYLIST.START), {
      method: 'POST',
      body: JSON.stringify({
        playlists,
        root_directory: rootDirectory,
        output_file: outputFile
      })
    }, 'playlist_downloader');
  }

  async cancelPlaylistDownload(taskId) {
    return this.request(buildEndpoint(API_ENDPOINTS.PLAYLIST.CANCEL, { taskId }), {
      method: 'POST'
    }, 'playlist_downloader');
  }

  /**
   * Web Scraper API methods
   */
  async startWebScraping(urls, outputFile, options = {}) {
    return this.request(buildEndpoint(API_ENDPOINTS.WEB_SCRAPER.SCRAPE), {
      method: 'POST',
      body: JSON.stringify({
        urls,
        output_file: outputFile,
        ...options
      })
    }, 'web_scraper');
  }

  async getScrapingResults(taskId) {
    return this.request(buildEndpoint(API_ENDPOINTS.WEB_SCRAPER.RESULTS, { taskId }), {
      method: 'GET'
    }, 'web_scraper');
  }

  /**
   * Academic Search API methods
   */
  async searchAcademicPapers(query, sources = [], maxResults = 50) {
    return this.request(buildEndpoint(API_ENDPOINTS.ACADEMIC.SEARCH), {
      method: 'POST',
      body: JSON.stringify({
        query,
        sources,
        max_results: maxResults
      })
    }, 'academic_search');
  }

  async getAcademicHealth() {
    return this.request(buildEndpoint(API_ENDPOINTS.ACADEMIC.HEALTH), {
      method: 'GET'
    }, 'academic_search');
  }

  /**
   * PDF Processor API methods
   */
  async processPdf(filePath, options = {}) {
    return this.request(buildEndpoint(API_ENDPOINTS.PDF.PROCESS), {
      method: 'POST',
      body: JSON.stringify({
        file_path: filePath,
        ...options
      })
    }, 'pdf_processor');
  }

  /**
   * Task Management API methods
   */
  async cancelTask(taskId) {
    return this.request(buildEndpoint(API_ENDPOINTS.TASK.CANCEL, { taskId }), {
      method: 'POST'
    }, 'management');
  }

  async getTaskAnalytics() {
    return this.request(buildEndpoint(API_ENDPOINTS.TASK.ANALYTICS), {
      method: 'GET'
    }, 'management');
  }

  async listTasks() {
    return this.request(buildEndpoint(API_ENDPOINTS.TASK.LIST), {
      method: 'GET'
    }, 'management');
  }

  /**
   * System API methods
   */
  async getSystemHealth() {
    return this.request(buildEndpoint(API_ENDPOINTS.SYSTEM.HEALTH), {
      method: 'GET'
    }, 'core');
  }

  async runModuleDiagnostics() {
    return this.request(buildUrlWithQuery(API_ENDPOINTS.SYSTEM.TEST_MODULES, { format: 'json' }), {
      method: 'GET'
    }, 'core');
  }

  /**
   * Get Blueprint configuration
   * @param {string} blueprint - Blueprint name
   * @returns {Object} Blueprint configuration
   */
  getBlueprintConfig(blueprint) {
    return this.blueprintConfigs.get(blueprint);
  }

  /**
   * Update Blueprint configuration
   * @param {string} blueprint - Blueprint name
   * @param {Object} config - New configuration
   */
  updateBlueprintConfig(blueprint, config) {
    const existing = this.blueprintConfigs.get(blueprint) || {};
    this.blueprintConfigs.set(blueprint, { ...existing, ...config });
  }

  /**
   * Get all Blueprint configurations
   * @returns {Map} All Blueprint configurations
   */
  getAllBlueprintConfigs() {
    return new Map(this.blueprintConfigs);
  }

  /**
   * Get service health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      activeRequests: this.activeRequests.size,
      queueLength: this.requestQueue.length,
      processingQueue: this.processingQueue,
      crossPlatformEnabled: this.crossPlatformEnabled,
      serverPlatform: this.serverPlatform,
      clientPlatform: this.clientPlatform,
      blueprintCount: this.blueprintConfigs.size,
      timestamp: Date.now()
    };
  }

  /**
   * Clear request queue and reset state
   */
  reset() {
    this.cancelAllRequests();
    this.processingQueue = false;
    this.requestQueue.length = 0;
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled - Debug mode enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    if (enabled) {
      console.log('Blueprint API Service - Debug mode enabled');
      console.log('Current configuration:', this.getHealthStatus());
    }
  }
}

// Create singleton instance
const blueprintApi = new BlueprintApiService();

// Export singleton instance and class
export default blueprintApi;
export { BlueprintApiService };

// Export convenience methods for direct use
export const {
  processFiles,
  processFileUpload,
  getTaskStatus,
  downloadTaskResult,
  verifyPath,
  createDirectory,
  openFile,
  detectPath,
  startPlaylistDownload,
  cancelPlaylistDownload,
  startWebScraping,
  getScrapingResults,
  searchAcademicPapers,
  getAcademicHealth,
  processPdf,
  cancelTask,
  getTaskAnalytics,
  listTasks,
  getSystemHealth,
  runModuleDiagnostics
} = blueprintApi;

// Export health and configuration methods
export const getServiceHealth = () => blueprintApi.getHealthStatus();
export const resetService = () => blueprintApi.reset();
export const setBlueprintDebug = (enabled) => blueprintApi.setDebugMode(enabled);

// Initialize debug mode if enabled
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') === 'true' || localStorage.getItem('neurogen_v3_debug_mode') === 'true') {
    blueprintApi.setDebugMode(true);
  }

  // Expose to global scope for debugging
  if (blueprintApi.debugMode) {
    window.blueprintApi = blueprintApi;
    window.blueprintApiHealth = getServiceHealth;
  }
}