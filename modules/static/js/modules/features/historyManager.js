/**
 * historyManager.js
 * Manages task history, recent activity, and previous operations
 * Provides persistence for past operations
 */

// Core modules
import errorHandler from '../core/errorHandler.js';
import uiRegistry from '../core/uiRegistry.js';
import stateManager from '../core/stateManager.js';
import eventRegistry from '../core/eventRegistry.js';
import eventManager from '../core/eventManager.js';

// Utility modules
import utils from '../utils/utils.js';

class HistoryManager {
    constructor() {
        this.maxHistoryItems = 50; // Maximum number of history items to store
        this.history = {
            tasks: [],           // Processing tasks
            downloads: [],       // File downloads
            searches: [],        // Academic searches
            recentFiles: []      // Recently accessed files
        };
        this.initialized = false;
    }

    /**
     * Initialize the history manager
     * @returns {Promise<boolean>} Initialization success
     */
    async initialize() {
        try {
            if (this.initialized) {
                console.log('History manager already initialized');
                return true;
            }

            console.log('Initializing history manager...');
            
            this.registerUIElements();
            this.setupEventListeners();
            await this.loadHistoryFromStorage();
            
            this.initialized = true;
            console.log('History manager initialized successfully');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize history manager:', error);
            errorHandler.handleError(error);
            return false;
        }
    }

    /**
     * Register UI elements with the UI registry
     */
    registerUIElements() {
        // Primary containers
        uiRegistry.registerElement('historyContainer', '#history');
        uiRegistry.registerElement('historyTableBody', '#history-table-body');
        
        // History tab components
        uiRegistry.registerElement('historyRefreshBtn', '#history-refresh-btn');
        uiRegistry.registerElement('historyClearBtn', '#history-clear-btn');
        uiRegistry.registerElement('historySearch', '#history-search');
        uiRegistry.registerElement('historyFilter', '#history-filter');
        uiRegistry.registerElement('historySort', '#history-sort');
        
        // PDF summaries container
        uiRegistry.registerElement('pdfSummariesContainer', '#pdf-summaries-container');
    }

    /**
     * Set up event listeners using event registry
     */
    setupEventListeners() {
        // Use event registry for events
        if (eventRegistry) {
            // Register for button clicks in UI
            eventRegistry.on('history.refresh', () => this.refreshHistoryDisplay());
            eventRegistry.on('history.clear', () => this.clearHistory());
            eventRegistry.on('history.filter', (data) => this.filterHistory(data.type));
            eventRegistry.on('history.search', (data) => this.searchHistory(data.query));
            eventRegistry.on('history.sort', (data) => this.sortHistory(data.method));
            
            // Register for task and file events
            eventRegistry.on('task.completed', (data) => this.addTaskToHistory(data));
            eventRegistry.on('file.downloaded', (data) => this.addDownloadToHistory(data));
            eventRegistry.on('search.performed', (data) => this.addSearchToHistory(data));
            eventRegistry.on('file.accessed', (data) => this.addFileToRecent(data));
        }
        
        // Set up direct DOM events for the buttons
        const refreshBtn = uiRegistry.getElement('historyRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshHistoryDisplay());
        }
        
        const clearBtn = uiRegistry.getElement('historyClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearHistory());
        }
        
        const historyFilter = uiRegistry.getElement('historyFilter');
        if (historyFilter) {
            historyFilter.addEventListener('change', (e) => this.filterHistory(e.target.value));
        }
        
        const historySearch = uiRegistry.getElement('historySearch');
        if (historySearch) {
            historySearch.addEventListener('input', (e) => this.searchHistory(e.target.value));
        }
        
        const historySort = uiRegistry.getElement('historySort');
        if (historySort) {
            historySort.addEventListener('change', (e) => this.sortHistory(e.target.value));
        }
        
        // Setup delegated event handling for the history table
        const historyTableBody = uiRegistry.getElement('historyTableBody');
        if (historyTableBody) {
            historyTableBody.addEventListener('click', (e) => {
                // Find the clicked button
                const viewBtn = e.target.closest('[data-action="view"]');
                const openBtn = e.target.closest('[data-action="open"]');
                
                if (viewBtn) {
                    const taskId = viewBtn.getAttribute('data-id');
                    this.showTaskDetails(taskId);
                    e.preventDefault();
                    return;
                }
                
                if (openBtn) {
                    const taskId = openBtn.getAttribute('data-id');
                    this.openTaskOutput(taskId);
                    e.preventDefault();
                    return;
                }
            });
        }
    }

    /**
     * Load history from localStorage
     * @returns {Promise<boolean>} Success status
     */
    async loadHistoryFromStorage() {
        try {
            const savedHistory = localStorage.getItem('neurogenHistory');
            if (savedHistory) {
                const parsed = JSON.parse(savedHistory);
                
                // Validate the structure
                if (parsed && typeof parsed === 'object') {
                    // Ensure all expected properties exist
                    this.history = {
                        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
                        downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
                        searches: Array.isArray(parsed.searches) ? parsed.searches : [],
                        recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : []
                    };
                    
                    console.log(`Loaded history: ${this.history.tasks.length} tasks, ${this.history.downloads.length} downloads, ${this.history.searches.length} searches, ${this.history.recentFiles.length} recent files`);
                    this.refreshHistoryDisplay();
                    return true;
                }
            }
            
            // If we got here, either no history or invalid format
            console.log('No valid history found in storage, using defaults');
            return false;
        } catch (error) {
            console.error('Failed to load history from storage:', error);
            errorHandler.handleError(new Error(`Failed to load history: ${error.message}`));
            return false;
        }
    }

    /**
     * Save history to localStorage
     * @returns {boolean} Success status
     */
    saveHistoryToStorage() {
        try {
            localStorage.setItem('neurogenHistory', JSON.stringify(this.history));
            return true;
        } catch (error) {
            console.error('Failed to save history to storage:', error);
            errorHandler.handleError(new Error(`Failed to save history: ${error.message}`));
            
            // If quota exceeded, try to reduce history size
            if (error.name === 'QuotaExceededError') {
                this.reduceCachedHistorySize();
                try {
                    localStorage.setItem('neurogenHistory', JSON.stringify(this.history));
                    return true;
                } catch (retryError) {
                    console.error('Failed to save history after reduction:', retryError);
                    return false;
                }
            }
            
            return false;
        }
    }

