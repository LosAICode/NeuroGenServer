/**
 * index.js
 * Main entry point for the NeuroGen Server frontend.
 * Initializes and connects all modules into a cohesive application.
 * 
 * Enhancements:
 * 1. Improved module loading sequence with proper dependencies
 * 2. Better error handling and recovery mechanisms
 * 3. Streamlined initialization process
 * 4. Module dependency management
 * 5. Optimized module loading order for faster startup
 * 6. Circular dependency detection and resolution
 * 7. Proper handling of webScraper module
 * 8. Fixed function redeclaration issues
 * 9. Improved path resolution for module loading
 * 10. Enhanced playlistDownloader integration
 */

// Import moduleLoader as default only - we'll use its methods directly
import moduleLoader from './modules/core/moduleLoader.js';

// --------------------------------------------------------------------------
// Module Path Definitions – optimized for proper dependency loading
// --------------------------------------------------------------------------
const CORE_MODULES = [
  './modules/core/errorHandler.js',
  './modules/core/uiRegistry.js',
  './modules/core/stateManager.js',
  './modules/core/eventRegistry.js',
  './modules/core/eventManager.js',
  './modules/core/themeManager.js'
];

const FEATURE_MODULES = [
  './modules/core/app.js'    // Load app.js first but defer UI module
];

const UTILITY_MODULES = [
  './modules/utils/utils.js',
  './modules/utils/fileHandler.js',
  './modules/utils/progressHandler.js',
  './modules/utils/socketHandler.js'
  // Utility modules with explicit loading to ensure availability
];

const OPTIONAL_MODULES = [
  './modules/features/playlistDownloader.js',  // Ensure this is first - prioritize loading
  './modules/features/fileProcessor.js',
  './modules/features/webScraper.js',  // Now properly handled with special loading
  './modules/features/historyManager.js',
  './modules/features/academicSearch.js',
  './modules/utils/debugTools.js',
  './modules/utils/moduleDiagnostics.js'
];

// Make loaded modules available globally for backward compatibility
window.moduleInstances = {};

// Track initialization state
window.appInitialized = false;
window.appInitializationStarted = false;

// --------------------------------------------------------------------------
// Apply lockdown whitelisting if a lockdown function is present.
// --------------------------------------------------------------------------
if (typeof lockdown === 'function') {
  try {
    lockdown({
      whitelist: [
        'Promise', 'Array', 'Object', 'Function', 'JSON', 'Math',
        'Set', 'Map', 'URL', 'Error', 'String', 'Number',
        'setTimeout', 'clearTimeout', 'console', 'document',
        'window', 'localStorage', 'sessionStorage', 'fetch',
        'Date', 'RegExp', 'WebSocket', 'crypto'
      ]
    });
    console.log("Lockdown applied with whitelisted intrinsics");
  } catch (e) {
    console.error("Error applying lockdown:", e);
  }
} else {
  console.log("No lockdown function detected; proceeding without intrinsic whitelisting");
}

// --------------------------------------------------------------------------
// Document Ready – Application Initialization
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing NeuroGen Server frontend...');
  window.appInitializationStarted = true;
  
  // Create an error container early for any startup errors
  createErrorContainer();
  
  try {
    // Initialize module loader with debug mode if on localhost
    const isDevEnvironment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    moduleLoader.initialize({
      debug: isDevEnvironment,
      verboseLogging: isDevEnvironment,
      timeout: 10000          // Longer timeout for module loading
    });
    
    console.log("NeuroGen module system loaded successfully!");

    // Apply stored theme immediately for better user experience
    applyStoredTheme();

    // Set up basic fallback event handlers for early UI interaction
    setupBasicEventHandlers();

    // Start a timeout for error detection
    const initTimeout = setTimeout(() => {
      if (!window.appInitialized) {
        console.warn("App not initialized after 10 seconds, activating recovery mode");
        const availableModules = Object.keys(window.moduleInstances);
        console.log("Available modules:", availableModules);
        setupRecoveryMode();
      }
    }, 10000);

    // Sequential module loading for better dependency management
    console.log("Starting module loading sequence...");
    
    // Step 1: Load core modules (required)
    const coreModules = await loadCoreModules();
    if (!coreModules) {
      throw new Error("Failed to load core modules");
    }
    
    // Step 2: Load utility modules, as they're required by most features
    // Handle problematic modules with special loading
    const utilModules = await loadUtilityModulesWithRetry();
    if (!utilModules) {
      console.warn("Some utility modules failed to load, continuing with fallbacks");
    }
    
    // Step 3: Load feature modules (app and UI functionality)
    const featureModules = await loadFeatureModules();
    
    // Step 4: Load the UI module specifically since it's likely to have issues
    const uiModule = await loadUiModule();
    if (uiModule) {
      featureModules.ui = uiModule;
      window.ui = uiModule;
      window.moduleInstances.ui = uiModule;
    }
    
    // Step 5: Initialize the application with loaded modules
    await initializeApplication(coreModules, featureModules, utilModules);
    
    // Step 6: Load optional modules (including webScraper and playlistDownloader) after main initialization
    const optionalModules = await loadOptionalModules();

    // Step 7: Initialize optional modules
    await initializeOptionalModules(optionalModules, coreModules);

    // Step 8: Initialize module diagnostics if in development
    if (isDevEnvironment) {
      initializeModuleDiagnostics();
    }

    // Mark initialization complete
    document.body.classList.add('app-initialized');
    window.appInitialized = true;
    
    // Clear the timeout since initialization succeeded
    clearTimeout(initTimeout);
    
    console.log('NeuroGen Server frontend initialized successfully');

    // Emit app.initialized event if eventRegistry is available
    if (coreModules.eventRegistry) {
      coreModules.eventRegistry.emit('app.initialized', { timestamp: new Date().toISOString() });
    }
    
    // Remove loading overlay if it exists
    const loadingOverlay = document.getElementById('app-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => {
        loadingOverlay.remove();
      }, 500);
    }
    
    // Add diagnostics button if in development mode
    if (isDevEnvironment) {
      setTimeout(addDiagnosticsButton, 1000);
    }
  } catch (error) {
    console.error("Error during application initialization:", error);
    showErrorMessage("Application initialization failed: " + error.message);
    
    // Activate recovery mode
    if (moduleLoader.activateRecoveryMode) {
      await moduleLoader.activateRecoveryMode();
    }
    setupRecoveryMode();
  }
});

// --------------------------------------------------------------------------
// Core Module Loader Functions
// --------------------------------------------------------------------------
async function loadCoreModules() {
  console.log("Loading core modules...");

  try {
    // Import required core modules with proper path normalization
    const normalizedPaths = CORE_MODULES.map(path => {
      // Ensure consistent path format by adding /static/js/ prefix if needed
      if (!path.startsWith('/static/js/') && !path.startsWith('./')) {
        return `/static/js/${path}`;
      }
      return path;
    });

    // Import core modules with retry to ensure they load
    const modules = await moduleLoader.importModules(normalizedPaths, true, {
      retries: 2,
      timeout: 8000,
      // Important: This fixes the auto-creating exports error
      standardizeExports: false
    });

    // Extract module instances
    const coreModuleInstances = {};
    let allCoreModulesLoaded = true;

    for (const [moduleName, moduleExport] of Object.entries(modules)) {
      if (!moduleExport) {
        console.error(`Failed to load core module: ${moduleName}`);
        allCoreModulesLoaded = false;
        continue;
      }

      coreModuleInstances[moduleName] = moduleExport;
      
      // Make global reference
      window[moduleName] = moduleExport;
      window.moduleInstances[moduleName] = moduleExport;
    }

    if (!allCoreModulesLoaded) {
      throw new Error('Failed to load all required core modules');
    }

    console.log("Core modules loaded successfully");
    return coreModuleInstances;
  } catch (error) {
    console.error("Error loading core modules:", error);
    throw new Error(`Core module loading failed: ${error.message}`);
  }
}

