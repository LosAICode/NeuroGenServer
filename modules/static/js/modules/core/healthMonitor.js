/**
 * Centralized Health Monitoring System v3.1
 * 
 * Unified health check system aligned with the modular blueprint architecture
 * Integrates with backend diagnostics API for comprehensive system monitoring
 * Eliminates legacy diagnostic files and provides centralized monitoring
 * 
 * @module core/healthMonitor
 */

/**
 * Health Monitor Class - Centralized System v3.1
 */
class HealthMonitor {
  constructor() {
    this.state = {
      modules: new Map(),
      socket: null,
      apiHealth: null,
      lastCheck: null,
      checkInterval: 30000, // 30 seconds
      indicator: null,
      isInitialized: false
    };
    
    this.healthEndpoints = {
      modules: '/api/test-modules',
      health: '/api/health',
      monitor: '/api/health-monitor',
      socket: '/socket.io/'
    };
  }

  /**
   * Initialize the health monitor
   */
  async init() {
    console.log('🏥 Initializing Health Monitor...');
    
    // Create health indicator UI
    this.createHealthIndicator();
    
    // Run initial health check
    await this.runHealthCheck();
    
    // Set up periodic health checks
    this.startPeriodicChecks();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('✅ Health Monitor initialized');
  }

  /**
   * Create the health indicator UI element
   */
  createHealthIndicator() {
    // Remove any existing indicators
    const existing = document.querySelectorAll('.system-health-indicator');
    existing.forEach(el => el.remove());
    
    // Create new indicator
    this.state.indicator = document.createElement('div');
    this.state.indicator.id = 'unified-health-indicator';
    this.state.indicator.className = 'system-health-indicator';
    this.state.indicator.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(40, 167, 69, 0.9);
      color: white;
      padding: 8px 15px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 9999;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    this.state.indicator.innerHTML = `
      <i class="fas fa-heartbeat"></i>
      <span class="health-text">System Healthy</span>
    `;
    
    document.body.appendChild(this.state.indicator);
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    const results = {
      modules: await this.checkModules(),
      socket: await this.checkSocket(),
      api: await this.checkAPI(),
      timestamp: new Date().toISOString()
    };
    
    this.state.lastCheck = results;
    this.updateHealthIndicator(results);
    
    return results;
  }

  /**
   * Check module health
   */
  async checkModules() {
    const moduleStatus = {
      total: 0,
      loaded: 0,
      failed: [],
      warnings: []
    };
    
    // Get critical modules
    const criticalModules = [
      'errorHandler', 'domUtils', 'stateManager', 'eventManager',
      'socketHandler', 'progressHandler', 'ui', 'blueprintApi'
    ];
    
    // Get feature modules
    const featureModules = [
      'fileProcessor', 'webScraper', 'playlistDownloader', 
      'academicSearch', 'historyManager'
    ];
    
    // Check each module
    for (const moduleName of [...criticalModules, ...featureModules]) {
      moduleStatus.total++;
      
      try {
        // Check if module is in registry
        if (!MODULE_REGISTRY[moduleName]) {
          moduleStatus.warnings.push(`${moduleName} not in registry`);
          continue;
        }
        
        // Try to load module
        const module = await loadModule(moduleName);
        if (module) {
          moduleStatus.loaded++;
          this.state.modules.set(moduleName, {
            status: 'loaded',
            module: module
          });
        } else {
          throw new Error('Module loaded but is null');
        }
      } catch (error) {
        moduleStatus.failed.push({
          name: moduleName,
          error: error.message,
          critical: criticalModules.includes(moduleName)
        });
        
        this.state.modules.set(moduleName, {
          status: 'failed',
          error: error.message
        });
      }
    }
    
    // Check window.NeuroGen modules
    if (window.NeuroGen?.modules) {
      const loadedInstances = Object.keys(window.NeuroGen.modules);
      moduleStatus.windowModules = loadedInstances.length;
    }
    
    return moduleStatus;
  }

