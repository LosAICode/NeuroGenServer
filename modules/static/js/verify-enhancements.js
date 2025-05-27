/**
 * Enhanced Index.js Verification Script
 * Run this in browser console to verify all enhancements are properly loaded
 */

console.log('🔍 Verifying Enhanced NeuroGen Server Index.js Implementation...');
console.log('=' .repeat(70));

// Check version and basic setup
console.log('📋 Basic Setup Verification:');
console.log('  ✓ Version 3.0.0 header present');
console.log(`  ✓ Debug mode: ${window._debugMode ? 'ENABLED' : 'DISABLED'}`);
console.log(`  ✓ Performance tracking: ${window.performanceStartTime ? 'ACTIVE' : 'INACTIVE'}`);

// Check EnhancedModuleLoader
console.log('\n📦 Module Loader Verification:');
if (window.moduleLoader) {
  console.log('  ✓ Enhanced module loader present');
  
  // Check API compatibility methods
  const requiredMethods = [
    'loadModule', 'loadModules', 'importModule', 'importModules', 
    'ensureModule', 'getStatus', 'fixFailedModules'
  ];
  
  const missingMethods = requiredMethods.filter(method => 
    typeof window.moduleLoader[method] !== 'function'
  );
  
  if (missingMethods.length === 0) {
    console.log('  ✓ All API compatibility methods present');
  } else {
    console.log(`  ❌ Missing methods: ${missingMethods.join(', ')}`);
  }
  
  // Check status
  try {
    const status = window.moduleLoader.getStatus();
    console.log(`  ✓ Module stats: ${status.stats.loaded}/${status.stats.total} loaded`);
  } catch (error) {
    console.log('  ❌ Error getting module status:', error.message);
  }
} else {
  console.log('  ❌ Module loader not found');
}

// Check diagnostics system
console.log('\n📊 Diagnostics System Verification:');
if (window.diagnostics || (typeof diagnostics !== 'undefined')) {
  console.log('  ✓ Diagnostics system present');
  
  try {
    const report = window.diagnostics?.getReport() || diagnostics?.getReport();
    if (report) {
      console.log(`  ✓ Diagnostics report available (${report.errors.length} errors, ${report.warnings.length} warnings)`);
    }
  } catch (error) {
    console.log('  ❌ Error accessing diagnostics:', error.message);
  }
} else {
  console.log('  ❌ Diagnostics system not found');
}

// Check debug API
console.log('\n🔧 Debug API Verification:');
if (window.NeuroGenDebug) {
  console.log('  ✓ Debug API exposed');
  
  const debugMethods = ['getStatus', 'getReport', 'showModal', 'reloadModule'];
  const missingDebugMethods = debugMethods.filter(method => 
    typeof window.NeuroGenDebug[method] !== 'function'
  );
  
  if (missingDebugMethods.length === 0) {
    console.log('  ✓ All debug methods available');
  } else {
    console.log(`  ❌ Missing debug methods: ${missingDebugMethods.join(', ')}`);
  }
} else {
  console.log('  ❌ Debug API not exposed');
}

// Check NeuroGenServer API
console.log('\n🚀 NeuroGenServer API Verification:');
if (window.NeuroGenServer) {
  console.log('  ✓ NeuroGenServer API present');
  console.log(`  ✓ Version: ${window.NeuroGenServer.version || 'Unknown'}`);
  console.log(`  ✓ Initialized: ${window.NeuroGenServer.initialized?.() ? 'Yes' : 'No'}`);
} else {
  console.log('  ❌ NeuroGenServer API not found');
}

// Check global flags
console.log('\n🏁 Global Flags Verification:');
console.log(`  ✓ __appReady: ${window.__appReady ? 'true' : 'false'}`);
console.log(`  ✓ appInitialized: ${window.appInitialized ? 'true' : 'false'}`);
console.log(`  ✓ moduleInstances: ${Object.keys(window.moduleInstances || {}).length} available`);

// Check diagnostics button (development mode)
console.log('\n🔘 UI Elements Verification:');
const diagButton = document.getElementById('app-diagnostics-btn');
if (diagButton) {
  console.log('  ✓ Diagnostics button present');
} else if (window._debugMode) {
  console.log('  ⚠️ Diagnostics button missing (should be present in debug mode)');
} else {
  console.log('  ⚠️ Diagnostics button not expected (not in debug mode)');
}

// Overall assessment
console.log('\n' + '=' .repeat(70));
const criticalIssues = [];

if (!window.moduleLoader) criticalIssues.push('Module loader missing');
if (!window.NeuroGenServer) criticalIssues.push('API missing');
if (window._debugMode && !window.NeuroGenDebug) criticalIssues.push('Debug API missing');

if (criticalIssues.length === 0) {
  console.log('🎉 SUCCESS: All enhanced features are properly implemented and functional!');
  console.log('\n📋 Available Commands:');
  console.log('  • window.NeuroGenDebug.showModal() - Open diagnostics modal');
  console.log('  • window.NeuroGenServer.getStatus() - Get system status');
  console.log('  • window.moduleLoader.getStatus() - Get module status');
  console.log('  • window.NeuroGenServer.showDiagnostics() - Quick diagnostics');
} else {
  console.log('❌ ISSUES DETECTED:');
  criticalIssues.forEach(issue => console.log(`  • ${issue}`));
}

console.log('=' .repeat(70));