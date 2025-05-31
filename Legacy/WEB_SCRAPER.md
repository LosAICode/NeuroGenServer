# Enhanced Web Scraper Module - Implementation Plan

## Overview

This document outlines the comprehensive implementation plan for enhancing the NeuroGenServer's Web Scraper module. The enhanced module will provide powerful web crawling capabilities, academic source integration, and advanced PDF processing functionality to extract and structure data for LLM training.

## Current State Analysis (May 28, 2025)

### Existing Implementation
- **Backend**: Basic web scraping endpoints (`/api/scrape2`) with PDF download capability
- **Frontend**: Simple UI with URL input and basic progress tracking
- **Academic Search**: Partial implementation with arXiv support but missing other sources
- **PDF Processing**: Basic download functionality but no Structify integration
- **Missing**: Recursive crawling, unified interface, advanced PDF processing, citation networks

### Architecture Status
- ✅ Flask Blueprint architecture implemented
- ✅ Basic SocketIO event handling
- ❌ No recursive crawling algorithms
- ❌ No unified tabbed interface
- ❌ No PDF selection system with checkboxes
- ❌ Limited academic source integration (only arXiv partially working)
- ❌ No Structify module integration for PDF processing
- ❌ No citation network visualization

## Requirements Analysis

### 1. PDF Source Integration

**Question:** Should the new WebScraper module integrate with general web pages, academic sources, or both?

**Answer:** The module must provide a unified interface that seamlessly integrates both general web scraping and academic source capabilities. 

**Implementation Details:**
- **Unified Interface**: Single cohesive UI with tabs for specialized functionality (Web, Academic, History)
- **Content Discovery**: Intelligent extraction of PDFs from any website with link discovery and classification
- **Academic Integration**: Direct API connections to major academic sources (arXiv, Semantic Scholar, PubMed, IEEE, ACM)
- **Smart Detection**: Content-type recognition to suggest optimal scraping methods
- **Recursive Crawling**: Depth-first and breadth-first site exploration with configurable limits
- **Domain Handling**: Options to stay within original domain or expand to related sites

### 2. PDF Selection UI

**Question:** How should users select PDFs to download?

**Answer:** The interface will provide an intuitive checkbox-based selection system with comprehensive batch operations.

**Implementation Details:**
- **Visual Selection**: Checkbox list with clear visual hierarchy and metadata display
- **Batch Actions**: Prominent "Select All/None" buttons at the top of results list
- **Advanced Filtering**: Multi-faceted filtering by title, author, size, source, and publication date
- **Queue Management**: "Add URLs" button that moves selected documents to the download queue
- **Preview Capabilities**: Lightweight embedded PDF viewer with metadata inspection
- **Drag & Drop**: Support for direct URL list import via drag and drop
- **Keyboard Navigation**: Efficient keyboard shortcuts for power users

### 3. Download Management

**Question:** What features are needed for managing multiple PDF downloads?

**Answer:** The system requires a comprehensive download manager with granular control, robust progress tracking, and sophisticated error handling.

**Implementation Details:**
- **Concurrency Control**: Configurable parallel download limit (default: 10) with unlimited option
- **Progress Tracking**: Individual and aggregated progress indicators with detailed status information
- **Flow Control**: Pause/resume capabilities at both individual and batch levels
- **Error Recovery**: Automatic retry for failed downloads with configurable retry limits and exponential backoff
- **Duplicate Handling**: Smart detection with options to skip, rename, replace, or version duplicates
- **Error Reporting**: Comprehensive error reporting with troubleshooting suggestions
- **Background Processing**: Asynchronous operation to allow continued browsing during downloads
- **Bandwidth Management**: Optional throttling to avoid network congestion

### 4. Academic Search Integration

**Question:** How should academic search be integrated with the web scraper?

**Answer:** Deep integration with multiple academic sources through a unified search interface with advanced filtering and metadata handling.

**Implementation Details:**
- **Unified Search**: Single search interface supporting all integrated academic sources
- **Multi-Source Search**: Ability to search across all sources simultaneously with result normalization
- **Result Integration**: Direct import of search results to download queue with batch operations
- **Metadata Preservation**: Comprehensive extraction and preservation of all available metadata
- **Citation Handling**: Automatic extraction of citations and references with relationship mapping
- **Advanced Filtering**: Sophisticated filtering based on publication date, author, journal, citation count, etc.
- **Visualization**: Citation network visualization for relationship exploration
- **Cross-Referencing**: Automated discovery of related papers and seminal works

