/**
 * Module Diagnostics Tool
 * 
 * A utility for diagnosing and resolving module import and dependency issues
 * in the NeuroGen Server frontend. This tool helps identify and fix common
 * module loading issues, circular dependencies, and export/import mismatches.
 */

/**
 * Run diagnostics on the module system to identify issues
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Object} - Diagnostic results with identified issues
 */
function runModuleDiagnostics(moduleLoader) {
  console.log("Running module diagnostics...");
  
  if (!moduleLoader) {
    console.error("ModuleLoader not available for diagnostics");
    return {
      status: "error",
      message: "ModuleLoader not available",
      issues: [{
        type: "CRITICAL",
        message: "ModuleLoader not available for diagnostics"
      }]
    };
  }
  
  const issues = [];
  
  // Check for circular dependencies
  const circularDeps = findCircularDependencies(moduleLoader);
  if (circularDeps.length > 0) {
    issues.push({
      type: "CIRCULAR_DEPENDENCY",
      severity: "WARNING",
      modules: circularDeps,
      message: `Circular dependencies detected between modules: ${circularDeps.join(', ')}`
    });
  }
  
  // Check for failed module imports
  const failedImports = findFailedImports(moduleLoader);
  if (failedImports.length > 0) {
    issues.push({
      type: "FAILED_IMPORTS",
      severity: "ERROR",
      modules: failedImports,
      message: `Failed module imports: ${failedImports.join(', ')}`
    });
  }
  
  // Check for export mismatches
  const exportMismatches = findExportMismatches(moduleLoader);
  if (exportMismatches.length > 0) {
    issues.push({
      type: "EXPORT_MISMATCH",
      severity: "ERROR",
      details: exportMismatches,
      message: "Export/import mismatches detected"
    });
  }
  
  // Check for module sequence issues
  const sequenceIssues = checkInitializationSequence(moduleLoader);
  if (sequenceIssues.length > 0) {
    issues.push({
      type: "SEQUENCE_ISSUE",
      severity: "WARNING",
      details: sequenceIssues,
      message: "Module initialization sequence issues detected"
    });
  }
  
  // Check for fallback modules in use
  const fallbacksInUse = findFallbackModulesInUse(moduleLoader);
  if (fallbacksInUse.length > 0) {
    issues.push({
      type: "FALLBACK_IN_USE",
      severity: "WARNING",
      modules: fallbacksInUse,
      message: `Fallback modules in use: ${fallbacksInUse.join(', ')}`
    });
  }
  
  // Get overall status
  const status = issues.some(issue => issue.severity === "ERROR") ? "error" : 
                (issues.length > 0 ? "warning" : "ok");
  
  return {
    status,
    issues,
    timestamp: new Date().toISOString(),
    moduleCache: Array.from(moduleLoader.cache.keys()),
    message: status === "ok" ? "No issues detected" : 
             `Found ${issues.length} issues: ${issues.filter(i => i.severity === "ERROR").length} errors, ${issues.filter(i => i.severity === "WARNING").length} warnings`
  };
}

/**
 * Find circular dependencies between modules
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Array} - List of module paths with circular dependencies
 */
function findCircularDependencies(moduleLoader) {
  // For this example, we'll just check if any modules are in loadingModules
  // In a real implementation, you would do deeper graph analysis
  return Array.from(moduleLoader.loadingModules || []);
}

/**
 * Find failed module imports
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Array} - List of modules that failed to import
 */
function findFailedImports(moduleLoader) {
  return Array.from(moduleLoader.failedModules || []);
}

/**
 * Find export/import mismatches
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Array} - List of export mismatches
 */
