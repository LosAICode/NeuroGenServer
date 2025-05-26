/**
 * academicApiClient.js
 * Specialized client for interfacing with academic paper APIs
 * Handles fetching papers, citations, and recommendations
 */

import { showError } from '../core/errorHandler.js';
import { getState, setState } from '../core/stateManager.js';

class AcademicApiClient {
    constructor() {
        this.apiEndpoints = {
            search: '/api/academic/search',
            multiSource: '/api/academic/multi-source',
            details: '/api/academic/details',
            citations: '/api/academic/citations',
            recommendations: '/api/academic/recommendations',
            download: '/api/academic/download',
            extract: '/api/academic/extract',
            analyze: '/api/academic/analyze',
            bulk: '/api/academic/bulk/download',
            health: '/api/academic/health'
        };
        
        this.defaultSource = 'arxiv';
        this.rateLimitDelay = 1000; // Milliseconds between requests
        this.lastRequestTime = 0;
        this.requestQueue = [];
        this.processingQueue = false;
        
        // Cache for paper details
        this.paperCache = new Map();
        this.loadCacheFromStorage();
    }

    /**
     * Search for academic papers
     * @param {string} query - Search query
     * @param {string} source - Source to search (arxiv, semantic, etc.)
     * @param {number} limit - Maximum number of results
     * @returns {Promise<Object>} Search results
     */
    async searchPapers(query, source = this.defaultSource, limit = 10) {
        if (!query) {
            throw new Error('Search query is required');
        }
        
        const url = `${this.apiEndpoints.search}?query=${encodeURIComponent(query)}&source=${source}&limit=${limit}`;
        return this.makeRequest(url);
    }

    /**
     * Search multiple sources simultaneously
     * @param {string} query - Search query
     * @param {string[]} sources - List of sources to search
     * @param {number} limit - Maximum results per source
     * @returns {Promise<Object>} Combined search results
     */
    async searchMultipleSources(query, sources = ['arxiv', 'semantic'], limit = 5) {
        if (!query) {
            throw new Error('Search query is required');
        }
        
        const sourcesParam = sources.join(',');
        const url = `${this.apiEndpoints.multiSource}?query=${encodeURIComponent(query)}&sources=${sourcesParam}&limit=${limit}`;
        return this.makeRequest(url);
    }

    /**
     * Get detailed information about a paper
     * @param {string} paperId - Unique identifier for the paper
     * @param {string} source - Source platform (arxiv, semantic, etc.)
     * @returns {Promise<Object>} Paper details
     */
    async getPaperDetails(paperId, source = this.defaultSource) {
        if (!paperId) {
            throw new Error('Paper ID is required');
        }
        
        // Check cache first
        const cacheKey = `${source}:${paperId}`;
        if (this.paperCache.has(cacheKey)) {
            return this.paperCache.get(cacheKey);
        }
        
        const url = `${this.apiEndpoints.details}/${paperId}?source=${source}`;
        const details = await this.makeRequest(url);
        
        // Cache the result
        if (details && !details.error) {
            this.paperCache.set(cacheKey, details);
            this.saveCacheToStorage();
        }
        
        return details;
    }

    /**
     * Get citation data for a paper
     * @param {string} paperId - Unique identifier for the paper
     * @param {string} source - Source platform
     * @param {number} depth - Depth of citation analysis
     * @returns {Promise<Object>} Citation analysis
     */
    async getPaperCitations(paperId, source = this.defaultSource, depth = 1) {
        if (!paperId) {
            throw new Error('Paper ID is required');
        }
        
        const url = `${this.apiEndpoints.citations}/${paperId}?source=${source}&depth=${depth}`;
        return this.makeRequest(url);
    }

    /**
     * Get recommended papers related to a paper
     * @param {string} paperId - Unique identifier for the paper
     * @param {string} source - Source platform
     * @param {number} limit - Maximum number of recommendations
     * @returns {Promise<Object>} Paper recommendations
     */
    async getRecommendations(paperId, source = this.defaultSource, limit = 5) {
        if (!paperId) {
            throw new Error('Paper ID is required');
        }
        
        const url = `${this.apiEndpoints.recommendations}/${paperId}?source=${source}&limit=${limit}`;
        return this.makeRequest(url);
    }

    /**
     * Download a paper
     * @param {string} paperId - Unique identifier for the paper
     * @param {string} source - Source platform
     * @param {string} filename - Custom filename (optional)
     * @returns {Promise<Object>} Download result
     */
    async downloadPaper(paperId, source = this.defaultSource, filename = '') {
        if (!paperId) {
            throw new Error('Paper ID is required');
        }
        
        const url = `${this.apiEndpoints.download}/${paperId}?source=${source}${filename ? `&filename=${encodeURIComponent(filename)}` : ''}`;
        return this.makeRequest(url);
    }

