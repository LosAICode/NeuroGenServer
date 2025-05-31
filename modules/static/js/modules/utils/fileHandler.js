/**
 * NeuroGen Server - Enhanced File Handler Module v4.0
 * 
 * Advanced file system operations optimized for the new Blueprint architecture.
 * Provides comprehensive file handling with centralized configuration,
 * enhanced error handling, and integrated health monitoring.
 * 
 * NEW v4.0 Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced 4-method notification system (Toast + Console + System + Error)
 * - Backend connectivity testing with health checks
 * - ES6 module imports with centralized configuration
 * - Cross-platform file path handling for Linux→Windows compatibility
 * - Enhanced file validation and processing
 * - Integrated progress tracking for file operations
 * 
 * @module utils/fileHandler
 * @version 4.0.0 - Blueprint Architecture Optimization
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, FILE_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';

// Global configuration for file handler
const FILE_HANDLER_CONFIG = {
  endpoints: {
    upload: API_ENDPOINTS.FILE_PROCESSING?.UPLOAD || '/api/upload',
    download: API_ENDPOINTS.FILE_PROCESSING?.DOWNLOAD || '/api/download',
    process: API_ENDPOINTS.FILE_PROCESSING?.PROCESS || '/api/process',
    verifyPath: API_ENDPOINTS.FILE_PROCESSING?.VERIFY_PATH || '/api/verify-path',
    createDirectory: API_ENDPOINTS.FILE_PROCESSING?.CREATE_DIRECTORY || '/api/create-directory',
    getOutputFilepath: API_ENDPOINTS.FILE_PROCESSING?.GET_OUTPUT_FILEPATH || '/api/get-output-filepath',
    openFile: API_ENDPOINTS.FILE_PROCESSING?.OPEN_FILE || '/api/open-file',
    openFolder: API_ENDPOINTS.FILE_PROCESSING?.OPEN_FOLDER || '/api/open-folder',
    health: API_ENDPOINTS.SYSTEM?.HEALTH || '/api/health'
  },
  api: API_CONFIG,
  constants: FILE_CONFIG || {
    MAX_FILE_SIZE: 32 * 1024 * 1024, // 32MB
    ACCEPTED_TYPES: [
      'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'application/json'
    ],
    DROP_ZONE_ID: 'file-dropzone'
  },
  events: {
    ...TASK_EVENTS,
    file_upload: 'file_uploaded',
    file_processed: 'file_processed'
  }
};

/**
 * File Handler module
 */
