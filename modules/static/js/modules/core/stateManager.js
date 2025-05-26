/**
 * NeuroGen Server - State Manager Module
 * 
 * Provides a centralized state management system for the application.
 * Implements a simplified Redux-like pattern with state, actions, and subscriptions.
 * Enhanced with persistence, detailed history tracking, path-based subscriptions,
 * and error recovery mechanisms.
 */

/**
 * State Manager for application-wide state
 */
const stateManager = {
  // Private state storage
  _state: {
    // Application-level state
    app: {
      initialized: false,
      theme: 'light',
      error: null,
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      debugMode: false,
      systemInfo: {
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown'
      }
    },
    
    // Feature-specific state
    fileProcessor: {
      files: [],
      processing: false,
      task: null,
      progress: 0,
      error: null,
      results: null,
      options: {
        extractText: true,
        extractTables: true,
        parseStructure: true,
        useOcr: true
      }
    },
    
    webScraper: {
      urls: [],
      processing: false,
      task: null,
      progress: 0,
      results: null,
      error: null,
      options: {
        downloadPdfs: true,
        processPdfs: true,
        maxDepth: 1,
        followLinks: false
      },
      pdfDownloads: []
    },
    
    playlistDownloader: {
      playlists: [],
      processing: false,
      task: null,
      progress: 0,
      results: null,
      error: null,
      options: {
        audioOnly: true,
        highQuality: false,
        createPlaylist: true,
        extractMetadata: true
      }
    },
    
    academicSearch: {
      results: [],
      searching: false,
      query: '',
      source: 'all',
      filters: {
        yearStart: null,
        yearEnd: null,
        openAccess: false,
        sortBy: 'relevance'
      },
      selectedItems: []
    },
    
    // UI state
    ui: {
      activeTab: 'file-processor',
      modals: {},
      loading: false,
      notifications: [],
      tour: {
        completed: false,
        currentStep: 0
      },
      panels: {
        leftSidebar: {
          visible: true,
          width: 250
        },
        rightSidebar: {
          visible: false, 
          width: 300
        }
      },
      lastInteraction: new Date().toISOString()
    },
    
    // User settings/preferences
    settings: {
      outputPath: '',
      darkMode: false,
      autoDownload: true,
      debug: false,
      advanced: {
        maxThreads: 4,
        cacheResults: true,
        socketTimeout: 30000,
        autoSave: true
      },
      accessibility: {
        highContrast: false,
        fontSize: 'normal',
        reduceMotion: false
      }
    },
    
    // Processing history
    history: {
      tasks: [],
      recentFiles: [],
      recentSearches: [],
      lastTask: null
    }
  },
  
  // Subscriber callbacks
  _subscribers: [],
  
  // Path-based subscribers
  _pathSubscribers: {},
  
  // History of state changes
  _history: [],
  
  // Maximum history size
  _maxHistorySize: 50,
  
  // Root paths for persistence
  _persistentPaths: ['settings', 'history.recentFiles', 'history.recentSearches'],
  
  // Storage key for persistence
  _storageKey: 'neurogenserver_state',
  
  // Flag to prevent circular updates with persistence
  _updatingFromStorage: false,
  
  // Debug mode flag
  _debugMode: false,
  
  // Track initialization status
  initialized: false,
  
  /**
   * Initialize the state manager
   * @param {Object} initialState - Optional initial state override
   * @param {Object} options - Optional configuration
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(initialState = {}, options = {}) {
    if (this.initialized) {
      console.warn('State manager already initialized');
      return false;
    }
    
    try {
      // Set options
      if (options.debugMode !== undefined) {
        this._debugMode = options.debugMode;
      }
      
      if (options.storageKey) {
        this._storageKey = options.storageKey;
      }
      
      if (options.maxHistorySize !== undefined) {
        this._maxHistorySize = options.maxHistorySize;
      }
      
      if (options.persistentPaths) {
        this._persistentPaths = options.persistentPaths;
      }
      
      // Load persisted state from storage
      this._loadPersistedState();
      
      // Merge initialState with default state if provided
      if (initialState && typeof initialState === 'object') {
        this._state = this._deepMerge(this._state, initialState);
      }
      
      // Set debug mode in state
      this._state.app.debugMode = this._debugMode;
      
      // Initialize state change monitoring for state persistence
      this._initStateChangeMonitoring();
      
      // Mark as initialized
      this.initialized = true;
      this._state.app.initialized = true;
      this._state.app.lastUpdated = new Date().toISOString();
      
      // Make available globally for debugging if in debug mode
      if (this._debugMode || window.debugMode) {
        window.stateManager = this;
      }
      
      // Add event listener for storage events to sync state across tabs if needed
      if (options.syncAcrossTabs) {
        this._setupStorageListener();
      }
      
      console.log('State manager initialized');
      return true;
    } catch (error) {
      console.error('Error initializing state manager:', error);
      return false;
    }
  },
  
  /**
   * Get current state or a specific part of it
   * @param {string} path - Optional dot notation path (e.g., 'app.theme')
   * @returns {*} - The requested state or full state object
   */
  getState(path = null) {
    try {
      // Return full state if no path provided
      if (!path) {
        return this._deepClone(this._state);
      }
      
      // Parse the path
      const parts = path.split('.');
      let currentObj = this._state;
      
      // Traverse the path
      for (const part of parts) {
        if (currentObj === undefined || currentObj === null) {
          return undefined;
        }
        
        currentObj = currentObj[part];
      }
      
      // Return a deep clone to prevent direct state modification
      return this._deepClone(currentObj);
    } catch (error) {
      console.error('Error getting state:', error);
      return undefined;
    }
  },
  
  /**
   * Update the state
   * @param {string|Object} pathOrState - Path to update or state object
   * @param {*} value - Value to set (if path is provided)
   * @param {Object} options - Additional options for the update
   * @returns {boolean} - Whether the update was successful
   */
  setState(pathOrState, value, options = {}) {
    try {
      // Default options
      const defaultOptions = {
        addToHistory: true,
        notifySubscribers: true,
        persist: true
      };
      
      const updateOptions = { ...defaultOptions, ...options };
      
      // Save previous state for history
      const previousState = this._deepClone(this._state);
      
      // Handle object update
      if (typeof pathOrState === 'object') {
        // Merge in the new state
        this._state = this._deepMerge(this._state, pathOrState);
      }
      // Handle path update
      else if (typeof pathOrState === 'string') {
        const path = pathOrState;
        
        // Parse the path
        const parts = path.split('.');
        let currentObj = this._state;
        
        // Traverse the path to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          
          // Create missing objects along the path
          if (currentObj[part] === undefined || currentObj[part] === null) {
            currentObj[part] = {};
          }
          
          currentObj = currentObj[part];
        }
        
        // Set the value at the leaf
        const lastPart = parts[parts.length - 1];
        currentObj[lastPart] = value;
      }
      else {
        console.error('Invalid argument for setState: must be object or string path');
        return false;
      }
      
      // Update last updated timestamp
      this._state.app.lastUpdated = new Date().toISOString();
      
      // Add to history if enabled
      if (updateOptions.addToHistory) {
        this._addToHistory(previousState, this._state);
      }
      
      // Persist state if enabled and not triggered by storage event
      if (updateOptions.persist && !this._updatingFromStorage) {
        this._persistState();
      }
      
      // Notify subscribers if enabled
      if (updateOptions.notifySubscribers) {
        this._notifySubscribers(previousState);
      }
      
      return true;
    } catch (error) {
      console.error('Error setting state:', error);
      return false;
    }
  },
  
  /**
   * Batch multiple state updates in a single operation
   * @param {Array<{path: string, value: any}>|Object} updates - Array of updates or object with paths as keys
   * @param {Object} options - Additional options for the batch update
   * @returns {boolean} - Whether all updates were successful
   */
  batchUpdate(updates, options = {}) {
    try {
      // Save previous state for history
      const previousState = this._deepClone(this._state);
      
      // Apply all updates without notifications
      let success = true;
      
      // Handle array of updates
      if (Array.isArray(updates)) {
        for (const update of updates) {
          if (!update.path) {
            console.error('Invalid update: missing path', update);
            success = false;
            continue;
          }
          
          // Apply update without history or notifications
          const updateResult = this.setState(
            update.path, 
            update.value, 
            { addToHistory: false, notifySubscribers: false, persist: false }
          );
          
          if (!updateResult) {
            success = false;
          }
        }
      }
      // Handle object with paths as keys
      else if (typeof updates === 'object') {
        for (const [path, value] of Object.entries(updates)) {
          // Apply update without history or notifications
          const updateResult = this.setState(
            path, 
            value, 
            { addToHistory: false, notifySubscribers: false, persist: false }
          );
          
          if (!updateResult) {
            success = false;
          }
        }
      }
      else {
        console.error('Invalid argument for batchUpdate: must be array or object');
        return false;
      }
      
      // Update timestamp
      this._state.app.lastUpdated = new Date().toISOString();
      
      // Now add to history, persist, and notify subscribers just once
      if (options.addToHistory !== false) {
        this._addToHistory(previousState, this._state);
      }
      
      if (options.persist !== false && !this._updatingFromStorage) {
        this._persistState();
      }
      
      if (options.notifySubscribers !== false) {
        this._notifySubscribers(previousState);
      }
      
      return success;
    } catch (error) {
      console.error('Error performing batch update:', error);
      return false;
    }
  },
  
  /**
   * Load persisted state from storage
   * @private
   */
  _loadPersistedState() {
    try {
      this._updatingFromStorage = true;
      
      // Try to get persisted state from localStorage
      const persistedStateJson = localStorage.getItem(this._storageKey);
      if (!persistedStateJson) {
        this._updatingFromStorage = false;
        return;
      }
      
      const persistedState = JSON.parse(persistedStateJson);
      if (!persistedState || typeof persistedState !== 'object') {
        this._updatingFromStorage = false;
        return;
      }
      
      // Apply persisted state for each persistent path
      for (const path of this._persistentPaths) {
        const value = this._getValueByPath(persistedState, path);
        if (value !== undefined) {
          this._setValueByPath(this._state, path, value);
        }
      }
      
      this._updatingFromStorage = false;
      console.log('Loaded persisted state');
    } catch (error) {
      this._updatingFromStorage = false;
      console.warn('Error loading persisted state:', error);
    }
  },
  
  /**
   * Persist state to storage
   * @private
   */
  _persistState() {
    try {
      // Create a new object with only persistent paths
      const persistObj = {};
      
      for (const path of this._persistentPaths) {
        const value = this._getValueByPath(this._state, path);
        if (value !== undefined) {
          this._setValueByPath(persistObj, path, value);
        }
      }
      
      // Add metadata
      persistObj.meta = {
        timestamp: new Date().toISOString(),
        version: this._state.app.version
      };
      
      // Store in localStorage
      localStorage.setItem(this._storageKey, JSON.stringify(persistObj));
      
      if (this._debugMode) {
        console.log('State persisted to storage');
      }
    } catch (error) {
      console.warn('Error persisting state:', error);
    }
  },
  
  /**
   * Set up storage event listener for cross-tab syncing
   * @private
   */
  _setupStorageListener() {
    try {
      window.addEventListener('storage', (event) => {
        if (event.key === this._storageKey && event.newValue) {
          try {
            this._updatingFromStorage = true;
            
            const persistedState = JSON.parse(event.newValue);
            if (!persistedState || typeof persistedState !== 'object') {
              this._updatingFromStorage = false;
              return;
            }
            
            // Save previous state for notifications
            const previousState = this._deepClone(this._state);
            
            // Apply persisted state for each persistent path
            for (const path of this._persistentPaths) {
              const value = this._getValueByPath(persistedState, path);
              if (value !== undefined) {
                this._setValueByPath(this._state, path, value);
              }
            }
            
            // Update timestamp
            this._state.app.lastUpdated = new Date().toISOString();
            
            // Notify subscribers
            this._notifySubscribers(previousState);
            
            this._updatingFromStorage = false;
            
            if (this._debugMode) {
              console.log('State synchronized from another tab');
            }
          } catch (error) {
            this._updatingFromStorage = false;
            console.warn('Error processing storage event:', error);
          }
        }
      });
      
      console.log('Cross-tab state synchronization enabled');
    } catch (error) {
      console.warn('Error setting up storage listener:', error);
    }
  },
  
  /**
   * Get a value from an object by dot notation path
   * @private
   * @param {Object} obj - Object to get value from
   * @param {string} path - Dot notation path
   * @returns {*} - Value at path or undefined
   */
  _getValueByPath(obj, path) {
    try {
      const parts = path.split('.');
      let current = obj;
      
      for (const part of parts) {
        if (current === undefined || current === null) {
          return undefined;
        }
        current = current[part];
      }
      
      return current;
    } catch (error) {
      console.warn(`Error getting value by path ${path}:`, error);
      return undefined;
    }
  },
  
  /**
   * Set a value in an object by dot notation path
   * @private
   * @param {Object} obj - Object to set value in
   * @param {string} path - Dot notation path
   * @param {*} value - Value to set
   */
  _setValueByPath(obj, path, value) {
    try {
      const parts = path.split('.');
      let current = obj;
      
      // Navigate to the parent of the target
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined || current[part] === null) {
          current[part] = {};
        }
        current = current[part];
      }
      
      // Set the value on the target property
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    } catch (error) {
      console.warn(`Error setting value by path ${path}:`, error);
    }
  },
  
  /**
   * Initialize state change monitoring for persistence
   * @private
   */
  _initStateChangeMonitoring() {
    // Subscribe to state changes for persistence
    this.subscribe((newState, oldState) => {
      // Check if any persistent paths changed
      let persistentPathChanged = false;
      
      for (const path of this._persistentPaths) {
        const newValue = this._getValueByPath(newState, path);
        const oldValue = this._getValueByPath(oldState, path);
        
        // Compare as JSON strings for deep equality
        if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
          persistentPathChanged = true;
          break;
        }
      }
      
      // Persist if changed and not already updating from storage
      if (persistentPathChanged && !this._updatingFromStorage) {
        this._persistState();
      }
    });
  },
  
  /**
     * Add a state change to history
     * @private
     * @param {Object} previousState - State before change
     * @param {Object} newState - State after change
     */
  _addToHistory(previousState, newState) {
    try {
      // Create history entry with timestamp
      const historyEntry = {
        timestamp: new Date().toISOString(),
        previousState,
        newState,
        changes: this._getChanges(previousState, newState)
      };
      
      // Add to history
      this._history.push(historyEntry);
      
      // Trim history if needed
      if (this._history.length > this._maxHistorySize) {
        this._history.shift();
      }
    } catch (error) {
      console.warn('Error adding to history:', error);
    }
  },

  /**
   * Get the changes between two states
   * @private
   * @param {Object} prevState - Previous state
   * @param {Object} newState - New state
   * @returns {Object} - Changed paths and values
   */
  _getChanges(prevState, newState) {
    try {
      const changes = {};
      
      // Helper to find changes recursively
      const findChanges = (prev, next, path = '') => {
        // If types differ, consider it changed
        if (typeof prev !== typeof next) {
          changes[path] = { from: prev, to: next };
          return;
        }
        
        // Handle null
        if (prev === null || next === null) {
          if (prev !== next) {
            changes[path] = { from: prev, to: next };
          }
          return;
        }
        
        // Handle non-objects
        if (typeof prev !== 'object') {
          if (prev !== next) {
            changes[path] = { from: prev, to: next };
          }
          return;
        }
        
        // Handle arrays
        if (Array.isArray(prev) && Array.isArray(next)) {
          if (JSON.stringify(prev) !== JSON.stringify(next)) {
            changes[path] = { from: prev, to: next };
          }
          return;
        }
        
        // Handle Dates
        if (prev instanceof Date && next instanceof Date) {
          if (prev.getTime() !== next.getTime()) {
            changes[path] = { from: prev.toISOString(), to: next.toISOString() };
          }
          return;
        }
        
        // Handle objects
        const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        
        for (const key of allKeys) {
          const keyPath = path ? `${path}.${key}` : key;
          
          // If key exists in both objects, recurse
          if (key in prev && key in next) {
            findChanges(prev[key], next[key], keyPath);
          }
          // Key only in prev
          else if (key in prev) {
            changes[keyPath] = { from: prev[key], to: undefined };
          }
          // Key only in next
          else {
            changes[keyPath] = { from: undefined, to: next[key] };
          }
        }
      };
      
      findChanges(prevState, newState);
      return changes;
    } catch (error) {
      console.warn('Error calculating state changes:', error);
      return {};
    }
  },

  /**
   * Notify all subscribers of state change
   * @private
   * @param {Object} previousState - State before change
   */
  _notifySubscribers(previousState) {
    try {
      const newState = this._deepClone(this._state);
      
      // Prepare changes for path-based subscriptions
      const changes = this._getChanges(previousState, newState);
      const changedPaths = Object.keys(changes);
      
      // Call each global subscriber with new state and previous state
      for (const subscriber of this._subscribers) {
        try {
          subscriber(newState, previousState);
        } catch (error) {
          console.error('Error in state subscriber callback:', error);
        }
      }
      
      // Call path-based subscribers if their paths changed
      for (const [path, subscribers] of Object.entries(this._pathSubscribers)) {
        // Check if this path or any child path was changed
        const pathChanged = changedPaths.some(changedPath => 
          changedPath === path || // Exact match
          changedPath.startsWith(`${path}.`) || // Child property
          path.startsWith(`${changedPath}.`) // Parent property
        );
        
        if (pathChanged) {
          const pathValue = this._getValueByPath(newState, path);
          const previousPathValue = this._getValueByPath(previousState, path);
          
          for (const subscriber of subscribers) {
            try {
              subscriber(pathValue, previousPathValue, newState, previousState);
            } catch (error) {
              console.error(`Error in path subscriber callback for ${path}:`, error);
            }
          }
        }
      }
      
      // Try to dispatch event if eventRegistry is available
      try {
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
          window.eventRegistry.emit('state:change', {
            state: newState,
            previousState,
            changes
          });
        }
      } catch (e) {
        // Ignore errors with event registry
        if (this._debugMode) {
          console.debug('Error emitting state:change event:', e);
        }
      }
    } catch (error) {
      console.error('Error notifying subscribers:', error);
    }
  },

  /**
   * Subscribe to state changes
   * @param {Function} callback - Function to call on state change
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    if (typeof callback !== 'function') {
      console.error('Subscriber must be a function');
      return () => {};
    }
    
    try {
      // Add subscriber
      this._subscribers.push(callback);
      
      // Return unsubscribe function
      return () => {
        const index = this._subscribers.indexOf(callback);
        if (index !== -1) {
          this._subscribers.splice(index, 1);
          return true;
        }
        return false;
      };
    } catch (error) {
      console.error('Error subscribing to state changes:', error);
      return () => {};
    }
  },

  /**
   * Subscribe to changes at a specific state path
   * @param {string} path - Dot notation path to subscribe to
   * @param {Function} callback - Function to call when this path changes
   * @returns {Function} - Unsubscribe function
   */
  subscribePath(path, callback) {
    if (typeof path !== 'string') {
      console.error('Path must be a string');
      return () => {};
    }
    
    if (typeof callback !== 'function') {
      console.error('Subscriber must be a function');
      return () => {};
    }
    
    try {
      // Create subscribers array for this path if it doesn't exist
      if (!this._pathSubscribers[path]) {
        this._pathSubscribers[path] = [];
      }
      
      // Add the callback
      this._pathSubscribers[path].push(callback);
      
      // Return unsubscribe function
      return () => {
        if (!this._pathSubscribers[path]) return false;
        
        const index = this._pathSubscribers[path].indexOf(callback);
        if (index !== -1) {
          this._pathSubscribers[path].splice(index, 1);
          
          // Clean up empty arrays
          if (this._pathSubscribers[path].length === 0) {
            delete this._pathSubscribers[path];
          }
          
          return true;
        }
        return false;
      };
    } catch (error) {
      console.error(`Error subscribing to path ${path}:`, error);
      return () => {};
    }
  },

  /**
   * Reset state to initial values
   * @param {string} section - Optional section to reset
   * @returns {boolean} - Whether reset was successful
   */
  resetState(section = null) {
    try {
      // Save previous state
      const previousState = this._deepClone(this._state);
      
      if (section) {
        // Reset only the specified section by creating a fresh state
        const initialState = {
          app: {
            initialized: true,
            theme: this._state.app.theme,
            version: this._state.app.version,
            lastUpdated: new Date().toISOString(),
            debugMode: this._debugMode,
            systemInfo: this._state.app.systemInfo,
            error: null
          },
          fileProcessor: {
            files: [],
            processing: false,
            task: null,
            progress: 0,
            error: null,
            results: null,
            options: {
              extractText: true,
              extractTables: true,
              parseStructure: true,
              useOcr: true
            }
          },
          webScraper: {
            urls: [],
            processing: false,
            task: null,
            progress: 0,
            results: null,
            error: null,
            options: {
              downloadPdfs: true,
              processPdfs: true,
              maxDepth: 1,
              followLinks: false
            },
            pdfDownloads: []
          },
          playlistDownloader: {
            playlists: [],
            processing: false,
            task: null,
            progress: 0,
            results: null,
            error: null,
            options: {
              audioOnly: true,
              highQuality: false,
              createPlaylist: true,
              extractMetadata: true
            }
          },
          academicSearch: {
            results: [],
            searching: false,
            query: '',
            source: 'all',
            filters: {
              yearStart: null,
              yearEnd: null,
              openAccess: false,
              sortBy: 'relevance'
            },
            selectedItems: []
          },
          ui: {
            activeTab: 'file-processor',
            modals: {},
            loading: false,
            notifications: [],
            tour: {
              completed: false,
              currentStep: 0
            },
            panels: {
              leftSidebar: {
                visible: true,
                width: 250
              },
              rightSidebar: {
                visible: false, 
                width: 300
              }
            },
            lastInteraction: new Date().toISOString()
          },
          settings: this._state.settings, // Preserve settings
          history: this._state.history // Preserve history
        };
        
        if (initialState[section]) {
          this._state[section] = this._deepClone(initialState[section]);
          
          // For processing modules, ensure they're not in a broken state
          if (['fileProcessor', 'webScraper', 'playlistDownloader', 'academicSearch'].includes(section)) {
            this._state[section].processing = false;
            this._state[section].progress = 0;
            this._state[section].error = null;
          }
        } else {
          console.error(`Invalid state section: ${section}`);
          return false;
        }
      } else {
        // Reset entire state by recreating it
        // But preserve settings and process history
        const settings = this._deepClone(this._state.settings);
        const history = this._deepClone(this._state.history);
        
        // Reset with initial state
        this._state = this._deepClone(this._getInitialState());
        
        // Restore settings and history
        this._state.settings = settings;
        this._state.history = history;
        
        // Ensure app is marked as initialized
        this._state.app.initialized = true;
        this._state.app.lastUpdated = new Date().toISOString();
        this._state.app.debugMode = this._debugMode;
      }
      
      // Add to history
      this._addToHistory(previousState, this._state);
      
      // Persist state changes
      this._persistState();
      
      // Notify subscribers
      this._notifySubscribers(previousState);
      
      console.log(`State ${section ? `section ${section}` : 'fully'} reset`);
      return true;
    } catch (error) {
      console.error('Error resetting state:', error);
      return false;
    }
  },

  /**
   * Get a fresh initial state object
   * @private
   * @returns {Object} - Initial state object
   */
  _getInitialState() {
    return {
      app: {
        initialized: false,
        theme: 'light',
        error: null,
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        debugMode: this._debugMode,
        systemInfo: {
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          language: typeof navigator !== 'undefined' ? navigator.language : 'unknown'
        }
      },
      fileProcessor: {
        files: [],
        processing: false,
        task: null,
        progress: 0,
        error: null,
        results: null,
        options: {
          extractText: true,
          extractTables: true,
          parseStructure: true,
          useOcr: true
        }
      },
      webScraper: {
        urls: [],
        processing: false,
        task: null,
        progress: 0,
        results: null,
        error: null,
        options: {
          downloadPdfs: true,
          processPdfs: true,
          maxDepth: 1,
          followLinks: false
        },
        pdfDownloads: []
      },
      playlistDownloader: {
        playlists: [],
        processing: false,
        task: null,
        progress: 0,
        results: null,
        error: null,
        options: {
          audioOnly: true,
          highQuality: false,
          createPlaylist: true,
          extractMetadata: true
        }
      },
      academicSearch: {
        results: [],
        searching: false,
        query: '',
        source: 'all',
        filters: {
          yearStart: null,
          yearEnd: null,
          openAccess: false,
          sortBy: 'relevance'
        },
        selectedItems: []
      },
      ui: {
        activeTab: 'file-processor',
        modals: {},
        loading: false,
        notifications: [],
        tour: {
          completed: false,
          currentStep: 0
        },
        panels: {
          leftSidebar: {
            visible: true,
            width: 250
          },
          rightSidebar: {
            visible: false, 
            width: 300
          }
        },
        lastInteraction: new Date().toISOString()
      },
      settings: {
        outputPath: '',
        darkMode: false,
        autoDownload: true,
        debug: false,
        advanced: {
          maxThreads: 4,
          cacheResults: true,
          socketTimeout: 30000,
          autoSave: true
        },
        accessibility: {
          highContrast: false,
          fontSize: 'normal',
          reduceMotion: false
        }
      },
      history: {
        tasks: [],
        recentFiles: [],
        recentSearches: [],
        lastTask: null
      }
    };
  },

  /**
   * Get state history
   * @param {number} limit - Max number of history entries to return
   * @returns {Array} - State history
   */
  getHistory(limit = null) {
    try {
      if (limit) {
        return this._deepClone(this._history.slice(-limit));
      }
      
      return this._deepClone(this._history);
    } catch (error) {
      console.error('Error getting state history:', error);
      return [];
    }
  },

  /**
   * Clear state history
   * @returns {boolean} - Whether history was cleared
   */
  clearHistory() {
    try {
      this._history = [];
      return true;
    } catch (error) {
      console.error('Error clearing state history:', error);
      return false;
    }
  },

  /**
   * Add an item to a state array
   * @param {string} path - Path to the array
   * @param {*} item - Item to add
   * @param {Object} options - Additional options
   * @returns {boolean} - Whether item was added
   */
  addArrayItem(path, item, options = {}) {
    try {
      const array = this._getValueByPath(this._state, path);
      
      if (!Array.isArray(array)) {
        console.error(`Path ${path} is not an array`);
        return false;
      }
      
      // Clone the array
      const newArray = [...array];
      
      // Add the item
      if (options.prepend) {
        newArray.unshift(item);
      } else {
        newArray.push(item);
      }
      
      // Limit the array size if specified
      if (options.maxLength && newArray.length > options.maxLength) {
        if (options.prepend) {
          // Remove from the end
          newArray.splice(options.maxLength);
        } else {
          // Remove from the beginning
          newArray.splice(0, newArray.length - options.maxLength);
        }
      }
      
      // Update the state
      return this.setState(path, newArray, options);
    } catch (error) {
      console.error(`Error adding item to array at ${path}:`, error);
      return false;
    }
  },

  /**
   * Remove an item from a state array
   * @param {string} path - Path to the array
   * @param {*} itemOrPredicate - Item to remove or predicate function
   * @param {Object} options - Additional options
   * @returns {boolean} - Whether item was removed
   */
  removeArrayItem(path, itemOrPredicate, options = {}) {
    try {
      const array = this._getValueByPath(this._state, path);
      
      if (!Array.isArray(array)) {
        console.error(`Path ${path} is not an array`);
        return false;
      }
      
      // Clone the array
      let newArray = [...array];
      
      // Remove the item(s)
      if (typeof itemOrPredicate === 'function') {
        // Use predicate function to filter items
        newArray = newArray.filter(item => !itemOrPredicate(item));
      } else {
        // Remove by equality
        if (options.strict) {
          // Use strict equality
          newArray = newArray.filter(item => item !== itemOrPredicate);
        } else {
          // Use deep equality
          const stringifiedItem = JSON.stringify(itemOrPredicate);
          newArray = newArray.filter(item => JSON.stringify(item) !== stringifiedItem);
        }
      }
      
      // Check if anything was removed
      if (newArray.length === array.length) {
        return false;
      }
      
      // Update the state
      return this.setState(path, newArray, options);
    } catch (error) {
      console.error(`Error removing item from array at ${path}:`, error);
      return false;
    }
  },

  /**
   * Update an item in a state array
   * @param {string} path - Path to the array
   * @param {*} itemOrPredicate - Item to update or predicate function
   * @param {*} updatedItem - Updated item or update function
   * @param {Object} options - Additional options
   * @returns {boolean} - Whether item was updated
   */
  updateArrayItem(path, itemOrPredicate, updatedItem, options = {}) {
    try {
      const array = this._getValueByPath(this._state, path);
      
      if (!Array.isArray(array)) {
        console.error(`Path ${path} is not an array`);
        return false;
      }
      
      // Clone the array
      const newArray = [...array];
      let updated = false;
      
      // Find and update the item(s)
      if (typeof itemOrPredicate === 'function') {
        // Use predicate function to find items
        for (let i = 0; i < newArray.length; i++) {
          if (itemOrPredicate(newArray[i], i, newArray)) {
            if (typeof updatedItem === 'function') {
              newArray[i] = updatedItem(newArray[i], i, newArray);
            } else {
              newArray[i] = updatedItem;
            }
            updated = true;
            if (options.onlyFirst) break;
          }
        }
      } else {
        // Update by equality
        const stringifiedItem = JSON.stringify(itemOrPredicate);
        
        for (let i = 0; i < newArray.length; i++) {
          if (JSON.stringify(newArray[i]) === stringifiedItem) {
            if (typeof updatedItem === 'function') {
              newArray[i] = updatedItem(newArray[i], i, newArray);
            } else {
              newArray[i] = updatedItem;
            }
            updated = true;
            if (options.onlyFirst) break;
          }
        }
      }
      
      if (!updated) {
        return false;
      }
      
      // Update the state
      return this.setState(path, newArray, options);
    } catch (error) {
      console.error(`Error updating item in array at ${path}:`, error);
      return false;
    }
  },

  /**
   * Get a list of subscribers
   * @returns {Object} - Subscriber information
   */
  getSubscriberInfo() {
    try {
      return {
        globalSubscribers: this._subscribers.length,
        pathSubscribers: Object.entries(this._pathSubscribers).map(([path, subscribers]) => ({
          path,
          subscriberCount: subscribers.length
        }))
      };
    } catch (error) {
      console.error('Error getting subscriber info:', error);
      return { globalSubscribers: 0, pathSubscribers: [] };
    }
  },

  /**
   * Set or toggle debug mode
   * @param {boolean} [enable] - Whether to enable debug mode (or toggle if not provided)
   * @returns {boolean} - Current debug mode state
   */
  setDebugMode(enable) {
    try {
      if (typeof enable === 'undefined') {
        // Toggle debug mode
        this._debugMode = !this._debugMode;
      } else {
        // Set debug mode
        this._debugMode = Boolean(enable);
      }
      
      // Update app state
      this.setState('app.debugMode', this._debugMode, { addToHistory: false });
      
      // Make available globally if debug mode is enabled
      if (this._debugMode) {
        window.stateManager = this;
      } else if (window.stateManager === this) {
        delete window.stateManager;
      }
      
      console.log(`Debug mode ${this._debugMode ? 'enabled' : 'disabled'}`);
      return this._debugMode;
    } catch (error) {
      console.error('Error setting debug mode:', error);
      return this._debugMode;
    }
  },

  /**
   * Set what paths to persist in storage
   * @param {Array<string>} paths - Paths to persist
   * @returns {boolean} - Whether paths were set successfully
   */
  setPersistentPaths(paths) {
    try {
      if (!Array.isArray(paths)) {
        console.error('Persistent paths must be an array');
        return false;
      }
      
      this._persistentPaths = [...paths];
      
      // Immediately persist state with new paths
      this._persistState();
      
      console.log('Updated persistent paths:', this._persistentPaths);
      return true;
    } catch (error) {
      console.error('Error setting persistent paths:', error);
      return false;
    }
  },

  /**
   * Deep clone an object
   * @private
   * @param {*} obj - Object to clone
   * @returns {*} - Cloned object
   */
  _deepClone(obj) {
    try {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      
      // Handle Date
      if (obj instanceof Date) {
        return new Date(obj);
      }
      
      // Handle Array
      if (Array.isArray(obj)) {
        return obj.map(item => this._deepClone(item));
      }
      
      // Handle Object
      const copy = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          copy[key] = this._deepClone(obj[key]);
        }
      }
      
      return copy;
    } catch (error) {
      console.error('Error performing deep clone:', error);
      // Return a simple copy as fallback
      return Array.isArray(obj) ? [...obj] : { ...obj };
    }
  },

  /**
   * Deep merge objects
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} - Merged object
   */
  _deepMerge(target, source) {
    try {
      const output = {...target};
      
      if (typeof target === 'object' && typeof source === 'object') {
        Object.keys(source).forEach(key => {
          if (typeof source[key] === 'object' && source[key] !== null) {
            if (!(key in target)) {
              output[key] = source[key];
            } else if (typeof target[key] === 'object' && target[key] !== null) {
              output[key] = this._deepMerge(target[key], source[key]);
            } else {
              output[key] = source[key];
            }
          } else {
            output[key] = source[key];
          }
        });
      }
      
      return output;
    } catch (error) {
      console.error('Error performing deep merge:', error);
      // Return a simple merge as fallback
      return { ...target, ...source };
    }
  },

  /**
   * Export state to JSON
   * @param {boolean} includeHistory - Whether to include state history
   * @returns {string} - JSON string of state
   */
  exportState(includeHistory = false) {
    try {
      const exportData = {
        state: this._deepClone(this._state),
        exportDate: new Date().toISOString(),
        version: this._state.app.version
      };
      
      if (includeHistory) {
        exportData.history = this._deepClone(this._history);
      }
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting state:', error);
      return null;
    }
  },

  /**
   * Import state from JSON
   * @param {string} json - JSON string of state
   * @param {Object} options - Import options
   * @returns {boolean} - Whether import was successful
   */
  importState(json, options = {}) {
    try {
      const importData = JSON.parse(json);
      
      if (!importData.state || typeof importData.state !== 'object') {
        console.error('Invalid state import: missing state object');
        return false;
      }
      
      // Save previous state for history
      const previousState = this._deepClone(this._state);
      
      // Apply imported state
      if (options.merge) {
        // Merge with current state
        this._state = this._deepMerge(this._state, importData.state);
      } else {
        // Replace current state
        this._state = this._deepClone(importData.state);
      }
      
      // Update app metadata
      this._state.app.lastUpdated = new Date().toISOString();
      
      // Import history if included and requested
      if (importData.history && options.importHistory) {
        this._history = this._deepClone(importData.history);
      }
      
      // Add import as a history entry
      this._addToHistory(previousState, this._state);
      
      // Persist state
      this._persistState();
      
      // Notify subscribers
      this._notifySubscribers(previousState);
      
      console.log('State import successful');
      return true;
    } catch (error) {
      console.error('Error importing state:', error);
      return false;
    }
  },

  /**
   * Set error state
   * @param {string} section - State section to set error on
   * @param {string|Object} error - Error message or object
   * @returns {boolean} - Whether error was set
   */
  setError(section, error) {
    try {
      const errorObj = typeof error === 'string' ? { message: error } : error;
      
      // Enhance error with timestamp
      errorObj.timestamp = new Date().toISOString();
      
      // Set error at the specific section
      if (section === 'app') {
        return this.setState('app.error', errorObj);
      } else if (['fileProcessor', 'webScraper', 'playlistDownloader', 'academicSearch'].includes(section)) {
        return this.setState(`${section}.error`, errorObj);
      } else {
        console.error(`Invalid section for error: ${section}`);
        return false;
      }
    } catch (e) {
      console.error('Error setting error state:', e);
      return false;
    }
  },

  /**
   * Clear error state
   * @param {string} section - State section to clear error from
   * @returns {boolean} - Whether error was cleared
   */
  clearError(section) {
    try {
      // Clear error at the specific section
      if (section === 'app') {
        return this.setState('app.error', null);
      } else if (['fileProcessor', 'webScraper', 'playlistDownloader', 'academicSearch'].includes(section)) {
        return this.setState(`${section}.error`, null);
      } else {
        console.error(`Invalid section for error: ${section}`);
        return false;
      }
    } catch (e) {
      console.error('Error clearing error state:', e);
      return false;
    }
  }
  };

