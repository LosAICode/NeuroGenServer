/**
 * NeuroGen Server - Event Manager Module
 * 
 * Provides DOM event management functionality for the NeuroGen Server frontend.
 * Handles event delegation, registration, and common UI interactions.
 */

/**
 * Event Manager module
 */
const eventManager = {
  // Track registered event handlers
  _handlers: {},
  
  // Track delegated events
  _delegatedEvents: {},
  
  // Common element selectors
  _selectors: {
    buttons: 'button, .btn, [role="button"]',
    links: 'a, [role="link"]',
    forms: 'form',
    inputs: 'input, textarea, select',
    dropdowns: '.dropdown',
    tooltips: '[data-tooltip]',
    tabs: '.tab, [role="tab"]',
    modals: '.modal',
    collapses: '.collapse, [data-collapse]'
  },
  
  // Track initialization
  initialized: false,
  
  /**
   * Initialize the event manager
   * @param {Object} options - Initialization options
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(options = {}) {
    if (this.initialized) {
      console.warn('Event manager already initialized');
      return false;
    }
    
    // Override selectors if provided
    if (options.selectors) {
      this._selectors = {...this._selectors, ...options.selectors};
    }
    
    // Set up standard event handlers
    if (options.setupCommonEvents || options.setupCommonEvents === undefined) {
      this.setupDelegatedEvents();
    }
    
    // Make available globally for debugging if in debug mode
    if (window.debugMode) {
      window.eventManager = this;
    }
    
    this.initialized = true;
    console.log('Event manager initialized');
    
    return true;
  },
  
  /**
   * Register events for multiple elements
   * @param {Object} events - Map of selectors to event configurations
   * @returns {boolean} - Whether events were registered successfully
   */
  registerEvents(events) {
    if (!events || typeof events !== 'object') {
      console.error('Events must be an object mapping selectors to event configs');
      return false;
    }
    
    // Process each selector
    Object.entries(events).forEach(([selector, eventConfig]) => {
      const elements = document.querySelectorAll(selector);
      
      if (elements.length === 0) {
        console.warn(`No elements found for selector: ${selector}`);
        return;
      }
      
      // Process each element
      elements.forEach(element => {
        // Process each event for this element
        if (typeof eventConfig === 'object') {
          Object.entries(eventConfig).forEach(([eventType, handler]) => {
            this._registerSingleEvent(element, eventType, handler);
          });
        }
      });
    });
    
    return true;
  },
  
  /**
   * Register a single event handler
   * @private
   * @param {HTMLElement} element - Element to attach event to
   * @param {string} eventType - Event type (e.g., 'click')
   * @param {Function|Object} handler - Event handler or configuration
   */
  _registerSingleEvent(element, eventType, handler) {
    // Handle direct function handler
    if (typeof handler === 'function') {
      element.addEventListener(eventType, handler);
      
      // Track the handler for potential cleanup
      this._trackHandler(element, eventType, handler);
      return;
    }
    
    // Handle configuration object
    if (typeof handler === 'object') {
      const handlerFn = handler.handler;
      const options = handler.options || {};
      
      if (typeof handlerFn === 'function') {
        element.addEventListener(eventType, handlerFn, options);
        
        // Track the handler for potential cleanup
        this._trackHandler(element, eventType, handlerFn);
      }
    }
  },
  
  /**
   * Track a registered event handler
   * @private
   * @param {HTMLElement} element - Element with event
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   */
  _trackHandler(element, eventType, handler) {
    // Create unique ID for the element if it doesn't have one
    if (!element._eventManagerId) {
      element._eventManagerId = `elem_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const id = element._eventManagerId;
    
    // Initialize tracking for this element
    if (!this._handlers[id]) {
      this._handlers[id] = {};
    }
    
    // Initialize tracking for this event type
    if (!this._handlers[id][eventType]) {
      this._handlers[id][eventType] = [];
    }
    
    // Add handler to tracking
    this._handlers[id][eventType].push(handler);
  },
  
  /**
   * Remove event handlers for an element
   * @param {HTMLElement} element - Element to remove events from
   * @param {string} eventType - Optional specific event type to remove
   * @returns {boolean} - Whether events were removed
   */
  removeEvents(element, eventType = null) {
    if (!element || !element._eventManagerId) {
      return false;
    }
    
    const id = element._eventManagerId;
    
    // If no handlers tracked for this element, nothing to do
    if (!this._handlers[id]) {
      return false;
    }
    
    // If specific event type provided, only remove those handlers
    if (eventType) {
      if (!this._handlers[id][eventType]) {
        return false;
      }
      
      // Remove each handler
      this._handlers[id][eventType].forEach(handler => {
        element.removeEventListener(eventType, handler);
      });
      
      // Clear tracking for this event type
      delete this._handlers[id][eventType];
      
      return true;
    }
    
    // Remove all handlers for all event types
    Object.entries(this._handlers[id]).forEach(([type, handlers]) => {
      handlers.forEach(handler => {
        element.removeEventListener(type, handler);
      });
    });
    
    // Clear all tracking for this element
    delete this._handlers[id];
    
    return true;
  },
  
  /**
   * Set up delegated events for common UI elements
   * @param {HTMLElement} root - Root element to attach delegated events to
   * @returns {boolean} - Whether events were set up successfully
   */
  setupDelegatedEvents(root = document) {
    if (!root) {
      console.error('Root element is required for delegation');
      return false;
    }
    
    // Remove any existing delegated events on this root
    this.removeDelegatedEvents(root);
    
    // Set up click delegation for common elements
    root.addEventListener('click', this._handleDelegatedClick.bind(this));
    
    // Set up form submission delegation
    root.addEventListener('submit', this._handleDelegatedSubmit.bind(this));
    
    // Set up change event delegation for inputs
    root.addEventListener('change', this._handleDelegatedChange.bind(this));
    
    // Set up keydown events for keyboard navigation
    root.addEventListener('keydown', this._handleDelegatedKeydown.bind(this));
    
    // Track delegated events for this root
    const rootId = root === document ? 'document' : `root_${Math.random().toString(36).substr(2, 9)}`;
    
    this._delegatedEvents[rootId] = {
      root,
      events: ['click', 'submit', 'change', 'keydown']
    };
    
    return true;
  },
  
  /**
   * Remove delegated events from a root element
   * @param {HTMLElement} root - Root element to remove events from
   * @returns {boolean} - Whether events were removed
   */
  removeDelegatedEvents(root = document) {
    // Find this root in tracked delegated events
    const rootId = Object.keys(this._delegatedEvents).find(id => {
      return this._delegatedEvents[id].root === root;
    });
    
    if (!rootId) {
      return false;
    }
    
    // Get events for this root
    const { events } = this._delegatedEvents[rootId];
    
    // Remove each event listener
    events.forEach(eventType => {
      switch (eventType) {
        case 'click':
          root.removeEventListener('click', this._handleDelegatedClick);
          break;
        case 'submit':
          root.removeEventListener('submit', this._handleDelegatedSubmit);
          break;
        case 'change':
          root.removeEventListener('change', this._handleDelegatedChange);
          break;
        case 'keydown':
          root.removeEventListener('keydown', this._handleDelegatedKeydown);
          break;
      }
    });
    
    // Remove tracking for this root
    delete this._delegatedEvents[rootId];
    
    return true;
  },
  
  /**
   * Handle delegated click events
   * @private
   * @param {Event} event - Click event
   */
  _handleDelegatedClick(event) {
    const target = event.target;
    
    // Handle buttons
    if (target.closest(this._selectors.buttons)) {
      const button = target.closest(this._selectors.buttons);
      
      // Handle data-action buttons
      if (button.hasAttribute('data-action')) {
        const action = button.getAttribute('data-action');
        this._handleButtonAction(action, button, event);
      }
    }
    
    // Handle links
    if (target.closest(this._selectors.links)) {
      const link = target.closest(this._selectors.links);
      
      // Handle data-action links
      if (link.hasAttribute('data-action')) {
        const action = link.getAttribute('data-action');
        this._handleLinkAction(action, link, event);
      }
    }
    
    // Handle tab activation
    if (target.closest(this._selectors.tabs)) {
      const tab = target.closest(this._selectors.tabs);
      this._handleTabClick(tab, event);
    }
    
    // Handle dropdowns
    if (target.closest(this._selectors.dropdowns)) {
      const dropdown = target.closest(this._selectors.dropdowns);
      this._handleDropdownClick(dropdown, event);
    }
    
    // Handle modals
    if (target.closest(this._selectors.modals)) {
      const modal = target.closest(this._selectors.modals);
      
      // Close button inside modal
      if (target.closest('.modal-close')) {
        this._handleModalClose(modal, event);
      }
    }
    
    // Handle collapses
    if (target.closest(this._selectors.collapses)) {
      const collapse = target.closest(this._selectors.collapses);
      this._handleCollapseClick(collapse, event);
    }
    
    // Emit event if eventRegistry is available
    this._emitEvent('delegated:click', {
      originalEvent: event,
      target
    });
  },
  
  /**
   * Handle delegated form submission
   * @private
   * @param {Event} event - Submit event
   */
  _handleDelegatedSubmit(event) {
    const form = event.target;
    
    // Handle data-action forms
    if (form.hasAttribute('data-action')) {
      const action = form.getAttribute('data-action');
      this._handleFormSubmit(action, form, event);
    }
    
    // Emit event if eventRegistry is available
    this._emitEvent('delegated:submit', {
      originalEvent: event,
      form
    });
  },
  
  /**
   * Handle delegated change events
   * @private
   * @param {Event} event - Change event
   */
  _handleDelegatedChange(event) {
    const target = event.target;
    
    // Handle input changes
    if (target.matches(this._selectors.inputs)) {
      // Handle data-action inputs
      if (target.hasAttribute('data-action')) {
        const action = target.getAttribute('data-action');
        this._handleInputChange(action, target, event);
      }
    }
    
    // Emit event if eventRegistry is available
    this._emitEvent('delegated:change', {
      originalEvent: event,
      target
    });
  },
  
  /**
   * Handle delegated keydown events
   * @private
   * @param {Event} event - Keydown event
   */
  _handleDelegatedKeydown(event) {
    const target = event.target;
    
    // Handle Escape key for modals
    if (event.key === 'Escape' || event.keyCode === 27) {
      const modal = document.querySelector('.modal[style*="display: block"]');
      if (modal) {
        this._handleModalClose(modal, event);
      }
    }
    
    // Emit event if eventRegistry is available
    this._emitEvent('delegated:keydown', {
      originalEvent: event,
      target,
      key: event.key
    });
  },
  
  /**
   * Handle button actions
   * @private
   * @param {string} action - Action name
   * @param {HTMLElement} button - Button element
   * @param {Event} event - Original event
   */
  _handleButtonAction(action, button, event) {
    // Prevent default for buttons with actions
    event.preventDefault();
    
    // Emit event for this action
    this._emitEvent(`button:${action}`, {
      button,
      action,
      originalEvent: event
    });
    
    // Handle known actions
    switch (action) {
      case 'show-modal':
        const modalId = button.getAttribute('data-target');
        this._showModal(modalId);
        break;
        
      case 'hide-modal':
        const modal = button.closest('.modal');
        this._handleModalClose(modal, event);
        break;
        
      case 'toggle-collapse':
        const collapseId = button.getAttribute('data-target');
        this._toggleCollapse(collapseId);
        break;
        
      case 'toggle-theme':
        this._toggleTheme();
        break;
    }
  },
  
  /**
   * Handle link actions
   * @private
   * @param {string} action - Action name
   * @param {HTMLElement} link - Link element
   * @param {Event} event - Original event
   */
  _handleLinkAction(action, link, event) {
    // Prevent default for links with actions
    event.preventDefault();
    
    // Emit event for this action
    this._emitEvent(`link:${action}`, {
      link,
      action,
      originalEvent: event
    });
    
    // Handle known actions
    switch (action) {
      case 'show-modal':
        const modalId = link.getAttribute('data-target');
        this._showModal(modalId);
        break;
        
      case 'toggle-collapse':
        const collapseId = link.getAttribute('data-target');
        this._toggleCollapse(collapseId);
        break;
    }
  },
  
  /**
   * Handle form submission
   * @private
   * @param {string} action - Action name
   * @param {HTMLElement} form - Form element
   * @param {Event} event - Original event
   */
  _handleFormSubmit(action, form, event) {
    // Prevent default form submission
    event.preventDefault();
    
    // Emit event for this action
    this._emitEvent(`form:${action}`, {
      form,
      action,
      originalEvent: event,
      formData: new FormData(form)
    });
  },
  
  /**
   * Handle input changes
   * @private
   * @param {string} action - Action name
   * @param {HTMLElement} input - Input element
   * @param {Event} event - Original event
   */
  _handleInputChange(action, input, event) {
    // Emit event for this action
    this._emitEvent(`input:${action}`, {
      input,
      action,
      originalEvent: event,
      value: input.value
    });
  },
  
/**
   * Handle tab click
   * @private
   * @param {HTMLElement} tab - Tab element
   * @param {Event} event - Original event
   */
_handleTabClick(tab, event) {
  event.preventDefault();
  
  // Get tab container
  const tabContainer = tab.closest('.tabs');
  if (!tabContainer) return;
  
  // Get all tabs in this container
  const tabs = tabContainer.querySelectorAll(this._selectors.tabs);
  
  // Deactivate all tabs
  tabs.forEach(t => {
    t.classList.remove('active');
    
    // Hide associated content
    const targetId = t.getAttribute('data-target');
    if (targetId) {
      const target = document.getElementById(targetId);
      if (target) {
        target.classList.remove('active');
        target.style.display = 'none';
      }
    }
  });
  
  // Activate clicked tab
  tab.classList.add('active');
  
  // Show associated content
  const targetId = tab.getAttribute('data-target');
  if (targetId) {
    const target = document.getElementById(targetId);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
    }
  }
  
  // Emit event
  this._emitEvent('tab:change', {
    tab,
    targetId,
    originalEvent: event
  });
},

/**
 * Handle dropdown click
 * @private
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {Event} event - Original event
 */
_handleDropdownClick(dropdown, event) {
  // Find dropdown toggle (the part that was clicked)
  const toggle = dropdown.querySelector('.dropdown-toggle');
  
  // Only handle if toggle was clicked
  if (!event.target.closest('.dropdown-toggle')) {
    return;
  }
  
  event.preventDefault();
  
  // Get dropdown menu
  const menu = dropdown.querySelector('.dropdown-menu');
  if (!menu) return;
  
  // Toggle dropdown menu
  const isOpen = menu.classList.contains('show');
  
  if (isOpen) {
    menu.classList.remove('show');
    toggle.classList.remove('active');
    menu.style.display = 'none';
  } else {
    menu.classList.add('show');
    toggle.classList.add('active');
    menu.style.display = 'block';
    
    // Position the menu
    this._positionDropdownMenu(menu, toggle);
  }
  
  // Emit event
  this._emitEvent('dropdown:toggle', {
    dropdown,
    isOpen: !isOpen,
    originalEvent: event
  });
  
  // Add document click handler to close dropdown when clicking outside
  if (!isOpen) {
    document.addEventListener('click', this._createOutsideClickHandler(dropdown, menu), { once: true });
  }
},

/**
 * Create a one-time handler to close dropdown when clicking outside
 * @private
 * @param {HTMLElement} dropdown - Dropdown element
 * @param {HTMLElement} menu - Dropdown menu element
 * @returns {Function} - Click handler
 */
_createOutsideClickHandler(dropdown, menu) {
  return function(e) {
    if (!dropdown.contains(e.target)) {
      menu.classList.remove('show');
      menu.style.display = 'none';
      
      const toggle = dropdown.querySelector('.dropdown-toggle');
      if (toggle) {
        toggle.classList.remove('active');
      }
    }
  };
},

/**
 * Position dropdown menu relative to its toggle
 * @private
 * @param {HTMLElement} menu - Dropdown menu element
 * @param {HTMLElement} toggle - Dropdown toggle element
 */
_positionDropdownMenu(menu, toggle) {
  const toggleRect = toggle.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  
  // Check if menu would go off bottom of screen
  const bottomSpace = window.innerHeight - toggleRect.bottom;
  const menuHeight = menuRect.height;
  
  if (bottomSpace < menuHeight && toggleRect.top > menuHeight) {
    // Position above toggle
    menu.style.top = `-${menuHeight}px`;
  } else {
    // Position below toggle
    menu.style.top = `${toggleRect.height}px`;
  }
},

/**
 * Handle modal close
 * @private
 * @param {HTMLElement} modal - Modal element
 * @param {Event} event - Original event
 */
_handleModalClose(modal, event) {
  if (!modal) return;
  
  event.preventDefault();
  
  // Hide modal
  modal.style.display = 'none';
  
  // Find and remove backdrop
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.parentNode.removeChild(backdrop);
  }
  
  // Emit event
  this._emitEvent('modal:close', {
    modal,
    originalEvent: event
  });
},

/**
 * Show a modal
 * @private
 * @param {string} modalId - Modal element ID
 */
_showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn(`Modal not found: ${modalId}`);
    return;
  }
  
  // Add backdrop if not present
  if (!document.querySelector('.modal-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1040;';
    document.body.appendChild(backdrop);
    
    // Click backdrop to close modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this._handleModalClose(modal, e);
      }
    });
  }
  
  // Show modal
  modal.style.display = 'block';
  
  // Emit event
  this._emitEvent('modal:open', { modal });
},

/**
 * Handle collapse click
 * @private
 * @param {HTMLElement} collapse - Collapse element
 * @param {Event} event - Original event
 */
_handleCollapseClick(collapse, event) {
  // Only handle if toggle was clicked
  if (!event.target.closest('[data-collapse-toggle]')) {
    return;
  }
  
  event.preventDefault();
  
  // Get content element
  const content = collapse.querySelector('.collapse-content');
  if (!content) return;
  
  // Toggle collapse
  const isOpen = content.classList.contains('show');
  
  this._toggleCollapse(content, !isOpen);
  
  // Emit event
  this._emitEvent('collapse:toggle', {
    collapse,
    isOpen: !isOpen,
    originalEvent: event
  });
},

/**
 * Toggle collapse
 * @private
 * @param {string|HTMLElement} target - Target ID or element
 * @param {boolean} show - Whether to show or hide
 */
_toggleCollapse(target, show = null) {
  // Get target element
  const content = typeof target === 'string' 
    ? document.getElementById(target)
    : target;
    
  if (!content) {
    console.warn(`Collapse target not found: ${target}`);
    return;
  }
  
  // Determine whether to show or hide
  const isCurrentlyOpen = content.classList.contains('show');
  const shouldShow = show !== null ? show : !isCurrentlyOpen;
  
  if (shouldShow) {
    content.classList.add('show');
    content.style.height = `${content.scrollHeight}px`;
    
    // After transition completes, set height to auto
    setTimeout(() => {
      if (content.classList.contains('show')) {
        content.style.height = 'auto';
      }
    }, 350); // Match transition duration
  } else {
    // Set fixed height before collapsing
    content.style.height = `${content.scrollHeight}px`;
    
    // Force a repaint
    content.offsetHeight;
    
    // Start collapse
    content.classList.remove('show');
    content.style.height = '0';
  }
},

/**
 * Toggle theme
 * @private
 */
_toggleTheme() {
  // Use themeManager if available
  if (window.themeManager && typeof window.themeManager.toggleTheme === 'function') {
    window.themeManager.toggleTheme();
  } else {
    // Fallback theme toggle
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    document.body.className = document.body.className.replace(/theme-[^\s]+/g, '');
    document.body.classList.add(`theme-${newTheme}`);
    
    // Emit event
    this._emitEvent('theme:change', { theme: newTheme });
  }
},

/**
 * Emit an event through eventRegistry
 * @private
 * @param {string} eventName - Event name
 * @param {Object} data - Event data
 */
_emitEvent(eventName, data = {}) {
  try {
    if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
      window.eventRegistry.emit(eventName, data);
    }
  } catch (e) {
    // Ignore errors with event registry
  }
}
};

// Export both default and named exports
export default eventManager;
export const registerEvents = eventManager.registerEvents.bind(eventManager);
export const removeEvents = eventManager.removeEvents.bind(eventManager);
export const setupDelegatedEvents = eventManager.setupDelegatedEvents.bind(eventManager);
export const removeDelegatedEvents = eventManager.removeDelegatedEvents.bind(eventManager);
export const initialize = eventManager.initialize.bind(eventManager);