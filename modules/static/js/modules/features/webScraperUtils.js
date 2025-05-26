/**
 * Web Scraper Utilities Module
 * 
 * Provides specialized utilities for web scraping operations,
 * particularly for PDF handling and academic paper metadata.
 * 
 * This module complements the main webScraper.js module with
 * additional functionality for academic search, PDF analysis,
 * and specialized file handling.
 */

// Constants
const PDF_API_BASE = '/api/pdf';
const ACADEMIC_API_BASE = '/api/academic';

/**
 * Extract PDF metadata from a file
 * @param {string} filePath Path to the PDF file
 * @returns {Promise<Object>} PDF metadata
 */
async function extractPdfMetadata(filePath) {
  try {
    const response = await fetch(`${PDF_API_BASE}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pdf_path: filePath })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error extracting PDF metadata:', error);
    throw error;
  }
}

/**
 * Extract tables from a PDF file
 * @param {string} filePath Path to the PDF file
 * @param {Array<number>} pageRange Optional page range [start, end]
 * @returns {Promise<Array>} Extracted tables
 */
async function extractPdfTables(filePath, pageRange = null) {
  try {
    const requestData = {
      pdf_path: filePath
    };
    
    if (pageRange && Array.isArray(pageRange) && pageRange.length === 2) {
      requestData.page_range = pageRange;
    }
    
    const response = await fetch(`${PDF_API_BASE}/extract-tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error extracting PDF tables:', error);
    throw error;
  }
}

/**
 * Detect the type of a PDF document (scan, digital, etc.)
 * @param {string} filePath Path to the PDF file
 * @returns {Promise<Object>} Document type info
 */
async function detectPdfType(filePath) {
  try {
    const response = await fetch(`${PDF_API_BASE}/detect-type`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pdf_path: filePath })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error detecting PDF type:', error);
    throw error;
  }
}

/**
 * Process a PDF file with advanced options
 * @param {string} filePath Path to the PDF file
 * @param {Object} options Processing options
 * @returns {Promise<Object>} Processing result
 */
