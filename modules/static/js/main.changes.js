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
    if (window.socket && window.socket.connected) {
      console.log('Socket.IO already connected');
      return window.socket;
    }
    
    // Clear any existing socket
    if (window.socket) {
      try {
        console.log('Cleaning up existing socket connection');
        window.socket.disconnect();
        window.socket = null;
      } catch (e) {
        console.warn('Error cleaning up socket connection:', e);
      }
    }
    
    // Check if io is available
    if (typeof io === 'undefined') {
      console.error('Socket.IO client library not available');
      window.socket = null;
      return null;
    }
    
    // Initialize socket with more robust settings
    const socketOptions = {
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 20000,
      transports: ['polling', 'websocket'], // Start with polling for better compatibility
      path: '/socket.io/'
    };
    
    window.socket = io(socketOptions);
    console.log('Socket.IO connection initialized');
    
    // Set up robust event handlers
    window.socket.on('connect', () => {
      console.log(`Socket.IO connected with ID: ${window.socket.id}`);
      
      // Re-register for any ongoing tasks
      const taskId = sessionStorage.getItem('ongoingTaskId');
      if (taskId) {
        console.log(`Reconnected, re-registering for task: ${taskId}`);
        registerTaskHandlers(taskId);
      }
    });
    
    // Handle disconnection with intelligent reconnection strategy
    window.socket.on('disconnect', (reason) => {
      console.log(`Socket.IO disconnected. Reason: ${reason}`);
      if (reason === 'io server disconnect') {
        // Reconnect if server disconnected us
        setTimeout(() => window.socket.connect(), 1000);
      }
    });
    
    // Enhanced error handling with transport fallback
    window.socket.on('connect_error', (error) => {
      console.error(`Socket.IO connection error: ${error.message}`);
      
      // Fall back to polling if websocket fails
      if (window.socket.io.opts.transports[0] === 'websocket') {
        console.log('Falling back to polling transport');
        window.socket.io.opts.transports = ['polling', 'websocket'];
      }
    });
    
    return window.socket;
  } catch (error) {
    console.error(`Error initializing Socket.IO: ${error.message}`);
    window.socket = null;
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
    // Only setup handlers once after connection is initialized
    if (window.socket && !window.socket._progressHandlersSetup) {
      setupUnifiedProgressHandlers();
      window.socket._progressHandlersSetup = true;
    }
  } catch (error) {
    console.error("Error initializing Socket.IO connection:", error);
    // Will fall back to HTTP polling in setupProgressSocketHandler
  }
}

/**
 * Unified progress handler setup to prevent duplicates
 */
function setupUnifiedProgressHandlers() {
  if (!window.socket) return;
  
  console.log("Setting up unified progress handlers");
  
  // Remove any existing handlers first
  window.socket.off('progress_update');
  window.socket.off('task_started');
  window.socket.off('task_completed');
  window.socket.off('task_error');
  window.socket.off('task_cancelled');
  
  // Variable to track last progress to prevent duplicates
  let lastProgress = -1;
  let lastUpdateTime = 0;
  const progressUpdateInterval = 500; // Minimum milliseconds between updates
  
  // Set up single progress update handler
  window.socket.on('progress_update', function(data) {
    // Prevent duplicate progress updates
    const now = Date.now();
    const progressChanged = Math.abs(data.progress - lastProgress) >= 1;
    const timePassed = (now - lastUpdateTime) >= progressUpdateInterval;
    
    if (!progressChanged && !timePassed) {
      return; // Skip duplicate update
    }
    
    lastProgress = data.progress;
    lastUpdateTime = now;
    
    console.log(`Progress update: ${data.progress}% - ${data.message}`);
    updateProgressUI(data);
  });
  
  // Handle task started events
  window.socket.on('task_started', function(data) {
    console.log('Task started:', data);
    handleTaskStarted(data);
  });
  
  // Handle task completion events  
  window.socket.on('task_completed', function(data) {
    console.log('Task completed:', data);
    handleTaskCompleted(data);
  });
  
  // Handle task error events
  window.socket.on('task_error', function(data) {
    console.log('Task error:', data);
    handleTaskError(data);
  });
  
  // Handle task cancellation events
  window.socket.on('task_cancelled', function(data) {
    console.log('Task cancelled:', data);
    handleTaskCancelled(data);
  });
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
 * Generate a consistent client ID for Socket.IO tracking
 */
function generateClientId() {
  let clientId = localStorage.getItem('neurogenClientId');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('neurogenClientId', clientId);
  }
  return clientId;
}

/**
 * Initialize Socket.IO with enhanced error handling and reconnection
 */
function initializeSocket() {
  // Use the unified socket connection instead
  if (window.socket && window.socket.connected) {
    console.log("Socket already connected via window.socket");
    socket = window.socket;
    return;
  }
  
  // Initialize using the unified function
  const unifiedSocket = initializeSocketConnection();
  if (unifiedSocket) {
    socket = unifiedSocket;
    window.socket = socket;
    
    // Setup unified handlers if not already done
    if (!socket._progressHandlersSetup) {
      setupUnifiedProgressHandlers();
      socket._progressHandlersSetup = true;
    }
    console.log("Socket.IO connection initialized");
  } else {
    console.error("Failed to initialize Socket.IO");
    showToast('Connection Error', 'Real-time updates unavailable. Falling back to polling.', 'warning');
    startStatusPolling();
  }
}

/**
 * Generate a unique client ID for Socket.IO
 */
function generateClientId() {
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('clientId', clientId);
  }
  return clientId;
}

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
  // DISABLED - Using unified handler instead
  // socket.on('progress_update', function(data) {
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
    .then(response => {
      // Handle 404 or other errors gracefully
      if (response.status === 404) {
        console.warn('PDF capabilities endpoint not found, trying alternative endpoint');
        // Try alternative endpoint
        return fetch('/api/pdf-capabilities');
      }
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.status === 'success' && data.capabilities) {
        displayPdfCapabilities(data.capabilities);
      } else if (data && data.capabilities) {
        // Handle alternative response format
        displayPdfCapabilities(data.capabilities);
      } else {
        // Use fallback capabilities
        console.warn('Using fallback PDF capabilities');
        displayPdfCapabilities({
          pdf_extraction: true,
          ocr: true,
          structify: true,
          pikepdf: true,
          table_extraction: true,
          document_detection: true,
          enhanced_output: true,
          memory_efficient: true
        });
      }
    })
    .catch(error => {
      console.error('Error fetching PDF capabilities:', error);
      // Display fallback capabilities on error
      displayPdfCapabilities({
        pdf_extraction: true,
        ocr: true,
        structify: true,
        pikepdf: false,
        table_extraction: true,
        document_detection: true,
        enhanced_output: false,
        memory_efficient: true
      });
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
 * Show error message and return to form
 * @param {string} errorMessage - The error message to display
 */
function showPlaylistErrorMessage(errorMessage) {
  const progressContainer = document.getElementById('playlist-progress-container');
  const formContainer = document.getElementById('playlist-form-container');
  
  if (progressContainer && formContainer) {
    // Hide progress, show form
    progressContainer.classList.add('d-none');
    formContainer.classList.remove('d-none');
  }
  
  // Show error toast
  showToastMessage('Error', errorMessage, 'error');
  
  // Clear session storage
  try {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  } catch (e) {
    console.warn("Error clearing sessionStorage:", e);
  }
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
 * Update progress UI based on task type
 * @param {Object} data - Progress data
 * @param {string} taskType - Task type: 'file', 'playlist', or 'scraper'
 */
function updateProgressForTaskType(data, taskType) {
  switch (taskType) {
    case 'playlist':
      if (typeof updatePlaylistProgress === 'function') {
        updatePlaylistProgress(data);
      }
      break;
    case 'scraper':
      if (typeof updateScraperProgress === 'function') {
        updateScraperProgress(data);
      }
      break;
    case 'file':
    default:
      updateGenericProgress(data);
      break;
  }
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

// Integrated Task Cancellation - Add to your existing main.js
// Works with your existing setupTaskStatusEvents() and initializeSocketConnection()

// ============================================================================
// OPTIMIZED & UNIFIED FRONTEND TASK CANCELLATION SYSTEM
// ============================================================================
// Enhanced implementation aligned with backend, DRY principles, and performance optimizations

// ----------------------------------------------------------------------------
// Core Cancellation State Management
// ----------------------------------------------------------------------------

/**
 * Centralized cancellation state management
 */
const CancellationManager = {
  // State tracking
  pendingCancellations: new Set(),
  cancellationTimeouts: new Map(),
  
  // Configuration
  SOCKET_TIMEOUT: 3000, // 3 seconds
  BUTTON_DEBOUNCE: 1000, // 1 second
  
  /**
   * Check if a cancellation is pending for a task
   */
  isPending(taskId) {
    return this.pendingCancellations.has(taskId);
  },
  
  /**
   * Mark cancellation as pending
   */
  setPending(taskId) {
    this.pendingCancellations.add(taskId);
    
    // Auto-cleanup after timeout
    setTimeout(() => {
      this.clearPending(taskId);
    }, this.SOCKET_TIMEOUT + 2000);
  },
  
  /**
   * Clear pending cancellation
   */
  clearPending(taskId) {
    this.pendingCancellations.delete(taskId);
    
    // Clear any associated timeout
    if (this.cancellationTimeouts.has(taskId)) {
      clearTimeout(this.cancellationTimeouts.get(taskId));
      this.cancellationTimeouts.delete(taskId);
    }
  },
  
  /**
   * Set timeout for fallback cancellation
   */
  setTimeout(taskId, callback, delay = this.SOCKET_TIMEOUT) {
    // Clear existing timeout
    this.clearTimeout(taskId);
    
    const timeoutId = setTimeout(callback, delay);
    this.cancellationTimeouts.set(taskId, timeoutId);
  },
  
  /**
   * Clear timeout
   */
  clearTimeout(taskId) {
    if (this.cancellationTimeouts.has(taskId)) {
      clearTimeout(this.cancellationTimeouts.get(taskId));
      this.cancellationTimeouts.delete(taskId);
    }
  }
};

// ----------------------------------------------------------------------------
// Enhanced Task Type Detection
// ----------------------------------------------------------------------------

/**
 * Comprehensive task type detection with fallback logic
 */
function getCurrentTaskType() {
  // Check active tab first
  const activeTab = document.querySelector('.tab-pane.active');
  if (activeTab?.id) {
    const taskTypeMap = {
      'scraper': 'scraper',
      'playlist': 'playlist',
      'academic': 'academic',
      'pdf': 'pdf',
      'file': 'file'
    };
    
    if (taskTypeMap[activeTab.id]) {
      return taskTypeMap[activeTab.id];
    }
  }
  
  // Fallback: check session storage
  const sessionTaskType = sessionStorage.getItem('ongoingTaskType');
  if (sessionTaskType) {
    return sessionTaskType;
  }
  
  // Default fallback
  return 'file';
}

/**
 * Get appropriate cancel endpoint based on task type
 */
function getCancelEndpoint(taskId, taskType = null) {
  const type = taskType || getCurrentTaskType();
  
  const endpointMap = {
    'scraper': `/api/scrape2/cancel/${taskId}`,
    'pdf': `/api/pdf/cancel/${taskId}`,
    'playlist': `/api/cancel/${taskId}`,
    'academic': `/api/cancel/${taskId}`,
    'file': `/api/cancel/${taskId}`
  };
  
  return endpointMap[type] || `/api/cancel/${taskId}`;
}

// ----------------------------------------------------------------------------
// Enhanced Cancellation Handler
// ----------------------------------------------------------------------------

/**
 * Enhanced cancel button handler with comprehensive error handling and optimization
 */
function handleCancelClick() {
  // Validation checks
  if (!currentTaskId) {
    showToast('Error', 'No active task to cancel', 'error');
    return;
  }
  
  // Prevent double-clicking during pending cancellation
  if (CancellationManager.isPending(currentTaskId)) {
    console.log('Cancellation already in progress for task:', currentTaskId);
    return;
  }
  
  // User confirmation
  if (!confirm('Are you sure you want to cancel the current task?')) {
    return;
  }
  
  console.log(`Initiating cancellation for task: ${currentTaskId}`);
  
  // Mark as pending and disable UI
  CancellationManager.setPending(currentTaskId);
  disableCancelButtons();
  
  // Try Socket.IO first (preferred method)
  if (isSocketConnected()) {
    attemptSocketCancellation(currentTaskId);
  } else {
    console.log('Socket.IO not available, using REST API directly');
    attemptRestCancellation(currentTaskId);
  }
}

/**
 * Check Socket.IO connection status
 */
function isSocketConnected() {
  return window.socket && 
         window.socket.connected && 
         typeof window.socket.emit === 'function';
}

/**
 * Attempt cancellation via Socket.IO with fallback
 */
function attemptSocketCancellation(taskId) {
  try {
    // Emit cancellation request
    window.socket.emit('cancel_task', { task_id: taskId });
    console.log('Cancellation request sent via Socket.IO');
    
    // Set fallback timeout
    CancellationManager.setTimeout(taskId, () => {
      if (CancellationManager.isPending(taskId)) {
        console.log('Socket.IO cancellation timeout, trying REST API');
        attemptRestCancellation(taskId);
      }
    });
    
  } catch (error) {
    console.error('Socket.IO cancellation failed:', error);
    attemptRestCancellation(taskId);
  }
}

/**
 * Attempt cancellation via REST API
 */
function attemptRestCancellation(taskId) {
  const taskType = getCurrentTaskType();
  const cancelEndpoint = getCancelEndpoint(taskId, taskType);
  
  console.log(`Attempting REST cancellation: ${cancelEndpoint}`);
  
  fetch(cancelEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    // Add timeout for fetch request
    signal: AbortSignal.timeout(10000) // 10 second timeout
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('REST cancellation successful:', data);
    handleSuccessfulCancellation(taskId, taskType, data);
  })
  .catch(error => {
    console.error('REST cancellation error:', error);
    handleCancellationError(taskId, error);
  });
}

/**
 * Handle successful cancellation response
 */
function handleSuccessfulCancellation(taskId, taskType, data) {
  // Clear pending state
  CancellationManager.clearPending(taskId);
  
  // Only proceed if this is still the current task
  if (currentTaskId === taskId) {
    handleTaskCancellation(taskType);
    showToast('Cancelled', data.message || 'Task cancelled successfully', 'warning');
    clearTaskState();
  }
}

/**
 * Handle cancellation error
 */
function handleCancellationError(taskId, error) {
  CancellationManager.clearPending(taskId);
  enableCancelButtons();
  
  const errorMessage = error.name === 'AbortError' ? 
    'Cancellation request timed out' : 
    `Failed to cancel task: ${error.message}`;
  
  showToast('Error', errorMessage, 'error');
}

// ----------------------------------------------------------------------------
// Enhanced Task State Management
// ----------------------------------------------------------------------------

/**
 * Clear all task-related state
 */
function clearTaskState() {
  currentTaskId = null;
  sessionStorage.removeItem('ongoingTaskId');
  sessionStorage.removeItem('ongoingTaskType');
  
  // Clear completion flags
  window.completionTriggered = false;
  window.taskCompleted = false;
  
  console.log('Task state cleared');
}

/**
 * Enhanced task cancellation handler with improved logic
 */
function handleTaskCancellation(taskType) {
  console.log(`Processing cancellation for task type: ${taskType}`);
  
  // Stop any active polling
  if (typeof stopStatusPolling === 'function') {
    stopStatusPolling();
  }
  
  // Clear any pending cancellation state
  if (currentTaskId) {
    CancellationManager.clearPending(currentTaskId);
  }
  
  // Handle UI updates based on task type
  updateUIForCancellation(taskType);
  
  // Re-enable interface elements
  restoreUIState();
  
  console.log('Task cancellation processing completed');
}

/**
 * Update UI elements based on task type
 */
function updateUIForCancellation(taskType) {
  const uiConfig = {
    'scraper': {
      hide: ['scraperProgressContainer'],
      show: ['scraperFormContainer']
    },
    'playlist': {
      hide: ['playlistProgressContainer'],
      show: ['playlistFormContainer']
    },
    'pdf': {
      hide: ['pdfProcessingProgressContainer'],
      show: ['fileProcessingFormContainer']
    },
    'file': {
      hide: ['fileProcessingProgressContainer'],
      show: ['fileProcessingFormContainer']
    },
    'academic': {
      hide: ['academicProgressContainer'],
      show: ['academicFormContainer']
    }
  };
  
  const config = uiConfig[taskType];
  if (config) {
    config.hide.forEach(id => hideElement(id));
    config.show.forEach(id => showElement(id));
  } else {
    // Fallback: hide all progress, show all forms
    hideAllProgressContainers();
    showAllFormContainers();
  }
}

/**
 * Restore UI to interactive state
 */
function restoreUIState() {
  enableCancelButtons();
  enableSubmitButtons();
  
  // Clear any status indicators
  const statusElements = document.querySelectorAll('.task-status, .progress-indicator');
  statusElements.forEach(el => el.textContent = '');
}

// ----------------------------------------------------------------------------
// Enhanced Button State Management
// ----------------------------------------------------------------------------

/**
 * Enhanced button disabling with better selectors and state tracking
 */
function disableCancelButtons() {
  const selectors = [
    '[id*="cancel"]',
    '[class*="cancel"]', 
    '.cancel-btn',
    '[data-action="cancel"]'
  ];
  
  const cancelButtons = document.querySelectorAll(selectors.join(', '));
  
  cancelButtons.forEach(btn => {
    if (btn.tagName === 'BUTTON' && !btn.disabled) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Cancelling...';
      btn.classList.add('cancelling');
    }
  });
  
  console.log(`Disabled ${cancelButtons.length} cancel buttons`);
}

/**
 * Enhanced button enabling with state restoration
 */
function enableCancelButtons() {
  const selectors = [
    '[id*="cancel"]',
    '[class*="cancel"]', 
    '.cancel-btn',
    '[data-action="cancel"]'
  ];
  
  const cancelButtons = document.querySelectorAll(selectors.join(', '));
  
  cancelButtons.forEach(btn => {
    if (btn.tagName === 'BUTTON') {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || 'Cancel';
      btn.classList.remove('cancelling');
      delete btn.dataset.originalText;
    }
  });
  
  console.log(`Enabled ${cancelButtons.length} cancel buttons`);
}

/**
 * Enable submit/start buttons
 */
function enableSubmitButtons() {
  const selectors = [
    '[type="submit"]',
    '.submit-btn',
    '.start-btn',
    '[data-action="start"]'
  ];
  
  const submitButtons = document.querySelectorAll(selectors.join(', '));
  submitButtons.forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('processing');
  });
}

