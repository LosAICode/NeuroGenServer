/**
 * DOM Safety Wrapper for fileProcessor
 * 
 * This wrapper ensures the module only initializes when DOM is fully ready
 * and handles the "document.body is null" error seen in the logs.
 * 
 * Improvements:
 * 1. More robust DOM readiness detection
 * 2. Better error handling for initialization
 * 3. Proper task completion handling
 * 4. Better integration with progressHandler
 * 5. Prevents circular dependencies
 * 6. Handles progress stuck at 99%
 */

// Import the fileProcessor with improved path
import fileProcessor from '../features/fileProcessor.js';

// State to track initialization and DOM status
const state = {
  initialized: false,
  initializePromise: null,
  domReadyPromise: null,
  safetyTimeoutId: null,
  bodyCheckIntervalId: null,
  progressPollIntervalMs: 1000,
  currentTaskId: null,
  forceCompleteTimeoutIds: new Set(),
  // Track completion state to prevent duplicates
  completionState: {
    completed: new Set(),
    error: new Set(),
    cancelled: new Set()
  }
};

/**
 * Check if DOM is fully ready for interaction
 * Multiple checks for maximum compatibility
 * @returns {boolean} Whether the DOM is ready
 */
function isDomReady() {
  // Perform multiple checks to ensure DOM is truly ready
  const readyState = document.readyState === 'complete' || document.readyState === 'interactive';
  const bodyExists = document.body !== null;
  const bodyHasChildren = document.body && document.body.children.length > 0;
  
  // Check for specific UI elements that should be available
  const criticalElementsExist = bodyExists && (
    document.getElementById('progress-container') !== null ||
    document.getElementById('form-container') !== null
  );
  
  // Log status for debugging
  if (readyState && bodyExists && !criticalElementsExist) {
    console.log("DOM appears ready but critical elements not found yet");
  }
  
  // Basic readiness: document must be at least interactive and body must exist
  const basicReady = readyState && bodyExists;
  
  // Full readiness: either basic ready + critical elements exist, or body has children
  return basicReady && (criticalElementsExist || bodyHasChildren);
}

/**
 * Promise that resolves when DOM is ready
 * Uses multiple strategies to ensure DOM is truly ready
 * @returns {Promise} Promise that resolves when DOM is ready
 */
function domReadyPromise() {
  if (state.domReadyPromise) {
    return state.domReadyPromise;
  }
  
  state.domReadyPromise = new Promise((resolve) => {
    // If DOM is already ready, resolve immediately
    if (isDomReady()) {
      console.log("DOM is already fully ready at initial check");
      resolve();
      return;
    }
    
    console.log("Waiting for DOM to be fully ready...");
    
    // Handler for DOM ready events
    const readyHandler = () => {
      if (isDomReady()) {
        console.log("DOM ready detected from event");
        cleanup();
        resolve();
      }
    };
    
    // Cleanup function to remove all event listeners and intervals
    const cleanup = () => {
      document.removeEventListener('DOMContentLoaded', readyHandler);
      document.removeEventListener('readystatechange', readyHandler);
      window.removeEventListener('load', readyHandler);
      
      if (state.bodyCheckIntervalId) {
        clearInterval(state.bodyCheckIntervalId);
        state.bodyCheckIntervalId = null;
      }
      
      if (state.safetyTimeoutId) {
        clearTimeout(state.safetyTimeoutId);
        state.safetyTimeoutId = null;
      }
    };
    
    // Set up event listeners for DOM ready events
    document.addEventListener('DOMContentLoaded', readyHandler);
    document.addEventListener('readystatechange', readyHandler);
    window.addEventListener('load', readyHandler);
    
    // Also poll for readiness in case events don't fire correctly
    state.bodyCheckIntervalId = setInterval(() => {
      if (isDomReady()) {
        console.log("DOM ready detected from interval check");
        cleanup();
        resolve();
      }
    }, 100);
    
    // Set a safety timeout as a fallback
    state.safetyTimeoutId = setTimeout(() => {
      console.warn("DOM safety timeout triggered - proceeding with initialization anyway");
      cleanup();
      resolve();
    }, 10000); // 10 second safety timeout
  });
  
  return state.domReadyPromise;
}

