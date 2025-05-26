/**
 * NeuroGen Server - Optimized Main Entry Point v2.0
 * 
 * Enhanced and optimized main index.js with:
 * - Simplified module loading sequence
 * - Better error handling and recovery
 * - Improved performance and startup time
 * - Cleaner dependency management
 * - Reduced complexity while maintaining functionality
 */

// Performance tracking
const startTime = performance.now();
window.performanceStartTime = startTime;

// Core imports - only what we absolutely need initially
import moduleLoader from './modules/core/moduleLoader.js';
import moduleDiagnostics from './modules/utils/moduleDiagnostics.js';

// Application state
const appState = {
  initialized: false,
  modules: new Map(),
  loadedModules: new Set(),
  failedModules: new Set(),
  startTime
};

// Module loading configuration
const MODULE_CONFIG = {
  // Core modules (must load successfully)
  core: [
    'errorHandler.js',
    'uiRegistry.js', 
    'stateManager.js',
    'eventRegistry.js',
    'eventManager.js',
    'themeManager.js'
  ],
  
  // Essential utilities
  utils: [
    'socketHandler.js',
    'progressHandler.js',
    'domUtils.js',
    'ui.js'
  ],
  
  // Application layer
  app: [
    'app.js'
  ],
  
  // Features (can fail gracefully)
  features: [
    'fileProcessor.js',
    'playlistDownloader.js',
    'webScraper.js',
    'academicSearch.js',
    'historyManager.js'
  ]
};

// Simplified dependency map
const DEPENDENCIES = {
  'ui.js': ['domUtils.js'],
  'progressHandler.js': ['socketHandler.js'],
  'webScraper.js': ['ui.js', 'progressHandler.js'],
  'academicSearch.js': ['ui.js'],
  'playlistDownloader.js': ['ui.js', 'progressHandler.js'],
  'fileProcessor.js': ['ui.js', 'progressHandler.js']
};

/**
 * Create simple loading indicator
 */
function createLoadingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'app-loading';
  indicator.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.8); z-index: 10000; 
    display: flex; align-items: center; justify-content: center;
    color: white; font-family: sans-serif;
  `;
  indicator.innerHTML = `
    <div style="text-align: center;">
      <div style="width: 40px; height: 40px; border: 4px solid #333; 
                  border-top: 4px solid #007bff; border-radius: 50%; 
                  animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
      <div id="loading-message">Initializing NeuroGen Server...</div>
      <div id="loading-progress" style="font-size: 0.9em; margin-top: 10px; opacity: 0.7;"></div>
    </div>
    <style>
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

/**
 * Update loading progress
 */
function updateProgress(message, details = '') {
  const messageEl = document.getElementById('loading-message');
  const progressEl = document.getElementById('loading-progress');
  if (messageEl) messageEl.textContent = message;
  if (progressEl) progressEl.textContent = details;
}

/**
 * Remove loading indicator
 */
function removeLoadingIndicator() {
  const indicator = document.getElementById('app-loading');
  if (indicator) {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.3s ease';
    setTimeout(() => indicator.remove(), 300);
  }
}

/**
 * Load a module phase with enhanced error handling
 */
async function loadPhase(phaseName, modules, options = {}) {
  const { required = false, concurrent = false } = options;
  
  updateProgress(`Loading ${phaseName} modules...`, `${modules.length} modules`);
  
  const results = new Map();
  const loadPromises = [];
  
  for (const moduleName of modules) {
    const modulePath = `./modules/${getModuleType(moduleName)}/${moduleName}`;
    
    const loadPromise = (async () => {
      try {
        // Check dependencies first
        const deps = DEPENDENCIES[moduleName] || [];
        for (const dep of deps) {
          if (!appState.loadedModules.has(dep)) {
            console.warn(`Dependency ${dep} not loaded for ${moduleName}`);
          }
        }
        
        const result = await moduleLoader.loadModule(modulePath, {
          required: required,
          timeout: 8000,
          retries: required ? 3 : 1
        });
        
        if (result?.module) {
          results.set(moduleName, result.module);
          appState.modules.set(moduleName, result.module);
          appState.loadedModules.add(moduleName);
          
          // Store in global scope for backward compatibility
          window.moduleInstances = window.moduleInstances || {};
          window.moduleInstances[moduleName.replace('.js', '')] = result.module;
          
          console.log(`✓ Loaded: ${moduleName}`);
          return result.module;
        }
      } catch (error) {
        console.error(`✗ Failed to load ${moduleName}:`, error);
        appState.failedModules.add(moduleName);
        
        if (required) {
          throw new Error(`Required module ${moduleName} failed to load`);
        }
      }
      return null;
    })();
    
    if (concurrent) {
      loadPromises.push(loadPromise);
    } else {
      await loadPromise;
    }
  }
  
  // Wait for concurrent loads if applicable
  if (concurrent && loadPromises.length > 0) {
    await Promise.allSettled(loadPromises);
  }
  
  const successCount = results.size;
  const totalCount = modules.length;
  
  console.log(`${phaseName} phase: ${successCount}/${totalCount} modules loaded`);
  
  if (required && successCount === 0) {
    throw new Error(`Failed to load any required ${phaseName} modules`);
  }
  
  return results;
}

