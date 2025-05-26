/**
 * socketHandler.js
 * Enhanced Socket.IO handler for NeuroGenServer with proper lifecycle support
 * 
 * This module handles:
 * 1. Socket.IO connection management
 * 2. Task progress tracking
 * 3. Task completion/error handling
 * 4. Polling fallbacks when WebSocket is unavailable
 * 5. Cancel task APIs
 */

// Module state
let socket = null;
let pollingIntervals = {};
let activeTasks = new Set();
let taskCallbacks = new Map();
let initialized = false;
let connectionAttempts = 0;
let maxConnectionAttempts = 5;
let taskStatusRequests = new Map();

/**
 * Initialize socket handler with improved DOM readiness checks
 */
function initialize() {
    // Early return if already initialized
    if (initialized) {
        console.log("Socket handler already initialized");
        return Promise.resolve(true);
    }

    console.log("Initializing socket handler...");

    return new Promise((resolve) => {
        // Check if document is ready before proceeding
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Use setTimeout to ensure this runs after current JS execution
                setTimeout(() => initializeAfterDOMReady().then(resolve), 10);
            });
        } else {
            // DOM is already ready, initialize immediately
            initializeAfterDOMReady().then(resolve);
        }
    });
}

/**
 * Second phase of initialization after DOM is ready
 */
