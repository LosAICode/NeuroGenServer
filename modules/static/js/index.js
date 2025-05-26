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
  './modules/utils/debugTools.js',
  './modules/utils/moduleDiagnostics.js'
];

// Module dependencies - inform moduleLoader about dependencies
const MODULE_DEPENDENCIES = {
  'playlistDownloader.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
  'webScraper.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
  'fileProcessor.js': ['progressHandler.js', 'ui.js'],
  'progressHandler.js': ['socketHandler.js'],
  'academicSearch.js': ['webScraper.js']
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
// Document Ready – Application Initialization
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Page initialization started");
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
});

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
      timeout: 6000,
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
      timeout: 6000,
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
      timeout: 8000,
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
      const result = await moduleLoader.loadModuleWithDependencies(
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

/**
 * Special handling for webScraper module
 * @returns {Promise<Object>} - Loaded webScraper module or fallback
 */
async function loadWebScraperSafely() {
  try {
    console.log("Loading webScraper module carefully...");
    
    // Try to load dependencies first
    await moduleLoader.ensureModule('progressHandler', {
      retries: 2,
      timeout: 8000
    });
    
    await moduleLoader.ensureModule('socketHandler', {
      retries: 2,
      timeout: 8000
    });
    
    // Then load webScraper with dependencies
    const result = await moduleLoader.loadModuleWithDependencies(
      './modules/features/webScraper.js',
      {
        retries: 3,
        timeout: 8000,
        clearFailedModules: true
      }
    );
    
    if (result && result.module) {
      console.log("webScraper module loaded successfully");
      return result.module;
    } else {
      console.warn("webScraper module failed to load, will use fallback");
      return moduleLoader.createWebScraperFallback ? 
             moduleLoader.createWebScraperFallback() : 
             createWebScraperFallback();
    }
  } catch (error) {
    console.error("Error loading webScraper module:", error);
   return moduleLoader.createWebScraperFallback ? 
          moduleLoader.createWebScraperFallback() : 
          createWebScraperFallback();
 }
}

/**
* Initialize application with loaded modules
* @param {Object} coreModules - Core modules
* @param {Object} featureModules - Feature modules
* @param {Object} utilModules - Utility modules
* @returns {Promise<boolean>} - Success state
*/
async function initializeApplication(coreModules, featureModules, utilModules) {
 console.log("Initializing application...");

 try {
   // Initialize errorHandler first to capture any errors during initialization
   if (coreModules.errorHandler && typeof coreModules.errorHandler.initialize === 'function') {
     try {
       await coreModules.errorHandler.initialize();
       console.log("Error handler initialized");
     } catch (errorHandlerInitError) {
       console.error("Error initializing errorHandler:", errorHandlerInitError);
     }
   }
   
   // Initialize UI registry next
   if (coreModules.uiRegistry && typeof coreModules.uiRegistry.initialize === 'function') {
     try {
       await coreModules.uiRegistry.initialize();
       console.log("UI Registry initialized");
     } catch (uiRegistryInitError) {
       console.error("Error initializing uiRegistry:", uiRegistryInitError);
     }
   }
   
   // Initialize state manager
   if (coreModules.stateManager && typeof coreModules.stateManager.initialize === 'function') {
     try {
       await coreModules.stateManager.initialize({
         version: '1.0.0',
         initialized: true,
         theme: localStorage.getItem('theme') || 'light'
       });
       console.log("State manager initialized");
     } catch (stateManagerInitError) {
       console.error("Error initializing stateManager:", stateManagerInitError);
     }
   }
   
   // Initialize event registry
   if (coreModules.eventRegistry && typeof coreModules.eventRegistry.initialize === 'function') {
     try {
       await coreModules.eventRegistry.initialize();
       console.log("Event registry initialized");
     } catch (eventRegistryInitError) {
       console.error("Error initializing eventRegistry:", eventRegistryInitError);
     }
   }
   
   // Initialize event manager
   if (coreModules.eventManager && typeof coreModules.eventManager.initialize === 'function') {
     try {
       await coreModules.eventManager.initialize();
       console.log("Event manager initialized");
     } catch (eventManagerInitError) {
       console.error("Error initializing eventManager:", eventManagerInitError);
     }
   }

   // Initialize theme manager
   if (coreModules.themeManager && typeof coreModules.themeManager.initialize === 'function') {
     try {
       await coreModules.themeManager.initialize();
       console.log("Theme manager initialized");
     } catch (themeManagerInitError) {
       console.error("Error initializing themeManager:", themeManagerInitError);
     }
   }
   
   // Initialize socketHandler first to ensure socket functions are available
   if (utilModules.socketHandler && typeof utilModules.socketHandler.initialize === 'function') {
     try {
       await utilModules.socketHandler.initialize();
       console.log("Socket handler initialized");
     } catch (socketHandlerInitError) {
       console.error("Error initializing socketHandler:", socketHandlerInitError);
     }
   }
   
   // Initialize progressHandler next since it depends on socket
   if (utilModules.progressHandler && typeof utilModules.progressHandler.initialize === 'function') {
     try {
       await utilModules.progressHandler.initialize();
       console.log("Progress handler initialized");
     } catch (progressHandlerInitError) {
       console.error("Error initializing progressHandler:", progressHandlerInitError);
     }
   }
   
   // Initialize UI utility module
   if (featureModules.ui && typeof featureModules.ui.initialize === 'function') {
     try {
       await featureModules.ui.initialize();
       console.log("UI utility initialized");
     } catch (uiInitError) {
       console.error("Error initializing UI:", uiInitError);
     }
   }
   
   // Initialize remaining utility modules
   for (const [moduleName, module] of Object.entries(utilModules)) {
     // Skip modules we've already explicitly initialized
     if (['socketHandler', 'progressHandler'].includes(moduleName)) {
       continue;
     }
     
     if (module && typeof module.initialize === 'function' && !module.initialized) {
       try {
         await module.initialize();
         console.log(`${moduleName} utility initialized`);
       } catch (utilModuleInitError) {
         console.warn(`Error initializing ${moduleName}:`, utilModuleInitError);
       }
     }
   }
   
   // Finally initialize the app module
   if (featureModules.app && typeof featureModules.app.initialize === 'function') {
     try {
       await featureModules.app.initialize();
       console.log("App module initialized");
     } catch (appInitError) {
       console.error("Error initializing app module:", appInitError);
     }
   }

   // Initialize progress system for proper UI updates
   initializeProgressSystem();
   
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

/**
* Initialize optional modules with enhanced priority handling
* @param {Object} optionalModules - Optional modules
* @param {Object} coreModules - Core modules for event registry integration
* @returns {Promise<boolean>} - Success state
*/
async function initializeOptionalModules(optionalModules, coreModules) {
 console.log("Initializing optional modules...");
 
 if (!optionalModules || Object.keys(optionalModules).length === 0) {
   console.log("No optional modules to initialize");
   return true;
 }
 
 try {
   // Priority initialization for critical modules
   const priorityModules = ['historyManager', 'playlistDownloader', 'fileProcessor', 'webScraper'];
   
   // First initialize priority modules in specific order
   for (const moduleName of priorityModules) {
     const module = optionalModules[moduleName];
     if (module && typeof module.initialize === 'function' && 
         !(module.initialized || (typeof module.isInitialized === 'function' && module.isInitialized()))) {
       try {
         await module.initialize();
         console.log(`Priority module ${moduleName} initialized`);
       } catch (priorityModuleInitError) {
         console.warn(`Error initializing priority module ${moduleName}:`, priorityModuleInitError);
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
       } catch (optionalModuleInitError) {
         console.warn(`Error initializing ${moduleName}:`, optionalModuleInitError);
       }
     }
   }
   
   // Connect UI registry with modules if possible
   if (coreModules.uiRegistry && typeof coreModules.uiRegistry.registerUIElements === 'function') {
     try {
       coreModules.uiRegistry.registerUIElements();
       console.log("UI elements registered with UI registry");
     } catch (uiRegistryError) {
       console.warn("Error registering UI elements:", uiRegistryError);
     }
   }
   
   // Connect event registry with modules if possible
   if (coreModules.eventRegistry && typeof coreModules.eventRegistry.registerEvents === 'function') {
     try {
       coreModules.eventRegistry.registerEvents();
       console.log("Events registered with event registry");
     } catch (eventRegistryError) {
       console.warn("Error registering events:", eventRegistryError);
     }
   }
   
   return true;
 } catch (error) {
   console.error("Error initializing optional modules:", error);
   return false; // Continue even if optional modules fail
 }
}

/**
* Initialize module diagnostics for development
*/
function initializeModuleDiagnostics() {
 try {
   // Check if we have the diagnostics module
   if (!diagnosticsModule) {
     console.warn("Module diagnostics not available for initialization");
     return;
   }
   
   // Initialize diagnostics with moduleLoader
   if (typeof diagnosticsModule.initialize === 'function') {
     diagnosticsModule.initialize(moduleLoader);
     console.log("Module diagnostics initialized");
     
     // Schedule a report after all modules are loaded
     setTimeout(() => {
       if (typeof diagnosticsModule.logReport === 'function') {
         diagnosticsModule.logReport();
       }
     }, 3000);
   }
 } catch (error) {
   console.error("Error initializing module diagnostics:", error);
 }
}

/**
* Add diagnostics button to the page for debugging
*/
function addDiagnosticsButton() {
 if (document.getElementById('diagnostics-button')) return;
 
 const button = document.createElement('button');
 button.id = 'diagnostics-button';
 button.className = 'btn btn-info btn-sm position-fixed';
 button.style.bottom = '20px';
 button.style.right = '20px';
 button.style.zIndex = '9999';
 button.innerHTML = '<i class="fas fa-stethoscope"></i> Diagnostics';
 
 button.addEventListener('click', () => {
   if (diagnosticsModule && typeof diagnosticsModule.showReport === 'function') {
     diagnosticsModule.showReport();
   } else if (moduleLoader && typeof moduleLoader.showDiagnostics === 'function') {
     moduleLoader.showDiagnostics();
   } else {
     alert('Diagnostics unavailable. Check console for module status.');
     console.log('Module Status:', {
       loadedModules: Object.keys(window.moduleInstances),
       failedModules: moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [],
       fallbacks: moduleLoader.fallbacksUsed ? Array.from(moduleLoader.fallbacksUsed) : []
     });
   }
 });
 
 document.body.appendChild(button);
}

/**
* Enhance Socket.IO integration for playlist and module events
*/
function enhanceSocketIOIntegration() {
 try {
   // Check if socket is available
   if (typeof window.socket === 'undefined') {
     console.warn("Socket.IO not available for enhancement");
     return;
   }
   
   // Register task-related event handlers
   if (window.socket.on) {
     // Generic task progress and completion events
     window.socket.on('task_progress', handleTaskProgress);
     window.socket.on('task_completed', handleTaskCompleted);
     window.socket.on('task_error', handleTaskError);
     window.socket.on('task_cancelled', handleTaskCancelled);
     
     // Playlist-specific events
     window.socket.on('playlist_progress', handlePlaylistProgress);
     window.socket.on('playlist_completed', handlePlaylistCompleted);
     window.socket.on('playlist_error', handlePlaylistError);
     
     // PDF extraction events
     window.socket.on('pdf_extraction_progress', handlePdfExtractionProgress);
     window.socket.on('pdf_extraction_completed', handlePdfExtractionCompleted);
     
     // Module-specific state updates
     window.socket.on('module_state_update', handleModuleStateUpdate);
     
     // Server status events
     window.socket.on('server_status', handleServerStatus);
     
     console.log("Enhanced Socket.IO event handlers registered");
   }
 } catch (error) {
   console.error("Error enhancing Socket.IO integration:", error);
 }
}

/**
* Handle task progress updates from Socket.IO
* @param {Object} data - Progress data
*/
function handleTaskProgress(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`Task progress update for ${data.task_id}: ${data.progress}%`);
   
   // Update UI using progressHandler if available
   const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
   if (progressHandler && typeof progressHandler.updateTaskProgress === 'function') {
     progressHandler.updateTaskProgress(data.task_id, data.progress, data.message, data.stats);
   }
   
   // Dispatch event for other modules to respond
   const event = new CustomEvent('taskProgress', { detail: data });
   document.dispatchEvent(event);
 } catch (error) {
   console.error("Error handling task progress update:", error);
 }
}

/**
* Handle task completion notification from Socket.IO
* @param {Object} data - Completion data
*/
function handleTaskCompleted(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`Task ${data.task_id} completed successfully`);
   
   // Update UI using progressHandler if available
   const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
   if (progressHandler && typeof progressHandler.completeTask === 'function') {
     progressHandler.completeTask(data.task_id, data);
   }
   
   // Dispatch event for other modules to respond
   const event = new CustomEvent('taskCompleted', { detail: data });
   document.dispatchEvent(event);
   
   // If UI is available, show toast notification
   const ui = window.ui || window.moduleInstances?.ui;
   if (ui && typeof ui.showToast === 'function') {
     ui.showToast('Success', 'Task completed successfully', 'success');
   }
 } catch (error) {
   console.error("Error handling task completion:", error);
 }
}

