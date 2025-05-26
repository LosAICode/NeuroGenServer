# Claude Code Instructions for NeuroGenServer Project

## 🎯 Project Mission
You are working on NeuroGenServer, a comprehensive AI-powered document processing and web scraping platform. Your immediate goal is to **fix the critical progress bar issue** where progress gets stuck at 50% with duplicate percentage indicators.

## 📂 Project Context & File Structure

### Core Project Location
```
C:\Users\Los\Documents\GitHub\NeuroGenServer\NeuroGenServer\
```

### 🔑 Critical Files to Analyze First
1. **CLAUDE.md** - Project status and development guide
2. **modules/main.py** - Main application (split into 5 parts for analysis)
3. **modules/static/js/modules/utils/progressHandler.js** - CRITICAL: Progress tracking (NEEDS FIX)
4. **socketio events.txt** - SocketIO event documentation
5. **modules/static/js/index.js** - Frontend entry point

### 📋 Backend Analysis Files (Priority Order)
```
modules/main_part1.py               # SocketIO setup & core configuration
modules/main_part2_classes.py       # Core classes definition
modules/main_part2_classes_part2.py # Additional core classes
modules/main_part3_routes.py        # API routes implementation
modules/main_part3_routes_part2.py  # Additional API routes
```

### 🎨 Frontend Analysis Files (Priority Order)
```
modules/static/js/index.js                           # Main entry point
modules/static/js/modules/utils/progressHandler.js   # CRITICAL: Stuck at 50%
modules/static/js/modules/utils/socketHandler.js     # SocketIO communication
modules/static/js/modules/features/fileProcessor.js  # File processing module
modules/static/js/modules/features/playlistDownloader.js # Playlist module
modules/static/js/modules/features/webScraper.js     # Web scraper module
```

## 🚨 CRITICAL ISSUE: Progress Bar Analysis

### Problem Statement
- **Progress bar gets stuck at 50%**
- **Duplicate percentage indicators visible**
- **SocketIO events not properly synchronized**
- **Affects all modules**: File Processor, Playlist Downloader, Web Scraper

### Required Analysis Approach
1. **Read CLAUDE.md first** to understand current project state
2. **Analyze SocketIO event flow** between backend and frontend
3. **Identify duplicate progress elements** in progressHandler.js
4. **Map event emission patterns** in backend files
5. **Test module integration** for each feature

## 📊 Analysis Protocol

### Step 1: Project State Assessment
```bash
# Read these files to understand current state:
1. CLAUDE.md                     # Project overview and current issues
2. modules/WEB_SCRAPER.md        # Web scraper requirements
3. socketio events.txt           # Event documentation
```

### Step 2: Backend SocketIO Analysis
```bash
# Analyze backend event emission in order:
1. modules/main_part1.py         # SocketIO setup and event handlers
2. modules/main_part2_classes.py # Class definitions with progress methods
3. modules/main_part3_routes.py  # API endpoints that emit progress events
```

**Look for these patterns:**
```python
# Find all emit_progress_update calls
emit_progress_update(task_id, progress, status, message, stats)

# Check for consistent event naming
socketio.emit('progress_update', payload)
socketio.emit('task_completed', payload)
socketio.emit('task_error', payload)

# Verify payload structure consistency
payload = {
    'task_id': task_id,
    'progress': progress,
    'status': status,
    'message': message,
    'timestamp': time.time()
}
```

### Step 3: Frontend Progress Handler Analysis
```bash
# Critical file analysis:
modules/static/js/modules/utils/progressHandler.js
```

**Identify these issues:**
```javascript
// Look for duplicate progress elements
elements.progressBar          // Main progress bar
elements.progressPercentage   // Separate percentage display

// Check event handler registration
window.socket.on('progress_update', handler)
window.socket.on('task_progress', handler)   // Duplicate?

// Find progress smoothing logic causing stuck progress
function smoothProgress(taskId, progress) {
    // This may be causing 50% stuck issue
}

// Check for backward progress prevention
if (progress < lastProgress) {
    // This logic might prevent proper updates
}
```

### Step 4: Module Integration Analysis
```bash
# Test each module's progress integration:
modules/static/js/modules/features/fileProcessor.js      # File processing progress
modules/static/js/modules/features/playlistDownloader.js # Playlist progress  
modules/static/js/modules/features/webScraper.js         # Web scraping progress
```

**Check for:**
```javascript
// How each module initializes progress tracking
setupTaskProgress(taskId, options)

// How progress updates are called
updateTaskProgress(taskId, progress, message, stats)

// Event handler registration consistency
window.socket.on('file_processing_progress', handler)
window.socket.on('playlist_progress', handler)
window.socket.on('web_scraping_progress', handler)
```

## 🔧 Debugging Commands to Use

