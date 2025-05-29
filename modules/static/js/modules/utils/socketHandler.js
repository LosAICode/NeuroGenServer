/**
 * Socket Handler Module
 * 
 * Manages Socket.IO connections and message handling for real-time communication.
 * Provides robust error handling, reconnection logic, and task progress tracking.
 * 
 * KEY IMPROVEMENTS:
 * - Enhanced DOM readiness handling to prevent "document.body is null" errors
 * - Improved task lifecycle handling for all Socket.IO events
 * - Multiple fallback paths for when Socket.IO is unavailable
 * - Better integration with progressHandler.js
 * - Robust task cancellation with multiple API fallbacks
 * - Improved progress update handling to fix progress bar "stuck at 5%" issue
 * - Enhanced error recovery
 * - Proper event registry integration
 * - Memory leak fixes
 */

import { getElement } from './domUtils.js';

// Import Blueprint events configuration
import { SOCKET_EVENTS, BLUEPRINT_EVENTS, SERVER_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';

// Module state
let socket = null;
let connected = false;
let reconnectAttempts = 0;
let activeTasks = new Set();
let taskCallbacks = new Map();
let taskStatusRequests = new Map();
let pollingIntervals = {};
let eventRegistry = null;
let initialized = false;
let connectionAttempts = 0;
let maxConnectionAttempts = 5;
let waitForDOMInit = false;
let pingInterval = null;

// For backward compatibility with original implementation
let currentTaskId = null;
let activeTaskTracker = null;

/**
 * Create a task tracker for the current task (for backward compatibility)
 * @param {string} taskId - The task ID to track
 * @returns {Object} - The task tracker object
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
 * Show a generic completion message when module-specific handlers aren't available
 * @param {Object} data - Task completion data
 */
function showGenericCompletionMessage(data) {
  try {
    // Find results container
    const resultsContainer = getElement('results-container');
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
    const progressContainer = getElement('progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
    
  } catch (error) {
    console.error("Error showing generic completion message:", error);
    showToast('Error', 'Could not display results', 'error');
  }
}

/**
 * Show a generic error message when module-specific handlers aren't available
 * @param {Object} errorObj - Error object
 */
function showGenericErrorMessage(errorObj) {
  try {
    // Find error container
    const errorContainer = getElement('error-container');
    const progressContainer = getElement('progress-container');
    
    // If no specific container found, create a generic alert
    if (!errorContainer) {
      // Hide progress if it exists
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      
      // Show toast notification
      showToast('Error', errorObj.error || 'An error occurred during processing', 'error');
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
    showToast('Error', errorObj.error || 'An error occurred', 'error');
  }
}

/**
 * Show a toast notification
 * @param {string} title - Toast title 
 * @param {string} message - Toast message
 * @param {string} type - Toast type ('success', 'error', 'warning', 'info')
 */
function showToast(title, message, type = 'info') {
  try {
    // Try to use UI module if available
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast(title, message, type);
      return;
    }
    
    // Fallback to Bootstrap Toast if available
    const toastContainer = getElement('toast-container');
    if (toastContainer) {
      const toastId = `toast-${Date.now()}`;
      const toastHtml = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="toast-header bg-${type === 'error' ? 'danger' : type} text-white">
            <strong class="me-auto">${title}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
          <div class="toast-body">
            ${message}
          </div>
        </div>
      `;
      
      toastContainer.insertAdjacentHTML('beforeend', toastHtml);
      
      // Initialize the toast if Bootstrap is available
      if (window.bootstrap && window.bootstrap.Toast) {
        new window.bootstrap.Toast(document.getElementById(toastId)).show();
      }
    } else {
      // Last resort: use alert
      console.log(`${title}: ${message}`);
    }
  } catch (error) {
    console.error("Error showing toast:", error);
  }
}

/**
 * Initialize the Socket Handler module with improved DOM readiness checks
 * @param {Object} options - Configuration options
 * @param {Object} [options.eventRegistryRef] - Reference to eventRegistry module
 * @returns {Promise<boolean>} - Success state
 */
function initialize(options = {}) {
  // Early return if already initialized
  if (initialized && !waitForDOMInit) {
    console.log("Socket handler already initialized");
    return Promise.resolve(true);
  }
  
  console.log("Initializing Socket Handler module...");
  
  // Check if document is ready before proceeding
  if (document.readyState === 'loading') {
    console.log("DOM not ready, deferring Socket Handler initialization");
    waitForDOMInit = true;
    
    return new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', () => {
        // Use setTimeout to ensure this runs after current JS execution
        setTimeout(() => {
          initializeAfterDOMReady(options).then(resolve);
        }, 10);
      });
    });
  } else {
    // DOM is already ready, initialize immediately
    return initializeAfterDOMReady(options);
  }
}

/**
 * Second phase of initialization after DOM is ready
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Success state
 */
async function initializeAfterDOMReady(options = {}) {
  try {
    waitForDOMInit = false;
    
    // Store eventRegistry reference if provided
    if (options && options.eventRegistryRef) {
      eventRegistry = options.eventRegistryRef;
    } else {
      // Try to get from window as fallback
      eventRegistry = window.eventRegistry || 
                      window.moduleInstances?.eventRegistry || 
                      null;
    }
    
    // Get socket status UI element (if available)
    const statusIndicator = getElement('socket-status');
    if (statusIndicator) {
      statusIndicator.classList.remove('d-none');
      statusIndicator.classList.add('connecting');
      
      const statusText = statusIndicator.querySelector('.socket-status-text');
      if (statusText) {
        statusText.textContent = 'Connecting...';
      }
    }
    
    // Connect to Socket.IO server
    const connectResult = await connect();
    
    // Mark as initialized
    initialized = true;
    console.log("Socket Handler module initialized successfully");
    
    return connectResult;
  } catch (error) {
    console.error("Error initializing Socket Handler module:", error);
    initialized = true; // Still mark as initialized to prevent retry loops
    return false;
  }
}

/**
 * Update the socket status indicator in the UI
 * @param {string} status - Status ('connected', 'disconnected', 'connecting', 'error')
 * @param {string} message - Status message
 */
function updateSocketStatus(status, message) {
  const statusIndicator = getElement('socket-status');
  if (!statusIndicator) return;
  
  // Update classes
  statusIndicator.classList.remove('connected', 'disconnected', 'connecting', 'error');
  statusIndicator.classList.add(status);
  
  // Update text
  const statusText = statusIndicator.querySelector('.socket-status-text');
  if (statusText && message) {
    statusText.textContent = message;
  }
}

/**
 * Connect to the Socket.IO server
 * @returns {Promise<boolean>} - Whether connection was initiated successfully
 */
function connect() {
  return new Promise((resolve) => {
    try {
      console.log("Connecting to Socket.IO server...");
      
      // Check if Socket.IO is available
      if (typeof io === 'undefined') {
        console.error("Socket.IO not loaded. Make sure the Socket.IO client is included in the page.");
        updateSocketStatus('error', 'Socket.IO not available');
        resolve(false);
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
      
      // Set up custom event handlers
      setupCustomEventHandlers();
      
      // Start a keep-alive ping interval
      startPingInterval();
      
      console.log("Socket.IO connection initiated");
      resolve(true);
    } catch (error) {
      console.error("Error connecting to Socket.IO server:", error);
      
      // Show error notification
      showToast('Connection Error', 'Failed to connect to server', 'error');
      updateSocketStatus('error', 'Connection Error');
      resolve(false);
    }
  });
}

/**
 * Set up Socket.IO event handlers
 */
function setupEventHandlers() {
  if (!socket) return;
  
  // Connection established
  socket.on('connect', () => {
    console.log(`Socket.IO connected with ID: ${socket.id}`);
    connected = true;
    reconnectAttempts = 0;
    
    // Store connect time for uptime calculation
    socket._connectTime = Date.now();
    
    // Update UI status
    updateSocketStatus('connected', 'Connected');
    
    // Check for ongoing tasks after connection is established
    checkForOngoingTasks();
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.connected');
    }
  });
  
  // Connection closed
  socket.on('disconnect', (reason) => {
    console.log(`Socket.IO disconnected: ${reason}`);
    connected = false;
    
    // Update UI status
    updateSocketStatus('disconnected', `Disconnected: ${reason}`);
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.disconnected', { reason });
    }
    
    // Start polling for active tasks
    activeTasks.forEach(taskId => {
      if (!pollingIntervals[taskId]) {
        startStatusPolling(taskId);
      }
    });
  });
  
  // Reconnection attempt
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Socket.IO reconnect attempt ${attemptNumber}`);
    reconnectAttempts = attemptNumber;
    
    // Update UI status
    updateSocketStatus('connecting', `Reconnecting (${attemptNumber})...`);
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.reconnect_attempt', { attemptNumber });
    }
  });
  
  // Reconnection failed
  socket.on('reconnect_failed', () => {
    console.log('Socket.IO reconnection failed');
    
    // Update UI status
    updateSocketStatus('error', 'Reconnection failed');
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.reconnect_failed');
    }
    
    // Start polling for active tasks
    activeTasks.forEach(taskId => {
      if (!pollingIntervals[taskId]) {
        startStatusPolling(taskId);
      }
    });
  });
  
  // Reconnection error
  socket.on('reconnect_error', (error) => {
    console.error('Socket.IO reconnection error:', error);
    
    // Update UI status
    updateSocketStatus('error', 'Reconnection error');
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.reconnect_error', { error });
    }
  });
  
  // Connection error
  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    
    // Update UI status
    updateSocketStatus('error', 'Connection error');
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.connect_error', { error });
    }
  });
  
  // Ping response
  socket.on('pong', (data) => {
    const roundTripTime = Date.now() - (data.timestamp || 0);
    console.log(`Socket.IO ping response: ${roundTripTime}ms`);
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pong', { roundTripTime });
    }
  });
  
  // General error
  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
    
    // Update UI status
    updateSocketStatus('error', 'Socket Error');
    
    // Emit event through event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.error', { error });
    }
  });
}

