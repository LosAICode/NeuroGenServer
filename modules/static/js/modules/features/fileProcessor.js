/**
 * NeuroGen Server - Enhanced File Processor Module
 * 
 * Handles file uploading, processing, and interaction with the backend
 * for various file types. Includes progress tracking, error handling,
 * and UI interactions.
 * 
 * Key improvements:
 * 1. DOM utility functions imported from domUtils.js to prevent redeclarations
 * 2. Complete integration with app.py endpoints
 * 3. Enhanced error handling and recovery mechanisms
 * 4. Improved progress tracking through progressHandler.js
 * 5. Session persistence for handling page reloads during processing
 * 6. Better cancellation support with server-side task termination
 * 7. Support for multiple file types and formats
 * 8. Directory validation and creation
 * 9. Full history integration
 * 10. Stuck task detection and recovery
 * 
 * @module fileProcessor
 */

// CORRECTED IMPORT SECTION:
// Import DOM utilities from domUtils.js to avoid redeclarations
import { getElement, getElements, getUIElements, createElement, addEventListeners } from '../utils/domUtils.js';

// Import core modules
import errorHandler from '../core/errorHandler.js';
import uiRegistry from '../core/uiRegistry.js';
import eventRegistry from '../core/eventRegistry.js';
import stateManager from '../core/stateManager.js';

// Import history manager
import historyManager from '../features/historyManager.js';

// Import progress handler module with all needed exports
import progressHandler, { 
  setupTaskProgress, 
  trackProgress, 
  updateProgressUI, 
  createProgressUI 
} from '../utils/progressHandler.js';

// Import UI module
import ui from '../utils/ui.js';

// Import Blueprint API service and configuration
import blueprintApi from '../services/blueprintApi.js';
import { FILE_ENDPOINTS } from '../config/endpoints.js';
import { SOCKET_EVENTS, BLUEPRINT_EVENTS } from '../config/socketEvents.js';

// Create fallback UI if needed
const fallbackUI = {
    showToast: (title, message, type = 'info') => {
      console.log(`TOAST [${type}]: ${title} - ${message}`);
      try {
        // Create a basic toast if container exists or create one
        const toastContainer = getElement('toast-container') || (() => {
          const container = createElement('div', {
            id: 'toast-container',
            className: 'toast-container position-fixed bottom-0 end-0 p-3'
          });
          document.body.appendChild(container);
          return container;
        })();
        
        const toast = createElement('div', {
          className: `toast show bg-${type === 'error' ? 'danger' : type}`,
          role: 'alert'
        });
        
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
      } catch (error) {
        console.error("Failed to create fallback toast:", error);
      }
    },
    
    toggleElementVisibility: (element, visible) => {
      const el = getElement(element);
      if (!el) return;
      
      if (visible) {
        el.classList.remove('d-none');
      } else {
        el.classList.add('d-none');
      }
    },
    
    transitionBetweenElements: (fromElement, toElement) => {
      const from = getElement(fromElement);
      const to = getElement(toElement);
      
      if (!from || !to) return;
      
      from.classList.add('d-none');
      to.classList.remove('d-none');
    },
    
    updateProgressBarElement: (progressBar, progress) => {
      const el = getElement(progressBar);
      if (!el) return;
      
      const percent = Math.round(progress);
      el.style.width = `${percent}%`;
      el.setAttribute('aria-valuenow', percent);
      el.textContent = `${percent}%`;
    },
    
    updateProgressStatus: (statusElement, message) => {
      const el = getElement(statusElement);
      if (!el) return;
      
      el.textContent = message;
    },
    
    showModal: (options) => {
      console.log(`MODAL: ${options.title || 'Modal'}`);
      alert(options.content || 'Modal content');
    }
  };

// Safely import utils module
let utils;
try {
  utils = await import('../utils/utils.js');
} catch (e) {
  console.warn("Utils module import failed:", e);
  // Create fallback utils module
  utils = {
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
    },
    
    formatJsonForDisplay: (json) => {
      return JSON.stringify(json, null, 2);
    },
    
    generateUniqueId: () => {
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
  };
}

// Safely import fileHandler module
let fileHandler;
try {
  fileHandler = await import('../utils/fileHandler.js');
} catch (e) {
  console.warn("FileHandler module import failed:", e);
  // Create fallback fileHandler module
  fileHandler = {
    handleBrowseClick: () => {
      console.warn("File browsing not available - fileHandler failed to load");
      alert("File browsing not available in this environment");
    },
    
    openFile: (path) => {
      console.warn("Cannot open file - fileHandler failed to load");
      alert(`Cannot open file: ${path}`);
      return false;
    },
    
    openContainingFolder: (path) => {
      console.warn("Cannot open folder - fileHandler failed to load");
      alert(`Cannot open folder: ${path}`);
      return false;
    }
  };
}

// Constants
const UI_UPDATE_DEBOUNCE_MS = 100; // Debounce time for UI updates
const MAX_PROGRESS_RATES = 10; // Number of progress rates to keep for averaging
const API_TIMEOUT_MS = 30000; // API request timeout 
const PROGRESS_POLL_INTERVAL_MS = 2000; // Status polling interval if websocket fails
const TASK_COMPLETION_DELAY = 250; // Short delay before showing completion UI
const MAX_RETRIES = 3; // Maximum API retry attempts
const RETRY_DELAY_BASE = 1000; // Base delay between retries in ms
const VALID_FILE_EXTENSIONS = [
  // Documents
  'pdf', 'doc', 'docx', 'txt', 'rtf', 'md', 'html', 'htm',
  // Spreadsheets
  'csv', 'xlsx', 'xls',
  // Data formats
  'json', 'xml',
  // Archives
  'zip', 'rar', '7z',
  // Other
  'log', 'yaml', 'yml'
];
// const DEFAULT_OUTPUT_FORMAT = 'json'; // Removed - unused variable
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max file size

// Module state (private)
const state = {
  initialized: false,
  processing: false,
  currentTaskId: null,
  currentTaskInfo: null, // Store task information from API response
  processingStartTime: null,
  isProcessingCancelled: false,
  progressUpdateCount: 0,
  lastProgressTimestamp: null,
  progressRates: [], // For ETA calculation
  selectedFiles: [],
  uiUpdateQueue: [],
  uiUpdateTimer: null,
  pendingRequests: {}, // For tracking API requests that may need cancellation
  socketReconnectAttempts: 0,
  maxSocketReconnects: 5,
  apiRetryCount: MAX_RETRIES,
  apiRetryDelay: RETRY_DELAY_BASE,
  statusPollInterval: null,
  statusPollErrorCount: 0, // Track consecutive poll errors
  lastReportedProgress: -1, // Track last reported progress to avoid duplicate 99% updates
  progressHandler: null, // Track the progress handler instance
  pdfProcessingEnabled: true, // Whether PDF processing features are enabled
  lastSavedOutputDir: null, // Last used output directory for persistence
  uiElements: {}, // Cache for UI elements
  historyInitialized: false, // Track history manager initialization
  // Completion marker to prevent duplicate completions
  completionState: {
    completed: false,
    completionTime: null,
    error: false,
    cancelled: false
  },
  // Task data to persist across functions
  taskData: {},
  // Track UI state
  uiState: {
    isResultShown: false,
    isErrorShown: false,
    isCancelledShown: false,
    isFormShown: false
  },
  // Add completion monitoring for stuck tasks
  completionMonitoring: {
    enabled: true,
    timeoutIds: new Set(),
    checkIntervalMs: 10000, // Check every 10 seconds
    maxStuckDurationMs: 120000 // 2 minutes max stuck time
  }
};

/**
 * File Processor module
 */
