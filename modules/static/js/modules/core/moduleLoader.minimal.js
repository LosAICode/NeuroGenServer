/**
 * Module Loader
 * Manages dynamic module loading and dependency injection for the application
 * 
 * @module moduleLoader
 * @version 2.0.0
 * CRITICAL: DO NOT MODIFY THIS FILE UNLESS YOU KNOW WHAT YOU'RE DOING
 * 
 * @changelog
 * - Improved error handling and diagnostics
 * - Added circular dependency detection and resolution
 * - Optimized module loading with caching
 * - Added fallback mechanisms for missing modules
 * - Fixed module initialization sequence
 */

const moduleLoader = {
  // Configuration settings
  debugMode: false,
  verboseLogging: false,
  currentLogLevel: 1, // 0=ERROR, 1=WARN, 2=INFO, 3=DEBUG
  defaultTimeout: 15000, // Default module load timeout
  initialized: false,
  diagnosticsInitialized: false,
  
  // Module tracking
  cache: new Map(),
  loadingPromises: new Map(),
  loadedModules: new Set(),
  failedModules: new Set(),
  loadingModules: new Set(),
  initializedModules: new Set(),
  loadAttempts: new Map(),
  fallbackModules: new Set(),
  fallbacksUsed: [],
  
  // Path mappings and overrides - CRITICAL: MUST BE DEFINED
  PATH_OVERRIDES: {},
  
  // Module locations by file name
  MODULE_LOCATIONS: {},
  
  // Module types
  MODULE_TYPES: {},
  
  // Required exports by module
  MODULE_EXPORTS: {},
  
  // Log levels
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  },
  
  // Dependency tracking
  dependencyGraph: {},
  
  // Methods that are safe to call asynchronously
  ASYNC_SAFE_METHODS: {},
  
  /**
   * Initialize the module loader
   */
  init() {
    // Initialize path overrides and locations
    console.log("Initializing module loader...");
    this.MODULE_LOCATIONS = {
      "moduleLoader.js": "core",
      "errorHandler.js": "core",
      "uiRegistry.js": "core",
      "stateManager.js": "core",
      "eventRegistry.js": "core",
      "eventManager.js": "core",
      "themeManager.js": "core",
      "app.js": "core",
      "ui.js": "utils",
      "utils.js": "utils",
      "moduleLoader.beta.js": "core",
      "fileHandler.js": "utils",
      "debugTools.js": "utils",
      "domUtils.js": "utils",
      "progressHandler.js": "utils",
      "socketHandler.js": "utils",
      "moduleDiagnostics.js": "utils",
      "playlistDownloader.js": "features",
      "historyManager.js": "features",
      "fileProcessor.js": "features",
      "webScraper.js": "features",
      "academicSearch.js": "features"
    };
    
    // Initialize module types for faster lookup
    Object.entries(this.MODULE_LOCATIONS).forEach(([filename, location]) => {
      const moduleName = filename.replace(/\.js$/, '');
      this.MODULE_TYPES[moduleName] = location;
    });
    
    console.log("Module loader initialized");
  }
};

// Initialize the module loader
moduleLoader.init();

// Export the module loader
export default moduleLoader;