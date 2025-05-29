/**
 * Blueprint Alignment Validation Script
 * 
 * Validates that all frontend modules are properly aligned with the Flask Blueprint backend.
 * Checks for proper imports, API usage, and event handling.
 * 
 * Run this script to validate the frontend-backend alignment.
 */

// Blueprint validation configuration
const VALIDATION_CONFIG = {
  // Required imports for Blueprint-aligned modules
  REQUIRED_IMPORTS: {
    'blueprintApi': '../services/blueprintApi.js',
    'endpoints': '../config/endpoints.js',
    'socketEvents': '../config/socketEvents.js',
    'constants': '../config/constants.js'
  },
  
  // Deprecated patterns that should not be used
  DEPRECATED_PATTERNS: [
    /fetch\(['"`]\/api\//,  // Direct fetch calls to API endpoints
    /socket\.on\(['"`]progress_update/,  // Old progress event names
    /socket\.on\(['"`]task_completed/,   // Old task event names
    /socket\.emit\(['"`]cancel_task/,    // Old cancel event names
    /\/api\/[^'"`\s\)]+/                 // Hardcoded API endpoints
  ],
  
  // Required Blueprint patterns
  REQUIRED_PATTERNS: {
    'API_CALLS': /blueprintApi\./,
    'CONFIG_USAGE': /from ['"`]\.\.\/config\//,
    'BLUEPRINT_EVENTS': /BLUEPRINT_EVENTS|SOCKET_EVENTS|TASK_EVENTS/
  }
};

/**
 * Validate a single JavaScript file for Blueprint alignment
 * @param {string} filePath - Path to the JavaScript file
 * @param {string} content - File content
 * @returns {Object} Validation result
 */
function validateFile(filePath, content) {
  const result = {
    filePath,
    isAligned: true,
    issues: [],
    warnings: [],
    suggestions: []
  };
  
  // Skip non-module files
  if (filePath.includes('test') || filePath.includes('fix') || filePath.includes('diagnostic')) {
    result.suggestions.push('Non-module file - validation skipped');
    return result;
  }
  
  // Check for deprecated patterns
  VALIDATION_CONFIG.DEPRECATED_PATTERNS.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      result.isAligned = false;
      result.issues.push(`Deprecated pattern found: ${matches[0]}`);
    }
  });
  
  // Check for Blueprint imports in feature modules
  if (filePath.includes('features/') || filePath.includes('services/')) {
    const hasRequiredImports = Object.entries(VALIDATION_CONFIG.REQUIRED_IMPORTS).some(([name, path]) => {
      return content.includes(path) || content.includes(`from '${path}'`) || content.includes(`from "${path}"`);
    });
    
    if (!hasRequiredImports) {
      result.warnings.push('Feature module should import Blueprint configuration');
    }
  }
  
  // Check for proper API usage
  if (content.includes('/api/') && !content.includes('blueprintApi')) {
    result.issues.push('Direct API calls found - should use blueprintApi service');
    result.isAligned = false;
  }
  
  // Check for hardcoded socket events
  if (content.includes("socket.on('progress_update") || content.includes('socket.on("progress_update')) {
    result.issues.push('Hardcoded socket events - should use SOCKET_EVENTS configuration');
    result.isAligned = false;
  }
  
  // Positive checks for Blueprint patterns
  if (filePath.includes('features/')) {
    if (!VALIDATION_CONFIG.REQUIRED_PATTERNS.API_CALLS.test(content)) {
      result.warnings.push('Feature module should use blueprintApi for API calls');
    }
    
    if (!VALIDATION_CONFIG.REQUIRED_PATTERNS.CONFIG_USAGE.test(content)) {
      result.warnings.push('Feature module should import Blueprint configuration');
    }
  }
  
  return result;
}

/**
 * Generate validation report
 * @param {Array} results - Validation results
 * @returns {string} Formatted report
 */
function generateReport(results) {
  let report = '\n=== BLUEPRINT ALIGNMENT VALIDATION REPORT ===\n\n';
  
  const aligned = results.filter(r => r.isAligned);
  const notAligned = results.filter(r => !r.isAligned);
  const withWarnings = results.filter(r => r.warnings.length > 0);
  
  report += `✅ Files properly aligned: ${aligned.length}\n`;
  report += `❌ Files needing updates: ${notAligned.length}\n`;
  report += `⚠️  Files with warnings: ${withWarnings.length}\n`;
  report += `📁 Total files checked: ${results.length}\n\n`;
  
  // Report issues
  if (notAligned.length > 0) {
    report += '❌ FILES NEEDING UPDATES:\n';
    notAligned.forEach(result => {
      report += `\n📄 ${result.filePath}\n`;
      result.issues.forEach(issue => {
        report += `   • ${issue}\n`;
      });
    });
    report += '\n';
  }
  
  // Report warnings
  if (withWarnings.length > 0) {
    report += '⚠️  FILES WITH WARNINGS:\n';
    withWarnings.forEach(result => {
      report += `\n📄 ${result.filePath}\n`;
      result.warnings.forEach(warning => {
        report += `   • ${warning}\n`;
      });
    });
    report += '\n';
  }
  
  // Report properly aligned files
  if (aligned.length > 0) {
    report += '✅ PROPERLY ALIGNED FILES:\n';
    aligned.forEach(result => {
      if (result.issues.length === 0 && result.warnings.length === 0) {
        report += `   • ${result.filePath}\n`;
      }
    });
    report += '\n';
  }
  
  // Overall status
  const overallScore = Math.round((aligned.length / results.length) * 100);
  report += `🎯 OVERALL ALIGNMENT SCORE: ${overallScore}%\n`;
  
  if (overallScore >= 90) {
    report += '🎉 Excellent! Frontend is well-aligned with Blueprint backend.\n';
  } else if (overallScore >= 75) {
    report += '👍 Good alignment. Minor improvements needed.\n';
  } else {
    report += '🔧 Significant updates needed for proper Blueprint alignment.\n';
  }
  
  return report;
}

// Export for use in validation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateFile,
    generateReport,
    VALIDATION_CONFIG
  };
}

// Browser validation interface
if (typeof window !== 'undefined') {
  window.validateBlueprintAlignment = {
    validateFile,
    generateReport,
    config: VALIDATION_CONFIG
  };
}

console.log('🔍 Blueprint Alignment Validation Script Loaded');
console.log('📋 Run validation on your modules to ensure proper Blueprint alignment');