/**
 * Start a keep-alive ping interval
 * @param {number} intervalMs - Ping interval in milliseconds
 * @returns {number} - Interval ID
 */
function startPingInterval(intervalMs = 25000) {
  // Clear existing interval if any
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  // Create new interval
  pingInterval = setInterval(() => {
    if (socket && connected) {
      socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.PING, { timestamp: Date.now() });
    }
  }, intervalMs);
  
  return pingInterval;
}

/**
 * Set up handlers for application-specific Socket.IO events
 */
function setupCustomEventHandlers() {
  if (!socket) return;
  
  // Task progress update (Blueprint event)
  socket.on(TASK_EVENTS.PROGRESS, (data) => {
    console.log("Progress update received:", data);
    handleProgressUpdate(data);
  });
  
  // Also listen for task_progress event (legacy compatibility)
  socket.on('task_progress', (data) => {
    console.log("Task progress update received (legacy):", data);
    handleProgressUpdate(data);
  });
  
  // Task completed (Blueprint event)
  socket.on(TASK_EVENTS.COMPLETED, (data) => {
    console.log("Task completed:", data);
    handleTaskCompleted(data);
  });
  
  // Task error (Blueprint event)
  socket.on(TASK_EVENTS.ERROR, (data) => {
    console.error("Task error:", data);
    handleTaskError(data);
  });
  
  // Task cancelled (Blueprint event)
  socket.on(TASK_EVENTS.CANCELLED, (data) => {
    console.log("Task cancelled:", data);
    handleTaskCancelled(data);
  });
  
  // PDF Download events (Blueprint events)
  socket.on(SERVER_EVENTS.PDF_DOWNLOAD_PROGRESS, (data) => {
    console.log("PDF download progress:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_download_progress', data);
    }
    
    // Dynamic import of webScraper to avoid circular dependencies
    import('./webScraper.js')
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
  
  // PDF Processing events (Blueprint events)
  socket.on(SERVER_EVENTS.PDF_PROCESSING_STARTED, (data) => {
    console.log("PDF processing started:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_start', data);
    }
  });
  
  socket.on(SERVER_EVENTS.PDF_PROCESSING_PROGRESS, (data) => {
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
    showToast('PDF Processed', 'PDF processing completed successfully', 'success');
  });
  
  socket.on('pdf_processing_error', (data) => {
    console.error("PDF processing error:", data);
    
    // Emit event through eventRegistry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.pdf_processing_error', data);
    }
    
    // Show error notification
    showToast('PDF Processing Error', data.error || 'Error processing PDF', 'error');
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
    
    showToast('Batch Complete', 'Batch processing completed successfully', 'success');
  });
  
  socket.on('batch_processing_error', (data) => {
    console.error("Batch processing error:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.batch_processing_error', data);
    }
    
    showToast('Batch Error', data.error || 'Error in batch processing', 'error');
  });
  
  // Playlist events
  socket.on('playlist_progress', (data) => {
    console.log("Playlist progress:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.playlist_progress', data);
    }
    
    // Also handle as generic progress update for backward compatibility
    handleProgressUpdate(data);
  });
  
  socket.on('playlist_completed', (data) => {
    console.log("Playlist completed:", data);
    
    if (eventRegistry) {
      eventRegistry.emit('socket.playlist_completed', data);
    }
    
    // Also handle as task completion for backward compatibility
    handleTaskCompleted(data);
  });
  
  console.log("Socket event handlers registered");
}

/**
 * Handle task progress updates
 */
function handleProgressUpdate(data) {
  if (!data || !data.task_id) return;
  
  console.log('Progress update received:', data);
  
  // Track this task
  activeTasks.add(data.task_id);
  
  // Update current task ID for backward compatibility
  currentTaskId = data.task_id;
  
  // Update task status request time to prevent spam
  taskStatusRequests.set(data.task_id, Date.now());
  
  // Update active task tracker for backward compatibility
  if (activeTaskTracker && activeTaskTracker.taskId === data.task_id) {
    activeTaskTracker.updateProgress(
      data.progress || 0,
      data.message || "",
      data.stats || {}
    );
  }
  
  // Update UI via progressHandler if available
  if (window.progressHandler && typeof window.progressHandler.updateTaskProgress === 'function') {
    window.progressHandler.updateTaskProgress(
      data.task_id,
      data.progress,
      data.message,
      data.stats
    );
  } else {
    // Fall back to direct UI update
    updateGenericProgress(data);
  }
  
  // Call any registered callbacks
  const callbacks = taskCallbacks.get(data.task_id);
  if (callbacks && typeof callbacks.onProgress === 'function') {
    callbacks.onProgress(data);
  }
  
  // Emit via event registry
  if (eventRegistry && typeof eventRegistry.emit === 'function') {
    eventRegistry.emit('socket.progress_update', data);
    eventRegistry.emit('progress.update', data);
  }
  
  // Enhanced completion detection
  // If progress is 100% or status is "completed", consider the task complete
  const isCompleted = 
    data.status === 'completed' || 
    (data.stats && data.stats.status === 'completed') ||
    data.progress >= 100 ||
    (data.progress >= 99 && isCompletionPhase(data));
  
  if (isCompleted) {
    console.log(`Task ${data.task_id} detected as complete via progress update`);
    
    // Force data to have progress = 100% for proper UI update
    const completeData = {
      ...data,
      progress: 100,
      status: 'completed'
    };
    
    // Call completion handler after a short delay to allow for any actual
    // completion event that might be sent by the server
    setTimeout(() => {
      if (activeTasks.has(data.task_id)) {
        handleTaskCompleted(completeData);
      }
    }, 250);
  }
}

/**
 * Helper function to check if data indicates completion phase
 */
function isCompletionPhase(data) {
  // Check various completion indicators
  return (
    data.status === "completed" || 
    (data.stats && data.stats.status === "completed") ||
    (data.message && (
      data.message.toLowerCase().includes("complet") ||
      data.message.toLowerCase().includes("done") ||
      data.message.toLowerCase().includes("finish")
    )) ||
    (data.progress >= 45 && data.stats && data.stats.total_playlists) || // YouTube playlist specific
    (data.progress >= 99.5) ||
    (data.progress >= 99 && data.stats && 
     data.stats.processed_files === data.stats.total_files)
  );
}

/**
 * Handle task completion
 */
function handleTaskCompleted(data) {
  if (!data || !data.task_id) return;
  
  console.log('Task completion received:', data);
  
  // Update active task tracker for backward compatibility
  if (activeTaskTracker && activeTaskTracker.taskId === data.task_id) {
    activeTaskTracker.complete();
    activeTaskTracker = null;
  }
  
  // Update current task ID for backward compatibility
  if (currentTaskId === data.task_id) {
    currentTaskId = null;
  }
  
  // Update UI via progressHandler if available
  if (window.progressHandler && typeof window.progressHandler.completeTask === 'function') {
    window.progressHandler.completeTask(data.task_id, data);
  } else {
    // Fall back to generic completion handling
    showGenericCompletionMessage(data);
  }
  
  // Call any registered callbacks
  const callbacks = taskCallbacks.get(data.task_id);
  if (callbacks && typeof callbacks.onComplete === 'function') {
    callbacks.onComplete(data);
  }
  
  // Emit via event registry
  if (eventRegistry && typeof eventRegistry.emit === 'function') {
    eventRegistry.emit('socket.task_completed', data);
    eventRegistry.emit('progress.completed', data);
    
    // Special case for playlists
    if (data.type === 'playlist' || sessionStorage.getItem('ongoingTaskType') === 'playlist') {
      eventRegistry.emit('socket.playlist_completed', data);
    }
  }
  
  // Stop polling if active
  stopStatusPolling(data.task_id);
  
  // Remove from active tasks
  activeTasks.delete(data.task_id);
  
  // Clean up callbacks
  taskCallbacks.delete(data.task_id);
  
  // Clean up status requests
  taskStatusRequests.delete(data.task_id);
  
  // Clear session storage if this is the current task
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  if (storedTaskId === data.task_id) {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
  }
  
  // Show success notification
  showToast('Task Completed', 'Processing completed successfully', 'success');
}

/**
 * Handle task errors
 */
function handleTaskError(data) {
  if (!data || !data.task_id) return;
  
  console.error('Task error received:', data);
  
  // Update active task tracker for backward compatibility
  if (activeTaskTracker && activeTaskTracker.taskId === data.task_id) {
    activeTaskTracker = null;
  }
  
  // Update current task ID for backward compatibility
  if (currentTaskId === data.task_id) {
    currentTaskId = null;
  }
  
  // Update UI via progressHandler if available
  if (window.progressHandler && typeof window.progressHandler.errorTask === 'function') {
    window.progressHandler.errorTask(data.task_id, data.error || 'Unknown error');
  } else {
    // Fall back to generic error handling
    showGenericErrorMessage(data);
  }
  
  // Call any registered callbacks
  const callbacks = taskCallbacks.get(data.task_id);
  if (callbacks && typeof callbacks.onError === 'function') {
    callbacks.onError(data);
  }
  
  // Emit via event registry
  if (eventRegistry && typeof eventRegistry.emit === 'function') {
    eventRegistry.emit('socket.task_error', data);
    eventRegistry.emit('progress.error', data);
  }
  
  // Show error toast
  showToast('Task Error', data.error || 'An error occurred with the task', 'error');
  
  // Stop polling if active
  stopStatusPolling(data.task_id);
  
  // Remove from active tasks
  activeTasks.delete(data.task_id);
  
  // Clean up callbacks
  taskCallbacks.delete(data.task_id);
  
  // Clean up status requests
  taskStatusRequests.delete(data.task_id);
  
  // Clear session storage if this is the current task
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  if (storedTaskId === data.task_id) {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
  }
}

/**
 * Handle task cancellation
 */
function handleTaskCancelled(data) {
  if (!data || !data.task_id) return;
  
  console.log('Task cancellation received:', data);
  
  // Update active task tracker for backward compatibility
  if (activeTaskTracker && activeTaskTracker.taskId === data.task_id) {
    activeTaskTracker = null;
  }
  
  // Update current task ID for backward compatibility
  if (currentTaskId === data.task_id) {
    currentTaskId = null;
  }
  
  // Update UI via progressHandler if available
  if (window.progressHandler && typeof window.progressHandler.cancelTask === 'function') {
    window.progressHandler.cancelTask(data.task_id);
  }
  
  // Call any registered callbacks
  const callbacks = taskCallbacks.get(data.task_id);
  if (callbacks && typeof callbacks.onCancel === 'function') {
    callbacks.onCancel(data);
  }
  
  // Emit via event registry
  if (eventRegistry && typeof eventRegistry.emit === 'function') {
    eventRegistry.emit('socket.task_cancelled', data);
    eventRegistry.emit('progress.cancelled', data);
  }
  
  // Show toast
  showToast('Task Cancelled', 'The task was cancelled', 'warning');
  
  // Stop polling if active
  stopStatusPolling(data.task_id);
  
  // Remove from active tasks
  activeTasks.delete(data.task_id);
  
  // Clean up callbacks
  taskCallbacks.delete(data.task_id);
  
  // Clean up status requests
  taskStatusRequests.delete(data.task_id);
  
  // Clear session storage if this is the current task
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  if (storedTaskId === data.task_id) {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
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
    const progressBar = getElement('progress-bar');
    const progressStatus = getElement('progress-status');
    const progressStats = getElement('progress-stats');
    
    // Try for task-specific elements first
    const taskType = getTaskType(data.task_id);
    const typeProgressBar = getElement(`${taskType}-progress-bar`);
    const typeProgressStatus = getElement(`${taskType}-progress-status`);
    const typeProgressStats = getElement(`${taskType}-progress-stats`);
    
    // Update progress bar (use type-specific if available)
    const bar = typeProgressBar || progressBar;
    if (bar && typeof data.progress === 'number') {
      bar.style.width = `${data.progress}%`;
      bar.setAttribute('aria-valuenow', data.progress);
      bar.textContent = `${Math.round(data.progress)}%`;
      
      // Update contextual classes based on progress
      bar.classList.remove('bg-danger', 'bg-warning', 'bg-info');
      if (data.progress >= 100) {
        bar.classList.add('bg-success');
      } else if (data.progress >= 75) {
        bar.classList.add('bg-info');
      } else if (data.progress >= 25) {
        bar.classList.add('bg-primary');
      }
    }
    
    // Update status message
    const status = typeProgressStatus || progressStatus;
    if (status && data.message) {
      status.textContent = data.message;
    }
    
    // Update stats with basic info
    const stats = typeProgressStats || progressStats;
    if (stats && data.stats) {
      updateGenericStatsDisplay(stats, data.stats);
    }
  } catch (error) {
    console.error("Error updating generic progress:", error);
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
    } else if (stats.playlists) {
      // Playlist stats
      const total = stats.playlists.length || stats.total_playlists || 0;
      let totalVideos = 0;
      let downloadedVideos = 0;
      
      if (Array.isArray(stats.playlists)) {
        stats.playlists.forEach(playlist => {
          if (playlist.videos) {
            totalVideos += playlist.videos.length;
            downloadedVideos += playlist.videos.filter(v => v.status === 'completed').length;
          }
        });
      } else {
        totalVideos = stats.total_videos || 0;
        downloadedVideos = stats.processed_videos || 0;
      }
      
      html += `
        <div class="row">
          <div class="col-12 mb-2">
            <span class="badge bg-primary">Playlists: ${total}</span>
            <span class="badge bg-success mx-1">Downloaded: ${downloadedVideos}/${totalVideos}</span>
          </div>
        </div>
      `;
      
      // Show current video
      if (stats.current_video) {
        html += `
          <div class="text-truncate small mt-2">
            <i class="fas fa-video me-1"></i> ${stats.current_video}
          </div>
        `;
      }
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
 * Check for ongoing tasks when connection is established
 */
function checkForOngoingTasks() {
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  const taskType = sessionStorage.getItem('ongoingTaskType');
  
  if (storedTaskId) {
    console.log(`Found ongoing task: ${storedTaskId} (${taskType || 'unknown'})`);
    
    // Add to active tasks set
    activeTasks.add(storedTaskId);
    
    // Set current task ID for backward compatibility
    currentTaskId = storedTaskId;
    
    // Create task tracker for backward compatibility
    activeTaskTracker = createTaskTracker(storedTaskId);
    
    // Start status polling for this task
    startStatusPolling(storedTaskId);
    
    // Request initial status
    requestTaskStatus(storedTaskId);
    
    // Show notification
    showToast('Task Resumed', 'Reconnected to ongoing task', 'info');
    
    // Try to emit an event via event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('task.resumed', {
        task_id: storedTaskId,
        task_type: taskType || 'unknown'
      });
    }
  }
}

