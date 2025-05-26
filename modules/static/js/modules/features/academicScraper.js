/**
 * Academic Scraper Module
 * 
 * Handles academic search, paper discovery, and PDF downloads.
 * Integrates with the Web Scraper for comprehensive document collection.
 * 
 * @module academicScraper
 */

import { showToast, showLoadingSpinner } from '../utils/ui.js';
import { on, emit } from '../utils/socketHandler.js';
import { getState, setState } from '../core/stateManager.js';
import { handleError } from '../core/errorHandler.js';
import { getElement, registerElement } from '../core/uiRegistry.js';
import { formatBytes, formatDuration } from '../utils/utils.js';
import { initialize as initWebScraper } from '../features/webScraper.js';

// Module internal state
const state = {
  initialized: false,
  searchResults: [],
  selectedPapers: [],
  currentQuery: '',
  currentSource: 'all',
  isSearching: false
};

/**
 * Academic Scraper module for paper discovery and PDF downloads
 */
const academicScraper = {
  /**
   * Initialize the academic scraper module
   * @returns {boolean} Success status
   */
  initialize() {
    try {
      console.log("Initializing Academic Scraper module...");
      
      if (state.initialized) {
        console.log("Academic Scraper module already initialized");
        return true;
      }
      
      // Register UI elements
      this.registerUIElements();
      
      // Set up event listeners
      this.registerEvents();
      
      // Mark as initialized
      state.initialized = true;
      console.log("Academic Scraper module initialized successfully");
      
      return true;
    } catch (error) {
      this.handleError(error, "Error initializing Academic Scraper module");
      return false;
    }
  },

  /**
   * Register UI elements with the uiRegistry
   */
  registerUIElements() {
    try {
      // Academic search elements
      registerElement('academic.searchInput', document.getElementById('academic-search-input'));
      registerElement('academic.sources', document.getElementById('academic-sources'));
      registerElement('academic.searchBtn', document.getElementById('academic-search-btn'));
      registerElement('academic.results', document.getElementById('academic-results'));
      registerElement('academic.resultsContainer', document.getElementById('academic-results-container'));
      registerElement('academic.addSelectedBtn', document.getElementById('add-selected-papers'));
      
      // Scraper elements that we need to interface with
      registerElement('scraper.urlsContainer', document.getElementById('scraper-urls-container'));
      registerElement('scraper.pdfInfoSection', document.getElementById('pdf-info-section'));
    } catch (error) {
      this.handleError(error, "Error registering UI elements for Academic Scraper");
    }
  },

  /**
   * Register event listeners
   */
  registerEvents() {
    try {
      // Search button
      const searchBtn = getElement('academic.searchBtn');
      if (searchBtn) {
        searchBtn.addEventListener('click', this.performSearch.bind(this));
      }
      
      // Search input (for enter key)
      const searchInput = getElement('academic.searchInput');
      if (searchInput) {
        searchInput.addEventListener('keypress', event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.performSearch();
          }
        });
      }
      
      // Add selected papers button
      const addSelectedBtn = getElement('academic.addSelectedBtn');
      if (addSelectedBtn) {
        addSelectedBtn.addEventListener('click', this.addSelectedPapers.bind(this));
      }
    } catch (error) {
      this.handleError(error, "Error registering events for Academic Scraper");
    }
  },

  /**
   * Perform academic search
   */
  performSearch() {
    try {
      const searchInput = getElement('academic.searchInput');
      const sourcesSelect = getElement('academic.sources');
      const resultsContainer = getElement('academic.resultsContainer');
      const resultsArea = getElement('academic.results');
      
      if (!searchInput || !sourcesSelect || !resultsContainer) {
        throw new Error("Required UI elements not found");
      }
      
      const query = searchInput.value.trim();
      const source = sourcesSelect.value;
      
      if (!query) {
        showToast('Error', 'Please enter a search query', 'error');
        return;
      }
      
      // Update state
      state.currentQuery = query;
      state.currentSource = source;
      state.isSearching = true;
      
      // Show loading indicator
      resultsArea.classList.remove('d-none');
      resultsContainer.innerHTML = `
        <div class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-2">Searching academic sources...</p>
        </div>
      `;
      
      // Determine API endpoint
      let apiEndpoint;
      let queryParams;
      
      if (source === 'all') {
        apiEndpoint = '/api/academic/multi-source';
        queryParams = new URLSearchParams({
          query: query,
          sources: 'arxiv,semantic,openalex',
          limit: 10
        });
      } else {
        apiEndpoint = '/api/academic/search';
        queryParams = new URLSearchParams({
          query: query,
          source: source,
          limit: 10
        });
      }
      
      // Make the API call
      fetch(`${apiEndpoint}?${queryParams.toString()}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          // Update state
          state.searchResults = data.results || [];
          state.isSearching = false;
          
          // Display results
          this.displaySearchResults(data.results || []);
        })
        .catch(error => {
          state.isSearching = false;
          this.handleError(error, "Error performing academic search");
          
          // Show error in results area
          resultsContainer.innerHTML = `
            <div class="alert alert-danger">
              <i class="fas fa-exclamation-triangle me-2"></i>
              Error: ${error.message}
            </div>
          `;
          
          showToast('Error', `Search failed: ${error.message}`, 'error');
        });
    } catch (error) {
      state.isSearching = false;
      this.handleError(error, "Error performing academic search");
      showToast('Error', `Search failed: ${error.message}`, 'error');
    }
  },

/**
   * Display academic search results
   * @param {Array} results Search results
   */
displaySearchResults(results) {
  try {
    const resultsContainer = getElement('academic.resultsContainer');
    if (!resultsContainer) return;
    
    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle me-2"></i>
          No results found. Try a different search term or source.
        </div>
      `;
      return;
    }
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    // Add each result to the container
    results.forEach((paper, index) => {
      // Create new result item
      const resultItem = document.createElement('div');
      resultItem.className = 'paper-result-item list-group-item list-group-item-action';
      resultItem.dataset.paperId = paper.id;
      resultItem.dataset.paperUrl = paper.pdf_url || paper.url || '';
      resultItem.dataset.paperTitle = paper.title || '';
      
      // Determine source badge
      let sourceBadge = '';
      if (paper.source === 'arxiv') {
        sourceBadge = '<span class="academic-source-badge academic-source-arxiv me-2">arXiv</span>';
      } else if (paper.source === 'semantic') {
        sourceBadge = '<span class="academic-source-badge academic-source-semantic me-2">Semantic Scholar</span>';
      } else if (paper.source === 'openalex') {
        sourceBadge = '<span class="academic-source-badge academic-source-openalex me-2">OpenAlex</span>';
      }
      
      // Format authors list
      const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown authors');
      
      // Build HTML content
      resultItem.innerHTML = `
        <div class="d-flex align-items-start">
          <div class="form-check mt-1 me-2">
            <input class="form-check-input paper-select" type="checkbox" id="paper-${index}">
          </div>
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <h6 class="mb-1">${paper.title || 'Untitled Paper'}</h6>
            </div>
            <div class="mb-1">
              ${sourceBadge}
              <small class="text-muted">${authors}</small>
            </div>
            <p class="mb-1 small">${paper.abstract || 'No abstract available'}</p>
            <div class="mt-2">
              ${paper.pdf_url ? 
                `<span class="badge bg-light text-dark me-2">
                  <i class="fas fa-file-pdf me-1 text-danger"></i> PDF Available
                </span>` : ''}
              <span class="badge bg-light text-dark">
                <i class="fas fa-calendar-alt me-1"></i> ${paper.publication_date || paper.date || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      `;
      
      // Add click handler to toggle selection
      resultItem.addEventListener('click', function(e) {
        // Don't toggle if clicking on the checkbox directly
        if (e.target.type !== 'checkbox') {
          const checkbox = this.querySelector('.paper-select');
          checkbox.checked = !checkbox.checked;
        }
        
        // Toggle selected class
        this.classList.toggle('selected', this.querySelector('.paper-select').checked);
      });
      
      // Add to container
      resultsContainer.appendChild(resultItem);
    });
  } catch (error) {
    this.handleError(error, "Error displaying search results");
  }
},