// ----------------------------------------------------------------------------
// Enhanced UI Element Management
// ----------------------------------------------------------------------------

/**
 * Enhanced element hiding with validation
 */
function hideElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('d-none');
    console.debug(`Hidden element: ${elementId}`);
  } else {
    console.debug(`Element not found for hiding: ${elementId}`);
  }
}

/**
 * Enhanced element showing with validation
 */
function showElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.remove('d-none');
    console.debug(`Shown element: ${elementId}`);
  } else {
    console.debug(`Element not found for showing: ${elementId}`);
  }
}

/**
 * Hide all progress containers with comprehensive list
 */
function hideAllProgressContainers() {
  const progressContainers = [
    'scraperProgressContainer',
    'playlistProgressContainer',
    'fileProcessingProgressContainer',
    'pdfProcessingProgressContainer',
    'academicProgressContainer',
    'batchProcessingProgressContainer'
  ];
  
  let hiddenCount = 0;
  progressContainers.forEach(id => {
    const element = document.getElementById(id);
    if (element && !element.classList.contains('d-none')) {
      hideElement(id);
      hiddenCount++;
    }
  });
  
  console.log(`Hidden ${hiddenCount} progress containers`);
}

/**
 * Show all form containers with comprehensive list
 */
function showAllFormContainers() {
  const formContainers = [
    'scraperFormContainer',
    'playlistFormContainer',
    'fileProcessingFormContainer',
    'academicFormContainer',
    'batchProcessingFormContainer'
  ];
  
  let shownCount = 0;
  formContainers.forEach(id => {
    const element = document.getElementById(id);
    if (element && element.classList.contains('d-none')) {
      showElement(id);
      shownCount++;
    }
  });
  
  console.log(`Shown ${shownCount} form containers`);
}

// ----------------------------------------------------------------------------
// Enhanced Socket.IO Event Handlers
// ----------------------------------------------------------------------------

/**
 * Enhanced cancellation event setup with comprehensive event handling
 */
function setupCancellationEvents() {
  if (!window.socket) {
    console.warn('Socket.IO not available, cancellation will use REST API only');
    return;
  }
  
  // Enhanced task_cancelled handler (integrates with existing setupTaskStatusEvents)
  window.socket.on('task_cancelled', function(data) {
    if (data.task_id === currentTaskId) {
      console.log('General task cancellation received:', data);
      CancellationManager.clearPending(data.task_id);
      
      const taskType = data.task_type || getCurrentTaskType();
      handleTaskCancellation(taskType);
      showToast('Cancelled', data.reason || 'Task cancelled', 'warning');
      clearTaskState();
    }
  });
  
  // Specific task type cancellation handlers
  const cancellationHandlers = {
    'pdf_processing_cancelled': 'pdf',
    'scraping_cancelled': 'scraper',
    'playlist_cancelled': 'playlist',
    'academic_cancelled': 'academic'
  };
  
  Object.entries(cancellationHandlers).forEach(([eventName, taskType]) => {
    window.socket.on(eventName, function(data) {
      if (data.task_id === currentTaskId) {
        console.log(`${eventName} received:`, data);
        CancellationManager.clearPending(data.task_id);
        
        handleTaskCancellation(taskType);
        showToast('Cancelled', data.reason || `${taskType} cancelled`, 'warning');
        clearTaskState();
      }
    });
  });
  
  // Enhanced connection monitoring
  window.socket.on('connect', () => {
    console.log('Socket.IO connected - cancellation events ready');
  });
  
  window.socket.on('disconnect', (reason) => {
    console.log(`Socket.IO disconnected (${reason}) - using REST API for cancellations`);
  });
  
  console.log('Enhanced cancellation events configured');
}

// ----------------------------------------------------------------------------
// Initialization and Error Handling
// ----------------------------------------------------------------------------

/**
 * Enhanced initialization with error handling
 */
function initializeCancellationSystem() {
  try {
    // Initialize Socket.IO if available
    if (typeof initializeSocketConnection === 'function') {
      initializeSocketConnection();
    }
    
    // Setup task status events if available
    if (typeof setupTaskStatusEvents === 'function') {
      setupTaskStatusEvents();
    }
    
    // Setup cancellation events
    setupCancellationEvents();
    
    console.log('Cancellation system initialized successfully');
    
  } catch (error) {
    console.error('Error initializing cancellation system:', error);
    // System can still work with REST API fallback
  }
}

// Enhanced initialization with proper timing
document.addEventListener('DOMContentLoaded', function() {
  // Delayed initialization to ensure all dependencies are loaded
  setTimeout(initializeCancellationSystem, 100);
});

// ----------------------------------------------------------------------------
// Utility Functions for Development/Debugging
// ----------------------------------------------------------------------------

/**
 * Debug function to check cancellation system status
 */
function debugCancellationStatus() {
  return {
    currentTaskId,
    taskType: getCurrentTaskType(),
    socketConnected: isSocketConnected(),
    pendingCancellations: Array.from(CancellationManager.pendingCancellations),
    activeTimeouts: CancellationManager.cancellationTimeouts.size
  };
}

// Expose debug function to global scope in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.debugCancellation = debugCancellationStatus;
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
  // DISABLED - Using unified handler instead
  // socket.on('progress_update', function(data) {
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


/**
 * Configure progress emission rate limiting
 * @param {Object} options - Rate limiting options
 */
function emitProgressWithRateLimiting(options) {
  if (!options) return;
  
  if (options.enabled !== undefined) {
    progressRateLimit.enabled = !!options.enabled;
  }
  
  if (options.minInterval !== undefined && !isNaN(options.minInterval)) {
    progressRateLimit.minInterval = Math.max(100, options.minInterval);
  }
  
  if (options.maxUpdatesPerMinute !== undefined && !isNaN(options.maxUpdatesPerMinute)) {
    progressRateLimit.maxUpdatesPerMinute = Math.max(1, Math.min(120, options.maxUpdatesPerMinute));
  }
  
  console.log("Progress rate limiting configured:", progressRateLimit);
}

/**
 * Progress simulation state and functions
 */
const progressSimulation = {
  active: false,
  interval: null,
  startValue: 0,
  currentValue: 0,
  targetValue: 100,
  updateFrequency: 1000,
  nonLinear: true
};

/**
 * Set up Socket.IO event handlers for progress updates with robust error handling and fallback
 * Combines the best of both implementations to ensure maximum reliability for all tabs
 */
function setupProgressSocketHandler() {
  // Track setup status to prevent duplicate handlers
  if (window._socketHandlersInitialized) {
    console.log("Socket handlers already initialized, skipping duplicate setup");
    return;
  }
  
  // Handle the case when socket is unavailable - use HTTP polling as fallback
  if (!window.socket) {
    console.warn("Socket.IO not available for progress updates - Using HTTP polling fallback");
    setupHttpPollingFallback();
    return;
  }
  
  console.log("Setting up Socket.IO progress handlers");
  
  // Remove any existing event handlers to prevent duplicates
  // This is more reliable than trying to check if they're already registered
  removeExistingSocketHandlers();
  
  // Set up general progress_update handler that routes to appropriate handler based on task type
  // DISABLED - Using unified handler instead
  // window.socket.on('progress_update', function(data) {
    console.log('Progress update received:', data ? `${data.progress}%, ${data.message || ''}` : 'No data');
    if (!data) return;
    
    if (data.task_id === window.currentTaskId) {
      const taskType = getCurrentTaskType();
      updateProgressForTaskType(data, taskType);

      // Store latest data for potential failure recovery
      window.latestTaskData = data;
      window.lastProgressValue = data.progress;
      window.lastProgressUpdate = Date.now();

      // Stop any progress simulation since we have a real update
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
    }
  });

  // Playlist-specific progress events
  window.socket.on('playlist_progress', function(data) {
    if (data && data.task_id === window.currentTaskId) {
      if (typeof updatePlaylistProgress === 'function') {
        updatePlaylistProgress(data);
      } else {
        // Fallback to generic if specific handler not available
        updateProgressForTaskType(data, 'playlist');
      }
    }
  });
  
  // Task completion events
  window.socket.on('task_completed', function(data) {
    console.log('Task completed event received:', data);
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation since task is complete
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'completed');
      
      // Clear task ID to prevent duplicate processing
      setTimeout(() => {
        window.currentTaskId = null;
      }, 100);
    }
  });
  
  // Error events
  window.socket.on('task_error', function(data) {
    console.error('Task error event received:', data);
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation on error
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'failed');
    }
  });
  
  // Playlist error event (dedicated handler for backward compatibility)
  window.socket.on('playlist_error', handlePlaylistErrorEvent);
  
  // Cancellation events
  window.socket.on('task_cancelled', function(data) {
    if (data && data.task_id === window.currentTaskId) {
      // Stop any progress simulation on cancellation
      if (typeof stopProgressSimulation === 'function') {
        stopProgressSimulation();
      }
      
      // Stop any active polling
      stopStatusPolling();
      
      const taskType = getCurrentTaskType();
      handleTaskStatusChange(data, taskType, 'cancelled');
    }
  });
  
  // Connection events for robust operation
  window.socket.on('connect', function() {
    console.log(`Socket.IO connected with ID: ${window.socket.id}`);
    
    // Request initial status if there's an ongoing task after connecting
    if (window.currentTaskId) {
      requestTaskStatus();
    }
  });
  
  window.socket.on('disconnect', function(reason) {
    console.log(`Socket.IO disconnected. Reason: ${reason}`);
    
    // If we have an active task, start HTTP polling as fallback
    if (window.currentTaskId && !window.socketFallbackInterval) {
      console.log("Starting HTTP polling fallback due to socket disconnect");
      setupHttpPollingFallback();
    }
  });
  
  window.socket.on('reconnect', function(attemptNumber) {
    console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
    
    // Re-request task status after reconnection
    if (window.currentTaskId) {
      requestTaskStatus();
      
      // Clear any fallback polling that might have been started
      if (window.socketFallbackInterval) {
        clearInterval(window.socketFallbackInterval);
        window.socketFallbackInterval = null;
        console.log("Stopped HTTP polling fallback after socket reconnection");
      }
    }
  });
  
  // Request initial status if there's an ongoing task
  if (window.currentTaskId) {
    requestTaskStatus();
  }
  
  // Mark handlers as initialized to prevent duplicate setup
  window._socketHandlersInitialized = true;
}

/**
 * Remove any existing socket event handlers to prevent duplicates
 */
function removeExistingSocketHandlers() {
  if (!window.socket) return;
  
  const eventNames = [
    'progress_update', 
    'playlist_progress', 
    'task_completed', 
    'task_error', 
    'playlist_error', 
    'task_cancelled'
  ];
  
  // Only remove our application-specific handlers, not the built-in ones
  eventNames.forEach(eventName => {
    try {
      window.socket.off(eventName);
    } catch (e) {
      console.warn(`Error removing event handler for ${eventName}:`, e);
    }
  });
}

/**
 * Set up HTTP polling as a fallback for when Socket.IO is unavailable
 */
function setupHttpPollingFallback() {
  // Clear any existing interval to prevent duplicates
  if (window.socketFallbackInterval) {
    clearInterval(window.socketFallbackInterval);
  }
  
  // Create a fallback mechanism for updates without socket
  window.socketFallbackInterval = setInterval(() => {
    if (!window.currentTaskId) {
      // Clear interval if no active task
      clearInterval(window.socketFallbackInterval);
      window.socketFallbackInterval = null;
      console.log("Status polling stopped - No active task ID");
      return;
    }
    
    // Track consecutive errors for exponential backoff
    if (!window._pollingErrorCount) {
      window._pollingErrorCount = 0;
    }
    
    fetchTaskStatus(window.currentTaskId)
      .then(data => {
        // Reset error count on success
        window._pollingErrorCount = 0;
        
        console.log("Polling status update:", data);
        
        // Process updates using appropriate handler based on task type
        const taskType = getCurrentTaskType();
        updateProgressForTaskType(data, taskType);
        
        // Store latest data for potential failure recovery
        window.latestTaskData = data;
        window.lastProgressValue = data.progress;
        window.lastProgressUpdate = Date.now();
        
        // Check if we should stop polling
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(window.socketFallbackInterval);
          window.socketFallbackInterval = null;
          console.log("Status polling stopped due to task completion/failure/cancellation");
          
          // Handle respective statuses
          handleTaskStatusChange(data, taskType);
        }
      })
      .catch(error => {
        console.warn("Status polling error:", error);
        window._pollingErrorCount++;
        
        // Exponential backoff after repeated errors
        if (window._pollingErrorCount > 5) {
          const backoffDelay = Math.min(10000, 1000 * Math.pow(1.5, window._pollingErrorCount - 5));
          console.warn(`Polling errors occurring, backing off for ${backoffDelay}ms`);
          
          // Temporarily pause polling
          clearInterval(window.socketFallbackInterval);
          
          // Resume with longer interval
          setTimeout(() => {
            // Re-configure with longer interval if errors persist
            if (window._pollingErrorCount > 10) {
              console.warn("Too many consecutive errors, stopping polling and attempting recovery");
              attemptTaskRecovery();
              return;
            }
            
            // Restart polling with adjusted interval
            setupHttpPollingFallback();
          }, backoffDelay);
        }
      });
  }, determinePollInterval());
}

