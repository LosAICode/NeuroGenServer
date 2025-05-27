
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