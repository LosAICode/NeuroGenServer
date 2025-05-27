/**
 * safeFileProcessor.js - Fixed Version (v2.0.0)
 * 
 * This simplified version eliminates the timeout issues by:
 * 1. Removing complex DOM checking that caused delays
 * 2. Using direct imports instead of dynamic loading
 * 3. Simplified state management
 * 4. Better error handling
 */

import fileProcessor from '../features/fileProcessor.js';

// Simple state management - no WeakMap or complex objects
const state = {
  initialized: false,
  processing: false,
  lastError: null
};

/**
 * Safe File Processor Module
 * Provides a reliable wrapper around the file processor
 */
const safeFileProcessor = {
  // Module metadata
  name: 'safeFileProcessor',
  version: '2.0.0',
  initialized: false,

  /**
   * Initialize the safe file processor
   */
  async initialize() {
    if (this.initialized) {
      console.log('Safe file processor already initialized');
      return true;
    }

    try {
      // Initialize the underlying file processor if it has an initialize method
      if (fileProcessor && typeof fileProcessor.initialize === 'function') {
        await fileProcessor.initialize();
      }

      this.initialized = true;
      state.initialized = true;
      
      console.log('✅ Safe file processor initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize safe file processor:', error);
      state.lastError = error;
      return false;
    }
  },

  /**
   * Process a file safely with progress tracking
   */
  async processFile(file, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (state.processing) {
      throw new Error('File processing already in progress');
    }

    try {
      state.processing = true;
      state.lastError = null;
      
      // Delegate to the underlying file processor
      if (fileProcessor && typeof fileProcessor.processFile === 'function') {
        const result = await fileProcessor.processFile(file, options);
        return result;
      } else {
        throw new Error('File processor not available');
      }
    } catch (error) {
      state.lastError = error;
      throw error;
    } finally {
      state.processing = false;
    }
  },

  /**
   * Get current processing status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      processing: state.processing,
      hasFileProcessor: !!fileProcessor,
      lastError: state.lastError?.message || null
    };
  },

  /**
   * Setup task progress tracking - delegate to fileProcessor
   */
  setupTaskProgress(taskId, options = {}) {
    if (fileProcessor && typeof fileProcessor.setupTaskProgress === 'function') {
      return fileProcessor.setupTaskProgress(taskId, options);
    }
    console.warn('setupTaskProgress not available in underlying file processor');
    return null;
  },

  /**
   * Update task progress - delegate to fileProcessor
   */
  updateTaskProgress(taskId, progress, message, stats) {
    if (fileProcessor && typeof fileProcessor.updateTaskProgress === 'function') {
      return fileProcessor.updateTaskProgress(taskId, progress, message, stats);
    }
    console.warn('updateTaskProgress not available in underlying file processor');
  },

  /**
   * Complete a task - delegate to fileProcessor
   */
  completeTask(taskId, data = {}) {
    if (fileProcessor && typeof fileProcessor.completeTask === 'function') {
      return fileProcessor.completeTask(taskId, data);
    }
    console.warn('completeTask not available in underlying file processor');
  },

  /**
   * Handle task error - delegate to fileProcessor
   */
  errorTask(taskId, error, data = {}) {
    if (fileProcessor && typeof fileProcessor.errorTask === 'function') {
      return fileProcessor.errorTask(taskId, error, data);
    }
    console.warn('errorTask not available in underlying file processor');
  },

  /**
   * Cancel a task - delegate to fileProcessor
   */
  cancelTask(taskId) {
    if (fileProcessor && typeof fileProcessor.cancelTask === 'function') {
      return fileProcessor.cancelTask(taskId);
    }
    console.warn('cancelTask not available in underlying file processor');
  },

  /**
   * Check if module is ready for use
   */
  isReady() {
    return this.initialized && !!fileProcessor && !state.processing;
  },

  /**
   * Reset the module state (for debugging/recovery)
   */
  reset() {
    this.initialized = false;
    state.initialized = false;
    state.processing = false;
    state.lastError = null;
    console.log('Safe file processor reset');
  }
};

// Auto-initialize when DOM is ready (simple, non-blocking approach)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Use setTimeout to avoid blocking DOM ready event
    setTimeout(() => {
      safeFileProcessor.initialize().catch(error => {
        console.warn('Auto-initialization of safeFileProcessor failed:', error.message);
      });
    }, 100);
  });
} else {
  // DOM already ready, initialize with slight delay to avoid blocking
  setTimeout(() => {
    safeFileProcessor.initialize().catch(error => {
      console.warn('Auto-initialization of safeFileProcessor failed:', error.message);
    });
  }, 100);
}

export default safeFileProcessor;