/**
 * Socket Handler Module
 * 
 * Manages Socket.IO connections and message handling for real-time communication.
 * Provides robust error handling, reconnection logic, and task progress tracking.
 * 
 * KEY IMPROVEMENTS:
 * - Removed circular dependency with progressHandler.js
 * - Aligned with backend Socket.IO events from app.py
 * - Improved error handling and reconnection logic
 * - Added support for PDF-specific events
 * - Fixed export issues
 * - Consistent path handling
 * - Enhanced error recovery
 */

import ui from './ui.js';
import utils from './utils.js';

// Module state
let socket = null;
let connected = false;
let reconnectAttempts = 0;
let statusPollInterval = null;
let taskId = null;
let progressCallbacks = {};
let eventRegistry = null;
let initialized = false;

/**
 * Track the active task and its progress state
 * @typedef {Object} TaskTracker
 * @property {string} taskId - ID of the task
 * @property {number} progress - Current progress percentage
 * @property {Object} stats - Current statistics
 * @property {Function} updateProgress - Function to update progress
 */

/** @type {TaskTracker|null} */
let activeTaskTracker = null;

/**
 * Format a duration in seconds to a human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration string
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return 'Unknown';
  }
  
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  
  if (minutes < 60) {
    return `${minutes} min ${remainingSeconds} sec`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Create a task tracker for the current task
 * @param {string} taskId - The task ID to track
 * @returns {TaskTracker} - The task tracker object
 */
function createTaskTracker(taskId) {
  // Create a task tracker object to monitor progress
  const tracker = {
    taskId,
    progress: 0,
    stats: {},
    startTime: Date.now(),
    
    /**
     * Update the progress of the task
     * @param {number} progress - New progress percentage
     * @param {string} message - Status message
     * @param {Object} stats - Updated statistics 
     */
    updateProgress(progress, message, stats) {
      this.progress = progress;
      this.stats = stats || this.stats;
      
      // Calculate estimated completion time
      if (progress > 0 && progress < 100) {
        const elapsed = Date.now() - this.startTime;
        const estimatedTotal = elapsed / (progress / 100);
        const remaining = estimatedTotal - elapsed;
        
        // Format using our utility function
        const formattedTime = formatDuration(remaining / 1000);
        console.log(`Estimated time remaining: ${formattedTime}`);
      }
    },
    
    /**
     * Mark the task as complete
     */
    complete() {
      this.progress = 100;
      console.log(`Task ${taskId} completed in ${formatDuration((Date.now() - this.startTime) / 1000)}`);
    },
    
    /**
     * Get the current state of the tracker
     * @returns {Object} - Tracker state
     */
    getState() {
      return {
        taskId: this.taskId,
        progress: this.progress,
        stats: this.stats,
        elapsedTime: Date.now() - this.startTime
      };
    }
  };
  
  return tracker;
}

/**
 * Start a keep-alive ping interval
 * @param {number} intervalMs - Ping interval in milliseconds
 * @returns {number} - Interval ID
 */
function startPingInterval(intervalMs = 25000) {
  return setInterval(() => {
    if (socket && connected) {
      socket.emit('ping', { timestamp: Date.now() });
    }
  }, intervalMs);
}

/**
 * Initialize the Socket Handler module
 * @param {Object} options - Configuration options
 * @param {Object} [options.eventRegistryRef] - Reference to eventRegistry module
 * @returns {boolean} - Success state
 */
function initialize(options = {}) {
  console.log("Initializing Socket Handler module...");
  
  if (initialized) {
    console.warn("Socket Handler module already initialized");
    return true;
  }
  
  // Store eventRegistry reference if provided
  if (options && options.eventRegistryRef) {
    eventRegistry = options.eventRegistryRef;
  } else {
    // Try to get from window as fallback
    eventRegistry = window.eventRegistry || 
                    window.moduleInstances?.eventRegistry || 
                    null;
  }
  
  // Don't automatically connect - will be called by app.js
  
  initialized = true;
  console.log("Socket Handler module initialized");
  return true;
}

/**
 * Show a generic completion message when module-specific handlers aren't available
 * @param {Object} data - Task completion data
 */
