/**
 * NeuroGen Server - Enhanced UI Module v4.0
 * 
 * Core UI module optimized for the new Blueprint architecture.
 * Provides comprehensive UI functionality with centralized configuration,
 * enhanced error handling, and integrated health monitoring.
 * 
 * NEW v4.0 Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced 4-method notification system (Toast + Console + System + Error)
 * - Backend connectivity testing with health checks
 * - ES6 module imports with centralized configuration
 * - Optimized for Blueprint architecture integration
 * - Cross-platform UI consistency
 * - Enhanced accessibility and performance
 * 
 * @module utils/ui
 * @version 4.0.0 - Blueprint Architecture Optimization
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, UI_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';
import { updateUIBridge } from '../core/module-bridge.js';
import { 
    getElement as domGetElement, 
    toggleElementVisibility as domToggleElementVisibility
  } from './domUtils.js';
import { registerElement } from '../core/uiRegistry.js';

// Global configuration for UI module
const UI_MODULE_CONFIG = {
  endpoints: {
    health: API_ENDPOINTS.SYSTEM?.HEALTH || '/api/health',
    ...API_ENDPOINTS
  },
  api: API_CONFIG,
  constants: UI_CONFIG || {
    MAX_TOASTS: 5,
    DEFAULT_TOAST_DURATION: 5000,
    ANIMATION_DURATION: 300,
    DEFAULT_POSITION: 'bottom-right'
  },
  events: {
    ...TASK_EVENTS,
    ui_ready: 'ui_module_ready',
    theme_change: 'theme_changed'
  }
};
  
/**
 * Module state using a simple object for state management
 * @private
 */
const moduleState = {
  toastContainer: null,
  modalInstances: new Map(),
  errorHandler: null,
  initialized: false,
  eventListeners: new Set(),
  themeObserver: null
};
  
/**
 * Get the module state
 * @returns {Object} The module state
 * @private
 */
function getState() {
  return moduleState;
}
  
/**
 * Core UI module for basic UI operations
 */