/**
 * Add selected papers to the URL list
 */
addSelectedPapers() {
  try {
    const resultsContainer = getElement('academic.resultsContainer');
    const urlsContainer = getElement('scraper.urlsContainer');
    const pdfInfoSection = getElement('scraper.pdfInfoSection');
    
    if (!resultsContainer || !urlsContainer) {
      throw new Error("Required UI elements not found");
    }
    
    // Get selected papers
    const selectedCheckboxes = resultsContainer.querySelectorAll('.paper-select:checked');
    
    if (selectedCheckboxes.length === 0) {
      showToast('Warning', 'Please select at least one paper', 'warning');
      return;
    }
    
    // Add each selected paper as a URL entry
    selectedCheckboxes.forEach(checkbox => {
      const paperItem = checkbox.closest('.paper-result-item');
      const paperUrl = paperItem.dataset.paperUrl;
      const paperTitle = paperItem.dataset.paperTitle;
      
      if (paperUrl) {
        // Add the URL to the scraper with PDF setting
        this.addScraperUrlWithData(paperUrl, 'pdf', paperTitle);
      }
    });
    
    // Show confirmation
    showToast('Success', `Added ${selectedCheckboxes.length} papers to scraping list`, 'success');
    
    // Show PDF info section
    if (pdfInfoSection) {
      pdfInfoSection.classList.remove('d-none');
    }
  } catch (error) {
    this.handleError(error, "Error adding selected papers");
    showToast('Error', `Failed to add papers: ${error.message}`, 'error');
  }
},

