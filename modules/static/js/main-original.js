"use strict";
// =============================================================================
// SECTION 1: GLOBAL VARIABLES AND INITIALIZATION
// =============================================================================

// Core variables
let currentTaskId = null;
let socket = null;
let statusCheckInterval = null;
let helpMode = false;

// UI Elements for File Processing
let inputDirField, outputFileField, submitBtn, browseBtn, cancelBtn, openBtn, newTaskBtn, retryBtn;
let formContainer, progressContainer, resultContainer, errorContainer;
let progressBar, progressStatus, progressStats, resultStats, errorMessage, errorDetails, processForm;
let pathInfo, pathInfoText;

// UI Elements for Playlist Processing
let playlistForm, playlistFormContainer, playlistUrlsContainer, playlistRootField, playlistOutputField, playlistSubmitBtn;
let playlistProgressContainer, playlistProgressBar, playlistProgressStatus, playlistProgressStats, playlistCancelBtn;
let playlistResultsContainer, playlistStats, playlistNewTaskBtn, openPlaylistJsonBtn, addPlaylistBtn;

// UI Elements for Web Scraper
let scraperForm, scraperFormContainer, scraperUrlsContainer, scraperOutputField, downloadDirectoryField, downloadDirBrowseBtn;
let scraperProgressContainer, scraperProgressBar, scraperProgressStatus, scraperProgressStats, scraperCancelBtn;
let scraperResultsContainer, scraperResults, scraperStats, openScraperJsonBtn, scraperNewTaskBtn, openOutputFolderBtn;
let addScraperUrlBtn, pdfInfoSection, pdfDownloadProgress, pdfDownloadsList, processPdfSwitch;

// History tab UI elements
let historyTableBody, historySearch, historyFilter, historySort;
let historyRefreshBtn, historyClearBtn, taskDetailsModal;
let pdfSummariesContainer;

window.completionTriggered = false;
window.taskCompleted = false;
window.resultsDisplayed = false;
window.latestTaskData = null;

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
  console.log("Initializing NeuroGen Processor application...");
  
  try {
    // Add a delay to ensure DOM is fully loaded
    setTimeout(function() {
      // Check for critical UI elements
      if (!checkCriticalElements()) {
        console.error("Critical UI elements missing, entering recovery mode");
        // Try to get UI elements and set up listeners anyway
        getUIElements();
        setupEventListeners();
        return;
      }
      
      // Get references to UI elements
      getUIElements();
      
      // Ensure critical elements exist
      ensureCriticalElements();
      
      // Set up event listeners - this is critical for functionality
      const listenersSetup = setupEventListeners();
      
      // If listeners failed to set up, retry once
      if (!listenersSetup) {
        console.warn("Event listeners failed to set up, retrying...");
        setTimeout(setupEventListeners, 500);
      }
      
      // Optimize UI for better performance
      optimizeUI();
      
      // Initialize theme using the theme manager
      initializeThemes();
      applyTheme(localStorage.getItem('theme') || 'light');
      
      // Initialize Socket.IO connection with robust connection handling
      setupRobustSocketConnection();
      initializeSocket();
      
      // Setup keyboard shortcuts for better UX
      setupKeyboardShortcuts();
      
      // Make modal dialogs draggable
      const modals = document.querySelectorAll('.modal-content');
      modals.forEach(modal => makeDraggable(modal));
      
      // Initialize PDF processing capabilities
      initializePdfProcessing();
      
      // Initialize academic search functionality
      initializeAcademicSearch();
      
      // Check for ongoing tasks
      checkOngoingTask();
      
      // Initialize history tab
      initializeHistoryTab();
      
      // Initialize input/output relationship
      initializeInputOutputRelationship();
      
      // Get default output folder for convenience
      getDefaultOutputFolder().then(folder => {
        const outputFolderElements = document.querySelectorAll('.default-output-folder');
        outputFolderElements.forEach(el => {
          el.textContent = folder;
        });
      });
      
      // Initialize the debug panel if URL has debug parameter
      if (window.location.search.includes('debug=true') || localStorage.getItem('debugMode') === 'true') {
        initializeDebugMode();
        
        // Update debug panel sections
        updateActionsSection();
        updateTaskInfoSection();
        updateSocketStatusSection();
        updateUIElementsSection();
      }
      
      // Configure progress emission with rate limiting
      emitProgressWithRateLimiting({
        enabled: true,
        minInterval: 500,
        maxUpdatesPerMinute: 60
      });
      
      console.log("Application initialization complete");
      window.appInitialized = true;
      showToast('NeuroGen', 'Application initialized successfully', 'success');
    }, 100); // Short delay to ensure DOM is ready
  } catch (error) {
    console.error("Error initializing application:", error);
    
    // Show enhanced error message with stack trace in debug mode
    displayEnhancedErrorMessage('Initialization Error', error);
    
    // Fallback to simple error toast if enhanced error failed
    showToast('Initialization Error', 'Error: ' + error.message, 'error');
    
    // Reset any loading states that might be active
    resetLoadingState();
    
    // Show debug panel in case of error
    initializeDebugMode();
  }
}
// Start initialization when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM is already ready, initialize immediately
  initializeApp();
}

// Backup initialization for edge cases where DOMContentLoaded might not fire
window.addEventListener('load', function() {
  // Check if we need to initialize
  if (!window.appInitialized) {
    console.warn("Application not initialized by DOMContentLoaded, initializing on load");
    initializeApp();
  }
});

// Set a fallback timeout to ensure initialization
setTimeout(function() {
  if (!window.appInitialized) {
    console.warn("Application not initialized after timeout, forcing initialization");
    initializeApp();
  }
}, 2000);

// Mark that app has been initialized to prevent multiple initializations
window.appInitialized = true;

// Export key functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatBytes,
    formatDuration,
    escapeHtml,
    showToast,
    getScraperConfigs,
    addTaskToHistory
  };
}

function verifyEventListeners() {
  console.log("Verifying event listeners...");
  
  // Check if critical event listeners are attached
  const listenerStatus = {
    "File form submit": processForm && (processForm.onsubmit || hasEventListener(processForm, 'submit')),
    "Browse button click": browseBtn && (browseBtn.onclick || hasEventListener(browseBtn, 'click')),
    "Playlist form submit": playlistForm && (playlistForm.onsubmit || hasEventListener(playlistForm, 'submit')),
    "Scraper form submit": scraperForm && (scraperForm.onsubmit || hasEventListener(scraperForm, 'submit')),
    "Socket.IO connection": socket && socket.connected
  };
  
  // Log the current status
  console.log("Event listener status:", listenerStatus);
  
  // If any critical listeners are missing, set them up again
  if (!listenerStatus["File form submit"] || 
      !listenerStatus["Browse button click"] || 
      !listenerStatus["Playlist form submit"] || 
      !listenerStatus["Scraper form submit"]) {
    
    console.warn("Critical event listeners missing, re-setting up event listeners");
    setupEventListeners();
    
    // Update the debug panel
    updateEventListenersStatus();
    
    return false;
  }
  
  return true;
}

// Helper function to check if an element has an event listener
function hasEventListener(element, eventType) {
  if (!element) return false;
  
  // For browser compatibility, we'll try different methods
  
  // Method 1: Check if the element has the _events property (added by some frameworks)
  if (element._events && element._events[eventType]) {
    return true;
  }
  
  // Method 2: Check if getEventListeners is available (Chrome DevTools)
  if (window.getEventListeners && window.getEventListeners(element)[eventType]) {
    return true;
  }
  
  // Method 3: Attach a temporary detector
  let hasListener = false;
  const originalAddEventListener = element.addEventListener;
  
  element.addEventListener = function(type, listener, options) {
    if (type === eventType) {
      hasListener = true;
    }
    originalAddEventListener.call(this, type, listener, options);
  };
  
  // Restore original method
  setTimeout(() => {
    element.addEventListener = originalAddEventListener;
  }, 0);
  
  return hasListener;
}


// =============================================================================
// SECTION 2: UTILITY FUNCTIONS
// =============================================================================

/**
 * HTML Escape Function
 * Used to prevent XSS when displaying JSON
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = JSON.stringify(text);
  }
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
* Theme Management Functions
*/
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Update the button icon
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.innerHTML = theme === 'dark' ? 
      '<i class="fas fa-sun fa-lg"></i>' : 
      '<i class="fas fa-moon fa-lg"></i>';
    
    // Also update the title attribute for accessibility
    darkModeToggle.setAttribute('title', theme === 'dark' ? 
      'Switch to Light Mode' : 'Switch to Dark Mode');
  }
  
  // Update JSON view backgrounds to match theme
  const jsonHeaders = document.querySelectorAll('.card-header');
  const jsonBodies = document.querySelectorAll('.card-body');
  
  const bgClass = theme === 'dark' ? 'bg-dark text-light' : 'bg-light';
  
  jsonHeaders.forEach(header => {
    header.className = header.className.replace(/bg-\w+/g, '').trim() + ' ' + bgClass;
  });
  
  jsonBodies.forEach(body => {
    body.className = body.className.replace(/bg-\w+/g, '').trim() + ' ' + bgClass;
  });
  
  // Update header background color
  const headerContainer = document.querySelector('.header-container');
  if (headerContainer) {
    headerContainer.style.backgroundColor = theme === 'dark' ? '#1c3156' : '#0d6efd';
  }
}

function toggleDarkMode() {
  // Get current theme or default to light
  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  // Toggle to the opposite theme
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // Apply the new theme
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // Update the button icon
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.innerHTML = newTheme === 'dark' ? 
      '<i class="fas fa-sun fa-lg"></i>' : 
      '<i class="fas fa-moon fa-lg"></i>';
    
    // Also update the title attribute for accessibility
    darkModeToggle.setAttribute('title', newTheme === 'dark' ? 
      'Switch to Light Mode' : 'Switch to Dark Mode');
  }
  
  // Update header background color
  const headerContainer = document.querySelector('.header-container');
  if (headerContainer) {
    headerContainer.style.backgroundColor = newTheme === 'dark' ? '#1c3156' : '#0d6efd';
  }
  
  // Show confirmation toast
  showToast('Theme Updated', `Switched to ${newTheme} mode`, 'info');
}

/**
* Format and display JSON with syntax highlighting
*/
function formatJsonForDisplay(json) {
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch (e) {
      // If it's not valid JSON, just return it escaped
      return escapeHtml(json);
    }
  }
  
  const formattedJson = JSON.stringify(json, null, 2);
  return escapeHtml(formattedJson);
}

/**
* Converts bytes to a human-readable string.
*/
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'N/A';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
* Formats seconds into a human-readable duration string.
*/
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return 'N/A';
  
  if (seconds < 60) {
    return `${seconds.toFixed(2)} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds.toFixed(0)} second${remainingSeconds !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}

/**
* Convert a snake_case string into a Title Case string.
*/
function formatKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
* Check if File System Access API is available
*/
function isFileSystemAccessAPIAvailable() {
  return 'showDirectoryPicker' in window;
}

// =============================================================================
// SECTION 3: UI FEEDBACK & NOTIFICATIONS
// =============================================================================

/**
 * Enhanced toast notification system with auto-dismiss and stacking
 */
function showToast(title, message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // Generate a unique ID for this toast
  const toastId = 'toast-' + Date.now();
  
  // Set icon based on type
  let icon;
  let bgClass;
  switch (type) {
    case 'success':
      icon = 'fa-check-circle';
      bgClass = 'bg-success';
      break;
    case 'error':
      icon = 'fa-exclamation-circle';
      bgClass = 'bg-danger';
      break;
    case 'warning':
      icon = 'fa-exclamation-triangle';
      bgClass = 'bg-warning';
      break;
    default:
      icon = 'fa-info-circle';
      bgClass = 'bg-info';
  }
  
  // Create toast HTML
  const toastHtml = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header ${bgClass} text-white">
        <i class="fas ${icon} me-2"></i>
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;
  
  // Add toast to container
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  // Initialize and show the toast
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    animation: true,
    autohide: true,
    delay: 5000
  });
  toast.show();
  
  // Remove toast from DOM after it's hidden
  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
  
  // Return toast instance to allow programmatic dismissal if needed
  return toast;
}

/**
* Centralized error handling
*/
function handleError(error, context = 'general') {
  console.error(`Error in ${context}:`, error);
  
  // Don't show duplicate error messages
  const errorKey = `${context}:${error.message}`;
  if (window.errorCache && window.errorCache.has(errorKey)) {
    return;
  }
  
  // Create error cache if it doesn't exist
  if (!window.errorCache) {
    window.errorCache = new Map();
  }
  
  // Store error to prevent duplicates for 5 seconds
  window.errorCache.set(errorKey, true);
  setTimeout(() => {
    window.errorCache.delete(errorKey);
  }, 5000);
  
  // Show appropriate error message based on context
  switch (context) {
    case 'file-processing':
      showToast('Processing Error', error.message || 'An error occurred during file processing', 'error');
      break;
    case 'pdf-download':
      showToast('PDF Download Error', error.message || 'Failed to download PDF', 'error');
      break;
    case 'scraper':
      showToast('Scraper Error', error.message || 'An error occurred during web scraping', 'error');
      break;
    case 'playlist':
      showToast('Playlist Error', error.message || 'An error occurred during playlist processing', 'error');
      break;
    case 'socket':
      showToast('Connection Error', error.message || 'Connection to server lost', 'warning');
      // Start polling as fallback
      startStatusPolling();
      break;
    default:
      showToast('Error', error.message || 'An unexpected error occurred', 'error');
  }
}

// =============================================================================
// SECTION 4: FILE & PATH HANDLING
// =============================================================================

/**
 * Standardize a file path across operating systems
 * @param {string} path - The path to standardize
 * @returns {string} Standardized path
 */
function standardizePath(path) {
  if (!path) return '';
  
  // Replace backslashes with forward slashes for consistency
  path = path.replace(/\\/g, '/');
  
  // Remove trailing slashes
  path = path.replace(/\/+$/, '');
  
  return path;
}

/**
 * Verify if a path exists on the server with better error handling
 * @param {string} userPath - The path to verify
 * @param {HTMLInputElement} inputField - The input field to update
 * @param {Function} onSuccess - Optional callback for success case
 */
function verifyPath(userPath, inputField, onSuccess) {
  if (!userPath.trim()) return;
  
  // Store original value for error recovery
  const originalValue = inputField.value;
  
  // Provide immediate feedback
  inputField.disabled = true;
  inputField.classList.remove('is-invalid');
  inputField.value = "Verifying path...";
  
  // Add visual indicator
  inputField.classList.add('bg-light');
  
  // Use the enhanced API endpoint
  fetch('/api/verify-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          path: standardizePath(userPath),
          create_if_missing: false // Don't auto-create
      })
  })
      .then(response => {
          if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          // If path exists and is a directory
          if (data.exists && data.isDirectory) {
              inputField.value = data.fullPath;
              inputField.classList.add('is-valid');
              setTimeout(() => inputField.classList.remove('is-valid'), 2000);
              
              // Update path info if available
              if (pathInfo && pathInfoText) {
                  updatePathInfo('success', `Directory exists and is writable: ${data.fullPath}`);
              }
              
              console.log('Verified path:', data.fullPath);
              showToast('Success', 'Directory verified successfully', 'success');
              
              // Call success callback if provided
              if (typeof onSuccess === 'function') {
                  onSuccess(data.fullPath);
              }
          }
          // If path doesn't exist but can be created
          else if (!data.exists && data.parentExists && data.canCreate) {
              inputField.value = userPath;
              
              // Show confirmation dialog with option to create directory
              if (confirm(
              `Directory "${userPath}" does not exist.\n\n` +
              `Would you like to create it?`
              )) {
                  // User confirmed, create the directory
                  createDirectory(userPath, inputField, onSuccess);
              } else {
                  // User declined, keep path but mark as warning
                  if (pathInfo && pathInfoText) {
                      updatePathInfo('warning', `Directory does not exist: ${userPath}`);
                  }
                  
                  // Call success callback with warning flag if provided
                  if (typeof onSuccess === 'function') {
                      onSuccess(userPath, true);
                  }
              }
          }
          // Path exists but is not writable
          else if (data.exists && !data.canWrite) {
              inputField.value = data.fullPath;
              inputField.classList.add('is-invalid');
              
              if (pathInfo && pathInfoText) {
                  updatePathInfo('error', `Directory exists but is not writable: ${data.fullPath}`);
              }
              showToast('Error', 'Directory is not writable', 'error');
          }
          // Parent directory doesn't exist
          else if (!data.exists && !data.parentExists) {
              inputField.value = userPath;
              inputField.classList.add('is-invalid');
              
              if (pathInfo && pathInfoText) {
                  updatePathInfo('error', `Parent directory not found: ${data.parentPath || 'unknown'}`);
              }
              showToast('Error', 'Parent directory not found', 'error');
          }
          // Other error cases
          else {
              inputField.value = userPath;
              inputField.classList.add('is-invalid');
              
              if (pathInfo && pathInfoText) {
                  updatePathInfo('error', `Invalid directory path: ${userPath}`);
              }
              showToast('Error', 'Invalid directory path', 'error');
          }
      })
      .catch(error => {
          console.error('Failed to verify path:', error);
          inputField.value = originalValue;
          inputField.classList.add('is-invalid');
          
          if (pathInfo && pathInfoText) {
              updatePathInfo('error', `Server error: ${error.message}`);
          }
          showToast('Error', `Failed to verify path: ${error.message}`, 'error');
      })
      .finally(() => {
          inputField.disabled = false;
          inputField.classList.remove('bg-light');
      });
}

/**
 * Create a directory at the specified path
 * @param {string} path - The directory path to create
 * @param {HTMLInputElement} inputField - The input field to update
 * @param {Function} onSuccess - Optional callback for success case
 */
function createDirectory(path, inputField, onSuccess) {
  if (!path) return;
  
  // Show loading state
  inputField.disabled = true;
  inputField.value = "Creating directory...";
  inputField.classList.add('bg-light');
  
  fetch('/api/create-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
  })
      .then(response => {
          if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          if (data.success) {
              inputField.value = data.path;
              inputField.classList.add('is-valid');
              setTimeout(() => inputField.classList.remove('is-valid'), 2000);
              
              if (pathInfo && pathInfoText) {
                  updatePathInfo('success', `Directory created: ${data.path}`);
              }
              showToast('Success', 'Directory created successfully', 'success');
              
              // Call success callback if provided
              if (typeof onSuccess === 'function') {
                  onSuccess(data.path);
              }
          } else {
              throw new Error(data.message);
          }
      })
      .catch(error => {
          console.error('Failed to create directory:', error);
          inputField.value = path;
          inputField.classList.add('is-invalid');
          
          if (pathInfo && pathInfoText) {
              updatePathInfo('error', `Failed to create directory: ${error.message}`);
          }
          showToast('Error', `Failed to create directory: ${error.message}`, 'error');
      })
      .finally(() => {
          inputField.disabled = false;
          inputField.classList.remove('bg-light');
      });
}

/**
 * Update the path info display with status and message
 * @param {string} status - 'success', 'warning', or 'error'
 * @param {string} message - The message to display
 */
function updatePathInfo(status, message) {
  if (!pathInfo || !pathInfoText) return;
  
  // Set the status class
  pathInfo.className = 'mt-2';
  pathInfo.classList.add(status);
  
  // Update the message
  pathInfoText.textContent = message;
  
  // Show the info
  pathInfo.classList.remove('d-none');
}

/**
 * Handle the browse button for directory selection
 * - Uses File System Access API when available
 * - Falls back to manual entry on unsupported browsers
 * @param {HTMLInputElement} inputField - The input field to update
 */
function handleBrowseClick(inputField) {
  if (isFileSystemAccessAPIAvailable()) {
      // Modern browsers with directory picker support
      pickFolder(inputField);
  } else {
      // Fallback for browsers without directory picker
      promptForManualPath(inputField);
  }
}

/**
 * Pick a folder using the File System Access API
 * @param {HTMLInputElement} inputField - The input field to update
 */
async function pickFolder(inputField) {
  try {
      inputField.value = "Selecting folder...";
      inputField.disabled = true;
      
      const directoryHandle = await window.showDirectoryPicker();
      const folderName = directoryHandle.name;
      
      // Get the full path on the server
      detectPathFromName(folderName, inputField);
  } catch (error) {
      console.error('Error using File System Access API:', error);
      
      // Only show error for non-abort actions
      if (error.name !== 'AbortError') {
          inputField.value = "";
          promptForManualPath(inputField);
      } else {
          // Restore previous value if user aborted
          if (inputField.value === "Selecting folder...") {
              inputField.value = "";
          }
      }
      
      inputField.disabled = false;
  }
}

/**
 * Prompt for manual path entry
 * @param {HTMLInputElement} inputField - The input field to update
 * @param {string} folderName - Optional suggested folder name
 */
function promptForManualPath(inputField, folderName = '') {
  const currentPath = inputField.value || '';
  const fieldLabel = inputField.closest('.mb-4').querySelector('.form-label').textContent;
  
  const message = folderName
      ? `Could not detect the full path for folder "${folderName}".`
      : `Please enter the complete path for ${fieldLabel}:`;
      
  // Get appropriate examples for the user's OS
  const isWindows = navigator.platform.toLowerCase().includes('win');
  const example = isWindows 
      ? `Example: C:\\Users\\YourUsername\\Documents\\${folderName || "MyFolder"}`
      : `Example: /home/username/Documents/${folderName || "myfolder"}`;
  
  const userPath = prompt(message + "\n\n" + example, currentPath);
  if (!userPath) return;
  
  // Verify the path exists
  verifyPath(userPath, inputField);
}

/**
 * Detect the full path from a folder name
 * @param {string} folderName - The folder name to detect
 * @param {HTMLInputElement} inputField - The input field to update
 */
function detectPathFromName(folderName, inputField) {
  fetch('/api/detect-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          folderName,
          fullPath: folderName
      })
  })
  .then(res => {
      if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
      }
      return res.json();
  })
  .then(data => {
      if (data.error) {
          console.error('Error detecting path:', data.error);
          inputField.value = folderName;
          setTimeout(() => promptForManualPath(inputField, folderName), 100);
      } else {
          inputField.value = data.fullPath;
          
          // Verify the detected path
          verifyPath(data.fullPath, inputField);
          
          console.log('Detected path:', data.fullPath);
          showToast('Folder Selected', `Selected folder: ${data.fullPath}`, 'success');
      }
  })
  .catch(err => {
      console.error('Failed to detect path:', err);
      inputField.value = folderName;
      setTimeout(() => promptForManualPath(inputField, folderName), 100);
  })
  .finally(() => {
      inputField.disabled = false;
  });
}

/**
 * Handle folder selection through the input[type=file] method
 * @param {Event} event - The change event
 */
function handleFolderSelection(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  // Get the target input field
  const targetInputId = event.target.dataset.targetInput;
  const targetInput = document.getElementById(targetInputId);
  if (!targetInput) return;
  
  showSelectedFiles(files);
  
  const firstFile = files[0];
  const relativePath = firstFile.webkitRelativePath;
  const folderName = relativePath.split('/')[0];
  
  console.log('Selected folder:', folderName, 'with', files.length, 'files.');
  targetInput.value = "Processing selection...";
  targetInput.disabled = true;
  
  const filePaths = Array.from(files).map(file => file.webkitRelativePath);
  const fullSelectedPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
  
  fetch('/api/detect-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          folderName,
          fullPath: fullSelectedPath,
          filePaths
      })
  })
      .then(response => response.json())
      .then(data => {
          if (data.error) {
              console.error('Error detecting path:', data.error);
              targetInput.value = folderName;
              setTimeout(() => promptForManualPath(targetInput, folderName), 100);
          } else {
              targetInput.value = data.fullPath;
              console.log('Detected path:', data.fullPath);
          }
      })
      .catch(error => {
          console.error('Failed to detect path:', error);
          targetInput.value = folderName;
          setTimeout(() => promptForManualPath(targetInput, folderName), 100);
      })
      .finally(() => {
          targetInput.disabled = false;
      });
}

/**
 * Enhanced configureOutputPath function compatible with backend expectations
 * @param {string} inputDir - Input directory (fallback location for output)
 * @param {string} outputFilename - Requested filename (without extension)
 * @returns {Promise<string>} - Resolves to a validated output path
 */
async function configureOutputPath(inputDir, outputFilename) {
  if (!outputFilename) {
    throw new Error("Output filename is required");
  }
  
  // Ensure proper formatting
  if (outputFilename.endsWith('.json')) {
    outputFilename = outputFilename.slice(0, -5);
  }
  
  // Sanitize filename
  outputFilename = sanitizeFilename(outputFilename);
  
  try {
    // First priority: Use the provided input directory if valid
    let baseDir = inputDir;
    
    if (inputDir) {
      // Verify the input directory exists
      const dirResponse = await fetch('/api/verify-path', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: inputDir })
      });
      
      if (dirResponse.ok) {
        const dirData = await dirResponse.json();
        if (dirData.exists) {
          baseDir = dirData.fullPath;
        }
      }
    }
    
    // Second priority: If input directory is invalid, use DEFAULT_OUTPUT_FOLDER
    if (!baseDir) {
      try {
        const folderResponse = await fetch('/api/get-default-output-folder');
        if (folderResponse.ok) {
          const folderData = await folderResponse.json();
          if (folderData.status === 'success' && folderData.path) {
            baseDir = folderData.path;
          }
        }
      } catch (error) {
        console.warn("Could not fetch default output folder:", error);
        // Use a basic fallback if all else fails
        baseDir = isWindowsOS() ? "C:\\Users\\Documents" : "/home/user/Documents";
      }
    }
    
    // Use backend's expected parameter format
    const response = await fetch('/api/get-output-filepath', {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        filename: outputFilename,
        directory: baseDir
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.fullPath;
  } catch (error) {
    console.error("Error configuring output path:", error);
    // Fallback to client-side path construction as last resort
    return `${inputDir || ""}/${outputFilename}.json`;
  }
}


/**
 * Helper function to safely get DOM elements with error handling
 * @param {string} id - The element ID or selector
 * @param {boolean} isSelector - Whether this is a CSS selector instead of an ID
 * @returns {HTMLElement|null} - The element or null if not found
 */
function safeGetElement(id, isSelector = false) {
  try {
    const element = isSelector ? document.querySelector(id) : document.getElementById(id);
    return element;
  } catch (e) {
    console.warn(`Failed to get element with ${isSelector ? "selector" : "ID"} "${id}": ${e.message}`);
    return null;
  }
}


/**
 * Basic client-side filename sanitization
 * Note: Server-side sanitization will still be applied
 * @param {string} filename - The filename to sanitize
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
  // Replace invalid characters with underscores
  return filename.replace(/[<>:"/\\|?*]+/g, '_')
                .replace(/\s+/g, '_')
                .substring(0, 100); // Limit length
}

/**
 * Get the default output folder with proper error handling
 * @returns {Promise<string>} - Resolves to the default output folder path
 */
async function getDefaultOutputFolder() {
  try {
      const response = await fetch('/api/get-default-output-folder');
      
      if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.path;
  } catch (error) {
      console.error("Error fetching default output folder:", error);
      // Return a reasonable fallback
      return isWindowsOS() ? "C:\\Users\\Documents" : "/home/user/Documents";
  }
}

/**
 * Detect if running on Windows OS
 * @returns {boolean} - True if Windows
 */
function isWindowsOS() {
  return navigator.platform.toLowerCase().includes('win');
}

/**
 * Check if output file already exists and confirm overwrite
 * @param {string} outputPath - The full output path
 * @returns {Promise<boolean>} - Resolves to true if path is valid to use
 */
async function checkOutputFileExists(outputPath) {
  try {
      const response = await fetch('/api/check-file-exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: outputPath })
      });
      
      if (!response.ok) {
          return true; // Assume it's safe if endpoint fails
      }
      
      const data = await response.json();
      
      if (data.exists) {
          // Ask user for confirmation
          return confirm(`File "${outputPath}" already exists. Do you want to overwrite it?`);
      }
      
      return true; // File doesn't exist, safe to proceed
  } catch (error) {
      console.error("Error checking if file exists:", error);
      return true; // Proceed by default
  }
}

/**
 * Display selected files in the UI
 */
function showSelectedFiles(files) {
  const container = document.getElementById('selected-files-info');
  if (!container) return;
  
  // Get up to 5 files to display
  const filesToShow = Array.from(files).slice(0, 5);
  const totalFiles = files.length;
  
  let html = `<div class="alert alert-info mt-2">
    <h6 class="mb-2"><i class="fas fa-file me-2"></i>Selected ${totalFiles} files</h6>
    <ul class="list-unstyled mb-0 small">`;
  
  filesToShow.forEach(file => {
    html += `<li><i class="fas fa-file-alt me-1"></i> ${file.name}</li>`;
  });
  
  if (totalFiles > 5) {
    html += `<li>...and ${totalFiles - 5} more files</li>`;
  }
  
  html += `</ul></div>`;
  
  container.innerHTML = html;
}

/**
 * Open a file by its file path
 */
function openFileByPath(filePath) {
  fetch('/api/open-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast('Success', 'File opened successfully', 'success');
      } else {
        // Fallback to download
        const filename = filePath.split(/[\\/]/).pop();
        window.location.href = `/download/${encodeURIComponent(filename)}`;
        showToast('Notice', 'Opening directly failed. Downloading instead.', 'warning');
      }
    })
    .catch(err => {
      console.error('Error opening file:', err);
      
      // Last resort fallback
      try {
        const filename = filePath.split(/[\\/]/).pop();
        window.location.href = `/download/${encodeURIComponent(filename)}`;
      } catch (e) {
        showToast('Error', 'Failed to open or download file', 'error');
      }
    });
}

/**
 * Handle opening the JSON file
 */
function handleOpenJsonFile(button) {
  // Get file path from data attribute or from task ID
  const outputFile = button.getAttribute('data-output-file');
  const taskId = button.getAttribute('data-task-id') || currentTaskId;
  
  if (!outputFile && !taskId) {
    showToast('Error', 'No output file information available', 'error');
    return;
  }
  
  // If we have a direct output file path, use it
  if (outputFile) {
    openFileByPath(outputFile);
    return;
  }
  
  // Otherwise try to get the file path using the task ID
  fetch(`/api/open/${taskId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to open file: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        showToast('Success', 'File opened successfully', 'success');
      } else {
        showToast('Error', data.error || 'Failed to open file', 'error');
      }
    })
    .catch(err => {
      console.error('Error opening file:', err);
      showToast('Error', 'Failed to open file: ' + err.message, 'error');
    });
}

// =============================================================================
// SECTION 5: SOCKET.IO CONNECTION & STATUS UPDATES
// =============================================================================
/**
 * Initialize Socket.IO with enhanced error handling and reconnection
 */
function initializeSocket() {
  // Don't initialize socket if already initialized and connected
  if (socket && socket.connected) {
    console.log("Socket already connected");
    return;
  }
  
  if (typeof io === 'undefined') {
    console.error("Socket.IO library not available");
    showToast('Connection Error', 'Real-time updates unavailable. Falling back to polling.', 'warning');
    startStatusPolling();
    return;
  }

  try {
    // Properly clean up existing socket if it exists
    if (socket) {
      try {
        // First remove event listeners to avoid duplicate handlers if reconnected
        if (typeof socket.removeAllListeners === 'function') {
          socket.removeAllListeners();
        } else {
          // Fallback for older Socket.IO versions
          socket.off('connect');
          socket.off('connect_error');
          socket.off('disconnect');
          socket.off('task_completed');
          socket.off('progress_update');
          socket.off('task_error');
          socket.off('pdf_download_progress');
          socket.off('batch_processing_progress');
          socket.off('connection_established');
        }
        
        // Close the connection
        socket.close();
        socket.disconnect();
      } catch (e) {
        console.warn("Error disconnecting existing socket:", e);
      }
    }
    
    // Create new Socket.IO connection with better configuration
    socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true,
      // Increased ping timeout to prevent disconnects
      pingTimeout: 60000,
      pingInterval: 25000
    });
    
    console.log("Socket.IO connection initialized");
  } catch (e) {
    console.error("Failed to initialize Socket.IO:", e);
    showToast('Connection Error', 'Real-time updates unavailable. Falling back to polling.', 'warning');
    startStatusPolling();
    return;
  }
  
  // Set up connect event handler
  socket.on('connect', function() {
    console.log('Socket.IO connected with ID:', socket.id);
    
    // Request status update for current task if any
    if (currentTaskId) {
      try {
        socket.emit('request_task_status', { task_id: currentTaskId });
        console.log("Status request sent for task ID:", currentTaskId);
      } catch (e) {
        console.error("Error requesting status update:", e);
      }
    }
  });
  
  // Set up connect error handler
  socket.on('connect_error', function(error) {
    console.error('Socket.IO connection error:', error);
    showToast('Connection Error', 'Failed to connect to server. Falling back to polling.', 'warning');
    startStatusPolling();
  });
  
  // Set up disconnect handler
  socket.on('disconnect', function(reason) {
    console.log('Socket.IO disconnected. Reason:', reason);
    
    if (reason === 'io server disconnect') {
      // Server disconnected us, try to reconnect
      try {
        socket.connect();
      } catch (e) {
        console.error("Error reconnecting socket:", e);
      }
    }
    
    // Only show toast for unexpected disconnections
    if (reason !== 'io client disconnect') {
      showToast('Disconnected', 'Real-time updates stopped. Falling back to polling.', 'warning');
      startStatusPolling();
    }
  });
  
  // Set up task_completed event handler
  socket.on('task_completed', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task completed event received:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Stop polling
      stopStatusPolling();
      
      // Set completion flags
      window.completionTriggered = true;
      window.taskCompleted = true;
          
      // Determine which tab is active and handle accordingly
      const activeTab = document.querySelector('.tab-pane.active');
      
      try {
        if (activeTab && activeTab.id === 'scraper') {
          // Handle scraper completion
          formatAndDisplayScraperResults(data);
        } else if (activeTab && activeTab.id === 'playlist') {
          // Handle playlist completion
          playlistProgressContainer.classList.add('d-none');
          playlistResultsContainer.classList.remove('d-none');
          
          if (playlistStats && data.stats) {
            updateScraperStats(playlistStats, data.stats, data.output_file);
          }
        } else {
          // Handle default tab completion
          showResult(data);
        }
        
        // Add task to history
        addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
        showToast('Success', 'Task completed successfully!', 'success');
      } catch (e) {
        console.error("Error handling task completion:", e);
        showToast('Error', 'Error displaying results: ' + e.message, 'error');
      }
    }
  });
  
  // Progress simulation variables
  let progressSimulationInterval = null;
  let lastProgressValue = 0;
  let lastProgressTimestamp = 0;
  let progressStagnationTime = 0;
  
  /**
   * Start progress simulation to handle stalled progress
   */
  function startProgressSimulation(currentProgress) {
    // Stop any existing simulation
    stopProgressSimulation();
    
    lastProgressValue = currentProgress;
    lastProgressTimestamp = Date.now();
    
    // Create simulation interval that runs every second
    progressSimulationInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSinceLastUpdate = (now - lastProgressTimestamp) / 1000;
      
      // If progress has been stuck for more than 3 seconds at 50%
      if (lastProgressValue === 50 && elapsedSinceLastUpdate > 3) {
        // Track how long we've been stagnant
        progressStagnationTime += 1;
        
        // Calculate a simulated progress based on time
        // We know from logs that at 50% we're really at batch 4/4, which is approx 75% complete
        // So we'll simulate 51-98% over approximately 15 seconds
        const simulatedProgress = Math.min(98, 50 + Math.floor(progressStagnationTime * 3));
        
        console.log(`Simulating progress: ${simulatedProgress}% (stagnant for ${progressStagnationTime}s)`);
        
        // Update the UI with simulated progress
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          if (scraperProgressBar) {
            updateProgressBarElement(scraperProgressBar, simulatedProgress);
          }
          if (scraperProgressStatus) {
            scraperProgressStatus.textContent = "Processing batch 4/4... (simulated progress)";
          }
        } else if (activeTab && activeTab.id === 'playlist') {
          if (playlistProgressBar) {
            updateProgressBarElement(playlistProgressBar, simulatedProgress);
          }
          if (playlistProgressStatus) {
            playlistProgressStatus.textContent = "Processing final batch... (simulated progress)";
          }
        } else {
          if (progressBar) {
            updateProgressBarElement(progressBar, simulatedProgress);
          }
          if (progressStatus) {
            updateProgressStatus(progressStatus, "Processing final batch... (simulated progress)");
          }
        }
      }
    }, 1000);
  }
  
  /**
   * Stop progress simulation
   */
  function stopProgressSimulation() {
    if (window.progressSimulationInterval) {
      clearInterval(window.progressSimulationInterval);
      window.progressSimulationInterval = null;
    }
    window.simulationData = null;
  }
  
  // Set up progress_update event handler with improved handling
  socket.on('progress_update', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Progress update:', data.progress + '%', data.message || '');
      
      try {
        // Determine which tab is active
        const activeTab = document.querySelector('.tab-pane.active');
        
        // Check if progress is at 50% and handle simulation
        if (data.progress === 50) {
          startProgressSimulation(50);
        } else if (data.progress > 50) {
          // If we get a real progress update above 50%, stop simulation
          stopProgressSimulation();
        }
        
        // Track for simulation
        lastProgressValue = data.progress;
        lastProgressTimestamp = Date.now();
        
        if (activeTab && activeTab.id === 'scraper') {
          // Update scraper progress bar
          if (scraperProgressBar) {
            updateProgressBarElement(scraperProgressBar, data.progress);
          }
          
          // Update status message
          if (scraperProgressStatus && data.message) {
            scraperProgressStatus.textContent = data.message;
          }
          
          // Update stats
          if (data.stats && scraperProgressStats) {
            updateScraperProgressStats(scraperProgressStats, data.stats);
          }
          
          // Handle PDF downloads information if available
          if (data.pdf_downloads && data.pdf_downloads.length > 0) {
            handlePdfDownloadsUpdate(data.pdf_downloads);
          }
        } else if (activeTab && activeTab.id === 'playlist') {
          // Update playlist progress bar
          if (playlistProgressBar) {
            updateProgressBarElement(playlistProgressBar, data.progress);
          }
          
          // Update status message
          if (playlistProgressStatus && data.message) {
            playlistProgressStatus.textContent = data.message;
          }
          
          // Update stats
          if (data.stats && playlistProgressStats) {
            updateScraperProgressStats(playlistProgressStats, data.stats);
          }
        } else {
          // Default tab progress updates
          if (progressBar) {
            updateProgressBarElement(progressBar, data.progress);
          }
          
          if (progressStatus && (data.message || data.stage)) {
            updateProgressStatus(progressStatus, data.message || data.stage || "Processing...");
          }
          
          if (data.stats && progressStats) {
            updateProgress(data);
          }
        }
        
        // Check if we need to handle completion here (for cases where task_completed might not arrive)
        if (data.progress >= 99 || data.status === 'completed') {
          if (!window.completionTriggered && !window.taskCompleted) {
            console.log("99% progress detected in progress_update event - triggering completion");
            
            // Stop any progress simulation
            stopProgressSimulation();
            
            window.completionTriggered = true;
            stopStatusPolling();
            
            // Use the same handling as task_completed event
            const aTab = document.querySelector('.tab-pane.active');
            if (aTab && aTab.id === 'scraper') {
              formatAndDisplayScraperResults(data);
            } else if (aTab && aTab.id === 'playlist') {
              playlistProgressContainer.classList.add('d-none');
              playlistResultsContainer.classList.remove('d-none');
              if (playlistStats && data.stats) {
                updateScraperStats(playlistStats, data.stats, data.output_file);
              }
            } else {
              showResult(data);
            }
            
            // Add task to history
            addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
            showToast('Success', 'Task completed successfully!', 'success');
          }
        }
      } catch (e) {
        console.error("Error updating progress:", e);
      }
    }
  });
  
  // Set up task_error event handler
  socket.on('task_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Task error:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Clear any active polling
      stopStatusPolling();
      
      try {
        // Determine which tab is active
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          // Handle scraper error
          scraperProgressContainer.classList.add("d-none");
          scraperResultsContainer.classList.remove("d-none");
          
          if (scraperResults) {
            scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
          }
        } else if (activeTab && activeTab.id === 'playlist') {
          // Handle playlist error
          playlistProgressContainer.classList.add("d-none");
          
          // Use the error container from the file processing tab for consistency
          if (errorContainer) {
            errorContainer.classList.remove("d-none");
            
            if (errorMessage) {
              errorMessage.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
            }
          }
        } else {
          // Handle default tab error
          showError(data);
        }
        
        showToast('Error', data.error || 'An error occurred', 'error');
      } catch (e) {
        console.error("Error handling task error:", e);
        showToast('Error', 'Error occurred: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  });
  
  // PDF download progress
  socket.on('pdf_download_progress', function(data) {
    // First check if this is for the current task
    if (data.task_id && data.task_id !== currentTaskId) return;
    
    console.log('PDF download progress:', data);
    
    // Find or create the download item
    const existingItem = findPdfDownloadItem(data.url);
    
    if (existingItem) {
      // Update existing item
      updatePdfDownloadStatus(existingItem.id, data.status || 'downloading', data.file_path);
      
      // Update progress if available
      if (data.progress && existingItem.progressBar) {
        existingItem.progressBar.style.width = `${data.progress}%`;
        existingItem.progressBar.setAttribute('aria-valuenow', data.progress);
      }
    } else if (data.url) {
      // Create a new download item
      addPdfDownloadItem({
        url: data.url,
        filePath: data.file_path || ''
      }, data.status || 'downloading');
    }
  });
  
  // Batch processing progress
  socket.on('batch_processing_progress', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Batch processing progress:', data);
      
      // Update any UI elements that show batch processing progress
      if (scraperProgressBar && data.progress) {
        updateProgressBarElement(scraperProgressBar, data.progress);
      }
      
      if (scraperProgressStatus && data.message) {
        scraperProgressStatus.textContent = data.message;
      }
    }
  });
  
  // Connection established
  socket.on('connection_established', function(data) {
    console.log('Connection established with server:', data);
    showToast('Connected', 'Connected to server successfully', 'success');
  });
  
  // Add support for PDF processing events
  socket.on('pdf_processing_progress', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('PDF processing progress:', data.progress + '%', data.message || '');
      
      // Update the appropriate progress bar based on active tab
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        if (scraperProgressBar) {
          updateProgressBarElement(scraperProgressBar, data.progress);
        }
        if (scraperProgressStatus && data.message) {
          scraperProgressStatus.textContent = data.message;
        }
      } else {
        // Default tab progress updates
        if (progressBar) {
          updateProgressBarElement(progressBar, data.progress);
        }
        if (progressStatus && data.message) {
          updateProgressStatus(progressStatus, data.message);
        }
      }
    }
  });
  
  // PDF processing complete
  socket.on('pdf_processing_complete', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('PDF processing complete:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Determine which tab is active and handle accordingly
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        formatAndDisplayScraperResults(data);
      } else {
        // Handle default tab completion
        showResult(data);
      }
      
      // Add task to history
      addTaskToHistory(getCurrentTaskType(), data.output_path, data.stats);
      showToast('Success', 'PDF processing completed successfully!', 'success');
    }
  });
  
  // PDF processing error
  socket.on('pdf_processing_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('PDF processing error:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Determine which tab is active
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        // Handle scraper error
        scraperProgressContainer.classList.add("d-none");
        scraperResultsContainer.classList.remove("d-none");
        
        if (scraperResults) {
          scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
        }
      } else {
        // Handle default tab error
        showError(data);
      }
      
      showToast('Error', data.error || 'An error occurred', 'error');
    }
  });
  
  // Playlist error handler
  socket.on('playlist_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Playlist error:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Clear any active polling
      stopStatusPolling();
      
      try {
        // Handle playlist error
        playlistProgressContainer.classList.add("d-none");
        playlistFormContainer.classList.remove("d-none");
        
        // Show error toast
        showToast('Error', data.error || 'An error occurred with the playlist download', 'error');
        
        // Clear session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
      } catch (e) {
        console.error("Error handling playlist error:", e);
        showToast('Error', 'Error occurred: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  });
  
  console.log("Socket.IO event handlers registered");
}

/**
 * Find a PDF download item by URL
 * @param {string} url - The URL to find
 * @returns {Object|null} - The found item or null
 */
function findPdfDownloadItem(url) {
  if (!pdfDownloadsList) return null;
  
  const items = pdfDownloadsList.querySelectorAll('.pdf-download-item');
  for (const item of items) {
    const titleEl = item.querySelector('.pdf-item-title');
    if (titleEl && titleEl.getAttribute('title') === url) {
      return { 
        id: item.id, 
        element: item,
        progressBar: item.querySelector('.progress-bar')
      };
    }
  }
  return null;
}





/**
 * Set up connection-related event handlers
 */
function setupConnectionEvents() {
  // Connection established
  socket.on('connect', function() {
    console.log('Socket.IO connected with ID:', socket.id);
    
    // Stop polling as we now have a real-time connection
    stopStatusPolling();
    
    // Request status update for current task if any
    if (currentTaskId) {
      try {
        socket.emit('request_task_status', { task_id: currentTaskId });
        console.log("Status request sent for task ID:", currentTaskId);
      } catch (e) {
        console.error("Error requesting status update:", e);
      }
    }
  });
  
  // Connection error
  socket.on('connect_error', function(error) {
    console.error('Socket.IO connection error:', error);
    showToast('Connection Error', 'Failed to connect to server. Falling back to polling.', 'warning');
    startStatusPolling();
  });
  
  // Disconnection
  socket.on('disconnect', function(reason) {
    console.log('Socket.IO disconnected. Reason:', reason);
    
    if (reason === 'io server disconnect') {
      // Server disconnected us, try to reconnect
      try {
        socket.connect();
      } catch (e) {
        console.error("Error reconnecting socket:", e);
      }
    }
    
    // Only show toast for unexpected disconnections
    if (reason !== 'io client disconnect') {
      showToast('Disconnected', 'Real-time updates stopped. Falling back to polling.', 'warning');
      startStatusPolling();
    }
  });
  
  // Connection established confirmation from server
  socket.on('connection_established', function(data) {
    console.log('Connection established with server:', data);
    showToast('Connected', 'Connected to server successfully', 'success');
  });
  
  // Ping-Pong for connection testing
  socket.on('pong_to_client', function(data) {
    console.log('Received pong from server:', data);
    const roundTripTime = data.client_server_diff ? `(${Math.round(data.client_server_diff * 1000)}ms)` : '';
    showToast('Connection', `Server connection active ${roundTripTime}`, 'info');
  });
}

/**
 * Set up task status event handlers
 */
function setupTaskStatusEvents() {
  // Task started
  socket.on('task_started', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task started event received:', data);
      
      // Update UI based on task type
      const taskType = data.task_type || getCurrentTaskType();
      updateTaskStartUI(taskType, data);
    }
  });
  
  // Progress update with improved handling for various formats
  socket.on('progress_update', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Progress update:', data.progress + '%', data.message || '');
      
      try {
        // Extract progress data - support different possible structures
        let progressValue = data.progress;
        let message = data.message || data.stage || "Processing...";
        
        // Check for nested progress structure
        if (progressValue === undefined && data.detailed_progress) {
          const detailedProgress = data.detailed_progress;
          if (detailedProgress.progress_percent !== undefined) {
            progressValue = detailedProgress.progress_percent;
          } else if (detailedProgress.processed_count !== undefined && 
                   detailedProgress.total_count !== undefined && 
                   detailedProgress.total_count > 0) {
            progressValue = Math.round((detailedProgress.processed_count / 
                                      detailedProgress.total_count) * 100);
          }
          
          if (!message && detailedProgress.stage) {
            message = detailedProgress.stage;
          }
        }
        
        // Normalize progress value
        if (typeof progressValue === 'string') {
          progressValue = parseFloat(progressValue);
        }
        
        // Get the task type
        const activeTab = document.querySelector('.tab-pane.active');
        let taskType = 'file';
        
        if (activeTab) {
          if (activeTab.id === 'scraper') {
            taskType = 'scraper';
          } else if (activeTab.id === 'playlist') {
            taskType = 'playlist';
          }
        }
        
        // Update UI based on task type
        updateTaskProgressUI(taskType, progressValue, message, data);
        
        // Update timestamp for monitoring
        window.lastProgressUpdate = Date.now();
        window.lastProgressValue = progressValue;
        
        // Check for completion (shouldn't happen here, but just in case)
        if (progressValue >= 100 && !window.completionTriggered) {
          console.log("100% progress detected in progress_update event");
        }
      } catch (e) {
        console.error("Error updating progress:", e);
      }
    }
  });
  
  // Task completed
  socket.on('task_completed', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task completed event received:', data);
      
      // Stop polling
      stopStatusPolling();
      
      // Set completion flags
      window.completionTriggered = true;
      window.taskCompleted = true;
      
      try {
        // Get task type
        const taskType = data.task_type || getCurrentTaskType();
        
        // Handle task completion based on type
        handleTaskCompletion(taskType, data);
        
        // Add task to history
        addTaskToHistory(taskType, data.output_file, data.stats);
        showToast('Success', 'Task completed successfully!', 'success');
      } catch (e) {
        console.error("Error handling task completion:", e);
        showToast('Error', 'Error displaying results: ' + e.message, 'error');
      }
    }
  });
  
  // Task error
  socket.on('task_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Task error:', data);
      
      // Clear any active polling
      stopStatusPolling();
      
      try {
        // Get task type
        const taskType = data.task_type || getCurrentTaskType();
        
        // Handle error based on task type
        handleTaskError(taskType, data);
        
        // Show error toast
        showToast('Error', data.error || 'An error occurred', 'error');
      } catch (e) {
        console.error("Error handling task error:", e);
        showToast('Error', 'Error occurred: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  });
  
  // Task cancelled
  socket.on('task_cancelled', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task cancelled event received:', data);
      
      // Stop polling
      stopStatusPolling();
      
      try {
        // Get task type
        const taskType = data.task_type || getCurrentTaskType();
        
        // Handle cancellation based on task type
        handleTaskCancellation(taskType);
        
        // Show cancellation toast
        showToast('Cancelled', 'Task cancelled', 'warning');
        
        // Clear task IDs
        currentTaskId = null;
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
      } catch (e) {
        console.error("Error handling task cancellation:", e);
        showToast('Error', 'Error handling cancellation: ' + e.message, 'error');
      }
    }
  });
}

/**
 * Set up PDF-related event handlers
 */
function setupPdfEvents() {
  // PDF download progress
  socket.on('pdf_download_progress', function(data) {
    // First check if this is for the current task
    if (data.task_id && data.task_id !== currentTaskId) return;
    
    console.log('PDF download progress:', data);
    
    try {
      // Find or create the download item
      const existingItem = findPdfDownloadItem(data.url);
      
      if (existingItem) {
        // Update existing item
        updatePdfDownloadStatus(existingItem.id, data.status || 'downloading', data.file_path);
        
        // Update progress if available
        if (data.progress && existingItem.progressBar) {
          existingItem.progressBar.style.width = `${data.progress}%`;
          existingItem.progressBar.setAttribute('aria-valuenow', data.progress);
        }
      } else if (data.url) {
        // Create a new download item
        addPdfDownloadItem({
          url: data.url,
          filePath: data.file_path || ''
        }, data.status || 'downloading');
      }
    } catch (e) {
      console.error("Error handling PDF download progress:", e);
    }
  });
  
  // PDF processing progress
  socket.on('pdf_processing_progress', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('PDF processing progress:', data.progress + '%', data.message || '');
      
      // Update the appropriate progress bar based on active tab
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        if (scraperProgressBar) {
          updateProgressBarElement(scraperProgressBar, data.progress);
        }
        if (scraperProgressStatus && data.message) {
          scraperProgressStatus.textContent = data.message;
        }
      } else {
        // Default tab progress updates
        if (progressBar) {
          updateProgressBarElement(progressBar, data.progress);
        }
        if (progressStatus && data.message) {
          updateProgressStatus(progressStatus, data.message);
        }
      }
    }
  });
  
  // PDF processing complete
  socket.on('pdf_processing_complete', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('PDF processing complete:', data);
      
      // Handle based on active tab
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        formatAndDisplayScraperResults(data);
      } else {
        // Handle default tab completion
        showResult(data);
      }
      
      // Add task to history
      addTaskToHistory(getCurrentTaskType(), data.output_path, data.stats);
      showToast('Success', 'PDF processing completed successfully!', 'success');
    }
  });
  
  // PDF processing error
  socket.on('pdf_processing_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('PDF processing error:', data);
      
      // Handle based on active tab
      const activeTab = document.querySelector('.tab-pane.active');
      
      if (activeTab && activeTab.id === 'scraper') {
        // Handle scraper error
        scraperProgressContainer.classList.add("d-none");
        scraperResultsContainer.classList.remove("d-none");
        
        if (scraperResults) {
          scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
        }
      } else {
        // Handle default tab error
        showError(data);
      }
      
      showToast('Error', data.error || 'An error occurred', 'error');
    }
  });
}

/**
 * Set up specialized event handlers for playlist and batch processing
 */
function setupSpecializedEvents() {
  // Playlist-specific error handler
  socket.on('playlist_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Playlist error:', data);
      
      // Clear any active polling
      stopStatusPolling();
      
      try {
        // Handle playlist error
        playlistProgressContainer.classList.add("d-none");
        playlistFormContainer.classList.remove("d-none");
        
        // Show error toast
        showToast('Error', data.error || 'An error occurred with the playlist download', 'error');
        
        // Clear session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');
      } catch (e) {
        console.error("Error handling playlist error:", e);
        showToast('Error', 'Error occurred: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  });
  
  // Batch processing progress
  socket.on('batch_processing_progress', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Batch processing progress:', data);
      
      // Update any UI elements that show batch processing progress
      if (scraperProgressBar && data.progress !== undefined) {
        updateProgressBarElement(scraperProgressBar, data.progress);
      }
      
      if (scraperProgressStatus && data.message) {
        scraperProgressStatus.textContent = data.message;
      }
    }
  });
}

/**
 * Update UI when a task is started
 * @param {string} taskType - The type of task (file, scraper, playlist)
 * @param {Object} data - Task data from the server
 */
function updateTaskStartUI(taskType, data) {
  try {
    switch (taskType) {
      case 'scraper':
        if (scraperFormContainer) scraperFormContainer.classList.add('d-none');
        if (scraperProgressContainer) scraperProgressContainer.classList.remove('d-none');
        if (scraperProgressBar) updateProgressBarElement(scraperProgressBar, 0);
        if (scraperProgressStatus) updateProgressStatus(scraperProgressStatus, data.message || "Starting scraper...");
        break;
      case 'playlist':
        if (playlistFormContainer) playlistFormContainer.classList.add('d-none');
        if (playlistProgressContainer) playlistProgressContainer.classList.remove('d-none');
        if (playlistProgressBar) updateProgressBarElement(playlistProgressBar, 0);
        if (playlistProgressStatus) updateProgressStatus(playlistProgressStatus, data.message || "Starting playlist download...");
        break;
      default: // file processing
        if (formContainer) formContainer.classList.add('d-none');
        if (progressContainer) progressContainer.classList.remove('d-none');
        if (progressBar) updateProgressBarElement(progressBar, 0);
        if (progressStatus) updateProgressStatus(progressStatus, data.message || "Starting file processing...");
        break;
    }
  } catch (e) {
    console.error("Error updating task start UI:", e);
  }
}

/**
 * Update UI for task progress
 * @param {string} taskType - The type of task
 * @param {number} progress - Progress percentage
 * @param {string} message - Status message
 * @param {Object} data - Full data object from server
 */
function updateTaskProgressUI(taskType, progress, message, data) {
  try {
    switch (taskType) {
      case 'scraper':
        // Update scraper progress bar
        if (scraperProgressBar && !isNaN(progress)) {
          updateProgressBarElement(scraperProgressBar, progress);
        }
        
        // Update status message
        if (scraperProgressStatus && message) {
          scraperProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && scraperProgressStats) {
          updateScraperProgressStats(scraperProgressStats, data.stats);
        }
        
        // Handle PDF downloads information if available
        if (data.pdf_downloads && data.pdf_downloads.length > 0) {
          handlePdfDownloadsUpdate(data.pdf_downloads);
        }
        break;
        
      case 'playlist':
        // Update playlist progress bar
        if (playlistProgressBar && !isNaN(progress)) {
          updateProgressBarElement(playlistProgressBar, progress);
        }
        
        // Update status message
        if (playlistProgressStatus && message) {
          playlistProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && playlistProgressStats) {
          updatePlaylistProgressStats(playlistProgressStats, data.stats);
        }
        break;
        
      default: // file processing
        // Update main progress bar
        if (progressBar && !isNaN(progress)) {
          updateProgressBarElement(progressBar, progress);
        }
        
        // Update status message
        if (progressStatus && message) {
          updateProgressStatus(progressStatus, message);
        }
        
        // Update stats
        if (data.stats && progressStats) {
          updateProgress(data);
        }
        break;
    }
  } catch (e) {
    console.error("Error updating task progress UI:", e);
  }
}

/**
 * Handle task cancellation based on task type
 * @param {string} taskType - The type of task
 */
function handleTaskCancellation(taskType) {
  try {
    switch (taskType) {
      case 'scraper':
        scraperProgressContainer.classList.add("d-none");
        scraperFormContainer.classList.remove("d-none");
        break;
      case 'playlist':
        playlistProgressContainer.classList.add("d-none");
        playlistFormContainer.classList.remove("d-none");
        break;
      default: // file processing
        showForm();
        break;
    }
  } catch (e) {
    console.error("Error handling task cancellation:", e);
    throw e; // Re-throw for higher-level handling
  }
}


/**
 * Enhanced progress update function that can handle different server formats
 * 
 * @param {Object} data - Progress data from server
 */
function updateProgress(data) {
  if (!data) return;
  
  console.log('Processing update data:', data);
  
  try {
      // Store latest data for potential recovery
      window.latestTaskData = data;
      
      // Extract progress percentage
      let progressValue = data.progress;
      
      // Handle different possible formats
      if (progressValue === undefined) {
          // Try to extract from detailed_progress
          if (data.detailed_progress) {
              if (data.detailed_progress.progress_percent !== undefined) {
                  progressValue = data.detailed_progress.progress_percent;
              } else if (data.detailed_progress.processed_count !== undefined && 
                         data.detailed_progress.total_count !== undefined &&
                         data.detailed_progress.total_count > 0) {
                  progressValue = Math.round((data.detailed_progress.processed_count / 
                                            data.detailed_progress.total_count) * 100);
              }
          }
          
          // Try to extract from stats
          if (progressValue === undefined && data.stats) {
              if (data.stats.processed_files !== undefined && 
                  data.stats.total_files !== undefined && 
                  data.stats.total_files > 0) {
                  progressValue = Math.round((data.stats.processed_files / 
                                            data.stats.total_files) * 100);
              }
          }
      }
      
      // Ensure progress is a number
      if (typeof progressValue === 'string') {
          progressValue = parseFloat(progressValue);
      }
      
      // Extract message
      let message = data.message || data.stage || '';
      
      // Try to extract message from detailed_progress if not found
      if (!message && data.detailed_progress && data.detailed_progress.stage) {
          message = data.detailed_progress.stage;
      }
      
      // Use default message if still not found
      if (!message) {
          message = "Processing...";
      }
      
      // Update progress bar if we have a valid progress value
      if (progressValue !== undefined && !isNaN(progressValue)) {
          console.log(`Updating progress bar to ${progressValue}%`);
          if (progressBar) {
              updateProgressBarElement(progressBar, progressValue);
          }
      }
      
      // Update status message
      if (progressStatus) {
          updateProgressStatus(progressStatus, message);
      }
      
      // Update stats if available
      if (data.stats && progressStats) {
          updateProgressStats(progressStats, data.stats);
      }
      
      // Check for completion
      if (data.status === 'completed' || (progressValue !== undefined && progressValue >= 100)) {
          console.log("Completion detected in updateProgress");
          
          if (!window.completionTriggered) {
              window.completionTriggered = true;
              
              // Stop polling
              stopStatusPolling();
              
              // Show result
              showResult(data);
          }
      }
  } catch (error) {
      console.error("Error in updateProgress:", error);
  }
}

// Add this function to fetch and display PDF capabilities
function fetchPdfCapabilities() {
  fetch('/api/pdf/capabilities')
    .then(response => response.json())
    .then(data => {
      if (data.status === 'success') {
        displayPdfCapabilities(data.capabilities);
      }
    })
    .catch(error => {
      console.error('Error fetching PDF capabilities:', error);
    });
}

// Display PDF capabilities in the UI
function displayPdfCapabilities(capabilities) {
  // Create capabilities display in file processing tab
  const capabilitiesContainer = document.getElementById('pdf-capabilities-container');
  if (!capabilitiesContainer) return;
  
  let html = '<div class="alert alert-info mt-3">';
  html += '<h6><i class="fas fa-info-circle me-2"></i>PDF Processing Capabilities</h6>';
  html += '<ul class="mb-0 small">';
  
  // Add available features
  if (capabilities.features) {
    const features = capabilities.features;
    if (features.text_extraction) {
      html += '<li><i class="fas fa-check text-success me-1"></i> Text extraction</li>';
    }
    if (features.table_extraction) {
      html += '<li><i class="fas fa-check text-success me-1"></i> Table extraction</li>';
    }
    if (features.document_type_detection) {
      html += '<li><i class="fas fa-check text-success me-1"></i> Document type detection</li>';
    }
    if (features.enhanced_output) {
      html += '<li><i class="fas fa-check text-success me-1"></i> Enhanced output format</li>';
    }
    if (features.memory_efficient) {
      html += '<li><i class="fas fa-check text-success me-1"></i> Memory-efficient processing</li>';
    }
  }
  
  html += '</ul>';
  html += '</div>';
  
  capabilitiesContainer.innerHTML = html;
}

// Call this when the app initializes
document.addEventListener('DOMContentLoaded', function() {
  fetchPdfCapabilities();
});


/**
 * Enhanced status polling for task recovery
 * This function will try to resume tasks if the page is refreshed
 */
function checkOngoingTask() {
  // Check if there's an ongoing task in session storage
  const ongoingTaskId = sessionStorage.getItem('ongoingTaskId');
  const ongoingTaskType = sessionStorage.getItem('ongoingTaskType');
  
  if (!ongoingTaskId) return;
  
  console.log("Found ongoing task:", ongoingTaskId, "of type:", ongoingTaskType);
  
  // Set the current task ID
  currentTaskId = ongoingTaskId;
  
  // Switch to the appropriate tab
  if (ongoingTaskType) {
    const tabMapping = {
      'file': 'file-tab',
      'playlist': 'playlist-tab',
      'scraper': 'scraper-tab'
    };
    
    const tabId = tabMapping[ongoingTaskType];
    if (tabId) {
      try {
        // Try to activate the correct tab
        const tab = document.getElementById(tabId);
        if (tab) {
          const bsTab = new bootstrap.Tab(tab);
          bsTab.show();
        }
      } catch (e) {
        console.error("Error switching to tab:", e);
      }
    }
  }
  
  // Show the appropriate progress container based on task type
  try {
    if (ongoingTaskType === 'file') {
      // Show file processing progress
      formContainer.classList.add('d-none');
      progressContainer.classList.remove('d-none');
    } else if (ongoingTaskType === 'playlist') {
      // Show playlist progress
      playlistFormContainer.classList.add('d-none');
      playlistProgressContainer.classList.remove('d-none');
    } else if (ongoingTaskType === 'scraper') {
      // Show scraper progress
      scraperFormContainer.classList.add('d-none');
      scraperProgressContainer.classList.remove('d-none');
    }
  } catch (e) {
    console.error("Error restoring task UI state:", e);
  }
  
  // Start status polling for the ongoing task
  showToast('Task Resumed', 'Resuming previous task...', 'info');
  startStatusPolling();
}

/**
 * Get the current task type based on the active tab
 */
function getCurrentTaskType() {
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (!activeTab) return 'file'; // Default
  
  switch (activeTab.id) {
    case 'scraper':
      return 'scraper';
    case 'playlist':
      return 'playlist';
    default:
      return 'file';
  }
}

// =============================================================================
// SECTION 6: UI UPDATES & PROGRESS VISUALIZATION
// =============================================================================

/**
 * Show the progress container with improved transitions
 */
function showProgress() {
  // Add fade transitions
  formContainer.classList.add('fade-out');
  
  setTimeout(() => {
    formContainer.classList.add('d-none');
    formContainer.classList.remove('fade-out');
    
    progressContainer.classList.remove('d-none');
    progressContainer.classList.add('fade-in');
    
    // Reset progress elements
    if (progressBar) updateProgressBarElement(progressBar, 0);
    if (progressStatus) updateProgressStatus(progressStatus, "Initializing...");
    if (progressStats) progressStats.innerHTML = "";
    
    setTimeout(() => {
      progressContainer.classList.remove('fade-in');
    }, 500);
  }, 300);
}



/**
 * Show task result with improved transitions
 */
function showResult(data) {
  // Add fade transitions
  progressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    progressContainer.classList.add('d-none');
    progressContainer.classList.remove('fade-out');
    
    resultContainer.classList.remove('d-none');
    resultContainer.classList.add('fade-in');
    
    // Update stats if available
    if (data.stats && resultStats) {
      updateResultStats(resultStats, data.stats, data.output_file);
    }
    
    // Set the output file path for the open button
    if (data.output_file && openBtn) {
      openBtn.setAttribute('data-task-id', currentTaskId);
      openBtn.setAttribute('data-output-file', data.output_file);
    }
    
    setTimeout(() => {
      resultContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage as task is complete
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
 * Show error message with improved transitions
 */
function showError(data) {
  // Add fade transitions
  progressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    progressContainer.classList.add('d-none');
    progressContainer.classList.remove('fade-out');
    
    errorContainer.classList.remove('d-none');
    errorContainer.classList.add('fade-in');
    
    // Update error message
    if (data.error && errorMessage) {
      errorMessage.textContent = data.error;
    }
    
    // Update error details if available
    if (data.details && errorDetails) {
      errorDetails.textContent = data.details;
    } else if (errorDetails) {
      errorDetails.textContent = '';
    }
    
    setTimeout(() => {
      errorContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage as task failed
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
 * Show playlist error with improved transitions
 */
function showPlaylistError(error) {
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    playlistFormContainer.classList.remove('d-none');
    playlistFormContainer.classList.add('fade-in');
    
    // Show error toast
    showToast('Error', error, 'error');
    
    setTimeout(() => {
      playlistFormContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage as task failed
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);

}


/**
 * Update result statistics display with optimized rendering and error handling
 * @param {HTMLElement} statsElement - The element to update with statistics
 * @param {Object} stats - The statistics object from the processing results
 * @param {string} outputFile - Optional output file path
 */
function updateResultStats(statsElement, stats, outputFile) {
  if (!statsElement) return;
  
  // Define stats configuration for more maintainable code
  const statConfig = [
    {key: 'total_files', label: 'Total Files', badgeClass: 'bg-primary'},
    {key: 'processed_files', label: 'Processed Files', badgeClass: 'bg-success'},
    {key: 'skipped_files', label: 'Skipped Files', badgeClass: 'bg-warning'},
    {key: 'error_files', label: 'Error Files', badgeClass: 'bg-danger'},
    {key: 'total_chunks', label: 'Total Chunks', badgeClass: 'bg-info'},
    {key: 'total_bytes', label: 'Total Size', badgeClass: 'bg-secondary', formatter: formatBytes},
    {key: 'duration_seconds', label: 'Duration', badgeClass: 'bg-dark', formatter: formatDuration},
    {key: 'pdf_files', label: 'PDF Files', badgeClass: 'bg-primary'},
    {key: 'tables_extracted', label: 'Tables Extracted', badgeClass: 'bg-info'},
    {key: 'references_extracted', label: 'References Extracted', badgeClass: 'bg-info'}
  ];
  
  // Use the documentFragment for better performance
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  fragment.appendChild(container);
  
  // Add header
  let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Add stats items using the configuration
  for (const item of statConfig) {
    if (stats[item.key] !== undefined) {
      const value = item.formatter ? item.formatter(stats[item.key]) : stats[item.key];
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${item.label} <span class="badge ${item.badgeClass} rounded-pill">${value}</span>
        </li>`;
    }
  }
  
  statsHtml += '</ul>';
  
  // Add JSON view
  statsHtml += addJsonView(stats, outputFile);
  
  // Set HTML content and update DOM once
  container.innerHTML = statsHtml;
  statsElement.innerHTML = '';
  statsElement.appendChild(fragment);
}

/**
 * Add JSON view to statistics display
 */
function addJsonView(stats, outputFile) {
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
  const bgClass = isDarkMode ? 'bg-dark text-light' : 'bg-light';
  
  // Create a result object for JSON display
  const resultData = {
    stats: stats,
    output_file: outputFile
  };
  
  return `
    <div class="card mb-3">
      <div class="card-header ${bgClass}" id="jsonHeader">
        <button class="btn btn-link collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#jsonContent">
          <i class="fas fa-code me-1"></i> View Raw JSON
        </button>
      </div>
      <div id="jsonContent" class="collapse">
        <div class="card-body ${bgClass}">
          <pre class="mb-0"><code class="language-json">${formatJsonForDisplay(resultData)}</code></pre>
        </div>
      </div>
    </div>
  `;
}

/**
 * Update progress status with safety checks
 * @param {HTMLElement} statusElement - The status element to update
 * @param {string} message - The status message to display
 */
function updateProgressStatus(statusElement, message) {
  if (!statusElement || !message) return;
  
  // Only update if the message has changed
  if (statusElement.textContent === message) return;
  
  try {
    // Add fade-out animation
    statusElement.classList.add('opacity-50');
    
    // Update text after a brief delay for animation effect
    setTimeout(() => {
      statusElement.textContent = message;
      statusElement.classList.remove('opacity-50');
    }, 200);
  } catch (error) {
    // Fallback if animation fails
    console.warn("Error updating progress status:", error);
    statusElement.textContent = message;
  }
}

/**
 * Update scraper progress statistics with improved styling.
 */
function updateScraperProgressStats(statsContainer, stats) {
  if (!statsContainer || !stats) return;
  
  // Enhanced stats display with consistent styling
  let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
  
  // Define standard fields with consistent styling
  const statFields = [
    {key: 'total_files', label: 'Total Files', badgeClass: 'bg-primary'},
    {key: 'processed_files', label: 'Processed Files', badgeClass: 'bg-success'},
    {key: 'skipped_files', label: 'Skipped Files', badgeClass: 'bg-warning'},
    {key: 'error_files', label: 'Error Files', badgeClass: 'bg-danger'},
    {key: 'total_chunks', label: 'Total Chunks', badgeClass: 'bg-info'},
    {key: 'total_bytes', label: 'Total Bytes', badgeClass: 'bg-secondary', formatter: formatBytes},
    {key: 'duration_seconds', label: 'Duration', badgeClass: 'bg-dark', formatter: formatDuration},
    // Scraper-specific
    {key: 'total_urls', label: 'Total URLs', badgeClass: 'bg-primary'},
    {key: 'successful_urls', label: 'Successful URLs', badgeClass: 'bg-success'},
    {key: 'failed_urls', label: 'Failed URLs', badgeClass: 'bg-danger'},
    {key: 'pdf_downloads', label: 'PDF Downloads', badgeClass: 'bg-info'}
  ];
  
  // Generate stats HTML with consistent layout
  for (const field of statFields) {
    if (stats[field.key] !== undefined) {
      const value = field.formatter ? field.formatter(stats[field.key]) : stats[field.key];
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${field.label} <span class="badge ${field.badgeClass} rounded-pill">${value}</span>
        </li>`;
    }
  }
  
  statsHtml += '</ul>';
  statsContainer.innerHTML = statsHtml;
}

/**
 * Update scraper statistics display
 */
function updateScraperStats(statsElement, stats, outputFile) {
  if (!statsElement || !stats) return;
  
  let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Common stats
  if (stats.total_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Files <span class="badge bg-primary rounded-pill">${stats.total_files}</span></li>`;
  
  if (stats.processed_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Processed Files <span class="badge bg-success rounded-pill">${stats.processed_files}</span></li>`;
  
  if (stats.skipped_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Skipped Files <span class="badge bg-warning rounded-pill">${stats.skipped_files}</span></li>`;
  
  if (stats.error_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Error Files <span class="badge bg-danger rounded-pill">${stats.error_files}</span></li>`;
  
  if (stats.total_chunks !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Chunks <span class="badge bg-info rounded-pill">${stats.total_chunks}</span></li>`;
  
  if (stats.total_bytes !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Bytes <span class="badge bg-secondary rounded-pill">${formatBytes(stats.total_bytes)}</span></li>`;
  
  if (stats.duration_seconds !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span></li>`;
  
  // Scraper-specific stats
  if (stats.total_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total URLs <span class="badge bg-primary rounded-pill">${stats.total_urls}</span></li>`;
  
  if (stats.successful_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Successful URLs <span class="badge bg-success rounded-pill">${stats.successful_urls}</span></li>`;
  
  if (stats.failed_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Failed URLs <span class="badge bg-danger rounded-pill">${stats.failed_urls}</span></li>`;
  
  if (stats.pdf_downloads !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">PDF Downloads <span class="badge bg-info rounded-pill">${stats.pdf_downloads}</span></li>`;
  
  statsHtml += '</ul>';
  
  // Add JSON view
  statsHtml += addJsonView(stats, outputFile);
  
  statsElement.innerHTML = statsHtml;
}

/**
 * Add JSON view to statistics display
 */
function addJsonView(stats, outputFile) {
  const isDarkMode = document.body.getAttribute('data-theme') === 'dark';
  const bgClass = isDarkMode ? 'bg-dark text-light' : 'bg-light';
  
  // Create a result object for JSON display
  const resultData = {
    stats: stats,
    output_file: outputFile
  };
  
  return `
    <div class="card mb-3">
      <div class="card-header ${bgClass}" id="jsonHeader">
        <button class="btn btn-link collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#jsonContent">
          <i class="fas fa-code me-1"></i> View Raw JSON
        </button>
      </div>
      <div id="jsonContent" class="collapse">
        <div class="card-body ${bgClass}">
          <pre class="mb-0"><code class="language-json">${formatJsonForDisplay(resultData)}</code></pre>
        </div>
      </div>
    </div>
  `;
}

/**
 * Update scraper progress stats with improved styling.
 */
function updateScraperProgressStats(statsContainer, stats) {
  if (!statsContainer || !stats) return;
  
  // Enhanced stats display with consistent styling
  let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
  
  // Define standard fields with consistent styling
  const statFields = [
    {key: 'total_files', label: 'Total Files', badgeClass: 'bg-primary'},
    {key: 'processed_files', label: 'Processed Files', badgeClass: 'bg-success'},
    {key: 'skipped_files', label: 'Skipped Files', badgeClass: 'bg-warning'},
    {key: 'error_files', label: 'Error Files', badgeClass: 'bg-danger'},
    {key: 'total_chunks', label: 'Total Chunks', badgeClass: 'bg-info'},
    {key: 'total_bytes', label: 'Total Bytes', badgeClass: 'bg-secondary', formatter: formatBytes},
    {key: 'duration_seconds', label: 'Duration', badgeClass: 'bg-dark', formatter: formatDuration},
    // Scraper-specific
    {key: 'total_urls', label: 'Total URLs', badgeClass: 'bg-primary'},
    {key: 'successful_urls', label: 'Successful URLs', badgeClass: 'bg-success'},
    {key: 'failed_urls', label: 'Failed URLs', badgeClass: 'bg-danger'},
    {key: 'pdf_downloads', label: 'PDF Downloads', badgeClass: 'bg-info'}
  ];
  
  // Generate stats HTML with consistent layout
  for (const field of statFields) {
    if (stats[field.key] !== undefined) {
      const value = field.formatter ? field.formatter(stats[field.key]) : stats[field.key];
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${field.label} <span class="badge ${field.badgeClass} rounded-pill">${value}</span>
        </li>`;
    }
  }
  
  statsHtml += '</ul>';
  statsContainer.innerHTML = statsHtml;
}

/**
 * Update scraper statistics display
 */
function updateScraperStats(statsElement, stats, outputFile) {
  if (!statsElement || !stats) return;
  
  let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Common stats
  if (stats.total_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Files <span class="badge bg-primary rounded-pill">${stats.total_files}</span></li>`;
  
  if (stats.processed_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Processed Files <span class="badge bg-success rounded-pill">${stats.processed_files}</span></li>`;
  
  if (stats.skipped_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Skipped Files <span class="badge bg-warning rounded-pill">${stats.skipped_files}</span></li>`;
  
  if (stats.error_files !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Error Files <span class="badge bg-danger rounded-pill">${stats.error_files}</span></li>`;
  
  if (stats.total_chunks !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Chunks <span class="badge bg-info rounded-pill">${stats.total_chunks}</span></li>`;
  
  if (stats.total_bytes !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Bytes <span class="badge bg-secondary rounded-pill">${formatBytes(stats.total_bytes)}</span></li>`;
  
  if (stats.duration_seconds !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span></li>`;
  
  // Scraper-specific stats
  if (stats.total_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total URLs <span class="badge bg-primary rounded-pill">${stats.total_urls}</span></li>`;
  
  if (stats.successful_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Successful URLs <span class="badge bg-success rounded-pill">${stats.successful_urls}</span></li>`;
  
  if (stats.failed_urls !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Failed URLs <span class="badge bg-danger rounded-pill">${stats.failed_urls}</span></li>`;
  
  if (stats.pdf_downloads !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">PDF Downloads <span class="badge bg-info rounded-pill">${stats.pdf_downloads}</span></li>`;
  
  statsHtml += '</ul>';
  
  // Add JSON view
  statsHtml += addJsonView(stats, outputFile);
  
  statsElement.innerHTML = statsHtml;
}

// =============================================================================
// SECTION 7: FILE PROCESSING TAB FUNCTIONALITY
// =============================================================================

/**
 * Validate and handle the file processing form submission
 * @param {Event} e - The form submission event
 */
function handleFileSubmit(e) {
  // Always prevent the default form behavior
  e.preventDefault();
  console.log("File processing form submitted");
  
  // Get input values and validate
  const inputDir = inputDirField.value.trim();
  const outputFile = outputFileField.value.trim();
  
  if (!inputDir) {
    showToast('Error', 'Please enter an input directory', 'error');
    inputDirField.classList.add('is-invalid');
    setTimeout(() => inputDirField.classList.remove('is-invalid'), 3000);
    inputDirField.focus();
    return;
  }
  
  if (!outputFile) {
    showToast('Error', 'Please enter an output filename', 'error');
    outputFileField.classList.add('is-invalid');
    setTimeout(() => outputFileField.classList.remove('is-invalid'), 3000);
    outputFileField.focus();
    return;
  }
  
  // Show user feedback immediately
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
  
  // First validate the input directory
  validateInputDirectory(inputDir)
    .then(validInputResult => {
        // Check if input directory is valid
        if (!validInputResult.isValid) {
            throw new Error(validInputResult.errorMessage || "Invalid input directory");
        }
        
        // If valid, proceed with processing
        return startProcessing(validInputResult.path, outputFile);
    })
    .catch(error => {
        console.error("Directory validation failed:", error);
        showToast('Error', error.message || 'Directory validation failed', 'error');
        
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
    });
}

/**
* Validate the input directory path
* @param {string} inputDir - Directory path to validate
* @returns {Promise<Object>} - Validation result with path and status
*/
async function validateInputDirectory(inputDir) {
  try {
      // Call the enhanced API endpoint to check the path
      const response = await fetch("/api/verify-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
              path: inputDir,
              create_if_missing: false // Don't auto-create
          })
      });
      
      if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.exists && data.isDirectory) {
          // Directory exists
          if (!data.canWrite) {
              // Directory exists but isn't writable
              return {
                  isValid: false,
                  path: data.fullPath,
                  errorMessage: "Directory exists but you don't have permission to write to it."
              };
          }
          
          // Valid directory
          return {
              isValid: true,
              path: data.fullPath
          };
      } else if (!data.exists && data.parentPath) {
          // Directory doesn't exist, but parent does
          if (data.canCreate) {
              // We can create the directory
              const createConfirmed = confirm(
                  `Directory "${inputDir}" does not exist.\n\n` +
                  `Would you like to create it?`
              );
              
              if (createConfirmed) {
                  // User wants to create the directory
                  const createResponse = await fetch("/api/create-directory", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ path: inputDir })
                  });
                  
                  if (!createResponse.ok) {
                      throw new Error(`Failed to create directory: ${createResponse.status}`);
                  }
                  
                  const createData = await createResponse.json();
                  
                  if (createData.success) {
                      showToast('Directory Created', `Created directory: ${createData.path}`, 'success');
                      return {
                          isValid: true,
                          path: createData.path
                      };
                  } else {
                      return {
                          isValid: false,
                          path: inputDir,
                          errorMessage: `Failed to create directory: ${createData.message}`
                      };
                  }
              } else {
                  // User doesn't want to create the directory
                  return {
                      isValid: false,
                      path: inputDir,
                      errorMessage: "Directory doesn't exist and wasn't created"
                  };
              }
          } else {
              // Can't create the directory
              return {
                  isValid: false,
                  path: inputDir,
                  errorMessage: `Cannot create directory "${inputDir}". Please check permissions.`
              };
          }
      } else {
          // No parent directory exists or other error
          return {
              isValid: false,
              path: inputDir,
              errorMessage: "Invalid directory path. Please enter a valid path."
          };
      }
  } catch (error) {
      console.error("Error validating input directory:", error);
      return {
          isValid: false,
          path: inputDir,
          errorMessage: error.message || "Failed to validate directory path"
      };
  }
}

/**
* Initialize input/output relationship for auto-suggestion
*/
function initializeInputOutputRelationship() {
  if (!inputDirField || !outputFileField) return;
  
  // Auto-suggest output filename based on input directory
  inputDirField.addEventListener('change', function() {
      if (this.value.trim() && !outputFileField.value.trim()) {
          // Extract folder name for output suggestion
          const dirPath = this.value.trim();
          const folderName = dirPath.split(/[/\\]/).pop();
          
          if (folderName) {
              outputFileField.value = `${folderName}_processed`;
              outputFileField.classList.add('bg-light');
              setTimeout(() => outputFileField.classList.remove('bg-light'), 1500);
          }
      }
  });
  
  // Initialize default output folder field if present
  const defaultOutputFolderSpan = document.querySelector('.default-output-folder');
  if (defaultOutputFolderSpan) {
      // Fetch default output folder from server
      fetch('/api/get-default-output-folder')
          .then(response => response.json())
          .then(data => {
              if (data.status === 'success' && data.path) {
                  defaultOutputFolderSpan.textContent = data.path;
              }
          })
          .catch(error => {
              console.error("Error fetching default output folder:", error);
          });
  }
}

/** Enhanced Start Processing 
 * @param {string} inputDir - Input directory path
 * @param {string} outputFile - Output filename (without extension)
 */
async function startProcessing(inputDir, outputFile){
  console.log("Starting processing with:", inputDir, outputFile);
  
  try {
    // Show progress UI immediately for better user experience
    showProgress();
    
    // Configure the output path properly - PRIORITY GIVEN TO USER INPUT
    const outputPath = await configureOutputPath(inputDir, outputFile);
    
    // Check if file exists and confirm overwrite
    const canProceed = await checkOutputFileExists(outputPath);
    if (!canProceed) {
      // User cancelled overwrite, return to form
      formContainer.classList.remove('d-none');
      progressContainer.classList.add('d-none');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
      return;
    }
    
    // Create JSON payload
    const payload = {
      input_dir: inputDir,
      output_file: outputPath // Use the full path with user's preference
    };
  
    // Use the /api/process endpoint with proper JSON content
    const response = await fetch("/api/process", { 
      method: "POST", 
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      showError({ error: data.error });
      return;
    }
    
    // Store the task ID for status polling
    currentTaskId = data.task_id;
    
    // Save task information to sessionStorage for persistence
    sessionStorage.setItem('ongoingTaskId', currentTaskId);
    sessionStorage.setItem('ongoingTaskType', 'file');
    sessionStorage.setItem('outputFile', data.output_file);
    
    // Start status polling
    startStatusPolling();
    
    // Show notification
    showToast('Processing Started', 'Your files are being processed', 'info');
    
    console.log('Processing task started:', data);
  } catch (error) {
    console.error('Processing error:', error);
    showError({ error: 'Failed to start processing: ' + error.message });
    
    // Reset form display
    formContainer.classList.remove('d-none');
    progressContainer.classList.add('d-none');
    
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Processing';
  }
}
/**
* Show the main form container.
*/
function showForm() {
  stopStatusPolling();
  formContainer.classList.remove('d-none');
  progressContainer.classList.add('d-none');
  resultContainer.classList.add('d-none');
  errorContainer.classList.add('d-none');
  
  // Clear session storage
  sessionStorage.removeItem('ongoingTaskId');
  sessionStorage.removeItem('ongoingTaskType');
}


/**
* Handle Cancel button click
*/
function handleCancelClick() {
  if (!currentTaskId) return;
  
  // Confirm cancellation
  if (!confirm('Are you sure you want to cancel the current task?')) {
    return;
  }
  
  // Determine which cancel endpoint to use based on active tab
  let cancelEndpoint = `/api/cancel/${currentTaskId}`;
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (activeTab && activeTab.id === 'scraper') {
    cancelEndpoint = `/api/scrape2/cancel/${currentTaskId}`;
  } else if (activeTab && activeTab.id === 'playlist') {
    cancelEndpoint = `/api/cancel/${currentTaskId}`; // Same for playlists
  }
  
  // Call the cancel endpoint
  fetch(cancelEndpoint, { method: 'POST' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Cancel failed: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      showToast('Cancelled', 'Task cancelled successfully', 'warning');
      
      // Determine which form to show based on active tab
      if (activeTab && activeTab.id === 'scraper') {
          scraperProgressContainer.classList.add('d-none');
          scraperFormContainer.classList.remove('d-none');
      } else if (activeTab && activeTab.id === 'playlist') {
          playlistProgressContainer.classList.add('d-none');
          playlistFormContainer.classList.remove('d-none');
      } else {
          // Default tab (file processing)
          showForm();
      }
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    })
    .catch(error => {
      console.error('Cancel error:', error);
      showToast('Error', 'Failed to cancel task: ' + error.message, 'error');
    });
}

/**
* Handle New Task button click - ensure form reset
*/
function handleNewTaskClick() {
  currentTaskId = null;
  showForm();
  
  // Reset form fields
  if (processForm) {
    processForm.reset();
    
    // Also clear any displayed file info
    const fileInfo = document.getElementById('selected-files-info');
    if (fileInfo) {
        fileInfo.innerHTML = '';
    }
  }
  
  showToast('Ready', 'Ready for a new task', 'info');
}

// =============================================================================
// SECTION 8: PLAYLIST DOWNLOADER TAB FUNCTIONALITY
// =============================================================================

/**
 * Add a field for a new playlist
 */
function addPlaylistField() {
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
  container.innerHTML = `
    <input type="url" class="form-control playlist-url" placeholder="Enter YouTube Playlist URL" required />
    <button type="button" class="btn btn-outline-danger remove-url">
      <i class="fas fa-trash"></i>
    </button>
  `;
  playlistUrlsContainer.appendChild(container);
  
  // Set up the remove button event
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    // Don't remove if it's the only one
    if (playlistUrlsContainer.querySelectorAll('.playlist-url').length > 1) {
      playlistUrlsContainer.removeChild(container);
    } else {
      showToast('Warning', 'You need at least one playlist URL', 'warning');
    }
  });
}



// =============================================================================
// SECTION 9: WEB SCRAPER TAB FUNCTIONALITY
// =============================================================================

/**
 * Add a row for the web scraper (URL + setting + optional keyword).
 */
function addScraperUrlField() {
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
  container.innerHTML = `
    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required />
    <select class="form-select scraper-settings" style="max-width: 160px;">
      <option value="full">Full Text</option>
      <option value="metadata">Metadata Only</option>
      <option value="title">Title Only</option>
      <option value="keyword">Keyword Search</option>
      <option value="pdf">PDF Download</option>
    </select>
    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
    <button type="button" class="btn btn-outline-danger remove-url">
      <i class="fas fa-trash"></i>
    </button>
  `;
  scraperUrlsContainer.appendChild(container);
  
  // Set up the settings change event for this new row
  const settingsSelect = container.querySelector('.scraper-settings');
  settingsSelect.addEventListener('change', handleScraperSettingsChange);
  
  // Set up remove button event
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    scraperUrlsContainer.removeChild(container);
    // Update PDF info section visibility after removing a row
    updatePdfInfoSection();
  });
  
  // Update PDF info section visibility after adding a row
  updatePdfInfoSection();
}

/**
 * Handle PDF Info Section Visibility
 */
function updatePdfInfoSection() {
  // Show PDF info section when PDF is selected in any row
  const scraperSettings = document.querySelectorAll('.scraper-settings');
  
  if (!pdfInfoSection) return;
  
  const hasPdfSelected = Array.from(scraperSettings).some(select => select.value === 'pdf');
  
  if (hasPdfSelected) {
    pdfInfoSection.classList.remove('d-none');
  } else {
    pdfInfoSection.classList.add('d-none');
  }
}

/**
 * If setting == "keyword", show the keyword input.
 * Also update PDF info section visibility.
 */
function handleScraperSettingsChange(event) {
  if (!event.target.classList.contains("scraper-settings")) return;
  
  const parentGroup = event.target.closest(".input-group");
  const keywordInput = parentGroup.querySelector(".scraper-keyword");
  
  if (event.target.value === "keyword") {
    keywordInput.style.display = "";
  } else {
    keywordInput.style.display = "none";
    keywordInput.value = "";
  }
  
  // Update PDF info section visibility when settings change
  updatePdfInfoSection();
}

/**
 * Collect the web scraper configurations from the form.
 */
function getScraperConfigs() {
  const configs = [];
  const urlFields = scraperUrlsContainer.querySelectorAll(".scraper-url");
  const settingsFields = scraperUrlsContainer.querySelectorAll(".scraper-settings");
  const keywordFields = scraperUrlsContainer.querySelectorAll(".scraper-keyword");
  
  for (let i = 0; i < urlFields.length; i++) {
    const urlVal = urlFields[i].value.trim();
    if (!urlVal) continue;
    
    const settingVal = settingsFields[i].value;
    const keywordVal = keywordFields[i].value.trim();
    
    configs.push({ 
      url: urlVal, 
      setting: settingVal, 
      keyword: keywordVal 
    });
  }
  
  return configs;
}

/**
 * Handle the scraper form submission
 * FIXED: Now properly handles input directory and output file fields
 */
function handleScraperSubmit(e) {
  e.preventDefault();
  console.log("Scraper form submitted");
  
  // Get input values
  const urlConfigs = getScraperConfigs();
  const downloadDirectory = downloadDirectoryField.value.trim();
  const outputFile = scraperOutputField.value.trim();
  
  // Validate input
  if (urlConfigs.length === 0) {
    showToast('Error', 'Please enter at least one URL', 'error');
    return;
  }
  
  if (!downloadDirectory) {
    showToast('Error', 'Please enter a download directory', 'error');
    downloadDirectoryField.classList.add('is-invalid');
    setTimeout(() => downloadDirectoryField.classList.remove('is-invalid'), 3000);
    downloadDirectoryField.focus();
    return;
  }
  
  if (!outputFile) {
    showToast('Error', 'Please enter an output filename', 'error');
    scraperOutputField.classList.add('is-invalid');
    setTimeout(() => scraperOutputField.classList.remove('is-invalid'), 3000);
    scraperOutputField.focus();
    return;
  }
  
  // Get PDF processing options
  const processPdfs = processPdfSwitch ? processPdfSwitch.checked : true;
  
  // Update button state for visual feedback
  const scrapeBtn = document.getElementById('scrape-btn');
  if (scrapeBtn) {
    scrapeBtn.disabled = true;
    scrapeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
  }
  
  // Verify download directory exists
  fetch('/api/verify-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: downloadDirectory })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.exists) {
      // FIXED: Pass the verified directory path and sanitized output file
      startScraperTask(urlConfigs, data.fullPath, sanitizeFilename(outputFile), processPdfs);
    } else {
      if (confirm(`Directory "${downloadDirectory}" does not exist. Create it?`)) {
        // Create directory and start scraper
        fetch('/api/create-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: downloadDirectory })
        })
        .then(createResponse => createResponse.json())
        .then(createData => {
          if (createData.success) {
            // FIXED: Pass the created directory path and sanitized output file
            startScraperTask(urlConfigs, createData.path, sanitizeFilename(outputFile), processPdfs);
          } else {
            throw new Error(`Failed to create directory: ${createData.message}`);
          }
        })
        .catch(error => {
          showToast('Error', error.message, 'error');
          
          // Reset button state
          if (scrapeBtn) {
            scrapeBtn.disabled = false;
            scrapeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
          }
        });
      } else {
        // Reset button since user canceled
        if (scrapeBtn) {
          scrapeBtn.disabled = false;
          scrapeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
        }
      }
    }
  })
  .catch(error => {
    console.error('Failed to verify path:', error);
    showToast('Error', `Path verification failed: ${error.message}`, 'error');
    
    // Reset button state
    if (scrapeBtn) {
      scrapeBtn.disabled = false;
      scrapeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
    }
  });
}

/**
 * Enhanced function for starting scraper task with proper output path handling
 * @param {Array} urlConfigs - Array of URL configurations
 * @param {string} downloadDirectory - Download directory path
 * @param {string} outputFile - Output filename
 * @param {boolean} processPdfs - Whether to process PDFs
 */
function startScraperTask(urlConfigs, downloadDirectory, outputFile, processPdfs) {
  // FIXED: Ensure outputFile doesn't have .json extension (backend adds it)
  if (outputFile.toLowerCase().endsWith('.json')) {
    outputFile = outputFile.slice(0, -5);
  }
  
  // Prepare the payload with explicit output directory
  const payload = {
    urls: urlConfigs,
    download_directory: downloadDirectory, // User-specified directory is priority #1
    outputFilename: outputFile, // User-specified filename is priority #1
    pdf_options: {
      process_pdfs: processPdfs,
      extract_tables: true,
      use_ocr: true,
      extract_structure: true,
      chunk_size: 4096
    }
  };
  
  console.log("Starting scraper with payload:", payload);
  
  // Show the progress container
  scraperFormContainer.classList.add('d-none');
  scraperProgressContainer.classList.remove('d-none');
  
  // Reset progress elements
  if (scraperProgressBar) updateProgressBarElement(scraperProgressBar, 0);
  if (scraperProgressStatus) updateProgressStatus(scraperProgressStatus, "Initializing scraper...");
  if (scraperProgressStats) scraperProgressStats.innerHTML = "";
  
  // Clear any previous PDF downloads
  if (pdfDownloadsList) pdfDownloadsList.innerHTML = "";
  if (pdfDownloadProgress) pdfDownloadProgress.classList.add('d-none');
  
  // Call API to start scraper
  fetch('/api/scrape2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      handleScraperError(data.error);
      return;
    }
    
    // Store the task ID
    currentTaskId = data.task_id;
    
    // Save task info to sessionStorage
    sessionStorage.setItem('ongoingTaskId', currentTaskId);
    sessionStorage.setItem('ongoingTaskType', 'scraper');
    if (data.output_file) {
      sessionStorage.setItem('outputFile', data.output_file);
    }
    
    // Start status polling
    startStatusPolling();
    
    // Show notification
    showToast('Scraping Started', 'Web scraping process has started', 'info');
  })
  .catch(error => {
    console.error('Scraper error:', error);
    handleScraperError('Failed to start scraper: ' + error.message);
  })
  .finally(() => {
    // Reset button state
    const scrapeBtn = document.getElementById('scrape-btn');
    if (scrapeBtn) {
      scrapeBtn.disabled = false;
      scrapeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Scraping';
    }
  });
}

/**
 * Ensure all progress-related functions are properly initialized
 */
function ensureProgressFunctionsInitialized() {
  console.log("Ensuring progress functions are initialized...");
  
  // Check if updateProgressBarElement function exists, or define our version
  if (typeof updateProgressBarElement !== 'function') {
      console.warn("updateProgressBarElement function not found, defining it now");
      window.updateProgressBarElement = function(barElement, targetPercent) {
          // Function implementation as provided above
          // ...
      };
  }
  
  // Make sure progress elements are available
  const progressBar = document.getElementById('progress-bar');
  const progressStatus = document.getElementById('progress-status');
  const progressStats = document.getElementById('progress-stats');
  
  if (!progressBar) {
      console.error("Progress bar element not found!");
  }
  
  if (!progressStatus) {
      console.error("Progress status element not found!");
  }
  
  if (!progressStats) {
      console.error("Progress stats element not found!");
  }
  
  // Check socket connection
  if (!socket || !socket.connected) {
      console.warn("Socket not connected, trying to reconnect...");
      initializeSocket();
  }
  
  // Add debug keyboard shortcut
  document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
          toggleDebugMode();
      }
  });
  
  console.log("Progress functions initialization check complete");
}
/**
 * Monitor progress events to help debug stalling
 */
function monitorProgressEvents() {
  const debugContent = document.getElementById('debug-content');
  if (!debugContent) return;
  
  // Track last progress value
  let lastProgress = 0;
  let stuckCount = 0;
  
  // Function to log debug info
  function logDebug(message) {
      const entry = document.createElement('div');
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      debugContent.appendChild(entry);
      
      // Limit entries
      if (debugContent.children.length > 100) {
          debugContent.removeChild(debugContent.firstChild);
      }
      
      // Auto-scroll
      debugContent.scrollTop = debugContent.scrollHeight;
  }
  
  // Override socket.on to monitor events
  if (socket) {
      const originalOn = socket.on;
      socket.on = function(event, callback) {
          const wrappedCallback = function() {
              const args = arguments;
              if (event === 'progress_update') {
                  try {
                      const data = args[0];
                      if (data && data.task_id === currentTaskId) {
                          // Log progress info
                          logDebug(`Progress update: ${data.progress}%, msg: ${data.message || 'none'}`);
                          
                          // Check for stalled progress
                          if (data.progress === lastProgress) {
                              stuckCount++;
                              if (stuckCount >= 5) {
                                  logDebug(`⚠️ Progress appears stuck at ${data.progress}%`);
                              }
                          } else {
                              stuckCount = 0;
                              lastProgress = data.progress;
                          }
                      }
                  } catch (e) {
                      logDebug(`Error parsing progress: ${e.message}`);
                  }
              }
              return callback.apply(this, args);
          };
          
          return originalOn.call(this, event, wrappedCallback);
      };
  }
  
  // Check progress bar value periodically
  setInterval(() => {
      if (progressBar) {
          const currentWidth = progressBar.style.width;
          const currentValue = progressBar.getAttribute('aria-valuenow');
          logDebug(`Progress bar state: width=${currentWidth}, value=${currentValue}`);
      }
  }, 3000);
  
  // Log initial message
  logDebug('Debug monitoring started');
  
  // Add keyboard shortcut to toggle
  document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
          toggleDebugMode();
      }
  });
}
/**
 * Toggle debug mode to help troubleshoot progress issues
 */
function toggleDebugMode() {
  // Create debug overlay if it doesn't exist
  let debugOverlay = document.getElementById('debug-overlay');
  
  if (!debugOverlay) {
      debugOverlay = document.createElement('div');
      debugOverlay.id = 'debug-overlay';
      debugOverlay.style.cssText = `
          position: fixed;
          bottom: 0;
          right: 0;
          width: 300px;
          max-height: 300px;
          overflow-y: auto;
          background-color: rgba(0,0,0,0.8);
          color: #fff;
          padding: 10px;
          font-family: monospace;
          font-size: 12px;
          z-index: 9999;
          border-top-left-radius: 5px;
      `;
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = 'X';
      closeBtn.style.cssText = `
          position: absolute;
          top: 5px;
          right: 5px;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
      `;
      closeBtn.onclick = function() {
          debugOverlay.remove();
      };
      
      debugOverlay.appendChild(closeBtn);
      
      // Add content container
      const content = document.createElement('div');
      content.id = 'debug-content';
      debugOverlay.appendChild(content);
      
      // Add to body
      document.body.appendChild(debugOverlay);
      
      // Start monitoring progress events
      monitorProgressEvents();
  } else {
      // Toggle visibility
      debugOverlay.style.display = debugOverlay.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * Set up Socket.IO event listeners for progress updates
 * Ensuring full alignment with ProcessingTask class from server
 */
function setupSocketListeners() {
  if (!socket) {
      console.error("Socket not initialized, cannot set up listeners");
      return;
  }
  
  // Listen for progress updates - properly formatted to match server
  socket.on('progress_update', function(data) {
      console.log('Raw progress_update received:', data); // Log for debugging
      
      if (data.task_id === currentTaskId) {
          // Handle different formats the server might send
          let progress = data.progress;
          let message = data.message || '';
          
          // Server might send progress as a string, ensure it's numeric
          if (typeof progress === 'string') {
              progress = parseFloat(progress);
          }
          
          // Check for nested progress structure
          if (progress === undefined && data.detailed_progress) {
              if (data.detailed_progress.progress_percent !== undefined) {
                  progress = data.detailed_progress.progress_percent;
              } else if (data.detailed_progress.processed_count !== undefined && 
                         data.detailed_progress.total_count !== undefined && 
                         data.detailed_progress.total_count > 0) {
                  progress = Math.round((data.detailed_progress.processed_count / 
                                       data.detailed_progress.total_count) * 100);
              }
              
              if (!message && data.detailed_progress.stage) {
                  message = data.detailed_progress.stage;
              }
          }
          
          // Log the parsed values
          console.log('Parsed progress update:', progress, message);
          
          // Update UI with the progress information
          if (progress !== undefined && !isNaN(progress)) {
              if (progressBar) {
                  updateProgressBarElement(progressBar, progress);
              }
              
              if (progressStatus) {
                  updateProgressStatus(progressStatus, message || 'Processing...');
              }
              
              if (data.stats && progressStats) {
                  updateProgressStats(progressStats, data.stats);
              }
          }
      }
  });
  
  // Enhanced completion handling
  socket.on('task_completed', function(data) {
      if (data.task_id === currentTaskId) {
          console.log('Task completed event received:', data);
          
          // Ensure progress shows 100%
          if (progressBar) {
              updateProgressBarElement(progressBar, 100);
          }
          
          // Stop polling
          stopStatusPolling();
          
          // Show result
          showResult(data);
      }
  });
  
  // Enhanced error handling
  socket.on('task_error', function(data) {
      if (data.task_id === currentTaskId) {
          console.log('Task error event received:', data);
          
          // Stop polling
          stopStatusPolling();
          
          // Show error
          showError(data);
      }
  });
}
/**
 * Add debug hooks to monitor socket events
 */
function addSocketDebugging() {
  if (!socket) return;
  
  // Save original emit function
  const originalEmit = socket.emit;
  
  // Override to log all emits
  socket.emit = function() {
      console.log("Socket EMIT:", arguments);
      return originalEmit.apply(this, arguments);
  };
  
  // Add global socket event listener
  const originalOn = socket.on;
  socket.on = function(event, callback) {
      // Wrap the callback to log events
      const wrappedCallback = function() {
          console.log(`Socket ON [${event}]:`, arguments);
          return callback.apply(this, arguments);
      };
      
      return originalOn.call(this, event, wrappedCallback);
  };
  
  console.log("Socket debugging enabled");
}
/**
 * Format and display scraper results with improved transitions
 * FIXED: Called immediately when progress reaches 100%
 */
function formatAndDisplayScraperResults(data) {
  // Already handled by another call
  if (window.resultsDisplayed) return;
  window.resultsDisplayed = true;
  
  // Add fade transitions
  scraperProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    // Hide progress container
    scraperProgressContainer.classList.add('d-none');
    scraperProgressContainer.classList.remove('fade-out');
    
    // Show results container with animation
    scraperResultsContainer.classList.remove('d-none');
    scraperResultsContainer.classList.add('fade-in');
    
    // Format the stats in a user-friendly way
    if (scraperStats) {
      updateScraperStats(scraperStats, data.stats, data.output_file);
    }
    
    // Update the "Open JSON" button data attributes
    const openBtn = document.getElementById('open-scraper-json');
    if (openBtn && data.output_file) {
      openBtn.setAttribute('data-output-file', data.output_file);
      openBtn.setAttribute('data-task-id', currentTaskId);
    }
    
    // Update the "Open Folder" button if available
    const openFolderBtn = document.getElementById('open-output-folder');
    if (openFolderBtn && data.output_folder) {
      openFolderBtn.setAttribute('data-folder', data.output_folder);
    }
    
    setTimeout(() => {
      scraperResultsContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    
    // Add task to history
    addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
  }, 300);
}

/**
 * Handle scraper error
 */
function handleScraperError(error) {
  // Show error message
  showToast('Error', error, 'error');
  
  // Return to form view
  scraperProgressContainer.classList.add('d-none');
  scraperFormContainer.classList.remove('d-none');
  
  // Clear any session storage
  sessionStorage.removeItem('ongoingTaskId');
  sessionStorage.removeItem('ongoingTaskType');
}

// Add these event listeners to main.js to properly handle PDF processing events

// In the Socket.IO connection setup section, add these listeners:
socket.on('pdf_processing_progress', function(data) {
  if (data.task_id === currentTaskId) {
    console.log('PDF processing progress:', data.progress + '%', data.message || '');
    
    // Update the appropriate progress bar based on active tab
    const activeTab = document.querySelector('.tab-pane.active');
    
    if (activeTab && activeTab.id === 'scraper') {
      updateProgressBarElement(scraperProgressBar, data.progress);
      if (scraperProgressStatus && data.message) {
        scraperProgressStatus.textContent = data.message;
      }
    } else {
      // Default tab progress updates
      if (progressBar) {
        updateProgressBarElement(progressBar, data.progress);
      }
      if (progressStatus && data.message) {
        updateProgressStatus(progressStatus, data.message);
      }
    }
  }
});

socket.on('pdf_processing_complete', function(data) {
  if (data.task_id === currentTaskId) {
    console.log('PDF processing complete:', data);
    
    // Determine which tab is active and handle accordingly
    const activeTab = document.querySelector('.tab-pane.active');
    
    if (activeTab && activeTab.id === 'scraper') {
      formatAndDisplayScraperResults(data);
    } else {
      // Handle default tab completion
      showResult(data);
    }
    
    // Add task to history
    addTaskToHistory(getCurrentTaskType(), data.output_path, data.stats);
    showToast('Success', 'PDF processing completed successfully!', 'success');
  }
});

socket.on('pdf_processing_error', function(data) {
  if (data.task_id === currentTaskId) {
    console.error('PDF processing error:', data);
    
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-pane.active');
    
    if (activeTab && activeTab.id === 'scraper') {
      // Handle scraper error
      scraperProgressContainer.classList.add("d-none");
      scraperResultsContainer.classList.remove("d-none");
      
      if (scraperResults) {
        scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
      }
    } else {
      // Handle default tab error
      showError(data);
    }
    
    showToast('Error', data.error || 'An error occurred', 'error');
  }
});

/**
 * Add a PDF download item to the list
 * @param {Object} pdf - PDF download info
 * @returns {HTMLElement} - The created item
 */
function addPdfDownloadItem(pdf) {
  if (!pdfDownloadsList) return null;
  
  // Create a unique ID for this download item
  const itemId = 'pdf-item-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  // Get filename from URL or use placeholder
  const filename = pdf.url.split('/').pop() || 'document.pdf';
  
  // Get status or default to downloading
  const status = pdf.status || 'downloading';
  
  // Status badge classes
  let badgeClass, badgeText;
  switch (status) {
    case 'success':
      badgeClass = 'bg-success';
      badgeText = 'Downloaded';
      break;
    case 'error':
      badgeClass = 'bg-danger';
      badgeText = 'Failed';
      break;
    case 'processing':
      badgeClass = 'bg-info';
      badgeText = 'Processing';
      break;
    default:
      badgeClass = 'bg-info';
      badgeText = 'Downloading';
  }
  
  // Create item element
  const item = document.createElement('li');
  item.className = 'list-group-item pdf-download-item';
  item.id = itemId;
  item.setAttribute('data-status', status);
  item.setAttribute('data-url', pdf.url);
  
  // Progress bar for downloading/processing state
  const progressBar = status === 'downloading' || status === 'processing' ? 
    `<div class="progress mt-1">
      <div class="progress-bar progress-bar-striped progress-bar-animated ${badgeClass}" 
        role="progressbar" style="width: ${pdf.progress || 50}%" aria-valuenow="${pdf.progress || 50}" aria-valuemin="0" 
        aria-valuemax="100"></div>
    </div>` : '';
  
  // Build item HTML
  item.innerHTML = `
    <div>
      <span class="pdf-item-title" title="${pdf.url}">${filename}</span>
      <span class="badge ${badgeClass} status-badge">${badgeText}</span>
      ${progressBar}
    </div>
    <div class="pdf-actions mt-1">
      ${status === 'success' ? 
        `<button class="btn btn-sm btn-outline-success view-pdf-btn" data-path="${pdf.filePath || ''}" title="View PDF">
          <i class="fas fa-eye"></i>
        </button>` : ''}
      ${status === 'error' ? 
        `<button class="btn btn-sm btn-outline-warning retry-pdf-btn" data-url="${pdf.url}" title="Retry">
          <i class="fas fa-redo"></i>
        </button>` : ''}
    </div>
  `;
  
  // Add to list
  pdfDownloadsList.appendChild(item);
  
  // Add event listeners for buttons
  if (status === 'success') {
    const viewBtn = item.querySelector('.view-pdf-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', function() {
        const pdfPath = this.getAttribute('data-path');
        if (pdfPath) {
          openPdfViewer(pdfPath);
        }
      });
    }
  }
  
  if (status === 'error') {
    const retryBtn = item.querySelector('.retry-pdf-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function() {
        const url = this.getAttribute('data-url');
        if (url) {
          retryPdfDownload(url, itemId);
        }
      });
    }
  }
  
  return item;
}

/**
 * Update PDF download status with improved visual feedback
 */
function updatePdfDownloadStatus(itemId, status, filePath = '') {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  // Update data-status attribute with animation
  item.classList.add('fade-out');
  
  setTimeout(() => {
    // Update data-status attribute
    item.setAttribute('data-status', status);
    
    // Remove existing progress bar if any
    const progressBar = item.querySelector('.progress');
    if (progressBar) {
      progressBar.remove();
    }
    
    // Remove existing buttons
    const actions = item.querySelector('.pdf-actions');
    if (actions) {
      actions.innerHTML = '';
    }
    
    // Update status badge
    const badge = item.querySelector('.status-badge');
    if (badge) {
      badge.className = 'badge status-badge';
      
      switch (status) {
        case 'success':
          badge.classList.add('bg-success');
          badge.textContent = 'Downloaded';
          
          // Add view button
          if (actions && filePath) {
            actions.innerHTML = `
              <button class="btn btn-sm btn-outline-success view-pdf-btn" data-path="${filePath}" title="View PDF">
                <i class="fas fa-eye"></i>
              </button>
            `;
            
            // Add event listener
            const viewBtn = actions.querySelector('.view-pdf-btn');
            viewBtn.addEventListener('click', function() {
              openPdfViewer(filePath);
            });
          }
          break;
          
        case 'error':
          badge.classList.add('bg-danger');
          badge.textContent = 'Failed';
          
          // Add retry button
          if (actions) {
            const url = item.querySelector('.pdf-item-title').getAttribute('title');
            actions.innerHTML = `
              <button class="btn btn-sm btn-outline-warning retry-pdf-btn" data-url="${url}" title="Retry">
                <i class="fas fa-redo"></i>
              </button>
            `;
            
            // Add event listener
            const retryBtn = actions.querySelector('.retry-pdf-btn');
            retryBtn.addEventListener('click', function() {
              retryPdfDownload(url, itemId);
            });
          }
          break;
          
        default:
          badge.classList.add('bg-info');
          badge.textContent = 'Downloading';
          
          // Add progress bar
          const progressContainer = document.createElement('div');
          progressContainer.className = 'progress';
          progressContainer.innerHTML = `
            <div class="progress-bar progress-bar-striped progress-bar-animated bg-info" 
              role="progressbar" style="width: 100%" aria-valuenow="100" aria-valuemin="0" 
              aria-valuemax="100"></div>
          `;
          
          item.querySelector('div:first-child').appendChild(progressContainer);
      }
    }
    
    // Restore visibility with animation
    item.classList.remove('fade-out');
    item.classList.add('fade-in');
    
    setTimeout(() => {
      item.classList.remove('fade-in');
    }, 300);
  }, 300);
}

/**
 * Handle PDF downloads updates
 * @param {Array} pdfDownloads - Array of PDF download status objects
 */
function handlePdfDownloadsUpdate(pdfDownloads) {
  // Show the PDF downloads section if not visible
  if (pdfDownloadProgress) {
    pdfDownloadProgress.classList.remove('d-none');
  }
  
  // Check if we have a downloads list container
  if (!pdfDownloadsList) return;
  
  // Process each PDF download
  pdfDownloads.forEach(pdf => {
    // First look for existing download item
    const existingItems = pdfDownloadsList.querySelectorAll('.pdf-download-item');
    let existingItem = null;
    
    // Find matching item by URL
    for (const item of existingItems) {
      const titleEl = item.querySelector('.pdf-item-title');
      if (titleEl && titleEl.getAttribute('title') === pdf.url) {
        existingItem = item;
        break;
      }
    }
    
    if (existingItem) {
      // Update existing item
      updatePdfDownloadItem(existingItem, pdf);
    } else {
      // Create a new item
      addPdfDownloadItem(pdf);
    }
  });
  
  // Update summary counts if available
  updatePdfDownloadSummary(pdfDownloads);
}

/**
 * Open PDF viewer
 */
function openPdfViewer(pdfPath) {
  // Use the existing PDF viewer modal
  const pdfViewerModal = document.getElementById('pdfViewerModal');
  const pdfViewerContainer = document.getElementById('pdf-viewer-container');
  const pdfViewerModalLabel = document.getElementById('pdfViewerModalLabel');
  const downloadPdfBtn = document.getElementById('download-pdf-btn');
  
  if (!pdfViewerModal || !pdfViewerContainer) {
      console.error('PDF viewer elements not found');
      return;
  }
  
  // Clear previous content
  pdfViewerContainer.innerHTML = '';
  
  // Set modal title
  if (pdfViewerModalLabel) {
      const filename = pdfPath.split('/').pop() || 'PDF Viewer';
      pdfViewerModalLabel.textContent = filename;
  }
  
  // Show loading indicator
  pdfViewerContainer.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i><p class="mt-3">Loading PDF...</p></div>';
  
  // Show modal
  const modal = new bootstrap.Modal(pdfViewerModal);
  modal.show();
  
  // Try to load PDF using PDF.js
  if (typeof pdfjsLib !== 'undefined') {
      // Get PDF URL
      const pdfUrl = `/download-pdf/${encodeURIComponent(pdfPath)}`;
      
      // Load PDF
      pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
          // Clear loading indicator
          pdfViewerContainer.innerHTML = '';
          
          // Add navigation controls
          const navControls = document.createElement('div');
          navControls.className = 'pdf-nav-controls sticky-top d-flex justify-content-center align-items-center bg-light p-2 mb-3';
          navControls.innerHTML = `
              <div class="btn-group">
                  <button id="prev-page" class="btn btn-outline-primary"><i class="fas fa-chevron-left"></i></button>
                  <span class="btn btn-outline-secondary disabled">Page <span id="page-num">1</span> / <span id="page-count">${pdf.numPages}</span></span>
                  <button id="next-page" class="btn btn-outline-primary"><i class="fas fa-chevron-right"></i></button>
              </div>
              <div class="mx-3">
                  <select id="zoom-select" class="form-select form-select-sm">
                      <option value="0.5">50%</option>
                      <option value="0.75">75%</option>
                      <option value="1" selected>100%</option>
                      <option value="1.25">125%</option>
                      <option value="1.5">150%</option>
                      <option value="2">200%</option>
                  </select>
              </div>
          `;
          pdfViewerContainer.appendChild(navControls);
          
          // Create container for pages
          const pagesContainer = document.createElement('div');
          pagesContainer.className = 'pdf-pages-container';
          pdfViewerContainer.appendChild(pagesContainer);
          
          let currentPage = 1;
          let currentScale = 1;
          
          // Function to render a page
          function renderPage(pageNum, scale = currentScale) {
              pdf.getPage(pageNum).then(page => {
                  const viewport = page.getViewport({ scale });
                  
                  // Create canvas for this page
                  const canvas = document.createElement('canvas');
                  canvas.className = 'pdf-page';
                  canvas.width = viewport.width;
                  canvas.height = viewport.height;
                  
                  // Add or replace in container
                  const pageContainer = document.getElementById(`pdf-page-${pageNum}`) || document.createElement('div');
                  pageContainer.id = `pdf-page-${pageNum}`;
                  pageContainer.className = 'text-center mb-4';
                  pageContainer.innerHTML = '';
                  pageContainer.appendChild(canvas);
                  
                  if (!document.getElementById(`pdf-page-${pageNum}`)) {
                      pagesContainer.appendChild(pageContainer);
                  }
                  
                  // Render PDF page
                  const context = canvas.getContext('2d');
                  const renderContext = {
                      canvasContext: context,
                      viewport: viewport
                  };
                  
                  page.render(renderContext);
              });
          }
          
          // Initial render of first page
          renderPage(currentPage);
          
          // Set up navigation
          document.getElementById('prev-page').addEventListener('click', () => {
              if (currentPage <= 1) return;
              currentPage--;
              renderPage(currentPage);
              document.getElementById('page-num').textContent = currentPage;
          });
          
          document.getElementById('next-page').addEventListener('click', () => {
              if (currentPage >= pdf.numPages) return;
              currentPage++;
              renderPage(currentPage);
              document.getElementById('page-num').textContent = currentPage;
          });
          
          // Add event listener for zoom
          document.getElementById('zoom-select').addEventListener('change', (e) => {
              currentScale = parseFloat(e.target.value);
              renderPage(currentPage, currentScale);
          });
      }).catch(error => {
          console.error('Error loading PDF:', error);
          pdfViewerContainer.innerHTML = '<div class="alert alert-danger">Failed to load PDF. Please try downloading it instead.</div>';
      });
  } else {
      // PDF.js not available
      pdfViewerContainer.innerHTML = '<div class="alert alert-warning">PDF viewer not available. Please try downloading the file.</div>';
  }
  
  // Setup download button
  if (downloadPdfBtn) {
      downloadPdfBtn.onclick = function() {
          window.location.href = `/download-file/${encodeURIComponent(pdfPath)}`;
      };
  }
}

/**
 * Scraper cancel handler - revert UI to form.
 */
function handleScraperCancelClick() {
  if (currentTaskId) {
      // Try to cancel the task on the server
      fetch(`/api/scrape2/cancel/${currentTaskId}`, { method: 'POST' })
        .catch(err => console.error('Error canceling task:', err));
  }
  
  scraperProgressContainer.classList.add("d-none");
  scraperFormContainer.classList.remove("d-none");
  scraperResultsContainer.classList.add("d-none");
  
  if (scraperProgressBar) {
      scraperProgressBar.style.width = "0%";
      scraperProgressBar.textContent = "0%";
  }
  
  if (scraperProgressStatus) {
      scraperProgressStatus.textContent = "Processing cancelled.";
  }
  
  showToast('Cancelled', 'Scraping task cancelled', 'warning');
  
// Clear session storage
sessionStorage.removeItem('ongoingTaskId');
sessionStorage.removeItem('ongoingTaskType');
}

/**
* Handle opening the output folder
*/
function handleOpenOutputFolder() {
const btn = document.getElementById('open-output-folder');
if (!btn) return;

const folderPath = btn.getAttribute('data-folder');
if (!folderPath) {
    showToast('Error', 'No folder path available', 'error');
    return;
}

fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast('Success', 'Folder opened successfully', 'success');
    } else {
      showToast('Error', data.error || 'Failed to open folder', 'error');
    }
  })
  .catch(err => {
    console.error('Error opening folder:', err);
    showToast('Error', 'Failed to open folder: ' + err.message, 'error');
  });
}

/**
* Reset the scraper UI for a new task
*/
function handleScraperNewTask() {
// Reset the current task ID
currentTaskId = null;

// Reset the UI elements
scraperResultsContainer.classList.add('d-none');
scraperFormContainer.classList.remove('d-none');

// Clear any previous results
if (scraperResults) {
    scraperResults.textContent = '';
}

// Reset scraper stats
if (scraperStats) {
    scraperStats.innerHTML = '';
}

// Reset the form
scraperForm.reset();

// Clear URL inputs except the first one
const urlRows = scraperUrlsContainer.querySelectorAll('.input-group');
if (urlRows.length > 1) {
    for (let i = urlRows.length - 1; i > 0; i--) {
        urlRows[i].remove();
    }
}

// Reset the first URL input
const firstUrlInput = scraperUrlsContainer.querySelector('.scraper-url');
if (firstUrlInput) firstUrlInput.value = '';

// Reset any visible keyword inputs
const keywordInputs = scraperUrlsContainer.querySelectorAll('.scraper-keyword');
keywordInputs.forEach(input => {
    input.value = '';
    input.style.display = 'none';
});

// Reset the settings to "full"
const settingsInputs = scraperUrlsContainer.querySelectorAll('.scraper-settings');
settingsInputs.forEach(select => {
    select.value = 'full';
});

// Update PDF info section visibility
updatePdfInfoSection();

showToast('Ready', 'Ready for a new scraping task', 'info');
}

// =============================================================================
// SECTION 10: TASK HISTORY MANAGEMENT
// =============================================================================

/**
 * Initialize history tab elements and event listeners
 */
function initializeHistoryTab() {
  // Setup History tab event listeners
  if (historySearch) {
    historySearch.addEventListener('input', refreshHistoryTable);
  }

  if (historyFilter) {
    historyFilter.addEventListener('change', refreshHistoryTable);
  }

  if (historySort) {
    historySort.addEventListener('change', refreshHistoryTable);
  }

  if (historyRefreshBtn) {
    historyRefreshBtn.addEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
  }

  if (historyClearBtn) {
    historyClearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
  }
  
  // Initial load of task history
  loadTaskHistoryFromStorage();
}

/**
 * Add a task to the task history (enhanced)
 */
function addTaskToHistory(taskType, outputFile, stats) {
  // Get existing history from localStorage
  let history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Add new task to the beginning of the array
  history.unshift({
    taskType,
    outputFile,
    stats: stats || {},
    timestamp: Date.now()
  });
  
  // Limit history to 50 items (increased from 10)
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  
  // Save back to localStorage
  localStorage.setItem('taskHistory', JSON.stringify(history));
  
  // Refresh history table if visible
  if (document.querySelector('#history.active')) {
    refreshHistoryTable();
  }
}

/**
 * Load task history from localStorage and display it
 */
function loadTaskHistoryFromStorage() {
  // Get history from localStorage
  const history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Clear current history display
  if (historyTableBody) {
    // Make a local copy of history for filtering and sorting
    let displayHistory = [...history];
    
    // Apply search filter if provided
    if (historySearch && historySearch.value.trim()) {
      const searchTerm = historySearch.value.trim().toLowerCase();
      displayHistory = displayHistory.filter(task => {
        return (
          (task.outputFile && task.outputFile.toLowerCase().includes(searchTerm)) ||
          (task.taskType && task.taskType.toLowerCase().includes(searchTerm))
        );
      });
    }
    
    // Apply type filter if not "all"
    if (historyFilter && historyFilter.value !== 'all') {
      const filterType = historyFilter.value;
      displayHistory = displayHistory.filter(task => task.taskType === filterType);
    }
    
    // Apply sorting
    if (historySort) {
      const sortOrder = historySort.value;
      displayHistory.sort((a, b) => {
        if (sortOrder === 'oldest') {
          return a.timestamp - b.timestamp;
        } else {
          return b.timestamp - a.timestamp; // newest first (default)
        }
      });
    }
    
    // Clear and update the table
    historyTableBody.innerHTML = '';
    
    // If no history or all filtered out, show empty state
    if (displayHistory.length === 0) {
      historyTableBody.innerHTML = `
        <tr class="history-empty-row">
          <td colspan="5" class="text-center py-4">
            <i class="fas fa-info-circle me-2"></i>No tasks in history
          </td>
        </tr>
      `;
      return;
    }
    
    // Add each task to the table
    displayHistory.forEach((task, index) => {
      // Add task row to the table
      addTaskToHistoryTable(task, index);
    });
  }
  
  // Update PDF summaries
  updatePdfSummaries();
}

/**
 * Add a single task to the history table
 */
function addTaskToHistoryTable(task, index) {
  if (!historyTableBody) return;
  
  const row = document.createElement('tr');
  row.setAttribute('data-task-index', index);
  
  // Format the timestamp
  const date = new Date(task.timestamp);
  const formattedDate = date.toLocaleString();
  
  // Format the task type with icon
  let icon, typeText, typeBadgeClass;
  switch (task.taskType) {
    case 'scraper':
      icon = 'fa-globe';
      typeText = 'Web Scraper';
      typeBadgeClass = 'bg-info';
      break;
    case 'playlist':
      icon = 'fa-play-circle';
      typeText = 'Playlist';
      typeBadgeClass = 'bg-warning';
      break;
    default:
      icon = 'fa-file-alt';
      typeText = 'File Processor';
      typeBadgeClass = 'bg-primary';
  }
  
  // Format some key statistics
  const fileCount = task.stats.processed_files || task.stats.total_files || 'N/A';
  const duration = formatDuration(task.stats.duration_seconds || 0);
  const fileSize = formatBytes(task.stats.total_bytes || 0);
  
  // Create file path display with truncation
  const filePath = task.outputFile || 'Unknown file';
  const fileName = filePath.split(/[\\/]/).pop();
  const truncatedPath = filePath.length > 40 ? '...' + filePath.slice(-40) : filePath;
  
  // Build the row HTML
  row.innerHTML = `
    <td>
      <span class="badge ${typeBadgeClass} me-1">
        <i class="fas ${icon}"></i>
      </span>
      ${typeText}
    </td>
    <td class="text-truncate" style="max-width: 200px;" title="${filePath}">
      ${fileName}
    </td>
    <td>
      <span title="${formattedDate}">${formatRelativeTime(task.timestamp)}</span>
    </td>
    <td>
      <small>
        Files: ${fileCount} | Size: ${fileSize} | Duration: ${duration}
      </small>
    </td>
    <td>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-sm btn-outline-primary view-history-details" title="View Details">
          <i class="fas fa-info-circle"></i>
        </button>
        <button class="btn btn-sm btn-outline-success open-history-file" data-path="${task.outputFile}" title="Open File">
          <i class="fas fa-folder-open"></i>
        </button>
      </div>
    </td>
  `;
  
  // Add event listeners for buttons
  const viewDetailsBtn = row.querySelector('.view-history-details');
  if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener('click', () => {
      showTaskDetails(task);
    });
  }
  
  const openFileBtn = row.querySelector('.open-history-file');
  if (openFileBtn) {
    openFileBtn.addEventListener('click', () => {
      const filePath = openFileBtn.getAttribute('data-path');
      if (filePath) {
        openFileByPath(filePath);
      }
    });
  }
  
  // Add row to the table
  historyTableBody.appendChild(row);
}

/**
 * Show task details in a modal
 */
function showTaskDetails(task) {
  const taskDetailsContent = document.getElementById('task-details-content');
  const openTaskFileBtn = document.getElementById('open-task-file-btn');
  
  if (!taskDetailsContent || !openTaskFileBtn) return;
  
  // Set the output file path for the open button
  openTaskFileBtn.setAttribute('data-path', task.outputFile || '');
  
  // Format date/time
  const date = new Date(task.timestamp);
  const formattedDate = date.toLocaleString();
  
  // Determine task type and icon
  let icon, typeText;
  switch (task.taskType) {
    case 'scraper':
      icon = 'fa-globe';
      typeText = 'Web Scraper';
      break;
    case 'playlist':
      icon = 'fa-play-circle';
      typeText = 'Playlist';
      break;
    default:
      icon = 'fa-file-alt';
      typeText = 'File Processor';
  }
  
  // Create HTML content for the task details
  let detailsHtml = `
    <div class="mb-3">
      <h6 class="border-bottom pb-2 mb-3">Task Information</h6>
      <table class="table table-sm">
        <tr>
          <th style="width: 120px;">Type:</th>
          <td><i class="fas ${icon} me-1"></i> ${typeText}</td>
        </tr>
        <tr>
          <th>Output File:</th>
          <td class="text-break">${task.outputFile || 'Unknown'}</td>
        </tr>
        <tr>
          <th>Timestamp:</th>
          <td>${formattedDate}</td>
        </tr>
      </table>
    </div>
  `;
  
  // Add statistics section if available
  if (task.stats && Object.keys(task.stats).length > 0) {
    detailsHtml += `
      <div class="mb-3">
        <h6 class="border-bottom pb-2 mb-3">Statistics</h6>
        <div class="row g-2">
    `;
    
    // Add standard statistics with consistent formatting
    if (task.stats.total_files !== undefined) {
      detailsHtml += createStatCard('Total Files', task.stats.total_files, 'fa-files');
    }
    
    if (task.stats.processed_files !== undefined) {
      detailsHtml += createStatCard('Processed Files', task.stats.processed_files, 'fa-check-circle');
    }
    
    if (task.stats.skipped_files !== undefined) {
      detailsHtml += createStatCard('Skipped Files', task.stats.skipped_files, 'fa-step-forward');
    }
    
    if (task.stats.error_files !== undefined) {
      detailsHtml += createStatCard('Error Files', task.stats.error_files, 'fa-exclamation-circle');
    }
    
    if (task.stats.total_chunks !== undefined) {
      detailsHtml += createStatCard('Total Chunks', task.stats.total_chunks, 'fa-cubes');
    }
    
    if (task.stats.total_bytes !== undefined) {
      detailsHtml += createStatCard('Total Size', formatBytes(task.stats.total_bytes), 'fa-database');
    }
    
    if (task.stats.duration_seconds !== undefined) {
      detailsHtml += createStatCard('Duration', formatDuration(task.stats.duration_seconds), 'fa-clock');
    }
    
    detailsHtml += `
        </div>
      </div>
    `;
    
    // Add JSON View button to see all stats
    detailsHtml += `
      <div class="mt-3">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#taskJsonDetails">
          <i class="fas fa-code me-1"></i> View Raw JSON
        </button>
        <div class="collapse mt-2" id="taskJsonDetails">
          <div class="card card-body">
            <pre class="mb-0"><code class="language-json">${formatJsonForDisplay({stats: task.stats, outputFile: task.outputFile})}</code></pre>
          </div>
        </div>
      </div>
    `;
  }
  
  // Set the content and show the modal
  taskDetailsContent.innerHTML = detailsHtml;
  
  // Initialize and show modal
  const modal = new bootstrap.Modal(document.getElementById('task-details-modal'));
  modal.show();
}

/**
 * Create a stat card for task details view
 */
function createStatCard(label, value, icon) {
  return `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card h-100">
        <div class="card-body p-2 text-center">
          <i class="fas ${icon} mb-2 text-primary"></i>
          <h6 class="mb-0">${value}</h6>
          <small class="text-muted">${label}</small>
        </div>
      </div>
    </div>
  `;
}

/**
 * Format relative time for timestamp display
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Refresh the history table (used for filtering and sorting)
 */
function refreshHistoryTable() {
  loadTaskHistoryFromStorage();
}

/**
 * Clear all task history
 */
function clearTaskHistory() {
  localStorage.removeItem('taskHistory');
  
  // Clear table
  if (historyTableBody) {
    historyTableBody.innerHTML = `
      <tr class="history-empty-row">
        <td colspan="5" class="text-center py-4">
          <i class="fas fa-info-circle me-2"></i>No tasks in history
        </td>
      </tr>
    `;
  }
  
  // Clear PDF summaries
  if (pdfSummariesContainer) {
    pdfSummariesContainer.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        <i class="fas fa-file-pdf me-2"></i>No PDF summaries available
      </div>
    `;
  }
}

/**
 * Update PDF summaries in the history tab
 */
function updatePdfSummaries() {
  if (!pdfSummariesContainer) return;
  
  // Get history from localStorage
  const history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Filter to only get PDFs
  const pdfTasks = history.filter(task => {
    return task.outputFile && task.outputFile.toLowerCase().endsWith('.json') && 
           task.stats && task.stats.pdf_files > 0;
  }).slice(0, 6); // Limit to 6 recent PDFs
  
  // Clear container
  pdfSummariesContainer.innerHTML = '';
  
  // If no PDF summaries, show empty state
  if (pdfTasks.length === 0) {
    pdfSummariesContainer.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        <i class="fas fa-file-pdf me-2"></i>No PDF summaries available
      </div>
    `;
    return;
  }
  
  // Add PDF summary cards
  pdfTasks.forEach(task => {
    // Get template
    const template = document.getElementById('pdf-summary-card-template');
    if (!template) return;
    
    // Clone template
    const card = document.importNode(template.content, true);
    
    // Get filename
    const filePath = task.outputFile || '';
    const fileName = filePath.split(/[\\/]/).pop() || 'Unknown PDF';
    
    // Set data
    card.querySelector('.pdf-title').textContent = fileName.replace('_processed.json', '');
    
    // Determine PDF type
    let pdfType = 'Unknown';
    let badgeClass = 'bg-secondary';
    
    if (task.stats.pdf_scanned_count > 0) {
      pdfType = 'Scanned';
      badgeClass = 'bg-warning';
    } else if (task.stats.pdf_academic_count > 0) {
      pdfType = 'Academic';
      badgeClass = 'bg-primary';
    } else if (task.stats.pdf_report_count > 0) {
      pdfType = 'Report';
      badgeClass = 'bg-info';
    } else if (task.stats.pdf_book_count > 0) {
      pdfType = 'Book';
      badgeClass = 'bg-success';
    }
    
    // Set badge
    const badge = card.querySelector('.pdf-type-badge');
    badge.textContent = pdfType;
    badge.className = `badge pdf-type-badge ${badgeClass}`;
    
    // Set stats
    card.querySelector('.pages-count').textContent = task.stats.page_count || '?';
    card.querySelector('.tables-count').textContent = task.stats.tables_extracted || '0';
    
    const fileSize = task.stats.total_bytes ? (task.stats.total_bytes / (1024 * 1024)).toFixed(1) : '?';
    card.querySelector('.file-size').textContent = fileSize;
    
    // Set summary
    let summary = '';
    if (task.stats.document_type) {
      summary += `Type: ${task.stats.document_type}. `;
    }
    if (task.stats.references_extracted) {
      summary += `References: ${task.stats.references_extracted}. `;
    }
    if (task.stats.total_chunks) {
      summary += `Chunks: ${task.stats.total_chunks}.`;
    }
    
    card.querySelector('.pdf-summary').textContent = summary || 'No additional information available.';
    
    // Add event listeners
    const viewPdfBtn = card.querySelector('.view-pdf-btn');
    const structurePdfBtn = card.querySelector('.structure-pdf-btn');
    const viewJsonBtn = card.querySelector('.view-json-btn');
    
    viewPdfBtn.addEventListener('click', function() {
      // Get the source PDF path
      const jsonPath = task.outputFile;
      const pdfPath = jsonPath.replace('_processed.json', '.pdf');
      
      // Try to open PDF viewer
      openPdfViewer(pdfPath);
    });
    
    structurePdfBtn.addEventListener('click', function() {
      // Show structure in a modal
      showPdfStructure(task);
    });
    
    viewJsonBtn.addEventListener('click', function() {
      // Open JSON file
      if (task.outputFile) {
        openFileByPath(task.outputFile);
      }
    });
    
    // Add card to container
    pdfSummariesContainer.appendChild(card);
  });
}

/**
 * Show PDF structure in a modal
 */
function showPdfStructure(task) {
  // Create modal if it doesn't exist
  let structureModal = document.getElementById('pdf-structure-modal');
  
  if (!structureModal) {
    structureModal = document.createElement('div');
    structureModal.className = 'modal fade';
    structureModal.id = 'pdf-structure-modal';
    structureModal.setAttribute('tabindex', '-1');
    
    structureModal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">PDF Structure</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="pdf-structure-content">
            <div class="text-center">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="mt-3">Loading PDF structure...</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(structureModal);
  }
  
  // Get the modal content container
  const contentContainer = document.getElementById('pdf-structure-content');
  
  // Show the modal
  const modal = new bootstrap.Modal(structureModal);
  modal.show();
  
  // Build structure content
  let structureHtml = '';
  
  if (task.stats && task.stats.section_titles && task.stats.section_titles.length > 0) {
    structureHtml += `
      <h6 class="border-bottom pb-2 mb-3">Document Sections</h6>
      <ul class="list-group mb-4">
    `;
    
    task.stats.section_titles.forEach((title, index) => {
      structureHtml += `
        <li class="list-group-item">
          <span class="badge bg-primary me-2">${index + 1}</span>
          ${title}
        </li>
      `;
    });
    
    structureHtml += `</ul>`;
  }
  
  if (task.stats && task.stats.tables_info && task.stats.tables_info.length > 0) {
    structureHtml += `
      <h6 class="border-bottom pb-2 mb-3">Tables</h6>
      <div class="table-responsive">
        <table class="table table-sm table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Page</th>
              <th>Rows</th>
              <th>Columns</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    task.stats.tables_info.forEach(table => {
      structureHtml += `
        <tr>
          <td>${table.table_id || 'N/A'}</td>
          <td>${table.page || 'N/A'}</td>
          <td>${table.rows || 'N/A'}</td>
          <td>${table.columns || 'N/A'}</td>
        </tr>
      `;
    });
    
    structureHtml += `
        </tbody>
      </table>
    </div>
    `;
  }
  
  if (!structureHtml) {
    structureHtml = `
      <div class="alert alert-info">
        <i class="fas fa-info-circle me-2"></i>
        No detailed structure information available for this PDF.
      </div>
    `;
  }
  
  // Update the modal content
  contentContainer.innerHTML = structureHtml;
}

// =============================================================================
// SECTION 11: HELP MODE & KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Toggle help mode with enhanced visual feedback
 */
function toggleHelpMode() {
  helpMode = !helpMode;
  
  // Toggle the class on the body
  document.body.classList.toggle('help-mode', helpMode);
  
  // Show/hide help tooltips
  if (helpMode) {
    showHelpTooltips();
    showToast('Help Mode', 'Help mode enabled. Click on elements to see help.', 'info');
  } else {
    removeHelpTooltips();
  }
}

/**
 * Show help tooltips
 */
function showHelpTooltips() {
  // Add help-target class to elements with help tips
  const helpTargets = [
    { selector: '#input-dir', tip: 'Enter the directory containing files to process' },
    { selector: '#output-file', tip: 'Enter the filename for the JSON output (without extension)' },
    { selector: '#browse-btn', tip: 'Click to browse for a directory' },
    { selector: '#submit-btn', tip: 'Start processing files in the specified directory' },
    { selector: '.playlist-url', tip: 'Enter a YouTube playlist URL' },
    { selector: '#playlist-root', tip: 'Enter the directory where playlist files will be downloaded' },
    { selector: '.scraper-url', tip: 'Enter a website URL to scrape' },
    { selector: '.scraper-settings', tip: 'Choose how to process the URL' },
    { selector: '#download-directory', tip: 'Enter the directory where files will be downloaded' }
  ];
  
  helpTargets.forEach(target => {
    const elements = document.querySelectorAll(target.selector);
    elements.forEach(element => {
      element.classList.add('help-target');
      
      // Add click event to show tooltip
      element.addEventListener('click', function(e) {
        if (!helpMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        showTooltip(element, target.tip);
      });
    });
  });
}

/**
 * Show a tooltip next to an element
 */
function showTooltip(element, message) {
  // Remove any existing tooltips
  removeHelpTooltips();
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'help-tooltip';
  tooltip.innerHTML = `
    <button class="help-close-btn"><i class="fas fa-times"></i></button>
    <p>${message}</p>
  `;
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + 10}px`;
  tooltip.style.left = `${rect.left}px`;
  
  // Add to body
  document.body.appendChild(tooltip);
  
  // Add event listener to close button
  tooltip.querySelector('.help-close-btn').addEventListener('click', function() {
    tooltip.remove();
  });
  
  // Animate in
  setTimeout(() => {
    tooltip.classList.add('active');
  }, 10);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(tooltip)) {
      tooltip.classList.remove('active');
      setTimeout(() => tooltip.remove(), 300);
    }
  }, 5000);
}

/**
 * Remove all help tooltips
 */
function removeHelpTooltips() {
  const tooltips = document.querySelectorAll('.help-tooltip');
  tooltips.forEach(tooltip => {
    tooltip.classList.remove('active');
    setTimeout(() => {
      if (document.body.contains(tooltip)) {
        tooltip.remove();
      }
    }, 300);
  });
}

/**
 * Handle keyboard shortcuts with visual feedback
 */
function handleKeyboardShortcuts(e) {
  // Check if Ctrl key is pressed
  if (e.ctrlKey) {
    let shortcutActivated = true;
    
    switch (e.key) {
      case '1':
        // Switch to File Processor tab
        const fileTab = document.getElementById('file-tab');
        if (fileTab) {
          const tabInstance = new bootstrap.Tab(fileTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to File Processor tab', 'info');
        }
        break;
      case '2':
        // Switch to Playlist Downloader tab
        const playlistTab = document.getElementById('playlist-tab');
        if (playlistTab) {
          const tabInstance = new bootstrap.Tab(playlistTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to Playlist Downloader tab', 'info');
        }
        break;
      case '3':
        // Switch to Web Scraper tab
        const scraperTab = document.getElementById('scraper-tab');
        if (scraperTab) {
          const tabInstance = new bootstrap.Tab(scraperTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to Web Scraper tab', 'info');
        }
        break;
      case '4':
        // Switch to History tab
        const historyTab = document.getElementById('history-tab');
        if (historyTab) {
          const tabInstance = new bootstrap.Tab(historyTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to History tab', 'info');
        }
        break;
      case 'o':
        // Open JSON file (when available)
        e.preventDefault();
        const openBtn = document.querySelector('.open-json-btn:not(.d-none)');
        if (openBtn && !openBtn.disabled) {
          openBtn.click();
          showToast('Shortcut', 'Opening JSON file', 'info');
        } else {
          showToast('Shortcut', 'No JSON file available to open', 'warning');
        }
        break;
      case 'n':
        // Start new task (when available)
        e.preventDefault();
        const newTaskBtn = document.querySelector('#new-task-btn:not(.d-none)') ||
                           document.querySelector('#playlist-new-task-btn:not(.d-none)') ||
                           document.querySelector('#scraper-new-task-btn:not(.d-none)');
        if (newTaskBtn && !newTaskBtn.disabled) {
          newTaskBtn.click();
          showToast('Shortcut', 'Starting new task', 'info');
        } else {
          showToast('Shortcut', 'Cannot start new task now', 'warning');
        }
        break;
      case 'h':
        // Show help dialog
        e.preventDefault();
        toggleHelpMode();
        break;
      default:
        shortcutActivated = false;
    }
    
    // Visual feedback when a shortcut is activated
    if (shortcutActivated) {
      // Create a visual indicator for the shortcut
      const indicator = document.createElement('div');
      indicator.className = 'shortcut-indicator';
      indicator.style.position = 'fixed';
      indicator.style.top = '50%';
      indicator.style.left = '50%';
      indicator.style.transform = 'translate(-50%, -50%)';
      indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      indicator.style.color = 'white';
      indicator.style.padding = '20px';
      indicator.style.borderRadius = '10px';
      indicator.style.zIndex = '9999';
      indicator.style.opacity = '0';
      indicator.style.transition = 'opacity 0.3s ease';
      
      // Get the shortcut name
      let shortcutName = '';
      switch (e.key) {
        case '1': shortcutName = 'File Processor'; break;
        case '2': shortcutName = 'Playlist Downloader'; break;
        case '3': shortcutName = 'Web Scraper'; break;
        case '4': shortcutName = 'History'; break;
        case 'o': shortcutName = 'Open JSON'; break;
        case 'n': shortcutName = 'New Task'; break;
        case 'h': shortcutName = 'Help Mode'; break;
      }
      
      indicator.innerHTML = `<i class="fas fa-keyboard me-2"></i>Shortcut: Ctrl+${e.key.toUpperCase()} (${shortcutName})`;
      document.body.appendChild(indicator);
      
      // Animate in and then out
      setTimeout(() => {
        indicator.style.opacity = '1';
        setTimeout(() => {
          indicator.style.opacity = '0';
          setTimeout(() => {
            indicator.remove();
          }, 300);
        }, 1000);
      }, 10);
    }
  } else if (e.key === 'Escape') {
    // Close dialogs on escape
    const tooltips = document.querySelectorAll('.help-tooltip');
    tooltips.forEach(tooltip => tooltip.remove());
    
    // Check for open modals and close them
    const openModals = document.querySelectorAll('.modal.show');
    openModals.forEach(modal => {
      const modalInstance = bootstrap.Modal.getInstance(modal);
      if (modalInstance) modalInstance.hide();
    });
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcuts);
  console.log("Keyboard shortcuts initialized");
}

// =============================================================================
// SECTION 12: ACADEMIC SEARCH FUNCTIONALITY
// =============================================================================

/**
 * Initialize the academic search functionality
 */
function initializeAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicSearchBtn = document.getElementById('academic-search-btn');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  const addSelectedPapersBtn = document.getElementById('add-selected-papers');
  
  if (!academicSearchBtn) {
    console.warn("Academic search elements not found");
    return;
  }
  
  // Set up event listeners for academic search
  academicSearchBtn.addEventListener('click', performAcademicSearch);
  
  // Add enter key support for search field
  if (academicSearchInput) {
    academicSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        performAcademicSearch();
      }
    });
  }
  
  if (addSelectedPapersBtn) {
    addSelectedPapersBtn.addEventListener('click', addSelectedPapers);
  }
  
  // Populate academic sources dropdown if it exists
  if (academicSources) {
    // Ensure sources list is up to date
    populateAcademicSources();
  }
  
  console.log("Academic search functionality initialized");
}

/**
 * Populate academic sources dropdown
 */
function populateAcademicSources() {
  const academicSources = document.getElementById('academic-sources');
  if (!academicSources) return;
  
  // Define available academic sources
  const sources = [
    { value: 'all', label: 'All Sources' },
    { value: 'arxiv', label: 'arXiv' },
    { value: 'semantic', label: 'Semantic Scholar' },
    { value: 'openalex', label: 'OpenAlex' }
  ];
  
  // Clear existing options
  academicSources.innerHTML = '';
  
  // Add options
  sources.forEach(source => {
    const option = document.createElement('option');
    option.value = source.value;
    option.textContent = source.label;
    academicSources.appendChild(option);
  });
}

/**
 * Perform academic search
 */
function performAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  if (!academicSearchInput || !academicSources || !academicResults || !academicResultsContainer) {
    console.error("Academic search elements not found");
    return;
  }
  
  const query = academicSearchInput.value.trim();
  const source = academicSources.value;
  
  if (!query) {
    showToast('Error', 'Please enter a search query', 'error');
    return;
  }
  
  // Show loading indicator in results area
  academicResults.classList.remove('d-none');
  academicResultsContainer.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Searching academic sources...</p>
    </div>
  `;
  
  // Call the API endpoint
  fetch('/api/academic-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    displayAcademicResults(data.results || []);
  })
  .catch(error => {
    console.error('Academic search error:', error);
    
    // Show error in results container
    academicResultsContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Error: ${error.message || 'Failed to search academic sources'}
      </div>
    `;
    
    showToast('Search Failed', error.message || 'Failed to search academic sources', 'error');
  });
}

/**
 * Display academic search results
 */
function displayAcademicResults(results) {
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  if (!academicResultsContainer) return;
  
  if (results.length === 0) {
    academicResultsContainer.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        No results found. Try a different search term or source.
      </div>
    `;
    return;
  }
  
  // Clear previous results
  academicResultsContainer.innerHTML = '';
  
  // Add each result to the container
  results.forEach((paper, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'paper-result-item list-group-item list-group-item-action';
    resultItem.dataset.paperId = paper.id;
    resultItem.dataset.paperUrl = paper.pdf_url || paper.url;
    resultItem.dataset.paperTitle = paper.title;
    
    // Source badge
    let sourceBadge = '';
    if (paper.source === 'arxiv') {
      sourceBadge = '<span class="academic-source-badge academic-source-arxiv me-2">arXiv</span>';
    } else if (paper.source === 'semantic') {
      sourceBadge = '<span class="academic-source-badge academic-source-semantic me-2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex') {
      sourceBadge = '<span class="academic-source-badge academic-source-openalex me-2">OpenAlex</span>';
    }
    
    // Create HTML for the result item
    resultItem.innerHTML = `
      <div class="d-flex align-items-start">
        <div class="form-check mt-1 me-2">
          <input class="form-check-input paper-select" type="checkbox" id="paper-${index}">
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <h6 class="mb-1">${paper.title}</h6>
          </div>
          <div class="mb-1">
            ${sourceBadge}
            <small class="text-muted">${paper.authors.join(', ')}</small>
          </div>
          <p class="mb-1 small">${paper.abstract || 'No abstract available'}</p>
          <div class="mt-2">
            ${paper.pdf_url ? 
              `<span class="badge bg-light text-dark me-2">
                <i class="fas fa-file-pdf me-1 text-danger"></i> PDF Available
              </span>` : ''}
            <span class="badge bg-light text-dark">
              <i class="fas fa-calendar-alt me-1"></i> ${paper.date || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    `;
    
    // Add click handler to toggle selection
    resultItem.addEventListener('click', function(e) {
      // Don't toggle if clicking on the checkbox
      if (e.target.type !== 'checkbox') {
        const checkbox = this.querySelector('.paper-select');
        checkbox.checked = !checkbox.checked;
      }
      
      // Toggle selected class
      this.classList.toggle('selected', this.querySelector('.paper-select').checked);
    });
    
    academicResultsContainer.appendChild(resultItem);
  });
}

/**
 * Add selected papers to the URL list
 */
function addSelectedPapers() {
  const academicResultsContainer = document.getElementById('academic-results-container');
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  
  if (!academicResultsContainer || !scraperUrlsContainer) {
    showToast('Error', 'Required elements not found', 'error');
    return;
  }
  
  const selectedPapers = academicResultsContainer.querySelectorAll('.paper-select:checked');
  
  if (selectedPapers.length === 0) {
    showToast('Warning', 'Please select at least one paper', 'warning');
    return;
  }
  
  // Add each selected paper as a new URL entry
  selectedPapers.forEach(checkbox => {
    const paperItem = checkbox.closest('.paper-result-item');
    const paperUrl = paperItem.dataset.paperUrl;
    const paperTitle = paperItem.dataset.paperTitle;
    
    if (paperUrl) {
      // Add a new URL field with PDF download setting
      addScraperUrlWithData(paperUrl, 'pdf', paperTitle);
    }
  });
  
  // Show confirmation
  showToast('Success', `Added ${selectedPapers.length} papers to scraping list`, 'success');
  
  // Show PDF info section and ensure it's visible
  updatePdfInfoSection();
}

/**
 * Add a new URL field with pre-filled data
 */
function addScraperUrlWithData(url, setting, title = '') {
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  if (!scraperUrlsContainer) return;
  
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
  container.innerHTML = `
    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" value="${url}" required />
    <select class="form-select scraper-settings" style="max-width: 160px;">
      <option value="full">Full Text</option>
      <option value="metadata">Metadata Only</option>
      <option value="title">Title Only</option>
      <option value="keyword">Keyword Search</option>
      <option value="pdf">PDF Download</option>
    </select>
    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
    <button type="button" class="btn btn-outline-danger remove-url">
      <i class="fas fa-trash"></i>
    </button>
  `;
  
  // Set the settings dropdown to the specified value
  const settingsSelect = container.querySelector('.scraper-settings');
  settingsSelect.value = setting;
  
  // Add tooltip with paper title if provided
  if (title) {
    const urlInput = container.querySelector('.scraper-url');
    urlInput.setAttribute('title', title);
  }
  
  // Add to container
  scraperUrlsContainer.appendChild(container);
  
  // Set up event listeners
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    scraperUrlsContainer.removeChild(container);
    updatePdfInfoSection();
  });
  
  settingsSelect.addEventListener('change', handleScraperSettingsChange);
}

// =============================================================================
// SECTION 13: INITIALIZATION & DOM READY
// =============================================================================

/**
 * Get references to all UI elements after DOM is loaded
 */
/**
 * Enhanced getUIElements function with better error handling
 * This will ensure elements are properly detected and provide fallbacks
 */
function getUIElements() {
  console.log("Getting UI element references with improved error handling...");
  
  try {
    // ---- File Processing Tab ----
    inputDirField = safeGetElement('input-dir');
    outputFileField = safeGetElement('output-file');
    submitBtn = safeGetElement('submit-btn');
    browseBtn = safeGetElement('browse-btn');
    cancelBtn = safeGetElement('cancel-btn');
    openBtn = safeGetElement('open-btn');
    newTaskBtn = safeGetElement('new-task-btn');
    retryBtn = safeGetElement('retry-btn');
    formContainer = safeGetElement('form-container');
    progressContainer = safeGetElement('progress-container');
    resultContainer = safeGetElement('result-container');
    errorContainer = safeGetElement('error-container');
    progressBar = safeGetElement('progress-bar');
    progressStatus = safeGetElement('progress-status');
    progressStats = safeGetElement('progress-stats');
    resultStats = safeGetElement('result-stats');
    errorMessage = safeGetElement('error-message');
    errorDetails = safeGetElement('error-details');
    processForm = safeGetElement('process-form');
    pathInfo = safeGetElement('path-info');
    pathInfoText = safeGetElement('.path-info-text', true);
    
    // ---- Playlist Tab ----
    playlistForm = safeGetElement('playlist-form');
    playlistFormContainer = safeGetElement('playlist-form-container');
    playlistUrlsContainer = safeGetElement('playlist-urls-container');
    playlistRootField = safeGetElement('playlist-root');
    playlistOutputField = safeGetElement('playlist-output');
    playlistSubmitBtn = safeGetElement('playlist-submit-btn');
    playlistProgressContainer = safeGetElement('playlist-progress-container');
    playlistProgressBar = safeGetElement('playlist-progress-bar');
    playlistProgressStatus = safeGetElement('playlist-progress-status');
    playlistProgressStats = safeGetElement('playlist-progress-stats');
    playlistCancelBtn = safeGetElement('playlist-cancel-btn');
    playlistResultsContainer = safeGetElement('playlist-results-container');
    playlistStats = safeGetElement('playlist-stats');
    playlistNewTaskBtn = safeGetElement('playlist-new-task-btn');
    openPlaylistJsonBtn = safeGetElement('open-playlist-json');
    addPlaylistBtn = safeGetElement('add-playlist-btn');
    
    // ---- Web Scraper Tab ---- 
    // Fix ID reference to match HTML - this was likely the issue
    scraperForm = safeGetElement('scraper-form');
    scraperFormContainer = safeGetElement('scraper-form-container');
    scraperUrlsContainer = safeGetElement('scraper-urls-container');
    scraperOutputField = safeGetElement('scraper-output');
    downloadDirectoryField = safeGetElement('download-directory');
    downloadDirBrowseBtn = safeGetElement('download-dir-browse-btn');
    scraperProgressContainer = safeGetElement('scraper-progress-container');
    scraperProgressBar = safeGetElement('scraper-progress-bar');
    scraperProgressStatus = safeGetElement('scraper-progress-status');
    scraperProgressStats = safeGetElement('scraper-progress-stats');
    scraperCancelBtn = safeGetElement('scraper-cancel-btn');
    scraperResultsContainer = safeGetElement('scraper-results-container');
    scraperResults = safeGetElement('scraper-results');
    scraperStats = safeGetElement('scraper-stats');
    openScraperJsonBtn = safeGetElement('open-scraper-json');
    scraperNewTaskBtn = safeGetElement('scraper-new-task-btn');
    openOutputFolderBtn = safeGetElement('open-output-folder');
    addScraperUrlBtn = safeGetElement('add-scraper-url');
    pdfInfoSection = safeGetElement('pdf-info-section');
    pdfDownloadProgress = safeGetElement('pdf-download-progress');
    pdfDownloadsList = safeGetElement('pdf-downloads-list');
    processPdfSwitch = safeGetElement('process-pdf-switch');
    
    // ---- History Tab ----
    historyTableBody = safeGetElement('history-table-body');
    historySearch = safeGetElement('history-search');
    historyFilter = safeGetElement('history-filter');
    historySort = safeGetElement('history-sort');
    historyRefreshBtn = safeGetElement('history-refresh-btn');
    historyClearBtn = safeGetElement('history-clear-btn');
    taskDetailsModal = safeGetElement('task-details-modal');
    pdfSummariesContainer = safeGetElement('pdf-summaries-container');
    
    // Run element validation to populate debug panel
    validateUIElements();
    
    console.log("UI element references acquired");
  } catch (e) {
    console.error("Error during UI element initialization:", e);
    
    // Even if we have errors, let's run validation to populate the debug panel
    validateUIElements();
  }
}


/**
 * This function must be called immediately after getUIElements()
 * to ensure any missing elements are handled before event listeners are set up
 */
function ensureCriticalElements() {
  // Call validateUIElements to check if all critical elements exist
  const allValid = validateUIElements();
  
  if (!allValid) {
    console.log("Some critical UI elements are missing. Attempting to fix...");
    
    // Fix for scraperUrlsContainer
    if (!scraperUrlsContainer && document.getElementById('scraper-form-container')) {
      const scraperFormElem = document.getElementById('scraper-form-container').querySelector('form') || 
                             document.getElementById('scraper-form');
      
      if (scraperFormElem) {
        console.log("Creating scraperUrlsContainer");
        
        // Create the element with the right ID
        const container = document.createElement('div');
        container.id = 'scraper-urls-container';
        
        // Add initial URL field
        container.innerHTML = `
          <div class="input-group mb-2">
            <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required />
            <select class="form-select scraper-settings" style="max-width: 160px;">
              <option value="full">Full Text</option>
              <option value="metadata">Metadata Only</option>
              <option value="title">Title Only</option>
              <option value="keyword">Keyword Search</option>
              <option value="pdf">PDF Download</option>
            </select>
            <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
            <button type="button" class="btn btn-outline-danger remove-url">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `;
        
        // Try to find where to insert it
        const insertPoint = scraperFormElem.querySelector('.mb-4');
        if (insertPoint) {
          insertPoint.appendChild(container);
        } else {
          // Fallback: add at the beginning of the form
          scraperFormElem.prepend(container);
        }
        
        // Update the global reference
        scraperUrlsContainer = container;
        console.log("Created scraperUrlsContainer element");
      }
    }
    
    // Re-validate to update debug panel
    validateUIElements();
  }
}

// 1. Improved progress updates with proper rate limiting
function emitProgressWithRateLimiting(data) {
  const now = Date.now();
  // Only emit if enough time has passed OR progress is at important milestone
  if ((now - lastEmitTime > 300) || 
      data.progress === 100 || 
      data.progress === 0 || 
      Math.abs(data.progress - lastProgress) > 10) {
    
    socketio.emit('progress_update', data);
    lastEmitTime = now;
    lastProgress = data.progress;
    return true;
  }
  return false;
}
/**
 * Normalize progress value for better user experience
 * @param {number} rawProgress - The raw progress value from the server
 * @param {Object} data - The full progress data object
 * @returns {number} - Normalized progress value between 0-100
 */
function normalizeProgress(rawProgress, data) {
  // Handle invalid input
  if (rawProgress === undefined || rawProgress === null) {
    return 0;
  }
  
  // Ensure progress is a number
  rawProgress = Number(rawProgress);
  if (isNaN(rawProgress)) {
    return 0;
  }
  
  // Keep progress within bounds
  rawProgress = Math.max(0, Math.min(100, rawProgress));
  
  // Initialize progress tracking if not exists
  if (!window.progressTracking) {
    window.progressTracking = {
      history: [],
      jumpDetected: false,
      jumpFrom: null,
      jumpTime: null,
      lastPhase: 'pre-jump', // 'pre-jump', 'jumping', 'simulating', 'completed'
      batchInfo: null,
      stagnantCount: 0
    };
  }
  
  const tracking = window.progressTracking;
  const now = Date.now();
  
  // Add to progress history
  tracking.history.push({
    progress: rawProgress,
    timestamp: now,
    message: data.message || ''
  });
  
  // Keep history manageable (last 20 updates)
  if (tracking.history.length > 20) {
    tracking.history.shift();
  }
  
  // Detect phase transitions
  if (tracking.history.length >= 2) {
    const previous = tracking.history[tracking.history.length - 2].progress;
    const jump = rawProgress - previous;
    
    // Check for significant jump
    if (jump >= 10 && previous < 60 && rawProgress < 80) {
      tracking.jumpDetected = true;
      tracking.jumpFrom = previous;
      tracking.jumpTime = now;
      tracking.lastPhase = 'jumping';
      console.log(`Progress jump detected: ${previous}% → ${rawProgress}%`);
      
      // Extract batch information from message if available
      if (data.message && data.message.includes('batch')) {
        const batchMatch = data.message.match(/batch (\d+)\/(\d+)/);
        if (batchMatch && batchMatch.length >= 3) {
          tracking.batchInfo = {
            current: parseInt(batchMatch[1]),
            total: parseInt(batchMatch[2]),
            isFinal: parseInt(batchMatch[1]) === parseInt(batchMatch[2])
          };
          console.log(`Batch info detected: ${tracking.batchInfo.current}/${tracking.batchInfo.total}`);
        }
      }
    }
    
    // Check for stagnation at 50%
    if (rawProgress === 50 && previous === 50) {
      tracking.stagnantCount++;
      
      // After being stuck at 50% for a while, enter simulation phase
      if (tracking.stagnantCount >= 3 && tracking.lastPhase !== 'simulating') {
        tracking.lastPhase = 'simulating';
        console.log("Progress stagnant at 50%, entering simulation phase");
      }
    } else {
      tracking.stagnantCount = 0;
    }
    
    // Check for completion
    if (rawProgress >= 99 || rawProgress >= 100) {
      tracking.lastPhase = 'completed';
    }
  }
  
  // Apply normalization based on current phase
  switch (tracking.lastPhase) {
    case 'pre-jump':
      // Before any jump, return the raw value
      return rawProgress;
      
    case 'jumping':
      // During a jump transition (brief period)
      // Just pass through the raw value
      return rawProgress;
      
    case 'simulating':
      // If we're stuck at 50%, apply simulation
      if (rawProgress === 50) {
        // Get time elapsed since jump or stagnation start
        const referenceTime = tracking.jumpTime || 
                              tracking.history[tracking.history.length - tracking.stagnantCount].timestamp;
        const elapsedSecs = (now - referenceTime) / 1000;
        
        // Estimate progress based on elapsed time
        // Use batch information if available to make a better estimate
        if (tracking.batchInfo && tracking.batchInfo.isFinal) {
          // In final batch, simulate 50-95% over about 30 seconds
          const simulatedProgress = Math.min(95, 50 + (elapsedSecs * 1.5));
          return Math.round(simulatedProgress);
        } else {
          // Generic simulation from 50-75% over about 20 seconds
          // More conservative when we don't know batch details
          const simulatedProgress = Math.min(75, 50 + (elapsedSecs));
          return Math.round(simulatedProgress);
        }
      }
      // If we get a non-50% value during simulation, use it
      return rawProgress;
      
    case 'completed':
      // Ensure 100% for completed state
      return rawProgress >= 99 ? 100 : rawProgress;
      
    default:
      // Default: just return the raw value
      return rawProgress;
  }
}

// 3. Better multi-phase progress tracking
class MultiPhaseProgressTracker {
  constructor(phases) {
    this.phases = phases.map(p => ({ 
      name: p.name, 
      weight: p.weight, 
      progress: 0,
      complete: false
    }));
    this.totalWeight = this.phases.reduce((sum, p) => sum + p.weight, 0);
  }
  
  updatePhase(phaseName, progress) {
    const phase = this.phases.find(p => p.name === phaseName);
    if (phase) {
      phase.progress = Math.min(progress, 100);
      if (progress >= 100) {
        phase.complete = true;
      }
    }
    
    return this.calculateTotalProgress();
  }
  
  calculateTotalProgress() {
    let weightedProgress = 0;
    
    for (const phase of this.phases) {
      weightedProgress += (phase.progress * phase.weight);
    }
    
    return Math.min(Math.floor(weightedProgress / this.totalWeight), 100);
  }
}

// 1. Improved error messages with actionable advice
function displayEnhancedErrorMessage(error) {
  // Analyze error message for common issues
  let userMessage = "An error occurred during processing.";
  let actionableAdvice = "";
  
  if (error.includes("memory")) {
    userMessage = "The file is too large for processing.";
    actionableAdvice = "Try processing a smaller document or disabling table extraction.";
  } else if (error.includes("permission")) {
    userMessage = "Permission denied when accessing the file.";
    actionableAdvice = "Check that you have permission to access this file or try a different location.";
  } else if (error.includes("corrupt") || error.includes("invalid")) {
    userMessage = "The PDF file appears to be corrupted or invalid.";
    actionableAdvice = "Try opening the PDF in another application to verify it works correctly.";
  }
  
  // Display the error to the user
  showToast('Processing Error', userMessage, 'error');
  
  // Add advice if available
  if (actionableAdvice) {
    // Display actionable advice in a separate element
    const errorDetailsElement = document.getElementById('error-details');
    if (errorDetailsElement) {
      errorDetailsElement.innerHTML = `<div class="alert alert-warning">
        <i class="fas fa-lightbulb me-2"></i> ${actionableAdvice}
      </div>`;
    }
  }
}

// 2. Better loading indicators
function showLoadingState(element, message = "Loading...") {
  // Save original content
  element.dataset.originalContent = element.innerHTML;
  
  // Show loading spinner with message
  element.innerHTML = `
    <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm me-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span>${message}</span>
    </div>
  `;
  element.disabled = true;
}

function resetLoadingState(element) {
  if (element.dataset.originalContent) {
    element.innerHTML = element.dataset.originalContent;
    element.disabled = false;
    delete element.dataset.originalContent;
  }
}

// 3. Efficient DOM updates with batching
class DOMBatcher {
  constructor(batchTimeMs = 16) { // ~1 frame at 60fps
    this.batchTimeMs = batchTimeMs;
    this.pendingUpdates = new Map();
    this.timeoutId = null;
  }
  
  update(elementId, updateFn) {
    this.pendingUpdates.set(elementId, updateFn);
    
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.flush(), this.batchTimeMs);
    }
  }
  
  flush() {
    this.timeoutId = null;
    
    // Process all updates in a single batch
    for (const [elementId, updateFn] of this.pendingUpdates.entries()) {
      const element = document.getElementById(elementId);
      if (element) {
        updateFn(element);
      }
    }
    
    this.pendingUpdates.clear();
  }
}

// 1. Implement file processing batching
async function processFilesBatched(files, outputPath, options = {}) {
  const batchSize = options.batchSize || 10;
  const results = [];
  const batches = [];
  
  // Split files into batches
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  
  let completedFiles = 0;
  const totalFiles = files.length;
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Process files in this batch concurrently
    const batchResults = await Promise.all(
      batch.map(async file => {
        try {
          const result = await processFile(file, outputPath, options);
          
          // Update progress
          completedFiles++;
          const progress = Math.floor((completedFiles / totalFiles) * 100);
          
          if (options.progressCallback) {
            options.progressCallback(progress, completedFiles, totalFiles);
          }
          
          return { file, result, success: true };
        } catch (error) {
          return { file, error: error.message, success: false };
        }
      })
    );
    
    results.push(...batchResults);
    
    // Release memory between batches
    if (global.gc) {
      global.gc();
    }
  }
  
  return results;
}

// 2. Implement a memory-aware cleanup service
const cleanup = {
  tempFiles: new Set(),
  
  registerFile(filePath) {
    this.tempFiles.add(filePath);
  },
  
  async cleanupTemporaryFiles() {
    const currentFiles = [...this.tempFiles];
    
    for (const file of currentFiles) {
      try {
        await fs.promises.unlink(file);
        this.tempFiles.delete(file);
      } catch (error) {
        // File might be in use, will try again later
        console.warn(`Could not delete temporary file ${file}: ${error.message}`);
      }
    }
  },
  
  startCleanupService(intervalMs = 300000) {
    setInterval(() => {
      this.cleanupTemporaryFiles();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }, intervalMs);
  }
};

// 3. Optimized progress event throttling on server
const progressManager = {
  lastSentProgress: new Map(),
  minTimeBetweenUpdatesMs: 300,
  lastUpdateTime: new Map(),
  
  shouldSendUpdate(clientId, progress) {
    const now = Date.now();
    const lastTime = this.lastUpdateTime.get(clientId) || 0;
    const lastProgress = this.lastSentProgress.get(clientId) || -1;
    
    // Always send first and last updates
    if (progress === 0 || progress === 100) {
      this.updateTracking(clientId, progress, now);
      return true;
    }
    
    // Send if significant progress change
    if (Math.abs(progress - lastProgress) > 5) {
      // But still respect time limits
      if (now - lastTime >= this.minTimeBetweenUpdatesMs) {
        this.updateTracking(clientId, progress, now);
        return true;
      }
    }
    
    // Send if enough time has passed regardless of progress
    if (now - lastTime >= 1000) {
      this.updateTracking(clientId, progress, now);
      return true;
    }
    
    return false;
  },
  
  updateTracking(clientId, progress, timestamp) {
    this.lastSentProgress.set(clientId, progress);
    this.lastUpdateTime.set(clientId, timestamp);
  }
};

/**
 * Process a PDF file with the server's advanced capabilities
 * @param {string} filePath - Path to the PDF file
 * @param {object} options - Processing options
 * @returns {Promise} - Processing result
 */
function processPDF(filePath, options = {}) {
  const defaults = {
      extractTables: true,
      useOcr: true,
      extractStructure: true,
      outputFolder: null
  };
  
  const settings = { ...defaults, ...options };
  
  return new Promise((resolve, reject) => {
      // Prepare the request payload
      const payload = {
          pdf_path: filePath,
          output_dir: settings.outputFolder,
          extract_tables: settings.extractTables,
          use_ocr: settings.useOcr
      };
      
      // Call the PDF processing API
      fetch('/api/pdf/process', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      })
      .then(response => {
          if (!response.ok) {
              throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          if (data.status === "processing") {
              // Task is being processed asynchronously
              // We'll need to poll for updates
              const taskId = data.task_id;
              pollPdfProcessingStatus(taskId, resolve, reject);
          } else if (data.status === "success") {
              // Processing completed synchronously
              resolve(data);
          } else {
              // Error occurred
              reject(new Error(data.error || "Unknown error"));
          }
      })
      .catch(error => {
          reject(error);
      });
  });
}
/**
 * Poll for PDF processing status
 * @param {string} taskId - Task ID
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 * @param {number} remainingAttempts - Number of retry attempts left
 */
function pollPdfProcessingStatus(taskId, resolve, reject, remainingAttempts = 1) {
  const delay = 2000; // 2 second polling interval
  
  const checkStatus = () => {
    fetch(`/api/pdf/status/${taskId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.status === "completed") {
        // Processing completed
        resolve(data);
      } else if (data.status === "failed" || data.status === "error") {
        // Error occurred
        if (data.error && data.error.includes('memory') && remainingAttempts > 0) {
          // Memory error, can retry with reduced options
          console.warn("PDF processing failed with memory error, restarting with reduced options");
          
          // Wait before retrying
          setTimeout(() => {
            fetch(`/api/pdf/retry/${taskId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                extract_tables: false,
                use_ocr: false
              })
            })
            .then(response => response.json())
            .then(retryData => {
              if (retryData.status === 'processing') {
                // Continue polling with one less retry attempt
                pollPdfProcessingStatus(taskId, resolve, reject, remainingAttempts - 1);
              } else {
                reject(new Error("Failed to restart PDF processing"));
              }
            })
            .catch(error => {
              reject(error);
            });
          }, 1000);
        } else {
          // Other error or out of retries
          reject(new Error(data.error || "Processing failed"));
        }
      } else {
        // Still processing, poll again after a delay
        setTimeout(checkStatus, delay);
      }
    })
    .catch(error => {
      reject(error);
    });
  };
  
  // Start polling
  checkStatus();
}


/**
* Add PDF viewing capabilities to the UI
*/
function enhancePdfViewer() {
  // Get the PDF viewer modal
  const pdfViewerModal = document.getElementById('pdfViewerModal');
  
  if (!pdfViewerModal) return;
  
  // Add PDF.js initialization if needed
  if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }
  
  // Enhance the existing openPdfViewer function with structure view
  window.openPdfWithStructure = function(pdfPath, structureData) {
      openPdfViewer(pdfPath);
      
      // Add structure data if available
      if (structureData) {
          const viewerContainer = document.getElementById('pdf-viewer-container');
          if (viewerContainer) {
              // Add a structure panel
              const structurePanel = document.createElement('div');
              structurePanel.className = 'structure-panel';
              structurePanel.innerHTML = `
                  <div class="card">
                      <div class="card-header">
                          <h5 class="mb-0">Document Structure</h5>
                      </div>
                      <div class="card-body">
                          <div class="structure-content">
                              ${renderStructureHtml(structureData)}
                          </div>
                      </div>
                  </div>
              `;
              
              viewerContainer.appendChild(structurePanel);
          }
      }
  };
}

/**
* Render document structure as HTML
*/
function renderStructureHtml(structure) {
  if (!structure) return '<div class="alert alert-info">No structure information available</div>';
  
  let html = '';
  
  // Render sections
  if (structure.sections && structure.sections.length > 0) {
      html += '<h6>Sections</h6>';
      html += '<ul class="structure-sections">';
      
      structure.sections.forEach(section => {
          html += `<li>${section.title || 'Untitled Section'}</li>`;
      });
      
      html += '</ul>';
  }
  
  // Render tables
  if (structure.tables && structure.tables.length > 0) {
      html += '<h6>Tables</h6>';
      html += '<ul class="structure-tables">';
      
      structure.tables.forEach(table => {
          html += `<li>Table on page ${table.page}</li>`;
      });
      
      html += '</ul>';
  }
  
  return html;
}


// 2. Dynamic OCR path detection
function detectTesseractPath() {
  const possiblePaths = [
    '/usr/bin/tesseract',
    '/usr/local/bin/tesseract',
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
  ];
  
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  
  return null;
}


// 3. Enhanced PDF processing with better error handling
async function processPdfWithRecovery(pdf_path, output_path, options = {}) {
  // First try with full features
  try {
    const result = await pdfProcessor.process_pdf(pdf_path, output_path, options);
    return result;
  } catch (e) {
    logger.error(`Full PDF processing failed: ${e}`);
    
    // If memory error, try with reduced features
    if (e.message.includes('memory') || e.message.includes('allocation')) {
      logger.info("Retrying with reduced memory options");
      const reducedOptions = {
        ...options,
        extract_tables: false,
        chunk_size: 2048,
        use_ocr: false
      };
      
      try {
        return await pdfProcessor.process_pdf(pdf_path, output_path, reducedOptions);
      } catch (retryError) {
        throw new Error(`PDF processing failed after retry: ${retryError.message}`);
      }
    }
    
    throw e;
  }
}

/**
 * Set up event listeners for all UI elements
 */
function setupEventListeners() {
  console.log("Setting up event listeners...");
  
  // ---- File Processing Form ----
  if (processForm) {
    // Remove any existing listeners first to avoid duplicates
    processForm.removeEventListener('submit', handleFileSubmit);
    // Add the event listener
    processForm.addEventListener('submit', handleFileSubmit);
    console.log("File form submit listener added");
  } else {
    console.warn("Process form element not found");
  }
  
  // ---- File Processing Buttons ----
  if (browseBtn) {
    browseBtn.removeEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    browseBtn.addEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    console.log("Browse button click listener added");
  } else {
    console.warn("Browse button element not found");
  }
  
  if (cancelBtn) {
    cancelBtn.removeEventListener('click', handleCancelClick);
    cancelBtn.addEventListener('click', handleCancelClick);
  }
  
  if (newTaskBtn) {
    newTaskBtn.removeEventListener('click', handleNewTaskClick);
    newTaskBtn.addEventListener('click', handleNewTaskClick);
  }
  
  if (retryBtn) {
    retryBtn.removeEventListener('click', handleNewTaskClick);
    retryBtn.addEventListener('click', handleNewTaskClick);
  }
  
  if (openBtn) {
    openBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  // ---- Folder Input Change ----
  const folderInput = document.getElementById('folder-input');
  if (folderInput) {
    folderInput.removeEventListener('change', handleFolderSelection);
    folderInput.addEventListener('change', handleFolderSelection);
  }
  
  // ---- Playlist Form ----
  if (playlistForm) {
    playlistForm.removeEventListener('submit', handlePlaylistSubmit);
    playlistForm.addEventListener('submit', handlePlaylistSubmit);
    console.log("Playlist form submit listener added");
  } else {
    console.warn("Playlist form element not found");
  }
  
  // ---- Playlist Buttons ----
  if (addPlaylistBtn) {
    addPlaylistBtn.removeEventListener('click', addPlaylistField);
    addPlaylistBtn.addEventListener('click', addPlaylistField);
  }
  
  if (playlistCancelBtn) {
    playlistCancelBtn.removeEventListener('click', handleCancelClick);
    playlistCancelBtn.addEventListener('click', handleCancelClick);
  }
  
  if (playlistNewTaskBtn) {
    playlistNewTaskBtn.removeEventListener('click', function() {
      currentTaskId = null;
      playlistResultsContainer.classList.add('d-none');
      playlistFormContainer.classList.remove('d-none');
      
      // Reset the form
      if (playlistForm) playlistForm.reset();
      
      // Reset playlist URLs
      const urlInputs = playlistUrlsContainer.querySelectorAll('.input-group');
      for (let i = urlInputs.length - 1; i > 0; i--) {
        playlistUrlsContainer.removeChild(urlInputs[i]);
      }
      
      // Reset the first URL input
      const firstUrlInput = playlistUrlsContainer.querySelector('.playlist-url');
      if (firstUrlInput) firstUrlInput.value = '';
      
      showToast('Ready', 'Ready for a new playlist task', 'info');
    });
    
    playlistNewTaskBtn.addEventListener('click', function() {
      currentTaskId = null;
      playlistResultsContainer.classList.add('d-none');
      playlistFormContainer.classList.remove('d-none');
      
      // Reset the form
      if (playlistForm) playlistForm.reset();
      
      // Reset playlist URLs
      const urlInputs = playlistUrlsContainer.querySelectorAll('.input-group');
      for (let i = urlInputs.length - 1; i > 0; i--) {
        playlistUrlsContainer.removeChild(urlInputs[i]);
      }
      if (playlistCancelBtn) {
        playlistCancelBtn.removeEventListener('click', handleCancelClick); // Remove the generic handler
        playlistCancelBtn.addEventListener('click', handlePlaylistCancelClick); // Add the specific handler
        console.log("Playlist cancel button listener added");
      }      
      // Reset the first URL input
      const firstUrlInput = playlistUrlsContainer.querySelector('.playlist-url');
      if (firstUrlInput) firstUrlInput.value = '';
      
      showToast('Ready', 'Ready for a new playlist task', 'info');
    });
  }
  
  if (openPlaylistJsonBtn) {
    openPlaylistJsonBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openPlaylistJsonBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  if (playlistRootField) {
    const playlistBrowseBtn = document.getElementById('playlist-browse-btn');
    if (playlistBrowseBtn) {
      playlistBrowseBtn.removeEventListener('click', function() {
        handleBrowseClick(playlistRootField);
      });
      playlistBrowseBtn.addEventListener('click', function() {
        handleBrowseClick(playlistRootField);
      });
    }
  }
  
  // ---- Web Scraper Form ----
  if (scraperForm) {
    scraperForm.removeEventListener('submit', handleScraperSubmit);
    scraperForm.addEventListener('submit', handleScraperSubmit);
    console.log("Scraper form submit listener added");
  } else {
    console.warn("Scraper form element not found");
  }
  
  // ---- Scraper Buttons ----
  if (addScraperUrlBtn) {
    addScraperUrlBtn.removeEventListener('click', addScraperUrlField);
    addScraperUrlBtn.addEventListener('click', addScraperUrlField);
  }
  
  if (scraperCancelBtn) {
    scraperCancelBtn.removeEventListener('click', handleScraperCancelClick);
    scraperCancelBtn.addEventListener('click', handleScraperCancelClick);
  }
  
  if (scraperNewTaskBtn) {
    scraperNewTaskBtn.removeEventListener('click', handleScraperNewTask);
    scraperNewTaskBtn.addEventListener('click', handleScraperNewTask);
  }
  
  if (openScraperJsonBtn) {
    openScraperJsonBtn.removeEventListener('click', function() {
      handleOpenJsonFile(this);
    });
    openScraperJsonBtn.addEventListener('click', function() {
      handleOpenJsonFile(this);
    });
  }
  
  if (openOutputFolderBtn) {
    openOutputFolderBtn.removeEventListener('click', handleOpenOutputFolder);
    openOutputFolderBtn.addEventListener('click', handleOpenOutputFolder);
  }
  
  // ---- Scraper Settings Change ----
  const settingsSelects = document.querySelectorAll('.scraper-settings');
  if (settingsSelects.length > 0) {
    settingsSelects.forEach(select => {
      select.removeEventListener('change', handleScraperSettingsChange);
      select.addEventListener('change', handleScraperSettingsChange);
    });
  }
  
  if (downloadDirBrowseBtn) {
    downloadDirBrowseBtn.removeEventListener('click', function() {
      handleBrowseClick(downloadDirectoryField);
    });
    downloadDirBrowseBtn.addEventListener('click', function() {
      handleBrowseClick(downloadDirectoryField);
    });
  }
  
  // ---- Theme and Help Toggles ----
  // Dark mode toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.removeEventListener('click', toggleDarkMode);
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }
  
  const helpToggle = document.getElementById('helpToggle');
  if (helpToggle) {
    helpToggle.removeEventListener('click', toggleHelpMode);
    helpToggle.addEventListener('click', toggleHelpMode);
  }
  
  // ---- Keyboard Shortcuts ----
  document.removeEventListener('keydown', handleKeyboardShortcuts);
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // ---- History Tab ----
  if (historyRefreshBtn) {
    historyRefreshBtn.removeEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
    historyRefreshBtn.addEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
  }
  
  if (historyClearBtn) {
    historyClearBtn.removeEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
    historyClearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
  }
  
  // Re-initialize Socket.IO connection
  initializeSocket();
  
  // Update the event listeners status in the debug panel
  updateEventListenersStatus();
  
  console.log("Event listeners setup complete");
  
  // Return true to indicate success
  return true;
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - The element to make draggable
 * @param {HTMLElement} handle - The drag handle (usually the header)
 */
function makeDraggable(element, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  if (!element || !handle) return;
  
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Set the element's new position, ensuring it stays within viewport
    const newTop = (element.offsetTop - pos2);
    const newLeft = (element.offsetLeft - pos1);
    
    // Check viewport boundaries
    const maxTop = window.innerHeight - element.offsetHeight;
    const maxLeft = window.innerWidth - element.offsetWidth;
    
    element.style.top = Math.min(Math.max(0, newTop), maxTop) + "px";
    element.style.left = Math.min(Math.max(0, newLeft), maxLeft) + "px";
    
    // Switch from bottom/right positioning to top/left
    element.style.bottom = 'auto';
    element.style.right = 'auto';
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Track and display errors in the debug panel
 * @param {Error} error - The error object
 * @param {string} context - Error context
 */
function trackErrorInDebugPanel(error, context) {
  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;
  
  const badge = debugPanel.querySelector('#debug-error-counter');
  if (!badge) return;
  
  // Increment error count
  const count = parseInt(badge.textContent) || 0;
  badge.textContent = count + 1;
  badge.style.display = 'flex';
  
  // Add error to errors list
  const errorsContainer = document.getElementById('debug-errors-list');
  if (errorsContainer) {
    const errorItem = document.createElement('div');
    errorItem.className = 'alert alert-danger mb-1 p-2 small';
    errorItem.innerHTML = `
      <strong>${context}:</strong> ${error.message || error}
      <button type="button" class="btn-close btn-close-white float-end" aria-label="Close"></button>
    `;
    
    // Add clear button functionality
    const closeBtn = errorItem.querySelector('.btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        errorItem.remove();
        // Update count
        const newCount = errorsContainer.querySelectorAll('.alert').length;
        badge.textContent = newCount;
        badge.style.display = newCount > 0 ? 'flex' : 'none';
      });
    }
    
    errorsContainer.prepend(errorItem);
  }
}

// Call enhance debug panel when initializing debug mode
if (typeof initializeDebugMode === 'function') {
  const originalInitDebug = initializeDebugMode;
  initializeDebugMode = function() {
    originalInitDebug.apply(this, arguments);
    enhanceDebugPanel();
  };
}

// Enhance error tracking
if (typeof handleError === 'function') {
  const originalHandleError = handleError;
  handleError = function(error, context) {
    // Call original function
    originalHandleError.apply(this, arguments);
    
    // Also track in debug panel
    trackErrorInDebugPanel(error, context);
  };
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(e) {
  // Skip if modal is open or if inside a text input
  if (document.querySelector('.modal.show') || 
      e.target.tagName === 'INPUT' || 
      e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  // Handle Ctrl+Key combinations
  if (e.ctrlKey) {
    switch(e.key) {
      case '1': // Switch to File Processor tab
        e.preventDefault();
        const fileTab = document.getElementById('file-tab');
        if (fileTab) {
          const tabInstance = new bootstrap.Tab(fileTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to File Processor tab', 'info');
        }
        break;
        
      case '2': // Switch to Playlist tab
        e.preventDefault();
        const playlistTab = document.getElementById('playlist-tab');
        if (playlistTab) {
          const tabInstance = new bootstrap.Tab(playlistTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to Playlist Downloader tab', 'info');
        }
        break;
        
      case '3': // Switch to Web Scraper tab
        e.preventDefault();
        const scraperTab = document.getElementById('scraper-tab');
        if (scraperTab) {
          const tabInstance = new bootstrap.Tab(scraperTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to Web Scraper tab', 'info');
        }
        break;
        
      case '4': // Switch to History tab
        e.preventDefault();
        const historyTab = document.getElementById('history-tab');
        if (historyTab) {
          const tabInstance = new bootstrap.Tab(historyTab);
          tabInstance.show();
          showToast('Navigation', 'Switched to History tab', 'info');
        }
        break;
        
      case 'o': // Open JSON
        e.preventDefault();
        const activeTab = document.querySelector('.tab-pane.active');
        let openButton;
        
        if (activeTab && activeTab.id === 'file') {
          openButton = document.getElementById('open-btn');
        } else if (activeTab && activeTab.id === 'playlist') {
          openButton = document.getElementById('open-playlist-json');
        } else if (activeTab && activeTab.id === 'scraper') {
          openButton = document.getElementById('open-scraper-json');
        }
        
        if (openButton && !openButton.disabled && !openButton.closest('.d-none')) {
          openButton.click();
          showToast('Action', 'Opening JSON file', 'info');
        }
        break;
        
      case 'n': // New Task
        e.preventDefault();
        const activeNewBtn = document.querySelector('.tab-pane.active .btn[id$="-new-task-btn"]:not(.d-none)');
        if (activeNewBtn && !activeNewBtn.disabled) {
          activeNewBtn.click();
          showToast('Action', 'Starting new task', 'info');
        }
        break;
        
      case 'h': // Help
        e.preventDefault();
        toggleHelpMode();
        break;
    }
  }
  
  // Handle Escape key
  if (e.key === 'Escape') {
    // Close help tooltips if any
    removeHelpTooltips();
    
    // Close modals if any (handled by Bootstrap, just for reference)
  }
}

// =============================================================================
// SECTION 14: ACADEMIC SEARCH INTEGRATION
// =============================================================================

/**
 * Initialize academic search functionality
 */
function initializeAcademicSearch() {
  // Connect to the academic search field
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSearchBtn = document.getElementById('academic-search-btn');
  const academicSourcesSelect = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  const addSelectedPapersBtn = document.getElementById('add-selected-papers');
  
  // Add search button event handler
  if (academicSearchBtn) {
    academicSearchBtn.addEventListener('click', performAcademicSearch);
  }
  
  // Add enter key handler for search input
  if (academicSearchInput) {
    academicSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        performAcademicSearch();
      }
    });
  }
  
  // Add selected papers button handler
  if (addSelectedPapersBtn) {
    addSelectedPapersBtn.addEventListener('click', addSelectedPapers);
  }
  
  console.log("Academic search functionality initialized");
}


/**
 * Perform academic search with appropriate visual feedback
 */
function performAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  // Validate query
  const query = academicSearchInput.value.trim();
  if (!query) {
    showToast('Error', 'Please enter a search query', 'error');
    return;
  }
  
  // Get selected source
  const source = academicSources.value;
  
  // Show loading indicator
  academicResults.classList.remove('d-none');
  academicResultsContainer.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Searching academic sources...</p>
    </div>
  `;
  
  // Call API endpoint for academic search
  fetch('/api/academic-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Display results
    displayAcademicResults(data.results || []);
    
    // Show toast
    if (data.results && data.results.length > 0) {
      showToast('Success', `Found ${data.results.length} papers matching "${query}"`, 'success');
    } else {
      showToast('Notice', 'No results found. Try different search terms or sources.', 'warning');
    }
  })
  .catch(error => {
    console.error('Academic search error:', error);
    
    // Show error in results container
    academicResultsContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-circle me-2"></i>
        Error: ${error.message || 'Failed to perform search'}
      </div>
    `;
    
    // Show toast
    showToast('Error', error.message || 'Search failed', 'error');
    
    // Fallback to mock results in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log("Using mock results for development");
      displayAcademicResults(getMockSearchResults(query, source));
    }
  });
}
// 1. Enhanced academic search with filters
async function academicSearch(query, options = {}) {
  const { 
    source = 'all', 
    sortBy = 'relevance',
    dateRange = null,
    limit = 20
  } = options;
  
  // Convert arxiv abstract URLs to PDF URLs
  const toAcademicPdfUrl = (url) => {
    if (url.includes('arxiv.org/abs/')) {
      return url.replace('arxiv.org/abs/', 'arxiv.org/pdf/') + '.pdf';
    }
    return url;
  };
  
  try {
    // Construct API URL with filters
    let apiUrl = `/api/academic/search?query=${encodeURIComponent(query)}`;
    
    if (source !== 'all') {
      apiUrl += `&source=${encodeURIComponent(source)}`;
    }
    
    if (sortBy) {
      apiUrl += `&sort=${encodeURIComponent(sortBy)}`;
    }
    
    if (dateRange) {
      apiUrl += `&from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`;
    }
    
    if (limit) {
      apiUrl += `&limit=${limit}`;
    }
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process results to ensure PDF URLs are correct
    if (data.results) {
      data.results = data.results.map(paper => ({
        ...paper,
        pdf_url: paper.pdf_url ? toAcademicPdfUrl(paper.pdf_url) : null
      }));
    }
    
    return data;
  } catch (error) {
    console.error('Academic search error:', error);
    throw error;
  }
}

// 2. Improved PDF detection for academic papers
async function checkIsPdf(url) {
  // Special handling for known academic repositories
  const isArxivPdf = url.includes('arxiv.org/pdf/');
  const isDoi = url.includes('doi.org/');
  
  if (isArxivPdf) {
    return true;
  }
  
  if (isDoi) {
    // DOIs need special handling to resolve to actual content
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'Accept': 'application/pdf' }
      });
      
      const contentType = response.headers.get('Content-Type');
      return contentType && contentType.includes('pdf');
    } catch (e) {
      return false;
    }
  }
  
  // Standard check
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AcademicParser/1.0)' }
    });
    
    const contentType = response.headers.get('Content-Type');
    return contentType && contentType.includes('pdf');
  } catch (e) {
    // If we can't check, assume based on URL
    return url.toLowerCase().endsWith('.pdf');
  }
}

// 3. Extract and process citations
function extractCitations(pdfText) {
  // Simple regex-based citation extraction
  // This is a simplified approach - a full implementation would use NLP
  const citations = [];
  
  // Match patterns like [1], [2-4], etc.
  const citationRegex = /\[([\d\s,-]+)\]/g;
  let match;
  
  while ((match = citationRegex.exec(pdfText)) !== null) {
    citations.push({
      rawText: match[0],
      indices: match[1].split(/[\s,-]/).map(i => parseInt(i.trim())).filter(i => !isNaN(i))
    });
  }
  
  // Match reference section
  const referenceSectionRegex = /references|bibliography/i;
  const refSectionMatch = referenceSectionRegex.exec(pdfText);
  
  if (refSectionMatch) {
    const referencesStart = refSectionMatch.index;
    const referencesText = pdfText.substring(referencesStart);
    
    // Simple pattern matching for references
    // Example: "[1] Author, Title, Journal, Year"
    const referenceEntryRegex = /\[(\d+)\](.*?)(?=\[\d+\]|$)/gs;
    let refMatch;
    
    while ((refMatch = referenceEntryRegex.exec(referencesText)) !== null) {
      const index = parseInt(refMatch[1]);
      const text = refMatch[2].trim();
      
      citations.push({
        index,
        text,
        type: 'reference_entry'
      });
    }
  }
  
  return citations;
}
/**
 * Display academic search results in the results container
 */
function displayAcademicResults(results) {
  const academicResultsContainer = document.getElementById('academic-results-container');
  if (!academicResultsContainer) return;
  
  // Handle empty results
  if (!results || results.length === 0) {
    academicResultsContainer.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        No results found. Try a different search term or source.
      </div>
    `;
    return;
  }
  
  // Clear previous results
  academicResultsContainer.innerHTML = '';
  
  // Add each result to the container
  results.forEach((paper, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'paper-result-item list-group-item list-group-item-action';
    resultItem.dataset.paperId = paper.id;
    resultItem.dataset.paperUrl = paper.pdf_url || paper.url;
    resultItem.dataset.paperTitle = paper.title;
    
    // Source badge
    let sourceBadge = '';
    if (paper.source === 'arxiv') {
      sourceBadge = '<span class="academic-source-badge academic-source-arxiv me-2">arXiv</span>';
    } else if (paper.source === 'semantic') {
      sourceBadge = '<span class="academic-source-badge academic-source-semantic me-2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex') {
      sourceBadge = '<span class="academic-source-badge academic-source-openalex me-2">OpenAlex</span>';
    }
    
    // Build result item HTML
    resultItem.innerHTML = `
      <div class="d-flex align-items-start">
        <div class="form-check mt-1 me-2">
          <input class="form-check-input paper-select" type="checkbox" id="paper-${index}">
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <h6 class="mb-1">${paper.title}</h6>
          </div>
          <div class="mb-1">
            ${sourceBadge}
            <small class="text-muted">${paper.authors ? paper.authors.join(', ') : 'Unknown authors'}</small>
          </div>
          <p class="mb-1 small">${paper.abstract || 'No abstract available'}</p>
          <div class="mt-2">
            <span class="badge bg-light text-dark me-2">
              <i class="fas fa-file-pdf me-1 text-danger"></i> PDF ${paper.pdf_url ? 'Available' : 'Unavailable'}
            </span>
            <span class="badge bg-light text-dark">
              <i class="fas fa-calendar-alt me-1"></i> ${paper.date || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    `;
    
    // Add event handler to toggle selection when clicking on the item
    resultItem.addEventListener('click', function(e) {
      // Don't toggle if clicking on the checkbox directly
      if (e.target.type !== 'checkbox') {
        const checkbox = this.querySelector('.paper-select');
        checkbox.checked = !checkbox.checked;
      }
      
      // Toggle selected class for visual feedback
      this.classList.toggle('selected', this.querySelector('.paper-select').checked);
    });
    
    // Add to results container
    academicResultsContainer.appendChild(resultItem);
  });
}

/**
 * Add selected papers to the scraper URL list
 */
function addSelectedPapers() {
  const academicResultsContainer = document.getElementById('academic-results-container');
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  
  if (!academicResultsContainer || !scraperUrlsContainer) return;
  
  // Get selected papers
  const selectedPapers = academicResultsContainer.querySelectorAll('.paper-select:checked');
  
  if (selectedPapers.length === 0) {
    showToast('Warning', 'Please select at least one paper', 'warning');
    return;
  }
  
  // Add each selected paper to the scraper URLs
  selectedPapers.forEach(checkbox => {
    const paperItem = checkbox.closest('.paper-result-item');
    const paperUrl = paperItem.dataset.paperUrl;
    const paperTitle = paperItem.dataset.paperTitle;
    
    if (paperUrl) {
      // Add as PDF download
      addPaperToScraperUrls(paperUrl, paperTitle);
    }
  });
  
  // Show confirmation toast
  showToast('Success', `Added ${selectedPapers.length} papers to scraping list`, 'success');
  
  // Update PDF info section visibility
  updatePdfInfoSection();
}

/**
 * Add a paper to the scraper URLs list
 */
function addPaperToScraperUrls(url, title) {
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  if (!scraperUrlsContainer) return;
  
  // Create a new URL input group
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
  container.dataset.academic = 'true';
  
  container.innerHTML = `
    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" value="${url}" required />
    <select class="form-select scraper-settings" style="max-width: 160px;">
      <option value="pdf" selected>PDF Download</option>
      <option value="metadata">Metadata Only</option>
      <option value="full">Full Text</option>
      <option value="title">Title Only</option>
      <option value="keyword">Keyword Search</option>
    </select>
    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
    <button type="button" class="btn btn-outline-danger remove-url">
      <i class="fas fa-trash"></i>
    </button>
  `;
  
  // Add title as tooltip
  const urlInput = container.querySelector('.scraper-url');
  if (title) {
    urlInput.setAttribute('title', title);
    
    // Also add a custom badge with the title
    const badge = document.createElement('span');
    badge.className = 'position-absolute translate-middle badge rounded-pill bg-primary';
    badge.style.top = '-5px';
    badge.style.right = '-5px';
    badge.innerHTML = '<i class="fas fa-graduation-cap"></i>';
    badge.setAttribute('title', title);
    
    container.style.position = 'relative';
    container.appendChild(badge);
  }
  
  // Set up event listeners
  const settingsSelect = container.querySelector('.scraper-settings');
  settingsSelect.addEventListener('change', handleScraperSettingsChange);
  
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    container.remove();
    updatePdfInfoSection();
  });
  
  // Add to container
  scraperUrlsContainer.appendChild(container);
}

/**
 * Generate mock search results for development/testing
 */
function getMockSearchResults(query, source) {
  const mockResults = [
    {
      id: 'arxiv:2103.14030',
      title: `Recent Advances in ${query.charAt(0).toUpperCase() + query.slice(1)}`,
      authors: ['Smith, John', 'Johnson, Maria', 'Zhang, Wei'],
      abstract: `This paper provides an overview of ${query.toLowerCase()} techniques in deep neural networks, with applications in computer vision and natural language processing.`,
      pdf_url: 'https://arxiv.org/pdf/2103.14030.pdf',
      url: 'https://arxiv.org/abs/2103.14030',
      source: 'arxiv',
      date: '2023-05-15'
    },
    {
      id: 'semantic:85f2fb3a',
      title: `${query.charAt(0).toUpperCase() + query.slice(1)}: A Comprehensive Survey`,
      authors: ['Williams, Robert', 'Chen, Li'],
      abstract: `This survey provides a comprehensive overview of ${query.toLowerCase()} methods and their applications in various domains.`,
      pdf_url: 'https://www.example.com/papers/comprehensive_survey.pdf',
      url: 'https://www.semanticscholar.org/paper/comprehensive-survey',
      source: 'semantic',
      date: '2022-11-03'
    },
    {
      id: 'openalex:W3212567289',
      title: `${query.charAt(0).toUpperCase() + query.slice(1)} in Practice: Industry Applications`,
      authors: ['Garcia, Ana', 'Kumar, Raj', 'Brown, Steve'],
      abstract: `This paper explores recent advances in ${query.toLowerCase()} for industrial applications, with a focus on efficient methods for resource-constrained environments.`,
      pdf_url: 'https://www.example.com/papers/industry_applications.pdf',
      url: 'https://openalex.org/W3212567289',
      source: 'openalex',
      date: '2023-02-21'
    }
  ];
  
  // Filter by source if needed
  if (source !== 'all') {
    return mockResults.filter(result => result.source === source);
  }
  
  return mockResults;
}

//===========================
// Enhanced PDF Module System
//===========================

class PdfProcessor {
  constructor() {
    this.modules = []; // Available processor modules in priority order
    this.activeModule = null;
    this.capabilities = {
      tables: false,
      ocr: false,
      structure: false,
      repair: false
    };
    this.initialized = false;
  }

  async initialize() {
    // Try to initialize modules in priority order
    const possibleModules = [
      {
        name: 'pdf_extractor',
        check: () => pdf_extractor_available,
        get: () => pdf_extractor,
        init: async (module) => {
          const result = await module.initialize_module();
          return {
            tables: result.capabilities?.tables || false,
            ocr: result.capabilities?.ocr || false,
            structure: result.capabilities?.structure || false,
            repair: result.capabilities?.repair || false
          };
        }
      },
      {
        name: 'structify',
        check: () => structify_available && structify_module.process_pdf,
        get: () => structify_module,
        init: async () => ({
          tables: true, 
          ocr: true, 
          structure: false, 
          repair: false
        })
      },
      // Minimal fallback using PyMuPDF (if available)
      {
        name: 'pymupdf',
        check: () => {
          try {
            return require.resolve('fitz') !== null;
          } catch (e) {
            return false;
          }
        },
        get: () => require('fitz'),
        init: async () => ({
          tables: false, 
          ocr: false, 
          structure: false, 
          repair: false
        })
      }
    ];

    for (const moduleConfig of possibleModules) {
      try {
        if (moduleConfig.check()) {
          const module = moduleConfig.get();
          const capabilities = await moduleConfig.init(module);
          
          this.modules.push({
            name: moduleConfig.name,
            module,
            capabilities
          });
          
          logger.info(`Initialized PDF module: ${moduleConfig.name} with capabilities: ${JSON.stringify(capabilities)}`);
        }
      } catch (e) {
        logger.warn(`Failed to initialize PDF module ${moduleConfig.name}: ${e.message}`);
      }
    }

    if (this.modules.length > 0) {
      this.activeModule = this.modules[0];
      this.capabilities = this.activeModule.capabilities;
      this.initialized = true;
      logger.info(`Using PDF processor: ${this.activeModule.name}`);
      return true;
    }

    // Create minimal fallback if no modules available
    this.activeModule = {
      name: 'minimal',
      module: {
        process_pdf: this._minimalProcessPdf.bind(this)
      },
      capabilities: {
        tables: false,
        ocr: false,
        structure: false,
        repair: false
      }
    };
    this.initialized = true;
    logger.warn("Using minimal PDF processor with limited capabilities");
    return false;
  }

  // Fallback minimal PDF processor using built-in modules
  async _minimalProcessPdf(pdf_path, output_path, options = {}) {
    // Simple extraction using native modules
    const fs = require('fs');
    
    try {
      // Verify the file exists and is readable
      await fs.promises.access(pdf_path, fs.constants.R_OK);
      
      // Create basic JSON with minimal metadata
      const stats = await fs.promises.stat(pdf_path);
      
      const result = {
        file_path: pdf_path,
        file_size: stats.size,
        processing_date: new Date().toISOString(),
        status: "limited_processing",
        message: "Processed with minimal capabilities",
        chunks: [{
          text: "PDF content not available with minimal processor",
          page: 1
        }],
        metadata: {
          filename: pdf_path.split('/').pop()
        }
      };
      
      // Write the result to the output path
      await fs.promises.writeFile(
        output_path, 
        JSON.stringify(result, null, 2)
      );
      
      return result;
    } catch (e) {
      throw new Error(`Minimal PDF processing failed: ${e.message}`);
    }
  }

  async processPdf(pdf_path, output_path, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate inputs
    if (!pdf_path || typeof pdf_path !== 'string') {
      throw new Error('Invalid PDF path');
    }

    // Default options merged with user options
    const mergedOptions = {
      extract_tables: this.capabilities.tables,
      use_ocr: this.capabilities.ocr,
      extract_structure: this.capabilities.structure,
      chunk_size: 4096,
      ...options
    };

    // Metadata to track processing
    const processingMeta = {
      startTime: Date.now(),
      module: this.activeModule.name,
      retryCount: 0,
      memoryOptimized: false
    };

    try {
      // Attempt processing with active module
      return await this._processWithRetry(
        pdf_path, 
        output_path, 
        mergedOptions, 
        processingMeta
      );
    } catch (error) {
      // If primary module fails, try fallbacks
      logger.error(`PDF processing failed with ${this.activeModule.name}: ${error.message}`);
      
      // Try other modules in order if available
      for (let i = 1; i < this.modules.length; i++) {
        try {
          const fallbackModule = this.modules[i];
          logger.info(`Attempting fallback processing with ${fallbackModule.name}`);
          
          processingMeta.module = fallbackModule.name;
          processingMeta.retryCount = 0;
          
          return await this._processWithModule(
            fallbackModule.module,
            pdf_path,
            output_path, 
            mergedOptions,
            processingMeta
          );
        } catch (fallbackError) {
          logger.error(`Fallback ${this.modules[i].name} failed: ${fallbackError.message}`);
        }
      }

      // All processing attempts failed
      throw new Error(`PDF processing failed with all available modules: ${error.message}`);
    }
  }

  async _processWithRetry(pdf_path, output_path, options, meta, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        meta.retryCount = attempt;
        
        // On retry attempts, use more conservative options
        if (attempt > 0) {
          options = this._getMemoryOptimizedOptions(options, attempt);
          meta.memoryOptimized = true;
        }
        
        return await this._processWithModule(
          this.activeModule.module,
          pdf_path,
          output_path,
          options,
          meta
        );
      } catch (error) {
        // Check if error is memory-related
        if (attempt < maxRetries && this._isMemoryError(error)) {
          logger.warn(`Memory error on attempt ${attempt+1}, retrying with reduced options`);
          continue;
        }
        
        // Otherwise propagate the error
        throw error;
      }
    }
  }

  async _processWithModule(module, pdf_path, output_path, options, meta) {
    // Add timing and tracking
    const startTime = Date.now();
    
    try {
      // Use the appropriate processing method based on module
      let result;
      
      if (module.process_pdf) {
        result = await module.process_pdf(pdf_path, output_path, options);
      } else if (module.extract_text_from_pdf) {
        // If only text extraction is available
        const extractedData = await module.extract_text_from_pdf(pdf_path);
        
        // Format into standard result structure
        result = {
          status: "success",
          file_path: pdf_path,
          metadata: extractedData.metadata || {},
          full_text: extractedData.full_text || "",
          page_count: extractedData.page_count || 0,
          chunks: [{
            text: extractedData.full_text || "",
            page: 1
          }]
        };
        
        // Write result to output path
        await fs.promises.writeFile(
          output_path, 
          JSON.stringify(result, null, 2)
        );
      } else {
        throw new Error("Module doesn't have a supported processing method");
      }
      
      // Add processing metadata
      result.processing_info = {
        module: meta.module,
        retries: meta.retryCount,
        memory_optimized: meta.memoryOptimized,
        elapsed_seconds: (Date.now() - startTime) / 1000
      };
      
      return result;
    } catch (e) {
      const errorInfo = {
        module: meta.module,
        retries: meta.retryCount,
        memory_optimized: meta.memoryOptimized,
        elapsed_seconds: (Date.now() - startTime) / 1000,
        error: e.message
      };
      
      logger.error(`PDF processing error: ${JSON.stringify(errorInfo)}`);
      throw e;
    }
  }

  _getMemoryOptimizedOptions(options, retryAttempt) {
    // Progressively disable memory-intensive features
    const optimizedOptions = {...options};
    
    if (retryAttempt >= 1) {
      // First level optimization
      optimizedOptions.extract_tables = false;
      optimizedOptions.chunk_size = Math.min(options.chunk_size, 2048);
    }
    
    if (retryAttempt >= 2) {
      // Second level optimization
      optimizedOptions.use_ocr = false;
      optimizedOptions.extract_structure = false;
      optimizedOptions.chunk_size = Math.min(options.chunk_size, 1024);
    }
    
    return optimizedOptions;
  }

  _isMemoryError(error) {
    const errorStr = error.toString().toLowerCase();
    return (
      errorStr.includes('memory') || 
      errorStr.includes('allocation') || 
      errorStr.includes('heap') ||
      errorStr.includes('out of memory')
    );
  }
}

// Initialize the processor when the app starts
const pdfProcessor = new PdfProcessor();
pdfProcessor.initialize().then(success => {
  if (success) {
    logger.info(`PDF processor initialized with capabilities: ${JSON.stringify(pdfProcessor.capabilities)}`);
  } else {
    logger.warn('PDF processor initialized with limited capabilities');
  }
});


// Enhanced OCR detection and configuration
class OcrManager {
  constructor() {
    this.tesseractPath = null;
    this.tessdataPath = null;
    this.available = false;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return this.available;
    
    try {
      // Try to import pytesseract
      const pytesseract = await this._importPytesseract();
      if (!pytesseract) {
        logger.warn('Pytesseract not available');
        this.initialized = true;
        return false;
      }
      
      // Find Tesseract executable
      this.tesseractPath = await this._findTesseractPath();
      if (!this.tesseractPath) {
        logger.warn('Tesseract executable not found');
        this.initialized = true;
        return false;
      }
      
      // Set the path in pytesseract
      pytesseract.pytesseract.tesseract_cmd = this.tesseractPath;
      
      // Find or create tessdata directory
      this.tessdataPath = await this._setupTessdata();
      
      // Set environment variable
      process.env.TESSDATA_PREFIX = this.tessdataPath;
      
      // Test OCR on a simple image
      await this._testOcr(pytesseract);
      
      this.available = true;
      this.initialized = true;
      logger.info(`OCR initialized successfully: ${this.tesseractPath}, ${this.tessdataPath}`);
      return true;
    } catch (e) {
      logger.error(`OCR initialization failed: ${e.message}`);
      this.available = false;
      this.initialized = true;
      return false;
    }
  }

  async _importPytesseract() {
    try {
      return require('pytesseract');
    } catch (e) {
      return null;
    }
  }

  async _findTesseractPath() {
    const possiblePaths = [
      // Linux paths
      '/usr/bin/tesseract',
      '/usr/local/bin/tesseract',
      // Windows paths
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
      // MacOS (Homebrew)
      '/usr/local/Cellar/tesseract/*/bin/tesseract',
      '/opt/homebrew/bin/tesseract'
    ];
    
    // Check if any of the paths exist
    const fs = require('fs');
    for (const path of possiblePaths) {
      try {
        // Handle glob patterns for MacOS paths
        if (path.includes('*')) {
          const glob = require('glob');
          const matches = glob.sync(path);
          if (matches.length > 0) {
            return matches[0];
          }
          continue;
        }
        
        // Regular path check
        await fs.promises.access(path, fs.constants.X_OK);
        return path;
      } catch (e) {
        // Path doesn't exist or isn't executable
      }
    }
    
    // Try to find in PATH
    try {
      const { execSync } = require('child_process');
      const isWindows = process.platform === 'win32';
      
      const output = execSync(
        isWindows ? 'where tesseract' : 'which tesseract', 
        { encoding: 'utf8' }
      ).trim();
      
      if (output) {
        return output.split('\n')[0]; // Take first found path
      }
    } catch (e) {
      // Command failed, tesseract not in PATH
    }
    
    return null;
  }

  async _setupTessdata() {
    const fs = require('fs');
    const path = require('path');
    
    // Create tessdata in app directory
    const tessdataDir = path.join(__dirname, 'temp', 'tessdata');
    await fs.promises.mkdir(tessdataDir, { recursive: true });
    
    // Check for eng.traineddata
    const engTraineddata = path.join(tessdataDir, 'eng.traineddata');
    
    try {
      await fs.promises.access(engTraineddata, fs.constants.R_OK);
      logger.info('eng.traineddata already exists');
    } catch (e) {
      // File doesn't exist, try to download it
      await this._downloadTraineddata(engTraineddata);
    }
    
    return tessdataDir;
  }

  async _downloadTraineddata(targetPath) {
    const fs = require('fs');
    
    logger.info('Downloading eng.traineddata...');
    
    try {
      // Try node-fetch or axios
      let fetch;
      try {
        fetch = require('node-fetch');
      } catch (e) {
        fetch = require('axios').get;
      }
      
      // URL for English language data
      const url = 'https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata';
      
      // Download file
      const response = await fetch(url, { responseType: 'arraybuffer' });
      const data = response.data || await response.buffer();
      
      // Save to file
      await fs.promises.writeFile(targetPath, data);
      
      logger.info(`eng.traineddata downloaded to ${targetPath}`);
      return true;
    } catch (e) {
      logger.error(`Failed to download eng.traineddata: ${e.message}`);
      
      // Try to copy from system location if download fails
      try {
        const systemLocations = [
          '/usr/share/tesseract-ocr/4.00/tessdata/eng.traineddata',
          '/usr/share/tessdata/eng.traineddata',
          'C:\\Program Files\\Tesseract-OCR\\tessdata\\eng.traineddata'
        ];
        
        for (const location of systemLocations) {
          try {
            await fs.promises.access(location, fs.constants.R_OK);
            await fs.promises.copyFile(location, targetPath);
            logger.info(`Copied eng.traineddata from ${location}`);
            return true;
          } catch (e) {
            // Try next location
          }
        }
        
        logger.error('Could not download or copy eng.traineddata');
        return false;
      } catch (copyError) {
        logger.error(`Error copying traineddata: ${copyError.message}`);
        return false;
      }
    }
  }

  async _testOcr(pytesseract) {
    // Test OCR by creating a simple image with text
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(200, 80);
    const ctx = canvas.getContext('2d');
    
    // Draw some text on the canvas
    ctx.font = '30px Arial';
    ctx.fillStyle = 'black';
    ctx.fillText('Testing OCR', 10, 50);
    
    // Save canvas to a temporary file
    const fs = require('fs');
    const path = require('path');
    const tempPngPath = path.join(__dirname, 'temp', 'ocr_test.png');
    
    const buffer = canvas.toBuffer('image/png');
    await fs.promises.writeFile(tempPngPath, buffer);
    
    // Try OCR on the test image
    try {
      const text = await pytesseract.pytesseract.recognize(tempPngPath);
      if (!text || !text.trim().includes('Testing')) {
        throw new Error(`OCR test failed, got: ${text}`);
      }
      logger.info(`OCR test successful: "${text.trim()}"`);
      
      // Clean up test file
      await fs.promises.unlink(tempPngPath);
      return true;
    } catch (e) {
      logger.error(`OCR test failed: ${e.message}`);
      // Clean up test file
      try {
        await fs.promises.unlink(tempPngPath);
      } catch (err) {
        // Ignore cleanup error
      }
      return false;
    }
  }

  // Use this method for any OCR operations
  async performOcr(imagePath, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.available) {
      throw new Error('OCR is not available');
    }
    
    try {
      const pytesseract = require('pytesseract');
      
      // Set custom options
      const ocrOptions = {
        lang: options.lang || 'eng',
        psm: options.psm || 3, // Page segmentation mode
        oem: options.oem || 3, // OCR Engine mode
        ...options.config
      };
      
      // Run OCR
      return await pytesseract.pytesseract.recognize(
        imagePath, 
        ocrOptions
      );
    } catch (e) {
      logger.error(`OCR operation failed: ${e.message}`);
      throw new Error(`OCR failed: ${e.message}`);
    }
  }
}

// Initialize OCR manager
const ocrManager = new OcrManager();
ocrManager.initialize().then(available => {
  if (available) {
    logger.info('OCR system initialized successfully');
  } else {
    logger.warn('OCR system not available');
  }
});


// =============================================================================
// SECTION 15: ERROR RECOVERY & DEBUGGING UTILITIES
// =============================================================================

/**
 * Check for critical elements and initialize recovery mode if needed
 */
function checkCriticalElements() {
  const criticalElements = [
    { id: 'input-dir', name: 'Input Directory field' },
    { id: 'output-file', name: 'Output Filename field' },
    { id: 'submit-btn', name: 'Submit button' },
    { id: 'process-form', name: 'Processing form' },
    { id: 'progress-container', name: 'Progress container' }
  ];
  
  const missingElements = criticalElements.filter(element => !document.getElementById(element.id));
  
  if (missingElements.length > 0) {
    console.error('Critical UI elements missing:', missingElements.map(e => e.name).join(', '));
    
    // Show emergency message
    const mainContainer = document.querySelector('main.container');
    if (mainContainer) {
      const alertHtml = `
        <div class="alert alert-danger mt-4">
          <h4 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>UI Initialization Error</h4>
          <p>Some critical UI elements could not be found:</p>
          <ul>
            ${missingElements.map(e => `<li>${e.name} (id: ${e.id})</li>`).join('')}
          </ul>
          <hr>
          <p class="mb-0">
            <button type="button" class="btn btn-danger" onclick="window.location.reload()">
              <i class="fas fa-sync me-1"></i> Reload Page
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="initializeDebugMode()">
              <i class="fas fa-bug me-1"></i> Initialize Debug Mode
            </button>
          </p>
        </div>
      `;
      
      // Add alert before existing content
      mainContainer.insertAdjacentHTML('afterbegin', alertHtml);
    }
    
    return false;
  }
  
  return true;
}


/**
 * Initialize debug mode for troubleshooting UI issues
 */
function initializeDebugMode() {
  console.log("Initializing debug mode...");
  
  // Create or get debug panel
  let debugPanel = document.getElementById('debug-panel');
  
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.className = 'debug-panel card position-fixed bottom-0 end-0 m-3';
    debugPanel.style.zIndex = '9999';
    debugPanel.style.maxWidth = '400px';
    debugPanel.style.maxHeight = '80vh';
    debugPanel.style.overflow = 'auto';
    
    // Add debug panel content
    debugPanel.innerHTML = `
      <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <span><i class="fas fa-bug me-1"></i> Debug Panel</span>
        <div>
          <button type="button" class="btn btn-sm btn-outline-light me-1" id="debug-refresh">
            <i class="fas fa-sync"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-light" id="debug-close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="card-body debug-content">
        <h6>Element Status:</h6>
        <div id="debug-element-status" class="mb-3">Loading...</div>
        
        <h6>Event Listeners:</h6>
        <div id="debug-event-listeners" class="mb-3">Loading...</div>
        
        <h6>Local Storage:</h6>
        <div id="debug-local-storage" class="mb-3">Loading...</div>
        
        <h6>Actions:</h6>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-warning" id="debug-clear-storage">
            Clear Storage
          </button>
          <button type="button" class="btn btn-sm btn-danger" id="debug-reset-app">
            Reset App
          </button>
          <button type="button" class="btn btn-sm btn-info" id="debug-test-socket">
            Test Socket
          </button>
        </div>
      </div>
    `;
    
    // Add to body
    document.body.appendChild(debugPanel);
  }
  
  // Add event listeners
  document.getElementById('debug-close').addEventListener('click', () => {
    debugPanel.remove();
  });
  
  document.getElementById('debug-refresh').addEventListener('click', () => {
    updateDebugPanel();
  });
  
  document.getElementById('debug-clear-storage').addEventListener('click', () => {
    localStorage.clear();
    sessionStorage.clear();
    updateDebugPanel();
    showToast('Debug', 'Storage cleared', 'warning');
  });
  
  document.getElementById('debug-reset-app').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the app? This will clear all data and reload the page.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  });
  
  document.getElementById('debug-test-socket').addEventListener('click', () => {
    testSocketConnection();
  });
  
  // Initial update
  updateDebugPanel();
  
  console.log("Debug mode initialized");
}

/**
 * Debug Panel UI Improvements
 * This script adds a minimize button to the debug panel and improves its behavior
 */

// Add this code to main.js at the end of the initializeDebugMode function

function enhanceDebugPanel() {
  console.log("Enhancing debug panel...");
  
  // Get the debug panel element - note the hyphenated ID
  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) {
    console.error("Debug panel element not found");
    return false;
  }
  
  // Clear existing content while keeping the header
  const debugHeader = debugPanel.querySelector('.card-header');
  const debugContent = debugPanel.querySelector('.card-body.debug-content');
  
  if (debugContent) {
    // Keep existing structure but update content
    debugContent.innerHTML = '';
  } else {
    // If structure doesn't exist, create it from scratch
    debugPanel.innerHTML = `
      <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <span><i class="fas fa-bug me-1"></i> Debug Panel</span>
        <div>
          <button type="button" class="btn btn-sm btn-outline-light me-1" id="debug-refresh">
            <i class="fas fa-sync"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-light" id="debug-close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="card-body debug-content"></div>
    `;
    
    // Get the newly created content container
    const debugContent = debugPanel.querySelector('.card-body.debug-content');
    
    // Add event handlers for header buttons
    const refreshBtn = debugPanel.querySelector('#debug-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', updateDebugPanel);
    }
    
    const closeBtn = debugPanel.querySelector('#debug-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        debugPanel.style.display = 'none';
        localStorage.setItem('debugMode', 'false');
      });
    }
  }
  
  // Re-get content container to ensure we have it
  const contentContainer = debugPanel.querySelector('.card-body.debug-content');
  if (!contentContainer) {
    console.error("Debug content container not found");
    return false;
  }
  
  // Build the debug panel sections
  let panelHtml = '';
  
  // 1. Element Status Section
  panelHtml += `
    <h6>Element Status:</h6>
    <div id="debug-element-status" class="mb-3">Loading...</div>
    
    <h6>Event Listeners:</h6>
    <div id="debug-event-listeners" class="mb-3">Loading...</div>
    
    <h6>Local Storage:</h6>
    <div id="debug-local-storage" class="mb-3">Loading...</div>
    
    <h6>Actions:</h6>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-warning" id="debug-clear-storage">
        Clear Storage
      </button>
      <button type="button" class="btn btn-sm btn-danger" id="debug-reset-app">
        Reset App
      </button>
      <button type="button" class="btn btn-sm btn-info" id="debug-test-socket">
        Test Socket
      </button>
      <button type="button" class="btn btn-sm btn-success" id="debug-fix-listeners">
        Fix Event Listeners
      </button>
    </div>
  `;
  
  // Set the HTML content
  contentContainer.innerHTML = panelHtml;
  
  // Add event handlers for action buttons
  document.getElementById('debug-clear-storage')?.addEventListener('click', function() {
    localStorage.clear();
    sessionStorage.clear();
    updateDebugPanel();
    showToast('Debug', 'Storage cleared', 'warning');
  });
  
  document.getElementById('debug-reset-app')?.addEventListener('click', function() {
    if (confirm('Are you sure you want to reset the app? This will clear all data and reload the page.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  });
  
  document.getElementById('debug-test-socket')?.addEventListener('click', testSocketConnection);
  
  document.getElementById('debug-fix-listeners')?.addEventListener('click', function() {
    setupEventListeners();
    showToast('Debug', 'Event listeners reset', 'info');
    setTimeout(updateDebugPanel, 500);
  });
  
  // Update sections with actual data
  updateDebugPanelData();
  
  // Make sure the debug panel is visible
  debugPanel.style.display = 'block';
  
  console.log("Debug panel enhanced successfully");
  return true;
}

function updateDebugPanelData() {
  // Element Status
  const elementStatusContainer = document.getElementById('debug-element-status');
  if (elementStatusContainer) {
    const validationResults = window.uiValidationResults || validateUIElements();
    
    let statusHtml = '<ul class="list-group">';
    validationResults.forEach(item => {
      const statusClass = item.exists ? 'text-success' : 'text-danger';
      const statusIcon = item.exists ? 'fa-check-circle' : 'fa-times-circle';
      
      statusHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${item.name}
          <span class="${statusClass}"><i class="fas ${statusIcon}"></i> ${item.exists ? 'Found' : 'Missing'}</span>
        </li>
      `;
    });
    statusHtml += '</ul>';
    
    elementStatusContainer.innerHTML = statusHtml;
  }
  
  // Event Listeners
  const eventListenersContainer = document.getElementById('debug-event-listeners');
  if (eventListenersContainer) {
    // Use the verification function already in main.js to check listeners
    const listenerStatus = {
      "File form submit": processForm && (processForm.onsubmit || hasEventListener(processForm, 'submit')),
      "Browse button click": browseBtn && (browseBtn.onclick || hasEventListener(browseBtn, 'click')),
      "Playlist form submit": playlistForm && (playlistForm.onsubmit || hasEventListener(playlistForm, 'submit')),
      "Scraper form submit": scraperForm && (scraperForm.onsubmit || hasEventListener(scraperForm, 'submit')),
      "Socket.IO connection": socket && socket.connected
    };
    
    let listenersHtml = '<ul class="list-group">';
    for (const [key, value] of Object.entries(listenerStatus)) {
      const statusClass = value ? 'text-success' : 'text-danger';
      const statusIcon = value ? 'fa-check-circle' : 'fa-times-circle';
      
      listenersHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${key}
          <span class="${statusClass}"><i class="fas ${statusIcon}"></i> ${value ? 'Yes' : 'No'}</span>
        </li>
      `;
    }
    listenersHtml += '</ul>';
    
    eventListenersContainer.innerHTML = listenersHtml;
  }
  
  // Local Storage
  const localStorageContainer = document.getElementById('debug-local-storage');
  if (localStorageContainer) {
    const storageKeys = Object.keys(localStorage);
    
    if (storageKeys.length === 0) {
      localStorageContainer.innerHTML = '<div class="alert alert-info">No items in localStorage</div>';
    } else {
      let storageHtml = '<div class="accordion" id="storage-accordion">';
      storageHtml += `
        <div class="accordion-item">
          <h2 class="accordion-header" id="storage-heading">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#storage-collapse">
              localStorage Items (${storageKeys.length})
            </button>
          </h2>
          <div id="storage-collapse" class="accordion-collapse collapse" aria-labelledby="storage-heading" data-bs-parent="#storage-accordion">
            <div class="accordion-body p-0">
              <table class="table table-sm table-striped mb-0">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
      `;
      
      storageKeys.forEach(key => {
        let value = localStorage.getItem(key);
        // Truncate long values
        if (value && value.length > 100) {
          value = value.substring(0, 100) + '...';
        }
        storageHtml += `<tr><td>${key}</td><td>${escapeHtml(value)}</td></tr>`;
      });
      
      storageHtml += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      `;
      
      localStorageContainer.innerHTML = storageHtml;
    }
  }
}

function testSocketConnection() {
  if (!socket) {
    showToast('Socket Test', 'Socket not initialized. Trying to connect...', 'warning');
    initializeSocket();
    setTimeout(() => {
      if (socket && socket.connected) {
        showToast('Socket Test', 'Socket connection established!', 'success');
      } else {
        showToast('Socket Test', 'Failed to establish socket connection', 'error');
      }
    }, 1000);
    return;
  }
  
  if (socket.connected) {
    showToast('Socket Test', 'Socket is connected with ID: ' + socket.id, 'success');
    
    // Send ping to server
    try {
      socket.emit('ping', { timestamp: Date.now() });
      showToast('Socket Test', 'Ping sent to server', 'info');
    } catch (e) {
      showToast('Socket Test', 'Error sending ping: ' + e.message, 'error');
    }
  } else {
    showToast('Socket Test', 'Socket is disconnected. Trying to reconnect...', 'warning');
    
    try {
      socket.connect();
      setTimeout(() => {
        if (socket.connected) {
          showToast('Socket Test', 'Socket reconnected successfully!', 'success');
        } else {
          showToast('Socket Test', 'Failed to reconnect socket', 'error');
        }
      }, 1000);
    } catch (e) {
      showToast('Socket Test', 'Error reconnecting: ' + e.message, 'error');
    }
  }
}

function updateDebugPanel() {
  console.log("Updating debug panel...");
  updateDebugPanelData();
  showToast('Debug', 'Debug panel updated', 'info');
}

function updateAppStatusSection() {
  const appStatusContent = document.getElementById('appStatusContent');
  if (!appStatusContent) return;
  
  const appStatus = {
    "Application Initialized": window.appInitialized ? "Yes" : "No",
    "Current Tab": document.querySelector('.tab-pane.active')?.id || "None",
    "Dark Mode": document.body.classList.contains('dark-mode') ? "Enabled" : "Disabled",
    "Help Mode": document.body.classList.contains('help-mode') ? "Enabled" : "Disabled",
    "Window Size": `${window.innerWidth}x${window.innerHeight}`,
    "Last Error": window.lastError || "None"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(appStatus)) {
    html += `<tr><td class="fw-bold">${key}</td><td>${value}</td></tr>`;
  }
  html += '</table>';
  
  appStatusContent.innerHTML = html;
}

function updateEventListenersSection() {
  const eventListenersContent = document.getElementById('eventListenersContent');
  if (!eventListenersContent) return;
  
  // Check critical event listeners
  const listenerStatus = {
    "File form submit": processForm ? "Yes" : "No",
    "Browse button click": browseBtn ? "Yes" : "No",
    "Playlist form submit": playlistForm ? "Yes" : "No",
    "Scraper form submit": scraperForm ? "Yes" : "No",
    "Socket.IO connection": socket && socket.connected ? "Yes" : "No"
  };
  
  let html = '<ul class="list-group">';
  for (const [listener, status] of Object.entries(listenerStatus)) {
    const iconClass = status === "Yes" ? "fas fa-check-circle text-success" : "fas fa-times-circle text-danger";
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      ${listener}
      <span><i class="${iconClass}"></i> ${status}</span>
    </li>`;
  }
  html += '</ul>';
  
  html += '<div class="mt-2"><button id="debug-fix-listeners" class="btn btn-sm btn-warning">Fix Event Listeners</button></div>';
  
  eventListenersContent.innerHTML = html;
  
  // Add click handler for the fix button
  const fixButton = eventListenersContent.querySelector('#debug-fix-listeners');
  if (fixButton) {
    fixButton.addEventListener('click', function() {
      setupEventListeners();
      showToast('Debug', 'Event listeners reset', 'info');
      setTimeout(updateEventListenersSection, 500);
    });
  }
}

function updateUIElementsSection() {
  const uiElementsContent = document.getElementById('uiElementsContent');
  if (!uiElementsContent) return;
  
  // List critical UI elements and their status
  const elements = {
    "Process Form": processForm ? "Found" : "Missing",
    "Browse Button": browseBtn ? "Found" : "Missing",
    "Input Directory Field": inputDirField ? "Found" : "Missing",
    "Progress Bar": progressBar ? "Found" : "Missing",
    "Progress Status": progressStatus ? "Found" : "Missing",
    "Scraper Form": scraperForm ? "Found" : "Missing",
    "Scraper Progress Bar": scraperProgressBar ? "Found" : "Missing",
    "Playlist Form": playlistForm ? "Found" : "Missing",
    "Playlist Progress Bar": playlistProgressBar ? "Found" : "Missing"
  };
  
  let html = '<div class="accordion" id="uiElementsAccordion">';
  html += '<div class="accordion-item">';
  html += '<h2 class="accordion-header" id="uiElementsHeading">';
  html += '<button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#uiElementsCollapse" aria-expanded="false" aria-controls="uiElementsCollapse">';
  html += 'Critical UI Elements';
  html += '</button></h2>';
  
  html += '<div id="uiElementsCollapse" class="accordion-collapse collapse" aria-labelledby="uiElementsHeading" data-bs-parent="#uiElementsAccordion">';
  html += '<div class="accordion-body p-0">';
  html += '<table class="table table-sm table-striped m-0">';
  html += '<thead><tr><th>Element</th><th>Status</th></tr></thead><tbody>';
  
  for (const [element, status] of Object.entries(elements)) {
    const statusClass = status === "Found" ? "text-success" : "text-danger";
    html += `<tr><td>${element}</td><td class="${statusClass}">${status}</td></tr>`;
  }
  
  html += '</tbody></table>';
  html += '</div></div></div>';
  
  // Add a button to reload UI elements
  html += '<div class="mt-2"><button id="debug-reload-ui" class="btn btn-sm btn-info">Reload UI Elements</button></div>';
  
  uiElementsContent.innerHTML = html;
  
  // Add click handler for reload button
  const reloadButton = uiElementsContent.querySelector('#debug-reload-ui');
  if (reloadButton) {
    reloadButton.addEventListener('click', function() {
      getUIElements();
      showToast('Debug', 'UI elements reloaded', 'info');
      setTimeout(updateUIElementsSection, 500);
    });
  }
}

function updateSocketStatusSection() {
  const socketStatusContent = document.getElementById('socketStatusContent');
  if (!socketStatusContent) return;
  
  // Get Socket.IO status
  const socketInfo = {
    "Connected": socket && socket.connected ? "Yes" : "No",
    "Socket ID": socket && socket.id ? socket.id : "N/A",
    "Connection Attempts": socket ? (socket._reconnectionAttempts || 0) : "N/A",
    "Polling Status": socket && socket.io ? (socket.io.engine.transport.name || "N/A") : "N/A",
    "Last Event": window.lastSocketEvent || "None",
    "Last Error": window.lastSocketError || "None"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(socketInfo)) {
    const valueClass = (key === "Connected" && value === "No") ? "text-danger" : "";
    html += `<tr><td class="fw-bold">${key}</td><td class="${valueClass}">${value}</td></tr>`;
  }
  html += '</table>';
  
  // Add reconnect button
  html += '<div class="mt-2">';
  html += '<button id="debug-socket-reconnect" class="btn btn-sm btn-primary me-2">Reconnect Socket</button>';
  html += '<button id="debug-socket-fallback" class="btn btn-sm btn-secondary">Enable Polling</button>';
  html += '</div>';
  
  socketStatusContent.innerHTML = html;
  
  // Add click handlers
  const reconnectButton = socketStatusContent.querySelector('#debug-socket-reconnect');
  if (reconnectButton) {
    reconnectButton.addEventListener('click', function() {
      // Attempt to reconnect the socket
      if (socket) {
        try {
          socket.disconnect();
          socket.connect();
          showToast('Debug', 'Socket reconnection initiated', 'info');
        } catch (e) {
          console.error("Error reconnecting socket:", e);
          showToast('Error', 'Failed to reconnect: ' + e.message, 'error');
        }
      } else {
        initializeSocket();
        showToast('Debug', 'New socket connection initiated', 'info');
      }
      
      setTimeout(updateSocketStatusSection, 1000);
    });
  }
  
  const fallbackButton = socketStatusContent.querySelector('#debug-socket-fallback');
  if (fallbackButton) {
    fallbackButton.addEventListener('click', function() {
      startStatusPolling();
      showToast('Debug', 'Status polling enabled', 'info');
    });
  }
}

function updateTaskInfoSection() {
  const taskInfoContent = document.getElementById('taskInfoContent');
  if (!taskInfoContent) return;
  
  // Get current task information
  const taskInfo = {
    "Current Task ID": currentTaskId || "None",
    "Task Type": getCurrentTaskType() || "None",
    "Status Polling Active": statusCheckInterval ? "Yes" : "No",
    "Last Progress Update": window.lastProgressUpdate ? new Date(window.lastProgressUpdate).toLocaleTimeString() : "None",
    "Last Progress Value": window.lastProgressValue !== undefined ? `${window.lastProgressValue}%` : "N/A"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(taskInfo)) {
    html += `<tr><td class="fw-bold">${key}</td><td>${value}</td></tr>`;
  }
  html += '</table>';
  
  // Add actions for task management
  if (currentTaskId) {
    html += '<div class="mt-2">';
    html += '<button id="debug-request-status" class="btn btn-sm btn-info me-2">Request Status</button>';
    html += '<button id="debug-cancel-task" class="btn btn-sm btn-danger">Cancel Task</button>';
    html += '</div>';
  } else {
    html += '<div class="alert alert-info mt-2 mb-0 py-2">No active task</div>';
  }
  
  taskInfoContent.innerHTML = html;
  
  // Add click handlers if we have an active task
  if (currentTaskId) {
    const statusButton = taskInfoContent.querySelector('#debug-request-status');
    if (statusButton) {
      statusButton.addEventListener('click', function() {
        // Request status update
        if (socket && socket.connected) {
          socket.emit('request_status', { task_id: currentTaskId });
          showToast('Debug', 'Status update requested', 'info');
        } else {
          // Use fetch instead
          fetch(`/api/status/${currentTaskId}`)
            .then(response => response.json())
            .then(data => {
              updateProgress(data);
              showToast('Debug', 'Status updated via API', 'info');
            })
            .catch(error => {
              console.error("Error requesting status:", error);
              showToast('Error', 'Failed to get status: ' + error.message, 'error');
            });
        }
      });
    }
    
    const cancelButton = taskInfoContent.querySelector('#debug-cancel-task');
    if (cancelButton) {
      cancelButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to cancel the current task?')) {
          cancelCurrentTask();
        }
      });
    }
  }
}

function updateActionsSection() {
  const actionsContent = document.getElementById('debugActionsContent');
  if (!actionsContent) return;
  
  let html = '<div class="d-flex flex-wrap gap-2">';
  
  // App-wide actions
  html += '<button id="debug-clear-storage" class="btn btn-sm btn-outline-danger">Clear Storage</button>';
  html += '<button id="debug-reload-app" class="btn btn-sm btn-outline-primary">Reload App</button>';
  html += '<button id="debug-toggle-dark" class="btn btn-sm btn-outline-secondary">Toggle Dark Mode</button>';
  html += '<button id="debug-download-logs" class="btn btn-sm btn-outline-info">Download Logs</button>';
  html += '<button id="debug-clear-console" class="btn btn-sm btn-outline-warning">Clear Console</button>';
  
  html += '</div>';
  
  // Advanced diagnostics
  html += '<div class="mt-2">';
  html += '<button id="debug-run-diagnostics" class="btn btn-sm btn-success">Run Full Diagnostics</button>';
  html += '</div>';
  
  actionsContent.innerHTML = html;
  
  // Add click handlers
  const clearStorageBtn = actionsContent.querySelector('#debug-clear-storage');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', function() {
      if (confirm('This will clear all local storage data. Continue?')) {
        localStorage.clear();
        sessionStorage.clear();
        showToast('Debug', 'Storage cleared', 'warning');
      }
    });
  }
  
  const reloadAppBtn = actionsContent.querySelector('#debug-reload-app');
  if (reloadAppBtn) {
    reloadAppBtn.addEventListener('click', function() {
      showToast('Debug', 'Reloading application...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }
  
  const toggleDarkBtn = actionsContent.querySelector('#debug-toggle-dark');
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener('click', function() {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
      updateAppStatusSection();
    });
  }
  
  const downloadLogsBtn = actionsContent.querySelector('#debug-download-logs');
  if (downloadLogsBtn) {
    downloadLogsBtn.addEventListener('click', function() {
      // Create a log file with console output
      const logs = window.consoleLog || [];
      const logText = logs.map(entry => {
        const timestamp = new Date(entry.timestamp).toISOString();
        return `[${timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`;
      }).join('\n');
      
      // Create download
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neurogen-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Debug', 'Logs downloaded', 'success');
    });
  }
  
  const clearConsoleBtn = actionsContent.querySelector('#debug-clear-console');
  if (clearConsoleBtn) {
    clearConsoleBtn.addEventListener('click', function() {
      console.clear();
      window.consoleLog = [];
      showToast('Debug', 'Console cleared', 'info');
    });
  }
  
  const runDiagnosticsBtn = actionsContent.querySelector('#debug-run-diagnostics');
  if (runDiagnosticsBtn) {
    runDiagnosticsBtn.addEventListener('click', function() {
      showToast('Debug', 'Running diagnostics...', 'info');
      runFullDiagnostics();
    });
  }
}

function runFullDiagnostics() {
  console.log("Running full system diagnostics...");
  
  // Create diagnostics report
  const diagnostics = {
    timestamp: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      online: navigator.onLine
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    application: {
      initialized: window.appInitialized || false,
      darkMode: document.body.classList.contains('dark-mode'),
      currentTab: document.querySelector('.tab-pane.active')?.id || "None",
      lastError: window.lastError || "None"
    },
    uiElements: {},
    socket: {
      available: typeof io !== 'undefined',
      connected: socket && socket.connected || false,
      id: socket && socket.id || "N/A",
      namespace: socket && socket.nsp || "N/A",
      transport: socket && socket.io ? socket.io.engine.transport.name : "N/A",
      requestsCount: socket && socket.sendBuffer ? socket.sendBuffer.length : 0
    },
    task: {
      currentTaskId: currentTaskId || "None",
      taskType: getCurrentTaskType() || "None",
      pollingActive: statusCheckInterval ? true : false,
      lastProgress: window.lastProgressValue
    },
    localStorage: {},
    sessionStorage: {}
  };
  
  // Add UI elements status
  const criticalElements = [
    'processForm', 'browseBtn', 'inputDirField', 'progressBar', 'progressStatus',
    'scraperForm', 'scraperProgressBar', 'playlistForm', 'playlistProgressBar'
  ];
  
  criticalElements.forEach(element => {
    diagnostics.uiElements[element] = window[element] ? true : false;
  });
  
  // Add storage data summary (count by key prefix)
  const localStorageKeys = Object.keys(localStorage);
  const sessionStorageKeys = Object.keys(sessionStorage);
  
  const groupByPrefix = (keys) => {
    const groups = {};
    keys.forEach(key => {
      const prefix = key.split('-')[0] || key;
      groups[prefix] = (groups[prefix] || 0) + 1;
    });
    return groups;
  };
  
  diagnostics.localStorage = groupByPrefix(localStorageKeys);
  diagnostics.sessionStorage = groupByPrefix(sessionStorageKeys);
  
  // Display diagnostics
  console.log("Diagnostics Report:", diagnostics);
  
  // Show toast with summary
  const summary = `
    Browser: ${diagnostics.browser.userAgent.split(' ').pop()}
    App initialized: ${diagnostics.application.initialized}
    Socket connected: ${diagnostics.socket.connected}
    UI elements found: ${Object.values(diagnostics.uiElements).filter(Boolean).length}/${criticalElements.length}
    Current task: ${diagnostics.task.currentTaskId !== "None" ? "Active" : "None"}
  `;
  
  showToast('Diagnostics Complete', 'Results logged to console', 'info');
  
  // Try to fix any detected issues
  let issuesFound = false;
  
  // 1. Check if UI elements are missing
  const missingElements = Object.entries(diagnostics.uiElements)
    .filter(([_, exists]) => !exists)
    .map(([element, _]) => element);
    
  if (missingElements.length > 0) {
    console.warn("Missing UI elements:", missingElements);
    getUIElements();
    issuesFound = true;
  }
  
  // 2. Check if socket is disconnected but should be connected
  if (!diagnostics.socket.connected && diagnostics.socket.available) {
    console.warn("Socket is available but disconnected");
    initializeSocket();
    issuesFound = true;
  }
  
  // 3. Check if task status polling isn't working
  if (diagnostics.task.currentTaskId !== "None" && !diagnostics.task.pollingActive) {
    console.warn("Task is active but status polling is not");
    startStatusPolling();
    issuesFound = true;
  }
  
  // 4. Check if event listeners are missing
  verifyEventListeners();
  
  // Show results of fixes
  if (issuesFound) {
    showToast('Issues Fixed', 'Some issues were detected and fixed', 'warning');
    
    // Update debug panel after fixes
    setTimeout(() => {
      enhanceDebugPanel();
    }, 1000);
  } else {
    showToast('Diagnostics', 'No issues detected', 'success');
  }
  
  return diagnostics;
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  if (debugPanel.classList.contains('d-none')) {
    // Show and update panel
    enhanceDebugPanel();
    localStorage.setItem('debugMode', 'true');
  } else {
    // Hide panel
    debugPanel.classList.add('d-none');
    localStorage.setItem('debugMode', 'false');
  }
}

function verifyEventListeners() {
  console.log("Verifying event listeners...");
  
  let hasIssues = false;
  
  // Check form submit handlers
  if (processForm && !processForm._hasSubmitListener) {
    console.warn("Process form missing submit listener");
    processForm.addEventListener('submit', handleFileSubmit);
    processForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  if (playlistForm && !playlistForm._hasSubmitListener) {
    console.warn("Playlist form missing submit listener");
    playlistForm.addEventListener('submit', handlePlaylistSubmit);
    playlistForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  if (scraperForm && !scraperForm._hasSubmitListener) {
    console.warn("Scraper form missing submit listener");
    scraperForm.addEventListener('submit', handleScraperSubmit);
    scraperForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  // Check browse button
  if (browseBtn && !browseBtn._hasClickListener) {
    console.warn("Browse button missing click listener");
    browseBtn.addEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    browseBtn._hasClickListener = true;
    hasIssues = true;
  }
  
  // Check socket connection
  if (!socket || !socket.connected) {
    console.warn("Socket not connected");
    initializeSocket();
    hasIssues = true;
  }
  
  if (hasIssues) {
    console.log("Fixed event listener issues");
    updateEventListenersStatus();
    return false;
  }
  
  console.log("All event listeners verified");
  return true;
}

function updateEventListenersStatus() {
  // Update the event listeners debug display
  const listenerStatus = {
    "File form submit": processForm && processForm._hasSubmitListener ? "Yes" : "No",
    "Browse button click": browseBtn && browseBtn._hasClickListener ? "Yes" : "No",
    "Playlist form submit": playlistForm && playlistForm._hasSubmitListener ? "Yes" : "No",
    "Scraper form submit": scraperForm && scraperForm._hasSubmitListener ? "Yes" : "No",
    "Socket.IO connection": socket && socket.connected ? "Yes" : "No"
  };
  
  console.log("Event listener status:", listenerStatus);
  
  // If the debug panel has event listeners section, update it
  const eventListenersContent = document.getElementById('eventListenersContent');
  if (eventListenersContent) {
    updateEventListenersSection();
  }
}

function getCurrentTaskType() {
  try {
    // Check session storage first
    const taskType = sessionStorage.getItem('ongoingTaskType');
    if (taskType) return taskType;
    
    // Try to determine from active tab
    const activeTab = document.querySelector('.tab-pane.active');
    if (activeTab) {
      switch (activeTab.id) {
        case 'home':
          return 'process';
        case 'scraper':
          return 'scraper';
        case 'playlist':
          return 'playlist';
        default:
          return 'unknown';
      }
    }
    
    return null;
  } catch (e) {
    console.error("Error getting current task type:", e);
    return 'unknown';
  }
}

// Initialize console capture for logs if not already done
if (!window.consoleLog) {
  window.consoleLog = [];
  
  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };
  
  // Override console methods to capture logs
  ['log', 'warn', 'error', 'info'].forEach(method => {
    console[method] = function() {
      // Call original method
      originalConsole[method].apply(console, arguments);
      
      // Capture log
      const message = Array.from(arguments).map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      // Add to log array (limit to 1000 entries)
      window.consoleLog.push({
        timestamp: Date.now(),
        type: method,
        message: message
      });
      
      if (window.consoleLog.length > 1000) {
        window.consoleLog.shift();
      }
    };
  });
}
/**
 * Validate UI elements and update debug panel
 * This will check if critical elements exist and are properly initialized
 */
function validateUIElements() {
  // Create a list of critical elements to check
  const criticalElements = [
    { name: "Scraper URLs container", element: scraperUrlsContainer, id: "scraper-urls-container" },
    { name: "Playlist form", element: playlistForm, id: "playlist-form" },
    { name: "File form", element: processForm, id: "process-form" },
    { name: "Progress container", element: progressContainer, id: "progress-container" },
    { name: "History table", element: historyTableBody, id: "history-table-body" }
  ];
  
  // Store validation results to display in debug panel
  const validationResults = criticalElements.map(item => {
    const exists = !!item.element;
    return {
      name: item.name,
      exists: exists,
      id: item.id
    };
  });
  
  // Store global validation results for the debug panel
  window.uiValidationResults = validationResults;
  
  // Log validation results
  console.log("UI Element validation results:", validationResults);
  
  // If any critical elements are missing, try to create fallbacks
  const missingElements = validationResults.filter(item => !item.exists);
  if (missingElements.length > 0) {
    console.warn("Missing critical UI elements:", missingElements.map(e => e.name).join(', '));
    createFallbackElements(missingElements);
  }
  
  // Update event listeners status for debug panel
  updateEventListenersStatus();
  
  return missingElements.length === 0;
}

/**
 * Create fallback elements for missing critical UI components
 * @param {Array} missingElements - Array of missing element info
 */
function createFallbackElements(missingElements) {
  missingElements.forEach(item => {
    try {
      // Special handling for specific elements
      if (item.id === "scraper-urls-container" && !scraperUrlsContainer) {
        console.log("Creating fallback for scraperUrlsContainer");
        // Look for the container that should have the scraper URLs
        const scraperFormContainer = document.getElementById("scraper-form-container");
        
        if (scraperFormContainer) {
          // Find or create the container
          let container = document.getElementById(item.id);
          if (!container) {
            container = document.createElement("div");
            container.id = item.id;
            const form = scraperFormContainer.querySelector("form") || scraperFormContainer;
            // Try to insert it at the right position
            form.insertAdjacentHTML('afterbegin', `
              <div class="mb-4">
                <label class="form-label">Web Scraper URLs</label>
                <div id="${item.id}">
                  <div class="input-group mb-2">
                    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required />
                    <select class="form-select scraper-settings" style="max-width: 160px;">
                      <option value="full">Full Text</option>
                      <option value="metadata">Metadata Only</option>
                      <option value="title">Title Only</option>
                      <option value="keyword">Keyword Search</option>
                      <option value="pdf">PDF Download</option>
                    </select>
                    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
                    <button type="button" class="btn btn-outline-danger remove-url">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="add-scraper-url">
                  <i class="fas fa-plus me-1"></i> Add Another URL
                </button>
              </div>
            `);
            // Re-assign the element reference
            scraperUrlsContainer = document.getElementById(item.id);
            console.log("Created fallback element:", item.id);
          }
        }
      }
      // Add more fallbacks for other critical elements as needed
    } catch (e) {
      console.error(`Failed to create fallback for ${item.name}:`, e);
    }
  });
}

/**
 * Update the debug panel with latest information
 */
function updateDebugPanel() {
  const elementStatusContainer = document.getElementById('debug-element-status');
  const eventListenersContainer = document.getElementById('debug-event-listeners');
  const localStorageContainer = document.getElementById('debug-local-storage');
  
  if (elementStatusContainer) {
    const validationResults = window.uiValidationResults || [];
    
    // Create HTML for element status with improved styling
    let statusHtml = '<div class="list-group list-group-flush">';
    
    validationResults.forEach(item => {
      const statusClass = item.exists ? 'bg-success' : 'bg-danger';
      const statusText = item.exists ? 'Found' : 'Missing';
      
      statusHtml += `
        <div class="list-group-item d-flex justify-content-between align-items-center p-2">
          <span>${item.name}</span>
          <span class="badge ${statusClass} rounded-pill">
            ${statusText}
          </span>
        </div>
      `;
    });
    
    statusHtml += '</div>';
    elementStatusContainer.innerHTML = statusHtml;
  }
  
  // Update event listeners info
  if (eventListenersContainer) {
    const listenersInfo = getEventListenersInfo();
    eventListenersContainer.innerHTML = listenersInfo;
  }
  
  // Update local storage info
  if (localStorageContainer) {
    let storageHtml = '<div class="accordion" id="debug-storage-accordion">';
    
    // Local Storage
    storageHtml += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-local-storage">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                  data-bs-target="#collapse-local-storage" aria-expanded="false" aria-controls="collapse-local-storage">
            Local Storage (${Object.keys(localStorage).length} items)
          </button>
        </h2>
        <div id="collapse-local-storage" class="accordion-collapse collapse" 
             aria-labelledby="heading-local-storage" data-bs-parent="#debug-storage-accordion">
          <div class="accordion-body">
    `;
    
    if (Object.keys(localStorage).length === 0) {
      storageHtml += '<div class="alert alert-info">Local Storage is empty</div>';
    } else {
      storageHtml += '<ul class="list-group list-group-flush">';
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          let value = localStorage.getItem(key);
          // Try to pretty-print JSON
          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
            value = `<pre class="mb-0"><code>${escapeHtml(value)}</code></pre>`;
          } catch (e) {
            // Not JSON, just use the string
            value = escapeHtml(value);
          }
          
          storageHtml += `
            <li class="list-group-item p-2">
              <div><strong>${key}</strong></div>
              <div class="text-break">${value}</div>
            </li>
          `;
        }
      }
      storageHtml += '</ul>';
    }
    
    storageHtml += `
          </div>
        </div>
      </div>
    `;
    
    // Session Storage
    storageHtml += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-session-storage">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                  data-bs-target="#collapse-session-storage" aria-expanded="false" aria-controls="collapse-session-storage">
            Session Storage (${Object.keys(sessionStorage).length} items)
          </button>
        </h2>
        <div id="collapse-session-storage" class="accordion-collapse collapse" 
             aria-labelledby="heading-session-storage" data-bs-parent="#debug-storage-accordion">
          <div class="accordion-body">
    `;
    
    if (Object.keys(sessionStorage).length === 0) {
      storageHtml += '<div class="alert alert-info">Session Storage is empty</div>';
    } else {
      storageHtml += '<ul class="list-group list-group-flush">';
      for (const key in sessionStorage) {
        if (sessionStorage.hasOwnProperty(key)) {
          let value = sessionStorage.getItem(key);
          // Try to pretty-print JSON
          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
            value = `<pre class="mb-0"><code>${escapeHtml(value)}</code></pre>`;
          } catch (e) {
            // Not JSON, just use the string
            value = escapeHtml(value);
          }
          
          storageHtml += `
            <li class="list-group-item p-2">
              <div><strong>${key}</strong></div>
              <div class="text-break">${value}</div>
            </li>
          `;
        }
      }
      storageHtml += '</ul>';
    }
    
    storageHtml += `
          </div>
        </div>
      </div>
    `;
    
    storageHtml += '</div>'; // Close accordion
    
    localStorageContainer.innerHTML = storageHtml;
  }
}

/**
 * Get information about event listeners for debug panel
 */
function getEventListenersInfo() {
  const listenerStatus = {
    "File form submit": processForm && processForm._events && processForm._events.hasOwnProperty("submit"),
    "Browse button click": browseBtn && browseBtn._events && browseBtn._events.hasOwnProperty("click"),
    "Playlist form submit": playlistForm && playlistForm._events && playlistForm._events.hasOwnProperty("submit"),
    "Scraper form submit": scraperForm && scraperForm._events && scraperForm._events.hasOwnProperty("submit"),
    "Socket.IO connection": socket && socket.connected
  };
  
  // Check for event handlers using alternative method
  if (!listenerStatus["File form submit"] && processForm) {
    listenerStatus["File form submit"] = processForm.onsubmit !== null;
  }
  
  if (!listenerStatus["Browse button click"] && browseBtn) {
    listenerStatus["Browse button click"] = browseBtn.onclick !== null;
  }
  
  if (!listenerStatus["Playlist form submit"] && playlistForm) {
    listenerStatus["Playlist form submit"] = playlistForm.onsubmit !== null;
  }
  
  if (!listenerStatus["Scraper form submit"] && scraperForm) {
    listenerStatus["Scraper form submit"] = scraperForm.onsubmit !== null;
  }
  
  let html = '<div class="alert alert-info">';
  html += '<p>Event listeners currently registered:</p>';
  html += '<ul class="mb-0">';
  
  for (const [name, registered] of Object.entries(listenerStatus)) {
    const icon = registered 
      ? '<i class="fas fa-check-circle text-success"></i>' 
      : '<i class="fas fa-times-circle text-danger"></i>';
    html += `<li>${icon} ${name}: ${registered ? 'Yes' : 'No'}</li>`;
  }
  
  html += '</ul></div>';
  
  return html;
}

/**
 * Update the status of event listeners for debug panel
 */
function updateEventListenersStatus() {
  window.eventListenersStatus = {
    "File form submit": processForm ? "No" : "Element missing",
    "Browse button click": browseBtn ? "No" : "Element missing",
    "Playlist form submit": playlistForm ? "No" : "Element missing",
    "Scraper form submit": scraperForm ? "No" : "Element missing"
  };
  
  // Check for event handlers more accurately after they're set up
  setTimeout(() => {
    if (processForm && typeof handleFileSubmit === 'function') {
      window.eventListenersStatus["File form submit"] = "Yes";
    }
    
    if (browseBtn && typeof handleBrowseClick === 'function') {
      window.eventListenersStatus["Browse button click"] = "Yes";
    }
    
    if (playlistForm && typeof handlePlaylistSubmit === 'function') {
      window.eventListenersStatus["Playlist form submit"] = "Yes";
    }
    
    if (scraperForm && typeof handleScraperSubmit === 'function') {
      window.eventListenersStatus["Scraper form submit"] = "Yes";
    }
  }, 500);
}

/**
 * Test Socket.IO connection
 */
function testSocketConnection() {
  if (!socket) {
    showToast('Socket Test', 'Socket not initialized. Trying to connect...', 'warning');
    initializeSocket();
    setTimeout(() => {
      if (socket && socket.connected) {
        showToast('Socket Test', 'Socket connection established!', 'success');
      } else {
        showToast('Socket Test', 'Failed to establish socket connection', 'error');
      }
    }, 1000);
    return;
  }
  
  if (socket.connected) {
    showToast('Socket Test', 'Socket is connected with ID: ' + socket.id, 'success');
    
    // Send ping to server
    try {
      socket.emit('ping', { timestamp: Date.now() });
      showToast('Socket Test', 'Ping sent to server', 'info');
    } catch (e) {
      showToast('Socket Test', 'Error sending ping: ' + e.message, 'error');
    }
  } else {
    showToast('Socket Test', 'Socket is disconnected. Trying to reconnect...', 'warning');
    
    try {
      socket.connect();
      setTimeout(() => {
        if (socket.connected) {
          showToast('Socket Test', 'Socket reconnected successfully!', 'success');
        } else {
          showToast('Socket Test', 'Failed to reconnect socket', 'error');
        }
      }, 1000);
    } catch (e) {
      showToast('Socket Test', 'Error reconnecting: ' + e.message, 'error');
    }
  }
}

// =============================================================================
// SECTION 16: PERFORMANCE OPTIMIZATIONS
// =============================================================================

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time to wait in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Throttle function to limit how often a function can be called
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Optimize UI elements for better performance
 */
function optimizeUI() {
  // Apply debouncing to search field in history tab
  if (historySearch) {
    const debouncedRefresh = debounce(() => refreshHistoryTable(), 300);
    historySearch.removeEventListener('input', refreshHistoryTable);
    historySearch.addEventListener('input', debouncedRefresh);
  }
  
  // Optimize progress updates by throttling
  window.updateProgressBarThrottled = throttle(updateProgressBarElement, 100);
  
  // Optimize scroll events for smoother performance
  document.addEventListener('scroll', throttle(function() {
    // Do any scroll-based calculations here
  }, 100), { passive: true });
  
  // Optimize window resize events
  window.addEventListener('resize', debounce(function() {
    // Handle resize logic here
  }, 250), { passive: true });
  
  // Enable chunked rendering for large tables
  if (historyTableBody) {
    // Use a function to render in chunks if large dataset
    window.renderHistoryInChunks = function(data, chunkSize = 10) {
      if (data.length <= chunkSize) {
        // Small dataset, render normally
        data.forEach((item, index) => addTaskToHistoryTable(item, index));
        return;
      }
      
      // For large datasets, render in chunks for better UI responsiveness
      let currentIndex = 0;
      const totalItems = data.length;
      
      function renderNextChunk() {
        const endIndex = Math.min(currentIndex + chunkSize, totalItems);
        
        for (let i = currentIndex; i < endIndex; i++) {
          addTaskToHistoryTable(data[i], i);
        }
        
        currentIndex = endIndex;
        
        if (currentIndex < totalItems) {
          // Schedule next chunk
          setTimeout(renderNextChunk, 10);
        }
      }
      
      // Start rendering
      renderNextChunk();
    };
  }
  
  console.log("UI optimizations applied");
}

// =============================================================================
// SECTION 17: Playlists Fixes 
// =============================================================================


/**
 * Get playlist URLs from the form
 * Returns an array of URL strings
 */
function getPlaylistUrls() {
  const urls = [];
  const urlInputs = playlistUrlsContainer.querySelectorAll('.playlist-url');
  
  urlInputs.forEach(input => {
    const url = input.value.trim();
    if (url) {
      // Just push the URL string, not an object with a url property
      urls.push(url);
    }
  });
  
  console.log("Retrieved playlist URLs:", urls);
  return urls;
}


/**
 * Enhanced playlist download function with proper output path handling
 * @param {Array} playlistUrls - Array of playlist URLs
 * @param {string} rootDirectory - Root directory path
 * @param {string} outputFile - Output filename
 */
function startPlaylistDownload(playlistUrls, rootDirectory, outputFile) {
  // Show progress UI
  showPlaylistProgress();
  
  // Ensure outputFile doesn't have .json extension (backend adds it)
  if (outputFile.toLowerCase().endsWith('.json')) {
    outputFile = outputFile.slice(0, -5);
  }
  
  // Create the payload with explicit user-defined paths
  const payload = {
    playlists: playlistUrls, // Array of URL strings, not objects
    root_directory: rootDirectory, // User-specified directory is priority #1
    output_file: outputFile // User-specified filename is priority #1
  };
  
  console.log("Starting playlist download with payload:", payload);
  
  // Call the API to start the download
  fetch('/api/start-playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    // Store the task ID for status polling
    currentTaskId = data.task_id;
    
    // Save task information to sessionStorage for persistence
    sessionStorage.setItem('ongoingTaskId', currentTaskId);
    sessionStorage.setItem('ongoingTaskType', 'playlist');
    if (data.output_file) {
      sessionStorage.setItem('outputFile', data.output_file);
    }
    
    console.log('Playlist download started:', data);
    showToast('Processing Started', 'Your playlists are being downloaded...', 'info');
    
    // Start status polling
    startStatusPolling();
  })
  .catch(error => {
    console.error('Playlist download error:', error);
    showPlaylistError(error.message || 'Failed to start playlist download');
    
    // Reset UI
    playlistProgressContainer.classList.add('d-none');
    playlistFormContainer.classList.remove('d-none');
    
    // Reset button state
    playlistSubmitBtn.disabled = false;
    playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
  });
}

/**
 * Handle cancel button click for playlist downloads
 * This should be used instead of the generic handleCancelClick
 */
function handlePlaylistCancelClick() {
  if (!currentTaskId) return;
  
  // Confirm cancellation
  if (!confirm('Are you sure you want to cancel the current playlist download?')) {
    return;
  }
  
  // Call the cancel endpoint
  fetch(`/api/cancel/${currentTaskId}`, {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Cancel failed: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    showToast('Cancelled', 'Playlist download cancelled successfully', 'warning');
    
    // Return to form view
    playlistProgressContainer.classList.add('d-none');
    playlistFormContainer.classList.remove('d-none');
    
    // Reset button state
    playlistSubmitBtn.disabled = false;
    playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
    
    // Clear session storage
    currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  })
  .catch(error => {
    console.error('Cancel error:', error);
    showToast('Error', 'Failed to cancel task: ' + error.message, 'error');
  });
}

/**
 * Fix 1: Handle the playlist form submission event properly
 * This was missing in the original code, which is why the playlist form wasn't 
 * triggering the backend playlist downloader
 */
function handlePlaylistSubmit(e) {
  e.preventDefault();
  console.log("Playlist form submitted");
  
  // Collect all playlist URLs
  const urlInputs = playlistUrlsContainer.querySelectorAll('.playlist-url');
  const playlistUrls = Array.from(urlInputs).map(input => input.value.trim()).filter(url => url !== '');
  
  // Get other form values
  const rootDirectory = playlistRootField.value.trim();
  const outputFile = playlistOutputField.value.trim();
  
  // Validate inputs
  if (playlistUrls.length === 0) {
    showToast('Error', 'Please enter at least one YouTube playlist URL', 'error');
    return;
  }
  
  if (!rootDirectory) {
    showToast('Error', 'Please enter a download root directory', 'error');
    playlistRootField.classList.add('is-invalid');
    setTimeout(() => playlistRootField.classList.remove('is-invalid'), 3000);
    playlistRootField.focus();
    return;
  }
  
  if (!outputFile) {
    showToast('Error', 'Please enter an output filename', 'error');
    playlistOutputField.classList.add('is-invalid');
    setTimeout(() => playlistOutputField.classList.remove('is-invalid'), 3000);
    playlistOutputField.focus();
    return;
  }
  
  // Disable the submit button and show loading indicator
  playlistSubmitBtn.disabled = true;
  playlistSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
  
  // Show progress container
  showPlaylistProgress();
  
  // Fix 2: Format the playlist data correctly for the backend
  // This was incorrectly formatted in the original code
  const playlistData = {
    playlists: playlistUrls,
    root_directory: rootDirectory,
    output_file: outputFile
  };
  
  // Fix 3: Call the correct API endpoint
  // The original code was missing this call
  fetch('/api/start-playlists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(playlistData)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    // Store the task ID for status polling
    currentTaskId = data.task_id;
    
    // Save task information to sessionStorage for persistence
    sessionStorage.setItem('ongoingTaskId', currentTaskId);
    sessionStorage.setItem('ongoingTaskType', 'playlist');
    sessionStorage.setItem('outputFile', data.output_file);
    
    // Start status polling
    startStatusPolling();
    
    // Show notification
    showToast('Processing Started', 'Your playlists are being downloaded', 'info');
    
    console.log('Playlist download task started:', data);
  })
  .catch(error => {
    console.error('Playlist download error:', error);
    showPlaylistError(error.message || 'Failed to start playlist download');
    
    // Reset button state
    playlistSubmitBtn.disabled = false;
    playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
  });
}


/**
 * Show playlist error with improved transitions
 */
function showPlaylistError(error) {
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    playlistFormContainer.classList.remove('d-none');
    playlistFormContainer.classList.add('fade-in');
    
    // Show error toast
    showToast('Error', error, 'error');
    
    setTimeout(() => {
      playlistFormContainer.classList.remove('fade-in');
    }, 500);
    
    // Clear session storage as task failed
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
 * Update playlist progress statistics display
 */
function updatePlaylistProgressStats(statsElement, stats) {
  if (!statsElement || !stats) return;
  
  let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
  
  // Define standard fields with consistent styling
  const statFields = [
    {key: 'playlists_total', label: 'Total Playlists', badgeClass: 'bg-primary'},
    {key: 'playlists_processed', label: 'Processed Playlists', badgeClass: 'bg-success'},
    {key: 'total_videos', label: 'Total Videos', badgeClass: 'bg-info'},
    {key: 'videos_processed', label: 'Videos Processed', badgeClass: 'bg-success'},
    {key: 'completed_playlists', label: 'Completed Playlists', badgeClass: 'bg-success'},
    {key: 'empty_playlists', label: 'Empty Playlists', badgeClass: 'bg-warning'},
    {key: 'skipped_playlists', label: 'Skipped Playlists', badgeClass: 'bg-secondary'},
    {key: 'duration_seconds', label: 'Duration', badgeClass: 'bg-dark', formatter: formatDuration}
  ];
  
  // Generate stats HTML with consistent layout
  for (const field of statFields) {
    if (stats[field.key] !== undefined) {
      const value = field.formatter ? field.formatter(stats[field.key]) : stats[field.key];
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${field.label} <span class="badge ${field.badgeClass} rounded-pill">${value}</span>
        </li>`;
    }
  }
  
  statsHtml += '</ul>';
  statsElement.innerHTML = statsHtml;
}


/**
 * Enhanced progress bar update with smooth animations and reliable updates
 * @param {HTMLElement} barElement - The progress bar element to update
 * @param {number} targetPercent - The percentage to set (0-100)
 * @param {boolean} animated - Whether to animate the transition (default: true)
 */
function enhancedProgressBar(barElement, targetPercent, animated = true) {
  if (!barElement) {
    console.warn("Progress bar element not found");
    return;
  }
  
  // Ensure the value is a number and within bounds
  targetPercent = Math.min(100, Math.max(0, parseInt(targetPercent) || 0));
  
  // Store last progress for transition management
  if (!barElement.lastProgress) {
    barElement.lastProgress = 0;
  }
  
  // Only update if change is significant enough (prevents jitter)
  if (Math.abs(targetPercent - barElement.lastProgress) < 1) {
    return;
  }
  
  // Store current progress
  barElement.lastProgress = targetPercent;
  
  // Use requestAnimationFrame for smoother DOM updates
  requestAnimationFrame(() => {
    // Apply proper transition based on magnitude of change
    const jumpThreshold = 15; // % threshold for jumps
    
    if (!animated || Math.abs(targetPercent - parseFloat(barElement.style.width || '0')) > jumpThreshold) {
      barElement.style.transition = 'none';
    } else {
      barElement.style.transition = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    }
    
    // Set the width and other attributes
    barElement.style.width = `${targetPercent}%`;
    barElement.setAttribute('aria-valuenow', targetPercent);
    barElement.textContent = `${Math.round(targetPercent)}%`;
    
    // Handle completion styling
    if (targetPercent >= 100) {
      barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.add('bg-success', 'completed-animation');
    } else if (targetPercent > 0) {
      barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.remove('bg-success', 'completed-animation');
    }
  });
}

/**
 * Updates the progress status with fade transition
 * @param {HTMLElement} statusElement - The status element to update
 * @param {string} message - The status message to display
 */
function enhancedProgressStatus(statusElement, message) {
  if (!statusElement || !message) return;
  
  // Only update if the message has changed
  if (statusElement.textContent === message) return;
  
  // Add fade-out animation
  statusElement.classList.add('opacity-50');
  
  // Update text after a brief delay for animation effect
  setTimeout(() => {
    statusElement.textContent = message;
    statusElement.classList.remove('opacity-50');
  }, 200);
}

/**
 * Creates detailed statistics for the playlist progress
 * @param {HTMLElement} statsElement - The element to update with statistics
 * @param {Object} stats - The statistics object
 * @param {boolean} finalStats - Whether these are final statistics (more detailed)
 */
function enhancedPlaylistStats(statsElement, stats, finalStats = false) {
  if (!statsElement || !stats) return;
  
  // Create default stats object with fallback values if necessary
  const safeStats = {
    playlists_total: stats.playlists_total || stats.total_playlists || 0,
    playlists_processed: stats.playlists_processed || 0,
    total_videos: stats.total_videos || 0,
    videos_processed: stats.videos_processed || 0,
    completed_playlists: stats.completed_playlists || 0,
    empty_playlists: stats.empty_playlists || 0,
    skipped_playlists: stats.skipped_playlists || 0,
    duration_seconds: stats.duration_seconds || 0,
    download_directory: stats.download_directory || stats.root_directory || ''
  };
  
  // Use different layouts for progress vs final stats
  if (finalStats) {
    let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
    
    // Add stats with consistent styling for final display
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${safeStats.playlists_total}</span>
    </li>`;
    
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${safeStats.playlists_processed}</span>
    </li>`;
    
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${safeStats.total_videos}</span>
    </li>`;
    
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Duration <span class="badge bg-dark rounded-pill">${formatDuration(safeStats.duration_seconds)}</span>
    </li>`;
    
    if (safeStats.download_directory) {
      statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
        Download Directory <span class="text-muted small">${safeStats.download_directory}</span>
      </li>`;
    }
    
    statsHtml += '</ul>';
    
    // Add JSON view for detailed info
    if (stats.output_file) {
      statsHtml += addJsonView(stats, stats.output_file);
    }
    
    statsElement.innerHTML = statsHtml;
  } else {
    // Progress statistics with animated updates
    let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
    
    // Build stats with consistent styling and transitions
    statsHtml += `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        Total Playlists <span class="badge bg-primary rounded-pill">${safeStats.playlists_total}</span>
      </li>`;
    
    statsHtml += `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        Processed Playlists <span class="badge bg-success rounded-pill">${safeStats.playlists_processed}</span>
      </li>`;
    
    if (safeStats.total_videos > 0) {
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Total Videos <span class="badge bg-info rounded-pill">${safeStats.total_videos}</span>
        </li>`;
        
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Videos Processed <span class="badge bg-success rounded-pill">${safeStats.videos_processed}</span>
        </li>`;
    }
    
    if (safeStats.completed_playlists > 0) {
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Completed Playlists <span class="badge bg-success rounded-pill">${safeStats.completed_playlists}</span>
        </li>`;
    }
    
    if (safeStats.empty_playlists > 0) {
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Empty Playlists <span class="badge bg-warning rounded-pill">${safeStats.empty_playlists}</span>
        </li>`;
    }
    
    if (safeStats.skipped_playlists > 0) {
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Skipped Playlists <span class="badge bg-secondary rounded-pill">${safeStats.skipped_playlists}</span>
        </li>`;
    }
    
    if (safeStats.duration_seconds > 0) {
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          Duration <span class="badge bg-dark rounded-pill">${formatDuration(safeStats.duration_seconds)}</span>
        </li>`;
    }
    
    statsHtml += '</ul>';
    
    // Apply with fade transition if content has changed
    if (statsElement.innerHTML !== statsHtml) {
      statsElement.classList.add('opacity-75');
      setTimeout(() => {
        statsElement.innerHTML = statsHtml;
        statsElement.classList.remove('opacity-75');
      }, 150);
    }
  }
}

/**
 * Enhanced function to update progress for the playlist download tab
 * @param {Object} data - The progress data from the server
 */
function enhancedPlaylistProgress(data) {
  if (!data) return;
  
  // Update progress bar with enhanced animation
  if (typeof data.progress === 'number' && playlistProgressBar) {
    enhancedProgressBar(playlistProgressBar, data.progress);
  }
  
  // Update status message with enhanced transitions
  if (playlistProgressStatus) {
    if (data.message) {
      enhancedProgressStatus(playlistProgressStatus, data.message);
    } else if (data.status) {
      // Use a more descriptive status message based on the status code
      const statusMessages = {
        'processing': 'Processing playlist content...',
        'completed': 'Process completed successfully!',
        'failed': 'Process failed. Please check for errors.',
        'cancelled': 'Process was cancelled.'
      };
      enhancedProgressStatus(playlistProgressStatus, statusMessages[data.status] || `Status: ${data.status}`);
    }
  }
  
  // Update statistics with enhanced display
  if (data.stats && playlistProgressStats) {
    enhancedPlaylistStats(playlistProgressStats, data.stats);
  }
  
  // Handle task completion with smooth transitions
  if (data.status === 'completed') {
    playlistProgressContainer.classList.add('fade-out');
    
    setTimeout(() => {
      playlistProgressContainer.classList.add('d-none');
      playlistProgressContainer.classList.remove('fade-out');
      
      playlistResultsContainer.classList.remove('d-none');
      playlistResultsContainer.classList.add('fade-in');
      
      if (playlistStats && data.stats) {
        enhancedPlaylistStats(playlistStats, data.stats, true);
      }
      
      // Set output file for the Open JSON button
      if (openPlaylistJsonBtn && data.output_file) {
        openPlaylistJsonBtn.setAttribute('data-output-file', data.output_file);
      }
      
      setTimeout(() => {
        playlistResultsContainer.classList.remove('fade-in');
      }, 500);
      
      // Add task to history
      addTaskToHistory('playlist', data.output_file, data.stats);
      showToast('Success', 'Playlist download completed!', 'success');
    }, 300);
  }
  
  // Handle task errors with better UX
  if (data.status === 'failed' || data.error) {
    playlistProgressContainer.classList.add('fade-out');
    
    setTimeout(() => {
      playlistProgressContainer.classList.add('d-none');
      playlistProgressContainer.classList.remove('fade-out');
      
      // Show error toast
      showToast('Error', data.error || 'An error occurred during playlist processing', 'error');
      
      // Return to form view with smooth transition
      playlistFormContainer.classList.remove('d-none');
      playlistFormContainer.classList.add('fade-in');
      
      setTimeout(() => {
        playlistFormContainer.classList.remove('fade-in');
      }, 500);
    }, 300);
  }
}

/**
 * Socket event handler for progress updates from server
 * Properly aligned with ProcessingTask's progress_update events
 */
function setupProgressSocketHandler() {
  // Make sure we're listening to all possible event types
  socket.on('progress_update', function(data) {
      if (data.task_id === currentTaskId) {
          console.log('Progress update received:', data);
          
          // Extract progress data - support different possible structures
          let progressValue = data.progress;
          let message = data.message || data.stage || "Processing...";
          
          // Check if progress data is nested in a different format
          if (progressValue === undefined && data.detailed_progress) {
              const detailedProgress = data.detailed_progress;
              if (detailedProgress.progress_percent !== undefined) {
                  progressValue = detailedProgress.progress_percent;
              } else if (detailedProgress.processed_count !== undefined && detailedProgress.total_count) {
                  progressValue = Math.round((detailedProgress.processed_count / detailedProgress.total_count) * 100);
              }
              
              if (!message && detailedProgress.stage) {
                  message = detailedProgress.stage;
              }
          }
          
          // Handle legacy format where progress might be a string
          if (typeof progressValue === 'string') {
              progressValue = parseInt(progressValue, 10);
          }
          
          // Update UI if we have valid progress data
          if (!isNaN(progressValue)) {
              if (progressBar) {
                  updateProgressBarElement(progressBar, progressValue);
              }
              
              if (progressStatus) {
                  updateProgressStatus(progressStatus, message);
              }
              
              // Log progress to help debug
              console.log(`Updating progress: ${progressValue}% - ${message}`);
          } else {
              console.warn("Invalid progress value received:", data);
          }
          
          // Update stats if available
          if (data.stats && progressStats) {
              updateProgressStats(progressStats, data.stats);
          }
      }
  });
  
  // Also listen for any alternative event names that might be used
  const alternativeEvents = ['task_progress', 'file_progress', 'processing_progress'];
  alternativeEvents.forEach(eventName => {
      socket.on(eventName, function(data) {
          console.log(`Alternative progress event '${eventName}' received:`, data);
          // Re-route to our main handler
          if (data.task_id === currentTaskId) {
              updateProgress(data);
          }
      });
  });
}
/**
 * Clear polling interval safely
 */
function stopStatusPolling() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
    console.log("Status polling stopped");
  }
}


/**
 * Update the playlist progress statistics
 * This function is explicitly called to avoid TypeScript warnings
 * @param {HTMLElement} statsElement - The element to update
 * @param {Object} stats - The statistics object
 * @param {string} outputFile - Optional output file path
 */
function updatePlaylistStats(statsElement, stats, outputFile) {
  if (!statsElement) return;
  
  let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Add stats with consistent styling
  if (stats.playlists_total !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span></li>`;
  
  if (stats.playlists_processed !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span></li>`;
  
  if (stats.total_videos !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span></li>`;
  
  if (stats.duration_seconds !== undefined) 
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span></li>`;
  
  if (stats.download_directory !== undefined)
    statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">Download Directory <span class="text-muted small">${stats.download_directory}</span></li>`;
  
  statsHtml += '</ul>';
  
  // Add JSON view
  statsHtml += addJsonView(stats, outputFile);
  
  statsElement.innerHTML = statsHtml;
}

/**
 * Update progress statistics during active download
 * @param {HTMLElement} statsElement - The element to update
 * @param {Object} stats - The statistics object
 */
function updateProgressStats(statsElement, stats) {
  if (!statsElement || !stats) return;
  
  let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
  
  // Define standard fields with consistent styling
  const statFields = [
    {key: 'playlists_total', label: 'Total Playlists', badgeClass: 'bg-primary'},
    {key: 'playlists_processed', label: 'Processed Playlists', badgeClass: 'bg-success'},
    {key: 'total_videos', label: 'Total Videos', badgeClass: 'bg-info'},
    {key: 'videos_processed', label: 'Videos Processed', badgeClass: 'bg-success'},
    {key: 'completed_playlists', label: 'Completed Playlists', badgeClass: 'bg-success'},
    {key: 'empty_playlists', label: 'Empty Playlists', badgeClass: 'bg-warning'},
    {key: 'skipped_playlists', label: 'Skipped Playlists', badgeClass: 'bg-secondary'},
    {key: 'duration_seconds', label: 'Duration', badgeClass: 'bg-dark', formatter: formatDuration}
  ];
  
  // Generate stats HTML with consistent layout
  for (const field of statFields) {
    if (stats[field.key] !== undefined) {
      const value = field.formatter ? field.formatter(stats[field.key]) : stats[field.key];
      statsHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${field.label} <span class="badge ${field.badgeClass} rounded-pill">${value}</span>
        </li>`;
    }
  }
  
  statsHtml += '</ul>';
  
  // Apply with fade transition if content has changed
  if (statsElement.innerHTML !== statsHtml) {
    statsElement.classList.add('opacity-75');
    setTimeout(() => {
      statsElement.innerHTML = statsHtml;
      statsElement.classList.remove('opacity-75');
    }, 150);
  }
}


/**
 * Fix 5: Show playlist progress with improved transitions
 * This was missing or incomplete in the original code
 */
function showPlaylistProgress() {
  // Add fade transitions
  playlistFormContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistFormContainer.classList.add('d-none');
    playlistFormContainer.classList.remove('fade-out');
    
    playlistProgressContainer.classList.remove('d-none');
    playlistProgressContainer.classList.add('fade-in');
    
    // Reset progress elements
    if (playlistProgressBar) updateProgressBarElement(playlistProgressBar, 0);
    if (playlistProgressStatus) updateProgressStatus(playlistProgressStatus, "Initializing playlist download...");
    if (playlistProgressStats) playlistProgressStats.innerHTML = "";
    
    setTimeout(() => {
      playlistProgressContainer.classList.remove('fade-in');
    }, 500);
  }, 300);
}

/**
 * Fix 6: Consistent error handling in socket event handlers
 * Add missing handler for playlist_error event
 */
socket.on('playlist_error', function(data) {
  if (data.task_id === currentTaskId) {
    console.error('Playlist error:', data);
    
    // Clear any active polling
    stopStatusPolling();
    
    try {
      // Handle playlist error
      playlistProgressContainer.classList.add("d-none");
      playlistFormContainer.classList.remove("d-none");
      
      // Show error toast
      showToast('Error', data.error || 'An error occurred with the playlist download', 'error');
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
      console.error("Error handling playlist error:", e);
      showToast('Error', 'Error occurred: ' + (data.error || 'Unknown error'), 'error');
    }
  }
});

/**
 * Add CSS styles to fix the progress bar display
 */
function addProgressBarStyles() {
  // Create a style element
  const style = document.createElement('style');
  style.id = 'custom-progress-styles';
  
  // Add CSS to fix progress bar styling
  style.innerHTML = `
    /* Progress bar label positioning */
    .progress-bar {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: visible;
    }
    
    /* Ensure the label is centered and visible */
    .progress-label {
      position: absolute;
      color: white;
      font-weight: bold;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      z-index: 5;
    }
    
    /* Dark theme adjustments */
    [data-theme="dark"] .progress-label {
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
    }
    
    /* When progress is low, position label outside the bar */
    .progress-bar[aria-valuenow="0"] .progress-label,
    .progress-bar[aria-valuenow="1"] .progress-label,
    .progress-bar[aria-valuenow="2"] .progress-label,
    .progress-bar[aria-valuenow="3"] .progress-label,
    .progress-bar[aria-valuenow="4"] .progress-label,
    .progress-bar[aria-valuenow="5"] .progress-label {
      left: 105%;
      color: var(--bs-body-color);
      text-shadow: none;
    }
  `;
  
  // Add to the document
  document.head.appendChild(style);
}

/**
 * Initialize the enhanced progress bar functionality
 * Called during app initialization
 */
function initializeEnhancedProgress() {
  // Add the custom styles to fix the progress bar
  addProgressBarStyles();
  
  // Make sure we're using the correct function for playlist cancel button
  if (playlistCancelBtn) {
    playlistCancelBtn.removeEventListener('click', handleCancelClick);
    playlistCancelBtn.addEventListener('click', handlePlaylistCancelClick);
    console.log("Playlist cancel button listener added with correct handler");
  }
  
  console.log("Enhanced progress bar functionality initialized");
}

// Call the initialization when the document is ready
document.addEventListener('DOMContentLoaded', function() {
  // This will be called after the main initialization
  setTimeout(initializeEnhancedProgress, 500);
});


// History tab component JS

// Initialize history data
let historyData = [];

// Function to load history
function loadHistory() {
    // Show loading indicator
    document.getElementById('history-loading').style.display = 'block';
    document.getElementById('history-list').innerHTML = '';
    
    fetch('/api/history')
        .then(response => response.json())
        .then(data => {
            // Hide loading indicator
            document.getElementById('history-loading').style.display = 'none';
            
            // Update our history data
            historyData = data;
            
            // Render history items
            renderHistoryItems();
        })
        .catch(error => {
            document.getElementById('history-loading').style.display = 'none';
            document.getElementById('history-error').innerText = 'Failed to load history: ' + error.message;
            document.getElementById('history-error').style.display = 'block';
        });
}

// Function to render history items
function renderHistoryItems() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    
    if (historyData.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No history items found</div>';
        return;
    }
    
    historyData.forEach(item => {
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleString();
        
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // Icon based on type
        let typeIcon = 'file-document';
        if (item.type === 'file_scraper') {
            typeIcon = 'file-download';
        }
        
        historyItem.innerHTML = `
            <div class="history-icon"><i class="mdi mdi-${typeIcon}"></i></div>
            <div class="history-details">
                <div class="history-title">${item.filename}</div>
                <div class="history-timestamp">${formattedDate}</div>
                <div class="history-type">${item.type.replace('_', ' ')}</div>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// Listen for history updates
socket.on('history_updated', function(data) {
    // Add the new entry to our data
    historyData.unshift(data.new_entry);
    
    // Re-render the list
    renderHistoryItems();
});

// Load history when tab is shown
document.addEventListener('DOMContentLoaded', function() {
    // Initial load
    loadHistory();
    
    // Setup refresh button
    document.getElementById('refresh-history').addEventListener('click', loadHistory);
    
    // Setup tab switching
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // If clicking on history tab, refresh the data
            if (this.dataset.tab === 'history') {
                loadHistory();
            }
        });
    });
});

//==============================
// Section 18 - Enhancements 
// =============================



/**
 * Main initialization function to set up all enhanced features
 * This needs to be called in your application to use these functions
 */
function initializeEnhancedFeatures() {
  // Set up improved error handling
  window.handleErrorWithRecovery = handleErrorWithRecovery;
  
  // Configure server connectivity checks
  window.checkServerReachable = checkServerReachable;
  
  // Setup enhanced PDF processing
  window.processPDF = processPDF;
  
  // Make setupCompletionSafetyTimeout available
  window.setupCompletionSafetyTimeout = setupCompletionSafetyTimeout;
  
  console.log("Enhanced features initialized successfully");
  
  // Apply compatibility patches based on server version
  applyServerCompatibilityPatches();
}

/**
 * Apply workarounds for known server bugs
 */
function applyServerCompatibilityPatches() {
  // Fix for the 'include_audio' parameter error
  const originalPlaylistDownload = window.startPlaylistDownload;
  
  if (typeof originalPlaylistDownload === 'function') {
    window.startPlaylistDownload = function(params) {
      // Check if we're on an older server version that doesn't support include_audio
      if (params && params.include_audio !== undefined) {
        // Make a server version check
        fetch('/api/version')
          .then(response => response.json())
          .then(data => {
            // Check server version to determine if include_audio is supported
            const serverVersion = data.version || '';
            const supportsAudioParam = compareVersions(serverVersion, '1.5.0') >= 0;
            
            if (!supportsAudioParam) {
              console.warn("Server version doesn't support include_audio parameter, removing it");
              delete params.include_audio;
            }
            
            // Call original function with fixed params
            originalPlaylistDownload(params);
          })
          .catch(error => {
            console.warn("Couldn't check server version, removing potentially unsupported params:", error);
            // Remove potentially unsupported params
            delete params.include_audio;
            
            // Call original function with fixed params
            originalPlaylistDownload(params);
          });
      } else {
        // No problematic params, call original function
        originalPlaylistDownload(params);
      }
    };
  }
}

/**
 * Compare version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} - Negative if v1 < v2, positive if v1 > v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  // Fill with zeros to ensure equal length
  while (parts1.length < parts2.length) parts1.push(0);
  while (parts2.length < parts1.length) parts2.push(0);
  
  // Compare each part
  for (let i = 0; i < parts1.length; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}

// Initialize enhanced features
document.addEventListener('DOMContentLoaded', initializeEnhancedFeatures);
/**
 * Establishes a robust Socket.IO connection with advanced reliability features
 * @returns {Object} - The configured socket instance
 */
function setupRobustSocketConnection() {
  // Clean up existing socket if present
  if (window.socket) {
    try {
      console.log("Cleaning up existing socket connection");
      if (typeof window.socket.removeAllListeners === 'function') {
        window.socket.removeAllListeners();
      } else {
        // Remove critical event listeners individually
        ['connect', 'connect_error', 'disconnect', 'task_completed', 
         'progress_update', 'task_error', 'pdf_download_progress'].forEach(event => {
          window.socket.off(event);
        });
      }
      window.socket.close();
    } catch (e) {
      console.warn("Error cleaning up existing socket:", e);
    }
  }
  
  // Create socket with optimized configuration
  try {
    console.log("Initializing robust Socket.IO connection");
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 20000,
      forceNew: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],  // Prefer WebSocket for better performance
      upgrade: true,
      rememberUpgrade: true
    });
    
    // Set up robust connection monitoring
    setupConnectionHealthMonitoring(socket);
    
    // Register core event handlers
    setupCoreSocketEvents(socket);
    
    window.socket = socket;
    return socket;
  } catch (e) {
    console.error("Failed to initialize Socket.IO:", e);
    showToast('Connection Error', 'Real-time updates unavailable. Falling back to polling.', 'warning');
    startStatusPolling();
    return null;
  }
}

/**
 * Sets up connection health monitoring with heartbeat
 * @param {Object} socket - The Socket.IO instance
 */
function setupConnectionHealthMonitoring(socket) {
  // Clear any existing intervals
  if (window.heartbeatInterval) {
    clearInterval(window.heartbeatInterval);
  }
  
  // Connection quality metrics
  window.connectionMetrics = {
    lastPingTime: 0,
    pingHistory: [],
    disconnectCount: 0,
    lastMessageTime: Date.now(),
    connectionQuality: 'unknown'
  };
  
  // Set up heartbeat to maintain connection and measure latency
  window.heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      // Record ping start time
      window.connectionMetrics.lastPingTime = Date.now();
      
      // Send lightweight heartbeat
      socket.emit('ping_from_client', { 
        client_timestamp: Date.now(),
        client_info: {
          taskId: currentTaskId,
          lastProgress: window.lastProgressValue || 0
        }
      });
    } else if (socket) {
      // Try to reconnect if disconnected
      try {
        socket.connect();
        console.log("Heartbeat attempting socket reconnection");
      } catch (e) {
        console.warn("Failed to reconnect socket:", e);
      }
    }
  }, 20000); // 20 second interval
  
  // Listen for pong responses
  socket.on('pong_to_client', function(data) {
    const roundTripTime = Date.now() - window.connectionMetrics.lastPingTime;
    
    // Update connection metrics
    window.connectionMetrics.pingHistory.push(roundTripTime);
    // Keep only the last 5 measurements
    if (window.connectionMetrics.pingHistory.length > 5) {
      window.connectionMetrics.pingHistory.shift();
    }
    
    // Calculate average ping time
    const avgPing = window.connectionMetrics.pingHistory.reduce((sum, time) => sum + time, 0) / 
                    window.connectionMetrics.pingHistory.length;
    
    // Update connection quality assessment
    if (avgPing < 100) {
      window.connectionMetrics.connectionQuality = 'excellent';
    } else if (avgPing < 300) {
      window.connectionMetrics.connectionQuality = 'good';
    } else {
      window.connectionMetrics.connectionQuality = 'poor';
    }
    
    // Update the connection indicator in UI if it exists
    updateConnectionIndicator(window.connectionMetrics.connectionQuality);
    
    console.log(`Socket ping: ${roundTripTime}ms, Connection quality: ${window.connectionMetrics.connectionQuality}`);
  });
  
  // Update the last message time whenever we receive any message
  const originalOnEvent = socket.onevent;
  socket.onevent = function(packet) {
    window.connectionMetrics.lastMessageTime = Date.now();
    return originalOnEvent.call(this, packet);
  };
  
  // Connection status monitoring
  socket.on('connect', function() {
    window.connectionMetrics.lastMessageTime = Date.now();
    updateConnectionIndicator('connected');
  });
  
  socket.on('disconnect', function() {
    window.connectionMetrics.disconnectCount++;
    updateConnectionIndicator('disconnected');
  });
  
  // Additional listener for troubleshooting
  socket.on('connect_error', function(error) {
    console.warn("Socket connection error:", error);
    updateConnectionIndicator('error');
  });
}

/**
 * Updates the connection quality indicator in the UI
 * @param {string} status - Connection status or quality
 */
function updateConnectionIndicator(status) {
  const indicator = document.getElementById('connection-indicator');
  if (!indicator) return;
  
  // Remove existing classes
  indicator.classList.remove('bg-success', 'bg-warning', 'bg-danger', 'bg-secondary');
  
  // Update based on status
  switch(status) {
    case 'excellent':
      indicator.classList.add('bg-success');
      indicator.title = 'Connection: Excellent';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'good':
      indicator.classList.add('bg-success');
      indicator.title = 'Connection: Good';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'poor':
      indicator.classList.add('bg-warning');
      indicator.title = 'Connection: Poor';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'disconnected':
      indicator.classList.add('bg-danger');
      indicator.title = 'Connection: Disconnected';
      indicator.innerHTML = '<i class="fas fa-wifi"></i>';
      break;
    case 'error':
      indicator.classList.add('bg-danger');
      indicator.title = 'Connection: Error';
      indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
      break;
    default:
      indicator.classList.add('bg-secondary');
      indicator.title = 'Connection: Unknown';
      indicator.innerHTML = '<i class="fas fa-question"></i>';
  }
}

/**
 * Sets up core Socket.IO event handlers
 * @param {Object} socket - The Socket.IO instance
 */
function setupCoreSocketEvents(socket) {
  // Connection events
  socket.on('connect', function() {
    console.log('Socket.IO connected with ID:', socket.id);
    
    // Stop polling as we now have a real-time connection
    stopStatusPolling();
    
    // Request status update for current task if any
    if (currentTaskId) {
      try {
        socket.emit('request_task_status', { task_id: currentTaskId });
        console.log("Status request sent for task ID:", currentTaskId);
      } catch (e) {
        console.error("Error requesting status update:", e);
      }
    }
    
    showToast('Connected', 'Real-time connection established', 'success');
  });
  
  // Task completion handler
  socket.on('task_completed', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('Task completed event received:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Stop polling
      stopStatusPolling();
      
      // Set completion flags
      window.completionTriggered = true;
      window.taskCompleted = true;
          
      // Determine which tab is active and handle accordingly
      const activeTab = document.querySelector('.tab-pane.active');
      
      try {
        if (activeTab && activeTab.id === 'scraper') {
          formatAndDisplayScraperResults(data);
        } else if (activeTab && activeTab.id === 'playlist') {
          playlistProgressContainer.classList.add('d-none');
          playlistResultsContainer.classList.remove('d-none');
          
          if (playlistStats && data.stats) {
            updateScraperStats(playlistStats, data.stats, data.output_file);
          }
        } else {
          showResult(data);
        }
        
        // Add task to history
        addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
        showToast('Success', 'Task completed successfully!', 'success');
      } catch (e) {
        console.error("Error handling task completion:", e);
        showToast('Error', 'Error displaying results: ' + e.message, 'error');
      }
    }
  });
  
  // Progress update handler
  socket.on('progress_update', function(data) {
    if (data.task_id === currentTaskId) {
      // Store the original progress for debugging
      const originalProgress = data.progress;
      
      // Apply progress normalization
      if (data.progress !== undefined) {
        data.progress = normalizeProgress(data.progress, data);
      }
      
      console.log(`Progress update: ${originalProgress}% → ${data.progress}%, ${data.message || ''}`);
      
      try {
        // Update appropriate UI elements based on active tab
        updateProgressUI(data);
        
        // Track for simulation
        window.lastProgressValue = data.progress;
        window.lastProgressTimestamp = Date.now();
        
        // Check if we need to start progress simulation
        if (data.progress === 50) {
          startAdvancedProgressSimulation(data);
        } else if (data.progress > 50) {
          // If we get a real progress update above 50%, stop simulation
          stopProgressSimulation();
        }
        
        // Check for completion
        if (data.progress >= 99 || data.status === 'completed') {
          handleTaskNearCompletion(data);
        }
      } catch (e) {
        console.error("Error updating progress:", e);
      }
    }
  });
  
  // Error handler
  socket.on('task_error', function(data) {
    if (data.task_id === currentTaskId) {
      console.error('Task error:', data);
      
      // Stop any progress simulation
      stopProgressSimulation();
      
      // Stop polling
      stopStatusPolling();
      
      try {
        // Determine which tab is active and handle accordingly
        handleTaskError(data);
      } catch (e) {
        console.error("Error handling task error:", e);
        showToast('Error', 'An unexpected error occurred', 'error');
      }
    }
  });
}

/**
 * Normalize progress value for better user experience
 * @param {number} rawProgress - The raw progress value from the server
 * @param {Object} data - The full progress data object
 * @returns {number} - Normalized progress value between 0-100
 */
function normalizeProgress(rawProgress, data) {
  // Handle invalid input
  if (rawProgress === undefined || rawProgress === null) {
    return 0;
  }
  
  // Ensure progress is a number
  rawProgress = Number(rawProgress);
  if (isNaN(rawProgress)) {
    return 0;
  }
  
  // Keep progress within bounds
  rawProgress = Math.max(0, Math.min(100, rawProgress));
  
  // Initialize progress tracking if not exists
  if (!window.progressTracking) {
    window.progressTracking = {
      history: [],
      jumpDetected: false,
      jumpFrom: null,
      jumpTime: null,
      lastPhase: 'pre-jump', // 'pre-jump', 'jumping', 'simulating', 'completed'
      batchInfo: null,
      stagnantCount: 0
    };
  }
  
  const tracking = window.progressTracking;
  const now = Date.now();
  
  // Add to progress history
  tracking.history.push({
    progress: rawProgress,
    timestamp: now,
    message: data.message || ''
  });
  
  // Keep history manageable (last 20 updates)
  if (tracking.history.length > 20) {
    tracking.history.shift();
  }
  
  // Detect phase transitions
  if (tracking.history.length >= 2) {
    const previous = tracking.history[tracking.history.length - 2].progress;
    const jump = rawProgress - previous;
    
    // Check for significant jump
    if (jump >= 10 && previous < 60 && rawProgress < 80) {
      tracking.jumpDetected = true;
      tracking.jumpFrom = previous;
      tracking.jumpTime = now;
      tracking.lastPhase = 'jumping';
      console.log(`Progress jump detected: ${previous}% → ${rawProgress}%`);
      
      // Extract batch information from message if available
      if (data.message && data.message.includes('batch')) {
        const batchMatch = data.message.match(/batch (\d+)\/(\d+)/);
        if (batchMatch && batchMatch.length >= 3) {
          tracking.batchInfo = {
            current: parseInt(batchMatch[1]),
            total: parseInt(batchMatch[2]),
            isFinal: parseInt(batchMatch[1]) === parseInt(batchMatch[2])
          };
          console.log(`Batch info detected: ${tracking.batchInfo.current}/${tracking.batchInfo.total}`);
        }
      }
    }
    
    // Check for stagnation at 50%
    if (rawProgress === 50 && previous === 50) {
      tracking.stagnantCount++;
      
      // After being stuck at 50% for a while, enter simulation phase
      if (tracking.stagnantCount >= 3 && tracking.lastPhase !== 'simulating') {
        tracking.lastPhase = 'simulating';
        console.log("Progress stagnant at 50%, entering simulation phase");
      }
    } else {
      tracking.stagnantCount = 0;
    }
    
    // Check for completion
    if (rawProgress >= 99 || rawProgress >= 100) {
      tracking.lastPhase = 'completed';
    }
  }
  
  // Apply normalization based on current phase
  switch (tracking.lastPhase) {
    case 'pre-jump':
      // Before any jump, return the raw value
      return rawProgress;
      
    case 'jumping':
      // During a jump transition (brief period)
      // Just pass through the raw value
      return rawProgress;
      
    case 'simulating':
      // If we're stuck at 50%, apply simulation
      if (rawProgress === 50) {
        // Get time elapsed since jump or stagnation start
        const referenceTime = tracking.jumpTime || 
                              tracking.history[tracking.history.length - tracking.stagnantCount].timestamp;
        const elapsedSecs = (now - referenceTime) / 1000;
        
        // Estimate progress based on elapsed time
        // Use batch information if available to make a better estimate
        if (tracking.batchInfo && tracking.batchInfo.isFinal) {
          // In final batch, simulate 50-95% over about 30 seconds
          const simulatedProgress = Math.min(95, 50 + (elapsedSecs * 1.5));
          return Math.round(simulatedProgress);
        } else {
          // Generic simulation from 50-75% over about 20 seconds
          // More conservative when we don't know batch details
          const simulatedProgress = Math.min(75, 50 + (elapsedSecs));
          return Math.round(simulatedProgress);
        }
      }
      // If we get a non-50% value during simulation, use it
      return rawProgress;
      
    case 'completed':
      // Ensure 100% for completed state
      return rawProgress >= 99 ? 100 : rawProgress;
      
    default:
      // Default: just return the raw value
      return rawProgress;
  }
}

/**
 * Start advanced progress simulation with batch awareness
 * @param {Object} data - Progress data from server
 */
function startAdvancedProgressSimulation(data) {
  // Stop any existing simulation
  stopProgressSimulation();
  
  // Store initial data
  window.simulationData = {
    startTime: Date.now(),
    startProgress: data.progress || 0,
    message: data.message || 'Processing...',
    batchInfo: null,
    details: data.details || {},
    currentProgress: data.progress || 0
  };
  
  // Extract batch information if available
  if (data.message && data.message.includes('batch')) {
    const batchMatch = data.message.match(/batch (\d+)\/(\d+)/);
    if (batchMatch && batchMatch.length >= 3) {
      window.simulationData.batchInfo = {
        current: parseInt(batchMatch[1]),
        total: parseInt(batchMatch[2]),
        isFinal: parseInt(batchMatch[1]) === parseInt(batchMatch[2])
      };
      console.log(`Simulation using batch info: ${window.simulationData.batchInfo.current}/${window.simulationData.batchInfo.total}`);
    }
  }
  
  // Start the simulation interval
  window.progressSimulationInterval = setInterval(() => {
    const simData = window.simulationData;
    if (!simData) return;
    
    const now = Date.now();
    const elapsedSecs = (now - simData.startTime) / 1000;
    
    // Only simulate if we're stuck at a plateau (usually 50%)
    if (simData.currentProgress === 50) {
      let simulatedProgress;
      
      // Use batch information for better simulation if available
      if (simData.batchInfo && simData.batchInfo.isFinal) {
        // For final batch, simulate 50-95% over about 30 seconds
        const maxSimulatedProgress = 95;
        const simulationDuration = 30; // seconds
        simulatedProgress = Math.min(
          maxSimulatedProgress, 
          50 + ((elapsedSecs / simulationDuration) * (maxSimulatedProgress - 50))
        );
      } else {
        // More conservative simulation when batch info is unknown
        // Simulate 50-75% over about 20 seconds
        const maxSimulatedProgress = 75;
        const simulationDuration = 20; // seconds
        simulatedProgress = Math.min(
          maxSimulatedProgress, 
          50 + ((elapsedSecs / simulationDuration) * (maxSimulatedProgress - 50))
        );
      }
      
      // Round to whole number and update UI
      simulatedProgress = Math.round(simulatedProgress);
      
      // Only update if there's actual change
      if (simulatedProgress > simData.currentProgress) {
        simData.currentProgress = simulatedProgress;
        
        // Build a message that indicates simulation
        let statusMessage = "Processing... (estimating time remaining)";
        if (simData.batchInfo) {
          statusMessage = `Processing batch ${simData.batchInfo.current}/${simData.batchInfo.total}... (estimating time remaining)`;
        }
        
        // Update UI based on active tab
        updateProgressUIWithSimulation(simulatedProgress, statusMessage);
        
        console.log(`Simulated progress: ${simulatedProgress}% (${elapsedSecs.toFixed(1)}s elapsed)`);
      }
    }
  }, 1000);
  
  console.log("Advanced progress simulation started");
}

/**
 * Update progress UI with simulated progress
 * @param {number} progress - The progress percentage
 * @param {string} message - Status message
 */
function updateProgressUIWithSimulation(progress, message) {
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (activeTab && activeTab.id === 'scraper') {
    if (scraperProgressBar) {
      updateProgressBarElement(scraperProgressBar, progress);
    }
    if (scraperProgressStatus) {
      scraperProgressStatus.textContent = message;
    }
  } else if (activeTab && activeTab.id === 'playlist') {
    if (playlistProgressBar) {
      updateProgressBarElement(playlistProgressBar, progress);
    }
    if (playlistProgressStatus) {
      playlistProgressStatus.textContent = message;
    }
  } else {
    if (progressBar) {
      updateProgressBarElement(progressBar, progress);
    }
    if (progressStatus) {
      updateProgressStatus(progressStatus, message);
    }
  }
}


/**
 * Handle task approaching completion (99-100%)
 * @param {Object} data - Task data
 */
function handleTaskNearCompletion(data) {
  if (!window.completionTriggered && !window.taskCompleted) {
    console.log("Task nearing completion detected in progress_update");
    
    // Stop any progress simulation
    stopProgressSimulation();
    
    // Set flag to prevent duplicate processing
    window.completionTriggered = true;
    stopStatusPolling();
    
    // Use the same handling as task_completed event
    const activeTab = document.querySelector('.tab-pane.active');
    if (activeTab && activeTab.id === 'scraper') {
      formatAndDisplayScraperResults(data);
    } else if (activeTab && activeTab.id === 'playlist') {
      playlistProgressContainer.classList.add('d-none');
      playlistResultsContainer.classList.remove('d-none');
      if (playlistStats && data.stats) {
        updateScraperStats(playlistStats, data.stats, data.output_file);
      }
    } else {
      showResult(data);
    }
    
    // Add task to history
    addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
    showToast('Success', 'Task completed successfully!', 'success');
  }
}

/**
 * Update progress UI elements based on task type
 * @param {Object} data - The progress data from server
 */
function updateProgressUI(data) {
  try {
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-pane.active');
    const taskType = activeTab ? activeTab.id : 'file';
    
    // Extract progress information
    const progress = data.progress;
    const message = data.message || data.stage || "Processing...";
    
    // Update appropriate UI elements based on task type
    switch (taskType) {
      case 'scraper':
        // Update scraper progress bar
        if (scraperProgressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(scraperProgressBar, progress);
        }
        
        // Update status message
        if (scraperProgressStatus && message) {
          scraperProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && scraperProgressStats) {
          updateScraperProgressStats(scraperProgressStats, data.stats);
        }
        
        // Handle PDF downloads information if available
        if (data.pdf_downloads && data.pdf_downloads.length > 0) {
          handlePdfDownloadsUpdate(data.pdf_downloads);
        }
        break;
        
      case 'playlist':
        // Update playlist progress bar
        if (playlistProgressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(playlistProgressBar, progress);
        }
        
        // Update status message
        if (playlistProgressStatus && message) {
          playlistProgressStatus.textContent = message;
        }
        
        // Update stats
        if (data.stats && playlistProgressStats) {
          updatePlaylistProgressStats(playlistProgressStats, data.stats);
        }
        break;
        
      default: // file processing
        // Update main progress bar
        if (progressBar && progress !== undefined && !isNaN(progress)) {
          updateProgressBarElement(progressBar, progress);
        }
        
        // Update status message
        if (progressStatus && message) {
          updateProgressStatus(progressStatus, message);
        }
        
        // Update stats
        if (data.stats && progressStats) {
          updateProgressStats(progressStats, data.stats);
        }
        break;
    }
    
    // Update common elements like page title
    updatePageTitle(progress, taskType);
    
    // Check for simulation needs
    checkForProgressStagnation(data);
    
  } catch (e) {
    console.error("Error in updateProgressUI:", e);
  }
}

/**
 * Update page title with progress info
 * @param {number} progress - Progress percentage
 * @param {string} taskType - Type of task
 */
function updatePageTitle(progress, taskType) {
  if (progress === undefined || isNaN(progress)) return;
  
  let typeLabel = "Processing";
  switch (taskType) {
    case 'scraper':
      typeLabel = "Scraping";
      break;
    case 'playlist':
      typeLabel = "Playlist";
      break;
  }
  
  // Only update title for in-progress tasks
  if (progress > 0 && progress < 100) {
    document.title = `${progress}% - ${typeLabel} - NeuroGen`;
  } else if (progress >= 100) {
    document.title = `Complete - NeuroGen`;
    
    // Reset title after a delay
    setTimeout(() => {
      document.title = "NeuroGen";
    }, 5000);
  }
}

/**
 * Check for progress stagnation and trigger simulation if needed
 * @param {Object} data - Progress data
 */
function checkForProgressStagnation(data) {
  const now = Date.now();
  
  // Initialize tracking if needed
  if (!window.stagnationTracking) {
    window.stagnationTracking = {
      lastProgress: data.progress,
      lastUpdateTime: now,
      stagnantDuration: 0,
      stagnationThreshold: 5000 // 5 seconds of no progress change
    };
    return;
  }
  
  const tracking = window.stagnationTracking;
  
  // Check if progress has changed
  if (data.progress !== tracking.lastProgress) {
    // Progress changed, reset tracking
    tracking.lastProgress = data.progress;
    tracking.lastUpdateTime = now;
    tracking.stagnantDuration = 0;
    return;
  }
  
  // Calculate how long we've been at this progress level
  tracking.stagnantDuration = now - tracking.lastUpdateTime;
  
  // If stagnant for too long at a key progress point (e.g. 50%), start simulation
  if (tracking.stagnantDuration >= tracking.stagnationThreshold && 
      data.progress === 50 && !window.progressSimulationInterval) {
    console.log(`Progress stagnant at ${data.progress}% for ${tracking.stagnantDuration}ms, starting simulation`);
    startAdvancedProgressSimulation(data);
  }
}

/**
 * Enhanced progress bar update with smooth animations and correct labeling
 * @param {HTMLElement} barElement - The progress bar element
 * @param {number} progress - The progress percentage (0-100)
 * @returns {void}
 */
function updateProgressBarElement(barElement, progress) {
  // Early return if element is invalid
  if (!barElement) return;
  
  // Ensure progress is within bounds and is a number
  progress = Math.min(100, Math.max(0, Number(progress) || 0));
  
  // Skip update if value hasn't changed (performance optimization)
  if (barElement._lastProgress === progress) return;
  barElement._lastProgress = progress;
  
  // Use requestAnimationFrame for smoother updates
  requestAnimationFrame(() => {
    // Get current width with proper fallback
    let currentWidth = 0;
    if (barElement.style.width) {
      // Parse current width, removing the % if present
      currentWidth = parseFloat(barElement.style.width.replace('%', ''));
    }
    
    // Determine transition based on progress jump size
    const progressDiff = Math.abs(progress - currentWidth);
    
    // For large jumps, disable transition
    if (progressDiff > 15) {
      barElement.style.transition = 'none';
    } else {
      barElement.style.transition = 'width 0.3s ease';
    }
    
    // Set width with % suffix to ensure proper CSS
    barElement.style.width = `${progress}%`;
    
    // Update ARIA attributes for accessibility
    barElement.setAttribute('aria-valuenow', progress);
    barElement.setAttribute('aria-valuemin', '0');
    barElement.setAttribute('aria-valuemax', '100');
    
    // Update the label with the percentage
    barElement.textContent = `${Math.round(progress)}%`;
    
    // Adjust styling based on progress
    if (progress >= 100) {
      // Completed state
      barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.add('bg-success');
      
      // Add completion pulse animation if defined in CSS
      if (!barElement.classList.contains('progress-complete-pulse')) {
        barElement.classList.add('progress-complete-pulse');
      }
    } else if (progress > 0) {
      // In-progress state
      barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
      barElement.classList.remove('bg-success', 'progress-complete-pulse');
      
      // For very low progress, ensure label is visible
      if (progress < 10) {
        barElement.classList.add('text-end');
        barElement.style.color = 'var(--bs-dark, #212529)'; // Fallback color
        barElement.style.paddingRight = '5px';
      } else {
        barElement.classList.remove('text-end');
        barElement.style.color = '';
        barElement.style.paddingRight = '0';
        
        // Ensure text contrast for mid-ranges
        if (progress < 50) {
          barElement.classList.add('text-dark');
          barElement.classList.remove('text-white');
        } else {
          barElement.classList.add('text-white');
          barElement.classList.remove('text-dark');
        }
      }
    } else {
      // Zero progress state
      barElement.classList.remove('progress-bar-striped', 'progress-bar-animated', 'bg-success', 'progress-complete-pulse');
      barElement.style.color = 'var(--bs-dark, #212529)';
    }
  });
}

/**
 * Handle task error based on active tab with improved error recovery
 * @param {Object} data - Error data from server
 * @returns {void}
 */
function handleTaskError(data) {
  // Log error for debugging
  console.error("Task error received:", data);
  
  // Extract error message with fallback
  const errorMsg = data && data.error ? data.error : 'Unknown error occurred';
  
  try {
    // Determine which tab is active
    const activeTab = document.querySelector('.tab-pane.active');
    const tabId = activeTab ? activeTab.id : 'default';
    
    // Handle based on tab type
    switch(tabId) {
      case 'scraper':
        if (typeof scraperProgressContainer !== 'undefined' && scraperProgressContainer) {
          scraperProgressContainer.classList.add('d-none');
        }
        
        if (typeof scraperResultsContainer !== 'undefined' && scraperResultsContainer) {
          scraperResultsContainer.classList.remove('d-none');
          
          // Update error message in UI
          if (typeof scraperResults !== 'undefined' && scraperResults) {
            scraperResults.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
                <p>${errorMsg}</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewScraperTask()">
                  <i class="fas fa-redo me-1"></i>Try Again
                </button>
              </div>
            `;
          }
        }
        break;
        
      case 'playlist':
        if (typeof playlistProgressContainer !== 'undefined' && playlistProgressContainer) {
          playlistProgressContainer.classList.add('d-none');
        }
        
        // Use error container from file processing tab if available
        if (typeof errorContainer !== 'undefined' && errorContainer) {
          errorContainer.classList.remove('d-none');
          
          if (typeof errorMessage !== 'undefined' && errorMessage) {
            errorMessage.innerHTML = `
              <div class="alert alert-danger">
                <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
                <p>${errorMsg}</p>
                <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewTaskClick()">
                  <i class="fas fa-redo me-1"></i>Try Again
                </button>
              </div>
            `;
          }
        } else {
          // Fallback if standard error container not found
          const playlistContainer = document.getElementById('playlist-container');
          if (playlistContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.innerHTML = `
              <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
              <p>${errorMsg}</p>
              <button class="btn btn-outline-danger btn-sm mt-2" onclick="handleNewTaskClick()">
                <i class="fas fa-redo me-1"></i>Try Again
              </button>
            `;
            playlistContainer.appendChild(errorDiv);
          }
        }
        break;
        
      default:
        // Handle default tab error using standard error display
        if (typeof showError === 'function') {
          showError(data);
        } else {
          // Fallback if showError function not available
          const mainContainer = document.querySelector('.container');
          if (mainContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.innerHTML = `
              <h5><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
              <p>${errorMsg}</p>
              <button class="btn btn-outline-danger btn-sm mt-2" onclick="window.location.reload()">
                <i class="fas fa-redo me-1"></i>Reload
              </button>
            `;
            mainContainer.appendChild(errorDiv);
          }
        }
        break;
    }
    
    // Show toast notification with error details
    if (typeof showToast === 'function') {
      showToast('Error', errorMsg, 'error');
    }
    
    // Add to error log if available
    if (typeof logError === 'function') {
      logError('Task execution', errorMsg, data);
    }
    
    // Clear session storage as task failed
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      sessionStorage.removeItem('taskStartTime');
      sessionStorage.removeItem('lastProgressUpdate');
    } catch (e) {
      console.warn('Could not clear session storage:', e);
    }
    
    // Stop any active polling
    if (typeof stopStatusPolling === 'function') {
      stopStatusPolling();
    }
    
    // Update any status indicators
    updateTaskStatusIndicators(false, 'error');
    
  } catch (error) {
    // Catch any errors in the error handler itself
    console.error('Error in handleTaskError:', error);
    
    // Absolute fallback - show error in console and as alert if everything else fails
    alert(`Error: ${errorMsg}`);
  }
}

/**
 * Update task status indicators in UI
 * @param {boolean} isActive - Whether task is active
 * @param {string} status - Task status (error, completed, etc.)
 */
function updateTaskStatusIndicators(isActive, status = 'normal') {
  // Find status indicators
  const indicators = document.querySelectorAll('.task-status-indicator');
  
  // Update all found indicators
  indicators.forEach(indicator => {
    // Remove all status classes first
    indicator.classList.remove('status-active', 'status-error', 'status-completed', 'status-paused');
    
    // Add appropriate class based on status
    if (isActive) {
      indicator.classList.add('status-active');
    } else if (status === 'error') {
      indicator.classList.add('status-error');
    } else if (status === 'completed') {
      indicator.classList.add('status-completed');
    } else if (status === 'paused') {
      indicator.classList.add('status-paused');
    }
    
    // Update icon if exists
    const icon = indicator.querySelector('i');
    if (icon) {
      // Reset classes
      icon.className = '';
      
      // Set appropriate icon class
      if (isActive) {
        icon.className = 'fas fa-spinner fa-spin';
      } else if (status === 'error') {
        icon.className = 'fas fa-exclamation-circle';
      } else if (status === 'completed') {
        icon.className = 'fas fa-check-circle';
      } else if (status === 'paused') {
        icon.className = 'fas fa-pause-circle';
      } else {
        icon.className = 'fas fa-circle';
      }
    }
    
    // Update tooltip if needed
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTitle = isActive ? 'Task Running' : 
                          status === 'error' ? 'Task Failed' :
                          status === 'completed' ? 'Task Completed' :
                          status === 'paused' ? 'Task Paused' : 'Task Inactive';
      
      const tooltip = bootstrap.Tooltip.getInstance(indicator);
      if (tooltip) {
        tooltip.dispose();
      }
      
      new bootstrap.Tooltip(indicator, {
        title: tooltipTitle
      });
    }
  });
}
/**
 * Improved status polling function with better error handling
 */
function startStatusPolling() {
  // Clear any existing polling
  stopStatusPolling();
  
  // Only start polling if we have a task ID
  if (!currentTaskId) {
    console.warn("No task ID available for status polling");
    return;
  }
  
  console.log("Starting status polling for task:", currentTaskId);
  
  // Reset completion flags
  window.completionTriggered = false;
  window.taskCompleted = false;
  window.resultsDisplayed = false;
  
  // Start a new polling interval
  let consecutiveErrors = 0;
  let pollingDelay = 2000; // Start with 2 seconds
  
  statusCheckInterval = setInterval(() => {
    if (!currentTaskId) {
      stopStatusPolling();
      return;
    }
    
    // Determine the appropriate endpoint based on task type
    let endpoint = `/api/status/${currentTaskId}`;
    const activeTab = document.querySelector('.tab-pane.active');
    
    if (activeTab && activeTab.id === 'scraper') {
      endpoint = `/api/scrape2/status/${currentTaskId}`;
    }
    
    // Use fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    fetch(endpoint, { signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        return response.json();
      })
      .then(data => {
        // Reset error counter on success
        consecutiveErrors = 0;
        pollingDelay = 2000; // Reset polling delay
        
        // Store latest data
        window.latestTaskData = data;
        
        // Process the status update
        updateProgress(data);
        
        // Check if we need to handle completion here
        if (data.status === 'completed' || data.progress >= 100) {
          if (!window.completionTriggered) {
            console.log("Task completed via polling, finalizing UI");
            
            window.completionTriggered = true;
            window.taskCompleted = true;
            
            // Stop polling
            stopStatusPolling();
            
            // Determine which tab is active and handle accordingly
            if (activeTab && activeTab.id === 'scraper') {
              formatAndDisplayScraperResults(data);
            } else if (activeTab && activeTab.id === 'playlist') {
              playlistProgressContainer.classList.add('d-none');
              playlistResultsContainer.classList.remove('d-none');
              
              if (playlistStats && data.stats) {
                updateScraperStats(playlistStats, data.stats, data.output_file);
              }
            } else {
              showResult(data);
            }
            
            // Add task to history
            addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
            showToast('Success', 'Task completed successfully!', 'success');
          }
        }
        
        // If task is failed or cancelled, stop polling
        if (data.status === 'failed' || data.status === 'cancelled') {
          stopStatusPolling();
        }
      })
      .catch(error => {
        consecutiveErrors++;
        console.error(`Status check error (${consecutiveErrors}):`, error);
        
        // Adjust polling delay with exponential backoff
        if (consecutiveErrors > 1) {
          pollingDelay = Math.min(10000, pollingDelay * 1.5);
        }
        
        // If we've had too many consecutive errors, stop polling
        // But increase from 5 to 10 to avoid premature stoppage
        if (consecutiveErrors > 10) {
          console.error("Too many consecutive errors, stopping polling");
          stopStatusPolling();
          showToast('Connection Error', 'Lost connection to server', 'error');
          
          // Last ditch effort - try to check if the task completed
          tryCompletionFromCache();
        }
      });
  }, pollingDelay);
  
  console.log("Status polling started");
  
  // Safety timeout that auto-completes high-progress tasks
  // This handles cases where the server might not send the completion event
  setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue >= 90) {
        console.log("Safety timeout triggered - forcing task completion for high progress task");
        
        tryCompletionFromCache();
      }
    }
  }, 60000); // Increased from 30 to 60 seconds
}

/**
 * Poll for task status with improved error handling and adaptive polling
 * Implements smart backoff, early completion detection, and progress tracking
 */
function pollTaskStatus() {
  if (!currentTaskId || !window.pollingState) {
    stopStatusPolling();
    return;
  }
  
  const state = window.pollingState;
  const now = Date.now();
  state.lastPollTime = now;
  state.totalPolls++;
  
  // Determine the appropriate endpoint based on task type
  let endpoint = `/api/status/${currentTaskId}`;
  
  if (state.taskType === 'scraper') {
    endpoint = `/api/scrape2/status/${currentTaskId}`;
  } else if (state.taskType === 'playlist') {
    endpoint = `/api/playlist/status/${currentTaskId}`;
  }
  
  // Use fetch with timeout for reliability
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  fetch(endpoint, { 
    signal: controller.signal,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
    .then(response => {
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      return response.json();
    })
    .then(data => {
      // Reset error counter on success
      state.consecutiveErrors = 0;
      
      // Adaptive polling strategy - gradually adjust to optimal rate
      adjustPollingRate(state, data);
      
      // Store latest data for recovery
      window.latestTaskData = data;
      
      // Track progress stagnation
      if (data.progress === state.lastProgress) {
        state.stagnationCount++;
      } else {
        state.stagnationCount = 0;
        state.lastProgress = data.progress;
        
        // Store timestamp of last progress update for stall detection
        window.lastProgressTimestamp = now;
      }
      
      // Process the status update
      updateProgress(data);
      
      // Log detailed progress every 5 polls
      if (state.totalPolls % 5 === 0) {
        console.log(`Task progress (poll #${state.totalPolls}): ${data.progress}%, status: ${data.status}, delay: ${state.pollingDelay}ms`);
      }
      
      // Check for task completion
      if (shouldConsiderTaskCompleted(data)) {
        handleTaskCompletion(data);
        return;
      }
      
      // If task failed or was cancelled, stop polling
      if (data.status === 'failed' || data.status === 'error' || data.status === 'cancelled') {
        console.log(`Task ended with status: ${data.status}`, data);
        stopStatusPolling();
        if (data.error) {
          showToast('Error', data.error, 'error');
        }
      }
      
      // Check for excessive stagnation as potential indicator of issues
      if (state.stagnationCount > 15) {
        console.warn(`Task progress appears stagnant at ${data.progress}% for ${state.stagnationCount} polls`);
        // Don't stop polling but adjust rate to prevent overwhelming the server
        if (state.pollingDelay < 5000) {
          state.pollingDelay = 5000;
          updatePollingInterval(state.pollingDelay);
        }
      }
    })
    .catch(error => {
      state.consecutiveErrors++;
      console.error(`Status check error (${state.consecutiveErrors}):`, error);
      
      // Apply exponential backoff for errors
      applyErrorBackoff(state);
      
      // If errors persist despite backoff, take recovery action
      if (state.consecutiveErrors > 12) {
        handlePersistentErrors();
      }
    });
}

/**
 * Adaptively adjust polling rate based on task status and progress
 * @param {Object} state - The polling state object
 * @param {Object} data - The task data from API
 */
function adjustPollingRate(state, data) {
  // Initial fast polling for better UX
  if (state.initialPollCount < 5) {
    state.initialPollCount++;
    state.pollingDelay = state.minPollingDelay;
    updatePollingInterval(state.pollingDelay);
    return;
  }
  
  // Dynamic polling rate based on progress
  if (data.progress >= 90) {
    // Near completion, poll faster for quick feedback
    state.pollingDelay = state.minPollingDelay;
  } else if (data.progress >= 50 && data.progress < 90) {
    // Middle stage, moderate polling
    state.pollingDelay = 2000;
  } else if (state.pollingDelay > state.minPollingDelay && state.consecutiveErrors === 0) {
    // Gradually normalize polling rate after errors if we're not in a critical phase
    state.pollingDelay = Math.max(state.minPollingDelay, state.pollingDelay * 0.9);
  }
  
  // Update interval if changed
  if (state.pollingDelay !== statusCheckInterval._idleTimeout) {
    updatePollingInterval(state.pollingDelay);
  }
}

/**
 * Apply exponential backoff when errors are encountered
 * @param {Object} state - The polling state object
 */
function applyErrorBackoff(state) {
  if (state.consecutiveErrors > 1) {
    // Exponential backoff with jitter for better distribution
    const jitter = Math.random() * 500;
    state.pollingDelay = Math.min(
      state.maxPollingDelay, 
      Math.floor((state.pollingDelay * 1.5) + jitter)
    );
    updatePollingInterval(state.pollingDelay);
    console.log(`Applied backoff: new polling delay is ${state.pollingDelay}ms`);
  }
}

/**
 * Handle persistent connection errors with fallback strategies
 */
function handlePersistentErrors() {
  console.error("Too many consecutive errors, implementing recovery measures");
  stopStatusPolling();
  
  // Try server ping to check if server is reachable
  fetch('/api/ping', { 
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' }
  })
    .then(response => response.json())
    .then(data => {
      if (data.status === 'ok') {
        // Server is up, but our task endpoint is having issues
        showToast('Connection Warning', 'Server is reachable but task status updates failed. Attempting to complete the task.', 'warning');
      } else {
        // Server is having issues
        showToast('Connection Error', 'Lost connection to server', 'error');
      }
    })
    .catch(() => {
      // Server is not reachable
      showToast('Connection Error', 'Server appears to be offline', 'error');
    })
    .finally(() => {
      // Try completion from cache as last resort
      tryCompletionFromCache();
    });
}

/**
 * Determine if a task should be considered completed
 * @param {Object} data - The task data
 * @returns {boolean} - Whether the task should be considered complete
 */
function shouldConsiderTaskCompleted(data) {
  // Avoid duplicate completion handling
  if (window.completionTriggered || window.taskCompleted) return false;
  
  return (
    // Explicit completion status
    data.status === 'completed' ||
    // High progress threshold as implicit completion
    data.progress >= 99 ||
    // Status with output file likely indicates completion
    (data.status === 'success' && data.output_file)
  );
}

/**
 * Handle task completion with proper UI updates
 * @param {Object} data - The task data
 */
function handleTaskCompletion(data) {
  console.log("Task completed, finalizing UI", data);
  
  window.completionTriggered = true;
  window.taskCompleted = true;
  
  // Stop polling
  stopStatusPolling();
  
  // Handle completion based on task type
  handleCompletionBasedOnTaskType(data);
  
  // Clear session storage
  try {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('pollingStartTime');
  } catch (e) {
    console.warn("Could not clear session storage:", e);
  }
  
  // Update UI to show inactive polling
  updatePollingStatusIndicator(false);
}

/**
 * Update the polling interval with new delay
 * @param {number} newDelay - New delay in milliseconds
 */
function updatePollingInterval(newDelay) {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = setInterval(pollTaskStatus, newDelay);
    
    // Only log significant changes to reduce console noise
    if (Math.abs(newDelay - (window.pollingState?.lastLoggedDelay || 0)) > 500) {
      console.log(`Polling interval updated to ${newDelay}ms`);
      if (window.pollingState) window.pollingState.lastLoggedDelay = newDelay;
    }
  }
}


/**
 * Try completion from cached data as fallback
 */
function tryCompletionFromCache() {
  if (window.completionTriggered || window.taskCompleted) return;
  
  console.log("Attempting to complete task using cached data");
  
  // Use the latest data we received, or create minimal data
  const completionData = window.latestTaskData || {
    task_id: currentTaskId,
    status: "completed",
    progress: 100,
    output_file: sessionStorage.getItem('outputFile'),
    stats: {}
  };
  
  // Set flags to indicate we're forcing completion
  window.completionTriggered = true;
  window.taskCompleted = true;
  
  try {
    // Handle completion based on task type
    handleCompletionBasedOnTaskType(completionData);
  } catch (e) {
    console.error("Error in completion fallback:", e);
    showToast('Warning', 'Task may have completed, but there was an error showing results', 'warning');
    
    // Last resort fallback - show basic completion message
    try {
      const activeTab = document.querySelector('.tab-pane.active');
      const containerSelector = activeTab && activeTab.id === 'playlist' ? 
        '#playlist-results-container' : '#results-container';
      
      const container = document.querySelector(containerSelector);
      if (container) {
        container.innerHTML = `
          <div class="alert alert-success">
            <h4><i class="fas fa-check-circle me-2"></i> Task Completed</h4>
            <p>The task appears to have completed, but there was an error displaying detailed results.</p>
            ${completionData.output_file ? `<p>Output may be available at: ${completionData.output_file}</p>` : ''}
            <button class="btn btn-primary mt-2" onclick="handleNewTaskClick()">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
        `;
      }
    } catch (fallbackError) {
      console.error("Critical error in last resort fallback:", fallbackError);
    }
  }
}

/**
 * Update polling status indicator in UI if available
 * @param {boolean} isActive - Whether polling is active
 */
function updatePollingStatusIndicator(isActive) {
  const indicator = document.getElementById('polling-status-indicator');
  if (!indicator) return;
  
  indicator.className = isActive ? 
    'polling-indicator polling-active' : 'polling-indicator polling-inactive';
  
  indicator.title = isActive ? 
    'Real-time updates active' : 'Real-time updates inactive';
  
  const icon = indicator.querySelector('i');
  if (icon) {
    icon.className = isActive ? 
      'fas fa-sync fa-spin' : 'fas fa-sync-alt';
  }
}

/**
 * Safely stop polling and clear all related timeouts
 */
function stopStatusPolling() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
  
  if (window.completionSafetyTimeout) {
    clearTimeout(window.completionSafetyTimeout);
    window.completionSafetyTimeout = null;
  }
  
  if (window.earlyProgressTimeout) {
    clearTimeout(window.earlyProgressTimeout);
    window.earlyProgressTimeout = null;
  }
  
  // Update UI to show inactive polling
  updatePollingStatusIndicator(false);
  
  console.log("Status polling stopped");
}

/**
 * Set up safety timeout to handle stalled tasks
 */
function setupCompletionSafetyTimeout() {
  // Clear any existing timeout
  if (window.completionSafetyTimeout) {
    clearTimeout(window.completionSafetyTimeout);
  }
  
  // Create new timeout
  window.completionSafetyTimeout = setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue >= 90) {
        console.log("Safety timeout triggered - forcing task completion for high progress task");
        tryCompletionFromCache();
      } else if (progressValue >= 50) {
        // For lower progress tasks, check if they're stalled
        const lastUpdate = window.lastProgressTimestamp || 0;
        const now = Date.now();
        const timeSinceUpdate = (now - lastUpdate) / 1000;
        
        if (timeSinceUpdate > 60) { // 1 minute without updates
          console.log("Safety timeout triggered - task appears stalled at 50%+");
          showToast('Warning', 'Task appears to be stalled. Results may be incomplete.', 'warning');
          
          // Check if server is reachable before giving up
          checkServerReachable().then(reachable => {
            if (reachable) {
              // Server is up, but our task might be stuck - poll once more
              pollTaskStatus();
              
              // Wait a bit and then try completion if still stalled
              setTimeout(() => {
                if (currentTaskId && !window.taskCompleted) {
                  tryCompletionFromCache();
                }
              }, 5000);
            } else {
              // Server seems down, try completion from cache directly
              tryCompletionFromCache();
            }
          });
        }
      }
    }
  }, 90000); // Increased from 60 to 90 seconds for more patience
  
  // Also set up an early check for tasks stuck at very beginning
  window.earlyStuckTaskTimeout = setTimeout(() => {
    if (currentTaskId && !window.taskCompleted) {
      const progressBar = document.querySelector('.progress-bar');
      const progressValue = progressBar ? parseInt(progressBar.getAttribute('aria-valuenow') || 0) : 0;
      
      if (progressValue <= 5) {
        console.log("Early timeout - task appears stuck at beginning stage");
        
        // Check if the server is reachable
        checkServerReachable().then(reachable => {
          if (reachable) {
            showToast('Warning', 'Task appears to be slow to start. Server is reachable, but task may be stalled.', 'warning');
          } else {
            showToast('Error', 'Server appears to be unreachable. Task cannot continue.', 'error');
            // Clear task as it can't complete
            stopStatusPolling();
          }
        });
      }
    }
  }, 20000); // Check after 20 seconds
}


/**
 * Handle task completion based on task type
 * @param {Object} data - Task data
 */
function handleCompletionBasedOnTaskType(data) {
  // Determine which tab is active
  const activeTab = document.querySelector('.tab-pane.active');
  
  if (activeTab && activeTab.id === 'scraper') {
    formatAndDisplayScraperResults(data);
  } else if (activeTab && activeTab.id === 'playlist') {
    playlistProgressContainer.classList.add('d-none');
    playlistResultsContainer.classList.remove('d-none');
    
    if (playlistStats && data.stats) {
      updateScraperStats(playlistStats, data.stats, data.output_file);
    }
  } else {
    showResult(data);
  }
  
  // Add task to history
  addTaskToHistory(getCurrentTaskType(), data.output_file, data.stats);
  showToast('Success', 'Task completed successfully!', 'success');
}



/**
 * Enhanced PDF support 
 * 
 * 
/**
 * Initialize PDF processing capabilities with feature detection
 */
function initializePdfProcessing() {
  // Detect PDF capabilities from server
  fetchPdfCapabilities().then(capabilities => {
    // Store capabilities globally
    window.pdfCapabilities = capabilities;
    
    // Initialize UI based on capabilities
    updatePdfProcessingUI(capabilities);
    
    console.log("PDF processing initialized with capabilities:", capabilities);
  }).catch(error => {
    console.error("Error initializing PDF processing:", error);
    // Assume basic capabilities
    window.pdfCapabilities = {
      tables: false,
      ocr: false,
      enhanced_output: false,
      memory_efficient: true
    };
  });
  
  // Set up event handlers for PDF-related functionality
  setupPdfEventHandlers();
}

/**
 * Fetch PDF processing capabilities from server
 * @returns {Promise<Object>} Capabilities object
 */
async function fetchPdfCapabilities() {
  try {
    const response = await fetch('/api/pdf/capabilities');
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(data.error || 'Failed to retrieve PDF capabilities');
    }
    
    return data.capabilities || {
      tables: false,
      ocr: false,
      enhanced_output: false,
      memory_efficient: true
    };
  } catch (error) {
    console.error("Error fetching PDF capabilities:", error);
    throw error;
  }
}

/**
 * Update UI based on PDF processing capabilities
 * @param {Object} capabilities - PDF processing capabilities
 */
function updatePdfProcessingUI(capabilities) {
  // Create capabilities display in file processing tab
  const capabilitiesContainer = document.getElementById('pdf-capabilities-container');
  if (!capabilitiesContainer) return;
  
  let html = '<div class="alert alert-info mt-3">';
  html += '<h6><i class="fas fa-info-circle me-2"></i>PDF Processing Capabilities</h6>';
  html += '<ul class="mb-0 small">';
  
  // Add available features
  if (capabilities.tables) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Table extraction</li>';
  } else {
    html += '<li><i class="fas fa-times text-muted me-1"></i> Table extraction (unavailable)</li>';
  }
  
  if (capabilities.ocr) {
    html += '<li><i class="fas fa-check text-success me-1"></i> OCR for scanned documents</li>';
  } else {
    html += '<li><i class="fas fa-times text-muted me-1"></i> OCR (unavailable)</li>';
  }
  
  if (capabilities.enhanced_output) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Enhanced output format</li>';
  }
  
  if (capabilities.memory_efficient) {
    html += '<li><i class="fas fa-check text-success me-1"></i> Memory-efficient processing</li>';
  }
  
  html += '</ul>';
  html += '</div>';
  
  capabilitiesContainer.innerHTML = html;
  
  // Update PDF options in UI based on capabilities
  const ocrCheckbox = document.getElementById('use-ocr-checkbox');
  const tableCheckbox = document.getElementById('extract-tables-checkbox');
  
  if (ocrCheckbox) {
    ocrCheckbox.disabled = !capabilities.ocr;
    ocrCheckbox.checked = capabilities.ocr;
    
    // Add tooltip if disabled
    if (!capabilities.ocr) {
      ocrCheckbox.parentElement.setAttribute('title', 'OCR is not available with the current installation');
    }
  }
  
  if (tableCheckbox) {
    tableCheckbox.disabled = !capabilities.tables;
    tableCheckbox.checked = capabilities.tables;
    
    // Add tooltip if disabled
    if (!capabilities.tables) {
      tableCheckbox.parentElement.setAttribute('title', 'Table extraction is not available with the current installation');
    }
  }
}

/**
 * Set up event handlers for PDF processing
 */
function setupPdfEventHandlers() {
  // Add Socket.IO handlers for PDF processing events
  if (socket) {
    // PDF processing progress
    socket.on('pdf_processing_progress', function(data) {
      if (data.task_id === currentTaskId) {
        console.log('PDF processing progress:', data.progress + '%', data.message || '');
        
        // Update the appropriate progress bar based on active tab
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          if (scraperProgressBar) {
            updateProgressBarElement(scraperProgressBar, data.progress);
          }
          if (scraperProgressStatus && data.message) {
            scraperProgressStatus.textContent = data.message;
          }
        } else {
          // Default tab progress updates
          if (progressBar) {
            updateProgressBarElement(progressBar, data.progress);
          }
          if (progressStatus && data.message) {
            updateProgressStatus(progressStatus, data.message);
          }
        }
      }
    });
    
    // PDF processing complete
    socket.on('pdf_processing_complete', function(data) {
      if (data.task_id === currentTaskId) {
        console.log('PDF processing complete:', data);
        
        // Stop any progress simulation
        stopProgressSimulation();
        
        // Determine which tab is active and handle accordingly
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          formatAndDisplayScraperResults(data);
        } else {
          // Handle default tab completion
          showResult(data);
        }
        
        // Add task to history
        addTaskToHistory(getCurrentTaskType(), data.output_path, data.stats);
        showToast('Success', 'PDF processing completed successfully!', 'success');
      }
    });
    
    // PDF processing error
    socket.on('pdf_processing_error', function(data) {
      if (data.task_id === currentTaskId) {
        console.error('PDF processing error:', data);
        
        // Stop any progress simulation
        stopProgressSimulation();
        
        // Determine which tab is active
        const activeTab = document.querySelector('.tab-pane.active');
        
        if (activeTab && activeTab.id === 'scraper') {
          // Handle scraper error
          scraperProgressContainer.classList.add("d-none");
          scraperResultsContainer.classList.remove("d-none");
          
          if (scraperResults) {
            scraperResults.textContent = `Error: ${data.error || 'Unknown error occurred'}`;
          }
        } else {
          // Handle default tab error
          showError(data);
        }
        
        showToast('Error', data.error || 'An error occurred', 'error');
      }
    });
  }
  
  // Add event handlers for PDF-related UI elements
  const processPdfSwitch = document.getElementById('process-pdf-switch');
  if (processPdfSwitch) {
    processPdfSwitch.addEventListener('change', function() {
      const pdfOptionsSection = document.getElementById('pdf-processing-options');
      if (pdfOptionsSection) {
        pdfOptionsSection.style.display = this.checked ? 'block' : 'none';
      }
    });
  }
}
/**
 * Process PDF with error handling and recovery
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result
 */
function processPDF(pdfPath, options = {}) {
  // Default options
  const defaultOptions = {
    extractTables: window.pdfCapabilities?.tables || false,
    useOcr: window.pdfCapabilities?.ocr || false,
    outputFolder: null,
    maxAttempts: 2
  };
  
  const settings = { ...defaultOptions, ...options };
  
  // Show loading indicator
  showToast('Processing', `Processing PDF: ${pdfPath.split('/').pop()}`, 'info');
  
  return new Promise((resolve, reject) => {
    // Prepare the request payload
    const payload = {
      pdf_path: pdfPath,
      output_dir: settings.outputFolder,
      extract_tables: settings.extractTables,
      use_ocr: settings.useOcr,
      memory_efficient: true // Always use memory efficient mode
    };
    
    console.log("Sending PDF processing request:", payload);
    
    // Call the PDF processing API
    fetch('/api/pdf/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.status === "processing") {
        // Task is being processed asynchronously
        // We'll need to poll for updates
        const taskId = data.task_id;
        startStatusPolling(); // Make sure this is called to poll status
        resolve({ 
          status: 'processing',
          task_id: taskId,
          message: 'PDF processing has started'
        });
      } else if (data.status === "success") {
        // Processing completed synchronously
        resolve(data);
      } else {
        // Error occurred
        reject(new Error(data.error || "Unknown error"));
      }
    })
    .catch(error => {
      console.error("PDF processing error:", error);
      
      // Handle error with recovery options
      handleErrorWithRecovery(error, 'pdf-processing');
      reject(error);
    });
  });
}


/**
 * Update an existing PDF download item
 * @param {HTMLElement} item - The item element to update
 * @param {Object} pdf - PDF download info
 */
function updatePdfDownloadItem(item, pdf) {
  if (!item) return;
  
  // Get current status
  const currentStatus = item.getAttribute('data-status');
  const newStatus = pdf.status || currentStatus;
  
  // Only update if status has changed or progress has changed
  if (currentStatus !== newStatus) {
    // Status has changed, update item
    item.setAttribute('data-status', newStatus);
    
    // Update badge
    const badge = item.querySelector('.status-badge');
    if (badge) {
      badge.className = 'badge status-badge';
      
      switch (newStatus) {
        case 'success':
          badge.classList.add('bg-success');
          badge.textContent = 'Downloaded';
          break;
        case 'error':
          badge.classList.add('bg-danger');
          badge.textContent = 'Failed';
          break;
        case 'processing':
          badge.classList.add('bg-info');
          badge.textContent = 'Processing';
          break;
        default:
          badge.classList.add('bg-info');
          badge.textContent = 'Downloading';
      }
    }
    
    // Update progress bar
    const progressContainer = item.querySelector('.progress');
    if (progressContainer) {
      // If completed or error, remove progress bar with animation
      if (newStatus === 'success' || newStatus === 'error') {
        progressContainer.classList.add('fade-out');
        setTimeout(() => {
          progressContainer.remove();
        }, 300);
      }
    } else if (newStatus === 'downloading' || newStatus === 'processing') {
      // Add progress bar if needed
      const progressBar = document.createElement('div');
      progressBar.className = 'progress mt-1';
      progressBar.innerHTML = `
        <div class="progress-bar progress-bar-striped progress-bar-animated bg-info" 
          role="progressbar" style="width: ${pdf.progress || 50}%" aria-valuenow="${pdf.progress || 50}" aria-valuemin="0" 
          aria-valuemax="100"></div>
      `;
      
      // Insert after title
      const titleElement = item.querySelector('.pdf-item-title');
      if (titleElement && titleElement.parentNode) {
        titleElement.parentNode.appendChild(progressBar);
      }
    }
    
    // Update action buttons
    const actionsContainer = item.querySelector('.pdf-actions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      
      if (newStatus === 'success') {
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-sm btn-outline-success view-pdf-btn';
        viewBtn.setAttribute('data-path', pdf.filePath || '');
       viewBtn.setAttribute('title', 'View PDF');
       viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
       actionsContainer.appendChild(viewBtn);
       
       // Add event listener
       viewBtn.addEventListener('click', function() {
         const pdfPath = this.getAttribute('data-path');
         if (pdfPath) {
           openPdfViewer(pdfPath);
         }
       });
     } else if (newStatus === 'error') {
       const retryBtn = document.createElement('button');
       retryBtn.className = 'btn btn-sm btn-outline-warning retry-pdf-btn';
       retryBtn.setAttribute('data-url', pdf.url);
       retryBtn.setAttribute('title', 'Retry');
       retryBtn.innerHTML = '<i class="fas fa-redo"></i>';
       actionsContainer.appendChild(retryBtn);
       
       // Add event listener
       retryBtn.addEventListener('click', function() {
         const url = this.getAttribute('data-url');
         if (url) {
           retryPdfDownload(url, item.id);
         }
       });
     }
   }
 } else if (newStatus === 'downloading' || newStatus === 'processing') {
   // Just update progress if status hasn't changed
   const progressBar = item.querySelector('.progress-bar');
   if (progressBar && pdf.progress !== undefined) {
     progressBar.style.width = `${pdf.progress}%`;
     progressBar.setAttribute('aria-valuenow', pdf.progress);
   }
 }
}

/**
* Update PDF download summary counts
* @param {Array} pdfDownloads - Array of PDF download status objects
*/
function updatePdfDownloadSummary(pdfDownloads) {
 const summaryElement = document.getElementById('pdf-download-summary');
 if (!summaryElement) return;
 
 // Count by status
 const counts = {
   total: pdfDownloads.length,
   downloading: 0,
   processing: 0,
   success: 0,
   error: 0
 };
 
 // Calculate counts
 pdfDownloads.forEach(pdf => {
   const status = pdf.status || 'downloading';
   if (counts.hasOwnProperty(status)) {
     counts[status]++;
   }
 });
 
 // Create summary HTML
 const html = `
   <div class="d-flex justify-content-between mb-2">
     <span><strong>Total:</strong> ${counts.total}</span>
     <span><strong>Completed:</strong> <span class="text-success">${counts.success}</span></span>
     <span><strong>Active:</strong> <span class="text-info">${counts.downloading + counts.processing}</span></span>
     <span><strong>Failed:</strong> <span class="text-danger">${counts.error}</span></span>
   </div>
 `;
 
 summaryElement.innerHTML = html;
}

/**
* Retry a failed PDF download
* @param {string} url - URL of the PDF to retry
* @param {string} itemId - ID of the list item
*/
function retryPdfDownload(url, itemId) {
 // Find the item
 const item = document.getElementById(itemId);
 if (!item) return;
 
 // Update UI to show downloading
 item.setAttribute('data-status', 'downloading');
 
 // Update badge
 const badge = item.querySelector('.status-badge');
 if (badge) {
   badge.className = 'badge bg-info status-badge';
   badge.textContent = 'Downloading';
 }
 
 // Add or update progress bar
 let progressContainer = item.querySelector('.progress');
 if (!progressContainer) {
   progressContainer = document.createElement('div');
   progressContainer.className = 'progress mt-1';
   progressContainer.innerHTML = `
     <div class="progress-bar progress-bar-striped progress-bar-animated bg-info" 
       role="progressbar" style="width: 10%" aria-valuenow="10" aria-valuemin="0" 
       aria-valuemax="100"></div>
   `;
   
   // Insert after badge
   const titleElement = item.querySelector('.pdf-item-title');
   if (titleElement && titleElement.parentNode) {
     titleElement.parentNode.appendChild(progressContainer);
   }
 } else {
   // Update existing progress bar
   const progressBar = progressContainer.querySelector('.progress-bar');
   if (progressBar) {
     progressBar.style.width = '10%';
     progressBar.setAttribute('aria-valuenow', 10);
     progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
   }
 }
 
 // Update action buttons
 const actionsContainer = item.querySelector('.pdf-actions');
 if (actionsContainer) {
   actionsContainer.innerHTML = '';
 }
 
 // Get output folder from form or use default
 const outputFolder = document.getElementById('download-directory')?.value || '';
 
 // Send request to server
 fetch('/api/download-pdf', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ url, outputFolder })
 })
 .then(res => res.json())
 .then(data => {
   if (data.error) {
     // Update UI to show error
     updatePdfDownloadItem(item, { url, status: 'error' });
     showToast('Error', `Failed to download PDF: ${data.error}`, 'error');
   } else {
     // Update UI to show success
     updatePdfDownloadItem(item, { 
       url, 
       status: 'success', 
       filePath: data.filePath 
     });
     showToast('Success', 'PDF downloaded successfully', 'success');
   }
 })
 .catch(err => {
   console.error('Error downloading PDF:', err);
   updatePdfDownloadItem(item, { url, status: 'error' });
   showToast('Error', 'Failed to download PDF', 'error');
 });
}

/**
 * Implement all improvements for NeuroGen File Processing system
 * This function should be called at the application initialization
 */
function implementNeuroGenImprovements() {
  console.log("Implementing NeuroGen File Processing system improvements...");
  
  try {
    // 1. Setup robust Socket.IO connection
    setupRobustSocketConnection();
    
    // 2. Initialize PDF processing capabilities
    initializePdfProcessing();
    
    // 3. Add connection status indicator to UI
    addConnectionStatusIndicator();
    
    // 4. Update progress bar styling for better display
    enhanceProgressBarStyling();
    
    // 5. Improve history display
    enhanceHistoryDisplay();
    
    console.log("NeuroGen improvements successfully implemented");
    showToast('System Upgraded', 'NeuroGen improvements have been applied', 'success');
  } catch (error) {
    console.error("Error implementing NeuroGen improvements:", error);
    showToast('Error', 'Failed to apply some improvements: ' + error.message, 'error');
  }
}

/**
 * Add connection status indicator to the UI
 */
function addConnectionStatusIndicator() {
  // Check if indicator already exists
  if (document.getElementById('connection-indicator')) {
    return;
  }
  
  // Create the indicator element
  const indicator = document.createElement('div');
  indicator.id = 'connection-indicator';
  indicator.className = 'connection-status bg-secondary';
  indicator.innerHTML = '<i class="fas fa-wifi"></i>';
  indicator.title = 'Connection: Initializing';
  
  // Position in the top-right corner
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    z-index: 1000;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  // Add click handler to show connection details
  indicator.addEventListener('click', showConnectionDetails);
  
  // Add to body
  document.body.appendChild(indicator);
  
  // Update with current status
  if (socket && socket.connected) {
    updateConnectionIndicator('connected');
  } else {
    updateConnectionIndicator('disconnected');
  }
}

/**
 * Show connection details in a modal
 */
function showConnectionDetails() {
  // Create modal if it doesn't exist
  let connectionModal = document.getElementById('connection-details-modal');
  
  if (!connectionModal) {
    // Create modal structure
    connectionModal = document.createElement('div');
    connectionModal.id = 'connection-details-modal';
    connectionModal.className = 'modal fade';
    connectionModal.setAttribute('tabindex', '-1');
    connectionModal.setAttribute('aria-hidden', 'true');
    
    connectionModal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Connection Details</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="connection-details-content">
            Loading...
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" id="reconnect-btn">Reconnect</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(connectionModal);
    
    // Add event listener for reconnect button
    const reconnectBtn = connectionModal.querySelector('#reconnect-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', function() {
        // Reinitialize socket
        setupRobustSocketConnection();
        
        // Update content
        updateConnectionDetailsContent();
        
        showToast('Connection', 'Reconnection initiated', 'info');
      });
    }
  }
  
  // Update content
  updateConnectionDetailsContent();
  
  // Show modal
  const modal = new bootstrap.Modal(connectionModal);
  modal.show();
}

/**
 * Update connection details modal content
 */
function updateConnectionDetailsContent() {
  const contentElement = document.getElementById('connection-details-content');
  if (!contentElement) return;
  
  let html = '<div class="connection-stats">';
  
  // Connection status
  const connected = socket && socket.connected;
  const statusClass = connected ? 'text-success' : 'text-danger';
  const statusIcon = connected ? 'fa-check-circle' : 'fa-times-circle';
  html += `<p><i class="fas ${statusIcon} ${statusClass}"></i> Status: <strong class="${statusClass}">${connected ? 'Connected' : 'Disconnected'}</strong></p>`;
  
  // Socket ID
  html += `<p>Socket ID: <code>${socket ? socket.id || 'N/A' : 'N/A'}</code></p>`;
  
  // Transport type
  html += `<p>Transport: <code>${socket && socket.io ? socket.io.engine.transport.name : 'N/A'}</code></p>`;
  
  // Connection metrics
  if (window.connectionMetrics) {
    const metrics = window.connectionMetrics;
    
    // Connection quality
    const qualityClass = {
      'excellent': 'text-success',
      'good': 'text-success', 
      'poor': 'text-warning',
      'unknown': 'text-secondary'
    }[metrics.connectionQuality] || 'text-secondary';
    
    html += `<p>Connection Quality: <span class="${qualityClass}">${metrics.connectionQuality || 'unknown'}</span></p>`;
    
    // Ping history
    if (metrics.pingHistory && metrics.pingHistory.length) {
      const avgPing = metrics.pingHistory.reduce((sum, ping) => sum + ping, 0) / metrics.pingHistory.length;
      html += `<p>Average Ping: ${Math.round(avgPing)}ms</p>`;
      
      html += '<div class="ping-history small text-muted">Recent pings: ';
      metrics.pingHistory.forEach((ping, i) => {
        html += `${Math.round(ping)}ms${i < metrics.pingHistory.length - 1 ? ', ' : ''}`;
      });
      html += '</div>';
    }
    
    // Disconnect count
    html += `<p>Disconnections: ${metrics.disconnectCount}</p>`;
  }
  
  // Last activity
  const lastActivity = window.lastProgressTimestamp ? new Date(window.lastProgressTimestamp).toLocaleTimeString() : 'None';
  html += `<p>Last Activity: ${lastActivity}</p>`;
  
  html += '</div>';
  
  // Add troubleshooting section
  html += `
    <div class="mt-3">
      <h6>Troubleshooting</h6>
      <ul class="mb-0">
        <li>If connection is unstable, try refreshing the page</li>
        <li>Check your network connection</li>
        <li>The system will automatically fall back to polling if real-time updates are unavailable</li>
      </ul>
    </div>
  `;
  
  contentElement.innerHTML = html;
}

/**
 * Enhance progress bar styling for better display
 */
function enhanceProgressBarStyling() {
  // Create a style element
  const style = document.createElement('style');
  style.id = 'enhanced-progress-styles';
  
  // Add CSS to improve progress bar styling
  style.innerHTML = `
    /* Progress bar improvements */
    .progress {
      position: relative;
      height: 20px;
      border-radius: 4px;
      overflow: hidden;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .progress-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
      font-weight: bold;
      transition: width 0.3s ease;
      color: white;
      text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
    }
    
    /* Progress bar text color for very low values */
    .progress-bar.text-end {
      justify-content: flex-end;
    }
    
    /* Animation for completion */
    .progress-bar.completed-animation {
      animation: pulse-success 1.5s ease;
    }
    
    @keyframes pulse-success {
      0% { background-color: var(--bs-success); }
      50% { background-color: var(--bs-info); }
      100% { background-color: var(--bs-success); }
    }
    
    /* Connection status indicator */
    .connection-status {
      transition: background-color 0.3s ease;
    }
    
    .connection-status:hover {
      transform: scale(1.1);
    }
    
    /* Fade transitions */
    .fade-in {
      animation: fadeIn 0.3s ease-in;
    }
    
    .fade-out {
      animation: fadeOut 0.3s ease-out;
      opacity: 0;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `;
  
  // Add to the document head
  document.head.appendChild(style);
}

/**
 * Enhance history display with better formatting and features
 */
function enhanceHistoryDisplay() {
  if (!historyTableBody) return;
  
  // Add a hover effect to history rows
  const style = document.createElement('style');
  style.innerHTML = `
    .history-table tr {
      transition: background-color 0.2s ease;
    }
    
    .history-table tr:hover {
      background-color: rgba(0, 123, 255, 0.05);
    }
    
    .history-task-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      margin-right: 8px;
    }
    
    /* Type-specific styling */
    .task-type-file { background-color: rgba(13, 110, 253, 0.1); color: #0d6efd; }
    .task-type-scraper { background-color: rgba(13, 202, 240, 0.1); color: #0dcaf0; }
    .task-type-playlist { background-color: rgba(255, 193, 7, 0.1); color: #ffc107; }
  `;
  document.head.appendChild(style);
  
  // Update history refresh function to include enhanced formatting
  window.refreshHistoryTable = refreshEnhancedHistoryTable;
}

/**
 * Enhanced history refresh function
 */
function refreshEnhancedHistoryTable() {
  // Get existing implementation
  loadTaskHistoryFromStorage();
}


/**
 * Centralized error handling with recovery options
 * @param {Error|string} error - The error object or message
 * @param {string} context - Error context
 */
function handleErrorWithRecovery(error, context = 'general') {
  const errorMsg = error instanceof Error ? error.message : error;
  console.error(`Error in ${context}:`, error);
  
  // Don't show duplicate error messages
  const errorKey = `${context}:${errorMsg}`;
  if (window.errorCache && window.errorCache.has(errorKey)) {
    return;
  }
  
  // Create error cache if it doesn't exist
  if (!window.errorCache) {
    window.errorCache = new Map();
  }
  
  // Store error to prevent duplicates for 5 seconds
  window.errorCache.set(errorKey, true);
  setTimeout(() => {
    window.errorCache.delete(errorKey);
  }, 5000);
  
  // Initialize recovery options
  let recoveryOptions = [];
  
  // Create context-specific recovery options
  switch (context) {
    case 'socket':
      recoveryOptions = [
        {
          label: 'Reconnect',
          action: () => {
            setupRobustSocketConnection();
            showToast('Connection', 'Reconnection initiated', 'info');
          }
        },
        {
          label: 'Enable Polling',
          action: () => {
            startStatusPolling();
            showToast('Polling', 'Status polling enabled', 'info');
          }
        }
      ];
      break;
      
    case 'file-processing':
    case 'pdf-processing':
      recoveryOptions = [
        {
          label: 'Retry',
          action: () => {
            if (currentTaskId) {
              fetch(`/api/retry/${currentTaskId}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Task restarted', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart task', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
            }
          }
        },
        {
          label: 'New Task',
          action: () => {
            handleNewTaskClick();
          }
        }
      ];
      break;
      
    case 'playlist':
      // Check if we're getting the 'include_audio' error from the server logs
      if (errorMsg.includes("download_all_playlists() got an unexpected keyword argument 'include_audio'")) {
        // Special handling for this specific server error
        recoveryOptions = [
          {
            label: 'Retry Without Audio Option',
            action: () => {
              // Attempt to restart the playlist task without the audio option
              if (currentTaskId) {
                fetch(`/api/playlist/retry/${currentTaskId}`, { 
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    // Exclude the problematic parameter
                    include_audio: undefined
                  })
                })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Playlist download restarted with compatibility mode', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart playlist download', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
              }
            }
          },
          {
            label: 'New Task',
            action: () => {
              handleNewTaskClick();
            }
          }
        ];
      } else {
        // Standard playlist error handling
        recoveryOptions = [
          {
            label: 'Retry',
            action: () => {
              if (currentTaskId) {
                fetch(`/api/playlist/retry/${currentTaskId}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    showToast('Retry', 'Playlist download restarted', 'success');
                    startStatusPolling();
                  } else {
                    showToast('Error', data.error || 'Failed to restart playlist download', 'error');
                  }
                })
                .catch(err => {
                  showToast('Error', 'Failed to restart: ' + err.message, 'error');
                });
              }
            }
          }
        ];
      }
      break;
  }
  
  // Create error notification with recovery options if available
  if (recoveryOptions.length > 0) {
    showErrorToastWithRecovery(errorMsg || 'An unexpected error occurred', context, recoveryOptions);
  } else {
    // Use standard error toast
    showToast('Error', errorMsg || 'An unexpected error occurred', 'error');
  }
  
  // Log to server if available
  if (typeof sendErrorToServer === 'function') {
    sendErrorToServer(context, errorMsg, error);
  }
}

/**
 * Show error toast with recovery options
 * @param {string} message - Error message
 * @param {string} context - Error context
 * @param {Array} recoveryOptions - Array of recovery options
 */
function showErrorToastWithRecovery(message, context, recoveryOptions) {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // Generate a unique ID for this toast
  const toastId = 'toast-' + Date.now();
  
  // Create recovery options HTML
  let optionsHtml = '';
  if (recoveryOptions.length > 0) {
    optionsHtml = '<div class="mt-2 recovery-options">';
    
    recoveryOptions.forEach((option, index) => {
      optionsHtml += `
        <button class="btn btn-sm btn-outline-light me-2 recovery-btn" data-action="${index}">
          ${option.label}
        </button>
      `;
    });
    
    optionsHtml += '</div>';
  }
  
  // Create toast HTML
  const toastHtml = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-danger text-white">
        <i class="fas fa-exclamation-circle me-2"></i>
        <strong class="me-auto">Error: ${context}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
        ${optionsHtml}
      </div>
    </div>
  `;
  
  // Add toast to container
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  // Initialize and show the toast
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    animation: true,
    autohide: true,
    delay: 8000 // Longer delay for recovery options
  });
  toast.show();
  
  // Add event listeners for recovery options
  if (recoveryOptions.length > 0) {
    const recoveryButtons = toastElement.querySelectorAll('.recovery-btn');
    recoveryButtons.forEach(button => {
      button.addEventListener('click', function() {
        const actionIndex = parseInt(this.getAttribute('data-action'));
        if (recoveryOptions[actionIndex] && typeof recoveryOptions[actionIndex].action === 'function') {
          // Execute recovery action
          recoveryOptions[actionIndex].action();
          
          // Hide toast
          toast.hide();
        }
      });
    });
  }
  
  // Remove toast from DOM after it's hidden
  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

/**
 * Check if server is reachable and retry connection
 * @returns {Promise<boolean>} Whether server is reachable
 */
async function checkServerReachable() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('/api/ping', { 
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log("Server ping successful:", data);
      return data.status === 'ok';
    }
    
    return false;
  } catch (error) {
    console.warn("Server ping failed:", error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Normal initialization
  initializeApp();
  
  // Add NeuroGen improvements after initialization
  setTimeout(implementNeuroGenImprovements, 1000);
});