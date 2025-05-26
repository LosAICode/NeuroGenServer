# This file contains fixes for NeuroGenServer issues

# Fix 1: Add missing setup_logging function
def setup_logging(log_level, log_file=None):
    """
    Set up logging configuration for process_all_files function
    
    Args:
        log_level: Logging level
        log_file: Optional log file path
        
    Returns:
        Configured logger instance
    """
    import logging
    
    # Create logger if it doesn't exist
    logger = logging.getLogger("file_processor")
    logger.setLevel(log_level)
    
    # Remove existing handlers to prevent duplicate logs
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger

# Fix 2: Add proper task cancellation endpoint
"""
Add to main.py:

@app.route("/api/cancel/<task_id>", methods=["POST"])
def cancel_task(task_id):
    \"\"\"
    API endpoint to cancel a task by ID
    
    Args:
        task_id: The task ID to cancel
        
    Returns:
        JSON response with cancellation status
    \"\"\"
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    # Call the task's cancel method
    result = task.cancel()
    
    if result:
        return jsonify({
            "status": "success",
            "message": f"Task {task_id} cancelled successfully"
        })
    else:
        return jsonify({
            "status": "warning",
            "message": f"Task {task_id} already cancelled or completed"
        })
"""

# Fix 3: Improved BaseTask cancel method with forced termination
"""
Inside BaseTask class, replace the cancel method with:

def cancel(self) -> bool:
    \"\"\"
    Cancel the task with improved force termination support.
    
    Returns:
        bool: True if cancellation was initiated, False if already cancelled/finished
    \"\"\"
    if self.is_cancelled_flag or self.status in ["completed", "failed", "cancelled"]:
        logger.info(f"Task {self.task_id} already cancelled or finished. Current status: {self.status}")
        return False

    # Set cancellation flag
    self.is_cancelled_flag = True
    previous_status = self.status
    self.status = "cancelling"  # Intermediate state
    self.message = "Task cancellation in progress."
    logger.info(f"Attempting to cancel task {self.task_id} ({self.task_type}). Previous status: {previous_status}")
    
    # Thread termination support - more aggressive cancellation
    try:
        if self.thread and self.thread.is_alive():
            # The thread should check is_cancelled_flag, but if it's stuck
            # we need a way to interrupt it more forcefully
            # This isn't perfect but it helps in many cases
            import ctypes
            ctypes.pythonapi.PyThreadState_SetAsyncExc(
                ctypes.c_long(self.thread.ident),
                ctypes.py_object(InterruptedError)
            )
            logger.info(f"Sent InterruptedError to thread {self.thread.ident}")
    except Exception as e:
        logger.error(f"Error attempting to force thread cancellation: {e}")

    # Set final cancelled state
    self.status = "cancelled"
    self.message = "Task cancelled by user."
    
    # Emit cancellation event
    payload = {
        "task_id": self.task_id,
        "task_type": self.task_type,
        "status": self.status,
        "message": self.message,
        "timestamp": time.time()
    }
    try:
        socketio.emit("task_cancelled", payload)
        logger.info(f"Emitted task_cancelled for {self.task_id}")
    except Exception as e:
        logger.error(f"Error emitting task_cancelled for {self.task_id}: {e}")
    
    # Remove task from active tasks
    if self.task_id in active_tasks:
        remove_task(self.task_id)
    return True
\"\"\"
"""

