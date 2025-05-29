/**
 * Frontend Console Log Capture Script
 * This captures all console logs for analysis
 */

(function() {
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // Override console methods to capture logs
    console.log = function(...args) {
        logs.push({ type: 'log', message: args.join(' '), timestamp: Date.now() });
        originalLog.apply(console, args);
    };
    
    console.error = function(...args) {
        logs.push({ type: 'error', message: args.join(' '), timestamp: Date.now() });
        originalError.apply(console, args);
    };
    
    console.warn = function(...args) {
        logs.push({ type: 'warn', message: args.join(' '), timestamp: Date.now() });
        originalWarn.apply(console, args);
    };
    
    // Export logs function
    window.getConsoleLogs = function() {
        return logs;
    };
    
    // Log current module loading status
    console.log('🔍 Analyzing Module Loading...');
    console.log('Module Instances:', Object.keys(window.moduleInstances || {}));
    console.log('App Initialized:', window.appInitialized);
    console.log('Module Manager:', window.moduleManager ? 'Present' : 'Missing');
})();