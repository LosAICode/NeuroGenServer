/**
 * index.js
 * Main entry point for the NeuroGen Server frontend.
 * Initializes and connects all modules into a cohesive application.
 * 
 * Enhanced with:
 * 1. Improved module loading sequence with proper dependencies
 * 2. Better error handling and recovery mechanisms
 * 3. Streamlined initialization process
 * 4. Robust module dependency management
 * 5. Special handling for playlistDownloader and other critical modules
 * 6. Comprehensive diagnostics and recovery options
 * 7. Performance tracking and optimization
 * 8. Enhanced event handling for module communication
 */

// Track initialization start time for performance metrics
window.performanceStartTime = Date.now();

// Import module diagnostics for better error detection and reporting
import moduleDiagnostics from './modules/utils/moduleDiagnostics.js';

// Import moduleLoader with only the methods we need
import moduleLoader from './modules/core/moduleLoader.js';
import themeManager from './modules/core/themeManager.js';

// Initialize module diagnostics early
const diagnostics = moduleDiagnostics();
console.log("Module diagnostics initialized");

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
];

const OPTIONAL_MODULES = [
  './modules/features/fileProcessor.js',
  './modules/features/webScraper.js',  
  './modules/features/historyManager.js',
  './modules/features/academicSearch.js',
  './modules/features/playlistDownloader.js',
  './modules/features/keyboardShortcuts.js',
  './modules/features/dragDropHandler.js',
  './modules/utils/systemHealth.js',
  './modules/utils/debugTools.js',
  './modules/utils/moduleDiagnostics.js'
];

// Module dependencies - inform moduleLoader about dependencies
const MODULE_DEPENDENCIES = {
  'playlistDownloader.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
  'webScraper.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
  'fileProcessor.js': ['progressHandler.js', 'ui.js'],
  'progressHandler.js': ['socketHandler.js'],
  'academicSearch.js': ['webScraper.js'],
  'keyboardShortcuts.js': ['ui.js'],
  'dragDropHandler.js': ['utils.js', 'ui.js', 'domUtils.js'],
  'systemHealth.js': ['domUtils.js']
};

// --------------------------------------------------------------------------
// Module Path Overrides – ensures consistent path resolution
// --------------------------------------------------------------------------
const MODULE_PATH_OVERRIDES = {
  './modules/features/playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
  'playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
  './playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js'
};

// Make loaded modules available globally for backward compatibility
window.moduleInstances = {};

// Track initialization state
window.appInitialized = false;
window.appInitializationStarted = false;
window.themeManager = themeManager;

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

// Initialize diagnostics
const diagnosticsModule = diagnostics || null;

// Log after all modules are loaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (diagnosticsModule && typeof diagnosticsModule.logReport === 'function') {
      diagnosticsModule.logReport();
    }
  }, 2000); // Wait for modules to finish loading
});

// --------------------------------------------------------------------------
// Initialize immediately when module loads
// --------------------------------------------------------------------------
console.log("🔧 Index.js module loaded, waiting for DOM...");
console.log("📊 Document readyState:", document.readyState);

// Forward declarations - these functions are defined later in the file
let createErrorContainer;
let createLoadingOverlay;

// Assign the functions immediately to avoid hoisting issues
createErrorContainer = function() {
  let errorContainer = document.getElementById('app-loading-error');
  if (!errorContainer && document.body) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'app-loading-error';
    errorContainer.className = 'alert alert-danger m-3';
    errorContainer.style.display = 'none';
    document.body.appendChild(errorContainer);
  }
  return errorContainer;
};

createLoadingOverlay = function() {
  // This will be properly defined later, for now just log
  console.log("📋 Loading overlay requested (function will be defined later)");
};