const fileProcessor = {
  /**
   * Initialize file processing module
   * @returns {Promise<boolean>} - Success state
   */
  async initialize() {
    try {
      console.log("Initializing file processing module...");
      
      // Skip if already initialized
      if (state.initialized) {
        console.log("File processing module already initialized");
        return true;
      }
      
      // Initialize UI first
      await this.initializeUI();
      
      // Initialize the history manager if available
      if (historyManager && typeof historyManager.initialize === 'function') {
        try {
          await historyManager.initialize();
          state.historyInitialized = true;
          console.log("History manager initialized successfully");
        } catch (historyError) {
          console.warn("History manager initialization failed:", historyError);
          // Continue with initialization even if history manager fails
        }
      } else {
        console.warn("History manager not available or missing initialize method");
      }
      
      // Check for stuck in cancellation state
      const progressStatus = getElement('progress-status');
      if (progressStatus && progressStatus.textContent === "Cancelling...") {
        console.warn("Detected stuck cancellation state, performing emergency reset");
        this.forceResetProcessingState();
        setTimeout(() => this.showForm(), 100);
      }
      
      // Detect and recover from page reload during active task
      this.handlePageReloadRecovery();
      
      // Initialize the progress handler
      await this.initializeProgressHandler();
      
      // Initialize input/output relationship
      this.initializeInputOutputRelationship();
      
      // Set up browse button handlers
      this.initializeBrowseButtons();
      
      // Set up drag and drop file handling
      this.initializeDragAndDrop();
      
      // Set up form validation
      this.initializeFormValidation();
      
      // Set up global error handlers for API calls
      this.setupGlobalErrorHandling();
      
      // Register file processor events
      this.registerEvents();
      
      // Check for ongoing task
      setTimeout(() => this.checkForOngoingTask(), 1000);
      
      // Add direct form handler due to UI module issues
      this.setupDirectEventHandlers();
      
      // Add initialization state check
      setTimeout(() => this.validateInitializationState(), 5000);
      
      // Mark as initialized
      state.initialized = true;
      console.log("File processing module initialized successfully");
      return true;
    } catch (error) {
      this.handleError(error, "Error initializing file processing module");
      return false;
    }
  },

  /**
   * Handle page reload recovery, detecting and resolving stuck tasks
   */
  handlePageReloadRecovery() {
    if (sessionStorage.getItem('ongoingTaskId')) {
      const lastCompletionTime = sessionStorage.getItem('taskCompletionTime');
      const now = Date.now();
      
      // If a task was marked complete in the last 5 seconds and page reloaded,
      // clear the session to prevent reload loop
      if (lastCompletionTime && (now - parseInt(lastCompletionTime, 10)) < 5000) {
        console.log("Detected potential reload loop, clearing session storage");
        this.clearTaskSessionData();
      }
      
      // Also check for potentially stuck tasks - if a task has been running for more than 30 minutes,
      // it's likely stuck and should be cleaned up
      const taskStartTime = sessionStorage.getItem('taskStartTime');
      if (taskStartTime && (now - parseInt(taskStartTime, 10)) > 30 * 60 * 1000) {
        console.warn("Detected potentially stuck task running for >30min, cleaning up");
        this.forceResetProcessingState();
      }
    }
  },

  /**
   * Validate initialization state after timeout
   */
  validateInitializationState() {
    if (state.processing && !state.currentTaskId) {
      console.warn("Detected inconsistent processing state without task ID");
      this.forceResetProcessingState();
      this.showForm();
    }
  },

  /**
   * Clear task session data
   */
  clearTaskSessionData() {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('outputFile');
    sessionStorage.removeItem('taskStartTime');
    sessionStorage.removeItem('taskCompletionTime');
  },

  /**
   * Set up direct event handlers for critical functionality
   * (Fallback for when UI registration fails)
   */
  setupDirectEventHandlers() {
    try {
      console.log("Setting up direct event handlers as fallback");
      
      // Form submission handler
      const form = getElement('process-form');
      if (form) {
        console.log("Adding direct submit handler to form");
        
        // Remove any existing handlers to avoid duplicates
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        // Add the submit handler
        newForm.addEventListener('submit', (e) => {
          console.log("Form submit triggered via direct handler");
          this.handleFileSubmit(e);
        });
      } else {
        console.error("Form element not found by ID: process-form");
      }
      
      // New task button
      const newTaskBtn = getElement('new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      // New task button in cancelled container
      const cancelledNewTaskBtn = getElement('cancelled-new-task-btn');
      if (cancelledNewTaskBtn) {
        cancelledNewTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      // Cancel button
      const cancelBtn = getElement('cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', this.handleCancelClick.bind(this));
      }
      
      // Open result file button
      const openBtn = getElement('open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          const path = openBtn.getAttribute('data-output-file');
          if (path) {
            this.openFileOrFolder(path);
          }
        });
      }
      
      // Retry button in error container
      const retryBtn = getElement('retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      // Browse button for input directory
      const browseBtn = getElement('browse-btn');
      if (browseBtn) {
        browseBtn.addEventListener('click', this.handleBrowseClick.bind(this));
      }
      
      // File input change handler
      const fileInput = getElement('folder-input');
      if (fileInput) {
        fileInput.addEventListener('change', this.handleFileSelection.bind(this));
      }
      
    } catch (error) {
      console.error("Error setting up direct event handlers:", error);
    }
  },

  /**
   * Initialize the progress handler
   * @returns {Promise<boolean>}
   */
  async initializeProgressHandler() {
    try {
      if (progressHandler && typeof progressHandler.initialize === 'function') {
        const result = await progressHandler.initialize();
        console.log("Progress handler initialized:", result);
        
        // Ensure progress UI elements exist
        const progressContainer = getElement('progress-container');
        if (progressContainer) {
          // Create progress UI elements if they don't exist
          const existingProgressBar = getElement('progress-bar');
          if (!existingProgressBar) {
            console.log("Creating progress UI elements");
            // Use the imported createProgressUI function
            const progressUI = createProgressUI('progress-container', '');
            if (progressUI) {
              console.log("Progress UI created successfully");
            }
          } else {
            console.log("Progress UI elements already exist");
          }
        }
        
        return result;
      }
      return false;
    } catch (error) {
      console.error("Error initializing progress handler:", error);
      return false;
    }
  },
  /**
   * Initialize UI-related functionality
   * @returns {Promise<boolean>}
   */
  async initializeUI() {
    try {
      // Get UI elements first to cache them
      const uiElements = {
        formContainer: getElement('form-container'),
        progressContainer: getElement('progress-container'),
        resultContainer: getElement('result-container'),
        errorContainer: getElement('error-container'),
        cancelledContainer: getElement('cancelled-container'),
        fileInput: getElement('folder-input'),
        submitBtn: getElement('submit-btn'),
        cancelBtn: getElement('cancel-btn'),
        newTaskBtn: getElement('new-task-btn'),
        retryBtn: getElement('retry-btn'),
        openBtn: getElement('open-btn')
      };
      
      // Cache UI elements in state
      state.uiElements = uiElements;
      
      // Check if UI is properly loaded
      if (!ui || typeof ui.showToast !== 'function') {
        console.warn("UI module not loaded properly, using fallback UI functionality");
        // Use minimal UI functionality from our module
      }
      
      return true;
    } catch (error) {
      console.error("Error initializing UI:", error);
      return false;
    }
  },
  /**
   * Handle error in file processor module
   * @param {Error} error - The error that occurred
   * @param {string} context - Error context for better debugging
   */
  handleError(error, context) {
    // Log to console
    console.error(`${context}:`, error);
    
    // Try to use errorHandler if available
    if (errorHandler && typeof errorHandler.handleError === 'function') {
      errorHandler.handleError(error, 'FILE_PROCESSOR', true, {
        context: context,
        module: 'fileProcessor'
      });
    }
    
    // Log to terminal
    this.logToTerminal('error', `${context}: ${error.message || error}`);
    
    // Show UI notification if available
    if (ui && typeof ui.showToast === 'function') {
      ui.showToast('Error', error.message || 'An error occurred', 'error');
    }
  },

  /**
   * Log a message to the terminal through event registry
   * @param {string} type - Log type ('info', 'error', 'warning', 'success')
   * @param {string} message - The message to log
   * @param {Object} details - Optional additional details
   */
  logToTerminal(type, message, details = undefined) {
    try {
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('terminal.log', {
          type: type,
          message: message,
          module: 'fileProcessor',
          timestamp: new Date().toISOString(),
          details: details
        });
      }
    } catch (error) {
      console.error("Error logging to terminal:", error);
    }
  },

  /**
   * Make a fetch request with retry capability
   * @param {string} url - The URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} - The fetch response
   */
  async fetchWithRetry(url, options = {}) {
    let lastError;
    let retryDelay = state.apiRetryDelay;
    
    for (let attempt = 0; attempt < state.apiRetryCount; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retrying request (attempt ${attempt + 1}/${state.apiRetryCount})...`);
        }
        
        const response = await fetch(url, options);
        
        // If response is ok, return it
        if (response.ok) {
          return response;
        }
        
        // Otherwise, create an error with status
        lastError = new Error(`HTTP error ${response.status}: ${response.statusText}`);
        lastError.status = response.status;
        
        // Don't retry for certain status codes
        if (response.status === 404 || response.status === 401 || response.status === 403) {
          throw lastError;
        }
      } catch (error) {
        console.error(`Fetch attempt ${attempt + 1} failed:`, error);
        lastError = error;
        
        // If it's a network error, we'll retry
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          // Exponential backoff delay
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 1.5; // Increase delay for next attempt
          continue;
        }
        
        // For other errors, only retry server errors (5xx)
        if (!error.status || error.status < 500) {
          throw error;
        }
      }
      
      // If we reach here, it's a retryable error
      // Wait before next attempt with exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 1.5; // Increase delay for next attempt
    }
    
    // All retries failed
    throw lastError || new Error(`Failed to fetch ${url} after ${state.apiRetryCount} attempts`);
  },

  /**
   * Register event handlers with event registry
   */
  registerEvents() {
    try {
      if (eventRegistry && typeof eventRegistry.on === 'function') {
        // Listen for socket events through event registry to avoid circular dependencies
        eventRegistry.on('socket.progress_update', (data) => {
          if (data.task_id === state.currentTaskId) {
            this.processStatusUpdate(data);
          }
        });
        
        // IMPROVED: Task completion detection with duplicate prevention
        eventRegistry.on('socket.task_completed', (data) => {
          if (data.task_id === state.currentTaskId) {
            // Mark as completed first to prevent duplicate completion
            if (!state.completionState.completed) {
              console.log("Task completion event received from socket:", data);
              state.completionState.completed = true;
              state.completionState.completionTime = Date.now();
              this.handleTaskCompletion(data);
            } else {
              console.log("Ignoring duplicate task completion event");
            }
          }
        });
        
        eventRegistry.on('socket.task_error', (data) => {
          if (data.task_id === state.currentTaskId) {
            // Mark error state to prevent duplicates
            if (!state.completionState.error) {
              state.completionState.error = true;
              this.handleTaskError(data);
            }
          }
        });
        
        eventRegistry.on('socket.task_cancelled', (data) => {
          if (data.task_id === state.currentTaskId) {
            // Mark cancelled state to prevent duplicates
            if (!state.completionState.cancelled) {
              state.completionState.cancelled = true;
              this.handleTaskCancellation(data);
            }
          }
        });
        
        // Register form submit handler through uiRegistry if available
        const form = uiRegistry.getElement ? uiRegistry.getElement('fileTab.form') : null;
        if (form) {
          form.addEventListener('submit', this.handleFileSubmit.bind(this));
        } else {
          console.warn("Form element not found in uiRegistry, will use fallback");
        }
        
        // Listen for history events
        eventRegistry.on('history.saved', (data) => {
          console.log("Task saved in history:", data);
        });
        
        console.log("Event handlers registered through event registry");
      } else {
        console.warn("Event registry not available for registering events");
      }
    } catch (error) {
      this.handleError(error, "Error registering events");
    }
  },
  /**
   * Initializes progress tracking for a file processing task
   * @param {string} taskId - The ID of the task to track
   * @returns {Object} Progress handler instance
   */
  async initializeTaskProgress(taskId) {
    try {
      if (!taskId) {
        console.error("No task ID provided for progress tracking");
        return null;
      }
      
      // Use progress handler's functionality directly
      if (progressHandler && typeof progressHandler.trackProgress === 'function') {
        // Use the trackProgress method directly from progressHandler
        const progress = progressHandler.trackProgress(taskId, {
          elementPrefix: '',  // Use default prefixes for main file tab
          saveToSessionStorage: true,
          taskType: 'file'
        });
        
        // Store the progress handler in state
        state.progressHandler = progress;
        
        console.log(`Progress tracking initialized for task ${taskId}`);
        return progress;
      } else {
        console.warn("Progress handler not available or missing trackProgress method");
        return null;
      }
    } catch (error) {
      this.handleError(error, "Error initializing task progress");
      return null;
    }
  },
  /**
   * Check for ongoing task from previous session
   * UPDATED: Properly uses imported trackProgress
   */
  checkForOngoingTask() {
    try {
      const taskId = sessionStorage.getItem('ongoingTaskId');
      const taskType = sessionStorage.getItem('ongoingTaskType');
      
      if (taskId && taskType === 'file') {
        console.log(`Found ongoing file processing task: ${taskId}`);
        
        // Set current task ID
        state.currentTaskId = taskId;
        state.processing = true;
        
        // Save the start time if not already set
        if (!sessionStorage.getItem('taskStartTime')) {
          sessionStorage.setItem('taskStartTime', Date.now().toString());
        }
        
        // Show progress UI
        this.showProgress();
        
        // Set up progress tracking using imported trackProgress
        // Note: We're now properly using the imported trackProgress function
        state.progressHandler = trackProgress(taskId, {
          elementPrefix: '',  // Use default prefixes for main file tab
          saveToSessionStorage: true,
          taskType: 'file'
        });
        
        // Emit event to trigger status polling
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('file.processing.resume', { task_id: taskId });
        }
        
        // Start manual status polling as a fallback
        this.startManualStatusPolling(taskId);
        
        // Update state manager
        if (stateManager && typeof stateManager.setProcessingActive === 'function') {
          stateManager.setProcessingActive(true);
        }
        
        if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
          stateManager.setCurrentTaskId(taskId);
        }
        
        // Set a safety timeout to check task status after 10 seconds
        setTimeout(() => this.checkTaskStatus(taskId), 10000);
      }
    } catch (error) {
      this.handleError(error, "Error checking for ongoing task");
      // Reset processing state in case of error
      this.forceResetProcessingState();
    }
  },
  /**
   * Check task progress status
   * @param {string} taskId - Task ID to check
   * @returns {Promise<Object>} Task status data
   */
  async checkTaskProgress(taskId) {
    if (!taskId) return null;
    
    try {
      return await blueprintApi.getTaskStatus(taskId, 'file_processor');
    } catch (error) {
      console.error(`Error checking task progress: ${error.message}`);
      return null;
    }
  },
  /**
   * Check task status after a delay
   * @param {string} taskId - The task ID to check
   */
  async checkTaskStatus(taskId) {
    // If still in processing state but no progress updates received
    if (state.processing && state.progressUpdateCount === 0) {
      console.warn("Task appears to be stuck - no progress updates received");
      ui.showToast('Task Issue', 'Task may be stuck. Attempting to recover...', 'warning');
      
      // Try to verify task exists on server
      try {
        const data = await blueprintApi.getTaskStatus(taskId, 'file_processor');
        // If task exists but status is not active, handle it appropriately
        if (data.status === "error" || data.status === "completed" || data.status === "cancelled") {
          console.warn(`Task exists but has inactive status: ${data.status}`);
          if (data.status === "completed") {
            this.handleTaskCompletion(data);
          } else if (data.status === "error") {
            this.handleTaskError(data);
          } else {
            this.handleTaskCancellation(data);
          }
        }
      } catch (error) {
        console.error("Error checking task status:", error);
        // Task not found or other error - reset state
        this.forceResetProcessingState();
        this.showForm();
        ui.showToast('Recovery Complete', 'System state has been reset', 'info');
      }
    }
  },

  /**
   * Set up global error handling for network issues
   */
  setupGlobalErrorHandling() {
    try {
      // Listen for online/offline events
      window.addEventListener('online', this.handleOnlineStatusChange.bind(this));
      window.addEventListener('offline', this.handleOnlineStatusChange.bind(this));
      
      // Create a generic request error handler
      window.addEventListener('unhandledrejection', (event) => {
        if (event.reason instanceof Error && 
            (event.reason.message.includes('network') || 
            event.reason.message.includes('fetch'))) {
          this.handleApiError(event.reason);
        }
      });
    } catch (error) {
      this.handleError(error, "Error setting up global error handling");
    }
  },

  /**
   * Handle online/offline status changes
   * @param {Event} event - Online/offline event
   */
  handleOnlineStatusChange(event) {
    try {
      const isOnline = navigator.onLine;
      if (isOnline) {
        console.log("Network connection restored");
        this.logToTerminal('info', 'Network connection restored');
        
        // If we're processing a task, try to reconnect websocket
        if (state.processing && state.currentTaskId) {
          this.attemptSocketReconnection();
        }
      } else {
        console.warn("Network connection lost");
        this.logToTerminal('warning', 'Network connection lost');
        
        // If we're processing, show a warning to the user
        if (state.processing) {
          ui.showToast('Network Issue', 'Network connection lost. Waiting to reconnect...', 'warning');
        }
      }
    } catch (error) {
      this.handleError(error, "Error handling online status change");
    }
  },

  /**
   * Handle API error
   * @param {Error} error - API error
   */
  handleApiError(error) {
    console.error('API error:', error);
    
    // If we're processing, show a warning to the user
    if (state.processing) {
      ui.showToast('API Error', error.message || 'Error communicating with server', 'error');
    }
    
    // Log to terminal
    this.logToTerminal('error', `API error: ${error.message || 'Unknown error'}`);
  },

  /**
   * Attempt to reconnect socket via event registry
   */
  attemptSocketReconnection() {
    try {
      if (state.socketReconnectAttempts < state.maxSocketReconnects) {
        state.socketReconnectAttempts++;
        console.log(`Attempting to reconnect socket (attempt ${state.socketReconnectAttempts}/${state.maxSocketReconnects})`);
        
        // Emit reconnect event
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('socket.reconnect.request', {
            task_id: state.currentTaskId
          });
        }
        
        // Start manual polling as fallback
        this.startManualStatusPolling(state.currentTaskId);
      } else {
        console.error("Max socket reconnection attempts reached");
        this.logToTerminal('error', 'Max socket reconnection attempts reached');
      }
    } catch (error) {
      this.handleError(error, "Error attempting socket reconnection");
    }
  },

  /**
   * Start manual polling for task status when socket is unavailable
   * @param {string} taskId - The task ID to poll for
   */
  startManualStatusPolling(taskId) {
    try {
      if (!taskId || !state.processing) return;
      
      console.log("Starting manual status polling");
      this.logToTerminal('info', 'Starting manual status polling for task updates');
      
      // Clear existing interval if present
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
      }
      
      // Reset error count
      state.statusPollErrorCount = 0;
      
      // Create polling interval
      state.statusPollInterval = setInterval(async () => {
        if (!state.processing || !state.currentTaskId) {
          clearInterval(state.statusPollInterval);
          state.statusPollInterval = null;
          return;
        }
        
        try {
          const data = await blueprintApi.getTaskStatus(taskId, 'file_processor');
          
          // Process the status update
          this.processStatusUpdate(data);
          
          // Handle task completion, error, or cancellation
          if (data.status === 'completed' && !state.completionState.completed) {
            state.completionState.completed = true;
            this.handleTaskCompletion(data);
          } else if (data.status === 'error' && !state.completionState.error) {
            state.completionState.error = true;
            this.handleTaskError(data);
          } else if (data.status === 'cancelled' && !state.completionState.cancelled) {
            state.completionState.cancelled = true;
            this.handleTaskCancellation(data);
          }
        } catch (error) {
          console.error("Error polling task status:", error);
          
          // If we get multiple errors, stop polling
          if (++state.statusPollErrorCount >= 5) {
            console.warn("Too many status polling errors, stopping polling");
            clearInterval(state.statusPollInterval);
            state.statusPollInterval = null;
          }
        }
      }, PROGRESS_POLL_INTERVAL_MS);
    } catch (error) {
      this.handleError(error, "Error starting manual status polling");
    }
  },
  /**
   * Debounced UI update function to prevent excessive DOM operations
   * Uses UI_UPDATE_DEBOUNCE_MS for debounce timing
   * @param {Function} updateFn - The update function to call
   * @param {Array} args - Arguments to pass to the update function
   */
  debouncedUIUpdate(updateFn, ...args) {
    try {
      // Clear any existing timer
      if (state.uiUpdateTimer) {
        clearTimeout(state.uiUpdateTimer);
      }
      
      // Add update to queue
      state.uiUpdateQueue.push({
        fn: updateFn,
        args: args
      });
      
      // Set new timer using UI_UPDATE_DEBOUNCE_MS
      state.uiUpdateTimer = setTimeout(() => {
        // Process all updates in queue
        while (state.uiUpdateQueue.length > 0) {
          const update = state.uiUpdateQueue.shift();
          try {
            update.fn.apply(this, update.args);
          } catch (error) {
            console.error("Error in debounced UI update:", error);
          }
        }
        
        state.uiUpdateTimer = null;
      }, UI_UPDATE_DEBOUNCE_MS);
    } catch (error) {
      console.error("Error in debounced UI update:", error);
      // Fallback: try to apply the update directly
      try {
        updateFn.apply(this, args);
      } catch (innerError) {
        console.error("Fallback update also failed:", innerError);
      }
    }
  },
  /**
   * Process status update from server
   * @param {Object} data - Status update data
   * Uses imported updateProgressUI instead of this.updateProgressUI
   */
  processStatusUpdate(data) {
    try {
      if (!data || !state.processing) return;
      
      // Update timestamp and count
      state.lastProgressTimestamp = Date.now();
      state.progressUpdateCount++;
      
      // Calculate progress rate for ETA
      if (state.progressUpdateCount > 1) {
        const progressDelta = data.progress - state.lastReportedProgress;
        const timeDelta = (Date.now() - state.processingStartTime) / 1000;
        
        if (progressDelta > 0 && timeDelta > 0) {
          // Progress per second
          const rate = progressDelta / timeDelta;
          
          // Add to rates array for averaging
          state.progressRates.push(rate);
          
          // Keep only last N rates
          if (state.progressRates.length > MAX_PROGRESS_RATES) {
            state.progressRates.shift();
          }
        }
      }
      
      // Save last reported progress
      state.lastReportedProgress = data.progress || 0;
      
      // Calculate ETA
      let eta = null;
      if (state.progressRates.length > 0) {
        // Average rate from collected rates
        const avgRate = state.progressRates.reduce((sum, rate) => sum + rate, 0) / state.progressRates.length;
        
        if (avgRate > 0) {
          // Remaining progress percentage / progress per second = seconds remaining
          const remainingProgress = 100 - (data.progress || 0);
          eta = remainingProgress / avgRate;
        }
      }
      
      // Use the imported updateProgressUI function
      updateProgressUI(state.currentTaskId, data.progress || 0, data.message || 'Processing...', {
        eta: eta ? utils.formatDuration(eta) : null,
        stats: data.stats || {},
        details: data.details || {}
      });
      
      // Monitor for progress stuck at 99% for too long
      if (data.progress > 98 && data.progress < 100) {
        this.monitorCompletionProgress();
      }
      
      // Update state manager if available
      if (stateManager && typeof stateManager.setState === 'function') {
        stateManager.setState({
          fileProcessing: {
            progress: data.progress || 0,
            status: data.message || 'Processing...',
            taskId: state.currentTaskId
          }
        });
      }
    } catch (error) {
      this.handleError(error, "Error processing status update");
    }
  },

  /**
   * Update progress UI elements directly
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Status message
   * @param {Object} stats - Optional statistics
   */
  updateProgressUI(progress, message, stats = null) {
    try {
      // Get elements using DOM utils to avoid redeclarations
      const elements = getUIElements({
        progressBar: 'progress-bar',
        progressStatus: 'progress-status',
        progressStats: 'progress-stats',
        progressContainer: 'progress-container',
        cancelButton: 'cancel-btn'
      });
      
      // Update progress bar if it exists
      if (elements.progressBar) {
        const percent = Math.round(progress);
        elements.progressBar.style.width = `${percent}%`;
        elements.progressBar.setAttribute('aria-valuenow', percent);
        elements.progressBar.textContent = `${percent}%`;
        
        // IMPROVED: Add color based on progress
        if (percent < 30) {
          elements.progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
        } else if (percent < 70) {
          elements.progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
        } else {
          elements.progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-success';
        }
      }
      
      // Update status text if it exists
      if (elements.progressStatus) {
        elements.progressStatus.textContent = message;
      }
      
      // Update stats if provided and element exists
      if (stats && elements.progressStats) {
        // Clear existing stats
        elements.progressStats.innerHTML = '';
        
        // Create stats items
        for (const [key, value] of Object.entries(stats)) {
          if (key === 'task_id' || key === 'status') continue; // Skip these
          
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          
          const statItem = document.createElement('div');
          statItem.className = 'stat-item';
          statItem.innerHTML = `<span class="stat-label">${formattedKey}:</span> <span class="stat-value">${value}</span>`;
          elements.progressStats.appendChild(statItem);
        }
        
        // Add ETA if available
        if (stats.eta || (state.progressRates.length > 0 && progress < 100)) {
          const etaElement = document.createElement('div');
          etaElement.className = 'stat-item';
          
          let etaText = 'Calculating...';
          
          if (stats.eta) {
            etaText = stats.eta;
          } else if (state.progressRates.length > 0) {
            // Calculate ETA
            const avgRate = state.progressRates.reduce((sum, rate) => sum + rate, 0) / state.progressRates.length;
            
            if (avgRate > 0) {
              const remainingProgress = 100 - progress;
              const etaSeconds = remainingProgress / avgRate;
              etaText = utils.formatDuration(etaSeconds);
            }
          }
          
          etaElement.innerHTML = `<span class="stat-label">Estimated Time:</span> <span class="stat-value">${etaText}</span>`;
          elements.progressStats.appendChild(etaElement);
        }
      }
    } catch (error) {
      console.error("Error updating progress UI:", error);
    }
  },

  /**
   * Monitor for tasks stuck at near-completion
   * Start a watchdog timer to check if a task is stuck at 99%
   */
  monitorCompletionProgress() {
    try {
      if (!state.completionMonitoring.enabled) return;
      
      const { timeoutIds, checkIntervalMs, maxStuckDurationMs } = state.completionMonitoring;
      const threshold = 99;
      
      // If we're at 99% or higher, start monitoring
      if (state.lastReportedProgress >= threshold) {
        console.log("Task reached 99% completion, starting completion monitoring");
        
        // Set start time if not already set
        if (!state.completionMonitoring.startTime) {
          state.completionMonitoring.startTime = Date.now();
        }
        
        // Start a timer to check if we're stuck
        const timeoutId = setTimeout(() => {
          const elapsedTime = Date.now() - state.completionMonitoring.startTime;
          
          if (state.processing && 
              state.lastReportedProgress >= threshold && 
              state.lastReportedProgress < 100 &&
              elapsedTime > maxStuckDurationMs) {
            
            console.warn(`Task appears stuck at ${state.lastReportedProgress}% for ${elapsedTime/1000}s`);
            
            // Add warning to UI
            const progressStatus = getElement('progress-status');
            if (progressStatus) {
              progressStatus.innerHTML += ' <span class="text-warning">(Task may be stuck at completion - please wait)</span>';
            }
            
            // Show toast notification
            ui.showToast(
              'Task Near Completion', 
              'The task appears to be stuck at completion stage. This may happen with large files. Please wait...', 
              'warning'
            );
            
            // If user enabled error recovery features, we could attempt recovery:
            if (sessionStorage.getItem('errorRecoveryEnabled') === 'true') {
              // Add a button to force complete if stuck too long
              const progressContainer = getElement('progress-action-buttons');
              
              if (progressContainer && !getElement('force-complete-btn')) {
                const forceCompleteBtn = createElement('button', {
                  id: 'force-complete-btn',
                  className: 'btn btn-warning ms-2'
                });
                forceCompleteBtn.innerHTML = '<i class="fas fa-bolt me-1"></i> Force Complete';
                forceCompleteBtn.addEventListener('click', this.handleForceComplete.bind(this));
                
                progressContainer.appendChild(forceCompleteBtn);
              }
            }
          }
          
          // Remove this timeout ID from the set
          timeoutIds.delete(timeoutId);
          
          // Continue monitoring if still processing and not complete
          if (state.processing && !state.completionState.completed && state.lastReportedProgress < 100) {
            this.monitorCompletionProgress();
          }
        }, checkIntervalMs);
        
        // Store timeout ID for cleanup
        timeoutIds.add(timeoutId);
      }
    } catch (error) {
      console.error("Error in completion monitoring:", error);
    }
  },

  /**
   * Handle force completion of a stuck task
   */
  async handleForceComplete() {
    try {
      console.log("User requested force completion of potentially stuck task");
      
      // Update UI to indicate force completion attempt
      const progressStatus = getElement('progress-status');
      if (progressStatus) {
        progressStatus.textContent = "Attempting to force task completion...";
      }
      
      // Try to force complete via API call
      const response = await this.fetchWithRetry(`/api/force-complete/${state.currentTaskId}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Force completion failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log("Force completion succeeded:", result);
        
        // Create a synthetic completion event
        const completionData = {
          task_id: state.currentTaskId,
          status: 'completed',
          message: 'Force completed',
          output_file: result.output_file || state.taskData.outputFile,
          progress: 100,
          stats: result.stats || state.taskData.stats || { force_completed: true }
        };
        
        this.handleTaskCompletion(completionData);
      } else {
        throw new Error(result.error || "Force completion failed");
      }
    } catch (error) {
      this.handleError(error, "Error forcing task completion");
      ui.showToast('Error', `Failed to force completion: ${error.message}`, 'error');
    }
  },

  /**
   * Force reset processing state in case of error
   */
  forceResetProcessingState() {
    console.log("Force resetting processing state");
    
    // Clear all relevant state
    state.processing = false;
    state.currentTaskId = null;
    state.processingStartTime = null;
    state.isProcessingCancelled = false;
    state.progressUpdateCount = 0;
    state.lastProgressTimestamp = null;
    state.progressRates = [];
    state.lastReportedProgress = -1;
    
    // Clear timeouts/intervals
    if (state.statusPollInterval) {
      clearInterval(state.statusPollInterval);
      state.statusPollInterval = null;
    }
    
    // Clear completion monitoring timeouts
    state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
    state.completionMonitoring.timeoutIds.clear();
    state.completionMonitoring.startTime = null;
    
    // Clear socket reconnect state
    state.socketReconnectAttempts = 0;
    
    // Clear session storage for safety
    this.clearTaskSessionData();
    
    // Reset completion state
    state.completionState = {
      completed: false,
      completionTime: null,
      error: false,
      cancelled: false
    };
    
    // Clear task data
    state.taskData = {};
    
    // Reset UI state
    state.uiState = {
      isResultShown: false,
      isErrorShown: false,
      isCancelledShown: false,
      isFormShown: false
    };
    
    // Update state manager if available
    if (stateManager && typeof stateManager.setState === 'function') {
      stateManager.setState({
        fileProcessing: {
          progress: 0,
          status: 'Idle',
          taskId: null,
          active: false
        }
      });
    }
    
    // Log to terminal
    this.logToTerminal('warning', 'Processing state has been forcibly reset due to an error');
  },

  /**
   * Initialize the relationship between file input and output format
   */
  initializeInputOutputRelationship() {
    try {
      // Get file input element
      const fileInput = getElement('folder-input');
      
      // Get output format select element
      const outputFormat = getElement('output-format');
      
      if (!fileInput || !outputFormat) return;
      
      // Listen for file selection to update available output formats
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        
        // Get file extension
        const fileExt = file.name.split('.').pop().toLowerCase();
        
        // Clear output format options
        outputFormat.innerHTML = '';
        
        // Common formats for all inputs
        const commonFormats = [
          ['txt', 'Text (.txt)'],
          ['json', 'JSON (.json)']
        ];
        
        // Special formats based on input type
        const specialFormats = [];
        
        switch (fileExt) {
          case 'pdf':
            specialFormats.push(
              ['md', 'Markdown (.md)'],
              ['docx', 'Word Document (.docx)'],
              ['html', 'HTML (.html)']
            );
            break;
            
          case 'docx':
          case 'doc':
            specialFormats.push(
              ['md', 'Markdown (.md)'],
              ['pdf', 'PDF Document (.pdf)'],
              ['html', 'HTML (.html)']
            );
            break;
            
          case 'txt':
          case 'md':
            specialFormats.push(
              ['docx', 'Word Document (.docx)'],
              ['pdf', 'PDF Document (.pdf)'],
              ['html', 'HTML (.html)']
            );
            break;
            
          case 'csv':
          case 'xlsx':
          case 'xls':
            specialFormats.push(
              ['xlsx', 'Excel (.xlsx)'],
              ['csv', 'CSV (.csv)'],
              ['html', 'HTML Table (.html)']
            );
            break;
            
          case 'html':
          case 'htm':
            specialFormats.push(
              ['pdf', 'PDF Document (.pdf)'],
              ['docx', 'Word Document (.docx)'],
              ['md', 'Markdown (.md)']
            );
            break;
            
          default:
            // For other formats, just use common formats
            break;
        }
        
        // Combine and add options
        const allFormats = [...specialFormats, ...commonFormats];
        
        // Create and append options
        allFormats.forEach(([value, label]) => {
          const option = createElement('option', {
            value: value
          }, label);
          outputFormat.appendChild(option);
        });
        
        // Set initial value based on file type
        if (specialFormats.length > 0) {
          outputFormat.value = specialFormats[0][0];
        } else {
          outputFormat.value = commonFormats[0][0];
        }
      });
    } catch (error) {
      this.handleError(error, "Error initializing input/output relationship");
    }
  },

  /**
   * Initialize browse buttons
   */
  initializeBrowseButtons() {
    try {
      // Get browse button for file input
      const browseBtn = getElement('browse-btn');
      const fileInput = getElement('folder-input');
      
      if (browseBtn && fileInput) {
        // Set up browse button to trigger file input
        browseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          fileInput.click();
        });
        
        // Handle file selection
        fileInput.addEventListener('change', this.handleFileSelection.bind(this));
      }
      
      // Browse button for directories (if present)
      const dirBrowseBtn = getElement('directory-browse-btn');
      const inputDirField = getElement('input-dir');
      
      if (dirBrowseBtn && inputDirField) {
        dirBrowseBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.handleDirBrowseClick(inputDirField);
        });
      }
    } catch (error) {
      this.handleError(error, "Error initializing browse buttons");
    }
  },

  /**
   * Handle browse button click for directory selection
   * @param {HTMLElement} inputField - The input field to update with selected path
   * @returns {Promise<boolean>} Success state
   */
  async handleDirBrowseClick(inputField) {
    try {
      if (!inputField) return false;
      
      // Check if we can use the fileHandler
      if (fileHandler && typeof fileHandler.selectDirectory === 'function') {
        const result = await fileHandler.selectDirectory();
        
        if (result && result.path) {
          inputField.value = result.path;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          inputField.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      } else {
        // Fallback - try to use a directory picker if available
        try {
          // @ts-ignore - Window.showDirectoryPicker is not in types yet
          const dirHandle = await window.showDirectoryPicker();
          if (dirHandle) {
            const path = dirHandle.name; // This is just the directory name, not full path
            inputField.value = path;
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        } catch (e) {
          console.warn("Directory picker not supported:", e);
          // If directory picker not supported, show a message
          ui.showToast('Not Supported', 'Directory selection is not supported in this browser. Please enter the path manually.', 'warning');
        }
      }
      
      return false;
    } catch (error) {
      this.handleError(error, "Error handling directory browse");
      return false;
    }
  },

  /**
   * Handle browse button click for file selection
   */
  handleBrowseClick() {
    try {
      // Get the file input element
      const fileInput = getElement('folder-input');
      if (fileInput) {
        fileInput.click();
      }
    } catch (error) {
      this.handleError(error, "Error handling browse click");
    }
  },

  /**
   * Initialize browser drag and drop file handling
   */
  initializeDragAndDrop() {
    try {
      // Get drop zone element
      const dropZone = getElement('drop-zone');
      const fileInput = getElement('folder-input');
      
      if (!dropZone || !fileInput) return;
      
      // Prevent default behaviors
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });
      
      // Highlight drop zone when dragging over
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
          dropZone.classList.add('drop-zone-active');
        }, false);
      });
      
      // Remove highlight when dragging leaves
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
          dropZone.classList.remove('drop-zone-active');
        }, false);
      });
      
      // Handle file drop
      dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          fileInput.files = files;
          this.handleFileSelection({ target: fileInput });
        }
      }, false);
    } catch (error) {
      this.handleError(error, "Error initializing drag and drop");
    }
  },
  /**
   * Set up event listeners for UI elements
   * Uses addEventListeners for more concise code
   */
  setupUIEventListeners() {
    try {
      // Get UI elements
      const elements = {
        newTaskBtn: getElement('new-task-btn'),
        cancelBtn: getElement('cancel-btn'),
        cancelledNewTaskBtn: getElement('cancelled-new-task-btn'),
        retryBtn: getElement('retry-btn'),
        openBtn: getElement('open-btn'),
        form: getElement('process-form'),
        dropZone: getElement('drop-zone')
      };
      
      // Use addEventListeners to attach events
      if (elements.newTaskBtn) {
        addEventListeners(elements.newTaskBtn, 'click', this.handleNewTaskClick.bind(this));
      }
      
      if (elements.cancelBtn) {
        addEventListeners(elements.cancelBtn, 'click', this.handleCancelClick.bind(this));
      }
      
      if (elements.cancelledNewTaskBtn) {
        addEventListeners(elements.cancelledNewTaskBtn, 'click', this.handleNewTaskClick.bind(this));
      }
      
      if (elements.retryBtn) {
        addEventListeners(elements.retryBtn, 'click', this.handleNewTaskClick.bind(this));
      }
      
      if (elements.form) {
        addEventListeners(elements.form, 'submit', this.handleFileSubmit.bind(this));
      }
      
      // Use addEventListeners with multiple event types
      if (elements.dropZone) {
        addEventListeners(elements.dropZone, ['dragenter', 'dragover'], (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.dropZone.classList.add('drop-zone-active');
        });
        
        addEventListeners(elements.dropZone, ['dragleave', 'drop'], (e) => {
          e.preventDefault();
          e.stopPropagation();
          elements.dropZone.classList.remove('drop-zone-active');
        });
      }
      
      console.log("UI event listeners set up successfully");
    } catch (error) {
      this.handleError(error, "Error setting up UI event listeners");
    }
  },
  /**
   * Initialize form validation
   * Uses getElements to get all form inputs for validation
   */
  initializeFormValidation() {
    try {
      const form = getElement('process-form');
      const fileInput = getElement('folder-input');
      const submitBtn = getElement('submit-btn');
      
      if (!form || !fileInput || !submitBtn) return;
      
      // Use getElements to get all required inputs
      const requiredInputs = getElements('input[required], select[required]', form);
      
      // Add validation check for all required inputs
      requiredInputs.forEach(input => {
        input.addEventListener('input', () => {
          const isFormValid = requiredInputs.every(field => {
            if (field.type === 'file') {
              return field.files.length > 0;
            }
            return field.value.trim() !== '';
          });
          
          submitBtn.disabled = !isFormValid;
        });
      });
      
      // Initial button state
      submitBtn.disabled = !fileInput.files.length;
    } catch (error) {
      this.handleError(error, "Error initializing form validation");
    }
  },

  /**
   * Handle file selection event
   * @param {Event} event - The change event
   */
  handleFileSelection(event) {
    try {
      const fileInput = event.target;
      const files = fileInput.files;
      
      if (!files || files.length === 0) return;
      
      // For directory selection, we need to extract the directory path
      // The webkitRelativePath gives us the relative path including directory
      if (files.length > 0 && files[0].webkitRelativePath) {
        const firstFilePath = files[0].webkitRelativePath;
        const directoryName = firstFilePath.split('/')[0];
        
        console.log(`Directory selected: ${directoryName} (${files.length} files)`);
        
        // Update the input-dir field with the directory name
        const inputDirField = getElement('input-dir');
        if (inputDirField) {
          // Note: We only get the directory name, not the full path in web browsers
          inputDirField.value = directoryName;
          inputDirField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Update file info to show directory info
        const selectedFilesInfo = getElement('selected-files-info');
        if (selectedFilesInfo) {
          selectedFilesInfo.innerHTML = `
            <div class="alert alert-info mt-2">
              <i class="fas fa-folder me-2"></i>
              Selected directory: <strong>${directoryName}</strong>
              <br>
              <small class="text-muted">Contains ${files.length} files</small>
            </div>
          `;
        }
        
        // Enable submit button
        const submitBtn = getElement('submit-btn');
        if (submitBtn) {
          submitBtn.disabled = false;
        }
        
        // Store directory info in state
        state.selectedDirectory = {
          name: directoryName,
          fileCount: files.length,
          files: Array.from(files)
        };
        
        // Log to terminal
        this.logToTerminal('info', `Directory selected: ${directoryName} with ${files.length} files`);
      }
    } catch (error) {
      this.handleError(error, "Error handling file selection");
    }
  },

  /**
   * Update file info display
   * @param {File} file - The selected file
   */
  updateFileInfo(file) {
    try {
      // Get elements using getElement to avoid redeclarations
      const elements = getUIElements({
        fileNameLabel: 'file-name',
        fileSizeLabel: 'file-size',
        fileTypeLabel: 'file-type',
        fileInfoPanel: 'file-info-panel'
      });
      
      if (!elements.fileNameLabel || !elements.fileSizeLabel || 
          !elements.fileTypeLabel || !elements.fileInfoPanel) return;
      
      // Update info
      elements.fileNameLabel.textContent = file.name;
      elements.fileSizeLabel.textContent = utils.formatBytes(file.size);
      elements.fileTypeLabel.textContent = file.type || this.getFileTypeFromName(file.name);
      
      // Show file info panel
      elements.fileInfoPanel.classList.remove('d-none');
    } catch (error) {
      this.handleError(error, "Error updating file info");
    }
  },

  /**
     * Handle file submit form event
     * @param {Event} event - The submit event
     */
  async handleFileSubmit(event) {
    event.preventDefault();
    
    try {
      console.log("Handle file submit called");
      
      // Check if we're already processing
      if (state.processing) {
        console.warn("Already processing a file");
        ui.showToast('Processing', 'Already processing a file', 'warning');
        return;
      }
      
      // Get form data
      const form = event.target;
      const formData = new FormData(form);
      
      // Get the input directory path
      const inputDir = formData.get('input_dir');
      const outputFile = formData.get('output_file');
      
      // Validate input directory
      if (!inputDir || inputDir.trim() === '') {
        console.error("No input directory specified");
        ui.showToast('Error', 'Please select or enter an input directory', 'error');
        return;
      }
      
      // Validate output filename
      if (!outputFile || outputFile.trim() === '') {
        console.error("No output filename specified");
        ui.showToast('Error', 'Please enter an output filename', 'error');
        return;
      }
      
      console.log("Processing directory:", inputDir);
      console.log("Output file:", outputFile);
      
      // Start processing the directory
      await this.processDirectory({
        input_dir: inputDir,
        output_file: outputFile
      });
    } catch (error) {
      this.handleError(error, "Error submitting file");
    }
  },

  /**
   * Validate file before processing
   * @param {File} file - The file to validate
   * @returns {boolean} - Whether the file is valid
   */
  validateFile(file) {
    if (!file) {
      ui.showToast('Error', 'No file selected', 'error');
      return false;
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      ui.showToast('Error', `File too large (max: ${utils.formatBytes(MAX_FILE_SIZE)})`, 'error');
      return false;
    }
    
    // Check file type
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!this.isValidFileType(fileExt)) {
      ui.showToast('Error', `Invalid file type: .${fileExt}`, 'error');
      return false;
    }
    
    return true;
  },

  /**
   * Check if a file extension is valid for processing
   * @param {string} extension - File extension (without the dot)
   * @returns {boolean} - Whether the file type is valid
   */
  isValidFileType(extension) {
    return VALID_FILE_EXTENSIONS.includes(extension.toLowerCase());
  },

  /**
   * Get file type from file name
   * @param {string} fileName - File name
   * @returns {string} - File type description
   */
  getFileTypeFromName(fileName) {
    try {
      const extension = fileName.split('.').pop().toLowerCase();
      
      const typeMap = {
        'pdf': 'PDF Document',
        'doc': 'Word Document',
        'docx': 'Word Document',
        'txt': 'Text Document',
        'md': 'Markdown Document',
        'html': 'HTML Document',
        'htm': 'HTML Document',
        'csv': 'CSV Spreadsheet',
        'xlsx': 'Excel Spreadsheet',
        'xls': 'Excel Spreadsheet',
        'json': 'JSON Data',
        'xml': 'XML Data',
        'rtf': 'Rich Text Document',
        'ppt': 'PowerPoint Presentation',
        'pptx': 'PowerPoint Presentation'
      };
      
      return typeMap[extension] || `${extension.toUpperCase()} File`;
    } catch (error) {
      return 'Unknown Type';
    }
  },

  /**
   * Process a directory with server-side processing
   * @param {Object} options - Processing options with input_dir and output_file
   * @returns {Promise<Object>} - Processing result
   */
  async processDirectory(options = {}) {
    try {
      console.log(`Processing directory: ${options.input_dir}`);
      this.logToTerminal('info', `Starting directory processing for ${options.input_dir}`);
      
      // Set processing state
      state.processing = true;
      state.processingStartTime = Date.now();
      state.progressUpdateCount = 0;
      state.progressRates = [];
      
      // Show progress UI
      this.showProgress();
      
      // Prepare the request data
      const requestData = {
        input_dir: options.input_dir,
        output_file: options.output_file
      };
      
      // Log start of processing
      this.logToTerminal('info', `Processing all files in directory: ${options.input_dir}`);
      this.logToTerminal('info', `Output will be saved to: ${options.output_file}.json`);
      
      // Start the processing task using Blueprint API
      const result = await blueprintApi.processFiles(
        requestData.input_dir,
        requestData.output_file,
        {
          ...requestData,
          input_dir: undefined,
          output_file: undefined
        }
      );
      console.log("Processing started:", result);
      
      if (!result.task_id) {
        throw new Error("No task ID received from server");
      }
      
      // Store task ID and info
      state.currentTaskId = result.task_id;
      state.currentTaskInfo = result;
      
      // Save to session storage for recovery
      sessionStorage.setItem('ongoingTaskId', result.task_id);
      sessionStorage.setItem('ongoingTaskType', 'file');
      sessionStorage.setItem('taskStartTime', Date.now().toString());
      
      // Initialize progress tracking
      await this.initializeTaskProgress(result.task_id);
      
      // Update progress status
      this.updateProgressUI(0, 'Initializing directory processing...');
      
      // Log task started
      this.logToTerminal('success', `Processing task started with ID: ${result.task_id}`);
      
      return result;
    } catch (error) {
      // Reset state on error
      state.processing = false;
      
      // Clear session storage
      this.clearTaskSessionData();
      
      // Show error UI
      this.showError(error.message);
      
      // Re-throw for caller to handle
      throw error;
    }
  },

  /**
   * Process a file with server-side processing
   * @param {File} file - The file to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processing result
   */
  async processFile(file, options = {}) {
    try {
      console.log(`Processing file: ${file.name}`);
      this.logToTerminal('info', `Starting file processing for ${file.name}`);
      
      // Set processing state
      state.processing = true;
      state.processingStartTime = Date.now();
      state.progressUpdateCount = 0;
      state.progressRates = [];
      
      // Show progress UI
      this.showProgress();
      
      // Create FormData for the file upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Add options to FormData
      if (options.outputFormat) {
        formData.append('output_format', options.outputFormat);
      }
      
      if (options.outputFileName) {
        formData.append('output_filename', options.outputFileName);
      }
      
      // Additional options
      if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          formData.append(key, value);
        }
      }
      
      // Log start of processing
      this.logToTerminal('info', `Uploading file: ${file.name} (${utils.formatBytes(file.size)})`);
      
      // First verify the output path is valid
      if (options.outputPath) {
        await this.verifyOutputPath(options.outputPath);
      }
      
      // Start the processing task using Blueprint API
      const timeout = file.size > 10 * 1024 * 1024 ? 60000 : 30000; // 60s for large files, 30s for small
      const result = await blueprintApi.processFileUpload(formData, timeout);
      
      // Check for task ID
      if (!result.task_id) {
        throw new Error('No task ID returned from server');
      }
      
      // Save task ID and data
      state.currentTaskId = result.task_id;
      state.taskData = {
        file: file.name,
        fileSize: file.size,
        fileType: file.type || this.getFileTypeFromName(file.name),
        outputFormat: options.outputFormat,
        outputFileName: options.outputFileName,
        outputFile: result.output_file || null,
        taskId: result.task_id,
        startTime: Date.now()
      };
      
      // Save relevant info to session storage for recovery after page reload
      sessionStorage.setItem('ongoingTaskId', result.task_id);
      sessionStorage.setItem('ongoingTaskType', 'file');
      sessionStorage.setItem('outputFile', result.output_file || '');
      sessionStorage.setItem('taskStartTime', Date.now().toString());
      
      // Update state in state manager if available
      if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
        stateManager.setCurrentTaskId(result.task_id);
      }
      
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(true);
      }
      
      // Update progress UI initially using direct UI update to avoid dependency issues
      this.updateProgressUI(0, 'Processing started...', {
        file_name: file.name,
        file_size: utils.formatBytes(file.size),
        task_id: result.task_id
      });
      
      // Set up progress tracking using trackProgress from progressHandler
      state.progressHandler = trackProgress(result.task_id, {
        elementPrefix: '',  // Use default prefixes
        saveToSessionStorage: true,
        taskType: 'file'
      });
      
      // Log task start
      this.logToTerminal('info', `Processing task started with ID: ${result.task_id}`);
      console.log(`Processing task started with ID: ${result.task_id}`);
      
      return result;
    } catch (error) {
      // Handle error and reset state
      this.handleError(error, "Error processing file");
      this.handleProcessingError(error);
      return null;
    }
  },

  /**
   * Verify an output path is valid
   * @param {string} path - The path to verify
   * @returns {Promise<boolean>} - Whether the path is valid
   */
  async verifyOutputPath(path) {
    try {
      const result = await blueprintApi.verifyPath(path);
      return result.valid;
    } catch (error) {
      this.handleError(error, "Error verifying output path");
      ui.showToast('Error', `Invalid output path: ${error.message}`, 'error');
      return false;
    }
  },

  /**
   * Handle processing error
   * @param {Error} error - The error that occurred
   */
  handleProcessingError(error) {
    // Reset processing state
    state.processing = false;
    
    // Clear session storage
    this.clearTaskSessionData();
    
    // Update UI
    this.showError(error.message);
    
    // Log to terminal
    this.logToTerminal('error', `Processing error: ${error.message}`);
  },

  /**
   * Handle task completion
   * @param {Object} data - Completion data
   */
  handleTaskCompletion(data) {
    try {
      // Skip if already handled or not processing
      if (!state.processing || state.completionState.completed) {
        console.log("Ignoring duplicate completion or completion after processing ended");
        return;
      }
      
      console.log("Task completed:", data);
      
      // Mark as completed
      state.completionState.completed = true;
      state.completionState.completionTime = Date.now();
      
      // Clear timeouts and intervals
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear monitoring timeouts
      state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
      state.completionMonitoring.timeoutIds.clear();
      
      // Save output file path if available
      if (data.output_file) {
        state.taskData.outputFile = data.output_file;
      }
      
      // Save stats if available
      if (data.stats) {
        state.taskData.stats = data.stats;
      }
      
      // Process any additional data
      if (data.message) {
        state.taskData.completionMessage = data.message;
      }
      
      // Add to history if history manager is available
      if (historyManager && typeof historyManager.addTaskToHistory === 'function' && state.historyInitialized) {
        const historyItem = {
          id: data.task_id || state.currentTaskId,
          type: 'file',
          file: state.taskData.file,
          fileSize: state.taskData.fileSize,
          fileType: state.taskData.fileType,
          outputFile: state.taskData.outputFile,
          outputFormat: state.taskData.outputFormat,
          startTime: state.taskData.startTime,
          endTime: Date.now(),
          duration: Date.now() - state.taskData.startTime,
          stats: state.taskData.stats || data.stats || {},
          status: 'completed'
        };
        
        historyManager.addTaskToHistory(historyItem);
      }
      
      // Set a small delay before showing completion to ensure UI updates
      setTimeout(() => {
        // End processing state
        state.processing = false;
        
        // Ensure progress bar shows 100%
        const progressBar = getElement('progress-bar');
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.setAttribute('aria-valuenow', '100');
          progressBar.textContent = '100%';
        }
        
        // Show completion UI
        this.showCompletion(data);
        
        // Update state manager
        if (stateManager && typeof stateManager.setProcessingActive === 'function') {
          stateManager.setProcessingActive(false);
        }
        
        // Log to terminal
        this.logToTerminal('success', `Task completed successfully: ${state.taskData.file}`);
        
        // Record in session storage that task is complete
        sessionStorage.setItem('taskCompletionTime', Date.now().toString());
        
        // Clean up session storage after a delay
        setTimeout(() => {
          this.clearTaskSessionData();
        }, 5000);
      }, TASK_COMPLETION_DELAY);
    } catch (error) {
      this.handleError(error, "Error handling task completion");
      // Fallback to showing error
      this.showError("Error during task completion");
    }
  },

  /**
   * Handle task error
   * @param {Object} data - Error data
   */
  handleTaskError(data) {
    try {
      // Skip if already handled or not processing
      if (!state.processing || state.completionState.error) {
        console.log("Ignoring duplicate error or error after processing ended");
        return;
      }
      
      console.error("Task error:", data);
      
      // Mark as error
      state.completionState.error = true;
      
      // Clear timeouts and intervals
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear monitoring timeouts
      state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
      state.completionMonitoring.timeoutIds.clear();
      
      // Add to history if history manager is available
      if (historyManager && typeof historyManager.addTaskToHistory === 'function' && state.historyInitialized) {
        const historyItem = {
          id: data.task_id || state.currentTaskId,
          type: 'file',
          file: state.taskData.file,
          fileSize: state.taskData.fileSize,
          fileType: state.taskData.fileType,
          startTime: state.taskData.startTime,
          endTime: Date.now(),
          duration: Date.now() - state.taskData.startTime,
          error: data.error || 'Unknown error',
          status: 'error'
        };
        
        historyManager.addTaskToHistory(historyItem);
      }
      
      // End processing state
      state.processing = false;
      
      // Show error UI
      this.showError(data.error || "An error occurred during processing");
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Log to terminal
      this.logToTerminal('error', `Task error: ${data.error || 'Unknown error'}`);
      
      // Clean up session storage
      this.clearTaskSessionData();
    } catch (error) {
      this.handleError(error, "Error handling task error");
      // Fallback to showing error
      this.showError("Error during error handling");
    }
  },

  /**
   * Handle task cancellation
   * @param {Object} data - Cancellation data
   */
  handleTaskCancellation(data) {
    try {
      // Skip if already handled or not processing
      if (!state.processing || state.completionState.cancelled) {
        console.log("Ignoring duplicate cancellation or cancellation after processing ended");
        return;
      }
      
      console.log("Task cancelled:", data);
      
      // Mark as cancelled
      state.completionState.cancelled = true;
      
      // Clear timeouts and intervals
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear monitoring timeouts
      state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
      state.completionMonitoring.timeoutIds.clear();
      
      // Add to history if history manager is available
      if (historyManager && typeof historyManager.addTaskToHistory === 'function' && state.historyInitialized) {
        const historyItem = {
          id: data.task_id || state.currentTaskId,
          type: 'file',
          file: state.taskData.file,
          fileSize: state.taskData.fileSize,
          fileType: state.taskData.fileType,
          startTime: state.taskData.startTime,
          endTime: Date.now(),
          duration: Date.now() - state.taskData.startTime,
          status: 'cancelled'
        };
        
        historyManager.addTaskToHistory(historyItem);
      }
      
      // End processing state
      state.processing = false;
      
      // Show cancellation UI
      this.showCancelled();
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Log to terminal
      this.logToTerminal('warning', `Task cancelled: ${state.taskData.file}`);
      
      // Clean up session storage
      this.clearTaskSessionData();
    } catch (error) {
      this.handleError(error, "Error handling task cancellation");
      // Fallback to showing error
      this.showError("Error during cancellation handling");
    }
  },

  /**
   * Handle cancel button click
   * @param {Event} event - Click event
   */
  async handleCancelClick(_event) {
    try {
      console.log("Cancel button clicked");
      
      // Check if we're processing and have a task ID
      if (!state.processing || !state.currentTaskId) {
        console.warn("No active task to cancel");
        return;
      }
      
      // Update UI
      const cancelBtn = getElement('cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Cancelling...';
      }
      
      const progressStatus = getElement('progress-status');
      if (progressStatus) {
        progressStatus.textContent = "Cancelling...";
      }
      
      // Clean up progress handler if available
      if (state.progressHandler && typeof state.progressHandler.cancel === 'function') {
        state.progressHandler.cancel();
      }
      
      // Send cancel request to server
      try {
        await blueprintApi.cancelTask(state.currentTaskId);
        
        // The cancellation should be confirmed via socket event
        // but we'll set a timeout to force cancellation UI if needed
        setTimeout(() => {
          if (state.processing && !state.completionState.cancelled) {
            console.warn("Forcing cancellation UI after timeout");
            this.handleTaskCancellation({
              task_id: state.currentTaskId,
              message: "Cancelled by user"
            });
          }
        }, 5000);
      } catch (error) {
        console.error("Error sending cancel request:", error);
        // Still proceed with UI cancellation
        this.handleTaskCancellation({
          task_id: state.currentTaskId,
          message: "Cancelled by user"
        });
      }
    } catch (error) {
      this.handleError(error, "Error handling cancel click");
      // Force cancellation UI
      this.showCancelled();
    }
  },

  /**
   * Handle emergency stop - force cancel without task ID
   * @param {string} reason - Reason for emergency stop
   */
  async emergencyStop(reason = "Emergency stop triggered") {
    try {
      console.warn("[EMERGENCY] Emergency stop triggered:", reason);
      
      // Update UI immediately
      this.updateEmergencyStopUI();
      
      // Force reset all state
      this.forceResetProcessingState();
      
      // Try Socket.IO first
      if (window.socket && window.socket.connected) {
        window.socket.emit('emergency_stop', {
          reason: reason,
          timestamp: Date.now()
        });
        
        // Listen for response
        window.socket.once('emergency_stop_complete', (data) => {
          console.log('[EMERGENCY] Stop complete:', data);
          this.showEmergencyStopComplete(data);
        });
        
        window.socket.once('emergency_stop_error', (data) => {
          console.error('[EMERGENCY] Stop error:', data);
          this.showError('Emergency stop encountered an error');
        });
      }
      
      // Also try REST API
      try {
        const response = await fetch('/api/emergency-stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        
        if (!response.ok) {
          throw new Error(`Emergency stop failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[EMERGENCY] REST API response:', result);
        
        // Show completion
        this.showEmergencyStopComplete(result);
        
      } catch (apiError) {
        console.error('[EMERGENCY] API Error:', apiError);
        // Still show UI as stopped
        this.showCancelled();
      }
      
    } catch (error) {
      console.error('[EMERGENCY] Error during emergency stop:', error);
      this.handleError(error, "Emergency stop error");
      // Force UI to cancelled state
      this.showCancelled();
    }
  },

  /**
   * Update UI for emergency stop
   */
  updateEmergencyStopUI() {
    // Update all buttons and status
    const cancelBtn = getElement('cancel-btn');
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.innerHTML = '<i class="fas fa-stop-circle"></i> EMERGENCY STOPPING...';
      cancelBtn.classList.add('btn-danger');
    }
    
    const progressStatus = getElement('progress-status');
    if (progressStatus) {
      progressStatus.textContent = "EMERGENCY STOP - Forcing cancellation...";
      progressStatus.classList.add('text-danger');
    }
    
    // Add emergency stop indicator
    const progressBar = getElement('progress-bar');
    if (progressBar) {
      progressBar.classList.add('bg-danger');
    }
  },

  /**
   * Show emergency stop completion
   * @param {Object} data - Completion data
   */
  showEmergencyStopComplete(data) {
    console.log('[EMERGENCY] Showing emergency stop completion:', data);
    
    // Clear all state
    this.forceResetProcessingState();
    
    // Show cancelled state with emergency message
    const cancelledContainer = getElement('cancelled-container');
    if (cancelledContainer) {
      const message = cancelledContainer.querySelector('.alert-warning');
      if (message) {
        message.innerHTML = `
          <h4 class="alert-heading">
            <i class="fas fa-stop-circle"></i> Emergency Stop Executed
          </h4>
          <p>All tasks have been forcefully cancelled.</p>
          <hr>
          <p class="mb-0">
            Cancelled Tasks: ${data.cancelled_count || 'Unknown'}<br>
            <small>You may need to refresh the page if issues persist.</small>
          </p>
        `;
        message.classList.remove('alert-warning');
        message.classList.add('alert-danger');
      }
    }
    
    this.showCancelled();
  },


  /**
   * Handle new task button click
   * @param {Event} event - Click event
   */
  handleNewTaskClick(_event) {
    try {
      // Reset processing state
      this.forceResetProcessingState();
      
      // Show form
      this.showForm();
      
      // Clear any selected files
      const fileInput = getElement('folder-input');
      if (fileInput) {
        fileInput.value = '';
      }
      
      // Hide file info panel
      const fileInfoPanel = getElement('file-info-panel');
      if (fileInfoPanel) {
        fileInfoPanel.classList.add('d-none');
      }
      
      // Disable submit button
      const submitBtn = getElement('submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      
      // Log to terminal
      this.logToTerminal('info', "Started new task");
    } catch (error) {
      this.handleError(error, "Error handling new task click");
    }
  },

  /**
   * Open a file or containing folder
   * @param {string} path - File path
   * @returns {Promise<boolean>} - Success state
   */
  async openFileOrFolder(path) {
    try {
      if (!path) {
        ui.showToast('Error', 'No file path provided', 'error');
        return false;
      }
      
      // Try to open the file directly
      try {
        const result = await blueprintApi.openFile(path);
        if (result.success) {
          this.logToTerminal('info', `Opened file: ${path}`);
          return true;
        }
      } catch (fileError) {
        console.warn("Error opening file directly:", fileError);
        // Fallback to opening folder
      }
      
      // If file couldn't be opened, try to open containing folder
      try {
        const folderResponse = await this.fetchWithRetry('/api/open-folder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path })
        });
        
        if (folderResponse.ok) {
          const result = await folderResponse.json();
          if (result.success) {
            this.logToTerminal('info', `Opened containing folder for: ${path}`);
            return true;
          }
        }
      } catch (folderError) {
        console.error("Error opening containing folder:", folderError);
        ui.showToast('Error', `Could not open file or folder: ${folderError.message}`, 'error');
        return false;
      }
      
      // If we reach here, both methods failed
      ui.showToast('Error', 'Failed to open file or folder', 'error');
      return false;
    } catch (error) {
      this.handleError(error, "Error opening file or folder");
      return false;
    }
  },

  /**
   * Show form view
   */
  showForm() {
    try {
      // Get containers
      const formContainer = getElement('form-container');
      const progressContainer = getElement('progress-container');
      const resultContainer = getElement('result-container');
      const errorContainer = getElement('error-container');
      const cancelledContainer = getElement('cancelled-container');
      
      // Hide all containers
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultContainer) resultContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      if (cancelledContainer) cancelledContainer.classList.add('d-none');
      
      // Show form container
      if (formContainer) formContainer.classList.remove('d-none');
      
      // Update UI state
      state.uiState.isFormShown = true;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
    } catch (error) {
      this.handleError(error, "Error showing form");
    }
  },

  /**
   * Show progress view
   */
  showProgress() {
    try {
      // Get containers
      const formContainer = getElement('form-container');
      const progressContainer = getElement('progress-container');
      const resultContainer = getElement('result-container');
      const errorContainer = getElement('error-container');
      const cancelledContainer = getElement('cancelled-container');
      
      // Hide all containers
      if (formContainer) formContainer.classList.add('d-none');
      if (resultContainer) resultContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      if (cancelledContainer) cancelledContainer.classList.add('d-none');
      
      // Show progress container
      if (progressContainer) progressContainer.classList.remove('d-none');
      
      // Reset progress bar
      const progressBar = getElement('progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', '0');
        progressBar.textContent = '0%';
      }
      
      // Reset progress status
      const progressStatus = getElement('progress-status');
      if (progressStatus) {
        progressStatus.textContent = 'Initializing...';
      }
      
      // Reset progress stats
      const progressStats = getElement('progress-stats');
      if (progressStats) {
        progressStats.innerHTML = '';
      }
      
      // Enable cancel button
      const cancelBtn = getElement('cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.innerHTML = '<i class="fas fa-times me-2"></i> Cancel';
      }
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
    } catch (error) {
      this.handleError(error, "Error showing progress");
    }
  },

  /**
   * Show completion view
   * @param {Object} data - Completion data
   */
  showCompletion(data) {
    try {
      // Get containers
      const formContainer = getElement('form-container');
      const progressContainer = getElement('progress-container');
      const resultContainer = getElement('result-container');
      const errorContainer = getElement('error-container');
      const cancelledContainer = getElement('cancelled-container');
      
      // Hide all containers
      if (formContainer) formContainer.classList.add('d-none');
      if (progressContainer) progressContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      if (cancelledContainer) cancelledContainer.classList.add('d-none');
      
      // Show result container
      if (resultContainer) resultContainer.classList.remove('d-none');
      
      // Update result stats
      const resultStats = getElement('result-stats');
      if (resultStats) {
        let statsHtml = '';
        
        // Add file info
        if (state.taskData.file) {
          statsHtml += `<div><strong>File:</strong> ${state.taskData.file}</div>`;
        }
        
        // Add size info
        if (state.taskData.fileSize) {
          statsHtml += `<div><strong>Size:</strong> ${utils.formatBytes(state.taskData.fileSize)}</div>`;
        }
        
        // Add duration info
        if (state.taskData.startTime) {
          const duration = Date.now() - state.taskData.startTime;
          statsHtml += `<div><strong>Processing Time:</strong> ${utils.formatDuration(duration / 1000)}</div>`;
        }
        
        // Add output file info
        const outputFile = data.output_file || state.taskData.outputFile;
        if (outputFile) {
          statsHtml += `<div><strong>Output File:</strong> ${outputFile}</div>`;
        }
        
        // Add additional stats
        const stats = data.stats || state.taskData.stats;
        if (stats) {
          for (const [key, value] of Object.entries(stats)) {
            // Skip certain keys
            if (['task_id', 'status', 'message'].includes(key)) continue;
            
            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            statsHtml += `<div><strong>${formattedKey}:</strong> ${value}</div>`;
          }
        }
        
        resultStats.innerHTML = statsHtml;
      }
      
      // Update open button
      const openBtn = getElement('open-btn');
      if (openBtn) {
        const outputFile = data.output_file || state.taskData.outputFile;
        if (outputFile) {
          openBtn.setAttribute('data-output-file', outputFile);
          openBtn.classList.remove('d-none');
        } else {
          openBtn.classList.add('d-none');
        }
      }
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = true;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
    } catch (error) {
      this.handleError(error, "Error showing completion");
    }
  },

  /**
     * Show error view
     * @param {string} errorMessage - Error message
     */
  showError(errorMessage) {
    try {
      // Get containers
      const formContainer = getElement('form-container');
      const progressContainer = getElement('progress-container');
      const resultContainer = getElement('result-container');
      const errorContainer = getElement('error-container');
      const cancelledContainer = getElement('cancelled-container');
      
      // Hide all containers
      if (formContainer) formContainer.classList.add('d-none');
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultContainer) resultContainer.classList.add('d-none');
      if (cancelledContainer) cancelledContainer.classList.add('d-none');
      
      // Show error container
      if (errorContainer) errorContainer.classList.remove('d-none');
      
      // Update error message
      const errorMessageElement = getElement('error-message');
      if (errorMessageElement) {
        errorMessageElement.textContent = errorMessage || 'An error occurred during processing';
      }
      
      // Update error details
      const errorDetails = getElement('error-details');
      if (errorDetails) {
        let detailsHtml = '';
        
        // Add file info
        if (state.taskData.file) {
          detailsHtml += `<div><strong>File:</strong> ${state.taskData.file}</div>`;
        }
        
        // Add task ID
        if (state.currentTaskId) {
          detailsHtml += `<div><strong>Task ID:</strong> ${state.currentTaskId}</div>`;
        }
        
        // Add timestamp
        detailsHtml += `<div><strong>Time:</strong> ${new Date().toLocaleTimeString()}</div>`;
        
        errorDetails.innerHTML = detailsHtml;
      }
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = true;
      state.uiState.isCancelledShown = false;
    } catch (error) {
      this.handleError(error, "Error showing error view");
    }
  },

  /**
   * Show cancelled view
   */
  showCancelled() {
    try {
      // Get containers
      const formContainer = getElement('form-container');
      const progressContainer = getElement('progress-container');
      const resultContainer = getElement('result-container');
      const errorContainer = getElement('error-container');
      const cancelledContainer = getElement('cancelled-container');
      
      // Hide all containers
      if (formContainer) formContainer.classList.add('d-none');
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultContainer) resultContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      
      // Show cancelled container
      if (cancelledContainer) cancelledContainer.classList.remove('d-none');
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = true;
    } catch (error) {
      this.handleError(error, "Error showing cancelled view");
    }
  },

  /**
   * Verify an output directory exists or create it
   * @param {string} directory - Directory path
   * @returns {Promise<boolean>} - Success state
   */
  async verifyOrCreateOutputDirectory(directory) {
    try {
      if (!directory) {
        // If no directory specified, use default output folder
        const response = await this.fetchWithRetry('/api/get-default-output-folder');
        if (!response.ok) {
          throw new Error('Could not get default output folder');
        }
        
        const result = await response.json();
        return result.path;
      }
      
      // First check if directory exists
      const checkResponse = await this.fetchWithRetry('/api/check-file-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: directory })
      });
      
      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        if (checkResult.exists && checkResult.isDirectory) {
          return true; // Directory exists
        }
      }
      
      // If directory doesn't exist, create it
      const createResult = await blueprintApi.createDirectory(directory);
      return createResult.success;
    } catch (error) {
      this.handleError(error, "Error verifying/creating output directory");
      ui.showToast('Error', `Could not create output directory: ${error.message}`, 'error');
      return false;
    }
  },

  /**
   * Extract specific PDF content (text, tables, images)
   * @param {string} pdfPath - Path to PDF file
   * @param {string} extractType - Type of content to extract (text, tables, images)
   * @returns {Promise<Object>} - Extraction result
   */
  async extractPdfContent(pdfPath, extractType = 'text') {
    try {
      if (!pdfPath) {
        throw new Error('No PDF path specified');
      }
      
      if (!state.pdfProcessingEnabled) {
        throw new Error('PDF processing is not enabled');
      }
      
      // Map extraction type to endpoint
      const endpointMap = {
        'text': '/api/pdf/extract-text',
        'tables': '/api/pdf/extract-tables',
        'images': '/api/pdf/extract-images',
        'metadata': '/api/pdf/get-metadata'
      };
      
      const endpoint = endpointMap[extractType];
      if (!endpoint) {
        throw new Error(`Invalid extraction type: ${extractType}`);
      }
      
      // Call the appropriate endpoint
      const response = await this.fetchWithRetry(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: pdfPath })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to extract ${extractType} from PDF: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      this.handleError(error, `Error extracting ${extractType} from PDF`);
      return { success: false, error: error.message };
    }
  },

  /**
     * Detect and validate paths from uploaded files
     * @param {File[]} files - Array of uploaded files
     * @returns {Promise<Object>} - Detected paths
     */
  async detectPathsFromFiles(files) {
    try {
      if (!files || !files.length) {
        throw new Error('No files provided');
      }
      
      // Call the detect-path endpoint
      return await blueprintApi.detectPath(files);
    } catch (error) {
      this.handleError(error, "Error detecting paths from files");
      return { success: false, error: error.message };
    }
  },

  /**
   * Cancel progress tracking for current task
   */
  cancelProgressTracking() {
    try {
      // Check if we have a progress handler
      if (state.progressHandler && typeof state.progressHandler.cancel === 'function') {
        state.progressHandler.cancel();
        console.log("Progress tracking cancelled via progressHandler.cancel");
      } else if (state.currentTaskId) {
        // Try to access cancelTracking from trackProgress result
        if (state.progressHandler && typeof state.progressHandler.cancelTracking === 'function') {
          state.progressHandler.cancelTracking();
          console.log("Progress tracking cancelled via progressHandler.cancelTracking");
        } else {
          // Use fallback implementation
          this.cancelTrackingFallback(state.currentTaskId);
          console.log("Progress tracking cancelled via fallback");
        }
      }
    } catch (error) {
      console.error("Error cancelling progress tracking:", error);
    }
  },

  /**
   * Fallback implementation for tracking cancellation
   * @param {string} taskId - Task ID to cancel tracking for
   */
  cancelTrackingFallback(taskId) {
    console.log(`Fallback cancelTracking called for task ${taskId}`);
    try {
      // Stop any interval
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear monitoring timeouts
      if (state.completionMonitoring && state.completionMonitoring.timeoutIds) {
        state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
        state.completionMonitoring.timeoutIds.clear();
      }
      
      // Remove event listeners if possible
      if (window.socket) {
        try {
          window.socket.off(`progress_update`);
          window.socket.off(`task_completed`);
          window.socket.off(`task_error`);
          window.socket.off(`task_cancelled`);
        } catch (socketError) {
          console.warn("Error removing socket listeners:", socketError);
        }
      }
    } catch (error) {
      console.error("Error in fallback cancelTracking:", error);
    }
  }
  };

/**
* Export the file processor module and key functions
*/
export default fileProcessor;

// Export named functions for external use
export const initialize = fileProcessor.initialize.bind(fileProcessor);
export const handleError = fileProcessor.handleError.bind(fileProcessor);
export const processDirectory = fileProcessor.processDirectory.bind(fileProcessor);
export const processFile = fileProcessor.processFile.bind(fileProcessor);
export const validateFile = fileProcessor.validateFile.bind(fileProcessor);
export const isValidFileType = fileProcessor.isValidFileType.bind(fileProcessor);
export const getFileTypeFromName = fileProcessor.getFileTypeFromName.bind(fileProcessor);
export const showForm = fileProcessor.showForm.bind(fileProcessor);
export const showProgress = fileProcessor.showProgress.bind(fileProcessor);
export const showCompletion = fileProcessor.showCompletion.bind(fileProcessor);
export const showError = fileProcessor.showError.bind(fileProcessor);
export const showCancelled = fileProcessor.showCancelled.bind(fileProcessor);
export const handleCancelClick = fileProcessor.handleCancelClick.bind(fileProcessor);
export const handleNewTaskClick = fileProcessor.handleNewTaskClick.bind(fileProcessor);
export const handleFileSubmit = fileProcessor.handleFileSubmit.bind(fileProcessor);
export const handleFileSelection = fileProcessor.handleFileSelection.bind(fileProcessor);
export const extractPdfContent = fileProcessor.extractPdfContent.bind(fileProcessor);


// Add keyboard shortcut for emergency stop (Ctrl+Shift+X)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'X') {
    e.preventDefault();
    if (window.fileProcessor && typeof window.fileProcessor.emergencyStop === 'function') {
      if (confirm('⚠️ EMERGENCY STOP ⚠️\n\nThis will forcefully cancel ALL running tasks!\n\nAre you sure?')) {
        window.fileProcessor.emergencyStop('Keyboard shortcut triggered');
      }
    }
  }
});

