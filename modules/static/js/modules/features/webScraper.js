/**
 * Web Scraper Module - Complete Blueprint Implementation
 * 
 * Advanced web scraping module with recursive crawling, academic search integration,
 * PDF processing, and comprehensive download management. Built from ground up for
 * Flask Blueprint backend architecture with no legacy code or patches.
 * 
 * Features:
 * - Recursive website crawling with depth control
 * - Multi-source academic search (arXiv, Semantic Scholar, PubMed, IEEE, ACM)
 * - Advanced PDF selection and batch download management
 * - Structify integration for comprehensive PDF processing
 * - Real-time progress tracking with detailed statistics
 * - Citation network visualization and analysis
 * - Cross-platform download optimization
 * 
 * @module features/webScraper
 * @version 3.0.0
 */

import blueprintApi from '../services/blueprintApi.js';
import { SCRAPER_ENDPOINTS, ACADEMIC_ENDPOINTS, PDF_ENDPOINTS } from '../config/endpoints.js';
import { TASK_EVENTS, BLUEPRINT_EVENTS, SCRAPER_EVENTS, ACADEMIC_EVENTS } from '../config/socketEvents.js';
import { CONSTANTS } from '../config/constants.js';

/**
 * Web Scraper Class - Complete Implementation
 */
class WebScraper {
  constructor() {
    this.state = {
      isInitialized: false,
      currentMode: 'web', // 'web', 'academic', 'downloads', 'history'
      currentTask: null,
      processingState: 'idle', // 'idle', 'scraping', 'downloading', 'processing', 'completed', 'error'
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
      // Scraping configuration
      maxDepth: 3,
      maxPages: 100,
      respectRobots: true,
      followRedirects: true,
      concurrentRequests: 5,
      requestDelay: 500,
      timeout: 30000,
      retryAttempts: 3,
      
      // PDF processing options
      pdfOptions: {
        maxDownloads: 10,
        processWithStructify: true,
        extractTables: true,
        useOcr: true,
        extractStructure: true,
        chunkSize: 4096
      },
      
      // Academic search configuration
      academicSources: ['arxiv', 'semantic_scholar', 'pubmed', 'ieee', 'acm'],
      maxResultsPerSource: 50,
      
      // UI configuration
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
      console.log('🌐 Initializing Web Scraper...');
      
      this.cacheElements();
      this.setupEventHandlers();
      this.setupSocketHandlers();
      this.setupTabs();
      this.setupFormValidation();
      this.setupDownloadManager();
      
      // Load saved state
      this.loadSavedState();
      
      this.state.isInitialized = true;
      console.log('✅ Web Scraper initialized successfully');
      
    } catch (error) {
      console.error('❌ Web Scraper initialization failed:', error);
      throw error;
    }
  }

  /**
   * Cache DOM elements for efficient access
   */
  cacheElements() {
    const elementIds = [
      // Tab navigation
      'scraper-tabs',
      'web-tab-btn',
      'academic-tab-btn', 
      'downloads-tab-btn',
      'history-tab-btn',
      
      // Web scraping tab
      'web-tab-content',
      'web-urls-input',
      'web-recursive-toggle',
      'web-max-depth',
      'web-max-pages',
      'web-output-dir',
      'web-start-btn',
      
      // Academic search tab
      'academic-tab-content',
      'academic-query-input',
      'academic-sources-select',
      'academic-max-results',
      'academic-search-btn',
      
      // Downloads tab
      'downloads-tab-content',
      'downloads-queue-container',
      'downloads-active-container',
      'downloads-completed-container',
      
      // PDF selection and results
      'pdf-results-container',
      'pdf-select-all-btn',
      'pdf-select-none-btn',
      'pdf-add-to-queue-btn',
      'pdf-filter-container',
      
      // Progress and status
      'scraper-progress-container',
      'scraper-progress-bar',
      'scraper-progress-text',
      'scraper-stats-container',
      'scraper-results-container',
      'scraper-cancel-btn'
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
    // Tab switching
    const tabButtons = ['web-tab-btn', 'academic-tab-btn', 'downloads-tab-btn', 'history-tab-btn'];
    tabButtons.forEach(btnId => {
      const btn = this.state.elements.get(btnId);
      if (btn) {
        const clickHandler = () => this.switchTab(btnId.replace('-tab-btn', ''));
        btn.addEventListener('click', clickHandler);
        this.state.eventListeners.add(() => btn.removeEventListener('click', clickHandler));
      }
    });

    // Web scraping form
    const webStartBtn = this.state.elements.get('web-start-btn');
    if (webStartBtn) {
      const clickHandler = () => this.startWebScraping();
      webStartBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => webStartBtn.removeEventListener('click', clickHandler));
    }

    // Academic search form
    const academicSearchBtn = this.state.elements.get('academic-search-btn');
    if (academicSearchBtn) {
      const clickHandler = () => this.startAcademicSearch();
      academicSearchBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => academicSearchBtn.removeEventListener('click', clickHandler));
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

    const addToQueueBtn = this.state.elements.get('pdf-add-to-queue-btn');
    if (addToQueueBtn) {
      const clickHandler = () => this.addSelectedToDownloadQueue();
      addToQueueBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => addToQueueBtn.removeEventListener('click', clickHandler));
    }

