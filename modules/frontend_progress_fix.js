/**
 * FRONTEND FIX: Fixed Progress Handler Functions
 * 
 * CRITICAL FIXES APPLIED:
 * 1. Eliminated duplicate progress indicators
 * 2. Direct progress assignment without smoothing interference  
 * 3. Comprehensive SocketIO event handling
 * 4. Enhanced debugging and validation
 */

/**
 * FIXED: Create progress UI with single unified display - NO DUPLICATES
 */
function createProgressUI(containerId, elementPrefix = '') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container not found: ${containerId}`);
    return null;
  }
  
  const prefix = elementPrefix ? `${elementPrefix}-` : '';
  
  // CRITICAL FIX: Single progress display - eliminates duplicate percentage indicators
  container.innerHTML = `
    <div class="progress-wrapper mb-3">
      <div class="progress" style="height: 24px; position: relative; background-color: #e9ecef; border-radius: 0.25rem;">
        <div id="${prefix}progress-bar" class="progress-bar bg-primary" 
            role="progressbar" style="width: 0%; height: 100%; display: flex; align-items: center; justify-content: center; transition: width 0.3s ease;" 
            aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <span class="progress-text" style="color: white; font-weight: bold; font-size: 0.875rem; z-index: 1;">0%</span>
        </div>
      </div>
      <div class="mt-2">
        <div id="${prefix}progress-status" class="text-muted">Initializing...</div>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-1">
        <div id="${prefix}elapsed-time" class="small text-muted">Elapsed: 0s</div>
        <div id="${prefix}eta-display" class="small text-muted d-none">ETA: calculating...</div>
      </div>
    </div>
    <div id="${prefix}progress-stats" class="progress-stats mb-3" style="display: none;">
      <div class="text-center py-2">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span>Initializing task...</span>
      </div>
    </div>
  `;
  
  // CRITICAL FIX: Return only necessary elements - NO progressPercentage duplicate
  const elements = {
    progressBar: document.getElementById(`${prefix}progress-bar`),
    progressText: document.querySelector(`#${prefix}progress-bar .progress-text`),
    progressStatus: document.getElementById(`${prefix}progress-status`),
    progressStats: document.getElementById(`${prefix}progress-stats`),
    etaDisplay: document.getElementById(`${prefix}eta-display`),
    elapsedTime: document.getElementById(`${prefix}elapsed-time`)
  };
  
  console.log(`FRONTEND DEBUG: Created progress UI for ${prefix}`, elements);
  return elements;
}

/**
 * FIXED: Direct progress update without smoothing interference
 */
