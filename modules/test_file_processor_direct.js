// Direct test of File Processor module loading and initialization
console.log('🧪 Starting direct File Processor test...');

(async function testFileProcessorDirect() {
    try {
        console.log('1. Testing module import...');
        
        // Import the File Processor module directly
        const fileProcessorModule = await import('/static/js/modules/features/fileProcessor.js');
        console.log('✅ File Processor module imported successfully');
        
        // Check if default export exists
        if (fileProcessorModule.default) {
            console.log('✅ Default export found:', fileProcessorModule.default);
            
            // Check if global instance exists
            if (window.fileProcessor) {
                console.log('✅ Global fileProcessor instance found');
                console.log('📊 State:', window.fileProcessor.state);
                console.log('📊 Config:', window.fileProcessor.config);
                
                // Test if initialization works
                if (typeof window.fileProcessor.init === 'function') {
                    console.log('2. Testing initialization...');
                    await window.fileProcessor.init();
                    console.log('✅ Initialization completed');
                    console.log('📊 Final state:', window.fileProcessor.state);
                } else {
                    console.error('❌ init method not found');
                }
            } else {
                console.error('❌ Global fileProcessor instance not found');
            }
        } else {
            console.error('❌ No default export found');
        }
        
        console.log('🎉 File Processor test completed successfully!');
        
    } catch (error) {
        console.error('❌ File Processor test failed:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
    }
})();

console.log('🧪 File Processor test script loaded');