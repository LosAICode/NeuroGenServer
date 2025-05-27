/**
 * Drag and Drop Handler Module
 * 
 * Handles drag and drop file operations
 * Extracted from index.html to prevent conflicts with the modular system
 */

import { formatBytes } from '../utils/utils.js';
import { showToast } from '../utils/ui.js';
import { getElement } from '../utils/domUtils.js';

class DragDropHandler {
  constructor() {
    this.dropZones = new Map();
    this.initialized = false;
    this.activeDropZone = null;
  }

  /**
   * Initialize drag and drop handlers
   */
  initialize() {
    if (this.initialized) {
      console.warn('Drag and drop handler already initialized');
      return;
    }

    this.setupDefaultDropZones();
    this.initialized = true;
    console.log('Drag and drop handler initialized');
  }

  /**
   * Setup default drop zones
   */
  setupDefaultDropZones() {
    // Main file drop zone
    const mainDropZone = getElement('drop-zone');
    if (mainDropZone) {
      this.registerDropZone('main', mainDropZone, {
        accept: '*/*',
        multiple: true,
        onDrop: (files) => this.handleMainDropZone(files)
      });
    }

    // Register other drop zones as needed
    this.findAndRegisterDropZones();
  }

  /**
   * Find and register all elements with drop-zone class
   */
  findAndRegisterDropZones() {
    const dropZones = document.querySelectorAll('.drop-zone[data-drop-target]');
    dropZones.forEach(zone => {
      const target = zone.getAttribute('data-drop-target');
      if (target && !this.dropZones.has(target)) {
        this.registerDropZone(target, zone);
      }
    });
  }

  /**
   * Register a drop zone
   * @param {string} id - Unique identifier for the drop zone
   * @param {HTMLElement} element - The drop zone element
   * @param {Object} options - Configuration options
   */
  registerDropZone(id, element, options = {}) {
    if (!element) return;

    const config = {
      accept: options.accept || '*/*',
      multiple: options.multiple !== false,
      maxSize: options.maxSize || 100 * 1024 * 1024, // 100MB default
      onDrop: options.onDrop || null,
      onError: options.onError || null,
      validateFile: options.validateFile || null
    };

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      element.addEventListener(eventName, this.preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      element.addEventListener(eventName, (e) => this.handleDragEnter(e, id), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      element.addEventListener(eventName, (e) => this.handleDragLeave(e, id), false);
    });

    // Handle dropped files
    element.addEventListener('drop', (e) => this.handleDrop(e, id), false);

    // Store configuration
    this.dropZones.set(id, {
      element,
      config,
      isActive: false
    });

    console.log(`Drop zone registered: ${id}`);
  }

  /**
   * Prevent default drag and drop behavior
   * @param {Event} e - The event
   */
  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Handle drag enter
   * @param {DragEvent} e - The drag event
   * @param {string} zoneId - The drop zone ID
   */
  handleDragEnter(e, zoneId) {
    const zone = this.dropZones.get(zoneId);
    if (!zone) return;

    zone.isActive = true;
    zone.element.classList.add('drag-highlight', 'drag-over');
    this.activeDropZone = zoneId;

    // Add visual feedback
    const icon = zone.element.querySelector('.drop-zone-icon');
    if (icon) {
      icon.classList.add('pulse');
    }
  }

  /**
   * Handle drag leave
   * @param {DragEvent} e - The drag event
   * @param {string} zoneId - The drop zone ID
   */
  handleDragLeave(e, zoneId) {
    const zone = this.dropZones.get(zoneId);
    if (!zone) return;

    // Check if we're still within the drop zone
    if (e.target === zone.element || zone.element.contains(e.target)) {
      const rect = zone.element.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return; // Still within bounds
      }
    }

    zone.isActive = false;
    zone.element.classList.remove('drag-highlight', 'drag-over');
    
    const icon = zone.element.querySelector('.drop-zone-icon');
    if (icon) {
      icon.classList.remove('pulse');
    }

