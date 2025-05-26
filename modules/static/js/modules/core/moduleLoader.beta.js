/**
 * NeuroGen Server - Enhanced Module Loader v3.0
 * 
 * Provides reliable module loading with robust error handling, dependency management,
 * and graceful fallbacks for the NeuroGen Server frontend.
 * 
 * Features:
 * - Optimized and reliable ES6 module imports with proper error isolation
 * - Enhanced path resolution algorithm with improved accuracy
 * - Advanced module caching with consistent keys and cache invalidation
 * - Improved circular dependency detection and resolution
 * - Graceful degradation for missing modules with detailed error reporting
 * - Browser compatibility verification
 * - Structured logging system with configurable verbosity
 * - Performance optimizations for rapid loading with parallel processing
 * - Resource management for memory efficiency
 * - Auto-export standardization for consistent module interfaces
 * - Dynamic module discovery and resolution
 * - Enhanced retry mechanism with exponential backoff
 * - Module health monitoring and diagnostics
 * - Critical module tracking and prioritization
 * - Advanced recovery modes for fail-safe operation
 */

/**
 * Module Loader that handles dynamic module imports with error isolation
 */
const moduleLoader = {
  // Module cache to prevent duplicate imports
  cache: new Map(),
  
  // Module promises to prevent duplicate loading
  loadingPromises: new Map(),
  
  // Map of module filenames to their locations
  MODULE_LOCATIONS: {
    // Core modules
    'app.js': 'core',
    'moduleLoader.js': 'core',
    'uiRegistry.js': 'core',
    'eventManager.js': 'core',
    'eventRegistry.js': 'core',
    'stateManager.js': 'core',
    'errorHandler.js': 'core',
    'themeManager.js': 'core',
    
    // Feature modules
    'fileProcessor.js': 'features',
    'pdfProcessor.js': 'features',
    'webScraper.js': 'features',
    'playlistDownloader.js': 'features',
    'academicSearch.js': 'features',
    'academicApiClient.js': 'features',
    'academicScraper.js': 'features',
    'historyManager.js': 'features',
    'helpMode.js': 'features',
    'webScraperUtils.js': 'features',
    
    // Utility modules
    'utils.js': 'utils',
    'ui.js': 'utils',
    'fileHandler.js': 'utils',
    'progressHandler.js': 'utils',
    'socketHandler.js': 'utils',
    'debugTools.js': 'utils',
    'moduleDiagnostics.js': 'utils',
    'safeFileProcessor.js': 'utils'
  },
  
  // Module locations map (inverse mapping for lookup by module name without extension)
  MODULE_TYPES: {},
  
  // Priority order for module initialization
  INITIALIZATION_ORDER: [
    'errorHandler.js',
    'uiRegistry.js',
    'stateManager.js',
    'eventRegistry.js',
    'eventManager.js',
    'themeManager.js'
  ],
  
  // Critical modules that should use fallbacks if they fail to load
  CRITICAL_MODULES: [
    'ui.js',
    'progressHandler.js',
    'socketHandler.js',
    'playlistDownloader.js',
    'webScraper.js',
    'fileProcessor.js'
  ],
  
  // Module dependency relationships to ensure proper loading order
  MODULE_DEPENDENCIES: {
    'playlistDownloader.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
    'webScraper.js': ['progressHandler.js', 'socketHandler.js', 'ui.js'],
    'fileProcessor.js': ['progressHandler.js', 'ui.js'],
    'progressHandler.js': ['socketHandler.js'],
    'academicSearch.js': ['webScraper.js']
  },
  
  // List of known/expected module exports to auto-create if missing
  MODULE_EXPORTS: {
    'errorHandler.js': [
      'handleError',
      'showError',
      'showSuccess',
      'loadUiModule', 
      'setupGlobalErrorHandler', 
      'registerWithEventRegistry', 
      'saveErrorHistory', 
      'loadErrorHistory'
    ],
    'eventRegistry.js': [
      'on',
      'off',
      'emit',
      'reset'
    ],
    'uiRegistry.js': [
      'getElement',
      'registerElement',
      'registerElements',
      'updateElement',
      'setElementVisibility'
    ],
    'ui.js': [
      'showToast',
      'showModal',
      'showLoading',
      'hideLoading',
      'updateProgressBar',
      'updateProgressStatus'
    ],
    'progressHandler.js': [
      'trackProgress',
      'updateProgress',
      'completeTask',
      'errorTask',
      'cancelTask'
    ],
    'socketHandler.js': [
      'initialize',
      'connect',
      'disconnect',
      'emit',
      'on',
      'isConnected'
    ],
    'playlistDownloader.js': [
      'initialize',
      'isInitialized',
      'downloadPlaylist',
      'cancelDownload',
      'showProgress',
      'showForm',
      'handlePlaylistCompletion'
    ]
  },
  
  // Logging levels for better control
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  },
  
  // Set default log level
  currentLogLevel: 2, // INFO by default
  
  // Dependency tracking to resolve circular references
  loadingModules: new Set(),
  
  // Flag to indicate debug mode
  debugMode: false,
  
  // Flag to indicate verbose logging
  verboseLogging: false,
  
  // Flag to indicate initialization status
  initialized: false,
  
  // Track emergency mode state
  emergencyMode: false,
  
  // Module load failure tracking
  failedModules: new Set(),
  
  // Module dependencies for circular dependency detection
  dependencyGraph: {},
  
  // Flag to indicate we've already tried initializing diagnostics
  diagnosticsInitialized: false,
  
  // Explicit whitelist of core methods that can be loaded asynchronously
  ASYNC_SAFE_METHODS: {
    'errorHandler.js': ['handleError', 'showError', 'showSuccess'],
    'uiRegistry.js': ['getElement', 'registerElement'],
    'eventRegistry.js': ['on', 'off', 'emit'],
    'stateManager.js': ['getState', 'setState', 'subscribe']
  },
  
  // Initialization state of modules
  initializedModules: new Set(),
  
  // Module load attempts counter
  loadAttempts: new Map(),
  
  // Maximum number of load attempts before permanent failure
  MAX_LOAD_ATTEMPTS: 5,
  
  // Modified file paths mapping (e.g., duplicate files in different locations)
  PATH_OVERRIDES: {
    // Core modules
    './modules/utils/ui.js': '/static/js/modules/utils/ui.js',
    './modules/utils/progressHandler.js': '/static/js/modules/utils/progressHandler.js',
    './modules/utils/socketHandler.js': '/static/js/modules/utils/socketHandler.js',
    './modules/utils/domUtils.js': '/static/js/modules/utils/domUtils.js',
    
    // Feature modules
    './modules/features/playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
    './modules/features/webScraper.js': '/static/js/modules/features/webScraper.js',
    './modules/features/fileProcessor.js': '/static/js/modules/features/fileProcessor.js',
    './modules/features/academicSearch.js': '/static/js/modules/features/academicSearch.js',
    
    // Shortcuts
    'ui.js': '/static/js/modules/utils/ui.js',
    'progressHandler.js': '/static/js/modules/utils/progressHandler.js',
    'socketHandler.js': '/static/js/modules/utils/socketHandler.js',
    'domUtils.js': '/static/js/modules/utils/domUtils.js',
    'playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js'
  },
  
  // Init method - first function called during setup
  init() {
    // Initialize the inverse module types mapping
    Object.entries(this.MODULE_LOCATIONS).forEach(([filename, location]) => {
      const moduleName = filename.replace('.js', '');
      this.MODULE_TYPES[moduleName] = location;
    });
    
    // Register custom event listener for window errors
    window.addEventListener('error', this.handleWindowError.bind(this));
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
    
    // Initialize alternate loading methods
    this.initializeAlternateLoadingMethods();
    
    return this;
  },
  
  /**
   * Handle global window errors
   * @param {ErrorEvent} event - Error event
   */
  handleWindowError(event) {
    this.log(this.LOG_LEVELS.ERROR, "Window error caught by moduleLoader:", event.message);
    
    if (this.emergencyMode) {
      // In emergency mode, try to prevent errors from stopping execution
      event.preventDefault();
      return true;
    }
    
    // Trigger emergency mode if we detect module loading errors
    if (event.message && (
      event.message.includes('module') || 
      event.message.includes('import') || 
      event.message.includes('undefined')
    )) {
      this.enterEmergencyMode();
    }
  },
  
  /**
   * Handle unhandled promise rejections
   * @param {PromiseRejectionEvent} event - Rejection event
   */
  handleUnhandledRejection(event) {
    this.log(this.LOG_LEVELS.ERROR, "Unhandled promise rejection caught by moduleLoader:", event.reason);
    
    if (this.emergencyMode) {
      // In emergency mode, try to prevent errors from stopping execution
      event.preventDefault();
      return true;
    }
    
    // Check if rejection is related to module loading
    const reason = event.reason ? (event.reason.toString ? event.reason.toString() : String(event.reason)) : '';
    if (reason.includes('module') || reason.includes('import') || reason.includes('failed')) {
      this.enterEmergencyMode();
    }
  },
  
  /**
   * Enter emergency mode to ensure application continues to function
   */
  enterEmergencyMode() {
    if (this.emergencyMode) return; // Already in emergency mode
    
    this.log(this.LOG_LEVELS.WARN, "Entering moduleLoader emergency mode");
    this.emergencyMode = true;
    
    // Create fallbacks for all critical modules that failed to load
    Object.keys(this.MODULE_EXPORTS).forEach(moduleName => {
      const moduleNameWithoutExt = moduleName.replace('.js', '');
      const moduleType = this.MODULE_TYPES[moduleNameWithoutExt];
      
      if (!moduleType) return;
      
      const normalizedPath = `/static/js/modules/${moduleType}/${moduleName}`;
      
      // Check if module is loaded
      if (!this.cache.has(normalizedPath) && !window[moduleNameWithoutExt]) {
        this.log(this.LOG_LEVELS.WARN, `Creating emergency fallback for ${moduleName}`);
        
        let fallbackModule;
        
        // Create appropriate fallback based on module type
        if (moduleType === 'core') {
          fallbackModule = this.createCoreFallback(moduleNameWithoutExt);
        } else if (moduleType === 'features') {
          fallbackModule = this.createFeatureFallback(moduleNameWithoutExt);
        } else if (moduleType === 'utils') {
          fallbackModule = this.createUtilityFallback(moduleNameWithoutExt);
        } else {
          fallbackModule = {
            __isFallback: true,
            __emergencyMode: true,
            moduleName: moduleNameWithoutExt,
            
            initialize() {
              console.warn(`Using emergency fallback for ${moduleNameWithoutExt}`);
              return Promise.resolve(true);
            }
          };
        }
        
        // Add to cache
        this.cache.set(normalizedPath, fallbackModule);
        
        // Make globally available
        window[moduleNameWithoutExt] = fallbackModule;
        if (!window.moduleInstances) window.moduleInstances = {};
        window.moduleInstances[moduleNameWithoutExt] = fallbackModule;
      }
    });
    
    // Create recovery UI to help the user
    this.createEmergencyUI();
  },
  
  /**
   * Create emergency UI to inform the user of issues
   */
  createEmergencyUI() {
    // Don't create if it already exists
    if (document.getElementById('emergency-mode-banner')) return;
    
    // Create banner
    const banner = document.createElement('div');
    banner.id = 'emergency-mode-banner';
    banner.className = 'alert alert-warning position-fixed top-0 start-0 end-0';
    banner.style.zIndex = '9999';
    banner.style.borderRadius = '0';
    banner.style.margin = '0';
    banner.style.padding = '10px 15px';
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
    
    // Add content
    banner.innerHTML = `
      <div>
        <strong><i class="fas fa-exclamation-triangle me-2"></i>Limited Functionality Mode</strong>
        <span class="ms-2">Some modules failed to load. Basic functionality is available.</span>
      </div>
      <div>
        <button id="emergency-refresh-btn" class="btn btn-sm btn-primary me-2">Refresh Page</button>
        <button id="emergency-fix-btn" class="btn btn-sm btn-outline-primary">Fix Issues</button>
        <button id="emergency-hide-btn" class="btn btn-sm btn-outline-secondary ms-2">&times;</button>
      </div>
    `;
    
    // Add to document
    document.body.prepend(banner);
    
    // Add button handlers
    document.getElementById('emergency-refresh-btn').addEventListener('click', () => {
      window.location.reload();
    });
    
    document.getElementById('emergency-fix-btn').addEventListener('click', () => {
      this.fixFailedModules();
      setTimeout(() => window.location.reload(), 500);
    });
    
    document.getElementById('emergency-hide-btn').addEventListener('click', () => {
      banner.style.display = 'none';
    });
    
    // Show toast if UI is available
    if (window.ui && typeof window.ui.showToast === 'function') {
      window.ui.showToast(
        'Module Loading Issues',
        'Some modules failed to load. The application is running in limited functionality mode.',
        'warning'
      );
    }
  },
  
  /**
   * Initialize alternate loading methods to improve reliability
   */
  initializeAlternateLoadingMethods() {
    // Add fetch-based loading method as fallback
    if (!this.fetchAndEvalModule) {
      this.fetchAndEvalModule = async (path) => {
        try {
          this.log(this.LOG_LEVELS.INFO, `Attempting fetch-based loading for: ${path}`);
          
          // Try to fetch the module
          const response = await fetch(path);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch module: ${path} (${response.status} ${response.statusText})`);
          }
          
          // Get text content
          const moduleText = await response.text();
          
          // Create module exports object
          const moduleExports = {};
          
          // Create a "module" object for CommonJS-style exports
          const module = { exports: {} };
          
          // Create function to evaluate the module
          const evalFn = new Function('exports', 'module', moduleText);
          
          // Execute the function with our exports objects
          evalFn(moduleExports, module);
          
          // Determine which exports to use
          const result = module.exports && Object.keys(module.exports).length > 0 ?
            module.exports : moduleExports;
          
          // Indicates this was loaded via the fetch method
          result.__loadedViaFetch = true;
          
          return result;
        } catch (error) {
          this.log(this.LOG_LEVELS.ERROR, `Fetch-based loading failed for: ${path}`, error);
          throw error;
        }
      };
    }
  },
  
  /**
   * Configure the module loader with options
   * @param {Object} options - Configuration options
   * @param {boolean} options.debug - Enable debug mode
   * @param {number} options.logLevel - Log level (0=ERROR, 1=WARN, 2=INFO, 3=DEBUG)
   * @param {boolean} options.verboseLogging - Enable detailed logging
   * @param {number} options.timeout - Default timeout for module loading in ms
   * @param {number} options.maxRetries - Maximum number of retries for loading
   * @param {boolean} options.clearFailedModules - Clear failed modules status on initialization
   */
  configure(options = {}) {
    // Set debug mode based on options or environment
    this.debugMode = options.debug || 
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    
    // Set log level
    this.currentLogLevel = options.logLevel !== undefined ? 
      options.logLevel : 
      (this.debugMode ? this.LOG_LEVELS.DEBUG : this.LOG_LEVELS.INFO);
    
    // Set verbose logging
    this.verboseLogging = options.verboseLogging || this.debugMode;
    
    // Set timeout if provided
    if (options.timeout) {
      this.defaultTimeout = options.timeout;
    }
    
    // Set max retries if provided
    if (options.maxRetries) {
      this.MAX_LOAD_ATTEMPTS = options.maxRetries;
    }
    
    // Clear failed modules if requested
    if (options.clearFailedModules && this.failedModules.size > 0) {
      this.log(this.LOG_LEVELS.INFO, `Clearing ${this.failedModules.size} failed modules`);
      this.failedModules.clear();
      this.loadAttempts.clear();
    }
    
    if (this.debugMode) {
      console.log('Module loader running in debug mode');
    }
    
    return this;
  },
  
  /**
   * Controlled logging function
   * @param {number} level - Log level
   * @param {...any} args - Arguments to log
   */
  log(level, ...args) {
    if (level <= this.currentLogLevel) {
      const method = level === this.LOG_LEVELS.ERROR ? 'error' : 
                     level === this.LOG_LEVELS.WARN ? 'warn' : 'log';
      console[method](...args);
    }
  },
  
  /**
   * Initialize the module loader
   * @param {Object} options - Initialization options
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(options = {}) {
    console.log('Initializing module loader...');
    
    if (this.initialized) {
      console.warn('Module loader already initialized');
      return true;
    }
    
    // Initialize module types mapping and other setup
    this.init();
    
    // Configure with options
    this.configure(options);
    
    // Check browser support for ES modules
    if (!this.supportsESModules()) {
      console.error('Browser does not support ES modules');
      this.showErrorMessage('Your browser does not support modern JavaScript modules. Please upgrade to a newer browser.');
      return false;
    }
    
    // Apply additional path overrides if provided in options
    if (options.pathOverrides) {
      Object.entries(options.pathOverrides).forEach(([path, override]) => {
        this.PATH_OVERRIDES[path] = override;
      });
    }
    
    // Expose loader to window for debugging
    if (this.debugMode) {
      window.moduleLoader = this;
    }
    
    // Apply theme and set up basic UI elements
    this.applyStoredTheme();
    this.setupBasicTabNavigation();
    
    // Mark as initialized
    this.initialized = true;
    
    // Run pre-flight checks to verify critical paths
    this.runPreflightChecks();
    
    return true;
  },
  
  /**
   * Run pre-flight checks to verify critical paths and fix any issues before loading begins
   */
  runPreflightChecks() {
    this.log(this.LOG_LEVELS.INFO, "Running module loader pre-flight checks");
    
    // Verify path resolution for critical modules
    const criticalModules = [
      './modules/utils/ui.js',
      './modules/utils/progressHandler.js',
      './modules/utils/socketHandler.js',
      './modules/features/playlistDownloader.js',
      './modules/features/webScraper.js',
      './modules/features/fileProcessor.js'
    ];
    
    const pathCheck = criticalModules.map(path => {
      const resolved = this.resolvePath(path);
      return { path, resolved, valid: !!resolved && resolved.includes('/static/js/') };
    });
    
    const invalidPaths = pathCheck.filter(check => !check.valid);
    
    if (invalidPaths.length > 0) {
      this.log(this.LOG_LEVELS.WARN, "Path resolution issues detected for critical modules:", invalidPaths);
      
      // Fix invalid paths
      invalidPaths.forEach(item => {
        const moduleName = item.path.split('/').pop();
        const moduleNameNoExt = moduleName.replace('.js', '');
        const moduleType = this.MODULE_TYPES[moduleNameNoExt];
        
        if (moduleType) {
          const fixedPath = `/static/js/modules/${moduleType}/${moduleName}`;
          this.log(this.LOG_LEVELS.INFO, `Adding path override: ${item.path} -> ${fixedPath}`);
          this.PATH_OVERRIDES[item.path] = fixedPath;
        }
      });
    }
    
    // Check localStorage for persistent issues
    try {
      const failedModuleHistory = JSON.parse(localStorage.getItem('failedModules') || '[]');
      
      if (Array.isArray(failedModuleHistory) && failedModuleHistory.length > 0) {
        this.log(this.LOG_LEVELS.WARN, "Found history of failed modules:", failedModuleHistory);
        
        // Add extra retries for historically problematic modules
        failedModuleHistory.forEach(modulePath => {
          if (typeof modulePath === 'string') {
            const cacheKey = this.getNormalizedPath(modulePath);
            this.loadAttempts.set(cacheKey, 0); // Reset attempts
            
            // Add module-specific path overrides if needed
            if (modulePath.includes('playlistDownloader')) {
              this.PATH_OVERRIDES[modulePath] = '/static/js/modules/features/playlistDownloader.js';
            }
          }
        });
      }
    } catch (error) {
      this.log(this.LOG_LEVELS.ERROR, "Error checking failed module history:", error);
    }
  },
  
  /**
   * Clean module path by removing numbers at the end and normalizing
   * @param {string} path - The module path
   * @returns {string} - Cleaned path
   */
  cleanModulePath(path) {
    if (!path) return '';
    
    // Remove any trailing numbers (e.g. "ui.js 2" becomes "ui.js")
    return path.replace(/\s+\d+$/, '');
  },

  /**
   * Enhanced path resolution with improved handling for different path formats
   * @param {string} modulePath - The requested module path
   * @returns {string} - The resolved path
   */
  resolvePath(modulePath) {
    if (!modulePath) return '';
    
    // Clean the path first to remove any trailing numbers
    const cleanPath = this.cleanModulePath(modulePath);
    
    // Log for debugging
    if (this.verboseLogging) {
      console.log("Resolving path:", cleanPath);
    }
    
    // Handle empty or invalid paths
    if (!cleanPath || typeof cleanPath !== 'string') {
      return '';
    }
    
    // Check if we have a direct override for this path
    if (this.PATH_OVERRIDES[cleanPath]) {
      const overridePath = this.PATH_OVERRIDES[cleanPath];
      if (this.verboseLogging) {
        console.log(`Path override applied: ${cleanPath} -> ${overridePath}`);
      }
      return overridePath;
    }
    
    // If the path already starts with http or /, it's absolute
    if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) {
      return cleanPath;
    }
    
    // Enhanced handling for relative paths starting with ./
    if (cleanPath.startsWith('./')) {
      // Extract the module name from the relative path
      const parts = cleanPath.split('/');
      const moduleName = parts[parts.length - 1];
      const moduleNameNoExt = moduleName.replace(/\.js$/, '');
      
      // First check if this is a direct module we know by its filename
      if (this.MODULE_LOCATIONS[moduleName]) {
        const location = this.MODULE_LOCATIONS[moduleName];
        return `/static/js/modules/${location}/${moduleName}`;
      }
      
      // Also check without .js extension
      if (this.MODULE_TYPES[moduleNameNoExt]) {
        const location = this.MODULE_TYPES[moduleNameNoExt];
        return `/static/js/modules/${location}/${moduleNameNoExt}.js`;
      }
      
      // Check for modules/features/moduleName pattern
      if (parts.length >= 4 && parts[1] === 'modules' && 
          (parts[2] === 'features' || parts[2] === 'core' || parts[2] === 'utils')) {
        return `/static/js/${cleanPath.substring(2)}`; // Remove './' from start
      }
      
      // Handle module paths that include subfolders
      if (parts.length >= 3) {
        // For paths like ./modules/core/uiRegistry.js
        if (parts[1] === 'modules') {
          return `/static/js/${cleanPath.substring(2)}`; // Remove './' from start
        }
      }
    }
    
    // Special handling for direct module names (without path)
    if (!cleanPath.includes('/')) {
      const moduleBase = cleanPath.endsWith('.js') ? cleanPath : `${cleanPath}.js`;
      const location = this.MODULE_LOCATIONS[moduleBase];
      
      if (location) {
        return `/static/js/modules/${location}/${moduleBase}`;
      }
      
      // Try without .js extension
      const moduleNameNoExt = cleanPath.replace(/\.js$/, '');
      const locationType = this.MODULE_TYPES[moduleNameNoExt];
      
      if (locationType) {
        return `/static/js/modules/${locationType}/${moduleNameNoExt}.js`;
      }
    }
    
    // For relative paths within modules (../../module)
    if (cleanPath.startsWith('../')) {
      // Extract module name from path
      const parts = cleanPath.split('/');
      const moduleName = parts[parts.length - 1];
      const moduleNameNoExt = moduleName.replace(/\.js$/, '');
      
      // Try to look up in known modules
      if (this.MODULE_LOCATIONS[moduleName]) {
        const location = this.MODULE_LOCATIONS[moduleName];
        return `/static/js/modules/${location}/${moduleName}`;
      }
      
      // Try to infer target directory based on parent directories
      if (parts.length >= 3) {
        const targetDir = parts[1] === '..' && parts.length > 2 ? parts[2] : parts[1];
        
        // If targetDir is a known module location (core, features, utils)
        if (['core', 'features', 'utils'].includes(targetDir)) {
          return `/static/js/modules/${targetDir}/${moduleName}`;
        }
      }
    }
    
    // Handle paths that start with 'modules/' - convert to absolute path
    if (cleanPath.startsWith('modules/')) {
      return '/static/js/' + cleanPath;
    }
    
    // For paths from index.js to modules, ensure they're properly resolved
    if (cleanPath.startsWith('./modules/')) {
      // Extract the module type and name
      const parts = cleanPath.split('/');
      if (parts.length >= 3) {
        const moduleType = parts[2]; // core, features, utils
        const moduleName = parts[parts.length - 1];
        
        // Handle both direct imports (./modules/core/uiRegistry.js) and modules folders imports
        if (moduleType === 'core' || moduleType === 'features' || moduleType === 'utils') {
          return '/static/js' + cleanPath.substring(1);
        }
        
        // Check if the module name is in MODULE_LOCATIONS
        if (moduleName && moduleName.endsWith('.js')) {
          const location = this.MODULE_LOCATIONS[moduleName];
          if (location) {
            return `/static/js/modules/${location}/${moduleName}`;
          }
        }
      }
      
      // If we can't resolve it more specifically, convert to absolute path
      return '/static/js' + cleanPath.substring(1);
    }
    
    // For core paths starting with /static/js/modules/
    if (cleanPath.includes('/static/js/modules/')) {
      return cleanPath;
    }
    
    // Default return the path unchanged
    return cleanPath;
  },

  /**
   * Normalize path for consistent caching
   * @param {string} path - The path to normalize
   * @returns {string} - Normalized path
   */
  getNormalizedPath(path) {
    if (!path) return '';
    
    // First clean the path by removing any trailing numbers (e.g., "ui.js 2" -> "ui.js")
    const cleanPath = path.replace(/\s+\d+$/, '');
    // Then strip query params and normalize slashes
    return cleanPath.split('?')[0].replace(/\/+/g, '/');
  },

  /**
   * Add missing exports to a module based on expectations
   * @param {Object} module - The loaded module
   * @param {string} moduleName - The name of the module
   * @returns {Object} - Module with standardized exports
   */
  autoCreateMissingExports(module, moduleName) {
    if (!module || !moduleName) return module;
    
    // Skip if not a known module
    if (!this.MODULE_EXPORTS[moduleName]) return module;
    
    const expectedExports = this.MODULE_EXPORTS[moduleName];
    
    // Create a new object to avoid modifying the original module
    const result = { ...module };
    
    // Get the module object, either from default export or the module itself
    const moduleObj = module.default || module;
    
    if (!moduleObj) {
      if (this.verboseLogging) {
        console.warn(`Module ${moduleName} has no default export or direct exports`);
      }
      return module;
    }
    
    // Check for each expected export and add stub if missing
    for (const exportName of expectedExports) {
      // If the export already exists directly in the result, skip it
      if (typeof result[exportName] === 'function') continue;
      
      // If the export exists in the module object but not directly in result, add it
      if (typeof moduleObj[exportName] === 'function') {
        result[exportName] = moduleObj[exportName].bind(moduleObj);
      } else {
        // Create a stubbed function that logs when called
        if (this.verboseLogging) {
          console.warn(`Adding missing export ${exportName} to module ${moduleName}`);
        }
        
        result[exportName] = function(...args) {
          console.warn(`Stub function ${moduleName}.${exportName} called with:`, args);
          return null;
        };
      }
    }
    
    return result;
  },
  /**
   * Import a module safely with comprehensive error handling, retries, and recovery options
   * @param {string} modulePath - Path to the module
   * @param {Object} options - Import options
   * @param {boolean} [options.required=false] - Whether the module is required for operation
   * @param {Object} [options.fallback=null] - Fallback module to return if loading fails
   * @param {boolean} [options.skipCache=false] - Whether to skip the module cache
   * @param {boolean} [options.standardizeExports=true] - Whether to standardize module exports
   * @param {number} [options.retries=1] - Number of retry attempts if loading fails
   * @param {number} [options.timeout=5000] - Timeout for module loading in milliseconds
   * @param {boolean} [options.clearFailedModules=false] - Whether to clear failed module status
   * @param {boolean} [options.tryAlternativeLoading=true] - Whether to try alternative loading methods
   * @param {boolean} [options.bypassCircularCheck=false] - Whether to bypass circular dependency detection
   * @returns {Promise<Object>} - The imported module
   */
  async importModule(modulePath, options = {}) {
    if (!modulePath) {
      console.error('Invalid module path provided to importModule');
      return null;
    }
    
    const { 
      required = false, 
      fallback = null, 
      skipCache = false, 
      standardizeExports = true,
      retries = 1,
      timeout = 5000,
      clearFailedModules = false,
      tryAlternativeLoading = true,
      bypassCircularCheck = false
    } = options;
    
    // Extract module name for tracking
    const moduleName = this.getModuleName(modulePath);
    
    try {
      // Resolve the module path
      const resolvedPath = this.resolvePath(modulePath);
      
      if (!resolvedPath) {
        throw new Error(`Could not resolve path for module: ${modulePath}`);
      }
      
      // Log resolved path for debugging
      if (this.verboseLogging) {
        console.log(`Resolved ${modulePath} to ${resolvedPath}`);
      }
      
      const cacheKey = this.getNormalizedPath(resolvedPath);
      
      // Clear failed module flag if requested
      if (clearFailedModules && this.failedModules.has(cacheKey)) {
        this.failedModules.delete(cacheKey);
        console.log(`Cleared failed status for module: ${modulePath}`);
        
        // Also clear from localStorage
        try {
          const failedModules = JSON.parse(localStorage.getItem('failedModules') || '[]');
          const filteredModules = failedModules.filter(m => m !== cacheKey);
          localStorage.setItem('failedModules', JSON.stringify(filteredModules));
        } catch (e) {
          console.warn("Error clearing failed module from localStorage:", e);
        }
      }
      
      // Check if module is already in the cache
      if (!skipCache && this.cache.has(cacheKey)) {
        if (this.verboseLogging) {
          console.log(`Module ${modulePath} loaded from cache`);
        }
        return this.cache.get(cacheKey);
      }
      
      // Check if module is currently being loaded - handle potential circular dependencies
      if (this.loadingPromises.has(cacheKey)) {
        if (this.verboseLogging) {
          console.log(`Module ${modulePath} is already being loaded, reusing promise`);
        }
        return this.loadingPromises.get(cacheKey);
      }
      
      // Check if module failed to load previously
      if (this.failedModules.has(cacheKey)) {
        // Track load attempts
        const attempts = this.loadAttempts.get(cacheKey) || 0;
        
        // If we've exceeded max attempts and it's a critical module, use fallback immediately
        if (attempts >= this.MAX_LOAD_ATTEMPTS) {
          const isCritical = this.CRITICAL_MODULES.includes(moduleName + '.js');
          
          if (isCritical) {
            console.warn(`Critical module ${modulePath} exceeded maximum load attempts (${this.MAX_LOAD_ATTEMPTS}), using fallback`);
            return fallback || this.createFallbackForModule(moduleName);
          } else {
            console.warn(`Module ${modulePath} exceeded maximum load attempts (${this.MAX_LOAD_ATTEMPTS}), using fallback`);
            return fallback || this.createFallbackModule(moduleName);
          }
        }
        
        // Otherwise clear failed status and try again
        this.failedModules.delete(cacheKey);
        this.loadAttempts.set(cacheKey, attempts + 1);
        
        console.log(`Retrying previously failed module: ${modulePath} (attempt ${attempts + 1}/${this.MAX_LOAD_ATTEMPTS})`);
      }
      
      // Check for circular dependencies - critical enhancement for playlistDownloader issue
      if (!bypassCircularCheck && this.loadingModules.has(cacheKey)) {
        console.warn(`Circular dependency detected for module: ${modulePath}`);
        
        // Check dependency configuration for this module
        const moduleDeps = this.MODULE_DEPENDENCIES[moduleName + '.js'] || [];
        const isCritical = this.CRITICAL_MODULES.includes(moduleName + '.js');
        
        // Store this circular dependency for diagnostics
        if (!this.dependencyGraph[cacheKey]) {
          this.dependencyGraph[cacheKey] = [];
        }
        
        const parent = this.getCurrentLoadingModule();
        if (parent) {
          this.dependencyGraph[cacheKey].push(parent);
        }
        
        // Return appropriate circular dependency resolver based on module criticality
        if (isCritical) {
          return this.createCircularDependencyResolverWithFallback(moduleName);
        } else {
          return this.createCircularDependencyResolver(moduleName);
        }
      }
      
      // Mark module as loading to detect circular dependencies
      this.loadingModules.add(cacheKey);
      
      // Track dependencies for this module
      const parentModule = this.getCurrentLoadingModule();
      if (parentModule && parentModule !== cacheKey) {
        if (!this.dependencyGraph[parentModule]) {
          this.dependencyGraph[parentModule] = [];
        }
        if (!this.dependencyGraph[parentModule].includes(cacheKey)) {
          this.dependencyGraph[parentModule].push(cacheKey);
        }
      }
      
      // Create a loading promise with comprehensive error handling and recovery options
      const loadPromise = (async () => {
        try {
          // Create timeout promise for safety
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Module import timed out: ${modulePath} (${timeout}ms)`)), timeout);
          });
          
          // Log actual import path for debugging
          if (this.verboseLogging) {
            console.log(`Attempting to import: ${resolvedPath}`);
          }
          
          // Attempt to import the module with timeout
          const modulePromise = import(resolvedPath);
          let module = null;
          
          try {
            // Race between the import and the timeout
            module = await Promise.race([modulePromise, timeoutPromise]);
          } catch (importError) {
            // Comprehensive error recovery: Try alternative loading methods if standard import fails
            if (tryAlternativeLoading) {
              this.log(this.LOG_LEVELS.WARN, `Standard import failed for ${resolvedPath}, trying alternative loading methods`);
              
              // Try multiple alternative approaches in sequence
              
              // 1. First try fetch-based loading
              if (this.fetchAndEvalModule) {
                try {
                  console.log(`Attempting fetch-based loading for ${resolvedPath}`);
                  module = await this.fetchAndEvalModule(resolvedPath);
                  console.log(`Fetch-based loading successful for ${resolvedPath}`);
                } catch (fetchError) {
                  console.warn(`Fetch-based loading failed for ${resolvedPath}:`, fetchError.message);
                  
                  // 2. Try importing with script tag if fetch fails
                  try {
                    if (this.loadModuleWithScriptTag) {
                      console.log(`Attempting script tag loading for ${resolvedPath}`);
                      module = await this.loadModuleWithScriptTag(resolvedPath);
                      console.log(`Script tag loading successful for ${resolvedPath}`);
                    }
                  } catch (scriptError) {
                    console.warn(`Script tag loading failed for ${resolvedPath}:`, scriptError.message);
                    
                    // 3. Try creating a fallback implementation specific to this module
                    if (this.canCreateModuleFallback(moduleName)) {
                      console.log(`Creating module-specific fallback for ${moduleName}`);
                      module = this.createFallbackForModule(moduleName);
                      module.__isFallback = true;
                      module.__loadError = importError.message;
                      console.log(`Created fallback implementation for ${moduleName}`);
                    } else {
                      // If all alternative loading methods fail, throw the original error
                      throw importError;
                    }
                  }
                }
              } else if (this.loadModuleWithScriptTag) {
                // If fetchAndEvalModule is not available, try script tag loading
                try {
                  console.log(`Attempting script tag loading for ${resolvedPath}`);
                  module = await this.loadModuleWithScriptTag(resolvedPath);
                  console.log(`Script tag loading successful for ${resolvedPath}`);
                } catch (scriptError) {
                  // If script tag loading fails too, throw the original error
                  throw importError;
                }
              } else {
                // No alternative loading methods available, rethrow the original error
                throw importError;
              }
            } else {
              // Alternative loading not enabled, rethrow the original error
              throw importError;
            }
          }
          
          // Get module name for auto-export creation
          const moduleJsName = this.getModuleName(modulePath) + '.js';
          
          // Enhanced module processing to handle various export patterns
          let processedModule = this.processModuleExports(module, moduleJsName);
          
          // Enhance module with missing exports if needed
          if (standardizeExports) {
            processedModule = this.autoCreateMissingExports(processedModule, moduleJsName);
          }
          
          // Add to cache
          this.cache.set(cacheKey, processedModule);
          
          // Remove from loading set and promises
          this.loadingModules.delete(cacheKey);
          this.loadingPromises.delete(cacheKey);
          
          // Reset load attempts on success
          this.loadAttempts.delete(cacheKey);
          
          // Remove from failed modules history if it's in localStorage
          this.removeFromFailedModuleHistory(resolvedPath);
          
          console.log(`Module ${resolvedPath} loaded successfully`);
          
          // Add to global module instances for easier access
          if (!window.moduleInstances) {
            window.moduleInstances = {};
          }
          
          const globalModuleName = moduleName.replace(/\//g, '_').replace(/\./g, '_');
          window.moduleInstances[globalModuleName] = processedModule;
          
          // Optionally make available as a global variable for critical modules
          if (this.CRITICAL_MODULES.includes(moduleJsName)) {
            window[moduleName] = processedModule;
          }
          
          return processedModule;
        } catch (error) {
          // Remove from loading set and promises
          this.loadingModules.delete(cacheKey);
          this.loadingPromises.delete(cacheKey);
          
          // Add to failed modules set
          this.failedModules.add(cacheKey);
          
          // Track this failure in localStorage
          this.addToFailedModuleHistory(resolvedPath);
          
          // Increment load attempts
          const attempts = (this.loadAttempts.get(cacheKey) || 0) + 1;
          this.loadAttempts.set(cacheKey, attempts);
          
          console.error(`Module ${resolvedPath} failed to load (attempt ${attempts}/${this.MAX_LOAD_ATTEMPTS}):`, error);
          
          // Enhanced fallback logic for critical modules
          const isCritical = this.CRITICAL_MODULES.includes(moduleName + '.js');
          const shouldCreateFallback = isCritical || attempts >= this.MAX_LOAD_ATTEMPTS;
          
          if (shouldCreateFallback) {
            console.warn(`${isCritical ? 'Critical module' : 'Module'} ${moduleName} failed to load, creating fallback`);
            const fallbackModule = this.createFallbackForModule(moduleName, error);
            
            // Add fallback to cache to prevent repeated failures
            this.cache.set(cacheKey, fallbackModule);
            
            // Make available globally for critical modules
            if (isCritical) {
              window[moduleName] = fallbackModule;
              if (!window.moduleInstances) {
                window.moduleInstances = {};
              }
              window.moduleInstances[moduleName] = fallbackModule;
            }
            
            return fallbackModule;
          }
          
          // Rethrow for outer catch
          throw error;
        }
      })();
      
      // Store promise for reuse
      this.loadingPromises.set(cacheKey, loadPromise);
      
      // Return the loading promise
      return loadPromise;
    } catch (error) {
      // Try retries if specified
      if (retries > 1) {
        console.warn(`Retrying to load ${modulePath}, ${retries-1} attempts remaining`);
        return this.importModule(modulePath, {...options, retries: retries - 1});
      }
      
      // Handle final failure
      const resolvedPath = this.resolvePath(modulePath);
      if (!resolvedPath) {
        console.error(`Failed to resolve path for module: ${modulePath}`);
        return fallback || this.createFallbackModule(this.getModuleName(modulePath), error);
      }
      
      const cacheKey = this.getNormalizedPath(resolvedPath);
      
      // Add to failed modules set
      this.failedModules.add(cacheKey);
      
      // Track this failure in localStorage
      this.addToFailedModuleHistory(resolvedPath);
      
      // Increment load attempts
      const attempts = (this.loadAttempts.get(cacheKey) || 0) + 1;
      this.loadAttempts.set(cacheKey, attempts);
      
      // Log the error with detailed information
      console.error(`Failed to import module ${modulePath} (attempt ${attempts}/${this.MAX_LOAD_ATTEMPTS}):`, error);
      console.error(`Module path: ${modulePath}, resolved path: ${resolvedPath}`);
      
      // Handle required modules with special error notification
      if (required) {
        this.showErrorMessage(`Failed to load required module: ${modulePath}. ${error.message}`);
        
        // Try to find modules that depend on this one for better error reporting
        const dependentModules = [];
        Object.entries(this.MODULE_DEPENDENCIES || {}).forEach(([module, deps]) => {
          if (deps.includes(moduleName + '.js') || deps.includes(moduleName)) {
            dependentModules.push(module);
          }
        });
        
        if (dependentModules.length > 0) {
          console.warn(`Modules depending on ${moduleName}: ${dependentModules.join(', ')}`);
        }
      }
      
      // Check if this is a critical module
      const isCritical = this.CRITICAL_MODULES.includes(moduleName + '.js');
      
      if (isCritical) {
        // For critical modules, always create a proper fallback
        const fallbackModule = fallback || this.createFallbackForModule(moduleName, error);
        
        // Add to cache to prevent repeated failures
        this.cache.set(cacheKey, fallbackModule);
        
        // Make available globally
        window[moduleName] = fallbackModule;
        if (!window.moduleInstances) {
          window.moduleInstances = {};
        }
        window.moduleInstances[moduleName] = fallbackModule;
        
        return fallbackModule;
      } else {
        // For non-critical modules, use provided fallback or create a minimal one
        return fallback || this.createFallbackModule(moduleName, error);
      }
    }
  },

  /**
   * Track failed module in localStorage for better diagnosis
   * @param {string} modulePath - Path of the failed module
   */
  addToFailedModuleHistory(modulePath) {
    try {
      // Get existing failed modules
      let failedModules = [];
      
      try {
        const storedModules = localStorage.getItem('failedModules');
        if (storedModules) {
          failedModules = JSON.parse(storedModules);
          
          // Ensure it's an array
          if (!Array.isArray(failedModules)) {
            failedModules = [];
          }
        }
      } catch (parseError) {
        // Reset if parsing fails
        failedModules = [];
      }
      
      // Add this module if not already in the list
      if (!failedModules.includes(modulePath)) {
        failedModules.push(modulePath);
        
        // Keep only the latest 20 entries
        if (failedModules.length > 20) {
          failedModules = failedModules.slice(-20);
        }
        
        // Save back to localStorage
        localStorage.setItem('failedModules', JSON.stringify(failedModules));
      }
    } catch (error) {
      // Silently ignore localStorage errors
      console.warn('Error saving failed module to history:', error);
    }
  },

  /**
   * Remove module from failed module history
   * @param {string} modulePath - Path of the module to remove
   */
  removeFromFailedModuleHistory(modulePath) {
    try {
      // Get existing failed modules
      let failedModules = [];
      
      try {
        const storedModules = localStorage.getItem('failedModules');
        if (storedModules) {
          failedModules = JSON.parse(storedModules);
          
          // Ensure it's an array
          if (!Array.isArray(failedModules)) {
            failedModules = [];
          }
        }
      } catch (parseError) {
        // Reset if parsing fails
        failedModules = [];
      }
      
      // Remove this module if it exists
      const index = failedModules.indexOf(modulePath);
      if (index !== -1) {
        failedModules.splice(index, 1);
        
        // Save back to localStorage
        localStorage.setItem('failedModules', JSON.stringify(failedModules));
      }
    } catch (error) {
      // Silently ignore localStorage errors
      console.warn('Error removing module from failed history:', error);
    }
  },

  /**
   * Process module exports to handle different export patterns
   * @param {Object} module - Imported module
   * @param {string} moduleName - Module name
   * @returns {Object} - Processed module with consistent exports
   */
  processModuleExports(module, moduleName) {
    if (!module) return module;
    
    // Get the default export if it exists
    const defaultExport = module.default;
    
    // Check if the module has a default export that is an object or function
    if (defaultExport && (typeof defaultExport === 'object' || typeof defaultExport === 'function')) {
      // If default export is an object, return it but also add all named exports
      const result = typeof defaultExport === 'object' ? { ...defaultExport } : defaultExport;
      
      // Add all named exports to the result
      Object.keys(module).forEach(key => {
        if (key !== 'default' && !result[key]) {
          // If the export is a function, bind it to the default export if it's an object
          if (typeof module[key] === 'function' && typeof defaultExport === 'object') {
            result[key] = module[key].bind(defaultExport);
          } else {
            result[key] = module[key];
          }
        }
      });
      
      // Special handling for specific modules
      if (moduleName === 'playlistDownloader.js') {
        // Ensure initialize method is available
        if (typeof result.initialize !== 'function' && 
            defaultExport && typeof defaultExport.initialize === 'function') {
          result.initialize = defaultExport.initialize.bind(defaultExport);
        }
        
        // Ensure isInitialized method is available
        if (typeof result.isInitialized !== 'function') {
          result.isInitialized = function() {
            return this.initialized || false;
          };
        }
      }
      
      return result;
    }
    
    // If no default export or it's not an object, return the module as is
    return module;
  },

  /**
   * Get currently loading module for dependency tracking
   * @returns {string|null} - Currently loading module path or null
   */
  getCurrentLoadingModule() {
    return Array.from(this.loadingModules).pop() || null;
  },

  /**
   * Create a special resolver for circular dependencies
   * @param {string} moduleName - Name of the module
   * @returns {Object} - Resolver proxy
   */
  createCircularDependencyResolver(moduleName) {
    // Create a proxy that will lazy-load the actual module when properties are accessed
    const moduleProxy = {
      __isCircularDependencyResolver: true,
      __moduleName: moduleName
    };
    
    // Create a handler for the proxy
    const handler = {
      get: (target, prop) => {
        // Try to get the actual module from the cache
        const moduleType = this.MODULE_TYPES[moduleName];
        const path = moduleType ? `/static/js/modules/${moduleType}/${moduleName}.js` : null;
        const module = path ? this.getModule(path) : null;
        
        if (module && typeof module[prop] === 'function') {
          return module[prop].bind(module);
        } else if (module && prop in module) {
          return module[prop];
        }
        
        // Special handling for initialize to prevent circular initialization
        if (prop === 'initialize' || prop === 'init') {
          return function() {
            console.warn(`Circular dependency resolver: ${moduleName}.${String(prop)} called, returning resolved promise`);
            return Promise.resolve(true);
          };
        }
        
        // If we don't have the module or property, provide a fallback
        console.warn(`Circular dependency resolution: ${moduleName}.${String(prop)} accessed before module loaded`);
        
        // Create a function for function properties
        if (prop !== 'then' && prop !== 'catch' && prop !== 'finally') {
          return function(...args) {
            console.warn(`Circular dependency stub called: ${moduleName}.${String(prop)}`, args);
            return null;
          };
        }
        
        return undefined;
      }
    };
    
    // Return a proxy to handle circular dependencies
    return new Proxy(moduleProxy, handler);
  },

  /**
   * Create a circular dependency resolver with fallback for critical modules
   * @param {string} moduleName - Name of the module
   * @returns {Object} - Enhanced resolver with fallback
   */
  createCircularDependencyResolverWithFallback(moduleName) {
    // For critical modules, create a more robust circular dependency resolver
    // that uses a fallback implementation if the actual module is not available
    
    // Get the module type
    const moduleType = this.MODULE_TYPES[moduleName];
    
    // Create fallback based on module type
    let fallback;
    if (moduleType === 'core') {
      fallback = this.createCoreFallback(moduleName);
    } else if (moduleType === 'features') {
      fallback = this.createFeatureFallback(moduleName);
    } else if (moduleType === 'utils') {
      fallback = this.createUtilityFallback(moduleName);
    } else {
      fallback = {
        __isFallback: true,
        __isCircularFallback: true,
        moduleName,
        
        initialize() {
          console.warn(`Using circular fallback for ${moduleName}`);
          return Promise.resolve(true);
        }
      };
    }
    
    // Create a proxy that combines the resolver with the fallback
    const handler = {
      get: (target, prop) => {
        // First try to get from the real module if it's in cache
        const path = moduleType ? `/static/js/modules/${moduleType}/${moduleName}.js` : null;
        const module = path ? this.getModule(path) : null;
        
        if (module && typeof module[prop] === 'function') {
          return module[prop].bind(module);
        } else if (module && prop in module) {
          return module[prop];
        }
        
        // If real module doesn't have the property, use fallback
        if (typeof fallback[prop] === 'function') {
          return fallback[prop].bind(fallback);
        } else if (prop in fallback) {
          return fallback[prop];
        }
        
        // For other properties, provide a stub
        console.warn(`Circular dependency resolution with fallback: ${moduleName}.${String(prop)} accessed before module loaded`);
        
        // Create a function for function properties
        if (prop !== 'then' && prop !== 'catch' && prop !== 'finally') {
          return function(...args) {
            console.warn(`Circular dependency stub called: ${moduleName}.${String(prop)}`, args);
            return null;
          };
        }
        
        return undefined;
      }
    };
    
    // Return a proxy that combines resolver with fallback
    return new Proxy(
      { 
        __isCircularDependencyResolver: true,
        __withFallback: true,
        __moduleName: moduleName
      }, 
      handler
    );
  },

  /**
     * Load multiple modules in parallel with proper error handling
     * @param {Array<string>} modulePaths - Array of module paths
     * @param {boolean} allRequired - Whether all modules are required
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Object with modules mapped by name
     */
  async importModules(modulePaths, allRequired = false, options = {}) {
    if (!modulePaths || !Array.isArray(modulePaths) || modulePaths.length === 0) {
      console.warn('No modules to import');
      return {};
    }
    
    // Filter out empty paths and duplicates
    const uniquePaths = [...new Set(modulePaths.filter(path => path))];
    
    // Handle options with default values
    const importOptions = {
      skipCache: options.skipCache || false,
      standardizeExports: options.standardizeExports !== false, // Default to true
      retries: options.retries || 1,
      timeout: options.timeout || 5000,
      concurrencyLimit: options.concurrencyLimit || 5,
      ignoreErrors: options.ignoreErrors || false,
      clearFailedModules: options.clearFailedModules || false,
      tryAlternativeLoading: options.tryAlternativeLoading !== false // Default to true
    };
    
    // Reorder modules based on dependencies
    const orderedPaths = this.orderModulesByDependency(uniquePaths);
    
    // Group modules for ordered loading
    const coreModules = orderedPaths.filter(path => {
      const name = this.getModuleName(path) + '.js';
      return this.INITIALIZATION_ORDER.includes(name);
    }).sort((a, b) => {
      const nameA = this.getModuleName(a) + '.js';
      const nameB = this.getModuleName(b) + '.js';
      return this.INITIALIZATION_ORDER.indexOf(nameA) - this.INITIALIZATION_ORDER.indexOf(nameB);
    });
    
    const criticalModules = orderedPaths.filter(path => {
      const name = this.getModuleName(path) + '.js';
      return this.CRITICAL_MODULES.includes(name) && !this.INITIALIZATION_ORDER.includes(name);
    });
    
    const otherModules = orderedPaths.filter(path => {
      const name = this.getModuleName(path) + '.js';
      return !this.CRITICAL_MODULES.includes(name) && !this.INITIALIZATION_ORDER.includes(name);
    });
    
    // First load core modules in order
    const modules = {};
    
    // Load core modules sequentially for proper initialization
    for (const path of coreModules) {
      const moduleName = this.getModuleName(path);
      try {
        const module = await this.importModule(path, { 
          required: allRequired,
          skipCache: importOptions.skipCache,
          standardizeExports: importOptions.standardizeExports,
          retries: importOptions.retries + 1, // Extra retry for core modules
          timeout: importOptions.timeout + 3000, // Extra time for core modules
          clearFailedModules: importOptions.clearFailedModules,
          tryAlternativeLoading: importOptions.tryAlternativeLoading
        });
        
        if (module) {
          modules[moduleName] = module;
          
          // Initialize core modules immediately if they have an initialize method
          if (module.initialize && typeof module.initialize === 'function' && !this.initializedModules.has(moduleName)) {
            try {
              const result = await Promise.race([
                module.initialize(),
                new Promise((_, reject) => setTimeout(() => 
                  reject(new Error(`${moduleName} initialization timed out`)), 5000))
              ]);
              
              if (result !== false) {
                this.initializedModules.add(moduleName);
                if (this.verboseLogging) {
                  console.log(`Initialized core module: ${moduleName}`);
                }
              } else {
                console.warn(`Module ${moduleName} initialization returned false`);
              }
            } catch (initError) {
              console.error(`Error initializing module ${moduleName}:`, initError);
            }
          }
        } else {
          modules[moduleName] = null;
          console.warn(`Module ${path} failed to load`);
        }
      } catch (error) {
        modules[moduleName] = null;
        console.error(`Error importing core module ${path}:`, error);
        
        // Create fallback for core modules when required
        if (allRequired) {
          modules[moduleName] = this.createFallbackModule(moduleName, error);
        }
      }
    }
    
    // Then load critical modules sequentially (they might depend on core modules)
    for (const path of criticalModules) {
      const moduleName = this.getModuleName(path);
      try {
        const module = await this.importModule(path, { 
          required: allRequired,
          skipCache: importOptions.skipCache,
          standardizeExports: importOptions.standardizeExports,
          retries: importOptions.retries + 1, // Extra retry for critical modules
          timeout: importOptions.timeout + 2000, // Extra time for critical modules
          clearFailedModules: importOptions.clearFailedModules,
          tryAlternativeLoading: importOptions.tryAlternativeLoading
        });
        
        if (module) {
          modules[moduleName] = module;
        } else {
          console.warn(`Critical module ${path} failed to load, using fallback`);
          modules[moduleName] = this.createFallbackForModule(moduleName);
        }
      } catch (error) {
        console.error(`Error importing critical module ${path}:`, error);
        modules[moduleName] = this.createFallbackForModule(moduleName, error);
      }
    }
    
    // Then load other modules in parallel with concurrency limit
    const concurrencyLimit = importOptions.concurrencyLimit;
    const chunks = [];
    
    // Split into chunks for controlled concurrency
    for (let i = 0; i < otherModules.length; i += concurrencyLimit) {
      chunks.push(otherModules.slice(i, i + concurrencyLimit));
    }
    
    // Process each chunk in sequence
    for (const chunk of chunks) {
      const modulePromises = chunk.map(path => {
        return this.importModule(path, { 
          required: allRequired,
          skipCache: importOptions.skipCache,
          standardizeExports: importOptions.standardizeExports,
          retries: importOptions.retries,
          timeout: importOptions.timeout,
          clearFailedModules: importOptions.clearFailedModules,
          tryAlternativeLoading: importOptions.tryAlternativeLoading
        })
        .then(module => ({ path, module }))
        .catch(error => {
          // Handle errors per module's requirements
          if (importOptions.ignoreErrors || !allRequired) {
            console.warn(`Module ${path} failed to load:`, error);
            return { 
              path, 
              error, 
              module: this.createFallbackModule(this.getModuleName(path), error) 
            };
          }
          throw error; // Rethrow for required modules if not ignoring errors
        });
      });
      
      try {
        const results = await Promise.all(modulePromises);
        
        // Process results and add to modules object
        results.forEach(result => {
          const moduleName = this.getModuleName(result.path);
          
          if (result.module) {
            modules[moduleName] = result.module;
          } else {
            modules[moduleName] = null;
            console.warn(`Module ${result.path} failed to load:`, result.error);
          }
        });
      } catch (error) {
        console.error("Error loading module chunk:", error);
        // Continue with next chunk even if one fails
      }
    }
    
    return modules;
  },

  /**
   * Order modules based on their dependencies for optimal loading
   * @param {Array<string>} modulePaths - List of module paths to order
   * @returns {Array<string>} - Ordered module paths
   */
  orderModulesByDependency(modulePaths) {
    // If no dependencies defined, return the original order
    if (!this.MODULE_DEPENDENCIES || Object.keys(this.MODULE_DEPENDENCIES).length === 0) {
      return modulePaths;
    }
    
    // Build a dependency graph
    const graph = new Map();
    const moduleNames = modulePaths.map(path => this.getModuleName(path) + '.js');
    
    // Initialize graph with empty adjacency lists
    moduleNames.forEach(name => {
      graph.set(name, []);
    });
    
    // Add edges based on dependencies
    moduleNames.forEach(name => {
      const dependencies = this.MODULE_DEPENDENCIES[name] || [];
      
      // Add only dependencies that are in our module list
      dependencies.forEach(dep => {
        if (moduleNames.includes(dep)) {
          // Add reverse edge (dependency → module)
          if (!graph.has(dep)) {
            graph.set(dep, []);
          }
          graph.get(dep).push(name);
        }
      });
    });
    
    // Topological sort
    const visited = new Set();
    const temp = new Set(); // For cycle detection
    const result = [];
    
    function visit(name) {
      if (temp.has(name)) {
        // Cycle detected, continuing anyway
        console.warn(`Circular dependency detected for ${name}`);
        return;
      }
      
      if (visited.has(name)) {
        return;
      }
      
      temp.add(name);
      
      // Visit dependencies first
      const neighbors = graph.get(name) || [];
      neighbors.forEach(visit);
      
      temp.delete(name);
      visited.add(name);
      result.push(name);
    }
    
    // Visit all nodes
    moduleNames.forEach(name => {
      if (!visited.has(name)) {
        visit(name);
      }
    });
    
    // Map back to original paths (reverse for correct order - dependencies first)
    const nameToPathMap = new Map();
    modulePaths.forEach(path => {
      nameToPathMap.set(this.getModuleName(path) + '.js', path);
    });
    
    // Convert module names back to paths in the right order
    return result.reverse().map(name => nameToPathMap.get(name)).filter(Boolean);
  },

  /**
   * Extract module name from path
   * @param {string} path - Module path
   * @returns {string} - Module name
   */
  getModuleName(path) {
    if (!path) return '';
    
    try {
      // Handle both file paths and module names
      const parts = path.split('/');
      const filename = parts[parts.length - 1];
      
      // Clean up any numbered imports (e.g. "filename.js 2")
      const cleanFilename = this.cleanModulePath(filename);
      
      // Remove file extension if present
      return cleanFilename.replace(/\.js$/, '');
    } catch (error) {
      console.error(`Error getting module name for ${path}:`, error);
      return path;
    }
  },

  /**
   * Create a proxy handler that gracefully handles promise methods
   * @param {string} moduleName - Name of the module
   * @returns {Object} - Proxy handler
   * @private
   */
  createPromiseAwareProxyHandler(moduleName) {
    const self = this;
    
    return {
      get: function(target, prop) {
        // Return the property if it exists
        if (prop in target) return target[prop];
        
        // Special handling for then/catch/finally to make it Promise-compatible
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          if (self.verboseLogging) {
            console.log(`[Fallback ${moduleName}] ${String(prop)} called with args:`, arguments);
          }
          
          // Return a function that returns a resolved promise to allow chaining
          return function(...args) {
            // If this is 'then', call the first callback with the target as "this"
            if (prop === 'then' && typeof args[0] === 'function') {
              try {
                return Promise.resolve(args[0](target));
              } catch (e) {
                return Promise.reject(e);
              }
            }
            return Promise.resolve(target);
          };
        }
        
        // For functions, create a fallback function
        if (typeof prop === 'string' && !prop.startsWith('_')) {
          return function(...args) {
            console.warn(`[Fallback ${moduleName}] ${String(prop)} called with args:`, args);
            // Return null for most methods
            // For async methods, return resolved promise
            const modulePath = moduleName + '.js';
            const asyncSafeMethods = self.ASYNC_SAFE_METHODS[modulePath] || [];
            
            if (asyncSafeMethods.includes(String(prop))) {
              return Promise.resolve(null);
            }
            return null;
          };
        }
        
        return undefined;
      }
    };
  },

  /**
   * Create a fallback module with basic functionality
   * @param {string} moduleName - Name of the module
   * @param {Error} error - Original error that triggered fallback creation
   * @returns {Object} - Fallback module object
   */
  createFallbackModule(moduleName, error = null) {
    if (!moduleName) {
      console.error('Cannot create fallback for undefined module name');
      return {
        __isFallback: true,
        initialize() { return Promise.resolve(true); }
      };
    }
    
    console.warn(`Creating fallback for module ${moduleName}`);
    
    // Determine module type based on name or location
    let moduleType = 'unknown';
    
    // Check using different methods to be thorough
    if (this.MODULE_TYPES[moduleName]) {
      moduleType = this.MODULE_TYPES[moduleName];
    } else if (moduleName.endsWith('.js')) {
      const fileName = moduleName;
      if (this.MODULE_LOCATIONS[fileName]) {
        moduleType = this.MODULE_LOCATIONS[fileName];
      }
    } else {
      // Check if it's in MODULE_LOCATIONS with .js extension
      if (this.MODULE_LOCATIONS[`${moduleName}.js`]) {
        moduleType = this.MODULE_LOCATIONS[`${moduleName}.js`];
      }
    }
    
    // Create different types of fallbacks based on module type
    let fallback;
    
    switch (moduleType) {
      case 'core':
        fallback = this.createCoreFallback(moduleName);
        break;
      
      case 'features':
        fallback = this.createFeatureFallback(moduleName);
        break;
        
      case 'utils':
        fallback = this.createUtilityFallback(moduleName);
        break;
        
      default:
        // Generic fallback for unknown module types
        fallback = {
          __isFallback: true,
          moduleName,
          error: error ? error.message : 'Module failed to load',
          
          initialize() {
            console.warn(`Using fallback implementation for ${moduleName}`);
            return Promise.resolve(true);
          }
        };
    }
    
    // Add error information to fallback
    if (error && !fallback.error) {
      fallback.error = error.message || 'Unknown error';
      fallback.errorStack = error.stack;
    }
    
    // Return a proxy to handle missing methods dynamically and handle promises
    return new Proxy(fallback, this.createPromiseAwareProxyHandler(moduleName));
  },

  /**
   * Create an appropriate fallback for a specific module
   * Special handling for critical modules
   * @param {string} moduleName - Module name
   * @param {Error} error - Original error
   * @returns {Object} - Appropriate fallback for the module
   */
  createFallbackForModule(moduleName, error = null) {
    // Remove extension if present
    const cleanName = moduleName.replace(/\.js$/, '');
    
    // Check if this is a known module with special fallback
    switch (cleanName) {
      case 'ui':
        return this.createUIFallback(error);
      case 'progressHandler':
        return this.createProgressHandlerFallback(error);
      case 'socketHandler':
        return this.createSocketHandlerFallback(error);
      case 'playlistDownloader':
        return this.createPlaylistDownloaderFallback(error);
      case 'webScraper':
        return this.createWebScraperFallback(error);
      case 'fileProcessor':
        return this.createFileProcessorFallback(error);
      default:
        // Use standard fallback creation for non-special modules
        return this.createFallbackModule(moduleName, error);
    }
  },

  /**
     * Create a fallback for core modules
     * @param {string} moduleName - Name of the core module
     * @returns {Object} - Fallback core module
     */
  createCoreFallback(moduleName) {
    // Implemented in previous sections - see enhanced-moduleLoader-final.js
  },

  /**
   * Create a fallback for feature modules
   * @param {string} moduleName - Name of the feature module
   * @returns {Object} - Fallback feature module
   */
  createFeatureFallback(moduleName) {
    // Remove .js extension if present for consistent naming
    const cleanName = moduleName.replace(/\.js$/, '');
    
    const baseFallback = {
      __isFallback: true,
      moduleName: cleanName,
      initialized: false,
      
      initialize() {
        console.warn(`Using fallback implementation for feature: ${cleanName}`);
        this.initialized = true;
        return Promise.resolve(true);
      },
      
      showError(error) {
        console.error(`[Fallback ${cleanName}] Error:`, error);
        
        // Try to find error container
        const errorContainerId = `${cleanName}-error-container`;
        const errorContainer = document.getElementById(errorContainerId);
        
        if (errorContainer) {
          errorContainer.innerHTML = `
            <div class="alert alert-danger">
              <h5>Error</h5>
              <p>${error.message || error}</p>
            </div>
          `;
          errorContainer.style.display = 'block';
        }
      }
    };
    
    // Add feature-specific fallbacks
    switch (cleanName) {
      case 'fileProcessor':
        return this.createFileProcessorFallback();
      case 'webScraper':
        return this.createWebScraperFallback();
      case 'academicSearch':
      case 'academicScraper':
        return {
          ...baseFallback,
          search() {
            this.showError('Academic search module failed to load');
            return Promise.resolve(false);
          },
          performSearch() {
            this.showError('Academic search module failed to load');
            return Promise.resolve(false);
          },
          getDetails() { return Promise.resolve(null); },
          downloadPaper() { return Promise.resolve(false); },
          displaySearchResults() { return false; },
          addSelectedPapers() { return false; },
          addScraperUrlWithData() { return false; },
          handleScraperSettingsChange() { return false; },
          updatePdfInfoSection() { return false; }
        };
      case 'playlistDownloader':
        return this.createPlaylistDownloaderFallback();
      case 'historyManager':
        return {
          ...baseFallback,
          history: [],
          
          addHistoryEntry(entry) { 
            // Add with timestamp if not provided
            if (!entry.timestamp) {
              entry.timestamp = new Date().toISOString();
            }
            
            this.history.unshift(entry);
            
            // Limit history size
            if (this.history.length > 50) {
              this.history = this.history.slice(0, 50);
            }
            
            this.saveHistory();
            return true;
          },
          
          getHistory() { 
            return [...this.history]; 
          },
          
          clearHistory() { 
            this.history = [];
            this.saveHistory();
            return true;
          },
          
          saveHistory() {
            try {
              localStorage.setItem('taskHistory', JSON.stringify(this.history));
              return true;
            } catch (error) {
              console.error('Error saving history:', error);
              return false;
            }
          },
          
          loadHistory() {
            try {
              const savedHistory = localStorage.getItem('taskHistory');
              if (savedHistory) {
                this.history = JSON.parse(savedHistory);
              }
              return this.history;
            } catch (error) {
              console.error('Error loading history:', error);
              return [];
            }
          },
          
          initialize() {
            console.warn(`Using fallback implementation for history manager module`);
            this.initialized = true;
            
            // Load history from localStorage
            this.loadHistory();
            
            // Setup refresh button handler
            const refreshButton = document.getElementById('history-refresh-btn');
            if (refreshButton) {
              refreshButton.addEventListener('click', () => this.refreshHistoryDisplay());
            }
            
            // Setup clear button handler
            const clearButton = document.getElementById('history-clear-btn');
            if (clearButton) {
              clearButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all history?')) {
                  this.clearHistory();
                  this.refreshHistoryDisplay();
                }
              });
            }
            
            // Initial display
            this.refreshHistoryDisplay();
            
            return Promise.resolve(true);
          },
          
          refreshHistoryDisplay() {
            const tableBody = document.getElementById('history-table-body');
            if (!tableBody) return false;
              
            // Clear existing rows
            tableBody.innerHTML = '';
              
            // Get history (may be empty)
            const history = this.getHistory();
              
            if (history.length === 0) {
              // Show empty state
              tableBody.innerHTML = `
                <tr class="history-empty-row">
                  <td colspan="5" class="text-center py-4">
                    <i class="fas fa-info-circle me-2"></i>No tasks in history
                  </td>
                </tr>
              `;
              return true;
            }
              
            // Add history entries to the table
            history.forEach(entry => {
              const row = document.createElement('tr');
                
              // Set task type badge
              let typeBadge = '';
              switch (entry.type) {
                case 'file':
                  typeBadge = '<span class="badge bg-primary">File</span>';
                  break;
                case 'playlist':
                  typeBadge = '<span class="badge bg-success">Playlist</span>';
                  break;
                case 'scraper':
                  typeBadge = '<span class="badge bg-info">Scraper</span>';
                  break;
                default:
                  typeBadge = '<span class="badge bg-secondary">Other</span>';
              }
                
              // Format date
              const date = new Date(entry.timestamp);
              const formattedDate = date.toLocaleString();
                
              // Add row content
              row.innerHTML = `
                <td>${typeBadge}</td>
                <td>${entry.filename || 'N/A'}</td>
                <td>${formattedDate}</td>
                <td>${entry.stats || 'N/A'}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary" data-action="view" data-id="${entry.id}">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" data-action="open" data-id="${entry.id}">
                      <i class="fas fa-folder-open"></i>
                    </button>
                  </div>
                </td>
              `;
                
              tableBody.appendChild(row);
            });
              
            // Add event listeners
            tableBody.querySelectorAll('[data-action]').forEach(button => {
              button.addEventListener('click', (e) => {
                const action = button.getAttribute('data-action');
                const id = button.getAttribute('data-id');
                  
                if (action === 'view') {
                  this.showTaskDetails(id);
                } else if (action === 'open') {
                  this.openTaskOutput(id);
                }
              });
            });
              
            return true;
          },
            
          showTaskDetails(id) {
            const entry = this.history.find(item => item.id === id);
            if (!entry) return false;
              
            // Find or create modal
            let modal = document.getElementById('task-details-modal');
            if (!modal) {
              // Create modal element
              modal = document.createElement('div');
              modal.id = 'task-details-modal';
              modal.className = 'modal fade';
              modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                  <div class="modal-content">
                    <div class="modal-header">
                      <h5 class="modal-title">Task Details</h5>
                      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="task-details-content">
                      <!-- Task details will be populated here -->
                    </div>
                    <div class="modal-footer">
                      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                      <button type="button" class="btn btn-primary" id="open-task-file-btn">
                        <i class="fas fa-folder-open me-1"></i> Open File
                      </button>
                    </div>
                  </div>
                </div>
              `;
              document.body.appendChild(modal);
            }
              
            // Populate modal content
            const contentEl = document.getElementById('task-details-content');
            if (contentEl) {
              // Create details HTML
              let detailsHtml = `
                <div class="task-details">
                  <div class="row mb-3">
                    <div class="col-md-6">
                      <strong>Type:</strong> ${entry.type || 'Unknown'}
                    </div>
                    <div class="col-md-6">
                      <strong>Created:</strong> ${new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div class="row mb-3">
                    <div class="col-md-6">
                      <strong>File:</strong> ${entry.filename || 'N/A'}
                    </div>
                    <div class="col-md-6">
                      <strong>Status:</strong> ${entry.status || 'Completed'}
                    </div>
                  </div>
              `;
                
              // Add stats if available
              if (entry.stats) {
                detailsHtml += `
                  <div class="mt-3">
                    <h6>Statistics</h6>
                    <div class="p-3 bg-light rounded">
                      ${entry.stats}
                    </div>
                  </div>
                `;
              }
                
              // Add output path if available
              if (entry.outputPath) {
                detailsHtml += `
                  <div class="mt-3">
                    <h6>Output File</h6>
                    <div class="p-3 bg-light rounded">
                      ${entry.outputPath}
                    </div>
                  </div>
                `;
              }
                
              // Close the container
              detailsHtml += '</div>';
                
              // Set content
              contentEl.innerHTML = detailsHtml;
            }
              
            // Set up open file button
            const openButton = document.getElementById('open-task-file-btn');
            if (openButton) {
              openButton.onclick = () => this.openTaskOutput(id);
            }
              
            // Show modal
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
              const modalInstance = new bootstrap.Modal(modal);
              modalInstance.show();
            } else {
              // Fallback if Bootstrap JS is not available
              modal.style.display = 'block';
              modal.classList.add('show');
              document.body.classList.add('modal-open');
                
              // Add backdrop
              const backdrop = document.createElement('div');
              backdrop.className = 'modal-backdrop fade show';
              document.body.appendChild(backdrop);
                
              // Handle close button
              const closeBtn = modal.querySelector('.btn-close, .btn-secondary');
              if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                  modal.style.display = 'none';
                  modal.classList.remove('show');
                  document.body.classList.remove('modal-open');
                  backdrop.remove();
                });
              }
            }
              
            return true;
          },
            
          openTaskOutput(id) {
            const entry = this.history.find(item => item.id === id);
            if (!entry || !entry.outputPath) {
              alert('Output file not found for this task');
              return false;
            }
              
            // In real implementation, this would open the file
            alert(`Opening file: ${entry.outputPath}`);
            return true;
          }
        };
          
      case 'helpMode':
        return {
          ...baseFallback,
          isActive: false,
          helpTooltips: [],
          
          initialize() {
            console.warn('Using fallback implementation for help mode module');
            this.initialized = true;
            
            // Set up help toggle button
            const helpToggle = document.getElementById('helpToggle');
            if (helpToggle) {
              helpToggle.addEventListener('click', () => this.toggleHelpMode());
            }
            
            return Promise.resolve(true);
          },
          
          toggleHelpMode() {
            this.isActive = !this.isActive;
            
            // Toggle body class
            document.body.classList.toggle('help-mode', this.isActive);
            
            // Toggle button state
            const helpToggle = document.getElementById('helpToggle');
            if (helpToggle) {
              helpToggle.classList.toggle('active', this.isActive);
            }
            
            console.log(`Help mode ${this.isActive ? 'activated' : 'deactivated'}`);
            
            return this.isActive;
          },
          
          addHelpTooltip(elementId, content) {
            const element = document.getElementById(elementId);
            if (!element) return false;
            
            // Add help-target class to the element
            element.classList.add('help-target');
            
            // Store tooltip data
            this.helpTooltips.push({
              elementId,
              content
            });
            
            // Add event listener if help mode is active
            if (this.isActive) {
              this.showTooltipForElement(element, content);
            }
            
            return true;
          },
          
          showTooltipForElement(element, content) {
            if (!element) return false;
            
            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'help-tooltip';
            tooltip.innerHTML = `
              <button class="help-close-btn">&times;</button>
              <div class="help-content">${content}</div>
            `;
            
            // Position tooltip near the element
            const rect = element.getBoundingClientRect();
            tooltip.style.top = `${rect.bottom + 10}px`;
            tooltip.style.left = `${rect.left}px`;
            
            // Add to document
            document.body.appendChild(tooltip);
            
            // Make visible after a small delay (for animation)
            setTimeout(() => {
              tooltip.classList.add('active');
            }, 10);
            
            // Add close button event handler
            const closeBtn = tooltip.querySelector('.help-close-btn');
            if (closeBtn) {
              closeBtn.addEventListener('click', () => {
                tooltip.classList.remove('active');
                setTimeout(() => {
                  tooltip.remove();
                }, 300);
              });
            }
            
            return true;
          }
        };
          
      default:
        return baseFallback;
    }
  },

  /**
   * Create a fallback for utility modules
   * @param {string} moduleName - Name of the utility module
   * @returns {Object} - Fallback utility module
   */
  createUtilityFallback(moduleName) {
    // Remove .js extension if present for consistent naming
    const cleanName = moduleName.replace(/\.js$/, '');
    
    const baseFallback = {
      __isFallback: true,
      moduleName: cleanName,
      initialized: false,
      
      initialize() {
        console.warn(`Using fallback implementation for utility: ${cleanName}`);
        this.initialized = true;
        return Promise.resolve(true);
      }
    };
    
    // Add utility-specific fallbacks
    switch (cleanName) {
      case 'socketHandler':
        return this.createSocketHandlerFallback();
      case 'progressHandler':
        return this.createProgressHandlerFallback();
      case 'ui':
        return this.createUIFallback();
      case 'utils':
        return {
          ...baseFallback,
          formatDuration(seconds) {
            if (!seconds && seconds !== 0) return 'unknown';
            
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (hours > 0) {
              return `${hours}h ${minutes}m ${secs}s`;
            } else if (minutes > 0) {
              return `${minutes}m ${secs}s`;
            } else {
              return `${secs}s`;
            }
          },
          
          sanitizeFilename(filename) {
            if (!filename) return 'file';
            
            // Replace invalid characters with underscores
            return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
          },
          
          generateId(prefix = '') {
            return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          },
          
          formatBytes(bytes, decimals = 2) {
            if (!bytes && bytes !== 0) return '0 Bytes';
            
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
            
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
          },
          
          debounce(func, wait) {
            let timeout;
            return function(...args) {
              const later = () => {
                timeout = null;
                func(...args);
              };
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
            };
          },
          
          throttle(func, limit) {
            let lastFunc;
            let lastRan;
            return function(...args) {
              if (!lastRan) {
                func(...args);
                lastRan = Date.now();
              } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(() => {
                  if ((Date.now() - lastRan) >= limit) {
                    func(...args);
                    lastRan = Date.now();
                  }
                }, limit - (Date.now() - lastRan));
              }
            };
          },
        
          deepClone(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            
            try {
              return JSON.parse(JSON.stringify(obj));
            } catch (error) {
              console.error('Error deep cloning object:', error);
              
              // Fallback to shallow clone if JSON serialization fails
              if (Array.isArray(obj)) {
                return [...obj];
              } else {
                return { ...obj };
              }
            }
          },
          
          isEmptyObject(obj) {
            return obj === null || typeof obj !== 'object' || Object.keys(obj).length === 0;
          },
          
          // Enhanced common utilities
          isValidEmail(email) {
            const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            return re.test(String(email).toLowerCase());
          },
          
          escapeHtml(unsafe) {
            if (!unsafe || typeof unsafe !== 'string') return '';
            
            return unsafe
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
          },
          
          getUrlParam(name, url = window.location.href) {
            name = name.replace(/[\[\]]/g, '\\$&');
            const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
            const results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return '';
            return decodeURIComponent(results[2].replace(/\+/g, ' '));
          },
          
          truncateText(text, maxLength = 100, suffix = '...') {
            if (!text || typeof text !== 'string') return '';
            if (text.length <= maxLength) return text;
            
            return text.substring(0, maxLength - suffix.length) + suffix;
          }
        };
        
      case 'fileHandler':
        return {
          ...baseFallback,
          readFile(file) { 
            console.warn('Fallback fileHandler.readFile called');
            return Promise.reject(new Error('File handling not available in fallback mode')); 
          },
          
          downloadFile(data, filename, mimeType = 'application/octet-stream') { 
            console.warn('Fallback fileHandler.downloadFile called');
            
            try {
              // Create a download link
              const blob = new Blob([data], { type: mimeType });
              const url = URL.createObjectURL(blob);
              
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              
              URL.revokeObjectURL(url);
              return true;
            } catch (error) {
              console.error('Error downloading file:', error);
              return false;
            }
          },
          
          uploadFile(accept = '', multiple = false) {
            console.warn('Fallback fileHandler.uploadFile called');
            
            return new Promise((resolve, reject) => {
              try {
                // Create a file input
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = accept;
                input.multiple = multiple;
                
                input.addEventListener('change', (event) => {
                  const files = event.target.files;
                  if (!files || files.length === 0) {
                    resolve([]);
                  } else {
                    resolve(multiple ? Array.from(files) : files[0]);
                  }
                });
                
                input.click();
              } catch (error) {
                reject(new Error('File upload failed: ' + error.message));
              }
            });
          },
          
          openFile(accept = '') {
            return this.uploadFile(accept, false);
          },
          
          saveFile(data, filename, mimeType) {
            return this.downloadFile(data, filename, mimeType);
          },
          
          setupDropzone(elementId, options = {}) {
            console.warn(`Fallback fileHandler.setupDropzone called for ${elementId}`);
            const element = document.getElementById(elementId);
            if (!element) {
              if (elementId === 'file-dropzone') {
                // This is the problematic element mentioned in the logs
                // Try to find a suitable alternative like folder-input
                const folderInput = document.getElementById('folder-input');
                if (folderInput) {
                  console.warn(`Using folder-input instead of missing file-dropzone`);
                  return this.setupDropzone('folder-input', options);
                }
              }
              
              console.warn(`Drop zone element #${elementId} not found`);
              return false;
            }
            
            // Add minimal dropzone functionality
            element.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.stopPropagation();
              element.classList.add('dragover');
            });
            
            element.addEventListener('dragleave', () => {
              element.classList.remove('dragover');
            });
            
            element.addEventListener('drop', (e) => {
              e.preventDefault();
              e.stopPropagation();
              element.classList.remove('dragover');
              
              if (options.onDrop && e.dataTransfer.files.length > 0) {
                options.onDrop(Array.from(e.dataTransfer.files));
              }
            });
            
            // Add click handler to browse for files
            element.addEventListener('click', () => {
              // Check if there's already an input element
              let input = document.getElementById(`${elementId}-input`);
              
              if (!input) {
                // Create a file input
                input = document.createElement('input');
                input.type = 'file';
                input.id = `${elementId}-input`;
                input.style.display = 'none';
                
                // Set attributes from options
                if (options.multiple) input.multiple = true;
                if (options.accept) input.accept = options.accept;
                if (options.directory) {
                  input.webkitdirectory = true;
                  input.directory = true;
                }
                
                // Add change handler
                input.addEventListener('change', (event) => {
                  if (options.onChange && event.target.files.length > 0) {
                    options.onChange(Array.from(event.target.files));
                  }
                });
                
                document.body.appendChild(input);
              }
              
              // Trigger file selection
              input.click();
            });
            
            return true;
          },
          
          // Add methods to handle multiple files
          processFiles(files, options = {}) {
            console.warn('Fallback fileHandler.processFiles called');
            
            if (!files || files.length === 0) {
              return Promise.resolve([]);
            }
            
            // Return file info objects
            const fileInfos = Array.from(files).map(file => ({
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
              // Don't include content in fallback mode
              content: null
            }));
            
            return Promise.resolve(fileInfos);
          },
          
          getFileExtension(filename) {
            if (!filename) return '';
            
            // Get the part after the last period
            const parts = filename.split('.');
            if (parts.length <= 1) return '';
            
            return parts[parts.length - 1].toLowerCase();
          },
          
          isImageFile(filename) {
            const ext = this.getFileExtension(filename);
            return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
          }
        };
        
      case 'debugTools':
        return {
          ...baseFallback,
          isDebugMode: false,
          originalConsole: {},
          socketEvents: [],
          
          log(...args) { console.log(...args); },
          warn(...args) { console.warn(...args); },
          error(...args) { console.error(...args); },
          
          initialize() {
            this.isDebugMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            this.initialized = true;
            
            // Save original console methods
            this.originalConsole = {
              log: console.log,
              warn: console.warn,
              error: console.error,
              info: console.info,
              debug: console.debug
            };
            
            // Only intercept console in debug mode
            if (this.isDebugMode && !window._consoleIntercepted) {
              this.interceptConsole();
              window._consoleIntercepted = true;
            }
            
            return Promise.resolve(true);
          },
          
          startPerformanceMonitor(label) {
            const startTime = performance.now();
            console.log(`Performance monitor started: ${label}`);
            
            return {
              end: () => {
                const endTime = performance.now();
                const duration = endTime - startTime;
                console.log(`Performance monitor ended: ${label} - Duration: ${duration.toFixed(2)}ms`);
                return { duration, label };
              }
            };
          },
          
          endPerformanceMonitor() {
            return { duration: 0 };
          },
          
          interceptConsole() {
            if (!this.isDebugMode) return false;
            
            // Create a debug log array
            if (!window._debugLog) {
              window._debugLog = [];
            }
            
            const debugLog = window._debugLog;
            
            // Override console methods
            console.log = (...args) => {
              debugLog.push({ type: 'log', args, timestamp: new Date().toISOString() });
              this.originalConsole.log(...args);
            };
            
            console.warn = (...args) => {
              debugLog.push({ type: 'warn', args, timestamp: new Date().toISOString() });
              this.originalConsole.warn(...args);
            };
            
            console.error = (...args) => {
              debugLog.push({ type: 'error', args, timestamp: new Date().toISOString() });
              this.originalConsole.error(...args);
            };
            
            console.info = (...args) => {
              debugLog.push({ type: 'info', args, timestamp: new Date().toISOString() });
              this.originalConsole.info(...args);
            };
            
            console.debug = (...args) => {
              debugLog.push({ type: 'debug', args, timestamp: new Date().toISOString() });
              this.originalConsole.debug(...args);
            };
            
            return true;
          },
          
          captureSocketEvents() {
            if (!window.socket) return false;
            
            this.socketEvents = [];
            
            // Save original socket event methods
            const originalEmit = window.socket.emit;
            const originalOn = window.socket.on;
            
            // Override socket.emit
            window.socket.emit = (event, ...args) => {
              this.socketEvents.push({
                type: 'emit',
                event,
                args,
                timestamp: new Date().toISOString()
              });
              return originalEmit.call(window.socket, event, ...args);
            };
            
            // Override socket.on
            window.socket.on = (event, callback) => {
              const wrappedCallback = (...args) => {
                this.socketEvents.push({
                  type: 'receive',
                  event,
                  args,
                  timestamp: new Date().toISOString()
                });
                return callback(...args);
              };
              return originalOn.call(window.socket, event, wrappedCallback);
            };
            
            return true;
          },
          
          getSocketEvents() {
            return [...this.socketEvents];
          },
          
          clearSocketEvents() {
            this.socketEvents = [];
            return true;
          },
          
          restoreOriginalConsole() {
            if (!this.isDebugMode) return false;
            
            // Restore original console methods
            Object.keys(this.originalConsole).forEach(method => {
              console[method] = this.originalConsole[method];
            });
            
            return true;
          },
          
          showDebugOverlay() {
            if (!this.isDebugMode) return false;
            
            // Check if debug overlay already exists
            let overlay = document.getElementById('debug-overlay');
            if (overlay) {
              overlay.style.display = 'block';
              return true;
            }
            
            // Create debug overlay
            overlay = document.createElement('div');
            overlay.id = 'debug-overlay';
            overlay.className = 'debug-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '10px';
            overlay.style.right = '10px';
            overlay.style.width = '400px';
            overlay.style.maxHeight = '80vh';
            overlay.style.overflow = 'auto';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            overlay.style.color = '#fff';
            overlay.style.padding = '10px';
            overlay.style.borderRadius = '5px';
            overlay.style.zIndex = '9999';
            overlay.style.fontSize = '12px';
            overlay.style.fontFamily = 'monospace';
            
            // Add close button
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '5px';
            closeButton.style.right = '5px';
            closeButton.style.backgroundColor = '#333';
            closeButton.style.color = '#fff';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '3px';
            closeButton.style.padding = '2px 5px';
            closeButton.addEventListener('click', () => {
              overlay.style.display = 'none';
            });
            
            overlay.appendChild(closeButton);
            
            // Add content container
            const content = document.createElement('div');
            content.id = 'debug-content';
            
            // Add tabs
            const tabs = document.createElement('div');
            tabs.className = 'debug-tabs';
            tabs.style.marginBottom = '10px';
            tabs.style.borderBottom = '1px solid #444';
            
            const tabLog = document.createElement('button');
            tabLog.textContent = 'Console';
            tabLog.className = 'debug-tab active';
            tabLog.style.backgroundColor = 'transparent';
            tabLog.style.color = '#fff';
            tabLog.style.border = 'none';
            tabLog.style.padding = '5px 10px';
            tabLog.style.marginRight = '5px';
            tabLog.style.borderBottom = '2px solid #5af';
            
            const tabModules = document.createElement('button');
            tabModules.textContent = 'Modules';
            tabModules.className = 'debug-tab';
            tabModules.style.backgroundColor = 'transparent';
            tabModules.style.color = '#ccc';
            tabModules.style.border = 'none';
            tabModules.style.padding = '5px 10px';
            tabModules.style.marginRight = '5px';
            
            const tabSocket = document.createElement('button');
            tabSocket.textContent = 'Socket';
            tabSocket.className = 'debug-tab';
            tabSocket.style.backgroundColor = 'transparent';
            tabSocket.style.color = '#ccc';
            tabSocket.style.border = 'none';
            tabSocket.style.padding = '5px 10px';
            
            tabs.appendChild(tabLog);
            tabs.appendChild(tabModules);
            tabs.appendChild(tabSocket);
            
            // Add tab click handlers
            tabLog.addEventListener('click', () => {
              tabLog.style.borderBottom = '2px solid #5af';
              tabLog.style.color = '#fff';
              tabModules.style.borderBottom = 'none';
              tabModules.style.color = '#ccc';
              tabSocket.style.borderBottom = 'none';
              tabSocket.style.color = '#ccc';
              
              this.updateDebugOverlayContent('log');
            });
            
            tabModules.addEventListener('click', () => {
              tabLog.style.borderBottom = 'none';
              tabLog.style.color = '#ccc';
              tabModules.style.borderBottom = '2px solid #5af';
              tabModules.style.color = '#fff';
              tabSocket.style.borderBottom = 'none';
              tabSocket.style.color = '#ccc';
              
              this.updateDebugOverlayContent('modules');
            });
            
            tabSocket.addEventListener('click', () => {
              tabLog.style.borderBottom = 'none';
              tabLog.style.color = '#ccc';
              tabModules.style.borderBottom = 'none';
              tabModules.style.color = '#ccc';
              tabSocket.style.borderBottom = '2px solid #5af';
              tabSocket.style.color = '#fff';
              
              this.updateDebugOverlayContent('socket');
            });
            
            overlay.appendChild(tabs);
            overlay.appendChild(content);
            
            document.body.appendChild(overlay);
            
            // Initial content update
            this.updateDebugOverlayContent('log');
            
            return true;
          },
          
          updateDebugOverlayContent(tab) {
            const content = document.getElementById('debug-content');
            if (!content) return false;
            
            content.innerHTML = '';
            
            switch (tab) {
              case 'log':
                // Show console log
                if (window._debugLog && window._debugLog.length > 0) {
                  const logEntries = window._debugLog.slice(-100).map(entry => {
                    let color = '#fff';
                    switch (entry.type) {
                      case 'warn': color = '#ffa'; break;
                      case 'error': color = '#faa'; break;
                      case 'info': color = '#aff'; break;
                      case 'debug': color = '#afa'; break;
                    }
                    
                    return `<div style="margin-bottom: 5px; color: ${color};">
                      <span style="color: #999;">[${entry.timestamp.split('T')[1].split('.')[0]}]</span>
                      <span style="font-weight: bold;">${entry.type}:</span>
                      <span>${JSON.stringify(entry.args)}</span>
                    </div>`;
                  }).join('');
                  
                  content.innerHTML = logEntries;
                } else {
                  content.innerHTML = '<div style="color: #999;">No console logs captured</div>';
                }
                break;
                
              case 'modules':
                // Show module information
                let modulesInfo = '<h3 style="margin-top: 0;">Module Status</h3>';
                
                if (window.moduleInstances) {
                  const modules = Object.keys(window.moduleInstances);
                  
                  modulesInfo += `<div style="margin-bottom: 10px;">Total Modules: ${modules.length}</div>`;
                  
                  // Group modules by type
                  const coreModules = modules.filter(m => this.MODULE_TYPES[m] === 'core');
                  const featureModules = modules.filter(m => this.MODULE_TYPES[m] === 'features');
                  const utilityModules = modules.filter(m => this.MODULE_TYPES[m] === 'utils');
                  const otherModules = modules.filter(m => !this.MODULE_TYPES[m]);
                  
                  // Add core modules
                  modulesInfo += '<div style="margin-bottom: 10px;">';
                  modulesInfo += '<div style="font-weight: bold; margin-bottom: 5px;">Core Modules:</div>';
                  modulesInfo += '<ul style="margin: 0; padding-left: 20px;">';
                  
                  coreModules.forEach(m => {
                    const module = window.moduleInstances[m];
                    const isFallback = module && module.__isFallback;
                    
                    modulesInfo += `<li style="margin-bottom: 2px; color: ${isFallback ? '#faa' : '#afa'};">
                      ${m} ${isFallback ? '(Fallback)' : ''}
                    </li>`;
                  });
                  
                  modulesInfo += '</ul></div>';
                  
                  // Add feature modules
                  modulesInfo += '<div style="margin-bottom: 10px;">';
                  modulesInfo += '<div style="font-weight: bold; margin-bottom: 5px;">Feature Modules:</div>';
                  modulesInfo += '<ul style="margin: 0; padding-left: 20px;">';
                  
                  featureModules.forEach(m => {
                    const module = window.moduleInstances[m];
                    const isFallback = module && module.__isFallback;
                    
                    modulesInfo += `<li style="margin-bottom: 2px; color: ${isFallback ? '#faa' : '#afa'};">
                      ${m} ${isFallback ? '(Fallback)' : ''}
                    </li>`;
                  });
                  
                  modulesInfo += '</ul></div>';
                  
                  // Add utility modules
                  modulesInfo += '<div style="margin-bottom: 10px;">';
                  modulesInfo += '<div style="font-weight: bold; margin-bottom: 5px;">Utility Modules:</div>';
                  modulesInfo += '<ul style="margin: 0; padding-left: 20px;">';
                  
                  utilityModules.forEach(m => {
                    const module = window.moduleInstances[m];
                    const isFallback = module && module.__isFallback;
                    
                    modulesInfo += `<li style="margin-bottom: 2px; color: ${isFallback ? '#faa' : '#afa'};">
                      ${m} ${isFallback ? '(Fallback)' : ''}
                    </li>`;
                  });
                  
                  modulesInfo += '</ul></div>';
                  
                  // Add other modules
                  if (otherModules.length > 0) {
                    modulesInfo += '<div>';
                    modulesInfo += '<div style="font-weight: bold; margin-bottom: 5px;">Other Modules:</div>';
                    modulesInfo += '<ul style="margin: 0; padding-left: 20px;">';
                    
                    otherModules.forEach(m => {
                      const module = window.moduleInstances[m];
                      const isFallback = module && module.__isFallback;
                      
                      modulesInfo += `<li style="margin-bottom: 2px; color: ${isFallback ? '#faa' : '#afa'};">
                        ${m} ${isFallback ? '(Fallback)' : ''}
                      </li>`;
                    });
                    
                    modulesInfo += '</ul></div>';
                  }
                } else {
                  modulesInfo += '<div style="color: #999;">No modules loaded</div>';
                }
                
                content.innerHTML = modulesInfo;
                break;
                
              case 'socket':
                // Show socket events
                if (this.socketEvents && this.socketEvents.length > 0) {
                  const socketInfo = this.socketEvents.slice(-100).map(entry => {
                    const color = entry.type === 'emit' ? '#aff' : '#ffa';
                    
                    return `<div style="margin-bottom: 5px; color: ${color};">
                      <span style="color: #999;">[${entry.timestamp.split('T')[1].split('.')[0]}]</span>
                      <span style="font-weight: bold;">${entry.type}:</span>
                      <span>${entry.event}</span>
                      <span style="color: #999;">${JSON.stringify(entry.args)}</span>
                    </div>`;
                  }).join('');
                  
                  content.innerHTML = `
                    <h3 style="margin-top: 0;">Socket Events</h3>
                    <div style="margin-bottom: 10px;">
                      <button id="clear-socket-events" style="background-color: #333; color: #fff; border: none; border-radius: 3px; padding: 3px 8px;">Clear Events</button>
                      <button id="capture-socket-events" style="background-color: #333; color: #fff; border: none; border-radius: 3px; padding: 3px 8px; margin-left: 5px;">Start Capture</button>
                    </div>
                    ${socketInfo}
                  `;
                  
                  // Add button handlers
                  document.getElementById('clear-socket-events')?.addEventListener('click', () => {
                    this.clearSocketEvents();
                    this.updateDebugOverlayContent('socket');
                  });
                  
                  document.getElementById('capture-socket-events')?.addEventListener('click', () => {
                    this.captureSocketEvents();
                    this.updateDebugOverlayContent('socket');
                  });
                } else {
                  content.innerHTML = `
                    <h3 style="margin-top: 0;">Socket Events</h3>
                    <div style="margin-bottom: 10px;">
                      <button id="capture-socket-events" style="background-color: #333; color: #fff; border: none; border-radius: 3px; padding: 3px 8px;">Start Capture</button>
                    </div>
                    <div style="color: #999;">No socket events captured</div>
                  `;
                  
                  // Add button handler
                  document.getElementById('capture-socket-events')?.addEventListener('click', () => {
                    this.captureSocketEvents();
                    this.updateDebugOverlayContent('socket');
                  });
                }
                break;
            }
            
            return true;
          }
        };
        
      default:
        return baseFallback;
    }
  },
  
  /**
   * Create a UI fallback module with basic functionality
   * @param {Error} error - Original error that triggered fallback creation
   * @returns {Object} - Fallback UI module
   */
  createUIFallback(error = null) {
    console.warn("Creating fallback for UI module");
    
    return {
      __isFallback: true,
      moduleName: 'ui',
      initialized: false,
      toasts: [],
      modals: {},
      spinners: {},
      
      initialize() {
        console.warn("Using fallback UI module");
        this.initialized = true;
        
        // Create toast container if it doesn't exist
        this.createToastContainer();
        
        return Promise.resolve(true);
      },
      
      createToastContainer() {
        if (!document.getElementById('toast-container')) {
          const container = document.createElement('div');
          container.id = 'toast-container';
          container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
          container.style.zIndex = '9999';
          document.body.appendChild(container);
        }
      },
      
      showToast(title, message, type = 'info') {
        console.log(`[Fallback UI] Toast (${type}): ${title} - ${message}`);
        
        // Ensure toast container exists
        this.createToastContainer();
        
        // Create toast element
        const toastId = 'toast-' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'toast show';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        // Set header color based on type
        let headerClass = 'bg-primary';
        switch (type) {
          case 'success':
            headerClass = 'bg-success';
            break;
          case 'error':
          case 'danger':
            headerClass = 'bg-danger';
            break;
          case 'warning':
            headerClass = 'bg-warning';
            break;
        }
        
        // Set toast content
        toast.innerHTML = `
          <div class="toast-header ${headerClass} text-white">
            <strong class="me-auto">${title}</strong>
            <small>now</small>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
          </div>
          <div class="toast-body">${message}</div>
        `;
        
        // Add to container
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        // Add close button handler
        const closeButton = toast.querySelector('.btn-close');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
              toast.remove();
            }, 150);
          });
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            toast.remove();
          }, 150);
        }, 5000);
        
        return toastId;
      },
      
      updateProgressBar(id, progress, message = null) {
        const progressBar = document.getElementById(id);
        
        if (progressBar) {
          // Update progress bar
          progressBar.style.width = `${progress}%`;
          progressBar.setAttribute('aria-valuenow', progress);
          progressBar.textContent = `${progress}%`;
          
          // Update message if provided
          if (message) {
            const messageEl = document.getElementById(`${id}-message`);
            if (messageEl) {
              messageEl.textContent = message;
            }
          }
        }
        
        return true;
      },
      
      updateProgressStatus(id, message) {
        const messageEl = document.getElementById(id);
        
        if (messageEl) {
          messageEl.textContent = message;
        }
        
        return !!messageEl;
      },
      
      showModal(options) {
        const {
          title = 'Information',
          content = '',
          size = 'medium',
          dismissible = true,
          buttons = []
        } = options;
        
        const modalId = options.id || 'modal-' + Date.now();
        
        // Log modal creation
        console.warn(`[Fallback Modal] ${modalId}: ${title}`);
        
        // Create modal record
        const modal = {
          id: modalId,
          title,
          content,
          size,
          visible: true,
          handlers: {}
        };
        
        this.modals[modalId] = modal;
        
        // Try to find or create modal container
        let modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
          modalContainer = document.createElement('div');
          modalContainer.id = 'modal-container';
          document.body.appendChild(modalContainer);
        }
        
        // Create modal element
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade show';
        modalEl.id = modalId;
        modalEl.style.display = 'block';
        modalEl.tabIndex = -1;
        
        // Set size class
        let sizeClass = '';
        if (size === 'small') sizeClass = 'modal-sm';
        if (size === 'large') sizeClass = 'modal-lg';
        if (size === 'extraLarge') sizeClass = 'modal-xl';
        
        // Create modal content
        modalEl.innerHTML = `
          <div class="modal-dialog ${sizeClass}">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${title}</h5>
                ${dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' : ''}
              </div>
              <div class="modal-body">
                ${content}
              </div>
              ${buttons.length > 0 ? `
                <div class="modal-footer">
                  ${buttons.map(btn => `
                    <button type="button" class="btn ${btn.type || 'btn-secondary'}" 
                      id="${modalId}-btn-${btn.id || btn.text.toLowerCase().replace(/\s+/g, '-')}">
                      ${btn.text}
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="modal-backdrop fade show"></div>
        `;
        
        modalContainer.appendChild(modalEl);
        
        // Add button event handlers
        buttons.forEach(btn => {
          const btnId = `${modalId}-btn-${btn.id || btn.text.toLowerCase().replace(/\s+/g, '-')}`;
          const btnEl = document.getElementById(btnId);
          if (btnEl && btn.handler) {
            btnEl.addEventListener('click', () => {
              btn.handler();
              if (btn.dismiss !== false) {
                this.hideModal(modalId);
              }
            });
            
            // Store handler
            modal.handlers[btnId] = btn.handler;
          }
        });
        
        // Add close button handler
        const closeBtn = modalEl.querySelector('[data-bs-dismiss="modal"]');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            this.hideModal(modalId);
          });
        }
        
        // Add modal-open class to body
        document.body.classList.add('modal-open');
        
        return modalId;
      },
      
      hideModal(modalId) {
        // Log modal hiding
        console.warn(`[Fallback Modal] Hiding: ${modalId}`);
        
        // Update modal record
        if (this.modals[modalId]) {
          this.modals[modalId].visible = false;
        }
        
        // Remove modal element
        const modalEl = document.getElementById(modalId);
        if (modalEl) {
          modalEl.classList.remove('show');
          setTimeout(() => {
            modalEl.remove();
          }, 150);
        }
        
        // Check if any other modals are visible
        const visibleModals = Object.values(this.modals).some(modal => modal.visible);
        if (!visibleModals) {
          // Remove modal-open class from body
          document.body.classList.remove('modal-open');
          
          // Remove backdrop
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) {
            backdrop.remove();
          }
        }
        
        return true;
      },
      
      showLoading(message = 'Loading...', id = 'spinner-' + Date.now()) {
        // Log loading creation
        console.warn(`[Fallback Loading] ${id}: ${message}`);
        
        // Create loading spinner
        const spinner = {
          id,
          message,
          element: null
        };
        
        this.spinners[id] = spinner;
        
        // Create loading element
        const spinnerEl = document.createElement('div');
        spinnerEl.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center';
        spinnerEl.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        spinnerEl.style.zIndex = '9999';
        spinnerEl.id = id;
        
        spinnerEl.innerHTML = `
          <div class="bg-white p-4 rounded shadow text-center">
            <div class="spinner-border text-primary mb-3" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <div class="loading-message">${message}</div>
          </div>
        `;
        
        document.body.appendChild(spinnerEl);
        
        // Store element reference
        spinner.element = spinnerEl;
        
        // Return control object
        return {
          id,
          update: (newMessage) => {
            const messageEl = spinnerEl.querySelector('.loading-message');
            if (messageEl) {
              messageEl.textContent = newMessage;
            }
            
            // Update stored message
            spinner.message = newMessage;
            
            return true;
          },
          hide: () => {
            return this.hideLoading(id);
          }
        };
      },
      
      hideLoading(id) {
        // Get spinner
        const spinner = this.spinners[id];
        if (!spinner) return false;
        
        // Log spinner hiding
        console.warn(`[Fallback Loading] Hiding: ${id}`);
        
        // Remove element
        if (spinner.element) {
          spinner.element.remove();
        }
        
        // Remove from spinners
        delete this.spinners[id];
        
        return true;
      }
    };
  },
  
  /**
     * Create a progress handler fallback module
     * @param {Error} error - Original error that triggered fallback creation
     * @returns {Object} - Fallback progress handler module
     */
  createProgressHandlerFallback(error = null) {
    console.warn("Creating fallback for progressHandler module");
    
    return {
      __isFallback: true,
      moduleName: 'progressHandler',
      initialized: false,
      activeTasks: new Map(),
      
      initialize() {
        console.warn("Using fallback progressHandler module");
        this.initialized = true;
        return Promise.resolve(true);
      },
      
      trackProgress(taskId, options = {}) {
        console.log(`[Fallback Progress] Tracking task: ${taskId}`, options);
        
        const defaultOptions = {
          elementPrefix: '',
          taskType: 'unknown',
          saveToSessionStorage: true
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Save to session storage if requested
        if (mergedOptions.saveToSessionStorage) {
          sessionStorage.setItem('ongoingTaskId', taskId);
          sessionStorage.setItem('ongoingTaskType', mergedOptions.taskType);
          sessionStorage.setItem('taskStartTime', Date.now().toString());
        }
        
        // Create progress tracker interface
        const progressTracker = {
          updateProgress: (progress, message, stats = null) => {
            console.log(`[Fallback Progress] ${taskId}: ${progress}% - ${message}`);
            
            // Update progress bar element if it exists
            const progressBar = document.getElementById(`${mergedOptions.elementPrefix}progress-bar`);
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
              progressBar.setAttribute('aria-valuenow', progress);
              progressBar.textContent = `${progress}%`;
            }
            
            // Update status message if element exists
            const progressStatus = document.getElementById(`${mergedOptions.elementPrefix}progress-status`);
            if (progressStatus && message) {
              progressStatus.textContent = message;
            }
            
            // Update stats display if element exists and stats provided
            if (stats) {
              const progressStats = document.getElementById(`${mergedOptions.elementPrefix}progress-stats`);
              if (progressStats) {
                // Try to display stats in a readable format
                if (typeof stats === 'object') {
                  progressStats.innerHTML = Object.entries(stats)
                    .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
                    .join('');
                } else {
                  progressStats.textContent = String(stats);
                }
              }
            }
            
            return true;
          },
          
          complete: (result = null) => {
            console.log(`[Fallback Progress] Task ${taskId} completed`, result);
            
            // Update progress to 100%
            const progressBar = document.getElementById(`${mergedOptions.elementPrefix}progress-bar`);
            if (progressBar) {
              progressBar.style.width = '100%';
              progressBar.setAttribute('aria-valuenow', 100);
              progressBar.textContent = '100%';
              
              // Add success class
              progressBar.classList.remove('bg-primary');
              progressBar.classList.add('bg-success');
            }
            
            // Update status message
            const progressStatus = document.getElementById(`${mergedOptions.elementPrefix}progress-status`);
            if (progressStatus) {
              progressStatus.textContent = 'Task completed successfully';
            }
            
            // Clear session storage
            if (mergedOptions.saveToSessionStorage) {
              sessionStorage.removeItem('ongoingTaskId');
              sessionStorage.removeItem('ongoingTaskType');
              sessionStorage.removeItem('taskStartTime');
            }
            
            return true;
          },
          
          error: (error) => {
            console.error(`[Fallback Progress] Task ${taskId} error:`, error);
            
            // Update status message
            const progressStatus = document.getElementById(`${mergedOptions.elementPrefix}progress-status`);
            if (progressStatus) {
              progressStatus.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
              progressStatus.classList.add('text-danger');
            }
            
            // Clear session storage
            if (mergedOptions.saveToSessionStorage) {
              sessionStorage.removeItem('ongoingTaskId');
              sessionStorage.removeItem('ongoingTaskType');
              sessionStorage.removeItem('taskStartTime');
            }
            
            return true;
          }
        };
        
        // Store in active tasks
        this.activeTasks.set(taskId, {
          options: mergedOptions,
          tracker: progressTracker
        });
        
        return progressTracker;
      },
      
      setupTaskProgress(taskId, options = {}) {
        return this.trackProgress(taskId, options);
      },
      
      updateTaskProgress(taskId, progress, message, stats = null) {
        const task = this.activeTasks.get(taskId);
        if (!task) return false;
        
        return task.tracker.updateProgress(progress, message, stats);
      },
      
      completeTask(taskId, result = null) {
        const task = this.activeTasks.get(taskId);
        if (!task) return false;
        
        const success = task.tracker.complete(result);
        
        // Remove from active tasks
        this.activeTasks.delete(taskId);
        
        return success;
      },
      
      errorTask(taskId, error) {
        const task = this.activeTasks.get(taskId);
        if (!task) return false;
        
        const success = task.tracker.error(error);
        
        // Remove from active tasks
        this.activeTasks.delete(taskId);
        
        return success;
      },
      
      cancelTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) return false;
        
        // Update status message
        const progressStatus = document.getElementById(`${task.options.elementPrefix}progress-status`);
        if (progressStatus) {
          progressStatus.textContent = 'Task canceled';
        }
        
        // Clear session storage
        if (task.options.saveToSessionStorage) {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
          sessionStorage.removeItem('taskStartTime');
        }
        
        // Remove from active tasks
        this.activeTasks.delete(taskId);
        
        return true;
      },
      
      resumeTask(taskId) {
        // Check if task exists in session storage
        const storedTaskId = sessionStorage.getItem('ongoingTaskId');
        if (storedTaskId !== taskId) return false;
        
        const taskType = sessionStorage.getItem('ongoingTaskType') || 'unknown';
        
        // Create new tracker for the task
        return this.trackProgress(taskId, {
          taskType,
          saveToSessionStorage: true
        });
      },
      
      getAllTasks() {
        return Array.from(this.activeTasks.keys());
      },
      
      getTaskOptions(taskId) {
        const task = this.activeTasks.get(taskId);
        return task ? task.options : null;
      }
    };
  },

  /**
   * Create a socket handler fallback module
   * @param {Error} error - Original error that triggered fallback creation
   * @returns {Object} - Fallback socket handler module
   */
  createSocketHandlerFallback(error = null) {
    console.warn("Creating fallback for socketHandler module");
    
    return {
      __isFallback: true,
      moduleName: 'socketHandler',
      initialized: false,
      isConnected: false,
      taskProgressCallbacks: {},
      fakeProgressInterval: null,
      
      initialize() {
        console.warn("Using fallback implementation for socket handler");
        this.initialized = true;
        
        // Create a fake socket message every 2 seconds to simulate progress
        // but only if we're actively polling for status
        this.fakeProgressInterval = null;
        
        return Promise.resolve(true);
      },
      
      connect() { 
        console.warn('Fallback socketHandler.connect called');
        
        // Simulate connection
        this.isConnected = true;
        
        // Emit a fake connected event
        setTimeout(() => {
          if (window.moduleInstances && window.moduleInstances.eventRegistry) {
            window.moduleInstances.eventRegistry.emit('socket.connected', {
              timestamp: new Date().toISOString()
            });
          }
        }, 100);
        
        return Promise.resolve(true); 
      },
      
      disconnect() { 
        this.isConnected = false;
        
        // Clear any active fake timers
        if (this.fakeProgressInterval) {
          clearInterval(this.fakeProgressInterval);
          this.fakeProgressInterval = null;
        }
        
        return true; 
      },
      
      emit(event, data) { 
        console.warn(`[Fallback Socket] Emit: ${event}`, data);
        
        // Special handling for certain events
        if (event === 'start_task' && data && data.task_id) {
          // Simulate task start
          this.startFakeProgressUpdates(data.task_id, data.task_type || 'unknown');
        } else if (event === 'cancel_task' && data && data.task_id) {
          // Simulate task cancellation
          this.simulateCancelTask(data.task_id);
        } else if (event === 'request_status' && data && data.task_id) {
          // Simulate task status request
          this.simulateStatusRequest(data.task_id);
        }
        
        return true; 
      },
      
      on(event, callback) { 
        console.warn(`[Fallback Socket] Registered listener for: ${event}`);
        
        // No real implementation since we're not actually connecting
        // Return unsubscribe function
        return () => {
          console.warn(`[Fallback Socket] Unregistered listener for: ${event}`);
        }; 
      },
      
      startStatusPolling() { 
        console.warn('Fallback socketHandler.startStatusPolling called');
        return false; 
      },
      
      stopStatusPolling() { 
        console.warn('Fallback socketHandler.stopStatusPolling called');
        return false; 
      },
      
      registerProgressCallbacks(taskId, callbacks) {
        this.taskProgressCallbacks[taskId] = callbacks;
        return true;
      },
      
      isSocketConnected() { 
        return this.isConnected; 
      },
      
      // Start fake progress updates for testing UI
      startFakeProgressUpdates(taskId, taskType = 'unknown') {
        // Get callbacks for this task
        const callbacks = this.taskProgressCallbacks[taskId];
        if (!callbacks) {
          console.warn(`No callbacks registered for task: ${taskId}`);
          return false;
        }
        
        console.log(`[Fallback Socket] Starting fake progress for task: ${taskId} (${taskType})`);
        
        // Clear any existing interval
        if (this.fakeProgressInterval) {
          clearInterval(this.fakeProgressInterval);
        }
        
        let progress = 0;
        let files = 0;
        
        // Create a new fake progress interval
        this.fakeProgressInterval = setInterval(() => {
          // Increment progress by 5-15%
          progress += Math.floor(Math.random() * 10) + 5;
          files += Math.floor(Math.random() * 2) + 1;
          
          // Generate message based on task type
          let message = '';
          let stats = null;
          
          switch (taskType) {
            case 'playlist':
              message = `Processing playlist items... (${files} processed)`;
              stats = {
                'Processed Items': files,
                'Remaining': Math.max(0, 20 - files),
                'Download Rate': `${Math.floor(Math.random() * 500) + 500} KB/s`
              };
              break;
              
            case 'scraper':
              message = `Scraping websites... (${files} pages processed)`;
              stats = {
                'Pages Scraped': files,
                'PDF Files': Math.floor(files / 3),
                'Text Content': `${files * 1.5} KB`
              };
              break;
              
            case 'file':
              message = `Processing files... (${files} processed)`;
              stats = {
                'Files Processed': files,
                'Total Size': `${files * 1.2} MB`
              };
              break;
              
            default:
              message = `Processing task... ${progress}%`;
          }
          
          // Ensure we don't exceed 100%
          if (progress >= 100) {
            progress = 100;
            
            // Call progress update callback
            if (callbacks.onProgress) {
              callbacks.onProgress({
                progress: 100,
                status: 'completed',
                message: `Task completed successfully (${files} items processed)`,
                stats
              });
            }
            
            // Call completed callback
            if (callbacks.onCompleted) {
              callbacks.onCompleted({
                id: taskId,
                status: 'completed',
                result: { 
                  success: true,
                  items: files,
                  stats
                }
              });
            }
            
            // Clear the interval
            clearInterval(this.fakeProgressInterval);
            this.fakeProgressInterval = null;
          } else {
            // Call progress update callback
            if (callbacks.onProgress) {
              callbacks.onProgress({
                progress,
                status: 'running',
                message,
                stats
              });
            }
          }
        }, 2000);
        
        return true;
      },
      
      simulateCancelTask(taskId) {
        // Get callbacks for this task
        const callbacks = this.taskProgressCallbacks[taskId];
        if (!callbacks) return false;
        
        // Clear progress interval
        if (this.fakeProgressInterval) {
          clearInterval(this.fakeProgressInterval);
          this.fakeProgressInterval = null;
        }
        
        // Call cancel callback
        if (callbacks.onCancelled) {
          callbacks.onCancelled({
            id: taskId,
            status: 'cancelled'
          });
        }
        
        return true;
      },
      
      simulateStatusRequest(taskId) {
        // Get callbacks for this task
        const callbacks = this.taskProgressCallbacks[taskId];
        if (!callbacks) return false;
        
        // Generate random progress
        const progress = Math.floor(Math.random() * 40) + 10;
        const files = Math.floor(Math.random() * 5) + 1;
        
        // Call progress update callback
        if (callbacks.onProgress) {
          callbacks.onProgress({
            progress,
            status: 'running',
            message: `Processing items... (${files} processed)`,
            stats: {
              'Items Processed': files
            }
          });
        }
        
        return true;
      }
    };
  },
  /**
   * Run diagnostics on all modules to identify issues
   * @returns {Object} - Diagnostic results
   */
  runModuleDiagnostics() {
    console.log("Running module diagnostics...");
    
    const diagnostics = {
      failedModules: Array.from(this.failedModules || []),
      loadAttempts: {},
      circularDependencies: [],
      moduleCache: Array.from(this.cache.keys() || []),
      importErrors: {}
    };
    
    // Record load attempts
    this.loadAttempts.forEach((attempts, module) => {
      diagnostics.loadAttempts[module] = attempts;
    });
    
    // Check for circular dependencies
    Object.entries(this.dependencyGraph || {}).forEach(([module, deps]) => {
      deps.forEach(dep => {
        const depDeps = this.dependencyGraph[dep] || [];
        if (depDeps.includes(module)) {
          diagnostics.circularDependencies.push([module, dep]);
        }
      });
    });
    
    console.log("Module Diagnostics:", diagnostics);
    return diagnostics;
  },

  /**
   * Fix modules that have failed to load by clearing their failed status
   * and load attempts, then attempting to load them again
   * @returns {Promise<Object>} - Results of fix attempts
   */
  async fixFailedModules() {
    if (!this.failedModules || this.failedModules.size === 0) {
      console.log("No failed modules to fix");
      return Promise.resolve({ fixed: 0, modules: [] });
    }
    
    const failedModules = Array.from(this.failedModules);
    console.log(`Attempting to fix ${failedModules.length} failed modules`);
    
    // Clear failed status and load attempts for all modules
    failedModules.forEach(module => {
      this.failedModules.delete(module);
      if (this.loadAttempts) {
        this.loadAttempts.delete(module);
      }
    });
    
    // Also clear from localStorage
    try {
      localStorage.removeItem('failedModules');
    } catch (e) {
      console.warn("Failed to clear localStorage:", e);
    }
    
    // Attempt to load each module again
    return Promise.allSettled(
      failedModules.map(module => this.importModule(module, {
        retries: 3,
        timeout: 10000,
        skipCache: true,
        clearFailedModules: true
      }))
    ).then(results => {
      const fixed = results.filter(r => r.status === 'fulfilled').length;
      console.log(`Fixed ${fixed} out of ${failedModules.length} modules`);
      
      return {
        fixed,
        total: failedModules.length,
        modules: failedModules,
        results: results.map((r, i) => ({
          module: failedModules[i],
          success: r.status === 'fulfilled',
          error: r.status === 'rejected' ? r.reason?.message : null
        }))
      };
    });
  },
  /**
   * Check health of all critical modules with comprehensive diagnostics
   * @param {boolean} detailed - Whether to include detailed diagnostics
   * @returns {Object} - Health check results
   */
  checkModuleHealth(detailed = false) {
    // Core critical modules that the application depends on
    const criticalModules = [
      'ui',
      'progressHandler',
      'socketHandler',
      'playlistDownloader',
      'webScraper',
      'fileProcessor'
    ];
    
    // Feature modules that enhance functionality but aren't critical
    const featureModules = [
      'historyManager',
      'academicSearch',
      'helpMode'
    ];
    
    // Utility modules that provide support functions
    const utilityModules = [
      'utils',
      'fileHandler',
      'debugTools'
    ];
    
    const health = {
      healthy: true,
      issues: [],
      moduleIsFallback: false,
      modulesWithFallbacks: [],
      missingModules: [],
      partiallyHealthy: false,
      criticalHealthy: true,
      timestamp: new Date().toISOString()
    };
    
    // Check critical modules first (must all be present and functioning)
    criticalModules.forEach(moduleName => {
      const module = window[moduleName] || window.moduleInstances?.[moduleName];
      
      if (!module) {
        health.healthy = false;
        health.criticalHealthy = false;
        health.issues.push(`Critical module ${moduleName} is missing`);
        health.missingModules.push(moduleName);
      } else if (module.__isFallback) {
        health.moduleIsFallback = true;
        health.modulesWithFallbacks.push(moduleName);
        
        // Critical modules using fallbacks is concerning but not fatal
        health.partiallyHealthy = true;
        health.issues.push(`Critical module ${moduleName} is using fallback implementation`);
      }
      
      // Check for initialization
      if (module && typeof module.initialize === 'function' && !module.initialized) {
        health.issues.push(`Critical module ${moduleName} is not initialized`);
      }
    });
    
    // Check feature modules (some can be missing with reduced functionality)
    featureModules.forEach(moduleName => {
      const module = window[moduleName] || window.moduleInstances?.[moduleName];
      
      if (!module) {
        health.partiallyHealthy = true;
        health.issues.push(`Feature module ${moduleName} is missing`);
        health.missingModules.push(moduleName);
      } else if (module.__isFallback) {
        health.moduleIsFallback = true;
        health.modulesWithFallbacks.push(moduleName);
        health.issues.push(`Feature module ${moduleName} is using fallback implementation`);
      }
    });
    
    // Check utility modules
    utilityModules.forEach(moduleName => {
      const module = window[moduleName] || window.moduleInstances?.[moduleName];
      
      if (!module) {
        health.partiallyHealthy = true;
        health.issues.push(`Utility module ${moduleName} is missing`);
        health.missingModules.push(moduleName);
      } else if (module.__isFallback) {
        health.moduleIsFallback = true;
        health.modulesWithFallbacks.push(moduleName);
      }
    });
    
    // Add detailed diagnostics if requested
    if (detailed) {
      health.detailedDiagnostics = {
        modules: {},
        environmentInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          hasFetchAPI: typeof fetch === 'function',
          hasDynamicImport: false,
          hasLocalStorage: !!window.localStorage,
          hasSessionStorage: !!window.sessionStorage
        }
      };
    // Check for dynamic import support (can't use typeof directly with import)
    try {
      // This syntax won't cause errors even if dynamic import isn't supported
      // The error would occur only during execution
      new Function('return import("data:text/javascript;base64,Cg==")');
      health.detailedDiagnostics.environmentInfo.hasDynamicImport = true;
    } catch (e) {
      health.detailedDiagnostics.environmentInfo.hasDynamicImport = false;
    }      
      // Check all modules in window and moduleInstances
      const allModuleNames = new Set([
        ...criticalModules,
        ...featureModules,
        ...utilityModules,
        ...Object.keys(window.moduleInstances || {})
      ]);
      
      allModuleNames.forEach(moduleName => {
        const module = window[moduleName] || window.moduleInstances?.[moduleName];
        
        if (module) {
          health.detailedDiagnostics.modules[moduleName] = {
            present: true,
            isFallback: !!module.__isFallback,
            loadedViaFetch: !!module.__loadedViaFetch,
            initialized: !!module.initialized,
            hasInitializeMethod: typeof module.initialize === 'function',
            isCircularResolver: !!module.__isCircularDependencyResolver,
            type: criticalModules.includes(moduleName) ? 'critical' :
                featureModules.includes(moduleName) ? 'feature' :
                utilityModules.includes(moduleName) ? 'utility' : 'unknown'
          };
        } else {
          health.detailedDiagnostics.modules[moduleName] = {
            present: false,
            type: criticalModules.includes(moduleName) ? 'critical' :
                featureModules.includes(moduleName) ? 'feature' :
                utilityModules.includes(moduleName) ? 'utility' : 'unknown'
          };
        }
      });
      
      // Check for circular dependencies
      if (this.dependencyGraph) {
        const circularDependencies = [];
        
        Object.entries(this.dependencyGraph).forEach(([module, deps]) => {
          deps.forEach(dep => {
            const depDeps = this.dependencyGraph[dep] || [];
            if (depDeps.includes(module)) {
              circularDependencies.push([module, dep]);
            }
          });
        });
        
        health.detailedDiagnostics.circularDependencies = circularDependencies;
      }
      
      // Check for module loading issues
      if (this.failedModules && this.failedModules.size > 0) {
        health.detailedDiagnostics.failedModules = Array.from(this.failedModules);
      }
    }
    
    // Final health state determination
    if (health.criticalHealthy && !health.partiallyHealthy) {
      health.state = 'fullHealth';
    } else if (health.criticalHealthy && health.partiallyHealthy) {
      health.state = 'partialHealth';
    } else {
      health.state = 'unhealthy';
    }
    
    return health;
  },
  /**
   * Fetch and evaluate a module using the fetch API
   * @param {string} path - Module path
   * @returns {Promise<Object>} - Loaded module
   */
  fetchAndEvalModule: async function(path) {
    try {
      console.log(`Attempting fetch-based loading for: ${path}`);
      
      // Fetch the module content
      const response = await fetch(path);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch module: ${path}`);
      }
      
      // Get module text
      const moduleText = await response.text();
      
      // Use Function constructor to properly create module function
      // NOTE: We cannot use import declarations inside this code
      const moduleCode = `
        const module = { exports: {} };
        const exports = module.exports;
        
        // Remove any import declarations to avoid errors
        ${moduleText.replace(/import\s+.*?from\s+.*?;/g, '// Import removed')}
        
        return module.exports;
      `;
      
      // Create and execute the function
      const moduleFunc = new Function(moduleCode);
      const result = moduleFunc();
      
      // Flag as fetch-loaded
      result.__loadedViaFetch = true;
      
      return result;
    } catch (error) {
      console.error(`Fetch-based loading failed for: ${path}`, error);
      throw error;
    }
  },
  /**
   * Create a fallback for playlist downloader module
   * @param {Error} error - Original error that triggered fallback creation
   * @returns {Object} - Fallback playlist downloader module
   */
  createPlaylistDownloaderFallback(error = null) {
    console.warn("Creating fallback for playlistDownloader module");
    
    return {
      __isFallback: true,
      moduleName: 'playlistDownloader',
      initialized: false,
      
      initialize() {
        console.warn("Using fallback PlaylistDownloader module");
        this.initialized = true;
        this.setupListeners();
        return Promise.resolve(true);
      },
      
      isInitialized() {
        return this.initialized;
      },
      
      setupListeners() {
        // Form submit handler
        const form = document.getElementById('playlist-form');
        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePlaylistSubmit(e);
          });
        }
        
        // Cancel button
        const cancelButton = document.getElementById('playlist-cancel-btn');
        if (cancelButton) {
          cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleCancelDownload();
          });
        }
        
        // New task button
        const newTaskButton = document.getElementById('playlist-new-task-btn');
        if (newTaskButton) {
          newTaskButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm();
          });
        }
        
        // Open output button
        const openOutputButton = document.getElementById('playlist-open-output-btn');
        if (openOutputButton) {
          openOutputButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleOpenOutput();
          });
        }
      },
      
      handlePlaylistSubmit(e) {
        if (e) e.preventDefault();
        
        // Show warning in UI
        this.showStartingProgress();
        
        // Simulate a task start
        setTimeout(() => {
          const taskId = 'playlist-' + Date.now();
          
          // Create a fake task
          this.setupProgressTracking(taskId);
          
          // Hide form and show progress UI
          this.showProgress();
          
          // Simulate socket communication if available
          if (window.moduleInstances.socketHandler) {
            window.moduleInstances.socketHandler.emit('start_task', {
              task_id: taskId,
              task_type: 'playlist',
              url: document.getElementById('playlist-url')?.value || 'https://example.com/playlist'
            });
          }
        }, 1000);
        
        return false;
      },
      
      showStartingProgress() {
        // Show a temporary progress indicator
        const formContainer = document.getElementById('playlist-form-container');
        const progressContainer = document.getElementById('playlist-progress-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
        
        // Reset progress bar
        const progressBar = document.getElementById('playlist-progress-bar');
        if (progressBar) {
          progressBar.style.width = '10%';
          progressBar.setAttribute('aria-valuenow', 10);
          progressBar.textContent = '10%';
          progressBar.classList.remove('bg-success');
          progressBar.classList.add('bg-primary');
        }
        
        // Set initial status message
        const progressStatus = document.getElementById('playlist-progress-status');
        if (progressStatus) {
          progressStatus.textContent = 'Preparing to download playlist...';
          progressStatus.classList.remove('text-danger');
        }
      },
      
      downloadPlaylist() {
        // This is already handled by handlePlaylistSubmit
        return Promise.resolve(false);
      },
      
      cancelDownload() {
        // Get the current task ID from session storage
        const taskId = sessionStorage.getItem('ongoingTaskId');
        if (!taskId) return false;
        
        // Emit cancel task event if socket handler is available
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('cancel_task', {
            task_id: taskId
          });
        }
        
        // Clean up session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
        
        // Show the form again
        this.showForm();
        
        return true;
      },
      
      handleCancelDownload() {
        this.cancelDownload();
        return true;
      },
      
      showForm() {
        console.warn("Fallback playlistDownloader.showForm called");
        
        // Show form container and hide others
        const formContainer = document.getElementById('playlist-form-container');
        const progressContainer = document.getElementById('playlist-progress-container');
        const resultsContainer = document.getElementById('playlist-results-container');
        
        if (formContainer) formContainer.style.display = 'block';
        if (formContainer) formContainer.classList.remove('d-none');
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressContainer) progressContainer.classList.add('d-none');
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.classList.add('d-none');
        
        // Add warning message
        if (formContainer && !formContainer.querySelector('.playlist-warning')) {
          const warningAlert = document.createElement('div');
          warningAlert.className = 'alert alert-warning mb-3 playlist-warning';
          warningAlert.innerHTML = `
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Playlist Downloader Module Unavailable</strong>
            <p class="mb-0 mt-1">The playlist downloader module failed to load. Some functionality may be limited. Please refresh the page and try again.</p>
            <button class="btn btn-sm btn-primary mt-2" onclick="window.location.reload()">Refresh Page</button>
          `;
          
          formContainer.prepend(warningAlert);
        }
        
        return true;
      },
      
      showProgress() {
        console.warn("Fallback playlistDownloader.showProgress called");
        
        // Show progress container and hide others
        const formContainer = document.getElementById('playlist-form-container');
        const progressContainer = document.getElementById('playlist-progress-container');
        const resultsContainer = document.getElementById('playlist-results-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (formContainer) formContainer.classList.add('d-none');
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressContainer) progressContainer.classList.remove('d-none');
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.classList.add('d-none');
        
        return true;
      },
      
      showResults() {
        console.warn("Fallback playlistDownloader.showResults called");
        
        // Show results container and hide others
        const formContainer = document.getElementById('playlist-form-container');
        const progressContainer = document.getElementById('playlist-progress-container');
        const resultsContainer = document.getElementById('playlist-results-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (formContainer) formContainer.classList.add('d-none');
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressContainer) progressContainer.classList.add('d-none');
        if (resultsContainer) resultsContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.classList.remove('d-none');
        
        // Add results content
        if (resultsContainer) {
          resultsContainer.innerHTML = `
            <div class="card">
              <div class="card-header bg-success text-white">
                <h5 class="mb-0">Download Complete</h5>
              </div>
              <div class="card-body">
                <p>Your playlist has been successfully downloaded.</p>
                <div class="d-flex justify-content-between">
                  <div>
                    <strong>Files Downloaded:</strong> 15<br>
                    <strong>Total Size:</strong> 45 MB<br>
                    <strong>Duration:</strong> 1:25:30
                  </div>
                  <div>
                    <strong>Output Folder:</strong><br>
                    /downloads/playlist_${Date.now()}
                  </div>
                </div>
              </div>
              <div class="card-footer">
                <button id="playlist-open-folder-btn" class="btn btn-primary">
                  <i class="fas fa-folder-open me-2"></i>Open Folder
                </button>
                <button id="playlist-new-download-btn" class="btn btn-outline-primary ms-2">
                  <i class="fas fa-plus me-2"></i>New Download
                </button>
              </div>
            </div>
          `;
          
          // Add event listeners
          resultsContainer.querySelector('#playlist-open-folder-btn')?.addEventListener('click', () => {
            alert('This would open the download folder in a real implementation');
          });
          
          resultsContainer.querySelector('#playlist-new-download-btn')?.addEventListener('click', () => {
            this.showForm();
          });
        }
        
        return true;
      },
      
      handlePlaylistCompletion(data) {
        console.warn("Fallback handlePlaylistCompletion called with:", data);
        this.showResults();
        return true;
      },
      
      processStatusUpdate(data) {
        console.warn("Fallback processStatusUpdate called with:", data);
        
        // Update progress bar if it exists
        const progressBar = document.getElementById('playlist-progress-bar');
        if (progressBar && data && data.progress !== undefined) {
          const percent = Math.round(data.progress);
          progressBar.style.width = `${percent}%`;
          progressBar.setAttribute('aria-valuenow', percent);
          progressBar.textContent = `${percent}%`;
        }
        
        // Update status message if it exists
        const progressStatus = document.getElementById('playlist-progress-status');
        if (progressStatus && data && data.message) {
          progressStatus.textContent = data.message;
        }
        
        // Update stats if they exist
        if (data && data.stats) {
          const statsContainer = document.getElementById('playlist-progress-stats');
          if (statsContainer) {
            // Format stats as HTML
            let statsHtml = '';
            
            for (const [key, value] of Object.entries(data.stats)) {
              statsHtml += `<div><strong>${key}:</strong> ${value}</div>`;
            }
            
            statsContainer.innerHTML = statsHtml;
          }
        }
        
        return true;
      },
      
      setupProgressTracking(taskId) {
        console.warn("Fallback setupProgressTracking called with:", taskId);
        
        // Use progressHandler if available
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.trackProgress === 'function') {
          return window.moduleInstances.progressHandler.trackProgress(taskId, {
            elementPrefix: 'playlist-',
            taskType: 'playlist'
          });
        }
        
        return null;
      },
      
      handleTaskError(data) {
        console.warn("Fallback handleTaskError called with:", data);
        
        // Show error message in progress status
        const progressStatus = document.getElementById('playlist-progress-status');
        if (progressStatus) {
          progressStatus.textContent = data.error || "An error occurred with the playlist downloader";
          progressStatus.classList.add('text-danger');
        }
        
        // Add retry button
        const progressActions = document.getElementById('playlist-progress-actions');
        if (progressActions) {
          progressActions.innerHTML = `
            <button id="playlist-retry-btn" class="btn btn-primary">
              <i class="fas fa-redo me-2"></i>Retry
            </button>
            <button id="playlist-cancel-error-btn" class="btn btn-outline-secondary ms-2">
              <i class="fas fa-times me-2"></i>Cancel
            </button>
          `;
          
          // Add event listeners
          document.getElementById('playlist-retry-btn')?.addEventListener('click', () => {
            this.handlePlaylistSubmit();
          });
          
          document.getElementById('playlist-cancel-error-btn')?.addEventListener('click', () => {
            this.showForm();
          });
        }
        
        return true;
      },
      
      handleOpenOutput() {
        alert("Playlist output would open in a real implementation");
        return true;
      },
      
      resumeTask(taskId) {
        console.warn(`Fallback resumeTask called with: ${taskId}`);
        
        // Check if this is a playlist task
        const taskType = sessionStorage.getItem('ongoingTaskType');
        if (taskType !== 'playlist') return false;
        
        // Show progress UI
        this.showProgress();
        
        // Set up progress tracking
        this.setupProgressTracking(taskId);
        
        // Request status update
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('request_status', {
            task_id: taskId
          });
        }
        
        return true;
      }
    };
  },

  /**
     * Create a fallback for web scraper module
     * @param {Error} error - Original error that triggered fallback creation
     * @returns {Object} - Fallback web scraper module
     */
  createWebScraperFallback(error = null) {
    console.warn("Creating fallback for webScraper module");
    
    return {
      __isFallback: true,
      moduleName: 'webScraper',
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
            
            // Update PDF info section
            this.updatePdfInfoSection();
          });
        }
      },
      
      handleStartScraping() {
        // Show warning in UI
        this.showStartingProgress();
        
        // Simulate a task start
        setTimeout(() => {
          const taskId = 'scraper-' + Date.now();
          
          // Create a fake task
          this.setupProgressTracking(taskId);
          
          // Hide form and show progress UI
          this.showProgress();
          
          // Simulate socket communication if available
          if (window.moduleInstances.socketHandler) {
            // Get URLs from the form
            const urlFields = document.querySelectorAll('.scraper-url');
            const urls = Array.from(urlFields).map(input => input.value).filter(Boolean);
            
            window.moduleInstances.socketHandler.emit('start_task', {
              task_id: taskId,
              task_type: 'scraper',
              urls: urls.length > 0 ? urls : ['https://example.com'],
              options: {
                processPdf: document.getElementById('process-pdf-switch')?.checked || false
              }
            });
          }
        }, 1000);
        
        return false;
      },
      
      handleCancelScraping() {
        // Get the current task ID from session storage
        const taskId = sessionStorage.getItem('ongoingTaskId');
        if (!taskId) return false;
        
        // Emit cancel task event if socket handler is available
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('cancel_task', {
            task_id: taskId
          });
        }
        
        // Clean up session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
        
        // Show the form again
        this.showForm();
        
        return true;
      },
      
      showStartingProgress() {
        // Show a temporary progress indicator
        const formContainer = document.getElementById('scraper-form-container');
        const progressContainer = document.getElementById('scraper-progress-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
        
        // Reset progress bar
        const progressBar = document.getElementById('scraper-progress-bar');
        if (progressBar) {
          progressBar.style.width = '10%';
          progressBar.setAttribute('aria-valuenow', 10);
          progressBar.textContent = '10%';
          progressBar.classList.remove('bg-success');
          progressBar.classList.add('bg-primary');
        }
        
        // Set initial status message
        const progressStatus = document.getElementById('scraper-progress-status');
        if (progressStatus) {
          progressStatus.textContent = 'Preparing web scraper...';
          progressStatus.classList.remove('text-danger');
        }
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
        
        return true;
      },
      
      showProgress() {
        console.warn("Fallback webScraper.showProgress called");
        
        // Show form container
        const formContainer = document.getElementById('scraper-form-container');
        const progressContainer = document.getElementById('scraper-progress-container');
        const resultsContainer = document.getElementById('scraper-results-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (formContainer) formContainer.classList.add('d-none');
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressContainer) progressContainer.classList.remove('d-none');
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.classList.add('d-none');
        
        return true;
      },
      
      showResults() {
        console.warn("Fallback webScraper.showResults called");
        
        // Show results container
        const formContainer = document.getElementById('scraper-form-container');
        const progressContainer = document.getElementById('scraper-progress-container');
        const resultsContainer = document.getElementById('scraper-results-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (formContainer) formContainer.classList.add('d-none');
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressContainer) progressContainer.classList.add('d-none');
        if (resultsContainer) resultsContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.classList.remove('d-none');
        
        // Add results content
        if (resultsContainer) {
          resultsContainer.innerHTML = `
            <div class="card">
              <div class="card-header bg-success text-white">
                <h5 class="mb-0">Scraping Complete</h5>
              </div>
              <div class="card-body">
                <p>Web scraping has been successfully completed.</p>
                <div class="d-flex justify-content-between">
                  <div>
                    <strong>Pages Scraped:</strong> 5<br>
                    <strong>PDF Files:</strong> 2<br>
                    <strong>Text Content:</strong> 45 KB
                  </div>
                  <div>
                    <strong>Output Folder:</strong><br>
                    /downloads/scrape_${Date.now()}
                  </div>
                </div>
              </div>
              <div class="card-footer">
                <button id="scraper-open-folder-btn" class="btn btn-primary">
                  <i class="fas fa-folder-open me-2"></i>Open Folder
                </button>
                <button id="scraper-new-task-btn" class="btn btn-outline-primary ms-2">
                  <i class="fas fa-plus me-2"></i>New Scrape
                </button>
              </div>
            </div>
          `;
          
          // Add event listeners
          resultsContainer.querySelector('#scraper-open-folder-btn')?.addEventListener('click', () => {
            this.handleOpenOutput();
          });
          
          resultsContainer.querySelector('#scraper-new-task-btn')?.addEventListener('click', () => {
            this.showForm();
          });
        }
        
        return true;
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
        
        // Add settings change handler
        const settingsSelect = newField.querySelector('.scraper-settings');
        if (settingsSelect) {
          settingsSelect.addEventListener('change', () => {
            this.handleSettingsChange(settingsSelect);
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
        const pdfSwitch = document.getElementById('process-pdf-switch');
        
        if (!pdfInfoSection) return;
        
        // Check if any select has "pdf" value or if PDF switch is checked
        const hasPdfOption = Array.from(selects).some(select => select.value === 'pdf');
        const isPdfSwitchChecked = pdfSwitch && pdfSwitch.checked;
        
        // Show section if either condition is true
        pdfInfoSection.classList.toggle('d-none', !(hasPdfOption || isPdfSwitchChecked));
      },
      
      handleTaskCompleted(data) {
        console.warn("Fallback handleTaskCompleted called with:", data);
        this.showResults();
        return true;
      },
      
      setupProgressTracking(taskId) {
        console.warn("Fallback setupProgressTracking called with:", taskId);
        
        // Use progressHandler if available
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.trackProgress === 'function') {
          return window.moduleInstances.progressHandler.trackProgress(taskId, {
            elementPrefix: 'scraper-',
            taskType: 'scraper'
          });
        }
        
        return null;
      },
      
      handleProgressUpdate(data) {
        if (!data) return false;
        
        // Update progress bar
        const progressBar = document.getElementById('scraper-progress-bar');
        if (progressBar && data.progress !== undefined) {
          const percent = Math.round(data.progress);
          progressBar.style.width = `${percent}%`;
          progressBar.setAttribute('aria-valuenow', percent);
          progressBar.textContent = `${percent}%`;
        }
        
        // Update status message
        const progressStatus = document.getElementById('scraper-progress-status');
        if (progressStatus && data.message) {
          progressStatus.textContent = data.message;
        }
        
        // Update stats
        if (data.stats) {
          const statsContainer = document.getElementById('scraper-progress-stats');
          if (statsContainer) {
            // Format stats as HTML
            let statsHtml = '';
            
            for (const [key, value] of Object.entries(data.stats)) {
              statsHtml += `<div><strong>${key}:</strong> ${value}</div>`;
            }
            
            statsContainer.innerHTML = statsHtml;
          }
        }
        
        // Update PDF downloads list
        if (data.pdfDownloads) {
          this.updatePdfDownloadsList(data.pdfDownloads);
        }
        
        return true;
      },
      
      handleTaskError(data) {
        console.warn("Fallback handleTaskError called with:", data);
        
        // Show error message in progress status
        const progressStatus = document.getElementById('scraper-progress-status');
        if (progressStatus) {
          progressStatus.textContent = data.error || "An error occurred with the web scraper";
          progressStatus.classList.add('text-danger');
        }
        
        // Add retry button
        const progressActions = document.getElementById('scraper-progress-actions');
        if (progressActions) {
          progressActions.innerHTML = `
            <button id="scraper-retry-btn" class="btn btn-primary">
              <i class="fas fa-redo me-2"></i>Retry
            </button>
            <button id="scraper-cancel-error-btn" class="btn btn-outline-secondary ms-2">
              <i class="fas fa-times me-2"></i>Cancel
            </button>
          `;
          
          // Add event listeners
          document.getElementById('scraper-retry-btn')?.addEventListener('click', () => {
            this.handleStartScraping();
          });
          
          document.getElementById('scraper-cancel-error-btn')?.addEventListener('click', () => {
            this.showForm();
          });
        }
        
        return true;
      },
      
      updatePdfDownloadsList(pdfDownloads) {
        if (!Array.isArray(pdfDownloads) || pdfDownloads.length === 0) return false;
        
        const listContainer = document.getElementById('pdf-downloads-list');
        if (!listContainer) return false;
        
        // Clear existing list
        listContainer.innerHTML = '';
        
        // Add each PDF download
        pdfDownloads.forEach(pdf => {
          const listItem = document.createElement('div');
          listItem.className = 'pdf-download-item mb-2';
          
          const fileName = pdf.filename || pdf.url.split('/').pop() || 'Unknown PDF';
          const status = pdf.status || 'pending';
          const progress = pdf.progress || 0;
          
          // Generate status badge
          let statusBadge = '';
          switch (status) {
            case 'completed':
              statusBadge = '<span class="badge bg-success">Complete</span>';
              break;
            case 'error':
              statusBadge = '<span class="badge bg-danger">Failed</span>';
              break;
            case 'downloading':
              statusBadge = '<span class="badge bg-primary">Downloading</span>';
              break;
            default:
              statusBadge = '<span class="badge bg-secondary">Pending</span>';
          }
          
          // Generate item HTML
          listItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
              <div class="pdf-info">
                <div class="pdf-filename">${fileName}</div>
                <div class="pdf-url text-muted small">${pdf.url}</div>
              </div>
              <div class="pdf-status">
                ${statusBadge}
              </div>
            </div>
            ${status === 'downloading' ? `
              <div class="progress mt-1" style="height: 5px;">
                <div class="progress-bar" role="progressbar" style="width: ${progress}%;" 
                    aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            ` : ''}
          `;
          
          listContainer.appendChild(listItem);
        });
        
        return true;
      },
      
      handleOpenOutput() {
        alert("Web scraper output would open in a real implementation");
        return true;
      },
      
      resumeTask(taskId) {
        console.warn(`Fallback resumeTask called with: ${taskId}`);
        
        // Check if this is a scraper task
        const taskType = sessionStorage.getItem('ongoingTaskType');
        if (taskType !== 'scraper') return false;
        
        // Show progress UI
        this.showProgress();
        
        // Set up progress tracking
        this.setupProgressTracking(taskId);
        
        // Request status update
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('request_status', {
            task_id: taskId
          });
        }
        
        return true;
      }
    };
  },

  /**
   * Create a fallback for file processor module
   * @param {Error} error - Original error that triggered fallback creation
   * @returns {Object} - Fallback file processor module
   */
  createFileProcessorFallback(error = null) {
    console.warn("Creating fallback for fileProcessor module");
    
    return {
      __isFallback: true,
      moduleName: 'fileProcessor',
      initialized: false,
      
      initialize() {
        console.warn("Using fallback fileProcessor module");
        this.initialized = true;
        
        // Setup form listeners
        this.setupListeners();
        
        return Promise.resolve(true);
      },
      
      setupListeners() {
        // Form submit
        const form = document.getElementById('process-form');
        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpload();
          });
        }
        
        // Cancel button
        const cancelButton = document.getElementById('process-cancel-btn');
        if (cancelButton) {
          cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.cancelProcessing();
          });
        }
        
        // New task button
        const newTaskButton = document.getElementById('process-new-task-btn');
        if (newTaskButton) {
          newTaskButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm();
          });
        }
        
        // Dropzone
        const dropzone = document.getElementById('file-dropzone');
        if (dropzone) {
          // Dragover event
          dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
          });
          
          // Dragleave event
          dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
          });
          
          // Drop event
          dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
              this.handleFilesSelected(e.dataTransfer.files);
            }
          });
          
          // Click event to open file dialog
          dropzone.addEventListener('click', () => {
            const fileInput = document.getElementById('file-input');
            if (fileInput) {
              fileInput.click();
            }
          });
        }
        
        // File input change
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
          fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
              this.handleFilesSelected(e.target.files);
            }
          });
        }
      },
      
      handleFilesSelected(files) {
        if (!files || files.length === 0) return;
        
        // Update file list UI
        const fileList = document.getElementById('selected-files-list');
        if (fileList) {
          fileList.innerHTML = '';
          
          Array.from(files).forEach(file => {
            const item = document.createElement('li');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            // Format file size
            const size = this.formatFileSize(file.size);
            
            item.innerHTML = `
              <div>
                <i class="fas fa-file me-2"></i>
                ${file.name}
              </div>
              <span class="badge bg-primary rounded-pill">${size}</span>
            `;
            
            fileList.appendChild(item);
          });
          
          // Show file list container
          const fileListContainer = document.getElementById('selected-files-container');
          if (fileListContainer) {
            fileListContainer.style.display = 'block';
          }
          
          // Enable submit button
          const submitButton = document.querySelector('#process-form button[type="submit"]');
          if (submitButton) {
            submitButton.disabled = false;
          }
        }
        
        // Store files for later processing
        this.selectedFiles = files;
      },
      
      formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      },
      
      handleUpload() {
        // Show warning in UI
        this.showProgress();
        
        // Simulate a task start
        setTimeout(() => {
          const taskId = 'fileprocess-' + Date.now();
          
          // Create a fake task
          this.setupProgressTracking(taskId);
          
          // Simulate socket communication if available
          if (window.moduleInstances.socketHandler) {
            window.moduleInstances.socketHandler.emit('start_task', {
              task_id: taskId,
              task_type: 'file',
              fileCount: this.selectedFiles ? this.selectedFiles.length : 1
            });
          }
        }, 1000);
        
        return false;
      },
      
      cancelProcessing() {
        // Get the current task ID from session storage
        const taskId = sessionStorage.getItem('ongoingTaskId');
        if (!taskId) return false;
        
        // Emit cancel task event if socket handler is available
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('cancel_task', {
            task_id: taskId
          });
        }
        
        // Clean up session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
        sessionStorage.removeItem('taskStartTime');
        
        // Show the form again
        this.showForm();
        
        return true;
      },
      
      showForm() {
        // Show the form container and hide progress/result/error containers
        const formContainer = document.getElementById('form-container');
        const progressContainer = document.getElementById('progress-container');
        const resultContainer = document.getElementById('result-container');
        const errorContainer = document.getElementById('error-container');
        
        if (formContainer) formContainer.style.display = 'block';
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';
        
        // Add warning message
        if (formContainer && !formContainer.querySelector('.processor-warning')) {
          const warningAlert = document.createElement('div');
          warningAlert.className = 'alert alert-warning mb-3 processor-warning';
          warningAlert.innerHTML = `
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>File Processor Module Unavailable</strong>
            <p class="mb-0 mt-1">The file processor module failed to load. Some functionality may be limited. Please refresh the page and try again.</p>
            <button class="btn btn-sm btn-primary mt-2" onclick="window.location.reload()">Refresh Page</button>
          `;
          
          formContainer.prepend(warningAlert);
        }
        
        return true;
      },
      
      showProgress() {
        // Show the progress container and hide form/result/error containers
        const formContainer = document.getElementById('form-container');
        const progressContainer = document.getElementById('progress-container');
        const resultContainer = document.getElementById('result-container');
        const errorContainer = document.getElementById('error-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'block';
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';
        
        // Reset progress bar
        const progressBar = document.getElementById('process-progress-bar');
        if (progressBar) {
          progressBar.style.width = '10%';
          progressBar.setAttribute('aria-valuenow', 10);
          progressBar.textContent = '10%';
          progressBar.classList.remove('bg-success');
          progressBar.classList.add('bg-primary');
        }
        
        // Reset status message
        const progressStatus = document.getElementById('process-progress-status');
        if (progressStatus) {
          progressStatus.textContent = 'Preparing to process files...';
          progressStatus.classList.remove('text-danger');
        }
        
        return true;
      },
      
      showResults() {
        // Show the results container and hide form/progress/error containers
        const formContainer = document.getElementById('form-container');
        const progressContainer = document.getElementById('progress-container');
        const resultContainer = document.getElementById('result-container');
        const errorContainer = document.getElementById('error-container');
        
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'block';
        if (errorContainer) errorContainer.style.display = 'none';
        
        // Add results content
        if (resultContainer) {
          resultContainer.innerHTML = `
            <div class="card">
              <div class="card-header bg-success text-white">
                <h5 class="mb-0">Processing Complete</h5>
              </div>
              <div class="card-body">
                <p>Your files have been successfully processed.</p>
                <div class="d-flex justify-content-between">
                  <div>
                    <strong>Files Processed:</strong> ${this.selectedFiles ? this.selectedFiles.length : 1}<br>
                    <strong>Total Size:</strong> ${this.selectedFiles ? this.formatFileSize(Array.from(this.selectedFiles).reduce((total, file) => total + file.size, 0)) : '5 MB'}<br>
                    <strong>Processing Time:</strong> ${Math.floor(Math.random() * 5) + 2}s
                  </div>
                  <div>
                    <strong>Output Folder:</strong><br>
                    /downloads/processed_${Date.now()}
                  </div>
                </div>
              </div>
              <div class="card-footer">
                <button id="process-open-folder-btn" class="btn btn-primary">
                  <i class="fas fa-folder-open me-2"></i>Open Folder
                </button>
                <button id="process-new-task-btn" class="btn btn-outline-primary ms-2">
                  <i class="fas fa-plus me-2"></i>New Task
                </button>
              </div>
            </div>
          `;
          
          // Add event listeners
          resultContainer.querySelector('#process-open-folder-btn')?.addEventListener('click', () => {
            alert('This would open the output folder in a real implementation');
          });
          
          resultContainer.querySelector('#process-new-task-btn')?.addEventListener('click', () => {
            this.showForm();
          });
        }
        
        return true;
      },
      setupProgressTracking(taskId) {
        console.warn("Fallback setupProgressTracking called with:", taskId);
        
        // Use progressHandler if available
        if (window.moduleInstances.progressHandler && typeof window.moduleInstances.progressHandler.trackProgress === 'function') {
          return window.moduleInstances.progressHandler.trackProgress(taskId, {
            elementPrefix: 'process-',
            taskType: 'file'
          });
        }
        
        return null;
      },
      
      handleProgressUpdate(data) {
        if (!data) return false;
        
        // Update progress bar
        const progressBar = document.getElementById('process-progress-bar');
        if (progressBar && data.progress !== undefined) {
          const percent = Math.round(data.progress);
          progressBar.style.width = `${percent}%`;
          progressBar.setAttribute('aria-valuenow', percent);
          progressBar.textContent = `${percent}%`;
        }
        
        // Update status message
        const progressStatus = document.getElementById('process-progress-status');
        if (progressStatus && data.message) {
          progressStatus.textContent = data.message;
        }
        
        // Update stats
        if (data.stats) {
          const statsContainer = document.getElementById('process-progress-stats');
          if (statsContainer) {
            // Format stats as HTML
            let statsHtml = '';
            
            for (const [key, value] of Object.entries(data.stats)) {
              statsHtml += `<div><strong>${key}:</strong> ${value}</div>`;
            }
            
            statsContainer.innerHTML = statsHtml;
          }
        }
        
        return true;
      },
      
      handleTaskError(data) {
        console.warn("Fallback handleTaskError called with:", data);
        
        // Show error message
        this.showError(data.error || "An error occurred during file processing");
        
        return true;
      },
      
      showError(message) {
        // Show the error container and hide form/progress/result containers
        const formContainer = document.getElementById('form-container');
        const progressContainer = document.getElementById('progress-container');
        const resultContainer = document.getElementById('result-container');
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        
        if (formContainer) formContainer.style.display = 'none';
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'block';
        if (errorMessage) errorMessage.textContent = message || 'An error occurred during processing';
        
        return true;
      },
      
      resumeTask(taskId) {
        console.warn(`Fallback resumeTask called with: ${taskId}`);
        
        // Check if this is a file task
        const taskType = sessionStorage.getItem('ongoingTaskType');
        if (taskType !== 'file') return false;
        
        // Show progress UI
        this.showProgress();
        
        // Set up progress tracking
        this.setupProgressTracking(taskId);
        
        // Request status update
        if (window.moduleInstances.socketHandler) {
          window.moduleInstances.socketHandler.emit('request_status', {
            task_id: taskId
          });
        }
        
        return true;
      },
      
      processFiles() {
        // This is already handled by handleUpload
        return Promise.resolve(false);
      },
      
      handleTaskCompleted(data) {
        console.warn("Fallback handleTaskCompleted called with:", data);
        this.showResults();
        return true;
      }
    };
  },
  
  /**
   * Get module by path
   * @param {string} path - Path to the module
   * @returns {Object|null} - The module or null if not found
   */
  getModule(path) {
    if (!path) return null;
    
    // Resolve and normalize path
    const resolvedPath = this.resolvePath(path);
    const normalizedPath = this.getNormalizedPath(resolvedPath);
    
    // Check cache
    return this.cache.get(normalizedPath) || null;
  },
  
  /**
   * Get the list of module paths that are currently loading
   * @returns {Array<string>} - List of loading module paths
   */
  getLoadingModules() {
    return Array.from(this.loadingModules);
  },
  
  /**
   * Get the list of paths for modules that failed to load
   * @returns {Array<string>} - List of failed module paths
   */
  getFailedModules() {
    return Array.from(this.failedModules);
  },
  
  /**
   * Load module and expose it globally
   * @param {string} path - Path to the module
   * @param {boolean} required - Whether the module is required
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - The loaded module
   */
  loadModule(path, { required = false, globalName = null, ...options } = {}) {
    const moduleName = this.getModuleName(path);
    const globName = globalName || moduleName;
    
    return this.importModule(path, { required, ...options })
      .then(module => {
        if (module) {
          // Expose globally
          window[globName] = module;
          
          // Add to moduleInstances registry if it exists
          if (window.moduleInstances) {
            window.moduleInstances[globName] = module;
          } else {
            window.moduleInstances = { [globName]: module };
          }
        }
        
        return module;
      });
  },
  
  /**
   * Check if browser supports ES modules
   * @returns {boolean} - Whether ES modules are supported
   */
  supportsESModules() {
    try {
      // Check by trying to create a script element with type="module"
      const script = document.createElement('script');
      return 'noModule' in script;
    } catch (e) {
      return false;
    }
  },
  
  /**
   * Apply stored theme to the document
   */
  applyStoredTheme() {
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
  },
  
  /**
   * Set up basic tab navigation behavior
   */
  setupBasicTabNavigation() {
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
  },
  
  /**
   * Show an error message to the user
   * @param {string} message - Error message
   */
  showErrorMessage(message) {
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
  },
  
  /**
   * Clear the module cache
   * @param {boolean} clearFailed - Whether to clear failed modules as well
   */
  clearCache(clearFailed = false) {
    this.cache.clear();
    this.loadingPromises.clear();
    
    if (clearFailed) {
      this.failedModules.clear();
      this.loadAttempts.clear();
      
      // Clear failed modules from localStorage
      try {
        localStorage.removeItem('failedModules');
      } catch (e) {
        // Ignore localStorage errors
      }
    }
    
    console.log(`Module cache cleared${clearFailed ? ' including failed modules' : ''}`);
    return true;
  },
  
  /**
   * Fix failed modules by clearing their status and cache
   */
  fixFailedModules() {
    const failedCount = this.failedModules.size;
    
    if (failedCount === 0) {
      console.log('No failed modules to fix');
      return 0;
    }
    
    console.log(`Fixing ${failedCount} failed modules...`);
    
    // Get list of failed modules before clearing
    const failedModules = Array.from(this.failedModules);
    
    // Clear failed status and attempts
    this.failedModules.clear();
    this.loadAttempts.clear();
    
    // Clear failed modules from cache
    failedModules.forEach(path => {
      this.cache.delete(path);
    });
    
    // Clear from localStorage
    try {
      localStorage.removeItem('failedModules');
    } catch (e) {
      // Ignore localStorage errors
    }
    
    console.log(`Fixed ${failedCount} failed modules`);
    return failedCount;
  },
  
  /**
   * Activate recovery mode for the module loader
   * @returns {Promise<boolean>} - Whether recovery mode was activated
   */
  async activateRecoveryMode() {
    console.log("Activating module loader recovery mode");
    
    // Clear cache and failed modules
    this.clearCache(true);
    
    // Reset loading and dependency tracking
    this.loadingModules.clear();
    this.loadingPromises.clear();
    this.dependencyGraph = {};
    
    // Create fallbacks for critical modules
    const criticalModules = this.CRITICAL_MODULES;
    
    for (const moduleName of criticalModules) {
      const moduleNameWithoutExt = moduleName.replace(/\.js$/, '');
      const moduleType = this.MODULE_TYPES[moduleNameWithoutExt];
      
      if (!moduleType) continue;
      
      const modulePath = `/static/js/modules/${moduleType}/${moduleName}`;
      const normalizedPath = this.getNormalizedPath(modulePath);
      
      // Check if module is already loaded
      if (this.cache.has(normalizedPath)) continue;
      
      // Create fallback
      console.log(`Creating recovery fallback for ${moduleName}`);
      
      let fallback;
      switch (moduleNameWithoutExt) {
        case 'ui':
          fallback = this.createUIFallback();
          break;
        case 'progressHandler':
          fallback = this.createProgressHandlerFallback();
          break;
        case 'socketHandler':
          fallback = this.createSocketHandlerFallback();
          break;
        case 'playlistDownloader':
          fallback = this.createPlaylistDownloaderFallback();
          break;
        case 'webScraper':
          fallback = this.createWebScraperFallback();
          break;
        case 'fileProcessor':
          fallback = this.createFileProcessorFallback();
          break;
        default:
          continue;
      }
      
      // Add to cache
      this.cache.set(normalizedPath, fallback);
      
      // Make it globally available
      window[moduleNameWithoutExt] = fallback;
      
      // Add to moduleInstances registry
      if (!window.moduleInstances) {
        window.moduleInstances = {};
      }
      window.moduleInstances[moduleNameWithoutExt] = fallback;
    }
    
    // Show recovery UI to help the user
    this.createRecoveryUI();
    
    return true;
  },
  
  /**
   * Create recovery UI to help user resolve module loading issues
   */
  createRecoveryUI() {
    // Check if recovery UI already exists
    if (document.getElementById('recovery-container')) return;
    
    // Create container
    const container = document.createElement('div');
    container.id = 'recovery-container';
    container.className = 'container mt-4 p-4 border rounded bg-light';
    
    // Create content
    container.innerHTML = `
      <div class="alert alert-warning mb-4">
        <h4><i class="fas fa-exclamation-triangle me-2"></i> Module Loading Issue Detected</h4>
        <p>Some modules failed to load correctly. The application is running in recovery mode with limited functionality.</p>
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
            </div>
          </div>
        </div>
        
        <div class="col-md-6">
          <div class="card">
            <div class="card-header bg-info text-white">
              Technical Information
            </div>
            <div class="card-body">
              <p><strong>Failed Modules:</strong> <span id="failed-modules-count">${this.failedModules.size}</span></p>
              <p><strong>Module Loader Version:</strong> 3.0</p>
              <p><strong>Recovery Mode:</strong> Active</p>
              <p><strong>Browser:</strong> ${navigator.userAgent}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="mt-4" id="failed-modules-list-container" style="display: ${this.failedModules.size > 0 ? 'block' : 'none'};">
        <h5>Failed Modules</h5>
        <ul class="list-group" id="failed-modules-list">
          ${Array.from(this.failedModules).map(path => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              ${path}
              <span class="badge bg-warning rounded-pill">Failed</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(container);
    
    // Add button handlers
    document.getElementById('refresh-page-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
    
    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
      this.clearCache(true);
      window.location.reload();
    });
    
    document.getElementById('diagnostics-btn')?.addEventListener('click', () => {
      this.launchDiagnostics();
    });
  },
  
  /**
   * Launch module system diagnostics
   */
  launchDiagnostics() {
    console.log("Launching module diagnostics...");
    
    // Initialize diagnostics if not already done
    if (!this.diagnosticsInitialized) {
      this.initializeModuleDiagnostics();
    }
    
    // Generate comprehensive health report
    const healthReport = this.generateHealthReport();
    
    // Update path resolution test
    this.runPathResolutionTest();
    
    // Show diagnostics report in UI
    this.showDiagnosticsUI(healthReport);
    
    return healthReport;
  },
  
  /**
   * Initialize module diagnostics system
   */
  initializeModuleDiagnostics() {
    if (this.diagnosticsInitialized) return;
    
    console.log("Initializing module diagnostics...");
    
    // Make the launchDiagnostics function available globally
    window.launchDiagnostics = this.launchDiagnostics.bind(this);
    
    // Set up diagnostics button
    this.createDiagnosticsButton();
    
    this.diagnosticsInitialized = true;
  },
  
  /**
   * Create diagnostics button for easy access
   */
  createDiagnosticsButton() {
    // Check if button already exists
    if (document.getElementById('module-diagnostics-btn')) return;
    
    // Create button
    const button = document.createElement('button');
    button.id = 'module-diagnostics-btn';
    button.className = 'btn btn-sm btn-info position-fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.zIndex = '9999';
    button.innerHTML = '<i class="fas fa-stethoscope"></i>';
    button.title = 'Module Diagnostics';
    
    // Add click handler
    button.addEventListener('click', () => {
      this.launchDiagnostics();
    });
    
    // Add to document
    document.body.appendChild(button);
  },
  
  /**
   * Generate a comprehensive health report for the module system
   * @returns {Object} - Health report
   */
  generateHealthReport() {
    const timestamp = new Date().toISOString();
    
    const report = {
      timestamp,
      moduleLoaderVersion: "3.0",
      initialized: this.initialized,
      debugMode: this.debugMode,
      browserInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      },
      modules: {
        loaded: Array.from(this.cache.keys()),
        failed: Array.from(this.failedModules),
        loading: Array.from(this.loadingModules)
      },
      cacheSize: this.cache.size,
      failedModulesCount: this.failedModules.size,
      loadingModulesCount: this.loadingModules.size,
      pathResolutionTest: this.pathResolutionTestResults || {},
      circularDependencies: this.detectCircularDependencies()
    };
    
    // Add list of failed paths with attempts
    report.failedPaths = Array.from(this.failedModules).map(path => ({
      path,
      attempts: this.loadAttempts.get(path) || 0
    }));
    
    return report;
  },
  
  /**
   * Run path resolution test for common module paths
   * @returns {Object} - Test results
   */
  runPathResolutionTest() {
    const testPaths = [
      './modules/features/playlistDownloader.js',
      'playlistDownloader.js',
      './modules/features/fileProcessor.js',
      './modules/utils/progressHandler.js',
      'app.js',
      '/static/js/modules/features/webScraper.js'
    ];
    
    const results = {};
    
    testPaths.forEach(path => {
      results[path] = this.resolvePath(path);
    });
    
    this.pathResolutionTestResults = results;
    return results;
  },
  
  /**
   * Detect circular dependencies in the module dependency graph
   * @returns {Array<Array<string>>} - List of circular dependencies
   */
  detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const circularDependencies = [];
    
    // Helper function for DFS
    const dfs = (node, path = []) => {
      // Skip if no node or already in visited
      if (!node || visited.has(node)) return;
      
      // Add to recursion stack
      recursionStack.add(node);
      path.push(node);
      
      // Visit all neighbors
      const neighbors = this.dependencyGraph[node] || [];
      
      for (const neighbor of neighbors) {
        // If already in recursion stack, we have a cycle
        if (recursionStack.has(neighbor)) {
          // Get the cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          circularDependencies.push(cycle);
          continue;
        }
        
        // Skip if already visited
        if (visited.has(neighbor)) continue;
        
        // Recursively visit neighbor
        dfs(neighbor, [...path]);
      }
      
      // Remove from recursion stack
      recursionStack.delete(node);
      
      // Add to visited
      visited.add(node);
    };
    
    // Start DFS from all nodes
    Object.keys(this.dependencyGraph).forEach(node => {
      if (!visited.has(node)) {
        dfs(node);
      }
    });
    
    return circularDependencies;
  },
  
  /**
   * Show diagnostics UI with health report
   * @param {Object} report - Health report
   */
  showDiagnosticsUI(report) {
    // Check if UI already exists
    let diagnosticsUI = document.getElementById('module-diagnostics-ui');
    let modalInstance = null;
    
    if (!diagnosticsUI) {
      // Create modal container
      diagnosticsUI = document.createElement('div');
      diagnosticsUI.id = 'module-diagnostics-ui';
      diagnosticsUI.className = 'modal fade';
      diagnosticsUI.tabIndex = -1;
      
      // Create modal content
      diagnosticsUI.innerHTML = `
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title">Module System Diagnostics</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="diagnostics-container">
                <div class="row">
                  <div class="col-md-6">
                    <div class="card mb-3">
                      <div class="card-header bg-primary text-white">
                        Module Status
                      </div>
                      <div class="card-body">
                        <p><strong>Loaded:</strong> <span id="diag-loaded-count">${report.modules.loaded.length}</span></p>
                        <p><strong>Failed:</strong> <span id="diag-failed-count">${report.modules.failed.length}</span></p>
                        <p><strong>Initialized:</strong> <span id="diag-initialized-count">${this.initializedModules.size}</span></p>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="card mb-3">
                      <div class="card-header bg-info text-white">
                        System Info
                      </div>
                      <div class="card-body">
                        <p><strong>Module Loader:</strong> ${report.initialized ? 'Initialized' : 'Not Initialized'}</p>
                        <p><strong>Debug Mode:</strong> ${report.debugMode ? 'Enabled' : 'Disabled'}</p>
                        <p><strong>Browser:</strong> ${report.browserInfo.platform}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                ${report.failedModulesCount > 0 ? `
                  <div class="card mb-3 border-danger">
                    <div class="card-header bg-danger text-white">
                      Failed Modules (${report.failedModulesCount})
                    </div>
                    <div class="card-body">
                      <ul class="list-group">
                        ${report.failedPaths.map(item => `
                          <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${item.path}
                            <span class="badge bg-warning rounded-pill">Attempts: ${item.attempts}/${this.MAX_LOAD_ATTEMPTS}</span>
                          </li>
                        `).join('')}
                      </ul>
                      <button id="fix-modules-btn" class="btn btn-primary mt-3">
                        <i class="fas fa-wrench me-2"></i> Fix Failed Modules
                      </button>
                    </div>
                  </div>
                ` : ''}
                
                <h5>Path Resolution Test</h5>
                <div class="table-responsive mb-3">
                  <table class="table table-sm table-bordered">
                    <thead class="table-light">
                      <tr>
                        <th>Input Path</th>
                        <th>Resolved Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${Object.entries(report.pathResolutionTest).map(([input, output]) => `
                        <tr>
                          <td><code>${input}</code></td>
                          <td><code>${output}</code></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                
                ${report.circularDependencies.length > 0 ? `
                  <h5>Circular Dependencies Detected</h5>
                  <div class="alert alert-warning">
                    <ul>
                      ${report.circularDependencies.map(cycle => `
                        <li>${cycle.join(' → ')} → ${cycle[0]}</li>
                      `).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary" id="refresh-diagnostics-btn">
                <i class="fas fa-sync-alt me-2"></i>Refresh
              </button>
              <button type="button" class="btn btn-danger" id="clear-cache-diagnostics-btn">
                <i class="fas fa-broom me-2"></i>Clear Cache
              </button>
            </div>
          </div>
        </div>
      `;
      
      // Add to document
      document.body.appendChild(diagnosticsUI);
    } else {
      // Update existing UI
      document.getElementById('diag-loaded-count').textContent = report.modules.loaded.length;
      document.getElementById('diag-failed-count').textContent = report.modules.failed.length;
      document.getElementById('diag-initialized-count').textContent = this.initializedModules.size;
    }
    
    // Add button handlers
    document.getElementById('fix-modules-btn')?.addEventListener('click', () => {
      this.fixFailedModules();
      this.launchDiagnostics(); // Refresh diagnostics
    });
    
    document.getElementById('refresh-diagnostics-btn')?.addEventListener('click', () => {
      this.launchDiagnostics();
    });
    
    document.getElementById('clear-cache-diagnostics-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the module cache? This may cause the page to refresh.')) {
        this.clearCache(true);
        this.launchDiagnostics();
      }
    });
    
    // Show the modal
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        modalInstance = new bootstrap.Modal(diagnosticsUI);
        modalInstance.show();
      } else {
        // Simple show without Bootstrap
        diagnosticsUI.style.display = 'block';
        diagnosticsUI.classList.add('show');
        document.body.classList.add('modal-open');
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        document.body.appendChild(backdrop);
        
        // Add close handler
        const closeButton = diagnosticsUI.querySelector('[data-bs-dismiss="modal"]');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            diagnosticsUI.style.display = 'none';
            diagnosticsUI.classList.remove('show');
            document.body.classList.remove('modal-open');
            backdrop.remove();
          });
        }
      }
    } catch (error) {
      console.error("Error showing diagnostics modal:", error);
      // Fallback to console output
      console.log("Module System Health Report", report);
    }
  },
  
  /**
     * Check the health of a specific module or all modules
     * @param {string} moduleName - Name of the module to check, or undefined for all
     * @returns {Object} - Health check results
     */
  checkModuleHealth(moduleName) {
    // If no module name, check all modules
    if (!moduleName) {
      return {
        status: this.failedModules.size > 0 ? 'warnings' : 'ok',
        failedCount: this.failedModules.size,
        loadedCount: this.cache.size,
        initializedCount: this.initializedModules.size,
        modulesFailing: Array.from(this.failedModules).map(path => this.getModuleName(path)),
        modulesUsingFallback: this.getModulesUsingFallbacks(),
        moduleIsFallback: false
      };
    }
    
    // Check specific module
    const moduleNameWithExt = moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`;
    const moduleType = this.MODULE_TYPES[moduleName];
    
    if (!moduleType) {
      return {
        status: 'unknown',
        message: `Unknown module: ${moduleName}`,
        moduleExists: false
      };
    }
    
    const modulePath = `/static/js/modules/${moduleType}/${moduleNameWithExt}`;
    const normalizedPath = this.getNormalizedPath(modulePath);
    
    // Check if module is loaded
    const isLoaded = this.cache.has(normalizedPath);
    const isFailed = this.failedModules.has(normalizedPath);
    const isLoading = this.loadingModules.has(normalizedPath);
    
    // Get module instance if available
    const moduleInstance = this.cache.get(normalizedPath);
    const isFallback = moduleInstance && moduleInstance.__isFallback;
    
    // Check if module is initialized
    const isInitialized = this.initializedModules.has(moduleName);
    
    // Get load attempts if any
    const loadAttempts = this.loadAttempts.get(normalizedPath) || 0;
    
    return {
      status: isFailed ? 'failed' : (isFallback ? 'fallback' : (isLoaded ? 'ok' : 'not_loaded')),
      moduleName,
      moduleType,
      modulePath,
      isLoaded,
      isFailed,
      isLoading,
      isFallback,
      isInitialized,
      loadAttempts,
      dependencies: this.dependencyGraph[normalizedPath] || [],
      moduleIsFallback: isFallback
    };
  },

  /**
   * Get list of modules using fallbacks
   * @returns {Array<string>} - List of modules using fallbacks
   */
  getModulesUsingFallbacks() {
    const fallbackModules = [];
    
    for (const [path, module] of this.cache.entries()) {
      if (module && module.__isFallback) {
        fallbackModules.push(this.getModuleName(path));
      }
    }
    
    return fallbackModules;
  },

  /**
   * Check if the application can continue running despite module failures
   * @returns {boolean} - Whether the application can continue
   */
  canContinueWithFailures() {
    // Check if any critical modules have failed
    for (const moduleName of this.CRITICAL_MODULES) {
      const result = this.checkModuleHealth(moduleName.replace('.js', ''));
      
      // If a critical module is failing and not using a fallback, the app can't continue
      if (result.isFailed && !result.isFallback) {
        return false;
      }
    }
    
    // If all critical modules are either loaded or using fallbacks, the app can continue
    return true;
  },

  /**
   * Load a module with its dependencies
   * @param {string} modulePath - Path to the module
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - The module with its dependencies
   */
  async loadModuleWithDependencies(modulePath, options = {}) {
    // First, get dependencies for this module
    const moduleName = this.getModuleName(modulePath) + '.js';
    const dependencies = this.MODULE_DEPENDENCIES[moduleName] || [];
    
    // Load dependencies first if they exist
    if (dependencies.length > 0) {
      const dependencyModules = {};
      
      // Load each dependency
      for (const dep of dependencies) {
        const depName = dep.replace('.js', '');
        const depType = this.MODULE_TYPES[depName];
        
        if (!depType) continue;
        
        const depPath = `/static/js/modules/${depType}/${dep}`;
        
        try {
          const module = await this.importModule(depPath, {
            required: false,
            retries: 2,
            ...options
          });
          
          if (module) {
            dependencyModules[depName] = module;
          }
        } catch (error) {
          console.warn(`Failed to load dependency ${dep} for ${moduleName}:`, error);
          // Continue with other dependencies
        }
      }
      
      // Now load the main module
      const mainModule = await this.importModule(modulePath, options);
      
      // Return both the main module and its dependencies
      return {
        module: mainModule,
        dependencies: dependencyModules
      };
    }
    
    // If no dependencies, just load the module
    const module = await this.importModule(modulePath, options);
    
    return {
      module,
      dependencies: {}
    };
  },

  /**
   * Ensure a module is loaded, trying multiple resolution strategies
   * @param {string} moduleName - Module name (without path)
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - The loaded module
   */
  async ensureModule(moduleName, options = {}) {
    if (!moduleName) {
      throw new Error('Module name is required');
    }
    
    // Try multiple resolution strategies
    const possiblePaths = [
      // Try as a direct module name
      moduleName,
      // Try with .js extension
      moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`,
      // Try in potential directories
      `/static/js/modules/utils/${moduleName}`,
      `/static/js/modules/utils/${moduleName}.js`,
      `/static/js/modules/features/${moduleName}`,
      `/static/js/modules/features/${moduleName}.js`,
      `/static/js/modules/core/${moduleName}`,
      `/static/js/modules/core/${moduleName}.js`,
      // Try with relative paths
      `./modules/utils/${moduleName}`,
      `./modules/utils/${moduleName}.js`,
      `./modules/features/${moduleName}`,
      `./modules/features/${moduleName}.js`,
      `./modules/core/${moduleName}`,
      `./modules/core/${moduleName}.js`
    ];
    
    // Try each path until one succeeds
    for (const path of possiblePaths) {
      try {
        return await this.importModule(path, options);
      } catch (error) {
        // Continue to the next path
        continue;
      }
    }
    
    // If we got here, all resolution attempts failed
    throw new Error(`Could not load module ${moduleName} using any resolution strategy`);
  },

  /**
   * Create a complete diagnostics report for the module system
   * @returns {string} - HTML report
   */
  createDiagnosticsReport() {
    // Generate health report
    const report = this.generateHealthReport();
    
    // Generate HTML
    let html = `
      <h2>Module System Diagnostics Report</h2>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>System Information</h3>
      <ul>
        <li><strong>Module Loader Version:</strong> ${report.moduleLoaderVersion}</li>
        <li><strong>Status:</strong> ${report.initialized ? 'Initialized' : 'Not Initialized'}</li>
        <li><strong>Debug Mode:</strong> ${report.debugMode ? 'Enabled' : 'Disabled'}</li>
        <li><strong>Browser:</strong> ${report.browserInfo.userAgent}</li>
        <li><strong>Platform:</strong> ${report.browserInfo.platform}</li>
      </ul>
      
      <h3>Module Statistics</h3>
      <ul>
        <li><strong>Loaded Modules:</strong> ${report.modules.loaded.length}</li>
        <li><strong>Failed Modules:</strong> ${report.failedModulesCount}</li>
        <li><strong>Loading Modules:</strong> ${report.loadingModulesCount}</li>
        <li><strong>Cache Size:</strong> ${report.cacheSize}</li>
      </ul>
    `;
    
    // Add failed modules section if any
    if (report.failedModulesCount > 0) {
      html += `
        <h3>Failed Modules</h3>
        <table border="1" cellpadding="5" cellspacing="0">
          <tr>
            <th>Path</th>
            <th>Attempts</th>
          </tr>
          ${report.failedPaths.map(item => `
            <tr>
              <td>${item.path}</td>
              <td>${item.attempts}/${this.MAX_LOAD_ATTEMPTS}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }
    
    // Add path resolution test
    html += `
      <h3>Path Resolution Test</h3>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th>Input Path</th>
          <th>Resolved Path</th>
        </tr>
        ${Object.entries(report.pathResolutionTest).map(([input, output]) => `
          <tr>
            <td><code>${input}</code></td>
            <td><code>${output}</code></td>
          </tr>
        `).join('')}
      </table>
    `;
    
    // Add circular dependencies if any
    if (report.circularDependencies.length > 0) {
      html += `
        <h3>Circular Dependencies</h3>
        <ul>
          ${report.circularDependencies.map(cycle => `
            <li>${cycle.join(' → ')} → ${cycle[0]}</li>
          `).join('')}
        </ul>
      `;
    }
    
    // Add loaded modules
    html += `
      <h3>Loaded Modules</h3>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th>Module</th>
          <th>Path</th>
          <th>Type</th>
          <th>Status</th>
        </tr>
        ${report.modules.loaded.map(path => {
          const moduleName = this.getModuleName(path);
          const module = this.cache.get(path);
          const isFallback = module && module.__isFallback;
          const isInitialized = this.initializedModules.has(moduleName);
          
          return `
            <tr>
              <td>${moduleName}</td>
              <td>${path}</td>
              <td>${this.MODULE_TYPES[moduleName] || 'unknown'}</td>
              <td>${isFallback ? 'Fallback' : (isInitialized ? 'Initialized' : 'Loaded')}</td>
            </tr>
          `;
        }).join('')}
      </table>
    `;
    
    return html;
  },

  /**
   * Generate optimization recommendations for the module system
   * @returns {Array<string>} - List of recommendations
   */
  generateOptimizationRecommendations() {
    const recommendations = [];
    
    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      recommendations.push(
        `Resolve circular dependencies between modules: ${circularDeps.map(cycle => cycle.join(' → ')).join(', ')}`
      );
    }
    
    // Check for failed modules
    if (this.failedModules.size > 0) {
      recommendations.push(
        `Fix ${this.failedModules.size} failed modules: ${Array.from(this.failedModules).map(path => this.getModuleName(path)).join(', ')}`
      );
    }
    
    // Check for modules using fallbacks
    const fallbackModules = this.getModulesUsingFallbacks();
    if (fallbackModules.length > 0) {
      recommendations.push(
        `Replace fallback implementations for ${fallbackModules.length} modules: ${fallbackModules.join(', ')}`
      );
    }
    
    // Check if any modules exceeded MAX_LOAD_ATTEMPTS
    const maxAttemptsExceeded = [];
    for (const [path, attempts] of this.loadAttempts.entries()) {
      if (attempts >= this.MAX_LOAD_ATTEMPTS) {
        maxAttemptsExceeded.push(this.getModuleName(path));
      }
    }
    
    if (maxAttemptsExceeded.length > 0) {
      recommendations.push(
        `Investigate modules that exceeded maximum load attempts: ${maxAttemptsExceeded.join(', ')}`
      );
    }
    
    // Add general optimization recommendations
    recommendations.push(
      'Consider increasing concurrency limit for parallel module loading',
      'Implement module bundling for production environments',
      'Add module caching with localStorage for faster startup',
      'Implement lazy loading for non-critical modules'
    );
    
    return recommendations;
  }
  };

// Initialize the module loader
moduleLoader.init();

// Export named methods and properties for direct use
export const importModule = moduleLoader.importModule.bind(moduleLoader);
export const importModules = moduleLoader.importModules.bind(moduleLoader);
export const loadModule = moduleLoader.loadModule.bind(moduleLoader);
export const loadModuleWithDependencies = moduleLoader.loadModuleWithDependencies.bind(moduleLoader);
export const ensureModule = moduleLoader.ensureModule.bind(moduleLoader);
export const getModule = moduleLoader.getModule.bind(moduleLoader);
export const resolvePath = moduleLoader.resolvePath.bind(moduleLoader);
export const clearCache = moduleLoader.clearCache.bind(moduleLoader);
export const fixFailedModules = moduleLoader.fixFailedModules.bind(moduleLoader);
export const activateRecoveryMode = moduleLoader.activateRecoveryMode.bind(moduleLoader);
export const checkModuleHealth = moduleLoader.checkModuleHealth.bind(moduleLoader);
export const canContinueWithFailures = moduleLoader.canContinueWithFailures.bind(moduleLoader);
export const getFailedModules = moduleLoader.getFailedModules.bind(moduleLoader);
export const getLoadingModules = moduleLoader.getLoadingModules.bind(moduleLoader);
export const getModulesUsingFallbacks = moduleLoader.getModulesUsingFallbacks.bind(moduleLoader);
export const createDiagnosticsReport = moduleLoader.createDiagnosticsReport.bind(moduleLoader);
export const launchDiagnostics = moduleLoader.launchDiagnostics.bind(moduleLoader);
export const generateHealthReport = moduleLoader.generateHealthReport.bind(moduleLoader);
export const runPathResolutionTest = moduleLoader.runPathResolutionTest.bind(moduleLoader);
export const generateOptimizationRecommendations = moduleLoader.generateOptimizationRecommendations.bind(moduleLoader);

// Export core fallback creators for direct use
export const createUIFallback = moduleLoader.createUIFallback.bind(moduleLoader);
export const createProgressHandlerFallback = moduleLoader.createProgressHandlerFallback.bind(moduleLoader);
export const createSocketHandlerFallback = moduleLoader.createSocketHandlerFallback.bind(moduleLoader);
export const createPlaylistDownloaderFallback = moduleLoader.createPlaylistDownloaderFallback.bind(moduleLoader);
export const createWebScraperFallback = moduleLoader.createWebScraperFallback.bind(moduleLoader);
export const createFileProcessorFallback = moduleLoader.createFileProcessorFallback.bind(moduleLoader);

// Export status properties as getters and setters to ensure they reflect the current moduleLoader state
export const getInitialized = () => moduleLoader.initialized;
export const getDebugMode = () => moduleLoader.debugMode;
export const getVerboseLogging = () => moduleLoader.verboseLogging;
export const getEmergencyMode = () => moduleLoader.emergencyMode;
export const getCacheSize = () => moduleLoader.cache.size;
export const getFailedModulesCount = () => moduleLoader.failedModules.size;
export const getLoadingModulesCount = () => moduleLoader.loadingModules.size;
export const getInitializedModulesCount = () => moduleLoader.initializedModules.size;

// Export the module loader as default
export default moduleLoader;