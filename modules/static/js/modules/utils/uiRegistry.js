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

import errorHandler from './errorHandler.js';

// Map of all registered UI elements
const elements = new Map();

// Default categories for organization
const categories = {
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
};

// Configuration
const config = {
  debug: false,
  warnOnMissing: true,
  autoRegisterIds: true,
  validateOnStartup: true
};

/**
 * Initialize the UI Registry
 * @param {Object} options - Configuration options
 * @returns {boolean} - Success state
 */
function initialize(options = {}) {
  console.log('Initializing UI Registry...');
  
  // Apply configuration options
  Object.assign(config, options);
  
  try {
    // Validate categories
    Object.keys(categories).forEach(category => {
      if (typeof categories[category] !== 'object') {
        categories[category] = {};
      }
    });
    
    // Auto-register elements with IDs if configured
    if (config.autoRegisterIds) {
      autoRegisterElementsWithIds();
    }
    
    // Register common UI elements
    registerCommonElements();
    
    console.log('UI Registry initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing UI Registry:', error);
    errorHandler.handleError(error, 'UI_REGISTRY_INITIALIZATION', false);
    return false;
  }
}

/**
 * Auto-register all elements with IDs
 */
function autoRegisterElementsWithIds() {
  try {
    const elementsWithIds = document.querySelectorAll('[id]');
    
    if (config.debug) {
      console.log(`Auto-registering ${elementsWithIds.length} elements with IDs`);
    }
    
    elementsWithIds.forEach(element => {
      const id = element.id;
      
      if (id) {
        // Register as global elements for backward compatibility
        elements.set(id, element);
        
        if (config.debug) {
          console.log(`Auto-registered element with ID: ${id}`);
        }
      }
    });
  } catch (error) {
    console.error('Error auto-registering elements with IDs:', error);
  }
}

/**
 * Register common UI elements
 */
function registerCommonElements() {
  console.log('Registering common UI elements...');
  
  try {
    // Register global elements
    registerElements('global', {
      appContainer: '#app-container',
      contentArea: '#content-area',
      sidebar: '#sidebar',
      navTabs: '.nav-tabs',
      tabContents: '.tab-content',
      darkModeToggle: '#darkModeToggle',
      loadingSpinner: '#loading-spinner',
      appAlert: '#app-alert',
      errorContainer: '#app-error-container'
    });
    
    // Register file tab elements
    registerElements('fileTab', {
      container: '#file-tab',
      form: '#process-form',
      formContainer: '#file-form-container',
      progressContainer: '#file-progress-container',
      resultContainer: '#file-result-container',
      errorContainer: '#file-error-container',
      inputDir: '#input-dir',
      outputFile: '#output-file',
      submitBtn: '#start-processing-btn',
      cancelBtn: '#cancel-processing-btn',
      browseBtn: '#browse-directory-btn',
      progressBar: '#file-progress-bar',
      progressStatus: '#progress-status',
      progressStats: '#progress-stats',
      resultStats: '#result-stats',
      openBtn: '#open-output-btn',
      errorMessage: '#error-message'
    });
    
    // Register scraper tab elements
    registerElements('scraper', {
      container: '#scraper-tab',
      form: '#scraper-form',
      formContainer: '#scraper-form-container',
      progressContainer: '#scraper-progress-container',
      resultContainer: '#scraper-result-container',
      errorContainer: '#scraper-error-container',
      urlInput: '#scraper-url',
      typeSelect: '#scraper-type',
      keywordInput: '#scraper-keyword',
      outputFolder: '#scraper-output-folder',
      submitBtn: '#start-scraping-btn',
      cancelBtn: '#cancel-scraping-btn',
      progressBar: '#scraper-progress-bar',
      progressStatus: '#scraper-progress-status',
      progressStats: '#scraper-progress-stats',
      resultMessage: '#scraper-result-message',
      resultStats: '#scraper-result-stats',
      errorMessage: '#scraper-error-message'
    });
    
    // Register playlist tab elements
    registerElements('playlist', {
      container: '#playlist-tab',
      form: '#playlist-form',
      formContainer: '#playlist-form-container',
      progressContainer: '#playlist-progress-container',
      resultContainer: '#playlist-result-container',
      errorContainer: '#playlist-error-container',
      apiKeyInput: '#playlist-api-key',
      playlistUrlInput: '#playlist-url',
      outputFolderInput: '#playlist-output-folder',
      submitBtn: '#start-playlist-btn',
      cancelBtn: '#cancel-playlist-btn',
      progressBar: '#playlist-progress-bar',
      progressStatus: '#playlist-progress-status',
      progressStats: '#playlist-progress-stats',
      resultMessage: '#playlist-result-message',
      resultStats: '#playlist-result-stats',
      errorMessage: '#playlist-error-message'
    });
    
    // Register history elements
    registerElements('history', {
      container: '#history-container',
      taskList: '#task-history-list',
      downloadList: '#download-history-list',
      searchList: '#search-history-list',
      recentFiles: '#recent-files-list',
      clearBtn: '#clear-history-btn'
    });
    
    console.log('UI elements registered successfully');
  } catch (error) {
    console.error('Error registering common UI elements:', error);
    errorHandler.handleError(error, 'UI_REGISTRY_COMMON_ELEMENTS', false);
  }
}

