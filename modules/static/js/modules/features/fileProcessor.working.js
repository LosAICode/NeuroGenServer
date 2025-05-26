/**
 * NeuroGen Server - File Processor Module (ENHANCED VERSION)
 * 
 * Handles file uploading, processing, and interaction with the backend
 * for processing various file types. Includes progress tracking, error handling,
 * and UI interactions. This version includes improvements for:
 * 
 * 1. Progress bar stuck at 99% - Force to 100% on completion
 * 2. Better socket.io event handling for task completion
 * 3. Improved history integration
 * 4. Fixed task completion flow to prevent duplicate completions
 * 5. Enhanced cancellation handling
 * 6. Better error recovery
 * 
 * @module fileProcessor
 */

// Import core modules
import errorHandler from '../core/errorHandler.js';
import uiRegistry from '../core/uiRegistry.js';
import eventRegistry from '../core/eventRegistry.js';
import stateManager from '../core/stateManager.js';

// Import history manager
import historyManager from '../features/historyManager.js';

// Import utility modules - with fallbacks if modules fail to load
let ui, utils, fileHandler;

// Import progress handler module
import progressHandler, { 
  setupTaskProgress, 
  trackProgress, 
  updateProgressUI, 
  cancelTracking, 
  createProgressUI 
} from '../utils/progressHandler.js';

