# NeuroGen Server

## Overview

NeuroGen Server is a comprehensive AI-powered document processing and web scraping platform designed for extracting, processing, and structuring web content and PDFs for LLM training data preparation. The system features real-time progress tracking, academic search integration, and sophisticated document analysis capabilities.

## 🚨 Current Status & Critical Issues

**Version**: 1.2.0  
**Last Updated**: January 13, 2025  
**Development Phase**: Critical Bug Fixes & Enhancement Implementation

### Active Critical Issue
- **Progress Bar Stuck at 50%** - Progress tracking gets stuck with duplicate percentage indicators
- **Affects**: File Processor, Playlist Downloader, and Web Scraper modules
- **Status**: Debugging protocol created, systematic fix in progress

### 📋 Development Resources
- **`CLAUDE.md`** - Complete project overview and development guide
- **`CLAUDE_CODE_INSTRUCTIONS.md`** - Systematic debugging instructions for progress bar fixes
- **`WEB_SCRAPER.md`** - Detailed web scraper enhancement requirements
- **`socketio events.txt`** - SocketIO event specifications

## Key Features

### 🚀 Core Processing Capabilities
- **Multi-threaded File Processing** with real-time progress tracking
- **Academic Search Integration** (arXiv, Semantic Scholar, PubMed)
- **YouTube Playlist Processing** with transcript extraction
- **Advanced Web Scraping** with recursive crawling capabilities
- **PDF Processing Pipeline** with OCR, table extraction, and Structify integration
- **Real-time SocketIO Communication** for progress updates and task management

### 📄 Supported Content Types
- **PDFs**: Academic papers, reports, scanned documents with OCR
- **Web Content**: Recursive crawling, academic sources, PDF discovery
- **YouTube**: Playlist transcripts, metadata, structured JSON output
- **Academic Sources**: Direct API integration with major research databases
- **Office Documents**: Processing and structured data extraction

### 🔍 Advanced Features
- **Citation Network Visualization** with D3.js integration
- **Academic API Integration** for research paper discovery
- **Concurrent Download Management** with progress tracking
- **Intelligent Content Classification** and filtering
- **Metadata Extraction and Enrichment**
- **LLM Training Data Preparation** with optimized JSON output

## Technology Stack

### Backend
- **Python 3.8+** with Flask web framework
- **Flask-SocketIO** for real-time communication with eventlet
- **Structify Module** for advanced PDF processing and OCR
- **Tesseract OCR** for scanned document processing
- **Academic APIs**: arXiv, Semantic Scholar, PubMed integration

### Frontend
- **JavaScript ES6 Modules** with sophisticated module loading system
- **Bootstrap UI** with responsive design
- **Socket.IO Client** for real-time progress updates
- **D3.js** for citation network visualization
- **Modular Architecture** with 60+ JavaScript modules

### Core Libraries
- **Document Processing**: PyMuPDF, pikepdf, pytesseract
- **Web Scraping**: Requests, BeautifulSoup, Selenium
- **Data Processing**: Pandas, NumPy, JSON processing
- **Networking**: Flask-SocketIO, urllib3, concurrent.futures

## Project Architecture

### Backend Structure
```
modules/
├── main.py                     # Main Flask application
├── main_part1.py              # SocketIO setup & core configuration  
├── main_part2_classes.py      # Core classes definition
├── main_part3_routes.py       # API routes implementation
├── academic_api.py            # Academic search integration
├── web_scraper.py             # Backend web scraping engine
├── pdf_processing.py          # PDF processing pipeline
└── structify_import.py        # Structify module integration
```

### Frontend Structure
```
static/js/
├── index.js                   # Main frontend entry point
├── modules/
│   ├── core/                  # Framework modules (app, moduleLoader, etc.)
│   ├── features/              # Feature modules (fileProcessor, webScraper, etc.)
│   ├── utils/                 # Utility modules (progressHandler, socketHandler, etc.)
│   └── tests/                 # Testing framework
└── diagnostics.js            # Frontend debugging tools
```

## Installation & Setup

### Prerequisites
- **Python 3.8+** with pip package manager
- **Node.js** (optional, for frontend development)
- **Tesseract OCR** installed and configured
- **Git** for version control