function updateProgressUI(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update UI for unknown task: ${taskId}`);
    return false;
  }

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // CRITICAL FIX: Direct progress assignment - no smoothing or backward prevention
  const displayProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  
  console.log(`FRONTEND DEBUG: Updating progress for ${taskId}: ${displayProgress}% (original: ${progress})`);

  // CRITICAL FIX: Update progress bar with direct assignment
  if (elements.progressBar) {
    // Direct width assignment to prevent stuck progress
    elements.progressBar.style.width = `${displayProgress}%`;
    elements.progressBar.setAttribute('aria-valuenow', displayProgress);
    
    // Update integrated percentage text - SINGLE source of truth
    const progressText = elements.progressBar.querySelector('.progress-text') || elements.progressText;
    if (progressText) {
      progressText.textContent = `${Math.round(displayProgress)}%`;
    }
    
    // CRITICAL FIX: Update colors based on progress state
    elements.progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-success');
    if (displayProgress >= 100) {
      elements.progressBar.classList.add('bg-success');
      console.log(`FRONTEND DEBUG: Task ${taskId} marked as completed (100%)`);
    } else if (displayProgress >= 75) {
      elements.progressBar.classList.add('bg-info');
    } else if (displayProgress >= 50) {
      elements.progressBar.classList.add('bg-primary');
    } else {
      elements.progressBar.classList.add('bg-primary');
    }
  }

  // Update status message
  if (elements.progressStatus && message) {
    elements.progressStatus.textContent = message;
    console.log(`FRONTEND DEBUG: Updated status for ${taskId}: ${message}`);
  }

  // Update elapsed time if task has start time
  if (elements.elapsedTime && task.startTime) {
    const elapsed = Date.now() - task.startTime;
    elements.elapsedTime.textContent = `Elapsed: ${formatDuration(elapsed)}`;
  }

  // Update stats if available
  if (elements.progressStats && stats) {
    elements.progressStats.style.display = 'block';
    updateStatsDisplay(elements.progressStats, stats);
    console.log(`FRONTEND DEBUG: Updated stats for ${taskId}`, stats);
  }

  return true;
}

/**
 * FIXED: Comprehensive socket event handlers for all modules
 */
function setupTaskEventHandlers(taskId, options) {
  const handlers = { 
    socketHandlers: {}, 
    eventRegistry: {}, 
    dom: {} 
  };
  
  if (window.socket) {
    console.log(`FRONTEND DEBUG: Setting up event handlers for task ${taskId}`);
    
    // CRITICAL FIX: Unified progress handler for ALL progress events
    const progressHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`FRONTEND DEBUG: Received progress event for ${taskId}:`, {
          progress: data.progress,
          status: data.status,
          message: data.message,
          timestamp: data.timestamp
        });
        updateTaskProgress(taskId, data.progress, data.message, data.stats);
      }
    };
    
    // Task completed handler
    const completedHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`FRONTEND DEBUG: Task completed event for ${taskId}:`, data);
        completeTask(taskId, data);
      }
    };
    
    // Task error handler  
    const errorHandler = (data) => {
      if (data.task_id === taskId) {
        console.log(`FRONTEND DEBUG: Task error event for ${taskId}:`, data);
        errorTask(taskId, data.error || 'Unknown error', data);
      }
    };
    
    // CRITICAL FIX: Register ALL possible progress event names from backend
    const progressEvents = [
      'progress_update',          // Primary backend event
      'task_progress',            // Legacy compatibility
      'file_processing_progress', // File Processor module
      'playlist_progress',        // Playlist Downloader module
      'web_scraping_progress',    // Web Scraper module
      'pdf_download_progress',    // PDF download events
      'pdf_processing_progress'   // PDF processing events
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
    
    // Register unified handler for all progress events
    progressEvents.forEach(event => {
      window.socket.on(event, progressHandler);
      handlers.socketHandlers[event] = progressHandler;
      console.log(`FRONTEND DEBUG: Registered handler for ${event}`);
    });
    
    // Register completion event handlers
    completionEvents.forEach(event => {
      window.socket.on(event, completedHandler);
      handlers.socketHandlers[event] = completedHandler;
    });
    
    // Register error event handlers
    errorEvents.forEach(event => {
      window.socket.on(event, errorHandler);
      handlers.socketHandlers[event] = errorHandler;
    });
    
    // CRITICAL FIX: Also register task-type specific handlers if provided
    if (options.taskType) {
      const typeEvents = [
        `${options.taskType}_progress`,
        `${options.taskType}_completed`,
        `${options.taskType}_error`,
        `${options.taskType}_cancelled`
      ];
      
      typeEvents.forEach(event => {
        if (event.includes('progress')) {
          window.socket.on(event, progressHandler);
        } else if (event.includes('completed')) {
          window.socket.on(event, completedHandler);
        } else if (event.includes('error')) {
          window.socket.on(event, errorHandler);
        }
        handlers.socketHandlers[event] = progressHandler;
      });
    }
  }
  
  // Store handlers for cleanup
  state.eventHandlers.set(taskId, handlers);
  console.log(`FRONTEND DEBUG: Event handlers setup complete for ${taskId}`);
}

/**
 * FIXED: Update task progress with direct assignment
 */
function updateTaskProgress(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update unknown task: ${taskId}`);
    return;
  }

  const task = state.activeTasks.get(taskId);

  // CRITICAL FIX: Direct progress assignment - no smoothing interference
  const numericProgress = Number(progress) || 0;
  const clampedProgress = Math.max(0, Math.min(100, numericProgress));
  
  console.log(`FRONTEND DEBUG: updateTaskProgress called for ${taskId}: ${clampedProgress}%`);

  // Update task state directly
  task.progress = clampedProgress;
  task.message = message;
  task.lastUpdate = Date.now();
  
  if (stats) {
    task.stats = stats;
  }

  // Update UI immediately
  updateProgressUI(taskId, clampedProgress, message, stats);

  // CRITICAL FIX: Immediate completion check
  if (clampedProgress >= 100) {
    console.log(`FRONTEND DEBUG: Progress at 100% for ${taskId}, checking for completion`);
    
    // Set a brief timeout to allow completion event to arrive
    setTimeout(() => {
      const currentTask = state.activeTasks.get(taskId);
      if (currentTask && currentTask.progress >= 100 && currentTask.status !== 'completed') {
        console.log(`FRONTEND DEBUG: Auto-completing task ${taskId} after timeout`);
        completeTask(taskId, {
          ...currentTask,
          status: 'completed',
          output_file: currentTask.outputPath || null
        });
      }
    }, 1000); // Wait 1 second for backend completion event
  }
}

// CRITICAL FIX: Utility function to format duration
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return '0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Export fixed functions for use in progressHandler.js
export {
  createProgressUI,
  updateProgressUI, 
  setupTaskEventHandlers,
  updateTaskProgress,
  formatDuration
};