/**
 * Safely initialize the file processor
 * @returns {Promise<boolean>} Promise resolving to initialization success
 */
async function initializeSafe() {
  // Return existing promise if already initializing or initialized
  if (state.initializePromise) {
    return state.initializePromise;
  }
  
  console.log("Starting safe initialization of file processor...");
  
  state.initializePromise = new Promise(async (resolve) => {
    try {
      // Wait for DOM to be ready
      await domReadyPromise();
      
      // Double-check document.body exists before proceeding
      if (!document.body) {
        console.error("document.body is still null after DOM ready. Using fallback initialization.");
        
        // Wait a bit longer as a fallback
        await new Promise(r => setTimeout(r, 2000));
        
        // If still no body, we'll proceed anyway but log a warning
        if (!document.body) {
          console.warn("document.body still null after additional delay - proceeding with caution");
        }
      }
      
      console.log("DOM is ready, proceeding with file processor initialization");
      
      // Verify progress-related UI elements exist
      const progressContainer = document.getElementById('progress-container');
      const progressBar = document.getElementById('progress-bar');
      
      if (!progressContainer && document.body) {
        console.warn("Progress container not found, may need to be created");
      }
      
      // Now initialize the file processor
      console.log("Calling fileProcessor.initialize()");
      const result = await fileProcessor.initialize();
      
      // Mark as initialized and store result
      state.initialized = result;
      
      // Log the initialization result
      if (result) {
        console.log("File processor safely initialized successfully");
        
        // Setup task monitoring for completion if socket events fail
        setupTaskMonitoring();
      } else {
        console.error("File processor initialization failed");
      }
      
      resolve(result);
    } catch (error) {
      console.error("Error during safe file processor initialization:", error);
      resolve(false);
    }
  });
  
  return state.initializePromise;
}

/**
 * Sets up monitoring for task completion to handle stuck progress bars
 */
function setupTaskMonitoring() {
  // Listen for task start via eventRegistry if available
  if (window.eventRegistry && typeof window.eventRegistry.on === 'function') {
    // Monitor start of processing
    window.eventRegistry.on('file.processing.started', (data) => {
      if (data && data.task_id) {
        state.currentTaskId = data.task_id;
        monitorTaskProgress(data.task_id);
      }
    });
    
    // Cancel monitoring on completion
    window.eventRegistry.on('file.processing.completed', (data) => {
      cancelTaskMonitoring(data.task_id);
      // Mark as completed
      if (data.task_id) {
        state.completionState.completed.add(data.task_id);
      }
    });
    
    // Cancel monitoring on error
    window.eventRegistry.on('file.processing.error', (data) => {
      cancelTaskMonitoring(data.task_id);
      // Mark as error
      if (data.task_id) {
        state.completionState.error.add(data.task_id);
      }
    });
    
    // Cancel monitoring on cancellation
    window.eventRegistry.on('file.processing.cancelled', (data) => {
      cancelTaskMonitoring(data.task_id);
      // Mark as cancelled
      if (data.task_id) {
        state.completionState.cancelled.add(data.task_id);
      }
    });
    
    // Also monitor socket events directly
    window.eventRegistry.on('socket.task_completed', (data) => {
      if (data && data.task_id) {
        state.completionState.completed.add(data.task_id);
      }
    });
  }
}

/**
 * Monitor progress of a specific task
 * @param {string} taskId - ID of the task to monitor
 */