async function initializeAfterDOMReady() {
    try {
        // Check if Socket.IO client is available
        if (typeof io === 'undefined') {
            console.warn("Socket.IO client not available. Using polling fallback.");
            initialized = true;
            return false;
        }

        // Get socket status UI element (if available)
        const statusIndicator = document.getElementById('socket-status');
        if (statusIndicator) {
            statusIndicator.classList.remove('d-none');
            statusIndicator.classList.add('connecting');
            
            const statusText = statusIndicator.querySelector('.socket-status-text');
            if (statusText) {
                statusText.textContent = 'Connecting...';
            }
        }

        // Create Socket.IO connection
        socket = io({
            reconnectionAttempts: 5,
            timeout: 10000,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        // Setup event handlers
        setupSocketEvents();

        // Mark as initialized
        initialized = true;
        console.log("Socket handler initialized successfully");
        return true;
    } catch (error) {
        console.error("Error initializing socket handler:", error);
        initialized = true; // Still mark as initialized to prevent retry loops
        return false;
    }
}

/**
 * Set up Socket.IO event handlers
 */
function setupSocketEvents() {
    if (!socket) return;

    socket.on('connect', () => {
        console.log('Socket.IO connected');
        connectionAttempts = 0;
        
        // Update socket status indicator
        updateSocketStatus('connected', 'Connected');
        
        // Request status updates for any tracked tasks
        activeTasks.forEach(taskId => {
            requestTaskStatus(taskId);
        });
        
        // Emit event for other modules
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
            window.eventRegistry.emit('socket.connected', {
                socketId: socket.id,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Socket.IO disconnected');
        updateSocketStatus('disconnected', 'Disconnected');
        
        // Start polling fallback for any active tasks
        activeTasks.forEach(taskId => {
            startStatusPolling(taskId);
        });
        
        // Emit event for other modules
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
            window.eventRegistry.emit('socket.disconnected', {
                timestamp: new Date().toISOString()
            });
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        connectionAttempts++;
        
        updateSocketStatus('error', 'Connection Error');
        
        // Give up after max attempts
        if (connectionAttempts >= maxConnectionAttempts) {
            console.warn(`Failed to connect after ${maxConnectionAttempts} attempts. Switching to polling.`);
            
            // Fall back to polling for any active tasks
            activeTasks.forEach(taskId => {
                startStatusPolling(taskId);
            });
            
            // Show toast if UI is available
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('Connection Issue', 'Using polling fallback for task updates', 'warning');
            }
        }
    });

    // CRITICAL: Setup proper task lifecycle event handlers
    
    // Progress updates
    socket.on('progress_update', (data) => {
        handleProgressUpdate(data);
    });
    
    // Task completion
    socket.on('task_completed', (data) => {
        handleTaskCompleted(data);
    });
    
    // Task errors
    socket.on('task_error', (data) => {
        handleTaskError(data);
    });
    
    // Task cancellation
    socket.on('task_cancelled', (data) => {
        handleTaskCancelled(data);
    });
    
    console.log("Socket event handlers registered");
}

/**
 * Update the socket status indicator in the UI
 */
function updateSocketStatus(status, message) {
    const statusIndicator = document.getElementById('socket-status');
    if (!statusIndicator) return;
    
    // Update classes
    statusIndicator.classList.remove('connected', 'disconnected', 'connecting', 'error');
    statusIndicator.classList.add(status);
    
    // Update text
    const statusText = statusIndicator.querySelector('.socket-status-text');
    if (statusText && message) {
        statusText.textContent = message;
    }
}

/**
 * Handle task progress updates
 */
function handleProgressUpdate(data) {
    if (!data || !data.task_id) return;
    
    console.log('Progress update received:', data);
    
    // Track this task
    activeTasks.add(data.task_id);
    
    // Update UI via progressHandler if available
    if (window.progressHandler && typeof window.progressHandler.updateTaskProgress === 'function') {
        window.progressHandler.updateTaskProgress(
            data.task_id,
            data.progress,
            data.message,
            data.stats
        );
    }
    
    // Call any registered callbacks
    const callbacks = taskCallbacks.get(data.task_id);
    if (callbacks && typeof callbacks.onProgress === 'function') {
        callbacks.onProgress(data);
    }
    
    // Emit via event registry
    if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('socket.progress_update', data);
        window.eventRegistry.emit('progress.update', data);
    }
}

/**
 * Handle task completion
 */
function handleTaskCompleted(data) {
    if (!data || !data.task_id) return;
    
    console.log('Task completion received:', data);
    
    // Update UI via progressHandler if available
    if (window.progressHandler && typeof window.progressHandler.completeTask === 'function') {
        window.progressHandler.completeTask(data.task_id, data);
    }
    
    // Call any registered callbacks
    const callbacks = taskCallbacks.get(data.task_id);
    if (callbacks && typeof callbacks.onComplete === 'function') {
        callbacks.onComplete(data);
    }
    
    // Emit via event registry
    if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('socket.task_completed', data);
        window.eventRegistry.emit('progress.completed', data);
    }
    
    // Stop polling if active
    stopStatusPolling(data.task_id);
    
    // Remove from active tasks
    activeTasks.delete(data.task_id);
    
    // Clean up callbacks
    taskCallbacks.delete(data.task_id);
    
    // Clean up status requests
    taskStatusRequests.delete(data.task_id);
}

/**
 * Handle task errors
 */
function handleTaskError(data) {
    if (!data || !data.task_id) return;
    
    console.error('Task error received:', data);
    
    // Update UI via progressHandler if available
    if (window.progressHandler && typeof window.progressHandler.errorTask === 'function') {
        window.progressHandler.errorTask(data.task_id, data.error || 'Unknown error');
    }
    
    // Call any registered callbacks
    const callbacks = taskCallbacks.get(data.task_id);
    if (callbacks && typeof callbacks.onError === 'function') {
        callbacks.onError(data);
    }
    
    // Emit via event registry
    if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('socket.task_error', data);
        window.eventRegistry.emit('progress.error', data);
    }
    
    // Show error toast if UI is available
    if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Task Error', data.error || 'An error occurred with the task', 'error');
    }
    
    // Stop polling if active
    stopStatusPolling(data.task_id);
    
    // Remove from active tasks
    activeTasks.delete(data.task_id);
    
    // Clean up callbacks
    taskCallbacks.delete(data.task_id);
    
    // Clean up status requests
    taskStatusRequests.delete(data.task_id);
}

/**
 * Handle task cancellation
 */
function handleTaskCancelled(data) {
    if (!data || !data.task_id) return;
    
    console.log('Task cancellation received:', data);
    
    // Update UI via progressHandler if available
    if (window.progressHandler && typeof window.progressHandler.cancelTask === 'function') {
        window.progressHandler.cancelTask(data.task_id);
    }
    
    // Call any registered callbacks
    const callbacks = taskCallbacks.get(data.task_id);
    if (callbacks && typeof callbacks.onCancel === 'function') {
        callbacks.onCancel(data);
    }
    
    // Emit via event registry
    if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('socket.task_cancelled', data);
        window.eventRegistry.emit('progress.cancelled', data);
    }
    
    // Show toast if UI is available
    if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast('Task Cancelled', 'The task was cancelled', 'warning');
    }
    
    // Stop polling if active
    stopStatusPolling(data.task_id);
    
    // Remove from active tasks
    activeTasks.delete(data.task_id);
    
    // Clean up callbacks
    taskCallbacks.delete(data.task_id);
    
    // Clean up status requests
    taskStatusRequests.delete(data.task_id);
}

/**
 * Request task status via Socket.IO
 */