  /**
   * Check Socket.IO connection
   */
  async checkSocket() {
    const socketStatus = {
      connected: false,
      transport: null,
      latency: null
    };
    
    if (window.socket) {
      socketStatus.connected = window.socket.connected;
      socketStatus.transport = window.socket.io?.engine?.transport?.name;
      
      // Ping test
      if (socketStatus.connected) {
        const startTime = Date.now();
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            
            window.socket.emit('ping', { timestamp: startTime });
            window.socket.once('pong', () => {
              clearTimeout(timeout);
              socketStatus.latency = Date.now() - startTime;
              resolve();
            });
          });
        } catch (error) {
          socketStatus.latency = -1;
        }
      }
    }
    
    return socketStatus;
  }

  /**
   * Check API health
   */
  async checkAPI() {
    const apiStatus = {
      healthy: false,
      responseTime: null,
      endpoints: {}
    };
    
    try {
      const startTime = Date.now();
      const response = await fetch(this.healthEndpoints.api);
      apiStatus.responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        apiStatus.healthy = true;
        apiStatus.endpoints = data.endpoints || {};
        apiStatus.version = data.version;
      }
    } catch (error) {
      apiStatus.error = error.message;
    }
    
    // Check specific endpoints
    const endpointsToCheck = [
      { name: 'file_processor', url: '/api/process' },
      { name: 'web_scraper', url: '/api/scrape2' },
      { name: 'playlist_downloader', url: '/api/start-playlists' }
    ];
    
    for (const endpoint of endpointsToCheck) {
      try {
        const response = await fetch(endpoint.url, { method: 'HEAD' });
        apiStatus.endpoints[endpoint.name] = response.ok;
      } catch {
        apiStatus.endpoints[endpoint.name] = false;
      }
    }
    
    return apiStatus;
  }

  /**
   * Update health indicator based on results
   */
  updateHealthIndicator(results) {
    if (!this.state.indicator) return;
    
    const { modules, socket, api } = results;
    
    // Calculate overall health
    const moduleHealth = modules.failed.filter(m => m.critical).length === 0;
    const socketHealth = socket.connected;
    const apiHealth = api.healthy;
    
    let status = 'healthy';
    let icon = 'fa-heartbeat';
    let color = 'rgba(40, 167, 69, 0.9)'; // green
    let text = 'System Healthy';
    
    if (!moduleHealth || !apiHealth) {
      status = 'critical';
      icon = 'fa-exclamation-circle';
      color = 'rgba(220, 53, 69, 0.9)'; // red
      text = 'System Critical';
    } else if (!socketHealth || modules.failed.length > 0) {
      status = 'warning';
      icon = 'fa-exclamation-triangle';
      color = 'rgba(255, 193, 7, 0.9)'; // yellow
      text = 'System Warning';
    }
    
    // Build status text
    const issues = [];
    if (modules.failed.length > 0) {
      issues.push(`${modules.failed.length} modules failed`);
    }
    if (!socketHealth) {
      issues.push('Socket disconnected');
    }
    if (!apiHealth) {
      issues.push('API unhealthy');
    }
    
    const statusText = issues.length > 0 ? issues.join(', ') : text;
    
    // Update indicator
    this.state.indicator.style.background = color;
    this.state.indicator.innerHTML = `
      <i class="fas ${icon}"></i>
      <span class="health-text">${statusText}</span>
    `;
    
    // Add click handler for details
    this.state.indicator.onclick = () => this.showHealthDetails();
  }

  /**
   * Show detailed health information
   */
  showHealthDetails() {
    if (!this.state.lastCheck) return;
    
    const modal = document.createElement('div');
    modal.className = 'health-details-modal';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      color: #333;
    `;
    
    const { modules, socket, api } = this.state.lastCheck;
    
    modal.innerHTML = `
      <h3>System Health Report</h3>
      <button onclick="this.parentElement.remove()" style="position: absolute; top: 10px; right: 10px; border: none; background: none; font-size: 20px; cursor: pointer;">&times;</button>
      
      <div style="margin-top: 20px;">
        <h4>Modules (${modules.loaded}/${modules.total})</h4>
        ${modules.failed.length > 0 ? `
          <div style="color: red;">
            <strong>Failed Modules:</strong>
            <ul>
              ${modules.failed.map(m => `<li>${m.name} ${m.critical ? '(CRITICAL)' : ''}: ${m.error}</li>`).join('')}
            </ul>
          </div>
        ` : '<p style="color: green;">All modules loaded successfully</p>'}
      </div>
      
      <div style="margin-top: 20px;">
        <h4>Socket.IO Connection</h4>
        <p>Status: <strong style="color: ${socket.connected ? 'green' : 'red'}">${socket.connected ? 'Connected' : 'Disconnected'}</strong></p>
        ${socket.connected ? `
          <p>Transport: ${socket.transport}</p>
          <p>Latency: ${socket.latency}ms</p>
        ` : ''}
      </div>
      
      <div style="margin-top: 20px;">
        <h4>API Health</h4>
        <p>Status: <strong style="color: ${api.healthy ? 'green' : 'red'}">${api.healthy ? 'Healthy' : 'Unhealthy'}</strong></p>
        ${api.responseTime ? `<p>Response Time: ${api.responseTime}ms</p>` : ''}
        ${api.version ? `<p>Version: ${api.version}</p>` : ''}
        
        <h5>Endpoints:</h5>
        <ul>
          ${Object.entries(api.endpoints).map(([name, status]) => 
            `<li>${name}: <strong style="color: ${status ? 'green' : 'red'}">${status ? 'Available' : 'Unavailable'}</strong></li>`
          ).join('')}
        </ul>
      </div>
      
      <div style="margin-top: 20px;">
        <p style="font-size: 12px; color: #666;">Last checked: ${new Date(this.state.lastCheck.timestamp).toLocaleString()}</p>
        <button onclick="window.healthMonitor.runHealthCheck().then(() => this.parentElement.remove())" style="padding: 5px 15px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Refresh</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click
    setTimeout(() => {
      const closeOnClick = (e) => {
        if (e.target === modal) {
          modal.remove();
          document.removeEventListener('click', closeOnClick);
        }
      };
      document.addEventListener('click', closeOnClick);
    }, 100);
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks() {
    setInterval(() => {
      this.runHealthCheck();
    }, this.state.checkInterval);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for module load/fail events
    if (window.NeuroGen?.events) {
      window.NeuroGen.events.on('module:loaded', (moduleName) => {
        this.state.modules.set(moduleName, { status: 'loaded' });
        this.runHealthCheck();
      });
      
      window.NeuroGen.events.on('module:failed', (moduleName) => {
        this.state.modules.set(moduleName, { status: 'failed' });
        this.runHealthCheck();
      });
    }
    
    // Listen for socket events
    if (window.socket) {
      window.socket.on('connect', () => this.runHealthCheck());
      window.socket.on('disconnect', () => this.runHealthCheck());
    }
  }

  /**
   * Get current health status
   */
  getStatus() {
    return this.state.lastCheck;
  }

  /**
   * Force health check
   */
  async forceCheck() {
    return await this.runHealthCheck();
  }
}

// Create singleton instance
const healthMonitor = new HealthMonitor();

// Export for global access
export default healthMonitor;

// Make available globally
if (typeof window !== 'undefined') {
  window.healthMonitor = healthMonitor;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => healthMonitor.init());
} else {
  healthMonitor.init();
}

console.log('🏥 Health Monitor module loaded');