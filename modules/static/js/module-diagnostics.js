/**
 * Module Diagnostics Utility
 * Run this in browser console to diagnose module loading issues
 */

window.diagnoseModules = async function() {
  console.log('🔍 Diagnosing module loading issues...');
  
  const problematicModules = [
    '/static/js/modules/utils/ui.js',
    '/static/js/modules/features/webScraper.js', 
    '/static/js/modules/features/academicSearch.js'
  ];
  
  for (const modulePath of problematicModules) {
    console.log(`\n📦 Testing: ${modulePath}`);
    
    try {
      // Try to import the module
      const startTime = performance.now();
      const module = await import(modulePath);
      const loadTime = performance.now() - startTime;
      
      console.log(`✅ Success: ${modulePath} (${Math.round(loadTime)}ms)`);
      console.log('   Exports:', Object.keys(module));
      
      // Test default export
      if (module.default) {
        console.log('   Default export type:', typeof module.default);
        if (module.default.initialize && typeof module.default.initialize === 'function') {
          console.log('   Has initialize method: ✅');
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed: ${modulePath}`);
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
      
      // Try to identify the specific issue
      if (error.message.includes('redeclaration')) {
        console.warn('   Issue: Function redeclaration conflict');
      } else if (error.message.includes('export')) {
        console.warn('   Issue: Export/import mismatch');
      } else if (error.message.includes('WeakMap')) {
        console.warn('   Issue: WeakMap key type error');
      } else {
        console.warn('   Issue: Unknown error type');
      }
    }
  }
  
  // Check moduleLoader status
  if (window.moduleLoader) {
    console.log('\n📊 ModuleLoader Stats:');
    const stats = window.moduleLoader.getStats ? window.moduleLoader.getStats() : 'No stats available';
    console.log(stats);
  }
  
  console.log('\n🎯 Diagnosis complete. Check the results above for specific issues.');
};

// Auto-run diagnosis
console.log('Module diagnostics loaded. Run window.diagnoseModules() to test module loading.');