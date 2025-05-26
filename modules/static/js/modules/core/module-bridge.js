/**
 * Module Bridge
 * 
 * This module acts as a bridge to prevent circular dependencies between modules.
 * It provides stub implementations that can be dynamically updated after modules load.
 * 
 * VERSION: 2.1.0
 * UPDATED: 2025-05-15
 */

// ----------------------------------------------------------
// Bridge Implementation with Version Tracking and Error Handling
// ----------------------------------------------------------
const BRIDGE_VERSION = '2.1.0';
console.log(`Module Bridge v${BRIDGE_VERSION} initializing...`);

// Track bridge state
const bridgeState = {
  initialized: false,
  modules: new Map(),
  updateHistory: new Map(),
  dependencyGraph: new Map(),
  eventListeners: new Map(),
  errors: []
};

// Create empty bridges for modules that cause circular dependencies
const uiBridge = createBridgeObject('ui', {
  showToast: (title, message, type = 'info') => {
    console.log(`TOAST [${type}]: ${title} - ${message}`);
    return null;
  },
  showLoadingSpinner: (message) => {
    console.log(`LOADING: ${message}`);
    return {
      hide: () => console.log('Loading hidden'),
      updateMessage: () => {},
      updateProgress: () => {},
      getElapsedTime: () => 0
    };
  },
  hideLoading: () => console.log('Loading hidden'),
  showModal: (title, content, options) => {
    console.log(`MODAL: ${title}`);
    return {
      id: 'mock-modal',
      hide: () => {},
      updateContent: () => {},
      updateTitle: () => {},
      addButton: () => {}
    };
  },
  hideModal: () => {},
  toggleElementVisibility: (id, visible) => {},
  getElement: (selector) => document.querySelector(selector),
  findElement: (selector) => document.querySelector(selector),
  findElements: (selector) => Array.from(document.querySelectorAll(selector)),
  createElement: (tag, attrs, parent) => {
    const el = document.createElement(tag);
    return el;
  },
  confirm: (title, message, onConfirm, onCancel) => {
    console.log(`CONFIRM: ${title} - ${message}`);
    // Default to cancelling to avoid unintended actions
    if (onCancel) onCancel();
    return {
      id: 'mock-confirm',
      hide: () => {}
    };
  },
  alert: (title, message, type, onClose) => {
    console.log(`ALERT [${type}]: ${title} - ${message}`);
    return {
      id: 'mock-alert',
      hide: () => {}
    };
  },
  prompt: (title, message, onSubmit, onCancel) => {
    console.log(`PROMPT: ${title} - ${message}`);
    // Default to cancelling to avoid unintended actions
    if (onCancel) onCancel();
    return {
      id: 'mock-prompt',
      hide: () => {}
    };
  }
});

const progressHandlerBridge = createBridgeObject('progressHandler', {
  trackProgress: (taskId, options = {}) => {
    console.log(`Tracking progress for task ${taskId}`);
    return {
      updateProgress: () => {},
      complete: () => {},
      error: () => {},
      cancel: () => {},
      getStatus: () => ({ status: 'pending' }),
      cancelTracking: () => {}
    };
  },
  updateProgressUI: () => {},
  createProgressUI: () => {},
  cancelTracking: () => {},
  setupTaskProgress: (taskId, options = {}) => {
    console.log(`Setting up progress tracking for task ${taskId}`);
    return {
      updateProgress: () => {},
      complete: () => {},
      error: () => {},
      cancel: () => {},
      getStatus: () => ({ status: 'pending' })
    };
  },
  updateTaskProgress: () => {},
  completeTask: () => {},
  errorTask: () => {},
  cancelTask: () => {},
  formatDuration: (ms) => '0:00',
  calculateETA: () => ({ timeRemaining: null, completionTime: null }),
  formatBytes: (bytes) => '0 B'
});

const socketHandlerBridge = createBridgeObject('socketHandler', {
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
});

// Helper function to create bridge objects with proper tracking
function createBridgeObject(name, initialImpl) {
  const bridge = {
    ...initialImpl,
    __isBridge: true,
    __bridgeName: name,
    __updateCount: 0,
    __created: Date.now()
  };
  
  // Track this bridge
  bridgeState.modules.set(name, {
    bridge,
    initialImpl,
    dependencies: [],
    updateHandlers: new Map(),
    lastUpdated: null
  });
  
  return bridge;
}

// Export the bridges
export { uiBridge, progressHandlerBridge, socketHandlerBridge };

