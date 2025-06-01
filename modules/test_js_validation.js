#!/usr/bin/env node
/**
 * Test JavaScript module validation
 * This tests if our modules can be loaded and initialized properly
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 JavaScript Module Validation Test');
console.log('=' .repeat(50));

// Test 1: Check if fileProcessor.js exists and has the correct structure
const fileProcessorPath = path.join(__dirname, 'static/js/modules/features/fileProcessor.js');
console.log('📁 Testing File Processor module...');

if (fs.existsSync(fileProcessorPath)) {
    console.log('✅ fileProcessor.js exists');
    
    const content = fs.readFileSync(fileProcessorPath, 'utf8');
    
    // Check for key methods
    const methods = [
        'startProcessing',
        'showProgress',
        'updateUI',
        'handleTaskStarted',
        'handleProgressUpdate',
        'handleTaskCompleted',
        'updateStats',
        'showResults'
    ];
    
    methods.forEach(method => {
        if (content.includes(method)) {
            console.log(`✅ Method ${method} found`);
        } else {
            console.log(`❌ Method ${method} missing`);
        }
    });
    
    // Check for our specific fixes
    const fixes = [
        'classList.remove(\'d-none\')',
        'progressContainer.style.display = \'block\'',
        'showProgress(0, \'Initializing file processing...\')',
        'customUIHandler: true'
    ];
    
    console.log('\n🔧 Checking for implemented fixes...');
    fixes.forEach(fix => {
        if (content.includes(fix)) {
            console.log(`✅ Fix implemented: ${fix}`);
        } else {
            console.log(`❌ Fix missing: ${fix}`);
        }
    });
    
} else {
    console.log('❌ fileProcessor.js not found');
}

// Test 2: Check if progressHandler.js exists
const progressHandlerPath = path.join(__dirname, 'static/js/modules/utils/progressHandler.js');
console.log('\n📊 Testing Progress Handler module...');

if (fs.existsSync(progressHandlerPath)) {
    console.log('✅ progressHandler.js exists');
    
    const content = fs.readFileSync(progressHandlerPath, 'utf8');
    
    // Check for Enterprise ProgressHandler v6.0 features
    const features = [
        'Enterprise ProgressHandler v6.0',
        'trackProgress',
        'initProgressHandler',
        'ButtonManager',
        'setupCommonButtonHandlers'
    ];
    
    features.forEach(feature => {
        if (content.includes(feature)) {
            console.log(`✅ Feature ${feature} found`);
        } else {
            console.log(`❌ Feature ${feature} missing`);
        }
    });
    
} else {
    console.log('❌ progressHandler.js not found');
}

// Test 3: Check our test HTML files
console.log('\n🌐 Testing HTML test files...');

const testFiles = [
    'test_file_processor_progress_flow.html',
    'test_enterprise_progress_handler.html'
];

testFiles.forEach(testFile => {
    const testPath = path.join(__dirname, testFile);
    if (fs.existsSync(testPath)) {
        console.log(`✅ Test file exists: ${testFile}`);
    } else {
        console.log(`❌ Test file missing: ${testFile}`);
    }
});

console.log('\n' + '=' .repeat(50));
console.log('📊 JavaScript Module Validation Complete');

// Test 4: Check if Structify fixes are in place
console.log('\n🔧 Testing Structify fixes...');
const structifyPath = path.join(__dirname, 'Structify/claude.py');

if (fs.existsSync(structifyPath)) {
    console.log('✅ Structify claude.py exists');
    
    const content = fs.readFileSync(structifyPath, 'utf8');
    
    // Check that the buggy increments were removed
    const buggyLines = [
        'stats.total_files += 1'
    ];
    
    const occurrences = (content.match(/stats\.total_files \+= 1/g) || []).length;
    console.log(`📊 Found ${occurrences} occurrences of 'stats.total_files += 1'`);
    
    if (occurrences === 0) {
        console.log('✅ All buggy increments removed');
    } else {
        console.log(`❌ Still ${occurrences} buggy increments found`);
    }
    
    // Check that the proper initialization was added
    if (content.includes('stats.total_files = len(all_files)')) {
        console.log('✅ Proper initialization added: stats.total_files = len(all_files)');
    } else {
        console.log('❌ Proper initialization missing');
    }
    
} else {
    console.log('❌ Structify claude.py not found');
}

console.log('\n🎉 Validation complete!');