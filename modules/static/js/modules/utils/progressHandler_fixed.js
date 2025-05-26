 key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Update stats display
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 */
function updateStatsDisplay(element, stats) {
  if (!element || !stats) return;

  try {
    // Create a formatted display of the stats
    let html = '<div class="stats-container p-2">';
    
    // Handle different types of stats
    if (stats.total_files !== undefined) {
      // File processing stats
      html += `
        <div class="row">
          <div class="col-md-6 mb-2">
            <span class="badge bg-primary">Files: ${stats.total_files || 0}</span>
            <span class="badge bg-success mx-1">Processed: ${stats.processed_files || 0}</span>
            <span class="badge bg-warning mx-1">Skipped: ${stats.skipped_files || 0}</span>
            <span class="badge bg-danger mx-1">Errors: ${stats.error_files || 0}</span>
          </div>
          <div class="col-md-6 mb-2">
            <span class="badge bg-info">Chunks: ${stats.total_chunks || 0}</span>
            ${stats.total_bytes ? `<span class="badge bg-secondary mx-1">Size: ${formatBytes(stats.total_bytes)}</span>` : ''}
          </div>
        </div>
      `;
      
      // Show duration if available
      if (stats.duration_seconds || stats.total_duration_seconds) {
        const duration = stats.duration_seconds || stats.total_duration_seconds || 0;
        html += `<div class="small text-muted">Duration: ${formatDuration(duration * 1000)}</div>`;
      }
      
      // Add current file if available
      if (stats.current_file) {
        html += `
          <div class="text-truncate small mt-2 current-file">
            <i class="fas fa-file-alt me-1"></i> ${stats.current_file}
          </div>
        `;
      }
    } else if (stats.pdf_downloads && Array.isArray(stats.pdf_downloads)) {
      // PDF download stats
      const completed = stats.pdf_downloads.filter(pdf => pdf.status === 'success').length;
      const downloading = stats.pdf_downloads.filter(pdf => pdf.status === 'downloading').length;
      const processing = stats.pdf_downloads.filter(pdf => pdf.status === 'processing').length;
      const failed = stats.pdf_downloads.filter(pdf => pdf.status === 'error').length;
      const total = stats.pdf_downloads.length;
      
      html += `
        <div class="row">
          <div class="col-12 mb-2">
            <span class="badge bg-primary">PDFs: ${total}</span>
            <span class="badge bg-success mx-1">Downloaded: ${completed}</span>
            <span class="badge bg-info mx-1">Downloading: ${downloading}</span>
            <span class="badge bg-secondary mx-1">Processing: ${processing}</span>
            <span class="badge bg-danger mx-1">Failed: ${failed}</span>
          </div>
        </div>
      `;
      
      // Add the most recent 3 PDFs being processed
      const recentPdfs = stats.pdf_downloads
        .filter(pdf => pdf.status === 'downloading' || pdf.status === 'processing')
        .slice(0, 3);
      
      if (recentPdfs.length > 0) {
        html += '<div class="pdf-list small">';
        recentPdfs.forEach(pdf => {
          const fileName = pdf.fileName || getFileNameFromPath(pdf.url || '');
          html += `
            <div class="pdf-download-item">
              <div class="d-flex justify-content-between">
                <div class="text-truncate" title="${fileName}">
                  <i class="fas fa-file-pdf me-1"></i> ${fileName}
                </div>
                <span class="badge ${pdf.status === 'downloading' ? 'bg-info' : 'bg-secondary'}">${pdf.status}</span>
              </div>
              ${pdf.progress ? `<div class="progress">
                <div class="progress-bar ${pdf.status === 'downloading' ? 'bg-info' : 'bg-secondary'}" style="width: ${pdf.progress}%"></div>
              </div>` : ''}
            </div>
          `;
        });
        html += '</div>';
      }
      
      // Show summary of completed PDFs
      if (completed > 0) {
        html += `<div class="text-muted small mt-2">Completed PDFs: ${completed} files</div>`;
      }
    } else {
      // Generic stats - display key-value pairs
      html += '<div class="row">';
      
      // Process stats keys, show the most important ones first
      const priorityKeys = ['total_files', 'processed_files', 'total_chunks', 'total_bytes', 'duration_seconds'];
      const processedKeys = new Set();
      
      // First show priority keys
      priorityKeys.forEach(key => {
        if (stats[key] !== undefined) {
          const value = formatStatValue(key, stats[key]);
          const label = formatStatLabel(key);
          
          html += `
            <div class="col-6 col-md-4 mb-1">
              <small>${label}:</small>
              <span class="fw-bold">${value}</span>
            </div>
          `;
          
          processedKeys.add(key);
        }
      });
      
      // Then show remaining keys
      Object.entries(stats).forEach(([key, value]) => {
        // Skip already processed keys, hidden keys, and complex objects
        if (processedKeys.has(key) || key.startsWith('_') || key.startsWith('hidden_') || 
            typeof value === 'object' || typeof value === 'function') {
          return;
        }
        
        const formattedValue = formatStatValue(key, value);
        const label = formatStatLabel(key);
        
        html += `
          <div class="col-6 col-md-4 mb-1">
            <small>${label}:</small>
            <span class="fw-bold">${formattedValue}</span>
          </div>
        `;
        
        processedKeys.add(key);
      });
      
      html += '</div>';
    }
    
    html += '</div>';
    
    // Update the element
    element.innerHTML = html;
  } catch (error) {
    console.error("Error updating stats display:", error);
    // Provide simple fallback
    try {
      element.innerHTML = '<div class="alert alert-warning">Error displaying stats</div>';
    } catch (e) {
      // Ignore if can't even update with error message
    }
  }
}

