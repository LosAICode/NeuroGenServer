/**
 * Debug Tools Module
 * 
 * Provides development tools for debugging and monitoring application performance.
 * Includes console logging, state inspection, performance metrics, and Socket.IO monitoring.
 * 
 * Features:
 * - Debug console for JavaScript execution
 * - State inspection and visualization
 * - Socket.IO event monitoring and logging
 * - Network request monitoring
 * - Performance metrics tracking
 * - UI themes for better readability
 */

// Import modules using compatible import patterns
import { registerEvents } from '../core/eventManager.js';
import { getElement } from '../core/uiRegistry.js';
import { getState } from '../core/stateManager.js';

/**
 * Debug tools for development and monitoring
 */
class DebugTools {
    constructor() {
        this.isDebugMode = false;
        this.socketEventsLog = [];
        this.consoleLog = [];
        this.maxLogEntries = 100;
        this.isMonitoringNetwork = false;
        this.originalFetch = window.fetch;
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
        this.originalConsoleWarn = console.warn;
        this.initialize();
    }

    /**
     * Initialize debug tools
     */
    initialize() {
        // Check if debug mode is enabled via URL parameter or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        this.isDebugMode = urlParams.has('debug') || localStorage.getItem('debugMode') === 'true';
        
        if (this.isDebugMode) {
            this.createDebugPanel();
            this.registerUIElements();
            this.setupEventListeners();
            this.monitorSocketEvents();
            this.interceptConsole();
            
            // If enabled in localStorage, also monitor network
            if (localStorage.getItem('monitorNetwork') === 'true') {
                this.toggleNetworkMonitoring(true);
            }
            
            console.log('[Debug] Debug tools initialized');
        }
    }

