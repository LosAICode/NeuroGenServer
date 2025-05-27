
// =============================================================================
// SECTION 10: TASK HISTORY MANAGEMENT
// =============================================================================

/**
 * Initialize history tab elements and event listeners
 */
function initializeHistoryTab() {
  // Setup History tab event listeners
  if (historySearch) {
    historySearch.addEventListener('input', refreshHistoryTable);
  }

  if (historyFilter) {
    historyFilter.addEventListener('change', refreshHistoryTable);
  }

  if (historySort) {
    historySort.addEventListener('change', refreshHistoryTable);
  }

  if (historyRefreshBtn) {
    historyRefreshBtn.addEventListener('click', function() {
      loadTaskHistoryFromStorage();
      showToast('History', 'Task history refreshed', 'info');
    });
  }

  if (historyClearBtn) {
    historyClearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all task history? This cannot be undone.')) {
        clearTaskHistory();
        showToast('History Cleared', 'Task history has been cleared', 'warning');
      }
    });
  }
  
  // Initial load of task history
  loadTaskHistoryFromStorage();
}

/**
 * Add a task to the task history (enhanced)
 */
function addTaskToHistory(taskType, outputFile, stats) {
  // Get existing history from localStorage
  let history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Add new task to the beginning of the array
  history.unshift({
    taskType,
    outputFile,
    stats: stats || {},
    timestamp: Date.now()
  });
  
  // Limit history to 50 items (increased from 10)
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  
  // Save back to localStorage
  localStorage.setItem('taskHistory', JSON.stringify(history));
  
  // Refresh history table if visible
  if (document.querySelector('#history.active')) {
    refreshHistoryTable();
  }
}

/**
 * Load task history from localStorage and display it
 */
function loadTaskHistoryFromStorage() {
  // Get history from localStorage
  const history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Clear current history display
  if (historyTableBody) {
    // Make a local copy of history for filtering and sorting
    let displayHistory = [...history];
    
    // Apply search filter if provided
    if (historySearch && historySearch.value.trim()) {
      const searchTerm = historySearch.value.trim().toLowerCase();
      displayHistory = displayHistory.filter(task => {
        return (
          (task.outputFile && task.outputFile.toLowerCase().includes(searchTerm)) ||
          (task.taskType && task.taskType.toLowerCase().includes(searchTerm))
        );
      });
    }
    
    // Apply type filter if not "all"
    if (historyFilter && historyFilter.value !== 'all') {
      const filterType = historyFilter.value;
      displayHistory = displayHistory.filter(task => task.taskType === filterType);
    }
    
    // Apply sorting
    if (historySort) {
      const sortOrder = historySort.value;
      displayHistory.sort((a, b) => {
        if (sortOrder === 'oldest') {
          return a.timestamp - b.timestamp;
        } else {
          return b.timestamp - a.timestamp; // newest first (default)
        }
      });
    }
    
    // Clear and update the table
    historyTableBody.innerHTML = '';
    
    // If no history or all filtered out, show empty state
    if (displayHistory.length === 0) {
      historyTableBody.innerHTML = `
        <tr class="history-empty-row">
          <td colspan="5" class="text-center py-4">
            <i class="fas fa-info-circle me-2"></i>No tasks in history
          </td>
        </tr>
      `;
      return;
    }
    
    // Add each task to the table
    displayHistory.forEach((task, index) => {
      // Add task row to the table
      addTaskToHistoryTable(task, index);
    });
  }
  
  // Update PDF summaries
  updatePdfSummaries();
}

/**
 * Add a single task to the history table
 */
