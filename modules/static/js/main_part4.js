// =============================================================================
// SECTION 13: INITIALIZATION & DOM READY
// =============================================================================

/**
 * Get references to all UI elements after DOM is loaded
 */
/**
 * Enhanced getUIElements function with better error handling
 * This will ensure elements are properly detected and provide fallbacks
 */
function getUIElements() {
  console.log("Getting UI element references with improved error handling...");
  
  try {
    // ---- File Processing Tab ----
    inputDirField = safeGetElement('input-dir');
    outputFileField = safeGetElement('output-file');
    submitBtn = safeGetElement('submit-btn');
    browseBtn = safeGetElement('browse-btn');
    cancelBtn = safeGetElement('cancel-btn');
    openBtn = safeGetElement('open-btn');
    newTaskBtn = safeGetElement('new-task-btn');
    retryBtn = safeGetElement('retry-btn');
    formContainer = safeGetElement('form-container');
    progressContainer = safeGetElement('progress-container');
    resultContainer = safeGetElement('result-container');
    errorContainer = safeGetElement('error-container');
    progressBar = safeGetElement('progress-bar');
    progressStatus = safeGetElement('progress-status');
    progressStats = safeGetElement('progress-stats');
    resultStats = safeGetElement('result-stats');
    errorMessage = safeGetElement('error-message');
    errorDetails = safeGetElement('error-details');
    processForm = safeGetElement('process-form');
    pathInfo = safeGetElement('path-info');
    pathInfoText = safeGetElement('.path-info-text', true);
    
    // ---- Playlist Tab ----
    playlistForm = safeGetElement('playlist-form');
    playlistFormContainer = safeGetElement('playlist-form-container');
    playlistUrlsContainer = safeGetElement('playlist-urls-container');
    playlistRootField = safeGetElement('playlist-root');
    playlistOutputField = safeGetElement('playlist-output');
    playlistSubmitBtn = safeGetElement('playlist-submit-btn');
    playlistProgressContainer = safeGetElement('playlist-progress-container');
    playlistProgressBar = safeGetElement('playlist-progress-bar');
    playlistProgressStatus = safeGetElement('playlist-progress-status');
    playlistProgressStats = safeGetElement('playlist-progress-stats');
    playlistCancelBtn = safeGetElement('playlist-cancel-btn');
    playlistResultsContainer = safeGetElement('playlist-results-container');
    playlistStats = safeGetElement('playlist-stats');
    playlistNewTaskBtn = safeGetElement('playlist-new-task-btn');
    openPlaylistJsonBtn = safeGetElement('open-playlist-json');
    addPlaylistBtn = safeGetElement('add-playlist-btn');
    
    // ---- Web Scraper Tab ---- 
    // Fix ID reference to match HTML - this was likely the issue
    scraperForm = safeGetElement('scraper-form');
    scraperFormContainer = safeGetElement('scraper-form-container');
    scraperUrlsContainer = safeGetElement('scraper-urls-container');
    scraperOutputField = safeGetElement('scraper-output');
    downloadDirectoryField = safeGetElement('download-directory');
    downloadDirBrowseBtn = safeGetElement('download-dir-browse-btn');
    scraperProgressContainer = safeGetElement('scraper-progress-container');
    scraperProgressBar = safeGetElement('scraper-progress-bar');
    scraperProgressStatus = safeGetElement('scraper-progress-status');
    scraperProgressStats = safeGetElement('scraper-progress-stats');
    scraperCancelBtn = safeGetElement('scraper-cancel-btn');
    scraperResultsContainer = safeGetElement('scraper-results-container');
    scraperResults = safeGetElement('scraper-results');
    scraperStats = safeGetElement('scraper-stats');
    openScraperJsonBtn = safeGetElement('open-scraper-json');
    scraperNewTaskBtn = safeGetElement('scraper-new-task-btn');
    openOutputFolderBtn = safeGetElement('open-output-folder');
    addScraperUrlBtn = safeGetElement('add-scraper-url');
    pdfInfoSection = safeGetElement('pdf-info-section');
    pdfDownloadProgress = safeGetElement('pdf-download-progress');
    pdfDownloadsList = safeGetElement('pdf-downloads-list');
    processPdfSwitch = safeGetElement('process-pdf-switch');
    
    // ---- History Tab ----
    historyTableBody = safeGetElement('history-table-body');
    historySearch = safeGetElement('history-search');
    historyFilter = safeGetElement('history-filter');
    historySort = safeGetElement('history-sort');
    historyRefreshBtn = safeGetElement('history-refresh-btn');
    historyClearBtn = safeGetElement('history-clear-btn');
    taskDetailsModal = safeGetElement('task-details-modal');
    pdfSummariesContainer = safeGetElement('pdf-summaries-container');
    
    // Run element validation to populate debug panel
    validateUIElements();
    
    console.log("UI element references acquired");
  } catch (e) {
    console.error("Error during UI element initialization:", e);
    
    // Even if we have errors, let's run validation to populate the debug panel
    validateUIElements();
  }
}


/**
 * This function must be called immediately after getUIElements()
 * to ensure any missing elements are handled before event listeners are set up
 */
function ensureCriticalElements() {
  // Call validateUIElements to check if all critical elements exist
  const allValid = validateUIElements();
  
  if (!allValid) {
    console.log("Some critical UI elements are missing. Attempting to fix...");
    
    // Fix for scraperUrlsContainer
    if (!scraperUrlsContainer && document.getElementById('scraper-form-container')) {
      const scraperFormElem = document.getElementById('scraper-form-container').querySelector('form') || 
                             document.getElementById('scraper-form');
      
      if (scraperFormElem) {
        console.log("Creating scraperUrlsContainer");
        
        // Create the element with the right ID
        const container = document.createElement('div');
        container.id = 'scraper-urls-container';
        
        // Add initial URL field
        container.innerHTML = `
          <div class="input-group mb-2">
            <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required />
            <select class="form-select scraper-settings" style="max-width: 160px;">
              <option value="full">Full Text</option>
              <option value="metadata">Metadata Only</option>
              <option value="title">Title Only</option>
              <option value="keyword">Keyword Search</option>
              <option value="pdf">PDF Download</option>
            </select>
            <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
            <button type="button" class="btn btn-outline-danger remove-url">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `;
        
        // Try to find where to insert it
        const insertPoint = scraperFormElem.querySelector('.mb-4');
        if (insertPoint) {
          insertPoint.appendChild(container);
        } else {
          // Fallback: add at the beginning of the form
          scraperFormElem.prepend(container);
        }
        
        // Update the global reference
        scraperUrlsContainer = container;
        console.log("Created scraperUrlsContainer element");
      }
    }
    
    // Re-validate to update debug panel
    validateUIElements();
  }
}


/**
 * Configure progress emission rate limiting
 * @param {Object} options - Rate limiting options
 */
function emitProgressWithRateLimiting(options) {
  if (!options) return;
  
  if (options.enabled !== undefined) {
    progressRateLimit.enabled = !!options.enabled;
  }
  
  if (options.minInterval !== undefined && !isNaN(options.minInterval)) {
    progressRateLimit.minInterval = Math.max(100, options.minInterval);
  }
  
  if (options.maxUpdatesPerMinute !== undefined && !isNaN(options.maxUpdatesPerMinute)) {
    progressRateLimit.maxUpdatesPerMinute = Math.max(1, Math.min(120, options.maxUpdatesPerMinute));
  }
  
  console.log("Progress rate limiting configured:", progressRateLimit);
}

/**
 * Progress simulation state and functions
 */
const progressSimulation = {
  active: false,
  interval: null,
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  updateFrequency: 1000,
  nonLinear: true
};

/**
 * Set up Socket.IO event handlers for progress updates with robust error handling and fallback
 * Combines the best of both implementations to ensure maximum reliability for all tabs
 */
function setupProgressSocketHandler() {
  // Track setup status to prevent duplicate handlers
  if (window._socketHandlersInitialized) {
    console.log("Socket handlers already initialized, skipping duplicate setup");
    return;
  }
  
  // Handle the case when socket is unavailable - use HTTP polling as fallback
  if (!window.socket) {
    console.warn("Socket.IO not available for progress updates - Using HTTP polling fallback");
    setupHttpPollingFallback();
    return;
  }
  
  console.log("Setting up Socket.IO progress handlers");
  
  // Remove any existing event handlers to prevent duplicates
  // This is more reliable than trying to check if they're already registered
  removeExistingSocketHandlers();
  
  // Set up general progress_update handler that routes to appropriate handler based on task type
  window.socket.on('progress_update', function(data) {
    console.log('Progress update received:', data ? `${data.progress}%, ${data.message || ''}` : 'No data');
    if (!data) return;
    
    if (data.task_id === window.currentTaskId) {
      const taskType = getCurrentTaskType();
      updateProgressForTaskType(data, taskType);

      // Store latest data for potential failure recovery
      window.latestTaskData = data;
      window.lastProgressValue = data.progress;
      window.lastProgressUpdate = Date.now();

      // Stop any progress simulation since we have a real update
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
    }
  });

  // Playlist-specific progress events
  window.socket.on('playlist_progress', function(data) {
    if (data && data.task_id === window.currentTaskId) {
      if (typeof updatePlaylistProgress === 'function') {
        updatePlaylistProgress(data);
      } else {
        // Fallback to generic if specific handler not available
        updateProgressForTaskType(data, 'playlist');
      }
    }
  });
  
  // Task completion events
  window.socket.on('task_completed', function(data) {
    console.log('Task completed event received:', data);
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation since task is complete
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'completed');
      
      // Clear task ID to prevent duplicate processing
      setTimeout(() => {
        window.currentTaskId = null;
      }, 100);
    }
  });
  
  // Error events
  window.socket.on('task_error', function(data) {
    console.error('Task error event received:', data);
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation on error
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'failed');
    }
  });
  
  // Playlist error event (dedicated handler for backward compatibility)
  window.socket.on('playlist_error', handlePlaylistErrorEvent);
  
  // Cancellation events
  window.socket.on('task_cancelled', function(data) {
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation on cancellation
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'cancelled');
    }
  });
  
  // Connection events for robust operation
  window.socket.on('connect', function() {
    console.log(`Socket.IO connected with ID: ${window.socket.id}`);
    
    // Request initial status if there's an ongoing task after connecting
    if (window.currentTaskId) {
      requestTaskStatus();
    }
  });
  
  window.socket.on('disconnect', function(reason) {
    console.log(`Socket.IO disconnected. Reason: ${reason}`);
    
    // If we have an active task, start HTTP polling as fallback
    if (window.currentTaskId && !window.socketFallbackInterval) {
      console.log("Starting HTTP polling fallback due to socket disconnect");
      setupHttpPollingFallback();
    }
  });
  
  window.socket.on('reconnect', function(attemptNumber) {
    console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
    
    // Re-request task status after reconnection
    if (window.currentTaskId) {
      requestTaskStatus();
      
      // Clear any fallback polling that might have been started
      if (window.socketFallbackInterval) {
        clearInterval(window.socketFallbackInterval);
        window.socketFallbackInterval = null;
        console.log("Stopped HTTP polling fallback after socket reconnection");
      }
    }
  });
  
  // Request initial status if there's an ongoing task
  if (window.currentTaskId) {
    requestTaskStatus();
  }
  
  // Mark handlers as initialized to prevent duplicate setup
  window._socketHandlersInitialized = true;
}