const fileHandler = {
  // Cache for commonly accessed directories
  _directoryCache: {},
  
  // Default upload options (now configured from centralized config)
  _defaultUploadOptions: {
    maxSize: FILE_HANDLER_CONFIG.constants.MAX_FILE_SIZE,
    acceptedTypes: FILE_HANDLER_CONFIG.constants.ACCEPTED_TYPES,
    dropZoneId: FILE_HANDLER_CONFIG.constants.DROP_ZONE_ID,
    multiple: true
  },
  
  // Module state
  _state: {
    initialized: false,
    backendConnected: false,
    uploadsInProgress: 0,
    lastHealthCheck: null
  },
  
  // API endpoints (now configured from centralized config)
  _endpoints: FILE_HANDLER_CONFIG.endpoints,
  
  
  /**
   * Initialize the file handler with v4.0 enhancements
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize(options = {}) {
    if (this._state.initialized) {
      this.showNotification('File handler already initialized', 'warning', 'File Handler');
      return false;
    }
    
    try {
      this.showNotification('Initializing File Handler v4.0', 'info', 'File Handler');
      
      // Test backend connectivity on initialization
      const connectivityResult = await this.testBackendConnectivity();
      if (!connectivityResult.overall) {
        console.warn('File Handler: Backend connectivity test failed, continuing with limited functionality');
      }
      
      // Override default endpoints if provided
      if (options.endpoints) {
        this._endpoints = {...this._endpoints, ...options.endpoints};
      }
      
      // Override default upload options if provided
      if (options.uploadOptions) {
        this._defaultUploadOptions = {...this._defaultUploadOptions, ...options.uploadOptions};
      }
      
      // Set up file drag and drop handlers if needed
      if (options.setupDropZone || options.setupDropZone === undefined) {
        this._setupFileDropZone();
      }
      
      // Make available globally for debugging if in debug mode
      if (window.debugMode) {
        window.fileHandler = this;
      }
      
      this._state.initialized = true;
      this.showNotification('File Handler v4.0 initialized successfully', 'success', 'File Handler');
      return true;
    } catch (error) {
      this.showNotification(`File Handler initialization failed: ${error.message}`, 'error', 'File Handler');
      return false;
    }
  },
  
  /**
   * Set up file drop zone for drag and drop file uploads
   * @private
   */
  _setupFileDropZone() {
    const dropZone = document.getElementById(this._defaultUploadOptions.dropZoneId);
    if (!dropZone) {
      console.warn(`Drop zone element #${this._defaultUploadOptions.dropZoneId} not found`);
      return;
    }
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });
    
    // Highlight drop zone when drag enters
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('dragover');
      }, false);
    });
    
    // Remove highlight when drag leaves
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
      }, false);
    });
    
    // Handle dropped files
    dropZone.addEventListener('drop', e => {
      const files = e.dataTransfer.files;
      this.uploadFiles(files);
    }, false);
    
    console.log(`File drop zone #${this._defaultUploadOptions.dropZoneId} set up`);
  },
  
  /**
   * Upload files to the server
   * @param {FileList|Array<File>} files - Files to upload
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} - Upload result
   */
  async uploadFiles(files, options = {}) {
    const settings = {...this._defaultUploadOptions, ...options};
    
    // Validate files
    const validFiles = Array.from(files).filter(file => {
      // Check file size
      if (file.size > settings.maxSize) {
        console.warn(`File ${file.name} exceeds maximum size of ${this._formatBytes(settings.maxSize)}`);
        
        // Show error if errorHandler is available
        if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
          window.errorHandler.showError(`File ${file.name} exceeds maximum size of ${this._formatBytes(settings.maxSize)}`);
        }
        
        return false;
      }
      
      // Check file type if acceptedTypes is provided and not empty
      if (settings.acceptedTypes && settings.acceptedTypes.length > 0) {
        const fileType = file.type || this._getFileExtension(file.name);
        const isAccepted = settings.acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            // Check file extension
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          } else {
            // Check MIME type
            return file.type === type || file.type.startsWith(`${type}/`);
          }
        });
        
        if (!isAccepted) {
          console.warn(`File ${file.name} has unsupported type: ${file.type}`);
          
          // Show error if errorHandler is available
          if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
            window.errorHandler.showError(`File type not supported: ${file.name}`);
          }
          
          return false;
        }
      }
      
      return true;
    });
    
    if (validFiles.length === 0) {
      return { success: false, message: 'No valid files to upload' };
    }
    
    try {
      // Show loading if ui module is available
      if (window.ui && typeof window.ui.showLoading === 'function') {
        window.ui.showLoading('Uploading files...');
      }
      
      // Create FormData
      const formData = new FormData();
      
      // Add files
      validFiles.forEach(file => {
        formData.append('files', file);
      });
      
      // Add extra data if provided
      if (settings.data) {
        Object.entries(settings.data).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }
      
      // Upload to server
      const response = await fetch(this._endpoints.upload, {
        method: 'POST',
        body: formData
      });
      
      // Hide loading if ui module is available
      if (window.ui && typeof window.ui.hideLoading === 'function') {
        window.ui.hideLoading();
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Upload failed');
      }
      
      const result = await response.json();
      
      // Show success if ui module is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast(`Successfully uploaded ${validFiles.length} file(s)`, 'success');
      }
      
      // Emit event if eventRegistry is available
      try {
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
          window.eventRegistry.emit('file:uploaded', {
            files: validFiles.map(f => f.name),
            result
          });
        }
      } catch (e) {
        // Ignore errors with event registry
      }
      
      return result;
    } catch (error) {
      console.error('Upload error:', error);
      
      // Hide loading if ui module is available
      if (window.ui && typeof window.ui.hideLoading === 'function') {
        window.ui.hideLoading();
      }
      
      // Show error if errorHandler is available
      if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
        window.errorHandler.showError(`Upload failed: ${error.message}`);
      }
      
      return { success: false, error: error.message };
    }
  },
  
/**
   * Download a file from the server
   * @param {string} filePath - Path to the file
   * @param {string} newFilename - Optional new filename for the download
   * @returns {Promise<boolean>} - Whether download was successful
   */
