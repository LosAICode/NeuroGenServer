/**
 * NeuroGen Server - Optimized Module Loader v4.0
 * 
 * High-performance module loading with simplified architecture.
 * 
 * Key Optimizations:
 * - Reduced code size from 3400+ lines to ~500 lines
 * - Simplified dependency resolution
 * - Faster import/caching mechanisms
 * - Improved error handling with fallbacks
 * - Better memory management
 */

/**
 * Optimized Module Loader
 */
const moduleLoader = {
  // Core state
  cache: new Map(),
  loadingPromises: new Map(),
  failedModules: new Set(),
  initialized: false,
  
  // Performance tracking
  stats: {
    totalLoaded: 0,
    totalFailed: 0,
    cacheHits: 0,
    avgLoadTime: 0
  },
  
  // Configuration
  config: {
    maxRetries: 2,
    timeout: 5000,
    concurrencyLimit: 3,
    debugMode: false
  },
  
  // Module path mappings
  MODULE_PATHS: {
    // Core modules
    'app.js': '/static/js/modules/core/app.js',
    'errorHandler.js': '/static/js/modules/core/errorHandler.js',
    'uiRegistry.js': '/static/js/modules/core/uiRegistry.js',
    'stateManager.js': '/static/js/modules/core/stateManager.js',
    'eventManager.js': '/static/js/modules/core/eventManager.js',
    'eventRegistry.js': '/static/js/modules/core/eventRegistry.js',
    'themeManager.js': '/static/js/modules/core/themeManager.js',
    'moduleLoader.js': '/static/js/modules/core/moduleLoader.js',
    
    // Features
    'fileProcessor.js': '/static/js/modules/features/fileProcessor.js',
    'webScraper.js': '/static/js/modules/features/webScraper.js',
    'academicSearch.js': '/static/js/modules/features/academicSearch.js',
    'playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
    'historyManager.js': '/static/js/modules/features/historyManager.js',
    
    // Utils
    'ui.js': '/static/js/modules/utils/ui.js',
    'utils.js': '/static/js/modules/utils/utils.js',
    'progressHandler.js': '/static/js/modules/utils/progressHandler.js',
    'socketHandler.js': '/static/js/modules/utils/socketHandler.js',
    'fileHandler.js': '/static/js/modules/utils/fileHandler.js',
    'debugTools.js': '/static/js/modules/utils/debugTools.js',
    'moduleDiagnostics.js': '/static/js/modules/utils/moduleDiagnostics.js',
    'domUtils.js': '/static/js/modules/utils/domUtils.js'
  },
  
  // Dependencies (simplified)
  DEPENDENCIES: {
    'webScraper.js': ['ui.js', 'progressHandler.js'],
    'academicSearch.js': ['ui.js'],
    'playlistDownloader.js': ['ui.js', 'progressHandler.js'],
    'fileProcessor.js': ['ui.js', 'progressHandler.js']
  },
  
  /**
   * Initialize the module loader
   */
  initialize() {
    if (this.initialized) return true;
    
    console.log('Optimized Module Loader v4.0 initializing...');
    this.initialized = true;
    return true;
  },
  
  /**
   * Resolve module path
   * @param {string} modulePath - Module path to resolve
   * @returns {string} Resolved absolute path
   */
  resolvePath(modulePath) {
    // Handle direct URLs
    if (modulePath.startsWith('http') || modulePath.startsWith('/static/')) {
      return modulePath;
    }
    
    // Extract filename
    const filename = modulePath.split('/').pop();
    
    // Use mapping if available
    if (this.MODULE_PATHS[filename]) {
      return this.MODULE_PATHS[filename];
    }
    
    // Construct path from relative
    if (modulePath.startsWith('./modules/')) {
      return `/static/js/${modulePath.substring(2)}`;
    }
    
    console.warn(`Could not resolve path for: ${modulePath}`);
    return modulePath;
  },
  
  /**
   * Load a single module with optimized caching
   * @param {string} modulePath - Path to module
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Module object
   */
  async loadModule(modulePath, options = {}) {
    const startTime = performance.now();
    
    try {
      const resolvedPath = this.resolvePath(modulePath);
      
      // Check cache first
      if (this.cache.has(resolvedPath) && !options.skipCache) {
        this.stats.cacheHits++;
        return { module: this.cache.get(resolvedPath), fromCache: true };
      }
      
      // Check if already loading
      if (this.loadingPromises.has(resolvedPath)) {
        return await this.loadingPromises.get(resolvedPath);
      }
      
      // Create loading promise
      const loadPromise = this._doLoad(resolvedPath, options);
      this.loadingPromises.set(resolvedPath, loadPromise);
      
      const result = await loadPromise;
      
      // Update stats
      const loadTime = performance.now() - startTime;
      this.stats.avgLoadTime = (this.stats.avgLoadTime + loadTime) / 2;
      this.stats.totalLoaded++;
      
      return result;
      
    } catch (error) {
      this.stats.totalFailed++;
      this.failedModules.add(modulePath);
      
      console.error(`Failed to load module ${modulePath}:`, error);
      
      if (options.required) {
        throw error;
      }
      
      return { module: this.createFallback(modulePath), fallback: true };
    } finally {
      this.loadingPromises.delete(this.resolvePath(modulePath));
    }
  },
  
  /**
   * Internal module loading logic
   * @private
   */
  async _doLoad(resolvedPath, options) {
    const timeout = options.timeout || this.config.timeout;
    
    const loadPromise = import(resolvedPath);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Module load timeout')), timeout)
    );
    
    const module = await Promise.race([loadPromise, timeoutPromise]);
    
    // Cache the module
    this.cache.set(resolvedPath, module);
    
    if (this.config.debugMode) {
      console.log(`✓ Loaded: ${resolvedPath}`);
    }
    
    return { module, fromCache: false };
  },
  
  /**
   * Load module with dependencies
   * @param {string} modulePath - Main module path
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Module with dependencies loaded
   */
  async loadWithDependencies(modulePath, options = {}) {
    const filename = modulePath.split('/').pop();
    const deps = this.DEPENDENCIES[filename] || [];
    
    // Load dependencies first
    const depResults = await Promise.allSettled(
      deps.map(dep => this.loadModule(dep, { ...options, required: false }))
    );
    
    // Check for critical dependency failures
    const criticalFailed = depResults.some((result, i) => 
      result.status === 'rejected' && options.criticalDeps?.includes(deps[i])
    );
    
    if (criticalFailed) {
      throw new Error(`Critical dependencies failed for ${modulePath}`);
    }
    
    // Load main module
    return await this.loadModule(modulePath, options);
  },
  
  /**
   * Create a simple fallback module
   * @param {string} modulePath - Failed module path
   * @returns {Object} Fallback module
   */
  createFallback(modulePath) {
    const moduleName = modulePath.split('/').pop().replace('.js', '');
    
    console.warn(`Creating fallback for ${moduleName}`);
    
    return {
      name: moduleName,
      fallback: true,
      initialize: () => Promise.resolve(true),
      [moduleName]: {
        initialize: () => console.warn(`${moduleName} fallback used`),
        // Add common method stubs
        process: () => console.warn(`${moduleName}.process() fallback`),
        search: () => console.warn(`${moduleName}.search() fallback`),
        download: () => console.warn(`${moduleName}.download() fallback`)
      }
    };
  },
  
  /**
   * Batch load multiple modules with concurrency control
   * @param {Array<string>} modulePaths - Array of module paths
   * @param {Object} options - Loading options
   * @returns {Promise<Array>} Array of module results
   */
  async loadBatch(modulePaths, options = {}) {
    const { concurrency = this.config.concurrencyLimit } = options;
    const results = [];
    
    // Process in batches to control concurrency
    for (let i = 0; i < modulePaths.length; i += concurrency) {
      const batch = modulePaths.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(path => this.loadModule(path, options))
      );
      results.push(...batchResults);
    }
    
    return results;
  },
  
  /**
   * Clear failed modules and retry
   * @param {Array<string>} specificModules - Specific modules to retry
   * @returns {Promise<void>}
   */
  async retryFailed(specificModules = null) {
    const toRetry = specificModules || Array.from(this.failedModules);
    
    console.log(`Retrying ${toRetry.length} failed modules...`);
    
    // Clear from failed set
    toRetry.forEach(path => this.failedModules.delete(path));
    
    // Attempt to reload
    const results = await this.loadBatch(toRetry, { skipCache: true });
    
    return results.filter(r => r.status === 'fulfilled');
  },
  
  /**
   * Get comprehensive loading statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      cached: this.cache.size,
      failed: this.failedModules.size,
      loading: this.loadingPromises.size,
      successRate: this.stats.totalLoaded / (this.stats.totalLoaded + this.stats.totalFailed)
    };
  },
  
  /**
   * Clear module cache
   * @param {boolean} clearFailed - Also clear failed module tracking
   */
  clearCache(clearFailed = false) {
    this.cache.clear();
    this.loadingPromises.clear();
    
    if (clearFailed) {
      this.failedModules.clear();
    }
    
    console.log('Module cache cleared');
  }
};

// Initialize immediately
moduleLoader.initialize();

// Export both default and named exports for compatibility
export default moduleLoader;
export const { loadModule, loadWithDependencies, loadBatch, retryFailed, getStats, clearCache } = moduleLoader;