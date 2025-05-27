
// =============================================================================
// SECTION 15: ERROR RECOVERY & DEBUGGING UTILITIES
// =============================================================================

/**
 * Check for critical elements and initialize recovery mode if needed
 */
function checkCriticalElements() {
  const criticalElements = [
    { id: 'input-dir', name: 'Input Directory field' },
    { id: 'output-file', name: 'Output Filename field' },
    { id: 'submit-btn', name: 'Submit button' },
    { id: 'process-form', name: 'Processing form' },
    { id: 'progress-container', name: 'Progress container' }
  ];
  
  const missingElements = criticalElements.filter(element => !document.getElementById(element.id));
  
  if (missingElements.length > 0) {
    console.error('Critical UI elements missing:', missingElements.map(e => e.name).join(', '));
    
    // Show emergency message
    const mainContainer = document.querySelector('main.container');
    if (mainContainer) {
      const alertHtml = `
        <div class="alert alert-danger mt-4">
          <h4 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>UI Initialization Error</h4>
          <p>Some critical UI elements could not be found:</p>
          <ul>
            ${missingElements.map(e => `<li>${e.name} (id: ${e.id})</li>`).join('')}
          </ul>
          <hr>
          <p class="mb-0">
            <button type="button" class="btn btn-danger" onclick="window.location.reload()">
              <i class="fas fa-sync me-1"></i> Reload Page
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="initializeDebugMode()">
              <i class="fas fa-bug me-1"></i> Initialize Debug Mode
            </button>
          </p>
        </div>
      `;
      
      // Add alert before existing content
      mainContainer.insertAdjacentHTML('afterbegin', alertHtml);
    }
    
    return false;
  }
  
  return true;
}


/**
 * Initialize debug mode for troubleshooting UI issues
 */
function initializeDebugMode() {
  console.log("Initializing debug mode...");
  
  // Create or get debug panel
  let debugPanel = document.getElementById('debug-panel');
  
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.className = 'debug-panel card position-fixed bottom-0 end-0 m-3';
    debugPanel.style.zIndex = '9999';
    debugPanel.style.maxWidth = '400px';
    debugPanel.style.maxHeight = '80vh';
    debugPanel.style.overflow = 'auto';
    
    // Add debug panel content
    debugPanel.innerHTML = `
      <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <span><i class="fas fa-bug me-1"></i> Debug Panel</span>
        <div>
          <button type="button" class="btn btn-sm btn-outline-light me-1" id="debug-refresh">
            <i class="fas fa-sync"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-light" id="debug-close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="card-body debug-content">
        <h6>Element Status:</h6>
        <div id="debug-element-status" class="mb-3">Loading...</div>
        
        <h6>Event Listeners:</h6>
        <div id="debug-event-listeners" class="mb-3">Loading...</div>
        
        <h6>Local Storage:</h6>
        <div id="debug-local-storage" class="mb-3">Loading...</div>
        
        <h6>Actions:</h6>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-warning" id="debug-clear-storage">
            Clear Storage
          </button>
          <button type="button" class="btn btn-sm btn-danger" id="debug-reset-app">
            Reset App
          </button>
          <button type="button" class="btn btn-sm btn-info" id="debug-test-socket">
            Test Socket
          </button>
        </div>
      </div>
    `;
    
    // Add to body
    document.body.appendChild(debugPanel);
  }
  
  // Add event listeners
  document.getElementById('debug-close').addEventListener('click', () => {
    debugPanel.remove();
  });
  
  document.getElementById('debug-refresh').addEventListener('click', () => {
    updateDebugPanel();
  });
  
  document.getElementById('debug-clear-storage').addEventListener('click', () => {
    localStorage.clear();
    sessionStorage.clear();
    updateDebugPanel();
    showToast('Debug', 'Storage cleared', 'warning');
  });
  
  document.getElementById('debug-reset-app').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset the app? This will clear all data and reload the page.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  });
  
  document.getElementById('debug-test-socket').addEventListener('click', () => {
    testSocketConnection();
  });
  
  // Initial update
  updateDebugPanel();
  
  console.log("Debug mode initialized");
}

/**
 * Debug Panel UI Improvements
 * This script adds a minimize button to the debug panel and improves its behavior
 */

// Add this code to main.js at the end of the initializeDebugMode function