/**
 * Remove any existing socket event handlers to prevent duplicates
 */
function removeExistingSocketHandlers() {
  if (!window.socket) return;
  
  const eventNames = [
    'progress_update', 
    'playlist_progress', 
    'task_completed', 
    'task_error', 
    'playlist_error', 
    'task_cancelled'
  ];
  
  // Only remove our application-specific handlers, not the built-in ones
  eventNames.forEach(eventName => {
    try {
      window.socket.off(eventName);
    } catch (e) {
      console.warn(`Error removing event handler for ${eventName}:`, e);
    }
  });
}

/**
 * Set up HTTP polling as a fallback for when Socket.IO is unavailable
 */
function setupHttpPollingFallback() {
  // Clear any existing interval to prevent duplicates
  if (window.socketFallbackInterval) {
    clearInterval(window.socketFallbackInterval);
  }
  
  // Create a fallback mechanism for updates without socket
  window.socketFallbackInterval = setInterval(() => {
    if (!window.currentTaskId) {
      // Clear interval if no active task
      clearInterval(window.socketFallbackInterval);
      window.socketFallbackInterval = null;
      console.log("Status polling stopped - No active task ID");
      return;
    }
    
    // Track consecutive errors for exponential backoff
    if (!window._pollingErrorCount) {
      window._pollingErrorCount = 0;
    }
    
    fetchTaskStatus(window.currentTaskId)
      .then(data => {
        // Reset error count on success
        window._pollingErrorCount = 0;
        
        console.log("Polling status update:", data);
        
        // Process updates using appropriate handler based on task type
        const taskType = getCurrentTaskType();
        updateProgressForTaskType(data, taskType);
        
        // Store latest data for potential failure recovery
        window.latestTaskData = data;
        window.lastProgressValue = data.progress;
        window.lastProgressUpdate = Date.now();
        
        // Check if we should stop polling
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(window.socketFallbackInterval);
          window.socketFallbackInterval = null;
          console.log("Status polling stopped due to task completion/failure/cancellation");
          
          // Handle respective statuses
          handleTaskStatusChange(data, taskType);
        }
      })
      .catch(error => {
        console.warn("Status polling error:", error);
        window._pollingErrorCount++;
        
        // Exponential backoff after repeated errors
        if (window._pollingErrorCount > 5) {
          const backoffDelay = Math.min(10000, 1000 * Math.pow(1.5, window._pollingErrorCount - 5));
          console.warn(`Polling errors occurring, backing off for ${backoffDelay}ms`);
          
          // Temporarily pause polling
          clearInterval(window.socketFallbackInterval);
          
          // Resume with longer interval
          setTimeout(() => {
            // Re-configure with longer interval if errors persist
            if (window._pollingErrorCount > 10) {
              console.warn("Too many consecutive errors, stopping polling and attempting recovery");
              attemptTaskRecovery();
              return;
            }
            
            // Restart polling with adjusted interval
            setupHttpPollingFallback();
          }, backoffDelay);
        }
      });
  }, determinePollInterval());
}

/**
 * Determine appropriate polling interval based on task type and progress
 * More frequent for fast-moving tasks, slower for longer tasks
 */
function determinePollInterval() {
  const taskType = getCurrentTaskType();
  const lastProgress = window.lastProgressValue || 0;
  
  // Use more frequent polling for almost-complete tasks
  if (lastProgress > 80) {
    return 1500; // 1.5 seconds - more responsive near completion
  }
  
  // Adjust based on task type
  switch (taskType) {
    case 'file':
      return 2000; // 2 seconds - file processing typically finishes quickly
    case 'playlist':
      return 3000; // 3 seconds - playlists can take longer
    case 'scraper':
      return 4000; // 4 seconds - scraping is usually the longest operation
    default:
      return 3000; // Default interval
  }
}

/**
 * Fetch task status from server with timeout
 */
function fetchTaskStatus(taskId) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch(`/api/status/${taskId}`, { signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        return response.json();
      })
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Request current task status via socket
 */
function requestTaskStatus() {
  if (!window.socket || !window.currentTaskId) return;
  
  console.log(`Requesting status for task ID: ${window.currentTaskId}`);
  try {
    window.socket.emit('request_task_status', { task_id: window.currentTaskId });
  } catch (e) {
    console.error("Error requesting task status:", e);
  }
}

/**
 * Stop all active status polling
 */
function stopStatusPolling() {
  // Clear both regular interval and fallback interval
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  if (window.socketFallbackInterval) {
    clearInterval(window.socketFallbackInterval);
    window.socketFallbackInterval = null;
  }
  
  if (window.statusPollInterval) {
    clearInterval(window.statusPollInterval);
    window.statusPollInterval = null;
  }
  
  console.log("Status polling stopped");
}

/**
 * Handle playlist-specific error events
 */
function handlePlaylistErrorEvent(data) {
  if (data && data.task_id === window.currentTaskId) {
    console.error('Playlist error:', data);
    
    // Stop any progress simulation on error
    if (typeof stopProgressSimulation === 'function') {
      stopProgressSimulation();
    }
    
    // Stop any active polling
    stopStatusPolling();
    
    // Handle playlist error
    if (typeof showPlaylistErrorMessage === 'function') {
      showPlaylistErrorMessage(data.error || 'An error occurred with the playlist download');
    } else if (typeof handleTaskFailed === 'function') {
      handleTaskFailed(data);
    } else if (typeof showToast === 'function') {
      showToast('Error', data.error || 'An error occurred with the playlist download', 'error');
    } else {
      alert('Error: ' + (data.error || 'An error occurred with the playlist download'));
    }
    
    // Clear session storage
    window.currentTaskId = null;
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
      console.warn("Error clearing sessionStorage:", e);
    }
  }
}

/**
 * Attempt to recover from task failures or server disconnections
 * Uses the latest known data to simulate completion if needed
 */
function attemptTaskRecovery() {
  if (!window.currentTaskId) return;
  
  console.log("Attempting task recovery with latest known data");
  
  // Check if we have recent data with high progress
  if (window.latestTaskData && window.latestTaskData.progress >= 90) {
    console.log("Recovery: Task was nearly complete, simulating completion");
    
    // Create completion data from latest known data
    const completionData = {
      ...window.latestTaskData,
      status: "completed",
      progress: 100,
      message: "Task completed (recovery mode)"
    };
    
    // Process as completion
    const taskType = getCurrentTaskType();
    handleTaskStatusChange(completionData, taskType, 'completed');
    
    // Clean up
    window.currentTaskId = null;
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
      console.warn("Error clearing sessionStorage:", e);
    }
    
    return;
  }
  
  // If task wasn't near completion, show error
  showToast('Connection Lost', 'Lost connection to the server during task processing', 'error');
  
  // Reset UI to form state based on task type
  const taskType = getCurrentTaskType();
  resetUIForTaskType(taskType);
}

/**
 * Reset UI to form state based on task type
 */
