/**
 * Playlist Downloader Module - Optimized Blueprint Implementation
 * 
 * Advanced YouTube playlist downloading module with transcript extraction and comprehensive
 * task management. Fully optimized with centralized configuration and enhanced error handling.
 * 
 * Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced error handling with multiple notification systems
 * - Improved SocketIO integration using TASK_EVENTS
 * - Backend connectivity testing with health checks
 * - Consolidated code with removed redundancies
 * 
 * @module features/playlistDownloader
 * @version 3.1.0 - Optimized with Config Integration
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, SOCKET_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';

// Import DOM utilities from domUtils.js
import { getElement, getElements, getUIElements, toggleElementVisibility } from '../utils/domUtils.js';

// Configuration shorthand
const PLAYLIST_CONFIG = {
  endpoints: API_ENDPOINTS.PLAYLIST,
  blueprint: BLUEPRINT_ROUTES.playlist_downloader,
  constants: CONSTANTS.PLAYLIST_DOWNLOADER || {},
  api: API_CONFIG,
  socket: SOCKET_CONFIG
};

// Import core modules - use dynamic imports with fallbacks for error resilience 
let errorHandler, uiRegistry, eventRegistry, stateManager, historyManager;

// Define progress stages to match server-side stages
const PROGRESS_STAGES = {
  INIT: { name: 'initialization', min: 0, max: 4 },
  VIDEO_IDS: { name: 'retrieving_videos', min: 4, max: 20 },
  TITLES: { name: 'retrieving_titles', min: 20, max: 30 },
  DOWNLOAD: { name: 'downloading_transcripts', min: 30, max: 90 },
  FINALIZE: { name: 'finalizing', min: 90, max: 100 }
};

// Constants
const UI_UPDATE_DEBOUNCE_MS = 100; // Debounce time for UI updates
const MAX_PROGRESS_RATES = 10; // Number of progress rates to keep for averaging
const API_TIMEOUT_MS = 30000; // API request timeout
const PROGRESS_POLL_INTERVAL_MS = 2000; // Status polling interval if websocket fails
const TASK_COMPLETION_DELAY = 250; // Short delay before showing completion UI

// Module state (private)
const state = {
  initialized: false,
  processing: false,
  backendConnected: false,
  currentTaskId: null,
  outputFilePath: null,
  processingStartTime: null,
  isProcessingCancelled: false,
  progressUpdateCount: 0,
  lastProgressTimestamp: null,
  progressRates: [], // For ETA calculation
  pendingRequests: {}, // For tracking API requests that may need cancellation
  socketReconnectAttempts: 0,
  maxSocketReconnects: 5,
  apiRetryCount: 3, // Maximum number of API retry attempts
  apiRetryDelay: 1000, // Base delay for retries in ms
  statusPollInterval: null,
  lastReportedProgress: -1, // Track last reported progress to prevent UI flicker
  progressTracker: null, // Track the progress handler instance
  lastSavedOutputDir: null, // Last used output directory for persistence
  uiElements: {}, // Cache for UI elements
  // Add a completion marker to prevent duplicate completions
  completionState: {
    completed: false,
    completionTime: null,
    error: false,
    cancelled: false
  },
  // Add taskData to persist across functions
  taskData: {},
  // Track UI state
  uiState: {
    isResultShown: false,
    isErrorShown: false,
    isCancelledShown: false,
    isFormShown: false
  },
  // Add completion monitoring
  completionMonitoring: {
    enabled: true,
    timeoutIds: new Set(),
    checkIntervalMs: 10000, // Check every 10 seconds
    maxStuckDurationMs: 120000 // 2 minutes max stuck time
  },
  // A Set to track which playlist completion events have been handled
  completionHandled: new Set(),
  // Track current stage for progress reporting
  currentStage: null,
  stageProgress: 0,
  // Track for absolute and relative paths to match server-side behavior
  pathTypes: {
    isWindowsPath: false,
    isUnixPath: false,
    hasSeparators: false
  }
};

/**
 * Utility function to load dependencies dynamically with fallbacks
 * @returns {Promise<boolean>} Success state
 */
async function loadDependencies() {
  try {
    // Import core modules
    errorHandler = await import('../core/errorHandler.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load errorHandler, using fallback');
        return {
          registerModule: () => {},
          reportError: (error, context) => console.error(`Error in ${context?.module || 'unknown'}: ${error.message}`)
        };
      });

    uiRegistry = await import('../core/uiRegistry.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load uiRegistry, using fallback');
        return {
          registerElements: () => {},
          getElement: (id) => document.getElementById(id)
        };
      });

    eventRegistry = await import('../core/eventRegistry.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load eventRegistry, using fallback');
        return {
          on: () => {},
          emit: () => {},
          off: () => {}
        };
      });

    stateManager = await import('../core/stateManager.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load stateManager, using fallback');
        return {
          setProcessingActive: () => {},
          setCurrentTaskId: () => {},
          getState: () => ({})
        };
      });

    // Import history manager
    historyManager = await import('../features/historyManager.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load historyManager, using fallback');
        return {
          addTaskToHistory: () => {},
          addFileToRecent: () => {},
          getFileNameFromPath: (path) => {
            if (!path) return 'Unknown';
            const parts = path.split(/[\/\\]/);
            return parts[parts.length - 1] || 'Unknown';
          }
        };
      });

    // Import utility modules with fallbacks
    const utils = await import('../utils/utils.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load utils module, using fallback');
        return {
          formatBytes: (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          },
          formatDuration: (seconds) => {
            if (!seconds) return '0s';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
          },
          debounce: (func, wait) => {
            let timeout;
            return function(...args) {
              const context = this;
              clearTimeout(timeout);
              timeout = setTimeout(() => func.apply(context, args), wait);
            };
          }
        };
      });
      
    // Attach utils to window for compatibility
    window.utils = utils;

    const ui = await import('../utils/ui.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load UI module, using fallback');
        return {
          showToast: (title, message, type = 'info') => {
            console.log(`TOAST [${type}]: ${title} - ${message}`);
            try {
              const toastContainer = document.getElementById('toast-container') || 
                (() => {
                  const container = document.createElement('div');
                  container.id = 'toast-container';
                  container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                  document.body.appendChild(container);
                  return container;
                })();
              
              const toast = document.createElement('div');
              toast.className = `toast show bg-${type === 'error' ? 'danger' : type}`;
              toast.setAttribute('role', 'alert');
              toast.innerHTML = `
                <div class="toast-header">
                  <strong class="me-auto">${title}</strong>
                  <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body text-white">
                  ${message}
                </div>
              `;
              
              toastContainer.appendChild(toast);
              setTimeout(() => toast.remove(), 5000);
            } catch (e) {
              console.error('Failed to create fallback toast:', e);
            }
          },
          toggleElementVisibility,
          transitionBetweenElements: (fromElement, toElement) => {
            if (!fromElement || !toElement) return;
            if (fromElement) toggleElementVisibility(fromElement, false);
            if (toElement) toggleElementVisibility(toElement, true);
          },
          updateProgressBarElement: (progressBar, progress) => {
            if (!progressBar) return;
            const percent = Math.round(progress);
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
            progressBar.textContent = `${percent}%`;
          },
          updateProgressStatus: (statusElement, message) => {
            if (!statusElement) return;
            statusElement.textContent = message;
          }
        };
      });

    // Attach UI to window for compatibility
    window.ui = ui;

    const fileHandler = await import('../utils/fileHandler.js')
      .then(m => m.default)
      .catch(() => {
        console.warn('Failed to load fileHandler module, using fallback');
        return {
          browseForDirectory: () => Promise.reject(new Error('File browsing not available')),
          openFile: () => Promise.reject(new Error('File opening not available')),
          openContainingFolder: () => Promise.reject(new Error('Folder opening not available'))
        };
      });

    // Attach fileHandler to window for compatibility
    window.fileHandler = fileHandler;

    // Import progressHandler conditionally
    const progressHandler = await import('../utils/progressHandler.js')
      .then(m => {
        // If the module exports multiple functions, extract them
        const handler = m.default || {};
        const setupTaskProgress = m.setupTaskProgress || handler.setupTaskProgress;
        const trackProgress = m.trackProgress || handler.trackProgress;
        const updateProgressUI = m.updateProgressUI || handler.updateProgressUI;
        const cancelTracking = m.cancelTracking || handler.cancelTracking;
        const createProgressUI = m.createProgressUI || handler.createProgressUI;
        
        return {
          ...handler,
          setupTaskProgress,
          trackProgress,
          updateProgressUI,
          cancelTracking,
          createProgressUI
        };
      })
      .catch(() => {
        console.warn('Failed to load progressHandler module, using fallback');
        return {
          setupTaskProgress: () => ({}),
          trackProgress: () => ({}),
          updateProgressUI: () => {},
          cancelTracking: () => {},
          createProgressUI: () => {}
        };
      });

    // Attach progressHandler to window for compatibility
    window.progressHandler = progressHandler;

    return true;
  } catch (error) {
    console.error('Error loading dependencies:', error);
    return false;
  }
}

/**
 * Playlist Downloader module
 */
