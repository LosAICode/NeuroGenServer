/**
 * NeuroGen Server - Progress Handler Module
 * 
 * Provides functionality for tracking and displaying task progress.
 * Works with the UI module to update progress bars and status messages.
 * Handles resuming interrupted tasks, real-time updates via Socket.IO,
 * and provides a consistent interface for all modules to track progress.
 * 
 * @module progressHandler
 */

// Try to import UI module for UI updates
let ui;
try {
  ui = await import('../utils/ui.js').catch(e => {
    console.warn("UI module import failed in progressHandler:", e);
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
      }
    };
  });
} catch (e) {
  console.error("Error importing UI module in progressHandler:", e);
  // Provide fallback UI functions
  ui = {
    showToast: (title, message, type = 'info') => console.log(`Toast: ${title} - ${message}`),
    updateProgressBarElement: (progressBar, progress) => {
      if (!progressBar) return;
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${Math.round(progress)}%`;
    },
    updateProgressStatus: (statusElement, message) => {
      if (!statusElement) return;
      statusElement.textContent = message;
    },
    toggleElementVisibility: (element, visible) => {
      if (!element) return;
      element.style.display = visible ? 'block' : 'none';
    },
    transitionBetweenElements: (fromElement, toElement) => {
      if (!fromElement || !toElement) return;
      if (fromElement) fromElement.style.display = 'none';
      if (toElement) toElement.style.display = 'block';
    }
  };
}

// Try to import event registry
let eventRegistry;
try {
  eventRegistry = await import('../core/eventRegistry.js').catch(e => {
    console.warn("Event registry import failed in progressHandler:", e);
    return {
      on: () => {},
      off: () => {},
      emit: () => {}
    };
  });
  
  if (eventRegistry.default) {
    eventRegistry = eventRegistry.default;
  }
} catch (e) {
  console.error("Error importing event registry in progressHandler:", e);
  eventRegistry = {
    on: () => {},
    off: () => {},
    emit: () => {}
  };
}

// Try to import utils for formatting
let utils;
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
      }
    };
  });
} catch (e) {
  console.error("Error importing utils module:", e);
  utils = {
    formatBytes: (bytes) => `${bytes} bytes`,
    formatDuration: (seconds) => `${seconds}s`
  };
}

/**
 * Progress Handler utility
 */
const progressHandler = {
  // Active tasks being tracked
  activeTasks: new Map(),
  
  // Initialization status
  initialized: false,
  
  // Constants for configuration
  constants: {
    RECONNECT_ATTEMPTS: 5,
    STATUS_POLL_INTERVAL: 3000,
    TASK_CLEANUP_DELAY: 1000, 
    MAX_PROGRESS_RATES: 10,     // For ETA calculation
    SOCKET_EMIT_INTERVAL: 500,  // Minimum interval between socket emissions
    FORCE_CLEANUP_TIMEOUT: 5000 // Force cleanup timeout for stuck tasks
  },
  
  /**
   * Initialize the progress handler
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    if (this.initialized) {
      console.log('Progress handler already initialized');
      return true;
    }
    
    try {
      console.log('Initializing progress handler...');
      
      // Initialize storage for task statistics
      if (typeof localStorage !== 'undefined') {
        // Create task history if it doesn't exist
        if (!localStorage.getItem('taskHistory')) {
          localStorage.setItem('taskHistory', JSON.stringify([]));
        }
      }
      
      // Check for unfinished tasks in session storage
      this.checkForUnfinishedTasks();
      
      // Register event handlers
      this.registerEventHandlers();
      
      // Register with stateManager if available
      await this.registerWithStateManager();
      
      // Mark as initialized
      this.initialized = true;
      
      console.log('Progress handler initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing progress handler:', error);
      return false;
    }
  },
  
  /**
   * Register with state manager if available
   * @returns {Promise<void>}
   */
  async registerWithStateManager() {
    try {
      const stateManager = await import('../core/stateManager.js').catch(() => null);
      
      if (stateManager && typeof stateManager.subscribe === 'function') {
        // Subscribe to state changes if possible
        stateManager.subscribe('processingState', (newState) => {
          // Handle state changes
          if (newState && newState.currentTaskId && !this.activeTasks.has(newState.currentTaskId)) {
            console.log(`Task ID ${newState.currentTaskId} found in state manager but not in progress handler, adding it`);
            
            // Create a minimal task entry
            this.activeTasks.set(newState.currentTaskId, {
              id: newState.currentTaskId,
              type: newState.taskType || 'unknown',
              progress: newState.progress || 0,
              status: 'running',
              startTime: Date.now(),
              message: 'Processing...',
              resumed: true
            });
          }
        });
      }
    } catch (error) {
      console.warn('Failed to register with state manager:', error);
    }
  },
  
  /**
   * Register event handlers for progress updates
   */
  registerEventHandlers() {
    try {
      if (eventRegistry && typeof eventRegistry.on === 'function') {
        // Listen for socket events via event registry
        eventRegistry.on('socket.progress_update', (data) => {
          if (data && data.task_id && this.activeTasks.has(data.task_id)) {
            this.updateTaskProgress(data.task_id, data.progress, data.message, data.stats);
          }
        });
        
        eventRegistry.on('socket.task_completed', (data) => {
          if (data && data.task_id && this.activeTasks.has(data.task_id)) {
            this.completeTask(data.task_id, data);
          }
        });
        
        eventRegistry.on('socket.task_error', (data) => {
          if (data && data.task_id && this.activeTasks.has(data.task_id)) {
            this.errorTask(data.task_id, data.error || 'Unknown error');
          }
        });
        
        eventRegistry.on('socket.task_cancelled', (data) => {
          if (data && data.task_id && this.activeTasks.has(data.task_id)) {
            this.cancelTask(data.task_id);
          }
        });
        
        // Listen for direct cancel requests
        eventRegistry.on('task.cancel', (data) => {
          if (data && data.task_id && this.activeTasks.has(data.task_id)) {
            this.cancelTracking(data.task_id);
          }
        });
        
        // Listen for cleanup requests
        eventRegistry.on('system.cleanup', () => {
          this.cleanupStaleTasks();
        });
        
        console.log('Progress handler event listeners registered');
      } else {
        console.warn('Event registry not available for registering progress event handlers');
      }
      
      // Also listen for global socket events if available
      const socket = window.socket || (window.moduleInstances ? window.moduleInstances.socket : null);
      if (socket && typeof socket.on === 'function') {
        // Try to directly listen to socket events as backup
        try {
          socket.on('progress_update', (data) => {
            if (data && data.task_id && this.activeTasks.has(data.task_id)) {
              this.updateTaskProgress(data.task_id, data.progress, data.message, data.stats);
            }
          });
          
          socket.on('task_completed', (data) => {
            if (data && data.task_id && this.activeTasks.has(data.task_id)) {
              this.completeTask(data.task_id, data);
            }
          });
          
          socket.on('task_error', (data) => {
            if (data && data.task_id && this.activeTasks.has(data.task_id)) {
              this.errorTask(data.task_id, data.error || 'Unknown error');
            }
          });
          
          socket.on('task_cancelled', (data) => {
            if (data && data.task_id && this.activeTasks.has(data.task_id)) {
              this.cancelTask(data.task_id);
            }
          });
          
          console.log('Progress handler direct socket listeners registered');
        } catch (e) {
          console.warn('Error setting up direct socket listeners:', e);
        }
      }
    } catch (error) {
      console.error('Error registering event handlers:', error);
    }
  },
  
  /**
   * Check for unfinished tasks in session storage
   */
  checkForUnfinishedTasks() {
    try {
      const taskId = sessionStorage.getItem('ongoingTaskId');
      const taskType = sessionStorage.getItem('ongoingTaskType');
      const taskStartTime = sessionStorage.getItem('taskStartTime');
      
      if (taskId && taskType) {
        console.log(`Found unfinished task: ${taskId} (${taskType})`);
        
        // Check if the task has been running for too long (>30 minutes)
        if (taskStartTime) {
          const startTime = parseInt(taskStartTime, 10);
          const now = Date.now();
          
          // If task has been running for more than 30 minutes, it might be stuck
          if (now - startTime > 30 * 60 * 1000) {
            console.warn(`Task ${taskId} has been running for more than 30 minutes, may be stuck`);
            
            // Show warning in UI
            ui.showToast('Warning', 'A task has been running for a long time and may be stuck. It will be automatically cleaned up.', 'warning');
            
            // Clean up the task
            this.cleanupTask(taskId);
            return;
          }
        }
        
        // Create a placeholder task entry
        this.activeTasks.set(taskId, {
          id: taskId,
          type: taskType,
          progress: 0,
          status: 'pending',
          startTime: taskStartTime ? parseInt(taskStartTime, 10) : Date.now(),
          message: 'Resuming task...',
          resumed: true,
          progressRates: [], // For ETA calculation
          lastUpdateTime: Date.now()
        });
        
        // Emit an event to notify other modules about the resumed task
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('progress.task_resumed', {
            task_id: taskId,
            task_type: taskType
          });
        }
        
        // Request current status
        this.requestTaskStatus(taskId);
      }
    } catch (error) {
      console.warn('Error checking for unfinished tasks:', error);
    }
  },
  
  /**
   * Request current status for a task
   * @param {string} taskId - Task ID to request status for
   */
  requestTaskStatus(taskId) {
    try {
      // Try event registry first
      if (eventRegistry && typeof eventRegistry.emit === 'function') {
        eventRegistry.emit('socket.request_status', { task_id: taskId });
      }
      
      // Also try direct socket if available
      const socket = window.socket || (window.moduleInstances ? window.moduleInstances.socket : null);
      if (socket && typeof socket.emit === 'function') {
        socket.emit('request_status', { task_id: taskId });
      }
      
      // Fallback to fetch API
      fetch(`/api/status/${taskId}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to get task status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          // Process the status update
          if (data && data.task_id === taskId) {
            if (data.status === 'completed') {
              this.completeTask(taskId, data);
            } else if (data.status === 'error' || data.status === 'failed') {
              this.errorTask(taskId, data.error || 'Unknown error');
            } else if (data.status === 'cancelled') {
              this.cancelTask(taskId);
            } else {
              // Update progress
              this.updateTaskProgress(
                taskId, 
                data.progress || 0, 
                data.message || 'Processing...', 
                data.stats || {}
              );
            }
          }
        })
        .catch(error => {
          console.warn(`Error requesting task status for ${taskId}:`, error);
          
          // If we couldn't get the status, assume the task may be lost
          if (this.activeTasks.has(taskId)) {
            const task = this.activeTasks.get(taskId);
            
            // If the task was resumed and we can't get status, it probably doesn't exist anymore
            if (task.resumed) {
              console.warn(`Resumed task ${taskId} not found on server, cleaning up`);
              this.cleanupTask(taskId);
            }
          }
        });
    } catch (error) {
      console.warn(`Error requesting task status for ${taskId}:`, error);
    }
  },
  
  /**
   * Clean up a task by removing it from storage and active tasks
   * @param {string} taskId - Task ID to clean up
   */
  cleanupTask(taskId) {
    try {
      // Remove from session storage
      if (sessionStorage.getItem('ongoingTaskId') === taskId) {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
        sessionStorage.removeItem('outputFile');
      }
      
      // Remove from active tasks
      this.activeTasks.delete(taskId);
      
      console.log(`Task ${taskId} cleaned up`);
    } catch (error) {
      console.warn(`Error cleaning up task ${taskId}:`, error);
    }
  },
  
  /**
   * Clean up stale tasks that have not been updated in a while
   */
  cleanupStaleTasks() {
    try {
      const now = Date.now();
      const staleThreshold = 30 * 60 * 1000; // 30 minutes
      
      // Find stale tasks
      for (const [taskId, task] of this.activeTasks.entries()) {
        // Skip tasks that are already completed, cancelled, or have error status
        if (['completed', 'cancelled', 'error'].includes(task.status)) {
          continue;
        }
        
        // Check if the task has not been updated in a while
        const lastUpdateTime = task.lastUpdateTime || task.startTime;
        if (now - lastUpdateTime > staleThreshold) {
          console.warn(`Task ${taskId} has not been updated in 30 minutes, marking as stale`);
          
          // Mark as error
          this.errorTask(taskId, 'Task timed out - no updates received for 30 minutes');
        }
      }
    } catch (error) {
      console.warn('Error cleaning up stale tasks:', error);
    }
  },
  
  /**
   * Add a task to history
   * @param {string} taskId - Task ID
   * @param {Object} taskData - Task data
   */
  addTaskToHistory(taskId, taskData) {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      
      // Get existing history
      const historyString = localStorage.getItem('taskHistory') || '[]';
      let history = [];
      try {
        history = JSON.parse(historyString);
      } catch (e) {
        console.warn('Error parsing task history:', e);
        history = [];
      }
      
      // Create history entry
      const historyEntry = {
        id: taskId,
        type: taskData.type || 'unknown',
        status: taskData.status,
        startTime: taskData.startTime,
        endTime: taskData.endTime || Date.now(),
        output: taskData.result?.output_file || taskData.outputFile,
        message: taskData.message,
        error: taskData.error,
        timestamp: Date.now()
      };
      
      // Add to beginning of history
      history.unshift(historyEntry);
      
      // Limit history size
      if (history.length > 50) {
        history = history.slice(0, 50);
      }
      
      // Save updated history
      localStorage.setItem('taskHistory', JSON.stringify(history));
    } catch (error) {
      console.warn('Error adding task to history:', error);
    }
  },
  
  /**
   * Set up progress tracking for a task
   * @param {string} taskId - Unique task ID
   * @param {Object} options - Setup options
   * @param {string} options.elementPrefix - Prefix for DOM elements
   * @param {boolean} options.saveToSessionStorage - Whether to save task info to session storage
   * @param {string} options.taskType - Type of task (for session storage)
   * @returns {Object} - Progress handler APIs
   */
  setupTaskProgress(taskId, options = {}) {
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
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      options,
      progressRates: [], // For ETA calculation
      outputFile: null
    };
    
    // Save to active tasks map
    this.activeTasks.set(taskId, taskInfo);
    
    // Save to session storage if requested
    if (options.saveToSessionStorage && options.taskType) {
      sessionStorage.setItem('ongoingTaskId', taskId);
      sessionStorage.setItem('ongoingTaskType', options.taskType);
      sessionStorage.setItem('taskStartTime', Date.now().toString());
      console.log(`Saved task ${taskId} (${options.taskType}) to session storage`);
    }
    
    // Try to set up initial UI elements
    const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
    const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
    
    if (!progressBar) {
      console.log(`Progress bar element not found with ID: ${options.elementPrefix || ''}progress-bar`);
      // Try to create progress UI if container exists
      const container = document.getElementById(`${options.elementPrefix || ''}progress-container`);
      if (container) {
        this.createProgressUI(container.id, options.elementPrefix || '');
      }
    }
    
    // Return handler functions
    return {
      /**
       * Update progress for the task
       * @param {number} progress - Progress percentage (0-100)
       * @param {string} message - Status message
       * @param {Object} stats - Optional statistics
       */
      updateProgress: (progress, message, stats = null) => {
        if (!this.activeTasks.has(taskId)) return;
        
        const task = this.activeTasks.get(taskId);
        
        // Update task info
        task.progress = progress;
        task.message = message;
        task.status = 'running';
        task.lastUpdateTime = Date.now();
        if (stats) task.stats = stats;
        
        // Calculate ETA
        this.calculateETA(taskId, progress);
        
        // Update UI if element exists
        const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
        const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
        const progressStats = document.getElementById(`${options.elementPrefix || ''}progress-stats`);
        
        if (progressBar) {
          if (ui && typeof ui.updateProgressBarElement === 'function') {
            ui.updateProgressBarElement(progressBar, progress);
          } else {
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            progressBar.textContent = `${progress}%`;
          }
        }
        
        if (progressStatus && message) {
          // Format message with ETA if available
          let displayMessage = message;
          
          if (task.eta && task.timeRemaining) {
            displayMessage += ` (ETA: ${utils.formatDuration(task.timeRemaining)})`;
          }
          
          if (ui && typeof ui.updateProgressStatus === 'function') {
            ui.updateProgressStatus(progressStatus, displayMessage);
          } else {
            progressStatus.textContent = displayMessage;
          }
        }
        
        // Update stats if available
        if (progressStats && stats) {
          if (typeof progressStats.innerHTML === 'string') {
            this.updateStatsDisplay(progressStats, stats, task);
          }
        }
        
        // Emit progress update event
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('progress.update', {
            task_id: taskId,
            progress: progress,
            message: message,
            stats: stats
          });
        }
        
        console.log(`Task ${taskId} progress: ${progress}% - ${message || ''}`);
      },
      
      /**
       * Mark task as completed
       * @param {Object} result - Task completion result
       */
      complete: (result) => {
        if (!this.activeTasks.has(taskId)) return;
        
        const task = this.activeTasks.get(taskId);
        
        // Store output file in task
        if (result && result.output_file) {
          task.outputFile = result.output_file;
        }
        
        task.progress = 100;
        task.status = 'completed';
        task.result = result;
        task.endTime = Date.now();
        
        // Update UI if element exists
        const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
        const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
        
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.setAttribute('aria-valuenow', 100);
          progressBar.textContent = '100%';
          progressBar.classList.remove('bg-danger', 'bg-warning');
          progressBar.classList.add('bg-success');
        }
        
        if (progressStatus) {
          progressStatus.textContent = 'Task completed successfully';
          progressStatus.classList.remove('text-danger', 'text-warning');
        }
        
        console.log(`Task ${taskId} completed`);
        
        // Clean up session storage
        if (options.saveToSessionStorage) {
          const storedTaskId = sessionStorage.getItem('ongoingTaskId');
          if (storedTaskId === taskId) {
            sessionStorage.removeItem('ongoingTaskId');
            sessionStorage.removeItem('ongoingTaskType');
            sessionStorage.removeItem('taskStartTime');
          }
        }
        
        // Add to task history
        this.addTaskToHistory(taskId, task);
        
        // Emit completion event
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('progress.completed', {
            task_id: taskId,
            result: result
          });
        }
        
        // Remove from active tasks after a delay
        setTimeout(() => {
          this.activeTasks.delete(taskId);
        }, this.constants.TASK_CLEANUP_DELAY);
      },
      
      /**
       * Mark task as failed
       * @param {Error|string} error - Error that occurred
       */
      error: (error) => {
        if (!this.activeTasks.has(taskId)) return;
        
        const task = this.activeTasks.get(taskId);
        task.status = 'error';
        task.error = error;
        task.endTime = Date.now();
        
        // Update UI if element exists
        const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
        const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
        
        if (progressBar) {
          progressBar.classList.remove('bg-primary', 'bg-success', 'bg-warning');
          progressBar.classList.add('bg-danger');
        }
        
        if (progressStatus) {
          progressStatus.textContent = `Error: ${error.message || error}`;
          progressStatus.classList.remove('text-warning');
          progressStatus.classList.add('text-danger');
        }
        
        console.error(`Task ${taskId} error:`, error);
        
        // Show toast if UI module is available
        if (ui && typeof ui.showToast === 'function') {
          ui.showToast('Task Error', typeof error === 'string' ? error : (error.message || 'Unknown error'), 'error');
        }
        
        // Clean up session storage
        if (options.saveToSessionStorage) {
          const storedTaskId = sessionStorage.getItem('ongoingTaskId');
          if (storedTaskId === taskId) {
            sessionStorage.removeItem('ongoingTaskId');
            sessionStorage.removeItem('ongoingTaskType');
            sessionStorage.removeItem('taskStartTime');
          }
        }
        
        // Add to task history
        this.addTaskToHistory(taskId, task);
        
        // Emit error event
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('progress.error', {
            task_id: taskId,
            error: error
          });
        }
        
        // Remove from active tasks after a delay
        setTimeout(() => {
          this.activeTasks.delete(taskId);
        }, this.constants.TASK_CLEANUP_DELAY);
      },
      
      /**
       * Cancel the task
       */
      cancel: () => {
        if (!this.activeTasks.has(taskId)) return;
        
        const task = this.activeTasks.get(taskId);
        task.status = 'cancelled';
        task.endTime = Date.now();
        
        // Update UI if element exists
        const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
        const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
        
        if (progressBar) {
          progressBar.classList.remove('bg-primary', 'bg-success', 'bg-danger');
          progressBar.classList.add('bg-warning');
        }
        
        if (progressStatus) {
          progressStatus.textContent = 'Task cancelled';
          progressStatus.classList.remove('text-danger');
          progressStatus.classList.add('text-warning');
        }
        
        console.log(`Task ${taskId} cancelled`);
        
        // Clean up session storage
        if (options.saveToSessionStorage) {
          const storedTaskId = sessionStorage.getItem('ongoingTaskId');
          if (storedTaskId === taskId) {
            sessionStorage.removeItem('ongoingTaskId');
            sessionStorage.removeItem('ongoingTaskType');
            sessionStorage.removeItem('taskStartTime');
          }
        }
        
        // Add to task history
        this.addTaskToHistory(taskId, task);
        
        // Emit cancelled event
        if (eventRegistry && typeof eventRegistry.emit === 'function') {
          eventRegistry.emit('progress.cancelled', {
            task_id: taskId
          });
        }
        
        // Remove from active tasks after a delay
        setTimeout(() => {
          this.activeTasks.delete(taskId);
        }, this.constants.TASK_CLEANUP_DELAY);
      },
      
      /**
       * Get current task status
       * @returns {Object} - Task status info
       */
      getStatus: () => {
        if (!this.activeTasks.has(taskId)) {
          return { status: 'unknown', message: 'Task not found' };
        }
        
        const task = this.activeTasks.get(taskId);
        return {
          id: taskId,
          progress: task.progress,
          status: task.status,
          message: task.message,
          startTime: task.startTime,
          lastUpdateTime: task.lastUpdateTime,
          endTime: task.endTime,
          stats: task.stats || {},
          eta: task.eta,
          timeRemaining: task.timeRemaining
        };
      },
      
      /**
       * Store an output file path for the task
       * @param {string} outputFile - Path to the output file
       */
      setOutputFile: (outputFile) => {
        if (!this.activeTasks.has(taskId)) return;
        
        const task = this.activeTasks.get(taskId);
        task.outputFile = outputFile;
        
        // Also update session storage if requested
        if (options.saveToSessionStorage) {
          sessionStorage.setItem('outputFile', outputFile);
        }
      }
    };
  },
  
  /**
   * Track progress from socket events and polling
   * @param {string} taskId - Task ID
   * @param {Object} options - Options
   * @returns {Object} - Progress tracking functions
   */
  trackProgress(taskId, options = {}) {
    if (!taskId) {
      console.error('Task ID required for progress tracking');
      return null;
    }
    
    // Set up progress handling
    const progressHandlers = this.setupTaskProgress(taskId, options);
    
    // Store handlers in the task
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.get(taskId).handlers = progressHandlers;
    }
    
    // Create socket event handler subscription
    const updateHandler = data => {
      if (data && data.task_id === taskId && data.progress !== undefined) {
        progressHandlers.updateProgress(data.progress, data.message || 'Processing...', data.stats);
      }
    };
    
    const completedHandler = data => {
      if (data && data.task_id === taskId) {
        progressHandlers.complete(data);
      }
    };
    
    const errorHandler = data => {
      if (data && data.task_id === taskId) {
        progressHandlers.error(data.error || 'Unknown error');
      }
    };
    
    const cancelledHandler = data => {
      if (data && data.task_id === taskId) {
        progressHandlers.cancel();
      }
    };
    
    // Register event handlers
    if (eventRegistry && typeof eventRegistry.on === 'function') {
      eventRegistry.on('socket.progress_update', updateHandler);
      eventRegistry.on('socket.task_completed', completedHandler);
      eventRegistry.on('socket.task_error', errorHandler);
      eventRegistry.on('socket.task_cancelled', cancelledHandler);
      
      // Emit an event to request initial status
      eventRegistry.emit('socket.request_status', { task_id: taskId });
    }
    
    // Add socket polling if applicable
    const socket = window.socket || (window.moduleInstances ? window.moduleInstances.socket : null);
    if (socket && typeof socket.emit === 'function') {
      // Try to set up direct socket communication
      try {
        socket.emit('request_status', { task_id: taskId });
        
        // Start periodic status requests
        const statusInterval = setInterval(() => {
          if (this.activeTasks.has(taskId) && 
              this.activeTasks.get(taskId).status !== 'completed' && 
              this.activeTasks.get(taskId).status !== 'error' && 
              this.activeTasks.get(taskId).status !== 'cancelled') {
            socket.emit('request_status', { task_id: taskId });
          } else {
            clearInterval(statusInterval);
          }
        }, this.constants.STATUS_POLL_INTERVAL);
        
        // Store interval ID for cleanup
        if (this.activeTasks.has(taskId)) {
          this.activeTasks.get(taskId).statusInterval = statusInterval;
        }
      } catch (e) {
        console.warn('Error setting up socket polling:', e);
      }
    } else {
      // No socket available, set up fetch polling as last resort
      console.log('Socket not available, setting up fetch API polling');
      
      const statusInterval = setInterval(() => {
        if (this.activeTasks.has(taskId) && 
            this.activeTasks.get(taskId).status !== 'completed' && 
            this.activeTasks.get(taskId).status !== 'error' && 
            this.activeTasks.get(taskId).status !== 'cancelled') {
          
          // Use fetch API to get status
          fetch(`/api/status/${taskId}`)
            .then(response => {
              if (!response.ok) {
                throw new Error(`Failed to get task status: ${response.status}`);
              }
              return response.json();
            })
            .then(data => {
              if (data.status === 'completed') {
                progressHandlers.complete(data);
              } else if (data.status === 'error' || data.status === 'failed') {
                progressHandlers.error(data.error || 'Unknown error');
              } else if (data.status === 'cancelled') {
                progressHandlers.cancel();
              } else {
                // Update progress
                progressHandlers.updateProgress(
                  data.progress || 0, 
                  data.message || 'Processing...', 
                  data.stats || {}
                );
              }
            })
            .catch(error => {
              console.warn(`Error polling for status: ${error.message}`);
              // Don't cancel on errors, as network issues could be temporary
            });
        } else {
          clearInterval(statusInterval);
        }
      }, this.constants.STATUS_POLL_INTERVAL);
      
      // Store interval ID for cleanup
      if (this.activeTasks.has(taskId)) {
        this.activeTasks.get(taskId).statusInterval = statusInterval;
      }
    }
    
    return {
      ...progressHandlers,
      
      /**
       * Cancel tracking and cleanup event handlers
       */
      cancelTracking: () => {
        // Send cancel request to server if socket is available
        const socket = window.socket || (window.moduleInstances ? window.moduleInstances.socket : null);
        if (socket && typeof socket.emit === 'function') {
          try {
            socket.emit('cancel_task', { task_id: taskId });
          } catch (e) {
            console.warn('Error sending cancel request via socket:', e);
          }
        }
        
        // Also try via fetch API
        fetch('/api/cancel-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId })
        }).catch(error => {
          console.warn('Error sending cancel request via fetch:', error);
        });
        
        // Remove event listeners
        if (eventRegistry && typeof eventRegistry.off === 'function') {
          eventRegistry.off('socket.progress_update', updateHandler);
          eventRegistry.off('socket.task_completed', completedHandler);
          eventRegistry.off('socket.task_error', errorHandler);
          eventRegistry.off('socket.task_cancelled', cancelledHandler);
        }
        
        // Clear status polling interval
        if (this.activeTasks.has(taskId) && this.activeTasks.get(taskId).statusInterval) {
          clearInterval(this.activeTasks.get(taskId).statusInterval);
        }
        
        // Cancel the task
        progressHandlers.cancel();
      }
    };
  },
  
  /**
   * Calculate estimated time to completion and update task info
   * @param {string} taskId - Task ID
   * @param {number} currentProgress - Current progress percentage
   */
  calculateETA(taskId, currentProgress) {
    try {
      if (!this.activeTasks.has(taskId)) return;
      
      const task = this.activeTasks.get(taskId);
      const now = Date.now();
      
      // We need at least one previous update to calculate rate
      if (!task.lastProgressUpdate) {
        task.lastProgressUpdate = {
          time: now,
          progress: currentProgress
        };
        return;
      }
      
      // Calculate progress rate (% per ms)
      const timeDiff = now - task.lastProgressUpdate.time;
      const progressDiff = currentProgress - task.lastProgressUpdate.progress;
      
      // Only update if meaningful progress has been made
      if (timeDiff > 1000 && progressDiff > 0) {
        const rate = progressDiff / timeDiff;
        
        // Add to rates array for averaging
        task.progressRates = task.progressRates || [];
        task.progressRates.push(rate);
        
        // Keep only the last few measurements
        if (task.progressRates.length > this.constants.MAX_PROGRESS_RATES) {
          task.progressRates.shift();
        }
        
        // Calculate average rate with more weight on recent updates
        let totalWeightedRate = 0;
        let totalWeight = 0;
        
        task.progressRates.forEach((rate, index) => {
          // Give more weight to recent updates
          const weight = index + 1;
          totalWeightedRate += rate * weight;
          totalWeight += weight;
        });
        
        const avgRate = totalWeight > 0 ? totalWeightedRate / totalWeight : 0;
        
        // Calculate remaining time
        if (avgRate > 0) {
          const remainingProgress = 100 - currentProgress;
          const remainingTimeMs = remainingProgress / avgRate;
          const remainingTimeSec = Math.ceil(remainingTimeMs / 1000);
          
          // Calculate ETA time
          const etaTime = new Date(now + remainingTimeMs);
          
          // Update task with ETA info
          task.eta = etaTime;
          task.timeRemaining = remainingTimeSec;
        }
        
        // Update last progress point
        task.lastProgressUpdate = {
          time: now,
          progress: currentProgress
        };
      }
    } catch (error) {
      console.warn(`Error calculating ETA for task ${taskId}:`, error);
    }
  },
  
  /**
   * Update the stats display with a nicely formatted UI
   * @param {HTMLElement} statsElement - The element to update
   * @param {Object} stats - The statistics object
   * @param {Object} task - The task object
   */
  updateStatsDisplay(statsElement, stats, task) {
    try {
      // Format ETA info if available
      let etaHtml = '';
      if (task.eta && task.timeRemaining) {
        const etaTimeString = task.eta.toLocaleTimeString();
        etaHtml = `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge bg-info">ETA: ${etaTimeString}</span>
            <span class="badge bg-secondary">Remaining: ${utils.formatDuration(task.timeRemaining)}</span>
          </div>
        `;
      }
      
      // Create stats container with nice formatting
      let statsHtml = `
        <div class="progress-stats-container">
          ${etaHtml}
          <ul class="list-group">
      `;
      
      // Keys to display first in a specific order
      const priorityKeys = [
        'total_files', 'processed_files', 'error_files', 'skipped_files',
        'pdf_files', 'tables_extracted', 'total_bytes', 'elapsed_seconds'
      ];
      
      // First add priority keys in order
      priorityKeys.forEach(key => {
        if (stats[key] !== undefined) {
          let displayValue = stats[key];
          let keyLabel = key.replace(/_/g, ' ');
          
          // Format special values
          if (key === 'total_bytes' && typeof utils.formatBytes === 'function') {
            displayValue = utils.formatBytes(stats[key]);
          } else if ((key === 'elapsed_seconds' || key.includes('_seconds')) && typeof utils.formatDuration === 'function') {
            displayValue = utils.formatDuration(stats[key]);
          }
          
          statsHtml += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <span>${keyLabel}</span>
              <span class="badge ${this.getStatsBadgeClass(key)} rounded-pill">${displayValue}</span>
            </li>
          `;
        }
      });
      
      // Then add remaining keys
      for (const [key, value] of Object.entries(stats)) {
        // Skip already displayed priority keys
        if (priorityKeys.includes(key)) continue;
        
        // Skip objects and other complex values
        if (typeof value !== 'object' && value !== null) {
          let displayValue = value;
          let keyLabel = key.replace(/_/g, ' ');
          
          // Format special values
          if (key.includes('bytes') && typeof utils.formatBytes === 'function') {
            displayValue = utils.formatBytes(value);
          } else if ((key.includes('_seconds') || key.includes('time')) && typeof utils.formatDuration === 'function') {
            displayValue = utils.formatDuration(value);
          }
          
          statsHtml += `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <span>${keyLabel}</span>
              <span class="badge ${this.getStatsBadgeClass(key)} rounded-pill">${displayValue}</span>
            </li>
          `;
        }
      }
      
      // Add current file if available
      if (stats.current_file) {
        statsHtml += `
          </ul>
          <div class="alert alert-info mt-2 small py-2">
            <div class="text-truncate current-file">
              <i class="fas fa-file-alt me-1"></i> ${stats.current_file}
            </div>
          </div>
        `;
      } else {
        statsHtml += '</ul>';
      }
      
      statsHtml += '</div>';
      
      // Update the stats element
      statsElement.innerHTML = statsHtml;
    } catch (error) {
      console.warn('Error updating stats display:', error);
      // Fallback to simple display
      let fallbackHtml = '<ul class="list-group">';
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value !== 'object') {
          fallbackHtml += `<li class="list-group-item d-flex justify-content-between">
            <span>${key.replace(/_/g, ' ')}</span>
            <span>${value}</span>
          </li>`;
        }
      }
      fallbackHtml += '</ul>';
      statsElement.innerHTML = fallbackHtml;
    }
  },
  
  /**
   * Get appropriate badge class for stats item based on key name
   * @param {string} key - Stats key
   * @returns {string} - Badge class
   */
  getStatsBadgeClass(key) {
    if (key.includes('error') || key.includes('failed')) {
      return 'bg-danger';
    } else if (key.includes('skipped') || key.includes('warning')) {
      return 'bg-warning';
    } else if (key.includes('processed') || key.includes('success') || key.includes('completed')) {
      return 'bg-success';
    } else if (key.includes('total_')) {
      return 'bg-primary';
    } else if (key.includes('bytes')) {
      return 'bg-secondary';
    } else if (key.includes('time') || key.includes('seconds')) {
      return 'bg-dark';
    } else if (key.includes('extracted') || key.includes('pdf')) {
      return 'bg-info';
    }
    return 'bg-secondary';
  },
  
  /**
   * Update progress UI for a task
   * @param {string} taskId - Task ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Status message
   * @param {Object} stats - Optional statistics
   * @returns {boolean} - Success
   */
  updateProgressUI(taskId, progress, message, stats = null) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot update progress for unknown task: ${taskId}`);
      return false;
    }
    
    const task = this.activeTasks.get(taskId);
    const options = task.options || {};
    
    // Update UI elements
    const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
    const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
    const progressStats = document.getElementById(`${options.elementPrefix || ''}progress-stats`);
    
    // Update progress bar
    if (progressBar) {
      if (ui && typeof ui.updateProgressBarElement === 'function') {
        ui.updateProgressBarElement(progressBar, progress);
      } else {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        progressBar.textContent = `${progress}%`;
      }
      
      // Update status
      task.progress = progress;
    }
    
    // Calculate ETA
    this.calculateETA(taskId, progress);
    
    // Update status message
    if (progressStatus && message) {
      // Format message with ETA if available
      let displayMessage = message;
      
      if (task.eta && task.timeRemaining) {
        displayMessage += ` (ETA: ${utils.formatDuration(task.timeRemaining)})`;
      }
      
      if (ui && typeof ui.updateProgressStatus === 'function') {
        ui.updateProgressStatus(progressStatus, displayMessage);
      } else {
        progressStatus.textContent = displayMessage;
      }
      
      // Update message
      task.message = message;
    }
    
    // Update stats if available
    if (progressStats && stats) {
      this.updateStatsDisplay(progressStats, stats, task);
      
      // Update stats
      task.stats = stats;
    }
    
    return true;
  },
  
  /**
   * Update a task's progress from external source
   * @param {string} taskId - Task ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Status message
   * @param {Object} stats - Optional statistics
   */
  updateTaskProgress(taskId, progress, message, stats = null) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot update unknown task: ${taskId}`);
      return;
    }
    
    const task = this.activeTasks.get(taskId);
    
    // Update task info
    task.progress = progress;
    task.message = message;
    task.lastUpdateTime = Date.now();
    if (stats) task.stats = stats;
    
    // Update UI
    this.updateProgressUI(taskId, progress, message, stats);
    
    // Also update via handlers if available
    if (task.handlers && typeof task.handlers.updateProgress === 'function') {
      task.handlers.updateProgress(progress, message, stats);
    }
  },
  
  /**
   * Complete a task
   * @param {string} taskId - Task ID
   * @param {Object} result - Task result
   */
  completeTask(taskId, result) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot complete unknown task: ${taskId}`);
      return;
    }
    
    const task = this.activeTasks.get(taskId);
    const options = task.options || {};
    
    // Set task as completed
    task.progress = 100;
    task.status = 'completed';
    task.result = result;
    task.endTime = Date.now();
    
    // Store output file path if provided
    if (result && result.output_file) {
      task.outputFile = result.output_file;
    }
    
    // Update UI elements
    const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
    const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
    
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.setAttribute('aria-valuenow', 100);
      progressBar.textContent = '100%';
      progressBar.classList.remove('bg-danger', 'bg-warning');
      progressBar.classList.add('bg-success');
    }
    
    if (progressStatus) {
      progressStatus.textContent = 'Task completed successfully';
      progressStatus.classList.remove('text-danger', 'text-warning');
    }
    
    // Clear session storage
    if (options.saveToSessionStorage) {
      const storedTaskId = sessionStorage.getItem('ongoingTaskId');
      if (storedTaskId === taskId) {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
      }
    }
    
    // Clear status polling interval
    if (task.statusInterval) {
      clearInterval(task.statusInterval);
    }
    
    // Add to task history
    this.addTaskToHistory(taskId, task);
    
    // If there's an event handler registered, call it
    if (task.handlers && typeof task.handlers.complete === 'function') {
      task.handlers.complete(result);
    }
    
    // Remove from active tasks after a delay
    setTimeout(() => {
      this.activeTasks.delete(taskId);
    }, this.constants.TASK_CLEANUP_DELAY);
  },
  
  /**
   * Mark a task as failed
   * @param {string} taskId - Task ID
   * @param {Error|string} error - Error that occurred
   */
  errorTask(taskId, error) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot mark unknown task as error: ${taskId}`);
      return;
    }
    
    const task = this.activeTasks.get(taskId);
    const options = task.options || {};
    
    // Update task state
    task.status = 'error';
    task.error = error;
    task.endTime = Date.now();
    
    // Update UI elements
    const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
    const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
    
    if (progressBar) {
      progressBar.classList.remove('bg-primary', 'bg-success', 'bg-warning');
      progressBar.classList.add('bg-danger');
    }
    
    if (progressStatus) {
      progressStatus.textContent = `Error: ${error.message || error}`;
      progressStatus.classList.remove('text-warning');
      progressStatus.classList.add('text-danger');
    }
    
    // Show toast if UI module is available
    if (ui && typeof ui.showToast === 'function') {
      ui.showToast('Task Error', typeof error === 'string' ? error : (error.message || 'Unknown error'), 'error');
    }
    
    // Clean up session storage
    if (options.saveToSessionStorage) {
      const storedTaskId = sessionStorage.getItem('ongoingTaskId');
      if (storedTaskId === taskId) {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
      }
    }
    
    // Clear status polling interval
    if (task.statusInterval) {
      clearInterval(task.statusInterval);
    }
    
    // Add to task history
    this.addTaskToHistory(taskId, task);
    
    // If there's an event handler registered, call it
    if (task.handlers && typeof task.handlers.error === 'function') {
      task.handlers.error(error);
    }
    
    // Remove from active tasks after a delay
    setTimeout(() => {
      this.activeTasks.delete(taskId);
    }, this.constants.TASK_CLEANUP_DELAY);
  },
  
  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   */
  cancelTask(taskId) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot cancel unknown task: ${taskId}`);
      return;
    }
    
    const task = this.activeTasks.get(taskId);
    const options = task.options || {};
    
    // Update task state
    task.status = 'cancelled';
    task.endTime = Date.now();
    
    // Update UI elements
    const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
    const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
    
    if (progressBar) {
      progressBar.classList.remove('bg-primary', 'bg-success', 'bg-danger');
      progressBar.classList.add('bg-warning');
    }
    
    if (progressStatus) {
      progressStatus.textContent = 'Task cancelled';
      progressStatus.classList.remove('text-danger');
      progressStatus.classList.add('text-warning');
    }
    
    // Clean up session storage
    if (options.saveToSessionStorage) {
      const storedTaskId = sessionStorage.getItem('ongoingTaskId');
      if (storedTaskId === taskId) {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
      }
    }
    
    // Clear status polling interval
    if (task.statusInterval) {
      clearInterval(task.statusInterval);
    }
    
    // Add to task history
    this.addTaskToHistory(taskId, task);
    
    // If there's an event handler registered, call it
    if (task.handlers && typeof task.handlers.cancel === 'function') {
      task.handlers.cancel();
    }
    
    // Remove from active tasks after a delay
    setTimeout(() => {
      this.activeTasks.delete(taskId);
    }, this.constants.TASK_CLEANUP_DELAY);
  },
  
  /**
   * Cancel tracking for a task
   * @param {string} taskId - Task ID
   * @returns {boolean} - Success
   */
  cancelTracking(taskId) {
    if (!this.activeTasks.has(taskId)) {
      console.warn(`Cannot cancel tracking for unknown task: ${taskId}`);
      return false;
    }
    
    // Try to send cancel request via event registry
    if (eventRegistry && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('task.cancel', { task_id: taskId });
    }
    
    // Also try direct socket emission if available
    const socket = window.socket || (window.moduleInstances ? window.moduleInstances.socket : null);
    if (socket && typeof socket.emit === 'function') {
      try {
        socket.emit('cancel_task', { task_id: taskId });
      } catch (e) {
        console.warn('Error sending cancel request via socket:', e);
      }
    }
    
    // Also try via fetch API
    fetch('/api/cancel-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId })
    }).catch(error => {
      console.warn('Error sending cancel request via fetch:', error);
    });
    
    // Mark task as cancelled
    this.cancelTask(taskId);
    
    return true;
  },
  
  /**
   * Get a list of all active tasks
   * @returns {Array} - List of active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  },
  
  /**
   * Get details for a specific task
   * @param {string} taskId - Task ID to get details for
   * @returns {Object|null} - Task details or null if not found
   */
  getTaskDetails(taskId) {
    if (!this.activeTasks.has(taskId)) {
      return null;
    }
    
    const task = this.activeTasks.get(taskId);
    return {
      id: task.id,
      progress: task.progress,
      status: task.status,
      message: task.message,
      stats: task.stats || {},
      startTime: task.startTime,
      lastUpdateTime: task.lastUpdateTime,
      endTime: task.endTime,
      elapsed: task.endTime ? (task.endTime - task.startTime) : (Date.now() - task.startTime),
      outputFile: task.outputFile || null,
      result: task.result || null,
      eta: task.eta,
      timeRemaining: task.timeRemaining
    };
  },
  
  /**
   * Create progress UI elements in a container
   * @param {string} containerId - Container element ID
   * @param {string} elementPrefix - Prefix for element IDs
   * @returns {Object} - Created elements
   */
  createProgressUI(containerId, elementPrefix = '') {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container element #${containerId} not found`);
      return null;
    }
    
    // Check if elements already exist
    const existingProgressBar = document.getElementById(`${elementPrefix}progress-bar`);
    if (existingProgressBar) {
      console.log(`Progress UI elements already exist in container #${containerId}`);
      
      // Return references to existing elements
      return {
        container: container,
        progressBar: existingProgressBar,
        progressStatus: document.getElementById(`${elementPrefix}progress-status`),
        progressStats: document.getElementById(`${elementPrefix}progress-stats`),
        cancelButton: document.getElementById(`${elementPrefix}cancel-btn`)
      };
    }
    
    // Create progress container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container mb-3';
    progressContainer.id = `${elementPrefix}progress-container`;
    
    // Create progress bar
    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'progress';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated';
    progressBar.id = `${elementPrefix}progress-bar`;
    progressBar.role = 'progressbar';
    progressBar.setAttribute('aria-valuenow', '0');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    
    progressBarContainer.appendChild(progressBar);
    progressContainer.appendChild(progressBarContainer);
    
    // Create status text
    const progressStatus = document.createElement('div');
    progressStatus.className = 'progress-status mt-2 small';
    progressStatus.id = `${elementPrefix}progress-status`;
    progressStatus.textContent = 'Ready to start...';
    
    progressContainer.appendChild(progressStatus);
    
    // Create stats container
    const progressStats = document.createElement('div');
    progressStats.className = 'progress-stats mt-3 small';
    progressStats.id = `${elementPrefix}progress-stats`;
    
    progressContainer.appendChild(progressStats);
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'btn btn-sm btn-outline-danger mt-2';
    cancelButton.id = `${elementPrefix}cancel-btn`;
    cancelButton.innerHTML = '<i class="fas fa-times-circle me-1"></i> Cancel';
    cancelButton.type = 'button';
    
    // Handle cancel click with proper binding
    cancelButton.addEventListener('click', () => {
      // Try to find task ID associated with this container
      const taskId = this.findTaskIdByElementPrefix(elementPrefix);
      
      if (taskId) {
        // Show confirmation dialog
        if (confirm('Are you sure you want to cancel this task?')) {
          this.cancelTracking(taskId);
          
          // Emit task cancel event
          if (eventRegistry && typeof eventRegistry.emit === 'function') {
            eventRegistry.emit('task.cancel', { task_id: taskId });
          }
          
          // Show toast if UI module is available
          if (ui && typeof ui.showToast === 'function') {
            ui.showToast('Task Cancelled', 'The task has been cancelled', 'warning');
          }
        }
      } else {
        console.warn('Could not find task ID for cancel button');
        
        // Show toast if UI module is available
        if (ui && typeof ui.showToast === 'function') {
          ui.showToast('Cancellation Error', 'Could not identify the task to cancel', 'error');
        }
      }
    });
    
    progressContainer.appendChild(cancelButton);
    
    // Add to container
    container.appendChild(progressContainer);
    
    // Return references to created elements
    return {
      container: progressContainer,
      progressBar,
      progressStatus,
      progressStats,
      cancelButton
    };
  },
  
  /**
   * Find task ID associated with an element prefix
   * @param {string} elementPrefix - Element prefix to search for
   * @returns {string|null} - Task ID or null if not found
   */
  findTaskIdByElementPrefix(elementPrefix) {
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.options && task.options.elementPrefix === elementPrefix) {
        return taskId;
      }
    }
    
    // If not found but there's a single task, return that
    if (this.activeTasks.size === 1) {
      return Array.from(this.activeTasks.keys())[0];
    }
    
    return null;
  },
  
  /**
   * Get task history from local storage
   * @param {number} limit - Maximum number of items to return
   * @returns {Array} - Task history
   */
  getTaskHistory(limit = 50) {
    try {
      if (typeof localStorage === 'undefined') {
        return [];
      }
      
      // Get history from local storage
      const historyString = localStorage.getItem('taskHistory') || '[]';
      let history = [];
      
      try {
        history = JSON.parse(historyString);
      } catch (e) {
        console.warn('Error parsing task history:', e);
        history = [];
      }
      
      // Limit number of items
      return history.slice(0, limit);
    } catch (error) {
      console.warn('Error getting task history:', error);
      return [];
    }
  },
  
  /**
   * Clear task history
   * @returns {boolean} - Success
   */
  clearTaskHistory() {
    try {
      if (typeof localStorage === 'undefined') {
        return false;
      }
      
      localStorage.setItem('taskHistory', '[]');
      return true;
    } catch (error) {
      console.warn('Error clearing task history:', error);
      return false;
    }
  },
  
  /**
   * Force completion of all tasks (for emergency cleanup)
   */
  forceCompleteAllTasks() {
    console.warn('Force completing all tasks - emergency cleanup');
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
    sessionStorage.removeItem('outputFile');
    
    // Complete all active tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      // Skip already completed/errored/cancelled tasks
      if (['completed', 'error', 'cancelled'].includes(task.status)) {
        continue;
      }
      
      console.warn(`Force completing task ${taskId}`);
      
      // Mark as error
      this.errorTask(taskId, 'Task force completed due to emergency cleanup');
    }
    
    // Clear any remaining tasks after a short delay
    setTimeout(() => {
      this.activeTasks.clear();
    }, 1000);
  },
  
  /**
   * Create a reset button for emergency cleanup
   * @returns {HTMLElement} - Reset button
   */
  createResetButton() {
    const resetButton = document.createElement('button');
    resetButton.className = 'btn btn-sm btn-danger position-fixed';
    resetButton.style.bottom = '10px';
    resetButton.style.left = '10px';
    resetButton.style.zIndex = '9999';
    resetButton.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i> Reset Tasks';
    resetButton.title = 'Emergency task reset - use only if tasks are stuck';
    
    resetButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to force reset all tasks? This is for emergency use only when tasks are stuck.')) {
        this.forceCompleteAllTasks();
        
        // Show toast
        if (ui && typeof ui.showToast === 'function') {
          ui.showToast('Tasks Reset', 'All tasks have been force reset', 'warning');
        }
      }
    });
    
    return resetButton;
  }
};

// Export both default and named exports
export default progressHandler;
export const setupTaskProgress = progressHandler.setupTaskProgress.bind(progressHandler);
export const trackProgress = progressHandler.trackProgress.bind(progressHandler);
export const updateProgressUI = progressHandler.updateProgressUI.bind(progressHandler);
export const cancelTracking = progressHandler.cancelTracking.bind(progressHandler);
export const createProgressUI = progressHandler.createProgressUI.bind(progressHandler);
export const getActiveTasks = progressHandler.getActiveTasks.bind(progressHandler);
export const getTaskDetails = progressHandler.getTaskDetails.bind(progressHandler);
export const getTaskHistory = progressHandler.getTaskHistory.bind(progressHandler);
export const clearTaskHistory = progressHandler.clearTaskHistory.bind(progressHandler);
export const findTaskIdByElementPrefix = progressHandler.findTaskIdByElementPrefix.bind(progressHandler);
export const forceCompleteAllTasks = progressHandler.forceCompleteAllTasks.bind(progressHandler);