/**
 * Determine appropriate polling interval based on task type and progress
 * More frequent for fast-moving tasks, slower for longer tasks
 */
function determinePollInterval() {
  const taskType = getCurrentTaskType();
  const lastProgress = window.lastProgressValue || 0;
  
  // Use more frequent polling for almost-complete tasks
  if (lastProgress > 80) {
    return 1500; // 1.5 seconds - more responsive near completion
  }
  
  // Adjust based on task type
  switch (taskType) {
    case 'file':
      return 2000; // 2 seconds - file processing typically finishes quickly
    case 'playlist':
      return 3000; // 3 seconds - playlists can take longer
    case 'scraper':
      return 4000; // 4 seconds - scraping is usually the longest operation
    default:
      return 3000; // Default interval
  }
}

/**
 * Fetch task status from server with timeout
 */
function fetchTaskStatus(taskId) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch(`/api/status/${taskId}`, { signal: controller.signal })
      .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        return response.json();
      })
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Request current task status via socket
 */
function requestTaskStatus() {
  if (!window.socket || !window.currentTaskId) return;
  
  console.log(`Requesting status for task ID: ${window.currentTaskId}`);
  try {
    window.socket.emit('request_task_status', { task_id: window.currentTaskId });
  } catch (e) {
    console.error("Error requesting task status:", e);
  }
}

/**
 * Stop all active status polling
 */
function stopStatusPolling() {
  // Clear both regular interval and fallback interval
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  if (window.socketFallbackInterval) {
    clearInterval(window.socketFallbackInterval);
    window.socketFallbackInterval = null;
  }
  
  if (window.statusPollInterval) {
    clearInterval(window.statusPollInterval);
    window.statusPollInterval = null;
  }
  
  console.log("Status polling stopped");
}

/**
 * Handle playlist-specific error events
 */
function handlePlaylistErrorEvent(data) {
  if (data && data.task_id === window.currentTaskId) {
    console.error('Playlist error:', data);
    
    // Stop any progress simulation on error
    if (typeof stopProgressSimulation === 'function') {
      stopProgressSimulation();
    }
    
    // Stop any active polling
    stopStatusPolling();
    
    // Handle playlist error
    if (typeof showPlaylistErrorMessage === 'function') {
      showPlaylistErrorMessage(data.error || 'An error occurred with the playlist download');
    } else if (typeof handleTaskFailed === 'function') {
      handleTaskFailed(data);
    } else if (typeof showToast === 'function') {
      showToast('Error', data.error || 'An error occurred with the playlist download', 'error');
    } else {
      alert('Error: ' + (data.error || 'An error occurred with the playlist download'));
    }
    
    // Clear session storage
    window.currentTaskId = null;
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
      console.warn("Error clearing sessionStorage:", e);
    }
  }
}

/**
 * Attempt to recover from task failures or server disconnections
 * Uses the latest known data to simulate completion if needed
 */
function attemptTaskRecovery() {
  if (!window.currentTaskId) return;
  
  console.log("Attempting task recovery with latest known data");
  
  // Check if we have recent data with high progress
  if (window.latestTaskData && window.latestTaskData.progress >= 90) {
    console.log("Recovery: Task was nearly complete, simulating completion");
    
    // Create completion data from latest known data
    const completionData = {
      ...window.latestTaskData,
      status: "completed",
      progress: 100,
      message: "Task completed (recovery mode)"
    };
    
    // Process as completion
    const taskType = getCurrentTaskType();
    handleTaskStatusChange(completionData, taskType, 'completed');
    
    // Clean up
    window.currentTaskId = null;
    try {
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    } catch (e) {
      console.warn("Error clearing sessionStorage:", e);
    }
    
    return;
  }
  
  // If task wasn't near completion, show error
  showToast('Connection Lost', 'Lost connection to the server during task processing', 'error');
  
  // Reset UI to form state based on task type
  const taskType = getCurrentTaskType();
  resetUIForTaskType(taskType);
}

/**
 * Reset UI to form state based on task type
 */
function resetUIForTaskType(taskType) {
  switch (taskType) {
    case 'playlist':
      if (playlistProgressContainer && playlistFormContainer) {
        playlistProgressContainer.classList.add('d-none');
        playlistFormContainer.classList.remove('d-none');
      }
      break;
    case 'scraper':
      if (scraperProgressContainer && scraperFormContainer) {
        scraperProgressContainer.classList.add('d-none');
        scraperFormContainer.classList.remove('d-none');
      }
      break;
    case 'file':
    default:
      if (progressContainer && formContainer) {
        progressContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
      break;
  }
}
/**
 * Handle task status changes based on type and status
 * @param {Object} data - Task data
 * @param {string} taskType - Task type
 * @param {string} status - Status override (optional)
 */
function handleTaskStatusChange(data, taskType, status) {
  const taskStatus = status || data.status;
  
  switch (taskStatus) {
    case 'completed':
      if (taskType === 'playlist' && typeof handleTaskCompleted === 'function') {
        handleTaskCompleted(data);
      } else if (taskType === 'file') {
        handleCompletion(data);
      } else if (taskType === 'scraper' && typeof handleScraperCompletion === 'function') {
        handleScraperCompletion(data);
      }
      break;
      
    case 'failed':
      if (taskType === 'playlist' && typeof handleTaskFailed === 'function') {
        handleTaskFailed(data);
      } else if (taskType === 'file') {
        handleError(data);
      } else if (taskType === 'scraper' && typeof handleScraperError === 'function') {
        handleScraperError(data.error);
      }
      break;
      
    case 'cancelled':
      if (taskType === 'playlist' && typeof handleTaskCancelled === 'function') {
        handleTaskCancelled();
      } else if (taskType === 'file') {
        handleCancellation();
      } else if (taskType === 'scraper' && typeof handleScraperCancellation === 'function') {
        handleScraperCancellation();
      }
      break;
  }
}

/**
 * Generic progress update function for File Processing tab
 */
function updateGenericProgress(data) {
  if (!data) return;
  
  // Get UI elements
  const progressBar = document.getElementById('progress-bar');
  const progressStatus = document.getElementById('progress-status');
  const progressStats = document.getElementById('progress-stats');
  
  // Update progress bar
  if (progressBar && typeof data.progress === 'number') {
    const progress = Math.min(100, Math.max(0, data.progress));
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    progressBar.textContent = `${Math.round(progress)}%`;
    
    // Update styling
    if (progress >= 100) {
      progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.add('bg-success');
    } else {
      progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.remove('bg-success');
    }
  }
  
  // Update status message
  if (progressStatus && data.message) {
    progressStatus.textContent = data.message;
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateFileStats(progressStats, data.stats);
  }
  
  // Handle completion
  if (data.status === 'completed') {
    handleCompletion(data);
  } else if (data.status === 'failed' || data.error) {
    handleError(data);
  } else if (data.status === 'cancelled') {
    handleCancellation();
  }
}

/**
 * Update file stats display
 */
function updateFileStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  if (stats.total_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Files <span class="badge bg-primary rounded-pill">${stats.total_files}</span>
    </li>`;
  }
  
  if (stats.processed_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Files <span class="badge bg-success rounded-pill">${stats.processed_files}</span>
    </li>`;
  }
  
  if (stats.error_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Error Files <span class="badge bg-danger rounded-pill">${stats.error_files}</span>
    </li>`;
  }
  
  if (stats.skipped_files !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Skipped Files <span class="badge bg-warning rounded-pill">${stats.skipped_files}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Show progress UI based on task type
 * @param {string} taskType - Task type
 */
function showProgressUI(taskType) {
  switch (taskType) {
    case 'playlist':
      showPlaylistProgress();
      break;
    case 'scraper':
      if (typeof showScraperProgress === 'function') {
        showScraperProgress();
      }
      break;
    case 'file':
    default:
      // Show file progress UI
      if (formContainer && progressContainer) {
        formContainer.classList.add('d-none');
        progressContainer.classList.remove('d-none');
        
        // Reset progress elements
        if (progressBar) {
          progressBar.style.width = '0%';
          progressBar.setAttribute('aria-valuenow', '0');
          progressBar.textContent = '0%';
        }
        
        if (progressStatus) {
          progressStatus.textContent = "Initializing file processing...";
        }
        
        if (progressStats) {
          progressStats.innerHTML = "";
        }
      }
      break;
  }
}

/**
 * Show playlist progress UI with transitions
 */
function showPlaylistProgress() {
  const playlistFormContainer = document.getElementById('playlist-form-container');
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistProgressBar = document.getElementById('playlist-progress-bar');
  const playlistProgressStatus = document.getElementById('playlist-progress-status');
  const playlistProgressStats = document.getElementById('playlist-progress-stats');
  
  if (!playlistFormContainer || !playlistProgressContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistFormContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistFormContainer.classList.add('d-none');
    playlistFormContainer.classList.remove('fade-out');
    
    playlistProgressContainer.classList.remove('d-none');
    playlistProgressContainer.classList.add('fade-in');
    
    // Reset progress elements
    if (playlistProgressBar) {
      playlistProgressBar.style.width = '0%';
      playlistProgressBar.setAttribute('aria-valuenow', '0');
      playlistProgressBar.textContent = '0%';
    }
    
    if (playlistProgressStatus) {
      playlistProgressStatus.textContent = "Initializing playlist download...";
    }
    
    if (playlistProgressStats) {
      playlistProgressStats.innerHTML = "";
    }
    
    setTimeout(() => {
      playlistProgressContainer.classList.remove('fade-in');
    }, 500);
  }, 300);
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
// SECTION 17: PLAYLISTS TAB IMPLEMENTATION
// =============================================================================


/**
 * Add playlist URL field to form
 */
function addPlaylistField() {
  const container = document.getElementById('playlist-urls-container');
  if (!container) {
    console.error("Playlist container not found");
    return;
  }
  
  const template = `
    <div class="input-group mb-2">
      <input type="url" class="form-control playlist-url" placeholder="Enter YouTube Playlist URL" required>
      <button type="button" class="btn btn-outline-danger remove-url">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  
  // Create temporary element to hold the HTML
  const temp = document.createElement('div');
  temp.innerHTML = template.trim();
  
  // Get the first child (the actual input-group)
  const inputGroup = temp.firstChild;
  
  // Add to container
  container.appendChild(inputGroup);
  
  // Add event listener for the remove button
  const removeBtn = inputGroup.querySelector('.remove-url');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      inputGroup.remove();
    });
  }
}
/**
 * Handle the playlist form submission - prevent default action and provide fallbacks
 * @param {Event} e - The form submission event
 */
function handlePlaylistSubmit(e) {
  // Prevent form submission
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log("Playlist form submitted");
  
  try {
    // Get form elements
    const urlInputs = document.querySelectorAll('.playlist-url');
    const rootDirInput = document.getElementById('playlist-root');
    const outputFileInput = document.getElementById('playlist-output');
    const submitBtn = document.getElementById('playlist-submit-btn');
    
    // Check if elements exist
    if (!urlInputs.length || !rootDirInput || !outputFileInput || !submitBtn) {
      throw new Error("Form elements not found. Please refresh the page.");
    }
    
    // Get values
    const urls = Array.from(urlInputs)
      .map(input => input.value.trim())
      .filter(url => url !== '');
    
    const rootDir = rootDirInput.value.trim();
    const outputFile = outputFileInput.value.trim();
    
    // Validate
    if (urls.length === 0) {
      throw new Error("Please enter at least one YouTube playlist URL");
    }
    
    if (!rootDir) {
      rootDirInput.classList.add('is-invalid');
      setTimeout(() => rootDirInput.classList.remove('is-invalid'), 3000);
      rootDirInput.focus();
      throw new Error("Please enter a download root directory");
    }
    
    if (!outputFile) {
      outputFileInput.classList.add('is-invalid');
      setTimeout(() => outputFileInput.classList.remove('is-invalid'), 3000);
      outputFileInput.focus();
      throw new Error("Please enter an output filename");
    }
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Starting...';
    
    // Save root dir to localStorage
    try {
      localStorage.setItem('lastPlaylistOutputDir', rootDir);
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
    
    // Show progress UI
    const formContainer = document.getElementById('playlist-form-container');
    const progressContainer = document.getElementById('playlist-progress-container');
    
    if (formContainer && progressContainer) {
      formContainer.classList.add('d-none');
      progressContainer.classList.remove('d-none');
      
      // Reset progress elements
      const progressBar = document.getElementById('playlist-progress-bar');
      const progressStatus = document.getElementById('playlist-progress-status');
      const progressStats = document.getElementById('playlist-progress-stats');
      
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', '0');
        progressBar.textContent = '0%';
      }
      
      if (progressStatus) {
        progressStatus.textContent = "Initializing playlist download...";
      }
      
      if (progressStats) {
        progressStats.innerHTML = "";
      }
    }
    
    // Create payload EXACTLY matching server expectations
    const payload = {
      playlists: urls,
      root_directory: rootDir,
      output_file: outputFile
    };
    
    console.log("Sending request with data:", payload);
    
    // Call API
    fetch('/api/start-playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`Server error (${response.status}):`, text);
          try {
            const data = JSON.parse(text);
            if (data.error && typeof data.error === 'object' && data.error.message) {
              throw new Error(data.error.message);
            } else if (data.error) {
              throw new Error(data.error);
            } else {
              throw new Error(`Server error: ${response.status}`);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error(text || `Server error: ${response.status}`);
            } else {
              throw e;
            }
          }
        });
      }
      return response.json();
    })
    .then(data => {
      console.log("API response:", data);
      
      // Handle success
      if (data.task_id) {
        // Store task ID
        window.currentTaskId = data.task_id;
        
        // Save to sessionStorage
        try {
          sessionStorage.setItem('ongoingTaskId', data.task_id);
          sessionStorage.setItem('ongoingTaskType', 'playlist');
          if (data.output_file) {
            sessionStorage.setItem('outputFile', data.output_file);
          }
        } catch (e) {
          console.warn("Could not save to sessionStorage:", e);
        }
        
        // Start polling
        startPolling(data.task_id);
        
        // Show success message
        if (typeof showToast === 'function') {
          showToast('Processing Started', 'Your playlists are being downloaded', 'info');
        } else {
          alert('Processing Started: Your playlists are being downloaded');
        }
      } else {
        throw new Error("No task ID returned from server");
      }
    })
    .catch(error => {
      console.error("Playlist download error:", error);
      
      // Show error
      if (typeof showToast === 'function') {
        showToast('Error', error.message, 'error');
      } else {
        alert(`Error: ${error.message}`);
      }
      
      // Reset UI
      if (formContainer && progressContainer) {
        progressContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
      
      // Reset button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
      }
    });
    
  } catch (error) {
    // Handle validation errors
    console.error("Form validation error:", error);
    if (typeof showToast === 'function') {
      showToast('Error', error.message, 'error');
    } else {
      alert(`Error: ${error.message}`);
    }
  }
  
  return false;
}

