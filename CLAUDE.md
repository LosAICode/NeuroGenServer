# NeuroGenServer - Claude Development Guide

## Project Overview
NeuroGenServer is a comprehensive AI-powered document processing and web scraping platform for extracting, processing, and structuring web content and PDFs for LLM training data preparation with real-time progress tracking and academic search integration.

## Current Project State
- **Version**: 1.2.3
- **Last Updated**: May 27, 2025  
- **Development Phase**: Active Development & Testing
- **Active Modules**: File Processor, Playlist Downloader, Web Scraper, Academic Search
- **Current Status**: Core system operational, modules loading successfully
- **Priority**: Fix remaining startup issues and complete integration testing

## Master To-Do List

### 🔴 CRITICAL - Current Issues
- [ ] **Frontend Startup**: Resolve index.js and moduleLoader.js startup performance issues
  - Current: 3,030 lines in index.js (target: under 1,000)
  - Startup time: 25+ seconds (target: under 10)
  - Location: `C:\Users\Los\Documents\GitHub\NeuroGenServer\NeuroGenServer\modules\static\js\index.js`
- [ ] **Button Functionality**: Fix File Processing, Playlist Downloader and Web Scraping start buttons
- [ ] **Module Loading**: Ensure all modules load successfully without browser refresh required
- [ ] **Progress Testing**: Test end-to-end progress tracking across all three main features
- [ ] **Integration Testing**: Verify stats display on task completion across all modules

### 🟡 Medium Priority - Web Scraper Enhancement
- [ ] Create unified tabbed interface (Web, Academic, Downloads, History)
- [ ] Implement PDF selection system with checkboxes
- [ ] Build download management with concurrent handling
- [ ] Add academic search integration (arXiv, Semantic Scholar, PubMed)
- [ ] Implement recursive crawling algorithms
- [ ] Full Structify integration for PDF processing

### 🟢 Low Priority / Nice to Have
- [ ] Citation network visualization with D3.js
- [ ] Multi-language OCR support
- [ ] Advanced performance optimization
- [ ] Comprehensive API documentation
- [ ] User training materials

### ✅ Recently Completed (May 26-27, 2025)
- [x] **Fixed progress bar stuck at 50% issue** - Removed smoothing logic
- [x] **Fixed duplicate progress indicators** - Removed percentage badge duplication
- [x] **Resolved module loading errors** - Fixed getElement redeclarations and syntax errors
- [x] **Fixed core module exports** - All core modules properly structured
- [x] **Resolved WeakMap Symbol error** in utils/ui.js
- [x] **Fixed academic search import issues** - Updated function name references
- [x] **Fixed web scraper loading error** - Replaced non-existent function calls
- [x] **Repository cleanup** - Removed backup files for cleaner structure

## Project Architecture

### Backend Structure
```
modules/
├── app.py                     # Main Flask application
├── run_server.py             # Server startup (port 5025)
├── shutdown_server.py        # Server shutdown
├── main_part1.py             # SocketIO and core setup
├── main_part2_classes.py     # Core classes
├── main_part2_classes_part2.py # Additional core classes
├── main_part3_routes.py      # API routes
├── main_part3_routes_part2.py # Additional API routes
├── academic_api.py           # Academic API integration
├── web_scraper.py           # Backend web scraper
├── pdf_processing.py        # PDF processing backend
├── playlist_endpoints.py    # Playlist API endpoints
└── task_api_routes.py       # Task management API
```

