#!/usr/bin/env node

/**
 * Test module loading to verify all modules can be imported successfully
 */

console.log('Testing module loading...\n');

const modules = [
  './static/js/modules/core/errorHandler.js',
  './static/js/modules/core/uiRegistry.js',
  './static/js/modules/core/stateManager.js',
  './static/js/modules/core/eventRegistry.js',
  './static/js/modules/core/eventManager.js',
  './static/js/modules/core/themeManager.js',
  './static/js/modules/core/ui.js',
  './static/js/modules/utils/socketHandler.js',
  './static/js/modules/utils/progressHandler.js',
  './static/js/modules/utils/ui.js',
  './static/js/modules/utils/utils.js',
  './static/js/modules/utils/fileHandler.js',
  './static/js/modules/utils/safeFileProcessor.js',
  './static/js/modules/features/fileProcessor.js',
  './static/js/modules/features/playlistDownloader.js',
  './static/js/modules/features/webScraper.js',
  './static/js/modules/features/academicSearch.js'
];

async function testModules() {
  let passed = 0;
  let failed = 0;
  
  for (const modulePath of modules) {
    try {
      process.stdout.write(`Testing ${modulePath.padEnd(60, '.')}`);
      await import(modulePath);
      console.log(' ✅ PASSED');
      passed++;
    } catch (error) {
      console.log(' ❌ FAILED');
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
testModules().catch(console.error);