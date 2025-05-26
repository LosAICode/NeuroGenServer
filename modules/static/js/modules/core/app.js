/**
 * NeuroGen Server - Main Application Module
 * 
 * Manages application initialization, module loading, and core functionality.
 * This is the central orchestration module that coordinates all other components.
 */

/**
 * Main Application Module
 */
const app = {
  // Configuration and state
  config: {
    debug: true,
    defaultTheme: 'light',
    version: '1.0.0'
  },
  
  // Loaded modules
  core: {},
  features: {},
  utils: {},
  
  // Initialization status
  initialized: false,
  
  /**
   * Initialize the application
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(options = {}) {
    if (this.initialized) {
      console.warn('App already initialized');
      return true;
    }
    
    try {
      console.log('Initializing application...');
      
      // Merge options with default config
      this.config = { ...this.config, ...options };
      
      // Load core modules
      await this.loadCoreModules();
      
      // Load and initialize features
      await this.loadFeatureModules();
      
      // Load utilities in background
      this.loadUtilityModules();
      
      // Apply theme settings
      if (this.core.themeManager) {
        this.core.themeManager.setTheme(this.config.defaultTheme);
      }
      
      // Mark as initialized
      this.initialized = true;
      
      console.log('Application initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing app:', error);
      
      // Try to use error handler if available
      if (this.core.errorHandler) {
        this.core.errorHandler.handleError(error, 'MODULE', true, {
          details: 'Error occurred during application initialization'
        });
      }
      
      return false;
    }
  },
  
  /**
   * Load core modules required for the application
   * @returns {Promise<Object>} - Loaded core modules
   */
  async loadCoreModules() {
    try {
      console.log('Loading core modules...');
      
      // These modules will be dynamically imported
      const coreModules = [
        '/static/js/modules/core/errorHandler.js',
        '/static/js/modules/core/uiRegistry.js',
        '/static/js/modules/core/stateManager.js',
        '/static/js/modules/core/eventRegistry.js',
        '/static/js/modules/core/eventManager.js',
        '/static/js/modules/core/themeManager.js'
      ];
      
      const loadedModules = {};
      
      // Import moduleLoader from window if already loaded
      if (window.moduleLoader) {
        // Load modules using moduleLoader
        for (const modulePath of coreModules) {
          try {
            const module = await window.moduleLoader.importModule(modulePath, { required: true });
            
            // Get module name
            const moduleName = window.moduleLoader.getModuleName(modulePath);
            loadedModules[moduleName] = module;
            
            // Initialize if it has initialize method
            if (module && typeof module.initialize === 'function') {
              await module.initialize();
            }
          } catch (moduleError) {
            console.error(`Failed to load core module ${modulePath}:`, moduleError);
          }
        }
      } else {
        // Fallback to direct imports if moduleLoader not available
        for (const modulePath of coreModules) {
          try {
            const module = await import(modulePath);
            
            // Get module name from path
            const moduleName = modulePath.split('/').pop().replace('.js', '');
            
            // Store module
            loadedModules[moduleName] = module.default || module;
            
            // Initialize if it has initialize method
            if (loadedModules[moduleName] && typeof loadedModules[moduleName].initialize === 'function') {
              await loadedModules[moduleName].initialize();
            }
          } catch (moduleError) {
            console.error(`Failed to load core module ${modulePath}:`, moduleError);
          }
        }
      }
      
      // Store core modules for access
      this.core = loadedModules;
      console.log('Core modules loaded successfully');
      
      return loadedModules;
    } catch (error) {
      console.error('Error loading core modules:', error);
      throw error;
    }
  },
  
  /**
   * Load feature modules
   * @returns {Promise<Object>} - Loaded feature modules
   */
  async loadFeatureModules() {
    try {
      console.log('Loading feature modules...');
      
      // These modules will be dynamically imported
      const featureModules = [
        '/static/js/modules/features/fileProcessor.js',
        '/static/js/modules/features/webScraper.js',
        '/static/js/modules/features/playlistDownloader.js',
        '/static/js/modules/features/academicSearch.js',
        '/static/js/modules/features/historyManager.js'
      ];
      
      const loadedModules = {};
      
      // Load each module and initialize it
      for (const modulePath of featureModules) {
        try {
          let module;
          
          // Use moduleLoader if available
          if (window.moduleLoader) {
            module = await window.moduleLoader.importModule(modulePath);
          } else {
            // Direct import otherwise
            module = await import(modulePath);
            module = module.default || module;
          }
          
          // Get module name from path
          const moduleName = modulePath.split('/').pop().replace('.js', '');
          
          // Store module
          loadedModules[moduleName] = module;
          
          // Initialize if it has initialize method
          if (module && typeof module.initialize === 'function') {
            await module.initialize();
          }
          
          console.log(`Feature module loaded: ${moduleName}`);
        } catch (moduleError) {
          console.warn(`Failed to load feature module ${modulePath}:`, moduleError);
          
          // Create a placeholder for this module
          const moduleName = modulePath.split('/').pop().replace('.js', '');
          loadedModules[moduleName] = {
            __isFallback: true,
            initialize: () => false,
            moduleName
          };
        }
      }
      
      // Store loaded modules
      this.features = loadedModules;
      console.log('Feature modules loaded successfully');
      
      return loadedModules;
    } catch (error) {
      console.error('Error loading feature modules:', error);
      return {};
    }
  },
  
  /**
   * Load utility modules in the background
   * @returns {Promise<Object>} - Loaded utility modules
   */
  async loadUtilityModules() {
    try {
      console.log('Loading utility modules in background...');
      
      // These modules will be dynamically imported
      const utilModules = [
        '/static/js/modules/utils/utils.js',
        '/static/js/modules/utils/ui.js',
        '/static/js/modules/utils/fileHandler.js',
        '/static/js/modules/utils/progressHandler.js',
        '/static/js/modules/utils/socketHandler.js',
        '/static/js/modules/utils/moduleDiagnostics.js'
      ];
      
      const loadedModules = {};
      
      // Load each module in the background
      const loadPromises = utilModules.map(async (modulePath) => {
        try {
          let module;
          
          // Use moduleLoader if available
          if (window.moduleLoader) {
            module = await window.moduleLoader.importModule(modulePath);
          } else {
            // Direct import otherwise
            module = await import(modulePath);
            module = module.default || module;
          }
          
          // Get module name from path
          const moduleName = modulePath.split('/').pop().replace('.js', '');
          
          // Store module
          loadedModules[moduleName] = module;
          
          // Initialize if it has initialize method
          if (module && typeof module.initialize === 'function') {
            await module.initialize();
          }
          
          console.log(`Utility module loaded: ${moduleName}`);
          return { moduleName, success: true };
        } catch (moduleError) {
          console.warn(`Failed to load utility module ${modulePath}:`, moduleError);
          return { modulePath, success: false, error: moduleError };
        }
      });
      
      // Wait for all modules to finish loading
      const results = await Promise.allSettled(loadPromises);
      
      // Store loaded modules
      this.utils = loadedModules;
      console.log('Utility modules loaded successfully');
      
      return loadedModules;
    } catch (error) {
      console.error('Error loading utility modules:', error);
      return {};
    }
  },
  
  /**
   * Get a loaded module
   * @param {string} moduleName - Name of the module to get
   * @param {string} [category='core'] - Category of the module (core, features, utils)
   * @returns {Object|null} - The module or null if not found
   */
  getModule(moduleName, category = 'core') {
    if (!moduleName) return null;
    
    // Check if category exists
    if (!this[category]) {
      console.warn(`Invalid module category: ${category}`);
      return null;
    }
    
    // Get module from the specified category
    const module = this[category][moduleName];
    
    if (!module) {
      if (this.config.debug) {
        console.warn(`Module not found: ${moduleName} in ${category}`);
      }
      return null;
    }
    
    return module;
  },
  
  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {number} duration - Display duration in ms
   */
  showToast(message, type = 'info', duration = 3000) {
    // Try to use UI module if available
    if (this.utils.ui && typeof this.utils.ui.showToast === 'function') {
      this.utils.ui.showToast(message, type, duration);
      return;
    }
    
    // Try to use error handler if available
    if (this.core.errorHandler && typeof this.core.errorHandler.showToast === 'function') {
      this.core.errorHandler.showToast(message, type, { timeout: duration });
      return;
    }
    
    // Fallback implementation
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Try to create toast element
    const toastContainer = document.getElementById('toast-container') || document.body;
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, duration);
  },
  
  /**
   * Show an error message
   * @param {string|Error} error - Error message or object
   */
  showError(error) {
    const errorMessage = error instanceof Error ? error.message : error;
    
    // Try to use errorHandler if available
    if (this.core.errorHandler && typeof this.core.errorHandler.showError === 'function') {
      this.core.errorHandler.showError(errorMessage);
      return;
    }
    
    // Fallback
    this.showToast(errorMessage, 'error');
    console.error(errorMessage);
  },
  
  /**
   * Show a success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    // Try to use errorHandler if available
    if (this.core.errorHandler && typeof this.core.errorHandler.showSuccess === 'function') {
      this.core.errorHandler.showSuccess(message);
      return;
    }
    
    // Fallback
    this.showToast(message, 'success');
    console.log(message);
  },
  
  /**
   * Get application version
   * @returns {string} - Version string
   */
  getVersion() {
    return this.config.version;
  },
  
  /**
   * Set debug mode
   * @param {boolean} enabled - Whether debug mode is enabled
   */
  setDebugMode(enabled) {
    this.config.debug = !!enabled;
    console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    
    // Apply to all modules that support debug mode
    Object.values(this.core).forEach(module => {
      if (module && typeof module.config === 'object' && 'debug' in module.config) {
        module.config.debug = enabled;
      }
    });
    
    Object.values(this.features).forEach(module => {
      if (module && typeof module.config === 'object' && 'debug' in module.config) {
        module.config.debug = enabled;
      }
    });
    
    Object.values(this.utils).forEach(module => {
      if (module && typeof module.config === 'object' && 'debug' in module.config) {
        module.config.debug = enabled;
      }
    });
  }
};

// Export both default and named exports
export default app;
export const initialize = app.initialize.bind(app);
export const loadCoreModules = app.loadCoreModules.bind(app);
export const loadFeatureModules = app.loadFeatureModules.bind(app);
export const loadUtilityModules = app.loadUtilityModules.bind(app);
export const getModule = app.getModule.bind(app);
export const showToast = app.showToast.bind(app);
export const showError = app.showError.bind(app);
export const showSuccess = app.showSuccess.bind(app);
export const getVersion = app.getVersion.bind(app);
export const setDebugMode = app.setDebugMode.bind(app);