const playlistDownloader = {
  /**
   * Initialize file processing module
   * @returns {Promise<boolean>} - Success state
   */
  async initialize() {
    try {
      console.log('Initializing playlist downloader module...');
      
      // Skip if already initialized
      if (state.initialized) {
        console.log('Playlist downloader module already initialized');
        return true;
      }
      
      // Load dependencies first
      await loadDependencies();
      
      // Test backend connectivity and configuration
      await this.testBackendConnectivity();
      
      // Register error handler for the module
      if (errorHandler && typeof errorHandler.registerModule === 'function') {
        errorHandler.registerModule('playlistDownloader', {
          onError: (error, context) => this.handleModuleError(error, context)
        });
      }
      
      // Safety check - if DOM not ready, defer initialization
      if (document.readyState === 'loading') {
        console.log('DOM not ready, deferring initialization');
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => this.initializeAfterDOMReady(), 0);
        });
        return false;
      } else {
        setTimeout(() => this.initializeAfterDOMReady(), 0);
      }
      
      // Register with module system
      this.registerWithModuleSystem();
      
      // Start progress monitoring
      this.startProgressMonitoring();
      
      // Register UI elements with uiRegistry if available
      this.registerUIElements();
      
      // Mark as initialized
      state.initialized = true;
      console.log('✅ Playlist Downloader initialized successfully with config integration');
      
      // Show success notification
      this.showNotification('Playlist Downloader module loaded successfully', 'success');
      
      return true;
    } catch (error) {
      console.error('❌ Playlist Downloader initialization failed:', error);
      this.showNotification('Playlist Downloader initialization failed - some features may be limited', 'warning');
      
      // Report to error handler
      if (window.NeuroGen?.errorHandler) {
        window.NeuroGen.errorHandler.logError({
          module: 'playlistDownloader',
          action: 'initialization',
          error: error.message,
          severity: 'error'
        });
      }
      
      // Allow module to work with limited functionality
      state.initialized = true;
      return false;
    }
  },
  
  /**
   * Handle module errors
   * @param {Error} error - The error that occurred
   * @param {Object} context - Error context information
   */
  handleModuleError(error, context) {
    console.error(`Module error in playlistDownloader (${context.method || 'unknown'}):`, error);
    
    // If we're processing, show error in UI
    if (state.processing) {
      this.showPlaylistError(`An error occurred: ${error.message}`);
    } else {
      // Just show toast notification if not actively processing
      this.showToast('Error', error.message, 'error');
    }
  },

  /**
   * Register UI elements with uiRegistry
   */
  registerUIElements() {
    if (uiRegistry && typeof uiRegistry.registerElements === 'function') {
      uiRegistry.registerElements('playlistDownloader', {
        form: 'playlist-form',
        formContainer: 'playlist-form-container',
        progressContainer: 'playlist-progress-container',
        resultsContainer: 'playlist-results-container',
        errorContainer: 'playlist-error-container',
        progressBar: 'playlist-progress-bar',
        progressStatus: 'playlist-progress-status',
        progressStats: 'playlist-progress-stats',
        submitButton: 'playlist-submit-btn',
        cancelButton: 'playlist-cancel-btn',
        newTaskButton: 'playlist-new-task-btn'
      });
    }
  },

  /**
   * Register with global module system if available
   */
  registerWithModuleSystem() {
    if (window.moduleRegistry?.register) {
      window.moduleRegistry.register('playlistDownloader', {
        name: 'playlistDownloader',
        version: '1.0.0',
        initialize: this.initialize.bind(this),
        cleanup: this.cleanup.bind(this),
        handlePlaylistSubmit: this.handlePlaylistSubmit.bind(this),
        handlePlaylistCompletion: this.handlePlaylistCompletion.bind(this),
        cancelDownload: this.cancelDownload.bind(this),
        isInitialized: () => state.initialized
      });
      
      console.log('Registered with module registry');
    }
  },

  /**
   * Second phase of initialization after DOM is ready
   * @returns {Promise<boolean>} - Success state
   */
  async initializeAfterDOMReady() {
    try {
      console.log('Completing playlist downloader initialization after DOM ready');
      
      // Initialize progressHandler if available and not already initialized
      if (window.progressHandler && typeof window.progressHandler.initialize === 'function' && 
          !window.progressHandler.initialized) {
        await window.progressHandler.initialize();
        console.log('Progress handler initialized');
      }
      
      // Register event handlers
      this.registerEventHandlers();
      
      // Set up direct event handlers for UI elements
      this.setupDirectEventHandlers();
      
      // Initialize input/output relationship for better UX
      this.initializeInputOutputRelationship();
      
      // Check for ongoing tasks from previous sessions
      this.checkForOngoingTasks();
      
      // Create progress UI if needed but not present
      this.ensureProgressUIElements();
      
      console.log('Playlist downloader module fully initialized');
      return true;
    } catch (error) {
      console.error('Error in post-DOM initialization:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'initializeAfterDOMReady',
          context: 'DOM initialization'
        });
      }
      return false;
    }
  },

  /**
   * Register event handlers with event registry
   */
  registerEventHandlers() {
    try {
      if (eventRegistry && typeof eventRegistry.on === 'function') {
        // Socket.IO event handlers
        eventRegistry.on('socket.progress_update', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.processStatusUpdate(data);
          }
        });
        
        eventRegistry.on('socket.playlist_progress', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.processStatusUpdate(data);
          }
        });
        
        eventRegistry.on('socket.task_completed', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handlePlaylistCompletion(data);
          }
        });
        
        eventRegistry.on('socket.playlist_completed', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handlePlaylistCompletion(data);
          }
        });
        
        eventRegistry.on('socket.task_error', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handleTaskError(data);
          }
        });
        
        eventRegistry.on('socket.playlist_error', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handleTaskError(data);
          }
        });
        
        eventRegistry.on('socket.task_cancelled', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handleTaskCancelled(data);
          }
        });
        
        eventRegistry.on('socket.playlist_cancelled', (data) => {
          if (data?.task_id === state.currentTaskId) {
            this.handleTaskCancelled(data);
          }
        });
        
        // Socket connection/disconnection events
        eventRegistry.on('socket.connected', () => {
          this.handleSocketConnected();
        });
        
        eventRegistry.on('socket.disconnected', () => {
          this.handleSocketDisconnected();
        });
        
        // App-specific events
        eventRegistry.on('playlist.processing.resume', (data) => {
          if (data?.task_id && !state.currentTaskId) {
            this.resumeTaskProcessing(data.task_id);
          }
        });
        
        console.log('Event handlers registered with event registry');
      } else {
        console.warn('Event registry not available for registering events');
      }
    } catch (error) {
      console.error('Error registering event handlers:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'registerEventHandlers',
          context: 'event registration'
        });
      }
    }
  },

  /**
   * Handle socket connected event
   */
  handleSocketConnected() {
    console.log('Socket connected, checking for ongoing tasks');
    
    // Request status update for ongoing task
    if (state.currentTaskId && state.processing) {
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: state.currentTaskId });
      }
    }
    
    // Reset reconnect attempts
    state.socketReconnectAttempts = 0;
  },

  /**
   * Handle socket disconnected event
   */
  handleSocketDisconnected() {
    console.warn('Socket disconnected');
    
    // Start polling if we have an active task
    if (state.currentTaskId && state.processing) {
      this.startStatusPolling(state.currentTaskId);
    }
  },

  /**
   * Set up direct event handlers for UI elements
   */
  setupDirectEventHandlers() {
    try {
      console.log('Setting up direct event handlers');
      
      // Form submission handler
      const form = getElement('playlist-form');
      if (form) {
        // Remove any existing handlers to avoid duplicates
        const newForm = form.cloneNode(true);
        if (form.parentNode) {
          form.parentNode.replaceChild(newForm, form);
        }
        
        // Add the submit handler
        newForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handlePlaylistSubmit(e);
        });
        
        console.log('Form submission handler registered');
      } else {
        console.warn('Playlist form element not found');
      }
      
      // Add URL button handler
      const addUrlBtn = getElement('add-playlist-btn');
      if (addUrlBtn) {
        addUrlBtn.addEventListener('click', this.addPlaylistField.bind(this));
        console.log('Add URL button handler registered');
      }
      
      // Cancel button handler
      const cancelBtn = getElement('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', this.handleCancelButtonClick.bind(this));
        console.log('Cancel button handler registered');
      }
      
      // New task button handler
      const newTaskBtn = getElement('playlist-new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
        console.log('New task button handler registered');
      }
      
      // Open output file button handler
      const openBtn = getElement('open-playlist-json');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          const outputFile = openBtn.getAttribute('data-output-file');
          if (outputFile) {
            this.openFileOrFolder(outputFile);
          }
        });
        console.log('Open button handler registered');
      }
      
      // Browse button handler if available
      const browseBtn = getElement('playlist-browse-btn');
      if (browseBtn && window.fileHandler && typeof window.fileHandler.browseForDirectory === 'function') {
        browseBtn.addEventListener('click', () => {
          this.handleBrowseClick();
        });
        console.log('Browse button handler registered');
      }
      
      // Remove URL button delegation handler
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-url') || e.target.closest('.remove-url')) {
          const button = e.target.classList.contains('remove-url') ? 
                       e.target : e.target.closest('.remove-url');
          const urlContainer = button.closest('.input-group');
          if (urlContainer) {
            urlContainer.remove();
          }
        }
      });
      
      console.log('Direct event handlers setup complete');
    } catch (error) {
      console.error('Error setting up direct event handlers:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'setupDirectEventHandlers',
          context: 'event registration'
        });
      }
    }
  },

  /**
   * Handle browse button click
   */
  async handleBrowseClick() {
    try {
      if (!window.fileHandler || typeof window.fileHandler.browseForDirectory !== 'function') {
        console.warn('File handler not available for browsing');
        return;
      }
      
      const result = await window.fileHandler.browseForDirectory();
      if (result && result.path) {
        const rootDirField = getElement('playlist-root');
        if (rootDirField) {
          rootDirField.value = result.path;
          
          // Save this for future use
          state.lastSavedOutputDir = result.path;
          localStorage.setItem('lastPlaylistOutputDir', result.path);
          
          // Determine path type
          this.analyzePathType(result.path);
          
          // Trigger change event to update output suggestion
          const event = new Event('change', { bubbles: true });
          rootDirField.dispatchEvent(event);
        }
      }
    } catch (error) {
      console.error('Error browsing for directory:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handleBrowseClick',
          context: 'directory browsing'
        });
      }
      this.showToast('Error', 'Failed to browse for directory', 'error');
    }
  },

  /**
   * Analyze path type to match server-side path resolution
   * @param {string} path - Path to analyze
   */
  analyzePathType(path) {
    // Reset path types
    state.pathTypes = {
      isWindowsPath: false,
      isUnixPath: false,
      hasSeparators: false
    };
    
    if (!path) return;
    
    // Check for Windows path with drive letter
    if (/^[A-Za-z]:/.test(path)) {
      state.pathTypes.isWindowsPath = true;
    }
    
    // Check for Unix absolute path
    if (path.startsWith('/')) {
      state.pathTypes.isUnixPath = true;
    }
    
    // Check for path with separators
    if (path.includes('/') || path.includes('\\')) {
      state.pathTypes.hasSeparators = true;
    }
    
    console.log('Path type analysis:', state.pathTypes);
  },

  /**
   * Initialize input/output relationship for auto-suggestion
   */
  initializeInputOutputRelationship() {
    try {
      const rootDirField = getElement('playlist-root');
      const outputFileField = getElement('playlist-output');
      
      if (!rootDirField || !outputFileField) {
        console.warn('Root dir or output file fields not found');
        return;
      }
      
      // Auto-suggest output filename based on input directory
      const inputHandler = function() {
        if (this.value.trim() && !outputFileField.value.trim()) {
          // Extract folder name for output suggestion
          const dirPath = this.value.trim();
          const folderName = dirPath.split(/[/\\]/).pop();
          
          if (folderName) {
            // Set suggested output name
            outputFileField.value = `${folderName}_playlists`;
            
            // Add visual feedback
            outputFileField.classList.add('bg-light');
            setTimeout(() => outputFileField.classList.remove('bg-light'), 1500);
          }
        }
        
        // Analyze path type when changed
        playlistDownloader.analyzePathType(this.value.trim());
      };
      
      // Check for last saved directory and populate if available
      const lastDir = localStorage.getItem('lastPlaylistOutputDir');
      if (lastDir && !rootDirField.value) {
        rootDirField.value = lastDir;
        state.lastSavedOutputDir = lastDir;
        
        // Analyze path type
        this.analyzePathType(lastDir);
        
        // Also trigger the change event to populate the output field
        const event = new Event('change', { bubbles: true });
        rootDirField.dispatchEvent(event);
      }
      
      // Use debounced input event for more responsive feedback
      if (window.utils && window.utils.debounce) {
        rootDirField.addEventListener('input', window.utils.debounce(inputHandler, UI_UPDATE_DEBOUNCE_MS));
      } else {
        rootDirField.addEventListener('input', inputHandler);
      }
      rootDirField.addEventListener('change', inputHandler);
      
      // Also analyze output file path changes
      if (window.utils && window.utils.debounce) {
        outputFileField.addEventListener('input', window.utils.debounce((e) => {
          this.analyzePathType(e.target.value.trim());
        }, UI_UPDATE_DEBOUNCE_MS));
      }
      
      console.log('Input/output relationship initialized');
    } catch (error) {
      console.error('Error initializing input/output relationship:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'initializeInputOutputRelationship',
          context: 'UI initialization'
        });
      }
    }
  },

  /**
   * Check for ongoing tasks from previous sessions
   */
  checkForOngoingTasks() {
    try {
      const taskId = sessionStorage.getItem('ongoingTaskId');
      const taskType = sessionStorage.getItem('ongoingTaskType');
      
      if (taskId && taskType === 'playlist') {
        console.log(`Found ongoing playlist task: ${taskId}`);
        
        // Set current task ID
        state.currentTaskId = taskId;
        state.processing = true;
        state.outputFilePath = sessionStorage.getItem('outputFile');
        
        // Get task start time if available
        const startTimeStr = sessionStorage.getItem('taskStartTime');
        if (startTimeStr) {
          state.processingStartTime = parseInt(startTimeStr, 10);
        } else {
          state.processingStartTime = Date.now();
        }
        
        // Show progress UI
        this.showProgress();
        
        // Set up progress tracking using progressHandler
        const progress = window.progressHandler && typeof window.progressHandler.trackProgress === 'function' ? 
          window.progressHandler.trackProgress(taskId, {
            elementPrefix: 'playlist',
            taskType: 'playlist',
            saveToSessionStorage: true,
            outputFile: state.outputFilePath
          }) : null;
        
        // Store the progress handler in state
        state.progressTracker = progress;
        
        // Emit event to trigger status polling
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('playlist.processing.resume', { task_id: taskId });
        }
        
        // Start manual status polling as a fallback
        this.startStatusPolling(taskId);
        
        // Update state manager
        if (stateManager && typeof stateManager.setProcessingActive === 'function') {
          stateManager.setProcessingActive(true);
        }
        
        if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
          stateManager.setCurrentTaskId(taskId);
        }
        
        // Request initial status update
        if (window.socket && typeof window.socket.emit === 'function') {
          window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
        }
      }
    } catch (error) {
      console.error('Error checking for ongoing tasks:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'checkForOngoingTasks',
          context: 'task resumption'
        });
      }
    }
  },

  /**
   * Resume task processing
   * @param {string} taskId - Task ID to resume
   */
  resumeTaskProcessing(taskId) {
    try {
      if (!taskId) return;
      
      console.log(`Resuming task processing for ${taskId}`);
      
      // Set current task ID
      state.currentTaskId = taskId;
      state.processing = true;
      
      // Show progress UI
      this.showProgress();
      
      // Set up progress tracking
      this.setupProgressTracking(taskId);
      
      // Setup direct socket listeners as fallback
      this.setupDirectSocketListeners(taskId);
      
      // Start status polling as another fallback
      this.startStatusPolling(taskId);
      
      // Request initial status update
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
      }
    } catch (error) {
      console.error('Error resuming task processing:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'resumeTaskProcessing',
          context: 'task resumption',
          taskId: taskId
        });
      }
    }
  },

  /**
   * Ensure all progress UI elements exist
   */
  ensureProgressUIElements() {
    try {
      // Check if progress container exists
      const progressContainer = getElement('playlist-progress-container');
      if (!progressContainer) {
        console.warn('Progress container not found in DOM');
        return;
      }
      
      // Check for progress bar
      const progressBar = getElement('playlist-progress-bar');
      if (!progressBar) {
        // Create progress UI elements if they don't exist
        console.log('Creating progress UI elements');
        if (window.progressHandler && typeof window.progressHandler.createProgressUI === 'function') {
          const progressUI = window.progressHandler.createProgressUI('playlist-progress-container', 'playlist');
          if (progressUI) {
            console.log('Progress UI created successfully');
          }
        } else {
          console.warn('createProgressUI function not available');
        }
      } else {
        console.log('Progress UI elements already exist');
      }
    } catch (error) {
      console.error('Error ensuring progress UI elements:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'ensureProgressUIElements',
          context: 'UI initialization'
        });
      }
    }
  },

  /**
   * Start progress monitoring to detect stuck progress
   */
  startProgressMonitoring() {
    console.log('Starting progress monitoring');
    
    // Set up a timer to check for stuck progress at 5%
    const checkForStuckProgress = () => {
      // Only check if we're processing and not already completed
      if (!state.processing || state.completionState.completed) {
        return;
      }
      
      // Check if progress is stuck at a low value for too long
      const now = Date.now();
      const lastUpdateTime = state.lastProgressTimestamp || state.processingStartTime || now;
      const timeSinceLastUpdate = now - lastUpdateTime;
      
      // If we've been stuck at a low progress for too long, try to recover
      if (state.lastReportedProgress > 0 && 
          state.lastReportedProgress < 15 && 
          timeSinceLastUpdate > 30000) { // 30 seconds stuck at a low value
        
        console.warn(`Progress appears stuck at ${state.lastReportedProgress}% for ${Math.round(timeSinceLastUpdate / 1000)}s`);
        
        // Force a status update request
        if (state.currentTaskId) {
          this.requestTaskStatus(state.currentTaskId);
        }
      }
    };
    
    // Set up a timer to check progress completion when progress is high
    const checkHighProgressCompletion = () => {
      // Only check if we're processing and not already completed
      if (!state.processing || state.completionState.completed) {
        return;
      }
      
      // Check if progress is high but not yet marked as complete
      if (state.lastReportedProgress >= 98) {
        const now = Date.now();
        const lastUpdateTime = state.lastProgressTimestamp || state.processingStartTime || now;
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // If we've been at high progress for a while, assume it's done
        if (timeSinceLastUpdate > 10000) { // 10 seconds at high progress
          console.log('High progress detected for extended period, assuming completion');
          
          // Create a completion data object
          const completionData = {
            task_id: state.currentTaskId,
            status: 'completed',
            progress: 100,
            message: 'Processing completed',
            output_file: state.outputFilePath
          };
          
          // Force completion
          this.handlePlaylistCompletion(completionData);
        }
      }
    };
    
    // Set up a timer to check overall task completion
    const checkTaskCompletion = () => {
      // Only check if we're processing and not already completed
      if (!state.processing || state.completionState.completed) {
        return;
      }
      
      // Check if the task has been running for too long
      const now = Date.now();
      const taskRunTime = now - (state.processingStartTime || now);
      
      // If the task has been running for over 1 hour, check if it's still active
      if (taskRunTime > 3600000) { // 1 hour
        console.warn(`Task has been running for ${Math.round(taskRunTime / 60000)} minutes`);
        
        // Request a status update to see if it's still active
        if (state.currentTaskId) {
          this.requestTaskStatus(state.currentTaskId);
        }
      }
    };
    
    // Set timers to run these checks periodically
    setInterval(checkForStuckProgress, 15000); // Every 15 seconds
    setInterval(checkHighProgressCompletion, 5000); // Every 5 seconds
    setInterval(checkTaskCompletion, 60000); // Every minute
    
    return true;
  },

  /**
   * Add a new playlist URL field
   */
  addPlaylistField() {
    const container = getElement('playlist-urls-container');
    if (!container) return;
    
    const templateHtml = `
      <div class="input-group mb-2">
        <input type="url" class="form-control playlist-url" placeholder="Enter YouTube Playlist URL" required>
        <button type="button" class="btn btn-outline-danger remove-url">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    // Create a temporary div to hold the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateHtml.trim();
    
    // Add the new field to the container
    container.appendChild(tempDiv.firstChild);
  },

  /**
   * Get playlist URLs from input fields
   * @returns {Array<string>} - Array of playlist URLs
   */
  getPlaylistURLs() {
    const urlInputs = getElements('.playlist-url');
    const urls = [];
    
    urlInputs.forEach(input => {
      const url = input.value.trim();
      if (url) {
        urls.push(url);
      }
    });
    
    return urls;
  },

  /**
   * Validate root directory
   * @returns {string} - Validated directory path
   */
  validateRootDirectory() {
    const rootDirInput = getElement('playlist-root');
    if (!rootDirInput) {
      throw new Error('Root directory input not found');
    }
    
    const dir = rootDirInput.value.trim();
    if (!dir) {
      throw new Error('Please enter a root directory');
    }
    
    // Save this for future use
    state.lastSavedOutputDir = dir;
    localStorage.setItem('lastPlaylistOutputDir', dir);
    
    // Analyze path type
    this.analyzePathType(dir);
    
    return dir;
  },

  /**
   * Resolve output file path to match server-side behavior
   * @param {string} outputFile - Output filename
   * @param {string} rootDirectory - Root directory
   * @returns {string} - Sanitized output file path
   */
  resolveOutputFilePath(outputFile, rootDirectory) {
    if (!outputFile) {
      return rootDirectory ? `${rootDirectory}/playlists.json` : 'playlists.json';
    }
    
    // Check if it already has a .json extension
    const hasExtension = outputFile.toLowerCase().endsWith('.json');
    
    // CASE 1: Complete Windows path with drive letter
    if (/^[A-Za-z]:/.test(outputFile)) {
      // If it's a complete path with directory, use as-is
      if (outputFile.includes('\\') || outputFile.includes('/')) {
        return hasExtension ? outputFile : `${outputFile}.json`;
      }
    }
    
    // CASE 2: Unix absolute path
    if (outputFile.startsWith('/')) {
      return hasExtension ? outputFile : `${outputFile}.json`;
    }
    
    // CASE 3: Path with separators but not absolute
    if (outputFile.includes('\\') || outputFile.includes('/')) {
      // Extract just the filename to avoid path confusion
      const parts = outputFile.split(/[\/\\]/);
      const filename = parts[parts.length - 1];
      
      // Ensure it has .json extension
      const finalFilename = hasExtension ? filename : `${filename}.json`;
      
      // Join with root directory
      return `${rootDirectory}/${finalFilename}`;
    }
    
    // CASE 4: Just a filename
    const finalFilename = hasExtension ? outputFile : `${outputFile}.json`;
    return `${rootDirectory}/${finalFilename}`;
  },

  /**
   * Initialize progress bar to exactly 0% to fix the 5% stuck issue
   */
  explicitlyInitializeProgressToZero() {
    const progressBar = getElement('playlist-progress-bar');
    if (progressBar) {
      progressBar.style.width = '0%';
      progressBar.setAttribute('aria-valuenow', 0);
      progressBar.textContent = '0%';
      
      // Make sure progress bar has the right styling
      this.initializeProgressBarStyling(progressBar);
    }
    
    // Reset the progress state
    state.lastReportedProgress = 0;
    state.progressUpdateCount = 0;
    
    // Set stage to initialization
    state.currentStage = PROGRESS_STAGES.INIT.name;
    state.stageProgress = 0;
  },

  /**
   * Initialize progress bar styling
   * @param {HTMLElement} progressBar - Progress bar element
   */
  initializeProgressBarStyling(progressBar) {
    if (!progressBar) {
      progressBar = getElement('playlist-progress-bar');
      if (!progressBar) return;
    }
    
    // Set initial styling
    progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-success');
    progressBar.classList.add('bg-primary');
    
    // Make sure transitions are applied
    progressBar.style.transition = 'width 0.5s ease-in-out';
  },

  /**
   * Update progress based on current stage to match server-side progress calculation
   * @param {string} stage - Current stage name
   * @param {number} current - Current progress in this stage
   * @param {number} total - Total items in this stage
   * @returns {number} - Calculated overall progress percentage
   */
  calculateStageProgress(stage, current, total) {
    // Find the stage configuration
    let stageConfig = null;
    for (const [key, config] of Object.entries(PROGRESS_STAGES)) {
      if (config.name === stage) {
        stageConfig = config;
        break;
      }
    }
    
    // If stage not found, use the provided progress directly
    if (!stageConfig) {
      return Math.min(100, Math.max(0, current));
    }
    
    // Calculate stage progress (0-1 ratio)
    const stageProgress = total > 0 ? current / total : 0;
    
    // Calculate absolute progress within the stage's range
    const stageRange = stageConfig.max - stageConfig.min;
    const calculatedProgress = stageConfig.min + (stageProgress * stageRange);
    
    // Update stage tracking
    state.currentStage = stage;
    state.stageProgress = stageProgress;
    
    // Return calculated progress, ensuring it's within bounds
    return Math.min(100, Math.max(0, calculatedProgress));
  },

  /**
   * Handle form submission
   * @param {Event} e - Submit event
   */
  async handlePlaylistSubmit(e) {
    if (e) {
      e.preventDefault();
    }
    
    console.log('Playlist form submitted');
    
    // Get form elements
    const urlsContainer = getElement('playlist-urls-container');
    const rootDirInput = getElement('playlist-root');
    const outputFileInput = getElement('playlist-output');
    const submitBtn = getElement('playlist-submit-btn');
    
    try {
      // Validate inputs
      if (!urlsContainer || !rootDirInput || !outputFileInput) {
        throw new Error('Form elements not found');
      }
      
      // Get playlist URLs
      const playlistURLs = this.getPlaylistURLs();
      if (playlistURLs.length === 0) {
        throw new Error('Please enter at least one playlist URL');
      }
      
      // Validate root directory
      const rootDir = this.validateRootDirectory();
      if (!rootDir) {
        throw new Error('Please enter a root directory');
      }
      
      // Validate output file
      const outputFile = outputFileInput.value.trim();
      if (!outputFile) {
        throw new Error('Please enter an output filename');
      }
      
      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
      }
      
      // Resolve output file path in a way that matches the server-side behavior
      const resolvedOutput = this.resolveOutputFilePath(outputFile, rootDir);
      
      // Show progress UI immediately
      this.showProgress();
      
      // CRITICAL FIX: Initialize progress to exactly 0%
      this.explicitlyInitializeProgressToZero();
      
      try {
        // Send API request to start download using centralized configuration
        const response = await fetch(PLAYLIST_CONFIG.endpoints.START, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': localStorage.getItem('api_key') || ''
          },
          body: JSON.stringify({
            playlists: playlistURLs,
            root_directory: rootDir,
            output_file: resolvedOutput
          }),
          timeout: PLAYLIST_CONFIG.api?.API_TIMEOUT || API_TIMEOUT_MS
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Network error' }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('API response:', result);
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Setup download task with returned task ID
        await this.setupDownloadTask(result.task_id, result.output_file || resolvedOutput);
        
        this.showNotification('Your playlists are being downloaded', 'info', 'Download Started');
        
      } catch (apiError) {
        console.error('API error:', apiError);
        this.showPlaylistError(`API Error: ${apiError.message}`);
        
        // Reset button state
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
        }
        
        // Show form again
        this.showPlaylistForm();
      }
    } catch (error) {
      console.error('Form submission error:', error);
      this.showPlaylistError(error.message);
      
      // Reset button state
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
    }
  },

  /**
   * Setup download task with task ID
   * @param {string} taskId - Task ID from server
   * @param {string} outputFile - Output file path
   */
  async setupDownloadTask(taskId, outputFile) {
    console.log(`Setting up download task: ${taskId}, output: ${outputFile}`);
    
    // Store task ID and output path
    state.currentTaskId = taskId;
    window.currentTaskId = taskId; // For compatibility with other modules
    state.outputFilePath = outputFile;
    
    // Set initial state
    state.processing = true;
    state.processingStartTime = Date.now();
    state.progressUpdateCount = 0;
    state.lastProgressTimestamp = Date.now();
    
    // Reset completion state
    state.completionState = {
      completed: false,
      error: false,
      cancelled: false
    };
    
    // Reset progress rates
    state.progressRates = [];
    
    // Save to session storage for persistence across page reloads
    sessionStorage.setItem('ongoingTaskId', taskId);
    sessionStorage.setItem('ongoingTaskType', 'playlist');
    sessionStorage.setItem('outputFile', outputFile);
    sessionStorage.setItem('taskStartTime', Date.now().toString());
    
    // Update state manager
    if (stateManager && typeof stateManager.setProcessingActive === 'function') {
      stateManager.setProcessingActive(true, taskId);
    }
    
    if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
      stateManager.setCurrentTaskId(taskId);
    }
    
    // Setup progress tracking using the imported setupTaskProgress function
    let taskProgress = null;
    if (window.progressHandler && typeof window.progressHandler.setupTaskProgress === 'function') {
      taskProgress = window.progressHandler.setupTaskProgress(taskId, {
        elementPrefix: 'playlist',
        taskType: 'playlist',
        saveToSessionStorage: true,
        outputFile: outputFile
      });
    }
    
    state.progressTracker = taskProgress;
    
    // CRITICAL FIX: Set up direct Socket.IO listeners as backup
    this.setupDirectSocketListeners(taskId);
    
    // Start status polling as a fallback
    this.startStatusPolling(taskId);
    
    // Return success
    return true;
  },

  /**
   * Setup progress tracking for a task
   * @param {string} taskId - Task ID
   */
  setupProgressTracking(taskId) {
    if (!taskId) {
      console.warn('Cannot setup progress tracking without task ID');
      return;
    }
    
    console.log(`Setting up progress tracking for task: ${taskId}`);
    
    try {
      // Use the imported setupTaskProgress function to set up the task
      if (window.progressHandler && typeof window.progressHandler.setupTaskProgress === 'function') {
        state.progressTracker = window.progressHandler.setupTaskProgress(taskId, {
          elementPrefix: 'playlist',
          taskType: 'playlist',
          saveToSessionStorage: true,
          outputFile: state.outputFilePath
        });
      }
      
      console.log('Progress tracking setup complete');
    } catch (err) {
      console.warn('Error setting up progress tracking:', err);
      
      // Fallback to direct socket listeners
      this.setupDirectSocketListeners(taskId);
      
      // Start polling as fallback
      this.startStatusPolling(taskId);
    }
    
    // Set up completion monitoring
    this.setupCompletionMonitoring(taskId);
  },

  /**
   * Setup direct Socket.IO listeners
   * @param {string} taskId - Task ID
   */
  setupDirectSocketListeners(taskId) {
    if (!window.socket) {
      console.warn('Socket.IO not available for direct listeners');
      return;
    }
    
    try {
      console.log('Setting up direct Socket.IO listeners');
      
      // Remove existing listeners to prevent duplicates
      const events = [
        'progress_update', 'task_completed', 'task_error',
        'playlist_completed', 'playlist_error', 'playlist_cancelled'
      ];
      
      events.forEach(event => window.socket.off(event));
      
      // Progress update events
      window.socket.on('progress_update', (data) => {
        if (data && data.task_id === taskId) {
          this.processStatusUpdate(data);
        }
      });
      
      window.socket.on('playlist_progress', (data) => {
        if (data && data.task_id === taskId) {
          this.processStatusUpdate(data);
        }
      });
      
      // Completion events
      window.socket.on('task_completed', (data) => {
        if (data && data.task_id === taskId) {
          this.handlePlaylistCompletion(data);
        }
      });
      
      window.socket.on('playlist_completed', (data) => {
        if (data && data.task_id === taskId) {
          this.handlePlaylistCompletion(data);
        }
      });
      
      // Error events
      window.socket.on('task_error', (data) => {
        if (data && data.task_id === taskId) {
          this.handleTaskError(data);
        }
      });
      
      window.socket.on('playlist_error', (data) => {
        if (data && data.task_id === taskId) {
          this.handleTaskError(data);
        }
      });
      
      // Cancellation events
      window.socket.on('task_cancelled', (data) => {
        if (data && data.task_id === taskId) {
          this.handleTaskCancelled(data);
        }
      });
      
      window.socket.on('playlist_cancelled', (data) => {
        if (data && data.task_id === taskId) {
          this.handleTaskCancelled(data);
        }
      });
      
      // Request initial status
      window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
      
      console.log('Direct Socket.IO listeners setup complete');
    } catch (error) {
      console.error('Error setting up Socket.IO listeners:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'setupDirectSocketListeners',
          context: 'socket setup',
          taskId: taskId
        });
      }
    }
  },

  /**
   * Start status polling as a fallback
   * @param {string} taskId - Task ID
   */
  startStatusPolling(taskId) {
    if (!taskId) return;
    
    // Clear any existing interval
    if (state.statusPollInterval) {
      clearInterval(state.statusPollInterval);
      state.statusPollInterval = null;
    }
    
    console.log(`Starting status polling for task: ${taskId}`);
    
    // Create a new polling interval
    state.statusPollInterval = setInterval(() => {
      // Skip if socket is connected (prefer socket updates)
      if (window.socket && window.socket.connected) {
        return;
      }
      
      // Skip if processing is canceled or completed
      if (!state.processing || state.completionState.completed) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
        return;
      }
      
      // Request status update
      this.requestTaskStatus(taskId);
    }, PROGRESS_POLL_INTERVAL_MS);
  },

  /**
   * Request task status from server
   * @param {string} taskId - Task ID
   */
  async requestTaskStatus(taskId) {
    if (!taskId) return;
    
    try {
      // Use socket if available
      if (window.socket && window.socket.connected) {
        window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
        return;
      }
      
      // Otherwise, use centralized configuration
      const statusEndpoint = PLAYLIST_CONFIG.endpoints.STATUS.replace(':taskId', taskId);
      fetch(statusEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        timeout: 5000
      })
        .then(response => response.json())
        .then(data => {
          // Process status update
          if (data) {
            this.processStatusUpdate(data);
          }
          
          // Remove from pending requests
          delete state.pendingRequests[taskId];
        })
        .catch(error => {
          if (error.name !== 'AbortError') {
            console.warn(`Error fetching task status: ${error.message}`);
          }
          // Remove from pending requests
          delete state.pendingRequests[taskId];
        });
    } catch (error) {
      console.error('Error requesting task status:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'requestTaskStatus',
          context: 'API request',
          taskId: taskId
        });
      }
    }
  },

  /**
   * Set up completion monitoring
   * @param {string} taskId - Task ID
   */
  setupCompletionMonitoring(taskId) {
    if (!taskId || !state.completionMonitoring.enabled) return;
    
    // Clear previous monitoring
    this.clearCompletionMonitoring();
    
    console.log(`Setting up completion monitoring for task: ${taskId}`);
    
    // Create a monitoring function
    const monitorCompletion = () => {
      // Skip if task is already completed or cancelled
      if (state.completionState.completed || 
          state.completionState.error || 
          state.completionState.cancelled || 
          !state.processing) {
        this.clearCompletionMonitoring();
        return;
      }
      
      // Check for stuck progress
      const currentTime = Date.now();
      const timeSinceLastUpdate = state.lastProgressTimestamp ? 
                                (currentTime - state.lastProgressTimestamp) : 0;
      
      // If no updates for a long time, check if task is complete
      if (timeSinceLastUpdate > state.completionMonitoring.maxStuckDurationMs) {
        console.log(`No progress updates for ${Math.round(timeSinceLastUpdate/1000)}s, checking completion status...`);
        
        // Request current status
        this.requestTaskStatus(taskId);
        
        // If progress is high, task might be complete
        if (state.lastReportedProgress >= 95) {
          console.log('High progress detected, task may be complete');
          
          // Force a check after a short delay
          setTimeout(() => {
            // If still not marked as complete after check, force completion
            if (!state.completionState.completed && state.lastReportedProgress >= 95) {
              console.log('Forcing completion based on high progress');
              
              // Create a minimal completion data object
              const completionData = {
                task_id: taskId,
                status: 'completed',
                progress: 100,
                output_file: state.outputFilePath,
                message: 'Task completed (detected by monitoring)'
              };
              
              this.handlePlaylistCompletion(completionData);
            }
          }, 5000);
        }
      }
      
      // Schedule next check
      const timeoutId = setTimeout(monitorCompletion, state.completionMonitoring.checkIntervalMs);
      state.completionMonitoring.timeoutIds.add(timeoutId);
    };
    
    // Start monitoring
    const timeoutId = setTimeout(monitorCompletion, state.completionMonitoring.checkIntervalMs);
    state.completionMonitoring.timeoutIds.add(timeoutId);
  },

  /**
   * Clear completion monitoring timeouts
   */
  clearCompletionMonitoring() {
    for (const timeoutId of state.completionMonitoring.timeoutIds) {
      clearTimeout(timeoutId);
    }
    state.completionMonitoring.timeoutIds.clear();
  },

  /**
   * Process a status update from server
   * @param {Object} data - Status update data
   */
  processStatusUpdate(data) {
    try {
      // Validate the update data
      if (!data || !data.task_id || data.task_id !== state.currentTaskId) {
        return;
      }
      
      // Skip if task already completed
      if (state.completionState.completed) {
        return;
      }
      
      console.log(`Processing status update for task ${data.task_id}: ${data.progress}%`);
      
      // Update tracking information
      state.lastProgressTimestamp = Date.now();
      state.progressUpdateCount++;
      
      // Update stage information if available
      if (data.details && data.details.current_stage) {
        state.currentStage = data.details.current_stage;
        state.stageProgress = data.details.stage_progress || 0;
      }
      
      // Store task data for future use
      if (data.stats) {
        state.taskData = { ...state.taskData, ...data };
      }
      
      // Add to progress rates for ETA calculation
      if (state.progressRates.length < MAX_PROGRESS_RATES && data.progress > 0) {
        const now = Date.now();
        const elapsed = now - state.processingStartTime;
        
        // Only calculate after at least 5 seconds
        if (elapsed > 5000) {
          // Calculate progress rate (% per second)
          const progressRate = data.progress / (elapsed / 1000);
          
          // Add to the progress rates array
          state.progressRates.push(progressRate);
        }
      }
      
      // Determine adjusted progress
      let displayProgress = data.progress;
      
      // CRITICAL FIX: Stage-based progress adjustment
      if (state.currentStage) {
        // Find the matching stage
        for (const [key, stage] of Object.entries(PROGRESS_STAGES)) {
          if (stage.name === state.currentStage) {
            // If we're in a known stage but the progress is inconsistent,
            // calculate progress based on the stage
            const stageMin = stage.min;
            const stageMax = stage.max;
            const stageRange = stageMax - stageMin;
            
            // If server progress is low but we're in a later stage, adjust it
            if (data.progress < stageMin) {
              displayProgress = stageMin + (state.stageProgress * stageRange);
              console.log(`Adjusted progress to match stage ${state.currentStage}: ${displayProgress}%`);
            }
            // If we're in early stages and stuck at 5%, boost gradually
            else if (data.progress <= 5 && state.progressUpdateCount > 2) {
              displayProgress = Math.min(15, 5 + (state.progressUpdateCount - 2));
              console.log(`Adjusted early progress from ${data.progress}% to ${displayProgress}%`);
            }
            break;
          }
        }
      }
      
      // Check for completion
      const isCompleted = this.isCompletionPhase(data);
      
      // Update UI with progress handler if available
      if (window.progressHandler && typeof window.progressHandler.updateProgressUI === 'function') {
        window.progressHandler.updateProgressUI(data.task_id, displayProgress, data.message || 'Processing...', data.stats);
        
        // Handle completion
        if (isCompleted && !state.completionState.completed) {
          console.log(`Task ${data.task_id} completion detected via progress update`);
          
          // Force progress to 100%
          window.progressHandler.updateProgressUI(data.task_id, 100, data.message || 'Task completed successfully', data.stats);
          
          // Complete the task after a short delay
          setTimeout(() => {
            this.handlePlaylistCompletion(data);
          }, TASK_COMPLETION_DELAY);
        }
      } else {
        // Direct UI update
        this.updateProgressDisplay(displayProgress, data.message, data.stats);
        
        // Handle completion
        if (isCompleted && !state.completionState.completed) {
          console.log(`Task ${data.task_id} completion detected via direct update`);
          
          // Force progress to 100%
          this.updateProgressDisplay(100, data.message || 'Task completed successfully', data.stats);
          
          // Complete the task after a short delay
          setTimeout(() => {
            this.handlePlaylistCompletion(data);
          }, TASK_COMPLETION_DELAY);
        }
      }
      
      // Handle specific status values
      if (data.status === 'error' || data.status === 'failed') {
        this.handleTaskError(data);
      } else if (data.status === 'cancelled') {
        this.handleTaskCancelled(data);
      }
      
      // Store last reported progress
      state.lastReportedProgress = displayProgress;
    } catch (error) {
      console.error('Error processing status update:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'processStatusUpdate',
          context: 'status update processing',
          data: {
            taskId: data?.task_id,
            progress: data?.progress,
            status: data?.status
          }
        });
      }
    }
  },

  /**
   * Check if data indicates completion phase
   * @param {Object} data - Status update data
   * @returns {boolean} - Whether this indicates completion
   */
  isCompletionPhase(data) {
    return (
      // Status-based checks
      data.status === 'completed' || 
      (data.stats && data.stats.status === 'completed') ||
      
      // Stage-based check
      (data.details && data.details.current_stage === PROGRESS_STAGES.FINALIZE.name &&
       data.details.stage_progress > 0.8) ||
      
      // Message-based checks (case insensitive)
      (data.message && (
        /complet(ed|ion)/i.test(data.message) ||
        /done/i.test(data.message) ||
        /finish(ed)/i.test(data.message) ||
        /success/i.test(data.message)
      )) ||
      
      // Progress-based checks
      (data.progress >= 98) ||
      (data.progress >= 90 && data.stats && 
        (data.stats.processed_files >= (data.stats.total_files || 1) ||
         data.stats.processed_videos >= (data.stats.total_videos || 1) ||
         data.stats.processed_playlists >= (data.stats.total_playlists || 1)))
    );
  },

  /**
   * Update progress display
   * @param {number} progress - Progress percentage
   * @param {string} message - Status message
   * @param {Object} stats - Optional statistics
   */
  updateProgressDisplay(progress, message, stats = null) {
    try {
      // Get UI elements
      const progressBar = getElement('playlist-progress-bar');
      const progressStatus = getElement('playlist-progress-status');
      const progressStats = getElement('playlist-progress-stats');
      const stageLabel = getElement('playlist-stage-label');
      
      // Update progress bar
      if (progressBar) {
        const displayProgress = Math.max(0, Math.min(100, progress));
        progressBar.style.width = `${displayProgress}%`;
        progressBar.setAttribute('aria-valuenow', displayProgress);
        progressBar.textContent = `${Math.round(displayProgress)}%`;
        
        // Add appropriate styling based on progress
        progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-primary', 'bg-success');
        
        if (displayProgress >= 100) {
          progressBar.classList.add('bg-success');
        } else if (displayProgress >= 75) {
          progressBar.classList.add('bg-info');
        } else if (displayProgress >= 50) {
          progressBar.classList.add('bg-primary');
        } else if (displayProgress >= 25) {
          progressBar.classList.add('bg-primary');
        } else {
          progressBar.classList.add('bg-primary');
        }
      }
      
      // Update status message
      if (progressStatus && message) {
        progressStatus.textContent = message;
      }
      
      // Update stage label if available
      if (stageLabel && state.currentStage) {
        const stageName = state.currentStage
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        stageLabel.textContent = `Stage: ${stageName}`;
        stageLabel.classList.remove('d-none');
      }
      
      // Update stats if available
      if (progressStats && stats) {
        this.updateProgressStats(progressStats, stats);
      }
      
      // Store last reported progress
      state.lastReportedProgress = progress;
    } catch (error) {
      console.error('Error updating progress display:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'updateProgressDisplay',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Update progress stats
   * @param {HTMLElement} element - Stats container element
   * @param {Object} stats - Statistics object
   */
  updateProgressStats(element, stats) {
    if (!element || !stats) return;
    
    try {
      // Format stats for display
      let statsHtml = '<div class="stats-container p-2">';
      
      // Format based on available stats
      if (stats.total_playlists !== undefined) {
        // Playlist stats
        statsHtml += `
          <div class="row g-2">
            <div class="col-md-6">
              <div class="d-flex gap-2 flex-wrap">
                <span class="badge bg-primary">Playlists: ${stats.total_playlists || 0}</span>
                <span class="badge bg-success">Processed: ${stats.processed_playlists || 0}</span>
                <span class="badge bg-warning">Skipped: ${stats.skipped_playlists || 0}</span>
                <span class="badge bg-danger">Errors: ${stats.failed_playlists || 0}</span>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex gap-2 flex-wrap">
                <span class="badge bg-info">Videos: ${stats.total_videos || 0}</span>
                <span class="badge bg-success">Downloaded: ${stats.processed_videos || 0}</span>
              </div>
            </div>
          </div>
        `;
        
        // Add elapsed time if available
        if (stats.elapsed_seconds || stats.elapsed_time_seconds) {
          const duration = stats.elapsed_seconds || stats.elapsed_time_seconds || 0;
          statsHtml += `<div class="mt-2 text-muted">Elapsed time: ${this.formatDuration(duration)}</div>`;
        }
        
        // Add current stage if available
        if (state.currentStage) {
          const stageName = state.currentStage
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          
          statsHtml += `<div class="mt-2 text-muted">Current stage: ${stageName}</div>`;
        }
      } else if (stats.total_files !== undefined) {
        // Generic file processing stats
        statsHtml += `
          <div class="row">
            <div class="col-md-6 mb-2">
              <span class="badge bg-primary">Files: ${stats.total_files || 0}</span>
              <span class="badge bg-success mx-1">Processed: ${stats.processed_files || 0}</span>
              <span class="badge bg-warning mx-1">Skipped: ${stats.skipped_files || 0}</span>
              <span class="badge bg-danger mx-1">Errors: ${stats.error_files || 0}</span>
            </div>
            <div class="col-md-6 mb-2">
              <span class="badge bg-info">Chunks: ${stats.total_chunks || 0}</span>
              ${stats.total_bytes ? 
                `<span class="badge bg-secondary mx-1">Size: ${this.formatBytes(stats.total_bytes)}</span>` : ''}
            </div>
          </div>
        `;
      }
      
      // Add current file/video if available
      if (stats.current_video || stats.current_file) {
        statsHtml += `
          <div class="mt-2 small">
            <i class="fas fa-spinner fa-spin me-1"></i> 
            ${stats.current_video || stats.current_file}
          </div>
        `;
      }
      
      statsHtml += '</div>';
      
      // Update the element
      element.innerHTML = statsHtml;
    } catch (error) {
      console.error('Error updating progress stats:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'updateProgressStats',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Bytes to format
   * @returns {string} - Formatted size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    // Check if we already have a formatted string
    if (typeof bytes === 'string' && bytes.includes('B')) {
      return bytes;
    }
    
    // Use utils if available
    if (window.utils && typeof window.utils.formatBytes === 'function') {
      return window.utils.formatBytes(bytes);
    }
    
    // Fallback implementation
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Format duration in seconds to human-readable form
   * @param {number} seconds - Duration in seconds
   * @returns {string} - Formatted duration
   */
  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    
    // Check if we already have a formatted string
    if (typeof seconds === 'string' && (seconds.includes('s') || seconds.includes('m') || seconds.includes('h'))) {
      return seconds;
    }
    
    // Use utils if available
    if (window.utils && typeof window.utils.formatDuration === 'function') {
      return window.utils.formatDuration(seconds);
    }
    
    // Fallback implementation
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    return [
      h > 0 ? `${h}h` : '',
      m > 0 ? `${m}m` : '',
      s > 0 || (h === 0 && m === 0) ? `${s}s` : ''
    ].filter(Boolean).join(' ');
  },

  /**
   * Handle playlist completion
   * @param {Object} data - Completion data
   */
  handlePlaylistCompletion(data) {
    try {
      // Skip if already completed or duplicate event for same task ID
      if (state.completionState.completed || state.completionHandled.has(data.task_id)) {
        console.log('Task already marked as completed, skipping duplicate completion');
        return;
      }
      
      // Add task to handled set to prevent duplicates
      state.completionHandled.add(data.task_id);
      
      console.log('Handling playlist completion:', data);
      
      // Mark as completed
      state.completionState.completed = true;
      state.completionState.completionTime = Date.now();
      
      // Force progress to 100%
      this.updateProgressDisplay(100, 'Task completed successfully', data.stats);
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      sessionStorage.setItem('taskCompletionTime', Date.now().toString());
      
      // Update state
      state.processing = false;
      state.currentTaskId = null;
      window.currentTaskId = null; // For compatibility
      
      // Complete tracking in progressHandler if available
      if (state.progressTracker && typeof state.progressTracker.complete === 'function') {
        state.progressTracker.complete(data);
      } else if (window.progressHandler && typeof window.progressHandler.completeTask === 'function') {
        window.progressHandler.completeTask(data.task_id, data);
      }
      
      // Add to history
      this.addTaskToHistory(data);
      
      // Show results UI
      setTimeout(() => {
        this.showResult(data);
      }, TASK_COMPLETION_DELAY);
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show success notification
      this.showNotification('Your playlists have been processed successfully', 'success', 'Processing Complete');
      
      // Stop polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Emit completion event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.completed', data);
      }
    } catch (error) {
      console.error('Error handling playlist completion:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handlePlaylistCompletion',
          context: 'task completion',
          data: {
            taskId: data?.task_id,
            status: data?.status
          }
        });
      }
      
      // Try to show results anyway
      try {
        this.showResult(data || { output_file: state.outputFilePath });
      } catch (e) {
        console.error('Failed to show results after error:', e);
      }
    }
  },

  /**
   * Handle task error
   * @param {Object} data - Error data
   */
  handleTaskError(data) {
    try {
      // Skip if already handled
      if (state.completionState.error) {
        return;
      }
      
      console.log('Handling task error:', data);
      
      // Mark as error
      state.completionState.error = true;
      state.processing = false;
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Handle error in progressHandler
      if (state.progressTracker && typeof state.progressTracker.error === 'function') {
        state.progressTracker.error(data.error || 'Unknown error');
      } else if (window.progressHandler && typeof window.progressHandler.errorTask === 'function') {
        window.progressHandler.errorTask(data.task_id, data.error || 'Unknown error', data);
      }
      
      // Update UI
      this.showPlaylistError(data.error || 'An error occurred during processing');
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Clear polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Emit error event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.error', data);
      }
    } catch (error) {
      console.error('Error handling task error:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handleTaskError',
          context: 'error handling',
          data: {
            taskId: data?.task_id,
            error: data?.error
          }
        });
      }
      
      // Try to show form anyway
      this.showPlaylistForm();
    }
  },

  /**
   * Handle task cancellation
   * @param {Object} data - Cancellation data
   */
  handleTaskCancelled(data) {
    try {
      // Skip if already handled
      if (state.completionState.cancelled) {
        return;
      }
      
      console.log('Handling task cancellation:', data);
      
      // Mark as cancelled
      state.completionState.cancelled = true;
      state.processing = false;
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Handle cancellation in progressHandler
      if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
        state.progressTracker.cancel();
      } else if (window.progressHandler && typeof window.progressHandler.cancelTracking === 'function') {
        window.progressHandler.cancelTracking(data.task_id || state.currentTaskId);
      }
      
      // Show form
      this.showPlaylistForm();
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Clear polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Show notification
      this.showNotification('The playlist processing has been cancelled', 'warning', 'Task Cancelled');
      
      // Emit cancelled event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.cancelled', data);
      }
    } catch (error) {
      console.error('Error handling task cancellation:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handleTaskCancelled',
          context: 'task cancellation',
          data: {
            taskId: data?.task_id
          }
        });
      }
      
      // Try to show form anyway
      this.showPlaylistForm();
    }
  },

  /**
     * Add task to history
     * @param {Object} data - Task data
     */
  addTaskToHistory(data) {
    if (!data) return;
    
    try {
      console.log('Adding task to history:', data);
      
      // Prepare task data
      const taskData = {
        task_id: data.task_id || state.currentTaskId,
        type: 'playlist',
        status: 'completed',
        timestamp: Date.now(),
        filename: this.getFileNameFromPath(data.output_file),
        inputPath: data.root_directory,
        outputPath: data.output_file,
        stats: data.stats || {}
      };
      
      // Use historyManager if available
      if (historyManager && typeof historyManager.addTaskToHistory === 'function') {
        historyManager.addTaskToHistory(taskData);
        
        // Also add to recent files if output file is available
        if (data.output_file && typeof historyManager.addFileToRecent === 'function') {
          historyManager.addFileToRecent({
            path: data.output_file,
            name: this.getFileNameFromPath(data.output_file),
            lastAccessed: Date.now()
          });
        }
        
        return true;
      }
      
      // Try to emit event to add history
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('history.add', {
          type: 'playlist',
          name: data.output_file ? this.getFileNameFromPath(data.output_file) : 'Playlist Data',
          data: taskData
        });
        
        return true;
      }
      
      // Fallback to localStorage
      try {
        const historyItems = JSON.parse(localStorage.getItem('taskHistory') || '[]');
        historyItems.unshift(taskData);
        
        // Limit history items
        if (historyItems.length > 50) {
          historyItems.length = 50;
        }
        
        localStorage.setItem('taskHistory', JSON.stringify(historyItems));
        return true;
      } catch (storageError) {
        console.warn('Failed to store task in localStorage:', storageError);
      }
      
      return false;
    } catch (error) {
      console.error('Error adding task to history:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'addTaskToHistory',
          context: 'history management'
        });
      }
      return false;
    }
  },

  /**
   * Get filename from path
   * @param {string} path - File path
   * @returns {string} - Filename
   */
  getFileNameFromPath(path) {
    if (!path) return 'Unknown';
    
    // Use historyManager if available
    if (historyManager && typeof historyManager.getFileNameFromPath === 'function') {
      return historyManager.getFileNameFromPath(path);
    }
    
    try {
      // Extract file name from path
      const parts = path.split(/[\/\\]/);
      return parts[parts.length - 1] || 'Unknown';
    } catch (error) {
      console.warn('Error extracting filename from path:', error);
      return 'Unknown';
    }
  },

  /**
   * Show playlist form
   */
  showPlaylistForm() {
    try {
      // Get UI elements
      const formContainer = getElement('playlist-form-container');
      const progressContainer = getElement('playlist-progress-container');
      const resultsContainer = getElement('playlist-results-container');
      const errorContainer = getElement('playlist-error-container');
      
      // Hide all other containers
      if (progressContainer) toggleElementVisibility(progressContainer, false);
      if (resultsContainer) toggleElementVisibility(resultsContainer, false);
      if (errorContainer) toggleElementVisibility(errorContainer, false);
      
      // Show form container
      if (formContainer) toggleElementVisibility(formContainer, true);
      
      // Reset UI state
      state.uiState = {
        isFormShown: true,
        isResultShown: false,
        isErrorShown: false,
        isCancelledShown: false
      };
      
      // Reset any button states
      const submitBtn = getElement('playlist-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
    } catch (error) {
      console.error('Error showing playlist form:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'showPlaylistForm',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Show progress UI
   */
  showProgress() {
    try {
      // Get UI elements
      const formContainer = getElement('playlist-form-container');
      const progressContainer = getElement('playlist-progress-container');
      const resultsContainer = getElement('playlist-results-container');
      const errorContainer = getElement('playlist-error-container');
      
      // Hide all other containers
      if (formContainer) toggleElementVisibility(formContainer, false);
      if (resultsContainer) toggleElementVisibility(resultsContainer, false);
      if (errorContainer) toggleElementVisibility(errorContainer, false);
      
      // Show progress container
      if (progressContainer) toggleElementVisibility(progressContainer, true);
      
      // Reset progress display if needed
      const progressBar = getElement('playlist-progress-bar');
      if (progressBar) {
        // Initialize progress bar styling
        this.initializeProgressBarStyling(progressBar);
        
        // Set initial progress value
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.textContent = '0%';
      }
      
      // Reset progress status
      const progressStatus = getElement('playlist-progress-status');
      if (progressStatus) {
        progressStatus.textContent = 'Initializing...';
      }
      
      // Reset progress stats
      const progressStats = getElement('playlist-progress-stats');
      if (progressStats) {
        progressStats.innerHTML = '';
      }
      
      // Update UI state
      state.uiState = {
        isFormShown: false,
        isProgressShown: true,
        isResultShown: false,
        isErrorShown: false
      };
    } catch (error) {
      console.error('Error showing progress UI:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'showProgress',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Show result UI
   * @param {Object} data - Result data
   */
  showResult(data) {
    try {
      // Skip if already showing result
      if (state.uiState.isResultShown) {
        return;
      }
      
      console.log('Showing result UI:', data);
      
      // Get UI elements
      const formContainer = getElement('playlist-form-container');
      const progressContainer = getElement('playlist-progress-container');
      const resultsContainer = getElement('playlist-results-container');
      const errorContainer = getElement('playlist-error-container');
      
      // Hide all other containers
      if (formContainer) toggleElementVisibility(formContainer, false);
      if (progressContainer) toggleElementVisibility(progressContainer, false);
      if (errorContainer) toggleElementVisibility(errorContainer, false);
      
      // Update result elements
      const jsonPath = getElement('playlist-json-path');
      if (jsonPath) {
        const outputFile = data.output_file || state.outputFilePath;
        jsonPath.textContent = outputFile || 'Unknown';
      }
      
      // Set output file for the open button
      const openBtn = getElement('open-playlist-json');
      if (openBtn) {
        openBtn.setAttribute('data-output-file', data.output_file || state.outputFilePath || '');
      }
      
      // Update statistics if available
      const statsContainer = getElement('playlist-result-stats');
      if (statsContainer && data.stats) {
        let statsHtml = '<div class="stats-container p-3">';
        
        // Add playlists stats
        if (data.stats.total_playlists !== undefined) {
          statsHtml += `
            <h6 class="mb-3">Processing Summary</h6>
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <div class="card h-100">
                  <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-list me-2"></i>Playlists</h6>
                    <div class="d-flex flex-wrap gap-2 mt-3">
                      <span class="badge bg-primary">Total: ${data.stats.total_playlists || 0}</span>
                      <span class="badge bg-success">Processed: ${data.stats.processed_playlists || 0}</span>
                      <span class="badge bg-warning">Skipped: ${data.stats.skipped_playlists || 0}</span>
                      <span class="badge bg-danger">Errors: ${data.stats.failed_playlists || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card h-100">
                  <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-video me-2"></i>Videos</h6>
                    <div class="d-flex flex-wrap gap-2 mt-3">
                      <span class="badge bg-primary">Total: ${data.stats.total_videos || 0}</span>
                      <span class="badge bg-success">Downloaded: ${data.stats.processed_videos || 0}</span>
                      <span class="badge bg-warning">Skipped: ${data.stats.skipped_videos || 0}</span>
                      <span class="badge bg-danger">Errors: ${data.stats.failed_videos || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
        
        // Add processing time if available
        if (data.stats.elapsed_seconds || data.stats.elapsed_time_seconds || 
            (state.processingStartTime && state.completionState.completionTime)) {
          
          const elapsedSeconds = data.stats.elapsed_seconds || data.stats.elapsed_time_seconds || 
                              ((state.completionState.completionTime - state.processingStartTime) / 1000);
          
          statsHtml += `
            <div class="row mb-3">
              <div class="col-12">
                <div class="card">
                  <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-clock me-2"></i>Processing Time</h6>
                    <p class="mb-0 mt-2">${this.formatDuration(elapsedSeconds)}</p>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
        
        // Add output file details
        const outputFile = data.output_file || state.outputFilePath;
        if (outputFile) {
          statsHtml += `
            <div class="row">
              <div class="col-12">
                <div class="card">
                  <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-file-alt me-2"></i>Output File</h6>
                    <p class="mb-0 mt-2 text-truncate">
                      <code>${outputFile}</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
        
        statsHtml += '</div>';
        statsContainer.innerHTML = statsHtml;
      }
      
      // Show results container
      if (resultsContainer) toggleElementVisibility(resultsContainer, true);
      
      // Update UI state
      state.uiState = {
        isFormShown: false,
        isProgressShown: false,
        isResultShown: true,
        isErrorShown: false
      };
    } catch (error) {
      console.error('Error showing result UI:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'showResult',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Show error UI
   * @param {string} errorMessage - Error message
   */
  showPlaylistError(errorMessage) {
    try {
      // Skip if already showing error
      if (state.uiState.isErrorShown) {
        return;
      }
      
      console.log('Showing error UI:', errorMessage);
      
      // Get UI elements
      const formContainer = getElement('playlist-form-container');
      const progressContainer = getElement('playlist-progress-container');
      const resultsContainer = getElement('playlist-results-container');
      const errorContainer = getElement('playlist-error-container');
      const errorText = getElement('playlist-error-text');
      
      // Hide all other containers
      if (formContainer) toggleElementVisibility(formContainer, false);
      if (progressContainer) toggleElementVisibility(progressContainer, false);
      if (resultsContainer) toggleElementVisibility(resultsContainer, false);
      
      // Update error message
      if (errorText) {
        errorText.textContent = errorMessage || 'An unknown error occurred';
      }
      
      // Show error container
      if (errorContainer) toggleElementVisibility(errorContainer, true);
      
      // Update UI state
      state.uiState = {
        isFormShown: false,
        isProgressShown: false,
        isResultShown: false,
        isErrorShown: true
      };
      
      // Update state
      state.processing = false;
      state.completionState.error = true;
      
      // Show error toast
      this.showToast('Error', errorMessage || 'An unknown error occurred', 'error');
    } catch (error) {
      console.error('Error showing error UI:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'showPlaylistError',
          context: 'UI update'
        });
      }
      
      // Fallback - alert
      if (errorMessage) {
        alert(`Error: ${errorMessage}`);
      }
    }
  },

  /**
   * Show toast notification
   * @param {string} title - Toast title
   * @param {string} message - Toast message
   * @param {string} type - Toast type (info, success, warning, error)
   */
  showToast(title, message, type = 'info') {
    try {
      // Use UI module if available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast(title, message, type);
        return;
      }
      
      // Fallback: Find toast container
      const toastContainer = document.getElementById('toast-container') || 
        (() => {
          const container = document.createElement('div');
          container.id = 'toast-container';
          container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
          document.body.appendChild(container);
          return container;
        })();
      
      // Create toast element
      const toast = document.createElement('div');
      toast.className = `toast show bg-${type === 'error' ? 'danger' : type}`;
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body text-white">
          ${message}
        </div>
      `;
      
      // Add to container
      toastContainer.appendChild(toast);
      
      // Auto remove after delay
      setTimeout(() => toast.remove(), 5000);
    } catch (error) {
      console.error('Error showing toast:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'showToast',
          context: 'UI update'
        });
      }
    }
  },

  /**
   * Handle cancel button click
   */
  handleCancelButtonClick() {
    try {
      if (!state.currentTaskId || !state.processing) {
        console.warn('No active task to cancel');
        return;
      }
      
      // Confirm cancellation
      if (confirm('Are you sure you want to cancel the current download?')) {
        this.cancelDownload(state.currentTaskId);
      }
    } catch (error) {
      console.error('Error handling cancel button click:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handleCancelButtonClick',
          context: 'UI interaction'
        });
      }
    }
  },

  /**
   * Handle new task button click
   */
  handleNewTaskClick() {
    try {
      // Reset state
      state.currentTaskId = null;
      state.processing = false;
      state.completionState = {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      };
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      
      // Show form
      this.showPlaylistForm();
    } catch (error) {
      console.error('Error handling new task click:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'handleNewTaskClick',
          context: 'UI interaction'
        });
      }
    }
  },

  /**
   * Cancel download
   * @param {string} taskId - Task ID to cancel
   * @returns {Promise<boolean>} - Success state
   */
  async cancelDownload(taskId) {
    try {
      const targetTaskId = taskId || state.currentTaskId;
      if (!targetTaskId) {
        console.warn('No task ID provided for cancellation');
        return false;
      }
      
      console.log(`Cancelling download task: ${targetTaskId}`);
      
      // Mark as cancelled in state
      state.isProcessingCancelled = true;
      state.processing = false;
      state.completionState.cancelled = true;
      
      // Use socket for cancellation if available
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.CANCEL_TASK, { task_id: targetTaskId });
        
        // As a fallback, also try API
        try {
          const cancelEndpoint = PLAYLIST_CONFIG.endpoints.CANCEL.replace(':taskId', targetTaskId);
          await fetch(cancelEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': localStorage.getItem('api_key') || ''
            },
            timeout: 5000
          });
        } catch (apiError) {
          console.warn('API cancellation failed, socket cancellation may still succeed');
        }
      } else {
        // Use centralized configuration directly
        const cancelEndpoint = PLAYLIST_CONFIG.endpoints.CANCEL.replace(':taskId', targetTaskId);
        await fetch(cancelEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': localStorage.getItem('api_key') || ''
          },
          timeout: 5000
        });
      }
      
      // Cancel any pending requests
      if (state.pendingRequests[targetTaskId]) {
        state.pendingRequests[targetTaskId].abort();
        delete state.pendingRequests[targetTaskId];
      }
      
      // Cancel progress tracking
      if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
        state.progressTracker.cancel();
      }
      
      // Stop status polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Remove from session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show form UI
      this.showPlaylistForm();
      
      // Show notification
      this.showToast('Cancelled', 'Download has been cancelled', 'warning');
      
      // Emit event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.cancelled', { task_id: targetTaskId });
      }
      
      return true;
    } catch (error) {
      console.error('Error cancelling download:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'cancelDownload',
          context: 'task cancellation',
          taskId: taskId
        });
      }
      return false;
    }
  },

  /**
   * Open file or folder
   * @param {string} path - Path to open
   */
  async openFileOrFolder(path) {
    try {
      if (!path) {
        console.warn('No path provided to open');
        return;
      }
      
      // Check if fileHandler is available
      if (window.fileHandler && typeof window.fileHandler.openFile === 'function') {
        await window.fileHandler.openFile(path);
        return;
      }
      
      // Use Blueprint API as fallback
      await blueprintApi.openFile(path);
      
      console.log(`File opened: ${path}`);
    } catch (error) {
      console.error('Error opening file or folder:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'openFileOrFolder',
          context: 'file operation',
          path: path
        });
      }
      
      this.showToast('Error', `Failed to open file: ${error.message}`, 'error');
    }
  },

  /**
   * Fetch with retry for API requests
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} - Fetch response
   */
  async fetchWithRetry(url, options = {}) {
    let retries = 0;
    let lastError = null;
    
    while (retries < state.apiRetryCount) {
      try {
        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        return response;
      } catch (error) {
        lastError = error;
        retries++;
        
        // If processing is cancelled, don't retry
        if (state.isProcessingCancelled) {
          throw new Error('Operation cancelled');
        }
        
        // Don't retry if AbortError (timeout or cancellation)
        if (error.name === 'AbortError') {
          throw error;
        }
        
        // Exponential backoff
        const delay = state.apiRetryDelay * Math.pow(2, retries - 1);
        
        console.warn(`API request failed, retrying (${retries}/${state.apiRetryCount}) in ${delay}ms:`, error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('API request failed after retries');
  },

  /**
   * Cleanup resources
   */
  cleanup() {
    try {
      console.log('Cleaning up playlist downloader module...');
      
      // Cancel any active downloads
      if (state.currentTaskId && state.processing) {
        try {
          this.cancelDownload(state.currentTaskId);
        } catch (cancelError) {
          console.warn('Error during cancellation on cleanup:', cancelError);
        }
      }
      
      // Clear status polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Cancel any pending requests
      Object.keys(state.pendingRequests).forEach(taskId => {
        try {
          state.pendingRequests[taskId].abort();
        } catch (abortError) {
          console.warn(`Error aborting request for task ${taskId}:`, abortError);
        }
        delete state.pendingRequests[taskId];
      });
      
      // Clear monitoring timeouts
      this.clearCompletionMonitoring();
      
      // Reset state
      state.initialized = false;
      state.processing = false;
      state.currentTaskId = null;
      
      // Remove event listeners if eventRegistry is available
      if (eventRegistry && typeof eventRegistry.off === 'function') {
        eventRegistry.off('socket.progress_update');
        eventRegistry.off('socket.playlist_progress');
        eventRegistry.off('socket.task_completed');
        eventRegistry.off('socket.playlist_completed');
        eventRegistry.off('socket.task_error');
        eventRegistry.off('socket.playlist_error');
        eventRegistry.off('socket.task_cancelled');
        eventRegistry.off('socket.playlist_cancelled');
        eventRegistry.off('socket.connected');
        eventRegistry.off('socket.disconnected');
        eventRegistry.off('playlist.processing.resume');
      }
      
      console.log('Playlist downloader module cleanup complete');
      return true;
    } catch (error) {
      console.error('Error during playlist downloader cleanup:', error);
      if (errorHandler && typeof errorHandler.reportError === 'function') {
        errorHandler.reportError(error, {
          module: 'playlistDownloader',
          method: 'cleanup',
          context: 'module cleanup'
        });
      }
      return false;
    }
  }
  };

// Export default function to create and initialize the module
export default function initPlaylistDownloader() {
// Initialize immediately (async) but don't wait
playlistDownloader.initialize();

// Return the module API
return {
  initialize: playlistDownloader.initialize.bind(playlistDownloader),
  handlePlaylistSubmit: playlistDownloader.handlePlaylistSubmit.bind(playlistDownloader),
  cancelDownload: playlistDownloader.cancelDownload.bind(playlistDownloader),
  addPlaylistField: playlistDownloader.addPlaylistField.bind(playlistDownloader),
  showPlaylistForm: playlistDownloader.showPlaylistForm.bind(playlistDownloader),
  showResult: playlistDownloader.showResult.bind(playlistDownloader),
  handleNewTaskClick: playlistDownloader.handleNewTaskClick.bind(playlistDownloader),
  cleanup: playlistDownloader.cleanup.bind(playlistDownloader),
  isInitialized: () => state.initialized,
  isProcessing: () => state.processing,
  getState: () => ({
    currentTaskId: state.currentTaskId,
    processing: state.processing,
    completed: state.completionState.completed,
    error: state.completionState.error,
    cancelled: state.completionState.cancelled,
    progress: state.lastReportedProgress
  }),

  /**
   * Test backend connectivity and configuration
   */
  async testBackendConnectivity() {
    try {
      console.log('🔗 Testing Playlist Downloader backend connectivity...');
      
      const response = await fetch(PLAYLIST_CONFIG.endpoints.HEALTH, {
        method: 'GET',
        headers: {
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Playlist Downloader backend connectivity confirmed:', data);
        state.backendConnected = true;
        return true;
      } else {
        console.warn('⚠️ Playlist Downloader backend health check failed:', response.status);
        state.backendConnected = false;
        return false;
      }
    } catch (error) {
      console.warn('⚠️ Playlist Downloader backend connectivity test failed:', error.message);
      state.backendConnected = false;
      return false;
    }
  },

  /**
   * Enhanced notification system with 4-method delivery
   */
  showNotification(message, type = 'info', title = 'Playlist Downloader') {
    // Method 1: Toast notifications
    this.showToast(title, message, type);
    
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
        title,
        message,
        type,
        module: 'playlistDownloader'
      });
    }
    
    // Method 4: Error reporting to centralized handler
    if (type === 'error' && window.NeuroGen?.errorHandler) {
      window.NeuroGen.errorHandler.logError({
        module: 'playlistDownloader',
        message,
        severity: type
      });
    }
  },

  /**
   * Get module health status with configuration details
   */
  getHealthStatus() {
    return {
      module: 'playlistDownloader',
      version: '3.1.0',
      initialized: state.initialized,
      processing: state.processing,
      backendConnected: state.backendConnected || false,
      currentTask: state.currentTaskId ? {
        id: state.currentTaskId,
        startTime: state.processingStartTime,
        progress: state.lastReportedProgress || 0
      } : null,
      configuration: {
        endpoints: {
          start: PLAYLIST_CONFIG.endpoints.START,
          cancel: PLAYLIST_CONFIG.endpoints.CANCEL,
          health: PLAYLIST_CONFIG.endpoints.HEALTH,
          configLoaded: !!PLAYLIST_CONFIG.endpoints
        },
        constants: {
          maxProgressRates: MAX_PROGRESS_RATES,
          apiTimeout: API_TIMEOUT_MS,
          pollInterval: PROGRESS_POLL_INTERVAL_MS
        }
      },
      dependencies: {
        socket: !!window.socket?.connected,
        constants: !!CONSTANTS,
        taskEvents: !!TASK_EVENTS,
        socketEvents: !!SOCKET_EVENTS
      },
      state: {
        currentTaskId: state.currentTaskId,
        processing: state.processing,
        completed: state.completionState.completed,
        error: state.completionState.error,
        cancelled: state.completionState.cancelled,
        outputFilePath: state.outputFilePath
      }
    };
  }
};
}