// --------------------------------------------------------------------------
// Document Ready – Application Initialization
// --------------------------------------------------------------------------
async function initializeApp() {
  console.log("🚀 Starting app initialization...");
  console.log("Initial localStorage theme:", localStorage.getItem('theme'));
  window.appInitializationStarted = true;
  
  // Create an error container early for any startup errors
  createErrorContainer();
  
  // Create loading overlay to show initialization progress
  createLoadingOverlay();
  
  try {
    // Initialize module loader with enhanced settings
    const isDevEnvironment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    // Set up dependency configuration
    moduleLoader.MODULE_DEPENDENCIES = MODULE_DEPENDENCIES;
    
    moduleLoader.initialize({
      debug: isDevEnvironment,
      verboseLogging: isDevEnvironment,
      timeout: 10000,          // Longer timeout for module loading
      clearFailedModules: true, // Clear any previously failed modules
      maxRetries: 3,           // Increase retries for better reliability
      concurrencyLimit: 3      // Limit concurrent loading for stability
    });
    
    // Apply path overrides
    Object.entries(MODULE_PATH_OVERRIDES).forEach(([path, target]) => {
      moduleLoader.PATH_OVERRIDES[path] = target;
    });
    
    // Fix any previously failed modules
    if (moduleLoader.failedModules && moduleLoader.failedModules.size > 0) {
      console.log("Fixing previously failed modules before loading");
      moduleLoader.fixFailedModules();
    }
    
    console.log("NeuroGen module system loaded successfully!");

    // Apply stored theme immediately for better user experience
    applyStoredTheme();

    // Set up basic fallback event handlers for early UI interaction
    setupBasicEventHandlers();

    // Start a timeout for error detection with recovery mode
    const initTimeout = setTimeout(() => {
      if (!window.appInitialized) {
        console.warn("App not initialized after 10 seconds, activating recovery mode");
        const availableModules = Object.keys(window.moduleInstances);
        console.log("Available modules:", availableModules);
        setupRecoveryMode();
      }
    }, 10000);

    // Set up error handlers to catch global errors
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Sequential module loading for better dependency management
    console.log("Starting module loading sequence...");
    
    // Step 1: Load core modules (required)
    const coreModules = await loadCoreModules();
    updateLoadingProgress(20, "Core modules loaded");
    
    if (!coreModules) {
      throw new Error("Failed to load core modules");
    }
    
    // Step 2: Load utility modules, as they're required by most features
    const utilModules = await loadUtilityModulesWithRetry();
    updateLoadingProgress(40, "Utility modules loaded");
    
    if (!utilModules) {
      console.warn("Some utility modules failed to load, continuing with fallbacks");
    }
    
    // Step 3: Load feature modules (app and UI functionality)
    const featureModules = await loadFeatureModules();
    updateLoadingProgress(60, "Feature modules loaded");
    
    // Step 4: Load the UI module specifically since it's likely to have issues
    const uiModule = await loadUiModule();
    if (uiModule) {
      featureModules.ui = uiModule;
      window.ui = uiModule;
      window.moduleInstances.ui = uiModule;
    }
    
    // Step 5: Initialize the application with loaded modules
    await initializeApplication(coreModules, featureModules, utilModules);
    updateLoadingProgress(80, "Application initialized");
    
    // Step 6: Load optional modules (including playlistDownloader) after main initialization
    const optionalModules = await loadOptionalModules();
    updateLoadingProgress(90, "Optional modules loaded");

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
    
    // Record initialization time for performance tracking
    const initTime = Date.now() - (window.performanceStartTime || 0);
    console.log(`App initialized in ${initTime}ms`);
    
    // Record performance metrics
    recordPerformanceMetrics();
    
    console.log('NeuroGen Server frontend initialized successfully');

    // Emit app.initialized event if eventRegistry is available
    if (coreModules.eventRegistry) {
      coreModules.eventRegistry.emit('app.initialized', { 
        timestamp: new Date().toISOString(),
        initTime
      });
    }
    
    // Verify important modules are loaded
    if (moduleLoader.checkModuleHealth) {
      const moduleHealthCheck = moduleLoader.checkModuleHealth();
      if (moduleHealthCheck && moduleHealthCheck.moduleIsFallback) {
        console.warn("Warning: Some critical modules are using fallback implementations");
      }
    }
    
    // Complete loading progress
    updateLoadingProgress(100, "Application loaded");
    
    // Remove loading overlay with a fade effect
    setTimeout(() => {
      removeLoadingOverlay();
    }, 500);
    
    // Add diagnostics button if in development mode
    if (isDevEnvironment) {
      setTimeout(() => {
        if (moduleLoader.createDiagnosticsButton) {
          moduleLoader.createDiagnosticsButton();
        } else {
          addDiagnosticsButton();
        }
      }, 1000);
    }
    
    // Enhance Socket.IO integration for playlist events
    setTimeout(() => {
      enhanceSocketIOIntegration();
    }, 1500);
  } catch (error) {
    console.error("Error during application initialization:", error);
    showErrorMessage("Application initialization failed: " + error.message);
    
    // Activate recovery mode
    await setupRecoveryMode();
    
    // Try direct activation of recovery mode in moduleLoader
    if (moduleLoader.activateRecoveryMode) {
      await moduleLoader.activateRecoveryMode();
    }
    
    // Remove loading overlay
    removeLoadingOverlay();
  }
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded, initialize immediately
  initializeApp();
}