function resetUIForTaskType(taskType) {
  switch (taskType) {
    case 'playlist':
      if (playlistProgressContainer && playlistFormContainer) {
        playlistProgressContainer.classList.add('d-none');
        playlistFormContainer.classList.remove('d-none');
      }
      break;
    case 'scraper':
      if (scraperProgressContainer && scraperFormContainer) {
        scraperProgressContainer.classList.add('d-none');
        scraperFormContainer.classList.remove('d-none');
      }
      break;
    case 'file':
    default:
      if (progressContainer && formContainer) {
        progressContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
      break;
  }
}
/**
 * Handle task status changes based on type and status
 * @param {Object} data - Task data
 * @param {string} taskType - Task type
 * @param {string} status - Status override (optional)
 */
function handleTaskStatusChange(data, taskType, status) {
  const taskStatus = status || data.status;
  
  switch (taskStatus) {
    case 'completed':
      if (taskType === 'playlist' && typeof handleTaskCompleted === 'function') {
        handleTaskCompleted(data);
      } else if (taskType === 'file') {
        handleCompletion(data);
      } else if (taskType === 'scraper' && typeof handleScraperCompletion === 'function') {
        handleScraperCompletion(data);
      }
      break;
      
    case 'failed':
      if (taskType === 'playlist' && typeof handleTaskFailed === 'function') {
        handleTaskFailed(data);
      } else if (taskType === 'file') {
        handleError(data);
      } else if (taskType === 'scraper' && typeof handleScraperError === 'function') {
        handleScraperError(data.error);
      }
      break;
      
    case 'cancelled':
      if (taskType === 'playlist' && typeof handleTaskCancelled === 'function') {
        handleTaskCancelled();
      } else if (taskType === 'file') {
        handleCancellation();
      } else if (taskType === 'scraper' && typeof handleScraperCancellation === 'function') {
        handleScraperCancellation();
      }
      break;
  }
}

/**
 * Generic progress update function for File Processing tab
 */
function updateGenericProgress(data) {
  if (!data) return;
  
  // Get UI elements
  const progressBar = document.getElementById('progress-bar');
  const progressStatus = document.getElementById('progress-status');
  const progressStats = document.getElementById('progress-stats');
  
  // Update progress bar
  if (progressBar && typeof data.progress === 'number') {
    const progress = Math.min(100, Math.max(0, data.progress));
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    progressBar.textContent = `${Math.round(progress)}%`;
    
    // Update styling
    if (progress >= 100) {
      progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.add('bg-success');
    } else {
      progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.remove('bg-success');
    }
  }
  
  // Update status message
  if (progressStatus && data.message) {
    progressStatus.textContent = data.message;
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateFileStats(progressStats, data.stats);
  }
  
  // Handle completion
  if (data.status === 'completed') {
    handleCompletion(data);
  } else if (data.status === 'failed' || data.error) {
    handleError(data);
  } else if (data.status === 'cancelled') {
    handleCancellation();
  }
}

/**
 * Update file stats display
 */
function updateFileStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  if (stats.total_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Files <span class="badge bg-primary rounded-pill">${stats.total_files}</span>
    </li>`;
  }
  
  if (stats.processed_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Files <span class="badge bg-success rounded-pill">${stats.processed_files}</span>
    </li>`;
  }
  
  if (stats.error_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Error Files <span class="badge bg-danger rounded-pill">${stats.error_files}</span>
    </li>`;
  }
  
  if (stats.skipped_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Skipped Files <span class="badge bg-warning rounded-pill">${stats.skipped_files}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Show progress UI based on task type
 * @param {string} taskType - Task type
 */
function showProgressUI(taskType) {
  switch (taskType) {
    case 'playlist':
      showPlaylistProgress();
      break;
    case 'scraper':
      if (typeof showScraperProgress === 'function') {
        showScraperProgress();
      }
      break;
    case 'file':
    default:
      // Show file progress UI
      if (formContainer && progressContainer) {
        formContainer.classList.add('d-none');
        progressContainer.classList.remove('d-none');
        
        // Reset progress elements
        if (progressBar) {
          progressBar.style.width = '0%';
          progressBar.setAttribute('aria-valuenow', '0');
          progressBar.textContent = '0%';
        }
        
        if (progressStatus) {
          progressStatus.textContent = "Initializing file processing...";
        }
        
        if (progressStats) {
          progressStats.innerHTML = "";
        }
      }
      break;
  }
}

/**
 * Show playlist progress UI with transitions
 */
function showPlaylistProgress() {
  const playlistFormContainer = document.getElementById('playlist-form-container');
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistProgressBar = document.getElementById('playlist-progress-bar');
  const playlistProgressStatus = document.getElementById('playlist-progress-status');
  const playlistProgressStats = document.getElementById('playlist-progress-stats');
  
  if (!playlistFormContainer || !playlistProgressContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistFormContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistFormContainer.classList.add('d-none');
    playlistFormContainer.classList.remove('fade-out');
    
    playlistProgressContainer.classList.remove('d-none');
    playlistProgressContainer.classList.add('fade-in');
    
    // Reset progress elements
    if (playlistProgressBar) {
      playlistProgressBar.style.width = '0%';
      playlistProgressBar.setAttribute('aria-valuenow', '0');
      playlistProgressBar.textContent = '0%';
    }
    
    if (playlistProgressStatus) {
      playlistProgressStatus.textContent = "Initializing playlist download...";
    }
    
    if (playlistProgressStats) {
      playlistProgressStats.innerHTML = "";
    }
    
    setTimeout(() => {
      playlistProgressContainer.classList.remove('fade-in');
    }, 500);
  }, 300);
}

/**
 * Normalize progress value for better user experience
 * @param {number} rawProgress - The raw progress value from the server
 * @param {Object} data - The full progress data object
 * @returns {number} - Normalized progress value between 0-100
 */
function normalizeProgress(rawProgress, data) {
  // Handle invalid input
  if (rawProgress === undefined || rawProgress === null) {
    return 0;
  }
  
  // Ensure progress is a number
  rawProgress = Number(rawProgress);
  if (isNaN(rawProgress)) {
    return 0;
  }
  
  // Keep progress within bounds
  rawProgress = Math.max(0, Math.min(100, rawProgress));
  
  // Initialize progress tracking if not exists
  if (!window.progressTracking) {
    window.progressTracking = {
      history: [],
      jumpDetected: false,
      jumpFrom: null,
      jumpTime: null,
      lastPhase: 'pre-jump', // 'pre-jump', 'jumping', 'simulating', 'completed'
      batchInfo: null,
      stagnantCount: 0
    };
  }
  
  const tracking = window.progressTracking;
  const now = Date.now();
  
  // Add to progress history
  tracking.history.push({
    progress: rawProgress,
    timestamp: now,
    message: data.message || ''
  });
  
  // Keep history manageable (last 20 updates)
  if (tracking.history.length > 20) {
    tracking.history.shift();
  }
  
  // Detect phase transitions
  if (tracking.history.length >= 2) {
    const previous = tracking.history[tracking.history.length - 2].progress;
    const jump = rawProgress - previous;
    
    // Check for significant jump
    if (jump >= 10 && previous < 60 && rawProgress < 80) {
      tracking.jumpDetected = true;
      tracking.jumpFrom = previous;
      tracking.jumpTime = now;
      tracking.lastPhase = 'jumping';
      console.log(`Progress jump detected: ${previous}% → ${rawProgress}%`);
      
      // Extract batch information from message if available
      if (data.message && data.message.includes('batch')) {
        const batchMatch = data.message.match(/batch (\d+)\/(\d+)/);
        if (batchMatch && batchMatch.length >= 3) {
          tracking.batchInfo = {
            current: parseInt(batchMatch[1]),
            total: parseInt(batchMatch[2]),
            isFinal: parseInt(batchMatch[1]) === parseInt(batchMatch[2])
          };
          console.log(`Batch info detected: ${tracking.batchInfo.current}/${tracking.batchInfo.total}`);
        }
      }
    }
    
    // Check for stagnation at 50%
    if (rawProgress === 50 && previous === 50) {
      tracking.stagnantCount++;
      
      // After being stuck at 50% for a while, enter simulation phase
      if (tracking.stagnantCount >= 3 && tracking.lastPhase !== 'simulating') {
        tracking.lastPhase = 'simulating';
        console.log("Progress stagnant at 50%, entering simulation phase");
      }
    } else {
      tracking.stagnantCount = 0;
    }
    
    // Check for completion
    if (rawProgress >= 99 || rawProgress >= 100) {
      tracking.lastPhase = 'completed';
    }
  }
  
  // Apply normalization based on current phase
  switch (tracking.lastPhase) {
    case 'pre-jump':
      // Before any jump, return the raw value
      return rawProgress;
      
    case 'jumping':
      // During a jump transition (brief period)
      // Just pass through the raw value
      return rawProgress;
      
    case 'simulating':
      // If we're stuck at 50%, apply simulation
      if (rawProgress === 50) {
        // Get time elapsed since jump or stagnation start
        const referenceTime = tracking.jumpTime || 
                              tracking.history[tracking.history.length - tracking.stagnantCount].timestamp;
        const elapsedSecs = (now - referenceTime) / 1000;
        
        // Estimate progress based on elapsed time
        // Use batch information if available to make a better estimate
        if (tracking.batchInfo && tracking.batchInfo.isFinal) {
          // In final batch, simulate 50-95% over about 30 seconds
          const simulatedProgress = Math.min(95, 50 + (elapsedSecs * 1.5));
          return Math.round(simulatedProgress);
        } else {
          // Generic simulation from 50-75% over about 20 seconds
          // More conservative when we don't know batch details
          const simulatedProgress = Math.min(75, 50 + (elapsedSecs));
          return Math.round(simulatedProgress);
        }
      }
      // If we get a non-50% value during simulation, use it
      return rawProgress;
      
    case 'completed':
      // Ensure 100% for completed state
      return rawProgress >= 99 ? 100 : rawProgress;
      
    default:
      // Default: just return the raw value
      return rawProgress;
  }
}

// 3. Better multi-phase progress tracking
class MultiPhaseProgressTracker {
  constructor(phases) {
    this.phases = phases.map(p => ({ 
      name: p.name, 
      weight: p.weight, 
      progress: 0,
      complete: false
    }));
    this.totalWeight = this.phases.reduce((sum, p) => sum + p.weight, 0);
  }
  
  updatePhase(phaseName, progress) {
    const phase = this.phases.find(p => p.name === phaseName);
    if (phase) {
      phase.progress = Math.min(progress, 100);
      if (progress >= 100) {
        phase.complete = true;
      }
    }
    
    return this.calculateTotalProgress();
  }
  
  calculateTotalProgress() {
    let weightedProgress = 0;
    
    for (const phase of this.phases) {
      weightedProgress += (phase.progress * phase.weight);
    }
    
    return Math.min(Math.floor(weightedProgress / this.totalWeight), 100);
  }
}

// 1. Improved error messages with actionable advice
function displayEnhancedErrorMessage(error) {
  // Analyze error message for common issues
  let userMessage = "An error occurred during processing.";
  let actionableAdvice = "";
  
  if (error.includes("memory")) {
    userMessage = "The file is too large for processing.";
    actionableAdvice = "Try processing a smaller document or disabling table extraction.";
  } else if (error.includes("permission")) {
    userMessage = "Permission denied when accessing the file.";
    actionableAdvice = "Check that you have permission to access this file or try a different location.";
  } else if (error.includes("corrupt") || error.includes("invalid")) {
    userMessage = "The PDF file appears to be corrupted or invalid.";
    actionableAdvice = "Try opening the PDF in another application to verify it works correctly.";
  }
  
  // Display the error to the user
  showToast('Processing Error', userMessage, 'error');
  
  // Add advice if available
  if (actionableAdvice) {
    // Display actionable advice in a separate element
    const errorDetailsElement = document.getElementById('error-details');
    if (errorDetailsElement) {
      errorDetailsElement.innerHTML = `<div class="alert alert-warning">
        <i class="fas fa-lightbulb me-2"></i> ${actionableAdvice}
      </div>`;
    }
  }
}

// 2. Better loading indicators
function showLoadingState(element, message = "Loading...") {
  // Save original content
  element.dataset.originalContent = element.innerHTML;
  
  // Show loading spinner with message
  element.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm me-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span>${message}</span>
    </div>
  `;
  element.disabled = true;
}

function resetLoadingState(element) {
  if (element.dataset.originalContent) {
    element.innerHTML = element.dataset.originalContent;
    element.disabled = false;
    delete element.dataset.originalContent;
  }
}

// 3. Efficient DOM updates with batching
class DOMBatcher {
  constructor(batchTimeMs = 16) { // ~1 frame at 60fps
    this.batchTimeMs = batchTimeMs;
    this.pendingUpdates = new Map();
    this.timeoutId = null;
  }
  
  update(elementId, updateFn) {
    this.pendingUpdates.set(elementId, updateFn);
    
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.flush(), this.batchTimeMs);
    }
  }
  
  flush() {
    this.timeoutId = null;
    
    // Process all updates in a single batch
    for (const [elementId, updateFn] of this.pendingUpdates.entries()) {
      const element = document.getElementById(elementId);
      if (element) {
        updateFn(element);
      }
    }
    
    this.pendingUpdates.clear();
  }
}