### 5. Output Organization

**Question:** How should downloaded PDFs be organized?

**Answer:** PDFs will be organized in a flexible, user-configurable directory structure with robust metadata-based management.

**Implementation Details:**
- **Default Structure**: Organization by search keyword and then by source domain
- **Template Variables**: Support for custom folder structure with variables like `{source}`, `{date}`, `{author}`, etc.
- **Smart Naming**: Automatic file naming based on extracted metadata when available
- **Naming Options**: Configuration to preserve original filenames or use standardized conventions
- **Metadata Storage**: Associated JSON files containing all extracted metadata
- **Collection Management**: Support for creating and managing collections with tagging and categorization
- **Duplicate Detection**: Cross-referencing to avoid redundant downloads across collections

### 6. Processing Options

**Question:** What processing should be applied to downloaded PDFs?

**Answer:** All Structify module capabilities must be fully integrated for comprehensive document processing and data extraction.

**Implementation Details:**
- **Structify Integration**: Complete integration with all Structify module capabilities
- **OCR Processing**: Advanced OCR for scanned documents with multi-language support
- **Table Extraction**: Structured extraction of tables with format preservation
- **Text Extraction**: Full-text extraction with content structure preservation
- **Metadata Extraction**: Comprehensive extraction of document metadata
- **Structural Analysis**: Advanced document segmentation and organization
- **JSON Conversion**: Conversion to structured JSON formats optimized for LLM training
- **Processing Pipeline**: Configurable processing pipeline with prioritization options
- **Batch Processing**: Efficient batch processing with resource management

## Architectural Design

### Core Components

#### 1. WebScraper Class
```javascript
class WebScraper {
  constructor() {
    // Core configuration
    this.config = {
      maxDepth: 3,                // Default crawling depth
      maxPages: 100,              // Maximum pages per domain
      respectRobots: true,        // Respect robots.txt directives
      followRedirects: true,      // Follow HTTP redirects
      javascriptRendering: true,  // Enable JavaScript rendering
      concurrentRequests: 5,      // Parallel request limit
      requestDelay: 500,          // Milliseconds between requests
      timeout: 30000,             // Request timeout (ms)
      retryAttempts: 3            // Failed request retry limit
    };
    
    // PDF processing options
    this.pdfOptions = {
      process_pdfs: true,         // Enable PDF processing
      extract_tables: true,       // Extract tables from PDFs
      use_ocr: true,              // Use OCR for scanned content
      extract_structure: true,    // Extract document structure
      chunk_size: 4096,           // Text chunk size
      max_downloads: 10           // Default concurrent PDF downloads
    };
    
    // State management
    this.activeJobs = new Map();          // Active scraping jobs
    this.downloadQueue = new Map();       // Files queued for download
    this.processingQueue = new Map();     // Files queued for processing
    this.results = new Map();             // Stored results
    
    // Service dependencies
    this.socketManager = SocketManager.getInstance();
    this.academicManager = AcademicSearchManager.getInstance();
    this.pdfProcessor = PdfProcessor.getInstance();
    this.eventBus = EventBus.getInstance();
  }
  
  // Core methods
  async initialize() { /* Implementation */ }
  async startScraping(url, options) { /* Implementation */ }
  async startRecursiveCrawl(url, depth, options) { /* Implementation */ }
  async cancelJob(jobId) { /* Implementation */ }
  async pauseJob(jobId) { /* Implementation */ }
  async resumeJob(jobId) { /* Implementation */ }
  
  // PDF management
  async addPdfToDownloadQueue(url, metadata) { /* Implementation */ }
  async downloadPdf(pdfId) { /* Implementation */ }
  async processPdf(pdfId, options) { /* Implementation */ }
  
  // Academic integration
  async searchAcademic(query, sources) { /* Implementation */ }
  async addAcademicResultsToQueue(results) { /* Implementation */ }
  
  // Utility methods
  _validateUrl(url) { /* Implementation */ }
  _trackProgress(jobId, progress) { /* Implementation */ }
  _handleError(error, context) { /* Implementation */ }
}
```

