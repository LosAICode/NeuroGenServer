// Quick diagnostic script
console.log('=== Quick Diagnostic ===');

// Check app status
if (typeof checkAppStatus === 'function') {
    checkAppStatus();
} else {
    console.log('checkAppStatus not available');
}

// Check module diagnostics
if (window.__moduleDiagnostics) {
    console.log('\n=== Running Module Diagnostics ===');
    window.__moduleDiagnostics.logReport();
}

// Check what modules are loaded
console.log('\n=== Module Check ===');
console.log('moduleLoader available:', typeof window.moduleLoader !== 'undefined');
console.log('moduleInstances:', window.moduleInstances ? Object.keys(window.moduleInstances).length + ' modules loaded' : 'Not available');

// Check initialization
console.log('\n=== Initialization Check ===');
console.log('appInitialized:', window.appInitialized);
console.log('appInitializationStarted:', window.appInitializationStarted);
console.log('__appReady:', window.__appReady);

// Try to get error details
if (window.__loadingStages && window.__loadingStages.errors.length > 0) {
    console.log('\n=== Loading Errors ===');
    window.__loadingStages.errors.forEach((err, idx) => {
        console.error(`Error ${idx + 1}:`, err);
    });
}

console.log('\n=== End Diagnostic ===');