/**
* Handle task error notification from Socket.IO
* @param {Object} data - Error data
*/
function handleTaskError(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.error(`Task ${data.task_id} failed with error: ${data.error}`);
   
   // Update UI using progressHandler if available
   const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
   if (progressHandler && typeof progressHandler.errorTask === 'function') {
     progressHandler.errorTask(data.task_id, data.error, data);
   }
   
   // Dispatch event for other modules to respond
   const event = new CustomEvent('taskError', { detail: data });
   document.dispatchEvent(event);
   
   // If UI is available, show toast notification
   const ui = window.ui || window.moduleInstances?.ui;
   if (ui && typeof ui.showToast === 'function') {
     ui.showToast('Error', data.error || 'Task failed', 'error');
   }
 } catch (error) {
   console.error("Error handling task error notification:", error);
 }
}

/**
* Handle task cancellation notification from Socket.IO
* @param {Object} data - Cancellation data
*/
function handleTaskCancelled(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`Task ${data.task_id} cancelled`);
   
   // Update UI using progressHandler if available
   const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
   if (progressHandler && typeof progressHandler.cancelTask === 'function') {
     progressHandler.cancelTask(data.task_id, data);
   }
   
   // Dispatch event for other modules to respond
   const event = new CustomEvent('taskCancelled', { detail: data });
   document.dispatchEvent(event);
   
   // If UI is available, show toast notification
   const ui = window.ui || window.moduleInstances?.ui;
   if (ui && typeof ui.showToast === 'function') {
     ui.showToast('Cancelled', 'Task was cancelled', 'warning');
   }
 } catch (error) {
   console.error("Error handling task cancellation:", error);
 }
}

