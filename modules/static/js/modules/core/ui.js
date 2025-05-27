/**
 * Core UI Module
 * 
 * Provides comprehensive UI functionality used throughout the application.
 * Uses domUtils.js for DOM operations to avoid function redeclarations.
 * 
 * @module ui
 */
import { getElement, getElements, getUIElements, createElement, addEventListeners } from './domUtils.js';
// Register with module bridge to break circular dependencies
import { updateUIBridge } from '../core/module-bridge.js';

// UI state management - centralized state for all UI components
const uiState = {
  activePanel: null,
  isLoading: false,
  notifications: [],
  modalStack: [],
  toastContainer: null,
  modalInstances: new Map(),
  progressBars: new Map(),
  spinners: new Map(),
  activeTabSets: new Map(),
  eventHandlers: new Map(),
  configOptions: {
    animationsEnabled: true,
    toastPosition: 'bottom-end', // top-start, top-end, bottom-start, bottom-end
    toastDuration: 5000,
    modalBackdropClose: true,
    defaultTheme: 'light'
  }
};

/**
 * Initialize the UI module
 * @param {Object} options - Configuration options
 * @returns {Object} UI API
 */
function initUI(options = {}) {
  // Apply configuration options
  Object.assign(uiState.configOptions, options);
  
  // Set theme on initialization
  setTheme(uiState.configOptions.defaultTheme);
  
  // Create toast container if it doesn't exist
  ensureToastContainer();
  
  console.log("UI module initialized successfully");
  
  // Return the public API
  return {
    // Core UI functions
    showPanel,
    hidePanel,
    togglePanel,
    showModal,
    closeModal,
    showNotification,
    clearNotifications,
    showLoading,
    hideLoading,
    updateProgressBar,
    createTabs,
    toggleElementVisibility,
    toggleClass,
    setTheme,
    
    // Dialog utilities
    confirm,
    alert,
    prompt,
    
    // DOM utilities (re-exported from domUtils)
    getElement,
    getElements,
    getUIElements,
    createElement,
    addEventListeners,
    
    // State and configuration
    getConfig: () => ({ ...uiState.configOptions }),
    updateConfig: (newOptions) => Object.assign(uiState.configOptions, newOptions)
  };
}

/**
 * Ensure the toast container exists in the DOM
 * @returns {HTMLElement} Toast container element
 */
function ensureToastContainer() {
  if (uiState.toastContainer) return uiState.toastContainer;
  
  // Get position classes based on configuration
  const posClasses = getPositionClasses(uiState.configOptions.toastPosition);
  
  // Create container if it doesn't exist
  const container = getElement('toast-container');
  if (container) {
    uiState.toastContainer = container;
    // Update classes in case position changed
    container.className = `toast-container position-fixed ${posClasses} p-3`;
    return container;
  }
  
  // Create new container
  const newContainer = createElement('div', {
    id: 'toast-container',
    className: `toast-container position-fixed ${posClasses} p-3`,
    style: 'z-index: 1100;'
  });
  
  document.body.appendChild(newContainer);
  uiState.toastContainer = newContainer;
  return newContainer;
}

/**
 * Get position classes for toast container
 * @param {string} position - Toast position
 * @returns {string} Position classes
 */
function getPositionClasses(position) {
  switch (position) {
    case 'top-start': return 'top-0 start-0';
    case 'top-end': return 'top-0 end-0';
    case 'bottom-start': return 'bottom-0 start-0';
    case 'bottom-end': 
    default: return 'bottom-0 end-0';
  }
}

/**
 * Show a notification toast
 * @param {Object} options - Notification options
 * @returns {HTMLElement} Notification element
 */
function showNotification(options = {}) {
  try {
    const container = ensureToastContainer();
    
    const defaults = {
      title: 'Notification',
      message: '',
      type: 'info', // success, error, warning, info
      duration: uiState.configOptions.toastDuration,
      dismissible: true,
      icon: true
    };
    
    const config = { ...defaults, ...options };
    
    // Generate unique ID for this toast
    const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // Determine appropriate icon and class
    let iconHTML = '';
    let headerClass = '';
    
    if (config.icon) {
      switch (config.type) {
        case 'success':
          iconHTML = '<i class="fas fa-check-circle me-2"></i>';
          headerClass = 'bg-success text-white';
          break;
        case 'error':
          iconHTML = '<i class="fas fa-exclamation-circle me-2"></i>';
          headerClass = 'bg-danger text-white';
          break;
        case 'warning':
          iconHTML = '<i class="fas fa-exclamation-triangle me-2"></i>';
          headerClass = 'bg-warning text-dark';
          break;
        default: // info
          iconHTML = '<i class="fas fa-info-circle me-2"></i>';
          headerClass = 'bg-info text-white';
      }
    }
    
    // Create toast element
    const toast = createElement('div', {
      id: toastId,
      className: 'toast',
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true'
    });
    
    // Create toast header
    const toastHeader = createElement('div', {
      className: `toast-header ${headerClass}`
    });
    
    // Create header content
    toastHeader.innerHTML = `
      ${iconHTML}
      <strong class="me-auto">${config.title}</strong>
      ${config.dismissible ? 
        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>' : 
        ''}
    `;
    
    // Create toast body
    const toastBody = createElement('div', {
      className: 'toast-body'
    }, config.message);
    
    // Assemble toast
    toast.appendChild(toastHeader);
    toast.appendChild(toastBody);
    
    // Add to container
    container.appendChild(toast);
    
    // Add to state
    uiState.notifications.push(toast);
    
    // Initialize Bootstrap Toast if available
    if (window.bootstrap && window.bootstrap.Toast) {
      const bsToast = new window.bootstrap.Toast(toast, {
        autohide: config.duration > 0,
        delay: config.duration
      });
      bsToast.show();
    } else {
      // Fallback if Bootstrap is not available
      toast.classList.add('show');
      
      // Add close button handler
      if (config.dismissible) {
        const closeButton = toast.querySelector('.btn-close');
        if (closeButton) {
          addEventListeners(closeButton, 'click', () => {
            removeNotification(toast);
          });
        }
      }
      
      // Auto-dismiss after duration
      if (config.duration > 0) {
        setTimeout(() => {
          removeNotification(toast);
        }, config.duration);
      }
    }
    
    return toast;
  } catch (error) {
    console.error("Error showing notification:", error);
    return null;
  }
}

