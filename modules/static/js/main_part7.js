
//==========================================
// SECTION 18 - Enhancements 
// =========================================



/**
 * Main initialization function to set up all enhanced features
 * This needs to be called in your application to use these functions
 */
function initializeEnhancedFeatures() {
  // Set up improved error handling
  window.handleErrorWithRecovery = handleErrorWithRecovery;
  
  // Configure server connectivity checks
  window.checkServerReachable = checkServerReachable;
  
  // Setup enhanced PDF processing
  window.processPDF = processPDF;
  
  // Make setupCompletionSafetyTimeout available
  window.setupCompletionSafetyTimeout = setupCompletionSafetyTimeout;
  
  console.log("Enhanced features initialized successfully");
  
  // Apply compatibility patches based on server version
  applyServerCompatibilityPatches();
}

/**
 * Apply workarounds for known server bugs
 */
function applyServerCompatibilityPatches() {
  // Fix for the 'include_audio' parameter error
  const originalPlaylistDownload = window.startPlaylistDownload;
  
  if (typeof originalPlaylistDownload === 'function') {
    window.startPlaylistDownload = function(params) {
      // Check if we're on an older server version that doesn't support include_audio
      if (params && params.include_audio !== undefined) {
        // Make a server version check
        fetch('/api/version')
          .then(response => response.json())
          .then(data => {
            // Check server version to determine if include_audio is supported
            const serverVersion = data.version || '';
            const supportsAudioParam = compareVersions(serverVersion, '1.5.0') >= 0;
            
            if (!supportsAudioParam) {
              console.warn("Server version doesn't support include_audio parameter, removing it");
              delete params.include_audio;
            }
            
            // Call original function with fixed params
            originalPlaylistDownload(params);
          })
          .catch(error => {
            console.warn("Couldn't check server version, removing potentially unsupported params:", error);
            // Remove potentially unsupported params
            delete params.include_audio;
            
            // Call original function with fixed params
            originalPlaylistDownload(params);
          });
      } else {
        // No problematic params, call original function
        originalPlaylistDownload(params);
      }
    };
  }
}

/**
 * Compare version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} - Negative if v1 < v2, positive if v1 > v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  // Fill with zeros to ensure equal length
  while (parts1.length < parts2.length) parts1.push(0);
  while (parts2.length < parts1.length) parts2.push(0);
  
  // Compare each part
  for (let i = 0; i < parts1.length; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}

// Initialize enhanced features
document.addEventListener('DOMContentLoaded', initializeEnhancedFeatures);
/**
 * Establishes a robust Socket.IO connection with advanced reliability features
 * @returns {Object} - The configured socket instance
 */
function setupRobustSocketConnection() {
  // Clean up existing socket if present
  if (window.socket) {
    try {
      console.log("Cleaning up existing socket connection");
      if (typeof window.socket.removeAllListeners === 'function') {
        window.socket.removeAllListeners();
      } else {
        // Remove critical event listeners individually
        ['connect', 'connect_error', 'disconnect', 'task_completed', 
         'progress_update', 'task_error', 'pdf_download_progress'].forEach(event => {
          window.socket.off(event);
        });
      }
      window.socket.close();
    } catch (e) {
      console.warn("Error cleaning up existing socket:", e);
    }
  }
  
  // Create socket with optimized configuration
  try {
    console.log("Initializing robust Socket.IO connection");
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 20000,
      forceNew: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],  // Prefer WebSocket for better performance
      upgrade: true,
      rememberUpgrade: true
    });
    
    // Set up robust connection monitoring
    setupConnectionHealthMonitoring(socket);
    
    // Register core event handlers
    setupCoreSocketEvents(socket);
    
    window.socket = socket;
    return socket;
  } catch (e) {
    console.error("Failed to initialize Socket.IO:", e);
    showToast('Connection Error', 'Real-time updates unavailable. Falling back to polling.', 'warning');
    startStatusPolling();
    return null;
  }
}

/**
 * Sets up connection health monitoring with heartbeat
 * @param {Object} socket - The Socket.IO instance
 */
function setupConnectionHealthMonitoring(socket) {
  // Clear any existing intervals
  if (window.heartbeatInterval) {
    clearInterval(window.heartbeatInterval);
  }
  
  // Connection quality metrics
  window.connectionMetrics = {
    lastPingTime: 0,
    pingHistory: [],
    disconnectCount: 0,
    lastMessageTime: Date.now(),
    connectionQuality: 'unknown'
  };
  
  // Set up heartbeat to maintain connection and measure latency
  window.heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      // Record ping start time
      window.connectionMetrics.lastPingTime = Date.now();
      
      // Send lightweight heartbeat
      socket.emit('ping_from_client', { 
        client_timestamp: Date.now(),
        client_info: {
          taskId: currentTaskId,
          lastProgress: window.lastProgressValue || 0
        }
      });
    } else if (socket) {
      // Try to reconnect if disconnected
      try {
        socket.connect();
        console.log("Heartbeat attempting socket reconnection");
      } catch (e) {
        console.warn("Failed to reconnect socket:", e);
      }
    }
  }, 20000); // 20 second interval
  
  // Listen for pong responses
  socket.on('pong_to_client', function(data) {
    const roundTripTime = Date.now() - window.connectionMetrics.lastPingTime;
    
    // Update connection metrics
    window.connectionMetrics.pingHistory.push(roundTripTime);
    // Keep only the last 5 measurements
    if (window.connectionMetrics.pingHistory.length > 5) {
      window.connectionMetrics.pingHistory.shift();
    }
    
    // Calculate average ping time
    const avgPing = window.connectionMetrics.pingHistory.reduce((sum, time) => sum + time, 0) / 
                    window.connectionMetrics.pingHistory.length;
    
    // Update connection quality assessment
    if (avgPing < 100) {
      window.connectionMetrics.connectionQuality = 'excellent';
    } else if (avgPing < 300) {
      window.connectionMetrics.connectionQuality = 'good';
    } else {
      window.connectionMetrics.connectionQuality = 'poor';
    }
    
    // Update the connection indicator in UI if it exists
    updateConnectionIndicator(window.connectionMetrics.connectionQuality);
    
    console.log(`Socket ping: ${roundTripTime}ms, Connection quality: ${window.connectionMetrics.connectionQuality}`);
  });
  
  // Update the last message time whenever we receive any message
  const originalOnEvent = socket.onevent;
  socket.onevent = function(packet) {
    window.connectionMetrics.lastMessageTime = Date.now();
    return originalOnEvent.call(this, packet);
  };
  
  // Connection status monitoring
  socket.on('connect', function() {
    window.connectionMetrics.lastMessageTime = Date.now();
    updateConnectionIndicator('connected');
  });
  
  socket.on('disconnect', function() {
    window.connectionMetrics.disconnectCount++;
    updateConnectionIndicator('disconnected');
  });
  
  // Additional listener for troubleshooting
  socket.on('connect_error', function(error) {
    console.warn("Socket connection error:", error);
    updateConnectionIndicator('error');
  });
}

/**
 * Updates the connection quality indicator in the UI
 * @param {string} status - Connection status or quality
 */
function updateConnectionIndicator(status) {
  const indicator = document.getElementById('connection-indicator');
  if (!indicator) return;
  
  // Remove existing classes
  indicator.classList.remove('bg-success', 'bg-warning', 'bg-danger', 'bg-secondary');
  
  // Update based on status
  switch(status) {
    case 'excellent':
      indicator.classList.add('bg-success');
      indicator.title = 'Connection: Excellent';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'good':
      indicator.classList.add('bg-success');
      indicator.title = 'Connection: Good';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'poor':
      indicator.classList.add('bg-warning');
      indicator.title = 'Connection: Poor';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'disconnected':
      indicator.classList.add('bg-danger');
      indicator.title = 'Connection: Disconnected';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'error':
      indicator.classList.add('bg-danger');
      indicator.title = 'Connection: Error';
      indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
      break;
    default:
      indicator.classList.add('bg-secondary');
      indicator.title = 'Connection: Unknown';
      indicator.innerHTML = '<i class="fas fa-question"></i>';
  }
}

/**
 * Sets up core Socket.IO event handlers
 * @param {Object} socket - The Socket.IO instance
 */
function setupCoreSocketEvents(socket) {
  // Connection events
  socket.on('connect', function() {
    console.log('Socket.IO connected with ID:', socket.id);
    
    // Stop polling as we now have a real-time connection
    stopStatusPolling();
    
    // Request status update for current task if any
    if (currentTaskId) {
      try {
        socket.emit('request_task_status', { task_id: currentTaskId });
        console.log("Status request sent for task ID:", currentTaskId);
      } catch (e) {
        console.error("Error requesting status update:", e);
      }
    }
    
    showToast('Connected', 'Real-time connection established', 'success');
  });
  
  // Task completion handler
  socket.on('task_completed', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task completed event received:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Stop polling
      stopStatusPolling();
      
      // Set completion flags
      window.completionTriggered = true;
      window.taskCompleted = true;
          
      // Determine which tab is active and handle accordingly
      const activeTab = document.querySelector('.tab-pane.active');
      
      try {
        if (activeTab && activeTab.id === 'scraper') {
          formatAndDisplayScraperResults(data);
        } else if (activeTab && activeTab.id === 'playlist') {
          playlistProgressContainer.classList.add('d-none');
          playlistResultsContainer.classList.remove('d-none');
          
          if (playlistStats && data.stats) {
            updateScraperStats(playlistStats, data.stats, data.output_file);
          }
        } else {
          showResult(data);
        }
        
        // Add task to history
        addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
        showToast('Success', 'Task completed successfully!', 'success');
      } catch (e) {
        console.error("Error handling task completion:", e);
        showToast('Error', 'Error displaying results: ' + e.message, 'error');
      }
    }
  });
  
  // Progress update handler
  socket.on('progress_update', function(data) {
    if (data.task_id === currentTaskId) {
      // Store the original progress for debugging
      const originalProgress = data.progress;
      
      // Apply progress normalization
      if (data.progress !== undefined) {
        data.progress = normalizeProgress(data.progress, data);
      }
      
      console.log(`Progress update: ${originalProgress}% → ${data.progress}%, ${data.message || ''}`);
      
      try {
        // Update appropriate UI elements based on active tab
        updateProgressUI(data);
        
        // Track for simulation
        window.lastProgressValue = data.progress;
        window.lastProgressTimestamp = Date.now();
        
        // Check if we need to start progress simulation
        if (data.progress === 50) {
          startAdvancedProgressSimulation(data);
        } else if (data.progress > 50) {
          // If we get a real progress update above 50%, stop simulation
          stopProgressSimulation();
        }
        
        // Check for completion
        if (data.progress >= 99 || data.status === 'completed') {
          handleTaskNearCompletion(data);
        }
      } catch (e) {
        console.error("Error updating progress:", e);
      }
    }
  });
  
  // Error handler
  socket.on('task_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Task error:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Stop polling
      stopStatusPolling();
      
      try {
        // Determine which tab is active and handle accordingly
        handleTaskError(data);
      } catch (e) {
        console.error("Error handling task error:", e);
        showToast('Error', 'An unexpected error occurred', 'error');
      }
    }
  });
}

/**
 * Start advanced progress simulation with batch awareness
 * @param {Object} data - Progress data from server
 */