    // Cancel button
    const cancelBtn = this.state.elements.get('scraper-cancel-btn');
    if (cancelBtn) {
      const clickHandler = () => this.cancelCurrentTask();
      cancelBtn.addEventListener('click', clickHandler);
      this.state.eventListeners.add(() => cancelBtn.removeEventListener('click', clickHandler));
    }

    // Form validation
    this.setupInputValidation();
  }

  /**
   * Setup Socket.IO event handlers using Blueprint events
   */
  setupSocketHandlers() {
    if (!window.socket) return;

    // General task events
    const taskStartedHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskStarted(data);
      }
    };
    window.socket.on(TASK_EVENTS.STARTED, taskStartedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.STARTED, taskStartedHandler));

    const progressHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleProgressUpdate(data);
      }
    };
    window.socket.on(TASK_EVENTS.PROGRESS, progressHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.PROGRESS, progressHandler));

    const completedHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskCompleted(data);
      }
    };
    window.socket.on(TASK_EVENTS.COMPLETED, completedHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.COMPLETED, completedHandler));

    const errorHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleTaskError(data);
      }
    };
    window.socket.on(TASK_EVENTS.ERROR, errorHandler);
    this.state.socketListeners.add(() => window.socket.off(TASK_EVENTS.ERROR, errorHandler));

    // Scraper-specific events
    const urlScrapedHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handleUrlScraped(data);
      }
    };
    window.socket.on(SCRAPER_EVENTS.url_scraped, urlScrapedHandler);
    this.state.socketListeners.add(() => window.socket.off(SCRAPER_EVENTS.url_scraped, urlScrapedHandler));

    const pdfFoundHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfFound(data);
      }
    };
    window.socket.on(SCRAPER_EVENTS.pdf_found, pdfFoundHandler);
    this.state.socketListeners.add(() => window.socket.off(SCRAPER_EVENTS.pdf_found, pdfFoundHandler));

    // PDF download events
    const pdfDownloadStartHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfDownloadStart(data);
      }
    };
    window.socket.on(SCRAPER_EVENTS.pdf_download_start, pdfDownloadStartHandler);
    this.state.socketListeners.add(() => window.socket.off(SCRAPER_EVENTS.pdf_download_start, pdfDownloadStartHandler));

    const pdfDownloadProgressHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfDownloadProgress(data);
      }
    };
    window.socket.on(SCRAPER_EVENTS.pdf_download_progress, pdfDownloadProgressHandler);
    this.state.socketListeners.add(() => window.socket.off(SCRAPER_EVENTS.pdf_download_progress, pdfDownloadProgressHandler));

    const pdfDownloadCompleteHandler = (data) => {
      if (this.isMyTask(data.task_id)) {
        this.handlePdfDownloadComplete(data);
      }
    };
    window.socket.on(SCRAPER_EVENTS.pdf_download_complete, pdfDownloadCompleteHandler);
    this.state.socketListeners.add(() => window.socket.off(SCRAPER_EVENTS.pdf_download_complete, pdfDownloadCompleteHandler));

    // Academic search events
    const academicResultsHandler = (data) => {
      this.handleAcademicResults(data);
    };
    window.socket.on(ACADEMIC_EVENTS.paper_found, academicResultsHandler);
    this.state.socketListeners.add(() => window.socket.off(ACADEMIC_EVENTS.paper_found, academicResultsHandler));
  }

  /**
   * Setup tab navigation system
   */
  setupTabs() {
    // Initialize with web tab active
    this.switchTab('web');
  }

  /**
   * Setup form validation
   */
  setupFormValidation() {
    // Web scraping validation
    const webUrlsInput = this.state.elements.get('web-urls-input');
    if (webUrlsInput) {
      webUrlsInput.addEventListener('input', () => this.validateWebForm());
    }

    // Academic search validation
    const academicQueryInput = this.state.elements.get('academic-query-input');
    if (academicQueryInput) {
      academicQueryInput.addEventListener('input', () => this.validateAcademicForm());
    }
  }

  /**
   * Setup input validation with real-time feedback
   */
  setupInputValidation() {
    const webUrlsInput = this.state.elements.get('web-urls-input');
    if (webUrlsInput) {
      webUrlsInput.addEventListener('blur', () => {
        const urls = this.parseUrls(webUrlsInput.value);
        this.validateUrls(urls);
      });
    }
  }

  /**
   * Setup download manager
   */
  setupDownloadManager() {
    // Start download queue processor
    this.startDownloadQueueProcessor();
    
    // Setup auto-refresh for download status
    this.setupAutoRefresh();
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    this.state.activeTab = tabName;
    
    // Update tab button states
    const tabButtons = ['web-tab-btn', 'academic-tab-btn', 'downloads-tab-btn', 'history-tab-btn'];
    tabButtons.forEach(btnId => {
      const btn = this.state.elements.get(btnId);
      if (btn) {
        const isActive = btnId === `${tabName}-tab-btn`;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive);
      }
    });

    // Show/hide tab content
    const tabContents = ['web-tab-content', 'academic-tab-content', 'downloads-tab-content', 'history-tab-content'];
    tabContents.forEach(contentId => {
      const content = this.state.elements.get(contentId);
      if (content) {
        const isActive = contentId === `${tabName}-tab-content`;
        content.style.display = isActive ? 'block' : 'none';
      }
    });

    // Update current mode
    this.state.currentMode = tabName;
    
    // Save tab state
    localStorage.setItem('webScraper_activeTab', tabName);
    
    // Tab-specific initialization
    if (tabName === 'downloads') {
      this.refreshDownloadsView();
    } else if (tabName === 'history') {
      this.refreshHistoryView();
    }
  }

  /**
   * Start web scraping process
   */
  async startWebScraping() {
    try {
      const urlsInput = this.state.elements.get('web-urls-input');
      const recursiveToggle = this.state.elements.get('web-recursive-toggle');
      const maxDepthInput = this.state.elements.get('web-max-depth');
      const maxPagesInput = this.state.elements.get('web-max-pages');
      const outputDirInput = this.state.elements.get('web-output-dir');

      if (!urlsInput?.value.trim()) {
        this.showError('Please enter at least one URL to scrape');
        return;
      }

      const urls = this.parseUrls(urlsInput.value);
      if (urls.length === 0) {
        this.showError('Please enter valid URLs');
        return;
      }

      const options = {
        urls,
        recursive: recursiveToggle?.checked || false,
        max_depth: parseInt(maxDepthInput?.value) || this.config.maxDepth,
        max_pages: parseInt(maxPagesInput?.value) || this.config.maxPages,
        output_directory: outputDirInput?.value.trim() || null,
        pdf_options: this.config.pdfOptions,
        respect_robots: this.config.respectRobots,
        request_delay: this.config.requestDelay,
        timeout: this.config.timeout
      };

      this.state.processingState = 'scraping';
      this.updateUI();

      // Start scraping using Blueprint API
      const response = await blueprintApi.startWebScraping(urls, options.output_directory, options);

      // Store task information
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
      this.showInfo(`Scraping started for ${urls.length} URL(s)`);

    } catch (error) {
      console.error('❌ Failed to start web scraping:', error);
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
        this.showError('Please enter a search query');
        return;
      }

      const query = queryInput.value.trim();
      const sources = this.getSelectedSources(sourcesSelect);
      const maxResults = parseInt(maxResultsInput?.value) || this.config.maxResultsPerSource;

      this.state.processingState = 'searching';
      this.updateUI();

      // Start academic search using Blueprint API
      const response = await blueprintApi.searchAcademicPapers(query, sources, maxResults);

      console.log(`📚 Academic search started: ${response.search_id || 'unknown'}`);
      this.showInfo(`Searching for: "${query}" across ${sources.length} source(s)`);

    } catch (error) {
      console.error('❌ Failed to start academic search:', error);
      this.handleTaskError({ error: error.message });
    }
  }

  /**
   * Parse URLs from input text
   */
  parseUrls(text) {
    if (!text) return [];
    
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    // Also handle line-separated URLs
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const lineUrls = lines.filter(line => /^https?:\/\//.test(line));
    
    return [...new Set([...urls, ...lineUrls])];
  }

  /**
   * Validate URLs
   */
  validateUrls(urls) {
    const urlsInput = this.state.elements.get('web-urls-input');
    if (!urlsInput) return false;

    urlsInput.classList.remove('is-invalid', 'is-valid');

    if (urls.length === 0) {
      urlsInput.classList.add('is-invalid');
      this.showFieldFeedback(urlsInput, 'Please enter valid URLs', 'invalid');
      return false;
    }

    // Validate each URL
    const invalidUrls = urls.filter(url => {
      try {
        new URL(url);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      urlsInput.classList.add('is-invalid');
      this.showFieldFeedback(urlsInput, `${invalidUrls.length} invalid URL(s) found`, 'invalid');
      return false;
    }

    urlsInput.classList.add('is-valid');
    this.showFieldFeedback(urlsInput, `${urls.length} valid URL(s)`, 'valid');
    return true;
  }

  /**
   * Get selected academic sources
   */
  getSelectedSources(selectElement) {
    if (!selectElement) return this.config.academicSources;
    
    const selected = Array.from(selectElement.selectedOptions).map(option => option.value);
    return selected.includes('all') ? this.config.academicSources : selected;
  }

  /**
   * Validate web scraping form
   */
  validateWebForm() {
    const urlsInput = this.state.elements.get('web-urls-input');
    const startBtn = this.state.elements.get('web-start-btn');

    const urls = this.parseUrls(urlsInput?.value || '');
    const isValid = urls.length > 0 && this.state.processingState === 'idle';

    if (startBtn) {
      startBtn.disabled = !isValid;
    }

    return isValid;
  }

  /**
   * Validate academic search form
   */
  validateAcademicForm() {
    const queryInput = this.state.elements.get('academic-query-input');
    const searchBtn = this.state.elements.get('academic-search-btn');

    const query = queryInput?.value.trim() || '';
    const isValid = query.length > 0 && this.state.processingState === 'idle';

    if (searchBtn) {
      searchBtn.disabled = !isValid;
    }

    return isValid;
  }

  /**
   * Check if a task belongs to this module instance
   */
  isMyTask(taskId) {
    return this.state.activeTasks.has(taskId) || 
           (this.state.currentTask && this.state.currentTask.id === taskId);
  }

  /**
   * Handle task started event
   */
  handleTaskStarted(data) {
    console.log('🚀 Task started:', data);
    this.showProgress(0, 'Starting...');
    
    // Update task info
    if (this.state.currentTask) {
      this.state.currentTask.status = 'started';
    }
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

    // Update task info
    if (this.state.currentTask) {
      this.state.currentTask.progress = progress;
      this.state.currentTask.stats = data.stats;
    }
  }

  /**
   * Handle URL scraped event
   */
  handleUrlScraped(data) {
    console.log('🔍 URL scraped:', data);
    
    // Add to results
    if (this.state.currentTask) {
      if (!this.state.currentTask.scrapedUrls) {
        this.state.currentTask.scrapedUrls = [];
      }
      this.state.currentTask.scrapedUrls.push({
        url: data.url,
        title: data.title,
        size: data.size,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle PDF found event
   */
  handlePdfFound(data) {
    console.log('📄 PDF found:', data);
    
    // Add to found PDFs
    if (this.state.currentTask) {
      this.state.currentTask.foundPdfs.set(data.pdf_url, {
        url: data.pdf_url,
        title: data.pdf_title || 'Unknown Title',
        size: data.size || 0,
        source: data.source_url || 'Unknown Source',
        timestamp: Date.now()
      });
    }

    // Update PDF results display
    this.updatePdfResults();
  }

  /**
   * Handle PDF download start
   */
  handlePdfDownloadStart(data) {
    console.log('⬇️ PDF download started:', data);
    
    // Add to download progress tracking
    this.state.downloadProgress.set(data.pdf_url, {
      url: data.pdf_url,
      title: data.pdf_title,
      progress: 0,
      status: 'downloading',
      startTime: Date.now()
    });

    this.updateDownloadsView();
  }

  /**
   * Handle PDF download progress
   */
  handlePdfDownloadProgress(data) {
    const downloadInfo = this.state.downloadProgress.get(data.pdf_url);
    if (downloadInfo) {
      downloadInfo.progress = data.progress;
      downloadInfo.downloadedBytes = data.downloaded_bytes;
      downloadInfo.totalBytes = data.total_bytes;
      downloadInfo.speed = data.speed_bps;
    }

    this.updateDownloadsView();
  }

  /**
   * Handle PDF download complete
   */
  handlePdfDownloadComplete(data) {
    console.log('✅ PDF download completed:', data);
    
    const downloadInfo = this.state.downloadProgress.get(data.pdf_url);
    if (downloadInfo) {
      downloadInfo.progress = 100;
      downloadInfo.status = 'completed';
      downloadInfo.filePath = data.file_path;
      downloadInfo.endTime = Date.now();
    }

    this.updateDownloadsView();
  }

  /**
   * Handle academic search results
   */
  handleAcademicResults(data) {
    console.log('📚 Academic results received:', data);
    
    // Store results by source
    if (!this.state.academicResults.has(data.source)) {
      this.state.academicResults.set(data.source, []);
    }
    
    const sourceResults = this.state.academicResults.get(data.source);
    sourceResults.push(...(data.papers || []));
    
    // Update academic results display
    this.updateAcademicResults();
  }

  /**
   * Handle task completion
   */
  handleTaskCompleted(data) {
    console.log('✅ Task completed:', data);
    
    this.state.processingState = 'completed';
    this.showProgress(100, 'Task completed successfully!');
    
    // Show results
    this.showResults(data);
    
    // Update stats
    if (data.stats) {
      this.updateStats(data.stats);
    }
    
    // Update task info
    if (this.state.currentTask) {
      this.state.currentTask.status = 'completed';
      this.state.currentTask.endTime = Date.now();
      this.state.currentTask.results = data;
    }
    
    this.updateUI();
  }

  /**
   * Handle task error
   */
  handleTaskError(data) {
    console.error('❌ Task error:', data);
    
    this.state.processingState = 'error';
    this.showError(data.error || 'Task failed');
    
    // Update task info
    if (this.state.currentTask) {
      this.state.currentTask.status = 'error';
      this.state.currentTask.error = data.error;
    }
    
    this.updateUI();
  }

  /**
   * Cancel current task
   */
  async cancelCurrentTask() {
    if (!this.state.currentTask) return;

    try {
      await blueprintApi.cancelTask(this.state.currentTask.id);
      console.log(`🚫 Task cancelled: ${this.state.currentTask.id}`);
      
      this.state.processingState = 'idle';
      this.updateUI();
      
    } catch (error) {
      console.error('❌ Failed to cancel task:', error);
    }
  }

  /**
   * Select all PDFs
   */
  selectAllPdfs() {
    const checkboxes = document.querySelectorAll('.pdf-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      this.state.selectedPdfs.add(checkbox.value);
    });
    
    this.updateSelectionButtons();
  }

  /**
   * Select no PDFs
   */
  selectNonePdfs() {
    const checkboxes = document.querySelectorAll('.pdf-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    
    this.state.selectedPdfs.clear();
    this.updateSelectionButtons();
  }

  /**
   * Add selected PDFs to download queue
   */
  async addSelectedToDownloadQueue() {
    if (this.state.selectedPdfs.size === 0) {
      this.showWarning('Please select PDFs to download');
      return;
    }

    try {
      const selectedUrls = Array.from(this.state.selectedPdfs);
      
      // Add to download queue
      selectedUrls.forEach(url => {
        const pdfInfo = this.getPdfInfo(url);
        if (pdfInfo) {
          this.state.downloadQueue.set(url, {
            ...pdfInfo,
            status: 'queued',
            addedTime: Date.now()
          });
        }
      });

      this.showInfo(`Added ${selectedUrls.length} PDF(s) to download queue`);
      
      // Switch to downloads tab
      this.switchTab('downloads');
      
      // Start processing queue
      this.processDownloadQueue();
      
    } catch (error) {
      console.error('❌ Failed to add PDFs to queue:', error);
      this.showError('Failed to add PDFs to download queue');
    }
  }

  /**
   * Get PDF info from various sources
   */
  getPdfInfo(url) {
    // Check current task found PDFs
    if (this.state.currentTask?.foundPdfs.has(url)) {
      return this.state.currentTask.foundPdfs.get(url);
    }
    
    // Check academic results
    for (const sourceResults of this.state.academicResults.values()) {
      const paper = sourceResults.find(p => p.pdf_url === url);
      if (paper) {
        return {
          url: paper.pdf_url,
          title: paper.title,
          authors: paper.authors,
          source: paper.source,
          size: paper.size || 0
        };
      }
    }
    
    return null;
  }

  /**
   * Process download queue
   */
  async processDownloadQueue() {
    const activeDownloads = Array.from(this.state.downloadProgress.values())
      .filter(d => d.status === 'downloading').length;
    
    if (activeDownloads >= this.config.pdfOptions.maxDownloads) {
      return; // Wait for current downloads to complete
    }
    
    // Get next items from queue
    const queuedItems = Array.from(this.state.downloadQueue.entries())
      .filter(([_, item]) => item.status === 'queued')
      .slice(0, this.config.pdfOptions.maxDownloads - activeDownloads);
    
    for (const [url, item] of queuedItems) {
      try {
        // Mark as downloading
        item.status = 'downloading';
        this.state.downloadProgress.set(url, {
          ...item,
          progress: 0,
          startTime: Date.now()
        });
        
        // Start download (this will trigger socket events)
        await blueprintApi.request('/api/download-pdf', {
          method: 'POST',
          body: JSON.stringify({
            url: url,
            title: item.title,
            output_directory: this.getCurrentOutputDirectory()
          })
        }, 'web_scraper');
        
      } catch (error) {
        console.error(`❌ Failed to start download for ${url}:`, error);
        item.status = 'error';
        item.error = error.message;
      }
    }
    
    this.updateDownloadsView();
  }

  /**
   * Start download queue processor (runs periodically)
   */
  startDownloadQueueProcessor() {
    setInterval(() => {
      if (this.state.downloadQueue.size > 0) {
        this.processDownloadQueue();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Setup auto-refresh for dynamic content
   */
  setupAutoRefresh() {
    setInterval(() => {
      if (this.state.activeTab === 'downloads') {
        this.updateDownloadsView();
      }
    }, this.config.autoRefreshInterval);
  }

  /**
   * Update PDF results display
   */
  updatePdfResults() {
    const container = this.state.elements.get('pdf-results-container');
    if (!container) return;

    let allPdfs = [];
    
    // Collect PDFs from current task
    if (this.state.currentTask?.foundPdfs) {
      allPdfs.push(...Array.from(this.state.currentTask.foundPdfs.values()));
    }
    
    // Collect PDFs from academic results
    for (const sourceResults of this.state.academicResults.values()) {
      const pdfs = sourceResults.filter(paper => paper.pdf_url);
      allPdfs.push(...pdfs.map(paper => ({
        url: paper.pdf_url,
        title: paper.title,
        authors: paper.authors,
        source: paper.source,
        size: paper.size || 0
      })));
    }

    // Apply filters
    allPdfs = this.applyFilters(allPdfs);

    // Generate HTML
    const html = this.generatePdfResultsHtml(allPdfs);
    container.innerHTML = html;

    // Add event listeners for checkboxes
    this.setupPdfCheckboxes();
    
    this.updateSelectionButtons();
  }

  /**
   * Generate HTML for PDF results
   */
  generatePdfResultsHtml(pdfs) {
    if (pdfs.length === 0) {
      return '<div class="text-center text-muted py-4">No PDFs found</div>';
    }

    return `
      <div class="pdf-results-header mb-3">
        <div class="d-flex justify-content-between align-items-center">
          <h5>Found PDFs (${pdfs.length})</h5>
          <div class="btn-group" role="group">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.webScraper.selectAllPdfs()">
              Select All
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.webScraper.selectNonePdfs()">
              Select None
            </button>
          </div>
        </div>
      </div>
      
      <div class="pdf-list">
        ${pdfs.map(pdf => `
          <div class="pdf-item card mb-2">
            <div class="card-body p-3">
              <div class="d-flex align-items-start">
                <div class="form-check me-3">
                  <input class="form-check-input pdf-checkbox" type="checkbox" 
                         value="${pdf.url}" id="pdf-${this.generateId(pdf.url)}">
                </div>
                <div class="flex-grow-1">
                  <h6 class="card-title mb-1">${this.escapeHtml(pdf.title)}</h6>
                  ${pdf.authors ? `<p class="text-muted small mb-1">By: ${this.escapeHtml(pdf.authors)}</p>` : ''}
                  <div class="d-flex justify-content-between text-sm">
                    <span class="text-muted">Source: ${this.escapeHtml(pdf.source)}</span>
                    <span class="text-muted">${this.formatFileSize(pdf.size)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="pdf-actions mt-3">
        <button type="button" class="btn btn-primary" id="add-selected-to-queue">
          <i class="fas fa-plus me-2"></i>Add Selected to Download Queue
        </button>
      </div>
    `;
  }

  /**
   * Setup PDF checkbox event listeners
   */
  setupPdfCheckboxes() {
    const checkboxes = document.querySelectorAll('.pdf-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.state.selectedPdfs.add(e.target.value);
        } else {
          this.state.selectedPdfs.delete(e.target.value);
        }
        this.updateSelectionButtons();
      });
    });

    // Add selected to queue button
    const addButton = document.getElementById('add-selected-to-queue');
    if (addButton) {
      addButton.addEventListener('click', () => this.addSelectedToDownloadQueue());
    }
  }

  /**
   * Update selection buttons state
   */
  updateSelectionButtons() {
    const addButton = document.getElementById('add-selected-to-queue');
    if (addButton) {
      addButton.disabled = this.state.selectedPdfs.size === 0;
      addButton.textContent = `Add Selected to Queue (${this.state.selectedPdfs.size})`;
    }
  }

  /**
   * Apply filters to PDF list
   */
  applyFilters(pdfs) {
    return pdfs.filter(pdf => {
      // Source filter
      if (this.state.filters.source !== 'all' && 
          !pdf.source.toLowerCase().includes(this.state.filters.source.toLowerCase())) {
        return false;
      }
      
      // Title filter
      if (this.state.filters.title && 
          !pdf.title.toLowerCase().includes(this.state.filters.title.toLowerCase())) {
        return false;
      }
      
      // Author filter
      if (this.state.filters.author && pdf.authors &&
          !pdf.authors.toLowerCase().includes(this.state.filters.author.toLowerCase())) {
        return false;
      }
      
      // File size filter
      if (this.state.filters.fileSize !== 'all') {
        const size = pdf.size || 0;
        switch (this.state.filters.fileSize) {
          case 'small':
            if (size > 5 * 1024 * 1024) return false; // > 5MB
            break;
          case 'medium':
            if (size <= 5 * 1024 * 1024 || size > 20 * 1024 * 1024) return false; // 5-20MB
            break;
          case 'large':
            if (size <= 20 * 1024 * 1024) return false; // > 20MB
            break;
        }
      }
      
      return true;
    });
  }

  /**
   * Update academic results display
   */
  updateAcademicResults() {
    // Academic results are displayed as PDFs in the PDF results container
    this.updatePdfResults();
  }

  /**
   * Update downloads view
   */
  updateDownloadsView() {
    this.refreshDownloadsView();
  }

  /**
   * Refresh downloads view
   */
  refreshDownloadsView() {
    const container = this.state.elements.get('downloads-tab-content');
    if (!container) return;

    const queuedDownloads = Array.from(this.state.downloadQueue.values())
      .filter(item => item.status === 'queued');
    
    const activeDownloads = Array.from(this.state.downloadProgress.values())
      .filter(item => item.status === 'downloading');
    
    const completedDownloads = Array.from(this.state.downloadProgress.values())
      .filter(item => item.status === 'completed');

    const html = `
      <div class="downloads-overview mb-4">
        <div class="row text-center">
          <div class="col-md-3">
            <div class="stat-card">
              <h3 class="text-primary">${queuedDownloads.length}</h3>
              <p class="text-muted">Queued</p>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card">
              <h3 class="text-warning">${activeDownloads.length}</h3>
              <p class="text-muted">Downloading</p>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card">
              <h3 class="text-success">${completedDownloads.length}</h3>
              <p class="text-muted">Completed</p>
            </div>
          </div>
          <div class="col-md-3">
            <div class="stat-card">
              <h3 class="text-info">${this.config.pdfOptions.maxDownloads}</h3>
              <p class="text-muted">Max Concurrent</p>
            </div>
          </div>
        </div>
      </div>

      ${activeDownloads.length > 0 ? `
        <div class="active-downloads mb-4">
          <h5>Active Downloads</h5>
          ${activeDownloads.map(download => this.generateDownloadItemHtml(download, 'active')).join('')}
        </div>
      ` : ''}

      ${queuedDownloads.length > 0 ? `
        <div class="queued-downloads mb-4">
          <h5>Download Queue</h5>
          ${queuedDownloads.map(download => this.generateDownloadItemHtml(download, 'queued')).join('')}
        </div>
      ` : ''}

      ${completedDownloads.length > 0 ? `
        <div class="completed-downloads mb-4">
          <h5>Completed Downloads</h5>
          ${completedDownloads.map(download => this.generateDownloadItemHtml(download, 'completed')).join('')}
        </div>
      ` : ''}
    `;

    container.innerHTML = html;
  }

  /**
   * Generate HTML for download item
   */
  generateDownloadItemHtml(download, type) {
    const progress = download.progress || 0;
    const statusIcon = {
      'queued': 'fas fa-clock text-warning',
      'active': 'fas fa-download text-primary',
      'completed': 'fas fa-check-circle text-success',
      'error': 'fas fa-exclamation-circle text-danger'
    }[download.status] || 'fas fa-question-circle';

    return `
      <div class="download-item card mb-2">
        <div class="card-body p-3">
          <div class="d-flex align-items-center">
            <i class="${statusIcon} me-3"></i>
            <div class="flex-grow-1">
              <h6 class="mb-1">${this.escapeHtml(download.title)}</h6>
              <div class="small text-muted mb-2">${this.escapeHtml(download.url)}</div>
              
              ${type === 'active' ? `
                <div class="progress mb-2" style="height: 6px;">
                  <div class="progress-bar" role="progressbar" 
                       style="width: ${progress}%" 
                       aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
                  </div>
                </div>
                <div class="d-flex justify-content-between small text-muted">
                  <span>${progress.toFixed(1)}%</span>
                  ${download.speed ? `<span>${this.formatSpeed(download.speed)}</span>` : ''}
                </div>
              ` : ''}
              
              ${type === 'completed' ? `
                <div class="small text-success">
                  <i class="fas fa-check me-1"></i>
                  Downloaded in ${this.formatDuration((download.endTime - download.startTime) / 1000)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Refresh history view
   */
  refreshHistoryView() {
    // Implementation for history view
    console.log('Refreshing history view...');
  }

  /**
   * Get current output directory
   */
  getCurrentOutputDirectory() {
    const outputDirInput = this.state.elements.get('web-output-dir');
    return outputDirInput?.value.trim() || null;
  }

  /**
   * Update UI based on current state
   */
  updateUI() {
    const webStartBtn = this.state.elements.get('web-start-btn');
    const academicSearchBtn = this.state.elements.get('academic-search-btn');
    const cancelBtn = this.state.elements.get('scraper-cancel-btn');
    const progressContainer = this.state.elements.get('scraper-progress-container');

    // Update buttons based on processing state
    if (webStartBtn) {
      webStartBtn.disabled = this.state.processingState !== 'idle';
      webStartBtn.textContent = this.state.processingState === 'scraping' ? 'Scraping...' : 'Start Scraping';
    }

    if (academicSearchBtn) {
      academicSearchBtn.disabled = this.state.processingState !== 'idle';
      academicSearchBtn.textContent = this.state.processingState === 'searching' ? 'Searching...' : 'Search';
    }

    if (cancelBtn) {
      cancelBtn.style.display = ['scraping', 'downloading', 'processing'].includes(this.state.processingState) ? 'inline-block' : 'none';
    }

    if (progressContainer) {
      progressContainer.style.display = 
        ['scraping', 'downloading', 'processing', 'completed', 'error'].includes(this.state.processingState) ? 'block' : 'none';
    }
  }

  /**
   * Show progress update
   */
  showProgress(progress, message) {
    const progressBar = this.state.elements.get('scraper-progress-bar');
    const progressText = this.state.elements.get('scraper-progress-text');

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
    const statsContainer = this.state.elements.get('scraper-stats-container');
    if (!statsContainer) return;

    const statsHtml = `
      <div class="row text-center">
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${stats.urls_processed || 0}</div>
            <div class="stat-label">URLs Processed</div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${stats.pdfs_found || 0}</div>
            <div class="stat-label">PDFs Found</div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${stats.pdfs_downloaded || 0}</div>
            <div class="stat-label">PDFs Downloaded</div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${this.formatFileSize(stats.total_size || 0)}</div>
            <div class="stat-label">Total Size</div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${this.formatDuration(stats.elapsed_time || 0)}</div>
            <div class="stat-label">Elapsed Time</div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="stat-item">
            <div class="stat-value">${stats.current_depth || 0}</div>
            <div class="stat-label">Crawl Depth</div>
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
    const resultsContainer = this.state.elements.get('scraper-results-container');
    if (!resultsContainer) return;

    const resultsHtml = `
      <div class="alert alert-success">
        <h5><i class="fas fa-check-circle me-2"></i>Scraping Complete!</h5>
        <p>Successfully processed ${data.stats?.urls_processed || 0} URLs</p>
        <p>Found ${data.stats?.pdfs_found || 0} PDFs and downloaded ${data.stats?.pdfs_downloaded || 0}</p>
        
        ${data.output_directory ? `
          <p>Results saved to: <strong>${data.output_directory}</strong></p>
        ` : ''}
        
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
   * Load saved state from localStorage
   */
  loadSavedState() {
    try {
      const savedTab = localStorage.getItem('webScraper_activeTab');
      if (savedTab) {
        this.switchTab(savedTab);
      }

      const savedFilters = localStorage.getItem('webScraper_filters');
      if (savedFilters) {
        this.state.filters = { ...this.state.filters, ...JSON.parse(savedFilters) };
      }
    } catch (error) {
      console.warn('Failed to load saved state:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  saveState() {
    try {
      localStorage.setItem('webScraper_activeTab', this.state.activeTab);
      localStorage.setItem('webScraper_filters', JSON.stringify(this.state.filters));
    } catch (error) {
      console.warn('Failed to save state:', error);
    }
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
   * Show toast notification
   */
  showToast(title, message, type = 'info') {
    if (window.showToast) {
      window.showToast(title, message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showToast('Web Scraper Error', message, 'error');
  }

  /**
   * Show warning message
   */
  showWarning(message) {
    this.showToast('Web Scraper Warning', message, 'warning');
  }

  /**
   * Show info message
   */
  showInfo(message) {
    this.showToast('Web Scraper', message, 'info');
  }

  /**
   * Utility functions
   */
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

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

  formatSpeed(bytesPerSecond) {
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  generateId(text) {
    return btoa(text).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.state.currentTask = null;
    this.state.processingState = 'idle';
    this.state.selectedPdfs.clear();
    this.state.downloadQueue.clear();
    this.state.downloadProgress.clear();
    
    // Clear UI
    const progressContainer = this.state.elements.get('scraper-progress-container');
    const statsContainer = this.state.elements.get('scraper-stats-container');
    const resultsContainer = this.state.elements.get('scraper-results-container');

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

    // Cancel any ongoing tasks
    if (this.state.currentTask) {
      this.cancelCurrentTask();
    }

    // Save state before cleanup
    this.saveState();

    this.state.isInitialized = false;
  }
}

// Create singleton instance
const webScraper = new WebScraper();

// Export for use by other modules
export default webScraper;

// Expose to global scope for debugging and UI interaction
if (typeof window !== 'undefined') {
  window.webScraper = webScraper;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => webScraper.init());
} else {
  webScraper.init();
}

console.log('🌐 Web Scraper module loaded (Complete Blueprint Implementation)');