    /**
     * Reduce the cached history size when localStorage quota is exceeded
     */
    reduceCachedHistorySize() {
        // Cut all history arrays in half
        this.history.tasks = this.history.tasks.slice(0, Math.max(5, Math.floor(this.history.tasks.length / 2)));
        this.history.downloads = this.history.downloads.slice(0, Math.max(5, Math.floor(this.history.downloads.length / 2)));
        this.history.searches = this.history.searches.slice(0, Math.max(5, Math.floor(this.history.searches.length / 2)));
        this.history.recentFiles = this.history.recentFiles.slice(0, Math.max(5, Math.floor(this.history.recentFiles.length / 2)));
        
        console.warn('History size reduced due to storage quota limits');
    }

    /**
     * Add a task to the history
     * @param {Object} taskData - Task data to add
     */
    addTaskToHistory(taskData) {
        if (!taskData) return;
        
        try {
            // Create a sanitized task object with required fields
            const task = {
                id: taskData.task_id || taskData.id || `task-${Date.now()}`,
                type: taskData.type || 'processing',
                timestamp: taskData.timestamp || Date.now(),
                status: taskData.status || 'completed',
                filename: taskData.filename || (taskData.output_file ? this.getFileNameFromPath(taskData.output_file) : 'Unknown'),
                inputPath: taskData.input_dir || taskData.inputPath,
                outputPath: taskData.output_file || taskData.outputPath,
                stats: this.sanitizeStats(taskData.stats || {})
            };

            // Add to history (avoid duplicates)
            const existingIndex = this.history.tasks.findIndex(t => t.id === task.id);
            if (existingIndex >= 0) {
                // Update existing task
                this.history.tasks[existingIndex] = {...this.history.tasks[existingIndex], ...task};
            } else {
                // Add new task
                this.history.tasks.unshift(task);
                
                // Limit history size
                if (this.history.tasks.length > this.maxHistoryItems) {
                    this.history.tasks.pop();
                }
            }

            // Update storage
            this.saveHistoryToStorage();
            
            // Update UI if the history tab is active
            const historyTab = document.querySelector('#history.active');
            if (historyTab) {
                this.refreshHistoryDisplay();
            }

            // Emit event via eventRegistry
            if (eventRegistry) {
                eventRegistry.emit('history.updated', { 
                    type: 'task', 
                    data: task 
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to add task to history:', error);
            return false;
        }
    }

    /**
     * Add a download to the history
     * @param {Object} downloadData - Download data to add
     */
    addDownloadToHistory(downloadData) {
        if (!downloadData) return;
        
        try {
            // Create download object
            const download = {
                id: downloadData.id || downloadData.download_id || `download-${Date.now()}`,
                timestamp: downloadData.timestamp || Date.now(),
                url: downloadData.url,
                filePath: downloadData.filePath || downloadData.path,
                fileName: downloadData.fileName || this.getFileNameFromPath(downloadData.filePath || downloadData.path),
                fileSize: downloadData.fileSize || downloadData.size,
                fileType: downloadData.fileType || this.getFileTypeFromPath(downloadData.filePath || downloadData.path)
            };

            // Add to history (avoid duplicates)
            const existingIndex = this.history.downloads.findIndex(d => 
                d.filePath === download.filePath || d.id === download.id
            );
            
            if (existingIndex >= 0) {
                // Update existing download
                this.history.downloads[existingIndex] = {...this.history.downloads[existingIndex], ...download};
            } else {
                // Add new download
                this.history.downloads.unshift(download);
                
                // Limit history size
                if (this.history.downloads.length > this.maxHistoryItems) {
                    this.history.downloads.pop();
                }
            }

            // Update storage
            this.saveHistoryToStorage();
            
            // Update recent files as well
            this.addFileToRecent({
                path: download.filePath,
                name: download.fileName,
                type: download.fileType,
                size: download.fileSize,
                lastAccessed: download.timestamp
            });
            
            // Emit event via eventRegistry
            if (eventRegistry) {
                eventRegistry.emit('history.updated', { 
                    type: 'download', 
                    data: download 
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to add download to history:', error);
            return false;
        }
    }

    /**
     * Add a search to the history
     * @param {Object} searchData - Search data to add
     */
    addSearchToHistory(searchData) {
        if (!searchData || !searchData.query) return;
        
        try {
            // Create search object
            const search = {
                id: searchData.id || `search-${Date.now()}`,
                timestamp: searchData.timestamp || Date.now(),
                query: searchData.query,
                source: searchData.source || 'all',
                resultsCount: searchData.resultsCount || 0
            };

            // Add to history (avoid exact duplicates in short time periods)
            const existingIndex = this.history.searches.findIndex(s => 
                s.query === search.query && 
                s.source === search.source &&
                // Only consider it a duplicate if within last hour
                (search.timestamp - s.timestamp < 3600000)
            );
            
            if (existingIndex >= 0) {
                // Update existing search
                this.history.searches[existingIndex] = {...this.history.searches[existingIndex], ...search};
                // Move to top
                const existingSearch = this.history.searches.splice(existingIndex, 1)[0];
                this.history.searches.unshift(existingSearch);
            } else {
                // Add new search
                this.history.searches.unshift(search);
                
                // Limit history size
                if (this.history.searches.length > this.maxHistoryItems) {
                    this.history.searches.pop();
                }
            }

            // Update storage
            this.saveHistoryToStorage();
            
            // Emit event via eventRegistry
            if (eventRegistry) {
                eventRegistry.emit('history.updated', { 
                    type: 'search', 
                    data: search 
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to add search to history:', error);
            return false;
        }
    }

    /**
     * Add a file to the recent files list
     * @param {Object} fileData - File data to add
     */
    addFileToRecent(fileData) {
        if (!fileData || !fileData.path) return;
        
        try {
            // Normalize file data
            const file = {
                path: fileData.path,
                name: fileData.name || this.getFileNameFromPath(fileData.path),
                type: fileData.type || this.getFileTypeFromPath(fileData.path),
                size: fileData.size,
                lastAccessed: fileData.lastAccessed || Date.now()
            };

            // Check if file already exists in recent files
            const existingIndex = this.history.recentFiles.findIndex(f => f.path === file.path);

            if (existingIndex >= 0) {
                // Update last accessed time and move to front
                this.history.recentFiles[existingIndex].lastAccessed = file.lastAccessed;
                
                // Move to the front of the array
                const existingFile = this.history.recentFiles.splice(existingIndex, 1)[0];
                this.history.recentFiles.unshift(existingFile);
            } else {
                // Add new file to front
                this.history.recentFiles.unshift(file);
                
                // Limit history size
                if (this.history.recentFiles.length > this.maxHistoryItems) {
                    this.history.recentFiles.pop();
                }
            }

            // Update storage
            this.saveHistoryToStorage();
            
            // Emit event via eventRegistry
            if (eventRegistry) {
                eventRegistry.emit('history.updated', { 
                    type: 'recentFile', 
                    data: file 
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to add file to recent files:', error);
            return false;
        }
    }

    /**
     * Extract a filename from a path
     * @param {string} path - File path
     * @returns {string} Filename
     */
    getFileNameFromPath(path) {
        if (!path) return 'Unknown';
        
        // Handle both Windows and Unix paths
        const parts = path.split(/[\/\\]/);
        return parts[parts.length - 1] || 'Unknown';
    }

    /**
     * Determine file type from path
     * @param {string} path - File path
     * @returns {string} File type description
     */
    getFileTypeFromPath(path) {
        if (!path) return 'Unknown File';
        
        const extension = path.split('.').pop().toLowerCase();
        
        const fileTypes = {
            'pdf': 'PDF Document',
            'json': 'JSON File',
            'txt': 'Text File',
            'csv': 'CSV Spreadsheet',
            'xlsx': 'Excel Spreadsheet',
            'docx': 'Word Document',
            'png': 'PNG Image',
            'jpg': 'JPEG Image',
            'jpeg': 'JPEG Image',
            'gif': 'GIF Image',
            'mp3': 'MP3 Audio',
            'mp4': 'MP4 Video',
            'zip': 'ZIP Archive',
            'html': 'HTML Document',
            'js': 'JavaScript File',
            'py': 'Python File'
        };

        return fileTypes[extension] || 'Unknown File';
    }

    /**
     * Sanitize stats object for storage
     * @param {Object} stats - Statistics object
     * @returns {Object} Sanitized stats
     */
    sanitizeStats(stats) {
        if (!stats || typeof stats !== 'object') return {};
        
        // Create a simple copy of the stats
        const sanitized = {};
        
        // Only include primitive values and simple arrays
        for (const [key, value] of Object.entries(stats)) {
            // Skip functions, complex objects, etc.
            if (value === null || value === undefined) continue;
            
            if (['string', 'number', 'boolean'].includes(typeof value)) {
                sanitized[key] = value;
            } else if (Array.isArray(value) && value.every(item => typeof item !== 'object')) {
                sanitized[key] = [...value];
            } else if (typeof value === 'object' && Object.keys(value).length < 10) {
                // Include small objects
                try {
                    // Test if it's serializable
                    JSON.stringify(value);
                    sanitized[key] = {...value};
                } catch (e) {
                    // Skip if not serializable
                }
            }
        }
        
        return sanitized;
    }

    /**
     * Refresh the history display
     */
    refreshHistoryDisplay() {
        try {
            const historyTableBody = uiRegistry.getElement('historyTableBody');
            if (!historyTableBody) return;
            
            // Get tasks and sort by timestamp (newest first)
            const tasks = [...this.history.tasks].sort((a, b) => b.timestamp - a.timestamp);
            
            if (tasks.length === 0) {
                historyTableBody.innerHTML = `
                <tr class="history-empty-row">
                    <td colspan="5" class="text-center py-4">
                        <i class="fas fa-info-circle me-2"></i>No tasks in history
                    </td>
                </tr>`;
                return;
            }
            
            // Generate HTML for table rows
            let html = '';
            
            tasks.forEach(task => {
                // Format date
                const date = new Date(task.timestamp);
                const formattedDate = date.toLocaleString();
                
                // Set task type badge
                let typeBadge = '';
                switch (task.type) {
                    case 'file':
                        typeBadge = '<span class="badge bg-primary">File</span>';
                        break;
                    case 'playlist':
                        typeBadge = '<span class="badge bg-success">Playlist</span>';
                        break;
                    case 'scraper':
                        typeBadge = '<span class="badge bg-info">Scraper</span>';
                        break;
                    default:
                        typeBadge = '<span class="badge bg-secondary">Other</span>';
                }
                
                // Add row content
                html += `
                <tr>
                    <td>${typeBadge}</td>
                    <td>${task.filename || 'N/A'}</td>
                    <td>${formattedDate}</td>
                    <td>${this.formatTaskStats(task.stats)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" data-action="view" data-id="${task.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" data-action="open" data-id="${task.id}">
                                <i class="fas fa-folder-open"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
            });
            
            historyTableBody.innerHTML = html;
            
            // Update PDF summaries if container exists
            this.updatePDFSummaries();
        } catch (error) {
            console.error('Error refreshing history display:', error);
        }
    }

    /**
     * Format task stats for display
     * @param {Object} stats - Task statistics
     * @returns {string} Formatted stats
     */
    formatTaskStats(stats) {
        if (!stats || typeof stats !== 'object') return 'N/A';
        
        // Try to extract the most relevant stats
        const items = [];
        
        // Files processed
        if (stats.total_files && stats.processed_files) {
            items.push(`${stats.processed_files}/${stats.total_files} files`);
        } else if (stats.processed_files) {
            items.push(`${stats.processed_files} files`);
        }
        
        // PDF info
        if (stats.pdf_files) {
            items.push(`${stats.pdf_files} PDFs`);
        }
        
        // Tables
        if (stats.tables_extracted) {
            items.push(`${stats.tables_extracted} tables`);
        }
        
        // File size
        if (stats.total_bytes) {
            items.push(this.formatBytes(stats.total_bytes));
        } else if (stats.human_readable_size) {
            items.push(stats.human_readable_size);
        }
        
        // Return formatted string
        return items.length > 0 ? items.join(', ') : 'N/A';
    }

    /**
     * Format bytes to human-readable format
     * @param {number} bytes - Bytes to format
     * @returns {string} Formatted size
     */
    formatBytes(bytes) {
        // Use utils if available
        if (utils && typeof utils.formatBytes === 'function') {
            return utils.formatBytes(bytes);
        }
        
        // Fallback implementation
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Update PDF summaries in the history tab
     */
    updatePDFSummaries() {
        const container = uiRegistry.getElement('pdfSummariesContainer');
        if (!container) return;
        
        // Find PDF files in recent history
        const pdfTasks = this.history.tasks.filter(task => 
            task.outputPath && task.outputPath.toLowerCase().endsWith('.pdf') ||
            task.filename && task.filename.toLowerCase().endsWith('.pdf')
        );
        
        // Also check downloads
        const pdfDownloads = this.history.downloads.filter(download =>
            download.filePath && download.filePath.toLowerCase().endsWith('.pdf') ||
            download.fileName && download.fileName.toLowerCase().endsWith('.pdf')
        );
        
        // Combine and sort
        const allPdfs = [...pdfTasks, ...pdfDownloads]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 6); // Show up to 6 items
        
        if (allPdfs.length === 0) {
            container.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
                <i class="fas fa-file-pdf me-2"></i>No PDF summaries available
            </div>`;
            return;
        }
        
        // Get the template
        const template = document.getElementById('pdf-summary-card-template');
        if (!template) {
            console.warn('PDF summary card template not found');
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Add cards
        allPdfs.forEach(pdf => {
            // Clone template
            const card = template.content.cloneNode(true);
            
            // Fill in data
            card.querySelector('.pdf-title').textContent = pdf.filename || pdf.fileName || 'PDF Document';
            
            // Set badge type
            const badge = card.querySelector('.pdf-type-badge');
            if (badge) {
                badge.textContent = pdf.type || 'Document';
                
                // Set badge color
                const badgeClasses = {
                    'file': 'bg-primary',
                    'scraper': 'bg-info',
                    'academic_paper': 'bg-success',
                    'book': 'bg-warning',
                    'report': 'bg-secondary'
                };
                
                const classList = badgeClasses[pdf.type] || 'bg-secondary';
                badge.classList.add(classList);
            }
            
            // Set page count
            const pagesCount = card.querySelector('.pages-count');
            if (pagesCount) {
                const pages = pdf.stats?.pdf_pages_processed || 
                            pdf.stats?.page_count || 
                            pdf.stats?.pages || 
                            '?';
                pagesCount.textContent = pages;
            }
            
            // Set tables count
            const tablesCount = card.querySelector('.tables-count');
            if (tablesCount) {
                const tables = pdf.stats?.tables_extracted || 
                            pdf.stats?.tables_count || 
                            0;
                tablesCount.textContent = tables;
            }
            
            // Set file size
            const fileSize = card.querySelector('.file-size');
            if (fileSize) {
                const size = pdf.stats?.file_size_mb || 
                            pdf.fileSize ? this.formatBytes(pdf.fileSize) : 
                            '?';
                fileSize.textContent = size;
            }
            
            // Set summary
            const summary = card.querySelector('.pdf-summary');
            if (summary) {
                summary.textContent = pdf.stats?.summary || 
                                    'No summary available for this PDF.';
            }
            
            // Set up button actions
            const viewBtn = card.querySelector('.view-pdf-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => {
                    const filePath = pdf.outputPath || pdf.filePath;
                    if (filePath) {
                        this.viewPdf(filePath);
                    }
                });
            }
            
            const structureBtn = card.querySelector('.structure-pdf-btn');
            if (structureBtn) {
                structureBtn.addEventListener('click', () => {
                    const filePath = pdf.outputPath || pdf.filePath;
                    if (filePath) {
                        this.viewPdfStructure(filePath);
                    }
                });
            }
            
            const jsonBtn = card.querySelector('.view-json-btn');
            if (jsonBtn) {
                jsonBtn.addEventListener('click', () => {
                    const filePath = pdf.outputPath || pdf.filePath;
                    if (filePath) {
                        // Try to find corresponding JSON file
                        const jsonPath = filePath.replace(/\.pdf$/i, '.json');
                        this.openFile(jsonPath);
                    }
                });
            }
            
            // Add to container
            container.appendChild(card);
        });
    }

    /**
     * Filter history based on type
     * @param {string} type - Type to filter by
     */
    filterHistory(type) {
        if (!type || type === 'all') {
            // Show all rows
            document.querySelectorAll('#history-table-body tr').forEach(row => {
                row.style.display = '';
            });
            return;
        }
        
        // Hide rows that don't match
        document.querySelectorAll('#history-table-body tr').forEach(row => {
            const badgeEl = row.querySelector('.badge');
            if (badgeEl) {
                const badgeText = badgeEl.textContent.toLowerCase();
                row.style.display = badgeText === type.toLowerCase() ? '' : 'none';
            }
        });
    }

    /**
     * Search history based on query
     * @param {string} query - Search query
     */
    searchHistory(query) {
        if (!query) {
            // Show all rows
            document.querySelectorAll('#history-table-body tr').forEach(row => {
                row.style.display = '';
            });
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        
        // Hide rows that don't match
        document.querySelectorAll('#history-table-body tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(lowerQuery) ? '' : 'none';
        });
    }

    /**
     * Sort history based on method
     * @param {string} method - Sort method
     */
    sortHistory(method) {
        const historyTableBody = uiRegistry.getElement('historyTableBody');
        if (!historyTableBody) return;
        
        // Get all rows as an array
        const rows = Array.from(historyTableBody.querySelectorAll('tr'));
        if (rows.length <= 1) return; // Nothing to sort
        
        // Sort rows based on method
        switch (method) {
            case 'newest':
                // Sort by date (newest first)
                rows.sort((a, b) => {
                    const dateA = new Date(a.querySelector('td:nth-child(3)').textContent);
                    const dateB = new Date(b.querySelector('td:nth-child(3)').textContent);
                    return dateB - dateA;
                });
                break;
                
            case 'oldest':
                // Sort by date (oldest first)
                rows.sort((a, b) => {
                    const dateA = new Date(a.querySelector('td:nth-child(3)').textContent);
                    const dateB = new Date(b.querySelector('td:nth-child(3)').textContent);
                    return dateA - dateB;
                });
                break;
                
            case 'type':
                // Sort by type
                rows.sort((a, b) => {
                    const typeA = a.querySelector('td:nth-child(1)').textContent;
                    const typeB = b.querySelector('td:nth-child(1)').textContent;
                    return typeA.localeCompare(typeB);
                });
                break;
                
            case 'name':
                // Sort by filename
                rows.sort((a, b) => {
                    const nameA = a.querySelector('td:nth-child(2)').textContent;
                    const nameB = b.querySelector('td:nth-child(2)').textContent;
                    return nameA.localeCompare(nameB);
                });
                break;
                
            default:
                return; // Unknown sort method
        }
        
        // Clear table and add sorted rows
        historyTableBody.innerHTML = '';
        rows.forEach(row => historyTableBody.appendChild(row));
    }

    /**
     * Clear all history
     */
    clearHistory() {
        // Show confirmation dialog
        if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
            // Reset history
            this.history = {
                tasks: [],
                downloads: [],
                searches: [],
                recentFiles: []
            };
            
            // Update storage
            this.saveHistoryToStorage();
            
            // Update display
            this.refreshHistoryDisplay();
            
            // Show toast notification if UI module is available
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('History Cleared', 'All history has been cleared', 'info');
            }
            
            // Emit event via eventRegistry
            if (eventRegistry) {
                eventRegistry.emit('history.cleared');
            }
        }
    }

    /**
     * Show task details in a modal
     * @param {string} taskId - Task ID
     */
    showTaskDetails(taskId) {
        if (!taskId) return;
        
        try {
            // Find the task
            const task = this.history.tasks.find(t => t.id === taskId);
            if (!task) {
                console.warn(`Task not found: ${taskId}`);
                return;
            }
            
            // Find or create modal
            let modal = document.getElementById('task-details-modal');
            if (!modal) {
                console.warn('Task details modal not found in the DOM');
                return;
            }
            
            // Format date
            const date = new Date(task.timestamp);
            const formattedDate = date.toLocaleString();
            
            // Populate modal content
            const contentEl = document.getElementById('task-details-content');
            if (contentEl) {
                // Create details HTML
                let detailsHtml = `
                    <div class="task-details">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Type:</strong> ${task.type || 'Unknown'}
                            </div>
                            <div class="col-md-6">
                                <strong>Created:</strong> ${formattedDate}
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>File:</strong> ${task.filename || 'N/A'}
                            </div>
                            <div class="col-md-6">
                                <strong>Status:</strong> ${task.status || 'Completed'}
                            </div>
                        </div>
                `;
                
                // Add stats if available
                if (task.stats && Object.keys(task.stats).length > 0) {
                    detailsHtml += `
                        <div class="mt-3">
                            <h6>Statistics</h6>
                            <div class="p-3 bg-light rounded">
                                <table class="table table-sm mb-0">
                                    <tbody>
                    `;
                    
                    // Add each stat
                    for (const [key, value] of Object.entries(task.stats)) {
                        if (typeof value === 'object') continue;
                        
                        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        
                        detailsHtml += `
                            <tr>
                                <td>${formattedKey}</td>
                                <td>${value}</td>
                            </tr>
                        `;
                    }
                    
                    detailsHtml += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
                
                // Add output path if available
                if (task.outputPath) {
                    detailsHtml += `
                        <div class="mt-3">
                            <h6>Output File</h6>
                            <div class="p-3 bg-light rounded">
                                ${task.outputPath}
                            </div>
                        </div>
                    `;
                }
                
                // Close the container
                detailsHtml += '</div>';
                
                // Set content
                contentEl.innerHTML = detailsHtml;
            }
            
            // Set up open file button
            const openButton = document.getElementById('open-task-file-btn');
            if (openButton) {
                openButton.onclick = () => this.openTaskOutput(taskId);
                
                // Enable/disable based on whether there's an output file
                openButton.disabled = !task.outputPath;
            }
            
            // Show modal using Bootstrap
            const bsModal = bootstrap && bootstrap.Modal ? new bootstrap.Modal(modal) : null;
            if (bsModal) {
                bsModal.show();
            } else {
                // Fallback if Bootstrap is not available
                modal.classList.add('show');
                modal.style.display = 'block';
                document.body.classList.add('modal-open');
                
                // Add backdrop if needed
                if (!document.querySelector('.modal-backdrop')) {
                    const backdrop = document.createElement('div');
                    backdrop.className = 'modal-backdrop fade show';
                    document.body.appendChild(backdrop);
                }
            }
        } catch (error) {
            console.error('Error showing task details:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Open the output file of a task
     * @param {string} taskId - Task ID
     */
    openTaskOutput(taskId) {
        if (!taskId) return;
        
        try {
            // Find the task
            const task = this.history.tasks.find(t => t.id === taskId);
            if (!task || !task.outputPath) {
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast('Error', 'Output file not found for this task', 'error');
                }
                return;
            }
            
            // Open the file
            this.openFile(task.outputPath);
        } catch (error) {
            console.error('Error opening task output:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Open a file using the most appropriate method
     * @param {string} filePath - Path to the file
     */
    async openFile(filePath) {
        if (!filePath) return;
        
        try {
            // First, try using the browser's file handler
            if (typeof window.showOpenFilePicker === 'function' && window.moduleInstances.fileHandler) {
                const result = await window.moduleInstances.fileHandler.openFile(filePath);
                if (result) {
                    return;
                }
            }
            
            // Different methods based on file type
            const extension = filePath.split('.').pop().toLowerCase();
            
            // JSON files
            if (extension === 'json') {
                // Request from server
                const response = await fetch(`/api/get-file?path=${encodeURIComponent(filePath)}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }
                
                // Get JSON content
                const json = await response.json();
                
                // Display in a modal or a new tab
                this.displayJsonContent(json, filePath);
                return;
            }
            
            // PDF files
            if (extension === 'pdf') {
                // Open PDF viewer
                this.viewPdf(filePath);
                return;
            }
            
            // Text files
            if (['txt', 'md', 'csv', 'js', 'py', 'html', 'css'].includes(extension)) {
                // Request from server
                const response = await fetch(`/api/get-file?path=${encodeURIComponent(filePath)}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }
                
                // Get text content
                const text = await response.text();
                
                // Display in a modal
                this.displayTextContent(text, filePath, extension);
                return;
            }
            
            // For other file types, try to download or open via API
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast('Opening File', `Opening ${filePath}`, 'info');
            }
            
            // Try opening file through backend API
            const response = await fetch('/api/open-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to open file via API: ${response.statusText}`);
            }
            
            // Record the file access
            this.addFileToRecent({
                path: filePath,
                name: this.getFileNameFromPath(filePath),
                lastAccessed: Date.now()
            });
            
        } catch (error) {
            console.error('Error opening file:', error);
            errorHandler.handleError(error);
            
            // Fallback: try to download the file
            try {
                window.open(`/api/download-file?path=${encodeURIComponent(filePath)}`, '_blank');
            } catch (downloadError) {
                console.error('Error downloading file:', downloadError);
            }
        }
    }

    /**
     * Display JSON content in a modal
     * @param {Object} json - JSON content
     * @param {string} filePath - Path to the file
     */
    displayJsonContent(json, filePath) {
        try {
            // Use UI module if available
            if (window.ui && typeof window.ui.showModal === 'function') {
                const fileName = this.getFileNameFromPath(filePath);
                
                window.ui.showModal({
                    title: `JSON Viewer: ${fileName}`,
                    content: `
                        <div class="json-viewer">
                            <pre class="language-json">${JSON.stringify(json, null, 2)}</pre>
                        </div>
                    `,
                    size: 'large',
                    buttons: [
                        {
                            text: 'Close',
                            type: 'btn-secondary'
                        },
                        {
                            text: 'Download',
                            type: 'btn-primary',
                            handler: () => {
                                // Create download link
                                const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = fileName;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }
                        }
                    ]
                });
                
                // Apply syntax highlighting if Prism.js is available
                if (window.Prism) {
                    Prism.highlightAll();
                }
                
                return;
            }
            
            // Fallback: Open JSON in a new window
            const jsonString = JSON.stringify(json, null, 2);
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>JSON Viewer: ${this.getFileNameFromPath(filePath)}</title>
                        <style>
                            body { font-family: monospace; white-space: pre; }
                        </style>
                    </head>
                    <body>${jsonString}</body>
                    </html>
                `);
                newWindow.document.close();
            } else {
                // If popup blocked, try to download instead
                this.downloadTextAsFile(jsonString, filePath);
            }
        } catch (error) {
            console.error('Error displaying JSON content:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Display text content in a modal
     * @param {string} text - Text content
     * @param {string} filePath - Path to the file
     * @param {string} extension - File extension
     */
    displayTextContent(text, filePath, extension) {
        try {
            // Use UI module if available
            if (window.ui && typeof window.ui.showModal === 'function') {
                const fileName = this.getFileNameFromPath(filePath);
                
                window.ui.showModal({
                    title: `Text Viewer: ${fileName}`,
                    content: `
                        <div class="text-viewer">
                            <pre class="language-${extension}">${text}</pre>
                        </div>
                    `,
                    size: 'large',
                    buttons: [
                        {
                            text: 'Close',
                            type: 'btn-secondary'
                        },
                        {
                            text: 'Download',
                            type: 'btn-primary',
                            handler: () => {
                                this.downloadTextAsFile(text, fileName);
                            }
                        }
                    ]
                });
                
                // Apply syntax highlighting if Prism.js is available
                if (window.Prism) {
                    Prism.highlightAll();
                }
                
                return;
            }
            
            // Fallback: Open text in a new window
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Text Viewer: ${this.getFileNameFromPath(filePath)}</title>
                        <style>
                            body { font-family: monospace; white-space: pre; }
                        </style>
                    </head>
                    <body>${text}</body>
                    </html>
                `);
                newWindow.document.close();
            } else {
                // If popup blocked, try to download instead
                this.downloadTextAsFile(text, filePath);
            }
        } catch (error) {
            console.error('Error displaying text content:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Download text content as a file
     * @param {string} content - Text content
     * @param {string} filename - File name
     */
    downloadTextAsFile(content, filename) {
        try {
            // Create a blob
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = this.getFileNameFromPath(filename);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading text as file:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * View a PDF file
     * @param {string} filePath - Path to the PDF file
     */
    viewPdf(filePath) {
        try {
            // If a PDF viewer modal exists, use it
            const pdfViewerModal = document.getElementById('pdfViewerModal');
            if (pdfViewerModal && window.pdfjsLib) {
                // Get container and clear it
                const pdfContainer = document.getElementById('pdf-viewer-container');
                if (pdfContainer) {
                    pdfContainer.innerHTML = '';
                    
                    // Set modal title
                    const modalTitle = pdfViewerModal.querySelector('.modal-title');
                    if (modalTitle) {
                        modalTitle.textContent = `PDF Viewer: ${this.getFileNameFromPath(filePath)}`;
                    }
                    
                    // Set download button
                    const downloadBtn = document.getElementById('download-pdf-btn');
                    if (downloadBtn) {
                        downloadBtn.onclick = () => {
                            window.open(`/api/download-file?path=${encodeURIComponent(filePath)}`, '_blank');
                        };
                    }
                    
                    // Show loading indicator
                    const loadingIndicator = document.createElement('div');
                    loadingIndicator.className = 'text-center p-5';
                    loadingIndicator.innerHTML = `
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading PDF...</span>
                        </div>
                        <p class="mt-3">Loading PDF...</p>
                    `;
                    pdfContainer.appendChild(loadingIndicator);
                    
                    // Show the modal
                    const modal = new bootstrap.Modal(pdfViewerModal);
                    modal.show();
                    
                    // Load the PDF
                    this.loadPdfIntoViewer(filePath, pdfContainer);
                    
                    // Record the file access
                    this.addFileToRecent({
                        path: filePath,
                        name: this.getFileNameFromPath(filePath),
                        type: 'PDF Document',
                        lastAccessed: Date.now()
                    });
                    
                    return;
                }
            }
            
            // Fallback: Open PDF directly
            window.open(`/api/view-pdf?path=${encodeURIComponent(filePath)}`, '_blank');
            
            // Record the file access
            this.addFileToRecent({
                path: filePath,
                name: this.getFileNameFromPath(filePath),
                type: 'PDF Document',
                lastAccessed: Date.now()
            });
        } catch (error) {
            console.error('Error viewing PDF:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Load a PDF into the viewer
     * @param {string} filePath - Path to the PDF file
     * @param {HTMLElement} container - Container element
     */
    async loadPdfIntoViewer(filePath, container) {
        try {
            // Ensure PDF.js is available
            if (!window.pdfjsLib) {
                throw new Error('PDF.js library not available');
            }
            
            // Clear container
            container.innerHTML = '';
            
            // Get PDF URL
            const pdfUrl = `/api/download-file?path=${encodeURIComponent(filePath)}`;
            
            // Load the PDF document
            const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;
            
            // Create PDF viewer
            const viewer = document.createElement('div');
            viewer.className = 'pdf-viewer';
            container.appendChild(viewer);
            
            // Add page navigation controls
            const controls = document.createElement('div');
            controls.className = 'pdf-controls d-flex justify-content-between align-items-center bg-light p-2 sticky-top';
            controls.innerHTML = `
                <div class="d-flex align-items-center">
                    <button class="btn btn-sm btn-outline-primary me-2" id="prev-page">
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    <button class="btn btn-sm btn-outline-primary" id="next-page">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="d-flex align-items-center">
                    <span>Page <span id="page-num">1</span> of <span id="page-count">${pdf.numPages}</span></span>
                </div>
                <div class="d-flex align-items-center">
                    <button class="btn btn-sm btn-outline-secondary me-2" id="zoom-out">
                        <i class="fas fa-search-minus"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" id="zoom-in">
                        <i class="fas fa-search-plus"></i>
                    </button>
                </div>
            `;
            viewer.appendChild(controls);
            
            // Add canvas for PDF rendering
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'pdf-container mt-3';
            viewer.appendChild(pdfContainer);
            
            // Render variables
            let currentPage = 1;
            let scale = 1.0;
            
            // Function to render a page
            const renderPage = async (pageNum) => {
                // Get page
                const page = await pdf.getPage(pageNum);
                
                // Create canvas
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                
                // Set dimensions based on viewport
                const viewport = page.getViewport({ scale });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                // Clear container and add canvas
                pdfContainer.innerHTML = '';
                pdfContainer.appendChild(canvas);
                
                // Render PDF page
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                // Update page number display
                document.getElementById('page-num').textContent = pageNum;
            };
            
            // Render the first page
            await renderPage(currentPage);
            
            // Add event listeners for controls
            document.getElementById('prev-page').addEventListener('click', async () => {
                if (currentPage <= 1) return;
                currentPage--;
                await renderPage(currentPage);
            });
            
            document.getElementById('next-page').addEventListener('click', async () => {
                if (currentPage >= pdf.numPages) return;
                currentPage++;
                await renderPage(currentPage);
            });
            
            document.getElementById('zoom-out').addEventListener('click', async () => {
                if (scale <= 0.5) return;
                scale -= 0.1;
                await renderPage(currentPage);
            });
            
            document.getElementById('zoom-in').addEventListener('click', async () => {
                if (scale >= 2.0) return;
                scale += 0.1;
                await renderPage(currentPage);
            });
            
        } catch (error) {
            console.error('Error loading PDF into viewer:', error);
            // Show error in container
            container.innerHTML = `
                <div class="alert alert-danger m-3">
                    <h5>Error Loading PDF</h5>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="window.open('/api/download-file?path=${encodeURIComponent(filePath)}', '_blank')">
                        Try Direct Download
                    </button>
                </div>
            `;
        }
    }

    /**
     * View the structure of a PDF file
     * @param {string} filePath - Path to the PDF file
     */
    async viewPdfStructure(filePath) {
        try {
            // Request structure analysis from server
            const response = await fetch(`/api/analyze-pdf-structure?path=${encodeURIComponent(filePath)}`);
            if (!response.ok) {
                throw new Error(`Failed to analyze PDF structure: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Use UI module if available
            if (window.ui && typeof window.ui.showModal === 'function') {
                const fileName = this.getFileNameFromPath(filePath);
                
                let structureHtml = `
                    <div class="pdf-structure">
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-header">Document Information</div>
                                    <div class="card-body">
                                        <table class="table table-sm">
                                            <tbody>
                                                <tr>
                                                    <td>Document Type</td>
                                                    <td><span class="badge bg-${this.getDocTypeColor(data.document_type)}">${data.document_type || 'Unknown'}</span></td>
                                                </tr>
                                                <tr>
                                                    <td>Page Count</td>
                                                    <td>${data.page_count || 'Unknown'}</td>
                                                </tr>
                                                <tr>
                                                    <td>File Size</td>
                                                    <td>${data.file_size_mb ? `${data.file_size_mb} MB` : 'Unknown'}</td>
                                                </tr>
                                                <tr>
                                                    <td>Has Scanned Content</td>
                                                    <td>${data.has_scanned_content ? 'Yes' : 'No'}</td>
                                                </tr>
                                                <tr>
                                                    <td>Tables Count</td>
                                                    <td>${data.tables_count || 0}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-header">Metadata</div>
                                    <div class="card-body">
                                        <table class="table table-sm">
                                            <tbody>
                `;
                
                // Add metadata if available
                if (data.metadata && Object.keys(data.metadata).length > 0) {
                    for (const [key, value] of Object.entries(data.metadata)) {
                        if (!value) continue;
                        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        structureHtml += `
                            <tr>
                                <td>${formattedKey}</td>
                                <td>${value}</td>
                            </tr>
                        `;
                    }
                } else {
                    structureHtml += `
                        <tr>
                            <td colspan="2" class="text-center text-muted">No metadata available</td>
                        </tr>
                    `;
                }
                
                structureHtml += `
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                `;
                
                // Add sections if available
                if (data.section_titles && data.section_titles.length > 0) {
                    structureHtml += `
                        <div class="card mb-4">
                            <div class="card-header">Document Structure</div>
                            <div class="card-body">
                                <ul class="list-group">
                    `;
                    
                    data.section_titles.forEach(title => {
                        structureHtml += `<li class="list-group-item">${title}</li>`;
                    });
                    
                    structureHtml += `
                                </ul>
                            </div>
                        </div>
                    `;
                }
                
                // Add tables info if available
                if (data.tables_info && data.tables_info.length > 0) {
                    structureHtml += `
                        <div class="card">
                            <div class="card-header">Tables</div>
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Table ID</th>
                                                <th>Page</th>
                                                <th>Rows</th>
                                                <th>Columns</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;
                    
                    data.tables_info.forEach(table => {
                        structureHtml += `
                            <tr>
                                <td>${table.table_id || 'Unknown'}</td>
                                <td>${table.page || 'Unknown'}</td>
                                <td>${table.rows || 0}</td>
                                <td>${table.columns || 0}</td>
                            </tr>
                        `;
                    });
                    
                    structureHtml += `
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                // Show the modal with the structure info
                window.ui.showModal({
                    title: `PDF Structure: ${fileName}`,
                    content: structureHtml,
                    size: 'large',
                    buttons: [
                        {
                            text: 'Close',
                            type: 'btn-secondary'
                        },
                        {
                            text: 'View PDF',
                            type: 'btn-primary',
                            handler: () => this.viewPdf(filePath)
                        }
                    ]
                });
                
                return;
            }
            
            // Fallback if UI module is not available: show alert
            alert(`PDF Structure Analysis for ${this.getFileNameFromPath(filePath)}:\n\n` +
                `Document Type: ${data.document_type || 'Unknown'}\n` +
                `Pages: ${data.page_count || 'Unknown'}\n` +
                `Tables: ${data.tables_count || 0}`);
            
        } catch (error) {
            console.error('Error viewing PDF structure:', error);
            errorHandler.handleError(error);
        }
    }

    /**
     * Get badge color for document type
     * @param {string} docType - Document type
     * @returns {string} Bootstrap color class
     */
    getDocTypeColor(docType) {
        if (!docType) return 'secondary';
        
        const typeColors = {
            'academic_paper': 'success',
            'report': 'info',
            'scan': 'warning',
            'book': 'primary',
            'presentation': 'danger',
            'article': 'info'
        };
        
        return typeColors[docType] || 'secondary';
    }

    /**
     * Get recent tasks
     * @param {number} limit - Maximum number of tasks to return
     * @returns {Array} Recent tasks
     */
    getRecentTasks(limit = 5) {
        return this.history.tasks.slice(0, limit);
    }

    /**
     * Get recent downloads
     * @param {number} limit - Maximum number of downloads to return
     * @returns {Array} Recent downloads
     */
    getRecentDownloads(limit = 5) {
        return this.history.downloads.slice(0, limit);
    }

    /**
     * Get recent searches
     * @param {number} limit - Maximum number of searches to return
     * @returns {Array} Recent searches
     */
    getRecentSearches(limit = 5) {
        return this.history.searches.slice(0, limit);
    }

    /**
     * Get recent files
     * @param {number} limit - Maximum number of files to return
     * @returns {Array} Recent files
     */
    getRecentFiles(limit = 5) {
        return this.history.recentFiles.slice(0, limit);
    }

    /**
     * Search history for a term
     * @param {string} term - Search term
     * @returns {Object} Search results by category
     */
    searchAllHistory(term) {
        if (!term) {
            return {
                tasks: [],
                downloads: [],
                searches: [],
                recentFiles: []
            };
        }
        
        const lowerTerm = term.toLowerCase();
        
        return {
            tasks: this.history.tasks.filter(task => {
                return (task.filename && task.filename.toLowerCase().includes(lowerTerm)) ||
                    (task.outputPath && task.outputPath.toLowerCase().includes(lowerTerm)) ||
                    (task.type && task.type.toLowerCase().includes(lowerTerm));
            }),
            
            downloads: this.history.downloads.filter(download => {
                return (download.fileName && download.fileName.toLowerCase().includes(lowerTerm)) ||
                    (download.url && download.url.toLowerCase().includes(lowerTerm)) ||
                    (download.fileType && download.fileType.toLowerCase().includes(lowerTerm));
            }),
            
            searches: this.history.searches.filter(search => {
                return (search.query && search.query.toLowerCase().includes(lowerTerm)) ||
                    (search.source && search.source.toLowerCase().includes(lowerTerm));
            }),
            
            recentFiles: this.history.recentFiles.filter(file => {
                return (file.name && file.name.toLowerCase().includes(lowerTerm)) ||
                    (file.path && file.path.toLowerCase().includes(lowerTerm)) ||
                    (file.type && file.type.toLowerCase().includes(lowerTerm));
            })
        };
    }

    }

// Create the singleton instance
const historyManager = new HistoryManager();

// Export the singleton for other modules to use
export default historyManager;

// Export individual methods for direct import
export const getRecentTasks = historyManager.getRecentTasks.bind(historyManager);
export const getRecentDownloads = historyManager.getRecentDownloads.bind(historyManager);
export const getRecentSearches = historyManager.getRecentSearches.bind(historyManager);
export const getRecentFiles = historyManager.getRecentFiles.bind(historyManager);