// Export both default and named exports
export default stateManager;
export const getState = stateManager.getState.bind(stateManager);
export const setState = stateManager.setState.bind(stateManager);
export const subscribe = stateManager.subscribe.bind(stateManager);
export const subscribePath = stateManager.subscribePath.bind(stateManager);
export const resetState = stateManager.resetState.bind(stateManager);
export const getHistory = stateManager.getHistory.bind(stateManager);
export const initialize = stateManager.initialize.bind(stateManager);
export const batchUpdate = stateManager.batchUpdate.bind(stateManager);
export const clearHistory = stateManager.clearHistory.bind(stateManager);
export const addArrayItem = stateManager.addArrayItem.bind(stateManager);
export const removeArrayItem = stateManager.removeArrayItem.bind(stateManager);
export const updateArrayItem = stateManager.updateArrayItem.bind(stateManager);
export const getSubscriberInfo = stateManager.getSubscriberInfo.bind(stateManager);
export const setDebugMode = stateManager.setDebugMode.bind(stateManager);
export const setPersistentPaths = stateManager.setPersistentPaths.bind(stateManager);
export const exportState = stateManager.exportState.bind(stateManager);
export const importState = stateManager.importState.bind(stateManager);
export const setError = stateManager.setError.bind(stateManager);
export const clearError = stateManager.clearError.bind(stateManager);