/**
 * Request task status via Socket.IO
 * @param {string} taskId - Task ID to get status for
 * @returns {boolean} - Whether the request was sent successfully
 */
function requestTaskStatus(taskId) {
  if (!taskId) return false;
  
  // Add to active tasks
  activeTasks.add(taskId);
  
  // Update current task ID for backward compatibility
  currentTaskId = taskId;
  
  // Track request time to prevent spam
  const now = Date.now();
  const lastRequest = taskStatusRequests.get(taskId) || 0;
  
  // Limit requests to once per second
  if (now - lastRequest < 1000) {
    return false;
  }
  
  taskStatusRequests.set(taskId, now);
  
  // Request via Socket.IO if available
  if (socket && connected) {
    try {
      socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
      console.log(`Requested status for task ${taskId} via Socket.IO`);
      return true;
    } catch (error) {
      console.warn(`Error requesting status via Socket.IO:`, error);
    }
  }
  
  // Fallback to HTTP API request
  fetchTaskStatus(taskId);
  return false;
}

/**
 * Fetch task status via HTTP API
 * @param {string} taskId - Task ID to get status for
 * @returns {Promise<boolean>} - Whether the status was fetched successfully
 */
async function fetchTaskStatus(taskId) {
  try {
    // Try multiple endpoints for better compatibility
    const endpoints = [
      `/api/task/status/${taskId}`,
      `/api/status/${taskId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          
          // Process the response
          if (data.status === 'completed') {
            handleTaskCompleted({
              task_id: taskId,
              ...data
            });
            return true;
          } else if (data.status === 'error' || data.status === 'failed') {
            handleTaskError({
              task_id: taskId,
              error: data.error || 'Task failed',
              ...data
            });
            return true;
          } else if (data.status === 'cancelled') {
            handleTaskCancelled({
              task_id: taskId,
              ...data
            });
            return true;
          } else if (data.progress !== undefined) {
            handleProgressUpdate({
              task_id: taskId,
              ...data
            });
            return true;
          }
          
          // We found a working endpoint, no need to try others
          break;
        }
      } catch (err) {
        console.warn(`Error fetching task status from ${endpoint}:`, err);
        // Continue to next endpoint
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error fetching task status for ${taskId}:`, error);
    return false;
  }
}