async downloadFile(filePath, newFilename = null) {
  try {
    // Show loading if ui module is available
    if (window.ui && typeof window.ui.showLoading === 'function') {
      window.ui.showLoading('Preparing download...');
    }
    
    // Encode the file path
    const encodedPath = encodeURIComponent(filePath);
    
    // Build the download URL
    let downloadUrl = `${this._endpoints.download}/${encodedPath}`;
    
    // Add new filename if provided
    if (newFilename) {
      downloadUrl += `?filename=${encodeURIComponent(newFilename)}`;
    }
    
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.download = newFilename || this._getFilenameFromPath(filePath);
    
    // Append to document, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    // Show success message
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast('Download started', 'success');
    }
    
    // Emit event if eventRegistry is available
    try {
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('file:downloaded', {
          filePath,
          filename: newFilename || this._getFilenameFromPath(filePath)
        });
      }
    } catch (e) {
      // Ignore errors with event registry
    }
    
    return true;
  } catch (error) {
    console.error('Download error:', error);
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Download failed: ${error.message}`);
    }
    
    return false;
  }
},

/**
 * Open a file using the system's default application
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether file was opened successfully
 */
async openFile(filePath) {
  try {
    // Show loading if ui module is available
    if (window.ui && typeof window.ui.showLoading === 'function') {
      window.ui.showLoading('Opening file...');
    }
    
    // Call the API endpoint
    const response = await fetch(this._endpoints.openFile, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: filePath })
    });
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to open file');
    }
    
    const result = await response.json();
    
    // Show success if ui module is available
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast('File opened successfully', 'success');
    }
    
    // Emit event if eventRegistry is available
    try {
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('file:opened', {
          filePath
        });
      }
    } catch (e) {
      // Ignore errors with event registry
    }
    
    return result.success;
  } catch (error) {
    console.error('Open file error:', error);
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Failed to open file: ${error.message}`);
    }
    
    return false;
  }
},

/**
 * Open a directory using the system's file explorer
 * @param {string} directoryPath - Path to the directory
 * @returns {Promise<boolean>} - Whether directory was opened successfully
 */
async openDirectory(directoryPath) {
  try {
    // Show loading if ui module is available
    if (window.ui && typeof window.ui.showLoading === 'function') {
      window.ui.showLoading('Opening folder...');
    }
    
    // Call the API endpoint
    const response = await fetch(this._endpoints.openFolder, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: directoryPath })
    });
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to open folder');
    }
    
    const result = await response.json();
    
    // Show success if ui module is available
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast('Folder opened successfully', 'success');
    }
    
    // Emit event if eventRegistry is available
    try {
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('directory:opened', {
          directoryPath
        });
      }
    } catch (e) {
      // Ignore errors with event registry
    }
    
    return result.success;
  } catch (error) {
    console.error('Open directory error:', error);
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Failed to open folder: ${error.message}`);
    }
    
    return false;
  }
},

/**
 * Verify if a path exists and is accessible
 * @param {string} path - Path to verify
 * @returns {Promise<Object>} - Path verification result
 */
async verifyPath(path) {
  try {
    // Call the API endpoint
    const response = await fetch(this._endpoints.verifyPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Path verification failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Path verification error:', error);
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Path verification failed: ${error.message}`);
    }
    
    return { exists: false, error: error.message };
  }
},

/**
 * Create a directory
 * @param {string} path - Directory path to create
 * @returns {Promise<Object>} - Directory creation result
 */
