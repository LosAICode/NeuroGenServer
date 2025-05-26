/**
 * NeuroGen Module Standardizer
 * 
 * This script automatically analyzes and fixes JavaScript modules in the NeuroGen Server
 * to implement the standardized export pattern and fix function redeclaration errors.
 * 
 * Usage:
 *   node module-standardizer.js <modules_directory>
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Promisify fs functions
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);

// Configuration
const MODULE_LOCATIONS = {
  // Core modules
  'app.js': 'core',
  'moduleLoader.js': 'core',
  'uiRegistry.js': 'core',
  'eventManager.js': 'core',
  'eventRegistry.js': 'core',
  'stateManager.js': 'core',
  'errorHandler.js': 'core',
  'themeManager.js': 'core',
  
  // Feature modules
  'fileProcessor.js': 'features',
  'pdfProcessor.js': 'features',
  'webScraper.js': 'features',
  'playlistDownloader.js': 'features',
  'academicSearch.js': 'features',
  'academicApiClient.js': 'features',
  'historyManager.js': 'features',
  'helpMode.js': 'features',
  
  // Utility modules
  'utils.js': 'utils',
  'ui.js': 'utils',
  'fileHandler.js': 'utils',
  'progressHandler.js': 'utils',
  'socketHandler.js': 'utils',
  'debugTools.js': 'utils',
  'moduleDiagnostics.js': 'utils'
};

// List of modules to skip (either already fixed or don't need fixing)
const SKIP_MODULES = [
  'uiRegistry.js',
  'fileHandler.js'
];

// List of modules in order of priority to fix
const PRIORITY_MODULES = [
  'errorHandler.js',
  'stateManager.js',
  'eventRegistry.js',
  'eventManager.js',
  'ui.js',
  'utils.js',
  'socketHandler.js',
  'progressHandler.js',
  'moduleDiagnostics.js',
  'app.js',
  'webScraper.js',
  'fileProcessor.js'
];

/**
 * Find all JS files in a directory recursively
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} - Array of file paths
 */
async function findJSFiles(dir) {
  const files = [];
  
  async function scan(directory) {
    const entries = await readdir(directory);
    
    await Promise.all(entries.map(async entry => {
      const fullPath = path.join(directory, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await scan(fullPath);
      } else if (stats.isFile() && entry.endsWith('.js')) {
        files.push(fullPath);
      }
    }));
  }
  
  await scan(dir);
  return files;
}

/**
 * Check if a file contains global function declarations
 * @param {string} content - File content
 * @param {string} filePath - Path to the file
 * @returns {object} - Information about global functions
 */
