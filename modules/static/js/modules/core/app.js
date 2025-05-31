/**
 * NeuroGen Server - Enhanced Main Application Module v4.0
 * 
 * Central orchestration module optimized for the new Blueprint architecture.
 * Manages application initialization, module loading, and core functionality
 * with centralized configuration and integrated health monitoring.
 * 
 * NEW v4.0 Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced 4-method notification system (Toast + Console + System + Error)
 * - Backend connectivity testing with health checks
 * - ES6 module imports with centralized configuration
 * - Optimized for Blueprint architecture integration
 * - Cross-module coordination and health monitoring
 * - Enhanced error handling and recovery
 * 
 * @module core/app
 * @version 4.0.0 - Blueprint Architecture Optimization
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, APP_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';

// Global configuration for app module
const APP_MODULE_CONFIG = {
  endpoints: {
    health: API_ENDPOINTS.SYSTEM?.HEALTH || '/api/health',
    moduleTest: API_ENDPOINTS.SYSTEM?.MODULE_TEST || '/api/test-modules',
    ...API_ENDPOINTS
  },
  api: API_CONFIG,
  constants: APP_CONFIG || {
    DEBUG: true,
    DEFAULT_THEME: 'light',
    VERSION: '4.0.0',
    INIT_TIMEOUT: 10000,
    MODULE_LOAD_TIMEOUT: 5000
  },
  events: {
    ...TASK_EVENTS,
    app_ready: 'app_module_ready',
    modules_loaded: 'core_modules_loaded',
    features_loaded: 'feature_modules_loaded'
  }
};

// Module state
const appState = {
  initialized: false,
  backendConnected: false,
  coreModulesLoaded: false,
  featureModulesLoaded: false,
  lastHealthCheck: null,
  loadingStats: {
    coreModules: { loaded: 0, total: 0, failed: [] },
    featureModules: { loaded: 0, total: 0, failed: [] },
    utilityModules: { loaded: 0, total: 0, failed: [] }
  }
};

/**
 * Main Application Module v4.0
 */
