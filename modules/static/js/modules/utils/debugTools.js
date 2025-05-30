/**
 * Debug Tools Module
 * 
 * Provides debugging utilities for development and troubleshooting.
 * 
 * @module utils/debugTools
 * @version 3.0.0
 */

/**
 * Debug configuration
 */
const DEBUG_CONFIG = {
  enabled: location.hostname === 'localhost' || location.hostname === '127.0.0.1',
  logLevel: 'debug', // 'error', 'warn', 'info', 'debug'
  persistLogs: false,
  maxLogEntries: 1000
};

/**
 * Debug logger class
 */
class DebugLogger {
  constructor() {
    this.logs = [];
    this.listeners = new Set();
  }

  log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      stack: new Error().stack
    };

    this.logs.push(entry);
    
    // Trim logs if exceeded max
    if (this.logs.length > DEBUG_CONFIG.maxLogEntries) {
      this.logs.shift();
    }

    // Console output
    this.consoleOutput(level, message, data);

    // Notify listeners
    this.notifyListeners(entry);

    // Persist if enabled
    if (DEBUG_CONFIG.persistLogs) {
      this.persistLog(entry);
    }
  }

  shouldLog(level) {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(DEBUG_CONFIG.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  consoleOutput(level, message, data) {
    const prefix = `[${new Date().toISOString().split('T')[1].split('.')[0]}]`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message, data);
        break;
      case 'warn':
        console.warn(prefix, message, data);
        break;
      case 'info':
        console.info(prefix, message, data);
        break;
      case 'debug':
        console.log(prefix, message, data);
        break;
    }
  }

  persistLog(entry) {
    try {
      const storedLogs = JSON.parse(localStorage.getItem('neurogen_debug_logs') || '[]');
      storedLogs.push(entry);
      
      // Keep only last 100 entries in storage
      if (storedLogs.length > 100) {
        storedLogs.splice(0, storedLogs.length - 100);
      }
      
      localStorage.setItem('neurogen_debug_logs', JSON.stringify(storedLogs));
    } catch (error) {
      console.error('Failed to persist log:', error);
    }
  }

  notifyListeners(entry) {
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (error) {
        console.error('Debug listener error:', error);
      }
    });
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getLogs(filter = {}) {
    let logs = [...this.logs];
    
    if (filter.level) {
      logs = logs.filter(log => log.level === filter.level);
    }
    
    if (filter.startTime) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(filter.startTime));
    }
    
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      logs = logs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.data).toLowerCase().includes(searchLower)
      );
    }
    
    return logs;
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem('neurogen_debug_logs');
  }

  exportLogs() {
    const data = {
      logs: this.logs,
      config: DEBUG_CONFIG,
      exportTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      location: window.location.href
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurogen-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Performance profiler
 */
class PerformanceProfiler {
  constructor() {
    this.marks = new Map();
    this.measures = new Map();
  }

  mark(name) {
    this.marks.set(name, performance.now());
    if (DEBUG_CONFIG.enabled) {
      console.log(`⏱️ Performance mark: ${name}`);
    }
  }

  measure(name, startMark, endMark = null) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    
    if (!start) {
      console.warn(`Start mark '${startMark}' not found`);
      return;
    }
    
    const duration = end - start;
    this.measures.set(name, { duration, start, end });
    
    if (DEBUG_CONFIG.enabled) {
      console.log(`⏱️ Performance measure '${name}': ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }

  getMeasures() {
    return Object.fromEntries(this.measures);
  }

  clearMarks() {
    this.marks.clear();
  }

  clearMeasures() {
    this.measures.clear();
  }
}

/**
 * Module inspector
 */
class ModuleInspector {
  static getLoadedModules() {
    if (!window.NeuroGen) return [];
    
    return Object.keys(window.NeuroGen.modules || {}).map(name => ({
      name,
      loaded: true,
      instance: window.NeuroGen.modules[name],
      hasInit: typeof window.NeuroGen.modules[name].init === 'function',
      initialized: window.NeuroGen.modules[name].initialized || false
    }));
  }

  static getModuleState(moduleName) {
    const module = window.NeuroGen?.modules?.[moduleName];
    if (!module) return null;
    
    return {
      name: moduleName,
      state: module.state || {},
      config: module.config || {},
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(module))
        .filter(name => typeof module[name] === 'function' && name !== 'constructor')
    };
  }

  static async testModule(moduleName) {
    const module = window.NeuroGen?.modules?.[moduleName];
    if (!module) {
      return { success: false, error: 'Module not found' };
    }
    
    const results = {
      name: moduleName,
      tests: []
    };
    
    // Test initialization
    if (typeof module.init === 'function' && !module.initialized) {
      try {
        await module.init();
        results.tests.push({ test: 'initialization', success: true });
      } catch (error) {
        results.tests.push({ test: 'initialization', success: false, error: error.message });
      }
    }
    
    // Test health check
    if (typeof module.getHealthStatus === 'function') {
      try {
        const health = await module.getHealthStatus();
        results.tests.push({ test: 'health_check', success: true, data: health });
      } catch (error) {
        results.tests.push({ test: 'health_check', success: false, error: error.message });
      }
    }
    
    return results;
  }
}

/**
 * Network inspector
 */
class NetworkInspector {
  constructor() {
    this.requests = [];
    this.interceptors = new Map();
    this.setupInterception();
  }

  setupInterception() {
    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const [url, options = {}] = args;
      
      const request = {
        id: Date.now() + Math.random(),
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        startTime,
        status: 'pending'
      };
      
      this.requests.push(request);
      
      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        
        request.status = response.ok ? 'success' : 'error';
        request.statusCode = response.status;
        request.duration = endTime - startTime;
        request.response = response;
        
        if (DEBUG_CONFIG.enabled) {
          console.log(`🌐 ${request.method} ${request.url} - ${response.status} (${request.duration.toFixed(2)}ms)`);
        }
        
        return response;
      } catch (error) {
        request.status = 'error';
        request.error = error.message;
        request.duration = performance.now() - startTime;
        
        if (DEBUG_CONFIG.enabled) {
          console.error(`🌐 ${request.method} ${request.url} - Failed (${request.duration.toFixed(2)}ms)`, error);
        }
        
        throw error;
      }
    };
  }

  getRequests(filter = {}) {
    let requests = [...this.requests];
    
    if (filter.url) {
      requests = requests.filter(req => req.url.includes(filter.url));
    }
    
    if (filter.method) {
      requests = requests.filter(req => req.method === filter.method);
    }
    
    if (filter.status) {
      requests = requests.filter(req => req.status === filter.status);
    }
    
    return requests;
  }

  clearRequests() {
    this.requests = [];
  }
}

// Create singleton instances
const logger = new DebugLogger();
const profiler = new PerformanceProfiler();
const networkInspector = DEBUG_CONFIG.enabled ? new NetworkInspector() : null;

/**
 * Debug tools public API
 */
const debugTools = {
  // Configuration
  config: DEBUG_CONFIG,
  
  // Logging
  log: (message, data) => logger.log('debug', message, data),
  info: (message, data) => logger.log('info', message, data),
  warn: (message, data) => logger.log('warn', message, data),
  error: (message, data) => logger.log('error', message, data),
  
  // Log management
  getLogs: (filter) => logger.getLogs(filter),
  clearLogs: () => logger.clearLogs(),
  exportLogs: () => logger.exportLogs(),
  addLogListener: (callback) => logger.addListener(callback),
  
  // Performance profiling
  mark: (name) => profiler.mark(name),
  measure: (name, startMark, endMark) => profiler.measure(name, startMark, endMark),
  getMeasures: () => profiler.getMeasures(),
  clearMarks: () => profiler.clearMarks(),
  clearMeasures: () => profiler.clearMeasures(),
  
  // Module inspection
  getLoadedModules: () => ModuleInspector.getLoadedModules(),
  getModuleState: (name) => ModuleInspector.getModuleState(name),
  testModule: (name) => ModuleInspector.testModule(name),
  
  // Network inspection
  getRequests: (filter) => networkInspector?.getRequests(filter) || [],
  clearRequests: () => networkInspector?.clearRequests(),
  
  // Utility methods
  enable: () => {
    DEBUG_CONFIG.enabled = true;
    localStorage.setItem('neurogen_debug_enabled', 'true');
  },
  
  disable: () => {
    DEBUG_CONFIG.enabled = false;
    localStorage.removeItem('neurogen_debug_enabled');
  },
  
  setLogLevel: (level) => {
    if (['error', 'warn', 'info', 'debug'].includes(level)) {
      DEBUG_CONFIG.logLevel = level;
      localStorage.setItem('neurogen_debug_level', level);
    }
  },
  
  // Development utilities
  inspectElement: (selector) => {
    const element = document.querySelector(selector);
    if (!element) {
      console.warn(`Element not found: ${selector}`);
      return null;
    }
    
    return {
      element,
      computedStyles: window.getComputedStyle(element),
      eventListeners: getEventListeners ? getEventListeners(element) : 'Not available',
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      dataset: { ...element.dataset }
    };
  },
  
  // Memory profiling
  getMemoryUsage: () => {
    if (!performance.memory) {
      return { available: false };
    }
    
    return {
      available: true,
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
    };
  }
};

// Check for stored debug settings
if (localStorage.getItem('neurogen_debug_enabled') === 'true') {
  DEBUG_CONFIG.enabled = true;
}

const storedLogLevel = localStorage.getItem('neurogen_debug_level');
if (storedLogLevel) {
  DEBUG_CONFIG.logLevel = storedLogLevel;
}

// Export debug tools
export default debugTools;

// Also export individual classes for advanced usage
export { DebugLogger, PerformanceProfiler, ModuleInspector, NetworkInspector };

// Expose to window in debug mode
if (DEBUG_CONFIG.enabled && typeof window !== 'undefined') {
  window.debugTools = debugTools;
  console.log('🔧 Debug tools enabled. Access via window.debugTools');
}