// Safely try to import UI - handle the redeclaration error
try {
  ui = await import('../utils/ui.js').catch(e => {
    console.warn("UI module import failed:", e);
    // Return a minimal fallback module
    return {
      showToast: (title, message, type = 'info') => {
        console.log(`TOAST [${type}]: ${title} - ${message}`);
        try {
          // Try to create a basic toast
          const toastContainer = document.getElementById('toast-container') || (() => {
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
          console.error("Failed to create fallback toast:", e);
        }
      },
      toggleElementVisibility: (element, visible) => {
        if (!element) return;
        if (visible) {
          element.classList.remove('d-none');
        } else {
          element.classList.add('d-none');
        }
      },
      transitionBetweenElements: (fromElement, toElement) => {
        if (!fromElement || !toElement) return;
        fromElement.classList.add('d-none');
        toElement.classList.remove('d-none');
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
} catch (e) {
  console.error("Error importing UI module:", e);
  // Provide fallback UI functions
  ui = {
    showToast: (title, message) => console.log(`Toast: ${title} - ${message}`),
    toggleElementVisibility: (element, visible) => {
      if (!element) return;
      element.style.display = visible ? 'block' : 'none';
    },
    transitionBetweenElements: (fromElement, toElement) => {
      if (!fromElement || !toElement) return;
      if (fromElement) fromElement.style.display = 'none';
      if (toElement) toElement.style.display = 'block';
    },
    updateProgressBarElement: (progressBar, progress) => {
      if (!progressBar) return;
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${Math.round(progress)}%`;
    },
    updateProgressStatus: (statusElement, message) => {
      if (!statusElement) return;
      statusElement.textContent = message;
    }
  };
}

// Import other utilities with fallbacks
try {
  utils = await import('../utils/utils.js').catch(e => {
    console.warn("Utils module import failed:", e);
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
      },
      formatJsonForDisplay: (json) => {
        return JSON.stringify(json, null, 2);
      }
    };
  });
} catch (e) {
  console.error("Error importing utils module:", e);
  utils = {
    formatBytes: (bytes) => `${bytes} bytes`,
    formatDuration: (seconds) => `${seconds}s`,
    debounce: (fn, ms) => fn,
    formatJsonForDisplay: (json) => JSON.stringify(json, null, 2)
  };
}

try {
  fileHandler = await import('../utils/fileHandler.js').catch(e => {
    console.warn("FileHandler module import failed:", e);
    return {
      handleBrowseClick: () => {
        console.warn("File browsing not available - fileHandler failed to load");
        alert("File browsing not available in this environment");
      },
      openFile: (path) => {
        console.warn("Cannot open file - fileHandler failed to load");
        alert(`Cannot open file: ${path}`);
      },
      openContainingFolder: (path) => {
        console.warn("Cannot open folder - fileHandler failed to load");
        alert(`Cannot open folder: ${path}`);
      }
    };
  });
} catch (e) {
  console.error("Error importing fileHandler module:", e);
  fileHandler = {
    handleBrowseClick: () => alert("File handling unavailable"),
    openFile: () => alert("File handling unavailable"),
    openContainingFolder: () => alert("File handling unavailable")
  };
}

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
  currentTaskId: null,
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
  apiRetryCount: 3,  // Maximum number of API retry attempts
  apiRetryDelay: 1000,  // Base delay for retries in ms
  statusPollInterval: null,
  lastReportedProgress: -1, // Track last reported progress to avoid duplicate 99% updates
  progressHandler: null, // Track the progress handler instance
  pdfProcessingEnabled: true, // Whether PDF processing features are enabled
  lastSavedOutputDir: null, // Last used output directory for persistence
  uiElements: {}, // Cache for UI elements
  historyInitialized: false, // Track history manager initialization
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
      
      // Initialize the history manager first
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
      const progressStatus = document.getElementById('progress-status');
      if (progressStatus && progressStatus.textContent === "Cancelling...") {
        console.warn("Detected stuck cancellation state, performing emergency reset");
        this.forceResetProcessingState();
        setTimeout(() => this.showForm(), 100);
      }
      
      // Add a page reload prevention check
      if (sessionStorage.getItem('ongoingTaskId')) {
        const lastCompletionTime = sessionStorage.getItem('taskCompletionTime');
        const now = Date.now();
        
        // If a task was marked complete in the last 5 seconds and page reloaded,
        // clear the session to prevent reload loop
        if (lastCompletionTime && (now - parseInt(lastCompletionTime, 10)) < 5000) {
          console.log("Detected potential reload loop, clearing session storage");
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
          sessionStorage.removeItem('outputFile');
          sessionStorage.removeItem('taskCompletionTime');
        }
        
        // Also check for potentially stuck tasks - if a task has been running for more than 30 minutes,
        // it's likely stuck and should be cleaned up
        const taskStartTime = sessionStorage.getItem('taskStartTime');
        if (taskStartTime && (now - parseInt(taskStartTime, 10)) > 30 * 60 * 1000) {
          console.warn("Detected potentially stuck task running for >30min, cleaning up");
          this.forceResetProcessingState();
        }
      }
      
      // Initialize the progress handler first
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
      
      // Add global initialization status check
      setTimeout(() => {
        if (state.processing && !state.currentTaskId) {
          console.warn("Detected inconsistent processing state without task ID");
          this.forceResetProcessingState();
          this.showForm();
        }
      }, 5000);
      
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
   * Set up direct event handlers for critical functionality
   * (Fallback for when UI registration fails)
   */
  setupDirectEventHandlers() {
    try {
      console.log("Setting up direct event handlers as fallback");
      
      // Form submission handler
      const form = document.getElementById('process-form');
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
      const newTaskBtn = document.getElementById('new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      // Cancel button
      const cancelBtn = document.getElementById('cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', this.handleFileProcessorCancelClick.bind(this));
      }
      
      // Open result file button
      const openBtn = document.getElementById('open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          const path = openBtn.getAttribute('data-output-file');
          if (path) {
            this.openFileOrFolder(path);
          }
        });
      }
      
      // Retry button in error container
      const retryBtn = document.getElementById('retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
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
        const progressContainer = document.getElementById('progress-container');
        if (progressContainer) {
          // Create progress UI elements if they don't exist
          const existingProgressBar = document.getElementById('progress-bar');
          if (!existingProgressBar) {
            console.log("Creating progress UI elements");
            const progressUI = createProgressUI('progress-container', '');
            if (progressUI) {
              console.log("Progress UI created successfully:", progressUI);
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
        
        // IMPROVED: Task completion detection
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
        
        // Register form submit handler through uiRegistry
        const form = uiRegistry.getElement('fileTab.form');
        if (form) {
          form.addEventListener('submit', this.handleFileSubmit.bind(this));
        } else {
          console.warn("Form element not found in uiRegistry, will use fallback");
        }
        
        // NEW: Listen for history events
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
   * Check for ongoing task from previous session
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
        
        // Set up progress tracking using progressHandler
        const progress = trackProgress(taskId, {
          elementPrefix: '',  // Use default prefixes for main file tab
          saveToSessionStorage: true,
          taskType: 'file'
        });
        
        // Store the progress handler in state
        state.progressHandler = progress;
        
        // Emit event to trigger status polling
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('file.processing.resume', { task_id: taskId });
        }
        
        // Start manual status polling as a fallback
        this.startManualStatusPolling();
        
        // Update state manager
        if (stateManager && typeof stateManager.setProcessingActive === 'function') {
          stateManager.setProcessingActive(true);
        }
        
        if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
          stateManager.setCurrentTaskId(taskId);
        }
        
        // Set a safety timeout to check task status after 10 seconds
        setTimeout(() => {
          // If still in processing state but no progress updates received
          if (state.processing && state.progressUpdateCount === 0) {
            console.warn("Task appears to be stuck - no progress updates received");
            ui.showToast('Task Issue', 'Task may be stuck. Attempting to recover...', 'warning');
            
            // Try to verify task exists on server
            this.fetchWithRetry(`/api/status/${taskId}`)
              .then(response => {
                if (!response.ok) {
                  throw new Error("Task not found on server");
                }
                return response.json();
              })
              .then(data => {
                // If task exists but status is not active, reset
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
              })
              .catch(error => {
                console.error("Error checking task status:", error);
                // Task not found or other error - reset state
                this.forceResetProcessingState();
                this.showForm();
                ui.showToast('Recovery Complete', 'System state has been reset', 'info');
              });
          }
        }, 10000); // 10 second safety check
      }
    } catch (error) {
      this.handleError(error, "Error checking for ongoing task");
      // Reset processing state in case of error
      this.forceResetProcessingState();
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
        this.startManualStatusPolling();
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
   */
  startManualStatusPolling() {
    try {
      if (!state.currentTaskId || !state.processing) return;
      
      console.log("Starting manual status polling");
      this.logToTerminal('info', 'Starting manual status polling for task updates');
      
      // Clear existing interval if present
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
      }
      
      // Create polling interval
      state.statusPollInterval = setInterval(async () => {
        if (!state.processing || !state.currentTaskId) {
          clearInterval(state.statusPollInterval);
          state.statusPollInterval = null;
          return;
        }
        
        try {
          const response = await this.fetchWithRetry(`/api/status/${state.currentTaskId}`);
          
          if (response.ok) {
            const data = await response.json();
            this.processStatusUpdate(data);
          } else {
            console.warn(`Status polling failed: ${response.status}`);
          }
        } catch (error) {
          console.error("Error polling for status:", error);
        }
      }, PROGRESS_POLL_INTERVAL_MS);
    } catch (error) {
      this.handleError(error, "Error starting manual status polling");
    }
  },
  /**
   * Handle task completion
   * @param {Object} data - Task completion data
   */
  handleTaskCompletion(data) {
    try {
      // Check if already completed
      if (state.completionState.completed && 
          state.completionState.completionTime && 
          (Date.now() - state.completionState.completionTime < 5000)) {
        console.log("Task already marked as completed, preventing duplicate completion");
        return;
      }
      
      // Mark as completed to prevent duplicate processing
      state.completionState.completed = true;
      state.completionState.completionTime = Date.now();
      
      console.log("Handling task completion:", data);
      
      // Aggressively clear all storage and state
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      localStorage.removeItem('currentTask');
      
      // Store completion timestamp to prevent reload loops
      sessionStorage.setItem('taskCompletionTime', Date.now().toString());
      
      // Save task data for history recording
      state.taskData = { ...data };
      
      // Reset all state explicitly
      state.processing = false;
      state.currentTaskId = null;
      state.isProcessingCancelled = false;
      state.socketReconnectAttempts = 0;
      
      // Clear any completion monitoring
      this.clearCompletionMonitoring();
      
      // Complete tracking in progressHandler if available
      if (state.progressHandler && typeof state.progressHandler.complete === 'function') {
        state.progressHandler.complete(data);
        console.log("Progress handler completed task:", data.task_id);
      } else {
        // Try direct progressHandler import if available
        try {
          const progressHandler = window.moduleInstances.progressHandler;
          if (progressHandler && typeof progressHandler.completeTask === 'function') {
            progressHandler.completeTask(data.task_id, data);
            console.log("Module instance progressHandler completed task:", data.task_id);
          }
        } catch (e) {
          console.warn("Error using module instance progressHandler:", e);
        }
      }
      
      // Force progress to 100% to avoid stuck progress bar
      this.updateProgressDisplay(100, "Task completed successfully", data.stats);
      
      // Add completed task to history with delay for stats to finalize
      setTimeout(() => {
        this.addTaskToHistory(data);
      }, TASK_COMPLETION_DELAY);
      
      // Show result UI after brief delay for better UX
      setTimeout(() => {
        this.showResult(data);
      }, TASK_COMPLETION_DELAY);
      
      // Cancel any ongoing requests
      this.cancelPendingRequests();
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show success notification
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast('Processing Complete', 'Your files have been processed successfully', 'success');
      }
      
      // Log to terminal
      this.logToTerminal('success', `Processing completed: ${data.output_file}`, data.stats ? JSON.stringify(data.stats, null, 2) : undefined);
      
      // Stop status polling if active
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Reset button state
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
      
      // Force socket disconnect and reconnect to reset state
      if (window.socket && typeof window.socket.disconnect === 'function') {
        try {
          window.socket.disconnect();
          setTimeout(() => {
            try {
              window.socket.connect();
            } catch (socketErr) {
              console.warn("Socket reconnect error:", socketErr);
            }
          }, 500);
        } catch (socketErr) {
          console.warn("Socket disconnect/connect error:", socketErr);
        }
      }
      
      // Trigger completion event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.completed', data);
      }
      
      console.log("Task completion cleanup completed successfully");
    } catch (error) {
      this.handleError(error, "Error handling task completion");
    }
  },  

  /**
   * Monitor task progress and detect potentially stuck tasks
   * @param {Object} data - Status update data
   */
  monitorTaskProgress(data) {
    // Skip if task completion monitoring is disabled
    if (!state.completionMonitoring.enabled) return;
    
    try {
      const { progress, task_id } = data;
      
      // Only monitor tasks at high progress percentages
      if (progress < 95) return;
      
      // Clear any existing timeout for this task
      this.clearCompletionMonitoring();
      
      // Set a new timeout to check if the task is stuck
      const timeoutId = setTimeout(() => {
        // Only proceed if still in processing state and not already completed
        if (!state.processing || state.completionState.completed) return;
        
        console.log(`Checking if task ${task_id} is stuck at ${progress}%`);
        
        const currentTime = Date.now();
        const lastUpdateTime = state.lastProgressTimestamp || 0;
        const timeSinceUpdate = currentTime - lastUpdateTime;
        
        // If no updates for a while and at high percentage, task may be stuck
        if (timeSinceUpdate > state.completionMonitoring.maxStuckDurationMs && progress >= 95) {
          console.warn(`Task appears stuck at ${progress}% with no updates for ${timeSinceUpdate/1000}s`);
          
          // Force check completion status via API
          this.checkTaskCompletionStatus(task_id);
        }
      }, state.completionMonitoring.checkIntervalMs);
      
      // Store the timeout ID
      state.completionMonitoring.timeoutIds.add(timeoutId);
    } catch (error) {
      console.error("Error in task progress monitoring:", error);
    }
  },

  /**
   * Clear any active completion monitoring timeouts
   */
  clearCompletionMonitoring() {
    try {
      // Clear all timeout IDs
      for (const timeoutId of state.completionMonitoring.timeoutIds) {
        clearTimeout(timeoutId);
      }
      
      // Clear the set
      state.completionMonitoring.timeoutIds.clear();
    } catch (error) {
      console.error("Error clearing completion monitoring:", error);
    }
  },

  /**
   * Check task completion status via API
   * @param {string} taskId - Task ID to check
   */
  async checkTaskCompletionStatus(taskId) {
    try {
      console.log(`Checking completion status of task ${taskId} via API`);
      
      // Make API request
      const response = await this.fetchWithRetry(`/api/status/${taskId}`);
      
      if (!response.ok) {
        console.warn(`Status check failed with status ${response.status}`);
        return;
      }
      
      const data = await response.json();
      console.log(`Task status from API: ${data.status}, progress: ${data.progress}%`);
      
      // If task is completed according to API but UI doesn't show it
      if (data.status === "completed" || data.progress >= 100) {
        console.log("Task is completed according to API, forcing completion in UI");
        
        // Force progress to 100%
        this.updateProgressDisplay(100, "Task completed successfully", data.stats);
        
        // Mark as completed
        if (!state.completionState.completed) {
          this.handleTaskCompletion(data);
        }
      }
      // If task has error status
      else if (data.status === "error" || data.status === "failed") {
        if (!state.completionState.error) {
          this.handleTaskError(data);
        }
      }
      // If task is cancelled
      else if (data.status === "cancelled") {
        if (!state.completionState.cancelled) {
          this.handleTaskCancellation(data);
        }
      }
      // Task is still running
      else {
        console.log("Task is still running according to API");
        
        // Update progress with latest data
        this.processStatusUpdate(data);
        
        // Schedule another check in case the task gets stuck again
        const timeoutId = setTimeout(() => {
          this.checkTaskCompletionStatus(taskId);
        }, state.completionMonitoring.checkIntervalMs * 2); // Double the interval for follow-up checks
        
        state.completionMonitoring.timeoutIds.add(timeoutId);
      }
    } catch (error) {
      console.error("Error checking task completion status:", error);
    }
  },

  /**
   * Process a status update from polling or websocket
   * @param {Object} data - Status update data
   */
  processStatusUpdate(data) {
    try {
      if (!data || !data.task_id || data.task_id !== state.currentTaskId) return;
      
      console.log("Received status update:", data);
      
      // Update UI with progress
      if (data.progress !== undefined) {
        // IMPROVED: Fixed progressive updates logic to avoid getting stuck at 99%
        if (data.progress >= 99 && data.progress < 100) {
          // If status is completed, jump to 100%
          if (data.status === "completed" || this.isCompletionPhase(data)) {
            data.progress = 100;
            console.log("Forcing progress to 100% due to completion indicators");
          }
          // If we're already showing 99% and status isn't completed, don't update progress
          // unless it's higher than what we've shown before
          else if (state.lastReportedProgress >= 99) {
            // Only use this progress if it's higher than what we've shown
            if (data.progress > state.lastReportedProgress) {
              console.log(`Updating from ${state.lastReportedProgress}% to higher value ${data.progress}%`);
              // Keep the new value
            } else {
              // Skip this update to avoid visual stutter
              console.log(`Skipping progress update: current ${state.lastReportedProgress}%, new ${data.progress}%`);
              return;
            }
          }
        }
        
        // Store last reported progress
        state.lastReportedProgress = data.progress;
        
        // Calculate progress metrics for ETA
        this.updateProgressMetrics(data.progress);
        
        // Update progress display
        this.updateProgressDisplay(data.progress, data.message || 'Processing...', data.stats);
        
        // Use progressHandler's updateProgressUI function if available
        if (typeof updateProgressUI === 'function') {
          updateProgressUI(data.task_id, data.progress, data.message || 'Processing...', data.stats);
        }
        
        // Also update via state.progressHandler if available
        if (state.progressHandler && typeof state.progressHandler.updateProgress === 'function') {
          // Calculate ETA for better user feedback
          const etaInfo = this.calculateETA(data.progress);
          let statusMessage = data.message || 'Processing...';
          if (etaInfo.timeRemaining) {
            statusMessage += ` (ETA: ${utils.formatDuration(etaInfo.timeRemaining)})`;
          }
          
          state.progressHandler.updateProgress(data.progress, statusMessage, data.stats);
        }
        
        // Update state manager if available
        if (stateManager && typeof stateManager.setProcessingProgress === 'function') {
          stateManager.setProcessingProgress(data.progress);
        }
        
        if (stateManager && typeof stateManager.setProcessingStatus === 'function' && data.message) {
          stateManager.setProcessingStatus(data.message);
        }
        
        // Increment the progress update counter for monitoring
        state.progressUpdateCount++;
        
        // Check for completion states with improved detection
        const isCompleted = 
          (data.status === "completed") || 
          (data.progress >= 99 && data.stats && data.stats.status === "completed") ||
          (data.progress >= 99.9) ||
          (data.progress >= 99 && this.isCompletionPhase(data));
            
        if (isCompleted && !state.completionState.completed) {
          console.log(`Task ${data.task_id} marked as completed via progress_update`);
          // Force progress to 100% for completed tasks
          this.updateProgressDisplay(100, data.message || "Task completed successfully", data.stats);
          // Complete the task after a brief delay to ensure UI is updated
          setTimeout(() => {
            this.handleTaskCompletion(data);
          }, TASK_COMPLETION_DELAY);
        }
        else if (data.status === "failed" || data.status === "error") {
          this.handleTaskError(data);
        } 
        else if (data.status === "cancelled") {
          this.handleTaskCancellation(data);
        }
        
        // Add monitoring for tasks that may be stuck
        this.monitorTaskProgress(data);
      }
    } catch (error) {
      this.handleError(error, "Error processing status update");
    }
  },

  /**
   * Helper function to check if data indicates completion phase
   * @param {Object} data - Status update data
   * @returns {boolean} - Whether this is a completion phase
   */
  isCompletionPhase(data) {
    // Check various completion indicators
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
  },

  /**
   * Calculate ETA based on progress rate
   * @param {number} progress - Current progress percentage
   * @returns {Object} - ETA information
   */
  calculateETA(progress) {
    try {
      if (!state.lastProgressTimestamp || state.progressRates.length < 2) {
        return { timeRemaining: null };
      }

      const now = Date.now();
      const timeSinceStart = now - state.processingStartTime;
      
      // Calculate average progress rate
      const totalRate = state.progressRates.reduce((a, b) => a + b, 0);
      const avgRate = totalRate / state.progressRates.length;
      
      if (avgRate <= 0) return { timeRemaining: null };
      
      // Estimate remaining time
      const remainingProgress = 100 - progress;
      const estimatedTimePerPercent = timeSinceStart / progress;
      const estimatedTimeRemaining = estimatedTimePerPercent * remainingProgress;
      
      return {
        timeRemaining: estimatedTimeRemaining,
        avgRate: avgRate
      };
    } catch (error) {
      console.error("Error calculating ETA:", error);
      return { timeRemaining: null };
    }
  },

  /**
   * Update progress metrics for ETA calculation
   * @param {number} progress - Current progress percentage
   */
  updateProgressMetrics(progress) {
    const now = Date.now();
    
    if (!state.lastProgressTimestamp) {
      state.lastProgressTimestamp = now;
      state.processingStartTime = state.processingStartTime || now;
      return;
    }
    
    const lastProgress = state.lastReportedProgress;
    const timeDelta = now - state.lastProgressTimestamp;
    
    // Only update if significant time and progress changes
    if (timeDelta > 500 && progress > lastProgress) {
      const progressDelta = progress - lastProgress;
      const rate = progressDelta / timeDelta;
      
      // Store rate for averaging
      state.progressRates.push(rate);
      if (state.progressRates.length > MAX_PROGRESS_RATES) {
        state.progressRates.shift();
      }
      
      state.lastProgressTimestamp = now;
    }
  },

  /**
   * Update progress display
   * @param {number} progress - Progress percentage
   * @param {string} message - Status message
   * @param {Object} stats - Optional stats to display
   */
  updateProgressDisplay(progress, message, stats) {
    try {
      const progressBar = document.getElementById('progress-bar');
      const progressStatus = document.getElementById('progress-status');
      const progressStats = document.getElementById('progress-stats');
      
      // Update progress bar
      if (progressBar) {
        if (ui && typeof ui.updateProgressBarElement === 'function') {
          ui.updateProgressBarElement(progressBar, progress);
        } else {
          progressBar.style.width = `${progress}%`;
          progressBar.setAttribute('aria-valuenow', progress);
          progressBar.textContent = `${Math.round(progress)}%`;
        }
        
        // Add appropriate color classes based on progress
        if (progress >= 100) {
          progressBar.classList.remove('bg-danger', 'bg-warning');
          progressBar.classList.add('bg-success');
        } else if (progress >= 75) {
          progressBar.classList.remove('bg-danger');
          progressBar.classList.add('bg-info');
        }
      }
      
      // Update status message
      if (progressStatus && message) {
        if (ui && typeof ui.updateProgressStatus === 'function') {
          ui.updateProgressStatus(progressStatus, message);
        } else {
          progressStatus.textContent = message;
        }
      }
      
      // Update stats if available
      if (progressStats && stats) {
        this.updateProgressStats(progressStats, stats);
      }
    } catch (error) {
      console.error("Error updating progress display:", error);
    }
  },

  /**
   * Update progress stats display
   * @param {HTMLElement} element - Stats container element
   * @param {Object} stats - Statistics data
   */
  updateProgressStats(element, stats) {
    try {
      if (!element || !stats) return;
      
      // Format stats for display
      let statsHtml = '<div class="stats-container p-2">';
      
      // Format based on available stats
      if (stats.total_files !== undefined) {
        // File processing stats
        statsHtml += `
          <div class="row g-2">
            <div class="col-md-6">
              <div class="d-flex gap-2 flex-wrap">
                <span class="badge bg-primary">Files: ${stats.total_files || 0}</span>
                <span class="badge bg-success">Processed: ${stats.processed_files || 0}</span>
                <span class="badge bg-warning">Skipped: ${stats.skipped_files || 0}</span>
                <span class="badge bg-danger">Errors: ${stats.error_files || 0}</span>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex gap-2 flex-wrap">
                <span class="badge bg-info">Chunks: ${stats.total_chunks || 0}</span>
                ${stats.total_bytes ? 
                  `<span class="badge bg-secondary">Size: ${this.formatBytes(stats.total_bytes)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
        
        // Add elapsed time if available
        if (stats.processing_time || stats.elapsed_time || stats.total_duration_seconds) {
          const duration = stats.elapsed_time || stats.total_duration_seconds || 0;
          const durationText = utils.formatDuration(duration);
          statsHtml += `<div class="mt-2 text-muted">Elapsed time: ${durationText}</div>`;
        }
      }
      
      statsHtml += '</div>';
      element.innerHTML = statsHtml;
    } catch (error) {
      console.error("Error updating progress stats:", error);
    }
  },

    /**
   * Add task to history using historyManager
   * @param {Object} data - Task data
   */
  addTaskToHistory(data) {
    try {
      // Skip if data is missing
      if (!data) return;
      
      console.log("Adding task to history:", data);
      
      // Prepare the task data for history
      const taskData = {
        task_id: data.task_id || state.currentTaskId,
        type: 'file',
        status: 'completed',
        timestamp: Date.now(),
        filename: this.getFileNameFromPath(data.output_file),
        inputPath: data.input_dir,
        outputPath: data.output_file,
        stats: data.stats || {}
      };
      
      // Log history data
      console.log("History data:", taskData);
      
      // Try multiple approaches to ensure history is recorded
      
      // Approach 1: Use historyManager if available and initialized
      if (historyManager && typeof historyManager.addTaskToHistory === 'function') {
        // Add to history
        historyManager.addTaskToHistory(taskData);
        console.log("Task added to history successfully");
        
        // Also add to recent files
        if (data.output_file && typeof historyManager.addFileToRecent === 'function') {
          historyManager.addFileToRecent({
            path: data.output_file,
            name: this.getFileNameFromPath(data.output_file),
            lastAccessed: Date.now()
          });
        }
        
        return true;
      }
      
      // Approach 2: Try to get historyManager from window.moduleInstances
      if (window.moduleInstances && window.moduleInstances.historyManager) {
        try {
          const historyMgr = window.moduleInstances.historyManager;
          if (typeof historyMgr.addTaskToHistory === 'function') {
            historyMgr.addTaskToHistory(taskData);
            console.log("Task added to history using moduleInstances");
            
            // Also add to recent files
            if (data.output_file && typeof historyMgr.addFileToRecent === 'function') {
              historyMgr.addFileToRecent({
                path: data.output_file,
                name: this.getFileNameFromPath(data.output_file),
                lastAccessed: Date.now()
              });
            }
            
            return true;
          }
        } catch (err) {
          console.warn("Error using moduleInstances.historyManager:", err);
        }
      }
      
      // Approach 3: Try event registry approach
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        console.log("Using event registry to add task to history");
        
        eventRegistry.emit('history.add', {
          type: 'file',
          name: data.output_file ? this.getFileNameFromPath(data.output_file) : 'Processed Data',
          data: taskData
        });
        
        // Also emit the specific history.saved event
        eventRegistry.emit('history.saved', taskData);
      }
      
      // Approach 4: Store in localStorage as secondary fallback
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
        console.log("Task saved to localStorage history fallback");
      } catch (storageErr) {
        console.warn("Failed to save to localStorage:", storageErr);
      }
    } catch (error) {
      console.error("Error adding task to history:", error);
    }
  },
/**
 * Format bytes to human-readable size
 * @param {number} bytes - Bytes to format
 * @returns {string} - Formatted size
 */
formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  // Check if we already have a formatted string from the backend
  if (typeof bytes === 'string' && bytes.includes('B')) {
    return bytes;
  }
  
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
    
    // Format the duration
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
    
    // Format the duration
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
   * Extract filename from path
   * @param {string} path - File path
   * @returns {string} - Filename
   */
  getFileNameFromPath(path) {
    if (!path) return 'Unknown';
    
    // Use historyManager's method if available
    if (historyManager && typeof historyManager.getFileNameFromPath === 'function') {
      return historyManager.getFileNameFromPath(path);
    }
    
    // Fallback implementation
    try {
      // Handle both Windows and Unix paths
      const parts = path.split(/[\/\\]/);
      return parts[parts.length - 1] || 'Unknown';
    } catch (error) {
      console.error("Error extracting filename:", error);
      return 'Unknown';
    }
  },

  /**
   * Handle task error
   * @param {Object} data - Error data
   */
  handleTaskError(data) {
    try {
      // Mark as error to prevent duplicate handling
      state.completionState.error = true;
      state.processing = false;
      
      // Handle error in progressHandler if available
      if (state.progressHandler && typeof state.progressHandler.error === 'function') {
        state.progressHandler.error(data.error || 'Unknown error');
        console.log("Progress handler marked task as error:", data.task_id);
      }
      
      this.showError(data);
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show error notification
      ui.showToast('Processing Error', data.error || 'An error occurred during processing', 'error');
      
      // Log to terminal
      this.logToTerminal('error', `File processing error: ${data.error || 'Unknown error'}`);
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Clean up polling if needed
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Trigger error event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.error', data);
      }
    } catch (error) {
      this.handleError(error, "Error handling task error");
    }
  },

  /**
   * Handle task cancellation
   * @param {Object} data - Cancellation data
   */
  handleTaskCancellation(data) {
    try {
      // Mark as cancelled to prevent duplicate handling
      state.completionState.cancelled = true;
      state.processing = false;
      
      // Cancel progress tracking via progressHandler if available
      if (state.progressHandler && typeof state.progressHandler.cancel === 'function') {
        state.progressHandler.cancel();
        console.log("Progress handler cancelled task:", data?.task_id || state.currentTaskId);
      }
      
      this.showCancelled();
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show notification
      ui.showToast('Task Cancelled', 'Processing has been cancelled', 'warning');
      
      // Log to terminal
      this.logToTerminal('warning', 'Task cancelled');
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Clean up polling if needed
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Trigger cancelled event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.cancelled', data);
      }
    } catch (error) {
      this.handleError(error, "Error handling task cancellation");
    }
  },

  /**
   * Force a complete reset of the processing state
   * Used as a last resort when normal cancellation fails
   */
  forceResetProcessingState() {
    try {
      console.log("Performing forced reset of processing state");
      
      // Aggressively clear all storage related to tasks
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      sessionStorage.removeItem('taskCompletionTime');
      sessionStorage.removeItem('taskStartTime');
      localStorage.removeItem('currentTask');
      
      // Reset all state variables
      state.processing = false;
      state.currentTaskId = null;
      state.isProcessingCancelled = false;
      state.socketReconnectAttempts = 0;
      state.progressUpdateCount = 0;
      state.lastProgressTimestamp = null;
      state.progressRates = [];
      state.lastReportedProgress = -1;
      
      // Reset completion state
      state.completionState = {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      };
      
      // Reset global state
      window.currentTaskId = null;
      
      // Cancel any pending requests
      this.cancelPendingRequests();
      
      // Clear any intervals
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clean up progress handler if available
      if (state.progressHandler) {
        if (typeof state.progressHandler.cancel === 'function') {
          state.progressHandler.cancel();
        }
        
        // Remove the reference
        state.progressHandler = null;
      }
      
      // Also use direct cancelTracking function if available
      if (typeof cancelTracking === 'function' && state.currentTaskId) {
        cancelTracking(state.currentTaskId);
      }
      
      // Clear UI update queue and timer
      state.uiUpdateQueue = [];
      if (state.uiUpdateTimer) {
        clearTimeout(state.uiUpdateTimer);
        state.uiUpdateTimer = null;
      }
      
      // Reset UI elements
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
        stateManager.setCurrentTaskId(null);
      }
      
      // Try to force socket disconnect and reconnect
      try {
        if (window.socket && typeof window.socket.disconnect === 'function') {
          window.socket.disconnect();
          setTimeout(() => {
            try {
              window.socket.connect();
            } catch (e) {
              console.warn("Error reconnecting socket:", e);
            }
          }, 500);
        }
      } catch (socketErr) {
        console.warn("Error handling socket during force reset:", socketErr);
      }
      
      // Log to terminal
      this.logToTerminal('warning', 'Forced reset of processing state performed');
      
      console.log("Forced reset of processing state completed");
    } catch (error) {
      console.error("Error during forced reset:", error);
      // Even in case of error, ensure critical state is reset
      state.processing = false;
      state.currentTaskId = null;
      window.currentTaskId = null;
    }
  },

  /**
   * Cancel all pending API requests
   */
  cancelPendingRequests() {
    try {
      // Cancel any pending requests using AbortController
      Object.values(state.pendingRequests).forEach(controller => {
        try {
          controller.abort();
        } catch (e) {
          console.warn("Error aborting request:", e);
        }
      });
      
      // Clear the requests list
      state.pendingRequests = {};
    } catch (error) {
      this.handleError(error, "Error cancelling pending requests");
    }
  },

  /**
   * Handle file processor cancel click with improved error handling
   */
  handleFileProcessorCancelClick() {
    try {
      if (!state.currentTaskId || !state.processing) return;
      
      // Confirm cancellation
      const confirmed = confirm("Are you sure you want to cancel the current processing task?");
      if (!confirmed) return;
      
      // Mark as cancelled
      state.isProcessingCancelled = true;
      
      // Disable cancel button to prevent multiple clicks
      const cancelBtn = uiRegistry.getElement('fileTab.cancelBtn') || document.getElementById('cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
      }
      
      // Update progress status
      const progressStatus = uiRegistry.getElement('fileTab.progressStatus') || document.getElementById('progress-status');
      if (progressStatus) {
        if (ui && typeof ui.updateProgressStatus === 'function') {
          ui.updateProgressStatus(progressStatus, "Cancelling...");
        } else {
          progressStatus.textContent = "Cancelling...";
        }
      }
      
      // Cancel all pending API requests
      this.cancelPendingRequests();
      
      // Use cancelTracking if available to clean up progress handler
      if (typeof cancelTracking === 'function') {
        console.log("Calling cancelTracking for task:", state.currentTaskId);
        cancelTracking(state.currentTaskId);
      }
      
      // Also cancel through state.progressHandler if available
      if (state.progressHandler && typeof state.progressHandler.cancel === 'function') {
        console.log("Calling state.progressHandler.cancel for task:", state.currentTaskId);
        state.progressHandler.cancel();
      }
      
      // Log to terminal
      this.logToTerminal('warning', `Cancelling task: ${state.currentTaskId}`);
      
      // Add a forced cleanup timer in case the cancel request gets stuck
      const forceCleanupTimer = setTimeout(() => {
        console.log("Force cleanup timer triggered - cancellation may have been stuck");
        
        // Force a complete reset of the system state
        this.forceResetProcessingState();
        
        // Show cancelled state in UI
        this.showCancelled();
        
        // Show notification
        ui.showToast('Task Cancelled', 'Processing has been forcefully cancelled', 'warning');
      }, 5000); // 5 second timeout for cancellation
      
      // Call API to cancel task
      this.fetchWithRetry('/api/cancel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: state.currentTaskId })
      })
      .then(response => response.json())
      .then(data => {
        // Clear the force cleanup timer since we got a response
        clearTimeout(forceCleanupTimer);
        
        if (data.success) {
          ui.showToast('Task Cancelled', 'Processing has been cancelled', 'warning');
          
          // Show cancelled state in UI
          this.showCancelled();
          
          // Log to terminal
          this.logToTerminal('success', 'Task cancelled successfully');
          
          // Emit cancelled event
          if (eventRegistry && typeof eventRegistry.emit === 'function') {
            eventRegistry.emit('file.processing.cancelled', { task_id: state.currentTaskId });
          }
        } else {
          throw new Error(data.error || 'Failed to cancel task');
        }
      })
      .catch(error => {
        // Clear the force cleanup timer since we're handling the error
        clearTimeout(forceCleanupTimer);
        
        console.error('Error cancelling task:', error);
        
        // Force reset anyway since there was an error
        this.forceResetProcessingState();
        
        // Show cancelled state in UI (even though there was an error)
        this.showCancelled();
        
        // Show toast if UI module is available
        if (ui && typeof ui.showToast === 'function') {
          ui.showToast('Cancellation Issues', `Task was forcefully cancelled, but there were errors: ${error.message}`, 'warning');
        }
        
        // Log to terminal
        this.logToTerminal('error', `Failed to cancel task: ${error.message}`);
      });
    } catch (error) {
      this.handleError(error, "Error handling cancel button click");
      
      // Force reset even if there was an error in the cancellation process
      this.forceResetProcessingState();
      this.showCancelled();
    }
  },

  /**
     * Handle New Task button click
     */
  handleNewTaskClick() {
    try {
      // Log to terminal
      this.logToTerminal('info', 'Starting new task');

      // Cancel any pending requests or tasks
      this.cancelPendingRequests();

      // Reset state
      window.currentTaskId = null;
      state.currentTaskId = null;
      state.processing = false;
      state.selectedFiles = [];
      state.socketReconnectAttempts = 0;
      
      // Reset completion state
      state.completionState = {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      };
      
      // Clean up progress handler if available
      if (state.progressHandler) {
        if (typeof state.progressHandler.cancel === 'function') {
          state.progressHandler.cancel();
        }
        state.progressHandler = null;
      }

      // Update global state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
        stateManager.setCurrentTaskId(null);
      }

      // Show form
      this.showForm();
      
      // Emit event for other modules
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.new', {
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.handleError(error, 'Error in handleNewTaskClick');
    }
  },

  /**
   * Perform a fetch with retries and timeout
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} - Fetch response
   */
  async fetchWithRetry(url, options = {}) {
    let lastError;
    
    // Create an AbortController for this request
    const controller = new AbortController();
    const requestId = Date.now().toString();
    
    // Store the controller in pending requests
    state.pendingRequests[requestId] = controller;
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      delete state.pendingRequests[requestId];
    }, options.timeout || API_TIMEOUT_MS);
    
    // Add signal to options
    options.signal = controller.signal;
    
    // Debug the request
    console.log(`Fetching ${url} with method ${options.method || 'GET'}`);
    
    // Try multiple times with exponential backoff
    for (let attempt = 0; attempt < state.apiRetryCount; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // Clear timeout and remove from pending requests
        clearTimeout(timeoutId);
        delete state.pendingRequests[requestId];
        
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`Fetch attempt ${attempt + 1} failed for ${url}:`, error);
        
        // Don't retry if request was aborted or we're on the last attempt
        if (error.name === 'AbortError' || attempt >= state.apiRetryCount - 1) {
          break;
        }
        
        // Wait with exponential backoff before retrying
        await new Promise(resolve => setTimeout(resolve, state.apiRetryDelay * Math.pow(2, attempt)));
      }
    }
    
    // Clear timeout and remove from pending requests
    clearTimeout(timeoutId);
    delete state.pendingRequests[requestId];
    
    // If we get here, all retries failed
    // Log to terminal
    this.logToTerminal('error', `API request failed after ${state.apiRetryCount} attempts: ${url}`);
    
    // Show user message for important requests
    if (!url.includes('/status/')) {  // Don't show for status polling
      ui.showToast('Network Error', 'Failed to connect to server. Please check your network connection.', 'error');
    }
    
    throw lastError;
  },

  /**
   * Initialize input/output relationship for auto-suggestion
   */
  initializeInputOutputRelationship() {
    try {
      // Try both uiRegistry and direct DOM access for redundancy
      const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
      const outputFileField = uiRegistry.getElement('fileTab.outputFile') || document.getElementById('output-file');
      
      if (!inputDirField || !outputFileField) {
        console.warn("Input/output fields not found for relationship initialization");
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
            outputFileField.value = `${folderName}_processed`;
            
            // Add visual feedback
            outputFileField.classList.add('bg-light');
            setTimeout(() => outputFileField.classList.remove('bg-light'), 1500);
            
            // Also validate output field
            fileProcessor.validateOutputField(outputFileField);
          }
        }
      };
      
      // Use input event for more responsive feedback
      if (utils && utils.debounce) {
        inputDirField.addEventListener('input', utils.debounce(inputHandler, 300));
      } else {
        inputDirField.addEventListener('input', inputHandler);
      }
      inputDirField.addEventListener('change', inputHandler);
      
      console.log("Input/output relationship initialized");
    } catch (error) {
      this.handleError(error, "Error initializing input/output relationship");
    }
  },

  /**
   * Initialize drag and drop functionality for file uploads
   */
  initializeDragAndDrop() {
    try {
      const dropZone = document.getElementById('drop-zone');
      
      if (!dropZone) {
        console.warn("Drop zone not found for drag and drop initialization");
        return;
      }
      
      // Define helper functions
      const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      
      const highlight = () => {
        dropZone.classList.add('drag-highlight');
      };
      
      const unhighlight = () => {
        dropZone.classList.remove('drag-highlight');
      };
      
      const handleDrop = (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        // Handle the files
        if (files && files.length > 0) {
          state.selectedFiles = Array.from(files);
          
          // Update input dir field based on folder structure if available
          const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
          if (inputDirField) {
            inputDirField.value = this.determineCommonDirectory(state.selectedFiles) || '';
            
            // Trigger change event to update UI
            const event = new Event('change', { bubbles: true });
            inputDirField.dispatchEvent(event);
          }
          
          // Update UI with selected files
          this.updateSelectedFilesInfo(state.selectedFiles);
          
          // Log to terminal
          this.logToTerminal('info', `Dropped ${files.length} files for processing`);
        }
      };
      
      // Prevent default drag behaviors
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
      });
      
      // Highlight drop zone when item is dragged over it
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
      });
      
      // Remove highlight when item is dragged out
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
      });
      
      // Handle dropped files
      dropZone.addEventListener('drop', handleDrop.bind(this), false);
      
      console.log("Drag and drop initialized");
    } catch (error) {
      this.handleError(error, "Error initializing drag and drop");
    }
  },

  /**
   * Determine common directory from a list of files
   * @param {Array<File>} files - List of File objects
   * @returns {string} - Common directory path
   */
  determineCommonDirectory(files) {
    try {
      if (!files || files.length === 0) return '';
      
      // Get the first file's path
      const firstPath = files[0].webkitRelativePath || '';
      if (!firstPath) return '';
      
      // Extract directory path (everything before the last slash)
      const pathParts = firstPath.split('/');
      if (pathParts.length < 2) return '';
      
      // Return the root directory
      return pathParts[0] || '';
    } catch (error) {
      this.handleError(error, "Error determining common directory");
      return '';
    }
  },

  /**
   * Update selected files info display
   * @param {Array<File>} files - List of File objects
   */
  updateSelectedFilesInfo(files) {
    try {
      const infoElement = document.getElementById('selected-files-info');
      if (!infoElement) return;
      
      // Clear existing content
      infoElement.innerHTML = '';
      
      if (!files || files.length === 0) {
        infoElement.innerHTML = '<div class="alert alert-info mt-3">No files selected</div>';
        return;
      }
      
      // Create summary info
      const totalFiles = files.length;
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      // Create file type counts
      const fileTypes = {};
      files.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      });
      
      // Sort file types by count (descending)
      const sortedTypes = Object.entries(fileTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `<span class="badge bg-light text-dark me-1 mb-1">.${ext} (${count})</span>`)
        .join(' ');
      
      // Create info HTML with enhanced UI
      let infoHtml = `
        <div class="alert alert-info mt-3 file-info-container">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong>${totalFiles} files selected</strong>
            <span class="badge bg-primary">${utils.formatBytes(totalSize)}</span>
          </div>
          <div class="small mt-2 file-types-container">
            <div class="mb-1">File types:</div>
            <div class="d-flex flex-wrap">
              ${sortedTypes}
            </div>
          </div>
        </div>
      `;
      
      // Show file list if fewer than 20 files
      if (files.length < 20) {
        const fileListHtml = `
          <div class="card mt-2 file-list-card">
            <div class="card-header bg-light">
              <span class="card-title mb-0">Selected Files</span>
            </div>
            <ul class="list-group list-group-flush small">
              ${Array.from(files).slice(0, 10).map(file => 
                `<li class="list-group-item d-flex justify-content-between">
                  <span class="text-truncate" style="max-width: 70%;" title="${file.name}">${file.name}</span>
                  <span class="text-muted">${utils.formatBytes(file.size)}</span>
                </li>`
              ).join('')}
              ${files.length > 10 ? 
                `<li class="list-group-item text-center text-muted">
                  ...and ${files.length - 10} more files
                </li>` : ''}
            </ul>
          </div>
        `;
        
        infoHtml += fileListHtml;
      }
      
      // Update the info element
      infoElement.innerHTML = infoHtml;
    } catch (error) {
      this.handleError(error, "Error updating selected files info");
    }
  },

  /**
   * Show progress container
   */
  showProgress() {
    try {
      // Get elements via uiRegistry or direct DOM
      const formContainer = uiRegistry.getElement('fileTab.formContainer') || document.getElementById('form-container');
      const progressContainer = uiRegistry.getElement('fileTab.progressContainer') || document.getElementById('progress-container');
      const progressBar = uiRegistry.getElement('fileTab.progressBar') || document.getElementById('progress-bar');
      const progressStatus = uiRegistry.getElement('fileTab.progressStatus') || document.getElementById('progress-status');
      const progressStats = uiRegistry.getElement('fileTab.progressStats') || document.getElementById('progress-stats');
      
      // Use UI module for transition with improved animation
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        ui.transitionBetweenElements(formContainer, progressContainer, 'slide-left');
      } else {
        // Fallback to simple visibility toggle
        if (ui && typeof ui.toggleElementVisibility === 'function') {
          ui.toggleElementVisibility(formContainer, false);
          ui.toggleElementVisibility(progressContainer, true);
        } else {
          // Direct fallback
          if (formContainer) formContainer.classList.add('d-none');
          if (progressContainer) progressContainer.classList.remove('d-none');
        }
      }
      
      // Reset progress elements
      if (progressBar) {
        if (ui && typeof ui.updateProgressBarElement === 'function') {
          ui.updateProgressBarElement(progressBar, 0);
        } else {
          progressBar.style.width = '0%';
          progressBar.setAttribute('aria-valuenow', 0);
          progressBar.textContent = '0%';
        }
      }
      
      if (progressStatus) {
        if (ui && typeof ui.updateProgressStatus === 'function') {
          ui.updateProgressStatus(progressStatus, "Initializing...");
        } else {
          progressStatus.textContent = "Initializing...";
        }
      }
      
      if (progressStats) progressStats.innerHTML = "";
      
      // Add cancel button functionality
      const cancelBtn = uiRegistry.getElement('fileTab.cancelBtn') || document.getElementById('cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = false;
        
        // Set up cancel handler - use fileProcessorCancelClick instead of handleCancelClick
        // to avoid conflicts with other modules
        cancelBtn.onclick = this.handleFileProcessorCancelClick.bind(this);
      }
      
      // Log to terminal
      this.logToTerminal('info', 'Processing stage: initializing');
    } catch (error) {
      this.handleError(error, "Error showing progress UI");
    }
  },

  /**
   * Show the main form container
   */
  showForm() {
    try {
      // Get elements via uiRegistry or direct DOM
      const formContainer = uiRegistry.getElement('fileTab.formContainer') || document.getElementById('form-container');
      const progressContainer = uiRegistry.getElement('fileTab.progressContainer') || document.getElementById('progress-container');
      const resultContainer = uiRegistry.getElement('fileTab.resultContainer') || document.getElementById('result-container');
      const errorContainer = uiRegistry.getElement('fileTab.errorContainer') || document.getElementById('error-container');
      const cancelledContainer = document.getElementById('cancelled-container');
      const submitBtn = uiRegistry.getElement('fileTab.submitBtn') || document.getElementById('submit-btn');

      // Stop status polling if active
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }

      // Reset state
      state.processing = false;
      state.currentTaskId = null;
      state.isProcessingCancelled = false;
      state.socketReconnectAttempts = 0;
      
      // Update UI state
      state.uiState.isFormShown = true;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;

      // Show form and hide other containers with smooth transitions
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        const visibleContainer = [progressContainer, resultContainer, errorContainer, cancelledContainer]
          .find(container => container && !container.classList.contains('d-none'));
        
        if (visibleContainer) {
          ui.transitionBetweenElements(visibleContainer, formContainer, 'fade');
        } else {
          ui.toggleElementVisibility(formContainer, true);
        }
        
        // Hide other containers
        [progressContainer, resultContainer, errorContainer, cancelledContainer].forEach(container => {
          if (container && container !== visibleContainer) {
            ui.toggleElementVisibility(container, false);
          }
        });
      } else {
        // Fallback to basic visibility toggle
        if (ui && typeof ui.toggleElementVisibility === 'function') {
          ui.toggleElementVisibility(formContainer, true);
          
          if (progressContainer) ui.toggleElementVisibility(progressContainer, false);
          if (resultContainer) ui.toggleElementVisibility(resultContainer, false);
          if (errorContainer) ui.toggleElementVisibility(errorContainer, false);
          if (cancelledContainer) ui.toggleElementVisibility(cancelledContainer, false);
        } else {
          // Direct fallback
          if (formContainer) formContainer.classList.remove('d-none');
          if (progressContainer) progressContainer.classList.add('d-none');
          if (resultContainer) resultContainer.classList.add('d-none');
          if (errorContainer) errorContainer.classList.add('d-none');
          if (cancelledContainer) cancelledContainer.classList.add('d-none');
        }
      }

      // Reset button state
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
    } catch (error) {
      this.handleError(error, "Error showing form");
    }
  },

  /**
   * Show task result with enhanced stats processing
   * @param {Object} data - The result data
   */
  showResult(data) {
    try {
      console.log("Showing result with data:", data);
      
      // Get UI elements with fallbacks
      const progressContainer = uiRegistry.getElement('fileTab.progressContainer') || document.getElementById('progress-container');
      const resultContainer = uiRegistry.getElement('fileTab.resultContainer') || document.getElementById('result-container');
      const resultStats = uiRegistry.getElement('fileTab.resultStats') || document.getElementById('result-stats');
      const openBtn = uiRegistry.getElement('fileTab.openBtn') || document.getElementById('open-btn');
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = true;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
      
      // Use UI module for transition with improved animation
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        ui.transitionBetweenElements(progressContainer, resultContainer, 'fade');
      } else {
        // Fallback to simple visibility toggle
        if (ui && typeof ui.toggleElementVisibility === 'function') {
          ui.toggleElementVisibility(progressContainer, false);
          ui.toggleElementVisibility(resultContainer, true);
        } else {
          // Direct fallback
          if (progressContainer) progressContainer.classList.add('d-none');
          if (resultContainer) resultContainer.classList.remove('d-none');
        }
      }
      
      // Enhanced stats processing
      if (resultStats) {
        try {
          // Ensure we get stats data from all possible locations in the response
          let statsData = data.stats || 
                        (data.result && data.result.stats) || 
                        (data.data && data.data.stats) || 
                        {};
          
          console.log("Raw stats data:", statsData);
          
          // Process the stats data to ensure all required values exist
          statsData = this.processStatsData(statsData);
          
          console.log("Processed stats data:", statsData);
          
          // Update the stats display
          this.updateResultStats(resultStats, statsData, data.output_file || data.result?.output_file);
        } catch (statsError) {
          console.error("Error processing stats data:", statsError);
          // Provide fallback display in case of error
          resultStats.innerHTML = `
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Error processing statistics data. Raw data: 
              <button class="btn btn-sm btn-outline-secondary ms-2" onclick="console.log('Stats data:', ${JSON.stringify(data.stats || {})})">
                Log to Console
              </button>
            </div>
          `;
        }
      }
      
      // Set the output file path for the open button
      if (data.output_file && openBtn) {
        openBtn.setAttribute('data-task-id', state.currentTaskId || data.task_id);
        openBtn.setAttribute('data-output-file', data.output_file);
      }
      
      // Log to terminal
      this.logToTerminal('success', `Processing completed: ${data.output_file || 'Unknown file'}`, 
                        data.stats ? JSON.stringify(data.stats, null, 2) : undefined);
      
      // Also emit event for other modules to react to completion
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.result_shown', {
          task_id: state.currentTaskId || data.task_id,
          output_file: data.output_file,
          timestamp: Date.now()
        });
      }
      
      // Clear session storage as task is complete
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('taskStartTime');
      
      // Stop status polling if active
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Add a "New Task" button for better UX
      const actionContainer = document.createElement('div');
      actionContainer.className = 'mt-4 d-flex justify-content-between';
      actionContainer.innerHTML = `
        <button id="new-task-btn-result" class="btn btn-primary">
          <i class="fas fa-plus me-2"></i>New Task
        </button>
      `;
      
      // Find a good place to add the button
      const buttonContainer = resultContainer.querySelector('.action-buttons') || 
                            resultContainer.querySelector('.mt-3') ||
                            resultStats;
      
      if (buttonContainer && !buttonContainer.querySelector('#new-task-btn-result')) {
        buttonContainer.appendChild(actionContainer);
        
        // Add event listener
        const newTaskBtn = document.getElementById('new-task-btn-result');
        if (newTaskBtn) {
          newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
        }
      }
    } catch (error) {
      this.handleError(error, "Error showing result UI");
      
      // Try to recover by showing form
      try {
        this.showForm();
      } catch (recoveryError) {
        console.error("Error recovering from showResult error:", recoveryError);
      }
    }
  },

  /**
   * Update result statistics display with proper formatting
   * @param {HTMLElement} element - Stats container element
   * @param {Object} stats - Statistics object
   * @param {string} outputFile - Output file path
   * @returns {string} - HTML for stats display
   */
  updateResultStats(element, stats, outputFile) {
    try {
      if (!element) return;
      
      // Process stats to ensure all values are present
      stats = this.processStatsData(stats);
      
      // Create a formatted display of the stats
      let statsHtml = `
        
        <div class="stats-container">
          <div class="stats-header d-flex justify-content-between align-items-center">
            <h5><i class="fas fa-chart-bar me-2"></i>Processing Statistics</h5>
            <div class="time-badge">
              <i class="fas fa-clock"></i>
              <span>${this.formatDuration(stats.total_duration_seconds || stats.processing_time || 0)} total processing time</span>
            </div>
          </div>
          
          <div class="stats-section">
            <div class="row">
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
                    <div class="icon" style="color: #38a169;"><i class="fas fa-check-circle"></i></div>
                    <div>
                      <div class="value ${stats.processed_files === 0 ? 'zero-value' : ''}" style="color: #38a169;">${stats.processed_files}</div>
                      <div class="label">Processed Files</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #e53e3e;"><i class="fas fa-times-circle"></i></div>
                    <div>
                      <div class="value ${stats.error_files === 0 ? 'zero-value' : ''}" style="color: #e53e3e;">${stats.error_files}</div>
                      <div class="label">Error Files</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="row mt-3">
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #ecc94b;"><i class="fas fa-exclamation-circle"></i></div>
                    <div>
                      <div class="value ${stats.skipped_files === 0 ? 'zero-value' : ''}" style="color: #ecc94b;">${stats.skipped_files}</div>
                      <div class="label">Skipped Files</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #4299e1;"><i class="fas fa-database"></i></div>
                    <div>
                      <div class="value ${stats.total_bytes === 0 ? 'zero-value' : ''}" style="color: #4299e1;">${this.formatBytes(stats.total_bytes)}</div>
                      <div class="label">Total Size</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #9f7aea;"><i class="fas fa-puzzle-piece"></i></div>
                    <div>
                      <div class="value ${stats.total_chunks === 0 ? 'zero-value' : ''}" style="color: #9f7aea;">${stats.total_chunks}</div>
                      <div class="label">Total Chunks</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          ${stats.pdf_files > 0 ? `
          <div class="stats-section pdf-stats">
            <h6 class="text-white mb-3"><i class="fas fa-file-pdf me-2"></i>PDF Statistics</h6>
            <div class="row">
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #ed8936;"><i class="fas fa-file-pdf"></i></div>
                    <div>
                      <div class="value" style="color: #ed8936;">${stats.pdf_files}</div>
                      <div class="label">PDF Files</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #4fd1c5;"><i class="fas fa-table"></i></div>
                    <div>
                      <div class="value ${stats.tables_extracted === 0 ? 'zero-value' : ''}" style="color: #4fd1c5;">${stats.tables_extracted}</div>
                      <div class="label">Tables Extracted</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="stat-card">
                  <div class="d-flex align-items-center">
                    <div class="icon" style="color: #667eea;"><i class="fas fa-quote-right"></i></div>
                    <div>
                      <div class="value ${stats.references_extracted === 0 ? 'zero-value' : ''}" style="color: #667eea;">${stats.references_extracted}</div>
                      <div class="label">References Extracted</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            ${stats.pdf_document_types ? `
            <div class="row mt-3">
              <div class="col-12">
                <div class="stat-card">
                  <h6 class="text-white mb-3">Document Types</h6>
                  <div class="d-flex flex-wrap gap-3">
                    <div class="px-3 py-2 bg-gray-700 rounded">
                      <div class="value text-center">${stats.pdf_document_types.academic || 0}</div>
                      <div class="label text-center">Academic</div>
                    </div>
                    <div class="px-3 py-2 bg-gray-700 rounded">
                      <div class="value text-center">${stats.pdf_document_types.scanned || 0}</div>
                      <div class="label text-center">Scanned</div>
                    </div>
                    <div class="px-3 py-2 bg-gray-700 rounded">
                      <div class="value text-center">${stats.pdf_document_types.report || 0}</div>
                      <div class="label text-center">Reports</div>
                    </div>
                    <div class="px-3 py-2 bg-gray-700 rounded">
                      <div class="value text-center">${stats.pdf_document_types.book || 0}</div>
                      <div class="label text-center">Books</div>
                    </div>
                    <div class="px-3 py-2 bg-gray-700 rounded">
                      <div class="value text-center">${stats.pdf_document_types.general || 0}</div>
                      <div class="label text-center">General</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          <div class="stats-section">
            <h6 class="text-white mb-3"><i class="fas fa-tachometer-alt me-2"></i>Performance Metrics</h6>
            <div class="performance-metrics">
              <div class="performance-metric">
                <div class="value">${this.formatDuration(stats.total_duration_seconds || stats.processing_time || 0)}</div>
                <div class="label">Total Duration</div>
              </div>
              
              <div class="performance-metric">
                <div class="value">${this.formatDuration(stats.avg_file_processing_time || 0)}</div>
                <div class="label">Avg. Time Per File</div>
              </div>
              
              <div class="performance-metric">
                <div class="value">${((stats.processed_files || 0) / Math.max(1, stats.total_duration_seconds || stats.processing_time || 1)).toFixed(2)}</div>
                <div class="label">Files Per Second</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- File Actions Buttons -->
        ${outputFile ? `
        <div class="mt-4 d-flex gap-2">
          <button class="btn btn-primary" id="open-btn" data-output-file="${outputFile}">
            <i class="fas fa-file-alt me-2"></i>Open Output File
          </button>
          <button class="btn btn-secondary" id="open-folder-btn" data-path="${outputFile}">
            <i class="fas fa-folder-open me-2"></i>Open Containing Folder
          </button>
        </div>
        ` : ''}
      `;
      
      // Update the element
      element.innerHTML = statsHtml;
      
      // Add event listeners for the buttons
      setTimeout(() => {
        // Open file button
        const openBtn = document.getElementById('open-btn');
        if (openBtn) {
          openBtn.addEventListener('click', () => {
            const path = openBtn.getAttribute('data-output-file');
            if (path) {
              this.openFileOrFolder(path);
            }
          });
        }
        
        // Open folder button
        const openFolderBtn = document.getElementById('open-folder-btn');
        if (openFolderBtn) {
          openFolderBtn.addEventListener('click', () => {
            const path = openFolderBtn.getAttribute('data-path');
            if (path) {
              this.openFileOrFolder(path, true);
            }
          });
        }
      }, 100);
      
      return true;
    } catch (error) {
      console.error("Error updating result stats:", error);
      
      // Provide a fallback display in case of error
      try {
        element.innerHTML = `
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i> 
            There was an error displaying statistics. Raw data:
            <pre class="mt-2 p-2 bg-light">${JSON.stringify(stats, null, 2)}</pre>
          </div>
        `;
      } catch (e) {
        element.innerHTML = '<div class="alert alert-danger">Unable to display statistics.</div>';
      }
      
      return false;
    }
  },
  /**
   * Process raw stats data from backend to ensure all values are properly extracted
   * @param {Object} rawStats - Raw statistics from backend
   * @returns {Object} - Processed statistics object
   */
  processStatsData(rawStats) {
    // Create a default stats object with zero values
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
    
    // Handle null or undefined stats
    if (!rawStats) {
      return defaultStats;
    }
    
    // If stats is a string, try to parse it
    if (typeof rawStats === 'string') {
      try {
        rawStats = JSON.parse(rawStats);
      } catch (e) {
        console.error('Error parsing stats string:', e);
        return defaultStats;
      }
    }
    
    // If stats has a to_dict method (Python object serialization)
    if (rawStats.to_dict && typeof rawStats.to_dict === 'function') {
      try {
        rawStats = rawStats.to_dict();
      } catch (e) {
        console.error('Error calling to_dict on stats:', e);
      }
    }
    
    // Handle nested stats structure
    if (rawStats.stats && typeof rawStats.stats === 'object') {
      rawStats = rawStats.stats;
    }
    
    // Merge with default stats to ensure all required fields exist
    return {...defaultStats, ...rawStats};
  },
  /**
   * Add JSON view to statistics display
   * @param {Object} stats - Statistics object
   * @param {string} outputFile - Output file path
   * @returns {string} - HTML for JSON view
   */
  addJsonView(stats, outputFile) {
    try {
      const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
      const bgClass = isDarkMode ? 'bg-dark text-light' : 'bg-light';
    
      // Create a result object for JSON display
      const resultData = {
        stats: stats,
        output_file: outputFile
      };
    
      // Format JSON with syntax highlighting
      const formattedJson = utils && typeof utils.formatJsonForDisplay === 'function'
        ? utils.formatJsonForDisplay(resultData) 
        : JSON.stringify(resultData, null, 2);
    
      return `
        <div class="card mb-3 json-view-card">
          <div class="card-header ${bgClass}" id="jsonHeader">
            <button class="btn btn-link collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#jsonContent">
              <i class="fas fa-code me-1"></i> View Raw JSON
            </button>
            <button class="btn btn-sm btn-outline-secondary float-end copy-json-btn" id="copy-json-btn">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
          <div id="jsonContent" class="collapse">
            <div class="card-body ${bgClass} p-0">
              <pre class="mb-0 p-3 json-content"><code class="language-json">${formattedJson}</code></pre>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error("Error creating JSON view:", error);
      return '';
    }
  },

  /**
     * Show error user interface
     * @param {Object} data - Error data object
     */
  showError(data) {
    try {
      const progressContainer = uiRegistry.getElement('fileTab.progressContainer') || document.getElementById('progress-container');
      const errorContainer = uiRegistry.getElement('fileTab.errorContainer') || document.getElementById('error-container');
      const errorMessage = uiRegistry.getElement('fileTab.errorMessage') || document.getElementById('error-message');
      const errorDetails = uiRegistry.getElement('fileTab.errorDetails') || document.getElementById('error-details');
      const retryBtn = document.getElementById('retry-btn');
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = true;
      state.uiState.isCancelledShown = false;
      
      // Use UI module for transition with improved animation
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        ui.transitionBetweenElements(progressContainer, errorContainer, 'fade');
      } else {
        // Fallback to simple visibility toggle
        if (ui && typeof ui.toggleElementVisibility === 'function') {
          ui.toggleElementVisibility(progressContainer, false);
          ui.toggleElementVisibility(errorContainer, true);
        } else {
          // Direct fallback
          if (progressContainer) progressContainer.classList.add('d-none');
          if (errorContainer) errorContainer.classList.remove('d-none');
        }
      }
      
      // Update error message
      if (errorMessage) {
        errorMessage.textContent = data.error || 'An error occurred during processing.';
      }
      
      // Update error details if present
      if (errorDetails) {
        if (data.details) {
          errorDetails.innerHTML = `<strong>Details:</strong> ${data.details}`;
          errorDetails.classList.remove('d-none');
        } else {
          errorDetails.classList.add('d-none');
        }
      }
      
      // Add stack trace if available
      const errorStack = document.getElementById('error-stack');
      const errorStackContainer = document.getElementById('error-stack-container');
      
      if (errorStack && errorStackContainer) {
        if (data.stack) {
          errorStack.textContent = data.stack;
          errorStackContainer.classList.remove('d-none');
        } else {
          errorStackContainer.classList.add('d-none');
        }
      }
      
      // Set up retry button
      if (retryBtn) {
        retryBtn.onclick = this.handleNewTaskClick.bind(this);
      }
      
      // Log to terminal
      this.logToTerminal('error', `Processing error: ${data.error || 'Unknown error'}`);
    } catch (error) {
      this.handleError(error, "Error showing error UI");
      console.error("Error displaying error UI:", error);
    }
  },

  /**
   * Show task cancellation UI
   */
  showCancelled() {
    try {
      const progressContainer = uiRegistry.getElement('fileTab.progressContainer') || document.getElementById('progress-container');
      let cancelledContainer = document.getElementById('cancelled-container');
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = true;
      
      if (!cancelledContainer) {
        // Create cancelled container if it doesn't exist
        cancelledContainer = document.createElement('div');
        cancelledContainer.id = 'cancelled-container';
        cancelledContainer.className = 'cancelled-container text-center p-4 d-none';
        cancelledContainer.innerHTML = `
          <div class="alert alert-warning mb-4">
            <i class="fas fa-ban me-2"></i> Processing has been cancelled
          </div>
          <button id="cancelled-new-task-btn" class="btn btn-primary">
            <i class="fas fa-plus me-2"></i> New Task
          </button>
        `;
        
        // Add to parent
        const parent = progressContainer?.parentElement;
        if (parent) {
          parent.appendChild(cancelledContainer);
        } else {
          // Fallback to body
          document.body.appendChild(cancelledContainer);
        }
        
        // Add event listener
        const newTaskBtn = cancelledContainer.querySelector('#cancelled-new-task-btn');
        if (newTaskBtn) {
          newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
        }
      }
      
      // Show cancelled container
      if (cancelledContainer) {
        if (ui && typeof ui.toggleElementVisibility === 'function') {
          if (progressContainer) ui.toggleElementVisibility(progressContainer, false);
          ui.toggleElementVisibility(cancelledContainer, true);
        } else {
          // Direct fallback
          if (progressContainer) progressContainer.classList.add('d-none');
          cancelledContainer.classList.remove('d-none');
        }
      }
      
      // Reset state
      state.processing = false;
      state.currentTaskId = null;
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Stop status polling if active
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
    } catch (error) {
      this.handleError(error, "Error showing cancelled UI");
    }
  },

  /**
   * Initialize form validation
   */
  initializeFormValidation() {
    try {
      // Try getting elements through both uiRegistry and direct DOM
      const form = uiRegistry.getElement('fileTab.form') || document.getElementById('process-form');
      const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
      const outputFileField = uiRegistry.getElement('fileTab.outputFile') || document.getElementById('output-file');
      
      if (!form || !inputDirField || !outputFileField) {
        console.warn("Form elements not found for validation setup");
        return;
      }
      
      // Add validation for input directory
      inputDirField.addEventListener('blur', () => {
        this.validateInputDirectory(inputDirField.value.trim(), true);
      });
      
      // Add validation for output file
      outputFileField.addEventListener('blur', () => {
        this.validateOutputField(outputFileField);
      });
      
      // Validate the entire form before submission
      form.addEventListener('submit', (e) => {
        console.log("Form validation triggered on submit");
        if (!this.validateForm()) {
          e.preventDefault();
          console.log("Form validation failed");
          return false;
        }
        console.log("Form validation passed");
      });
      
      console.log("Form validation initialized");
    } catch (error) {
      this.handleError(error, "Error initializing form validation");
    }
  },

  /**
   * Validate the output filename field
   * @param {HTMLElement} outputField - The output field element
   * @returns {boolean} - Whether the field is valid
   */
  validateOutputField(outputField) {
    try {
      if (!outputField) return false;
      
      const value = outputField.value.trim();
      
      // Check if empty
      if (!value) {
        outputField.classList.add('is-invalid');
        const feedback = outputField.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
          feedback.textContent = 'Please enter an output filename';
        }
        return false;
      }
      
      // Check for invalid characters
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(value)) {
        outputField.classList.add('is-invalid');
        const feedback = outputField.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
          feedback.textContent = 'Filename contains invalid characters: < > : " | ? *';
        }
        return false;
      }
      
      // Valid
      outputField.classList.remove('is-invalid');
      outputField.classList.add('is-valid');
      setTimeout(() => outputField.classList.remove('is-valid'), 2000);
      return true;
    } catch (error) {
      this.handleError(error, "Error validating output field");
      return false;
    }
  },

  /**
   * Validate the entire form
   * @returns {boolean} - Whether the form is valid
   */
  validateForm() {
    try {
      const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
      const outputFileField = uiRegistry.getElement('fileTab.outputFile') || document.getElementById('output-file');
      
      if (!inputDirField || !outputFileField) {
        console.error("Form fields not found");
        ui.showToast('Error', 'Form fields not found', 'error');
        return false;
      }
      
      const inputDir = inputDirField.value.trim();
      const outputFile = outputFileField.value.trim();
      
      // Check input directory
      if (!inputDir) {
        ui.showToast('Error', 'Please enter an input directory', 'error');
        inputDirField.classList.add('is-invalid');
        setTimeout(() => inputDirField.classList.remove('is-invalid'), 3000);
        inputDirField.focus();
        return false;
      }
      
      // Check output filename
      if (!outputFile) {
        ui.showToast('Error', 'Please enter an output filename', 'error');
        outputFileField.classList.add('is-invalid');
        setTimeout(() => outputFileField.classList.remove('is-invalid'), 3000);
        outputFileField.focus();
        return false;
      }
      
      return true;
    } catch (error) {
      this.handleError(error, "Error validating form");
      return false;
    }
  },

  /**
   * Handle file processing form submission
   * @param {Event} e - The form submission event
   */
  handleFileSubmit(e) {
    try {
      // Always prevent the default form behavior
      if (e) e.preventDefault();
      
      // Debug logging to help diagnose issues
      console.log("File processing form submitted", e);
      
      // Log to terminal
      this.logToTerminal('info', 'File processing started');
      
      // Get input values and validate
      const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
      const outputFileField = uiRegistry.getElement('fileTab.outputFile') || document.getElementById('output-file');
      const submitButton = uiRegistry.getElement('fileTab.submitBtn') || document.getElementById('submit-btn');
      
      if (!inputDirField || !outputFileField) {
        console.error("Form fields not found");
        ui.showToast('Error', 'Form fields not found', 'error');
        return;
      }
      
      const inputDir = inputDirField.value.trim();
      let outputFile = outputFileField.value.trim();
      
      if (!inputDir) {
        ui.showToast('Error', 'Please enter an input directory', 'error');
        inputDirField.classList.add('is-invalid');
        setTimeout(() => inputDirField.classList.remove('is-invalid'), 3000);
        inputDirField.focus();
        return;
      }
      
      if (!outputFile) {
        ui.showToast('Error', 'Please enter an output filename', 'error');
        outputFileField.classList.add('is-invalid');
        setTimeout(() => outputFileField.classList.remove('is-invalid'), 3000);
        outputFileField.focus();
        return;
      }
      
      // Add .json extension if not present
      if (!outputFile.toLowerCase().endsWith('.json')) {
        outputFile += '.json';
      }
      
      // Reset state
      state.isProcessingCancelled = false;
      state.processingStartTime = Date.now();
      state.progressUpdateCount = 0;
      state.progressRates = [];
      state.lastProgressTimestamp = null;
      state.socketReconnectAttempts = 0;
      state.lastReportedProgress = -1;
      
      // Reset completion state
      state.completionState = {
        completed: false,
        completionTime: null,
        error: false,
        cancelled: false
      };
      
      // Mark as processing
      state.processing = true;
      
      // Update state manager if available
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(true);
      }
      
      // Show user feedback immediately
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
      }
      
      // Show progress UI immediately
      this.showProgress();
      
      // First validate the input directory
      this.validateInputDirectory(inputDir)
        .then(validInputResult => {
          // Debug log
          console.log("Directory validation result:", validInputResult);
          
          // Check if input directory is valid
          if (!validInputResult.isValid) {
            throw new Error(validInputResult.errorMessage || "Invalid input directory");
          }
          
          // If valid, proceed with processing
          // Use the validated path from the result, not the original input
          return this.startProcessing(validInputResult.path, outputFile);
        })
        .catch(error => {
          console.error("Directory validation failed:", error);
          ui.showToast('Error', error.message || 'Directory validation failed', 'error');
          
          // Log to terminal
          this.logToTerminal('error', `Directory validation failed: ${error.message}`);
          
          // Show error UI
          this.showError({ error: error.message || 'Directory validation failed' });
          
          // Reset button state
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
          }
          
          // Reset processing state
          state.processing = false;
          
          // Update state manager
          if (stateManager && typeof stateManager.setProcessingActive === 'function') {
            stateManager.setProcessingActive(false);
          }
        });
    } catch (error) {
      this.handleError(error, "Error in file submit handler");
    }
  },

  /**
   * Start the file processing with server
   * @param {string} inputDir - Input directory path
   * @param {string} outputFile - Output filename (with extension)
   */
  async startProcessing(inputDir, outputFile) {
    try {
      console.log("Starting processing with:", inputDir, outputFile);
      
      // Get the full output path 
      const outputPath = await this.getOutputPath(outputFile, inputDir);
      console.log("Resolved output path:", outputPath);
      
      // Check if file exists and confirm overwrite
      const fileExists = await this.checkFileExists(outputPath);
      if (fileExists) {
        const canProceed = confirm(`File "${outputPath}" already exists. Do you want to overwrite it?`);
        if (!canProceed) {
          // User cancelled overwrite, return to form
          this.showForm();
          state.processing = false;
          
          // Update state manager
          if (stateManager && typeof stateManager.setProcessingActive === 'function') {
            stateManager.setProcessingActive(false);
          }
          return;
        }
      }
      
      // Create JSON payload for processing
      const payload = {
        input_dir: inputDir,
        output_file: outputPath 
      };

      console.log("Sending API request to /api/process with payload:", payload);

      // Use the /api/process endpoint with proper JSON content
      const response = await this.fetchWithRetry("/api/process", { 
        method: "POST", 
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        let errorMessage;
        
        try {
          // Try to parse as JSON
          const errorJson = await response.json();
          errorMessage = errorJson.error || `Server error: ${response.status}`;
        } catch (e) {
          // Use text if not JSON
          const errorText = await response.text();
          errorMessage = errorText || `Server error: ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log("Server response from /api/process:", data);
      
      if (data.error) {
        this.showError({ error: data.error });
        state.processing = false;
        
        // Update state manager
        if (stateManager && typeof stateManager.setProcessingActive === 'function') {
          stateManager.setProcessingActive(false);
        }
        return;
      }
      
      // Store the task ID for status polling
      state.currentTaskId = data.task_id;
      window.currentTaskId = data.task_id; // For backward compatibility
      
      // Save task information to sessionStorage for persistence
      sessionStorage.setItem('ongoingTaskId', data.task_id);
      sessionStorage.setItem('ongoingTaskType', 'file');
      sessionStorage.setItem('outputFile', data.output_file || outputPath);
      sessionStorage.setItem('taskStartTime', Date.now().toString());
      
      // Update state manager if available
      if (stateManager && typeof stateManager.setCurrentTaskId === 'function') {
        stateManager.setCurrentTaskId(data.task_id);
      }
      
      // Log success to terminal
      this.logToTerminal('success', `Processing task started: ${data.task_id}`);
      
      // Set up progress tracking using the progressHandler module
      const progressOptions = {
        elementPrefix: '',  // Use default prefixes for main file tab
        saveToSessionStorage: true,
        taskType: 'file'
      };
      
      state.progressHandler = trackProgress(data.task_id, progressOptions);
      
      // Emit event for socket handler to start polling
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('task.start', {
          task_id: data.task_id,
          task_type: 'file',
          input_dir: inputDir,
          output_file: outputPath
        });
      }
      
      // Start manual polling as fallback
      this.startManualStatusPolling();
      
      // Show notification
      ui.showToast('Processing Started', 'Your files are being processed', 'info');
      
      // Emit event for other modules
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.processing.started', {
          task_id: data.task_id,
          input_dir: inputDir,
          output_file: outputPath
        });
      }
      
      console.log('Processing task started:', data);
    } catch (error) {
      console.error('Processing error:', error);
      this.showError({ error: 'Failed to start processing: ' + error.message });
      this.handleError(error, "Error starting processing task");
      
      // Reset processing state
      state.processing = false;
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Reset button state
      const submitButton = uiRegistry.getElement('fileTab.submitBtn') || document.getElementById('submit-btn');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
    }
  },

  /**
   * Check if a file exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>} - Whether the file exists
   */
  async checkFileExists(filePath) {
    try {
      const response = await this.fetchWithRetry('/api/check-file-exists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      
      if (!response.ok) {
        // Log to terminal
        this.logToTerminal('warning', `Failed to check if file exists: ${filePath}`);
        
        return false;
      }
      
      const data = await response.json();
      return data.exists === true;
    } catch (error) {
      console.error('Error checking if file exists:', error);
      
      // Log to terminal
      this.logToTerminal('error', `Error checking file existence: ${error.message}`);
      
      return false;
    }
  },

  /**
   * Get full output path for a filename and directory
   * @param {string} filename - The output filename
   * @param {string} directory - The containing directory
   * @returns {Promise<string>} - Full resolved path
   */
  async getOutputPath(filename, directory) {
    try {
      const response = await this.fetchWithRetry('/api/get-output-filepath', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filename: filename,
          directory: directory
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Failed to get output path: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Save output directory for future use
      if (data.directory) {
        state.lastSavedOutputDir = data.directory;
      }
      
      // Log to terminal
      this.logToTerminal('info', `Output file path: ${data.fullPath}`);
      
      return data.fullPath;
    } catch (error) {
      console.error('Error getting output file path:', error);
      
      // Log to terminal
      this.logToTerminal('error', `Error getting output path: ${error.message}`);
      
      // Return a fallback path
      return `${directory}/${filename}`;
    }
  },

  /**
     * Validate the input directory path
     * @param {string} inputDir - Directory path to validate
     * @param {boolean} showUiUpdates - Whether to show UI updates during validation
     * @returns {Promise<Object>} - Validation result with path and status
     */
  async validateInputDirectory(inputDir, showUiUpdates = false) {
    try {
      // Debug log the input directory being validated
      console.log(`Validating input directory: "${inputDir}"`);
      
      // Show validation in progress if requested
      if (showUiUpdates) {
        const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
        if (inputDirField) {
          inputDirField.classList.remove('is-invalid', 'is-valid');
          inputDirField.classList.add('is-validating');
        }
      }
      
      // Don't validate empty paths
      if (!inputDir) {
        return {
          isValid: false,
          path: inputDir,
          errorMessage: "Please enter a directory path"
        };
      }
      
      // Call the API endpoint to check the path
      console.log("Calling verify-path API...");
      const response = await this.fetchWithRetry('/api/verify-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: inputDir })
      });
      
      if (!response.ok) {
        // Remove validating state
        if (showUiUpdates) {
          const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
          if (inputDirField) {
            inputDirField.classList.remove('is-validating');
            inputDirField.classList.add('is-invalid');
          }
        }
        
        // Try to get error details
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to verify path: ${response.status}`);
      }
      
      const pathInfo = await response.json();
      console.log("Path verification response:", pathInfo);
      
      // Update UI if requested
      if (showUiUpdates) {
        const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
        if (inputDirField) {
          inputDirField.classList.remove('is-validating');
        }
      }
      
      if (pathInfo.exists && pathInfo.isDirectory) {
        // Directory exists
        if (!pathInfo.canWrite) {
          // Directory exists but isn't writable
          if (showUiUpdates) {
            const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
            if (inputDirField) {
              inputDirField.classList.add('is-invalid');
              const feedback = inputDirField.nextElementSibling;
              if (feedback && feedback.classList.contains('invalid-feedback')) {
                feedback.textContent = "Directory exists but you don't have permission to write to it.";
              }
            }
          }
          
          return {
            isValid: false,
            path: pathInfo.fullPath,
            errorMessage: "Directory exists but you don't have permission to write to it."
          };
        }
        
        // Valid directory - update UI
        if (showUiUpdates) {
          const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
          if (inputDirField) {
            inputDirField.classList.add('is-valid');
            setTimeout(() => inputDirField.classList.remove('is-valid'), 2000);
          }
        }
        
        // Valid directory
        return {
          isValid: true,
          path: pathInfo.fullPath
        };
      } else if (!pathInfo.exists && pathInfo.parentPath) {
        // Directory doesn't exist, but parent does
        if (pathInfo.canCreate) {
          // We can create the directory
          if (showUiUpdates) {
            const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
            if (inputDirField) {
              inputDirField.classList.add('is-warning');
              
              // Add warning indicator
              const parent = inputDirField.parentElement;
              if (parent) {
                let warningEl = parent.querySelector('.directory-warning');
                
                if (!warningEl) {
                  warningEl = document.createElement('div');
                  warningEl.className = 'directory-warning small text-warning mt-1';
                  parent.appendChild(warningEl);
                }
                
                warningEl.innerHTML = 'Directory does not exist yet, but can be created';
              }
            }
          }
          
          const createConfirmed = confirm(
            `Directory "${inputDir}" does not exist.\n\n` +
            `Would you like to create it?`
          );
          
          if (createConfirmed) {
            // User wants to create the directory
            console.log("Creating directory:", inputDir);
            const createResponse = await this.fetchWithRetry('/api/create-directory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: inputDir })
            });
            
            if (!createResponse.ok) {
              const errorData = await createResponse.json().catch(() => ({}));
              
              // Update UI
              if (showUiUpdates) {
                const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
                if (inputDirField) {
                  inputDirField.classList.remove('is-warning');
                  inputDirField.classList.add('is-invalid');
                }
              }
              
              throw new Error(errorData.message || `Failed to create directory: ${createResponse.status}`);
            }
            
            const createData = await createResponse.json();
            console.log("Directory creation response:", createData);
            
            if (createData.success) {
              // Update UI
              if (showUiUpdates) {
                const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
                if (inputDirField) {
                  inputDirField.classList.remove('is-warning');
                  inputDirField.classList.add('is-valid');
                  
                  // Remove warning indicator
                  const parent = inputDirField.parentElement;
                  if (parent) {
                    const warningEl = parent.querySelector('.directory-warning');
                    if (warningEl) {
                      parent.removeChild(warningEl);
                    }
                  }
                }
              }
              
              ui.showToast('Directory Created', `Created directory: ${createData.path}`, 'success');
              
              // Log to terminal
              this.logToTerminal('success', `Created directory: ${createData.path}`);
              
              // Add folder to history if history manager is available
              if (historyManager && typeof historyManager.addFileToRecent === 'function') {
                historyManager.addFileToRecent({
                  path: createData.path,
                  name: this.getFileNameFromPath(createData.path),
                  type: 'Directory',
                  lastAccessed: Date.now()
                });
              }
              
              return {
                isValid: true,
                path: createData.path
              };
            } else {
              // Update UI
              if (showUiUpdates) {
                const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
                if (inputDirField) {
                  inputDirField.classList.remove('is-warning');
                  inputDirField.classList.add('is-invalid');
                }
              }
              
              return {
                isValid: false,
                path: inputDir,
                errorMessage: `Failed to create directory: ${createData.message || 'Unknown error'}`
              };
            }
          } else {
            // User doesn't want to create the directory
            // Update UI
            if (showUiUpdates) {
              const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
              if (inputDirField) {
                inputDirField.classList.remove('is-warning');
                inputDirField.classList.add('is-invalid');
              }
            }
            
            return {
              isValid: false,
              path: inputDir,
              errorMessage: "Directory doesn't exist and wasn't created"
            };
          }
        } else {
          // Can't create the directory
          // Update UI
          if (showUiUpdates) {
            const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
            if (inputDirField) {
              inputDirField.classList.add('is-invalid');
            }
          }
          
          return {
            isValid: false,
            path: inputDir,
            errorMessage: `Cannot create directory "${inputDir}". Please check permissions.`
          };
        }
      } else {
        // No parent directory exists or other error
        // Update UI
        if (showUiUpdates) {
          const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
          if (inputDirField) {
            inputDirField.classList.add('is-invalid');
          }
        }
        
        return {
          isValid: false,
          path: inputDir,
          errorMessage: "Invalid directory path. Please enter a valid path."
        };
      }
    } catch (error) {
      // Log error
      console.error("Error validating input directory:", error);
      
      // Update UI
      if (showUiUpdates) {
        const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
        if (inputDirField) {
          inputDirField.classList.remove('is-validating');
          inputDirField.classList.add('is-invalid');
        }
      }
      
      // Log to terminal
      this.logToTerminal('error', `Directory validation error: ${error.message}`);
      
      throw error;
    }
  },

  /**
   * Initialize browse buttons for directory selection
   */
  initializeBrowseButtons() {
    try {
      // Get button via both uiRegistry and direct DOM
      const browseBtn = uiRegistry.getElement('fileTab.browseBtn') || document.getElementById('browse-btn');
      const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
      
      if (browseBtn && inputDirField) {
        browseBtn.addEventListener('click', () => {
          // Use the fileHandler's browse function
          if (fileHandler && typeof fileHandler.handleBrowseClick === 'function') {
            fileHandler.handleBrowseClick(inputDirField);
          } else {
            console.warn("fileHandler.handleBrowseClick not available");
            ui.showToast('Warning', 'Directory browser not available', 'warning');
          }
        });
        
        console.log("Browse button initialized");
      }
      
      // Also initialize file input change event
      const folderInput = document.getElementById('folder-input');
      if (folderInput && inputDirField) {
        folderInput.addEventListener('change', () => {
          // When files are selected, try to determine the common directory
          if (folderInput.files && folderInput.files.length > 0) {
            state.selectedFiles = Array.from(folderInput.files);
            inputDirField.value = this.determineCommonDirectory(state.selectedFiles) || '';
            
            // Trigger change event to update dependent UI
            const event = new Event('change', { bubbles: true });
            inputDirField.dispatchEvent(event);
            
            // Update selected files info
            this.updateSelectedFilesInfo(state.selectedFiles);
            
            // Try to use the server's path detection if needed
            if (!inputDirField.value && state.selectedFiles.length > 0) {
              this.detectPathFromServer(state.selectedFiles);
            }
          }
        });
      }
    } catch (error) {
      this.handleError(error, "Error initializing browse buttons");
    }
  },

  /**
   * Use server-side path detection when client-side detection fails
   * @param {Array<File>} files - Selected files array
   */
  async detectPathFromServer(files) {
    try {
      if (!files || files.length === 0) return;
      
      // Get the first few file paths to send to server
      const filePaths = Array.from(files)
        .slice(0, 5)
        .map(file => file.webkitRelativePath || file.path || file.name);
      
      // Find a potential folder name from the paths
      let folderName = '';
      if (files[0].webkitRelativePath) {
        const parts = files[0].webkitRelativePath.split('/');
        if (parts.length > 1) {
          folderName = parts[0];
        }
      }
      
      // Call server API to detect path
      const response = await this.fetchWithRetry("/api/detect-path", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filePaths: filePaths,
          folderName: folderName
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update input field if we got a path
        if (data.fullPath) {
          const inputDirField = uiRegistry.getElement('fileTab.inputDir') || document.getElementById('input-dir');
          if (inputDirField) {
            inputDirField.value = data.fullPath;
            // Trigger validation
            this.validateInputDirectory(data.fullPath, true);
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            inputDirField.dispatchEvent(event);
          }
        }
      } else {
        console.warn("Path detection API call failed");
      }
    } catch (error) {
      console.warn("Error detecting path from server:", error);
    }
  },

  /**
   * Open a file or folder using the server API
   * @param {string} path - Path to open
   * @param {boolean} isFolder - Whether this is a folder
   */
  async openFileOrFolder(path, isFolder = false) {
    try {
      // Try to use fileHandler first if available
      if (fileHandler) {
        if (isFolder && typeof fileHandler.openContainingFolder === 'function') {
          fileHandler.openContainingFolder(path);
          return;
        } else if (!isFolder && typeof fileHandler.openFile === 'function') {
          fileHandler.openFile(path);
          return;
        }
      }
      
      // Fallback to API
      const endpoint = isFolder ? '/api/open-folder' : '/api/open-file';
      const response = await this.fetchWithRetry(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        ui.showToast('Error', data.message || 'Failed to open file', 'error');
      } else {
        // Add to historyManager's recent files if not a folder
        if (!isFolder && historyManager && typeof historyManager.addFileToRecent === 'function') {
          historyManager.addFileToRecent({
            path: path,
            name: this.getFileNameFromPath(path),
            lastAccessed: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Error opening file/folder:', error);
      ui.showToast('Error', `Failed to open: ${error.message}`, 'error');
    }
  },

  /**
   * Queue a UI update function to run
   * @param {Function} updateFn - Function to run for UI update
   */
  queueUIUpdate(updateFn) {
    try {
      if (typeof updateFn !== 'function') return;
      
      // Add to queue
      state.uiUpdateQueue.push(updateFn);
      
      // Set up timer if not already running
      if (!state.uiUpdateTimer) {
        state.uiUpdateTimer = setTimeout(() => this.flushUIUpdates(), UI_UPDATE_DEBOUNCE_MS);
      }
    } catch (error) {
      this.handleError(error, "Error queueing UI update");
    }
  },

  /**
   * Apply all queued UI updates
   */
  flushUIUpdates() {
    try {
      // Clear timer
      clearTimeout(state.uiUpdateTimer);
      state.uiUpdateTimer = null;
      
      // Apply all updates in queue
      const updates = [...state.uiUpdateQueue];
      state.uiUpdateQueue = [];
      
      // Batch DOM operations
      requestAnimationFrame(() => {
        updates.forEach(updateFn => {
          try {
            updateFn();
          } catch (error) {
            console.error("Error in UI update:", error);
          }
        });
      });
    } catch (error) {
      this.handleError(error, "Error flushing UI updates");
    }
  }
  };

// Ensure DOM is ready before initializing
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => {
  // Use setTimeout to ensure all modules are loaded
  setTimeout(() => fileProcessor.initialize(), 100);
});
} else {
// DOM already loaded, initialize with small delay
setTimeout(() => fileProcessor.initialize(), 100);
}

// Export both default and named exports
export default fileProcessor;
export const initialize = fileProcessor.initialize.bind(fileProcessor);
export const handleError = fileProcessor.handleError.bind(fileProcessor);
export const logToTerminal = fileProcessor.logToTerminal.bind(fileProcessor);
export const registerEvents = fileProcessor.registerEvents.bind(fileProcessor);
export const checkForOngoingTask = fileProcessor.checkForOngoingTask.bind(fileProcessor);
export const setupGlobalErrorHandling = fileProcessor.setupGlobalErrorHandling.bind(fileProcessor);
export const handleOnlineStatusChange = fileProcessor.handleOnlineStatusChange.bind(fileProcessor);
export const handleApiError = fileProcessor.handleApiError.bind(fileProcessor);
export const attemptSocketReconnection = fileProcessor.attemptSocketReconnection.bind(fileProcessor);
export const startManualStatusPolling = fileProcessor.startManualStatusPolling.bind(fileProcessor);
export const processStatusUpdate = fileProcessor.processStatusUpdate.bind(fileProcessor);
export const handleTaskCompletion = fileProcessor.handleTaskCompletion.bind(fileProcessor);
export const handleTaskError = fileProcessor.handleTaskError.bind(fileProcessor);
export const handleTaskCancellation = fileProcessor.handleTaskCancellation.bind(fileProcessor);
export const initializeInputOutputRelationship = fileProcessor.initializeInputOutputRelationship.bind(fileProcessor);
export const initializeDragAndDrop = fileProcessor.initializeDragAndDrop.bind(fileProcessor);
export const initializeFormValidation = fileProcessor.initializeFormValidation.bind(fileProcessor);
export const initializeBrowseButtons = fileProcessor.initializeBrowseButtons.bind(fileProcessor);
export const determineCommonDirectory = fileProcessor.determineCommonDirectory.bind(fileProcessor);
export const detectPathFromServer = fileProcessor.detectPathFromServer.bind(fileProcessor);
export const updateSelectedFilesInfo = fileProcessor.updateSelectedFilesInfo.bind(fileProcessor);
export const validateOutputField = fileProcessor.validateOutputField.bind(fileProcessor);
export const validateForm = fileProcessor.validateForm.bind(fileProcessor);
export const handleFileSubmit = fileProcessor.handleFileSubmit.bind(fileProcessor);
export const validateInputDirectory = fileProcessor.validateInputDirectory.bind(fileProcessor);
export const startProcessing = fileProcessor.startProcessing.bind(fileProcessor);
export const checkFileExists = fileProcessor.checkFileExists.bind(fileProcessor);
export const getOutputPath = fileProcessor.getOutputPath.bind(fileProcessor);
export const showProgress = fileProcessor.showProgress.bind(fileProcessor);
export const showForm = fileProcessor.showForm.bind(fileProcessor);
export const showResult = fileProcessor.showResult.bind(fileProcessor);
export const showError = fileProcessor.showError.bind(fileProcessor);
export const showCancelled = fileProcessor.showCancelled.bind(fileProcessor);
export const addTaskToHistory = fileProcessor.addTaskToHistory.bind(fileProcessor);
export const handleFileProcessorCancelClick = fileProcessor.handleFileProcessorCancelClick.bind(fileProcessor);
export const handleNewTaskClick = fileProcessor.handleNewTaskClick.bind(fileProcessor);
export const cancelPendingRequests = fileProcessor.cancelPendingRequests.bind(fileProcessor);
export const fetchWithRetry = fileProcessor.fetchWithRetry.bind(fileProcessor);
export const updateProgressMetrics = fileProcessor.updateProgressMetrics.bind(fileProcessor);
export const calculateETA = fileProcessor.calculateETA.bind(fileProcessor);
export const updateProgressDisplay = fileProcessor.updateProgressDisplay.bind(fileProcessor);
export const queueUIUpdate = fileProcessor.queueUIUpdate.bind(fileProcessor);
export const flushUIUpdates = fileProcessor.flushUIUpdates.bind(fileProcessor);
export const updateProgressStats = fileProcessor.updateProgressStats.bind(fileProcessor);
export const updateResultStats = fileProcessor.updateResultStats.bind(fileProcessor);
export const addJsonView = fileProcessor.addJsonView.bind(fileProcessor);
export const openFileOrFolder = fileProcessor.openFileOrFolder.bind(fileProcessor);
export const forceResetProcessingState = fileProcessor.forceResetProcessingState.bind(fileProcessor);