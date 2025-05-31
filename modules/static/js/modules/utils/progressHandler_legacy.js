/**
 * NeuroGen Server - Enhanced Progress Handler Module v4.0
 * 
 * Global progress tracking system optimized for the new Blueprint architecture.
 * Provides robust functionality for tracking and displaying task progress across
 * all modules with centralized configuration and enhanced error handling.
 * 
 * NEW v4.0 Features:
 * - Configuration-driven architecture using centralized endpoints
 * - Enhanced 4-method notification system (Toast + Console + System + Error)
 * - Backend connectivity testing with health checks
 * - ES6 module imports with centralized configuration
 * - Optimized for Blueprint architecture integration
 * - Cross-module progress coordination
 * - Enhanced SocketIO event handling with TASK_EVENTS
 * 
 * Legacy Features (Enhanced):
 * 1. Fixed progress bar "stuck at 99%" issue - Force to 100% on completion
 * 2. Fixed progress bar "stuck at 5%" issue - Incremental progress for early stages
 * 3. Better integration with Socket.IO events including new PDF-specific events
 * 4. Improved circular dependency resolution with UI module
 * 5. More reliable task completion handling and duplicate completion prevention
 * 6. Better error recovery mechanisms
 * 7. Enhanced state management with clear lifecycles
 * 8. Improved progress visualization with animations
 * 9. Enhanced task history management
 * 10. Multiple fallback paths for task status updates
 * 11. Memory leak fixes and consistent cleanup
 * 12. Animation-based progress to prevent visual stutter
 * 13. Connection monitoring and automatic reconnection support
 * 14. Latency tracking for improved performance metrics
 * 15. Enhanced PDF-specific event handling
 * 
 * @module utils/progressHandler
 * @version 4.0.0 - Blueprint Architecture Optimization
 */

// Import dependencies from centralized config
import { API_ENDPOINTS, BLUEPRINT_ROUTES } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG, SOCKET_CONFIG } from '../config/constants.js';
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';
import { getElement, getElements, getUIElements } from './domUtils.js';

// Global configuration for progress handling
const PROGRESS_CONFIG = {
  endpoints: {
    health: API_ENDPOINTS.SYSTEM?.HEALTH || '/api/health',
    status: '/api/status',
    cancel: '/api/cancel_task'
  },
  api: API_CONFIG,
  socket: SOCKET_CONFIG,
  events: {
    ...TASK_EVENTS,
    progress: SOCKET_EVENTS.PROGRESS_UPDATE || 'progress_update',
    complete: SOCKET_EVENTS.TASK_COMPLETE || 'task_completed',
    error: SOCKET_EVENTS.TASK_ERROR || 'task_error',
    cancel: SOCKET_EVENTS.TASK_CANCEL || 'task_cancelled'
  }
};

// Registry of active progress trackers
const activeTrackers = new Map();

// Progress tracker ID counter
let trackerIdCounter = 0;

// Module state - use explicit initialization to avoid undefined errors
const state = {
  // Task tracking
  activeTasks: new Map(),
  initialized: false,
  statusPollingIntervals: new Map(),
  lastUpdateTimes: new Map(),
  progressRates: new Map(),
  uiElements: new Map(),
  completedTasks: [],
  failedTasks: [],
  // Tracking the last reported progress percentage to prevent UI flicker and backward progress
  lastProgressValues: new Map(),
  // Track which tasks have already been marked as completed to prevent duplicates
  completedTaskIds: new Set(),
  // Track animation state to avoid jank
  progressAnimations: new Map(),
  // Track task error state
  taskErrors: new Map(),
  // Track custom event handlers
  eventHandlers: new Map(),
  // Task progress info for better ETA
  taskProgressInfo: new Map(),
  // Status polling metadata
  pollingMetadata: {
    failureCount: new Map(),
    lastPollTime: new Map(),
    consecutiveFailures: new Map(),
    maxConsecutiveFailures: 5
  },
  // Animation settings
  animation: {
    enabled: true,
    duration: 400, // ms
    easing: 'ease-out',
    threshold: 0.5 // minimum percentage change to animate
  },
  // Flag to prevent duplicate UI updates
  preventDuplicateUpdates: true,
  // Connection state tracking
  connectionState: {
    connected: false,
    lastConnectedAt: null,
    disconnectedAt: null,
    serverVersion: null,
    connectionAttempts: 0,
    latencyHistory: [],
    maxLatencyEntries: 10
  }
};

// Default settings for progress updates
const DEFAULT_SETTINGS = {
  pollInterval: 2000,           // Status polling interval (ms)
  updateThrottleMs: 100,        // Throttle UI updates to prevent excessive DOM operations
  maxHistoryItems: 50,          // Maximum number of items to keep in history
  animationDuration: 300,       // Animation duration for transitions (ms)
  debugMode: false,             // Enable debug logging
  useWebSockets: true,          // Whether to use WebSockets for updates
  saveToSessionStorage: true,   // Whether to save task info to session storage
  maxCompletedTasks: 20,        // Maximum number of completed tasks to keep in memory
  minProgressStep: 0.5,         // Minimum progress step for updates (%)
  maxProgressRates: 10,         // Maximum number of progress rates to keep for averaging
  lowProgressThreshold: 15,     // Threshold for low progress (%)
  earlyProgressUpdateInterval: 2000, // Ms between progress increments in early stages
  stuckDetectionTime: 30000,    // Ms before considering progress as stuck
  maxRetries: 3,                // Maximum retries for API calls
  retryDelay: 1000,             // Base delay for retries (ms)
  completionDelay: 200,         // Delay before showing completion (ms)
  reconnectInterval: 5000,      // Delay between reconnection attempts (ms)
  maxReconnectAttempts: 10,     // Maximum number of reconnection attempts
  pingInterval: 30000           // Interval to ping server for latency measurement (ms)
};

// Maximum number of progress rates to keep for averaging
const MAX_PROGRESS_RATES = DEFAULT_SETTINGS.maxProgressRates;

// Utility function to get timestamp in milliseconds
function getTimestamp() {
  return Date.now();
}

