/**
 * Performance Fix Script for NeuroGen Module System
 * Addresses slow loading, duplicate initialization, and other performance issues
 */

(function() {
    'use strict';
    
    console.log('🔧 Applying NeuroGen performance fixes...');
    
    // 1. Module Loading Optimization
    const moduleLoadOptimizer = {
        // Cache for loaded modules to prevent duplicate loads
        loadedModules: new Set(),
        
        // Override module loading to add caching
        optimizeModuleLoading() {
            if (window.moduleLoader && window.moduleLoader.loadModule) {
                const originalLoadModule = window.moduleLoader.loadModule;
                
                window.moduleLoader.loadModule = async function(modulePath, options = {}) {
                    // Skip if already loaded
                    if (moduleLoadOptimizer.loadedModules.has(modulePath)) {
                        console.log(`⚡ Skipping already loaded module: ${modulePath}`);
                        return window.moduleInstances[modulePath.split('/').pop().replace('.js', '')];
                    }
                    
                    // Add performance optimization options
                    const optimizedOptions = {
                        ...options,
                        timeout: 5000, // Reduce timeout from 15000ms
                        retries: 1, // Reduce retries
                        cache: 'force-cache' // Force browser caching
                    };
                    
                    const result = await originalLoadModule.call(this, modulePath, optimizedOptions);
                    moduleLoadOptimizer.loadedModules.add(modulePath);
                    return result;
                };
            }
        }
    };
    
    // 2. Duplicate Initialization Prevention
    const initializationGuard = {
        initialized: new Set(),
        
        // Wrap initialization functions to prevent duplicates
        guardInitialization(moduleName, initFunction) {
            return function(...args) {
                if (initializationGuard.initialized.has(moduleName)) {
                    console.log(`⚠️ Preventing duplicate initialization of ${moduleName}`);
                    return window.moduleInstances[moduleName];
                }
                
                initializationGuard.initialized.add(moduleName);
                return initFunction.apply(this, args);
            };
        },
        
        // Apply guards to common modules
        applyGuards() {
            const modulesToGuard = [
                'fileProcessor', 'webScraper', 'academicSearch', 
                'historyManager', 'keyboardShortcuts', 'dragDropHandler',
                'systemHealth', 'debugTools', 'ui'
            ];
            
            modulesToGuard.forEach(moduleName => {
                if (window.moduleInstances && window.moduleInstances[moduleName]) {
                    const module = window.moduleInstances[moduleName];
                    if (module.initialize) {
                        module.initialize = this.guardInitialization(moduleName, module.initialize);
                    }
                }
            });
        }
    };
    
    // 3. Service Worker Fix
    const serviceWorkerFix = {
        fix() {
            // Disable service worker temporarily to prevent errors
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    registrations.forEach(registration => {
                        registration.unregister();
                        console.log('🔧 Unregistered problematic service worker');
                    });
                });
            }
        }
    };
    
    // 4. UI Module Performance Fix
    const uiModuleFix = {
        optimizeUI() {
            // Defer non-critical UI initialization
            if (window.requestIdleCallback) {
                window.requestIdleCallback(() => {
                    this.initializeDeferredUI();
                }, { timeout: 2000 });
            } else {
                setTimeout(() => this.initializeDeferredUI(), 100);
            }
        },
        
        initializeDeferredUI() {
            console.log('⚡ Initializing deferred UI components');
            
            // Initialize tooltips lazily
            const initTooltips = () => {
                const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
                tooltipTriggerList.map(el => new bootstrap.Tooltip(el, { delay: { show: 500, hide: 100 } }));
            };
            
            // Initialize popovers lazily
            const initPopovers = () => {
                const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
                popoverTriggerList.map(el => new bootstrap.Popover(el));
            };
            
            // Defer initialization
            requestAnimationFrame(() => {
                initTooltips();
                initPopovers();
            });
        }
    };
    
    // 5. Module Loading Parallelization
    const parallelLoader = {
        async loadCriticalModules() {
            const criticalModules = [
                '/static/js/modules/core/errorHandler.js',
                '/static/js/modules/utils/socketHandler.js',
                '/static/js/modules/utils/progressHandler.js'
            ];
            
            // Load critical modules in parallel
            console.log('⚡ Loading critical modules in parallel...');
            const startTime = performance.now();
            
            try {
                await Promise.all(criticalModules.map(module => 
                    import(module).catch(err => {
                        console.error(`Failed to load ${module}:`, err);
                        return null;
                    })
                ));
                
                const loadTime = performance.now() - startTime;
                console.log(`✅ Critical modules loaded in ${loadTime.toFixed(2)}ms`);
            } catch (error) {
                console.error('Error loading critical modules:', error);
            }
        }
    };
    
    // 6. Memory Optimization
    const memoryOptimizer = {
        cleanup() {
            // Clear unused module references
            if (window.moduleLoader && window.moduleLoader.clearUnusedModules) {
                window.moduleLoader.clearUnusedModules();
            }
            
            // Clear old console logs to free memory
            if (console.clear && performance.memory && performance.memory.usedJSHeapSize > 100 * 1024 * 1024) {
                console.log('🧹 Clearing console to free memory');
                console.clear();
            }
        },
        
        // Monitor memory usage
        monitor() {
            if (performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                
                if (used > 150) {
                    console.warn(`⚠️ High memory usage: ${used}MB / ${total}MB`);
                    this.cleanup();
                }
            }
        }
    };
    
    // 7. Apply all fixes
    const applyFixes = () => {
        console.log('🚀 Applying performance optimizations...');
        
        // Apply module loading optimization
        moduleLoadOptimizer.optimizeModuleLoading();
        
        // Apply initialization guards
        setTimeout(() => initializationGuard.applyGuards(), 1000);
        
        // Fix service worker
        serviceWorkerFix.fix();
        
        // Optimize UI loading
        uiModuleFix.optimizeUI();
        
        // Setup memory monitoring
        setInterval(() => memoryOptimizer.monitor(), 30000);
        
        // Load critical modules in parallel
        parallelLoader.loadCriticalModules();
        
        console.log('✅ Performance fixes applied successfully');
    };
    
    // Apply fixes when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyFixes);
    } else {
        // DOM already loaded
        applyFixes();
    }
    
    // Export for debugging
    window.NeuroGenPerformanceFix = {
        moduleLoadOptimizer,
        initializationGuard,
        serviceWorkerFix,
        uiModuleFix,
        parallelLoader,
        memoryOptimizer,
        reapplyFixes: applyFixes
    };
})();