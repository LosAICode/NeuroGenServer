/**
 * Keyboard Shortcuts Module
 * 
 * Handles keyboard shortcuts for the application
 * Extracted from index.html to prevent conflicts with the modular system
 */

import { showModal } from '../utils/ui.js';

class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
    this.initialized = false;
  }

  /**
   * Initialize keyboard shortcuts
   */
  initialize() {
    if (this.initialized) {
      console.warn('Keyboard shortcuts already initialized');
      return;
    }

    this.setupDefaultShortcuts();
    this.attachEventListeners();
    this.initialized = true;
    console.log('Keyboard shortcuts initialized');
  }

  /**
   * Setup default keyboard shortcuts
   */
  setupDefaultShortcuts() {
    // Tab navigation shortcuts (Ctrl + 1-4)
    for (let i = 1; i <= 4; i++) {
      this.register(`ctrl+${i}`, () => this.switchTab(i), `Switch to tab ${i}`);
    }

    // Ctrl + O to open JSON
    this.register('ctrl+o', () => this.openJson(), 'Open JSON file');

    // Ctrl + N for new task
    this.register('ctrl+n', () => this.newTask(), 'Start new task');

    // Ctrl + H for help
    this.register('ctrl+h', () => this.showHelp(), 'Show keyboard shortcuts');

    // Ctrl + D for dark mode toggle
    this.register('ctrl+d', () => this.toggleDarkMode(), 'Toggle dark mode');

    // Escape to close modals
    this.register('escape', () => this.closeActiveModal(), 'Close active modal');
  }

  /**
   * Register a keyboard shortcut
   * @param {string} shortcut - Shortcut string (e.g., 'ctrl+s', 'alt+shift+n')
   * @param {Function} handler - Function to execute
   * @param {string} description - Description of the shortcut
   */
  register(shortcut, handler, description = '') {
    const normalized = this.normalizeShortcut(shortcut);
    this.shortcuts.set(normalized, { handler, description, shortcut });
  }

  /**
   * Normalize shortcut string
   * @param {string} shortcut - Shortcut string
   * @returns {string} - Normalized shortcut
   */
  normalizeShortcut(shortcut) {
    return shortcut
      .toLowerCase()
      .split('+')
      .sort()
      .join('+');
  }

  /**
   * Parse keyboard event to shortcut string
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {string} - Shortcut string
   */
  parseEvent(event) {
    const parts = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    // Get the key
    let key = event.key.toLowerCase();
    
    // Map special keys
    const keyMap = {
      ' ': 'space',
      'arrowup': 'up',
      'arrowdown': 'down',
      'arrowleft': 'left',
      'arrowright': 'right'
    };
    
    key = keyMap[key] || key;
    
    // Handle digit keys
    if (event.code && event.code.startsWith('Digit')) {
      key = event.code.replace('Digit', '');
    }
    
    parts.push(key);
    
    return parts.sort().join('+');
  }

  /**
   * Attach keyboard event listeners
   */
  attachEventListeners() {
    document.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      
      // Don't handle shortcuts when typing in inputs
      const activeElement = document.activeElement;
      const isInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      );
      
      if (isInput && event.key !== 'Escape') return;
      
      const shortcut = this.parseEvent(event);
      const handler = this.shortcuts.get(shortcut);
      
      if (handler) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          handler.handler();
        } catch (error) {
          console.error('Error executing shortcut:', shortcut, error);
        }
      }
    });
  }

  /**
   * Switch to a specific tab
   * @param {number} tabIndex - Tab index (1-based)
   */
  switchTab(tabIndex) {
    const tabButtons = document.querySelectorAll('#processorTabs .nav-link');
    if (tabButtons.length >= tabIndex) {
      tabButtons[tabIndex - 1].click();
    }
  }

  /**
   * Open JSON file
   */
  openJson() {
    const openButton = document.querySelector('.open-json-btn:not(.d-none)');
    if (openButton) {
      openButton.click();
    }
  }

  /**
   * Start new task
   */
  newTask() {
    const newTaskBtn = document.querySelector(
      '#new-task-btn:not(.d-none), ' +
      '#playlist-new-task-btn:not(.d-none), ' +
      '#scraper-new-task-btn:not(.d-none), ' +
      '#cancelled-new-task-btn:not(.d-none)'
    );
    
    if (newTaskBtn) {
      newTaskBtn.click();
    }
  }

  /**
   * Show help modal
   */
  showHelp() {
    const modal = document.getElementById('keyboard-shortcuts-modal');
    if (modal) {
      if (window.bootstrap) {
        const bsModal = window.bootstrap.Modal.getInstance(modal) || new window.bootstrap.Modal(modal);
        bsModal.show();
      } else if (showModal) {
        showModal('keyboard-shortcuts-modal');
      }
    }
  }

  /**
   * Toggle dark mode
   */
  toggleDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.click();
    }
  }

  /**
   * Close active modal
   */
  closeActiveModal() {
    const activeModal = document.querySelector('.modal.show');
    if (activeModal && window.bootstrap) {
      const bsModal = window.bootstrap.Modal.getInstance(activeModal);
      if (bsModal) {
        bsModal.hide();
      }
    }
  }

  /**
   * Enable/disable shortcuts
   * @param {boolean} enabled - Whether to enable shortcuts
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get all registered shortcuts
   * @returns {Array} - Array of shortcut objects
   */
  getShortcuts() {
    const shortcuts = [];
    this.shortcuts.forEach((value, key) => {
      shortcuts.push({
        keys: value.shortcut,
        description: value.description
      });
    });
    return shortcuts;
  }
}

// Create and export singleton instance
const keyboardShortcuts = new KeyboardShortcuts();
export default keyboardShortcuts;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => keyboardShortcuts.initialize());
} else {
  keyboardShortcuts.initialize();
}