# NeuroGenServer - Testing & Implementation TODO

## 📋 **TESTING PRIORITY LIST**

### 🔥 **CRITICAL TESTING - TODAY**
- [ ] **Health Monitor System Test**: Verify centralized diagnostics work correctly
- [ ] **File Processor Integration Test**: Test with real directory of mixed files
- [ ] **Web Scraper Full Test**: Test recursive crawling with PDF discovery
- [ ] **Academic Search Test**: Multi-source paper search and download
- [ ] **PDF Processor Test**: Large file processing with progress tracking
- [ ] **Playlist Downloader Test**: YouTube integration validation
- [ ] **Cross-Platform Path Test**: Linux→Windows download compatibility

### 🟡 **HIGH PRIORITY TESTING - THIS WEEK**
- [ ] **Socket.IO Real-time Communication**: Test all event handlers
- [ ] **Progress Bar Integration**: Verify live updates for all modules
- [ ] **Error Recovery Testing**: Test cancellation and retry mechanisms
- [ ] **Memory Usage Testing**: Large file processing optimization
- [ ] **API Rate Limiting**: Test academic API throttling
- [ ] **Module Load Performance**: Ensure <5 second startup maintained

### 🟢 **INTEGRATION TESTING - NEXT WEEK**
- [ ] **End-to-End Workflow**: Complete user scenarios
- [ ] **Concurrent Operations**: Multiple modules running simultaneously
- [ ] **Download Queue Management**: Batch download testing
- [ ] **Health Monitor Stress Test**: System under load
- [ ] **API Endpoint Validation**: All 85% aligned endpoints
- [ ] **Frontend-Backend Sync**: Data consistency testing

---

## 🧪 **TESTING METHODOLOGY**

### **Module Testing Order:**
1. **Health Monitor** (Foundation) ✅
2. **File Processor** (Core functionality)
3. **Web Scraper** (Complex integration)
4. **Academic Search** (API dependent)
5. **PDF Processor** (Resource intensive)
6. **Playlist Downloader** (External API)

### **Testing Approach:**
- **Start Server**: `python run_server_new.py --debug`
- **Open Browser**: http://localhost:5025
- **Open Console**: F12 Developer Tools
- **Monitor Health**: Watch health indicator (bottom-left)
- **Check Logs**: Both browser console and server terminal

---

## 📊 **TEST SCENARIOS**

### **1. Health Monitor System Test**
**Objective**: Verify centralized health monitoring works
**Steps**:
```javascript
// 1. Check health status
window.healthMonitor.getStatus()

// 2. Force health check
window.healthMonitor.forceCheck()

// 3. Verify module loading
Object.keys(window.NeuroGen.modules)

// 4. Check API endpoints
fetch('/api/health').then(r => r.json()).then(console.log)
fetch('/api/test-modules').then(r => r.json()).then(console.log)
```
**Expected**: All modules loaded, health indicator green, API responses healthy

### **2. File Processor Integration Test**
**Objective**: Test document processing with real files
**Setup**: Create test directory with mixed file types (PDF, DOCX, TXT)
**Steps**:
1. Navigate to File Processor tab
2. Enter test directory path
3. Start processing
4. Monitor progress bar and console logs
5. Check download when complete
**Expected**: All files processed, progress updates, successful download

### **3. Web Scraper Full Test**
**Objective**: Test recursive crawling and PDF discovery
**Steps**:
1. Navigate to Web Scraper tab
2. Enter test URL (e.g., academic site with PDFs)
3. Enable recursive crawling, set depth=2
4. Start scraping
5. Monitor PDF discovery and download progress
**Expected**: URLs crawled, PDFs found and downloaded, statistics updated

### **4. Academic Search Test**
**Objective**: Multi-source academic paper search
**Steps**:
1. Navigate to Academic Search tab
2. Enter search query (e.g., "machine learning")
3. Select multiple sources (arXiv, Semantic Scholar)
4. Start search
5. Review results, select papers, download
**Expected**: Papers found from multiple sources, metadata extracted, downloads work

