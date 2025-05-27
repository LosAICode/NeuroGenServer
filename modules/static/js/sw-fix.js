/**
 * Service Worker Fix
 * Prevents SW registration failures from blocking initialization
 */

(function() {
    'use strict';
    
    // Store original register function
    const originalRegister = navigator.serviceWorker?.register;
    
    if (navigator.serviceWorker && originalRegister) {
        // Override service worker registration
        navigator.serviceWorker.register = function(scriptURL, options) {
            console.log('🔧 Service Worker registration intercepted');
            
            // Check if SW file exists first
            return fetch(scriptURL, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok) {
                        console.warn(`⚠️ Service Worker script not found: ${scriptURL}`);
                        // Return a mock registration to prevent errors
                        return {
                            installing: null,
                            waiting: null,
                            active: null,
                            scope: options?.scope || '/',
                            unregister: () => Promise.resolve(true),
                            update: () => Promise.resolve()
                        };
                    }
                    
                    // Script exists, proceed with registration but don't block on it
                    return originalRegister.call(navigator.serviceWorker, scriptURL, options)
                        .catch(error => {
                            console.warn('⚠️ Service Worker registration failed (non-blocking):', error.message);
                            // Return mock registration on failure
                            return {
                                installing: null,
                                waiting: null,
                                active: null,
                                scope: options?.scope || '/',
                                unregister: () => Promise.resolve(true),
                                update: () => Promise.resolve()
                            };
                        });
                })
                .catch(error => {
                    console.warn('⚠️ Could not check Service Worker script:', error.message);
                    // Return mock registration
                    return {
                        installing: null,
                        waiting: null,
                        active: null,
                        scope: options?.scope || '/',
                        unregister: () => Promise.resolve(true),
                        update: () => Promise.resolve()
                    };
                });
        };
        
        console.log('✅ Service Worker error handling installed');
    }
})();