/**
* Handle playlist progress updates from Socket.IO
* @param {Object} data - Playlist progress data
*/
function handlePlaylistProgress(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`Playlist progress update for ${data.task_id}: ${data.progress}%`);
   
   // Forward to task progress handler
   handleTaskProgress(data);
   
   // Update playlist UI if playlistDownloader is available
   const playlistDownloader = window.playlistDownloader || window.moduleInstances?.playlistDownloader;
   if (playlistDownloader && typeof playlistDownloader.updateProgress === 'function') {
     playlistDownloader.updateProgress(data);
   }
 } catch (error) {
   console.error("Error handling playlist progress update:", error);
 }
}

/**
* Handle playlist completion notification from Socket.IO
* @param {Object} data - Playlist completion data
*/
function handlePlaylistCompleted(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`Playlist ${data.task_id} completed successfully`);
   
   // Forward to task completion handler
   handleTaskCompleted(data);
   
   // Update playlist UI if playlistDownloader is available
   const playlistDownloader = window.playlistDownloader || window.moduleInstances?.playlistDownloader;
   if (playlistDownloader && typeof playlistDownloader.handleCompletion === 'function') {
     playlistDownloader.handleCompletion(data);
   }
 } catch (error) {
   console.error("Error handling playlist completion:", error);
 }
}

/**
* Handle playlist error notification from Socket.IO
* @param {Object} data - Playlist error data
*/
function handlePlaylistError(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.error(`Playlist ${data.task_id} failed with error: ${data.error}`);
   
   // Forward to task error handler
   handleTaskError(data);
   
   // Update playlist UI if playlistDownloader is available
   const playlistDownloader = window.playlistDownloader || window.moduleInstances?.playlistDownloader;
   if (playlistDownloader && typeof playlistDownloader.handleError === 'function') {
     playlistDownloader.handleError(data);
   }
 } catch (error) {
   console.error("Error handling playlist error notification:", error);
 }
}

/**
* Handle PDF extraction progress updates from Socket.IO
* @param {Object} data - PDF extraction progress data
*/
function handlePdfExtractionProgress(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`PDF extraction progress update for ${data.task_id}: ${data.progress}%`);
   
   // Forward to task progress handler
   handleTaskProgress(data);
   
   // Update file processor UI if available
   const fileProcessor = window.fileProcessor || window.moduleInstances?.fileProcessor;
   if (fileProcessor && typeof fileProcessor.updatePdfExtractionProgress === 'function') {
     fileProcessor.updatePdfExtractionProgress(data);
   }
 } catch (error) {
   console.error("Error handling PDF extraction progress update:", error);
 }
}

/**
* Handle PDF extraction completion notification from Socket.IO
* @param {Object} data - PDF extraction completion data
*/
function handlePdfExtractionCompleted(data) {
 try {
   if (!data || !data.task_id) return;
   
   console.log(`PDF extraction ${data.task_id} completed successfully`);
   
   // Forward to task completion handler
   handleTaskCompleted(data);
   
   // Update file processor UI if available
   const fileProcessor = window.fileProcessor || window.moduleInstances?.fileProcessor;
   if (fileProcessor && typeof fileProcessor.handlePdfExtractionCompleted === 'function') {
     fileProcessor.handlePdfExtractionCompleted(data);
   }
 } catch (error) {
   console.error("Error handling PDF extraction completion:", error);
 }
}

/**
* Handle module state updates from Socket.IO
* @param {Object} data - Module state update data
*/
function handleModuleStateUpdate(data) {
 try {
   if (!data || !data.module) return;
   
   console.log(`Module state update for ${data.module}`);
   
   // Update state manager if available
   const stateManager = window.stateManager || window.moduleInstances?.stateManager;
   if (stateManager && typeof stateManager.handleExternalStateUpdate === 'function') {
     stateManager.handleExternalStateUpdate(data.module, data.state);
   }
   
   // Dispatch event for the specific module to respond
   const event = new CustomEvent(`${data.module}StateUpdate`, { detail: data });
   document.dispatchEvent(event);
 } catch (error) {
   console.error("Error handling module state update:", error);
 }
}

/**
* Handle server status updates from Socket.IO
* @param {Object} data - Server status data
*/
function handleServerStatus(data) {
 try {
   console.log(`Server status update: ${data.status}`);
   
   // Update UI indicator if available
   const statusIndicator = document.getElementById('server-status-indicator');
   if (statusIndicator) {
     statusIndicator.className = `server-status-indicator ${data.status}`;
     statusIndicator.title = `Server status: ${data.status}`;
   }
   
   // Dispatch event for other modules to respond
   const event = new CustomEvent('serverStatusUpdate', { detail: data });
   document.dispatchEvent(event);
   
   // Show toast notification for important status changes
   const ui = window.ui || window.moduleInstances?.ui;
   if (ui && typeof ui.showToast === 'function' && 
       (data.status === 'error' || data.status === 'restarting')) {
     ui.showToast('Server Status', `Server is ${data.status}`, data.status === 'error' ? 'error' : 'warning');
   }
 } catch (error) {
   console.error("Error handling server status update:", error);
 }
}

// --------------------------------------------------------------------------
// UI Utility Functions
// --------------------------------------------------------------------------

/**
* Create an error container for displaying application errors
* @returns {HTMLElement} - The error container
*/
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

/**
* Create a loading overlay to show initialization progress
*/
function createLoadingOverlay() {
 // Check if it already exists
 if (document.getElementById('app-loading-overlay')) return;
 
 const overlay = document.createElement('div');
 overlay.id = 'app-loading-overlay';
 overlay.className = 'position-fixed top-0 start-0 end-0 bottom-0 d-flex flex-column justify-content-center align-items-center';
 overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
 overlay.style.zIndex = '9999';
 
 // Create logo or title
 const title = document.createElement('h3');
 title.textContent = 'NeuroGen Server';
 title.className = 'text-light mb-4';
 
 // Create loading spinner
 const spinner = document.createElement('div');
 spinner.className = 'spinner-border text-light mb-3';
 spinner.style.width = '3rem';
 spinner.style.height = '3rem';
 
 // Create status message
 const status = document.createElement('div');
 status.id = 'loading-status';
 status.className = 'text-light mb-3';
 status.textContent = 'Loading modules...';
 
 // Create progress bar
 const progressContainer = document.createElement('div');
 progressContainer.className = 'progress w-50 mb-3';
 progressContainer.style.height = '4px';
 
 const progressBar = document.createElement('div');
 progressBar.id = 'loading-progress-bar';
 progressBar.className = 'progress-bar bg-info';
 progressBar.role = 'progressbar';
 progressBar.style.width = '0%';
 progressBar.setAttribute('aria-valuenow', '0');
 progressBar.setAttribute('aria-valuemin', '0');
 progressBar.setAttribute('aria-valuemax', '100');
 
 progressContainer.appendChild(progressBar);
 
 // Assemble the overlay
 overlay.appendChild(title);
 overlay.appendChild(spinner);
 overlay.appendChild(status);
 overlay.appendChild(progressContainer);
 
 // Add to document
 document.body.appendChild(overlay);
 
 // Start progress animation
 startProgressAnimation();
}