/**
 * Load feature modules with enhanced safe file processor integration
 * @returns {Object} - Loaded feature modules
 */
async function loadFeatureModules() {
  console.log("Loading feature modules...");

  try {
    // Normalize paths
    const normalizedPaths = FEATURE_MODULES.map(path => {
      if (!path.startsWith('/static/js/') && !path.startsWith('./')) {
        return `/static/js/${path}`;
      }
      return path;
    });

    const modules = await moduleLoader.importModules(normalizedPaths, false, {
      retries: 1,
      timeout: 5000,
      standardizeExports: false // Disable auto-export to prevent errors
    });
    
    // Extract module instances
    const featureModuleInstances = {};
    
    for (const [moduleName, moduleExport] of Object.entries(modules)) {
      if (!moduleExport) {
        console.warn(`Feature module failed to load: ${moduleName}`);
        continue;
      }

      featureModuleInstances[moduleName] = moduleExport;
      
      // Make global reference
      window[moduleName] = moduleExport;
      window.moduleInstances[moduleName] = moduleExport;
    }
    
    // Load safe file processor wrapper
    try {
      console.log("Loading safe file processor wrapper...");
      const safeFileProcessor = await moduleLoader.loadModule('./modules/utils/safeFileProcessor.js');
      if (safeFileProcessor) {
        console.log("Safe file processor module loaded successfully");
        featureModuleInstances.fileProcessor = safeFileProcessor;
        window.fileProcessor = safeFileProcessor;
        window.moduleInstances.fileProcessor = safeFileProcessor;
      }
    } catch (safeFileProcessorError) {
      console.error("Error loading safe file processor:", safeFileProcessorError);
      
      // Try to fallback to regular fileProcessor if safe version fails
      try {
        console.log("Attempting fallback to standard fileProcessor...");
        const fileProcessor = await moduleLoader.loadModule('./modules/features/fileProcessor.js');
        if (fileProcessor) {
          console.log("Standard file processor loaded as fallback");
          featureModuleInstances.fileProcessor = fileProcessor;
          window.fileProcessor = fileProcessor;
          window.moduleInstances.fileProcessor = fileProcessor;
        }
      } catch (fileProcessorError) {
        console.error("Error loading standard file processor fallback:", fileProcessorError);
      }
    }
    
    console.log("Feature modules loaded successfully");
    return featureModuleInstances;
  } catch (error) {
    console.error("Error loading feature modules:", error);
    return {}; // Return empty object to continue initialization
  }
}

// Special handling for UI module which had redeclaration issues
async function loadUiModule() {
  console.log("Loading UI module with special handling...");
  
  try {
    const modulePath = './modules/utils/ui.js';
    
    // Try to load the UI module with multiple retries
    const uiModule = await moduleLoader.importModule(modulePath, {
      retries: 3,
      timeout: 5000,
      standardizeExports: false // Disable auto-export to prevent errors
    });
    
    if (uiModule) {
      console.log("UI module loaded successfully");
      return uiModule;
    } else {
      console.warn("UI module failed to load, using fallback");
      return createUiFallback();
    }
  } catch (error) {
    console.error("Error loading UI module:", error);
    return createUiFallback();
  }
}

// Basic UI fallback in case the module fails to load
function createUiFallback() {
  console.warn("Creating fallback for UI module");
  
  return {
    __isFallback: true,
    
    initialize() {
      console.warn("Using fallback UI module");
      return Promise.resolve(true);
    },
    
    showToast(title, message, type = 'info') {
      console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
      
      // Try to create a simple toast
      const toastContainer = document.getElementById('toast-container') || document.createElement('div');
      if (!toastContainer.id) {
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
      }
      
      const toast = document.createElement('div');
      toast.className = 'toast fade show';
      
      // Choose color based on type
      let headerClass = 'bg-primary';
      if (type === 'error' || type === 'danger') headerClass = 'bg-danger';
      if (type === 'success') headerClass = 'bg-success';
      if (type === 'warning') headerClass = 'bg-warning';
      
      toast.innerHTML = `
        <div class="toast-header ${headerClass} text-white">
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${message}</div>
      `;
      
      toastContainer.appendChild(toast);
      
      // Auto-remove toast after 5 seconds
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 150);
      }, 5000);
    },
    
    showLoading() {
      console.warn("Fallback UI showLoading called");
      return { hide: () => {} };
    },
    
    hideLoading() {
      return true;
    },
    
    updateProgressBarElement(progressBar, progress) {
      if (!progressBar) return;
      const percent = Math.round(progress);
      progressBar.style.width = `${percent}%`;
      progressBar.setAttribute('aria-valuenow', percent);
      progressBar.textContent = `${percent}%`;
    },
    
    updateProgressStatus(statusElement, message) {
      if (!statusElement) return;
      statusElement.textContent = message;
    }
  };
}

