Comprehensive Guide to Using the Enhanced ProgressHandler Module
Introduction
The enhanced ProgressHandler module is a robust solution for tracking and displaying task progress in web applications, specifically designed for the NeuroGen server architecture. This guide explains how to effectively implement the module in your projects to provide users with responsive and accurate progress feedback for long-running operations.
Table of Contents

Basic Implementation
Initialization
Setting Up Task Progress
Tracking Progress
Updating Progress
Handling Task Completion
Error and Cancellation Handling
Creating Custom Progress UI
Advanced Features
Best Practices
Troubleshooting

Basic Implementation
Importing the Module
First, import the module in your JavaScript file:
javascript// Import the full module
import progressHandler from '../utils/progressHandler.js';

// Or import specific functions
import { 
  setupTaskProgress, 
  trackProgress, 
  updateProgressUI, 
  completeTask, 
  errorTask,
  cancelTask 
} from '../utils/progressHandler.js';
Initialization
Before using the module, initialize it to ensure all dependencies are loaded:
javascript// Method 1: Using async/await
async function initializeApp() {
  await progressHandler.initialize();
  // Continue with app initialization
}

// Method 2: Using Promises
progressHandler.initialize()
  .then(() => {
    console.log('Progress handler initialized successfully');
    // Continue with app initialization
  })
  .catch(error => {
    console.error('Error initializing progress handler:', error);
  });
Setting Up Task Progress
To start tracking a task's progress:
javascript// Generate a unique task ID 
const taskId = 'task_' + Date.now();

// Setup progress tracking with options
const options = {
  elementPrefix: 'my-task', // Prefix for DOM elements
  saveToSessionStorage: true, // Persist across page reloads
  taskType: 'file-processing' // Type of task (for session storage)
};

// Set up progress tracking
const taskProgress = progressHandler.setupTaskProgress(taskId, options);

// Store task ID for later use
window.currentTaskId = taskId; // For global access
Tracking Progress
To track progress from socket events:
javascript// Set up tracking with event binding
const progressTracker = trackProgress(taskId, {
  elementPrefix: 'my-task',
  taskType: 'file-processing',
  saveToSessionStorage: true
});

// Use the returned API to manually update progress if needed
progressTracker.updateProgress(25, 'Processing file 1 of 4...');
Updating Progress
Update progress in response to events or API responses:
javascript// Method 1: Using the module directly
progressHandler.updateTaskProgress(taskId, 50, 'Processing file 2 of 4...', {
  total_files: 4,
  processed_files: 2,
  skipped_files: 0,
  error_files: 0
});

// Method 2: Using the named export
updateProgressUI(taskId, 50, 'Processing file 2 of 4...', {
  total_files: 4,
  processed_files: 2
});

// Method 3: Using the tracker API
const tracker = progressHandler.trackProgress(taskId, options);
tracker.updateProgress(50, 'Processing file 2 of 4...', {
  total_files: 4,
  processed_files: 2
});
Handling Task Completion
When a task completes successfully:
javascript// Method 1: Using the module directly
progressHandler.completeTask(taskId, {
  output_file: '/path/to/output.json',
  stats: {
    total_files: 4,
    processed_files: 4,
    total_duration_seconds: 45,
    total_bytes: 1024000
  }
});

// Method 2: Using the named export
completeTask(taskId, {
  output_file: '/path/to/output.json',
  stats: { /* ... */ }
});

// Method 3: Using the tracker API
const tracker = progressHandler.trackProgress(taskId, options);
tracker.complete({
  output_file: '/path/to/output.json',
  stats: { /* ... */ }
});
Error and Cancellation Handling
Handle errors and cancellations properly:
javascript// Handling errors
progressHandler.errorTask(taskId, 'File processing failed: Invalid file format', {
  file: 'example.txt',
  line: 42
});

// Or using the tracker API
tracker.error('File processing failed: Invalid file format');

// Handling cancellations
progressHandler.cancelTask(taskId);