### Backend SocketIO Debugging
```python
# Add these debug lines to main_part1.py emit_progress_update function:
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
    print(f"BACKEND DEBUG: Payload = {payload}")
    
    try:
        socketio.emit('progress_update', payload)
        print(f"BACKEND DEBUG: Successfully emitted progress_update")
    except Exception as e:
        print(f"BACKEND DEBUG: Failed to emit: {e}")
```

### Frontend Debugging Commands
```javascript
// Add to browser console or progressHandler.js:
window.progressDebug = true;

// Monitor all progress events
window.socket.on('progress_update', (data) => {
  console.log('PROGRESS DEBUG:', data);
});

// Check for duplicate DOM elements
document.querySelectorAll('[id*="progress"]').forEach(el => {
  console.log('Progress element found:', el.id, el.textContent);
});

// Monitor active tasks
if (window.progressHandler) {
  console.log('Active tasks:', window.progressHandler.getActiveTaskIds());
}
```

## 🎯 Specific Tasks to Complete

### Task 1: Analyze Current State
- [ ] Read CLAUDE.md to understand project status
- [ ] Examine socketio events.txt for event specifications
- [ ] Map current progress bar implementation

### Task 2: Backend Event Analysis
- [ ] Analyze all emit_progress_update calls in main_part*.py files
- [ ] Identify inconsistent event naming or payload structures
- [ ] Check SocketIO connection handling

### Task 3: Frontend Progress Handler Fix
- [ ] Locate duplicate progress indicators in progressHandler.js
- [ ] Remove progress smoothing logic causing stuck progress
- [ ] Standardize event handler registration
- [ ] Fix progress value synchronization

### Task 4: Module Integration Testing
- [ ] Verify File Processor progress integration
- [ ] Check Playlist Downloader progress tracking
- [ ] Test Web Scraper progress updates
- [ ] Ensure consistent API across all modules

### Task 5: Validation & Testing
- [ ] Test progress tracking from 0% to 100%
- [ ] Verify no duplicate indicators
- [ ] Confirm proper task completion handling
- [ ] Test error scenarios and recovery

## 📋 Required Outputs

### 1. Issue Analysis Report
```markdown
## Progress Bar Analysis Results

### Backend Issues Found:
- [ ] Inconsistent emit_progress_update calls
- [ ] Event payload structure mismatches
- [ ] SocketIO connection problems

### Frontend Issues Found:
- [ ] Duplicate progress elements identified
- [ ] Progress smoothing logic problems
- [ ] Event handler conflicts

### Module Integration Issues:
- [ ] File Processor: [specific issues]
- [ ] Playlist Downloader: [specific issues]  
- [ ] Web Scraper: [specific issues]
```

### 2. Fixed Code Implementation
- Provide corrected progressHandler.js with comments explaining fixes
- Update backend emit_progress_update function if needed
- Ensure all three modules work with new progress system

### 3. Testing Instructions
- Step-by-step testing procedure for each module
- Browser console commands for debugging
- Success criteria for progress tracking

## 🚀 Success Criteria

### Progress Bar Must:
- [ ] Display correct values from 0% to 100% without getting stuck
- [ ] Show only ONE percentage indicator (no duplicates)
- [ ] Update smoothly with proper animations
- [ ] Complete at 100% and show success state
- [ ] Work consistently across File Processor, Playlist Downloader, and Web Scraper

### SocketIO Events Must:
- [ ] Be consistently named and structured
- [ ] Flow properly from backend to frontend
- [ ] Include all required metadata (task_id, progress, timestamp)
- [ ] Handle connection issues gracefully

## 📝 Documentation Requirements

### Update CLAUDE.md with:
- [ ] Progress from ❌ CRITICAL ISSUE to ✅ RESOLVED
- [ ] Move completed tasks to "Completed Tasks" section
- [ ] Update "Last Updated" date
- [ ] Document the specific fix implemented
- [ ] Add any new issues discovered during debugging

### Provide Implementation Notes:
- Explain the root cause of the 50% stuck issue
- Document why duplicate indicators were appearing
- Describe the SocketIO event flow improvement
- Note any breaking changes for other developers

## 🔄 Iterative Approach

**Focus on ONE fix at a time:**
1. **First**: Fix duplicate progress indicators
2. **Second**: Resolve stuck at 50% issue  
3. **Third**: Standardize SocketIO events
4. **Fourth**: Test all three modules
5. **Fifth**: Implement stats display on completion

**After each fix:**
- Test immediately with one module
- Verify the specific issue is resolved
- Document the change in CLAUDE.md
- Move to next issue only when current one is confirmed fixed

---

**Remember: This is a systematic debugging mission. Take time to understand the codebase architecture before implementing fixes. The goal is a robust, consistent progress tracking system that works reliably across all modules.**