/**
 * Get module type from filename
 */
function getModuleType(filename) {
  if (MODULE_CONFIG.core.includes(filename)) return 'core';
  if (MODULE_CONFIG.utils.includes(filename)) return 'utils';
  if (MODULE_CONFIG.app.includes(filename)) return 'core';
  if (MODULE_CONFIG.features.includes(filename)) return 'features';
  return 'utils'; // default
}

/**
 * Initialize application modules
 */
async function initializeModules() {
  // Initialize modules that have init methods
  for (const [name, module] of appState.modules) {
    try {
      if (module?.default?.initialize) {
        await module.default.initialize();
        console.log(`Initialized: ${name}`);
      } else if (module?.initialize) {
        await module.initialize();
        console.log(`Initialized: ${name}`);
      }
    } catch (error) {
      console.warn(`Failed to initialize ${name}:`, error);
    }
  }
}

/**
 * Apply stored theme immediately
 */
function applyTheme() {
  try {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.body.setAttribute('data-theme', savedTheme);
    
    const themeManager = appState.modules.get('themeManager.js');
    if (themeManager?.default?.setTheme) {
      themeManager.default.setTheme(savedTheme);
    }
    
    console.log(`Theme applied: ${savedTheme}`);
  } catch (error) {
    console.warn('Theme application failed:', error);
  }
}

/**
 * Setup global error handling
 */
function setupErrorHandling() {
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // Don't let module errors break the entire app
    event.preventDefault();
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
  });
}

/**
 * Main initialization function
 */
async function initialize() {
  console.log('🚀 NeuroGen Server initializing...');
  
  const loadingIndicator = createLoadingIndicator();
  
  try {
    // Setup error handling first
    setupErrorHandling();
    
    // Initialize module loader
    updateProgress('Initializing module system...');
    moduleLoader.initialize({
      debug: location.hostname === 'localhost',
      timeout: 10000,
      maxRetries: 2
    });
    
    // Load modules in phases
    updateProgress('Loading core modules...', 'Essential system components');
    const coreModules = await loadPhase('core', MODULE_CONFIG.core, { required: true });
    
    updateProgress('Loading utilities...', 'Support modules');
    const utilModules = await loadPhase('utils', MODULE_CONFIG.utils, { required: false });
    
    updateProgress('Loading application...', 'Main application');
    const appModules = await loadPhase('app', MODULE_CONFIG.app, { required: true });
    
    updateProgress('Loading features...', 'Feature modules');
    const featureModules = await loadPhase('features', MODULE_CONFIG.features, { 
      required: false, 
      concurrent: true 
    });
    
    // Initialize all loaded modules
    updateProgress('Initializing modules...', 'Setting up functionality');
    await initializeModules();
    
    // Apply theme
    updateProgress('Applying theme...', 'User interface');
    applyTheme();
    
    // Mark as initialized
    appState.initialized = true;
    window.appInitialized = true;
    document.body.classList.add('app-initialized');
    
    // Calculate performance metrics
    const initTime = performance.now() - startTime;
    const moduleCount = appState.modules.size;
    const failedCount = appState.failedModules.size;
    
    console.log(`🎉 NeuroGen Server initialized successfully!`);
    console.log(`   Time: ${Math.round(initTime)}ms`);
    console.log(`   Modules: ${moduleCount} loaded, ${failedCount} failed`);
    
    // Remove loading indicator
    updateProgress('Complete!', 'Ready to use');
    setTimeout(() => removeLoadingIndicator(), 1000);
    
    // Store globals for debugging
    window.appState = appState;
    window.moduleLoader = moduleLoader;
    
    // Emit ready event
    document.dispatchEvent(new CustomEvent('neurogen:ready', {
      detail: { initTime, moduleCount, failedCount }
    }));
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    
    updateProgress('Initialization failed', error.message);
    
    // Create error display
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: #dc3545; color: white; padding: 20px; border-radius: 8px;
      max-width: 500px; text-align: center; z-index: 10001;
    `;
    errorDiv.innerHTML = `
      <h3>Initialization Failed</h3>
      <p>${error.message}</p>
      <button onclick="location.reload()" style="
        background: white; color: #dc3545; border: none; padding: 10px 20px;
        border-radius: 4px; cursor: pointer; margin-top: 10px;
      ">Reload Page</button>
    `;
    document.body.appendChild(errorDiv);
    
    // Keep loading indicator but update it
    setTimeout(() => removeLoadingIndicator(), 2000);
  }
}

/**
 * Initialize diagnostics in development
 */
function initializeDiagnostics() {
  if (location.hostname === 'localhost' && moduleDiagnostics) {
    try {
      const diagnostics = moduleDiagnostics();
      if (diagnostics?.createDiagnosticsButton) {
        diagnostics.createDiagnosticsButton();
      }
    } catch (error) {
      console.warn('Diagnostics initialization failed:', error);
    }
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setTimeout(initializeDiagnostics, 2000);
  });
} else {
  // DOM already loaded
  initialize();
  setTimeout(initializeDiagnostics, 2000);
}

// Export for compatibility
export default {
  initialize,
  appState,
  moduleLoader
};