    /**
     * Create the debug panel in the DOM
     */
    createDebugPanel() {
        // Don't create panel if it already exists
        if (document.getElementById('debug-panel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.className = 'debug-panel';
        panel.innerHTML = `
            <div class="debug-header">
                <h3>Debug Tools</h3>
                <div class="debug-controls">
                    <button id="debug-toggle-network" class="btn btn-sm btn-outline-primary">Monitor Network</button>
                    <button id="debug-clear-logs" class="btn btn-sm btn-outline-secondary">Clear Logs</button>
                    <button id="debug-close" class="btn btn-sm btn-danger">Close</button>
                </div>
            </div>
            <div class="debug-tabs">
                <button id="debug-tab-console" class="debug-tab active">Console</button>
                <button id="debug-tab-state" class="debug-tab">State</button>
                <button id="debug-tab-socket" class="debug-tab">Socket.IO</button>
                <button id="debug-tab-network" class="debug-tab">Network</button>
                <button id="debug-tab-performance" class="debug-tab">Performance</button>
            </div>
            <div class="debug-content">
                <div id="debug-console" class="debug-pane active">
                    <div id="debug-console-log" class="debug-log"></div>
                    <div class="debug-input-container">
                        <input id="debug-console-input" class="debug-input" placeholder="Enter JavaScript to execute...">
                        <button id="debug-execute" class="btn btn-sm btn-primary">Execute</button>
                    </div>
                </div>
                <div id="debug-state" class="debug-pane">
                    <div id="debug-state-tree" class="debug-state-view"></div>
                </div>
                <div id="debug-socket" class="debug-pane">
                    <div id="debug-socket-log" class="debug-log"></div>
                </div>
                <div id="debug-network" class="debug-pane">
                    <div id="debug-network-log" class="debug-log"></div>
                </div>
                <div id="debug-performance" class="debug-pane">
                    <div id="debug-performance-metrics" class="debug-metrics"></div>
                </div>
            </div>
        `;
        
        // Add styles
        const styles = document.createElement('style');
        styles.innerHTML = `
            .debug-panel {
                position: fixed;
                right: 10px;
                bottom: 10px;
                width: 500px;
                max-height: 400px;
                background-color: #fff;
                border: 1px solid #ddd;
                border-radius: 6px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 9999;
                display: none;
                overflow: hidden;
                font-family: monospace;
                font-size: 12px;
            }
            
            [data-theme="dark"] .debug-panel {
                background-color: #222;
                border-color: #444;
                color: #ddd;
            }
            
            .debug-header {
                padding: 8px;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            [data-theme="dark"] .debug-header {
                border-color: #444;
            }
            
            .debug-header h3 {
                margin: 0;
                font-size: 14px;
            }
            
            .debug-controls {
                display: flex;
                gap: 5px;
            }
            
            .debug-tabs {
                display: flex;
                border-bottom: 1px solid #ddd;
            }
            
            [data-theme="dark"] .debug-tabs {
                border-color: #444;
            }
            
            .debug-tab {
                padding: 8px 12px;
                border: none;
                background: none;
                cursor: pointer;
                opacity: 0.7;
            }
            
            .debug-tab.active {
                opacity: 1;
                border-bottom: 2px solid #007bff;
                font-weight: bold;
            }
            
            [data-theme="dark"] .debug-tab.active {
                border-bottom-color: #38a4f8;
            }
            
            .debug-content {
                height: 300px;
                overflow: hidden;
            }
            
            .debug-pane {
                height: 100%;
                overflow: auto;
                padding: 8px;
                display: none;
            }
            
            .debug-pane.active {
                display: block;
            }
            
            .debug-log {
                height: calc(100% - 40px);
                overflow-y: auto;
            }
            
            .debug-log-entry {
                padding: 4px 0;
                border-bottom: 1px solid rgba(0,0,0,0.05);
                word-break: break-word;
            }
            
            [data-theme="dark"] .debug-log-entry {
                border-color: rgba(255,255,255,0.05);
            }
            
            .log-timestamp {
                color: #888;
                font-size: 10px;
                margin-right: 5px;
            }
            
            .log-level-error {
                color: #dc3545;
            }
            
            .log-level-warn {
                color: #ffc107;
            }
            
            .log-level-info {
                color: #17a2b8;
            }
            
            .log-level-command {
                color: #6f42c1;
                font-weight: bold;
            }
            
            .log-level-result {
                color: #28a745;
                margin-left: 10px;
            }
            
            .debug-input-container {
                display: flex;
                padding: 8px 0;
            }
            
            .debug-input {
                flex: 1;
                padding: 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-right: 5px;
            }
            
            [data-theme="dark"] .debug-input {
                background-color: #333;
                border-color: #444;
                color: #ddd;
            }
            
            .state-object {
                padding-left: 15px;
            }
            
            .state-item {
                position: relative;
                padding: 2px 0;
            }
            
            .state-item.has-children.expanded > .state-children {
                display: block;
            }
            
            .state-item.has-children > .state-children {
                display: none;
            }
            
            .state-key {
                color: #007bff;
            }
            
            [data-theme="dark"] .state-key {
                color: #38a4f8;
            }
            
            .state-value {
                color: #28a745;
            }
            
            [data-theme="dark"] .state-value {
                color: #5cdc76;
            }
            
            .state-empty {
                color: #6c757d;
                font-style: italic;
            }
            
            .state-expand-btn {
                display: inline-block;
                width: 16px;
                height: 16px;
                line-height: 12px;
                text-align: center;
                border: 1px solid #ddd;
                border-radius: 3px;
                cursor: pointer;
                background: transparent;
                margin-right: 3px;
            }
            
            [data-theme="dark"] .state-expand-btn {
                border-color: #444;
            }
            
            .state-spacer {
                display: inline-block;
                width: 16px;
            }
            
            .socket-emit {
                color: #007bff;
            }
            
            .socket-receive {
                color: #28a745;
            }
            
            .log-event {
                font-weight: bold;
            }
            
            .log-data {
                margin-left: 20px;
                font-family: monospace;
                white-space: pre-wrap;
            }
            
            .network-entry {
                position: relative;
                cursor: pointer;
            }
            
            .network-entry.expanded {
                padding-bottom: 8px;
            }
            
            .network-entry.success .log-status {
                color: #28a745;
            }
            
            .network-entry.error .log-status {
                color: #dc3545;
            }
            
            .log-method {
                font-weight: bold;
                margin-right: 5px;
                color: #6f42c1;
            }
            
            .log-url {
                margin-right: 5px;
                word-break: break-all;
            }
            
            .log-duration {
                color: #fd7e14;
            }
            
            .log-error {
                color: #dc3545;
                margin-top: 3px;
                display: none;
            }
            
            .network-entry.expanded .log-error {
                display: block;
            }
            
            .metrics-section {
                margin-bottom: 15px;
            }
            
            .metrics-section h4 {
                font-size: 14px;
                margin-bottom: 8px;
            }
            
            .metrics-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
            }
            
            .metrics-table td, .metrics-table th {
                padding: 4px;
                border-bottom: 1px solid #eee;
            }
            
            [data-theme="dark"] .metrics-table td, 
            [data-theme="dark"] .metrics-table th {
                border-color: #444;
            }
            
            .resource-name {
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `;
        
        document.head.appendChild(styles);
        document.body.appendChild(panel);
        
        // Initially show the panel
        panel.style.display = 'block';
    }

    /**
     * Register UI elements
     */
    registerUIElements() {
        // Only try to register if getElement is available
        if (typeof getElement !== 'function') {
            console.warn('getElement function not available, skipping UI registration');
            return;
        }
        
        try {
            // Register elements directly using document.getElementById as fallback
            const debugPanel = getElement('debugPanel') || document.getElementById('debug-panel');
            const debugConsoleLog = getElement('debugConsoleLog') || document.getElementById('debug-console-log');
            const debugConsoleInput = getElement('debugConsoleInput') || document.getElementById('debug-console-input');
            const debugExecuteBtn = getElement('debugExecuteBtn') || document.getElementById('debug-execute');
            const debugClearLogsBtn = getElement('debugClearLogsBtn') || document.getElementById('debug-clear-logs');
            const debugCloseBtn = getElement('debugCloseBtn') || document.getElementById('debug-close');
            const debugToggleNetworkBtn = getElement('debugToggleNetworkBtn') || document.getElementById('debug-toggle-network');
            const debugStateTree = getElement('debugStateTree') || document.getElementById('debug-state-tree');
            const debugSocketLog = getElement('debugSocketLog') || document.getElementById('debug-socket-log');
            const debugNetworkLog = getElement('debugNetworkLog') || document.getElementById('debug-network-log');
            const debugPerformanceMetrics = getElement('debugPerformanceMetrics') || document.getElementById('debug-performance-metrics');
        } catch (error) {
            console.warn('Error registering debug UI elements:', error);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        try {
            // Use direct DOM queries as a fallback if registerEvents is not available
            if (typeof registerEvents !== 'function') {
                this.setupDirectEventListeners();
                return;
            }
            
            // Register events through event registry
            registerEvents({
                'click:debugExecuteBtn': () => this.executeConsoleCommand(),
                'click:debugClearLogsBtn': () => this.clearLogs(),
                'click:debugCloseBtn': () => this.toggleDebugPanel(false),
                'click:debugToggleNetworkBtn': () => this.toggleNetworkMonitoring()
            });
            
            // Set up tab switching
            this.setupTabSwitching();
            
            // Set up keyboard handlers
            this.setupKeyboardHandlers();
        } catch (error) {
            console.warn('Error setting up debug event listeners:', error);
            // Fallback to direct DOM event listeners
            this.setupDirectEventListeners();
        }
    }
    
    /**
     * Set up direct DOM event listeners (fallback approach)
     */
    setupDirectEventListeners() {
        // Execute button
        const executeBtn = document.getElementById('debug-execute');
        if (executeBtn) {
            executeBtn.addEventListener('click', () => this.executeConsoleCommand());
        }
        
        // Clear logs button
        const clearLogsBtn = document.getElementById('debug-clear-logs');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => this.clearLogs());
        }
        
        // Close button
        const closeBtn = document.getElementById('debug-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleDebugPanel(false));
        }
        
        // Toggle network button
        const toggleNetworkBtn = document.getElementById('debug-toggle-network');
        if (toggleNetworkBtn) {
            toggleNetworkBtn.addEventListener('click', () => this.toggleNetworkMonitoring());
        }
        
        // Set up tab switching
        this.setupTabSwitching();
        
        // Set up keyboard handlers
        this.setupKeyboardHandlers();
    }
    
    /**
     * Set up tab switching
     */
    setupTabSwitching() {
        // Tab switching
        const tabs = document.querySelectorAll('.debug-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and panes
                document.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.debug-pane').forEach(p => p.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                
                // Get pane ID from tab ID
                const paneId = tab.id.replace('tab', '');
                const pane = document.getElementById(paneId);
                if (pane) {
                    pane.classList.add('active');
                    
                    // Refresh content when tab is selected
                    if (paneId === 'debug-state') {
                        this.refreshStateTree();
                    } else if (paneId === 'debug-performance') {
                        this.refreshPerformanceMetrics();
                    }
                }
            });
        });
    }
    
    /**
     * Set up keyboard handlers
     */
    setupKeyboardHandlers() {
        // Execute on Enter key in console input
        const consoleInput = document.getElementById('debug-console-input');
        if (consoleInput) {
            consoleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.executeConsoleCommand();
                }
            });
        }
        
        // Global shortcut: Ctrl+Shift+D to toggle debug panel
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleDebugPanel();
            }
        });
    }

    /**
     * Monitor Socket.IO events
     */
    monitorSocketEvents() {
        // Check if Socket.IO is available
        if (typeof io === 'undefined' || !io.socket) {
            this.logToConsole('Socket.IO not found or not initialized', 'warn');
            return;
        }
        
        const socket = io.socket;
        
        // Store original emit function
        const originalEmit = socket.emit;
        
        // Override emit to log events
        socket.emit = (...args) => {
            const [event, ...data] = args;
            
            // Log the event
            this.logSocketEvent('emit', event, data);
            
            // Call the original emit function
            return originalEmit.apply(socket, args);
        };
        
        // Monitor incoming events
        const originalOnevent = socket.onevent;
        socket.onevent = (packet) => {
            const [event, ...data] = packet.data || [];
            
            // Log the event
            this.logSocketEvent('receive', event, data);
            
            // Call the original onevent function
            return originalOnevent.call(socket, packet);
        };
        
        this.logToConsole('Socket.IO monitoring enabled', 'info');
    }

    /**
     * Intercept console methods
     */
    interceptConsole() {
        // Store original console methods
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
        this.originalConsoleWarn = console.warn;
        
        // Overwrite console.log
        console.log = (...args) => {
            // Call original console.log
            this.originalConsoleLog.apply(console, args);
            
            // Log to our debug console
            this.logToConsole(args, 'log');
        };
        
        // Overwrite console.error
        console.error = (...args) => {
            // Call original console.error
            this.originalConsoleError.apply(console, args);
            
            // Log to our debug console
            this.logToConsole(args, 'error');
        };
        
        // Overwrite console.warn
        console.warn = (...args) => {
            // Call original console.warn
            this.originalConsoleWarn.apply(console, args);
            
            // Log to our debug console
            this.logToConsole(args, 'warn');
        };
    }

    /**
     * Toggle network monitoring
     * @param {boolean} [forceState] - Optionally force a state (true = on, false = off)
     */
    toggleNetworkMonitoring(forceState) {
        const newState = forceState !== undefined ? forceState : !this.isMonitoringNetwork;
        this.isMonitoringNetwork = newState;
        
        const toggleBtn = document.getElementById('debug-toggle-network');
        if (toggleBtn) {
            toggleBtn.textContent = newState ? 'Stop Monitoring' : 'Monitor Network';
            toggleBtn.classList.toggle('btn-danger', newState);
            toggleBtn.classList.toggle('btn-outline-primary', !newState);
        }
        
        if (newState) {
            // Store original fetch
            this.originalFetch = window.fetch;
            
            // Override fetch
            window.fetch = async (...args) => {
                const [resource, config] = args;
                const startTime = performance.now();
                
                try {
                    const response = await this.originalFetch.apply(window, args);
                    
                    const endTime = performance.now();
                    const duration = endTime - startTime;
                    
                    this.logNetworkRequest({
                        url: resource,
                        method: config?.method || 'GET',
                        status: response.status,
                        statusText: response.statusText,
                        duration: duration.toFixed(2),
                        success: true
                    });
                    
                    return response;
                } catch (error) {
                    const endTime = performance.now();
                    const duration = endTime - startTime;
                    
                    this.logNetworkRequest({
                        url: resource,
                        method: config?.method || 'GET',
                        error: error.message,
                        duration: duration.toFixed(2),
                        success: false
                    });
                    
                    throw error;
                }
            };
            
            // Also monitor XMLHttpRequest if needed
            this.monitorXHR();
            
            // Save to localStorage
            localStorage.setItem('monitorNetwork', 'true');
            
            this.logToConsole('Network monitoring enabled', 'info');
        } else {
            // Restore original fetch
            window.fetch = this.originalFetch;
            
            // Remove XHR monitoring
            this.restoreXHR();
            
            // Remove from localStorage
            localStorage.removeItem('monitorNetwork');
            
            this.logToConsole('Network monitoring disabled', 'info');
        }
    }

    /**
     * Monitor XMLHttpRequest
     */
    monitorXHR() {
        // Store original XHR open and send
        this.originalXHROpen = XMLHttpRequest.prototype.open;
        this.originalXHRSend = XMLHttpRequest.prototype.send;
        
        // Override XHR open
        XMLHttpRequest.prototype.open = function(...args) {
            const [method, url] = args;
            this._debugMethod = method;
            this._debugUrl = url;
            this._debugStartTime = performance.now();
            return this.originalXHROpen.apply(this, args);
        };
        
        // Override XHR send
        XMLHttpRequest.prototype.send = function(...args) {
            // Add event listener for load
            this.addEventListener('load', () => {
                const endTime = performance.now();
                const duration = endTime - this._debugStartTime;
                
                // Log the request
                window.debugTools.logNetworkRequest({
                    url: this._debugUrl,
                    method: this._debugMethod,
                    status: this.status,
                    statusText: this.statusText,
                    duration: duration.toFixed(2),
                    success: this.status >= 200 && this.status < 300
                });
            });
            
            // Add event listener for error
            this.addEventListener('error', () => {
                const endTime = performance.now();
                const duration = endTime - this._debugStartTime;
                
                // Log the request
                window.debugTools.logNetworkRequest({
                    url: this._debugUrl,
                    method: this._debugMethod,
                    error: 'Network error',
                    duration: duration.toFixed(2),
                    success: false
                });
            });
            
            return this.originalXHRSend.apply(this, args);
        };
    }

    /**
     * Restore original XMLHttpRequest
     */
    restoreXHR() {
        // Restore original XHR methods
        if (this.originalXHROpen) {
            XMLHttpRequest.prototype.open = this.originalXHROpen;
        }
        
        if (this.originalXHRSend) {
            XMLHttpRequest.prototype.send = this.originalXHRSend;
        }
    }

    /**
     * Log message to console
     * @param {*} args - Log content
     * @param {string} level - Log level (log, error, warn, etc.)
     */
    logToConsole(args, level = 'log') {
        // Create log entry
        const timestamp = new Date().toISOString().slice(11, 23);
        const entry = {
            timestamp,
            level,
            content: args
        };
        
        // Add to log
        this.consoleLog.unshift(entry);
        
        // Limit log size
        if (this.consoleLog.length > this.maxLogEntries) {
            this.consoleLog.pop();
        }
        
        // Update console view if it exists
        this.updateConsoleView();
    }

    /**
     * Log Socket.IO event
     * @param {string} direction - Event direction (emit or receive)
     * @param {string} event - Event name
     * @param {Array} data - Event data
     */
    logSocketEvent(direction, event, data) {
        // Create log entry
        const timestamp = new Date().toISOString().slice(11, 23);
        const entry = {
            timestamp,
            direction,
            event,
            data
        };
        
        // Add to log
        this.socketEventsLog.unshift(entry);
        
        // Limit log size
        if (this.socketEventsLog.length > this.maxLogEntries) {
            this.socketEventsLog.pop();
        }
        
        // Update socket log view if it exists
        this.updateSocketLogView();
    }

    /**
     * Log network request
     * @param {Object} requestData - Request data
     */
    logNetworkRequest(requestData) {
        // Get the network log element
        const networkLog = document.getElementById('debug-network-log');
        if (!networkLog) return;
        
        // Create log entry HTML
        const entryClass = requestData.success ? 'success' : 'error';
        const timestamp = new Date().toISOString().slice(11, 23);
        
        const entry = document.createElement('div');
        entry.className = `debug-log-entry network-entry ${entryClass}`;
        entry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-method">${requestData.method}</span>
            <span class="log-url">${requestData.url}</span>
            <span class="log-status">${requestData.success ? requestData.status : 'ERROR'}</span>
            <span class="log-duration">${requestData.duration}ms</span>
            ${requestData.error ? `<div class="log-error">${requestData.error}</div>` : ''}
        `;
        
        // Add expand/collapse functionality
        entry.addEventListener('click', () => {
            entry.classList.toggle('expanded');
        });
        
        // Add to log
        networkLog.insertBefore(entry, networkLog.firstChild);
        
        // Limit entries
        if (networkLog.children.length > this.maxLogEntries) {
            networkLog.removeChild(networkLog.lastChild);
        }
    }

    /**
     * Update the console view
     */
    updateConsoleView() {
        const consoleLog = document.getElementById('debug-console-log');
        if (!consoleLog) return;
        
        // Generate HTML for log entries
        const entriesHtml = this.consoleLog.map(entry => {
            const logClass = `log-level-${entry.level}`;
            
            // Format content based on type
            let content = '';
            if (Array.isArray(entry.content)) {
                content = entry.content.map(item => {
                    if (typeof item === 'object') {
                        try {
                            return JSON.stringify(item, null, 2);
                        } catch (e) {
                            return String(item);
                        }
                    }
                    return String(item);
                }).join(' ');
            } else {
                content = String(entry.content);
            }
            
            // Escape HTML to prevent XSS
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            return `
                <div class="debug-log-entry ${logClass}">
                    <span class="log-timestamp">${entry.timestamp}</span>
                    <span class="log-content">${content}</span>
                </div>
            `;
        }).join('');
        
        consoleLog.innerHTML = entriesHtml;
    }

    /**
     * Update the Socket.IO log view
     */
    updateSocketLogView() {
        const socketLog = document.getElementById('debug-socket-log');
        if (!socketLog) return;
        
        // Generate HTML for log entries
        const entriesHtml = this.socketEventsLog.map(entry => {
            const directionClass = entry.direction === 'emit' ? 'socket-emit' : 'socket-receive';
            
            // Format data
            let dataContent = '';
            try {
                dataContent = JSON.stringify(entry.data, null, 2);
                // Escape HTML to prevent XSS
                dataContent = dataContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            } catch (e) {
                dataContent = String(entry.data);
            }
            
            return `
                <div class="debug-log-entry ${directionClass}">
                    <span class="log-timestamp">${entry.timestamp}</span>
                    <span class="log-direction">${entry.direction}</span>
                    <span class="log-event">${entry.event}</span>
                    <div class="log-data">${dataContent}</div>
                </div>
            `;
        }).join('');
        
        socketLog.innerHTML = entriesHtml;
    }

/**
     * Refresh the state tree view
     */
refreshStateTree() {
    const stateTree = document.getElementById('debug-state-tree');
    if (!stateTree) return;
    
    // Get current state
    let currentState = {};
    
    // Try to use getState function if available
    if (typeof getState === 'function') {
        try {
            currentState = getState();
        } catch (e) {
            console.error('Error getting state:', e);
            currentState = { error: 'Failed to get application state' };
        }
    } else {
        // Fallback to checking for global state
        if (window.appState) {
            currentState = window.appState;
        } else {
            currentState = { message: 'State not available' };
        }
    }
    
    // Format state as a tree
    stateTree.innerHTML = this.formatStateAsTree(currentState);
    
    // Add expand/collapse functionality
    const expandButtons = stateTree.querySelectorAll('.state-expand-btn');
    expandButtons.forEach(button => {
        button.addEventListener('click', () => {
            const stateItem = button.closest('.state-item');
            stateItem.classList.toggle('expanded');
            button.textContent = stateItem.classList.contains('expanded') ? '−' : '+';
        });
    });
}

/**
 * Format state object as HTML tree
 * @param {Object} state - State object
 * @param {number} level - Current nesting level
 * @returns {string} - HTML representation of state tree
 */
formatStateAsTree(state, level = 0) {
    if (!state || typeof state !== 'object') {
        return `<span class="state-value">${JSON.stringify(state)}</span>`;
    }
    
    const indent = '  '.repeat(level);
    const keys = Object.keys(state);
    
    if (keys.length === 0) {
        return '<span class="state-empty">empty object</span>';
    }
    
    let html = `<div class="state-object">`;
    
    keys.forEach(key => {
        const value = state[key];
        const isObject = value && typeof value === 'object';
        
        html += `
            <div class="state-item ${isObject ? 'has-children' : ''}">
                ${isObject ? `<button class="state-expand-btn">+</button>` : '<span class="state-spacer"></span>'}
                <span class="state-key">${key}:</span>
                ${isObject 
                    ? `<div class="state-children">${this.formatStateAsTree(value, level + 1)}</div>`
                    : `<span class="state-value">${JSON.stringify(value)}</span>`
                }
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

/**
 * Refresh performance metrics
 */
refreshPerformanceMetrics() {
    const metricsContainer = document.getElementById('debug-performance-metrics');
    if (!metricsContainer) return;
    
    // Get performance data
    const metrics = this.collectPerformanceMetrics();
    
    // Generate HTML
    let html = `
        <div class="metrics-section">
            <h4>Navigation Timing</h4>
            <table class="metrics-table">
                <tr>
                    <td>Page Load Time</td>
                    <td>${metrics.pageLoadTime}ms</td>
                </tr>
                <tr>
                    <td>DOM Ready Time</td>
                    <td>${metrics.domReadyTime}ms</td>
                </tr>
                <tr>
                    <td>First Paint</td>
                    <td>${metrics.firstPaint}ms</td>
                </tr>
            </table>
        </div>
        
        <div class="metrics-section">
            <h4>Memory Usage</h4>
            <table class="metrics-table">
                <tr>
                    <td>Total JS Heap Size</td>
                    <td>${metrics.jsHeapSizeLimit}</td>
                </tr>
                <tr>
                    <td>Used JS Heap Size</td>
                    <td>${metrics.usedJSHeapSize}</td>
                </tr>
            </table>
        </div>
        
        <div class="metrics-section">
            <h4>Resource Timing</h4>
            <table class="metrics-table">
                <tr>
                    <th>Resource</th>
                    <th>Duration</th>
                    <th>Size</th>
                </tr>
                ${metrics.resources.map(res => `
                    <tr>
                        <td class="resource-name" title="${res.name}">${res.name}</td>
                        <td>${res.duration}ms</td>
                        <td>${res.size}</td>
                    </tr>
                `).join('')}
            </table>
        </div>
        
        <div class="metrics-section">
            <h4>Module Loading</h4>
            <table class="metrics-table">
                <tr>
                    <td>Loaded Modules</td>
                    <td>${metrics.moduleStats.loadedCount}</td>
                </tr>
                <tr>
                    <td>Failed Modules</td>
                    <td>${metrics.moduleStats.failedCount}</td>
                </tr>
            </table>
        </div>
    `;
    
    metricsContainer.innerHTML = html;
    
    // Schedule periodic updates
    setTimeout(() => this.refreshPerformanceMetrics(), 5000);
}

/**
 * Collect performance metrics
 * @returns {Object} - Performance metrics
 */
collectPerformanceMetrics() {
    const metrics = {
        pageLoadTime: 0,
        domReadyTime: 0,
        firstPaint: 0,
        jsHeapSizeLimit: 'N/A',
        usedJSHeapSize: 'N/A',
        resources: [],
        moduleStats: {
            loadedCount: 0,
            failedCount: 0
        }
    };
    
    // Navigation timing data
    const navTiming = performance.getEntriesByType('navigation')[0];
    if (navTiming) {
        metrics.pageLoadTime = Math.round(navTiming.loadEventEnd - navTiming.navigationStart);
        metrics.domReadyTime = Math.round(navTiming.domComplete - navTiming.domLoading);
    }
    
    // First paint
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
    if (firstPaint) {
        metrics.firstPaint = Math.round(firstPaint.startTime);
    }
    
    // Memory usage (only in Chrome)
    if (performance.memory) {
        metrics.jsHeapSizeLimit = this.formatBytes(performance.memory.jsHeapSizeLimit);
        metrics.usedJSHeapSize = this.formatBytes(performance.memory.usedJSHeapSize);
    }
    
    // Resource timing
    const resourceEntries = performance.getEntriesByType('resource');
    metrics.resources = resourceEntries.slice(0, 10).map(entry => {
        return {
            name: this.simplifyUrl(entry.name),
            duration: Math.round(entry.duration),
            size: this.formatBytes(entry.transferSize || 0)
        };
    });
    
    // Module statistics
    if (window.moduleLoader) {
        const dependencies = window.moduleLoader.getDependencyInfo?.() || {};
        metrics.moduleStats.loadedCount = dependencies.loadedModules?.length || 0;
        metrics.moduleStats.failedCount = dependencies.failedModules?.length || 0;
    }
    
    return metrics;
}

/**
 * Simplify URL for display
 * @param {string} url - URL to simplify
 * @returns {string} - Simplified URL
 */
simplifyUrl(url) {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname;
        return path.substring(path.lastIndexOf('/') + 1) || parsed.hostname;
    } catch (e) {
        return url;
    }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} - Formatted string (e.g., "2.5 MB")
 */
formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Execute console command
 */
executeConsoleCommand() {
    const input = document.getElementById('debug-console-input');
    if (!input) return;
    
    const command = input.value.trim();
    if (!command) return;
    
    // Log the command
    this.logToConsole(`> ${command}`, 'command');
    
    // Execute the command
    try {
        const result = eval(command);
        this.logToConsole(result, 'result');
    } catch (error) {
        this.logToConsole(error.message, 'error');
    }
    
    // Clear input
    input.value = '';
}

/**
 * Clear logs
 */
clearLogs() {
    // Clear console log
    this.consoleLog = [];
    this.updateConsoleView();
    
    // Clear socket log
    this.socketEventsLog = [];
    this.updateSocketLogView();
    
    // Clear network log
    const networkLog = document.getElementById('debug-network-log');
    if (networkLog) {
        networkLog.innerHTML = '';
    }
}

/**
 * Toggle debug panel visibility
 * @param {boolean} [forceState] - Force a specific state (true = show, false = hide)
 */
toggleDebugPanel(forceState) {
    const panel = document.getElementById('debug-panel');
    if (!panel) {
        if (forceState !== false) {
            this.createDebugPanel();
            this.registerUIElements();
            this.setupEventListeners();
        }
        return;
    }
    
    const newState = forceState !== undefined ? forceState : panel.style.display !== 'block';
    panel.style.display = newState ? 'block' : 'none';
    
    // If opening the panel, refresh content
    if (newState) {
        this.refreshStateTree();
        this.refreshPerformanceMetrics();
    }
}

