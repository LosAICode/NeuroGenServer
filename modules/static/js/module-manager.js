/**
 * Module Manager - Centralized module lifecycle management
 * Handles initialization, cleanup, and event management for all modules
 */

class ModuleManager {
    constructor() {
        this.modules = new Map();
        this.eventListeners = new Map();
        this.initialized = false;
    }

    /**
     * Register a module for lifecycle management
     */
    register(name, moduleInstance) {
        console.log(`📦 Registering module: ${name}`);
        
        // Cleanup existing instance if present
        if (this.modules.has(name)) {
            this.cleanup(name);
        }
        
        this.modules.set(name, {
            instance: moduleInstance,
            initialized: false,
            listeners: []
        });
    }

    /**
     * Initialize a specific module
     */
    async initialize(name) {
        const module = this.modules.get(name);
        if (!module) {
            console.error(`❌ Module not found: ${name}`);
            return false;
        }

        try {
            console.log(`🔧 Initializing ${name}...`);
            
            // Cleanup first to prevent duplicates
            this.cleanup(name);
            
            // Initialize the module
            if (module.instance.initialize) {
                await module.instance.initialize();
            }
            
            module.initialized = true;
            console.log(`✅ ${name} initialized successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to initialize ${name}:`, error);
            return false;
        }
    }

    /**
     * Cleanup a module (remove event listeners, etc.)
     */
    cleanup(name) {
        const module = this.modules.get(name);
        if (!module) return;

        console.log(`🧹 Cleaning up ${name}...`);
        
        // Remove registered event listeners
        module.listeners.forEach(({ element, event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        
        // Clear the listeners array
        module.listeners = [];
        
        // Call module's cleanup if it exists
        if (module.instance.cleanup) {
            module.instance.cleanup();
        }
        
        module.initialized = false;
    }

    /**
     * Add an event listener with automatic cleanup tracking
     */
    addEventListener(moduleName, element, event, handler, options = {}) {
        const module = this.modules.get(moduleName);
        if (!module) {
            console.error(`❌ Cannot add listener: Module ${moduleName} not registered`);
            return;
        }

        // Add the listener
        if (element && element.addEventListener) {
            element.addEventListener(event, handler, options);
            
            // Track for cleanup
            module.listeners.push({ element, event, handler });
            
            console.log(`🎧 Added ${event} listener for ${moduleName}`);
        }
    }

    /**
     * Get module status
     */
    getStatus(name) {
        const module = this.modules.get(name);
        return module ? {
            registered: true,
            initialized: module.initialized,
            listenerCount: module.listeners.length
        } : { registered: false };
    }

    /**
     * Initialize all registered modules
     */
    async initializeAll() {
        console.log('🚀 Initializing all modules...');
        
        for (const [name] of this.modules) {
            await this.initialize(name);
        }
        
        this.initialized = true;
        console.log('✅ All modules initialized');
    }

    /**
     * Get debug information
     */
    getDebugInfo() {
        const info = {};
        for (const [name, module] of this.modules) {
            info[name] = this.getStatus(name);
        }
        return info;
    }
}

// Create global instance
window.moduleManager = new ModuleManager();

export default window.moduleManager;