// Or using the tracker API
tracker.cancel();
Creating Custom Progress UI
Create a custom progress UI in your container:
javascript// Create progress UI elements in a container
const elements = progressHandler.createProgressUI('progress-container-id', 'custom-prefix');

// Manually update specific elements
if (elements.progressBar) {
  elements.progressBar.classList.add('custom-progress-bar');
}
Advanced Features
PDF Download Progress
Track progress of multiple PDF downloads:
javascript// Update PDF download progress
progressHandler.updatePdfDownloadProgress(taskId, {
  url: 'https://example.com/document.pdf',
  status: 'downloading',
  progress: 75,
  file_path: '/downloads/document.pdf'
});
ETA Calculation
Access estimated time to completion:
javascript// Get ETA information
const etaInfo = calculateETA(taskId, 65); // 65% progress

if (etaInfo.timeRemaining) {
  console.log(`Estimated time remaining: ${formatDuration(etaInfo.timeRemaining)}`);
  console.log(`Estimated completion time: ${etaInfo.completionTime.toLocaleTimeString()}`);
}
Task Monitoring
Monitor active tasks and resolve stuck tasks:
javascript// Get all active task IDs
const activeTasks = progressHandler.getActiveTaskIds();
console.log(`Currently tracking ${activeTasks.length} active tasks`);

// Get detailed task info
const taskDetails = progressHandler.getTaskDetails(taskId);
if (taskDetails && taskDetails.progress >= 95 && 
    Date.now() - taskDetails.lastUpdate > 60000) {
  // Task appears stuck at high progress for over a minute
  progressHandler.checkTaskCompletion(taskId);
}
Animation Settings
Configure progress bar animations:
javascript// Disable animations for accessibility or performance reasons
progressHandler.setAnimationsEnabled(false);

// Or customize animation properties
progressHandler.setAnimationOptions({
  duration: 200, // faster animations (ms)
  easing: 'linear', // linear instead of ease-out
  threshold: 1.0 // only animate changes of 1% or more
});
Best Practices

Always initialize the module before using it to ensure dependencies are loaded.
Use unique task IDs for each task. Consider including task type, timestamp, and a random component:
javascriptconst taskId = `file-processing_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

Set saveToSessionStorage to true for important tasks that should survive page reloads.
Always provide meaningful status messages that describe what the task is currently doing.
Provide comprehensive stats objects to enrich the progress display.
Always properly handle task completion, errors, and cancellations to prevent memory leaks.
Set elementPrefix to ensure progress updates go to the correct UI elements.
Update progress incrementally rather than jumping by large percentages.
Always clean up after task completion:
javascript// When fully done with a task
progressHandler.forceResetTask(taskId);

Implement proper error handling at all steps to recover gracefully from failures.

Troubleshooting
Progress Bar Stuck at 0%
If your progress bar remains at 0% even with updates:

Check that you're passing the correct taskId to all functions
Verify that the DOM elements with correct IDs exist
Call createProgressUI if DOM elements don't exist yet
Check browser console for errors

Progress Bar Stuck at 99%
The module includes special handling for the "stuck at 99%" issue, but if it still occurs:

Force completion at 100% when the task is actually complete
Check if completion event is firing properly
Manually call completeTask if socket events may be failing

Browser Crashes or High CPU Usage

Disable animations with setAnimationsEnabled(false)
Reduce update frequency for tasks with rapid progress changes
Increase animation threshold to minimize DOM updates

Task Progress Resets After Page Reload

Ensure saveToSessionStorage is set to true
Check that taskType is provided in options
Verify proper browser storage support and permissions

Duplicate Progress Updates

Check for multiple event handlers registering for the same task
Ensure task IDs are unique across different parts of your application
Use the trackProgress function instead of setting up event listeners manually


This guide provides a comprehensive overview of the progressHandler module's capabilities. By following these patterns and best practices, you can create responsive, user-friendly progress tracking for long-running operations in your web applications.