function addTaskToHistoryTable(task, index) {
  if (!historyTableBody) return;
  
  const row = document.createElement('tr');
  row.setAttribute('data-task-index', index);
  
  // Format the timestamp
  const date = new Date(task.timestamp);
  const formattedDate = date.toLocaleString();
  
  // Format the task type with icon
  let icon, typeText, typeBadgeClass;
  switch (task.taskType) {
    case 'scraper':
      icon = 'fa-globe';
      typeText = 'Web Scraper';
      typeBadgeClass = 'bg-info';
      break;
    case 'playlist':
      icon = 'fa-play-circle';
      typeText = 'Playlist';
      typeBadgeClass = 'bg-warning';
      break;
    default:
      icon = 'fa-file-alt';
      typeText = 'File Processor';
      typeBadgeClass = 'bg-primary';
  }
  
  // Format some key statistics
  const fileCount = task.stats.processed_files || task.stats.total_files || 'N/A';
  const duration = formatDuration(task.stats.duration_seconds || 0);
  const fileSize = formatBytes(task.stats.total_bytes || 0);
  
  // Create file path display with truncation
  const filePath = task.outputFile || 'Unknown file';
  const fileName = filePath.split(/[\\/]/).pop();
  const truncatedPath = filePath.length > 40 ? '...' + filePath.slice(-40) : filePath;
  
  // Build the row HTML
  row.innerHTML = `
    <td>
      <span class="badge ${typeBadgeClass} me-1">
        <i class="fas ${icon}"></i>
      </span>
      ${typeText}
    </td>
    <td class="text-truncate" style="max-width: 200px;" title="${filePath}">
      ${fileName}
    </td>
    <td>
      <span title="${formattedDate}">${formatRelativeTime(task.timestamp)}</span>
    </td>
    <td>
      <small>
        Files: ${fileCount} | Size: ${fileSize} | Duration: ${duration}
      </small>
    </td>
    <td>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-sm btn-outline-primary view-history-details" title="View Details">
          <i class="fas fa-info-circle"></i>
        </button>
        <button class="btn btn-sm btn-outline-success open-history-file" data-path="${task.outputFile}" title="Open File">
          <i class="fas fa-folder-open"></i>
        </button>
      </div>
    </td>
  `;
  
  // Add event listeners for buttons
  const viewDetailsBtn = row.querySelector('.view-history-details');
  if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener('click', () => {
      showTaskDetails(task);
    });
  }
  
  const openFileBtn = row.querySelector('.open-history-file');
  if (openFileBtn) {
    openFileBtn.addEventListener('click', () => {
      const filePath = openFileBtn.getAttribute('data-path');
      if (filePath) {
        openFileByPath(filePath);
      }
    });
  }
  
  // Add row to the table
  historyTableBody.appendChild(row);
}

/**
 * Show task details in a modal
 */