/**
* Animate the progress bar during initialization
*/
function startProgressAnimation() {
 const progressBar = document.getElementById('loading-progress-bar');
 if (!progressBar) return;
 
 let progress = 0;
 const interval = setInterval(() => {
   progress += 1;
   
   // Slow down as we approach 90%
   if (progress > 70) {
     progress += 0.1;
   } else if (progress > 50) {
     progress += 0.3;
   }
   
   // Cap at 90% - the remaining 10% will be completed when initialization is done
   if (progress >= 90) {
     clearInterval(interval);
     progress = 90;
   }
   
   progressBar.style.width = `${progress}%`;
   progressBar.setAttribute('aria-valuenow', progress);
 }, 100);
 
 // Store the interval for cleanup
 window._progressInterval = interval;
}

/**
* Update the loading progress display
* @param {number} progress - Progress percentage (0-100)
* @param {string} message - Status message to display
*/
function updateLoadingProgress(progress, message) {
 const progressBar = document.getElementById('loading-progress-bar');
 const statusEl = document.getElementById('loading-status');
 
 if (progressBar) {
   progressBar.style.width = `${progress}%`;
   progressBar.setAttribute('aria-valuenow', progress);
 }
 
 if (statusEl && message) {
   statusEl.textContent = message;
 }
 
 // If we've reached 100%, prepare to remove the overlay
 if (progress >= 100 && window._progressInterval) {
   clearInterval(window._progressInterval);
   window._progressInterval = null;
 }
}

/**
* Remove the loading overlay with a smooth fade effect
*/
function removeLoadingOverlay() {
 const overlay = document.getElementById('app-loading-overlay');
 if (!overlay) return;
 
 // Ensure progress is at 100%
 const progressBar = document.getElementById('loading-progress-bar');
 if (progressBar) {
   progressBar.style.width = '100%';
   progressBar.setAttribute('aria-valuenow', '100');
 }
 
 // Clean up interval if it's still running
 if (window._progressInterval) {
   clearInterval(window._progressInterval);
   window._progressInterval = null;
 }
 
 // Add fade-out animation
 overlay.style.transition = 'opacity 0.5s ease-out';
 overlay.style.opacity = '0';
 
 // Remove after animation completes
 setTimeout(() => {
   overlay.remove();
 }, 500);
}

/**
* Apply stored theme to the document
*/
function applyStoredTheme() {
 const storedTheme = localStorage.getItem('theme') || 'light';
 document.documentElement.setAttribute('data-theme', storedTheme);
 document.body.setAttribute('data-theme', storedTheme);
 document.documentElement.setAttribute('data-bs-theme', storedTheme);

 // Set theme toggle icon
 const darkModeToggle = document.getElementById('darkModeToggle');
 if (darkModeToggle) {
   const isDark = storedTheme === 'dark';
   darkModeToggle.innerHTML = isDark ? 
     '<i class="fas fa-sun fa-lg"></i>' : 
     '<i class="fas fa-moon fa-lg"></i>';
   darkModeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
 }
}