// Public API methods

/**
 * Enable debug mode
 */
enableDebugMode() {
    this.isDebugMode = true;
    localStorage.setItem('debugMode', 'true');
    this.toggleDebugPanel(true);
}

/**
 * Disable debug mode
 */
disableDebugMode() {
    this.isDebugMode = false;
    localStorage.removeItem('debugMode');
    this.toggleDebugPanel(false);
    
    // Restore original console methods
    console.log = this.originalConsoleLog;
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    
    // Restore fetch if needed
    if (this.isMonitoringNetwork) {
        this.toggleNetworkMonitoring(false);
    }
}

/**
 * Log to debug console
 * @param  {...any} args - Arguments to log
 */
log(...args) {
    this.logToConsole(args, 'log');
}

/**
 * Log error to debug console
 * @param  {...any} args - Arguments to log
 */
error(...args) {
    this.logToConsole(args, 'error');
}

/**
 * Log warning to debug console
 * @param  {...any} args - Arguments to log
 */
warn(...args) {
    this.logToConsole(args, 'warn');
}

/**
 * Inspect a value in the debug console
 * @param {string} label - Label for the value
 * @param {*} value - Value to inspect
 */
inspect(label, value) {
    this.logToConsole([`[Inspect: ${label}]`, value], 'info');
}

