/**
 * Web Scraper Module
 * 
 * Handles web scraping operations and PDF downloads.
 * Integrated with the backend Python functionality for extracting web content
 * and downloading PDFs with advanced processing options.
 * 
 * @module webScraper
 */

import { showToast, showLoadingSpinner } from '../utils/ui.js';
import { formatDuration } from '../utils/utils.js';
import { handleError } from '../core/errorHandler.js';

// Import socket handler functions dynamically to avoid circular dependencies
let on, startStatusPolling, stopStatusPolling;

// We'll import these later when needed to avoid circular dependencies
import('../utils/socketHandler.js')
  .then(socketHandler => {
    on = socketHandler.on || socketHandler.default.on;
    startStatusPolling = socketHandler.startStatusPolling || socketHandler.default.startStatusPolling;
    stopStatusPolling = socketHandler.stopStatusPolling || socketHandler.default.stopStatusPolling;

    console.log("Socket handler functions loaded in webScraper");
  })
  .catch(err => {
    console.warn("Could not import socketHandler in webScraper:", err);
  });

// Module internal state
const state = {
  initialized: false,
  currentTaskId: null,
  currentUrls: [],
  pdfOptions: {
    process_pdfs: true,
    extract_tables: true,
    use_ocr: true,
    extract_structure: true,
    chunk_size: 4096
  }
};

/**
 * Web Scraper module for web scraping operations
 */