// 1. Implement file processing batching
async function processFilesBatched(files, outputPath, options = {}) {
  const batchSize = options.batchSize || 10;
  const results = [];
  const batches = [];
  
  // Split files into batches
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  
  let completedFiles = 0;
  const totalFiles = files.length;
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Process files in this batch concurrently
    const batchResults = await Promise.all(
      batch.map(async file => {
        try {
          const result = await processFile(file, outputPath, options);
          
          // Update progress
          completedFiles++;
          const progress = Math.floor((completedFiles / totalFiles) * 100);
          
          if (options.progressCallback) {
            options.progressCallback(progress, completedFiles, totalFiles);
          }
          
          return { file, result, success: true };
        } catch (error) {
          return { file, error: error.message, success: false };
        }
      })
    );
    
    results.push(...batchResults);
    
    // Release memory between batches
    if (global.gc) {
      global.gc();
    }
  }
  
  return results;
}

// 2. Implement a memory-aware cleanup service
const cleanup = {
  tempFiles: new Set(),
  
  registerFile(filePath) {
    this.tempFiles.add(filePath);
  },
  
  async cleanupTemporaryFiles() {
    const currentFiles = [...this.tempFiles];
    
    for (const file of currentFiles) {
      try {
        await fs.promises.unlink(file);
        this.tempFiles.delete(file);
      } catch (error) {
        // File might be in use, will try again later
        console.warn(`Could not delete temporary file ${file}: ${error.message}`);
      }
    }
  },
  
  startCleanupService(intervalMs = 300000) {
    setInterval(() => {
      this.cleanupTemporaryFiles();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }, intervalMs);
  }
};

// 3. Optimized progress event throttling on server
const progressManager = {
  lastSentProgress: new Map(),
  minTimeBetweenUpdatesMs: 300,
  lastUpdateTime: new Map(),
  
  shouldSendUpdate(clientId, progress) {
    const now = Date.now();
    const lastTime = this.lastUpdateTime.get(clientId) || 0;
    const lastProgress = this.lastSentProgress.get(clientId) || -1;
    
    // Always send first and last updates
    if (progress === 0 || progress === 100) {
      this.updateTracking(clientId, progress, now);
      return true;
    }
    
    // Send if significant progress change
    if (Math.abs(progress - lastProgress) > 5) {
      // But still respect time limits
      if (now - lastTime >= this.minTimeBetweenUpdatesMs) {
        this.updateTracking(clientId, progress, now);
        return true;
      }
    }
    
    // Send if enough time has passed regardless of progress
    if (now - lastTime >= 1000) {
      this.updateTracking(clientId, progress, now);
      return true;
    }
    
    return false;
  },
  
  updateTracking(clientId, progress, timestamp) {
    this.lastSentProgress.set(clientId, progress);
    this.lastUpdateTime.set(clientId, timestamp);
  }
};

/**
 * Process a PDF file with the server's advanced capabilities
 * @param {string} filePath - Path to the PDF file
 * @param {object} options - Processing options
 * @returns {Promise} - Processing result
 */
function processPDF(filePath, options = {}) {
  const defaults = {
      extractTables: true,
      useOcr: true,
      extractStructure: true,
      outputFolder: null
  };
  
  const settings = { ...defaults, ...options };
  
  return new Promise((resolve, reject) => {
      // Prepare the request payload
      const payload = {
          pdf_path: filePath,
          output_dir: settings.outputFolder,
          extract_tables: settings.extractTables,
          use_ocr: settings.useOcr
      };
      
      // Call the PDF processing API
      fetch('/api/pdf/process', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      })
      .then(response => {
          if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          if (data.status === "processing") {
              // Task is being processed asynchronously
              // We'll need to poll for updates
              const taskId = data.task_id;
              pollPdfProcessingStatus(taskId, resolve, reject);
          } else if (data.status === "success") {
              // Processing completed synchronously
              resolve(data);
          } else {
              // Error occurred
              reject(new Error(data.error || "Unknown error"));
          }
      })
      .catch(error => {
          reject(error);
      });
  });
}
/**
 * Poll for PDF processing status
 * @param {string} taskId - Task ID
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 * @param {number} remainingAttempts - Number of retry attempts left
 */
function pollPdfProcessingStatus(taskId, resolve, reject, remainingAttempts = 1) {
  const delay = 2000; // 2 second polling interval
  
  const checkStatus = () => {
    fetch(`/api/pdf/status/${taskId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.status === "completed") {
        // Processing completed
        resolve(data);
      } else if (data.status === "failed" || data.status === "error") {
        // Error occurred
        if (data.error && data.error.includes('memory') && remainingAttempts > 0) {
          // Memory error, can retry with reduced options
          console.warn("PDF processing failed with memory error, restarting with reduced options");
          
          // Wait before retrying
          setTimeout(() => {
            fetch(`/api/pdf/retry/${taskId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                extract_tables: false,
                use_ocr: false
              })
            })
            .then(response => response.json())
            .then(retryData => {
              if (retryData.status === 'processing') {
                // Continue polling with one less retry attempt
                pollPdfProcessingStatus(taskId, resolve, reject, remainingAttempts - 1);
              } else {
                reject(new Error("Failed to restart PDF processing"));
              }
            })
            .catch(error => {
              reject(error);
            });
          }, 1000);
        } else {
          // Other error or out of retries
          reject(new Error(data.error || "Processing failed"));
        }
      } else {
        // Still processing, poll again after a delay
        setTimeout(checkStatus, delay);
      }
    })
    .catch(error => {
      reject(error);
    });
  };
  
  // Start polling
  checkStatus();
}


/**
* Add PDF viewing capabilities to the UI
*/
function enhancePdfViewer() {
  // Get the PDF viewer modal
  const pdfViewerModal = document.getElementById('pdfViewerModal');
  
  if (!pdfViewerModal) return;
  
  // Add PDF.js initialization if needed
  if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }
  
  // Enhance the existing openPdfViewer function with structure view
  window.openPdfWithStructure = function(pdfPath, structureData) {
      openPdfViewer(pdfPath);
      
      // Add structure data if available
      if (structureData) {
          const viewerContainer = document.getElementById('pdf-viewer-container');
          if (viewerContainer) {
              // Add a structure panel
              const structurePanel = document.createElement('div');
              structurePanel.className = 'structure-panel';
              structurePanel.innerHTML = `
                  <div class="card">
                      <div class="card-header">
                          <h5 class="mb-0">Document Structure</h5>
                      </div>
                      <div class="card-body">
                          <div class="structure-content">
                              ${renderStructureHtml(structureData)}
                          </div>
                      </div>
                  </div>
              `;
              
              viewerContainer.appendChild(structurePanel);
          }
      }
  };
}

/**
* Render document structure as HTML
*/
function renderStructureHtml(structure) {
  if (!structure) return '<div class="alert alert-info">No structure information available</div>';
  
  let html = '';
  
  // Render sections
  if (structure.sections && structure.sections.length > 0) {
      html += '<h6>Sections</h6>';
      html += '<ul class="structure-sections">';
      
      structure.sections.forEach(section => {
          html += `<li>${section.title || 'Untitled Section'}</li>`;
      });
      
      html += '</ul>';
  }
  
  // Render tables
  if (structure.tables && structure.tables.length > 0) {
      html += '<h6>Tables</h6>';
      html += '<ul class="structure-tables">';
      
      structure.tables.forEach(table => {
          html += `<li>Table on page ${table.page}</li>`;
      });
      
      html += '</ul>';
  }
  
  return html;
}


// 2. Dynamic OCR path detection
function detectTesseractPath() {
  const possiblePaths = [
    '/usr/bin/tesseract',
    '/usr/local/bin/tesseract',
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
  ];
  
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  
  return null;
}


// 3. Enhanced PDF processing with better error handling
async function processPdfWithRecovery(pdf_path, output_path, options = {}) {
  // First try with full features
  try {
    const result = await pdfProcessor.process_pdf(pdf_path, output_path, options);
    return result;
  } catch (e) {
    logger.error(`Full PDF processing failed: ${e}`);
    
    // If memory error, try with reduced features
    if (e.message.includes('memory') || e.message.includes('allocation')) {
      logger.info("Retrying with reduced memory options");
      const reducedOptions = {
        ...options,
        extract_tables: false,
        chunk_size: 2048,
        use_ocr: false
      };
      
      try {
        return await pdfProcessor.process_pdf(pdf_path, output_path, reducedOptions);
      } catch (retryError) {
        throw new Error(`PDF processing failed after retry: ${retryError.message}`);
      }
    }
    
    throw e;
  }
}

/**
 * Set up event listeners for all UI elements
 */