/**
 * Analyze module loading issues
 * @returns {Object} - Analysis of module loading issues
 */
analyzeModuleIssues() {
    const issues = {
        circularDependencies: [],
        missingExports: [],
        failedImports: []
    };
    
    if (window.moduleLoader) {
        // Get dependency info
        const depInfo = window.moduleLoader.getDependencyInfo?.() || {};
        
        // Find circular dependencies
        issues.circularDependencies = depInfo.currentlyLoading || [];
        
        // Find failed modules
        issues.failedImports = depInfo.failedModules || [];
    }
    
    // Check console for missing exports
    const missingExportRegex = /The requested module .* doesn't provide an export named: '(.*)'/;
    this.consoleLog.forEach(entry => {
        if (entry.level === 'error') {
            const content = Array.isArray(entry.content) ? entry.content.join(' ') : entry.content;
            const match = content.match(missingExportRegex);
            if (match && match[1]) {
                issues.missingExports.push(match[1]);
            }
        }
    });
    
    // Log analysis
    this.logToConsole(['Module Issues Analysis:', issues], 'info');
    
    return issues;
}
}

// Create singleton instance
const debugTools = new DebugTools();

// Make it available globally for XHR monitoring
window.debugTools = debugTools;

// Export both default and named exports for compatibility
export default debugTools;
export const log = debugTools.log.bind(debugTools);
export const error = debugTools.error.bind(debugTools);
export const warn = debugTools.warn.bind(debugTools);
export const inspect = debugTools.inspect.bind(debugTools);
export const enableDebugMode = debugTools.enableDebugMode.bind(debugTools);
export const disableDebugMode = debugTools.disableDebugMode.bind(debugTools);
export const toggleDebugPanel = debugTools.toggleDebugPanel.bind(debugTools);