const webScraper = {
  /**
   * Initialize the scraper module
   * @returns {boolean} Success status
   */
  initialize() {
    try {
      console.log("Initializing Web Scraper module...");

      if (state.initialized) {
        console.log("Web Scraper module already initialized");
        return true;
      }

      // Register UI elements
      this.registerUIElements();

      // Set up event listeners
      this.registerEvents();

      // Mark as initialized
      state.initialized = true;
      console.log("Web Scraper module initialized successfully");

      return true;
    } catch (error) {
      this.handleError(error, "Error initializing Web Scraper module");
      return false;
    }
  },

  /**
   * Register UI elements with the uiRegistry
   */
  registerUIElements() {
    try {
      // Scraper form elements
      const elements = {
        form: document.getElementById('scraper-form'),
        urlInput: document.getElementById('scraper-url-input'),
        urlList: document.getElementById('scraper-url-list'),
        addButton: document.getElementById('scraper-add-url-btn'),
        downloadDir: document.getElementById('scraper-download-dir'),
        outputFilename: document.getElementById('scraper-output-filename'),
        startButton: document.getElementById('scraper-start-btn'),

        // PDF options
        processCheckbox: document.getElementById('scraper-process-pdfs'),
        tablesCheckbox: document.getElementById('scraper-extract-tables'),
        ocrCheckbox: document.getElementById('scraper-use-ocr'),
        structureCheckbox: document.getElementById('scraper-extract-structure'),
        chunkSizeInput: document.getElementById('scraper-chunk-size'),

        // Progress elements
        progressContainer: document.getElementById('scraper-progress-container'),
        progressBar: document.getElementById('scraper-progress-bar'),
        progressText: document.getElementById('scraper-progress-text'),
        pdfList: document.getElementById('scraper-pdf-list'),
        cancelButton: document.getElementById('scraper-cancel-btn'),
        resultContainer: document.getElementById('scraper-result-container')
      };

      // Store elements in state for easy access
      state.elements = elements;

      // If some elements are missing, warn but don't fail
      if (!elements.form || !elements.urlList || !elements.progressContainer) {
        console.warn("Some required UI elements for Web Scraper not found");
      }

      // Set initial states and values
      if (elements.chunkSizeInput) {
        elements.chunkSizeInput.value = state.pdfOptions.chunk_size;
      }

      // Initialize URL list if empty
      if (elements.urlList && elements.urlList.children.length === 0) {
        elements.urlList.innerHTML = '<div class="text-muted text-center p-3">No URLs added yet</div>';
      }

      // Update button states
      this.updateStartButtonState();
      this.togglePdfOptions();

    } catch (error) {
      this.handleError(error, "Error registering UI elements for Web Scraper");
    }
  },

  /**
   * Register event listeners
   */
  registerEvents() {
    try {
      const { 
        form, urlInput, addButton, startButton, cancelButton, 
        processCheckbox, tablesCheckbox, ocrCheckbox, structureCheckbox, 
        chunkSizeInput, downloadDir, outputFilename 
      } = state.elements || {};

      // Form submission (prevent default)
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleStartScraping();
        });
      }

      // Add URL button
      if (addButton) {
        addButton.addEventListener('click', this.handleAddUrl.bind(this));
      }

      // URL input - allow adding by pressing Enter
      if (urlInput) {
        urlInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleAddUrl();
          }
        });
      }

      // Start button
      if (startButton) {
        startButton.addEventListener('click', this.handleStartScraping.bind(this));
      }

      // Cancel button
      if (cancelButton) {
        cancelButton.addEventListener('click', this.handleCancelScraping.bind(this));
      }

      // Process PDFs checkbox (to toggle other options)
      if (processCheckbox) {
        processCheckbox.addEventListener('change', this.togglePdfOptions.bind(this));
      }

      // Other PDF option checkboxes
      if (tablesCheckbox) {
        tablesCheckbox.addEventListener('change', () => {
          state.pdfOptions.extract_tables = tablesCheckbox.checked;
        });
      }

      if (ocrCheckbox) {
        ocrCheckbox.addEventListener('change', () => {
          state.pdfOptions.use_ocr = ocrCheckbox.checked;
        });
      }

      if (structureCheckbox) {
        structureCheckbox.addEventListener('change', () => {
          state.pdfOptions.extract_structure = structureCheckbox.checked;
        });
      }

      // Chunk size input
      if (chunkSizeInput) {
        chunkSizeInput.addEventListener('change', () => {
          const value = parseInt(chunkSizeInput.value);
          if (!isNaN(value) && value >= 1024 && value <= 16384) {
            state.pdfOptions.chunk_size = value;
          } else {
            chunkSizeInput.value = state.pdfOptions.chunk_size;
            showToast('Warning', 'Chunk size must be between 1024 and 16384', 'warning');
          }
        });
      }

      // Update start button state when directory or filename changes
      if (downloadDir) {
        downloadDir.addEventListener('input', this.updateStartButtonState.bind(this));
      }

      if (outputFilename) {
        outputFilename.addEventListener('input', this.updateStartButtonState.bind(this));
      }

      // We'll set up socket event listeners when those functions are available
      this.setupSocketEventListeners();

      // Check session storage for ongoing task to recover from page refresh
      this.checkForOngoingTask();

    } catch (error) {
      this.handleError(error, "Error registering events for Web Scraper");
    }
  },

  /**
   * Set up socket event listeners when socket handler is available
   */
  setupSocketEventListeners() {
    // Check if socket functions are available yet
    if (typeof on !== 'function') {
      // Try again later
      setTimeout(() => this.setupSocketEventListeners(), 1000);
      return;
    }

    // Socket events for progress updates
    on('progress_update', this.handleProgressUpdate.bind(this));
    on('pdf_download_progress', this.handlePdfDownloadProgress.bind(this));
    on('task_completed', this.handleTaskCompleted.bind(this));
    on('task_error', this.handleTaskError.bind(this));
    on('task_cancelled', this.handleTaskCancelled.bind(this));

    console.log("Socket event listeners set up in Web Scraper");
  },

  /**
   * Check session storage for an ongoing task to resume
   */
  checkForOngoingTask() {
    try {
      const taskId = sessionStorage.getItem('ongoingTaskId');
      const taskType = sessionStorage.getItem('ongoingTaskType');

      if (taskId && taskType === 'scraper') {
        // Wait for socket functions to be available
        if (typeof startStatusPolling !== 'function') {
          // Try again later
          setTimeout(() => this.checkForOngoingTask(), 1000);
          return;
        }

        // Resume polling for status of the saved task
        state.currentTaskId = taskId;
        startStatusPolling(taskId);

        // Show progress UI
        this.showProgress();

        // Fetch current status to update UI
        fetch(`/api/scrape2/status/${taskId}`)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch task status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            // If task was completed or had an error, show appropriate UI
            if (data.status === 'completed') {
              this.handleTaskCompleted(data);
            } else if (data.status === 'error') {
              this.handleTaskError(data);
            } else if (data.status === 'cancelled') {
              this.handleTaskCancelled(data);
            } else {
              // Task is still running, update progress
              this.handleProgressUpdate(data);

              // Update PDF list if available
              if (data.pdf_downloads) {
                this.updatePdfDownloadsList(data.pdf_downloads);
              }

              showToast('Resumed', 'Resumed monitoring web scraping task', 'info');
            }
          })
          .catch(error => {
            console.error("Error resuming task:", error);
            // If we can't resume the task, clear the state and show the form
            sessionStorage.removeItem('ongoingTaskId');
            sessionStorage.removeItem('ongoingTaskType');
            this.showForm();
          });
      }
    } catch (error) {
      console.error("Error checking for ongoing task:", error);
      // Clear session storage to avoid persistent errors
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
    }
  },

  /**
   * Add a URL to the list
   * @param {Event} event Optional event object
   */
  handleAddUrl(event) {
    try {
      if (event) {
        event.preventDefault();
      }

      const { urlInput, urlList } = state.elements || {};

      if (!urlInput || !urlList) {
        throw new Error("URL input or list element not found");
      }

      const url = urlInput.value.trim();
      if (!url) {
        showToast('Error', 'Please enter a URL', 'error');
        return;
      }

      // Validate URL
      if (!this.isValidUrl(url)) {
        showToast('Error', 'Please enter a valid URL', 'error');
        return;
      }

      // Clear placeholder if present
      if (urlList.children.length === 1 && urlList.children[0].classList.contains('text-muted')) {
        urlList.innerHTML = '';
      }

      // Check for duplicates
      const existingUrls = Array.from(urlList.querySelectorAll('.url-text')).map(span => span.textContent.trim());
      if (existingUrls.includes(url)) {
        showToast('Warning', 'This URL is already in the list', 'warning');
        urlInput.value = '';
        return;
      }

      // Create list item
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item d-flex justify-content-between align-items-center';

      // Detect PDF URLs for better UX
      const isPdf = url.toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('arxiv.org/pdf/');
      const urlClass = isPdf ? 'text-primary' : '';
      const pdfBadge = isPdf ? '<span class="badge bg-primary me-2">PDF</span>' : '';

      listItem.innerHTML = `
        <div class="d-flex align-items-center flex-grow-1 text-truncate">
          ${pdfBadge}
          <span class="url-text ${urlClass}" title="${url}">${url}</span>
        </div>
        <div class="ms-2 d-flex">
          <select class="form-select form-select-sm me-2 scraper-url-setting" style="width: auto;">
            <option value="pdf" ${isPdf ? 'selected' : ''}>PDF</option>
            <option value="full" ${!isPdf ? 'selected' : ''}>Full content</option>
            <option value="metadata">Metadata</option>
            <option value="title">Title only</option>
          </select>
          <button type="button" class="btn btn-sm btn-danger remove-url-btn">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;

      // Add remove button handler
      const removeButton = listItem.querySelector('.remove-url-btn');
      removeButton.addEventListener('click', () => {
        listItem.remove();

        // If list is empty, show placeholder
        if (urlList.children.length === 0) {
          urlList.innerHTML = '<div class="text-muted text-center p-3">No URLs added yet</div>';
        }

        this.updateStartButtonState();
      });

      // Add to list
      urlList.appendChild(listItem);

      // Clear input
      urlInput.value = '';
      urlInput.focus();

      // Update start button state
      this.updateStartButtonState();
    } catch (error) {
      this.handleError(error, "Error adding URL");
    }
  },

  /**
   * Check if a string is a valid URL
   * @param {string} url URL to validate
   * @returns {boolean} Is valid URL
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Update the state of the start button based on form validity
   */
  updateStartButtonState() {
    try {
      const { urlList, downloadDir, outputFilename, startButton } = state.elements || {};

      if (!urlList || !downloadDir || !outputFilename || !startButton) {
        return;
      }

      // Check if the URL list has actual URLs (not just the placeholder)
      const hasUrls = urlList.querySelectorAll('.url-text').length > 0;
      const hasDir = downloadDir.value.trim() !== '';
      const hasFilename = outputFilename.value.trim() !== '';

      startButton.disabled = !(hasUrls && hasDir && hasFilename);
    } catch (error) {
      this.handleError(error, "Error updating start button state");
    }
  },

  /**
   * Toggle PDF processing options based on the process PDFs checkbox
   */
  togglePdfOptions() {
    try {
      const { processCheckbox, tablesCheckbox, ocrCheckbox, structureCheckbox, chunkSizeInput } = state.elements || {};

      if (!processCheckbox) return;

      const enabled = processCheckbox.checked;

      // Update state
      state.pdfOptions.process_pdfs = enabled;

      // Update UI
      if (tablesCheckbox) {
        tablesCheckbox.disabled = !enabled;
        if (enabled) state.pdfOptions.extract_tables = tablesCheckbox.checked;
      }

      if (ocrCheckbox) {
        ocrCheckbox.disabled = !enabled;
        if (enabled) state.pdfOptions.use_ocr = ocrCheckbox.checked;
      }

      if (structureCheckbox) {
        structureCheckbox.disabled = !enabled;
        if (enabled) state.pdfOptions.extract_structure = structureCheckbox.checked;
      }

      if (chunkSizeInput) {
        chunkSizeInput.disabled = !enabled;
      }
    } catch (error) {
      this.handleError(error, "Error toggling PDF options");
    }
  },

  /**
   * Start the scraping process
   */
  handleStartScraping() {
    try {
      // Get form elements
      const { urlList, downloadDir, outputFilename } = state.elements || {};

      if (!urlList || !downloadDir || !outputFilename) {
        throw new Error("Required form elements not found");
      }

      // Collect URLs with their settings
      const urlElements = urlList.querySelectorAll('li:not(.text-muted)');
      if (urlElements.length === 0) {
        showToast('Error', 'Please add at least one URL', 'error');
        return;
      }

      const urlConfigs = Array.from(urlElements).map(li => {
        const url = li.querySelector('.url-text').textContent.trim();
        const setting = li.querySelector('.scraper-url-setting')?.value || 'full';

        return {
          url: url,
          setting: setting,
          download_pdf: setting === 'pdf'
        };
      });

      // Get directory and filename
      const directory = downloadDir.value.trim();
      const filename = outputFilename.value.trim();

      if (!directory) {
        showToast('Error', 'Please specify a download directory', 'error');
        return;
      }

      if (!filename) {
        showToast('Error', 'Please specify an output filename', 'error');
        return;
      }

      // Show loading indicator
      const loading = showLoadingSpinner('Starting scraping...');

      // Get PDF options from form state
      const pdfOptions = this.getPdfOptions();

      // Prepare request data
      const requestData = {
        urls: urlConfigs,
        download_directory: directory,
        outputFilename: filename,
        pdf_options: pdfOptions
      };

      // Call API
      fetch('/api/scrape2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        loading.hide();

        if (data.task_id) {
          // Store task info
          state.currentTaskId = data.task_id;
          state.currentUrls = urlConfigs.map(cfg => cfg.url);

          // Store task info in session storage for recovery
          sessionStorage.setItem('ongoingTaskId', data.task_id);
          sessionStorage.setItem('ongoingTaskType', 'scraper');

          // Start status polling
          if (typeof startStatusPolling === 'function') {
            startStatusPolling(data.task_id);
          } else {
            console.warn("startStatusPolling function not available yet");
          }

          // Show progress UI
          this.showProgress();

          showToast('Started', 'Web scraping started', 'success');
        } else {
          throw new Error('No task ID returned from server');
        }
      })
      .catch(error => {
        loading.hide();
        this.handleError(error, "Error starting scraping");
        showToast('Error', `Failed to start scraping: ${error.message}`, 'error');
      });

    } catch (error) {
      this.handleError(error, "Error starting scraping");
      showToast('Error', `Failed to start scraping: ${error.message}`, 'error');
    }
  },

  /**
   * Get the current PDF options from the form
   * @returns {Object} PDF options
   */
  getPdfOptions() {
    try {
      const { processCheckbox, tablesCheckbox, ocrCheckbox, structureCheckbox, chunkSizeInput } = state.elements || {};

      // Default values if elements not found
      const options = {
        process_pdfs: true,
        extract_tables: true,
        use_ocr: true,
        extract_structure: true,
        chunk_size: 4096
      };

      // Update with actual values if elements exist
      if (processCheckbox) options.process_pdfs = processCheckbox.checked;
      if (tablesCheckbox) options.extract_tables = tablesCheckbox.checked;
      if (ocrCheckbox) options.use_ocr = ocrCheckbox.checked;
      if (structureCheckbox) options.extract_structure = structureCheckbox.checked;

      if (chunkSizeInput) {
        const value = parseInt(chunkSizeInput.value);
        if (!isNaN(value) && value >= 1024 && value <= 16384) {
          options.chunk_size = value;
        }
      }

      return options;
    } catch (error) {
      this.handleError(error, "Error getting PDF options");
      // Return defaults
      return state.pdfOptions;
    }
  },

  /**
   * Show the progress UI
   */
  showProgress() {
    try {
      const { form, progressContainer, progressBar, progressText, pdfList } = state.elements || {};

      if (!form || !progressContainer) {
        throw new Error("Required UI elements not found");
      }

      // Hide form, show progress
      form.style.display = 'none';
      progressContainer.style.display = 'block';

      // Reset progress bar
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = 'Starting...';

      // Clear PDF list
      if (pdfList) {
        pdfList.innerHTML = '<div class="text-muted text-center p-3">No PDFs downloaded yet</div>';
      }
    } catch (error) {
      this.handleError(error, "Error showing progress UI");
    }
  },

  /**
   * Show the form UI
   */
  showForm() {
    try {
      const { form, progressContainer, resultContainer } = state.elements || {};

      if (!form || !progressContainer || !resultContainer) {
        throw new Error("Required UI elements not found");
      }

      // Show form, hide others
      form.style.display = 'block';
      progressContainer.style.display = 'none';
      resultContainer.style.display = 'none';

      // Clear state
      state.currentTaskId = null;
      state.currentUrls = [];

      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');

      // Stop polling if it's still active
      if (typeof stopStatusPolling === 'function') {
        stopStatusPolling();
      }
    } catch (error) {
      this.handleError(error, "Error showing form UI");
    }
  },

  /**
   * Handle progress updates from Socket.IO
   * @param {Object} data Progress data
   */
  handleProgressUpdate(data) {
    try {
      // Check if this update is for our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;

      // Update progress bar
      const { progressBar, progressText } = state.elements || {};

      if (progressBar) progressBar.style.width = `${data.progress}%`;
      if (progressText) {
        if (data.message) {
          progressText.textContent = `${data.message} (${data.progress}%)`;
        } else {
          progressText.textContent = `${data.progress}%`;
        }
      }

      // Handle PDF downloads if present
      if (data.pdf_downloads) {
        this.updatePdfDownloadsList(data.pdf_downloads);
      }
    } catch (error) {
      this.handleError(error, "Error handling progress update");
    }
  },

  /**
   * Handle task error
   * @param {Object} data Error data
   */
  handleTaskError(data) {
    try {
      // Check if this is our task
      if (data.task_id !== state.currentTaskId) return;

      // Show error message
      showToast('Error', data.error || 'An error occurred during web scraping', 'error');

      // Update UI to show error state
      const { progressText } = state.elements || {};
      if (progressText) {
        progressText.textContent = `Error: ${data.error || 'Unknown error'}`;
        progressText.classList.add('text-danger');
      }

      // Stop status polling
      if (typeof stopStatusPolling === 'function') {
        stopStatusPolling();
      }

      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');

      // Add a "New Task" button
      const { progressContainer } = state.elements || {};
      if (progressContainer) {
        const newTaskButton = document.createElement('button');
        newTaskButton.className = 'btn btn-primary mt-3';
        newTaskButton.innerHTML = '<i class="fas fa-plus me-1"></i> New Task';
        newTaskButton.addEventListener('click', () => this.showForm());

        // Check if button already exists
        if (!progressContainer.querySelector('.btn-primary')) {
          progressContainer.appendChild(newTaskButton);
        }
      }
    } catch (error) {
      this.handleError(error, "Error handling task error");
    }
  },

  /**
   * Handle task cancellation
   * @param {Object} data Cancellation data
   */
  handleTaskCancelled(data) {
    try {
      // Check if this is our task
      if (data.task_id !== state.currentTaskId) return;
      
      // Show cancellation message
      showToast('Cancelled', 'Web scraping task was cancelled', 'warning');
      
      // Update UI to show cancelled state
      const { progressText } = state.elements || {};
      if (progressText) {
        progressText.textContent = 'Task cancelled';
        progressText.classList.add('text-warning');
      }
      
      // Stop status polling
      if (typeof stopStatusPolling === 'function') {
        stopStatusPolling();
      }
      
      // Clear session storage
      sessionStorage.removeItem('ongoingTaskId');
      sessionStorage.removeItem('ongoingTaskType');
      
      // Add a "New Task" button
      const { progressContainer } = state.elements || {};
      if (progressContainer) {
        const newTaskButton = document.createElement('button');
        newTaskButton.className = 'btn btn-primary mt-3';
        newTaskButton.innerHTML = '<i class="fas fa-plus me-1"></i> New Task';
        newTaskButton.addEventListener('click', () => this.showForm());
        
        // Check if button already exists
        if (!progressContainer.querySelector('.btn-primary')) {
          progressContainer.appendChild(newTaskButton);
        }
      }
    } catch (error) {
      this.handleError(error, "Error handling task cancellation");
    }
  },

  /**
   * Handle PDF download progress updates
   * @param {Object} data PDF download progress data
   */
  handlePdfDownloadProgress(data) {
    try {
      // Check if this is for our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;

      // Update PDF list item if it exists
      const { pdfList } = state.elements || {};
      if (!pdfList) return;

      const listItem = pdfList.querySelector(`[data-url="${data.url}"]`);
      if (listItem) {
        // Item exists, update it
        this.updatePdfListItem(listItem, data);
      } else {
        // Create new list item if it doesn't exist
        this.addPdfToList(data);
      }
    } catch (error) {
      this.handleError(error, "Error handling PDF download progress");
    }
  },

  /**
   * Update the PDF downloads list
   * @param {Array} pdfDownloads List of PDF downloads
   */
  updatePdfDownloadsList(pdfDownloads) {
    try {
      const { pdfList } = state.elements || {};
      if (!pdfList) return;

      // Remove placeholder if present
      const placeholder = pdfList.querySelector('.text-muted');
      if (placeholder && pdfDownloads.length > 0) {
        placeholder.remove();
      }

      // Add new PDFs to the list
      pdfDownloads.forEach(pdf => {
        const listItem = pdfList.querySelector(`[data-url="${pdf.url}"]`);
        if (!listItem) {
          this.addPdfToList(pdf);
        } else {
          this.updatePdfListItem(listItem, pdf);
        }
      });

      // Add placeholder if list is empty
      if (pdfDownloads.length === 0 && pdfList.children.length === 0) {
        pdfList.innerHTML = '<div class="text-muted text-center p-3">No PDFs downloaded yet</div>';
      }
    } catch (error) {
      this.handleError(error, "Error updating PDF downloads list");
    }
  },

/**
   * Add a PDF to the list
   * @param {Object} pdf PDF download data
   */
addPdfToList(pdf) {
  try {
    const { pdfList } = state.elements || {};
    if (!pdfList) return;

    // Clear placeholder if present
    const placeholder = pdfList.querySelector('.text-muted');
    if (placeholder) {
      placeholder.remove();
    }

    // Create new list item
    const listItem = document.createElement('li');
    listItem.className = 'list-group-item pdf-list-item';
    listItem.setAttribute('data-url', pdf.url);

    // Determine badge class based on status
    let badgeClass = 'bg-secondary';
    switch (pdf.status) {
      case 'downloading':
        badgeClass = 'bg-primary';
        break;
      case 'processing':
        badgeClass = 'bg-info';
        break;
      case 'success':
        badgeClass = 'bg-success';
        break;
      case 'error':
        badgeClass = 'bg-danger';
        break;
    }

    // Extract filename from URL or use shortened URL
    const urlObj = new URL(pdf.url);
    let displayName = urlObj.pathname.split('/').pop() || urlObj.hostname;
    if (displayName.length > 50) {
      displayName = displayName.substring(0, 47) + '...';
    }

    // Show file path if available
    const filePath = pdf.filePath || pdf.file_path || '';
    const fileName = filePath ? filePath.split('/').pop() : '';

    // Build HTML content
    listItem.innerHTML = `
      <div class="d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="text-truncate me-2" title="${pdf.url}">${displayName}</div>
          <span class="badge ${badgeClass} status-badge">${pdf.status}</span>
        </div>
        ${fileName ? `<div class="small text-muted mb-1 file-name">${fileName}</div>` : ''}
        <div class="progress" style="height: 6px;">
          <div class="progress-bar" role="progressbar" style="width: ${pdf.progress || 0}%"></div>
        </div>
        <div class="small text-muted mt-1 status-message">${pdf.message || ''}</div>
      </div>
    `;

    // Add to list
    pdfList.appendChild(listItem);

    // Scroll to bottom to show new items
    pdfList.scrollTop = pdfList.scrollHeight;
  } catch (error) {
    this.handleError(error, "Error adding PDF to list");
  }
},

/**
 * Update an existing PDF list item
 * @param {Element} listItem List item element
 * @param {Object} pdf Updated PDF data
 */
updatePdfListItem(listItem, pdf) {
  try {
    // Update progress bar
    const progressBar = listItem.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${pdf.progress || 0}%`;
    }

    // Update status badge
    const statusBadge = listItem.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = pdf.status;

      // Update badge class based on status
      statusBadge.className = 'badge status-badge';
      switch (pdf.status) {
        case 'downloading':
          statusBadge.classList.add('bg-primary');
          break;
        case 'processing':
          statusBadge.classList.add('bg-info');
          break;
        case 'success':
          statusBadge.classList.add('bg-success');
          break;
        case 'error':
          statusBadge.classList.add('bg-danger');
          break;
        default:
          statusBadge.classList.add('bg-secondary');
      }
    }

    // Update status message
    const statusMessage = listItem.querySelector('.status-message');
    if (statusMessage && pdf.message) {
      statusMessage.textContent = pdf.message;
    }

    // Update file name if available
    const filePath = pdf.filePath || pdf.file_path || '';
    if (filePath) {
      const fileName = filePath.split('/').pop();
      const fileNameElement = listItem.querySelector('.file-name');

      if (fileName) {
        if (fileNameElement) {
          fileNameElement.textContent = fileName;
        } else {
          // Add filename element if it doesn't exist
          const progressElement = listItem.querySelector('.progress');
          if (progressElement) {
            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'small text-muted mb-1 file-name';
            fileNameDiv.textContent = fileName;
            progressElement.parentNode.insertBefore(fileNameDiv, progressElement);
          }
        }
      }
    }

    // If processing succeeded, show tables and document type if available
    if (pdf.status === 'success') {
      const metaInfo = [];

      if (pdf.documentType) {
        metaInfo.push(`Type: ${pdf.documentType}`);
      }

      if (pdf.tablesExtracted && pdf.tablesExtracted > 0) {
        metaInfo.push(`Tables: ${pdf.tablesExtracted}`);
      }

      if (pdf.referencesExtracted && pdf.referencesExtracted > 0) {
        metaInfo.push(`References: ${pdf.referencesExtracted}`);
      }

      if (metaInfo.length > 0) {
        const metaText = metaInfo.join(' | ');
        const statusMessage = listItem.querySelector('.status-message');

        if (statusMessage) {
          statusMessage.innerHTML = `<span class="text-success">${metaText}</span>`;
        }
      }
    }
  } catch (error) {
    this.handleError(error, "Error updating PDF list item");
  }
},