    /**
     * Download multiple papers in bulk
     * @param {string[]} paperIds - List of paper IDs
     * @param {string} source - Source platform
     * @returns {Promise<Object>} Bulk download result
     */
    async downloadMultiplePapers(paperIds, source = this.defaultSource) {
        if (!paperIds || !paperIds.length) {
            throw new Error('At least one paper ID is required');
        }
        
        return this.makeRequest(this.apiEndpoints.bulk, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paper_ids: paperIds,
                source: source
            })
        });
    }

    /**
     * Extract papers from a URL
     * @param {string} url - URL to extract papers from
     * @param {boolean} download - Whether to download extracted papers
     * @param {string} outputFolder - Folder to save downloads
     * @returns {Promise<Object>} Extraction results
     */
    async extractPapersFromUrl(url, download = false, outputFolder = '') {
        if (!url) {
            throw new Error('URL is required');
        }
        
        const endpoint = `${this.apiEndpoints.extract}?url=${encodeURIComponent(url)}&download=${download}${outputFolder ? `&output_folder=${encodeURIComponent(outputFolder)}` : ''}`;
        return this.makeRequest(endpoint);
    }

    /**
     * Analyze a paper (comprehensive analysis)
     * @param {string} paperId - Unique identifier for the paper
     * @param {string} source - Source platform
     * @returns {Promise<Object>} Comprehensive analysis
     */
    async analyzePaper(paperId, source = this.defaultSource) {
        if (!paperId) {
            throw new Error('Paper ID is required');
        }
        
        const url = `${this.apiEndpoints.analyze}/${paperId}?source=${source}`;
        return this.makeRequest(url);
    }

    /**
     * Check API health status
     * @returns {Promise<Object>} Health status
     */
    async checkHealth() {
        return this.makeRequest(this.apiEndpoints.health);
    }

    /**
     * Convert a DOI to a paper ID for a specific platform
     * @param {string} doi - DOI (Digital Object Identifier)
     * @param {string} targetPlatform - Target platform (arxiv, semantic, etc.)
     * @returns {Promise<string|null>} Platform-specific ID or null if not found
     */
    async convertDoi(doi, targetPlatform = this.defaultSource) {
        if (!doi) {
            throw new Error('DOI is required');
        }
        
        // Search for the paper by DOI
        const results = await this.searchPapers(`doi:${doi}`, targetPlatform);
        
        if (results && results.results && results.results.length > 0) {
            return results.results[0].id;
        }
        
        return null;
    }

    /**
     * Make a rate-limited API request
     * @param {string} url - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} API response
     */
    async makeRequest(url, options = {}) {
        // Add request to queue
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                resolve,
                reject
            });
            
            // Start processing the queue if not already processing
            if (!this.processingQueue) {
                this.processQueue();
            }
        });
    }

    /**
     * Process the request queue with rate limiting
     */
    async processQueue() {
        if (this.requestQueue.length === 0) {
            this.processingQueue = false;
            return;
        }
        
        this.processingQueue = true;
        
        // Get the next request
        const request = this.requestQueue.shift();
        
        // Apply rate limiting
        const now = Date.now();
        const timeToWait = Math.max(0, this.lastRequestTime + this.rateLimitDelay - now);
        
        if (timeToWait > 0) {
            await new Promise(resolve => setTimeout(resolve, timeToWait));
        }
        
        try {
            // Make the request
            const response = await fetch(request.url, request.options);
            
            if (!response.ok) {
                // Try to get error details
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || `HTTP error ${response.status}: ${response.statusText}`);
                } catch (jsonError) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                }
            }
            
            const data = await response.json();
            request.resolve(data);
        } catch (error) {
            request.reject(error);
        }
        
        // Update last request time
        this.lastRequestTime = Date.now();
        
        // Process next request
        setTimeout(() => this.processQueue(), 50);
    }

    /**
     * Load paper cache from localStorage
     */
    loadCacheFromStorage() {
        try {
            const cachedData = localStorage.getItem('academicPaperCache');
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                this.paperCache = new Map(parsed);
            }
        } catch (error) {
            console.error('Failed to load paper cache from storage:', error);
            this.paperCache = new Map();
        }
    }

    /**
     * Save paper cache to localStorage
     */
    saveCacheToStorage() {
        try {
            const cacheData = JSON.stringify([...this.paperCache]);
            localStorage.setItem('academicPaperCache', cacheData);
        } catch (error) {
            console.error('Failed to save paper cache to storage:', error);
        }
    }

    /**
     * Clear the paper cache
     */
    clearCache() {
        this.paperCache.clear();
        localStorage.removeItem('academicPaperCache');
    }
}

const academicApiClient = new AcademicApiClient();

export default academicApiClient;