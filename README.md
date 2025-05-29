# NeuroGen Server

Version 2.0.2 - May 29, 2025

## 🚀 Overview

NeuroGen Server is a cutting-edge AI-powered document processing and web scraping platform designed for extracting, processing, and structuring web content and PDFs for LLM training data preparation. Built with a modern Flask Blueprint architecture and a revolutionary modular frontend system, it offers real-time progress tracking, advanced PDF processing, and comprehensive academic search integration.

## ✨ Key Features

- **🗂️ Advanced File Processing**: Convert documents (PDF, DOCX, PPTX, TXT, and 40+ formats) to structured JSON with Structify integration
- **🌐 Intelligent Web Scraping**: Extract content from websites with recursive crawling, pattern matching, and automatic PDF discovery
- **🎥 Playlist Downloading**: Download YouTube playlists and video content with metadata extraction
- **📚 Academic Search Integration**: Search and download papers from arXiv, Semantic Scholar, and PubMed
- **⚡ Real-time Progress Tracking**: Live updates via WebSocket connections with detailed statistics
- **📄 Advanced PDF Processing**: State-of-the-art PDF extraction with OCR support and table detection
- **🔧 Robust Task Management**: Background processing with cancellation, pause/resume support
- **🔐 API Key Management**: Secure handling for YouTube, Google, and academic API services
- **🎨 Modern UI**: Responsive design with dark/light theme support

## 🏗️ Architecture Highlights

### Backend: Flask Blueprint Architecture
- **Modular Design**: Organized by feature with clean separation of concerns
- **Performance**: Sub-5 second startup time (87% improvement)
- **Scalability**: Easy to add new features without affecting existing code
- **Production Ready**: Comprehensive error handling and logging

### Frontend: Revolutionary Module System
- **Fast Loading**: All 38 modules load in just 7.5 seconds
- **No Bundler Required**: Direct ES6 module imports
- **Hot Module Replacement**: No page refresh needed for updates
- **Smart Dependencies**: Automatic dependency resolution

## 📋 System Requirements

- Python 3.8+ (3.10+ recommended)
- Node.js 14+ (for development tools)
- Tesseract OCR 4.0+ (for document processing)
- Redis (optional, for enhanced session management)
- 4GB+ RAM (8GB recommended for heavy processing)
- Windows/Linux/macOS compatible

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/NeuroGenServer.git
cd NeuroGenServer/modules
```

### 2. Create Virtual Environment
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Install Tesseract OCR
- **Windows**: Download from [GitHub Tesseract releases](https://github.com/UB-Mannheim/tesseract/wiki)
- **Linux**: `sudo apt-get install tesseract-ocr`
- **macOS**: `brew install tesseract`

### 5. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 6. Run the Server
```bash
# Production mode (recommended)
python run_server_new.py

# Debug mode
python run_server_new.py --debug
```

Access the application at `http://localhost:5025`

## 📁 Project Structure

```
NeuroGenServer/
├── modules/                      # Main application directory
│   ├── app_new.py               # Flask application with Blueprints
│   ├── run_server_new.py        # Server startup script
│   ├── blueprints/              # Feature-based organization
│   │   ├── templates/           # HTML templates (NEW LOCATION!)
│   │   │   └── index.html       # Main application template
│   │   ├── core/                # Core functionality
│   │   │   ├── services.py      # Base classes and utilities
│   │   │   ├── utils.py         # Helper functions
│   │   │   └── routes.py        # Basic routes
│   │   ├── features/            # Feature modules
│   │   │   ├── file_processor.py     # Document processing
│   │   │   ├── web_scraper.py        # Web scraping
│   │   │   ├── playlist_downloader.py # YouTube integration
│   │   │   ├── academic_search.py    # Academic APIs
│   │   │   └── pdf_processor.py      # PDF handling
│   │   ├── api/                 # API management
│   │   │   └── management.py    # Task and key management
│   │   └── socketio_events.py   # Real-time events
│   ├── static/                  # Frontend assets
│   │   ├── js/                  # JavaScript modules
│   │   │   ├── index.js         # Main entry (optimized)
│   │   │   ├── module-manager.js # Module lifecycle
│   │   │   └── modules/         # Feature modules
│   │   │       ├── core/        # Core modules
│   │   │       ├── features/    # Feature modules
│   │   │       └── utils/       # Utility modules
│   │   └── css/                 # Stylesheets
│   ├── Structify/               # Document processing engine
│   ├── downloads/               # Output directory
│   └── temp/                    # Temporary files
├── requirements.txt             # Python dependencies
├── CLAUDE.md                   # Development guide
└── README.md                   # This file
```