function showTaskDetails(task) {
  const taskDetailsContent = document.getElementById('task-details-content');
  const openTaskFileBtn = document.getElementById('open-task-file-btn');
  
  if (!taskDetailsContent || !openTaskFileBtn) return;
  
  // Set the output file path for the open button
  openTaskFileBtn.setAttribute('data-path', task.outputFile || '');
  
  // Format date/time
  const date = new Date(task.timestamp);
  const formattedDate = date.toLocaleString();
  
  // Determine task type and icon
  let icon, typeText;
  switch (task.taskType) {
    case 'scraper':
      icon = 'fa-globe';
      typeText = 'Web Scraper';
      break;
    case 'playlist':
      icon = 'fa-play-circle';
      typeText = 'Playlist';
      break;
    default:
      icon = 'fa-file-alt';
      typeText = 'File Processor';
  }
  
  // Create HTML content for the task details
  let detailsHtml = `
    <div class="mb-3">
      <h6 class="border-bottom pb-2 mb-3">Task Information</h6>
      <table class="table table-sm">
        <tr>
          <th style="width: 120px;">Type:</th>
          <td><i class="fas ${icon} me-1"></i> ${typeText}</td>
        </tr>
        <tr>
          <th>Output File:</th>
          <td class="text-break">${task.outputFile || 'Unknown'}</td>
        </tr>
        <tr>
          <th>Timestamp:</th>
          <td>${formattedDate}</td>
        </tr>
      </table>
    </div>
  `;
  
  // Add statistics section if available
  if (task.stats && Object.keys(task.stats).length > 0) {
    detailsHtml += `
      <div class="mb-3">
        <h6 class="border-bottom pb-2 mb-3">Statistics</h6>
        <div class="row g-2">
    `;
    
    // Add standard statistics with consistent formatting
    if (task.stats.total_files !== undefined) {
      detailsHtml += createStatCard('Total Files', task.stats.total_files, 'fa-files');
    }
    
    if (task.stats.processed_files !== undefined) {
      detailsHtml += createStatCard('Processed Files', task.stats.processed_files, 'fa-check-circle');
    }
    
    if (task.stats.skipped_files !== undefined) {
      detailsHtml += createStatCard('Skipped Files', task.stats.skipped_files, 'fa-step-forward');
    }
    
    if (task.stats.error_files !== undefined) {
      detailsHtml += createStatCard('Error Files', task.stats.error_files, 'fa-exclamation-circle');
    }
    
    if (task.stats.total_chunks !== undefined) {
      detailsHtml += createStatCard('Total Chunks', task.stats.total_chunks, 'fa-cubes');
    }
    
    if (task.stats.total_bytes !== undefined) {
      detailsHtml += createStatCard('Total Size', formatBytes(task.stats.total_bytes), 'fa-database');
    }
    
    if (task.stats.duration_seconds !== undefined) {
      detailsHtml += createStatCard('Duration', formatDuration(task.stats.duration_seconds), 'fa-clock');
    }
    
    detailsHtml += `
        </div>
      </div>
    `;
    
    // Add JSON View button to see all stats
    detailsHtml += `
      <div class="mt-3">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#taskJsonDetails">
          <i class="fas fa-code me-1"></i> View Raw JSON
        </button>
        <div class="collapse mt-2" id="taskJsonDetails">
          <div class="card card-body">
            <pre class="mb-0"><code class="language-json">${formatJsonForDisplay({stats: task.stats, outputFile: task.outputFile})}</code></pre>
          </div>
        </div>
      </div>
    `;
  }
  
  // Set the content and show the modal
  taskDetailsContent.innerHTML = detailsHtml;
  
  // Initialize and show modal
  const modal = new bootstrap.Modal(document.getElementById('task-details-modal'));
  modal.show();
}

/**
 * Create a stat card for task details view
 */
function createStatCard(label, value, icon) {
  return `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card h-100">
        <div class="card-body p-2 text-center">
          <i class="fas ${icon} mb-2 text-primary"></i>
          <h6 class="mb-0">${value}</h6>
          <small class="text-muted">${label}</small>
        </div>
      </div>
    </div>
  `;
}

/**
 * Format relative time for timestamp display
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Refresh the history table (used for filtering and sorting)
 */
function refreshHistoryTable() {
  loadTaskHistoryFromStorage();
}

/**
 * Clear all task history
 */