function setupEventListeners() {
  console.log("Setting up event listeners...");
  
  // ---- File Processing Form ----
  if (processForm) {
    // Remove any existing listeners first to avoid duplicates
    processForm.removeEventListener('submit', handleFileSubmit);
    // Add the event listener
    processForm.addEventListener('submit', handleFileSubmit);
    console.log("File form submit listener added");
  } else {
    console.warn("Process form element not found");
  }
  
  // ---- File Processing Buttons ----
  if (browseBtn) {
    browseBtn.removeEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    browseBtn.addEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    console.log("Browse button click listener added");
  } else {
    console.warn("Browse button element not found");
  }
  
  if (cancelBtn) {
    cancelBtn.removeEventListener('click', handleCancelClick);
    cancelBtn.addEventListener('click', handleCancelClick);
  }
  
  if (newTaskBtn) {
    newTaskBtn.removeEventListener('click', handleNewTaskClick);
    newTaskBtn.addEventListener('click', handleNewTaskClick);
  }
  
  if (retryBtn) {
    retryBtn.removeEventListener('click', handleNewTaskClick);
    retryBtn.addEventListener('click', handleNewTaskClick);
  }
  
  if (openBtn) {
    openBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  // ---- Folder Input Change ----
  const folderInput = document.getElementById('folder-input');
  if (folderInput) {
    folderInput.removeEventListener('change', handleFolderSelection);
    folderInput.addEventListener('change', handleFolderSelection);
  }
  
  // ---- Playlist Form ----
  if (playlistForm) {
    playlistForm.removeEventListener('submit', handlePlaylistSubmit);
    playlistForm.addEventListener('submit', handlePlaylistSubmit);
    console.log("Playlist form submit listener added");
  } else {
    console.warn("Playlist form element not found");
  }
  
  // ---- Playlist Buttons ----
  if (addPlaylistBtn) {
    addPlaylistBtn.removeEventListener('click', addPlaylistField);
    addPlaylistBtn.addEventListener('click', addPlaylistField);
  }
  
  if (playlistCancelBtn) {
    playlistCancelBtn.removeEventListener('click', handleCancelClick);
    playlistCancelBtn.addEventListener('click', handleCancelClick);
  }
  
  if (playlistNewTaskBtn) {
    playlistNewTaskBtn.removeEventListener('click', function() {
      currentTaskId = null;
      playlistResultsContainer.classList.add('d-none');
      playlistFormContainer.classList.remove('d-none');
      
      // Reset the form
      if (playlistForm) playlistForm.reset();
      
      // Reset playlist URLs
      const urlInputs = playlistUrlsContainer.querySelectorAll('.input-group');
      for (let i = urlInputs.length - 1; i > 0; i--) {
        playlistUrlsContainer.removeChild(urlInputs[i]);
      }
      
      // Reset the first URL input
      const firstUrlInput = playlistUrlsContainer.querySelector('.playlist-url');
      if (firstUrlInput) firstUrlInput.value = '';
      
      showToast('Ready', 'Ready for a new playlist task', 'info');
    });
    
    playlistNewTaskBtn.addEventListener('click', function() {
      currentTaskId = null;
      playlistResultsContainer.classList.add('d-none');
      playlistFormContainer.classList.remove('d-none');
      
      // Reset the form
      if (playlistForm) playlistForm.reset();
      
      // Reset playlist URLs
      const urlInputs = playlistUrlsContainer.querySelectorAll('.input-group');
      for (let i = urlInputs.length - 1; i > 0; i--) {
        playlistUrlsContainer.removeChild(urlInputs[i]);
      }
      if (playlistCancelBtn) {
        playlistCancelBtn.removeEventListener('click', handleCancelClick); // Remove the generic handler
        playlistCancelBtn.addEventListener('click', handlePlaylistCancelClick); // Add the specific handler
        console.log("Playlist cancel button listener added");
      }      
      // Reset the first URL input
      const firstUrlInput = playlistUrlsContainer.querySelector('.playlist-url');
      if (firstUrlInput) firstUrlInput.value = '';
      
      showToast('Ready', 'Ready for a new playlist task', 'info');
    });
  }
  
  if (openPlaylistJsonBtn) {
    openPlaylistJsonBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openPlaylistJsonBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  if (playlistRootField) {
    const playlistBrowseBtn = document.getElementById('playlist-browse-btn');
    if (playlistBrowseBtn) {
      playlistBrowseBtn.removeEventListener('click', function() {
        handleBrowseClick(playlistRootField);
      });
      playlistBrowseBtn.addEventListener('click', function() {
        handleBrowseClick(playlistRootField);
      });
    }
  }
  
  // ---- Web Scraper Form ----
  if (scraperForm) {
    scraperForm.removeEventListener('submit', handleScraperSubmit);
    scraperForm.addEventListener('submit', handleScraperSubmit);
    console.log("Scraper form submit listener added");
  } else {
    console.warn("Scraper form element not found");
  }
  
  // ---- Scraper Buttons ----
  if (addScraperUrlBtn) {
    addScraperUrlBtn.removeEventListener('click', addScraperUrlField);
    addScraperUrlBtn.addEventListener('click', addScraperUrlField);
  }
  
  if (scraperCancelBtn) {
    scraperCancelBtn.removeEventListener('click', handleScraperCancelClick);
    scraperCancelBtn.addEventListener('click', handleScraperCancelClick);
  }
  
  if (scraperNewTaskBtn) {
    scraperNewTaskBtn.removeEventListener('click', handleScraperNewTask);
    scraperNewTaskBtn.addEventListener('click', handleScraperNewTask);
  }
  
  if (openScraperJsonBtn) {
    openScraperJsonBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openScraperJsonBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  if (openOutputFolderBtn) {
    openOutputFolderBtn.removeEventListener('click', handleOpenOutputFolder);
    openOutputFolderBtn.addEventListener('click', handleOpenOutputFolder);
  }
  
  // ---- Scraper Settings Change ----
  const settingsSelects = document.querySelectorAll('.scraper-settings');
  if (settingsSelects.length > 0) {
    settingsSelects.forEach(select => {
      select.removeEventListener('change', handleScraperSettingsChange);
      select.addEventListener('change', handleScraperSettingsChange);
    });
  }
  
  if (downloadDirBrowseBtn) {
    downloadDirBrowseBtn.removeEventListener('click', function() {
      handleBrowseClick(downloadDirectoryField);
    });
    downloadDirBrowseBtn.addEventListener('click', function() {
      handleBrowseClick(downloadDirectoryField);
    });
  }
  
  // ---- Theme and Help Toggles ----
  // Dark mode toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.removeEventListener('click', toggleDarkMode);
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }
  
  const helpToggle = document.getElementById('helpToggle');
  if (helpToggle) {
    helpToggle.removeEventListener('click', toggleHelpMode);
    helpToggle.addEventListener('click', toggleHelpMode);
  }
  
  // ---- Keyboard Shortcuts ----
  document.removeEventListener('keydown', handleKeyboardShortcuts);
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // ---- History Tab ----
  if (historyRefreshBtn) {
    historyRefreshBtn.removeEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
    historyRefreshBtn.addEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
  }
  
  if (historyClearBtn) {
    historyClearBtn.removeEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
    historyClearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
  }
  
  // Re-initialize Socket.IO connection
  initializeSocket();
  
  // Update the event listeners status in the debug panel
  updateEventListenersStatus();
  
  console.log("Event listeners setup complete");
  
  // Return true to indicate success
  return true;
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - The element to make draggable
 * @param {HTMLElement} handle - The drag handle (usually the header)
 */
function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  if (!element || !handle) return;
  
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set the element's new position, ensuring it stays within viewport
    const newTop = (element.offsetTop - pos2);
    const newLeft = (element.offsetLeft - pos1);
    
    // Check viewport boundaries
    const maxTop = window.innerHeight - element.offsetHeight;
    const maxLeft = window.innerWidth - element.offsetWidth;
    
    element.style.top = Math.min(Math.max(0, newTop), maxTop) + "px";
    element.style.left = Math.min(Math.max(0, newLeft), maxLeft) + "px";
    
    // Switch from bottom/right positioning to top/left
    element.style.bottom = 'auto';
    element.style.right = 'auto';
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Track and display errors in the debug panel
 * @param {Error} error - The error object
 * @param {string} context - Error context
 */
function trackErrorInDebugPanel(error, context) {
  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;
  
  const badge = debugPanel.querySelector('#debug-error-counter');
  if (!badge) return;
  
  // Increment error count
  const count = parseInt(badge.textContent) || 0;
  badge.textContent = count + 1;
  badge.style.display = 'flex';
  
  // Add error to errors list
  const errorsContainer = document.getElementById('debug-errors-list');
  if (errorsContainer) {
    const errorItem = document.createElement('div');
    errorItem.className = 'alert alert-danger mb-1 p-2 small';
    errorItem.innerHTML = `
      <strong>${context}:</strong> ${error.message || error}
      <button type="button" class="btn-close btn-close-white float-end" aria-label="Close"></button>
    `;
    
    // Add clear button functionality
    const closeBtn = errorItem.querySelector('.btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        errorItem.remove();
        // Update count
        const newCount = errorsContainer.querySelectorAll('.alert').length;
        badge.textContent = newCount;
        badge.style.display = newCount > 0 ? 'flex' : 'none';
      });
    }
    
    errorsContainer.prepend(errorItem);
  }
}

// Call enhance debug panel when initializing debug mode
if (typeof initializeDebugMode === 'function') {
  const originalInitDebug = initializeDebugMode;
  initializeDebugMode = function() {
    originalInitDebug.apply(this, arguments);
    enhanceDebugPanel();
  };
}

// Enhance error tracking
if (typeof handleError === 'function') {
  const originalHandleError = handleError;
  handleError = function(error, context) {
    // Call original function
    originalHandleError.apply(this, arguments);
    
    // Also track in debug panel
    trackErrorInDebugPanel(error, context);
  };
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(e) {
  // Skip if modal is open or if inside a text input
  if (document.querySelector('.modal.show') || 
      e.target.tagName === 'INPUT' || 
      e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  // Handle Ctrl+Key combinations
  if (e.ctrlKey) {
    switch(e.key) {
      case '1': // Switch to File Processor tab
        e.preventDefault();
        const fileTab = document.getElementById('file-tab');
        if (fileTab) {
          const tabInstance = new bootstrap.Tab(fileTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to File Processor tab', 'info');
        }
        break;
        
      case '2': // Switch to Playlist tab
        e.preventDefault();
        const playlistTab = document.getElementById('playlist-tab');
        if (playlistTab) {
          const tabInstance = new bootstrap.Tab(playlistTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to Playlist Downloader tab', 'info');
        }
        break;
        
      case '3': // Switch to Web Scraper tab
        e.preventDefault();
        const scraperTab = document.getElementById('scraper-tab');
        if (scraperTab) {
          const tabInstance = new bootstrap.Tab(scraperTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to Web Scraper tab', 'info');
        }
        break;
        
      case '4': // Switch to History tab
        e.preventDefault();
        const historyTab = document.getElementById('history-tab');
        if (historyTab) {
          const tabInstance = new bootstrap.Tab(historyTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to History tab', 'info');
        }
        break;
        
      case 'o': // Open JSON
        e.preventDefault();
        const activeTab = document.querySelector('.tab-pane.active');
        let openButton;
        
        if (activeTab && activeTab.id === 'file') {
          openButton = document.getElementById('open-btn');
        } else if (activeTab && activeTab.id === 'playlist') {
          openButton = document.getElementById('open-playlist-json');
        } else if (activeTab && activeTab.id === 'scraper') {
          openButton = document.getElementById('open-scraper-json');
        }
        
        if (openButton && !openButton.disabled && !openButton.closest('.d-none')) {
          openButton.click();
          showToast('Action', 'Opening JSON file', 'info');
        }
        break;
        
      case 'n': // New Task
        e.preventDefault();
        const activeNewBtn = document.querySelector('.tab-pane.active .btn[id$="-new-task-btn"]:not(.d-none)');
        if (activeNewBtn && !activeNewBtn.disabled) {
          activeNewBtn.click();
          showToast('Action', 'Starting new task', 'info');
        }
        break;
        
      case 'h': // Help
        e.preventDefault();
        toggleHelpMode();
        break;
    }
  }
  
  // Handle Escape key
  if (e.key === 'Escape') {
    // Close help tooltips if any
    removeHelpTooltips();
    
    // Close modals if any (handled by Bootstrap, just for reference)
  }
}

// =============================================================================
// SECTION 14: ACADEMIC SEARCH INTEGRATION
// =============================================================================

/**
 * Initialize academic search functionality
 */
function initializeAcademicSearch() {
  // Connect to the academic search field
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSearchBtn = document.getElementById('academic-search-btn');
  const academicSourcesSelect = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  const addSelectedPapersBtn = document.getElementById('add-selected-papers');
  
  // Add search button event handler
  if (academicSearchBtn) {
    academicSearchBtn.addEventListener('click', performAcademicSearch);
  }
  
  // Add enter key handler for search input
  if (academicSearchInput) {
    academicSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        performAcademicSearch();
      }
    });
  }
  
  // Add selected papers button handler
  if (addSelectedPapersBtn) {
    addSelectedPapersBtn.addEventListener('click', addSelectedPapers);
  }
  
  console.log("Academic search functionality initialized");
}


/**
 * Perform academic search with appropriate visual feedback
 */
function performAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  // Validate query
  const query = academicSearchInput.value.trim();
  if (!query) {
    showToast('Error', 'Please enter a search query', 'error');
    return;
  }
  
  // Get selected source
  const source = academicSources.value;
  
  // Show loading indicator
  academicResults.classList.remove('d-none');
  academicResultsContainer.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Searching academic sources...</p>
    </div>
  `;
  
  // Call API endpoint for academic search
  fetch('/api/academic-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Display results
    displayAcademicResults(data.results || []);
    
    // Show toast
    if (data.results && data.results.length > 0) {
      showToast('Success', `Found ${data.results.length} papers matching "${query}"`, 'success');
    } else {
      showToast('Notice', 'No results found. Try different search terms or sources.', 'warning');
    }
  })
  .catch(error => {
    console.error('Academic search error:', error);
    
    // Show error in results container
    academicResultsContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-circle me-2"></i>
        Error: ${error.message || 'Failed to perform search'}
      </div>
    `;
    
    // Show toast
    showToast('Error', error.message || 'Search failed', 'error');
    
    // Fallback to mock results in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log("Using mock results for development");
      displayAcademicResults(getMockSearchResults(query, source));
    }
  });
}
// 1. Enhanced academic search with filters
async function academicSearch(query, options = {}) {
  const { 
    source = 'all', 
    sortBy = 'relevance',
    dateRange = null,
    limit = 20
  } = options;
  
  // Convert arxiv abstract URLs to PDF URLs
  const toAcademicPdfUrl = (url) => {
    if (url.includes('arxiv.org/abs/')) {
      return url.replace('arxiv.org/abs/', 'arxiv.org/pdf/') + '.pdf';
    }
    return url;
  };
  
  try {
    // Construct API URL with filters
    let apiUrl = `/api/academic/search?query=${encodeURIComponent(query)}`;
    
    if (source !== 'all') {
      apiUrl += `&source=${encodeURIComponent(source)}`;
    }
    
    if (sortBy) {
      apiUrl += `&sort=${encodeURIComponent(sortBy)}`;
    }
    
    if (dateRange) {
      apiUrl += `&from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`;
    }
    
    if (limit) {
      apiUrl += `&limit=${limit}`;
    }
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process results to ensure PDF URLs are correct
    if (data.results) {
      data.results = data.results.map(paper => ({
        ...paper,
        pdf_url: paper.pdf_url ? toAcademicPdfUrl(paper.pdf_url) : null
      }));
    }
    
    return data;
  } catch (error) {
    console.error('Academic search error:', error);
    throw error;
  }
}