function showGenericCompletionMessage(data) {
  try {
    // Find results container
    const resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) return;
    
    // Get output file path and stats
    const outputFile = data.output_file || '';
    const stats = data.stats || {};
    
    // Create results content
    let html = `
      <div class="alert alert-success">
        <h5><i class="fas fa-check-circle me-2"></i>Task Completed Successfully</h5>
        <p>Processing completed in ${formatDuration(stats.duration_seconds || 0)}</p>
      </div>
      
      <div class="card mb-3">
        <div class="card-header bg-success text-white">
          <h5 class="card-title mb-0">Output</h5>
        </div>
        <div class="card-body">
          <p class="card-text"><strong>Output File:</strong> ${outputFile}</p>
    `;
    
    // Add stats summary
    if (stats) {
      html += '<div class="stats-summary mt-3"><h6>Processing Statistics:</h6><ul>';
      
      // Add key stats as list items
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value !== 'object' && !key.startsWith('_')) {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          html += `<li><strong>${label}:</strong> ${value}</li>`;
        }
      }
      
      html += '</ul></div>';
    }
    
    // Add download button if output file is available
    if (outputFile) {
      html += `
        <div class="mt-3">
          <a href="/download/${encodeURIComponent(outputFile)}" class="btn btn-primary">
            <i class="fas fa-download me-2"></i>Download Result
          </a>
        </div>
      `;
    }
    
    html += `
        </div>
      </div>
    `;
    
    // Update results container
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
    
    // Hide progress container
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
    
  } catch (error) {
    console.error("Error showing generic completion message:", error);
    ui.showToast('Error', 'Could not display results', 'error');
  }
}

/**
 * Update generic progress UI elements directly
 * Used as a fallback when module-specific handlers aren't available
 * @param {Object} data - Progress data
 */
function updateGenericProgress(data) {
  if (!data) return;
  
  try {
    // Get common progress elements by ID
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressStats = document.getElementById('progress-stats');
    
    // Update progress bar
    if (progressBar && typeof data.progress === 'number') {
      progressBar.style.width = `${data.progress}%`;
      progressBar.setAttribute('aria-valuenow', data.progress);
      progressBar.textContent = `${Math.round(data.progress)}%`;
    }
    
    // Update status message
    if (progressStatus && data.message) {
      progressStatus.textContent = data.message;
    }
    
    // Update stats with basic info
    if (progressStats && data.stats) {
      // Create a simple representation of the stats
      let statsHtml = '<div class="stats-container">';
      
      // Add each stat as a badge
      for (const [key, value] of Object.entries(data.stats)) {
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
          const formattedKey = key.replace(/_/g, ' ');
          statsHtml += `
            <div class="stat-item">
              <span class="stat-label">${formattedKey}:</span>
              <span class="badge bg-secondary">${value}</span>
            </div>
          `;
        }
      }
      
      statsHtml += '</div>';
      progressStats.innerHTML = statsHtml;
    }
  } catch (error) {
    console.error("Error updating generic progress:", error);
  }
}

/**
 * Show a generic error message when module-specific handlers aren't available
 * @param {Object} errorObj - Error object
 */
function showGenericErrorMessage(errorObj) {
  try {
    // Find error container
    const errorContainer = document.getElementById('error-container');
    const progressContainer = document.getElementById('progress-container');
    
    // If no specific container found, create a generic alert
    if (!errorContainer) {
      // Hide progress if it exists
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      
      // Show toast notification
      ui.showToast('Error', errorObj.error || 'An error occurred during processing', 'error');
      return;
    }
    
    // Create error message content
    const errorMessage = errorObj.error || 'An unknown error occurred';
    const errorDetails = errorObj.details || '';
    
    let html = `
      <div class="alert alert-danger">
        <h5><i class="fas fa-exclamation-circle me-2"></i>Processing Error</h5>
        <p>${errorMessage}</p>
    `;
    
    // Add error details if available
    if (errorDetails) {
      html += `
        <hr>
        <div class="small">
          <strong>Details:</strong> ${errorDetails}
        </div>
      `;
    }
    
    // Add try again button
    html += `
        <div class="mt-3">
          <button class="btn btn-outline-danger" onclick="window.location.reload()">
            <i class="fas fa-redo me-2"></i>Try Again
          </button>
        </div>
      </div>
    `;
    
    // Update error container
    errorContainer.innerHTML = html;
    errorContainer.style.display = 'block';
    
    // Hide progress container
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
    
  } catch (error) {
    console.error("Error showing generic error message:", error);
    ui.showToast('Error', errorObj.error || 'An error occurred', 'error');
  }
}