// Utility function to format duration in human-readable form
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return 'Unknown';
  
  const seconds = Math.floor(milliseconds / 1000);
  
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return `${minutes} min ${remainingSeconds} sec`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours} hr ${remainingMinutes} min`;
}

// Utility function to calculate ETA based on progress history
function calculateETA(taskId, currentProgress) {
  if (!state.lastUpdateTimes.has(taskId) || !state.progressRates.has(taskId)) {
    return { timeRemaining: null, completionTime: null };
  }
  
  const progressRates = state.progressRates.get(taskId);
  if (progressRates.length < 2) {
    return { timeRemaining: null, completionTime: null };
  }
  
  // Calculate average progress rate per millisecond
  const totalRates = progressRates.reduce((sum, rate) => sum + rate, 0);
  const avgRate = totalRates / progressRates.length;
  
  if (avgRate <= 0 || !isFinite(avgRate)) {
    return { timeRemaining: null, completionTime: null };
  }
  
  // Calculate remaining progress
  const remainingProgress = Math.max(0, 100 - currentProgress);
  
  // Calculate remaining time
  const timeRemaining = remainingProgress / avgRate;
  
  // Calculate estimated completion time
  const completionTime = new Date(Date.now() + timeRemaining);
  
  return {
    timeRemaining: timeRemaining,
    completionTime: completionTime,
    progressRate: avgRate
  };
}

// Utility function to update progress rate calculation
function updateProgressRate(taskId, progress) {
  const now = getTimestamp();
  
  if (!state.lastUpdateTimes.has(taskId)) {
    state.lastUpdateTimes.set(taskId, now);
    state.progressRates.set(taskId, []);
    return;
  }
  
  // Get last update time and progress
  const lastUpdateTime = state.lastUpdateTimes.get(taskId);
  const task = state.activeTasks.get(taskId);
  
  if (!task) return;
  
  const lastProgress = task.progress || 0;
  const timeDelta = now - lastUpdateTime;
  
  // Avoid division by zero
  if (timeDelta <= 0) return;
  
  // Calculate progress rate (percent per millisecond)
  const progressDelta = progress - lastProgress;
  const rate = progressDelta / timeDelta;
  
  // Only store positive rates (progress should always increase)
  if (rate > 0) {
    const progressRates = state.progressRates.get(taskId);
    
    // Keep last N rates for moving average
    progressRates.push(rate);
    if (progressRates.length > MAX_PROGRESS_RATES) {
      progressRates.shift();
    }
    
    state.progressRates.set(taskId, progressRates);
    
    // Update task progress info for better ETA calculation
    if (!state.taskProgressInfo.has(taskId)) {
      state.taskProgressInfo.set(taskId, {
        startTime: now,
        updateCount: 1,
        totalProgressChange: progressDelta,
        avgProgressRate: rate
      });
    } else {
      const info = state.taskProgressInfo.get(taskId);
      info.updateCount++;
      info.totalProgressChange += progressDelta;
      info.avgProgressRate = info.totalProgressChange / ((now - info.startTime) || 1);
      state.taskProgressInfo.set(taskId, info);
    }
  }
  
  // Update last update time
  state.lastUpdateTimes.set(taskId, now);
}

// Advanced progress smoother for early progress indication
function smoothProgress(taskId, reportedProgress, updateCount) {
  // CRITICAL FIX: Direct progress return - no smoothing
  return reportedProgress;
}
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create a new progress tracker
 * @param {Object} options - Progress tracker options
 * @returns {Object} Progress tracker API
 */
function createProgressTracker(options = {}) {
  const id = options.id || `progress-${++trackerIdCounter}`;
  
  if (activeTrackers.has(id)) {
    console.warn(`Progress tracker with ID ${id} already exists`);
    return activeTrackers.get(id);
  }
  
  const defaults = {
    target: null,
    total: 100,
    current: 0,
    label: 'Progress',
    showPercent: true,
    showValue: false,
    autoAttach: true,
    className: '',
    color: 'primary',
    size: 'default',
    onComplete: null,
    onCreate: null,
    onUpdate: null
  };
  
  const config = { ...defaults, ...options };
  
  // Create progress element
  let progressElement = null;
  let progressBar = null;
  let progressLabel = null;
  let progressValue = null;
  
  if (config.autoAttach && config.target) {
    progressElement = createProgressElement(config);
  }
  
  // Create tracker state
  const trackerState = {
    id,
    total: config.total,
    current: config.current,
    percent: calculatePercent(config.current, config.total),
    label: config.label,
    status: 'pending',
    elements: {
      container: progressElement,
      bar: progressBar,
      label: progressLabel,
      value: progressValue
    }
  };
  
  // Create tracker API
  const tracker = {
    getId: () => id,
    getState: () => ({ ...trackerState }),
    update,
    setTotal,
    increment,
    complete,
    reset,
    error,
    attach,
    detach,
    destroy
  };
  
  // Store in registry
  activeTrackers.set(id, tracker);
  
  // Call onCreate callback if provided
  if (typeof config.onCreate === 'function') {
    config.onCreate(tracker);
  }
  
  return tracker;
  
  /**
   * Update progress state
   * @param {number|Object} value - New progress value or state object
   * @param {string} [label] - New progress label
   * @returns {Object} Updated tracker
   */
  function update(value, label) {
    // Handle object input
    if (typeof value === 'object') {
      if (typeof value.current === 'number') {
        trackerState.current = Math.min(Math.max(0, value.current), trackerState.total);
      }
      
      if (typeof value.total === 'number' && value.total > 0) {
        trackerState.total = value.total;
      }
      
      if (value.label) {
        trackerState.label = value.label;
      }
      
      if (value.status) {
        trackerState.status = value.status;
      }
    } else if (typeof value === 'number') {
      // Handle numeric input
      trackerState.current = Math.min(Math.max(0, value), trackerState.total);
    }
    
    // Update label if provided
    if (typeof label === 'string') {
      trackerState.label = label;
    }
    
    // Calculate percentage
    trackerState.percent = calculatePercent(trackerState.current, trackerState.total);
    
    // Update DOM if needed
    updateProgressElement();
    
    // Call onUpdate callback if provided
    if (typeof config.onUpdate === 'function') {
      config.onUpdate(tracker);
    }
    
    // Auto-complete if current reaches total
    if (trackerState.current >= trackerState.total && trackerState.status === 'pending') {
      complete();
    }
    
    return tracker;
  }
  
  /**
   * Set the total value
   * @param {number} total - New total value
   * @returns {Object} Updated tracker
   */
  function setTotal(total) {
    if (typeof total !== 'number' || total <= 0) {
      console.warn('Invalid total value for progress tracker');
      return tracker;
    }
    
    trackerState.total = total;
    trackerState.percent = calculatePercent(trackerState.current, trackerState.total);
    
    updateProgressElement();
    
    return tracker;
  }
  
  /**
   * Increment progress by a specific amount
   * @param {number} [amount=1] - Amount to increment
   * @param {string} [label] - New progress label
   * @returns {Object} Updated tracker
   */
  function increment(amount = 1, label) {
    return update(trackerState.current + amount, label);
  }
  
  /**
   * Mark progress as complete
   * @returns {Object} Updated tracker
   */
  function complete() {
    trackerState.current = trackerState.total;
    trackerState.percent = 100;
    trackerState.status = 'complete';
    
    updateProgressElement();
    
    // Call onComplete callback if provided
    if (typeof config.onComplete === 'function') {
      config.onComplete(tracker);
    }
    
    return tracker;
  }
  
  /**
   * Reset progress to initial state
   * @returns {Object} Updated tracker
   */
  function reset() {
    trackerState.current = 0;
    trackerState.percent = 0;
    trackerState.status = 'pending';
    
    updateProgressElement();
    
    return tracker;
  }
  
  /**
   * Mark progress as error
   * @param {string} [errorMessage] - Error message
   * @returns {Object} Updated tracker
   */
  function error(errorMessage) {
    trackerState.status = 'error';
    
    if (errorMessage) {
      trackerState.label = errorMessage;
    }
    
    updateProgressElement();
    
    return tracker;
  }
  
  /**
   * Attach progress tracker to a DOM element
   * @param {string|HTMLElement} target - Target element
   * @returns {Object} Updated tracker
   */
  function attach(target) {
    const targetElement = getElement(target);
    
    if (!targetElement) {
      console.warn('Invalid target element for progress tracker');
      return tracker;
    }
    
    // Detach from current element if attached
    if (trackerState.elements.container && trackerState.elements.container.parentNode) {
      detach();
    }
    
    // Create new progress element
    const newProgressElement = createProgressElement({
      ...config,
      target: targetElement
    });
    
    // Update state
    trackerState.elements.container = newProgressElement;
    
    return tracker;
  }
  
  /**
   * Detach progress tracker from DOM
   * @returns {Object} Updated tracker
   */
  function detach() {
    if (trackerState.elements.container && trackerState.elements.container.parentNode) {
      trackerState.elements.container.remove();
    }
    
    return tracker;
  }
  
  /**
   * Destroy progress tracker
   */
  function destroy() {
    detach();
    activeTrackers.delete(id);
  }
  
  /**
   * Create progress element
   * @param {Object} config - Progress configuration
   * @returns {HTMLElement} Progress element
   */
  function createProgressElement(config) {
    const target = getElement(config.target);
    
    if (!target) {
      return null;
    }
    
    // Create container
    const container = document.createElement('div');
    container.className = `progress-container ${config.className}`;
    container.setAttribute('data-progress-id', id);
    container.setAttribute('role', 'progressbar');
    container.setAttribute('aria-valuemin', '0');
    container.setAttribute('aria-valuemax', trackerState.total);
    container.setAttribute('aria-valuenow', trackerState.current);
    
    // Add size class if provided
    if (config.size && config.size !== 'default') {
      container.classList.add(`progress-${config.size}`);
    }
    
    // Create label if needed
    if (config.label) {
      progressLabel = document.createElement('div');
      progressLabel.className = 'progress-label';
      progressLabel.textContent = trackerState.label;
      container.appendChild(progressLabel);
    }
    
    // Create progress track
    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';
    
    // Create progress bar
    progressBar = document.createElement('div');
    progressBar.className = `progress-bar progress-${config.color}`;
    progressBar.style.width = `${trackerState.percent}%`;
    progressTrack.appendChild(progressBar);
    
    // Create value display if needed
    if (config.showPercent || config.showValue) {
      progressValue = document.createElement('div');
      progressValue.className = 'progress-value';
      
      if (config.showPercent) {
        progressValue.textContent = `${trackerState.percent}%`;
      } else if (config.showValue) {
        progressValue.textContent = `${trackerState.current} / ${trackerState.total}`;
      }
      
      progressTrack.appendChild(progressValue);
    }
    
    container.appendChild(progressTrack);
    target.appendChild(container);
    
    // Store references
    trackerState.elements = {
      container,
      bar: progressBar,
      label: progressLabel,
      value: progressValue
    };
    
    return container;
  }
  
  /**
   * Update progress element to reflect current state
   */
  function updateProgressElement() {
    if (!trackerState.elements.container) {
      return;
    }
    
    // Update aria attributes
    trackerState.elements.container.setAttribute('aria-valuenow', trackerState.current);
    trackerState.elements.container.setAttribute('aria-valuemax', trackerState.total);
    
    // Update status class
    trackerState.elements.container.classList.remove('progress-pending', 'progress-complete', 'progress-error');
    trackerState.elements.container.classList.add(`progress-${trackerState.status}`);
    
    // Update progress bar
    if (trackerState.elements.bar) {
      trackerState.elements.bar.style.width = `${trackerState.percent}%`;
    }
    
    // Update label
    if (trackerState.elements.label) {
      trackerState.elements.label.textContent = trackerState.label;
    }
    
    // Update value
    if (trackerState.elements.value) {
      if (config.showPercent) {
        trackerState.elements.value.textContent = `${Math.round(trackerState.percent)}%`;
      } else if (config.showValue) {
        trackerState.elements.value.textContent = `${trackerState.current} / ${trackerState.total}`;
      }
    }
  }
}

/**
 * Calculate percentage based on current and total values
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
function calculatePercent(current, total) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (current / total) * 100));
}

// Check if the browser is in reduced animation mode
function shouldUseReducedAnimations() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Apply animated progress update with configurable animation or instant update for reduced motion
function applyProgressBarAnimation(progressBar, currentWidth, targetWidth) {
  if (!progressBar) return;
  
  // Skip animation for small changes or if animations are disabled
  const isSmallChange = Math.abs(targetWidth - currentWidth) < DEFAULT_SETTINGS.minProgressStep;
  const shouldReduceMotion = shouldUseReducedAnimations() || !state.animation.enabled;
  
  if (isSmallChange || shouldReduceMotion) {
    // Apply immediately for small changes or reduced motion
    progressBar.style.width = `${targetWidth}%`;
    progressBar.setAttribute('aria-valuenow', targetWidth);
    progressBar.textContent = `${Math.round(targetWidth)}%`;
    return;
  }
  
  // Apply the animation
  progressBar.style.transition = `width ${state.animation.duration}ms ${state.animation.easing}`;
  progressBar.style.width = `${targetWidth}%`;
  progressBar.setAttribute('aria-valuenow', targetWidth);
  progressBar.textContent = `${Math.round(targetWidth)}%`;
  
  // Clear transition after animation completes
  setTimeout(() => {
    progressBar.style.transition = '';
  }, state.animation.duration + 50);
}

// Cleanup function for removing event listeners and intervals
function cleanupEventListeners(taskId) {
  // Clean up custom event handlers for this task
  if (state.eventHandlers.has(taskId)) {
    const handlers = state.eventHandlers.get(taskId);
    
    if (handlers.socketHandlers) {
      const socket = window.socket;
      if (socket) {
        // Remove Socket.IO event listeners
        for (const [event, handler] of Object.entries(handlers.socketHandlers)) {
          socket.off(event, handler);
        }
      }
    }
    
    if (handlers.eventRegistry) {
      const eventRegistry = window.eventRegistry || window.moduleInstances?.eventRegistry;
      if (eventRegistry) {
        // Remove event registry listeners
        for (const [event, handler] of Object.entries(handlers.eventRegistry)) {
          eventRegistry.off(event, handler);
        }
      }
    }
    
    // Remove DOM event listeners
    if (handlers.dom) {
      for (const [selector, eventHandlers] of Object.entries(handlers.dom)) {
        const element = document.querySelector(selector);
        if (element) {
          for (const [event, handler] of Object.entries(eventHandlers)) {
            element.removeEventListener(event, handler);
          }
        }
      }
    }
    
    // Remove the handlers from the map
    state.eventHandlers.delete(taskId);
  }
}

/**
 * Enhanced notification system with 4-method delivery
 * @param {string} message - Notification message
 * @param {string} type - Type of notification (info, success, warning, error)
 * @param {string} title - Notification title
 */
function showNotification(message, type = 'info', title = 'Progress Handler') {
  // Method 1: Toast notifications
  if (window.NeuroGen?.ui?.showToast) {
    window.NeuroGen.ui.showToast(title, message, type);
  }
  
  // Method 2: Console logging with styling
  const styles = {
    error: 'color: #dc3545; font-weight: bold;',
    warning: 'color: #fd7e14; font-weight: bold;',
    success: 'color: #198754; font-weight: bold;',
    info: 'color: #0d6efd;'
  };
  console.log(`%c[${title}] ${message}`, styles[type] || styles.info);
  
  // Method 3: System notification (if available)
  if (window.NeuroGen?.notificationHandler) {
    window.NeuroGen.notificationHandler.show({
      title, message, type, module: 'progressHandler'
    });
  }
  
  // Method 4: Error reporting to centralized handler
  if (type === 'error' && window.NeuroGen?.errorHandler) {
    window.NeuroGen.errorHandler.logError({
      module: 'progressHandler', message, severity: type
    });
  }
}

/**
 * Test backend connectivity for progress handler
 * @returns {Promise<Object>} Backend connectivity status
 */
async function testBackendConnectivity() {
  const results = {
    overall: false,
    details: {},
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // Test main health endpoint
    const healthResponse = await fetch(PROGRESS_CONFIG.endpoints.health, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    results.details.health = {
      status: healthResponse.status,
      ok: healthResponse.ok,
      endpoint: PROGRESS_CONFIG.endpoints.health
    };

    if (healthResponse.ok) {
      results.overall = true;
      showNotification('Backend connectivity verified', 'success', 'Progress Handler');
    } else {
      throw new Error(`Health endpoint returned ${healthResponse.status}`);
    }

  } catch (error) {
    results.errors.push({
      endpoint: PROGRESS_CONFIG.endpoints.health,
      error: error.message
    });
    showNotification(`Backend connectivity failed: ${error.message}`, 'error', 'Progress Handler');
  }

  return results;
}

/**
 * Get progress handler health status
 * @returns {Object} Health status information
 */
function getHealthStatus() {
  return {
    module: 'progressHandler',
    version: '4.0.0',
    status: state.initialized ? 'healthy' : 'initializing',
    features: {
      configurationDriven: true,
      enhancedNotifications: true,
      backendConnectivity: true,
      taskTracking: true,
      socketIntegration: true
    },
    configuration: {
      endpoints: PROGRESS_CONFIG.endpoints,
      eventsConfigured: Object.keys(PROGRESS_CONFIG.events).length,
      apiConfigAvailable: !!PROGRESS_CONFIG.api,
      socketConfigAvailable: !!PROGRESS_CONFIG.socket
    },
    statistics: {
      activeTasks: state.activeTasks.size,
      completedTasks: state.completedTasks.length,
      failedTasks: state.failedTasks.length,
      activeTrackers: activeTrackers.size,
      connected: state.connectionState.connected
    }
  };
}

/**
 * Initialize progress handler with enhanced Blueprint architecture integration
 * @param {Object} options - Global configuration options
 * @returns {Object} Progress handler API
 */
function initProgressHandler(options = {}) {
  const globalOptions = { ...options };
  
  // Initialize the module state if not already initialized
  if (!state.initialized) {
    showNotification('Initializing Progress Handler v4.0', 'info', 'Progress Handler');
    
    // Test backend connectivity on initialization
    testBackendConnectivity().then(result => {
      if (result.overall) {
        showNotification('Backend connectivity verified', 'success', 'Progress Handler');
      }
    });
    
    // Add global styles for progress animations
    addProgressStyles();
    
    // Set up task monitoring
    setupTaskMonitoring();
    
    // Set up connection monitoring if socket is available
    if (window.socket) {
      setupConnectionMonitoring();
    }
    
    // Load task history from storage
    loadTaskHistory();
    
    // Mark as initialized
    state.initialized = true;
    
    showNotification('Progress Handler v4.0 initialized successfully', 'success', 'Progress Handler');
  }
  
  return {
    createTracker: (options) => createProgressTracker({ ...globalOptions, ...options }),
    getTracker: (id) => activeTrackers.get(id) || null,
    getAllTrackers: () => Array.from(activeTrackers.values()),
    destroyTracker: (id) => {
      const tracker = activeTrackers.get(id);
      if (tracker) {
        tracker.destroy();
        return true;
      }
      return false;
    },
    destroyAllTrackers: () => {
      activeTrackers.forEach(tracker => tracker.destroy());
      activeTrackers.clear();
    },
    setupTaskProgress,
    trackProgress,
    updateTaskProgress,
    updateProgressUI,
    completeTask,
    errorTask,
    cancelTask,
    createProgressUI,
    formatDuration,
    calculateETA,
    formatBytes,
    isConnected: () => state.connectionState.connected,
    getServerVersion: () => state.connectionState.serverVersion,
    getActiveTaskIds: () => Array.from(state.activeTasks.keys()),
    getTaskDetails,
    getActiveTaskCount: () => state.activeTasks.size,
    getCompletedTasks: () => state.completedTasks,
    getFailedTasks: () => state.failedTasks,
    clearTaskHistory,
    forceResetTask,
    resetAllState,
    setAnimationsEnabled: (enabled) => { state.animation.enabled = !!enabled; },
    getAverageLatency: () => {
      const latencyHistory = state.connectionState.latencyHistory;
      if (latencyHistory.length === 0) return 0;
      
      const sum = latencyHistory.reduce((acc, val) => acc + val, 0);
      return sum / latencyHistory.length;
    },
    reconnect: () => {
      if (window.socket) {
        console.log("Manually reconnecting to server...");
        
        // Disconnect first if connected
        if (window.socket.connected) {
          window.socket.disconnect();
        }
        
        // Reconnect
        window.socket.connect();
      }
    },
    disconnect: () => {
      if (window.socket && window.socket.connected) {
        console.log("Manually disconnecting from server...");
        window.socket.disconnect();
      }
    },
    // Add cancelTracking function
    cancelTracking,
    // New v4.0 methods for Blueprint architecture integration
    showNotification,
    testBackendConnectivity,
    getHealthStatus
  };
}

/**
 * Add global CSS styles for progress animations
 */
function addProgressStyles() {
  // Skip if styles are already added
  if (document.getElementById('progress-handler-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'progress-handler-styles';
  style.textContent = `
    /* Enhanced progress bar styling */
    .progress-bar {
      transition: width 0.4s ease-out;
    }
    
    /* Pulse animation for low progress */
    @keyframes progressPulse {
      0% { opacity: 0.7; }
      50% { opacity: 1; }
      100% { opacity: 0.7; }
    }
    
    .progress-bar-low {
      animation: progressPulse 2s infinite;
    }
    
    /* Success animation for completion */
    @keyframes progressComplete {
      0% { background-color: #28a745; }
      50% { background-color: #1d9a39; }
      100% { background-color: #28a745; }
    }
    
    .progress-bar-complete {
      animation: progressComplete 1.5s ease-in-out;
    }
    
    /* Error styling */
    .progress-bar-error {
      background-color: #dc3545 !important;
    }
    
    /* Stuck progress warning */
    .progress-stuck-warning {
      color: #ffc107;
      font-style: italic;
      font-size: 0.9em;
      margin-top: 0.25rem;
    }
    
    /* ETA display */
    .eta-display, .elapsed-time {
      font-size: 0.85em;
      color: #6c757d;
      margin-top: 0.25rem;
    }
    
    /* Progress stats container */
    .progress-stats {
      padding: 0.75rem;
      margin-top: 0.5rem;
      border-radius: 0.25rem;
      background-color: rgba(0,0,0,0.03);
      border: 1px solid rgba(0,0,0,0.08);
    }
    
    /* Dark mode adjustments */
    .dark-theme .progress-stats {
      background-color: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.1);
    }
    
    /* Connection status indicator */
    .connection-status {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 5px;
    }
    
    .connection-status.connected {
      background-color: #28a745;
    }
    
    .connection-status.disconnected {
      background-color: #dc3545;
    }
    
    /* PDF download progress styling */
    .pdf-download-item {
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 0.25rem;
    }
    
    .pdf-download-item .progress {
      height: 4px;
      margin-top: 0.25rem;
    }
  `;
  
  document.head.appendChild(style);
  console.log("Added progress styles to document");
}

/**
 * Set up monitoring for connection state
 */
function setupConnectionMonitoring() {
  if (!window.socket) {
    console.warn("Socket.IO not available for connection monitoring");
    return;
  }
  
  // Listen for connect event
  window.socket.on('connect', () => {
    state.connectionState.connected = true;
    state.connectionState.lastConnectedAt = getTimestamp();
    state.connectionState.connectionAttempts = 0;
    console.log("Socket.IO connected");
    
    // Request status for all active tasks
    for (const taskId of state.activeTasks.keys()) {
      requestTaskStatus(taskId);
    }
    
    // Update UI indicators
    updateConnectionUI(true);
  });
  
  // Listen for disconnect event
  window.socket.on('disconnect', (reason) => {
    state.connectionState.connected = false;
    state.connectionState.disconnectedAt = getTimestamp();
    console.warn(`Socket.IO disconnected: ${reason}`);
    
    // Start polling for all active tasks
    for (const taskId of state.activeTasks.keys()) {
      startManualStatusPolling(taskId);
    }
    
    // Update UI indicators
    updateConnectionUI(false);
  });
  
  // Listen for connection error
  window.socket.on('connect_error', (error) => {
    state.connectionState.connected = false;
    console.error(`Socket.IO connection error: ${error.message}`);
    
    // Increment connection attempts
    state.connectionState.connectionAttempts++;
    
    // Update UI indicators
    updateConnectionUI(false);
  });
  
  // Listen for connection established event (custom event from server)
  window.socket.on('connection_established', (data) => {
    // Store server version
    state.connectionState.serverVersion = data.server_version;
    
    // Update connection state
    state.connectionState.connected = true;
    state.connectionState.lastConnectedAt = getTimestamp();
    
    console.log(`Connection established with server version ${data.server_version}`);
    
    // Update UI indicators
    updateConnectionUI(true);
  });
  
  // Listen for pong events for latency measurements
  window.socket.on('pong_to_client', (data) => {
    if (data && data.client_server_diff) {
      // Store latency measurement (convert seconds to milliseconds)
      const latency = data.client_server_diff * 1000;
      
      // Add to latency history
      state.connectionState.latencyHistory.push(latency);
      
      // Keep only the most recent measurements
      if (state.connectionState.latencyHistory.length > state.connectionState.maxLatencyEntries) {
        state.connectionState.latencyHistory.shift();
      }
    }
  });
  
  // Start ping interval for latency measurements
  startPingInterval();
}

/**
 * Update connection UI indicators
 * @param {boolean} connected - Connection status
 */
function updateConnectionUI(connected) {
  // Update all connection status indicators
  const indicators = document.querySelectorAll('.connection-status');
  indicators.forEach(indicator => {
    indicator.classList.toggle('connected', connected);
    indicator.classList.toggle('disconnected', !connected);
  });
  
  // Update all connection status text elements
  const statusTexts = document.querySelectorAll('[id$="connection-status"]');
  statusTexts.forEach(text => {
    text.textContent = connected ? 'Connected to server' : 'Disconnected';
    text.classList.toggle('text-success', connected);
    text.classList.toggle('text-danger', !connected);
  });
}

/**
 * Start ping interval for latency measurements
 */
function startPingInterval() {
  // Clear any existing interval
  if (window._pingInterval) {
    clearInterval(window._pingInterval);
  }
  
  // Create new interval
  window._pingInterval = setInterval(() => {
    // Skip if not connected
    if (!window.socket || !state.connectionState.connected) return;
    
    // Send ping to server
    window.socket.emit('ping_from_client', {
      client_timestamp: Date.now() / 1000,
      client_info: {
        user_agent: navigator.userAgent,
        url: window.location.href
      }
    });
  }, DEFAULT_SETTINGS.pingInterval);
}

/**
 * Setup task monitoring for stuck tasks and phantom completions
 */
function setupTaskMonitoring() {
  // Set up a timer to monitor for stuck tasks
  setInterval(() => {
    const now = getTimestamp();
    
    // Check each active task for stuck state
    for (const [taskId, task] of state.activeTasks.entries()) {
      if (state.completedTaskIds.has(taskId)) continue;
      
      const lastUpdate = state.lastUpdateTimes.get(taskId) || task.startTime;
      const timeSinceUpdate = now - lastUpdate;
      
      // If no updates for 30 seconds (stuckDetectionTime) and progress is neither
      // very low nor very high, it might be stuck
      if (timeSinceUpdate > DEFAULT_SETTINGS.stuckDetectionTime &&
          task.progress > 10 && task.progress < 95) {
        
        console.warn(`Task ${taskId} appears stuck at ${task.progress}% with no updates for ${Math.round(timeSinceUpdate/1000)}s`);
        
        // Add visual warning 
        const elements = getUIElements(task.elementPrefix);
        if (elements.progressStatus) {
          // Add warning indicator to status message
          const warningNode = document.createElement('div');
          warningNode.className = 'progress-stuck-warning';
          warningNode.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Progress may be stuck, checking status...';
          
          // Only add if not already present
          if (!elements.progressStatus.querySelector('.progress-stuck-warning')) {
            elements.progressStatus.appendChild(warningNode);
          }
        }
        
        // Request a fresh status update
        requestTaskStatus(taskId);
      }
      
      // Check for high progress potential completion
      if (task.progress >= 95 && !state.completedTaskIds.has(taskId)) {
        // Task has high progress but hasn't been marked complete, it may
        // be finished but missed the completion event
        const taskInfo = state.taskProgressInfo.get(taskId);
        
        if (taskInfo && now - taskInfo.startTime > 3 * 60 * 1000) { // 3 minutes
          console.log(`Task ${taskId} has been at high progress (${task.progress}%) for a long time, checking completion status`);
          
          // Make a direct API call to check status
          checkTaskCompletion(taskId);
        }
      }
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Make a direct API call to check if a task is complete
 * @param {string} taskId - Task ID to check
 */
async function checkTaskCompletion(taskId) {
  try {
    // Fallback to direct API call
    const response = await fetch(`/api/status/${taskId}`);
    if (!response.ok) return;
    
    const data = await response.json();
    
    if (data.status === 'completed' || data.progress >= 100) {
      console.log(`Task ${taskId} found to be complete via API check`);
      // Mark as completed
      if (!state.completedTaskIds.has(taskId)) {
        completeTask(taskId, data);
      }
    }
  } catch (error) {
    console.error(`Error checking task completion status for ${taskId}:`, error);
  }
}

/**
 * Request task status update
 * @param {string} taskId - Task ID to request status for
 */
function requestTaskStatus(taskId) {
  // Skip if task doesn't exist
  if (!state.activeTasks.has(taskId)) return;
  
  // Try direct Socket.IO if available
  if (window.socket && state.connectionState.connected) {
    window.socket.emit('request_task_status', {
      task_id: taskId,
      timestamp: Date.now() / 1000
    });
    return;
  }
  
  // Fallback: start manual polling if socket not available
  if (!state.statusPollingIntervals.has(taskId)) {
    startManualStatusPolling(taskId);
  }
}

/**
 * Start manual polling for task status when socket is unavailable
 * @param {string} taskId - The task ID to poll for
 */
function startManualStatusPolling(taskId) {
  try {
    // Clear any existing interval
    if (state.statusPollingIntervals.has(taskId)) {
      clearInterval(state.statusPollingIntervals.get(taskId));
    }
    
    // Create a new polling interval
    const intervalId = setInterval(async () => {
      if (!state.activeTasks.has(taskId)) {
        // Task no longer active, stop polling
        clearInterval(intervalId);
        state.statusPollingIntervals.delete(taskId);
        return;
      }
      
      // Skip polling if socket is now connected
      if (window.socket && state.connectionState.connected) {
        // Try to send a socket request instead
        window.socket.emit('request_task_status', {
          task_id: taskId,
          timestamp: Date.now() / 1000
        });
        
        // Keep poll running in case socket disconnects again
        return;
      }
      
      // Make API request to get task status
      try {
        const response = await fetch(`/api/status/${taskId}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Process the status update
          if (data.progress !== undefined) {
            updateTaskProgress(taskId, data.progress, data.message, data.stats);
          }
          
          // Check for completion states
          if (data.status === "completed" || data.progress >= 100) {
            completeTask(taskId, data);
            
            // Stop polling for this task
            clearInterval(intervalId);
            state.statusPollingIntervals.delete(taskId);
          } else if (data.status === "error" || data.status === "failed") {
            errorTask(taskId, data.error || "Unknown error", data);
            
            // Stop polling for this task
            clearInterval(intervalId);
            state.statusPollingIntervals.delete(taskId);
          } else if (data.status === "cancelled") {
            cancelTask(taskId);
            
            // Stop polling for this task
            clearInterval(intervalId);
            state.statusPollingIntervals.delete(taskId);
          }
        } else {
          console.warn(`Failed to get status for task ${taskId}: ${response.status}`);
          
          // Track consecutive failures
          const failures = state.pollingMetadata.consecutiveFailures.get(taskId) || 0;
          state.pollingMetadata.consecutiveFailures.set(taskId, failures + 1);
          
          // After multiple failures, stop polling
          if (failures + 1 >= state.pollingMetadata.maxConsecutiveFailures) {
            console.error(`Too many failed polls for task ${taskId}, stopping status polling`);
            clearInterval(intervalId);
            state.statusPollingIntervals.delete(taskId);
            
            // Flag the polling as failed in the task data
            const task = state.activeTasks.get(taskId);
            if (task) {
              task.pollingFailed = true;
              task.message = "Lost connection to server";
              state.activeTasks.set(taskId, task);
              
              // Update UI to show the error
              updateTaskProgress(taskId, task.progress, task.message, task.stats);
            }
          }
        }
      } catch (error) {
        console.error(`Error polling for task ${taskId} status:`, error);
      }
    }, DEFAULT_SETTINGS.pollInterval);
    
    // Store the interval ID
    state.statusPollingIntervals.set(taskId, intervalId);
    
    console.log(`Started manual status polling for task ${taskId}`);
  } catch (error) {
    console.error("Error starting manual status polling:", error);
  }
}