// 2. Improved PDF detection for academic papers
async function checkIsPdf(url) {
  // Special handling for known academic repositories
  const isArxivPdf = url.includes('arxiv.org/pdf/');
  const isDoi = url.includes('doi.org/');
  
  if (isArxivPdf) {
    return true;
  }
  
  if (isDoi) {
    // DOIs need special handling to resolve to actual content
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'Accept': 'application/pdf' }
      });
      
      const contentType = response.headers.get('Content-Type');
      return contentType && contentType.includes('pdf');
    } catch (e) {
      return false;
    }
  }
  
  // Standard check
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AcademicParser/1.0)' }
    });
    
    const contentType = response.headers.get('Content-Type');
    return contentType && contentType.includes('pdf');
  } catch (e) {
    // If we can't check, assume based on URL
    return url.toLowerCase().endsWith('.pdf');
  }
}

// 3. Extract and process citations
function extractCitations(pdfText) {
  // Simple regex-based citation extraction
  // This is a simplified approach - a full implementation would use NLP
  const citations = [];
  
  // Match patterns like [1], [2-4], etc.
  const citationRegex = /\[([\d\s,-]+)\]/g;
  let match;
  
  while ((match = citationRegex.exec(pdfText)) !== null) {
    citations.push({
      rawText: match[0],
      indices: match[1].split(/[\s,-]/).map(i => parseInt(i.trim())).filter(i => !isNaN(i))
    });
  }
  
  // Match reference section
  const referenceSectionRegex = /references|bibliography/i;
  const refSectionMatch = referenceSectionRegex.exec(pdfText);
  
  if (refSectionMatch) {
    const referencesStart = refSectionMatch.index;
    const referencesText = pdfText.substring(referencesStart);
    
    // Simple pattern matching for references
    // Example: "[1] Author, Title, Journal, Year"
    const referenceEntryRegex = /\[(\d+)\](.*?)(?=\[\d+\]|$)/gs;
    let refMatch;
    
    while ((refMatch = referenceEntryRegex.exec(referencesText)) !== null) {
      const index = parseInt(refMatch[1]);
      const text = refMatch[2].trim();
      
      citations.push({
        index,
        text,
        type: 'reference_entry'
      });
    }
  }
  
  return citations;
}
/**
 * Display academic search results in the results container
 */
