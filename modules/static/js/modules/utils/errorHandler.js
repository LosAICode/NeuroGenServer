/**
 * NeuroGen Server - Error Handler Module
 * 
 * Centralized error handling for consistent error reporting, logging, and user feedback.
 * Provides structured error management with support for different severity levels
 * and integration with UI components.
 */

const errorHandler = {
  // Configuration
  config: {
    logToConsole: true,
    showInUI: true,
    reportToServer: false,
    serverEndpoint: '/api/log-error',
    debugMode: false
  },
  
  // Error history
  errorLog: [],
  
  // Max errors to keep in history
  maxLogSize: 100,
  
  // Element IDs for error display
  uiElements: {
    errorContainer: 'error-container',
    toastContainer: 'toast-container'
  },
  
  /**
   * Initialize the error handler
   * @param {Object} options - Configuration options
   * @returns {boolean} Success status
   */
  initialize(options = {}) {
    // Apply configuration options
    Object.assign(this.config, options);
    
    // Clear error log on initialization if in production
    if (!this.config.debugMode) {
      this.errorLog = [];
    }
    
    // Check if we're running in debug mode
    this.config.debugMode = this.config.debugMode || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    return true;
  },
  
  /**
   * Handle an error with appropriate logging and UI feedback
   * @param {Error|string} error - Error object or message
   * @param {string} [errorCode] - Error code for categorization
   * @param {boolean} [showToUser=true] - Whether to show error to user
   * @returns {boolean} Whether the error was handled
   */
  handleError(error, errorCode = 'UNKNOWN_ERROR', showToUser = true) {
    // Create structured error object
    const errorObject = this._createErrorObject(error, errorCode);
    
    // Log to console if enabled
    if (this.config.logToConsole) {
      this._logToConsole(errorObject);
    }
    
    // Store in error log
    this._addToErrorLog(errorObject);
    
    // Show to user if enabled and requested
    if (this.config.showInUI && showToUser) {
      this.showError(errorObject.message);
    }
    
    // Report to server if enabled
    if (this.config.reportToServer) {
      this._reportToServer(errorObject);
    }
    
    return true;
  },
  
  /**
   * Show an error message to the user
   * @param {string} message - Error message to display
   * @param {string} [type='error'] - Alert type: error, warning, info
   * @param {number} [duration=5000] - Display duration in ms (for toasts)
   * @returns {boolean} Whether the error was displayed
   */
  showError(message, type = 'error', duration = 5000) {
    // Validate message
    if (!message) return false;
    
    try {
      // Try to find error container
      let errorContainer = document.getElementById(this.uiElements.errorContainer);
      
      // If error container exists, use it
      if (errorContainer) {
        // Create error element
        const errorElement = document.createElement('div');
        errorElement.className = `alert alert-${type}`;
        errorElement.innerHTML = `
          <button type="button" class="close" data-dismiss="alert">&times;</button>
          <strong>${type.charAt(0).toUpperCase() + type.slice(1)}:</strong> ${message}
        `;
        
        // Add close handler
        const closeButton = errorElement.querySelector('.close');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            errorElement.remove();
          });
        }
        
        // Show in container
        errorContainer.appendChild(errorElement);
        
        // Auto-remove after duration
        setTimeout(() => {
          if (errorElement.parentNode) {
            errorElement.remove();
          }
        }, duration);
        
        return true;
      }
      
      // Fallback to toast if container not found
      return this._showToast(message, type, duration);
    } catch (e) {
      // Last resort: console
      console.error(`Error showing error: ${e.message}`);
      console.error(`Original error: ${message}`);
      return false;
    }
  },
  
  /**
   * Show a success message to the user
   * @param {string} message - Success message to display
   * @param {number} [duration=3000] - Display duration in ms
   * @returns {boolean} Whether the message was displayed
   */
  showSuccess(message, duration = 3000) {
    return this.showError(message, 'success', duration);
  },
  
  /**
   * Show a warning message to the user
   * @param {string} message - Warning message to display
   * @param {number} [duration=4000] - Display duration in ms
   * @returns {boolean} Whether the message was displayed
   */
  showWarning(message, duration = 4000) {
    return this.showError(message, 'warning', duration);
  },
  
  /**
   * Show an info message to the user
   * @param {string} message - Info message to display
   * @param {number} [duration=3000] - Display duration in ms
   * @returns {boolean} Whether the message was displayed
   */
  showInfo(message, duration = 3000) {
    return this.showError(message, 'info', duration);
  },
  
  /**
   * Get all logged errors
   * @returns {Array} Array of error objects
   */
  getErrorLog() {
    return [...this.errorLog];
  },
  
  /**
   * Clear the error log
   * @returns {boolean} Success status
   */
  clearErrorLog() {
    this.errorLog = [];
    return true;
  },
  
  /**
   * Create a structured error object
   * @private
   * @param {Error|string} error - Error object or message
   * @param {string} errorCode - Error code
   * @returns {Object} Structured error object
   */
  _createErrorObject(error, errorCode) {
    const timestamp = new Date().toISOString();
    const isErrorObject = error instanceof Error;
    
    return {
      message: isErrorObject ? error.message : String(error),
      code: errorCode,
      timestamp,
      stack: isErrorObject ? error.stack : new Error().stack,
      type: isErrorObject ? error.name : 'Error',
      url: window.location.href,
      userAgent: navigator.userAgent
    };
  },
  
  /**
   * Log error to console
   * @private
   * @param {Object} errorObject - Structured error object
   */
  _logToConsole(errorObject) {
    if (this.config.debugMode) {
      console.error(
        `[${errorObject.code}] ${errorObject.message}`,
        '\nStack:', errorObject.stack,
        '\nDetails:', errorObject
      );
    } else {
      console.error(`[${errorObject.code}] ${errorObject.message}`);
    }
  },
  
  /**
   * Add error to log with size limiting
   * @private
   * @param {Object} errorObject - Structured error object
   */
  _addToErrorLog(errorObject) {
    this.errorLog.push(errorObject);
    
    // Limit log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  },
  
  /**
   * Report error to server
   * @private
   * @param {Object} errorObject - Structured error object
   * @returns {Promise} Promise that resolves when error is reported
   */
  _reportToServer(errorObject) {
    // Don't report if not enabled or no endpoint
    if (!this.config.reportToServer || !this.config.serverEndpoint) {
      return Promise.resolve();
    }
    
    // Return promise for error reporting
    return fetch(this.config.serverEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorObject)
    }).catch(e => {
      // Don't throw if error reporting fails
      console.error('Error reporting error to server:', e);
    });
  },
  
  /**
   * Show a toast message
   * @private
   * @param {string} message - Message to display
   * @param {string} type - Toast type
   * @param {number} duration - Display duration in ms
   * @returns {boolean} Whether the toast was displayed
   */
  _showToast(message, type, duration) {
    try {
      // Try to find toast container
      let toastContainer = document.getElementById(this.uiElements.toastContainer);
      
      // Create if it doesn't exist
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = this.uiElements.toastContainer;
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
      }
      
      // Create toast element
      const toastElement = document.createElement('div');
      toastElement.className = `toast toast-${type}`;
      toastElement.innerHTML = `
        <div class="toast-content">
          <span class="toast-message">${message}</span>
          <button class="toast-close">&times;</button>
        </div>
      `;
      
      // Add close handler
      const closeButton = toastElement.querySelector('.toast-close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          toastElement.remove();
        });
      }
      
      // Add to container
      toastContainer.appendChild(toastElement);
      
      // Trigger animation
      setTimeout(() => {
        toastElement.classList.add('show');
      }, 10);
      
      // Auto-remove after duration
      setTimeout(() => {
        toastElement.classList.remove('show');
        setTimeout(() => {
          if (toastElement.parentNode) {
            toastElement.remove();
          }
        }, 300); // Wait for fade-out animation
      }, duration);
      
      return true;
    } catch (e) {
      console.error('Error showing toast:', e);
      return false;
    }
  }
};

// Export both default and named exports
export default errorHandler;
export const handleError = errorHandler.handleError.bind(errorHandler);
export const showError = errorHandler.showError.bind(errorHandler);
export const showSuccess = errorHandler.showSuccess.bind(errorHandler);
export const showWarning = errorHandler.showWarning.bind(errorHandler);
export const showInfo = errorHandler.showInfo.bind(errorHandler);
export const getErrorLog = errorHandler.getErrorLog.bind(errorHandler);
export const clearErrorLog = errorHandler.clearErrorLog.bind(errorHandler);