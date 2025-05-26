/**
 * Academic Search Module
 * 
 * Provides academic paper search, retrieval, and citation analysis functionality.
 * Integrates with backend academic API endpoints and provides UI for research tasks.
 * 
 * Features:
 * - Search across multiple academic sources (arXiv, Semantic Scholar, etc.)
 * - Paper details and metadata retrieval
 * - PDF download and management
 * - Citation network visualization
 * - Related paper recommendations
 * 
 * Fixed version with proper imports and no function redeclarations
 */

// Import from core modules with proper destructuring
import { registerEvents } from '../core/eventManager.js';
import { registerElement } from '../core/uiRegistry.js';
import { showErrorNotification, showSuccess } from '../core/errorHandler.js';
import { setState } from '../core/stateManager.js';

// Import DOM utilities from domUtils - correctly pull these in from a single source
import { getElement } from '../utils/domUtils.js';

// Import from utility modules - remove unused imports
import { showLoadingSpinner, showToast } from '../utils/ui.js';
import { generateId } from '../utils/utils.js';

// Import progress handler utilities - only include what we actually use
import { trackProgress } from '../utils/progressHandler.js';

/**
 * Academic Search class for handling academic search and paper management
 */
class AcademicSearch {
    /**
     * Create a new AcademicSearch instance
     */
    constructor() {
        // Initialize state
        this.searchResults = [];
        this.currentPaperDetails = null;
        this.downloadQueue = new Map();
        
        // Track active operations
        this.activeSearches = new Map();
        this.activePaperRequests = new Map();
        
        // Internal state for the module
        this.state = {
            initialized: false,
            lastSearch: null,
            now: () => Date.now(),
            currentSpinner: null, // Track current loading spinner
            from: (timestamp) => new Date(timestamp)
        };
        
        // Initialize the module
        this.initialize();
    }
    
    /**
     * Show loading spinner (internal helper)
     * @param {string} message - Loading message
     */
    showLoading(message) {
        // Hide any existing spinner first
        this.hideLoading();
        // Create new spinner and store reference
        this.state.currentSpinner = showLoadingSpinner(message);
    }
    
    /**
     * Hide current loading spinner (internal helper)
     */
    hideLoading() {
        if (this.state.currentSpinner && this.state.currentSpinner.hide) {
            this.state.currentSpinner.hide();
            this.state.currentSpinner = null;
        }
    }

    /**
     * Initialize the academic search module
     * @returns {boolean} Success status
     */
    initialize() {
        console.log("Initializing Academic Search module");
        this.registerUIElements();
        this.setupEventListeners();
        
        // Load previous state if available
        this.loadSavedState();
        
        this.state.initialized = true;
        return true;
    }

    /**
     * Register UI elements used by this module
     */
    registerUIElements() {
        // Register only if elements exist in the DOM
        if (document.querySelector('#academic-search-form')) {
            registerElement('academicSearchForm', '#academic-search-form');
        }
        
        if (document.querySelector('#academic-query-input')) {
            registerElement('academicQueryInput', '#academic-query-input');
        }
        
        if (document.querySelector('#academic-source-select')) {
            registerElement('academicSourceSelect', '#academic-source-select');
        }
        
        if (document.querySelector('#academic-search-btn')) {
            registerElement('academicSearchBtn', '#academic-search-btn');
        }
        
        if (document.querySelector('#academic-results-container')) {
            registerElement('academicResultsContainer', '#academic-results-container');
        }
        
        if (document.querySelector('#academic-paper-details')) {
            registerElement('academicPaperDetailsContainer', '#academic-paper-details');
        }
        
        if (document.querySelector('#academic-citations-container')) {
            registerElement('academicCitationsContainer', '#academic-citations-container');
        }
        
        if (document.querySelector('#academic-download-queue')) {
            registerElement('academicDownloadQueue', '#academic-download-queue');
        }
    }