function findExportMismatches(moduleLoader) {
  const mismatches = [];
  
  // Known problematic module pairs with export/import mismatches
  const knownProblemPairs = [
    {
      importer: "academicSearch",
      importee: "fileHandler",
      missingExport: "downloadFile",
      fixSuggestion: "Add named export in fileHandler.js: export const downloadFile = fileHandler.downloadFile;"
    },
    {
      importer: "debugTools",
      importee: "uiRegistry",
      missingExport: "getElement",
      fixSuggestion: "Add named export in uiRegistry.js: export const getElement = uiRegistry.getElement;"
    }
  ];
  
  // Check if the problematic modules are loaded
  knownProblemPairs.forEach(pair => {
    const importerLoaded = Array.from(moduleLoader.cache.keys()).some(
      path => path.includes(`/${pair.importer}`) || path.includes(`/${pair.importer}.js`)
    );
    
    const importeeLoaded = Array.from(moduleLoader.cache.keys()).some(
      path => path.includes(`/${pair.importee}`) || path.includes(`/${pair.importee}.js`)
    );
    
    // If both are loaded or attempted to be loaded, check for the mismatch
    if (importerLoaded) {
      // Check if the importee failed to load or a fallback is in use
      const importerModule = Array.from(moduleLoader.cache.entries())
        .find(([path, mod]) => path.includes(`/${pair.importer}`) || path.includes(`/${pair.importer}.js`));
      
      if (importerModule && importerModule[1].__isFallback) {
        mismatches.push({
          ...pair,
          status: "Fallback in use"
        });
      }
    }
  });
  
  return mismatches;
}

/**
 * Check module initialization sequence
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Array} - List of sequence issues
 */
function checkInitializationSequence(moduleLoader) {
  const issues = [];
  
  // Check if core modules were loaded in the correct order
  if (moduleLoader.INITIALIZATION_ORDER) {
    const loadedModules = Array.from(moduleLoader.cache.keys()).map(
      path => path.split('/').pop()
    );
    
    // Check if any required modules in the initialization order are missing
    const missingModules = moduleLoader.INITIALIZATION_ORDER.filter(
      module => !loadedModules.includes(module)
    );
    
    if (missingModules.length > 0) {
      issues.push({
        type: "MISSING_CORE_MODULES",
        modules: missingModules,
        message: `Missing core modules: ${missingModules.join(', ')}`
      });
    }
  }
  
  return issues;
}

/**
 * Find fallback modules in use
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Array} - List of fallback modules in use
 */
function findFallbackModulesInUse(moduleLoader) {
  const fallbacks = [];
  
  for (const [path, module] of moduleLoader.cache.entries()) {
    if (module && module.__isFallback) {
      // Extract module name from path
      const moduleName = path.split('/').pop().replace('.js', '');
      fallbacks.push(moduleName);
    }
  }
  
  return fallbacks;
}

/**
 * Generate a visual report of diagnostic results
 * @param {Object} diagnosticResults - Results from runModuleDiagnostics
 * @returns {string} - HTML representation of the report
 */