/**
 * Handle task error based on task type
 * @param {string} taskType - Task type
 * @param {Object} errorObj - Error object
 */
function handleTaskError(taskType, errorObj) {
  switch (taskType) {
    case 'file':
      import('../features/fileProcessor.js')
        .then(module => {
          const processor = module.default || module;
          if (typeof processor.showError === 'function') {
            processor.showError(errorObj);
          } else {
            // Fallback
            showGenericErrorMessage(errorObj);
          }
        })
        .catch(err => {
          console.warn("Could not import fileProcessor module:", err);
          showGenericErrorMessage(errorObj);
        });
      break;
      
    case 'playlist':
      import('../features/playlistDownloader.js')
        .then(module => {
          const downloader = module.default || module;
          if (typeof downloader.showError === 'function') {
            downloader.showError(errorObj);
          } else {
            // Fallback
            showGenericErrorMessage(errorObj);
          }
        })
        .catch(err => {
          console.warn("Could not import playlistDownloader module:", err);
          showGenericErrorMessage(errorObj);
        });
      break;
      
    case 'scraper':
      import('../features/webScraper.js')
        .then(module => {
          const scraper = module.default || module;
          if (typeof scraper.showError === 'function') {
            scraper.showError(errorObj);
          } else {
            // Fallback
            showGenericErrorMessage(errorObj);
          }
        })
        .catch(err => {
          console.warn("Could not import webScraper module:", err);
          showGenericErrorMessage(errorObj);
        });
      break;
      
    default:
      // If task type unknown, show generic error message
      showGenericErrorMessage(errorObj);
      break;
  }
}

/**
 * Connect to the Socket.IO server
 */
