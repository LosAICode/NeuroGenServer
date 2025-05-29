// Test if app loads properly
console.log('=== Testing App Load ===');

// Check if initialization function exists
console.log('initializeApp exists:', typeof initializeApp);

// Check if app is initialized
console.log('appInitialized:', window.appInitialized);
console.log('appInitializationStarted:', window.appInitializationStarted);

// Check module status
console.log('Module instances:', window.moduleInstances ? Object.keys(window.moduleInstances).length : 0);

// Check if we can manually trigger initialization
if (!window.appInitializationStarted && typeof window.initializeApp === 'function') {
    console.log('Attempting manual initialization...');
    window.initializeApp();
} else if (window.appInitializationStarted) {
    console.log('App initialization already started');
} else {
    console.log('initializeApp function not available globally');
}

// Check for errors
if (window.__loadingStages) {
    console.log('Loading stages:', window.__loadingStages);
}