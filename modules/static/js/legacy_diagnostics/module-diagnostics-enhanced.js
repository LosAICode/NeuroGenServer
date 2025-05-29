/**
 * Enhanced Module Diagnostics Tool
 * Provides comprehensive diagnostics for the NeuroGen module system
 * with auto-fix capabilities and performance optimization suggestions
 */

export class EnhancedModuleDiagnostics {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      startTime: performance.now(),
      modules: new Map(),
      errors: [],
      warnings: [],
      performance: {},
      suggestions: [],
      autoFixes: []
    };
  }

  /**
   * Run comprehensive diagnostics
   */
  async runFullDiagnostics() {
    console.log('🔍 Starting Enhanced Module Diagnostics...');
    
    // Phase 1: Check environment
    await this.checkEnvironment();
    
    // Phase 2: Analyze module loader
    await this.analyzeModuleLoader();
    
    // Phase 3: Test module loading
    await this.testModuleLoading();
    
    // Phase 4: Check performance
    await this.checkPerformance();
    
    // Phase 5: Generate report
    const report = this.generateReport();
    
    // Phase 6: Apply auto-fixes if needed
    if (this.results.autoFixes.length > 0) {
      await this.applyAutoFixes();
    }
    
    return report;
  }

  /**
   * Check browser environment and capabilities
   */
  async checkEnvironment() {
    console.log('📋 Checking environment...');
    
    const env = {
      browser: navigator.userAgent,
      modules: 'noModule' in HTMLScriptElement.prototype,
      serviceWorker: 'serviceWorker' in navigator,
      webSocket: 'WebSocket' in window,
      localStorage: this.checkLocalStorage(),
      performance: 'performance' in window && 'memory' in performance,
      connectionSpeed: await this.checkConnectionSpeed()
    };
    
    this.results.environment = env;
    
    // Check for issues
    if (!env.modules) {
      this.addError('ES6 modules not supported', 'Consider using a modern browser');
    }
    
    if (!env.localStorage) {
      this.addWarning('LocalStorage unavailable', 'Some features may not persist');
    }
    
    if (env.connectionSpeed < 1) {
      this.addWarning('Slow connection detected', 'Module loading may take longer');
    }
  }

  /**
   * Analyze the module loader state
   */
  async analyzeModuleLoader() {
    console.log('🔧 Analyzing module loader...');
    
    // Check if module loader exists
    if (!window.moduleLoader) {
      this.addError('Module loader not found', 'Index.js may not have loaded correctly');
      this.addAutoFix('reinitialize', 'Reinitialize module loader');
      return;
    }
    
    // Get loader status
    const status = window.moduleLoader.getStatus();
    this.results.loaderStatus = status;
    
    // Check for common issues
    if (status.failed > 0) {
      this.addWarning(`${status.failed} modules failed to load`, 'Check console for errors');
    }
    
    if (status.pending > 0) {
      this.addWarning(`${status.pending} modules still loading`, 'May indicate timeout issues');
    }
    
    // Check module configuration
    if (window.MODULE_CONFIG) {
      const totalModules = Object.values(window.MODULE_CONFIG)
        .reduce((sum, cat) => sum + (cat.paths?.length || 0), 0);
      
      if (status.loaded < totalModules * 0.8) {
        this.addWarning('Less than 80% of modules loaded', 'System may not function properly');
      }
    }
  }

  /**
   * Test individual module loading
   */
  async testModuleLoading() {
    console.log('🧪 Testing module loading...');
    
    const criticalModules = [
      '/static/js/modules/core/errorHandler.js',
      '/static/js/modules/utils/socketHandler.js',
      '/static/js/modules/utils/progressHandler.js'
    ];
    
    for (const modulePath of criticalModules) {
      const startTime = performance.now();
      
      try {
        const module = await import(modulePath);
        const loadTime = performance.now() - startTime;
        
        this.results.modules.set(modulePath, {
          status: 'success',
          loadTime,
          exports: Object.keys(module)
        });
        
        if (loadTime > 1000) {
          this.addWarning(`Slow module load: ${modulePath}`, `Took ${loadTime.toFixed(0)}ms`);
        }
      } catch (error) {
        this.results.modules.set(modulePath, {
          status: 'error',
          error: error.message
        });
        
        this.addError(`Failed to load ${modulePath}`, error.message);
        this.addAutoFix('reload-module', modulePath);
      }
    }
  }

  /**
   * Check performance metrics
   */
  async checkPerformance() {
    console.log('📊 Checking performance...');
    
    const perf = {
      pageLoadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
      domReadyTime: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
      resourceCount: performance.getEntriesByType('resource').length,
      longTasks: this.getLongTasks(),
      memory: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
      } : null
    };
    
    this.results.performance = perf;
    
    // Performance suggestions
    if (perf.pageLoadTime > 10000) {
      this.addSuggestion('Optimize page load time', 'Consider lazy loading non-critical modules');
    }
    
    if (perf.resourceCount > 100) {
      this.addSuggestion('High resource count', 'Consider bundling resources');
    }
    
    if (perf.memory && perf.memory.used > 100) {
      this.addWarning('High memory usage', `Using ${perf.memory.used}MB`);
    }
  }

  /**
   * Apply automatic fixes
   */
  async applyAutoFixes() {
    console.log('🔧 Applying auto-fixes...');
    
    for (const fix of this.results.autoFixes) {
      try {
        switch (fix.type) {
          case 'reinitialize':
            await this.reinitializeModuleLoader();
            break;
          case 'reload-module':
            await this.reloadModule(fix.target);
            break;
          case 'clear-cache':
            this.clearModuleCache();
            break;
        }
        
        fix.applied = true;
        console.log(`✅ Applied fix: ${fix.type}`);
      } catch (error) {
        fix.error = error.message;
        console.error(`❌ Failed to apply fix: ${fix.type}`, error);
      }
    }
  }

  /**
   * Reinitialize the module loader
   */
  async reinitializeModuleLoader() {
    if (window.initializeApp) {
      await window.initializeApp();
    } else {
      throw new Error('initializeApp function not found');
    }
  }

  /**
   * Reload a specific module
   */
  async reloadModule(modulePath) {
    if (window.moduleLoader && window.moduleLoader.reloadModule) {
      await window.moduleLoader.reloadModule(modulePath);
    } else {
      // Fallback: try direct import
      await import(modulePath + '?t=' + Date.now());
    }
  }

  /**
   * Clear module cache
   */
  clearModuleCache() {
    if (window.moduleLoader && window.moduleLoader.clearCache) {
      window.moduleLoader.clearCache();
    }
    
    // Clear browser module cache (limited effectiveness)
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('module')) {
            caches.delete(name);
          }
        });
      });
    }
  }

  /**
   * Helper methods
   */
  checkLocalStorage() {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async checkConnectionSpeed() {
    const startTime = performance.now();
    try {
      await fetch('/static/js/modules/core/errorHandler.js', { method: 'HEAD' });
      const duration = performance.now() - startTime;
      return 1000 / duration; // Rough speed estimate
    } catch {
      return 0;
    }
  }

  getLongTasks() {
    if (!window.PerformanceObserver) return [];
    
    const longTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      observer.disconnect();
    } catch {}
    
    return longTasks;
  }

  addError(message, details) {
    this.results.errors.push({ message, details, timestamp: Date.now() });
  }

  addWarning(message, details) {
    this.results.warnings.push({ message, details, timestamp: Date.now() });
  }

  addSuggestion(title, description) {
    this.results.suggestions.push({ title, description });
  }

  addAutoFix(type, target) {
    this.results.autoFixes.push({ type, target, applied: false });
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const duration = performance.now() - this.results.startTime;
    
    const report = {
      ...this.results,
      duration,
      summary: {
        healthy: this.results.errors.length === 0,
        errorCount: this.results.errors.length,
        warningCount: this.results.warnings.length,
        modulesChecked: this.results.modules.size,
        autoFixesApplied: this.results.autoFixes.filter(f => f.applied).length
      }
    };
    
    // Add health score
    let healthScore = 100;
    healthScore -= this.results.errors.length * 20;
    healthScore -= this.results.warnings.length * 5;
    healthScore = Math.max(0, healthScore);
    
    report.summary.healthScore = healthScore;
    report.summary.status = 
      healthScore >= 80 ? 'HEALTHY' :
      healthScore >= 50 ? 'WARNING' : 'CRITICAL';
    
    return report;
  }

  /**
   * Display report in console with formatting
   */
  displayReport(report) {
    console.group('🏥 Module Diagnostics Report');
    
    // Summary
    const statusEmoji = {
      'HEALTHY': '✅',
      'WARNING': '⚠️',
      'CRITICAL': '❌'
    }[report.summary.status];
    
    console.log(`${statusEmoji} Status: ${report.summary.status} (${report.summary.healthScore}%)`);
    console.log(`⏱️ Duration: ${report.duration.toFixed(2)}ms`);
    
    // Errors
    if (report.errors.length > 0) {
      console.group('❌ Errors');
      report.errors.forEach(err => {
        console.error(`${err.message}: ${err.details}`);
      });
      console.groupEnd();
    }
    
    // Warnings
    if (report.warnings.length > 0) {
      console.group('⚠️ Warnings');
      report.warnings.forEach(warn => {
        console.warn(`${warn.message}: ${warn.details}`);
      });
      console.groupEnd();
    }
    
    // Suggestions
    if (report.suggestions.length > 0) {
      console.group('💡 Suggestions');
      report.suggestions.forEach(sug => {
        console.log(`${sug.title}: ${sug.description}`);
      });
      console.groupEnd();
    }
    
    // Auto-fixes
    if (report.autoFixes.length > 0) {
      console.group('🔧 Auto-fixes');
      report.autoFixes.forEach(fix => {
        const status = fix.applied ? '✅' : (fix.error ? '❌' : '⏳');
        console.log(`${status} ${fix.type}: ${fix.target || 'system'}`);
        if (fix.error) console.error(`   Error: ${fix.error}`);
      });
      console.groupEnd();
    }
    
    // Performance
    console.group('📊 Performance');
    console.table({
      'Page Load': `${report.performance.pageLoadTime}ms`,
      'DOM Ready': `${report.performance.domReadyTime}ms`,
      'Resources': report.performance.resourceCount,
      'Memory': report.performance.memory ? 
        `${report.performance.memory.used}MB / ${report.performance.memory.total}MB` : 'N/A'
    });
    console.groupEnd();
    
    console.groupEnd();
  }
}

