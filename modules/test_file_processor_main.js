// Simple test to verify File Processor module loading
(async function testFileProcessor() {
    console.log('🧪 Testing File Processor module loading...');
    
    try {
        // Test module import
        const fileProcessorModule = await import('/static/js/modules/features/fileProcessor.js');
        console.log('✅ fileProcessor module imported successfully:', fileProcessorModule);
        
        // Test configuration imports
        const endpointsModule = await import('/static/js/modules/config/endpoints.js');
        console.log('✅ endpoints module imported successfully:', endpointsModule.API_ENDPOINTS?.FILE_PROCESSING);
        
        const constantsModule = await import('/static/js/modules/config/constants.js');
        console.log('✅ constants module imported successfully:', constantsModule.CONSTANTS);
        
        // Wait for global fileProcessor to be available
        let attempts = 0;
        while (!window.fileProcessor && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.fileProcessor) {
            console.log('✅ Global fileProcessor instance found:', window.fileProcessor);
            console.log('📊 fileProcessor state:', window.fileProcessor.state);
            console.log('📊 fileProcessor config:', window.fileProcessor.config);
            
            // Test if module is initialized
            if (window.fileProcessor.state.isInitialized) {
                console.log('✅ fileProcessor is fully initialized');
            } else {
                console.log('⚠️ fileProcessor is not yet initialized');
            }
        } else {
            console.error('❌ Global fileProcessor instance not found after 5 seconds');
        }
        
        // Test form element existence
        const form = document.getElementById('process-form');
        const submitBtn = document.getElementById('submit-btn');
        
        if (form) {
            console.log('✅ File Processor form found:', form);
        } else {
            console.error('❌ File Processor form not found');
        }
        
        if (submitBtn) {
            console.log('✅ Submit button found:', submitBtn);
            console.log('📊 Submit button disabled?', submitBtn.disabled);
        } else {
            console.error('❌ Submit button not found');
        }
        
    } catch (error) {
        console.error('❌ File Processor test failed:', error);
        console.error('Error stack:', error.stack);
    }
})();