/**
* Setup basic UI event handlers for application-wide functionality
* Ensures proper theme management and event handling
*/
function setupBasicEventHandlers() {
 // Setup theme toggle with improved handling
 const darkModeToggle = document.getElementById('darkModeToggle');
 if (darkModeToggle && !darkModeToggle._hasEventListener) {
   darkModeToggle.addEventListener('click', function() {
     try {
       // Primary approach: Use the globally exposed themeManager
       if (window.themeManager && typeof window.themeManager.toggleTheme === 'function') {
         window.themeManager.toggleTheme();
       }
       // Fallback: Try module instances registry if main approach fails
       else if (window.moduleInstances && 
               window.moduleInstances.themeManager && 
               typeof window.moduleInstances.themeManager.toggleTheme === 'function') {
         window.moduleInstances.themeManager.toggleTheme();
       }
       else {
         console.warn("Theme manager not directly available, using manual theme toggle");
         // Last resort: Manual implementation that ensures persistence
         const currentTheme = localStorage.getItem('theme') || 
                            document.documentElement.getAttribute('data-theme') || 
                            'dark';
         const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
         
         // Update DOM
         document.body.setAttribute('data-theme', newTheme);
         document.documentElement.setAttribute('data-theme', newTheme);
         document.documentElement.setAttribute('data-bs-theme', newTheme); // Bootstrap compatibility
         
         // Persist setting
         localStorage.setItem('theme', newTheme);
         
         // Update toggle button
         this.innerHTML = newTheme === 'dark' ?
           '<i class="fas fa-sun fa-lg"></i>' :
           '<i class="fas fa-moon fa-lg"></i>';
         this.title = newTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
       }
     } catch (error) {
       console.error("Error toggling theme:", error);
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
 
 /**
 * Setup basic tab navigation for better user experience
 */
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
 
 /**
 * Show an error message to the user
 * @param {string} message - Error message to display
 */
 function showErrorMessage(message) {
  console.error(message);
  
  // Try to use UI module if available
  const uiModule = window.ui || window.moduleInstances?.ui;
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
 
 /**
 * Sets up recovery mode for failed modules
 * @returns {Promise<boolean>} - Success state
 */
 async function setupRecoveryMode() {
  console.log("Setting up recovery mode for failed modules");
  
  // Set recovery mode flag
  window._inRecoveryMode = true;
  
  try {
    // Create recovery UI
    createRecoveryUI();
    
    return true;
  } catch (error) {
    console.error("Error setting up recovery mode:", error);
    return false;
  }
 }
 
 /**
 * Creates recovery UI to help the user handle module loading failures
 */
 function createRecoveryUI() {
  // Try to find or create recovery container
  let recoveryContainer = document.getElementById('recovery-container');
  if (recoveryContainer) {
    recoveryContainer.style.display = 'block';
    return;
  }
  
  // Create container
  recoveryContainer = document.createElement('div');
  recoveryContainer.id = 'recovery-container';
  recoveryContainer.className = 'container mt-4 p-4 border rounded bg-light';
  
  // Get failed modules
  const failedModules = moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [];
  const fallbackModules = moduleLoader.fallbacksUsed ? Array.from(moduleLoader.fallbacksUsed) : [];
  
  // Create content with helpful options
  recoveryContainer.innerHTML = `
    <div class="alert alert-warning mb-4">
      <h4><i class="fas fa-exclamation-triangle me-2"></i>Limited Functionality Mode</h4>
      <p>Some modules failed to load correctly. The application is running with reduced functionality.</p>
    </div>
    
    <div class="row">
      <div class="col-md-6">
        <div class="card mb-3">
          <div class="card-header bg-primary text-white">
            Recovery Options
          </div>
          <div class="card-body">
            <button id="refresh-page-btn" class="btn btn-primary mb-2 w-100">
              <i class="fas fa-sync-alt me-2"></i>Refresh Page
            </button>
            <button id="clear-cache-btn" class="btn btn-secondary mb-2 w-100">
              <i class="fas fa-broom me-2"></i>Clear Cache & Reload
            </button>
            <button id="diagnostics-btn" class="btn btn-info mb-2 w-100">
              <i class="fas fa-stethoscope me-2"></i>Run Diagnostics
            </button>
            <button id="retry-modules-btn" class="btn btn-warning mb-2 w-100">
              <i class="fas fa-redo me-2"></i>Retry Failed Modules
            </button>
          </div>
        </div>
      </div>
      
      <div class="col-md-6">
        <div class="card">
          <div class="card-header bg-info text-white">
            Technical Information
          </div>
          <div class="card-body">
            <p><strong>Failed Modules:</strong> <span id="failed-modules-count">${failedModules.length}</span></p>
            <p><strong>Using Fallbacks:</strong> <span id="fallback-modules-count">${fallbackModules.length}</span></p>
            <p><strong>Browser:</strong> ${navigator.userAgent}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
    
    <div id="failed-modules-details" class="mt-3 ${failedModules.length > 0 ? '' : 'd-none'}">
      <h5>Failed Module Details</h5>
      <div class="table-responsive">
        <table class="table table-sm table-striped">
          <thead>
            <tr>
              <th>Module</th>
              <th>Path</th>
              <th>Error</th>
              <th>Fallback</th>
            </tr>
          </thead>
          <tbody id="failed-modules-table">
          ${failedModules.map(path => {
            const moduleName = path.split('/').pop().replace('.js', '');
            const hasFallback = fallbackModules.includes(moduleName);
            return `
              <tr>
                <td>${moduleName}</td>
                <td><small>${path}</small></td>
                <td>Failed to load</td>
                <td>${hasFallback ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-danger">No</span>'}</td>
              </tr>
            `;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(recoveryContainer);
  
  // Add button event handlers
  const refreshBtn = document.getElementById('refresh-page-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }
  
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      try {
        // Clear localStorage cache flags
        localStorage.removeItem('moduleCache');
        
        // Clear failed modules state
        localStorage.removeItem('failedModules');
        
        // Reload page
        window.location.reload();
      } catch (error) {
        console.error("Error clearing cache:", error);
        window.location.reload();
      }
    });
  }
  
  const diagnosticsBtn = document.getElementById('diagnostics-btn');
  if (diagnosticsBtn) {
    diagnosticsBtn.addEventListener('click', () => {
      if (window.diagnostics && window.diagnostics.showReport) {
        window.diagnostics.showReport();
      } else if (diagnostics && diagnostics.logReport) {
        diagnostics.logReport();
        alert("Diagnostics report logged to console");
      } else {
        alert("Diagnostics not available");
      }
    });
  }
  
  const retryModulesBtn = document.getElementById('retry-modules-btn');
  if (retryModulesBtn) {
    retryModulesBtn.addEventListener('click', async () => {
      try {
        retryModulesBtn.disabled = true;
        retryModulesBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Retrying...';
        
        // Use moduleLoader to retry failed modules
        if (moduleLoader && typeof moduleLoader.retryFailedModules === 'function') {
          const result = await moduleLoader.retryFailedModules();
          
          if (result && result.success) {
            alert(`Successfully reloaded ${result.reloadedCount} modules. Reloading page...`);
            window.location.reload();
          } else {
            alert(`Failed to reload all modules. ${result?.reloadedCount || 0} were successful.`);
            retryModulesBtn.disabled = false;
            retryModulesBtn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry Failed Modules';
          }
        } else {
          alert("Module reloading not available");
          retryModulesBtn.disabled = false;
          retryModulesBtn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry Failed Modules';
        }
      } catch (error) {
        console.error("Error retrying modules:", error);
        alert("Error retrying modules: " + error.message);
        retryModulesBtn.disabled = false;
        retryModulesBtn.innerHTML = '<i class="fas fa-redo me-2"></i>Retry Failed Modules';
      }
    });
  }
 }
 
 /**
 * Initialize progress system for proper UI updates
 */
 function initializeProgressSystem() {
  console.log("Initializing enhanced progress system");
  
  // Ensure progress bar transitions are smooth
  const style = document.createElement('style');
  style.textContent = `
    .progress-bar {
      transition: width 0.5s ease-in-out !important;
    }
    
    @keyframes progressPulse {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }
    
    .progress-waiting .progress-bar {
      animation: progressPulse 2s infinite;
    }
  `;
  document.head.appendChild(style);
  
  // Add a progress monitor to ensure UI always shows movement
  window.progressMonitor = setInterval(() => {
    // Look for all progress bars that might be stuck
    document.querySelectorAll('.progress-bar').forEach(bar => {
      const container = bar.closest('.progress');
      const width = parseFloat(bar.style.width) || 0;
      
      // If progress is stuck at a low value, add visual indication
      if (width > 0 && width < 10) {
        // Add pulsing animation to indicate activity
        if (container && !container.classList.contains('progress-waiting')) {
          container.classList.add('progress-waiting');
        }
      } else {
        // Remove waiting indication
        if (container && container.classList.contains('progress-waiting')) {
          container.classList.remove('progress-waiting');
        }
      }
    });
  }, 2000);
  
  console.log("Progress system initialized");
 }
 
 /**
 * Check for ongoing tasks from previous sessions
 */
 function checkForOngoingTasks() {
  try {
    // Use consistent naming with progressHandler
    const taskId = sessionStorage.getItem('ongoingTaskId');
    const taskType = sessionStorage.getItem('ongoingTaskType');
    const taskStartTime = sessionStorage.getItem('taskStartTime');
    
    if (!taskId) {
      return;
    }
    
    console.log(`Found ongoing ${taskType} task: ${taskId}`);
    
    // Check for appropriate module
    let handlerModule = null;
    switch (taskType) {
      case 'playlist':
        handlerModule = window.moduleInstances.playlistDownloader;
        break;
      case 'scraper':
        handlerModule = window.moduleInstances.webScraper;
        break;
      case 'file':
        handlerModule = window.moduleInstances.fileProcessor;
        break;
    }
    
    if (handlerModule) {
      // Try to resume task with handler module
      if (typeof handlerModule.resumeTask === 'function') {
        handlerModule.resumeTask(taskId);
      } else if (typeof handlerModule.showProgress === 'function') {
        handlerModule.showProgress();
        
        // Request status update if socket is available
        if (window.socket && window.socket.connected) {
          window.socket.emit('request_status', { task_id: taskId });
        }
      }
    } else {
      // Generic task resumption via progress handler
      if (window.moduleInstances.progressHandler) {
        if (typeof window.moduleInstances.progressHandler.resumeTask === 'function') {
          window.moduleInstances.progressHandler.resumeTask(taskId);
        }
      }
    }
  } catch (error) {
    console.error("Error checking for ongoing tasks:", error);
  }
 }
 
 // --------------------------------------------------------------------------
 // Fallback Module Implementations
 // --------------------------------------------------------------------------
 
 /**
 * Create a fallback implementation for the UI module
 * @returns {Object} - UI fallback implementation
 */
 function createUiFallback() {
  console.log("Creating UI module fallback");
  
  // Create a minimal UI implementation
  const uiFallback = {
    __isFallback: true,
    initialized: true,
    
    // Toast notification
    showToast: function(title, message, type = 'info') {
      console.log(`[TOAST-${type.toUpperCase()}] ${title}: ${message}`);
      
      // Try to use Bootstrap toast if available
      if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        try {
          // Create toast container if it doesn't exist
          let toastContainer = document.getElementById('toast-container');
          if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
          }
          
          // Create toast element
          const toastEl = document.createElement('div');
          toastEl.className = `toast align-items-center border-0 bg-${type === 'error' ? 'danger' : type}`;
          toastEl.setAttribute('role', 'alert');
          toastEl.setAttribute('aria-live', 'assertive');
          toastEl.setAttribute('aria-atomic', 'true');
          
          // Create toast content
          toastEl.innerHTML = `
            <div class="d-flex">
              <div class="toast-body">
                <strong>${title}</strong>: ${message}
              </div>
              <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
          `;
          
          // Append to container
          toastContainer.appendChild(toastEl);
          
          // Show toast
          const toast = new bootstrap.Toast(toastEl);
          toast.show();
          
          // Remove after hiding
          toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
          });
        } catch (error) {
          console.error("Error showing Bootstrap toast:", error);
        }
      }
    },
    
    // Loading spinner
    showLoadingSpinner: function(message = 'Loading...') {
      console.log(`[LOADING] ${message}`);
      
      // Create loading container if it doesn't exist
      let loadingContainer = document.getElementById('loading-container');
      if (!loadingContainer) {
        loadingContainer = document.createElement('div');
        loadingContainer.id = 'loading-container';
        loadingContainer.className = 'position-fixed top-0 start-0 end-0 bottom-0 d-flex justify-content-center align-items-center bg-dark bg-opacity-50';
        loadingContainer.style.zIndex = '9999';
        
        loadingContainer.innerHTML = `
          <div class="bg-white p-4 rounded shadow">
            <div class="d-flex align-items-center">
              <div class="spinner-border text-primary me-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span id="loading-message">${message}</span>
            </div>
          </div>
        `;
        
        document.body.appendChild(loadingContainer);
      } else {
        // Update existing loading message
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
          loadingMessage.textContent = message;
        }
        
        // Show container
        loadingContainer.style.display = 'flex';
      }
      
      // Return control object
      return {
        hide: function() {
          if (loadingContainer) {
            loadingContainer.style.display = 'none';
          }
        },
        
        updateMessage: function(newMessage) {
          const loadingMessage = document.getElementById('loading-message');
          if (loadingMessage) {
            loadingMessage.textContent = newMessage;
          }
        },
        
        updateProgress: function(progress) {
          // Optional: Add progress bar if needed
        }
      };
    },
    
    // Hide loading spinner
    hideLoading: function() {
      const loadingContainer = document.getElementById('loading-container');
      if (loadingContainer) {
        loadingContainer.style.display = 'none';
      }
    },
    
    // Modal dialog
    showModal: function(title, content, options = {}) {
      console.log(`[MODAL] ${title}`);
      
      // Create modal container if it doesn't exist
      let modalContainer = document.getElementById('modal-container');
      if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
      }
      
      // Create modal ID
      const modalId = `modal-${Date.now()}`;
      
      // Create modal HTML
      modalContainer.innerHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="${modalId}-label">${title}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                ${content}
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                ${options.buttons ? options.buttons.map(btn => 
                  `<button type="button" class="btn btn-${btn.primary ? 'primary' : 'secondary'}" data-action="${btn.action || ''}">${btn.text}</button>`
                ).join('') : ''}
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Show modal if Bootstrap is available
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const modalEl = document.getElementById(modalId);
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Add event listeners for buttons
        if (options.buttons) {
          options.buttons.forEach(btn => {
            if (btn.onClick) {
              const btnEl = modalEl.querySelector(`button[data-action="${btn.action || ''}"]`);
              if (btnEl) {
                btnEl.addEventListener('click', () => {
                  btn.onClick();
                  if (btn.closeModal !== false) {
                    modal.hide();
                  }
                });
              }
            }
          });
        }
        
        // Return control object
        return {
          id: modalId,
          element: modalEl,
          hide: function() {
            modal.hide();
          },
          updateContent: function(newContent) {
            const body = modalEl.querySelector('.modal-body');
            if (body) {
              body.innerHTML = newContent;
            }
          },
          updateTitle: function(newTitle) {
            const title = modalEl.querySelector('.modal-title');
            if (title) {
              title.innerHTML = newTitle;
            }
          }
        };
      } else {
        // Fallback for no Bootstrap
        alert(`${title}\n\n${content.replace(/<[^>]*>/g, '')}`);
        
        // Return dummy control object
        return {
          id: modalId,
          element: null,
          hide: function() {},
          updateContent: function() {},
          updateTitle: function() {}
        };
      }
    },
    
    // Hide modal
    hideModal: function(modalId) {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        const modalEl = document.getElementById(modalId);
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) {
            modal.hide();
          }
        }
      }
    },
    
    // Element visibility toggling
    toggleElementVisibility: function(elementId, visible, displayMode = 'block') {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.display = visible ? (displayMode || 'block') : 'none';
      }
    },
    
    // DOM utilities
    getElement: function(selector) {
      return document.querySelector(selector);
    },
    
    findElement: function(selector) {
      return document.querySelector(selector);
    },
    
    findElements: function(selector) {
      return Array.from(document.querySelectorAll(selector));
    },
    
    createElement: function(tag, attributes = {}, content) {
      const element = document.createElement(tag);
      
      // Set attributes
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') {
          element.className = value;
        } else {
          element.setAttribute(key, value);
        }
      }
      
      // Set content
      if (content) {
        if (typeof content === 'string') {
          element.innerHTML = content;
        } else if (content instanceof HTMLElement) {
          element.appendChild(content);
        }
      }
      
      return element;
    },
    
    // Initialization method
    initialize: function() {
      console.log("UI fallback initialized");
      return Promise.resolve(true);
    }
  };
  
  return uiFallback;
 }
 
 /**
 * Create a fallback implementation for the WebScraper module
 * @returns {Object} - WebScraper fallback implementation
 */
 function createWebScraperFallback() {
  console.log("Creating WebScraper module fallback");
  
  // Create a minimal WebScraper implementation
  const webScraperFallback = {
    __isFallback: true,
    initialized: true,
    
    // Initialization method
    initialize: function() {
      console.log("WebScraper fallback initialized");
      
      // Try to set up UI
      this.setupUI();
      
      return Promise.resolve(true);
    },
    
    // Setup UI elements
    setupUI: function() {
      // Find scraper container
      const container = document.getElementById('scraper-container');
      if (!container) return;
      
      // Add warning message about fallback
      const warningEl = document.createElement('div');
      warningEl.className = 'alert alert-warning';
      warningEl.innerHTML = `
        <h5><i class="fas fa-exclamation-triangle me-2"></i>Limited Functionality Mode</h5>
        <p>The Web Scraper module is operating in fallback mode with limited functionality.</p>
        <p>Please try refreshing the page or contact support if this issue persists.</p>
      `;
      
      // Add to container
      container.prepend(warningEl);
      
      // Disable scrape button
      const scrapeBtn = document.getElementById('scrape-btn');
      if (scrapeBtn) {
        scrapeBtn.disabled = true;
        scrapeBtn.title = 'Web scraper is in fallback mode with limited functionality';
      }
    },
    
    // Basic scraping operation (limited functionality)
    startScraping: function() {
      // Show error message
      const ui = window.ui || window.moduleInstances?.ui;
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast('Error', 'Web scraper is in fallback mode with limited functionality', 'error');
      } else {
        alert('Web scraper is in fallback mode with limited functionality');
      }
      
      return Promise.reject(new Error('Web scraper is in fallback mode'));
    },
    
    // Cancel scraping operation
    cancelScraping: function() {
      console.log("Cancelling web scraper operation (fallback mode)");
      return Promise.resolve({ success: true });
    },
    
    // Resume a task if needed
    resumeTask: function(taskId) {
      console.log(`Attempting to resume task ${taskId} (fallback mode)`);
      
      // Show message
      const ui = window.ui || window.moduleInstances?.ui;
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast('Warning', 'Cannot resume task in fallback mode', 'warning');
      }
      
      return false;
    }
  };
  
  return webScraperFallback;
 }
 
 /**
 * Create a fallback implementation for the PlaylistDownloader module
 * @returns {Object} - PlaylistDownloader fallback implementation
 */
 function createPlaylistDownloaderFallback() {
  console.log("Creating PlaylistDownloader module fallback");
  
  // Create minimal PlaylistDownloader implementation
  const playlistDownloaderFallback = {
    __isFallback: true,
    initialized: true,
    
    // Initialization method
    initialize: function() {
      console.log("PlaylistDownloader fallback initialized");
      
      // Try to set up UI
      this.setupUI();
      
      return Promise.resolve(true);
    },
    
    // Setup UI elements
    setupUI: function() {
      // Find playlist container
      const container = document.getElementById('playlist-container');
      if (!container) return;
      
      // Add warning message about fallback
      const warningEl = document.createElement('div');
      warningEl.className = 'alert alert-warning';
      warningEl.innerHTML = `
        <h5><i class="fas fa-exclamation-triangle me-2"></i>Limited Functionality Mode</h5>
        <p>The Playlist Downloader module is operating in fallback mode with limited functionality.</p>
        <p>Please try refreshing the page or contact support if this issue persists.</p>
      `;
      
      // Add to container
      container.prepend(warningEl);
      
      // Disable download button
      const downloadBtn = document.getElementById('playlist-download-btn');
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.title = 'Playlist downloader is in fallback mode with limited functionality';
      }
    },
    
    // Basic download operation (limited functionality)
    downloadPlaylist: function() {
      // Show error message
      const ui = window.ui || window.moduleInstances?.ui;
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast('Error', 'Playlist downloader is in fallback mode with limited functionality', 'error');
      } else {
        alert('Playlist downloader is in fallback mode with limited functionality');
      }
      
      return Promise.reject(new Error('Playlist downloader is in fallback mode'));
    },
    
    // Cancel download operation
    cancelDownload: function() {
      console.log("Cancelling playlist download operation (fallback mode)");
      return Promise.resolve({ success: true });
    },
    
    // Resume a task if needed
    resumeTask: function(taskId) {
      console.log(`Attempting to resume task ${taskId} (fallback mode)`);
      
      // Show message
      const ui = window.ui || window.moduleInstances?.ui;
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast('Warning', 'Cannot resume task in fallback mode', 'warning');
      }
      
      return false;
    },
    
    // Handle completion for task ID
    handleCompletion: function(data) {
      console.log("Handling playlist completion in fallback mode:", data);
      // No-op in fallback mode
    },
    
    // Handle error for task ID
    handleError: function(data) {
      console.error("Handling playlist error in fallback mode:", data);
      // No-op in fallback mode
    }
  };
  
  return playlistDownloaderFallback;
 }
 
 /**
 * Create a fallback implementation for the AcademicSearch module
 * @returns {Object} - AcademicSearch fallback implementation
 */
 function createAcademicSearchFallback() {
  console.log("Creating AcademicSearch module fallback");
  
  // Create minimal AcademicSearch implementation
  const academicSearchFallback = {
    __isFallback: true,
    initialized: true,
    
    // Initialization method
    initialize: function() {
      console.log("AcademicSearch fallback initialized");
      
      // Try to set up UI
      this.setupUI();
      
      return Promise.resolve(true);
    },
    
    // Setup UI elements
   setupUI: function() {
    // Find academic search container
    const container = document.getElementById('academic-container');
    if (!container) return;
    
    // Add warning message about fallback
    const warningEl = document.createElement('div');
    warningEl.className = 'alert alert-warning';
    warningEl.innerHTML = `
      <h5><i class="fas fa-exclamation-triangle me-2"></i>Limited Functionality Mode</h5>
      <p>The Academic Search module is operating in fallback mode with limited functionality.</p>
      <p>Please try refreshing the page or contact support if this issue persists.</p>
    `;
    
    // Add to container
    container.prepend(warningEl);
    
    // Disable search button
    const searchBtn = document.getElementById('academic-search-btn');
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.title = 'Academic search is in fallback mode with limited functionality';
    }
  },
  
  // Basic search operation (limited functionality)
  performSearch: function() {
    // Show error message
    const ui = window.ui || window.moduleInstances?.ui;
    if (ui && typeof ui.showToast === 'function') {
      ui.showToast('Error', 'Academic search is in fallback mode with limited functionality', 'error');
    } else {
      alert('Academic search is in fallback mode with limited functionality');
    }
    
    return Promise.reject(new Error('Academic search is in fallback mode'));
  },
  
  // Download PDF operation
  downloadPaper: function() {
    console.log("Attempting to download paper (fallback mode)");
    
    // Show message
    const ui = window.ui || window.moduleInstances?.ui;
    if (ui && typeof ui.showToast === 'function') {
      ui.showToast('Error', 'Cannot download papers in fallback mode', 'error');
    } else {
      alert('Cannot download papers in fallback mode');
    }
    
    return Promise.reject(new Error('Cannot download papers in fallback mode'));
  }
};

return academicSearchFallback;
}

// --------------------------------------------------------------------------
// Performance Monitoring Functions
// --------------------------------------------------------------------------

/**
* Record performance metrics for analysis
*/
function recordPerformanceMetrics() {
try {
  const metrics = {
    totalTime: Date.now() - (window.performanceStartTime || 0),
    domContentLoaded: window.performance && window.performance.timing ? 
      window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart : 
      null,
    moduleCount: Object.keys(window.moduleInstances || {}).length,
    failedModules: moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [],
    fallbacks: moduleLoader.fallbacksUsed ? Array.from(moduleLoader.fallbacksUsed) : [],
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
    locationHref: window.location.href.split('?')[0] // Remove query parameters
  };
  
  console.log("Performance metrics:", metrics);
  
  // Store metrics for later analysis
  try {
    // Get existing metrics
    const storedMetrics = JSON.parse(localStorage.getItem('performanceMetrics') || '[]');
    
    // Add new metrics
    storedMetrics.push(metrics);
    
    // Keep only the latest 10 metrics
    if (storedMetrics.length > 10) {
      storedMetrics.splice(0, storedMetrics.length - 10);
    }
    
    // Save back to localStorage
    localStorage.setItem('performanceMetrics', JSON.stringify(storedMetrics));
  } catch (storageError) {
    console.warn("Error storing performance metrics:", storageError);
  }
  
  // Send to server if available
  try {
    if (window.socket && typeof window.socket.emit === 'function') {
      window.socket.emit('client_performance_metrics', {
        metrics,
        timestamp: Date.now() / 1000,
        sessionId: sessionStorage.getItem('sessionId') || 'unknown'
      });
    }
  } catch (socketError) {
    console.warn("Error sending performance metrics to server:", socketError);
  }
  
  return metrics;
} catch (error) {
  console.error("Error recording performance metrics:", error);
  return null;
}
}

/**
* Long-running performance monitoring for large operations
*/
function startPerformanceMonitoring() {
// Set up memory monitoring if available
if (window.performance && window.performance.memory) {
  const memoryMonitor = setInterval(() => {
    try {
      const memoryUsage = {
        totalJSHeapSize: window.performance.memory.totalJSHeapSize,
        usedJSHeapSize: window.performance.memory.usedJSHeapSize,
        jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      };
      
      // Store in session storage
      const memoryUsageHistory = JSON.parse(sessionStorage.getItem('memoryUsageHistory') || '[]');
      memoryUsageHistory.push(memoryUsage);
      
      // Keep only latest entries
      if (memoryUsageHistory.length > 60) { // Keep about 5 minutes of data
        memoryUsageHistory.shift();
      }
      
      sessionStorage.setItem('memoryUsageHistory', JSON.stringify(memoryUsageHistory));
      
      // Check for memory leaks
      const memoryUsagePercent = (memoryUsage.usedJSHeapSize / memoryUsage.jsHeapSizeLimit) * 100;
      if (memoryUsagePercent > 80) {
        console.warn(`High memory usage detected: ${memoryUsagePercent.toFixed(2)}%`);
      }
    } catch (error) {
      console.warn("Error monitoring memory usage:", error);
    }
  }, 5000); // Every 5 seconds
  
  // Store for cleanup
  window._memoryMonitor = memoryMonitor;
}

// Set up long task monitoring if available
if (window.PerformanceObserver) {
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        console.warn(`Long task detected: ${entry.duration}ms`, entry);
      });
    });
    
    longTaskObserver.observe({ entryTypes: ['longtask'] });
    
    // Store for cleanup
    window._longTaskObserver = longTaskObserver;
  } catch (error) {
    console.warn("LongTask performance monitoring not supported by this browser", error);
  }
}

// Set up user interaction monitoring
document.addEventListener('click', (event) => {
  try {
    // Record click performance
    const clickStartTime = performance.now();
    
    // Add a callback that runs after the event has been processed
    setTimeout(() => {
      const clickProcessingTime = performance.now() - clickStartTime;
      
      // Record slow interaction processing
      if (clickProcessingTime > 100) {
        console.warn(`Slow click processing detected: ${clickProcessingTime.toFixed(2)}ms on ${event.target.tagName}`);
      }
    }, 0);
  } catch (error) {
    // Ignore errors in performance monitoring
  }
}, { passive: true });
}

/**
* Scheduled background tasks to optimize performance
*/
function scheduleBackgroundTasks() {
// Setup background cleanup tasks
const backgroundTasks = () => {
  // Clear old console logs every 5 minutes
  if (console.clear && typeof console.clear === 'function') {
    console.clear();
    console.log("Console cleared by scheduled task");
  }
  
  // Clean up memory
  if (window.gc && typeof window.gc === 'function') {
    window.gc();
  }
  
  // Report current module health
  if (moduleLoader && typeof moduleLoader.reportModuleHealth === 'function') {
    moduleLoader.reportModuleHealth();
  }
};

// Schedule background tasks
const backgroundTaskInterval = setInterval(backgroundTasks, 5 * 60 * 1000); // Every 5 minutes

// Store for cleanup
window._backgroundTaskInterval = backgroundTaskInterval;
}

// --------------------------------------------------------------------------
// Module Event Registration
// --------------------------------------------------------------------------

/**
* Register module events and initialize event-driven architecture
*/
function registerModuleEvents() {
// Check if event registry exists
if (!window.eventRegistry || !window.eventRegistry.on) {
  return false;
}

// Register key application events
window.eventRegistry.registerEvent('app.initialized');
window.eventRegistry.registerEvent('app.moduleLoaded');
window.eventRegistry.registerEvent('app.moduleFailed');
window.eventRegistry.registerEvent('app.taskStarted');
window.eventRegistry.registerEvent('app.taskCompleted');
window.eventRegistry.registerEvent('app.taskError');

// Handle module loaded events
window.eventRegistry.on('app.moduleLoaded', function(data) {
  console.log(`Module loaded: ${data.moduleName}`);
  
  // Record in performance metrics
  const moduleLoadTimes = JSON.parse(sessionStorage.getItem('moduleLoadTimes') || '{}');
  moduleLoadTimes[data.moduleName] = Date.now();
  sessionStorage.setItem('moduleLoadTimes', JSON.stringify(moduleLoadTimes));
  
  // Update UI if possible
  const ui = window.ui || window.moduleInstances?.ui;
  if (ui && typeof ui.updateModuleStatus === 'function') {
    ui.updateModuleStatus(data.moduleName, 'loaded');
  }
});

// Handle module failed events
window.eventRegistry.on('app.moduleFailed', function(data) {
  console.error(`Module failed: ${data.moduleName}`, data.error);
  
  // Update UI if possible
  const ui = window.ui || window.moduleInstances?.ui;
  if (ui && typeof ui.updateModuleStatus === 'function') {
    ui.updateModuleStatus(data.moduleName, 'failed');
  }
});

return true;
}

// --------------------------------------------------------------------------
// Exported API
// --------------------------------------------------------------------------
export default {
version: '1.3.0',
buildDate: '2025-05-15',

/**
 * Get diagnostic report
 * @returns {Object} - Diagnostic report
 */
getDiagnosticReport() {
  if (diagnostics && typeof diagnostics.generateReport === 'function') {
    return diagnostics.generateReport();
  }
  
  // Fallback report
  return {
    timestamp: new Date().toISOString(),
    status: moduleLoader.failedModules && moduleLoader.failedModules.size > 0 ? 'error' : 'ok',
    failedModules: moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [],
    fallbacksUsed: moduleLoader.fallbacksUsed ? Array.from(moduleLoader.fallbacksUsed) : [],
    initialized: window.appInitialized,
    moduleSystemHealth: moduleLoader.failedModules && moduleLoader.failedModules.size > 0 ? 'issues' : 'ok'
  };
},

/**
 * Log diagnostic report to console
 */
logDiagnosticReport() {
  if (diagnostics && typeof diagnostics.logReport === 'function') {
    diagnostics.logReport();
  } else {
    console.log("Module Diagnostics Report: ", this.getDiagnosticReport());
  }
},

/**
 * Get the module loading state
 * @returns {Object} - Module loading state
 */
getModuleLoadingState() {
  return {
    initialized: moduleLoader.loadedModules ? Array.from(moduleLoader.loadedModules) : [],
    failed: moduleLoader.failedModules ? Array.from(moduleLoader.failedModules) : [],
    fallbacks: moduleLoader.fallbacksUsed ? Array.from(moduleLoader.fallbacksUsed) : []
  };
},

/**
 * Get a loaded module by name
 * @param {string} name - Module name
 * @returns {Object|null} - Module or null if not loaded
 */
getModule(name) {
  return window.moduleInstances[name] || null;
},

/**
 * Access system-level features
 */
system: {
  /**
   * Get performance metrics
   * @returns {Object} - Performance metrics
   */
  getPerformanceMetrics() {
    return recordPerformanceMetrics();
  },
  
  /**
   * Start background performance monitoring
   */
  startPerformanceMonitoring() {
    startPerformanceMonitoring();
  },
  
  /**
   * Reset all modules and reload the page
   */
  resetAll() {
    // Clear all storage
    localStorage.removeItem('moduleCache');
    localStorage.removeItem('failedModules');
    
    // Reload the page
    window.location.reload();
  }
}
};