// Also set a flag for the module loader in index.html
window.__appReady = true;

// --------------------------------------------------------------------------
// Error Handling Functions
// --------------------------------------------------------------------------

/**
 * Handle window errors and detect module loading issues
 * @param {ErrorEvent} event - The error event
 * @returns {boolean} - Whether the error was handled
 */
function handleWindowError(event) {
  // If we're in recovery mode, suppress additional errors
  if (window._inRecoveryMode) return true;
  
  console.error("Window error caught:", event.message);
  
  // Check if the error is related to module loading
  if (event.message && (
    event.message.includes('module') || 
    event.message.includes('import') || 
    event.message.includes('undefined') ||
    event.message.includes('is not a function') ||
    event.message.includes('Cannot read property')
  )) {
    // This could be a module loading issue, trigger recovery
    setupRecoveryMode();
    
    // Prevent default handling to keep console cleaner
    event.preventDefault();
    return true;
  }
  
  return false;
}

/**
 * Handle unhandled promise rejections
 * @param {PromiseRejectionEvent} event - The rejection event
 * @returns {boolean} - Whether the rejection was handled
 */
function handleUnhandledRejection(event) {
  // If we're in recovery mode, suppress additional errors
  if (window._inRecoveryMode) return true;
  
  console.error("Unhandled promise rejection:", event.reason);
  
  // Check if rejection is related to module loading
  const reason = event.reason ? (event.reason.toString ? event.reason.toString() : String(event.reason)) : '';
  
  if (reason.includes('module') || 
      reason.includes('import') || 
      reason.includes('failed') ||
      reason.includes('is not a function') ||
      reason.includes('Cannot read property')) {
    // This could be a module loading issue, trigger recovery
    setupRecoveryMode();
    
    // Prevent default handling
    event.preventDefault();
    return true;
  }
  
  return false;
}

// --------------------------------------------------------------------------
// Core Module Loader Functions
// --------------------------------------------------------------------------

