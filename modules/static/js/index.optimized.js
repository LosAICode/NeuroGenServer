/**
 * Optimized index.js - NeuroGen Server Frontend Entry Point
 * 
 * Streamlined initialization with:
 * - Simplified module loading sequence
 * - Better error handling and recovery
 * - Reduced complexity and improved performance
 * - Faster startup times
 */

// Performance tracking
const startTime = performance.now();
console.log('🚀 NeuroGen Server initializing...');

// Import optimized moduleLoader
import moduleLoader from './modules/core/moduleLoader.optimized.js';

// Core application state
const appState = {
  initialized: false,
  modules: new Map(),
  errors: [],
  startTime
};

// Module loading sequences (optimized order)
const LOADING_SEQUENCE = {
  // Phase 1: Core infrastructure
  core: [
    'errorHandler.js',
    'uiRegistry.js', 
    'stateManager.js',
    'eventRegistry.js',
    'eventManager.js'
  ],
  
  // Phase 2: Essential utilities
  utils: [
    'socketHandler.js',
    'progressHandler.js',
    'ui.js'
  ],
  
  // Phase 3: Application layer
  app: [
    'app.js'
  ],
  
  // Phase 4: Features (load asynchronously)
  features: [
    'fileProcessor.js',
    'playlistDownloader.js',
    'webScraper.js',
    'academicSearch.js',
    'historyManager.js'
  ]
};

/**
 * Initialize application with optimized loading
 */
async function initializeApp() {
  if (appState.initialized) {
    console.warn('App already initialized');
    return;
  }
  
  try {
    console.log('📦 Loading core modules...');
    await loadPhase('core', { required: true });
    
    console.log('🔧 Loading utilities...');
    await loadPhase('utils', { required: true });
    
    console.log('🎯 Loading application...');
    await loadPhase('app', { required: true });
    
    // Load features in background
    loadPhase('features', { required: false, background: true });
    
    // Finalize initialization
    await finalizeInit();
    
  } catch (error) {
    console.error('❌ App initialization failed:', error);
    await initializeEmergencyMode();
  }
}

/**
 * Load a phase of modules
 * @param {string} phase - Phase name
 * @param {Object} options - Loading options
 */
async function loadPhase(phase, options = {}) {
  const modules = LOADING_SEQUENCE[phase];
  if (!modules) return;
  
  const { required = false, background = false } = options;
  
  if (background) {
    // Load in background without blocking
    moduleLoader.loadBatch(modules, { required: false })
      .then(results => {
        console.log(`✅ Background loaded ${phase}: ${results.filter(r => r.status === 'fulfilled').length}/${results.length}`);
      })
      .catch(error => {
        console.warn(`⚠️ Background loading issues in ${phase}:`, error);
      });
    return;
  }
  
  // Synchronous loading with error handling
  const results = await moduleLoader.loadBatch(modules, { required });
  
  // Track loaded modules
  results.forEach((result, index) => {
    const moduleName = modules[index];
    if (result.status === 'fulfilled') {
      appState.modules.set(moduleName, result.value.module);
    } else {
      appState.errors.push({ module: moduleName, error: result.reason });
      if (required) {
        throw new Error(`Required module ${moduleName} failed to load`);
      }
    }
  });
  
  console.log(`✅ Phase ${phase}: ${results.filter(r => r.status === 'fulfilled').length}/${results.length} modules loaded`);
}

/**
 * Finalize application initialization
 */
async function finalizeInit() {
  // Initialize theme if available
  const themeManager = appState.modules.get('themeManager.js');
  if (themeManager?.default) {
    try {
      const savedTheme = localStorage.getItem('theme') || 'light';
      themeManager.default.setTheme(savedTheme);
      console.log(`🎨 Theme initialized: ${savedTheme}`);
    } catch (error) {
      console.warn('Theme initialization failed:', error);
    }
  }
  
  // Initialize app module
  const app = appState.modules.get('app.js');
  if (app?.default?.initialize) {
    await app.default.initialize();
    console.log('🎯 App module initialized');
  }
  
  // Setup socket connection
  const socketHandler = appState.modules.get('socketHandler.js');
  if (socketHandler?.default?.initialize) {
    socketHandler.default.initialize();
    console.log('🔌 Socket handler initialized');
  }
  
  // Mark as initialized
  appState.initialized = true;
  
  // Performance metrics
  const initTime = performance.now() - startTime;
  console.log(`🎉 NeuroGen Server initialized in ${Math.round(initTime)}ms`);
  
  // Expose to global scope for debugging
  window.appState = appState;
  window.moduleLoader = moduleLoader;
  
  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('neurogen:ready', {
    detail: { initTime, modules: appState.modules.size }
  }));
}

/**
 * Emergency fallback mode for critical failures
 */
async function initializeEmergencyMode() {
  console.warn('🚨 Initializing emergency mode...');
  
  // Minimal functionality
  const emergencyUI = {
    showError: (message) => {
      const alert = document.createElement('div');
      alert.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #dc3545; color: white; padding: 15px; border-radius: 5px;
        max-width: 400px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      `;
      alert.innerHTML = `<strong>Error:</strong> ${message}`;
      document.body.appendChild(alert);
      
      setTimeout(() => alert.remove(), 5000);
    }
  };
  
  // Basic retry mechanism
  const retryButton = document.createElement('button');
  retryButton.textContent = 'Retry Initialization';
  retryButton.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 10000;
    background: #007bff; color: white; border: none; padding: 10px 20px;
    border-radius: 5px; cursor: pointer; font-size: 14px;
  `;
  retryButton.onclick = () => {
    location.reload();
  };
  
  document.body.appendChild(retryButton);
  
  window.emergencyUI = emergencyUI;
  window.appState = { ...appState, emergencyMode: true };
}

/**
 * Setup enhanced error handling
 */
function setupErrorHandling() {
  // Global error handler
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    appState.errors.push({
      type: 'global',
      error: event.error,
      timestamp: Date.now()
    });
  });
  
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    appState.errors.push({
      type: 'promise',
      error: event.reason,
      timestamp: Date.now()
    });
    event.preventDefault();
  });
}

/**
 * Setup module diagnostics
 */
function setupDiagnostics() {
  // Diagnostic functions for debugging
  window.neurogen = {
    getStats: () => moduleLoader.getStats(),
    getErrors: () => appState.errors,
    retryFailed: () => moduleLoader.retryFailed(),
    clearCache: () => moduleLoader.clearCache(true),
    
    // Quick health check
    healthCheck: () => {
      const stats = moduleLoader.getStats();
      return {
        status: appState.initialized ? 'healthy' : 'initializing',
        modules: appState.modules.size,
        errors: appState.errors.length,
        performance: stats,
        uptime: performance.now() - startTime
      };
    }
  };
}

// Initialize error handling first
setupErrorHandling();

// Setup diagnostics
setupDiagnostics();

// DOM ready handler
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded
  initializeApp();
}

// Export for compatibility
export { appState, moduleLoader };