/**
 * Start polling for status updates
 * @param {string} taskId - The task ID to poll
 */
function startPolling(taskId) {
  if (!taskId) {
    console.warn("No task ID to poll");
    return;
  }
  
  // Clear existing interval
  if (window.statusPollInterval) {
    clearInterval(window.statusPollInterval);
  }
  
  // Start new interval
  window.statusPollInterval = setInterval(() => {
    fetch(`/api/status/${taskId}`)
      .then(response => response.json())
      .then(data => {
        console.log("Status update:", data);
        
        // Update UI
        updateProgress(data);
        
        // Check completion
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(window.statusPollInterval);
          
          if (data.status === 'completed') {
            handleCompletion(data);
          } else if (data.status === 'failed') {
            handleError(data);
          } else if (data.status === 'cancelled') {
            handleCancellation();
          }
        }
      })
      .catch(error => {
        console.warn("Status polling error:", error);
      });
  }, 2000);
}

/**
 * Update progress UI
 * @param {Object} data - Progress data from server
 */
function updateProgress(data) {
  if (!data) return;
  
  // Get UI elements
  const progressBar = document.getElementById('playlist-progress-bar');
  const progressStatus = document.getElementById('playlist-progress-status');
  const progressStats = document.getElementById('playlist-progress-stats');
  
  // Update progress bar
  if (progressBar && typeof data.progress === 'number') {
    const progress = Math.min(100, Math.max(0, data.progress));
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress.toString());
    progressBar.textContent = `${Math.round(progress)}%`;
    
    // Update styling
    if (progress >= 100) {
      progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.add('bg-success');
    } else {
      progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.remove('bg-success');
    }
  }
  
  // Update status
  if (progressStatus && data.message) {
    progressStatus.textContent = data.message;
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateStats(progressStats, data.stats);
  }
}

/**
 * Update stats display
 * @param {HTMLElement} element - Stats element
 * @param {Object} stats - Stats data
 */
function updateStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  // Add standard stats
  if (stats.playlists_total !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
    </li>`;
  }
  
  if (stats.playlists_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  if (stats.videos_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Videos Processed <span class="badge bg-success rounded-pill">${stats.videos_processed}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Handle task completion
 * @param {Object} data - Completion data
 */
function handleCompletion(data) {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const resultsContainer = document.getElementById('playlist-results-container');
  const statsElement = document.getElementById('playlist-stats');
  const openButton = document.getElementById('open-playlist-json');
  
  // Update UI
  if (progressContainer && resultsContainer) {
    progressContainer.classList.add('d-none');
    resultsContainer.classList.remove('d-none');
    
    // Update stats
    if (statsElement && data.stats) {
      updateFinalStats(statsElement, data.stats, data.output_file);
    }
    
    // Update open button
    if (openButton && data.output_file) {
      openButton.setAttribute('data-output-file', data.output_file);
    }
  }
  
  // Show notification
  if (typeof showToast === 'function') {
    showToast('Success', 'Playlist download completed successfully', 'success');
  } else {
    alert('Success: Playlist download completed successfully');
  }
  
  // Clear storage
  window.currentTaskId = null;
  try {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  } catch (e) {
    console.warn("Could not clear sessionStorage:", e);
  }
}

/**
 * Handle task error
 * @param {Object} data - Error data
 */
function handleError(data) {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const formContainer = document.getElementById('playlist-form-container');
  
  // Update UI
  if (progressContainer && formContainer) {
    progressContainer.classList.add('d-none');
    formContainer.classList.remove('d-none');
  }
  
  // Show error
  if (typeof showToast === 'function') {
    showToast('Error', data.error || 'Task failed', 'error');
  } else {
    alert(`Error: ${data.error || 'Task failed'}`);
  }
  
  // Reset submit button
  const submitBtn = document.getElementById('playlist-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
  }
  
  // Clear storage
  window.currentTaskId = null;
  try {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  } catch (e) {
    console.warn("Could not clear sessionStorage:", e);
  }
}

/**
 * Handle task cancellation
 */
function handleCancellation() {
  // Get UI elements
  const progressContainer = document.getElementById('playlist-progress-container');
  const formContainer = document.getElementById('playlist-form-container');
  
  // Update UI
  if (progressContainer && formContainer) {
    progressContainer.classList.add('d-none');
    formContainer.classList.remove('d-none');
  }
  
  // Show notification
  if (typeof showToast === 'function') {
    showToast('Cancelled', 'Playlist download was cancelled', 'warning');
  } else {
    alert('Cancelled: Playlist download was cancelled');
  }
  
  // Reset submit button
  const submitBtn = document.getElementById('playlist-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
  }
  
  // Clear storage
  window.currentTaskId = null;
  try {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  } catch (e) {
    console.warn("Could not clear sessionStorage:", e);
  }
}

/**
 * Update final stats display
 * @param {HTMLElement} element - Stats element
 * @param {Object} stats - Stats data
 * @param {string} outputFile - Output file path
 */
function updateFinalStats(element, stats, outputFile) {
  if (!element) return;
  
  let html = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
  
  // Add stats
  if (stats.playlists_total !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
    </li>`;
  }
  
  if (stats.playlists_processed !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  // Add duration if available
  if (stats.duration_seconds !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
    </li>`;
  }
  
  // Add directory if available
  if (stats.download_directory) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Download Directory <span class="text-muted small">${stats.download_directory}</span>
    </li>`;
  }
  
  // Add output file if available
  if (outputFile) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Output File <span class="text-muted small">${outputFile}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  return [
    h > 0 ? `${h}h` : '',
    m > 0 ? `${m}m` : '',
    s > 0 || (h === 0 && m === 0) ? `${s}s` : ''
  ].filter(Boolean).join(' ');
}


/**
 * Get playlist URLs from form inputs
 * @returns {Array<string>} Array of playlist URLs
 */
function getPlaylistUrls() {
  const container = document.getElementById('playlist-urls-container');
  if (!container) {
    console.error("Playlist URLs container not found");
    return [];
  }
  
  const urls = [];
  const urlInputs = container.querySelectorAll('.playlist-url');
  
  urlInputs.forEach(input => {
    const url = input.value.trim();
    if (url) {
      urls.push(url);
    }
  });
  
  console.log("Retrieved playlist URLs:", urls);
  return urls;
}

/**
 * Debug tool - Ask the server to describe its expected API format
 */
function debugServerApi() {
  console.log("Requesting API format details from server");
  
  // Try to call a test endpoint to get API info
  fetch('/api/describe', { method: 'GET' })
    .then(response => response.json())
    .then(data => {
      console.log("Server API description:", data);
    })
    .catch(error => {
      console.error("Failed to get API description:", error);
      
      // Try an alternative endpoint
      fetch('/api/info', { method: 'GET' })
        .then(response => response.json())
        .then(data => {
          console.log("Server info:", data);
        })
        .catch(err => {
          console.error("Failed to get server info:", err);
        });
    });
}

/**
 * Test the server API with a simple request
 */
function testPlaylistApi() {
  const testData = {
    playlists: ["https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj"],
    root_directory: "/tmp",
    output_file: "test.json"
  };
  
  console.log("Testing playlist API with minimal data:", testData);
  
  fetch('/api/start-playlists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testData)
  })
  .then(response => response.text())
  .then(text => {
    console.log("Server test response:", text);
    try {
      const data = JSON.parse(text);
      console.log("Parsed response:", data);
    } catch (e) {
      console.log("Raw response (not JSON):", text);
    }
  })
  .catch(error => {
    console.error("Test request failed:", error);
  });
}

/**
 * Make sure socket is properly defined
 */
if (typeof window.socket === 'undefined' || window.socket === null) {
  try {
    if (typeof io !== 'undefined') {
      console.log("Initializing Socket.IO connection");
      window.socket = io();
      
      // Set up basic event handlers
      window.socket.on('connect', () => {
        console.log('Socket.IO connected with ID:', window.socket.id);
      });
      
      window.socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected. Reason:', reason);
      });
    } else {
      console.warn("Socket.IO client not available");
    }
  } catch (e) {
    console.error("Error initializing socket:", e);
  }
}

/**
 * Add a basic implementation for socket functions if needed
 */
if (typeof window.setupProgressSocketHandler !== 'function') {
  window.setupProgressSocketHandler = function() {
    if (!window.socket) {
      console.warn("Socket.IO not available");
      return;
    }
    
    console.log("Setting up Socket.IO progress handlers");
    
    // Set up basic event handlers for progress updates
    // DISABLED - Using unified handler instead
    // window.socket.on('progress_update', function(data) {
      console.log('Progress update:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof updatePlaylistProgress === 'function') {
          updatePlaylistProgress(data);
        }
      }
    });
    
    window.socket.on('task_completed', function(data) {
      console.log('Task completed:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof handleTaskCompleted === 'function') {
          handleTaskCompleted(data);
        }
      }
    });
    
    window.socket.on('task_error', function(data) {
      console.log('Task error:', data);
      if (data && data.task_id === window.currentTaskId) {
        if (typeof handleTaskFailed === 'function') {
          handleTaskFailed(data);
        } else if (typeof showToast === 'function') {
          showToast('Error', data.error || 'Task failed', 'error');
        }
      }
    });
  };
}

/**
 * Basic implementation of updatePlaylistProgress if not available
 */
if (typeof window.updatePlaylistProgress !== 'function') {
  window.updatePlaylistProgress = function(data) {
    if (!data) return;
    
    console.log("Updating progress with data:", data);
    
    // Get UI elements
    const progressBar = document.getElementById('playlist-progress-bar');
    const progressStatus = document.getElementById('playlist-progress-status');
    
    // Update progress bar
    if (progressBar && typeof data.progress === 'number') {
      const progress = Math.min(100, Math.max(0, data.progress));
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
      progressBar.textContent = `${Math.round(progress)}%`;
    }
    
    // Update status message
    if (progressStatus && data.message) {
      progressStatus.textContent = data.message;
    }
  };
}

/**
 * Add event listeners when document is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM is ready, initializing playlist feature");
  
  // Add the form submit listener with a delay to ensure everything is loaded
  setTimeout(() => {
    const playlistForm = document.getElementById('playlist-form');
    if (playlistForm) {
      // Remove any existing listeners to avoid duplicates
      playlistForm.removeEventListener('submit', handlePlaylistSubmit);
      
      // Add the submit handler with both options (inline and reference)
      playlistForm.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handlePlaylistSubmit(e);
        return false;
      });
      
      console.log("Playlist form submit listener added");
    } else {
      console.warn("Playlist form not found");
    }
    
    // Initialize playlist feature
    if (typeof initializePlaylistFeature === 'function') {
      initializePlaylistFeature();
    } else {
      console.warn("initializePlaylistFeature function not available");
    }
  }, 500);
});

/**
 * Check for ongoing playlist tasks from previous sessions
 */
function checkForOngoingPlaylistTask() {
  try {
    const taskId = sessionStorage.getItem('ongoingTaskId');
    const taskType = sessionStorage.getItem('ongoingTaskType');
    
    if (taskId && taskType === 'playlist') {
      console.log(`Found ongoing playlist task: ${taskId}`);
      
      // Set current task ID
      window.currentTaskId = taskId;
      
      // Show progress UI with direct DOM access
      const playlistFormContainer = document.getElementById('playlist-form-container');
      const playlistProgressContainer = document.getElementById('playlist-progress-container');
      
      if (playlistFormContainer && playlistProgressContainer) {
        playlistFormContainer.classList.add('d-none');
        playlistProgressContainer.classList.remove('d-none');
      } else if (typeof showPlaylistProgress === 'function') {
        // Fallback
        showPlaylistProgress();
      }
      
      // Start status polling
      if (typeof startStatusPolling === 'function') {
        startStatusPolling();
      }
      
      // Request initial status update from the socket
      if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit('request_task_status', { task_id: taskId });
      }
    }
  } catch (error) {
    console.error("Error checking for ongoing tasks:", error);
  }
}
/**
 * Handle browse button click for playlist root directory
 */
function handlePlaylistBrowse() {
  // Show directory picker if available through Electron
  if (typeof window.selectDirectory === 'function') {
    window.selectDirectory().then(result => {
      if (result && result.filePaths && result.filePaths.length > 0) {
        const rootDirField = document.getElementById('playlist-root');
        if (rootDirField) {
          rootDirField.value = result.filePaths[0];
          
          // Save for future use
          localStorage.setItem('lastPlaylistOutputDir', result.filePaths[0]);
          
          // Trigger input event to update output suggestion
          const event = new Event('input');
          rootDirField.dispatchEvent(event);
        }
      }
    }).catch(err => {
      console.error('Error selecting directory:', err);
    });
  } else {
    // Use backend API if browser-based
    fetch('/api/browse-directory', {
      method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
      if (data.path) {
        const rootDirField = document.getElementById('playlist-root');
        if (rootDirField) {
          rootDirField.value = data.path;
          
          // Save for future use
          localStorage.setItem('lastPlaylistOutputDir', data.path);
          
          // Trigger input event to update output suggestion
          const event = new Event('input');
          rootDirField.dispatchEvent(event);
        }
      }
    })
    .catch(err => {
      console.error('Error browsing for directory:', err);
      showToast('Error', 'Failed to browse for directory', 'error');
    });
  }
}

function handlePlaylistCancelClick() {
  if (!window.currentTaskId) {
      console.warn("No active task ID found");
      return;
  }
  
  // Confirm cancellation
  if (!confirm('Are you sure you want to cancel the current playlist download?')) {
      return;
  }
  
  // Disable cancel button to prevent multiple clicks
  const cancelBtn = document.getElementById('playlist-cancel-btn');
  if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Cancelling...';
  }
  
  console.log("Cancelling task:", window.currentTaskId);
  
  // Call the cancel endpoint
  fetch(`/api/cancel/${window.currentTaskId}`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      }
  })
  .then(response => {
      if (!response.ok) {
          return response.json().then(data => {
              throw new Error(data.error || `Server error: ${response.status}`);
          });
      }
      return response.json();
  })
  .then(data => {
      console.log("Cancel response:", data);
      
      // Show cancellation message
      if (typeof showToast === 'function') {
          showToast('Cancelled', data.message || 'Download cancelled', 'warning');
      } else {
          alert('Download cancelled');
      }
      
      // Return to form view
      const playlistProgressContainer = document.getElementById('playlist-progress-container');
      const playlistFormContainer = document.getElementById('playlist-form-container');
      
      if (playlistProgressContainer) playlistProgressContainer.classList.add('d-none');
      if (playlistFormContainer) playlistFormContainer.classList.remove('d-none');
      
      // Reset button state
      const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
      if (playlistSubmitBtn) {
          playlistSubmitBtn.disabled = false;
          playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
      }
      
      // Clear task ID and session storage
      window.currentTaskId = null;
      try {
          sessionStorage.removeItem('ongoingTaskId');
          sessionStorage.removeItem('ongoingTaskType');
      } catch (e) {
          console.warn("Could not clear session storage:", e);
      }
      
      // Stop polling if active
      if (window.statusCheckInterval) {
          clearInterval(window.statusCheckInterval);
          window.statusCheckInterval = null;
      }
  })
  .catch(error => {
      console.error('Cancel error:', error);
      
      // Show error message
      if (typeof showToast === 'function') {
          showToast('Error', 'Failed to cancel task: ' + error.message, 'error');
      } else {
          alert('Error: ' + error.message);
      }
      
      // Re-enable cancel button
      if (cancelBtn) {
          cancelBtn.disabled = false;
          cancelBtn.innerHTML = '<i class="fas fa-times me-2"></i>Cancel';
      }
  });
}