/**
 * Start polling for task status updates
 * @param {string} taskId - Task ID to poll for
 * @param {Object} callbacks - Optional callbacks for task events
 * @returns {boolean} - Whether polling was started successfully
 */
function startStatusPolling(taskId, callbacks = {}) {
  if (!taskId) return false;
  
  // Register callbacks
  if (Object.keys(callbacks).length > 0) {
    taskCallbacks.set(taskId, callbacks);
  }
  
  // Stop any existing polling
  stopStatusPolling(taskId);
  
  // Add to active tasks
  activeTasks.add(taskId);
  
  // Update current task ID for backward compatibility
  currentTaskId = taskId;
  
  // Create task tracker for backward compatibility if needed
  if (!activeTaskTracker || activeTaskTracker.taskId !== taskId) {
    activeTaskTracker = createTaskTracker(taskId);
  }
  
  // Start polling interval
  console.log(`Starting status polling for task ${taskId}`);
  requestTaskStatus(taskId); // Request immediately
  
  pollingIntervals[taskId] = setInterval(() => {
    requestTaskStatus(taskId);
  }, 2000); // Poll every 2 seconds
  
  return true;
}

/**
 * Stop polling for task status updates
 * @param {string} taskId - Task ID to stop polling for
 * @returns {boolean} - Whether polling was stopped successfully
 */