/**
 * Register multiple UI elements for a category
 * @param {string} category - The category name
 * @param {Object} elementsObj - Object mapping element IDs to selectors
 * @returns {boolean} - Success state
 */
function registerElements(category, elementsObj) {
  if (!category || typeof elementsObj !== 'object') {
    console.error(`Invalid parameters for registering elements: ${category}`);
    return false;
  }
  
  try {
    // Create category if it doesn't exist
    if (!categories[category]) {
      categories[category] = {};
    }
    
    // Register each element
    Object.entries(elementsObj).forEach(([id, selector]) => {
      registerElement(category, id, selector);
    });
    
    return true;
  } catch (error) {
    console.error(`Error registering elements for category ${category}:`, error);
    return false;
  }
}

/**
 * Register a single UI element
 * @param {string} category - The category name
 * @param {string} id - The element ID within the category
 * @param {string|HTMLElement} selector - CSS selector or element
 * @returns {boolean} - Success state
 */
function registerElement(category, id, selector) {
  if (!category || !id) {
    console.error('Invalid parameters for registering element');
    return false;
  }
  
  try {
    // Create category if it doesn't exist
    if (!categories[category]) {
      categories[category] = {};
    }
    
    // Allow direct element references
    if (selector instanceof HTMLElement) {
      categories[category][id] = selector;
      elements.set(`${category}.${id}`, selector);
      return true;
    }
    
    // Handle string selectors
    if (typeof selector === 'string') {
      // Store the selector for lazy loading
      categories[category][id] = selector;
      
      // Add to the flat map for quick lookup
      elements.set(`${category}.${id}`, selector);
      
      if (config.debug) {
        console.log(`Registered element ${category}.${id} with selector "${selector}"`);
      }
      
      return true;
    }
    
    console.warn(`Invalid selector for ${category}.${id}:`, selector);
    return false;
  } catch (error) {
    console.error(`Error registering element ${category}.${id}:`, error);
    return false;
  }
}

/**
 * Get a UI element by category and ID
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @returns {HTMLElement|null} - The requested element or null if not found
 */