function clearTaskHistory() {
  localStorage.removeItem('taskHistory');
  
  // Clear table
  if (historyTableBody) {
    historyTableBody.innerHTML = `
      <tr class="history-empty-row">
        <td colspan="5" class="text-center py-4">
          <i class="fas fa-info-circle me-2"></i>No tasks in history
        </td>
      </tr>
    `;
  }
  
  // Clear PDF summaries
  if (pdfSummariesContainer) {
    pdfSummariesContainer.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        <i class="fas fa-file-pdf me-2"></i>No PDF summaries available
      </div>
    `;
  }
}

/**
 * Update PDF summaries in the history tab
 */
function updatePdfSummaries() {
  if (!pdfSummariesContainer) return;
  
  // Get history from localStorage
  const history = JSON.parse(localStorage.getItem('taskHistory') || '[]');
  
  // Filter to only get PDFs
  const pdfTasks = history.filter(task => {
    return task.outputFile && task.outputFile.toLowerCase().endsWith('.json') && 
           task.stats && task.stats.pdf_files > 0;
  }).slice(0, 6); // Limit to 6 recent PDFs
  
  // Clear container
  pdfSummariesContainer.innerHTML = '';
  
  // If no PDF summaries, show empty state
  if (pdfTasks.length === 0) {
    pdfSummariesContainer.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        <i class="fas fa-file-pdf me-2"></i>No PDF summaries available
      </div>
    `;
    return;
  }
  
  // Add PDF summary cards
  pdfTasks.forEach(task => {
    // Get template
    const template = document.getElementById('pdf-summary-card-template');
    if (!template) return;
    
    // Clone template
    const card = document.importNode(template.content, true);
    
    // Get filename
    const filePath = task.outputFile || '';
    const fileName = filePath.split(/[\\/]/).pop() || 'Unknown PDF';
    
    // Set data
    card.querySelector('.pdf-title').textContent = fileName.replace('_processed.json', '');
    
    // Determine PDF type
    let pdfType = 'Unknown';
    let badgeClass = 'bg-secondary';
    
    if (task.stats.pdf_scanned_count > 0) {
      pdfType = 'Scanned';
      badgeClass = 'bg-warning';
    } else if (task.stats.pdf_academic_count > 0) {
      pdfType = 'Academic';
      badgeClass = 'bg-primary';
    } else if (task.stats.pdf_report_count > 0) {
      pdfType = 'Report';
      badgeClass = 'bg-info';
    } else if (task.stats.pdf_book_count > 0) {
      pdfType = 'Book';
      badgeClass = 'bg-success';
    }
    
    // Set badge
    const badge = card.querySelector('.pdf-type-badge');
    badge.textContent = pdfType;
    badge.className = `badge pdf-type-badge ${badgeClass}`;
    
    // Set stats
    card.querySelector('.pages-count').textContent = task.stats.page_count || '?';
    card.querySelector('.tables-count').textContent = task.stats.tables_extracted || '0';
    
    const fileSize = task.stats.total_bytes ? (task.stats.total_bytes / (1024 * 1024)).toFixed(1) : '?';
    card.querySelector('.file-size').textContent = fileSize;
    
    // Set summary
    let summary = '';
    if (task.stats.document_type) {
      summary += `Type: ${task.stats.document_type}. `;
    }
    if (task.stats.references_extracted) {
      summary += `References: ${task.stats.references_extracted}. `;
    }
    if (task.stats.total_chunks) {
      summary += `Chunks: ${task.stats.total_chunks}.`;
    }
    
    card.querySelector('.pdf-summary').textContent = summary || 'No additional information available.';
    
    // Add event listeners
    const viewPdfBtn = card.querySelector('.view-pdf-btn');
    const structurePdfBtn = card.querySelector('.structure-pdf-btn');
    const viewJsonBtn = card.querySelector('.view-json-btn');
    
    viewPdfBtn.addEventListener('click', function() {
      // Get the source PDF path
      const jsonPath = task.outputFile;
      const pdfPath = jsonPath.replace('_processed.json', '.pdf');
      
      // Try to open PDF viewer
      openPdfViewer(pdfPath);
    });
    
    structurePdfBtn.addEventListener('click', function() {
      // Show structure in a modal
      showPdfStructure(task);
    });
    
    viewJsonBtn.addEventListener('click', function() {
      // Open JSON file
      if (task.outputFile) {
        openFileByPath(task.outputFile);
      }
    });
    
    // Add card to container
    pdfSummariesContainer.appendChild(card);
  });
}

/**
 * Show PDF structure in a modal
 */
