/**
 * Create results UI with improved design and functionality
 * This updated function implements better stats display with enhanced styling and animations
 * @param {Object} data - Completion data from the server
 * @returns {boolean} - Success status
 */
function createResultsUI(data = {}) {
  try {
    console.log("Creating results UI elements with enhanced display");
    
    // Find a suitable container using multiple fallback approaches
    let container = document.getElementById('playlist-tab');
    
    if (!container) {
      container = document.getElementById('main-content');
    }
    
    if (!container) {
      container = document.querySelector('.container');
    }
    
    if (!container) {
      container = document.body;
    }
    
    if (!container) {
      console.error("Could not find any container for results UI");
      return false;
    }
    
    // Check if results container already exists
    const existingContainer = document.getElementById('playlist-results-container');
    if (existingContainer) {
      console.log("Results UI elements already exist, updating content");
      // Update existing stats display
      const statsElement = document.getElementById('playlist-stats');
      if (statsElement && data.stats) {
        updateResultStats(statsElement, data.stats, data.output_file);
      }
      
      // Update the open JSON button
      const openJsonBtn = document.getElementById('open-playlist-json');
      if (openJsonBtn && data.output_file) {
        openJsonBtn.setAttribute('data-output-file', data.output_file);
        openJsonBtn.disabled = false;
      }
      
      // Ensure event listeners are attached
      ensureEventListenersOnResults();
      
      // Make sure the container is visible
      existingContainer.style.display = 'block';
      existingContainer.classList.remove('d-none');
      
      return true;
    }
    
    // Create results container with modern design
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'playlist-results-container';
    resultsContainer.className = 'card border-0 shadow-lg mb-4 animate__animated animate__fadeIn';
    resultsContainer.style.display = 'none';
    
    // Create results UI with dynamic layout - improved look and feel
    resultsContainer.innerHTML = `
      <div class="card-header bg-light py-3">
        <div class="d-flex align-items-center">
          <div class="success-icon-container me-3">
            <div class="success-icon-circle">
              <i class="fas fa-check text-success fa-2x"></i>
            </div>
          </div>
          <div>
            <h5 class="card-title mb-0 text-success">Playlist Download Complete</h5>
            <div class="text-muted small">Your playlists have been successfully downloaded and processed</div>
          </div>
        </div>
      </div>
      
      <div class="card-body">
        <div id="playlist-stats" class="mt-2 mb-3">
          <!-- Stats will be populated here -->
          <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading statistics data...</p>
          </div>
        </div>
        
        <div class="d-flex justify-content-between mt-4 action-buttons">
          <div>
            <button id="open-playlist-json" class="btn btn-primary" disabled>
              <i class="fas fa-file-alt me-2"></i>Open JSON File
            </button>
            <button id="open-playlist-folder" class="btn btn-outline-secondary ms-2">
              <i class="fas fa-folder-open me-2"></i>Open Folder
            </button>
          </div>
          <div>
            <button id="playlist-new-task-btn" class="btn btn-outline-primary">
              <i class="fas fa-plus me-2"></i>New Download
            </button>
          </div>
        </div>
      </div>
      
      <div class="card-footer bg-light p-3">
        <div class="d-flex align-items-center justify-content-between">
          <div class="small text-muted">
            <i class="fas fa-info-circle me-1"></i> 
            Playlists can be accessed from the JSON file or the individual folders
          </div>
          <div class="actions-menu">
            <button id="add-to-favorites" class="btn btn-sm btn-outline-warning me-2">
              <i class="fas fa-star me-1"></i>Add to Favorites
            </button>
            <button id="copy-output-path" class="btn btn-sm btn-outline-secondary">
              <i class="fas fa-copy me-1"></i>Copy Path
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Add to container
    container.appendChild(resultsContainer);
    
    // Add event listeners with improved error handling
    attachEventListeners(resultsContainer, data);
    
    // Add custom CSS
    addCustomResultsCSS();
    
    // Show the results container with animation
    resultsContainer.style.display = 'block';
    
    // Update stats if available
    if (data.stats) {
      const statsElement = document.getElementById('playlist-stats');
      if (statsElement) {
        // Small delay for animation effect
        setTimeout(() => {
          updateResultStats(statsElement, data.stats, data.output_file);
        }, 300);
      }
    }
    
    console.log("Results UI elements created successfully");
    return true;
  } catch (error) {
    console.error("Error creating results UI elements:", error);
    
    // Try an even simpler approach as fallback
    try {
      console.log("Attempting simpler fallback UI creation");
      const container = document.body;
      
      const simpleResults = document.createElement('div');
      simpleResults.id = 'playlist-results-container';
      simpleResults.className = 'card m-3';
      simpleResults.innerHTML = `
        <div class="card-body">
          <h5 class="card-title text-success">Download Complete</h5>
          <div id="playlist-stats" class="mt-3"></div>
          <button id="playlist-new-task-btn" class="btn btn-primary mt-3">
            New Download
          </button>
        </div>
      `;
      
      container.appendChild(simpleResults);
      
      // Add minimal event listener
      const newTaskBtn = document.getElementById('playlist-new-task-btn');
      if (newTaskBtn) {
        newTaskBtn.addEventListener('click', handleNewTaskClick);
      }
      
      // Update stats if available
      if (data.stats) {
        const statsElement = document.getElementById('playlist-stats');
        if (statsElement) {
          // Use simpler stats display for fallback
          statsElement.innerHTML = `
            <div class="alert alert-success">
              <p><strong>Output File:</strong> ${data.output_file || 'Unknown'}</p>
              <p><strong>Playlists Processed:</strong> ${data.stats.total_playlists || 1}</p>
              <p><strong>Videos Processed:</strong> ${data.stats.total_videos || 0}</p>
            </div>
          `;
        }
      }
      
      return true;
    } catch (fallbackError) {
      console.error("Error creating fallback UI:", fallbackError);
      return false;
    }
  }
}

/**
 * Attach event listeners to results UI elements with error handling
 * @param {HTMLElement} container - Results container
 * @param {Object} data - Completion data
 */
function attachEventListeners(container, data) {
  try {
    // Open JSON button
    const openJsonBtn = container.querySelector('#open-playlist-json');
    if (openJsonBtn) {
      openJsonBtn.addEventListener('click', function() {
        const outputFile = this.getAttribute('data-output-file');
        if (outputFile) {
          fetch(`/api/open-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: outputFile })
          })
            .then(response => {
              if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
              }
              return response.json();
            })
            .then(result => {
              if (result.success) {
                showToast('File Opened', 'JSON file has been opened', 'success');
              } else {
                showToast('Error', result.message || 'Could not open file', 'error');
              }
            })
            .catch(error => {
              console.error("Error opening file:", error);
              showToast('Error', 'Failed to open file: ' + error.message, 'error');
            });
        }
      });
      
      // Set the output file if available
      if (data.output_file) {
        openJsonBtn.setAttribute('data-output-file', data.output_file);
        openJsonBtn.disabled = false;
      }
    }
    
    // Open folder button with improved path extraction
    const openFolderBtn = container.querySelector('#open-playlist-folder');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', function() {
        // Try to get folder path from the JSON button or from data
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : data.output_file;
        
        if (outputFile) {
          // Extract directory from output file using more reliable path handling
          const folderPath = outputFile.substring(0, Math.max(
            outputFile.lastIndexOf('\\'), 
            outputFile.lastIndexOf('/')
          ));
          
          // Open the folder with improved error handling
          fetch(`/api/open-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folderPath, isDirectory: true })
          })
            .then(response => {
              if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
              }
              return response.json();
            })
            .then(result => {
              if (result.success) {
                showToast('Folder Opened', 'Output folder has been opened', 'success');
              } else {
                showToast('Error', result.message || 'Could not open folder', 'error');
              }
            })
            .catch(error => {
              console.error("Error opening folder:", error);
              showToast('Error', 'Failed to open folder: ' + error.message, 'error');
            });
        } else {
          showToast('Error', 'Could not determine folder path', 'warning');
        }
      });
    }
    
    // New task button
    const newTaskBtn = container.querySelector('#playlist-new-task-btn');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', handleNewTaskClick);
    }
    
    // Add to favorites button with improved history manager support
    const addToFavoritesBtn = container.querySelector('#add-to-favorites');
    if (addToFavoritesBtn) {
      addToFavoritesBtn.addEventListener('click', function() {
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : data.output_file;
        
        if (!outputFile) {
          showToast('Error', 'Output file path not available', 'warning');
          return;
        }
        
        // Try multiple history manager options
        try {
          // First try imported historyManager
          if (historyManager && typeof historyManager.addFavorite === 'function') {
            historyManager.addFavorite({
              type: 'playlist',
              path: outputFile,
              name: getFileNameFromPath(outputFile),
              timestamp: Date.now()
            });
            
            showToast('Added to Favorites', 'Playlist has been added to your favorites', 'success');
            return;
          }
          
          // Then try progressHandler's historyManager
          if (progressHandler?.historyManager?.addFavorite) {
            progressHandler.historyManager.addFavorite({
              type: 'playlist',
              path: outputFile,
              name: getFileNameFromPath(outputFile),
              timestamp: Date.now()
            });
            
            showToast('Added to Favorites', 'Playlist has been added to your favorites', 'success');
            return;
          }
          
          // Try global historyManager
          if (window.historyManager && typeof window.historyManager.addFavorite === 'function') {
            window.historyManager.addFavorite({
              type: 'playlist',
              path: outputFile,
              name: getFileNameFromPath(outputFile),
              timestamp: Date.now()
            });
            
            showToast('Added to Favorites', 'Playlist has been added to your favorites', 'success');
            return;
          }
          
          // Fallback - save to localStorage
          const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
          
          // Check if already in favorites
          const alreadyExists = favorites.some(fav => fav.path === outputFile);
          if (alreadyExists) {
            showToast('Already in Favorites', 'This playlist is already in your favorites', 'info');
            return;
          }
          
          // Add to favorites
          favorites.unshift({
            type: 'playlist',
            path: outputFile,
            name: getFileNameFromPath(outputFile),
            timestamp: Date.now()
          });
          
          // Limit favorites size
          if (favorites.length > 50) {
            favorites.pop();
          }
          
          localStorage.setItem('favorites', JSON.stringify(favorites));
          showToast('Added to Favorites', 'Playlist has been added to your favorites', 'success');
        } catch (error) {
          console.error("Error adding to favorites:", error);
          showToast('Error', 'Failed to add to favorites: ' + error.message, 'error');
        }
      });
    }
    
    // Copy path button (new feature)
    const copyPathBtn = container.querySelector('#copy-output-path');
    if (copyPathBtn) {
      copyPathBtn.addEventListener('click', function() {
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : data.output_file;
        
        if (outputFile) {
          try {
            // Modern clipboard API
            navigator.clipboard.writeText(outputFile)
              .then(() => {
                showToast('Path Copied', 'Output file path copied to clipboard', 'success');
                
                // Highlight button for visual feedback
                copyPathBtn.classList.add('btn-success');
                copyPathBtn.classList.remove('btn-outline-secondary');
                setTimeout(() => {
                  copyPathBtn.classList.remove('btn-success');
                  copyPathBtn.classList.add('btn-outline-secondary');
                }, 1500);
              })
              .catch(err => {
                console.error('Could not copy text: ', err);
                showToast('Error', 'Could not copy to clipboard', 'error');
              });
          } catch (error) {
            console.error("Error copying to clipboard:", error);
            
            // Fallback for browsers that don't support clipboard API
            try {
              const tempInput = document.createElement('input');
              tempInput.value = outputFile;
              document.body.appendChild(tempInput);
              tempInput.select();
              document.execCommand('copy');
              document.body.removeChild(tempInput);
              
              showToast('Path Copied', 'Output file path copied to clipboard', 'success');
            } catch (fallbackError) {
              console.error("Error using fallback clipboard method:", fallbackError);
              showToast('Error', 'Failed to copy path to clipboard', 'error');
            }
          }
        } else {
          showToast('Error', 'Output file path not available', 'warning');
        }
      });
    }
  } catch (error) {
    console.error("Error attaching event listeners:", error);
  }
}

/**
 * Ensure event listeners are attached to the results UI elements
 * This is useful when the UI is already created but we need to ensure events are attached
 */
function ensureEventListenersOnResults() {
  try {
    // Open JSON button
    const openJsonBtn = document.getElementById('open-playlist-json');
    if (openJsonBtn && !openJsonBtn._listenerAttached) {
      openJsonBtn.addEventListener('click', function() {
        const outputFile = this.getAttribute('data-output-file');
        if (outputFile) {
          fetch(`/api/open-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: outputFile })
          })
            .catch(error => console.error("Error opening file:", error));
        }
      });
      openJsonBtn._listenerAttached = true;
    }
    
    // Open folder button
    const openFolderBtn = document.getElementById('open-playlist-folder');
    if (openFolderBtn && !openFolderBtn._listenerAttached) {
      openFolderBtn.addEventListener('click', function() {
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : null;
        
        if (outputFile) {
          const folderPath = outputFile.substring(0, Math.max(
            outputFile.lastIndexOf('\\'), 
            outputFile.lastIndexOf('/')
          ));
          
          fetch(`/api/open-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: folderPath, isDirectory: true })
          })
            .catch(error => console.error("Error opening folder:", error));
        }
      });
      openFolderBtn._listenerAttached = true;
    }
    
    // New task button
    const newTaskBtn = document.getElementById('playlist-new-task-btn');
    if (newTaskBtn && !newTaskBtn._listenerAttached) {
      newTaskBtn.addEventListener('click', handleNewTaskClick);
      newTaskBtn._listenerAttached = true;
    }
    
    // Add to favorites button
    const addToFavoritesBtn = document.getElementById('add-to-favorites');
    if (addToFavoritesBtn && !addToFavoritesBtn._listenerAttached) {
      addToFavoritesBtn.addEventListener('click', function() {
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : null;
        
        if (outputFile) {
          try {
            // Try different historyManager implementations
            if (historyManager && typeof historyManager.addFavorite === 'function') {
              historyManager.addFavorite({
                type: 'playlist',
                path: outputFile,
                name: getFileNameFromPath(outputFile),
                timestamp: Date.now()
              });
            } else if (window.historyManager && typeof window.historyManager.addFavorite === 'function') {
              window.historyManager.addFavorite({
                type: 'playlist',
                path: outputFile,
                name: getFileNameFromPath(outputFile),
                timestamp: Date.now()
              });
            } else {
              // Fallback to localStorage
              const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
              favorites.unshift({
                type: 'playlist',
                path: outputFile,
                name: getFileNameFromPath(outputFile),
                timestamp: Date.now()
              });
              localStorage.setItem('favorites', JSON.stringify(favorites));
            }
            
            showToast('Added to Favorites', 'Playlist has been added to your favorites', 'success');
          } catch (error) {
            console.error("Error adding to favorites:", error);
            showToast('Error', 'Failed to add to favorites', 'error');
          }
        } else {
          showToast('Error', 'Output file path not available', 'warning');
        }
      });
      addToFavoritesBtn._listenerAttached = true;
    }
    
    // Copy path button
    const copyPathBtn = document.getElementById('copy-output-path');
    if (copyPathBtn && !copyPathBtn._listenerAttached) {
      copyPathBtn.addEventListener('click', function() {
        const jsonBtn = document.getElementById('open-playlist-json');
        const outputFile = jsonBtn ? jsonBtn.getAttribute('data-output-file') : null;
        
        if (outputFile) {
          try {
            navigator.clipboard.writeText(outputFile)
              .then(() => {
                showToast('Path Copied', 'Output file path copied to clipboard', 'success');
              })
              .catch(err => {
                console.error('Could not copy text: ', err);
                
                // Fallback method
                const tempInput = document.createElement('input');
                tempInput.value = outputFile;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                showToast('Path Copied', 'Output file path copied to clipboard', 'success');
              });
          } catch (error) {
            console.error("Error copying to clipboard:", error);
            showToast('Error', 'Failed to copy path to clipboard', 'error');
          }
        }
      });
      copyPathBtn._listenerAttached = true;
    }
  } catch (error) {
    console.error("Error ensuring event listeners on results UI:", error);
  }
}

/**
 * Add custom CSS for results UI with enhanced styling
 */
function addCustomResultsCSS() {
  try {
    // Check if we've already added the style
    if (!document.querySelector('style[data-ui-style="playlist-results"]')) {
      const style = document.createElement('style');
      style.setAttribute('data-ui-style', 'playlist-results');
      style.textContent = `
        /* Enhanced styling for results UI */
        .success-icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
        }
        
        .success-icon-circle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background-color: rgba(25, 135, 84, 0.1);
          transition: all 0.3s ease;
        }
        
        .success-icon-circle:hover {
          transform: scale(1.1);
          background-color: rgba(25, 135, 84, 0.2);
        }
        
        .stats-container {
          background-color: #f8f9fa;
          border-radius: 12px;
          margin-bottom: 20px;
          transition: all 0.3s ease;
          overflow: hidden;
        }
        
        .stats-container:hover {
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          transform: translateY(-3px);
        }
        
        .stats-header {
          padding: 18px 24px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          background-color: rgba(0,0,0,0.02);
        }
        
        .stat-card {
          background-color: white;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 16px;
          border: 1px solid rgba(0,0,0,0.05);
          transition: transform 0.3s, box-shadow 0.3s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }
        
        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        
        .stat-card .icon {
          font-size: 1.75rem;
          margin-right: 15px;
          color: #0d6efd;
        }
        
        .stat-card .value {
          font-size: 2rem;
          font-weight: 700;
          color: #212529;
        }
        
        .stat-card .label {
          font-size: 0.875rem;
          color: #6c757d;
          margin-top: 4px;
        }
        
        .time-badge {
          background-color: #6c757d;
          color: white;
          border-radius: 30px;
          padding: 6px 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
        }
        
        .time-badge i {
          margin-right: 8px;
        }
        
        .icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background-color: rgba(0,0,0,0.04);
          transition: all 0.3s ease;
        }
        
        .card:hover .icon-container {
          transform: scale(1.05);
        }
        
        /* Button animation for feedback */
        .action-buttons .btn {
          transition: all 0.2s ease;
        }
        
        .action-buttons .btn:active {
          transform: scale(0.95);
        }
        
        /* Progress bar animations */
        .progress {
          overflow: hidden;
          position: relative;
        }
        
        .progress-bar {
          transition: width 0.8s ease-in-out;
        }
        
        .progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.2) 50%,
            rgba(255,255,255,0) 100%
          );
          width: 50%;
          background-size: 200% 200%;
          animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .row .col-md-4 {
            margin-bottom: 15px;
          }
          
          .action-buttons {
            flex-direction: column;
            gap: 10px;
          }
          
          .action-buttons > div {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          
          .action-buttons .btn {
            flex-grow: 1;
          }
        }
      `;
      
      document.head.appendChild(style);
      console.log("Added enhanced custom styling for results UI");
    }
  } catch (error) {
    console.error("Error adding custom CSS styles:", error);
  }
}

/**
 * Process and normalize stats data to ensure consistent format with improved validation
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
      return processStatsData({}); // Return default stats
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
    failed_playlists: stats.failed_playlists || 0
  };
}

/**
 * Update result statistics display with proper formatting and enhanced visual design
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 * @param {string} outputFile - Output file path
 * @returns {string} - HTML for stats display
 */
function updateResultStats(element, stats, outputFile) {
  try {
    if (!element) return;
    
    // Process stats to ensure all values are present
    stats = processStatsData(stats);
    
    // Create a formatted display of the stats with enhanced visuals and animations
    let statsHtml = `
      <div class="stats-container animate__animated animate__fadeIn">
        <div class="stats-header d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Download Results</h5>
          <div class="badge bg-secondary p-2">
            <i class="fas fa-clock me-1"></i>
            ${formatDuration(stats.total_duration_seconds || stats.duration_seconds || 0)} total duration
          </div>
        </div>
        
        <!-- Output file info with copy button -->
        ${outputFile ? `
          <div class="mb-3 p-3 bg-light rounded">
            <label class="text-muted small mb-1">Output File</label>
            <div class="d-flex align-items-center">
              <div class="text-truncate flex-grow-1">
                <i class="fas fa-file-alt me-1 text-primary"></i>
                <span class="text-primary">${outputFile}</span>
              </div>
              <button class="btn btn-sm btn-outline-secondary ms-2 copy-path-btn" 
                      data-path="${outputFile}" title="Copy path to clipboard">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        ` : ''}
        
        <!-- Stats Cards with improved visuals -->
        <div class="row g-3 mb-4">
          <!-- Total Playlists Card -->
          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body py-3 px-3">
                <div class="d-flex align-items-center">
                  <div class="icon-container text-primary me-3">
                    <i class="fas fa-list fa-2x"></i>
                  </div>
                  <div>
                    <h3 class="mb-0 fw-bold">${stats.total_playlists}</h3>
                    <div class="text-muted small">Total Playlists</div>
                    ${stats.failed_playlists > 0 ? 
                      `<div class="text-danger small mt-1">(${stats.failed_playlists} failed)</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Videos Card -->
          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body py-3 px-3">
                <div class="d-flex align-items-center">
                  <div class="icon-container text-success me-3">
                    <i class="fas fa-video fa-2x"></i>
                  </div>
                  <div>
                    <h3 class="mb-0 fw-bold">${stats.total_videos}</h3>
                    <div class="text-muted small">Total Videos</div>
                    ${stats.processed_videos > 0 && stats.processed_videos !== stats.total_videos ? 
                      `<div class="text-info small mt-1">(${stats.processed_videos} processed)</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Size Card -->
          <div class="col-md-4">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body py-3 px-3">
                <div class="d-flex align-items-center">
                  <div class="icon-container text-info me-3">
                    <i class="fas fa-database fa-2x"></i>
                  </div>
                  <div>
                    <h3 class="mb-0 fw-bold">${formatBytes(stats.total_bytes)}</h3>
                    <div class="text-muted small">Total Size</div>
                    ${stats.total_chunks > 0 ? 
                      `<div class="text-info small mt-1">(${stats.total_chunks} chunks)</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Detailed Stats with dynamic loading -->
        <div class="row">
          <!-- Playlist Statistics Column -->
          <div class="col-md-6 mb-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-header bg-light py-2">
                <h6 class="mb-0"><i class="fas fa-list me-2"></i>Playlist Statistics</h6>
              </div>
              <div class="card-body p-0">
                <ul class="list-group list-group-flush">
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Total Playlists</span>
                    <span class="badge bg-primary rounded-pill">${stats.total_playlists}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Processed Playlists</span>
                    <span class="badge bg-success rounded-pill">${stats.processed_playlists}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Empty Playlists</span>
                    <span class="badge bg-secondary rounded-pill">${stats.empty_playlists}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Skipped Playlists</span>
                    <span class="badge bg-warning rounded-pill">${stats.skipped_playlists}</span>
                  </li>
                  ${stats.failed_playlists > 0 ? `
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Failed Playlists</span>
                    <span class="badge bg-danger rounded-pill">${stats.failed_playlists}</span>
                  </li>
                  ` : ''}
                </ul>
              </div>
            </div>
          </div>
          
          <!-- Video Statistics Column -->
          <div class="col-md-6 mb-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-header bg-light py-2">
                <h6 class="mb-0"><i class="fas fa-video me-2"></i>Video Statistics</h6>
              </div>
              <div class="card-body p-0">
                <ul class="list-group list-group-flush">
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Total Videos</span>
                    <span class="badge bg-primary rounded-pill">${stats.total_videos}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Processed Videos</span>
                    <span class="badge bg-success rounded-pill">${stats.processed_videos}</span>
                  </li>
                  ${stats.total_files > 0 ? `
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Total Files</span>
                    <span class="badge bg-info rounded-pill">${stats.total_files}</span>
                  </li>
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Processed Files</span>
                    <span class="badge bg-success rounded-pill">${stats.processed_files}</span>
                  </li>
                  ` : ''}
                  ${stats.error_files > 0 ? `
                  <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>Error Files</span>
                    <span class="badge bg-danger rounded-pill">${stats.error_files}</span>
                  </li>
                  ` : ''}
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Processing Details with conditional rendering -->
        ${stats.total_files > 0 || stats.total_chunks > 0 ? `
        <div class="card border-0 shadow-sm mb-3 mt-3">
          <div class="card-header bg-light py-2">
            <h6 class="mb-0"><i class="fas fa-cogs me-2"></i>Processing Details</h6>
          </div>
          <div class="card-body">
            <div class="row g-3">
              ${stats.total_files > 0 ? `
              <div class="col-md-6">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span>File Processing</span>
                </div>
                <div class="progress" style="height: 20px">
                  <div class="progress-bar bg-success" role="progressbar" 
                       style="width: ${Math.min(100, (stats.processed_files / Math.max(1, stats.total_files)) * 100)}%" 
                       aria-valuenow="${Math.min(100, (stats.processed_files / Math.max(1, stats.total_files)) * 100)}" 
                       aria-valuemin="0" aria-valuemax="100">
                    ${stats.processed_files} / ${stats.total_files}
                  </div>
                </div>
                <div class="d-flex justify-content-between mt-1 small text-muted">
                  <span>${stats.processed_files} processed</span>
                  ${stats.error_files > 0 ? `<span>${stats.error_files} errors</span>` : ''}
                  ${stats.skipped_files > 0 ? `<span>${stats.skipped_files} skipped</span>` : ''}
                </div>
              </div>
              ` : ''}
              
              ${stats.total_chunks > 0 ? `
              <div class="col-md-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span>Content Details</span>
                </div>
                <ul class="list-unstyled mb-0 small">
                  <li class="d-flex justify-content-between py-1">
                    <span>Total Chunks:</span>
                    <span class="badge bg-info">${stats.total_chunks}</span>
                  </li>
                  <li class="d-flex justify-content-between py-1">
                    <span>Processing Time:</span>
                    <span class="badge bg-secondary">${formatDuration(stats.total_processing_time || stats.processing_time || 0)}</span>
                  </li>
                  <li class="d-flex justify-content-between py-1">
                    <span>Total Data Size:</span>
                    <span class="badge bg-primary">${formatBytes(stats.total_bytes)}</span>
                  </li>
                </ul>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- Duration Display with enhanced styling -->
        ${stats.duration_seconds > 0 || stats.total_duration_seconds > 0 ? `
        <div class="text-center mb-3">
          <div class="badge bg-light text-dark py-2 px-3 shadow-sm d-inline-flex align-items-center">
            <i class="fas fa-clock me-2 text-secondary"></i> 
            <span>Total Media Duration: <strong>${formatDuration(stats.duration_seconds || stats.total_duration_seconds || 0)}</strong></span>
          </div>
        </div>
        ` : ''}
        
        <!-- Completion Information -->
        <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
          <div class="text-muted small">
            <i class="fas fa-calendar-check me-1"></i> 
            Completed: ${stats.completed_at ? stats.completed_at : new Date().toLocaleString()}
          </div>
          
          <!-- Directory Information -->
          ${stats.download_directory ? `
          <div class="text-muted small">
            <i class="fas fa-folder me-1"></i> Directory: ${stats.download_directory}
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // Update the element
    element.innerHTML = statsHtml;
    
    // Add event listener for path copy buttons
    const copyButtons = element.querySelectorAll('.copy-path-btn');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const path = this.getAttribute('data-path');
        if (path) {
          try {
            navigator.clipboard.writeText(path)
              .then(() => {
                // Provide visual feedback
                this.innerHTML = '<i class="fas fa-check"></i>';
                this.classList.add('btn-success');
                this.classList.remove('btn-outline-secondary');
                
                // Reset after a delay
                setTimeout(() => {
                  this.innerHTML = '<i class="fas fa-copy"></i>';
                  this.classList.remove('btn-success');
                  this.classList.add('btn-outline-secondary');
                }, 1500);
                
                // Show toast
                if (typeof showToast === 'function') {
                  showToast('Copied', 'Path copied to clipboard', 'success');
                }
              })
              .catch(err => {
                console.error("Clipboard error:", err);
                
                // Fallback method
                const tempInput = document.createElement('input');
                tempInput.value = path;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                // Provide visual feedback
                this.innerHTML = '<i class="fas fa-check"></i>';
                
                // Reset after a delay
                setTimeout(() => {
                  this.innerHTML = '<i class="fas fa-copy"></i>';
                }, 1500);
              });
          } catch (error) {
            console.error("Error copying path:", error);
          }
        }
      });
    });
    
    console.log("Stats display updated successfully with enhanced formatting");
    return statsHtml;
  } catch (error) {
    console.error("Error updating final playlist stats:", error);
    
    // Fallback simple display
    try {
      element.innerHTML = `
        <div class="alert alert-info">
          <h5>Download Complete</h5>
          <p>Output File: ${outputFile || 'Unknown'}</p>
          <p class="mb-0 mt-2">Note: There was an error displaying detailed statistics, but your download was successful.</p>
        </div>
      `;
    } catch (e) {
      console.error("Error with fallback stats display:", e);
    }
    return "";
  }
}