/**
 * Core UI Module
 * 
 * Provides basic UI functionality used by core modules,
 * especially the error handler.
 * Enhanced with performance optimizations, improved error handling,
 * and additional utility features.
 * 
 * @module ui
 * @version 1.2.1
 */

// Import DOM utilities directly from domUtils.js to avoid redeclarations
import { 
    getElement as domGetElement, 
    getElements, 
    getUIElements, 
    createElement, 
    addEventListeners,
    toggleElementVisibility as domToggleElementVisibility
  } from './domUtils.js';
  
  // Import from uiRegistry without unused imports to prevent circular dependencies
  import * as uiRegistry from '../core/uiRegistry.js';
  
  // Explicitly use the registerElement function to avoid unused import warning
  const { registerElement } = uiRegistry;
  
  /**
   * Module state using WeakMap for better memory management
   * and a Symbol for private state to avoid external manipulation
   */
  const STATE_KEY = Symbol('ui-state');
  const moduleState = new WeakMap();
  
  // Initialize module state
  const state = {
    toastContainer: null,
    modalInstances: new Map(),
    errorHandler: null,
    initialized: false,
    eventListeners: new Set(),
    themeObserver: null
  };
  
  // Store state in WeakMap
  moduleState.set(STATE_KEY, state);
  
  /**
   * Get the module state
   * @returns {Object} The module state
   * @private
   */
  function getState() {
    return moduleState.get(STATE_KEY);
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
        console.log("Initializing Core UI module...");
        
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
        
        console.log("Core UI module initialized successfully");
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
       * Create a basic tab interface
       * @param {string} containerId - Container element ID
       * @param {Array} tabs - Array of tab objects
       * @param {Object} options - Additional options
       * @returns {Object} Tab control object
       */
      createTabs(containerId, tabs, options = {}) {
        try {
          const {
            activeTab = 0,
            fade = true,
            vertical = false,
            pills = false,
            fill = false,
            justified = false,
            navClass = '',
            contentClass = '',
            onTabChange = null
          } = options;
          
          const container = document.getElementById(containerId);
          if (!container) return null;
          
          // Create tab navigation
          const navId = `${containerId}-nav`;
          const nav = document.createElement('ul');
          nav.id = navId;
          
          // Apply nav classes based on options
          const navClasses = ['nav'];
          if (pills) {
            navClasses.push('nav-pills');
          } else {
            navClasses.push('nav-tabs');
          }
          
          if (vertical) navClasses.push('flex-column');
          if (fill) navClasses.push('nav-fill');
          if (justified) navClasses.push('nav-justified');
          if (navClass) navClasses.push(navClass);
          
          nav.className = navClasses.join(' ');
          nav.setAttribute('role', 'tablist');
          
          // Create tab content container
          const contentId = `${containerId}-content`;
          const content = document.createElement('div');
          content.id = contentId;
          content.className = `tab-content ${contentClass}`;
          
          if (vertical) {
            // Create wrapper for vertical tabs
            const wrapper = document.createElement('div');
            wrapper.className = 'row';
            
            const navCol = document.createElement('div');
            navCol.className = 'col-md-3';
            navCol.appendChild(nav);
            
            const contentCol = document.createElement('div');
            contentCol.className = 'col-md-9';
            contentCol.appendChild(content);
            
            wrapper.appendChild(navCol);
            wrapper.appendChild(contentCol);
            
            container.appendChild(wrapper);
          } else {
            // Add standard horizontal layout
            container.appendChild(nav);
            container.appendChild(content);
          }
          
          // Track active tab index
          let currentActiveIndex = Math.min(activeTab, tabs.length - 1);
          
          // Add tabs
          tabs.forEach((tab, index) => {
            const isActive = index === currentActiveIndex;
            const tabId = tab.id || `${containerId}-tab-${index}`;
            const paneId = `${tabId}-pane`;
            
            // Create nav item
            const navItem = document.createElement('li');
            navItem.className = 'nav-item';
            navItem.role = 'presentation';
            
            // Add badge if present
            let badgeHtml = '';
            if (tab.badge) {
              const badgeType = tab.badge.type || 'primary';
              badgeHtml = `<span class="badge bg-${badgeType} ms-1">${tab.badge.text}</span>`;
            }
            
            // Add icon if present
            let iconHtml = '';
            if (tab.icon) {
              iconHtml = `<i class="${tab.icon} me-1"></i>`;
            }
            
            navItem.innerHTML = `
              <button class="nav-link ${isActive ? 'active' : ''}" 
                id="${tabId}" 
                data-bs-toggle="tab" 
                data-bs-target="#${paneId}" 
                type="button" 
                role="tab" 
                aria-controls="${paneId}" 
                aria-selected="${isActive ? 'true' : 'false'}"
                ${tab.disabled ? 'disabled' : ''}>
                ${iconHtml}${tab.title}${badgeHtml}
              </button>
            `;
            
            // Create tab pane
            const tabPane = document.createElement('div');
            tabPane.className = `tab-pane ${fade ? 'fade' : ''} ${isActive ? (fade ? 'show active' : 'active') : ''}`;
            tabPane.id = paneId;
            tabPane.role = 'tabpanel';
            tabPane.setAttribute('aria-labelledby', tabId);
            
            // Set content
            if (typeof tab.content === 'string') {
              tabPane.innerHTML = tab.content;
            } else if (tab.content instanceof HTMLElement) {
              tabPane.appendChild(tab.content);
            }
            
            // Add to containers
            nav.appendChild(navItem);
            content.appendChild(tabPane);
          });
          
          // Set up event handlers
          const handleTabChange = (tabEl) => {
            if (!tabEl) return;
            
            // Find tab index
            const tabButtons = Array.from(nav.querySelectorAll('.nav-link'));
            const newIndex = tabButtons.indexOf(tabEl);
            
            if (newIndex === -1 || newIndex === currentActiveIndex) return;
            
            // Update active index
            currentActiveIndex = newIndex;
            
            // Call change callback if provided
            if (typeof onTabChange === 'function') {
              onTabChange(currentActiveIndex, tabs[currentActiveIndex]);
            }
          };
          
          // Use Bootstrap's tab event if available
          if (window.bootstrap) {
            this._addTrackedEventListener(container, 'shown.bs.tab', (e) => {
              handleTabChange(e.target);
            });
          } else {
            // Custom handler for non-Bootstrap
            nav.querySelectorAll('.nav-link').forEach(tabButton => {
              this._addTrackedEventListener(tabButton, 'click', (event) => {
                // Skip if disabled
                if (tabButton.disabled || tabButton.hasAttribute('disabled')) {
                  event.preventDefault();
                  return;
                }
                
                // Deactivate all tabs
                nav.querySelectorAll('.nav-link').forEach(btn => {
                  btn.classList.remove('active');
                  btn.setAttribute('aria-selected', 'false');
                });
                
                // Deactivate all panes
                content.querySelectorAll('.tab-pane').forEach(pane => {
                  pane.classList.remove('show', 'active');
                });
                
                // Activate clicked tab
                tabButton.classList.add('active');
                tabButton.setAttribute('aria-selected', 'true');
                
                // Activate corresponding pane
                const target = tabButton.getAttribute('data-bs-target');
                const pane = document.querySelector(target);
                if (pane) {
                  pane.classList.add('active');
                  
                  if (fade) {
                    // Trigger fade animation
                    setTimeout(() => {
                      pane.classList.add('show');
                    }, 10);
                  }
                }
                
                // Call change handler
                handleTabChange(tabButton);
              });
            });
          }
          
          // Return control object
          return {
            containerId,
            navId,
            contentId,
            
            // Get current active tab
            getActiveIndex: () => currentActiveIndex,
            
            // Activate a specific tab
            activateTab: (index) => {
              if (index < 0 || index >= tabs.length) return false;
              
              const tabButton = nav.querySelectorAll('.nav-link')[index];
              if (tabButton) {
                if (window.bootstrap && window.bootstrap.Tab) {
                  new window.bootstrap.Tab(tabButton).show();
                } else {
                  tabButton.click();
                }
                return true;
              }
              return false;
            },
            
            // Add a new tab
            addTab: (tab) => {
              const index = tabs.length;
              tabs.push(tab);
              
              const tabId = tab.id || `${containerId}-tab-${index}`;
              const paneId = `${tabId}-pane`;
              
              // Create nav item
              const navItem = document.createElement('li');
              navItem.className = 'nav-item';
              navItem.role = 'presentation';
              
              // Add badge if present
              let badgeHtml = '';
              if (tab.badge) {
                const badgeType = tab.badge.type || 'primary';
                badgeHtml = `<span class="badge bg-${badgeType} ms-1">${tab.badge.text}</span>`;
              }
              
              // Add icon if present
              let iconHtml = '';
              if (tab.icon) {
                iconHtml = `<i class="${tab.icon} me-1"></i>`;
              }
              
              navItem.innerHTML = `
                <button class="nav-link" 
                  id="${tabId}" 
                  data-bs-toggle="tab" 
                  data-bs-target="#${paneId}" 
                  type="button" 
                  role="tab" 
                  aria-controls="${paneId}" 
                  aria-selected="false"
                  ${tab.disabled ? 'disabled' : ''}>
                  ${iconHtml}${tab.title}${badgeHtml}
                </button>
              `;
              
              // Create tab pane
              const tabPane = document.createElement('div');
              tabPane.className = `tab-pane ${fade ? 'fade' : ''}`;
              tabPane.id = paneId;
              tabPane.role = 'tabpanel';
              tabPane.setAttribute('aria-labelledby', tabId);
              
              // Set content
              if (typeof tab.content === 'string') {
                tabPane.innerHTML = tab.content;
              } else if (tab.content instanceof HTMLElement) {
                tabPane.appendChild(tab.content);
              }
              
              // Add to containers
              nav.appendChild(navItem);
              content.appendChild(tabPane);
              
              // Set up event handlers for the new tab
              const tabButton = navItem.querySelector('.nav-link');
              if (!window.bootstrap) {
                this._addTrackedEventListener(tabButton, 'click', (event) => {
// Skip if disabled
if (tabButton.disabled || tabButton.hasAttribute('disabled')) {
    event.preventDefault();
    return;
  }
  
  // Deactivate all tabs
  nav.querySelectorAll('.nav-link').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  
  // Deactivate all panes
  content.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('show', 'active');
  });
  
  // Activate clicked tab
  tabButton.classList.add('active');
  tabButton.setAttribute('aria-selected', 'true');
  
  // Activate corresponding pane
  const target = tabButton.getAttribute('data-bs-target');
  const pane = document.querySelector(target);
  if (pane) {
    pane.classList.add('active');
    
    if (fade) {
      // Trigger fade animation
      setTimeout(() => {
        pane.classList.add('show');
      }, 10);
    }
  }
  
  // Update active index
  currentActiveIndex = index;
  
  // Call change callback if provided
  if (typeof onTabChange === 'function') {
    onTabChange(currentActiveIndex, tabs[currentActiveIndex]);
  }
});
}

return index;
},

// Remove a tab
removeTab: (index) => {
if (index < 0 || index >= tabs.length) return false;

// Get tab elements
const tabElements = nav.querySelectorAll('.nav-item');
const paneElements = content.querySelectorAll('.tab-pane');

if (index >= tabElements.length) return false;

// Remove elements
tabElements[index].remove();
if (index < paneElements.length) {
paneElements[index].remove();
}

// Remove from tabs array
tabs.splice(index, 1);

// Update active tab if necessary
if (currentActiveIndex === index) {
// Activate previous tab if possible, otherwise next
if (index > 0) {
  currentActiveIndex = index - 1;
} else if (tabs.length > 0) {
  currentActiveIndex = 0;
} else {
  currentActiveIndex = -1;
}

// Activate new tab if available
if (currentActiveIndex >= 0) {
  const newActiveButton = nav.querySelectorAll('.nav-link')[currentActiveIndex];
  if (newActiveButton) {
    if (window.bootstrap && window.bootstrap.Tab) {
      new window.bootstrap.Tab(newActiveButton).show();
    } else {
      newActiveButton.click();
    }
  }
}
} else if (currentActiveIndex > index) {
// Adjust active index if we removed a tab before it
currentActiveIndex--;
}

return true;
},

// Update a tab's content
updateTabContent: (index, newContent) => {
if (index < 0 || index >= tabs.length) return false;

const paneElements = content.querySelectorAll('.tab-pane');
if (index >= paneElements.length) return false;

const pane = paneElements[index];

// Clear existing content
pane.innerHTML = '';

// Set new content
if (typeof newContent === 'string') {
pane.innerHTML = newContent;
} else if (newContent instanceof HTMLElement) {
pane.appendChild(newContent);
}

return true;
},

// Update a tab's title
updateTabTitle: (index, newTitle) => {
if (index < 0 || index >= tabs.length) return false;

const tabButtons = nav.querySelectorAll('.nav-link');
if (index >= tabButtons.length) return false;

const button = tabButtons[index];

// Preserve any icons or badges
const icon = button.querySelector('i');
const badge = button.querySelector('.badge');

if (icon || badge) {
// Create temporary element to hold new content
const temp = document.createElement('span');
temp.innerHTML = newTitle;

// Clear button content
button.innerHTML = '';

// Re-add icon if it existed
if (icon) {
  button.appendChild(icon);
  button.appendChild(document.createTextNode(' '));
}

// Add new title text
button.appendChild(document.createTextNode(newTitle));

// Re-add badge if it existed
if (badge) {
  button.appendChild(document.createTextNode(' '));
  button.appendChild(badge);
}
} else {
// Simple update if no special elements
button.textContent = newTitle;
}

return true;
}
};
} catch (error) {
console.error("Error creating tabs:", error);
this.handleError(error, "createTabs");
return null;
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
* Safely create and add an element to the DOM
* @param {string} tag - Tag name
* @param {Object} attributes - Element attributes
* @param {HTMLElement|string} parent - Parent element or selector
* @returns {HTMLElement} Created element
*/
createElement(tag, attributes = {}, parent = null) {
try {
const element = document.createElement(tag);

// Set attributes
for (const [key, value] of Object.entries(attributes)) {
if (key === 'text' || key === 'textContent') {
element.textContent = value;
} else if (key === 'html' || key === 'innerHTML') {
element.innerHTML = value;
} else if (key === 'class' || key === 'className') {
if (Array.isArray(value)) {
element.className = value.join(' ');
} else {
element.className = value;
}
} else if (key === 'style' && typeof value === 'object') {
Object.assign(element.style, value);
} else if (key === 'dataset' && typeof value === 'object') {
Object.entries(value).forEach(([dataKey, dataValue]) => {
element.dataset[dataKey] = dataValue;
});
} else if (key === 'on' && typeof value === 'object') {
// Event listeners
Object.entries(value).forEach(([event, handler]) => {
if (typeof handler === 'function') {
  this._addTrackedEventListener(element, event, handler);
}
});
} else {
element.setAttribute(key, value);
}
}

// Add to parent if provided
if (parent) {
let parentElement = parent;

// If parent is a string, find the element
if (typeof parent === 'string') {
parentElement = this.findElement(parent);
}

if (parentElement && typeof parentElement.appendChild === 'function') {
parentElement.appendChild(element);
}
}

return element;
} catch (error) {
console.error(`Error creating ${tag} element:`, error);
this.handleError(error, "createElement");
return null;
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
* Create an accordion component
* @param {string} containerId - Container element ID
* @param {Array} items - Array of accordion items
* @param {Object} options - Accordion options
* @returns {Object} Accordion control object
*/
createAccordion(containerId, items, options = {}) {
try {
const {
openIndex = -1,  // -1 means all closed
alwaysOpen = false,
flush = false,
className = ''
} = options;

const container = document.getElementById(containerId);
if (!container) return null;

// Create accordion element
const accordionId = `${containerId}-accordion`;
const accordion = document.createElement('div');
accordion.id = accordionId;
accordion.className = `accordion ${flush ? 'accordion-flush' : ''} ${className}`;

// Add each item
items.forEach((item, index) => {
const itemId = item.id || `${accordionId}-item-${index}`;
const headerId = `${itemId}-header`;
const collapseId = `${itemId}-collapse`;
const isOpen = index === openIndex;

// Create item element
const itemEl = document.createElement('div');
itemEl.className = 'accordion-item';
itemEl.id = itemId;

// Add header/button
itemEl.innerHTML = `
<h2 class="accordion-header" id="${headerId}">
<button class="accordion-button ${isOpen ? '' : 'collapsed'}" 
  type="button" 
  data-bs-toggle="collapse" 
  data-bs-target="#${collapseId}" 
  aria-expanded="${isOpen ? 'true' : 'false'}" 
  aria-controls="${collapseId}">
  ${item.title}
</button>
</h2>
<div id="${collapseId}" 
class="accordion-collapse collapse ${isOpen ? 'show' : ''}" 
aria-labelledby="${headerId}" 
${!alwaysOpen ? `data-bs-parent="#${accordionId}"` : ''}>
<div class="accordion-body">
  ${typeof item.content === 'string' ? item.content : ''}
</div>
</div>
`;

// Add to accordion
accordion.appendChild(itemEl);

// Handle non-string content
if (typeof item.content !== 'string' && item.content instanceof HTMLElement) {
const body = itemEl.querySelector('.accordion-body');
if (body) {
body.innerHTML = '';
body.appendChild(item.content);
}
}
});

// Add to container
container.appendChild(accordion);

// Set up event handlers if Bootstrap is not available
if (!window.bootstrap) {
accordion.querySelectorAll('.accordion-button').forEach((button, index) => {
this._addTrackedEventListener(button, 'click', () => {
const isExpanded = button.getAttribute('aria-expanded') === 'true';
const collapseId = button.getAttribute('data-bs-target').substring(1);
const collapseEl = document.getElementById(collapseId);

if (!alwaysOpen) {
  // Close all other items
  accordion.querySelectorAll('.accordion-collapse.show').forEach(el => {
    if (el.id !== collapseId) {
      el.classList.remove('show');
      
      // Find corresponding button
      const headerId = el.getAttribute('aria-labelledby');
      const header = document.getElementById(headerId);
      if (header) {
        const otherButton = header.querySelector('.accordion-button');
        if (otherButton) {
          otherButton.classList.add('collapsed');
          otherButton.setAttribute('aria-expanded', 'false');
        }
      }
    }
  });
}

// Toggle current item
if (isExpanded) {
  // Close
  button.classList.add('collapsed');
  button.setAttribute('aria-expanded', 'false');
  if (collapseEl) {
    collapseEl.classList.remove('show');
  }
} else {
  // Open
  button.classList.remove('collapsed');
  button.setAttribute('aria-expanded', 'true');
  if (collapseEl) {
    collapseEl.classList.add('show');
  }
}
});
});
}

// Return control object
return {
accordionId,

// Open a specific item
openItem: (index) => {
if (index < 0 || index >= items.length) return false;

const buttons = accordion.querySelectorAll('.accordion-button');
if (index < buttons.length) {
const button = buttons[index];
const isExpanded = button.getAttribute('aria-expanded') === 'true';

if (!isExpanded) {
  if (window.bootstrap && window.bootstrap.Collapse) {
    // Use Bootstrap if available
    const collapseId = button.getAttribute('data-bs-target').substring(1);
    const collapseEl = document.getElementById(collapseId);
    if (collapseEl) {
      new window.bootstrap.Collapse(collapseEl, { toggle: true });
    }
  } else {
    // Manual trigger
    button.click();
  }
}

return true;
}

return false;
},

// Close a specific item
closeItem: (index) => {
if (index < 0 || index >= items.length) return false;

const buttons = accordion.querySelectorAll('.accordion-button');
if (index < buttons.length) {
const button = buttons[index];
const isExpanded = button.getAttribute('aria-expanded') === 'true';

if (isExpanded) {
  if (window.bootstrap && window.bootstrap.Collapse) {
    // Use Bootstrap if available
    const collapseId = button.getAttribute('data-bs-target').substring(1);
    const collapseEl = document.getElementById(collapseId);
    if (collapseEl) {
      new window.bootstrap.Collapse(collapseEl, { toggle: true });
    }
  } else {
    // Manual trigger
    button.click();
  }
}

return true;
}

return false;
},

// Add a new item
addItem: (item) => {
const index = items.length;
items.push(item);

const itemId = item.id || `${accordionId}-item-${index}`;
const headerId = `${itemId}-header`;
const collapseId = `${itemId}-collapse`;

// Create item element
const itemEl = document.createElement('div');
itemEl.className = 'accordion-item';
itemEl.id = itemId;

// Add header/button
itemEl.innerHTML = `
<h2 class="accordion-header" id="${headerId}">
  <button class="accordion-button collapsed" 
    type="button" 
    data-bs-toggle="collapse" 
    data-bs-target="#${collapseId}" 
    aria-expanded="false" 
    aria-controls="${collapseId}">
    ${item.title}
  </button>
</h2>
<div id="${collapseId}" 
  class="accordion-collapse collapse" 
  aria-labelledby="${headerId}" 
  ${!alwaysOpen ? `data-bs-parent="#${accordionId}"` : ''}>
  <div class="accordion-body">
    ${typeof item.content === 'string' ? item.content : ''}
  </div>
</div>
`;

// Add to accordion
accordion.appendChild(itemEl);

// Handle non-string content
if (typeof item.content !== 'string' && item.content instanceof HTMLElement) {
const body = itemEl.querySelector('.accordion-body');
if (body) {
  body.innerHTML = '';
  body.appendChild(item.content);
}
}

// Set up event handler if Bootstrap is not available
if (!window.bootstrap) {
const button = itemEl.querySelector('.accordion-button');
this._addTrackedEventListener(button, 'click', () => {
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const targetCollapseId = button.getAttribute('data-bs-target').substring(1);
  const collapseEl = document.getElementById(targetCollapseId);
  
  if (!alwaysOpen) {
    // Close all other items
    accordion.querySelectorAll('.accordion-collapse.show').forEach(el => {
      if (el.id !== targetCollapseId) {
        el.classList.remove('show');
        
        // Find corresponding button
        const elHeaderId = el.getAttribute('aria-labelledby');
        const elHeader = document.getElementById(elHeaderId);
        if (elHeader) {
          const otherButton = elHeader.querySelector('.accordion-button');
          if (otherButton) {
            otherButton.classList.add('collapsed');
            otherButton.setAttribute('aria-expanded', 'false');
          }
        }
      }
    });
  }
  
  // Toggle current item
  if (isExpanded) {
    // Close
    button.classList.add('collapsed');
    button.setAttribute('aria-expanded', 'false');
    if (collapseEl) {
      collapseEl.classList.remove('show');
    }
  } else {
    // Open
    button.classList.remove('collapsed');
    button.setAttribute('aria-expanded', 'true');
    if (collapseEl) {
      collapseEl.classList.add('show');
    }
  }
});
}

return index;
},

// Remove an item
removeItem: (index) => {
if (index < 0 || index >= items.length) return false;

const itemElements = accordion.querySelectorAll('.accordion-item');
if (index < itemElements.length) {
itemElements[index].remove();
items.splice(index, 1);
return true;
}

return false;
},

// Update item content
updateItemContent: (index, newContent) => {
if (index < 0 || index >= items.length) return false;

const itemElements = accordion.querySelectorAll('.accordion-item');
if (index < itemElements.length) {
const body = itemElements[index].querySelector('.accordion-body');
if (body) {
  // Clear existing content
  body.innerHTML = '';
  
  // Set new content
  if (typeof newContent === 'string') {
    body.innerHTML = newContent;
  } else if (newContent instanceof HTMLElement) {
    body.appendChild(newContent);
  }
  
  return true;
}
}

return false;
},

// Update item title
updateItemTitle: (index, newTitle) => {
if (index < 0 || index >= items.length) return false;

const itemElements = accordion.querySelectorAll('.accordion-item');
if (index < itemElements.length) {
const button = itemElements[index].querySelector('.accordion-button');
if (button) {
  button.textContent = newTitle;
  return true;
}
}

return false;
}
};
} catch (error) {
console.error("Error creating accordion:", error);
this.handleError(error, "createAccordion");
return null;
}
},

/**
* Create a collapsible element
* @param {string} triggerId - Trigger element ID
* @param {string} targetId - Target element ID
* @param {Object} options - Collapsible options
* @returns {Object} Collapsible control object
*/
createCollapsible(triggerId, targetId, options = {}) {
try {
const {
initialState = 'collapsed', // 'collapsed' or 'expanded'
triggerText = 'Toggle',
expandedText = null,
collapsedText = null,
buttonClass = 'btn btn-primary',
animation = true
} = options;

// Get or create elements
let triggerEl = document.getElementById(triggerId);
let targetEl = document.getElementById(targetId);

// Create trigger if it doesn't exist
if (!triggerEl) {
triggerEl = document.createElement('button');
triggerEl.id = triggerId;
triggerEl.className = buttonClass;
triggerEl.type = 'button';
triggerEl.setAttribute('data-bs-toggle', 'collapse');
triggerEl.setAttribute('data-bs-target', `#${targetId}`);
triggerEl.setAttribute('aria-expanded', initialState === 'expanded' ? 'true' : 'false');
triggerEl.setAttribute('aria-controls', targetId);
triggerEl.textContent = triggerText;

// Find a placeholder to insert the trigger
const placeholder = document.getElementById(`${triggerId}-placeholder`);
if (placeholder) {
placeholder.parentNode.replaceChild(triggerEl, placeholder);
}
}

// Ensure trigger has necessary attributes
triggerEl.setAttribute('data-bs-toggle', 'collapse');
triggerEl.setAttribute('data-bs-target', `#${targetId}`);
triggerEl.setAttribute('aria-expanded', initialState === 'expanded' ? 'true' : 'false');
triggerEl.setAttribute('aria-controls', targetId);

// Create target if it doesn't exist
if (!targetEl) {
targetEl = document.createElement('div');
targetEl.id = targetId;
targetEl.className = 'collapse';

// Find a placeholder to insert the target
const placeholder = document.getElementById(`${targetId}-placeholder`);
if (placeholder) {
placeholder.parentNode.replaceChild(targetEl, placeholder);
}
}

// Set initial state
if (initialState === 'expanded') {
targetEl.classList.add('show');

if (expandedText) {
triggerEl.textContent = expandedText;
}
} else {
targetEl.classList.remove('show');

if (collapsedText) {
triggerEl.textContent = collapsedText;
}
}

// Disable animation if requested
if (!animation) {
targetEl.style.transition = 'none';
}

// Set up event handler
const toggleCollapse = () => {
const isExpanded = triggerEl.getAttribute('aria-expanded') === 'true';

if (isExpanded) {
// Collapse
triggerEl.setAttribute('aria-expanded', 'false');
targetEl.classList.remove('show');

if (collapsedText) {
triggerEl.textContent = collapsedText;
}
} else {
// Expand
triggerEl.setAttribute('aria-expanded', 'true');
targetEl.classList.add('show');

if (expandedText) {
triggerEl.textContent = expandedText;
}
}
};

// Use Bootstrap if available
if (window.bootstrap && window.bootstrap.Collapse) {
// Bootstrap will handle the toggle via data attributes

// Listen for bootstrap events to update text
if (expandedText || collapsedText) {
this._addTrackedEventListener(targetEl, 'shown.bs.collapse', () => {
if (expandedText) {
  triggerEl.textContent = expandedText;
}
});

this._addTrackedEventListener(targetEl, 'hidden.bs.collapse', () => {
if (collapsedText) {
  triggerEl.textContent = collapsedText;
}
});
}
} else {
// Manual handling
this._addTrackedEventListener(triggerEl, 'click', toggleCollapse);
}

// Return control object
return {
triggerId,
targetId,

// Show the collapsible
show: () => {
if (window.bootstrap && window.bootstrap.Collapse) {
const bsCollapse = new window.bootstrap.Collapse(targetEl);
bsCollapse.show();
} else {
// Only toggle if not already shown
if (triggerEl.getAttribute('aria-expanded') !== 'true') {
  toggleCollapse();
}
}
},

// Hide the collapsible
hide: () => {
if (window.bootstrap && window.bootstrap.Collapse) {
const bsCollapse = new window.bootstrap.Collapse(targetEl);
bsCollapse.hide();
} else {
// Only toggle if not already hidden
if (triggerEl.getAttribute('aria-expanded') === 'true') {
  toggleCollapse();
}
}
},

// Toggle the collapsible
toggle: () => {
if (window.bootstrap && window.bootstrap.Collapse) {
const bsCollapse = new window.bootstrap.Collapse(targetEl);
bsCollapse.toggle();
} else {
toggleCollapse();
}
},

// Update the content
updateContent: (content) => {
if (typeof content === 'string') {
targetEl.innerHTML = content;
} else if (content instanceof HTMLElement) {
targetEl.innerHTML = '';
targetEl.appendChild(content);
}
}
};
} catch (error) {
console.error("Error creating collapsible:", error);
this.handleError(error, "createCollapsible");
return null;
}
}
};

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
export const createTabs = ui.createTabs.bind(ui);
export const findElement = ui.findElement.bind(ui);
export const findElements = ui.findElements.bind(ui);
export const createElement = ui.createElement.bind(ui);
export const createAccordion = ui.createAccordion.bind(ui);
export const createCollapsible = ui.createCollapsible.bind(ui);
export const createProgressBar = ui.createProgressBar.bind(ui);