function getElement(path) {
  if (!path) {
    if (config.warnOnMissing) {
      console.warn('Missing element path in getElement()');
    }
    return null;
  }
  
  try {
    // Check if path includes category
    if (path.includes('.')) {
      const [category, id] = path.split('.');
      
      // Validate path format
      if (!category || !id) {
        console.warn(`[UIRegistry] Invalid element path: ${path}. Expected format: 'category.elementId'`);
        return null;
      }
      
      // Check if category exists
      if (!categories[category]) {
        if (config.warnOnMissing) {
          console.warn(`Category not found: ${category}`);
        }
        return null;
      }
      
      // Get the element or its selector
      const elementOrSelector = categories[category][id];
      
      if (!elementOrSelector) {
        if (config.warnOnMissing) {
          console.warn(`Element not found: ${category}.${id}`);
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
        categories[category][id] = element;
        elements.set(`${category}.${id}`, element);
        return element;
      } else {
        if (config.warnOnMissing) {
          console.warn(`Element not found with selector "${elementOrSelector}" for ${category}.${id}`);
        }
        return null;
      }
    } else {
      // No category - check if it's registered by simple ID
      const element = elements.get(path) || document.getElementById(path);
      
      if (!element && config.warnOnMissing) {
        console.warn(`Element not found with ID: ${path}`);
      }
      
      return element;
    }
  } catch (error) {
    console.error(`Error getting element ${path}:`, error);
    return null;
  }
}

/**
 * Get all elements for a category
 * @param {string} category - The category name
 * @returns {Object} - Object with all elements in the category
 */
function getCategoryElements(category) {
  if (!category || !categories[category]) {
    return {};
  }
  
  try {
    const result = {};
    
    // Iterate through all IDs in the category
    Object.keys(categories[category]).forEach(id => {
      // Try to get the actual element
      result[id] = getElement(`${category}.${id}`);
    });
    
    return result;
  } catch (error) {
    console.error(`Error getting elements for category ${category}:`, error);
    return {};
  }
}

/**
 * Check if an element exists
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @returns {boolean} - Whether the element exists
 */
function elementExists(path) {
  return getElement(path) !== null;
}

/**
 * Update multiple elements with values
 * @param {Object} updates - Map of element paths to values
 * @returns {number} - Number of successful updates
 */
function updateElements(updates) {
  if (!updates || typeof updates !== 'object') {
    return 0;
  }
  
  let successCount = 0;
  
  try {
    Object.entries(updates).forEach(([path, value]) => {
      if (updateElement(path, value)) {
        successCount++;
      }
    });
    
    return successCount;
  } catch (error) {
    console.error('Error updating elements:', error);
    return successCount;
  }
}

/**
 * Update a single element with a value
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {string|number|boolean} value - Value to set
 * @returns {boolean} - Success state
 */
function updateElement(path, value) {
  const element = getElement(path);
  
  if (!element) {
    return false;
  }
  
  try {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox') {
        element.checked = Boolean(value);
      } else {
        element.value = value;
      }
      return true;
    } else if (element instanceof HTMLSelectElement) {
      element.value = value;
      return true;
    } else if (element instanceof HTMLTextAreaElement) {
      element.value = value;
      return true;
    } else {
      // For other elements, update text content
      element.textContent = value;
      return true;
    }
  } catch (error) {
    console.error(`Error updating element ${path}:`, error);
    return false;
  }
}

/**
 * Show or hide multiple elements
 * @param {Object} visibilityMap - Map of element paths to visibility states
 * @returns {number} - Number of successful updates
 */
function updateVisibility(visibilityMap) {
  if (!visibilityMap || typeof visibilityMap !== 'object') {
    return 0;
  }
  
  let successCount = 0;
  
  try {
    Object.entries(visibilityMap).forEach(([path, isVisible]) => {
      if (setElementVisibility(path, isVisible)) {
        successCount++;
      }
    });
    
    return successCount;
  } catch (error) {
    console.error('Error updating element visibility:', error);
    return successCount;
  }
}

/**
 * Set the visibility of a single element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {boolean} isVisible - Whether the element should be visible
 * @returns {boolean} - Success state
 */
function setElementVisibility(path, isVisible) {
  const element = getElement(path);
  
  if (!element) {
    return false;
  }
  
  try {
    if (isVisible) {
      element.classList.remove('d-none');
    } else {
      element.classList.add('d-none');
    }
    
    return true;
  } catch (error) {
    console.error(`Error setting visibility for element ${path}:`, error);
    return false;
  }
}

/**
 * Enable or disable multiple elements
 * @param {Object} enableMap - Map of element paths to enabled states
 * @returns {number} - Number of successful updates
 */