#### 2. AcademicSearchManager Class
```javascript
class AcademicSearchManager {
  constructor() {
    this.supportedSources = ['arxiv', 'semantic_scholar', 'pubmed', 'ieee', 'acm'];
    this.activeSearches = new Map();
    this.results = new Map();
    this.socketManager = SocketManager.getInstance();
    this.eventBus = EventBus.getInstance();
  }
  
  // Core methods
  async searchSingleSource(query, source, options) { /* Implementation */ }
  async searchAllSources(query, options) { /* Implementation */ }
  async getPaperDetails(paperId, source) { /* Implementation */ }
  async getCitations(paperId, source) { /* Implementation */ }
  
  // Advanced features
  async buildCitationNetwork(paperId, depth) { /* Implementation */ }
  async findRelatedPapers(paperId) { /* Implementation */ }
  async extractPapersFromUrl(url) { /* Implementation */ }
  
  // Utility methods
  _normalizeResults(results, source) { /* Implementation */ }
  _detectPaperType(paper) { /* Implementation */ }
  _extractMetadata(paper) { /* Implementation */ }
}
```

#### 3. PdfProcessor Class
```javascript
class PdfProcessor {
  constructor() {
    this.processingQueue = new PriorityQueue();
    this.activeJobs = new Map();
    this.results = new Map();
    this.socketManager = SocketManager.getInstance();
    this.eventBus = EventBus.getInstance();
    
    this.structifyOptions = {
      process_pdfs: true,
      extract_tables: true,
      use_ocr: true,
      extract_structure: true,
      chunk_size: 4096,
      language: 'auto'
    };
  }
  
  // Core methods
  async processPdf(filePath, options) { /* Implementation */ }
  async extractText(filePath) { /* Implementation */ }
  async extractTables(filePath) { /* Implementation */ }
  async performOcr(filePath, language) { /* Implementation */ }
  
  // Queue management
  async addToQueue(filePath, options, priority) { /* Implementation */ }
  async pauseProcessing(jobId) { /* Implementation */ }
  async resumeProcessing(jobId) { /* Implementation */ }
  async cancelProcessing(jobId) { /* Implementation */ }
  
  // Conversion methods
  async convertToJson(result) { /* Implementation */ }
  async prepareForLlmTraining(result) { /* Implementation */ }
  
  // Utility methods
  _trackProgress(jobId, progress) { /* Implementation */ }
  _handleProcessingError(error, jobId) { /* Implementation */ }
  _optimizeForStructify(options) { /* Implementation */ }
}
```

### API Endpoints

#### Web Scraping Endpoints

```
POST /api/scrape2
- Description: Start a new scraping job
- Parameters:
  - urls: Array of URLs to scrape
  - download_directory: Directory to save results
  - output_filename: Filename for output
  - recursive: Boolean to enable recursive crawling
  - max_depth: Maximum crawling depth
  - max_pages: Maximum pages to crawl
  - respect_robots: Boolean to respect robots.txt
  - pdf_options: Options for PDF processing

GET /api/scrape2/status/{taskId}
- Description: Get status of scraping job
- Parameters:
  - taskId: ID of the task to check

POST /api/scrape2/cancel/{taskId}
- Description: Cancel a scraping job
- Parameters:
  - taskId: ID of the task to cancel

POST /api/scrape2/pause/{taskId}
- Description: Pause a scraping job
- Parameters:
  - taskId: ID of the task to pause

POST /api/scrape2/resume/{taskId}
- Description: Resume a paused scraping job
- Parameters:
  - taskId: ID of the task to resume
```

#### Academic Search Endpoints

```
POST /api/academic-search
- Description: Search academic sources
- Parameters:
  - query: Search query
  - source: Source to search (or 'all')
  - max_results: Maximum results to return
  - filters: Optional filters to apply

GET /api/academic-search/paper/{paperId}
- Description: Get details of a specific paper
- Parameters:
  - paperId: ID of the paper
  - source: Source of the paper

POST /api/academic-search/download
- Description: Download papers from academic search
- Parameters:
  - papers: Array of paper IDs to download
  - output_directory: Directory to save papers
```

#### PDF Processing Endpoints

```
POST /api/pdf/process
- Description: Process PDF files
- Parameters:
  - files: Array of file paths to process
  - options: Processing options
  - output_directory: Directory to save results
  - output_format: Format for processed results

GET /api/pdf/capabilities
- Description: Get PDF processing capabilities
- Returns:
  - supported_languages: Languages supported for OCR
  - extraction_capabilities: Available extraction methods
  - processing_options: Available processing options
```