# Fix 4: Improved PlaylistTask JavaScript handling
"""
In main.js, add/update function for consistent socket.io event handling:

// Enhanced Socket.IO event handling
function setupSocketEvents() {
    if (!window.socket) {
        console.warn("Socket.IO not available");
        return;
    }
    
    // Remove existing handlers to prevent duplicates
    if (window.socket.hasListeners) {
        window.socket.off('progress_update');
        window.socket.off('task_completed');
        window.socket.off('task_error');
        window.socket.off('task_cancelled');
    }
    
    // Setup consistent event handlers
    window.socket.on('progress_update', function(data) {
        console.log('Progress update:', data);
        if (data && data.task_id === window.currentTaskId) {
            // Determine which UI to update based on active tab
            updateProgressUI(data);
        }
    });
    
    window.socket.on('task_completed', function(data) {
        console.log('Task completed:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskCompleted(data);
        }
    });
    
    window.socket.on('task_error', function(data) {
        console.log('Task error:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskError(data);
        }
    });
    
    window.socket.on('task_cancelled', function(data) {
        console.log('Task cancelled:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskCancelled(data);
        }
    });
}

// Unified progress UI update function
function updateProgressUI(data) {
    if (!data) return;
    
    // Get UI elements based on active tab
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    // Progress bar, status, and stats elements based on tab
    let progressBar, progressStatus, progressStats;
    
    if (tabId === 'playlist') {
        progressBar = document.getElementById('playlist-progress-bar');
        progressStatus = document.getElementById('playlist-progress-status');
        progressStats = document.getElementById('playlist-progress-stats');
    } else if (tabId === 'scraper') {
        progressBar = document.getElementById('scraper-progress-bar');
        progressStatus = document.getElementById('scraper-progress-status');
        progressStats = document.getElementById('scraper-progress-stats');
    } else {
        // Default processors
        progressBar = document.getElementById('progress-bar');
        progressStatus = document.getElementById('progress-status');
        progressStats = document.getElementById('progress-stats');
    }
    
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
    
    // Update stats if available
    if (progressStats && data.stats) {
        if (tabId === 'playlist') {
            updatePlaylistProgressStats(progressStats, data.stats);
        } else if (tabId === 'scraper') {
            updateScraperProgressStats(progressStats, data.stats);
        } else {
            updateProgressStats(progressStats, data.stats);
        }
    }
}

// Unified task completion handler
function handleTaskCompleted(data) {
    // Stop polling if active
    if (window.statusCheckInterval) {
        clearInterval(window.statusCheckInterval);
        window.statusCheckInterval = null;
    }
    
    // Get UI elements based on active tab
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    if (tabId === 'playlist') {
        const progressContainer = document.getElementById('playlist-progress-container');
        const resultsContainer = document.getElementById('playlist-results-container');
        const statsElement = document.getElementById('playlist-stats');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (resultsContainer) resultsContainer.classList.remove('d-none');
        
        // Update stats
        if (statsElement && data.stats) {
            updatePlaylistStats(statsElement, data.stats, data.output_file);
        }
    } else if (tabId === 'scraper') {
        // Handle scraper completion
        if (typeof formatAndDisplayScraperResults === 'function') {
            formatAndDisplayScraperResults(data);
        } else {
            console.error("formatAndDisplayScraperResults function not available");
        }
    } else {
        // Default completion handling
        if (typeof showResult === 'function') {
            showResult(data);
        } else {
            console.error("showResult function not available");
            
            // Fallback basic completion handling
            const progressContainer = document.getElementById('progress-container');
            const resultsContainer = document.getElementById('results-container');
            
            if (progressContainer) progressContainer.classList.add('d-none');
            if (resultsContainer) {
                resultsContainer.classList.remove('d-none');
                resultsContainer.innerHTML = `
                    <div class="alert alert-success">
                        <h4>Processing Complete</h4>
                        <p>Task completed successfully.</p>
                        ${data.output_file ? `<p>Output saved to: ${data.output_file}</p>` : ''}
                    </div>
                `;
            }
        }
    }
    
    // Add to history if function exists
    if (typeof addTaskToHistory === 'function') {
        addTaskToHistory(tabId, data.output_file, data.stats);
    }
    
    // Show notification
    if (typeof showToast === 'function') {
        showToast('Success', 'Task completed successfully!', 'success');
    } else {
        alert('Task completed successfully!');
    }
    
    // Clear storage
    window.currentTaskId = null;
    try {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
        console.warn("Could not clear sessionStorage:", e);
    }
}

// Unified task error handler
function handleTaskError(data) {
    // Stop polling if active
    if (window.statusCheckInterval) {
        clearInterval(window.statusCheckInterval);
        window.statusCheckInterval = null;
    }
    
    // Get error message
    const errorMsg = data.error || 'Unknown error occurred';
    
    // Get UI elements based on active tab
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    if (tabId === 'playlist') {
        const progressContainer = document.getElementById('playlist-progress-container');
        const formContainer = document.getElementById('playlist-form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('playlist-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
        }
    } else if (tabId === 'scraper') {
        // Handle scraper error
        const progressContainer = document.getElementById('scraper-progress-container');
        const formContainer = document.getElementById('scraper-form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('scraper-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
        }
    } else {
        // Default error handling
        const progressContainer = document.getElementById('progress-container');
        const formContainer = document.getElementById('form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
        }
    }
    
    // Show notification
    if (typeof showToast === 'function') {
        showToast('Error', errorMsg, 'error');
    } else {
        alert(`Error: ${errorMsg}`);
    }
    
    // Clear storage
    window.currentTaskId = null;
    try {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
        console.warn("Could not clear sessionStorage:", e);
    }
}

// Unified task cancellation handler
function handleTaskCancelled(data) {
    // Stop polling if active
    if (window.statusCheckInterval) {
        clearInterval(window.statusCheckInterval);
        window.statusCheckInterval = null;
    }
    
    // Get UI elements based on active tab
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    if (tabId === 'playlist') {
        const progressContainer = document.getElementById('playlist-progress-container');
        const formContainer = document.getElementById('playlist-form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('playlist-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
        }
    } else if (tabId === 'scraper') {
        // Handle scraper cancellation
        const progressContainer = document.getElementById('scraper-progress-container');
        const formContainer = document.getElementById('scraper-form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('scraper-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
        }
    } else {
        // Default cancellation handling
        const progressContainer = document.getElementById('progress-container');
        const formContainer = document.getElementById('form-container');
        
        // Update UI
        if (progressContainer) progressContainer.classList.add('d-none');
        if (formContainer) formContainer.classList.remove('d-none');
        
        // Reset button
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
        }
    }
    
    // Show notification
    if (typeof showToast === 'function') {
        showToast('Cancelled', 'Task cancelled by user', 'warning');
    } else {
        alert('Task cancelled by user');
    }
    
    // Clear storage
    window.currentTaskId = null;
    try {
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
        console.warn("Could not clear sessionStorage:", e);
    }
}

// Call this at initialization time
document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket event handling
    setupSocketEvents();
});
"""
