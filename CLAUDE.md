# NeuroGenServer - Development Guide v3.0

## Project Overview
NeuroGenServer is a Flask Blueprint-based document processing platform with real-time progress tracking and cross-platform download capabilities for production Linux servers serving Windows clients.

## Current Project State
- **Version**: 3.0 - **CRITICAL FIXES IN PROGRESS**
- **Last Updated**: May 29, 2025  
- **Development Phase**: 🚧 **FIXING CORE ISSUES** - Backend errors resolved, testing needed
- **Backend**: ✅ **Flask Blueprints Architecture** - Clean modular structure
- **Frontend**: ✅ **35 Modules Loading** - Fast 5-second startup achieved
- **Active Issue**: File processing imports fixed, testing required

## 🎯 MASTER TO-DO LIST

### 🔥 CRITICAL - Current Sprint (Next 24-48 Hours)
- [x] **Fix Backend Import Errors**: ✅ **COMPLETED** - Fixed add_task, emit functions, socketio imports
- [ ] **Test File Processing**: Test the fixed file processor with real directory
- [ ] **Fix Windows Path Handling**: Ensure Linux server can create Windows-compatible downloads
- [ ] **Validate Module Loading**: Verify all 35 frontend modules work with blueprints
- [ ] **Cross-Platform Download Testing**: Test Linux→Windows download capability

### 🟡 HIGH PRIORITY - Production Ready (Next Week)
- [ ] **Web Scraper Module Integration**: Connect frontend webScraper.js to backend web_scraper.py
- [ ] **Academic Search Integration**: Connect academicSearch.js to academic_search.py
- [ ] **PDF Processor Integration**: Connect pdfProcessor.js to pdf_processor.py
- [ ] **Playlist Downloader Integration**: Connect playlistDownloader.js to playlist_downloader.py
- [ ] **Cross-Platform Path Resolution**: Windows paths from Linux server

### 🟢 MEDIUM PRIORITY - Feature Enhancement (2-4 Weeks)
- [ ] **Progress Bar Optimization**: Real-time updates for all modules
- [ ] **File Selection Interface**: Checkbox system for batch operations
- [ ] **Error Recovery System**: Automatic retry and fallback mechanisms
- [ ] **Download Management**: Queue system with concurrent downloads
- [ ] **API Rate Limiting**: Throttling for academic and YouTube APIs

### 🔵 LOW PRIORITY - Nice to Have (1-2 Months)
- [ ] **Citation Network Visualization**: D3.js graphs for academic papers
- [ ] **Multi-language OCR**: Support for non-English documents
- [ ] **Cloud Storage Integration**: S3, Google Drive, OneDrive support
- [ ] **Performance Analytics**: Detailed processing metrics and optimization

## 🏗️ ARCHITECTURE OVERVIEW

### Backend: Flask Blueprint Structure
```
modules/
├── app_new.py                    # Main Flask application
├── run_server_new.py            # Production server launcher
├── blueprints/
│   ├── templates/index.html     # Main UI (NEW LOCATION!)
│   ├── core/                    # Core functionality
│   │   ├── services.py          # BaseTask, emit functions, task management
│   │   ├── utils.py             # Helper functions, sanitize_filename
│   │   ├── routes.py            # Basic routes (home, health)
│   │   └── config.py            # Configuration management
│   ├── features/                # Feature modules (FIXED IMPORTS)
│   │   ├── file_processor.py    # ✅ Document processing
│   │   ├── web_scraper.py       # 🔧 Web scraping
│   │   ├── academic_search.py   # 🔧 Academic APIs
│   │   ├── pdf_processor.py     # 🔧 PDF handling
│   │   └── playlist_downloader.py # 🔧 YouTube integration
│   ├── api/                     # API management
│   │   ├── management.py        # Task management, analytics
│   │   └── analytics.py         # Usage statistics
│   └── socketio_events.py       # Real-time communication
```

### Frontend: Modular JavaScript System
```
static/js/
├── index.js                     # Main entry (optimized)
├── module-manager.js            # Module lifecycle management
└── modules/
    ├── core/                    # Framework modules (8 modules)
    │   ├── app.js              # Main application controller
    │   ├── errorHandler.js     # Error handling
    │   ├── stateManager.js     # Application state
    │   └── ...
    ├── features/               # Feature modules (12 modules)
    │   ├── fileProcessor.js    # File processing UI
    │   ├── webScraper.js       # Web scraping interface
    │   ├── academicSearch.js   # Academic search UI
    │   └── ...
    └── utils/                  # Utility modules (15 modules)
        ├── progressHandler.js  # Progress tracking
        ├── socketHandler.js    # Real-time communication
        └── ...
```

## 🚀 RECENT FIXES APPLIED (May 29, 2025)

### ✅ Backend Import Resolution
1. **Fixed file_processor.py**:
   - Added missing `add_task` import from `blueprints.core.services`
   - Added missing emit functions: `emit_progress_update`, `emit_task_error`, `emit_task_completion`
   - Fixed function signatures to match services.py implementations
   - Added proper task registration flow

2. **Fixed Function Calls**:
   - `emit_progress_update(task_id, progress, message)` - simplified signature
   - `emit_task_error(task_id, error_message)` - removed socketio_instance parameter
   - `emit_task_completion(task_id, task_type, output_file, stats)` - proper completion event