/**
 * Stop polling for task status
 * @param {string} taskId - The task ID to stop polling for
 */
function stopStatusPolling(taskId) {
  try {
    // Clear the polling interval
    if (state.statusPollingIntervals.has(taskId)) {
      clearInterval(state.statusPollingIntervals.get(taskId));
      state.statusPollingIntervals.delete(taskId);
      console.log(`Stopped status polling for task ${taskId}`);
    }
  } catch (error) {
    console.error("Error stopping status polling:", error);
  }
}

/**
 * Load task history from storage
 */
function loadTaskHistory() {
  try {
    // Try to load completed tasks from localStorage
    const completedTasksJson = localStorage.getItem('progressHandler.completedTasks');
    if (completedTasksJson) {
      const completedTasks = JSON.parse(completedTasksJson);
      state.completedTasks = completedTasks.slice(0, DEFAULT_SETTINGS.maxHistoryItems);
    }
    
    // Try to load failed tasks from localStorage
    const failedTasksJson = localStorage.getItem('progressHandler.failedTasks');
    if (failedTasksJson) {
      const failedTasks = JSON.parse(failedTasksJson);
      state.failedTasks = failedTasks.slice(0, DEFAULT_SETTINGS.maxHistoryItems);
    }
  } catch (error) {
    console.error("Error loading task history:", error);
  }
}