    /**
     * Set up event listeners for academic search functionality
     */
    setupEventListeners() {
        try {
            // Get form elements if they exist
            const searchForm = getElement('academicSearchForm');
            const searchBtn = getElement('academicSearchBtn');
            
            // Use event registry if elements exist
            if (searchForm) {
                registerEvents({
                    'submit:academicSearchForm': (e) => this.handleSearchSubmit(e)
                });
            }
            
            if (searchBtn) {
                registerEvents({
                    'click:academicSearchBtn': () => this.performSearch()
                });
            }
            
            // Use event delegation for results and actions
            document.addEventListener('click', (e) => {
                // View paper details
                if (e.target.closest('.view-paper-details')) {
                    const button = e.target.closest('.view-paper-details');
                    this.loadPaperDetails(button.dataset.id, button.dataset.source);
                    e.preventDefault();
                }
                
                // Download paper
                if (e.target.closest('.download-paper')) {
                    const button = e.target.closest('.download-paper');
                    this.downloadPaper(button.dataset.id, button.dataset.source, button.dataset.pdfUrl);
                    e.preventDefault();
                }
                
                // View citations
                if (e.target.closest('.view-citations')) {
                    const button = e.target.closest('.view-citations');
                    this.loadPaperCitations(button.dataset.id, button.dataset.source);
                    e.preventDefault();
                }
                
                // View recommendations
                if (e.target.closest('.view-recommendations')) {
                    const button = e.target.closest('.view-recommendations');
                    this.loadRecommendations(button.dataset.id, button.dataset.source);
                    e.preventDefault();
                }
                
                // Extract papers from URL
                if (e.target.closest('.extract-papers')) {
                    const button = e.target.closest('.extract-papers');
                    this.extractPapersFromUrl(button.dataset.url);
                    e.preventDefault();
                }
            });
            
            console.log("Academic search event listeners set up");
        } catch (error) {
            console.error("Error setting up academic search event listeners:", error);
        }
    }

    /**
     * Load saved state from localStorage
     */
    loadSavedState() {
        try {
            const savedState = localStorage.getItem('academicSearchState');
            if (savedState) {
                const state = JSON.parse(savedState);
                
                // Restore last search if available
                if (state.lastSearch) {
                    const queryInput = getElement('academicQueryInput');
                    const sourceSelect = getElement('academicSourceSelect');
                    
                    if (queryInput && state.lastSearch.query) {
                        queryInput.value = state.lastSearch.query;
                    }
                    
                    if (sourceSelect && state.lastSearch.source) {
                        sourceSelect.value = state.lastSearch.source;
                    }
                    
                    this.state.lastSearch = state.lastSearch;
                }
                
                // Restore download queue if available
                if (state.downloadQueue && Array.isArray(state.downloadQueue)) {
                    state.downloadQueue.forEach(item => {
                        if (item.id && item.status) {
                            this.downloadQueue.set(item.id, item);
                        }
                    });
                    
                    // Update queue display
                    this.updateDownloadQueue();
                }
            }
        } catch (error) {
            console.error("Error loading saved academic search state:", error);
        }
    }

    /**
     * Save current state to localStorage
     */
    saveState() {
        try {
            const state = {
                lastSearch: this.state.lastSearch || {
                    query: getElement('academicQueryInput')?.value || '',
                    source: getElement('academicSourceSelect')?.value || 'arxiv',
                    timestamp: Date.now()
                },
                downloadQueue: Array.from(this.downloadQueue.values())
            };
            
            localStorage.setItem('academicSearchState', JSON.stringify(state));
        } catch (error) {
            console.error("Error saving academic search state:", error);
        }
    }

    /**
     * Handle search form submission
     * @param {Event} event - Form submission event
     */
    handleSearchSubmit(event) {
        if (event) {
            event.preventDefault();
        }
        this.performSearch();
    }

