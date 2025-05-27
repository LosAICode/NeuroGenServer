// Diagnostic helper to check module loading
console.log('=== Module Loading Diagnostic ===');

// Check what's available
console.log('window.moduleLoader:', typeof window.moduleLoader);
console.log('window.moduleInstances:', window.moduleInstances ? Object.keys(window.moduleInstances) : 'Not available');
console.log('window.appInitialized:', window.appInitialized);

// Check if module diagnostics is available
if (window.__moduleDiagnostics) {
    console.log('Running module diagnostics...');
    window.__moduleDiagnostics.logReport();
} else {
    console.log('Module diagnostics not available');
}

// Check loading stages
if (window.__loadingStages) {
    console.log('Loading stages:', window.__loadingStages);
}

// Check for any errors in console
console.log('Checking for module loading errors...');

// Try to manually trigger diagnostics if available
if (window.moduleInstances && window.moduleInstances.moduleDiagnostics) {
    console.log('Found moduleDiagnostics, running report...');
    window.moduleInstances.moduleDiagnostics.logDiagnosticReport();
}