/**
 * Save task history to storage
 */
function saveTaskHistory() {
  try {
    // Save completed tasks to localStorage
    localStorage.setItem('progressHandler.completedTasks', JSON.stringify(state.completedTasks));
    
    // Save failed tasks to localStorage
    localStorage.setItem('progressHandler.failedTasks', JSON.stringify(state.failedTasks));
  } catch (error) {
    console.error("Error saving task history:", error);
  }
}

/**
 * Add a task to history
 * @param {string} taskId - The task ID
 * @param {Object} data - Task data
 * @param {string} status - Task status ('completed', 'error', 'cancelled')
 */
function addTaskToHistory(taskId, data, status) {
  try {
    const task = state.activeTasks.get(taskId);
    if (!task) return;
    
    // Create history entry
    const historyEntry = {
      id: taskId,
      type: task.type || 'unknown',
      status: status,
      startTime: task.startTime,
      endTime: getTimestamp(),
      duration: getTimestamp() - task.startTime,
      result: data || {}
    };
    
    // Add to appropriate history list
    if (status === 'completed') {
      state.completedTasks.unshift(historyEntry);
      
      // Limit history size
      if (state.completedTasks.length > DEFAULT_SETTINGS.maxHistoryItems) {
        state.completedTasks.pop();
      }
    } else if (status === 'error' || status === 'cancelled') {
      state.failedTasks.unshift(historyEntry);
      
      // Limit history size
      if (state.failedTasks.length > DEFAULT_SETTINGS.maxHistoryItems) {
        state.failedTasks.pop();
      }
    }
    
    // Save history to storage
    saveTaskHistory();
  } catch (error) {
    console.error("Error adding task to history:", error);
  }
}