/**
 * Handle new task button click
 */
function handleNewPlaylistTask() {
  // Hide results container and show form container
  const playlistResultsContainer = document.getElementById('playlist-results-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (playlistResultsContainer) playlistResultsContainer.classList.add('d-none');
  if (playlistFormContainer) playlistFormContainer.classList.remove('d-none');
  
  // Reset form state
  const playlistForm = document.getElementById('playlist-form');
  if (playlistForm) playlistForm.reset();
  
  // Reset current task ID
  window.currentTaskId = null;
  
  // Check if there's a last used directory
  const lastDir = localStorage.getItem('lastPlaylistOutputDir');
  const playlistRootField = document.getElementById('playlist-root');
  if (lastDir && playlistRootField) {
    playlistRootField.value = lastDir;
    
    // Trigger input event to populate output field
    const event = new Event('input');
    playlistRootField.dispatchEvent(event);
  }
}

/**
 * Handle open JSON button click
 */
function handleOpenPlaylistJson() {
  const openBtn = document.getElementById('open-playlist-json');
  if (!openBtn) return;
  
  const outputFile = openBtn.getAttribute('data-output-file');
  if (!outputFile) {
    showToast('Error', 'No output file specified', 'error');
    return;
  }
  
  // Try to open the file using backend API
  fetch('/api/open-file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: outputFile })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    showToast('Success', 'Opening file...', 'success');
  })
  .catch(error => {
    console.error('Error opening file:', error);
    showToast('Error', `Could not open file: ${error.message}`, 'error');
    
    // Show path as fallback
    alert(`File path: ${outputFile}`);
  });
}

/**
 * Show playlist error and return to form
 * @param {string} error - Error message to display
 */
function showPlaylistError(error) {
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (!playlistProgressContainer || !playlistFormContainer) {
    console.error("Required containers not found");
    return;
  }
  
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
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    
    // Reset submit button
    const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
    if (playlistSubmitBtn) {
      playlistSubmitBtn.disabled = false;
      playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
    }
  }, 300);
}


/**
 * Process a status update from polling or Socket.IO
 * @param {Object} data - Task status data
 */
function processStatusUpdate(data) {
  if (!data || data.task_id !== window.currentTaskId) return;
  
  console.log('Status update:', data);
  
  // Update progress bar
  const playlistProgressBar = document.getElementById('playlist-progress-bar');
  if (playlistProgressBar && typeof data.progress === 'number') {
    // Use enhanced progress bar if available
    if (typeof enhancedProgressBar === 'function') {
      enhancedProgressBar(playlistProgressBar, data.progress);
    } else {
      // Fallback to simple update
      updateProgressBar(playlistProgressBar, data.progress);
    }
  }
  
  // Update status message
  const playlistProgressStatus = document.getElementById('playlist-progress-status');
  if (playlistProgressStatus) {
    const message = data.message || 
                   (data.status === 'completed' ? 'Download completed successfully!' : 
                   (data.status === 'failed' ? 'Download failed' : 
                   (data.status === 'cancelled' ? 'Download cancelled' : 'Processing...')));
    
    // Use enhanced status update if available
    if (typeof enhancedProgressStatus === 'function') {
      enhancedProgressStatus(playlistProgressStatus, message);
    } else {
      playlistProgressStatus.textContent = message;
    }
  }
  
  // Update statistics if available
  const playlistProgressStats = document.getElementById('playlist-progress-stats');
  if (playlistProgressStats && data.stats) {
    // Use enhanced stats update if available
    if (typeof enhancedPlaylistStats === 'function') {
      enhancedPlaylistStats(playlistProgressStats, data.stats);
    } else if (typeof updatePlaylistProgressStats === 'function') {
      updatePlaylistProgressStats(playlistProgressStats, data.stats);
    } else {
      // Fallback to simple stats update
      updateBasicProgressStats(playlistProgressStats, data.stats);
    }
  }
  
  // Handle task completion
  if (data.status === 'completed') {
    handleTaskCompleted(data);
  }
  
  // Handle task failure
  if (data.status === 'failed' || data.error) {
    handleTaskFailed(data);
  }
  
  // Handle task cancellation
  if (data.status === 'cancelled') {
    handleTaskCancelled();
  }
}

/**
 * Handle task completion
 * @param {Object} data - Task completion data
 */
function handleTaskCompleted(data) {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Get UI elements
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistResultsContainer = document.getElementById('playlist-results-container');
  const playlistStats = document.getElementById('playlist-stats');
  const openPlaylistJsonBtn = document.getElementById('open-playlist-json');
  
  if (!playlistProgressContainer || !playlistResultsContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    
    playlistResultsContainer.classList.remove('d-none');
    playlistResultsContainer.classList.add('fade-in');
    
    // Update stats
    if (playlistStats && data.stats) {
      if (typeof enhancedPlaylistStats === 'function') {
        enhancedPlaylistStats(playlistStats, data.stats, true);
      } else if (typeof updatePlaylistStats === 'function') {
        updatePlaylistStats(playlistStats, data.stats, data.output_file);
      } else {
        // Fallback to simple stats update
        updateBasicStats(playlistStats, data.stats, data.output_file);
      }
    }
    
    // Set output file for the Open JSON button
    if (openPlaylistJsonBtn && data.output_file) {
      openPlaylistJsonBtn.setAttribute('data-output-file', data.output_file);
    }
    
    setTimeout(() => {
      playlistResultsContainer.classList.remove('fade-in');
    }, 500);
    
    // Add task to history if function exists
    if (typeof addTaskToHistory === 'function') {
      addTaskToHistory('playlist', data.output_file, data.stats);
    }
    
    // Show success toast
    showToast('Success', 'Playlist download completed!', 'success');
    
    // Clear session storage
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
 * Handle task failure
 * @param {Object} data - Task failure data
 */
function handleTaskFailed(data) {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Show error
  showPlaylistError(data.error || 'Download failed');
}

/**
 * Handle task cancellation
 */
function handleTaskCancelled() {
  // Stop polling
  if (window.statusCheckInterval) {
    clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = null;
  }
  
  // Get UI elements
  const playlistProgressContainer = document.getElementById('playlist-progress-container');
  const playlistFormContainer = document.getElementById('playlist-form-container');
  
  if (!playlistProgressContainer || !playlistFormContainer) {
    console.error("Required containers not found");
    return;
  }
  
  // Add fade transitions
  playlistProgressContainer.classList.add('fade-out');
  
  setTimeout(() => {
    playlistProgressContainer.classList.add('d-none');
    playlistProgressContainer.classList.remove('fade-out');
    
    playlistFormContainer.classList.remove('d-none');
    playlistFormContainer.classList.add('fade-in');
    
    setTimeout(() => {
      playlistFormContainer.classList.remove('fade-in');
    }, 500);
    
    // Reset submit button
    const playlistSubmitBtn = document.getElementById('playlist-submit-btn');
    if (playlistSubmitBtn) {
      playlistSubmitBtn.disabled = false;
      playlistSubmitBtn.innerHTML = '<i class="fas fa-play me-2"></i>Download Playlists';
    }
    
    // Show toast
    showToast('Cancelled', 'Playlist download was cancelled', 'warning');
    
    // Clear session storage
    window.currentTaskId = null;
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
  }, 300);
}

/**
* Update basic progress statistics 
* @param {HTMLElement} statsElement - The element to update
* @param {Object} stats - The statistics object
*/
function updateBasicProgressStats(statsElement, stats) {
 if (!statsElement || !stats) return;
 
 let statsHtml = '<h6 class="mb-3">Current Statistics:</h6><ul class="list-group mb-3">';
 
 // Add available stats with consistent styling
 if (stats.playlists_total !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
   </li>`;
 }
 
 if (stats.playlists_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
   </li>`;
 }
 
 if (stats.total_videos !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
   </li>`;
 }
 
 if (stats.videos_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Videos Processed <span class="badge bg-success rounded-pill">${stats.videos_processed}</span>
   </li>`;
 }
 
 // Add any additional stats like empty/skipped playlists and duration
 if (stats.empty_playlists !== undefined && stats.empty_playlists > 0) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Empty Playlists <span class="badge bg-warning rounded-pill">${stats.empty_playlists}</span>
   </li>`;
 }
 
 if (stats.skipped_playlists !== undefined && stats.skipped_playlists > 0) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Skipped Playlists <span class="badge bg-secondary rounded-pill">${stats.skipped_playlists}</span>
   </li>`;
 }
 
 if (stats.duration_seconds !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
   </li>`;
 }
 
 statsHtml += '</ul>';
 statsElement.innerHTML = statsHtml;
}

/**
* Update the progress bar with proper styling
* @param {HTMLElement} barElement - The progress bar element
* @param {number} progress - The progress percentage (0-100)
*/
function updateProgressBar(barElement, progress) {
 if (!barElement) return;
 
 // Ensure progress is a number between 0-100
 const validProgress = Math.max(0, Math.min(100, Number(progress) || 0));
 
 // Update the progress bar
 barElement.style.width = `${validProgress}%`;
 barElement.setAttribute('aria-valuenow', validProgress);
 barElement.textContent = `${Math.round(validProgress)}%`;
 
 // Update styling based on progress
 barElement.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-success');
 
 if (validProgress >= 100) {
   barElement.classList.add('bg-success');
   barElement.classList.remove('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 75) {
   barElement.classList.add('bg-info');
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 50) {
   barElement.classList.add('bg-primary');
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else if (validProgress >= 25) {
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 } else {
   barElement.classList.add('progress-bar-striped', 'progress-bar-animated');
 }
}

/**
* Update final stats with details about the completed task
* @param {HTMLElement} statsElement - The stats element 
* @param {Object} stats - The statistics object
* @param {string} outputFile - The output file path
*/
function updateBasicStats(statsElement, stats, outputFile) {
 if (!statsElement) return;
 
 let statsHtml = '<h5>Processing Statistics:</h5><ul class="list-group mb-3">';
 
 // Add stats with consistent styling
 if (stats.playlists_total !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Playlists <span class="badge bg-primary rounded-pill">${stats.playlists_total}</span>
   </li>`;
 }
 
 if (stats.playlists_processed !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Processed Playlists <span class="badge bg-success rounded-pill">${stats.playlists_processed}</span>
   </li>`;
 }
 
 if (stats.total_videos !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
   </li>`;
 }
 
 if (stats.duration_seconds !== undefined) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Duration <span class="badge bg-dark rounded-pill">${formatDuration(stats.duration_seconds)}</span>
   </li>`;
 }
 
 if (stats.download_directory || stats.root_directory) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Download Directory <span class="text-muted small">${stats.download_directory || stats.root_directory}</span>
   </li>`;
 }
 
 if (outputFile) {
   statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
     Output File <span class="text-muted small">${outputFile}</span>
   </li>`;
 }
 
 statsHtml += '</ul>';
 
 // Add nice-looking JSON viewer if function exists
 if (typeof addJsonView === 'function' && outputFile) {
   statsHtml += addJsonView(stats, outputFile);
 }
 
 statsElement.innerHTML = statsHtml;
}

/**
* Add CSS styles to fix the progress bar display
*/
function addProgressBarStyles() {
 // Check if styles are already added
 if (document.getElementById('custom-progress-styles')) {
   return;
 }
 
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
   
   /* Added transition for smoother progress updates */
   .progress-bar {
     transition: width 0.4s ease-in-out;
   }
   
   /* Fade transitions for containers */
   .fade-in {
     animation: fadeIn 0.3s ease-in-out;
   }
   
   .fade-out {
     animation: fadeOut 0.3s ease-in-out;
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
 
 // Add to the document
 document.head.appendChild(style);
 console.log("Progress bar styles added");
}

/**
* Debounce function to limit the frequency of events
* @param {Function} func - The function to debounce
* @param {number} wait - The time to wait between calls (ms)
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
* Enhanced progress bar update with smooth animations
* @param {HTMLElement} barElement - The progress bar element
* @param {number} targetPercent - The target percentage (0-100)
* @param {boolean} animated - Whether to animate the transition
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
 * Fix for the initializeThemes error - provide a dummy function if it doesn't exist
 */
function ensureGlobalFunctions() {
 
  // Add showToast fallback if it doesn't exist
  if (typeof window.showToast !== 'function') {
    window.showToast = function(title, message, type) {
      console.log(`Toast (${type}): ${title} - ${message}`);
      showToastMessage(title, message, type);
    };
  }
}
/**
 * DOM ready handler that initializes everything safely
 */
document.addEventListener('DOMContentLoaded', function() {
  // Ensure global functions exist
  ensureGlobalFunctions();
  
  // Initialize the playlist functionality after a short delay
  setTimeout(() => {
    initializeSocketConnection();
    initializePlaylistFeature();
    
    // Add direct form handler just to be safe
    const playlistForm = document.getElementById('playlist-form');
    if (playlistForm) {
      // Use onsubmit property as a fallback (works in more browsers)
      playlistForm.onsubmit = function(e) {
        e.preventDefault();
        handlePlaylistSubmit(e);
        return false;
      };
    }
  }, 500);
});

/**
 * Process and normalize stats data to ensure consistent format
 * @param {Object} stats - The original stats object
 * @returns {Object} - Normalized stats object with all required fields
 */
function processStatsData(stats) {
  // Ensure we have a stats object to work with
  if (!stats || typeof stats !== 'object') {
    console.warn("Invalid stats object provided:", stats);
    return {
      total_playlists: 1,
      processed_playlists: 1,
      empty_playlists: 0,
      skipped_playlists: 0,
      total_videos: 0,
      processed_videos: 0,
      total_files: 0,
      processed_files: 0,
      skipped_files: 0,
      error_files: 0,
      total_chunks: 0,
      total_bytes: 0,
      duration_seconds: 0
    };
  }
  
  // If stats is a string, try to parse it
  if (typeof stats === 'string') {
    try {
      stats = JSON.parse(stats);
    } catch (e) {
      console.warn("Could not parse stats string:", e);
      return this.processStatsData({}); // Return default stats
    }
  }
  
  // Create normalized stats with defaults for missing fields
  return {
    total_playlists: stats.playlists_total || stats.total_playlists || 1,
    processed_playlists: stats.completed_playlists || stats.playlists_processed || stats.processed_playlists || 1,
    empty_playlists: stats.empty_playlists || 0,
    skipped_playlists: stats.skipped_playlists || 0,
    total_videos: stats.total_videos || stats.videos_total || 0,
    processed_videos: stats.videos_processed || stats.processed_videos || 0,
    total_files: stats.total_files || 0,
    processed_files: stats.processed_files || 0,
    skipped_files: stats.skipped_files || 0,
    error_files: stats.error_files || 0,
    total_chunks: stats.total_chunks || 0,
    total_bytes: stats.total_bytes || 0,
    duration_seconds: stats.duration_seconds || stats.total_duration_seconds || 0,
    download_directory: stats.download_directory || "",
    total_processing_time: stats.total_processing_time || stats.processing_time || stats.execution_time_seconds || 0,
    status: stats.status || "completed",
    completed_at: stats.completed_at || stats.timestamp || "",
    failed_playlists: stats.failed_playlists || 0,
    // Additional fields for detailed stats
    success_rate: calculateSuccessRate(stats),
    video_download_rate: calculateVideoRate(stats),
    average_file_size: calculateAverageFileSize(stats)
  };
}

/**
 * Calculate success rate from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Success rate percentage
 */
function calculateSuccessRate(stats) {
  const total = (stats.total_playlists || stats.playlists_total || 1);
  const processed = (stats.processed_playlists || stats.completed_playlists || stats.playlists_processed || 0);
  return Math.round((processed / total) * 100);
}

/**
 * Calculate video download rate from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Video download rate percentage
 */
function calculateVideoRate(stats) {
  const total = (stats.total_videos || stats.videos_total || 1);
  const processed = (stats.processed_videos || stats.videos_processed || 0);
  return Math.round((processed / total) * 100);
}

/**
 * Calculate average file size from stats
 * @param {Object} stats - Stats object
 * @returns {number} - Average file size in bytes
 */
function calculateAverageFileSize(stats) {
  const totalBytes = stats.total_bytes || 0;
  const totalFiles = stats.processed_files || stats.total_files || 1;
  return totalBytes > 0 ? Math.round(totalBytes / totalFiles) : 0;
}


/**
 * Update progress display based on status data
 * @param {Object} data - Status data from server
 */
function updatePlaylistProgress(data) {
  if (!data) return;
  
  // Get UI elements with direct DOM access
  const progressBar = document.getElementById('playlist-progress-bar');
  const progressStatus = document.getElementById('playlist-progress-status');
  const progressStats = document.getElementById('playlist-progress-stats');
  
  // Update progress bar
  if (progressBar && typeof data.progress === 'number') {
    const progress = Math.min(100, Math.max(0, data.progress));
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', progress);
    progressBar.textContent = `${Math.round(progress)}%`;
    
    // Update styling
    if (progress >= 100) {
      progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.add('bg-success');
    } else {
      progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      progressBar.classList.remove('bg-success');
    }
  }
  
  // Update status message
  if (progressStatus) {
    progressStatus.textContent = data.message || 'Processing...';
  }
  
  // Update stats
  if (progressStats && data.stats) {
    updateProgressStats(progressStats, data.stats);
  }
  
  // Handle completion
  if (data.status === 'completed') {
    handleTaskCompleted(data);
  } else if (data.status === 'failed' || data.error) {
    handleTaskFailed(data);
  } else if (data.status === 'cancelled') {
    handleTaskCancelled();
  }
}
/**
 * Update progress statistics display
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Stats data object
 */
function updateProgressStats(element, stats) {
  if (!element || !stats) return;
  
  let html = '<ul class="list-group">';
  
  if (stats.total_playlists !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Playlists <span class="badge bg-primary rounded-pill">${stats.total_playlists}</span>
    </li>`;
  }
  
  if (stats.processed_playlists !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Processed Playlists <span class="badge bg-success rounded-pill">${stats.processed_playlists}</span>
    </li>`;
  }
  
  if (stats.total_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Total Videos <span class="badge bg-info rounded-pill">${stats.total_videos}</span>
    </li>`;
  }
  
  if (stats.processed_videos !== undefined) {
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      Videos Processed <span class="badge bg-success rounded-pill">${stats.processed_videos}</span>
    </li>`;
  }
  
  html += '</ul>';
  element.innerHTML = html;
}

/**
 * Show toast message with fallbacks
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} type - Toast type (info, success, warning, error)
 */
function showToastMessage(title, message, type) {
  try {
    // Try using main showToast function if it exists
    if (typeof showToast === 'function') {
      showToast(title, message, type);
      return;
    }
    
    // Bootstrap toast fallback
    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
      }
      
      // Create toast element
      const toastEl = document.createElement('div');
      toastEl.className = `toast bg-${type === 'error' ? 'danger' : type} text-white`;
      toastEl.setAttribute('role', 'alert');
      toastEl.setAttribute('aria-live', 'assertive');
      toastEl.setAttribute('aria-atomic', 'true');
      
      toastEl.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">${message}</div>
      `;
      
      toastContainer.appendChild(toastEl);
      
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        toastEl.remove();
      }, 5000);
      
      return;
    }
    
    // Simple alert fallback
    alert(`${title}: ${message}`);
  } catch (e) {
    console.error("Error showing toast:", e);
    alert(`${title}: ${message}`);
  }
}
/**
 * Show result UI
 * @param {Object} data - Result data
 */
