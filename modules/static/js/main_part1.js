"use strict";
// =============================================================================
// SECTION 1: GLOBAL VARIABLES AND INITIALIZATION
// =============================================================================

// Define critical functions first to prevent reference errors
window.initializeThemes = window.initializeThemes || function() {
  console.log("Fallback initializeThemes function called");
  return true;
};

// Track initialization state to prevent multiple initializations
window.appInitialized = false;
window.completionTriggered = false;
window.taskCompleted = false;
window.resultsDisplayed = false;
window.latestTaskData = null;

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

/**
 * Main application initialization function
 */
function initializeApp() {
  // Skip if already initialized
  if (window.appInitialized) {
    console.log("Application already initialized, skipping");
    return;
  }
  
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

/**
 * Initialize the Socket.IO connection with improved error handling
 */
function initializeSocketConnection() {
  try {
    // Check if Socket.IO is already initialized
    if (window.socket) {
      console.log('Socket.IO already initialized');
      return window.socket;
    }
    
    // Check if io is available
    if (typeof io === 'undefined') {
      console.error('Socket.IO client library not available');
      window.socket = null;  // Explicitly set to null instead of undefined
      return null;
    }
    
    // Initialize socket with error handling and reconnection settings
    window.socket = io({
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      timeout: 20000
    });
    
    console.log('Socket.IO connection initialized');
    
    // Set up basic event handlers
    window.socket.on('connect', () => {
      console.log(`Socket.IO connected with ID: ${window.socket.id}`);
    });
    
    window.socket.on('disconnect', (reason) => {
      console.log(`Socket.IO disconnected. Reason: ${reason}`);
    });
    
    window.socket.on('connect_error', (error) => {
      console.error(`Socket.IO connection error: ${error.message}`);
    });
    
    return window.socket;
  } catch (error) {
    console.error(`Error initializing Socket.IO: ${error.message}`);
    window.socket = null;  // Explicitly set to null for error handling
    return null;
  }
}

/**
 * Set up robust Socket.IO connection with reconnection handling
 */
function setupRobustSocketConnection() {
  // Setup Socket.IO connection with error handling
  try {
    initializeSocketConnection();
  } catch (error) {
    console.error("Error initializing Socket.IO connection:", error);
    // Will fall back to HTTP polling in setupProgressSocketHandler
  }
}

/**
 * Helper function to check if an element has an event listener
 * @param {Element} element - DOM element to check
 * @param {string} eventType - Event type to check for
 * @returns {boolean} - Whether the element has the event listener
 */
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

/**
 * Verify that all critical event listeners are attached
 * @returns {boolean} - Whether all event listeners are attached
 */
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

/**
 * Check if critical UI elements exist
 * @returns {boolean} - Whether all critical elements exist
 */
function checkCriticalElements() {
  const criticalElements = [
    document.getElementById('app-container'),
    document.getElementById('main-tabs'),
    document.getElementById('file-form')
  ];
  
  return criticalElements.every(element => element !== null);
}

/**
 * Ensure critical elements exist or create them
 */
function ensureCriticalElements() {
  // Implement element creation logic if needed
  // This is a placeholder for the actual implementation
}

/**
 * Initialize playlist functionality
 * Sets up all event listeners and UI elements for the playlist feature
 */
function initializePlaylistFeature() {
  // Initialize Socket.IO connection if needed
  if (!window.socket) {
    initializeSocketConnection();
  }
  
  // Set up event listeners with direct DOM references
  const playlistForm = document.getElementById('playlist-form');
  if (playlistForm) {
    console.log("Adding playlist form submit listener");
    // Remove any existing listener first to prevent duplicates
    const clonedForm = playlistForm.cloneNode(true);
    if (playlistForm.parentNode) {
      playlistForm.parentNode.replaceChild(clonedForm, playlistForm);
    }
    
    // Add the submit handler to the cloned form
    clonedForm.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handlePlaylistSubmit(e);
      return false;
    });
  }

  // Add URL button
  const addPlaylistBtn = document.getElementById('add-playlist-btn');
  if (addPlaylistBtn) {
    addPlaylistBtn.addEventListener('click', function() {
      addPlaylistField();
    });
  }

  // Cancel button
  const playlistCancelBtn = document.getElementById('playlist-cancel-btn');
  if (playlistCancelBtn) {
    playlistCancelBtn.addEventListener('click', function() {
      handlePlaylistCancelClick();
    });
  }

  // New task button
  const playlistNewTaskBtn = document.getElementById('playlist-new-task-btn');
  if (playlistNewTaskBtn) {
    playlistNewTaskBtn.addEventListener('click', function() {
      handleNewPlaylistTask();
    });
  }

  // Open JSON button
  const openPlaylistJsonBtn = document.getElementById('open-playlist-json');
  if (openPlaylistJsonBtn) {
    openPlaylistJsonBtn.addEventListener('click', function() {
      handleOpenPlaylistJson();
    });
  }

  // Browse button
  const playlistBrowseBtn = document.getElementById('playlist-browse-btn');
  if (playlistBrowseBtn) {
    playlistBrowseBtn.addEventListener('click', function() {
      handlePlaylistBrowse();
    });
  }

  // Set up directory auto-suggestion
  const playlistRootField = document.getElementById('playlist-root');
  const playlistOutputField = document.getElementById('playlist-output');
  
  if (playlistRootField && playlistOutputField) {
    playlistRootField.addEventListener('input', function() {
      if (this.value.trim() && !playlistOutputField.value.trim()) {
        const dirPath = this.value.trim();
        const folderName = dirPath.split(/[/\\]/).pop();
        
        if (folderName) {
          playlistOutputField.value = `${folderName}_playlists`;
          playlistOutputField.classList.add('bg-light');
          setTimeout(() => playlistOutputField.classList.remove('bg-light'), 1500);
        }
      }
    });
  }

  // Check for last used directory
  if (playlistRootField) {
    try {
      const lastDir = localStorage.getItem('lastPlaylistOutputDir');
      if (lastDir && !playlistRootField.value) {
        playlistRootField.value = lastDir;
        
        // Trigger input event to populate output field
        const event = new Event('input');
        playlistRootField.dispatchEvent(event);
      }
    } catch (e) {
      console.warn("Error accessing localStorage:", e);
    }
  }

  // Check for ongoing task
  checkForOngoingPlaylistTask();
  
  // Setup custom progress bar styles
  addProgressBarStyles();
  
  // Setup socket event handlers for progress updates if socket is available
  if (window.socket) {
    setupProgressSocketHandler();
  }
  
  console.log('Playlist feature initialized');
}

