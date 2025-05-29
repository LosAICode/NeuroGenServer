/**
 * File Processor Module - Clean Blueprint Implementation
 * 
 * Modern, clean implementation aligned with Flask Blueprint backend.
 * No patches, fixes, or legacy code - built from ground up for Blueprint architecture.
 * 
 * @module features/fileProcessor
 * @version 3.0.0
 */

import blueprintApi from '../services/blueprintApi.js';
import { FILE_ENDPOINTS } from '../config/endpoints.js';
import { TASK_EVENTS, BLUEPRINT_EVENTS } from '../config/socketEvents.js';
import { CONSTANTS } from '../config/constants.js';

/**
 * File Processor Class - Clean Blueprint Implementation
 */
class FileProcessor {
  constructor() {
    this.state = {
      isInitialized: false,
      currentTask: null,
      processingState: 'idle', // 'idle', 'processing', 'completed', 'error'
      elements: new Map(),
      eventListeners: new Set(),
      socketListeners: new Set()
    };
    
    this.config = {
      supportedFormats: CONSTANTS.ALLOWED_EXTENSIONS,
      maxFileSize: CONSTANTS.MAX_FILE_SIZE,
      maxBatchSize: CONSTANTS.MAX_BATCH_SIZE,
      chunkSize: CONSTANTS.CHUNK_SIZE
    };
  }

  /**
   * Initialize the File Processor module
   */
  async init() {
    if (this.state.isInitialized) return;
    
    try {
      console.log('🔄 Initializing File Processor...');
      
      this.cacheElements();
      this.setupEventHandlers();
      this.setupSocketHandlers();
      this.setupFormValidation();
      
      this.state.isInitialized = true;
      console.log('✅ File Processor initialized successfully');
      
    } catch (error) {
      console.error('❌ File Processor initialization failed:', error);
      throw error;
    }
  }