/**
 * Set up progress tracking for a task
 * @param {string} taskId - Unique task ID
 * @param {Object} options - Setup options
 * @param {string} options.elementPrefix - Prefix for DOM elements
 * @param {boolean} options.saveToSessionStorage - Whether to save task info to session storage
 * @param {string} options.taskType - Type of task (for session storage)
 * @returns {Object} - Progress handler APIs
 */
function setupTaskProgress(taskId, options = {}) {
  if (!taskId) {
    console.error('Task ID required for progress tracking');
    return null;
  }
  
  console.log(`Setting up progress tracking for task ${taskId}`);
  
  // Create task info
  const taskInfo = {
    id: taskId,
    progress: 0,
    status: 'pending',
    startTime: getTimestamp(),
    elementPrefix: options.elementPrefix || '',
    type: options.taskType || 'unknown',
    options
  };
  
  // Save to active tasks map
  state.activeTasks.set(taskId, taskInfo);
  
  // Save to session storage if requested
  if (options.saveToSessionStorage && options.taskType) {
    sessionStorage.setItem('ongoingTaskId', taskId);
    sessionStorage.setItem('ongoingTaskType', options.taskType);
    sessionStorage.setItem('taskStartTime', taskInfo.startTime.toString());
    console.log(`Saved task ${taskId} (${options.taskType}) to session storage`);
  }
  
  // Try to set up initial UI elements
  const elements = getUIElements(options.elementPrefix);
  
  // Create progress UI if container exists but progress bar doesn't
  if (!elements.progressBar) {
    const containerPrefix = options.elementPrefix ? 
      `${options.elementPrefix}-progress-container` : 
      'progress-container';
    
    const container = document.getElementById(containerPrefix);
    if (container) {
      createProgressUI(container.id, options.elementPrefix || '');
    }
  }
  
  // Initialize progress rates tracking
  state.progressRates.set(taskId, []);
  state.lastUpdateTimes.set(taskId, getTimestamp());
  
  // Initialize task progress info
  state.taskProgressInfo.set(taskId, {
    startTime: getTimestamp(),
    updateCount: 0,
    totalProgressChange: 0,
    avgProgressRate: 0
  });
  
  // Set up status polling
  if (window.socket && state.connectionState.connected) {
    // Request initial status
    window.socket.emit('request_task_status', {
      task_id: taskId,
      timestamp: Date.now() / 1000
    });
  } else {
    // Start manual polling
    startManualStatusPolling(taskId);
  }
  
  // Set up task event handlers
  setupTaskEventHandlers(taskId, options);
  
  // Return handler functions
  return {
    /**
     * Update progress for the task
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} message - Status message
     * @param {Object} stats - Optional statistics
     */
    updateProgress: (progress, message, stats = null) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main update method
      updateTaskProgress(taskId, progress, message, stats);
    },
    
    /**
     * Mark task as completed
     * @param {Object} result - Task completion result
     */
    complete: (result) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main complete method
      completeTask(taskId, result);
    },
    
    /**
     * Mark task as failed
     * @param {Error|string} error - Error that occurred
     * @param {Object} data - Additional error data
     */
    error: (error, data = {}) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main error method
      errorTask(taskId, error, data);
    },
    
    /**
     * Cancel the task
     */
    cancel: () => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main cancel method
      cancelTask(taskId);
    },
    
    /**
     * Get current task status
     * @returns {Object} - Task status info
     */
    getStatus: () => {
      if (!state.activeTasks.has(taskId)) {
        return { status: 'unknown', message: 'Task not found' };
      }
      
      const task = state.activeTasks.get(taskId);
      return {
        id: taskId,
        progress: task.progress,
        status: task.status,
        message: task.message,
        startTime: task.startTime,
        lastUpdate: task.lastUpdate,
        endTime: task.endTime,
        stats: task.stats || {}
      };
    }
  };
}