function showPdfStructure(task) {
  // Create modal if it doesn't exist
  let structureModal = document.getElementById('pdf-structure-modal');
  
  if (!structureModal) {
    structureModal = document.createElement('div');
    structureModal.className = 'modal fade';
    structureModal.id = 'pdf-structure-modal';
    structureModal.setAttribute('tabindex', '-1');
    
    structureModal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">PDF Structure</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="pdf-structure-content">
            <div class="text-center">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="mt-3">Loading PDF structure...</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(structureModal);
  }
  
  // Get the modal content container
  const contentContainer = document.getElementById('pdf-structure-content');
  
  // Show the modal
  const modal = new bootstrap.Modal(structureModal);
  modal.show();
  
  // Build structure content
  let structureHtml = '';
  
  if (task.stats && task.stats.section_titles && task.stats.section_titles.length > 0) {
    structureHtml += `
      <h6 class="border-bottom pb-2 mb-3">Document Sections</h6>
      <ul class="list-group mb-4">
    `;
    
    task.stats.section_titles.forEach((title, index) => {
      structureHtml += `
        <li class="list-group-item">
          <span class="badge bg-primary me-2">${index + 1}</span>
          ${title}
        </li>
      `;
    });
    
    structureHtml += `</ul>`;
  }
  
  if (task.stats && task.stats.tables_info && task.stats.tables_info.length > 0) {
    structureHtml += `
      <h6 class="border-bottom pb-2 mb-3">Tables</h6>
      <div class="table-responsive">
        <table class="table table-sm table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Page</th>
              <th>Rows</th>
              <th>Columns</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    task.stats.tables_info.forEach(table => {
      structureHtml += `
        <tr>
          <td>${table.table_id || 'N/A'}</td>
          <td>${table.page || 'N/A'}</td>
          <td>${table.rows || 'N/A'}</td>
          <td>${table.columns || 'N/A'}</td>
        </tr>
      `;
    });
    
    structureHtml += `
        </tbody>
      </table>
    </div>
    `;
  }
  
  if (!structureHtml) {
    structureHtml = `
      <div class="alert alert-info">
        <i class="fas fa-info-circle me-2"></i>
        No detailed structure information available for this PDF.
      </div>
    `;
  }
  
  // Update the modal content
  contentContainer.innerHTML = structureHtml;
}

// =============================================================================
// SECTION 11: HELP MODE & KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Toggle help mode with enhanced visual feedback
 */
function toggleHelpMode() {
  helpMode = !helpMode;
  
  // Toggle the class on the body
  document.body.classList.toggle('help-mode', helpMode);
  
  // Show/hide help tooltips
  if (helpMode) {
    showHelpTooltips();
    showToast('Help Mode', 'Help mode enabled. Click on elements to see help.', 'info');
  } else {
    removeHelpTooltips();
  }
}

/**
 * Show help tooltips
 */
function showHelpTooltips() {
  // Add help-target class to elements with help tips
  const helpTargets = [
    { selector: '#input-dir', tip: 'Enter the directory containing files to process' },
    { selector: '#output-file', tip: 'Enter the filename for the JSON output (without extension)' },
    { selector: '#browse-btn', tip: 'Click to browse for a directory' },
    { selector: '#submit-btn', tip: 'Start processing files in the specified directory' },
    { selector: '.playlist-url', tip: 'Enter a YouTube playlist URL' },
    { selector: '#playlist-root', tip: 'Enter the directory where playlist files will be downloaded' },
    { selector: '.scraper-url', tip: 'Enter a website URL to scrape' },
    { selector: '.scraper-settings', tip: 'Choose how to process the URL' },
    { selector: '#download-directory', tip: 'Enter the directory where files will be downloaded' }
  ];
  
  helpTargets.forEach(target => {
    const elements = document.querySelectorAll(target.selector);
    elements.forEach(element => {
      element.classList.add('help-target');
      
      // Add click event to show tooltip
      element.addEventListener('click', function(e) {
        if (!helpMode) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        showTooltip(element, target.tip);
      });
    });
  });
}

/**
 * Show a tooltip next to an element
 */
function showTooltip(element, message) {
  // Remove any existing tooltips
  removeHelpTooltips();
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'help-tooltip';
  tooltip.innerHTML = `
    <button class="help-close-btn"><i class="fas fa-times"></i></button>
    <p>${message}</p>
  `;
  
  // Position tooltip
  const rect = element.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + 10}px`;
  tooltip.style.left = `${rect.left}px`;
  
  // Add to body
  document.body.appendChild(tooltip);
  
  // Add event listener to close button
  tooltip.querySelector('.help-close-btn').addEventListener('click', function() {
    tooltip.remove();
  });
  
  // Animate in
  setTimeout(() => {
    tooltip.classList.add('active');
  }, 10);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(tooltip)) {
      tooltip.classList.remove('active');
      setTimeout(() => tooltip.remove(), 300);
    }
  }, 5000);
}

/**
 * Remove all help tooltips
 */