/**
 * Remove a notification
 * @param {HTMLElement} notification - Notification to remove
 */
function removeNotification(notification) {
  if (!notification) return;
  
  notification.classList.remove('show');
  
  // Remove from state
  const index = uiState.notifications.indexOf(notification);
  if (index > -1) {
    uiState.notifications.splice(index, 1);
  }
  
  // Remove element after animation completes
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 300);
}

/**
 * Clear all notifications
 */
function clearNotifications() {
  const notifications = [...uiState.notifications];
  notifications.forEach(notification => {
    removeNotification(notification);
  });
}

/**
 * Show a specific panel
 * @param {string|HTMLElement} panel - Panel to show
 * @param {Object} options - Display options
 */
function showPanel(panel, options = {}) {
  const panelElement = getElement(panel);
  if (!panelElement) return;
  
  // Hide current active panel if exclusive option is true
  if (options.exclusive && uiState.activePanel && uiState.activePanel !== panelElement) {
    hidePanel(uiState.activePanel);
  }
  
  // Apply display mode
  panelElement.style.display = options.display || 'block';
  panelElement.setAttribute('aria-hidden', 'false');
  
  // Apply animation if enabled
  if (options.animate && uiState.configOptions.animationsEnabled) {
    panelElement.classList.add('panel-animate-in');
    setTimeout(() => panelElement.classList.remove('panel-animate-in'), 300);
  }
  
  // Update active panel
  uiState.activePanel = panelElement;
  
  // Trigger custom event
  const event = new CustomEvent('panel:shown', { 
    detail: { 
      panelId: panelElement.id, 
      options 
    } 
  });
  panelElement.dispatchEvent(event);
}

/**
 * Hide a specific panel
 * @param {string|HTMLElement} panel - Panel to hide
 * @param {Object} options - Display options
 */
function hidePanel(panel, options = {}) {
  const panelElement = getElement(panel);
  if (!panelElement) return;
  
  if (options.animate && uiState.configOptions.animationsEnabled) {
    panelElement.classList.add('panel-animate-out');
    setTimeout(() => {
      panelElement.style.display = 'none';
      panelElement.classList.remove('panel-animate-out');
      panelElement.setAttribute('aria-hidden', 'true');
    }, 300);
  } else {
    panelElement.style.display = 'none';
    panelElement.setAttribute('aria-hidden', 'true');
  }
  
  // Update active panel
  if (uiState.activePanel === panelElement) {
    uiState.activePanel = null;
  }
  
  // Trigger custom event
  const event = new CustomEvent('panel:hidden', { 
    detail: { 
      panelId: panelElement.id, 
      options 
    } 
  });
  panelElement.dispatchEvent(event);
}

/**
 * Toggle a panel's visibility
 * @param {string|HTMLElement} panel - Panel to toggle
 * @param {Object} options - Display options
 */
function togglePanel(panel, options = {}) {
  const panelElement = getElement(panel);
  if (!panelElement) return;
  
  if (panelElement.style.display === 'none' || panelElement.getAttribute('aria-hidden') === 'true') {
    showPanel(panelElement, options);
  } else {
    hidePanel(panelElement, options);
  }
}

/**
 * Show a modal dialog
 * @param {Object} options - Modal options
 * @returns {Object} Modal control object
 */
