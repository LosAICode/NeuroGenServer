/**
 * UI Registry Module
 * 
 * Provides a centralized registry for UI elements with enhanced error handling.
 * Efficiently manages DOM elements, provides safe access, and validates against
 * common errors like null references.
 * 
 * Features:
 * - Categorized element registration
 * - Default values for missing elements
 * - Error boundary for DOM operations
 * - Lazy loading of UI elements
 * - Common element registration shortcuts
 */

// Import handleError safely - avoid syntax errors with dynamic imports
let handleErrorFunc = console.error;
try {
  // Static import would be preferable, but we'll use this approach to avoid import errors
  console.log("Setting up error handler for uiRegistry");
} catch (e) {
  console.warn('Could not import errorHandler, using fallback', e);
}

/**
 * UI Registry for managing DOM elements
 */
const uiRegistry = {
  // Map of all registered UI elements
  elements: new Map(),

  // Default categories for organization
  categories: {
    // Document-wide elements
    global: {},
    
    // Tab-specific elements
    fileTab: {},
    scraper: {},
    playlist: {},
    academic: {},
    
    // Feature-specific elements
    history: {},
    settings: {},
    
    // Component-specific elements
    modal: {},
    sidebar: {}
  },

  // Configuration
  config: {
    debug: false,
    warnOnMissing: false, // Set to false to reduce console noise during initialization
    autoRegisterIds: true,
    validateOnStartup: true,
    lazyInitialization: true // Added to help with elements not yet in DOM
  },

  /**
   * Initialize the UI Registry
   * @param {Object} options - Configuration options
   * @returns {boolean} - Success state
   */
  initialize(options = {}) {
    console.log('Initializing UI Registry...');
    
    // Apply configuration options
    Object.assign(this.config, options);
    
    try {
      // Validate categories
      Object.keys(this.categories).forEach(category => {
        if (typeof this.categories[category] !== 'object') {
          this.categories[category] = {};
        }
      });
      
      // Auto-register elements with IDs if configured
      if (this.config.autoRegisterIds) {
        this.autoRegisterElementsWithIds();
      }
      
      // Only register common elements if not using lazy initialization
      if (!this.config.lazyInitialization) {
        this.registerCommonElements();
      } else {
        // Schedule registration for when DOM is likely to be ready
        setTimeout(() => {
          this.registerCommonElements();
        }, 100);
      }
      
      console.log('UI Registry initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing UI Registry:', error);
      if (typeof handleErrorFunc === 'function') {
        handleErrorFunc(error, 'UI_REGISTRY_INITIALIZATION', false);
      }
      return false;
    }
  },

  /**
   * Auto-register all elements with IDs
   */
  autoRegisterElementsWithIds() {
    try {
      const elementsWithIds = document.querySelectorAll('[id]');
      
      if (this.config.debug) {
        console.log(`Auto-registering ${elementsWithIds.length} elements with IDs`);
      }
      
      elementsWithIds.forEach(element => {
        const id = element.id;
        
        if (id) {
          // Register as global elements for backward compatibility
          this.elements.set(id, element);
          
          if (this.config.debug) {
            console.log(`Auto-registered element with ID: ${id}`);
          }
        }
      });
    } catch (error) {
      console.error('Error auto-registering elements with IDs:', error);
    }
  },

  /**
   * Register common UI elements
   */
  registerCommonElements() {
    console.log('Registering common UI elements...');
    
    try {
      // Register global elements - with less noisy warnings
      const origWarnSetting = this.config.warnOnMissing;
      this.config.warnOnMissing = false;
      
      // Register global elements
      this.registerElements('global', {
        mainContainer: '#main-container',
        navTabs: '.nav-tabs',
        tabContents: '.tab-content',
        darkModeToggle: '#darkModeToggle'
      });
      
      // Register file tab elements - only attempt if the container exists
      if (document.querySelector('#file-tab')) {
        this.registerElements('fileTab', {
          container: '#file-tab',
          form: '#process-form',
          inputDir: '#input-dir',
          outputFile: '#output-file'
        });
      }
      
      // Register scraper tab elements - only attempt if the container exists
      if (document.querySelector('#scraper-tab')) {
        this.registerElements('scraper', {
          container: '#scraper-tab',
          form: '#scraper-form'
        });
      }
      
      // Only try to register history elements if the container exists
      if (document.querySelector('#history-container')) {
        this.registerElements('history', {
          container: '#history-container'
        });
      }
      
      // Reset warning setting
      this.config.warnOnMissing = origWarnSetting;
      
      console.log('UI elements registered successfully');
    } catch (error) {
      console.error('Error registering common UI elements:', error);
      if (typeof handleErrorFunc === 'function') {
        handleErrorFunc(error, 'UI_REGISTRY_COMMON_ELEMENTS', false);
      }
    }
  },

  /**
   * Register multiple UI elements for a category
   * @param {string} category - The category name
   * @param {Object} elementsObj - Object mapping element IDs to selectors
   * @returns {boolean} - Success state
   */
  registerElements(category, elementsObj) {
    if (!category || typeof elementsObj !== 'object') {
      console.error(`Invalid parameters for registering elements: ${category}`);
      return false;
    }
    
    try {
      // Create category if it doesn't exist
      if (!this.categories[category]) {
        this.categories[category] = {};
      }
      
      // Register each element
      Object.entries(elementsObj).forEach(([id, selector]) => {
        this.registerElement(id, selector, category);
      });
      
      return true;
    } catch (error) {
      console.error(`Error registering elements for category ${category}:`, error);
      return false;
    }
  },

  /**
   * Register a single UI element
   * @param {string} id - The element ID 
   * @param {string|HTMLElement} selector - CSS selector or element
   * @param {string} [category='global'] - Optional category
   * @returns {HTMLElement|null} - The registered element or null if not found
   */
  registerElement(id, selector, category = 'global') {
    if (!id) {
      console.error('Invalid ID for registering element');
      return null;
    }
    
    try {
      // Create category if it doesn't exist
      if (!this.categories[category]) {
        this.categories[category] = {};
      }
      
      // Allow direct element references
      if (selector instanceof HTMLElement) {
        this.categories[category][id] = selector;
        this.elements.set(`${category}.${id}`, selector);
        // Also register by simple ID for backward compatibility
        this.elements.set(id, selector);
        return selector;
      }
      
      // Handle string selectors
      if (typeof selector === 'string') {
        const element = document.querySelector(selector);
        
        if (!element) {
          if (this.config.warnOnMissing) {
            console.warn(`Element not found for selector: ${selector} (${category}.${id})`);
          }
          // Store the selector for lazy loading
          this.categories[category][id] = selector;
          this.elements.set(`${category}.${id}`, selector);
          
          // Also store by simple ID for backward compatibility
          this.elements.set(id, selector);
          return null;
        }
        
        // Store the actual element
        this.categories[category][id] = element;
        this.elements.set(`${category}.${id}`, element);
        
        // Also store by simple ID for backward compatibility
        this.elements.set(id, element);
        
        if (this.config.debug) {
          console.log(`Registered element ${category}.${id} with selector "${selector}"`);
        }
        
        return element;
      }
      
      console.warn(`Invalid selector for ${category}.${id}:`, selector);
      return null;
    } catch (error) {
      console.error(`Error registering element ${id}:`, error);
      return null;
    }
  },

  /**
   * Get a UI element by ID and optionally category
   * @param {string} id - Element ID or path in format "category.id"
   * @returns {HTMLElement|null} - The requested element or null if not found
   */
  getElement(id) {
    if (!id) {
      if (this.config.warnOnMissing) {
        console.warn('Missing element ID in getElement()');
      }
      return null;
    }
    
    try {
      // Check if id includes category (contains a dot)
      if (id.includes('.')) {
        const [category, elementId] = id.split('.');
        
        // Validate format
        if (!category || !elementId) {
          if (this.config.warnOnMissing) {
            console.warn(`Invalid element path: ${id}. Expected format: 'category.elementId'`);
          }
          return null;
        }
        
        // Check if category exists
        if (!this.categories[category]) {
          if (this.config.warnOnMissing) {
            console.warn(`Category not found: ${category}`);
          }
          return null;
        }
        
        // Get the element or its selector
        const elementOrSelector = this.categories[category][elementId];
        
        if (!elementOrSelector) {
          if (this.config.warnOnMissing) {
            console.warn(`Element not found: ${category}.${elementId}`);
          }
          return null;
        }
        
        // If it's already an element, return it
        if (elementOrSelector instanceof HTMLElement) {
          return elementOrSelector;
        }
        
        // Otherwise, it's a selector - find the element
        const element = document.querySelector(elementOrSelector);
        
        if (element) {
          // Cache the element for future use
          this.categories[category][elementId] = element;
          this.elements.set(`${category}.${elementId}`, element);
          return element;
        } else {
          if (this.config.warnOnMissing) {
            console.warn(`Element not found with selector "${elementOrSelector}" for ${category}.${elementId}`);
          }
          return null;
        }
      } else {
        // No category - check if it's registered by simple ID
        const elementOrSelector = this.elements.get(id);
        
        if (!elementOrSelector) {
          // Try direct DOM lookup
          const element = document.getElementById(id);
          if (element) {
            // Cache for future use
            this.elements.set(id, element);
            return element;
          }
          
          if (this.config.warnOnMissing) {
            console.warn(`Element not found with ID: ${id}`);
          }
          return null;
        }
        
        // If it's already an element, return it
        if (elementOrSelector instanceof HTMLElement) {
          return elementOrSelector;
        }
        
        // Otherwise, it's a selector - find the element
        const element = document.querySelector(elementOrSelector);
        
        if (element) {
          // Cache the element for future use
          this.elements.set(id, element);
          return element;
        } else {
          if (this.config.warnOnMissing) {
            console.warn(`Element not found with selector "${elementOrSelector}" for ID ${id}`);
          }
          return null;
        }
      }
    } catch (error) {
      console.error(`Error getting element ${id}:`, error);
      return null;
    }
  },

  /**
   * Set visibility of an element
   * @param {string} id - Element identifier
   * @param {boolean} visible - Whether the element should be visible
   * @returns {boolean} - Success status
   */
  setElementVisibility(id, visible) {
    const element = this.getElement(id);
    if (!element) {
      return false;
    }
    
    try {
      element.style.display = visible ? '' : 'none';
      return true;
    } catch (error) {
      console.error(`Error setting visibility for element ${id}:`, error);
      return false;
    }
  },

  /**
   * Update a registered element with a new reference
   * @param {string} id - Element identifier
   * @param {HTMLElement} element - New element reference
   * @returns {boolean} - Success status
   */
  updateElement(id, element) {
    if (!id || !element) {
      return false;
    }
    
    try {
      // Check if the ID contains a category
      if (id.includes('.')) {
        const [category, elementId] = id.split('.');
        
        if (!this.categories[category]) {
          this.categories[category] = {};
        }
        
        this.categories[category][elementId] = element;
        this.elements.set(id, element);
      } else {
        // Simple ID
        this.elements.set(id, element);
        
        // Also try to update in categories if it exists
        for (const category in this.categories) {
          if (id in this.categories[category]) {
            this.categories[category][id] = element;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error updating element ${id}:`, error);
      return false;
    }
  },

  /**
   * Reset the registry and clear all elements
   * @returns {boolean} - Success status
   */
  reset() {
    try {
      this.elements.clear();
      // Reset all categories
      Object.keys(this.categories).forEach(category => {
        this.categories[category] = {};
      });
      return true;
    } catch (error) {
      console.error('Error resetting UI registry:', error);
      return false;
    }
  },

  /**
   * Get UI element registry info
   * @returns {Object} - Info about the registry
   */
  getRegistryInfo() {
    const totalElements = this.elements.size;
    const categoryCounts = {};
    
    Object.keys(this.categories).forEach(category => {
      categoryCounts[category] = Object.keys(this.categories[category]).length;
    });
    
    return {
      totalElements,
      categories: categoryCounts,
      config: this.config
    };
  },

  /**
   * Get the UI elements to initialize the registry
   * @deprecated Use registerCommonElements() instead
   */
  getUIElements() {
    console.warn('getUIElements() is deprecated, use registerCommonElements() instead');
    this.registerCommonElements();
    return this.elements;
  },
  
  /**
   * Get the categories for debugging
   * @returns {Object} Copy of the categories
   */
  getCategories() {
    return {...this.categories};
  }
};

// Export both default and named exports for compatibility
export default uiRegistry;
export const getElement = uiRegistry.getElement.bind(uiRegistry);
export const registerElement = uiRegistry.registerElement.bind(uiRegistry);
export const registerElements = uiRegistry.registerElements.bind(uiRegistry);
export const setElementVisibility = uiRegistry.setElementVisibility.bind(uiRegistry);
export const updateElement = uiRegistry.updateElement.bind(uiRegistry);
export const reset = uiRegistry.reset.bind(uiRegistry);

// Additional exports to fix the "missing named exports" error in the logs
export const initialize = uiRegistry.initialize.bind(uiRegistry);
export const autoRegisterElementsWithIds = uiRegistry.autoRegisterElementsWithIds.bind(uiRegistry);
export const registerCommonElements = uiRegistry.registerCommonElements.bind(uiRegistry);
export const getRegistryInfo = uiRegistry.getRegistryInfo.bind(uiRegistry);
export const getUIElements = uiRegistry.getUIElements.bind(uiRegistry);
export const getCategories = uiRegistry.getCategories.bind(uiRegistry);