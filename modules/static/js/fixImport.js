/**
 * NeuroGen Server Import Fixer
 * 
 * This script automatically fixes import paths in JavaScript modules for the NeuroGen Server project.
 * It ensures all modules use the correct relative paths and consistent export patterns.
 * 
 * Usage:
 * 1. Save this file as fix-imports.js in your project root
 * 2. Run with Node.js: node fix-imports.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const BASE_DIR = path.resolve('C:/Users/Los/Documents/NeuroGen Server/modules/static/js');
const MODULES_DIR = path.join(BASE_DIR, 'modules');
const CORE_DIR = path.join(MODULES_DIR, 'core');
const FEATURES_DIR = path.join(MODULES_DIR, 'features');
const UTILS_DIR = path.join(MODULES_DIR, 'utils');

// Create backup directory
const BACKUP_DIR = path.join(BASE_DIR, 'backup_' + new Date().toISOString().replace(/:/g, '-'));
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.mkdirSync(path.join(BACKUP_DIR, 'core'), { recursive: true });
    fs.mkdirSync(path.join(BACKUP_DIR, 'features'), { recursive: true });
    fs.mkdirSync(path.join(BACKUP_DIR, 'utils'), { recursive: true });
}

// Module location mapping (canonical locations)
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
    'debugTools.js': 'utils'
};

// Gets the correct import path for a module from the perspective of another module
function getCorrectImportPath(fromModule, toModule) {
    const fromLocation = MODULE_LOCATIONS[path.basename(fromModule)];
    const toLocation = MODULE_LOCATIONS[path.basename(toModule)];
    
    if (!fromLocation || !toLocation) {
        return null; // Unknown module, can't determine correct path
    }
    
    if (fromLocation === toLocation) {
        // Same directory, use relative path
        return './' + path.basename(toModule);
    } else if (fromLocation === 'core' && toLocation === 'features') {
        return '../features/' + path.basename(toModule);
    } else if (fromLocation === 'core' && toLocation === 'utils') {
        return '../utils/' + path.basename(toModule);
    } else if (fromLocation === 'features' && toLocation === 'core') {
        return '../core/' + path.basename(toModule);
    } else if (fromLocation === 'features' && toLocation === 'utils') {
        return '../utils/' + path.basename(toModule);
    } else if (fromLocation === 'utils' && toLocation === 'core') {
        return '../core/' + path.basename(toModule);
    } else if (fromLocation === 'utils' && toLocation === 'features') {
        return '../features/' + path.basename(toModule);
    }
    
    return null; // Unexpected case
}

// Function to process a single JS file and fix its imports
function fixImportsInFile(filePath) {
    console.log(`Processing ${filePath}...`);
    
    try {
        // Create backup
        const relativePath = path.relative(MODULES_DIR, filePath);
        const backupPath = path.join(BACKUP_DIR, relativePath);
        fs.copyFileSync(filePath, backupPath);
        
        // Read file content
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Get module name and location
        const moduleName = path.basename(filePath);
        const moduleLocation = MODULE_LOCATIONS[moduleName];
        
        if (!moduleLocation) {
            console.log(`  Skipping unknown module: ${moduleName}`);
            return;
        }
        
        // Find all imports using regex
        const importRegex = /import\s+(?:(?:{[^}]+})|(?:[^{},\s]+))\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        let newContent = content;
        
        // Collect all matches first to avoid issues with string replacements
        const matches = [];
        while ((match = importRegex.exec(content)) !== null) {
            const fullImport = match[0];
            const importPath = match[1];
            matches.push({ fullImport, importPath, index: match.index });
        }
        
        // Process matches in reverse order to avoid offset issues when replacing
        for (let i = matches.length - 1; i >= 0; i--) {
            const { fullImport, importPath, index } = matches[i];
            
            // Skip external modules or absolute paths
            if (!importPath.startsWith('.') || importPath.startsWith('/')) {
                continue;
            }
            
            // Extract the target module name
            const targetModule = path.basename(importPath);
            
            // Skip if the target module isn't in our mapping
            if (!MODULE_LOCATIONS[targetModule]) {
                console.log(`  Skipping unknown import: ${targetModule}`);
                continue;
            }
            
            // Get the correct import path
            const correctPath = getCorrectImportPath(moduleName, targetModule);
            
            if (correctPath && correctPath !== importPath) {
                // Replace the import path
                const newImport = fullImport.replace(importPath, correctPath);
                
                // Find indices of the current import in the file content
                const startIndex = content.indexOf(fullImport, index);
                const endIndex = startIndex + fullImport.length;
                
                // Replace the old import with the new one
                newContent = newContent.substring(0, startIndex) + 
                             newImport + 
                             newContent.substring(endIndex);
                
                console.log(`  Fixed import: ${importPath} -> ${correctPath}`);
                modified = true;
            }
        }
        
        // Fix export patterns if needed
        if (moduleName === 'uiRegistry.js' || moduleName === 'errorHandler.js') {
            // Check if using export default pattern
            if (!newContent.includes('export default')) {
                // Convert named exports to export default
                const namedExportsRegex = /export\s+(?:const|let|function|class)\s+(\w+)/g;
                let exportMatches = [];
                while ((match = namedExportsRegex.exec(newContent)) !== null) {
                    exportMatches.push({ full: match[0], name: match[1] });
                }
                
                if (exportMatches.length > 0) {
                    // Replace named exports with local declarations
                    for (const exp of exportMatches) {
                        newContent = newContent.replace(exp.full, exp.full.replace('export ', ''));
                    }
                    
                    // Create an export default statement at the end
                    const exportObj = exportMatches.map(e => e.name).join(', ');
                    newContent += `\n\n// Export as a single object\nexport default { ${exportObj} };\n`;
                    
                    console.log(`  Converted named exports to export default in ${moduleName}`);
                    modified = true;
                }
            }
        }
        
        // Write back the file if modified
        if (modified) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`  Updated ${filePath}`);
        } else {
            console.log(`  No changes needed for ${filePath}`);
        }
    } catch (err) {
        console.error(`Error processing ${filePath}:`, err);
    }
}

// Process index.js to fix module loading
function fixIndexJs() {
    const indexPath = path.join(BASE_DIR, 'index.js');
    console.log(`Processing ${indexPath}...`);
    
    try {
        // Create backup
        const backupPath = path.join(BACKUP_DIR, 'index.js');
        fs.copyFileSync(indexPath, backupPath);
        
        // Read file content
        let content = fs.readFileSync(indexPath, 'utf8');
        
        // Fix the import of moduleLoader
        const moduleLoaderImport = /import\s+moduleLoader\s+from\s+['"](.+?)['"]/;
        content = content.replace(moduleLoaderImport, 'import moduleLoader from \'./modules/core/moduleLoader.js\'');
        
        // Fix module paths in arrays
        const coreModulesRegex = /(const CORE_MODULES\s*=\s*\[)([\s\S]*?)(\];)/;
        const featureModulesRegex = /(const FEATURE_MODULES\s*=\s*\[)([\s\S]*?)(\];)/;
        const utilityModulesRegex = /(const UTILITY_MODULES\s*=\s*\[)([\s\S]*?)(\];)/;
        
        // Fix CORE_MODULES paths
        content = content.replace(coreModulesRegex, (match, prefix, moduleList, suffix) => {
            const newModuleList = moduleList.replace(/['"][^'"]+['"]/g, (path) => {
                // Clean the path string
                const cleanPath = path.replace(/['"]/g, '');
                // Extract the module name
                const moduleName = cleanPath.split('/').pop();
                // Return the correct path
                return `'/static/js/modules/core/${moduleName}'`;
            });
            return prefix + newModuleList + suffix;
        });
        
        // Fix FEATURE_MODULES paths
        content = content.replace(featureModulesRegex, (match, prefix, moduleList, suffix) => {
            const newModuleList = moduleList.replace(/['"][^'"]+['"]/g, (path) => {
                // Clean the path string
                const cleanPath = path.replace(/['"]/g, '');
                // Extract the module name
                const moduleName = cleanPath.split('/').pop();
                // Get the correct module location
                const location = MODULE_LOCATIONS[moduleName] || 'features';
                // Return the correct path
                return `'/static/js/modules/${location}/${moduleName}'`;
            });
            return prefix + newModuleList + suffix;
        });
        
        // Fix UTILITY_MODULES paths
        content = content.replace(utilityModulesRegex, (match, prefix, moduleList, suffix) => {
            const newModuleList = moduleList.replace(/['"][^'"]+['"]/g, (path) => {
                // Clean the path string
                const cleanPath = path.replace(/['"]/g, '');
                // Extract the module name
                const moduleName = cleanPath.split('/').pop();
                // Return the correct path
                return `'/static/js/modules/utils/${moduleName}'`;
            });
            return prefix + newModuleList + suffix;
        });
        
        // Write back the file
        fs.writeFileSync(indexPath, content, 'utf8');
        console.log(`  Updated ${indexPath}`);
    } catch (err) {
        console.error(`Error processing ${indexPath}:`, err);
    }
}

// Fix module loader to improve path resolution
function fixModuleLoader() {
    const moduleLoaderPath = path.join(CORE_DIR, 'moduleLoader.js');
    console.log(`Processing ${moduleLoaderPath}...`);
    
    try {
        // Create backup
        const backupPath = path.join(BACKUP_DIR, 'core', 'moduleLoader.js');
        fs.copyFileSync(moduleLoaderPath, backupPath);
        
        // Read file content
        let content = fs.readFileSync(moduleLoaderPath, 'utf8');
        
        // Enhance path resolution logic
        const resolvePathFunction = `  /**
   * Resolve the module path to ensure proper loading
   * This is especially important for relative paths from different modules
   * @param {string} modulePath - The requested module path
   * @returns {string} - The resolved path
   */
  resolvePath(modulePath) {
    console.log("Resolving path:", modulePath);
    
    // If the path already starts with http or /, it's absolute
    if (modulePath.startsWith('http') || modulePath.startsWith('/')) {
      return modulePath;
    }
    
    // Handle paths that start with 'modules/' - convert to absolute path
    if (modulePath.startsWith('modules/')) {
      return '/static/js/' + modulePath;
    }
    
    // For paths from index.js to modules, ensure they're properly resolved
    if (modulePath.startsWith('./modules/')) {
      // Convert to absolute path
      return '/static/js' + modulePath.substring(1);
    }
    
    // For relative paths within the same directory
    if (modulePath.startsWith('./') && !modulePath.includes('/')) {
      // Just get the filename
      const filename = modulePath.substring(2);
      
      // Get the module location from our mapping
      const location = MODULE_LOCATIONS[filename];
      if (location) {
        return \`/static/js/modules/\${location}/\${filename}\`;
      }
    }
    
    // For relative paths to parent directories
    if (modulePath.startsWith('../')) {
      // Extract the target directory and filename
      const parts = modulePath.split('/');
      const targetDir = parts[1]; // 'core', 'features', or 'utils'
      const filename = parts[2];
      
      if (targetDir && filename) {
        return \`/static/js/modules/\${targetDir}/\${filename}\`;
      }
    }
    
    // Default return the path unchanged
    return modulePath;
  },`;
        
        // Replace the existing resolvePath function
        const resolvePathRegex = /resolvePath\(modulePath\)[\s\S]*?\{[\s\S]*?\},/;
        content = content.replace(resolvePathRegex, resolvePathFunction);
        
        // Add MODULE_LOCATIONS map
        const moduleLocationsMap = `  // Map of module filenames to their locations
  MODULE_LOCATIONS: {
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
    'debugTools.js': 'utils'
  },
  `;
        
        // Add the map after the cache property
        const cacheProperty = /cache: new Map\(\),/;
        content = content.replace(cacheProperty, match => match + '\n  ' + moduleLocationsMap);
        
        // Write back the file
        fs.writeFileSync(moduleLoaderPath, content, 'utf8');
        console.log(`  Enhanced ${moduleLoaderPath}`);
    } catch (err) {
        console.error(`Error processing ${moduleLoaderPath}:`, err);
    }
}

// Fix export pattern in specific modules
function fixExportPatterns() {
    const modulesToFix = [
        { path: path.join(CORE_DIR, 'uiRegistry.js'), needsDefaultExport: true },
        { path: path.join(CORE_DIR, 'errorHandler.js'), needsDefaultExport: true },
        { path: path.join(UTILS_DIR, 'ui.js'), needsDefaultExport: true },
        { path: path.join(UTILS_DIR, 'utils.js'), needsDefaultExport: true },
        { path: path.join(UTILS_DIR, 'socketHandler.js'), needsDefaultExport: true },
        { path: path.join(UTILS_DIR, 'fileHandler.js'), needsDefaultExport: true },
        { path: path.join(UTILS_DIR, 'progressHandler.js'), needsDefaultExport: true }
    ];
    
    for (const module of modulesToFix) {
        if (!fs.existsSync(module.path)) {
            console.log(`Module not found: ${module.path}`);
            continue;
        }
        
        console.log(`Fixing export pattern in ${module.path}...`);
        
        try {
            // Create backup
            const relativePath = path.relative(MODULES_DIR, module.path);
            const backupPath = path.join(BACKUP_DIR, relativePath);
            fs.copyFileSync(module.path, backupPath);
            
            // Read file content
            let content = fs.readFileSync(module.path, 'utf8');
            
            if (module.needsDefaultExport && !content.includes('export default')) {
                // Check if there are named exports
                const namedExportsRegex = /export\s+(?:const|let|function|class)\s+(\w+)/g;
                let match;
                let exportNames = [];
                
                while ((match = namedExportsRegex.exec(content)) !== null) {
                    exportNames.push(match[1]);
                }
                
                if (exportNames.length > 0) {
                    // Replace named exports with local declarations
                    for (const name of exportNames) {
                        const exportRegex = new RegExp(`export\\s+(const|let|function|class)\\s+${name}`, 'g');
                        content = content.replace(exportRegex, `$1 ${name}`);
                    }
                    
                    // Add export default at the end
                    const moduleName = path.basename(module.path, '.js');
                    content += `\n\n// Create module object for export\nconst ${moduleName} = {\n`;
                    
                    // Add each export to the object
                    for (const name of exportNames) {
                        content += `  ${name},\n`;
                    }
                    
                    content += `};\n\n// Export the module\nexport default ${moduleName};\n`;
                    console.log(`  Converted named exports to export default in ${module.path}`);
                }
            }
            
            // Write back the file
            fs.writeFileSync(module.path, content, 'utf8');
        } catch (err) {
            console.error(`Error fixing export pattern in ${module.path}:`, err);
        }
    }
}

// Main function to fix all modules
function fixAllModules() {
    console.log('Starting module import fixing...');
    console.log(`Backup directory created at: ${BACKUP_DIR}`);
    
    // Fix index.js first
    fixIndexJs();
    
    // Fix module loader
    fixModuleLoader();
    
    // Fix export patterns in specific modules
    fixExportPatterns();
    
    // Process all JS files in core directory
    const coreFiles = fs.readdirSync(CORE_DIR)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(CORE_DIR, file));
        
    // Process all JS files in features directory
    const featureFiles = fs.readdirSync(FEATURES_DIR)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(FEATURES_DIR, file));
        
    // Process all JS files in utils directory
    const utilFiles = fs.readdirSync(UTILS_DIR)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(UTILS_DIR, file));
    
    // Combine all files
    const allFiles = [...coreFiles, ...featureFiles, ...utilFiles];
    
    // Process each file
    for (const file of allFiles) {
        fixImportsInFile(file);
    }
    
    console.log('\nAll modules processed!');
    console.log(`Backups created in: ${BACKUP_DIR}`);
    console.log('Please test your application to ensure all issues are resolved.');
}

// Run the script
fixAllModules();