### **5. PDF Processor Test**
**Objective**: Large PDF processing with progress
**Setup**: Prepare large PDF file (>10MB)
**Steps**:
1. Navigate to PDF Processor tab
2. Upload large PDF file
3. Enable OCR and table extraction
4. Start processing
5. Monitor memory usage and progress
**Expected**: PDF processed completely, tables extracted, OCR text available

### **6. Playlist Downloader Test**
**Objective**: YouTube playlist integration
**Prerequisites**: Valid YouTube API key
**Steps**:
1. Navigate to Playlist Downloader tab
2. Enter YouTube playlist URL
3. Select download options
4. Start download
5. Monitor video processing progress
**Expected**: Playlist metadata extracted, videos downloaded, progress tracked

---

## 🔍 **CONSOLE LOG ANALYSIS CHECKLIST**

### **Browser Console (F12)**
**Look for**:
- ✅ Module loading success messages
- ✅ Health monitor initialization
- ✅ Socket.IO connection established
- ❌ Import errors or failed modules
- ❌ 404 errors for missing endpoints
- ❌ WebSocket connection failures

### **Server Terminal**
**Look for**:
- ✅ Blueprint registration messages
- ✅ Module import success
- ✅ Socket.IO events
- ✅ Task progress updates
- ❌ Import errors
- ❌ Missing file errors
- ❌ API connection failures

### **Network Tab (F12)**
**Monitor**:
- API endpoint responses (should be 200 OK)
- Module loading times (<5 seconds total)
- WebSocket connections (ws://)
- Health check responses (<200ms)

---

## 🚨 **ERROR DETECTION & DEBUGGING**

### **Common Issues to Watch For**:
1. **Module Import Failures**: Check moduleImports.js paths
2. **Socket.IO Disconnections**: Verify server connection
3. **API Endpoint 404s**: Check Blueprint registration
4. **Memory Leaks**: Monitor large file processing
5. **Path Issues**: Cross-platform compatibility problems
6. **Health Monitor Failures**: Centralized system issues

### **Debugging Commands**:
```javascript
// Module diagnostics
window.NeuroGen.modules.fileProcessor.getHealthStatus()
window.NeuroGen.modules.webScraper.getHealthStatus()

// Check module imports
window.ModuleImports.loadModule('fileProcessor')

// Socket status
window.socket.connected
window.socket.id

// Health monitor details
window.healthMonitor.showHealthDetails()
```

---

## 📈 **SUCCESS METRICS**

### **Performance Targets**:
- **Module Load Time**: <5 seconds ✅
- **Health Check Response**: <200ms ✅
- **File Processing**: Progress updates every 100ms
- **Memory Usage**: <500MB for typical workloads
- **API Response Time**: <1 second average
- **Error Rate**: <1% of operations

### **Functionality Targets**:
- **Module Integration**: 100% (currently 91%)
- **API Alignment**: 90%+ (currently 85%)
- **Cross-Platform**: Windows paths work from Linux
- **Real-time Updates**: All progress bars functional
- **Error Recovery**: Graceful failure handling

---

## 🔄 **NEXT STEPS AFTER TESTING**

### **If Tests Pass** ✅:
1. Update module status to "COMPLETE" in CLAUDE.md
2. Document any performance optimizations needed
3. Move to next module testing
4. Plan production deployment

### **If Tests Fail** ❌:
1. Analyze console logs for specific errors
2. Check TASK_HISTORY.md for previous fixes
3. Apply fixes following development rules (no duplicate files)
4. Re-test and verify fixes
5. Update health monitoring if needed

### **Implementation Priorities Post-Testing**:
1. **Performance Optimization**: Memory usage, large files
2. **UI Enhancements**: Batch operations, download queues
3. **Error Recovery**: Advanced retry mechanisms
4. **Documentation**: User guides and tutorials
5. **Production Features**: Monitoring, analytics, scaling

---

**Testing Focus**: Systematic validation of all modules with real-world scenarios  
**Success Criteria**: 100% module integration, <5s load time, robust error handling  
**Next Session**: Start with Health Monitor test, then File Processor validation