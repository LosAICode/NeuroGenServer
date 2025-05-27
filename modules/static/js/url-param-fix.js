/**
 * URL Parameter Sanitization Fix
 * Prevents SyntaxError from unterminated string literals in URL parameters
 */

(function() {
    'use strict';
    
    // Function to safely parse URL parameters
    function getSafeUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const safeParams = {};
        
        for (const [key, value] of params) {
            // Sanitize the value to prevent syntax errors
            safeParams[key] = value
                .replace(/['"]/g, '') // Remove quotes
                .replace(/[\r\n]/g, '') // Remove line breaks
                .replace(/\\/g, '/'); // Normalize path separators
        }
        
        return safeParams;
    }
    
    // Function to clean URL if it contains problematic parameters
    function cleanUrl() {
        const params = getSafeUrlParams();
        
        // Check if URL has problematic parameters
        if (params.input_dir || params.output_file) {
            console.warn('Detected potentially problematic URL parameters, cleaning...');
            
            // Create clean URL without these parameters
            const url = new URL(window.location);
            url.searchParams.delete('input_dir');
            url.searchParams.delete('output_file');
            
            // Store the parameters in sessionStorage if needed
            if (params.input_dir || params.output_file) {
                sessionStorage.setItem('neurogen_params', JSON.stringify({
                    input_dir: params.input_dir || '',
                    output_file: params.output_file || ''
                }));
            }
            
            // Replace the URL without reloading
            window.history.replaceState({}, document.title, url.toString());
        }
    }
    
    // Clean URL immediately to prevent syntax errors
    try {
        cleanUrl();
    } catch (error) {
        console.error('Error cleaning URL parameters:', error);
    }
    
    // Expose safe parameter getter
    window.getSafeUrlParams = getSafeUrlParams;
})();