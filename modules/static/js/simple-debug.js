/**
 * Simple Debug Tool for NeuroGen Server
 * Provides basic debugging without complex dependencies
 */

window.SimpleDebug = {
    
    // Check system status
    getStatus() {
        return {
            appInitialized: window.appInitialized || false,
            moduleCount: Object.keys(window.moduleInstances || {}).length,
            moduleManagerExists: !!window.moduleManager,
            currentTime: new Date().toISOString()
        };
    },
    
    // List loaded modules
    listModules() {
        if (!window.moduleInstances) {
            return 'No modules loaded';
        }
        
        console.log('📦 Loaded Modules:');
        Object.keys(window.moduleInstances).forEach(name => {
            console.log(`  ✅ ${name}`);
        });
        
        return Object.keys(window.moduleInstances);
    },
    
    // Check button elements
    checkButtons() {
        const buttons = {
            'submit-btn': document.getElementById('submit-btn'),
            'process-form': document.getElementById('process-form'),
            'browse-btn': document.getElementById('browse-btn'),
            'folder-input': document.getElementById('folder-input')
        };
        
        console.log('🔘 Button Status:');
        Object.entries(buttons).forEach(([name, element]) => {
            const exists = !!element;
            const hasListeners = element && element.onclick !== null;
            console.log(`  ${exists ? '✅' : '❌'} ${name} - ${exists ? 'Found' : 'Missing'}${hasListeners ? ' (has listeners)' : ''}`);
        });
        
        return buttons;
    },
    
    // Test module manager
    testModuleManager() {
        if (!window.moduleManager) {
            console.error('❌ Module Manager not found');
            return false;
        }
        
        console.log('🔧 Module Manager Status:');
        const debug = window.moduleManager.getDebugInfo();
        Object.entries(debug).forEach(([name, status]) => {
            console.log(`  ${status.initialized ? '✅' : '⚠️'} ${name} - ${status.initialized ? 'Initialized' : 'Not initialized'} (${status.listenerCount} listeners)`);
        });
        
        return debug;
    },
    
    // Quick health check
    healthCheck() {
        console.log('🏥 NeuroGen Health Check:');
        
        const status = this.getStatus();
        console.log('📊 System Status:', status);
        
        const modules = this.listModules();
        const buttons = this.checkButtons();
        const moduleManager = this.testModuleManager();
        
        // Summary
        const healthy = status.appInitialized && 
                       status.moduleCount > 5 && 
                       status.moduleManagerExists &&
                       buttons['submit-btn'] &&
                       buttons['process-form'];
                       
        console.log(`\n${healthy ? '✅' : '❌'} Overall Status: ${healthy ? 'HEALTHY' : 'ISSUES DETECTED'}`);
        
        if (!healthy) {
            console.log('\n🔧 Troubleshooting:');
            if (!status.appInitialized) console.log('  - App not initialized - check console for errors');
            if (status.moduleCount < 5) console.log('  - Too few modules loaded - check network tab');
            if (!buttons['submit-btn']) console.log('  - Submit button missing - check HTML');
            if (!buttons['process-form']) console.log('  - Form missing - check HTML');
        }
        
        return { healthy, status, modules, buttons, moduleManager };
    }
};

// Auto-run basic check after page load
window.addEventListener('neurogenInitialized', () => {
    setTimeout(() => {
        console.log('\n💡 Run window.SimpleDebug.healthCheck() for full system status');
    }, 1000);
});

console.log('🔧 Simple Debug Tool Loaded');
console.log('💡 Commands available:');
console.log('  - window.SimpleDebug.healthCheck()');
console.log('  - window.SimpleDebug.listModules()');
console.log('  - window.SimpleDebug.checkButtons()');
console.log('  - window.SimpleDebug.testModuleManager()');

export default window.SimpleDebug;