function requestTaskStatus(taskId) {
    if (!taskId) return;
    
    // Add to active tasks
    activeTasks.add(taskId);
    
    // Track request time to prevent spam
    const now = Date.now();
    const lastRequest = taskStatusRequests.get(taskId) || 0;
    
    // Limit requests to once per second
    if (now - lastRequest < 1000) {
        return;
    }
    
    taskStatusRequests.set(taskId, now);
    
    // Request via Socket.IO if available
    if (socket && socket.connected) {
        try {
            socket.emit('request_status', { task_id: taskId });
            console.log(`Requested status for task ${taskId} via Socket.IO`);
            return true;
        } catch (error) {
            console.warn(`Error requesting status via Socket.IO:`, error);
        }
    }
    
    // Fallback to HTTP API request
    fetchTaskStatus(taskId);
    return false;
}

/**
 * Fetch task status via HTTP API
 */
async function fetchTaskStatus(taskId) {
    try {
        // Try multiple endpoints for better compatibility
        const endpoints = [
            `/api/task/status/${taskId}`,
            `/api/status/${taskId}`
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Process the response
                    if (data.status === 'completed') {
                        handleTaskCompleted({
                            task_id: taskId,
                            ...data
                        });
                        return true;
                    } else if (data.status === 'error' || data.status === 'failed') {
                        handleTaskError({
                            task_id: taskId,
                            error: data.error || 'Task failed',
                            ...data
                        });
                        return true;
                    } else if (data.status === 'cancelled') {
                        handleTaskCancelled({
                            task_id: taskId,
                            ...data
                        });
                        return true;
                    } else if (data.progress !== undefined) {
                        handleProgressUpdate({
                            task_id: taskId,
                            ...data
                        });
                        return true;
                    }
                    
                    // We found a working endpoint, no need to try others
                    break;
                }
            } catch (err) {
                console.warn(`Error fetching task status from ${endpoint}:`, err);
                // Continue to next endpoint
            }
        }
        
        return false;
    } catch (error) {
        console.error(`Error fetching task status for ${taskId}:`, error);
        return false;
    }
}
/**
 * Start polling for task status updates
 */
function startStatusPolling(taskId, callbacks = {}) {
    if (!taskId) return;
    
    // Register callbacks
    if (Object.keys(callbacks).length > 0) {
        taskCallbacks.set(taskId, callbacks);
    }
    
    // Stop any existing polling
    stopStatusPolling(taskId);
    
    // Add to active tasks
    activeTasks.add(taskId);
    
    // Start polling interval
    console.log(`Starting status polling for task ${taskId}`);
    requestTaskStatus(taskId); // Request immediately
    
    pollingIntervals[taskId] = setInterval(() => {
        requestTaskStatus(taskId);
    }, 2000); // Poll every 2 seconds
    
    return true;
}

/**
 * Stop polling for task status updates
 */
function stopStatusPolling(taskId) {
    if (!taskId || !pollingIntervals[taskId]) return;
    
    clearInterval(pollingIntervals[taskId]);
    delete pollingIntervals[taskId];
    console.log(`Stopped status polling for task ${taskId}`);
    
    return true;
}

/**
 * Cancel a task via API and Socket.IO
 */
function cancelTask(taskId) {
    if (!taskId) return Promise.reject(new Error('No task ID provided'));
    
    console.log(`Cancelling task ${taskId}`);
    
    return new Promise((resolve, reject) => {
        let cancellationSent = false;
        
        // Try Socket.IO if available
        if (socket && socket.connected) {
            try {
                socket.emit('cancel_task', { task_id: taskId });
                console.log(`Sent cancel_task event via Socket.IO`);
                cancellationSent = true;
            } catch (error) {
                console.warn(`Error sending cancel via Socket.IO:`, error);
            }
        }
        
        // Also try HTTP API for redundancy
        const cancelEndpoints = [
            `/api/task/cancel/${taskId}`,
            `/api/cancel_task/${taskId}`,
            `/api/cancel_task` // POST endpoint
        ];
        
        // Try POST to the main cancel endpoint first
        fetch(`/api/cancel_task`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ task_id: taskId })
        })
        .then(response => {
            if (response.ok) {
                console.log(`Successfully cancelled task via POST /api/cancel_task`);
                cancellationSent = true;
                resolve(true);
            } else {
                // Try other endpoints
                tryOtherEndpoints();
            }
        })
        .catch(error => {
            console.warn(`Error with POST cancel endpoint:`, error);
            // Try other endpoints
            tryOtherEndpoints();
        });
        
        // Try other endpoints as fallback
        function tryOtherEndpoints() {
            Promise.all(cancelEndpoints.slice(0, 2).map(endpoint => {
                return fetch(endpoint, { method: 'POST' })
                    .then(response => {
                        if (response.ok) {
                            console.log(`Successfully cancelled task via ${endpoint}`);
                            cancellationSent = true;
                            return true;
                        } else {
                            return false;
                        }
                    })
                    .catch(() => false);
            }))
            .then(results => {
                if (results.some(result => result) || cancellationSent) {
                    resolve(true);
                } else {
                    reject(new Error('Failed to send cancellation request'));
                }
            });
        }
        
        // Emit event for other modules
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
            window.eventRegistry.emit('socket.cancel_task', { task_id: taskId });
        }
        
        // Remove from active tasks
        activeTasks.delete(taskId);
        
        // Clean up polling
        stopStatusPolling(taskId);
    });
}

