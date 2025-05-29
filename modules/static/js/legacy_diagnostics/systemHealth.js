/**
 * System Health Monitor Module
 * 
 * Monitors and reports system health status
 * Extracted from index.html to prevent conflicts with the modular system
 */

import { getElement } from './domUtils.js';

class SystemHealthMonitor {
  constructor() {
    this.healthIndicator = null;
    this.statusHistory = [];
    this.initialized = false;
    this.checkInterval = null;
    this.lastStatus = null;
  }

  /**
   * Initialize the system health monitor
   */
  initialize() {
    if (this.initialized) {
      console.warn('System health monitor already initialized');
      return;
    }

    this.createHealthIndicator();
    this.startMonitoring();
    this.initialized = true;
    console.log('System health monitor initialized');
  }

  /**
   * Create the health indicator element
   */
  createHealthIndicator() {
    // Remove any existing indicator
    const existing = document.getElementById('system-health-indicator');
    if (existing) {
      existing.remove();
    }

    this.healthIndicator = document.createElement('div');
    this.healthIndicator.id = 'system-health-indicator';
    this.healthIndicator.className = 'system-health-indicator';
    this.healthIndicator.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 9999;
      display: none;
      transition: all 0.3s ease;
      cursor: pointer;
    `;

    // Add click handler to show detailed status
    this.healthIndicator.addEventListener('click', () => this.showDetailedStatus());

    document.body.appendChild(this.healthIndicator);
  }

  /**
   * Update health status
   * @param {string} status - Status type (ok, warning, error, loading)
   * @param {string} message - Status message
   * @param {Object} details - Additional details
   */
  updateStatus(status, message, details = {}) {
    if (!this.healthIndicator) return;

    const timestamp = new Date();
    this.lastStatus = { status, message, details, timestamp };
    this.statusHistory.push(this.lastStatus);

    // Keep only last 50 status updates
    if (this.statusHistory.length > 50) {
      this.statusHistory.shift();
    }

    this.healthIndicator.style.display = 'block';

    switch (status) {
      case 'ok':
        this.healthIndicator.style.background = 'rgba(40, 167, 69, 0.8)';
        this.healthIndicator.innerHTML = '<i class="fas fa-check-circle"></i> System healthy';
        
        // Auto-hide after 2 seconds for OK status
        setTimeout(() => {
          if (this.lastStatus && this.lastStatus.status === 'ok') {
            this.healthIndicator.style.display = 'none';
          }
        }, 2000);
        break;

      case 'loading':
        this.healthIndicator.style.background = 'rgba(0, 123, 255, 0.8)';
        this.healthIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message || 'Loading...'}`;
        break;

      case 'warning':
        this.healthIndicator.style.background = 'rgba(255, 193, 7, 0.8)';
        this.healthIndicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message || 'Warning: System experiencing issues'}`;
        break;

      case 'error':
        this.healthIndicator.style.background = 'rgba(220, 53, 69, 0.8)';
        this.healthIndicator.innerHTML = `<i class="fas fa-times-circle"></i> ${message || 'Error: System failed'}`;
        break;

      default:
        this.healthIndicator.style.display = 'none';
    }

    // Emit custom event for other modules to listen
    window.dispatchEvent(new CustomEvent('systemHealthUpdate', {
      detail: { status, message, details, timestamp }
    }));
  }

  /**
   * Start monitoring system health
   */
  startMonitoring() {
    // Initial check after 1 second
    setTimeout(() => this.checkSystemHealth(), 1000);

    // Regular checks every 30 seconds
    this.checkInterval = setInterval(() => this.checkSystemHealth(), 30000);
  }

  /**
   * Check system health
   */
  checkSystemHealth() {
    const health = {
      modules: this.checkModules(),
      socket: this.checkSocketConnection(),
      memory: this.checkMemoryUsage(),
      performance: this.checkPerformance()
    };

    // Determine overall status
    let overallStatus = 'ok';
    let issues = [];

    if (!health.modules.loaded) {
      overallStatus = 'loading';
      issues.push('Modules loading');
    } else if (health.modules.failed > 0) {
      overallStatus = 'warning';
      issues.push(`${health.modules.failed} modules failed`);
    }

    if (!health.socket.connected) {
      if (overallStatus === 'ok') overallStatus = 'warning';
      issues.push('Socket disconnected');
    }

    if (health.memory.percentage > 80) {
      overallStatus = 'warning';
      issues.push('High memory usage');
    }

    if (health.performance.slow) {
      if (overallStatus === 'ok') overallStatus = 'warning';
      issues.push('Performance degraded');
    }

    // Update status
    if (overallStatus === 'ok') {
      this.updateStatus('ok', 'System healthy', health);
    } else if (overallStatus === 'loading') {
      this.updateStatus('loading', issues.join(', '), health);
    } else {
      this.updateStatus(overallStatus, issues.join(', '), health);
    }
  }

  /**
   * Check module loading status
   */
  checkModules() {
    const status = {
      loaded: false,
      total: 0,
      failed: 0,
      modules: []
    };

    if (window.appInitialized) {
      status.loaded = true;
    }

    if (window.moduleInstances) {
      status.modules = Object.keys(window.moduleInstances);
      status.total = status.modules.length;
    }

    if (window.moduleLoader && window.moduleLoader.failedModules) {
      status.failed = window.moduleLoader.failedModules.size;
    }

    return status;
  }

  /**
   * Check socket connection status
   */
  checkSocketConnection() {
    const status = {
      connected: false,
      latency: null
    };

    if (window.socket && window.socket.connected) {
      status.connected = true;
    } else if (window.moduleInstances && window.moduleInstances.socketHandler) {
      status.connected = window.moduleInstances.socketHandler.isConnected();
    }

    return status;
  }

  /**
   * Check memory usage
   */
  checkMemoryUsage() {
    const status = {
      used: 0,
      total: 0,
      percentage: 0
    };

    if (performance.memory) {
      status.used = performance.memory.usedJSHeapSize;
      status.total = performance.memory.totalJSHeapSize;
      status.percentage = (status.used / status.total) * 100;
    }

    return status;
  }

  /**
   * Check performance metrics
   */
  checkPerformance() {
    const status = {
      loadTime: 0,
      slow: false
    };

    const perfData = performance.getEntriesByType('navigation')[0];
    if (perfData) {
      status.loadTime = perfData.loadEventEnd - perfData.fetchStart;
      status.slow = status.loadTime > 5000; // Consider slow if > 5 seconds
    }

    return status;
  }

  /**
   * Show detailed status information
   */
  showDetailedStatus() {
    const health = {
      modules: this.checkModules(),
      socket: this.checkSocketConnection(),
      memory: this.checkMemoryUsage(),
      performance: this.checkPerformance()
    };

    console.group('🏥 System Health Report');
    console.log('Modules:', health.modules);
    console.log('Socket:', health.socket);
    console.log('Memory:', health.memory);
    console.log('Performance:', health.performance);
    console.log('Recent Status History:', this.statusHistory.slice(-10));
    console.groupEnd();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Get current health status
   */
  getCurrentStatus() {
    return this.lastStatus;
  }

  /**
   * Get status history
   */
  getStatusHistory() {
    return [...this.statusHistory];
  }
}

// Create and export singleton instance
const systemHealth = new SystemHealthMonitor();
export default systemHealth;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => systemHealth.initialize());
} else {
  systemHealth.initialize();
}

// Make available globally for debugging
window.systemHealth = systemHealth;