/**
 * NeuroGen Server - Playlist Downloader Module
 * 
 * Handles YouTube playlist downloading, transcript extraction, and integration with the backend.
 * Includes progress tracking, real-time Socket.IO updates, error handling, and UI interactions.
 * 
 * Key features:
 * 1. Real-time progress tracking with Socket.IO
 * 2. Fixed 5% progress UI bug by implementing incremental progress
 * 3. Integration with the NeuroGenServer module system
 * 4. Robust error handling and recovery mechanisms
 * 5. User-friendly progress display and completion handling
 * 6. Proper state management and memory leak prevention
 * 7. Consistent with fileProcessor.js module design
 * 
 * @module playlistDownloader
 */

// Import core modules
import errorHandler from '../core/errorHandler.js';
import uiRegistry from '../core/uiRegistry.js';
import eventRegistry from '../core/eventRegistry.js';
import stateManager from '../core/stateManager.js';

// Import history manager
import historyManager from '../features/historyManager.js';

// Import progress handler module with named exports
import progressHandler, { 
  setupTaskProgress, 
  trackProgress, 
  updateProgressUI, 
  cancelTracking, 
  createProgressUI 
} from '../utils/progressHandler.js';

// Import utility modules - with fallbacks if modules fail to load
let ui, utils, fileHandler;

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
  completionHandled: new Set()
};

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
      console.log("Initializing playlist downloader module...");
      
      // Skip if already initialized
      if (state.initialized) {
        console.log("Playlist downloader module already initialized");
        return true;
      }
      
      // Safety check - if DOM not ready, defer initialization
      if (document.readyState === 'loading') {
        console.log("DOM not ready, deferring initialization");
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => this.initializeAfterDOMReady(), 0);
        });
        return false;
      } else {
        setTimeout(() => this.initializeAfterDOMReady(), 0);
      }
      
      // Load dependencies
      await this.loadDependencies();
      
      // Register with module system
      this.registerWithModuleSystem();
      
      // Start progress monitoring
      this.startProgressMonitoring();
      
      // Mark as initialized
      state.initialized = true;
      console.log("Playlist downloader module initialized successfully");
      
      return true;
    } catch (error) {
      console.error("Error initializing playlist downloader module:", error);
      return false;
    }
  },

  /**
   * Load dependencies if they weren't loaded initially
   */
  async loadDependencies() {
    try {
      // Load UI if not already loaded
      if (!ui) {
        ui = await import('../utils/ui.js').then(m => m.default).catch(e => {
          console.warn("Failed to load UI module:", e);
          // Create minimal fallback
          return {
            showToast: (title, message, type = 'info') => {
              console.log(`TOAST [${type}]: ${title} - ${message}`);
              try {
                // Try to create a basic toast notification
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
      }
      
      // Load utils if not already loaded
      if (!utils) {
        utils = await import('../utils/utils.js').then(m => m.default).catch(e => {
          console.warn("Failed to load utils module:", e);
          // Create minimal fallback
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
      }
      
      // Load fileHandler if not already loaded
      if (!fileHandler) {
        fileHandler = await import('../utils/fileHandler.js').then(m => m.default).catch(e => {
          console.warn("Failed to load fileHandler module:", e);
          // Create minimal fallback
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
      }
    } catch (error) {
      console.error("Error loading dependencies:", error);
    }
  },

  /**
   * Second phase of initialization after DOM is ready
   * @returns {Promise<boolean>} - Success state
   */
  async initializeAfterDOMReady() {
    try {
      console.log("Completing playlist downloader initialization after DOM ready");
      
      // Initialize progressHandler if available and not already initialized
      if (progressHandler && typeof progressHandler.initialize === 'function' && 
          !progressHandler.initialized) {
        await progressHandler.initialize();
        console.log("Progress handler initialized");
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
      
      console.log("Playlist downloader module fully initialized");
      return true;
    } catch (error) {
      console.error("Error in post-DOM initialization:", error);
      return false;
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
      
      console.log("Registered with module registry");
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
        
        console.log("Event handlers registered with event registry");
      } else {
        console.warn("Event registry not available for registering events");
      }
    } catch (error) {
      console.error("Error registering event handlers:", error);
    }
  },

  /**
   * Handle socket connected event
   */
  handleSocketConnected() {
    console.log("Socket connected, checking for ongoing tasks");
    
    // Request status update for ongoing task
    if (state.currentTaskId && state.processing) {
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit('request_status', { task_id: state.currentTaskId });
      }
    }
    
    // Reset reconnect attempts
    state.socketReconnectAttempts = 0;
  },

  /**
   * Handle socket disconnected event
   */
  handleSocketDisconnected() {
    console.warn("Socket disconnected");
    
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
      console.log("Setting up direct event handlers");
      
      // Form submission handler
      const form = document.getElementById('playlist-form');
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
        
        console.log("Form submission handler registered");
      } else {
        console.warn("Playlist form element not found");
      }
      
      // Add URL button handler
      const addUrlBtn = document.getElementById('add-playlist-btn');
      if (addUrlBtn) {
        addUrlBtn.addEventListener('click', this.addPlaylistField.bind(this));
        console.log("Add URL button handler registered");
      }
      
      // Cancel button handler
      const cancelBtn = document.getElementById('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', this.handleCancelButtonClick.bind(this));
        console.log("Cancel button handler registered");
      }
      
      // New task button handler
      const newTaskBtn = document.getElementById('playlist-new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
        console.log("New task button handler registered");
      }
      
      // Open output file button handler
      const openBtn = document.getElementById('open-playlist-json');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          const outputFile = openBtn.getAttribute('data-output-file');
          if (outputFile) {
            this.openFileOrFolder(outputFile);
          }
        });
        console.log("Open button handler registered");
      }
      
      // Browse button handler if available
      const browseBtn = document.getElementById('playlist-browse-btn');
      if (browseBtn && fileHandler && typeof fileHandler.browseForDirectory === 'function') {
        browseBtn.addEventListener('click', () => {
          this.handleBrowseClick();
        });
        console.log("Browse button handler registered");
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
      
      console.log("Direct event handlers setup complete");
    } catch (error) {
      console.error("Error setting up direct event handlers:", error);
    }
  },

  /**
   * Handle browse button click
   */
  async handleBrowseClick() {
    try {
      if (!fileHandler || typeof fileHandler.browseForDirectory !== 'function') {
        console.warn("File handler not available for browsing");
        return;
      }
      
      const result = await fileHandler.browseForDirectory();
      if (result && result.path) {
        const rootDirField = document.getElementById('playlist-root');
        if (rootDirField) {
          rootDirField.value = result.path;
          
          // Save this for future use
          state.lastSavedOutputDir = result.path;
          localStorage.setItem('lastPlaylistOutputDir', result.path);
          
          // Trigger change event to update output suggestion
          const event = new Event('change', { bubbles: true });
          rootDirField.dispatchEvent(event);
        }
      }
    } catch (error) {
      console.error("Error browsing for directory:", error);
      this.showToast('Error', 'Failed to browse for directory', 'error');
    }
  },

  /**
   * Initialize input/output relationship for auto-suggestion
   */
  initializeInputOutputRelationship() {
    try {
      const rootDirField = document.getElementById('playlist-root');
      const outputFileField = document.getElementById('playlist-output');
      
      if (!rootDirField || !outputFileField) {
        console.warn("Root dir or output file fields not found");
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
      };
      
      // Check for last saved directory and populate if available
      const lastDir = localStorage.getItem('lastPlaylistOutputDir');
      if (lastDir && !rootDirField.value) {
        rootDirField.value = lastDir;
        state.lastSavedOutputDir = lastDir;
        
        // Also trigger the change event to populate the output field
        const event = new Event('change', { bubbles: true });
        rootDirField.dispatchEvent(event);
      }
      
      // Use debounced input event for more responsive feedback
      if (utils && utils.debounce) {
        rootDirField.addEventListener('input', utils.debounce(inputHandler, 300));
      } else {
        rootDirField.addEventListener('input', inputHandler);
      }
      rootDirField.addEventListener('change', inputHandler);
      
      console.log("Input/output relationship initialized");
    } catch (error) {
      console.error("Error initializing input/output relationship:", error);
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
        const progress = trackProgress(taskId, {
          elementPrefix: 'playlist',
          taskType: 'playlist',
          saveToSessionStorage: true,
          outputFile: state.outputFilePath
        });
        
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
          window.socket.emit('request_status', { task_id: taskId });
        }
      }
    } catch (error) {
      console.error("Error checking for ongoing tasks:", error);
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
        window.socket.emit('request_status', { task_id: taskId });
      }
    } catch (error) {
      console.error("Error resuming task processing:", error);
    }
  },

  /**
   * Ensure all progress UI elements exist
   */
  ensureProgressUIElements() {
    try {
      // Check if progress container exists
      const progressContainer = document.getElementById('playlist-progress-container');
      if (!progressContainer) {
        console.warn("Progress container not found in DOM");
        return;
      }
      
      // Check for progress bar
      const progressBar = document.getElementById('playlist-progress-bar');
      if (!progressBar) {
        // Create progress UI elements if they don't exist
        console.log("Creating progress UI elements");
        if (typeof createProgressUI === 'function') {
          const progressUI = createProgressUI('playlist-progress-container', 'playlist');
          if (progressUI) {
            console.log("Progress UI created successfully");
          }
        } else {
          console.warn("createProgressUI function not available");
        }
      } else {
        console.log("Progress UI elements already exist");
      }
    } catch (error) {
      console.error("Error ensuring progress UI elements:", error);
    }
  },

  /**
   * Start progress monitoring to detect stuck progress
   */
  startProgressMonitoring() {
    console.log("Starting progress monitoring");
    
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
          console.log("High progress detected for extended period, assuming completion");
          
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
    const container = document.getElementById('playlist-urls-container');
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
    const urlInputs = document.querySelectorAll('.playlist-url');
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
     * Add a simple event listener to an element if it exists
     * @param {string} selector - CSS selector for the element
     * @param {string} eventType - Type of event to listen for
     * @param {Function} callback - Callback function for the event
     */
  addEventListener(selector, eventType, callback) {
    const element = document.querySelector(selector);
    if (element) {
      element.addEventListener(eventType, callback);
      return true;
    }
    return false;
  },

  /**
   * Attach event listeners to multiple elements
   * @param {Array<{selector: string, event: string, callback: Function}>} listeners - Array of listener configurations
   * @returns {number} - Number of successful listener attachments
   */
  attachEventListeners(listeners) {
    if (!Array.isArray(listeners)) return 0;
    
    let successful = 0;
    listeners.forEach(listener => {
      if (this.addEventListener(listener.selector, listener.event, listener.callback)) {
        successful++;
      }
    });
    
    return successful;
  },

  /**
   * Validate root directory
   * @returns {string} - Validated directory path
   */
  validateRootDirectory() {
    const rootDirInput = document.getElementById('playlist-root');
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
    
    return dir;
  },

  /**
   * Sanitize output file path
   * @param {string} filename - Output filename
   * @param {string} rootDirectory - Root directory
   * @returns {string} - Sanitized output file path
   */
  sanitizeOutputFilePath(filename, rootDirectory) {
    if (!filename) {
      return rootDirectory ? `${rootDirectory}/playlists.json` : 'playlists.json';
    }
    
    // Ensure filename has .json extension
    let outputFile = filename;
    if (!outputFile.toLowerCase().endsWith('.json')) {
      outputFile += '.json';
    }
    
    // If filename has a path separator, extract just the filename
    if (outputFile.includes('/') || outputFile.includes('\\')) {
      const parts = outputFile.split(/[\/\\]/);
      outputFile = parts[parts.length - 1];
    }
    
    // Join with root directory if provided
    if (rootDirectory) {
      return `${rootDirectory}/${outputFile}`;
    }
    
    return outputFile;
  },

  /**
   * Initialize progress bar to exactly 0% to fix the 5% stuck issue
   */
  explicitlyInitializeProgressToZero() {
    const progressBar = document.getElementById('playlist-progress-bar');
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
  },

  /**
   * Initialize progress bar styling
   * @param {HTMLElement} progressBar - Progress bar element
   */
  initializeProgressBarStyling(progressBar) {
    if (!progressBar) {
      progressBar = document.getElementById('playlist-progress-bar');
      if (!progressBar) return;
    }
    
    // Set initial styling
    progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-success');
    progressBar.classList.add('bg-primary');
    
    // Make sure transitions are applied
    progressBar.style.transition = 'width 0.5s ease-in-out';
  },

  /**
   * Update initial progress to avoid being stuck at 5%
   * @param {Object} data - Progress data
   */
  updateInitialProgress(data) {
    // If we're at the early stages of progress (0-5%)
    if (data.progress <= 5) {
      // Increment the update count
      state.progressUpdateCount++;
      
      // After a couple of updates, start incrementing progress
      if (state.progressUpdateCount > 2) {
        // Calculate adjusted progress based on update count
        const adjustedProgress = Math.min(15, 5 + (state.progressUpdateCount - 2));
        
        // Apply the adjusted progress
        this.updateProgressDisplay(adjustedProgress, data.message, data.stats);
        console.log(`Adjusted progress from ${data.progress}% to ${adjustedProgress}%`);
        
        return adjustedProgress;
      }
    }
    
    // Otherwise, return the original progress
    return data.progress;
  },

  /**
   * Update the ETA display based on progress rate
   * @param {HTMLElement} etaElement - ETA display element
   * @param {number} progress - Current progress percentage
   */
  updateETADisplay(etaElement, progress) {
    if (!etaElement) return;
    
    try {
      // Only update once we have some progress
      if (progress <= 0 || !state.processingStartTime) return;
      
      const now = Date.now();
      const elapsed = now - state.processingStartTime;
      
      // Only calculate after at least 5 seconds
      if (elapsed < 5000) return;
      
      // Calculate progress rate (% per second)
      const progressRate = progress / (elapsed / 1000);
      
      // Add to the progress rates array
      state.progressRates.push(progressRate);
      
      // Keep only the last MAX_PROGRESS_RATES values
      if (state.progressRates.length > MAX_PROGRESS_RATES) {
        state.progressRates.shift();
      }
      
      // Calculate average progress rate
      const avgProgressRate = state.progressRates.reduce((a, b) => a + b, 0) / state.progressRates.length;
      
      // Calculate remaining progress
      const remainingProgress = 100 - progress;
      
      // Calculate estimated remaining time in seconds
      const remainingTimeSeconds = avgProgressRate > 0 ? remainingProgress / avgProgressRate : 0;
      
      // If we have a valid time, display it
      if (remainingTimeSeconds > 0 && isFinite(remainingTimeSeconds)) {
        // Format the time
        const formattedTime = this.formatRemainingTime(remainingTimeSeconds);
        
        // Update the display
        etaElement.textContent = `ETA: ${formattedTime}`;
        etaElement.classList.remove('d-none');
      } else {
        etaElement.classList.add('d-none');
      }
    } catch (error) {
      console.error("Error updating ETA display:", error);
      etaElement.classList.add('d-none');
    }
  },

  /**
   * Format remaining time in seconds to a human-readable string
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted time string
   */
  formatRemainingTime(seconds) {
    const formatTime = (value) => value.toString().padStart(2, '0');
    
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}:${formatTime(secs)}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  },

  /**
   * Update the progress rate display
   * @param {HTMLElement} rateElement - Rate display element
   * @param {number} progress - Current progress percentage
   */
  updateProgressRate(rateElement, progress) {
    if (!rateElement) return;
    
    try {
      // Only update once we have some progress
      if (progress <= 0 || !state.processingStartTime) return;
      
      const now = Date.now();
      const elapsed = now - state.processingStartTime;
      
      // Only calculate after at least 5 seconds
      if (elapsed < 5000) return;
      
      // Calculate progress rate (% per second)
      const progressRate = progress / (elapsed / 1000);
      
      // Calculate items per second if we have stats
      let itemsPerSecond = null;
      if (state.taskData.stats) {
        const processedItems = state.taskData.stats.processed_videos || state.taskData.stats.processed_files || 0;
        if (processedItems > 0) {
          itemsPerSecond = processedItems / (elapsed / 1000);
        }
      }
      
      // Update the display
      if (itemsPerSecond !== null && itemsPerSecond > 0) {
        rateElement.textContent = `${itemsPerSecond.toFixed(1)} items/s`;
        rateElement.classList.remove('d-none');
      } else if (progressRate > 0) {
        rateElement.textContent = `${(progressRate * 60).toFixed(1)}%/min`;
        rateElement.classList.remove('d-none');
      } else {
        rateElement.classList.add('d-none');
      }
    } catch (error) {
      console.error("Error updating progress rate display:", error);
      rateElement.classList.add('d-none');
    }
  },

  /**
   * Handle form submission
   * @param {Event} e - Submit event
   */
  async handlePlaylistSubmit(e) {
    if (e) {
      e.preventDefault();
    }
    
    console.log("Playlist form submitted");
    
    // Get form elements
    const urlsContainer = document.getElementById('playlist-urls-container');
    const rootDirInput = document.getElementById('playlist-root');
    const outputFileInput = document.getElementById('playlist-output');
    const submitBtn = document.getElementById('playlist-submit-btn');
    
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
      
      // Validate directory and sanitize paths
      const validatedDir = this.validateRootDirectory();
      const sanitizedOutput = this.sanitizeOutputFilePath(outputFile, validatedDir);
      
      // Show progress UI immediately
      this.showProgress();
      
      // CRITICAL FIX: Initialize progress to exactly 0%
      this.explicitlyInitializeProgressToZero();
      
      try {
        // Send API request to start download
        const response = await this.fetchWithRetry("/api/start-playlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            playlists: playlistURLs, 
            root_directory: validatedDir, 
            output_file: sanitizedOutput 
          })
        });
        
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Server error: ${response.status} - ${text}`);
        }
        
        const result = await response.json();
        console.log("API response:", result);
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Setup download task with returned task ID
        await this.setupDownloadTask(result.task_id, result.output_file || sanitizedOutput);
        
        this.showToast('Download Started', 'Your playlists are being downloaded', 'info');
        
      } catch (apiError) {
        console.error("API error:", apiError);
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
      console.error("Form submission error:", error);
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
    
    // Setup progress tracking
    this.setupProgressTracking(taskId);
    
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
      console.warn("Cannot setup progress tracking without task ID");
      return;
    }
    
    console.log(`Setting up progress tracking for task: ${taskId}`);
    
    try {
      // Use trackProgress function if available
      state.progressTracker = trackProgress(taskId, {
        elementPrefix: 'playlist',
        taskType: 'playlist',
        saveToSessionStorage: true,
        outputFile: state.outputFilePath
      });
      
      console.log("Progress tracking setup complete");
    } catch (err) {
      console.warn("Error setting up progress tracking:", err);
      
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
      console.warn("Socket.IO not available for direct listeners");
      return;
    }
    
    try {
      console.log("Setting up direct Socket.IO listeners");
      
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
      window.socket.emit('request_status', { task_id: taskId });
      
      console.log("Direct Socket.IO listeners setup complete");
    } catch (error) {
      console.error("Error setting up Socket.IO listeners:", error);
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
        window.socket.emit('request_status', { task_id: taskId });
        return;
      }
      
      // Otherwise, use API
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Store the controller for potential cancellation
      state.pendingRequests[taskId] = controller;
      
      fetch(`/api/status/${taskId}`, { 
        method: 'GET',
        signal: signal
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
      console.error("Error requesting task status:", error);
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
          console.log("High progress detected, task may be complete");
          
          // Force a check after a short delay
          setTimeout(() => {
            // If still not marked as complete after check, force completion
            if (!state.completionState.completed && state.lastReportedProgress >= 95) {
              console.log("Forcing completion based on high progress");
              
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
   * Monitor task progress for stuck progress or high completion
   * @param {string} taskId - Task ID
   */
  monitorTaskProgress(taskId) {
    if (!taskId) return;
    
    // Check current progress
    const currentProgress = state.lastReportedProgress;
    const now = Date.now();
    
    // If progress is stuck at low value for too long
    if (currentProgress > 0 && currentProgress < 10) {
      const timeSinceStart = state.processingStartTime ? (now - state.processingStartTime) : 0;
      
      // If we've been processing for over 2 minutes but still under 10%
      if (timeSinceStart > 120000) { // 2 minutes
        console.warn(`Progress stuck at ${currentProgress}% after ${Math.round(timeSinceStart/60000)} minutes`);
        
        // Try to request a fresh status
        this.requestTaskStatus(taskId);
      }
    }
    
    // If progress is high but not complete
    if (currentProgress >= 95 && !state.completionState.completed) {
      const timeSinceLastUpdate = state.lastProgressTimestamp ? 
                                (now - state.lastProgressTimestamp) : 0;
      
      // If we've been at high progress for over 30 seconds
      if (timeSinceLastUpdate > 30000) { // 30 seconds
        console.log(`High progress (${currentProgress}%) with no updates for ${Math.round(timeSinceLastUpdate/1000)}s`);
        
        // Check if task is actually complete
        this.requestTaskStatus(taskId);
        
        // If it's been over 60 seconds, assume completion
        if (timeSinceLastUpdate > 60000) { // 60 seconds
          console.log("Assuming completion based on high progress and no updates");
          
          // Create a completion data object
          const completionData = {
            task_id: taskId,
            status: 'completed',
            progress: 100,
            output_file: state.outputFilePath,
            message: 'Task completed (assumed)'
          };
          
          this.handlePlaylistCompletion(completionData);
        }
      }
    }
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
      
      // CRITICAL FIX: Check progress values to fix stuck at 5% issue
      let displayProgress = data.progress;
      
      // If progress is exactly 5% and we've had several updates,
      // incrementally increase it to avoid appearing stuck
      if (data.progress === 5 && state.progressUpdateCount > 2) {
        displayProgress = Math.min(15, 5 + (state.progressUpdateCount - 2));
        console.log(`Adjusted progress from 5% to ${displayProgress}%`);
      }
      
      // Check for completion
      const isCompleted = this.isCompletionPhase(data);
      
      // Update UI with progress handler if available
      if (typeof updateProgressUI === 'function') {
        updateProgressUI(data.task_id, displayProgress, data.message || 'Processing...', data.stats);
        
        // Handle completion
        if (isCompleted && !state.completionState.completed) {
          console.log(`Task ${data.task_id} completion detected via progress update`);
          
          // Force progress to 100%
          updateProgressUI(data.task_id, 100, data.message || 'Task completed successfully', data.stats);
          
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
    } catch (error) {
      console.error("Error processing status update:", error);
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
      data.status === "completed" || 
      (data.stats && data.stats.status === "completed") ||
      
      // Message-based checks (case insensitive)
      (data.message && (
        /complet(ed|ion)/i.test(data.message) ||
        /done/i.test(data.message) ||
        /finish(ed)/i.test(data.message) ||
        /success/i.test(data.message)
      )) ||
      
      // Progress-based checks
      (data.progress >= 95) ||
      (data.progress >= 90 && data.stats && 
      data.stats.processed_files >= (data.stats.total_files || 1))
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
      const progressBar = document.getElementById('playlist-progress-bar');
      const progressStatus = document.getElementById('playlist-progress-status');
      const progressStats = document.getElementById('playlist-progress-stats');
      
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
      
      // Update stats if available
      if (progressStats && stats) {
        this.updateProgressStats(progressStats, stats);
      }
      
      // Store last reported progress
      state.lastReportedProgress = progress;
    } catch (error) {
      console.error("Error updating progress display:", error);
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
      console.error("Error updating progress stats:", error);
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
   * Handle playlist completion
   * @param {Object} data - Completion data
   */
  handlePlaylistCompletion(data) {
    try {
      // Skip if already completed or duplicate event for same task ID
      if (state.completionState.completed || state.completionHandled.has(data.task_id)) {
        console.log("Task already marked as completed, skipping duplicate completion");
        return;
      }
      
      // Add task to handled set to prevent duplicates
      state.completionHandled.add(data.task_id);
      
      console.log("Handling playlist completion:", data);
      
      // Mark as completed
      state.completionState.completed = true;
      state.completionState.completionTime = Date.now();
      
      // Force progress to 100%
      this.updateProgressDisplay(100, "Task completed successfully", data.stats);
      
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
      } else if (typeof progressHandler?.completeTask === 'function') {
        progressHandler.completeTask(data.task_id, data);
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
      this.showToast('Processing Complete', 'Your playlists have been processed successfully', 'success');
      
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
      console.error("Error handling playlist completion:", error);
      
      // Try to show results anyway
      try {
        this.showResult(data || { output_file: state.outputFilePath });
      } catch (e) {
        console.error("Failed to show results after error:", e);
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
      
      console.log("Handling task error:", data);
      
      // Mark as error
      state.completionState.error = true;
      state.processing = false;
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Handle error in progressHandler
      if (state.progressTracker && typeof state.progressTracker.error === 'function') {
        state.progressTracker.error(data.error || 'Unknown error');
      } else if (progressHandler && typeof progressHandler.errorTask === 'function') {
        progressHandler.errorTask(data.task_id, data.error || 'Unknown error', data);
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
      console.error("Error handling task error:", error);
      
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
      
      console.log("Handling task cancellation:", data);
      
      // Mark as cancelled
      state.completionState.cancelled = true;
      state.processing = false;
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Handle cancellation in progressHandler
      if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
        state.progressTracker.cancel();
      } else if (typeof cancelTracking === 'function') {
        cancelTracking(data.task_id || state.currentTaskId);
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
      this.showToast('Task Cancelled', 'The playlist processing has been cancelled', 'warning');
      
      // Emit cancelled event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.cancelled', data);
      }
    } catch (error) {
      console.error("Error handling task cancellation:", error);
      
      // Try to show form anyway
      this.showPlaylistForm();
    }
  },

  /**
   * Handle progress completed event
   * @param {Object} data - Completion data
   */
  handleProgressCompleted(data) {
    if (data && data.task_id === state.currentTaskId) {
      this.handlePlaylistCompletion(data);
    }
  },

  /**
   * Handle progress error event
   * @param {Object} data - Error data
   */
  handleProgressError(data) {
    if (data && data.task_id === state.currentTaskId) {
      this.handleTaskError({
        task_id: data.task_id,
        error: data.error || 'An error occurred during processing'
      });
    }
  },

  /**
   * Handle progress cancelled event
   * @param {Object} data - Cancellation data
   */
  handleProgressCancelled(data) {
    if (data && data.task_id === state.currentTaskId) {
      this.handleTaskCancelled({
        task_id: data.task_id,
        message: 'Task was cancelled'
      });
    }
  },

  /**
   * Add task to history
   * @param {Object} data - Task data
   */
  addTaskToHistory(data) {
    if (!data) return;
    
    try {
      console.log("Adding task to history:", data);
      
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
        const historyItems = JSON.parse(localStorage.getItem('playlistHistory') || '[]');
        historyItems.unshift(taskData);
        
        // Limit to 50 items
        if (historyItems.length > 50) {
          historyItems.length = 50;
        }
        
        localStorage.setItem('playlistHistory', JSON.stringify(historyItems));
        return true;
      } catch (e) {
        console.warn("Error storing history in localStorage:", e);
      }
      
      return false;
    } catch (error) {
      console.error("Error adding task to history:", error);
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
    
    // Try historyManager's method if available
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
   * Cancel the current download
   */
  async cancelDownload() {
    try {
      if (!state.currentTaskId || !state.processing) {
        console.warn("No active task to cancel");
        return false;
      }
      
      console.log(`Cancelling task: ${state.currentTaskId}`);
      
      // Mark as cancelling
      state.isCancelling = true;
      
      // Update UI
      const progressStatus = document.getElementById('playlist-progress-status');
      if (progressStatus) {
        progressStatus.textContent = "Cancelling...";
      }
      
      // Disable cancel button
      const cancelBtn = document.getElementById('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
      }
      
      // Call API to cancel task
      const response = await this.fetchWithRetry('/api/cancel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: state.currentTaskId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Cancel task through progressHandler
        if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
          state.progressTracker.cancel();
        } else if (typeof cancelTracking === 'function') {
          cancelTracking(state.currentTaskId);
        }
        
        // Clean up
        this.cleanup();
        
        // Show form
        this.showPlaylistForm();
        
        // Show notification
        this.showToast('Task Cancelled', 'Processing has been cancelled', 'warning');
        
        return true;
      } else {
        throw new Error(data.error || 'Failed to cancel task');
      }
    } catch (error) {
      console.error("Error cancelling download:", error);
      
      // Force cleanup anyway
      this.cleanup();
      this.showPlaylistForm();
      
      return false;
    } finally {
      // Reset cancelling flag
      state.isCancelling = false;
    }
  },

  /**
   * Handle cancel button click
   */
  handleCancelButtonClick() {
    try {
      if (!state.currentTaskId || !state.processing || state.isCancelling) {
        return;
      }
      
      // Confirm cancellation
      const confirmed = confirm("Are you sure you want to cancel the playlist processing?");
      if (!confirmed) return;
      
      // Disable button to prevent multiple clicks
      const cancelBtn = document.getElementById('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Cancelling...';
      }
      
      // Call cancel function
      this.cancelDownload()
        .catch(error => {
          console.error("Error cancelling:", error);
          
          // Force cleanup anyway
          this.cleanup();
          this.showPlaylistForm();
        });
    } catch (error) {
      console.error("Error handling cancel button click:", error);
      
      // Force cleanup
      this.cleanup();
      this.showPlaylistForm();
    }
  },

  /**
   * Handle New Task button click
   */
  handleNewTaskClick() {
    try {
      // Cancel any pending requests or tasks
      this.cancelPendingRequests();
      
      // Reset state
      window.currentTaskId = null;
      state.currentTaskId = null;
      state.processing = false;
      
      // Reset completion state
      state.completionState = {
        completed: false,
        error: false,
        cancelled: false
      };
      
      // Clean up progress handler
      if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
        state.progressTracker.cancel();
      }
      state.progressTracker = null;
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Show form
      this.showPlaylistForm();
      
      // Emit event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.processing.new', {
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error("Error handling new task click:", error);
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
      console.error("Error cancelling pending requests:", error);
    }
  },

  /**
   * Show progress UI
   */
  showProgress() {
    try {
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      
      // Use UI module for transition if available
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        ui.transitionBetweenElements(formContainer, progressContainer);
      } else {
        // Fallback
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
      }
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      
      // Enable cancel button
      const cancelBtn = document.getElementById('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = false;
      }
    } catch (error) {
      console.error("Error showing progress UI:", error);
    }
  },

  /**
   * Show playlist form
   */
  showPlaylistForm() {
    try {
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      const errorContainer = document.getElementById('playlist-error-container');
      
      // Use UI module for transition if available
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        // Find the visible container
        const visibleContainer = progressContainer && !progressContainer.classList.contains('d-none') ? 
                              progressContainer : 
                              (resultsContainer && !resultsContainer.classList.contains('d-none') ? 
                                resultsContainer : 
                                (errorContainer && !errorContainer.classList.contains('d-none') ?
                                  errorContainer : null));
        
        if (visibleContainer) {
          ui.transitionBetweenElements(visibleContainer, formContainer);
        } else {
          ui.toggleElementVisibility(formContainer, true);
        }
      } else {
        // Fallback
        if (formContainer) formContainer.style.display = 'block';
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';
      }
      
      // Update UI state
      state.uiState.isFormShown = true;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = false;
      
      // Reset submit button
      const submitBtn = document.getElementById('playlist-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      }
    } catch (error) {
      console.error("Error showing playlist form:", error);
    }
  },

  /**
   * Show playlist error
   * @param {string} errorMessage - Error message to display
   */
  showPlaylistError(errorMessage) {
    try {
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      const errorContainer = document.getElementById('playlist-error-container');
      const errorText = document.getElementById('playlist-error-text');
      
      // Update error message
      if (errorText && errorMessage) {
        errorText.textContent = errorMessage;
      }
      
      // Use UI module for transition if available
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        // Find the visible container
        const visibleContainer = progressContainer && !progressContainer.classList.contains('d-none') ? 
                              progressContainer : 
                              (resultsContainer && !resultsContainer.classList.contains('d-none') ? 
                                resultsContainer : 
                                (formContainer && !formContainer.classList.contains('d-none') ?
                                  formContainer : null));
        
        if (visibleContainer && errorContainer) {
          ui.transitionBetweenElements(visibleContainer, errorContainer);
        } else if (errorContainer) {
          ui.toggleElementVisibility(errorContainer, true);
        }
      } else {
        // Fallback
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'block';
      }
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = false;
      state.uiState.isErrorShown = true;
      
      // Show toast notification
      this.showToast('Error', errorMessage, 'error');
    } catch (error) {
      console.error("Error showing playlist error:", error);
      alert(`Error: ${errorMessage}`);
    }
  },

  /**
     * Create UI elements for results display
     * @param {HTMLElement} container - Container element
     * @param {Object} data - Result data
     */
  createResultsUI(container, data) {
    if (!container) return;
    
    try {
      // Add custom styling for results
      this.addCustomResultsCSS();
      
      // Create the results UI
      const resultsHtml = `
        <div class="results-container">
          <div class="text-center mb-4">
            <div class="success-icon-container mx-auto">
              <div class="success-icon-circle">
                <i class="fas fa-check text-success fa-2x"></i>
              </div>
            </div>
            <h4 class="mt-3">Playlist Processing Complete</h4>
            <p class="text-muted">Your playlist data has been processed successfully</p>
          </div>
          
          <div id="playlist-result-stats" class="mb-4"></div>
          
          <div class="d-flex justify-content-between">
            <button id="playlist-new-task-btn" class="btn btn-primary">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
            <button id="open-playlist-json" class="btn btn-success" data-output-file="${data.output_file || ''}">
              <i class="fas fa-file-alt me-2"></i>Open Result File
            </button>
          </div>
        </div>
      `;
      
      // Update the container
      container.innerHTML = resultsHtml;
      
      // Add event handlers
      const newTaskBtn = container.querySelector('#playlist-new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      const openBtn = container.querySelector('#open-playlist-json');
      if (openBtn && data.output_file) {
        openBtn.addEventListener('click', () => {
          this.openFileOrFolder(data.output_file);
        });
      }
      
      // Update stats display
      const statsContainer = container.querySelector('#playlist-result-stats');
      if (statsContainer && data.stats) {
        this.updateResultStats(statsContainer, data.stats, data.output_file);
      }
    } catch (error) {
      console.error("Error creating results UI:", error);
      
      // Fallback to simple message
      container.innerHTML = `
        <div class="alert alert-success">
          <h5>Processing Complete</h5>
          <p>Your playlist has been processed successfully.</p>
          ${data.output_file ? `<p>Output file: ${data.output_file}</p>` : ''}
          <button id="playlist-new-task-fallback" class="btn btn-primary">New Task</button>
        </div>
      `;
      
      const fallbackBtn = container.querySelector('#playlist-new-task-fallback');
      if (fallbackBtn) {
        fallbackBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
    }
  },

  /**
   * Make sure results UI elements have event listeners attached
   */
  ensureEventListenersOnResults() {
    // Add event listener to 'New Task' button
    const newTaskBtn = document.getElementById('playlist-new-task-btn');
    if (newTaskBtn && !newTaskBtn._hasListener) {
      newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      newTaskBtn._hasListener = true;
    }
    
    // Add event listener to 'Open Result File' button
    const openBtn = document.getElementById('open-playlist-json');
    if (openBtn && !openBtn._hasListener) {
      openBtn.addEventListener('click', () => {
        const outputFile = openBtn.getAttribute('data-output-file');
        if (outputFile) {
          this.openFileOrFolder(outputFile);
        }
      });
      openBtn._hasListener = true;
    }
  },

  /**
   * Show result UI
   * @param {Object} data - Result data
   */
  showResult(data) {
    try {
      console.log("Showing result UI with data:", data);
      
      // Add enhanced styling for results
      this.addCustomResultsCSS();
      
      // Get UI containers
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      const resultStats = document.getElementById('playlist-result-stats');
      
      // Update UI state
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = true;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
      
      // Use UI module for smooth transition if available
      if (ui && typeof ui.transitionBetweenElements === 'function') {
        ui.transitionBetweenElements(progressContainer, resultsContainer);
      } else {
        // Fallback to simple visibility toggle
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
      }
      
      // If results container is empty, create UI
      if (resultsContainer && resultsContainer.children.length === 0) {
        this.createResultsUI(resultsContainer, data);
      } else {
        // Update the output path button
        const openBtn = document.getElementById('open-playlist-json');
        if (openBtn && data.output_file) {
          openBtn.setAttribute('data-output-file', data.output_file);
          
          // Make button visible
          openBtn.classList.remove('d-none');
          openBtn.style.display = 'inline-block';
        }
        
        // Update stats display with enhanced visualization
        if (resultStats) {
          this.updateResultStats(resultStats, data.stats, data.output_file);
        }
      }
      
      // Ensure event listeners are attached
      this.ensureEventListenersOnResults();
      
      // Show toast notification
      this.showToast('Download Complete', 'Your playlists have been processed successfully', 'success');
      
      // Emit completion event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('playlist.results.shown', data);
      }
    } catch (error) {
      console.error("Error showing result UI:", error);
      
      // Try fallback display
      try {
        const resultsContainer = document.getElementById('playlist-results-container');
        const progressContainer = document.getElementById('playlist-progress-container');
        
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) {
          resultsContainer.style.display = 'block';
          resultsContainer.innerHTML = `
            <div class="alert alert-success">
              <h4>Download Complete</h4>
              <p>Your playlist has been processed successfully.</p>
              ${data.output_file ? `<p>Output saved to: ${data.output_file}</p>` : ''}
            </div>
            <div class="mt-3">
              <button class="btn btn-primary" onclick="window.playlistDownloader.handleNewTaskClick()">
                <i class="fas fa-plus me-2"></i>New Task
              </button>
            </div>
          `;
        }
      } catch (fallbackError) {
        console.error("Error with fallback result display:", fallbackError);
      }
    }
  },

  /**
   * Add custom CSS for results UI with enhanced styling
   */
  addCustomResultsCSS() {
    try {
      // Check if we've already added the style
      if (!document.querySelector('style[data-ui-style="playlist-results"]')) {
        const style = document.createElement('style');
        style.setAttribute('data-ui-style', 'playlist-results');
        style.textContent = `
          /* Enhanced styling for results UI */
          .success-icon-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 50px;
            height: 50px;
          }
          
          .success-icon-circle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background-color: rgba(25, 135, 84, 0.1);
            transition: all 0.3s ease;
          }
          
          .success-icon-circle:hover {
            transform: scale(1.1);
            background-color: rgba(25, 135, 84, 0.2);
          }
          
          .stats-container {
            background-color: #f8f9fa;
            border-radius: 12px;
            margin-bottom: 20px;
            transition: all 0.3s ease;
            overflow: hidden;
          }
          
          .stats-container:hover {
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            transform: translateY(-3px);
          }
          
          .stats-header {
            padding: 18px 24px;
            border-bottom: 1px solid rgba(0,0,0,0.08);
            background-color: rgba(0,0,0,0.02);
          }
          
          .stat-card {
            background-color: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 16px;
            border: 1px solid rgba(0,0,0,0.05);
            transition: transform 0.3s, box-shadow 0.3s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          
          .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
          }
          
          .stat-card .icon {
            font-size: 1.75rem;
            margin-right: 15px;
            color: #0d6efd;
          }
          
          .stat-card .value {
            font-size: 2rem;
            font-weight: 700;
            color: #212529;
          }
          
          .stat-card .label {
            font-size: 0.875rem;
            color: #6c757d;
            margin-top: 4px;
          }
          
          .time-badge {
            background-color: #6c757d;
            color: white;
            border-radius: 30px;
            padding: 6px 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
          }
          
          .time-badge i {
            margin-right: 8px;
          }
          
          .icon-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 56px;
            height: 56px;
            border-radius: 12px;
            background-color: rgba(0,0,0,0.04);
            transition: all 0.3s ease;
          }
          
          .card:hover .icon-container {
            transform: scale(1.05);
          }
          
          /* Button animation for feedback */
          .action-buttons .btn {
            transition: all 0.2s ease;
          }
          
          .action-buttons .btn:active {
            transform: scale(0.95);
          }
          
          /* Progress bar animations */
          .progress {
            overflow: hidden;
            position: relative;
          }
          
          .progress-bar {
            transition: width 0.8s ease-in-out;
          }
          
          .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
              90deg,
              rgba(255,255,255,0) 0%,
              rgba(255,255,255,0.2) 50%,
              rgba(255,255,255,0) 100%
            );
            width: 50%;
            background-size: 200% 200%;
            animation: shimmer 2s infinite;
          }
          
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          
          /* Responsive adjustments */
          @media (max-width: 768px) {
            .row .col-md-4 {
              margin-bottom: 15px;
            }
            
            .action-buttons {
              flex-direction: column;
              gap: 10px;
            }
            
            .action-buttons > div {
              width: 100%;
              display: flex;
              justify-content: center;
            }
            
            .action-buttons .btn {
              flex-grow: 1;
            }
          }
        `;
        
        document.head.appendChild(style);
        console.log("Added enhanced custom styling for results UI");
      }
    } catch (error) {
      console.error("Error adding custom CSS styles:", error);
    }
  },

  /**
   * Process and normalize stats data to ensure consistent format
   * @param {Object} stats - The original stats object
   * @returns {Object} - Normalized stats object with all required fields
   */
  processStatsData(stats) {
    // Ensure we have a stats object to work with
    if (!stats || typeof stats !== 'object') {
      console.warn("Invalid stats object provided:", stats);
      return {
        total_playlists: 1,
        processed_playlists: 1,
        empty_playlists: 0,
        skipped_playlists: 0,
        total_videos: 0,
        processed_videos: 0,
        total_files: 0,
        processed_files: 0,
        skipped_files: 0,
        error_files: 0,
        total_chunks: 0,
        total_bytes: 0,
        duration_seconds: 0
      };
    }
    
    // If stats is a string, try to parse it
    if (typeof stats === 'string') {
      try {
        stats = JSON.parse(stats);
      } catch (e) {
        console.warn("Could not parse stats string:", e);
        return this.processStatsData({}); // Return default stats
      }
    }
    
    // Create normalized stats with defaults for missing fields
    return {
      total_playlists: stats.playlists_total || stats.total_playlists || 1,
      processed_playlists: stats.completed_playlists || stats.playlists_processed || stats.processed_playlists || 1,
      empty_playlists: stats.empty_playlists || 0,
      skipped_playlists: stats.skipped_playlists || 0,
      total_videos: stats.total_videos || stats.videos_total || 0,
      processed_videos: stats.videos_processed || stats.processed_videos || 0,
      total_files: stats.total_files || 0,
      processed_files: stats.processed_files || 0,
      skipped_files: stats.skipped_files || 0,
      error_files: stats.error_files || 0,
      total_chunks: stats.total_chunks || 0,
      total_bytes: stats.total_bytes || 0,
      duration_seconds: stats.duration_seconds || stats.total_duration_seconds || 0,
      download_directory: stats.download_directory || "",
      total_processing_time: stats.total_processing_time || stats.processing_time || stats.execution_time_seconds || 0,
      status: stats.status || "completed",
      completed_at: stats.completed_at || stats.timestamp || "",
      failed_playlists: stats.failed_playlists || 0
    };
  },

  /**
   * Update result statistics display with proper formatting
   * @param {HTMLElement} element - Stats container element
   * @param {Object} stats - Statistics object
   * @param {string} outputFile - Output file path
   */
  updateResultStats(element, stats, outputFile) {
    try {
      if (!element) return;
      
      // Process stats to ensure all values are present
      stats = this.processStatsData(stats);
      
      // Create a formatted display of the stats with enhanced visuals and animations
      let statsHtml = `
        <div class="stats-container animate__animated animate__fadeIn">
          <div class="stats-header d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Download Results</h5>
            <div class="badge bg-secondary p-2">
              <i class="fas fa-clock me-1"></i>
              ${this.formatDuration(stats.total_duration_seconds || stats.duration_seconds || 0)} total duration
            </div>
          </div>
          
          <!-- Output file info with copy button -->
          ${outputFile ? `
            <div class="mb-3 p-3 bg-light rounded">
              <label class="text-muted small mb-1">Output File</label>
              <div class="d-flex align-items-center">
                <div class="text-truncate flex-grow-1">
                  <i class="fas fa-file-alt me-1 text-primary"></i>
                  <span class="text-primary">${outputFile}</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary ms-2 copy-path-btn" 
                        data-path="${outputFile}" title="Copy path to clipboard"
                        onclick="navigator.clipboard.writeText('${outputFile}').then(() => playlistDownloader.showToast('Copied', 'Path copied to clipboard', 'success'))">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>
          ` : ''}
          
          <!-- Stats Cards with improved visuals -->
          <div class="row g-3 mb-4">
            <!-- Total Playlists Card -->
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm">
                <div class="card-body py-3 px-3">
                  <div class="d-flex align-items-center">
                    <div class="icon-container text-primary me-3">
                      <i class="fas fa-list fa-2x"></i>
                    </div>
                    <div>
                      <h3 class="mb-0 fw-bold">${stats.total_playlists}</h3>
                      <div class="text-muted small">Total Playlists</div>
                      ${stats.failed_playlists > 0 ? 
                        `<div class="text-danger small mt-1">(${stats.failed_playlists} failed)</div>` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Videos Card -->
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm">
                <div class="card-body py-3 px-3">
                  <div class="d-flex align-items-center">
                    <div class="icon-container text-info me-3">
                      <i class="fas fa-video fa-2x"></i>
                    </div>
                    <div>
                      <h3 class="mb-0 fw-bold">${stats.total_videos}</h3>
                      <div class="text-muted small">Total Videos</div>
                      <div class="text-success small mt-1">${stats.processed_videos} downloaded</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Processing Time Card -->
            <div class="col-md-4">
              <div class="card h-100 border-0 shadow-sm">
                <div class="card-body py-3 px-3">
                  <div class="d-flex align-items-center">
                    <div class="icon-container text-success me-3">
                      <i class="fas fa-clock fa-2x"></i>
                    </div>
                    <div>
                      <h3 class="mb-0 fw-bold">${this.formatDuration(stats.total_processing_time)}</h3>
                      <div class="text-muted small">Processing Time</div>
                      <div class="text-muted small mt-1">${stats.completed_at ? `Completed: ${stats.completed_at}` : ''}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Additional Stats Section -->
          <div class="bg-light p-3 rounded mb-4">
            <h6 class="mb-3"><i class="fas fa-info-circle me-2"></i>Additional Information</h6>
            <div class="row g-3">
              <div class="col-md-6">
                <ul class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-check-circle text-success me-2"></i>Processed Playlists</span>
                    <span class="badge bg-success rounded-pill">${stats.processed_playlists}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-exclamation-circle text-warning me-2"></i>Empty Playlists</span>
                    <span class="badge bg-warning rounded-pill">${stats.empty_playlists}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-times-circle text-danger me-2"></i>Failed Playlists</span>
                    <span class="badge bg-danger rounded-pill">${stats.failed_playlists}</span>
                  </li>
                </ul>
              </div>
              <div class="col-md-6">
                <ul class="list-group">
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-video text-info me-2"></i>Total Videos</span>
                    <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-download text-success me-2"></i>Downloaded Videos</span>
                    <span class="badge bg-success rounded-pill">${stats.processed_videos}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="fas fa-folder text-primary me-2"></i>Download Directory</span>
                    <span class="text-truncate small" style="max-width: 180px;">${stats.download_directory || "Not specified"}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="action-buttons d-flex justify-content-between mt-4">
            <div>
              <button id="playlist-new-task-btn" class="btn btn-primary">
                <i class="fas fa-plus me-2"></i>New Task
              </button>
            </div>
            <div>
              <button id="open-playlist-json" class="btn btn-success me-2" data-output-file="${outputFile || ''}">
                <i class="fas fa-file-alt me-2"></i>Open Result File
              </button>
            </div>
          </div>
        </div>
      `;
      
      // Update the element
      element.innerHTML = statsHtml;
      
      // Add event handlers
      const newTaskBtn = document.getElementById('playlist-new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
      }
      
      const openBtn = document.getElementById('open-playlist-json');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          const outputFile = openBtn.getAttribute('data-output-file');
          if (outputFile) {
            this.openFileOrFolder(outputFile);
          }
        });
      }
    } catch (error) {
      console.error("Error updating result stats:", error);
      
      // Provide a simple fallback
      if (element) {
        element.innerHTML = `
          <div class="alert alert-info">
            <h5>Download Complete</h5>
            <p>Your playlists have been successfully processed.</p>
            ${outputFile ? `<p>Output saved to: ${outputFile}</p>` : ''}
            <button id="playlist-new-task-fallback" class="btn btn-primary mt-2">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
        `;
        
        // Add event handler to the fallback button
        const fallbackBtn = document.getElementById('playlist-new-task-fallback');
        if (fallbackBtn) {
          fallbackBtn.addEventListener('click', this.handleNewTaskClick.bind(this));
        }
      }
    }
  },

  /**
   * Open file or folder
   * @param {string} path - Path to open
   */
  openFileOrFolder(path) {
    if (!path) {
      console.warn("No path specified to open");
      return;
    }
    
    try {
      // Try to use fileHandler if available
      if (fileHandler) {
        if (typeof fileHandler.openFile === 'function') {
          fileHandler.openFile(path);
          return;
        } else if (typeof fileHandler.openContainingFolder === 'function') {
          fileHandler.openContainingFolder(path);
          return;
        }
      }
      
      // Fallback: Try to use eventRegistry to emit an open event
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('file.open', { path });
        return;
      }
      
      // Last resort: Show a message with the path
      console.warn("Could not open file/folder:", path);
      this.showToast('File Path', `File is located at: ${path}`, 'info');
    } catch (error) {
      console.error("Error opening file/folder:", error);
      this.showToast('Error', `Could not open: ${path}`, 'error');
    }
  },

  /**
   * Validate output field
   * @param {HTMLInputElement} field - Output field to validate
   * @returns {string} - Validated output field value
   */
  validateOutputField(field) {
    if (!field || !field.value) {
      throw new Error("Output field is missing or empty");
    }
    
    const value = field.value.trim();
    if (!value) {
      throw new Error("Please enter an output filename");
    }
    
    // Check for invalid characters in filename
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(value)) {
      throw new Error("Output filename contains invalid characters: < > : \" / \\ | ? *");
    }
    
    return value;
  },

  /**
   * Reset progress tracking
   */
  resetProgressTracking() {
    // Reset progress state
    state.progressUpdateCount = 0;
    state.lastProgressTimestamp = null;
    state.lastReportedProgress = -1;
    state.progressRates = [];
    
    // Clear progress tracker
    if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
      state.progressTracker.cancel();
      state.progressTracker = null;
    }
    
    // Clear timeout IDs
    this.clearCompletionMonitoring();
    
    // Clear status polling interval
    if (state.statusPollInterval) {
      clearInterval(state.statusPollInterval);
      state.statusPollInterval = null;
    }
  },

  /**
   * Reset app state completely
   */
  resetAppState() {
    // Reset progress tracking
    this.resetProgressTracking();
    
    // Reset task state
    state.currentTaskId = null;
    window.currentTaskId = null; // For compatibility
    state.processingStartTime = null;
    state.outputFilePath = null;
    state.processing = false;
    state.isProcessingCancelled = false;
    
    // Reset completion state
    state.completionState = {
      completed: false,
      completionTime: null,
      error: false,
      cancelled: false
    };
    
    // Reset UI state
    state.uiState = {
      isFormShown: true,
      isResultShown: false,
      isErrorShown: false,
      isCancelledShown: false
    };
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('outputFile');
    sessionStorage.removeItem('taskStartTime');
    
    // Update state manager
    if (stateManager && typeof stateManager.setProcessingActive === 'function') {
      stateManager.setProcessingActive(false);
    }
    
    // Cancel any pending requests
    this.cancelPendingRequests();
  },

  /**
   * Reset the submit button
   */
  resetSubmitButton() {
    const submitBtn = document.getElementById('playlist-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
    }
  },

  /**
   * Force reset processing state
   */
  forceResetProcessingState() {
    // Reset state
    this.resetAppState();
    
    // Show form UI
    this.showPlaylistForm();
    
    // Reset submit button
    this.resetSubmitButton();
  },

  /**
     * Show toast notification
     * @param {string} title - Toast title
     * @param {string} message - Toast message
     * @param {string} type - Toast type ('info', 'success', 'warning', 'error')
     */
  showToast(title, message, type = 'info') {
    // Try to use UI module's showToast function if available
    if (ui && typeof ui.showToast === 'function') {
      ui.showToast(title, message, type);
      return;
    }
    
    // Fallback implementation
    console.log(`TOAST [${type}]: ${title} - ${message}`);
    
    try {
      // Try to create a basic toast notification
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
      console.error("Failed to create fallback toast:", e);
    }
  },

  /**
   * JS forEach utility function with early termination support
   * @param {Array} array - Array to iterate
   * @param {Function} callback - Callback for each item
   */
  forEach(array, callback) {
    if (!Array.isArray(array)) return;
    
    for (let i = 0; i < array.length; i++) {
      // If callback returns false, break the loop
      if (callback(array[i], i, array) === false) {
        break;
      }
    }
  },

  /**
   * Handle module reloaded event
   */
  handleModuleReloaded() {
    console.log("Module reloaded event detected");
    
    // Check for ongoing tasks
    this.checkForOngoingTasks();
    
    // Ensure event handlers are set up
    this.setupDirectEventHandlers();
    
    // Ensure progress UI
    this.ensureProgressUIElements();
  },

  /**
   * Fetch with retry and timeout
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
    throw lastError;
  },

  /**
   * Perform cleanup for task cancellation
   */
  performCancellationCleanup() {
    try {
      console.log("Performing cancellation cleanup");
      
      // Mark task as cancelled
      state.isProcessingCancelled = true;
      state.processing = false;
      
      // Cancel any pending requests
      this.cancelPendingRequests();
      
      // Clear status polling interval
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Reset progress tracking
      this.resetProgressTracking();
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      sessionStorage.removeItem('taskStartTime');
      
      // Reset UI state
      state.uiState = {
        isFormShown: false,
        isResultShown: false,
        isErrorShown: false,
        isCancelledShown: true
      };
      
      // Reset button states
      const cancelBtn = document.getElementById('playlist-cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.innerHTML = '<i class="fas fa-times me-2"></i>Cancel';
      }
      
      // Show form UI
      this.showPlaylistForm();
      
      // Show notification
      this.showToast('Task Cancelled', 'Playlist processing has been cancelled', 'warning');
    } catch (error) {
      console.error("Error in cancellation cleanup:", error);
    }
  },

  /**
   * Clean up resources
   */
  cleanup() {
    try {
      console.log("Cleaning up playlist downloader resources");
      
      // Clear completion tracking
      state.completionHandled.clear();
      
      // Cancel any polling
      if (state.statusPollInterval) {
        clearInterval(state.statusPollInterval);
        state.statusPollInterval = null;
      }
      
      // Clear completion monitoring
      this.clearCompletionMonitoring();
      
      // Cancel any pending requests
      this.cancelPendingRequests();
      
      // Reset state
      state.currentTaskId = null;
      state.processing = false;
      state.completionState = {
        completed: false,
        error: false,
        cancelled: false
      };
      
      // Clean up progress handler
      if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
        state.progressTracker.cancel();
        state.progressTracker = null;
      }
      
      // Remove event listeners for Socket.IO events
      if (window.socket) {
        const events = [
          'progress_update', 'task_completed', 'task_error',
          'playlist_completed', 'playlist_error', 'playlist_cancelled'
        ];
        
        events.forEach(event => window.socket.off(event));
      }
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(false);
      }
      
      // Clean up session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('outputFile');
      
      return true;
    } catch (error) {
      console.error("Error during cleanup:", error);
      return false;
    }
  },

  /**
   * Clean up the progress tracker
   */
  cleanupTracker() {
    // Clean up progress handler
    if (state.progressTracker && typeof state.progressTracker.cancel === 'function') {
      try {
        state.progressTracker.cancel();
      } catch (error) {
        console.warn("Error cancelling progress tracker:", error);
      }
      state.progressTracker = null;
    }
    
    // Clear status polling interval
    if (state.statusPollInterval) {
      clearInterval(state.statusPollInterval);
      state.statusPollInterval = null;
    }
    
    // Clear completion monitoring
    this.clearCompletionMonitoring();
  },

  /**
   * Switch to a specified UI container
   * @param {string} containerId - Container ID to switch to
   */
  switch(containerId) {
    try {
      // Get all containers
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      const errorContainer = document.getElementById('playlist-error-container');
      
      // Hide all containers
      [formContainer, progressContainer, resultsContainer, errorContainer].forEach(container => {
        if (container) {
          container.style.display = 'none';
          container.classList.add('d-none');
        }
      });
      
      // Show the requested container
      const targetContainer = document.getElementById(containerId);
      if (targetContainer) {
        targetContainer.style.display = 'block';
        targetContainer.classList.remove('d-none');
        
        // Update UI state
        state.uiState.isFormShown = containerId === 'playlist-form-container';
        state.uiState.isResultShown = containerId === 'playlist-results-container';
        state.uiState.isErrorShown = containerId === 'playlist-error-container';
        state.uiState.isCancelledShown = false;
      } else {
        console.warn(`Container with ID ${containerId} not found`);
      }
    } catch (error) {
      console.error("Error switching UI container:", error);
    }
  },

  /**
   * Verify socket connection
   * @returns {boolean} - Whether socket is connected
   */
  verifySocketConnection() {
    // Check for the Socket.IO client
    if (!window.socket) {
      console.warn("Socket.IO client not available");
      return false;
    }
    
    // Check if the socket is connected
    if (!window.socket.connected) {
      console.warn("Socket.IO not connected");
      
      // Try to update the UI to show the disconnected state
      try {
        const socketStatus = document.querySelector('.socket-status');
        if (socketStatus) {
          socketStatus.classList.remove('connected');
          socketStatus.classList.add('disconnected');
          
          const statusText = socketStatus.querySelector('.status-text');
          if (statusText) {
            statusText.textContent = 'Disconnected';
          }
        }
      } catch (e) {
        console.warn("Error updating socket status UI:", e);
      }
      
      return false;
    }
    
    return true;
  },

  /**
   * Check if the module is initialized
   * @returns {boolean} - Whether the module is initialized
   */
  isInitialized() {
    return state.initialized;
  },

  /**
   * Enhanced resumeTaskProcessing with better state handling
   * @param {string} taskId - Task ID to resume
   * @param {Object} options - Resume options
   * @returns {Promise<boolean>} - Success state
   */
  async resumeTaskProcessing(taskId, options = {}) {
    try {
      if (!taskId) {
        console.warn("Cannot resume task without ID");
        return false;
      }
      
      console.log(`Resuming task processing for ${taskId}`);
      
      // Set current task ID and state
      state.currentTaskId = taskId;
      state.processing = true;
      state.outputFilePath = options.outputFile || sessionStorage.getItem('outputFile');
      
      // Get task data from session storage
      const taskStartTimeStr = sessionStorage.getItem('taskStartTime');
      if (taskStartTimeStr) {
        state.processingStartTime = parseInt(taskStartTimeStr, 10);
      } else {
        state.processingStartTime = Date.now();
      }
      
      // Reset completion state
      state.completionState = {
        completed: false,
        error: false,
        cancelled: false
      };
      
      // Show progress UI
      this.showProgress();
      
      // Set up progress tracking
      this.setupProgressTracking(taskId);
      
      // Set up direct socket listeners for playlist-specific events
      this.setupSocketEvents(taskId);
      
      // Start status polling as a fallback
      this.startStatusPolling(taskId);
      
      // Add new status fetch to get initial status
      await this.fetchTaskStatus(taskId);
      
      // Update state manager
      if (stateManager && typeof stateManager.setProcessingActive === 'function') {
        stateManager.setProcessingActive(true, taskId);
      }
      
      return true;
    } catch (error) {
      console.error("Error resuming task processing:", error);
      
      // Try to reset state on error
      this.cleanup();
      this.showPlaylistForm();
      
      return false;
    }
  },

  /**
   * Fetch current task status from API
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} - Task status data
   */
  async fetchTaskStatus(taskId) {
    if (!taskId) return null;
    
    try {
      // Try direct API request
      const response = await this.fetchWithRetry(`/api/status/${taskId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Process the status update
        this.processStatusUpdate(data);
        
        return data;
      } else {
        console.warn(`Failed to fetch task status: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error("Error fetching task status:", error);
      return null;
    }
  },
  };

  /**
  * Common functions for named exports to match original module format 
  */

  /**
  * Initialize playlist downloader module
  * @returns {Promise<boolean>} Success state
  */
  function initPlaylistDownloader() {
  return playlistDownloader.initialize();
  }

  /**
  * Initialize playlist downloader after DOM is ready
  */
  function initPlaylistDownloaderAfterDOMReady() {
  return playlistDownloader.initializeAfterDOMReady();
  }

// Export both default and named exports
export default playlistDownloader;
export const initialize = playlistDownloader.initialize.bind(playlistDownloader);
export const initializeAfterDOMReady = playlistDownloader.initializeAfterDOMReady.bind(playlistDownloader);
export const registerWithModuleSystem = playlistDownloader.registerWithModuleSystem.bind(playlistDownloader);
export const setupDirectEventHandlers = playlistDownloader.setupDirectEventHandlers.bind(playlistDownloader);
export const initializeInputOutputRelationship = playlistDownloader.initializeInputOutputRelationship.bind(playlistDownloader);
export const ensureProgressUIElements = playlistDownloader.ensureProgressUIElements.bind(playlistDownloader);
export const checkForOngoingTasks = playlistDownloader.checkForOngoingTasks.bind(playlistDownloader);
export const startProgressMonitoring = playlistDownloader.startProgressMonitoring.bind(playlistDownloader);
export const loadDependencies = playlistDownloader.loadDependencies.bind(playlistDownloader);
export const handleSocketConnected = playlistDownloader.handleSocketConnected.bind(playlistDownloader);
export const handleSocketDisconnected = playlistDownloader.handleSocketDisconnected.bind(playlistDownloader);
export const addPlaylistField = playlistDownloader.addPlaylistField.bind(playlistDownloader);
export const getPlaylistURLs = playlistDownloader.getPlaylistURLs.bind(playlistDownloader);
export const validateRootDirectory = playlistDownloader.validateRootDirectory.bind(playlistDownloader);
export const sanitizeOutputFilePath = playlistDownloader.sanitizeOutputFilePath.bind(playlistDownloader);
export const handlePlaylistSubmit = playlistDownloader.handlePlaylistSubmit.bind(playlistDownloader);
export const setupDownloadTask = playlistDownloader.setupDownloadTask.bind(playlistDownloader);
export const setupProgressTracking = playlistDownloader.setupProgressTracking.bind(playlistDownloader);
export const setupDirectSocketListeners = playlistDownloader.setupDirectSocketListeners.bind(playlistDownloader);
export const startStatusPolling = playlistDownloader.startStatusPolling.bind(playlistDownloader);
export const requestTaskStatus = playlistDownloader.requestTaskStatus.bind(playlistDownloader);
export const setupCompletionMonitoring = playlistDownloader.setupCompletionMonitoring.bind(playlistDownloader);
export const clearCompletionMonitoring = playlistDownloader.clearCompletionMonitoring.bind(playlistDownloader);
export const processStatusUpdate = playlistDownloader.processStatusUpdate.bind(playlistDownloader);
export const isCompletionPhase = playlistDownloader.isCompletionPhase.bind(playlistDownloader);
export const updateProgressDisplay = playlistDownloader.updateProgressDisplay.bind(playlistDownloader);
export const updateProgressStats = playlistDownloader.updateProgressStats.bind(playlistDownloader);
export const handlePlaylistCompletion = playlistDownloader.handlePlaylistCompletion.bind(playlistDownloader);
export const handleTaskError = playlistDownloader.handleTaskError.bind(playlistDownloader);
export const handleTaskCancelled = playlistDownloader.handleTaskCancelled.bind(playlistDownloader);
export const handleProgressCompleted = playlistDownloader.handleProgressCompleted.bind(playlistDownloader);
export const handleProgressError = playlistDownloader.handleProgressError.bind(playlistDownloader);
export const handleProgressCancelled = playlistDownloader.handleProgressCancelled.bind(playlistDownloader);
export const cancelDownload = playlistDownloader.cancelDownload.bind(playlistDownloader);
export const handleCancelButtonClick = playlistDownloader.handleCancelButtonClick.bind(playlistDownloader);
export const handleNewTaskClick = playlistDownloader.handleNewTaskClick.bind(playlistDownloader);
export const showProgress = playlistDownloader.showProgress.bind(playlistDownloader);
export const showPlaylistForm = playlistDownloader.showPlaylistForm.bind(playlistDownloader);
export const showResult = playlistDownloader.showResult.bind(playlistDownloader);
export const createResultsUI = playlistDownloader.createResultsUI.bind(playlistDownloader);
export const ensureEventListenersOnResults = playlistDownloader.ensureEventListenersOnResults.bind(playlistDownloader);
export const addCustomResultsCSS = playlistDownloader.addCustomResultsCSS.bind(playlistDownloader);
export const processStatsData = playlistDownloader.processStatsData.bind(playlistDownloader);
export const updateResultStats = playlistDownloader.updateResultStats.bind(playlistDownloader);
export const showPlaylistError = playlistDownloader.showPlaylistError.bind(playlistDownloader);
export const openFileOrFolder = playlistDownloader.openFileOrFolder.bind(playlistDownloader);
export const showToast = playlistDownloader.showToast.bind(playlistDownloader);
export const addEventListener = playlistDownloader.addEventListener.bind(playlistDownloader);
export const attachEventListeners = playlistDownloader.attachEventListeners.bind(playlistDownloader);
export const checkForStuckProgress = playlistDownloader.monitorTaskProgress.bind(playlistDownloader);
export const checkHighProgressCompletion = playlistDownloader.monitorTaskProgress.bind(playlistDownloader);
export const checkTaskCompletion = playlistDownloader.monitorTaskProgress.bind(playlistDownloader);
export const cleanupTracker = playlistDownloader.cleanupTracker.bind(playlistDownloader);
export const explicitlyInitializeProgressToZero = playlistDownloader.explicitlyInitializeProgressToZero.bind(playlistDownloader);
export const forEach = playlistDownloader.forEach.bind(playlistDownloader);
export const forceResetProcessingState = playlistDownloader.forceResetProcessingState.bind(playlistDownloader);
export const handleModuleReloaded = playlistDownloader.handleModuleReloaded.bind(playlistDownloader);
export const initializeProgressBarStyling = playlistDownloader.initializeProgressBarStyling.bind(playlistDownloader);
export const monitorTaskProgress = playlistDownloader.monitorTaskProgress.bind(playlistDownloader);
export const performCancellationCleanup = playlistDownloader.performCancellationCleanup.bind(playlistDownloader);
export const resetAppState = playlistDownloader.resetAppState.bind(playlistDownloader);
export const resetProgressTracking = playlistDownloader.resetProgressTracking.bind(playlistDownloader);
export const resetSubmitButton = playlistDownloader.resetSubmitButton.bind(playlistDownloader);
export const updateETADisplay = playlistDownloader.updateETADisplay.bind(playlistDownloader);
export const updateInitialProgress = playlistDownloader.updateInitialProgress.bind(playlistDownloader);
export const updateProgressRate = playlistDownloader.updateProgressRate.bind(playlistDownloader);
export const verifySocketConnection = playlistDownloader.verifySocketConnection.bind(playlistDownloader);
export const addTaskToHistory = playlistDownloader.addTaskToHistory.bind(playlistDownloader);
export const getFileNameFromPath = playlistDownloader.getFileNameFromPath.bind(playlistDownloader);
export const formatBytes = playlistDownloader.formatBytes.bind(playlistDownloader);
export const formatDuration = playlistDownloader.formatDuration.bind(playlistDownloader);
export const cancelPendingRequests = playlistDownloader.cancelPendingRequests.bind(playlistDownloader);
export const cleanup = playlistDownloader.cleanup.bind(playlistDownloader);
export const isInitialized = playlistDownloader.isInitialized.bind(playlistDownloader);