### Socket Events

#### Scraping Events

```
webScraping:progress
- Data: { taskId, progress, message, stats }

webScraping:pageDiscovered
- Data: { taskId, url, depth, title }

webScraping:pageScraped
- Data: { taskId, url, content_type, size }

webScraping:pdfFound
- Data: { taskId, url, size, title }

webScraping:completed
- Data: { taskId, stats, results_path }

webScraping:error
- Data: { taskId, error, url }
```

#### PDF Processing Events

```
pdfProcessing:progress
- Data: { jobId, progress, message, file }

pdfProcessing:started
- Data: { jobId, file, options }

pdfProcessing:completed
- Data: { jobId, file, results, stats }

pdfProcessing:error
- Data: { jobId, file, error }
```

#### Academic Search Events

```
academicSearch:results
- Data: { searchId, query, results, source }

academicSearch:paperDetails
- Data: { paperId, details, source }

academicSearch:citationNetwork
- Data: { paperId, network, depth }

academicSearch:error
- Data: { searchId, error, query }
```

## Implementation Plan - REVISED

### Phase 0: Critical Missing Components (IMMEDIATE PRIORITY)

#### Task 0.1: Create Core Backend Classes
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create `ScraperTask` class in `blueprints/core/services.py`
- [ ] Create `WebScraper` class with recursive crawling capabilities
- [ ] Implement `AcademicSearchManager` class for multi-source integration
- [ ] Add task management functions (`add_task`, `get_task`, `remove_task`)
- [ ] Implement missing imports in web_scraper.py blueprint

#### Task 0.2: Fix Import Dependencies
**Status**: ❌ CRITICAL ERRORS
- [ ] Import missing modules (os, tempfile, magic, etc.) in web_scraper.py
- [ ] Import ScraperTask and task management functions
- [ ] Import or implement `structured_error_response` function
- [ ] Import or implement `get_output_filepath` function
- [ ] Import or implement `download_pdf` function
- [ ] Import or implement `analyze_pdf_structure` function

#### Task 0.3: Integrate Structify Module
**Status**: ❌ NOT INTEGRATED
- [ ] Import Structify module properly in web scraper blueprint
- [ ] Implement PDF processing with Structify capabilities
- [ ] Add OCR, table extraction, and structure analysis
- [ ] Create JSON conversion pipeline

### Phase 1: Core Architecture Implementation

#### Task 1.1: Implement WebScraper Class with Recursive Crawling
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create recursive crawling algorithms (depth-first and breadth-first)
- [ ] Implement URL discovery and link extraction
- [ ] Add robots.txt compliance checking
- [ ] Implement domain restriction options
- [ ] Add request throttling and rate limiting
- [ ] Create progress tracking for crawling operations

#### Task 1.2: Complete Academic Search Integration
**Status**: ⚠️ PARTIALLY IMPLEMENTED (arXiv only)
- [ ] Implement Semantic Scholar API integration
- [ ] Implement PubMed API integration
- [ ] Implement OpenAlex API integration
- [ ] Create IEEE Xplore integration
- [ ] Create ACM Digital Library integration
- [ ] Implement result normalization across sources
- [ ] Add proper metadata extraction for each source

#### Task 1.3: Build PDF Processing Pipeline
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create `PdfProcessor` class with queue management
- [ ] Implement priority queue for PDF processing
- [ ] Add concurrent processing with worker threads
- [ ] Integrate all Structify capabilities
- [ ] Implement progress tracking per PDF
- [ ] Create LLM-optimized output formatting

### Phase 2: UI/UX Implementation

#### Task 2.1: Create Unified Tabbed Interface
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create tab navigation component (Web, Academic, Downloads, History)
- [ ] Implement tab switching logic in webScraper.js
- [ ] Design responsive tab layout for mobile/desktop
- [ ] Add tab state persistence in localStorage
- [ ] Create smooth transitions between tabs
- [ ] Implement keyboard navigation (Tab, Arrow keys)

#### Task 2.2: Build PDF Selection System
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create checkbox list component for PDF results
- [ ] Implement "Select All/None" buttons with clear positioning
- [ ] Add multi-select keyboard shortcuts (Shift+Click, Ctrl+A)
- [ ] Create filtering UI (by size, date, author, source)
- [ ] Implement sorting options (relevance, date, size)
- [ ] Add visual indicators for selected count
- [ ] Create batch action toolbar

