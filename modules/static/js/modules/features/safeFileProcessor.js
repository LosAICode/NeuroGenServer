/**
 * DOM Safety Wrapper for fileProcessor
 * 
 * This wrapper ensures the module only initializes when DOM is fully ready
 * and handles the "document.body is null" error seen in the logs.
 */

// Import the enhanced fileProcessor
import fileProcessor from './features/fileProcessor.js';

// Create a safety wrapper to ensure DOM is fully loaded
const safeFileProcessor = {
  ...fileProcessor,
  
  /**
   * Safe initialize method that ensures DOM is fully loaded
   * before attempting any operations that require document.body
   */
  initialize() {
    return new Promise((resolve, reject) => {
      // Function to check if document.body is available
      const checkBodyAvailable = () => {
        if (document.readyState === 'complete' && document.body) {
          console.log("DOM fully loaded and document.body is available, initializing file processor");
          
          // Now it's safe to initialize
          fileProcessor.initialize()
            .then(result => resolve(result))
            .catch(error => {
              console.error("Error during safe file processor initialization:", error);
              reject(error);
            });
        } else {
          console.log("Waiting for document.body to be available...");
          // Wait a bit longer and check again
          setTimeout(checkBodyAvailable, 100);
        }
      };
      
      // Start checking
      checkBodyAvailable();
    });
  },
  
  /**
   * Create progress UI with DOM safety checks
   */
  createProgressUI(containerId, prefix = '') {
    // Ensure body is available before creating UI
    if (!document.body) {
      console.warn("Cannot create progress UI - document.body not available yet");
      return null;
    }
    
    return fileProcessor.createProgressUI(containerId, prefix);
  }
};

// Export the safe version
export default safeFileProcessor;

// Also export all named exports from the original
export * from './features/fileProcessor.js';

// Add additional safety for direct DOM operations
export const initializeSafe = () => {
  // Only initialize when DOM is completely ready
  if (document.readyState === 'complete') {
    return safeFileProcessor.initialize();
  }
  
  return new Promise((resolve) => {
    window.addEventListener('load', () => {
      safeFileProcessor.initialize().then(resolve);
    });
  });
};