// =============================================================================
// SECTION 17: PLAYLISTS TAB IMPLEMENTATION
// =============================================================================
// DEPRECATION NOTICE: This implementation has been replaced by the ES6 modular
// implementation in /modules/features/playlistDownloader/. Please use the new
// implementation for all future development.
// 
// New modular implementation provides:
// - Better error handling and recovery
// - Real-time progress updates via Socket.IO
// - Component-based architecture
// - Session persistence
// - Enhanced validation
// - Production-ready code quality
//
// To use the new implementation, include the integration module:
// import { initializePlaylistDownloader } from './modules/features/playlistDownloader/integration.js';
//
// The legacy code below is maintained for backward compatibility but will be
// removed in a future update.
// =============================================================================


/**
 * Add playlist URL field to form
 */
function addPlaylistField() {
  const container = document.getElementById('playlist-urls-container');
  if (!container) {
    console.error("Playlist container not found");
    return;
  }
  
  const template = `
    <div class="input-group mb-2">
      <input type="url" class="form-control playlist-url" placeholder="Enter YouTube Playlist URL" required>
      <button type="button" class="btn btn-outline-danger remove-url">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  
  // Create temporary element to hold the HTML
  const temp = document.createElement('div');
  temp.innerHTML = template.trim();
  
  // Get the first child (the actual input-group)
  const inputGroup = temp.firstChild;
  
  // Add to container
  container.appendChild(inputGroup);
  
  // Add event listener for the remove button
  const removeBtn = inputGroup.querySelector('.remove-url');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      inputGroup.remove();
    });
  }
}
/**
 * Handle the playlist form submission - prevent default action and provide fallbacks
 * @param {Event} e - The form submission event
 */
function handlePlaylistSubmit(e) {
  // Prevent form submission
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log("Playlist form submitted");
  
  try {
    // Get form elements
    const urlInputs = document.querySelectorAll('.playlist-url');
    const rootDirInput = document.getElementById('playlist-root');
    const outputFileInput = document.getElementById('playlist-output');
    const submitBtn = document.getElementById('playlist-submit-btn');
    
    // Check if elements exist
    if (!urlInputs.length || !rootDirInput || !outputFileInput || !submitBtn) {
      throw new Error("Form elements not found. Please refresh the page.");
    }
    
    // Get values
    const urls = Array.from(urlInputs)
      .map(input => input.value.trim())
      .filter(url => url !== '');
    
    const rootDir = rootDirInput.value.trim();
    const outputFile = outputFileInput.value.trim();
    
    // Validate
    if (urls.length === 0) {
      throw new Error("Please enter at least one YouTube playlist URL");
    }
    
    if (!rootDir) {
      rootDirInput.classList.add('is-invalid');
      setTimeout(() => rootDirInput.classList.remove('is-invalid'), 3000);
      rootDirInput.focus();
      throw new Error("Please enter a download root directory");
    }
    
    if (!outputFile) {
      outputFileInput.classList.add('is-invalid');
      setTimeout(() => outputFileInput.classList.remove('is-invalid'), 3000);
      outputFileInput.focus();
      throw new Error("Please enter an output filename");
    }
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
    
    // Save root dir to localStorage
    try {
      localStorage.setItem('lastPlaylistOutputDir', rootDir);
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
    
    // Show progress UI
    const formContainer = document.getElementById('playlist-form-container');
    const progressContainer = document.getElementById('playlist-progress-container');
    
    if (formContainer && progressContainer) {
      formContainer.classList.add('d-none');
      progressContainer.classList.remove('d-none');
      
      // Reset progress elements
      const progressBar = document.getElementById('playlist-progress-bar');
      const progressStatus = document.getElementById('playlist-progress-status');
      const progressStats = document.getElementById('playlist-progress-stats');
      
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', '0');
        progressBar.textContent = '0%';
      }
      
      if (progressStatus) {
        progressStatus.textContent = "Initializing playlist download...";
      }
      
      if (progressStats) {
        progressStats.innerHTML = "";
      }
    }
    
    // Create payload EXACTLY matching server expectations
    const payload = {
      playlists: urls,
      root_directory: rootDir,
      output_file: outputFile
    };
    
    console.log("Sending request with data:", payload);
    
    // Call API
    fetch('/api/start-playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`Server error (${response.status}):`, text);
          try {
            const data = JSON.parse(text);
            if (data.error && typeof data.error === 'object' && data.error.message) {
              throw new Error(data.error.message);
            } else if (data.error) {
              throw new Error(data.error);
            } else {
              throw new Error(`Server error: ${response.status}`);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error(text || `Server error: ${response.status}`);
            } else {
              throw e;
            }
          }
        });
      }
      return response.json();
    })
    .then(data => {
      console.log("API response:", data);
      
      // Handle success
      if (data.task_id) {
        // Store task ID
        window.currentTaskId = data.task_id;
        
        // Save to sessionStorage
        try {
          sessionStorage.setItem('ongoingTaskId', data.task_id);
          sessionStorage.setItem('ongoingTaskType', 'playlist');
          if (data.output_file) {
            sessionStorage.setItem('outputFile', data.output_file);
          }
        } catch (e) {
          console.warn("Could not save to sessionStorage:", e);
        }
        
        // Start polling
        startPolling(data.task_id);
        
        // Show success message
        if (typeof showToast === 'function') {
          showToast('Processing Started', 'Your playlists are being downloaded', 'info');
        } else {
          alert('Processing Started: Your playlists are being downloaded');
        }
      } else {
        throw new Error("No task ID returned from server");
      }
    })
    .catch(error => {
      console.error("Playlist download error:", error);
      
      // Show error
      if (typeof showToast === 'function') {
        showToast('Error', error.message, 'error');
      } else {
        alert(`Error: ${error.message}`);
      }
      
      // Reset UI
      if (formContainer && progressContainer) {
        progressContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
      
      // Reset button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
      }
    });
    
  } catch (error) {
    // Handle validation errors
    console.error("Form validation error:", error);
    if (typeof showToast === 'function') {
      showToast('Error', error.message, 'error');
    } else {
      alert(`Error: ${error.message}`);
    }
  }
  
  return false;
}

/**
 * Start polling for status updates
 * @param {string} taskId - The task ID to poll
 */
function startPolling(taskId) {
  if (!taskId) {
    console.warn("No task ID to poll");
    return;
  }
  
  // Clear existing interval
  if (window.statusPollInterval) {
    clearInterval(window.statusPollInterval);
  }
  
  // Start new interval
  window.statusPollInterval = setInterval(() => {
    fetch(`/api/status/${taskId}`)
      .then(response => response.json())
      .then(data => {
        console.log("Status update:", data);
        
        // Update UI
        updateProgress(data);
        
        // Check completion
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(window.statusPollInterval);
          
          if (data.status === 'completed') {
            handleCompletion(data);
          } else if (data.status === 'failed') {
            handleError(data);
          } else if (data.status === 'cancelled') {
            handleCancellation();
          }
        }
      })
      .catch(error => {
        console.warn("Status polling error:", error);
      });
  }, 2000);
}

/**
 * Update progress UI
 * @param {Object} data - Progress data from server
 */
function updateProgress(data) {
  if (!data) return;
  
  // Get UI elements
  const progressBar = document.getElementById('playlist-progress-bar');
  const progressStatus = document.getElementById('playlist-progress-status');
  const progressStats = document.getElementById('playlist-progress-stats');
  
  // Update progress bar
  if (progressBar && typeof data.progress === 'number') {
    const progress = Math.min(100, Math.max(0, data.progress));
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress.toString());
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
  
  // Update status
  if (progressStatus && data.message) {
    progressStatus.textContent = data.message;
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateStats(progressStats, data.stats);
  }
}

/**
 * Update stats display
 * @param {HTMLElement} element - Stats element
 * @param {Object} stats - Stats data
 */
function updateStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  // Add standard stats
  if (stats.playlists_total !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
    </li>`;
  }
  
  if (stats.playlists_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  if (stats.videos_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Videos Processed <span class="badge bg-success rounded-pill">${stats.videos_processed}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Handle task completion
 * @param {Object} data - Completion data
 */
function handleCompletion(data) {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const resultsContainer = document.getElementById('playlist-results-container');
  const statsElement = document.getElementById('playlist-stats');
  const openButton = document.getElementById('open-playlist-json');
  
  // Update UI
  if (progressContainer && resultsContainer) {
    progressContainer.classList.add('d-none');
    resultsContainer.classList.remove('d-none');
    
    // Update stats
    if (statsElement && data.stats) {
      updateFinalStats(statsElement, data.stats, data.output_file);
    }
    
    // Update open button
    if (openButton && data.output_file) {
      openButton.setAttribute('data-output-file', data.output_file);
    }
  }
  
  // Show notification
  if (typeof showToast === 'function') {
    showToast('Success', 'Playlist download completed successfully', 'success');
  } else {
    alert('Success: Playlist download completed successfully');
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
 * Handle task error
 * @param {Object} data - Error data
 */
function handleError(data) {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const formContainer = document.getElementById('playlist-form-container');
  
  // Update UI
  if (progressContainer && formContainer) {
    progressContainer.classList.add('d-none');
    formContainer.classList.remove('d-none');
  }
  
  // Show error
  if (typeof showToast === 'function') {
    showToast('Error', data.error || 'Task failed', 'error');
  } else {
    alert(`Error: ${data.error || 'Task failed'}`);
  }
  
  // Reset submit button
  const submitBtn = document.getElementById('playlist-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
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
 * Handle task cancellation
 */
function handleCancellation() {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const formContainer = document.getElementById('playlist-form-container');
  
  // Update UI
  if (progressContainer && formContainer) {
    progressContainer.classList.add('d-none');
    formContainer.classList.remove('d-none');
  }
  
  // Show notification
  if (typeof showToast === 'function') {
    showToast('Cancelled', 'Playlist download was cancelled', 'warning');
  } else {
    alert('Cancelled: Playlist download was cancelled');
  }
  
  // Reset submit button
  const submitBtn = document.getElementById('playlist-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
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
 * Update final stats display
 * @param {HTMLElement} element - Stats element
 * @param {Object} stats - Stats data
 * @param {string} outputFile - Output file path
 */
function updateFinalStats(element, stats, outputFile) {
  if (!element) return;
  
  let html = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Add stats
  if (stats.playlists_total !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
    </li>`;
  }
  
  if (stats.playlists_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  // Add duration if available
  if (stats.duration_seconds !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
    </li>`;
  }
  
  // Add directory if available
  if (stats.download_directory) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Download Directory <span class="text-muted small">${stats.download_directory}</span>
    </li>`;
  }
  
  // Add output file if available
  if (outputFile) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Output File <span class="text-muted small">${outputFile}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  return [
    h > 0 ? `${h}h` : '',
    m > 0 ? `${m}m` : '',
    s > 0 || (h === 0 && m === 0) ? `${s}s` : ''
  ].filter(Boolean).join(' ');
}


/**
 * Get playlist URLs from form inputs
 * @returns {Array<string>} Array of playlist URLs
 */
function getPlaylistUrls() {
  const container = document.getElementById('playlist-urls-container');
  if (!container) {
    console.error("Playlist URLs container not found");
    return [];
  }
  
  const urls = [];
  const urlInputs = container.querySelectorAll('.playlist-url');
  
  urlInputs.forEach(input => {
    const url = input.value.trim();
    if (url) {
      urls.push(url);
    }
  });
  
  console.log("Retrieved playlist URLs:", urls);
  return urls;
}

/**
 * Debug tool - Ask the server to describe its expected API format
 */
function debugServerApi() {
  console.log("Requesting API format details from server");
  
  // Try to call a test endpoint to get API info
  fetch('/api/describe', { method: 'GET' })
    .then(response => response.json())
    .then(data => {
      console.log("Server API description:", data);
    })
    .catch(error => {
      console.error("Failed to get API description:", error);
      
      // Try an alternative endpoint
      fetch('/api/info', { method: 'GET' })
        .then(response => response.json())
        .then(data => {
          console.log("Server info:", data);
        })
        .catch(err => {
          console.error("Failed to get server info:", err);
        });
    });
}

/**
 * Test the server API with a simple request
 */
function testPlaylistApi() {
  const testData = {
    playlists: ["https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj"],
    root_directory: "/tmp",
    output_file: "test.json"
  };
  
  console.log("Testing playlist API with minimal data:", testData);
  
  fetch('/api/start-playlists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testData)
  })
  .then(response => response.text())
  .then(text => {
    console.log("Server test response:", text);
    try {
      const data = JSON.parse(text);
      console.log("Parsed response:", data);
    } catch (e) {
      console.log("Raw response (not JSON):", text);
    }
  })
  .catch(error => {
    console.error("Test request failed:", error);
  });
}

/**
 * Make sure socket is properly defined
 */
if (typeof window.socket === 'undefined' || window.socket === null) {
  try {
    if (typeof io !== 'undefined') {
      console.log("Initializing Socket.IO connection");
      window.socket = io();
      
      // Set up basic event handlers
      window.socket.on('connect', () => {
        console.log('Socket.IO connected with ID:', window.socket.id);
      });
      
      window.socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected. Reason:', reason);
      });
    } else {
      console.warn("Socket.IO client not available");
    }
  } catch (e) {
    console.error("Error initializing socket:", e);
  }
}

/**
 * Add a basic implementation for socket functions if needed
 */
if (typeof window.setupProgressSocketHandler !== 'function') {
  window.setupProgressSocketHandler = function() {
    if (!window.socket) {
      console.warn("Socket.IO not available");
      return;
    }
    
    console.log("Setting up Socket.IO progress handlers");
    
    // Set up basic event handlers for progress updates
    window.socket.on('progress_update', function(data) {
      console.log('Progress update:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof updatePlaylistProgress === 'function') {
          updatePlaylistProgress(data);
        }
      }
    });
    
    window.socket.on('task_completed', function(data) {
      console.log('Task completed:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof handleTaskCompleted === 'function') {
          handleTaskCompleted(data);
        }
      }
    });
    
    window.socket.on('task_error', function(data) {
      console.log('Task error:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof handleTaskFailed === 'function') {
          handleTaskFailed(data);
        } else if (typeof showToast === 'function') {
          showToast('Error', data.error || 'Task failed', 'error');
        }
      }
    });
  };
}

/**
 * Basic implementation of updatePlaylistProgress if not available
 */
if (typeof window.updatePlaylistProgress !== 'function') {
  window.updatePlaylistProgress = function(data) {
    if (!data) return;
    
    console.log("Updating progress with data:", data);
    
    // Get UI elements
    const progressBar = document.getElementById('playlist-progress-bar');
    const progressStatus = document.getElementById('playlist-progress-status');
    
    // Update progress bar
    if (progressBar && typeof data.progress === 'number') {
      const progress = Math.min(100, Math.max(0, data.progress));
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
      progressBar.textContent = `${Math.round(progress)}%`;
    }
    
    // Update status message
    if (progressStatus && data.message) {
      progressStatus.textContent = data.message;
    }
  };
}

/**
 * Add event listeners when document is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM is ready, initializing playlist feature");
  
  // Add the form submit listener with a delay to ensure everything is loaded
  setTimeout(() => {
    const playlistForm = document.getElementById('playlist-form');
    if (playlistForm) {
      // Remove any existing listeners to avoid duplicates
      playlistForm.removeEventListener('submit', handlePlaylistSubmit);
      
      // Add the submit handler with both options (inline and reference)
      playlistForm.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handlePlaylistSubmit(e);
        return false;
      });
      
      console.log("Playlist form submit listener added");
    } else {
      console.warn("Playlist form not found");
    }
    
    // Initialize playlist feature
    if (typeof initializePlaylistFeature === 'function') {
      initializePlaylistFeature();
    } else {
      console.warn("initializePlaylistFeature function not available");
    }
  }, 500);
});

/**
 * Check for ongoing playlist tasks from previous sessions
 */
function checkForOngoingPlaylistTask() {
  try {
    const taskId = sessionStorage.getItem('ongoingTaskId');
    const taskType = sessionStorage.getItem('ongoingTaskType');
    
    if (taskId && taskType === 'playlist') {
      console.log(`Found ongoing playlist task: ${taskId}`);
      
      // Set current task ID
      window.currentTaskId = taskId;
      
      // Show progress UI with direct DOM access
      const playlistFormContainer = document.getElementById('playlist-form-container');
      const playlistProgressContainer = document.getElementById('playlist-progress-container');
      
      if (playlistFormContainer && playlistProgressContainer) {
        playlistFormContainer.classList.add('d-none');
        playlistProgressContainer.classList.remove('d-none');
      } else if (typeof showPlaylistProgress === 'function') {
        // Fallback
        showPlaylistProgress();
      }
      
      // Start status polling
      if (typeof startStatusPolling === 'function') {
        startStatusPolling();
      }
      
      // Request initial status update from the socket
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit('request_task_status', { task_id: taskId });
      }
    }
  } catch (error) {
    console.error("Error checking for ongoing tasks:", error);
  }
}
/**
 * Handle browse button click for playlist root directory
 */
function handlePlaylistBrowse() {
  // Show directory picker if available through Electron
  if (typeof window.selectDirectory === 'function') {
    window.selectDirectory().then(result => {
      if (result && result.filePaths && result.filePaths.length > 0) {
        const rootDirField = document.getElementById('playlist-root');
        if (rootDirField) {
          rootDirField.value = result.filePaths[0];
          
          // Save for future use
          localStorage.setItem('lastPlaylistOutputDir', result.filePaths[0]);
          
          // Trigger input event to update output suggestion
          const event = new Event('input');
          rootDirField.dispatchEvent(event);
        }
      }
    }).catch(err => {
      console.error('Error selecting directory:', err);
    });
  } else {
    // Use backend API if browser-based
    fetch('/api/browse-directory', {
      method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
      if (data.path) {
        const rootDirField = document.getElementById('playlist-root');
        if (rootDirField) {
          rootDirField.value = data.path;
          
          // Save for future use
          localStorage.setItem('lastPlaylistOutputDir', data.path);
          
          // Trigger input event to update output suggestion
          const event = new Event('input');
          rootDirField.dispatchEvent(event);
        }
      }
    })
    .catch(err => {
      console.error('Error browsing for directory:', err);
      showToast('Error', 'Failed to browse for directory', 'error');
    });
  }
}

function handlePlaylistCancelClick() {
  if (!window.currentTaskId) {
      console.warn("No active task ID found");
      return;
  }
  
  // Confirm cancellation
  if (!confirm('Are you sure you want to cancel the current playlist download?')) {
      return;
  }
  
  // Disable cancel button to prevent multiple clicks
  const cancelBtn = document.getElementById('playlist-cancel-btn');
  if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Cancelling...';
  }
  
  console.log("Cancelling task:", window.currentTaskId);
  
  // Call the cancel endpoint
  fetch(`/api/cancel/${window.currentTaskId}`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      }
  })
  .then(response => {
      if (!response.ok) {
          return response.json().then(data => {
              throw new Error(data.error || `Server error: ${response.status}`);
          });
      }
      return response.json();
  })
  .then(data => {
      console.log("Cancel response:", data);
      
      // Show cancellation message
      if (typeof showToast === 'function') {
          showToast('Cancelled', data.message || 'Download cancelled', 'warning');
      } else {
          alert('Download cancelled');
      }
      
      // Return to form view
      const playlistProgressContainer = document.getElementById('playlist-progress-container');
      const playlistFormContainer = document.getElementById('playlist-form-container');
      
      if (playlistProgressContainer) playlistProgressContainer.classList.add('d-none');
      if (playlistFormContainer) playlistFormContainer.classList.remove('d-none');
      
      // Reset button state
      const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
      if (playlistSubmitBtn) {
          playlistSubmitBtn.disabled = false;
          playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
      }
      
      // Clear task ID and session storage
      window.currentTaskId = null;
      try {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
      } catch (e) {
          console.warn("Could not clear session storage:", e);
      }
      
      // Stop polling if active
      if (window.statusCheckInterval) {
          clearInterval(window.statusCheckInterval);
          window.statusCheckInterval = null;
      }
  })
  .catch(error => {
      console.error('Cancel error:', error);
      
      // Show error message
      if (typeof showToast === 'function') {
          showToast('Error', 'Failed to cancel task: ' + error.message, 'error');
      } else {
          alert('Error: ' + error.message);
      }
      
      // Re-enable cancel button
      if (cancelBtn) {
          cancelBtn.disabled = false;
          cancelBtn.innerHTML = '<i class="fas fa-times me-2"></i>Cancel';
      }
  });
}

/**
 * Handle new task button click
 */
function handleNewPlaylistTask() {
  // Hide results container and show form container
  const playlistResultsContainer = document.getElementById('playlist-results-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (playlistResultsContainer) playlistResultsContainer.classList.add('d-none');
  if (playlistFormContainer) playlistFormContainer.classList.remove('d-none');
  
  // Reset form state
  const playlistForm = document.getElementById('playlist-form');
  if (playlistForm) playlistForm.reset();
  
  // Reset current task ID
  window.currentTaskId = null;
  
  // Check if there's a last used directory
  const lastDir = localStorage.getItem('lastPlaylistOutputDir');
  const playlistRootField = document.getElementById('playlist-root');
  if (lastDir && playlistRootField) {
    playlistRootField.value = lastDir;
    
    // Trigger input event to populate output field
    const event = new Event('input');
    playlistRootField.dispatchEvent(event);
  }
}

/**
 * Handle open JSON button click
 */
function handleOpenPlaylistJson() {
  const openBtn = document.getElementById('open-playlist-json');
  if (!openBtn) return;
  
  const outputFile = openBtn.getAttribute('data-output-file');
  if (!outputFile) {
    showToast('Error', 'No output file specified', 'error');
    return;
  }
  
  // Try to open the file using backend API
  fetch('/api/open-file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: outputFile })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    showToast('Success', 'Opening file...', 'success');
  })
  .catch(error => {
    console.error('Error opening file:', error);
    showToast('Error', `Could not open file: ${error.message}`, 'error');
    
    // Show path as fallback
    alert(`File path: ${outputFile}`);
  });
}

/**
 * Show playlist error and return to form
 * @param {string} error - Error message to display
 */
function showPlaylistError(error) {
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (!playlistProgressContainer || !playlistFormContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    playlistFormContainer.classList.remove('d-none');
    playlistFormContainer.classList.add('fade-in');
    
    // Show error toast
    showToast('Error', error, 'error');
    
    setTimeout(() => {
      playlistFormContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage as task failed
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    
    // Reset submit button
    const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
    if (playlistSubmitBtn) {
      playlistSubmitBtn.disabled = false;
      playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
    }
  }, 300);
}


/**
 * Process a status update from polling or Socket.IO
 * @param {Object} data - Task status data
 */
function processStatusUpdate(data) {
  if (!data || data.task_id !== window.currentTaskId) return;
  
  console.log('Status update:', data);
  
  // Update progress bar
  const playlistProgressBar = document.getElementById('playlist-progress-bar');
  if (playlistProgressBar && typeof data.progress === 'number') {
    // Use enhanced progress bar if available
    if (typeof enhancedProgressBar === 'function') {
      enhancedProgressBar(playlistProgressBar, data.progress);
    } else {
      // Fallback to simple update
      updateProgressBar(playlistProgressBar, data.progress);
    }
  }
  
  // Update status message
  const playlistProgressStatus = document.getElementById('playlist-progress-status');
  if (playlistProgressStatus) {
    const message = data.message || 
                   (data.status === 'completed' ? 'Download completed successfully!' : 
                   (data.status === 'failed' ? 'Download failed' : 
                   (data.status === 'cancelled' ? 'Download cancelled' : 'Processing...')));
    
    // Use enhanced status update if available
    if (typeof enhancedProgressStatus === 'function') {
      enhancedProgressStatus(playlistProgressStatus, message);
    } else {
      playlistProgressStatus.textContent = message;
    }
  }
  
  // Update statistics if available
  const playlistProgressStats = document.getElementById('playlist-progress-stats');
  if (playlistProgressStats && data.stats) {
    // Use enhanced stats update if available
    if (typeof enhancedPlaylistStats === 'function') {
      enhancedPlaylistStats(playlistProgressStats, data.stats);
    } else if (typeof updatePlaylistProgressStats === 'function') {
      updatePlaylistProgressStats(playlistProgressStats, data.stats);
    } else {
      // Fallback to simple stats update
      updateBasicProgressStats(playlistProgressStats, data.stats);
    }
  }
  
  // Handle task completion
  if (data.status === 'completed') {
    handleTaskCompleted(data);
  }
  
  // Handle task failure
  if (data.status === 'failed' || data.error) {
    handleTaskFailed(data);
  }
  
  // Handle task cancellation
  if (data.status === 'cancelled') {
    handleTaskCancelled();
  }
}

/**
 * Handle task completion
 * @param {Object} data - Task completion data
 */
function handleTaskCompleted(data) {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Get UI elements
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistResultsContainer = document.getElementById('playlist-results-container');
  const playlistStats = document.getElementById('playlist-stats');
  const openPlaylistJsonBtn = document.getElementById('open-playlist-json');
  
  if (!playlistProgressContainer || !playlistResultsContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    
    playlistResultsContainer.classList.remove('d-none');
    playlistResultsContainer.classList.add('fade-in');
    
    // Update stats
    if (playlistStats && data.stats) {
      if (typeof enhancedPlaylistStats === 'function') {
        enhancedPlaylistStats(playlistStats, data.stats, true);
      } else if (typeof updatePlaylistStats === 'function') {
        updatePlaylistStats(playlistStats, data.stats, data.output_file);
      } else {
        // Fallback to simple stats update
        updateBasicStats(playlistStats, data.stats, data.output_file);
      }
    }
    
    // Set output file for the Open JSON button
    if (openPlaylistJsonBtn && data.output_file) {
      openPlaylistJsonBtn.setAttribute('data-output-file', data.output_file);
    }
    
    setTimeout(() => {
      playlistResultsContainer.classList.remove('fade-in');
    }, 500);
    
    // Add task to history if function exists
    if (typeof addTaskToHistory === 'function') {
      addTaskToHistory('playlist', data.output_file, data.stats);
    }
    
    // Show success toast
    showToast('Success', 'Playlist download completed!', 'success');
    
    // Clear session storage
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
 * Handle task failure
 * @param {Object} data - Task failure data
 */
function handleTaskFailed(data) {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Show error
  showPlaylistError(data.error || 'Download failed');
}

/**
 * Handle task cancellation
 */
function handleTaskCancelled() {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Get UI elements
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (!playlistProgressContainer || !playlistFormContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    
    playlistFormContainer.classList.remove('d-none');
    playlistFormContainer.classList.add('fade-in');
    
    setTimeout(() => {
      playlistFormContainer.classList.remove('fade-in');
    }, 500);
    
    // Reset submit button
    const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
    if (playlistSubmitBtn) {
      playlistSubmitBtn.disabled = false;
      playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
    }
    
    // Show toast
    showToast('Cancelled', 'Playlist download was cancelled', 'warning');
    
    // Clear session storage
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
* Update basic progress statistics 
* @param {HTMLElement} statsElement - The element to update
* @param {Object} stats - The statistics object
*/
function updateBasicProgressStats(statsElement, stats) {
 if (!statsElement || !stats) return;
 
 let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
 
 // Add available stats with consistent styling
 if (stats.playlists_total !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
   </li>`;
 }
 
 if (stats.playlists_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
   </li>`;
 }
 
 if (stats.total_videos !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
   </li>`;
 }
 
 if (stats.videos_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Videos Processed <span class="badge bg-success rounded-pill">${stats.videos_processed}</span>
   </li>`;
 }
 
 // Add any additional stats like empty/skipped playlists and duration
 if (stats.empty_playlists !== undefined && stats.empty_playlists > 0) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Empty Playlists <span class="badge bg-warning rounded-pill">${stats.empty_playlists}</span>
   </li>`;
 }
 
 if (stats.skipped_playlists !== undefined && stats.skipped_playlists > 0) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Skipped Playlists <span class="badge bg-secondary rounded-pill">${stats.skipped_playlists}</span>
   </li>`;
 }
 
 if (stats.duration_seconds !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
   </li>`;
 }
 
 statsHtml += '</ul>';
 statsElement.innerHTML = statsHtml;
}

/**
* Update the progress bar with proper styling
* @param {HTMLElement} barElement - The progress bar element
* @param {number} progress - The progress percentage (0-100)
*/
function updateProgressBar(barElement, progress) {
 if (!barElement) return;
 
 // Ensure progress is a number between 0-100
 const validProgress = Math.max(0, Math.min(100, Number(progress) || 0));
 
 // Update the progress bar
 barElement.style.width = `${validProgress}%`;
 barElement.setAttribute('aria-valuenow', validProgress);
 barElement.textContent = `${Math.round(validProgress)}%`;
 
 // Update styling based on progress
 barElement.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-success');
 
 if (validProgress >= 100) {
   barElement.classList.add('bg-success');
   barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 75) {
   barElement.classList.add('bg-info');
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 50) {
   barElement.classList.add('bg-primary');
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 25) {
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else {
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 }
}

/**
* Update final stats with details about the completed task
* @param {HTMLElement} statsElement - The stats element 
* @param {Object} stats - The statistics object
* @param {string} outputFile - The output file path
*/
function updateBasicStats(statsElement, stats, outputFile) {
 if (!statsElement) return;
 
 let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
 
 // Add stats with consistent styling
 if (stats.playlists_total !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
   </li>`;
 }
 
 if (stats.playlists_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
   </li>`;
 }
 
 if (stats.total_videos !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
   </li>`;
 }
 
 if (stats.duration_seconds !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
   </li>`;
 }
 
 if (stats.download_directory || stats.root_directory) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Download Directory <span class="text-muted small">${stats.download_directory || stats.root_directory}</span>
   </li>`;
 }
 
 if (outputFile) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Output File <span class="text-muted small">${outputFile}</span>
   </li>`;
 }
 
 statsHtml += '</ul>';
 
 // Add nice-looking JSON viewer if function exists
 if (typeof addJsonView === 'function' && outputFile) {
   statsHtml += addJsonView(stats, outputFile);
 }
 
 statsElement.innerHTML = statsHtml;
}

/**
* Add CSS styles to fix the progress bar display
*/
function addProgressBarStyles() {
 // Check if styles are already added
 if (document.getElementById('custom-progress-styles')) {
   return;
 }
 
 // Create a style element
 const style = document.createElement('style');
 style.id = 'custom-progress-styles';
 
 // Add CSS to fix progress bar styling
 style.innerHTML = `
   /* Progress bar label positioning */
   .progress-bar {
     position: relative;
     display: flex;
     justify-content: center;
     align-items: center;
     overflow: visible;
   }
   
   /* Ensure the label is centered and visible */
   .progress-label {
     position: absolute;
     color: white;
     font-weight: bold;
     text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
     z-index: 5;
   }
   
   /* Dark theme adjustments */
   [data-theme="dark"] .progress-label {
     text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
   }
   
   /* When progress is low, position label outside the bar */
   .progress-bar[aria-valuenow="0"] .progress-label,
   .progress-bar[aria-valuenow="1"] .progress-label,
   .progress-bar[aria-valuenow="2"] .progress-label,
   .progress-bar[aria-valuenow="3"] .progress-label,
   .progress-bar[aria-valuenow="4"] .progress-label,
   .progress-bar[aria-valuenow="5"] .progress-label {
     left: 105%;
     color: var(--bs-body-color);
     text-shadow: none;
   }
   
   /* Added transition for smoother progress updates */
   .progress-bar {
     transition: width 0.4s ease-in-out;
   }
   
   /* Fade transitions for containers */
   .fade-in {
     animation: fadeIn 0.3s ease-in-out;
   }
   
   .fade-out {
     animation: fadeOut 0.3s ease-in-out;
   }
   
   @keyframes fadeIn {
     from { opacity: 0; }
     to { opacity: 1; }
   }
   
   @keyframes fadeOut {
     from { opacity: 1; }
     to { opacity: 0; }
   }
 `;
 
 // Add to the document
 document.head.appendChild(style);
 console.log("Progress bar styles added");
}

/**
* Debounce function to limit the frequency of events
* @param {Function} func - The function to debounce
* @param {number} wait - The time to wait between calls (ms)
* @returns {Function} - Debounced function
*/
function debounce(func, wait) {
 let timeout;
 return function(...args) {
   const context = this;
   clearTimeout(timeout);
   timeout = setTimeout(() => func.apply(context, args), wait);
 };
}

/**
* Enhanced progress bar update with smooth animations
* @param {HTMLElement} barElement - The progress bar element
* @param {number} targetPercent - The target percentage (0-100)
* @param {boolean} animated - Whether to animate the transition
*/
function enhancedProgressBar(barElement, targetPercent, animated = true) {
 if (!barElement) {
   console.warn("Progress bar element not found");
   return;
 }
 
 // Ensure the value is a number and within bounds
 targetPercent = Math.min(100, Math.max(0, parseInt(targetPercent) || 0));
 
 // Store last progress for transition management
 if (!barElement.lastProgress) {
   barElement.lastProgress = 0;
 }
 
 // Only update if change is significant enough (prevents jitter)
 if (Math.abs(targetPercent - barElement.lastProgress) < 1) {
   return;
 }
 
 // Store current progress
 barElement.lastProgress = targetPercent;
 
 // Use requestAnimationFrame for smoother DOM updates
 requestAnimationFrame(() => {
   // Apply proper transition based on magnitude of change
   const jumpThreshold = 15; // % threshold for jumps
   
   if (!animated || Math.abs(targetPercent - parseFloat(barElement.style.width || '0')) > jumpThreshold) {
     barElement.style.transition = 'none';
   } else {
     barElement.style.transition = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
   }
   
   // Set the width and other attributes
   barElement.style.width = `${targetPercent}%`;
   barElement.setAttribute('aria-valuenow', targetPercent);
   barElement.textContent = `${Math.round(targetPercent)}%`;
   
   // Handle completion styling
   if (targetPercent >= 100) {
     barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
     barElement.classList.add('bg-success', 'completed-animation');
   } else if (targetPercent > 0) {
     barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
     barElement.classList.remove('bg-success', 'completed-animation');
   }
 });
}
/**
 * Fix for the initializeThemes error - provide a dummy function if it doesn't exist
 */
function ensureGlobalFunctions() {
 
  // Add showToast fallback if it doesn't exist
  if (typeof window.showToast !== 'function') {
    window.showToast = function(title, message, type) {
      console.log(`Toast (${type}): ${title} - ${message}`);
      showToastMessage(title, message, type);
    };
  }
}
/**
 * DOM ready handler that initializes everything safely
 */
document.addEventListener('DOMContentLoaded', function() {
  // Ensure global functions exist
  ensureGlobalFunctions();
  
  // Initialize the playlist functionality after a short delay
  setTimeout(() => {
    initializeSocketConnection();
    initializePlaylistFeature();
    
    // Add direct form handler just to be safe
    const playlistForm = document.getElementById('playlist-form');
    if (playlistForm) {
      // Use onsubmit property as a fallback (works in more browsers)
      playlistForm.onsubmit = function(e) {
        e.preventDefault();
        handlePlaylistSubmit(e);
        return false;
      };
    }
  }, 500);
});

/**
 * Process and normalize stats data to ensure consistent format
 * @param {Object} stats - The original stats object
 * @returns {Object} - Normalized stats object with all required fields
 */
function processStatsData(stats) {
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
    failed_playlists: stats.failed_playlists || 0,
    // Additional fields for detailed stats
    success_rate: calculateSuccessRate(stats),
    video_download_rate: calculateVideoRate(stats),
    average_file_size: calculateAverageFileSize(stats)
  };
}

/**
 * Calculate success rate from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Success rate percentage
 */
function calculateSuccessRate(stats) {
  const total = (stats.total_playlists || stats.playlists_total || 1);
  const processed = (stats.processed_playlists || stats.completed_playlists || stats.playlists_processed || 0);
  return Math.round((processed / total) * 100);
}

/**
 * Calculate video download rate from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Video download rate percentage
 */
function calculateVideoRate(stats) {
  const total = (stats.total_videos || stats.videos_total || 1);
  const processed = (stats.processed_videos || stats.videos_processed || 0);
  return Math.round((processed / total) * 100);
}

/**
 * Calculate average file size from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Average file size in bytes
 */
function calculateAverageFileSize(stats) {
  const totalBytes = stats.total_bytes || 0;
  const totalFiles = stats.processed_files || stats.total_files || 1;
  return totalBytes > 0 ? Math.round(totalBytes / totalFiles) : 0;
}


/**
 * Update progress display based on status data
 * @param {Object} data - Status data from server
 */
function updatePlaylistProgress(data) {
  if (!data) return;
  
  // Get UI elements with direct DOM access
  const progressBar = document.getElementById('playlist-progress-bar');
  const progressStatus = document.getElementById('playlist-progress-status');
  const progressStats = document.getElementById('playlist-progress-stats');
  
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
  if (progressStatus) {
    progressStatus.textContent = data.message || 'Processing...';
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateProgressStats(progressStats, data.stats);
  }
  
  // Handle completion
  if (data.status === 'completed') {
    handleTaskCompleted(data);
  } else if (data.status === 'failed' || data.error) {
    handleTaskFailed(data);
  } else if (data.status === 'cancelled') {
    handleTaskCancelled();
  }
}
/**
 * Update progress statistics display
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Stats data object
 */
function updateProgressStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  if (stats.total_playlists !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.total_playlists}</span>
    </li>`;
  }
  
  if (stats.processed_playlists !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.processed_playlists}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  if (stats.processed_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Videos Processed <span class="badge bg-success rounded-pill">${stats.processed_videos}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Show toast message with fallbacks
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} type - Toast type (info, success, warning, error)
 */
function showToastMessage(title, message, type) {
  try {
    // Try using main showToast function if it exists
    if (typeof showToast === 'function') {
      showToast(title, message, type);
      return;
    }
    
    // Bootstrap toast fallback
    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
      }
      
      // Create toast element
      const toastEl = document.createElement('div');
      toastEl.className = `toast bg-${type === 'error' ? 'danger' : type} text-white`;
      toastEl.setAttribute('role', 'alert');
      toastEl.setAttribute('aria-live', 'assertive');
      toastEl.setAttribute('aria-atomic', 'true');
      
      toastEl.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">${message}</div>
      `;
      
      toastContainer.appendChild(toastEl);
      
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        toastEl.remove();
      }, 5000);
      
      return;
    }
    
    // Simple alert fallback
    alert(`${title}: ${message}`);
  } catch (e) {
    console.error("Error showing toast:", e);
    alert(`${title}: ${message}`);
  }
}
/**
 * Show result UI
 * @param {Object} data - Result data
 */
