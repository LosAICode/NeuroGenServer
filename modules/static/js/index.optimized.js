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



// --------------------------------------------------------------------------
// Enhanced Socket.IO Integration
// --------------------------------------------------------------------------

function enhanceSocketIOIntegration() {
  if (typeof window.socket === 'undefined') {
    console.warn('Socket.IO not available for enhancement');
    return;
  }
  
  // Register essential event handlers for real-time progress tracking
  window.socket.on('progress_update', handleProgressUpdate);
  window.socket.on('task_completed', handleTaskCompleted);
  window.socket.on('task_error', handleTaskError);
  window.socket.on('task_cancelled', handleTaskCancelled);
  
  // Feature-specific event handlers
  window.socket.on('playlist_progress', handleProgressUpdate);
  window.socket.on('playlist_completed', handleTaskCompleted);
  window.socket.on('pdf_extraction_progress', handleProgressUpdate);
  window.socket.on('pdf_extraction_completed', handleTaskCompleted);
  
  console.log('✅ Socket.IO event handlers registered');
}

function handleProgressUpdate(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.updateTaskProgress === 'function') {
    progressHandler.updateTaskProgress(data.task_id, data.progress, data.message, data.stats);
  }
  
  // Dispatch custom event for other modules
  const event = new CustomEvent('taskProgress', { detail: data });
  document.dispatchEvent(event);
}

function handleTaskCompleted(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.completeTask === 'function') {
    progressHandler.completeTask(data.task_id, data);
  }
  
  // Show success notification
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Success', 'Task completed successfully', 'success');
  }
  
  // Dispatch completion event
  const event = new CustomEvent('taskCompleted', { detail: data });
  document.dispatchEvent(event);
}

function handleTaskError(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.errorTask === 'function') {
    progressHandler.errorTask(data.task_id, data.error, data);
  }
  
  // Show error notification
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Error', data.error || 'Task failed', 'error');
  }
  
  // Dispatch error event
  const event = new CustomEvent('taskError', { detail: data });
  document.dispatchEvent(event);
}

function handleTaskCancelled(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.cancelTask === 'function') {
    progressHandler.cancelTask(data.task_id, data);
  }
  
  // Show cancellation notification
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Cancelled', 'Task was cancelled', 'warning');
  }
  
  // Dispatch cancellation event
  const event = new CustomEvent('taskCancelled', { detail: data });
  document.dispatchEvent(event);
}

// --------------------------------------------------------------------------
// Development Tools and Diagnostics
// --------------------------------------------------------------------------

function addDiagnosticsButton() {
  if (document.getElementById('diagnostics-btn')) return;
  
  const button = document.createElement('button');
  button.id = 'diagnostics-btn';
  button.className = 'btn btn-info btn-sm position-fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.zIndex = '9999';
  button.innerHTML = '<i class="fas fa-stethoscope"></i> Debug';
  button.title = 'Click to view module diagnostics';
  
  button.addEventListener('click', () => {
    const status = moduleLoader.getStatus();
    console.group('🔍 Module Diagnostics');
    console.log('✅ Loaded:', status.loaded);
    console.log('❌ Failed:', status.failed);
    console.log('⏳ Loading:', status.loading);
    console.log('📊 Module Instances:', Object.keys(window.moduleInstances));
    console.log('🚀 App Initialized:', window.appInitialized);
    console.groupEnd();
    
    // Show user-friendly status
    const loadedCount = status.loaded.length;
    const failedCount = status.failed.length;
    const totalCount = loadedCount + failedCount;
    
    alert(`Module Status:\n✅ ${loadedCount}/${totalCount} modules loaded successfully\n❌ ${failedCount} modules failed\n\nCheck console for detailed diagnostics.`);
  });
  
  document.body.appendChild(button);
}

function logModuleStatus() {
  const status = moduleLoader.getStatus();
  const initTime = Date.now() - window.performanceStartTime;
  
  console.group('📊 Final Module Status Report');
  console.log('⏱️  Initialization Time:', `${initTime}ms`);
  console.log('✅ Successfully Loaded:', status.loaded);
  console.log('❌ Failed to Load:', status.failed);
  console.log('🎯 Available in window.moduleInstances:', Object.keys(window.moduleInstances));
  console.log('🚀 Application Ready:', window.appInitialized);
  console.groupEnd();
  
  // Log performance improvement if previous time was recorded
  if (initTime < 15000) {
    console.log('🎉 Performance improvement: Fast initialization achieved!');
  }
}

// --------------------------------------------------------------------------
// Recovery Mode for Failed Modules
// --------------------------------------------------------------------------

