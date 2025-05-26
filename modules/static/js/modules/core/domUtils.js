/**
 * DOM Utilities Module - Centralized DOM manipulation functions
 * 
 * This module provides common DOM manipulation functions to avoid
 * function redeclarations across multiple modules.
 */

/**
 * Gets a DOM element by various selectors
 * @param {string|HTMLElement} selector - CSS selector, ID, or DOM element
 * @param {HTMLElement} [parent=document] - Parent element to search within
 * @returns {HTMLElement|null} The found element or null
 */
export function getElement(selector, parent = document) {
  if (!selector) {
    console.warn('No selector provided to getElement');
    return null;
  }

  // If selector is already a DOM element, return it
  if (selector instanceof HTMLElement) {
    return selector;
  }

  // Handle ID selectors with or without # prefix
  if (typeof selector === 'string') {
    const cleanSelector = selector.trim();
    
    // Handle ID format without #
    if (/^[a-zA-Z][\w-]*$/.test(cleanSelector) && !cleanSelector.includes(' ')) {
      const element = document.getElementById(cleanSelector);
      if (element) return element;
    }
    
    // Use querySelector for any other valid selector
    try {
      return parent.querySelector(cleanSelector);
    } catch (error) {
      console.error(`Invalid selector: ${cleanSelector}`, error);
      return null;
    }
  }
  
  return null;
}

/**
 * Gets multiple DOM elements by selector
 * @param {string} selector - CSS selector
 * @param {HTMLElement} [parent=document] - Parent element to search within
 * @returns {Array<HTMLElement>} Array of elements (empty if none found)
 */
export function getElements(selector, parent = document) {
  if (!selector) {
    console.warn('No selector provided to getElements');
    return [];
  }

  try {
    const elements = parent.querySelectorAll(selector);
    return Array.from(elements);
  } catch (error) {
    console.error(`Invalid selector: ${selector}`, error);
    return [];
  }
}

/**
 * Gets UI elements based on a configuration object
 * @param {Object} config - Configuration object with element selectors
 * @param {HTMLElement} [parent=document] - Parent element to search within
 * @returns {Object} Object with found UI elements
 */
export function getUIElements(config, parent = document) {
  if (!config || typeof config !== 'object') {
    console.error('Invalid UI elements configuration');
    return {};
  }

  const elements = {};
  
  for (const [key, selector] of Object.entries(config)) {
    if (Array.isArray(selector)) {
      elements[key] = getElements(selector[0], parent);
    } else {
      elements[key] = getElement(selector, parent);
    }
  }
  
  return elements;
}

/**
 * Creates a DOM element with attributes and content
 * @param {string} tag - HTML tag name
 * @param {Object} [attributes={}] - Attributes to set on the element
 * @param {string|HTMLElement|Array} [content] - Content to append to the element
 * @returns {HTMLElement} The created element
 */
export function createElement(tag, attributes = {}, content) {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attributes).forEach(([attr, value]) => {
    if (attr === 'className') {
      element.className = value;
    } else if (attr === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else {
      element.setAttribute(attr, value);
    }
  });
  
  // Add content
  if (content) {
    if (typeof content === 'string') {
      element.textContent = content;
    } else if (content instanceof HTMLElement) {
      element.appendChild(content);
    } else if (Array.isArray(content)) {
      content.forEach(item => {
        if (typeof item === 'string') {
          element.appendChild(document.createTextNode(item));
        } else if (item instanceof HTMLElement) {
          element.appendChild(item);
        }
      });
    }
  }
  
  return element;
}
/**
 * Toggle element visibility
 * @param {string|HTMLElement} selector - Element ID or element
 * @param {boolean} visible - Whether to show or hide
 */
export function toggleElementVisibility(selector, visible) {
  const element = getElement(selector);
  if (!element) return;
  
  if (visible) {
    element.classList.remove('d-none');
  } else {
    element.classList.add('d-none');
  }
}

/**
 * Add event listeners to one or more elements
 * @param {HTMLElement|Array<HTMLElement>} elements - Element(s) to add listeners to
 * @param {string|Array<string>} events - Event(s) to listen for
 * @param {Function} handler - Event handler function
 * @param {Object} [options] - AddEventListener options
 */
export function addEventListeners(elements, events, handler, options) {
  const elementArray = Array.isArray(elements) ? elements : [elements];
  const eventArray = Array.isArray(events) ? events : [events];
  
  elementArray.forEach(element => {
    if (element) {
      eventArray.forEach(event => {
        element.addEventListener(event, handler, options);
      });
    }
  });
}
// Make sure it's included in the exports
export default {
  getElement,
  getElements,
  getUIElements,
  createElement,
  addEventListeners,
  toggleElementVisibility
};