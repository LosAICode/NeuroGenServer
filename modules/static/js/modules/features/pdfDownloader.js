/**
 * PDF Downloader Module
 * 
 * Handles academic paper search, PDF discovery, and PDF downloading functionality.
 * Separated from webScraper.js for better organization and maintainability.
 * 
 * Features:
 * - Academic paper search across multiple sources (arXiv, Semantic Scholar, PubMed, etc.)
 * - PDF discovery and extraction from web pages
 * - Multi-select PDF download queue management
 * - Real-time progress tracking for downloads
 * - Integration with backend academic search API
 * 
 * @module features/pdfDownloader
 * @version 1.0.0
 */

// Import dependencies using window fallbacks
let blueprintApi, ACADEMIC_ENDPOINTS, PDF_ENDPOINTS;
let TASK_EVENTS, ACADEMIC_EVENTS;
let CONSTANTS;

// Initialize imports when module loads
async function initializeImports() {
  // Check if modules are available via window first
  if (window.NeuroGen?.modules) {
    // Use window modules if available
    blueprintApi = window.NeuroGen.modules.blueprintApi || window.blueprintApi;
    
    // Get config from window if available
    const config = window.NeuroGen.config || {};
    ACADEMIC_ENDPOINTS = config.ACADEMIC_ENDPOINTS || {
      SEARCH: '/api/academic-search',
      PAPER: '/api/academic-search/paper',
      DOWNLOAD: '/api/academic-search/download'
    };
    PDF_ENDPOINTS = config.PDF_ENDPOINTS || {
      PROCESS: '/api/pdf/process',
      DOWNLOAD: '/api/download-pdf'
    };
    
    // Socket events
    TASK_EVENTS = config.TASK_EVENTS || {
      STARTED: 'task_started',
      PROGRESS: 'progress_update', 
      COMPLETED: 'task_completed',
      ERROR: 'task_failed',
      CANCELLED: 'task_cancelled'
    };
    
    ACADEMIC_EVENTS = config.ACADEMIC_EVENTS || {
      PAPER_FOUND: 'paper_found',
      SEARCH_COMPLETE: 'search_complete',
      PDF_DOWNLOADED: 'pdf_downloaded'
    };
    
    CONSTANTS = config.CONSTANTS || {};
  }
}

class PDFDownloader {
  constructor() {
    this.state = {
      isInitialized: false,
      elements: new Map(),
      eventListeners: new Set(),
      socketListeners: new Set(),
      currentSearch: null,
      searchResults: new Map(),
      selectedPdfs: new Set(),
      downloadQueue: new Map(),
      activeDownloads: new Map(),
      processingState: 'idle'
    };
    
    this.config = {
      maxResultsPerSource: 10,
      defaultSources: ['arxiv', 'semantic_scholar'],
      downloadConcurrency: 3,
      retryAttempts: 3
    };
  }

  /**
   * Initialize the PDF Downloader module
   */
  async init() {
    try {
      console.log('🔍 Initializing PDF Downloader module...');
      
      // Initialize imports
      await initializeImports();
      
      // Cache DOM elements
      this.cacheElements();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Setup Socket.IO listeners
      this.setupSocketListeners();
      
      // Initialize UI state
      this.updateUI();
      
      this.state.isInitialized = true;
      console.log('✅ PDF Downloader initialized successfully');
      
      // Register with module system if available
      if (window.NeuroGen?.registerModule) {
        window.NeuroGen.registerModule('pdfDownloader', this);
      }
      
    } catch (error) {
      console.error('❌ PDF Downloader initialization failed:', error);
      this.state.isInitialized = true; // Allow graceful degradation
    }
  }