// Initialize application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  if (!window.appInitialized) {
    initializeApp();
  }
});

// Start initialization when the DOM is ready if not already initialized
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    if (!window.appInitialized) {
      initializeApp();
    }
  });
} else if (!window.appInitialized) {
  // DOM is already ready and app not initialized, initialize immediately
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
/**
 * Progress rate limiting settings
 */
let lastEmitTime = 0;
const progressRateLimit = {
  minInterval: 500, // Minimum time between updates in ms
  maxUpdatesPerMinute: 60
};
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
   * Start simulating progress updates
   * @param {number} start - Starting progress value
   * @param {number} target - Target progress value
   * @param {number} duration - Duration in seconds
   */
  function startProgressSimulation(start = 0, target = 95, duration = 30) {
    // Stop any existing simulation
    stopProgressSimulation();
    
    // Set up simulation parameters
    progressSimulation.active = true;
    progressSimulation.startValue = Math.max(0, Math.min(100, start));
    progressSimulation.currentValue = progressSimulation.startValue;
    progressSimulation.targetValue = Math.max(0, Math.min(100, target));
    
    // Calculate update frequency based on duration
    const totalUpdates = Math.max(5, Math.min(60, duration)); // Reasonable number of updates
    progressSimulation.updateFrequency = (duration * 1000) / totalUpdates;
    
    // Start the simulation interval
    progressSimulation.interval = setInterval(() => {
      if (!progressSimulation.active) {
        stopProgressSimulation();
        return;
      }
      
      // Calculate next progress value using non-linear curve for more realism
      if (progressSimulation.nonLinear) {
        // Non-linear progress - faster at beginning, slower towards end
        const remaining = progressSimulation.targetValue - progressSimulation.currentValue;
        const increment = Math.max(0.1, remaining * 0.1); // 10% of remaining progress
        progressSimulation.currentValue = Math.min(progressSimulation.targetValue, 
                                                progressSimulation.currentValue + increment);
      } else {
        // Linear progress
        const totalRange = progressSimulation.targetValue - progressSimulation.startValue;
        const incrementPerUpdate = totalRange / totalUpdates;
        progressSimulation.currentValue = Math.min(progressSimulation.targetValue, 
                                                progressSimulation.currentValue + incrementPerUpdate);
      }
      
      // Update UI with simulated progress
      updateGenericProgress({
        progress: Math.round(progressSimulation.currentValue),
        message: `Processing... (${Math.round(progressSimulation.currentValue)}%)`,
        status: "processing",
        task_id: window.currentTaskId
      });
      
      // Stop when we reach the target
      if (progressSimulation.currentValue >= progressSimulation.targetValue) {
        stopProgressSimulation();
      }
    }, progressSimulation.updateFrequency);
    
    console.log(`Started progress simulation: ${start}% → ${target}% over ${duration}s`);
  }

  /**
   * Stop progress simulation
   */
  function stopProgressSimulation() {
    if (progressSimulation.interval) {
      clearInterval(progressSimulation.interval);
      progressSimulation.interval = null;
    }
    progressSimulation.active = false;
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
 * @returns {string} The task type: 'file', 'playlist', or 'scraper'
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