function showResult(data) {
  try {
    console.log("Showing enhanced result UI with data:", data);
    
    // Get UI containers
    const progressContainer = document.getElementById('playlist-progress-container');
    const resultsContainer = document.getElementById('playlist-results-container');
    const resultStats = document.getElementById('playlist-result-stats');
    
    // Update UI state - use a state object if available, otherwise skip
    if (typeof state !== 'undefined') {
      state.uiState = state.uiState || {};
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = true;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
    }
    
    // Use UI module for smooth transition if available
    if (typeof ui !== 'undefined' && typeof ui.transitionBetweenElements === 'function') {
      ui.transitionBetweenElements(progressContainer, resultsContainer);
    } else {
      // Fallback to simple visibility toggle
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'block';
    }
    
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
      updateDetailedResultStats(resultStats, data.stats, data.output_file);
    }
    
    // Show toast notification
    showToast('Download Complete', 'Your playlists have been processed successfully', 'success');
    
    // Emit completion event if registry available
    if (typeof eventRegistry !== 'undefined' && typeof eventRegistry.emit === 'function') {
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
            <button class="btn btn-primary" onclick="handleNewPlaylistTask()">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
        `;
      }
    } catch (fallbackError) {
      console.error("Error with fallback result display:", fallbackError);
    }
  }
}

/**
 * Update result statistics display with enhanced detailed stats
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 * @param {string} outputFile - Output file path
 */
function updateDetailedResultStats(element, stats, outputFile) {
  try {
    if (!element) return;
    
    // Process stats to ensure all values are present
    stats = processStatsData(stats);
    
    // Calculate percentages for progress bars
    const playlistCompletionPercent = stats.total_playlists > 0 
      ? Math.round((stats.processed_playlists / stats.total_playlists) * 100) 
      : 0;
    
    const videoCompletionPercent = stats.total_videos > 0 
      ? Math.round((stats.processed_videos / stats.total_videos) * 100) 
      : 0;
    
    // Format the timestamp if available
    let formattedTimestamp = '';
    if (stats.completed_at) {
      const date = new Date(stats.completed_at);
      formattedTimestamp = isNaN(date.getTime()) 
        ? stats.completed_at 
        : date.toLocaleString();
    }
    
    // Create a formatted display of the stats with enhanced visuals and animations
    let statsHtml = `
      <div class="stats-container animate__animated animate__fadeIn">
        <!-- Summary section with completion status -->
        <div class="summary-section mb-4 p-3 rounded d-flex align-items-center">
          <div class="success-icon-container me-3">
            <div class="success-icon-circle">
              <i class="fas fa-check text-success fa-lg"></i>
            </div>
          </div>
          <div class="flex-grow-1">
            <h5 class="mb-1">Download Complete</h5>
            <p class="mb-0 text-muted">All tasks completed in ${formatDuration(stats.total_processing_time)}</p>
          </div>
          <div class="time-badge">
            <i class="fas fa-clock"></i>
            ${formatDuration(stats.duration_seconds)} content
          </div>
        </div>
        
        <!-- Output file info with copy button -->
        ${outputFile ? `
          <div class="file-info-card mb-4 p-3 rounded position-relative">
            <div class="d-flex align-items-center">
              <div class="file-icon-container me-3">
                <i class="fas fa-file-alt text-primary fa-2x"></i>
              </div>
              <div class="file-details flex-grow-1">
                <label class="text-muted small mb-1">Output File</label>
                <div class="file-path text-truncate">${outputFile}</div>
              </div>
              <div class="file-actions">
                <button class="btn btn-sm btn-outline-primary copy-path-btn" 
                        data-path="${outputFile}" title="Copy path to clipboard"
                        onclick="copyToClipboard('${outputFile}')">
                  <i class="fas fa-copy"></i> Copy
                </button>
                <button class="btn btn-sm btn-outline-secondary ms-2 open-folder-btn" 
                        data-path="${outputFile}" title="Open containing folder"
                        onclick="openFileOrFolder('${outputFile}')">
                  <i class="fas fa-folder-open"></i>
                </button>
              </div>
            </div>
          </div>
        ` : ''}
        
        <!-- Main Stats Cards with visual progress indicators -->
        <div class="row g-3 mb-4">
          <!-- Playlists Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-list icon-primary me-2"></i>
                    <h6 class="mb-0">Playlists</h6>
                  </div>
                </div>
                <div class="stat-badge ${stats.failed_playlists > 0 ? 'bg-warning' : 'bg-success'}">
                  ${playlistCompletionPercent}% Complete
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${stats.processed_playlists}</div>
                <div class="text-muted ms-2">/ ${stats.total_playlists} processed</div>
              </div>
              
              <div class="progress stat-progress mb-2">
                <div class="progress-bar ${stats.failed_playlists > 0 ? 'bg-warning' : 'bg-success'}" 
                     role="progressbar" 
                     style="width: ${playlistCompletionPercent}%" 
                     aria-valuenow="${playlistCompletionPercent}" 
                     aria-valuemin="0" 
                     aria-valuemax="100"></div>
              </div>
              
              <div class="stat-details">
                ${stats.empty_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <span>${stats.empty_playlists} empty playlists</span>
                  </div>` : ''}
                
                ${stats.failed_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-times-circle text-danger"></i>
                    <span>${stats.failed_playlists} failed playlists</span>
                  </div>` : ''}
                
                ${stats.skipped_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-forward text-secondary"></i>
                    <span>${stats.skipped_playlists} skipped playlists</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
          
<!-- Videos Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-video icon-info me-2"></i>
                    <h6 class="mb-0">Videos</h6>
                  </div>
                </div>
                <div class="stat-badge bg-info">
                  ${videoCompletionPercent}% Complete
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${stats.processed_videos}</div>
                <div class="text-muted ms-2">/ ${stats.total_videos} downloaded</div>
              </div>
              
              <div class="progress stat-progress mb-2">
                <div class="progress-bar bg-info" 
                     role="progressbar" 
                     style="width: ${videoCompletionPercent}%" 
                     aria-valuenow="${videoCompletionPercent}" 
                     aria-valuemin="0" 
                     aria-valuemax="100"></div>
              </div>
              
              <div class="stat-details">
                ${stats.download_directory ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-folder text-primary"></i>
                    <span class="text-truncate" title="${stats.download_directory}">${stats.download_directory}</span>
                  </div>` : ''}
                  
                ${stats.total_bytes > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-database text-secondary"></i>
                    <span>Total size: ${formatBytes(stats.total_bytes)}</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
          
          <!-- Time Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-clock icon-success me-2"></i>
                    <h6 class="mb-0">Duration</h6>
                  </div>
                </div>
                <div class="stat-badge bg-secondary">
                  <i class="fas fa-check-circle me-1"></i> Completed
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${formatDuration(stats.total_processing_time)}</div>
              </div>
              
              <div class="time-stats mb-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="time-label">Processing Time</div>
                  <div class="time-value">${formatDuration(stats.total_processing_time)}</div>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <div class="time-label">Content Duration</div>
                  <div class="time-value">${formatDuration(stats.duration_seconds)}</div>
                </div>
              </div>
              
              <div class="stat-details">
                ${formattedTimestamp ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-calendar-check text-secondary"></i>
                    <span>Completed: ${formattedTimestamp}</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Expandable Details Section -->
        <div class="details-expandable mb-4">
          <div class="details-header p-3 rounded d-flex justify-content-between align-items-center" 
               data-bs-toggle="collapse" 
               data-bs-target="#detailed-stats" 
               role="button" 
               aria-expanded="false" 
               aria-controls="detailed-stats">
            <h6 class="mb-0"><i class="fas fa-info-circle me-2"></i>Additional Information</h6>
            <i class="fas fa-chevron-down"></i>
          </div>
          <div class="collapse" id="detailed-stats">
            <div class="details-content p-3 rounded">
              <div class="row g-3">
                <!-- Left column - Processing stats -->
                <div class="col-md-6">
                  <h6 class="details-subtitle mb-2">Processing Statistics</h6>
                  <ul class="list-group stats-list">
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
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-step-forward text-secondary me-2"></i>Skipped Playlists</span>
                      <span class="badge bg-secondary rounded-pill">${stats.skipped_playlists}</span>
                    </li>
                  </ul>
                </div>
                
                <!-- Right column - File stats -->
                <div class="col-md-6">
                  <h6 class="details-subtitle mb-2">File Statistics</h6>
                  <ul class="list-group stats-list">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-file text-primary me-2"></i>Total Files</span>
                      <span class="badge bg-primary rounded-pill">${stats.total_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-check-circle text-success me-2"></i>Processed Files</span>
                      <span class="badge bg-success rounded-pill">${stats.processed_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-times-circle text-danger me-2"></i>Error Files</span>
                      <span class="badge bg-danger rounded-pill">${stats.error_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-database text-info me-2"></i>Total Size</span>
                      <span class="badge bg-info rounded-pill">${formatBytes(stats.total_bytes)}</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <!-- Detailed Stats Section -->
              <div class="mt-4">
                <h6 class="details-subtitle mb-3">Detailed Performance Metrics</h6>
                <div class="row g-3">
                  <!-- Efficiency Metrics -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-tachometer-alt fa-2x text-primary"></i>
                      </div>
                      <div class="metric-value h4 mb-1">${stats.average_file_size > 0 ? formatBytes(stats.average_file_size) : 'N/A'}</div>
                      <div class="metric-label small text-muted">Average File Size</div>
                    </div>
                  </div>
                  
                  <!-- Success Rate -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-chart-pie fa-2x text-success"></i>
                      </div>
                      <div class="metric-value h4 mb-1">${stats.success_rate}%</div>
                      <div class="metric-label small text-muted">Success Rate</div>
                    </div>
                  </div>
                  
                  <!-- Processing Speed -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-bolt fa-2x text-warning"></i>
                      </div>
                      <div class="metric-value h4 mb-1">
                        ${stats.total_processing_time > 0 && stats.processed_videos > 0 ? 
                          (stats.processed_videos / (stats.total_processing_time / 60)).toFixed(2) : 'N/A'}
                      </div>
                      <div class="metric-label small text-muted">Videos Per Minute</div>
                    </div>
                  </div>
                </div>
                
                <!-- Additional Technical Details -->
                <div class="technical-details mt-4 small">
                  <h6 class="details-subtitle mb-2">Technical Details</h6>
                  <table class="table table-sm table-bordered">
                    <tbody>
                      <tr>
                        <td class="text-muted fw-bold">Total Chunks</td>
                        <td>${stats.total_chunks || 'N/A'}</td>
                        <td class="text-muted fw-bold">Processed Files</td>
                        <td>${stats.processed_files || 0}</td>
                      </tr>
                      <tr>
                        <td class="text-muted fw-bold">Status</td>
                        <td><span class="badge bg-success">${stats.status || 'completed'}</span></td>
                        <td class="text-muted fw-bold">Completion Time</td>
                        <td>${formattedTimestamp || 'Not recorded'}</td>
                      </tr>
                      <tr>
                        <td class="text-muted fw-bold">Total Size</td>
                        <td>${formatBytes(stats.total_bytes || 0)}</td>
                        <td class="text-muted fw-bold">Content Duration</td>
                        <td>${formatDuration(stats.duration_seconds || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Action Buttons with hover effects -->
        <div class="action-buttons d-flex justify-content-between flex-wrap">
          <div class="mb-2">
            <button id="playlist-new-task-btn" class="btn btn-primary btn-lg action-btn">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
          <div class="mb-2">
            <button id="open-playlist-json" class="btn btn-success btn-lg action-btn" data-output-file="${outputFile || ''}">
              <i class="fas fa-file-alt me-2"></i>Open Result File
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Update the element with the new HTML
    element.innerHTML = statsHtml;
    
    // Initialize bootstrap collapse elements if Bootstrap is available
    if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
      const collapseElements = element.querySelectorAll('[data-bs-toggle="collapse"]');
      collapseElements.forEach(collapseEl => {
        collapseEl.addEventListener('click', function() {
          const icon = this.querySelector('.fas.fa-chevron-down, .fas.fa-chevron-up');
          if (icon) {
            icon.classList.toggle('fa-chevron-up');
            icon.classList.toggle('fa-chevron-down');
          }
        });
      });
    } else {
      // Fallback for manual collapse functionality
      const toggleElements = element.querySelectorAll('[data-bs-toggle="collapse"]');
      toggleElements.forEach(toggleEl => {
        toggleEl.addEventListener('click', function() {
          const targetSelector = this.getAttribute('data-bs-target');
          const targetElement = document.querySelector(targetSelector);
          if (targetElement) {
            targetElement.classList.toggle('show');
            
            // Toggle icon
            const icon = this.querySelector('.fas.fa-chevron-down, .fas.fa-chevron-up');
            if (icon) {
              icon.classList.toggle('fa-chevron-up');
              icon.classList.toggle('fa-chevron-down');
            }
          }
        });
      });
    }
    
    // Add event handlers for buttons
    const newTaskBtn = element.querySelector('#playlist-new-task-btn');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', handleNewPlaylistTask);
    }
    
    const openBtn = element.querySelector('#open-playlist-json');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const outputFile = openBtn.getAttribute('data-output-file');
        if (outputFile) {
          openFileOrFolder(outputFile);
        }
      });
    }
    
    // Add event handler for folder open button
    const openFolderBtn = element.querySelector('.open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const path = openFolderBtn.getAttribute('data-path');
        if (path) {
          openFileOrFolder(path);
        }
      });
    }
    
    // Initialize tooltips if Bootstrap's tooltip JS is available
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(element.querySelectorAll('[title]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
    }
    
    // Add custom styles if needed
    addStatsStyles();
    
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
      const fallbackBtn = element.querySelector('#playlist-new-task-fallback');
      if (fallbackBtn) {
        fallbackBtn.addEventListener('click', handleNewPlaylistTask);
      }
    }
  }
}

/**
 * Add custom styles for the enhanced stats view
 */
function addStatsStyles() {
  // Check if styles already exist
  if (document.getElementById('enhanced-stats-styles')) {
    return;
  }
  
  // Create style element
  const style = document.createElement('style');
  style.id = 'enhanced-stats-styles';
  
  // Add styles
  style.innerHTML = `
    /* Enhanced Stats UI Styles */
    .stats-container {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    
    /* Dark theme support */
    [data-theme="dark"] .stats-container {
      background-color: #2b3035;
      color: #e9ecef;
    }
    
    .summary-section {
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.03);
    }
    
    [data-theme="dark"] .summary-section {
      background-color: #343a40;
      color: #e9ecef;
    }
    
    .success-icon-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background-color: rgba(25, 135, 84, 0.1);
    }
    
    .time-badge {
      background-color: #6c757d;
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.875rem;
    }
    
    .file-info-card {
      background-color: #ffffff;
      border: 1px solid rgba(0,0,0,0.08);
    }
    
    [data-theme="dark"] .file-info-card {
      background-color: #343a40;
      border-color: rgba(255,255,255,0.08);
    }
    
    .stat-card {
      background-color: #ffffff;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    [data-theme="dark"] .stat-card {
      background-color: #343a40;
      color: #e9ecef;
      border: 1px solid rgba(255,255,255,0.05);
    }
    
    .stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.08);
    }
    
    .stat-numbers .value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
    }
    
    .stat-badge {
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 12px;
    }
    
    .stat-progress {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .stat-detail-item {
      font-size: 0.875rem;
      margin-top: 8px;
      display: flex;
      align-items: center;
    }
    
    .stat-detail-item i {
      margin-right: 6px;
      width: 16px;
      text-align: center;
    }
    
    .details-expandable .details-header {
      background-color: #f1f3f5;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    [data-theme="dark"] .details-expandable .details-header {
      background-color: #3e444a;
    }
    
    .details-expandable .details-header:hover {
      background-color: #e9ecef;
    }
    
    [data-theme="dark"] .details-expandable .details-header:hover {
      background-color: #495057;
    }
    
    .details-expandable .details-content {
      background-color: #ffffff;
      border: 1px solid #e9ecef;
      border-top: none;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }
    
    [data-theme="dark"] .details-expandable .details-content {
      background-color: #343a40;
      border-color: #495057;
    }
    
    .details-subtitle {
      color: #6c757d;
      font-weight: 600;
    }
    
    .metric-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
    }
    
    .technical-details table {
      font-size: 0.875rem;
    }
    
    .action-buttons .action-btn {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .action-buttons .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    /* Animation classes */
    .animate__animated {
      animation-duration: 0.5s;
    }
    
    .animate__fadeIn {
      animation-name: fadeIn;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  
  // Add to document
  document.head.appendChild(style);
}

/**
 * Copy text to clipboard with feedback
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
  // Check for modern clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Copied', 'Path copied to clipboard', 'success');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        showToast('Error', 'Failed to copy to clipboard', 'error');
        
        // Fallback
        copyToClipboardFallback(text);
      });
  } else {
    // Fallback for older browsers
    copyToClipboardFallback(text);
  }
}

/**
 * Fallback method for clipboard copying
 * @param {string} text - Text to copy
 */
function copyToClipboardFallback(text) {
  try {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';  // Prevent scrolling to bottom in some browsers
    document.body.appendChild(textarea);
    textarea.select();
    
    // Try to copy
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      showToast('Copied', 'Path copied to clipboard', 'success');
    } else {
      showToast('Error', 'Copy failed. Please copy the path manually.', 'error');
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showToast('Error', 'Failed to copy to clipboard', 'error');
  }
}

/**
 * Open file or folder
 * @param {string} path - Path to open
 */
function openFileOrFolder(path) {
  if (!path) {
    console.warn("No path specified to open");
    return;
  }
  
  try {
    // Try using API to open file
    fetch('/api/open-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: path })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast('Success', 'Opening file...', 'success');
      } else {
        console.warn("Could not open file:", data.message);
        showToast('Error', `Could not open file: ${data.message}`, 'warning');
        
        // Show path as fallback
        alert(`File is located at: ${path}`);
      }
    })
    .catch(error => {
      console.error("Error opening file:", error);
      showToast('Error', `Could not open file: ${error.message}`, 'error');
      
      // Show path as fallback
      alert(`File is located at: ${path}`);
    });
  } catch (error) {
    console.error("Error opening file/folder:", error);
    showToast('Error', `Could not open: ${path}`, 'error');
    
    // Show path as fallback
    alert(`File is located at: ${path}`);
  }
}

/**
 * Update the result stats (legacy method that calls the new implementation)
 * Maintains compatibility with existing code
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 * @param {string} outputFile - Output file path
 */
function updateResultStats(element, stats, outputFile) {
  // Call the new detailed stats implementation
  updateDetailedResultStats(element, stats, outputFile);
}