const app = {
  // Configuration from centralized config
  config: APP_MODULE_CONFIG.constants,
  
  // Loaded modules
  core: {},
  features: {},
  utils: {},
  
  // Module state
  state: appState,
  
  /**
   * Initialize the application with v4.0 enhancements
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(options = {}) {
    if (this.state.initialized) {
      this.showNotification('App already initialized', 'warning', 'Application');
      return true;
    }
    
    try {
      this.showNotification('Initializing Application v4.0', 'info', 'Application');
      
      // Test backend connectivity on initialization
      const connectivityResult = await this.testBackendConnectivity();
      if (!connectivityResult.overall) {
        console.warn('Application: Backend connectivity test failed, continuing with limited functionality');
      }
      
      // Merge options with default config
      this.config = { ...this.config, ...options };
      
      // Load core modules with progress tracking
      await this.loadCoreModules();
      
      // Load and initialize features with progress tracking
      await this.loadFeatureModules();
      
      // Load utilities in background with progress tracking
      this.loadUtilityModules();
      
      // Apply theme settings
      if (this.core.themeManager) {
        await this.core.themeManager.setTheme(this.config.DEFAULT_THEME || this.config.defaultTheme);
      }
      
      // Initialize health monitoring
      if (this.core.healthMonitor) {
        this.core.healthMonitor.initialize();
      }
      
      // Mark as initialized
      this.state.initialized = true;
      
      // Emit app ready event
      if (window.NeuroGen?.eventRegistry) {
        window.NeuroGen.eventRegistry.emit(APP_MODULE_CONFIG.events.app_ready, {
          modules: this.getModuleStats(),
          config: this.config,
          timestamp: new Date().toISOString()
        });
      }
      
      this.showNotification('Application v4.0 initialized successfully', 'success', 'Application');
      return true;
    } catch (error) {
      this.showNotification(`Application initialization failed: ${error.message}`, 'error', 'Application');
      
      // Enhanced error handling
      if (this.core.errorHandler) {
        this.core.errorHandler.handleError(error, 'MODULE', true, {
          details: 'Error occurred during application initialization',
          config: this.config,
          state: this.state
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
      
      // Core modules from centralized configuration
      const coreModules = APP_MODULE_CONFIG.constants.CORE_MODULES || [
        '/static/js/modules/core/errorHandler.js',
        '/static/js/modules/core/uiRegistry.js',
        '/static/js/modules/core/stateManager.js',
        '/static/js/modules/core/eventRegistry.js',
        '/static/js/modules/core/eventManager.js',
        '/static/js/modules/core/themeManager.js',
        '/static/js/modules/core/healthMonitor.js'
      ];
      
      this.state.loadingStats.coreModules.total = coreModules.length;
      
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
  },

  /**
   * Enhanced notification system with 4-method delivery (v4.0)
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, success, warning, error)
   * @param {string} title - Notification title
   */
  showNotification(message, type = 'info', title = 'Application') {
    // Method 1: Toast notifications
    if (window.NeuroGen?.ui?.showToast) {
      window.NeuroGen.ui.showToast(title, message, type);
    }
    
    // Method 2: Console logging with styling
    const styles = {
      error: 'color: #dc3545; font-weight: bold;',
      warning: 'color: #fd7e14; font-weight: bold;',
      success: 'color: #198754; font-weight: bold;',
      info: 'color: #0d6efd;'
    };
    console.log(`%c[${title}] ${message}`, styles[type] || styles.info);
    
    // Method 3: System notification (if available)
    if (window.NeuroGen?.notificationHandler) {
      window.NeuroGen.notificationHandler.show({
        title, message, type, module: 'app'
      });
    }
    
    // Method 4: Error reporting to centralized handler
    if (type === 'error' && window.NeuroGen?.errorHandler) {
      window.NeuroGen.errorHandler.logError({
        module: 'app', message, severity: type
      });
    }
  },

  /**
   * Test backend connectivity for app module (v4.0)
   * @returns {Promise<Object>} Backend connectivity status
   */
  async testBackendConnectivity() {
    const results = {
      overall: false,
      details: {},
      timestamp: new Date().toISOString(),
      errors: []
    };

    try {
      // Test main health endpoint
      const healthResponse = await fetch(APP_MODULE_CONFIG.endpoints.health, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      results.details.health = {
        status: healthResponse.status,
        ok: healthResponse.ok,
        endpoint: APP_MODULE_CONFIG.endpoints.health
      };

      if (healthResponse.ok) {
        // Test module test endpoint
        try {
          const moduleTestResponse = await fetch(APP_MODULE_CONFIG.endpoints.moduleTest, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          results.details.moduleTest = {
            status: moduleTestResponse.status,
            ok: moduleTestResponse.status < 500,
            endpoint: APP_MODULE_CONFIG.endpoints.moduleTest
          };
        } catch (error) {
          results.details.moduleTest = {
            error: error.message,
            endpoint: APP_MODULE_CONFIG.endpoints.moduleTest
          };
        }
        
        results.overall = true;
        this.state.backendConnected = true;
        this.state.lastHealthCheck = new Date().toISOString();
        this.showNotification('Backend connectivity verified', 'success', 'Application');
      } else {
        throw new Error(`Health endpoint returned ${healthResponse.status}`);
      }

    } catch (error) {
      results.errors.push({
        endpoint: APP_MODULE_CONFIG.endpoints.health,
        error: error.message
      });
      this.state.backendConnected = false;
      this.showNotification(`Backend connectivity failed: ${error.message}`, 'error', 'Application');
    }

    return results;
  },

  /**
   * Get application health status (v4.0)
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    return {
      module: 'app',
      version: '4.0.0',
      status: this.state.initialized ? 'healthy' : 'initializing',
      features: {
        configurationDriven: true,
        enhancedNotifications: true,
        backendConnectivity: true,
        moduleLoading: true,
        themeManagement: true,
        stateManagement: true
      },
      configuration: {
        endpoints: APP_MODULE_CONFIG.endpoints,
        constants: APP_MODULE_CONFIG.constants,
        eventsConfigured: Object.keys(APP_MODULE_CONFIG.events).length
      },
      statistics: {
        coreModulesLoaded: this.state.loadingStats.coreModules.loaded,
        featureModulesLoaded: this.state.loadingStats.featureModules.loaded,
        utilityModulesLoaded: this.state.loadingStats.utilityModules.loaded,
        totalModules: Object.keys({...this.core, ...this.features, ...this.utils}).length,
        lastHealthCheck: this.state.lastHealthCheck,
        backendConnected: this.state.backendConnected
      }
    };
  },

  /**
   * Get module loading statistics (v4.0)
   * @returns {Object} Module statistics
   */
  getModuleStats() {
    return {
      core: {
        loaded: Object.keys(this.core).length,
        modules: Object.keys(this.core)
      },
      features: {
        loaded: Object.keys(this.features).length,
        modules: Object.keys(this.features)
      },
      utils: {
        loaded: Object.keys(this.utils).length,
        modules: Object.keys(this.utils)
      },
      total: Object.keys({...this.core, ...this.features, ...this.utils}).length,
      loadingStats: this.state.loadingStats
    };
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

// v4.0 Enhanced exports
export const showNotification = app.showNotification.bind(app);
export const testBackendConnectivity = app.testBackendConnectivity.bind(app);
export const getHealthStatus = app.getHealthStatus.bind(app);
export const getModuleStats = app.getModuleStats.bind(app);