/**
 * Set up event handlers for a specific task - ENHANCED for better event alignment
 * @param {string} taskId - Task ID
 * @param {Object} options - Task options
 */
function setupTaskEventHandlers(taskId, options) {
  const handlers = {
    socketHandlers: {},
    eventRegistry: {},
    dom: {}
  };
  
  // Set up Socket.IO handlers if available
  if (window.socket) {
    // CRITICAL FIX: Unified progress handler for all event types
    const progressHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`Progress update for ${taskId}: ${data.progress}%`);
        updateTaskProgress(taskId, data.progress, data.message, data.stats);
      }
    };
    
    // Task completed handler
    const completedHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`Task completed: ${taskId}`);
        completeTask(taskId, data);
      }
    };
    
    // Task error handler
    const errorHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`Task error: ${taskId}`);
        errorTask(taskId, data.error || 'Unknown error', data);
      }
    };
    
    // Task cancelled handler
    const cancelledHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`Task cancelled: ${taskId}`);
        cancelTask(taskId);
      }
    };
    
    // CRITICAL FIX: Register ALL possible event names that backend might emit
    const progressEvents = [
      'progress_update',
      'task_progress', 
      'file_processing_progress',
      'playlist_progress',
      'web_scraping_progress',
      'pdf_download_progress',
      'pdf_processing_progress'
    ];
    
    const completionEvents = [
      'task_completed',
      'file_processing_completed', 
      'playlist_completed',
      'web_scraping_completed',
      'pdf_download_complete',
      'pdf_processing_complete'
    ];
    
    const errorEvents = [
      'task_error',
      'file_processing_error',
      'playlist_error', 
      'web_scraping_error',
      'pdf_download_error',
      'pdf_processing_error'
    ];
    
    const cancelEvents = [
      'task_cancelled',
      'file_processing_cancelled',
      'playlist_cancelled',
      'web_scraping_cancelled'
    ];
    
    // Register all progress events
    progressEvents.forEach(event => {
      window.socket.on(event, progressHandler);
      handlers.socketHandlers[event] = progressHandler;
    });
    
    // Register all completion events
    completionEvents.forEach(event => {
      window.socket.on(event, completedHandler);
      handlers.socketHandlers[event] = completedHandler;
    });
    
    // Register all error events
    errorEvents.forEach(event => {
      window.socket.on(event, errorHandler);
      handlers.socketHandlers[event] = errorHandler;
    });
    
    // Register all cancel events
    cancelEvents.forEach(event => {
      window.socket.on(event, cancelledHandler);
      handlers.socketHandlers[event] = cancelledHandler;
    });
    
    // Also register type-specific handlers if task type is provided
    if (options.taskType) {
      const typeSpecificEvents = [
        `${options.taskType}_progress`,
        `${options.taskType}_completed`,
        `${options.taskType}_error`,
        `${options.taskType}_cancelled`
      ];
      
      typeSpecificEvents.forEach(event => {
        if (event.includes('progress')) {
          window.socket.on(event, progressHandler);
          handlers.socketHandlers[event] = progressHandler;
        } else if (event.includes('completed')) {
          window.socket.on(event, completedHandler);
          handlers.socketHandlers[event] = completedHandler;
        } else if (event.includes('error')) {
          window.socket.on(event, errorHandler);
          handlers.socketHandlers[event] = errorHandler;
        } else if (event.includes('cancelled')) {
          window.socket.on(event, cancelledHandler);
          handlers.socketHandlers[event] = cancelledHandler;
        }
      });
    }
  }
  
  // Set up DOM event handlers if needed
  const prefix = options.elementPrefix ? `${options.elementPrefix}-` : '';
  const cancelButton = document.getElementById(`${prefix}cancel-btn`);
  
  if (cancelButton) {
    const cancelHandler = (e) => {
      e.preventDefault();
      cancelTask(taskId);
    };
    
    cancelButton.addEventListener('click', cancelHandler);
    
    handlers.dom[`#${prefix}cancel-btn`] = {
      'click': cancelHandler
    };
  }
  
  // Store all handlers for cleanup later
  state.eventHandlers.set(taskId, handlers);
}