### Quick Start
```bash
# Clone the repository
git clone https://github.com/yourusername/neurogenserver.git
cd NeuroGenServer/NeuroGenServer

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the server
python run_server.py
```

### Configuration Files
- **`.env`** - Environment variables and API keys
- **`api_keys.json`** - API key management
- **`requirements.txt`** - Python dependencies
- **`modules/main.py`** - Main application configuration

### Required Environment Variables
```
SECRET_KEY=your_flask_secret_key
YOUTUBE_API_KEY=your_youtube_api_key
DEFAULT_OUTPUT_FOLDER=/path/to/output
TESSDATA_PREFIX=/path/to/tessdata
```

## Usage

### Starting the Server
```bash
# Production mode
python run_server.py

# Development mode with debug logging
FLASK_ENV=development python run_server.py
```

### Web Interface
Navigate to `http://localhost:5025` and access:

#### 📁 File Processor
- Upload and process multiple files simultaneously
- Real-time progress tracking with detailed statistics
- PDF extraction with OCR and table recognition
- Structured JSON output for LLM training

#### 🎵 Playlist Downloader  
- YouTube playlist URL processing
- Individual track and overall progress tracking
- Transcript extraction and metadata collection
- Batch download capabilities

#### 🌐 Web Scraper
- URL-based content extraction
- Recursive crawling with configurable depth
- Academic source integration
- PDF discovery and batch downloading

## 🔧 Current Issues & Debugging

### Progress Bar Debugging Protocol

#### Issue Description
- Progress bars get stuck at 50% across all modules
- Duplicate percentage indicators causing confusion
- SocketIO event synchronization problems

#### Debugging Resources
1. **Read `CLAUDE_CODE_INSTRUCTIONS.md`** for systematic debugging approach
2. **Enable debug mode** in browser console:
   ```javascript
   window.progressDebug = true;
   ```
3. **Monitor SocketIO events** in browser dev tools Network tab
4. **Check backend logs** for emit_progress_update calls

#### Quick Debug Commands
```javascript
// Frontend debugging
window.socket.on('progress_update', (data) => {
  console.log('Progress Debug:', data);
});

// Check for duplicate elements
document.querySelectorAll('[id*="progress"]').forEach(el => {
  console.log(`Element: ${el.id}, Text: ${el.textContent}`);
});
```

```python
# Backend debugging in main_part1.py
def emit_progress_update(task_id, progress, status="processing"):
    print(f"Backend Debug: {task_id} -> {progress}%")
    # Add detailed logging here
```

### Known Issues
- **Progress Handler**: Stuck at 50%, duplicate indicators
- **SocketIO Events**: Inconsistent event payload structure  
- **Module Integration**: Progress tracking inconsistencies
- **Error Recovery**: Needs enhancement across all modules

## Advanced Features

### Academic Search Integration
- **Multi-source Search**: arXiv, Semantic Scholar, PubMed
- **Citation Network Analysis**: Relationship mapping and visualization
- **Metadata Preservation**: Complete academic paper metadata
- **Batch Operations**: Bulk download and processing

### Web Scraping Enhancements (Planned)
- **Unified Interface**: Tabbed interface for different scraping modes
- **PDF Selection System**: Checkbox-based selection with batch operations
- **Download Management**: Concurrent downloads with progress tracking
- **Content Classification**: Intelligent document type detection

### PDF Processing Pipeline
- **Structify Integration**: Advanced document structure analysis
- **Multi-language OCR**: Support for various languages and scripts
- **Table Extraction**: Complex table structure recognition
- **Output Optimization**: LLM training data preparation

## Monitoring & Performance

### Real-time Monitoring
- **Progress Tracking**: Individual and batch operation progress
- **Connection Status**: SocketIO connection health monitoring
- **Performance Metrics**: Processing speed and resource usage
- **Error Reporting**: Comprehensive error logging and recovery

### Performance Optimization
- **Concurrent Processing**: Multi-threaded file and download handling
- **Memory Management**: Efficient resource utilization
- **Caching**: Intelligent caching for repeated operations
- **Rate Limiting**: Respectful API and web scraping rates

## Development Workflow