/**
 * Handle task completion
 * @param {Object} data Completion data
 */
handleTaskCompleted(data) {
  try {
    // Check if this is our task
    if (data.task_id !== state.currentTaskId) return;

    // Update progress to 100%
    const { progressBar, progressText } = state.elements || {};

    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = 'Completed (100%)';

    // Show result container
    this.showResultContainer(data);

    // Show toast notification
    showToast('Completed', 'Web scraping completed successfully', 'success');

    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');

    // Stop status polling
    if (typeof stopStatusPolling === 'function') {
      stopStatusPolling();
    }
  } catch (error) {
    this.handleError(error, "Error handling task completion");
  }
},

/**
 * Show the result container with completion data
 * @param {Object} data Completion data
 */
showResultContainer(data) {
  try {
    const { progressContainer, resultContainer } = state.elements || {};

    if (!progressContainer || !resultContainer) {
      throw new Error("Required UI elements not found");
    }

    // Hide progress, show result
    progressContainer.style.display = 'none';
    resultContainer.style.display = 'block';

    // Format processing time
    const processingTime = data.stats?.processing_time_seconds || data.stats?.duration_seconds || 0;
    const formattedTime = typeof formatDuration === 'function' 
      ? formatDuration(processingTime) 
      : `${Math.round(processingTime)} seconds`;

    // Get PDF downloads stats
    const totalFiles = data.stats?.pdf_downloads_count || data.stats?.total_files || 0;
    const successfulDownloads = data.stats?.successful_urls || data.stats?.successful_downloads || 0;
    const failedDownloads = data.stats?.failed_urls || data.stats?.failed_downloads || 0;

    // Populate result container
    resultContainer.innerHTML = `
      <div class="alert alert-success mb-4">
        <h4 class="alert-heading">Scraping Completed</h4>
        <p>The web scraping task has been completed successfully.</p>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Results</h5>
        </div>
        <div class="card-body">
          <p><strong>Output File:</strong> ${data.output_file}</p>
          <p><strong>URLs Processed:</strong> ${data.stats?.total_urls || 'N/A'}</p>
          <p><strong>Successful URLs:</strong> ${data.stats?.successful_urls || 'N/A'}</p>
          <p><strong>Failed URLs:</strong> ${data.stats?.failed_urls || 'N/A'}</p>
          <p><strong>PDF Downloads:</strong> ${totalFiles}</p>
          <p><strong>Processing Time:</strong> ${formattedTime}</p>
        </div>
        <div class="card-footer">
          <button type="button" class="btn btn-primary me-2" id="scraper-open-output">
            <i class="fas fa-folder-open me-1"></i> Open Output
          </button>
          <button type="button" class="btn btn-secondary me-2" id="scraper-download-output">
            <i class="fas fa-download me-1"></i> Download Output
          </button>
          <button type="button" class="btn btn-outline-primary" id="scraper-new-task">
            <i class="fas fa-plus me-1"></i> New Task
          </button>
        </div>
      </div>
    `;

    // Add event listeners to buttons
    const openButton = document.getElementById('scraper-open-output');
    const downloadButton = document.getElementById('scraper-download-output');
    const newTaskButton = document.getElementById('scraper-new-task');

    if (openButton) {
      openButton.addEventListener('click', () => this.handleOpenOutput(data.output_file));
    }

    if (downloadButton) {
      downloadButton.addEventListener('click', () => this.handleDownloadOutput(data.output_file));
    }

    if (newTaskButton) {
      newTaskButton.addEventListener('click', () => this.showForm());
    }

    // Add PDF summary if downloads are available
    if (data.pdf_downloads && data.pdf_downloads.length > 0) {
      this.addPdfSummaryToResults(data.pdf_downloads, resultContainer);
    }
  } catch (error) {
    this.handleError(error, "Error showing result container");
  }
},