/**
 * Cancel tracking for a specific task
 * @param {string} taskId - Task ID to stop tracking
 * @returns {boolean} - Whether cancellation was successful
 */
function cancelTracking(taskId) {
  try {
    console.log(`Cancelling progress tracking for task ${taskId}`);
    
    // Clean up event listeners
    cleanupEventListeners(taskId);
    
    // Stop status polling if it exists
    stopStatusPolling(taskId);
    
    // Remove from completed tasks set to allow re-tracking
    if (state.completedTaskIds) {
      state.completedTaskIds.delete(taskId);
    }
    
    // Remove from progress tracking maps
    state.progressRates.delete(taskId);
    state.lastUpdateTimes.delete(taskId);
    state.taskProgressInfo.delete(taskId);
    
    // If socket is available, emit event to server
    if (window.socket && state.connectionState.connected) {
      window.socket.emit('cancel_tracking', {
        task_id: taskId,
        timestamp: Date.now() / 1000
      });
    }
    
    console.log(`Progress tracking cancelled for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`Error cancelling tracking for task ${taskId}:`, error);
    return false;
  }
}

/**
 * Track progress from socket events
 * @param {string} taskId - Task ID
 * @param {Object} options - Options
 * @returns {Object} - Progress tracking functions
 */
function trackProgress(taskId, options = {}) {
  if (!taskId) {
    console.error('Task ID required for progress tracking');
    return null;
  }

  // Set up progress tracking
  const progressHandler = setupTaskProgress(taskId, options);

  // Request initial status via socket if available
  if (window.socket && state.connectionState.connected) {
    try {
      window.socket.emit('request_task_status', {
        task_id: taskId,
        timestamp: Date.now() / 1000
      });
    } catch (err) {
      console.warn('Error requesting initial status via socket:', err);
    }
  }

  return {
    ...progressHandler,
    
    /**
     * Cancel tracking and cleanup event handlers
     */
    cancelTracking: () => {
      // Use the exported cancelTracking function
      return cancelTracking(taskId);
    }
  };
}

/**
 * Update task's progress - CRITICAL FIX for stuck progress
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {Object} stats - Optional statistics
 */
function updateTaskProgress(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update unknown task: ${taskId}`);
    return;
  }

  const task = state.activeTasks.get(taskId);

  // CRITICAL FIX: Remove smoothing and backward progress prevention that caused stuck progress
  // Ensure progress is a valid number
  progress = Math.max(0, Math.min(100, Number(progress) || 0));

  // Update task info directly
  task.progress = progress;
  task.message = message;
  task.lastUpdate = getTimestamp();
  task.status = stats?.status || (progress >= 100 ? 'completed' : 'running');

  if (stats) task.stats = stats;

  // Update progress rates for ETA calculation
  updateProgressRate(taskId, progress);

  // Update UI immediately
  updateProgressUI(taskId, progress, message, stats);

  // CRITICAL FIX: Immediate completion detection
  if (progress >= 100 || (stats && stats.status === "completed")) {
    if (!state.completedTaskIds.has(taskId)) {
      console.log(`Task ${taskId} reached 100% - completing immediately`);
      // Complete immediately, no delay
      completeTask(taskId, {
        ...task,
        output_file: task.outputPath || stats?.output_file || null
      });
    }
  }
}

/**
 * Update progress UI for a task - SIMPLIFIED to prevent stuck progress
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {Object} stats - Optional statistics
 * @returns {boolean} - Success
 */
