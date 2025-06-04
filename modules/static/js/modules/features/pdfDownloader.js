/**
 * PDF Downloader Module
 * 
 * Handles academic paper search, PDF discovery, and PDF downloading functionality.
 * Separated from webScraper.js for better organization and maintainability.
 * 
 * Features:
 * - Academic paper search across multiple sources (arXiv, Semantic Scholar, PubMed, etc.)
 * - PDF discovery and extraction from web pages
 * - Multi-select PDF download queue management
 * - Real-time progress tracking for downloads
 * - Integration with backend academic search API
 * 
 * @module features/pdfDownloader
 * @version 1.0.0
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, SOCKET_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';

// PDF Downloader specific configuration from centralized config
const PDF_DOWNLOADER_CONFIG = {
  endpoints: API_ENDPOINTS.PDF_DOWNLOADER,
  blueprint: BLUEPRINT_ROUTES.pdf_downloader,
  timeout: API_CONFIG.BLUEPRINT_TIMEOUTS?.pdf_downloader || API_CONFIG.API_TIMEOUT,
  retryAttempts: API_CONFIG.API_RETRY_ATTEMPTS,
  retryDelay: API_CONFIG.API_RETRY_DELAY
};

const ACADEMIC_CONFIG = {
  endpoints: API_ENDPOINTS.ACADEMIC,
  blueprint: BLUEPRINT_ROUTES.academic_search
};

// Initialize module with config
let blueprintApi, moduleImports;
async function initializeImports() {
  try {
    // Import core modules
    blueprintApi = window.NeuroGen?.modules?.blueprintApi;
    moduleImports = window.NeuroGen?.modules?.moduleImports;
    
    if (!blueprintApi) {
      console.warn('Blueprint API not available, using fetch fallback');
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing PDF downloader imports:', error);
    return false;
  }
}

class PDFDownloader {
  constructor() {
    this.state = {
      isInitialized: false,
      elements: new Map(),
      eventListeners: new Set(),
      socketListeners: new Set(),
      currentSearch: null,
      searchResults: new Map(),
      selectedPdfs: new Set(),
      downloadQueue: new Map(),
      activeDownloads: new Map(),
      processingState: 'idle'
    };
    
    // Use centralized configuration
    this.config = {
      maxResultsPerSource: CONSTANTS.SEARCH?.MAX_RESULTS_PER_SOURCE || 10,
      defaultSources: CONSTANTS.ACADEMIC?.DEFAULT_SOURCES || ['arxiv', 'semantic_scholar'],
      downloadConcurrency: API_CONFIG.API_CONCURRENT_REQUESTS || 3,
      retryAttempts: PDF_DOWNLOADER_CONFIG.retryAttempts,
      timeout: PDF_DOWNLOADER_CONFIG.timeout,
      endpoints: PDF_DOWNLOADER_CONFIG.endpoints,
      academicEndpoints: ACADEMIC_CONFIG.endpoints
    };
  }

  /**
   * Initialize the PDF Downloader module
   */
  async init() {
    try {
      console.log('🔍 Initializing PDF Downloader module...');
      
      // Initialize imports
      const importSuccess = await initializeImports();
      if (!importSuccess) {
        console.warn('Some imports failed, continuing with fallbacks');
      }
      
      // Test backend connectivity
      await this.testBackendConnectivity();
      
      // Cache DOM elements
      this.cacheElements();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Setup Socket.IO listeners
      this.setupSocketListeners();
      
      // Initialize UI state
      this.updateUI();
      
      this.state.isInitialized = true;
      console.log('✅ PDF Downloader initialized successfully');
      
      // Register with module system if available
      if (window.NeuroGen?.registerModule) {
        window.NeuroGen.registerModule('pdfDownloader', this);
      }
      
    } catch (error) {
      console.error('❌ PDF Downloader initialization failed:', error);
      this.state.isInitialized = true; // Allow graceful degradation
    }
  }

  /**
   * Test backend connectivity using health endpoint
   */
  async testBackendConnectivity() {
    try {
      console.log('🔍 Testing PDF Downloader backend connectivity...');
      
      const response = await fetch(this.config.endpoints.HEALTH, {
        method: 'GET',
        headers: {
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        timeout: 5000
      });
      
      if (response.ok) {
        const healthData = await response.json();
        console.log('✅ PDF Downloader backend is healthy:', healthData);
        return true;
      } else {
        console.warn('⚠️ PDF Downloader backend health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ PDF Downloader backend connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Cache DOM elements for efficient access
   */
  cacheElements() {
    const elementIds = [
      // Academic search elements
      'academic-search-input',
      'academic-sources-select',
      'academic-max-results',
      'academic-search-btn',
      'academic-results-container',
      'academic-results-list',
      
      // PDF downloader tab elements
      'pdf-single-form',
      'pdf-single-url-input',
      'pdf-single-filename',
      'pdf-single-output-dir',
      'pdf-single-browse-btn',
      'pdf-single-download-btn',
      
      // Batch download elements
      'pdf-batch-form',
      'pdf-batch-urls-input',
      'pdf-batch-output-dir',
      'pdf-batch-browse-btn',
      'pdf-batch-download-btn',
      'pdf-concurrent-downloads',
      
      // Queue management elements
      'pdf-clear-queue-btn',
      'pdf-cancel-all-btn',
      'pdf-queue-total',
      'pdf-downloading-total',
      'pdf-completed-total',
      'pdf-failed-total',
      
      // Processing options
      'pdf-process-structify',
      'pdf-extract-tables',
      'pdf-use-ocr',
      
      // Legacy elements (for backwards compatibility)
      'pdf-select-all-btn',
      'pdf-select-none-btn',
      'pdf-download-selected-btn',
      'selected-pdfs-count',
      'download-queue-container',
      'download-queue-list',
      'queue-clear-btn',
      'queue-download-all-btn',
      'pdf-download-progress',
      'current-download-status'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.state.elements.set(id, element);
      }
    });
  }

  /**
   * Setup event handlers for PDF downloader functionality
   */
  setupEventHandlers() {
    // Single PDF download form
    const singleForm = this.state.elements.get('pdf-single-form');
    if (singleForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleSingleDownload();
      };
      singleForm.addEventListener('submit', submitHandler);
      this.state.eventListeners.add(() => singleForm.removeEventListener('submit', submitHandler));
    }

    // Single PDF download button
    const singleDownloadBtn = this.state.elements.get('pdf-single-download-btn');
    if (singleDownloadBtn) {
      const clickHandler = (e) => {
        e.preventDefault();
        this.handleSingleDownload();
      };
      singleDownloadBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => singleDownloadBtn.removeEventListener('click', clickHandler));
    }

    // Batch PDF download form
    const batchForm = this.state.elements.get('pdf-batch-form');
    if (batchForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleBatchDownload();
      };
      batchForm.addEventListener('submit', submitHandler);
      this.state.eventListeners.add(() => batchForm.removeEventListener('submit', submitHandler));
    }

    // Batch PDF download button
    const batchDownloadBtn = this.state.elements.get('pdf-batch-download-btn');
    if (batchDownloadBtn) {
      const clickHandler = (e) => {
        e.preventDefault();
        this.handleBatchDownload();
      };
      batchDownloadBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => batchDownloadBtn.removeEventListener('click', clickHandler));
    }

    // Browse buttons
    const singleBrowseBtn = this.state.elements.get('pdf-single-browse-btn');
    if (singleBrowseBtn) {
      const clickHandler = () => this.browseDirectory('single');
      singleBrowseBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => singleBrowseBtn.removeEventListener('click', clickHandler));
    }

    const batchBrowseBtn = this.state.elements.get('pdf-batch-browse-btn');
    if (batchBrowseBtn) {
      const clickHandler = () => this.browseDirectory('batch');
      batchBrowseBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => batchBrowseBtn.removeEventListener('click', clickHandler));
    }

    // Clear queue button
    const clearQueueBtn = this.state.elements.get('pdf-clear-queue-btn');
    if (clearQueueBtn) {
      const clickHandler = () => this.clearDownloadQueue();
      clearQueueBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => clearQueueBtn.removeEventListener('click', clickHandler));
    }

    // Cancel all button
    const cancelAllBtn = this.state.elements.get('pdf-cancel-all-btn');
    if (cancelAllBtn) {
      const clickHandler = () => this.cancelAllDownloads();
      cancelAllBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => cancelAllBtn.removeEventListener('click', clickHandler));
    }

    // Academic search button
    const searchBtn = this.state.elements.get('academic-search-btn');
    if (searchBtn) {
      const clickHandler = () => this.startAcademicSearch();
      searchBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => searchBtn.removeEventListener('click', clickHandler));
    }

    // Legacy PDF selection buttons (for backwards compatibility)
    const selectAllBtn = this.state.elements.get('pdf-select-all-btn');
    if (selectAllBtn) {
      const clickHandler = () => this.selectAllPdfs();
      selectAllBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => selectAllBtn.removeEventListener('click', clickHandler));
    }

    const selectNoneBtn = this.state.elements.get('pdf-select-none-btn');
    if (selectNoneBtn) {
      const clickHandler = () => this.selectNonePdfs();
      selectNoneBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => selectNoneBtn.removeEventListener('click', clickHandler));
    }

    const downloadSelectedBtn = this.state.elements.get('pdf-download-selected-btn');
    if (downloadSelectedBtn) {
      const clickHandler = () => this.downloadSelectedPdfs();
      downloadSelectedBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => downloadSelectedBtn.removeEventListener('click', clickHandler));
    }
  }

  /**
   * Setup Socket.IO event listeners
   */
  setupSocketListeners() {
    if (!window.socket) {
      console.warn('Socket.IO not available, real-time updates will be limited');
      return;
    }

    console.log('📡 Setting up PDF Downloader SocketIO listeners...');

    // Task progress events using centralized config
    const progressHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleDownloadProgress(data);
      }
    };
    window.socket.on(TASK_EVENTS.PROGRESS, progressHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.PROGRESS, progressHandler));

    // Task completion events
    const completedHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskCompleted(data);
      }
    };
    window.socket.on(TASK_EVENTS.COMPLETED, completedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.COMPLETED, completedHandler));

    // Task error events
    const errorHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskError(data);
      }
    };
    window.socket.on(TASK_EVENTS.ERROR, errorHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.ERROR, errorHandler));

    // Task cancelled events
    const cancelledHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskCancelled(data);
      }
    };
    window.socket.on(TASK_EVENTS.CANCELLED, cancelledHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.CANCELLED, cancelledHandler));

    // PDF-specific events
    const pdfProgressHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfDownloadProgress(data);
      }
    };
    window.socket.on('pdf_download_progress', pdfProgressHandler);
    this.state.socketListeners.add(() => window.socket.off('pdf_download_progress', pdfProgressHandler));

    console.log('✅ PDF Downloader SocketIO listeners configured');
  }

  /**
   * Start academic search
   */
  async startAcademicSearch() {
    try {
      const queryInput = this.state.elements.get('academic-search-input');
      const sourcesSelect = this.state.elements.get('academic-sources-select');
      const maxResultsInput = this.state.elements.get('academic-max-results');

      if (!queryInput?.value.trim()) {
        this.showError('Please enter a search query');
        return;
      }

      const query = queryInput.value.trim();
      const sources = this.getSelectedSources(sourcesSelect);
      const maxResults = parseInt(maxResultsInput?.value) || this.config.maxResultsPerSource;

      this.state.processingState = 'searching';
      this.updateUI();

      // Clear previous results
      this.clearSearchResults();

      // Start academic search using centralized config
      const response = await fetch(ACADEMIC_CONFIG.endpoints.SEARCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify({
          query,
          sources,
          max_results: maxResults
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Store search information
      this.state.currentSearch = {
        id: data.search_id,
        query,
        sources,
        maxResults,
        startTime: Date.now()
      };

      console.log(`📚 Academic search started: ${data.search_id}`);
      this.showInfo(`Searching for: "${query}" across ${sources.length} source(s)`);

    } catch (error) {
      console.error('❌ Failed to start academic search:', error);
      this.showError(`Search failed: ${error.message}`);
      this.state.processingState = 'idle';
      this.updateUI();
    }
  }

  /**
   * Handle PDF download progress events
   */
  handlePdfDownloadProgress(data) {
    console.log('📄 PDF download progress:', data);
    
    if (data.task_id && this.state.downloadQueue.has(data.task_id)) {
      const download = this.state.downloadQueue.get(data.task_id);
      download.progress = data.progress || 0;
      download.message = data.message || 'Downloading...';
      
      this.updateQueueUI();
      this.showInfo(`${data.message || 'Download progress'}: ${data.progress || 0}%`);
    }
  }

  /**
   * Handle task completion events - Enhanced to match fileProcessor spec
   */
  handleTaskCompleted(data) {
    try {
      console.log('✅ Enhanced PDF download completion started:', data);
      
      // Validate completion data
      if (!this.validateTaskCompletion(data)) {
        return;
      }
      
      // Update download queue status
      if (data.task_id && this.state.downloadQueue.has(data.task_id)) {
        const download = this.state.downloadQueue.get(data.task_id);
        download.status = 'completed';
        download.progress = 100;
        download.file_path = data.file_path;
        download.completedTime = Date.now();
        download.fileSize = data.file_size || 0;
        download.downloadSpeed = data.download_speed || 'N/A';
      }
      
      // Update processing state
      this.state.processingState = 'completed';
      
      // Enhanced cleanup
      this.performEnhancedCleanup();
      
      // Update completion UI
      this.updateCompletionUI(data);
      
      // Trigger completion notifications
      this.triggerCompletionNotifications(data);
      
      // Display enhanced results with stats screen (like fileProcessor)
      this.displayEnhancedResults(data);
      
    } catch (error) {
      console.error('❌ Error in enhanced PDF download completion:', error);
      this.performFallbackCompletion(data);
    }
  }

  /**
   * Validate task completion data
   */
  validateTaskCompletion(data) {
    if (!data) {
      console.warn('❌ No PDF completion data provided');
      return false;
    }
    
    if (!data.task_id) {
      console.warn('❌ No task ID in completion data');
      return false;
    }
    
    return true;
  }

  /**
   * Enhanced cleanup after task completion
   */
  performEnhancedCleanup() {
    // Clear active downloads
    this.state.activeDownloads.clear();
    
    // Update queue UI
    this.updateQueueUI();
    
    // Clear any progress intervals
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Update completion UI
   */
  updateCompletionUI(data) {
    // Re-enable form submissions
    const singleForm = this.state.elements.get('single-pdf-form');
    const batchForm = this.state.elements.get('batch-pdf-form');
    
    if (singleForm) {
      const submitBtn = singleForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Download PDF';
      }
    }
    
    if (batchForm) {
      const submitBtn = batchForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Download Selected PDFs';
      }
    }
  }

  /**
   * Trigger completion notifications
   */
  triggerCompletionNotifications(data) {
    // Count totals for comprehensive notification
    let totalCompleted = 0, totalFailed = 0, totalSize = 0;
    this.state.downloadQueue.forEach(download => {
      if (download.status === 'completed') {
        totalCompleted++;
        totalSize += download.fileSize || 0;
      }
      if (download.status === 'failed') totalFailed++;
    });
    
    const message = `PDF downloads completed! ${totalCompleted} successful, ${totalFailed} failed. Total size: ${this.formatFileSize(totalSize)}`;
    this.showSuccess(message);
  }

  /**
   * Display enhanced results with comprehensive stats (like fileProcessor)
   */
  displayEnhancedResults(data) {
    // Prepare comprehensive download statistics
    const enhancedData = this.prepareEnhancedStats(data);
    
    // Show result UI with enhanced delay for better UX
    setTimeout(() => {
      this.showEnhancedResult(enhancedData);
    }, 600);
  }

  /**
   * Prepare enhanced statistics
   */
  prepareEnhancedStats(data) {
    let totalCompleted = 0, totalFailed = 0, totalSize = 0, totalDuration = 0;
    const completedDownloads = [];
    const failedDownloads = [];
    
    this.state.downloadQueue.forEach(download => {
      if (download.status === 'completed') {
        totalCompleted++;
        totalSize += download.fileSize || 0;
        if (download.startTime && download.completedTime) {
          totalDuration += (download.completedTime - download.startTime);
        }
        completedDownloads.push(download);
      }
      if (download.status === 'failed') {
        totalFailed++;
        failedDownloads.push(download);
      }
    });
    
    const avgDuration = totalCompleted > 0 ? totalDuration / totalCompleted : 0;
    const successRate = totalCompleted + totalFailed > 0 ? (totalCompleted / (totalCompleted + totalFailed)) * 100 : 100;
    const avgFileSize = totalCompleted > 0 ? totalSize / totalCompleted : 0;
    
    return {
      task_id: data.task_id,
      total_downloads: totalCompleted + totalFailed,
      completed_downloads: totalCompleted,
      failed_downloads: totalFailed,
      total_size: totalSize,
      avg_duration: avgDuration,
      success_rate: successRate,
      avg_file_size: avgFileSize,
      completedTime: Date.now(),
      completed_files: completedDownloads,
      failed_files: failedDownloads,
      output_directory: data.output_directory || 'Downloads folder'
    };
  }

  /**
   * Show enhanced result with container transitions (like fileProcessor)
   */
  showEnhancedResult(data) {
    // Find or create result container
    let resultContainer = this.state.elements.get('pdf-result-container');
    if (!resultContainer) {
      resultContainer = this.createResultContainer();
    }
    
    // Transition to result container
    this.transitionToContainer(resultContainer);
    
    // Update result content with comprehensive stats
    this.updateEnhancedResultStats(resultContainer, data);
    
    // Show success notification
    this.showSuccess('PDF downloads completed successfully!');
  }

  /**
   * Create result container if it doesn't exist
   */
  createResultContainer() {
    // Look for existing download queue container to insert result container after
    const queueContainer = this.state.elements.get('pdf-queue-container') || 
                          document.getElementById('pdf-queue-container') ||
                          document.querySelector('.pdf-queue-container');
    
    let resultContainer = document.getElementById('pdf-result-container');
    if (!resultContainer) {
      resultContainer = document.createElement('div');
      resultContainer.id = 'pdf-result-container';
      resultContainer.className = 'container-fluid mt-3';
      resultContainer.style.display = 'none';
      
      // Insert after queue container or at end of body
      if (queueContainer && queueContainer.parentNode) {
        queueContainer.parentNode.insertBefore(resultContainer, queueContainer.nextSibling);
      } else {
        document.body.appendChild(resultContainer);
      }
      
      this.state.elements.set('pdf-result-container', resultContainer);
    }
    
    return resultContainer;
  }

  /**
   * Transition to container (like fileProcessor)
   */
  transitionToContainer(targetContainer) {
    // Hide queue container if it exists
    const queueContainer = this.state.elements.get('pdf-queue-container');
    if (queueContainer) {
      queueContainer.style.display = 'none';
    }
    
    // Show target container with smooth transition
    if (targetContainer) {
      targetContainer.style.display = 'block';
      targetContainer.style.opacity = '0';
      targetContainer.style.transition = 'opacity 0.3s ease-in-out';
      
      setTimeout(() => {
        targetContainer.style.opacity = '1';
      }, 50);
    }
  }

  /**
   * Update result stats with comprehensive display (enhanced like fileProcessor)
   */
  updateEnhancedResultStats(resultContainer, data) {
    if (!resultContainer) return;
    
    const avgDurationSeconds = Math.round(data.avg_duration / 1000);
    const avgDownloadSpeed = data.avg_duration > 0 ? Math.round(data.avg_file_size / (data.avg_duration / 1000)) : 0;
    
    const resultHTML = `
      <div class="card shadow-sm">
        <div class="card-header bg-success text-white">
          <h5 class="mb-0">
            <i class="fas fa-check-circle me-2"></i>
            PDF Downloads Completed Successfully
          </h5>
        </div>
        <div class="card-body">
          <!-- Summary Stats -->
          <div class="row mb-4">
            <div class="col-md-3">
              <div class="stat-card text-center p-3 border rounded">
                <div class="stat-value text-primary" style="font-size: 2.5rem; font-weight: bold;">${data.completed_downloads}</div>
                <div class="stat-label text-muted">PDFs Downloaded</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="stat-card text-center p-3 border rounded">
                <div class="stat-value text-info" style="font-size: 2.5rem; font-weight: bold;">${this.formatFileSize(data.total_size)}</div>
                <div class="stat-label text-muted">Total Size</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="stat-card text-center p-3 border rounded">
                <div class="stat-value text-warning" style="font-size: 2.5rem; font-weight: bold;">${Math.round(data.success_rate)}%</div>
                <div class="stat-label text-muted">Success Rate</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="stat-card text-center p-3 border rounded">
                <div class="stat-value text-success" style="font-size: 2.5rem; font-weight: bold;">${data.failed_downloads}</div>
                <div class="stat-label text-muted">Failed Downloads</div>
              </div>
            </div>
          </div>

          <!-- Performance Metrics -->
          <div class="row mb-4">
            <div class="col-md-4">
              <div class="metric-item">
                <strong><i class="fas fa-clock me-2"></i>Avg Duration:</strong>
                <span class="ms-2">${avgDurationSeconds}s per file</span>
              </div>
            </div>
            <div class="col-md-4">
              <div class="metric-item">
                <strong><i class="fas fa-tachometer-alt me-2"></i>Avg Speed:</strong>
                <span class="ms-2">${this.formatFileSize(avgDownloadSpeed)}/s</span>
              </div>
            </div>
            <div class="col-md-4">
              <div class="metric-item">
                <strong><i class="fas fa-file-pdf me-2"></i>Avg File Size:</strong>
                <span class="ms-2">${this.formatFileSize(data.avg_file_size)}</span>
              </div>
            </div>
          </div>

          <!-- Output Information -->
          <div class="output-section mb-4">
            <h6><i class="fas fa-folder me-2"></i>Download Location</h6>
            <div class="d-flex align-items-center">
              <code class="me-3">${data.output_directory}</code>
              <div class="btn-group" role="group">
                <button class="btn btn-sm btn-outline-primary" onclick="openFolder('${data.output_directory}')">
                  <i class="fas fa-folder-open me-1"></i>Open Folder
                </button>
              </div>
            </div>
          </div>

          <!-- Downloaded Files List -->
          ${data.completed_files.length > 0 ? `
          <div class="files-section mb-4">
            <h6><i class="fas fa-file-pdf me-2"></i>Downloaded Files (${data.completed_files.length})</h6>
            <div class="files-list" style="max-height: 300px; overflow-y: auto;">
              ${data.completed_files.map(file => `
                <div class="file-item d-flex justify-content-between align-items-center p-2 border-bottom">
                  <div>
                    <strong>${file.title || file.filename || 'Untitled'}</strong>
                    <small class="text-muted d-block">${this.formatFileSize(file.fileSize || 0)} • ${file.downloadSpeed || 'N/A'}</small>
                  </div>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary btn-sm" onclick="openFile('${file.file_path}')">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="downloadFile('${file.file_path}')">
                      <i class="fas fa-download"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Failed Downloads -->
          ${data.failed_files.length > 0 ? `
          <div class="failed-section mb-4">
            <h6><i class="fas fa-exclamation-triangle me-2 text-warning"></i>Failed Downloads (${data.failed_files.length})</h6>
            <div class="failed-list">
              ${data.failed_files.map(file => `
                <div class="failed-item p-2 border-bottom">
                  <strong>${file.title || file.url || 'Unknown'}</strong>
                  <small class="text-muted d-block">${file.error || 'Download failed'}</small>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Additional Details -->
          <div class="details-section">
            <h6><i class="fas fa-info-circle me-2"></i>Download Summary</h6>
            <div class="row">
              <div class="col-md-6">
                <ul class="list-unstyled">
                  <li><strong>Task ID:</strong> <code>${data.task_id}</code></li>
                  <li><strong>Total Downloads:</strong> ${data.total_downloads}</li>
                  <li><strong>Completion Time:</strong> ${new Date(data.completedTime).toLocaleString()}</li>
                </ul>
              </div>
              <div class="col-md-6">
                <ul class="list-unstyled">
                  <li><strong>Success Rate:</strong> ${Math.round(data.success_rate)}%</li>
                  <li><strong>Total Data:</strong> ${this.formatFileSize(data.total_size)}</li>
                  <li><strong>Average File Size:</strong> ${this.formatFileSize(data.avg_file_size)}</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Quick Stats Display -->
          <div class="d-flex justify-content-between text-muted small mt-3 pt-3 border-top">
            <span><i class="fas fa-file-pdf me-1"></i>${data.completed_downloads} PDFs downloaded</span>
            <span><i class="fas fa-hdd me-1"></i>${this.formatFileSize(data.total_size)} total size</span>
            <span><i class="fas fa-check-circle me-1"></i>${Math.round(data.success_rate)}% success rate</span>
          </div>
        </div>
      </div>
    `;
    
    resultContainer.innerHTML = resultHTML;
  }

  /**
   * Fallback completion handler
   */
  performFallbackCompletion(data) {
    console.warn('Using fallback PDF completion handler');
    
    // Update download queue status (basic)
    if (data.task_id && this.state.downloadQueue.has(data.task_id)) {
      const download = this.state.downloadQueue.get(data.task_id);
      download.status = 'completed';
      download.progress = 100;
      download.file_path = data.file_path;
    }
    
    this.updateQueueUI();
    this.showSuccess(`Download completed: ${data.file_path || 'PDF downloaded successfully'}`);
  }

  /**
   * Handle task error events
   */
  handleTaskError(data) {
    console.error('❌ Task error:', data);
    
    if (data.task_id && this.state.downloadQueue.has(data.task_id)) {
      const download = this.state.downloadQueue.get(data.task_id);
      download.status = 'failed';
      download.error = data.error || 'Download failed';
      
      this.updateQueueUI();
      this.showError(`Download failed: ${data.error || 'Unknown error'}`);
    }
  }

  /**
   * Handle task cancellation events
   */
  handleTaskCancelled(data) {
    console.log('🚫 Task cancelled:', data);
    
    if (data.task_id && this.state.downloadQueue.has(data.task_id)) {
      const download = this.state.downloadQueue.get(data.task_id);
      download.status = 'cancelled';
      
      this.updateQueueUI();
      this.showInfo(`Download cancelled: ${data.task_id}`);
    }
  }

  /**
   * Handle paper found event from backend (for academic search)
   */
  handlePaperFound(data) {
    const paper = data.paper;
    this.state.searchResults.set(paper.id, paper);
    this.addPaperToResults(paper);
  }

  /**
   * Handle search completion
   */
  handleSearchComplete(data) {
    this.state.processingState = 'idle';
    this.updateUI();
    
    const resultCount = this.state.searchResults.size;
    this.showInfo(`Search complete! Found ${resultCount} papers.`);
  }

  /**
   * Add paper to results display
   */
  addPaperToResults(paper) {
    const resultsList = this.state.elements.get('academic-results-list');
    if (!resultsList) return;

    const paperElement = this.createPaperElement(paper);
    resultsList.appendChild(paperElement);
    
    // Show results container if hidden
    const resultsContainer = this.state.elements.get('academic-results-container');
    if (resultsContainer) {
      resultsContainer.style.display = 'block';
    }
  }

  /**
   * Create HTML element for a paper
   */
  createPaperElement(paper) {
    const div = document.createElement('div');
    div.className = 'card mb-3 paper-result';
    div.dataset.paperId = paper.id;
    
    div.innerHTML = `
      <div class="card-body">
        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" id="paper-${paper.id}" data-paper-id="${paper.id}">
          <label class="form-check-label fw-bold" for="paper-${paper.id}">
            ${this.escapeHtml(paper.title)}
          </label>
        </div>
        <p class="text-muted mb-2">
          <small>
            <i class="fas fa-users me-1"></i>${this.escapeHtml(paper.authors?.join(', ') || 'Unknown authors')}
          </small>
        </p>
        <p class="mb-2">${this.escapeHtml(paper.abstract?.substring(0, 200) || 'No abstract available')}...</p>
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="badge bg-primary me-1">${this.escapeHtml(paper.source || 'Unknown')}</span>
            ${paper.year ? `<span class="badge bg-secondary">${paper.year}</span>` : ''}
          </div>
          <div>
            ${paper.pdf_url ? `<button class="btn btn-sm btn-outline-success me-1" onclick="window.NeuroGen.modules.pdfDownloader.downloadSinglePdf('${paper.id}')">
              <i class="fas fa-download me-1"></i>Download PDF
            </button>` : ''}
            ${paper.url ? `<a href="${paper.url}" target="_blank" class="btn btn-sm btn-outline-primary">
              <i class="fas fa-external-link-alt me-1"></i>View Paper
            </a>` : ''}
          </div>
        </div>
      </div>
    `;

    // Add change handler for checkbox
    const checkbox = div.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.state.selectedPdfs.add(paper.id);
      } else {
        this.state.selectedPdfs.delete(paper.id);
      }
      this.updateSelectionUI();
    });

    return div;
  }

  /**
   * Select all papers
   */
  selectAllPdfs() {
    const checkboxes = document.querySelectorAll('.paper-result input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      this.state.selectedPdfs.add(checkbox.dataset.paperId);
    });
    this.updateSelectionUI();
  }

  /**
   * Deselect all papers
   */
  selectNonePdfs() {
    const checkboxes = document.querySelectorAll('.paper-result input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    this.state.selectedPdfs.clear();
    this.updateSelectionUI();
  }

  /**
   * Download selected PDFs
   */
  async downloadSelectedPdfs() {
    if (this.state.selectedPdfs.size === 0) {
      this.showError('Please select at least one PDF to download');
      return;
    }

    const selectedPapers = Array.from(this.state.selectedPdfs).map(id => 
      this.state.searchResults.get(id)
    ).filter(paper => paper && paper.pdf_url);

    if (selectedPapers.length === 0) {
      this.showError('No downloadable PDFs found in selection');
      return;
    }

    this.showInfo(`Starting download of ${selectedPapers.length} PDFs...`);

    // Add to download queue and start downloads
    for (const paper of selectedPapers) {
      this.addToDownloadQueue(paper);
    }
    
    this.processDownloadQueue();
  }

  /**
   * Download a single PDF
   */
  async downloadSinglePdf(paperId) {
    const paper = this.state.searchResults.get(paperId);
    if (!paper || !paper.pdf_url) {
      this.showError('PDF not available for download');
      return;
    }

    this.addToDownloadQueue(paper);
    this.processDownloadQueue();
  }

  /**
   * Add paper to download queue
   */
  addToDownloadQueue(paper) {
    this.state.downloadQueue.set(paper.id, {
      ...paper,
      status: 'queued',
      addedTime: Date.now()
    });
    this.updateQueueUI();
  }

  /**
   * Process download queue
   */
  async processDownloadQueue() {
    const queuedItems = Array.from(this.state.downloadQueue.values())
      .filter(item => item.status === 'queued');

    if (queuedItems.length === 0) return;

    // Process downloads with concurrency limit
    const activeCount = this.state.activeDownloads.size;
    const available = this.config.downloadConcurrency - activeCount;
    const toProcess = queuedItems.slice(0, available);

    for (const item of toProcess) {
      this.startPdfDownload(item);
    }
  }

  /**
   * Start individual PDF download
   */
  async startPdfDownload(paper) {
    try {
      // Mark as downloading
      paper.status = 'downloading';
      this.state.activeDownloads.set(paper.id, paper);
      this.updateQueueUI();

      const response = await fetch(PDF_DOWNLOADER_CONFIG.endpoints.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify({
          url: paper.pdf_url,
          filename: this.sanitizeFilename(`${paper.title}.pdf`),
          paper_info: {
            id: paper.id,
            title: paper.title,
            authors: paper.authors,
            source: paper.source
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Update status
      paper.status = 'completed';
      paper.task_id = data.task_id;
      
    } catch (error) {
      console.error(`❌ Failed to download PDF ${paper.title}:`, error);
      paper.status = 'failed';
      paper.error = error.message;
    } finally {
      this.state.activeDownloads.delete(paper.id);
      this.updateQueueUI();
      
      // Process next items in queue
      setTimeout(() => this.processDownloadQueue(), 100);
    }
  }

  /**
   * Handle single PDF download
   */
  async handleSingleDownload() {
    try {
      console.log('🔍 Starting single PDF download...');
      
      const urlInput = this.state.elements.get('pdf-single-url-input');
      const filenameInput = this.state.elements.get('pdf-single-filename');
      const outputDirInput = this.state.elements.get('pdf-single-output-dir');
      
      if (!urlInput?.value?.trim()) {
        this.showError('Please enter a PDF URL');
        return;
      }
      
      const url = urlInput.value.trim();
      const customFilename = filenameInput?.value?.trim();
      const outputDir = outputDirInput?.value?.trim();
      
      // Get processing options
      const processStructify = this.state.elements.get('pdf-process-structify')?.checked || false;
      const extractTables = this.state.elements.get('pdf-extract-tables')?.checked || false;
      const useOcr = this.state.elements.get('pdf-use-ocr')?.checked || false;
      
      // Prepare request data
      const requestData = {
        url: url,
        output_folder: outputDir || undefined,
        options: {
          process_with_structify: processStructify,
          extract_tables: extractTables,
          use_ocr: useOcr
        }
      };
      
      if (customFilename) {
        requestData.filename = customFilename;
      }
      
      // Call PDF download API using centralized config
      const response = await fetch(PDF_DOWNLOADER_CONFIG.endpoints.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      this.showSuccess(`PDF download started: ${data.task_id}`);
      this.updateQueueUI();
      
      // Clear form
      urlInput.value = '';
      if (filenameInput) filenameInput.value = '';
      
    } catch (error) {
      console.error('❌ Single PDF download failed:', error);
      this.showError(`Download failed: ${error.message}`);
    }
  }

  /**
   * Handle batch PDF download
   */
  async handleBatchDownload() {
    try {
      console.log('🔍 Starting batch PDF download...');
      
      const urlsInput = this.state.elements.get('pdf-batch-urls-input');
      const outputDirInput = this.state.elements.get('pdf-batch-output-dir');
      const concurrentSelect = this.state.elements.get('pdf-concurrent-downloads');
      
      if (!urlsInput?.value?.trim()) {
        this.showError('Please enter PDF URLs (one per line)');
        return;
      }
      
      // Parse URLs
      const urls = urlsInput.value.trim()
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);
      
      if (urls.length === 0) {
        this.showError('No valid URLs found');
        return;
      }
      
      const outputDir = outputDirInput?.value?.trim();
      const concurrentDownloads = parseInt(concurrentSelect?.value || '3');
      
      // Get processing options
      const processStructify = this.state.elements.get('pdf-process-structify')?.checked || false;
      const extractTables = this.state.elements.get('pdf-extract-tables')?.checked || false;
      const useOcr = this.state.elements.get('pdf-use-ocr')?.checked || false;
      
      // Prepare request data
      const requestData = {
        urls: urls,
        output_folder: outputDir || undefined,
        options: {
          concurrent_downloads: concurrentDownloads,
          process_with_structify: processStructify,
          extract_tables: extractTables,
          use_ocr: useOcr
        }
      };
      
      // Call batch PDF download API using centralized config
      const response = await fetch(PDF_DOWNLOADER_CONFIG.endpoints.BATCH_DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      this.showSuccess(`Batch download started: ${urls.length} PDFs queued (Task: ${data.task_id})`);
      this.updateQueueUI();
      
      // Clear form
      urlsInput.value = '';
      
    } catch (error) {
      console.error('❌ Batch PDF download failed:', error);
      this.showError(`Batch download failed: ${error.message}`);
    }
  }

  /**
   * Browse for directory
   */
  async browseDirectory(type) {
    try {
      // Use file input dialog for directory selection
      const dirInput = document.createElement('input');
      dirInput.type = 'file';
      dirInput.webkitdirectory = true;
      dirInput.style.display = 'none';
      
      dirInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const path = e.target.files[0].webkitRelativePath;
          const dirPath = path.substring(0, path.lastIndexOf('/'));
          
          if (type === 'single') {
            const outputDirInput = this.state.elements.get('pdf-single-output-dir');
            if (outputDirInput) outputDirInput.value = dirPath;
          } else if (type === 'batch') {
            const outputDirInput = this.state.elements.get('pdf-batch-output-dir');
            if (outputDirInput) outputDirInput.value = dirPath;
          }
        }
      });
      
      document.body.appendChild(dirInput);
      dirInput.click();
      document.body.removeChild(dirInput);
      
    } catch (error) {
      console.error('❌ Directory browse failed:', error);
      this.showError('Directory selection failed');
    }
  }

  /**
   * Clear download queue
   */
  clearDownloadQueue() {
    this.state.downloadQueue.clear();
    this.state.selectedPdfs.clear();
    this.updateQueueUI();
    this.showSuccess('Download queue cleared');
  }

  /**
   * Cancel all downloads
   */
  async cancelAllDownloads() {
    try {
      const activeIds = Array.from(this.state.activeDownloads.keys());
      
      for (const id of activeIds) {
        const download = this.state.activeDownloads.get(id);
        if (download?.task_id) {
          // Use centralized config for cancel endpoint
          const cancelUrl = PDF_DOWNLOADER_CONFIG.endpoints.CANCEL.replace(':taskId', download.task_id);
          await fetch(cancelUrl, {
            method: 'POST',
            headers: { 'X-API-Key': localStorage.getItem('api_key') || '' }
          });
        }
      }
      
      this.state.activeDownloads.clear();
      this.updateQueueUI();
      this.showSuccess('All downloads cancelled');
      
    } catch (error) {
      console.error('❌ Cancel all failed:', error);
      this.showError('Failed to cancel all downloads');
    }
  }

  /**
   * Show success message with enhanced notification system
   */
  showSuccess(message) {
    console.log('✅ PDF Downloader Success:', message);
    
    // Use multiple notification methods for better user experience
    if (window.NeuroGen?.modules?.progressHandler?.showSuccess) {
      window.NeuroGen.modules.progressHandler.showSuccess(message);
    }
    
    // Use UI module if available
    if (window.NeuroGen?.modules?.ui?.showToast) {
      window.NeuroGen.modules.ui.showToast('PDF Download', message, 'success');
    }
    
    // Emit custom event for other modules
    if (window.NeuroGen?.modules?.eventManager?.emit) {
      window.NeuroGen.modules.eventManager.emit('pdf.download.success', { message });
    }
  }

  /**
   * Show error message with enhanced notification system
   */
  showError(message) {
    console.error('❌ PDF Downloader Error:', message);
    
    // Use multiple notification methods for better user experience
    if (window.NeuroGen?.modules?.progressHandler?.showError) {
      window.NeuroGen.modules.progressHandler.showError(message);
    }
    
    // Use UI module if available
    if (window.NeuroGen?.modules?.ui?.showToast) {
      window.NeuroGen.modules.ui.showToast('PDF Download Error', message, 'error');
    }
    
    // Emit custom event for other modules
    if (window.NeuroGen?.modules?.eventManager?.emit) {
      window.NeuroGen.modules.eventManager.emit('pdf.download.error', { message });
    }
  }

  /**
   * Show info message with enhanced notification system
   */
  showInfo(message) {
    console.log('ℹ️ PDF Downloader Info:', message);
    
    // Use multiple notification methods
    if (window.NeuroGen?.modules?.ui?.showToast) {
      window.NeuroGen.modules.ui.showToast('PDF Download', message, 'info');
    }
    
    // Emit custom event for other modules
    if (window.NeuroGen?.modules?.eventManager?.emit) {
      window.NeuroGen.modules.eventManager.emit('pdf.download.info', { message });
    }
  }

  /**
   * Update queue UI displays
   */
  updateQueueUI() {
    // Update counters
    const queueTotal = this.state.elements.get('pdf-queue-total');
    const downloadingTotal = this.state.elements.get('pdf-downloading-total');
    const completedTotal = this.state.elements.get('pdf-completed-total');
    const failedTotal = this.state.elements.get('pdf-failed-total');
    
    if (queueTotal) queueTotal.textContent = this.state.downloadQueue.size;
    if (downloadingTotal) downloadingTotal.textContent = this.state.activeDownloads.size;
    
    // Count completed and failed from download queue
    let completed = 0, failed = 0;
    this.state.downloadQueue.forEach(item => {
      if (item.status === 'completed') completed++;
      if (item.status === 'failed') failed++;
    });
    
    if (completedTotal) completedTotal.textContent = completed;
    if (failedTotal) failedTotal.textContent = failed;
  }

  /**
   * Utility functions
   */
  getSelectedSources(sourcesSelect) {
    if (!sourcesSelect) return this.config.defaultSources;
    
    const selected = Array.from(sourcesSelect.selectedOptions).map(option => option.value);
    return selected.length > 0 ? selected : this.config.defaultSources;
  }

  clearSearchResults() {
    this.state.searchResults.clear();
    this.state.selectedPdfs.clear();
    
    const resultsList = this.state.elements.get('academic-results-list');
    if (resultsList) {
      resultsList.innerHTML = '';
    }
    
    const resultsContainer = this.state.elements.get('academic-results-container');
    if (resultsContainer) {
      resultsContainer.style.display = 'none';
    }
  }

  clearDownloadQueue() {
    this.state.downloadQueue.clear();
    this.updateQueueUI();
  }

  updateSelectionUI() {
    const countElement = this.state.elements.get('selected-pdfs-count');
    if (countElement) {
      countElement.textContent = this.state.selectedPdfs.size;
    }
  }

  updateQueueUI() {
    // Update download queue display
    const queueList = this.state.elements.get('download-queue-list');
    if (!queueList) return;

    queueList.innerHTML = '';
    
    this.state.downloadQueue.forEach(item => {
      const queueItem = document.createElement('div');
      queueItem.className = `list-group-item d-flex justify-content-between align-items-center`;
      
      let statusBadge = '';
      switch (item.status) {
        case 'queued':
          statusBadge = '<span class="badge bg-secondary">Queued</span>';
          break;
        case 'downloading':
          statusBadge = '<span class="badge bg-primary">Downloading</span>';
          break;
        case 'completed':
          statusBadge = '<span class="badge bg-success">Completed</span>';
          break;
        case 'failed':
          statusBadge = '<span class="badge bg-danger">Failed</span>';
          break;
      }
      
      queueItem.innerHTML = `
        <div>
          <strong>${this.escapeHtml(item.title)}</strong>
          <br><small class="text-muted">${this.escapeHtml(item.authors?.join(', ') || 'Unknown authors')}</small>
        </div>
        ${statusBadge}
      `;
      
      queueList.appendChild(queueItem);
    });
  }

  updateUI() {
    // Update UI based on current state
    const searchBtn = this.state.elements.get('academic-search-btn');
    if (searchBtn) {
      searchBtn.disabled = this.state.processingState === 'searching';
      searchBtn.innerHTML = this.state.processingState === 'searching' 
        ? '<i class="fas fa-spinner fa-spin me-1"></i>Searching...'
        : '<i class="fas fa-search me-1"></i>Search Papers';
    }
  }

  isMySearch(searchId) {
    return this.state.currentSearch && this.state.currentSearch.id === searchId;
  }

  isMyTask(taskId) {
    return Array.from(this.state.downloadQueue.values()).some(item => item.task_id === taskId);
  }

  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    console.error('❌ PDF Downloader Error:', message);
    // You can add UI notification here
  }

  showInfo(message) {
    console.log('ℹ️ PDF Downloader Info:', message);
    
    // Use enhanced notification system
    if (window.NeuroGen?.modules?.ui?.showToast) {
      window.NeuroGen.modules.ui.showToast('PDF Download', message, 'info');
    }
  }

  /**
   * Get health status of the PDF downloader module
   * @returns {Object} - Health status information
   */
  async getHealthStatus() {
    const status = {
      module: 'pdfDownloader',
      initialized: this.state.isInitialized,
      backend_connected: false,
      config_loaded: !!this.config.endpoints,
      socket_connected: !!window.socket?.connected,
      active_downloads: this.state.activeDownloads.size,
      queued_downloads: this.state.downloadQueue.size,
      endpoints: this.config.endpoints,
      version: '2.0.0_optimized'
    };
    
    // Test backend connectivity
    try {
      const response = await fetch(this.config.endpoints.HEALTH, {
        method: 'GET',
        headers: { 'X-API-Key': localStorage.getItem('api_key') || '' },
        timeout: 3000
      });
      status.backend_connected = response.ok;
      if (response.ok) {
        const healthData = await response.json();
        status.backend_info = healthData;
      }
    } catch (error) {
      status.backend_error = error.message;
    }
    
    return status;
  }

  /**
   * Cleanup method
   */
  destroy() {
    // Remove event listeners
    this.state.eventListeners.forEach(removeListener => removeListener());
    this.state.socketListeners.forEach(removeListener => removeListener());
    
    // Clear state
    this.state.searchResults.clear();
    this.state.selectedPdfs.clear();
    this.state.downloadQueue.clear();
    this.state.activeDownloads.clear();
    
    console.log('🧹 PDF Downloader module destroyed');
  }
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
  // Wait for DOM and other modules to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.pdfDownloader = new PDFDownloader();
        window.pdfDownloader.init();
      }, 100);
    });
  } else {
    setTimeout(() => {
      window.pdfDownloader = new PDFDownloader();
      window.pdfDownloader.init();
    }, 100);
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFDownloader;
}