async function loadUtilityModulesWithRetry() {
  console.log("Loading utility modules with special handling...");
  
  try {
    // First try to load the standard utility modules
    const normalizedPaths = UTILITY_MODULES.map(path => {
      if (!path.startsWith('/static/js/') && !path.startsWith('./')) {
        return `/static/js/${path}`;
      }
      return path;
    });

    const modules = await moduleLoader.importModules(normalizedPaths, false, {
      concurrencyLimit: 2,
      retries: 2,
      timeout: 5000,
      standardizeExports: false // Disable auto-export to prevent errors
    });
    
    // Extract module instances
    const utilityModuleInstances = {};
    
    for (const [moduleName, moduleExport] of Object.entries(modules)) {
      if (!moduleExport) {
        console.warn(`Utility module failed to load: ${moduleName}`);
        continue;
      }

      utilityModuleInstances[moduleName] = moduleExport;
      
      // Make global reference
      window[moduleName] = moduleExport;
      window.moduleInstances[moduleName] = moduleExport;
    }
    
    // Explicitly check for progressHandler, since it's critical
    if (!utilityModuleInstances.progressHandler) {
      console.warn("progressHandler not loaded, attempting direct load");
      try {
        const progressHandler = await moduleLoader.importModule('./modules/utils/progressHandler.js', {
          retries: 3,
          timeout: 8000,
          standardizeExports: false
        });
        
        if (progressHandler) {
          console.log("Successfully loaded progressHandler directly");
          utilityModuleInstances.progressHandler = progressHandler;
          window.progressHandler = progressHandler;
          window.moduleInstances.progressHandler = progressHandler;
        }
      } catch (error) {
        console.error("Error directly loading progressHandler:", error);
      }
    }
    
    // Explicitly check for socketHandler, since it's critical
    if (!utilityModuleInstances.socketHandler) {
      console.warn("socketHandler not loaded, attempting direct load");
      try {
        const socketHandler = await moduleLoader.importModule('./modules/utils/socketHandler.js', {
          retries: 3,
          timeout: 8000,
          standardizeExports: false
        });
        
        if (socketHandler) {
          console.log("Successfully loaded socketHandler directly");
          utilityModuleInstances.socketHandler = socketHandler;
          window.socketHandler = socketHandler;
          window.moduleInstances.socketHandler = socketHandler;
        }
      } catch (error) {
        console.error("Error directly loading socketHandler:", error);
      }
    }
    
    console.log("Utility modules loaded successfully");
    return utilityModuleInstances;
  } catch (error) {
    console.error("Error loading utility modules:", error);
    return {}; // Return empty object to continue initialization
  }
}
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
 * With special handling for playlistDownloader and webScraper
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
    
    // Special handling for webScraper since it may have issues
    const webScraperModule = await loadWebScraperSafely();
    
    // Normalize paths for other optional modules
    const normalizedPaths = OPTIONAL_MODULES
      .filter(path => !path.includes('webScraper') && !path.includes('playlistDownloader')) // Skip modules loaded separately
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
    
    // Add webScraper module if loaded
    if (webScraperModule) {
      optionalModuleInstances.webScraper = webScraperModule;
      window.webScraper = webScraperModule;
      window.moduleInstances.webScraper = webScraperModule;
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

// Special handling for webScraper module
async function loadWebScraperSafely() {
  try {
    console.log("Loading webScraper module carefully...");
    
    // Attempt to load the webScraper module directly
    const modulePath = './modules/features/webScraper.js';
    const module = await moduleLoader.importModule(modulePath, {
      retries: 2,
      timeout: 10000, // Longer timeout for this complex module
      standardizeExports: false // Disable auto-export to prevent errors
    });
    
    if (module) {
      console.log("webScraper module loaded successfully");
      return module;
    } else {
      console.warn("webScraper module failed to load, will use fallback");
      return createWebScraperFallback();
    }
  } catch (error) {
    console.error("Error loading webScraper module:", error);
    return createWebScraperFallback();
  }
}

function createWebScraperFallback() {
  console.warn("Creating fallback for webScraper module");
  
  // Create a basic fallback that won't crash the app
  return {
    __isFallback: true,
    initialized: false,
    
    initialize() {
      console.warn("Using fallback webScraper module");
      this.initialized = true;
      
      // Setup event listeners for the UI
      this.setupListeners();
      
      return Promise.resolve(true);
    },
    
    setupListeners() {
      // Form submit
      const scraperForm = document.getElementById('scraper-form');
      if (scraperForm) {
        scraperForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleStartScraping();
        });
      }
      
      // Cancel button
      const cancelButton = document.getElementById('scraper-cancel-btn');
      if (cancelButton) {
        cancelButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleCancelScraping();
        });
      }
      
      // New task button
      const newTaskButton = document.getElementById('scraper-new-task-btn');
      if (newTaskButton) {
        newTaskButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.showForm();
        });
      }
      
      // Add URL button
      const addUrlButton = document.getElementById('add-scraper-url');
      if (addUrlButton) {
        addUrlButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.addUrlField();
        });
      }
      
      // Setting change handlers - delegated event
      const urlContainer = document.getElementById('scraper-urls-container');
      if (urlContainer) {
        urlContainer.addEventListener('change', (e) => {
          if (e.target.classList.contains('scraper-settings')) {
            this.handleSettingsChange(e.target);
          }
        });
      }
      
      // PDF switch
      const pdfSwitch = document.getElementById('process-pdf-switch');
      if (pdfSwitch) {
        pdfSwitch.addEventListener('change', () => {
          if (window.moduleInstances.stateManager) {
            window.moduleInstances.stateManager.setState({
              processPdf: pdfSwitch.checked
            });
          }
        });
      }
    },
    
    handleStartScraping() {
      showErrorMessage("Web scraper functionality is currently unavailable. Please try refreshing the page.");
      return false;
    },
    
    handleCancelScraping() {
      return false;
    },
    
    addUrlField() {
      const container = document.getElementById('scraper-urls-container');
      if (!container) return;
      
      const newField = document.createElement('div');
      newField.className = 'input-group mb-2';
      newField.innerHTML = `
        <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required>
        <select class="form-select scraper-settings" style="max-width: 160px;">
          <option value="full">Full Text</option>
          <option value="metadata">Metadata Only</option>
          <option value="title">Title Only</option>
          <option value="keyword">Keyword Search</option>
          <option value="pdf">PDF Download</option>
        </select>
        <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;">
        <button type="button" class="btn btn-outline-danger remove-url">
          <i class="fas fa-trash"></i>
        </button>
      `;
      
      container.appendChild(newField);
      
      // Add remove handler
      const removeBtn = newField.querySelector('.remove-url');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          newField.remove();
        });
      }
    },
    
    handleSettingsChange(select) {
      if (!select) return;
      
      const row = select.closest('.input-group');
      if (!row) return;
      
      const keywordField = row.querySelector('.scraper-keyword');
      if (!keywordField) return;
      
      // Show/hide keyword field based on selection
      if (select.value === 'keyword') {
        keywordField.style.display = '';
        keywordField.required = true;
      } else {
        keywordField.style.display = 'none';
        keywordField.required = false;
      }
      
      // Update PDF info section visibility
      this.updatePdfInfoSection();
    },
    
    updatePdfInfoSection() {
      const selects = document.querySelectorAll('.scraper-settings');
      const pdfInfoSection = document.getElementById('pdf-info-section');
      
      if (!pdfInfoSection) return;
      
      // Check if any select has "pdf" value
      const hasPdfOption = Array.from(selects).some(select => select.value === 'pdf');
      
      pdfInfoSection.classList.toggle('d-none', !hasPdfOption);
    },
    
    showForm() {
      console.warn("Fallback webScraper.showForm called");
      // Show a message in the UI if possible
      const container = document.querySelector('#scraper-container');
      
      // Show form container
      const formContainer = document.getElementById('scraper-form-container');
      const progressContainer = document.getElementById('scraper-progress-container');
      const resultsContainer = document.getElementById('scraper-results-container');
      
      if (formContainer) formContainer.style.display = 'block';
      if (formContainer) formContainer.classList.remove('d-none');
      if (progressContainer) progressContainer.style.display = 'none';
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultsContainer) resultsContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.classList.add('d-none');
      
      // Add warning message
      if (formContainer && !formContainer.querySelector('.scraper-warning')) {
        const warningAlert = document.createElement('div');
        warningAlert.className = 'alert alert-warning mb-3 scraper-warning';
        warningAlert.innerHTML = `
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Web Scraper Module Unavailable</strong>
          <p class="mb-0 mt-1">The web scraper module failed to load. Some functionality may be limited. Please refresh the page and try again.</p>
          <button class="btn btn-sm btn-primary mt-2" onclick="window.location.reload()">Refresh Page</button>
        `;
        
        formContainer.prepend(warningAlert);
      }
    },
    
    showProgress() {
      return false;
    },
    
    handleTaskCompleted() {
      return false;
    },
    
    handleTaskError() {
      return false;
    },
    
    updatePdfDownloadsList() {
      return false;
    },
    
    handleOpenOutput() {
      return false;
    }
  };
}

// --------------------------------------------------------------------------
// Application Initialization Functions
// --------------------------------------------------------------------------
/**
 * Initialize application with enhanced safe file processor integration
 * @param {Object} coreModules - Core modules
 * @param {Object} featureModules - Feature modules
 * @param {Object} utilModules - Utility modules
 * @returns {Promise<boolean>} - Success state
 */
