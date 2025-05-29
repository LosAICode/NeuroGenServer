/**
 * Web Scraper Module
 * 
 * Handles web scraping operations, academic paper searches, and PDF downloads.
 * Integrated with the backend Python functionality for extracting web content
 * and downloading PDFs with advanced processing options.
 * 
 * Key features:
 * 1. Web scraping with multiple content extraction options
 * 2. Academic paper search with multiple sources
 * 3. PDF downloading with metadata extraction
 * 4. Progress tracking and status updates
 * 5. Task cancellation and error handling
 * 
 * @module webScraper
 */

// Import only what we actually use from UI utilities
import { 
  showToast, 
  showLoadingSpinner 
} from '../utils/ui.js';

// Import only the error handler we actually use
import { handleError } from '../utils/errorHandler.js';

// Import only the DOM utilities we actually use
import { 
  getElement, 
  getUIElements
} from '../utils/domUtils.js';

// Import only the progress handler utilities we actually use
import { 
  trackProgress, 
  updateProgressUI, 
  createProgressUI,
  cancelTracking
} from '../utils/progressHandler.js';

// Import Blueprint API service and configuration
import blueprintApi from '../services/blueprintApi.js';
import { SCRAPER_ENDPOINTS, ACADEMIC_ENDPOINTS, FILE_ENDPOINTS } from '../config/endpoints.js';
import { SOCKET_EVENTS, BLUEPRINT_EVENTS } from '../config/socketEvents.js';

// Socket handler for real-time communication
let socketHandler = null;
let socketHandlerFunctions = {
  // Default fallback implementations
  startStatusPolling: (taskId) => console.warn("Socket handler not loaded: startStatusPolling", taskId),
  stopStatusPolling: () => console.warn("Socket handler not loaded: stopStatusPolling"),
  cancelTask: () => Promise.reject(new Error("Socket handler not loaded")),
  isConnected: () => false,
  registerTaskHandler: () => console.warn("Socket handler not loaded: registerTaskHandler"),
  emit: () => console.warn("Socket handler not loaded: emit")
};

// Dynamically import socket functions to avoid circular dependencies
import('../utils/socketHandler.js')
  .then(module => {
    socketHandler = module.default || module;
    
    // Extract key functions we'll need
    socketHandlerFunctions = {
      startStatusPolling: module.startStatusPolling || module.default?.startStatusPolling || socketHandlerFunctions.startStatusPolling,
      stopStatusPolling: module.stopStatusPolling || module.default?.stopStatusPolling || socketHandlerFunctions.stopStatusPolling,
      cancelTask: module.cancelTask || module.default?.cancelTask || socketHandlerFunctions.cancelTask,
      isConnected: module.isConnected || module.default?.isConnected || socketHandlerFunctions.isConnected,
      registerTaskHandler: module.registerTaskHandler || module.default?.registerTaskHandler || socketHandlerFunctions.registerTaskHandler,
      emit: module.emit || module.default?.emit || socketHandlerFunctions.emit
    };
    
    console.log("Socket handler loaded successfully in webScraper");
  })
  .catch(err => {
    console.error("Could not import socketHandler in webScraper:", err);
  });

// Module API endpoints aligned with Blueprint structure
const API_ENDPOINTS = {
  SCRAPE: SCRAPER_ENDPOINTS.SCRAPE,
  SCRAPE_STATUS: SCRAPER_ENDPOINTS.STATUS,
  SCRAPE_CANCEL: SCRAPER_ENDPOINTS.CANCEL,
  SCRAPE_RESULTS: SCRAPER_ENDPOINTS.RESULTS,
  ACADEMIC_SEARCH: ACADEMIC_ENDPOINTS.SEARCH,
  ACADEMIC_HEALTH: ACADEMIC_ENDPOINTS.HEALTH,
  OPEN_FILE: FILE_ENDPOINTS.OPEN_FILE,  // Using Blueprint file endpoints
  DOWNLOAD: '/download'
};