function startAdvancedProgressSimulation(data) {
  // Stop any existing simulation
  stopProgressSimulation();
  
  // Store initial data
  window.simulationData = {
    startTime: Date.now(),
    startProgress: data.progress || 0,
    message: data.message || 'Processing...',
    batchInfo: null,
    details: data.details || {},
    currentProgress: data.progress || 0
  };
  
  // Extract batch information if available
  if (data.message && data.message.includes('batch')) {
    const batchMatch = data.message.match(/batch (\d+)\/(\d+)/);
    if (batchMatch && batchMatch.length >= 3) {
      window.simulationData.batchInfo = {
        current: parseInt(batchMatch[1]),
        total: parseInt(batchMatch[2]),
        isFinal: parseInt(batchMatch[1]) === parseInt(batchMatch[2])
      };
      console.log(`Simulation using batch info: ${window.simulationData.batchInfo.current}/${window.simulationData.batchInfo.total}`);
    }
  }
  
  // Start the simulation interval
  window.progressSimulationInterval = setInterval(() => {
    const simData = window.simulationData;
    if (!simData) return;
    
    const now = Date.now();
    const elapsedSecs = (now - simData.startTime) / 1000;
    
    // Only simulate if we're stuck at a plateau (usually 50%)
    if (simData.currentProgress === 50) {
      let simulatedProgress;
      
      // Use batch information for better simulation if available
      if (simData.batchInfo && simData.batchInfo.isFinal) {
        // For final batch, simulate 50-95% over about 30 seconds
        const maxSimulatedProgress = 95;
        const simulationDuration = 30; // seconds
        simulatedProgress = Math.min(
          maxSimulatedProgress, 
          50 + ((elapsedSecs / simulationDuration) * (maxSimulatedProgress - 50))
        );
      } else {
        // More conservative simulation when batch info is unknown
        // Simulate 50-75% over about 20 seconds
        const maxSimulatedProgress = 75;
        const simulationDuration = 20; // seconds
        simulatedProgress = Math.min(
          maxSimulatedProgress, 
          50 + ((elapsedSecs / simulationDuration) * (maxSimulatedProgress - 50))
        );
      }
      
      // Round to whole number and update UI
      simulatedProgress = Math.round(simulatedProgress);
      
      // Only update if there's actual change
      if (simulatedProgress > simData.currentProgress) {
        simData.currentProgress = simulatedProgress;
        
        // Build a message that indicates simulation
        let statusMessage = "Processing... (estimating time remaining)";
        if (simData.batchInfo) {
          statusMessage = `Processing batch ${simData.batchInfo.current}/${simData.batchInfo.total}... (estimating time remaining)`;
        }
        
        // Update UI based on active tab
        updateProgressUIWithSimulation(simulatedProgress, statusMessage);
        
        console.log(`Simulated progress: ${simulatedProgress}% (${elapsedSecs.toFixed(1)}s elapsed)`);
      }
    }
  }, 1000);
  
  console.log("Advanced progress simulation started");
}

/**
 * Update progress UI with simulated progress
 * @param {number} progress - The progress percentage
 * @param {string} message - Status message
 */
function updateProgressUIWithSimulation(progress, message) {
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (activeTab && activeTab.id === 'scraper') {
    if (scraperProgressBar) {
      updateProgressBarElement(scraperProgressBar, progress);
    }
    if (scraperProgressStatus) {
      scraperProgressStatus.textContent = message;
    }
  } else if (activeTab && activeTab.id === 'playlist') {
    if (playlistProgressBar) {
      updateProgressBarElement(playlistProgressBar, progress);
    }
    if (playlistProgressStatus) {
      playlistProgressStatus.textContent = message;
    }
  } else {
    if (progressBar) {
      updateProgressBarElement(progressBar, progress);
    }
    if (progressStatus) {
      updateProgressStatus(progressStatus, message);
    }
  }
}


/**
 * Handle task approaching completion (99-100%)
 * @param {Object} data - Task data
 */
function handleTaskNearCompletion(data) {
  if (!window.completionTriggered && !window.taskCompleted) {
    console.log("Task nearing completion detected in progress_update");
    
    // Stop any progress simulation
    stopProgressSimulation();
    
    // Set flag to prevent duplicate processing
    window.completionTriggered = true;
    stopStatusPolling();
    
    // Use the same handling as task_completed event
    const activeTab = document.querySelector('.tab-pane.active');
    if (activeTab && activeTab.id === 'scraper') {
      formatAndDisplayScraperResults(data);
    } else if (activeTab && activeTab.id === 'playlist') {
      playlistProgressContainer.classList.add('d-none');
      playlistResultsContainer.classList.remove('d-none');
      if (playlistStats && data.stats) {
        updateScraperStats(playlistStats, data.stats, data.output_file);
      }
    } else {
      showResult(data);
    }
    
    // Add task to history
    addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
    showToast('Success', 'Task completed successfully!', 'success');
  }
}

/**
 * Update progress UI elements based on task type
 * @param {Object} data - The progress data from server
 */
function updateProgressUI(data) {
  try {
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-pane.active');
    const taskType = activeTab ? activeTab.id : 'file';
    
    // Extract progress information
    const progress = data.progress;
    const message = data.message || data.stage || "Processing...";
    
    // Update appropriate UI elements based on task type
    switch (taskType) {
      case 'scraper':
        // Update scraper progress bar
        if (scraperProgressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(scraperProgressBar, progress);
        }
        
        // Update status message
        if (scraperProgressStatus && message) {
          scraperProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && scraperProgressStats) {
          updateScraperProgressStats(scraperProgressStats, data.stats);
        }
        
        // Handle PDF downloads information if available
        if (data.pdf_downloads && data.pdf_downloads.length > 0) {
          handlePdfDownloadsUpdate(data.pdf_downloads);
        }
        break;
        
      case 'playlist':
        // Update playlist progress bar
        if (playlistProgressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(playlistProgressBar, progress);
        }
        
        // Update status message
        if (playlistProgressStatus && message) {
          playlistProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && playlistProgressStats) {
          updatePlaylistProgressStats(playlistProgressStats, data.stats);
        }
        break;
        
      default: // file processing
        // Update main progress bar
        if (progressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(progressBar, progress);
        }
        
        // Update status message
        if (progressStatus && message) {
          updateProgressStatus(progressStatus, message);
        }
        
        // Update stats
        if (data.stats && progressStats) {
          updateProgressStats(progressStats, data.stats);
        }
        break;
    }
    
    // Update common elements like page title
    updatePageTitle(progress, taskType);
    
    // Check for simulation needs
    checkForProgressStagnation(data);
    
  } catch (e) {
    console.error("Error in updateProgressUI:", e);
  }
}

/**
 * Update page title with progress info
 * @param {number} progress - Progress percentage
 * @param {string} taskType - Type of task
 */
function updatePageTitle(progress, taskType) {
  if (progress === undefined || isNaN(progress)) return;
  
  let typeLabel = "Processing";
  switch (taskType) {
    case 'scraper':
      typeLabel = "Scraping";
      break;
    case 'playlist':
      typeLabel = "Playlist";
      break;
  }
  
  // Only update title for in-progress tasks
  if (progress > 0 && progress < 100) {
    document.title = `${progress}% - ${typeLabel} - NeuroGen`;
  } else if (progress >= 100) {
    document.title = `Complete - NeuroGen`;
    
    // Reset title after a delay
    setTimeout(() => {
      document.title = "NeuroGen";
    }, 5000);
  }
}

/**
 * Check for progress stagnation and trigger simulation if needed
 * @param {Object} data - Progress data
 */
function checkForProgressStagnation(data) {
  const now = Date.now();
  
  // Initialize tracking if needed
  if (!window.stagnationTracking) {
    window.stagnationTracking = {
      lastProgress: data.progress,
      lastUpdateTime: now,
      stagnantDuration: 0,
      stagnationThreshold: 5000 // 5 seconds of no progress change
    };
    return;
  }
  
  const tracking = window.stagnationTracking;
  
  // Check if progress has changed
  if (data.progress !== tracking.lastProgress) {
    // Progress changed, reset tracking
    tracking.lastProgress = data.progress;
    tracking.lastUpdateTime = now;
    tracking.stagnantDuration = 0;
    return;
  }
  
  // Calculate how long we've been at this progress level
  tracking.stagnantDuration = now - tracking.lastUpdateTime;
  
  // If stagnant for too long at a key progress point (e.g. 50%), start simulation
  if (tracking.stagnantDuration >= tracking.stagnationThreshold && 
      data.progress === 50 && !window.progressSimulationInterval) {
    console.log(`Progress stagnant at ${data.progress}% for ${tracking.stagnantDuration}ms, starting simulation`);
    startAdvancedProgressSimulation(data);
  }
}

/**
 * Enhanced progress bar update with smooth animations and correct labeling
 * @param {HTMLElement} barElement - The progress bar element
 * @param {number} progress - The progress percentage (0-100)
 * @returns {void}
 */
function updateProgressBarElement(barElement, progress) {
  // Early return if element is invalid
  if (!barElement) return;
  
  // Ensure progress is within bounds and is a number
  progress = Math.min(100, Math.max(0, Number(progress) || 0));
  
  // Skip update if value hasn't changed (performance optimization)
  if (barElement._lastProgress === progress) return;
  barElement._lastProgress = progress;
  
  // Use requestAnimationFrame for smoother updates
  requestAnimationFrame(() => {
    // Get current width with proper fallback
    let currentWidth = 0;
    if (barElement.style.width) {
      // Parse current width, removing the % if present
      currentWidth = parseFloat(barElement.style.width.replace('%', ''));
    }
    
    // Determine transition based on progress jump size
    const progressDiff = Math.abs(progress - currentWidth);
    
    // For large jumps, disable transition
    if (progressDiff > 15) {
      barElement.style.transition = 'none';
    } else {
      barElement.style.transition = 'width 0.3s ease';
    }
    
    // Set width with % suffix to ensure proper CSS
    barElement.style.width = `${progress}%`;
    
    // Update ARIA attributes for accessibility
    barElement.setAttribute('aria-valuenow', progress);
    barElement.setAttribute('aria-valuemin', '0');
    barElement.setAttribute('aria-valuemax', '100');
    
    // Update the label with the percentage
    barElement.textContent = `${Math.round(progress)}%`;
    
    // Adjust styling based on progress
    if (progress >= 100) {
      // Completed state
      barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.add('bg-success');
      
      // Add completion pulse animation if defined in CSS
      if (!barElement.classList.contains('progress-complete-pulse')) {
        barElement.classList.add('progress-complete-pulse');
      }
    } else if (progress > 0) {
      // In-progress state
      barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.remove('bg-success', 'progress-complete-pulse');
      
      // For very low progress, ensure label is visible
      if (progress < 10) {
        barElement.classList.add('text-end');
        barElement.style.color = 'var(--bs-dark, #212529)'; // Fallback color
        barElement.style.paddingRight = '5px';
      } else {
        barElement.classList.remove('text-end');
        barElement.style.color = '';
        barElement.style.paddingRight = '0';
        
        // Ensure text contrast for mid-ranges
        if (progress < 50) {
          barElement.classList.add('text-dark');
          barElement.classList.remove('text-white');
        } else {
          barElement.classList.add('text-white');
          barElement.classList.remove('text-dark');
        }
      }
    } else {
      // Zero progress state
      barElement.classList.remove('progress-bar-striped', 'progress-bar-animated', 'bg-success', 'progress-complete-pulse');
      barElement.style.color = 'var(--bs-dark, #212529)';
    }
  });
}

/**
 * Handle task error based on active tab with improved error recovery
 * @param {Object} data - Error data from server
 * @returns {void}
 */
