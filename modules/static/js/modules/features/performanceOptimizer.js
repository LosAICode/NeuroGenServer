/**
 * performanceOptimizer.js
 * Optimizes frontend performance with dynamic resource management
 * Implements memory-efficient handling of large datasets and UI interactions
 */

import { registerEvents } from '../core/eventManager.js';
import { getState, setState } from '../core/stateManager.js';
import { showError } from '../core/errorHandler.js';

class PerformanceOptimizer {
    constructor() {
        this.memoryWarningThreshold = 90; // % of memory used before warning
        this.idleCallbacks = new Map();
        this.pendingTasks = new Set();
        this.frameRateSamples = [];
        this.perfConfig = {
            enableLazyLoading: true,
            enableVirtualization: true,
            enableIdleProcessing: true,
            maxItemsPerPage: 100,
            monitorPerformance: true,
            automaticCleanup: true
        };
        this.initialize();
    }

    initialize() {
        // Load saved configuration
        this.loadConfig();
        
        // Setup performance monitoring
        if (this.perfConfig.monitorPerformance) {
            this.startPerformanceMonitoring();
        }
        
        // Setup cleanup cycle
        if (this.perfConfig.automaticCleanup) {
            this.setupAutomaticCleanup();
        }
        
        // Add resize handler for adaptive optimizations
        window.addEventListener('resize', this.debounce(() => {
            this.adaptToViewport();
        }, 200));
        
        // Listen for visibility change to pause/resume intensive operations
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseNonEssentialOperations();
            } else {
                this.resumeOperations();
            }
        });
    }

    loadConfig() {
        const savedConfig = localStorage.getItem('performanceConfig');
        if (savedConfig) {
            try {
                const parsedConfig = JSON.parse(savedConfig);
                this.perfConfig = { ...this.perfConfig, ...parsedConfig };
            } catch (e) {
                console.error('Failed to parse performance config:', e);
            }
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('performanceConfig', JSON.stringify(this.perfConfig));
        } catch (e) {
            console.error('Failed to save performance config:', e);
        }
    }

    startPerformanceMonitoring() {
        // Setup FPS monitoring
        this.fpsMonitorId = this.startFpsMonitoring();
        
        // Check memory usage periodically
        this.memoryCheckIntervalId = setInterval(() => {
            this.checkMemoryUsage();
        }, 30000); // Check every 30 seconds
    }

    stopPerformanceMonitoring() {
        if (this.fpsMonitorId) {
            cancelAnimationFrame(this.fpsMonitorId);
            this.fpsMonitorId = null;
        }
        
        if (this.memoryCheckIntervalId) {
            clearInterval(this.memoryCheckIntervalId);
            this.memoryCheckIntervalId = null;
        }
    }

    startFpsMonitoring() {
        let lastTime = performance.now();
        let frames = 0;
        
        const loop = (time) => {
            // Calculate FPS
            frames++;
            
            if (time - lastTime >= 1000) {
                const fps = Math.round((frames * 1000) / (time - lastTime));
                
                // Store FPS sample
                this.frameRateSamples.push(fps);
                if (this.frameRateSamples.length > 10) {
                    this.frameRateSamples.shift();
                }
                
                // Check if FPS is low
                if (fps < 30) {
                    this.handleLowFrameRate(fps);
                }
                
                frames = 0;
                lastTime = time;
            }
            
            this.fpsMonitorId = requestAnimationFrame(loop);
        };
        
        return requestAnimationFrame(loop);
    }

    checkMemoryUsage() {
        // Memory API only available in Chrome
        if (!performance.memory) return;
        
        const memoryUsed = performance.memory.usedJSHeapSize;
        const memoryLimit = performance.memory.jsHeapSizeLimit;
        const percentUsed = (memoryUsed / memoryLimit) * 100;
        
        // Check if memory usage is high
        if (percentUsed > this.memoryWarningThreshold) {
            this.handleHighMemoryUsage(percentUsed);
        }
    }

    handleLowFrameRate(fps) {
        console.warn(`Low frame rate detected: ${fps} FPS`);
        
        // Check if we need to take action
        if (this.frameRateSamples.length >= 3) {
            const avgFps = this.frameRateSamples.reduce((sum, val) => sum + val, 0) / this.frameRateSamples.length;
            
            if (avgFps < 25) {
                // Performance is consistently poor, take action
                this.applyPerformanceOptimizations();
            }
        }
    }

    handleHighMemoryUsage(percentUsed) {
        console.warn(`High memory usage detected: ${percentUsed.toFixed(1)}%`);
        
        // Force garbage collection if available (only works in some debug modes)
        if (window.gc) {
            window.gc();
        }
        
        // Apply memory optimizations
        this.cleanupUnusedResources();
    }

    applyPerformanceOptimizations() {
        // Check if already optimized
        if (getState('performanceMode') === 'high') return;
        
        // Set high performance mode
        setState('performanceMode', 'high');
        
        // Apply optimizations
        this.perfConfig.maxItemsPerPage = 50; // Reduce items per page
        this.scheduleIdleTask('clearImageCache', () => this.clearImageCache());
        
        // Update config settings
        this.saveConfig();
        
        console.log('Applied performance optimizations due to low frame rate');
    }

    cleanupUnusedResources() {
        // Clean up large arrays in state
        const state = getState();
        let cleanedUp = false;
        
        // Look for large arrays in state that aren't currently visible
        for (const key in state) {
            if (Array.isArray(state[key]) && state[key].length > 100) {
                const containerVisible = this.isContainerVisible(key);
                
                if (!containerVisible) {
                    // Replace with empty array or truncated version
                    const newArray = state[key].slice(0, 20); // Keep first 20 items
                    setState(key, newArray);
                    cleanedUp = true;
                    console.log(`Cleaned up large array: ${key}`);
                }
            }
        }
        
        // Clear any cached data not needed
        this.clearImageCache();
        
        // Force update state with cleaned data
        if (cleanedUp) {
            console.log('Cleaned up unused resources');
        }
    }

    clearImageCache() {
        // Clear any blob URLs that might be stored
        const urls = getState('cachedBlobUrls') || [];
        urls.forEach(url => {
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
        
        setState('cachedBlobUrls', []);
        console.log('Image cache cleared');
    }

    isContainerVisible(stateKey) {
        // Map state keys to possible container IDs
        const containerMap = {
            'searchResults': ['search-results-container', 'academic-results-container'],
            'pdfResults': ['pdf-result-container', 'pdf-preview-container'],
            'scraperResults': ['scraper-results-container'],
            'fileProcessingResults': ['processing-results-container']
        };
        
        const possibleContainers = containerMap[stateKey] || [];
        
        // Check if any container is visible
        return possibleContainers.some(id => {
            const element = document.getElementById(id);
            return element && this.isElementVisible(element);
        });
    }

    isElementVisible(element) {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    pauseNonEssentialOperations() {
        // Cancel pending idle callbacks
        this.idleCallbacks.forEach((id, task) => {
            cancelIdleCallback(id);
            this.pendingTasks.add(task);
        });
        
        // Clear map
        this.idleCallbacks.clear();
        
        // Stop performance monitoring
        this.stopPerformanceMonitoring();
    }

    resumeOperations() {
        // Restart pending tasks
        this.pendingTasks.forEach(task => {
            this.scheduleIdleTask(task, this.idleCallbacks.get(task));
        });
        
        // Clear pending tasks
        this.pendingTasks.clear();
        
        // Restart performance monitoring
        if (this.perfConfig.monitorPerformance) {
            this.startPerformanceMonitoring();
        }
    }

    adaptToViewport() {
        // Get viewport dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Adjust rendering based on screen size
        if (width < 768) {
            // Mobile view
            this.perfConfig.maxItemsPerPage = 20;
            this.perfConfig.enableVirtualization = true;
        } else if (width < 1200) {
            // Tablet view
            this.perfConfig.maxItemsPerPage = 50;
        } else {
            // Desktop view
            this.perfConfig.maxItemsPerPage = 100;
        }
        
        // Update state
        setState('viewport', { width, height });
        
        // Save config
        this.saveConfig();
    }

    setupAutomaticCleanup() {
        // Automatic garbage collection attempts on page idle
        this.scheduleIdleTask('periodicCleanup', () => {
            this.cleanupUnusedResources();
            
            // Reschedule for the future
            setTimeout(() => {
                this.setupAutomaticCleanup();
            }, 60000); // Run every 1 minute when idle
        });
    }

    // Virtualization for large lists
    virtualizeList(items, containerSelector, itemRenderer, options = {}) {
        const defaults = {
            itemHeight: 40,
            overscan: 5,
            onVisibilityChange: null
        };
        
        const config = { ...defaults, ...options };
        const container = document.querySelector(containerSelector);
        
        if (!container || !items || !items.length) return;
        
        // Get container dimensions
        const containerHeight = container.clientHeight;
        const visibleItems = Math.ceil(containerHeight / config.itemHeight) + config.overscan;
        
        // Get scroll position
        const scrollTop = container.scrollTop;
        const startIndex = Math.floor(scrollTop / config.itemHeight);
        const endIndex = Math.min(startIndex + visibleItems, items.length);
        
        // Generate only visible items
        const visibleData = items.slice(startIndex, endIndex);
        
        // Calculate spacer heights
        const topSpacerHeight = startIndex * config.itemHeight;
        const bottomSpacerHeight = (items.length - endIndex) * config.itemHeight;
        
        // Create wrapper HTML
        let html = `
            <div class="virtualized-list" style="position: relative; height: ${items.length * config.itemHeight}px;">
                <div class="top-spacer" style="height: ${topSpacerHeight}px;"></div>
                <div class="visible-items">
        `;
        
        // Add visible items
        visibleData.forEach((item, index) => {
            const actualIndex = startIndex + index;
            html += itemRenderer(item, actualIndex);
        });
        
        html += `
                </div>
                <div class="bottom-spacer" style="height: ${bottomSpacerHeight}px;"></div>
            </div>
        `;
        
        // Update container
        container.innerHTML = html;
        
        // Add scroll event listener
        container.addEventListener('scroll', this.debounce(() => {
            this.virtualizeList(items, containerSelector, itemRenderer, config);
        }, 50));
        
        // Call visibility change callback if provided
        if (config.onVisibilityChange) {
            config.onVisibilityChange(startIndex, endIndex);
        }
    }

    // Utility: Lazy loading for images
    setupLazyLoading(selector = 'img[data-src]') {
        if (!this.perfConfig.enableLazyLoading) return;
        
        const images = document.querySelectorAll(selector);
        
        if (!('IntersectionObserver' in window)) {
            // Fallback for browsers without IntersectionObserver
            images.forEach(img => {
                img.src = img.dataset.src;
            });
            return;
        }
        
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    imageObserver.unobserve(img);
                }
            });
        });
        
        images.forEach(img => {
            imageObserver.observe(img);
        });
    }

    // Utility: Schedule a task to run during idle time
    scheduleIdleTask(key, callback) {
        if (!this.perfConfig.enableIdleProcessing || !('requestIdleCallback' in window)) {
            // Fallback: Run immediately if idle processing not available
            setTimeout(callback, 1);
            return;
        }
        
        // Cancel existing callback with same key
        if (this.idleCallbacks.has(key)) {
            cancelIdleCallback(this.idleCallbacks.get(key));
        }
        
        // Schedule new callback
        const id = requestIdleCallback((deadline) => {
            if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
                callback();
            } else {
                // Not enough time, reschedule
                this.scheduleIdleTask(key, callback);
            }
        }, { timeout: 2000 }); // 2 second timeout
        
        this.idleCallbacks.set(key, id);
    }

    // Utility: Debounce function
    debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Utility: Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Public API: Get pagination parameters
    getPaginationParams(totalItems, currentPage = 1) {
        const itemsPerPage = this.perfConfig.maxItemsPerPage;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        
        return {
            itemsPerPage,
            totalPages,
            currentPage,
            startIndex,
            endIndex,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1
        };
    }

    // Public API: Optimize large JSON data
    optimizeJsonData(data) {
        // If data is already a string, parse it
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return data; // Return original if parsing fails
            }
        }
        
        // Function to recursively process objects
        const processObject = (obj, depth = 0) => {
            // Don't process too deep
            if (depth > 10) return obj;
            
            // Handle arrays
            if (Array.isArray(obj)) {
                // Limit array size if very large
                if (obj.length > 1000) {
                    return obj.slice(0, 1000); // Truncate very large arrays
                }
                
                // Process array items
                return obj.map(item => processObject(item, depth + 1));
            }
            
            // Handle objects
            if (obj && typeof obj === 'object') {
                const result = {};
                
                // Process each property
                for (const key in obj) {
                    // Skip functions
                    if (typeof obj[key] === 'function') continue;
                    
                    // Process nested objects/arrays
                    result[key] = processObject(obj[key], depth + 1);
                }
                
                return result;
            }
            
            // Return primitives as is
            return obj;
        };
        
        return processObject(data);
    }

    // Public API: Update configuration
    updateConfig(newConfig) {
        this.perfConfig = { ...this.perfConfig, ...newConfig };
        this.saveConfig();
        
        // Apply changes
        if (newConfig.monitorPerformance !== undefined) {
            if (newConfig.monitorPerformance) {
                this.startPerformanceMonitoring();
            } else {
                this.stopPerformanceMonitoring();
            }
        }
    }
}

const performanceOptimizer = new PerformanceOptimizer();

export default performanceOptimizer;

// Export default module
export default containerMap;