function showModal(options = {}) {
  try {
    // Default options
    const defaults = {
      title: 'Modal Dialog',
      content: '',
      size: 'default', // small, default, large, xl
      dismissible: true,
      buttons: [],
      onClose: null,
      onOpen: null,
      centered: false,
      scrollable: true,
      backdrop: true,
      keyboard: true,
      fullscreen: false
    };
    
    const config = { ...defaults, ...options };
    
    // Generate unique ID
    const modalId = 'modal-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // Get modal container or create it
    let modalContainer = getElement('modal-container');
    if (!modalContainer) {
      modalContainer = createElement('div', { id: 'modal-container' });
      document.body.appendChild(modalContainer);
    }
    
    // Determine size class
    let sizeClass = '';
    switch (config.size) {
      case 'small': sizeClass = 'modal-sm'; break;
      case 'large': sizeClass = 'modal-lg'; break;
      case 'xl': sizeClass = 'modal-xl'; break;
    }
    
    // Determine fullscreen class
    let fullscreenClass = '';
    if (config.fullscreen === true) {
      fullscreenClass = 'modal-fullscreen';
    } else if (typeof config.fullscreen === 'string') {
      fullscreenClass = `modal-fullscreen-${config.fullscreen}-down`;
    }
    
    // Create modal element
    const modal = createElement('div', {
      id: modalId,
      className: 'modal fade',
      tabindex: '-1',
      role: 'dialog',
      'aria-labelledby': `${modalId}-title`,
      'aria-hidden': 'true',
      'data-bs-backdrop': config.backdrop ? 'true' : 'static',
      'data-bs-keyboard': config.keyboard ? 'true' : 'false'
    });
    
    // Create dialog element
    const dialogClasses = [
      'modal-dialog', 
      sizeClass, 
      config.centered ? 'modal-dialog-centered' : '',
      config.scrollable ? 'modal-dialog-scrollable' : '',
      fullscreenClass
    ].filter(Boolean).join(' ');
    
    const dialog = createElement('div', {
      className: dialogClasses
    });
    
    // Create content element
    const content = createElement('div', {
      className: 'modal-content'
    });
    
    // Create header
    const header = createElement('div', {
      className: 'modal-header'
    });
    
    // Add title
    const title = createElement('h5', {
      className: 'modal-title',
      id: `${modalId}-title`
    }, config.title);
    
    header.appendChild(title);
    
    // Add close button if dismissible
    if (config.dismissible) {
      const closeButton = createElement('button', {
        type: 'button',
        className: 'btn-close',
        'data-bs-dismiss': 'modal',
        'aria-label': 'Close'
      });
      
      header.appendChild(closeButton);
    }
    
    // Create body
    const body = createElement('div', {
      className: 'modal-body'
    });
    
    // Add content
    if (typeof config.content === 'string') {
      body.innerHTML = config.content;
    } else if (config.content instanceof HTMLElement) {
      body.appendChild(config.content);
    }
    
    // Create footer if buttons provided
    let footer = null;
    if (Array.isArray(config.buttons) && config.buttons.length > 0) {
      footer = createElement('div', {
        className: 'modal-footer'
      });
      
      // Add buttons
      config.buttons.forEach(btn => {
        const buttonType = btn.type || (btn.primary ? 'primary' : 'secondary');
        const buttonClass = `btn btn-${buttonType} ${btn.className || ''}`.trim();
        
        const button = createElement('button', {
          type: 'button',
          className: buttonClass,
          'data-action': btn.action || ''
        }, btn.text || 'Button');
        
        if (btn.dismiss !== false) {
          button.setAttribute('data-bs-dismiss', 'modal');
        }
        
        if (btn.onClick && typeof btn.onClick === 'function') {
          addEventListeners(button, 'click', () => btn.onClick(modalId, modal));
        }
        
        footer.appendChild(button);
      });
    }
    
    // Assemble modal
    content.appendChild(header);
    content.appendChild(body);
    if (footer) content.appendChild(footer);
    dialog.appendChild(content);
    modal.appendChild(dialog);
    modalContainer.appendChild(modal);
    
    // Add to modal stack
    uiState.modalStack.push(modal);
    
    // Initialize Bootstrap Modal if available
    let bootstrapModal = null;
    if (window.bootstrap && window.bootstrap.Modal) {
      bootstrapModal = new window.bootstrap.Modal(modal, {
        backdrop: config.backdrop ? true : 'static',
        keyboard: config.keyboard,
        focus: true
      });
      
      bootstrapModal.show();
    } else {
      // Fallback if Bootstrap is not available
      setTimeout(() => {
        document.body.classList.add('modal-open');
        modal.style.display = 'block';
        modal.classList.add('show');
        
        // Create backdrop if not already exists
        if (!document.querySelector('.modal-backdrop') && config.backdrop) {
          const backdrop = createElement('div', {
            className: 'modal-backdrop fade show'
          });
          document.body.appendChild(backdrop);
        }
      }, 10);
      
      // Add close button handler
      if (config.dismissible) {
        const closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"]');
        closeButtons.forEach(button => {
          addEventListeners(button, 'click', () => closeModal(modalId));
        });
      }
    }
    
    // Register modal instance
    uiState.modalInstances.set(modalId, {
      element: modal,
      bootstrapInstance: bootstrapModal,
      config,
      dispose: () => {
        // Remove from modal stack
        const index = uiState.modalStack.indexOf(modal);
        if (index > -1) {
          uiState.modalStack.splice(index, 1);
        }
        
        // Remove from instances
        uiState.modalInstances.delete(modalId);
        
        // Remove event listeners
        modal.querySelectorAll('button').forEach(button => {
          button.removeEventListener('click', button.clickHandler);
        });
        
        // Call onClose callback
        if (config.onClose && typeof config.onClose === 'function') {
          config.onClose(modalId, modal);
        }
        
        // Remove element
        if (modal.parentNode) {
          modal.remove();
        }
        
        // Remove backdrop if no more modals
        if (uiState.modalStack.length === 0) {
          document.body.classList.remove('modal-open');
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) backdrop.remove();
        }
      }
    });
    
    // Add hidden event handler
    addEventListeners(modal, 'hidden.bs.modal', () => {
      const instance = uiState.modalInstances.get(modalId);
      if (instance) instance.dispose();
    });
    
    // Add custom hidden event for non-bootstrap
    if (!window.bootstrap) {
      addEventListeners(modal, 'click', (event) => {
        // Close on backdrop click if enabled
        if (config.backdrop && event.target === modal) {
          closeModal(modalId);
        }
      });
      
      // Add keyboard support
      if (config.keyboard) {
        addEventListeners(document, 'keydown', (event) => {
          if (event.key === 'Escape' && uiState.modalStack[uiState.modalStack.length - 1] === modal) {
            closeModal(modalId);
          }
        });
      }
    }
    
    // Call onOpen callback
    if (config.onOpen && typeof config.onOpen === 'function') {
      setTimeout(() => config.onOpen(modalId, modal), 300);
    }
    
    // Return control object
    return {
      id: modalId,
      element: modal,
      close: () => closeModal(modalId),
      getBody: () => body,
      getFooter: () => footer,
      setTitle: (newTitle) => {
        title.textContent = newTitle;
      },
      setContent: (newContent) => {
        if (typeof newContent === 'string') {
          body.innerHTML = newContent;
        } else if (newContent instanceof HTMLElement) {
          body.innerHTML = '';
          body.appendChild(newContent);
        }
      }
    };
  } catch (error) {
    console.error("Error showing modal:", error);
    return {
      id: null,
      element: null,
      close: () => {},
      getBody: () => null,
      getFooter: () => null,
      setTitle: () => {},
      setContent: () => {}
    };
  }
}