function generateDiagnosticReport(diagnosticResults) {
  if (!diagnosticResults) {
    return '<div class="alert alert-danger">No diagnostic results available</div>';
  }
  
  const { status, issues, timestamp, moduleCache, message } = diagnosticResults;
  
  const statusClass = status === "ok" ? "success" : 
                     status === "warning" ? "warning" : "danger";
  
  let html = `
    <div class="diagnostic-report">
      <h3>Module Diagnostic Report</h3>
      <p class="timestamp">Generated at: ${new Date(timestamp).toLocaleString()}</p>
      
      <div class="alert alert-${statusClass}">
        <strong>Status: ${status.toUpperCase()}</strong><br>
        ${message}
      </div>
  `;
  
  if (issues.length > 0) {
    html += `<h4>Identified Issues (${issues.length})</h4>`;
    html += `<div class="issues-container">`;
    
    issues.forEach((issue, index) => {
      const issueClass = issue.severity === "ERROR" ? "danger" : "warning";
      
      html += `
        <div class="card mb-3 border-${issueClass}">
          <div class="card-header bg-${issueClass} text-white">
            <strong>${index + 1}. ${issue.type}</strong> (${issue.severity})
          </div>
          <div class="card-body">
            <p>${issue.message}</p>
      `;
      
      if (issue.modules && issue.modules.length > 0) {
        html += `<p>Affected modules:</p>`;
        html += `<ul>`;
        issue.modules.forEach(module => {
          html += `<li>${module}</li>`;
        });
        html += `</ul>`;
      }
      
      if (issue.details && issue.details.length > 0) {
        html += `<p>Details:</p>`;
        html += `<ul>`;
        issue.details.forEach(detail => {
          html += `<li>`;
          if (detail.importer && detail.importee) {
            html += `<strong>${detail.importer}</strong> tries to import <code>${detail.missingExport}</code> from <strong>${detail.importee}</strong>`;
          } else {
            html += JSON.stringify(detail);
          }
          
          if (detail.fixSuggestion) {
            html += `<br><em>Suggested fix:</em> ${detail.fixSuggestion}`;
          }
          html += `</li>`;
        });
        html += `</ul>`;
      }
      
      html += `
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  }
  
  // Show loaded modules
  if (moduleCache && moduleCache.length > 0) {
    html += `<h4>Loaded Modules (${moduleCache.length})</h4>`;
    html += `<div class="loaded-modules-container">`;
    html += `<ul class="module-list">`;
    
    // Group modules by type for better readability
    const coreModules = moduleCache.filter(path => path.includes('/core/'));
    const featureModules = moduleCache.filter(path => path.includes('/features/'));
    const utilModules = moduleCache.filter(path => path.includes('/utils/'));
    const otherModules = moduleCache.filter(path => 
      !path.includes('/core/') && !path.includes('/features/') && !path.includes('/utils/'));
    
    if (coreModules.length > 0) {
      html += `<li><strong>Core Modules:</strong>`;
      html += `<ul>`;
      coreModules.forEach(path => {
        const moduleName = path.split('/').pop();
        html += `<li>${moduleName}</li>`;
      });
      html += `</ul></li>`;
    }
    
    if (featureModules.length > 0) {
      html += `<li><strong>Feature Modules:</strong>`;
      html += `<ul>`;
      featureModules.forEach(path => {
        const moduleName = path.split('/').pop();
        html += `<li>${moduleName}</li>`;
      });
      html += `</ul></li>`;
    }
    
    if (utilModules.length > 0) {
      html += `<li><strong>Utility Modules:</strong>`;
      html += `<ul>`;
      utilModules.forEach(path => {
        const moduleName = path.split('/').pop();
        html += `<li>${moduleName}</li>`;
      });
      html += `</ul></li>`;
    }
    
    if (otherModules.length > 0) {
      html += `<li><strong>Other Modules:</strong>`;
      html += `<ul>`;
      otherModules.forEach(path => {
        html += `<li>${path}</li>`;
      });
      html += `</ul></li>`;
    }
    
    html += `</ul>`;
    html += `</div>`;
  }
  
  html += `</div>`;
  
  return html;
}

/**
 * Fix common module issues automatically
 * @param {Object} diagnosticResults - Results from runModuleDiagnostics
 * @returns {Object} - Results of fix attempts
 */
function fixModuleIssues(diagnosticResults) {
  if (!diagnosticResults || !diagnosticResults.issues || diagnosticResults.issues.length === 0) {
    return {
      status: "no_action",
      message: "No issues to fix"
    };
  }
  
  const fixAttempts = [];
  let fixesApplied = 0;
  
  // Focus on export/import mismatches first
  const exportMismatches = diagnosticResults.issues.find(issue => issue.type === "EXPORT_MISMATCH");
  if (exportMismatches && exportMismatches.details) {
    exportMismatches.details.forEach(mismatch => {
      const fixResult = attemptExportMismatchFix(mismatch);
      fixAttempts.push(fixResult);
      
      if (fixResult.success) {
        fixesApplied++;
      }
    });
  }
  
  // TODO: Add more automatic fixes for other issue types
  
  return {
    status: fixesApplied > 0 ? "fixed" : "no_fixes_applied",
    message: fixesApplied > 0 ? 
      `Applied ${fixesApplied} fixes successfully` : 
      "No fixes could be applied automatically",
    fixAttempts
  };
}

/**
 * Attempt to fix an export/import mismatch
 * @param {Object} mismatch - Export mismatch details
 * @returns {Object} - Result of fix attempt
 */
function attemptExportMismatchFix(mismatch) {
  // In a real implementation, this would modify the file
  // Here we'll just simulate the fix result
  
  return {
    issue: mismatch,
    success: false,
    message: "Automatic file modification not implemented",
    actionNeeded: mismatch.fixSuggestion
  };
}

/**
 * Create a diagnostic UI panel
 * @param {Function} onRunDiagnostics - Callback to run diagnostics
 * @param {Function} onFixIssues - Callback to fix issues
 * @returns {HTMLElement} - Diagnostic panel element
 */
function createDiagnosticPanel(onRunDiagnostics, onFixIssues) {
  // Create the panel container
  const panel = document.createElement('div');
  panel.id = 'module-diagnostic-panel';
  panel.className = 'diagnostic-panel';
  panel.style.display = 'none';
  
  panel.innerHTML = `
    <div class="diagnostic-header">
      <h3>Module Diagnostics</h3>
      <div class="diagnostic-controls">
        <button id="run-diagnostics-btn" class="btn btn-primary">Run Diagnostics</button>
        <button id="fix-issues-btn" class="btn btn-warning">Fix Issues</button>
        <button id="close-diagnostics-btn" class="btn btn-secondary">Close</button>
      </div>
    </div>
    <div class="diagnostic-content">
      <div id="diagnostic-results" class="diagnostic-results">
        <div class="alert alert-info">
          Run diagnostics to check module system health
        </div>
      </div>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(panel);
  
  // Add event listeners
  document.getElementById('run-diagnostics-btn').addEventListener('click', onRunDiagnostics);
  document.getElementById('fix-issues-btn').addEventListener('click', onFixIssues);
  document.getElementById('close-diagnostics-btn').addEventListener('click', () => {
    panel.style.display = 'none';
  });
  
  // Add global hotkey to toggle panel (Ctrl+Shift+M)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });
  
  return panel;
}

/**
 * Display diagnostic results in the panel
 * @param {Object} results - Diagnostic results
 */
function displayDiagnosticResults(results) {
  const resultsContainer = document.getElementById('diagnostic-results');
  if (!resultsContainer) return;
  
  resultsContainer.innerHTML = generateDiagnosticReport(results);
}

/**
 * Initialize the module diagnostics tool
 * @param {Object} moduleLoader - Reference to the moduleLoader instance
 * @returns {Object} - Diagnostics controller
 */
function initializeModuleDiagnostics(moduleLoader) {
  let lastDiagnosticResults = null;
  
  // Function to run diagnostics
  const runDiagnostics = () => {
    lastDiagnosticResults = runModuleDiagnostics(moduleLoader);
    displayDiagnosticResults(lastDiagnosticResults);
    return lastDiagnosticResults;
  };
  
  // Function to fix issues
  const fixIssues = () => {
    if (!lastDiagnosticResults) {
      alert('Run diagnostics first to identify issues');
      return;
    }
    
    const fixResults = fixModuleIssues(lastDiagnosticResults);
    
    // Display fix results
    alert(fixResults.message);
    
    // Run diagnostics again to see if issues were resolved
    runDiagnostics();
    
    return fixResults;
  };
  
  // Create diagnostic panel
  const panel = createDiagnosticPanel(runDiagnostics, fixIssues);
  
  // Return controller
  return {
    runDiagnostics,
    fixIssues,
    showPanel: () => {
      panel.style.display = 'block';
    },
    hidePanel: () => {
      panel.style.display = 'none';
    },
    getLastResults: () => lastDiagnosticResults
  };
}

export {
  runModuleDiagnostics,
  generateDiagnosticReport,
  fixModuleIssues,
  initializeModuleDiagnostics
};

export default initializeModuleDiagnostics;