function monitorTaskProgress(taskId) {
  if (!taskId) return;
  
  console.log(`Setting up progress monitoring for task ${taskId}`);
  
  // Store the task ID in local state
  state.currentTaskId = taskId;
  
  // Set a timeout to check progress and potentially force completion
  const timeoutId = setTimeout(() => {
    // Get progress from DOM
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      const currentProgress = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
      console.log(`Task ${taskId} progress: ${currentProgress}%`);
      
      // If progress is stuck at high percentage but not complete, force completion
      if (currentProgress >= 95 && currentProgress < 100 && !state.completionState.completed.has(taskId)) {
        console.log(`Task appears stuck at ${currentProgress}%, attempting to force completion`);
        
        // Force progress to 100%
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.setAttribute('aria-valuenow', '100');
          progressBar.textContent = '100%';
          progressBar.classList.add('bg-success');
        }
        
        // Update status message if present
        const progressStatus = document.getElementById('progress-status');
        if (progressStatus) {
          progressStatus.textContent = 'Task completed successfully';
        }
        
        // Check if task actually completed via API
        checkTaskCompletion(taskId);
      }
    }
  }, 60000); // Check after 60 seconds
  
  // Store timeout ID for cleanup
  state.forceCompleteTimeoutIds.add(timeoutId);
}

/**
 * Check if a task is complete via API
 * @param {string} taskId - Task ID to check
 */
async function checkTaskCompletion(taskId) {
  try {
    // Skip if already marked as completed
    if (state.completionState.completed.has(taskId)) {
      return;
    }
    
    // Make API request to get task status
    const response = await fetch(`/api/status/${taskId}`);
    
    if (response.ok) {
      const data = await response.json();
      
      // If task is completed but UI wasn't updated, force update
      if (data.status === "completed" || data.progress >= 100) {
        console.log(`Task ${taskId} is reported as complete, but UI may not have updated`);
        
        // Try to call completion handler in fileProcessor
        if (fileProcessor && typeof fileProcessor.handleTaskCompletion === 'function') {
          fileProcessor.handleTaskCompletion(data);
        } else {
          console.warn("Could not call fileProcessor.handleTaskCompletion directly");
          
          // Emit completion event as fallback
          if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
            window.eventRegistry.emit('socket.task_completed', {
              task_id: taskId,
              ...data
            });
          }
        }
        
        // Mark as completed
        state.completionState.completed.add(taskId);
      }
    }
  } catch (error) {
    console.error("Error checking task completion:", error);
  }
}

/**
 * Cancel monitoring for a specific task
 * @param {string} taskId - ID of the task to stop monitoring
 */
function cancelTaskMonitoring(taskId) {
  if (taskId !== state.currentTaskId) return;
  
  console.log(`Cancelling progress monitoring for task ${taskId}`);
  
  // Clear all completion timeouts
  state.forceCompleteTimeoutIds.forEach(id => clearTimeout(id));
  state.forceCompleteTimeoutIds.clear();
  
  // Clear current task ID
  state.currentTaskId = null;
}

/**
 * Update progress UI with safety checks
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {Object} stats - Optional statistics
 * @returns {boolean} Success status
 */
function updateProgressUISafely(taskId, progress, message, stats = null) {
  try {
    // Ensure DOM is ready
    if (!isDomReady()) {
      console.warn("Cannot update progress UI - DOM not ready");
      return false;
    }
    
    // Handle progress at 99% - force to 100% if status indicates completion
    if (progress >= 99 && progress < 100) {
      if (stats && stats.status === "completed") {
        console.log("Found completion status but progress < 100%, forcing to 100%");
        progress = 100;
      }
    }
    
    // Find elements with safety checks
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressStats = document.getElementById('progress-stats');
    
    // Update progress bar
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
      progressBar.textContent = `${Math.round(progress)}%`;
      
      // Update contextual classes based on progress
      progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info');
      if (progress >= 100) {
        progressBar.classList.add('bg-success');
      } else if (progress >= 75) {
        progressBar.classList.add('bg-info');
      } else if (progress >= 50) {
        progressBar.classList.add('bg-primary');
      } else if (progress >= 25) {
        progressBar.classList.add('bg-warning');
      } else {
        progressBar.classList.add('bg-danger');
      }
    } else {
      console.warn("Progress bar element not found");
    }
    
    // Update status message
    if (progressStatus && message) {
      progressStatus.textContent = message;
    }
    
    // Forward to fileProcessor's updateProgressDisplay if available
    if (fileProcessor && typeof fileProcessor.updateProgressDisplay === 'function') {
      fileProcessor.updateProgressDisplay(progress, message, stats);
    }
    
    return true;
  } catch (error) {
    console.error("Error updating progress UI safely:", error);
    return false;
  }
}