    /**
     * Perform an academic search
     * @returns {Promise<Object>} - Search results
     */
    async performSearch() {
        try {
            // Get search parameters
            const queryInput = getElement('academicQueryInput');
            const sourceSelect = getElement('academicSourceSelect');
            
            if (!queryInput) {
                throw new Error('Search form elements not found');
            }
            
            const query = queryInput.value.trim();
            const source = sourceSelect ? sourceSelect.value : 'arxiv';

            if (!query) {
                showErrorNotification(new Error('Please enter a search query'), { message: 'Please enter a search query' });
                return;
            }

            // Show loading indicator
            this.showLoading('Searching for papers...');

            // Save current search in state
            this.state.lastSearch = {
                query,
                source,
                timestamp: Date.now()
            };
            
            // Save to localStorage
            this.saveState();
            
            // Generate a unique search ID
            const searchId = generateId();
            this.activeSearches.set(searchId, { query, source, timestamp: Date.now() });

            // Make the API request
            const response = await fetch(`/api/academic/search?query=${encodeURIComponent(query)}&source=${source}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Search failed');
            }

            const data = await response.json();
            this.searchResults = data.results || [];
            
            // Update state with results
            setState('academicSearchResults', this.searchResults);
            
            // Remove from active searches
            this.activeSearches.delete(searchId);
            
            // Hide loading indicator
            this.hideLoading();
            
            // Display results
            this.displaySearchResults(this.searchResults);
            
            // Return results
            return {
                query,
                source,
                results: this.searchResults,
                total: this.searchResults.length
            };
        } catch (error) {
            // Hide loading indicator
            this.hideLoading();
            
            // Show error
            showErrorNotification(error, { message: 'Academic search failed' });
            
            // Log error
            console.error('Search error:', error);
            
            return {
                error: error.message,
                results: []
            };
        }
    }

    /**
     * Display search results in the UI
     * @param {Array} results - Search results to display
     */
    displaySearchResults(results) {
        const container = getElement('academicResultsContainer');
        if (!container) return;

        if (!results || results.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No results found. Try modifying your search query.</div>';
            return;
        }

        let html = `
            <h3>Search Results (${results.length})</h3>
            <div class="papers-list">
        `;

        results.forEach(paper => {
            html += `
                <div class="paper-item">
                    <h4>${paper.title || 'Untitled Paper'}</h4>
                    <p class="paper-authors">${this.formatAuthors(paper.authors)}</p>
                    <p class="paper-abstract">${paper.abstract || 'No abstract available'}</p>
                    <div class="paper-actions">
                        <button class="btn btn-sm btn-primary view-paper-details" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}">Details</button>
                        <button class="btn btn-sm btn-success download-paper" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}"
                            data-pdf-url="${paper.pdf_url || ''}">Download PDF</button>
                        <button class="btn btn-sm btn-outline-secondary view-citations"
                            data-id="${paper.id}" 
                            data-source="${paper.source}">Citations</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        
        // Scroll to top of results
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Format an array of authors for display
     * @param {Array} authors - Author names
     * @returns {string} - Formatted author list
     */
    formatAuthors(authors) {
        if (!authors || !Array.isArray(authors) || authors.length === 0) {
            return 'Unknown Authors';
        }
        
        if (authors.length === 1) {
            return authors[0];
        }
        
        if (authors.length === 2) {
            return `${authors[0]} and ${authors[1]}`;
        }
        
        return `${authors[0]}, ${authors[1]}, et al.`;
    }

    /**
     * Load detailed information about a paper
     * @param {string} paperId - Paper identifier
     * @param {string} source - Source database
     * @returns {Promise<Object>} - Paper details
     */
    async loadPaperDetails(paperId, source) {
        if (!paperId) return;
        
        try {
            this.showLoading('Loading paper details...');
            
            // Generate request ID
            const requestId = generateId();
            this.activePaperRequests.set(requestId, { paperId, source, type: 'details', timestamp: Date.now() });
            
            // Make API request
            const response = await fetch(`/api/academic/details/${paperId}?source=${source || 'arxiv'}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to load paper details');
            }
            
            const paperDetails = await response.json();
            this.currentPaperDetails = paperDetails;
            
            // Remove from active requests
            this.activePaperRequests.delete(requestId);
            
            // Update state
            setState('currentPaperDetails', paperDetails);
            
            this.hideLoading();
            this.displayPaperDetails(paperDetails);
            
            return paperDetails;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Failed to load paper details' });
            console.error('Error loading paper details:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display paper details in the UI
     * @param {Object} paper - Paper details to display
     */
    displayPaperDetails(paper) {
        const container = getElement('academicPaperDetailsContainer');
        if (!container) return;
        
        let html = `
            <div class="paper-details">
                <h3>${paper.title || 'Untitled Paper'}</h3>
                <p class="paper-authors"><strong>Authors:</strong> ${this.formatAuthors(paper.authors)}</p>
                <p class="paper-date"><strong>Publication Date:</strong> ${paper.publication_date || 'Unknown'}</p>
                <div class="paper-abstract">
                    <h4>Abstract</h4>
                    <p>${paper.abstract || 'No abstract available'}</p>
                </div>
        `;
        
        if (paper.metadata && Object.keys(paper.metadata).length > 0) {
            html += '<div class="paper-metadata"><h4>Metadata</h4><ul>';
            
            for (const [key, value] of Object.entries(paper.metadata)) {
                if (Array.isArray(value)) {
                    html += `<li><strong>${key}:</strong> ${value.join(', ')}</li>`;
                } else {
                    html += `<li><strong>${key}:</strong> ${value}</li>`;
                }
            }
            
            html += '</ul></div>';
        }
        
        html += `
                <div class="paper-actions">
                    ${paper.pdf_url ? `
                        <button class="btn btn-primary download-paper" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}"
                            data-pdf-url="${paper.pdf_url}">Download PDF</button>
                    ` : ''}
                    <button class="btn btn-outline-secondary view-citations"
                        data-id="${paper.id}" 
                        data-source="${paper.source}">View Citations</button>
                    <button class="btn btn-outline-secondary view-recommendations"
                        data-id="${paper.id}" 
                        data-source="${paper.source}">Similar Papers</button>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Scroll to paper details
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Download a paper PDF
     * @param {string} paperId - Paper identifier
     * @param {string} source - Paper source
     * @param {string} pdfUrl - Optional direct PDF URL
     * @returns {Promise<Object>} - Download result
     */
    async downloadPaper(paperId, source, pdfUrl) {
        let downloadId;
        
        try {
            this.showLoading('Downloading paper...');
            
            const downloadUrl = pdfUrl || (this.currentPaperDetails?.pdf_url);
            
            if (!downloadUrl && !paperId) {
                throw new Error('No PDF URL or paper ID available');
            }
            
            // Create a download record
            downloadId = generateId();
            this.downloadQueue.set(downloadId, {
                id: downloadId,
                paperId,
                source,
                status: 'downloading',
                timestamp: Date.now()
            });
            
            // Update the download queue display
            this.updateDownloadQueue();
            
            // Save state
            this.saveState();
            
            // Start download tracking
            const progressTracker = trackProgress(downloadId, {
                elementPrefix: 'pdf-download',
                taskType: 'pdfDownload',
                saveToSessionStorage: false
            });
            
            // Use either direct PDF URL (if available) or academic download endpoint
            let response;
            if (downloadUrl && (downloadUrl.includes('.pdf') || downloadUrl.includes('arxiv.org'))) {
                response = await fetch('/api/download-pdf', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        url: downloadUrl,
                        processFile: true
                    })
                });
            } else {
                response = await fetch(`/api/academic/download/${paperId}?source=${source || 'arxiv'}`);
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Download failed');
            }
            
            const data = await response.json();
            
            // Update download status
            const download = this.downloadQueue.get(downloadId);
            if (download) {
                download.status = 'completed';
                download.filePath = data.file_path;
                download.fileName = data.file_name;
                download.fileSize = data.file_size;
                this.downloadQueue.set(downloadId, download);
            }
            
            // Update the progress tracker
            progressTracker.updateProgress(100, 'Download completed');
            progressTracker.complete(data);
            
            // Update queue display
            this.updateDownloadQueue();
            
            // Save state
            this.saveState();
            
            this.hideLoading();
            showSuccess('Paper downloaded successfully');
            
            return {
                downloadId,
                status: 'completed',
                filePath: data.file_path,
                fileName: data.file_name
            };
        } catch (error) {
            this.hideLoading();
            
            // Update download status to failed
            if (downloadId) {
                const download = this.downloadQueue.get(downloadId);
                if (download) {
                    download.status = 'failed';
                    download.error = error.message;
                    this.downloadQueue.set(downloadId, download);
                    this.updateDownloadQueue();
                    
                    // Save state
                    this.saveState();
                }
            }
            
            showErrorNotification(error, { message: 'Paper download failed' });
            console.error('Download error:', error);
            
            return {
                error: error.message,
                status: 'failed'
            };
        }
    }

    /**
     * Update the download queue UI
     */
    updateDownloadQueue() {
        const container = getElement('academicDownloadQueue');
        if (!container) return;
        
        if (this.downloadQueue.size === 0) {
            container.innerHTML = '';
            return;
        }
        
        let html = `
            <h4>Download Queue</h4>
            <div class="download-queue-list">
        `;
        
        for (const [id, download] of this.downloadQueue.entries()) {
            const statusClass = download.status === 'completed' ? 'text-success' : 
                              (download.status === 'failed' ? 'text-danger' : 'text-info');
            
            html += `
                <div class="download-item">
                    <div class="download-info">
                        <span class="download-id">${download.paperId || id}</span>
                        <span class="download-status ${statusClass}">${download.status}</span>
                    </div>
                    ${download.status === 'completed' ? `
                        <div class="download-actions">
                            <button class="btn btn-sm btn-outline-primary view-file" data-path="${download.filePath}">View</button>
                        </div>
                    ` : ''}
                    ${download.status === 'failed' ? `
                        <div class="download-error">Error: ${download.error}</div>
                    ` : ''}
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners to view buttons
        const viewButtons = container.querySelectorAll('.view-file');
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.viewFile(button.dataset.path);
            });
        });
    }

    /**
     * Load citation data for a paper
     * @param {string} paperId - Paper identifier
     * @param {string} source - Paper source
     * @returns {Promise<Object>} - Citation data
     */
    async loadPaperCitations(paperId, source) {
        if (!paperId) return;
        
        try {
            this.showLoading('Loading citation data...');
            
            // Generate request ID
            const requestId = generateId();
            this.activePaperRequests.set(requestId, { paperId, source, type: 'citations', timestamp: Date.now() });
            
            const response = await fetch(`/api/academic/citations/${paperId}?source=${source || 'arxiv'}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to load citations');
            }
            
            const citationData = await response.json();
            
            // Remove from active requests
            this.activePaperRequests.delete(requestId);
            
            this.hideLoading();
            this.displayCitationData(citationData);
            
            return citationData;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Failed to load citations' });
            console.error('Error loading citations:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display citation data in the UI
     * @param {Object} data - Citation data to display
     */
    displayCitationData(data) {
        const container = getElement('academicCitationsContainer');
        if (!container) return;
        
        if (!data || data.error) {
            container.innerHTML = `<div class="alert alert-warning">Could not load citation data: ${data.error || 'Unknown error'}</div>`;
            return;
        }
        
        let html = `
            <div class="citations-data">
                <h3>Citation Analysis for "${data.paper_title || 'Paper'}"</h3>
                <div class="citation-stats">
                    <p><strong>Total Citations:</strong> ${data.total_citations || 0}</p>
                </div>
        `;
        
        // If we have citation by year data
        if (data.citation_by_year && Object.keys(data.citation_by_year).length > 0) {
            html += '<div class="citation-years"><h4>Citations by Year</h4><ul>';
            
            const years = Object.keys(data.citation_by_year).sort();
            for (const year of years) {
                html += `<li><strong>${year}:</strong> ${data.citation_by_year[year]}</li>`;
            }
            
            html += '</ul></div>';
        }
        
        // If we have top citing authors
        if (data.top_citing_authors && data.top_citing_authors.length > 0) {
            html += '<div class="top-authors"><h4>Top Citing Authors</h4><ol>';
            
            for (const author of data.top_citing_authors) {
                html += `<li>${author.name || ''} (${author.count || 0} citations)</li>`;
            }
            
            html += '</ol></div>';
        }
        
        // If we have citation network data
        if (data.citation_network && data.citation_network.nodes && data.citation_network.nodes.length > 0) {
            html += `
                <div class="citation-network">
                    <h4>Citation Network</h4>
                    <p>Network with ${data.citation_network.nodes.length} nodes and ${data.citation_network.links?.length || 0} connections</p>
                    <div id="network-visualization" class="network-vis-container"></div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // If we have network data and container exists, try to visualize it
        if (data.citation_network && document.getElementById('network-visualization')) {
            this.visualizeNetwork(data.citation_network, 'network-visualization');
        }
        
        // Scroll to citations container
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Visualize a citation network (placeholder for actual visualization)
     * @param {Object} network - Network data with nodes and links
     * @param {string} containerId - ID of the container element
     */
    visualizeNetwork(network, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // In a real implementation, we would integrate a visualization library
        // such as D3.js to render the network
        
        // For now, just show a placeholder message
        container.innerHTML = `
            <div class="alert alert-info">
                <p>Network visualization would go here.</p>
                <p>Network has ${network.nodes.length} nodes and ${network.links?.length || 0} links.</p>
            </div>
        `;
    }

    /**
     * Load paper recommendations
     * @param {string} paperId - Paper identifier
     * @param {string} source - Paper source
     * @returns {Promise<Object>} - Recommendation data
     */
    async loadRecommendations(paperId, source) {
        if (!paperId) return;
        
        try {
            showLoading('Loading recommendations...');
            
            // Generate request ID
            const requestId = generateId();
            this.activePaperRequests.set(requestId, { paperId, source, type: 'recommendations', timestamp: Date.now() });
            
            const response = await fetch(`/api/academic/recommendations/${paperId}?source=${source || 'arxiv'}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to load recommendations');
            }
            
            const data = await response.json();
            
            // Remove from active requests
            this.activePaperRequests.delete(requestId);
            
            this.hideLoading();
            this.displayRecommendations(data);
            
            return data;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Failed to load recommendations' });
            console.error('Error loading recommendations:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display paper recommendations in the UI
     * @param {Object} data - Recommendation data to display
     */
    displayRecommendations(data) {
        const container = getElement('academicResultsContainer');
        if (!container) return;
        
        if (!data || !data.recommendations || data.recommendations.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No related papers found.</div>';
            return;
        }
        
        let html = `
            <h3>Related Papers for "${data.paper_id || 'Paper'}"</h3>
            <div class="papers-list related-papers">
        `;
        
        data.recommendations.forEach(paper => {
            html += `
                <div class="paper-item">
                    <h4>${paper.title || 'Untitled Paper'}</h4>
                    <p class="paper-authors">${this.formatAuthors(paper.authors)}</p>
                    <p class="paper-abstract">${paper.abstract || 'No abstract available'}</p>
                    <p class="similarity-score">Similarity: ${(paper.similarity_score * 100).toFixed(1)}%</p>
                    <div class="paper-actions">
                        <button class="btn btn-sm btn-primary view-paper-details" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}">Details</button>
                        <button class="btn btn-sm btn-success download-paper" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}"
                            data-pdf-url="${paper.pdf_url || ''}">Download PDF</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Scroll to results container
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Extract papers from a URL
     * @param {string} url - URL to extract papers from
     * @returns {Promise<Object>} - Extraction results
     */
    async extractPapersFromUrl(url) {
        if (!url) return;
        
        try {
            showLoading('Extracting papers from URL...');
            
            const response = await fetch(`/api/academic/extract?url=${encodeURIComponent(url)}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Extraction failed');
            }
            
            const data = await response.json();
            
            this.hideLoading();
            this.displayExtractedPapers(data);
            
            return data;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Failed to extract papers' });
            console.error('Extraction error:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display extracted papers in the UI
     * @param {Object} data - Extraction data to display
     */
    displayExtractedPapers(data) {
        const container = getElement('academicResultsContainer');
        if (!container) return;
        
        if (!data.pdfs || data.pdfs.length === 0) {
            container.innerHTML = `<div class="alert alert-info">No PDFs found at URL: ${data.url}</div>`;
            return;
        }
        
        let html = `
            <h3>Extracted Papers (${data.pdfs_found || data.pdfs.length})</h3>
            <p>Source: ${data.url}</p>
            <div class="papers-list extracted-papers">
        `;
        
        data.pdfs.forEach(pdf => {
            html += `
                <div class="paper-item">
                    <h4>${pdf.title || 'Untitled Paper'}</h4>
                    <div class="paper-actions">
                        <button class="btn btn-sm btn-success download-paper" 
                            data-pdf-url="${pdf.url}">Download PDF</button>
                    </div>
                    ${pdf.downloaded ? `
                        <div class="download-info">
                            <span class="text-success">Already downloaded</span>
                            <button class="btn btn-sm btn-outline-primary view-file" data-path="${pdf.file_path}">View</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners
        const downloadButtons = container.querySelectorAll('.download-paper');
        downloadButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.downloadPaper(null, null, button.dataset.pdfUrl);
            });
        });
        
        const viewButtons = container.querySelectorAll('.view-file');
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.viewFile(button.dataset.path);
            });
        });
        
        // Scroll to results container
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * View a file in the browser
     * @param {string} filePath - Path to the file
     */
    viewFile(filePath) {
        if (!filePath) return;
        
        if (filePath.toLowerCase().endsWith('.pdf')) {
            window.open(`/download-pdf/${filePath}`, '_blank');
        } else {
            window.open(`/download-file/${filePath}`, '_blank');
        }
    }

    /**
     * Perform a multi-source search across multiple academic databases
     * @param {string} query - Search query
     * @param {Array} sources - Array of sources to search
     * @returns {Promise<Object>} - Combined search results
     */
    async performMultiSourceSearch(query, sources = ['arxiv', 'semantic', 'openalex']) {
        if (!query || !sources || !Array.isArray(sources) || sources.length === 0) {
            return { error: 'Invalid search parameters' };
        }
        
        try {
            showLoading('Searching multiple academic sources...');
            
            // Generate a unique search ID
            const searchId = generateId();
            this.activeSearches.set(searchId, { 
                query, 
                sources, 
                multi: true, 
                timestamp: Date.now() 
            });
            
            // Construct query parameters
            const sourceParam = sources.join(',');
            const url = `/api/academic/multi-source?query=${encodeURIComponent(query)}&sources=${sourceParam}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Multi-source search failed');
            }
            
            const data = await response.json();
            
            // Store results
            this.searchResults = data.results || [];
            
            // Update state
            setState('academicSearchResults', this.searchResults);
            setState('academicSearch', {
                query,
                sources,
                multi: true,
                timestamp: Date.now()
            });
            
            // Remove from active searches
            this.activeSearches.delete(searchId);
            
            // Hide loading indicator
            this.hideLoading();
            
            // Display results with source distribution information
            this.displayMultiSourceResults(data);
            
            return data;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Multi-source search failed' });
            console.error('Multi-source search error:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display multi-source search results
     * @param {Object} data - Results with source distribution information
     */
    displayMultiSourceResults(data) {
        const container = getElement('academicResultsContainer');
        if (!container) return;
        
        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No results found across selected sources.</div>';
            return;
        }
        
        let html = `
            <h3>Search Results (${data.results.length})</h3>
        `;
        
        // Display source distribution if available
        if (data.source_distribution) {
            html += `<div class="source-distribution"><p>Results by source: `;
            
            const sources = Object.entries(data.source_distribution);
            sources.forEach(([source, count], index) => {
                html += `<span class="badge bg-primary">${source}: ${count}</span>`;
                if (index < sources.length - 1) {
                    html += ' ';
                }
            });
            
            html += `</p></div>`;
        }
        
        html += `<div class="papers-list">`;
        
        data.results.forEach(paper => {
            html += `
                <div class="paper-item">
                    <div class="paper-source-badge">
                        <span class="badge bg-secondary">${paper.source}</span>
                    </div>
                    <h4>${paper.title || 'Untitled Paper'}</h4>
                    <p class="paper-authors">${this.formatAuthors(paper.authors)}</p>
                    <p class="paper-abstract">${paper.abstract || 'No abstract available'}</p>
                    <div class="paper-actions">
                        <button class="btn btn-sm btn-primary view-paper-details" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}">Details</button>
                        <button class="btn btn-sm btn-success download-paper" 
                            data-id="${paper.id}" 
                            data-source="${paper.source}"
                            data-pdf-url="${paper.pdf_url || ''}">Download PDF</button>
                        <button class="btn btn-sm btn-outline-secondary view-citations"
                            data-id="${paper.id}" 
                            data-source="${paper.source}">Citations</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Scroll to results container
        container.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Analyze a paper using the academic API
     * @param {string} paperId - Paper identifier
     * @param {string} source - Paper source
     * @returns {Promise<Object>} - Comprehensive analysis data
     */
    async analyzePaper(paperId, source) {
        if (!paperId) return;
        
        try {
            showLoading('Analyzing paper...');
            
            // Generate a unique analysis ID
            const analysisId = generateId();
            this.activePaperRequests.set(analysisId, { 
                paperId, 
                source, 
                type: 'analysis', 
                timestamp: Date.now() 
            });
            
            const response = await fetch(`/api/academic/analyze/${paperId}?source=${source || 'arxiv'}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Analysis failed');
            }
            
            const analysisData = await response.json();
            
            // Remove from active requests
            this.activePaperRequests.delete(analysisId);
            
            this.hideLoading();
            
            // Display analysis results
            this.displayAnalysisResults(analysisData);
            
            return analysisData;
        } catch (error) {
            this.hideLoading();
            showErrorNotification(error, { message: 'Paper analysis failed' });
            console.error('Analysis error:', error);
            
            return { error: error.message };
        }
    }

    /**
     * Display paper analysis results
     * @param {Object} data - Analysis data to display
     */
    displayAnalysisResults(data) {
        // This would be implemented to show a comprehensive view
        // of the paper including details, citations, and recommendations
        showToast('Paper analysis complete', 'Analysis results are available', 'info');
        
        // Log the analysis data for debugging (remove in production)
        console.log('Paper analysis results:', data);
        
        // In a real implementation, this would update a specific UI container
        // to show the comprehensive analysis results
    }

    /**
     * Cancel active operations
     * @param {string} [operationType] - Optional type of operations to cancel ('search' or 'paper')
     */
    cancelActiveOperations(operationType) {
        if (!operationType || operationType === 'search') {
            // Clear active searches
            this.activeSearches.clear();
        }
        
        if (!operationType || operationType === 'paper') {
            // Clear active paper requests
            this.activePaperRequests.clear();
        }
        
        // Hide loading indicator
        hideLoading();
        
        showToast('Operations cancelled', '', 'warning');
    }

    /**
     * Get active operations status
     * @returns {Object} - Status of active operations
     */
    getActiveOperationsStatus() {
        return {
            searches: Array.from(this.activeSearches.entries()).map(([id, data]) => ({
                id,
                ...data,
                elapsedTime: Date.now() - data.timestamp
            })),
            paperRequests: Array.from(this.activePaperRequests.entries()).map(([id, data]) => ({
                id,
                ...data,
                elapsedTime: Date.now() - data.timestamp
            })),
            downloadQueue: Array.from(this.downloadQueue.entries()).map(([id, data]) => ({
                id,
                ...data,
                elapsedTime: Date.now() - data.timestamp
            }))
        };
    }
}

// Create an instance of AcademicSearch
const academicSearch = new AcademicSearch();

// Export both the instance and the class
export default academicSearch;
export { AcademicSearch };

// Export utility functions from the class instance for external use
export const now = academicSearch.state.now.bind(academicSearch.state);
export const from = academicSearch.state.from.bind(academicSearch.state);