async createDirectory(path) {
  try {
    // Show loading if ui module is available
    if (window.ui && typeof window.ui.showLoading === 'function') {
      window.ui.showLoading('Creating directory...');
    }
    
    // Call the API endpoint
    const response = await fetch(this._endpoints.createDirectory, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Directory creation failed');
    }
    
    const result = await response.json();
    
    // Show success if ui module is available
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast('Directory created successfully', 'success');
    }
    
    // Emit event if eventRegistry is available
    try {
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('directory:created', {
          path,
          result
        });
      }
    } catch (e) {
      // Ignore errors with event registry
    }
    
    return result;
  } catch (error) {
    console.error('Directory creation error:', error);
    
    // Hide loading if ui module is available
    if (window.ui && typeof window.ui.hideLoading === 'function') {
      window.ui.hideLoading();
    }
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Failed to create directory: ${error.message}`);
    }
    
    return { success: false, error: error.message };
  }
},

/**
 * Get a properly formatted output filepath
 * @param {string} filename - Filename
 * @param {string} directory - Optional output directory
 * @returns {Promise<Object>} - Filepath result
 */
async getOutputFilepath(filename, directory = null) {
  try {
    // Prepare request data
    const data = { filename };
    if (directory) {
      data.directory = directory;
    }
    
    // Call the API endpoint
    const response = await fetch(this._endpoints.getOutputFilepath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get output filepath');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get output filepath error:', error);
    
    // Show error if errorHandler is available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(`Failed to get output filepath: ${error.message}`);
    }
    
    return { error: error.message };
  }
},

/**
 * Get filename from a path
 * @private
 * @param {string} path - File path
 * @returns {string} - Filename
 */
_getFilenameFromPath(path) {
  return path.split(/[/\\]/).pop();
},

/**
 * Get file extension from a filename
 * @private
 * @param {string} filename - Filename
 * @returns {string} - File extension with dot
 */
_getFileExtension(filename) {
  const match = filename.match(/\.([^.]+)$/);
  return match ? `.${match[1].toLowerCase()}` : '';
},

/**
 * Format bytes to human-readable size
 * @private
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted size
 */
_formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
},

/**
 * Enhanced notification system with 4-method delivery (v4.0)
 * @param {string} message - Notification message
 * @param {string} type - Notification type (info, success, warning, error)
 * @param {string} title - Notification title
 */
showNotification(message, type = 'info', title = 'File Handler') {
  // Method 1: Toast notifications
  if (window.NeuroGen?.ui?.showToast) {
    window.NeuroGen.ui.showToast(title, message, type);
  }
  
  // Method 2: Console logging with styling
  const styles = {
    error: 'color: #dc3545; font-weight: bold;',
    warning: 'color: #fd7e14; font-weight: bold;',
    success: 'color: #198754; font-weight: bold;',
    info: 'color: #0d6efd;'
  };
  console.log(`%c[${title}] ${message}`, styles[type] || styles.info);
  
  // Method 3: System notification (if available)
  if (window.NeuroGen?.notificationHandler) {
    window.NeuroGen.notificationHandler.show({
      title, message, type, module: 'fileHandler'
    });
  }
  
  // Method 4: Error reporting to centralized handler
  if (type === 'error' && window.NeuroGen?.errorHandler) {
    window.NeuroGen.errorHandler.logError({
      module: 'fileHandler', message, severity: type
    });
  }
},

/**
 * Test backend connectivity for file handler (v4.0)
 * @returns {Promise<Object>} Backend connectivity status
 */
async testBackendConnectivity() {
  const results = {
    overall: false,
    details: {},
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // Test main health endpoint
    const healthResponse = await fetch(this._endpoints.health, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    results.details.health = {
      status: healthResponse.status,
      ok: healthResponse.ok,
      endpoint: this._endpoints.health
    };

    if (healthResponse.ok) {
      // Test file-specific endpoints
      const fileEndpoints = ['verifyPath', 'getOutputFilepath'];
      for (const endpoint of fileEndpoints) {
        try {
          const testResponse = await fetch(this._endpoints[endpoint], {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          results.details[endpoint] = {
            status: testResponse.status,
            ok: testResponse.status < 500,
            endpoint: this._endpoints[endpoint]
          };
        } catch (error) {
          results.details[endpoint] = {
            error: error.message,
            endpoint: this._endpoints[endpoint]
          };
        }
      }
      
      results.overall = true;
      this._state.backendConnected = true;
      this._state.lastHealthCheck = new Date().toISOString();
      this.showNotification('Backend connectivity verified', 'success', 'File Handler');
    } else {
      throw new Error(`Health endpoint returned ${healthResponse.status}`);
    }

  } catch (error) {
    results.errors.push({
      endpoint: this._endpoints.health,
      error: error.message
    });
    this._state.backendConnected = false;
    this.showNotification(`Backend connectivity failed: ${error.message}`, 'error', 'File Handler');
  }

  return results;
},

/**
 * Get file handler health status (v4.0)
 * @returns {Object} Health status information
 */
getHealthStatus() {
  return {
    module: 'fileHandler',
    version: '4.0.0',
    status: this._state.initialized ? 'healthy' : 'initializing',
    features: {
      configurationDriven: true,
      enhancedNotifications: true,
      backendConnectivity: true,
      dragDropSupport: true,
      crossPlatformPaths: true,
      fileValidation: true
    },
    configuration: {
      endpoints: this._endpoints,
      uploadOptions: this._defaultUploadOptions,
      maxFileSize: FILE_HANDLER_CONFIG.constants.MAX_FILE_SIZE,
      acceptedTypes: FILE_HANDLER_CONFIG.constants.ACCEPTED_TYPES.length
    },
    statistics: {
      uploadsInProgress: this._state.uploadsInProgress,
      lastHealthCheck: this._state.lastHealthCheck,
      backendConnected: this._state.backendConnected,
      cacheSize: Object.keys(this._directoryCache).length
    }
  };
}
};

// Export both default and named exports
export default fileHandler;
export const uploadFiles = fileHandler.uploadFiles.bind(fileHandler);
export const downloadFile = fileHandler.downloadFile.bind(fileHandler);
export const openFile = fileHandler.openFile.bind(fileHandler);
export const openDirectory = fileHandler.openDirectory.bind(fileHandler);
export const verifyPath = fileHandler.verifyPath.bind(fileHandler);
export const createDirectory = fileHandler.createDirectory.bind(fileHandler);
export const getOutputFilepath = fileHandler.getOutputFilepath.bind(fileHandler);
export const initialize = fileHandler.initialize.bind(fileHandler);

// v4.0 Enhanced exports
export const showNotification = fileHandler.showNotification.bind(fileHandler);
export const testBackendConnectivity = fileHandler.testBackendConnectivity.bind(fileHandler);
export const getHealthStatus = fileHandler.getHealthStatus.bind(fileHandler);