#### Task 2.3: Implement Download Manager UI
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create download queue visualization
- [ ] Implement individual progress bars per PDF
- [ ] Add pause/resume buttons for each download
- [ ] Create retry UI for failed downloads
- [ ] Implement download speed indicators
- [ ] Add estimated time remaining
- [ ] Create download history view

### Phase 3: Backend Enhancement

#### Task 3.1: Create New API Endpoints
**Status**: ⚠️ PARTIALLY IMPLEMENTED
- [ ] Create `/api/crawl` endpoint for recursive website crawling
- [ ] Create `/api/scrape2/pause/<task_id>` endpoint
- [ ] Create `/api/scrape2/resume/<task_id>` endpoint
- [ ] Create `/api/pdf/batch-process` endpoint
- [ ] Create `/api/scrape2/queue-status` endpoint
- [ ] Enhance `/api/scrape2/status/<task_id>` with detailed progress

#### Task 3.2: Implement Complete Socket.IO Events
**Status**: ⚠️ BASIC IMPLEMENTATION ONLY
- [ ] Implement `webScraping:pageDiscovered` event
- [ ] Implement `webScraping:pageScraped` event
- [ ] Implement `webScraping:pdfFound` event
- [ ] Implement `pdfProcessing:started` event
- [ ] Implement `pdfProcessing:progress` event
- [ ] Add detailed stats in all events

#### Task 3.3: Performance & Reliability
**Status**: ❌ NOT IMPLEMENTED
- [ ] Implement request rate limiting per domain
- [ ] Add exponential backoff for retries
- [ ] Create HTTP connection pooling
- [ ] Implement Redis caching for URLs and results
- [ ] Add memory monitoring and cleanup
- [ ] Implement task queue with Celery or similar

### Phase 4: Advanced Features

#### Task 4.1: Recursive Crawling Implementation
**Status**: ❌ NOT IMPLEMENTED
- [ ] Implement URL extraction from HTML pages
- [ ] Create URL normalization and deduplication
- [ ] Build crawl frontier management
- [ ] Implement robots.txt parser and checker
- [ ] Add sitemap.xml support
- [ ] Create content-type filtering
- [ ] Implement crawl depth tracking
- [ ] Add domain boundary enforcement

#### Task 4.2: Academic Search Enhancement
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create citation graph data structure
- [ ] Implement D3.js visualization for citation networks
- [ ] Build co-author network analysis
- [ ] Implement semantic similarity for recommendations
- [ ] Add journal impact factor integration
- [ ] Create publication trend analysis
- [ ] Implement author h-index calculation

#### Task 4.3: Advanced PDF Processing
**Status**: ❌ NOT IMPLEMENTED
- [ ] Integrate Tesseract for multi-language OCR
- [ ] Implement table detection with Camelot/Tabula
- [ ] Add figure extraction with OpenCV
- [ ] Create heading hierarchy detection
- [ ] Implement reference parsing with GROBID
- [ ] Add mathematical formula extraction
- [ ] Create PDF/A compliance checking

### Phase 5: Testing and Deployment

#### Task 5.1: Unit & Integration Testing
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create pytest test suite for all backend functions
- [ ] Implement Jest tests for frontend modules
- [ ] Add integration tests for API endpoints
- [ ] Create E2E tests with Playwright/Selenium
- [ ] Implement mock services for external APIs
- [ ] Add performance benchmarks

#### Task 5.2: User Acceptance Testing
**Status**: ❌ NOT IMPLEMENTED
- [ ] Create test scenarios for all user workflows
- [ ] Test with various website types (news, blogs, academic)
- [ ] Validate PDF processing with different document types
- [ ] Test academic search across all sources
- [ ] Verify progress tracking accuracy
- [ ] Test error recovery mechanisms

#### Task 5.3: Production Readiness
**Status**: ❌ NOT IMPLEMENTED
- [ ] Add comprehensive logging with rotation
- [ ] Implement monitoring with Prometheus/Grafana
- [ ] Create deployment scripts
- [ ] Add rate limiting per API key
- [ ] Implement backup/restore for downloads
- [ ] Create user documentation

## Priority Implementation Roadmap