function connect() {
  try {
    console.log("Connecting to Socket.IO server...");
    
    // Check if Socket.IO is available
    if (typeof io === 'undefined') {
      console.error("Socket.IO not loaded. Make sure the Socket.IO client is included in the page.");
      return;
    }
    
    // Initialize socket connection
    socket = io({
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    // Set up event handlers
    setupEventHandlers();
    
    console.log("Socket.IO connection initiated");
  } catch (error) {
    console.error("Error connecting to Socket.IO server:", error);
    
    // Show error notification
    ui.showToast('Connection Error', 'Failed to connect to server', 'error');
  }
}

/**
 * Set up Socket.IO event handlers
 */
function setupEventHandlers() {
  if (!socket) return;
  
  // Connection established
  socket.on('connect', () => {
    console.log("Socket.IO connected");
    console.log(`Socket session ID: ${socket.id}`);
    connected = true;
    reconnectAttempts = 0;
    
    // Check for ongoing tasks
    checkForOngoingTasks();
    
    // Show connection toast (only on reconnect, not initial connect)
    if (reconnectAttempts > 0) {
      ui.showToast('Connected', 'Real-time connection established', 'success');
    }
    
    // Emit event if registry available
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.connected', { timestamp: new Date().toISOString() });
    }
  });
  
  // Connection established acknowledgment from server
  socket.on('connection_established', (data) => {
    console.log("Server acknowledged connection:", data);
    
    // Store session ID if provided
    if (data && data.sid) {
      console.log(`Socket session ID: ${data.sid}`);
    }
  });
  
  // Connection error
  socket.on('connect_error', (error) => {
    console.error("Socket.IO connection error:", error);
    connected = false;
    
    // Only show error after multiple attempts
    if (++reconnectAttempts >= 3) {
      ui.showToast('Connection Error', 'Failed to connect to server', 'error');
    }
    
    // Emit event if registry available
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.error', { 
        error: error.message || 'Connection error',
        reconnectAttempts
      });
    }
  });
  
  // Disconnection
  socket.on('disconnect', (reason) => {
    console.log("Socket.IO disconnected:", reason);
    connected = false;
    
    // Show notification for unexpected disconnects
    if (reason !== 'io client disconnect') {
      ui.showToast('Disconnected', 'Connection to server lost', 'warning');
    }
    
    // Emit event if registry available
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.disconnected', { 
        reason,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Reconnection
  socket.on('reconnect', (attemptNumber) => {
    console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
    connected = true;
    
    // Show reconnection toast
    ui.showToast('Reconnected', 'Connection reestablished', 'success');
    
    // Check for ongoing tasks
    checkForOngoingTasks();
    
    // Emit event if registry available
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.reconnected', { 
        attempts: attemptNumber,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Pong response (for keep-alive)
  socket.on('pong', (data) => {
    console.debug("Pong received:", data);
    
    // Calculate latency if timestamp was included
    if (data && data.timestamp) {
      const latency = Date.now() - data.timestamp;
      console.debug(`Socket latency: ${latency}ms`);
    }
  });
  
  // Custom events
  setupCustomEventHandlers();
}

/**
 * Set up handlers for application-specific Socket.IO events
 */
function setupCustomEventHandlers() {
  if (!socket) return;
  
  // Task progress update
  socket.on('progress_update', (data) => {
    console.log("Progress update received:", data);
    
    // Use the active task tracker to update progress
    if (activeTaskTracker && data.task_id === activeTaskTracker.taskId) {
      activeTaskTracker.updateProgress(
        data.progress || 0,
        data.message || "",
        data.stats || {}
      );
    }
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.progress_update', data);
    }
    
    // Call registered progress callback for this task if available
    if (data.task_id && progressCallbacks[data.task_id] && 
        typeof progressCallbacks[data.task_id].onProgress === 'function') {
      progressCallbacks[data.task_id].onProgress(data);
    }
    
    // Determine task type
    const taskType = getTaskType(data.task_id);
    
    // Update UI based on task type - use dynamic imports to avoid circular dependencies
    updateProgressForTaskType(taskType, data);
  });
  
  // Task completed
  socket.on('task_completed', (data) => {
    console.log("Task completed:", data);
    
    // Update task tracker
    if (activeTaskTracker && data.task_id === activeTaskTracker.taskId) {
      activeTaskTracker.complete();
      activeTaskTracker = null;
    }
    
    // Stop status polling
    stopStatusPolling();
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.task_completed', data);
    }
    
    // Call registered completion callback for this task if available
    if (data.task_id && progressCallbacks[data.task_id] && 
        typeof progressCallbacks[data.task_id].onComplete === 'function') {
      progressCallbacks[data.task_id].onComplete(data);
      
      // Clear callback after completion
      delete progressCallbacks[data.task_id];
    }
    
    // Determine task type and handle UI updates
    const taskType = getTaskType(data.task_id);
    handleTaskCompletion(taskType, data);
    
    // Show completion notification
    ui.showToast('Task Completed', 'Processing completed successfully', 'success');
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  });
  
  // Task error
  socket.on('task_error', (data) => {
    console.error("Task error:", data);
    
    // Update task tracker
    if (activeTaskTracker && data.task_id === activeTaskTracker.taskId) {
      activeTaskTracker = null;
    }
    
    // Stop status polling
    stopStatusPolling();
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.task_error', data);
    }
    
    // Call registered error callback for this task if available
    if (data.task_id && progressCallbacks[data.task_id] && 
        typeof progressCallbacks[data.task_id].onError === 'function') {
      progressCallbacks[data.task_id].onError(data);
      
      // Clear callback after error
      delete progressCallbacks[data.task_id];
    }
    
    // Format error object for handler
    const errorObj = {
      error: data.error,
      details: data.details
    };
    
    // Determine task type and handle UI updates
    const taskType = getTaskType(data.task_id);
    handleTaskError(taskType, errorObj);
    
    // Show error notification
    ui.showToast('Task Error', data.error, 'error');
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  });
  
  // Task cancelled
  socket.on('task_cancelled', (data) => {
    console.log("Task cancelled:", data);
    
    // Update task tracker
    if (activeTaskTracker && data.task_id === activeTaskTracker.taskId) {
      activeTaskTracker = null;
    }
    
    // Stop status polling
    stopStatusPolling();
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.task_cancelled', data);
    }
    
    // Call registered cancel callback for this task if available
    if (data.task_id && progressCallbacks[data.task_id] && 
        typeof progressCallbacks[data.task_id].onCancelled === 'function') {
      progressCallbacks[data.task_id].onCancelled(data);
      
      // Clear callback after cancellation
      delete progressCallbacks[data.task_id];
    }
    
    // Show notification
    ui.showToast('Task Cancelled', data.message || 'Task was cancelled', 'warning');
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  });
  
  // PDF Download events
  socket.on('pdf_download_progress', (data) => {
    console.log("PDF download progress:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_download_progress', data);
    }
    
    // Dynamic import of webScraper to avoid circular dependencies
    import('../features/webScraper.js')
      .then(module => {
        const scraper = module.default || module;
        if (typeof scraper.updatePdfDownloadProgress === 'function') {
          scraper.updatePdfDownloadProgress(data);
        }
      })
      .catch(err => {
        console.warn("Could not import webScraper module for PDF updates:", err);
      });
  });
  
  // PDF Processing events
  socket.on('pdf_processing_start', (data) => {
    console.log("PDF processing started:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_start', data);
    }
  });
  
  socket.on('pdf_processing_update', (data) => {
    console.log("PDF processing update:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_update', data);
    }
  });
  
  socket.on('pdf_processing_complete', (data) => {
    console.log("PDF processing complete:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_complete', data);
    }
    
    // Show notification
    ui.showToast('PDF Processed', 'PDF processing completed successfully', 'success');
  });
  
  socket.on('pdf_processing_error', (data) => {
    console.error("PDF processing error:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_error', data);
    }
    
    // Show error notification
    ui.showToast('PDF Processing Error', data.error || 'Error processing PDF', 'error');
  });
  
  // Batch processing events
  socket.on('batch_processing_start', (data) => {
    console.log("Batch processing started:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.batch_processing_start', data);
    }
  });
  
  socket.on('batch_processing_progress', (data) => {
    console.log("Batch processing progress:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.batch_processing_progress', data);
    }
  });
  
  socket.on('batch_processing_complete', (data) => {
    console.log("Batch processing complete:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.batch_processing_complete', data);
    }
    
    ui.showToast('Batch Complete', 'Batch processing completed successfully', 'success');
  });
  
  socket.on('batch_processing_error', (data) => {
    console.error("Batch processing error:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.batch_processing_error', data);
    }
    
    ui.showToast('Batch Error', data.error || 'Error in batch processing', 'error');
  });
}

