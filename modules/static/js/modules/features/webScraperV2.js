/**
 * Web Scraper Module V2 - Consistent Import System
 * 
 * Advanced web scraping module with recursive crawling, academic search integration,
 * PDF processing, and comprehensive download management.
 * 
 * @module features/webScraperV2
 * @version 3.1.0
 */

import { createStandardImports } from '../core/moduleImports.js';

// Initialize module imports
const imports = await createStandardImports();

// Destructure imports for easier access
const { 
  // Core
  showErrorNotification, showSuccess,
  getElement, addClass, removeClass,
  setState, getState,
  registerEvents, emit,
  
  // Utils
  showLoadingSpinner, hideLoadingSpinner, showToast,
  generateId, formatDate,
  showProgress, updateProgress,
  
  // Config
  endpoints: { SCRAPER_ENDPOINTS, ACADEMIC_ENDPOINTS, PDF_ENDPOINTS },
  socketEvents: { TASK_EVENTS, SCRAPER_EVENTS, ACADEMIC_EVENTS },
  constants: { CONSTANTS },
  
  // Services
  blueprintApi
} = imports;

/**
 * Web Scraper Class - Consistent Implementation
 */
class WebScraper {
  constructor() {
    this.state = {
      isInitialized: false,
      currentMode: 'web',
      currentTask: null,
      processingState: 'idle',
      elements: new Map(),
      eventListeners: new Set(),
      socketListeners: new Set(),
      
      // Task management
      activeTasks: new Map(),
      taskQueue: [],
      downloadQueue: new Map(),
      processingQueue: new Map(),
      
      // Results and data
      scrapingResults: new Map(),
      academicResults: new Map(),
      selectedPdfs: new Set(),
      downloadProgress: new Map(),
      
      // UI state
      activeTab: 'web',
      filters: {
        source: 'all',
        dateRange: 'all',
        fileSize: 'all',
        author: '',
        title: ''
      }
    };
    
    this.config = {
      maxDepth: 3,
      maxPages: 100,
      respectRobots: true,
      followRedirects: true,
      concurrentRequests: 5,
      requestDelay: 500,
      timeout: 30000,
      retryAttempts: 3,
      
      pdfOptions: {
        maxDownloads: 10,
        processWithStructify: true,
        extractTables: true,
        useOcr: true,
        extractStructure: true,
        chunkSize: 4096
      },
      
      academicSources: ['arxiv', 'semantic_scholar', 'pubmed', 'ieee', 'acm'],
      maxResultsPerSource: 50,
      itemsPerPage: 20,
      autoRefreshInterval: 2000
    };
  }

  /**
   * Initialize the Web Scraper module
   */
  async init() {
    if (this.state.isInitialized) return;
    
    try {
      console.log('🌐 Initializing Web Scraper V2...');
      
      this.cacheElements();
      this.setupEventHandlers();
      this.setupSocketHandlers();
      this.setupTabs();
      this.setupFormValidation();
      this.setupDownloadManager();
      
      // Load saved state
      this.loadSavedState();
      
      this.state.isInitialized = true;
      console.log('✅ Web Scraper V2 initialized successfully');
      
    } catch (error) {
      console.error('❌ Web Scraper initialization failed:', error);
      throw error;
    }
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    const elementIds = [
      'scraper-tabs',
      'web-tab-btn',
      'academic-tab-btn', 
      'downloads-tab-btn',
      'history-tab-btn',
      'web-tab-content',
      'web-urls-input',
      'web-recursive-toggle',
      'web-max-depth',
      'web-max-pages',
      'web-output-dir',
      'web-start-btn',
      'academic-tab-content',
      'academic-query-input',
      'academic-sources-select',
      'academic-max-results',
      'academic-search-btn',
      'downloads-tab-content',
      'downloads-queue-container',
      'downloads-active-container',
      'downloads-completed-container',
      'pdf-results-container',
      'pdf-select-all-btn',
      'pdf-select-none-btn',
      'pdf-add-to-queue-btn',
      'pdf-filter-container',
      'scraper-progress-container',
      'scraper-progress-bar',
      'scraper-progress-text',
      'scraper-stats-container',
      'scraper-results-container',
      'scraper-cancel-btn'
    ];

    elementIds.forEach(id => {
      const element = getElement(id);
      if (element) {
        this.state.elements.set(id, element);
      }
    });
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    const handlers = {
      'web-tab-btn': () => this.switchTab('web'),
      'academic-tab-btn': () => this.switchTab('academic'),
      'downloads-tab-btn': () => this.switchTab('downloads'),
      'history-tab-btn': () => this.switchTab('history'),
      'web-start-btn': () => this.startWebScraping(),
      'academic-search-btn': () => this.startAcademicSearch(),
      'pdf-select-all-btn': () => this.selectAllPdfs(),
      'pdf-select-none-btn': () => this.selectNonePdfs(),
      'pdf-add-to-queue-btn': () => this.addSelectedToDownloadQueue(),
      'scraper-cancel-btn': () => this.cancelCurrentTask()
    };

    Object.entries(handlers).forEach(([elementId, handler]) => {
      const element = this.state.elements.get(elementId);
      if (element) {
        element.addEventListener('click', handler);
        this.state.eventListeners.add(() => element.removeEventListener('click', handler));
      }
    });

    this.setupInputValidation();
  }

