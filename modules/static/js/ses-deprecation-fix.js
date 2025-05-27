/**
 * SES Deprecation Warning Fix
 * Suppresses deprecated option warnings that may be slowing initialization
 */

(function() {
    'use strict';
    
    // Store original console methods
    const originalWarn = console.warn;
    const originalLog = console.log;
    
    // Filter SES deprecation warnings
    const filterSESWarnings = function(method) {
        return function(...args) {
            const message = args.join(' ');
            
            // Skip SES deprecation warnings
            if (message.includes("The 'dateTaming' option is deprecated") ||
                message.includes("The 'mathTaming' option is deprecated") ||
                message.includes("lockdown-install.js")) {
                return;
            }
            
            // Call original method for other messages
            method.apply(console, args);
        };
    };
    
    // Apply filters
    console.warn = filterSESWarnings(originalWarn);
    
    // Also filter from console.log since SES uses it
    console.log = function(...args) {
        const message = args.join(' ');
        if (message.includes("SES The") && message.includes("deprecated")) {
            return;
        }
        originalLog.apply(console, args);
    };
    
    console.log('✅ SES deprecation warnings suppressed');
})();