/**
 * CRITICAL Performance Fix for NeuroGen Server
 * Addresses 35-second initialization delay and module loading issues
 * 
 * Root Causes:
 * 1. Sequential module loading with unnecessary delays
 * 2. Redundant initialization checks
 * 3. Service Worker blocking main thread
 * 4. Excessive logging and debug operations
 */

console.log('🚨 CRITICAL Performance Fix Loading...');

(function() {
    'use strict';
    
    // Store original functions for restoration if needed
    const originalFetch = window.fetch;
    const originalImport = window.import;
    const originalSetTimeout = window.setTimeout;
    
    // Performance metrics
    const metrics = {
        moduleLoadTimes: new Map(),
        startTime: performance.now(),
        criticalPath: []
    };
    
    // 1. Override dynamic import to add caching and parallel loading
    const moduleCache = new Map();
    const loadingPromises = new Map();
    
    window.import = function(modulePath) {
        // Return cached module immediately
        if (moduleCache.has(modulePath)) {
            console.log(`⚡ Cache hit: ${modulePath}`);
            return Promise.resolve(moduleCache.get(modulePath));
        }
        
        // Return existing loading promise to prevent duplicate loads
        if (loadingPromises.has(modulePath)) {
            return loadingPromises.get(modulePath);
        }
        
        // Start loading with performance tracking
        const startTime = performance.now();
        const loadPromise = originalImport.call(this, modulePath)
            .then(module => {
                const loadTime = performance.now() - startTime;
                metrics.moduleLoadTimes.set(modulePath, loadTime);
                
                // Only log slow modules
                if (loadTime > 100) {
                    console.warn(`⚠️ Slow module load: ${modulePath} (${loadTime.toFixed(0)}ms)`);
                }
                
                moduleCache.set(modulePath, module);
                loadingPromises.delete(modulePath);
                return module;
            })
            .catch(error => {
                loadingPromises.delete(modulePath);
                throw error;
            });
        
        loadingPromises.set(modulePath, loadPromise);
        return loadPromise;
    };
    
    // 2. Fix setTimeout to prevent unnecessary delays
    let skipDelays = true;
    window.setTimeout = function(callback, delay, ...args) {
        // Skip artificial delays during initialization
        if (skipDelays && delay > 50) {
            console.log(`⚡ Skipping ${delay}ms delay`);
            delay = 0;
        }
        return originalSetTimeout.call(this, callback, delay, ...args);
    };
    
    // Restore normal setTimeout after initialization
    window.addEventListener('load', () => {
        setTimeout(() => {
            skipDelays = false;
            console.log('✅ Restored normal setTimeout behavior');
        }, 5000);
    });
    
    // 3. Preload critical modules in parallel
    function preloadCriticalModules() {
        const criticalModules = [
            '/static/js/modules/core/errorHandler.js',
            '/static/js/modules/core/uiRegistry.js',
            '/static/js/modules/core/stateManager.js',
            '/static/js/modules/core/eventRegistry.js',
            '/static/js/modules/core/eventManager.js',
            '/static/js/modules/utils/socketHandler.js',
            '/static/js/modules/utils/progressHandler.js'
        ];
        
        console.log('🚀 Preloading critical modules in parallel...');
        
        // Load all critical modules simultaneously
        return Promise.all(criticalModules.map(module => 
            import(module).catch(err => {
                console.error(`Failed to preload ${module}:`, err);
                return null;
            })
        ));
    }
    
    // 4. Defer Service Worker registration
    function deferServiceWorker() {
        const originalRegister = navigator.serviceWorker?.register;
        if (originalRegister) {
            navigator.serviceWorker.register = function(...args) {
                console.log('📦 Deferring Service Worker registration...');
                // Defer until after main initialization
                setTimeout(() => {
                    console.log('📦 Registering Service Worker...');
                    originalRegister.apply(this, args).catch(err => {
                        console.warn('Service Worker registration failed:', err);
                    });
                }, 10000);
                
                // Return resolved promise to prevent errors
                return Promise.resolve({
                    installing: null,
                    waiting: null,
                    active: null,
                    scope: args[1]?.scope || '/'
                });
            };
        }
    }
    
    // 5. Optimize module initialization checks
    const initializedModules = new Set();
    window.checkModuleInitialized = function(moduleName) {
        if (initializedModules.has(moduleName)) {
            console.log(`⚡ Skip re-initialization: ${moduleName}`);
            return true;
        }
        initializedModules.add(moduleName);
        return false;
    };
    
    // 6. Batch DOM operations
    let pendingDOMUpdates = [];
    let rafScheduled = false;
    
    window.batchDOMUpdate = function(updateFn) {
        pendingDOMUpdates.push(updateFn);
        
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(() => {
                const updates = pendingDOMUpdates.slice();
                pendingDOMUpdates = [];
                rafScheduled = false;
                
                updates.forEach(fn => {
                    try {
                        fn();
                    } catch (err) {
                        console.error('DOM update error:', err);
                    }
                });
            });
        }
    };
    
    // 7. Reduce console spam during initialization
    const originalConsoleLog = console.log;
    let consoleThrottled = true;
    const logBuffer = [];
    
    console.log = function(...args) {
        if (consoleThrottled) {
            // Only log critical messages during init
            const message = args.join(' ');
            if (message.includes('Error') || 
                message.includes('Failed') || 
                message.includes('✅') ||
                message.includes('🚨')) {
                originalConsoleLog.apply(console, args);
            } else {
                logBuffer.push(args);
            }
        } else {
            originalConsoleLog.apply(console, args);
        }
    };
    
    // Restore console after init
    window.addEventListener('load', () => {
        setTimeout(() => {
            consoleThrottled = false;
            console.log('✅ Console logging restored');
            // Optionally dump buffered logs
            if (window.debugMode) {
                logBuffer.forEach(args => originalConsoleLog.apply(console, args));
            }
        }, 3000);
    });
    
    // 8. Apply fixes immediately
    deferServiceWorker();
    
    // 9. Start preloading as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preloadCriticalModules);
    } else {
        preloadCriticalModules();
    }
    
    // 10. Performance monitoring
    window.NeuroGenPerformance = {
        getMetrics() {
            const totalTime = performance.now() - metrics.startTime;
            return {
                totalInitTime: totalTime,
                moduleLoadTimes: Object.fromEntries(metrics.moduleLoadTimes),
                slowestModules: Array.from(metrics.moduleLoadTimes.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, time]) => ({ name, time: time.toFixed(0) + 'ms' }))
            };
        },
        
        reset() {
            metrics.moduleLoadTimes.clear();
            metrics.startTime = performance.now();
        }
    };
    
    console.log('✅ CRITICAL Performance Fix Applied!');
    console.log('📊 Monitor with: window.NeuroGenPerformance.getMetrics()');
})();