/**
 * Add a URL to the scraper with specific settings
 * @param {string} url URL to add
 * @param {string} setting Setting to use ('pdf', 'full', etc.)
 * @param {string} title Optional title for tooltip
 */
addScraperUrlWithData(url, setting, title = '') {
  try {
    const urlsContainer = getElement('scraper.urlsContainer');
    if (!urlsContainer) return;
    
    // Create container
    const container = document.createElement('div');
    container.classList.add('input-group', 'mb-2');
    
    // Build HTML
    container.innerHTML = `
      <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" value="${url}" required />
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
    
    // Set the settings dropdown to the specified value
    const settingsSelect = container.querySelector('.scraper-settings');
    settingsSelect.value = setting;
    
    // Add tooltip with paper title if provided
    if (title) {
      const urlInput = container.querySelector('.scraper-url');
      urlInput.setAttribute('title', title);
    }
    
    // Add event listeners
    const removeBtn = container.querySelector('.remove-url');
    removeBtn.addEventListener('click', () => {
      urlsContainer.removeChild(container);
      this.updatePdfInfoSection();
    });
    
    const settings = container.querySelector('.scraper-settings');
    settings.addEventListener('change', this.handleScraperSettingsChange.bind(this));
    
    // Add to container
    urlsContainer.appendChild(container);
    
    // Update PDF info section visibility
    this.updatePdfInfoSection();
  } catch (error) {
    this.handleError(error, "Error adding URL to scraper");
  }
},

/**
 * Handle scraper settings change
 * @param {Event} event Change event
 */
handleScraperSettingsChange(event) {
  try {
    if (!event.target.classList.contains('scraper-settings')) return;
    
    const parentGroup = event.target.closest('.input-group');
    const keywordInput = parentGroup.querySelector('.scraper-keyword');
    
    if (event.target.value === 'keyword') {
      keywordInput.style.display = '';
    } else {
      keywordInput.style.display = 'none';
      keywordInput.value = '';
    }
    
    // Update PDF info section visibility
    this.updatePdfInfoSection();
  } catch (error) {
    this.handleError(error, "Error handling settings change");
  }
},

/**
 * Update PDF info section visibility
 */
updatePdfInfoSection() {
  try {
    const pdfInfoSection = getElement('scraper.pdfInfoSection');
    if (!pdfInfoSection) return;
    
    // Get all settings dropdowns
    const scraperSettings = document.querySelectorAll('.scraper-settings');
    
    // Check if any are set to 'pdf'
    const hasPdfSelected = Array.from(scraperSettings).some(select => select.value === 'pdf');
    
    // Show/hide the section
    if (hasPdfSelected) {
      pdfInfoSection.classList.remove('d-none');
    } else {
      pdfInfoSection.classList.add('d-none');
    }
  } catch (error) {
    this.handleError(error, "Error updating PDF info section");
  }
},

/**
 * Handle error consistently
 * @param {Error} error Error object
 * @param {string} context Error context
 */
handleError(error, context = 'Academic Scraper Error') {
  console.error(`[Academic Scraper] ${context}:`, error);
  
  // Use error handler if available
  if (typeof handleError === 'function') {
    handleError(error, 'ACADEMIC_SCRAPER', false, { context });
  }
  
  // Show error message in UI
  showToast('Error', error.message || 'An unknown error occurred', 'error');
}
};

// Export the module with both default and named exports
export default academicScraper;

// Named exports (bound to the academicScraper object)
export const initialize = academicScraper.initialize.bind(academicScraper);
export const performSearch = academicScraper.performSearch.bind(academicScraper);
export const displaySearchResults = academicScraper.displaySearchResults.bind(academicScraper);
export const addSelectedPapers = academicScraper.addSelectedPapers.bind(academicScraper);
export const addScraperUrlWithData = academicScraper.addScraperUrlWithData.bind(academicScraper);
export const handleScraperSettingsChange = academicScraper.handleScraperSettingsChange.bind(academicScraper);
export const updatePdfInfoSection = academicScraper.updatePdfInfoSection.bind(academicScraper);