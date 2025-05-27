/**
 * index.js - FIXED NeuroGen Server Frontend Entry Point
 * 
 * This version fixes the API compatibility issues with app.js
 * and provides all required methods for backward compatibility.
 */

// Performance tracking
window.performanceStartTime = Date.now();
window.appInitialized = false;
window.moduleInstances = {};

// Core module paths - reliable and simple
const CORE_MODULES = [
  './modules/core/errorHandler.js',
  './modules/core/uiRegistry.js', 
  './modules/core/stateManager.js',
  './modules/core/eventRegistry.js',
  './modules/core/eventManager.js',
  './modules/core/themeManager.js'
];

const UTILITY_MODULES = [
  './modules/utils/socketHandler.js',
  './modules/utils/progressHandler.js',
  './modules/utils/ui.js',
  './modules/utils/utils.js'
];

const FEATURE_MODULES = [
  './modules/core/app.js',
  './modules/features/fileProcessor.js',
  './modules/features/playlistDownloader.js',
  './modules/features/webScraper.js',
  './modules/features/academicSearch.js'
];

// Module loading configuration - HOTFIX: Increased timeouts
const LOAD_CONFIG = {
  timeout: 15000,     // Increased from 8000ms to 15000ms
  retries: 3,         // Increased from 2 to 3 retries
  concurrency: 1,     // Keep sequential
  failFast: false     // Continue on failures
};

// --------------------------------------------------------------------------
// Enhanced Module Loader with Full API Compatibility
// --------------------------------------------------------------------------

class CompatibleModuleLoader {
  constructor() {
    this.loadedModules = new Map();
    this.failedModules = new Set();
    this.loadingPromises = new Map();
  }

  async loadModule(path, options = {}) {
    const config = { ...LOAD_CONFIG, ...options };
    
    if (this.loadedModules.has(path)) {
      return this.loadedModules.get(path);
    }

    if (this.loadingPromises.has(path)) {
      return this.loadingPromises.get(path);
    }

    const loadPromise = this._attemptLoad(path, config);
    this.loadingPromises.set(path, loadPromise);

    try {
      const module = await loadPromise;
      this.loadedModules.set(path, module);
      this.loadingPromises.delete(path);
      return module;
    } catch (error) {
      this.failedModules.add(path);
      this.loadingPromises.delete(path);
      console.warn(`Failed to load module ${path}:`, error.message);
      return null;
    }
  }

