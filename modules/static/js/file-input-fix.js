/**
 * File Input Fix
 * Fixes the webkitdirectory issue for file selection
 */

console.log('📁 File Input Fix Loading...');

document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for modules to initialize
    setTimeout(() => {
        const fileInput = document.getElementById('folder-input');
        const browseBtn = document.getElementById('browse-btn');
        const form = document.getElementById('process-form');
        
        if (!fileInput || !browseBtn) {
            console.error('File input or browse button not found');
            return;
        }
        
        console.log('📁 File Input Fix: Applying fixes...');
        
        // Remove webkitdirectory attributes that prevent file selection
        fileInput.removeAttribute('webkitdirectory');
        fileInput.removeAttribute('directory');
        console.log('✅ Removed directory attributes from file input');
        
        // Create a new browse button handler
        const newBrowseBtn = browseBtn.cloneNode(true);
        browseBtn.parentNode.replaceChild(newBrowseBtn, browseBtn);
        
        newBrowseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('📁 Browse button clicked (fixed handler)');
            fileInput.click();
        });
        
        // Monitor file changes
        fileInput.addEventListener('change', (e) => {
            console.log('📁 Files selected:', e.target.files.length);
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                console.log('✅ File selected:', file.name, 'Size:', file.size);
                
                // Update UI to show file is selected
                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = `Process ${file.name}`;
                }
                
                // Update file info display
                const selectedFilesInfo = document.getElementById('selected-files-info');
                if (selectedFilesInfo) {
                    selectedFilesInfo.innerHTML = `
                        <div class="alert alert-info mt-2">
                            <i class="fas fa-file me-2"></i>
                            Selected: <strong>${file.name}</strong> (${formatFileSize(file.size)})
                        </div>
                    `;
                }
            }
        });
        
        console.log('✅ File Input Fix Applied!');
        
    }, 1000);
});

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}