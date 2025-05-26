/**
 * Error Handler Module
 * 
 * Centralizes error handling and provides UI feedback for errors.
 * Logs errors and shows appropriate error messages to the user.
 * 
 * Features:
 * - Structured error categorization
 * - Graceful UI error presentation
 * - Detailed error logging
 * - Comprehensive error history management
 * - API error handling utilities
 * - Stack trace parsing and visualization
 */

// Import dependencies without circular references
let ui = null;

/**
 * Error Handler module for centralized error management
 */
const errorHandler = {
  // Error types and corresponding messages
  ERROR_TYPES: {
    NETWORK: {
      code: 'NETWORK_ERROR',
      message: 'Network connection issue. Please check your internet connection and try again.'
    },
    SERVER: {
      code: 'SERVER_ERROR',
      message: 'Server error occurred. Please try again later or contact support.'
    },
    VALIDATION: {
      code: 'VALIDATION_ERROR',
      message: 'Please check your input and try again.'
    },
    FILE_ACCESS: {
      code: 'FILE_ACCESS_ERROR',
      message: 'Unable to access the specified file or directory. Please check permissions.'
    },
    PROCESSING: {
      code: 'PROCESSING_ERROR',
      message: 'Error occurred while processing your request.'
    },
    SOCKET: {
      code: 'SOCKET_ERROR',
      message: 'Real-time connection error. Updates may be delayed.'
    },
    UI_MISSING_ELEMENT: {
      code: 'UI_MISSING_ELEMENT',
      message: 'UI element not found. Some functionality may be limited.'
    },
    MODULE_LOADING: {
      code: 'MODULE_LOADING_ERROR',
      message: 'Failed to load required module. Application may not work correctly.'
    },
    UNKNOWN: {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred. Please try again.'
    }
  },
  
  // Maximum number of errors to keep in history
  MAX_ERROR_HISTORY: 50,
  
  // Store error history
  errorHistory: [],
  
  // Initialization state
  initialized: false,
  
  // Configuration options
  config: {
    logToConsole: true,
    saveToLocalStorage: true,
    emitEvents: true,
    showNotifications: true,
    detailedLogForTypes: ['NETWORK', 'SERVER', 'PROCESSING'],
    debug: false
  },
  
  /**
   * Initialize the error handler
   * @param {Object} options - Configuration options
   * @returns {boolean} - Success state
   */
  initialize(options = {}) {
    if (this.initialized) {
      console.log("Error handler already initialized");
      return true;
    }
    
    // Merge options with defaults
    this.config = {
      ...this.config,
      ...options
    };
    
    // Enable debug mode on localhost
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      this.config.debug = true;
    }
    
    // Try to load UI module dynamically to avoid circular references
    this.loadUiModule();
    
    // Set up global error handler
    this.setupGlobalErrorHandler();
    
    // Load error history from localStorage if available
    this.loadErrorHistory();
    
    this.initialized = true;
    console.log("Error handler initialized");
    return true;
  },
  
  /**
   * Load UI module dynamically to avoid circular references
   */
  async loadUiModule() {
    try {
      const module = await import('./ui.js');
      ui = module.default;
      if (this.config.debug) {
        console.log("UI module loaded in errorHandler");
      }
    } catch (err) {
      console.warn('UI module not loaded for error handler:', err);
    }
  },
  
  /**
   * Set up global error handling
   */
  setupGlobalErrorHandler() {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', event => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleError(event.reason, 'UNKNOWN');
      return false;
    });
    
    // Catch global errors
    window.addEventListener('error', event => {
      console.error('Global error:', event.error || event.message);
      this.handleError(event.error || new Error(event.message), 'UNKNOWN');
      return false;
    });
    
    // Override fetch errors
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Handle HTTP error status codes
        if (!response.ok) {
          const error = new Error(`HTTP error: ${response.status} ${response.statusText}`);
          error.response = response;
          error.status = response.status;
          
          // Categorize error based on status code
          let errorType = 'SERVER';
          if (response.status === 0 || response.status === 408) {
            errorType = 'NETWORK';
          } else if (response.status >= 400 && response.status < 500) {
            errorType = 'VALIDATION';
          }
          
          // Log error but don't show UI notification yet (let calling code handle it)
          this.logError(error, errorType);
        }
        
        return response;
      } catch (error) {
        // Handle network errors
        console.error('Fetch error:', error);
        this.handleError(error, 'NETWORK');
        throw error;
      }
    };
    
    // Register with event registry if available
    setTimeout(() => this.registerWithEventRegistry(), 0);
    
    console.log("Global error handlers set up");
  },
  
  /**
   * Register with event registry if available
   */
  registerWithEventRegistry() {
    try {
      if (typeof window.eventRegistry?.on === 'function') {
        // Listen for module errors
        window.eventRegistry.on('module.error', (data) => {
          this.handleError(data.error, data.type || 'MODULE_LOADING', true, {
            module: data.moduleName
          });
        });
        
        if (this.config.debug) {
          console.log("ErrorHandler registered with eventRegistry");
        }
      }
    } catch (e) {
      console.warn("Could not register with eventRegistry:", e);
    }
  },
  
  /**
   * Handle an error with appropriate logging and UI feedback
   * @param {Error|string} error - The error object or message
   * @param {string} type - Error type (from ERROR_TYPES)
   * @param {boolean} showUI - Whether to show UI notification
   * @param {Object} [options] - Additional options
   * @param {string} [options.message] - Optional override message
   * @param {string} [options.title] - Optional title for UI notification
   * @param {Function} [options.callback] - Optional callback after error is handled
   * @returns {Object} - Error details
   */
  handleError(error, type = 'UNKNOWN', showUI = true, options = {}) {
    try {
      // Get error object if string was provided
      if (typeof error === 'string') {
        error = new Error(error);
      } else if (!error) {
        error = new Error('Unknown error');
      }
      
      // Add type to error for reference
      error.errorType = type;
      
      // Log error
      this.logError(error, type);
      
      // Show error in UI if requested and enabled in config
      if (showUI && this.config.showNotifications) {
        const errorType = this.ERROR_TYPES[type] || this.ERROR_TYPES.UNKNOWN;
        this.showErrorNotification(error, errorType, options);
      }
      
      // Call callback if provided
      if (options.callback && typeof options.callback === 'function') {
        try {
          options.callback(error, type);
        } catch (callbackError) {
          console.error('Error in error callback:', callbackError);
        }
      }
      
      // Emit error event to any subscribers
      if (this.config.emitEvents) {
        this.emitErrorEvent(error, type);
      }
      
      return {
        error,
        type,
        timestamp: new Date().toISOString()
      };
    } catch (handlerError) {
      // Last resort logging if error handler itself fails
      console.error('Error in error handler:', handlerError);
      console.error('Original error:', error);
      
      // Try to show a basic alert if everything else fails
      try {
        const errorMessage = error?.message || 'Unknown error';
        alert(`An error occurred: ${errorMessage}`);
      } catch (e) {
        // Nothing more we can do
      }
      
      return {
        error,
        type,
        handlerError,
        timestamp: new Date().toISOString()
      };
    }
  },
  
  /**
   * Log error to console and error history
   * @param {Error} error - The error object
   * @param {string} type - Error type
   */
  logError(error, type = 'UNKNOWN') {
    try {
      // Prevent logging null errors
      if (!error) {
        console.warn('Attempted to log null error');
        return;
      }
      
      // Log to console if enabled
      if (this.config.logToConsole) {
        console.error(`[${type}]`, error);
        
        // Log additional details for certain error types
        if (this.config.detailedLogForTypes.includes(type)) {
          if (error.response) {
            console.error('Response:', error.response);
          }
          if (error.request) {
            console.error('Request:', error.request);
          }
          if (error.config) {
            console.error('Config:', error.config);
          }
        }
      }
      
      // Create error item for history
      const errorItem = {
        message: error.message || 'Unknown error',
        stack: error.stack || null,
        type: type,
        code: this.ERROR_TYPES[type]?.code || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
        details: error.details || null,
        status: error.status || null
      };
      
      // Add to error history
      this.errorHistory.unshift(errorItem);
      
      // Limit error history size
      if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
        this.errorHistory = this.errorHistory.slice(0, this.MAX_ERROR_HISTORY);
      }
      
      // Save to localStorage if enabled
      if (this.config.saveToLocalStorage) {
        this.saveErrorHistory();
      }
    } catch (e) {
      console.error('Error in logError:', e);
    }
  },
  
  /**
   * Save error history to localStorage
   */
  saveErrorHistory() {
    try {
      if (typeof localStorage !== 'undefined') {
        // Only store essential information to save space
        const simplifiedHistory = this.errorHistory.map(err => ({
          message: err.message,
          type: err.type,
          code: err.code,
          timestamp: err.timestamp
        }));
        
        localStorage.setItem('errorHistory', JSON.stringify(simplifiedHistory));
      }
    } catch (e) {
      console.warn('Could not save error history to localStorage:', e);
    }
  },
  
  /**
   * Load error history from localStorage
   */
  loadErrorHistory() {
    try {
      if (typeof localStorage !== 'undefined') {
        const storedHistory = localStorage.getItem('errorHistory');
        
        if (storedHistory) {
          const parsedHistory = JSON.parse(storedHistory);
          
          // Only use valid entries
          this.errorHistory = Array.isArray(parsedHistory) ? parsedHistory : [];
          
          if (this.config.debug) {
            console.log(`Loaded ${this.errorHistory.length} error history items`);
          }
        }
      }
    } catch (e) {
      console.warn('Could not load error history from localStorage:', e);
      this.errorHistory = [];
    }
  },
  
  /**
   * Show error notification to the user
   * @param {Error} error - The error object
   * @param {Object} errorType - Error type object from ERROR_TYPES
   * @param {Object} [options] - Additional options
   * @param {string} [options.message] - Optional override message
   * @param {string} [options.title] - Optional title for UI notification
   */
  showErrorNotification(error, errorType, options = {}) {
    try {
      // Determine user-friendly message
      let userMessage = options.message || errorType.message;
      
      // Include specific error message if available and not too technical
      if (error.message && 
          !options.message &&
          !error.message.includes('undefined') && 
          !error.message.includes('null') &&
          error.message.length < 100) {
        userMessage = `${errorType.message} ${error.message}`;
      }
      
      // Set title
      const title = options.title || 'Error';
      
      // If ui module is available, use it to show toast
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast(title, userMessage, 'error');
      } else {
        // Fallback to console when UI not available
        console.error(`${title}: ${userMessage}`);
        
        // Try to create a simple error display
        this.createBasicErrorDisplay(title, userMessage);
      }
    } catch (e) {
      console.error('Error showing notification:', e);
    }
  },
  
  /**
   * Create a basic error display when UI module is not available
   * @param {string} title - Error title
   * @param {string} message - Error message
   */
  createBasicErrorDisplay(title, message) {
    try {
      // Check if error container exists
      let errorContainer = document.getElementById('app-loading-error');
      
      // Create it if needed
      if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = 'app-loading-error';
        errorContainer.className = 'alert alert-danger m-3';
        document.body.prepend(errorContainer);
      }
      
      // Set error message
      errorContainer.innerHTML = `<strong>${title}:</strong> ${message}`;
      errorContainer.style.display = 'block';
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        errorContainer.style.display = 'none';
      }, 5000);
    } catch (e) {
      // Last resort - nothing more we can do
      console.error('Failed to create basic error display:', e);
    }
  },
  
  /**
   * Emit an error event for subscribers
   * @param {Error} error - The error object
   * @param {string} type - Error type
   */
  emitErrorEvent(error, type) {
    try {
      // Try to use eventRegistry if available (preferred)
      if (typeof window.eventRegistry?.emit === 'function') {
        window.eventRegistry.emit('app.error', {
          error: error,
          type: type,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Fallback to custom event
      const errorEvent = new CustomEvent('app.error', {
        detail: {
          error: error,
          type: type,
          timestamp: new Date().toISOString()
        },
        bubbles: true,
        cancelable: true
      });
      
      // Dispatch on document for global access
      document.dispatchEvent(errorEvent);
    } catch (e) {
      console.error('Error emitting error event:', e);
    }
  },
  
  /**
   * Show success notification to the user
   * @param {string} title - Success title
   * @param {string} message - Success message
   */
  showSuccess(title, message) {
    try {
      // Log success for tracking
      console.log(`[SUCCESS] ${title}: ${message}`);
      
      // Show toast notification using UI module
      if (ui && typeof ui.showToast === 'function') {
        ui.showToast(title, message, 'success');
      } else {
        console.log(`${title}: ${message}`);
      }
    } catch (e) {
      console.error('Error showing success:', e);
    }
  },
  
  /**
   * Display an enhanced error message with details
   * @param {string} title - Error title
   * @param {Error|string} error - The error object or message
   */
  displayEnhancedErrorMessage(title, error) {
    try {
      // If error is a string, convert to Error object
      if (typeof error === 'string') {
        error = new Error(error);
      }
      
      // Log error
      this.logError(error, 'UNKNOWN');
      
      // Extract error details
      const errorDetails = {
        message: error.message || 'Unknown error',
        stack: error.stack ? this.parseStackTrace(error.stack) : [],
        timestamp: new Date().toISOString()
      };
      
      // Create error message HTML
      const errorHTML = `
        <div class="alert alert-danger mb-3">
          <h5 class="alert-heading"><i class="fas fa-exclamation-circle me-2"></i>${title}</h5>
          <p>${errorDetails.message}</p>
          ${this.renderStackTrace(errorDetails.stack)}
        </div>
        <p class="small text-muted">
          <i class="fas fa-clock me-1"></i> ${new Date().toLocaleTimeString()}
        </p>
      `;
      
      // Show error in UI
      if (ui && typeof ui.showErrorAlert === 'function') {
        ui.showErrorAlert(title, errorHTML);
      } else {
        console.warn("ui.showErrorAlert not available, falling back to basic alert");
        if (ui && typeof ui.showToast === 'function') {
          ui.showToast(title, errorDetails.message, 'error');
        } else {
          this.createBasicErrorDisplay(title, errorDetails.message);
        }
      }
    } catch (e) {
      console.error('Error displaying enhanced message:', e);
      // Last resort
      alert(`${title}: ${error.message || 'Unknown error'}`);
    }
  },
  
  /**
   * Parse a stack trace into a structured array
   * @param {string} stackTrace - Raw stack trace string
   * @returns {Array} - Array of stack frame objects
   */
  parseStackTrace(stackTrace) {
    try {
      if (!stackTrace) return [];
      
      // Split stack trace into lines
      const lines = stackTrace.split('\n').filter(line => line.trim());
      
      // Extract relevant information from each line
      return lines.map(line => {
        const frame = {};
        
        // Extract function name
        const functionMatch = line.match(/at\s+([^\s]+)\s+\(/);
        if (functionMatch && functionMatch[1]) {
          frame.function = functionMatch[1];
        }
        
        // Extract file path and line number
        const fileMatch = line.match(/\(([^:]+):(\d+):(\d+)\)/);
        if (fileMatch) {
          frame.file = fileMatch[1];
          frame.line = parseInt(fileMatch[2], 10);
          frame.column = parseInt(fileMatch[3], 10);
        } else {
          // Alternative pattern for when there's no parentheses
          const altMatch = line.match(/at\s+([^:]+):(\d+):(\d+)/);
          if (altMatch) {
            frame.file = altMatch[1];
            frame.line = parseInt(altMatch[2], 10);
            frame.column = parseInt(altMatch[3], 10);
          }
        }
        
        // Clean up file path
        if (frame.file) {
          frame.file = frame.file.split('/').pop(); // Just get the filename
        } else {
          frame.file = 'unknown';
        }
        
        // Add raw line for reference
        frame.raw = line.trim();
        
        return frame;
      });
    } catch (e) {
      console.error('Error parsing stack trace:', e);
      return [];
    }
  },
  
  /**
   * Render stack trace as HTML
   * @param {Array} stackFrames - Array of stack frame objects
   * @returns {string} - HTML representation of stack trace
   */
  renderStackTrace(stackFrames) {
    if (!stackFrames || stackFrames.length === 0) {
      return '';
    }
    
    try {
      // Only show first 5 frames to avoid overwhelming the user
      const frames = stackFrames.slice(0, 5);
      
      // Create HTML for stack trace
      return `
        <div class="stack-trace small mt-3">
          <p class="mb-1">Stack trace:</p>
          <ul class="list-group">
            ${frames.map(frame => `
              <li class="list-group-item list-group-item-danger py-1">
                ${frame.function ? `<span class="badge bg-secondary me-1">${frame.function}</span>` : ''}
                <small>${frame.file}:${frame.line}</small>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } catch (e) {
      console.error('Error rendering stack trace:', e);
      return '';
    }
  },
  
  /**
   * Get most recent errors
   * @param {number} count - Number of errors to retrieve
   * @returns {Array} - Array of error objects
   */
  getRecentErrors(count = 10) {
    return this.errorHistory.slice(0, count);
  },
  
  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory = [];
    
    if (this.config.saveToLocalStorage) {
      try {
        localStorage.removeItem('errorHistory');
      } catch (e) {
        console.warn('Could not clear error history from localStorage:', e);
      }
    }
  },
  
  /**
   * Get a categorized count of errors by type
   * @returns {Object} - Object with counts by error type
   */
  getErrorStatsByType() {
    const stats = {};
    
    // Initialize all error types with zero count
    Object.keys(this.ERROR_TYPES).forEach(type => {
      stats[type] = 0;
    });
    
    // Count errors by type
    this.errorHistory.forEach(error => {
      if (error.type in stats) {
        stats[error.type]++;
      } else {
        stats.UNKNOWN++;
      }
    });
    
    return stats;
  },
  
  /**
   * Create a human-readable error message
   * @param {Error|string} error - Error object or message
   * @param {string} type - Error type
   * @returns {string} - Human-readable error message
   */
  createUserFriendlyMessage(error, type = 'UNKNOWN') {
    // Get error type information
    const errorType = this.ERROR_TYPES[type] || this.ERROR_TYPES.UNKNOWN;
    
    // Get error message
    let errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
    
    // Clean up error message
    errorMessage = errorMessage
      .replace(/^Error:?\s*/i, '')  // Remove "Error:" prefix
      .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
      .trim();                       // Trim whitespace
    
    // Create user-friendly message
    let userMessage = errorType.message;
    
    // Add specific error message if it's meaningful and not just technical details
    if (errorMessage &&
        !errorMessage.includes('undefined') &&
        !errorMessage.includes('null') &&
        !errorMessage.includes('object') &&
        errorMessage.length < 100) {
      userMessage = `${userMessage} ${errorMessage}`;
    }
    
    return userMessage;
  }
};

// Export the module
export default errorHandler;

// Named exports for the public methods only
export const initialize = errorHandler.initialize.bind(errorHandler);
export const handleError = errorHandler.handleError.bind(errorHandler);
export const logError = errorHandler.logError.bind(errorHandler);
export const showErrorNotification = errorHandler.showErrorNotification.bind(errorHandler);
export const createBasicErrorDisplay = errorHandler.createBasicErrorDisplay.bind(errorHandler);
export const emitErrorEvent = errorHandler.emitErrorEvent.bind(errorHandler);
export const showSuccess = errorHandler.showSuccess.bind(errorHandler);
export const displayEnhancedErrorMessage = errorHandler.displayEnhancedErrorMessage.bind(errorHandler);
export const parseStackTrace = errorHandler.parseStackTrace.bind(errorHandler);
export const renderStackTrace = errorHandler.renderStackTrace.bind(errorHandler);
export const getRecentErrors = errorHandler.getRecentErrors.bind(errorHandler);
export const clearErrorHistory = errorHandler.clearErrorHistory.bind(errorHandler);
export const getErrorStatsByType = errorHandler.getErrorStatsByType.bind(errorHandler);
export const createUserFriendlyMessage = errorHandler.createUserFriendlyMessage.bind(errorHandler);