function showResult(data) {
  try {
    console.log("Showing enhanced result UI with data:", data);
    
    // Get UI containers
    const progressContainer = document.getElementById('playlist-progress-container');
    const resultsContainer = document.getElementById('playlist-results-container');
    const resultStats = document.getElementById('playlist-result-stats');
    
    // Update UI state - use a state object if available, otherwise skip
    if (typeof state !== 'undefined') {
      state.uiState = state.uiState || {};
      state.uiState.isFormShown = false;
      state.uiState.isResultShown = true;
      state.uiState.isErrorShown = false;
      state.uiState.isCancelledShown = false;
    }
    
    // Use UI module for smooth transition if available
    if (typeof ui !== 'undefined' && typeof ui.transitionBetweenElements === 'function') {
      ui.transitionBetweenElements(progressContainer, resultsContainer);
    } else {
      // Fallback to simple visibility toggle
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsContainer) resultsContainer.style.display = 'block';
    }
    
    // Update the output path button
    const openBtn = document.getElementById('open-playlist-json');
    if (openBtn && data.output_file) {
      openBtn.setAttribute('data-output-file', data.output_file);
      
      // Make button visible
      openBtn.classList.remove('d-none');
      openBtn.style.display = 'inline-block';
    }
    
    // Update stats display with enhanced visualization
    if (resultStats) {
      updateDetailedResultStats(resultStats, data.stats, data.output_file);
    }
    
    // Show toast notification
    showToast('Download Complete', 'Your playlists have been processed successfully', 'success');
    
    // Emit completion event if registry available
    if (typeof eventRegistry !== 'undefined' && typeof eventRegistry.emit === 'function') {
      eventRegistry.emit('playlist.results.shown', data);
    }
  } catch (error) {
    console.error("Error showing result UI:", error);
    
    // Try fallback display
    try {
      const resultsContainer = document.getElementById('playlist-results-container');
      const progressContainer = document.getElementById('playlist-progress-container');
      
      if (progressContainer) progressContainer.style.display = 'none';
      if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = `
          <div class="alert alert-success">
            <h4>Download Complete</h4>
            <p>Your playlist has been processed successfully.</p>
            ${data.output_file ? `<p>Output saved to: ${data.output_file}</p>` : ''}
          </div>
          <div class="mt-3">
            <button class="btn btn-primary" onclick="handleNewPlaylistTask()">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
        `;
      }
    } catch (fallbackError) {
      console.error("Error with fallback result display:", fallbackError);
    }
  }
}

/**
 * Update result statistics display with enhanced detailed stats
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 * @param {string} outputFile - Output file path
 */
function updateDetailedResultStats(element, stats, outputFile) {
  try {
    if (!element) return;
    
    // Process stats to ensure all values are present
    stats = processStatsData(stats);
    
    // Calculate percentages for progress bars
    const playlistCompletionPercent = stats.total_playlists > 0 
      ? Math.round((stats.processed_playlists / stats.total_playlists) * 100) 
      : 0;
    
    const videoCompletionPercent = stats.total_videos > 0 
      ? Math.round((stats.processed_videos / stats.total_videos) * 100) 
      : 0;
    
    // Format the timestamp if available
    let formattedTimestamp = '';
    if (stats.completed_at) {
      const date = new Date(stats.completed_at);
      formattedTimestamp = isNaN(date.getTime()) 
        ? stats.completed_at 
        : date.toLocaleString();
    }
    
    // Create a formatted display of the stats with enhanced visuals and animations
    let statsHtml = `
      <div class="stats-container animate__animated animate__fadeIn">
        <!-- Summary section with completion status -->
        <div class="summary-section mb-4 p-3 rounded d-flex align-items-center">
          <div class="success-icon-container me-3">
            <div class="success-icon-circle">
              <i class="fas fa-check text-success fa-lg"></i>
            </div>
          </div>
          <div class="flex-grow-1">
            <h5 class="mb-1">Download Complete</h5>
            <p class="mb-0 text-muted">All tasks completed in ${formatDuration(stats.total_processing_time)}</p>
          </div>
          <div class="time-badge">
            <i class="fas fa-clock"></i>
            ${formatDuration(stats.duration_seconds)} content
          </div>
        </div>
        
        <!-- Output file info with copy button -->
        ${outputFile ? `
          <div class="file-info-card mb-4 p-3 rounded position-relative">
            <div class="d-flex align-items-center">
              <div class="file-icon-container me-3">
                <i class="fas fa-file-alt text-primary fa-2x"></i>
              </div>
              <div class="file-details flex-grow-1">
                <label class="text-muted small mb-1">Output File</label>
                <div class="file-path text-truncate">${outputFile}</div>
              </div>
              <div class="file-actions">
                <button class="btn btn-sm btn-outline-primary copy-path-btn" 
                        data-path="${outputFile}" title="Copy path to clipboard"
                        onclick="copyToClipboard('${outputFile}')">
                  <i class="fas fa-copy"></i> Copy
                </button>
                <button class="btn btn-sm btn-outline-secondary ms-2 open-folder-btn" 
                        data-path="${outputFile}" title="Open containing folder"
                        onclick="openFileOrFolder('${outputFile}')">
                  <i class="fas fa-folder-open"></i>
                </button>
              </div>
            </div>
          </div>
        ` : ''}
        
        <!-- Main Stats Cards with visual progress indicators -->
        <div class="row g-3 mb-4">
          <!-- Playlists Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-list icon-primary me-2"></i>
                    <h6 class="mb-0">Playlists</h6>
                  </div>
                </div>
                <div class="stat-badge ${stats.failed_playlists > 0 ? 'bg-warning' : 'bg-success'}">
                  ${playlistCompletionPercent}% Complete
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${stats.processed_playlists}</div>
                <div class="text-muted ms-2">/ ${stats.total_playlists} processed</div>
              </div>
              
              <div class="progress stat-progress mb-2">
                <div class="progress-bar ${stats.failed_playlists > 0 ? 'bg-warning' : 'bg-success'}" 
                     role="progressbar" 
                     style="width: ${playlistCompletionPercent}%" 
                     aria-valuenow="${playlistCompletionPercent}" 
                     aria-valuemin="0" 
                     aria-valuemax="100"></div>
              </div>
              
              <div class="stat-details">
                ${stats.empty_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <span>${stats.empty_playlists} empty playlists</span>
                  </div>` : ''}
                
                ${stats.failed_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-times-circle text-danger"></i>
                    <span>${stats.failed_playlists} failed playlists</span>
                  </div>` : ''}
                
                ${stats.skipped_playlists > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-forward text-secondary"></i>
                    <span>${stats.skipped_playlists} skipped playlists</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
          
<!-- Videos Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-video icon-info me-2"></i>
                    <h6 class="mb-0">Videos</h6>
                  </div>
                </div>
                <div class="stat-badge bg-info">
                  ${videoCompletionPercent}% Complete
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${stats.processed_videos}</div>
                <div class="text-muted ms-2">/ ${stats.total_videos} downloaded</div>
              </div>
              
              <div class="progress stat-progress mb-2">
                <div class="progress-bar bg-info" 
                     role="progressbar" 
                     style="width: ${videoCompletionPercent}%" 
                     aria-valuenow="${videoCompletionPercent}" 
                     aria-valuemin="0" 
                     aria-valuemax="100"></div>
              </div>
              
              <div class="stat-details">
                ${stats.download_directory ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-folder text-primary"></i>
                    <span class="text-truncate" title="${stats.download_directory}">${stats.download_directory}</span>
                  </div>` : ''}
                  
                ${stats.total_bytes > 0 ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-database text-secondary"></i>
                    <span>Total size: ${formatBytes(stats.total_bytes)}</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
          
          <!-- Time Stats Card -->
          <div class="col-md-4">
            <div class="stat-card h-100">
              <div class="d-flex justify-content-between mb-2">
                <div class="stat-title">
                  <div class="d-flex align-items-center">
                    <i class="fas fa-clock icon-success me-2"></i>
                    <h6 class="mb-0">Duration</h6>
                  </div>
                </div>
                <div class="stat-badge bg-secondary">
                  <i class="fas fa-check-circle me-1"></i> Completed
                </div>
              </div>
              
              <div class="stat-numbers d-flex align-items-end mb-3">
                <div class="value">${formatDuration(stats.total_processing_time)}</div>
              </div>
              
              <div class="time-stats mb-2">
                <div class="d-flex justify-content-between align-items-center">
                  <div class="time-label">Processing Time</div>
                  <div class="time-value">${formatDuration(stats.total_processing_time)}</div>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <div class="time-label">Content Duration</div>
                  <div class="time-value">${formatDuration(stats.duration_seconds)}</div>
                </div>
              </div>
              
              <div class="stat-details">
                ${formattedTimestamp ? 
                  `<div class="stat-detail-item">
                    <i class="fas fa-calendar-check text-secondary"></i>
                    <span>Completed: ${formattedTimestamp}</span>
                  </div>` : ''}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Expandable Details Section -->
        <div class="details-expandable mb-4">
          <div class="details-header p-3 rounded d-flex justify-content-between align-items-center" 
               data-bs-toggle="collapse" 
               data-bs-target="#detailed-stats" 
               role="button" 
               aria-expanded="false" 
               aria-controls="detailed-stats">
            <h6 class="mb-0"><i class="fas fa-info-circle me-2"></i>Additional Information</h6>
            <i class="fas fa-chevron-down"></i>
          </div>
          <div class="collapse" id="detailed-stats">
            <div class="details-content p-3 rounded">
              <div class="row g-3">
                <!-- Left column - Processing stats -->
                <div class="col-md-6">
                  <h6 class="details-subtitle mb-2">Processing Statistics</h6>
                  <ul class="list-group stats-list">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-check-circle text-success me-2"></i>Processed Playlists</span>
                      <span class="badge bg-success rounded-pill">${stats.processed_playlists}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-exclamation-circle text-warning me-2"></i>Empty Playlists</span>
                      <span class="badge bg-warning rounded-pill">${stats.empty_playlists}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-times-circle text-danger me-2"></i>Failed Playlists</span>
                      <span class="badge bg-danger rounded-pill">${stats.failed_playlists}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-step-forward text-secondary me-2"></i>Skipped Playlists</span>
                      <span class="badge bg-secondary rounded-pill">${stats.skipped_playlists}</span>
                    </li>
                  </ul>
                </div>
                
                <!-- Right column - File stats -->
                <div class="col-md-6">
                  <h6 class="details-subtitle mb-2">File Statistics</h6>
                  <ul class="list-group stats-list">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-file text-primary me-2"></i>Total Files</span>
                      <span class="badge bg-primary rounded-pill">${stats.total_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-check-circle text-success me-2"></i>Processed Files</span>
                      <span class="badge bg-success rounded-pill">${stats.processed_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-times-circle text-danger me-2"></i>Error Files</span>
                      <span class="badge bg-danger rounded-pill">${stats.error_files}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <span><i class="fas fa-database text-info me-2"></i>Total Size</span>
                      <span class="badge bg-info rounded-pill">${formatBytes(stats.total_bytes)}</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <!-- Detailed Stats Section -->
              <div class="mt-4">
                <h6 class="details-subtitle mb-3">Detailed Performance Metrics</h6>
                <div class="row g-3">
                  <!-- Efficiency Metrics -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-tachometer-alt fa-2x text-primary"></i>
                      </div>
                      <div class="metric-value h4 mb-1">${stats.average_file_size > 0 ? formatBytes(stats.average_file_size) : 'N/A'}</div>
                      <div class="metric-label small text-muted">Average File Size</div>
                    </div>
                  </div>
                  
                  <!-- Success Rate -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-chart-pie fa-2x text-success"></i>
                      </div>
                      <div class="metric-value h4 mb-1">${stats.success_rate}%</div>
                      <div class="metric-label small text-muted">Success Rate</div>
                    </div>
                  </div>
                  
                  <!-- Processing Speed -->
                  <div class="col-md-4">
                    <div class="metric-card p-3 border rounded text-center">
                      <div class="metric-icon mb-2">
                        <i class="fas fa-bolt fa-2x text-warning"></i>
                      </div>
                      <div class="metric-value h4 mb-1">
                        ${stats.total_processing_time > 0 && stats.processed_videos > 0 ? 
                          (stats.processed_videos / (stats.total_processing_time / 60)).toFixed(2) : 'N/A'}
                      </div>
                      <div class="metric-label small text-muted">Videos Per Minute</div>
                    </div>
                  </div>
                </div>
                
                <!-- Additional Technical Details -->
                <div class="technical-details mt-4 small">
                  <h6 class="details-subtitle mb-2">Technical Details</h6>
                  <table class="table table-sm table-bordered">
                    <tbody>
                      <tr>
                        <td class="text-muted fw-bold">Total Chunks</td>
                        <td>${stats.total_chunks || 'N/A'}</td>
                        <td class="text-muted fw-bold">Processed Files</td>
                        <td>${stats.processed_files || 0}</td>
                      </tr>
                      <tr>
                        <td class="text-muted fw-bold">Status</td>
                        <td><span class="badge bg-success">${stats.status || 'completed'}</span></td>
                        <td class="text-muted fw-bold">Completion Time</td>
                        <td>${formattedTimestamp || 'Not recorded'}</td>
                      </tr>
                      <tr>
                        <td class="text-muted fw-bold">Total Size</td>
                        <td>${formatBytes(stats.total_bytes || 0)}</td>
                        <td class="text-muted fw-bold">Content Duration</td>
                        <td>${formatDuration(stats.duration_seconds || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Action Buttons with hover effects -->
        <div class="action-buttons d-flex justify-content-between flex-wrap">
          <div class="mb-2">
            <button id="playlist-new-task-btn" class="btn btn-primary btn-lg action-btn">
              <i class="fas fa-plus me-2"></i>New Task
            </button>
          </div>
          <div class="mb-2">
            <button id="open-playlist-json" class="btn btn-success btn-lg action-btn" data-output-file="${outputFile || ''}">
              <i class="fas fa-file-alt me-2"></i>Open Result File
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Update the element with the new HTML
    element.innerHTML = statsHtml;
    
    // Initialize bootstrap collapse elements if Bootstrap is available
    if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
      const collapseElements = element.querySelectorAll('[data-bs-toggle="collapse"]');
      collapseElements.forEach(collapseEl => {
        collapseEl.addEventListener('click', function() {
          const icon = this.querySelector('.fas.fa-chevron-down, .fas.fa-chevron-up');
          if (icon) {
            icon.classList.toggle('fa-chevron-up');
            icon.classList.toggle('fa-chevron-down');
          }
        });
      });
    } else {
      // Fallback for manual collapse functionality
      const toggleElements = element.querySelectorAll('[data-bs-toggle="collapse"]');
      toggleElements.forEach(toggleEl => {
        toggleEl.addEventListener('click', function() {
          const targetSelector = this.getAttribute('data-bs-target');
          const targetElement = document.querySelector(targetSelector);
          if (targetElement) {
            targetElement.classList.toggle('show');
            
            // Toggle icon
            const icon = this.querySelector('.fas.fa-chevron-down, .fas.fa-chevron-up');
            if (icon) {
              icon.classList.toggle('fa-chevron-up');
              icon.classList.toggle('fa-chevron-down');
            }
          }
        });
      });
    }
    
    // Add event handlers for buttons
    const newTaskBtn = element.querySelector('#playlist-new-task-btn');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', handleNewPlaylistTask);
    }
    
    const openBtn = element.querySelector('#open-playlist-json');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const outputFile = openBtn.getAttribute('data-output-file');
        if (outputFile) {
          openFileOrFolder(outputFile);
        }
      });
    }
    
    // Add event handler for folder open button
    const openFolderBtn = element.querySelector('.open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const path = openFolderBtn.getAttribute('data-path');
        if (path) {
          openFileOrFolder(path);
        }
      });
    }
    
    // Initialize tooltips if Bootstrap's tooltip JS is available
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(element.querySelectorAll('[title]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
    }
    
    // Add custom styles if needed
    addStatsStyles();
    
  } catch (error) {
    console.error("Error updating result stats:", error);
    
    // Provide a simple fallback
    if (element) {
      element.innerHTML = `
        <div class="alert alert-info">
          <h5>Download Complete</h5>
          <p>Your playlists have been successfully processed.</p>
          ${outputFile ? `<p>Output saved to: ${outputFile}</p>` : ''}
          <button id="playlist-new-task-fallback" class="btn btn-primary mt-2">
            <i class="fas fa-plus me-2"></i>New Task
          </button>
        </div>
      `;
      
      // Add event handler to the fallback button
      const fallbackBtn = element.querySelector('#playlist-new-task-fallback');
      if (fallbackBtn) {
        fallbackBtn.addEventListener('click', handleNewPlaylistTask);
      }
    }
  }
}