async function initializeApplication(coreModules, featureModules, utilModules) {
  console.log("Initializing application...");

  try {
    // Initialize fileProcessor safely first to ensure DOM is ready for other modules
    if (featureModules.fileProcessor && featureModules.fileProcessor.initializeSafe) {
      try {
        console.log("Initializing file processor safely...");
        await featureModules.fileProcessor.initializeSafe();
        console.log("File processor safely initialized");
      } catch (fileProcessorError) {
        console.error("Failed to safely initialize file processor:", fileProcessorError);
      }
    } else {
      console.warn("Safe file processor not available, will use standard initialization");
    }
    
    // Initialize core modules in specific order for proper dependency management
    if (coreModules.errorHandler && typeof coreModules.errorHandler.initialize === 'function') {
      await coreModules.errorHandler.initialize();
      console.log("Error handler initialized");
    }
    
    if (coreModules.uiRegistry && typeof coreModules.uiRegistry.initialize === 'function') {
      await coreModules.uiRegistry.initialize();
      console.log("UI Registry initialized");
    }
    
    if (coreModules.stateManager && typeof coreModules.stateManager.initialize === 'function') {
      await coreModules.stateManager.initialize({
        version: '1.0.0',
        initialized: true,
        theme: localStorage.getItem('theme') || 'light'
      });
      console.log("State manager initialized");
    }
    
    if (coreModules.eventRegistry && typeof coreModules.eventRegistry.initialize === 'function') {
      await coreModules.eventRegistry.initialize();
      console.log("Event registry initialized");
    }
    
    if (coreModules.eventManager && typeof coreModules.eventManager.initialize === 'function') {
      await coreModules.eventManager.initialize();
      console.log("Event manager initialized");
    }

    if (coreModules.themeManager && typeof coreModules.themeManager.initialize === 'function') {
      await coreModules.themeManager.initialize();
      console.log("Theme manager initialized");
    }
    
    // Initialize UI utility module
    if (featureModules.ui && typeof featureModules.ui.initialize === 'function') {
      await featureModules.ui.initialize();
      console.log("UI utility initialized");
    }
    
    // Initialize utility modules in a specific order
    
    // First initialize socketHandler since it's needed by progressHandler
    if (utilModules.socketHandler && typeof utilModules.socketHandler.initialize === 'function' && !utilModules.socketHandler.initialized) {
      try {
        await utilModules.socketHandler.initialize();
        console.log("Socket handler initialized");
      } catch (err) {
        console.warn(`Error initializing socketHandler:`, err);
      }
    }
    
    // Then initialize progressHandler which depends on socketHandler
    if (utilModules.progressHandler && typeof utilModules.progressHandler.initialize === 'function' && !utilModules.progressHandler.initialized) {
      try {
        await utilModules.progressHandler.initialize();
        console.log("Progress handler initialized");
      } catch (err) {
        console.warn(`Error initializing progressHandler:`, err);
      }
    }
    
    // Initialize the rest of utility modules
    for (const [moduleName, module] of Object.entries(utilModules)) {
      // Skip the modules we've already initialized
      if (moduleName === 'socketHandler' || moduleName === 'progressHandler') continue;
      
      if (module && typeof module.initialize === 'function' && !module.initialized) {
        try {
          await module.initialize();
          console.log(`${moduleName} utility initialized`);
        } catch (err) {
          console.warn(`Error initializing ${moduleName}:`, err);
        }
      }
    }
    
    // Finally initialize the main app module
    if (featureModules.app && typeof featureModules.app.initialize === 'function') {
      await featureModules.app.initialize();
      console.log("App module initialized");
    } else {
      console.warn("App module not available or missing initialize method");
    }

    // Re-check fileProcessor to ensure it's fully initialized 
    if (featureModules.fileProcessor && 
        typeof featureModules.fileProcessor.initialize === 'function' && 
        !featureModules.fileProcessor.initialized) {
      try {
        // Try standard initialization if safe initialization was not available
        console.log("Performing standard initialization for fileProcessor as fallback...");
        await featureModules.fileProcessor.initialize();
        console.log("File processor initialized through standard method");
      } catch (fileProcessorError) {
        console.warn("Could not initialize fileProcessor through standard method:", fileProcessorError);
      }
    }
    
    // Check for ongoing tasks from previous sessions
    checkForOngoingTasks();

    console.log("Core application initialized successfully");
    
    // Show success message if UI is available
    if (featureModules.ui && typeof featureModules.ui.showToast === 'function') {
      featureModules.ui.showToast('Ready', 'NeuroGen Server initialized successfully', 'success');
    }

    return true;
  } catch (error) {
    console.error("Error initializing application:", error);
    showErrorMessage(`Application initialization error: ${error.message}`);
    throw error;
  }
}