/**
 * Get status of a task
 */
function getTaskStatus(taskId) {
    return new Promise((resolve, reject) => {
        if (!taskId) {
            reject(new Error('No task ID provided'));
            return;
        }
        
        // Try Socket.IO first if available
        if (socket && socket.connected) {
            // Set up a one-time listener for the response
            const responseHandler = (data) => {
                if (data.task_id === taskId) {
                    socket.off('task_status', responseHandler);
                    resolve(data);
                }
            };
            
            socket.on('task_status', responseHandler);
            
            // Set a timeout to fall back to HTTP API if no response
            const timeout = setTimeout(() => {
                socket.off('task_status', responseHandler);
                fetchTaskStatusOnce();
            }, 2000);
            
            // Send the request
            try {
                socket.emit('request_status', { task_id: taskId });
                return;
            } catch (error) {
                console.warn(`Error requesting status via Socket.IO:`, error);
                clearTimeout(timeout);
                socket.off('task_status', responseHandler);
                fetchTaskStatusOnce();
            }
        } else {
            fetchTaskStatusOnce();
        }
        
        // Fetch status via HTTP API
        async function fetchTaskStatusOnce() {
            try {
                const endpoints = [
                    `/api/task/status/${taskId}`,
                    `/api/status/${taskId}`
                ];
                
                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch(endpoint);
                        if (response.ok) {
                            const data = await response.json();
                            resolve({
                                task_id: taskId,
                                ...data
                            });
                            return;
                        }
                    } catch (err) {
                        console.warn(`Error fetching from ${endpoint}:`, err);
                    }
                }
                
                reject(new Error('Failed to get task status'));
            } catch (error) {
                reject(error);
            }
        }
    });
}

/**
 * Register custom handler for task events
 */
function registerTaskHandler(taskId, handlers) {
    if (!taskId) return false;
    
    // Add to active tasks
    activeTasks.add(taskId);
    
    // Register handlers
    taskCallbacks.set(taskId, handlers);
    
    return true;
}

/**
 * Track a task with progress updates
 */
function trackTask(taskId, options = {}) {
    if (!taskId) return null;
    
    // Add to active tasks
    activeTasks.add(taskId);
    
    // Request initial status
    requestTaskStatus(taskId);
    
    // Start polling if not connected to socket
    if (!socket || !socket.connected) {
        startStatusPolling(taskId);
    }
    
    // Return a controller object
    return {
        taskId,
        cancel: () => cancelTask(taskId),
        refresh: () => requestTaskStatus(taskId),
        stopTracking: () => {
            stopStatusPolling(taskId);
            activeTasks.delete(taskId);
            taskCallbacks.delete(taskId);
        }
    };
}

/**
 * Check if a task is being tracked
 */
function isTaskTracked(taskId) {
    return activeTasks.has(taskId);
}

/**
 * Get all active tasks
 */
function getActiveTasks() {
    return Array.from(activeTasks);
}

/**
 * Clean up all tasks and intervals
 */
function cleanup() {
    // Clean up all polling intervals
    Object.keys(pollingIntervals).forEach(taskId => {
        clearInterval(pollingIntervals[taskId]);
        delete pollingIntervals[taskId];
    });
    
    // Clear all tracking data
    activeTasks.clear();
    taskCallbacks.clear();
    taskStatusRequests.clear();
    
    return true;
}

// Export the module
export default {
    initialize,
    isInitialized: () => initialized,
    socket: () => socket,
    requestTaskStatus,
    startStatusPolling,
    stopStatusPolling,
    cancelTask,
    getTaskStatus,
    registerTaskHandler,
    trackTask,
    isTaskTracked,
    getActiveTasks,
    cleanup
};