/**
 * Close a modal dialog
 * @param {string} modalId - Modal ID
 */
function closeModal(modalId) {
  try {
    const instance = uiState.modalInstances.get(modalId);
    if (!instance) return;
    
    if (instance.bootstrapInstance) {
      instance.bootstrapInstance.hide();
    } else {
      // Fallback if Bootstrap is not available
      instance.element.classList.remove('show');
      instance.element.style.display = 'none';
      
      // Call dispose
      instance.dispose();
    }
  } catch (error) {
    console.error("Error closing modal:", error);
  }
}

/**
 * Show loading indicator
 * @param {Object} options - Loading options
 * @returns {Object} Loading control object
 */
function showLoading(options = {}) {
  try {
    const defaults = {
      fullscreen: false,
      message: 'Loading...',
      target: null,
      showSpinner: true,
      overlay: true,
      spinnerSize: 'md', // sm, md, lg
      spinnerColor: 'primary' // primary, secondary, success, danger, warning, info
    };
    
    const config = { ...defaults, ...options };
    
    // Generate unique ID
    const loaderId = 'loader-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    // Create container class
    let containerClass = 'loading-indicator';
    if (config.fullscreen) {
      containerClass += ' position-fixed top-0 start-0 w-100 h-100';
      if (config.overlay) containerClass += ' bg-dark bg-opacity-50';
    } else {
      containerClass += ' position-relative';
    }
    
    // Create spinner class
    let spinnerClass = `spinner-border text-${config.spinnerColor}`;
    if (config.spinnerSize === 'sm') spinnerClass += ' spinner-border-sm';
    if (config.spinnerSize === 'lg') spinnerClass += ' spinner-border-lg';
    
    // Create loader element
    const loader = createElement('div', {
      id: loaderId,
      className: containerClass,
      style: 'z-index: 1050; display: flex; align-items: center; justify-content: center;'
    });
    
    // Create container for content
    const inner = createElement('div', {
      className: 'bg-white p-3 rounded shadow-sm d-flex align-items-center'
    });
    
    // Add spinner if enabled
    if (config.showSpinner) {
      const spinner = createElement('div', {
        className: spinnerClass,
        role: 'status'
      });
      
      const srOnly = createElement('span', {
        className: 'visually-hidden'
      }, 'Loading...');
      
      spinner.appendChild(srOnly);
      inner.appendChild(spinner);
    }
    
    // Add message element
    const message = createElement('div', {
      id: `${loaderId}-message`,
      className: config.showSpinner ? 'ms-3' : ''
    }, config.message);
    
    inner.appendChild(message);
    loader.appendChild(inner);
    
    // Add to DOM
    if (config.fullscreen) {
      document.body.appendChild(loader);
    } else if (config.target) {
      const targetElement = getElement(config.target);
      if (targetElement) {
        if (config.overlay) {
          // Position the loader appropriately
          const targetPosition = window.getComputedStyle(targetElement).position;
          if (targetPosition === 'static') {
            targetElement.style.position = 'relative';
          }
        }
        targetElement.appendChild(loader);
      } else {
        document.body.appendChild(loader);
      }
    } else {
      document.body.appendChild(loader);
    }
    
    // Add show class after a short delay for animation
    setTimeout(() => loader.classList.add('show'), 10);
    
    // Update state
    uiState.isLoading = true;
    uiState.spinners.set(loaderId, {
      element: loader,
      config
    });
    
    // Return control object
    return {
      id: loaderId,
      element: loader,
      hide: () => hideLoading(loaderId),
      updateMessage: (newMessage) => {
        const messageElement = document.getElementById(`${loaderId}-message`);
        if (messageElement) {
          messageElement.textContent = newMessage;
        }
      }
    };
  } catch (error) {
    console.error("Error showing loading indicator:", error);
    return {
      id: null,
      element: null,
      hide: () => {},
      updateMessage: () => {}
    };
  }
}
// At the end of ui.js - After all exports

