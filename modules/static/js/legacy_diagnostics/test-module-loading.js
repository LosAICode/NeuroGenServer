/**
 * Module Loading Test Script
 * 
 * Tests the three previously failing modules to ensure they load correctly
 */

async function testModuleLoading() {
  console.log('🧪 Testing module loading...');
  
  const results = {
    'utils/ui.js': null,
    'features/webScraper.js': null,
    'features/academicSearch.js': null
  };
  
  // Test utils/ui.js
  try {
    console.log('Testing utils/ui.js...');
    const ui = await import('./modules/utils/ui.js');
    results['utils/ui.js'] = { success: true, module: ui };
    console.log('✅ utils/ui.js loaded successfully');
  } catch (error) {
    results['utils/ui.js'] = { success: false, error: error.message };
    console.error('❌ utils/ui.js failed:', error);
  }
  
  // Test features/webScraper.js
  try {
    console.log('Testing features/webScraper.js...');
    const webScraper = await import('./modules/features/webScraper.js');
    results['features/webScraper.js'] = { success: true, module: webScraper };
    console.log('✅ features/webScraper.js loaded successfully');
  } catch (error) {
    results['features/webScraper.js'] = { success: false, error: error.message };
    console.error('❌ features/webScraper.js failed:', error);
  }
  
  // Test features/academicSearch.js
  try {
    console.log('Testing features/academicSearch.js...');
    const academicSearch = await import('./modules/features/academicSearch.js');
    results['features/academicSearch.js'] = { success: true, module: academicSearch };
    console.log('✅ features/academicSearch.js loaded successfully');
  } catch (error) {
    results['features/academicSearch.js'] = { success: false, error: error.message };
    console.error('❌ features/academicSearch.js failed:', error);
  }
  
  // Summary
  const successCount = Object.values(results).filter(r => r.success).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n📊 Test Results: ${successCount}/${totalCount} modules loaded successfully`);
  
  if (successCount === totalCount) {
    console.log('🎉 All modules are working! The fixes were successful.');
  } else {
    console.log('⚠️ Some modules still have issues. Check the errors above.');
  }
  
  return results;
}

// Auto-run test if this script is loaded directly
if (typeof window !== 'undefined') {
  window.testModuleLoading = testModuleLoading;
  
  // Run test after a short delay to ensure other modules are loaded
  setTimeout(testModuleLoading, 1000);
}

export { testModuleLoading };