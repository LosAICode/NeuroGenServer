/**
 * NeuroGen Progress Handler v5.0 - SocketIO Aligned Architecture
 * 
 * Streamlined progress tracking system fully aligned with SocketIO events.
 * Designed for perfect integration with the Blueprint architecture and
 * real-time progress updates from backend task execution.
 * 
 * Core Features:
 * - Direct SocketIO event integration
 * - Real-time progress tracking
 * - ETA calculation and statistics
 * - Error handling and recovery
 * - Configuration-driven design
 * - Cross-module coordination
 * - Session persistence
 * 
 * @module utils/progressHandler
 * @version 5.0.0 - SocketIO Architecture Alignment
 */

// Import centralized configuration
import { SOCKET_EVENTS, TASK_EVENTS } from '../config/socketEvents.js';
import { API_ENDPOINTS } from '../config/endpoints.js';
import { CONSTANTS, API_CONFIG } from '../config/constants.js';

// Progress Handler State
class ProgressHandlerState {
  constructor() {
    this.activeTasks = new Map();
    this.taskHistory = [];
    this.initialized = false;
    this.socketConnected = false;
    this.eventListeners = new Map();
    this.uiElements = new Map();
    this.lastUpdateTimes = new Map();
    this.progressRates = new Map();
    this.completedTasks = new Set();
  }

  reset() {
    this.activeTasks.clear();
    this.eventListeners.clear();
    this.lastUpdateTimes.clear();
    this.progressRates.clear();
    this.completedTasks.clear();
  }
}

// Global state instance
const state = new ProgressHandlerState();

/**
 * Enhanced notification system with fallbacks
 */
function showNotification(message, type = 'info', title = 'Progress Handler') {
  console.log(`%c[${title}] ${message}`, `color: ${type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#0d6efd'}; font-weight: bold;`);
  
  if (window.NeuroGen?.ui?.showToast) {
    window.NeuroGen.ui.showToast(title, message, type);
  } else if (window.showToast) {
    window.showToast(title, message, type);
  }
  
  if (type === 'error' && window.NeuroGen?.errorHandler) {
    window.NeuroGen.errorHandler.logError({
      module: 'progressHandler', message, severity: type
    });
  }
}

/**
 * Calculate ETA based on progress history
 */
function calculateETA(taskId, currentProgress) {
  const progressRates = state.progressRates.get(taskId);
  if (!progressRates || progressRates.length < 2 || currentProgress >= 100) {
    return { timeRemaining: null, completionTime: null, rate: 0 };
  }

  const avgRate = progressRates.reduce((sum, rate) => sum + rate, 0) / progressRates.length;
  if (avgRate <= 0) return { timeRemaining: null, completionTime: null, rate: 0 };

  const remainingProgress = Math.max(0, 100 - currentProgress);
  const timeRemaining = remainingProgress / avgRate;
  const completionTime = new Date(Date.now() + timeRemaining);

  return {
    timeRemaining,
    completionTime,
    rate: avgRate,
    formattedETA: formatDuration(timeRemaining)
  };
}

/**
 * Update progress rate calculation
 */
function updateProgressRate(taskId, progress) {
  const now = Date.now();
  const lastTime = state.lastUpdateTimes.get(taskId);
  const task = state.activeTasks.get(taskId);

  if (!lastTime || !task) {
    state.lastUpdateTimes.set(taskId, now);
    state.progressRates.set(taskId, []);
    return;
  }

  const timeDelta = now - lastTime;
  const progressDelta = progress - (task.progress || 0);

  if (timeDelta > 0 && progressDelta > 0) {
    const rate = progressDelta / timeDelta; // percent per millisecond
    const rates = state.progressRates.get(taskId) || [];
    
    rates.push(rate);
    if (rates.length > 10) rates.shift(); // Keep last 10 rates
    
    state.progressRates.set(taskId, rates);
  }

  state.lastUpdateTimes.set(taskId, now);
}

