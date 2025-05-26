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

4. Configure Tesseract (Optional):
   - Ensure Tesseract is installed
   - Update the Tesseract path in `app.py`

## Configuration

### Environment Variables
- `SECRET_KEY`: Flask secret key
- `YOUTUBE_API_KEY`: Optional YouTube integration key
- `DEFAULT_OUTPUT_FOLDER`: Default save location for processed files

### API Key Management
- API keys managed through `api_keys.json`
- Use the built-in API key manager to create and manage keys

## Usage

### Starting the Server
```bash
python app.py
```

### Web Interface
1. Navigate to `http://localhost:5000`
2. Select input directory
3. Specify output filename
4. Start processing

### Command-Line Usage
```bash
python app.py -i /path/to/input/directory -o /path/to/output.json
```

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

- [ ] Add more document type support
- [ ] Enhance AI-powered content analysis
- [ ] Improve web scraping capabilities
- [ ] Develop more advanced visualization tools
- [ ] Create comprehensive documentation

---

**Note**: This project is continuously evolving. Always check the latest documentation and release notes.
