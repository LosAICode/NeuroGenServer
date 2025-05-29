fix /**
 * NeuroGen Server - Simplified Entry Point
 * 
 * This file's ONLY responsibility is to initialize the module loading system.
 * All feature logic has been moved to dedicated modules.
 */

console.log('🚀 NeuroGen Server Starting...');

// Global state
window.moduleInstances = {};
window.appInitialized = false;
window.debugMode = location.hostname === 'localhost';

// Simple initialization tracking
const initStart = performance.now();

// Initialize the application
async function initializeApp() {
    try {
        console.log('📦 Loading module manager...');
        
        // Load the module manager first
        await import('./module-manager.js');
        
        console.log('🔧 Loading essential modules...');
        
        // Define the essential module loading order
        const moduleOrder = [
            // Core modules (required first)
            { path: './modules/core/errorHandler.js', name: 'errorHandler' },
            { path: './modules/core/uiRegistry.js', name: 'uiRegistry' },
            { path: './modules/core/stateManager.js', name: 'stateManager' },
            { path: './modules/core/eventManager.js', name: 'eventManager' },
            
            // Utilities
            { path: './modules/utils/socketHandler.js', name: 'socketHandler' },
            { path: './modules/utils/progressHandler.js', name: 'progressHandler' },
            { path: './modules/utils/ui.js', name: 'ui' },
            
            // Features (critical for functionality)
            { path: './modules/features/fileProcessor.js', name: 'fileProcessor' },
            { path: './modules/features/playlistDownloader.js', name: 'playlistDownloader' },
            { path: './modules/features/webScraper.js', name: 'webScraper' }
        ];
        
        // Load and register modules
        for (const { path, name } of moduleOrder) {
            try {
                console.log(`📦 Loading ${name}...`);
                const module = await import(path);
                
                // Store in global instances
                window.moduleInstances[name] = module;
                
                // Register with module manager
                window.moduleManager.register(name, module.default || module);
                
            } catch (error) {
                console.error(`❌ Failed to load ${name}:`, error);
                // Continue loading other modules
            }
        }
        
        // Initialize all modules through module manager
        await window.moduleManager.initializeAll();
        
        // Mark as initialized
        window.appInitialized = true;
        const initTime = performance.now() - initStart;
        console.log(`✅ NeuroGen Server initialized in ${initTime.toFixed(0)}ms`);
        
        // Dispatch initialization complete event
        window.dispatchEvent(new CustomEvent('neurogenInitialized', {
            detail: { initTime, modules: Object.keys(window.moduleInstances) }
        }));
        
    } catch (error) {
        console.error('💥 Critical initialization error:', error);
        
        // Show error to user
        const errorDiv = document.getElementById('app-loading-error');
        if (errorDiv) {
            errorDiv.textContent = `Initialization failed: ${error.message}`;
            errorDiv.style.display = 'block';
        }
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Load debug tools in development
if (window.debugMode) {
    import('./simple-debug.js').then(() => {
        console.log('🔧 Debug tools loaded');
    });
    
    window.NeuroGenDebug = {
        moduleInstances: () => window.moduleInstances,
        reinitialize: initializeApp,
        version: '4.0.0-simplified'
    };
}