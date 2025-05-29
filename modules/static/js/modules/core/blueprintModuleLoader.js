/**
 * Blueprint Module Loader for Flask Blueprint Architecture
 * 
 * Advanced module loading system designed specifically for the new Flask Blueprint backend.
 * Provides intelligent module initialization, dependency resolution, and Blueprint-aware
 * loading with cross-platform optimizations.
 * 
 * @module core/blueprintModuleLoader
 * @version 3.0.0
 */

import { CONSTANTS, FEATURE_FLAGS, UI_CONFIG } from '../config/constants.js';
import { API_ENDPOINTS, BLUEPRINT_ROUTES, validateEndpoint } from '../config/endpoints.js';
import { SOCKET_EVENTS, getBlueprintEvents } from '../config/socketEvents.js';
import blueprintApi from '../services/blueprintApi.js';

/**
 * Blueprint Module Loader Class
 */
class BlueprintModuleLoader {
  constructor() {
    this.modules = new Map();
    this.loadingQueue = [];
    this.dependencies = new Map();
    this.loadingStates = new Map(); // 'pending', 'loading', 'loaded', 'error'
    this.retryAttempts = new Map();
    this.moduleConfigs = new Map();
    
    // Blueprint-specific settings
    this.blueprintModules = new Map();
    this.blueprintInitOrder = UI_CONFIG.BLUEPRINT_TAB_ORDER;
    this.maxConcurrentLoads = 3;
    this.loadTimeout = UI_CONFIG.MODULE_LOAD_TIMEOUT;
    this.maxRetries = UI_CONFIG.MODULE_RETRY_ATTEMPTS;
    
    // Performance monitoring
    this.loadTimes = new Map();
    this.errorCounts = new Map();
    this.debugMode = CONSTANTS.DEBUG_MODE;
    
    this.initializeBlueprintConfigs();
  }

  /**
   * Initialize Blueprint-specific module configurations
   */
  initializeBlueprintConfigs() {
    // Core modules that must load first
    this.moduleConfigs.set('core', {
      modules: [
        'core/eventManager.js',
        'core/stateManager.js',
        'core/errorHandler.js',
        'utils/socketHandler.js',
        'utils/progressHandler.js'
      ],
      priority: 1,
      required: true,
      blueprint: 'core'
    });

    // Blueprint feature modules
    this.blueprintInitOrder.forEach((blueprint, index) => {
      const config = this.getBlueprintModuleConfig(blueprint);
      if (config) {
        this.moduleConfigs.set(blueprint, {
          ...config,
          priority: index + 2, // After core modules
          blueprint: blueprint
        });
      }
    });

    // Utility modules
    this.moduleConfigs.set('utils', {
      modules: [
        'utils/domUtils.js',
        'utils/ui.js',
        'utils/fileHandler.js',
        'utils/debugTools.js'
      ],
      priority: 10,
      required: false,
      blueprint: 'core'
    });
  }

  /**
   * Get Blueprint-specific module configuration
   * @param {string} blueprint - Blueprint name
   * @returns {Object} Module configuration
   */
  getBlueprintModuleConfig(blueprint) {
    const configs = {
      file_processor: {
        modules: [
          'features/fileProcessor.js',
          'features/safeFileProcessor.js'
        ],
        required: FEATURE_FLAGS.ENABLE_FILE_PROCESSING,
        endpoints: API_ENDPOINTS.FILE_PROCESSING,
        events: getBlueprintEvents('file_processor')
      },
      
      playlist_downloader: {
        modules: [
          'features/playlistDownloader.js',
          'features/playlistDownloader.module.js'
        ],
        required: FEATURE_FLAGS.ENABLE_PLAYLIST_DOWNLOADER,
        endpoints: API_ENDPOINTS.PLAYLIST,
        events: getBlueprintEvents('playlist_downloader')
      },
      
      web_scraper: {
        modules: [
          'features/webScraper.js',
          'features/webScraperUtils.js'
        ],
        required: FEATURE_FLAGS.ENABLE_WEB_SCRAPER,
        endpoints: API_ENDPOINTS.WEB_SCRAPER,
        events: getBlueprintEvents('web_scraper')
      },
      
      academic_search: {
        modules: [
          'features/academicSearch.js',
          'features/academicScraper.js',
          'features/academicApiClient.js'
        ],
        required: FEATURE_FLAGS.ENABLE_ACADEMIC_SEARCH,
        endpoints: API_ENDPOINTS.ACADEMIC,
        events: getBlueprintEvents('academic_search')
      },
      
      pdf_processor: {
        modules: [
          'features/pdfProcessor.js'
        ],
        required: FEATURE_FLAGS.ENABLE_PDF_PROCESSOR,
        endpoints: API_ENDPOINTS.PDF,
        events: getBlueprintEvents('pdf_processor')
      }
    };

    return configs[blueprint];
  }