// Auto-run diagnostics with visual feedback
export async function runDiagnosticsWithUI() {
  const diagnostics = new EnhancedModuleDiagnostics();
  
  // Create visual indicator
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-family: monospace;
    z-index: 10000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  indicator.innerHTML = '🔍 Running diagnostics...';
  document.body.appendChild(indicator);
  
  try {
    const report = await diagnostics.runFullDiagnostics();
    
    // Update indicator
    const emoji = report.summary.healthy ? '✅' : '⚠️';
    indicator.innerHTML = `${emoji} Diagnostics complete! Check console for details.`;
    indicator.style.background = report.summary.healthy ? 
      'rgba(0,128,0,0.8)' : 'rgba(255,165,0,0.8)';
    
    // Display report
    diagnostics.displayReport(report);
    
    // Remove indicator after 5 seconds
    setTimeout(() => indicator.remove(), 5000);
    
    return report;
  } catch (error) {
    indicator.innerHTML = '❌ Diagnostics failed!';
    indicator.style.background = 'rgba(255,0,0,0.8)';
    console.error('Diagnostics error:', error);
    setTimeout(() => indicator.remove(), 5000);
    throw error;
  }
}

// Export for console usage
window.EnhancedModuleDiagnostics = EnhancedModuleDiagnostics;
window.runDiagnosticsWithUI = runDiagnosticsWithUI;

// Auto-run if requested via URL parameter
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('diagnose') === 'true') {
  setTimeout(runDiagnosticsWithUI, 1000);
}

export default EnhancedModuleDiagnostics;