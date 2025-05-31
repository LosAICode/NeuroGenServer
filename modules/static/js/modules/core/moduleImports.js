/**
 * Centralized Module Import System
 * 
 * Provides consistent import handling for all NeuroGen modules
 * Handles both ES6 imports and fallbacks to window objects
 * 
 * @module core/moduleImports
 */

// Base path configuration
const BASE_PATH = '/static/js/modules';

/**
 * Module registry with paths and dependencies
 */
const MODULE_REGISTRY = {
  // Core modules
  'errorHandler': { path: '/core/errorHandler.js', exports: ['showErrorNotification', 'showSuccess', 'handleError'] },
  'domUtils': { path: '/core/domUtils.js', exports: ['getElement', 'createElement', 'addClass', 'removeClass'] },
  'uiRegistry': { path: '/core/uiRegistry.js', exports: ['registerElement', 'getRegisteredElement'] },
  'stateManager': { path: '/core/stateManager.js', exports: ['setState', 'getState', 'subscribe'] },
  'eventManager': { path: '/core/eventManager.js', exports: ['registerEvents', 'emit', 'on', 'off'] },
  'eventRegistry': { path: '/core/eventRegistry.js', exports: ['registerEvent', 'getEvents'] },
  'themeManager': { path: '/core/themeManager.js', exports: ['setTheme', 'getTheme', 'toggleTheme'] },
  
  // Utils modules
  'socketHandler': { path: '/utils/socketHandler.js', exports: ['socket', 'emit', 'on', 'off'] },
  'progressHandler': { path: '/utils/progressHandler.js', exports: ['showProgress', 'hideProgress', 'updateProgress'] },
  'ui': { path: '/utils/ui.js', exports: ['showLoadingSpinner', 'hideLoadingSpinner', 'showToast', 'updateUI'] },
  'utils': { path: '/utils/utils.js', exports: ['generateId', 'formatDate', 'debounce', 'throttle'] },
  'fileHandler': { path: '/utils/fileHandler.js', exports: ['handleFile', 'validateFile', 'getFileType'] },
  
  // Services
  'blueprintApi': { path: '/services/blueprintApi.js', exports: 'default' },
  
  // Config modules
  'endpoints': { path: '/config/endpoints.js', exports: ['SCRAPER_ENDPOINTS', 'ACADEMIC_ENDPOINTS', 'PDF_ENDPOINTS', 'TASK_ENDPOINTS'] },
  'socketEvents': { path: '/config/socketEvents.js', exports: ['TASK_EVENTS', 'BLUEPRINT_EVENTS', 'SCRAPER_EVENTS', 'ACADEMIC_EVENTS'] },
  'constants': { path: '/config/constants.js', exports: ['CONSTANTS'] },
  
  // Feature modules
  'fileProcessor': { path: '/features/fileProcessor.js', exports: 'default' },
  'webScraper': { path: '/features/webScraper.js', exports: 'default' },
  'playlistDownloader': { path: '/features/playlistDownloader.js', exports: 'default' },
  'academicSearch': { path: '/features/academicSearch.js', exports: 'default' },
  'historyManager': { path: '/features/historyManager.js', exports: 'default' }
};

/**
 * Cache for loaded modules
 */
const moduleCache = new Map();

/**
 * Load a module with consistent error handling and caching
 * @param {string} moduleName - Name of the module to load
 * @returns {Promise<any>} The loaded module or its exports
 */
export async function loadModule(moduleName) {
  // Check cache first
  if (moduleCache.has(moduleName)) {
    return moduleCache.get(moduleName);
  }
  
  const moduleConfig = MODULE_REGISTRY[moduleName];
  if (!moduleConfig) {
    throw new Error(`Module '${moduleName}' not found in registry`);
  }
  
  try {
    // Try ES6 import
    const fullPath = `${BASE_PATH}${moduleConfig.path}`;
    const module = await import(fullPath);
    
    // Handle different export types
    let exports;
    if (moduleConfig.exports === 'default') {
      exports = module.default;
    } else if (Array.isArray(moduleConfig.exports)) {
      // Extract specific exports
      exports = {};
      for (const exportName of moduleConfig.exports) {
        if (module[exportName] !== undefined) {
          exports[exportName] = module[exportName];
        }
      }
    } else {
      exports = module;
    }
    
    // Cache the result
    moduleCache.set(moduleName, exports);
    return exports;
    
  } catch (error) {
    console.warn(`Failed to import ${moduleName} via ES6, checking window fallback:`, error);
    
    // Check window fallback
    if (window[moduleName]) {
      moduleCache.set(moduleName, window[moduleName]);
      return window[moduleName];
    }
    
    throw new Error(`Failed to load module '${moduleName}': ${error.message}`);
  }
}

/**
 * Load multiple modules at once
 * @param {string[]} moduleNames - Array of module names to load
 * @returns {Promise<Object>} Object with module names as keys and loaded modules as values
 */
export async function loadModules(moduleNames) {
  const results = {};
  const promises = moduleNames.map(async (name) => {
    try {
      results[name] = await loadModule(name);
    } catch (error) {
      console.error(`Failed to load module ${name}:`, error);
      results[name] = null;
    }
  });
  
  await Promise.all(promises);
  return results;
}

/**
 * Import helper for feature modules
 * Provides a consistent way to import dependencies
 */
export class ModuleImporter {
  constructor() {
    this.imports = {};
  }
  
  /**
   * Import core modules
   */
  async importCore() {
    const modules = await loadModules([
      'errorHandler',
      'domUtils',
      'uiRegistry',
      'stateManager',
      'eventManager'
    ]);
    
    Object.assign(this.imports, modules);
    return modules;
  }
  
  /**
   * Import utility modules
   */
  async importUtils() {
    const modules = await loadModules([
      'socketHandler',
      'progressHandler',
      'ui',
      'utils',
      'fileHandler'
    ]);
    
    Object.assign(this.imports, modules);
    return modules;
  }
  
  /**
   * Import configuration modules
   */
  async importConfig() {
    const modules = await loadModules([
      'endpoints',
      'socketEvents',
      'constants'
    ]);
    
    Object.assign(this.imports, modules);
    return modules;
  }
  
  /**
   * Import service modules
   */
  async importServices() {
    const modules = await loadModules(['blueprintApi']);
    Object.assign(this.imports, modules);
    return modules;
  }
  
  /**
   * Get all imported modules
   */
  getImports() {
    return this.imports;
  }
}

/**
 * Create a standard import set for feature modules
 */
export async function createStandardImports() {
  const importer = new ModuleImporter();
  
  // Load all standard dependencies
  await Promise.all([
    importer.importCore(),
    importer.importUtils(),
    importer.importConfig(),
    importer.importServices()
  ]);
  
  return importer.getImports();
}

// Export for global access if needed
if (typeof window !== 'undefined') {
  window.ModuleImports = {
    loadModule,
    loadModules,
    ModuleImporter,
    createStandardImports,
    MODULE_REGISTRY
  };
}

// Export the MODULE_REGISTRY and other functions
export { MODULE_REGISTRY, loadModule, loadModules, ModuleImporter, createStandardImports };