function removeHelpTooltips() {
  const tooltips = document.querySelectorAll('.help-tooltip');
  tooltips.forEach(tooltip => {
    tooltip.classList.remove('active');
    setTimeout(() => {
      if (document.body.contains(tooltip)) {
        tooltip.remove();
      }
    }, 300);
  });
}

/**
 * Handle keyboard shortcuts with visual feedback
 */
function handleKeyboardShortcuts(e) {
  // Check if Ctrl key is pressed
  if (e.ctrlKey) {
    let shortcutActivated = true;
    
    switch (e.key) {
      case '1':
        // Switch to File Processor tab
        const fileTab = document.getElementById('file-tab');
        if (fileTab) {
          const tabInstance = new bootstrap.Tab(fileTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to File Processor tab', 'info');
        }
        break;
      case '2':
        // Switch to Playlist Downloader tab
        const playlistTab = document.getElementById('playlist-tab');
        if (playlistTab) {
          const tabInstance = new bootstrap.Tab(playlistTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to Playlist Downloader tab', 'info');
        }
        break;
      case '3':
        // Switch to Web Scraper tab
        const scraperTab = document.getElementById('scraper-tab');
        if (scraperTab) {
          const tabInstance = new bootstrap.Tab(scraperTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to Web Scraper tab', 'info');
        }
        break;
      case '4':
        // Switch to History tab
        const historyTab = document.getElementById('history-tab');
        if (historyTab) {
          const tabInstance = new bootstrap.Tab(historyTab);
          tabInstance.show();
          showToast('Shortcut', 'Switched to History tab', 'info');
        }
        break;
      case 'o':
        // Open JSON file (when available)
        e.preventDefault();
        const openBtn = document.querySelector('.open-json-btn:not(.d-none)');
        if (openBtn && !openBtn.disabled) {
          openBtn.click();
          showToast('Shortcut', 'Opening JSON file', 'info');
        } else {
          showToast('Shortcut', 'No JSON file available to open', 'warning');
        }
        break;
      case 'n':
        // Start new task (when available)
        e.preventDefault();
        const newTaskBtn = document.querySelector('#new-task-btn:not(.d-none)') ||
                           document.querySelector('#playlist-new-task-btn:not(.d-none)') ||
                           document.querySelector('#scraper-new-task-btn:not(.d-none)');
        if (newTaskBtn && !newTaskBtn.disabled) {
          newTaskBtn.click();
          showToast('Shortcut', 'Starting new task', 'info');
        } else {
          showToast('Shortcut', 'Cannot start new task now', 'warning');
        }
        break;
      case 'h':
        // Show help dialog
        e.preventDefault();
        toggleHelpMode();
        break;
      default:
        shortcutActivated = false;
    }
    
    // Visual feedback when a shortcut is activated
    if (shortcutActivated) {
      // Create a visual indicator for the shortcut
      const indicator = document.createElement('div');
      indicator.className = 'shortcut-indicator';
      indicator.style.position = 'fixed';
      indicator.style.top = '50%';
      indicator.style.left = '50%';
      indicator.style.transform = 'translate(-50%, -50%)';
      indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      indicator.style.color = 'white';
      indicator.style.padding = '20px';
      indicator.style.borderRadius = '10px';
      indicator.style.zIndex = '9999';
      indicator.style.opacity = '0';
      indicator.style.transition = 'opacity 0.3s ease';
      
      // Get the shortcut name
      let shortcutName = '';
      switch (e.key) {
        case '1': shortcutName = 'File Processor'; break;
        case '2': shortcutName = 'Playlist Downloader'; break;
        case '3': shortcutName = 'Web Scraper'; break;
        case '4': shortcutName = 'History'; break;
        case 'o': shortcutName = 'Open JSON'; break;
        case 'n': shortcutName = 'New Task'; break;
        case 'h': shortcutName = 'Help Mode'; break;
      }
      
      indicator.innerHTML = `<i class="fas fa-keyboard me-2"></i>Shortcut: Ctrl+${e.key.toUpperCase()} (${shortcutName})`;
      document.body.appendChild(indicator);
      
      // Animate in and then out
      setTimeout(() => {
        indicator.style.opacity = '1';
        setTimeout(() => {
          indicator.style.opacity = '0';
          setTimeout(() => {
            indicator.remove();
          }, 300);
        }, 1000);
      }, 10);
    }
  } else if (e.key === 'Escape') {
    // Close dialogs on escape
    const tooltips = document.querySelectorAll('.help-tooltip');
    tooltips.forEach(tooltip => tooltip.remove());
    
    // Check for open modals and close them
    const openModals = document.querySelectorAll('.modal.show');
    openModals.forEach(modal => {
      const modalInstance = bootstrap.Modal.getInstance(modal);
      if (modalInstance) modalInstance.hide();
    });
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcuts);
  console.log("Keyboard shortcuts initialized");
}

// =============================================================================
// SECTION 12: ACADEMIC SEARCH FUNCTIONALITY
// =============================================================================

/**
 * Initialize the academic search functionality
 */
function initializeAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicSearchBtn = document.getElementById('academic-search-btn');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  const addSelectedPapersBtn = document.getElementById('add-selected-papers');
  
  if (!academicSearchBtn) {
    console.warn("Academic search elements not found");
    return;
  }
  
  // Set up event listeners for academic search
  academicSearchBtn.addEventListener('click', performAcademicSearch);
  
  // Add enter key support for search field
  if (academicSearchInput) {
    academicSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        performAcademicSearch();
      }
    });
  }
  
  if (addSelectedPapersBtn) {
    addSelectedPapersBtn.addEventListener('click', addSelectedPapers);
  }
  
  // Populate academic sources dropdown if it exists
  if (academicSources) {
    // Ensure sources list is up to date
    populateAcademicSources();
  }
  
  console.log("Academic search functionality initialized");
}

