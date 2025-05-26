/**
 * NeuroGen Server - Enhanced Module Loader v2.1
 * 
 * Provides reliable module loading with robust error handling, dependency management,
 * and graceful fallbacks for the NeuroGen Server frontend.
 * 
 * Features:
 * - Optimized and reliable ES6 module imports with proper error isolation
 * - Efficient module caching with consistent keys
 * - Improved circular dependency detection and resolution
 * - Graceful degradation for missing modules
 * - Browser compatibility checks
 * - Structured logging system
 * - Performance optimizations for rapid loading
 * - Resource management for memory efficiency
 * - Auto-export standardization for consistent module interfaces
 * - Enhanced path resolution to fix module loading issues
 * - Fixed module resolution for relative paths
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
    
    // Utility modules
    'utils.js': 'utils',
    'ui.js': 'utils',
    'fileHandler.js': 'utils',
    'progressHandler.js': 'utils',
    'socketHandler.js': 'utils',
    'debugTools.js': 'utils',
    'moduleDiagnostics.js': 'utils'
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
  
  // List of known/expected module exports to auto-create if missing
  MODULE_EXPORTS: {
    'errorHandler.js': [
      'loadUiModule', 
      'setupGlobalErrorHandler', 
      'registerWithEventRegistry', 
      'saveErrorHistory', 
      'loadErrorHistory'
    ],
    'eventRegistry.js': [
      'reset'
    ],
    'uiRegistry.js': [
      'getElement',
      'registerElement',
      'registerElements',
      'updateElement',
      'setElementVisibility'
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
  
  // Init method - first function called during setup
  init() {
    // Initialize the inverse module types mapping
    Object.entries(this.MODULE_LOCATIONS).forEach(([filename, location]) => {
      const moduleName = filename.replace('.js', '');
      this.MODULE_TYPES[moduleName] = location;
    });
    
    return this;
  },
  
  /**
   * Configure the module loader with options
   * @param {Object} options - Configuration options
   * @param {boolean} options.debug - Enable debug mode
   * @param {number} options.logLevel - Log level (0=ERROR, 1=WARN, 2=INFO, 3=DEBUG)
   * @param {boolean} options.verboseLogging - Enable detailed logging
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
    
    // Initialize module types mapping
    this.init();
    
    // Configure with options
    this.configure(options);
    
    // Check browser support for ES modules
    if (!this.supportsESModules()) {
      console.error('Browser does not support ES modules');
      this.showErrorMessage('Your browser does not support modern JavaScript modules. Please upgrade to a newer browser.');
      return false;
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
    return true;
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
    
    // If the path already starts with http or /, it's absolute
    if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) {
      return cleanPath;
    }
    
    // FIX: Improved handling for relative paths starting with ./
    if (cleanPath.startsWith('./')) {
      // Extract the module name from the relative path
      const parts = cleanPath.split('/');
      const moduleName = parts[parts.length - 1];
      const moduleNameNoExt = moduleName.replace(/\.js$/, '');
      
      // First check if this is a direct module we know
      if (this.MODULE_LOCATIONS[moduleName]) {
        const location = this.MODULE_LOCATIONS[moduleName];
        return `/static/js/modules/${location}/${moduleName}`;
      }
      
      // Also check without .js extension
      if (this.MODULE_TYPES[moduleNameNoExt]) {
        const location = this.MODULE_TYPES[moduleNameNoExt];
        return `/static/js/modules/${location}/${moduleNameNoExt}.js`;
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
      // Extract directory and filename
      const parts = cleanPath.split('/');
      const targetDir = parts[1]; // 'core', 'features', or 'utils'
      const filename = parts[2];
      
      if (targetDir && filename) {
        return `/static/js/modules/${targetDir}/${filename}`;
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
    
    // Try to extract module name from the path
    const lastSlashIndex = cleanPath.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const moduleName = cleanPath.substring(lastSlashIndex + 1);
      if (moduleName.endsWith('.js')) {
        const location = this.MODULE_LOCATIONS[moduleName];
        if (location) {
          return `/static/js/modules/${location}/${moduleName}`;
        }
      }
    }
    
    // FIX: For a simple path like 'ui.js', try to resolve it using MODULE_LOCATIONS
    if (cleanPath.endsWith('.js')) {
      const location = this.MODULE_LOCATIONS[cleanPath];
      if (location) {
        return `/static/js/modules/${location}/${cleanPath}`;
      }
    }
    
    // FIX: For module name without extension
    const moduleNameNoExt = cleanPath.replace(/\.js$/, '');
    const locationType = this.MODULE_TYPES[moduleNameNoExt];
    if (locationType) {
      return `/static/js/modules/${locationType}/${moduleNameNoExt}.js`;
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
   * Import a module safely with error handling and retries
   * @param {string} modulePath - Path to the module
   * @param {Object} options - Import options
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
      timeout = 5000
    } = options;
    
    try {
      // Resolve the module path
      const resolvedPath = this.resolvePath(modulePath);
      
      if (!resolvedPath) {
        throw new Error(`Could not resolve path for module: ${modulePath}`);
      }
      
      const cacheKey = this.getNormalizedPath(resolvedPath);
      
      // Check if module is already in the cache
      if (!skipCache && this.cache.has(cacheKey)) {
        if (this.verboseLogging) {
          console.log(`Module ${modulePath} loaded from cache`);
        }
        return this.cache.get(cacheKey);
      }
      
      // Check if module is currently being loaded
      if (this.loadingPromises.has(cacheKey)) {
        if (this.verboseLogging) {
          console.log(`Module ${modulePath} is already being loaded, reusing promise`);
        }
        return this.loadingPromises.get(cacheKey);
      }
      
      // Check if module failed to load previously
      if (this.failedModules.has(cacheKey)) {
        console.warn(`Module ${modulePath} previously failed to load, using fallback`);
        return fallback || this.createFallbackModule(this.getModuleName(modulePath));
      }
      
      // Check for circular dependencies
      if (this.loadingModules.has(cacheKey)) {
        console.warn(`Circular dependency detected for module: ${modulePath}`);
        // Create a temporary proxy to break the circular dependency
        const temporaryModule = this.createCircularDependencyResolver(this.getModuleName(modulePath));
        return temporaryModule;
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
      
      // Create a loading promise
      const loadPromise = (async () => {
        try {
          // Create timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Module import timed out: ${modulePath}`)), timeout);
          });
          
          // Attempt to import the module with timeout
          const modulePromise = import(resolvedPath);
          const module = await Promise.race([modulePromise, timeoutPromise]);
          
          // Get module name for auto-export creation
          const moduleName = this.getModuleName(modulePath) + '.js';
          
          // Enhance module with missing exports if needed
          let enhancedModule = module;
          if (standardizeExports) {
            enhancedModule = this.autoCreateMissingExports(module, moduleName);
          }
          
          // Get the default export or the module itself
          const moduleExport = enhancedModule.default || enhancedModule;
          
          // Add to cache
          this.cache.set(cacheKey, moduleExport);
          
          // Remove from loading set and promises
          this.loadingModules.delete(cacheKey);
          this.loadingPromises.delete(cacheKey);
          
          console.log(`Module ${resolvedPath} loaded successfully`);
          
          return moduleExport;
        } catch (error) {
          // Remove from loading set and promises
          this.loadingModules.delete(cacheKey);
          this.loadingPromises.delete(cacheKey);
          
          // Add to failed modules set
          this.failedModules.add(cacheKey);
          
          console.error(`Module ${resolvedPath} failed to load:`, error);
          
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
      
      const resolvedPath = this.resolvePath(modulePath);
      if (!resolvedPath) {
        console.error(`Failed to resolve path for module: ${modulePath}`);
        return fallback || this.createFallbackModule(this.getModuleName(modulePath), error);
      }
      
      const cacheKey = this.getNormalizedPath(resolvedPath);
      
      // Add to failed modules set
      this.failedModules.add(cacheKey);
      
      // Log the error
      console.error(`Failed to import module ${modulePath}:`, error);
      
      // Handle required modules
      if (required) {
        this.showErrorMessage(`Failed to load required module: ${modulePath}. ${error.message}`);
      }
      
      // Create and return fallback
      return fallback || this.createFallbackModule(this.getModuleName(modulePath), error);
    }
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
    const moduleProxy = {};
    
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
    
    // FIX: Explicitly handle options with default values
    const importOptions = {
      skipCache: options.skipCache || false,
      standardizeExports: options.standardizeExports !== false, // Default to true
      retries: options.retries || 1,
      timeout: options.timeout || 5000,
      concurrencyLimit: options.concurrencyLimit || 5,
      ignoreErrors: options.ignoreErrors || false
    };
    
    // Group modules for ordered loading
    const coreModules = uniquePaths.filter(path => {
      const name = this.getModuleName(path) + '.js';
      return this.INITIALIZATION_ORDER.includes(name);
    }).sort((a, b) => {
      const nameA = this.getModuleName(a) + '.js';
      const nameB = this.getModuleName(b) + '.js';
      return this.INITIALIZATION_ORDER.indexOf(nameA) - this.INITIALIZATION_ORDER.indexOf(nameB);
    });
    
    const otherModules = uniquePaths.filter(path => {
      const name = this.getModuleName(path) + '.js';
      return !this.INITIALIZATION_ORDER.includes(name);
    });
    
    // First load core modules in order
    const modules = {};
    
    for (const path of coreModules) {
      const moduleName = this.getModuleName(path);
      try {
        const module = await this.importModule(path, { 
          required: allRequired,
          skipCache: importOptions.skipCache,
          standardizeExports: importOptions.standardizeExports,
          retries: importOptions.retries + 1, // Extra retry for core modules
          timeout: importOptions.timeout + 3000 // Extra time for core modules
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
        
        // FIX: Create fallback for core modules when required
        if (allRequired) {
          modules[moduleName] = this.createFallbackModule(moduleName, error);
        }
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
          timeout: importOptions.timeout
        })
        .then(module => ({ path, module }))
        .catch(error => {
          // FIX: Handle errors per module's requirements
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
   * Create a fallback for core modules
   * @param {string} moduleName - Name of the core module
   * @returns {Object} - Fallback core module
   */
  createCoreFallback(moduleName) {
    // Remove .js extension if present for consistent naming
    const cleanName = moduleName.replace(/\.js$/, '');
    
    const baseFallback = {
      __isFallback: true,
      moduleName: cleanName,
      initialized: false,
      
      initialize() {
        console.warn(`Using fallback implementation for core module: ${cleanName}`);
        this.initialized = true;
        return Promise.resolve(true);
      }
    };
    
    // Add module-specific fallbacks
    switch (cleanName) {
      case 'uiRegistry':
        return {
          ...baseFallback,
          elements: new Map(),
          getElement(id) { 
            console.warn(`Fallback uiRegistry.getElement called for ${id}`);
            return document.getElementById(id); 
          },
          registerElement(id, element) { 
            this.elements.set(id, element);
            return true; 
          },
          registerElements(elements) {
            if (!elements || typeof elements !== 'object') return false;
            Object.entries(elements).forEach(([id, element]) => {
              this.registerElement(id, element);
            });
            return true;
          },
          updateElement(id, content) { 
            const element = this.getElement(id);
            if (element) {
              if (typeof content === 'string') {
                element.innerHTML = content;
              } else if (content instanceof Node) {
                element.innerHTML = '';
                element.appendChild(content);
              }
              return true;
            }
            return false;
          },
          setElementVisibility(id, visible) { 
            const element = this.getElement(id);
            if (element) {
              element.style.display = visible ? '' : 'none';
              return true;
            }
            return false;
          },
          registerCommonElements() { 
            console.warn('Fallback uiRegistry.registerCommonElements called');
            console.log("Registering common UI elements...");
            return true;
          },
          getUIElements() {
            console.warn('Fallback uiRegistry.getUIElements called');
            return Array.from(this.elements.entries()).reduce((acc, [key, value]) => {
              acc[key] = value;
              return acc;
            }, {});
          }
        };
        
      case 'eventRegistry':
        return {
          ...baseFallback,
          events: new Map(),
          handlers: new Map(),
          on(eventName, handler) { 
            if (!this.handlers.has(eventName)) {
              this.handlers.set(eventName, new Set());
            }
            this.handlers.get(eventName).add(handler);
            return true;
          },
          off(eventName, handler) { 
            if (this.handlers.has(eventName)) {
              if (handler) {
                this.handlers.get(eventName).delete(handler);
              } else {
                this.handlers.delete(eventName);
              }
              return true;
            }
            return false;
          },
          emit(eventName, ...args) { 
            if (this.handlers.has(eventName)) {
              this.handlers.get(eventName).forEach(handler => {
                try {
                  handler(...args);
                } catch (error) {
                  console.error(`Error in event handler for ${eventName}:`, error);
                }
              });
              return true;
            }
            return false;
          },
          registerEvent(eventName, description = '') {
            this.events.set(eventName, { description });
            return true;
          },
          reset() {
            this.handlers.clear();
            return true;
          }
        };
        
      case 'stateManager':
        return {
          ...baseFallback,
          state: {},
          subscribers: new Map(),
          getState(key) { 
            return key ? this.state[key] : { ...this.state };
          },
          setState(updates) { 
            if (!updates || typeof updates !== 'object') return false;
            
            const changedKeys = [];
            
            Object.entries(updates).forEach(([key, value]) => {
              if (this.state[key] !== value) {
                this.state[key] = value;
                changedKeys.push(key);
              }
            });
            
            // Notify subscribers
            changedKeys.forEach(key => {
              if (this.subscribers.has(key)) {
                this.subscribers.get(key).forEach(callback => {
                  try {
                    callback(this.state[key]);
                  } catch (error) {
                    console.error(`Error in state subscriber for ${key}:`, error);
                  }
                });
              }
            });
            
            return true;
          },
          subscribe(key, callback) { 
            if (!this.subscribers.has(key)) {
              this.subscribers.set(key, new Set());
            }
            this.subscribers.get(key).add(callback);
            
            // Return unsubscribe function
            return () => {
              if (this.subscribers.has(key)) {
                this.subscribers.get(key).delete(callback);
              }
            };
          }
        };
        
      case 'errorHandler':
        return {
          ...baseFallback,
          errorHistory: [],
          uiModule: null,
          
          handleError(error) { 
            console.error('Fallback error handler:', error);
            this.errorHistory.push({
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : null
            });
            this.showError(error instanceof Error ? error.message : String(error));
            return true;
          },
          showError(message) {
            console.error('Fallback error display:', message);
            
            // Try to find error container
            const errorContainer = document.getElementById('app-error-container');
            if (errorContainer) {
              errorContainer.innerHTML = `
                <div class="alert alert-danger">
                  <h5>Error</h5>
                  <p>${message}</p>
                </div>
              `;
              errorContainer.style.display = 'block';
            } else {
              alert(message);
            }
            
            return true;
          },
          showSuccess(message) {
            console.log('Fallback success display:', message);
            return true;
          },
          loadUiModule(uiModule) {
            this.uiModule = uiModule;
            console.log('UI module loaded in errorHandler');
            return true;
          },
          setupGlobalErrorHandler() {
            // Set up window error handler
            window.onerror = (message, source, lineno, colno, error) => {
              this.handleError(error || message);
              return true;
            };
            
            // Set up unhandled promise rejection handler
            window.addEventListener('unhandledrejection', (event) => {
              this.handleError(event.reason || 'Unhandled promise rejection');
            });
            
            console.log('Global error handlers set up');
            return true;
          },
          registerWithEventRegistry(eventRegistry) {
            if (eventRegistry && typeof eventRegistry.on === 'function') {
              // Register to handle error events
              eventRegistry.on('error', this.handleError.bind(this));
              return true;
            }
            return false;
          },
          saveErrorHistory() {
            try {
              localStorage.setItem('errorHistory', JSON.stringify(this.errorHistory.slice(-50))); // Keep last 50 errors
              return true;
            } catch (error) {
              console.error('Failed to save error history:', error);
              return false;
            }
          },
          loadErrorHistory() {
            try {
              const storedHistory = localStorage.getItem('errorHistory');
              if (storedHistory) {
                const parsedHistory = JSON.parse(storedHistory);
                this.errorHistory = Array.isArray(parsedHistory) ? parsedHistory : [];
                console.log(`Loaded ${this.errorHistory.length} error history items`);
              }
              return this.errorHistory;
            } catch (error) {
              console.error('Failed to load error history:', error);
              return [];
            }
          }
        };
        
      case 'app':
        return {
          ...baseFallback,
          modules: new Map(),
          
          initialize() {
            console.warn('Using fallback implementation for core module: app');
            this.initialized = true;
            this.setupBasicTabNavigation();
            return Promise.resolve(true);
          },
          
          registerModule(name, module) {
            this.modules.set(name, module);
            return true;
          },
          
          getModule(name) {
            return this.modules.get(name) || null;
          },
          
          setupBasicTabNavigation() {
            // Add click event listener to tab navigation if not already set up
            if (!window._tabNavigationSetup) {
              document.addEventListener('click', function(event) {
                if (event.target.hasAttribute('data-bs-toggle') && 
                    event.target.getAttribute('data-bs-toggle') === 'tab') {
                  event.preventDefault();
                  
                  // Find closest tab element
                  const tabEl = event.target.closest('[data-bs-toggle="tab"]');
                  if (!tabEl) return;
                  
                  // Get target tab pane
                  const target = tabEl.getAttribute('data-bs-target') || tabEl.getAttribute('href');
                  if (!target) return;
                  
                  // Remove active class from all tabs and tab panes
                  document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
                  document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active', 'show');
                  });
                  
                  // Add active class to selected tab and tab pane
                  tabEl.classList.add('active');
                  const targetEl = document.querySelector(target);
                  if (targetEl) {
                    targetEl.classList.add('active', 'show');
                  }
                }
              });
              
              window._tabNavigationSetup = true;
            }
            
            return true;
          },
          
          start() { 
            console.warn('Fallback app.start called');
            this.setupBasicTabNavigation();
            return true; 
          },
          
          showError(message) {
            console.error('App Error:', message);
            
            // Try to find error container
            const errorContainer = document.getElementById('app-error-container');
            if (errorContainer) {
              errorContainer.innerHTML = `
                <div class="alert alert-danger">
                  <h5>Application Error</h5>
                  <p>${message}</p>
                  <button class="btn btn-sm btn-outline-danger" id="show-diagnostics">Show Diagnostics</button>
                </div>
              `;
              errorContainer.style.display = 'block';
              
              // Add button handler
              document.getElementById('show-diagnostics')?.addEventListener('click', () => {
                if (typeof window.launchDiagnostics === 'function') {
                  window.launchDiagnostics();
                } else {
                  alert('Diagnostics module not available');
                }
              });
            } else {
              alert(message);
            }
            
            return true;
          }
        };
        
      case 'themeManager':
        return {
          ...baseFallback,
          currentTheme: 'light',
          
          initialize() {
            console.warn('Using fallback implementation for theme manager');
            this.initialized = true;
            
            // Set initial theme
            const storedTheme = localStorage.getItem('theme') || 'light';
            this.setTheme(storedTheme);
            
            // Add theme toggle listener
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle && !darkModeToggle._hasEventListener) {
              darkModeToggle.addEventListener('click', () => {
                this.toggleTheme();
              });
              darkModeToggle._hasEventListener = true;
            }
            
            return Promise.resolve(true);
          },
          
          setTheme(theme) {
            if (theme !== 'light' && theme !== 'dark') {
              theme = 'light';
            }
            
            this.currentTheme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            // Update toggle button if exists
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle) {
              darkModeToggle.innerHTML = theme === 'dark' ? 
                '<i class="fas fa-sun fa-lg"></i>' : 
                '<i class="fas fa-moon fa-lg"></i>';
            }
            
            console.log(`Applied theme: ${theme}`);
            return true;
          },
          
          toggleTheme() {
            const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            return this.setTheme(newTheme);
          },
          
          getCurrentTheme() {
            return this.currentTheme;
          },
          
          // Add theme-related utility methods
          isDarkMode() {
            return this.currentTheme === 'dark';
          },
          
          applyThemeToElement(element, themeClasses) {
            if (!element) return false;
            
            const isDark = this.currentTheme === 'dark';
            const classesToAdd = isDark ? themeClasses.dark : themeClasses.light;
            const classesToRemove = isDark ? themeClasses.light : themeClasses.dark;
            
            if (classesToRemove) {
              element.classList.remove(...classesToRemove.split(' '));
            }
            
            if (classesToAdd) {
              element.classList.add(...classesToAdd.split(' '));
            }
            
            return true;
          }
        };
        
      case 'eventManager':
        return {
          ...baseFallback,
          eventRegistry: null,
          delegatedEvents: new Map(),
          
          initialize() {
            console.warn('Using fallback implementation for event manager');
            this.initialized = true;
            return Promise.resolve(true);
          },
          
          setEventRegistry(registry) {
            this.eventRegistry = registry;
            return true;
          },
          
          on(eventName, handler) {
            if (this.eventRegistry && typeof this.eventRegistry.on === 'function') {
              return this.eventRegistry.on(eventName, handler);
            }
            
            console.warn(`Fallback eventManager.on called for ${eventName}`);
            return false;
          },
          
          off(eventName, handler) {
            if (this.eventRegistry && typeof this.eventRegistry.off === 'function') {
              return this.eventRegistry.off(eventName, handler);
            }
            
            console.warn(`Fallback eventManager.off called for ${eventName}`);
            return false;
          },
          
          emit(eventName, ...args) {
            if (this.eventRegistry && typeof this.eventRegistry.emit === 'function') {
              return this.eventRegistry.emit(eventName, ...args);
            }
            
            console.warn(`Fallback eventManager.emit called for ${eventName}`);
            return false;
          },
          
          // Helper for delegated DOM events
          delegate(selector, eventType, handler) {
            const key = `${selector}|${eventType}`;
            
            // Create delegated handler
            const delegatedHandler = (event) => {
              const targetElement = event.target.closest(selector);
              if (targetElement) {
                handler.call(targetElement, event, targetElement);
              }
            };
            
            // Store for cleanup
            this.delegatedEvents.set(key, {
              handler: delegatedHandler,
              originalHandler: handler
            });
            
            // Attach to document
            document.addEventListener(eventType, delegatedHandler);
            
            return () => {
              document.removeEventListener(eventType, delegatedHandler);
              this.delegatedEvents.delete(key);
            };
          }
        };
        
      default:
        return baseFallback;
    }
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
        return {
          ...baseFallback,
          processFiles() { 
            this.showError('File processing module failed to load');
            return Promise.resolve(false); 
          },
          handleUpload() { return false; },
          cancelProcessing() { return false; },
          setupListeners() { 
            // Add minimal form submission handling
            const form = document.getElementById('process-form');
            if (form) {
              form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.showError('File processor module is not available. Please refresh the page and try again.');
              });
            }
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
          }
        };
        
      case 'webScraper':
        return {
          ...baseFallback,
          scrape() { 
            this.showError('Web scraper module failed to load');
            return Promise.resolve(false); 
          },
          handleScrapeForm() { return false; },
          cancelScraping() { return false; },
          handleStartScraping() { 
            this.showError('Web scraper module failed to load');
            return Promise.resolve(false); 
          },
          handleCancelScraping() { return Promise.resolve(false); },
          handleAddUrl() { return false; },
          handleTaskCompleted() { return false; },
          showProgress() { 
            // Show the scraper progress container and hide form/results containers
            const formContainer = document.getElementById('scraper-form-container');
            const progressContainer = document.getElementById('scraper-progress-container');
            const resultsContainer = document.getElementById('scraper-results-container');
            
            if (formContainer) formContainer.style.display = 'none';
            if (progressContainer) progressContainer.style.display = 'block';
            if (resultsContainer) resultsContainer.style.display = 'none';
            
            return true;
          },
          showForm() { 
            // Show the scraper form container and hide progress/results containers
            const formContainer = document.getElementById('scraper-form-container');
            const progressContainer = document.getElementById('scraper-progress-container');
            const resultsContainer = document.getElementById('scraper-results-container');
            
            if (formContainer) formContainer.style.display = 'block';
            if (progressContainer) progressContainer.style.display = 'none';
            if (resultsContainer) resultsContainer.style.display = 'none';
            
            // Add warning message to the form container
            if (formContainer) {
              const warningAlert = document.createElement('div');
              warningAlert.className = 'alert alert-warning mb-3';
              warningAlert.innerHTML = `
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Web Scraper Unavailable</strong>
                <p class="mb-0 mt-1">The web scraper module could not be loaded. Some functionality may be limited. Please refresh the page to try again.</p>
              `;
              
              // Only add if it doesn't already exist
              if (!formContainer.querySelector('.alert-warning')) {
                formContainer.prepend(warningAlert);
              }
            }
            
            return true;
          },
          updatePdfDownloadsList() { return false; },
          handleOpenOutput() { return Promise.resolve(false); },
          updateStartButtonState() { return false; },
          handleProgressUpdate() { return false; },
          handleTaskError() { return false; }
        };
        
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
        return {
          ...baseFallback,
          downloadPlaylist() { 
            this.showError('Playlist downloader module failed to load');
            return Promise.resolve(false); 
          },
          handlePlaylistForm() { 
            // Add minimal form submission handling
            const form = document.getElementById('playlist-form');
            if (form) {
              form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.showError('Playlist downloader module is not available. Please refresh the page and try again.');
              });
            }
            return false; 
          },
          cancelDownload() { return false; },
          showProgress() {
            // Show the playlist progress container and hide form/results containers
            const formContainer = document.getElementById('playlist-form-container');
            const progressContainer = document.getElementById('playlist-progress-container');
            const resultsContainer = document.getElementById('playlist-results-container');
            
            if (formContainer) formContainer.style.display = 'none';
            if (progressContainer) progressContainer.style.display = 'block';
            if (resultsContainer) resultsContainer.style.display = 'none';
            
            return true;
          },
          showForm() {
            // Show the playlist form container and hide progress/results containers
            const formContainer = document.getElementById('playlist-form-container');
            const progressContainer = document.getElementById('playlist-progress-container');
            const resultsContainer = document.getElementById('playlist-results-container');
            
            if (formContainer) formContainer.style.display = 'block';
            if (progressContainer) progressContainer.style.display = 'none';
            if (resultsContainer) resultsContainer.style.display = 'none';
            
            // Add warning message to the form container
            if (formContainer) {
              const warningAlert = document.createElement('div');
              warningAlert.className = 'alert alert-warning mb-3';
              warningAlert.innerHTML = `
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Playlist Downloader Unavailable</strong>
                <p class="mb-0 mt-1">The playlist downloader module could not be loaded. Some functionality may be limited. Please refresh the page to try again.</p>
              `;
              
              // Only add if it doesn't already exist
              if (!formContainer.querySelector('.alert-warning')) {
                formContainer.prepend(warningAlert);
              }
            }
            
            return true;
          }
        };
        
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
          return {
            ...baseFallback,
            isConnected: false,
            taskProgressCallbacks: {},
            
            connect() { 
              console.warn('Fallback socketHandler.connect called');
              return Promise.resolve(false); 
            },
            disconnect() { 
              this.isConnected = false;
              return true; 
            },
            emit() { return false; },
            on() { return () => {}; }, // Return unsubscribe function
            startStatusPolling() { 
              console.warn('Fallback socketHandler.startStatusPolling called');
              return false; 
            },
            stopStatusPolling() { return false; },
            registerProgressCallbacks(taskId, callbacks) {
              this.taskProgressCallbacks[taskId] = callbacks;
              return true;
            },
            isSocketConnected() { return this.isConnected; },
            
            // Enhanced methods for better fallback functionality
            initialize() {
              console.warn('Using fallback implementation for socket handler');
              this.initialized = true;
              
              // Create a fake socket message every 2 seconds to simulate progress
              // but only if we're actively polling for status
              this.fakeProgressInterval = null;
              
              return Promise.resolve(true);
            },
            
            // Start fake progress updates for UI testing
            startFakeProgressUpdates(taskId) {
              const callbacks = this.taskProgressCallbacks[taskId];
              if (!callbacks) return false;
              
              let progress = 0;
              
              this.fakeProgressInterval = setInterval(() => {
                progress += Math.floor(Math.random() * 10) + 1;
                
                if (progress >= 100) {
                  progress = 100;
                  
                  // Call progress update callback
                  if (callbacks.onProgress) {
                    callbacks.onProgress({
                      progress: 100,
                      status: 'completed',
                      message: 'Task completed successfully (simulated)'
                    });
                  }
                  
                  // Call completed callback
                  if (callbacks.onCompleted) {
                    callbacks.onCompleted({
                      id: taskId,
                      status: 'completed',
                      result: { success: true }
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
                      message: `Processing task... ${progress}% (simulated)`
                    });
                  }
                }
              }, 2000);
              
              return true;
            }
          };
          
        case 'progressHandler':
          return {
            ...baseFallback,
            activeTasks: new Map(),
            
            setupTaskProgress(taskId, options = {}) { 
              console.warn('Fallback progressHandler.setupTaskProgress called');
              const taskInfo = {
                id: taskId,
                progress: 0,
                status: 'pending',
                options
              };
              
              this.activeTasks.set(taskId, taskInfo);
              
              return {
                updateProgress: (progress, message) => {
                  if (!this.activeTasks.has(taskId)) return;
                  const task = this.activeTasks.get(taskId);
                  task.progress = progress;
                  task.message = message;
                  task.status = 'running';
                  
                  // Update UI if element exists
                  const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
                  const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
                  
                  if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                    progressBar.setAttribute('aria-valuenow', progress);
                    progressBar.textContent = `${progress}%`;
                  }
                  
                  if (progressStatus && message) {
                    progressStatus.textContent = message;
                  }
                  
                  console.log(`Task ${taskId} progress: ${progress}% - ${message || ''}`);
                },
                complete: (result) => {
                  if (!this.activeTasks.has(taskId)) return;
                  const task = this.activeTasks.get(taskId);
                  task.progress = 100;
                  task.status = 'completed';
                  task.result = result;
                  
                  // Update UI if element exists
                  const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
                  const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
                  
                  if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.setAttribute('aria-valuenow', 100);
                    progressBar.textContent = '100%';
                    progressBar.classList.add('bg-success');
                  }
                  
                  if (progressStatus) {
                    progressStatus.textContent = 'Task completed successfully';
                  }
                  
                  console.log(`Task ${taskId} completed`);
                  this.activeTasks.delete(taskId);
                },
                error: (error) => {
                  if (!this.activeTasks.has(taskId)) return;
                  const task = this.activeTasks.get(taskId);
                  task.status = 'error';
                  task.error = error;
                  
                  // Update UI if element exists
                  const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
                  
                  if (progressStatus) {
                    progressStatus.textContent = `Error: ${error.message || error}`;
                    progressStatus.classList.add('text-danger');
                  }
                  
                  console.error(`Task ${taskId} error:`, error);
                  this.activeTasks.delete(taskId);
                }
              }; 
            },
            trackProgress() { return false; },
            updateProgressUI() { return false; },
            cancelTracking() { return false; }
          };
          
        case 'ui':
          return {
            ...baseFallback,
            toasts: [],
            modals: {},
            spinners: {},
            
            showToast(title, message, type = 'info') {
              console.warn(`[Fallback Toast] ${type}: ${title} - ${message}`);
              
              // Create a simple toast object
              const toast = {
                id: 'toast-' + Date.now(),
                title,
                message,
                type,
                timestamp: new Date().toISOString()
              };
              
              this.toasts.push(toast);
              
              // Try to find toast container
              let toastContainer = document.getElementById('toast-container');
              if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toast-container';
                toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                document.body.appendChild(toastContainer);
              }
              
              // Create toast element
              const toastEl = document.createElement('div');
              toastEl.className = `toast fade show`;
              toastEl.role = 'alert';
              toastEl.setAttribute('aria-live', 'assertive');
              toastEl.setAttribute('aria-atomic', 'true');
              
              // Set header color class based on type
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
              
              toastEl.innerHTML = `
                <div class="toast-header ${headerClass} text-white">
                  <strong class="me-auto">${title}</strong>
                  <small>now</small>
                  <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">${message}</div>
              `;
              
              toastContainer.appendChild(toastEl);
              
              // Add close button handler
              const closeBtn = toastEl.querySelector('.btn-close');
              if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                  toastEl.classList.remove('show');
                  setTimeout(() => {
                    toastEl.remove();
                  }, 150);
                });
              }
              
              // Remove toast after 5 seconds
              setTimeout(() => {
                toastEl.classList.remove('show');
                setTimeout(() => {
                  toastEl.remove();
                }, 150);
              }, 5000);
              
              return toast;
            },
            
            updateProgressBar(id, progress, message) {
              const progressBar = document.getElementById(id);
              if (progressBar) {
                progressBar.style.width = `${progress}%`;
                progressBar.setAttribute('aria-valuenow', progress);
                progressBar.textContent = `${progress}%`;
                
                // Change color at 100%
                if (progress >= 100) {
                  progressBar.classList.remove('bg-primary');
                  progressBar.classList.add('bg-success');
                }
                
                const messageEl = document.getElementById(`${id}-message`);
                if (messageEl && message) {
                  messageEl.textContent = message;
                }
                
                return true;
              }
              return false;
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
            
            showLoadingSpinner(options = {}) {
              const {
                message = 'Loading...',
                overlay = true,
                id = 'spinner-' + Date.now()
              } = options;
              
              // Log spinner creation
              console.warn(`[Fallback Spinner] ${id}: ${message}`);
              
              // Create spinner record
              const spinner = {
                id,
                message,
                visible: true
              };
              
              this.spinners[id] = spinner;
              
              // Try to find or create spinner container
              let spinnerContainer = document.getElementById('spinner-container');
              if (!spinnerContainer) {
                spinnerContainer = document.createElement('div');
                spinnerContainer.id = 'spinner-container';
                document.body.appendChild(spinnerContainer);
              }
              
              // Create spinner element
              const spinnerEl = document.createElement('div');
              spinnerEl.className = `loading-spinner ${overlay ? 'with-overlay' : ''}`;
              spinnerEl.id = id;
              
              spinnerEl.innerHTML = `
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <div class="spinner-message" id="${id}-message">${message}</div>
              `;
              
              spinnerContainer.appendChild(spinnerEl);
              
              // Return control object
              return {
                hide: () => {
                  this.hideLoadingSpinner(id);
                },
                updateMessage: (newMessage) => {
                  const messageEl = document.getElementById(`${id}-message`);
                  if (messageEl) {
                    messageEl.textContent = newMessage;
                  }
                  if (this.spinners[id]) {
                    this.spinners[id].message = newMessage;
                  }
                }
              };
            },
            
            hideLoadingSpinner(id) {
              // Log spinner hiding
              console.warn(`[Fallback Spinner] Hiding: ${id}`);
              
              // Update spinner record
              if (this.spinners[id]) {
                this.spinners[id].visible = false;
              }
              
              // Remove spinner element
              const spinnerEl = document.getElementById(id);
              if (spinnerEl) {
                spinnerEl.remove();
              }
              
              return true;
            },
            
            getElement(id) {
              return document.getElementById(id);
            },
            
            // Initialize UI module
            initialize() {
              console.warn('Using fallback implementation for UI utility module');
              this.initialized = true;
              
              // Create toast container if it doesn't exist
              let toastContainer = document.getElementById('toast-container');
              if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'toast-container';
                toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                document.body.appendChild(toastContainer);
              }
              
              return Promise.resolve(true);
            }
          };
          
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
                
                // Add method to get debug log
                window.getDebugLog = () => debugLog.slice(-1000); // Return last 1000 entries
                
                return true;
              },
              
              restoreConsole() {
                if (!this.isDebugMode) return false;
                
                // Restore original console methods
                Object.keys(this.originalConsole).forEach(method => {
                  console[method] = this.originalConsole[method];
                });
                
                window._consoleIntercepted = false;
                
                return true;
              },
              
              monitorSocketEvents(socketHandler) {
                if (!socketHandler || !this.isDebugMode) return false;
                
                // Only monitor if not already monitoring
                if (socketHandler._eventsMonitored) return true;
                
                const originalEmit = socketHandler.emit;
                const originalOn = socketHandler.on;
                
                // Override emit
                socketHandler.emit = (event, ...args) => {
                  this.socketEvents.push({
                    type: 'emit',
                    event,
                    args,
                    timestamp: new Date().toISOString()
                  });
                  return originalEmit.call(socketHandler, event, ...args);
                };
                
                // Override on
                socketHandler.on = (event, handler) => {
                  const wrappedHandler = (...args) => {
                    this.socketEvents.push({
                      type: 'receive',
                      event,
                      args,
                      timestamp: new Date().toISOString()
                    });
                    return handler(...args);
                  };
                  
                  return originalOn.call(socketHandler, event, wrappedHandler);
                };
                
                // Mark as monitored
                socketHandler._eventsMonitored = true;
                
                return true;
              },
              
              toggleDebugPanel() {
                if (!this.isDebugMode) return false;
                
                let debugPanel = document.getElementById('debug-panel');
                if (debugPanel) {
                  debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
                } else {
                  // Create debug panel
                  debugPanel = document.createElement('div');
                  debugPanel.id = 'debug-panel';
                  debugPanel.className = 'debug-panel';
                  debugPanel.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 350px;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.85);
                    color: #ddd;
                    padding: 15px;
                    font-family: monospace;
                    font-size: 12px;
                    z-index: 9999;
                    overflow-y: auto;
                  `;
                  
                  debugPanel.innerHTML = `
                    <h3>Debug Panel</h3>
                    <button id="debug-close">Close</button>
                    <div>
                      <h4>Module Status</h4>
                      <div id="debug-modules"></div>
                    </div>
                    <div>
                      <h4>Socket Events</h4>
                      <div id="debug-socket"></div>
                    </div>
                    <div>
                      <h4>Performance</h4>
                      <div id="debug-performance"></div>
                    </div>
                  `;
                  
                  document.body.appendChild(debugPanel);
                  
                  // Add close button handler
                  document.getElementById('debug-close').addEventListener('click', () => {
                    debugPanel.style.display = 'none';
                  });
                  
                  // Update module status
                  const moduleStatusEl = document.getElementById('debug-modules');
                  if (moduleStatusEl && window.moduleLoader) {
                    const loadedModules = Array.from(window.moduleLoader.cache.keys());
                    const failedModules = Array.from(window.moduleLoader.failedModules);
                    
                    moduleStatusEl.innerHTML = `
                      <div>Loaded: ${loadedModules.length}</div>
                      <div>Failed: ${failedModules.length}</div>
                      <details>
                        <summary>Loaded Modules</summary>
                        <ul>
                          ${loadedModules.map(m => `<li>${m}</li>`).join('')}
                        </ul>
                      </details>
                      <details>
                        <summary>Failed Modules</summary>
                        <ul>
                          ${failedModules.map(m => `<li>${m}</li>`).join('')}
                        </ul>
                      </details>
                    `;
                  }
                  
                  // Update socket events
                  const socketEventsEl = document.getElementById('debug-socket');
                  if (socketEventsEl) {
                    socketEventsEl.innerHTML = `
                      <div>Total events: ${this.socketEvents.length}</div>
                      <details>
                        <summary>Recent Events</summary>
                        <ul>
                          ${this.socketEvents.slice(-10).map(e => `
                            <li>${e.timestamp} - ${e.type} - ${e.event}</li>
                          `).join('')}
                        </ul>
                      </details>
                    `;
                  }
                }
                
                return true;
              }
            };
            
          case 'moduleDiagnostics':
            return {
              ...baseFallback,
              
              initializeModuleDiagnostics: function() {
                console.warn('Using fallback moduleDiagnostics.initializeModuleDiagnostics');
                
                // Define the global diagnostics function if not already defined
                if (!window.launchDiagnostics) {
                  window.launchDiagnostics = function() {
                    console.log("Module Diagnostics (Fallback):");
                    
                    // Check if moduleLoader is available
                    if (!window.moduleLoader) {
                      alert("Module diagnostics not available - moduleLoader not found");
                      return;
                    }
                    
                    const moduleLoader = window.moduleLoader;
                    const loadedModules = Array.from(moduleLoader.cache.keys());
                    const failedModules = Array.from(moduleLoader.failedModules);
                    
                    console.log("- Loaded modules:", loadedModules);
                    console.log("- Failed modules:", failedModules);
                    
                    // Create UI for diagnostics
                    let diagContainer = document.getElementById('module-diagnostics-container');
                    if (diagContainer) {
                      // Update existing container
                      diagContainer.innerHTML = '';
                    } else {
                      // Create new container
                      diagContainer = document.createElement('div');
                      diagContainer.id = 'module-diagnostics-container';
                      diagContainer.style.cssText = `
                        position: fixed;
                        z-index: 10000;
                        top: 20px;
                        right: 20px;
                        background-color: #f8f9fa;
                        border: 1px solid #dee2e6;
                        border-radius: 4px;
                        padding: 15px;
                        max-width: 600px;
                        max-height: 80vh;
                        overflow-y: auto;
                        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
                      `;
                      document.body.appendChild(diagContainer);
                    }
                    
                    // Apply dark mode if active
                    const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
                    if (isDarkMode) {
                      diagContainer.style.backgroundColor = '#2d3238';
                      diagContainer.style.color = '#f8f9fa';
                      diagContainer.style.borderColor = '#495057';
                    }
                    
                    // Generate module status summary
                    const coreModules = Object.keys(moduleLoader.MODULE_LOCATIONS)
                      .filter(name => moduleLoader.MODULE_LOCATIONS[name] === 'core');
                    
                    const featureModules = Object.keys(moduleLoader.MODULE_LOCATIONS)
                      .filter(name => moduleLoader.MODULE_LOCATIONS[name] === 'features');
                    
                    const utilityModules = Object.keys(moduleLoader.MODULE_LOCATIONS)
                      .filter(name => moduleLoader.MODULE_LOCATIONS[name] === 'utils');
                    
                    // Calculate stats
                    const coreLoaded = coreModules.filter(name => {
                      const path = `/static/js/modules/core/${name}`;
                      return loadedModules.some(m => m.includes(path));
                    }).length;
                    
                    const featureLoaded = featureModules.filter(name => {
                      const path = `/static/js/modules/features/${name}`;
                      return loadedModules.some(m => m.includes(path));
                    }).length;
                    
                    const utilityLoaded = utilityModules.filter(name => {
                      const path = `/static/js/modules/utils/${name}`;
                      return loadedModules.some(m => m.includes(path));
                    }).length;
                    
                    // Build diagnostics UI
                    diagContainer.innerHTML = `
                      <div>
                        <h4>Module Diagnostics</h4>
                        <button id="close-diagnostics" class="btn btn-sm btn-secondary">Close</button>
                        <button id="refresh-diagnostics" class="btn btn-sm btn-primary">Refresh</button>
                        <hr>
                        
                        <div class="module-stats">
                          <h5>Module Status</h5>
                          <div class="progress mb-2">
                            <div class="progress-bar bg-success" style="width: ${Math.round(coreLoaded / coreModules.length * 100)}%">
                              Core: ${coreLoaded}/${coreModules.length}
                            </div>
                          </div>
                          <div class="progress mb-2">
                            <div class="progress-bar bg-info" style="width: ${Math.round(featureLoaded / featureModules.length * 100)}%">
                              Features: ${featureLoaded}/${featureModules.length}
                            </div>
                          </div>
                          <div class="progress mb-2">
                            <div class="progress-bar bg-warning" style="width: ${Math.round(utilityLoaded / utilityModules.length * 100)}%">
                              Utilities: ${utilityLoaded}/${utilityModules.length}
                            </div>
                          </div>
                        </div>
                        
                        <div class="module-details mt-3">
                          <h5>Loaded Modules (${loadedModules.length})</h5>
                          <div class="accordion">
                            <div class="accordion-item">
                              <h2 class="accordion-header">
                                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseLoaded">
                                  Show Loaded Modules
                                </button>
                              </h2>
                              <div id="collapseLoaded" class="accordion-collapse collapse">
                                <div class="accordion-body">
                                  <ul class="small">
                                    ${loadedModules.map(m => `<li>${m}</li>`).join('')}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <h5 class="mt-3">Failed Modules (${failedModules.length})</h5>
                          <div class="accordion">
                            <div class="accordion-item">
                              <h2 class="accordion-header">
                                <button class="accordion-button ${failedModules.length > 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFailed">
                                  Show Failed Modules
                                </button>
                              </h2>
                              <div id="collapseFailed" class="accordion-collapse collapse ${failedModules.length > 0 ? 'show' : ''}">
                                <div class="accordion-body">
                                  <ul class="small">
                                    ${failedModules.length > 0 
                                      ? failedModules.map(m => `<li>${m}</li>`).join('')
                                      : '<li>No failed modules</li>'
                                    }
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div class="recovery-section mt-3">
                          <h5>Recovery Options</h5>
                          <button id="retry-failed-modules" class="btn btn-sm btn-warning">Retry Failed Modules</button>
                          <button id="clear-module-cache" class="btn btn-sm btn-danger">Clear Module Cache</button>
                          <button id="reload-page" class="btn btn-sm btn-primary">Reload Page</button>
                        </div>
                        
                        <div class="debug-section mt-3">
                          <h5>Debug Information</h5>
                          <div>
                            <small>Debug Mode: ${moduleLoader.debugMode ? 'Enabled' : 'Disabled'}</small><br>
                            <small>Log Level: ${Object.keys(moduleLoader.LOG_LEVELS).find(k => moduleLoader.LOG_LEVELS[k] === moduleLoader.currentLogLevel)}</small><br>
                            <small>Initialized: ${moduleLoader.initialized ? 'Yes' : 'No'}</small>
                          </div>
                        </div>
                      </div>
                    `;
                    
                    // Add event handlers
                    document.getElementById('close-diagnostics').addEventListener('click', function() {
                      diagContainer.remove();
                    });
                    
                    document.getElementById('refresh-diagnostics').addEventListener('click', function() {
                      window.launchDiagnostics();
                    });
                    
                    document.getElementById('retry-failed-modules').addEventListener('click', function() {
                      const failedModules = Array.from(moduleLoader.failedModules);
                      if (failedModules.length === 0) {
                        alert("No failed modules to retry");
                        return;
                      }
                      
                      // Try to retry loading the failed modules
                      Promise.all(failedModules.map(path => {
                        return moduleLoader.retryFailedModule ? 
                          moduleLoader.retryFailedModule(path, 2).then(() => true).catch(() => false) :
                          Promise.resolve(false);
                      })).then(results => {
                        const successCount = results.filter(r => r).length;
                        alert(`Retried ${failedModules.length} modules: ${successCount} succeeded, ${failedModules.length - successCount} still failed`);
                        window.launchDiagnostics();
                      });
                    });
                    
                    document.getElementById('clear-module-cache').addEventListener('click', function() {
                      if (confirm("Are you sure you want to clear the module cache? This may cause temporary instability.")) {
                        if (moduleLoader.clearCache) {
                          moduleLoader.clearCache();
                          alert("Module cache cleared. Refresh the diagnostics or reload the page.");
                        } else {
                          alert("Cache clearing function not available.");
                        }
                      }
                    });
                    
                    document.getElementById('reload-page').addEventListener('click', function() {
                      if (confirm("Are you sure you want to reload the page?")) {
                        window.location.reload();
                      }
                    });
                    
                    // Add simple accordion functionality
                    const accordionButtons = diagContainer.querySelectorAll('.accordion-button');
                    accordionButtons.forEach(button => {
                      button.addEventListener('click', function() {
                        const target = document.querySelector(this.getAttribute('data-bs-target'));
                        if (target) {
                          const isCollapsed = this.classList.contains('collapsed');
                          if (isCollapsed) {
                            this.classList.remove('collapsed');
                            target.classList.add('show');
                          } else {
                            this.classList.add('collapsed');
                            target.classList.remove('show');
                          }
                        }
                      });
                    });
                  };
                }
                
                return true;
              },
              
              analyzeModuleDependencies() {
                if (!window.moduleLoader) return {};
                
                const moduleLoader = window.moduleLoader;
                
                // Create a map of dependencies
                const dependencies = {};
                
                // Get all modules from MODULE_LOCATIONS
                Object.keys(moduleLoader.MODULE_LOCATIONS).forEach(filename => {
                  const location = moduleLoader.MODULE_LOCATIONS[filename];
                  const moduleName = filename.replace('.js', '');
                  
                  dependencies[moduleName] = {
                    location,
                    path: `/static/js/modules/${location}/${filename}`,
                    loaded: false,
                    hasFallback: false,
                    dependencies: [],
                    dependents: []
                  };
                });
                
                // Update loaded status
                moduleLoader.cache.forEach((module, path) => {
                  const moduleName = path.split('/').pop().replace('.js', '');
                  if (dependencies[moduleName]) {
                    dependencies[moduleName].loaded = true;
                    dependencies[moduleName].hasFallback = !!module.__isFallback;
                  }
                });
                
                // Add dependency relationships from dependencyGraph
                Object.entries(moduleLoader.dependencyGraph).forEach(([path, deps]) => {
                  const moduleName = path.split('/').pop().replace('.js', '');
                  
                  if (dependencies[moduleName]) {
                    // Add dependencies
                    deps.forEach(depPath => {
                      const depName = depPath.split('/').pop().replace('.js', '');
                      if (depName && dependencies[depName]) {
                        dependencies[moduleName].dependencies.push(depName);
                        dependencies[depName].dependents.push(moduleName);
                      }
                    });
                  }
                });
                
                return dependencies;
              },
              
              generateReport() {
                if (!window.moduleLoader) return { status: 'moduleLoader not available' };
                
                const moduleLoader = window.moduleLoader;
                
                // Use health report if available
                if (moduleLoader.generateHealthReport) {
                  return moduleLoader.generateHealthReport();
                }

                // Otherwise create a basic report
                const loadedModules = Array.from(moduleLoader.cache.keys());
                const failedModules = Array.from(moduleLoader.failedModules || []);

                // Group modules by type
                const modules = {
                  core: [],
                  features: [],
                  utils: []
                };

                loadedModules.forEach(path => {
                  const moduleName = path.split('/').pop().replace('.js', '');
                  const type = moduleLoader.MODULE_TYPES ? 
                              moduleLoader.MODULE_TYPES[moduleName] : 
                              (path.includes('/core/') ? 'core' : 
                                path.includes('/features/') ? 'features' : 
                                path.includes('/utils/') ? 'utils' : 'unknown');
                              
                  if (type && modules[type]) {
                    modules[type].push(moduleName);
                  }
                });

                // Basic classification of status
                let status = "unknown";
                if (failedModules.length === 0) {
                  status = "healthy";
                } else if (failedModules.some(path => path.includes('/core/'))) {
                  status = "critical";
                } else {
                  status = "warning";
                }

                return {
                  status,
                  timestamp: new Date().toISOString(),
                  metrics: {
                    totalModulesLoaded: loadedModules.length,
                    failedModules: failedModules.length,
                    coreLoaded: modules.core.length,
                    featuresLoaded: modules.features.length,
                    utilsLoaded: modules.utils.length
                  },
                  modules,
                  failedModules
                };
                }
                };

                default:
                return baseFallback;
                }
                },

  /**
  * Check if module is loaded
  * @param {string} modulePath - Path to the module
  * @returns {boolean} - Whether the module is loaded
  */
  isModuleLoaded(modulePath) {
  const normalizedPath = this.getNormalizedPath(this.resolvePath(modulePath));
  return this.cache.has(normalizedPath);
  },

  /**
  * Get a loaded module from cache
  * @param {string} modulePath - Path to the module
  * @returns {Object|null} - The module or null if not loaded
  */
  getModule(modulePath) {
  const normalizedPath = this.getNormalizedPath(this.resolvePath(modulePath));
  return this.cache.get(normalizedPath) || null;
  },

  /**
  * Detect circular dependencies in the module system
  * @returns {Array<Array<string>>} - Arrays of paths that form cycles
  */
  detectCircularDependencies() {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  const detectCycle = (node, path = []) => {
  // Skip if already visited in another path
  if (visited.has(node)) return false;

  // Cycle detected
  if (recursionStack.has(node)) {
  const cycle = [...path.slice(path.findIndex(p => p === node))];
  cycles.push(cycle);
  return true;
  }

  // Add to recursion stack
  recursionStack.add(node);
  path.push(node);

  // Visit all dependencies
  const dependencies = this.dependencyGraph[node] || [];
  for (const dep of dependencies) {
  detectCycle(dep, [...path]);
  }

  // Remove from recursion stack and mark as visited
  recursionStack.delete(node);
  visited.add(node);

  return false;
  };

  // Check each node
  Object.keys(this.dependencyGraph).forEach(node => {
  if (!visited.has(node)) {
  detectCycle(node);
  }
  });

  return cycles;
  },

/**
* Retry loading a previously failed module
* @param {string} modulePath - Path to the module
* @param {number} maxRetries - Maximum number of retry attempts
* @returns {Promise<Object>} - The imported module
*/
async retryFailedModule(modulePath, maxRetries = 3) {
const resolvedPath = this.resolvePath(modulePath);
const cacheKey = this.getNormalizedPath(resolvedPath);

// Remove from failed modules set
this.failedModules.delete(cacheKey);

// Try multiple times with exponential backoff
for (let attempt = 1; attempt <= maxRetries; attempt++) {
try {
console.log(`Retry attempt ${attempt}/${maxRetries} for module: ${modulePath}`);
const module = await import(resolvedPath);
const moduleExport = module.default || module;

// Success! Update cache
this.cache.set(cacheKey, moduleExport);
console.log(`Successfully loaded previously failed module ${modulePath} on attempt ${attempt}`);

return moduleExport;
} catch (error) {
const waitTime = Math.pow(2, attempt) * 100; // Exponential backoff
console.warn(`Retry ${attempt}/${maxRetries} for ${modulePath} failed: ${error.message}. Waiting ${waitTime}ms...`);

// Wait before next attempt
await new Promise(resolve => setTimeout(resolve, waitTime));
}
}

// Still failing after retries - mark as failed and create fallback
this.failedModules.add(cacheKey);
console.error(`Module ${modulePath} still failing after ${maxRetries} retries`);
return this.createFallbackModule(this.getModuleName(modulePath));
},

/**
* Preload modules in the background without initializing
* @param {Array<string>} modulePaths - Array of module paths to preload
*/
preloadModules(modulePaths) {
if (!Array.isArray(modulePaths) || modulePaths.length === 0) {
return;
}

// Don't block execution - use setTimeout
setTimeout(() => {
modulePaths.forEach(path => {
const resolvedPath = this.resolvePath(path);
// Use link preload
const link = document.createElement('link');
link.rel = 'modulepreload';
link.href = resolvedPath;
document.head.appendChild(link);
});
}, 0);
},

/**
* Unload unused modules to free memory
* @param {Array<string>} exceptModules - Modules to keep loaded
*/
unloadUnusedModules(exceptModules = []) {
const protectedModuleKeys = exceptModules.map(
path => this.getNormalizedPath(this.resolvePath(path))
);

// Add core modules to protected list
Object.keys(this.MODULE_LOCATIONS)
.filter(name => this.MODULE_LOCATIONS[name] === 'core')
.forEach(name => {
const path = `/static/js/modules/core/${name}`;
protectedModuleKeys.push(this.getNormalizedPath(path));
});

// Remove unused modules from cache
let unloadedCount = 0;
for (const key of this.cache.keys()) {
if (!protectedModuleKeys.includes(key)) {
this.cache.delete(key);
unloadedCount++;
}
}

console.log(`Unloaded ${unloadedCount} unused modules from cache`);
},

/**
* Check if browser supports ES6 modules
* @returns {boolean} - Whether ES6 modules are supported
*/
supportsESModules() {
try {
new Function('import("")');
return true;
} catch (err) {
return false;
}
},

/**
* Show error message to user
* @param {string} message - Error message
*/
showErrorMessage(message) {
// Try to use UI toast if available
if (typeof window.ui?.showToast === 'function') {
window.ui.showToast('Error', message, 'error');
return;
}

// Fallback to creating a simple error display
let errorContainer = document.getElementById('app-loading-error');
if (!errorContainer) {
errorContainer = document.createElement('div');
errorContainer.id = 'app-loading-error';
errorContainer.className = 'alert alert-danger m-3';
document.body.appendChild(errorContainer);
}

errorContainer.textContent = message;
errorContainer.style.display = 'block';
},

/**
* Initialize module diagnostics for debugging
*/
initializeModuleDiagnostics() {
if (this.diagnosticsInitialized) {
return true;
}

try {
// Check if the moduleDiagnostics module is available
const moduleDiagnostics = this.getModule('/static/js/modules/utils/moduleDiagnostics');

if (moduleDiagnostics && typeof moduleDiagnostics.initializeModuleDiagnostics === 'function') {
// Use the actual module
moduleDiagnostics.initializeModuleDiagnostics();
} else {
// Use fallback
this.createUtilityFallback('moduleDiagnostics').initializeModuleDiagnostics();
}

this.diagnosticsInitialized = true;
return true;
} catch (error) {
console.error('Failed to initialize module diagnostics:', error);

// Create fallback diagnostics just to be safe
if (!window.launchDiagnostics) {
window.launchDiagnostics = function() {
console.log("Emergency Fallback Diagnostics:");
console.log("- Module diagnostics initialization failed");
alert("Emergency fallback diagnostics. See console for details.");
};
}

this.diagnosticsInitialized = true;
return false;
}
},

/**
* Apply stored theme to ensure UI is consistent even before modules load
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
* Setup basic tab navigation functionality when modules aren't loaded
*/
setupBasicTabNavigation() {
// Skip if already set up
if (window._tabNavigationSetup) return;

// Add click event listener to tab navigation
document.addEventListener('click', function(event) {
if (event.target.hasAttribute('data-bs-toggle') && 
event.target.getAttribute('data-bs-toggle') === 'tab') {
event.preventDefault();

// Find closest tab element
const tabEl = event.target.closest('[data-bs-toggle="tab"]');
if (!tabEl) return;

// Get target tab pane
const target = tabEl.getAttribute('data-bs-target') || tabEl.getAttribute('href');
if (!target) return;

// Remove active class from all tabs and tab panes
document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
document.querySelectorAll('.tab-pane').forEach(pane => {
pane.classList.remove('active', 'show');
});

// Add active class to selected tab and tab pane
tabEl.classList.add('active');
const targetEl = document.querySelector(target);
if (targetEl) {
targetEl.classList.add('active', 'show');
}
}
});

// Mark as set up
window._tabNavigationSetup = true;
},

/**
* Load and initialize modules in the proper order
* @param {Array<string>} modulePaths - Array of module paths
* @param {boolean} allRequired - Whether all modules are required
* @returns {Promise<Object>} - Object with loaded modules
*/
async loadModules(modulePaths, allRequired = false) {
// Import all modules
const modules = await this.importModules(modulePaths, allRequired, {
retries: 2,
timeout: 8000
});

// Initialize non-core modules (core modules are initialized during importModules)
const nonCoreModuleNames = Object.keys(modules).filter(
name => !this.INITIALIZATION_ORDER.includes(name + '.js')
);

for (const moduleName of nonCoreModuleNames) {
const module = modules[moduleName];

if (module && typeof module.initialize === 'function' && !this.initializedModules.has(moduleName)) {
try {
// Add timeout to prevent hanging
const result = await Promise.race([
module.initialize(),
new Promise((_, reject) => setTimeout(() => 
  reject(new Error(`${moduleName} initialization timed out`)), 5000))
]);

if (result !== false) {
this.initializedModules.add(moduleName);

if (this.verboseLogging) {
  console.log(`Initialized module: ${moduleName}`);
}
} else {
console.warn(`Module ${moduleName} initialization returned false`);
}
} catch (error) {
console.error(`Error initializing module ${moduleName}:`, error);
}
}
}

return modules;
},

/**
* Initialize application if imports are successful
* @param {Array<string>} coreModulePaths - Core module paths that are required
* @returns {Promise<boolean>} - Success state
*/
async initializeApplication(coreModulePaths) {
try {
// Apply theme before anything else
this.applyStoredTheme();

// Set up basic UI functionality for better UX even if modules fail
this.setupBasicTabNavigation();

// Import core modules with retry
const coreModules = await this.importModules(coreModulePaths, true, {
retries: 2,
concurrencyLimit: 2, // Load with less concurrency for stability
timeout: 10000 // Longer timeout for core modules
});

// Set up diagnostics
this.initializeModuleDiagnostics();

// Check if all required modules loaded
const allModulesLoaded = Object.values(coreModules).every(module => module !== null);

if (!allModulesLoaded) {
console.warn('Not all core modules loaded successfully, attempting recovery mode');

// Try to continue with available modules
// Check if app module is available
if (coreModules.app && typeof coreModules.app.initialize === 'function') {
try {
await coreModules.app.initialize();
console.log('App initialized in recovery mode');
return true;
} catch (error) {
console.error('Failed to initialize app in recovery mode:', error);
throw new Error('Failed to initialize application in recovery mode');
}
} else {
throw new Error('App module not available for recovery mode');
}
}

// Initialize app
if (coreModules.app && typeof coreModules.app.initialize === 'function') {
await coreModules.app.initialize();
console.log('Application initialized successfully');
return true;
} else {
console.warn('App module has no initialize method');
this.showErrorMessage('Application initialization failed: app.initialize() is not available');
return false;
}
} catch (error) {
console.error('Failed to initialize application:', error);
this.showErrorMessage(`Failed to initialize application: ${error.message}`);

// Set up diagnostics even on failure
this.initializeModuleDiagnostics();

return false;
}
},

/**
* Generate a full report of the module system's health
* @returns {Object} - Health report
*/
generateHealthReport() {
const totalModules = Object.keys(this.MODULE_LOCATIONS).length;
const loadedModules = this.cache.size;
const failedModules = this.failedModules.size;

// Calculate percentages
const loadedPercentage = totalModules > 0 ? Math.round((loadedModules / totalModules) * 100) : 0;
const failedPercentage = totalModules > 0 ? Math.round((failedModules / totalModules) * 100) : 0;

// Core modules status
const coreModulesStatus = {};
this.INITIALIZATION_ORDER.forEach(moduleName => {
const module = this.getModule(`/static/js/modules/core/${moduleName}`);
coreModulesStatus[moduleName] = {
loaded: !!module,
isFallback: module?.__isFallback || false,
initialized: module?.initialized || false
};
});

// Critical failures
const criticalFailures = Array.from(this.failedModules)
.filter(path => {
const name = this.getModuleName(path) + '.js';
return this.INITIALIZATION_ORDER.includes(name);
});

// Circular dependencies
const circularDependencies = this.detectCircularDependencies();

return {
status: criticalFailures.length > 0 ? "critical" : 
  failedModules > 0 ? "warning" : "healthy",
timestamp: new Date().toISOString(),
metrics: {
totalModules,
loadedModules,
failedModules,
loadedPercentage,
failedPercentage,
criticalFailuresCount: criticalFailures.length,
circularDependenciesCount: circularDependencies.length,
initializedModules: this.initializedModules.size
},
coreModulesStatus,
criticalFailures,
circularDependencies,
configuration: {
debugMode: this.debugMode,
logLevel: this.currentLogLevel,
initialized: this.initialized
}
};
},

/**
* Clear module cache (useful for development)
*/
clearCache() {
this.cache.clear();
this.failedModules.clear();
this.loadingPromises.clear();
this.initializedModules.clear();
console.log('Module cache cleared');
},

/**
* Get list of failed modules
* @returns {Array<string>} - List of modules that failed to load
*/
getFailedModules() {
return Array.from(this.failedModules);
},

/**
* Bootstrap the module system with a minimal set of core modules
* @returns {Promise<Object>} - Loaded core modules
*/
async bootstrapCore() {
// Minimal core modules needed to get the system running
const minimalCore = [
'/static/js/modules/core/errorHandler.js',
'/static/js/modules/core/uiRegistry.js',
'/static/js/modules/core/eventRegistry.js',
'/static/js/modules/core/themeManager.js'
];

// Try to load these with highest priority
const modules = await this.importModules(minimalCore, true, {
retries: 3,
concurrencyLimit: 1, // Load one at a time for stability
timeout: 10000 // Longer timeout for bootstrap
});

// Apply basic UI setup regardless of success
this.applyStoredTheme();
this.setupBasicTabNavigation();

return modules;
},

/**
* Handle failed app initialization
* Activates recovery mode to ensure basic functionality
* @returns {Promise<boolean>} - Whether recovery was successful
*/
async activateRecoveryMode() {
console.warn('Activating recovery mode...');

// List available modules
const availableModules = Array.from(this.cache.keys()).map(key => this.getModuleName(key));
console.log('Available modules:', availableModules);

// Check if we have the minimal required modules
const hasCoreModules = ['errorHandler', 'uiRegistry', 'eventRegistry', 'stateManager'].every(
moduleName => availableModules.includes(moduleName)
);

if (!hasCoreModules) {
console.error('Missing critical core modules, attempting bootstrap');
await this.bootstrapCore();
}

// Try to set up basic UI functionality
this.setupBasicTabNavigation();
this.applyStoredTheme();
this.initializeModuleDiagnostics();

// Create recovery UI
this.createRecoveryUI();

return true;
},

/**
* Create a simple recovery UI when normal initialization fails
*/
createRecoveryUI() {
const recoveryContainer = document.getElementById('recovery-mode-container') || document.createElement('div');
recoveryContainer.id = 'recovery-mode-container';
recoveryContainer.className = 'container-fluid mt-3';

recoveryContainer.innerHTML = `
<div class="card">
<div class="card-header bg-warning">
<h4>NeuroGen Server - Recovery Mode</h4>
</div>
<div class="card-body">
<p class="lead">The application encountered issues during initialization and has entered recovery mode.</p>

<div class="alert alert-info">
<strong>Available Functionality:</strong> Limited features may be available.
</div>

<div class="row mt-4">
<div class="col">
  <div class="card">
    <div class="card-header">Module Status</div>
    <div class="card-body">
      <p>Loaded modules: ${this.cache.size}</p>
      <p>Failed modules: ${this.failedModules.size}</p>
      <button id="launch-diagnostics" class="btn btn-primary">Launch Diagnostics</button>
    </div>
  </div>
</div>

<div class="col">
  <div class="card">
    <div class="card-header">Recovery Options</div>
    <div class="card-body">
      <button id="retry-modules" class="btn btn-warning mb-2">Retry Failed Modules</button>
      <button id="reload-app" class="btn btn-success mb-2">Reload Application</button>
      <button id="clear-cache" class="btn btn-danger">Clear Cache</button>
    </div>
  </div>
</div>
</div>
</div>
</div>
`;

document.body.appendChild(recoveryContainer);

// Add event listeners
document.getElementById('launch-diagnostics')?.addEventListener('click', () => {
if (typeof window.launchDiagnostics === 'function') {
window.launchDiagnostics();
} else {
alert('Diagnostics not available');
}
});

document.getElementById('retry-modules')?.addEventListener('click', async () => {
const failedModules = Array.from(this.failedModules);
if (failedModules.length === 0) {
alert('No failed modules to retry');
return;
}

alert(`Attempting to retry loading ${failedModules.length} failed modules...`);

const results = await Promise.all(
failedModules.map(path => this.retryFailedModule(path, 2)
.then(() => true)
.catch(() => false)
)
);

const successCount = results.filter(Boolean).length;
alert(`Retry complete: ${successCount} modules recovered, ${failedModules.length - successCount} still failed`);
});

document.getElementById('reload-app')?.addEventListener('click', () => {
if (confirm('Are you sure you want to reload the application?')) {
window.location.reload();
}
});

document.getElementById('clear-cache')?.addEventListener('click', () => {
if (confirm('Are you sure you want to clear the module cache? This may cause temporary instability.')) {
this.clearCache();
alert('Cache cleared. Please reload the application.');
}
});
},

/**
* Standardize module exports to ensure consistent interfaces
* @param {Object} module - The module object
* @returns {Object} - Module with standardized exports
*/
standardizeExports(module) {
if (!module || !module.default || typeof module.default !== 'object') {
return module;
}

const defaultExport = module.default;
const exports = { default: defaultExport };

// Add all methods from default export as named exports
Object.keys(defaultExport).forEach(key => {
if (typeof defaultExport[key] === 'function' && !key.startsWith('_')) {
exports[key] = defaultExport[key].bind(defaultExport);
}
});

return exports;
},

/**
* Load specific module type (core, features, utils)
* @param {string} type - Module type ('core', 'features', 'utils')
* @param {Object} options - Options for loading
* @returns {Promise<Object>} - Loaded modules
*/
async loadModulesByType(type, options = {}) {
if (!type || !['core', 'features', 'utils'].includes(type)) {
console.error(`Invalid module type: ${type}`);
return {};
}

const modulePaths = Object.keys(this.MODULE_LOCATIONS)
.filter(filename => this.MODULE_LOCATIONS[filename] === type)
.map(filename => `/static/js/modules/${type}/${filename}`);

if (modulePaths.length === 0) {
console.warn(`No modules found for type: ${type}`);
return {};
}

return this.importModules(modulePaths, options.required || false, {
retries: options.retries || 1,
concurrencyLimit: options.concurrencyLimit || 3,
timeout: options.timeout || 5000
});
},

/**
* Load any missing modules that failed during initial load
* Useful for lazy loading modules when needed
* @returns {Promise<Object>} - Newly loaded modules
*/
async loadMissingModules() {
const allModuleNames = Object.keys(this.MODULE_LOCATIONS);
const loadedModuleNames = Array.from(this.cache.keys())
.map(path => path.split('/').pop())
.filter(name => name && name.endsWith('.js'))
.map(name => name);

const missingModuleNames = allModuleNames.filter(
name => !loadedModuleNames.includes(name) && !Array.from(this.failedModules).some(path => path.endsWith(name))
);

if (missingModuleNames.length === 0) {
console.log('No missing modules to load');
return {};
}

const missingModulePaths = missingModuleNames.map(name => {
const type = this.MODULE_LOCATIONS[name];
return `/static/js/modules/${type}/${name}`;
});

console.log(`Loading ${missingModulePaths.length} missing modules...`);
return this.importModules(missingModulePaths, false, {
retries: 1,
concurrencyLimit: 3
});
},

/**
* Initialize all modules of a specific type
* @param {Object} modules - Object with module instances
* @returns {Promise<boolean>} - Success state
*/
async initializeModules(modules) {
if (!modules || typeof modules !== 'object') {
console.error('Invalid modules object provided to initializeModules');
return false;
}

const moduleNames = Object.keys(modules);

if (moduleNames.length === 0) {
console.warn('No modules to initialize');
return true;
}

console.log(`Initializing ${moduleNames.length} modules...`);

let successCount = 0;

// Initialize each module if not already initialized
for (const moduleName of moduleNames) {
const module = modules[moduleName];

if (!module) {
console.warn(`Cannot initialize null module: ${moduleName}`);
continue;
}

if (typeof module.initialize !== 'function') {
console.warn(`Module ${moduleName} has no initialize method`);
continue;
}

if (this.initializedModules.has(moduleName)) {
console.log(`Module ${moduleName} already initialized, skipping`);
successCount++;
continue;
}

try {
// Initialize with timeout to prevent hanging
const result = await Promise.race([
module.initialize(),
new Promise((_, reject) => setTimeout(() => 
reject(new Error(`${moduleName} initialization timed out`)), 5000))
]);

if (result !== false) {
this.initializedModules.add(moduleName);
successCount++;
console.log(`Initialized module: ${moduleName}`);
} else {
console.warn(`Module ${moduleName} initialization returned false`);
}
} catch (error) {
console.error(`Error initializing module ${moduleName}:`, error);
}
}

console.log(`Module initialization complete: ${successCount}/${moduleNames.length} successful`);

return successCount === moduleNames.length;
}
};

// Initialize inverse module type mapping
moduleLoader.init();

// Export the module loader
export default moduleLoader;

// Named exports for methods (bound to the moduleLoader object)
export const importModule = moduleLoader.importModule.bind(moduleLoader);
export const loadModules = moduleLoader.loadModules.bind(moduleLoader);
export const getModule = moduleLoader.getModule.bind(moduleLoader);
export const retryFailedModule = moduleLoader.retryFailedModule.bind(moduleLoader);
export const preloadModules = moduleLoader.preloadModules.bind(moduleLoader);
export const unloadUnusedModules = moduleLoader.unloadUnusedModules.bind(moduleLoader);
export const initializeModuleDiagnostics = moduleLoader.initializeModuleDiagnostics.bind(moduleLoader);
export const activateRecoveryMode = moduleLoader.activateRecoveryMode.bind(moduleLoader);
export const standardizeExports = moduleLoader.standardizeExports.bind(moduleLoader);
export const loadModulesByType = moduleLoader.loadModulesByType.bind(moduleLoader);
export const createFallbackModule = moduleLoader.createFallbackModule.bind(moduleLoader);
export const generateHealthReport = moduleLoader.generateHealthReport.bind(moduleLoader);
export const loadMissingModules = moduleLoader.loadMissingModules.bind(moduleLoader);
export const clearCache = moduleLoader.clearCache.bind(moduleLoader);
export const initializeModules = moduleLoader.initializeModules.bind(moduleLoader);