// PATCH 4: Enhanced initializeOptionalModules function
async function initializeOptionalModules(optionalModules, coreModules) {
  console.log("Initializing optional modules...");
  
  if (!optionalModules || Object.keys(optionalModules).length === 0) {
    console.log("No optional modules to initialize");
    return true;
  }
  
  try {
    // Priority initialization for critical modules
    const priorityModules = ['historyManager', 'playlistDownloader', 'fileProcessor'];
    
    // First initialize priority modules in specific order
    for (const moduleName of priorityModules) {
      const module = optionalModules[moduleName];
      if (module && typeof module.initialize === 'function' && 
          !(module.initialized || (typeof module.isInitialized === 'function' && module.isInitialized()))) {
        try {
          await module.initialize();
          console.log(`Priority module ${moduleName} initialized`);
        } catch (err) {
          console.warn(`Error initializing priority module ${moduleName}:`, err);
        }
      }
    }
    
    // Initialize other modules
    for (const [moduleName, module] of Object.entries(optionalModules)) {
      // Skip priority modules since we already handled them
      if (priorityModules.includes(moduleName)) continue;
      
      if (module && typeof module.initialize === 'function' && 
          !(module.initialized || (typeof module.isInitialized === 'function' && module.isInitialized()))) {
        try {
          await module.initialize();
          console.log(`${moduleName} initialized`);
        } catch (err) {
          console.warn(`Error initializing ${moduleName}:`, err);
        }
      }
    }
    
    // Connect UI registry with modules if possible
    if (coreModules.uiRegistry && typeof coreModules.uiRegistry.registerUIElements === 'function') {
      try {
        coreModules.uiRegistry.registerUIElements();
        console.log("UI elements registered with UI registry");
      } catch (error) {
        console.warn("Error registering UI elements:", error);
      }
    }
    
    // Connect event registry with modules if possible
    if (coreModules.eventRegistry && typeof coreModules.eventRegistry.registerEvents === 'function') {
      try {
        coreModules.eventRegistry.registerEvents();
        console.log("Events registered with event registry");
      } catch (error) {
        console.warn("Error registering events:", error);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error initializing optional modules:", error);
    return false; // Continue even if optional modules fail
  }
}

function initializeModuleDiagnostics() {
  try {
    const moduleDiagnosticsModule = window.moduleInstances.moduleDiagnostics;
    
    if (moduleDiagnosticsModule) {
      if (typeof moduleDiagnosticsModule.initializeModuleDiagnostics === 'function') {
        moduleDiagnosticsModule.initializeModuleDiagnostics();
        console.log("Module diagnostics initialized directly");
        return true;
      }
    }
    
    // Try moduleLoader's initializeModuleDiagnostics method
    if (moduleLoader.initializeModuleDiagnostics) {
      moduleLoader.initializeModuleDiagnostics();
      console.log("Module diagnostics initialized via moduleLoader");
      return true;
    }
    
    // Fallback - create a simple diagnostics function
    window.launchDiagnostics = function() {
      console.log("Basic diagnostics:");
      console.log("- Loaded modules:", Object.keys(window.moduleInstances));
      console.log("- Total modules:", Object.keys(window.moduleInstances).length);
      
      // Create system health report
      const report = {
        status: 'unknown',
        loadedModules: Object.keys(window.moduleInstances),
        failedModules: moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [],
        browser: navigator.userAgent,
        timestamp: new Date().toISOString(),
        appInitialized: window.appInitialized,
        moduleSystemHealth: moduleLoader.initialized ? 'ok' : 'error'
      };
      
      if (moduleLoader.generateHealthReport) {
        Object.assign(report, moduleLoader.generateHealthReport());
      }
      
      console.log("Module Health Report:", report);
      
      // Try to show a dialog with this information
      if (window.ui && typeof window.ui.showModal === 'function') {
        let reportContent = `<h5>System Health Report</h5>
        <div class="mb-3">
          <p><strong>Status:</strong> <span class="badge ${report.status === 'ok' ? 'bg-success' : 'bg-warning'}">${report.status}</span></p>
          <p><strong>App Initialized:</strong> ${window.appInitialized ? 'Yes' : 'No'}</p>
          <p><strong>Module System Health:</strong> ${report.moduleSystemHealth}</p>
          <p><strong>Timestamp:</strong> ${report.timestamp}</p>
        </div>
        <h6>Loaded Modules (${report.loadedModules.length})</h6>
        <ul class="small">
          ${report.loadedModules.map(m => `<li>${m}</li>`).join('')}
        </ul>`;
        
        if (report.failedModules && report.failedModules.length > 0) {
          reportContent += `<h6>Failed Modules (${report.failedModules.length})</h6>
          <ul class="small text-danger">
            ${report.failedModules.map(m => `<li>${m}</li>`).join('')}
          </ul>`;
        }
        
        window.ui.showModal({
          title: 'Module Diagnostics',
          content: reportContent,
          size: 'large',
          buttons: [
            {
              text: 'Close',
              type: 'btn-secondary',
              handler: () => {}
            },
            {
              text: 'Copy to Clipboard',
              type: 'btn-primary',
              handler: () => {
                try {
                  navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                  window.ui.showToast('Success', 'Report copied to clipboard', 'success');
                } catch (e) {
                  console.error('Failed to copy report:', e);
                  window.ui.showToast('Error', 'Failed to copy report', 'error');
                }
              }
            }
          ]
        });
      } else {
        alert("Basic diagnostics logged to console");
      }
    };
    
    console.log("Basic diagnostics available via window.launchDiagnostics()");
    return true;
  } catch (error) {
    console.warn("Error initializing module diagnostics:", error);
    return false;
  }
}

// PATCH 2: Update checkForOngoingTasks function for better playlist handling
function checkForOngoingTasks() {
  const taskId = sessionStorage.getItem('ongoingTaskId');
  const taskType = sessionStorage.getItem('ongoingTaskType');
  if (!taskId) return;

  console.log(`Found ongoing task: ${taskId} (${taskType})`);
  window.currentTaskId = taskId;

  // Try to resume the task
  try {
    const socketHandler = window.socketHandler || window.moduleInstances.socketHandler;
    if (socketHandler && typeof socketHandler.startStatusPolling === 'function') {
      socketHandler.startStatusPolling(taskId);
      console.log(`Started polling for task ${taskId}`);
      
      // For scraper tasks, show the progress UI
      if (taskType === 'scraper') {
        const webScraper = window.webScraper || window.moduleInstances.webScraper;
        if (webScraper && typeof webScraper.showProgress === 'function') {
          setTimeout(() => {
            webScraper.showProgress();
            console.log("Resumed web scraper progress UI");
          }, 1000); // Delay to ensure UI is ready
        }
      }
      
      // For file processing tasks
      if (taskType === 'file') {
        const fileProcessor = window.fileProcessor || window.moduleInstances.fileProcessor;
        if (fileProcessor && typeof fileProcessor.showProgress === 'function') {
          setTimeout(() => {
            fileProcessor.showProgress();
            console.log("Resumed file processor progress UI");
          }, 1000);
        }
      }
      
      // For playlist tasks - ENHANCED to handle initialization better
      if (taskType === 'playlist') {
        const playlistDownloader = window.playlistDownloader || window.moduleInstances.playlistDownloader;
        if (playlistDownloader) {
          // First ensure the module is initialized
          if (typeof playlistDownloader.initialize === 'function' && 
              typeof playlistDownloader.isInitialized === 'function' && 
              !playlistDownloader.isInitialized()) {
            // Initialize the module first
            setTimeout(async () => {
              try {
                await playlistDownloader.initialize();
                console.log("Initialized playlist downloader for task resumption");
                
                // Now show progress after initialization is complete
                setTimeout(() => {
                  if (typeof playlistDownloader.showProgress === 'function') {
                    playlistDownloader.showProgress();
                    console.log("Resumed playlist downloader progress UI");
                  }
                  
                  // Re-register event handlers to ensure they're properly set up
                  if (typeof playlistDownloader.registerEventHandlers === 'function') {
                    playlistDownloader.registerEventHandlers();
                  }
                }, 500);
              } catch (err) {
                console.error("Error initializing playlist downloader:", err);
              }
            }, 100);
          } else {
            // Module already initialized, just show progress
            setTimeout(() => {
              if (typeof playlistDownloader.showProgress === 'function') {
                playlistDownloader.showProgress();
                console.log("Resumed playlist downloader progress UI");
              }
              
              // Re-register event handlers to ensure they're properly set up
              if (typeof playlistDownloader.registerEventHandlers === 'function') {
                playlistDownloader.registerEventHandlers();
              }
            }, 1000);
          }
        }
      }
    } else {
      console.warn("Socket handler not available, can't resume task polling");
    }
  } catch (error) {
    console.error("Error resuming task:", error);
    // Clean up session storage since we couldn't resume
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
  }
}

// --------------------------------------------------------------------------
// Error Display & Recovery Mode Functions
// --------------------------------------------------------------------------
function createErrorContainer() {
  let errorContainer = document.getElementById('app-loading-error');
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'app-loading-error';
    errorContainer.className = 'alert alert-danger m-3';
    errorContainer.style.display = 'none';
    document.body.appendChild(errorContainer);
  }
  return errorContainer;
}

function showErrorMessage(message) {
  console.error(message);
  
  // Try to use UI module if available
  const uiModule = window.ui || window.moduleInstances.ui;
  if (uiModule && typeof uiModule.showToast === 'function') {
    uiModule.showToast('Error', message, 'error');
    return;
  }
  
  // Fallback to error container
  const appLoadingError = document.getElementById('app-loading-error');
  if (appLoadingError) {
    appLoadingError.textContent = message;
    appLoadingError.style.display = 'block';
    return;
  }
  
  // Last resort: create a new error element
  const errorElement = document.createElement('div');
  errorElement.id = 'app-loading-error';
  errorElement.className = 'alert alert-danger m-3';
  errorElement.textContent = message;
  document.body.prepend(errorElement);
}

function setupRecoveryMode() {
  console.log("Setting up recovery mode...");
  
  // Create recovery UI if it doesn't exist
  let recoveryContainer = document.getElementById('recovery-container');
  if (recoveryContainer) {
    recoveryContainer.style.display = 'block';
    return;
  }
  
  recoveryContainer = document.createElement('div');
  recoveryContainer.id = 'recovery-container';
  recoveryContainer.className = 'container mt-4';
  recoveryContainer.innerHTML = `
    <div class="alert alert-warning">
      <h4>Application Initialization Issue</h4>
      <p>Some functionality may not be available. Try refreshing the page or checking your network connection.</p>
      <button id="retry-initialization" class="btn btn-primary">Refresh Page</button>
      <button id="debug-info" class="btn btn-outline-secondary ms-2">Show Debug Info</button>
    </div>
    <div id="debug-container" class="card mt-3 d-none">
      <div class="card-header bg-dark text-white">Debug Information</div>
      <div class="card-body">
        <pre id="debug-info-content" class="small">Loading debug information...</pre>
      </div>
    </div>
  `;
  document.body.appendChild(recoveryContainer);
  
  // Setup retry button
  const retryButton = document.getElementById('retry-initialization');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      window.location.reload();
    });
  }
  
  // Setup debug info button
  const debugButton = document.getElementById('debug-info');
  const debugContainer = document.getElementById('debug-container');
  const debugContent = document.getElementById('debug-info-content');
  
  if (debugButton && debugContainer && debugContent) {
    debugButton.addEventListener('click', () => {
      debugContainer.classList.toggle('d-none');
      if (!debugContainer.classList.contains('d-none')) {
        // Generate health report if moduleLoader is available
        const debugInfo = {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          appInitialized: window.appInitialized,
          appInitializationStarted: window.appInitializationStarted,
          loadedModules: window.moduleInstances ? Object.keys(window.moduleInstances) : [],
          localStorage: Object.keys(localStorage),
          sessionStorage: Object.keys(sessionStorage)
        };
        
        // Try to add module health report
        if (moduleLoader && typeof moduleLoader.generateHealthReport === 'function') {
          debugInfo.moduleHealth = moduleLoader.generateHealthReport();
        }
        
        debugContent.textContent = JSON.stringify(debugInfo, null, 2);
      }
    });
  }
  
  // Setup basic tab navigation and theme toggle
  setupBasicEventHandlers();
}

