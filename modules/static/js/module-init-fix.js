/**
 * Module Initialization Fix
 * Addresses module-specific initialization delays
 */

(function() {
    'use strict';
    
    console.log('🔧 Module Initialization Fix Loading...');
    
    // 1. Fix for errorHandler taking 4.5 seconds
    // Pre-create commonly used DOM elements to avoid initialization delays
    document.addEventListener('DOMContentLoaded', () => {
        // Pre-create toast container
        if (!document.getElementById('toast-container')) {
            const toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }
        
        // Pre-create modal container
        if (!document.getElementById('error-modal')) {
            const modalHtml = `
                <div class="modal fade" id="error-modal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Error</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body"></div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    });
    
    // 2. Skip redundant initialization checks
    window.__moduleInitCache = new Map();
    
    window.skipIfInitialized = function(moduleName, initFn) {
        if (window.__moduleInitCache.has(moduleName)) {
            console.log(`⚡ Skipping ${moduleName} - already initialized`);
            return window.__moduleInitCache.get(moduleName);
        }
        
        const result = initFn();
        window.__moduleInitCache.set(moduleName, result);
        return result;
    };
    
    // 3. Batch module imports for better parallelization
    window.batchImport = async function(modules) {
        console.log(`🚀 Batch importing ${modules.length} modules...`);
        const startTime = performance.now();
        
        try {
            const results = await Promise.all(
                modules.map(async (modulePath) => {
                    try {
                        const module = await import(modulePath);
                        return { path: modulePath, module, success: true };
                    } catch (error) {
                        console.error(`Failed to import ${modulePath}:`, error);
                        return { path: modulePath, error, success: false };
                    }
                })
            );
            
            const loadTime = performance.now() - startTime;
            console.log(`✅ Batch import completed in ${loadTime.toFixed(0)}ms`);
            
            return results;
        } catch (error) {
            console.error('Batch import failed:', error);
            return [];
        }
    };
    
    // 4. Optimize module loading order
    window.__optimizedModuleOrder = [
        // Critical modules first (in parallel)
        [
            './modules/core/errorHandler.js',
            './modules/core/uiRegistry.js',
            './modules/core/stateManager.js'
        ],
        // Event system (in parallel)
        [
            './modules/core/eventRegistry.js',
            './modules/core/eventManager.js'
        ],
        // UI modules (in parallel)
        [
            './modules/core/themeManager.js',
            './modules/utils/ui.js'
        ],
        // Utils (in parallel)
        [
            './modules/utils/socketHandler.js',
            './modules/utils/progressHandler.js',
            './modules/utils/utils.js',
            './modules/utils/fileHandler.js'
        ],
        // Features (can be deferred)
        [
            './modules/features/fileProcessor.js',
            './modules/features/playlistDownloader.js',
            './modules/features/webScraper.js',
            './modules/features/academicSearch.js'
        ]
    ];
    
    // 5. Module loading statistics
    window.__moduleStats = {
        loadTimes: new Map(),
        startTime: performance.now(),
        
        recordLoad(moduleName, loadTime) {
            this.loadTimes.set(moduleName, loadTime);
        },
        
        getSlowModules(threshold = 100) {
            return Array.from(this.loadTimes.entries())
                .filter(([_, time]) => time > threshold)
                .sort((a, b) => b[1] - a[1]);
        },
        
        getTotalTime() {
            return performance.now() - this.startTime;
        }
    };
    
    console.log('✅ Module Initialization Fix Applied!');
})();