### Complete Directory Structure
```
NeuroGenServer/
├── CLAUDE.md                 # This development guide
├── README.md                 # Project documentation
├── requirements.txt          # Python dependencies
└── modules/                  # Main application directory
    ├── WEB_SCRAPER.md       # Web scraper requirements
    ├── app.py              # Main Flask application
    ├── run_server.py       # Server startup script
    ├── .env                # Environment variables
    ├── api_keys.json       # API configuration
    │
    ├── static/             # Frontend assets
    │   ├── css/
    │   │   ├── styles.css          # Main stylesheet
    │   │   ├── neurogenStyles.css  # NeuroGen specific styles
    │   │   └── main.styles.css     # Additional styles
    │   └── js/
    │       ├── index.js            # 🎯 MAIN FRONTEND ENTRY POINT
    │       ├── diagnostics.js      # Frontend diagnostics
    │       ├── socket-events.js    # SocketIO event handling
    │       ├── modules/
    │       │   ├── core/           # 🏗️ CORE FRAMEWORK MODULES
    │       │   │   ├── app.js      # Main application controller
    │       │   │   ├── moduleLoader.js # Module loading system
    │       │   │   ├── eventManager.js # Event management
    │       │   │   ├── eventRegistry.js # Event registration
    │       │   │   ├── stateManager.js # Application state
    │       │   │   ├── themeManager.js # Theme switching
    │       │   │   ├── errorHandler.js # Error handling
    │       │   │   ├── uiRegistry.js # UI component registry
    │       │   │   ├── domUtils.js # DOM utilities
    │       │   │   └── module-bridge.js # Circular dependency resolution
    │       │   │
    │       │   ├── features/       # 🚀 FEATURE MODULES
    │       │   │   ├── fileProcessor.js # File processing module
    │       │   │   ├── safeFileProcessor.js # Safe file processing wrapper
    │       │   │   ├── playlistDownloader.js # YouTube playlist handling
    │       │   │   ├── webScraper.js # Web scraping module
    │       │   │   ├── webScraperUtils.js # Web scraper utilities
    │       │   │   ├── academicSearch.js # Academic search integration
    │       │   │   ├── academicScraper.js # Academic content scraping
    │       │   │   ├── academicApiClient.js # Academic API client
    │       │   │   ├── historyManager.js # Task history management
    │       │   │   ├── pdfProcessor.js # PDF processing
    │       │   │   ├── helpMode.js # Help system
    │       │   │   └── performanceOptimizer.js # Performance optimization
    │       │   │
    │       │   ├── utils/          # 🛠️ UTILITY MODULES
    │       │   │   ├── progressHandler.js # Progress tracking (fixed)
    │       │   │   ├── socketHandler.js # SocketIO communication
    │       │   │   ├── domUtils.js # DOM manipulation utilities
    │       │   │   ├── ui.js       # UI helper functions
    │       │   │   ├── utils.js    # General utilities
    │       │   │   ├── fileHandler.js # File handling utilities
    │       │   │   ├── debugTools.js # Development debugging tools
    │       │   │   ├── moduleDiagnostics.js # Module diagnostic tools
    │       │   │   └── errorHandler.js # Error handling utilities
    │       │   │
    │       │   └── module-standardizer.js # Module standardization
    │       │
    │       └── tests/              # 🧪 TESTING FRAMEWORK
    │           ├── testFramework.js # Core testing framework
    │           ├── runTests.js     # Test runner
    │           ├── stateManager.test.js # State manager tests
    │           ├── ui.test.js      # UI tests
    │           └── utils.test.js   # Utility tests
    │
    ├── templates/                  # 🎨 HTML TEMPLATES
    │   ├── index.html              # Main application template
    │   ├── app.index.html          # App-specific template
    │   ├── main.index.html         # Alternative main template
    │   └── key_manager.html        # API key management
    │
    ├── routes/                     # 🛣️ BACKEND ROUTING
    │   ├── routes.py               # Main route definitions
    │   ├── downloads/              # Download-related routes
    │   └── temp/                   # Temporary route files
    │
    ├── Structify/                  # 📄 PDF PROCESSING ENGINE
    │   ├── __init__.py             # Package initialization
    │   ├── claude.py               # Main Structify module
    │   └── structify.original.py   # Legacy Structify module
    │
    ├── academic_downloads/         # 📚 ACADEMIC CONTENT STORAGE
    ├── downloads/                  # 💾 GENERAL DOWNLOADS
    ├── temp/                       # 🗂️ TEMPORARY FILES
    └── backups/                    # 💾 BACKUP FILES
```

### Key Technologies
- **Backend**: Python Flask with SocketIO for real-time communication
- **Frontend**: JavaScript ES6 modules with Bootstrap UI
- **Real-time**: Socket.IO for progress updates and task communication
- **Document Processing**: Structify module for PDF extraction and OCR
- **Academic APIs**: arXiv, Semantic Scholar, PubMed integration
- **Database**: File-based storage with JSON for configuration

## Development Conventions

### Code Style Guidelines
- **DRY**: Don't Repeat Yourself - refactor repetitive logic into reusable functions
- **KISS**: Keep It Simple, Stupid - clear, minimal, readable code
- **SRP**: Single Responsibility Principle - each function does one thing well
- **Separation of Concerns**: UI logic, state management, and backend comms should be modular
- **Fail Fast**: Raise errors early, never suppress failures
- **Use Established Interfaces**: Reuse existing functions before creating new ones

### Git Workflow
- Branch naming: `feature/description`, `bugfix/critical-progress-fix`
- Commit format: `"fix: progress bar stuck at 50% issue"` or `"feat: add academic search"`
- Always update CLAUDE.md before committing major changes
- Create backup branches before critical fixes