function analyzeModule(content, filePath) {
  // Look for global function declarations (not inside objects or classes)
  const globalFunctionPattern = /^function\s+([a-zA-Z0-9_]+)\s*\(/gm;
  const globalFunctions = [];
  let match;
  
  while ((match = globalFunctionPattern.exec(content)) !== null) {
    globalFunctions.push({
      name: match[1],
      index: match.index
    });
  }
  
  // Check if this file looks like it's already using a module object pattern
  const hasModuleObject = /const\s+[a-zA-Z0-9_]+\s*=\s*\{/.test(content);
  
  // Check if this file has default export
  const hasDefaultExport = /export\s+default/.test(content);
  
  // Check if this file has named exports
  const hasNamedExports = /export\s+const/.test(content);
  
  // Detect module name from default export or const declaration
  let moduleName;
  const moduleNameRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*\{/;
  const moduleNameMatch = content.match(moduleNameRegex);
  if (moduleNameMatch) {
    moduleName = moduleNameMatch[1];
  } else {
    // Try to get name from filename
    const filename = path.basename(filePath, '.js');
    moduleName = filename;
  }
  
  return {
    globalFunctions,
    hasModuleObject,
    hasDefaultExport,
    hasNamedExports,
    moduleName
  };
}

/**
 * Convert global functions to module methods
 * @param {string} content - File content
 * @param {string} moduleName - Module name
 * @param {Array} globalFunctions - List of global functions
 * @returns {string} - Updated content
 */
function convertGlobalFunctionsToMethods(content, moduleName, globalFunctions) {
  let updatedContent = content;
  
  // Process in reverse order to not invalidate indices
  globalFunctions.sort((a, b) => b.index - a.index);
  
  for (const func of globalFunctions) {
    // Find the full function including body
    const functionRegex = new RegExp(`function\\s+${func.name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?(?:(?=^function\\s+\\w+\\s*\\()|\\/\\/\\s*Export|export\\s+|$)`, 'gm');
    
    // Get the original function
    const funcMatches = functionRegex.exec(updatedContent);
    if (!funcMatches) continue;
    
    const originalFunction = funcMatches[0].trim();
    
    // Convert global function to method
    const methodFunction = originalFunction
      .replace(/^function\s+([a-zA-Z0-9_]+)\s*\(/, '$1(') // Remove function keyword
      .replace(/\bthis\b(?!\.)/, 'this') // Keep 'this' references (but not this.something)
      .trim();
    
    // Replace original function
    updatedContent = updatedContent.replace(originalFunction, '');
    
    // Add function to module object
    // First check if module object declaration exists
    if (!updatedContent.includes(`const ${moduleName} = {`)) {
      // Create module object
      const moduleObj = `// Module object for standardized exports
const ${moduleName} = {
  // Module state
  initialized: false,
  
  // Module methods
  ${methodFunction}`;
      
      // Add to beginning of file after imports and comments
      const lastImportIndex = Math.max(
        updatedContent.lastIndexOf('import'),
        updatedContent.lastIndexOf('/**'),
        updatedContent.lastIndexOf('*/'),
        0
      );
      
      const insertPoint = updatedContent.indexOf('\n', lastImportIndex);
      if (insertPoint !== -1) {
        updatedContent = 
          updatedContent.slice(0, insertPoint) + 
          '\n\n' + moduleObj + 
          updatedContent.slice(insertPoint);
      } else {
        updatedContent = moduleObj + updatedContent;
      }
    } else {
      // Module object already exists, add method to it
      const moduleObjStart = updatedContent.indexOf(`const ${moduleName} = {`);
      const moduleObjEnd = findMatchingBrace(updatedContent, moduleObjStart + `const ${moduleName} = {`.length);
      
      if (moduleObjEnd !== -1) {
        updatedContent = 
          updatedContent.slice(0, moduleObjEnd) + 
          ',\n  ' + methodFunction + 
          updatedContent.slice(moduleObjEnd);
      }
    }
  }
  
  return updatedContent;
}

/**
 * Find the position of the matching closing brace
 * @param {string} content - Content to search
 * @param {number} start - Starting position
 * @returns {number} - Position of matching brace
 */
function findMatchingBrace(content, start) {
  let braceCount = 1;
  let pos = start;
  
  while (braceCount > 0 && pos < content.length) {
    const char = content[pos];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        return pos;
      }
    }
    pos++;
  }
  
  return -1;
}

/**
 * Add standard exports for a module
 * @param {string} content - File content
 * @param {string} moduleName - Module name
 * @param {Array} methods - List of methods to export
 * @returns {string} - Updated content
 */
function addStandardExports(content, moduleName, methods) {
  // First check if there's already a default export
  if (!content.includes(`export default ${moduleName}`)) {
    content += `\n\n// Export default module\nexport default ${moduleName};\n`;
  }
  
  // Then add named exports
  if (methods.length > 0) {
    content += `\n// Named exports for each method\n`;
    
    for (const method of methods) {
      content += `export const ${method} = ${moduleName}.${method}.bind(${moduleName});\n`;
    }
  }
  
  return content;
}

/**
 * Extract method names from module object
 * @param {string} content - File content
 * @param {string} moduleName - Module name
 * @returns {Array} - List of method names
 */
function extractModuleMethods(content, moduleName) {
  const methods = [];
  
  // Find module object declaration
  const moduleObjStart = content.indexOf(`const ${moduleName} = {`);
  if (moduleObjStart === -1) return methods;
  
  // Find the end of the module object
  const moduleObjEnd = findMatchingBrace(content, moduleObjStart + `const ${moduleName} = {`.length);
  if (moduleObjEnd === -1) return methods;
  
  // Extract module object content
  const moduleObj = content.substring(moduleObjStart, moduleObjEnd + 1);
  
  // Find methods in module object
  const methodPattern = /(\w+)\s*\([^)]*\)/g;
  let match;
  
  while ((match = methodPattern.exec(moduleObj)) !== null) {
    const methodName = match[1];
    if (!methods.includes(methodName) && !methodName.startsWith('_')) {
      methods.push(methodName);
    }
  }
  
  return methods;
}

/**
 * Convert a file to use the standardized export pattern
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} - Result of conversion
 */
async function convertFileToStandardPattern(filePath) {
  try {
    console.log(`Converting ${path.basename(filePath)}...`);
    
    // Skip if in the SKIP_MODULES list
    const filename = path.basename(filePath);
    if (SKIP_MODULES.includes(filename)) {
      console.log(`  Skipping ${filename} (already fixed)`);
      return { success: true, skipped: true, filePath };
    }
    
    // Read file content
    const content = await readFile(filePath, 'utf8');
    
    // Analyze the module
    const analysis = analyzeModule(content, filePath);
    
    // Log analysis
    console.log(`  Module: ${analysis.moduleName}`);
    console.log(`  Global functions: ${analysis.globalFunctions.length}`);
    console.log(`  Has module object: ${analysis.hasModuleObject}`);
    console.log(`  Has default export: ${analysis.hasDefaultExport}`);
    console.log(`  Has named exports: ${analysis.hasNamedExports}`);
    
    // Skip if already compliant
    if (analysis.hasModuleObject && analysis.hasDefaultExport && analysis.hasNamedExports) {
      console.log(`  ${filename} already uses standard export pattern.`);
      return { success: true, skipped: true, filePath };
    }
    
    // Backup the original file
    const backupPath = `${filePath}.backup`;
    await writeFile(backupPath, content, 'utf8');
    
    // Convert global functions to methods
    let updatedContent = content;
    if (analysis.globalFunctions.length > 0) {
      updatedContent = convertGlobalFunctionsToMethods(
        updatedContent, 
        analysis.moduleName, 
        analysis.globalFunctions
      );
    }
    
    // Extract methods from the module object
    const methods = extractModuleMethods(updatedContent, analysis.moduleName);
    console.log(`  Detected methods: ${methods.join(', ')}`);
    
    // Add standard exports
    if (!analysis.hasDefaultExport || !analysis.hasNamedExports) {
      updatedContent = addStandardExports(updatedContent, analysis.moduleName, methods);
    }
    
    // Write the updated content
    await writeFile(filePath, updatedContent, 'utf8');
    
    return {
      success: true,
      filePath,
      module: analysis.moduleName,
      changes: {
        globalFunctionsConverted: analysis.globalFunctions.length,
        exportsAdded: methods.length,
        defaultExportAdded: !analysis.hasDefaultExport
      }
    };
  } catch (error) {
    console.error(`Error converting ${filePath}:`, error);
    return {
      success: false,
      filePath,
      error: error.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Get the modules directory from command line arguments
    const modulesDir = process.argv[2];
    if (!modulesDir) {
      console.error('Please provide the modules directory path.');
      console.log('Usage: node module-standardizer.js <modules_directory>');
      process.exit(1);
    }
    
    // Check if directory exists
    try {
      await stat(modulesDir);
    } catch (error) {
      console.error(`Directory not found: ${modulesDir}`);
      process.exit(1);
    }
    
    console.log(`\nScanning ${modulesDir} for JavaScript modules...`);
    
    // Find all JS files
    const allFiles = await findJSFiles(modulesDir);
    console.log(`Found ${allFiles.length} JavaScript files.`);
    
    // Sort files by priority
    allFiles.sort((a, b) => {
      const filenameA = path.basename(a);
      const filenameB = path.basename(b);
      
      const indexA = PRIORITY_MODULES.indexOf(filenameA);
      const indexB = PRIORITY_MODULES.indexOf(filenameB);
      
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
    
    // Analyze all modules first
    console.log("\nAnalyzing modules for problems...");
    const problemModules = [];
    
    for (const file of allFiles) {
      const content = await readFile(file, 'utf8');
      const analysis = analyzeModule(content, file);
      
      if (analysis.globalFunctions.length > 0 || !analysis.hasModuleObject || !analysis.hasDefaultExport || !analysis.hasNamedExports) {
        const filename = path.basename(file);
        problemModules.push({
          filePath: file,
          filename,
          analysis
        });
        
        console.log(`- ${filename}: ${analysis.globalFunctions.length} global functions, ${analysis.hasModuleObject ? 'has' : 'missing'} module object, ${analysis.hasDefaultExport ? 'has' : 'missing'} default export, ${analysis.hasNamedExports ? 'has' : 'missing'} named exports`);
      }
    }
    
    console.log(`\nFound ${problemModules.length} modules needing standardization.`);
    
    if (problemModules.length === 0) {
      console.log('All modules already follow the standard export pattern!');
      process.exit(0);
    }
    
    // Prompt for confirmation
    console.log('\nThis will modify the following files:');
    problemModules.forEach(mod => console.log(`- ${mod.filename}`));
    
    // Auto-convert since prompt can be problematic in some environments
    console.log('\nProceeding with automatic standardization...');
    
    // Convert files to standard pattern
    console.log('\nStandardizing modules...\n');
    const results = [];
    
    for (const problem of problemModules) {
      const result = await convertFileToStandardPattern(problem.filePath);
      results.push(result);
      
      if (result.success && !result.skipped) {
        console.log(`✅ Successfully standardized ${path.basename(problem.filePath)}`);
      } else if (result.skipped) {
        console.log(`⏩ Skipped ${path.basename(problem.filePath)}`);
      } else {
        console.log(`❌ Failed to standardize ${path.basename(problem.filePath)}: ${result.error}`);
      }
    }
    
    // Report results
    const successful = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\nStandardization complete:`);
    console.log(`- Successfully standardized: ${successful}`);
    console.log(`- Skipped (already OK): ${skipped}`);
    console.log(`- Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nThe following modules had errors during standardization:');
      results.filter(r => !r.success).forEach(result => {
        console.log(`- ${path.basename(result.filePath)}: ${result.error}`);
      });
    }
    
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the main function
main();