/**
 * Add custom styles for the enhanced stats view
 */
function addStatsStyles() {
  // Check if styles already exist
  if (document.getElementById('enhanced-stats-styles')) {
    return;
  }
  
  // Create style element
  const style = document.createElement('style');
  style.id = 'enhanced-stats-styles';
  
  // Add styles
  style.innerHTML = `
    /* Enhanced Stats UI Styles */
    .stats-container {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    
    /* Dark theme support */
    [data-theme="dark"] .stats-container {
      background-color: #2b3035;
      color: #e9ecef;
    }
    
    .summary-section {
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 1px 6px rgba(0,0,0,0.03);
    }
    
    [data-theme="dark"] .summary-section {
      background-color: #343a40;
      color: #e9ecef;
    }
    
    .success-icon-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background-color: rgba(25, 135, 84, 0.1);
    }
    
    .time-badge {
      background-color: #6c757d;
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.875rem;
    }
    
    .file-info-card {
      background-color: #ffffff;
      border: 1px solid rgba(0,0,0,0.08);
    }
    
    [data-theme="dark"] .file-info-card {
      background-color: #343a40;
      border-color: rgba(255,255,255,0.08);
    }
    
    .stat-card {
      background-color: #ffffff;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    [data-theme="dark"] .stat-card {
      background-color: #343a40;
      color: #e9ecef;
      border: 1px solid rgba(255,255,255,0.05);
    }
    
    .stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 5px 15px rgba(0,0,0,0.08);
    }
    
    .stat-numbers .value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
    }
    
    .stat-badge {
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 12px;
    }
    
    .stat-progress {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .stat-detail-item {
      font-size: 0.875rem;
      margin-top: 8px;
      display: flex;
      align-items: center;
    }
    
    .stat-detail-item i {
      margin-right: 6px;
      width: 16px;
      text-align: center;
    }
    
    .details-expandable .details-header {
      background-color: #f1f3f5;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    [data-theme="dark"] .details-expandable .details-header {
      background-color: #3e444a;
    }
    
    .details-expandable .details-header:hover {
      background-color: #e9ecef;
    }
    
    [data-theme="dark"] .details-expandable .details-header:hover {
      background-color: #495057;
    }
    
    .details-expandable .details-content {
      background-color: #ffffff;
      border: 1px solid #e9ecef;
      border-top: none;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }
    
    [data-theme="dark"] .details-expandable .details-content {
      background-color: #343a40;
      border-color: #495057;
    }
    
    .details-subtitle {
      color: #6c757d;
      font-weight: 600;
    }
    
    .metric-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
    }
    
    .technical-details table {
      font-size: 0.875rem;
    }
    
    .action-buttons .action-btn {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .action-buttons .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    /* Animation classes */
    .animate__animated {
      animation-duration: 0.5s;
    }
    
    .animate__fadeIn {
      animation-name: fadeIn;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  
  // Add to document
  document.head.appendChild(style);
}

/**
 * Copy text to clipboard with feedback
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
  // Check for modern clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Copied', 'Path copied to clipboard', 'success');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        showToast('Error', 'Failed to copy to clipboard', 'error');
        
        // Fallback
        copyToClipboardFallback(text);
      });
  } else {
    // Fallback for older browsers
    copyToClipboardFallback(text);
  }
}

/**
 * Fallback method for clipboard copying
 * @param {string} text - Text to copy
 */
function copyToClipboardFallback(text) {
  try {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';  // Prevent scrolling to bottom in some browsers
    document.body.appendChild(textarea);
    textarea.select();
    
    // Try to copy
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      showToast('Copied', 'Path copied to clipboard', 'success');
    } else {
      showToast('Error', 'Copy failed. Please copy the path manually.', 'error');
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showToast('Error', 'Failed to copy to clipboard', 'error');
  }
}

/**
 * Open file or folder
 * @param {string} path - Path to open
 */
function openFileOrFolder(path) {
  if (!path) {
    console.warn("No path specified to open");
    return;
  }
  
  try {
    // Try using API to open file
    fetch('/api/open-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: path })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast('Success', 'Opening file...', 'success');
      } else {
        console.warn("Could not open file:", data.message);
        showToast('Error', `Could not open file: ${data.message}`, 'warning');
        
        // Show path as fallback
        alert(`File is located at: ${path}`);
      }
    })
    .catch(error => {
      console.error("Error opening file:", error);
      showToast('Error', `Could not open file: ${error.message}`, 'error');
      
      // Show path as fallback
      alert(`File is located at: ${path}`);
    });
  } catch (error) {
    console.error("Error opening file/folder:", error);
    showToast('Error', `Could not open: ${path}`, 'error');
    
    // Show path as fallback
    alert(`File is located at: ${path}`);
  }
}

/**
 * Update the result stats (legacy method that calls the new implementation)
 * Maintains compatibility with existing code
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 * @param {string} outputFile - Output file path
 */
function updateResultStats(element, stats, outputFile) {
  // Call the new detailed stats implementation
  updateDetailedResultStats(element, stats, outputFile);
}


//==========================================
// SECTION 18 - Enhancements 
// =========================================



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
  // DISABLED - Using unified handler instead
  // socket.on('progress_update', function(data) {
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

// ============================================================================
// ENHANCED FRONTEND STATS SHOWCASE SYSTEM
// ============================================================================
// Frontend components to display comprehensive task completion statistics

// ----------------------------------------------------------------------------
// Stats Display Management
// ----------------------------------------------------------------------------

/**
 * Enhanced task completion handler with stats showcase
 */
function handleTaskCompletion(taskType, data) {
    console.log(`Handling completion for task type: ${taskType}`, data);
    
    // Stop any active polling
    if (typeof stopStatusPolling === 'function') {
        stopStatusPolling();
    }
    
    // Update UI to show completion
    updateUIForCompletion(taskType);
    
    // Show comprehensive stats if available
    if (data.stats) {
        displayTaskStats(data);
    } else {
        displayBasicCompletion(data);
    }
    
    // Add to task history
    addTaskToHistory(taskType, data.output_file, data.stats);
    
    // Clear task state
    clearTaskState();
    
    console.log('Task completion handling completed');
}

/**
 * Display comprehensive task statistics in a modal or dedicated section
 */
function displayTaskStats(completionData) {
    const { task_id, task_type, stats, summary, insights } = completionData;
    
    try {
        // Create or update stats display modal
        createStatsModal(task_id, task_type, stats, summary, insights);
        
        // Show the modal
        showStatsModal();
        
        // Update summary cards if they exist
        updateStatsSummaryCards(stats, summary);
        
        // Show stats showcase toast
        showStatsToast(summary);
        
    } catch (error) {
        console.error('Error displaying task stats:', error);
        displayBasicCompletion(completionData);
    }
}

/**
 * Create comprehensive stats modal
 */
function createStatsModal(taskId, taskType, stats, summary, insights) {
    // Remove existing modal if present
    const existingModal = document.getElementById('taskStatsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal HTML
    const modalHTML = `
        <div class="modal fade" id="taskStatsModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-chart-line me-2"></i>
                            Task Completion Statistics
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${generateStatsContent(taskId, taskType, stats, summary, insights)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" onclick="exportTaskStats('${taskId}')">
                            <i class="fas fa-download me-2"></i>Export Stats
                        </button>
                        <button type="button" class="btn btn-info" onclick="viewTaskHistory()">
                            <i class="fas fa-history me-2"></i>View History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize any charts or interactive elements
    initializeStatsCharts(stats);
}

/**
 * Generate comprehensive stats content HTML
 */
function generateStatsContent(taskId, taskType, stats, summary, insights) {
    return `
        <div class="container-fluid">
            <!-- Summary Section -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="alert alert-success">
                        <h6 class="alert-heading mb-2">
                            <i class="fas fa-trophy me-2"></i>${summary?.headline || 'Task Completed Successfully'}
                        </h6>
                        <p class="mb-0">${getCompletionMessage(stats, taskType)}</p>
                    </div>
                </div>
            </div>
            
            <!-- Key Metrics Cards -->
            <div class="row mb-4">
                ${generateMetricsCards(stats, summary)}
            </div>
            
            <!-- Detailed Analytics Tabs -->
            <div class="row">
                <div class="col-12">
                    <ul class="nav nav-tabs" id="statsTab" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="overview-tab" data-bs-toggle="tab" 
                                    data-bs-target="#overview" type="button" role="tab">
                                <i class="fas fa-chart-pie me-2"></i>Overview
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="performance-tab" data-bs-toggle="tab" 
                                    data-bs-target="#performance" type="button" role="tab">
                                <i class="fas fa-tachometer-alt me-2"></i>Performance
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="files-tab" data-bs-toggle="tab" 
                                    data-bs-target="#files" type="button" role="tab">
                                <i class="fas fa-file-alt me-2"></i>File Analysis
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="insights-tab" data-bs-toggle="tab" 
                                    data-bs-target="#insights" type="button" role="tab">
                                <i class="fas fa-lightbulb me-2"></i>Insights
                            </button>
                        </li>
                    </ul>
                    
                    <div class="tab-content mt-3" id="statsTabContent">
                        <div class="tab-pane fade show active" id="overview" role="tabpanel">
                            ${generateOverviewTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="performance" role="tabpanel">
                            ${generatePerformanceTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="files" role="tabpanel">
                            ${generateFilesTab(stats)}
                        </div>
                        <div class="tab-pane fade" id="insights" role="tabpanel">
                            ${generateInsightsTab(insights, summary)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate key metrics cards
 */
function generateMetricsCards(stats, summary) {
    const metrics = summary?.key_metrics || {};
    const completionMetrics = stats?.completion_metrics || {};
    const efficiencyMetrics = stats?.efficiency_metrics || {};
    
    return `
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-primary mb-2">
                        <i class="fas fa-files"></i>
                    </div>
                    <h6 class="card-title">Files Processed</h6>
                    <h4 class="text-primary">${metrics.files_processed || 0}</h4>
                    <small class="text-muted">Total files handled</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-success mb-2">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <h6 class="card-title">Success Rate</h6>
                    <h4 class="text-success">${metrics.success_rate || '0%'}</h4>
                    <small class="text-muted">Completion percentage</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-info mb-2">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h6 class="card-title">Duration</h6>
                    <h4 class="text-info">${metrics.duration || 'N/A'}</h4>
                    <small class="text-muted">Processing time</small>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center h-100">
                <div class="card-body">
                    <div class="display-6 text-warning mb-2">
                        <i class="fas fa-award"></i>
                    </div>
                    <h6 class="card-title">Efficiency Grade</h6>
                    <h4 class="text-warning">${metrics.efficiency_grade || 'N/A'}</h4>
                    <small class="text-muted">Performance rating</small>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate overview tab content
 */
function generateOverviewTab(stats) {
    const completionMetrics = stats?.completion_metrics || {};
    const qualityIndicators = stats?.quality_indicators || {};
    
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-chart-bar me-2"></i>Processing Summary</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <td><strong>Total Files:</strong></td>
                                <td>${stats?.total_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Successfully Processed:</strong></td>
                                <td class="text-success">${stats?.processed_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Errors:</strong></td>
                                <td class="text-danger">${stats?.error_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Skipped:</strong></td>
                                <td class="text-warning">${stats?.skipped_files || 0}</td>
                            </tr>
                            <tr>
                                <td><strong>Total Data Processed:</strong></td>
                                <td>${formatBytes(stats?.total_bytes || 0)}</td>
                            </tr>
                            <tr>
                                <td><strong>Processing Rate:</strong></td>
                                <td>${completionMetrics.processing_speed || 0} files/sec</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="col-md-6">
                <h6><i class="fas fa-shield-alt me-2"></i>Quality Metrics</h6>
                <div class="mb-3">
                    <label class="form-label">Quality Score</label>
                    <div class="progress mb-2">
                        <div class="progress-bar bg-success" role="progressbar" 
                             style="width: ${qualityIndicators.quality_score || 0}%">
                            ${qualityIndicators.quality_score || 0}%
                        </div>
                    </div>
                    <small class="text-muted">Data integrity: ${qualityIndicators.data_integrity || 'Good'}</small>
                </div>
                <div class="mb-3">
                    <label class="form-label">Processing Reliability</label>
                    <span class="badge bg-${getReliabilityBadgeColor(qualityIndicators.processing_reliability)} ms-2">
                        ${qualityIndicators.processing_reliability || 'High'}
                    </span>
                </div>
                ${qualityIndicators.quality_flags && qualityIndicators.quality_flags.length > 0 ? `
                <div class="alert alert-warning alert-sm">
                    <strong>Quality Flags:</strong>
                    <ul class="mb-0 mt-2">
                        ${qualityIndicators.quality_flags.map(flag => `<li>${flag}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
        </div>
        
        <!-- Progress Visualization -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-pie me-2"></i>Processing Breakdown</h6>
                <canvas id="processingBreakdownChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate performance tab content
 */
function generatePerformanceTab(stats) {
    const performanceAnalysis = stats?.performance_analysis || {};
    const efficiencyMetrics = stats?.efficiency_metrics || {};
    const memoryProfile = stats?.memory_profile || {};
    
    return `
        <div class="row">
            <div class="col-md-8">
                <h6><i class="fas fa-tachometer-alt me-2"></i>Performance Metrics</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <td><strong>Processing Speed:</strong></td>
                                <td>${efficiencyMetrics.files_per_minute || 0} files/min</td>
                            </tr>
                            <tr>
                                <td><strong>Throughput:</strong></td>
                                <td>${efficiencyMetrics.mb_per_minute || 0} MB/min</td>
                            </tr>
                            <tr>
                                <td><strong>Efficiency Score:</strong></td>
                                <td>
                                    <span class="badge bg-${getEfficiencyBadgeColor(efficiencyMetrics.efficiency_score)}">
                                        ${efficiencyMetrics.efficiency_score || 0}/100
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Memory Efficiency:</strong></td>
                                <td>
                                    <span class="badge bg-${getMemoryEfficiencyColor(performanceAnalysis.memory_efficiency)}">
                                        ${performanceAnalysis.memory_efficiency || 'Unknown'}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>Processing Consistency:</strong></td>
                                <td>${performanceAnalysis.processing_consistency || 'Unknown'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                ${performanceAnalysis.recommendations && performanceAnalysis.recommendations.length > 0 ? `
                <div class="alert alert-info">
                    <h6><i class="fas fa-lightbulb me-2"></i>Performance Recommendations</h6>
                    <ul class="mb-0">
                        ${performanceAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            
            <div class="col-md-4">
                <h6><i class="fas fa-memory me-2"></i>Memory Usage</h6>
                <div class="card">
                    <div class="card-body text-center">
                        <div class="mb-3">
                            <canvas id="memoryUsageChart" width="200" height="200"></canvas>
                        </div>
                        <div class="row text-center">
                            <div class="col-6">
                                <small class="text-muted">Peak</small>
                                <div class="fw-bold">${memoryProfile.peak_memory_mb || 0} MB</div>
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Average</small>
                                <div class="fw-bold">${memoryProfile.average_memory_mb || 0} MB</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Performance Timeline -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-line me-2"></i>Performance Timeline</h6>
                <canvas id="performanceTimelineChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate files analysis tab content
 */
function generateFilesTab(stats) {
    const fileTypeBreakdown = stats?.file_type_breakdown || {};
    const speedProfile = stats?.speed_profile || {};
    
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-file-alt me-2"></i>File Type Distribution</h6>
                ${fileTypeBreakdown.type_distribution ? `
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>File Type</th>
                                <th>Count</th>
                                <th>Success Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(fileTypeBreakdown.type_distribution).map(([ext, count]) => `
                            <tr>
                                <td><code>${ext || 'no extension'}</code></td>
                                <td>${count}</td>
                                <td>
                                    <span class="badge bg-success">
                                        ${fileTypeBreakdown.success_by_type?.[ext] || 100}%
                                    </span>
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : '<p class="text-muted">No file type data available</p>'}
            </div>
            
            <div class="col-md-6">
                <h6><i class="fas fa-file-pdf me-2"></i>PDF Analysis</h6>
                ${fileTypeBreakdown.pdf_analysis ? `
                <div class="row">
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-primary">${fileTypeBreakdown.pdf_analysis.total_pdfs}</h5>
                                <p class="card-text small">PDFs Processed</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-success">${fileTypeBreakdown.pdf_analysis.tables_extracted}</h5>
                                <p class="card-text small">Tables Extracted</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-info">${fileTypeBreakdown.pdf_analysis.references_extracted}</h5>
                                <p class="card-text small">References Found</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title text-warning">${fileTypeBreakdown.pdf_analysis.ocr_processed}</h5>
                                <p class="card-text small">OCR Processed</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mt-3">
                    <small class="text-muted">
                        Average tables per PDF: ${fileTypeBreakdown.pdf_analysis.avg_tables_per_pdf || 0}<br>
                        OCR usage rate: ${fileTypeBreakdown.pdf_analysis.ocr_usage_rate || 0}%
                    </small>
                </div>
                ` : '<p class="text-muted">No PDF files processed</p>'}
            </div>
        </div>
        
        <!-- File Size Distribution Chart -->
        <div class="row mt-4">
            <div class="col-12">
                <h6><i class="fas fa-chart-bar me-2"></i>File Type Processing</h6>
                <canvas id="fileTypeChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
}

/**
 * Generate insights tab content
 */
function generateInsightsTab(insights, summary) {
    return `
        <div class="row">
            <div class="col-md-6">
                <h6><i class="fas fa-lightbulb me-2"></i>Key Insights</h6>
                ${insights?.performance_insights && insights.performance_insights.length > 0 ? `
                <div class="alert alert-info">
                    <h6>Performance Insights</h6>
                    <ul class="mb-0">
                        ${insights.performance_insights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${summary?.highlights && summary.highlights.length > 0 ? `
                <div class="alert alert-success">
                    <h6><i class="fas fa-star me-2"></i>Highlights</h6>
                    <ul class="mb-0">
                        ${summary.highlights.map(highlight => `<li>${highlight}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            
            <div class="col-md-6">
                <h6><i class="fas fa-cogs me-2"></i>Optimization Opportunities</h6>
                ${insights?.optimization_recommendations && insights.optimization_recommendations.length > 0 ? `
                <div class="alert alert-warning">
                    <h6>Recommendations</h6>
                    <ul class="mb-0">
                        ${insights.optimization_recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${summary?.areas_for_improvement && summary.areas_for_improvement.length > 0 ? `
                <div class="alert alert-info">
                    <h6><i class="fas fa-arrow-up me-2"></i>Areas for Improvement</h6>
                    <ul class="mb-0">
                        ${summary.areas_for_improvement.map(area => `<li>${area}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${insights?.next_steps && insights.next_steps.length > 0 ? `
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0"><i class="fas fa-tasks me-2"></i>Suggested Next Steps</h6>
                    </div>
                    <div class="card-body">
                        <ol class="mb-0">
                            ${insights.next_steps.map(step => `<li>${step}</li>`).join('')}
                        </ol>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Initialize charts and visualizations
 */
function initializeStatsCharts(stats) {
    // Wait for modal to be fully rendered
    setTimeout(() => {
        try {
            initializeProcessingBreakdownChart(stats);
            initializeMemoryUsageChart(stats);
            initializePerformanceTimelineChart(stats);
            initializeFileTypeChart(stats);
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }, 500);
}

/**
 * Initialize processing breakdown pie chart
 */
function initializeProcessingBreakdownChart(stats) {
    const canvas = document.getElementById('processingBreakdownChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const processed = stats?.processed_files || 0;
    const errors = stats?.error_files || 0;
    const skipped = stats?.skipped_files || 0;
    
    // Simple canvas-based pie chart (you can replace with Chart.js if available)
    drawPieChart(ctx, [
        { label: 'Processed', value: processed, color: '#28a745' },
        { label: 'Errors', value: errors, color: '#dc3545' },
        { label: 'Skipped', value: skipped, color: '#ffc107' }
    ]);
}

/**
 * Initialize memory usage chart
 */
function initializeMemoryUsageChart(stats) {
    const canvas = document.getElementById('memoryUsageChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const memoryProfile = stats?.memory_profile || {};
    const peak = memoryProfile.peak_memory_mb || 0;
    const average = memoryProfile.average_memory_mb || 0;
    
    drawBarChart(ctx, [
        { label: 'Peak', value: peak, color: '#dc3545' },
        { label: 'Average', value: average, color: '#28a745' }
    ]);
}

/**
 * Simple pie chart drawer
 */
function drawPieChart(ctx, data) {
    const canvas = ctx.canvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return;
    
    let currentAngle = -Math.PI / 2;
    
    data.forEach(item => {
        const sliceAngle = (item.value / total) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();
        
        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.value.toString(), labelX, labelY);
        
        currentAngle += sliceAngle;
    });
}

/**
 * Simple bar chart drawer
 */
function drawBarChart(ctx, data) {
    const canvas = ctx.canvas;
    const padding = 20;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    const maxValue = Math.max(...data.map(item => item.value));
    if (maxValue === 0) return;
    
    const barWidth = chartWidth / data.length;
    
    data.forEach((item, index) => {
        const barHeight = (item.value / maxValue) * chartHeight;
        const x = padding + index * barWidth;
        const y = canvas.height - padding - barHeight;
        
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y, barWidth - 10, barHeight);
        
        // Draw label
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, x + barWidth / 2, canvas.height - 5);
        ctx.fillText(item.value.toString(), x + barWidth / 2, y - 5);
    });
}

/**
 * Utility functions for styling
 */
function getReliabilityBadgeColor(reliability) {
    switch (reliability) {
        case 'Very High': return 'success';
        case 'High': return 'success';
        case 'Medium': return 'warning';
        case 'Low': return 'danger';
        default: return 'secondary';
    }
}

function getEfficiencyBadgeColor(score) {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    if (score >= 50) return 'info';
    return 'danger';
}

function getMemoryEfficiencyColor(efficiency) {
    switch (efficiency) {
        case 'High': return 'success';
        case 'Medium': return 'warning';
        case 'Low': return 'danger';
        default: return 'secondary';
    }
}

/**
 * Show stats modal
 */
function showStatsModal() {
    const modal = new bootstrap.Modal(document.getElementById('taskStatsModal'));
    modal.show();
}

/**
 * Update summary cards in main UI
 */
function updateStatsSummaryCards(stats, summary) {
    // Update any existing summary cards in the main interface
    const summaryContainer = document.getElementById('taskSummaryCards');
    if (summaryContainer) {
        summaryContainer.innerHTML = generateSummaryCards(stats, summary);
        summaryContainer.classList.remove('d-none');
    }
}

/**
 * Show stats toast notification
 */
function showStatsToast(summary) {
    const headline = summary?.headline || 'Task completed successfully';
    const successRate = summary?.key_metrics?.success_rate || '100%';
    
    showToast(
        'Task Completed', 
        `${headline} (${successRate} success rate)`, 
        'success',
        8000 // Show for 8 seconds
    );
}

/**
 * Export task statistics
 */
function exportTaskStats(taskId) {
    try {
        // Create download link for stats export
        const exportUrl = `/api/task/${taskId}/stats/export`;
        
        // Create temporary link and trigger download
        const link = document.createElement('a');
        link.href = exportUrl;
        link.download = `task_${taskId}_stats.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Export', 'Task statistics exported successfully', 'info');
        
    } catch (error) {
        console.error('Error exporting stats:', error);
        showToast('Error', 'Failed to export statistics', 'error');
    }
}

/**
 * View task history
 */
function viewTaskHistory() {
    // Open task history in a new modal or navigate to history page
    fetch('/api/tasks/history?limit=10')
        .then(response => response.json())
        .then(data => {
            displayTaskHistory(data.history);
        })
        .catch(error => {
            console.error('Error fetching task history:', error);
            showToast('Error', 'Failed to load task history', 'error');
        });
}

/**
 * Display task history modal
 */
function displayTaskHistory(history) {
    // Create and show task history modal
    const historyHTML = `
        <div class="modal fade" id="taskHistoryModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-history me-2"></i>Task History
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${generateHistoryContent(history)}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal
    const existingModal = document.getElementById('taskHistoryModal');
    if (existingModal) existingModal.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', historyHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('taskHistoryModal'));
    modal.show();
}

/**
 * Generate history content
 */
function generateHistoryContent(history) {
    if (!history || history.length === 0) {
        return '<p class="text-muted text-center">No task history available</p>';
    }
    
    return `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Task Type</th>
                        <th>Completed</th>
                        <th>Files Processed</th>
                        <th>Success Rate</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(task => `
                    <tr>
                        <td><span class="badge bg-primary">${task.task_type}</span></td>
                        <td>${formatDate(task.completed_at)}</td>
                        <td>${task.stats?.processed_files || 0}</td>
                        <td>
                            <span class="badge bg-success">
                                ${task.summary?.key_metrics?.success_rate || '100%'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="exportTaskStats('${task.task_id}')">
                                <i class="fas fa-download"></i>
                            </button>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Utility function to format bytes
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Utility function to format date
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
        return dateString;
    }
}

/**
 * Get completion message based on stats
 */
function getCompletionMessage(stats, taskType) {
    const processed = stats?.processed_files || 0;
    const total = stats?.total_files || 0;
    const errors = stats?.error_files || 0;
    
    if (errors === 0) {
        return `All ${processed} files processed successfully without errors.`;
    } else if (errors < total * 0.1) {
        return `${processed} files processed successfully with ${errors} minor issues.`;
    } else {
        return `${processed} files processed with ${errors} errors that may need attention.`;
    }
}

/**
 * Enhanced Socket.IO event listener for stats showcase
 */
if (window.socket) {
    window.socket.on('task_stats_showcase', function(data) {
        if (data.task_id === currentTaskId) {
            console.log('Stats showcase event received:', data);
            
            // Show a notification about available detailed stats
            showToast(
                'Detailed Stats Available', 
                'Click to view comprehensive task statistics', 
                'info',
                5000,
                () => displayTaskStats(data)
            );
        }
    });
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