/**
 * Load core modules with optimized loading and error handling
 * @returns {Promise<Object>} - Loaded core modules
 */
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
      retries: 3,
      timeout: 8000,
      standardizeExports: true,
      clearFailedModules: true
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
 * Load utility modules with enhanced retry mechanism and special handling
 * @returns {Promise<Object>} - Loaded utility modules
 */
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
      retries: 3,
      timeout: 15000, // Increased from 6000ms to 15000ms
      standardizeExports: true,
      clearFailedModules: true
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
        const progressHandler = await moduleLoader.ensureModule('progressHandler', {
          retries: 3,
          timeout: 8000,
          required: true
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
        const socketHandler = await moduleLoader.ensureModule('socketHandler', {
          retries: 3,
          timeout: 8000,
          required: true
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
 * Load feature modules with enhanced handling
 * @returns {Promise<Object>} - Loaded feature modules
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
      retries: 2,
      timeout: 15000, // Increased from 6000ms to 15000ms
      standardizeExports: true
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
      const safeFileProcessor = await moduleLoader.loadModule('./modules/utils/safeFileProcessor.js', {
        retries: 2,
        timeout: 5000
      });
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
        const fileProcessor = await moduleLoader.loadModule('./modules/features/fileProcessor.js', {
          retries: 2,
          timeout: 5000
        });
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

/**
 * Special handling for UI module which had redeclaration issues
 * @returns {Promise<Object>} - Loaded UI module or fallback
 */
async function loadUiModule() {
  console.log("Loading UI module with special handling...");
  
  try {
    const modulePath = './modules/utils/ui.js';
    
    // Try to load the UI module with multiple retries
    const uiModule = await moduleLoader.ensureModule('ui', {
      retries: 3,
      timeout: 5000,
      standardizeExports: true,
      clearFailedModules: true
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

/**
 * Load optional modules with special handling for critical modules like playlistDownloader
 * @returns {Promise<Object>} - Loaded optional modules
 */
async function loadOptionalModules() {
  console.log("Loading optional modules...");
  
  // Clear any failed modules before attempting to load
  if (moduleLoader.failedModules && moduleLoader.failedModules.size > 0) {
    console.log(`Clearing ${moduleLoader.failedModules.size} failed modules before loading`);
    moduleLoader.fixFailedModules();
  }
  
  try {
    // Special handling for playlistDownloader since it's a critical module
    const playlistDownloaderModule = await loadPlaylistDownloaderSafely();
    
    // Special handling for webScraper since it may have issues
    const webScraperModule = await loadWebScraperSafely();
    
    // Special handling for academicSearch module (common issue reported)
    const academicSearchModule = await loadAcademicSearchSafely();
    
    // Normalize paths for other optional modules
    const normalizedPaths = OPTIONAL_MODULES
      .filter(path => !path.includes('playlistDownloader') && 
                      !path.includes('webScraper') && 
                      !path.includes('academicSearch')) 
      .map(path => {
        if (!path.startsWith('/static/js/') && !path.startsWith('./')) {
          return `/static/js/${path}`;
        }
        return path;
      });

    // Load other optional modules
    const modules = await moduleLoader.importModules(normalizedPaths, false, {
      concurrencyLimit: 2,
      timeout: 15000, // Increased from 8000ms to 15000ms
      standardizeExports: true, 
      retries: 2,
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
    
    // Add specifically loaded modules if they succeeded
    if (webScraperModule) {
      optionalModuleInstances.webScraper = webScraperModule;
      window.webScraper = webScraperModule;
      window.moduleInstances.webScraper = webScraperModule;
    }
    
    if (playlistDownloaderModule) {
      optionalModuleInstances.playlistDownloader = playlistDownloaderModule;
      window.playlistDownloader = playlistDownloaderModule;
      window.moduleInstances.playlistDownloader = playlistDownloaderModule;
    }
    
    if (academicSearchModule) {
      optionalModuleInstances.academicSearch = academicSearchModule;
      window.academicSearch = academicSearchModule;
      window.moduleInstances.academicSearch = academicSearchModule;
    }
    
    console.log("Optional modules loaded successfully");
    return optionalModuleInstances;
  } catch (error) {
    console.error("Error loading optional modules:", error);
    return {}; // Return empty object to continue initialization
  }
}

/**
 * Special loader for academicSearch module
 * @returns {Promise<Object>} - Loaded academicSearch module or fallback
 */
async function loadAcademicSearchSafely() {
  try {
    console.log("Loading academicSearch module carefully...");
    
    // Try to load dependencies first - webScraper is a dependency
    await moduleLoader.ensureModule('webScraper', {
      retries: 2,
      timeout: 8000
    });
    
    // Then try to load academicSearch with extra care
    const module = await moduleLoader.importModule('./modules/features/academicSearch.js', {
      retries: 2,
      timeout: 8000,
      standardizeExports: true,
      clearFailedModules: true
    });
    
    if (module) {
      console.log("academicSearch module loaded successfully");
      return module;
    } else {
      console.warn("academicSearch module failed to load, will use fallback");
      return createAcademicSearchFallback();
    }
  } catch (error) {
    console.error("Error loading academicSearch module:", error);
    return createAcademicSearchFallback();
  }
}

/**
 * Special loader function for the playlist downloader module
 * Handles various loading scenarios with fallbacks
 * @returns {Promise<Object>} - Loaded playlistDownloader module or fallback
 */
async function loadPlaylistDownloaderSafely() {
  try {
    console.log("Loading playlist downloader module with special handling...");
    
    // Check if we already have the module loaded
    if (window.playlistDownloader && typeof window.playlistDownloader.initialize === 'function') {
      console.log("PlaylistDownloader already loaded, using existing instance");
      return window.playlistDownloader;
    }
    
    // Try to load dependencies first
    await moduleLoader.ensureModule('socketHandler', {
      retries: 2,
      timeout: 8000
    });
    
    await moduleLoader.ensureModule('progressHandler', {
      retries: 2,
      timeout: 8000
    });
    
    await moduleLoader.ensureModule('ui', {
      retries: 2,
      timeout: 8000
    });
    
    // Define all potential paths to try in order
    const possiblePaths = [
      './modules/features/playlistDownloader.js',
      '/static/js/modules/features/playlistDownloader.js',
      'playlistDownloader.js',
      './modules/playlistDownloader.js'
    ];
    
    // Try each path in sequence until one succeeds
    for (const path of possiblePaths) {
      try {
        console.log(`Attempting to load playlistDownloader from: ${path}`);
        
        const playlistModule = await moduleLoader.importModule(path, {
          retries: 3,
          timeout: 10000,
          standardizeExports: true,
          clearFailedModules: true
        });
        
        if (playlistModule) {
          console.log(`Successfully loaded playlistDownloader from ${path}`);
          
          // Initialize if not already initialized
          if (typeof playlistModule.initialize === 'function' && 
              !(playlistModule.initialized || 
                (typeof playlistModule.isInitialized === 'function' && 
                 playlistModule.isInitialized()))) {
            try {
              console.log("Initializing playlistDownloader module");
              await playlistModule.initialize();
              console.log("playlistDownloader module initialized successfully");
            } catch (initError) {
              console.warn("Error initializing playlistDownloader module:", initError);
            }
          }
          
          return playlistModule;
        }
      } catch (loadError) {
        console.warn(`Failed to load from ${path}:`, loadError);
        // Continue to next path
      }
    }
    
    // If we get here, all paths failed - try using loadModuleWithDependencies
    try {
      console.log("Attempting to load playlistDownloader with dependencies...");
      const result = await moduleLoader.loadModule(
        './modules/features/playlistDownloader.js',
        {
          retries: 3,
          timeout: 10000,
          clearFailedModules: true
        }
      );
      
      if (result && result.module) {
        console.log("Successfully loaded playlistDownloader with dependencies");
        return result.module;
      }
    } catch (depError) {
      console.error("Failed to load playlistDownloader with dependencies:", depError);
    }
    
    // All approaches failed, create a fallback as last resort
    console.warn("All approaches failed for playlistDownloader, using fallback implementation");
    return moduleLoader.createPlaylistDownloaderFallback ? 
           moduleLoader.createPlaylistDownloaderFallback() : 
           createPlaylistDownloaderFallback();
  } catch (error) {
    console.error("Error in loadPlaylistDownloaderSafely:", error);
    return moduleLoader.createPlaylistDownloaderFallback ? 
           moduleLoader.createPlaylistDownloaderFallback() : 
           createPlaylistDownloaderFallback();
  }
}