// --------------------------------------------------------------------------
// Basic UI and Event Handlers
// --------------------------------------------------------------------------
function setupBasicEventHandlers() {
  // Setup theme toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle && !darkModeToggle._hasEventListener) {
    darkModeToggle.addEventListener('click', function() {
      const currentTheme = document.body.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      this.innerHTML = newTheme === 'dark' ?
        '<i class="fas fa-sun fa-lg"></i>' :
        '<i class="fas fa-moon fa-lg"></i>';
        
      // Notify theme manager if available
      try {
        if (window.moduleInstances.themeManager && typeof window.moduleInstances.themeManager.setTheme === 'function') {
          window.moduleInstances.themeManager.setTheme(newTheme);
        }
      } catch (error) {
        console.warn("Could not notify themeManager module of theme change:", error);
      }
    });
    darkModeToggle._hasEventListener = true;
  }
  
  // Setup tab navigation
  setupBasicTabNavigation();
  
  // Setup help mode toggle
  const helpToggle = document.getElementById('helpToggle');
  if (helpToggle && !helpToggle._hasEventListener) {
    helpToggle.addEventListener('click', function() {
      // Toggle help mode class on body
      document.body.classList.toggle('help-mode');
      
      // Toggle active class on button
      this.classList.toggle('active');
      
      // Notify help mode module if available
      try {
        if (window.moduleInstances.helpMode && typeof window.moduleInstances.helpMode.toggleHelpMode === 'function') {
          window.moduleInstances.helpMode.toggleHelpMode();
        }
      } catch (error) {
        console.warn("Could not notify helpMode module of toggle:", error);
      }
    });
    helpToggle._hasEventListener = true;
  }
  
  // Form submission blocking in recovery mode
  document.querySelectorAll('form').forEach(form => {
    if (!form._hasEventListener) {
      form.addEventListener('submit', function(e) {
        if (!window.appInitialized) {
          e.preventDefault();
          showErrorMessage("Application is not fully initialized. Please try refreshing the page.");
        }
      });
      form._hasEventListener = true;
    }
  });
}

function setupBasicTabNavigation() {
  // If already set up, don't do it again
  if (window._tabNavigationSetup) return;
  
  document.addEventListener('click', function(event) {
    if (event.target.hasAttribute('data-bs-toggle') &&
        event.target.getAttribute('data-bs-toggle') === 'tab') {
      event.preventDefault();
      const tabEl = event.target.closest('[data-bs-toggle="tab"]');
      if (!tabEl) return;
      const target = tabEl.getAttribute('data-bs-target') || tabEl.getAttribute('href');
      if (!target) return;
      
      // Deactivate all tabs
      document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.classList.remove('show');
      });
      
      // Activate selected tab
      tabEl.classList.add('active');
      const targetPane = document.querySelector(target);
      if (targetPane) {
        targetPane.classList.add('active');
        targetPane.classList.add('show');
      }
    }
  });
  
  window._tabNavigationSetup = true;
}

// Apply stored theme
function applyStoredTheme() {
  const storedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', storedTheme);
  document.body.setAttribute('data-theme', storedTheme);

  // Set theme toggle icon
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    const isDark = storedTheme === 'dark';
    darkModeToggle.innerHTML = isDark ? 
      '<i class="fas fa-sun fa-lg"></i>' : 
      '<i class="fas fa-moon fa-lg"></i>';
  }
}

// --------------------------------------------------------------------------
// Diagnostics Functions
// --------------------------------------------------------------------------
function addDiagnosticsButton() {
  try {
    // Check if button already exists
    if (document.getElementById('diagnostics-button')) {
      return;
    }
    
    // Create diagnostics button
    const diagnosticsButton = document.createElement('button');
    diagnosticsButton.innerHTML = '<i class="fas fa-chart-bar"></i>';
    diagnosticsButton.className = 'btn btn-sm btn-outline-primary position-fixed';
    diagnosticsButton.id = 'diagnostics-button';
    diagnosticsButton.title = 'Module Diagnostics';
    diagnosticsButton.style.bottom = '20px';
    diagnosticsButton.style.right = '20px';
    diagnosticsButton.style.zIndex = '1000';
    diagnosticsButton.style.opacity = '0.7';
    
    // Add hover effect
    diagnosticsButton.addEventListener('mouseenter', () => {
      diagnosticsButton.style.opacity = '1.0';
    });
    
    diagnosticsButton.addEventListener('mouseleave', () => {
      diagnosticsButton.style.opacity = '0.7';
    });
    
    // Add click handler
    diagnosticsButton.addEventListener('click', () => {
      if (window.launchDiagnostics) {
        window.launchDiagnostics();
      } else {
        alert('Diagnostics tool not available');
      }
    });
    
    // Add to body
    document.body.appendChild(diagnosticsButton);
  } catch (error) {
    console.warn("Could not add diagnostics button:", error);
  }
}

// --------------------------------------------------------------------------
// Performance Monitoring
// --------------------------------------------------------------------------
function startPerformanceMonitoring() {
  if (!window.performance || !window.performance.mark) {
    console.warn('Performance API not supported');
    return;
  }
  
  // Mark application load
  window.performance.mark('app_load_start');
  
  // Create performance observer to track long tasks
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      // Check if longtask is supported
      let supportedEntryTypes = [];
      
      if (PerformanceObserver.supportedEntryTypes) {
        supportedEntryTypes = PerformanceObserver.supportedEntryTypes;
      }
      
      // Only observe longtasks if supported
      if (supportedEntryTypes.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {  // Tasks taking more than 50ms
              console.warn(`Long task detected (${Math.round(entry.duration)}ms)`, entry);
            }
          }
        });
        
        observer.observe({ entryTypes: ['longtask'] });
      } else {
        console.log('LongTask performance monitoring not supported by this browser');
      }
    } catch (e) {
      console.warn('PerformanceObserver error:', e.message);
    }
  }
  
  // Track initialization time
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.appInitialized) {
        window.performance.mark('app_initialized');
        try {
          window.performance.measure('app_initialization_time', 'app_load_start', 'app_initialized');
          
          const measures = window.performance.getEntriesByName('app_initialization_time');
          if (measures && measures.length > 0) {
            const measure = measures[0];
            console.log(`App initialized in ${Math.round(measure.duration)}ms`);
          }
        } catch (e) {
          console.warn('Could not measure initialization time:', e.message);
        }
      }
    }, 100);
  });
}

// Start performance monitoring
startPerformanceMonitoring();

// --------------------------------------------------------------------------
// Version Information
// --------------------------------------------------------------------------
window.appVersion = '1.0.0';
window.appBuildDate = '2025-04-11';
window.appEnvironment = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
  ? 'development' 
  : 'production';

// --------------------------------------------------------------------------
// Polyfills and Browser Compatibility Checks
// --------------------------------------------------------------------------
function checkBrowserCompatibility() {
  const compatIssues = [];
  
  // Check for basic ES6 features
  if (!window.Promise) compatIssues.push('Promise API');
  if (!window.fetch) compatIssues.push('Fetch API');
  if (!window.Map) compatIssues.push('Map API');
  if (!window.Set) compatIssues.push('Set API');
  if (!window.Intl) compatIssues.push('Internationalization API');
  
  // Check for required Web APIs
  if (!window.localStorage) compatIssues.push('localStorage');
  if (!window.sessionStorage) compatIssues.push('sessionStorage');
  if (!window.WebSocket) compatIssues.push('WebSocket');
  
  // Check CSS features that we rely on
  const checkCSSFeature = (feature) => {
    try {
      return CSS.supports(feature);
    } catch (e) {
      return false;
    }
  };
  
  if (window.CSS && window.CSS.supports) {
    if (!checkCSSFeature('display: flex')) compatIssues.push('Flexbox');
    if (!checkCSSFeature('display: grid')) compatIssues.push('CSS Grid');
    if (!checkCSSFeature('--var: value')) compatIssues.push('CSS Variables');
  }
  
  // Report issues
  if (compatIssues.length > 0) {
    console.warn('Browser compatibility issues detected:', compatIssues);
    return false;
  }
  
  return true;
}