### 🔴 CRITICAL - Week 1 (Fix Breaking Issues)
1. **Fix Backend Import Errors**
   - [ ] Add all missing imports to web_scraper.py
   - [ ] Create ScraperTask class
   - [ ] Implement task management system
   - [ ] Add error response utilities

2. **Create Core WebScraper Class**
   - [ ] Basic URL fetching functionality
   - [ ] HTML parsing with BeautifulSoup
   - [ ] PDF link extraction
   - [ ] Progress tracking integration

3. **Integrate Structify Module**
   - [ ] Import and configure Structify
   - [ ] Basic PDF processing endpoint
   - [ ] OCR capability testing

### 🟡 HIGH PRIORITY - Week 2 (Core Features)
1. **Implement Recursive Crawling**
   - [ ] URL discovery and normalization
   - [ ] Depth management
   - [ ] Domain restrictions
   - [ ] Basic robots.txt compliance

2. **Complete Academic Search**
   - [ ] Semantic Scholar API
   - [ ] PubMed integration
   - [ ] Result normalization

3. **Build PDF Selection UI**
   - [ ] Checkbox list component
   - [ ] Select all/none functionality
   - [ ] Basic filtering

### 🟢 MEDIUM PRIORITY - Week 3 (Enhanced Features)
1. **Create Tabbed Interface**
   - [ ] Tab navigation component
   - [ ] State management
   - [ ] Responsive design

2. **Download Manager**
   - [ ] Queue visualization
   - [ ] Individual progress bars
   - [ ] Pause/resume functionality

3. **Advanced PDF Processing**
   - [ ] Table extraction
   - [ ] Multi-language OCR
   - [ ] Structure analysis

### 🔵 LOW PRIORITY - Week 4+ (Polish & Advanced)
1. **Citation Networks**
   - [ ] D3.js visualization
   - [ ] Graph algorithms
   - [ ] Interactive exploration

2. **Performance Optimization**
   - [ ] Caching layer
   - [ ] Connection pooling
   - [ ] Background tasks

3. **Testing & Documentation**
   - [ ] Automated tests
   - [ ] User documentation
   - [ ] API documentation

## Technical Considerations

### Performance Optimization
- Implement progressive loading for large result sets
- Use WebWorkers for background processing where appropriate
- Implement request throttling and rate limiting
- Optimize memory usage with efficient data structures
- Use connection pooling for HTTP requests

### Security Considerations
- Implement proper input validation for all user inputs
- Use rate limiting to prevent abuse
- Validate and sanitize all URLs before processing
- Implement proper error handling to avoid information leakage
- Follow robots.txt directives by default

### Scalability
- Design for horizontal scalability with stateless components
- Implement efficient queue management for download and processing tasks
- Use database storage for persistent state rather than memory
- Implement caching for frequently accessed resources
- Design for potential distributed processing in the future

## Implementation Summary

### Current Gaps Analysis
Based on the code review, the Web Scraper module is **approximately 25% implemented**:
- ✅ Basic web scraping endpoint exists
- ✅ Simple PDF download functionality
- ✅ Partial arXiv integration
- ❌ No recursive crawling capability
- ❌ No unified UI interface
- ❌ No Structify integration
- ❌ Missing core classes (ScraperTask, WebScraper, AcademicSearchManager)
- ❌ Limited academic source support
- ❌ No advanced PDF processing

### Critical Path to Full Implementation
1. **Week 1**: Fix breaking issues and create core infrastructure
2. **Week 2**: Implement recursive crawling and complete academic search
3. **Week 3**: Build unified UI and advanced PDF processing
4. **Week 4+**: Add visualization, optimization, and testing

### Key Success Metrics
- All web scraper endpoints functional without import errors
- Recursive crawling depth of at least 3 levels
- Support for 5+ academic sources (arXiv, Semantic Scholar, PubMed, etc.)
- PDF processing with OCR, table extraction, and structure analysis
- Concurrent download handling for 10+ PDFs
- Real-time progress tracking via SocketIO
- Citation network visualization with D3.js

### Estimated Timeline
- **Minimum Viable Product (MVP)**: 2 weeks
- **Full Feature Set**: 4 weeks
- **Production Ready**: 6 weeks

By following this implementation plan, the NeuroGen Web Scraper will evolve from a basic tool into a comprehensive platform for intelligent web content extraction, academic paper discovery, and advanced PDF processing optimized for LLM training data preparation.