function displayAcademicResults(results) {
  const academicResultsContainer = document.getElementById('academic-results-container');
  if (!academicResultsContainer) return;
  
  // Handle empty results
  if (!results || results.length === 0) {
    academicResultsContainer.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        No results found. Try a different search term or source.
      </div>
    `;
    return;
  }
  
  // Clear previous results
  academicResultsContainer.innerHTML = '';
  
  // Add each result to the container
  results.forEach((paper, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'paper-result-item list-group-item list-group-item-action';
    resultItem.dataset.paperId = paper.id;
    resultItem.dataset.paperUrl = paper.pdf_url || paper.url;
    resultItem.dataset.paperTitle = paper.title;
    
    // Source badge
    let sourceBadge = '';
    if (paper.source === 'arxiv') {
      sourceBadge = '<span class="academic-source-badge academic-source-arxiv me-2">arXiv</span>';
    } else if (paper.source === 'semantic') {
      sourceBadge = '<span class="academic-source-badge academic-source-semantic me-2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex') {
      sourceBadge = '<span class="academic-source-badge academic-source-openalex me-2">OpenAlex</span>';
    }
    
    // Build result item HTML
    resultItem.innerHTML = `
      <div class="d-flex align-items-start">
        <div class="form-check mt-1 me-2">
          <input class="form-check-input paper-select" type="checkbox" id="paper-${index}">
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <h6 class="mb-1">${paper.title}</h6>
          </div>
          <div class="mb-1">
            ${sourceBadge}
            <small class="text-muted">${paper.authors ? paper.authors.join(', ') : 'Unknown authors'}</small>
          </div>
          <p class="mb-1 small">${paper.abstract || 'No abstract available'}</p>
          <div class="mt-2">
            <span class="badge bg-light text-dark me-2">
              <i class="fas fa-file-pdf me-1 text-danger"></i> PDF ${paper.pdf_url ? 'Available' : 'Unavailable'}
            </span>
            <span class="badge bg-light text-dark">
              <i class="fas fa-calendar-alt me-1"></i> ${paper.date || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    `;
    
    // Add event handler to toggle selection when clicking on the item
    resultItem.addEventListener('click', function(e) {
      // Don't toggle if clicking on the checkbox directly
      if (e.target.type !== 'checkbox') {
        const checkbox = this.querySelector('.paper-select');
        checkbox.checked = !checkbox.checked;
      }
      
      // Toggle selected class for visual feedback
      this.classList.toggle('selected', this.querySelector('.paper-select').checked);
    });
    
    // Add to results container
    academicResultsContainer.appendChild(resultItem);
  });
}

/**
 * Add selected papers to the scraper URL list
 */
function addSelectedPapers() {
  const academicResultsContainer = document.getElementById('academic-results-container');
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  
  if (!academicResultsContainer || !scraperUrlsContainer) return;
  
  // Get selected papers
  const selectedPapers = academicResultsContainer.querySelectorAll('.paper-select:checked');
  
  if (selectedPapers.length === 0) {
    showToast('Warning', 'Please select at least one paper', 'warning');
    return;
  }
  
  // Add each selected paper to the scraper URLs
  selectedPapers.forEach(checkbox => {
    const paperItem = checkbox.closest('.paper-result-item');
    const paperUrl = paperItem.dataset.paperUrl;
    const paperTitle = paperItem.dataset.paperTitle;
    
    if (paperUrl) {
      // Add as PDF download
      addPaperToScraperUrls(paperUrl, paperTitle);
    }
  });
  
  // Show confirmation toast
  showToast('Success', `Added ${selectedPapers.length} papers to scraping list`, 'success');
  
  // Update PDF info section visibility
  updatePdfInfoSection();
}

/**
 * Add a paper to the scraper URLs list
 */
function addPaperToScraperUrls(url, title) {
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  if (!scraperUrlsContainer) return;
  
  // Create a new URL input group
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
  container.dataset.academic = 'true';
  
  container.innerHTML = `
    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" value="${url}" required />
    <select class="form-select scraper-settings" style="max-width: 160px;">
      <option value="pdf" selected>PDF Download</option>
      <option value="metadata">Metadata Only</option>
      <option value="full">Full Text</option>
      <option value="title">Title Only</option>
      <option value="keyword">Keyword Search</option>
    </select>
    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
    <button type="button" class="btn btn-outline-danger remove-url">
      <i class="fas fa-trash"></i>
    </button>
  `;
  
  // Add title as tooltip
  const urlInput = container.querySelector('.scraper-url');
  if (title) {
    urlInput.setAttribute('title', title);
    
    // Also add a custom badge with the title
    const badge = document.createElement('span');
    badge.className = 'position-absolute translate-middle badge rounded-pill bg-primary';
    badge.style.top = '-5px';
    badge.style.right = '-5px';
    badge.innerHTML = '<i class="fas fa-graduation-cap"></i>';
    badge.setAttribute('title', title);
    
    container.style.position = 'relative';
    container.appendChild(badge);
  }
  
  // Set up event listeners
  const settingsSelect = container.querySelector('.scraper-settings');
  settingsSelect.addEventListener('change', handleScraperSettingsChange);
  
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    container.remove();
    updatePdfInfoSection();
  });
  
  // Add to container
  scraperUrlsContainer.appendChild(container);
}

/**
 * Generate mock search results for development/testing
 */
function getMockSearchResults(query, source) {
  const mockResults = [
    {
      id: 'arxiv:2103.14030',
      title: `Recent Advances in ${query.charAt(0).toUpperCase() + query.slice(1)}`,
      authors: ['Smith, John', 'Johnson, Maria', 'Zhang, Wei'],
      abstract: `This paper provides an overview of ${query.toLowerCase()} techniques in deep neural networks, with applications in computer vision and natural language processing.`,
      pdf_url: 'https://arxiv.org/pdf/2103.14030.pdf',
      url: 'https://arxiv.org/abs/2103.14030',
      source: 'arxiv',
      date: '2023-05-15'
    },
    {
      id: 'semantic:85f2fb3a',
      title: `${query.charAt(0).toUpperCase() + query.slice(1)}: A Comprehensive Survey`,
      authors: ['Williams, Robert', 'Chen, Li'],
      abstract: `This survey provides a comprehensive overview of ${query.toLowerCase()} methods and their applications in various domains.`,
      pdf_url: 'https://www.example.com/papers/comprehensive_survey.pdf',
      url: 'https://www.semanticscholar.org/paper/comprehensive-survey',
      source: 'semantic',
      date: '2022-11-03'
    },
    {
      id: 'openalex:W3212567289',
      title: `${query.charAt(0).toUpperCase() + query.slice(1)} in Practice: Industry Applications`,
      authors: ['Garcia, Ana', 'Kumar, Raj', 'Brown, Steve'],
      abstract: `This paper explores recent advances in ${query.toLowerCase()} for industrial applications, with a focus on efficient methods for resource-constrained environments.`,
      pdf_url: 'https://www.example.com/papers/industry_applications.pdf',
      url: 'https://openalex.org/W3212567289',
      source: 'openalex',
      date: '2023-02-21'
    }
  ];
  
  // Filter by source if needed
  if (source !== 'all') {
    return mockResults.filter(result => result.source === source);
  }
  
  return mockResults;
}

//===========================
// Enhanced PDF Module System
//===========================

class PdfProcessor {
  constructor() {
    this.modules = []; // Available processor modules in priority order
    this.activeModule = null;
    this.capabilities = {
      tables: false,
      ocr: false,
      structure: false,
      repair: false
    };
    this.initialized = false;
  }

  async initialize() {
    // Try to initialize modules in priority order
    const possibleModules = [
      {
        name: 'pdf_extractor',
        check: () => pdf_extractor_available,
        get: () => pdf_extractor,
        init: async (module) => {
          const result = await module.initialize_module();
          return {
            tables: result.capabilities?.tables || false,
            ocr: result.capabilities?.ocr || false,
            structure: result.capabilities?.structure || false,
            repair: result.capabilities?.repair || false
          };
        }
      },
      {
        name: 'structify',
        check: () => structify_available && structify_module.process_pdf,
        get: () => structify_module,
        init: async () => ({
          tables: true, 
          ocr: true, 
          structure: false, 
          repair: false
        })
      },
      // Minimal fallback using PyMuPDF (if available)
      {
        name: 'pymupdf',
        check: () => {
          try {
            return require.resolve('fitz') !== null;
          } catch (e) {
            return false;
          }
        },
        get: () => require('fitz'),
        init: async () => ({
          tables: false, 
          ocr: false, 
          structure: false, 
          repair: false
        })
      }
    ];

    for (const moduleConfig of possibleModules) {
      try {
        if (moduleConfig.check()) {
          const module = moduleConfig.get();
          const capabilities = await moduleConfig.init(module);
          
          this.modules.push({
            name: moduleConfig.name,
            module,
            capabilities
          });
          
          logger.info(`Initialized PDF module: ${moduleConfig.name} with capabilities: ${JSON.stringify(capabilities)}`);
        }
      } catch (e) {
        logger.warn(`Failed to initialize PDF module ${moduleConfig.name}: ${e.message}`);
      }
    }

    if (this.modules.length > 0) {
      this.activeModule = this.modules[0];
      this.capabilities = this.activeModule.capabilities;
      this.initialized = true;
      logger.info(`Using PDF processor: ${this.activeModule.name}`);
      return true;
    }

    // Create minimal fallback if no modules available
    this.activeModule = {
      name: 'minimal',
      module: {
        process_pdf: this._minimalProcessPdf.bind(this)
      },
      capabilities: {
        tables: false,
        ocr: false,
        structure: false,
        repair: false
      }
    };
    this.initialized = true;
    logger.warn("Using minimal PDF processor with limited capabilities");
    return false;
  }

  // Fallback minimal PDF processor using built-in modules
  async _minimalProcessPdf(pdf_path, output_path, options = {}) {
    // Simple extraction using native modules
    const fs = require('fs');
    
    try {
      // Verify the file exists and is readable
      await fs.promises.access(pdf_path, fs.constants.R_OK);
      
      // Create basic JSON with minimal metadata
      const stats = await fs.promises.stat(pdf_path);
      
      const result = {
        file_path: pdf_path,
        file_size: stats.size,
        processing_date: new Date().toISOString(),
        status: "limited_processing",
        message: "Processed with minimal capabilities",
        chunks: [{
          text: "PDF content not available with minimal processor",
          page: 1
        }],
        metadata: {
          filename: pdf_path.split('/').pop()
        }
      };
      
      // Write the result to the output path
      await fs.promises.writeFile(
        output_path, 
        JSON.stringify(result, null, 2)
      );
      
      return result;
    } catch (e) {
      throw new Error(`Minimal PDF processing failed: ${e.message}`);
    }
  }

  async processPdf(pdf_path, output_path, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate inputs
    if (!pdf_path || typeof pdf_path !== 'string') {
      throw new Error('Invalid PDF path');
    }

    // Default options merged with user options
    const mergedOptions = {
      extract_tables: this.capabilities.tables,
      use_ocr: this.capabilities.ocr,
      extract_structure: this.capabilities.structure,
      chunk_size: 4096,
      ...options
    };

    // Metadata to track processing
    const processingMeta = {
      startTime: Date.now(),
      module: this.activeModule.name,
      retryCount: 0,
      memoryOptimized: false
    };

    try {
      // Attempt processing with active module
      return await this._processWithRetry(
        pdf_path, 
        output_path, 
        mergedOptions, 
        processingMeta
      );
    } catch (error) {
      // If primary module fails, try fallbacks
      logger.error(`PDF processing failed with ${this.activeModule.name}: ${error.message}`);
      
      // Try other modules in order if available
      for (let i = 1; i < this.modules.length; i++) {
        try {
          const fallbackModule = this.modules[i];
          logger.info(`Attempting fallback processing with ${fallbackModule.name}`);
          
          processingMeta.module = fallbackModule.name;
          processingMeta.retryCount = 0;
          
          return await this._processWithModule(
            fallbackModule.module,
            pdf_path,
            output_path, 
            mergedOptions,
            processingMeta
          );
        } catch (fallbackError) {
          logger.error(`Fallback ${this.modules[i].name} failed: ${fallbackError.message}`);
        }
      }

      // All processing attempts failed
      throw new Error(`PDF processing failed with all available modules: ${error.message}`);
    }
  }

  async _processWithRetry(pdf_path, output_path, options, meta, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        meta.retryCount = attempt;
        
        // On retry attempts, use more conservative options
        if (attempt > 0) {
          options = this._getMemoryOptimizedOptions(options, attempt);
          meta.memoryOptimized = true;
        }
        
        return await this._processWithModule(
          this.activeModule.module,
          pdf_path,
          output_path,
          options,
          meta
        );
      } catch (error) {
        // Check if error is memory-related
        if (attempt < maxRetries && this._isMemoryError(error)) {
          logger.warn(`Memory error on attempt ${attempt+1}, retrying with reduced options`);
          continue;
        }
        
        // Otherwise propagate the error
        throw error;
      }
    }
  }

  async _processWithModule(module, pdf_path, output_path, options, meta) {
    // Add timing and tracking
    const startTime = Date.now();
    
    try {
      // Use the appropriate processing method based on module
      let result;
      
      if (module.process_pdf) {
        result = await module.process_pdf(pdf_path, output_path, options);
      } else if (module.extract_text_from_pdf) {
        // If only text extraction is available
        const extractedData = await module.extract_text_from_pdf(pdf_path);
        
        // Format into standard result structure
        result = {
          status: "success",
          file_path: pdf_path,
          metadata: extractedData.metadata || {},
          full_text: extractedData.full_text || "",
          page_count: extractedData.page_count || 0,
          chunks: [{
            text: extractedData.full_text || "",
            page: 1
          }]
        };
        
        // Write result to output path
        await fs.promises.writeFile(
          output_path, 
          JSON.stringify(result, null, 2)
        );
      } else {
        throw new Error("Module doesn't have a supported processing method");
      }
      
      // Add processing metadata
      result.processing_info = {
        module: meta.module,
        retries: meta.retryCount,
        memory_optimized: meta.memoryOptimized,
        elapsed_seconds: (Date.now() - startTime) / 1000
      };
      
      return result;
    } catch (e) {
      const errorInfo = {
        module: meta.module,
        retries: meta.retryCount,
        memory_optimized: meta.memoryOptimized,
        elapsed_seconds: (Date.now() - startTime) / 1000,
        error: e.message
      };
      
      logger.error(`PDF processing error: ${JSON.stringify(errorInfo)}`);
      throw e;
    }
  }

  _getMemoryOptimizedOptions(options, retryAttempt) {
    // Progressively disable memory-intensive features
    const optimizedOptions = {...options};
    
    if (retryAttempt >= 1) {
      // First level optimization
      optimizedOptions.extract_tables = false;
      optimizedOptions.chunk_size = Math.min(options.chunk_size, 2048);
    }
    
    if (retryAttempt >= 2) {
      // Second level optimization
      optimizedOptions.use_ocr = false;
      optimizedOptions.extract_structure = false;
      optimizedOptions.chunk_size = Math.min(options.chunk_size, 1024);
    }
    
    return optimizedOptions;
  }

  _isMemoryError(error) {
    const errorStr = error.toString().toLowerCase();
    return (
      errorStr.includes('memory') || 
      errorStr.includes('allocation') || 
      errorStr.includes('heap') ||
      errorStr.includes('out of memory')
    );
  }
}

// Initialize the processor when the app starts
const pdfProcessor = new PdfProcessor();
pdfProcessor.initialize().then(success => {
  if (success) {
    logger.info(`PDF processor initialized with capabilities: ${JSON.stringify(pdfProcessor.capabilities)}`);
  } else {
    logger.warn('PDF processor initialized with limited capabilities');
  }
});


// Enhanced OCR detection and configuration
class OcrManager {
  constructor() {
    this.tesseractPath = null;
    this.tessdataPath = null;
    this.available = false;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return this.available;
    
    try {
      // Try to import pytesseract
      const pytesseract = await this._importPytesseract();
      if (!pytesseract) {
        logger.warn('Pytesseract not available');
        this.initialized = true;
        return false;
      }
      
      // Find Tesseract executable
      this.tesseractPath = await this._findTesseractPath();
      if (!this.tesseractPath) {
        logger.warn('Tesseract executable not found');
        this.initialized = true;
        return false;
      }
      
      // Set the path in pytesseract
      pytesseract.pytesseract.tesseract_cmd = this.tesseractPath;
      
      // Find or create tessdata directory
      this.tessdataPath = await this._setupTessdata();
      
      // Set environment variable
      process.env.TESSDATA_PREFIX = this.tessdataPath;
      
      // Test OCR on a simple image
      await this._testOcr(pytesseract);
      
      this.available = true;
      this.initialized = true;
      logger.info(`OCR initialized successfully: ${this.tesseractPath}, ${this.tessdataPath}`);
      return true;
    } catch (e) {
      logger.error(`OCR initialization failed: ${e.message}`);
      this.available = false;
      this.initialized = true;
      return false;
    }
  }

  async _importPytesseract() {
    try {
      return require('pytesseract');
    } catch (e) {
      return null;
    }
  }

  async _findTesseractPath() {
    const possiblePaths = [
      // Linux paths
      '/usr/bin/tesseract',
      '/usr/local/bin/tesseract',
      // Windows paths
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
      // MacOS (Homebrew)
      '/usr/local/Cellar/tesseract/*/bin/tesseract',
      '/opt/homebrew/bin/tesseract'
    ];
    
    // Check if any of the paths exist
    const fs = require('fs');
    for (const path of possiblePaths) {
      try {
        // Handle glob patterns for MacOS paths
        if (path.includes('*')) {
          const glob = require('glob');
          const matches = glob.sync(path);
          if (matches.length > 0) {
            return matches[0];
          }
          continue;
        }
        
        // Regular path check
        await fs.promises.access(path, fs.constants.X_OK);
        return path;
      } catch (e) {
        // Path doesn't exist or isn't executable
      }
    }
    
    // Try to find in PATH
    try {
      const { execSync } = require('child_process');
      const isWindows = process.platform === 'win32';
      
      const output = execSync(
        isWindows ? 'where tesseract' : 'which tesseract', 
        { encoding: 'utf8' }
      ).trim();
      
      if (output) {
        return output.split('\n')[0]; // Take first found path
      }
    } catch (e) {
      // Command failed, tesseract not in PATH
    }
    
    return null;
  }

  async _setupTessdata() {
    const fs = require('fs');
    const path = require('path');
    
    // Create tessdata in app directory
    const tessdataDir = path.join(__dirname, 'temp', 'tessdata');
    await fs.promises.mkdir(tessdataDir, { recursive: true });
    
    // Check for eng.traineddata
    const engTraineddata = path.join(tessdataDir, 'eng.traineddata');
    
    try {
      await fs.promises.access(engTraineddata, fs.constants.R_OK);
      logger.info('eng.traineddata already exists');
    } catch (e) {
      // File doesn't exist, try to download it
      await this._downloadTraineddata(engTraineddata);
    }
    
    return tessdataDir;
  }

  async _downloadTraineddata(targetPath) {
    const fs = require('fs');
    
    logger.info('Downloading eng.traineddata...');
    
    try {
      // Try node-fetch or axios
      let fetch;
      try {
        fetch = require('node-fetch');
      } catch (e) {
        fetch = require('axios').get;
      }
      
      // URL for English language data
      const url = 'https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata';
      
      // Download file
      const response = await fetch(url, { responseType: 'arraybuffer' });
      const data = response.data || await response.buffer();
      
      // Save to file
      await fs.promises.writeFile(targetPath, data);
      
      logger.info(`eng.traineddata downloaded to ${targetPath}`);
      return true;
    } catch (e) {
      logger.error(`Failed to download eng.traineddata: ${e.message}`);
      
      // Try to copy from system location if download fails
      try {
        const systemLocations = [
          '/usr/share/tesseract-ocr/4.00/tessdata/eng.traineddata',
          '/usr/share/tessdata/eng.traineddata',
          'C:\\Program Files\\Tesseract-OCR\\tessdata\\eng.traineddata'
        ];
        
        for (const location of systemLocations) {
          try {
            await fs.promises.access(location, fs.constants.R_OK);
            await fs.promises.copyFile(location, targetPath);
            logger.info(`Copied eng.traineddata from ${location}`);
            return true;
          } catch (e) {
            // Try next location
          }
        }
        
        logger.error('Could not download or copy eng.traineddata');
        return false;
      } catch (copyError) {
        logger.error(`Error copying traineddata: ${copyError.message}`);
        return false;
      }
    }
  }

  async _testOcr(pytesseract) {
    // Test OCR by creating a simple image with text
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(200, 80);
    const ctx = canvas.getContext('2d');
    
    // Draw some text on the canvas
    ctx.font = '30px Arial';
    ctx.fillStyle = 'black';
    ctx.fillText('Testing OCR', 10, 50);
    
    // Save canvas to a temporary file
    const fs = require('fs');
    const path = require('path');
    const tempPngPath = path.join(__dirname, 'temp', 'ocr_test.png');
    
    const buffer = canvas.toBuffer('image/png');
    await fs.promises.writeFile(tempPngPath, buffer);
    
    // Try OCR on the test image
    try {
      const text = await pytesseract.pytesseract.recognize(tempPngPath);
      if (!text || !text.trim().includes('Testing')) {
        throw new Error(`OCR test failed, got: ${text}`);
      }
      logger.info(`OCR test successful: "${text.trim()}"`);
      
      // Clean up test file
      await fs.promises.unlink(tempPngPath);
      return true;
    } catch (e) {
      logger.error(`OCR test failed: ${e.message}`);
      // Clean up test file
      try {
        await fs.promises.unlink(tempPngPath);
      } catch (err) {
        // Ignore cleanup error
      }
      return false;
    }
  }

  // Use this method for any OCR operations
  async performOcr(imagePath, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.available) {
      throw new Error('OCR is not available');
    }
    
    try {
      const pytesseract = require('pytesseract');
      
      // Set custom options
      const ocrOptions = {
        lang: options.lang || 'eng',
        psm: options.psm || 3, // Page segmentation mode
        oem: options.oem || 3, // OCR Engine mode
        ...options.config
      };
      
      // Run OCR
      return await pytesseract.pytesseract.recognize(
        imagePath, 
        ocrOptions
      );
    } catch (e) {
      logger.error(`OCR operation failed: ${e.message}`);
      throw new Error(`OCR failed: ${e.message}`);
    }
  }
}

// Initialize OCR manager
const ocrManager = new OcrManager();
ocrManager.initialize().then(available => {
  if (available) {
    logger.info('OCR system initialized successfully');
  } else {
    logger.warn('OCR system not available');
  }
});