// Create ui object with all exports
const ui = {
  initUI,
  showPanel,
  hidePanel,
  togglePanel,
  showModal,
  closeModal,
  showNotification,
  clearNotifications,
  showLoading,
  hideLoading,
  updateProgressBar,
  confirm,
  alert,
  prompt,
  toggleElementVisibility,
  toggleClass,
  createTabs,
  setTheme
};

// Update the bridge with the real UI module
updateUIBridge(ui);

console.log("UI module initialized and bridge updated");
/**
 * Hide loading indicator
 * @param {string} [loaderId] - ID of specific loader to hide, or all if not specified
 */
function hideLoading(loaderId) {
  try {
    if (loaderId) {
      // Hide specific loader
      const loaderInfo = uiState.spinners.get(loaderId);
      if (!loaderInfo) return;
      
      const loader = loaderInfo.element;
      loader.classList.remove('show');
      
      // Remove after animation
      setTimeout(() => {
        if (loader.parentNode) {
          // Reset target position if overlay was used
          if (loaderInfo.config.overlay && !loaderInfo.config.fullscreen) {
            const target = loader.parentNode;
            // Only reset if no other overlays are present
            const hasOtherOverlays = Array.from(target.children).some(child => 
              child !== loader && 
              child.classList.contains('loading-indicator') && 
              loaderInfo.config.overlay
            );
            
            if (!hasOtherOverlays) {
              target.style.position = '';
            }
          }
          
          loader.remove();
        }
        
        // Remove from state
        uiState.spinners.delete(loaderId);
        
        // Update loading state if no more spinners
        if (uiState.spinners.size === 0) {
          uiState.isLoading = false;
        }
      }, 300);
    } else {
      // Hide all loaders
      const loaderIds = Array.from(uiState.spinners.keys());
      loaderIds.forEach(id => hideLoading(id));
    }
  } catch (error) {
    console.error("Error hiding loading indicator:", error);
  }
}

/**
 * Update a progress bar
 * @param {string} elementId - Progress bar element ID
 * @param {number} value - Progress value (0-100)
 * @param {Object} options - Update options
 * @returns {boolean} Success status
 */
function updateProgressBar(elementId, value, options = {}) {
  try {
    const progressBar = getElement(elementId);
    if (!progressBar) return false;
    
    // Default options
    const defaults = {
      text: null,
      textInside: false,
      animated: true,
      contextual: true
    };
    
    const config = { ...defaults, ...options };
    
    // Ensure value is in valid range
    const percent = Math.min(100, Math.max(0, value));
    
    // Find the actual progress bar element (could be a child)
    const innerBar = progressBar.classList.contains('progress') ? 
      progressBar.querySelector('.progress-bar') : 
      progressBar;
    
    if (!innerBar) return false;
    
    // Update progress
    innerBar.style.width = `${percent}%`;
    innerBar.setAttribute('aria-valuenow', percent);
    
    // Update animation class
    if (config.animated) {
      innerBar.classList.add('progress-bar-animated', 'progress-bar-striped');
    } else {
      innerBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
    }
    
    // Update contextual class if enabled
    if (config.contextual) {
      // Remove existing contextual classes
      ['bg-danger', 'bg-warning', 'bg-info', 'bg-success'].forEach(cls => {
        innerBar.classList.remove(cls);
      });
      
      // Add appropriate class based on progress
      if (percent < 25) {
        innerBar.classList.add('bg-danger');
      } else if (percent < 50) {
        innerBar.classList.add('bg-warning');
      } else if (percent < 75) {
        innerBar.classList.add('bg-info');
      } else {
        innerBar.classList.add('bg-success');
      }
    }
    
    // Update text if provided
    if (config.text !== null) {
      // Determine where to show text
      if (config.textInside) {
        innerBar.textContent = config.text;
      } else {
        // Find or create text element
        let textEl = progressBar.querySelector('.progress-text');
        if (!textEl) {
          textEl = createElement('div', { className: 'progress-text mt-1' });
          progressBar.parentNode.insertBefore(textEl, progressBar.nextSibling);
        }
        textEl.textContent = config.text;
      }
    }
    
    // Save in state
    uiState.progressBars.set(elementId, {
      element: progressBar,
      value: percent
    });
    
    return true;
  } catch (error) {
    console.error("Error updating progress bar:", error);
    return false;
  }
}