/**
 * Update progress for a specific task type using dynamic imports
 * @param {string} taskType - Task type (file, playlist, scraper)
 * @param {Object} data - Progress data
 */
function updateProgressForTaskType(taskType, data) {
  switch (taskType) {
    case 'file':
      import('../features/fileProcessor.js')
        .then(module => {
          const processor = module.default || module;
          // Check if module has updateFileProgressStats function
          if (typeof processor.updateFileProgressStats === 'function') {
            processor.updateFileProgressStats(data);
          } else {
            // Try direct DOM update if module function not available
            updateGenericProgress(data);
          }
        })
        .catch(err => {
          console.warn("Could not import fileProcessor module:", err);
          // Fallback to generic progress update
          updateGenericProgress(data);
        });
      break;
      
    case 'playlist':
      import('../features/playlistDownloader.js')
        .then(module => {
          const downloader = module.default || module;
          if (typeof downloader.updateProgress === 'function') {
            downloader.updateProgress(data);
          } else {
            updateGenericProgress(data);
          }
        })
        .catch(err => {
          console.warn("Could not import playlistDownloader module:", err);
          updateGenericProgress(data);
        });
      break;
      
    case 'scraper':
      import('../features/webScraper.js')
        .then(module => {
          const scraper = module.default || module;
          if (typeof scraper.updateProgress === 'function') {
            scraper.updateProgress(data);
          } else {
            updateGenericProgress(data);
          }
        })
        .catch(err => {
          console.warn("Could not import webScraper module:", err);
          updateGenericProgress(data);
        });
      break;
      
    default:
      // Unknown task type, use generic progress display
      updateGenericProgress(data);
      break;
  }
}