function updateEnabled(enableMap) {
  if (!enableMap || typeof enableMap !== 'object') {
    return 0;
  }
  
  let successCount = 0;
  
  try {
    Object.entries(enableMap).forEach(([path, isEnabled]) => {
      if (setElementEnabled(path, isEnabled)) {
        successCount++;
      }
    });
    
    return successCount;
  } catch (error) {
    console.error('Error updating element enabled state:', error);
    return successCount;
  }
}

/**
 * Set the enabled state of a single element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {boolean} isEnabled - Whether the element should be enabled
 * @returns {boolean} - Success state
 */
function setElementEnabled(path, isEnabled) {
  const element = getElement(path);
  
  if (!element) {
    return false;
  }
  
  try {
    if (element instanceof HTMLButtonElement || 
        element instanceof HTMLInputElement || 
        element instanceof HTMLSelectElement || 
        element instanceof HTMLTextAreaElement) {
      element.disabled = !isEnabled;
      
      // Also update appearance
      if (isEnabled) {
        element.classList.remove('disabled');
      } else {
        element.classList.add('disabled');
      }
      
      return true;
    } else {
      // For other elements, add/remove disabled class
      if (isEnabled) {
        element.classList.remove('disabled');
      } else {
        element.classList.add('disabled');
      }
      
      // Add/remove aria attributes
      element.setAttribute('aria-disabled', !isEnabled);
      
      return true;
    }
  } catch (error) {
    console.error(`Error setting enabled state for element ${path}:`, error);
    return false;
  }
}

/**
 * Get all UI elements registered in the registry
 * @returns {Object} - Map of all registered elements by category
 */
function getAllElements() {
  const allElements = {};
  
  try {
    // Copy the categories structure
    Object.keys(categories).forEach(category => {
      allElements[category] = {...categories[category]};
    });
    
    return allElements;
  } catch (error) {
    console.error('Error getting all elements:', error);
    return {};
  }
}

/**
 * Get all registered element paths
 * @returns {Array<string>} - List of all registered element paths
 */
function getAllElementPaths() {
  return Array.from(elements.keys());
}

/**
 * Get the value of an element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @returns {string|boolean|null} - The element value or null if not found
 */
function getElementValue(path) {
  const element = getElement(path);
  
  if (!element) {
    return null;
  }
  
  try {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox') {
        return element.checked;
      } else if (element.type === 'radio') {
        return element.checked ? element.value : null;
      } else {
        return element.value;
      }
    } else if (element instanceof HTMLSelectElement) {
      return element.value;
    } else if (element instanceof HTMLTextAreaElement) {
      return element.value;
    } else {
      // For other elements, return text content
      return element.textContent;
    }
  } catch (error) {
    console.error(`Error getting value for element ${path}:`, error);
    return null;
  }
}

/**
 * Add a class to an element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {string} className - Class to add
 * @returns {boolean} - Success state
 */
function addClass(path, className) {
  const element = getElement(path);
  
  if (!element || !className) {
    return false;
  }
  
  try {
    element.classList.add(className);
    return true;
  } catch (error) {
    console.error(`Error adding class to element ${path}:`, error);
    return false;
  }
}

/**
 * Remove a class from an element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {string} className - Class to remove
 * @returns {boolean} - Success state
 */
function removeClass(path, className) {
  const element = getElement(path);
  
  if (!element || !className) {
    return false;
  }
  
  try {
    element.classList.remove(className);
    return true;
  } catch (error) {
    console.error(`Error removing class from element ${path}:`, error);
    return false;
  }
}

/**
 * Toggle a class on an element
 * @param {string} path - Element path in format "category.id" or just "id" for global elements
 * @param {string} className - Class to toggle
 * @returns {boolean} - Success state
 */
function toggleClass(path, className) {
  const element = getElement(path);
  
  if (!element || !className) {
    return false;
  }
  
  try {
    element.classList.toggle(className);
    return true;
  } catch (error) {
    console.error(`Error toggling class on element ${path}:`, error);
    return false;
  }
}

/**
 * Get all form values from a form element
 * @param {string} formPath - Form element path
 * @returns {Object|null} - Form values or null if form not found
 */