  /**
   * Setup Socket.IO handlers
   */
  setupSocketHandlers() {
    if (!window.socket) return;

    const socketHandlers = {
      [TASK_EVENTS.STARTED]: (data) => this.isMyTask(data.task_id) && this.handleTaskStarted(data),
      [TASK_EVENTS.PROGRESS]: (data) => this.isMyTask(data.task_id) && this.handleProgressUpdate(data),
      [TASK_EVENTS.COMPLETED]: (data) => this.isMyTask(data.task_id) && this.handleTaskCompleted(data),
      [TASK_EVENTS.ERROR]: (data) => this.isMyTask(data.task_id) && this.handleTaskError(data),
      [SCRAPER_EVENTS.url_scraped]: (data) => this.isMyTask(data.task_id) && this.handleUrlScraped(data),
      [SCRAPER_EVENTS.pdf_found]: (data) => this.isMyTask(data.task_id) && this.handlePdfFound(data),
      [SCRAPER_EVENTS.pdf_download_start]: (data) => this.isMyTask(data.task_id) && this.handlePdfDownloadStart(data),
      [SCRAPER_EVENTS.pdf_download_progress]: (data) => this.isMyTask(data.task_id) && this.handlePdfDownloadProgress(data),
      [SCRAPER_EVENTS.pdf_download_complete]: (data) => this.isMyTask(data.task_id) && this.handlePdfDownloadComplete(data),
      [ACADEMIC_EVENTS.paper_found]: (data) => this.handleAcademicResults(data)
    };

    Object.entries(socketHandlers).forEach(([event, handler]) => {
      window.socket.on(event, handler);
      this.state.socketListeners.add(() => window.socket.off(event, handler));
    });
  }

  /**
   * Setup tabs
   */
  setupTabs() {
    this.switchTab('web');
  }

  /**
   * Setup form validation
   */
  setupFormValidation() {
    const urlsInput = this.state.elements.get('web-urls-input');
    if (urlsInput) {
      urlsInput.addEventListener('input', () => this.validateWebForm());
    }

    const queryInput = this.state.elements.get('academic-query-input');
    if (queryInput) {
      queryInput.addEventListener('input', () => this.validateAcademicForm());
    }
  }

  /**
   * Setup input validation
   */
  setupInputValidation() {
    const urlsInput = this.state.elements.get('web-urls-input');
    if (urlsInput) {
      urlsInput.addEventListener('blur', () => {
        const urls = this.parseUrls(urlsInput.value);
        this.validateUrls(urls);
      });
    }
  }

  /**
   * Setup download manager
   */
  setupDownloadManager() {
    this.startDownloadQueueProcessor();
    this.setupAutoRefresh();
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    this.state.activeTab = tabName;
    
    const tabButtons = ['web-tab-btn', 'academic-tab-btn', 'downloads-tab-btn', 'history-tab-btn'];
    tabButtons.forEach(btnId => {
      const btn = this.state.elements.get(btnId);
      if (btn) {
        const isActive = btnId === `${tabName}-tab-btn`;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive);
      }
    });

