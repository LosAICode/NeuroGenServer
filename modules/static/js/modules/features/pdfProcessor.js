/**
 * PDF Processor Module
 * 
 * Handles PDF file processing, extraction, and analysis.
 * Provides features for text extraction, table detection, and structure analysis.
 * 
 * Features:
 * - PDF text extraction with page information
 * - Table detection and parsing
 * - Document structure analysis
 * - Document type classification
 * - Memory-efficient processing for large PDFs
 * - Optical Character Recognition (OCR) for scanned documents
 */

import uiRegistry from '../core/uiRegistry.js';
import errorHandler from '../core/errorHandler.js';
import eventRegistry from '../core/eventRegistry.js';
import stateManager from '../core/stateManager.js';
import utils from '../utils/utils.js';
import fileHandler from '../utils/fileHandler.js';
import progressHandler from '../utils/progressHandler.js';

/**
 * PDF Processor for handling PDF file operations
 */
const pdfProcessor = {
  // Module state
  initialized: false,
  isProcessing: false,
  currentFile: null,
  processingMode: 'normal', // 'normal', 'memory-efficient', 'ocr'
  
  // Processing options
  config: {
    chunkSize: 4096,
    allowOcr: true,
    extractTables: true,
    extractImages: false,
    maxPagesToProcess: 1000,  // Safeguard for extremely large docs
    useWorkers: true,
    debug: false
  },
  
  // Text extraction settings
  extractionSettings: {
    preserveFormatting: true,
    includeHyphenation: false,
    normalizeSpaces: true,
    includePunctuations: true,
    includeLineBreaks: true
  },
  
  /**
   * Initialize the PDF processor
   * @param {Object} options - Configuration options
   * @returns {boolean} - Success state
   */
  initialize(options = {}) {
    try {
      // Don't initialize twice
      if (this.initialized) {
        console.log("PDF processor already initialized");
        return true;
      }
      
      console.log("Initializing PDF processor...");
      
      // Merge configuration options
      this.config = {
        ...this.config,
        ...options
      };
      
      // Check for developer mode
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        this.config.debug = true;
      }
      
      // Register events for PDF processing
      this.registerEvents();
      
      this.initialized = true;
      console.log("PDF processor initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing PDF processor:", error);
      errorHandler.handleError(error, 'PDF_PROCESSOR');
      return false;
    }
  },
  
  /**
   * Register events for PDF processing
   */
  registerEvents() {
    // Register for file processor events that involve PDFs
    eventRegistry.on('file.selected', (data) => {
      if (data.files && data.files.length > 0) {
        const pdfFiles = Array.from(data.files).filter(file => 
          file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );
        
        if (pdfFiles.length > 0) {
          // Store information about selected PDF files
          this.updateSelectedPdfInfo(pdfFiles);
        }
      }
    });
    
    // Register for PDF extraction button clicks
    eventRegistry.registerEvent('pdfProcessor.extractText', {
      selector: '#extract-pdf-text-btn',
      type: 'click',
      callback: (event) => {
        const fileInput = document.getElementById('pdf-file-input');
        if (fileInput && fileInput.files.length > 0) {
          this.processFiles(Array.from(fileInput.files));
        } else {
          // Show error using UI module
          this.showError('No PDF file selected', 'Please select a PDF file to extract text from.');
        }
      }
    });
    
    console.log("PDF processor events registered");
  },
  
  /**
   * Update information about selected PDF files
   * @param {Array<File>} pdfFiles - Array of selected PDF files
   */
  updateSelectedPdfInfo(pdfFiles) {
    try {
      // Update state manager with selected PDF info
      if (stateManager && typeof stateManager.setState === 'function') {
        stateManager.setState('selectedPdfFiles', pdfFiles.map(file => ({
          name: file.name,
          size: file.size,
          lastModified: new Date(file.lastModified).toISOString()
        })));
      }
      
      // Update UI if PDF info container exists
      const pdfInfoContainer = uiRegistry.getElement('pdfTab.fileInfo') || 
                               document.getElementById('pdf-file-info');
      
      if (pdfInfoContainer) {
        const fileCount = pdfFiles.length;
        const totalSize = pdfFiles.reduce((total, file) => total + file.size, 0);
        
        pdfInfoContainer.innerHTML = `
          <div class="alert alert-info">
            <strong>${fileCount} PDF file${fileCount !== 1 ? 's' : ''} selected</strong>
            <br>
            Total size: ${utils.formatBytes(totalSize)}
          </div>
          <ul class="list-group mt-2">
            ${pdfFiles.map(file => `
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>${file.name}</span>
                <span class="badge bg-primary rounded-pill">${utils.formatBytes(file.size)}</span>
              </li>
            `).join('')}
          </ul>
        `;
      }
    } catch (error) {
      console.error("Error updating PDF info:", error);
      errorHandler.handleError(error, 'PDF_PROCESSOR');
    }
  },
  
  /**
   * Process PDF files for text extraction
   * @param {Array<File>} files - Array of PDF files to process
   * @returns {Promise<Object>} - Processing results
   */
  async processFiles(files) {
    if (this.isProcessing) {
      console.warn("PDF processing already in progress");
      return { success: false, error: "Processing already in progress" };
    }
    
    try {
      this.isProcessing = true;
      
      // Filter to include only PDF files
      const pdfFiles = files.filter(file => 
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      );
      
      if (pdfFiles.length === 0) {
        throw new Error("No PDF files to process");
      }
      
      // Show processing UI
      this.showProcessingUI();
      
      // Emit processing started event
      eventRegistry.emit('pdf.processing.started', {
        files: pdfFiles.map(f => f.name),
        count: pdfFiles.length,
        timestamp: new Date().toISOString()
      });
      
      // Process each PDF file sequentially
      const results = [];
      
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        this.currentFile = file;
        
        // Update progress
        this.updateProgress((i / pdfFiles.length) * 100, `Processing ${file.name} (${i+1}/${pdfFiles.length})...`);
        
        // Determine processing mode based on file size
        this.determineProcessingMode(file);
        
        // Extract text from the PDF
        const result = await this.extractTextFromPdf(file);
        
        // Process result
        if (result.success) {
          results.push({
            fileName: file.name,
            data: result.data,
            tables: result.tables || [],
            images: result.images || [],
            structure: result.structure || null
          });
          
          // Update progress with success
          this.updateProgress(
            ((i + 1) / pdfFiles.length) * 100, 
            `Successfully processed ${file.name} (${i+1}/${pdfFiles.length})`
          );
        } else {
          // Handle failed processing
          results.push({
            fileName: file.name,
            error: result.error || "Unknown error during processing",
            success: false
          });
          
          // Update progress with error
          this.updateProgress(
            ((i + 1) / pdfFiles.length) * 100, 
            `Error processing ${file.name} (${i+1}/${pdfFiles.length})`
          );
          
          // Log the error
          console.error(`Error processing PDF file ${file.name}:`, result.error);
          errorHandler.handleError(new Error(result.error), 'PDF_PROCESSOR', false);
        }
      }
      
      // Show results UI
      this.showResultsUI(results);
      
      // Emit processing completed event
      eventRegistry.emit('pdf.processing.completed', {
        results,
        count: results.length,
        successCount: results.filter(r => !r.error).length,
        errorCount: results.filter(r => r.error).length,
        timestamp: new Date().toISOString()
      });
      
      // Reset processing state
      this.isProcessing = false;
      this.currentFile = null;
      
      return {
        success: true,
        results
      };
    } catch (error) {
      console.error("Error processing PDF files:", error);
      errorHandler.handleError(error, 'PDF_PROCESSOR');
      
      // Show error UI
      this.showErrorUI(error.message || "Failed to process PDF files");
      
      // Emit processing error event
      eventRegistry.emit('pdf.processing.error', {
        error: error.message || "Unknown error",
        timestamp: new Date().toISOString()
      });
      
      // Reset processing state
      this.isProcessing = false;
      this.currentFile = null;
      
      return {
        success: false,
        error: error.message || "Unknown error"
      };
    }
  },
  
  /**
   * Determine the appropriate processing mode based on file size
   * @param {File} file - The PDF file to analyze
   */
  determineProcessingMode(file) {
    const fileSizeInMB = file.size / (1024 * 1024);
    
    if (fileSizeInMB > 100) {
      // Use memory efficient mode for very large files
      this.processingMode = 'memory-efficient';
      console.log(`Using memory efficient mode for large file (${fileSizeInMB.toFixed(2)} MB)`);
    } else if (fileSizeInMB > 20) {
      // Use normal mode with reduced chunk size for large files
      this.processingMode = 'normal';
      this.config.chunkSize = 2048; // Reduced chunk size
      console.log(`Using normal mode with reduced chunk size for file (${fileSizeInMB.toFixed(2)} MB)`);
    } else {
      // Use normal mode for regular files
      this.processingMode = 'normal';
      this.config.chunkSize = 4096; // Standard chunk size
      console.log(`Using normal mode for file (${fileSizeInMB.toFixed(2)} MB)`);
    }
  },
  
  /**
   * Extract text from a PDF file
   * @param {File} file - The PDF file to process
   * @returns {Promise<Object>} - Extraction results
   */
  async extractTextFromPdf(file) {
    try {
      // Convert the file to an ArrayBuffer for processing
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // Use the appropriate processing method based on mode
      if (this.processingMode === 'memory-efficient') {
        return await this.memoryEfficientProcessing(arrayBuffer, file.name);
      } else {
        return await this.standardProcessing(arrayBuffer, file.name);
      }
    } catch (error) {
      console.error(`Error extracting text from PDF ${file.name}:`, error);
      return {
        success: false,
        error: error.message || "Failed to extract text from PDF"
      };
    }
  },
  
  /**
   * Read a file as ArrayBuffer
   * @param {File} file - The file to read
   * @returns {Promise<ArrayBuffer>} - File contents as ArrayBuffer
   */
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      
      reader.onerror = (error) => {
        reject(new Error(`Error reading file: ${error.message}`));
      };
      
      reader.readAsArrayBuffer(file);
    });
  },
  
  /**
   * Standard PDF processing method
   * @param {ArrayBuffer} arrayBuffer - The PDF file content
   * @param {string} fileName - The name of the file
   * @returns {Promise<Object>} - Processing results
   */
  async standardProcessing(arrayBuffer, fileName) {
    try {
      // This implementation would use the PDF.js library to process the PDF
      // For demonstration, we'll simulate the processing
      
      // In a real implementation, this would use PDF.js to load and process the document
      console.log(`Standard processing of ${fileName} started`);
      
      // Simulate API call to backend for PDF processing
      const formData = new FormData();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      
      // Extraction settings
      formData.append('extractTables', this.config.extractTables);
      formData.append('extractImages', this.config.extractImages);
      formData.append('preserveFormatting', this.extractionSettings.preserveFormatting);
      
      // Make request to backend API
      const response = await fetch('/api/process-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Process results and structure data
      const processedData = this.processExtractionResults(result);
      
      return {
        success: true,
        data: processedData,
        tables: result.tables || [],
        images: result.images || [],
        structure: result.structure || null
      };
    } catch (error) {
      console.error(`Error in standard PDF processing for ${fileName}:`, error);
      return {
        success: false,
        error: error.message || "PDF processing failed"
      };
    }
  },
  
  /**
   * Memory-efficient PDF processing method for large files
   * @param {ArrayBuffer} arrayBuffer - The PDF file content
   * @param {string} fileName - The name of the file
   * @returns {Promise<Object>} - Processing results
   */
  async memoryEfficientProcessing(arrayBuffer, fileName) {
    try {
      console.log(`Memory-efficient processing of ${fileName} started`);
      
      // In a real implementation, this would process the PDF in chunks
      // Here we'll simulate by making an API call with a memory_efficient flag
      
      const formData = new FormData();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      formData.append('mode', 'memory_efficient');
      formData.append('chunkSize', this.config.chunkSize);
      
      // Make request to backend API
      const response = await fetch('/api/process-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Process results
      const processedData = this.processExtractionResults(result);
      
      return {
        success: true,
        data: processedData,
        tables: result.tables || [],
        structure: result.structure || null
      };
    } catch (error) {
      console.error(`Error in memory-efficient PDF processing for ${fileName}:`, error);
      return {
        success: false,
        error: error.message || "PDF processing failed"
      };
    }
  },
  
  /**
   * Process extraction results into a structured format
   * @param {Object} result - Raw extraction results
   * @returns {Object} - Processed data
   */
  processExtractionResults(result) {
    try {
      // Process raw extraction results into a structured format
      const processedData = {
        title: result.metadata?.title || "Untitled Document",
        authors: result.metadata?.author || "Unknown Author",
        creationDate: result.metadata?.creationDate || null,
        pages: result.pageCount || 0,
        text: result.fullText || "",
        byPage: result.pages || [],
        metadata: result.metadata || {},
        keywords: result.keywords || [],
        language: result.language || "unknown"
      };
      
      return processedData;
    } catch (error) {
      console.error("Error processing extraction results:", error);
      return {
        title: "Error Processing Document",
        text: "An error occurred while processing the extraction results."
      };
    }
  },
  
  /**
   * Update progress during PDF processing
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} message - Progress message
   */
  updateProgress(percent, message) {
    try {
      // Update progress using progress handler if available
      if (progressHandler && typeof progressHandler.updateProgress === 'function') {
        progressHandler.updateProgress(percent, message);
      } else {
        // Fallback to direct DOM manipulation
        const progressBar = uiRegistry.getElement('pdfTab.progressBar') || 
                            document.getElementById('pdf-progress-bar');
        const progressText = uiRegistry.getElement('pdfTab.progressText') || 
                             document.getElementById('pdf-progress-text');
        
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
          progressBar.setAttribute('aria-valuenow', Math.round(percent));
        }
        
        if (progressText) {
          progressText.textContent = message;
        }
      }
      
      // Emit progress event
      eventRegistry.emit('pdf.processing.progress', {
        percent,
        message,
        file: this.currentFile?.name,
        mode: this.processingMode,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating progress:", error);
    }
  },
  
  /**
   * Show processing UI during PDF extraction
   */
  showProcessingUI() {
    try {
      // Hide form container and show progress container
      const formContainer = uiRegistry.getElement('pdfTab.formContainer') || 
                            document.getElementById('pdf-form-container');
      const progressContainer = uiRegistry.getElement('pdfTab.progressContainer') || 
                                document.getElementById('pdf-progress-container');
      const resultsContainer = uiRegistry.getElement('pdfTab.resultsContainer') || 
                               document.getElementById('pdf-results-container');
      const errorContainer = uiRegistry.getElement('pdfTab.errorContainer') || 
                             document.getElementById('pdf-error-container');
      
      if (formContainer) formContainer.classList.add('d-none');
      if (progressContainer) progressContainer.classList.remove('d-none');
      if (resultsContainer) resultsContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      
      // Reset progress bar
      const progressBar = uiRegistry.getElement('pdfTab.progressBar') || 
                          document.getElementById('pdf-progress-bar');
      const progressText = uiRegistry.getElement('pdfTab.progressText') || 
                           document.getElementById('pdf-progress-text');
      
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.setAttribute('aria-valuenow', '0');
      }
      
      if (progressText) {
        progressText.textContent = 'Preparing to process PDF...';
      }
    } catch (error) {
      console.error("Error showing processing UI:", error);
    }
  },
  
  /**
   * Show results UI after PDF extraction
   * @param {Array<Object>} results - Processing results
   */
  showResultsUI(results) {
    try {
      // Hide progress container and show results container
      const progressContainer = uiRegistry.getElement('pdfTab.progressContainer') || 
                                document.getElementById('pdf-progress-container');
      const resultsContainer = uiRegistry.getElement('pdfTab.resultsContainer') || 
                               document.getElementById('pdf-results-container');
      
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultsContainer) resultsContainer.classList.remove('d-none');
      
      // Display results
      const resultsContent = uiRegistry.getElement('pdfTab.resultsContent') || 
                             document.getElementById('pdf-results-content');
      
      if (resultsContent) {
        const successCount = results.filter(r => !r.error).length;
        const totalCount = results.length;
        
        let html = `
          <div class="alert alert-${successCount === totalCount ? 'success' : 'info'}">
            <h5>Processing Complete</h5>
            <p>Successfully processed ${successCount} of ${totalCount} PDF files.</p>
          </div>
        `;
        
        // Add results for each file
        html += '<div class="list-group mt-3">';
        
        results.forEach(result => {
          if (result.error) {
            // Error result
            html += `
              <div class="list-group-item list-group-item-danger">
                <div class="d-flex w-100 justify-content-between">
                  <h5 class="mb-1">${result.fileName}</h5>
                  <span class="badge bg-danger">Error</span>
                </div>
                <p class="mb-1">${result.error}</p>
              </div>
            `;
          } else {
            // Success result
            html += `
              <div class="list-group-item list-group-item-success">
                <div class="d-flex w-100 justify-content-between">
                  <h5 class="mb-1">${result.fileName}</h5>
                  <span class="badge bg-success">Success</span>
                </div>
                <p class="mb-1">
                  <strong>Title:</strong> ${result.data.title}<br>
                  <strong>Pages:</strong> ${result.data.pages}<br>
                  <strong>Tables:</strong> ${result.tables.length}<br>
                </p>
                <div class="d-flex justify-content-end">
                  <button class="btn btn-sm btn-outline-primary me-2 view-pdf-result" 
                          data-index="${results.indexOf(result)}">
                    View Details
                  </button>
                  <button class="btn btn-sm btn-outline-secondary copy-pdf-text" 
                          data-index="${results.indexOf(result)}">
                    Copy Text
                  </button>
                </div>
              </div>
            `;
          }
        });
        
        html += '</div>';
        
        // Add a new task button
        html += `
          <div class="mt-3">
            <button id="pdf-new-task-btn" class="btn btn-primary">
              Process Another PDF
            </button>
          </div>
        `;
        
        resultsContent.innerHTML = html;
        
        // Add event listeners for buttons
        const viewButtons = resultsContent.querySelectorAll('.view-pdf-result');
        const copyButtons = resultsContent.querySelectorAll('.copy-pdf-text');
        const newTaskButton = resultsContent.querySelector('#pdf-new-task-btn');
        
        viewButtons.forEach(button => {
          button.addEventListener('click', (event) => {
            const index = parseInt(event.currentTarget.getAttribute('data-index'));
            this.showPdfResultDetails(results[index]);
          });
        });
        
        copyButtons.forEach(button => {
          button.addEventListener('click', (event) => {
            const index = parseInt(event.currentTarget.getAttribute('data-index'));
            this.copyPdfText(results[index]);
          });
        });
        
        if (newTaskButton) {
          newTaskButton.addEventListener('click', () => {
            this.resetToForm();
          });
        }
      }
    } catch (error) {
      console.error("Error showing results UI:", error);
      errorHandler.handleError(error, 'PDF_PROCESSOR');
    }
  },
  
  /**
   * Show error UI when PDF processing fails
   * @param {string} errorMessage - Error message to display
   */
  showErrorUI(errorMessage) {
    try {
      // Hide other containers and show error container
      const formContainer = uiRegistry.getElement('pdfTab.formContainer') || 
                            document.getElementById('pdf-form-container');
      const progressContainer = uiRegistry.getElement('pdfTab.progressContainer') || 
                                document.getElementById('pdf-progress-container');
      const resultsContainer = uiRegistry.getElement('pdfTab.resultsContainer') || 
                               document.getElementById('pdf-results-container');
      const errorContainer = uiRegistry.getElement('pdfTab.errorContainer') || 
                             document.getElementById('pdf-error-container');
      
      if (formContainer) formContainer.classList.add('d-none');
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultsContainer) resultsContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.remove('d-none');
      
      // Display error message
      const errorText = uiRegistry.getElement('pdfTab.errorText') || 
                        document.getElementById('pdf-error-text');
      
      if (errorText) {
        errorText.textContent = errorMessage;
      }
      
      // Set up retry button
      const retryButton = uiRegistry.getElement('pdfTab.retryButton') || 
                          document.getElementById('pdf-retry-button');
      
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          this.resetToForm();
        });
      }
    } catch (error) {
      console.error("Error showing error UI:", error);
      // Last resort fallback
      alert(`Error processing PDF: ${errorMessage}`);
    }
  },
  
  /**
   * Reset UI to the form view
   */
  resetToForm() {
    try {
      // Hide other containers and show form container
      const formContainer = uiRegistry.getElement('pdfTab.formContainer') || 
                            document.getElementById('pdf-form-container');
      const progressContainer = uiRegistry.getElement('pdfTab.progressContainer') || 
                                document.getElementById('pdf-progress-container');
      const resultsContainer = uiRegistry.getElement('pdfTab.resultsContainer') || 
                               document.getElementById('pdf-results-container');
      const errorContainer = uiRegistry.getElement('pdfTab.errorContainer') || 
                             document.getElementById('pdf-error-container');
      
      if (formContainer) formContainer.classList.remove('d-none');
      if (progressContainer) progressContainer.classList.add('d-none');
      if (resultsContainer) resultsContainer.classList.add('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      
      // Reset file input
      const fileInput = document.getElementById('pdf-file-input');
      if (fileInput) {
        fileInput.value = '';
      }
      
      // Reset file info container
      const pdfInfoContainer = uiRegistry.getElement('pdfTab.fileInfo') || 
                               document.getElementById('pdf-file-info');
      
      if (pdfInfoContainer) {
        pdfInfoContainer.innerHTML = '<div class="alert alert-info">No PDF file selected</div>';
      }
      
      // Reset processing state
      this.isProcessing = false;
      this.currentFile = null;
    } catch (error) {
      console.error("Error resetting to form:", error);
    }
  },
  
  /**
   * Show detailed view of a PDF processing result
   * @param {Object} result - The processing result to display
   */
  showPdfResultDetails(result) {
    try {
      // Create a modal to show the details
      const modalHtml = `
        <div class="modal fade" id="pdfResultModal" tabindex="-1" aria-labelledby="pdfResultModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="pdfResultModalLabel">${result.fileName}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <ul class="nav nav-tabs" id="pdfResultTabs" role="tablist">
                  <li class="nav-item" role="presentation">
                    <button class="nav-link active" id="pdf-text-tab" data-bs-toggle="tab" 
                            data-bs-target="#pdf-text-content" type="button" role="tab" 
                            aria-controls="pdf-text-content" aria-selected="true">Text</button>
                  </li>
                  <li class="nav-item" role="presentation">
                    <button class="nav-link" id="pdf-meta-tab" data-bs-toggle="tab" 
                            data-bs-target="#pdf-meta-content" type="button" role="tab" 
                            aria-controls="pdf-meta-content" aria-selected="false">Metadata</button>
                  </li>
                  ${result.tables && result.tables.length > 0 ? `
                    <li class="nav-item" role="presentation">
                      <button class="nav-link" id="pdf-tables-tab" data-bs-toggle="tab" 
                              data-bs-target="#pdf-tables-content" type="button" role="tab" 
                              aria-controls="pdf-tables-content" aria-selected="false">Tables</button>
                    </li>
                  ` : ''}
                </ul>
                <div class="tab-content mt-3" id="pdfResultTabContent">
                  <div class="tab-pane fade show active" id="pdf-text-content" role="tabpanel" aria-labelledby="pdf-text-tab">
                    <pre class="text-content">${result.data.text}</pre>
                  </div>
                  <div class="tab-pane fade" id="pdf-meta-content" role="tabpanel" aria-labelledby="pdf-meta-tab">
                    <div class="table-responsive">
                      <table class="table table-striped">
                        <tbody>
                          <tr>
                            <th>Title</th>
                            <td>${result.data.title}</td>
                          </tr>
                          <tr>
                            <th>Author</th>
                            <td>${result.data.authors}</td>
                          </tr>
                          <tr>
                            <th>Pages</th>
                            <td>${result.data.pages}</td>
                          </tr>
                          <tr>
                            <th>Creation Date</th>
                            <td>${result.data.creationDate || 'Unknown'}</td>
                          </tr>
                          <tr>
                            <th>Language</th>
                            <td>${result.data.language || 'Unknown'}</td>
                          </tr>
                          <tr>
                            <th>Keywords</th>
                            <td>${result.data.keywords && result.data.keywords.length ? 
                                  result.data.keywords.join(', ') : 'None'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  ${result.tables && result.tables.length > 0 ? `
                    <div class="tab-pane fade" id="pdf-tables-content" role="tabpanel" aria-labelledby="pdf-tables-tab">
                      <div class="mb-3">
                        <h6>Found ${result.tables.length} tables</h6>
                      </div>
                      ${result.tables.map((table, index) => `
                        <div class="card mb-3">
                          <div class="card-header">
                            Table ${index + 1} (Page ${table.page || 'Unknown'})
                          </div>
                          <div class="card-body">
                            <div class="table-responsive">
                              <table class="table table-bordered table-sm">
                                <thead>
                                  <tr>
                                    ${table.columns ? table.columns.map(col => `<th>${col}</th>`).join('') : 
                                     table.data && table.data[0] ? table.data[0].map((_, colIndex) => `<th>Column ${colIndex + 1}</th>`).join('') : ''}
                                  </tr>
                                </thead>
                                <tbody>
                                  ${table.data ? table.data.map(row => `
                                    <tr>
                                      ${row.map(cell => `<td>${cell}</td>`).join('')}
                                    </tr>
                                  `).join('') : ''}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="copy-modal-text">Copy Text</button>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Add modal to the body
      const modalContainer = document.createElement('div');
      modalContainer.innerHTML = modalHtml;
      document.body.appendChild(modalContainer);
      
      // Initialize the modal using Bootstrap if available
      let modal;
      if (typeof bootstrap !== 'undefined' && typeof bootstrap.Modal !== 'undefined') {
        modal = new bootstrap.Modal(document.getElementById('pdfResultModal'));
        modal.show();
      } else {
        // Fallback for showing the modal
        const modalElement = document.getElementById('pdfResultModal');
        modalElement.classList.add('show');
        modalElement.style.display = 'block';
        document.body.classList.add('modal-open');
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        document.body.appendChild(backdrop);
      }
      
      // Set up copy button
      document.getElementById('copy-modal-text').addEventListener('click', () => {
        this.copyPdfText(result);
      });
      
      // Handle modal close event
      document.getElementById('pdfResultModal').addEventListener('hidden.bs.modal', function (event) {
        // Remove modal from DOM when hidden
        this.remove();
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) backdrop.remove();
        document.body.classList.remove('modal-open');
      });
    } catch (error) {
      console.error("Error showing PDF result details:", error);
      errorHandler.handleError(error, 'PDF_PROCESSOR');
    }
  },
  
  /**
   * Copy PDF text to clipboard
   * @param {Object} result - The processing result containing the text to copy
   */
  copyPdfText(result) {
    try {
      if (!result || !result.data || !result.data.text) {
        throw new Error("No text available to copy");
      }
      
      // Use Clipboard API if available
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(result.data.text)
          .then(() => {
            // Show success message
            this.showMessage('Success', 'Text copied to clipboard', 'success');
          })
          .catch(() => {
            // Fallback to textarea method
            this.copyTextareaFallback(result.data.text);
          });
      } else {
        // Use textarea fallback method for non-secure contexts
        this.copyTextareaFallback(result.data.text);
      }
    } catch (error) {
      console.error("Error copying PDF text:", error);
      this.showMessage('Error', 'Failed to copy text to clipboard', 'error');
    }
  },
  
  /**
   * Fallback method for copying text using textarea
   * @param {string} text - Text to copy
   */
  copyTextareaFallback(text) {
    try {
      // Create textarea element
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Make the textarea out of viewport
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // Select and copy
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      
      // Clean up
      document.body.removeChild(textArea);
      
      if (successful) {
        this.showMessage('Success', 'Text copied to clipboard', 'success');
      } else {
        throw new Error("execCommand copy failed");
      }
    } catch (error) {
      console.error("Error in textarea copy fallback:", error);
      this.showMessage('Error', 'Failed to copy text to clipboard', 'error');
    }
  },
  
  /**
   * Show a message to the user
   * @param {string} title - Message title
   * @param {string} message - Message content
   * @param {string} type - Message type (success, error, warning, info)
   */
  showMessage(title, message, type = 'info') {
    try {
      // Use UI toast if available
      if (window.ui && typeof window.ui.showToast === 'function') {
        window.ui.showToast(title, message, type);
        return;
      }
      
      // Create a bootstrap toast if UI module not available
      const toastHtml = `
        <div class="toast align-items-center text-white bg-${type === 'error' ? 'danger' : type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body">
              <strong>${title}</strong>: ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>
      `;
      
      // Check if toast container exists, create if not
      let toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
      }
      
      // Add toast to container
      const toastElement = document.createElement('div');
      toastElement.innerHTML = toastHtml;
      const toast = toastElement.firstElementChild;
      toastContainer.appendChild(toast);
      
      // Show the toast using Bootstrap if available
      if (typeof bootstrap !== 'undefined' && typeof bootstrap.Toast !== 'undefined') {
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
      } else {
        // Manual fallback
        toast.classList.add('show');
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            toastContainer.removeChild(toast);
          }, 300);
        }, 5000);
      }
    } catch (error) {
      console.error("Error showing message:", error);
    }
  },
  
  /**
   * Show error message
   * @param {string} title - Error title
   * @param {string} message - Error message
   */
  showError(title, message) {
    this.showMessage(title, message, 'error');
  },
  
  /**
   * Extract tables from PDF
   * @param {ArrayBuffer} arrayBuffer - PDF file content
   * @param {string} fileName - Name of the file
   * @returns {Promise<Array>} - Extracted tables
   */
  async extractTablesFromPdf(arrayBuffer, fileName) {
    try {
      // This would be implemented with PDF.js or a backend API call
      console.log(`Extracting tables from ${fileName}`);
      
      // Simulate API call for table extraction
      const formData = new FormData();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      formData.append('extractTables', true);
      
      const response = await fetch('/api/extract-tables', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to extract tables: ${response.status}`);
      }
      
      const result = await response.json();
      return result.tables || [];
    } catch (error) {
      console.error(`Error extracting tables from PDF ${fileName}:`, error);
      return [];
    }
  },
  
  /**
   * Detect document type (scan, text, mixed)
   * @param {ArrayBuffer} arrayBuffer - PDF file content
   * @param {string} fileName - Name of the file
   * @returns {Promise<string>} - Document type ('scan', 'text', 'mixed')
   */
  async detectDocumentType(arrayBuffer, fileName) {
    try {
      // This would be implemented with PDF.js or a backend API call
      console.log(`Detecting document type for ${fileName}`);
      
      // Simulate API call for document type detection
      const formData = new FormData();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      
      const response = await fetch('/api/detect-document-type', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to detect document type: ${response.status}`);
      }
      
      const result = await response.json();
      return result.documentType || 'text';
    } catch (error) {
      console.error(`Error detecting document type for ${fileName}:`, error);
      return 'text'; // Default to text
    }
  },
  
  /**
   * Extract text using OCR for scanned documents
   * @param {ArrayBuffer} arrayBuffer - PDF file content
   * @param {string} fileName - Name of the file
   * @returns {Promise<Object>} - OCR results
   */
  async extractTextWithOcr(arrayBuffer, fileName) {
    try {
      console.log(`Extracting text with OCR from ${fileName}`);
      
      // Simulate API call for OCR processing
      const formData = new FormData();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      formData.append('useOcr', true);
      
      const response = await fetch('/api/ocr-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`OCR processing failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      return {
        success: true,
        data: {
          title: result.metadata?.title || fileName,
          authors: result.metadata?.author || "Unknown Author",
          pages: result.pageCount || 0,
          text: result.fullText || "",
          byPage: result.pages || []
        },
        tables: [],
        ocrApplied: true
      };
    } catch (error) {
      console.error(`Error in OCR processing for ${fileName}:`, error);
      return {
        success: false,
        error: `OCR processing failed: ${error.message}`,
        ocrApplied: true
      };
    }
  },
  
  /**
   * Process a PDF file and return results
   * @param {File|Blob} file - PDF file to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processing results
   */
  async processPdf(file, options = {}) {
    // Merge options with defaults
    const mergedOptions = {
      ...this.config,
      ...options
    };
    
    try {
      if (this.isProcessing) {
        return {
          success: false,
          error: "Processing already in progress"
        };
      }
      
      this.isProcessing = true;
      this.currentFile = file;
      
      // Update state
      if (stateManager && typeof stateManager.setState === 'function') {
        stateManager.setState('pdf.processing', true);
        stateManager.setState('pdf.currentFile', file.name);
      }
      
      // Emit processing started event
      eventRegistry.emit('pdf.processing.started', {
        file: file.name,
        size: file.size,
        options: mergedOptions,
        timestamp: new Date().toISOString()
      });
      
      // Read file as ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // Determine processing mode based on file size
      this.determineProcessingMode(file);
      
      // Detect document type (scan, text, mixed)
      const documentType = await this.detectDocumentType(arrayBuffer, file.name);
      
      // Choose processing method based on document type
      let result;
      if (documentType === 'scan' && mergedOptions.allowOcr) {
        // Use OCR for scanned documents
        result = await this.extractTextWithOcr(arrayBuffer, file.name);
      } else if (this.processingMode === 'memory-efficient') {
        // Use memory-efficient processing for large files
        result = await this.memoryEfficientProcessing(arrayBuffer, file.name);
      } else {
        // Use standard processing for normal files
        result = await this.standardProcessing(arrayBuffer, file.name);
      }
      
      // Extract tables if needed and not already included
      if (mergedOptions.extractTables && result.success && (!result.tables || result.tables.length === 0)) {
        const tables = await this.extractTablesFromPdf(arrayBuffer, file.name);
        result.tables = tables;
      }
      
      // Add document type to result
      result.documentType = documentType;
      
      // Emit processing completed event
      eventRegistry.emit('pdf.processing.completed', {
        file: file.name,
        success: result.success,
        documentType,
        tablesExtracted: result.tables?.length || 0,
        timestamp: new Date().toISOString()
      });
      
      // Update state
      if (stateManager && typeof stateManager.setState === 'function') {
        stateManager.setState('pdf.processing', false);
        stateManager.setState('pdf.lastProcessed', {
          fileName: file.name,
          timestamp: new Date().toISOString(),
          success: result.success
        });
      }
      
      // Reset processing state
      this.isProcessing = false;
      this.currentFile = null;
      
      return result;
    } catch (error) {
      console.error(`Error processing PDF ${file.name}:`, error);
      
      // Emit processing error event
      eventRegistry.emit('pdf.processing.error', {
        file: file.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Update state
      if (stateManager && typeof stateManager.setState === 'function') {
        stateManager.setState('pdf.processing', false);
        stateManager.setState('pdf.lastError', {
          fileName: file.name,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Reset processing state
      this.isProcessing = false;
      this.currentFile = null;
      
      return {
        success: false,
        error: error.message || "Unknown error processing PDF",
        fileName: file.name
      };
    }
  },
  
  /**
   * Check if a file is a valid PDF
   * @param {File|Blob} file - File to check
   * @returns {Promise<boolean>} - Whether the file is a valid PDF
   */
  async isValidPdf(file) {
    try {
      // Check file type
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return false;
      }
      
      // Read the first 1024 bytes to check for PDF signature
      const chunk = await this.readFileChunk(file, 0, 1024);
      const signature = new Uint8Array(chunk).slice(0, 5);
      const decoder = new TextDecoder('ascii');
      const header = decoder.decode(signature);
      
      // Check for PDF signature (%PDF-)
      return header.startsWith('%PDF-');
    } catch (error) {
      console.error("Error validating PDF:", error);
      return false;
    }
  },
  
  /**
   * Read a chunk of a file
   * @param {File|Blob} file - File to read from
   * @param {number} start - Start position
   * @param {number} length - Number of bytes to read
   * @returns {Promise<ArrayBuffer>} - File chunk
   */
  readFileChunk(file, start, length) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      
      // Read only the specified chunk
      const chunk = file.slice(start, start + length);
      reader.readAsArrayBuffer(chunk);
    });
  },
  
  /**
   * Export PDF processing results to JSON
   * @param {Object} result - Processing result to export
   * @returns {string} - JSON string
   */
  exportToJson(result) {
    try {
      // Create export object with relevant data
      const exportData = {
        fileName: result.fileName,
        documentType: result.documentType,
        metadata: result.data.metadata || {},
        title: result.data.title,
        authors: result.data.authors,
        pages: result.data.pages,
        text: result.data.text,
        tables: result.tables || [],
        exportDate: new Date().toISOString()
      };
      
      // Convert to JSON string with formatting
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error("Error exporting to JSON:", error);
      throw new Error(`Failed to export to JSON: ${error.message}`);
    }
  }
};

// Export the module
export default pdfProcessor;
// Named exports for each method
export const initialize = pdfProcessor.initialize.bind(pdfProcessor);
export const log = pdfProcessor.log.bind(pdfProcessor);
export const registerEvents = pdfProcessor.registerEvents.bind(pdfProcessor);
export const error = pdfProcessor.error.bind(pdfProcessor);
export const handleError = pdfProcessor.handleError.bind(pdfProcessor);
export const on = pdfProcessor.on.bind(pdfProcessor);
export const from = pdfProcessor.from.bind(pdfProcessor);
export const filter = pdfProcessor.filter.bind(pdfProcessor);
export const endsWith = pdfProcessor.endsWith.bind(pdfProcessor);
export const updateSelectedPdfInfo = pdfProcessor.updateSelectedPdfInfo.bind(pdfProcessor);
export const registerEvent = pdfProcessor.registerEvent.bind(pdfProcessor);
export const getElementById = pdfProcessor.getElementById.bind(pdfProcessor);
export const processFiles = pdfProcessor.processFiles.bind(pdfProcessor);
export const showError = pdfProcessor.showError.bind(pdfProcessor);
export const setState = pdfProcessor.setState.bind(pdfProcessor);
export const toISOString = pdfProcessor.toISOString.bind(pdfProcessor);
export const getElement = pdfProcessor.getElement.bind(pdfProcessor);
export const reduce = pdfProcessor.reduce.bind(pdfProcessor);
export const formatBytes = pdfProcessor.formatBytes.bind(pdfProcessor);
export const map = pdfProcessor.map.bind(pdfProcessor);
export const join = pdfProcessor.join.bind(pdfProcessor);
export const warn = pdfProcessor.warn.bind(pdfProcessor);
export const Error = pdfProcessor.Error.bind(pdfProcessor);
export const showProcessingUI = pdfProcessor.showProcessingUI.bind(pdfProcessor);
export const emit = pdfProcessor.emit.bind(pdfProcessor);
export const Date = pdfProcessor.Date.bind(pdfProcessor);
export const updateProgress = pdfProcessor.updateProgress.bind(pdfProcessor);
export const determineProcessingMode = pdfProcessor.determineProcessingMode.bind(pdfProcessor);
export const extractTextFromPdf = pdfProcessor.extractTextFromPdf.bind(pdfProcessor);
export const push = pdfProcessor.push.bind(pdfProcessor);
export const showResultsUI = pdfProcessor.showResultsUI.bind(pdfProcessor);
export const showErrorUI = pdfProcessor.showErrorUI.bind(pdfProcessor);
export const readFileAsArrayBuffer = pdfProcessor.readFileAsArrayBuffer.bind(pdfProcessor);
export const memoryEfficientProcessing = pdfProcessor.memoryEfficientProcessing.bind(pdfProcessor);
export const standardProcessing = pdfProcessor.standardProcessing.bind(pdfProcessor);
export const Promise = pdfProcessor.Promise.bind(pdfProcessor);
export const FileReader = pdfProcessor.FileReader.bind(pdfProcessor);
export const resolve = pdfProcessor.resolve.bind(pdfProcessor);
export const reject = pdfProcessor.reject.bind(pdfProcessor);
export const readAsArrayBuffer = pdfProcessor.readAsArrayBuffer.bind(pdfProcessor);
export const FormData = pdfProcessor.FormData.bind(pdfProcessor);
export const Blob = pdfProcessor.Blob.bind(pdfProcessor);
export const append = pdfProcessor.append.bind(pdfProcessor);
export const fetch = pdfProcessor.fetch.bind(pdfProcessor);
export const text = pdfProcessor.text.bind(pdfProcessor);
export const json = pdfProcessor.json.bind(pdfProcessor);
export const processExtractionResults = pdfProcessor.processExtractionResults.bind(pdfProcessor);
export const percentage = pdfProcessor.percentage.bind(pdfProcessor);
export const setAttribute = pdfProcessor.setAttribute.bind(pdfProcessor);
export const add = pdfProcessor.add.bind(pdfProcessor);
export const remove = pdfProcessor.remove.bind(pdfProcessor);
export const forEach = pdfProcessor.forEach.bind(pdfProcessor);
export const indexOf = pdfProcessor.indexOf.bind(pdfProcessor);
export const querySelectorAll = pdfProcessor.querySelectorAll.bind(pdfProcessor);
export const querySelector = pdfProcessor.querySelector.bind(pdfProcessor);
export const parseInt = pdfProcessor.parseInt.bind(pdfProcessor);
export const showPdfResultDetails = pdfProcessor.showPdfResultDetails.bind(pdfProcessor);
export const copyPdfText = pdfProcessor.copyPdfText.bind(pdfProcessor);
export const addEventListener = pdfProcessor.addEventListener.bind(pdfProcessor);
export const resetToForm = pdfProcessor.resetToForm.bind(pdfProcessor);
export const alert = pdfProcessor.alert.bind(pdfProcessor);
export const createElement = pdfProcessor.createElement.bind(pdfProcessor);
export const appendChild = pdfProcessor.appendChild.bind(pdfProcessor);
export const Modal = pdfProcessor.Modal.bind(pdfProcessor);
export const show = pdfProcessor.show.bind(pdfProcessor);
export const writeText = pdfProcessor.writeText.bind(pdfProcessor);
export const then = pdfProcessor.then.bind(pdfProcessor);
export const showMessage = pdfProcessor.showMessage.bind(pdfProcessor);
export const copyTextareaFallback = pdfProcessor.copyTextareaFallback.bind(pdfProcessor);
export const focus = pdfProcessor.focus.bind(pdfProcessor);
export const select = pdfProcessor.select.bind(pdfProcessor);
export const execCommand = pdfProcessor.execCommand.bind(pdfProcessor);
export const removeChild = pdfProcessor.removeChild.bind(pdfProcessor);
export const type = pdfProcessor.type.bind(pdfProcessor);
export const showToast = pdfProcessor.showToast.bind(pdfProcessor);
export const Toast = pdfProcessor.Toast.bind(pdfProcessor);
export const setTimeout = pdfProcessor.setTimeout.bind(pdfProcessor);
export const extractTablesFromPdf = pdfProcessor.extractTablesFromPdf.bind(pdfProcessor);
export const detectDocumentType = pdfProcessor.detectDocumentType.bind(pdfProcessor);
export const extractTextWithOcr = pdfProcessor.extractTextWithOcr.bind(pdfProcessor);
export const processPdf = pdfProcessor.processPdf.bind(pdfProcessor);
export const isValidPdf = pdfProcessor.isValidPdf.bind(pdfProcessor);
export const readFileChunk = pdfProcessor.readFileChunk.bind(pdfProcessor);
export const Uint8Array = pdfProcessor.Uint8Array.bind(pdfProcessor);
export const slice = pdfProcessor.slice.bind(pdfProcessor);
export const TextDecoder = pdfProcessor.TextDecoder.bind(pdfProcessor);
export const decode = pdfProcessor.decode.bind(pdfProcessor);
export const signature = pdfProcessor.signature.bind(pdfProcessor);
export const startsWith = pdfProcessor.startsWith.bind(pdfProcessor);
export const exportToJson = pdfProcessor.exportToJson.bind(pdfProcessor);
export const stringify = pdfProcessor.stringify.bind(pdfProcessor);