function handleTaskError(data) {
  // Log error for debugging
  console.error("Task error received:", data);
  
  // Extract error message with fallback
  const errorMsg = data && data.error ? data.error : 'Unknown error occurred';
  
  try {
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    // Handle based on tab type
    switch(tabId) {
      case 'scraper':
        if (typeof scraperProgressContainer !== 'undefined' && scraperProgressContainer) {
          scraperProgressContainer.classList.add('d-none');
        }
        
        if (typeof scraperResultsContainer !== 'undefined' && scraperResultsContainer) {
          scraperResultsContainer.classList.remove('d-none');
          
          // Update error message in UI
          if (typeof scraperResults !== 'undefined' && scraperResults) {
            scraperResults.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
                <p>${errorMsg}</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewScraperTask()">
                  <i class="fas fa-redo me-1"></i>Try Again
                </button>
              </div>
            `;
          }
        }
        break;
        
      case 'playlist':
        if (typeof playlistProgressContainer !== 'undefined' && playlistProgressContainer) {
          playlistProgressContainer.classList.add('d-none');
        }
        
        // Use error container from file processing tab if available
        if (typeof errorContainer !== 'undefined' && errorContainer) {
          errorContainer.classList.remove('d-none');
          
          if (typeof errorMessage !== 'undefined' && errorMessage) {
            errorMessage.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
                <p>${errorMsg}</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewTaskClick()">
                  <i class="fas fa-redo me-1"></i>Try Again
                </button>
              </div>
            `;
          }
        } else {
          // Fallback if standard error container not found
          const playlistContainer = document.getElementById('playlist-container');
          if (playlistContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.innerHTML = `
              <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
              <p>${errorMsg}</p>
              <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewTaskClick()">
                <i class="fas fa-redo me-1"></i>Try Again
              </button>
            `;
            playlistContainer.appendChild(errorDiv);
          }
        }
        break;
        
      default:
        // Handle default tab error using standard error display
        if (typeof showError === 'function') {
          showError(data);
        } else {
          // Fallback if showError function not available
          const mainContainer = document.querySelector('.container');
          if (mainContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.innerHTML = `
              <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
              <p>${errorMsg}</p>
              <button class="btn btn-outline-danger btn-sm mt-2" onclick="window.location.reload()">
                <i class="fas fa-redo me-1"></i>Reload
              </button>
            `;
            mainContainer.appendChild(errorDiv);
          }
        }
        break;
    }
    
    // Show toast notification with error details
    if (typeof showToast === 'function') {
      showToast('Error', errorMsg, 'error');
    }
    
    // Add to error log if available
    if (typeof logError === 'function') {
      logError('Task execution', errorMsg, data);
    }
    
    // Clear session storage as task failed
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('taskStartTime');
      sessionStorage.removeItem('lastProgressUpdate');
    } catch (e) {
      console.warn('Could not clear session storage:', e);
    }
    
    // Stop any active polling
    if (typeof stopStatusPolling === 'function') {
      stopStatusPolling();
    }
    
    // Update any status indicators
    updateTaskStatusIndicators(false, 'error');
    
  } catch (error) {
    // Catch any errors in the error handler itself
    console.error('Error in handleTaskError:', error);
    
    // Absolute fallback - show error in console and as alert if everything else fails
    alert(`Error: ${errorMsg}`);
  }
}

/**
 * Update task status indicators in UI
 * @param {boolean} isActive - Whether task is active
 * @param {string} status - Task status (error, completed, etc.)
 */
function updateTaskStatusIndicators(isActive, status = 'normal') {
  // Find status indicators
  const indicators = document.querySelectorAll('.task-status-indicator');
  
  // Update all found indicators
  indicators.forEach(indicator => {
    // Remove all status classes first
    indicator.classList.remove('status-active', 'status-error', 'status-completed', 'status-paused');
    
    // Add appropriate class based on status
    if (isActive) {
      indicator.classList.add('status-active');
    } else if (status === 'error') {
      indicator.classList.add('status-error');
    } else if (status === 'completed') {
      indicator.classList.add('status-completed');
    } else if (status === 'paused') {
      indicator.classList.add('status-paused');
    }
    
    // Update icon if exists
    const icon = indicator.querySelector('i');
    if (icon) {
      // Reset classes
      icon.className = '';
      
      // Set appropriate icon class
      if (isActive) {
        icon.className = 'fas fa-spinner fa-spin';
      } else if (status === 'error') {
        icon.className = 'fas fa-exclamation-circle';
      } else if (status === 'completed') {
        icon.className = 'fas fa-check-circle';
      } else if (status === 'paused') {
        icon.className = 'fas fa-pause-circle';
      } else {
        icon.className = 'fas fa-circle';
      }
    }
    
    // Update tooltip if needed
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTitle = isActive ? 'Task Running' : 
                          status === 'error' ? 'Task Failed' :
                          status === 'completed' ? 'Task Completed' :
                          status === 'paused' ? 'Task Paused' : 'Task Inactive';
      
      const tooltip = bootstrap.Tooltip.getInstance(indicator);
      if (tooltip) {
        tooltip.dispose();
      }
      
      new bootstrap.Tooltip(indicator, {
        title: tooltipTitle
      });
    }
  });
}
/**
 * Improved status polling function with better error handling
 */
function startStatusPolling() {
  // Clear any existing polling
  stopStatusPolling();
  
  // Only start polling if we have a task ID
  if (!currentTaskId) {
    console.warn("No task ID available for status polling");
    return;
  }
  
  console.log("Starting status polling for task:", currentTaskId);
  
  // Reset completion flags
  window.completionTriggered = false;
  window.taskCompleted = false;
  window.resultsDisplayed = false;
  
  // Start a new polling interval
  let consecutiveErrors = 0;
  let pollingDelay = 2000; // Start with 2 seconds
  
  statusCheckInterval = setInterval(() => {
    if (!currentTaskId) {
      stopStatusPolling();
      return;
    }
    
    // Determine the appropriate endpoint based on task type
    let endpoint = `/api/status/${currentTaskId}`;
    const activeTab = document.querySelector('.tab-pane.active');
    
    if (activeTab && activeTab.id === 'scraper') {
      endpoint = `/api/scrape2/status/${currentTaskId}`;
    }
    
    // Use fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    fetch(endpoint, { signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        return response.json();
      })
      .then(data => {
        // Reset error counter on success
        consecutiveErrors = 0;
        pollingDelay = 2000; // Reset polling delay
        
        // Store latest data
        window.latestTaskData = data;
        
        // Process the status update
        updateProgress(data);
        
        // Check if we need to handle completion here
        if (data.status === 'completed' || data.progress >= 100) {
          if (!window.completionTriggered) {
            console.log("Task completed via polling, finalizing UI");
            
            window.completionTriggered = true;
            window.taskCompleted = true;
            
            // Stop polling
            stopStatusPolling();
            
            // Determine which tab is active and handle accordingly
            if (activeTab && activeTab.id === 'scraper') {
              formatAndDisplayScraperResults(data);
            } else if (activeTab && activeTab.id === 'playlist') {
              playlistProgressContainer.classList.add('d-none');
              playlistResultsContainer.classList.remove('d-none');
              
              if (playlistStats && data.stats) {
                updateScraperStats(playlistStats, data.stats, data.output_file);
              }
            } else {
              showResult(data);
            }
            
            // Add task to history
            addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
            showToast('Success', 'Task completed successfully!', 'success');
          }
        }
        
        // If task is failed or cancelled, stop polling
        if (data.status === 'failed' || data.status === 'cancelled') {
          stopStatusPolling();
        }
      })
      .catch(error => {
        consecutiveErrors++;
        console.error(`Status check error (${consecutiveErrors}):`, error);
        
        // Adjust polling delay with exponential backoff
        if (consecutiveErrors > 1) {
          pollingDelay = Math.min(10000, pollingDelay * 1.5);
        }
        
        // If we've had too many consecutive errors, stop polling
        // But increase from 5 to 10 to avoid premature stoppage
        if (consecutiveErrors > 10) {
          console.error("Too many consecutive errors, stopping polling");
          stopStatusPolling();
          showToast('Connection Error', 'Lost connection to server', 'error');
          
          // Last ditch effort - try to check if the task completed
          tryCompletionFromCache();
        }
      });
  }, pollingDelay);
  
  console.log("Status polling started");
  
  // Safety timeout that auto-completes high-progress tasks
  // This handles cases where the server might not send the completion event
  setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue >= 90) {
        console.log("Safety timeout triggered - forcing task completion for high progress task");
        
        tryCompletionFromCache();
      }
    }
  }, 60000); // Increased from 30 to 60 seconds
}

/**
 * Poll for task status with improved error handling and adaptive polling
 * Implements smart backoff, early completion detection, and progress tracking
 */