/**
 * Extract a filename from a path
 * @param {string} path - File path
 * @returns {string} Filename
 */
function getFileNameFromPath(path) {
  if (!path) return 'Unknown';
  
  // Handle both Windows and Unix paths
  const parts = path.split(/[\/\\]/);
  return parts[parts.length - 1] || 'Unknown';
}

/**
 * Create progress UI elements in a container
 * @param {string} containerId - Container ID
 * @param {string} elementPrefix - Prefix for elements
 * @returns {Object} - Created UI elements
 */
function createProgressUI(containerId, elementPrefix = '') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container not found: ${containerId}`);
    return null;
  }
  
  // Create prefix for element IDs
  const prefix = elementPrefix ? `${elementPrefix}-` : '';
  
  // Create progress UI HTML
  container.innerHTML = `
    <div class="progress-wrapper mb-3">
      <div class="progress" style="height: 20px">
        <div id="${prefix}progress-bar" class="progress-bar bg-primary" 
            role="progressbar" style="width: 0%" aria-valuenow="0" 
            aria-valuemin="0" aria-valuemax="100">0%</div>
      </div>
      <div class="mt-2 d-flex justify-content-between align-items-center">
        <div id="${prefix}progress-status" class="text-muted">Initializing...</div>
        <!-- Removed duplicate percentage display - progress bar already shows percentage -->
      </div>
      <div class="d-flex justify-content-between align-items-center mt-1">
        <div id="${prefix}elapsed-time" class="small text-muted elapsed-time">Elapsed: 0s</div>
        <div id="${prefix}eta-display" class="small text-muted eta-display d-none">ETA: calculating...</div>
      </div>
      <div id="${prefix}progress-rate" class="small text-muted progress-rate d-none"></div>
    </div>
    <div id="${prefix}progress-stats" class="progress-stats mb-3">
      <div class="text-center py-2">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span>Initializing task...</span>
      </div>
    </div>
    
    <div class="connection-info small text-muted mb-3">
      <div class="d-flex align-items-center">
        <span class="connection-status ${state.connectionState.connected ? 'connected' : 'disconnected'}"></span>
        <span id="${prefix}connection-status">${state.connectionState.connected ? 'Connected to server' : 'Disconnected'}</span>
      </div>
    </div>
  `;
  
  // Get the elements
  const elements = {
    progressBar: document.getElementById(`${prefix}progress-bar`),
    progressStatus: document.getElementById(`${prefix}progress-status`),
    progressStats: document.getElementById(`${prefix}progress-stats`),
    // progressPercentage removed - using progress bar text instead
    etaDisplay: document.getElementById(`${prefix}eta-display`),
    elapsedTime: document.getElementById(`${prefix}elapsed-time`),
    progressRateDisplay: document.getElementById(`${prefix}progress-rate`),
    connectionStatus: document.getElementById(`${prefix}connection-status`)
  };
  
  return elements;
}

/**
 * Format statistic value based on key
 * @param {string} key - Statistic key
 * @param {any} value - Statistic value
 * @returns {string} - Formatted value
 */
function formatStatValue(key, value) {
  // Handle bytes
  if (key.includes('bytes') || key === 'total_bytes' || key.endsWith('_size')) {
    return formatBytes(value);
  }

  // Handle durations
  if (key.includes('duration') || key.includes('time') || key.endsWith('_seconds')) {
    return formatDuration(value * 1000); // Convert seconds to milliseconds
  }

  // Handle percentages
  if (key.includes('percent') || key.includes('progress')) {
    return `${Math.round(value)}%`;
  }

  // Handle rates
  if (key.includes('rate') || key.includes('speed')) {
    return `${value}/s`;
  }

  // Default formatting
  return value.toString();
}

/**
 * Format statistic label
 * @param {string} key - Statistic key
 * @returns {string} - Formatted label
 */
function formatStatLabel(key) {
  // Replace underscores with spaces and capitalize first letter of each word
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Update stats display
 * @param {HTMLElement} element - Stats container element
 * @param {Object} stats - Statistics object
 */
function updateStatsDisplay(element, stats) {
  if (!element || !stats) return;

  try {
    // Create a formatted display of the stats
    let html = '<div class="stats-container p-2">';
    
    // Handle different types of stats
    if (stats.total_files !== undefined) {
      // File processing stats
      html += `
        <div class="row">
          <div class="col-md-6 mb-2">
            <span class="badge bg-primary">Files: ${stats.total_files || 0}</span>
            <span class="badge bg-success mx-1">Processed: ${stats.processed_files || 0}</span>
            <span class="badge bg-warning mx-1">Skipped: ${stats.skipped_files || 0}</span>
            <span class="badge bg-danger mx-1">Errors: ${stats.error_files || 0}</span>
          </div>
          <div class="col-md-6 mb-2">
            <span class="badge bg-info">Chunks: ${stats.total_chunks || 0}</span>
            ${stats.total_bytes ? `<span class="badge bg-secondary mx-1">Size: ${formatBytes(stats.total_bytes)}</span>` : ''}
          </div>
        </div>
      `;
      
      // Show duration if available
      if (stats.duration_seconds || stats.total_duration_seconds) {
        const duration = stats.duration_seconds || stats.total_duration_seconds || 0;
        html += `<div class="small text-muted">Duration: ${formatDuration(duration * 1000)}</div>`;
      }
      
      // Add current file if available
      if (stats.current_file) {
        html += `
          <div class="text-truncate small mt-2 current-file">
            <i class="fas fa-file-alt me-1"></i> ${stats.current_file}
          </div>
        `;
      }
    } else if (stats.pdf_downloads && Array.isArray(stats.pdf_downloads)) {
      // PDF download stats
      const completed = stats.pdf_downloads.filter(pdf => pdf.status === 'success').length;
      const downloading = stats.pdf_downloads.filter(pdf => pdf.status === 'downloading').length;
      const processing = stats.pdf_downloads.filter(pdf => pdf.status === 'processing').length;
      const failed = stats.pdf_downloads.filter(pdf => pdf.status === 'error').length;
      const total = stats.pdf_downloads.length;
      
      html += `
        <div class="row">
          <div class="col-12 mb-2">
            <span class="badge bg-primary">PDFs: ${total}</span>
            <span class="badge bg-success mx-1">Downloaded: ${completed}</span>
            <span class="badge bg-info mx-1">Downloading: ${downloading}</span>
            <span class="badge bg-secondary mx-1">Processing: ${processing}</span>
            <span class="badge bg-danger mx-1">Failed: ${failed}</span>
          </div>
        </div>
      `;
      
      // Add the most recent 3 PDFs being processed
      const recentPdfs = stats.pdf_downloads
        .filter(pdf => pdf.status === 'downloading' || pdf.status === 'processing')
        .slice(0, 3);
      
      if (recentPdfs.length > 0) {
        html += '<div class="pdf-list small">';
        recentPdfs.forEach(pdf => {
          const fileName = pdf.fileName || getFileNameFromPath(pdf.url || '');
          html += `
            <div class="pdf-download-item">
              <div class="d-flex justify-content-between">
                <div class="text-truncate" title="${fileName}">
                  <i class="fas fa-file-pdf me-1"></i> ${fileName}
                </div>
                <span class="badge ${pdf.status === 'downloading' ? 'bg-info' : 'bg-secondary'}">${pdf.status}</span>
              </div>
              ${pdf.progress ? `<div class="progress">
                <div class="progress-bar ${pdf.status === 'downloading' ? 'bg-info' : 'bg-secondary'}" style="width: ${pdf.progress}%"></div>
              </div>` : ''}
            </div>
          `;
        });
        html += '</div>';
      }
      
      // Show summary of completed PDFs
      if (completed > 0) {
        html += `<div class="text-muted small mt-2">Completed PDFs: ${completed} files</div>`;
      }
    } else if (stats.tables_extracted !== undefined || stats.pdf_pages_processed !== undefined) {
      // PDF processing stats
      html += `<div class="row">`;
      
      // PDF document info
      if (stats.pdf_scanned_count !== undefined || stats.document_type !== undefined) {
        html += `<div class="col-12 mb-2">
          ${stats.document_type ? `<span class="badge bg-info">Type: ${stats.document_type}</span> ` : ''}
          ${stats.pdf_pages_processed ? `<span class="badge bg-primary mx-1">Pages: ${stats.pdf_pages_processed}</span>` : ''}
          ${stats.pdf_ocr_applied_count > 0 ? `<span class="badge bg-warning mx-1">OCR Applied</span>` : ''}
          ${stats.pdf_scanned_count > 0 ? `<span class="badge bg-secondary mx-1">Scanned</span>` : ''}
        </div>`;
      }
      
      // Extraction stats
      html += `<div class="col-12 mb-2">
        ${stats.tables_extracted ? `<span class="badge bg-success">Tables: ${stats.tables_extracted}</span> ` : ''}
        ${stats.references_extracted ? `<span class="badge bg-primary mx-1">References: ${stats.references_extracted}</span>` : ''}
        ${stats.total_extraction_time ? `<span class="badge bg-info mx-1">Extract Time: ${formatDuration(stats.total_extraction_time * 1000)}</span>` : ''}
      </div>`;
      
      html += `</div>`;
      
      // Show specific stage progress if available
      if (stats.stage) {
        html += `<div class="small text-muted mt-2">Current stage: ${stats.stage}</div>`;
      }
    } else {
      // Generic stats - display key-value pairs
      html += '<div class="row">';
      
      // Process stats keys, show the most important ones first
      const priorityKeys = ['total_files', 'processed_files', 'total_chunks', 'total_bytes', 'duration_seconds'];
      const processedKeys = new Set();
      
      // First show priority keys
      priorityKeys.forEach(key => {
        if (stats[key] !== undefined) {
          const value = formatStatValue(key, stats[key]);
          const label = formatStatLabel(key);
          
          html += `
            <div class="col-6 col-md-4 mb-1">
              <small>${label}:</small>
              <span class="fw-bold">${value}</span>
            </div>
          `;
          
          processedKeys.add(key);
        }
      });
      
      // Then show remaining keys
      Object.entries(stats).forEach(([key, value]) => {
        // Skip already processed keys, hidden keys, and complex objects
        if (processedKeys.has(key) || key.startsWith('_') || key.startsWith('hidden_') || 
            typeof value === 'object' || typeof value === 'function') {
          return;
        }
        
        const formattedValue = formatStatValue(key, value);
        const label = formatStatLabel(key);
        
        html += `
          <div class="col-6 col-md-4 mb-1">
            <small>${label}:</small>
            <span class="fw-bold">${formattedValue}</span>
          </div>
        `;
        
        processedKeys.add(key);
      });
      
      html += '</div>';
    }
    
    html += '</div>';
    
    // Update the element
    element.innerHTML = html;
  } catch (error) {
    console.error("Error updating stats display:", error);
    // Provide simple fallback
    try {
      element.innerHTML = '<div class="alert alert-warning">Error displaying stats</div>';
    } catch (e) {
      // Ignore if can't even update with error message
    }
  }
}

/**
 * Set up progress tracking for a task
 * @param {string} taskId - Unique task ID
 * @param {Object} options - Setup options
 * @param {string} options.elementPrefix - Prefix for DOM elements
 * @param {boolean} options.saveToSessionStorage - Whether to save task info to session storage
 * @param {string} options.taskType - Type of task (for session storage)
 * @returns {Object} - Progress handler APIs
 */
function setupTaskProgress(taskId, options = {}) {
  if (!taskId) {
    console.error('Task ID required for progress tracking');
    return null;
  }
  
  console.log(`Setting up progress tracking for task ${taskId}`);
  
  // Create task info
  const taskInfo = {
    id: taskId,
    progress: 0,
    status: 'pending',
    startTime: getTimestamp(),
    elementPrefix: options.elementPrefix || '',
    type: options.taskType || 'unknown',
    options
  };
  
  // Save to active tasks map
  state.activeTasks.set(taskId, taskInfo);
  
  // Save to session storage if requested
  if (options.saveToSessionStorage && options.taskType) {
    sessionStorage.setItem('ongoingTaskId', taskId);
    sessionStorage.setItem('ongoingTaskType', options.taskType);
    sessionStorage.setItem('taskStartTime', taskInfo.startTime.toString());
    console.log(`Saved task ${taskId} (${options.taskType}) to session storage`);
  }
  
  // Try to set up initial UI elements
  const elements = getUIElements(options.elementPrefix);
  
  // Create progress UI if container exists but progress bar doesn't
  if (!elements.progressBar) {
    const containerPrefix = options.elementPrefix ? 
      `${options.elementPrefix}-progress-container` : 
      'progress-container';
    
    const container = document.getElementById(containerPrefix);
    if (container) {
      createProgressUI(container.id, options.elementPrefix || '');
    }
  }
  
  // Initialize progress rates tracking
  state.progressRates.set(taskId, []);
  state.lastUpdateTimes.set(taskId, getTimestamp());
  
  // Initialize task progress info
  state.taskProgressInfo.set(taskId, {
    startTime: getTimestamp(),
    updateCount: 0,
    totalProgressChange: 0,
    avgProgressRate: 0
  });
  
  // Set up status polling
  if (window.socket && state.connectionState.connected) {
    // Request initial status
    window.socket.emit('request_task_status', {
      task_id: taskId,
      timestamp: Date.now() / 1000
    });
  } else {
    // Start manual polling
    startManualStatusPolling(taskId);
  }
  
  // Set up task event handlers
  setupTaskEventHandlers(taskId, options);
  
  // Return handler functions
  return {
    /**
     * Update progress for the task
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} message - Status message
     * @param {Object} stats - Optional statistics
     */
    updateProgress: (progress, message, stats = null) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main update method
      updateTaskProgress(taskId, progress, message, stats);
    },
    
    /**
     * Mark task as completed
     * @param {Object} result - Task completion result
     */
    complete: (result) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main complete method
      completeTask(taskId, result);
    },
    
    /**
     * Mark task as failed
     * @param {Error|string} error - Error that occurred
     * @param {Object} data - Additional error data
     */
    error: (error, data = {}) => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main error method
      errorTask(taskId, error, data);
    },
    
    /**
     * Cancel the task
     */
    cancel: () => {
      if (!state.activeTasks.has(taskId)) return;
      
      // Call the main cancel method
      cancelTask(taskId);
    },
    
    /**
     * Get current task status
     * @returns {Object} - Task status info
     */
    getStatus: () => {
      if (!state.activeTasks.has(taskId)) {
        return { status: 'unknown', message: 'Task not found' };
      }
      
      const task = state.activeTasks.get(taskId);
      return {
        id: taskId,
        progress: task.progress,
        status: task.status,
        message: task.message,
        startTime: task.startTime,
        lastUpdate: task.lastUpdate,
        endTime: task.endTime,
        stats: task.stats || {}
      };
    }
  };
}

/**
 * Set up event handlers for a specific task
 * @param {string} taskId - Task ID
 * @param {Object} options - Task options
 */
function setupTaskEventHandlers(taskId, options) {
  const handlers = {
    socketHandlers: {},
    eventRegistry: {},
    dom: {}
  };
  
  // Set up Socket.IO handlers if available
  if (window.socket) {
    // Progress update handler
    const progressHandler = (data) => {
      if (data.task_id === taskId) {
        updateTaskProgress(taskId, data.progress, data.message, data.stats);
      }
    };
    
    // Task completed handler
    const completedHandler = (data) => {
      if (data.task_id === taskId) {
        completeTask(taskId, data);
      }
    };
    
    // Task error handler
    const errorHandler = (data) => {
      if (data.task_id === taskId) {
        errorTask(taskId, data.error || 'Unknown error', data);
      }
    };
    
    // Task cancelled handler
    const cancelledHandler = (data) => {
      if (data.task_id === taskId) {
        cancelTask(taskId);
      }
    };
    
    // Register handlers
    // CRITICAL FIX: Register ALL possible progress event names
    const progressEvents = [
      'progress_update',
      'task_progress',
      'file_processing_progress',
      'playlist_progress',
      'web_scraping_progress',
      'pdf_download_progress',
      'pdf_processing_progress'
    ];
    
    // Register all progress events
    progressEvents.forEach(event => {
      window.socket.on(event, progressHandler);
      handlers.socketHandlers[event] = progressHandler;
    });
    
    // window.socket.on('progress_update', progressHandler);
    window.socket.on('task_progress', progressHandler);
    window.socket.on('task_completed', completedHandler);
    window.socket.on('task_error', errorHandler);
    window.socket.on('task_cancelled', cancelledHandler);
    
    // Also register type-specific handlers if task type is provided
    if (options.taskType) {
      window.socket.on(`${options.taskType}_progress`, progressHandler);
      window.socket.on(`${options.taskType}_completed`, completedHandler);
      window.socket.on(`${options.taskType}_error`, errorHandler);
      window.socket.on(`${options.taskType}_cancelled`, cancelledHandler);
    }
    
    // Store handlers for cleanup
    handlers.socketHandlers = {
      'progress_update': progressHandler,
      'task_progress': progressHandler,
      'task_completed': completedHandler,
      'task_error': errorHandler,
      'task_cancelled': cancelledHandler
    };
    
    // Add type-specific handlers if applicable
    if (options.taskType) {
      handlers.socketHandlers[`${options.taskType}_progress`] = progressHandler;
      handlers.socketHandlers[`${options.taskType}_completed`] = completedHandler;
      handlers.socketHandlers[`${options.taskType}_error`] = errorHandler;
      handlers.socketHandlers[`${options.taskType}_cancelled`] = cancelledHandler;
    }
  }
  
  // Set up DOM event handlers if needed
  const prefix = options.elementPrefix ? `${options.elementPrefix}-` : '';
  const cancelButton = document.getElementById(`${prefix}cancel-btn`);
  
  if (cancelButton) {
    const cancelHandler = (e) => {
      e.preventDefault();
      cancelTask(taskId);
    };
    
    cancelButton.addEventListener('click', cancelHandler);
    
    handlers.dom[`#${prefix}cancel-btn`] = {
      'click': cancelHandler
    };
  }
  
  // Store all handlers for cleanup later
  state.eventHandlers.set(taskId, handlers);
}