/**
 * Add PDF download summary to results
 * @param {Array} pdfDownloads PDF downloads array
 * @param {Element} container Result container
 */
addPdfSummaryToResults(pdfDownloads, container) {
  try {
    // Count status types
    const statusCounts = {
      success: 0,
      error: 0,
      processing: 0,
      downloading: 0
    };

    pdfDownloads.forEach(pdf => {
      const status = pdf.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Create PDF summary card
    const summaryCard = document.createElement('div');
    summaryCard.className = 'card mb-4';
    summaryCard.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">PDF Downloads</h5>
        <button class="btn btn-sm btn-outline-secondary" id="scraper-toggle-pdfs">
          <i class="fas fa-chevron-down"></i> Show Details
        </button>
      </div>
      <div class="card-body">
        <div class="d-flex justify-content-between mb-3">
          <span class="text-success">
            <i class="fas fa-check-circle"></i> Success: ${statusCounts.success || 0}
          </span>
          <span class="text-danger">
            <i class="fas fa-times-circle"></i> Errors: ${statusCounts.error || 0}
          </span>
          <span class="text-info">
            <i class="fas fa-spinner"></i> Processing: ${statusCounts.processing || 0}
          </span>
          <span class="text-primary">
            <i class="fas fa-download"></i> Downloading: ${statusCounts.downloading || 0}
          </span>
        </div>
        <div id="scraper-pdf-details" style="display: none;">
          <ul class="list-group" id="scraper-pdf-results-list">
            <!-- PDF items will be populated here -->
          </ul>
        </div>
      </div>
    `;

    // Add to container
    container.appendChild(summaryCard);

    // Add toggle handler
    const toggleButton = summaryCard.querySelector('#scraper-toggle-pdfs');
    const detailsSection = summaryCard.querySelector('#scraper-pdf-details');
    const pdfList = summaryCard.querySelector('#scraper-pdf-results-list');

    if (toggleButton && detailsSection && pdfList) {
      toggleButton.addEventListener('click', () => {
        const isVisible = detailsSection.style.display !== 'none';

        if (isVisible) {
          detailsSection.style.display = 'none';
          toggleButton.innerHTML = '<i class="fas fa-chevron-down"></i> Show Details';
        } else {
          // Populate list only when expanded
          this.populatePdfResultsList(pdfDownloads, pdfList);
          detailsSection.style.display = 'block';
          toggleButton.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Details';
        }
      });
    }
  } catch (error) {
    this.handleError(error, "Error adding PDF summary");
  }
},

/**
 * Populate PDF results list
 * @param {Array} pdfDownloads PDF downloads array
 * @param {Element} listElement List element to populate
 */
populatePdfResultsList(pdfDownloads, listElement) {
  try {
    // Clear existing content
    listElement.innerHTML = '';

    // Add items for each PDF
    pdfDownloads.forEach(pdf => {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item';

      // Get file name if available
      const filePath = pdf.filePath || pdf.file_path || '';
      const fileName = filePath ? filePath.split('/').pop() : '';

      // Status badge
      let badgeClass = 'bg-secondary';
      switch (pdf.status) {
        case 'downloading':
          badgeClass = 'bg-primary';
          break;
        case 'processing':
          badgeClass = 'bg-info';
          break;
        case 'success':
          badgeClass = 'bg-success';
          break;
        case 'error':
          badgeClass = 'bg-danger';
          break;
      }

      // URL and filename
      const url = pdf.url;
      const urlDisplay = url.length > 50 ? url.substring(0, 47) + '...' : url;

      // Build content
      listItem.innerHTML = `
        <div class="d-flex flex-column">
          <div class="d-flex justify-content-between align-items-center">
            <div class="text-truncate me-2" title="${url}">${urlDisplay}</div>
            <span class="badge ${badgeClass}">${pdf.status}</span>
          </div>
          ${fileName ? `<div class="small text-muted mt-1">${fileName}</div>` : ''}
          ${pdf.message ? `<div class="small ${pdf.status === 'error' ? 'text-danger' : 'text-muted'} mt-1">${pdf.message}</div>` : ''}
        </div>
      `;

      listElement.appendChild(listItem);
    });
  } catch (error) {
    this.handleError(error, "Error populating PDF results list");
  }
},

/**
 * Handle opening the output file
 * @param {string} outputFile Path to output file
 */
handleOpenOutput(outputFile) {
  try {
    if (!outputFile) {
      showToast('Error', 'Output file path not available', 'error');
      return;
    }

    // Call the API to open the file
    fetch('/api/open-file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: outputFile })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        showToast('Success', 'Opening output file', 'success');
      } else {
        throw new Error(data.message || 'Failed to open file');
      }
    })
    .catch(error => {
      this.handleError(error, "Error opening output file");
      showToast('Error', `Failed to open file: ${error.message}`, 'error');
    });
  } catch (error) {
    this.handleError(error, "Error opening output file");
    showToast('Error', `Failed to open file: ${error.message}`, 'error');
  }
},

/**
 * Handle downloading the output file
 * @param {string} outputFile Path to output file
 */
handleDownloadOutput(outputFile) {
  try {
    if (!outputFile) {
      showToast('Error', 'Output file path not available', 'error');
      return;
    }

    // Create a temporary link for download
    const link = document.createElement('a');
    link.href = `/download/${encodeURIComponent(outputFile)}`;
    link.download = outputFile.split('/').pop() || 'output.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Success', 'Download started', 'success');
  } catch (error) {
    this.handleError(error, "Error downloading output file");
    showToast('Error', `Failed to download file: ${error.message}`, 'error');
  }
},

/**
 * Handle canceling the scraping task
 */
handleCancelScraping() {
  try {
    const taskId = state.currentTaskId;
    if (!taskId) {
      showToast('Error', 'No active scraping task to cancel', 'error');
      return;
    }

    // Confirm cancellation
    if (!confirm('Are you sure you want to cancel the current scraping task?')) {
      return;
    }

    // Show loading indicator
    const loading = showLoadingSpinner('Canceling task...');

    // Call the cancel API
    fetch(`/api/scrape2/cancel/${taskId}`, {
      method: 'POST'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      loading.hide();

      if (data.status === 'cancelled') {
        showToast('Cancelled', 'Scraping task cancelled successfully', 'success');

        // Update status text
        const { progressText } = state.elements || {};
        if (progressText) {
          progressText.textContent = 'Task cancelled';
          progressText.classList.add('text-warning');
        }

        // Add "New Task" button
        const { progressContainer } = state.elements || {};
        if (progressContainer) {
          const newTaskButton = document.createElement('button');
          newTaskButton.className = 'btn btn-primary mt-3';
          newTaskButton.innerHTML = '<i class="fas fa-plus me-1"></i> New Task';
          newTaskButton.addEventListener('click', () => this.showForm());

          // Check if button already exists
          if (!progressContainer.querySelector('.btn-primary')) {
            progressContainer.appendChild(newTaskButton);
          }
        }

        // Clear session storage
        sessionStorage.removeItem('ongoingTaskId');
        sessionStorage.removeItem('ongoingTaskType');

        // Stop status polling
        if (typeof stopStatusPolling === 'function') {
          stopStatusPolling();
        }
      } else {
        throw new Error(data.message || 'Failed to cancel task');
      }
    })
    .catch(error => {
      loading.hide();
      this.handleError(error, "Error cancelling task");
      showToast('Error', `Failed to cancel task: ${error.message}`, 'error');
    });
  } catch (error) {
    this.handleError(error, "Error cancelling scraping task");
    showToast('Error', `Failed to cancel task: ${error.message}`, 'error');
  }
},

/**
 * Handle error in web scraper module
 * @param {Error} error Error object
 * @param {string} context Error context description
 */
handleError(error, context = 'Web Scraper Error') {
  console.error(`[Web Scraper] ${context}:`, error);

  // Use error handler if available
  if (typeof handleError === 'function') {
    handleError(error, 'WEB_SCRAPER', false);
  }

  // Show error message in UI if not already handled
  if (!error.handled) {
    showToast('Error', error.message || 'An unknown error occurred', 'error');
    error.handled = true;
  }
}
};

// Export the module with default export
export default webScraper;

// Named exports for important functions
export const initialize = webScraper.initialize.bind(webScraper);
export const showForm = webScraper.showForm.bind(webScraper);
export const showProgress = webScraper.showProgress.bind(webScraper);
export const handleStartScraping = webScraper.handleStartScraping.bind(webScraper);
export const handleCancelScraping = webScraper.handleCancelScraping.bind(webScraper);
export const handleAddUrl = webScraper.handleAddUrl.bind(webScraper);
export const handleTaskCompleted = webScraper.handleTaskCompleted.bind(webScraper);
export const handleTaskError = webScraper.handleTaskError.bind(webScraper);
export const updatePdfDownloadsList = webScraper.updatePdfDownloadsList.bind(webScraper);
export const handleOpenOutput = webScraper.handleOpenOutput.bind(webScraper);