3. **Task Management Flow**:
   ```python
   # Correct task creation and registration
   task = ProcessingTask(task_id, input_dir, final_output_path)
   add_task(task_id, task)  # Add to active tasks
   register_task(task_id, 'file_processing', **kwargs)  # API registry
   task.start()  # Begin processing
   ```

## 🔧 CRITICAL TESTING NEEDED

### File Processor Testing
1. **Backend Test**: Process a real directory with mixed file types
2. **Progress Tracking**: Verify real-time updates reach frontend
3. **Path Handling**: Test Windows paths from Linux server
4. **Download Capability**: Ensure files are downloadable by Windows clients

### Module Integration Testing
1. **Frontend-Backend Connection**: Each JS module → Python blueprint
2. **Socket.IO Events**: Real-time communication working
3. **Error Handling**: Proper error propagation and display
4. **Cross-Platform Paths**: Windows-compatible file paths from Linux

## 🌐 CROSS-PLATFORM DOWNLOAD REQUIREMENTS

### Primary Goal: Linux Server → Windows Client Downloads
- **Server Environment**: Linux (production)
- **Client Environment**: Windows (end users)
- **Challenge**: Generate Windows-compatible file paths and downloads
- **Solution**: Path conversion utilities in utils.py

### Path Handling Strategy
```python
def convert_to_windows_path(linux_path, drive_letter="C"):
    """Convert Linux path to Windows path for download"""
    # Remove leading slash and convert separators
    windows_path = linux_path.lstrip('/').replace('/', '\\')
    return f"{drive_letter}:\\{windows_path}"

def sanitize_for_windows(filename):
    """Ensure filename is Windows-compatible"""
    invalid_chars = '<>:"|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename
```

## 📊 MODULE STATUS MATRIX

| Module | Frontend | Backend | Integration | Status |
|--------|----------|---------|-------------|--------|
| File Processor | ✅ Ready | ✅ Fixed | 🔧 Testing | 90% |
| Web Scraper | ✅ Ready | ✅ Ready | ❌ Missing | 60% |
| Academic Search | ✅ Ready | ✅ Ready | ❌ Missing | 60% |
| PDF Processor | ✅ Ready | ✅ Ready | ❌ Missing | 60% |
| Playlist Downloader | ✅ Ready | ✅ Ready | ❌ Missing | 60% |

## 🔍 IMMEDIATE NEXT STEPS

### Today's Priority
1. **Test File Processing**: Run a complete test with real directory
2. **Fix Path Issues**: Ensure cross-platform path compatibility
3. **Verify Socket.IO**: Test real-time progress updates
4. **Module Loading Check**: Confirm all 35 modules load correctly

### This Week's Goals
1. **Complete Module Integration**: Connect all frontend modules to backends
2. **Cross-Platform Testing**: Verify Linux→Windows download capability
3. **Error Handling**: Implement comprehensive error recovery
4. **Performance Optimization**: Ensure sub-5 second startup maintained

## 📝 DEVELOPMENT COMMANDS

### Server Management
```bash
# Start production server
cd modules && python run_server_new.py

# Test server with debug
cd modules && python run_server_new.py --debug

# Quick test file processing
curl -X POST http://localhost:5025/api/process \
  -H "Content-Type: application/json" \
  -d '{"input_dir": "/path/to/test", "output_file": "test_output"}'
```

### Frontend Development
```javascript
// Test module loading
window.NeuroGenDebug.modules.list()

// Check module status
window.NeuroGenDebug.modules.status('fileProcessor')

// Test Socket.IO connection
window.NeuroGenDebug.socket.test()
```

## 🚨 KNOWN ISSUES & WORKAROUNDS

### Current Issues
1. **Windows Path Conversion**: Need robust Linux→Windows path translation
2. **Module Integration**: Frontend modules not connected to backend blueprints
3. **Progress Bar Edge Cases**: Some modules may have stale progress indicators
4. **Error Recovery**: Limited automatic retry mechanisms

### Workarounds
1. **Path Issues**: Use sanitize_filename and manual path conversion
2. **Module Issues**: Test modules individually before integration
3. **Progress Issues**: Clear progress state before starting new tasks
4. **Error Issues**: Implement manual retry in frontend

## 🔮 ROADMAP SUMMARY

### Phase 1: Core Stability (This Week)
- Fix all backend import/integration issues
- Test cross-platform download capability
- Verify all 35 modules load and function

### Phase 2: Feature Integration (Next 2 Weeks)
- Connect all frontend modules to backend blueprints
- Implement robust error handling and recovery
- Optimize real-time progress tracking

### Phase 3: Production Ready (Next Month)
- Comprehensive testing across platforms
- Performance optimization and monitoring
- Documentation and deployment guides

### Phase 4: Advanced Features (2-3 Months)
- Citation network visualization
- Advanced PDF processing with AI
- Cloud storage integration
- Multi-language support

---

**Development Focus**: Cross-platform compatibility, module integration, production readiness
**Key Success Metric**: Linux server successfully serving Windows clients with real-time progress
**Last Updated**: May 29, 2025 - Post import fixes, pre-integration testing