async function processPdf(filePath, options = {}) {
  try {
    // Set default options
    const defaultOptions = {
      extract_tables: true,
      use_ocr: true,
      detect_document_type: true,
      chunk_size: 4096
    };
    
    const processingOptions = { ...defaultOptions, ...options };
    
    // Prepare request data
    const requestData = {
      pdf_path: filePath,
      ...processingOptions
    };
    
    const response = await fetch(`${PDF_API_BASE}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw error;
  }
}

/**
 * Search for academic papers
 * @param {string} query Search query
 * @param {string} source Source to search (arxiv, semantic, openalex, all)
 * @param {number} limit Maximum number of results
 * @returns {Promise<Object>} Search results
 */
async function searchAcademicPapers(query, source = 'all', limit = 10) {
  try {
    const requestData = {
      query,
      source,
      limit
    };
    
    const response = await fetch(`${ACADEMIC_API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error searching academic papers:', error);
    throw error;
  }
}

/**
 * Batch process multiple PDFs
 * @param {Array<string>} pdfFiles Array of PDF file paths
 * @param {string} outputFolder Output folder for processed files
 * @param {Object} options Processing options
 * @returns {Promise<Object>} Batch processing result
 */
async function batchProcessPdfs(pdfFiles, outputFolder, options = {}) {
  try {
    // Set default options
    const defaultOptions = {
      extract_tables: true,
      use_ocr: true,
      extract_structure: true
    };
    
    const processingOptions = { ...defaultOptions, ...options };
    
    // Prepare request data
    const requestData = {
      pdf_files: pdfFiles,
      output_folder: outputFolder,
      ...processingOptions
    };
    
    const response = await fetch(`${PDF_API_BASE}/batch-process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Return task ID for tracking
    return data;
  } catch (error) {
    console.error('Error batch processing PDFs:', error);
    throw error;
  }
}

/**
 * Check the status of a PDF processing task
 * @param {string} taskId Task ID to check
 * @returns {Promise<Object>} Task status
 */
async function checkPdfTaskStatus(taskId) {
  try {
    const response = await fetch(`${PDF_API_BASE}/status/${taskId}`);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error checking PDF task status:', error);
    throw error;
  }
}

/**
 * Cancel a PDF processing task
 * @param {string} taskId Task ID to cancel
 * @returns {Promise<Object>} Cancellation result
 */
async function cancelPdfTask(taskId) {
  try {
    const response = await fetch(`${PDF_API_BASE}/cancel/${taskId}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error cancelling PDF task:', error);
    throw error;
  }
}

/**
 * Get details about PDFs found on a webpage
 * @param {string} url URL to scan for PDFs
 * @returns {Promise<Object>} PDF details
 */
async function getPdfLinksFromUrl(url) {
  try {
    const response = await fetch('/api/pdf-links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting PDF links:', error);
    throw error;
  }
}

/**
 * Convert a DOI to a downloadable PDF URL
 * @param {string} doi DOI string (e.g., 10.1038/ncomms1234)
 * @returns {Promise<Object>} PDF URL info
 */
async function doiToPdfUrl(doi) {
  try {
    const response = await fetch('/api/doi-to-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ doi })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error converting DOI to PDF URL:', error);
    throw error;
  }
}

/**
 * Validate if a URL is a valid PDF link
 * @param {string} url URL to check
 * @returns {Promise<Object>} Validation result
 */
async function validatePdfUrl(url) {
  try {
    const response = await fetch('/api/validate-pdf-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error validating PDF URL:', error);
    throw error;
  }
}

/**
 * Format a citation from PDF metadata
 * @param {Object} metadata PDF metadata
 * @param {string} style Citation style (apa, mla, chicago, etc.)
 * @returns {string} Formatted citation
 */
function formatCitation(metadata, style = 'apa') {
  // Default to empty strings for missing fields
  const {
    title = '',
    authors = [],
    year = '',
    journal = '',
    volume = '',
    issue = '',
    pages = '',
    doi = '',
    url = ''
  } = metadata;
  
  // Format authors
  const formatAuthors = (authors) => {
    if (!authors || !authors.length) return '';
    
    if (style === 'apa') {
      // APA style: Last, F., & Last, F.
      return authors.map((author, i) => {
        const nameParts = author.split(' ');
        const lastName = nameParts.pop() || '';
        const initials = nameParts.map(part => `${part.charAt(0)}.`).join(' ');
        return `${lastName}, ${initials}`;
      }).join(', ');
    } else if (style === 'mla') {
      // MLA style: Last, First
      return authors.map((author, i) => {
        const nameParts = author.split(' ');
        const lastName = nameParts.pop() || '';
        const firstName = nameParts.join(' ');
        return i === 0 ? `${lastName}, ${firstName}` : `${firstName} ${lastName}`;
      }).join(', ');
    } else {
      // Default format
      return authors.join(', ');
    }
  };
  
  const formattedAuthors = formatAuthors(authors);
  
  // Format citation based on style
  if (style === 'apa') {
    let citation = '';
    
    if (formattedAuthors) {
      citation += `${formattedAuthors} `;
    }
    
    if (year) {
      citation += `(${year}). `;
    }
    
    if (title) {
      citation += `${title}. `;
    }
    
    if (journal) {
      citation += `<em>${journal}</em>`;
      
      if (volume) {
        citation += `, ${volume}`;
      }
      
      if (issue) {
        citation += `(${issue})`;
      }
      
      if (pages) {
        citation += `, ${pages}`;
      }
      
      citation += '. ';
    }
    
    if (doi) {
      citation += `https://doi.org/${doi}`;
    } else if (url) {
      citation += url;
    }
    
    return citation;
  } else if (style === 'mla') {
    let citation = '';
    
    if (formattedAuthors) {
      citation += `${formattedAuthors}. `;
    }
    
    if (title) {
      citation += `"${title}." `;
    }
    
    if (journal) {
      citation += `<em>${journal}</em>`;
      
      if (volume) {
        citation += `, vol. ${volume}`;
      }
      
      if (issue) {
        citation += `, no. ${issue}`;
      }
      
      if (year) {
        citation += `, ${year}`;
      }
      
      if (pages) {
        citation += `, pp. ${pages}`;
      }
      
      citation += '. ';
    }
    
    if (doi) {
      citation += `DOI: ${doi}`;
    } else if (url) {
      citation += `URL: ${url}`;
    }
    
    return citation;
  } else {
    // Default simple format
    return `${formattedAuthors} (${year}). ${title}. ${journal} ${volume}${issue ? `(${issue})` : ''}${pages ? `: ${pages}` : ''}. ${doi ? `https://doi.org/${doi}` : url}`;
  }
}

// Export utility functions
export {
  extractPdfMetadata,
  extractPdfTables,
  detectPdfType,
  processPdf,
  searchAcademicPapers,
  batchProcessPdfs,
  checkPdfTaskStatus,
  cancelPdfTask,
  getPdfLinksFromUrl,
  doiToPdfUrl,
  validatePdfUrl,
  formatCitation
};

export default {
  extractPdfMetadata,
  extractPdfTables,
  detectPdfType,
  processPdf,
  searchAcademicPapers,
  batchProcessPdfs,
  checkPdfTaskStatus,
  cancelPdfTask,
  getPdfLinksFromUrl,
  doiToPdfUrl,
  validatePdfUrl,
  formatCitation
};