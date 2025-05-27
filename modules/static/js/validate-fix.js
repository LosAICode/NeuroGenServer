/**
 * Module Loading Validation Script
 * Run this in browser console after deployment to check if fix worked
 */

console.log('🔍 NeuroGenServer Module Loading Validation');
console.log('==========================================');

// Check if optimized loader is present
if (window.moduleLoader && window.moduleLoader.getStatus) {
  const status = window.moduleLoader.getStatus();
  console.log('✅ Optimized module loader detected');
  console.log('📊 Module Status:', status);
  
  if (status.loaded.length > 0) {
    console.log('✅ Modules successfully loaded:', status.loaded.length);
  }
  
  if (status.failed.length > 0) {
    console.log('❌ Failed modules:', status.failed);
  } else {
    console.log('✅ No failed modules');
  }
} else {
  console.log('❌ Optimized module loader not found - deployment may have failed');
}

// Check if app is initialized
if (window.appInitialized) {
  console.log('✅ Application initialized successfully');
} else {
  console.log('❌ Application not yet initialized');
}

// Check module instances
const moduleCount = Object.keys(window.moduleInstances || {}).length;
console.log(`📦 Available module instances: ${moduleCount}`);
if (moduleCount > 0) {
  console.log('   Modules:', Object.keys(window.moduleInstances));
}

// Check for critical modules
const criticalModules = ['progressHandler', 'socketHandler', 'ui', 'fileProcessor'];
const missingCritical = criticalModules.filter(mod => !window.moduleInstances?.[mod]);

if (missingCritical.length === 0) {
  console.log('✅ All critical modules loaded');
} else {
  console.log('❌ Missing critical modules:', missingCritical);
}

// Performance check
if (window.performanceStartTime) {
  const loadTime = Date.now() - window.performanceStartTime;
  console.log(`⏱️ Load time: ${loadTime}ms`);
  
  if (loadTime < 15000) {
    console.log('✅ Fast loading achieved!');
  } else {
    console.log('⚠️ Loading slower than expected');
  }
}

console.log('==========================================');

// Overall assessment
const issues = [];
if (!window.moduleLoader?.getStatus) issues.push('Missing optimized loader');
if (!window.appInitialized) issues.push('App not initialized');
if (missingCritical.length > 0) issues.push('Missing critical modules');

if (issues.length === 0) {
  console.log('🎉 SUCCESS: Module loading fix appears to be working correctly!');
} else {
  console.log('❌ ISSUES DETECTED:', issues);
}