/**
 * Format duration in human-readable form
 */
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return 'Unknown';
  
  const seconds = Math.floor(milliseconds / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format file size for display
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Cache UI elements for a task
 */
function cacheUIElements(taskId, options = {}) {
  const elementPrefix = options.elementPrefix || '';
  const elements = {
    container: document.getElementById(options.targetElement || 'progress-container'),
    progressBar: document.getElementById(`${elementPrefix}progress-bar`),
    progressStatus: document.getElementById(`${elementPrefix}progress-status`),
    progressStats: document.getElementById(`${elementPrefix}progress-stats`),
    cancelBtn: document.getElementById(`${elementPrefix}cancel-btn`)
  };

  // Store elements for this task
  state.uiElements.set(taskId, elements);
  
  console.log(`📊 [ProgressHandler] UI elements cached for task ${taskId}:`, {
    container: !!elements.container,
    progressBar: !!elements.progressBar,
    progressStatus: !!elements.progressStatus,
    progressStats: !!elements.progressStats,
    cancelBtn: !!elements.cancelBtn
  });

  return elements;
}

/**
 * Update progress UI elements
 */
function updateProgressUI(taskId, data) {
  const elements = state.uiElements.get(taskId);
  if (!elements) {
    console.warn(`📊 [ProgressHandler] No UI elements cached for task ${taskId}`);
    return;
  }

  const progress = Math.min(100, Math.max(0, data.progress || 0));
  const message = data.message || `Processing... ${progress.toFixed(1)}%`;

  // Show progress container
  if (elements.container) {
    elements.container.style.display = 'block';
  }

  // Update progress bar
  if (elements.progressBar) {
    elements.progressBar.style.width = `${progress}%`;
    elements.progressBar.setAttribute('aria-valuenow', progress);
    elements.progressBar.textContent = `${progress.toFixed(1)}%`;
  }

  // Update status message
  if (elements.progressStatus) {
    elements.progressStatus.textContent = message;
  }

  // Update statistics
  if (elements.progressStats && data.stats) {
    updateStatsDisplay(taskId, data.stats, elements.progressStats);
  }

  console.log(`📊 [ProgressHandler] UI updated for ${taskId}: ${progress.toFixed(1)}%`);
}

/**
 * Update statistics display
 */
function updateStatsDisplay(taskId, stats, statsElement) {
  if (!statsElement) return;

  const eta = calculateETA(taskId, stats.progress || 0);
  const statsText = [
    stats.files_processed ? `Files: ${stats.files_processed}/${stats.total_files || 0}` : null,
    stats.total_size ? `Size: ${formatBytes(stats.total_size)}` : null,
    stats.elapsed_time ? `Time: ${formatDuration(stats.elapsed_time * 1000)}` : null,
    eta.formattedETA ? `ETA: ${eta.formattedETA}` : null
  ].filter(Boolean).join(' | ');

  statsElement.textContent = statsText;
  statsElement.style.display = 'block';
}

/**
 * Handle task started event
 */
function handleTaskStarted(data) {
  const taskId = data.task_id;
  console.log(`🚀 [ProgressHandler] Task started: ${taskId}`);

  // Create task record
  state.activeTasks.set(taskId, {
    id: taskId,
    type: data.task_type || 'unknown',
    startTime: Date.now(),
    progress: 0,
    status: 'started',
    message: data.message || 'Task started'
  });

  // Update UI if elements are cached
  const elements = state.uiElements.get(taskId);
  if (elements) {
    updateProgressUI(taskId, { progress: 0, message: 'Starting...' });
  }

  showNotification(`Task started: ${taskId}`, 'info');
}

/**
 * Handle progress update event
 */
function handleProgressUpdate(data) {
  const taskId = data.task_id;
  const task = state.activeTasks.get(taskId);
  
  if (!task) {
    console.warn(`📊 [ProgressHandler] Progress update for unknown task: ${taskId}`);
    return;
  }

  console.log(`📊 [ProgressHandler] Progress update for ${taskId}:`, data);

  // Update progress rate tracking
  updateProgressRate(taskId, data.progress);

  // Update task record
  task.progress = data.progress;
  task.message = data.message;
  task.stats = data.stats;
  task.lastUpdate = Date.now();
  state.activeTasks.set(taskId, task);

  // Update UI
  updateProgressUI(taskId, data);
}

/**
 * Handle task completion event
 */
function handleTaskCompleted(data) {
  const taskId = data.task_id;
  const task = state.activeTasks.get(taskId);
  
  if (!task) {
    console.warn(`📊 [ProgressHandler] Completion for unknown task: ${taskId}`);
    return;
  }

  console.log(`✅ [ProgressHandler] Task completed: ${taskId}`);

  // Prevent duplicate completions
  if (state.completedTasks.has(taskId)) {
    console.log(`📊 [ProgressHandler] Task ${taskId} already marked as completed`);
    return;
  }

  // Mark as completed
  state.completedTasks.add(taskId);
  task.status = 'completed';
  task.progress = 100;
  task.endTime = Date.now();
  task.completionData = data;

  // Final UI update
  updateProgressUI(taskId, {
    progress: 100,
    message: data.message || 'Completed successfully!',
    stats: data.stats
  });

  // Move to history
  state.taskHistory.push(task);
  if (state.taskHistory.length > 50) {
    state.taskHistory.shift();
  }

  // Clean up
  setTimeout(() => {
    state.activeTasks.delete(taskId);
    cleanupTask(taskId);
  }, 5000); // Keep UI visible for 5 seconds

  showNotification(`Task completed: ${taskId}`, 'success');
}

/**
 * Handle task error event
 */
function handleTaskError(data) {
  const taskId = data.task_id;
  console.error(`❌ [ProgressHandler] Task error: ${taskId}`, data);

  const task = state.activeTasks.get(taskId);
  if (task) {
    task.status = 'error';
    task.error = data.error;
    task.endTime = Date.now();
  }

  // Update UI to show error
  const elements = state.uiElements.get(taskId);
  if (elements) {
    if (elements.progressStatus) {
      elements.progressStatus.textContent = `Error: ${data.error || 'Unknown error'}`;
      elements.progressStatus.className = 'text-danger';
    }
  }

  showNotification(`Task error: ${data.error || 'Unknown error'}`, 'error');
  
  // Clean up after delay
  setTimeout(() => {
    cleanupTask(taskId);
  }, 10000);
}

/**
 * Handle task cancellation event
 */
function handleTaskCancelled(data) {
  const taskId = data.task_id;
  console.log(`🚫 [ProgressHandler] Task cancelled: ${taskId}`);

  const task = state.activeTasks.get(taskId);
  if (task) {
    task.status = 'cancelled';
    task.endTime = Date.now();
  }

  // Update UI
  const elements = state.uiElements.get(taskId);
  if (elements) {
    if (elements.progressStatus) {
      elements.progressStatus.textContent = 'Cancelled';
      elements.progressStatus.className = 'text-warning';
    }
  }

  showNotification(`Task cancelled: ${taskId}`, 'warning');
  
  setTimeout(() => {
    cleanupTask(taskId);
  }, 3000);
}

/**
 * Clean up task resources
 */
function cleanupTask(taskId) {
  console.log(`🧹 [ProgressHandler] Cleaning up task: ${taskId}`);
  
  state.activeTasks.delete(taskId);
  state.lastUpdateTimes.delete(taskId);
  state.progressRates.delete(taskId);
  
  // Remove event listeners
  const listeners = state.eventListeners.get(taskId);
  if (listeners) {
    listeners.forEach(removeListener => removeListener());
    state.eventListeners.delete(taskId);
  }
  
  // Hide UI elements
  const elements = state.uiElements.get(taskId);
  if (elements?.container) {
    elements.container.style.display = 'none';
  }
  
  state.uiElements.delete(taskId);
}

/**
 * Setup SocketIO event listeners
 */
function setupSocketEventListeners() {
  if (!window.socket) {
    console.warn('📊 [ProgressHandler] Socket not available, retrying in 1 second...');
    setTimeout(setupSocketEventListeners, 1000);
    return;
  }

  console.log('📡 [ProgressHandler] Setting up SocketIO event listeners...');

  // Task lifecycle events
  window.socket.on(TASK_EVENTS.STARTED, handleTaskStarted);
  window.socket.on(TASK_EVENTS.PROGRESS, handleProgressUpdate);
  window.socket.on(TASK_EVENTS.COMPLETED, handleTaskCompleted);
  window.socket.on(TASK_EVENTS.ERROR, handleTaskError);
  
  // Cancellation events
  window.socket.on('task_cancelled', handleTaskCancelled);
  
  // Connection events
  window.socket.on('connect', () => {
    state.socketConnected = true;
    console.log('📡 [ProgressHandler] Socket connected');
  });
  
  window.socket.on('disconnect', () => {
    state.socketConnected = false;
    console.log('📡 [ProgressHandler] Socket disconnected');
  });

  console.log('✅ [ProgressHandler] SocketIO event listeners configured');
}

/**
 * Track progress for a specific task
 */
function trackProgress(taskId, options = {}) {
  console.log(`📊 [ProgressHandler] Starting progress tracking for: ${taskId}`, options);

  // Cache UI elements
  cacheUIElements(taskId, options);
  
  // Store task options
  if (!state.activeTasks.has(taskId)) {
    state.activeTasks.set(taskId, {
      id: taskId,
      type: options.taskType || 'unknown',
      startTime: Date.now(),
      progress: 0,
      status: 'tracking',
      options
    });
  }

  return {
    taskId,
    stop: () => cleanupTask(taskId),
    getStatus: () => state.activeTasks.get(taskId)
  };
}

/**
 * Get health status
 */
function getHealthStatus() {
  return {
    module: 'progressHandler',
    version: '5.0.0',
    status: state.initialized ? 'healthy' : 'initializing',
    socketConnected: state.socketConnected,
    activeTasks: state.activeTasks.size,
    completedTasks: state.completedTasks.size,
    features: {
      socketIOIntegration: true,
      realTimeTracking: true,
      etaCalculation: true,
      errorHandling: true,
      crossModuleCoordination: true
    }
  };
}

/**
 * Initialize Progress Handler
 */
async function initProgressHandler() {
  if (state.initialized) {
    console.log('📊 [ProgressHandler] Already initialized');
    return;
  }

  try {
    console.log('📊 [ProgressHandler] Initializing v5.0...');
    
    // Setup SocketIO integration
    setupSocketEventListeners();
    
    state.initialized = true;
    console.log('✅ [ProgressHandler] v5.0 initialized successfully');
    
    showNotification('Progress Handler v5.0 initialized', 'success');
    
  } catch (error) {
    console.error('❌ [ProgressHandler] Initialization failed:', error);
    showNotification(`Progress Handler initialization failed: ${error.message}`, 'error');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProgressHandler);
} else {
  initProgressHandler();
}

// Make available globally
window.progressHandler = {
  init: initProgressHandler,
  trackProgress,
  getHealthStatus,
  cleanupTask,
  state: state
};

// Export for module use
export default initProgressHandler;
export {
  trackProgress,
  getHealthStatus,
  formatDuration,
  formatBytes,
  calculateETA,
  showNotification,
  cleanupTask
};

console.log('📊 Progress Handler v5.0 module loaded (SocketIO Aligned Architecture)');