function enhanceDebugPanel() {
  console.log("Enhancing debug panel...");
  
  // Get the debug panel element - note the hyphenated ID
  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) {
    console.error("Debug panel element not found");
    return false;
  }
  
  // Clear existing content while keeping the header
  const debugHeader = debugPanel.querySelector('.card-header');
  const debugContent = debugPanel.querySelector('.card-body.debug-content');
  
  if (debugContent) {
    // Keep existing structure but update content
    debugContent.innerHTML = '';
  } else {
    // If structure doesn't exist, create it from scratch
    debugPanel.innerHTML = `
      <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <span><i class="fas fa-bug me-1"></i> Debug Panel</span>
        <div>
          <button type="button" class="btn btn-sm btn-outline-light me-1" id="debug-refresh">
            <i class="fas fa-sync"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-light" id="debug-close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="card-body debug-content"></div>
    `;
    
    // Get the newly created content container
    const debugContent = debugPanel.querySelector('.card-body.debug-content');
    
    // Add event handlers for header buttons
    const refreshBtn = debugPanel.querySelector('#debug-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', updateDebugPanel);
    }
    
    const closeBtn = debugPanel.querySelector('#debug-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        debugPanel.style.display = 'none';
        localStorage.setItem('debugMode', 'false');
      });
    }
  }
  
  // Re-get content container to ensure we have it
  const contentContainer = debugPanel.querySelector('.card-body.debug-content');
  if (!contentContainer) {
    console.error("Debug content container not found");
    return false;
  }
  
  // Build the debug panel sections
  let panelHtml = '';
  
  // 1. Element Status Section
  panelHtml += `
    <h6>Element Status:</h6>
    <div id="debug-element-status" class="mb-3">Loading...</div>
    
    <h6>Event Listeners:</h6>
    <div id="debug-event-listeners" class="mb-3">Loading...</div>
    
    <h6>Local Storage:</h6>
    <div id="debug-local-storage" class="mb-3">Loading...</div>
    
    <h6>Actions:</h6>
    <div class="d-flex flex-wrap gap-2">
      <button type="button" class="btn btn-sm btn-warning" id="debug-clear-storage">
        Clear Storage
      </button>
      <button type="button" class="btn btn-sm btn-danger" id="debug-reset-app">
        Reset App
      </button>
      <button type="button" class="btn btn-sm btn-info" id="debug-test-socket">
        Test Socket
      </button>
      <button type="button" class="btn btn-sm btn-success" id="debug-fix-listeners">
        Fix Event Listeners
      </button>
    </div>
  `;
  
  // Set the HTML content
  contentContainer.innerHTML = panelHtml;
  
  // Add event handlers for action buttons
  document.getElementById('debug-clear-storage')?.addEventListener('click', function() {
    localStorage.clear();
    sessionStorage.clear();
    updateDebugPanel();
    showToast('Debug', 'Storage cleared', 'warning');
  });
  
  document.getElementById('debug-reset-app')?.addEventListener('click', function() {
    if (confirm('Are you sure you want to reset the app? This will clear all data and reload the page.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  });
  
  document.getElementById('debug-test-socket')?.addEventListener('click', testSocketConnection);
  
  document.getElementById('debug-fix-listeners')?.addEventListener('click', function() {
    setupEventListeners();
    showToast('Debug', 'Event listeners reset', 'info');
    setTimeout(updateDebugPanel, 500);
  });
  
  // Update sections with actual data
  updateDebugPanelData();
  
  // Make sure the debug panel is visible
  debugPanel.style.display = 'block';
  
  console.log("Debug panel enhanced successfully");
  return true;
}

function updateDebugPanelData() {
  // Element Status
  const elementStatusContainer = document.getElementById('debug-element-status');
  if (elementStatusContainer) {
    const validationResults = window.uiValidationResults || validateUIElements();
    
    let statusHtml = '<ul class="list-group">';
    validationResults.forEach(item => {
      const statusClass = item.exists ? 'text-success' : 'text-danger';
      const statusIcon = item.exists ? 'fa-check-circle' : 'fa-times-circle';
      
      statusHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${item.name}
          <span class="${statusClass}"><i class="fas ${statusIcon}"></i> ${item.exists ? 'Found' : 'Missing'}</span>
        </li>
      `;
    });
    statusHtml += '</ul>';
    
    elementStatusContainer.innerHTML = statusHtml;
  }
  
  // Event Listeners
  const eventListenersContainer = document.getElementById('debug-event-listeners');
  if (eventListenersContainer) {
    // Use the verification function already in main.js to check listeners
    const listenerStatus = {
      "File form submit": processForm && (processForm.onsubmit || hasEventListener(processForm, 'submit')),
      "Browse button click": browseBtn && (browseBtn.onclick || hasEventListener(browseBtn, 'click')),
      "Playlist form submit": playlistForm && (playlistForm.onsubmit || hasEventListener(playlistForm, 'submit')),
      "Scraper form submit": scraperForm && (scraperForm.onsubmit || hasEventListener(scraperForm, 'submit')),
      "Socket.IO connection": socket && socket.connected
    };
    
    let listenersHtml = '<ul class="list-group">';
    for (const [key, value] of Object.entries(listenerStatus)) {
      const statusClass = value ? 'text-success' : 'text-danger';
      const statusIcon = value ? 'fa-check-circle' : 'fa-times-circle';
      
      listenersHtml += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${key}
          <span class="${statusClass}"><i class="fas ${statusIcon}"></i> ${value ? 'Yes' : 'No'}</span>
        </li>
      `;
    }
    listenersHtml += '</ul>';
    
    eventListenersContainer.innerHTML = listenersHtml;
  }
  
  // Local Storage
  const localStorageContainer = document.getElementById('debug-local-storage');
  if (localStorageContainer) {
    const storageKeys = Object.keys(localStorage);
    
    if (storageKeys.length === 0) {
      localStorageContainer.innerHTML = '<div class="alert alert-info">No items in localStorage</div>';
    } else {
      let storageHtml = '<div class="accordion" id="storage-accordion">';
      storageHtml += `
        <div class="accordion-item">
          <h2 class="accordion-header" id="storage-heading">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#storage-collapse">
              localStorage Items (${storageKeys.length})
            </button>
          </h2>
          <div id="storage-collapse" class="accordion-collapse collapse" aria-labelledby="storage-heading" data-bs-parent="#storage-accordion">
            <div class="accordion-body p-0">
              <table class="table table-sm table-striped mb-0">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
      `;
      
      storageKeys.forEach(key => {
        let value = localStorage.getItem(key);
        // Truncate long values
        if (value && value.length > 100) {
          value = value.substring(0, 100) + '...';
        }
        storageHtml += `<tr><td>${key}</td><td>${escapeHtml(value)}</td></tr>`;
      });
      
      storageHtml += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      `;
      
      localStorageContainer.innerHTML = storageHtml;
    }
  }
}

function testSocketConnection() {
  if (!socket) {
    showToast('Socket Test', 'Socket not initialized. Trying to connect...', 'warning');
    initializeSocket();
    setTimeout(() => {
      if (socket && socket.connected) {
        showToast('Socket Test', 'Socket connection established!', 'success');
      } else {
        showToast('Socket Test', 'Failed to establish socket connection', 'error');
      }
    }, 1000);
    return;
  }
  
  if (socket.connected) {
    showToast('Socket Test', 'Socket is connected with ID: ' + socket.id, 'success');
    
    // Send ping to server
    try {
      socket.emit('ping', { timestamp: Date.now() });
      showToast('Socket Test', 'Ping sent to server', 'info');
    } catch (e) {
      showToast('Socket Test', 'Error sending ping: ' + e.message, 'error');
    }
  } else {
    showToast('Socket Test', 'Socket is disconnected. Trying to reconnect...', 'warning');
    
    try {
      socket.connect();
      setTimeout(() => {
        if (socket.connected) {
          showToast('Socket Test', 'Socket reconnected successfully!', 'success');
        } else {
          showToast('Socket Test', 'Failed to reconnect socket', 'error');
        }
      }, 1000);
    } catch (e) {
      showToast('Socket Test', 'Error reconnecting: ' + e.message, 'error');
    }
  }
}

function updateDebugPanel() {
  console.log("Updating debug panel...");
  updateDebugPanelData();
  showToast('Debug', 'Debug panel updated', 'info');
}

function updateAppStatusSection() {
  const appStatusContent = document.getElementById('appStatusContent');
  if (!appStatusContent) return;
  
  const appStatus = {
    "Application Initialized": window.appInitialized ? "Yes" : "No",
    "Current Tab": document.querySelector('.tab-pane.active')?.id || "None",
    "Dark Mode": document.body.classList.contains('dark-mode') ? "Enabled" : "Disabled",
    "Help Mode": document.body.classList.contains('help-mode') ? "Enabled" : "Disabled",
    "Window Size": `${window.innerWidth}x${window.innerHeight}`,
    "Last Error": window.lastError || "None"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(appStatus)) {
    html += `<tr><td class="fw-bold">${key}</td><td>${value}</td></tr>`;
  }
  html += '</table>';
  
  appStatusContent.innerHTML = html;
}

function updateEventListenersSection() {
  const eventListenersContent = document.getElementById('eventListenersContent');
  if (!eventListenersContent) return;
  
  // Check critical event listeners
  const listenerStatus = {
    "File form submit": processForm ? "Yes" : "No",
    "Browse button click": browseBtn ? "Yes" : "No",
    "Playlist form submit": playlistForm ? "Yes" : "No",
    "Scraper form submit": scraperForm ? "Yes" : "No",
    "Socket.IO connection": socket && socket.connected ? "Yes" : "No"
  };
  
  let html = '<ul class="list-group">';
  for (const [listener, status] of Object.entries(listenerStatus)) {
    const iconClass = status === "Yes" ? "fas fa-check-circle text-success" : "fas fa-times-circle text-danger";
    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
      ${listener}
      <span><i class="${iconClass}"></i> ${status}</span>
    </li>`;
  }
  html += '</ul>';
  
  html += '<div class="mt-2"><button id="debug-fix-listeners" class="btn btn-sm btn-warning">Fix Event Listeners</button></div>';
  
  eventListenersContent.innerHTML = html;
  
  // Add click handler for the fix button
  const fixButton = eventListenersContent.querySelector('#debug-fix-listeners');
  if (fixButton) {
    fixButton.addEventListener('click', function() {
      setupEventListeners();
      showToast('Debug', 'Event listeners reset', 'info');
      setTimeout(updateEventListenersSection, 500);
    });
  }
}

function updateUIElementsSection() {
  const uiElementsContent = document.getElementById('uiElementsContent');
  if (!uiElementsContent) return;
  
  // List critical UI elements and their status
  const elements = {
    "Process Form": processForm ? "Found" : "Missing",
    "Browse Button": browseBtn ? "Found" : "Missing",
    "Input Directory Field": inputDirField ? "Found" : "Missing",
    "Progress Bar": progressBar ? "Found" : "Missing",
    "Progress Status": progressStatus ? "Found" : "Missing",
    "Scraper Form": scraperForm ? "Found" : "Missing",
    "Scraper Progress Bar": scraperProgressBar ? "Found" : "Missing",
    "Playlist Form": playlistForm ? "Found" : "Missing",
    "Playlist Progress Bar": playlistProgressBar ? "Found" : "Missing"
  };
  
  let html = '<div class="accordion" id="uiElementsAccordion">';
  html += '<div class="accordion-item">';
  html += '<h2 class="accordion-header" id="uiElementsHeading">';
  html += '<button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#uiElementsCollapse" aria-expanded="false" aria-controls="uiElementsCollapse">';
  html += 'Critical UI Elements';
  html += '</button></h2>';
  
  html += '<div id="uiElementsCollapse" class="accordion-collapse collapse" aria-labelledby="uiElementsHeading" data-bs-parent="#uiElementsAccordion">';
  html += '<div class="accordion-body p-0">';
  html += '<table class="table table-sm table-striped m-0">';
  html += '<thead><tr><th>Element</th><th>Status</th></tr></thead><tbody>';
  
  for (const [element, status] of Object.entries(elements)) {
    const statusClass = status === "Found" ? "text-success" : "text-danger";
    html += `<tr><td>${element}</td><td class="${statusClass}">${status}</td></tr>`;
  }
  
  html += '</tbody></table>';
  html += '</div></div></div>';
  
  // Add a button to reload UI elements
  html += '<div class="mt-2"><button id="debug-reload-ui" class="btn btn-sm btn-info">Reload UI Elements</button></div>';
  
  uiElementsContent.innerHTML = html;
  
  // Add click handler for reload button
  const reloadButton = uiElementsContent.querySelector('#debug-reload-ui');
  if (reloadButton) {
    reloadButton.addEventListener('click', function() {
      getUIElements();
      showToast('Debug', 'UI elements reloaded', 'info');
      setTimeout(updateUIElementsSection, 500);
    });
  }
}

function updateSocketStatusSection() {
  const socketStatusContent = document.getElementById('socketStatusContent');
  if (!socketStatusContent) return;
  
  // Get Socket.IO status
  const socketInfo = {
    "Connected": socket && socket.connected ? "Yes" : "No",
    "Socket ID": socket && socket.id ? socket.id : "N/A",
    "Connection Attempts": socket ? (socket._reconnectionAttempts || 0) : "N/A",
    "Polling Status": socket && socket.io ? (socket.io.engine.transport.name || "N/A") : "N/A",
    "Last Event": window.lastSocketEvent || "None",
    "Last Error": window.lastSocketError || "None"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(socketInfo)) {
    const valueClass = (key === "Connected" && value === "No") ? "text-danger" : "";
    html += `<tr><td class="fw-bold">${key}</td><td class="${valueClass}">${value}</td></tr>`;
  }
  html += '</table>';
  
  // Add reconnect button
  html += '<div class="mt-2">';
  html += '<button id="debug-socket-reconnect" class="btn btn-sm btn-primary me-2">Reconnect Socket</button>';
  html += '<button id="debug-socket-fallback" class="btn btn-sm btn-secondary">Enable Polling</button>';
  html += '</div>';
  
  socketStatusContent.innerHTML = html;
  
  // Add click handlers
  const reconnectButton = socketStatusContent.querySelector('#debug-socket-reconnect');
  if (reconnectButton) {
    reconnectButton.addEventListener('click', function() {
      // Attempt to reconnect the socket
      if (socket) {
        try {
          socket.disconnect();
          socket.connect();
          showToast('Debug', 'Socket reconnection initiated', 'info');
        } catch (e) {
          console.error("Error reconnecting socket:", e);
          showToast('Error', 'Failed to reconnect: ' + e.message, 'error');
        }
      } else {
        initializeSocket();
        showToast('Debug', 'New socket connection initiated', 'info');
      }
      
      setTimeout(updateSocketStatusSection, 1000);
    });
  }
  
  const fallbackButton = socketStatusContent.querySelector('#debug-socket-fallback');
  if (fallbackButton) {
    fallbackButton.addEventListener('click', function() {
      startStatusPolling();
      showToast('Debug', 'Status polling enabled', 'info');
    });
  }
}

function updateTaskInfoSection() {
  const taskInfoContent = document.getElementById('taskInfoContent');
  if (!taskInfoContent) return;
  
  // Get current task information
  const taskInfo = {
    "Current Task ID": currentTaskId || "None",
    "Task Type": getCurrentTaskType() || "None",
    "Status Polling Active": statusCheckInterval ? "Yes" : "No",
    "Last Progress Update": window.lastProgressUpdate ? new Date(window.lastProgressUpdate).toLocaleTimeString() : "None",
    "Last Progress Value": window.lastProgressValue !== undefined ? `${window.lastProgressValue}%` : "N/A"
  };
  
  let html = '<table class="table table-sm table-bordered">';
  for (const [key, value] of Object.entries(taskInfo)) {
    html += `<tr><td class="fw-bold">${key}</td><td>${value}</td></tr>`;
  }
  html += '</table>';
  
  // Add actions for task management
  if (currentTaskId) {
    html += '<div class="mt-2">';
    html += '<button id="debug-request-status" class="btn btn-sm btn-info me-2">Request Status</button>';
    html += '<button id="debug-cancel-task" class="btn btn-sm btn-danger">Cancel Task</button>';
    html += '</div>';
  } else {
    html += '<div class="alert alert-info mt-2 mb-0 py-2">No active task</div>';
  }
  
  taskInfoContent.innerHTML = html;
  
  // Add click handlers if we have an active task
  if (currentTaskId) {
    const statusButton = taskInfoContent.querySelector('#debug-request-status');
    if (statusButton) {
      statusButton.addEventListener('click', function() {
        // Request status update
        if (socket && socket.connected) {
          socket.emit('request_status', { task_id: currentTaskId });
          showToast('Debug', 'Status update requested', 'info');
        } else {
          // Use fetch instead
          fetch(`/api/status/${currentTaskId}`)
            .then(response => response.json())
            .then(data => {
              updateProgress(data);
              showToast('Debug', 'Status updated via API', 'info');
            })
            .catch(error => {
              console.error("Error requesting status:", error);
              showToast('Error', 'Failed to get status: ' + error.message, 'error');
            });
        }
      });
    }
    
    const cancelButton = taskInfoContent.querySelector('#debug-cancel-task');
    if (cancelButton) {
      cancelButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to cancel the current task?')) {
          cancelCurrentTask();
        }
      });
    }
  }
}

function updateActionsSection() {
  const actionsContent = document.getElementById('debugActionsContent');
  if (!actionsContent) return;
  
  let html = '<div class="d-flex flex-wrap gap-2">';
  
  // App-wide actions
  html += '<button id="debug-clear-storage" class="btn btn-sm btn-outline-danger">Clear Storage</button>';
  html += '<button id="debug-reload-app" class="btn btn-sm btn-outline-primary">Reload App</button>';
  html += '<button id="debug-toggle-dark" class="btn btn-sm btn-outline-secondary">Toggle Dark Mode</button>';
  html += '<button id="debug-download-logs" class="btn btn-sm btn-outline-info">Download Logs</button>';
  html += '<button id="debug-clear-console" class="btn btn-sm btn-outline-warning">Clear Console</button>';
  
  html += '</div>';
  
  // Advanced diagnostics
  html += '<div class="mt-2">';
  html += '<button id="debug-run-diagnostics" class="btn btn-sm btn-success">Run Full Diagnostics</button>';
  html += '</div>';
  
  actionsContent.innerHTML = html;
  
  // Add click handlers
  const clearStorageBtn = actionsContent.querySelector('#debug-clear-storage');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', function() {
      if (confirm('This will clear all local storage data. Continue?')) {
        localStorage.clear();
        sessionStorage.clear();
        showToast('Debug', 'Storage cleared', 'warning');
      }
    });
  }
  
  const reloadAppBtn = actionsContent.querySelector('#debug-reload-app');
  if (reloadAppBtn) {
    reloadAppBtn.addEventListener('click', function() {
      showToast('Debug', 'Reloading application...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }
  
  const toggleDarkBtn = actionsContent.querySelector('#debug-toggle-dark');
  if (toggleDarkBtn) {
    toggleDarkBtn.addEventListener('click', function() {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
      updateAppStatusSection();
    });
  }
  
  const downloadLogsBtn = actionsContent.querySelector('#debug-download-logs');
  if (downloadLogsBtn) {
    downloadLogsBtn.addEventListener('click', function() {
      // Create a log file with console output
      const logs = window.consoleLog || [];
      const logText = logs.map(entry => {
        const timestamp = new Date(entry.timestamp).toISOString();
        return `[${timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`;
      }).join('\n');
      
      // Create download
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neurogen-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Debug', 'Logs downloaded', 'success');
    });
  }
  
  const clearConsoleBtn = actionsContent.querySelector('#debug-clear-console');
  if (clearConsoleBtn) {
    clearConsoleBtn.addEventListener('click', function() {
      console.clear();
      window.consoleLog = [];
      showToast('Debug', 'Console cleared', 'info');
    });
  }
  
  const runDiagnosticsBtn = actionsContent.querySelector('#debug-run-diagnostics');
  if (runDiagnosticsBtn) {
    runDiagnosticsBtn.addEventListener('click', function() {
      showToast('Debug', 'Running diagnostics...', 'info');
      runFullDiagnostics();
    });
  }
}

function runFullDiagnostics() {
  console.log("Running full system diagnostics...");
  
  // Create diagnostics report
  const diagnostics = {
    timestamp: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      online: navigator.onLine
    },
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    application: {
      initialized: window.appInitialized || false,
      darkMode: document.body.classList.contains('dark-mode'),
      currentTab: document.querySelector('.tab-pane.active')?.id || "None",
      lastError: window.lastError || "None"
    },
    uiElements: {},
    socket: {
      available: typeof io !== 'undefined',
      connected: socket && socket.connected || false,
      id: socket && socket.id || "N/A",
      namespace: socket && socket.nsp || "N/A",
      transport: socket && socket.io ? socket.io.engine.transport.name : "N/A",
      requestsCount: socket && socket.sendBuffer ? socket.sendBuffer.length : 0
    },
    task: {
      currentTaskId: currentTaskId || "None",
      taskType: getCurrentTaskType() || "None",
      pollingActive: statusCheckInterval ? true : false,
      lastProgress: window.lastProgressValue
    },
    localStorage: {},
    sessionStorage: {}
  };
  
  // Add UI elements status
  const criticalElements = [
    'processForm', 'browseBtn', 'inputDirField', 'progressBar', 'progressStatus',
    'scraperForm', 'scraperProgressBar', 'playlistForm', 'playlistProgressBar'
  ];
  
  criticalElements.forEach(element => {
    diagnostics.uiElements[element] = window[element] ? true : false;
  });
  
  // Add storage data summary (count by key prefix)
  const localStorageKeys = Object.keys(localStorage);
  const sessionStorageKeys = Object.keys(sessionStorage);
  
  const groupByPrefix = (keys) => {
    const groups = {};
    keys.forEach(key => {
      const prefix = key.split('-')[0] || key;
      groups[prefix] = (groups[prefix] || 0) + 1;
    });
    return groups;
  };
  
  diagnostics.localStorage = groupByPrefix(localStorageKeys);
  diagnostics.sessionStorage = groupByPrefix(sessionStorageKeys);
  
  // Display diagnostics
  console.log("Diagnostics Report:", diagnostics);
  
  // Show toast with summary
  const summary = `
    Browser: ${diagnostics.browser.userAgent.split(' ').pop()}
    App initialized: ${diagnostics.application.initialized}
    Socket connected: ${diagnostics.socket.connected}
    UI elements found: ${Object.values(diagnostics.uiElements).filter(Boolean).length}/${criticalElements.length}
    Current task: ${diagnostics.task.currentTaskId !== "None" ? "Active" : "None"}
  `;
  
  showToast('Diagnostics Complete', 'Results logged to console', 'info');
  
  // Try to fix any detected issues
  let issuesFound = false;
  
  // 1. Check if UI elements are missing
  const missingElements = Object.entries(diagnostics.uiElements)
    .filter(([_, exists]) => !exists)
    .map(([element, _]) => element);
    
  if (missingElements.length > 0) {
    console.warn("Missing UI elements:", missingElements);
    getUIElements();
    issuesFound = true;
  }
  
  // 2. Check if socket is disconnected but should be connected
  if (!diagnostics.socket.connected && diagnostics.socket.available) {
    console.warn("Socket is available but disconnected");
    initializeSocket();
    issuesFound = true;
  }
  
  // 3. Check if task status polling isn't working
  if (diagnostics.task.currentTaskId !== "None" && !diagnostics.task.pollingActive) {
    console.warn("Task is active but status polling is not");
    startStatusPolling();
    issuesFound = true;
  }
  
  // 4. Check if event listeners are missing
  verifyEventListeners();
  
  // Show results of fixes
  if (issuesFound) {
    showToast('Issues Fixed', 'Some issues were detected and fixed', 'warning');
    
    // Update debug panel after fixes
    setTimeout(() => {
      enhanceDebugPanel();
    }, 1000);
  } else {
    showToast('Diagnostics', 'No issues detected', 'success');
  }
  
  return diagnostics;
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  if (debugPanel.classList.contains('d-none')) {
    // Show and update panel
    enhanceDebugPanel();
    localStorage.setItem('debugMode', 'true');
  } else {
    // Hide panel
    debugPanel.classList.add('d-none');
    localStorage.setItem('debugMode', 'false');
  }
}

function verifyEventListeners() {
  console.log("Verifying event listeners...");
  
  let hasIssues = false;
  
  // Check form submit handlers
  if (processForm && !processForm._hasSubmitListener) {
    console.warn("Process form missing submit listener");
    processForm.addEventListener('submit', handleFileSubmit);
    processForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  if (playlistForm && !playlistForm._hasSubmitListener) {
    console.warn("Playlist form missing submit listener");
    playlistForm.addEventListener('submit', handlePlaylistSubmit);
    playlistForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  if (scraperForm && !scraperForm._hasSubmitListener) {
    console.warn("Scraper form missing submit listener");
    scraperForm.addEventListener('submit', handleScraperSubmit);
    scraperForm._hasSubmitListener = true;
    hasIssues = true;
  }
  
  // Check browse button
  if (browseBtn && !browseBtn._hasClickListener) {
    console.warn("Browse button missing click listener");
    browseBtn.addEventListener('click', function() {
      handleBrowseClick(inputDirField);
    });
    browseBtn._hasClickListener = true;
    hasIssues = true;
  }
  
  // Check socket connection
  if (!socket || !socket.connected) {
    console.warn("Socket not connected");
    initializeSocket();
    hasIssues = true;
  }
  
  if (hasIssues) {
    console.log("Fixed event listener issues");
    updateEventListenersStatus();
    return false;
  }
  
  console.log("All event listeners verified");
  return true;
}

function updateEventListenersStatus() {
  // Update the event listeners debug display
  const listenerStatus = {
    "File form submit": processForm && processForm._hasSubmitListener ? "Yes" : "No",
    "Browse button click": browseBtn && browseBtn._hasClickListener ? "Yes" : "No",
    "Playlist form submit": playlistForm && playlistForm._hasSubmitListener ? "Yes" : "No",
    "Scraper form submit": scraperForm && scraperForm._hasSubmitListener ? "Yes" : "No",
    "Socket.IO connection": socket && socket.connected ? "Yes" : "No"
  };
  
  console.log("Event listener status:", listenerStatus);
  
  // If the debug panel has event listeners section, update it
  const eventListenersContent = document.getElementById('eventListenersContent');
  if (eventListenersContent) {
    updateEventListenersSection();
  }
}

// Initialize console capture for logs if not already done
if (!window.consoleLog) {
  window.consoleLog = [];
  
  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };
  
  // Override console methods to capture logs
  ['log', 'warn', 'error', 'info'].forEach(method => {
    console[method] = function() {
      // Call original method
      originalConsole[method].apply(console, arguments);
      
      // Capture log
      const message = Array.from(arguments).map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      // Add to log array (limit to 1000 entries)
      window.consoleLog.push({
        timestamp: Date.now(),
        type: method,
        message: message
      });
      
      if (window.consoleLog.length > 1000) {
        window.consoleLog.shift();
      }
    };
  });
}
/**
 * Validate UI elements and update debug panel
 * This will check if critical elements exist and are properly initialized
 */
function validateUIElements() {
  // Create a list of critical elements to check
  const criticalElements = [
    { name: "Scraper URLs container", element: scraperUrlsContainer, id: "scraper-urls-container" },
    { name: "Playlist form", element: playlistForm, id: "playlist-form" },
    { name: "File form", element: processForm, id: "process-form" },
    { name: "Progress container", element: progressContainer, id: "progress-container" },
    { name: "History table", element: historyTableBody, id: "history-table-body" }
  ];
  
  // Store validation results to display in debug panel
  const validationResults = criticalElements.map(item => {
    const exists = !!item.element;
    return {
      name: item.name,
      exists: exists,
      id: item.id
    };
  });
  
  // Store global validation results for the debug panel
  window.uiValidationResults = validationResults;
  
  // Log validation results
  console.log("UI Element validation results:", validationResults);
  
  // If any critical elements are missing, try to create fallbacks
  const missingElements = validationResults.filter(item => !item.exists);
  if (missingElements.length > 0) {
    console.warn("Missing critical UI elements:", missingElements.map(e => e.name).join(', '));
    createFallbackElements(missingElements);
  }
  
  // Update event listeners status for debug panel
  updateEventListenersStatus();
  
  return missingElements.length === 0;
}

/**
 * Create fallback elements for missing critical UI components
 * @param {Array} missingElements - Array of missing element info
 */
function createFallbackElements(missingElements) {
  missingElements.forEach(item => {
    try {
      // Special handling for specific elements
      if (item.id === "scraper-urls-container" && !scraperUrlsContainer) {
        console.log("Creating fallback for scraperUrlsContainer");
        // Look for the container that should have the scraper URLs
        const scraperFormContainer = document.getElementById("scraper-form-container");
        
        if (scraperFormContainer) {
          // Find or create the container
          let container = document.getElementById(item.id);
          if (!container) {
            container = document.createElement("div");
            container.id = item.id;
            const form = scraperFormContainer.querySelector("form") || scraperFormContainer;
            // Try to insert it at the right position
            form.insertAdjacentHTML('afterbegin', `
              <div class="mb-4">
                <label class="form-label">Web Scraper URLs</label>
                <div id="${item.id}">
                  <div class="input-group mb-2">
                    <input type="url" class="form-control scraper-url" placeholder="Enter Website URL" required />
                    <select class="form-select scraper-settings" style="max-width: 160px;">
                      <option value="full">Full Text</option>
                      <option value="metadata">Metadata Only</option>
                      <option value="title">Title Only</option>
                      <option value="keyword">Keyword Search</option>
                      <option value="pdf">PDF Download</option>
                    </select>
                    <input type="text" class="form-control scraper-keyword" placeholder="Keyword (optional)" style="display:none;" />
                    <button type="button" class="btn btn-outline-danger remove-url">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="add-scraper-url">
                  <i class="fas fa-plus me-1"></i> Add Another URL
                </button>
              </div>
            `);
            // Re-assign the element reference
            scraperUrlsContainer = document.getElementById(item.id);
            console.log("Created fallback element:", item.id);
          }
        }
      }
      // Add more fallbacks for other critical elements as needed
    } catch (e) {
      console.error(`Failed to create fallback for ${item.name}:`, e);
    }
  });
}

/**
 * Update the debug panel with latest information
 */
function updateDebugPanel() {
  const elementStatusContainer = document.getElementById('debug-element-status');
  const eventListenersContainer = document.getElementById('debug-event-listeners');
  const localStorageContainer = document.getElementById('debug-local-storage');
  
  if (elementStatusContainer) {
    const validationResults = window.uiValidationResults || [];
    
    // Create HTML for element status with improved styling
    let statusHtml = '<div class="list-group list-group-flush">';
    
    validationResults.forEach(item => {
      const statusClass = item.exists ? 'bg-success' : 'bg-danger';
      const statusText = item.exists ? 'Found' : 'Missing';
      
      statusHtml += `
        <div class="list-group-item d-flex justify-content-between align-items-center p-2">
          <span>${item.name}</span>
          <span class="badge ${statusClass} rounded-pill">
            ${statusText}
          </span>
        </div>
      `;
    });
    
    statusHtml += '</div>';
    elementStatusContainer.innerHTML = statusHtml;
  }
  
  // Update event listeners info
  if (eventListenersContainer) {
    const listenersInfo = getEventListenersInfo();
    eventListenersContainer.innerHTML = listenersInfo;
  }
  
  // Update local storage info
  if (localStorageContainer) {
    let storageHtml = '<div class="accordion" id="debug-storage-accordion">';
    
    // Local Storage
    storageHtml += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-local-storage">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                  data-bs-target="#collapse-local-storage" aria-expanded="false" aria-controls="collapse-local-storage">
            Local Storage (${Object.keys(localStorage).length} items)
          </button>
        </h2>
        <div id="collapse-local-storage" class="accordion-collapse collapse" 
             aria-labelledby="heading-local-storage" data-bs-parent="#debug-storage-accordion">
          <div class="accordion-body">
    `;
    
    if (Object.keys(localStorage).length === 0) {
      storageHtml += '<div class="alert alert-info">Local Storage is empty</div>';
    } else {
      storageHtml += '<ul class="list-group list-group-flush">';
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          let value = localStorage.getItem(key);
          // Try to pretty-print JSON
          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
            value = `<pre class="mb-0"><code>${escapeHtml(value)}</code></pre>`;
          } catch (e) {
            // Not JSON, just use the string
            value = escapeHtml(value);
          }
          
          storageHtml += `
            <li class="list-group-item p-2">
              <div><strong>${key}</strong></div>
              <div class="text-break">${value}</div>
            </li>
          `;
        }
      }
      storageHtml += '</ul>';
    }
    
    storageHtml += `
          </div>
        </div>
      </div>
    `;
    
    // Session Storage
    storageHtml += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-session-storage">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                  data-bs-target="#collapse-session-storage" aria-expanded="false" aria-controls="collapse-session-storage">
            Session Storage (${Object.keys(sessionStorage).length} items)
          </button>
        </h2>
        <div id="collapse-session-storage" class="accordion-collapse collapse" 
             aria-labelledby="heading-session-storage" data-bs-parent="#debug-storage-accordion">
          <div class="accordion-body">
    `;
    
    if (Object.keys(sessionStorage).length === 0) {
      storageHtml += '<div class="alert alert-info">Session Storage is empty</div>';
    } else {
      storageHtml += '<ul class="list-group list-group-flush">';
      for (const key in sessionStorage) {
        if (sessionStorage.hasOwnProperty(key)) {
          let value = sessionStorage.getItem(key);
          // Try to pretty-print JSON
          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
            value = `<pre class="mb-0"><code>${escapeHtml(value)}</code></pre>`;
          } catch (e) {
            // Not JSON, just use the string
            value = escapeHtml(value);
          }
          
          storageHtml += `
            <li class="list-group-item p-2">
              <div><strong>${key}</strong></div>
              <div class="text-break">${value}</div>
            </li>
          `;
        }
      }
      storageHtml += '</ul>';
    }
    
    storageHtml += `
          </div>
        </div>
      </div>
    `;
    
    storageHtml += '</div>'; // Close accordion
    
    localStorageContainer.innerHTML = storageHtml;
  }
}

/**
 * Get information about event listeners for debug panel
 */
function getEventListenersInfo() {
  const listenerStatus = {
    "File form submit": processForm && processForm._events && processForm._events.hasOwnProperty("submit"),
    "Browse button click": browseBtn && browseBtn._events && browseBtn._events.hasOwnProperty("click"),
    "Playlist form submit": playlistForm && playlistForm._events && playlistForm._events.hasOwnProperty("submit"),
    "Scraper form submit": scraperForm && scraperForm._events && scraperForm._events.hasOwnProperty("submit"),
    "Socket.IO connection": socket && socket.connected
  };
  
  // Check for event handlers using alternative method
  if (!listenerStatus["File form submit"] && processForm) {
    listenerStatus["File form submit"] = processForm.onsubmit !== null;
  }
  
  if (!listenerStatus["Browse button click"] && browseBtn) {
    listenerStatus["Browse button click"] = browseBtn.onclick !== null;
  }
  
  if (!listenerStatus["Playlist form submit"] && playlistForm) {
    listenerStatus["Playlist form submit"] = playlistForm.onsubmit !== null;
  }
  
  if (!listenerStatus["Scraper form submit"] && scraperForm) {
    listenerStatus["Scraper form submit"] = scraperForm.onsubmit !== null;
  }
  
  let html = '<div class="alert alert-info">';
  html += '<p>Event listeners currently registered:</p>';
  html += '<ul class="mb-0">';
  
  for (const [name, registered] of Object.entries(listenerStatus)) {
    const icon = registered 
      ? '<i class="fas fa-check-circle text-success"></i>' 
      : '<i class="fas fa-times-circle text-danger"></i>';
    html += `<li>${icon} ${name}: ${registered ? 'Yes' : 'No'}</li>`;
  }
  
  html += '</ul></div>';
  
  return html;
}

/**
 * Update the status of event listeners for debug panel
 */
function updateEventListenersStatus() {
  window.eventListenersStatus = {
    "File form submit": processForm ? "No" : "Element missing",
    "Browse button click": browseBtn ? "No" : "Element missing",
    "Playlist form submit": playlistForm ? "No" : "Element missing",
    "Scraper form submit": scraperForm ? "No" : "Element missing"
  };
  
  // Check for event handlers more accurately after they're set up
  setTimeout(() => {
    if (processForm && typeof handleFileSubmit === 'function') {
      window.eventListenersStatus["File form submit"] = "Yes";
    }
    
    if (browseBtn && typeof handleBrowseClick === 'function') {
      window.eventListenersStatus["Browse button click"] = "Yes";
    }
    
    if (playlistForm && typeof handlePlaylistSubmit === 'function') {
      window.eventListenersStatus["Playlist form submit"] = "Yes";
    }
    
    if (scraperForm && typeof handleScraperSubmit === 'function') {
      window.eventListenersStatus["Scraper form submit"] = "Yes";
    }
  }, 500);
}

/**
 * Test Socket.IO connection
 */
function testSocketConnection() {
  if (!socket) {
    showToast('Socket Test', 'Socket not initialized. Trying to connect...', 'warning');
    initializeSocket();
    setTimeout(() => {
      if (socket && socket.connected) {
        showToast('Socket Test', 'Socket connection established!', 'success');
      } else {
        showToast('Socket Test', 'Failed to establish socket connection', 'error');
      }
    }, 1000);
    return;
  }
  
  if (socket.connected) {
    showToast('Socket Test', 'Socket is connected with ID: ' + socket.id, 'success');
    
    // Send ping to server
    try {
      socket.emit('ping', { timestamp: Date.now() });
      showToast('Socket Test', 'Ping sent to server', 'info');
    } catch (e) {
      showToast('Socket Test', 'Error sending ping: ' + e.message, 'error');
    }
  } else {
    showToast('Socket Test', 'Socket is disconnected. Trying to reconnect...', 'warning');
    
    try {
      socket.connect();
      setTimeout(() => {
        if (socket.connected) {
          showToast('Socket Test', 'Socket reconnected successfully!', 'success');
        } else {
          showToast('Socket Test', 'Failed to reconnect socket', 'error');
        }
      }, 1000);
    } catch (e) {
      showToast('Socket Test', 'Error reconnecting: ' + e.message, 'error');
    }
  }
}

// =============================================================================
// SECTION 16: PERFORMANCE OPTIMIZATIONS
// =============================================================================

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time to wait in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Throttle function to limit how often a function can be called
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Optimize UI elements for better performance
 */
function optimizeUI() {
  // Apply debouncing to search field in history tab
  if (historySearch) {
    const debouncedRefresh = debounce(() => refreshHistoryTable(), 300);
    historySearch.removeEventListener('input', refreshHistoryTable);
    historySearch.addEventListener('input', debouncedRefresh);
  }
  
  // Optimize progress updates by throttling
  window.updateProgressBarThrottled = throttle(updateProgressBarElement, 100);
  
  // Optimize scroll events for smoother performance
  document.addEventListener('scroll', throttle(function() {
    // Do any scroll-based calculations here
  }, 100), { passive: true });
  
  // Optimize window resize events
  window.addEventListener('resize', debounce(function() {
    // Handle resize logic here
  }, 250), { passive: true });
  
  // Enable chunked rendering for large tables
  if (historyTableBody) {
    // Use a function to render in chunks if large dataset
    window.renderHistoryInChunks = function(data, chunkSize = 10) {
      if (data.length <= chunkSize) {
        // Small dataset, render normally
        data.forEach((item, index) => addTaskToHistoryTable(item, index));
        return;
      }
      
      // For large datasets, render in chunks for better UI responsiveness
      let currentIndex = 0;
      const totalItems = data.length;
      
      function renderNextChunk() {
        const endIndex = Math.min(currentIndex + chunkSize, totalItems);
        
        for (let i = currentIndex; i < endIndex; i++) {
          addTaskToHistoryTable(data[i], i);
        }
        
        currentIndex = endIndex;
        
        if (currentIndex < totalItems) {
          // Schedule next chunk
          setTimeout(renderNextChunk, 10);
        }
      }
      
      // Start rendering
      renderNextChunk();
    };
  }
  
  console.log("UI optimizations applied");
}
