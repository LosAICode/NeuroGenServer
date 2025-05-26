# NeuroGen Server

## Overview

NeuroGen Server is an advanced, modular file processing web application designed to handle complex document analysis and extraction tasks. Leveraging cutting-edge AI and machine learning technologies, it provides a robust platform for processing various file types with real-time progress tracking and detailed output generation.

## Key Features

### 🚀 Advanced Processing Capabilities
- Multi-threaded file processing
- Intelligent document type detection
- Comprehensive metadata extraction
- Real-time progress tracking
- Flexible input and output handling

### 📄 Supported Document Types
- PDF (Academic Papers, Reports, Scanned Documents)
- Text Files
- Images with OCR Support
- Office Documents

### 🔍 Specialized Processing
- Academic Paper Analysis
- PDF Table Extraction
- Optical Character Recognition (OCR)
- Metadata Extraction
- Citation Network Visualization
- YouTube Playlist Transcript Downloading
- Web Content Scraping

## Technology Stack

- **Backend**: Python 3.7+
- **Web Framework**: Flask
- **Real-time Communication**: Flask-SocketIO
- **Processing Engine**: Claude AI Structify Module
- **OCR**: Tesseract
- **Caching**: Redis
- **Additional Libraries**: 
  - PyMuPDF
  - pikepdf
  - Requests
  - papaparse

## Installation

### Prerequisites
- Python 3.7 or higher
- pip package manager
- Tesseract OCR installed

### Setup Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/neurogenserver.git
   cd neurogenserver
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables in .env file:
   ```
   SECRET_KEY=your_secret_key
   YOUTUBE_API_KEY=your_youtube_api_key
   DEFAULT_OUTPUT_FOLDER=/path/to/default/output
   ```

5. Configure Tesseract:
   - Ensure Tesseract is installed
   - Update the Tesseract path in `main.py` if necessary

## Configuration

### Environment Variables
- `SECRET_KEY`: Flask secret key
- `YOUTUBE_API_KEY`: Required for YouTube playlist functionality
- `DEFAULT_OUTPUT_FOLDER`: Default save location for processed files

### API Key Management
- API keys managed through `api_keys.json`
- Use the built-in API key manager to create and manage keys

## Usage

### Starting the Server
```bash
python main.py
```

### Web Interface
1. Navigate to `http://localhost:5000`
2. Select one of the available processing options:
   - File Processing
   - YouTube Playlist Download
   - Web Scraping

### File Processing
1. Select input directory
2. Specify output filename
3. Start processing

### YouTube Playlist Download
1. Enter YouTube playlist URLs
2. Specify output directory and filename
3. Download transcripts and metadata

### Web Scraping
1. Enter website URLs
2. Select scraping mode (Full Text, Metadata, etc.)
3. Specify download directory
4. Start scraping

## Advanced Processing Options

### PDF Processing
- Automatic document type detection
- Scanned document OCR
- Table extraction
- Metadata parsing
- Citation network generation

### Web Scraping
- URL-based document retrieval
- Academic research source integration
- PDF download and processing

### YouTube Playlist Processing
- Transcript extraction
- Metadata collection
- Structured JSON output

## Troubleshooting

### Common Issues

#### Progress Bar Issues
- If the progress bar gets stuck at 50%, check network connectivity and server logs
- Ensure socket connections are maintained throughout the task

#### Playlist Download Issues
- Verify your YouTube API key is valid in `.env` file
- Ensure all playlist URLs contain a valid `list=` parameter

#### Web Scraper Issues
- Check for proper URL formatting
- Ensure output directory is writable
- For academic paper scraping, verify API endpoints are accessible

## Performance Optimization

- Configurable thread count
- Efficient memory management
- Background task scheduling
- Caching mechanisms

## Error Handling

- Comprehensive error logging
- Automatic error recovery
- Detailed error reporting
- Graceful degradation

## Security

- API key authentication
- Input sanitization
- Secure file handling
- Rate limiting

## Monitoring

- Detailed processing statistics
- Real-time progress tracking
- Performance metrics collection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License

## Contact

For support, please open an issue on the GitHub repository or contact the maintainer.

## Roadmap

- [ ] Enhanced progress tracking for all modules
- [ ] Improved academic paper integration
- [ ] More robust YouTube playlist handling
- [ ] Advanced web scraping capabilities
- [ ] Better error recovery mechanisms

---

**Note**: This project is continuously evolving. Always check the latest documentation and release notes.