const ui = {
  /**
   * Initialize the UI module
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    const state = getState();
    
    if (state.initialized) {
      console.warn("UI module already initialized");
      return true;
    }
    
    try {
      this.showNotification('Initializing UI Module v4.0', 'info', 'UI Module');
      
      // Test backend connectivity on initialization
      const connectivityResult = await this.testBackendConnectivity();
      if (!connectivityResult.overall) {
        console.warn('UI Module: Backend connectivity test failed, continuing with limited functionality');
      }
      
      // Extract options with defaults
      const {
        createToastContainer = true,
        observeTheme = true,
        errorHandlingLevel = 'standard',
        setupGlobalHandlers = true
      } = options;
      
      // Create toast container if requested
      if (createToastContainer) {
        this.ensureToastContainer();
      }
      
      // Set up theme observation if requested
      if (observeTheme) {
        this._setupThemeObserver();
      }
      
      // Set up global handlers if requested
      if (setupGlobalHandlers) {
        this._setupGlobalHandlers();
      }
      
      // Register this module with the UI registry if available
      if (typeof registerElement === 'function') {
        registerElement('ui', this);
      }
      
      // Mark as initialized
      state.initialized = true;
      
      this.showNotification('UI Module v4.0 initialized successfully', 'success', 'UI Module');
      return true;
    } catch (error) {
      console.error("Error initializing Core UI module:", error);
      return false;
    }
  },

  /**
   * Clean up the UI module (remove event listeners, etc.)
   * @returns {boolean} Success status
   */
  cleanup() {
    try {
      const state = getState();
      
      // Remove all event listeners
      state.eventListeners.forEach(info => {
        const { element, type, handler } = info;
        if (element && element.removeEventListener) {
          element.removeEventListener(type, handler);
        }
      });
      state.eventListeners.clear();
      
      // Disconnect theme observer if exists
      if (state.themeObserver) {
        state.themeObserver.disconnect();
        state.themeObserver = null;
      }
      
      // Clear all modals
      state.modalInstances.forEach((modal) => {
        try {
          if (modal.element && modal.element.parentNode) {
            modal.element.remove();
          }
        } catch (e) {
          console.warn("Error removing modal:", e);
        }
      });
      state.modalInstances.clear();
      
      // Mark as not initialized
      state.initialized = false;
      
      return true;
    } catch (error) {
      console.error("Error cleaning up UI module:", error);
      return false;
    }
  },

  /**
   * Add a tracked event listener that will be properly cleaned up
   * @param {HTMLElement} element - Element to add listener to
   * @param {string} type - Event type
   * @param {Function} handler - Event handler
   * @param {Object} options - Event listener options
   * @private
   */
  _addTrackedEventListener(element, type, handler, options = {}) {
    if (!element || !element.addEventListener) return;
    
    element.addEventListener(type, handler, options);
    
    const state = getState();
    state.eventListeners.add({ element, type, handler });
  },

  /**
   * Set up theme observer to detect theme changes
   * @private
   */
  _setupThemeObserver() {
    try {
      const state = getState();
      
      // Observer callback for theme attribute changes
      const themeCallback = (mutationsList) => {
        for (const mutation of mutationsList) {
          if (mutation.type === 'attributes' && 
              (mutation.attributeName === 'data-theme' || 
               mutation.attributeName === 'class')) {
            this._handleThemeChange();
          }
        }
      };
      
      // Create and start observer
      state.themeObserver = new MutationObserver(themeCallback);
      
      // Observe both document element and body for theme changes
      state.themeObserver.observe(document.documentElement, { 
        attributes: true,
        attributeFilter: ['data-theme', 'class']
      });
      
      state.themeObserver.observe(document.body, {
        attributes: true, 
        attributeFilter: ['data-theme', 'class']
      });
      
      // Initial theme handling
      this._handleThemeChange();
    } catch (error) {
      console.warn("Error setting up theme observer:", error);
    }
  },

  /**
   * Handle theme changes by updating UI elements
   * @private
   */
  _handleThemeChange() {
    try {
      // Detect current theme from HTML or body
      const htmlTheme = document.documentElement.getAttribute('data-theme');
      const bodyTheme = document.body.getAttribute('data-theme');
      const isDark = htmlTheme === 'dark' || bodyTheme === 'dark' || 
                    document.documentElement.classList.contains('dark') ||
                    document.body.classList.contains('dark-theme');
      
      // Apply theme-specific styles to module-generated elements
      const toastContainer = this.getElement('#toast-container');
      if (toastContainer) {
        toastContainer.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }
      
      // Emit theme change event if registered
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('ui.themeChanged', { 
          theme: isDark ? 'dark' : 'light' 
        });
      }
    } catch (error) {
      console.warn("Error handling theme change:", error);
    }
  },

  /**
   * Set up global event handlers
   * @private
   */
  _setupGlobalHandlers() {
    try {
      // Handle escape key for modals
      this._addTrackedEventListener(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
          const state = getState();
          const modalEntries = Array.from(state.modalInstances.entries());
          
          // Get the most recently created modal (last in the array)
          if (modalEntries.length > 0) {
            const [lastModalId] = modalEntries[modalEntries.length - 1];
            this.hideModal(lastModalId);
          }
        }
      });
      
      // Other global handlers as needed
    } catch (error) {
      console.warn("Error setting up global handlers:", error);
    }
  },

  /**
   * Get element - Uses domUtils.getElement to avoid redeclaration
   * @param {string} selector - CSS selector or element ID
   * @returns {HTMLElement} Found element or null
   */
  getElement(selector) {
    try {
      return domGetElement(selector);
    } catch (error) {
      this.handleError(error, "getElement");
      return null;
    }
  },

  /**
   * Ensure the toast container exists in the DOM
   * @returns {HTMLElement} Toast container element
   */
  ensureToastContainer() {
    const state = getState();
    if (state.toastContainer) return state.toastContainer;
    
    try {
      // Create container if it doesn't exist
      const container = document.getElementById('toast-container');
      if (container) {
        state.toastContainer = container;
        return container;
      }
      
      // Create new container with improved positioning and stacking
      const newContainer = document.createElement('div');
      newContainer.id = 'toast-container';
      newContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      newContainer.style.zIndex = '9999';
      newContainer.style.maxWidth = '350px';
      newContainer.style.maxHeight = '80vh';
      newContainer.style.overflow = 'hidden';
      
      // Detect current theme
      const htmlTheme = document.documentElement.getAttribute('data-theme');
      const bodyTheme = document.body.getAttribute('data-theme');
      const isDark = htmlTheme === 'dark' || bodyTheme === 'dark';
      if (isDark) {
        newContainer.setAttribute('data-theme', 'dark');
      }
      
      document.body.appendChild(newContainer);
      
      state.toastContainer = newContainer;
      return newContainer;
    } catch (error) {
      console.error("Error ensuring toast container:", error);
      
      // Create minimal fallback container
      const fallbackContainer = document.createElement('div');
      fallbackContainer.id = 'toast-container-fallback';
      fallbackContainer.style.position = 'fixed';
      fallbackContainer.style.bottom = '20px';
      fallbackContainer.style.right = '20px';
      fallbackContainer.style.zIndex = '9999';
      
      document.body.appendChild(fallbackContainer);
      state.toastContainer = fallbackContainer;
      
      return fallbackContainer;
    }
  },

  /**
   * Show a toast notification
   * @param {string} title - Toast title
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, warning, info)
   * @param {Object} options - Additional options
   * @returns {HTMLElement} Toast element
   */
  showToast(title, message, type = 'info', options = {}) {
    try {
      const {
        duration = 5000,
        dismissible = true,
        position = 'bottom-right',
        onClick = null,
        onClose = null,
        progressBar = false,
        maxWidth = null
      } = typeof options === 'number' ? { duration: options } : options;
      
      // Ensure container exists
      const container = this.ensureToastContainer();
      
      // Limit number of toasts to 5 to prevent UI clutter
      const existingToasts = container.querySelectorAll('.toast');
      if (existingToasts.length >= 5) {
        // Remove oldest toast
        if (existingToasts[0] && existingToasts[0].parentNode) {
          existingToasts[0].remove();
        }
      }
      
      // Create toast element with improved styling and accessibility
      const toastId = 'toast-' + Date.now();
      const toast = document.createElement('div');
      toast.id = toastId;
      toast.className = 'toast show';
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      
      // Add appropriate theme based on container
      if (container.hasAttribute('data-theme')) {
        toast.setAttribute('data-theme', container.getAttribute('data-theme'));
      }
      
      // Apply maximum width if specified
      if (maxWidth) {
        toast.style.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
      }
      
      // Apply custom position if not default
      if (position !== 'bottom-right') {
        // Adjust container position based on requested toast position
        const [vertical, horizontal] = position.split('-');
        
        container.style.top = vertical === 'top' ? '0' : 'auto';
        container.style.bottom = vertical === 'bottom' ? '0' : 'auto';
        container.style.left = horizontal === 'left' ? '0' : 'auto';
        container.style.right = horizontal === 'right' ? '0' : 'auto';
      }
      
      // Get appropriate icon and background class
      let iconClass;
      let bgClass;
      
      switch (type) {
        case 'success':
          iconClass = 'fa-check-circle';
          bgClass = 'bg-success';
          break;
        case 'error':
          iconClass = 'fa-exclamation-circle';
          bgClass = 'bg-danger';
          break;
        case 'warning':
          iconClass = 'fa-exclamation-triangle';
          bgClass = 'bg-warning';
          break;
        default: // info
          iconClass = 'fa-info-circle';
          bgClass = 'bg-info';
      }
      
      // Build toast content
      let toastContent = `
        <div class="toast-header ${bgClass} text-white">
          <i class="fas ${iconClass} me-2"></i>
          <strong class="me-auto">${title}</strong>
          ${dismissible ? '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>' : ''}
        </div>
        <div class="toast-body">
          ${message}
        </div>
      `;
      
      // Add progress bar if requested
      if (progressBar && duration > 0) {
        toastContent += `
          <div class="toast-progress" style="height: 4px; background-color: rgba(0,0,0,0.2)">
            <div id="${toastId}-progress" class="toast-progress-bar ${bgClass}" style="height: 100%; width: 100%;"></div>
          </div>
        `;
      }
      
      toast.innerHTML = toastContent;
      
      // Add to container
      container.appendChild(toast);
      
      // Handle click events
      if (onClick) {
        toast.style.cursor = 'pointer';
        this._addTrackedEventListener(toast, 'click', (event) => {
          // Ignore clicks on close button
          if (event.target.classList.contains('btn-close') || 
              event.target.closest('.btn-close')) {
            return;
          }
          onClick(event);
        });
      }
      
      // Add close button handler
      const closeButton = toast.querySelector('.btn-close');
      if (closeButton) {
        this._addTrackedEventListener(closeButton, 'click', () => {
          this._removeToast(toast, onClose);
        });
      }
      
      // Handle progress bar animation
      if (progressBar && duration > 0) {
        const progressBarEl = document.getElementById(`${toastId}-progress`);
        if (progressBarEl) {
          // Animate using CSS transition for better performance
          progressBarEl.style.transition = `width ${duration}ms linear`;
          
          // Force reflow to ensure transition starts properly
          progressBarEl.getBoundingClientRect();
          
          // Start animation
          progressBarEl.style.width = '0%';
        }
      }
      
      // Auto remove after duration if > 0
      if (duration > 0) {
        setTimeout(() => {
          this._removeToast(toast, onClose);
        }, duration);
      }
      
      return toast;
    } catch (error) {
      console.error("Error showing toast:", error);
      this.handleError(error, "showToast");
      return null;
    }
  },

  /**
   * Helper to remove a toast properly
   * @param {HTMLElement} toast - Toast element to remove
   * @param {Function} onClose - Optional callback when closed
   * @private
   */
  _removeToast(toast, onClose = null) {
    if (!toast || !toast.parentNode) return;
    
    // Add fade-out animation
    toast.classList.add('hiding');
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.15s ease-out';
    
    // Remove after animation
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    }, 150);
  },

  /**
   * Show a loading spinner
   * @param {string} message - Loading message
   * @param {Object} options - Spinner options
   * @returns {Object} Spinner control object
   */
  showLoadingSpinner(message = 'Loading...', options = {}) {
    try {
      const { 
        fullscreen = false,
        cancelable = false,
        onCancel = null,
        spinnerType = 'border', // 'border' or 'grow'
        spinnerSize = fullscreen ? 'normal' : 'small',
        spinnerColor = 'primary',
        containerId = null
      } = typeof options === 'boolean' ? { fullscreen: options } : options;
      
      // Create spinner element
      const spinnerId = 'spinner-' + Date.now();
      const spinner = document.createElement('div');
      spinner.id = spinnerId;
      
      // Set up class based on fullscreen flag
      spinner.className = fullscreen ? 
        'loading-overlay position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50' :
        'loading-indicator p-3 d-inline-flex align-items-center';
        
      spinner.style.zIndex = '9999';
      
      // Determine spinner class based on type and size
      const spinnerClass = `spinner-${spinnerType}` + 
                          (spinnerSize === 'small' ? ' spinner-border-sm' : '') + 
                          ` text-${spinnerColor}`;
      
      // Set spinner content
      if (fullscreen) {
        let content = `
          <div class="bg-white p-4 rounded shadow">
            <div class="d-flex align-items-center">
              <div class="${spinnerClass} me-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span id="${spinnerId}-message">${message}</span>
        `;
        
        // Add cancel button if requested
        if (cancelable) {
          content += `
              <button id="${spinnerId}-cancel" class="btn btn-sm btn-outline-secondary ms-3" type="button">
                Cancel
              </button>
          `;
        }
        
        content += `
            </div>
          </div>
        `;
        
        spinner.innerHTML = content;
      } else {
        spinner.innerHTML = `
          <div class="${spinnerClass} me-2" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span id="${spinnerId}-message">${message}</span>
        `;
      }
      
      // Add to document
      if (fullscreen) {
        document.body.appendChild(spinner);
      } else if (containerId) {
        // If a specific container ID was provided
        const container = document.getElementById(containerId);
        if (container) {
          container.appendChild(spinner);
        } else {
          document.body.appendChild(spinner);
        }
      } else {
        // Try to find loading container, otherwise add to body
        const container = document.querySelector('.loading-container') || document.body;
        container.appendChild(spinner);
      }
      
      // Set up cancel button if present
      const cancelButton = document.getElementById(`${spinnerId}-cancel`);
      if (cancelButton && typeof onCancel === 'function') {
        this._addTrackedEventListener(cancelButton, 'click', () => {
          onCancel();
          if (spinner.parentNode) {
            spinner.remove();
          }
        });
      }
      
      // Store animation start time for accurate progress calculation
      const startTime = Date.now();
      
      // Return enhanced control object
      return {
        id: spinnerId,
        element: spinner,
        
        hide: () => {
          if (!spinner.parentNode) return;
          
          // Add fade-out animation
          spinner.style.opacity = '0';
          spinner.style.transition = 'opacity 0.2s ease-out';
          
          setTimeout(() => {
            if (spinner.parentNode) {
              spinner.remove();
            }
          }, 200);
        },
        
        updateMessage: (newMessage) => {
          const messageElement = document.getElementById(`${spinnerId}-message`);
          if (messageElement) {
            messageElement.textContent = newMessage;
          }
        },
        
        // Method to show progress
        updateProgress: (percent, progressMessage = null) => {
          const messageElement = document.getElementById(`${spinnerId}-message`);
          if (messageElement) {
            const formattedPercent = Math.round(percent);
            if (progressMessage) {
              messageElement.textContent = `${progressMessage} (${formattedPercent}%)`;
            } else {
              messageElement.textContent = `${message} (${formattedPercent}%)`;
            }
          }
        },
        
        // Method to calculate elapsed time
        getElapsedTime: () => {
          return Date.now() - startTime;
        }
      };
    } catch (error) {
      console.error("Error showing loading spinner:", error);
      this.handleError(error, "showLoadingSpinner");
      
      // Return minimal interface that won't cause errors if used
      return {
        id: null,
        element: null,
        hide: () => {},
        updateMessage: () => {},
        updateProgress: () => {},
        getElapsedTime: () => 0
      };
    }
  },

  /**
   * Show a modal dialog
   * @param {string} title - Modal title
   * @param {string} content - Modal content (HTML supported)
   * @param {Object} options - Modal options
   * @returns {Object} Modal control object
   */
  showModal(title, content, options = {}) {
    try {
      const {
        size = 'medium', // small, medium, large, extra-large
        closable = true,
        buttons = [],
        onClose = null,
        onShow = null,
        draggable = false,
        verticalCenter = false,
        animation = true,
        backdrop = closable ? true : 'static',
        id = null
      } = options;
      
      // Generate unique ID if not provided
      const modalId = id || 'modal-' + Date.now();
      
      // Determine size class
      let sizeClass = 'modal-md';
      switch (size) {
        case 'small': sizeClass = 'modal-sm'; break;
        case 'large': sizeClass = 'modal-lg'; break;
        case 'extra-large': sizeClass = 'modal-xl'; break;
      }
      
      // Create modal element
      const modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal fade';
      modal.setAttribute('tabindex', '-1');
      modal.setAttribute('aria-hidden', 'true');
      
      if (!animation) {
        modal.classList.add('no-animation');
        modal.style.transition = 'none';
      }
      
      // Create button HTML
      let buttonHtml = '';
      if (buttons.length > 0) {
        buttonHtml = buttons.map(btn => {
          const btnClass = btn.primary ? 'btn-primary' : (btn.type ? `btn-${btn.type}` : 'btn-secondary');
          return `<button type="button" class="btn ${btnClass}" data-action="${btn.action || ''}">${btn.text}</button>`;
        }).join('');
      } else if (closable) {
        // Default close button if no buttons specified
        buttonHtml = '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>';
      }
      
      // Set modal content with improved accessibility
      modal.innerHTML = `
        <div class="modal-dialog ${sizeClass} ${verticalCenter ? 'modal-dialog-centered' : ''} ${draggable ? 'modal-draggable' : ''}">
          <div class="modal-content">
            <div class="modal-header ${draggable ? 'cursor-move' : ''}">
              <h5 class="modal-title">${title}</h5>
              ${closable ? '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' : ''}
            </div>
            <div class="modal-body">
              ${content}
            </div>
            ${buttonHtml ? `<div class="modal-footer">${buttonHtml}</div>` : ''}
          </div>
        </div>
      `;
      
      // Add to document
      document.body.appendChild(modal);
      
      let bootstrapModal;
      
      // Set up draggable functionality if requested
      if (draggable) {
        this._setupDraggableModal(modal);
      }
      
      // Initialize Bootstrap modal if available
      if (window.bootstrap && window.bootstrap.Modal) {
        bootstrapModal = new window.bootstrap.Modal(modal, {
          keyboard: closable,
          backdrop: backdrop,
          focus: true
        });
        
        // Show the modal
        bootstrapModal.show();
        
        // Call onShow callback after modal is shown
        if (typeof onShow === 'function') {
          modal.addEventListener('shown.bs.modal', onShow);
        }
      } else {
        // Fallback if Bootstrap is not available
        modal.style.display = 'block';
        modal.classList.add('show');
        
        // Create backdrop
        const backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop fade show';
        document.body.appendChild(backdropEl);
        
        // Call onShow callback
        if (typeof onShow === 'function') {
          setTimeout(onShow, 100);
        }
      }
      
      // Add button event listeners
      if (buttons.length > 0) {
        buttons.forEach(btn => {
          const buttonEl = modal.querySelector(`button[data-action="${btn.action || ''}"]`);
          if (buttonEl && btn.onClick) {
            this._addTrackedEventListener(buttonEl, 'click', () => {
              btn.onClick();
              if (btn.closeModal !== false) {
                this.hideModal(modalId);
              }
            });
          }
        });
      }
      
      // Add close event
      modal.addEventListener('hidden.bs.modal', () => {
        if (onClose) onClose();
        
        // Clean up after modal is hidden
        setTimeout(() => {
          if (modal.parentNode) {
            modal.remove();
          }
          
          // Remove backdrop if we created one manually
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop && !window.bootstrap) {
            backdrop.remove();
          }
          
          // Remove from instances map
          const state = getState();
          state.modalInstances.delete(modalId);
        }, 300);
      });
      
      // Store in instances map with enhanced information
      const state = getState();
      state.modalInstances.set(modalId, {
        id: modalId,
        element: modal,
        bootstrapInstance: bootstrapModal,
        timestamp: Date.now(),
        options
      });
      
      // Return control object with enhanced methods
      return {
        id: modalId,
        element: modal,
        
        hide: () => this.hideModal(modalId),
        
        updateContent: (newContent) => {
          const bodyEl = modal.querySelector('.modal-body');
          if (bodyEl) {
            bodyEl.innerHTML = newContent;
          }
        },
        
        updateTitle: (newTitle) => {
          const titleEl = modal.querySelector('.modal-title');
          if (titleEl) {
            titleEl.innerHTML = newTitle;
          }
        },
        
        addButton: (buttonConfig) => {
          const footerEl = modal.querySelector('.modal-footer');
          if (!footerEl) return;
          
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn ${buttonConfig.primary ? 'btn-primary' : (buttonConfig.type ? `btn-${buttonConfig.type}` : 'btn-secondary')}`;
          btn.dataset.action = buttonConfig.action || '';
          btn.textContent = buttonConfig.text;
          
          if (buttonConfig.onClick) {
            this._addTrackedEventListener(btn, 'click', () => {
              buttonConfig.onClick();
              if (buttonConfig.closeModal !== false) {
                this.hideModal(modalId);
              }
            });
          }
          
          footerEl.appendChild(btn);
        }
      };
    } catch (error) {
      console.error("Error showing modal:", error);
      this.handleError(error, "showModal");
      
      return {
        id: null,
        element: null,
        hide: () => {},
        updateContent: () => {},
        updateTitle: () => {},
        addButton: () => {}
      };
    }
  },

  /**
   * Set up draggable functionality for a modal
   * @param {HTMLElement} modal - Modal element
   * @private
   */
  _setupDraggableModal(modal) {
    try {
      const dialogEl = modal.querySelector('.modal-dialog');
      const headerEl = modal.querySelector('.modal-header');
      
      if (!dialogEl || !headerEl) return;
      
      // Make header the drag handle
      headerEl.style.cursor = 'move';
      
      let isDragging = false;
      let startX, startY, startLeft, startTop;
      
      // Set initial position in center
      dialogEl.style.position = 'relative';
      dialogEl.style.margin = '0.5rem auto';
      
      // Mouse down on header starts drag
      this._addTrackedEventListener(headerEl, 'mousedown', (e) => {
        // Only initiate drag on header, not on buttons within header
        if (e.target.closest('.btn-close') || e.target.tagName === 'BUTTON') {
          return;
        }
        
        isDragging = true;
        
        // Get initial positions
        startX = e.clientX;
        startY = e.clientY;
        
        // Get current position of dialog
        const rect = dialogEl.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        
        // Apply some styling while dragging
        dialogEl.classList.add('dragging');
        
        // Prevent text selection during drag
        e.preventDefault();
      });
      
      // Track mouse movement
      this._addTrackedEventListener(document, 'mousemove', (e) => {
        if (!isDragging) return;
        
        // Calculate new position
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        // Apply new position
        dialogEl.style.left = `${deltaX}px`;
        dialogEl.style.top = `${deltaY}px`;
        
        // Ensure dialog stays in viewport
        const rect = dialogEl.getBoundingClientRect();
        
        if (rect.left < 0) dialogEl.style.left = `${deltaX - rect.left}px`;
        if (rect.top < 0) dialogEl.style.top = `${deltaY - rect.top}px`;
        
        const maxRight = window.innerWidth - rect.width;
        const maxBottom = window.innerHeight - rect.height;
        
        if (rect.right > window.innerWidth) dialogEl.style.left = `${deltaX - (rect.right - maxRight)}px`;
        if (rect.bottom > window.innerHeight) dialogEl.style.top = `${deltaY - (rect.bottom - maxBottom)}px`;
      });
      
      // End drag on mouse up
      this._addTrackedEventListener(document, 'mouseup', () => {
        if (!isDragging) return;
        
        isDragging = false;
        dialogEl.classList.remove('dragging');
      });
    } catch (error) {
      console.warn("Error setting up draggable modal:", error);
    }
  },

  /**
   * Hide a modal dialog
   * @param {string} modalId - ID of the modal to hide
   * @returns {boolean} Success status
   */
  hideModal(modalId) {
    try {
      const state = getState();
      const modalInfo = state.modalInstances.get(modalId);
      if (!modalInfo) return false;
      
      if (modalInfo.bootstrapInstance) {
        modalInfo.bootstrapInstance.hide();
      } else {
        // Fallback if Bootstrap is not available
        modalInfo.element.style.display = 'none';
        modalInfo.element.classList.remove('show');
        
        // Remove backdrop
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
          backdrop.remove();
        }
        
        // Remove modal
        if (modalInfo.element.parentNode) {
          modalInfo.element.remove();
        }
        
        // Remove from instances map
        state.modalInstances.delete(modalId);
      }
      
      return true;
    } catch (error) {
      console.error("Error hiding modal:", error);
      this.handleError(error, "hideModal");
      return false;
    }
  },

  /**
   * Update a progress bar
   * @param {string} elementId - ID of the progress bar element
   * @param {number} progress - Progress percentage (0-100)
   * @param {Object} options - Additional options
   * @returns {boolean} Success status
   */
  updateProgressBar(elementId, progress, options = {}) {
    try {
      const { 
        text = null,
        animated = false,
        striped = false
      } = typeof options === 'string' ? { text: options } : options;
      
      // Find the progress bar
      const progressBar = document.getElementById(elementId);
      if (!progressBar) return false;
      
      // Find actual progress bar element (might be child)
      const innerBar = progressBar.classList.contains('progress') ? 
        progressBar.querySelector('.progress-bar') : 
        progressBar;
      
      if (!innerBar) return false;
      
      // Update progress with bounds checking
      const percent = Math.min(100, Math.max(0, progress));
      innerBar.style.width = `${percent}%`;
      innerBar.setAttribute('aria-valuenow', percent);
      
      // Update animation and striping classes
      if (animated) {
        innerBar.classList.add('progress-bar-animated');
      } else {
        innerBar.classList.remove('progress-bar-animated');
      }
      
      if (striped) {
        innerBar.classList.add('progress-bar-striped');
      } else {
        innerBar.classList.remove('progress-bar-striped');
      }
      
      // Update text if provided
      if (text !== null) {
        innerBar.textContent = text;
      }
      
      // Update contextual class based on progress
      const contextClasses = ['bg-danger', 'bg-warning', 'bg-info', 'bg-success'];
      contextClasses.forEach(cls => innerBar.classList.remove(cls));
      
      if (percent < 25) {
        innerBar.classList.add('bg-danger');
      } else if (percent < 50) {
        innerBar.classList.add('bg-warning');
      } else if (percent < 75) {
        innerBar.classList.add('bg-info');
      } else {
        innerBar.classList.add('bg-success');
      }
      
      return true;
    } catch (error) {
      console.error("Error updating progress bar:", error);
      this.handleError(error, "updateProgressBar");
      return false;
    }
  },

  /**
   * Create a progress bar element
   * @param {string} containerId - Container element ID
   * @param {Object} options - Progress bar options
   * @returns {string} ID of the created progress bar
   */
  createProgressBar(containerId, options = {}) {
    try {
      const {
        id = 'progress-' + Date.now(),
        initialProgress = 0,
        showLabel = true,
        height = null,
        striped = false,
        animated = false,
        className = ''
      } = options;
      
      const container = document.getElementById(containerId);
      if (!container) return null;
      
      // Create progress bar container
      const progressContainer = document.createElement('div');
      progressContainer.className = `progress ${className}`;
      progressContainer.id = id + '-container';
      
      if (height) {
        progressContainer.style.height = typeof height === 'number' ? `${height}px` : height;
      }
      
      // Create progress bar element
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.id = id;
      progressBar.role = 'progressbar';
      progressBar.setAttribute('aria-valuenow', initialProgress);
      progressBar.setAttribute('aria-valuemin', '0');
      progressBar.setAttribute('aria-valuemax', '100');
      progressBar.style.width = `${initialProgress}%`;
      
      // Add striped and animated classes if requested
      if (striped) progressBar.classList.add('progress-bar-striped');
      if (animated) progressBar.classList.add('progress-bar-animated');
      
      // Add label if requested
      if (showLabel) {
        progressBar.textContent = `${initialProgress}%`;
      }
      
      // Append to container
      progressContainer.appendChild(progressBar);
      container.appendChild(progressContainer);
      
      return id;
    } catch (error) {
      console.error("Error creating progress bar:", error);
      this.handleError(error, "createProgressBar");
      return null;
    }
  },

  /**
   * Create a confirmation dialog
   * @param {string} title - Dialog title
   * @param {string} message - Confirmation message
   * @param {Function} onConfirm - Callback on confirm
   * @param {Function} onCancel - Callback on cancel
   * @param {Object} options - Additional options
   * @returns {Object} Modal control object
   */
  confirm(title, message, onConfirm, onCancel = null, options = {}) {
    try {
      const {
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        confirmButtonType = 'danger',
        cancelButtonType = 'secondary',
        size = 'small',
        icon = null,
        confirmButtonIcon = null,
        cancelButtonIcon = null
      } = options;
      
      // Format icon if provided
      let iconHtml = '';
      if (icon) {
        let iconClass = '';
        if (typeof icon === 'string') {
          // Assume this is a Font Awesome icon class
          iconClass = icon.startsWith('fa-') ? `fas ${icon}` : icon;
        } else if (icon === true) {
          // Use standard confirmation icon
          iconClass = 'fas fa-question-circle text-warning';
        }
        
        if (iconClass) {
          iconHtml = `<div class="confirmation-icon mb-3 text-center">
            <i class="${iconClass}" style="font-size: 2rem;"></i>
          </div>`;
        }
      }
      
      // Create button configurations
      const buttons = [
        {
          text: cancelText + (cancelButtonIcon ? ` <i class="${cancelButtonIcon}"></i>` : ''),
          action: 'cancel',
          type: cancelButtonType,
          onClick: onCancel || (() => {})
        },
        {
          text: confirmText + (confirmButtonIcon ? ` <i class="${confirmButtonIcon}"></i>` : ''),
          action: 'confirm',
          primary: true,
          type: confirmButtonType,
          onClick: onConfirm
        }
      ];
      
      // Create content with icon if provided
      const content = `
        ${iconHtml}
        <p>${message}</p>
      `;
      
      // Show modal
      return this.showModal(title, content, {
        size,
        buttons,
        verticalCenter: true
      });
    } catch (error) {
      console.error("Error showing confirmation dialog:", error);
      this.handleError(error, "confirm");
      
      // Execute confirm callback directly in case of error
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
      
      return {
        id: null,
        hide: () => {},
        element: null
      };
    }
  },

  /**
   * Show an alert dialog
   * @param {string} title - Alert title
   * @param {string} message - Alert message
   * @param {string} type - Alert type (success, error, warning, info)
   * @param {Function} onClose - Callback on close
   * @returns {Object} Modal control object
   */
  alert(title, message, type = 'info', onClose = null) {
    try {
      // Determine icon based on type
      let icon;
      let iconColor;
      
      switch (type) {
        case 'success': 
          icon = 'fa-check-circle';
          iconColor = 'text-success';
          break;
        case 'error': 
          icon = 'fa-exclamation-circle';
          iconColor = 'text-danger';
          break;
        case 'warning': 
          icon = 'fa-exclamation-triangle';
          iconColor = 'text-warning';
          break;
        default: 
          icon = 'fa-info-circle';
          iconColor = 'text-info';
      }
      
      return this.showModal(title, `
        <div class="d-flex align-items-start">
          <i class="fas ${icon} ${iconColor} me-3" style="font-size: 1.5rem;"></i>
          <div>${message}</div>
        </div>
      `, {
        size: 'small',
        onClose,
        verticalCenter: true,
        buttons: [
          {
            text: 'OK',
            action: 'ok',
            primary: true
          }
        ]
      });
    } catch (error) {
      console.error("Error showing alert dialog:", error);
      this.handleError(error, "alert");
      
      // Execute close callback directly in case of error
      if (typeof onClose === 'function') {
        onClose();
      }
      
      return {
        id: null,
        hide: () => {},
        element: null
      };
    }
  },

  /**
   * Create a prompt dialog
   * @param {string} title - Prompt title
   * @param {string} message - Prompt message
   * @param {Function} onSubmit - Callback on submit
   * @param {Function} onCancel - Callback on cancel
   * @param {Object} options - Additional options
   * @returns {Object} Modal control object
   */
  prompt(title, message, onSubmit, onCancel = null, options = {}) {
    try {
      const {
        defaultValue = '',
        placeholder = '',
        submitText = 'Submit',
        cancelText = 'Cancel',
        inputType = 'text',
        validator = null,
        minLength = 0,
        maxLength = null,
        required = false,
        autoFocus = true,
        multiline = false,
        rows = 3
      } = options;
      
      const inputId = 'prompt-input-' + Date.now();
      
      // Determine if we're using textarea or input
      const inputHtml = multiline ?
        `<textarea 
          class="form-control" 
          id="${inputId}" 
          placeholder="${placeholder}" 
          rows="${rows}"
          ${required ? 'required' : ''}
          ${maxLength ? `maxlength="${maxLength}"` : ''}
        >${defaultValue}</textarea>` :
        `<input 
          type="${inputType}" 
          class="form-control" 
          id="${inputId}" 
          placeholder="${placeholder}" 
          value="${defaultValue}"
          ${required ? 'required' : ''}
          ${minLength > 0 ? `minlength="${minLength}"` : ''}
          ${maxLength ? `maxlength="${maxLength}"` : ''}
        >`;
      
      // Create error message container
      const errorId = 'prompt-error-' + Date.now();
      
      const modal = this.showModal(title, `
        <div class="mb-3">
          <label for="${inputId}" class="form-label">${message}</label>
          ${inputHtml}
          <div id="${errorId}" class="invalid-feedback"></div>
        </div>
      `, {
        size: 'small',
        verticalCenter: true,
        buttons: [
          {
            text: cancelText,
            action: 'cancel',
            onClick: onCancel || (() => {})
          },
          {
            text: submitText,
            action: 'submit',
            primary: true,
            onClick: () => {
              const input = document.getElementById(inputId);
              if (!input) return;
              
              const value = input.value;
              
              // Handle validation
              if (required && (!value || value.trim() === '')) {
                input.classList.add('is-invalid');
                const errorEl = document.getElementById(errorId);
                if (errorEl) errorEl.textContent = 'This field is required';
                return;
              }
              
              if (minLength > 0 && value.length < minLength) {
                input.classList.add('is-invalid');
                const errorEl = document.getElementById(errorId);
                if (errorEl) errorEl.textContent = `Minimum length is ${minLength} characters`;
                return;
              }
              
              if (maxLength && value.length > maxLength) {
                input.classList.add('is-invalid');
                const errorEl = document.getElementById(errorId);
                if (errorEl) errorEl.textContent = `Maximum length is ${maxLength} characters`;
                return;
              }
              
              // Custom validator function
              if (validator) {
                const validationResult = validator(value);
                if (validationResult !== true) {
                  input.classList.add('is-invalid');
                  const errorEl = document.getElementById(errorId);
                  if (errorEl) errorEl.textContent = validationResult || 'Invalid input';
                  return;
                }
              }
              
              // If we get here, validation passed
              onSubmit(value);
            },
            closeModal: false // Don't close automatically to allow validation
          }
        ]
      });
      
      // Focus the input after modal is shown
      if (autoFocus) {
        setTimeout(() => {
          const input = document.getElementById(inputId);
          if (input) {
            input.focus();
            
            // If there's a default value, position cursor at the end
            if (defaultValue && input.tagName !== 'TEXTAREA') {
              input.setSelectionRange(defaultValue.length, defaultValue.length);
            }
          }
        }, 300);
      }
      
      // Add enter key handler if not multiline
      if (!multiline) {
        setTimeout(() => {
          const input = document.getElementById(inputId);
          if (input) {
            this._addTrackedEventListener(input, 'keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const submitBtn = modal.element.querySelector('button[data-action="submit"]');
                if (submitBtn) submitBtn.click();
              }
            });
          }
        }, 300);
      }
      
      return modal;
    } catch (error) {
      console.error("Error showing prompt dialog:", error);
      this.handleError(error, "prompt");
      
      // Execute submit callback directly with default value in case of error
      if (typeof onSubmit === 'function') {
        onSubmit(options.defaultValue || '');
      }
      
      return {
        id: null,
        hide: () => {},
        element: null
      };
    }
  },

  /**
   * Toggle element visibility - uses domUtils.toggleElementVisibility
   * @param {string} elementId - ID of the element
   * @param {boolean} visible - Whether to show or hide
   * @param {string} displayMode - Display mode to use when showing
   * @returns {boolean} Success status
   */
  toggleElementVisibility(elementId, visible, displayMode = 'block') {
    try {
      const element = document.getElementById(elementId);
      if (!element) return false;
      
      // Use the imported function when display mode isn't needed or when using default display mode
      if (displayMode === 'block') {
        return domToggleElementVisibility(elementId, visible);
      }
      
      // Custom implementation for non-standard display modes
      if (visible) {
        // Show element with specified display mode
        element.style.display = displayMode;
        
        // If element has fade class, animate it
        if (element.classList.contains('fade')) {
          // First ensure element is visible but transparent
          element.style.opacity = '0';
          
          // Force a reflow to ensure transition works
          element.offsetHeight;
          
          // Now trigger fade in
          element.style.opacity = '1';
          element.style.transition = 'opacity 0.15s ease-in';
        }
      } else {
        // If element has fade class, animate before hiding
        if (element.classList.contains('fade')) {
          element.style.opacity = '0';
          element.style.transition = 'opacity 0.15s ease-out';
          
          // Hide after animation
          setTimeout(() => {
            element.style.display = 'none';
          }, 150);
        } else {
          // Hide immediately
          element.style.display = 'none';
        }
      }
      
      return true;
    } catch (error) {
      console.error("Error toggling element visibility:", error);
      this.handleError(error, "toggleElementVisibility");
      return false;
    }
  },

  /**
   * Add or remove a class from an element
   * @param {string} elementId - ID of the element
   * @param {string} className - Class to toggle
   * @param {boolean} add - Whether to add or remove
   * @returns {boolean} Success status
   */
  toggleClass(elementId, className, add) {
    try {
      const element = document.getElementById(elementId);
      if (!element) return false;
      
      if (add) {
        element.classList.add(className);
      } else {
        element.classList.remove(className);
      }
      
      return true;
    } catch (error) {
      console.error("Error toggling class:", error);
      this.handleError(error, "toggleClass");
      return false;
    }
  },

  /**
   * Safe way to find elements - first tries by ID, then by selector
   * @param {string} idOrSelector - ID or CSS selector
   * @returns {HTMLElement} Found element or null
   */
  findElement(idOrSelector) {
    try {
      // First try by ID for better performance
      let element = document.getElementById(idOrSelector);

      // If not found, try as a selector
      if (!element) {
        element = document.querySelector(idOrSelector);
      }

      return element;
    } catch (error) {
      console.error(`Error finding element with selector "${idOrSelector}":`, error);
      this.handleError(error, "findElement");
      return null;
    }
  },

  /**
   * Find all elements matching a selector
   * @param {string} selector - CSS selector
   * @param {HTMLElement|string} context - Context element or selector
   * @returns {Array<HTMLElement>} Array of elements
   */
  findElements(selector, context = document) {
    try {
      let contextElement = context;

      // If context is a string, find the element
      if (typeof context === 'string') {
        contextElement = this.findElement(context);
      }

      // Fall back to document if context not found
      if (!contextElement) {
        contextElement = document;
      }

      // Return as array for consistent handling
      return Array.from(contextElement.querySelectorAll(selector));
    } catch (error) {
      console.error(`Error finding elements with selector "${selector}":`, error);
      this.handleError(error, "findElements");
      return [];
    }
  },

  /**
   * Set error handler for UI module
   * @param {Function} handler - Error handler function
   */
  setErrorHandler(handler) {
    if (typeof handler === 'function') {
      const state = getState();
      state.errorHandler = handler;
    }
  },

  /**
   * Handle errors within the UI module
   * @param {Error} error - Error object
   * @param {string} context - Error context
   */
  handleError(error, context = 'UI') {
    console.error(`[${context}]`, error);

    // Use error handler if set
    const state = getState();
    if (typeof state.errorHandler === 'function') {
      state.errorHandler(error, context);
    }

    // Check if error registry exists
    if (window.errorHandler && typeof window.errorHandler.logError === 'function') {
      window.errorHandler.logError(error, {
        module: 'ui',
        context,
        timestamp: new Date().toISOString()
      });
    }
  },

  /**
   * Enhanced notification system with 4-method delivery (v4.0)
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, success, warning, error)
   * @param {string} title - Notification title
   */
  showNotification(message, type = 'info', title = 'UI Module') {
    // Method 1: Toast notifications
    this.showToast(title, message, type);
    
    // Method 2: Console logging with styling
    const styles = {
      error: 'color: #dc3545; font-weight: bold;',
      warning: 'color: #fd7e14; font-weight: bold;',
      success: 'color: #198754; font-weight: bold;',
      info: 'color: #0d6efd;'
    };
    console.log(`%c[${title}] ${message}`, styles[type] || styles.info);
    
    // Method 3: System notification (if available)
    if (window.NeuroGen?.notificationHandler) {
      window.NeuroGen.notificationHandler.show({
        title, message, type, module: 'ui'
      });
    }
    
    // Method 4: Error reporting to centralized handler
    if (type === 'error' && window.NeuroGen?.errorHandler) {
      window.NeuroGen.errorHandler.logError({
        module: 'ui', message, severity: type
      });
    }
  },

  /**
   * Test backend connectivity for UI module (v4.0)
   * @returns {Promise<Object>} Backend connectivity status
   */
  async testBackendConnectivity() {
    const results = {
      overall: false,
      details: {},
      timestamp: new Date().toISOString(),
      errors: []
    };

    try {
      // Test main health endpoint
      const healthResponse = await fetch(UI_MODULE_CONFIG.endpoints.health, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      results.details.health = {
        status: healthResponse.status,
        ok: healthResponse.ok,
        endpoint: UI_MODULE_CONFIG.endpoints.health
      };

      if (healthResponse.ok) {
        results.overall = true;
        this.showNotification('Backend connectivity verified', 'success', 'UI Module');
      } else {
        throw new Error(`Health endpoint returned ${healthResponse.status}`);
      }

    } catch (error) {
      results.errors.push({
        endpoint: UI_MODULE_CONFIG.endpoints.health,
        error: error.message
      });
      this.showNotification(`Backend connectivity failed: ${error.message}`, 'error', 'UI Module');
    }

    return results;
  },

  /**
   * Get UI module health status (v4.0)
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    const state = getState();
    
    return {
      module: 'ui',
      version: '4.0.0',
      status: state.initialized ? 'healthy' : 'initializing',
      features: {
        configurationDriven: true,
        enhancedNotifications: true,
        backendConnectivity: true,
        toastSystem: true,
        modalSystem: true,
        themeObserver: !!state.themeObserver
      },
      configuration: {
        endpoints: UI_MODULE_CONFIG.endpoints,
        constants: UI_MODULE_CONFIG.constants,
        eventsConfigured: Object.keys(UI_MODULE_CONFIG.events).length
      },
      statistics: {
        activeModals: state.modalInstances.size,
        eventListeners: state.eventListeners.size,
        toastContainer: !!state.toastContainer
      }
    };
  }
};

// Update the bridge with the real UI module
updateUIBridge(ui);

console.log("UI module initialized and bridge updated");  

// Export the module
export default ui;

// Named exports for commonly used functions
export const showToast = ui.showToast.bind(ui);
export const showLoadingSpinner = ui.showLoadingSpinner.bind(ui);
export const showModal = ui.showModal.bind(ui);
export const hideModal = ui.hideModal.bind(ui);
export const updateProgressBar = ui.updateProgressBar.bind(ui);
export const confirm = ui.confirm.bind(ui);
export const alert = ui.alert.bind(ui);
export const prompt = ui.prompt.bind(ui);
export const toggleElementVisibility = ui.toggleElementVisibility.bind(ui);
export const toggleClass = ui.toggleClass.bind(ui);
export const findElement = ui.findElement.bind(ui);
export const findElements = ui.findElements.bind(ui);
export const createProgressBar = ui.createProgressBar.bind(ui);

// v4.0 Enhanced exports
export const showNotification = ui.showNotification.bind(ui);
export const testBackendConnectivity = ui.testBackendConnectivity.bind(ui);
export const getHealthStatus = ui.getHealthStatus.bind(ui);