// Run compatibility check before initialization
if (!checkBrowserCompatibility()) {
  window.addEventListener('DOMContentLoaded', () => {
    showErrorMessage("Your browser may not support all features needed by this application. Please use a modern browser like Chrome, Firefox, or Edge.");
  });
}

// --------------------------------------------------------------------------
// Add favicon to head if missing
// --------------------------------------------------------------------------
function addFaviconLink() {
  if (!document.querySelector('link[rel="icon"]')) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = '/static/img/favicon.png';
    document.head.appendChild(link);
    
    console.log('Added missing favicon link');
  }
}

// Add favicon link on page load
window.addEventListener('DOMContentLoaded', addFaviconLink);

// --------------------------------------------------------------------------
// Module Export Check Helper
// --------------------------------------------------------------------------
function checkModuleExports(moduleName) {
  if (!window.moduleInstances[moduleName]) {
    console.warn(`Cannot check exports for ${moduleName}: module not loaded`);
    return false;
  }
  
  const module = window.moduleInstances[moduleName];
  
  // Check if the module has the expected structure
  const hasDefaultExport = typeof module === 'object' && module !== null;
  
  if (!hasDefaultExport) {
    console.warn(`Module ${moduleName} does not have proper structure`);
    return false;
  }
  
  // Check for __isFallback flag
  if (module.__isFallback) {
    console.warn(`Module ${moduleName} is using fallback implementation`);
    return false;
  }
  
  // Check for initialize method
  const hasInitialize = typeof module.initialize === 'function';
  if (!hasInitialize) {
    console.warn(`Module ${moduleName} is missing initialize() method`);
  }
  
  return true;
}
// --------------------------------------------------------------------------
// Setup Socket.IO Integration
// --------------------------------------------------------------------------
function setupSocketIO() {
  try {
    // Check if Socket.IO is available globally
    if (typeof io === 'undefined') {
      console.warn('Socket.IO client not available');
      return null;
    }
    
    // Check if socket is already initialized
    if (window.socket) {
      return window.socket;
    }
    
    // Create Socket.IO connection
    const socket = io({
      reconnectionAttempts: 5,
      timeout: 10000,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    // Setup basic event handlers
    socket.on('connect', () => {
      console.log('Socket.IO connected');
      
      // Update socket status indicator
      const statusIndicator = document.getElementById('socket-status');
      if (statusIndicator) {
        statusIndicator.classList.remove('connecting', 'disconnected');
        statusIndicator.classList.add('connected');
        const statusText = statusIndicator.querySelector('.socket-status-text');
        if (statusText) {
          statusText.textContent = 'Connected';
        }
      }
      
      // Show success toast if UI is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Server Connection', 'Connected to NeuroGen Server', 'success');
      }
      
      // Emit connection event if event registry is available
      if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
        window.moduleInstances.eventRegistry.emit('socket.connected', {
          timestamp: new Date().toISOString(),
          connectionId: socket.id
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      
      // Update socket status indicator
      const statusIndicator = document.getElementById('socket-status');
      if (statusIndicator) {
        statusIndicator.classList.remove('connected', 'connecting');
        statusIndicator.classList.add('disconnected');
        const statusText = statusIndicator.querySelector('.socket-status-text');
        if (statusText) {
          statusText.textContent = 'Disconnected';
        }
      }
      
      // Show warning toast if UI is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Server Connection', 'Disconnected from NeuroGen Server', 'warning');
      }
      
      // Emit disconnection event if event registry is available
      if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
        window.moduleInstances.eventRegistry.emit('socket.disconnected', {
          timestamp: new Date().toISOString()
        });
      }
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      
      // Update socket status indicator
      const statusIndicator = document.getElementById('socket-status');
      if (statusIndicator) {
        statusIndicator.classList.remove('connected', 'connecting');
        statusIndicator.classList.add('disconnected');
        const statusText = statusIndicator.querySelector('.socket-status-text');
        if (statusText) {
          statusText.textContent = 'Connection Error';
        }
      }
      
      // Show error toast if UI is available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Server Connection Error', 'Failed to connect to NeuroGen Server', 'error');
      }
      
      // Emit error event if event registry is available
      if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
        window.moduleInstances.eventRegistry.emit('socket.connection_error', {
          timestamp: new Date().toISOString(),
          error: error.toString()
        });
      }
    });
    
    socket.on('connect_timeout', () => {
      console.warn('Socket.IO connection timeout');
      
      // Update socket status indicator
      const statusIndicator = document.getElementById('socket-status');
      if (statusIndicator) {
        statusIndicator.classList.remove('connected', 'connecting');
        statusIndicator.classList.add('disconnected');
        const statusText = statusIndicator.querySelector('.socket-status-text');
        if (statusText) {
          statusText.textContent = 'Connection Timeout';
        }
      }
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket.IO reconnect attempt ${attemptNumber}`);
      
      // Update socket status indicator
      const statusIndicator = document.getElementById('socket-status');
      if (statusIndicator) {
        statusIndicator.classList.remove('connected', 'disconnected');
        statusIndicator.classList.add('connecting');
        const statusText = statusIndicator.querySelector('.socket-status-text');
        if (statusText) {
          statusText.textContent = `Reconnecting (${attemptNumber})...`;
        }
      }
    });
    
    // Setup progress update handler
    socket.on('progress_update', (data) => {
      try {
        console.log('Socket progress update:', data);
        
        // Find the task in progress handlers
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.updateTaskProgress === 'function') {
          window.moduleInstances.progressHandler.updateTaskProgress(
            data.task_id,
            data.progress,
            data.message,
            data.stats
          );
        }
        
        // Emit event via event registry
        if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
          window.moduleInstances.eventRegistry.emit('socket.progress_update', data);
        }
      } catch (error) {
        console.error('Error handling progress update:', error);
      }
    });
    
    // PATCH 3: Enhanced Socket.IO task_completed event handler
    socket.on('task_completed', (data) => {
      try {
        console.log('Socket task completed:', data);
        
        // Find the task in progress handlers
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.completeTask === 'function') {
          window.moduleInstances.progressHandler.completeTask(data.task_id, data);
        }
        
        // Emit event via event registry
        if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
          window.moduleInstances.eventRegistry.emit('socket.task_completed', data);
        }
        
        // Special handling for playlist tasks if needed
        const taskType = sessionStorage.getItem('ongoingTaskType');
        if ((taskType === 'playlist' || data.type === 'playlist') && data.task_id === window.currentTaskId) {
          const playlistDownloader = window.playlistDownloader || window.moduleInstances.playlistDownloader;
          if (playlistDownloader && typeof playlistDownloader.handlePlaylistCompletion === 'function') {
            // Use a short delay to allow other handlers to process first
            setTimeout(() => {
              try {
                playlistDownloader.handlePlaylistCompletion(data);
              } catch (err) {
                console.error("Error handling playlist completion:", err);
              }
            }, 100);
          }
        }
        
        // Clean up session storage if this task is the current task
        const currentTaskId = sessionStorage.getItem('ongoingTaskId');
        if (currentTaskId === data.task_id) {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
          sessionStorage.removeItem('taskStartTime');
        }
      } catch (error) {
        console.error('Error handling task completion:', error);
      }
    });
    
    // Setup task error handler
    socket.on('task_error', (data) => {
      try {
        console.error('Socket task error:', data);
        
        // Find the task in progress handlers
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.errorTask === 'function') {
          window.moduleInstances.progressHandler.errorTask(data.task_id, data.error || 'Unknown error');
        }
        
        // Emit event via event registry
        if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
          window.moduleInstances.eventRegistry.emit('socket.task_error', data);
        }
        
        // Clean up session storage if this task is the current task
        const currentTaskId = sessionStorage.getItem('ongoingTaskId');
        if (currentTaskId === data.task_id) {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
          sessionStorage.removeItem('taskStartTime');
        }
        
        // Show error toast if UI is available
        if (window.ui && typeof window.ui.showToast === 'function') {
          window.ui.showToast('Task Error', data.error || 'An error occurred with the task', 'error');
        }
      } catch (error) {
        console.error('Error handling task error event:', error);
      }
    });
    
    // Setup task cancelled handler
    socket.on('task_cancelled', (data) => {
      try {
        console.log('Socket task cancelled:', data);
        
        // Find the task in progress handlers
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.cancelTask === 'function') {
          window.moduleInstances.progressHandler.cancelTask(data.task_id);
        }
        
        // Emit event via event registry
        if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
          window.moduleInstances.eventRegistry.emit('socket.task_cancelled', data);
        }
        
        // Clean up session storage if this task is the current task
        const currentTaskId = sessionStorage.getItem('ongoingTaskId');
        if (currentTaskId === data.task_id) {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
          sessionStorage.removeItem('taskStartTime');
        }
        
        // Show info toast if UI is available
        if (window.ui && typeof window.ui.showToast === 'function') {
          window.ui.showToast('Task Cancelled', 'The task was cancelled', 'warning');
        }
      } catch (error) {
        console.error('Error handling task cancellation:', error);
      }
    });
    
    // Setup PDF download progress handler
    socket.on('pdf_download_progress', (data) => {
      try {
        console.log('PDF download progress:', data);
        
        // Emit event via event registry
        if (window.moduleInstances.eventRegistry && typeof window.moduleInstances.eventRegistry.emit === 'function') {
          window.moduleInstances.eventRegistry.emit('socket.pdf_download_progress', data);
        }
        
        // Update PDF downloads list in webScraper module
        if (window.moduleInstances.webScraper && typeof window.moduleInstances.webScraper.updatePdfDownloadsList === 'function') {
          window.moduleInstances.webScraper.updatePdfDownloadsList(data);
        }
      } catch (error) {
        console.error('Error handling PDF download progress:', error);
      }
    });
    
    // PATCH 5: Add event registry connection for playlist events
    // Create a bridge between Socket.IO and event registry specifically for playlist events
    if (window.moduleInstances.eventRegistry) {
      const eventRegistry = window.moduleInstances.eventRegistry;
      
      // Listen for playlist-specific progress updates
      socket.on('playlist_progress', (data) => {
        try {
          console.log('Playlist progress update:', data);
          eventRegistry.emit('socket.playlist_progress', data);
          
          // Also emit through standard progress channel for compatibility
          eventRegistry.emit('socket.progress_update', data);
        } catch (error) {
          console.error('Error handling playlist progress event:', error);
        }
      });
      
      // Listen for playlist-specific completion
      socket.on('playlist_completed', (data) => {
        try {
          console.log('Playlist completed:', data);
          eventRegistry.emit('socket.playlist_completed', data);
          
          // Also route through standard task_completed for compatibility
          eventRegistry.emit('socket.task_completed', {
            ...data,
            type: 'playlist'
          });
          
          // Special direct handling for playlist downloader
          const playlistDownloader = window.playlistDownloader || window.moduleInstances.playlistDownloader;
          if (playlistDownloader && typeof playlistDownloader.handlePlaylistCompletion === 'function') {
            setTimeout(() => {
              try {
                playlistDownloader.handlePlaylistCompletion(data);
              } catch (err) {
                console.error("Error directly handling playlist completion:", err);
              }
            }, 100);
          }
        } catch (error) {
          console.error('Error handling playlist completion event:', error);
        }
      });
      
      // Listen for playlist-specific errors
      socket.on('playlist_error', (data) => {
        try {
          console.error('Playlist error:', data);
          eventRegistry.emit('socket.playlist_error', data);
          
          // Also route through standard task_error for compatibility
          eventRegistry.emit('socket.task_error', {
            ...data,
            type: 'playlist'
          });
        } catch (error) {
          console.error('Error handling playlist error event:', error);
        }
      });
    }
    
    // Store socket instance globally
    window.socket = socket;
    
    return socket;
  } catch (error) {
    console.error('Error setting up Socket.IO:', error);
    return null;
  }
}

// Setup Socket.IO connection on page load
window.addEventListener('DOMContentLoaded', () => {
  // Only show the socket status indicator once
  const socketStatus = document.getElementById('socket-status');
  if (socketStatus) {
    socketStatus.classList.remove('d-none');
  }
  
  // Attempt to set up Socket.IO after a short delay to allow page to render
  setTimeout(() => {
    setupSocketIO();
  }, 1000);
});

// --------------------------------------------------------------------------
// File System and File Management Helpers
// --------------------------------------------------------------------------
function requestSystemDirectory() {
  try {
    if (window.showDirectoryPicker && window.moduleInstances.fileHandler) {
      return window.moduleInstances.fileHandler.requestSystemDirectory();
    } else {
      // Fallback for browsers without showDirectoryPicker
      const input = document.getElementById('folder-input') || document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.directory = true;
      input.multiple = true;
      input.click();
      
      return new Promise((resolve) => {
        input.onchange = () => {
          if (input.files && input.files.length > 0) {
            resolve({
              files: Array.from(input.files),
              directory: input.files[0].webkitRelativePath.split('/')[0]
            });
          } else {
            resolve(null);
          }
        };
      });
    }
  } catch (error) {
    console.error('Error requesting system directory:', error);
    return Promise.reject(error);
  }
}

// --------------------------------------------------------------------------
// Exported API
// --------------------------------------------------------------------------
export default {
  version: window.appVersion,
  
  /**
   * Load a module by path.
   * @param {string} path - Module path.
   * @returns {Promise<Object>} - Loaded module.
   */
  loadModule: async (path) => {
    return moduleLoader.importModule(path);
  },
  
  /**
   * Get a loaded module by name.
   * @param {string} name - Module name.
   * @returns {Object|null} - Module or null if not loaded.
   */
  getModule: (name) => {
    return window.moduleInstances[name] || null;
  },
  
  /**
   * Run module diagnostics to check system health
   * @returns {Promise<Object>} - Diagnostics report
   */
  runDiagnostics: async () => {
    if (window.diagnostics && typeof window.diagnostics.runDiagnostics === 'function') {
      return window.diagnostics.runDiagnostics();
    }
    
    if (moduleLoader && typeof moduleLoader.generateHealthReport === 'function') {
      return moduleLoader.generateHealthReport();
    }
    
    return {
      status: 'unknown',
      reason: 'Diagnostics tools not available',
      loadedModules: Object.keys(window.moduleInstances || {})
    };
  },
  
  /**
   * Reset the module system (useful for debugging)
   */
  resetModuleSystem: async () => {
    if (moduleLoader && typeof moduleLoader.clearCache === 'function') {
      moduleLoader.clearCache();
      return true;
    }
    return false;
  },
  
  /**
   * Show the diagnostics panel
   */
  showDiagnostics: () => {
    if (window.launchDiagnostics) {
      window.launchDiagnostics();
      return true;
    }
    return false;
  },
  
  /**
   * Check if a module follows the standard export pattern
   */
  checkModuleExports,
  
  /**
   * Initialize the socket connection
   */
  initializeSocket: () => {
    return setupSocketIO();
  },
  
  /**
   * Request a directory from the file system
   */
  requestDirectory: () => {
    return requestSystemDirectory();
  },
  
  /**
   * Get the theme manager instance
   */
  getThemeManager: () => {
    return window.moduleInstances.themeManager || null;
  },
  
  /**
   * Get the event registry instance
   */
  getEventRegistry: () => {
    return window.moduleInstances.eventRegistry || null;
  },
  
  /**
   * Get the state manager instance
   */
  getStateManager: () => {
    return window.moduleInstances.stateManager || null;
  }
};