### For Developers
1. **Read `CLAUDE.md`** for complete project overview
2. **Follow `CLAUDE_CODE_INSTRUCTIONS.md`** for debugging protocol
3. **Check `WEB_SCRAPER.md`** for enhancement requirements
4. **Use modular architecture** - each feature is a separate module
5. **Test incrementally** - fix one issue at a time

### Code Conventions
- **DRY Principle**: Don't Repeat Yourself
- **KISS Principle**: Keep It Simple, Stupid
- **Single Responsibility**: Each function does one thing well
- **Fail Fast**: Raise errors early, never suppress failures

### Git Workflow
- **Branch Naming**: `feature/description`, `bugfix/critical-progress-fix`
- **Commit Format**: `"fix: progress bar stuck at 50% issue"`
- **Documentation**: Always update CLAUDE.md with changes

## Testing & Validation

### Manual Testing Protocol
1. **File Processor**: Upload test files, verify 0% → 100% progress
2. **Playlist Downloader**: Test YouTube URLs, check track progress
3. **Web Scraper**: Test URL scraping, verify phase progression
4. **Cross-module**: Ensure consistent behavior across all features

### Automated Testing
- **Frontend Tests**: `/static/js/tests/` directory
- **Backend Tests**: Unit tests for core functionality
- **Integration Tests**: End-to-end workflow validation

## Security & Best Practices

### Security Features
- **API Key Management**: Secure storage and rotation
- **Input Sanitization**: XSS and injection prevention
- **Rate Limiting**: Prevent abuse and respect API limits
- **Error Handling**: Secure error messages without information leakage

### Best Practices
- **Respectful Crawling**: robots.txt compliance and reasonable delays
- **Academic Ethics**: Proper attribution and citation handling
- **Resource Management**: Efficient memory and disk usage
- **User Privacy**: No tracking or data collection

## Troubleshooting

### Common Issues

#### Progress Bar Stuck at 50%
1. **Check SocketIO connection** in browser dev tools
2. **Monitor console for JavaScript errors** during progress updates
3. **Verify backend emit_progress_update calls** in server logs
4. **Test modules individually** to isolate the issue

#### Module Loading Issues
1. **Check browser console** for module loading errors
2. **Verify file paths** in the modules directory
3. **Clear browser cache** and reload the application
4. **Enable debug mode** for detailed error information

#### SocketIO Connection Problems
1. **Check firewall settings** for port 5025
2. **Verify CORS configuration** in main.py
3. **Monitor network tab** for WebSocket frames
4. **Test with different browsers** to isolate client issues

## Roadmap & Future Development

### 🔴 Immediate Priorities
- [ ] **Fix progress bar stuck at 50% issue**
- [ ] **Remove duplicate progress indicators**
- [ ] **Standardize SocketIO event handling**
- [ ] **Test all modules for consistent progress tracking**

### 🟡 Medium-term Goals
- [ ] **Enhanced Web Scraper UI** with tabbed interface
- [ ] **Academic search integration** with multiple sources
- [ ] **PDF selection system** with batch operations
- [ ] **Citation network visualization** with D3.js

### 🟢 Long-term Vision
- [ ] **Advanced crawling algorithms** (depth-first, breadth-first)
- [ ] **Multi-language OCR support** for global content
- [ ] **Performance optimization** for large-scale operations
- [ ] **Comprehensive API documentation** and developer tools

## Contributing

### Development Setup
1. **Fork the repository** and create a feature branch
2. **Read development documentation** in CLAUDE.md
3. **Follow debugging protocol** in CLAUDE_CODE_INSTRUCTIONS.md
4. **Test thoroughly** before submitting pull requests
5. **Update documentation** for any new features or fixes

### Code Review Process
- **Focus on one issue at a time** for easier review
- **Include test cases** for new functionality
- **Update CLAUDE.md** with significant changes
- **Maintain backward compatibility** when possible

## License

MIT License - see LICENSE file for details

## Support & Contact

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Complete guides in CLAUDE.md and related files
- **Development**: Follow CLAUDE_CODE_INSTRUCTIONS.md for systematic debugging

---

**⚠️ Current Development Focus**: Fixing progress bar issues and enhancing web scraper functionality. Please check CLAUDE.md for the latest project status and debugging protocol.