function stopStatusPolling(taskId) {
  if (!taskId) {
    // If no taskId provided, stop all polling (for backward compatibility)
    Object.keys(pollingIntervals).forEach(id => {
      clearInterval(pollingIntervals[id]);
      delete pollingIntervals[id];
    });
    return true;
  }
  
  if (!pollingIntervals[taskId]) return false;
  
  clearInterval(pollingIntervals[taskId]);
  delete pollingIntervals[taskId];
  console.log(`Stopped status polling for task ${taskId}`);
  
  return true;
}

/**
 * Cancel a task
 * @param {string} taskId - Task ID to cancel
 * @returns {Promise<boolean>} - Whether the task was cancelled successfully
 */
function cancelTask(taskId) {
  if (!taskId) return Promise.reject(new Error('No task ID provided'));
  
  console.log(`Cancelling task ${taskId}`);
  
  return new Promise((resolve, reject) => {
    let cancellationSent = false;
    
    // Try Socket.IO if available
    if (socket && connected) {
      try {
        socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.CANCEL_TASK, { task_id: taskId });
        console.log(`Sent cancel_task event via Socket.IO`);
        cancellationSent = true;
      } catch (error) {
        console.warn(`Error sending cancel via Socket.IO:`, error);
      }
    }
    
    // Also try HTTP API for redundancy
    const cancelEndpoints = [
      `/api/task/cancel/${taskId}`,
      `/api/cancel_task/${taskId}`,
      `/api/cancel_task` // POST endpoint
    ];
    
    // Try POST to the main cancel endpoint first
    fetch(`/api/cancel_task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task_id: taskId })
    })
    .then(response => {
      if (response.ok) {
        console.log(`Successfully cancelled task via POST /api/cancel_task`);
        cancellationSent = true;
        resolve(true);
      } else {
        // Try other endpoints
        tryOtherEndpoints();
      }
    })
    .catch(error => {
      console.warn(`Error with POST cancel endpoint:`, error);
      // Try other endpoints
      tryOtherEndpoints();
    });
    
    // Try other endpoints as fallback
    function tryOtherEndpoints() {
      Promise.all(cancelEndpoints.slice(0, 2).map(endpoint => {
        return fetch(endpoint, { method: 'POST' })
          .then(response => {
            if (response.ok) {
              console.log(`Successfully cancelled task via ${endpoint}`);
              cancellationSent = true;
              return true;
            } else {
              return false;
            }
          })
          .catch(() => false);
      }))
      .then(results => {
        if (results.some(result => result) || cancellationSent) {
          resolve(true);
        } else {
          reject(new Error('Failed to send cancellation request'));
        }
      });
    }
    
    // Emit event for other modules
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('socket.cancel_task', { task_id: taskId });
    }
    
    // Remove from active tasks
    activeTasks.delete(taskId);
    
    // Update current task ID for backward compatibility
    if (currentTaskId === taskId) {
      currentTaskId = null;
    }
    
    // Clean up polling
    stopStatusPolling(taskId);
    
    // Clean up task tracker for backward compatibility
    if (activeTaskTracker && activeTaskTracker.taskId === taskId) {
      activeTaskTracker = null;
    }
  });
}

/**
 * Get status of a task
 * @param {string} taskId - Task ID to get status for
 * @returns {Promise<Object>} - Task status data
 */
function getTaskStatus(taskId) {
  return new Promise((resolve, reject) => {
    if (!taskId) {
      reject(new Error('No task ID provided'));
      return;
    }
    
    // Try Socket.IO first if available
    if (socket && connected) {
      // Set up a one-time listener for the response
      const responseHandler = (data) => {
        if (data.task_id === taskId) {
          socket.off('task_status', responseHandler);
          resolve(data);
        }
      };
      
      socket.on('task_status', responseHandler);
      
      // Set a timeout to fall back to HTTP API if no response
      const timeout = setTimeout(() => {
        socket.off('task_status', responseHandler);
        fetchTaskStatusOnce();
      }, 2000);
      
      // Send the request
      try {
        socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.REQUEST_TASK_STATUS, { task_id: taskId });
        return;
      } catch (error) {
        console.warn(`Error requesting status via Socket.IO:`, error);
        clearTimeout(timeout);
        socket.off('task_status', responseHandler);
        fetchTaskStatusOnce();
      }
    } else {
      fetchTaskStatusOnce();
    }
    
    // Fetch status via HTTP API
    async function fetchTaskStatusOnce() {
      try {
        const endpoints = [
          `/api/task/status/${taskId}`,
          `/api/status/${taskId}`
        ];
        
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint);
            if (response.ok) {
              const data = await response.json();
              resolve({
                task_id: taskId,
                ...data
              });
              return;
            }
          } catch (err) {
            console.warn(`Error fetching from ${endpoint}:`, err);
          }
        }
        
        reject(new Error('Failed to get task status'));
      } catch (error) {
        reject(error);
      }
    }
  });
}

/**
 * Register task handler for events
 * @param {string} taskId - Task ID
 * @param {Object} handlers - Event handlers
 * @returns {boolean} - Whether registration was successful
 */
function registerTaskHandler(taskId, handlers) {
  if (!taskId) return false;
  
  // Add to active tasks
  activeTasks.add(taskId);
  
  // Register handlers
  taskCallbacks.set(taskId, handlers);
  
  return true;
}

/**
 * Register callbacks for task progress (backward compatibility)
 * @param {string} taskId - Task ID
 * @param {Object} callbacks - Callback functions
 */
function registerProgressCallbacks(taskId, callbacks = {}) {
  if (!taskId) return;
  
  const handlers = {
    onProgress: callbacks.onProgress || function() {},
    onComplete: callbacks.onComplete || function() {},
    onError: callbacks.onError || function() {},
    onCancel: callbacks.onCancelled || function() {}
  };
  
  taskCallbacks.set(taskId, handlers);
  console.log(`Registered progress callbacks for task ${taskId}`);
}

/**
 * Track a task with progress updates
 * @param {string} taskId - Task ID to track
 * @param {Object} options - Options for tracking
 * @returns {Object|null} - Task controller object or null if invalid
 */
function trackTask(taskId, options = {}) {
  if (!taskId) return null;
  
  // Add to active tasks
  activeTasks.add(taskId);
  
  // Update current task ID for backward compatibility
  currentTaskId = taskId;
  
  // Create task tracker for backward compatibility if needed
  if (!activeTaskTracker || activeTaskTracker.taskId !== taskId) {
    activeTaskTracker = createTaskTracker(taskId);
  }
  
  // Request initial status
  requestTaskStatus(taskId);
  
  // Start polling if not connected to socket
  if (!socket || !connected) {
    startStatusPolling(taskId);
  }
  
  // Return a controller object
  return {
    taskId,
    cancel: () => cancelTask(taskId),
    refresh: () => requestTaskStatus(taskId),
    stopTracking: () => {
      stopStatusPolling(taskId);
      activeTasks.delete(taskId);
      taskCallbacks.delete(taskId);
      if (currentTaskId === taskId) {
        currentTaskId = null;
      }
      if (activeTaskTracker && activeTaskTracker.taskId === taskId) {
        activeTaskTracker = null;
      }
    }
  };
}

/**
 * Check if a task is being tracked
 * @param {string} taskId - Task ID to check
 * @returns {boolean} - Whether the task is being tracked
 */
function isTaskTracked(taskId) {
  return activeTasks.has(taskId);
}

/**
 * Get all active tasks
 * @returns {Array<string>} - Array of active task IDs
 */
function getActiveTasks() {
  return Array.from(activeTasks);
}

/**
 * Clean up all tasks and intervals
 * @returns {boolean} - Whether cleanup was successful
 */
function cleanup() {
  // Clean up all polling intervals
  Object.keys(pollingIntervals).forEach(taskId => {
    clearInterval(pollingIntervals[taskId]);
    delete pollingIntervals[taskId];
  });
  
  // Clear ping interval
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  // Clear all tracking data
  activeTasks.clear();
  taskCallbacks.clear();
  taskStatusRequests.clear();
  
  // Clear backward compatibility variables
  currentTaskId = null;
  activeTaskTracker = null;
  
  return true;
}

/**
 * Determine task type from task ID or session storage
 * @param {string} taskId - Task ID
 * @returns {string} - Task type ('file', 'playlist', 'scraper')
 */
function getTaskType(taskId) {
  // Try to get from session storage first
  const storedTaskId = sessionStorage.getItem('ongoingTaskId');
  const storedType = sessionStorage.getItem('ongoingTaskType');
  
  if (storedTaskId === taskId && storedType) {
    return storedType;
  }
  
  // If not stored, guess based on active tab
  const fileTab = getElement('file-tab');
  const playlistTab = getElement('playlist-tab');
  const scraperTab = getElement('scraper-tab');
  
  if (fileTab && fileTab.classList.contains('active')) {
    return 'file';
  } else if (playlistTab && playlistTab.classList.contains('active')) {
    return 'playlist';
  } else if (scraperTab && scraperTab.classList.contains('active')) {
    return 'scraper';
  }
  
  // Default to 'task' if can't determine
  return 'task';
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
 * Disconnect from Socket.IO server
 */
function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    
    // Stop status polling
    Object.keys(pollingIntervals).forEach(taskId => {
      stopStatusPolling(taskId);
    });
    
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    // Clean up other state
    cleanup();
    
    // Update UI status
    updateSocketStatus('disconnected', 'Disconnected by user');
    
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
 * Get diagnostics information about the module state
 * @returns {Object} - Diagnostic information
 */
function getDiagnostics() {
  return {
    version: "2.0.0",
    initialized,
    connected,
    hasSocket: !!socket,
    connectionAttempts,
    reconnectAttempts,
    activeTasks: Array.from(activeTasks),
    activeTaskCount: activeTasks.size,
    callbacksCount: taskCallbacks.size,
    pollingIntervalsCount: Object.keys(pollingIntervals).length,
    eventRegistryAvailable: !!eventRegistry,
    waitingForDOM: waitForDOMInit,
    socketId: socket?.id,
    socketUrl: socket?.io?.uri,
    legacyActiveTask: currentTaskId,
    legacyTrackerActive: !!activeTaskTracker
  };
}

/**
 * Get current task ID from session storage
 * @returns {string|null} - Current task ID
 */
function getCurrentTaskId() {
  // First try from the current active task (backward compatibility)
  if (currentTaskId) {
    return currentTaskId;
  }
  
  // Then try from session storage
  return sessionStorage.getItem('ongoingTaskId');
}

/**
 * Get module state for debugging
 * @returns {Object} - Module state information
 */
function getState() {
  return {
    connected,
    reconnectAttempts,
    activeTasks: Array.from(activeTasks),
    hasSocket: !!socket,
    initialized,
    eventRegistryAvailable: !!eventRegistry,
    socketId: socket?.id,
    connectionUptime: connected ? formatDuration((Date.now() - (socket?._connectTime || Date.now())) / 1000) : 'Not connected',
    legacyActiveTask: currentTaskId,
    legacyTrackerActive: !!activeTaskTracker,
    legacyTrackerProgress: activeTaskTracker ? activeTaskTracker.progress : null
  };
}

/**
 * Cancel current task (backward compatibility)
 * @returns {Promise<boolean>} - Whether cancellation was successful
 */
function cancelCurrentTask() {
  const taskId = currentTaskId || sessionStorage.getItem('ongoingTaskId');
  
  if (!taskId) {
    console.warn("No active task to cancel");
    return Promise.resolve(false);
  }
  
  return cancelTask(taskId);
}

/**
 * Send a ping to keep the connection alive (backward compatibility)
 */
function sendPing() {
  if (!socket || !connected) return;
  
  socket.emit(SOCKET_EVENTS.CLIENT_TO_SERVER.PING, { timestamp: Date.now() });
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
  cancelTask,
  registerTaskHandler,
  trackTask,
  isTaskTracked,
  getActiveTasks,
  getCurrentTaskId,
  getTaskType,
  getTaskStatus,
  requestTaskStatus,
  
  // PDF-specific methods
  emitPdfDownloadStart,
  emitPdfProcessingRequest,
  
  // Keep-alive
  startPingInterval,
  sendPing,
  
  // Cleanup
  cleanup,
  
  // Diagnostics
  getDiagnostics,
  getState,
  
  // Backward compatibility
  cancelCurrentTask,
  registerProgressCallbacks
};

// Export named exports for compatibility with older code
export {
  initialize,
  connect,
  disconnect,
  isConnected,
  emit,
  startStatusPolling,
  stopStatusPolling,
  cancelTask,
  cancelCurrentTask,
  registerTaskHandler,
  registerProgressCallbacks,
  trackTask,
  isTaskTracked, 
  getActiveTasks,
  getCurrentTaskId,
  getTaskType,
  getTaskStatus,
  requestTaskStatus,
  emitPdfDownloadStart,
  emitPdfProcessingRequest,
  startPingInterval,
  sendPing,
  getDiagnostics,
  getState,
  cleanup
};

// Default export for the module
export default socketHandler;