## 🔌 API Endpoints

### File Processing
- `POST /api/process` - Process files from a directory
  ```json
  {
    "input_dir": "C:/path/to/files",
    "output_file": "processed_data"
  }
  ```
- `GET /api/status/<task_id>` - Get task status
- `GET /api/download/<task_id>` - Download results

### Web Scraping
- `POST /api/scrape` - Start web scraping
  ```json
  {
    "url": "https://example.com",
    "max_depth": 2,
    "include_patterns": ["*.pdf"],
    "exclude_patterns": ["*/archive/*"]
  }
  ```
- `GET /api/scrape/results/<task_id>` - Get scraping results

### Academic Search
- `POST /api/academic-search` - Search papers
  ```json
  {
    "query": "machine learning",
    "source": "arxiv",
    "max_results": 50
  }
  ```

### Task Management
- `POST /api/cancel/<task_id>` - Cancel task
- `GET /api/tasks/active` - List active tasks
- `GET /api/analytics` - Get usage analytics

## ⚙️ Configuration

### Environment Variables (.env)
```env
# API Keys
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_custom_search_engine_id
SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_key

# Server Configuration
HOST=127.0.0.1
PORT=5025
DEBUG=False

# Processing Configuration
MAX_FILE_SIZE=104857600  # 100MB
MAX_WORKERS=4
CHUNK_SIZE=4096
```

### API Key Management
Access the web interface at `/api/keys` to manage API keys securely.

## 🎯 Current Status & Roadmap

### ✅ Completed (v2.0.2)
- Flask Blueprint architecture migration
- Frontend modular system implementation
- Critical bug fixes (sanitize_filename, socketio, path handling)
- Performance optimization (87% faster startup)
- Template relocation to blueprints folder

### 🚧 In Progress
- Web Scraper UI implementation
- Academic Search frontend integration
- Enhanced PDF selection interface
- Batch download management

### 📋 Upcoming Features
- Recursive web crawling with depth control
- Citation network visualization
- Multi-language OCR support
- Cloud storage integration
- API rate limiting and quotas

## 🧪 Development

### Running Tests
```bash
# Run all tests
python -m pytest

# Run with coverage
python -m pytest --cov=blueprints

# Run specific test file
python -m pytest tests/test_file_processor.py
```

### Frontend Development
The frontend uses native ES6 modules without bundling:

1. **Module System**: Direct imports with automatic dependency resolution
2. **Hot Reload**: Changes reflected without page refresh
3. **Debug Mode**: Enhanced logging and diagnostics in development

### Code Style
- Python: PEP 8 with Black formatter
- JavaScript: ESLint with Airbnb config
- Commit messages: Conventional Commits format

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive development guide
- **[API Documentation](docs/API.md)** - Detailed API reference
- **[Architecture Guide](docs/ARCHITECTURE.md)** - System design details
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🐛 Known Issues

1. **Windows Paths on Linux**: When running on Linux, Windows paths need conversion
2. **Large File Processing**: Memory usage spikes with files over 500MB
3. **Academic API Limits**: Some academic sources have strict rate limits

## 📞 Support

- **GitHub Issues**: [Create an issue](https://github.com/yourusername/NeuroGenServer/issues)
- **Discussions**: [Join discussions](https://github.com/yourusername/NeuroGenServer/discussions)
- **Email**: support@neurogen.example.com

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Structify team for the document processing engine
- Tesseract OCR community
- Flask and SocketIO contributors
- All our amazing contributors!

---

**Made with ❤️ by the NeuroGen Team**