function activateRecoveryMode() {
  console.warn('🛠️ Activating recovery mode due to initialization failure');
  
  // Remove any existing loading indicators
  const loadingIndicator = document.getElementById('init-progress');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  
  // Create recovery UI
  const recoveryDiv = document.createElement('div');
  recoveryDiv.id = 'recovery-mode';
  recoveryDiv.className = 'container-fluid bg-warning text-dark p-4';
  recoveryDiv.style.position = 'fixed';
  recoveryDiv.style.top = '0';
  recoveryDiv.style.left = '0';
  recoveryDiv.style.right = '0';
  recoveryDiv.style.zIndex = '10000';
  
  const status = moduleLoader.getStatus();
  
  recoveryDiv.innerHTML = `
    <div class="row">
      <div class="col-12">
        <h4><i class="fas fa-exclamation-triangle"></i> Recovery Mode Active</h4>
        <p>Some modules failed to load. The application is running with limited functionality.</p>
        
        <div class="row mt-3">
          <div class="col-md-6">
            <h6>Module Status:</h6>
            <ul class="list-unstyled">
              <li>✅ Loaded: ${status.loaded.length} modules</li>
              <li>❌ Failed: ${status.failed.length} modules</li>
              <li>📊 Available: ${Object.keys(window.moduleInstances).length} instances</li>
            </ul>
          </div>
          <div class="col-md-6">
            <h6>Recovery Options:</h6>
            <div class="btn-group-vertical w-100">
              <button class="btn btn-primary mb-2" onclick="location.reload()">
                <i class="fas fa-sync"></i> Refresh Page
              </button>
              <button class="btn btn-secondary mb-2" onclick="localStorage.clear(); sessionStorage.clear(); location.reload()">
                <i class="fas fa-broom"></i> Clear Cache & Reload
              </button>
              <button class="btn btn-info mb-2" onclick="console.log('Module Status:', ${JSON.stringify(status)})">
                <i class="fas fa-info"></i> Log Diagnostics
              </button>
            </div>
          </div>
        </div>
        
        <div class="mt-3">
          <button class="btn btn-warning btn-sm" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">
            <i class="fas fa-times"></i> Continue with Limited Functionality
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.prepend(recoveryDiv);
  
  // Set flag to prevent further recovery mode activation
  window._recoveryModeActive = true;
}

// --------------------------------------------------------------------------
// Progressive Enhancement Functions
// --------------------------------------------------------------------------

/**
 * Initialize basic functionality even if modules fail
 */
function initializeBasicFunctionality() {
  // Ensure basic theme functionality works
  if (!window.themeManager) {
    console.log('Creating fallback theme management');
    window.themeManager = {
      toggleTheme: () => {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyStoredTheme();
      }
    };
  }
  
  // Ensure basic progress tracking works
  if (!window.progressHandler) {
    console.log('Creating fallback progress handler');
    window.progressHandler = {
      updateTaskProgress: (taskId, progress, message) => {
        console.log(`Task ${taskId}: ${progress}% - ${message}`);
      },
      completeTask: (taskId, data) => {
        console.log(`Task ${taskId} completed:`, data);
      },
      errorTask: (taskId, error) => {
        console.error(`Task ${taskId} failed:`, error);
      }
    };
  }
  
  // Ensure basic UI functionality works
  if (!window.ui) {
    console.log('Creating fallback UI utilities');
    window.ui = {
      showToast: (title, message, type) => {
        console.log(`${type.toUpperCase()}: ${title} - ${message}`);
        // Could implement a simple toast here if needed
      }
    };
  }
}

// --------------------------------------------------------------------------
// Error Handling and Monitoring
// --------------------------------------------------------------------------

// Global error handler for unhandled module errors
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('module') && !window._recoveryModeActive) {
    console.error('Module-related error detected:', event.message);
    // Only activate recovery if not already active and we're not initialized
    if (!window.appInitialized) {
      setTimeout(activateRecoveryMode, 1000);
    }
  }
});

// Promise rejection handler for module loading failures
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.toString().includes('module') && !window._recoveryModeActive) {
    console.error('Module loading promise rejection:', event.reason);
    // Only activate recovery if not already active and we're not initialized
    if (!window.appInitialized) {
      setTimeout(activateRecoveryMode, 1000);
    }
  }
});

// --------------------------------------------------------------------------
// Initialization Timeout Protection
// --------------------------------------------------------------------------

// Safety timeout to prevent infinite loading
setTimeout(() => {
  if (!window.appInitialized && !window._recoveryModeActive) {
    console.warn('⏰ Initialization timeout reached, activating recovery mode');
    activateRecoveryMode();
    
    // Initialize basic functionality as fallback
    initializeBasicFunctionality();
  }
}, 30000); // 30 second timeout

// --------------------------------------------------------------------------
// Initialize Application
// --------------------------------------------------------------------------

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded, initialize immediately
  initializeApp();
}

// Set global flag for backward compatibility
window.__appReady = true;

// Export module loader for potential external use
window.moduleLoader = moduleLoader;

