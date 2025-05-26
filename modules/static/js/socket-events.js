// C:\Users\Los\Documents\NeuroGenServer\modules\static\js\socket-events.js

/**
 * Enhanced Socket.IO event handling for all tabs
 */
function setupSocketEvents() {
    if (!window.socket) {
        console.warn("Socket.IO not available");
        return;
    }
    
    // Remove existing handlers to prevent duplicates
    if (window.socket.off) {
        window.socket.off('progress_update');
        window.socket.off('task_completed');
        window.socket.off('task_error');
        window.socket.off('task_cancelled');
    }
    
    // Setup consistent event handlers
    window.socket.on('progress_update', function(data) {
        console.log('Progress update received:', data);
        if (data && data.task_id === window.currentTaskId) {
            updateProgressUI(data);
        }
    });
    
    window.socket.on('task_completed', function(data) {
        console.log('Task completed received:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskCompleted(data);
        }
    });
    
    window.socket.on('task_error', function(data) {
        console.log('Task error received:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskError(data);
        }
    });
    
    window.socket.on('task_cancelled', function(data) {
        console.log('Task cancelled received:', data);
        if (data && data.task_id === window.currentTaskId) {
            handleTaskCancelled(data);
        }
    });
}

/**
 * Unified progress UI update function
 */
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

/**
 * Unified task completion handler
 */
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
        }
    } else {
        // Default completion handling
        if (typeof showResult === 'function') {
            showResult(data);
        } else {
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

/**
 * Unified task error handler
 */
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

/**
 * Unified task cancellation handler
 */
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

// Initialize event handlers on page load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket event handling
    setupSocketEvents();
    
    // Call existing initialization functions if they exist
    if (typeof initializeApp === 'function') {
        initializeApp();
    }
});