/**
 * Cancel tracking for a specific task
 * @param {string} taskId - Task ID to stop tracking
 * @returns {boolean} - Whether cancellation was successful
 */
function cancelTracking(taskId) {
  try {
    console.log(`Cancelling progress tracking for task ${taskId}`);
    
    // Try to get the tracker
    const tracker = activeTrackers.get(taskId);
    if (tracker) {
      // Use the tracker's destroy method if it exists
      if (typeof tracker.destroy === 'function') {
        tracker.destroy();
      }
      
      // Remove from active trackers map
      activeTrackers.delete(taskId);
    }
    
    // Clean up event listeners
    cleanupEventListeners(taskId);
    
    // Stop status polling if it exists
    stopStatusPolling(taskId);
    
    // Clean up any timeouts
    if (state.completionMonitoring && state.completionMonitoring.timeoutIds) {
      state.completionMonitoring.timeoutIds.forEach(id => clearTimeout(id));
      state.completionMonitoring.timeoutIds.clear();
    }
    
    // Remove from completed tasks set to allow re-tracking
    if (state.completedTaskIds) {
      state.completedTaskIds.delete(taskId);
    }
    
    // Remove from progress tracking maps
    state.progressRates.delete(taskId);
    state.lastUpdateTimes.delete(taskId);
    state.lastProgressValues.delete(taskId);
    state.taskProgressInfo.delete(taskId);
    
    // If socket is available, emit event to server
    if (window.socket && state.connectionState.connected) {
      window.socket.emit('cancel_tracking', {
        task_id: taskId,
        timestamp: Date.now() / 1000
      });
    }
    
    console.log(`Progress tracking cancelled for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`Error cancelling tracking for task ${taskId}:`, error);
    return false;
  }
}

/**
 * Track progress from socket events
 * @param {string} taskId - Task ID
 * @param {Object} options - Options
 * @returns {Object} - Progress tracking functions
 */
function trackProgress(taskId, options = {}) {
  if (!taskId) {
    console.error('Task ID required for progress tracking');
    return null;
  }

  // Set up progress tracking
  const progressHandler = setupTaskProgress(taskId, options);

  // Request initial status via socket if available
  if (window.socket && state.connectionState.connected) {
    try {
      window.socket.emit('request_task_status', {
        task_id: taskId,
        timestamp: Date.now() / 1000
      });
    } catch (err) {
      console.warn('Error requesting initial status via socket:', err);
    }
  }

  return {
    ...progressHandler,
    
    /**
     * Cancel tracking and cleanup event handlers
     */
    cancelTracking: () => {
      // Use the exported cancelTracking function
      return cancelTracking(taskId);
    }
  };
}

/**
 * Update task's progress
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {Object} stats - Optional statistics
 */
function updateTaskProgress(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update unknown task: ${taskId}`);
    return;
  }

  const task = state.activeTasks.get(taskId);

  // Special handling for 99-100% progress transitions
  // If progress is 99+ but less than 100, and task reported "completed", force to 100%
  if (progress >= 99 && progress < 100) {
    const isCompleting = 
      stats?.status === "completed" || 
      task.status === "completed" ||
      (stats && stats.processed_files >= stats.total_files) ||
      (message && (
        message.toLowerCase().includes("complet") ||
        message.toLowerCase().includes("done") ||
        message.toLowerCase().includes("finish")
      ));
    
    if (isCompleting) {
      console.log(`Force-completing task ${taskId} at ${progress}% with completed status`);
      progress = 100;
    }
  }

  // Store the last reported progress value to prevent UI flicker
  const lastProgress = state.lastProgressValues.get(taskId) || 0;

  // Avoid updating to a lower progress value (prevent backward progress)
  // But allow it if we're at 99% and receiving an update with status=completed
  const isCompletingUpdate = progress >= 99 && 
                        (stats && stats.status === "completed" || 
                        task.status === "completed");
                        
  // CRITICAL FIX: Removed backward progress prevention
  // // CRITICAL FIX: Removed backward progress prevention
  // console.warn(`Ignoring backward progress update for task ${taskId}: ${progress}% (last was ${lastProgress}%)`);
  // return;

  // Update last progress value
  state.lastProgressValues.set(taskId, progress);

  // Update task info
  task.progress = progress;
  task.message = message;
  task.lastUpdate = getTimestamp();
  task.status = stats?.status || 'running';

  if (stats) task.stats = stats;

  // Update progress rates for ETA calculation
  updateProgressRate(taskId, progress);

  // Update UI
  updateProgressUI(taskId, progress, message, stats);

  // If progress reaches 100% or status is completed, mark as completed
  if ((progress >= 100 || (stats && stats.status === "completed")) && 
      task.status !== 'completed' && 
      !state.completedTaskIds.has(taskId)) {
    
    // CRITICAL FIX: Complete immediately without delay
    console.log(`Task ${taskId} reached 100% - completing immediately`);
    completeTask(taskId, {
      ...task,
      output_file: task.outputPath || stats?.output_file || null
    });
  }
}