/**
 * Populate academic sources dropdown
 */
function populateAcademicSources() {
  const academicSources = document.getElementById('academic-sources');
  if (!academicSources) return;
  
  // Define available academic sources
  const sources = [
    { value: 'all', label: 'All Sources' },
    { value: 'arxiv', label: 'arXiv' },
    { value: 'semantic', label: 'Semantic Scholar' },
    { value: 'openalex', label: 'OpenAlex' }
  ];
  
  // Clear existing options
  academicSources.innerHTML = '';
  
  // Add options
  sources.forEach(source => {
    const option = document.createElement('option');
    option.value = source.value;
    option.textContent = source.label;
    academicSources.appendChild(option);
  });
}

/**
 * Perform academic search
 */
function performAcademicSearch() {
  const academicSearchInput = document.getElementById('academic-search-input');
  const academicSources = document.getElementById('academic-sources');
  const academicResults = document.getElementById('academic-results');
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  if (!academicSearchInput || !academicSources || !academicResults || !academicResultsContainer) {
    console.error("Academic search elements not found");
    return;
  }
  
  const query = academicSearchInput.value.trim();
  const source = academicSources.value;
  
  if (!query) {
    showToast('Error', 'Please enter a search query', 'error');
    return;
  }
  
  // Show loading indicator in results area
  academicResults.classList.remove('d-none');
  academicResultsContainer.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Searching academic sources...</p>
    </div>
  `;
  
  // Call the API endpoint
  fetch('/api/academic-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.error) {
      throw new Error(data.error);
    }
    
    displayAcademicResults(data.results || []);
  })
  .catch(error => {
    console.error('Academic search error:', error);
    
    // Show error in results container
    academicResultsContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        Error: ${error.message || 'Failed to search academic sources'}
      </div>
    `;
    
    showToast('Search Failed', error.message || 'Failed to search academic sources', 'error');
  });
}

/**
 * Display academic search results
 */