function updateProgressUI(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update UI for unknown task: ${taskId}`);
    return false;
  }

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Update task progress info counter
  const info = state.taskProgressInfo.get(taskId) || {
    startTime: getTimestamp(),
    updateCount: 0,
    totalProgressChange: 0,
    avgProgressRate: 0
  };
  info.updateCount++;
  state.taskProgressInfo.set(taskId, info);
  
  // CRITICAL FIX: Direct progress assignment - no smoothing or clamping
  const displayProgress = Math.max(0, Math.min(100, progress));

  // Update progress bar with direct assignment
  if (elements.progressBar) {
    // CRITICAL FIX: Direct width assignment to prevent stuck progress
    applyProgressBarAnimation(elements.progressBar, 0, displayProgress);
    
    // Update contextual classes based on progress
    elements.progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info');
    
    if (displayProgress >= 100) {
      elements.progressBar.classList.add('bg-success', 'progress-bar-complete');
    } else if (displayProgress >= 75) {
      elements.progressBar.classList.add('bg-info');
    } else {
      elements.progressBar.classList.add('bg-primary');
    }
  }

  // Update status message
  if (elements.progressStatus && message) {
    elements.progressStatus.textContent = message;
  }

  // Update ETA display
  if (elements.etaDisplay) {
    const eta = calculateETA(taskId, displayProgress);
    if (eta.timeRemaining) {
      elements.etaDisplay.textContent = `ETA: ${formatDuration(eta.timeRemaining)}`;
      elements.etaDisplay.classList.remove('d-none');
    } else if (displayProgress >= 100) {
      elements.etaDisplay.textContent = 'Complete';
      elements.etaDisplay.classList.remove('d-none');
    } else {
      elements.etaDisplay.classList.add('d-none');
    }
  }

  // Update elapsed time
  if (elements.elapsedTime && task.startTime) {
    const elapsed = getTimestamp() - task.startTime;
    elements.elapsedTime.textContent = `Elapsed: ${formatDuration(elapsed)}`;
  }

  // Update stats if available
  if (elements.progressStats && stats) {
    updateStatsDisplay(elements.progressStats, stats);
  }

  return true;
}

/**
 * Complete a task - ENHANCED for immediate completion
 * @param {string} taskId - Task ID
 * @param {Object} result - Task result
 */
function completeTask(taskId, result) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot complete unknown task: ${taskId}`);
    return;
  }

  // Check if task has already been completed to prevent duplicates
  if (state.completedTaskIds.has(taskId)) {
    console.log(`Task ${taskId} already marked as completed, ignoring duplicate completion event`);
    return;
  }

  // Mark this task as completed to prevent duplicate completions
  state.completedTaskIds.add(taskId);

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Set task as completed
  task.progress = 100;
  task.status = 'completed';
  task.result = result;
  task.endTime = getTimestamp();

  // Process stats if available
  if (result && result.stats) {
    // Handle string stats objects (parse if needed)
    if (typeof result.stats === 'string') {
      try {
        task.stats = JSON.parse(result.stats);
      } catch (e) {
        console.warn(`Could not parse stats string: ${e}`);
        task.stats = { error: "Could not parse stats" };
      }
    } else {
      task.stats = result.stats;
    }
  }

  // CRITICAL FIX: Force progress bar to 100% immediately
  if (elements.progressBar) {
    applyProgressBarAnimation(elements.progressBar, 0, 100);
    
    elements.progressBar.classList.remove('bg-danger', 'bg-warning');
    elements.progressBar.classList.add('bg-success', 'progress-bar-complete');
  }

  // Update status message
  if (elements.progressStatus) {
    const completionMessage = result.message || "Task completed successfully";
    elements.progressStatus.textContent = completionMessage;
    elements.progressStatus.classList.remove('text-danger', 'text-warning');
    elements.progressStatus.classList.add('text-success');
  }

  // Update ETA display
  if (elements.etaDisplay) {
    elements.etaDisplay.textContent = 'Complete';
    elements.etaDisplay.classList.add('text-success');
  }

  // Update elapsed time
  if (elements.elapsedTime) {
    const elapsed = getTimestamp() - task.startTime;
    elements.elapsedTime.textContent = `Total time: ${formatDuration(elapsed)}`;
  }

  // Update stats display if we have result stats
  if (elements.progressStats && result && result.stats) {
    updateStatsDisplay(elements.progressStats, result.stats);
  }

  // Stop status polling
  stopStatusPolling(taskId);

  // Clear session storage
  if (task.options && task.options.saveToSessionStorage) {
    // Record completion time to prevent reload loops
    sessionStorage.setItem('taskCompletionTime', getTimestamp().toString());
    
    // Remove task tracking
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
    console.log(`Cleared session storage for completed task ${taskId}`);
  }

  // Add to history
  addTaskToHistory(taskId, result, 'completed');

  // Clean up event listeners
  cleanupEventListeners(taskId);
  
  // Remove from active tasks after a delay
  setTimeout(() => {
    state.activeTasks.delete(taskId);
  }, 1000);
}