/**
 * Create a confirmation dialog
 * @param {string} title - Dialog title
 * @param {string|HTMLElement} message - Dialog message
 * @param {Function} onConfirm - Confirm callback
 * @param {Function} onCancel - Cancel callback
 * @param {Object} options - Dialog options
 * @returns {Object} Modal control object
 */
function confirm(title, message, onConfirm, onCancel = null, options = {}) {
  // Default options
  const defaults = {
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    confirmType: 'primary',
    cancelType: 'secondary',
    size: 'small',
    centered: true
  };
  
  const config = { ...defaults, ...options };
  
  // Create content element
  let content;
  if (typeof message === 'string') {
    content = createElement('div', {}, message);
  } else if (message instanceof HTMLElement) {
    content = message;
  } else {
    content = createElement('div', {}, 'Are you sure?');
  }
  
  // Create buttons
  const buttons = [
    {
      text: config.cancelText,
      type: config.cancelType,
      onClick: onCancel || (() => {})
    },
    {
      text: config.confirmText,
      type: config.confirmType,
      primary: true,
      onClick: onConfirm
    }
  ];
  
  // Show modal
  return showModal({
    title,
    content,
    size: config.size,
    centered: config.centered,
    buttons
  });
}

/**
 * Show an alert dialog
 * @param {string} title - Alert title
 * @param {string|HTMLElement} message - Alert message
 * @param {Object} options - Alert options
 * @returns {Object} Modal control object
 */
function alert(title, message, options = {}) {
  // Default options
  const defaults = {
    buttonText: 'OK',
    buttonType: 'primary',
    size: 'small',
    centered: true,
    icon: null // success, error, warning, info
  };
  
  const config = { ...defaults, ...options };
  
  // Create content with icon if specified
  let content;
  if (config.icon) {
    let iconHTML = '';
    let iconClass = '';
    
    switch (config.icon) {
      case 'success':
        iconHTML = '<i class="fas fa-check-circle text-success fa-3x mb-3"></i>';
        break;
      case 'error':
        iconHTML = '<i class="fas fa-exclamation-circle text-danger fa-3x mb-3"></i>';
        break;
      case 'warning':
        iconHTML = '<i class="fas fa-exclamation-triangle text-warning fa-3x mb-3"></i>';
        break;
      case 'info':
        iconHTML = '<i class="fas fa-info-circle text-info fa-3x mb-3"></i>';
        break;
    }
    
    const container = createElement('div', {
      className: 'text-center'
    });
    
    if (iconHTML) {
      container.innerHTML = iconHTML;
    }
    
    // Add message
    const messageEl = createElement('div', {
      className: 'mt-2'
    });
    
    if (typeof message === 'string') {
      messageEl.textContent = message;
    } else if (message instanceof HTMLElement) {
      messageEl.appendChild(message);
    }
    
    container.appendChild(messageEl);
    content = container;
  } else {
    // No icon, just use message
    if (typeof message === 'string') {
      content = createElement('div', {}, message);
    } else if (message instanceof HTMLElement) {
      content = message;
    }
  }
  
  // Show modal
  return showModal({
    title,
    content,
    size: config.size,
    centered: config.centered,
    buttons: [
      {
        text: config.buttonText,
        type: config.buttonType,
        primary: true,
        onClick: config.onClose || (() => {})
      }
    ]
  });
}

/**
 * Show a prompt dialog
 * @param {string} title - Prompt title
 * @param {string} message - Prompt message
 * @param {Function} onSubmit - Submit callback
 * @param {Function} onCancel - Cancel callback
 * @param {Object} options - Prompt options
 * @returns {Object} Modal control object
 */