  async _attemptLoad(path, config) {
    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        console.log(`Loading ${path} (attempt ${attempt}/${config.retries})`);
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after ${config.timeout}ms`)), config.timeout);
        });

        const importPromise = import(path);
        const module = await Promise.race([importPromise, timeoutPromise]);
        
        console.log(`✅ Successfully loaded ${path}`);
        return module.default || module;
      } catch (error) {
        console.warn(`❌ Attempt ${attempt} failed for ${path}:`, error.message);
        if (attempt === config.retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  async loadModules(paths, options = {}) {
    const results = {};
    
    for (const path of paths) {
      const module = await this.loadModule(path, options);
      const moduleName = this._getModuleName(path);
      
      if (module) {
        results[moduleName] = module;
        window[moduleName] = module;
        window.moduleInstances[moduleName] = module;
      }
    }
    
    return results;
  }

  _getModuleName(path) {
    return path.split('/').pop().replace('.js', '');
  }

  getStatus() {
    return {
      loaded: Array.from(this.loadedModules.keys()),
      failed: Array.from(this.failedModules),
      loading: Array.from(this.loadingPromises.keys())
    };
  }

  // CRITICAL: Backward compatibility methods for app.js
  async importModule(path, options = {}) {
    console.log(`importModule called for: ${path}`);
    return this.loadModule(path, options);
  }

  async importModules(paths, required = false, options = {}) {
    console.log(`importModules called for: ${paths}`);
    const results = {};
    for (const path of paths) {
      const module = await this.loadModule(path, options);
      const moduleName = this._getModuleName(path);
      if (module) {
        results[moduleName] = module;
      } else if (required) {
        throw new Error(`Required module ${path} failed to load`);
      }
    }
    return results;
  }

  async ensureModule(moduleName, options = {}) {
    console.log(`ensureModule called for: ${moduleName}`);
    
    // Try to find by name in loaded modules first
    for (const [path, module] of this.loadedModules) {
      if (this._getModuleName(path) === moduleName) {
        return module;
      }
    }
    
    // Try common paths for the module
    const possiblePaths = [
      `./modules/core/${moduleName}.js`,
      `./modules/utils/${moduleName}.js`,
      `./modules/features/${moduleName}.js`
    ];
    
    for (const path of possiblePaths) {
      try {
        const module = await this.loadModule(path, options);
        if (module) return module;
      } catch (error) {
        // Continue to next path
      }
    }
    
    return null;
  }

  // Additional compatibility methods
  fixFailedModules() {
    console.log('Clearing failed modules for retry');
    this.failedModules.clear();
  }
}
}

// Initialize compatible module loader
const moduleLoader = new CompatibleModuleLoader();

// Make it globally available for app.js
window.moduleLoader = moduleLoader;
// --------------------------------------------------------------------------
// Application Initialization
// --------------------------------------------------------------------------

async function initializeApp() {
  console.log('🚀 Starting NeuroGen Server initialization...');
  
  try {
    applyStoredTheme();
    setupBasicEventHandlers();
    showLoadingProgress('Initializing modules...', 10);
    
    // Phase 1: Load core modules
    console.log('📦 Loading core modules...');
    const coreModules = await moduleLoader.loadModules(CORE_MODULES);
    showLoadingProgress('Core modules loaded', 30);
    
    // Phase 2: Load utility modules  
    console.log('🔧 Loading utility modules...');
    const utilityModules = await moduleLoader.loadModules(UTILITY_MODULES);
    showLoadingProgress('Utility modules loaded', 50);
    
    // Phase 3: Load feature modules
    console.log('🎯 Loading feature modules...');
    const featureModules = await moduleLoader.loadModules(FEATURE_MODULES);
    showLoadingProgress('Feature modules loaded', 70);
    
    // Phase 4: Initialize modules
    console.log('⚙️ Initializing modules...');
    await initializeModules(coreModules, utilityModules, featureModules);
    showLoadingProgress('Modules initialized', 90);
    
    window.appInitialized = true;
    const initTime = Date.now() - window.performanceStartTime;
    
    showLoadingProgress('Application ready!', 100);
    console.log(`✅ NeuroGen Server initialized successfully in ${initTime}ms`);
    
    setTimeout(() => {
      enhanceSocketIOIntegration();
    }, 1000);
    
    if (location.hostname === 'localhost') {
      setTimeout(() => {
        addDiagnosticsButton();
        logModuleStatus();
      }, 2000);
    }
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    showErrorMessage(`Initialization failed: ${error.message}`);
    activateRecoveryMode();
  }
}

async function initializeModules(coreModules, utilityModules, featureModules) {
  const allModules = { ...coreModules, ...utilityModules, ...featureModules };
  
  const initOrder = [
    'errorHandler', 'stateManager', 'uiRegistry', 'eventRegistry', 
    'eventManager', 'themeManager', 'socketHandler', 'progressHandler',
    'ui', 'app', 'fileProcessor', 'webScraper', 'academicSearch'
  ];
  
  for (const moduleName of initOrder) {
    const module = allModules[moduleName];
    if (module && typeof module.initialize === 'function') {
      try {
        await module.initialize();
        console.log(`✅ ${moduleName} initialized`);
      } catch (error) {
        console.warn(`⚠️ ${moduleName} initialization failed:`, error.message);
      }
    }
  }
}

// --------------------------------------------------------------------------
// UI Functions
// --------------------------------------------------------------------------

function showLoadingProgress(message, progress) {
  let indicator = document.getElementById('init-progress');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'init-progress';
    indicator.className = 'position-fixed top-0 start-0 w-100 bg-primary text-white text-center py-2';
    indicator.style.zIndex = '9999';
    document.body.appendChild(indicator);
  }
  
  indicator.innerHTML = `
    <div>${message}</div>
    <div class="progress mx-auto mt-2" style="width: 300px; height: 4px;">
      <div class="progress-bar" style="width: ${progress}%"></div>
    </div>
  `;
  
  if (progress >= 100) {
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 2000);
  }
}

function showErrorMessage(message) {
  console.error(message);
  
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Error', message, 'error');
    return;
  }
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'alert alert-danger position-fixed top-0 start-50 translate-middle-x';
  errorDiv.style.zIndex = '9999';
  errorDiv.style.marginTop = '20px';
  errorDiv.style.maxWidth = '80%';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, 5000);
}

function applyStoredTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) {
    toggle.innerHTML = theme === 'dark' 
      ? '<i class="fas fa-sun fa-lg"></i>' 
      : '<i class="fas fa-moon fa-lg"></i>';
  }
}

function setupBasicEventHandlers() {
  const themeToggle = document.getElementById('darkModeToggle');
  if (themeToggle && !themeToggle._hasListener) {
    themeToggle.addEventListener('click', function() {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      localStorage.setItem('theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      document.body.setAttribute('data-theme', newTheme);
      
      this.innerHTML = newTheme === 'dark' 
        ? '<i class="fas fa-sun fa-lg"></i>' 
        : '<i class="fas fa-moon fa-lg"></i>';
    });
    themeToggle._hasListener = true;
  }
  
  document.addEventListener('submit', function(e) {
    if (!window.appInitialized) {
      e.preventDefault();
      showErrorMessage('Application still loading, please wait...');
    }
  });
}

// --------------------------------------------------------------------------
// Socket.IO Integration
// --------------------------------------------------------------------------

function enhanceSocketIOIntegration() {
  if (typeof window.socket === 'undefined') {
    console.warn('Socket.IO not available for enhancement');
    return;
  }
  
  window.socket.on('progress_update', handleProgressUpdate);
  window.socket.on('task_completed', handleTaskCompleted);
  window.socket.on('task_error', handleTaskError);
  window.socket.on('task_cancelled', handleTaskCancelled);
  
  console.log('✅ Socket.IO event handlers registered');
}

function handleProgressUpdate(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.updateTaskProgress === 'function') {
    progressHandler.updateTaskProgress(data.task_id, data.progress, data.message, data.stats);
  }
}

function handleTaskCompleted(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.completeTask === 'function') {
    progressHandler.completeTask(data.task_id, data);
  }
  
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Success', 'Task completed successfully', 'success');
  }
}

function handleTaskError(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.errorTask === 'function') {
    progressHandler.errorTask(data.task_id, data.error, data);
  }
  
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Error', data.error || 'Task failed', 'error');
  }
}

function handleTaskCancelled(data) {
  if (!data || !data.task_id) return;
  
  const progressHandler = window.progressHandler || window.moduleInstances?.progressHandler;
  if (progressHandler && typeof progressHandler.cancelTask === 'function') {
    progressHandler.cancelTask(data.task_id, data);
  }
  
  if (window.ui && typeof window.ui.showToast === 'function') {
    window.ui.showToast('Cancelled', 'Task was cancelled', 'warning');
  }
}

// --------------------------------------------------------------------------
// Development Tools
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
  
  button.addEventListener('click', () => {
    const status = moduleLoader.getStatus();
    console.group('🔍 Module Diagnostics');
    console.log('✅ Loaded:', status.loaded);
    console.log('❌ Failed:', status.failed);
    console.log('📊 Module Instances:', Object.keys(window.moduleInstances));
    console.log('🚀 App Initialized:', window.appInitialized);
    console.groupEnd();
    
    alert(`Modules: ${status.loaded.length} loaded, ${status.failed.length} failed`);
  });
  
  document.body.appendChild(button);
}

function logModuleStatus() {
  const status = moduleLoader.getStatus();
  const initTime = Date.now() - window.performanceStartTime;
  
  console.group('📊 Final Module Status');
  console.log('⏱️ Time:', `${initTime}ms`);
  console.log('✅ Loaded:', status.loaded);
  console.log('❌ Failed:', status.failed);
  console.log('🎯 Available:', Object.keys(window.moduleInstances));
  console.groupEnd();
}

function activateRecoveryMode() {
  console.warn('🛠️ Activating recovery mode');
  
  const recoveryDiv = document.createElement('div');
  recoveryDiv.className = 'alert alert-warning m-3';
  recoveryDiv.innerHTML = `
    <h4><i class="fas fa-exclamation-triangle"></i> Recovery Mode</h4>
    <p>Some modules failed to load. Limited functionality available.</p>
    <button class="btn btn-primary" onclick="location.reload()">Refresh</button>
    <button class="btn btn-secondary" onclick="localStorage.clear(); location.reload()">Clear Cache</button>
  `;
  
  document.body.prepend(recoveryDiv);
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

window.__appReady = true;