/**
 * Update progress UI for a task
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message
 * @param {Object} stats - Optional statistics
 * @returns {boolean} - Success
 */
function updateProgressUI(taskId, progress, message, stats = null) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot update UI for unknown task: ${taskId}`);
    return false;
  }

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Update task progress info counter
  const info = state.taskProgressInfo.get(taskId) || {
    startTime: getTimestamp(),
    updateCount: 0,
    totalProgressChange: 0,
    avgProgressRate: 0
  };
  info.updateCount++;
  state.taskProgressInfo.set(taskId, info);
  
  // Apply progress smoothing for early stages
  // CRITICAL FIX: Direct progress assignment
  const smoothedProgress = Math.max(0, Math.min(100, progress));

  // Update progress bar with sanity checks
  if (elements.progressBar) {
    // Set minimum progress of 1% to show something is happening
    const displayProgress = Math.max(1, smoothedProgress);
    
    // Apply animated progress update
    applyProgressBarAnimation(elements.progressBar, 
                            parseFloat(elements.progressBar.style.width) || 0, 
                            displayProgress);
    
    // Update contextual classes based on progress
    elements.progressBar.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'progress-bar-low', 'progress-bar-complete');
    
    // Add pulsing animation for low progress
    if (smoothedProgress <= 15) {
      elements.progressBar.classList.add('progress-bar-low');
    } else if (smoothedProgress >= 100) {
      elements.progressBar.classList.add('bg-success', 'progress-bar-complete');
    } else if (smoothedProgress >= 75) {
      elements.progressBar.classList.add('bg-info');
    } else if (smoothedProgress >= 50) {
      elements.progressBar.classList.add('bg-primary');
    } else if (smoothedProgress >= 25) {
      elements.progressBar.classList.add('bg-primary');
    } else {
      // Keep default primary color for early progress
      elements.progressBar.classList.add('bg-primary');
    }
  }

  // Progress percentage is now shown inside the progress bar itself

  // Update status message
  if (elements.progressStatus && message) {
    elements.progressStatus.textContent = message;
  }

  // Update ETA display
  if (elements.etaDisplay) {
    const eta = calculateETA(taskId, smoothedProgress);
    if (eta.timeRemaining) {
      elements.etaDisplay.textContent = `ETA: ${formatDuration(eta.timeRemaining)}`;
      elements.etaDisplay.classList.remove('d-none');
    } else if (smoothedProgress >= 100) {
      elements.etaDisplay.textContent = 'Complete';
      elements.etaDisplay.classList.remove('d-none');
    } else if (smoothedProgress <= 0) {
      elements.etaDisplay.classList.add('d-none');
    }
  }

  // Update elapsed time
  if (elements.elapsedTime && task.startTime) {
    const elapsed = getTimestamp() - task.startTime;
    elements.elapsedTime.textContent = `Elapsed: ${formatDuration(elapsed)}`;
  }
  
  // Update progress rate display if available
  if (elements.progressRateDisplay && task.startTime) {
    const elapsed = getTimestamp() - task.startTime;
    if (elapsed > 5000 && smoothedProgress > 0) { // Only show after 5 seconds and some progress
      const rate = smoothedProgress / (elapsed / 1000);
      elements.progressRateDisplay.textContent = `Rate: ${rate.toFixed(1)}%/s`;
      elements.progressRateDisplay.classList.remove('d-none');
    }
  }

  // Update stats if available
  if (elements.progressStats && stats) {
    updateStatsDisplay(elements.progressStats, stats);
  }

  return true;
}

/**
 * Complete a task
 * @param {string} taskId - Task ID
 * @param {Object} result - Task result
 */
function completeTask(taskId, result) {
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot complete unknown task: ${taskId}`);
    return;
  }

  // Check if task has already been completed to prevent duplicates
  if (state.completedTaskIds.has(taskId)) {
    console.log(`Task ${taskId} already marked as completed, ignoring duplicate completion event`);
    return;
  }

  // Mark this task as completed to prevent duplicate completions
  state.completedTaskIds.add(taskId);

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Set task as completed
  task.progress = 100;
  task.status = 'completed';
  task.result = result;
  task.endTime = getTimestamp();

  // Process stats if available
  if (result && result.stats) {
    // Handle string stats objects (parse if needed)
    if (typeof result.stats === 'string') {
      try {
        task.stats = JSON.parse(result.stats);
      } catch (e) {
        console.warn(`Could not parse stats string: ${e}`);
        task.stats = { error: "Could not parse stats" };
      }
    } else {
      task.stats = result.stats;
    }
  }

  // Update progress bar to 100%
  if (elements.progressBar) {
    // Apply animated progress to 100%
    applyProgressBarAnimation(elements.progressBar, 
                            parseFloat(elements.progressBar.style.width) || 0, 
                            100);
    
    elements.progressBar.classList.remove('bg-danger', 'bg-warning', 'progress-bar-low');
    elements.progressBar.classList.add('bg-success', 'progress-bar-complete');
  }

  // Update status message
  if (elements.progressStatus) {
    const completionMessage = result.message || "Task completed successfully";
    elements.progressStatus.textContent = completionMessage;
    elements.progressStatus.classList.remove('text-danger', 'text-warning');
    elements.progressStatus.classList.add('text-success');
  }

  // Update ETA display
  if (elements.etaDisplay) {
    elements.etaDisplay.textContent = 'Complete';
    elements.etaDisplay.classList.add('text-success');
  }

  // Update elapsed time
  if (elements.elapsedTime) {
    const elapsed = getTimestamp() - task.startTime;
    elements.elapsedTime.textContent = `Total time: ${formatDuration(elapsed)}`;
  }

  // Update stats display if we have result stats
  if (elements.progressStats && result && result.stats) {
    // Force the stats container to be visible
    elements.progressStats.style.display = 'block';
    elements.progressStats.classList.remove('d-none');
    updateStatsDisplay(elements.progressStats, result.stats);
  } else if (elements.progressStats) {
    // Even without stats, show completion summary
    elements.progressStats.style.display = 'block';
    elements.progressStats.classList.remove('d-none');
    elements.progressStats.innerHTML = `
      <div class="alert alert-success">
        <i class="fas fa-check-circle me-2"></i>
        Task completed successfully!
        <div class="mt-2">Duration: ${formatDuration(task.endTime - task.startTime)}</div>
      </div>
    `;
  }

  // Stop status polling
  stopStatusPolling(taskId);

  // Clear session storage
  if (task.options && task.options.saveToSessionStorage) {
    // Record completion time to prevent reload loops
    sessionStorage.setItem('taskCompletionTime', getTimestamp().toString());
    
    // Remove task tracking
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
    console.log(`Cleared session storage for completed task ${taskId}`);
  }

  // Add to history
  addTaskToHistory(taskId, result, 'completed');

  // Clean up event listeners
  cleanupEventListeners(taskId);
  
  // Remove from active tasks after a delay
  setTimeout(() => {
    state.activeTasks.delete(taskId);
  }, 1000);
}