/**
 * Update generic stats display with formatted information
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Task statistics
 */
function updateGenericStatsDisplay(element, stats) {
  if (!element || !stats) return;
  
  try {
    // Create HTML content for stats
    let html = '<div class="stats-container p-2">';
    
    // Handle different types of stats
    if (stats.total_files !== undefined) {
      // File processing stats
      html += `
        <div class="row">
          <div class="col-6 col-md-3">
            <span class="badge bg-primary">Total: ${stats.total_files || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-success">Processed: ${stats.processed_files || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-warning">Skipped: ${stats.skipped_files || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-danger">Errors: ${stats.error_files || 0}</span>
          </div>
        </div>
      `;
      
      // Add current file if available
      if (stats.current_file) {
        html += `
          <div class="text-truncate small mt-2">
            <i class="fas fa-file-alt me-1"></i> ${stats.current_file}
          </div>
        `;
      }
    } else if (stats.pdf_downloads !== undefined) {
      // PDF download stats
      html += `
        <div class="row">
          <div class="col-6 col-md-3">
            <span class="badge bg-primary">PDFs: ${stats.pdf_downloads.total || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-success">Downloaded: ${stats.pdf_downloads.completed || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-info">In Progress: ${stats.pdf_downloads.downloading || 0}</span>
          </div>
          <div class="col-6 col-md-3">
            <span class="badge bg-danger">Failed: ${stats.pdf_downloads.failed || 0}</span>
          </div>
        </div>
      `;
    } else {
      // Generic stats - display key-value pairs
      html += '<div class="row">';
      
      Object.entries(stats).forEach(([key, value]) => {
        // Skip internal or complex properties
        if (key.startsWith('_') || typeof value === 'object') return;
        
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        
        html += `
          <div class="col-6 col-md-4 mb-1">
            <small>${label}:</small>
            <span class="fw-bold">${value}</span>
          </div>
        `;
      });
      
      html += '</div>';
    }
    
    html += '</div>';
    
    // Update stats container
    element.innerHTML = html;
  } catch (error) {
    console.error("Error updating generic stats display:", error);
  }
}

/**
 * Handle task completion based on task type
 * @param {string} taskType - Task type
 * @param {Object} data - Completion data
 */
function handleTaskCompletion(taskType, data) {
  switch (taskType) {
    case 'file':
      import('../features/fileProcessor.js')
        .then(module => {
          const processor = module.default || module;
          if (typeof processor.showResult === 'function') {
            processor.showResult(data);
          } else {
            // Fallback
            showGenericCompletionMessage(data);
          }
        })
        .catch(err => {
          console.warn("Could not import fileProcessor module:", err);
          showGenericCompletionMessage(data);
        });
      break;
      
    case 'playlist':
      import('../features/playlistDownloader.js')
        .then(module => {
          const downloader = module.default || module;
          if (typeof downloader.showResults === 'function') {
            downloader.showResults(data);
          } else {
            // Fallback
            showGenericCompletionMessage(data);
          }
        })
        .catch(err => {
          console.warn("Could not import playlistDownloader module:", err);
          showGenericCompletionMessage(data);
        });
      break;
      
    case 'scraper':
      import('../features/webScraper.js')
        .then(module => {
          const scraper = module.default || module;
          if (typeof scraper.showResults === 'function') {
            scraper.showResults(data);
          } else {
            // Fallback
            showGenericCompletionMessage(data);
          }
        })
        .catch(err => {
          console.warn("Could not import webScraper module:", err);
          showGenericCompletionMessage(data);
        });
      break;
      
    default:
      // If task type unknown, show generic completion message
      showGenericCompletionMessage(data);
      break;
  }
}