function prompt(title, message, onSubmit, onCancel = null, options = {}) {
  // Default options
  const defaults = {
    defaultValue: '',
    placeholder: '',
    submitText: 'Submit',
    cancelText: 'Cancel',
    inputType: 'text',
    size: 'small',
    centered: true,
    required: false,
    validator: null
  };
  
  const config = { ...defaults, ...options };
  
  // Create input ID
  const inputId = 'prompt-input-' + Date.now();
  
  // Create content
  const content = createElement('div', {});
  
  // Add message
  if (message) {
    const messageEl = createElement('p', {
      className: 'mb-3'
    }, message);
    content.appendChild(messageEl);
  }
  
  // Create form group
  const formGroup = createElement('div', {
    className: 'mb-3'
  });
  
  // Create input
  const input = createElement('input', {
    type: config.inputType,
    className: 'form-control',
    id: inputId,
    placeholder: config.placeholder,
    value: config.defaultValue,
    required: config.required
  });
  
  formGroup.appendChild(input);
  content.appendChild(formGroup);
  
  // Add validator if provided
  let isValid = true;
  let validatorTimeout = null;
  
  if (config.validator && typeof config.validator === 'function') {
    // Create feedback element
    const feedback = createElement('div', {
      className: 'invalid-feedback'
    });
    formGroup.appendChild(feedback);
    
    // Add input event listener
    input.addEventListener('input', () => {
      // Clear previous timeout
      if (validatorTimeout) {
        clearTimeout(validatorTimeout);
      }
      
      // Set new timeout to avoid too many validations
      validatorTimeout = setTimeout(() => {
        const result = config.validator(input.value);
        if (result === true) {
          input.classList.remove('is-invalid');
          input.classList.add('is-valid');
          isValid = true;
        } else {
          input.classList.remove('is-valid');
          input.classList.add('is-invalid');
          feedback.textContent = typeof result === 'string' ? result : 'Invalid input';
          isValid = false;
        }
      }, 300);
    });
  }
  
  // Create buttons
  const buttons = [
    {
      text: config.cancelText,
      type: 'secondary',
      onClick: onCancel || (() => {})
    },
    {
      text: config.submitText,
      type: 'primary',
      primary: true,
      onClick: () => {
        // Check if valid
        if (config.validator && !isValid) {
          return false; // Prevent modal from closing
        }
        
        // Check required
        if (config.required && !input.value.trim()) {
          input.classList.add('is-invalid');
          return false; // Prevent modal from closing
        }
        
        // Call submit handler
        onSubmit(input.value);
      },
      dismiss: !config.validator // Allow validation to control closing
    }
  ];
  
  // Show modal
  const modal = showModal({
    title,
    content,
    size: config.size,
    centered: config.centered,
    buttons
  });
  
  // Focus input after modal is shown
  setTimeout(() => {
    input.focus();
    
    // Select text if default value is provided
    if (config.defaultValue) {
      input.select();
    }
  }, 300);
  
  // Add enter key support
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      
      // Check if valid
      if (config.validator && !isValid) {
        return;
      }
      
      // Check required
      if (config.required && !input.value.trim()) {
        input.classList.add('is-invalid');
        return;
      }
      
      // Call submit handler and close
      onSubmit(input.value);
      modal.close();
    }
  });
  
  return modal;
}

/**
 * Toggle element visibility
 * @param {string|HTMLElement} element - Element to toggle
 * @param {boolean} visible - Whether to show or hide
 * @param {string} displayMode - Display value when showing
 * @returns {boolean} Success status
 */
