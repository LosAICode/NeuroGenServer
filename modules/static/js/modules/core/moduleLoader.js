/**
 * NeuroGen Server - Enhanced Module Loader v3.1
 * 
 * Provides reliable module loading with robust error handling, dependency management,
 * and graceful fallbacks for the NeuroGen Server frontend.
 * 
 * Version 3.2 Fixes:
 * - Complete solution for circular dependencies using dynamic exports
 * - Fixed module initialization sequence
 * - Enhanced lazy loading for dependent modules
 * - Improved bridge integration for circular dependency resolution
 * - Better proxy handling for module methods before availability
 */

/**
 * Module Loader that handles dynamic module imports with error isolation
 */
const moduleLoader = {
  // Module cache to prevent duplicate imports
  cache: new Map(),
  
  // Module promises to prevent duplicate loading
  loadingPromises: new Map(),
  
  // Loading modules set to detect circular dependencies
  loadingModules: new Set(),
  
  // Failed modules to prevent repeated loading of failed modules
  failedModules: new Set(),
  
  // Fallback modules tracking
  fallbackModules: new Set(),
  
  // Track load attempts for better retry behavior
  loadAttempts: new Map(),
  
  // Module initialization status
  initialized: false,
  
  // Debug mode flag for enhanced logging
  debugMode: false,
  
  // Verbose logging flag for granular logging
  verboseLogging: false,
  
  // Default options for module loading
  defaultOptions: {
    maxRetries: 3,
    timeout: 8000,
    concurrencyLimit: 5,
    ignoreErrors: false,
    skipCache: false,
    standardizeExports: true,
    clearFailedModules: false
  },
  
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
    'module-bridge.js': 'core', // Add module bridge
    'moduleLoaderConfig.js': 'core', // Add config
    
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
    'moduleDiagnostics.js': 'utils',
    'safeFileProcessor.js': 'utils',
    'domUtils.js': 'utils' // Ensure domUtils is included
  },
  
  // Module locations map (inverse mapping for lookup by module name without extension)
  MODULE_TYPES: {},
  
  // Path overrides for specific modules that might be problematic
  PATH_OVERRIDES: {
    './modules/features/webScraper.js': '/static/js/modules/features/webScraper.js',
    './modules/features/academicSearch.js': '/static/js/modules/features/academicSearch.js',
    './modules/features/fileProcessor.js': '/static/js/modules/features/fileProcessor.js',
    './modules/utils/moduleDiagnostics.js': '/static/js/modules/utils/moduleDiagnostics.js',
    './modules/utils/debugTools.js': '/static/js/modules/utils/debugTools.js',
    './modules/utils/ui.js': '/static/js/modules/utils/ui.js',
    './modules/features/historyManager.js': '/static/js/modules/features/historyManager.js',
    './modules/utils/progressHandler.js': '/static/js/modules/utils/progressHandler.js',
    './modules/utils/socketHandler.js': '/static/js/modules/utils/socketHandler.js',
    './modules/utils/domUtils.js': '/static/js/modules/utils/domUtils.js', // Add domUtils path
    'ui.js': '/static/js/modules/utils/ui.js',
    'progressHandler.js': '/static/js/modules/utils/progressHandler.js',
    'socketHandler.js': '/static/js/modules/utils/socketHandler.js',
    'fileProcessor.js': '/static/js/modules/features/fileProcessor.js',
    'webScraper.js': '/static/js/modules/features/webScraper.js',
    'academicSearch.js': '/static/js/modules/features/academicSearch.js',
    'historyManager.js': '/static/js/modules/features/historyManager.js',
    'playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
    './modules/features/playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
    './playlistDownloader.js': '/static/js/modules/features/playlistDownloader.js',
    'domUtils.js': '/static/js/modules/utils/domUtils.js'
  },
  
  // OPTIMIZED INITIALIZATION ORDER - Carefully ordered to prevent circular dependencies
  INITIALIZATION_ORDER: [
    'module-bridge.js',    // Load module bridge first
    'errorHandler.js',     // Load error handler second
    'domUtils.js',         // Load domUtils early since it has no dependencies
    'uiRegistry.js',
    'stateManager.js',
    'eventRegistry.js',
    'eventManager.js',
    'themeManager.js',
    'socketHandler.js',    // Load before progressHandler
    'progressHandler.js',  // Load before UI
    'ui.js',               // Load after its dependencies
    'fileProcessor.js',
    'webScraper.js',
    'academicSearch.js'
  ],
  
  // Module dependencies - inform moduleLoader about dependencies
  // FIXED DEPENDENCIES to prevent circular refs
  MODULE_DEPENDENCIES: {
    'module-bridge.js': [],
    'domUtils.js': [],
    'errorHandler.js': [],
    'uiRegistry.js': ['errorHandler.js'],
    'stateManager.js': ['errorHandler.js'],
    'eventRegistry.js': ['errorHandler.js'],
    'eventManager.js': ['errorHandler.js', 'eventRegistry.js'],
    'themeManager.js': ['errorHandler.js', 'uiRegistry.js'],
    'socketHandler.js': ['errorHandler.js', 'domUtils.js', 'module-bridge.js'],
    'progressHandler.js': ['errorHandler.js', 'domUtils.js', 'module-bridge.js', 'socketHandler.js'],
    'ui.js': ['errorHandler.js', 'domUtils.js', 'module-bridge.js', 'uiRegistry.js'],
    'fileProcessor.js': ['domUtils.js', 'module-bridge.js', 'progressHandler.js'],
    'webScraper.js': ['domUtils.js', 'module-bridge.js', 'progressHandler.js'],
    'academicSearch.js': ['module-bridge.js', 'domUtils.js', 'progressHandler.js']
  },
  
  // Expected method exports for common modules to auto-create missing exports
  MODULE_EXPORTS: {
    'ui.js': ['showToast', 'showModal', 'hideModal', 'showLoadingSpinner', 'updateProgressBar', 
              'toggleElementVisibility', 'createElement', 'getElement', 'findElement'],
    'progressHandler.js': ['trackProgress', 'updateProgressUI', 'setupTaskProgress', 'cancelTracking', 
                          'createProgressUI', 'updateTaskProgress', 'completeTask', 'errorTask'],
    'socketHandler.js': ['connect', 'disconnect', 'emit', 'isConnected', 'startStatusPolling', 
                        'stopStatusPolling', 'cancelTask', 'registerTaskHandler'],
    'domUtils.js': ['getElement', 'getElements', 'getUIElements', 'createElement', 
                   'addEventListeners', 'toggleElementVisibility']
  },
  
  // Methods that can safely return a Promise when called before module is loaded
  ASYNC_SAFE_METHODS: {
    'ui.js': ['showModal', 'showToast', 'showLoadingSpinner', 'createProgressBar'],
    'progressHandler.js': ['setupTaskProgress', 'trackProgress', 'cancelTracking'],
    'socketHandler.js': ['connect', 'startStatusPolling', 'stopStatusPolling', 'cancelTask']
  },
  
  // CIRCULAR DEPENDENCY BREAKERS
  // Use these proxies to break circular dependencies
  proxyHandlers: new Map(),
  
  // Exported module proxies for circular dependency resolution
  moduleProxies: new Map(),
  
  /**
   * Initialize the module types map
   */
  init() {
    // Initialize MODULE_TYPES based on MODULE_LOCATIONS
    Object.entries(this.MODULE_LOCATIONS).forEach(([file, location]) => {
      const moduleName = file.replace(/\.js$/, '');
      this.MODULE_TYPES[moduleName] = location;
    });
    
    // Create sets for tracking module state
    this.failedModules = new Set();
    this.fallbackModules = new Set();
    this.loadingModules = new Set();
    
    // Initialize diagnostics data structure
    this.diagnostics = {
      totalModules: 0,
      failedModules: [],
      fallbacksUsed: [],
      retries: {},
      timestamp: new Date().toISOString(),
      browser: navigator.userAgent,
      moduleCache: []
    };
    
    return true;
  },
  
  /**
   * Create a proxy for a module to break circular dependencies
   * @param {string} moduleName - Name of the module to proxy
   * @returns {Proxy} - Proxy object that will forward to the real module when loaded
   */
  createModuleProxy(moduleName) {
    // Don't create duplicate proxies
    if (this.moduleProxies.has(moduleName)) {
      return this.moduleProxies.get(moduleName);
    }
    
    // Track method calls that happen before the real module is loaded
    const pendingCalls = [];
    const pendingGetters = new Map();
    
    // Create a handler that will forward calls to the real module when it's loaded
    const handler = {
      get: (target, prop) => {
        // If the real module is loaded, forward to it
        if (target.__realModule) {
          // Handle function calls by binding to the real module to preserve 'this'
          if (typeof target.__realModule[prop] === 'function') {
            return target.__realModule[prop].bind(target.__realModule);
          }
          return target.__realModule[prop];
        }
        
        // Otherwise, return a function that records the call for later
        if (typeof prop === 'string' && prop !== 'then') {
          // Check if we already created a proxy for this property
          if (pendingGetters.has(prop)) {
            return pendingGetters.get(prop);
          }
          
          // Create a proxy function that records the call
          const proxyFn = (...args) => {
            console.log(`[Proxy] Call to ${moduleName}.${prop} recorded for later execution`);
            pendingCalls.push({ method: prop, args });
            
            // Determine if this method should return a promise
            const asyncSafeMethods = this.ASYNC_SAFE_METHODS[`${moduleName}.js`] || [];
            if (asyncSafeMethods.includes(prop)) {
              return Promise.resolve(null);
            }
            return undefined;
          };
          
          // Store the proxy function for reuse
          pendingGetters.set(prop, proxyFn);
          return proxyFn;
        }
        
        // Handle Promise methods to make the proxy thenable
        if (prop === 'then') {
          // Return a function that resolves with the proxy itself
          return (resolve) => {
            if (resolve) resolve(target);
            return Promise.resolve(target);
          };
        }
        
        return undefined;
      },
      
      // Handle setting properties
      set: (target, prop, value) => {
        // If the real module is loaded, set properties on it
        if (target.__realModule) {
          target.__realModule[prop] = value;
        } else {
          // Otherwise, store pendingSetters for later
          target.__pendingSetters = target.__pendingSetters || [];
          target.__pendingSetters.push({ prop, value });
        }
        return true;
      }
    };
    
    // Create the proxy object with metadata
    const proxy = new Proxy({ 
      __moduleName: moduleName,
      __pendingCalls: pendingCalls,
      __pendingGetters: pendingGetters,
      __realModule: null,
      __isProxy: true
    }, handler);
    
    // Store the proxy handler for updating later
    this.proxyHandlers.set(moduleName, {
      proxy,
      updateRealModule: (realModule) => {
        // Update the real module reference
        proxy.__realModule = realModule;
        
        // Apply any pending setters
        if (proxy.__pendingSetters && proxy.__pendingSetters.length > 0) {
          proxy.__pendingSetters.forEach(({ prop, value }) => {
            try {
              realModule[prop] = value;
            } catch (e) {
              console.error(`Error applying pending setter for ${moduleName}.${prop}:`, e);
            }
          });
          proxy.__pendingSetters = [];
        }
        
        // Execute all pending calls now that we have the real module
        pendingCalls.forEach(call => {
          if (typeof realModule[call.method] === 'function') {
            try {
              realModule[call.method](...call.args);
            } catch (e) {
              console.error(`Error executing pending call to ${moduleName}.${call.method}:`, e);
            }
          }
        });
        
        // Clear pending calls
        pendingCalls.length = 0;
        
        console.log(`[Proxy] Module ${moduleName} proxy updated with real implementation`);
      }
    });
    
    // Store the proxy for future use
    this.moduleProxies.set(moduleName, proxy);
    
    // Make available globally for module-bridge access if in debug mode
    if (this.debugMode) {
      window.__moduleProxies = this.moduleProxies;
    }
    
    return proxy;
  },
  
  /**
   * Update a module proxy with the real module
   * @param {string} moduleName - Name of the module to update
   * @param {Object} realModule - The real module implementation
   */
  updateModuleProxy(moduleName, realModule) {
    const handler = this.proxyHandlers.get(moduleName);
    if (handler) {
      handler.updateRealModule(realModule);
      
      // If this module has a bridge updater, use it
      this.integrateWithBridge(moduleName, realModule);
    }
  },
  
  /**
   * Integrate with module bridge to handle circular dependencies
   * @param {string} moduleName - Module name
   * @param {Object} moduleExport - Module export object
   */
  integrateWithBridge(moduleName, moduleExport) {
    if (!moduleName || !moduleExport) return;
    
    try {
      // Import the bridge module only when needed to avoid circular dependencies
      import('./module-bridge.js').then(bridge => {
        const cleanName = this.getModuleName(moduleName);
        
        // Update appropriate bridge based on module name
        switch (cleanName) {
          case 'ui':
            if (typeof bridge.updateUIBridge === 'function') {
              bridge.updateUIBridge(moduleExport, { source: 'moduleLoader' });
              console.log("UI bridge updated with real implementation");
            }
            break;
          case 'progressHandler':
            if (typeof bridge.updateProgressHandlerBridge === 'function') {
              bridge.updateProgressHandlerBridge(moduleExport, { source: 'moduleLoader' });
              console.log("ProgressHandler bridge updated with real implementation");
            }
            break;
          case 'socketHandler':
            if (typeof bridge.updateSocketHandlerBridge === 'function') {
              bridge.updateSocketHandlerBridge(moduleExport, { source: 'moduleLoader' });
              console.log("SocketHandler bridge updated with real implementation");
            }
            break;
          default:
            // No bridge integration needed for this module
            break;
        }
      }).catch(error => {
        console.warn(`Error integrating ${moduleName} with bridge:`, error);
      });
    } catch (error) {
      console.warn(`Error importing bridge for module ${moduleName}:`, error);
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
    
    // Create proxies for modules that are involved in circular dependencies
    this.createProxiesForCircularDependencies();
    
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
    
    // Mark as initialized
    this.initialized = true;
    
    // Start collecting diagnostics
    this.startDiagnostics();
    
    return true;
  },
  
  /**
   * Configure the module loader
   * @param {Object} options - Configuration options
   */
  configure(options = {}) {
    // Update debug mode
    if (options.debugMode !== undefined) {
      this.debugMode = !!options.debugMode;
    }
    
    // Update verbose logging
    if (options.verboseLogging !== undefined) {
      this.verboseLogging = !!options.verboseLogging;
    }
    
    // Update default options
    if (options.defaultOptions) {
      this.defaultOptions = {
        ...this.defaultOptions,
        ...options.defaultOptions
      };
    }
    
    // Update other configuration options as needed
    // ...
  },
  
  /**
   * Create proxies for modules involved in circular dependencies
   */
  createProxiesForCircularDependencies() {
    // Create proxies for modules that typically cause circular dependencies
    this.createModuleProxy('ui');
    this.createModuleProxy('progressHandler');
    this.createModuleProxy('socketHandler');
    this.createModuleProxy('uiRegistry');
    this.createModuleProxy('fileProcessor');
    this.createModuleProxy('webScraper');
    this.createModuleProxy('academicSearch');
    this.createModuleProxy('domUtils');
    
    console.log('Created proxies for circular dependency resolution');
  },
  
  /**
   * Start collecting diagnostics information
   */
  startDiagnostics() {
    this.diagnostics = {
      totalModules: 0,
      failedModules: [],
      fallbacksUsed: [],
      retries: {},
      timestamp: new Date().toISOString(),
      browser: navigator.userAgent,
      moduleCache: []
    };
  },
  
  /**
   * Generate a diagnostic report for troubleshooting
   * @returns {Object} - Diagnostic report
   */
  generateDiagnosticsReport() {
    // Add cached modules to diagnostics
    this.diagnostics.moduleCache = Array.from(this.cache.keys());
    
    // Add failed modules
    this.diagnostics.failedModules = Array.from(this.failedModules);
    
    // Return the complete report
    return {
      ...this.diagnostics,
      timestamp: new Date().toISOString(),
      status: this.failedModules.size > 0 ? 'issues' : 'ok',
      initialized: this.initialized,
      moduleSystemHealth: this.initialized ? 'ok' : 'error',
      totalModules: this.cache.size
    };
  },
  
  /**
   * Create a diagnostics button for easy debugging
   */
  createDiagnosticsButton() {
    // Check if button already exists
    if (document.getElementById('module-diagnostics-btn')) {
      return;
    }
    
    // Create button
    const button = document.createElement('button');
    button.id = 'module-diagnostics-btn';
    button.className = 'btn btn-info position-fixed bottom-0 start-0 m-3';
    button.innerHTML = '<i class="fas fa-stethoscope me-2"></i>Module Diagnostics';
    button.style.zIndex = '9999';
    button.style.borderRadius = '4px';
    button.style.padding = '8px 16px';
    button.style.fontSize = '14px';
    button.style.opacity = '0.7';
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.opacity = '0.7';
    });
    
    // Add click handler
    button.addEventListener('click', () => {
      this.launchDiagnostics();
    });
    
    // Add to document
    document.body.appendChild(button);
  },
  
  /**
     * Launch diagnostics tool
     */
  launchDiagnostics() {
    // Generate report
    const report = this.generateDiagnosticsReport();
    console.log("Module Diagnostics Report:", report);
    
    // Try to show a dialog with this information
    if (window.ui && typeof window.ui.showModal === 'function') {
      let reportContent = `<h5>System Health Report</h5>
      <div class="mb-3">
        <p><strong>Status:</strong> <span class="badge ${report.status === 'ok' ? 'bg-success' : 'bg-warning'}">${report.status}</span></p>
        <p><strong>App Initialized:</strong> ${window.appInitialized ? 'Yes' : 'No'}</p>
        <p><strong>Module System Health:</strong> ${report.moduleSystemHealth}</p>
        <p><strong>Timestamp:</strong> ${report.timestamp}</p>
      </div>
      <h6>Loaded Modules (${report.moduleCache.length})</h6>
      <div class="small overflow-auto" style="max-height: 150px;">
        <ul class="small">
          ${report.moduleCache.map(m => `<li>${m}</li>`).join('')}
        </ul>
      </div>`;
      
      if (report.failedModules && report.failedModules.length > 0) {
        reportContent += `<h6 class="text-danger">Failed Modules (${report.failedModules.length})</h6>
        <div class="small overflow-auto" style="max-height: 100px;">
          <ul class="small text-danger">
            ${report.failedModules.map(m => `<li>${m}</li>`).join('')}
          </ul>
        </div>`;
      }
      
      if (report.fallbacksUsed && report.fallbacksUsed.length > 0) {
        reportContent += `<h6 class="text-warning">Using Fallbacks (${report.fallbacksUsed.length})</h6>
        <div class="small overflow-auto" style="max-height: 100px;">
          <ul class="small text-warning">
            ${report.fallbacksUsed.map(m => `<li>${m}</li>`).join('')}
          </ul>
        </div>`;
      }
      
      window.ui.showModal({
        title: 'Module Diagnostics',
        content: reportContent,
        size: 'large',
        buttons: [
          {
            text: 'Close',
            type: 'btn-secondary'
          },
          {
            text: 'Copy Report',
            type: 'btn-primary',
            handler: () => {
              try {
                navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                window.ui.showToast('Success', 'Report copied to clipboard', 'success');
              } catch (e) {
                console.error('Failed to copy report:', e);
                window.ui.showToast('Error', 'Failed to copy report', 'error');
              }
            }
          },
          {
            text: 'Fix Failed Modules',
            type: 'btn-warning',
            handler: () => {
              this.fixFailedModules();
              window.ui.showToast('Info', 'Failed modules have been reset', 'info');
              setTimeout(() => {
                this.launchDiagnostics();
              }, 500);
            }
          }
        ]
      });
    } else {
      alert("Module Diagnostics Report - see console for details");
    }
  },

  /**
   * Display a health report indicator in UI
   */
  showModuleHealth() {
    const moduleHealthContainer = document.createElement('div');
    moduleHealthContainer.id = 'module-health-container';
    moduleHealthContainer.className = 'position-fixed top-0 end-0 p-3';
    moduleHealthContainer.style.zIndex = '9999';
    
    const failedCount = this.failedModules.size;
    const fallbackCount = this.fallbackModules.size;
    
    const statusClass = failedCount > 0 ? 'bg-danger' : 
                        fallbackCount > 0 ? 'bg-warning' : 'bg-success';
    
    moduleHealthContainer.innerHTML = `
      <div class="module-health-indicator ${statusClass}" style="padding: 8px 16px; border-radius: 4px; display: inline-block; cursor: pointer;">
        <i class="fas fa-cogs me-2"></i>
        <span>Modules: ${failedCount > 0 ? `${failedCount} Failed` : 
                        fallbackCount > 0 ? `${fallbackCount} Fallbacks` : 'Healthy'}</span>
      </div>
    `;
    
    // Add click handler
    moduleHealthContainer.querySelector('.module-health-indicator').addEventListener('click', () => {
      this.launchDiagnostics();
    });
    
    document.body.appendChild(moduleHealthContainer);
    
    return moduleHealthContainer;
  },

  /**
   * Apply stored theme to the document
   */
  applyStoredTheme() {
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
  },

  /**
   * Set up basic tab navigation for the application
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
   * @param {string} message - The error message to display
   */
  showErrorMessage(message) {
    console.error(message);
    
    // Try to use error handler if available
    if (window.errorHandler && typeof window.errorHandler.showError === 'function') {
      window.errorHandler.showError(message);
      return;
    }
    
    // Try to use UI module if available
    const uiModule = window.ui || window.moduleInstances?.ui;
    if (uiModule && typeof uiModule.showToast === 'function') {
      uiModule.showToast('Error', message, 'error');
      return;
    }
    
    // Fallback to error container
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
   * Check if browser supports ES modules
   * @returns {boolean} - Whether the browser supports ES modules
   */
  supportsESModules() {
    try {
      new Function('import("")');
      return true;
    } catch (err) {
      console.error("Browser doesn't support ES modules", err);
      return false;
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
   * Normalize path for consistent caching
   * @param {string} path - The path to normalize
   * @returns {string} - Normalized path
   */
  getNormalizedPath(path) {
    if (!path) return '';
    
    // First clean the path by removing any trailing numbers (e.g., "ui.js 2" -> "ui.js")
    const cleanPath = this.cleanModulePath(path);
    // Then strip query params and normalize slashes
    return cleanPath.split('?')[0].replace(/\/+/g, '/');
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
    
    // Log for debugging if in verbose mode
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
    
    // Check for direct path override
    if (this.PATH_OVERRIDES[cleanPath]) {
      return this.PATH_OVERRIDES[cleanPath];
    }
    
    // Handle relative paths starting with ./
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
    
    // For a simple path like 'ui.js', try to resolve it using MODULE_LOCATIONS
    if (cleanPath.endsWith('.js')) {
      const location = this.MODULE_LOCATIONS[cleanPath];
      if (location) {
        return `/static/js/modules/${location}/${cleanPath}`;
      }
    }
    
    // For module name without extension
    const moduleNameNoExt = cleanPath.replace(/\.js$/, '');
    const locationType = this.MODULE_TYPES[moduleNameNoExt];
    if (locationType) {
      return `/static/js/modules/${locationType}/${moduleNameNoExt}.js`;
    }
    
    // Default return the path unchanged
    return cleanPath;
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
   * Check for duplicate function declarations in a module's code
   * This can be used to fix the common "redeclaration of function" SyntaxError
   * @param {string} modulePath - Path to the module
   * @returns {Promise<{hasDuplicates: boolean, duplicateFunctions: Array<string>}>} Results of check
   */
  async checkForDuplicateFunctions(modulePath) {
    try {
      // Fetch the module content
      const response = await fetch(modulePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch module at ${modulePath}: ${response.status}`);
      }
      
      const code = await response.text();
      
      // Find all function declarations
      const functionDeclarations = new Map();
      const duplicates = [];
      
      // First look for regular function declarations: function name() {}
      const functionRegex = /function\s+([a-zA-Z0-9_$]+)\s*\(/g;
      let match;
      
      while ((match = functionRegex.exec(code)) !== null) {
        const functionName = match[1];
        
        if (functionDeclarations.has(functionName)) {
          duplicates.push({
            name: functionName,
            firstPosition: functionDeclarations.get(functionName),
            secondPosition: match.index,
            type: 'function declaration'
          });
        } else {
          functionDeclarations.set(functionName, match.index);
        }
      }
      
      // Also check for class method declarations that might conflict
      const classMethodRegex = /(?:class\s+[a-zA-Z0-9_$]+\s*\{[^}]*|\{)\s*([a-zA-Z0-9_$]+)\s*\(/g;
      functionRegex.lastIndex = 0; // Reset regex index
      
      while ((match = classMethodRegex.exec(code)) !== null) {
        const methodName = match[1];
        
        // Skip constructor and common non-conflicting methods
        if (methodName === 'constructor' || methodName === 'toString' || methodName === 'valueOf') {
          continue;
        }
        
        if (functionDeclarations.has(methodName)) {
          duplicates.push({
            name: methodName,
            firstPosition: functionDeclarations.get(methodName),
            secondPosition: match.index,
            type: 'class method conflict'
          });
        }
      }
      
      // Check for arrow functions assigned to variables that might conflict
      const arrowFunctionRegex = /const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/g;
      
      while ((match = arrowFunctionRegex.exec(code)) !== null) {
        const functionName = match[1];
        
        if (functionDeclarations.has(functionName)) {
          duplicates.push({
            name: functionName,
            firstPosition: functionDeclarations.get(functionName),
            secondPosition: match.index,
            type: 'arrow function conflict'
          });
        }
      }
      
      return {
        hasDuplicates: duplicates.length > 0,
        duplicateFunctions: duplicates,
        modulePath
      };
    } catch (error) {
      console.error(`Error checking for duplicate functions in ${modulePath}:`, error);
      return {
        hasDuplicates: false,
        duplicateFunctions: [],
        error: error.message,
        modulePath
      };
    }
  },

  /**
   * Create a fallback for any type of module
   * @param {string} moduleName - The name of the module
   * @returns {Object} - A fallback implementation
   */
  createFallbackModule(moduleName) {
    if (!moduleName) {
      console.error('Cannot create fallback for undefined module name');
      return {
        __isFallback: true,
        initialize() { return Promise.resolve(true); }
      };
    }
    
    console.warn(`Creating fallback for module ${moduleName}`);
    
    // Record this fallback creation in diagnostics
    this.fallbackModules.add(moduleName);
    this.diagnostics.fallbacksUsed.push(moduleName);
    
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
          error: 'Module type unknown, using generic fallback',
          
          initialize() {
            console.warn(`Using generic fallback implementation for ${moduleName}`);
            return Promise.resolve(true);
          }
        };
    }
    
    // Return a proxy to handle missing methods dynamically
    return new Proxy(fallback, this.createPromiseAwareProxyHandler(moduleName));
  },

  /**
   * Create a proxy handler that gracefully handles promise methods
   * @param {string} moduleName - Name of the module
   * @returns {Object} - Proxy handler
   */
  createPromiseAwareProxyHandler(moduleName) {
    return {
      get: (target, prop) => {
        // Return the property if it exists
        if (prop in target) return target[prop];
        
        // Special handling for then/catch/finally to make it Promise-compatible
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
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
        
        // Check if this method is in the ASYNC_SAFE_METHODS list
        const asyncSafeMethods = this.ASYNC_SAFE_METHODS[`${moduleName}.js`] || [];
        const isAsyncSafe = asyncSafeMethods.includes(String(prop));
        
        // For functions, create a fallback function
        if (typeof prop === 'string' && !prop.startsWith('_')) {
          return function(...args) {
            console.warn(`[Fallback ${moduleName}] ${String(prop)} called with args:`, args);
            
            // Return a promise for async-safe methods
            if (isAsyncSafe) {
              return Promise.resolve(null);
            }
            
            // Return null for regular methods
            return null;
          };
        }
        
        return undefined;
      }
    };
  },

  /**
   * Create a fallback for core modules
   * @param {string} moduleName - The name of the module
   * @returns {Object} - A fallback implementation
   */
  createCoreFallback(moduleName) {
    // Use consistent naming without .js extension
    const cleanName = moduleName.replace(/\.js$/, '');
    
    // Basic fallback that all modules share
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
    
    // Add module-specific fallbacks for core modules
    switch (cleanName) {
      case 'errorHandler':
        return {
          ...baseFallback,
          errorHistory: [],
          
          handleError(error) {
            console.error('Fallback error handler:', error);
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
          }
        };
        
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
          
        case 'themeManager':
          return {
            ...baseFallback,
            currentTheme: 'light',
            
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
              
              return true;
            },
            
            toggleTheme() {
              const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
              return this.setTheme(newTheme);
            },
            
            getCurrentTheme() {
              return this.currentTheme;
            }
          };
          
        case 'eventManager':
          return {
            ...baseFallback,
            eventRegistry: null,
            delegatedEvents: new Map(),
            
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
            }
          };
        
        case 'module-bridge':
          return {
            ...baseFallback,
            
            uiBridge: {
              showToast: (title, message, type = 'info') => {
                console.log(`[Bridge Fallback] Toast: ${title} - ${message} (${type})`);
                return null;
              },
              showLoadingSpinner: (message = 'Loading...') => {
                console.log(`[Bridge Fallback] Loading: ${message}`);
                return {
                  hide: () => {},
                  updateMessage: () => {},
                  updateProgress: () => {}
                };
              },
              createElement: (tag, attrs = {}, parent = null) => {
                console.log(`[Bridge Fallback] Creating element: ${tag}`);
                return document.createElement(tag);
              },
              getElement: (selector) => {
                return document.querySelector(selector);
              }
            },
            
            progressHandlerBridge: {
              setupTaskProgress: (taskId, options = {}) => {
                console.log(`[Bridge Fallback] Setting up progress for task: ${taskId}`);
                return {
                  updateProgress: () => {},
                  complete: () => {},
                  error: () => {}
                };
              },
              trackProgress: () => {},
              updateProgressUI: () => {},
              createProgressUI: () => {}
            },
            
            socketHandlerBridge: {
              connect: () => Promise.resolve(false),
              disconnect: () => Promise.resolve(true),
              emit: () => false,
              isConnected: () => false,
              startStatusPolling: () => {},
              stopStatusPolling: () => {},
              cancelTask: () => Promise.resolve({success: false})
            },
            
            updateUIBridge(realUI) {
              console.log('[Bridge Fallback] updateUIBridge called');
              return true;
            },
            
            updateProgressHandlerBridge(realHandler) {
              console.log('[Bridge Fallback] updateProgressHandlerBridge called');
              return true;
            },
            
            updateSocketHandlerBridge(realHandler) {
              console.log('[Bridge Fallback] updateSocketHandlerBridge called');
              return true;
            }
          };
          
        default:
          return baseFallback;
        }
      },
        
  /**
   * Create a fallback for feature modules
         * @param {string} moduleName - The name of the module
         * @returns {Object} - A fallback implementation
         */
        createFeatureFallback(moduleName) {
          // Use consistent naming without .js extension
          const cleanName = moduleName.replace(/\.js$/, '');
          
          // Basic fallback that all modules share
          const baseFallback = {
            __isFallback: true,
            moduleName: cleanName,
            initialized: false,
            
            initialize() {
              console.warn(`Using fallback implementation for feature: ${cleanName}`);
              this.initialized = true;
              return Promise.resolve(true);
            }
          };
          
          // Add module-specific fallbacks for features
          switch (cleanName) {
            case 'webScraper':
              return {
                ...baseFallback,
                
                handleStartScraping() {
                  console.warn("Scraping not available (fallback module)");
                  return Promise.resolve(false);
                },
                
                handleCancelScraping() {
                  return Promise.resolve(false);
                },
                
                showForm() {
                  const formContainer = document.getElementById('scraper-form-container');
                  const progressContainer = document.getElementById('scraper-progress-container');
                  const resultsContainer = document.getElementById('scraper-results-container');
                  
                  if (formContainer) formContainer.style.display = 'block';
                  if (progressContainer) progressContainer.style.display = 'none';
                  if (resultsContainer) resultsContainer.style.display = 'none';
                  
                  // Add warning message
                  if (formContainer && !formContainer.querySelector('.fallback-warning')) {
                    const warningAlert = document.createElement('div');
                    warningAlert.className = 'alert alert-warning mb-3 fallback-warning';
                    warningAlert.innerHTML = `<strong>WebScraper module unavailable</strong>
                      <p>The web scraper functionality is currently unavailable. Please try refreshing the page.</p>`;
                    formContainer.prepend(warningAlert);
                  }
                  
                  return true;
                },
                
                showProgress() {
                  const formContainer = document.getElementById('scraper-form-container');
                  const progressContainer = document.getElementById('scraper-progress-container');
                  const resultsContainer = document.getElementById('scraper-results-container');
                  
                  if (formContainer) formContainer.style.display = 'none';
                  if (progressContainer) progressContainer.style.display = 'block';
                  if (resultsContainer) resultsContainer.style.display = 'none';
                  
                  return true;
                }
              };
              
            case 'academicSearch':
              return {
                ...baseFallback,
                
                search() {
                  console.warn("Academic search not available (fallback module)");
                  return Promise.resolve(false);
                },
                
                performSearch() {
                  return Promise.resolve(false);
                },
                
                getDetails() {
                  return Promise.resolve(null);
                },
                
                downloadPaper() {
                  return Promise.resolve(false);
                }
              };
              
            case 'fileProcessor':
              return {
                ...baseFallback,
                
                processFiles() {
                  console.warn("File processing not available (fallback module)");
                  return Promise.resolve(false);
                },
                
                handleUpload() {
                  return false;
                },
                
                cancelProcessing() {
                  return false;
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
                  if (formContainer && !formContainer.querySelector('.fallback-warning')) {
                    const warningAlert = document.createElement('div');
                    warningAlert.className = 'alert alert-warning mb-3 fallback-warning';
                    warningAlert.innerHTML = `<strong>File processor module unavailable</strong>
                      <p>The file processor functionality is currently unavailable. Please try refreshing the page.</p>`;
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
                  
                  return true;
                }
              };
              
            case 'playlistDownloader':
              return this.createPlaylistDownloaderFallback();
              
            default:
              return baseFallback;
          }
        },
        
        /**
         * Create a fallback for utility modules
         * @param {string} moduleName - The name of the module
         * @returns {Object} - A fallback implementation
         */
        createUtilityFallback(moduleName) {
          // Use consistent naming without .js extension
          const cleanName = moduleName.replace(/\.js$/, '');
          
          // Basic fallback that all modules share
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
          
          // Add module-specific fallbacks for utilities
          switch (cleanName) {
            case 'ui':
              return {
                ...baseFallback,
                
                showToast(title, message, type = 'info') {
                  console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
                  
                  // Try to create toast if container exists
                  const toastContainer = document.getElementById('toast-container') || document.createElement('div');
                  if (!toastContainer.id) {
                    toastContainer.id = 'toast-container';
                    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                    document.body.appendChild(toastContainer);
                  }
                  
                  const toast = document.createElement('div');
                  toast.className = 'toast fade show';
                  
                  // Choose color based on type
                  let headerClass = 'bg-primary';
                  if (type === 'error' || type === 'danger') headerClass = 'bg-danger';
                  if (type === 'success') headerClass = 'bg-success';
                  if (type === 'warning') headerClass = 'bg-warning';
                  
                  toast.innerHTML = `
                    <div class="toast-header ${headerClass} text-white">
                      <strong class="me-auto">${title}</strong>
                      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                    </div>
                    <div class="toast-body">${message}</div>
                  `;
                  
                  toastContainer.appendChild(toast);
                  
                  // Auto-remove toast after 5 seconds
                  setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 150);
                  }, 5000);
                },
                
                showLoading(message = 'Loading...', options = {}) {
                  const loadingId = 'loading-' + Date.now();
                  
                  // Create loading container if needed
                  let loadingContainer = document.getElementById('loading-container');
                  if (!loadingContainer) {
                    loadingContainer = document.createElement('div');
                    loadingContainer.id = 'loading-container';
                    loadingContainer.className = 'position-fixed top-0 left-0 w-100 h-100 d-flex justify-content-center align-items-center';
                    loadingContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    loadingContainer.style.zIndex = '9999';
                    document.body.appendChild(loadingContainer);
                  }
                  
                  // Create loading element
                  const loadingEl = document.createElement('div');
                  loadingEl.id = loadingId;
                  loadingEl.className = 'bg-white p-4 rounded shadow text-center';
                  loadingEl.innerHTML = `
                    <div class="spinner-border text-primary mb-3" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="loading-message">${message}</div>
                  `;
                  
                  loadingContainer.appendChild(loadingEl);
                  
                  return { 
                    hide: () => {
                      const el = document.getElementById(loadingId);
                      if (el) el.remove();
                      
                      // Hide container if no more loaders
                      if (loadingContainer.children.length === 0) {
                        loadingContainer.style.display = 'none';
                      }
                    },
                    updateMessage: (newMessage) => {
                      const el = document.getElementById(loadingId);
                      if (el) {
                        const messageEl = el.querySelector('.loading-message');
                        if (messageEl) messageEl.textContent = newMessage;
                      }
                    }
                  };
                },
                
                hideLoading() {
                  const loadingContainer = document.getElementById('loading-container');
                  if (loadingContainer) {
                    loadingContainer.style.display = 'none';
                    loadingContainer.innerHTML = '';
                  }
                  return true;
                },
                
                updateProgressBar(id, progress) {
                  const progressBar = document.getElementById(id);
                  if (!progressBar) return;
                  
                  const percent = Math.round(progress);
                  progressBar.style.width = `${percent}%`;
                  progressBar.setAttribute('aria-valuenow', percent);
                  progressBar.textContent = `${percent}%`;
                },
                
                updateProgressStatus(id, message) {
                  const statusElement = document.getElementById(id);
                  if (!statusElement) return;
                  
                  statusElement.textContent = message;
                },
                
                showModal(options) {
                  console.log(`MODAL: ${options.title || 'Modal'}`);
                  // Simplified fallback just showing alert
                  alert(options.content || 'Modal content');
                  return {
                    id: 'fallback-modal',
                    hide: () => {},
                    updateContent: () => {},
                    updateTitle: () => {},
                    addButton: () => {}
                  };
                }
              };
              
            case 'socketHandler':
              return {
                ...baseFallback,
                
                connect() {
                  console.warn("Socket connection not available (fallback module)");
                  return Promise.resolve(false);
                },
                
                disconnect() {
                  return Promise.resolve(true);
                },
                
                emit() {
                  return false;
                },
                
                on() {
                  return () => {}; // Return unsubscribe function
                },
                
                isConnected() {
                  return false;
                },
                
                startStatusPolling() {
                  console.warn("Status polling not available (fallback module)");
                  return false;
                },
                
                stopStatusPolling() {
                  return true;
                },
                
                cancelTask() {
                  console.warn("Task cancellation not available (fallback module)");
                  return Promise.resolve({success: false, message: "Module unavailable"});
                }
              };
              
            case 'progressHandler':
              return {
                ...baseFallback,
                
                setupTaskProgress(taskId, options = {}) {
                  console.warn(`Setting up fallback progress tracking for task ${taskId}`);
                  
                  return {
                    updateProgress: (progress, message) => {
                      console.log(`Task ${taskId} progress: ${progress}% - ${message || ''}`);
                      
                      // Try to update UI if elements exist
                      const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
                      const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
                      
                      if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                        progressBar.setAttribute('aria-valuenow', progress);
                      }
                      
                      if (progressStatus && message) {
                        progressStatus.textContent = message;
                      }
                    },
                    complete: (result) => {
                      console.log(`Task ${taskId} completed with result:`, result);
                      
                      // Try to update UI
                      const progressBar = document.getElementById(`${options.elementPrefix || ''}progress-bar`);
                      
                      if (progressBar) {
                        progressBar.style.width = `100%`;
                        progressBar.setAttribute('aria-valuenow', 100);
                        progressBar.classList.add('bg-success');
                      }
                    },
                    error: (error) => {
                      console.error(`Task ${taskId} error:`, error);
                      
                      // Try to update UI
                      const progressStatus = document.getElementById(`${options.elementPrefix || ''}progress-status`);
                      
                      if (progressStatus) {
                        progressStatus.textContent = `Error: ${error.message || error}`;
                        progressStatus.classList.add('text-danger');
                      }
                    }
                  };
                },
                
                trackProgress(taskId, options = {}) {
                  return this.setupTaskProgress(taskId, options);
                },
                
                createProgressUI(containerId, prefix = '') {
                  console.warn(`Creating fallback progress UI in ${containerId} with prefix ${prefix}`);
                  // This would typically create progress elements in the container
                  return null;
                },
                
                getUIElements(elementPrefix) {
                  // Build prefix for element IDs
                  const prefix = elementPrefix ? `${elementPrefix}-` : '';
                  
                  // Find elements in the DOM
                  return {
                    progressBar: document.getElementById(`${prefix}progress-bar`),
                    progressStatus: document.getElementById(`${prefix}progress-status`),
                    progressStats: document.getElementById(`${prefix}progress-stats`),
                    progressContainer: document.getElementById(`${prefix}progress-container`),
                    cancelButton: document.getElementById(`${prefix}cancel-btn`)
                  };
                }
              };
              
            case 'domUtils':
              return {
                ...baseFallback,
                
                getElement(selector) {
                  // Handle both ID-only and CSS selector cases
                  if (selector.startsWith('#') && !selector.includes(' ')) {
                    return document.getElementById(selector.substring(1));
                  }
                  return document.querySelector(selector);
                },
                
                getElements(selector) {
                  return document.querySelectorAll(selector);
                },
                
                getUIElements(elementPrefix) {
                  // Build prefix for element IDs
                  const prefix = elementPrefix ? `${elementPrefix}-` : '';
                  
                  // Find elements in the DOM
                  return {
                    container: document.getElementById(`${prefix}container`),
                    form: document.getElementById(`${prefix}form`),
                    submit: document.getElementById(`${prefix}submit-btn`),
                    cancel: document.getElementById(`${prefix}cancel-btn`),
                    progress: document.getElementById(`${prefix}progress-bar`)
                  };
                },
                
                createElement(tag, attributes = {}) {
                  const element = document.createElement(tag);
                  
                  // Set attributes
                  for (const [key, value] of Object.entries(attributes)) {
                    if (key === 'className' || key === 'class') {
                      element.className = value;
                    } else if (key === 'textContent' || key === 'text') {
                      element.textContent = value;
                    } else if (key === 'innerHTML' || key === 'html') {
                      element.innerHTML = value;
                    } else {
                      element.setAttribute(key, value);
                    }
                  }
                  
                  return element;
                },
                
                addEventListeners(element, events) {
                  if (!element || !events) return;
                  
                  Object.entries(events).forEach(([event, handler]) => {
                    if (typeof handler === 'function') {
                      element.addEventListener(event, handler);
                    }
                  });
                },
                
                toggleElementVisibility(element, visible) {
                  if (typeof element === 'string') {
                    element = this.getElement(element);
                  }
                  
                  if (!element) return;
                  
                  element.style.display = visible ? '' : 'none';
                }
              };
              
            default:
              return baseFallback;
          }
        },
        
        /**
         * Create a specialized fallback for PlaylistDownloader module
         * @returns {Object} - Fallback PlaylistDownloader module
         */
        createPlaylistDownloaderFallback() {
          console.warn("Creating fallback for PlaylistDownloader module");
          
          const fallback = {
            __isFallback: true,
            moduleName: 'playlistDownloader',
            initialized: false,
            
            initialize() {
              console.warn("Using fallback implementation for PlaylistDownloader module");
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
              
              // Use UI module to show a message if available
              if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('Warning', 'Playlist downloader functionality is not available', 'warning');
              } else {
                alert("Playlist downloader functionality is currently unavailable. Please try refreshing the page.");
              }
              
              return false;
            },
            
            downloadPlaylist() {
              console.warn("Playlist downloader functionality is not available (fallback module)");
              return Promise.resolve(false);
            },
            
            cancelDownload() {
              return false;
            },
            
            handleCancelDownload() {
              return this.cancelDownload();
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
              
              return true;
            },
            
            setupProgressTracking(taskId) {
              console.warn("Fallback setupProgressTracking called with:", taskId);
              return null;
            },
            
            handleTaskError(data) {
              console.warn("Fallback handleTaskError called with:", data);
              
              if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('Error', data.error || "An error occurred with the playlist downloader", 'error');
              } else {
                alert(data.error || "An error occurred with the playlist downloader");
              }
              
              this.showForm();
              return true;
            },
            
            handleOpenOutput() {
              if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('Warning', 'Cannot open output as the playlist downloader module is not fully functional', 'warning');
              } else {
                alert("Cannot open output as the playlist downloader module is not fully functional");
              }
              
              return false;
            },
            
            resumeTask(taskId) {
              console.warn(`Fallback resumeTask called with: ${taskId}`);
              this.showProgress();
              return true;
            }
          };
          
          // Add to fallback modules set
          this.fallbackModules.add('playlistDownloader');
          
          // Add to diagnostics
          if (!this.diagnostics.fallbacksUsed.includes('playlistDownloader')) {
            this.diagnostics.fallbacksUsed.push('playlistDownloader');
          }
          
          return fallback;
        },
        
        /**
         * Check if a module is a fallback
         * @param {string} moduleName - Module name
         * @returns {boolean} - Whether the module is a fallback
         */
        isFallbackModule(moduleName) {
          return this.fallbackModules.has(moduleName);
        },
        
        /**
* Fix failed modules by clearing their cache entries
*/
fixFailedModules() {
  if (this.failedModules.size === 0) return;
  
  console.log(`Fixing ${this.failedModules.size} failed modules`);
  
  // Clear failed modules from cache
  this.failedModules.forEach(path => {
    this.cache.delete(path);
  });
  
  // Clear the failed modules list
  this.failedModules.clear();
  this.diagnostics.failedModules = [];
  
  // Reset load attempts counter for all modules
  this.loadAttempts = new Map();
  
  console.log("Failed modules cache cleared");
 },
 
 /**
 * Get modules currently using fallbacks
 * @returns {Array<string>} - List of modules using fallbacks
 */
 getModulesUsingFallbacks() {
  return Array.from(this.fallbackModules);
 },
 
 /**
 * Generate a health report for the module loader
 * @returns {Object} - Health report
 */
 generateHealthReport() {
  return {
    status: this.failedModules.size > 0 ? 'issues' : 'ok',
    moduleCount: this.cache.size,
    failedModules: Array.from(this.failedModules),
    fallbackModules: Array.from(this.fallbackModules)
  };
 },
 
 /**
 * Safe import function with retry mechanism
 * @param {string} path - Path to the module
 * @param {number} attempts - Maximum number of attempts
 * @returns {Promise<Object>} - The imported module
 */
 async safeImport(path, attempts = 3) {
  const resolvedPath = this.resolvePath(path);
  const cacheKey = this.getNormalizedPath(resolvedPath);
 
  // Check for circular dependencies
  if (this.loadingModules.has(cacheKey)) {
    console.warn(`Circular dependency detected for module: ${path}`);
    return this.createCircularDependencyResolver(this.getModuleName(path));
  }
  
  // Check if already failed
  if (this.failedModules.has(cacheKey)) {
    console.warn(`Module ${path} previously failed to load, using fallback`);
    return this.createFallbackModule(this.getModuleName(path));
  }
  
  // Track load attempts
  const currentAttempts = this.loadAttempts.get(cacheKey) || 0;
  this.loadAttempts.set(cacheKey, currentAttempts + 1);
  
  // Mark module as loading for circular dependency detection
  this.loadingModules.add(cacheKey);
  
  try {
    for (let i = 0; i < attempts; i++) {
      try {
        console.log(`Attempting to import ${resolvedPath} (attempt ${i + 1}/${attempts})`);
        const mod = await import(resolvedPath);
        
        if (mod) {
          console.log(`[Success] Imported: ${resolvedPath}`);
          this.diagnostics.totalModules++;
          
          // Remove from loading modules
          this.loadingModules.delete(cacheKey);
          
          return mod;
        }
      } catch (error) {
        console.error(`[Attempt ${i + 1}] Failed to import ${resolvedPath}:`, error);
        this.diagnostics.retries[resolvedPath] = (this.diagnostics.retries[resolvedPath] || 0) + 1;
        
        // Small pause before retrying
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          // On last attempt, throw the error to be caught by outer try/catch
          throw error;
        }
      }
    }
    
    // Should not reach here as the last attempt should either return or throw
    throw new Error(`Failed to import ${resolvedPath} after ${attempts} attempts`);
  } catch (error) {
    // Remove from loading modules
    this.loadingModules.delete(cacheKey);
    
    // Mark as failed
    this.failedModules.add(cacheKey);
    this.diagnostics.failedModules.push(path);
    
    console.warn(`[Fallback] Using fallback module for: ${path}`);
    
    // Return fallback module
    const moduleName = this.getModuleName(path);
    return this.createFallbackModule(moduleName);
  }
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
    standardizeExports = this.defaultOptions.standardizeExports,
    retries = this.defaultOptions.maxRetries,
    timeout = this.defaultOptions.timeout,
    clearFailedModules = this.defaultOptions.clearFailedModules
  } = options;
  
  try {
    // Resolve the module path
    const resolvedPath = this.resolvePath(modulePath);
    
    if (!resolvedPath) {
      throw new Error(`Could not resolve path for module: ${modulePath}`);
    }
    
    const cacheKey = this.getNormalizedPath(resolvedPath);
    
    // Clear failed module if requested
    if (clearFailedModules && this.failedModules.has(cacheKey)) {
      console.log(`Clearing failed module status for ${modulePath}`);
      this.failedModules.delete(cacheKey);
    }
    
    // Check if module is already in the cache
    if (!skipCache && this.cache.has(cacheKey)) {
      if (this.verboseLogging) {
        console.log(`[Cache] Module loaded from cache: ${modulePath}`);
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
      // Get module name for proxy creation
      const moduleName = this.getModuleName(modulePath);
      
      // Create or retrieve proxy to break circular dependency
      if (this.moduleProxies.has(moduleName)) {
        return this.moduleProxies.get(moduleName);
      } else {
        return this.createModuleProxy(moduleName);
      }
    }
    
    // Mark module as loading to detect circular dependencies
    this.loadingModules.add(cacheKey);
    
    // Create a loading promise with proper error handling
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
        const moduleNameWithExt = this.getModuleName(modulePath) + '.js';
        
        // Enhance module with missing exports if needed
        let enhancedModule = module;
        if (standardizeExports) {
          enhancedModule = this.autoCreateMissingExports(module, moduleNameWithExt);
        }
        
        // Get the default export or the module itself
        const moduleExport = enhancedModule.default || enhancedModule;
        
        // Add to cache
        this.cache.set(cacheKey, moduleExport);
        
        // Add to diagnostics cache list
        if (!this.diagnostics.moduleCache.includes(cacheKey)) {
          this.diagnostics.moduleCache.push(cacheKey);
        }
        
        // Remove from loading set and promises
        this.loadingModules.delete(cacheKey);
        this.loadingPromises.delete(cacheKey);
        
        // If this module has a proxy, update it with the real module
        const moduleName = this.getModuleName(modulePath);
        if (this.moduleProxies.has(moduleName)) {
          this.updateModuleProxy(moduleName, moduleExport);
        }
        
        console.log(`Module ${resolvedPath} loaded successfully`);
        
        return moduleExport;
      } catch (error) {
        // Remove from loading set and promises
        this.loadingModules.delete(cacheKey);
        this.loadingPromises.delete(cacheKey);
        
        // Add to failed modules set
        this.failedModules.add(cacheKey);
        this.diagnostics.failedModules.push(cacheKey);
        
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
  
  // Merge with default options
  const importOptions = {
    ...this.defaultOptions,
    ...options
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
        if (module.initialize && typeof module.initialize === 'function' && !module.initialized) {
          try {
            const result = await Promise.race([
              module.initialize(),
              new Promise((_, reject) => setTimeout(() => 
                reject(new Error(`${moduleName} initialization timed out`)), 5000))
            ]);
            
            if (result !== false) {
              module.initialized = true;
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
      .then(module => {
        console.log(`Successfully loaded module ${this.getModuleName(path)} from ${path}`);
        return { path, module };
      })
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
 * Load a module with its dependencies
 * @param {string} modulePath - Path to the module
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Module and its dependencies
 */
 async loadModule(modulePath, options = {}) {
  const moduleName = this.getModuleName(modulePath);
  
  // Get dependencies for this module
  const dependencies = this.MODULE_DEPENDENCIES[moduleName + '.js'] || 
                       this.MODULE_DEPENDENCIES[moduleName] || [];
  
  // Load dependencies first
  const deps = {};
  if (dependencies.length > 0) {
    console.log(`Loading dependencies for ${moduleName}.js: ${dependencies.join(', ')}`);
    for (const dep of dependencies) {
      try {
        const depName = dep.replace('.js', '');
        const depModule = await this.ensureModule(depName, {
          required: false,
          retries: options.retries || this.defaultOptions.maxRetries,
          timeout: options.timeout || this.defaultOptions.timeout,
          standardizeExports: true
        });
        
        if (depModule) {
          deps[depName] = depModule;
        }
      } catch (depError) {
        console.warn(`Failed to load dependency ${dep} for ${moduleName}:`, depError);
      }
    }
  }
  
  // Load the main module
  try {
    const module = await this.importModule(modulePath, options);
    
    return {
      module,
      dependencies: deps
    };
  } catch (error) {
    console.error(`Error loading module ${moduleName} with dependencies:`, error);
    
    // Create fallback if required
    if (options.required) {
      return {
        module: this.createFallbackModule(moduleName, error),
        dependencies: deps
      };
    }
    
    throw error;
  }
 },
 
 /**
 * Ensure a module is loaded
 * @param {string} moduleName - Name of the module
 * @param {Object} options - Import options
 * @returns {Promise<Object>} - Loaded module
 */
 async ensureModule(moduleName, options = {}) {
  if (!moduleName) return null;
  
  try {
    // Handle both with and without .js extension
    const moduleFileName = moduleName.endsWith('.js') ? moduleName : `${moduleName}.js`;
    const moduleBase = moduleName.replace(/\.js$/, '');
    
    // Get module location
    const moduleType = this.MODULE_TYPES[moduleBase] || this.MODULE_LOCATIONS[moduleFileName];
    
    if (!moduleType) {
      console.warn(`Module type not found for ${moduleName}`);
    }
    
    // Try to find the module path
    let modulePath;
    
    if (moduleType) {
      modulePath = `/static/js/modules/${moduleType}/${moduleFileName}`;
    } else {
      // Try to handle both direct and relative paths
      if (moduleName.includes('/')) {
        // Likely a direct path
        modulePath = moduleName;
      } else {
        // Try to resolve it as a direct module name
        modulePath = moduleFileName;
      }
    }
    
    if (!modulePath) {
      throw new Error(`Could not resolve path for module: ${moduleName}`);
    }
    
    // Load the module
    return await this.importModule(modulePath, options);
  } catch (error) {
    console.error(`Error ensuring module ${moduleName}:`, error);
    
    if (options.required) {
      throw error;
    }
    
    return this.createFallbackModule(moduleName);
  }
 },
 
 /**
 * Get a cached module by name
 * @param {string} moduleName - Module name
 * @returns {Object|null} - Cached module or null if not found
 */
 getModule(moduleName) {
  if (!moduleName) return null;
  
  // Try to find by module name
  const moduleBase = moduleName.replace(/\.js$/, '');
  const moduleType = this.MODULE_TYPES[moduleBase];
  
  if (moduleType) {
    const path = `/static/js/modules/${moduleType}/${moduleBase}.js`;
    const cacheKey = this.getNormalizedPath(path);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
  }
  
  // Try to find by directly looking at the cache
  for (const [cacheKey, module] of this.cache.entries()) {
    if (cacheKey.includes(moduleBase)) {
      return module;
    }
  }
  
  return null;
 },
 
 /**
 * Check module health
 * @returns {Object} - Health check result
 */
 checkModuleHealth() {
  const result = {
    healthStatus: 'ok',
    failedModules: Array.from(this.failedModules),
    moduleIsFallback: false,
    systemOperational: true,
    criticalModulesStatus: {}
  };
  
  // Check critical core modules
  const criticalModules = ['errorHandler', 'eventRegistry', 'stateManager', 'uiRegistry'];
  
  for (const moduleName of criticalModules) {
    const module = this.getModule(moduleName);
    
    if (!module) {
      result.criticalModulesStatus[moduleName] = 'missing';
      result.healthStatus = 'critical';
      result.systemOperational = false;
    } else if (module.__isFallback) {
      result.criticalModulesStatus[moduleName] = 'fallback';
      result.moduleIsFallback = true;
      result.healthStatus = 'warning';
    } else {
      result.criticalModulesStatus[moduleName] = 'ok';
    }
  }
  
  // Add failed modules count
  result.failedModulesCount = this.failedModules.size;
  result.fallbackModulesCount = this.fallbackModules.size;
  
  return result;
 },
 
 /**
 * Activate recovery mode in case of critical module failures
 * @returns {Promise<boolean>} - Whether recovery mode was activated
 */
 async activateRecoveryMode() {
  console.log("Activating recovery mode for module loader");
  
  // Set recovery mode flag
  this._inRecoveryMode = true;
  
  try {
    // Fix any failed modules
    this.fixFailedModules();
    
    // Attempt to reload critical modules with fallbacks
    const coreModules = ['errorHandler', 'uiRegistry', 'stateManager', 'eventRegistry', 'eventManager', 'themeManager'];
    const utilityModules = ['ui', 'progressHandler', 'socketHandler'];
    
    console.log("Attempting to recover core modules...");
    for (const moduleName of coreModules) {
      // Skip modules that are already loaded
      if (window[moduleName] && !window[moduleName].__isFallback) {
        continue;
      }
      
      try {
        const module = await this.ensureModule(moduleName, {
          retries: 1,
          timeout: 5000,
          required: true
        });
        
        if (module) {
          // Create global reference
          window[moduleName] = module;
          window.moduleInstances = window.moduleInstances || {};
          window.moduleInstances[moduleName] = module;
          
          // Initialize if not already initialized
          if (typeof module.initialize === 'function' && !module.initialized) {
            try {
              await module.initialize();
              console.log(`Recovered and initialized core module: ${moduleName}`);
            } catch (initError) {
              console.warn(`Error initializing recovered module ${moduleName}:`, initError);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to recover core module ${moduleName}:`, error);
        
        // Create fallback as last resort
        const fallback = this.createCoreFallback(moduleName);
        window[moduleName] = fallback;
        window.moduleInstances = window.moduleInstances || {};
        window.moduleInstances[moduleName] = fallback;
        
        // Initialize fallback
        if (typeof fallback.initialize === 'function') {
          await fallback.initialize();
        }
      }
    }
    
    console.log("Attempting to recover utility modules...");
    for (const moduleName of utilityModules) {
      // Skip modules that are already loaded
      if (window[moduleName] && !window[moduleName].__isFallback) {
        continue;
      }
      
      try {
        const module = await this.ensureModule(moduleName, {
          retries: 1,
          timeout: 5000,
          required: false
        });
        
        if (module) {
          // Create global reference
          window[moduleName] = module;
          window.moduleInstances = window.moduleInstances || {};
          window.moduleInstances[moduleName] = module;
          
          // Initialize if not already initialized
          if (typeof module.initialize === 'function' && !module.initialized) {
            try {
              await module.initialize();
              console.log(`Recovered and initialized utility module: ${moduleName}`);
            } catch (initError) {
              console.warn(`Error initializing recovered utility module ${moduleName}:`, initError);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to recover utility module ${moduleName}:`, error);
        
        // Create fallback as last resort
        const fallback = this.createUtilityFallback(moduleName);
        window[moduleName] = fallback;
        window.moduleInstances = window.moduleInstances || {};
        window.moduleInstances[moduleName] = fallback;
        
        // Initialize fallback
        if (typeof fallback.initialize === 'function') {
          await fallback.initialize();
        }
      }
    }
    
    // Create recovery UI with diagnostic information
    this.createRecoveryUI();
    
    return true;
  } catch (error) {
    console.error("Error activating recovery mode:", error);
    return false;
  }
 },
 
 /**
 * Create recovery UI for troubleshooting
 */
 createRecoveryUI() {
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
          </div>
        </div>
      </div>
      
      <div class="col-md-6">
        <div class="card">
          <div class="card-header bg-info text-white">
            Technical Information
          </div>
          <div class="card-body">
            <p><strong>Failed Modules:</strong> <span id="failed-modules-count">...</span></p>
            <p><strong>Using Fallbacks:</strong> <span id="fallback-modules-count">...</span></p>
            <p><strong>Browser:</strong> ${navigator.userAgent}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
    
    <div id="failed-modules-details" class="mt-3 d-none">
      <h5>Failed Module Details</h5>
      <div class="table-responsive">
        <table class="table table-sm table-striped">
          <thead>
            <tr>
              <th>Module</th>
              <th>Path</th>
              <th>Error</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody id="failed-modules-table">
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(recoveryContainer);
  
  // Update failed modules count and fallbacks count
  const failedModulesCount = document.getElementById('failed-modules-count');
  const fallbackModulesCount = document.getElementById('fallback-modules-count');
  const failedModulesTable = document.getElementById('failed-modules-table');
  const failedModulesDetails = document.getElementById('failed-modules-details');
  
  // Get the failed modules information
  let failedModules = [];
  if (this.failedModules) {
    failedModules = Array.from(this.failedModules);
    
    if (failedModulesCount) {
      failedModulesCount.textContent = failedModules.length;
    }
    
    // If we have detailed information about failed modules, show it
    if (failedModulesTable && failedModules.length > 0) {
      // Show the details section
      if (failedModulesDetails) {
        failedModulesDetails.classList.remove('d-none');
      }
      
      // Populate the table
      failedModulesTable.innerHTML = failedModules.map(modulePath => {
        const moduleName = this.getModuleName ? 
                        this.getModuleName(modulePath) : 
                        modulePath.split('/').pop();
        
        const attempts = this.loadAttempts && this.loadAttempts.get ? 
                      this.loadAttempts.get(modulePath) || 0 : 
                      'Unknown';
                      
        return `
          <tr>
            <td>${moduleName}</td>
            <td><small>${modulePath}</small></td>
            <td>Failed to load</td>
            <td>${attempts}</td>
          </tr>
        `;
      }).join('');
    }
  } else if (failedModulesCount) {
    failedModulesCount.textContent = "Unknown";
  }
  
  // Get the fallback modules information
 let fallbackModules = [];
 if (this.fallbackModules) {
   fallbackModules = Array.from(this.fallbackModules);
   
   if (fallbackModulesCount) {
     fallbackModulesCount.textContent = fallbackModules.length;
   }
 } else if (fallbackModulesCount) {
   fallbackModulesCount.textContent = "Unknown";
 }
 
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
       
       // Clear module loader cache
       if (typeof this.clearCache === 'function') {
         this.clearCache(true);
       }
       
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
     if (typeof this.launchDiagnostics === 'function') {
       this.launchDiagnostics();
     } else {
       alert("Diagnostics not available");
     }
   });
 }
},

/**
* Initialize module diagnostics
*/
initializeModuleDiagnostics() {
 if (this.diagnosticsInitialized) {
   return;
 }
 
 // Add diagnostics button
 this.createDiagnosticsButton();
 
 // Create diagnostics module if not already created
 window.launchDiagnostics = () => {
   this.launchDiagnostics();
 };
 
 this.diagnosticsInitialized = true;
},

/**
* Create a circular dependency resolver that uses module-bridge
* @param {string} moduleName - Name of the module
* @returns {Object} - Object with methods to help resolve circular dependencies
*/
createCircularDependencyResolver(moduleName) {
 // If there's a proxy for this module, use it
 if (this.moduleProxies.has(moduleName)) {
   return this.moduleProxies.get(moduleName);
 }
 
 // Create a new proxy to handle circular dependencies
 return this.createModuleProxy(moduleName);
},

/**
* Clear the module cache
* @param {boolean} clearFailed - Whether to clear failed modules too
*/
clearCache(clearFailed = false) {
 console.log("Clearing module cache");
 
 // Clear the module cache
 this.cache.clear();
 this.loadingPromises.clear();
 
 // Clear failed modules if requested
 if (clearFailed) {
   this.fixFailedModules();
 }
 
 // Clear load attempts
 this.loadAttempts.clear();
 
 console.log("Module cache cleared");
}
};

// Initialize the module loader to set up the module types
moduleLoader.init();

// Export the module loader
export default moduleLoader;

// Core functionality exports
export const initialize = moduleLoader.initialize.bind(moduleLoader);
export const configure = moduleLoader.configure.bind(moduleLoader);
export const init = moduleLoader.init.bind(moduleLoader);
export const createProxiesForCircularDependencies = moduleLoader.createProxiesForCircularDependencies.bind(moduleLoader);
export const startDiagnostics = moduleLoader.startDiagnostics.bind(moduleLoader);
export const generateDiagnosticsReport = moduleLoader.generateDiagnosticsReport.bind(moduleLoader);
export const clearCache = moduleLoader.clearCache.bind(moduleLoader);
export const fixFailedModules = moduleLoader.fixFailedModules.bind(moduleLoader);

// Module loading exports
export const importModule = moduleLoader.importModule.bind(moduleLoader);
export const importModules = moduleLoader.importModules.bind(moduleLoader);
export const loadModule = moduleLoader.loadModule.bind(moduleLoader);
export const ensureModule = moduleLoader.ensureModule.bind(moduleLoader);
export const getModule = moduleLoader.getModule.bind(moduleLoader);
export const safeImport = moduleLoader.safeImport.bind(moduleLoader);

// Path resolution exports
export const resolvePath = moduleLoader.resolvePath.bind(moduleLoader);
export const getNormalizedPath = moduleLoader.getNormalizedPath.bind(moduleLoader);
export const cleanModulePath = moduleLoader.cleanModulePath.bind(moduleLoader);
export const getModuleName = moduleLoader.getModuleName.bind(moduleLoader);

// Proxy management exports
export const createModuleProxy = moduleLoader.createModuleProxy.bind(moduleLoader);
export const updateModuleProxy = moduleLoader.updateModuleProxy.bind(moduleLoader);
export const integrateWithBridge = moduleLoader.integrateWithBridge.bind(moduleLoader);
export const createCircularDependencyResolver = moduleLoader.createCircularDependencyResolver.bind(moduleLoader);
export const createPromiseAwareProxyHandler = moduleLoader.createPromiseAwareProxyHandler.bind(moduleLoader);

// Fallback management exports
export const createFallbackModule = moduleLoader.createFallbackModule.bind(moduleLoader);
export const createCoreFallback = moduleLoader.createCoreFallback.bind(moduleLoader);
export const createFeatureFallback = moduleLoader.createFeatureFallback.bind(moduleLoader);
export const createUtilityFallback = moduleLoader.createUtilityFallback.bind(moduleLoader);
export const createPlaylistDownloaderFallback = moduleLoader.createPlaylistDownloaderFallback.bind(moduleLoader);
export const isFallbackModule = moduleLoader.isFallbackModule.bind(moduleLoader);
export const getModulesUsingFallbacks = moduleLoader.getModulesUsingFallbacks.bind(moduleLoader);

// Diagnostic & health checking exports
export const checkModuleHealth = moduleLoader.checkModuleHealth.bind(moduleLoader);
export const generateHealthReport = moduleLoader.generateHealthReport.bind(moduleLoader);
export const createDiagnosticsButton = moduleLoader.createDiagnosticsButton.bind(moduleLoader);
export const launchDiagnostics = moduleLoader.launchDiagnostics.bind(moduleLoader);
export const showModuleHealth = moduleLoader.showModuleHealth.bind(moduleLoader);
export const initializeModuleDiagnostics = moduleLoader.initializeModuleDiagnostics.bind(moduleLoader);
export const activateRecoveryMode = moduleLoader.activateRecoveryMode.bind(moduleLoader);
export const createRecoveryUI = moduleLoader.createRecoveryUI.bind(moduleLoader);

// UI & DOM utilities exports
export const applyStoredTheme = moduleLoader.applyStoredTheme.bind(moduleLoader);
export const setupBasicTabNavigation = moduleLoader.setupBasicTabNavigation.bind(moduleLoader);
export const showErrorMessage = moduleLoader.showErrorMessage.bind(moduleLoader);
export const supportsESModules = moduleLoader.supportsESModules.bind(moduleLoader);

// Utility function exports
export const autoCreateMissingExports = moduleLoader.autoCreateMissingExports.bind(moduleLoader);
export const checkForDuplicateFunctions = moduleLoader.checkForDuplicateFunctions.bind(moduleLoader);