### SocketIO Event Conventions
- **Backend events**: `progress_update`, `task_completed`, `task_error`, `task_cancelled`
- **Frontend events**: `request_task_status`, `cancel_task`, `pause_task`, `resume_task`
- **All events must include**: `task_id`, `timestamp`, and relevant metadata
- **Event payload structure** must be consistent across all modules

```python
# Standard backend event emission
def emit_progress_update(task_id, progress, status="processing", message=None, stats=None):
    payload = {
        'task_id': task_id,
        'progress': progress,
        'status': status,
        'message': message or f"Progress: {progress}%",
        'timestamp': time.time(),
        'stats': stats
    }
    socketio.emit('progress_update', payload)
```

## Environment Setup

### Required Dependencies
- **Python 3.8+** with Flask, Flask-SocketIO, eventlet
- **Node.js** for frontend package management (optional)
- **Tesseract OCR** for document processing
- **Redis** for session management
- **Required Python packages**: see requirements.txt

### Development Environment
- **Backend**: Run with `python run_server.py` on port 5025
- **Frontend**: Served via Flask static files
- **Debug Mode**: Enable in development for detailed SocketIO logging
- **Environment Variables**: API keys in .env file (YOUTUBE_API_KEY, etc.)

### Server Management
```bash
# Start server
python run_server.py

# Shutdown server  
python shutdown_server.py
```

## Current Issues & Status

### ✅ RESOLVED Issues
1. **Progress Bar Stuck at 50%** - FIXED: Removed smoothing logic causing deadlock
2. **Duplicate Progress Indicators** - FIXED: Removed percentage badge duplication  
3. **Module Loading Errors** - FIXED: Resolved getElement conflicts and syntax errors
4. **Stats Display** - FIXED: Force visibility on completion
5. **Core Module Exports** - FIXED: All modules properly structured with correct ES6 exports
6. **WeakMap Symbol Error** - FIXED: Replaced WeakMap with simple object in utils/ui.js
7. **Academic Search Imports** - FIXED: Updated function references from showError to showErrorNotification
8. **Web Scraper Loading** - FIXED: Replaced non-existent loadModuleWithDependencies function

### 🟡 ACTIVE Issues
1. **Performance Bottleneck**: index.js is 3,030 lines with 267 function declarations (target: under 1,000)
2. **Startup Time**: 25+ seconds loading time with blocking operations (target: under 10)
3. **Browser Refresh**: Sometimes required for module loading after fixes
4. **Button Testing**: Need comprehensive end-to-end testing of all start buttons
5. **Memory Usage**: No proper module cleanup/unloading mechanisms
6. **Error Recovery**: Needs faster failure detection and recovery

### 🔧 Known Performance Issues
- **Frontend Bloat**: Single 3,030-line index.js file causing parsing overhead
- **Module Loading**: Complex initialization sequence with blocking operations
- **Memory Leaks**: Long-running sessions without proper cleanup
- **DOM Manipulation**: Excessive DOM operations during startup
- **Event Handlers**: No cleanup for removed/replaced elements

### 🚨 Critical File Locations
```
CRITICAL FILES TO MONITOR:
├── modules/static/js/index.js                           # BLOATED: 3,030 lines
├── modules/static/js/modules/core/moduleLoader.js       # Complex loading logic
├── modules/static/js/modules/utils/progressHandler.js   # Recently fixed
├── modules/app.py                                       # Main backend
└── modules/templates/index.html                         # Frontend conflicts
```

## Testing Strategy

### Current Testing Priorities
1. **Progress Bar Testing**: Manual testing across all three modules
2. **SocketIO Event Testing**: Monitor WebSocket frames in browser dev tools
3. **Module Integration Testing**: Test File Processor, Playlist Downloader, Web Scraper individually
4. **End-to-End Testing**: Complete workflow testing from start to finish
5. **Performance Testing**: Measure startup times and memory usage

### Module Testing Protocol
1. **Hard refresh browser** (Ctrl+F5) to clear cache
2. **Check console** for any loading errors and timing
3. **Test each feature systematically**:
   - File Processor with small file upload
   - Playlist Downloader with YouTube URL  
   - Web Scraper with simple website
4. **Verify progress bars** reach 100% smoothly without getting stuck
5. **Confirm stats display** on completion
6. **Monitor memory usage** in browser dev tools