function toggleElementVisibility(element, visible, displayMode = 'block') {
  try {
    const el = getElement(element);
    if (!el) return false;
    
    el.style.display = visible ? displayMode : 'none';
    
    // If animation enabled, add classes
    if (uiState.configOptions.animationsEnabled) {
      if (visible) {
        el.classList.add('element-animate-in');
        setTimeout(() => el.classList.remove('element-animate-in'), 300);
      } else {
        el.classList.add('element-animate-out');
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error toggling element visibility:", error);
    return false;
  }
}

/**
 * Toggle element class
 * @param {string|HTMLElement} element - Element to modify
 * @param {string} className - Class to toggle
 * @param {boolean} [add] - Whether to add or remove (if undefined, toggles)
 * @returns {boolean} Success status
 */
function toggleClass(element, className, add) {
  try {
    const el = getElement(element);
    if (!el) return false;
    
    if (typeof add === 'undefined') {
      el.classList.toggle(className);
    } else if (add) {
      el.classList.add(className);
    } else {
      el.classList.remove(className);
    }
    
    return true;
  } catch (error) {
    console.error("Error toggling class:", error);
    return false;
  }
}

/**
 * Create tabs interface
 * @param {string|HTMLElement} container - Container element
 * @param {Array<Object>} tabs - Tab definitions
 * @param {Object} options - Tab options
 * @returns {Object} Tabs control object
 */
function createTabs(container, tabs, options = {}) {
  try {
    const containerEl = getElement(container);
    if (!containerEl) return null;
    
    // Default options
    const defaults = {
      id: 'tabs-' + Date.now(),
      activeIndex: 0,
      type: 'tabs', // tabs, pills, underline
      vertical: false,
      justified: false,
      fade: true,
      onTabChange: null
    };
    
    const config = { ...defaults, ...options };
    
    // Generate unique ID if container doesn't have one
    const containerId = containerEl.id || config.id;
    containerEl.id = containerId;
    
    // Build the tab structure
    const navId = `${containerId}-nav`;
    const contentId = `${containerId}-content`;
    
    // Determine nav classes
    let navClasses = 'nav';
    switch (config.type) {
      case 'pills':
        navClasses += ' nav-pills';
        break;
      case 'underline':
        navClasses += ' nav-underline';
        break;
      default:
        navClasses += ' nav-tabs';
    }
    
    if (config.vertical) {
      navClasses += ' flex-column';
    }
    
    if (config.justified) {
      navClasses += ' nav-justified';
    }
    
    // Create nav
    const nav = createElement('ul', {
      id: navId,
      className: navClasses,
      role: 'tablist'
    });
    
    // Create content container
    const content = createElement('div', {
      id: contentId,
      className: 'tab-content mt-2'
    });
    
    // Build tabs
    tabs.forEach((tab, index) => {
      const isActive = index === config.activeIndex;
      const tabId = tab.id || `${containerId}-tab-${index}`;
      const paneId = `${tabId}-pane`;
      
      // Create nav item
      const navItem = createElement('li', {
        className: 'nav-item',
        role: 'presentation'
      });
      
      // Create nav link
      const navLink = createElement('button', {
        className: `nav-link ${isActive ? 'active' : ''}`,
        id: tabId,
        'data-bs-toggle': 'tab',
        'data-bs-target': `#${paneId}`,
        type: 'button',
        role: 'tab',
        'aria-controls': paneId,
        'aria-selected': isActive ? 'true' : 'false'
      }, tab.title);
      
      // Add icon if provided
      if (tab.icon) {
        const icon = createElement('i', {
          className: `${tab.icon} ${tab.title ? 'me-2' : ''}`
        });
        navLink.insertBefore(icon, navLink.firstChild);
      }
      
      navItem.appendChild(navLink);
      nav.appendChild(navItem);
      
      // Create tab pane
      const pane = createElement('div', {
        className: `tab-pane ${config.fade ? 'fade' : ''} ${isActive ? 'show active' : ''}`,
        id: paneId,
        role: 'tabpanel',
        'aria-labelledby': tabId
      });
      
      // Add content
      if (typeof tab.content === 'string') {
        pane.innerHTML = tab.content;
      } else if (tab.content instanceof HTMLElement) {
        pane.appendChild(tab.content);
      }
      
      content.appendChild(pane);
    });
    
    // Clear container and add tabs
    containerEl.innerHTML = '';
    containerEl.appendChild(nav);
    containerEl.appendChild(content);
    
    // Add event listeners
    const navLinks = nav.querySelectorAll('.nav-link');
    navLinks.forEach((link, index) => {
      link.addEventListener('click', (event) => {
        // Prevent default if we're handling manually
        if (!window.bootstrap) {
          event.preventDefault();
        }
        
        // Update active state
        navLinks.forEach(l => {
          l.classList.remove('active');
          l.setAttribute('aria-selected', 'false');
        });
        
        link.classList.add('active');
        link.setAttribute('aria-selected', 'true');
        
        // Update panes
        const panes = content.querySelectorAll('.tab-pane');
        panes.forEach(p => {
          p.classList.remove('active');
          if (config.fade) p.classList.remove('show');
        });
        
        const targetId = link.getAttribute('data-bs-target') || link.getAttribute('href');
        const targetPane = document.querySelector(targetId);
        
        if (targetPane) {
          targetPane.classList.add('active');
          
          if (config.fade) {
            setTimeout(() => targetPane.classList.add('show'), 10);
          }
        }
        
        // Call change handler
        if (config.onTabChange && typeof config.onTabChange === 'function') {
          config.onTabChange(index, tabs[index]);
        }
      });
    });
    
    // Store in state
    uiState.activeTabSets.set(containerId, {
      element: containerEl,
      config,
      tabs
    });
    
    // Return control object
    return {
      id: containerId,
      element: containerEl,
      setActiveTab: (index) => {
        if (index >= 0 && index < navLinks.length) {
          navLinks[index].click();
          return true;
        }
        return false;
      },
      getActiveIndex: () => {
        let activeIndex = 0;
        navLinks.forEach((link, i) => {
          if (link.classList.contains('active')) {
            activeIndex = i;
          }
        });
        return activeIndex;
      },
      updateTabContent: (index, newContent) => {
        if (index >= 0 && index < tabs.length) {
          const paneId = `${containerId}-tab-${index}-pane`;
          const pane = document.getElementById(paneId);
          
          if (pane) {
            if (typeof newContent === 'string') {
              pane.innerHTML = newContent;
            } else if (newContent instanceof HTMLElement) {
              pane.innerHTML = '';
              pane.appendChild(newContent);
            }
            return true;
          }
        }
        return false;
      }
    };
  } catch (error) {
    console.error("Error creating tabs:", error);
    return null;
  }
}

/**
 * Set application theme
 * @param {string} theme - Theme name ('light', 'dark', or custom)
 */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('app-theme', theme);
  }
  
  // Update configuration
  uiState.configOptions.defaultTheme = theme;
  
  // Add appropriate class to body
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }
}

// Export the module
export default initUI;

// Named exports for convenience
export {
  showPanel,
  hidePanel,
  togglePanel,
  showModal,
  closeModal,
  showNotification,
  clearNotifications,
  showLoading,
  hideLoading,
  updateProgressBar,
  confirm,
  alert,
  prompt,
  toggleElementVisibility,
  toggleClass,
  createTabs,
  setTheme
};