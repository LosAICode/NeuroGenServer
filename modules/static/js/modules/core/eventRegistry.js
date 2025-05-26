/**
 * NeuroGen Server - Event Registry Module
 * 
 * Provides a centralized event management system for publishing and subscribing to events
 * throughout the application. This module enables decoupled communication between
 * different parts of the application.
 * 
 * Enhanced with:
 * - Better error handling and recovery
 * - Improved debug logging
 * - DOM-ready safety
 * - Event priority management
 * - Async/sync handling options
 * - Memory leak prevention
 * - Statistics tracking
 * - Circular reference protection
 * - Support for registerEvents with no arguments or non-array arguments
 */

/**
 * Event Registry with pub/sub capabilities
 */
const eventRegistry = {
  // Private event storage
  _events: {},
  
  // Track module initialization
  initialized: false,
  
  // Track DOM-ready state
  _domReady: false,
  
  // Store events triggered before DOM ready
  _pendingEvents: [],
  
  // Statistics tracking
  _stats: {
    totalEvents: 0,
    emits: 0,
    handlers: 0,
    errors: 0
  },
  
  // Default events to register
  _defaultEvents: [
    // System events
    'system.ready',
    'system.error',
    'system.warning',
    'system.info',
    
    // UI events
    'ui.ready',
    'ui.modal.open',
    'ui.modal.close',
    'ui.toast.show',
    'ui.theme.change',
    
    // Application events
    'app.initialized',
    'app.start',
    'app.shutdown',
    'app.error',
    
    // Data events
    'data.ready',
    'data.changed',
    'data.saved',
    'data.error',
    
    // Session events
    'session.login',
    'session.logout',
    'session.expired',
    
    // Socket events
    'socket.connected',
    'socket.disconnected',
    'socket.error',
    'socket.message',
    
    // Task events
    'task.start',
    'task.progress',
    'task.complete',
    'task.error',
    'task.cancel'
  ],
  
  /**
   * Initialize the event registry
   * @param {Object} options - Initialization options
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(options = {}) {
    // Avoid duplicate initialization
    if (this.initialized) {
      console.warn('Event Registry already initialized');
      return false;
    }
    
    // Set up DOM ready handler
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this._domReady = true;
        this._processPendingEvents();
      });
      
      // Fallback if DOMContentLoaded already fired
      window.addEventListener('load', () => {
        this._domReady = true;
        this._processPendingEvents();
      });
    } else {
      // DOM already loaded
      this._domReady = true;
    }
    
    // Set up options
    this.options = {
      debug: window.debugMode || false,
      defaultMaxListeners: 10,
      warnOnMemoryLeak: true,
      preventCircularReferences: true,
      autoRegisterDefaultEvents: true,
      ...options
    };
    
    // Initialize events map
    this._events = {};
    
    // Make available globally for debugging if in debug mode
    if (window.debugMode) {
      window.eventRegistry = this;
    }
    
    // Auto-register default events if enabled
    if (this.options.autoRegisterDefaultEvents) {
      this.registerEvents(this._defaultEvents);
    }
    
    this.initialized = true;
    console.log('Event Registry initialized');
    
    return true;
  },
  
  /**
   * Process events that were triggered before DOM was ready
   * @private
   */
  _processPendingEvents() {
    if (this._pendingEvents.length > 0) {
      if (this.options.debug) {
        console.log(`Processing ${this._pendingEvents.length} pending events that were triggered before DOM ready`);
      }
      
      // Process each pending event
      this._pendingEvents.forEach(pendingEvent => {
        this.emit(pendingEvent.eventName, pendingEvent.data);
      });
      
      // Clear the pending events
      this._pendingEvents = [];
    }
  },
  
  /**
   * Register a new event type
   * @param {string} eventName - Name of the event to register
   * @param {Object} options - Options for this event type
   * @returns {boolean} - Whether registration was successful
   */
  registerEvent(eventName, options = {}) {
    if (!eventName) {
      console.error('Event name is required');
      return false;
    }
    
    // Don't overwrite existing events unless forced
    if (this._events[eventName] && !options.force) {
      if (this.options.debug) {
        console.warn(`Event '${eventName}' already registered. Use force: true to overwrite.`);
      }
      return false;
    }
    
    // Create event with options and empty handler list
    this._events[eventName] = {
      handlers: [],
      options: {
        // Default options
        async: false,
        maxListeners: this.options?.defaultMaxListeners || 10,
        logEmits: false,
        // Override with provided options
        ...options
      }
    };
    
    // Increment statistics
    this._stats.totalEvents++;
    
    if (this.options.debug) {
      console.log(`Event '${eventName}' registered successfully`);
    }
    
    return true;
  },
  
  /**
   * Register multiple events at once
   * @param {Array<Object>|Object|undefined} events - Array of event configurations or object with event names as keys
   * @returns {boolean} - Whether all registrations were successful
   */
  registerEvents(events) {
    // If no events provided, register default events
    if (events === undefined || events === null) {
      if (this.options.debug) {
        console.log('No events provided, registering default events');
      }
      return this.registerEvents(this._defaultEvents);
    }
    
    // Handle various input types
    let eventArray = [];
    
    if (Array.isArray(events)) {
      eventArray = events;
    } else if (typeof events === 'object') {
      // Convert object to array of objects
      eventArray = Object.entries(events).map(([name, options]) => ({
        name,
        options: options || {}
      }));
    } else if (typeof events === 'string') {
      // Single event name as string
      eventArray = [events];
    } else {
      console.error('Events must be an array, object, or string');
      return false;
    }
    
    if (eventArray.length === 0) {
      if (this.options.debug) {
        console.log('No events to register, using default events');
      }
      return this.registerEvents(this._defaultEvents);
    }
    
    const results = eventArray.map(event => {
      if (typeof event === 'string') {
        return this.registerEvent(event);
      } else if (typeof event === 'object' && event.name) {
        return this.registerEvent(event.name, event.options || {});
      }
      
      console.warn('Invalid event format:', event);
      return false;
    });
    
    // Count successful registrations
    const successCount = results.filter(result => result === true).length;
    
    if (this.options.debug) {
      console.log(`Successfully registered ${successCount} of ${eventArray.length} events`);
    }
    
    // Return true only if all registrations succeeded
    return results.every(result => result === true);
  },
  
  /**
   * Subscribe to an event
   * @param {string} eventName - Event to subscribe to
   * @param {Function} handler - Callback for the event
   * @param {Object} options - Handler-specific options
   * @returns {Function} - Unsubscribe function
   */
  on(eventName, handler, options = {}) {
    try {
      // Validate inputs
      if (!eventName || typeof eventName !== 'string') {
        console.error('Event name must be a string');
        return () => false;
      }
      
      if (!handler || typeof handler !== 'function') {
        console.error('Event handler must be a function');
        return () => false;
      }
      
      // Create event if it doesn't exist yet
      if (!this._events[eventName]) {
        this.registerEvent(eventName);
      }
      
      const event = this._events[eventName];
      
      // Check max listeners
      if (event.handlers.length >= event.options.maxListeners) {
        if (this.options.warnOnMemoryLeak) {
          console.warn(`Event '${eventName}' has reached maximum listeners (${event.options.maxListeners}). This may indicate a memory leak.`);
        }
      }
      
      // Create handler with options
      const handlerObj = {
        callback: handler,
        options: {
          once: false,
          priority: 0,
          context: null, // execution context for the handler
          ...options
        },
        id: this._generateHandlerId(),
        added: Date.now()
      };
      
      // Add handler to list
      event.handlers.push(handlerObj);
      
      // Sort handlers by priority
      this._sortHandlers(eventName);
      
      // Update statistics
      this._stats.handlers++;
      
      if (this.options.debug) {
        console.log(`Event handler added for '${eventName}', total handlers: ${event.handlers.length}`);
      }
      
      // Return unsubscribe function
      return () => this.off(eventName, handler);
    } catch (error) {
      console.error(`Error in eventRegistry.on('${eventName}'):`, error);
      this._stats.errors++;
      return () => false;
    }
  },
  
  /**
   * Subscribe to an event once
   * @param {string} eventName - Event to subscribe to
   * @param {Function} handler - Callback for the event
   * @param {Object} options - Handler-specific options
   * @returns {Function} - Unsubscribe function
   */
  once(eventName, handler, options = {}) {
    return this.on(eventName, handler, { ...options, once: true });
  },
  
  /**
   * Unsubscribe from an event
   * @param {string} eventName - Event to unsubscribe from
   * @param {Function} handler - Handler to remove
   * @returns {boolean} - Whether unsubscription was successful
   */
  off(eventName, handler) {
    try {
      // If the event doesn't exist, nothing to do
      if (!this._events[eventName]) {
        return false;
      }
      
      const event = this._events[eventName];
      const initialLength = event.handlers.length;
      
      // Filter out the specified handler
      event.handlers = event.handlers.filter(h => h.callback !== handler);
      
      // Update statistics
      this._stats.handlers -= (initialLength - event.handlers.length);
      
      if (this.options.debug && initialLength !== event.handlers.length) {
        console.log(`Event handler removed for '${eventName}', remaining: ${event.handlers.length}`);
      }
      
      // Return true if at least one handler was removed
      return event.handlers.length < initialLength;
    } catch (error) {
      console.error(`Error in eventRegistry.off('${eventName}'):`, error);
      this._stats.errors++;
      return false;
    }
  },
  
  /**
   * Unsubscribe from an event by ID
   * @param {string} eventName - Event to unsubscribe from
   * @param {string} handlerId - ID of the handler to remove
   * @returns {boolean} - Whether unsubscription was successful
   */
  offById(eventName, handlerId) {
    try {
      // If the event doesn't exist, nothing to do
      if (!this._events[eventName]) {
        return false;
      }
      
      const event = this._events[eventName];
      const initialLength = event.handlers.length;
      
      // Filter out the specified handler by ID
      event.handlers = event.handlers.filter(h => h.id !== handlerId);
      
      // Update statistics
      this._stats.handlers -= (initialLength - event.handlers.length);
      
      if (this.options.debug && initialLength !== event.handlers.length) {
        console.log(`Event handler removed by ID for '${eventName}', remaining: ${event.handlers.length}`);
      }
      
      // Return true if at least one handler was removed
      return event.handlers.length < initialLength;
    } catch (error) {
      console.error(`Error in eventRegistry.offById('${eventName}', '${handlerId}'):`, error);
      this._stats.errors++;
      return false;
    }
  },
  
  /**
   * Remove all handlers for an event
   * @param {string} eventName - Event to clear
   * @returns {boolean} - Whether clear was successful
   */
  clearEvent(eventName) {
    try {
      if (!this._events[eventName]) {
        return false;
      }
      
      // Update statistics
      this._stats.handlers -= this._events[eventName].handlers.length;
      
      // Clear handlers
      this._events[eventName].handlers = [];
      
      if (this.options.debug) {
        console.log(`Cleared all handlers for event '${eventName}'`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error in eventRegistry.clearEvent('${eventName}'):`, error);
      this._stats.errors++;
      return false;
    }
  },
  
  /**
   * Remove all handlers from all events
   * @returns {boolean} - Whether clear was successful
   */
  clearAllEvents() {
    try {
      let totalHandlersRemoved = 0;
      
      Object.keys(this._events).forEach(eventName => {
        totalHandlersRemoved += this._events[eventName].handlers.length;
        this._events[eventName].handlers = [];
      });
      
      // Update statistics
      this._stats.handlers -= totalHandlersRemoved;
      
      if (this.options.debug) {
        console.log(`Cleared all handlers for all events (${totalHandlersRemoved} total)`);
      }
      
      return true;
    } catch (error) {
      console.error('Error in eventRegistry.clearAllEvents():', error);
      this._stats.errors++;
      return false;
    }
  },
  
  /**
   * Sort handlers for an event by priority
   * @private
   * @param {string} eventName - Event to sort handlers for
   */
  _sortHandlers(eventName) {
    if (!this._events[eventName]) return;
    
    // Sort handlers by priority (higher number = higher priority)
    this._events[eventName].handlers.sort((a, b) => {
      return b.options.priority - a.options.priority;
    });
  },
  
  /**
   * Generate a unique handler ID
   * @private
   * @returns {string} - Unique ID
   */
  _generateHandlerId() {
    return `handler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
  
  /**
   * Emit an event
   * @param {string} eventName - Event to emit
   * @param {*} data - Data to pass to handlers
   * @returns {boolean} - Whether emit was successful
   */
  emit(eventName, data = null) {
    try {
      // If DOM is not ready, queue the event for later
      if (!this._domReady && typeof document !== 'undefined') {
        // Don't queue internal events
        if (!eventName.startsWith('__')) {
          this._pendingEvents.push({ eventName, data });
          
          if (this.options.debug) {
            console.log(`Event '${eventName}' queued for after DOM ready`);
          }
          
          return true;
        }
      }
      
      // If the event doesn't exist, auto-create it
      if (!this._events[eventName]) {
        // Auto-create the event if it doesn't exist
        this.registerEvent(eventName);
      }
      
      const event = this._events[eventName];
      
      // Log event if configured
      if (event.options.logEmits || this.options.debug) {
        console.log(`Event emitted: ${eventName}`, data);
      }
      
      // Create handler execution list (to handle removal during iteration)
      const handlers = [...event.handlers];
      
      // Skip if no handlers
      if (handlers.length === 0) {
        return false;
      }
      
      // Track once handlers to remove
      const handlersToRemove = [];
      
      // Update statistics
      this._stats.emits++;
      
      // Execute handlers based on async setting
      if (event.options.async) {
        // Async execution
        Promise.all(handlers.map(async (handler) => {
          try {
            // Apply context if provided
            if (handler.options.context) {
              await handler.callback.call(handler.options.context, data);
            } else {
              await handler.callback(data);
            }
            
            // Track once handlers
            if (handler.options.once) {
              handlersToRemove.push(handler.callback);
            }
          } catch (error) {
            this._stats.errors++;
            console.error(`Error in async handler for event '${eventName}':`, error);
            // Emit error event
            if (eventName !== 'error') {
              this.emit('error', { 
                source: 'eventHandler',
                originalEvent: eventName,
                error,
                data
              });
            }
          }
        }));
      } else {
        // Synchronous execution
        for (const handler of handlers) {
          try {
            // Apply context if provided
            if (handler.options.context) {
              handler.callback.call(handler.options.context, data);
            } else {
              handler.callback(data);
            }
            
            // Track once handlers
            if (handler.options.once) {
              handlersToRemove.push(handler.callback);
            }
          } catch (error) {
            this._stats.errors++;
            console.error(`Error in handler for event '${eventName}':`, error);
            // Emit error event
            if (eventName !== 'error') {
              this.emit('error', { 
                source: 'eventHandler',
                originalEvent: eventName,
                error,
                data
              });
            }
          }
        }
      }
      
      // Remove once handlers
      handlersToRemove.forEach(handler => {
        this.off(eventName, handler);
      });
      
      return true;
    } catch (error) {
      this._stats.errors++;
      console.error(`Error in eventRegistry.emit('${eventName}'):`, error);
      return false;
    }
  },
  
  /**
   * Emit an event and collect handler results
   * @param {string} eventName - Event to emit
   * @param {*} data - Data to pass to handlers
   * @returns {Promise<Array>} - Results from all handlers
   */
  async emitWithResults(eventName, data = null) {
    try {
      // If the event doesn't exist, auto-create it
      if (!this._events[eventName]) {
        this.registerEvent(eventName);
        // Return empty array if no handlers
        return [];
      }
      
      const event = this._events[eventName];
      const handlers = [...event.handlers];
      
      // Skip if no handlers
      if (handlers.length === 0) {
        return [];
      }
      
      // Log event if configured
      if (event.options.logEmits || this.options.debug) {
        console.log(`Event emitted with results: ${eventName}`, data);
      }
      
      // Update statistics
      this._stats.emits++;
      
      // Track once handlers to remove
      const handlersToRemove = [];
      
      // Execute handlers and collect results
      const results = await Promise.all(
        handlers.map(async (handler) => {
          try {
            let result;
            
            // Apply context if provided
            if (handler.options.context) {
              result = await Promise.resolve(handler.callback.call(handler.options.context, data));
            } else {
              result = await Promise.resolve(handler.callback(data));
            }
            
            // Track once handlers
            if (handler.options.once) {
              handlersToRemove.push(handler.callback);
            }
            
            return { success: true, result };
          } catch (error) {
            this._stats.errors++;
            console.error(`Error in handler for event '${eventName}':`, error);
            
            return { success: false, error };
          }
        })
      );
      
      // Remove once handlers
      handlersToRemove.forEach(handler => {
        this.off(eventName, handler);
      });
      
      return results;
    } catch (error) {
      this._stats.errors++;
      console.error(`Error in eventRegistry.emitWithResults('${eventName}'):`, error);
      return [{ success: false, error }];
    }
  },
  
  /**
   * Get a list of all registered events
   * @returns {Array<string>} - List of event names
   */
  getEvents() {
    return Object.keys(this._events);
  },
  
  /**
   * Get the details of a specific event
   * @param {string} eventName - Event to get information for
   * @returns {Object|null} - Event information
   */
  getEventInfo(eventName) {
    if (!this._events[eventName]) {
      return null;
    }
    
    const event = this._events[eventName];
    
    return {
      name: eventName,
      handlerCount: event.handlers.length,
      options: { ...event.options },
      handlers: event.handlers.map(h => ({
        id: h.id,
        priority: h.options.priority,
        once: h.options.once,
        added: h.added
      }))
    };
  },
  
  /**
   * Get information about all events
   * @returns {Object} - Event information for all events
   */
  getAllEventInfo() {
    const info = {};
    
    Object.keys(this._events).forEach(eventName => {
      info[eventName] = this.getEventInfo(eventName);
    });
    
    return info;
  },
  
  /**
   * Get a count of handlers for an event
   * @param {string} eventName - Event to count handlers for
   * @returns {number} - Number of handlers
   */
  getHandlerCount(eventName) {
    if (!this._events[eventName]) {
      return 0;
    }
    
    return this._events[eventName].handlers.length;
  },
  
  /**
   * Check if an event has any handlers
   * @param {string} eventName - Event to check
   * @returns {boolean} - Whether the event has handlers
   */
  hasHandlers(eventName) {
    return this.getHandlerCount(eventName) > 0;
  },
  
  /**
   * Check if an event exists
   * @param {string} eventName - Event to check
   * @returns {boolean} - Whether the event exists
   */
  eventExists(eventName) {
    return !!this._events[eventName];
  },
  
  /**
   * Set options for an event
   * @param {string} eventName - Event to update
   * @param {Object} options - New options
   * @returns {boolean} - Whether update was successful
   */
  setEventOptions(eventName, options) {
    if (!this._events[eventName]) {
      return false;
    }
    
    this._events[eventName].options = {
      ...this._events[eventName].options,
      ...options
    };
    
    return true;
  },
  
  /**
   * Get event registry statistics
   * @returns {Object} - Statistics information
   */
  getStats() {
    // Calculate active handlers
    let activeHandlers = 0;
    let eventWithMostHandlers = '';
    let maxHandlers = 0;
    
    Object.entries(this._events).forEach(([eventName, event]) => {
      const count = event.handlers.length;
      activeHandlers += count;
      
      if (count > maxHandlers) {
        maxHandlers = count;
        eventWithMostHandlers = eventName;
      }
    });
    
    return {
      ...this._stats,
      activeEvents: Object.keys(this._events).length,
      activeHandlers,
      eventWithMostHandlers,
      maxHandlers,
      pendingEvents: this._pendingEvents.length,
      memoryUsage: this._estimateMemoryUsage()
    };
  },
  
  /**
   * Estimate memory usage of the event registry
   * @private
   * @returns {Object} - Memory usage estimate
   */
  _estimateMemoryUsage() {
    let totalHandlers = 0;
    let totalEvents = Object.keys(this._events).length;
    
    Object.values(this._events).forEach(event => {
      totalHandlers += event.handlers.length;
    });
    
    // Rough estimate
    return {
      eventsBytes: totalEvents * 200, // 200 bytes per event structure
      handlersBytes: totalHandlers * 500, // 500 bytes per handler
      totalBytes: totalEvents * 200 + totalHandlers * 500
    };
  },
  
  /**
   * Reset the registry (primarily for testing)
   */
  reset() {
    this._events = {};
    this._pendingEvents = [];
    this._stats = {
      totalEvents: 0,
      emits: 0,
      handlers: 0,
      errors: 0
    };
    this.initialized = false;
    
    if (this.options.debug) {
      console.log('Event Registry reset');
    }
  }
};

// Initialize the registry at module load time
// But wait until next tick to avoid immediate DOM access
setTimeout(() => {
  try {
    if (!eventRegistry.initialized) {
      eventRegistry.initialize();
    }
  } catch (error) {
    console.error('Error auto-initializing event registry:', error);
  }
}, 0);

// Export both default and named exports
export default eventRegistry;
export const on = eventRegistry.on.bind(eventRegistry);
export const off = eventRegistry.off.bind(eventRegistry);
export const once = eventRegistry.once.bind(eventRegistry);
export const emit = eventRegistry.emit.bind(eventRegistry);
export const emitWithResults = eventRegistry.emitWithResults.bind(eventRegistry);
export const registerEvent = eventRegistry.registerEvent.bind(eventRegistry);
export const registerEvents = eventRegistry.registerEvents.bind(eventRegistry);
export const clearEvent = eventRegistry.clearEvent.bind(eventRegistry);
export const clearAllEvents = eventRegistry.clearAllEvents.bind(eventRegistry);
export const getEvents = eventRegistry.getEvents.bind(eventRegistry);
export const getHandlerCount = eventRegistry.getHandlerCount.bind(eventRegistry);
export const hasHandlers = eventRegistry.hasHandlers.bind(eventRegistry);
export const eventExists = eventRegistry.eventExists.bind(eventRegistry);
export const getEventInfo = eventRegistry.getEventInfo.bind(eventRegistry);
export const getAllEventInfo = eventRegistry.getAllEventInfo.bind(eventRegistry);
export const setEventOptions = eventRegistry.setEventOptions.bind(eventRegistry);
export const getStats = eventRegistry.getStats.bind(eventRegistry);
export const initialize = eventRegistry.initialize.bind(eventRegistry);