function displayAcademicResults(results) {
  const academicResultsContainer = document.getElementById('academic-results-container');
  
  if (!academicResultsContainer) return;
  
  if (results.length === 0) {
    academicResultsContainer.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        No results found. Try a different search term or source.
      </div>
    `;
    return;
  }
  
  // Clear previous results
  academicResultsContainer.innerHTML = '';
  
  // Add each result to the container
  results.forEach((paper, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'paper-result-item list-group-item list-group-item-action';
    resultItem.dataset.paperId = paper.id;
    resultItem.dataset.paperUrl = paper.pdf_url || paper.url;
    resultItem.dataset.paperTitle = paper.title;
    
    // Source badge
    let sourceBadge = '';
    if (paper.source === 'arxiv') {
      sourceBadge = '<span class="academic-source-badge academic-source-arxiv me-2">arXiv</span>';
    } else if (paper.source === 'semantic') {
      sourceBadge = '<span class="academic-source-badge academic-source-semantic me-2">Semantic Scholar</span>';
    } else if (paper.source === 'openalex') {
      sourceBadge = '<span class="academic-source-badge academic-source-openalex me-2">OpenAlex</span>';
    }
    
    // Create HTML for the result item
    resultItem.innerHTML = `
      <div class="d-flex align-items-start">
        <div class="form-check mt-1 me-2">
          <input class="form-check-input paper-select" type="checkbox" id="paper-${index}">
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between">
            <h6 class="mb-1">${paper.title}</h6>
          </div>
          <div class="mb-1">
            ${sourceBadge}
            <small class="text-muted">${paper.authors.join(', ')}</small>
          </div>
          <p class="mb-1 small">${paper.abstract || 'No abstract available'}</p>
          <div class="mt-2">
            ${paper.pdf_url ? 
              `<span class="badge bg-light text-dark me-2">
                <i class="fas fa-file-pdf me-1 text-danger"></i> PDF Available
              </span>` : ''}
            <span class="badge bg-light text-dark">
              <i class="fas fa-calendar-alt me-1"></i> ${paper.date || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    `;
    
    // Add click handler to toggle selection
    resultItem.addEventListener('click', function(e) {
      // Don't toggle if clicking on the checkbox
      if (e.target.type !== 'checkbox') {
        const checkbox = this.querySelector('.paper-select');
        checkbox.checked = !checkbox.checked;
      }
      
      // Toggle selected class
      this.classList.toggle('selected', this.querySelector('.paper-select').checked);
    });
    
    academicResultsContainer.appendChild(resultItem);
  });
}

/**
 * Add selected papers to the URL list
 */
function addSelectedPapers() {
  const academicResultsContainer = document.getElementById('academic-results-container');
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  
  if (!academicResultsContainer || !scraperUrlsContainer) {
    showToast('Error', 'Required elements not found', 'error');
    return;
  }
  
  const selectedPapers = academicResultsContainer.querySelectorAll('.paper-select:checked');
  
  if (selectedPapers.length === 0) {
    showToast('Warning', 'Please select at least one paper', 'warning');
    return;
  }
  
  // Add each selected paper as a new URL entry
  selectedPapers.forEach(checkbox => {
    const paperItem = checkbox.closest('.paper-result-item');
    const paperUrl = paperItem.dataset.paperUrl;
    const paperTitle = paperItem.dataset.paperTitle;
    
    if (paperUrl) {
      // Add a new URL field with PDF download setting
      addScraperUrlWithData(paperUrl, 'pdf', paperTitle);
    }
  });
  
  // Show confirmation
  showToast('Success', `Added ${selectedPapers.length} papers to scraping list`, 'success');
  
  // Show PDF info section and ensure it's visible
  updatePdfInfoSection();
}

/**
 * Add a new URL field with pre-filled data
 */
function addScraperUrlWithData(url, setting, title = '') {
  const scraperUrlsContainer = document.getElementById('scraper-urls-container');
  if (!scraperUrlsContainer) return;
  
  const container = document.createElement("div");
  container.classList.add("input-group", "mb-2");
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
  
  // Add to container
  scraperUrlsContainer.appendChild(container);
  
  // Set up event listeners
  const removeBtn = container.querySelector('.remove-url');
  removeBtn.addEventListener('click', function() {
    scraperUrlsContainer.removeChild(container);
    updatePdfInfoSection();
  });
  
  settingsSelect.addEventListener('change', handleScraperSettingsChange);
}