/**
 * Check for ongoing tasks when connection is established
 */
function checkForOngoingTasks() {
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  
  if (storedTaskId) {
    console.log("Found ongoing task:", storedTaskId);
    
    // Start status polling for this task
    startStatusPolling(storedTaskId);
    
    // Create task tracker
    activeTaskTracker = createTaskTracker(storedTaskId);
    
    // Show notification
    ui.showToast('Task Resumed', 'Reconnected to ongoing task', 'info');
  }
}

/**
 * Register callbacks for task progress
 * @param {string} taskId - Task ID
 * @param {Object} callbacks - Callback functions
 */
function registerProgressCallbacks(taskId, callbacks = {}) {
  if (!taskId) return;
  
  progressCallbacks[taskId] = {
    onProgress: callbacks.onProgress || function() {},
    onComplete: callbacks.onComplete || function() {},
    onError: callbacks.onError || function() {},
    onCancelled: callbacks.onCancelled || function() {}
  };
  
  console.log(`Registered progress callbacks for task ${taskId}`);
}

/**
 * Start polling for task status
 * @param {string} currentTaskId - The task ID to poll for
 * @param {Object} callbacks - Optional callbacks for progress updates
 */
function startStatusPolling(currentTaskId, callbacks = {}) {
  if (!currentTaskId) {
    console.warn("No task ID provided for status polling");
    return;
  }
  
  // Store the task ID
  taskId = currentTaskId;
  
  // Register callbacks if provided
  if (callbacks.onProgress || callbacks.onComplete || callbacks.onError || callbacks.onCancelled) {
    registerProgressCallbacks(taskId, callbacks);
  }
  
  // Create task tracker if not already exists
  if (!activeTaskTracker || activeTaskTracker.taskId !== taskId) {
    activeTaskTracker = createTaskTracker(taskId);
  }
  
  // Clear any existing polling
  stopStatusPolling();
  
  // Start polling interval
  requestTaskStatus();
  statusPollInterval = setInterval(requestTaskStatus, 2000);
  
  console.log(`Started status polling for task ${taskId}`);
}

/**
 * Stop polling for task status
 */
function stopStatusPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
    
    console.log("Stopped status polling");
  }
  
  // Keep taskId to support reconnection
}

/**
 * Request task status from server
 */
function requestTaskStatus() {
  if (!socket || !connected || !taskId) return;
  
  // Emit status request event
  socket.emit('request_status', { task_id: taskId });
}

/**
 * Send a ping to keep the connection alive
 */
function sendPing() {
  if (!socket || !connected) return;
  
  socket.emit('ping', { timestamp: Date.now() });
}

/**
 * Determine task type from task ID or session storage
 * @param {string} taskId - Task ID
 * @returns {string} - Task type ('file', 'playlist', 'scraper')
 */
function getTaskType(taskId) {
  // Try to get from session storage first
  const storedType = sessionStorage.getItem('ongoingTaskType');
  if (storedType) {
    return storedType;
  }
  
  // If not stored, guess based on active tab
  const fileTab = document.getElementById('file');
  const playlistTab = document.getElementById('playlist');
  const scraperTab = document.getElementById('scraper');
  
  if (fileTab && fileTab.classList.contains('active')) {
    return 'file';
  } else if (playlistTab && playlistTab.classList.contains('active')) {
    return 'playlist';
  } else if (scraperTab && scraperTab.classList.contains('active')) {
    return 'scraper';
  }
  
  // Default to file processing
  return 'file';
}

/**
 * Cancel current task
 * @returns {Promise<boolean>} - Whether cancellation was successful
 */
