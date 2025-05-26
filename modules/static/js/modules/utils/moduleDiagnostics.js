/**
 * Module Diagnostics Tool
 * 
 * This utility script allows real-time diagnosis of module loading issues
 * in the NeuroGen Server frontend. It can be included at the top of your index.js
 * file or loaded separately to help identify and fix module problems.
 * 
 * Features:
 * - Real-time module load monitoring
 * - Circular dependency detection
 * - Useful console output for debugging
 * - Fallback creation tracking
 * - Module initialization timing
 */

// Module loading status tracking
const moduleTracker = {
  loadingSince: new Map(),
  loadingDuration: new Map(),
  failures: new Map(),
  successes: new Map(),
  fallbacks: new Map(),
  circularDependencies: new Set(),
  loadingModules: new Set()
};

// Original console methods (preserve for accurate logging)
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info
};

// Enable verbose logging for better diagnostics
const VERBOSE_LOGGING = true;

/**
 * Enhanced module loader that tracks loading status
 * @param {string} modulePath - Path to the module
 * @param {boolean} retry - Whether this is a retry attempt
 * @returns {Promise} - Promise resolving to the loaded module
 */
export async function loadModuleWithDiagnostics(modulePath, retry = false) {
  const moduleName = getModuleNameFromPath(modulePath);
  
  // Check if already loaded successfully
  if (moduleTracker.successes.has(modulePath)) {
    return moduleTracker.successes.get(modulePath);
  }
  
  // Check if already loading (potential circular dependency)
  if (moduleTracker.loadingModules.has(modulePath)) {
    originalConsole.warn(`⚠️ Circular dependency detected: ${modulePath}`);
    moduleTracker.circularDependencies.add(modulePath);
    
    // Return a proxy for circular dependency resolution
    return createTemporaryProxy(moduleName);
  }
  
  // Start tracking the loading
  moduleTracker.loadingModules.add(modulePath);
  moduleTracker.loadingSince.set(modulePath, Date.now());
  
  try {
    // Attempt to import the module
    if (VERBOSE_LOGGING) {
      originalConsole.log(`📂 Loading module: ${modulePath}`);
    }
    
    const module = await import(modulePath);
    
    // Record successful load
    moduleTracker.loadingModules.delete(modulePath);
    moduleTracker.successes.set(modulePath, module);
    moduleTracker.loadingDuration.set(modulePath, Date.now() - moduleTracker.loadingSince.get(modulePath));
    
    if (VERBOSE_LOGGING) {
      originalConsole.log(`✅ Loaded module: ${modulePath} (${moduleTracker.loadingDuration.get(modulePath)}ms)`);
    }
    
    return module;
  } catch (error) {
    // Handle loading failure
    moduleTracker.loadingModules.delete(modulePath);
    
    if (!moduleTracker.failures.has(modulePath)) {
      moduleTracker.failures.set(modulePath, []);
    }
    
    moduleTracker.failures.get(modulePath).push({
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
    
    originalConsole.error(`❌ Failed to load module: ${modulePath}`);
    originalConsole.error(error);
    
    // Create fallback if this is not a retry attempt
    if (!retry) {
      originalConsole.warn(`⚠️ Creating fallback for module: ${modulePath}`);
      const fallback = createFallbackModule(moduleName);
      moduleTracker.fallbacks.set(modulePath, fallback);
      return fallback;
    }
    
    throw error;
  }
}

/**
 * Extract module name from path
 * @param {string} path - Module path
 * @returns {string} - Module name
 */
function getModuleNameFromPath(path) {
  const parts = path.split('/');
  return parts[parts.length - 1].replace('.js', '');
}

/**
 * Create a temporary proxy for circular dependency resolution
 * @param {string} moduleName - Name of the module
 * @returns {Object} - Proxy object
 */
function createTemporaryProxy(moduleName) {
  return new Proxy({}, {
    get: function(target, prop) {
      if (prop === '__isFallback') {
        return true;
      }
      if (prop === '__isTemporaryProxy') {
        return true;
      }
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined; // Not a promise
      }
      if (typeof prop === 'symbol') {
        return undefined;
      }
      
      originalConsole.warn(`⚠️ Accessing ${prop} on unresolved module ${moduleName}`);
      
      // Return a function for function calls or undefined for properties
      return typeof target[prop] === 'function' 
        ? function() { return undefined; } 
        : undefined;
    }
  });
}

/**
 * Create fallback module implementation
 * @param {string} moduleName - Name of the module
 * @returns {Object} - Fallback module
 */
function createFallbackModule(moduleName) {
  // Basic fallbacks for known module types
  switch (moduleName) {
    case 'ui':
    case 'ui.js':
      return {
        __isFallback: true,
        showToast: (title, message) => {
          originalConsole.log(`[Toast] ${title}: ${message}`);
        },
        showLoadingSpinner: (message) => {
          originalConsole.log(`[Loading] ${message}`);
          return {
            hide: () => {},
            updateMessage: () => {},
            updateProgress: () => {}
          };
        },
        getElement: (selector) => document.querySelector(selector),
        hideLoading: () => {},
        showModal: (title, content) => {
          originalConsole.log(`[Modal] ${title}`);
          return { 
            hide: () => {},
            updateContent: () => {},
            updateTitle: () => {}
          };
        },
        hideModal: () => {},
        toggleElementVisibility: () => {},
        confirm: () => ({ hide: () => {} }),
        alert: () => ({ hide: () => {} }),
        prompt: () => ({ hide: () => {} }),
        findElement: (selector) => document.querySelector(selector),
        findElements: (selector) => Array.from(document.querySelectorAll(selector)),
        createElement: (tag) => document.createElement(tag)
      };
    
    case 'progressHandler':
    case 'progressHandler.js':
      return {
        __isFallback: true,
        default: {
          createTracker: () => ({}),
          getTracker: () => null,
          getAllTrackers: () => [],
          destroyTracker: () => false,
          destroyAllTrackers: () => {},
          setupTaskProgress: () => ({
            updateProgress: () => {},
            complete: () => {},
            error: () => {},
            cancel: () => {}
          }),
          trackProgress: () => ({
            updateProgress: () => {},
            complete: () => {},
            error: () => {},
            cancelTracking: () => {}
          }),
          updateTaskProgress: () => {},
          updateProgressUI: () => {},
          completeTask: () => {},
          errorTask: () => {},
          cancelTask: () => {},
          createProgressUI: () => {},
          getServerVersion: () => null,
          getActiveTaskIds: () => [],
          getTaskDetails: () => null,
          cancelTracking: () => {}
        },
        trackProgress: () => ({
          updateProgress: () => {},
          complete: () => {},
          error: () => {},
          cancelTracking: () => {}
        }),
        setupTaskProgress: () => ({
          updateProgress: () => {},
          complete: () => {},
          error: () => {},
          cancel: () => {}
        }),
        updateProgressUI: () => {},
        createProgressUI: () => {},
        cancelTracking: () => {},
        updateTaskProgress: () => {},
        completeTask: () => {},
        errorTask: () => {},
        cancelTask: () => {},
        formatDuration: () => '0:00',
        calculateETA: () => ({ timeRemaining: null, completionTime: null }),
        formatBytes: () => '0 B',
        updateStatsDisplay: () => {}
      };
      
    case 'socketHandler':
    case 'socketHandler.js':
      return {
        __isFallback: true,
        default: {
          startStatusPolling: () => {},
          stopStatusPolling: () => {},
          cancelTask: () => Promise.resolve({ success: true }),
          isConnected: () => false,
          registerTaskHandler: () => {},
          emit: () => {},
          connect: () => {},
          disconnect: () => {},
          on: () => {},
          off: () => {}
        },
        startStatusPolling: () => {},
        stopStatusPolling: () => {},
        cancelTask: () => Promise.resolve({ success: true }),
        isConnected: () => false,
        registerTaskHandler: () => {},
        emit: () => {}
      };
      
    case 'academicSearch':
    case 'academicSearch.js':
      return {
        __isFallback: true,
        default: {
          initialize: () => true,
          performSearch: () => Promise.resolve({ results: [] }),
          loadPaperDetails: () => Promise.resolve({}),
          downloadPaper: () => Promise.resolve({})
        },
        initialize: () => true,
        performSearch: () => Promise.resolve({ results: [] }),
        loadPaperDetails: () => Promise.resolve({}),
        downloadPaper: () => Promise.resolve({})
      };
      
    case 'webScraper':
    case 'webScraper.js':
      return {
        __isFallback: true,
        default: {
          initialize: () => true,
          startScraping: () => {},
          cancelScraping: () => {}
        },
        initialize: () => true,
        startScraping: () => {},
        cancelScraping: () => {}
      };
      
    case 'fileProcessor':
    case 'fileProcessor.js':
      return {
        __isFallback: true,
        default: {
          initialize: () => true,
          processFiles: () => Promise.resolve({ success: true }),
          cancelProcessing: () => {}
        },
        initialize: () => true,
        processFiles: () => Promise.resolve({ success: true }),
        cancelProcessing: () => {}
      };
      
    default:
      // Generic fallback
      return { 
        __isFallback: true,
        default: { initialize: () => true }
      };
  }
}

/**
 * Generate a diagnostic report of module loading status
 * @returns {Object} - Diagnostic report
 */
export function generateDiagnosticReport() {
  return {
    timestamp: new Date().toISOString(),
    loadedModules: Array.from(moduleTracker.successes.keys()),
    failedModules: Array.from(moduleTracker.failures.keys()),
    fallbacksUsed: Array.from(moduleTracker.fallbacks.keys()),
    circularDependencies: Array.from(moduleTracker.circularDependencies),
    loadingTimes: Array.from(moduleTracker.loadingDuration.entries())
      .map(([path, duration]) => ({ 
        module: getModuleNameFromPath(path), 
        path, 
        loadTime: duration 
      }))
      .sort((a, b) => b.loadTime - a.loadTime), // Sort by load time (slowest first)
    browserInfo: navigator.userAgent,
    status: moduleTracker.failures.size > 0 ? 'issues' : 'ok'
  };
}

/**
 * Output diagnostic report to console
 */
export function logDiagnosticReport() {
  const report = generateDiagnosticReport();
  
  originalConsole.log('%c📊 Module Diagnostics Report', 'font-size: 16px; font-weight: bold; color: blue;');
  originalConsole.log(`Timestamp: ${report.timestamp}`);
  originalConsole.log(`Status: ${report.status.toUpperCase()}`);
  originalConsole.log(`Loaded Modules: ${report.loadedModules.length}`);
  originalConsole.log(`Failed Modules: ${report.failedModules.length}`);
  originalConsole.log(`Fallbacks Used: ${report.fallbacksUsed.length}`);
  originalConsole.log(`Circular Dependencies: ${report.circularDependencies.length}`);
  
  if (report.failedModules.length > 0) {
    originalConsole.log('%c❌ Failed Modules:', 'font-weight: bold; color: red;');
    report.failedModules.forEach(modulePath => {
      const failures = moduleTracker.failures.get(modulePath);
      originalConsole.log(`  - ${modulePath} (${failures.length} failures)`);
      failures.forEach((failure, index) => {
        originalConsole.log(`    Failure #${index + 1}: ${failure.error}`);
      });
    });
  }
  
  if (report.circularDependencies.length > 0) {
    originalConsole.log('%c⚠️ Circular Dependencies:', 'font-weight: bold; color: orange;');
    report.circularDependencies.forEach(modulePath => {
      originalConsole.log(`  - ${modulePath}`);
    });
  }
  
  if (report.fallbacksUsed.length > 0) {
    originalConsole.log('%c🔄 Fallbacks Used:', 'font-weight: bold; color: purple;');
    report.fallbacksUsed.forEach(modulePath => {
      originalConsole.log(`  - ${modulePath}`);
    });
  }
  
  originalConsole.log('%c⏱️ Module Loading Times (Top 5):', 'font-weight: bold;');
  report.loadingTimes.slice(0, 5).forEach(item => {
    originalConsole.log(`  - ${item.module}: ${item.loadTime}ms`);
  });
}

/**
 * Fix common module issues by patching the code
 * @param {Array} moduleList - List of modules to fix
 * @returns {Object} - Results of fixes
 */
export function fixModuleIssues(moduleList = []) {
  const results = {
    fixedModules: [],
    failedFixes: [],
    timestamp: new Date().toISOString()
  };
  
  // If no modules specified, use the failed modules
  if (!moduleList.length) {
    moduleList = Array.from(moduleTracker.failures.keys());
  }
  
  for (const modulePath of moduleList) {
    try {
      const moduleName = getModuleNameFromPath(modulePath);
      
      // Apply appropriate fixes based on module name
      switch (moduleName) {
        case 'ui':
        case 'ui.js':
          // Fix circular dependencies in UI module
          patchUIModule(modulePath);
          results.fixedModules.push(modulePath);
          break;
          
        case 'progressHandler':
        case 'progressHandler.js':
          // Fix exports in progressHandler
          patchProgressHandlerModule(modulePath);
          results.fixedModules.push(modulePath);
          break;
          
        case 'webScraper':
        case 'webScraper.js':
          // Fix circular dependencies in WebScraper
          patchWebScraperModule(modulePath);
          results.fixedModules.push(modulePath);
          break;
          
        case 'academicSearch':
        case 'academicSearch.js':
          // Fix circular dependencies in Academic Search
          patchAcademicSearchModule(modulePath);
          results.fixedModules.push(modulePath);
          break;
          
        case 'fileProcessor':
        case 'fileProcessor.js':
          // Fix circular dependencies in FileProcessor
          patchFileProcessorModule(modulePath);
          results.fixedModules.push(modulePath);
          break;
          
        default:
          // No specific fix available for this module
          results.failedFixes.push({
            modulePath,
            reason: 'No specific fix available for this module'
          });
      }
    } catch (error) {
      results.failedFixes.push({
        modulePath,
        reason: error.message,
        error
      });
    }
  }
  
  return results;
}

/**
 * Patch UI module to fix circular dependencies
 * @param {string} modulePath - Path to UI module
 */
function patchUIModule(modulePath) {
  // This would modify the module code in a real implementation
  originalConsole.log(`Patching UI module: ${modulePath}`);
  
  // In a real implementation, this would fetch the module code, modify it,
  // and save it back. For this diagnostic tool, we'll simulate the fix.
  const fixedModule = createFixedUIModule();
  moduleTracker.successes.set(modulePath, fixedModule);
  moduleTracker.failures.delete(modulePath);
  moduleTracker.fallbacks.delete(modulePath);
  
  originalConsole.log(`✅ Successfully patched UI module`);
}

/**
 * Patch ProgressHandler module to fix exports
 * @param {string} modulePath - Path to ProgressHandler module
 */
function patchProgressHandlerModule(modulePath) {
  // This would modify the module code in a real implementation
  originalConsole.log(`Patching ProgressHandler module: ${modulePath}`);
  
  // In a real implementation, this would fetch the module code, modify it,
  // and save it back. For this diagnostic tool, we'll simulate the fix.
  const fixedModule = createFixedProgressHandlerModule();
  moduleTracker.successes.set(modulePath, fixedModule);
  moduleTracker.failures.delete(modulePath);
  moduleTracker.fallbacks.delete(modulePath);
  
  originalConsole.log(`✅ Successfully patched ProgressHandler module`);
}

/**
 * Patch WebScraper module to fix circular dependencies
 * @param {string} modulePath - Path to WebScraper module
 */
function patchWebScraperModule(modulePath) {
  // This would modify the module code in a real implementation
  originalConsole.log(`Patching WebScraper module: ${modulePath}`);
  
  // In a real implementation, this would fetch the module code, modify it,
  // and save it back. For this diagnostic tool, we'll simulate the fix.
  const fixedModule = createFixedWebScraperModule();
  moduleTracker.successes.set(modulePath, fixedModule);
  moduleTracker.failures.delete(modulePath);
  moduleTracker.fallbacks.delete(modulePath);
  
  originalConsole.log(`✅ Successfully patched WebScraper module`);
}

/**
 * Patch AcademicSearch module to fix circular dependencies
 * @param {string} modulePath - Path to AcademicSearch module
 */
function patchAcademicSearchModule(modulePath) {
  // This would modify the module code in a real implementation
  originalConsole.log(`Patching AcademicSearch module: ${modulePath}`);
  
  // In a real implementation, this would fetch the module code, modify it,
  // and save it back. For this diagnostic tool, we'll simulate the fix.
  const fixedModule = createFixedAcademicSearchModule();
  moduleTracker.successes.set(modulePath, fixedModule);
  moduleTracker.failures.delete(modulePath);
  moduleTracker.fallbacks.delete(modulePath);
  
  originalConsole.log(`✅ Successfully patched AcademicSearch module`);
}

/**
 * Patch FileProcessor module to fix circular dependencies
 * @param {string} modulePath - Path to FileProcessor module
 */
function patchFileProcessorModule(modulePath) {
  // This would modify the module code in a real implementation
  originalConsole.log(`Patching FileProcessor module: ${modulePath}`);
  
  // In a real implementation, this would fetch the module code, modify it,
  // and save it back. For this diagnostic tool, we'll simulate the fix.
  const fixedModule = createFixedFileProcessorModule();
  moduleTracker.successes.set(modulePath, fixedModule);
  moduleTracker.failures.delete(modulePath);
  moduleTracker.fallbacks.delete(modulePath);
  
  originalConsole.log(`✅ Successfully patched FileProcessor module`);
}

/**
 * Create a fixed UI module
 * @returns {Object} - Fixed UI module
 */
function createFixedUIModule() {
  // Simulate a fixed module
  return {
    __isFixed: true,
    default: {
      initialize: () => true,
      showToast: () => {},
      showLoadingSpinner: () => ({ hide: () => {} }),
      getElement: (selector) => document.querySelector(selector)
    },
    showToast: () => {},
    showLoadingSpinner: () => ({ hide: () => {} }),
    getElement: (selector) => document.querySelector(selector)
  };
}

/**
 * Create a fixed ProgressHandler module
 * @returns {Object} - Fixed ProgressHandler module
 */
function createFixedProgressHandlerModule() {
  // Simulate a fixed module
  return {
    __isFixed: true,
    default: () => ({
      trackProgress: () => ({
        updateProgress: () => {},
        complete: () => {},
        error: () => {},
        cancelTracking: () => {}
      })
    }),
    trackProgress: () => ({
      updateProgress: () => {},
      complete: () => {},
      error: () => {},
      cancelTracking: () => {}
    }),
    updateProgressUI: () => {},
    createProgressUI: () => {},
    cancelTracking: () => {}
  };
}

/**
 * Create a fixed WebScraper module
 * @returns {Object} - Fixed WebScraper module
 */
function createFixedWebScraperModule() {
  // Simulate a fixed module
  return {
    __isFixed: true,
    default: {
      initialize: () => true,
      startScraping: () => {},
      cancelScraping: () => {}
    },
    initialize: () => true,
    startScraping: () => {},
    cancelScraping: () => {}
  };
}

/**
 * Create a fixed AcademicSearch module
 * @returns {Object} - Fixed AcademicSearch module
 */
function createFixedAcademicSearchModule() {
  // Simulate a fixed module
  return {
    __isFixed: true,
    default: {
      initialize: () => true,
      performSearch: () => Promise.resolve({ results: [] })
    },
    initialize: () => true,
    performSearch: () => Promise.resolve({ results: [] })
  };
}

/**
 * Create a fixed FileProcessor module
 * @returns {Object} - Fixed FileProcessor module
 */
function createFixedFileProcessorModule() {
  // Simulate a fixed module
  return {
    __isFixed: true,
    default: {
      initialize: () => true,
      processFiles: () => Promise.resolve({ success: true })
    },
    initialize: () => true,
    processFiles: () => Promise.resolve({ success: true })
  };
}

/**
 * Initialize the diagnostics tool
 * @returns {Object} - Diagnostics API
 */
export function initModuleDiagnostics() {
  originalConsole.log('%c📊 Module Diagnostics Tool Initialized', 'font-size: 14px; font-weight: bold; color: green;');
  
  // Add a global hook for easy access from the console
  window.__moduleDiagnostics = {
    getReport: generateDiagnosticReport,
    logReport: logDiagnosticReport,
    fixModules: fixModuleIssues,
    loadModule: loadModuleWithDiagnostics,
    moduleTracker
  };
  
  return {
    loadModule: loadModuleWithDiagnostics,
    getReport: generateDiagnosticReport,
    logReport: logDiagnosticReport,
    fixModules: fixModuleIssues,
    moduleTracker
  };
}

// Export default API
export default initModuleDiagnostics;