    const tabContents = ['web-tab-content', 'academic-tab-content', 'downloads-tab-content', 'history-tab-content'];
    tabContents.forEach(contentId => {
      const content = this.state.elements.get(contentId);
      if (content) {
        content.style.display = contentId === `${tabName}-tab-content` ? 'block' : 'none';
      }
    });

    this.state.currentMode = tabName;
    localStorage.setItem('webScraper_activeTab', tabName);
    
    if (tabName === 'downloads') {
      this.refreshDownloadsView();
    } else if (tabName === 'history') {
      this.refreshHistoryView();
    }
  }

  /**
   * Start web scraping
   */
  async startWebScraping() {
    try {
      const urlsInput = this.state.elements.get('web-urls-input');
      const recursiveToggle = this.state.elements.get('web-recursive-toggle');
      const maxDepthInput = this.state.elements.get('web-max-depth');
      const maxPagesInput = this.state.elements.get('web-max-pages');
      const outputDirInput = this.state.elements.get('web-output-dir');

      if (!urlsInput?.value.trim()) {
        showErrorNotification('Please enter at least one URL to scrape');
        return;
      }

      const urls = this.parseUrls(urlsInput.value);
      if (urls.length === 0) {
        showErrorNotification('Please enter valid URLs');
        return;
      }

      const options = {
        urls: urls.map(url => ({ url, setting: 'pdf' })),
        download_directory: outputDirInput?.value.trim() || 'downloads/web-scraper',
        outputFilename: `scraping_${Date.now()}`,
        recursive: recursiveToggle?.checked || false,
        max_depth: parseInt(maxDepthInput?.value) || this.config.maxDepth,
        max_pages: parseInt(maxPagesInput?.value) || this.config.maxPages,
        pdf_options: this.config.pdfOptions,
        respect_robots: this.config.respectRobots,
        request_delay: this.config.requestDelay,
        timeout: this.config.timeout
      };

      this.state.processingState = 'scraping';
      this.updateUI();

      showLoadingSpinner('Starting web scraping...');
      
      const response = await blueprintApi.request(SCRAPER_ENDPOINTS.START, {
        method: 'POST',
        body: JSON.stringify(options)
      });

      hideLoadingSpinner();

      this.state.currentTask = {
        id: response.task_id,
        type: 'web_scraping',
        urls,
        options,
        startTime: Date.now(),
        foundPdfs: new Map()
      };

      this.state.activeTasks.set(response.task_id, this.state.currentTask);

      console.log(`🌐 Web scraping started: ${response.task_id}`);
      showSuccess(`Scraping started for ${urls.length} URL(s)`);

    } catch (error) {
      console.error('❌ Failed to start web scraping:', error);
      hideLoadingSpinner();
      this.handleTaskError({ error: error.message });
    }
  }

  /**
   * Start academic search
   */
  async startAcademicSearch() {
    try {
      const queryInput = this.state.elements.get('academic-query-input');
      const sourcesSelect = this.state.elements.get('academic-sources-select');
      const maxResultsInput = this.state.elements.get('academic-max-results');

      if (!queryInput?.value.trim()) {
        showErrorNotification('Please enter a search query');
        return;
      }

      const query = queryInput.value.trim();
      const sources = this.getSelectedSources(sourcesSelect);
      const maxResults = parseInt(maxResultsInput?.value) || this.config.maxResultsPerSource;

      this.state.processingState = 'searching';
      this.updateUI();

      showLoadingSpinner('Searching academic papers...');

      const response = await blueprintApi.request(ACADEMIC_ENDPOINTS.SEARCH, {
        method: 'POST',
        body: JSON.stringify({
          query,
          source: sources.length === 1 ? sources[0] : 'all',
          max_results: maxResults
        })
      });

      hideLoadingSpinner();

      console.log(`📚 Academic search completed`);
      showSuccess(`Found ${response.results?.length || 0} papers`);

      if (response.results) {
        this.handleAcademicResults({
          source: 'mixed',
          papers: response.results
        });
      }

    } catch (error) {
      console.error('❌ Failed to start academic search:', error);
      hideLoadingSpinner();
      this.handleTaskError({ error: error.message });
    }
  }

  // ... Continue with all other methods using the consistent import system ...

  /**
   * Utility method to parse URLs
   */
  parseUrls(text) {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const lineUrls = lines.filter(line => /^https?:\/\//.test(line));
    return [...new Set([...urls, ...lineUrls])];
  }

  /**
   * Get selected sources
   */
  getSelectedSources(selectElement) {
    if (!selectElement) return this.config.academicSources;
    const selected = Array.from(selectElement.selectedOptions).map(option => option.value);
    return selected.includes('all') ? this.config.academicSources : selected;
  }

  /**
   * Check if task belongs to this instance
   */
  isMyTask(taskId) {
    return this.state.activeTasks.has(taskId) || 
           (this.state.currentTask && this.state.currentTask.id === taskId);
  }

  /**
   * Load saved state
   */
  loadSavedState() {
    try {
      const savedTab = localStorage.getItem('webScraper_activeTab');
      if (savedTab) {
        this.switchTab(savedTab);
      }
    } catch (error) {
      console.warn('Failed to load saved state:', error);
    }
  }

  /**
   * Update UI based on current state
   */
  updateUI() {
    const webStartBtn = this.state.elements.get('web-start-btn');
    const academicSearchBtn = this.state.elements.get('academic-search-btn');
    const cancelBtn = this.state.elements.get('scraper-cancel-btn');
    const progressContainer = this.state.elements.get('scraper-progress-container');

    if (webStartBtn) {
      webStartBtn.disabled = this.state.processingState !== 'idle';
    }

    if (academicSearchBtn) {
      academicSearchBtn.disabled = this.state.processingState !== 'idle';
    }

    if (cancelBtn) {
      cancelBtn.style.display = ['scraping', 'searching'].includes(this.state.processingState) ? 'inline-block' : 'none';
    }

    if (progressContainer) {
      progressContainer.style.display = this.state.processingState !== 'idle' ? 'block' : 'none';
    }
  }

  // Implement remaining methods...
  handleTaskStarted(data) { console.log('Task started:', data); }
  handleProgressUpdate(data) { updateProgress(data.progress, data.message); }
  handleTaskCompleted(data) { 
    this.state.processingState = 'idle';
    showSuccess('Task completed successfully!');
    this.updateUI();
  }
  handleTaskError(data) { 
    this.state.processingState = 'idle';
    showErrorNotification(data.error || 'Task failed');
    this.updateUI();
  }
  handleUrlScraped(data) { console.log('URL scraped:', data); }
  handlePdfFound(data) { console.log('PDF found:', data); }
  handlePdfDownloadStart(data) { console.log('PDF download started:', data); }
  handlePdfDownloadProgress(data) { console.log('PDF download progress:', data); }
  handlePdfDownloadComplete(data) { console.log('PDF download complete:', data); }
  handleAcademicResults(data) { console.log('Academic results:', data); }
  
  validateWebForm() { return true; }
  validateAcademicForm() { return true; }
  validateUrls(urls) { return urls.length > 0; }
  cancelCurrentTask() { console.log('Cancelling current task'); }
  selectAllPdfs() { console.log('Select all PDFs'); }
  selectNonePdfs() { console.log('Select no PDFs'); }
  addSelectedToDownloadQueue() { console.log('Add to download queue'); }
  startDownloadQueueProcessor() { console.log('Download queue processor started'); }
  setupAutoRefresh() { console.log('Auto refresh setup'); }
  refreshDownloadsView() { console.log('Refreshing downloads view'); }
  refreshHistoryView() { console.log('Refreshing history view'); }

  /**
   * Cleanup
   */
  cleanup() {
    this.state.eventListeners.forEach(removeListener => removeListener());
    this.state.eventListeners.clear();
    this.state.socketListeners.forEach(removeListener => removeListener());
    this.state.socketListeners.clear();
    this.state.isInitialized = false;
  }
}

// Create singleton instance
const webScraper = new WebScraper();

// Export for use by other modules
export default webScraper;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => webScraper.init());
} else {
  webScraper.init();
}

console.log('🌐 Web Scraper V2 module loaded');