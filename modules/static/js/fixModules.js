/**
 * Special handling for playlistDownloader module
 * This ensures the module is loaded and initialized properly
 */
async function loadPlaylistDownloaderModule() {
  try {
    console.log("Loading playlistDownloader module with special handling...");
    
    // Attempt to load the module directly
    const modulePath = './modules/features/playlistDownloader.js';
    const module = await moduleLoader.importModule(modulePath, {
      retries: 3,
      timeout: 10000, // Longer timeout for this module
      standardizeExports: false
    });
    
    if (module) {
      console.log("playlistDownloader module loaded successfully");
      
      // Register it globally for access
      window.playlistDownloader = module;
      window.moduleInstances.playlistDownloader = module;
      
      return module;
    } else {
      console.warn("playlistDownloader module failed to load, will use fallback");
      return createPlaylistDownloaderFallback();
    }
  } catch (error) {
    console.error("Error loading playlistDownloader module:", error);
    return createPlaylistDownloaderFallback();
  }
}

/**
 * Create a fallback for the playlistDownloader module
 * This ensures basic functionality even if the module fails to load
 */
function createPlaylistDownloaderFallback() {
  console.warn("Creating fallback for playlistDownloader module");
  
  // Create a basic fallback that won't crash the app
  return {
    __isFallback: true,
    initialized: false,
    
    initialize() {
      console.warn("Using fallback playlistDownloader module");
      this.initialized = true;
      
      // Setup event listeners for the UI
      this.setupListeners();
      
      return Promise.resolve(true);
    },
    
    isInitialized() {
      return this.initialized;
    },
    
    setupListeners() {
      // Find form with basic selectors
      const playlistForm = document.getElementById('playlist-form');
      if (playlistForm) {
        playlistForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handlePlaylistSubmit(e);
        });
      }
      
      // Cancel button
      const cancelButton = document.getElementById('playlist-cancel-btn');
      if (cancelButton) {
        cancelButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.cancelDownload();
        });
      }
    },
    
    handlePlaylistSubmit(e) {
      e.preventDefault();
      
      // Show basic toast if UI is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Fallback', 'Using fallback playlist downloader - limited functionality', 'warning');
      }
      
      // Basic form submission that calls the backend API
      const form = e.target;
      const urlsContainer = document.getElementById('playlist-urls-container');
      const rootDirField = document.getElementById('playlist-root');
      const outputFileField = document.getElementById('playlist-output');
      
      if (!urlsContainer || !rootDirField || !outputFileField) {
        alert('Required form fields not found');
        return;
      }
      
      // Get playlist URLs
      const playlistURLs = [];
      const urlInputs = urlsContainer.querySelectorAll('.playlist-url');
      urlInputs.forEach(input => {
        const url = input.value.trim();
        if (url) {
          playlistURLs.push(url);
        }
      });
      
      if (playlistURLs.length === 0) {
        alert('Please enter at least one playlist URL');
        return;
      }
      
      const rootDir = rootDirField.value.trim();
      if (!rootDir) {
        alert('Please enter a root directory');
        return;
      }
      
      const outputFile = outputFileField.value.trim();
      if (!outputFile) {
        alert('Please enter an output filename');
        return;
      }
      
      // Create the API payload
      const payload = {
        playlists: playlistURLs,
        root_directory: rootDir,
        output_file: this.ensureJsonExtension(outputFile, rootDir)
      };
      
      // Show progress UI
      this.showProgress();
      
      // Call the API
      fetch("/api/start-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        
        // Store task ID
        this.currentTaskId = data.task_id;
        window.currentTaskId = data.task_id;
        
        // Save to session storage
        sessionStorage.setItem('ongoingTaskId', data.task_id);
        sessionStorage.setItem('ongoingTaskType', 'playlist');
        
        // Start polling
        this.startPolling(data.task_id);
        
        // Show toast
        if (window.ui && typeof window.ui.showToast === 'function') {
          window.ui.showToast('Download Started', 'Your playlists are being downloaded', 'info');
        }
      })
      .catch(error => {
        console.error("Error starting playlist download:", error);
        this.showError(error.message || 'Failed to start download');
      });
    },
    
    startPolling(taskId) {
      // Use socketHandler if available
      if (window.socketHandler && typeof window.socketHandler.startStatusPolling === 'function') {
        window.socketHandler.startStatusPolling(taskId, {
          onProgress: data => this.handleProgress(data),
          onComplete: data => this.handleCompletion(data),
          onError: data => this.showError(data.error || 'Unknown error')
        });
      }
      // Fall back to manual polling
      else {
        this.pollingInterval = setInterval(() => {
          fetch(`/api/task/status/${taskId}`)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'completed') {
                this.handleCompletion(data);
                clearInterval(this.pollingInterval);
              } else if (data.status === 'error') {
                this.showError(data.error || 'Task failed');
                clearInterval(this.pollingInterval);
              } else if (data.progress !== undefined) {
                this.handleProgress(data);
              }
            })
            .catch(error => {
              console.error("Error polling for status:", error);
            });
        }, 2000);
      }
    },
    
    handleProgress(data) {
      const progressBar = document.getElementById('playlist-progress-bar');
      const progressStatus = document.getElementById('playlist-progress-status');
      
      if (progressBar) {
        const percent = Math.round(data.progress || 0);
        progressBar.style.width = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
        progressBar.textContent = `${percent}%`;
      }
      
      if (progressStatus && data.message) {
        progressStatus.textContent = data.message;
      }
    },
    
    handleCompletion(data) {
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Download Complete', 'Playlist download completed', 'success');
      }
      
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      const playlistStats = document.getElementById('playlist-stats');
      
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'block';
      
      // Clean up
      clearInterval(this.pollingInterval);
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      this.currentTaskId = null;
      window.currentTaskId = null;
    },
    
    showProgress() {
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      
      if (formContainer) formContainer.style.display = 'none';
      if (progressContainer) progressContainer.style.display = 'block';
      
      // Initialize progress bar to 0%
      const progressBar = document.getElementById('playlist-progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.textContent = '0%';
      }
    },
    
    showForm() {
      const formContainer = document.getElementById('playlist-form-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      const resultsContainer = document.getElementById('playlist-results-container');
      
      if (formContainer) formContainer.style.display = 'block';
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'none';
    },
    
    showError(message) {
      // Show toast if UI is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Error', message, 'error');
      } else {
        alert(`Error: ${message}`);
      }
      
      this.showForm();
    },
    
    cancelDownload() {
      if (!this.currentTaskId) return;
      
      const taskId = this.currentTaskId;
      
      // Try through socketHandler
      if (window.socketHandler && typeof window.socketHandler.cancelTask === 'function') {
        window.socketHandler.cancelTask(taskId)
          .then(() => {
            this.showForm();
            if (window.ui && typeof window.ui.showToast === 'function') {
              window.ui.showToast('Cancelled', 'Playlist download cancelled', 'warning');
            }
          })
          .catch(error => {
            console.error("Error cancelling task:", error);
          });
      } 
      // Try direct API call
      else {
        fetch(`/api/cancel_task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ task_id: taskId })
        })
        .then(response => {
          if (response.ok) {
            this.showForm();
            clearInterval(this.pollingInterval);
            
            if (window.ui && typeof window.ui.showToast === 'function') {
              window.ui.showToast('Cancelled', 'Playlist download cancelled', 'warning');
            }
          } else {
            console.warn("Failed to cancel task:", response.status);
          }
        })
        .catch(error => {
          console.error("Error cancelling task:", error);
        });
      }
    },
    
    ensureJsonExtension(filename, directory) {
      // Ensure .json extension
      if (!filename.toLowerCase().endsWith('.json')) {
        filename += '.json';
      }
      
      // Join with directory
      return directory.endsWith('/') || directory.endsWith('\\') 
        ? `${directory}${filename}` 
        : `${directory}/${filename}`;
    }
  };
}

/**
 * Enhanced Optional Module Loading Function
 * With special handling for playlistDownloader
 */
async function loadOptionalModules() {
  console.log("Loading optional modules...");
  
  try {
    // Special handling for playlistDownloader - prioritize loading this module
    const playlistDownloaderModule = await loadPlaylistDownloaderModule();
    
    // If we successfully loaded playlistDownloader, initialize it immediately
    if (playlistDownloaderModule && typeof playlistDownloaderModule.initialize === 'function') {
      try {
        console.log("Initializing playlistDownloader early...");
        await playlistDownloaderModule.initialize();
        console.log("playlistDownloader initialized successfully");
      } catch (error) {
        console.warn("Error initializing playlistDownloader:", error);
      }
    }
    
    // Normalize paths for other optional modules
    const normalizedPaths = OPTIONAL_MODULES
      .filter(path => !path.includes('playlistDownloader')) // Skip playlistDownloader as it's loaded separately
      .map(path => {
        if (!path.startsWith('/static/js/') && !path.startsWith('./')) {
          return `/static/js/${path}`;
        }
        return path;
      });

    // Load other optional modules
    const modules = await moduleLoader.importModules(normalizedPaths, false, {
      concurrencyLimit: 2,
      timeout: 8000,
      standardizeExports: false, // Disable auto-export to prevent errors
      ignoreErrors: true // Continue even if some fail
    });
    
    // Extract module instances
    const optionalModuleInstances = {};
    
    for (const [moduleName, moduleExport] of Object.entries(modules)) {
      if (!moduleExport) {
        console.warn(`Optional module failed to load: ${moduleName}`);
        continue;
      }

      optionalModuleInstances[moduleName] = moduleExport;
      
      // Make global reference
      window[moduleName] = moduleExport;
      window.moduleInstances[moduleName] = moduleExport;
    }
    
    // Add playlistDownloader module if loaded
    if (playlistDownloaderModule) {
      optionalModuleInstances.playlistDownloader = playlistDownloaderModule;
      window.playlistDownloader = playlistDownloaderModule;
      window.moduleInstances.playlistDownloader = playlistDownloaderModule;
    }
    
    console.log("Optional modules loaded successfully");
    return optionalModuleInstances;
  } catch (error) {
    console.error("Error loading optional modules:", error);
    return {}; // Return empty object to continue initialization
  }
}

/**
 * Update the OPTIONAL_MODULES array to include playlistDownloader first
 * This makes it a priority for loading
 */
const OPTIONAL_MODULES = [
  './modules/features/playlistDownloader.js',  // Ensure this is first
  './modules/features/fileProcessor.js',
  './modules/features/webScraper.js',
  './modules/features/historyManager.js',
  './modules/features/academicSearch.js',
  './modules/utils/debugTools.js',
  './modules/utils/moduleDiagnostics.js'
];