  /**
   * Cache DOM elements for efficient access
   */
  cacheElements() {
    const elementIds = [
      // Academic search elements
      'academic-search-input',
      'academic-sources-select',
      'academic-max-results',
      'academic-search-btn',
      'academic-results-container',
      'academic-results-list',
      
      // PDF selection elements
      'pdf-select-all-btn',
      'pdf-select-none-btn',
      'pdf-download-selected-btn',
      'selected-pdfs-count',
      
      // Download queue elements
      'download-queue-container',
      'download-queue-list',
      'queue-clear-btn',
      'queue-download-all-btn',
      
      // Progress elements
      'pdf-download-progress',
      'current-download-status'
    ];

    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.state.elements.set(id, element);
      }
    });
  }

  /**
   * Setup event handlers for PDF downloader functionality
   */
  setupEventHandlers() {
    // Academic search button
    const searchBtn = this.state.elements.get('academic-search-btn');
    if (searchBtn) {
      const clickHandler = () => this.startAcademicSearch();
      searchBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => searchBtn.removeEventListener('click', clickHandler));
    }

    // PDF selection buttons
    const selectAllBtn = this.state.elements.get('pdf-select-all-btn');
    if (selectAllBtn) {
      const clickHandler = () => this.selectAllPdfs();
      selectAllBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => selectAllBtn.removeEventListener('click', clickHandler));
    }

    const selectNoneBtn = this.state.elements.get('pdf-select-none-btn');
    if (selectNoneBtn) {
      const clickHandler = () => this.selectNonePdfs();
      selectNoneBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => selectNoneBtn.removeEventListener('click', clickHandler));
    }

    const downloadSelectedBtn = this.state.elements.get('pdf-download-selected-btn');
    if (downloadSelectedBtn) {
      const clickHandler = () => this.downloadSelectedPdfs();
      downloadSelectedBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => downloadSelectedBtn.removeEventListener('click', clickHandler));
    }

    // Queue management buttons
    const clearQueueBtn = this.state.elements.get('queue-clear-btn');
    if (clearQueueBtn) {
      const clickHandler = () => this.clearDownloadQueue();
      clearQueueBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => clearQueueBtn.removeEventListener('click', clearQueueBtn));
    }
  }

  /**
   * Setup Socket.IO event listeners
   */
  setupSocketListeners() {
    if (!window.socket) {
      console.warn('Socket.IO not available, real-time updates will be limited');
      return;
    }

    // Academic search events
    const paperFoundHandler = (data) => {
      if (this.isMySearch(data.search_id)) {
        this.handlePaperFound(data);
      }
    };
    window.socket.on(ACADEMIC_EVENTS.PAPER_FOUND, paperFoundHandler);
    this.state.socketListeners.add(() => window.socket.off(ACADEMIC_EVENTS.PAPER_FOUND, paperFoundHandler));

    const searchCompleteHandler = (data) => {
      if (this.isMySearch(data.search_id)) {
        this.handleSearchComplete(data);
      }
    };
    window.socket.on(ACADEMIC_EVENTS.SEARCH_COMPLETE, searchCompleteHandler);
    this.state.socketListeners.add(() => window.socket.off(ACADEMIC_EVENTS.SEARCH_COMPLETE, searchCompleteHandler));

    // PDF download events
    const pdfDownloadedHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfDownloaded(data);
      }
    };
    window.socket.on(ACADEMIC_EVENTS.PDF_DOWNLOADED, pdfDownloadedHandler);
    this.state.socketListeners.add(() => window.socket.off(ACADEMIC_EVENTS.PDF_DOWNLOADED, pdfDownloadedHandler));

    // General task events
    const progressHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleDownloadProgress(data);
      }
    };
    window.socket.on(TASK_EVENTS.PROGRESS, progressHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.PROGRESS, progressHandler));
  }

  /**
   * Start academic search
   */
  async startAcademicSearch() {
    try {
      const queryInput = this.state.elements.get('academic-search-input');
      const sourcesSelect = this.state.elements.get('academic-sources-select');
      const maxResultsInput = this.state.elements.get('academic-max-results');

      if (!queryInput?.value.trim()) {
        this.showError('Please enter a search query');
        return;
      }

      const query = queryInput.value.trim();
      const sources = this.getSelectedSources(sourcesSelect);
      const maxResults = parseInt(maxResultsInput?.value) || this.config.maxResultsPerSource;

      this.state.processingState = 'searching';
      this.updateUI();

      // Clear previous results
      this.clearSearchResults();

      // Start academic search
      const response = await fetch(ACADEMIC_ENDPOINTS.SEARCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify({
          query,
          sources,
          max_results: maxResults
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Store search information
      this.state.currentSearch = {
        id: data.search_id,
        query,
        sources,
        maxResults,
        startTime: Date.now()
      };

      console.log(`📚 Academic search started: ${data.search_id}`);
      this.showInfo(`Searching for: "${query}" across ${sources.length} source(s)`);

    } catch (error) {
      console.error('❌ Failed to start academic search:', error);
      this.showError(`Search failed: ${error.message}`);
      this.state.processingState = 'idle';
      this.updateUI();
    }
  }

  /**
   * Handle paper found event from backend
   */
  handlePaperFound(data) {
    const paper = data.paper;
    this.state.searchResults.set(paper.id, paper);
    this.addPaperToResults(paper);
  }

  /**
   * Handle search completion
   */
  handleSearchComplete(data) {
    this.state.processingState = 'idle';
    this.updateUI();
    
    const resultCount = this.state.searchResults.size;
    this.showInfo(`Search complete! Found ${resultCount} papers.`);
  }

  /**
   * Add paper to results display
   */
  addPaperToResults(paper) {
    const resultsList = this.state.elements.get('academic-results-list');
    if (!resultsList) return;

    const paperElement = this.createPaperElement(paper);
    resultsList.appendChild(paperElement);
    
    // Show results container if hidden
    const resultsContainer = this.state.elements.get('academic-results-container');
    if (resultsContainer) {
      resultsContainer.style.display = 'block';
    }
  }

  /**
   * Create HTML element for a paper
   */
  createPaperElement(paper) {
    const div = document.createElement('div');
    div.className = 'card mb-3 paper-result';
    div.dataset.paperId = paper.id;
    
    div.innerHTML = `
      <div class="card-body">
        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" id="paper-${paper.id}" data-paper-id="${paper.id}">
          <label class="form-check-label fw-bold" for="paper-${paper.id}">
            ${this.escapeHtml(paper.title)}
          </label>
        </div>
        <p class="text-muted mb-2">
          <small>
            <i class="fas fa-users me-1"></i>${this.escapeHtml(paper.authors?.join(', ') || 'Unknown authors')}
          </small>
        </p>
        <p class="mb-2">${this.escapeHtml(paper.abstract?.substring(0, 200) || 'No abstract available')}...</p>
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="badge bg-primary me-1">${this.escapeHtml(paper.source || 'Unknown')}</span>
            ${paper.year ? `<span class="badge bg-secondary">${paper.year}</span>` : ''}
          </div>
          <div>
            ${paper.pdf_url ? `<button class="btn btn-sm btn-outline-success me-1" onclick="window.NeuroGen.modules.pdfDownloader.downloadSinglePdf('${paper.id}')">
              <i class="fas fa-download me-1"></i>Download PDF
            </button>` : ''}
            ${paper.url ? `<a href="${paper.url}" target="_blank" class="btn btn-sm btn-outline-primary">
              <i class="fas fa-external-link-alt me-1"></i>View Paper
            </a>` : ''}
          </div>
        </div>
      </div>
    `;

    // Add change handler for checkbox
    const checkbox = div.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.state.selectedPdfs.add(paper.id);
      } else {
        this.state.selectedPdfs.delete(paper.id);
      }
      this.updateSelectionUI();
    });

    return div;
  }

  /**
   * Select all papers
   */
  selectAllPdfs() {
    const checkboxes = document.querySelectorAll('.paper-result input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      this.state.selectedPdfs.add(checkbox.dataset.paperId);
    });
    this.updateSelectionUI();
  }

  /**
   * Deselect all papers
   */
  selectNonePdfs() {
    const checkboxes = document.querySelectorAll('.paper-result input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    this.state.selectedPdfs.clear();
    this.updateSelectionUI();
  }

  /**
   * Download selected PDFs
   */
  async downloadSelectedPdfs() {
    if (this.state.selectedPdfs.size === 0) {
      this.showError('Please select at least one PDF to download');
      return;
    }

    const selectedPapers = Array.from(this.state.selectedPdfs).map(id => 
      this.state.searchResults.get(id)
    ).filter(paper => paper && paper.pdf_url);

    if (selectedPapers.length === 0) {
      this.showError('No downloadable PDFs found in selection');
      return;
    }

    this.showInfo(`Starting download of ${selectedPapers.length} PDFs...`);

    // Add to download queue and start downloads
    for (const paper of selectedPapers) {
      this.addToDownloadQueue(paper);
    }
    
    this.processDownloadQueue();
  }

  /**
   * Download a single PDF
   */
  async downloadSinglePdf(paperId) {
    const paper = this.state.searchResults.get(paperId);
    if (!paper || !paper.pdf_url) {
      this.showError('PDF not available for download');
      return;
    }

    this.addToDownloadQueue(paper);
    this.processDownloadQueue();
  }

  /**
   * Add paper to download queue
   */
  addToDownloadQueue(paper) {
    this.state.downloadQueue.set(paper.id, {
      ...paper,
      status: 'queued',
      addedTime: Date.now()
    });
    this.updateQueueUI();
  }

  /**
   * Process download queue
   */
  async processDownloadQueue() {
    const queuedItems = Array.from(this.state.downloadQueue.values())
      .filter(item => item.status === 'queued');

    if (queuedItems.length === 0) return;

    // Process downloads with concurrency limit
    const activeCount = this.state.activeDownloads.size;
    const available = this.config.downloadConcurrency - activeCount;
    const toProcess = queuedItems.slice(0, available);

    for (const item of toProcess) {
      this.startPdfDownload(item);
    }
  }

  /**
   * Start individual PDF download
   */
  async startPdfDownload(paper) {
    try {
      // Mark as downloading
      paper.status = 'downloading';
      this.state.activeDownloads.set(paper.id, paper);
      this.updateQueueUI();

      const response = await fetch(PDF_ENDPOINTS.DOWNLOAD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': localStorage.getItem('api_key') || ''
        },
        body: JSON.stringify({
          url: paper.pdf_url,
          filename: this.sanitizeFilename(`${paper.title}.pdf`),
          paper_info: {
            id: paper.id,
            title: paper.title,
            authors: paper.authors,
            source: paper.source
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Update status
      paper.status = 'completed';
      paper.task_id = data.task_id;
      
    } catch (error) {
      console.error(`❌ Failed to download PDF ${paper.title}:`, error);
      paper.status = 'failed';
      paper.error = error.message;
    } finally {
      this.state.activeDownloads.delete(paper.id);
      this.updateQueueUI();
      
      // Process next items in queue
      setTimeout(() => this.processDownloadQueue(), 100);
    }
  }

  /**
   * Utility functions
   */
  getSelectedSources(sourcesSelect) {
    if (!sourcesSelect) return this.config.defaultSources;
    
    const selected = Array.from(sourcesSelect.selectedOptions).map(option => option.value);
    return selected.length > 0 ? selected : this.config.defaultSources;
  }

  clearSearchResults() {
    this.state.searchResults.clear();
    this.state.selectedPdfs.clear();
    
    const resultsList = this.state.elements.get('academic-results-list');
    if (resultsList) {
      resultsList.innerHTML = '';
    }
    
    const resultsContainer = this.state.elements.get('academic-results-container');
    if (resultsContainer) {
      resultsContainer.style.display = 'none';
    }
  }

  clearDownloadQueue() {
    this.state.downloadQueue.clear();
    this.updateQueueUI();
  }

  updateSelectionUI() {
    const countElement = this.state.elements.get('selected-pdfs-count');
    if (countElement) {
      countElement.textContent = this.state.selectedPdfs.size;
    }
  }

  updateQueueUI() {
    // Update download queue display
    const queueList = this.state.elements.get('download-queue-list');
    if (!queueList) return;

    queueList.innerHTML = '';
    
    this.state.downloadQueue.forEach(item => {
      const queueItem = document.createElement('div');
      queueItem.className = `list-group-item d-flex justify-content-between align-items-center`;
      
      let statusBadge = '';
      switch (item.status) {
        case 'queued':
          statusBadge = '<span class="badge bg-secondary">Queued</span>';
          break;
        case 'downloading':
          statusBadge = '<span class="badge bg-primary">Downloading</span>';
          break;
        case 'completed':
          statusBadge = '<span class="badge bg-success">Completed</span>';
          break;
        case 'failed':
          statusBadge = '<span class="badge bg-danger">Failed</span>';
          break;
      }
      
      queueItem.innerHTML = `
        <div>
          <strong>${this.escapeHtml(item.title)}</strong>
          <br><small class="text-muted">${this.escapeHtml(item.authors?.join(', ') || 'Unknown authors')}</small>
        </div>
        ${statusBadge}
      `;
      
      queueList.appendChild(queueItem);
    });
  }

  updateUI() {
    // Update UI based on current state
    const searchBtn = this.state.elements.get('academic-search-btn');
    if (searchBtn) {
      searchBtn.disabled = this.state.processingState === 'searching';
      searchBtn.innerHTML = this.state.processingState === 'searching' 
        ? '<i class="fas fa-spinner fa-spin me-1"></i>Searching...'
        : '<i class="fas fa-search me-1"></i>Search Papers';
    }
  }

  isMySearch(searchId) {
    return this.state.currentSearch && this.state.currentSearch.id === searchId;
  }

  isMyTask(taskId) {
    return Array.from(this.state.downloadQueue.values()).some(item => item.task_id === taskId);
  }

  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    console.error('❌ PDF Downloader Error:', message);
    // You can add UI notification here
  }

  showInfo(message) {
    console.log('ℹ️ PDF Downloader Info:', message);
    // You can add UI notification here
  }

  /**
   * Cleanup method
   */
  destroy() {
    // Remove event listeners
    this.state.eventListeners.forEach(removeListener => removeListener());
    this.state.socketListeners.forEach(removeListener => removeListener());
    
    // Clear state
    this.state.searchResults.clear();
    this.state.selectedPdfs.clear();
    this.state.downloadQueue.clear();
    this.state.activeDownloads.clear();
    
    console.log('🧹 PDF Downloader module destroyed');
  }
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
  // Wait for DOM and other modules to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.pdfDownloader = new PDFDownloader();
        window.pdfDownloader.init();
      }, 100);
    });
  } else {
    setTimeout(() => {
      window.pdfDownloader = new PDFDownloader();
      window.pdfDownloader.init();
    }, 100);
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFDownloader;
}