/**
 * helpMode.js
 * Provides interactive help tooltips and contextual guidance for the UI
 * Implements help overlay system that explains UI components
 */

import { registerEvents } from '../core/eventManager.js';
import { registerElement, getElement, getAllElements } from '../core/uiRegistry.js';
import { getState, setState } from '../core/stateManager.js';

class HelpMode {
    constructor() {
        this.helpModeActive = false;
        this.helpTooltips = new Map(); // Maps element IDs to their help messages
        this.currentTooltips = [];
        this.initialize();
    }

    initialize() {
        this.registerUIElements();
        this.setupEventListeners();
        this.defineHelpMessages();
    }

    registerUIElements() {
        registerElement('helpModeToggle', '#help-mode-toggle');
        registerElement('helpOverlay', '#help-overlay');
        registerElement('helpTooltipContainer', '#help-tooltip-container');
    }

    setupEventListeners() {
        registerEvents({
            'click:helpModeToggle': () => this.toggleHelpMode(),
            'mouseenter:.help-trigger': (e) => this.showHelpTooltip(e),
            'mouseleave:.help-trigger': () => this.hideHelpTooltip()
        });

        // Close help mode when Escape key is pressed
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.helpModeActive) {
                this.disableHelpMode();
            }
        });
    }

    defineHelpMessages() {
        // Define help messages for various UI elements
        this.helpTooltips = new Map([
            // Main navigation
            ['file-processing-tab', 'Process files from your local system and convert them to structured JSON.'],
            ['playlists-tab', 'Download and process YouTube playlists and videos.'],
            ['scraper-tab', 'Extract content from websites and download PDFs.'],
            ['academic-tab', 'Search and download academic papers from various sources.'],
            
            // File processing
            ['input-dir-select', 'Select a directory containing the files you want to process.'],
            ['output-file-input', 'Specify where the output JSON file should be saved.'],
            ['process-btn', 'Start processing the files in the selected directory.'],
            
            // Playlist downloader
            ['playlist-url-input', 'Enter YouTube playlist URLs (one per line).'],
            ['playlist-root-dir', 'Select a directory where downloaded videos will be saved.'],
            ['playlist-download-btn', 'Start downloading and processing the playlists.'],
            
            // Scraper
            ['scraper-url-input', 'Enter a website URL to scrape content from.'],
            ['scraper-setting-select', 'Select what type of content to extract from the URL.'],
            ['scraper-pdf-processing', 'Configure options for processing downloaded PDFs.'],
            ['scraper-start-btn', 'Start the scraping process with the current settings.'],
            
            // Academic search
            ['academic-query-input', 'Enter keywords to search for academic papers.'],
            ['academic-source-select', 'Select which academic source to search.'],
            ['academic-search-btn', 'Start the academic search with the current query.'],
            
            // PDF processing
            ['pdf-file-input', 'Select a PDF file to process or analyze.'],
            ['pdf-extract-tables', 'Enable to extract tables from the PDF.'],
            ['pdf-use-ocr', 'Enable to use Optical Character Recognition for scanned PDFs.'],
            ['pdf-process-btn', 'Start processing the selected PDF file.'],
            
            // General actions
            ['theme-toggle', 'Switch between light and dark themes.'],
            ['help-mode-toggle', 'Toggle help mode to see tooltips explaining UI elements.']
        ]);
    }

    toggleHelpMode() {
        if (this.helpModeActive) {
            this.disableHelpMode();
        } else {
            this.enableHelpMode();
        }
    }

    enableHelpMode() {
        this.helpModeActive = true;
        setState('helpModeActive', true);
        
        // Update toggle button state
        const helpToggle = getElement('helpModeToggle');
        if (helpToggle) {
            helpToggle.classList.add('active');
            helpToggle.setAttribute('aria-pressed', 'true');
        }
        
        // Show help overlay
        const helpOverlay = getElement('helpOverlay');
        if (helpOverlay) {
            helpOverlay.style.display = 'block';
        } else {
            // Create overlay if it doesn't exist
            this.createHelpOverlay();
        }
        
        // Add help triggers to all elements with help messages
        this.addHelpTriggers();
        
        // Broadcast event
        document.dispatchEvent(new CustomEvent('helpModeEnabled'));
    }

    disableHelpMode() {
        this.helpModeActive = false;
        setState('helpModeActive', false);
        
        // Update toggle button state
        const helpToggle = getElement('helpModeToggle');
        if (helpToggle) {
            helpToggle.classList.remove('active');
            helpToggle.setAttribute('aria-pressed', 'false');
        }
        
        // Hide help overlay
        const helpOverlay = getElement('helpOverlay');
        if (helpOverlay) {
            helpOverlay.style.display = 'none';
        }
        
        // Remove help triggers
        this.removeHelpTriggers();
        
        // Hide any active tooltips
        this.hideHelpTooltip();
        
        // Broadcast event
        document.dispatchEvent(new CustomEvent('helpModeDisabled'));
    }

    createHelpOverlay() {
        // Create overlay element
        const overlay = document.createElement('div');
        overlay.id = 'help-overlay';
        overlay.className = 'help-overlay';
        
        // Create tooltip container
        const tooltipContainer = document.createElement('div');
        tooltipContainer.id = 'help-tooltip-container';
        tooltipContainer.className = 'help-tooltip-container';
        
        // Add elements to document
        document.body.appendChild(overlay);
        document.body.appendChild(tooltipContainer);
        
        // Register the elements
        registerElement('helpOverlay', '#help-overlay');
        registerElement('helpTooltipContainer', '#help-tooltip-container');
        
        // Add click handler to close help mode when clicking outside
        overlay.addEventListener('click', () => this.disableHelpMode());
    }

    addHelpTriggers() {
        // Add help trigger class to all elements with help messages
        for (const [elementId] of this.helpTooltips) {
            const element = document.getElementById(elementId);
            if (element) {
                element.classList.add('help-trigger');
                element.setAttribute('data-help-id', elementId);
            }
        }
    }

    removeHelpTriggers() {
        // Remove help trigger class from all elements
        const triggers = document.querySelectorAll('.help-trigger');
        triggers.forEach(trigger => {
            trigger.classList.remove('help-trigger');
        });
    }

    showHelpTooltip(event) {
        if (!this.helpModeActive) return;
        
        const target = event.target.closest('.help-trigger');
        if (!target) return;
        
        const helpId = target.getAttribute('data-help-id') || target.id;
        const helpMessage = this.helpTooltips.get(helpId);
        
        if (!helpMessage) return;
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'help-tooltip';
        tooltip.innerHTML = `
            <div class="help-tooltip-content">
                <p>${helpMessage}</p>
            </div>
            <div class="help-tooltip-arrow"></div>
        `;
        
        // Add to container
        const container = getElement('helpTooltipContainer');
        if (container) {
            container.innerHTML = '';
            container.appendChild(tooltip);
            this.positionTooltip(tooltip, target);
        }
        
        // Track current tooltip
        this.currentTooltips.push(tooltip);
    }

    hideHelpTooltip() {
        // Remove all current tooltips
        const container = getElement('helpTooltipContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        this.currentTooltips = [];
    }

    positionTooltip(tooltip, target) {
        if (!tooltip || !target) return;
        
        // Get element position
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Default position is above the element
        let top = targetRect.top - tooltipRect.height - 10;
        let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        
        // Check if tooltip would be off-screen
        if (top < 10) {
            // Position below instead
            top = targetRect.bottom + 10;
            tooltip.classList.add('tooltip-below');
        } else {
            tooltip.classList.remove('tooltip-below');
        }
        
        // Ensure tooltip is not off-screen horizontally
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        
        // Set position
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    // Function to show a guided tour
    startGuidedTour(tourId) {
        // Different tours can be defined here
        const tours = {
            'welcome': [
                { elementId: 'file-processing-tab', message: 'Start here to process local files.' },
                { elementId: 'playlists-tab', message: 'Download and process YouTube content.' },
                { elementId: 'scraper-tab', message: 'Extract content from websites.' },
                { elementId: 'academic-tab', message: 'Search for academic papers.' }
            ],
            'file-processing': [
                { elementId: 'input-dir-select', message: 'First, select your input directory.' },
                { elementId: 'output-file-input', message: 'Then specify where to save the output.' },
                { elementId: 'process-btn', message: 'Finally, click here to start processing.' }
            ],
            'scraper': [
                { elementId: 'scraper-url-input', message: 'Enter the URL you want to scrape.' },
                { elementId: 'scraper-setting-select', message: 'Select what type of content to extract.' },
                { elementId: 'scraper-pdf-processing', message: 'Configure PDF processing options if needed.' },
                { elementId: 'scraper-start-btn', message: 'Start the scraping process.' }
            ]
        };
        
        // Get the tour steps
        const tour = tours[tourId];
        if (!tour) return;
        
        // Enable help mode
        this.enableHelpMode();
        
        // Start the tour
        this.currentTourSteps = tour;
        this.currentTourStep = 0;
        this.showTourStep();
    }

    showTourStep() {
        if (!this.currentTourSteps || this.currentTourStep >= this.currentTourSteps.length) {
            // Tour complete
            this.endTour();
            return;
        }
        
        // Get current step
        const step = this.currentTourSteps[this.currentTourStep];
        
        // Find the target element
        const target = document.getElementById(step.elementId);
        if (!target) {
            // Skip to next step if element not found
            this.currentTourStep++;
            this.showTourStep();
            return;
        }
        
        // Create tour tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'help-tooltip tour-tooltip';
        tooltip.innerHTML = `
            <div class="help-tooltip-content">
                <p>${step.message}</p>
                <div class="tour-controls">
                    <button class="btn btn-sm btn-outline tour-prev" ${this.currentTourStep > 0 ? '' : 'disabled'}>Previous</button>
                    <span class="tour-progress">${this.currentTourStep + 1}/${this.currentTourSteps.length}</span>
                    <button class="btn btn-sm btn-primary tour-next">
                        ${this.currentTourStep < this.currentTourSteps.length - 1 ? 'Next' : 'Finish'}
                    </button>
                </div>
            </div>
            <div class="help-tooltip-arrow"></div>
        `;
        
        // Add to container
        const container = getElement('helpTooltipContainer');
        if (container) {
            container.innerHTML = '';
            container.appendChild(tooltip);
            this.positionTooltip(tooltip, target);
        }
        
        // Highlight the target element
        target.classList.add('help-highlight');
        
        // Add event listeners to buttons
        const prevBtn = tooltip.querySelector('.tour-prev');
        const nextBtn = tooltip.querySelector('.tour-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevTourStep());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextTourStep());
        }
        
        // Track current tooltip
        this.currentTooltips.push(tooltip);
    }

    nextTourStep() {
        // Clear current step
        this.clearTourStep();
        
        // Move to next step
        this.currentTourStep++;
        this.showTourStep();
    }

    prevTourStep() {
        // Clear current step
        this.clearTourStep();
        
        // Move to previous step
        this.currentTourStep--;
        this.showTourStep();
    }

    clearTourStep() {
        // Remove highlight from any elements
        const highlighted = document.querySelectorAll('.help-highlight');
        highlighted.forEach(el => el.classList.remove('help-highlight'));
        
        // Clear tooltips
        this.hideHelpTooltip();
    }

    endTour() {
        this.clearTourStep();
        this.currentTourSteps = null;
        this.currentTourStep = 0;
        
        // Show completion message
        const container = getElement('helpTooltipContainer');
        if (container) {
            const message = document.createElement('div');
            message.className = 'help-tooltip tour-complete';
            message.innerHTML = `
                <div class="help-tooltip-content">
                    <h4>Tour Complete</h4>
                    <p>You can always enable help mode again using the help button.</p>
                    <button class="btn btn-primary tour-close">Close</button>
                </div>
            `;
            
            container.innerHTML = '';
            container.appendChild(message);
            
            // Position in center of screen
            message.style.top = '50%';
            message.style.left = '50%';
            message.style.transform = 'translate(-50%, -50%)';
            
            // Add close button handler
            const closeBtn = message.querySelector('.tour-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.disableHelpMode();
                });
            }
        }
    }

    // Add a contextual help method that can be called from other modules
    showContextualHelp(elementId, customMessage) {
        // Enable help mode temporarily
        const wasActive = this.helpModeActive;
        if (!wasActive) {
            this.enableHelpMode();
        }
        
        // Find the target element
        const target = document.getElementById(elementId);
        if (!target) return;
        
        // Get help message (custom or from defined messages)
        const message = customMessage || this.helpTooltips.get(elementId);
        if (!message) return;
        
        // Create and show tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'help-tooltip contextual-tooltip';
        tooltip.innerHTML = `
            <div class="help-tooltip-content">
                <p>${message}</p>
                <button class="btn btn-sm btn-outline-secondary tooltip-close">Close</button>
            </div>
            <div class="help-tooltip-arrow"></div>
        `;
        
        // Add to container
        const container = getElement('helpTooltipContainer');
        if (container) {
            container.innerHTML = '';
            container.appendChild(tooltip);
            this.positionTooltip(tooltip, target);
        }
        
        // Highlight the target element
        target.classList.add('help-highlight');
        
        // Add event listener to close button
        const closeBtn = tooltip.querySelector('.tooltip-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                target.classList.remove('help-highlight');
                this.hideHelpTooltip();
                
                // Disable help mode if it wasn't active before
                if (!wasActive) {
                    this.disableHelpMode();
                }
            });
        }
        
        // Auto-close after a delay
        setTimeout(() => {
            if (tooltip.parentNode) {
                target.classList.remove('help-highlight');
                this.hideHelpTooltip();
                
                // Disable help mode if it wasn't active before
                if (!wasActive) {
                    this.disableHelpMode();
                }
            }
        }, 8000);
        
        // Track current tooltip
        this.currentTooltips.push(tooltip);
    }
}

const helpMode = new HelpMode();

export default helpMode;

// Export default module
export default tours;
