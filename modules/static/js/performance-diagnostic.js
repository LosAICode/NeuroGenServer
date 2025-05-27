/**
 * Performance Diagnostic Tool
 * Run after page load to verify all fixes are working
 */

window.NeuroGenDiagnostic = {
    runDiagnostic() {
        console.log('\n🔍 NeuroGen Performance Diagnostic Report\n' + '='.repeat(50));
        
        // 1. Check initialization time
        const initTime = window.__moduleStats?.getTotalTime() || 'Unknown';
        const initStatus = initTime < 5000 ? '✅' : '❌';
        console.log(`${initStatus} Initialization Time: ${typeof initTime === 'number' ? initTime.toFixed(0) + 'ms' : initTime}`);
        
        // 2. Check module load times
        if (window.__moduleStats?.loadTimes) {
            const slowModules = window.__moduleStats.getSlowModules(500);
            if (slowModules.length > 0) {
                console.log('❌ Slow modules detected:');
                slowModules.forEach(([module, time]) => {
                    console.log(`   - ${module}: ${time.toFixed(0)}ms`);
                });
            } else {
                console.log('✅ All modules loaded quickly');
            }
        }
        
        // 3. Check Service Worker
        if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                    console.log('✅ Service Worker registered');
                } else {
                    console.log('⚠️ Service Worker not registered (may be intentional)');
                }
            });
        }
        
        // 4. Check for duplicate loads
        if (window.__loadedModules) {
            console.log(`✅ Modules loaded: ${window.__loadedModules.size}`);
            if (window.__loadingModules && window.__loadingModules.size > 0) {
                console.log(`⚠️ Still loading: ${window.__loadingModules.size} modules`);
            }
        }
        
        // 5. Check cache effectiveness
        if (window.moduleCache) {
            console.log(`✅ Module cache size: ${window.moduleCache.size}`);
        }
        
        // 6. Check for errors
        if (window.__loadingStages?.errors?.length > 0) {
            console.log(`❌ Loading errors: ${window.__loadingStages.errors.length}`);
            window.__loadingStages.errors.forEach((err, i) => {
                console.log(`   ${i + 1}. ${err.message}`);
            });
        } else {
            console.log('✅ No loading errors');
        }
        
        // 7. Performance metrics
        if (window.NeuroGenPerformance) {
            const metrics = window.NeuroGenPerformance.getMetrics();
            console.log('\n📊 Performance Metrics:');
            console.log(`   Total Init: ${metrics.totalInitTime.toFixed(0)}ms`);
            console.log(`   Slowest Modules:`);
            metrics.slowestModules.forEach(m => {
                console.log(`   - ${m.name}: ${m.time}`);
            });
        }
        
        // 8. Check console throttling
        console.log(`✅ Console logging: ${window.consoleThrottled ? 'Throttled' : 'Normal'}`);
        
        // 9. Summary
        console.log('\n' + '='.repeat(50));
        const issues = [];
        if (initTime > 5000) issues.push('Slow initialization');
        if (slowModules?.length > 0) issues.push('Slow modules');
        if (window.__loadingStages?.errors?.length > 0) issues.push('Loading errors');
        
        if (issues.length === 0) {
            console.log('✅ All systems operational! Performance optimized.');
        } else {
            console.log(`⚠️ Issues detected: ${issues.join(', ')}`);
        }
        
        return {
            initTime,
            slowModules: slowModules || [],
            errors: window.__loadingStages?.errors || [],
            cacheSize: window.moduleCache?.size || 0,
            status: issues.length === 0 ? 'optimal' : 'suboptimal'
        };
    },
    
    // Quick status check
    getStatus() {
        const initTime = window.__moduleStats?.getTotalTime() || Infinity;
        return {
            healthy: initTime < 5000,
            initTime: initTime,
            recommendation: initTime < 5000 
                ? 'System is performing well' 
                : 'Clear cache and reload (Ctrl+F5)'
        };
    }
};

// Auto-run diagnostic after full page load
window.addEventListener('load', () => {
    setTimeout(() => {
        console.log('💡 Run window.NeuroGenDiagnostic.runDiagnostic() for full report');
    }, 2000);
});