/**
 * Mark a task as failed
 * @param {string} taskId - Task ID
 * @param {Error|string} error - Error that occurred
 * @param {Object} data - Additional error data
 */
function errorTask(taskId, error, data = {}) {
  // Enhanced validation
  if (!taskId) {
    console.error("Cannot mark error - no task ID provided");
    return;
  }
  
  if (!state.activeTasks.has(taskId)) {
    console.warn(`Cannot mark unknown task as error: ${taskId}`);
    return;
  }

  // Skip if this task is already marked with an error
  if (state.taskErrors.has(taskId)) {
    console.log(`Task ${taskId} already has an error, skipping duplicate error`);
    return;
  }
  
  // Mark this task as having an error
  state.taskErrors.set(taskId, {
    error: error,
    timestamp: getTimestamp(),
    data: data
  });

  const task = state.activeTasks.get(taskId);
  const elements = getUIElements(task.elementPrefix);

  // Update task state
  task.status = 'error';
  task.error = error;
  task.errorData = data;
  task.endTime = getTimestamp();

  // Update progress bar
  if (elements.progressBar) {
    elements.progressBar.classList.remove('bg-primary', 'bg-success', 'bg-warning', 'progress-bar-low', 'progress-bar-complete');
    elements.progressBar.classList.add('bg-danger', 'progress-bar-error');
  }

  // Update status message
  if (elements.progressStatus) {
    const errorMessage = typeof error === 'string' ? error : 
                        (error.message || 'Unknown error');
    
    elements.progressStatus.textContent = `Error: ${errorMessage}`;
    elements.progressStatus.classList.remove('text-warning');
    elements.progressStatus.classList.add('text-danger');
  }

  // Update ETA display
  if (elements.etaDisplay) {
    elements.etaDisplay.textContent = 'Failed';
    elements.etaDisplay.classList.add('text-danger');
  }

  // Stop status polling
  stopStatusPolling(taskId);

  // Clear session storage
  if (task.options && task.options.saveToSessionStorage) {
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
  }

  // Add to history
  addTaskToHistory(taskId, {
    ...data,
    error: typeof error === 'string' ? error : (error.message || 'Unknown error')
 }, 'error');

 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Remove from active tasks after a delay
 setTimeout(() => {
   state.activeTasks.delete(taskId);
 }, 1000);
}

/**
* Cancel a task
* @param {string} taskId - Task ID
*/
function cancelTask(taskId) {
 if (!state.activeTasks.has(taskId)) {
   console.warn(`Cannot cancel unknown task: ${taskId}`);
   return;
 }

 const task = state.activeTasks.get(taskId);
 const elements = getUIElements(task.elementPrefix);

 // Update task state
 task.status = 'cancelled';
 task.endTime = getTimestamp();

 // Update progress bar
 if (elements.progressBar) {
   elements.progressBar.classList.remove('bg-primary', 'bg-success', 'bg-danger', 'progress-bar-low', 'progress-bar-complete');
   elements.progressBar.classList.add('bg-warning');
 }

 // Update status message
 if (elements.progressStatus) {
   elements.progressStatus.textContent = 'Task cancelled';
   elements.progressStatus.classList.remove('text-danger');
   elements.progressStatus.classList.add('text-warning');
 }

 // Update ETA display
 if (elements.etaDisplay) {
   elements.etaDisplay.textContent = 'Cancelled';
   elements.etaDisplay.classList.add('text-warning');
 }

 // Stop status polling
 stopStatusPolling(taskId);

 // Clear session storage
 if (task.options && task.options.saveToSessionStorage) {
   sessionStorage.removeItem('ongoingTaskId');
   sessionStorage.removeItem('ongoingTaskType');
   sessionStorage.removeItem('taskStartTime');
 }

 // Add to history
 addTaskToHistory(taskId, {}, 'cancelled');

 // Also try to send an API request to cancel the task on the server
 sendCancelRequest(taskId);

 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Remove from active tasks after a delay
 setTimeout(() => {
   state.activeTasks.delete(taskId);
 }, 1000);
}

/**
* Send cancel request to the server
* @param {string} taskId - Task ID
*/
async function sendCancelRequest(taskId) {
 try {
   // First try to cancel via socket
   if (window.socket && state.connectionState.connected) {
     window.socket.emit('cancel_task', { 
       task_id: taskId,
       timestamp: Date.now() / 1000,
       reason: 'User cancelled'
     });
   }
   
   // Also send an HTTP request as backup
   const response = await fetch(`/api/cancel_task/${taskId}`, {
     method: 'POST'
   });
   
   if (!response.ok) {
     console.warn(`Failed to send cancel request: ${response.status}`);
   }
 } catch (error) {
   console.error("Error sending cancel request:", error);
 }
}

/**
* Get task details
* @param {string} taskId - Task ID
* @returns {Object|null} - Task details or null if not found
*/
function getTaskDetails(taskId) {
 if (!state.activeTasks.has(taskId)) {
   return null;
 }
 
 const task = state.activeTasks.get(taskId);
 return {
   id: taskId,
   progress: task.progress,
   status: task.status,
   message: task.message,
   stats: task.stats || {},
   startTime: task.startTime,
   endTime: task.endTime,
   error: task.error,
   type: task.type
 };
}

/**
* Clear task history
*/
function clearTaskHistory() {
 state.completedTasks = [];
 state.failedTasks = [];
 saveTaskHistory();
}

/**
* Force reset a task's state - use with caution
* @param {string} taskId - Task ID
*/
function forceResetTask(taskId) {
 // Remove from active tasks
 state.activeTasks.delete(taskId);
 
 // Remove from completed tasks set
 state.completedTaskIds.delete(taskId);
 
 // Remove from error tasks map
 state.taskErrors.delete(taskId);
 
 // Stop any polling
 stopStatusPolling(taskId);
 
 // Clean up event listeners
 cleanupEventListeners(taskId);
 
 // Clear any intervals
 if (state.statusPollingIntervals.has(taskId)) {
   clearInterval(state.statusPollingIntervals.get(taskId));
   state.statusPollingIntervals.delete(taskId);
 }
 
 // Clear from progress rates
 state.progressRates.delete(taskId);
 state.lastUpdateTimes.delete(taskId);
 state.lastProgressValues.delete(taskId);
 state.taskProgressInfo.delete(taskId);
 
 // Clear from session storage if it matches
 const currentTaskId = sessionStorage.getItem('ongoingTaskId');
 if (currentTaskId === taskId) {
   sessionStorage.removeItem('ongoingTaskId');
   sessionStorage.removeItem('ongoingTaskType');
   sessionStorage.removeItem('taskStartTime');
 }
}

/**
* Reset all state - use with caution
*/
function resetAllState() {
 // Clear active tasks
 state.activeTasks.clear();
 
 // Clear completed tasks set
 state.completedTaskIds.clear();
 
 // Clear error tasks map
 state.taskErrors.clear();
 
 // Stop all polling
 for (const intervalId of state.statusPollingIntervals.values()) {
   clearInterval(intervalId);
 }
 state.statusPollingIntervals.clear();
 
 // Clear all event listeners
 for (const taskId of state.eventHandlers.keys()) {
   cleanupEventListeners(taskId);
 }
 
 // Clear progress tracking
 state.progressRates.clear();
 state.lastUpdateTimes.clear();
 state.lastProgressValues.clear();
 state.taskProgressInfo.clear();
 
 // Clear task history
 state.completedTasks = [];
 state.failedTasks = [];
 saveTaskHistory();
 
 // Clear session storage
 sessionStorage.removeItem('ongoingTaskId');
 sessionStorage.removeItem('ongoingTaskType');
 sessionStorage.removeItem('taskStartTime');
 
 console.log("Progress handler state reset");
}

// Export the module
export default initProgressHandler;
export {
 createProgressTracker,
 setupTaskProgress,
 trackProgress,
 updateTaskProgress,
 updateProgressUI,
 completeTask,
 errorTask,
 cancelTask,
 createProgressUI,
 formatDuration,
 calculateETA,
 formatBytes,
 updateStatsDisplay,
 cancelTracking,
 // New v4.0 exports
 showNotification,
 testBackendConnectivity,
 getHealthStatus
};