// Module internal state
const state = {
  initialized: false,
  currentTaskId: null,
  currentUrls: [],
  scrapeInProgress: false,
  taskProgress: {},
  pdfOptions: {
    process_pdfs: true,
    extract_tables: true,
    use_ocr: true,
    extract_structure: true,
    chunk_size: 4096,
    max_downloads: 10  // Default PDF download limit
  },
  academicSearchResults: [],
  selectedPapers: [],
  pdfDownloads: [],
  eventListeners: [],
  elements: {}
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

      // Check for ongoing tasks
      this.checkForOngoingTask();

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
   * Register UI elements with selectors
   */
  registerUIElements() {
    try {
      // Use getUIElements to efficiently register all elements at once
      state.elements = getUIElements({
        // Form elements
        form: 'scraper-form',
        formContainer: 'scraper-form-container',
        urlsContainer: 'scraper-urls-container',
        addUrlBtn: 'add-scraper-url',
        downloadDir: 'download-directory',
        browseBtn: 'download-dir-browse-btn',
        outputFilename: 'scraper-output',
        startButton: 'scrape-btn',
        
        // Academic search elements
        academicSearchInput: 'academic-search-input',
        academicSources: 'academic-sources',
        academicSearchBtn: 'academic-search-btn',
        academicResults: 'academic-results',
        academicResultsContainer: 'academic-results-container',
        addSelectedPapersBtn: 'add-selected-papers',
        
        // PDF options
        pdfInfoSection: 'pdf-info-section',
        processPdfSwitch: 'process-pdf-switch',

        // Progress elements
        progressContainer: 'scraper-progress-container',
        progressBar: 'scraper-progress-bar',
        progressStatus: 'scraper-progress-status',
        progressStats: 'scraper-progress-stats',
        pdfDownloadProgress: 'pdf-download-progress',
        pdfDownloadsList: 'pdf-downloads-list',
        cancelButton: 'scraper-cancel-btn',
        
        // Results elements
        resultsContainer: 'scraper-results-container',
        statsContainer: 'scraper-stats',
        results: 'scraper-results',
        openJsonBtn: 'open-scraper-json',
        openFolderBtn: 'open-output-folder',
        newTaskBtn: 'scraper-new-task-btn'
      });

      // If some elements are missing, warn but don't fail
      if (!state.elements.form || !state.elements.urlsContainer || !state.elements.progressContainer) {
        console.warn("Some required UI elements for Web Scraper not found");
      }

      // Create initial URL input field if container is empty
      this.ensureUrlInputExists();

      // Handle PDF mode toggle
      this.updatePdfInfoVisibility();

      // Update button states
      this.updateStartButtonState();

    } catch (error) {
      this.handleError(error, "Error registering UI elements for Web Scraper");
    }
  },

  /**
   * Ensure at least one URL input field exists
   */
  ensureUrlInputExists() {
    const { urlsContainer } = state.elements;
    if (!urlsContainer) return;

    if (urlsContainer.children.length === 0) {
      this.addUrlInput();
    }
  },

  /**
   * Add a new URL input field
   */
  addUrlInput() {
    const { urlsContainer } = state.elements;
    if (!urlsContainer) return;

    const urlGroup = document.createElement('div');
    urlGroup.className = 'input-group mb-2';
    
    urlGroup.innerHTML = `
      <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required>
      <select class="form-select scraper-settings" style="max-width: 160px;">
        <option value="full">Full Text</option>
        <option value="metadata">Metadata Only</option>
        <option value="title">Title Only</option>
        <option value="keyword">Keyword Search</option>
        <option value="pdf">PDF Download</option>
      </select>
      <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;">
      <button type="button" class="btn btn-outline-danger remove-url">
        <i class="fas fa-trash"></i>
      </button>
    `;

    // Add event listeners
    const settingsSelect = urlGroup.querySelector('.scraper-settings');
    const keywordInput = urlGroup.querySelector('.scraper-keyword');
    const removeBtn = urlGroup.querySelector('.remove-url');

    // Settings change handler
    settingsSelect.addEventListener('change', () => {
      const isKeywordMode = settingsSelect.value === 'keyword';
      keywordInput.style.display = isKeywordMode ? 'block' : 'none';
      this.updatePdfInfoVisibility();
      this.updateStartButtonState();
    });

    // Remove button handler
    removeBtn.addEventListener('click', () => {
      urlGroup.remove();
      // Ensure at least one URL input exists
      if (urlsContainer.children.length === 0) {
        this.addUrlInput();
      }
      this.updateStartButtonState();
      this.updatePdfInfoVisibility();
    });

    urlsContainer.appendChild(urlGroup);
    this.updateStartButtonState();
  },

  /**
   * Update the visibility of PDF info section based on selected modes
   */
  updatePdfInfoVisibility() {
    const { pdfInfoSection, processPdfSwitch } = state.elements;
    if (!pdfInfoSection) return;

    const pdfModeSelected = Array.from(document.querySelectorAll('.scraper-settings'))
      .some(select => select.value === 'pdf');

    pdfInfoSection.classList.toggle('d-none', !pdfModeSelected);
    
    // Update PDF processing option state
    if (processPdfSwitch && pdfModeSelected) {
      state.pdfOptions.process_pdfs = processPdfSwitch.checked;
    }
  },

  /**
   * Register event listeners
   */
  registerEvents() {
    try {
      const { 
        form, addUrlBtn, browseBtn, processPdfSwitch,
        academicSearchBtn, addSelectedPapersBtn,
        cancelButton, openJsonBtn, openFolderBtn, newTaskBtn
      } = state.elements;

      // Helper function to safely add and track event listeners
      const addTrackedListener = (element, event, handler) => {
        if (!element) return;
        
        const boundHandler = handler.bind(this);
        element.addEventListener(event, boundHandler);
        state.eventListeners.push({ element, event, handler: boundHandler });
      };

      // Form submission
      if (form) {
        addTrackedListener(form, 'submit', (e) => {
          e.preventDefault();
          this.startScraping();
        });
      }

      // Add URL button
      if (addUrlBtn) {
        addTrackedListener(addUrlBtn, 'click', this.addUrlInput);
      }

      // Browse button for download directory
      if (browseBtn) {
        addTrackedListener(browseBtn, 'click', this.browseDirectory);
      }

      // PDF processing switch
      if (processPdfSwitch) {
        addTrackedListener(processPdfSwitch, 'change', () => {
          state.pdfOptions.process_pdfs = processPdfSwitch.checked;
        });
      }

      // Academic search button
      if (academicSearchBtn) {
        addTrackedListener(academicSearchBtn, 'click', this.performAcademicSearch);
      }

      // Add selected papers button
      if (addSelectedPapersBtn) {
        addTrackedListener(addSelectedPapersBtn, 'click', this.addSelectedPapers);
      }

      // Cancel button
      if (cancelButton) {
        addTrackedListener(cancelButton, 'click', this.cancelScraping);
      }

      // Open JSON button
      if (openJsonBtn) {
        addTrackedListener(openJsonBtn, 'click', () => {
          if (state.taskProgress.output_file) {
            this.openFile(state.taskProgress.output_file);
          }
        });
      }

      // Open folder button
      if (openFolderBtn) {
        addTrackedListener(openFolderBtn, 'click', () => {
          if (state.taskProgress.output_file) {
            const folderPath = state.taskProgress.output_file.split(/[\/\\]/).slice(0, -1).join('/');
            this.openFolder(folderPath);
          }
        });
      }

      // New task button
      if (newTaskBtn) {
        addTrackedListener(newTaskBtn, 'click', this.resetAndShowForm);
      }

      console.log("Event listeners registered for Web Scraper");
    } catch (error) {
      this.handleError(error, "Error registering events for Web Scraper");
    }
  },

  /**
   * Unregister all event listeners to prevent memory leaks
   */
  unregisterAllEvents() {
    try {
      state.eventListeners.forEach(({ element, event, handler }) => {
        if (element && element.removeEventListener) {
          element.removeEventListener(event, handler);
        }
      });
      state.eventListeners = [];
    } catch (error) {
      this.handleError(error, "Error unregistering events");
    }
  },

  /**
   * Check session storage for an ongoing task to resume
   */
  checkForOngoingTask() {
    try {
      const taskId = sessionStorage.getItem('ongoingTaskId');
      const taskType = sessionStorage.getItem('ongoingTaskType');

      if (taskId && taskType === 'scraper') {
        console.log(`Found ongoing scraper task: ${taskId}`);

        // Resume task tracking
        state.currentTaskId = taskId;
        state.scrapeInProgress = true;

        // Set up task tracking with progress handler
        this.setupTaskTracking(taskId);

        // Show progress UI
        this.showProgressContainer();

        // Fetch current status
        this.fetchTaskStatus(taskId)
          .then(data => {
            // Update UI based on task status
            if (data.status === 'completed') {
              this.handleTaskCompleted(data);
            } else if (data.status === 'error' || data.status === 'failed') {
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
            this.resetTaskState();
            this.showFormContainer();
          });
      }
    } catch (error) {
      console.error("Error checking for ongoing task:", error);
      // Clear session storage to avoid persistent errors
      this.resetTaskState();
    }
  },

  /**
   * Set up task tracking with progress handler
   * @param {string} taskId - Task ID to track
   */
  setupTaskTracking(taskId) {
    try {
      // Use the progress handler to track task progress
      const progressElement = state.elements.progressContainer;
      
      if (progressElement) {
        // Create progress UI elements if they don't exist
        const progressBarId = 'scraper-progress-bar';
        
        if (!getElement(progressBarId)) {
          createProgressUI(progressElement.id, 'scraper');
        }
        
        // Set up task progress tracking
        trackProgress(taskId, {
          elementPrefix: 'scraper',
          taskType: 'scraper',
          saveToSessionStorage: true
        });
        
        console.log(`Task tracking set up for task: ${taskId}`);
      }
      
      // Register task handlers via socketHandler
      if (socketHandlerFunctions.registerTaskHandler) {
        socketHandlerFunctions.registerTaskHandler(taskId, {
          onProgress: this.handleProgressUpdate.bind(this),
          onComplete: this.handleTaskCompleted.bind(this),
          onError: this.handleTaskError.bind(this),
          onCancel: this.handleTaskCancelled.bind(this)
        });
      }
    } catch (error) {
      this.handleError(error, "Error setting up task tracking");
    }
  },

  /**
   * Reset task state and clear session storage
   */
  resetTaskState() {
    state.currentTaskId = null;
    state.currentUrls = [];
    state.scrapeInProgress = false;
    state.pdfDownloads = [];
    state.taskProgress = {};
    
    // Clear session storage
    sessionStorage.removeItem('ongoingTaskId');
    sessionStorage.removeItem('ongoingTaskType');
    sessionStorage.removeItem('taskStartTime');
    
    // Stop any polling
    if (socketHandlerFunctions.stopStatusPolling) {
      socketHandlerFunctions.stopStatusPolling();
    }
    
    // Cancel task tracking
    if (state.currentTaskId && cancelTracking) {
      cancelTracking(state.currentTaskId);
    }
  },

  /**
   * Update the state of the start button based on form validity
   */
  updateStartButtonState() {
    try {
      const { startButton, urlsContainer, downloadDir, outputFilename } = state.elements;

      if (!startButton || !urlsContainer || !downloadDir || !outputFilename) {
        return;
      }

      // Check if the URL inputs have values
      const urlInputs = urlsContainer.querySelectorAll('.scraper-url');
      const hasUrls = Array.from(urlInputs).some(input => input.value.trim() !== '');
      
      // Check if keyword inputs have values when in keyword mode
      const keywordGroups = Array.from(urlsContainer.children).filter(group => {
        const select = group.querySelector('.scraper-settings');
        return select && select.value === 'keyword';
      });
      
      const keywordsValid = keywordGroups.every(group => {
        const keywordInput = group.querySelector('.scraper-keyword');
        return keywordInput && keywordInput.value.trim() !== '';
      });
      
      // Check directory and filename
      const hasDir = downloadDir.value.trim() !== '';
      const hasFilename = outputFilename.value.trim() !== '';

      // Enable button only if all required fields are filled
      startButton.disabled = !(hasUrls && (keywordGroups.length === 0 || keywordsValid) && hasDir && hasFilename);
    } catch (error) {
      this.handleError(error, "Error updating start button state");
    }
  },

  /**
   * Browse for download directory
   */
  browseDirectory() {
    try {
      // Show native folder picker dialog
      const options = {
        title: 'Select Download Directory',
        buttonLabel: 'Select Folder',
      };
      
      // Use system file picker via IPC
      if (window.electron) {
        window.electron.openDirectoryDialog(options)
          .then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
              state.elements.downloadDir.value = result.filePaths[0];
              this.updateStartButtonState();
            }
          })
          .catch(error => {
            this.handleError(error, "Error opening directory dialog");
          });
      } else {
        // Use Blueprint API for directory operations
        try {
          const data = await blueprintApi.request('/api/open-directory-dialog', {
            method: 'POST',
            body: JSON.stringify(options)
          }, 'core');
          
          if (data.success && data.path) {
            state.elements.downloadDir.value = data.path;
            this.updateStartButtonState();
          }
        } catch (error) {
          this.handleError(error, "Error opening directory dialog");
        }
      }
    } catch (error) {
      this.handleError(error, "Error browsing for directory");
    }
  },

  /**
   * Perform academic search
   */
  performAcademicSearch() {
    try {
      const { academicSearchInput, academicSources, academicResults, academicResultsContainer } = state.elements;
      
      if (!academicSearchInput || !academicSources || !academicResults || !academicResultsContainer) {
        return;
      }
      
      const query = academicSearchInput.value.trim();
      if (!query) {
        showToast('Error', 'Please enter a search query', 'error');
        return;
      }
      
      const source = academicSources.value;
      
      // Show loading
      const loading = showLoadingSpinner('Searching academic sources...');
      academicResultsContainer.innerHTML = '<div class="text-center my-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Searching...</p></div>';
      
      // Show results area
      academicResults.classList.remove('d-none');
      
      // Perform search using Blueprint API
      blueprintApi.searchAcademicPapers(query, [source], 50)
        .then(data => {
          loading.hide();
          
          if (data.results && data.results.length > 0) {
            // Store results in state
            state.academicSearchResults = data.results;
            
            // Display results
            this.displayAcademicResults(data.results);
          } else {
            academicResultsContainer.innerHTML = '<div class="alert alert-info">No results found. Try a different query or source.</div>';
          }
        })
        .catch(error => {
          loading.hide();
          this.handleError(error, "Error performing academic search");
          academicResultsContainer.innerHTML = `<div class="alert alert-danger">Error searching: ${error.message}</div>`;
        });
    } catch (error) {
      this.handleError(error, "Error performing academic search");
    }
  },

  /**
   * Display academic search results
   * @param {Array} results - Academic search results
   */
  displayAcademicResults(results) {
    try {
      const { academicResultsContainer } = state.elements;
      
      if (!academicResultsContainer) return;
      
      // Clear previous results
      academicResultsContainer.innerHTML = '';
      
      // Create list items for each result
      results.forEach((result, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'list-group-item d-flex flex-column';
        
        // Format authors
        const authors = Array.isArray(result.authors) 
          ? result.authors.join(', ') 
          : (result.authors || 'Unknown authors');
        
        // Create checkbox for selection
        const hasPdf = result.pdf_url || result.links?.some(link => 
          link.includes('.pdf') || 
          link.includes('pdf') || 
          link.includes('fulltext')
        );
        
        resultItem.innerHTML = `
          <div class="d-flex align-items-start">
            <div class="form-check me-2">
              <input class="form-check-input paper-select" type="checkbox" value="${index}" id="paper-${index}">
              <label class="form-check-label" for="paper-${index}"></label>
            </div>
            <div class="flex-grow-1">
              <h6 class="mb-1">${result.title || 'Untitled'}</h6>
              <p class="mb-1 small">${authors}</p>
              <p class="mb-1 text-muted smaller">${result.journal || result.venue || ''} ${result.year || ''}</p>
              <div class="d-flex flex-wrap gap-2 mt-1">
                ${hasPdf ? '<span class="badge bg-success">PDF Available</span>' : ''}
                ${result.doi ? `<span class="badge bg-info">DOI: ${result.doi}</span>` : ''}
                ${result.url ? `<a href="${result.url}" class="badge bg-primary text-decoration-none" target="_blank">Source</a>` : ''}
              </div>
            </div>
          </div>
        `;
        
        academicResultsContainer.appendChild(resultItem);
      });
    } catch (error) {
      this.handleError(error, "Error displaying academic results");
    }
  },

  /**
   * Add selected papers to URL list
   */
  addSelectedPapers() {
    try {
      const { academicResultsContainer } = state.elements;
      
      if (!academicResultsContainer) return;
      
      // Get selected papers
      const selectedCheckboxes = academicResultsContainer.querySelectorAll('.paper-select:checked');
      
      if (selectedCheckboxes.length === 0) {
        showToast('Warning', 'Please select at least one paper', 'warning');
        return;
      }
      
      // Add each selected paper to the URL list
      selectedCheckboxes.forEach(checkbox => {
        const index = parseInt(checkbox.value);
        const paper = state.academicSearchResults[index];
        
        if (!paper) return;
        
        // Get best URL for paper (prefer PDF)
        let url = '';
        if (paper.pdf_url) {
          url = paper.pdf_url;
        } else if (paper.links && Array.isArray(paper.links)) {
          // Find PDF link
          const pdfLink = paper.links.find(link => 
            link.includes('.pdf') || 
            link.includes('pdf') || 
            link.includes('fulltext')
          );
          url = pdfLink || paper.url || paper.links[0] || '';
        } else {
          url = paper.url || paper.doi ? `https://doi.org/${paper.doi}` : '';
        }
        
        if (!url) return;
        
        // Add URL to list as PDF
        this.addUrlWithValue(url, 'pdf');
      });
      
      // Update PDF info visibility
      this.updatePdfInfoVisibility();
      
      // Show success message
      showToast('Success', `Added ${selectedCheckboxes.length} paper(s) to scraping list`, 'success');
      
      // Uncheck the checkboxes
      selectedCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    } catch (error) {
      this.handleError(error, "Error adding selected papers");
    }
  },

  /**
   * Add a new URL input with a specific value and setting
   * @param {string} url - URL to add
   * @param {string} setting - Setting to select
   */
  addUrlWithValue(url, setting = 'full') {
    try {
      const { urlsContainer } = state.elements;
      if (!urlsContainer) return;
      
      // Add a new URL input
      this.addUrlInput();
      
      // Get the last added URL input
      const lastUrlGroup = urlsContainer.lastElementChild;
      if (!lastUrlGroup) return;
      
      // Set URL value
      const urlInput = lastUrlGroup.querySelector('.scraper-url');
      if (urlInput) {
        urlInput.value = url;
      }
      
      // Set setting value
      const settingSelect = lastUrlGroup.querySelector('.scraper-settings');
      if (settingSelect) {
        settingSelect.value = setting;
        
        // Show/hide keyword input
        const keywordInput = lastUrlGroup.querySelector('.scraper-keyword');
        if (keywordInput) {
          keywordInput.style.display = setting === 'keyword' ? 'block' : 'none';
        }
      }
      
      this.updateStartButtonState();
    } catch (error) {
      this.handleError(error, "Error adding URL with value");
    }
  },

  /**
   * Collect URL configs from form
   * @returns {Array} Array of URL configs
   */
  collectUrlConfigs() {
    try {
      const { urlsContainer } = state.elements;
      if (!urlsContainer) return [];
      
      const urlGroups = Array.from(urlsContainer.children);
      
      return urlGroups
        .map(group => {
          const urlInput = group.querySelector('.scraper-url');
          const settingSelect = group.querySelector('.scraper-settings');
          const keywordInput = group.querySelector('.scraper-keyword');
          
          if (!urlInput || !settingSelect) return null;
          
          const url = urlInput.value.trim();
          const setting = settingSelect.value;
          const keyword = keywordInput ? keywordInput.value.trim() : '';
          
          if (!url) return null;
          if (setting === 'keyword' && !keyword) return null;
          
          return {
            url,
            setting,
            keyword: setting === 'keyword' ? keyword : ''
          };
        })
        .filter(config => config !== null);
    } catch (error) {
      this.handleError(error, "Error collecting URL configs");
      return [];
    }
  },

  /**
     * Start scraping process
     */
  startScraping() {
    try {
      const { downloadDir, outputFilename, processPdfSwitch } = state.elements;
      
      // Collect URLs with their settings
      const urlConfigs = this.collectUrlConfigs();
      
      if (urlConfigs.length === 0) {
        showToast('Error', 'Please add at least one valid URL', 'error');
        return;
      }
      
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
      
      // Update PDF options from form
      if (processPdfSwitch) {
        state.pdfOptions.process_pdfs = processPdfSwitch.checked;
      }
      
      // Update PDF count from dropdown
      const pdfCountSelect = document.getElementById('pdf-download-count');
      if (pdfCountSelect) {
        state.pdfOptions.max_downloads = parseInt(pdfCountSelect.value, 10);
      }
      
      // Prepare request data
      const requestData = {
        urls: urlConfigs,
        download_directory: directory,
        output_filename: filename,
        pdf_options: state.pdfOptions
      };
      
      // Call Blueprint API
      blueprintApi.startWebScraping(
        requestData.urls,
        requestData.output_filename,
        {
          download_pdfs: requestData.pdf_options?.enabled || false,
          max_pdfs: requestData.pdf_options?.max_pdfs || 10,
          recursive: requestData.recursive || false,
          max_depth: requestData.max_depth || 2
        }
      )
      .then(data => {
        loading.hide();

        if (data.task_id) {
          // Store task info and transition to progress view
          this.startTaskTracking(data.task_id, urlConfigs.map(cfg => cfg.url), data.output_file);
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
   * Start tracking a new task
   * @param {string} taskId - Task ID
   * @param {Array<string>} urls - URLs being processed
   * @param {string} outputFile - Output file path
   */
  startTaskTracking(taskId, urls, outputFile) {
    // Store task info
    state.currentTaskId = taskId;
    state.currentUrls = urls;
    state.scrapeInProgress = true;
    state.pdfDownloads = [];
    state.taskProgress = {
      startTime: Date.now(),
      output_file: outputFile
    };

    // Store task info in session storage for recovery
    sessionStorage.setItem('ongoingTaskId', taskId);
    sessionStorage.setItem('ongoingTaskType', 'scraper');
    sessionStorage.setItem('taskStartTime', Date.now().toString());

    // Set up task tracking with progress handler
    this.setupTaskTracking(taskId);

    // Show progress UI
    this.showProgressContainer();
  },

  /**
   * Fetch the current status of a task from the server
   * @param {string} taskId - Task ID to fetch status for
   * @returns {Promise<Object>} - Task status data
   */
  async fetchTaskStatus(taskId) {
    try {
      // Use Blueprint API for status checking
      return await blueprintApi.getTaskStatus(taskId, 'web_scraper');
    } catch (error) {
      console.error(`Error fetching task status for ${taskId}:`, error);
      throw error;
    }
  },

  /**
   * Show the form container
   */
  showFormContainer() {
    const { formContainer, progressContainer, resultsContainer } = state.elements;
    
    if (formContainer) formContainer.classList.remove('d-none');
    if (progressContainer) progressContainer.classList.add('d-none');
    if (resultsContainer) resultsContainer.classList.add('d-none');
  },

  /**
   * Show the progress container
   */
  showProgressContainer() {
    const { formContainer, progressContainer, resultsContainer, pdfDownloadProgress } = state.elements;
    
    if (formContainer) formContainer.classList.add('d-none');
    if (progressContainer) progressContainer.classList.remove('d-none');
    if (resultsContainer) resultsContainer.classList.add('d-none');
    
    // Initially hide PDF download progress section until we have PDFs
    if (pdfDownloadProgress) pdfDownloadProgress.classList.add('d-none');
  },

  /**
   * Show the results container
   */
  showResultsContainer() {
    const { formContainer, progressContainer, resultsContainer } = state.elements;
    
    if (formContainer) formContainer.classList.add('d-none');
    if (progressContainer) progressContainer.classList.add('d-none');
    if (resultsContainer) resultsContainer.classList.remove('d-none');
  },

  /**
   * Handle progress updates from Socket.IO or API
   * @param {Object} data - Progress data
   */
  handleProgressUpdate(data) {
    try {
      // Check if this update is for our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;

      const { progressStatus, progressStats } = state.elements;

      // Use progressHandler to update UI if available
      if (typeof updateProgressUI === 'function') {
        updateProgressUI(data.task_id, data.progress, data.message, data.stats);
      } else {
        // Fallback to direct UI update
        this.updateProgressUI(data);
      }

      // Update status text explicitly for better user experience
      if (progressStatus && data.message) {
        progressStatus.textContent = data.message;
      }

      // Handle PDF downloads if present
      if (data.pdf_downloads) {
        this.updatePdfDownloadsList(data.pdf_downloads);
      }
      
      // Update local state
      state.taskProgress = {
        ...state.taskProgress,
        progress: data.progress,
        message: data.message,
        stats: data.stats,
        lastUpdate: Date.now()
      };
    } catch (error) {
      this.handleError(error, "Error handling progress update");
    }
  },

  /**
   * Direct update of progress UI without progressHandler
   * @param {Object} data - Progress data
   */
  updateProgressUI(data) {
    try {
      const { progressBar, progressStatus, progressStats } = state.elements;
      
      // Update progress bar
      if (progressBar) {
        progressBar.style.width = `${data.progress}%`;
        progressBar.setAttribute('aria-valuenow', data.progress);
        progressBar.textContent = `${Math.round(data.progress)}%`;
      }
      
      // Update progress text
      if (progressStatus) {
        if (data.message) {
          progressStatus.textContent = data.message;
        } else {
          progressStatus.textContent = `Processing... (${Math.round(data.progress)}%)`;
        }
      }
      
      // Update stats display if available
      if (progressStats && data.stats) {
        this.updateStatsDisplay(progressStats, data.stats);
      }
    } catch (error) {
      this.handleError(error, "Error updating progress UI directly");
    }
  },

  /**
   * Update stats display
   * @param {HTMLElement} element - Stats container
   * @param {Object} stats - Stats data
   */
  updateStatsDisplay(element, stats) {
    try {
      if (!element || !stats) return;
      
      // Create stats HTML content
      let html = '<div class="stats-container p-2">';
      
      // Different display for different types of stats
      if (stats.total_urls !== undefined) {
        // Web scraping stats
        html += `
          <div class="row">
            <div class="col-6 col-md-3">
              <span class="badge bg-primary">Total URLs: ${stats.total_urls || 0}</span>
            </div>
            <div class="col-6 col-md-3">
              <span class="badge bg-success">Processed: ${stats.processed_urls || 0}</span>
            </div>
            <div class="col-6 col-md-3">
              <span class="badge bg-warning">Pending: ${stats.pending_urls || 0}</span>
            </div>
            <div class="col-6 col-md-3">
              <span class="badge bg-danger">Failed: ${stats.failed_urls || 0}</span>
            </div>
          </div>
        `;
        
        // PDF downloads stats if available
        if (stats.pdf_downloads_count !== undefined) {
          html += `
            <div class="mt-2">
              <span class="badge bg-info">PDFs: ${stats.pdf_downloads_count}</span>
              <span class="badge bg-success mx-1">Downloaded: ${stats.successful_downloads || 0}</span>
              <span class="badge bg-danger mx-1">Failed: ${stats.failed_downloads || 0}</span>
            </div>
          `;
        }
      } else if (stats.pdf_downloads_count !== undefined) {
        // PDF-only stats
        html += `
          <div class="row">
            <div class="col-12 mb-2">
              <span class="badge bg-primary">PDFs: ${stats.pdf_downloads_count}</span>
              <span class="badge bg-success mx-1">Downloaded: ${stats.successful_downloads || 0}</span>
              <span class="badge bg-danger mx-1">Failed: ${stats.failed_downloads || 0}</span>
            </div>
          </div>
        `;
      } else {
        // Generic stats - display all key-value pairs
        html += '<div class="row">';
        
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value !== 'object' && !key.startsWith('_')) {
            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            
            html += `
              <div class="col-6 col-md-4 mb-1">
                <small>${formattedKey}:</small>
                <span class="fw-bold">${value}</span>
              </div>
            `;
          }
        }
        
        html += '</div>';
      }
      
      // Close container
      html += '</div>';
      
      // Update element content
      element.innerHTML = html;
    } catch (error) {
      this.handleError(error, "Error updating stats display");
    }
  },

  /**
   * Update the PDF downloads list
   * @param {Array|Object} pdfDownloads - PDF downloads data
   */
  updatePdfDownloadsList(pdfDownloads) {
    try {
      const { pdfDownloadsList, pdfDownloadProgress } = state.elements;
      if (!pdfDownloadsList || !pdfDownloadProgress) return;
      
      // Show the PDF downloads section
      pdfDownloadProgress.classList.remove('d-none');
      
      // Handle array or object format
      const downloadsArray = Array.isArray(pdfDownloads) ? 
        pdfDownloads : 
        (pdfDownloads.items || []);
      
      // Store in state for reference
      state.pdfDownloads = downloadsArray;
      
      // Process each PDF download
      downloadsArray.forEach(pdf => {
        const listItem = pdfDownloadsList.querySelector(`[data-url="${pdf.url}"]`);
        if (!listItem) {
          this.addPdfToList(pdf);
        } else {
          this.updatePdfListItem(listItem, pdf);
        }
      });
      
      // Add placeholder if list is empty
      if (downloadsArray.length === 0 && pdfDownloadsList.children.length === 0) {
        pdfDownloadsList.innerHTML = '<li class="list-group-item text-muted text-center">No PDFs downloaded yet</li>';
      }
    } catch (error) {
      this.handleError(error, "Error updating PDF downloads list");
    }
  },

  /**
   * Add a PDF to the list
   * @param {Object} pdf - PDF download data
   */
  addPdfToList(pdf) {
    try {
      const { pdfDownloadsList } = state.elements;
      if (!pdfDownloadsList) return;

      // Clear placeholder if present
      if (pdfDownloadsList.querySelector('.text-muted')) {
        pdfDownloadsList.innerHTML = '';
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
      const fileName = filePath ? filePath.split(/[\/\\]/).pop() : '';

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
      pdfDownloadsList.appendChild(listItem);

      // Scroll to bottom to show new items
      pdfDownloadsList.scrollTop = pdfDownloadsList.scrollHeight;
    } catch (error) {
      this.handleError(error, "Error adding PDF to list");
    }
  },

  /**
   * Update an existing PDF list item
   * @param {Element} listItem - List item element
   * @param {Object} pdf - Updated PDF data
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
        const fileName = filePath.split(/[\/\\]/).pop();
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

        if (pdf.documentType || pdf.document_type) {
          metaInfo.push(`Type: ${pdf.documentType || pdf.document_type}`);
        }

        if (pdf.tablesExtracted && pdf.tablesExtracted > 0) {
          metaInfo.push(`Tables: ${pdf.tablesExtracted}`);
        }

        if (pdf.tables_extracted && pdf.tables_extracted > 0) {
          metaInfo.push(`Tables: ${pdf.tables_extracted}`);
        }

        if (pdf.referencesExtracted && pdf.referencesExtracted > 0) {
          metaInfo.push(`References: ${pdf.referencesExtracted}`);
        }

        if (pdf.references_extracted && pdf.references_extracted > 0) {
          metaInfo.push(`References: ${pdf.references_extracted}`);
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
   * @param {Object} data - Completion data
   */
  handleTaskCompleted(data) {
    try {
      // Check if this is our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;

      const { progressBar, progressStatus, statsContainer } = state.elements;

      // Update progress to 100%
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', '100');
        progressBar.textContent = '100%';
      }
      
      if (progressStatus) progressStatus.textContent = 'Completed successfully';

      // Update stats in results container
      if (statsContainer && data.stats) {
        let statsHtml = '<h5>Summary</h5><ul class="list-group mb-3">';
        
        // Add key statistics
        statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
          URLs Processed
          <span class="badge bg-primary rounded-pill">${data.stats.total_urls || 0}</span>
        </li>`;
        
        statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
          Successful
          <span class="badge bg-success rounded-pill">${data.stats.successful_urls || 0}</span>
        </li>`;
        
        statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
          Failed
          <span class="badge bg-danger rounded-pill">${data.stats.failed_urls || 0}</span>
        </li>`;
        
        if (data.stats.pdf_downloads_count) {
          statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
            PDFs Downloaded
            <span class="badge bg-info rounded-pill">${data.stats.pdf_downloads_count}</span>
          </li>`;
        }
        
        // Add processing time
        const processingTime = data.stats.processing_time_seconds || 
                              data.stats.duration_seconds || 0;
        
        statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
          Processing Time
          <span>${this.formatTime(processingTime)}</span>
        </li>`;
        
        statsHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
          Output File
          <span class="text-truncate" style="max-width: 70%;">${data.output_file}</span>
        </li>`;
        
        statsHtml += '</ul>';
        
        statsContainer.innerHTML = statsHtml;
      }

      // Show result container
      this.showResultsContainer();

      // Show toast notification
      showToast('Completed', 'Web scraping completed successfully', 'success');

      // Reset task state
      this.resetTaskState();
    } catch (error) {
      this.handleError(error, "Error handling task completion");
    }
  },

  /**
   * Format time in seconds to a human-readable string
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time
   */
  formatTime(seconds) {
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
  },

  /**
   * Handle task error
   * @param {Object} data - Error data
   */
  handleTaskError(data) {
    try {
      // Check if this is our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;

      // Show error message
      showToast('Error', data.error || 'An error occurred during web scraping', 'error');

      // Update UI to show error state
      const { progressStatus } = state.elements;
      if (progressStatus) {
        progressStatus.textContent = `Error: ${data.error || 'Unknown error'}`;
        progressStatus.classList.add('text-danger');
      }

      // Reset task state
      this.resetTaskState();

      // Add a "New Task" button
      const { progressContainer } = state.elements;
      if (progressContainer) {
        const newTaskButton = document.createElement('button');
        newTaskButton.className = 'btn btn-primary mt-3';
        newTaskButton.innerHTML = '<i class="fas fa-plus me-1"></i> New Task';
        newTaskButton.addEventListener('click', () => this.resetAndShowForm());

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
   * @param {Object} data - Cancellation data
   */
  handleTaskCancelled(data) {
    try {
      // Check if this is our task
      if (!data.task_id || data.task_id !== state.currentTaskId) return;
      
      // Show cancellation message
      showToast('Cancelled', 'Web scraping task was cancelled', 'warning');
      
      // Update UI to show cancelled state
      const { progressStatus } = state.elements;
      if (progressStatus) {
        progressStatus.textContent = 'Task cancelled';
        progressStatus.classList.add('text-warning');
      }
      
      // Reset task state
      this.resetTaskState();
      
      // Add a "New Task" button
      const { progressContainer } = state.elements;
      if (progressContainer) {
        const newTaskButton = document.createElement('button');
        newTaskButton.className = 'btn btn-primary mt-3';
        newTaskButton.innerHTML = '<i class="fas fa-plus me-1"></i> New Task';
        newTaskButton.addEventListener('click', () => this.resetAndShowForm());
        
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
   * Reset form and show it
   */
  resetAndShowForm() {
    try {
      // Reset task state
      this.resetTaskState();
      
      // Clear URL inputs except the first one
      const { urlsContainer } = state.elements;
      if (urlsContainer) {
        urlsContainer.innerHTML = '';
        this.addUrlInput();
      }
      
      // Show form container
      this.showFormContainer();
    } catch (error) {
      this.handleError(error, "Error resetting form");
    }
  },

  /**
   * Cancel the current scraping task
   */
  cancelScraping() {
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

      // Try to cancel via socketHandler if available
      if (socketHandlerFunctions.cancelTask) {
        socketHandlerFunctions.cancelTask(taskId)
          .then(() => {
            loading.hide();
            showToast('Cancelled', 'Scraping task cancelled successfully', 'success');
            this.handleTaskCancelled({ task_id: taskId });
          })
          .catch(error => {
            console.warn("Error cancelling via socketHandler:", error);
            // Try fallback to API
            this.cancelTaskViaApi(taskId, loading);
          });
      } else {
        // Use direct API call
        this.cancelTaskViaApi(taskId, loading);
      }
    } catch (error) {
      this.handleError(error, "Error cancelling scraping task");
      showToast('Error', `Failed to cancel task: ${error.message}`, 'error');
    }
  },

  /**
   * Cancel task via API
   * @param {string} taskId - Task ID
   * @param {Object} loading - Loading spinner object
   */
  cancelTaskViaApi(taskId, loading) {
    // Call the Blueprint cancel API
    blueprintApi.cancelTask(taskId)
    .then(data => {
      loading.hide();

      if (data.status === 'cancelled' || data.success) {
        showToast('Cancelled', 'Scraping task cancelled successfully', 'success');
        this.handleTaskCancelled({ task_id: taskId });
      } else {
        throw new Error(data.message || 'Failed to cancel task');
      }
    })
    .catch(error => {
      loading.hide();
      this.handleError(error, "Error cancelling task");
      showToast('Error', `Failed to cancel task: ${error.message}`, 'error');
    });
  },

  /**
   * Open a file
   * @param {string} filePath - Path to file
   */
  openFile(filePath) {
    try {
      fetch(API_ENDPOINTS.OPEN_FILE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: filePath })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          showToast('Success', 'Opening file', 'success');
        } else {
          throw new Error(data.message || 'Failed to open file');
        }
      })
      .catch(error => {
        this.handleError(error, "Error opening file");
        showToast('Error', `Failed to open file: ${error.message}`, 'error');
      });
    } catch (error) {
      this.handleError(error, "Error opening file");
    }
  },

  /**
   * Open a folder
   * @param {string} folderPath - Path to folder
   */
  openFolder(folderPath) {
    try {
      fetch(API_ENDPOINTS.OPEN_FOLDER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: folderPath })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          showToast('Success', 'Opening folder', 'success');
       } else {
         throw new Error(data.message || 'Failed to open folder');
       }
     })
     .catch(error => {
       this.handleError(error, "Error opening folder");
       showToast('Error', `Failed to open folder: ${error.message}`, 'error');
     });
   } catch (error) {
     this.handleError(error, "Error opening folder");
   }
 },

 /**
  * Handle error in web scraper module
  * @param {Error} error - Error object
  * @param {string} context - Error context description
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
 },

 /**
  * Clean up resources when module is unloaded
  */
 cleanup() {
   // Stop any active tasks
   if (state.currentTaskId) {
     if (socketHandlerFunctions.stopStatusPolling) {
       socketHandlerFunctions.stopStatusPolling(state.currentTaskId);
     }
     
     if (cancelTracking) {
       cancelTracking(state.currentTaskId);
     }
   }
   
   // Unregister all event listeners
   this.unregisterAllEvents();
   
   // Reset state
   this.resetTaskState();
   
   console.log("Web Scraper module cleaned up");
 }
};

// Export the module with default export
export default webScraper;

// Named exports for important functions
export const initialize = webScraper.initialize.bind(webScraper);
export const addUrlInput = webScraper.addUrlInput.bind(webScraper);
export const performAcademicSearch = webScraper.performAcademicSearch.bind(webScraper);
export const startScraping = webScraper.startScraping.bind(webScraper);
export const cancelScraping = webScraper.cancelScraping.bind(webScraper);
export const resetAndShowForm = webScraper.resetAndShowForm.bind(webScraper);
export const handleTaskCompleted = webScraper.handleTaskCompleted.bind(webScraper);
export const handleTaskError = webScraper.handleTaskError.bind(webScraper);
export const handleProgressUpdate = webScraper.handleProgressUpdate.bind(webScraper);
export const updatePdfDownloadsList = webScraper.updatePdfDownloadsList.bind(webScraper);