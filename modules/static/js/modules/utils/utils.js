/**
 * Utilities Module
 * 
 * General utility functions used throughout the application.
 * Provides reusable helper functions for common operations.
 * 
 * Features:
 * - String formatting and manipulation
 * - Date formatting and parsing
 * - Number formatting
 * - Clipboard operations
 * - File utilities
 * - Performance utilities (debounce, throttle)
 * - URL parameter handling
 * - Error handling utilities
 */

/**
 * Utility functions for the application
 */
const utils = {
  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Bytes to format
   * @param {number} decimals - Decimal places
   * @returns {string} - Formatted string
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },
  
  /**
   * Format seconds to a duration string
   * @param {number} seconds - Seconds to format
   * @returns {string} - Formatted duration
   */
  formatDuration(seconds) {
    if (!seconds) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    let result = '';
    
    if (hours > 0) {
      result += `${hours}h `;
    }
    
    if (minutes > 0 || hours > 0) {
      result += `${minutes}m `;
    }
    
    result += `${remainingSeconds}s`;
    
    return result;
  },
  
  /**
   * Generate a random ID
   * @param {number} length - The length of the ID
   * @returns {string} - Random ID
   */
  generateId(length = 8) {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return result;
  },
  
  /**
   * Create a delay using a Promise
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Debounce a function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait
   * @returns {Function} - Debounced function
   */
  debounce(func, wait = 300) {
    let timeout;
    
    return function(...args) {
      const context = this;
      
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  },
  
  /**
   * Throttle a function
   * @param {Function} func - Function to throttle
   * @param {number} limit - Milliseconds between function calls
   * @returns {Function} - Throttled function
   */
  throttle(func, limit = 300) {
    let lastCalled;
    let lastArgs;
    let timeout;
    
    return function(...args) {
      const context = this;
      const now = Date.now();
      
      if (!lastCalled || (now - lastCalled) >= limit) {
        // If it's been longer than the limit, call immediately
        lastCalled = now;
        return func.apply(context, args);
      }
      
      // Otherwise, schedule a call after the remaining time
      lastArgs = args;
      
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          lastCalled = Date.now();
          func.apply(context, lastArgs);
        }, limit - (now - lastCalled));
      }
    };
  },
  
  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  
  /**
   * Format a date for display
   * @param {Date|string|number} date - Date to format
   * @param {boolean} includeTime - Whether to include time
   * @returns {string} - Formatted date string
   */
  formatDate(date, includeTime = false) {
    if (!date) return 'N/A';
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      
      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };
      
      if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
      }
      
      return dateObj.toLocaleDateString(undefined, options);
    } catch (error) {
      console.error("Error formatting date:", error);
      return 'Invalid date';
    }
  },
  
  /**
   * Format a relative time (e.g., "2 hours ago")
   * @param {Date|string|number} date - Date to format
   * @returns {string} - Relative time string
   */
  formatRelativeTime(date) {
    if (!date) return 'N/A';
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      const now = new Date();
      
      const seconds = Math.floor((now - dateObj) / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (seconds < 60) {
        return 'just now';
      } else if (minutes === 1) {
        return '1 minute ago';
      } else if (minutes < 60) {
        return `${minutes} minutes ago`;
      } else if (hours === 1) {
        return '1 hour ago';
      } else if (hours < 24) {
        return `${hours} hours ago`;
      } else if (days === 1) {
        return 'yesterday';
      } else if (days < 7) {
        return `${days} days ago`;
      } else {
        return this.formatDate(dateObj);
      }
    } catch (error) {
      console.error("Error formatting relative time:", error);
      return 'Invalid date';
    }
  },
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Whether copy was successful
   */
  async copyToClipboard(text) {
    try {
      // Use the modern clipboard API if available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      
      // Fall back to older approach
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      return success;
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      return false;
    }
  },
  
  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} - Truncated text
   */
  truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    
    return text.substring(0, maxLength - 3) + '...';
  },
  
  /**
   * Get filename from path
   * @param {string} path - File path
   * @returns {string} - Filename
   */
  getFilenameFromPath(path) {
    if (!path) return '';
    
    // Split by path separators and get the last part
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || '';
  },
  
  /**
   * Format JSON for display
   * @param {Object} json - JSON object
   * @param {number} indent - Indentation level
   * @returns {string} - Formatted JSON string
   */
  formatJsonForDisplay(json, indent = 2) {
    try {
      if (typeof json === 'string') {
        // Try to parse string as JSON
        try {
          json = JSON.parse(json);
        } catch (e) {
          // If it fails, return the original string
          return json;
        }
      }
      
      return JSON.stringify(json, null, indent);
    } catch (error) {
      console.error("Error formatting JSON:", error);
      return String(json);
    }
  },
  
  /**
   * Sanitize a filename by removing invalid characters
   * @param {string} filename - Filename to sanitize
   * @returns {string} - Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename) return '';
    
    // Replace invalid characters with underscores
    return filename
      .replace(/[<>:"/\\|?*]+/g, '_') // Invalid characters in Windows
      .replace(/\s+/g, '_')          // Spaces to underscores
      .substring(0, 100);            // Limit length
  },
  
  /**
   * Parse query parameters from URL
   * @returns {Object} - Object with query params
   */
  parseQueryParams() {
    const params = {};
    const queryString = window.location.search.substring(1);
    
    if (!queryString) return params;
    
    const pairs = queryString.split('&');
    
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i].split('=');
      params[decodeURIComponent(pair[0])] = pair[1] ? decodeURIComponent(pair[1]) : '';
    }
    
    return params;
  },
  
  /**
   * Convert an object to query string
   * @param {Object} params - Parameters to convert
   * @returns {string} - Query string
   */
  toQueryString(params) {
    return Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== null)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
      .join('&');
  },
  
  /**
   * Detect file type from extension
   * @param {string} filename - Filename to check
   * @returns {string} - File type description
   */
  getFileType(filename) {
    if (!filename) return 'Unknown';
    
    const extension = filename.split('.').pop().toLowerCase();
    
    const fileTypes = {
      // Text files
      'txt': 'Text File',
      'md': 'Markdown Document',
      'csv': 'CSV Spreadsheet',
      'json': 'JSON Data',
      'xml': 'XML Document',
      'html': 'HTML Document',
      'css': 'CSS Stylesheet',
      'js': 'JavaScript File',
      'py': 'Python Script',
      'java': 'Java Source File',
      'c': 'C Source File',
      'cpp': 'C++ Source File',
      'h': 'C/C++ Header File',
      'rb': 'Ruby Script',
      'php': 'PHP Script',
      
      // Document files
      'pdf': 'PDF Document',
      'doc': 'Word Document',
      'docx': 'Word Document',
      'xls': 'Excel Spreadsheet',
      'xlsx': 'Excel Spreadsheet',
      'ppt': 'PowerPoint Presentation',
      'pptx': 'PowerPoint Presentation',
      'odt': 'OpenDocument Text',
      'ods': 'OpenDocument Spreadsheet',
      'odp': 'OpenDocument Presentation',
      
      // Image files
      'jpg': 'JPEG Image',
      'jpeg': 'JPEG Image',
      'png': 'PNG Image',
      'gif': 'GIF Image',
      'bmp': 'Bitmap Image',
      'svg': 'SVG Image',
      'webp': 'WebP Image',
      'tif': 'TIFF Image',
      'tiff': 'TIFF Image',
      
      // Audio files
      'mp3': 'MP3 Audio',
      'wav': 'WAV Audio',
      'ogg': 'OGG Audio',
      'flac': 'FLAC Audio',
      'm4a': 'M4A Audio',
      
      // Video files
      'mp4': 'MP4 Video',
      'avi': 'AVI Video',
      'mov': 'MOV Video',
      'wmv': 'Windows Media Video',
      'mkv': 'MKV Video',
      'webm': 'WebM Video',
      
      // Archive files
      'zip': 'ZIP Archive',
      'rar': 'RAR Archive',
      'tar': 'TAR Archive',
      'gz': 'GZIP Archive',
      '7z': '7-Zip Archive',
      
      // Other files
      'exe': 'Windows Executable',
      'dmg': 'macOS Disk Image',
      'iso': 'Disk Image',
      'db': 'Database File'
    };
    
    return fileTypes[extension] || 'Unknown';
  },
  
  /**
   * Check if a file type is supported by the application
   * @param {string} filename - Filename to check
   * @returns {boolean} - Whether the file is supported
   */
  isSupportedFileType(filename) {
    if (!filename) return false;
    
    const extension = filename.split('.').pop().toLowerCase();
    
    // List of supported extensions
    const supportedExtensions = [
      // Text files
      'txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'c', 'cpp', 'h',
      
      // Document files
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt',
      
      // Image files
      'jpg', 'jpeg', 'png', 'gif'
    ];
    
    return supportedExtensions.includes(extension);
  },
  
  /**
   * Get a readable file size
   * @param {File|Object} file - File object or {size: number}
   * @returns {string} - Readable file size
   */
  getReadableFileSize(file) {
    if (!file || (typeof file.size !== 'number')) return 'Unknown size';
    
    return this.formatBytes(file.size);
  },
  
  /**
   * Try to execute a function safely with error handling
   * @param {Function} fn - Function to execute
   * @param {*} fallbackValue - Value to return if execution fails
   * @param {Array} args - Arguments to pass to the function
   * @returns {*} - Function result or fallback value
   */
  trySafe(fn, fallbackValue, ...args) {
    try {
      return fn(...args);
    } catch (error) {
      console.error("Error in trySafe execution:", error);
      return fallbackValue;
    }
  },
  
  /**
   * Check if a value is empty (null, undefined, empty string, empty array, empty object)
   * @param {*} value - Value to check
   * @returns {boolean} - Whether the value is empty
   */
  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },
  
  /**
   * Get a value from a nested object safely
   * @param {Object} obj - Object to get value from
   * @param {string} path - Path to the value (e.g., "user.profile.name")
   * @param {*} defaultValue - Default value if path doesn't exist
   * @returns {*} - Value at path or default value
   */
  getNestedValue(obj, path, defaultValue = undefined) {
    if (!obj || !path) return defaultValue;
    
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === null || result === undefined || typeof result !== 'object') {
        return defaultValue;
      }
      
      result = result[key];
    }
    
    return result === undefined ? defaultValue : result;
  },
  
  /**
   * Validate an email address
   * @param {string} email - Email address to validate
   * @returns {boolean} - Whether the email is valid
   */
  isValidEmail(email) {
    if (!email) return false;
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  /**
   * Check if the current environment is development
   * @returns {boolean} - Whether the current environment is development
   */
  isDevelopment() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' || 
           window.location.hostname.includes('dev.') ||
           window.location.hostname.includes('.local');
  }
};

// Export the module
export default utils;

// Also export named functions for direct imports
export const {
  formatBytes,
  formatDuration,
  generateId,
  delay,
  debounce,
  throttle,
  escapeHtml,
  formatDate,
  formatRelativeTime,
  copyToClipboard,
  truncateText,
  getFilenameFromPath,
  formatJsonForDisplay,
  sanitizeFilename,
  parseQueryParams,
  toQueryString,
  getFileType,
  isSupportedFileType,
  getReadableFileSize,
  trySafe,
  isEmpty,
  getNestedValue,
  isValidEmail,
  isDevelopment
} = utils;