  /**
   * Load all Blueprint modules in correct order
   * @returns {Promise<Map>} Loaded modules
   */
  async loadAllModules() {
    const startTime = performance.now();
    this.log('Starting Blueprint module loading sequence...');

    try {
      // Load modules by priority order
      const sortedConfigs = Array.from(this.moduleConfigs.entries())
        .sort(([, a], [, b]) => a.priority - b.priority);

      for (const [name, config] of sortedConfigs) {
        if (config.required || this.shouldLoadModule(name, config)) {
          await this.loadModuleGroup(name, config);
        }
      }

      const loadTime = performance.now() - startTime;
      this.log(`All Blueprint modules loaded in ${loadTime.toFixed(2)}ms`);
      
      // Emit completion event
      this.emitModuleEvent('blueprint-modules-loaded', {
        totalModules: this.modules.size,
        loadTime: loadTime,
        modules: Array.from(this.modules.keys())
      });

      return this.modules;

    } catch (error) {
      this.handleLoadError('global', error);
      throw error;
    }
  }

  /**
   * Load a group of modules for a specific Blueprint
   * @param {string} groupName - Module group name
   * @param {Object} config - Group configuration
   */
  async loadModuleGroup(groupName, config) {
    this.log(`Loading ${groupName} module group...`);
    const startTime = performance.now();

    try {
      // Validate Blueprint endpoints if applicable
      if (config.endpoints) {
        await this.validateBlueprintEndpoints(config.blueprint, config.endpoints);
      }

      // Load modules concurrently within the group
      const modulePromises = config.modules.map(async (modulePath) => {
        return this.loadModule(modulePath, {
          blueprint: config.blueprint,
          timeout: this.loadTimeout,
          events: config.events
        });
      });

      const loadedModules = await Promise.allSettled(modulePromises);
      
      // Process results
      const successful = [];
      const failed = [];

      loadedModules.forEach((result, index) => {
        const modulePath = config.modules[index];
        if (result.status === 'fulfilled') {
          successful.push(modulePath);
          this.blueprintModules.set(modulePath, {
            blueprint: config.blueprint,
            module: result.value,
            loadTime: performance.now() - startTime
          });
        } else {
          failed.push({ path: modulePath, error: result.reason });
          this.errorCounts.set(modulePath, (this.errorCounts.get(modulePath) || 0) + 1);
        }
      });

      const loadTime = performance.now() - startTime;
      this.loadTimes.set(groupName, loadTime);

      this.log(`${groupName} group: ${successful.length} loaded, ${failed.length} failed (${loadTime.toFixed(2)}ms)`);

      // Handle required module failures
      if (config.required && failed.length > 0) {
        const error = new Error(`Required ${groupName} modules failed to load: ${failed.map(f => f.path).join(', ')}`);
        error.details = failed;
        throw error;
      }

      // Emit group completion event
      this.emitModuleEvent('blueprint-group-loaded', {
        groupName,
        blueprint: config.blueprint,
        successful,
        failed,
        loadTime
      });

    } catch (error) {
      this.handleLoadError(groupName, error);
      throw error;
    }
  }

  /**
   * Load individual module with Blueprint context
   * @param {string} modulePath - Module path
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} Loaded module
   */
  async loadModule(modulePath, options = {}) {
    const fullPath = `/static/js/modules/${modulePath}`;
    const moduleId = this.getModuleId(modulePath);

    // Check if already loaded
    if (this.modules.has(moduleId)) {
      return this.modules.get(moduleId);
    }

    // Check loading state
    if (this.loadingStates.get(moduleId) === 'loading') {
      return this.waitForModule(moduleId);
    }

    this.loadingStates.set(moduleId, 'loading');
    const startTime = performance.now();

    try {
      const module = await this.importWithTimeout(fullPath, options.timeout);
      
      // Initialize module with Blueprint context
      if (module.default && typeof module.default.init === 'function') {
        await this.initializeModule(module.default, {
          blueprint: options.blueprint,
          events: options.events,
          api: blueprintApi
        });
      }

      this.modules.set(moduleId, module);
      this.loadingStates.set(moduleId, 'loaded');
      
      const loadTime = performance.now() - startTime;
      this.loadTimes.set(moduleId, loadTime);

      this.log(`Loaded ${modulePath} in ${loadTime.toFixed(2)}ms`);
      
      return module;

    } catch (error) {
      this.loadingStates.set(moduleId, 'error');
      this.handleModuleError(moduleId, modulePath, error);
      throw error;
    }
  }

