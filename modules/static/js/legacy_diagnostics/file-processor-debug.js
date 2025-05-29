/**
 * File Processor Debug Helper
 * Helps diagnose "No file selected" error
 */

console.log('🔍 File Processor Debug Helper Loaded');

// Wait for DOM and modules to load
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log('🔍 Starting File Processor Diagnostics...');
        
        // Check if file input exists
        const fileInput = document.getElementById('folder-input');
        console.log('1. File input element:', fileInput ? '✅ Found' : '❌ Not found');
        
        // Check if form exists
        const form = document.getElementById('process-form');
        console.log('2. Form element:', form ? '✅ Found' : '❌ Not found');
        
        // Check if browse button exists
        const browseBtn = document.getElementById('browse-btn');
        console.log('3. Browse button:', browseBtn ? '✅ Found' : '❌ Not found');
        
        // Check fileProcessor module
        if (window.moduleInstances && window.moduleInstances.fileProcessor) {
            console.log('4. FileProcessor module: ✅ Loaded');
            
            // Check state
            if (window.moduleInstances.fileProcessor.state) {
                console.log('5. FileProcessor state:', window.moduleInstances.fileProcessor.state);
                console.log('   - selectedFiles:', window.moduleInstances.fileProcessor.state.selectedFiles);
                console.log('   - processing:', window.moduleInstances.fileProcessor.state.processing);
                console.log('   - initialized:', window.moduleInstances.fileProcessor.state.initialized);
            }
        } else {
            console.log('4. FileProcessor module: ❌ Not loaded');
        }
        
        // Monitor file selection
        if (fileInput) {
            console.log('6. Adding file change monitor...');
            fileInput.addEventListener('change', (e) => {
                console.log('📁 File input changed!');
                console.log('   - Files:', e.target.files);
                console.log('   - File count:', e.target.files.length);
                if (e.target.files.length > 0) {
                    console.log('   - First file:', e.target.files[0].name, e.target.files[0].size);
                }
            });
        }
        
        // Monitor form submission
        if (form) {
            console.log('7. Adding form submit monitor...');
            form.addEventListener('submit', (e) => {
                console.log('📝 Form submitted!');
                console.log('   - File input files:', fileInput ? fileInput.files : 'No input');
                console.log('   - File count:', fileInput ? fileInput.files.length : 0);
                
                // Check module state
                if (window.moduleInstances && window.moduleInstances.fileProcessor) {
                    const state = window.moduleInstances.fileProcessor.state;
                    console.log('   - Module selectedFiles:', state ? state.selectedFiles : 'No state');
                }
            }, true); // Use capture phase to run before other handlers
        }
        
        // Monitor browse button
        if (browseBtn) {
            console.log('8. Adding browse button monitor...');
            browseBtn.addEventListener('click', (e) => {
                console.log('🔘 Browse button clicked!');
                console.log('   - File input exists:', !!fileInput);
                console.log('   - Current files:', fileInput ? fileInput.files.length : 'No input');
            }, true);
        }
        
        console.log('🔍 Diagnostics setup complete!');
        console.log('   Try selecting a file and submitting the form.');
        console.log('   Check console for diagnostic messages.');
        
    }, 2000); // Wait for modules to initialize
});

// Global error handler
window.addEventListener('error', (e) => {
    if (e.message && e.message.includes('file')) {
        console.error('🚨 File-related error:', e.message, e);
    }
});