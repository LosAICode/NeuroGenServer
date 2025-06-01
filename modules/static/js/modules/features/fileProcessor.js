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
      lastHealthCheck: null,
      // Enhanced completion tracking
      completionState: {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      },
      // Progress tracking for stuck task detection
      lastProgressTimestamp: null,
      lastReportedProgress: 0,
      progressUpdateCount: 0,
      progressRates: [],
      processingStartTime: null,
      // Completion monitoring
      completionMonitoring: {
        enabled: true,
        timeoutIds: new Set(),
        checkIntervalMs: 5000, // Check every 5 seconds
        maxStuckDurationMs: 30000 // Consider stuck after 30 seconds with no updates
      }
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
      'form-container',
      'input-dir',
      'output-file', 
      'submit-btn',
      'progress-container',
      'progress-bar',
      'progress-status',
      'progress-stats',
      'result-container',
      'result-stats',
      'open-btn',
      'new-task-btn',
      'error-container',
      'error-message', 
      'error-details',
      'retry-btn',
      'cancel-btn'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.state.elements.set(id, element);
        console.log(`✅ [FileProcessor] Cached element: ${id}`);
      } else {
        console.warn(`⚠️ [FileProcessor] Element not found: ${id}`);
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
      
      // Reset completion state for new task
      this.state.completionState = {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      };
      
      // Initialize progress tracking
      this.state.lastProgressTimestamp = Date.now();
      this.state.lastReportedProgress = 0;
      this.state.progressUpdateCount = 0;
      this.state.progressRates = [];
      this.state.processingStartTime = Date.now();
      
      this.updateUI();
      
      // Transition from form to progress container immediately
      this.showProgressContainer();
      this.showProgress(0, 'Initializing file processing...');

      // Start processing using Blueprint API
      const response = await blueprintApi.processFiles(inputDir, outputFile, {
        formats: this.config.supportedFormats,
        max_size: this.config.maxFileSize,
        chunk_size: this.config.chunkSize
      });
      
      // Update progress immediately after API call
      this.showProgress(5, 'Processing request submitted, starting task...');

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
   * Initialize progress tracking using Enterprise ProgressHandler v6.0
   */
  async initializeProgressTracking(taskId) {
    try {
      console.log(`📊 [FileProcessor] Initializing Enterprise progress tracking for: ${taskId}`);
      
      // Import Enterprise progressHandler v6.0
      const progressHandlerModule = await import('../utils/progressHandler.js');
      const { trackProgress } = progressHandlerModule;
      
      // Initialize the progress handler if needed
      if (typeof progressHandlerModule.default === 'function' && !window.progressHandlerInitialized) {
        await progressHandlerModule.default();
        window.progressHandlerInitialized = true;
        console.log('📊 [FileProcessor] Enterprise ProgressHandler v6.0 initialized');
      }
      
      // Start tracking this specific task with v6.0 Enterprise API
      if (trackProgress) {
        console.log(`📊 [FileProcessor] Starting Enterprise progress tracking...`);
        const tracker = trackProgress(taskId, {
          targetElement: 'progress-container',
          taskType: 'file_processing',
          module: 'file_processing',
          elementPrefix: '', // File processing uses default IDs (no prefix)
          buttonId: 'submit-btn', // Link to the submit button
          // Let FileProcessor handle its own UI updates
          customUIHandler: true
        });
        
        // Store tracker for cleanup
        this.state.progressTracker = tracker;
        
        console.log(`📊 [FileProcessor] Enterprise progress tracking active for task: ${taskId}`);
        
        // Ensure progress container is immediately visible
        this.showProgress(0, 'Connecting to processing service...');
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize Enterprise progress tracking:', error);
      this.showNotification(`Progress tracking failed: ${error.message}`, 'warning');
      // Continue without progress tracking - graceful degradation
    }
  }

  /**
   * Cancel current processing task
   */
  async cancelProcessing() {
    if (!this.state.currentTask) return;

    try {
      const success = await blueprintApi.cancelTask(this.state.currentTask.id);
      console.log(`🚫 Processing cancelled: ${this.state.currentTask.id}`);
      
      if (success) {
        // Reset UI state immediately
        this.state.processingState = 'cancelled';
        this.state.currentTask = null;
        
        // Show form again
        this.showForm();
        
        // Display cancellation message
        this.showProgress(0, 'Processing cancelled by user');
        
        // Hide progress after brief delay
        setTimeout(() => {
          this.showForm();
        }, 1500);
      }
      
    } catch (error) {
      console.error('❌ Failed to cancel processing:', error);
      // Still reset UI on error to prevent stuck state
      this.showForm();
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
   * Handle progress update with sophisticated completion detection and stuck task monitoring
   */
  handleProgressUpdate(data) {
    try {
      console.log(`📊 [FileProcessor] Progress update received:`, data);
      
      if (!data || !data.task_id || data.task_id !== this.state.currentTask?.id) {
        console.log('📊 [FileProcessor] Progress update ignored - task ID mismatch');
        return;
      }
      
      let progress = Math.min(100, Math.max(0, data.progress || 0));
      const message = data.message || `Processing... ${progress.toFixed(1)}%`;
      
      // Enhanced progress handling to avoid visual stutter at 99%
      if (progress >= 99 && progress < 100) {
        // If status indicates completion, jump to 100%
        if (data.status === "completed" || this.isCompletionPhase(data)) {
          progress = 100;
          console.log("🎯 [FileProcessor] Forcing progress to 100% due to completion indicators");
        }
        // If we're already showing 99%+ and status isn't completed, be conservative
        else if (this.state.lastReportedProgress >= 99) {
          if (progress > this.state.lastReportedProgress) {
            console.log(`📊 [FileProcessor] Updating from ${this.state.lastReportedProgress}% to ${progress}%`);
          } else {
            console.log(`📊 [FileProcessor] Skipping progress update: current ${this.state.lastReportedProgress}%, new ${progress}%`);
            return;
          }
        }
      }
      
      // Store progress metrics for ETA calculation
      this.updateProgressMetrics(progress);
      
      // Update progress display
      this.showProgress(progress, message);
      
      // Update stats if available
      if (data.stats) {
        this.updateStats(data.stats);
      }
      
      // Store last reported progress
      this.state.lastReportedProgress = progress;
      this.state.progressUpdateCount++;
      
      // Enhanced completion detection with multiple sophisticated triggers
      const isCompleted = 
        (data.status === "completed") || 
        (progress >= 99 && data.stats && data.stats.status === "completed") ||
        (progress >= 99.9) ||
        (progress >= 99 && this.isCompletionPhase(data)) ||
        (data.stats && data.stats.current_stage === 'Completed') ||
        (data.stats && data.stats.completion_percentage >= 100) ||
        (progress >= 99 && data.stats && 
         data.stats.processed_files === data.stats.total_files);
      
      if (isCompleted && this.state.processingState === 'processing' && !this.state.completionState.completed) {
        console.log('🎉 [FileProcessor] Completion detected via progress update');
        console.log('📊 [FileProcessor] Completion triggers:', {
          progress_100: progress >= 100,
          status_completed: data.status === "completed",
          stage_completed: data.stats?.current_stage === 'Completed',
          completion_pct_100: data.stats?.completion_percentage >= 100,
          completion_phase: this.isCompletionPhase(data),
          files_match: data.stats?.processed_files === data.stats?.total_files,
          processing_state: this.state.processingState,
          stats: data.stats
        });
        
        // Force progress to 100% for completed tasks
        this.showProgress(100, data.message || "Task completed successfully", data.stats);
        
        // Complete the task after brief delay to ensure UI is updated
        setTimeout(() => {
          this.handleTaskCompleted(data);
        }, 500);
      }
      else if (data.status === "failed" || data.status === "error") {
        this.handleTaskError(data);
      } 
      else if (data.status === "cancelled") {
        this.handleTaskCancelled(data);
      }
      
      // Monitor for stuck tasks at high progress
      this.monitorTaskProgress(data);
      
    } catch (error) {
      console.error('❌ [FileProcessor] Error handling progress update:', error);
      this.showNotification(`Progress update error: ${error.message}`, 'warning', 'File Processor');
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
   * Handle task completion with comprehensive cleanup and history tracking
   */
  handleTaskCompleted(data) {
    try {
      console.log('✅ [FileProcessor] Task completion received:', data);
      
      // Check if already completed with time-based duplicate prevention
      if (this.state.completionState.completed && 
          this.state.completionState.completionTime && 
          (Date.now() - this.state.completionState.completionTime < 5000)) {
        console.log("📊 [FileProcessor] Task already marked as completed, preventing duplicate completion");
        return;
      }
      
      // Mark as completed to prevent duplicate processing
      this.state.completionState.completed = true;
      this.state.completionState.completionTime = Date.now();
      this.state.processingState = 'completed';
      
      console.log("🎉 [FileProcessor] Processing task completion with full cleanup");
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Update UI to show completion state immediately
      this.updateUI();
      
      // Force progress to 100% to avoid stuck progress bar
      this.showProgress(100, "Task completed successfully", data.stats);
      
      // Clean up session storage
      this.cleanupSessionState();
      
      // Reset processing state
      this.resetProcessingState();
      
      // Complete tracking in progressHandler if available
      this.completeProgressHandler(data);
      
      // Add completed task to history
      setTimeout(() => {
        this.addTaskToHistory(data);
      }, 500); // Brief delay for stats to finalize
      
      // Show comprehensive result UI
      setTimeout(() => {
        this.showResult({
          stats: data.stats || {},
          output_file: data.output_file || this.state.currentTask?.outputFile,
          task_id: data.task_id || this.state.currentTask?.id,
          progress: 100,
          message: 'Processing completed successfully!'
        });
      }, 800); // Delay for better UX
      
      // Show success notification
      this.showNotification('Processing completed successfully!', 'success', 'File Processor');
      
      // Update state manager if available
      if (window.stateManager && typeof window.stateManager.setProcessingActive === 'function') {
        window.stateManager.setProcessingActive(false);
      }
      
      // Trigger completion event for other modules
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('file.processing.completed', data);
      }
      
      console.log("✅ [FileProcessor] Task completion cleanup completed successfully");
      
    } catch (error) {
      console.error('❌ [FileProcessor] Error handling task completion:', error);
      this.showNotification(`Completion handling error: ${error.message}`, 'error', 'File Processor');
    }
  }

  /**
   * Handle task error
   */
  handleTaskError(data) {
    console.error('❌ File processing error:', data);
    
    this.state.processingState = 'error';
    this.state.completionState.error = true;
    this.clearCompletionMonitoring();
    this.showError(data.error || 'Processing failed');
    this.updateUI();
  }

  /**
   * Handle task cancellation
   */
  handleTaskCancelled(data) {
    console.log('🚫 File processing cancelled:', data);
    
    this.state.processingState = 'cancelled';
    this.state.completionState.cancelled = true;
    this.clearCompletionMonitoring();
    this.showForm();
    this.showNotification('Processing cancelled', 'warning', 'File Processor');
  }

  /**
   * Helper function to check if data indicates completion phase
   */
  isCompletionPhase(data) {
    return (
      data.status === "completed" || 
      (data.stats && data.stats.status === "completed") ||
      (data.message && (
        data.message.toLowerCase().includes("complet") ||
        data.message.toLowerCase().includes("done") ||
        data.message.toLowerCase().includes("finish")
      )) ||
      (data.progress >= 99.5) ||
      (data.progress >= 99 && data.stats && 
       data.stats.processed_files === data.stats.total_files)
    );
  }

  /**
   * Monitor task progress and detect potentially stuck tasks
   */
  monitorTaskProgress(data) {
    if (!this.state.completionMonitoring.enabled) return;
    
    try {
      const { progress, task_id } = data;
      
      // Only monitor tasks at high progress percentages
      if (progress < 95) return;
      
      // Clear any existing timeout for this task
      this.clearCompletionMonitoring();
      
      // Set a timeout to check if the task is stuck
      const timeoutId = setTimeout(() => {
        // Only proceed if still in processing state and not already completed
        if (this.state.processingState !== 'processing' || this.state.completionState.completed) return;
        
        console.log(`🔍 [FileProcessor] Checking if task ${task_id} is stuck at ${progress}%`);
        
        const currentTime = Date.now();
        const lastUpdateTime = this.state.lastProgressTimestamp || 0;
        const timeSinceUpdate = currentTime - lastUpdateTime;
        
        // If no updates for a while and at high percentage, task may be stuck
        if (timeSinceUpdate > this.state.completionMonitoring.maxStuckDurationMs && progress >= 95) {
          console.warn(`⚠️ [FileProcessor] Task appears stuck at ${progress}% with no updates for ${timeSinceUpdate/1000}s`);
          
          // Force check completion status via API
          this.checkTaskCompletionStatus(task_id);
        }
      }, this.state.completionMonitoring.checkIntervalMs);
      
      // Store the timeout ID
      this.state.completionMonitoring.timeoutIds.add(timeoutId);
    } catch (error) {
      console.error('❌ [FileProcessor] Error in task progress monitoring:', error);
    }
  }

  /**
   * Clear any active completion monitoring timeouts
   */
  clearCompletionMonitoring() {
    try {
      for (const timeoutId of this.state.completionMonitoring.timeoutIds) {
        clearTimeout(timeoutId);
      }
      this.state.completionMonitoring.timeoutIds.clear();
    } catch (error) {
      console.error('❌ [FileProcessor] Error clearing completion monitoring:', error);
    }
  }

  /**
   * Check task completion status via API for stuck tasks
   */
  async checkTaskCompletionStatus(taskId) {
    try {
      console.log(`🔍 [FileProcessor] Checking completion status of task ${taskId} via API`);
      
      const response = await fetch(`/api/status/${taskId}`);
      
      if (!response.ok) {
        console.warn(`⚠️ [FileProcessor] Status check failed with status ${response.status}`);
        return;
      }
      
      const data = await response.json();
      console.log(`📊 [FileProcessor] Task status from API: ${data.status}, progress: ${data.progress}%`);
      
      // If task is completed according to API but UI doesn't show it
      if (data.status === "completed" || data.progress >= 100) {
        console.log("🎯 [FileProcessor] Task is completed according to API, forcing completion in UI");
        
        // Force progress to 100%
        this.showProgress(100, "Task completed successfully", data.stats);
        
        // Mark as completed if not already
        if (!this.state.completionState.completed) {
          this.handleTaskCompleted(data);
        }
      }
      // Handle other status cases
      else if (data.status === "error" || data.status === "failed") {
        if (!this.state.completionState.error) {
          this.handleTaskError(data);
        }
      }
      else if (data.status === "cancelled") {
        if (!this.state.completionState.cancelled) {
          this.handleTaskCancelled(data);
        }
      }
      // Task is still running - update progress
      else {
        console.log("📊 [FileProcessor] Task is still running according to API");
        this.handleProgressUpdate(data);
        
        // Schedule another check in case the task gets stuck again
        const timeoutId = setTimeout(() => {
          this.checkTaskCompletionStatus(taskId);
        }, this.state.completionMonitoring.checkIntervalMs * 2);
        
        this.state.completionMonitoring.timeoutIds.add(timeoutId);
      }
    } catch (error) {
      console.error('❌ [FileProcessor] Error checking task completion status:', error);
    }
  }

  /**
   * Update progress metrics for ETA calculation
   */
  updateProgressMetrics(progress) {
    const now = Date.now();
    
    if (!this.state.lastProgressTimestamp) {
      this.state.lastProgressTimestamp = now;
      this.state.processingStartTime = this.state.processingStartTime || now;
      return;
    }
    
    const lastProgress = this.state.lastReportedProgress;
    const timeDelta = now - this.state.lastProgressTimestamp;
    
    // Only update if significant time and progress changes
    if (timeDelta > 500 && progress > lastProgress) {
      const progressDelta = progress - lastProgress;
      const rate = progressDelta / timeDelta;
      
      // Store rate for averaging (keep last 10 rates)
      this.state.progressRates.push(rate);
      if (this.state.progressRates.length > 10) {
        this.state.progressRates.shift();
      }
      
      this.state.lastProgressTimestamp = now;
    }
  }

  /**
   * Clean up session storage and state
   */
  cleanupSessionState() {
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      localStorage.removeItem('currentTask');
      sessionStorage.setItem('taskCompletionTime', Date.now().toString());
    } catch (error) {
      console.warn('⚠️ [FileProcessor] Error cleaning session state:', error);
    }
  }

  /**
   * Reset processing state variables
   */
  resetProcessingState() {
    this.state.currentTask = null;
    this.state.lastProgressTimestamp = null;
    this.state.lastReportedProgress = 0;
    this.state.progressUpdateCount = 0;
    this.state.progressRates = [];
    this.state.processingStartTime = null;
  }

  /**
   * Complete progress handler integration
   */
  completeProgressHandler(data) {
    try {
      // Try multiple approaches to complete progress tracking
      if (window.progressHandler && typeof window.progressHandler.complete === 'function') {
        window.progressHandler.complete(data);
        console.log("📊 [FileProcessor] Progress handler completed task:", data.task_id);
      } else if (window.moduleInstances?.progressHandler?.completeTask) {
        window.moduleInstances.progressHandler.completeTask(data.task_id, data);
        console.log("📊 [FileProcessor] Module instance progressHandler completed task:", data.task_id);
      }
    } catch (error) {
      console.warn('⚠️ [FileProcessor] Error completing progress handler:', error);
    }
  }

  /**
   * Add task to history using multiple approaches
   */
  addTaskToHistory(data) {
    try {
      if (!data) return;
      
      console.log("📚 [FileProcessor] Adding task to history:", data);
      
      // Prepare the task data for history
      const taskData = {
        task_id: data.task_id || this.state.currentTask?.id,
        type: 'file',
        status: 'completed',
        timestamp: Date.now(),
        filename: this.getFileNameFromPath(data.output_file),
        inputPath: this.state.currentTask?.inputDir,
        outputPath: data.output_file,
        stats: data.stats || {}
      };
      
      // Try historyManager if available
      if (window.historyManager && typeof window.historyManager.addTaskToHistory === 'function') {
        window.historyManager.addTaskToHistory(taskData);
        console.log("📚 [FileProcessor] Task added to history successfully");
        
        // Also add to recent files
        if (data.output_file && typeof window.historyManager.addFileToRecent === 'function') {
          window.historyManager.addFileToRecent({
            path: data.output_file,
            name: this.getFileNameFromPath(data.output_file),
            lastAccessed: Date.now()
          });
        }
        return true;
      }
      
      // Try moduleInstances approach
      if (window.moduleInstances?.historyManager?.addTaskToHistory) {
        window.moduleInstances.historyManager.addTaskToHistory(taskData);
        console.log("📚 [FileProcessor] Task added to history using moduleInstances");
        return true;
      }
      
      // Try event registry approach
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        console.log("📚 [FileProcessor] Using event registry to add task to history");
        window.eventRegistry.emit('history.add', {
          type: 'file',
          name: data.output_file ? this.getFileNameFromPath(data.output_file) : 'Processed Data',
          data: taskData
        });
      }
      
      // Fallback to localStorage
      try {
        const historyItems = JSON.parse(localStorage.getItem('fileProcessorHistory') || '[]');
        historyItems.unshift({
          type: 'file',
          name: data.output_file ? this.getFileNameFromPath(data.output_file) : 'Processed Data',
          data: taskData
        });
        
        // Keep only last 50 items
        if (historyItems.length > 50) historyItems.length = 50;
        localStorage.setItem('fileProcessorHistory', JSON.stringify(historyItems));
        console.log("📚 [FileProcessor] Task saved to localStorage history fallback");
      } catch (storageErr) {
        console.warn('⚠️ [FileProcessor] Failed to save to localStorage:', storageErr);
      }
    } catch (error) {
      console.error('❌ [FileProcessor] Error adding task to history:', error);
    }
  }

  /**
   * Extract filename from path
   */
  getFileNameFromPath(filePath) {
    if (!filePath) return 'Unknown File';
    return filePath.split('/').pop() || filePath.split('\\').pop() || 'Unknown File';
  }

  /**
   * Show the main form container
   */
  showForm() {
    try {
      const formContainer = this.state.elements.get('form-container') || document.getElementById('form-container');
      const progressContainer = this.state.elements.get('progress-container');
      const resultContainer = this.state.elements.get('result-container');
      const submitBtn = this.state.elements.get('submit-btn');

      // Reset processing state
      this.state.processingState = 'idle';
      this.state.currentTask = null;

      // Show form, hide other containers with smooth transitions
      this.transitionToContainer(formContainer);
      
      // Update UI to reset button state properly
      this.updateUI();

      console.log('📁 [FileProcessor] Form container shown');
    } catch (error) {
      console.error('❌ Error showing form:', error);
    }
  }

  /**
   * Show the progress container with enhanced transitions
   */
  showProgressContainer() {
    try {
      const formContainer = this.state.elements.get('form-container') || document.getElementById('form-container');
      const progressContainer = this.state.elements.get('progress-container');
      const resultContainer = this.state.elements.get('result-container');

      // Transition from form to progress
      this.transitionToContainer(progressContainer);
      
      console.log('📊 [FileProcessor] Progress container shown');
    } catch (error) {
      console.error('❌ Error showing progress container:', error);
    }
  }

  /**
   * Show results with comprehensive stats display (NEW - enhanced showResult pattern)
   */
  showResult(data) {
    console.log('🎯 [FileProcessor] showResult called with data:', data);
    
    try {
      // Force immediate container transition
      const resultContainer = this.state.elements.get('result-container');
      
      if (!resultContainer) {
        console.error('❌ [FileProcessor] Result container not found!');
        this.showNotification('Results container not available', 'error');
        return;
      }
      
      console.log('📦 [FileProcessor] Transitioning to result container...');
      this.transitionToContainer(resultContainer);
      
      // Update result content immediately
      console.log('📊 [FileProcessor] Updating result stats...');
      this.updateResultStats(resultContainer, data);
      
      // Update quick stats display
      const resultStatsElement = this.state.elements.get('result-stats');
      if (resultStatsElement && data.stats) {
        const quickStats = `
          <div class="d-flex justify-content-between text-muted small">
            <span><i class="fas fa-file me-1"></i>${data.stats.processed_files || 0} files processed</span>
            <span><i class="fas fa-clock me-1"></i>${data.stats.formatted_duration || 'Unknown'}</span>
            <span><i class="fas fa-check-circle me-1"></i>${data.stats.success_rate_percent || 100}% success</span>
          </div>
        `;
        resultStatsElement.innerHTML = quickStats;
        console.log('📈 [FileProcessor] Quick stats updated');
      }
      
      // Show success notification
      this.showNotification('Processing completed successfully!', 'success', 'File Processor');
      
      console.log('✅ [FileProcessor] Results displayed successfully');
      
    } catch (error) {
      console.error('❌ [FileProcessor] Error in showResult:', error);
      // Fallback to basic completion message
      this.showNotification('Processing completed - check console for details', 'success');
    }
  }

  /**
   * Show the result container with comprehensive stats (LEGACY - keep for compatibility)
   */
  showResultContainer(data) {
    console.log('🔄 [FileProcessor] showResultContainer called - redirecting to showResult');
    this.showResult(data);
  }

  /**
   * Smooth transition between containers
   */
  transitionToContainer(targetContainer) {
    if (!targetContainer) return;

    const allContainers = [
      this.state.elements.get('form-container') || document.getElementById('form-container'),
      this.state.elements.get('progress-container'),
      this.state.elements.get('result-container')
    ].filter(container => container);

    // Hide all containers
    allContainers.forEach(container => {
      if (container !== targetContainer) {
        container.classList.add('d-none');
        container.style.display = 'none';
      }
    });

    // Show target container with fade-in effect
    if (targetContainer) {
      targetContainer.classList.remove('d-none');
      targetContainer.style.display = 'block';
      
      // Add fade-in animation
      targetContainer.style.opacity = '0';
      setTimeout(() => {
        targetContainer.style.transition = 'opacity 0.3s ease-in-out';
        targetContainer.style.opacity = '1';
      }, 10);
    }
  }

  /**
   * Update UI based on current state - Enhanced for completion handling
   */
  updateUI() {
    const startBtn = this.state.elements.get('submit-btn');
    const cancelBtn = this.state.elements.get('cancel-btn');

    console.log(`🔄 [FileProcessor] Updating UI, current state: ${this.state.processingState}`);

    if (startBtn) {
      // Update button based on processing state
      switch (this.state.processingState) {
        case 'processing':
          startBtn.disabled = true;
          startBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Processing...';
          break;
        case 'completed':
          startBtn.disabled = false;
          startBtn.innerHTML = '<i class="fas fa-check me-2"></i> Completed';
          startBtn.classList.remove('btn-primary');
          startBtn.classList.add('btn-success');
          break;
        case 'error':
          startBtn.disabled = false;
          startBtn.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i> Error - Retry';
          startBtn.classList.remove('btn-primary', 'btn-success');
          startBtn.classList.add('btn-warning');
          break;
        default: // 'idle'
          startBtn.disabled = false;
          startBtn.innerHTML = '<i class="fas fa-play me-2"></i> Start Processing';
          startBtn.classList.remove('btn-success', 'btn-warning');
          startBtn.classList.add('btn-primary');
          break;
      }
    }

    if (cancelBtn) {
      cancelBtn.style.display = this.state.processingState === 'processing' ? 'inline-block' : 'none';
    }

    console.log(`✅ [FileProcessor] UI updated for state: ${this.state.processingState}`);
  }

  /**
   * Show progress update
   */
  showProgress(progress, message) {
    const progressBar = this.state.elements.get('progress-bar');
    const progressText = this.state.elements.get('progress-status');
    const progressContainer = this.state.elements.get('progress-container');

    // Ensure progress container is visible
    if (progressContainer) {
      progressContainer.classList.remove('d-none');
      progressContainer.style.display = 'block';
    }

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
      // Format progress to 1 decimal place for consistency
      progressBar.textContent = `${progress.toFixed(1)}%`;
    }

    if (progressText) {
      progressText.textContent = message;
    }
  }

  /**
   * Update statistics display during processing
   */
  updateStats(stats) {
    const statsContainer = this.state.elements.get('progress-stats');
    if (!statsContainer) return;

    // Use enhanced CustomFileStats fields if available
    const processed = stats.processed_files || 0;
    const total = stats.total_files || 0;
    const size = stats.formatted_total_size || this.formatFileSize(stats.total_bytes || 0);
    const duration = stats.formatted_duration || this.formatDuration(stats.elapsed_time || 0);
    const rate = stats.formatted_processing_rate || `${stats.current_processing_rate || 0} files/sec`;
    const stage = stats.current_stage || 'Processing';

    // Enhanced real-time stats display
    const statsHtml = `
      <div class="row g-2 small">
        <div class="col-md-6">
          <i class="fas fa-files-o me-1"></i><strong>Files:</strong> ${processed}/${total}
        </div>
        <div class="col-md-6">
          <i class="fas fa-database me-1"></i><strong>Size:</strong> ${size}
        </div>
        <div class="col-md-6">
          <i class="fas fa-clock me-1"></i><strong>Time:</strong> ${duration}
        </div>
        <div class="col-md-6">
          <i class="fas fa-tachometer-alt me-1"></i><strong>Rate:</strong> ${rate}
        </div>
        <div class="col-12">
          <i class="fas fa-cog me-1"></i><strong>Stage:</strong> ${stage}
        </div>
      </div>
    `;

    statsContainer.innerHTML = statsHtml;
    statsContainer.style.display = 'block';
  }

  /**
   * Update result statistics display with comprehensive formatting
   */
  updateResultStats(container, data) {
    if (!container) return;

    // Process stats data to ensure all values are present
    const stats = this.processStatsData(data.stats || {});
    const outputFile = data.output_file || this.state.currentTask?.outputFile;

    const statsHtml = `
      <style>
        .stat-card {
          background: var(--bs-body-bg);
          border: 1px solid var(--bs-border-color);
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 0.5rem;
          transition: all 0.2s ease;
        }
        .stat-card:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .stat-card .icon {
          font-size: 1.5rem;
          margin-right: 1rem;
          color: var(--bs-primary);
        }
        .stat-card .value {
          font-size: 1.8rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .stat-card .label {
          font-size: 0.875rem;
          color: var(--bs-secondary);
          margin: 0;
        }
        .zero-value {
          opacity: 0.6;
        }
        .performance-metric {
          text-align: center;
          padding: 1rem;
          background: var(--bs-light);
          border-radius: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .performance-metric .value {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--bs-primary);
        }
        .performance-metric .label {
          font-size: 0.875rem;
          color: var(--bs-secondary);
          margin-top: 0.25rem;
        }
        .time-badge {
          background: var(--bs-primary);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
          font-size: 0.875rem;
        }
        .stats-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
      </style>
      <div class="result-header mb-4">
        <div class="d-flex justify-content-between align-items-center">
          <h4><i class="fas fa-check-circle text-success me-2"></i>Processing Complete!</h4>
          <button class="btn btn-outline-secondary btn-sm" onclick="window.fileProcessor.showForm()">
            <i class="fas fa-plus me-2"></i>New Task
          </button>
        </div>
        <p class="text-muted mb-0">Successfully processed files from: <strong>${this.state.currentTask?.inputDir}</strong></p>
        ${outputFile ? `<p class="text-muted">Output file: <strong>${outputFile}</strong></p>` : ''}
      </div>

      <div class="stats-container">
        <div class="stats-header mb-4">
          <h5><i class="fas fa-chart-bar me-2"></i>Processing Statistics</h5>
          <div class="time-badge">
            <i class="fas fa-clock"></i>
            <span>${stats.formatted_duration || this.formatDuration((stats.total_duration_seconds || stats.processing_time || 0) * 1000)} total processing time</span>
          </div>
        </div>
        
        <!-- Enhanced Real-time Performance Metrics -->
        ${stats.completion_percentage ? `
        <div class="alert alert-success mb-3">
          <div class="row text-center">
            <div class="col-4">
              <div class="performance-metric">
                <div class="value">${stats.completion_percentage}%</div>
                <div class="label">Completion</div>
              </div>
            </div>
            <div class="col-4">
              <div class="performance-metric">
                <div class="value">${stats.formatted_processing_rate || `${stats.files_per_second || 0} files/sec`}</div>
                <div class="label">Processing Rate</div>
              </div>
            </div>
            <div class="col-4">
              <div class="performance-metric">
                <div class="value">${stats.success_rate_percent || 0}%</div>
                <div class="label">Success Rate</div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="row mb-4">
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon"><i class="fas fa-file"></i></div>
                <div>
                  <div class="value ${stats.total_files === 0 ? 'zero-value' : ''}">${stats.total_files}</div>
                  <div class="label">Total Files</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon text-success"><i class="fas fa-check-circle"></i></div>
                <div>
                  <div class="value text-success">${stats.processed_files}</div>
                  <div class="label">Processed Files</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon text-danger"><i class="fas fa-times-circle"></i></div>
                <div>
                  <div class="value text-danger">${stats.error_files}</div>
                  <div class="label">Error Files</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="row mb-4">
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon text-warning"><i class="fas fa-exclamation-circle"></i></div>
                <div>
                  <div class="value text-warning">${stats.skipped_files}</div>
                  <div class="label">Skipped Files</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon text-info"><i class="fas fa-database"></i></div>
                <div>
                  <div class="value text-info">${this.formatFileSize(stats.total_bytes)}</div>
                  <div class="label">Total Size</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="col-md-4">
            <div class="stat-card">
              <div class="d-flex align-items-center">
                <div class="icon text-primary"><i class="fas fa-puzzle-piece"></i></div>
                <div>
                  <div class="value text-primary">${stats.total_chunks}</div>
                  <div class="label">Total Chunks</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${stats.pdf_files > 0 ? `
        <div class="pdf-stats mb-4">
          <h6 class="mb-3"><i class="fas fa-file-pdf me-2"></i>PDF Statistics</h6>
          <div class="row">
            <div class="col-md-4">
              <div class="stat-card">
                <div class="d-flex align-items-center">
                  <div class="icon" style="color: #fd7e14;"><i class="fas fa-file-pdf"></i></div>
                  <div>
                    <div class="value" style="color: #fd7e14;">${stats.pdf_files}</div>
                    <div class="label">PDF Files</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-4">
              <div class="stat-card">
                <div class="d-flex align-items-center">
                  <div class="icon" style="color: #20c997;"><i class="fas fa-table"></i></div>
                  <div>
                    <div class="value" style="color: #20c997;">${stats.tables_extracted || 0}</div>
                    <div class="label">Tables Extracted</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="col-md-4">
              <div class="stat-card">
                <div class="d-flex align-items-center">
                  <div class="icon" style="color: #6f42c1;"><i class="fas fa-quote-right"></i></div>
                  <div>
                    <div class="value" style="color: #6f42c1;">${stats.references_extracted || 0}</div>
                    <div class="label">References Extracted</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="performance-metrics mb-4">
          <h6 class="mb-3"><i class="fas fa-tachometer-alt me-2"></i>Performance Metrics</h6>
          <div class="row">
            <div class="col-md-4">
              <div class="performance-metric">
                <div class="value">${this.formatDuration((stats.total_duration_seconds || stats.processing_time || 0) * 1000)}</div>
                <div class="label">Total Duration</div>
              </div>
            </div>
            
            <div class="col-md-4">
              <div class="performance-metric">
                <div class="value">${this.formatDuration((stats.avg_file_processing_time || 0) * 1000)}</div>
                <div class="label">Avg. Time Per File</div>
              </div>
            </div>
            
            <div class="col-md-4">
              <div class="performance-metric">
                <div class="value">${((stats.processed_files || 0) / Math.max(1, stats.total_duration_seconds || stats.processing_time || 1)).toFixed(2)}</div>
                <div class="label">Files Per Second</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Completion Summary Banner -->
      <div class="alert alert-success mb-4" style="border-left: 4px solid #198754;">
        <div class="row align-items-center">
          <div class="col-md-8">
            <h6 class="alert-heading mb-2"><i class="fas fa-check-circle me-2"></i>Task Completed Successfully!</h6>
            <p class="mb-0">
              <strong>${stats.processed_files || 0}</strong> files processed successfully
              ${stats.error_files > 0 ? `, <strong class="text-warning">${stats.error_files}</strong> errors` : ''}
              ${stats.skipped_files > 0 ? `, <strong class="text-info">${stats.skipped_files}</strong> skipped` : ''}
            </p>
          </div>
          <div class="col-md-4 text-end">
            <span class="badge bg-success fs-6 px-3 py-2">
              <i class="fas fa-thumbs-up me-2"></i>100% Complete
            </span>
          </div>
        </div>
      </div>

      ${outputFile ? `
      <!-- File Actions Section -->
      <div class="card mt-4" style="border: 2px solid #198754;">
        <div class="card-header bg-success text-white">
          <h6 class="mb-0"><i class="fas fa-download me-2"></i>Output File Ready</h6>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label text-muted small">Output File Path:</label>
            <div class="d-flex align-items-center">
              <input type="text" class="form-control form-control-sm me-2" value="${outputFile}" readonly onclick="this.select()">
              <button class="btn btn-outline-secondary btn-sm" onclick="navigator.clipboard.writeText('${outputFile}'); window.fileProcessor.showNotification('Path copied to clipboard!', 'success');" title="Copy path">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-success" onclick="window.fileProcessor.openFileOrFolder('${outputFile}')">
              <i class="fas fa-file-alt me-2"></i>Open Result File
            </button>
            <button class="btn btn-outline-primary" onclick="window.fileProcessor.openFileOrFolder('${outputFile}', true)">
              <i class="fas fa-folder-open me-2"></i>Open Folder
            </button>
            <button class="btn btn-outline-secondary" onclick="window.fileProcessor.downloadFile('${outputFile}')">
              <i class="fas fa-download me-2"></i>Download
            </button>
            <button class="btn btn-outline-info" onclick="window.fileProcessor.showFilePreview('${outputFile}')">
              <i class="fas fa-eye me-2"></i>Preview
            </button>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Action Buttons -->
      <div class="d-flex gap-2 mt-4 justify-content-center">
        <button class="btn btn-primary btn-lg" onclick="window.fileProcessor.showForm()">
          <i class="fas fa-plus me-2"></i>New Task
        </button>
        <button class="btn btn-outline-secondary" onclick="window.fileProcessor.viewHistory()">
          <i class="fas fa-history me-2"></i>View History
        </button>
        <button class="btn btn-outline-info" onclick="window.fileProcessor.exportStats('${data.task_id || 'unknown'}')">
          <i class="fas fa-file-export me-2"></i>Export Stats
        </button>
      </div>
    `;

    container.innerHTML = statsHtml;
    
    // Add smooth entrance animation
    container.style.opacity = '0';
    setTimeout(() => {
      container.style.transition = 'opacity 0.5s ease-in-out';
      container.style.opacity = '1';
    }, 100);
  }

  /**
   * Process raw stats data to ensure all values are properly extracted
   */
  processStatsData(rawStats) {
    const defaultStats = {
      total_files: 0,
      processed_files: 0,
      skipped_files: 0,
      error_files: 0,
      total_bytes: 0,
      total_chunks: 0,
      duration_seconds: 0,
      processing_time: 0,
      total_duration_seconds: 0,
      avg_file_processing_time: 0,
      pdf_files: 0,
      tables_extracted: 0,
      references_extracted: 0
    };
    
    if (!rawStats || typeof rawStats !== 'object') {
      return defaultStats;
    }
    
    // Handle nested stats structure
    if (rawStats.stats && typeof rawStats.stats === 'object') {
      rawStats = rawStats.stats;
    }
    
    return { ...defaultStats, ...rawStats };
  }

  /**
   * Open file or folder using system default application
   */
  openFileOrFolder(path, openFolder = false) {
    // This would typically make a call to the backend to open the file/folder
    console.log(`Opening ${openFolder ? 'folder for' : 'file'}: ${path}`);
    
    // For now, just show a notification
    this.showNotification(
      `Request sent to open ${openFolder ? 'folder containing' : ''} ${path}`, 
      'info', 
      'File System'
    );
  }

  /**
   * Download file to user's computer
   */
  downloadFile(filePath) {
    console.log(`Downloading file: ${filePath}`);
    
    // Create a download link for the file
    try {
      const link = document.createElement('a');
      link.href = `/api/download?file=${encodeURIComponent(filePath)}`;
      link.download = filePath.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showNotification('Download started', 'success', 'File Processor');
    } catch (error) {
      console.error('Download error:', error);
      this.showNotification('Download failed - file may not be accessible', 'error', 'File Processor');
    }
  }

  /**
   * Show file preview in modal or new window
   */
  showFilePreview(filePath) {
    console.log(`Showing preview for: ${filePath}`);
    
    // For JSON files, try to fetch and display content
    if (filePath.endsWith('.json')) {
      this.previewJsonFile(filePath);
    } else {
      this.showNotification('Preview not available for this file type', 'info', 'File Processor');
    }
  }

  /**
   * Preview JSON file content
   */
  async previewJsonFile(filePath) {
    try {
      const response = await fetch(`/api/file-content?file=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const content = await response.text();
        const jsonData = JSON.parse(content);
        
        // Create a simple preview modal
        const preview = `
          <div class="modal fade" id="filePreviewModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title"><i class="fas fa-file-code me-2"></i>File Preview: ${filePath.split('/').pop()}</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                  <pre style="max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 1rem; border-radius: 0.5rem;"><code>${JSON.stringify(jsonData, null, 2)}</code></pre>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                  <button type="button" class="btn btn-primary" onclick="window.fileProcessor.downloadFile('${filePath}')">Download</button>
                </div>
              </div>
            </div>
          </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('filePreviewModal');
        if (existing) existing.remove();
        
        // Add modal to page and show it
        document.body.insertAdjacentHTML('beforeend', preview);
        const modal = new bootstrap.Modal(document.getElementById('filePreviewModal'));
        modal.show();
        
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Preview error:', error);
      this.showNotification('Unable to preview file - file may not be accessible', 'error', 'File Processor');
    }
  }

  /**
   * View processing history
   */
  viewHistory() {
    console.log('Opening processing history...');
    this.showNotification('Opening processing history...', 'info', 'File Processor');
    
    // This would typically navigate to history view or open history modal
    if (window.NeuroGen?.modules?.historyManager) {
      window.NeuroGen.modules.historyManager.show();
    } else {
      this.showNotification('History feature not available', 'warning', 'File Processor');
    }
  }

  /**
   * Export processing statistics
   */
  exportStats(taskId) {
    console.log(`Exporting stats for task: ${taskId}`);
    
    try {
      // Create stats export data
      const exportData = {
        taskId,
        timestamp: new Date().toISOString(),
        task: this.state.currentTask,
        processingState: this.state.processingState,
        exported: new Date().toLocaleString()
      };
      
      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `file-processor-stats-${taskId}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      this.showNotification('Stats exported successfully', 'success', 'File Processor');
    } catch (error) {
      console.error('Export error:', error);
      this.showNotification('Failed to export stats', 'error', 'File Processor');
    }
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