### Debug Commands & Tools
```javascript
// Frontend debugging
window.progressDebug = true;
window.socket.on('progress_update', (data) => {
  console.log('PROGRESS DEBUG:', data);
});

// Check for duplicate DOM elements
document.querySelectorAll('[id*="progress"]').forEach(el => {
  console.log('Progress element found:', el.id, el.textContent);
});

// Module diagnostics
import('/static/js/modules/utils/moduleDiagnostics.js').then(m => m.logDiagnosticReport());

// Performance monitoring
console.time('moduleLoad');
// ... module loading code ...
console.timeEnd('moduleLoad');
```

```python
# Backend debugging in app.py
def emit_progress_update(task_id, progress, status="processing", message=None, stats=None):
    print(f"BACKEND DEBUG: Emitting {task_id}: {progress}%")
    print(f"BACKEND DEBUG: Connected clients: {len(socketio.server.manager.rooms.get('/', {}))}")
    
    payload = {
        'task_id': task_id,
        'progress': progress,
        'status': status,
        'message': message or f"Progress: {progress}%",
        'timestamp': time.time()
    }
    
    try:
        socketio.emit('progress_update', payload)
        print(f"BACKEND DEBUG: Successfully emitted progress_update")
    except Exception as e:
        print(f"BACKEND DEBUG: Failed to emit: {e}")
```

## Module System Health

### ✅ Successfully Loading Modules
- **Core Modules**: errorHandler, uiRegistry, stateManager, eventRegistry, eventManager, themeManager
- **Utility Modules**: socketHandler, progressHandler, utils, fileHandler, moduleDiagnostics  
- **Feature Modules**: playlistDownloader, historyManager, debugTools
- **Main App Module**: app.js

### 🔄 Recently Fixed (Should Work After Refresh)
- **utils/ui.js** - Fixed WeakMap Symbol error, replaced with simple object
- **features/webScraper.js** - Fixed function reference error (loadModuleWithDependencies)
- **features/academicSearch.js** - Fixed import/export issues (showError → showErrorNotification)

### 📊 Module Loading Order
```javascript
// Core loading sequence (from moduleLoader.js)
INITIALIZATION_ORDER = [
  'module-bridge.js',     // Circular dependency resolution
  'errorHandler.js',      // Error handling foundation
  'domUtils.js',          // DOM utilities
  'uiRegistry.js',        // UI component registry
  'stateManager.js',      // Application state
  'eventRegistry.js',     // Event registration
  'eventManager.js',      // Event management
  'themeManager.js'       // Theme switching
];
```

## Emergency Fallback Plans

### Option A: Minimal Progress System
```javascript
function simpleProgressUpdate(elementId, progress) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.width = `${progress}%`;
    element.textContent = `${Math.round(progress)}%`;
  }
}
```

### Option B: Polling-Based Progress
```javascript
async function pollTaskProgress(taskId) {
  try {
    const response = await fetch(`/api/status/${taskId}`);
    const data = await response.json();
    updateProgressDisplay(data.progress);
  } catch (error) {
    console.error('Polling failed:', error);
  }
}
```

### Option C: Module Loading Fallback
```javascript
// Simplified module loader for emergency use
async function loadModuleSimple(modulePath) {
  try {
    const module = await import(modulePath);
    return module.default || module;
  } catch (error) {
    console.error(`Failed to load ${modulePath}:`, error);
    return null;
  }
}
```

## Success Criteria

### Immediate Goals (Next 1-2 Days)
- [ ] All modules load successfully without browser refresh required
- [ ] Progress bars display 0-100% without getting stuck at any percentage
- [ ] No duplicate progress indicators visible anywhere in UI
- [ ] All start buttons functional for File Processor, Playlist Downloader, Web Scraper
- [ ] Tasks complete properly and show final stats on completion
- [ ] Startup time reduced to under 15 seconds (from current 25+)

### Performance Goals (Next Week)
- [ ] index.js optimized to under 1,000 lines (from current 3,030)
- [ ] Startup time under 10 seconds consistently
- [ ] Memory usage optimization with proper cleanup
- [ ] Smooth progress updates with proper animations across all modules
- [ ] Consistent SocketIO event flow without dropped connections

### Feature Completion Goals (Next 2-4 Weeks)
- [ ] Unified tabbed interface for all scraping features
- [ ] PDF selection system with batch operations
- [ ] Academic search integration fully functional
- [ ] Recursive crawling algorithms implemented
- [ ] Citation network visualization working

---

**Last Updated**: May 27, 2025
**Next Priority**: Fix frontend startup performance (optimize 3,030-line index.js) and complete integration testing
**Status**: Core system operational, critical optimization phase in progress