// Also export functions to update the bridges once real modules are loaded
export function updateBridge(bridgeName, realImpl, options = {}) {
  if (!bridgeName || !realImpl) {
    console.error(`[Bridge] Invalid parameters for updateBridge: ${bridgeName}`);
    return false;
  }
  
  const moduleInfo = bridgeState.modules.get(bridgeName);
  if (!moduleInfo) {
    console.error(`[Bridge] Unknown bridge: ${bridgeName}`);
    return false;
  }
  
  const bridge = moduleInfo.bridge;
  
  try {
    // Track update history
    const updateCount = bridge.__updateCount + 1;
    const timestamp = Date.now();
    
    // Store update history
    if (!bridgeState.updateHistory.has(bridgeName)) {
      bridgeState.updateHistory.set(bridgeName, []);
    }
    
    bridgeState.updateHistory.get(bridgeName).push({
      updateCount,
      timestamp,
      source: options.source || 'unknown'
    });
    
    // Update bridge properties and methods
    Object.keys(bridge).forEach(key => {
      // Skip private properties and handle different types correctly
      if (key.startsWith('__')) return;
      
      try {
        if (typeof realImpl[key] === 'function') {
          bridge[key] = realImpl[key].bind(realImpl);
        } else if (typeof realImpl[key] !== 'undefined') {
          bridge[key] = realImpl[key];
        }
      } catch (propError) {
        console.warn(`[Bridge] Error updating property ${key} on bridge ${bridgeName}:`, propError);
      }
    });
    
    // Update bridge metadata
    bridge.__updateCount = updateCount;
    bridge.__lastUpdated = timestamp;
    
    // Call update handlers
    const handlers = moduleInfo.updateHandlers;
    if (handlers && handlers.size > 0) {
      handlers.forEach((handler, id) => {
        try {
          handler(bridge, realImpl);
        } catch (handlerError) {
          console.warn(`[Bridge] Error in update handler ${id} for ${bridgeName}:`, handlerError);
        }
      });
    }
    
    // Update module info
    moduleInfo.lastUpdated = timestamp;
    bridgeState.modules.set(bridgeName, moduleInfo);
    
    console.log(`[Bridge] Updated ${bridgeName} bridge (update #${updateCount})`);
    return true;
  } catch (error) {
    console.error(`[Bridge] Error updating ${bridgeName} bridge:`, error);
    bridgeState.errors.push({
      bridge: bridgeName,
      error,
      timestamp: Date.now()
    });
    return false;
  }
}

// Convenience methods for specific bridges
export function updateUIBridge(realUI, options = {}) {
  return updateBridge('ui', realUI, { ...options, source: 'updateUIBridge' });
}

export function updateProgressHandlerBridge(realProgressHandler, options = {}) {
  return updateBridge('progressHandler', realProgressHandler, { ...options, source: 'updateProgressHandlerBridge' });
}

export function updateSocketHandlerBridge(realSocketHandler, options = {}) {
  return updateBridge('socketHandler', realSocketHandler, { ...options, source: 'updateSocketHandlerBridge' });
}

// Register update handlers
export function registerUpdateHandler(bridgeName, id, handler) {
  if (!bridgeName || !id || typeof handler !== 'function') {
    console.error('[Bridge] Invalid parameters for registerUpdateHandler');
    return false;
  }
  
  const moduleInfo = bridgeState.modules.get(bridgeName);
  if (!moduleInfo) {
    console.error(`[Bridge] Unknown bridge: ${bridgeName}`);
    return false;
  }
  
  moduleInfo.updateHandlers.set(id, handler);
  
  // If bridge was already updated, call handler immediately
  if (moduleInfo.lastUpdated) {
    try {
      handler(moduleInfo.bridge);
    } catch (error) {
      console.warn(`[Bridge] Error in immediate update handler ${id} for ${bridgeName}:`, error);
    }
  }
  
  return true;
}

// Convenience methods for specific bridges
export function registerUIUpdateHandler(id, handler) {
  return registerUpdateHandler('ui', id, handler);
}

export function registerProgressHandlerUpdateHandler(id, handler) {
  return registerUpdateHandler('progressHandler', id, handler);
}

export function registerSocketHandlerUpdateHandler(id, handler) {
  return registerUpdateHandler('socketHandler', id, handler);
}

// Add bridge initialization tracking
export function getInitializationStatus() {
  const moduleStatuses = {};
  
  bridgeState.modules.forEach((info, name) => {
    moduleStatuses[name] = {
      initialized: info.lastUpdated !== null,
      updateCount: info.bridge.__updateCount,
      created: info.bridge.__created,
      lastUpdated: info.lastUpdated
    };
  });
  
  return {
    initialized: Array.from(bridgeState.modules.values()).every(m => m.lastUpdated !== null),
    moduleStatuses,
    errors: bridgeState.errors,
    version: BRIDGE_VERSION
  };
}

// For moduleLoader integration
export function reportBridgeStatus() {
  const status = getInitializationStatus();
  console.log(`[Bridge] Status: ${status.initialized ? 'Fully Initialized' : 'Partially Initialized'}`);
  console.log(`[Bridge] Module Statuses:`, status.moduleStatuses);
  return status;
}

// Initialize bridge state
bridgeState.initialized = true;
console.log(`Module Bridge v${BRIDGE_VERSION} initialized successfully`);