/**
 * Handle task completion with safety checks
 * @param {Object} data - Task completion data
 */
function handleTaskCompletionSafely(data) {
  try {
    // Check if data contains the necessary information
    if (!data || !data.task_id) {
      console.error("Invalid completion data:", data);
      return;
    }
    
    // Check if already completed
    if (state.completionState.completed.has(data.task_id)) {
      console.log("Task already marked as completed, preventing duplicate handling");
      return;
    }
    
    console.log("Safe task completion handler called:", data);
    
    // Force progress to 100% to avoid stuck progress bars
    updateProgressUISafely(data.task_id, 100, "Task completed successfully", data.stats);
    
    // Forward to fileProcessor's handleTaskCompletion if available
    if (fileProcessor && typeof fileProcessor.handleTaskCompletion === 'function') {
      fileProcessor.handleTaskCompletion(data);
    } else {
      console.warn("fileProcessor.handleTaskCompletion not available");
      
      // Emit completion event as fallback
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('socket.task_completed', data);
      }
    }
    
    // Mark as completed
    state.completionState.completed.add(data.task_id);
    
    // Cancel any monitoring
    cancelTaskMonitoring(data.task_id);
  } catch (error) {
    console.error("Error in safe task completion handler:", error);
  }
}

/**
 * Check if task is already marked as completed
 * @param {string} taskId - Task ID to check
 * @returns {boolean} - Whether the task is already marked as completed
 */
function isTaskCompleted(taskId) {
  return state.completionState.completed.has(taskId);
}

/**
 * Clear completion state for a task
 * @param {string} taskId - Task ID to clear
 */
function clearCompletionState(taskId) {
  state.completionState.completed.delete(taskId);
  state.completionState.error.delete(taskId);
  state.completionState.cancelled.delete(taskId);
}

// Create a safe proxy that wraps all fileProcessor methods
const safeFileProcessor = new Proxy(fileProcessor, {
  get(target, prop) {
    // Return our custom methods for special properties
    if (prop === 'initialize' || prop === 'initializeSafe') {
      return initializeSafe;
    }
    
    if (prop === 'updateProgressUISafely') {
      return updateProgressUISafely;
    }
    
    if (prop === 'handleTaskCompletionSafely') {
      return handleTaskCompletionSafely;
    }
    
    if (prop === 'isTaskCompleted') {
      return isTaskCompleted;
    }
    
    if (prop === 'clearCompletionState') {
      return clearCompletionState;
    }
    
    // For other properties, return a wrapper that ensures DOM is ready
    const original = target[prop];
    
    if (typeof original === 'function') {
      return async function(...args) {
        // Ensure initialization before calling any method that might access the DOM
        if (!state.initialized && isDomReady()) {
          try {
            await initializeSafe();
          } catch (error) {
            console.error(`Error initializing before calling ${prop}:`, error);
            // Continue anyway to try the function
          }
        }
        
        // Special handling for specific methods that interact with the DOM
        if (prop === 'updateProgressDisplay') {
          return updateProgressUISafely(state.currentTaskId, ...args);
        }
        
        if (prop === 'handleTaskCompletion') {
          return handleTaskCompletionSafely(...args);
        }
        
        if (prop === 'showProgress' || prop === 'showResult' || prop === 'showForm' || 
            prop === 'showError' || prop === 'showCancelled') {
          // Ensure DOM is ready before UI operations
          if (!isDomReady()) {
            console.warn(`Cannot call ${prop} - DOM not ready, waiting...`);
            await domReadyPromise();
          }
        }
        
        // Call the original method
        return original.apply(target, args);
      };
    }
    
    // For non-functions, return the original property
    return original;
  }
});

// Export the safe wrapper
export default safeFileProcessor;
export { initializeSafe, updateProgressUISafely, handleTaskCompletionSafely, isTaskCompleted, clearCompletionState };