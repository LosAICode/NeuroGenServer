/**
 * Console Diagnostics Tool for NeuroGen Module System
 * Run this in browser console to get instant diagnostics
 */

window.NeuroGenDiagnostics = {
    async runFullDiagnostics() {
        console.log('🔍 Running NeuroGen Module Diagnostics...\n');
        
        const report = {
            timestamp: new Date().toISOString(),
            modules: await this.checkModules(),
            initialization: this.checkInitialization(),
            errors: this.checkErrors(),
            performance: this.checkPerformance(),
            forms: this.checkForms(),
            socketIO: this.checkSocketIO()
        };
        
        this.printReport(report);
        return report;
    },
    
    async checkModules() {
        const modules = {
            loaded: [],
            failed: [],
            instances: {}
        };
        
        // Check window.moduleInstances
        if (window.moduleInstances) {
            modules.instances = Object.keys(window.moduleInstances);
        }
        
        // Check moduleLoader status
        if (window.moduleLoader && window.moduleLoader.getStatus) {
            const status = window.moduleLoader.getStatus();
            modules.loaded = status.loaded || [];
            modules.failed = Array.from(status.failed || []);
        }
        
        // Check specific modules
        const criticalModules = [
            'errorHandler', 'moduleLoader', 'progressHandler',
            'socketHandler', 'fileProcessor', 'webScraper',
            'playlistDownloader', 'ui', 'app'
        ];
        
        modules.criticalStatus = {};
        for (const module of criticalModules) {
            modules.criticalStatus[module] = {
                instance: !!window.moduleInstances?.[module],
                global: !!window[module],
                initialized: !!(window.moduleInstances?.[module]?.initialized || 
                             window[module]?.initialized)
            };
        }
        
        return modules;
    },
    
    checkInitialization() {
        return {
            appInitialized: window.appInitialized || false,
            appReady: window.__appReady || false,
            initStarted: window.appInitializationStarted || false,
            initTime: window.performanceStartTime ? 
                     Date.now() - window.performanceStartTime : null,
            diagnostics: window.diagnostics ? window.diagnostics.getReport() : null
        };
    },
    
    checkErrors() {
        const errors = {
            console: [],
            diagnostics: [],
            window: []
        };
        
        // Get diagnostics errors
        if (window.diagnostics) {
            const report = window.diagnostics.getReport();
            errors.diagnostics = report.errors || [];
        }
        
        // Check for common error patterns
        const errorPatterns = [
            { test: () => !window.io, message: 'Socket.IO not loaded' },
            { test: () => !window.socket, message: 'Socket not initialized' },
            { test: () => !document.getElementById('process-form'), 
              message: 'File processor form not found' },
            { test: () => !document.getElementById('playlist-form'), 
              message: 'Playlist form not found' },
            { test: () => !document.getElementById('scraper-form'), 
              message: 'Scraper form not found' }
        ];
        
        errorPatterns.forEach(pattern => {
            try {
                if (pattern.test()) {
                    errors.window.push(pattern.message);
                }
            } catch (e) {
                errors.window.push(`Error checking: ${e.message}`);
            }
        });
        
        return errors;
    },
    
    checkPerformance() {
        const perf = {
            loadTime: window.performanceStartTime ? 
                     Date.now() - window.performanceStartTime : null,
            memory: null,
            timing: {}
        };
        
        // Memory usage
        if (performance.memory) {
            perf.memory = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }
        
        // Navigation timing
        if (performance.timing) {
            const timing = performance.timing;
            perf.timing = {
                domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                loadComplete: timing.loadEventEnd - timing.navigationStart
            };
        }
        
        return perf;
    },
    
    checkForms() {
        const forms = {};
        
        // Check each form
        const formConfigs = [
            { id: 'process-form', name: 'FileProcessor', button: 'submit-btn' },
            { id: 'playlist-form', name: 'PlaylistDownloader', button: 'playlist-submit-btn' },
            { id: 'scraper-form', name: 'WebScraper', button: 'scrape-btn' }
        ];
        
        formConfigs.forEach(config => {
            const form = document.getElementById(config.id);
            const button = document.getElementById(config.button);
            
            forms[config.name] = {
                formExists: !!form,
                buttonExists: !!button,
                buttonEnabled: button ? !button.disabled : false,
                hasSubmitHandler: form ? (!!form.onsubmit || form._hasHandler || form._enhancedHandler) : false,
                eventListeners: form ? this.getEventListeners(form) : []
            };
        });
        
        return forms;
    },
    
    checkSocketIO() {
        const socketInfo = {
            available: !!window.io,
            connected: false,
            id: null,
            transport: null
        };
        
        if (window.socket) {
            socketInfo.connected = window.socket.connected;
            socketInfo.id = window.socket.id;
            socketInfo.transport = window.socket.io?.engine?.transport?.name;
        }
        
        return socketInfo;
    },
    
    getEventListeners(element) {
        // This is a simplified check - actual event listeners are not easily accessible
        const listeners = [];
        
        // Check common event properties
        ['onclick', 'onsubmit', 'onchange'].forEach(event => {
            if (element[event]) {
                listeners.push(event);
            }
        });
        
        return listeners;
    },
    
    printReport(report) {
        console.group('📊 NeuroGen Module Diagnostics Report');
        
        // Initialization Status
        console.group('🚀 Initialization');
        console.log('App Initialized:', report.initialization.appInitialized ? '✅' : '❌');
        console.log('Init Time:', report.initialization.initTime ? `${report.initialization.initTime}ms` : 'N/A');
        console.groupEnd();
        
        // Module Status
        console.group('📦 Modules');
        console.log('Loaded:', report.modules.loaded.length);
        console.log('Failed:', report.modules.failed.length);
        console.log('Instances:', report.modules.instances);
        
        if (report.modules.failed.length > 0) {
            console.warn('Failed modules:', report.modules.failed);
        }
        
        console.table(report.modules.criticalStatus);
        console.groupEnd();
        
        // Forms Status
        console.group('📝 Forms');
        console.table(report.forms);
        console.groupEnd();
        
        // Socket.IO Status
        console.group('🔌 Socket.IO');
        console.log('Available:', report.socketIO.available ? '✅' : '❌');
        console.log('Connected:', report.socketIO.connected ? '✅' : '❌');
        console.log('ID:', report.socketIO.id || 'N/A');
        console.log('Transport:', report.socketIO.transport || 'N/A');
        console.groupEnd();
        
        // Errors
        if (report.errors.window.length > 0 || 
            report.errors.diagnostics.length > 0) {
            console.group('❌ Errors');
            if (report.errors.window.length > 0) {
                console.warn('Window errors:', report.errors.window);
            }
            if (report.errors.diagnostics.length > 0) {
                console.warn('Diagnostic errors:', report.errors.diagnostics);
            }
            console.groupEnd();
        }
        
        // Performance
        console.group('⚡ Performance');
        console.log('Total Load Time:', report.performance.loadTime ? `${report.performance.loadTime}ms` : 'N/A');
        if (report.performance.memory) {
            console.log('Memory:', `${report.performance.memory.used}MB / ${report.performance.memory.total}MB`);
        }
        console.groupEnd();
        
        console.groupEnd();
        
        // Quick fixes
        console.log('\n🔧 Quick Fixes:');
        console.log('1. Enable all buttons: NeuroGenDiagnostics.enableAllButtons()');
        console.log('2. Check server diagnostics: NeuroGenDiagnostics.checkServer()');
        console.log('3. Fix form handlers: NeuroGenDiagnostics.fixFormHandlers()');
    },
    
    enableAllButtons() {
        ['submit-btn', 'playlist-submit-btn', 'scrape-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = false;
                console.log(`✅ Enabled: ${id}`);
            }
        });
    },
    
    async checkServer() {
        console.log('🔍 Checking server diagnostics...');
        try {
            const response = await fetch('/test-modules');
            const data = await response.json();
            console.log('Server Diagnostics:', data);
            console.log('Summary:', data.summary);
            if (data.issues.length > 0) {
                console.warn('Issues found:', data.issues);
            }
            return data;
        } catch (error) {
            console.error('Failed to fetch server diagnostics:', error);
        }
    },
    
    fixFormHandlers() {
        // This calls the same fix as in index.js
        if (typeof ensureFormHandlersWork === 'function') {
            ensureFormHandlersWork();
            console.log('✅ Form handlers fixed');
        } else {
            console.warn('ensureFormHandlersWork function not found');
        }
    }
};

// Auto-run diagnostics if requested
if (window.location.hash === '#diagnostics') {
    window.addEventListener('load', () => {
        setTimeout(() => {
            console.log('Auto-running diagnostics...');
            window.NeuroGenDiagnostics.runFullDiagnostics();
        }, 2000);
    });
}

console.log('🔧 NeuroGen Diagnostics loaded. Run: NeuroGenDiagnostics.runFullDiagnostics()');