    if (this.activeDropZone === zoneId) {
      this.activeDropZone = null;
    }
  }

  /**
   * Handle file drop
   * @param {DragEvent} e - The drag event
   * @param {string} zoneId - The drop zone ID
   */
  async handleDrop(e, zoneId) {
    const zone = this.dropZones.get(zoneId);
    if (!zone) return;

    // Clean up visual state
    zone.isActive = false;
    zone.element.classList.remove('drag-highlight', 'drag-over');
    
    const icon = zone.element.querySelector('.drop-zone-icon');
    if (icon) {
      icon.classList.remove('pulse');
    }

    // Get dropped files
    const dt = e.dataTransfer;
    const files = Array.from(dt.files);

    if (files.length === 0) {
      showToast('No Files', 'No files were dropped', 'warning');
      return;
    }

    // Validate files
    const validFiles = [];
    const errors = [];

    for (const file of files) {
      const validation = this.validateFile(file, zone.config);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    // Show errors if any
    if (errors.length > 0) {
      showToast('File Validation Errors', errors.join('<br>'), 'error', 5000);
    }

    // Process valid files
    if (validFiles.length > 0) {
      if (zone.config.onDrop) {
        try {
          await zone.config.onDrop(validFiles, e);
        } catch (error) {
          console.error('Error in drop handler:', error);
          if (zone.config.onError) {
            zone.config.onError(error);
          } else {
            showToast('Error', 'Failed to process dropped files', 'error');
          }
        }
      }
    }
  }

  /**
   * Validate a file
   * @param {File} file - The file to validate
   * @param {Object} config - The drop zone configuration
   * @returns {Object} - Validation result
   */
  validateFile(file, config) {
    // Check file size
    if (config.maxSize && file.size > config.maxSize) {
      return {
        valid: false,
        error: `File too large (max ${formatBytes(config.maxSize)})`
      };
    }

    // Check file type
    if (config.accept && config.accept !== '*/*') {
      const acceptedTypes = config.accept.split(',').map(t => t.trim());
      const fileType = file.type || '';
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      
      const isAccepted = acceptedTypes.some(accepted => {
        if (accepted.endsWith('/*')) {
          // Check MIME type category (e.g., image/*)
          const category = accepted.split('/')[0];
          return fileType.startsWith(category + '/');
        } else if (accepted.startsWith('.')) {
          // Check file extension
          return accepted === fileExt;
        } else {
          // Check exact MIME type
          return accepted === fileType;
        }
      });

      if (!isAccepted) {
        return {
          valid: false,
          error: `File type not accepted (accepted: ${config.accept})`
        };
      }
    }

    // Custom validation
    if (config.validateFile) {
      const customResult = config.validateFile(file);
      if (customResult !== true) {
        return {
          valid: false,
          error: customResult || 'File validation failed'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Handle main drop zone files
   * @param {File[]} files - The dropped files
   */
  handleMainDropZone(files) {
    const fileInput = getElement('folder-input');
    const inputDirField = getElement('input-dir');
    const selectedFilesInfo = getElement('selected-files-info');

    if (!fileInput) {
      console.error('File input not found');
      return;
    }

    // Try to find a common directory path
    if (inputDirField && files.length > 0) {
      const paths = files.map(file => file.name);
      const folderName = this.findCommonDirectory(paths) || 'Selected Files';
      inputDirField.value = folderName;
    }

    // Show selected files info
    if (selectedFilesInfo) {
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const filesByType = this.groupFilesByType(files);
      
      let infoHtml = `
        <div class="alert alert-info mt-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong>${files.length} file${files.length > 1 ? 's' : ''} selected</strong>
            <span class="badge bg-primary">${formatBytes(totalSize)}</span>
          </div>
      `;

      if (Object.keys(filesByType).length > 1) {
        infoHtml += '<div class="small mt-2">File types: ';
        Object.entries(filesByType).forEach(([type, count]) => {
          infoHtml += `<span class="badge bg-secondary me-1">${type} (${count})</span>`;
        });
        infoHtml += '</div>';
      }

      infoHtml += '</div>';
      selectedFilesInfo.innerHTML = infoHtml;
    }

    // Trigger file input change event
    if (fileInput.files !== files) {
      // Create a new FileList-like object
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file));
      fileInput.files = dt.files;
      
      // Trigger change event
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    showToast('Files Dropped', `${files.length} file${files.length > 1 ? 's' : ''} ready to process`, 'success');
  }

  /**
   * Find common directory from file paths
   * @param {string[]} paths - Array of file paths
   * @returns {string} - Common directory or null
   */
  findCommonDirectory(paths) {
    if (paths.length === 0) return null;
    if (paths.length === 1) {
      const parts = paths[0].split('/');
      return parts.length > 1 ? parts[0] : null;
    }

    // Find common prefix
    const splitPaths = paths.map(p => p.split('/'));
    const minLength = Math.min(...splitPaths.map(p => p.length));
    
    let commonParts = [];
    for (let i = 0; i < minLength; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every(p => p[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }

    return commonParts.length > 0 ? commonParts.join('/') : null;
  }

  /**
   * Group files by type
   * @param {File[]} files - Array of files
   * @returns {Object} - Files grouped by type
   */
  groupFilesByType(files) {
    const groups = {};
    
    files.forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      groups[ext] = (groups[ext] || 0) + 1;
    });

    return groups;
  }

  /**
   * Get drop zone by ID
   * @param {string} id - Drop zone ID
   * @returns {Object} - Drop zone configuration
   */
  getDropZone(id) {
    return this.dropZones.get(id);
  }

  /**
   * Remove drop zone
   * @param {string} id - Drop zone ID
   */
  removeDropZone(id) {
    const zone = this.dropZones.get(id);
    if (zone) {
      // Remove event listeners
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.element.removeEventListener(eventName, this.preventDefaults);
      });
      
      this.dropZones.delete(id);
      console.log(`Drop zone removed: ${id}`);
    }
  }
}

// Create and export singleton instance
const dragDropHandler = new DragDropHandler();
export default dragDropHandler;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => dragDropHandler.initialize());
} else {
  dragDropHandler.initialize();
}