  /**
   * Import module with timeout support
   * @param {string} path - Module path
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Imported module
   */
  async importWithTimeout(path, timeout = this.loadTimeout) {
    const importPromise = import(path);
    
    if (timeout) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Module load timeout: ${path}`)), timeout);
      });
      
      return Promise.race([importPromise, timeoutPromise]);
    }
    
    return importPromise;
  }

  /**
   * Initialize module with Blueprint context
   * @param {Object} module - Module to initialize
   * @param {Object} context - Blueprint context
   */
  async initializeModule(module, context) {
    try {
      if (typeof module.init === 'function') {
        await module.init(context);
      }
      
      // Set Blueprint-specific configuration
      if (module.setBlueprintConfig && typeof module.setBlueprintConfig === 'function') {
        module.setBlueprintConfig(context.blueprint, {
          endpoints: context.endpoints,
          events: context.events,
          api: context.api
        });
      }

    } catch (error) {
      this.log(`Module initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate Blueprint endpoints are available
   * @param {string} blueprint - Blueprint name
   * @param {Object} endpoints - Endpoint configuration
   */
  async validateBlueprintEndpoints(blueprint, endpoints) {
    if (!blueprint || !endpoints) return;

    try {
      // Test health endpoint if available
      if (endpoints.HEALTH) {
        await blueprintApi.request(endpoints.HEALTH, { method: 'GET' }, blueprint);
      }
      
      this.log(`Blueprint ${blueprint} endpoints validated`);
      
    } catch (error) {
      this.log(`Blueprint ${blueprint} endpoint validation failed: ${error.message}`);
      // Don't throw - endpoints might not be ready yet
    }
  }

  /**
   * Check if module should be loaded based on feature flags and conditions
   * @param {string} name - Module name
   * @param {Object} config - Module configuration
   * @returns {boolean} Should load module
   */
  shouldLoadModule(name, config) {
    // Check feature flags
    if (config.blueprint && FEATURE_FLAGS[`ENABLE_${config.blueprint.toUpperCase()}`] === false) {
      return false;
    }

    // Check error threshold
    const errorCount = this.errorCounts.get(name) || 0;
    if (errorCount >= this.maxRetries) {
      this.log(`Skipping ${name} - max retries exceeded`);
      return false;
    }

    return true;
  }

  /**
   * Wait for module to finish loading
   * @param {string} moduleId - Module ID
   * @returns {Promise<Object>} Loaded module
   */
  async waitForModule(moduleId) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const state = this.loadingStates.get(moduleId);
        
        if (state === 'loaded') {
          clearInterval(checkInterval);
          resolve(this.modules.get(moduleId));
        } else if (state === 'error') {
          clearInterval(checkInterval);
          reject(new Error(`Module ${moduleId} failed to load`));
        }
      }, 100);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Timeout waiting for module ${moduleId}`));
      }, 30000);
    });
  }

  /**
   * Handle module loading errors with retry logic
   * @param {string} moduleId - Module ID
   * @param {string} modulePath - Module path
   * @param {Error} error - Error object
   */
  async handleModuleError(moduleId, modulePath, error) {
    const retryCount = this.retryAttempts.get(moduleId) || 0;
    
    this.log(`Module load error ${modulePath}: ${error.message} (attempt ${retryCount + 1})`);
    
    if (retryCount < this.maxRetries) {
      this.retryAttempts.set(moduleId, retryCount + 1);
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      
      setTimeout(async () => {
        try {
          this.log(`Retrying ${modulePath} (attempt ${retryCount + 2})`);
          await this.loadModule(modulePath);
        } catch (retryError) {
          this.log(`Retry failed for ${modulePath}: ${retryError.message}`);
        }
      }, delay);
    } else {
      this.errorCounts.set(moduleId, (this.errorCounts.get(moduleId) || 0) + 1);
    }
  }

  /**
   * Handle global loading errors
   * @param {string} context - Error context
   * @param {Error} error - Error object
   */
  handleLoadError(context, error) {
    this.log(`Loading error in ${context}: ${error.message}`);
    
    this.emitModuleEvent('blueprint-load-error', {
      context,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Get module ID from path
   * @param {string} modulePath - Module path
   * @returns {string} Module ID
   */
  getModuleId(modulePath) {
    return modulePath.replace(/[./]/g, '_').replace(/_js$/, '');
  }

  /**
   * Emit module loading events
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   */
  emitModuleEvent(eventName, data) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }
    
    this.log(`Event: ${eventName}`, data);
  }

  /**
   * Logging with debug mode support
   * @param {string} message - Log message
   * @param {any} data - Additional data
   */
  log(message, data = null) {
    if (this.debugMode) {
      console.log(`[BlueprintModuleLoader] ${message}`, data || '');
    }
  }

  /**
   * Get loading statistics
   * @returns {Object} Loading statistics
   */
  getLoadingStats() {
    const totalModules = this.modules.size;
    const totalLoadTime = Array.from(this.loadTimes.values()).reduce((sum, time) => sum + time, 0);
    const avgLoadTime = totalModules > 0 ? totalLoadTime / totalModules : 0;
    
    return {
      totalModules,
      totalLoadTime: Math.round(totalLoadTime),
      avgLoadTime: Math.round(avgLoadTime),
      errorCounts: Object.fromEntries(this.errorCounts),
      loadingStates: Object.fromEntries(this.loadingStates),
      blueprintModules: this.blueprintModules.size
    };
  }

  /**
   * Get module by Blueprint
   * @param {string} blueprint - Blueprint name
   * @returns {Array} Modules for Blueprint
   */
  getModulesByBlueprint(blueprint) {
    const modules = [];
    
    for (const [path, info] of this.blueprintModules.entries()) {
      if (info.blueprint === blueprint) {
        modules.push({
          path,
          module: info.module,
          loadTime: info.loadTime
        });
      }
    }
    
    return modules;
  }

  /**
   * Reload module (for development)
   * @param {string} modulePath - Module path
   * @returns {Promise<Object>} Reloaded module
   */
  async reloadModule(modulePath) {
    const moduleId = this.getModuleId(modulePath);
    
    // Clear from cache
    this.modules.delete(moduleId);
    this.loadingStates.delete(moduleId);
    this.retryAttempts.delete(moduleId);
    
    // Force reload by adding timestamp
    const fullPath = `/static/js/modules/${modulePath}?t=${Date.now()}`;
    return this.importWithTimeout(fullPath);
  }

  /**
   * Cleanup all modules and reset state
   */
  cleanup() {
    // Call cleanup on modules that support it
    for (const [moduleId, module] of this.modules.entries()) {
      if (module.default && typeof module.default.cleanup === 'function') {
        try {
          module.default.cleanup();
        } catch (error) {
          this.log(`Cleanup error for ${moduleId}: ${error.message}`);
        }
      }
    }

    // Clear all state
    this.modules.clear();
    this.loadingQueue.length = 0;
    this.dependencies.clear();
    this.loadingStates.clear();
    this.retryAttempts.clear();
    this.blueprintModules.clear();
    this.loadTimes.clear();
    this.errorCounts.clear();
  }
}

// Create singleton instance
const blueprintModuleLoader = new BlueprintModuleLoader();

// Export singleton instance and class
export default blueprintModuleLoader;
export { BlueprintModuleLoader };

// Export convenience methods
export const loadAllBlueprintModules = () => blueprintModuleLoader.loadAllModules();
export const loadBlueprintModule = (path, options) => blueprintModuleLoader.loadModule(path, options);
export const getBlueprintLoadingStats = () => blueprintModuleLoader.getLoadingStats();
export const getBlueprintModules = (blueprint) => blueprintModuleLoader.getModulesByBlueprint(blueprint);
export const reloadBlueprintModule = (path) => blueprintModuleLoader.reloadModule(path);
export const cleanupBlueprintModules = () => blueprintModuleLoader.cleanup();

// Expose to global scope for debugging
if (typeof window !== 'undefined' && CONSTANTS.DEBUG_MODE) {
  window.blueprintModuleLoader = blueprintModuleLoader;
  window.loadAllBlueprintModules = loadAllBlueprintModules;
  window.getBlueprintLoadingStats = getBlueprintLoadingStats;
}