async function cancelCurrentTask() {
  if (!taskId) {
    console.warn("No active task to cancel");
    return false;
  }
  
  try {
    // Use fetch API for better error handling
    const response = await fetch(`/api/cancel_task/${taskId}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Stop polling and clear task ID
      stopStatusPolling();
      
      // Clear progress callbacks
      if (progressCallbacks[taskId]) {
        delete progressCallbacks[taskId];
      }
      
      // Clear active task tracker
      if (activeTaskTracker) {
        activeTaskTracker = null;
      }
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Clear global task ID
      const oldTaskId = taskId;
      taskId = null;
      
      // Show toast
      ui.showToast('Task Cancelled', 'Task has been cancelled', 'info');
      
      // Emit event if registry available
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('task.cancelled', { 
          taskId: oldTaskId,
          timestamp: new Date().toISOString()
        });
      }
      
      return true;
    } else {
      // Show error
      ui.showToast('Error', data.error || 'Failed to cancel task', 'error');
      return false;
    }
  } catch (error) {
    console.error("Error cancelling task:", error);
    ui.showToast('Error', 'Failed to cancel task: ' + error.message, 'error');
    return false;
  }
}

/**
 * Disconnect from Socket.IO server
 */
function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    
    // Stop status polling
    stopStatusPolling();
    
    // Clear task state
    taskId = null;
    progressCallbacks = {};
    activeTaskTracker = null;
    
    console.log("Socket.IO disconnected");
  }
}

/**
 * Check if socket is connected
 * @returns {boolean} - Whether socket is connected
 */
function isConnected() {
  return connected;
}

/**
 * Emit a custom event
 * @param {string} event - Event name 
 * @param {Object} data - Event data
 * @returns {boolean} - Whether event was emitted successfully
 */
function emit(event, data) {
  if (!socket || !connected) {
    console.warn(`Cannot emit event ${event}: Socket not connected`);
    return false;
  }
  
  socket.emit(event, data);
  return true;
}

/**
 * Emit a PDF download start event
 * @param {string} url - PDF URL to download
 * @param {string} taskId - Task ID
 * @returns {boolean} - Whether event was emitted successfully
 */
function emitPdfDownloadStart(url, taskId) {
  return emit('pdf_download_start', { 
    url, 
    task_id: taskId,
    timestamp: Date.now()
  });
}

/**
 * Emit a PDF processing request event
 * @param {Object} params - Parameters for PDF processing
 * @returns {boolean} - Whether event was emitted successfully
 */
function emitPdfProcessingRequest(params) {
  return emit('pdf_processing_request', params);
}

/**
 * Get current task ID
 * @returns {string|null} - Current task ID
 */
function getCurrentTaskId() {
  return taskId;
}

/**
 * Get module state for debugging
 * @returns {Object} - Module state information
 */
function getState() {
  return {
    connected,
    reconnectAttempts,
    activeTaskId: taskId,
    hasActiveTracker: !!activeTaskTracker,
    callbacksRegistered: Object.keys(progressCallbacks).length,
    initialized,
    eventRegistryAvailable: !!eventRegistry,
    // Use the utils module to format the time for better display
    connectionUptime: connected ? utils.formatDuration((Date.now() - (activeTaskTracker?.startTime || Date.now())) / 1000) : 'Not connected'
  };
}

// Export module API using a consistent pattern
const socketHandler = {
  // Core functionality
  initialize,
  connect,
  disconnect,
  isConnected,
  emit,
  
  // Task tracking
  startStatusPolling,
  stopStatusPolling,
  cancelCurrentTask,
  registerProgressCallbacks,
  getCurrentTaskId,
  getTaskType,
  
  // PDF-specific methods
  emitPdfDownloadStart,
  emitPdfProcessingRequest,
  
  // Keep-alive
  startPingInterval,
  sendPing,
  
  // Debugging
  getState
};

// Use the utils module for additional functionality
// This ensures the import is properly utilized to avoid unused variable warnings
const formatTime = utils.formatDuration;
const generateTaskId = utils.generateId;

// Export named exports for compatibility with older code
export {
  initialize,
  connect,
  disconnect,
  isConnected,
  emit,
  startStatusPolling,
  stopStatusPolling,
  cancelCurrentTask,
  registerProgressCallbacks,
  getCurrentTaskId,
  getTaskType,
  emitPdfDownloadStart,
  emitPdfProcessingRequest,
  startPingInterval,
  sendPing,
  getState
};

// Default export for the module
export default socketHandler;