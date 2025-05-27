/**
 * Duplicate Module Load Prevention
 * Prevents modules from being loaded multiple times
 */

(function() {
    'use strict';
    
    console.log('🔧 Duplicate Load Prevention Active');
    
    // Global registry of loaded modules
    window.__loadedModules = window.__loadedModules || new Set();
    window.__loadingModules = window.__loadingModules || new Map();
    
    // Intercept all import attempts
    const originalImport = window.import || ((url) => import(url));
    
    window.import = function(moduleUrl) {
        // Normalize URL
        const normalizedUrl = moduleUrl.replace(/^\.\//, '/static/js/');
        
        // Check if already loaded
        if (window.__loadedModules.has(normalizedUrl)) {
            console.log(`⚡ Preventing duplicate load: ${moduleUrl}`);
            // Return from module cache if available
            if (window.moduleCache && window.moduleCache.has(normalizedUrl)) {
                return Promise.resolve(window.moduleCache.get(normalizedUrl));
            }
            // Otherwise return a resolved promise
            return Promise.resolve({});
        }
        
        // Check if currently loading
        if (window.__loadingModules.has(normalizedUrl)) {
            console.log(`⏳ Reusing loading promise: ${moduleUrl}`);
            return window.__loadingModules.get(normalizedUrl);
        }
        
        // Start loading
        console.log(`📦 Loading module: ${moduleUrl}`);
        const loadPromise = originalImport.call(this, moduleUrl)
            .then(module => {
                window.__loadedModules.add(normalizedUrl);
                window.__loadingModules.delete(normalizedUrl);
                console.log(`✅ Module loaded: ${moduleUrl}`);
                return module;
            })
            .catch(error => {
                window.__loadingModules.delete(normalizedUrl);
                console.error(`❌ Failed to load: ${moduleUrl}`, error);
                throw error;
            });
        
        window.__loadingModules.set(normalizedUrl, loadPromise);
        return loadPromise;
    };
    
    // Also prevent duplicate initialization calls
    window.__initializedModules = new Set();
    
    window.preventDuplicateInit = function(moduleName, initFunction) {
        if (window.__initializedModules.has(moduleName)) {
            console.log(`⚡ Preventing duplicate init: ${moduleName}`);
            return Promise.resolve(true);
        }
        
        window.__initializedModules.add(moduleName);
        return initFunction();
    };
    
    console.log('✅ Duplicate load prevention installed');
})();