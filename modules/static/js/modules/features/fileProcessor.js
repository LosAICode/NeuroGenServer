/**
 * File Processor Module - Optimized Blueprint Implementation v4.0
 * 
 * Advanced file processing module optimized for the new Blueprint architecture.
 * Features configuration-driven architecture, enhanced error handling, and
 * comprehensive integration with the centralized progress tracking system.
 * 
 * NEW v4.0 Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced 4-method notification system (Toast + Console + System + Error)
 * - Backend connectivity testing with health checks
 * - ES6 module imports with centralized configuration
 * - Optimized for Blueprint architecture integration
 * - Enhanced progressHandler v4.0 integration
 * - Advanced error handling and recovery mechanisms
 * 
 * @module features/fileProcessor
 * @version 4.0.0 - Blueprint Architecture Optimization
 */

// Import dependencies with fallbacks for robustness
let API_ENDPOINTS, BLUEPRINT_ROUTES, CONSTANTS, API_CONFIG, SOCKET_CONFIG, SOCKET_EVENTS, TASK_EVENTS, blueprintApi;

// Initialize imports with fallbacks
async function initializeImports() {
  try {
    const endpointsModule = await import('../config/endpoints.js');
    API_ENDPOINTS = endpointsModule.API_ENDPOINTS;
    BLUEPRINT_ROUTES = endpointsModule.BLUEPRINT_ROUTES;
  } catch (error) {
    console.warn('Failed to import endpoints config, using fallbacks');
    API_ENDPOINTS = {
      FILE_PROCESSOR: {
        PROCESS: '/api/process',
        HEALTH: '/api/health',
        CANCEL: '/api/cancel/:taskId'
      }
    };
    BLUEPRINT_ROUTES = { file_processor: '/api' };
  }

  try {
    const constantsModule = await import('../config/constants.js');
    CONSTANTS = constantsModule.CONSTANTS;
    API_CONFIG = constantsModule.API_CONFIG;
    SOCKET_CONFIG = constantsModule.SOCKET_CONFIG;
  } catch (error) {
    console.warn('Failed to import constants config, using fallbacks');
    CONSTANTS = {
      MAX_FILENAME_LENGTH: 255,
      WINDOWS_INVALID_CHARS: /[<>:"|?*]/,
      WINDOWS_RESERVED_NAMES: ['CON', 'PRN', 'AUX', 'NUL']
    };
    API_CONFIG = { API_TIMEOUT: 30000 };
    SOCKET_CONFIG = {};
  }

  try {
    const socketModule = await import('../config/socketEvents.js');
    SOCKET_EVENTS = socketModule.SOCKET_EVENTS;
    TASK_EVENTS = socketModule.TASK_EVENTS;
  } catch (error) {
    console.warn('Failed to import socket events config, using fallbacks');
    TASK_EVENTS = {
      STARTED: 'task_started',
      PROGRESS: 'progress_update',
      COMPLETED: 'task_completed',
      ERROR: 'task_error'
    };
    SOCKET_EVENTS = {};
  }

  try {
    const apiModule = await import('../services/blueprintApi.js');
    blueprintApi = apiModule.default;
  } catch (error) {
    console.warn('Failed to import blueprint API, using fallback');
    blueprintApi = {
      processFiles: async (inputDir, outputFile, options) => {
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_dir: inputDir,
            output_file: outputFile,
            ...options
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      cancelTask: async (taskId) => {
        const response = await fetch(`/api/cancel/${taskId}`, { method: 'POST' });
        return response.ok;
      },
      verifyPath: async (path) => ({ valid: true })
    };
  }
}

// Configuration shorthand (will be initialized after imports)
let FILE_PROCESSOR_CONFIG = {
  constants: {},
  endpoints: {},
  blueprint: '',
  api: {},
  socket: {}
};

/**
 * File Processor Class - Clean Blueprint Implementation
 */
class FileProcessor {
  constructor() {
    this.state = {
      isInitialized: false,
      currentTask: null,
      processingState: 'idle', // 'idle', 'processing', 'completed', 'error'
      elements: new Map(),
      eventListeners: new Set(),
      socketListeners: new Set(),
      backendConnected: false,
      lastHealthCheck: null
    };
    
    // Initialize config with safe defaults - will be properly set in init()
    this.config = {
      supportedFormats: ['.txt', '.md', '.json', '.xml', '.html', '.csv'],
      maxFileSize: 50 * 1024 * 1024, // 50MB default
      maxBatchSize: 100,
      chunkSize: 1024 * 1024 // 1MB chunks
    };
  }

  /**
   * Enhanced notification system with fallbacks
   * @param {string} message - Notification message
   * @param {string} type - Type of notification (info, success, warning, error)
   * @param {string} title - Notification title
   */
  showNotification(message, type = 'info', title = 'File Processor') {
    // Method 1: Console logging with styling (always works)
    const styles = {
      error: 'color: #dc3545; font-weight: bold;',
      warning: 'color: #fd7e14; font-weight: bold;',
      success: 'color: #198754; font-weight: bold;',
      info: 'color: #0d6efd;'
    };
    console.log(`%c[${title}] ${message}`, styles[type] || styles.info);
    
    // Method 2: Try various toast systems
    if (window.NeuroGen?.ui?.showToast) {
      window.NeuroGen.ui.showToast(title, message, type);
    } else if (window.showToast) {
      window.showToast(title, message, type);
    } else if (window.ui?.showToast) {
      window.ui.showToast(title, message, type);
    }
    
    // Method 3: System notification (if available)
    if (window.NeuroGen?.notificationHandler) {
      window.NeuroGen.notificationHandler.show({
        title, message, type, module: 'fileProcessor'
      });
    }
    
    // Method 4: Error reporting to centralized handler
    if (type === 'error' && window.NeuroGen?.errorHandler) {
      window.NeuroGen.errorHandler.logError({
        module: 'fileProcessor', message, severity: type
      });
    }
    
    // Method 5: Fallback for critical errors
    if (type === 'error' && !window.NeuroGen?.ui?.showToast && !window.showToast) {
      alert(`${title}: ${message}`);
    }
  }

  /**
   * Test backend connectivity for file processor
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
      // Test file processor health endpoint
      const healthResponse = await fetch(FILE_PROCESSOR_CONFIG.endpoints?.HEALTH || '/api/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      results.details.health = {
        status: healthResponse.status,
        ok: healthResponse.ok,
        endpoint: FILE_PROCESSOR_CONFIG.endpoints?.HEALTH || '/api/health'
      };

      if (healthResponse.ok) {
        // Test file processor endpoint
        const testResponse = await fetch(FILE_PROCESSOR_CONFIG.endpoints?.PROCESS || '/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_dir: '/tmp/connectivity_test',
            output_file: 'connectivity_test.json',
            action: 'validate'
          })
        });

        results.details.process = {
          status: testResponse.status,
          ok: testResponse.ok,
          endpoint: FILE_PROCESSOR_CONFIG.endpoints?.PROCESS || '/api/process'
        };

        if (testResponse.ok || testResponse.status === 400) { // 400 is expected for invalid path
          results.overall = true;
          this.state.backendConnected = true;
          this.state.lastHealthCheck = new Date();
          this.showNotification('Backend connectivity verified', 'success', 'File Processor');
        }
      }

      if (!results.overall) {
        throw new Error(`Health endpoint returned ${healthResponse.status}`);
      }

    } catch (error) {
      results.errors.push({
        endpoint: FILE_PROCESSOR_CONFIG.endpoints?.HEALTH || '/api/health',
        error: error.message
      });
      this.state.backendConnected = false;
      this.showNotification(`Backend connectivity failed: ${error.message}`, 'error', 'File Processor');
    }

    return results;
  }

  /**
   * Get file processor health status
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    return {
      module: 'fileProcessor',
      version: '4.0.0',
      status: this.state.isInitialized ? 'healthy' : 'initializing',
      features: {
        configurationDriven: true,
        enhancedNotifications: true,
        backendConnectivity: true,
        fileProcessing: true,
        progressTracking: true
      },
      configuration: {
        endpoints: FILE_PROCESSOR_CONFIG.endpoints,
        supportedFormats: this.config.supportedFormats?.length || 0,
        maxFileSize: this.config.maxFileSize,
        maxBatchSize: this.config.maxBatchSize
      },
      state: {
        initialized: this.state.isInitialized,
        currentTask: this.state.currentTask,
        processingState: this.state.processingState,
        backendConnected: this.state.backendConnected,
        lastHealthCheck: this.state.lastHealthCheck
      }
    };
  }

  /**
   * Initialize the File Processor module with enhanced Blueprint architecture integration
   */
  async init() {
    if (this.state.isInitialized) return;
    
    try {
      console.log('📁 Initializing File Processor v4.0...');
      
      // Initialize imports with fallbacks first
      await initializeImports();
      
      // Initialize configuration after imports
      FILE_PROCESSOR_CONFIG = {
        endpoints: API_ENDPOINTS?.FILE_PROCESSING || {
          PROCESS: '/api/process',
          HEALTH: '/api/health',
          CANCEL: '/api/cancel/:taskId'
        },
        blueprint: BLUEPRINT_ROUTES?.file_processor || '/api',
        constants: CONSTANTS?.FILE_PROCESSOR || CONSTANTS || {},
        api: API_CONFIG || { API_TIMEOUT: 30000 },
        socket: SOCKET_CONFIG || {}
      };
      
      // Update config with actual values after imports
      this.config = {
        supportedFormats: FILE_PROCESSOR_CONFIG.constants.ALLOWED_EXTENSIONS || CONSTANTS?.ALLOWED_EXTENSIONS || this.config.supportedFormats,
        maxFileSize: FILE_PROCESSOR_CONFIG.constants.MAX_FILE_SIZE || CONSTANTS?.MAX_FILE_SIZE || this.config.maxFileSize,
        maxBatchSize: FILE_PROCESSOR_CONFIG.constants.MAX_BATCH_SIZE || CONSTANTS?.MAX_BATCH_SIZE || this.config.maxBatchSize,
        chunkSize: FILE_PROCESSOR_CONFIG.constants.CHUNK_SIZE || CONSTANTS?.CHUNK_SIZE || this.config.chunkSize
      };
      
      this.showNotification('Initializing File Processor v4.0', 'info', 'File Processor');
      
      // Cache DOM elements first
      this.cacheElements();
      
      // Setup event handlers (most critical for preventing page refresh)
      this.setupEventHandlers();
      
      // Setup other components
      this.setupSocketHandlers();
      this.setupFormValidation();
      
      // Test backend connectivity last (non-critical)
      try {
        await this.testBackendConnectivity();
      } catch (error) {
        console.warn('Backend connectivity test failed, but continuing:', error);
      }
      
      this.state.isInitialized = true;
      this.showNotification('File Processor v4.0 initialized successfully', 'success', 'File Processor');
      console.log('✅ File Processor v4.0 initialized successfully');
      
    } catch (error) {
      console.error('❌ File Processor initialization failed:', error);
      this.showNotification(`File Processor initialization failed: ${error.message}`, 'error', 'File Processor');
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Cache DOM elements for efficient access
   */
  cacheElements() {
    const elementIds = [
      'process-form',
      'input-dir',
      'output-file', 
      'submit-btn',
      'progress-container',
      'progress-bar',
      'progress-status',
      'progress-stats',
      'result-container',
      'cancel-btn'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.state.elements.set(id, element);
      }
    });
  }

  /**
   * Setup event handlers for UI interactions
   */
  setupEventHandlers() {
    console.log('📁 Setting up File Processor event handlers...');
    
    // Form submission (CRITICAL - prevents page refresh)
    const form = this.state.elements.get('process-form');
    if (form) {
      const submitHandler = (e) => {
        console.log('📁 Form submit intercepted by File Processor');
        e.preventDefault();
        e.stopPropagation();
        this.handleFormSubmit();
        return false;
      };
      
      form.addEventListener('submit', submitHandler, true); // Use capture phase
      this.state.eventListeners.add(() => form.removeEventListener('submit', submitHandler, true));
      console.log('✅ Form submission handler attached');
    } else {
      console.error('❌ Form element not found - form submission will cause page refresh!');
    }

    // Start button (backup handler)
    const startBtn = this.state.elements.get('submit-btn');
    if (startBtn) {
      const clickHandler = (e) => {
        console.log('📁 Submit button clicked by File Processor');
        e.preventDefault();
        e.stopPropagation();
        this.startProcessing();
        return false;
      };
      startBtn.addEventListener('click', clickHandler, true);
      this.state.eventListeners.add(() => startBtn.removeEventListener('click', clickHandler, true));
      console.log('✅ Submit button handler attached');
    } else {
      console.error('❌ Submit button not found - button clicks may not work!');
    }

    // Cancel button
    const cancelBtn = this.state.elements.get('cancel-btn');
    if (cancelBtn) {
      const clickHandler = (e) => {
        e.preventDefault();
        this.cancelProcessing();
      };
      cancelBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => cancelBtn.removeEventListener('click', clickHandler));
      console.log('✅ Cancel button handler attached');
    }

    // Input validation
    this.setupInputValidation();
    
    console.log('📁 File Processor event handlers setup complete');
  }

  /**
   * Setup Socket.IO event handlers using Blueprint events
   */
  setupSocketHandlers() {
    if (!window.socket) return;

    console.log('📡 [FileProcessor] Setting up socket handlers...', {
      events: TASK_EVENTS,
      socketReady: !!window.socket.connected
    });

    // Task started
    const taskStartedHandler = (data) => {
      console.log('📡 [FileProcessor] Task started event:', data);
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskStarted(data);
      }
    };
    window.socket.on(TASK_EVENTS.STARTED, taskStartedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.STARTED, taskStartedHandler));

    // Progress updates
    const progressHandler = (data) => {
      console.log('📡 [FileProcessor] Progress event received:', data);
      console.log('📡 [FileProcessor] Task comparison:', {
        received: data.task_id,
        current: this.state.currentTask?.id,
        match: data.task_id === this.state.currentTask?.id
      });
      
      if (data.task_id === this.state.currentTask?.id) {
        this.handleProgressUpdate(data);
      } else {
        console.log('📡 [FileProcessor] Progress event ignored - task ID mismatch');
      }
    };
    window.socket.on(TASK_EVENTS.PROGRESS, progressHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.PROGRESS, progressHandler));

    // Task completed
    const completedHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskCompleted(data);
      }
    };
    window.socket.on(TASK_EVENTS.COMPLETED, completedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.COMPLETED, completedHandler));

    // Task error
    const errorHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskError(data);
      }
    };
    window.socket.on(TASK_EVENTS.ERROR, errorHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.ERROR, errorHandler));

    // File-specific events
    const fileProcessedHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleFileProcessed(data);
      }
    };
    window.socket.on('file_processed', fileProcessedHandler);
    this.state.socketListeners.add(() => window.socket.off('file_processed', fileProcessedHandler));
  }

  /**
   * Setup form validation
   */
  setupFormValidation() {
    const inputDir = this.state.elements.get('input-dir');
    const outputFile = this.state.elements.get('output-file');

    if (inputDir) {
      inputDir.addEventListener('input', () => this.validateForm());
    }
    if (outputFile) {
      outputFile.addEventListener('input', () => this.validateForm());
    }
  }

  /**
   * Setup input validation with real-time feedback
   */
  setupInputValidation() {
    const inputDir = this.state.elements.get('input-dir');
    const outputFile = this.state.elements.get('output-file');

    if (inputDir) {
      inputDir.addEventListener('blur', async () => {
        const path = inputDir.value.trim();
        if (path) {
          await this.validatePath(path);
        }
      });
    }

    if (outputFile) {
      outputFile.addEventListener('blur', () => {
        const filename = outputFile.value.trim();
        if (filename) {
          this.validateOutputFilename(filename);
        }
      });
    }
  }

  /**
   * Validate file path using Blueprint API
   */
  async validatePath(path) {
    try {
      const result = await blueprintApi.verifyPath(path);
      
      const inputDir = this.state.elements.get('input-dir');
      if (inputDir) {
        inputDir.classList.remove('is-invalid', 'is-valid');
        
        if (result.valid) {
          inputDir.classList.add('is-valid');
          this.showFieldFeedback(inputDir, 'Valid directory path', 'valid');
        } else {
          inputDir.classList.add('is-invalid');
          this.showFieldFeedback(inputDir, result.error || 'Invalid path', 'invalid');
        }
      }
      
      return result.valid;
      
    } catch (error) {
      console.warn('Path validation failed:', error);
      return true; // Allow processing to continue if validation fails
    }
  }

  /**
   * Validate output filename
   */
  validateOutputFilename(filename) {
    const outputFile = this.state.elements.get('output-file');
    if (!outputFile) return true;

    outputFile.classList.remove('is-invalid', 'is-valid');

    // Check filename length
    if (filename.length > CONSTANTS.MAX_FILENAME_LENGTH) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Filename too long', 'invalid');
      return false;
    }

    // Check for invalid characters (Windows compatibility)
    if (CONSTANTS.WINDOWS_INVALID_CHARS.test(filename)) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Contains invalid characters', 'invalid');
      return false;
    }

    // Check for reserved names
    const baseName = filename.split('.')[0].toUpperCase();
    if (CONSTANTS.WINDOWS_RESERVED_NAMES.includes(baseName)) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Reserved filename', 'invalid');
      return false;
    }

    outputFile.classList.add('is-valid');
    this.showFieldFeedback(outputFile, 'Valid filename', 'valid');
    return true;
  }

  /**
   * Show field validation feedback
   */
  showFieldFeedback(element, message, type) {
    // Remove existing feedback
    const existingFeedback = element.parentNode.querySelector('.feedback-message');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // Add new feedback
    const feedback = document.createElement('div');
    feedback.className = `feedback-message ${type === 'valid' ? 'text-success' : 'text-danger'} small mt-1`;
    feedback.textContent = message;
    element.parentNode.appendChild(feedback);
  }

  /**
   * Validate entire form
   */
  validateForm() {
    const inputDir = this.state.elements.get('input-dir')?.value.trim();
    const outputFile = this.state.elements.get('output-file')?.value.trim();
    const startBtn = this.state.elements.get('submit-btn');

    const isValid = inputDir && outputFile && this.state.processingState === 'idle';

    if (startBtn) {
      startBtn.disabled = !isValid;
    }

    return isValid;
  }

  /**
   * Handle form submission
   */
  async handleFormSubmit() {
    console.log('📁 File Processor handleFormSubmit called');
    
    try {
      if (!this.validateForm()) {
        console.log('📁 Form validation failed');
        return;
      }
      
      console.log('📁 Form validation passed, starting processing...');
      await this.startProcessing();
      
    } catch (error) {
      console.error('❌ Form submission error:', error);
      this.showNotification(`Form submission failed: ${error.message}`, 'error');
    }
  }

  /**
   * Start file processing using Blueprint API
   */
  async startProcessing() {
    try {
      const inputDir = this.state.elements.get('input-dir')?.value.trim();
      const outputFile = this.state.elements.get('output-file')?.value.trim();

      if (!inputDir || !outputFile) {
        this.showError('Please fill in all required fields');
        return;
      }

      this.state.processingState = 'processing';
      this.updateUI();

      // Start processing using Blueprint API
      const response = await blueprintApi.processFiles(inputDir, outputFile, {
        formats: this.config.supportedFormats,
        max_size: this.config.maxFileSize,
        chunk_size: this.config.chunkSize
      });

      // Store task information
      this.state.currentTask = {
        id: response.task_id,
        inputDir,
        outputFile,
        startTime: Date.now()
      };

      console.log(`📁 File processing started: ${response.task_id}`);
      console.log(`📁 Socket connected: ${!!window.socket?.connected}, Current task stored:`, this.state.currentTask);
      
      // Start progress tracking using existing progressHandler
      await this.initializeProgressTracking(response.task_id);
      
      this.showInfo(`Processing started for: ${inputDir}`);

    } catch (error) {
      console.error('❌ Failed to start processing:', error);
      this.handleTaskError({ error: error.message });
    }
  }


  /**
   * Initialize progress tracking using new SocketIO-aligned progressHandler v5.0
   */
  async initializeProgressTracking(taskId) {
    try {
      console.log(`📊 [FileProcessor] Initializing progress tracking for: ${taskId}`);
      
      // Import new progressHandler v5.0
      const progressHandlerModule = await import('../utils/progressHandler.js');
      const { trackProgress } = progressHandlerModule;
      
      // Initialize the progress handler if needed
      if (typeof progressHandlerModule.default === 'function' && !window.progressHandlerInitialized) {
        await progressHandlerModule.default();
        window.progressHandlerInitialized = true;
      }
      
      // Start tracking this specific task with v5.0 API
      if (trackProgress) {
        console.log(`📊 [FileProcessor] Starting progress tracking with v5.0...`);
        const tracker = trackProgress(taskId, {
          targetElement: 'progress-container',
          taskType: 'file_processing',
          elementPrefix: '' // Use default element IDs
        });
        
        // Store tracker for cleanup
        this.state.progressTracker = tracker;
      }
      
      console.log(`📊 [FileProcessor] Progress tracking v5.0 initialized`);
      
    } catch (error) {
      console.error('❌ Failed to initialize progress tracking:', error);
      this.showNotification(`Progress tracking failed: ${error.message}`, 'warning');
      // Continue without progress tracking
    }
  }

  /**
   * Cancel current processing task
   */
  async cancelProcessing() {
    if (!this.state.currentTask) return;

    try {
      await blueprintApi.cancelTask(this.state.currentTask.id);
      console.log(`🚫 Processing cancelled: ${this.state.currentTask.id}`);
      
    } catch (error) {
      console.error('❌ Failed to cancel processing:', error);
    }
  }

  /**
   * Handle task started event
   */
  handleTaskStarted(data) {
    console.log('🚀 File processing task started:', data);
    this.showProgress(0, 'Starting file processing...');
  }

  /**
   * Handle progress update
   */
  handleProgressUpdate(data) {
    console.log(`📊 [FileProcessor] Progress update received:`, data);
    
    const progress = Math.min(100, Math.max(0, data.progress || 0));
    const message = data.message || `Processing... ${progress.toFixed(1)}%`;
    
    this.showProgress(progress, message);
    
    // Update stats if available
    if (data.stats) {
      this.updateStats(data.stats);
    }
  }

  /**
   * Handle file processed event
   */
  handleFileProcessed(data) {
    console.log('📄 File processed:', data);
    // Could show individual file progress here
  }

  /**
   * Handle task completion
   */
  handleTaskCompleted(data) {
    console.log('✅ File processing completed:', data);
    
    this.state.processingState = 'completed';
    this.showProgress(100, 'Processing completed successfully!');
    
    // Show results
    this.showResults(data);
    
    // Update stats
    if (data.stats) {
      this.updateStats(data.stats);
    }
    
    this.updateUI();
  }

  /**
   * Handle task error
   */
  handleTaskError(data) {
    console.error('❌ File processing error:', data);
    
    this.state.processingState = 'error';
    this.showError(data.error || 'Processing failed');
    this.updateUI();
  }

  /**
   * Update UI based on current state
   */
  updateUI() {
    const startBtn = this.state.elements.get('submit-btn');
    const cancelBtn = this.state.elements.get('cancel-btn');
    const progressContainer = this.state.elements.get('progress-container');

    if (startBtn) {
      startBtn.disabled = this.state.processingState === 'processing';
      startBtn.innerHTML = this.state.processingState === 'processing' ? 
        '<i class="fas fa-spinner fa-spin me-2"></i> Processing...' : 
        '<i class="fas fa-play me-2"></i> Start Processing';
    }

    if (cancelBtn) {
      cancelBtn.style.display = this.state.processingState === 'processing' ? 'inline-block' : 'none';
    }

    if (progressContainer) {
      progressContainer.style.display = 
        ['processing', 'completed', 'error'].includes(this.state.processingState) ? 'block' : 'none';
    }
  }

  /**
   * Show progress update
   */
  showProgress(progress, message) {
    const progressBar = this.state.elements.get('progress-bar');
    const progressText = this.state.elements.get('progress-status');

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
      progressBar.textContent = `${progress}%`;
    }

    if (progressText) {
      progressText.textContent = message;
    }
  }

  /**
   * Update statistics display
   */
  updateStats(stats) {
    const statsContainer = this.state.elements.get('progress-stats');
    if (!statsContainer) return;

    const statsText = `Files: ${stats.files_processed || 0}/${stats.total_files || 0} | Size: ${this.formatFileSize(stats.total_size || 0)} | Time: ${this.formatDuration(stats.elapsed_time || 0)}`;

    statsContainer.textContent = statsText;
    statsContainer.style.display = 'block';
  }

  /**
   * Show processing results
   */
  showResults(data) {
    const resultsContainer = this.state.elements.get('result-container');
    if (!resultsContainer) return;

    const resultsHtml = `
      <div class="alert alert-success">
        <h5><i class="fas fa-check-circle me-2"></i>Processing Complete!</h5>
        <p>Successfully processed files from: <strong>${this.state.currentTask.inputDir}</strong></p>
        <p>Output file: <strong>${data.output_file || this.state.currentTask.outputFile}</strong></p>
        
        ${data.download_url ? `
        <div class="mt-3">
          <a href="${data.download_url}" class="btn btn-primary" download>
            <i class="fas fa-download me-2"></i>Download Results
          </a>
        </div>
        ` : ''}
      </div>
    `;

    resultsContainer.innerHTML = resultsHtml;
    resultsContainer.style.display = 'block';
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showToast('Processing Error', message, 'error');
  }

  /**
   * Show info message
   */
  showInfo(message) {
    this.showToast('File Processor', message, 'info');
  }

  /**
   * Show toast notification
   */
  showToast(title, message, type = 'info') {
    // Use existing toast system or create simple one
    if (window.showToast) {
      window.showToast(title, message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration for display
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.state.currentTask = null;
    this.state.processingState = 'idle';
    
    // Clear UI
    const progressContainer = this.state.elements.get('progress-container');
    const statsContainer = this.state.elements.get('progress-stats');
    const resultsContainer = this.state.elements.get('result-container');

    if (progressContainer) progressContainer.style.display = 'none';
    if (statsContainer) statsContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'none';

    this.updateUI();
  }

  /**
   * Cleanup event listeners and resources
   */
  cleanup() {
    // Remove event listeners
    this.state.eventListeners.forEach(removeListener => removeListener());
    this.state.eventListeners.clear();

    // Remove socket listeners
    this.state.socketListeners.forEach(removeListener => removeListener());
    this.state.socketListeners.clear();

    // Cancel any ongoing task
    if (this.state.currentTask) {
      this.cancelProcessing();
    }

    // Cleanup progress tracker
    if (this.state.progressTracker?.stop) {
      this.state.progressTracker.stop();
    }

    this.state.isInitialized = false;
  }
}

// Create singleton instance
const fileProcessor = new FileProcessor();

// Export for use by other modules
export default fileProcessor;

// Make available globally for debugging and integration
window.fileProcessor = fileProcessor;
if (window.NeuroGen) {
  window.NeuroGen.fileProcessor = fileProcessor;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📁 DOM ready, initializing File Processor...');
    fileProcessor.init();
  });
} else {
  console.log('📁 DOM already ready, initializing File Processor immediately...');
  fileProcessor.init();
}

console.log('📁 File Processor module loaded (Enhanced Blueprint Implementation)');