  /**
   * Cache DOM elements for efficient access
   */
  cacheElements() {
    const elementIds = [
      'fileTab',
      'file-input-dir',
      'file-output-file', 
      'file-start-btn',
      'file-progress-container',
      'file-progress-bar',
      'file-progress-text',
      'file-stats-container',
      'file-results-container',
      'file-cancel-btn'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.state.elements.set(id, element);
      }
    });
  }

  /**
   * Setup event handlers for UI interactions
   */
  setupEventHandlers() {
    // Form submission
    const form = this.state.elements.get('fileTab');
    if (form) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      };
      form.addEventListener('submit', submitHandler);
      this.state.eventListeners.add(() => form.removeEventListener('submit', submitHandler));
    }

    // Start button
    const startBtn = this.state.elements.get('file-start-btn');
    if (startBtn) {
      const clickHandler = () => this.startProcessing();
      startBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => startBtn.removeEventListener('click', clickHandler));
    }

    // Cancel button
    const cancelBtn = this.state.elements.get('file-cancel-btn');
    if (cancelBtn) {
      const clickHandler = () => this.cancelProcessing();
      cancelBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => cancelBtn.removeEventListener('click', clickHandler));
    }

    // Input validation
    this.setupInputValidation();
  }

  /**
   * Setup Socket.IO event handlers using Blueprint events
   */
  setupSocketHandlers() {
    if (!window.socket) return;

    // Task started
    const taskStartedHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskStarted(data);
      }
    };
    window.socket.on(TASK_EVENTS.STARTED, taskStartedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.STARTED, taskStartedHandler));

    // Progress updates
    const progressHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleProgressUpdate(data);
      }
    };
    window.socket.on(TASK_EVENTS.PROGRESS, progressHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.PROGRESS, progressHandler));

    // Task completed
    const completedHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskCompleted(data);
      }
    };
    window.socket.on(TASK_EVENTS.COMPLETED, completedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.COMPLETED, completedHandler));

    // Task error
    const errorHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleTaskError(data);
      }
    };
    window.socket.on(TASK_EVENTS.ERROR, errorHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.ERROR, errorHandler));

    // File-specific events
    const fileProcessedHandler = (data) => {
      if (data.task_id === this.state.currentTask?.id) {
        this.handleFileProcessed(data);
      }
    };
    window.socket.on(BLUEPRINT_EVENTS.file_processor.file_processed, fileProcessedHandler);
    this.state.socketListeners.add(() => window.socket.off(BLUEPRINT_EVENTS.file_processor.file_processed, fileProcessedHandler));
  }

  /**
   * Setup form validation
   */
  setupFormValidation() {
    const inputDir = this.state.elements.get('file-input-dir');
    const outputFile = this.state.elements.get('file-output-file');

    if (inputDir) {
      inputDir.addEventListener('input', () => this.validateForm());
    }
    if (outputFile) {
      outputFile.addEventListener('input', () => this.validateForm());
    }
  }

  /**
   * Setup input validation with real-time feedback
   */
  setupInputValidation() {
    const inputDir = this.state.elements.get('file-input-dir');
    const outputFile = this.state.elements.get('file-output-file');

    if (inputDir) {
      inputDir.addEventListener('blur', async () => {
        const path = inputDir.value.trim();
        if (path) {
          await this.validatePath(path);
        }
      });
    }

    if (outputFile) {
      outputFile.addEventListener('blur', () => {
        const filename = outputFile.value.trim();
        if (filename) {
          this.validateOutputFilename(filename);
        }
      });
    }
  }

  /**
   * Validate file path using Blueprint API
   */
  async validatePath(path) {
    try {
      const result = await blueprintApi.verifyPath(path);
      
      const inputDir = this.state.elements.get('file-input-dir');
      if (inputDir) {
        inputDir.classList.remove('is-invalid', 'is-valid');
        
        if (result.valid) {
          inputDir.classList.add('is-valid');
          this.showFieldFeedback(inputDir, 'Valid directory path', 'valid');
        } else {
          inputDir.classList.add('is-invalid');
          this.showFieldFeedback(inputDir, result.error || 'Invalid path', 'invalid');
        }
      }
      
      return result.valid;
      
    } catch (error) {
      console.warn('Path validation failed:', error);
      return true; // Allow processing to continue if validation fails
    }
  }

  /**
   * Validate output filename
   */
  validateOutputFilename(filename) {
    const outputFile = this.state.elements.get('file-output-file');
    if (!outputFile) return true;

    outputFile.classList.remove('is-invalid', 'is-valid');

    // Check filename length
    if (filename.length > CONSTANTS.MAX_FILENAME_LENGTH) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Filename too long', 'invalid');
      return false;
    }

    // Check for invalid characters (Windows compatibility)
    if (CONSTANTS.WINDOWS_INVALID_CHARS.test(filename)) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Contains invalid characters', 'invalid');
      return false;
    }

    // Check for reserved names
    const baseName = filename.split('.')[0].toUpperCase();
    if (CONSTANTS.WINDOWS_RESERVED_NAMES.includes(baseName)) {
      outputFile.classList.add('is-invalid');
      this.showFieldFeedback(outputFile, 'Reserved filename', 'invalid');
      return false;
    }

    outputFile.classList.add('is-valid');
    this.showFieldFeedback(outputFile, 'Valid filename', 'valid');
    return true;
  }

  /**
   * Show field validation feedback
   */
  showFieldFeedback(element, message, type) {
    // Remove existing feedback
    const existingFeedback = element.parentNode.querySelector('.feedback-message');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // Add new feedback
    const feedback = document.createElement('div');
    feedback.className = `feedback-message ${type === 'valid' ? 'text-success' : 'text-danger'} small mt-1`;
    feedback.textContent = message;
    element.parentNode.appendChild(feedback);
  }

  /**
   * Validate entire form
   */
  validateForm() {
    const inputDir = this.state.elements.get('file-input-dir')?.value.trim();
    const outputFile = this.state.elements.get('file-output-file')?.value.trim();
    const startBtn = this.state.elements.get('file-start-btn');

    const isValid = inputDir && outputFile && this.state.processingState === 'idle';

    if (startBtn) {
      startBtn.disabled = !isValid;
    }

    return isValid;
  }

  /**
   * Handle form submission
   */
  async handleFormSubmit() {
    if (!this.validateForm()) return;
    await this.startProcessing();
  }

  /**
   * Start file processing using Blueprint API
   */
  async startProcessing() {
    try {
      const inputDir = this.state.elements.get('file-input-dir')?.value.trim();
      const outputFile = this.state.elements.get('file-output-file')?.value.trim();

      if (!inputDir || !outputFile) {
        this.showError('Please fill in all required fields');
        return;
      }

      this.state.processingState = 'processing';
      this.updateUI();

      // Start processing using Blueprint API
      const response = await blueprintApi.processFiles(inputDir, outputFile, {
        formats: this.config.supportedFormats,
        max_size: this.config.maxFileSize,
        chunk_size: this.config.chunkSize
      });

      // Store task information
      this.state.currentTask = {
        id: response.task_id,
        inputDir,
        outputFile,
        startTime: Date.now()
      };

      console.log(`📁 File processing started: ${response.task_id}`);
      this.showInfo(`Processing started for: ${inputDir}`);

    } catch (error) {
      console.error('❌ Failed to start processing:', error);
      this.handleTaskError({ error: error.message });
    }
  }

  /**
   * Cancel current processing task
   */
  async cancelProcessing() {
    if (!this.state.currentTask) return;

    try {
      await blueprintApi.cancelTask(this.state.currentTask.id);
      console.log(`🚫 Processing cancelled: ${this.state.currentTask.id}`);
      
    } catch (error) {
      console.error('❌ Failed to cancel processing:', error);
    }
  }

  /**
   * Handle task started event
   */
  handleTaskStarted(data) {
    console.log('🚀 File processing task started:', data);
    this.showProgress(0, 'Starting file processing...');
  }

  /**
   * Handle progress update
   */
  handleProgressUpdate(data) {
    const progress = Math.min(100, Math.max(0, data.progress || 0));
    const message = data.message || `Processing... ${progress.toFixed(1)}%`;
    
    this.showProgress(progress, message);
    
    // Update stats if available
    if (data.stats) {
      this.updateStats(data.stats);
    }
  }

  /**
   * Handle file processed event
   */
  handleFileProcessed(data) {
    console.log('📄 File processed:', data);
    // Could show individual file progress here
  }

  /**
   * Handle task completion
   */
  handleTaskCompleted(data) {
    console.log('✅ File processing completed:', data);
    
    this.state.processingState = 'completed';
    this.showProgress(100, 'Processing completed successfully!');
    
    // Show results
    this.showResults(data);
    
    // Update stats
    if (data.stats) {
      this.updateStats(data.stats);
    }
    
    this.updateUI();
  }

  /**
   * Handle task error
   */
  handleTaskError(data) {
    console.error('❌ File processing error:', data);
    
    this.state.processingState = 'error';
    this.showError(data.error || 'Processing failed');
    this.updateUI();
  }

  /**
   * Update UI based on current state
   */
  updateUI() {
    const startBtn = this.state.elements.get('file-start-btn');
    const cancelBtn = this.state.elements.get('file-cancel-btn');
    const progressContainer = this.state.elements.get('file-progress-container');

    if (startBtn) {
      startBtn.disabled = this.state.processingState === 'processing';
      startBtn.textContent = this.state.processingState === 'processing' ? 'Processing...' : 'Start Processing';
    }

    if (cancelBtn) {
      cancelBtn.style.display = this.state.processingState === 'processing' ? 'inline-block' : 'none';
    }

    if (progressContainer) {
      progressContainer.style.display = 
        ['processing', 'completed', 'error'].includes(this.state.processingState) ? 'block' : 'none';
    }
  }

  /**
   * Show progress update
   */
  showProgress(progress, message) {
    const progressBar = this.state.elements.get('file-progress-bar');
    const progressText = this.state.elements.get('file-progress-text');

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
    }

    if (progressText) {
      progressText.textContent = message;
    }
  }

  /**
   * Update statistics display
   */
  updateStats(stats) {
    const statsContainer = this.state.elements.get('file-stats-container');
    if (!statsContainer) return;

    const statsHtml = `
      <div class="row text-center">
        <div class="col-md-3">
          <div class="stat-item">
            <div class="stat-value">${stats.files_processed || 0}</div>
            <div class="stat-label">Files Processed</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-item">
            <div class="stat-value">${stats.total_files || 0}</div>
            <div class="stat-label">Total Files</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-item">
            <div class="stat-value">${this.formatFileSize(stats.total_size || 0)}</div>
            <div class="stat-label">Total Size</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-item">
            <div class="stat-value">${this.formatDuration(stats.elapsed_time || 0)}</div>
            <div class="stat-label">Elapsed Time</div>
          </div>
        </div>
      </div>
    `;

    statsContainer.innerHTML = statsHtml;
    statsContainer.style.display = 'block';
  }

  /**
   * Show processing results
   */
  showResults(data) {
    const resultsContainer = this.state.elements.get('file-results-container');
    if (!resultsContainer) return;

    const resultsHtml = `
      <div class="alert alert-success">
        <h5><i class="fas fa-check-circle me-2"></i>Processing Complete!</h5>
        <p>Successfully processed files from: <strong>${this.state.currentTask.inputDir}</strong></p>
        <p>Output file: <strong>${data.output_file || this.state.currentTask.outputFile}</strong></p>
        
        ${data.download_url ? `
        <div class="mt-3">
          <a href="${data.download_url}" class="btn btn-primary" download>
            <i class="fas fa-download me-2"></i>Download Results
          </a>
        </div>
        ` : ''}
      </div>
    `;

    resultsContainer.innerHTML = resultsHtml;
    resultsContainer.style.display = 'block';
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showToast('Processing Error', message, 'error');
  }

  /**
   * Show info message
   */
  showInfo(message) {
    this.showToast('File Processor', message, 'info');
  }

  /**
   * Show toast notification
   */
  showToast(title, message, type = 'info') {
    // Use existing toast system or create simple one
    if (window.showToast) {
      window.showToast(title, message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration for display
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.state.currentTask = null;
    this.state.processingState = 'idle';
    
    // Clear UI
    const progressContainer = this.state.elements.get('file-progress-container');
    const statsContainer = this.state.elements.get('file-stats-container');
    const resultsContainer = this.state.elements.get('file-results-container');

    if (progressContainer) progressContainer.style.display = 'none';
    if (statsContainer) statsContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'none';

    this.updateUI();
  }

  /**
   * Cleanup event listeners and resources
   */
  cleanup() {
    // Remove event listeners
    this.state.eventListeners.forEach(removeListener => removeListener());
    this.state.eventListeners.clear();

    // Remove socket listeners
    this.state.socketListeners.forEach(removeListener => removeListener());
    this.state.socketListeners.clear();

    // Cancel any ongoing task
    if (this.state.currentTask) {
      this.cancelProcessing();
    }

    this.state.isInitialized = false;
  }
}

// Create singleton instance
const fileProcessor = new FileProcessor();

// Export for use by other modules
export default fileProcessor;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => fileProcessor.init());
} else {
  fileProcessor.init();
}

console.log('📁 File Processor module loaded (Clean Blueprint Implementation)');