function pollTaskStatus() {
  if (!currentTaskId || !window.pollingState) {
    stopStatusPolling();
    return;
  }
  
  const state = window.pollingState;
  const now = Date.now();
  state.lastPollTime = now;
  state.totalPolls++;
  
  // Determine the appropriate endpoint based on task type
  let endpoint = `/api/status/${currentTaskId}`;
  
  if (state.taskType === 'scraper') {
    endpoint = `/api/scrape2/status/${currentTaskId}`;
  } else if (state.taskType === 'playlist') {
    endpoint = `/api/playlist/status/${currentTaskId}`;
  }
  
  // Use fetch with timeout for reliability
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  fetch(endpoint, { 
    signal: controller.signal,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
    .then(response => {
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      return response.json();
    })
    .then(data => {
      // Reset error counter on success
      state.consecutiveErrors = 0;
      
      // Adaptive polling strategy - gradually adjust to optimal rate
      adjustPollingRate(state, data);
      
      // Store latest data for recovery
      window.latestTaskData = data;
      
      // Track progress stagnation
      if (data.progress === state.lastProgress) {
        state.stagnationCount++;
      } else {
        state.stagnationCount = 0;
        state.lastProgress = data.progress;
        
        // Store timestamp of last progress update for stall detection
        window.lastProgressTimestamp = now;
      }
      
      // Process the status update
      updateProgress(data);
      
      // Log detailed progress every 5 polls
      if (state.totalPolls % 5 === 0) {
        console.log(`Task progress (poll #${state.totalPolls}): ${data.progress}%, status: ${data.status}, delay: ${state.pollingDelay}ms`);
      }
      
      // Check for task completion
      if (shouldConsiderTaskCompleted(data)) {
        handleTaskCompletion(data);
        return;
      }
      
      // If task failed or was cancelled, stop polling
      if (data.status === 'failed' || data.status === 'error' || data.status === 'cancelled') {
        console.log(`Task ended with status: ${data.status}`, data);
        stopStatusPolling();
        if (data.error) {
          showToast('Error', data.error, 'error');
        }
      }
      
      // Check for excessive stagnation as potential indicator of issues
      if (state.stagnationCount > 15) {
        console.warn(`Task progress appears stagnant at ${data.progress}% for ${state.stagnationCount} polls`);
        // Don't stop polling but adjust rate to prevent overwhelming the server
        if (state.pollingDelay < 5000) {
          state.pollingDelay = 5000;
          updatePollingInterval(state.pollingDelay);
        }
      }
    })
    .catch(error => {
      state.consecutiveErrors++;
      console.error(`Status check error (${state.consecutiveErrors}):`, error);
      
      // Apply exponential backoff for errors
      applyErrorBackoff(state);
      
      // If errors persist despite backoff, take recovery action
      if (state.consecutiveErrors > 12) {
        handlePersistentErrors();
      }
    });
}

/**
 * Adaptively adjust polling rate based on task status and progress
 * @param {Object} state - The polling state object
 * @param {Object} data - The task data from API
 */
function adjustPollingRate(state, data) {
  // Initial fast polling for better UX
  if (state.initialPollCount < 5) {
    state.initialPollCount++;
    state.pollingDelay = state.minPollingDelay;
    updatePollingInterval(state.pollingDelay);
    return;
  }
  
  // Dynamic polling rate based on progress
  if (data.progress >= 90) {
    // Near completion, poll faster for quick feedback
    state.pollingDelay = state.minPollingDelay;
  } else if (data.progress >= 50 && data.progress < 90) {
    // Middle stage, moderate polling
    state.pollingDelay = 2000;
  } else if (state.pollingDelay > state.minPollingDelay && state.consecutiveErrors === 0) {
    // Gradually normalize polling rate after errors if we're not in a critical phase
    state.pollingDelay = Math.max(state.minPollingDelay, state.pollingDelay * 0.9);
  }
  
  // Update interval if changed
  if (state.pollingDelay !== statusCheckInterval._idleTimeout) {
    updatePollingInterval(state.pollingDelay);
  }
}

/**
 * Apply exponential backoff when errors are encountered
 * @param {Object} state - The polling state object
 */
function applyErrorBackoff(state) {
  if (state.consecutiveErrors > 1) {
    // Exponential backoff with jitter for better distribution
    const jitter = Math.random() * 500;
    state.pollingDelay = Math.min(
      state.maxPollingDelay, 
      Math.floor((state.pollingDelay * 1.5) + jitter)
    );
    updatePollingInterval(state.pollingDelay);
    console.log(`Applied backoff: new polling delay is ${state.pollingDelay}ms`);
  }
}

/**
 * Handle persistent connection errors with fallback strategies
 */
function handlePersistentErrors() {
  console.error("Too many consecutive errors, implementing recovery measures");
  stopStatusPolling();
  
  // Try server ping to check if server is reachable
  fetch('/api/ping', { 
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'ok') {
        // Server is up, but our task endpoint is having issues
        showToast('Connection Warning', 'Server is reachable but task status updates failed. Attempting to complete the task.', 'warning');
      } else {
        // Server is having issues
        showToast('Connection Error', 'Lost connection to server', 'error');
      }
    })
    .catch(() => {
      // Server is not reachable
      showToast('Connection Error', 'Server appears to be offline', 'error');
    })
    .finally(() => {
      // Try completion from cache as last resort
      tryCompletionFromCache();
    });
}

/**
 * Determine if a task should be considered completed
 * @param {Object} data - The task data
 * @returns {boolean} - Whether the task should be considered complete
 */
function shouldConsiderTaskCompleted(data) {
  // Avoid duplicate completion handling
  if (window.completionTriggered || window.taskCompleted) return false;
  
  return (
    // Explicit completion status
    data.status === 'completed' ||
    // High progress threshold as implicit completion
    data.progress >= 99 ||
    // Status with output file likely indicates completion
    (data.status === 'success' && data.output_file)
  );
}

// ============================================================================
// ENHANCED FRONTEND STATS SHOWCASE SYSTEM
// ============================================================================
// Frontend components to display comprehensive task completion statistics

// ----------------------------------------------------------------------------
// Stats Display Management
// ----------------------------------------------------------------------------

/**
 * Enhanced task completion handler with stats showcase
 */
function handleTaskCompletion(taskType, data) {
    console.log(`Handling completion for task type: ${taskType}`, data);
    
    // Stop any active polling
    if (typeof stopStatusPolling === 'function') {
        stopStatusPolling();
    }
    
    // Update UI to show completion
    updateUIForCompletion(taskType);
    
    // Show comprehensive stats if available
    if (data.stats) {
        displayTaskStats(data);
    } else {
        displayBasicCompletion(data);
    }
    
    // Add to task history
    addTaskToHistory(taskType, data.output_file, data.stats);
    
    // Clear task state
    clearTaskState();
    
    console.log('Task completion handling completed');
}

/**
 * Display comprehensive task statistics in a modal or dedicated section
 */
function displayTaskStats(completionData) {
    const { task_id, task_type, stats, summary, insights } = completionData;
    
    try {
        // Create or update stats display modal
        createStatsModal(task_id, task_type, stats, summary, insights);
        
        // Show the modal
        showStatsModal();
        
        // Update summary cards if they exist
        updateStatsSummaryCards(stats, summary);
        
        // Show stats showcase toast
        showStatsToast(summary);
        
    } catch (error) {
        console.error('Error displaying task stats:', error);
        displayBasicCompletion(completionData);
    }
}

/**
 * Create comprehensive stats modal
 */
function createStatsModal(taskId, taskType, stats, summary, insights) {
    // Remove existing modal if present
    const existingModal = document.getElementById('taskStatsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div class="modal fade" id="taskStatsModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-chart-line me-2"></i>
                            Task Completion Statistics
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${generateStatsContent(taskId, taskType, stats, summary, insights)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" onclick="exportTaskStats('${taskId}')">
                            <i class="fas fa-download me-2"></i>Export Stats
                        </button>
                        <button type="button" class="btn btn-info" onclick="viewTaskHistory()">
                            <i class="fas fa-history me-2"></i>View History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize any charts or interactive elements
    initializeStatsCharts(stats);
}

/**
 * Generate comprehensive stats content HTML
 */
function generateStatsContent(taskId, taskType, stats, summary, insights) {
    return `
        <div class="container-fluid">
            <!-- Summary Section -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="alert alert-success">
                        <h6 class="alert-heading mb-2">
                            <i class="fas fa-trophy me-2"></i>${summary?.headline || 'Task Completed Successfully'}
                        </h6>
                        <p class="mb-0">${getCompletionMessage(stats, taskType)}</p>
                    </div>
                </div>
            </div>
            
            <!-- Key Metrics Cards -->
            <div class="row mb-4">
                ${generateMetricsCards(stats, summary)}
            </div>
            
            <!-- Detailed Analytics Tabs -->
            <div class="row">
                <div class="col-12">
                    <ul class="nav nav-tabs" id="statsTab" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="overview-tab" data-bs-toggle="tab" 
                                    data-bs-target="#overview" type="button" role="tab">
                                <i class="fas fa-chart-pie me-2"></i>Overview
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="performance-tab" data-bs-toggle="tab" 
                                    data-bs-target="#performance" type="button" role="tab">
                                <i class="fas fa-tachometer-alt me-2"></i>Performance
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="files-tab" data-bs-toggle="tab" 
                                    data-bs-target="#files" type="button" role="tab">
                                <i class="fas fa-file-alt me-2"></i>File Analysis
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="insights-tab" data-bs-toggle="tab" 
                                    data-bs-target="#insights" type="button" role="tab">
                                <i class="fas fa-lightbulb me-2"></i>Insights
                            </button>
                        </li>
                    </ul>
                    
                    <div class="tab-content mt-3" id="statsTabContent">
                        <div class="tab-pane fade show active" id="overview" role="tabpanel">
                            ${generateOverviewTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="performance" role="tabpanel">
                            ${generatePerformanceTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="files" role="tabpanel">
                            ${generateFilesTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="insights" role="tabpanel">
                            ${generateInsightsTab(insights, summary)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate key metrics cards
 */
function generateMetricsCards(stats, summary) {
    const metrics = summary?.key_metrics || {};
    const completionMetrics = stats?.completion_metrics || {};
    const efficiencyMetrics = stats?.efficiency_metrics || {};
    
    return `
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-primary mb-2">
                        <i class="fas fa-files"></i>
                    </div>
                    <h6 class="card-title">Files Processed</h6>
                    <h4 class="text-primary">${metrics.files_processed || 0}</h4>
                    <small class="text-muted">Total files handled</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-success mb-2">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <h6 class="card-title">Success Rate</h6>
                    <h4 class="text-success">${metrics.success_rate || '0%'}</h4>
                    <small class="text-muted">Completion percentage</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-info mb-2">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h6 class="card-title">Duration</h6>
                    <h4 class="text-info">${metrics.duration || 'N/A'}</h4>
                    <small class="text-muted">Processing time</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-warning mb-2">
                        <i class="fas fa-award"></i>
                    </div>
                    <h6 class="card-title">Efficiency Grade</h6>
                    <h4 class="text-warning">${metrics.efficiency_grade || 'N/A'}</h4>
                    <small class="text-muted">Performance rating</small>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate overview tab content
 */
function generateOverviewTab(stats) {
    const completionMetrics = stats?.completion_metrics || {};
    const qualityIndicators = stats?.quality_indicators || {};
    
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-chart-bar me-2"></i>Processing Summary</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <td><strong>Total Files:</strong></td>
                                <td>${stats?.total_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Successfully Processed:</strong></td>
                                <td class="text-success">${stats?.processed_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Errors:</strong></td>
                                <td class="text-danger">${stats?.error_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Skipped:</strong></td>
                                <td class="text-warning">${stats?.skipped_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Total Data Processed:</strong></td>
                                <td>${formatBytes(stats?.total_bytes || 0)}</td>
                            </tr>
                            <tr>
                                <td><strong>Processing Rate:</strong></td>
                                <td>${completionMetrics.processing_speed || 0} files/sec</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="col-md-6">
                <h6><i class="fas fa-shield-alt me-2"></i>Quality Metrics</h6>
                <div class="mb-3">
                    <label class="form-label">Quality Score</label>
                    <div class="progress mb-2">
                        <div class="progress-bar bg-success" role="progressbar" 
                             style="width: ${qualityIndicators.quality_score || 0}%">
                            ${qualityIndicators.quality_score || 0}%
                        </div>
                    </div>
                    <small class="text-muted">Data integrity: ${qualityIndicators.data_integrity || 'Good'}</small>
                </div>
                <div class="mb-3">
                    <label class="form-label">Processing Reliability</label>
                    <span class="badge bg-${getReliabilityBadgeColor(qualityIndicators.processing_reliability)} ms-2">
                        ${qualityIndicators.processing_reliability || 'High'}
                    </span>
                </div>
                ${qualityIndicators.quality_flags && qualityIndicators.quality_flags.length > 0 ? `
                <div class="alert alert-warning alert-sm">
                    <strong>Quality Flags:</strong>
                    <ul class="mb-0 mt-2">
                        ${qualityIndicators.quality_flags.map(flag => `<li>${flag}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
        </div>
        
        <!-- Progress Visualization -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-pie me-2"></i>Processing Breakdown</h6>
                <canvas id="processingBreakdownChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate performance tab content
 */
function generatePerformanceTab(stats) {
    const performanceAnalysis = stats?.performance_analysis || {};
    const efficiencyMetrics = stats?.efficiency_metrics || {};
    const memoryProfile = stats?.memory_profile || {};
    
    return `
        <div class="row">
            <div class="col-md-8">
                <h6><i class="fas fa-tachometer-alt me-2"></i>Performance Metrics</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <td><strong>Processing Speed:</strong></td>
                                <td>${efficiencyMetrics.files_per_minute || 0} files/min</td>
                            </tr>
                            <tr>
                                <td><strong>Throughput:</strong></td>
                                <td>${efficiencyMetrics.mb_per_minute || 0} MB/min</td>
                            </tr>
                            <tr>
                                <td><strong>Efficiency Score:</strong></td>
                                <td>
                                    <span class="badge bg-${getEfficiencyBadgeColor(efficiencyMetrics.efficiency_score)}">
                                        ${efficiencyMetrics.efficiency_score || 0}/100
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Memory Efficiency:</strong></td>
                                <td>
                                    <span class="badge bg-${getMemoryEfficiencyColor(performanceAnalysis.memory_efficiency)}">
                                        ${performanceAnalysis.memory_efficiency || 'Unknown'}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Processing Consistency:</strong></td>
                                <td>${performanceAnalysis.processing_consistency || 'Unknown'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                ${performanceAnalysis.recommendations && performanceAnalysis.recommendations.length > 0 ? `
                <div class="alert alert-info">
                    <h6><i class="fas fa-lightbulb me-2"></i>Performance Recommendations</h6>
                    <ul class="mb-0">
                        ${performanceAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            
            <div class="col-md-4">
                <h6><i class="fas fa-memory me-2"></i>Memory Usage</h6>
                <div class="card">
                    <div class="card-body text-center">
                        <div class="mb-3">
                            <canvas id="memoryUsageChart" width="200" height="200"></canvas>
                        </div>
                        <div class="row text-center">
                            <div class="col-6">
                                <small class="text-muted">Peak</small>
                                <div class="fw-bold">${memoryProfile.peak_memory_mb || 0} MB</div>
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Average</small>
                                <div class="fw-bold">${memoryProfile.average_memory_mb || 0} MB</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Performance Timeline -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-line me-2"></i>Performance Timeline</h6>
                <canvas id="performanceTimelineChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate files analysis tab content
 */
function generateFilesTab(stats) {
    const fileTypeBreakdown = stats?.file_type_breakdown || {};
    const speedProfile = stats?.speed_profile || {};
    
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-file-alt me-2"></i>File Type Distribution</h6>
                ${fileTypeBreakdown.type_distribution ? `
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>File Type</th>
                                <th>Count</th>
                                <th>Success Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(fileTypeBreakdown.type_distribution).map(([ext, count]) => `
                            <tr>
                                <td><code>${ext || 'no extension'}</code></td>
                                <td>${count}</td>
                                <td>
                                    <span class="badge bg-success">
                                        ${fileTypeBreakdown.success_by_type?.[ext] || 100}%
                                    </span>
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : '<p class="text-muted">No file type data available</p>'}
            </div>
            
            <div class="col-md-6">
                <h6><i class="fas fa-file-pdf me-2"></i>PDF Analysis</h6>
                ${fileTypeBreakdown.pdf_analysis ? `
                <div class="row">
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-primary">${fileTypeBreakdown.pdf_analysis.total_pdfs}</h5>
                                <p class="card-text small">PDFs Processed</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-success">${fileTypeBreakdown.pdf_analysis.tables_extracted}</h5>
                                <p class="card-text small">Tables Extracted</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-info">${fileTypeBreakdown.pdf_analysis.references_extracted}</h5>
                                <p class="card-text small">References Found</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-warning">${fileTypeBreakdown.pdf_analysis.ocr_processed}</h5>
                                <p class="card-text small">OCR Processed</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-3">
                    <small class="text-muted">
                        Average tables per PDF: ${fileTypeBreakdown.pdf_analysis.avg_tables_per_pdf || 0}<br>
                        OCR usage rate: ${fileTypeBreakdown.pdf_analysis.ocr_usage_rate || 0}%
                    </small>
                </div>
                ` : '<p class="text-muted">No PDF files processed</p>'}
            </div>
        </div>
        
        <!-- File Size Distribution Chart -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-bar me-2"></i>File Type Processing</h6>
                <canvas id="fileTypeChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate insights tab content
 */
function generateInsightsTab(insights, summary) {
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-lightbulb me-2"></i>Key Insights</h6>
                ${insights?.performance_insights && insights.performance_insights.length > 0 ? `
                <div class="alert alert-info">
                    <h6>Performance Insights</h6>
                    <ul class="mb-0">
                        ${insights.performance_insights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${summary?.highlights && summary.highlights.length > 0 ? `
                <div class="alert alert-success">
                    <h6><i class="fas fa-star me-2"></i>Highlights</h6>
                    <ul class="mb-0">
                        ${summary.highlights.map(highlight => `<li>${highlight}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            
            <div class="col-md-6">
                <h6><i class="fas fa-cogs me-2"></i>Optimization Opportunities</h6>
                ${insights?.optimization_recommendations && insights.optimization_recommendations.length > 0 ? `
                <div class="alert alert-warning">
                    <h6>Recommendations</h6>
                    <ul class="mb-0">
                        ${insights.optimization_recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${summary?.areas_for_improvement && summary.areas_for_improvement.length > 0 ? `
                <div class="alert alert-info">
                    <h6><i class="fas fa-arrow-up me-2"></i>Areas for Improvement</h6>
                    <ul class="mb-0">
                        ${summary.areas_for_improvement.map(area => `<li>${area}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${insights?.next_steps && insights.next_steps.length > 0 ? `
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0"><i class="fas fa-tasks me-2"></i>Suggested Next Steps</h6>
                    </div>
                    <div class="card-body">
                        <ol class="mb-0">
                            ${insights.next_steps.map(step => `<li>${step}</li>`).join('')}
                        </ol>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Initialize charts and visualizations
 */
function initializeStatsCharts(stats) {
    // Wait for modal to be fully rendered
    setTimeout(() => {
        try {
            initializeProcessingBreakdownChart(stats);
            initializeMemoryUsageChart(stats);
            initializePerformanceTimelineChart(stats);
            initializeFileTypeChart(stats);
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }, 500);
}

/**
 * Initialize processing breakdown pie chart
 */
function initializeProcessingBreakdownChart(stats) {
    const canvas = document.getElementById('processingBreakdownChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const processed = stats?.processed_files || 0;
    const errors = stats?.error_files || 0;
    const skipped = stats?.skipped_files || 0;
    
    // Simple canvas-based pie chart (you can replace with Chart.js if available)
    drawPieChart(ctx, [
        { label: 'Processed', value: processed, color: '#28a745' },
        { label: 'Errors', value: errors, color: '#dc3545' },
        { label: 'Skipped', value: skipped, color: '#ffc107' }
    ]);
}

/**
 * Initialize memory usage chart
 */
function initializeMemoryUsageChart(stats) {
    const canvas = document.getElementById('memoryUsageChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const memoryProfile = stats?.memory_profile || {};
    const peak = memoryProfile.peak_memory_mb || 0;
    const average = memoryProfile.average_memory_mb || 0;
    
    drawBarChart(ctx, [
        { label: 'Peak', value: peak, color: '#dc3545' },
        { label: 'Average', value: average, color: '#28a745' }
    ]);
}

/**
 * Simple pie chart drawer
 */
function drawPieChart(ctx, data) {
    const canvas = ctx.canvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return;
    
    let currentAngle = -Math.PI / 2;
    
    data.forEach(item => {
        const sliceAngle = (item.value / total) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        
        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.value.toString(), labelX, labelY);
        
        currentAngle += sliceAngle;
    });
}

/**
 * Simple bar chart drawer
 */
function drawBarChart(ctx, data) {
    const canvas = ctx.canvas;
    const padding = 20;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    const maxValue = Math.max(...data.map(item => item.value));
    if (maxValue === 0) return;
    
    const barWidth = chartWidth / data.length;
    
    data.forEach((item, index) => {
        const barHeight = (item.value / maxValue) * chartHeight;
        const x = padding + index * barWidth;
        const y = canvas.height - padding - barHeight;
        
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y, barWidth - 10, barHeight);
        
        // Draw label
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, x + barWidth / 2, canvas.height - 5);
        ctx.fillText(item.value.toString(), x + barWidth / 2, y - 5);
    });
}

/**
 * Utility functions for styling
 */
function getReliabilityBadgeColor(reliability) {
    switch (reliability) {
        case 'Very High': return 'success';
        case 'High': return 'success';
        case 'Medium': return 'warning';
        case 'Low': return 'danger';
        default: return 'secondary';
    }
}

function getEfficiencyBadgeColor(score) {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    if (score >= 50) return 'info';
    return 'danger';
}

function getMemoryEfficiencyColor(efficiency) {
    switch (efficiency) {
        case 'High': return 'success';
        case 'Medium': return 'warning';
        case 'Low': return 'danger';
        default: return 'secondary';
    }
}

/**
 * Show stats modal
 */
function showStatsModal() {
    const modal = new bootstrap.Modal(document.getElementById('taskStatsModal'));
    modal.show();
}

/**
 * Update summary cards in main UI
 */
function updateStatsSummaryCards(stats, summary) {
    // Update any existing summary cards in the main interface
    const summaryContainer = document.getElementById('taskSummaryCards');
    if (summaryContainer) {
        summaryContainer.innerHTML = generateSummaryCards(stats, summary);
        summaryContainer.classList.remove('d-none');
    }
}

/**
 * Show stats toast notification
 */
function showStatsToast(summary) {
    const headline = summary?.headline || 'Task completed successfully';
    const successRate = summary?.key_metrics?.success_rate || '100%';
    
    showToast(
        'Task Completed', 
        `${headline} (${successRate} success rate)`, 
        'success',
        8000 // Show for 8 seconds
    );
}

/**
 * Export task statistics
 */
function exportTaskStats(taskId) {
    try {
        // Create download link for stats export
        const exportUrl = `/api/task/${taskId}/stats/export`;
        
        // Create temporary link and trigger download
        const link = document.createElement('a');
        link.href = exportUrl;
        link.download = `task_${taskId}_stats.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Export', 'Task statistics exported successfully', 'info');
        
    } catch (error) {
        console.error('Error exporting stats:', error);
        showToast('Error', 'Failed to export statistics', 'error');
    }
}

/**
 * View task history
 */
function viewTaskHistory() {
    // Open task history in a new modal or navigate to history page
    fetch('/api/tasks/history?limit=10')
        .then(response => response.json())
        .then(data => {
            displayTaskHistory(data.history);
        })
        .catch(error => {
            console.error('Error fetching task history:', error);
            showToast('Error', 'Failed to load task history', 'error');
        });
}

/**
 * Display task history modal
 */
function displayTaskHistory(history) {
    // Create and show task history modal
    const historyHTML = `
        <div class="modal fade" id="taskHistoryModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-history me-2"></i>Task History
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${generateHistoryContent(history)}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal
    const existingModal = document.getElementById('taskHistoryModal');
    if (existingModal) existingModal.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', historyHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('taskHistoryModal'));
    modal.show();
}

/**
 * Generate history content
 */
function generateHistoryContent(history) {
    if (!history || history.length === 0) {
        return '<p class="text-muted text-center">No task history available</p>';
    }
    
    return `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Task Type</th>
                        <th>Completed</th>
                        <th>Files Processed</th>
                        <th>Success Rate</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(task => `
                    <tr>
                        <td><span class="badge bg-primary">${task.task_type}</span></td>
                        <td>${formatDate(task.completed_at)}</td>
                        <td>${task.stats?.processed_files || 0}</td>
                        <td>
                            <span class="badge bg-success">
                                ${task.summary?.key_metrics?.success_rate || '100%'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="exportTaskStats('${task.task_id}')">
                                <i class="fas fa-download"></i>
                            </button>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Utility function to format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Utility function to format date
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
        return dateString;
    }
}

/**
 * Get completion message based on stats
 */
function getCompletionMessage(stats, taskType) {
    const processed = stats?.processed_files || 0;
    const total = stats?.total_files || 0;
    const errors = stats?.error_files || 0;
    
    if (errors === 0) {
        return `All ${processed} files processed successfully without errors.`;
    } else if (errors < total * 0.1) {
        return `${processed} files processed successfully with ${errors} minor issues.`;
    } else {
        return `${processed} files processed with ${errors} errors that may need attention.`;
    }
}

/**
 * Enhanced Socket.IO event listener for stats showcase
 */
if (window.socket) {
    window.socket.on('task_stats_showcase', function(data) {
        if (data.task_id === currentTaskId) {
            console.log('Stats showcase event received:', data);
            
            // Show a notification about available detailed stats
            showToast(
                'Detailed Stats Available', 
                'Click to view comprehensive task statistics', 
                'info',
                5000,
                () => displayTaskStats(data)
            );
        }
    });
}

/**
 * Update the polling interval with new delay
 * @param {number} newDelay - New delay in milliseconds
 */
function updatePollingInterval(newDelay) {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = setInterval(pollTaskStatus, newDelay);
    
    // Only log significant changes to reduce console noise
    if (Math.abs(newDelay - (window.pollingState?.lastLoggedDelay || 0)) > 500) {
      console.log(`Polling interval updated to ${newDelay}ms`);
      if (window.pollingState) window.pollingState.lastLoggedDelay = newDelay;
    }
  }
}


/**
 * Try completion from cached data as fallback
 */
function tryCompletionFromCache() {
  if (window.completionTriggered || window.taskCompleted) return;
  
  console.log("Attempting to complete task using cached data");
  
  // Use the latest data we received, or create minimal data
  const completionData = window.latestTaskData || {
    task_id: currentTaskId,
    status: "completed",
    progress: 100,
    output_file: sessionStorage.getItem('outputFile'),
    stats: {}
  };
  
  // Set flags to indicate we're forcing completion
  window.completionTriggered = true;
  window.taskCompleted = true;
  
  try {
    // Handle completion based on task type
    handleCompletionBasedOnTaskType(completionData);
  } catch (e) {
    console.error("Error in completion fallback:", e);
    showToast('Warning', 'Task may have completed, but there was an error showing results', 'warning');
    
    // Last resort fallback - show basic completion message
    try {
      const activeTab = document.querySelector('.tab-pane.active');
      const containerSelector = activeTab && activeTab.id === 'playlist' ? 
        '#playlist-results-container' : '#results-container';
      
      const container = document.querySelector(containerSelector);
      if (container) {
        container.innerHTML = `
          <div class="alert alert-success">
            <h4><i class="fas fa-check-circle me-2"></i> Task Completed</h4>
            <p>The task appears to have completed, but there was an error displaying detailed results.</p>
            ${completionData.output_file ? `<p>Output may be available at: ${completionData.output_file}</p>` : ''}
            <button class="btn btn-primary mt-2" onclick="handleNewTaskClick()">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
        `;
      }
    } catch (fallbackError) {
      console.error("Critical error in last resort fallback:", fallbackError);
    }
  }
}

/**
 * Update polling status indicator in UI if available
 * @param {boolean} isActive - Whether polling is active
 */
function updatePollingStatusIndicator(isActive) {
  const indicator = document.getElementById('polling-status-indicator');
  if (!indicator) return;
  
  indicator.className = isActive ? 
    'polling-indicator polling-active' : 'polling-indicator polling-inactive';
  
  indicator.title = isActive ? 
    'Real-time updates active' : 'Real-time updates inactive';
  
  const icon = indicator.querySelector('i');
  if (icon) {
    icon.className = isActive ? 
      'fas fa-sync fa-spin' : 'fas fa-sync-alt';
  }
}


/**
 * Set up safety timeout to handle stalled tasks
 */
function setupCompletionSafetyTimeout() {
  // Clear any existing timeout
  if (window.completionSafetyTimeout) {
    clearTimeout(window.completionSafetyTimeout);
  }
  
  // Create new timeout
  window.completionSafetyTimeout = setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue >= 90) {
        console.log("Safety timeout triggered - forcing task completion for high progress task");
        tryCompletionFromCache();
      } else if (progressValue >= 50) {
        // For lower progress tasks, check if they're stalled
        const lastUpdate = window.lastProgressTimestamp || 0;
        const now = Date.now();
        const timeSinceUpdate = (now - lastUpdate) / 1000;
        
        if (timeSinceUpdate > 60) { // 1 minute without updates
          console.log("Safety timeout triggered - task appears stalled at 50%+");
          showToast('Warning', 'Task appears to be stalled. Results may be incomplete.', 'warning');
          
          // Check if server is reachable before giving up
          checkServerReachable().then(reachable => {
            if (reachable) {
              // Server is up, but our task might be stuck - poll once more
              pollTaskStatus();
              
              // Wait a bit and then try completion if still stalled
              setTimeout(() => {
                if (currentTaskId && !window.taskCompleted) {
                  tryCompletionFromCache();
                }
              }, 5000);
            } else {
              // Server seems down, try completion from cache directly
              tryCompletionFromCache();
            }
          });
        }
      }
    }
  }, 90000); // Increased from 60 to 90 seconds for more patience
  
  // Also set up an early check for tasks stuck at very beginning
  window.earlyStuckTaskTimeout = setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue <= 5) {
        console.log("Early timeout - task appears stuck at beginning stage");
        
        // Check if the server is reachable
        checkServerReachable().then(reachable => {
          if (reachable) {
            showToast('Warning', 'Task appears to be slow to start. Server is reachable, but task may be stalled.', 'warning');
          } else {
            showToast('Error', 'Server appears to be unreachable. Task cannot continue.', 'error');
            // Clear task as it can't complete
            stopStatusPolling();
          }
        });
      }
    }
  }, 20000); // Check after 20 seconds
}


/**
 * Handle task completion based on task type
 * @param {Object} data - Task data
 */
function handleCompletionBasedOnTaskType(data) {
  // Determine which tab is active
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (activeTab && activeTab.id === 'scraper') {
    formatAndDisplayScraperResults(data);
  } else if (activeTab && activeTab.id === 'playlist') {
    playlistProgressContainer.classList.add('d-none');
    playlistResultsContainer.classList.remove('d-none');
    
    if (playlistStats && data.stats) {
      updateScraperStats(playlistStats, data.stats, data.output_file);
    }
  } else {
    showResult(data);
  }
  
  // Add task to history
  addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
  showToast('Success', 'Task completed successfully!', 'success');
}



/**
 * Enhanced PDF support 
 * 
 * 
/**
 * Initialize PDF processing capabilities with feature detection
 */
function initializePdfProcessing() {
  // Detect PDF capabilities from server
  fetchPdfCapabilities().then(capabilities => {
    // Store capabilities globally
    window.pdfCapabilities = capabilities;
    
    // Initialize UI based on capabilities
    updatePdfProcessingUI(capabilities);
    
    console.log("PDF processing initialized with capabilities:", capabilities);
  }).catch(error => {
    console.error("Error initializing PDF processing:", error);
    // Assume basic capabilities
    window.pdfCapabilities = {
      tables: false,
      ocr: false,
      enhanced_output: false,
      memory_efficient: true
    };
  });
  
  // Set up event handlers for PDF-related functionality
  setupPdfEventHandlers();
}

/**
 * Fetch PDF processing capabilities from server
 * @returns {Promise<Object>} Capabilities object
 */
async function fetchPdfCapabilities() {
  try {
    const response = await fetch('/api/pdf/capabilities');
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(data.error || 'Failed to retrieve PDF capabilities');
    }
    
    return data.capabilities || {
      tables: false,
      ocr: false,
      enhanced_output: false,
      memory_efficient: true
    };
  } catch (error) {
    console.error("Error fetching PDF capabilities:", error);
    throw error;
  }
}

/**
 * Update UI based on PDF processing capabilities
 * @param {Object} capabilities - PDF processing capabilities
 */
function updatePdfProcessingUI(capabilities) {
  // Create capabilities display in file processing tab
  const capabilitiesContainer = document.getElementById('pdf-capabilities-container');
  if (!capabilitiesContainer) return;
  
  let html = '<div class="alert alert-info mt-3">';
  html += '<h6><i class="fas fa-info-circle me-2"></i>PDF Processing Capabilities</h6>';
  html += '<ul class="mb-0 small">';
  
  // Add available features
  if (capabilities.tables) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Table extraction</li>';
  } else {
    html += '<li><i class="fas fa-times text-muted me-1"></i> Table extraction (unavailable)</li>';
  }
  
  if (capabilities.ocr) {
    html += '<li><i class="fas fa-check text-success me-1"></i> OCR for scanned documents</li>';
  } else {
    html += '<li><i class="fas fa-times text-muted me-1"></i> OCR (unavailable)</li>';
  }
  
  if (capabilities.enhanced_output) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Enhanced output format</li>';
  }
  
  if (capabilities.memory_efficient) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Memory-efficient processing</li>';
  }
  
  html += '</ul>';
  html += '</div>';
  
  capabilitiesContainer.innerHTML = html;
  
  // Update PDF options in UI based on capabilities
  const ocrCheckbox = document.getElementById('use-ocr-checkbox');
  const tableCheckbox = document.getElementById('extract-tables-checkbox');
  
  if (ocrCheckbox) {
    ocrCheckbox.disabled = !capabilities.ocr;
    ocrCheckbox.checked = capabilities.ocr;
    
    // Add tooltip if disabled
    if (!capabilities.ocr) {
      ocrCheckbox.parentElement.setAttribute('title', 'OCR is not available with the current installation');
    }
  }
  
  if (tableCheckbox) {
    tableCheckbox.disabled = !capabilities.tables;
    tableCheckbox.checked = capabilities.tables;
    
    // Add tooltip if disabled
    if (!capabilities.tables) {
      tableCheckbox.parentElement.setAttribute('title', 'Table extraction is not available with the current installation');
    }
  }
}

/**
 * Set up event handlers for PDF processing
 */
function setupPdfEventHandlers() {
  // Add Socket.IO handlers for PDF processing events
  if (socket) {
    // PDF processing progress
    socket.on('pdf_processing_progress', function(data) {
      if (data.task_id === currentTaskId) {
        console.log('PDF processing progress:', data.progress + '%', data.message || '');
        
        // Update the appropriate progress bar based on active tab
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          if (scraperProgressBar) {
            updateProgressBarElement(scraperProgressBar, data.progress);
          }
          if (scraperProgressStatus && data.message) {
            scraperProgressStatus.textContent = data.message;
          }
        } else {
          // Default tab progress updates
          if (progressBar) {
            updateProgressBarElement(progressBar, data.progress);
          }
          if (progressStatus && data.message) {
            updateProgressStatus(progressStatus, data.message);
          }
        }
      }
    });
    
    // PDF processing complete
    socket.on('pdf_processing_complete', function(data) {
      if (data.task_id === currentTaskId) {
        console.log('PDF processing complete:', data);
        
        // Stop any progress simulation
        stopProgressSimulation();
        
        // Determine which tab is active and handle accordingly
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          formatAndDisplayScraperResults(data);
        } else {
          // Handle default tab completion
          showResult(data);
        }
        
        // Add task to history
        addTaskToHistory(getCurrentTaskType(), data.output_path, data.stats);
        showToast('Success', 'PDF processing completed successfully!', 'success');
      }
    });
    
    // PDF processing error
    socket.on('pdf_processing_error', function(data) {
      if (data.task_id === currentTaskId) {
        console.error('PDF processing error:', data);
        
        // Stop any progress simulation
        stopProgressSimulation();
        
        // Determine which tab is active
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          // Handle scraper error
          scraperProgressContainer.classList.add("d-none");
          scraperResultsContainer.classList.remove("d-none");
          
          if (scraperResults) {
            scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
          }
        } else {
          // Handle default tab error
          showError(data);
        }
        
        showToast('Error', data.error || 'An error occurred', 'error');
      }
    });
  }
  
  // Add event handlers for PDF-related UI elements
  const processPdfSwitch = document.getElementById('process-pdf-switch');
  if (processPdfSwitch) {
    processPdfSwitch.addEventListener('change', function() {
      const pdfOptionsSection = document.getElementById('pdf-processing-options');
      if (pdfOptionsSection) {
        pdfOptionsSection.style.display = this.checked ? 'block' : 'none';
      }
    });
  }
}
/**
 * Process PDF with error handling and recovery
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result
 */
function processPDF(pdfPath, options = {}) {
  // Default options
  const defaultOptions = {
    extractTables: window.pdfCapabilities?.tables || false,
    useOcr: window.pdfCapabilities?.ocr || false,
    outputFolder: null,
    maxAttempts: 2
  };
  
  const settings = { ...defaultOptions, ...options };
  
  // Show loading indicator
  showToast('Processing', `Processing PDF: ${pdfPath.split('/').pop()}`, 'info');
  
  return new Promise((resolve, reject) => {
    // Prepare the request payload
    const payload = {
      pdf_path: pdfPath,
      output_dir: settings.outputFolder,
      extract_tables: settings.extractTables,
      use_ocr: settings.useOcr,
      memory_efficient: true // Always use memory efficient mode
    };
    
    console.log("Sending PDF processing request:", payload);
    
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
        startStatusPolling(); // Make sure this is called to poll status
        resolve({ 
          status: 'processing',
          task_id: taskId,
          message: 'PDF processing has started'
        });
      } else if (data.status === "success") {
        // Processing completed synchronously
        resolve(data);
      } else {
        // Error occurred
        reject(new Error(data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("PDF processing error:", error);
      
      // Handle error with recovery options
      handleErrorWithRecovery(error, 'pdf-processing');
      reject(error);
    });
  });
}


/**
 * Update an existing PDF download item
 * @param {HTMLElement} item - The item element to update
 * @param {Object} pdf - PDF download info
 */
function updatePdfDownloadItem(item, pdf) {
  if (!item) return;
  
  // Get current status
  const currentStatus = item.getAttribute('data-status');
  const newStatus = pdf.status || currentStatus;
  
  // Only update if status has changed or progress has changed
  if (currentStatus !== newStatus) {
    // Status has changed, update item
    item.setAttribute('data-status', newStatus);
    
    // Update badge
    const badge = item.querySelector('.status-badge');
    if (badge) {
      badge.className = 'badge status-badge';
      
      switch (newStatus) {
        case 'success':
          badge.classList.add('bg-success');
          badge.textContent = 'Downloaded';
          break;
        case 'error':
          badge.classList.add('bg-danger');
          badge.textContent = 'Failed';
          break;
        case 'processing':
          badge.classList.add('bg-info');
          badge.textContent = 'Processing';
          break;
        default:
          badge.classList.add('bg-info');
          badge.textContent = 'Downloading';
      }
    }
    
    // Update progress bar
    const progressContainer = item.querySelector('.progress');
    if (progressContainer) {
      // If completed or error, remove progress bar with animation
      if (newStatus === 'success' || newStatus === 'error') {
        progressContainer.classList.add('fade-out');
        setTimeout(() => {
          progressContainer.remove();
        }, 300);
      }
    } else if (newStatus === 'downloading' || newStatus === 'processing') {
      // Add progress bar if needed
      const progressBar = document.createElement('div');
      progressBar.className = 'progress mt-1';
      progressBar.innerHTML = `
        <div class="progress-bar progress-bar-striped progress-bar-animated bg-info" 
          role="progressbar" style="width: ${pdf.progress || 50}%" aria-valuenow="${pdf.progress || 50}" aria-valuemin="0" 
          aria-valuemax="100"></div>
      `;
      
      // Insert after title
      const titleElement = item.querySelector('.pdf-item-title');
      if (titleElement && titleElement.parentNode) {
        titleElement.parentNode.appendChild(progressBar);
      }
    }
    
    // Update action buttons
    const actionsContainer = item.querySelector('.pdf-actions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      
      if (newStatus === 'success') {
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-sm btn-outline-success view-pdf-btn';
        viewBtn.setAttribute('data-path', pdf.filePath || '');
       viewBtn.setAttribute('title', 'View PDF');
       viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
       actionsContainer.appendChild(viewBtn);
       
       // Add event listener
       viewBtn.addEventListener('click', function() {
         const pdfPath = this.getAttribute('data-path');
         if (pdfPath) {
           openPdfViewer(pdfPath);
         }
       });
     } else if (newStatus === 'error') {
       const retryBtn = document.createElement('button');
       retryBtn.className = 'btn btn-sm btn-outline-warning retry-pdf-btn';
       retryBtn.setAttribute('data-url', pdf.url);
       retryBtn.setAttribute('title', 'Retry');
       retryBtn.innerHTML = '<i class="fas fa-redo"></i>';
       actionsContainer.appendChild(retryBtn);
       
       // Add event listener
       retryBtn.addEventListener('click', function() {
         const url = this.getAttribute('data-url');
         if (url) {
           retryPdfDownload(url, item.id);
         }
       });
     }
   }
 } else if (newStatus === 'downloading' || newStatus === 'processing') {
   // Just update progress if status hasn't changed
   const progressBar = item.querySelector('.progress-bar');
   if (progressBar && pdf.progress !== undefined) {
     progressBar.style.width = `${pdf.progress}%`;
     progressBar.setAttribute('aria-valuenow', pdf.progress);
   }
 }
}

/**
* Update PDF download summary counts
* @param {Array} pdfDownloads - Array of PDF download status objects
*/
function updatePdfDownloadSummary(pdfDownloads) {
 const summaryElement = document.getElementById('pdf-download-summary');
 if (!summaryElement) return;
 
 // Count by status
 const counts = {
   total: pdfDownloads.length,
   downloading: 0,
   processing: 0,
   success: 0,
   error: 0
 };
 
 // Calculate counts
 pdfDownloads.forEach(pdf => {
   const status = pdf.status || 'downloading';
   if (counts.hasOwnProperty(status)) {
     counts[status]++;
   }
 });
 
 // Create summary HTML
 const html = `
   <div class="d-flex justify-content-between mb-2">
     <span><strong>Total:</strong> ${counts.total}</span>
     <span><strong>Completed:</strong> <span class="text-success">${counts.success}</span></span>
     <span><strong>Active:</strong> <span class="text-info">${counts.downloading + counts.processing}</span></span>
     <span><strong>Failed:</strong> <span class="text-danger">${counts.error}</span></span>
   </div>
 `;
 
 summaryElement.innerHTML = html;
}

/**
* Retry a failed PDF download
* @param {string} url - URL of the PDF to retry
* @param {string} itemId - ID of the list item
*/
function retryPdfDownload(url, itemId) {
 // Find the item
 const item = document.getElementById(itemId);
 if (!item) return;
 
 // Update UI to show downloading
 item.setAttribute('data-status', 'downloading');
 
 // Update badge
 const badge = item.querySelector('.status-badge');
 if (badge) {
   badge.className = 'badge bg-info status-badge';
   badge.textContent = 'Downloading';
 }
 
 // Add or update progress bar
 let progressContainer = item.querySelector('.progress');
 if (!progressContainer) {
   progressContainer = document.createElement('div');
   progressContainer.className = 'progress mt-1';
   progressContainer.innerHTML = `
     <div class="progress-bar progress-bar-striped progress-bar-animated bg-info" 
       role="progressbar" style="width: 10%" aria-valuenow="10" aria-valuemin="0" 
       aria-valuemax="100"></div>
   `;
   
   // Insert after badge
   const titleElement = item.querySelector('.pdf-item-title');
   if (titleElement && titleElement.parentNode) {
     titleElement.parentNode.appendChild(progressContainer);
   }
 } else {
   // Update existing progress bar
   const progressBar = progressContainer.querySelector('.progress-bar');
   if (progressBar) {
     progressBar.style.width = '10%';
     progressBar.setAttribute('aria-valuenow', 10);
     progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
   }
 }
 
 // Update action buttons
 const actionsContainer = item.querySelector('.pdf-actions');
 if (actionsContainer) {
   actionsContainer.innerHTML = '';
 }
 
 // Get output folder from form or use default
 const outputFolder = document.getElementById('download-directory')?.value || '';
 
 // Send request to server
 fetch('/api/download-pdf', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ url, outputFolder })
 })
 .then(res => res.json())
 .then(data => {
   if (data.error) {
     // Update UI to show error
     updatePdfDownloadItem(item, { url, status: 'error' });
     showToast('Error', `Failed to download PDF: ${data.error}`, 'error');
   } else {
     // Update UI to show success
     updatePdfDownloadItem(item, { 
       url, 
       status: 'success', 
       filePath: data.filePath 
     });
     showToast('Success', 'PDF downloaded successfully', 'success');
   }
 })
 .catch(err => {
   console.error('Error downloading PDF:', err);
   updatePdfDownloadItem(item, { url, status: 'error' });
   showToast('Error', 'Failed to download PDF', 'error');
 });
}

/**
 * Implement all improvements for NeuroGen File Processing system
 * This function should be called at the application initialization
 */
function implementNeuroGenImprovements() {
  console.log("Implementing NeuroGen File Processing system improvements...");
  
  try {
    // 1. Setup robust Socket.IO connection
    setupRobustSocketConnection();
    
    // 2. Initialize PDF processing capabilities
    initializePdfProcessing();
    
    // 3. Add connection status indicator to UI
    addConnectionStatusIndicator();
    
    // 4. Update progress bar styling for better display
    enhanceProgressBarStyling();
    
    // 5. Improve history display
    enhanceHistoryDisplay();
    
    console.log("NeuroGen improvements successfully implemented");
    showToast('System Upgraded', 'NeuroGen improvements have been applied', 'success');
  } catch (error) {
    console.error("Error implementing NeuroGen improvements:", error);
    showToast('Error', 'Failed to apply some improvements: ' + error.message, 'error');
  }
}

/**
 * Add connection status indicator to the UI
 */
function addConnectionStatusIndicator() {
  // Check if indicator already exists
  if (document.getElementById('connection-indicator')) {
    return;
  }
  
  // Create the indicator element
  const indicator = document.createElement('div');
  indicator.id = 'connection-indicator';
  indicator.className = 'connection-status bg-secondary';
  indicator.innerHTML = '<i class="fas fa-wifi"></i>';
  indicator.title = 'Connection: Initializing';
  
  // Position in the top-right corner
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    z-index: 1000;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  // Add click handler to show connection details
  indicator.addEventListener('click', showConnectionDetails);
  
  // Add to body
  document.body.appendChild(indicator);
  
  // Update with current status
  if (socket && socket.connected) {
    updateConnectionIndicator('connected');
  } else {
    updateConnectionIndicator('disconnected');
  }
}

/**
 * Show connection details in a modal
 */
function showConnectionDetails() {
  // Create modal if it doesn't exist
  let connectionModal = document.getElementById('connection-details-modal');
  
  if (!connectionModal) {
    // Create modal structure
    connectionModal = document.createElement('div');
    connectionModal.id = 'connection-details-modal';
    connectionModal.className = 'modal fade';
    connectionModal.setAttribute('tabindex', '-1');
    connectionModal.setAttribute('aria-hidden', 'true');
    
    connectionModal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Connection Details</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="connection-details-content">
            Loading...
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" id="reconnect-btn">Reconnect</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(connectionModal);
    
    // Add event listener for reconnect button
    const reconnectBtn = connectionModal.querySelector('#reconnect-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', function() {
        // Reinitialize socket
        setupRobustSocketConnection();
        
        // Update content
        updateConnectionDetailsContent();
        
        showToast('Connection', 'Reconnection initiated', 'info');
      });
    }
  }
  
  // Update content
  updateConnectionDetailsContent();
  
  // Show modal
  const modal = new bootstrap.Modal(connectionModal);
  modal.show();
}

/**
 * Update connection details modal content
 */
function updateConnectionDetailsContent() {
  const contentElement = document.getElementById('connection-details-content');
  if (!contentElement) return;
  
  let html = '<div class="connection-stats">';
  
  // Connection status
  const connected = socket && socket.connected;
  const statusClass = connected ? 'text-success' : 'text-danger';
  const statusIcon = connected ? 'fa-check-circle' : 'fa-times-circle';
  html += `<p><i class="fas ${statusIcon} ${statusClass}"></i> Status: <strong class="${statusClass}">${connected ? 'Connected' : 'Disconnected'}</strong></p>`;
  
  // Socket ID
  html += `<p>Socket ID: <code>${socket ? socket.id || 'N/A' : 'N/A'}</code></p>`;
  
  // Transport type
  html += `<p>Transport: <code>${socket && socket.io ? socket.io.engine.transport.name : 'N/A'}</code></p>`;
  
  // Connection metrics
  if (window.connectionMetrics) {
    const metrics = window.connectionMetrics;
    
    // Connection quality
    const qualityClass = {
      'excellent': 'text-success',
      'good': 'text-success', 
      'poor': 'text-warning',
      'unknown': 'text-secondary'
    }[metrics.connectionQuality] || 'text-secondary';
    
    html += `<p>Connection Quality: <span class="${qualityClass}">${metrics.connectionQuality || 'unknown'}</span></p>`;
    
    // Ping history
    if (metrics.pingHistory && metrics.pingHistory.length) {
      const avgPing = metrics.pingHistory.reduce((sum, ping) => sum + ping, 0) / metrics.pingHistory.length;
      html += `<p>Average Ping: ${Math.round(avgPing)}ms</p>`;
      
      html += '<div class="ping-history small text-muted">Recent pings: ';
      metrics.pingHistory.forEach((ping, i) => {
        html += `${Math.round(ping)}ms${i < metrics.pingHistory.length - 1 ? ', ' : ''}`;
      });
      html += '</div>';
    }
    
    // Disconnect count
    html += `<p>Disconnections: ${metrics.disconnectCount}</p>`;
  }
  
  // Last activity
  const lastActivity = window.lastProgressTimestamp ? new Date(window.lastProgressTimestamp).toLocaleTimeString() : 'None';
  html += `<p>Last Activity: ${lastActivity}</p>`;
  
  html += '</div>';
  
  // Add troubleshooting section
  html += `
    <div class="mt-3">
      <h6>Troubleshooting</h6>
      <ul class="mb-0">
        <li>If connection is unstable, try refreshing the page</li>
        <li>Check your network connection</li>
        <li>The system will automatically fall back to polling if real-time updates are unavailable</li>
      </ul>
    </div>
  `;
  
  contentElement.innerHTML = html;
}

/**
 * Enhance progress bar styling for better display
 */
function enhanceProgressBarStyling() {
  // Create a style element
  const style = document.createElement('style');
  style.id = 'enhanced-progress-styles';
  
  // Add CSS to improve progress bar styling
  style.innerHTML = `
    /* Progress bar improvements */
    .progress {
      position: relative;
      height: 20px;
      border-radius: 4px;
      overflow: hidden;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .progress-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
      font-weight: bold;
      transition: width 0.3s ease;
      color: white;
      text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
    }
    
    /* Progress bar text color for very low values */
    .progress-bar.text-end {
      justify-content: flex-end;
    }
    
    /* Animation for completion */
    .progress-bar.completed-animation {
      animation: pulse-success 1.5s ease;
    }
    
    @keyframes pulse-success {
      0% { background-color: var(--bs-success); }
      50% { background-color: var(--bs-info); }
      100% { background-color: var(--bs-success); }
    }
    
    /* Connection status indicator */
    .connection-status {
      transition: background-color 0.3s ease;
    }
    
    .connection-status:hover {
      transform: scale(1.1);
    }
    
    /* Fade transitions */
    .fade-in {
      animation: fadeIn 0.3s ease-in;
    }
    
    .fade-out {
      animation: fadeOut 0.3s ease-out;
      opacity: 0;
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
  
  // Add to the document head
  document.head.appendChild(style);
}

/**
 * Enhance history display with better formatting and features
 */
function enhanceHistoryDisplay() {
  if (!historyTableBody) return;
  
  // Add a hover effect to history rows
  const style = document.createElement('style');
  style.innerHTML = `
    .history-table tr {
      transition: background-color 0.2s ease;
    }
    
    .history-table tr:hover {
      background-color: rgba(0, 123, 255, 0.05);
    }
    
    .history-task-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    /* Type-specific styling */
    .task-type-file { background-color: rgba(13, 110, 253, 0.1); color: #0d6efd; }
    .task-type-scraper { background-color: rgba(13, 202, 240, 0.1); color: #0dcaf0; }
    .task-type-playlist { background-color: rgba(255, 193, 7, 0.1); color: #ffc107; }
  `;
  document.head.appendChild(style);
  
  // Update history refresh function to include enhanced formatting
  window.refreshHistoryTable = refreshEnhancedHistoryTable;
}

/**
 * Enhanced history refresh function
 */
function refreshEnhancedHistoryTable() {
  // Get existing implementation
  loadTaskHistoryFromStorage();
}


/**
 * Centralized error handling with recovery options
 * @param {Error|string} error - The error object or message
 * @param {string} context - Error context
 */
function handleErrorWithRecovery(error, context = 'general') {
  const errorMsg = error instanceof Error ? error.message : error;
  console.error(`Error in ${context}:`, error);
  
  // Don't show duplicate error messages
  const errorKey = `${context}:${errorMsg}`;
  if (window.errorCache && window.errorCache.has(errorKey)) {
    return;
  }
  
  // Create error cache if it doesn't exist
  if (!window.errorCache) {
    window.errorCache = new Map();
  }
  
  // Store error to prevent duplicates for 5 seconds
  window.errorCache.set(errorKey, true);
  setTimeout(() => {
    window.errorCache.delete(errorKey);
  }, 5000);
  
  // Initialize recovery options
  let recoveryOptions = [];
  
  // Create context-specific recovery options
  switch (context) {
    case 'socket':
      recoveryOptions = [
        {
          label: 'Reconnect',
          action: () => {
            setupRobustSocketConnection();
            showToast('Connection', 'Reconnection initiated', 'info');
          }
        },
        {
          label: 'Enable Polling',
          action: () => {
            startStatusPolling();
            showToast('Polling', 'Status polling enabled', 'info');
          }
        }
      ];
      break;
      
    case 'file-processing':
    case 'pdf-processing':
      recoveryOptions = [
        {
          label: 'Retry',
          action: () => {
            if (currentTaskId) {
              fetch(`/api/retry/${currentTaskId}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Task restarted', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart task', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
            }
          }
        },
        {
          label: 'New Task',
          action: () => {
            handleNewTaskClick();
          }
        }
      ];
      break;
      
    case 'playlist':
      // Check if we're getting the 'include_audio' error from the server logs
      if (errorMsg.includes("download_all_playlists() got an unexpected keyword argument 'include_audio'")) {
        // Special handling for this specific server error
        recoveryOptions = [
          {
            label: 'Retry Without Audio Option',
            action: () => {
              // Attempt to restart the playlist task without the audio option
              if (currentTaskId) {
                fetch(`/api/playlist/retry/${currentTaskId}`, { 
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    // Exclude the problematic parameter
                    include_audio: undefined
                  })
                })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Playlist download restarted with compatibility mode', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart playlist download', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
              }
            }
          },
          {
            label: 'New Task',
            action: () => {
              handleNewTaskClick();
            }
          }
        ];
      } else {
        // Standard playlist error handling
        recoveryOptions = [
          {
            label: 'Retry',
            action: () => {
              if (currentTaskId) {
                fetch(`/api/playlist/retry/${currentTaskId}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Playlist download restarted', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart playlist download', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
              }
            }
          }
        ];
      }
      break;
  }
  
  // Create error notification with recovery options if available
  if (recoveryOptions.length > 0) {
    showErrorToastWithRecovery(errorMsg || 'An unexpected error occurred', context, recoveryOptions);
  } else {
    // Use standard error toast
    showToast('Error', errorMsg || 'An unexpected error occurred', 'error');
  }
  
  // Log to server if available
  if (typeof sendErrorToServer === 'function') {
    sendErrorToServer(context, errorMsg, error);
  }
}

/**
 * Show error toast with recovery options
 * @param {string} message - Error message
 * @param {string} context - Error context
 * @param {Array} recoveryOptions - Array of recovery options
 */
function showErrorToastWithRecovery(message, context, recoveryOptions) {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // Generate a unique ID for this toast
  const toastId = 'toast-' + Date.now();
  
  // Create recovery options HTML
  let optionsHtml = '';
  if (recoveryOptions.length > 0) {
    optionsHtml = '<div class="mt-2 recovery-options">';
    
    recoveryOptions.forEach((option, index) => {
      optionsHtml += `
        <button class="btn btn-sm btn-outline-light me-2 recovery-btn" data-action="${index}">
          ${option.label}
        </button>
      `;
    });
    
    optionsHtml += '</div>';
  }
  
  // Create toast HTML
  const toastHtml = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-danger text-white">
        <i class="fas fa-exclamation-circle me-2"></i>
        <strong class="me-auto">Error: ${context}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
        ${optionsHtml}
      </div>
    </div>
  `;
  
  // Add toast to container
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  // Initialize and show the toast
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    animation: true,
    autohide: true,
    delay: 8000 // Longer delay for recovery options
  });
  toast.show();
  
  // Add event listeners for recovery options
  if (recoveryOptions.length > 0) {
    const recoveryButtons = toastElement.querySelectorAll('.recovery-btn');
    recoveryButtons.forEach(button => {
      button.addEventListener('click', function() {
        const actionIndex = parseInt(this.getAttribute('data-action'));
        if (recoveryOptions[actionIndex] && typeof recoveryOptions[actionIndex].action === 'function') {
          // Execute recovery action
          recoveryOptions[actionIndex].action();
          
          // Hide toast
          toast.hide();
        }
      });
    });
  }
  
  // Remove toast from DOM after it's hidden
  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

/**
 * Check if server is reachable and retry connection
 * @returns {Promise<boolean>} Whether server is reachable
 */
async function checkServerReachable() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('/api/ping', { 
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log("Server ping successful:", data);
      return data.status === 'ok';
    }
    
    return false;
  } catch (error) {
    console.warn("Server ping failed:", error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Normal initialization
  initializeApp();
  
  // Add NeuroGen improvements after initialization
  setTimeout(implementNeuroGenImprovements, 1000);
});