/**
 * Mark a task as failed
 * @param {string} taskId - Task ID
 * @param {Error|string} error - Error that occurred
 * @param {Object} data - Additional error data
 */
function errorTask(taskId, error, data = {}) {
  // Enhanced validation
  if (!taskId) {
    console.error("Cannot mark error - no task ID provided");
    return;
  }
  
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot mark unknown task as error: ${taskId}`);
    return;
  }

  // Skip if this task is already marked with an error
  if (state.taskErrors.has(taskId)) {
    console.log(`Task ${taskId} already has an error, skipping duplicate error`);
    return;
  }
  
  // Mark this task as having an error
  state.taskErrors.set(taskId, {
    error: error,
    timestamp: getTimestamp(),
    data: data
  });

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Update task state
  task.status = 'error';
  task.error = error;
  task.errorData = data;
  task.endTime = getTimestamp();

  // Update progress bar
  if (elements.progressBar) {
    elements.progressBar.classList.remove('bg-primary', 'bg-success', 'bg-warning', 'progress-bar-complete');
    elements.progressBar.classList.add('bg-danger', 'progress-bar-error');
  }

  // Update status message
  if (elements.progressStatus) {
    const errorMessage = typeof error === 'string' ? error : 
                        (error.message || 'Unknown error');
    
    elements.progressStatus.textContent = `Error: ${errorMessage}`;
    elements.progressStatus.classList.remove('text-warning');
    elements.progressStatus.classList.add('text-danger');
  }

  // Update ETA display
  if (elements.etaDisplay) {
    elements.etaDisplay.textContent = 'Failed';
    elements.etaDisplay.classList.add('text-danger');
  }

  // Stop status polling
  stopStatusPolling(taskId);

  // Clear session storage
  if (task.options && task.options.saveToSessionStorage) {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
  }

  // Add to history
  addTaskToHistory(taskId, {
    ...data,
    error: typeof error === 'string' ? error : (error.message || 'Unknown error')
 }, 'error');

 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Remove from active tasks after a delay
 setTimeout(() => {
   state.activeTasks.delete(taskId);
 }, 1000);
}

/**
* Cancel a task
* @param {string} taskId - Task ID
*/
function cancelTask(taskId) {
 if (!state.activeTasks.has(taskId)) {
   console.warn(`Cannot cancel unknown task: ${taskId}`);
   return;
 }

 const task = state.activeTasks.get(taskId);
 const elements = getUIElements(task.elementPrefix);

 // Update task state
 task.status = 'cancelled';
 task.endTime = getTimestamp();

 // Update progress bar
 if (elements.progressBar) {
   elements.progressBar.classList.remove('bg-primary', 'bg-success', 'bg-danger', 'progress-bar-complete');
   elements.progressBar.classList.add('bg-warning');
 }

 // Update status message
 if (elements.progressStatus) {
   elements.progressStatus.textContent = 'Task cancelled';
   elements.progressStatus.classList.remove('text-danger');
   elements.progressStatus.classList.add('text-warning');
 }

 // Update ETA display
 if (elements.etaDisplay) {
   elements.etaDisplay.textContent = 'Cancelled';
   elements.etaDisplay.classList.add('text-warning');
 }

 // Stop status polling
 stopStatusPolling(taskId);

 // Clear session storage
 if (task.options && task.options.saveToSessionStorage) {
   sessionStorage.removeItem('ongoingTaskId');
   sessionStorage.removeItem('ongoingTaskType');
   sessionStorage.removeItem('taskStartTime');
 }

 // Add to history
 addTaskToHistory(taskId, {}, 'cancelled');

 // Also try to send an API request to cancel the task on the server
 sendCancelRequest(taskId);

 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Remove from active tasks after a delay
 setTimeout(() => {
   state.activeTasks.delete(taskId);
 }, 1000);
}

/**
* Send cancel request to the server
* @param {string} taskId - Task ID
*/
async function sendCancelRequest(taskId) {
 try {
   // First try to cancel via socket
   if (window.socket && state.connectionState.connected) {
     window.socket.emit('cancel_task', { 
       task_id: taskId,
       timestamp: Date.now() / 1000,
       reason: 'User cancelled'
     });
   }
   
   // Also send an HTTP request as backup
   const response = await fetch(`/api/cancel_task/${taskId}`, {
     method: 'POST'
   });
   
   if (!response.ok) {
     console.warn(`Failed to send cancel request: ${response.status}`);
   }
 } catch (error) {
   console.error("Error sending cancel request:", error);
 }
}

/**
* Get task details
* @param {string} taskId - Task ID
* @returns {Object|null} - Task details or null if not found
*/
function getTaskDetails(taskId) {
 if (!state.activeTasks.has(taskId)) {
   return null;
 }
 
 const task = state.activeTasks.get(taskId);
 return {
   id: taskId,
   progress: task.progress,
   status: task.status,
   message: task.message,
   stats: task.stats || {},
   startTime: task.startTime,
   endTime: task.endTime,
   error: task.error,
   type: task.type
 };
}

/**
* Clear task history
*/
function clearTaskHistory() {
 state.completedTasks = [];
 state.failedTasks = [];
 saveTaskHistory();
}

/**
* Force reset a task's state - use with caution
* @param {string} taskId - Task ID
*/
function forceResetTask(taskId) {
 // Remove from active tasks
 state.activeTasks.delete(taskId);
 
 // Remove from completed tasks set
 state.completedTaskIds.delete(taskId);
 
 // Remove from error tasks map
 state.taskErrors.delete(taskId);
 
 // Stop any polling
 stopStatusPolling(taskId);
 
 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Clear any intervals
 if (state.statusPollingIntervals.has(taskId)) {
   clearInterval(state.statusPollingIntervals.get(taskId));
   state.statusPollingIntervals.delete(taskId);
 }
 
 // Clear from progress rates
 state.progressRates.delete(taskId);
 state.lastUpdateTimes.delete(taskId);
 state.taskProgressInfo.delete(taskId);
 
 // Clear from session storage if it matches
 const currentTaskId = sessionStorage.getItem('ongoingTaskId');
 if (currentTaskId === taskId) {
   sessionStorage.removeItem('ongoingTaskId');
   sessionStorage.removeItem('ongoingTaskType');
   sessionStorage.removeItem('taskStartTime');
 }
}

/**
* Reset all state - use with caution
*/
function resetAllState() {
 // Clear active tasks
 state.activeTasks.clear();
 
 // Clear completed tasks set
 state.completedTaskIds.clear();
 
 // Clear error tasks map
 state.taskErrors.clear();
 
 // Stop all polling
 for (const intervalId of state.statusPollingIntervals.values()) {
   clearInterval(intervalId);
 }
 state.statusPollingIntervals.clear();
 
 // Clear all event listeners
 for (const taskId of state.eventHandlers.keys()) {
   cleanupEventListeners(taskId);
 }
 
 // Clear progress tracking
 state.progressRates.clear();
 state.lastUpdateTimes.clear();
 state.taskProgressInfo.clear();
 
 // Clear task history
 state.completedTasks = [];
 state.failedTasks = [];
 saveTaskHistory();
 
 // Clear session storage
 sessionStorage.removeItem('ongoingTaskId');
 sessionStorage.removeItem('ongoingTaskType');
 sessionStorage.removeItem('taskStartTime');
 
 console.log("Progress handler state reset");
}

// Export the module
export default initProgressHandler;
export {
 setupTaskProgress,
 trackProgress,
 updateTaskProgress,
 updateProgressUI,
 completeTask,
 errorTask,
 cancelTask,
 createProgressUI,
 formatDuration,
 calculateETA,
 formatBytes,
 updateStatsDisplay,
 cancelTracking
};