function getFormValues(formPath) {
  const form = getElement(formPath);
  
  if (!form || !(form instanceof HTMLFormElement)) {
    return null;
  }
  
  try {
    const formData = new FormData(form);
    const values = {};
    
    for (const [key, value] of formData.entries()) {
      values[key] = value;
    }
    
    return values;
  } catch (error) {
    console.error(`Error getting form values for ${formPath}:`, error);
    return null;
  }
}

/**
 * Set form values on a form element
 * @param {string} formPath - Form element path
 * @param {Object} values - Values to set
 * @returns {boolean} - Success state
 */
function setFormValues(formPath, values) {
  const form = getElement(formPath);
  
  if (!form || !(form instanceof HTMLFormElement) || !values) {
    return false;
  }
  
  try {
    Object.entries(values).forEach(([name, value]) => {
      const elements = form.elements[name];
      
      if (elements) {
        if (elements instanceof RadioNodeList) {
          // Handle radio buttons
          Array.from(elements).forEach(el => {
            if (el instanceof HTMLInputElement && el.value === value) {
              el.checked = true;
            }
          });
        } else if (elements instanceof HTMLSelectElement || 
                  elements instanceof HTMLTextAreaElement ||
                  elements instanceof HTMLInputElement) {
          // Handle other form elements
          if (elements instanceof HTMLInputElement && elements.type === 'checkbox') {
            elements.checked = Boolean(value);
          } else {
            elements.value = value;
          }
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error(`Error setting form values for ${formPath}:`, error);
    return false;
  }
}

/**
 * Reset a form to its initial values
 * @param {string} formPath - Form element path
 * @returns {boolean} - Success state
 */
function resetForm(formPath) {
  const form = getElement(formPath);
  
  if (!form || !(form instanceof HTMLFormElement)) {
    return false;
  }
  
  try {
    form.reset();
    return true;
  } catch (error) {
    console.error(`Error resetting form ${formPath}:`, error);
    return false;
  }
}

/**
 * Get UI element registry info
 * @returns {Object} - Info about the registry
 */
function getRegistryInfo() {
  const totalElements = elements.size;
  const categoryCounts = {};
  
  Object.keys(categories).forEach(category => {
    categoryCounts[category] = Object.keys(categories[category]).length;
  });
  
  return {
    totalElements,
    categories: categoryCounts,
    config
  };
}

// Export the UI Registry module
const uiRegistry = {
  // Initialization
  initialize,
  registerCommonElements,
  
  // Element registration
  registerElement,
  registerElements,
  
  // Element access
  getElement,
  getCategoryElements,
  elementExists,
  
  // Element manipulation
  updateElement,
  updateElements,
  setElementVisibility,
  updateVisibility,
  setElementEnabled,
  updateEnabled,
  
  // Element values
  getElementValue,
  getFormValues,
  setFormValues,
  resetForm,
  
  // Class manipulation
  addClass,
  removeClass,
  toggleClass,
  
  // Utility and info
  getRegistryInfo,
  getAllElements,
  getAllElementPaths,
  
  // Direct access to categories for debugging
  getCategories: () => ({...categories})
};

export default uiRegistry;
export const getElement = uiRegistry.getElement.bind(uiRegistry);
export const registerElement = uiRegistry.registerElement.bind(uiRegistry);
export const registerElements = uiRegistry.registerElements.bind(uiRegistry);
export const setElementVisibility = uiRegistry.setElementVisibility.bind(uiRegistry);
export const updateElement = uiRegistry.updateElement.bind(uiRegistry);
export const updateElements = uiRegistry.updateElements.bind(uiRegistry);
export const updateVisibility = uiRegistry.updateVisibility.bind(uiRegistry);
export const setElementEnabled = uiRegistry.setElementEnabled.bind(uiRegistry);
export const updateEnabled = uiRegistry.updateEnabled.bind(uiRegistry);
export const getElementValue = uiRegistry.getElementValue.bind(uiRegistry);
export const getFormValues = uiRegistry.getFormValues.bind(uiRegistry);
export const setFormValues = uiRegistry.setFormValues.bind(uiRegistry);
export const resetForm = uiRegistry.resetForm.bind(uiRegistry);
