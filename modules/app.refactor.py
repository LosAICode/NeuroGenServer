import eventlet
eventlet.monkey_patch()
from flask_socketio import SocketIO
import os
import sys
import logging
import re
import json
import time
import uuid
import hashlib
import tempfile
import threading
import subprocess
import traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple, Set, Any, Union, Callable
from urllib.parse import urlencode
from functools import wraps
from datetime import datetime




        
# Import structify module if available
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    if structify_module is None:
        logger.error("Failed to load structify_module: get_claude_module() returned None")
        # Set a flag to indicate it's not available
        structify_available = False
    else:
        structify_available = True
        # Get components from the module
        FileStats = components.get('FileStats')
        process_all_files = components.get('process_all_files')
        logger.info("Successfully loaded structify_module and components")
except ImportError as e:
    logger.error(f"Could not import structify_module: {e}")
    structify_available = False
    # Define placeholder class
    class FileStats:
        pass
    def process_all_files(*args, **kwargs):
        logger.error("process_all_files not available - structify_module missing")
        return {"error": "Processing module not available"}

    
structify_available = structify_module is not None
pdf_extractor_available = False
custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
os.makedirs(custom_temp_dir, exist_ok=True)
tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
os.makedirs(tessdata_dir, exist_ok=True)

try:
    import stat
    os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)  # Full permissions for all
    logger.info(f"Set full permissions on temp directory: {custom_temp_dir}")
except Exception as e:
    logger.warning(f"Could not set permissions on temp directory: {e}")

# Set environment variables to use our temp directory
os.environ['TEMP'] = custom_temp_dir
os.environ['TMP'] = custom_temp_dir
os.environ['TESSDATA_PREFIX'] = os.path.abspath(tessdata_dir)
logger.info(f"Set TESSDATA_PREFIX to: {os.environ['TESSDATA_PREFIX']}")
logger.info(f"Set temp directory environment variables to: {custom_temp_dir}")

import pytesseract

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'  # Update this with your actual path
os.environ['TESSDATA_PREFIX'] = r'C:\Program Files\Tesseract-OCR\tessdata'  # Update this with your actual path

try:
    import pytesseract
    tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    
    # Verify the executable exists
    if os.path.exists(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        logger.info(f"Set Tesseract command path to: {tesseract_path}")
    else:
        logger.warning(f"Tesseract executable not found at: {tesseract_path}")
        alternate_paths = [
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Tesseract-OCR\tesseract.exe'
        ]
        for alt_path in alternate_paths:
            if os.path.exists(alt_path):
                pytesseract.pytesseract.tesseract_cmd = alt_path
                logger.info(f"Set Tesseract command path to alternate location: {alt_path}")
                break
except ImportError:
    logger.warning("pytesseract not available, cannot set command path")
    
if 'structify_module' in globals() and structify_module:
    if hasattr(structify_module, 'TEMP_OCR_DIR'):
        structify_module.TEMP_OCR_DIR = custom_temp_dir
    
    if hasattr(structify_module, 'initialize_ocr_environment'):
        structify_module.initialize_ocr_environment()
    
    if hasattr(structify_module, 'patch_pytesseract_temp_dir'):
        structify_module.patch_pytesseract_temp_dir()
        
    logger.info(f"Applied temp directory configuration to structify_module")
    
pdf_extractor_available = False
try:
    import pdf_extractor
    pdf_extractor_available = True
    logger.info("Successfully imported pdf_extractor module")
    
    # Try to initialize pdf_extractor
    try:
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
    except Exception as e:
        logger.error(f"Error initializing PDF extractor: {e}")
except ImportError as e:
    logger.warning(f"pdf_extractor module not available: {e}. PDF processing will be limited.")
    # Create a more robust placeholder class with better error messages
    class PDFExtractorPlaceholder:
        @staticmethod
        def process_pdf(*args, **kwargs):
            error_msg = "PDF extractor module not available. Install with 'pip install pdf_extractor'"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
            
        @staticmethod
        def extract_tables_from_pdf(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return []
            
        @staticmethod
        def detect_document_type(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return "unknown"
            
        @staticmethod
        def initialize_module(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return {"status": "error", "capabilities": {}}
    
    pdf_extractor = PDFExtractorPlaceholder()
    
if pdf_extractor_available:
    try:
        # Initialize the module and log its capabilities
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status['capabilities']}")
    except Exception as e:
        logger.error(f"Error initializing PDF extractor: {e}")


try:
    from safe_ocr_handler import setup_ocr_environment, patch_pytesseract, start_cleanup_service
      
    ocr_config = setup_ocr_environment()
    logger.info(f"OCR environment set up with temp directory: {ocr_config['base_temp_dir']}")
    
    # Patch pytesseract for better temp file handling
    patch_pytesseract()
    
    # Start the cleanup service
    start_cleanup_service(interval_minutes=30)
    
    logger.info("OCR handler initialized successfully")
except ImportError:
    logger.warning("Could not import safe_ocr_handler. OCR functionality may be limited.")
except Exception as e:
    logger.error(f"Error initializing OCR handler: {e}")

# -----------------------------------------------------------------------------
# Academic API Integration - Import Section
# -----------------------------------------------------------------------------

academic_api_available = False
academic_api_client_available = False
citation_visualizer_available = False
research_assistant_available = False
redis_integration_available = False

try:
    import academic_api
    academic_api_available = True
    logger.info("Successfully imported academic_api module")
except ImportError as e:
    logger.warning(f"academic_api module not available: {e}")
    # Create a flag to indicate it's not available
    academic_api_available = False
    logger.info("Using integrated Academic API implementation in app.py")

try:
    from academic_api_client import AcademicApiClient
    academic_api_client_available = True
    logger.info("Successfully imported academic_api_client module")
except ImportError as e:
    logger.warning(f"academic_api_client module not available: {e}")
    academic_api_client_available = False

try:
    from citation_network_visualizer import CitationNetworkVisualizer
    citation_visualizer_available = True
    logger.info("Successfully imported citation_network_visualizer module")
except ImportError as e:
    logger.warning(f"citation_network_visualizer module not available: {e}")
    citation_visualizer_available = False

try:
    from academic_research_assistant import AcademicResearchAssistant
    research_assistant_available = True
    logger.info("Successfully imported academic_research_assistant module")
except ImportError as e:
    logger.warning(f"academic_research_assistant module not available: {e}")
    research_assistant_available = False

# Flask and related imports - Handle potential import errors
try:
    from flask import Flask, render_template, request, jsonify, send_from_directory, Response, abort, send_file
    from flask_socketio import SocketIO, emit, disconnect
    from werkzeug.utils import secure_filename
except ImportError as e:
    logger.error(f"Failed to import Flask dependencies: {e}")
    logger.error("Install with: pip install flask flask-socketio werkzeug")
    sys.exit(1)  # Exit if these critical dependencies are missing
    # Use placeholder classes if imports fail in IDE but you know they'll be available at runtime
    class Flask: pass
    class SocketIO: pass

# ----------------------------------------------------------------------------
# Flask + SocketIO Setup
# ----------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "neurogenserver")
app.config["UPLOAD_FOLDER"] = os.environ.get("UPLOAD_FOLDER", tempfile.mkdtemp())

import logging
socketio_logger = logging.getLogger('socketio')
socketio_logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
socketio_logger.addHandler(handler)

socketio = SocketIO(
    app, 
    cors_allowed_origins="*",  # Adjust this for production
    logger=socketio_logger,
    engineio_logger=socketio_logger,
    async_mode='eventlet',
    ping_timeout=60,  # Increase ping timeout
    ping_interval=25,  # More frequent pings
    max_http_buffer_size=10e6  # 10MB buffer for large transfers
)

def setup_logging(log_level=logging.INFO, log_file=None):
    """
    Set up logging configuration for the application
    """
    # Create logger if it doesn't exist
    logger = logging.getLogger("file_processor")
    logger.setLevel(log_level)
    
    # Remove existing handlers to prevent duplicate logs
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger

# Connection event handlers

    # Don't perform cleanup yet - client might reconnect











# ----------------------------------------------------------------------------
# Error Handlers
# ----------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(error):
    return structured_error_response("NOT_FOUND", "The requested resource was not found.", 404)

@app.errorhandler(413)
def request_entity_too_large(error):
    return structured_error_response("REQUEST_TOO_LARGE", f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE/(1024*1024)}MB.", 413)

@app.errorhandler(500)
def internal_server_error(error):
    return structured_error_response("SERVER_ERROR", "An internal server error occurred.", 500)

# ----------------------------------------------------------------------------
# Socket.IO Events
# ----------------------------------------------------------------------------


        
# Load environment variables
from dotenv import load_dotenv
load_dotenv()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    raise EnvironmentError("YOUTUBE_API_KEY not set in .env")
# Handle the pikepdf import
pikepdf_available = False
try:
    import pikepdf
    pikepdf_available = True
except ImportError:
    logger.warning("pikepdf not available. Some PDF repair functions will be limited.")
    pikepdf_available = False

try:
    from Structify.claude import TEMP_OCR_DIR
except ImportError:
    # Fallback definition if import fails
    TEMP_OCR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    os.makedirs(TEMP_OCR_DIR, exist_ok=True)
    
# Third-party libraries with better error handling
requests_available = False
try:
    import requests
    from requests.adapters import HTTPAdapter, Retry
    requests_available = True
except ImportError:
    logger.warning("Requests not installed. Web access functionality will be limited.")

# Optional magic library for MIME detection
magic_available = False
try:
    import magic
    magic_available = True
except ImportError:
    logger.warning("python-magic not available. Try installing python-magic-bin on Windows")
    magic_available = False

try:
    import web_scraper
    from web_scraper import (
        process_url,             # Now properly implemented in web_scraper.py
        download_pdf,            # Already exists in web_scraper.py
        fetch_pdf_links,         # Exists in web_scraper.py
        scrape_and_download_pdfs # Exists in web_scraper.py
    )
    logger.info("Successfully imported web_scraper module")
    web_scraper_available = True
except ImportError as e:
    logger.warning(f"web_scraper module not available: {e}. Scraper functionality will be limited.")
    web_scraper_available = False
    # Create placeholder functions
    def process_url(*args, **kwargs): 
        logger.error("web_scraper module not available")
        return {"error": "Web scraper module not available"}
    
    def download_pdf(*args, **kwargs):
        logger.error("web_scraper module not available")
        return None
    
    def fetch_pdf_links(*args, **kwargs):
        logger.error("web_scraper module not available")
        return []
    
    def scrape_and_download_pdfs(*args, **kwargs):
        logger.error("web_scraper module not available")
        return {"error": "Web scraper module not available"}

try:
    from playlists_downloader import download_all_playlists
except ImportError:
    logger.warning("playlists_downloader module not available. Playlist functionality will be limited.")
    def download_all_playlists(*args, **kwargs):
        logger.error("playlists_downloader module not available")
        return []

import neurogenlib
try:
    from optimized_pdf_processor import MemoryEfficientPDFProcessor
    from file_path_utility import FilePathUtility
    from error_handling import ErrorHandler
    optimized_components_available = True
except ImportError:
    optimized_components_available = False
        

# ----------------------------------------------------------------------------
# Requests Session with Retries
# ----------------------------------------------------------------------------
if requests_available:
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=0.3,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; NeuroGen/1.0)"
else:
    session = None

try:
    from academic_api_redis import RedisCache, RedisRateLimiter
    redis_integration_available = True
    logger.info("Successfully imported academic_api_redis module")
except ImportError as e:
    logger.warning(f"academic_api_redis module not available: {e}")
    redis_integration_available = False

   
# ----------------------------------------------------------------------------
# Task Management
# ----------------------------------------------------------------------------
active_tasks = {}
tasks_lock = threading.Lock()

def main():
    """Main entry point for CLI usage"""
    import argparse
    parser = argparse.ArgumentParser(description="Enhanced Claude file processor with parallel execution, PDF extraction, and custom tagging.")

    parser.add_argument("-i", "--input", default=DEFAULT_OUTPUT_PATH, help="Root directory for input files.")
    parser.add_argument("-o", "--output", default=os.path.join(DEFAULT_OUTPUT_FOLDER, "bulk_output.json"), help="Path to output JSON file.")
    parser.add_argument("--max-chunk-size", type=int, default=4096, help="Maximum chunk size in characters.")
    parser.add_argument("--threads", type=int, default=DEFAULT_NUM_THREADS, help="Number of threads to use for processing.")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode.")

    args = parser.parse_args()

    # Set up logging level based on debug flag
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Validate and adjust output file path
    output_filepath = get_output_filepath(args.output)

    # Log settings
    logger.info(f"Processing files from: {args.input}")
    logger.info(f"Output will be saved to: {output_filepath}")
    logger.info(f"Using {args.threads} threads and max chunk size of {args.max_chunk_size}")

    # Check if structify_module is available
    if not structify_available:
        logger.error("Claude module not available. Cannot process files.")
        sys.exit(1)

    # Process files
    result = structify_module.process_all_files(
        root_directory=args.input,
        output_file=output_filepath,
        max_chunk_size=args.max_chunk_size,
        executor_type="thread",
        max_workers=args.threads,
        stop_words=structify_module.DEFAULT_STOP_WORDS,
        use_cache=False,
        valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
        stats_only=False,
        include_binary_detection=True
    )
    
    logger.info(f"Processing completed. JSON output saved at: {output_filepath}")
    return result

def download_tessdata():
    """Download Tesseract language data if it doesn't exist"""
    tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        try:
            import requests
            logger.info("Downloading eng.traineddata...")
            url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
            r = requests.get(url, stream=True)
            r.raise_for_status()
            
            with open(eng_traineddata, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
            logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata}")
        except Exception as e:
            logger.error(f"Failed to download tessdata: {e}")

download_tessdata()

def ensure_tessdata_files():
    """Ensure tesseract language data files exist"""
    tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        source_path = r'C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata'
        if os.path.exists(source_path):
            try:
                import shutil
                shutil.copy2(source_path, eng_traineddata)
                logger.info(f"Copied eng.traineddata from {source_path} to {eng_traineddata}")
            except Exception as e:
                logger.warning(f"Failed to copy eng.traineddata: {e}")
                # Try to download if copy fails
                download_tessdata()
        else:
            # Try to download if source file doesn't exist
            download_tessdata()
    
    if os.path.exists(eng_traineddata):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata}")
    else:
        logger.warning(f"eng.traineddata not found at {eng_traineddata}")

ensure_tessdata_files()

def ensure_temp_directory():
    """
    Ensure the temp directory exists and has proper permissions.
    Call this before any operation that requires the temp directory.
    """
    custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    
    # Ensure the directory exists
    os.makedirs(custom_temp_dir, exist_ok=True)
    
    # Try to set full permissions
    try:
        import stat
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    except Exception:
        pass
        
    # Set environment variables
    os.environ['TEMP'] = custom_temp_dir
    os.environ['TMP'] = custom_temp_dir
    
    # Return the path for use in operations
    return custom_temp_dir

def get_output_filepath(filename, user_defined_dir=None):
    """Resolves user-specified output directory or uses default fallback."""
    directory = user_defined_dir or DEFAULT_OUTPUT_FOLDER
    return resolve_output_path(directory, filename)

def resolve_output_path(directory, filename):
    """
    Resolve output path with proper directory creation if needed.
    
    Args:
        directory (str): The directory to save the file in
        filename (str): Output filename (without extension)
        
    Returns:
        str: Full path to the resolved output file
    """
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, filename)

def safe_split(text_value, delimiter=','):
    """
    Safely split a text value with proper validation.
    
    Args:
        text_value: The text to split
        delimiter: The delimiter to split on
        
    Returns:
        List of split values or empty list if text_value is None/invalid
    """
    if text_value is None:
        return []
    
    if not isinstance(text_value, str):
        try:
            text_value = str(text_value)
        except:
            return []
    
    return text_value.split(delimiter)

# In modules/app.py

def cleanup_temp_files():
    """Clean up any remaining temporary files in the OCR temp directory."""
    import os, glob, time
    
    # Define temp directory if not already defined
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir, exist_ok=True)
        
    # Get all temp files older than 30 minutes
    current_time = time.time()
    for file_path in glob.glob(os.path.join(temp_dir, "ocr_temp_*")):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 1800:  # 30 minutes
                try:
                    os.remove(file_path)
                    logger.debug(f"Removed temp file {file_path}")
                except PermissionError:
                    # On Windows, files may be locked temporarily
                    logger.debug(f"Could not remove temp file {file_path} - may be in use")
                except OSError as e:
                    logger.debug(f"OS error removing temp file {file_path}: {e}")
        except Exception as e:
            logger.debug(f"Error cleaning up temp file {file_path}: {e}")
            
# Fix for the periodic cleanup function in app.py
def start_periodic_cleanup():
    """Start periodic cleanup of temporary files."""
    import threading
    import time
    
    def cleanup_worker():
        while True:
            try:
                cleanup_temp_files()
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
            time.sleep(3600)  # Run every hour
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()

start_periodic_cleanup()
# Replace the process_file function to properly utilize claude.py
def process_file(file_path, output_path=None, max_chunk_size=4096, extract_tables=True, use_ocr=True):
    """
    Process a file using claude.py's enhanced capabilities
    
    Args:
        file_path: Path to the file
        output_path: Output JSON path (if None, derives from input filename)
        max_chunk_size: Maximum chunk size for text processing
        extract_tables: Whether to extract tables (for PDFs)
        use_ocr: Whether to use OCR for scanned content
        
    Returns:
        Dictionary with success status and processing details
    """
    if not structify_module:
        return {"status": "error", "error": "Claude module not available"}
    
    try:
        # Check if file exists
        if not os.path.isfile(file_path):
            return {"status": "error", "error": f"File not found: {file_path}"}
            
        # For PDF files, use the specialized PDF handling
        if file_path.lower().endswith('.pdf'):
            logger.info(f"Processing PDF file: {file_path}")
            
            # If output_path is not specified, create a default one
            if not output_path:
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                output_path = os.path.join(os.path.dirname(file_path), f"{base_name}_processed.json")
            
            # First try direct PDF processing with enhanced features
            if hasattr(structify_module, 'process_pdf'):
                try:
                    # Detect document type to apply proper processing
                    doc_type = None
                    if hasattr(structify_module, 'detect_document_type'):
                        try:
                            doc_type = structify_module.detect_document_type(file_path)
                            logger.info(f"Detected document type: {doc_type}")
                        except Exception as type_err:
                            logger.warning(f"Error detecting document type: {type_err}")
                    
                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                    apply_ocr = use_ocr or (doc_type == "scan")
                    
                    result = structify_module.process_pdf(
                        pdf_path=file_path, 
                        output_path=output_path,
                        max_chunk_size=max_chunk_size,
                        extract_tables=extract_tables,
                        use_ocr=apply_ocr,
                        return_data=True
                    )
                    
                    if result:
                        return {
                            "status": "success",
                            "file_path": file_path,
                            "output_path": output_path,
                            "data": result,
                            "document_type": doc_type
                        }
                except Exception as pdf_err:
                    logger.warning(f"Direct PDF processing failed, falling back: {pdf_err}")
            
            # Fallback to general processing
            result = structify_module.process_all_files(
                root_directory=os.path.dirname(file_path),
                output_file=output_path,
                max_chunk_size=max_chunk_size,
                file_filter=lambda f: f == file_path,
                include_binary_detection=False  # PDFs should not be treated as binary
            )
            
            if result:
                return {
                    "status": "success",
                    "file_path": file_path,
                    "output_path": output_path,
                    "data": result
                }
            else:
                return {"status": "error", "error": "PDF processing failed"}
                
        else:
            # For non-PDF files, use the general processing capability
            logger.info(f"Processing file: {file_path}")
            
            # If output_path is not specified, create a default one
            if not output_path:
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                output_path = os.path.join(os.path.dirname(file_path), f"{base_name}_processed.json")
            
            # Use claude.py's general document processing if available
            if hasattr(structify_module, 'process_document'):
                result = structify_module.process_document(
                    file_path=file_path,
                    output_path=output_path,
                    max_chunk_size=max_chunk_size,
                    return_data=True
                )
            else:
                # Fallback to general processing
                result = structify_module.process_all_files(
                    root_directory=os.path.dirname(file_path),
                    output_file=output_path,
                    max_chunk_size=max_chunk_size,
                    file_filter=lambda f: f == file_path
                )
            
            if result:
                return {
                    "status": "success",
                    "file_path": file_path,
                    "output_path": output_path,
                    "data": result
                }
            else:
                return {"status": "error", "error": "File processing failed"}
    
    except Exception as e:
        logger.error(f"Error processing file {file_path}: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}
           


def download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER) -> str:
    """
    Download a PDF from the given URL using streaming to save memory.
    Returns the local file path on success.
    
    Args:
        url (str): The URL to download from
        save_path (str): Directory where the PDF will be saved
        
    Returns:
        str: The path to the downloaded PDF file
        
    Raises:
        ValueError: If the download fails
    """
    logger.info(f"Downloading PDF: {url}")
    
    # Convert arXiv abstract links to PDF links if needed
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"):
            pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")
    else:
        pdf_url = url
    
    # Ensure the save directory exists
    try:
        os.makedirs(save_path, exist_ok=True)
        logger.info(f"Ensured download directory exists: {save_path}")
    except Exception as e:
        logger.error(f"Failed to create download directory {save_path}: {e}")
        raise ValueError(f"Cannot create download directory: {e}")
    
    # Generate a unique filename based on URL
    url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:10]
    filename = pdf_url.split("/")[-1] or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    # Sanitize the filename and add hash to make it unique
    filename = sanitize_filename(f"{os.path.splitext(filename)[0]}_{url_hash}.pdf")
    file_path = os.path.join(save_path, filename)
    
    # If file already exists, return the path without downloading
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:  # Ensure it's not an empty file
        logger.info(f"PDF already exists: {file_path}")
        return file_path
    
    # Create a requests session with retries
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
    session.mount('http://', HTTPAdapter(max_retries=retries))
    session.mount('https://', HTTPAdapter(max_retries=retries))
    
    # Download with retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Use streaming to handle large files efficiently
            response = session.get(pdf_url, stream=True, timeout=30, 
                                  headers={
                                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                      "Accept": "application/pdf,*/*",
                                      "Connection": "keep-alive"
                                  })
            response.raise_for_status()
            
            # Check if content type indicates it's a PDF (if available)
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type and 'application/pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Content type not PDF: {content_type}. Checking content...")
                # Check first few bytes to see if it starts with %PDF
                first_chunk = next(response.iter_content(256), None)
                if not first_chunk or not first_chunk.startswith(b'%PDF-'):
                    raise ValueError(f"Content at {pdf_url} is not a PDF")
            
            # Stream content to file
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)
            
            # Verify the file is a valid PDF and has content
            if not os.path.exists(file_path) or os.path.getsize(file_path) < 1000:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise ValueError("Downloaded file is not a valid PDF (too small)")
                
            logger.info(f"PDF successfully downloaded to: {file_path}")
            
            # Emit Socket.IO event for PDF download progress if using Socket.IO
            try:
                socketio.emit("pdf_download_progress", {
                    "url": url,
                    "progress": 100,
                    "status": "success",
                    "file_path": file_path
                })
            except Exception as socket_err:
                logger.debug(f"Socket.IO event emission failed: {socket_err}")
            
            return file_path
            
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                # Exponential backoff
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"Failed to download PDF after {max_retries} attempts: {e}")
                raise ValueError(f"Failed to download PDF from {pdf_url}: {e}")

def sanitize_filename(filename: str) -> str:
    """
    Thoroughly sanitize a filename by removing unsafe characters and limiting its length.
    
    Args:
        filename: The filename to sanitize
        
    Returns:
        A sanitized filename safe for all operating systems
    """
    # Replace unsafe characters with underscores
    safe_name = re.sub(r'[^\w\-. ]', '_', filename)
    
    # Remove leading/trailing periods and spaces
    safe_name = safe_name.strip('. ')
    
    # Limit length to 100 characters
    safe_name = safe_name[:100]
    
    # If the sanitization resulted in an empty string, use a default
    if not safe_name:
        safe_name = "untitled"
        
    return safe_name

def normalize_path(path: str) -> str:
    """
    Normalize a path by resolving symlinks, user paths, environment variables.
    
    Args:
        path: The path to normalize
        
    Returns:
        A normalized absolute path
    """
    try:
        # Expand user directory (e.g., ~)
        path = os.path.expanduser(path)
        
        # Expand environment variables (e.g., $HOME)
        path = os.path.expandvars(path)
        
        # Resolve relative paths 
        path = os.path.abspath(path)
        
        # Normalize path separators for the OS
        path = os.path.normpath(path)
        
        return path
    except Exception as e:
        logger.error(f"Error normalizing path {path}: {e}")
        return path

def detect_common_path_from_files(files: List[str]) -> Tuple[str, bool]:
    """
    Detect the common parent directory from a list of files.
    
    Args:
        files: List of file paths
        
    Returns:
        Tuple of (common_path, success_bool)
    """
    if not files:
        return "", False
    
    try:
        # Normalize all paths
        normalized_paths = [normalize_path(p) for p in files]
        
        # Find common path
        common_path = os.path.commonpath(normalized_paths)
        
        # Verify common path exists
        if os.path.isdir(common_path):
            return common_path, True
        
        # Try parent directory
        parent = os.path.dirname(common_path)
        if os.path.isdir(parent):
            return parent, True
            
        return common_path, False
    except ValueError:
        # This happens when paths have different drives (Windows) or root directories
        logger.warning("Could not find common path - paths on different drives or roots")
        return "", False
    except Exception as e:
        logger.error(f"Error detecting common path: {e}")
        return "", False

def find_directory_in_standard_locations(folder_name: str) -> str:
    """
    Look for a folder name in standard locations.
    
    Args:
        folder_name: The name of the folder to find
        
    Returns:
        Full path if found, empty string otherwise
    """
    # Define standard locations based on OS
    if platform.system() == 'Windows':
        # Windows standard locations
        standard_locs = [
            os.getcwd(),
            os.path.join(os.path.expanduser('~'), 'Documents'),
            os.path.join(os.path.expanduser('~'), 'Desktop'),
            os.path.join(os.path.expanduser('~'), 'Downloads'),
            os.path.join(os.path.expanduser('~'), 'OneDrive', 'Documents')
        ]
    else:
        # Unix/Mac standard locations
        standard_locs = [
            os.getcwd(),
            os.path.join(os.path.expanduser('~'), 'Documents'),
            os.path.join(os.path.expanduser('~'), 'Desktop'),
            os.path.join(os.path.expanduser('~'), 'Downloads')
        ]
    
    # Look for folder in standard locations
    for base in standard_locs:
        try:
            potential = os.path.join(base, folder_name)
            if os.path.isdir(potential):
                logger.info(f"Found directory under {base}: {potential}")
                return potential
        except Exception as e:
            logger.debug(f"Error checking {base}: {e}")
    
    return ""

def get_parent_directory(path: str) -> str:
    """
    Get the nearest existing parent directory.
    
    Args:
        path: The path to check
        
    Returns:
        The closest existing parent directory or empty string
    """
    try:
        path = normalize_path(path)
        parent = path
        
        # Find the nearest existing parent
        while parent and not os.path.isdir(parent):
            parent = os.path.dirname(parent)
            
            # Break if we've reached the root
            if parent == os.path.dirname(parent):
                return ""
        
        return parent if parent and parent != path else ""
    except Exception as e:
        logger.error(f"Error finding parent directory: {e}")
        return ""

def verify_and_create_directory(path: str) -> Tuple[bool, str, str]:
    """
    Verify if a directory exists, and create it if requested.
    
    Args:
        path: The directory path to verify/create
        
    Returns:
        Tuple of (success, message, path)
    """
    try:
        path = normalize_path(path)
        
        # Check if directory exists
        if os.path.isdir(path):
            return True, "Directory exists", path
            
        # Get parent directory
        parent = get_parent_directory(path)
        
        # If parent doesn't exist, fail
        if not parent:
            return False, "No valid parent directory found", ""
            
        # Try to create the directory
        try:
            os.makedirs(path, exist_ok=True)
            logger.info(f"Created directory: {path}")
            return True, "Directory created successfully", path
        except Exception as e:
            logger.error(f"Failed to create directory {path}: {e}")
            return False, f"Failed to create directory: {e}", parent
            
    except Exception as e:
        logger.error(f"Error verifying directory {path}: {e}")
        return False, f"Error verifying directory: {e}", ""

def check_file_exists(file_path: str) -> bool:
    """
    Check if a file exists.
    
    Args:
        file_path: The file path to check
        
    Returns:
        True if file exists
    """
    try:
        file_path = normalize_path(file_path)
        return os.path.isfile(file_path)
    except Exception as e:
        logger.error(f"Error checking if file exists {file_path}: {e}")
        return False

def is_extension_allowed(filename: str) -> bool:
    """Check if file extension is allowed."""
    ALLOWED_EXTENSIONS = {"txt", "pdf", "png", "jpg", "jpeg", "gif", "py", "js", "html", "css", "md", "doc", "docx", "xls", "xlsx"}
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    return ext in ALLOWED_EXTENSIONS

def is_mime_allowed(file_stream) -> bool:
    """Check if MIME type is allowed (if 'magic' is installed)."""
    if not magic_available:
        return True
    ALLOWED_MIME_TYPES = {
        "text/plain", "text/html", "application/pdf",
        "image/png", "image/jpeg", "text/css",
        "application/javascript", "application/json",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
    chunk = file_stream.read(1024)
    file_stream.seek(0)
    mime_type = magic.from_buffer(chunk, mime=True)
    return mime_type in ALLOWED_MIME_TYPES

def structured_error_response(code: str, message: str, status_code: int):
    """Return a standardized error JSON response."""
    resp = jsonify({"error": {"code": code, "message": message}})
    resp.status_code = status_code
    return resp


# ----------------------------------------------------------------------------
# Enhanced download_pdf Function
# ----------------------------------------------------------------------------
def enhanced_download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER) -> str:
    """
    Download a PDF from the given URL using streaming to save memory.
    Returns the local file path on success.
    
    Args:
        url (str): The URL to download from
        save_path (str): Directory where the PDF will be saved
        
    Returns:
        str: The path to the downloaded PDF file
        
    Raises:
        ValueError: If the download fails
    """
    # First try web_scraper's version if available
    if 'download_pdf' in globals():
        try:
            return download_pdf(url, save_path)
        except Exception as e:
            logger.warning(f"Web scraper download_pdf failed: {e}. Trying fallback method.")
    
    # Fallback implementation if web_scraper is not available
    if not requests_available:
        raise ValueError("Requests library not available. Cannot download PDF.")
    
    logger.info(f"Downloading PDF: {url}")
    
    # Convert arXiv abstract links to PDF links if needed
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"):
            pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")
    else:
        pdf_url = url
    
    # Ensure the save directory exists
    try:
        os.makedirs(save_path, exist_ok=True)
        logger.info(f"Ensured download directory exists: {save_path}")
    except Exception as e:
        logger.error(f"Failed to create download directory {save_path}: {e}")
        raise ValueError(f"Cannot create download directory: {e}")
    
    # Generate a unique filename based on URL
    url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:10]
    filename = pdf_url.split("/")[-1] or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    # Sanitize the filename and add hash to make it unique
    filename = sanitize_filename(f"{os.path.splitext(filename)[0]}_{url_hash}.pdf")
    file_path = os.path.join(save_path, filename)
    
    # If file already exists, return the path without downloading
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:  # Ensure it's not an empty file
        logger.info(f"PDF already exists: {file_path}")
        return file_path
    
    # Download with retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Use streaming to handle large files efficiently
            response = session.get(pdf_url, stream=True, timeout=30, 
                                  headers={
                                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                      "Accept": "application/pdf,*/*",
                                      "Connection": "keep-alive"
                                  })
            response.raise_for_status()
            
            # Check if content type indicates it's a PDF (if available)
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type and 'application/pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Content type not PDF: {content_type}. Checking content...")
                # Check first few bytes to see if it starts with %PDF
                first_chunk = next(response.iter_content(256), None)
                if not first_chunk or not first_chunk.startswith(b'%PDF-'):
                    raise ValueError(f"Content at {pdf_url} is not a PDF")
            
            # Stream content to file
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)
            
            # Verify the file is a valid PDF and has content
            if not os.path.exists(file_path) or os.path.getsize(file_path) < 1000:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise ValueError("Downloaded file is not a valid PDF (too small)")
                
            logger.info(f"PDF successfully downloaded to: {file_path}")
            return file_path
            
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                # Exponential backoff
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"Failed to download PDF after {max_retries} attempts: {e}")
                raise ValueError(f"Failed to download PDF from {pdf_url}: {e}")

def scrape_and_download_pdfs(url: str, output_folder: str = DEFAULT_OUTPUT_FOLDER) -> Dict[str, Any]:
    """
    Scrape a webpage for PDF links and download them.
    
    Args:
        url (str): URL of the webpage to scrape
        output_folder (str): Folder to save PDFs
        
    Returns:
        Dict[str, Any]: Results of the scraping and downloading
    """
    logger.info(f"Scraping for PDFs from: {url}")
    
    try:
        # Ensure output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Get PDF links from the page
        pdf_links = fetch_pdf_links(url)
        
        if not pdf_links:
            logger.info(f"No PDF links found on {url}")
            return {
                "status": "completed",
                "url": url,
                "message": "No PDF links found",
                "pdfs_found": 0,
                "pdfs_downloaded": 0
            }
        
        # Download each PDF
        downloaded_pdfs = []
        failed_pdfs = []
        
        for pdf_info in pdf_links:
            pdf_url = pdf_info["url"]
            try:
                # Download the PDF
                pdf_path = download_pdf(pdf_url, output_folder)
                
                # Process the PDF if download was successful
                if pdf_path and os.path.exists(pdf_path):
                    # Generate JSON output filename
                    pdf_filename = os.path.basename(pdf_path)
                    json_filename = f"{os.path.splitext(pdf_filename)[0]}_processed.json"
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Process PDF to JSON if module is available
                    if structify_module:
                        try:
                            structify_module.process_all_files(
                                root_directory=output_folder,
                                output_file=json_path,
                                file_filter=lambda f: f == pdf_path
                            )
                            downloaded_pdfs.append({
                                "url": pdf_url,
                                "file_path": pdf_path,
                                "json_path": json_path,
                                "title": pdf_info.get("title", "")
                            })
                        except Exception as e:
                            logger.error(f"Error processing PDF to JSON: {e}")
                            downloaded_pdfs.append({
                                "url": pdf_url,
                                "file_path": pdf_path,
                                "title": pdf_info.get("title", "")
                            })
                    else:
                        downloaded_pdfs.append({
                            "url": pdf_url,
                            "file_path": pdf_path,
                            "title": pdf_info.get("title", "")
                        })
            except Exception as e:
                logger.error(f"Error downloading PDF from {pdf_url}: {e}")
                failed_pdfs.append({
                    "url": pdf_url,
                    "error": str(e),
                    "title": pdf_info.get("title", "")
                })
        
        return {
            "status": "completed",
            "url": url,
            "pdfs_found": len(pdf_links),
            "pdfs_downloaded": len(downloaded_pdfs),
            "pdfs_failed": len(failed_pdfs),
            "downloaded_pdfs": downloaded_pdfs,
            "failed_pdfs": failed_pdfs,
            "output_folder": output_folder
        }
    
    except Exception as e:
        logger.error(f"Error scraping PDFs from {url}: {e}")
        return {
            "status": "error",
            "url": url,
            "error": str(e)
        }
# Add this function before process_url_with_settings
def process_url(url: str, setting: str, keyword: str = "", output_folder: str = DEFAULT_OUTPUT_FOLDER) -> Dict[str, Any]:
    """
    Process a URL based on the specified setting.
    
    Args:
        url (str): The URL to process
        setting (str): One of 'full', 'metadata', 'title', 'keyword'
        keyword (str): Optional keyword for keyword search mode
        output_folder (str): Directory where outputs should be saved
        
    Returns:
        Dict[str, Any]: Results of the processing
    """
    # Ensure output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    try:
        # Import the function from web_scraper module
        return web_scraper.process_url(url, setting, keyword, output_folder)
    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}")
        return {"error": str(e), "url": url}        
def process_url_with_settings(url, setting, keyword, output_folder):
    """
    Process a URL based on the specified setting, using the imported web_scraper functions.
    
    Args:
        url: URL to process
        setting: Processing setting ('full', 'metadata', 'title', 'keyword', 'pdf')
        keyword: Optional keyword for keyword search
        output_folder: Output directory for results
        
    Returns:
        Processing result dictionary
    """
    # Ensure output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    if web_scraper_available:
        # If web_scraper is available, use its process_url function
        return web_scraper.process_url(url, setting, keyword, output_folder)
    else:
        # Fallback implementation if web_scraper is not available
        if setting.lower() == "pdf":
            try:
                # Download the PDF file
                pdf_file = download_pdf(url, save_path=output_folder)
                
                # Get just the filename without the path
                pdf_filename = os.path.basename(pdf_file)
                output_json_name = os.path.splitext(pdf_filename)[0] + "_processed"
                
                # Create a unique JSON output filename
                json_output = get_output_filepath(output_json_name, folder_override=output_folder)
                
                # Process the downloaded PDF using Structify (claude.py)
                if structify_module:
                    single_result = structify_module.process_all_files(
                        root_directory=os.path.dirname(pdf_file),
                        output_file=json_output,
                        file_filter=lambda f: f == pdf_file  # Only process our specific PDF file
                    )
                
                return {
                    "status": "PDF downloaded and processed",
                    "url": url,
                    "pdf_file": pdf_file,
                    "json_file": json_output,
                    "output_folder": output_folder
                }
            except Exception as e:
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e)
                }
        else:
            # For all other settings, use the process_url function (placeholder if web_scraper not available)
            return process_url(url, setting, keyword, output_folder)

def process_url_with_tracking(self, url, setting, keyword, output_folder):
    """Process a single URL with enhanced tracking and error recovery."""
    try:
        # Special handling for PDF setting
        if setting == "pdf":
            # Thread-safe update of PDF downloads list
            with self.lock:
                pdf_info = {
                    "url": url,
                    "status": "downloading",
                    "message": "Starting download...",
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                self.pdf_downloads.append(pdf_info)
                pdf_index = len(self.pdf_downloads) - 1
            
            # Emit progress update with PDF download info
            self.emit_progress(
                progress=self.progress,
                message=f"Downloading PDF from {url}",
                stats=self.stats,
                pdf_downloads=self.pdf_downloads
            )
            
            # Set up retry mechanism for PDF downloads
            max_retries = 2
            result = None
            
            for attempt in range(max_retries + 1):
                if self.is_cancelled:
                    return {"status": "cancelled", "url": url}
                    
                try:
                    # Use appropriate download function with timeout
                    if web_scraper_available:
                        pdf_file = web_scraper.download_pdf(url, save_path=output_folder)
                    else:
                        pdf_file = download_pdf(url, save_path=output_folder)
                        
                    if pdf_file and os.path.exists(pdf_file):
                        # Update status to "processing"
                        with self.lock:
                            if pdf_index < len(self.pdf_downloads):
                                self.pdf_downloads[pdf_index].update({
                                    "status": "processing",
                                    "message": "PDF downloaded, processing...",
                                    "filePath": pdf_file
                                })
                        
                        # Get filename and create JSON output path
                        pdf_filename = os.path.basename(pdf_file)
                        output_json_name = os.path.splitext(pdf_filename)[0] + "_processed"
                        json_output = get_output_filepath(output_json_name, folder_override=output_folder)
                        
                        # Check if task cancelled before processing
                        if self.is_cancelled:
                            return {"status": "cancelled", "url": url, "pdf_file": pdf_file}
                            
                        # First try using enhanced PDF processing if available
                        if hasattr(structify_module, 'process_pdf'):
                            try:
                                # Detect document type to determine if OCR is needed
                                doc_type = None
                                if hasattr(structify_module, 'detect_document_type'):
                                    try:
                                        doc_type = structify_module.detect_document_type(pdf_file)
                                        logger.info(f"Detected document type for {pdf_filename}: {doc_type}")
                                    except Exception as type_err:
                                        logger.warning(f"Error detecting document type: {type_err}")
                                
                                # Process PDF with enhanced capabilities
                                pdf_result = structify_module.process_pdf(
                                    pdf_path=pdf_file,
                                    output_path=json_output,
                                    max_chunk_size=4096,
                                    extract_tables=True,
                                    use_ocr=(doc_type == "scan"),  # Only use OCR for scanned documents
                                    return_data=True
                                )
                                
                                # Create successful result with enhanced metadata
                                tables_count = 0
                                references_count = 0
                                
                                if pdf_result:
                                    if "tables" in pdf_result:
                                        tables_count = len(pdf_result["tables"])
                                    if "references" in pdf_result:
                                        references_count = len(pdf_result["references"])
                                
                                result = {
                                    "status": "PDF downloaded and processed with enhanced features",
                                    "url": url,
                                    "pdf_file": pdf_file,
                                    "json_file": json_output,
                                    "output_folder": output_folder,
                                    "pdf_size": os.path.getsize(pdf_file) if os.path.exists(pdf_file) else 0,
                                    "document_type": doc_type,
                                    "tables_extracted": tables_count,
                                    "references_extracted": references_count
                                }
                                
                                logger.info(f"PDF processed with enhanced features. JSON at: {json_output}")
                                break  # Success, exit retry loop
                                
                            except Exception as direct_err:
                                logger.warning(f"Enhanced PDF processing failed, falling back: {direct_err}")
                        
                        # Fallback to standard processing using process_all_files
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_output,
                            max_chunk_size=4096,
                            executor_type="thread",
                            max_workers=None,
                            stop_words=structify_module.DEFAULT_STOP_WORDS,
                            use_cache=False,
                            valid_extensions=[".pdf"],  # Only process PDFs
                            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                            stats_only=False,
                            include_binary_detection=False,  # PDFs should not be detected as binary
                            file_filter=lambda f: f == pdf_file  # Only process our specific PDF file
                        )
                        
                        # Create standard result if we don't have an enhanced one yet
                        if not result:
                            result = {
                                "status": "PDF downloaded and processed",
                                "url": url,
                                "pdf_file": pdf_file,
                                "json_file": json_output,
                                "output_folder": output_folder,
                                "pdf_size": os.path.getsize(pdf_file) if os.path.exists(pdf_file) else 0
                            }
                        
                        logger.info(f"PDF processing complete. JSON output at: {json_output}")
                        break  # Success, exit retry loop
                        
                    else:
                        # PDF download failed
                        if attempt < max_retries:
                            logger.warning(f"PDF download attempt {attempt+1} failed for {url}, retrying...")
                            time.sleep(2)  # Small delay between retries
                        else:
                            result = {
                                "status": "error",
                                "url": url,
                                "error": "Failed to download PDF after multiple attempts"
                            }
                            
                except Exception as pdf_err:
                    # Handle errors with retry logic
                    if attempt < max_retries:
                        logger.warning(f"PDF processing attempt {attempt+1} failed for {url}: {pdf_err}, retrying...")
                        time.sleep(2)  # Small delay between retries
                    else:
                        logger.error(f"Error processing PDF from {url}: {pdf_err}")
                        result = {
                            "status": "error",
                            "url": url,
                            "error": str(pdf_err)
                        }
            
            # If we still don't have a result after all retries
            if result is None:
                result = {
                    "status": "error",
                    "url": url,
                    "error": "Failed to download or process PDF"
                }
            
            # Thread-safe update of PDF status
            with self.lock:
                if pdf_index < len(self.pdf_downloads):
                    if "error" in result:
                        self.pdf_downloads[pdf_index].update({
                            "status": "error",
                            "message": result["error"],
                            "error": result["error"],
                            "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                        })
                    else:
                        self.pdf_downloads[pdf_index].update({
                            "status": "success",
                            "message": "Download and processing complete",
                            "filePath": result.get("pdf_file", ""),
                            "jsonFile": result.get("json_file", ""),
                            "fileSize": result.get("pdf_size", 0),
                            "documentType": result.get("document_type", ""),
                            "tablesExtracted": result.get("tables_extracted", 0),
                            "referencesExtracted": result.get("references_extracted", 0),
                            "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                        })
            
            # Emit progress update with updated PDF download info
            self.emit_progress(
                progress=self.progress,
                message=f"Processed {url}",
                stats=self.stats,
                pdf_downloads=self.pdf_downloads
            )
            
            return result
                
        else:
            # For non-PDF settings with improved error handling
            max_retries = 1
            for attempt in range(max_retries + 1):
                if self.is_cancelled:
                    return {"status": "cancelled", "url": url}
                    
                try:
                    # Use appropriate processing function
                    if web_scraper_available:
                        result = web_scraper.process_url(url, setting, keyword, output_folder)
                    else:
                        result = process_url(url, setting, keyword, output_folder)
                    
                    return result
                except Exception as e:
                    if attempt < max_retries:
                        logger.warning(f"URL processing attempt {attempt+1} failed: {e}, retrying...")
                        time.sleep(1)
                    else:
                        logger.error(f"Error processing URL {url} (setting: {setting}): {e}")
                        return {"error": str(e), "url": url, "setting": setting}
            
            # Should never reach here, but just in case
            return {"error": "Processing failed after retries", "url": url}
            
    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}")
        
        # Thread-safe update of PDF status if this was a PDF
        if setting == "pdf":
            with self.lock:
                pdf_index = next((i for i, pdf in enumerate(self.pdf_downloads) if pdf["url"] == url), None)
                if pdf_index is not None:
                    self.pdf_downloads[pdf_index].update({
                        "status": "error",
                        "message": str(e),
                        "error": str(e),
                        "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                    })
            
            # Emit progress update with updated PDF download info
            self.emit_progress(
                progress=self.progress,
                message=f"Error processing {url}",
                stats=self.stats,
                pdf_downloads=self.pdf_downloads
            )
        
        return {"error": str(e), "url": url}

# Add to app.py - Enhanced error handling for PDF processing
def handle_pdf_processing_error(pdf_file, error, output_folder=None):
    """
    Handle PDF processing errors with recovery options
    
    Args:
        pdf_file: Path to the problematic PDF
        error: The exception or error message
        output_folder: Optional output folder to save error report
        
    Returns:
        Dict with error information and recovery status
    """
    error_type = type(error).__name__
    error_msg = str(error)
    
    logger.error(f"PDF processing error ({error_type}): {error_msg}")
    
    # Attempt to classify the error
    if "memory" in error_msg.lower() or "allocation" in error_msg.lower():
        error_category = "memory"
    elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
        error_category = "timeout" 
    elif "permission" in error_msg.lower() or "access" in error_msg.lower():
        error_category = "permissions"
    elif "corrupt" in error_msg.lower() or "invalid" in error_msg.lower():
        error_category = "corrupt_file"
    else:
        error_category = "general"
    
    # Try recovery based on error type
    recovery_successful = False
    recovery_method = None
    
    try:
        if error_category == "memory":
            # Try processing with reduced memory usage
            logger.info("Attempting memory-optimized processing...")
            recovery_successful = process_pdf_with_reduced_memory(pdf_file, output_folder)
            recovery_method = "reduced_memory"
            
        elif error_category == "corrupt_file":
            # Try PDF repair methods
            logger.info("Attempting PDF repair...")
            recovery_successful = attempt_pdf_repair(pdf_file, output_folder)
            recovery_method = "file_repair"
            
        elif error_category == "timeout":
            # Try processing with extended timeout
            logger.info("Attempting processing with extended timeout...")
            recovery_successful = process_pdf_with_extended_timeout(pdf_file, output_folder)
            recovery_method = "extended_timeout"
    except Exception as recovery_error:
        logger.error(f"Recovery attempt failed: {recovery_error}")
    
    # Create error report
    result = {
        "status": "error",
        "error_type": error_type,
        "error_message": error_msg,
        "error_category": error_category,
        "recovery_attempted": True,
        "recovery_successful": recovery_successful,
        "recovery_method": recovery_method
    }
    
    # Save error report if output folder provided
    if output_folder:
        try:
            report_path = os.path.join(
                output_folder,
                f"error_report_{os.path.basename(pdf_file)}.json"
            )
            
            with open(report_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
                
            result["error_report"] = report_path
        except Exception as e:
            logger.warning(f"Failed to save error report: {e}")
    
    return result

def process_pdf_with_reduced_memory(pdf_file, output_folder):
    """Process PDF with reduced memory usage"""
    try:
        # Generate output path
        file_name = os.path.basename(pdf_file)
        json_filename = os.path.splitext(file_name)[0] + "_processed.json"
        json_path = os.path.join(output_folder, json_filename)
        
        # Process in chunks to reduce memory usage
        if hasattr(structify_module, 'process_pdf'):
            structify_module.process_pdf(
                pdf_path=pdf_file,
                output_path=json_path,
                max_chunk_size=2048,  # Smaller chunks
                extract_tables=False,  # Skip tables to save memory
                use_ocr=False,  # Skip OCR to save memory
                return_data=False  # Don't keep data in memory
            )
            return True
        return False
    except Exception as e:
        logger.error(f"Reduced memory processing failed: {e}")
        return False

def attempt_pdf_repair(pdf_file, output_folder):
    """Attempt to repair corrupted PDF file"""
    if not pikepdf_available:
        logger.warning("pikepdf not available for PDF repair")
        return False
        
    try:
        # Now use pikepdf knowing it's available
        import pikepdf
        # Rest of your function...
    except Exception as e:
        logger.error(f"PDF repair failed: {e}")
        return False

def validate_pdf(pdf_path):
    """
    Validate a PDF file and detect its features.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        dict: Validation results and detected features
    """
    if not os.path.exists(pdf_path):
        return {"valid": False, "error": "File not found"}
        
    if not pdf_path.lower().endswith('.pdf'):
        return {"valid": False, "error": "Not a PDF file"}
    
    # Check if file is readable
    try:
        with open(pdf_path, 'rb') as f:
            header = f.read(5)
            if header != b'%PDF-':
                return {"valid": False, "error": "Invalid PDF format"}
    except Exception as e:
        return {"valid": False, "error": f"Error reading file: {str(e)}"}
    
    # Try to extract basic features
    features = {"valid": True, "encrypted": False, "page_count": 0, "scanned": False}
    
    try:
        if pdf_extractor_available:
            # Use pdf_extractor for feature detection
            doc_type = pdf_extractor.detect_document_type(pdf_path)
            features["document_type"] = doc_type
            features["scanned"] = doc_type == "scan"
            
            # Get more metadata
            metadata = pdf_extractor.extract_text_from_pdf(pdf_path)
            if metadata:
                features["page_count"] = metadata.get("page_count", 0)
                features["has_text"] = bool(metadata.get("full_text"))
                features["metadata"] = metadata.get("metadata", {})
        elif pikepdf_available:
            # Use pikepdf as fallback
            with pikepdf.Pdf.open(pdf_path) as pdf:
                features["page_count"] = len(pdf.pages)
                features["encrypted"] = pdf.is_encrypted
                features["version"] = f"{pdf.pdf_version.major}.{pdf.pdf_version.minor}"
    except Exception as e:
        # Don't fail validation if feature detection fails
        features["feature_error"] = str(e)
    
    return features
    
# ----------------------------------------------------------------------------
# API Key Management 
# ----------------------------------------------------------------------------

# Define a simple rate limiter class if it's missing
class Limiter:
    def __init__(self, key_func, app=None, default_limits=None, storage_uri=None):
        self.key_func = key_func
        self.app = app
        self.default_limits = default_limits
        self.storage_uri = storage_uri
    
    def limit(self, limits):
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # For personal use, we'll skip actual rate limiting
                return f(*args, **kwargs)
            return decorated_function
        return decorator

# If limiter is not defined, create a simple instance
if 'limiter' not in locals() and 'limiter' not in globals():
    limiter = Limiter(
        lambda: request.remote_addr,  # Simple key function using IP
        app=app,
        default_limits=["100 per day", "10 per minute"],
        storage_uri="memory://"
    )

# ----------------------------------------------------------------------------
# Background Task Classes & Active Task Management
# ----------------------------------------------------------------------------
class ApiKeyManager:
    """Simple API key manager for personal use"""
    
    def __init__(self, keys_file="api_keys.json"):
        self.keys_file = keys_file
        self.keys = {}
        self.load_keys()
        
        # Create a default key if no keys exist
        if not self.keys:
            self.create_key("default", "Default personal key")
    
    def load_keys(self):
        """Load API keys from file"""
        try:
            if os.path.exists(self.keys_file):
                with open(self.keys_file, 'r') as f:
                    self.keys = json.load(f)
                logger.info(f"Loaded {len(self.keys)} API keys")
            else:
                logger.info(f"No API keys file found at {self.keys_file}, will create new")
                self.keys = {}
        except Exception as e:
            logger.error(f"Error loading API keys: {e}")
            self.keys = {}
    
    def save_keys(self):
        """Save API keys to file"""
        try:
            with open(self.keys_file, 'w') as f:
                json.dump(self.keys, f, indent=2)
            logger.info(f"Saved {len(self.keys)} API keys")
            return True
        except Exception as e:
            logger.error(f"Error saving API keys: {e}")
            return False
    
    def create_key(self, name, description=""):
        """Create a new API key"""
        key = str(uuid.uuid4())
        self.keys[key] = {
            "name": name,
            "description": description,
            "created": datetime.now().isoformat(),
            "last_used": None,
            "active": True
        }
        self.save_keys()
        return key
    
    def revoke_key(self, key):
        """Revoke an API key"""
        if key in self.keys:
            self.keys[key]["active"] = False
            self.save_keys()
            return True
        return False
    
    def validate_key(self, key):
        """Check if a key is valid"""
        if key in self.keys and self.keys[key]["active"]:
            # Update last used timestamp
            self.keys[key]["last_used"] = datetime.now().isoformat()
            self.save_keys()
            return True
        return False
    
    def get_all_keys(self):
        """Get all keys with their information"""
        return self.keys
    
    def get_active_keys(self):
        """Get only active keys"""
        return {k: v for k, v in self.keys.items() if v.get("active", False)}


# Initialize the key manager
key_manager = ApiKeyManager()

# Update the require_api_key decorator to use the key manager
def require_api_key(f):
    """Decorator to require API key for a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        # Check if API key is provided
        if not api_key:
            return jsonify({"error": {"code": "MISSING_API_KEY", "message": "API key is required"}}), 401
        
        # Validate using key manager
        if not key_manager.validate_key(api_key):
            return jsonify({"error": {"code": "INVALID_API_KEY", "message": "Invalid API key"}}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function
  
def analyze_pdf_structure(pdf_file: str) -> Dict[str, Any]:
    """
    Analyze a PDF file's structure and return a summary of its content.
    
    Args:
        pdf_file: Path to the PDF file
        
    Returns:
        Dict with PDF structure information
    """
    if not structify_module:
        return {"error": "Claude module not available for PDF analysis"}
    
    try:
        summary = {}
        
        # Detect document type
        if hasattr(structify_module, 'detect_document_type'):
            try:
                summary["document_type"] = structify_module.detect_document_type(pdf_file)
            except Exception as e:
                logger.warning(f"Error detecting document type: {e}")
                summary["document_type"] = "unknown"
        
        # Extract metadata using PyMuPDF if available
        if hasattr(structify_module, 'extract_text_from_pdf'):
            try:
                pdf_data = structify_module.extract_text_from_pdf(pdf_file)
                if pdf_data:
                    summary["metadata"] = pdf_data.get("metadata", {})
                    summary["page_count"] = pdf_data.get("page_count", 0)
                    summary["has_scanned_content"] = pdf_data.get("has_scanned_content", False)
            except Exception as e:
                logger.warning(f"Error extracting PDF metadata: {e}")
        
        # Extract tables if document type suggests it might have tables
        tables = []
        if hasattr(structify_module, 'extract_tables_from_pdf') and summary.get("document_type") in ["academic_paper", "report", "book"]:
            try:
                tables = structify_module.extract_tables_from_pdf(pdf_file)
                summary["tables_count"] = len(tables)
                if tables:
                    # Just include count and page location of tables, not full content
                    summary["tables_info"] = [
                        {"table_id": t.get("table_id"), "page": t.get("page"), "rows": t.get("rows"), "columns": len(t.get("columns", []))}
                        for t in tables[:10]  # Limit to first 10 tables
                    ]
            except Exception as e:
                logger.warning(f"Error extracting tables: {e}")
                summary["tables_count"] = 0
        
        # Extract structure if available
        if hasattr(structify_module, 'identify_document_structure') and pdf_data.get("full_text"):
            try:
                structure = structify_module.identify_document_structure(
                    pdf_data["full_text"],
                    pdf_data.get("structure", {}).get("headings", [])
                )
                if structure:
                    summary["sections_count"] = len(structure.get("sections", []))
                    # Include section titles for the first few sections
                    summary["section_titles"] = [
                        s.get("clean_title", s.get("title", "Untitled Section"))
                        for s in structure.get("sections", [])[:5]  # Limit to first 5 sections
                    ]
            except Exception as e:
                logger.warning(f"Error identifying document structure: {e}")
        
        # File stats
        try:
            file_size = os.path.getsize(pdf_file)
            summary["file_size_bytes"] = file_size
            summary["file_size_mb"] = round(file_size / (1024 * 1024), 2)
        except Exception as e:
            logger.warning(f"Error getting file stats: {e}")
        
        return summary
        
    except Exception as e:
        logger.error(f"Error analyzing PDF structure: {e}")
        return {"error": str(e)}

def extract_pdf_preview(pdf_file: str, max_preview_length: int = 2000) -> Dict[str, Any]:
    """
    Extract a preview of PDF content for display in the UI.
    
    Args:
        pdf_file: Path to the PDF file
        max_preview_length: Maximum length of text preview
        
    Returns:
        Dict with PDF preview information
    """
    if not structify_module:
        return {"error": "Claude module not available for PDF preview"}
    
    try:
        preview = {}
        
        # Extract basic text using PyMuPDF if available
        if hasattr(structify_module, 'extract_text_from_pdf'):
            pdf_data = structify_module.extract_text_from_pdf(pdf_file)
            if pdf_data and pdf_data.get("full_text"):
                text = pdf_data["full_text"]
                preview["title"] = pdf_data.get("metadata", {}).get("title", os.path.basename(pdf_file))
                preview["author"] = pdf_data.get("metadata", {}).get("author", "Unknown")
                preview["page_count"] = pdf_data.get("page_count", 0)
                
                # Create a short text preview
                if len(text) > max_preview_length:
                    preview["text_preview"] = text[:max_preview_length] + "..."
                else:
                    preview["text_preview"] = text
                
                # Extract first few headings if available
                if "structure" in pdf_data and "headings" in pdf_data["structure"]:
                    preview["headings"] = pdf_data["structure"]["headings"][:10]  # First 10 headings
                
                return preview
        
        # Fallback to simple metadata only if text extraction failed
        preview["title"] = os.path.basename(pdf_file)
        preview["text_preview"] = "PDF preview not available"
        
        return preview
        
    except Exception as e:
        logger.error(f"Error extracting PDF preview: {e}")
        return {"error": str(e), "text_preview": "Error generating preview"}


def process_all_files(
    root_directory: str,
    output_file: str,
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    executor_type: str = "thread",
    max_workers: Optional[int] = None,
    stop_words: Set[str] = DEFAULT_STOP_WORDS,
    use_cache: bool = False,
    valid_extensions: List[str] = DEFAULT_VALID_EXTENSIONS,
    ignore_dirs: str = "venv,node_modules,.git,__pycache__,dist,build",
    stats_only: bool = False,
    include_binary_detection: bool = True,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
    max_file_size: int = MAX_FILE_SIZE,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    memory_limit: int = DEFAULT_MEMORY_LIMIT,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    stats_obj: Optional[FileStats] = None,
    file_filter: Optional[Callable[[str], bool]] = None,
    log_level: int = logging.INFO,
    log_file: Optional[str] = None,
    error_on_empty: bool = False,
    include_failed_files: bool = False
) -> Dict[str, Any]:
    """
    Process all files in the root_directory with enhanced PDF handling and error recovery.
    
    Args:
        root_directory: Base directory to process
        output_file: Path to output JSON file
        max_chunk_size: Maximum size of text chunks
        executor_type: Type of executor ("thread", "process", or "none")
        max_workers: Maximum number of worker threads/processes
        stop_words: Set of words to ignore in tag generation
        use_cache: Whether to use file caching
        valid_extensions: List of file extensions to process
        ignore_dirs: Comma-separated list of directories to ignore
        stats_only: Whether to only generate statistics
        include_binary_detection: Whether to detect and skip binary files
        overlap: Number of characters to overlap between chunks
        max_file_size: Maximum file size to process
        timeout: Maximum processing time per file in seconds
        memory_limit: Maximum memory usage before forcing garbage collection
        progress_callback: Optional callback for progress reporting
        stats_obj: Optional statistics object to use
        file_filter: Optional function to filter files
        log_level: Logging level
        log_file: Optional log file path
        error_on_empty: Whether to error if no files are found
        include_failed_files: Whether to include details of failed files in output
        
    Returns:
        Dictionary with statistics and processed data
    """
    # Setup logging with specified options
    global logger
    logger = setup_logging(log_level, log_file)
    
    start_time = time.time()
    stats = stats_obj if stats_obj else FileStats()
    
    # Create list of directories to ignore
    ig_list = [d.strip() for d in ignore_dirs.split(",") if d.strip()]
    rroot = Path(root_directory)
    
    # Track performance metrics
    discovery_start = time.time()
    
    # Find all files matching extensions
    all_files = []
    skipped_during_discovery = []
    try:
        for p in rroot.rglob("*"):
            # Skip ignored directories
            if any(ig in p.parts for ig in ig_list):
                continue
                
            # Only process files that match extensions
            if p.is_file() and any(p.suffix.lower() == ext.lower() for ext in valid_extensions):
                # Apply custom filter if provided
                if file_filter and not file_filter(str(p)):
                    continue
                
                # Skip files that are too large (except PDFs)
                try:
                    size = p.stat().st_size
                    if size > max_file_size and not p.suffix.lower() == '.pdf':
                        logger.info(f"Skipping large file during discovery: {p} ({size} bytes)")
                        skipped_during_discovery.append({
                            "file_path": str(p),
                            "size": size,
                            "reason": "file_too_large"
                        })
                        continue
                except OSError as e:
                    # Log error but continue processing other files
                    logger.warning(f"Error accessing file {p}: {e}")
                    skipped_during_discovery.append({
                        "file_path": str(p),
                        "reason": f"access_error: {str(e)}"
                    })
                    continue
                
                all_files.append(p)
    except Exception as e:
        logger.error(f"Error during file discovery: {e}", exc_info=True)
        return {
            "stats": stats.to_dict(),
            "data": {},
            "error": str(e),
            "skipped_files": skipped_during_discovery,
            "status": "failed"
        }

    discovery_time = time.time() - discovery_start
    logger.info(f"Found {len(all_files)} valid files in {root_directory} ({discovery_time:.2f}s)")
    
    # Check if any files were found
    if not all_files:
        message = f"No files found in {root_directory} matching the provided criteria"
        if error_on_empty:
            logger.error(message)
            return {
                "stats": stats.to_dict(),
                "data": {},
                "error": message,
                "skipped_files": skipped_during_discovery,
                "status": "failed"
            }
        else:
            logger.warning(message)
            return {
                "stats": stats.to_dict(),
                "data": {},
                "message": message,
                "skipped_files": skipped_during_discovery,
                "status": "completed"
            }
    
    if progress_callback:
        progress_callback(0, len(all_files), "discovery")

    # Load cache if enabled
    processed_cache = {}
    
    # FIX: Properly extract the directory part of the output_file
    # Use os.path.dirname to get just the directory part without any file components
    output_dir = os.path.dirname(output_file)
    # If output_dir is empty (meaning output_file is just a filename with no directory part),
    # use the current directory
    if not output_dir:
        output_dir = "."
    
    cache_path = os.path.join(output_dir, CACHE_FILE)
    
    if use_cache:
        if os.path.isfile(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as c:
                    processed_cache = json.load(c)
                logger.info(f"Loaded cache with {len(processed_cache)} entries")
            except Exception as e:
                logger.warning(f"Cache load error: {e}")

    # Filter files that need processing
    to_process = []
    for fpath in all_files:
        sp = str(fpath)
        
        # Skip unchanged files if they're in cache
        if use_cache and sp in processed_cache:
            try:
                mtime = fpath.stat().st_mtime
                old = processed_cache[sp].get("mod_time", 0)
                if old >= mtime:
                    stats.skipped_files += 1
                    logger.debug(f"Skipping unchanged file: {sp}")
                    continue
            except OSError:
                # If stat fails, process the file anyway
                pass
                
        to_process.append(fpath)

    if not to_process:
        logger.info("No new or modified files to process.")
        return {
            "stats": stats.to_dict(),
            "data": {},
            "message": "No new or modified files to process",
            "skipped_files": skipped_during_discovery,
            "status": "completed"
        }

    # Determine optimal number of workers
    if max_workers is None:
        import multiprocessing
        cpunum = multiprocessing.cpu_count()
        if executor_type == "process":
            max_workers = max(1, cpunum - 1)
        else:
            max_workers = min(32, cpunum * 2)

    logger.info(f"Using {executor_type} executor with max_workers={max_workers}")

    # Track errors and processing failures
    processing_failures = []

    # Process files in batches
    processing_start = time.time()
    
    # Determine batch size based on file count
    batch_size = 100
    if len(to_process) <= 100:
        batch_size = 20
    elif len(to_process) <= 500:
        batch_size = 50
    elif len(to_process) <= 2000:
        batch_size = 100
    else:
        batch_size = 200
    
    # Enhanced data structure with additional metadata
    all_data = {}
    
    # Process in batches to manage memory usage
    for i in range(0, len(to_process), batch_size):
        batch = to_process[i:i+batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(to_process) + batch_size - 1) // batch_size
        logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} files)")
        
        results = []
        
        # Different processing strategies based on executor type
        if executor_type == "none":
            # Sequential processing
            for p in batch:
                # Special handling for PDFs
                if str(p).lower().endswith('.pdf'):
                    result = process_pdf_safely(str(p), root_directory, stats, max_chunk_size)
                    if result:
                        results.append((p, result))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(p),
                            "reason": "pdf_processing_failed"
                        })
                else:
                    # Standard processing for non-PDF files
                    r = safe_process(
                        p, root_directory, max_chunk_size, stop_words, 
                        include_binary_detection, stats, overlap, max_file_size, 
                        timeout, progress_callback
                    )
                    if r:
                        results.append((p, r))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(p),
                            "reason": "processing_failed"
                        })
                
                # Check memory usage and trigger garbage collection if needed
                try:
                    import psutil
                    process = psutil.Process()
                    memory_info = process.memory_info()
                    if memory_info.rss > memory_limit:
                        logger.warning(f"Memory usage ({memory_info.rss / 1024 / 1024:.1f} MB) exceeded limit. Triggering GC.")
                        import gc
                        gc.collect()
                except ImportError:
                    pass  # psutil not available
        else:
            # Parallel processing
            Exec = ThreadPoolExecutor if executor_type == "thread" else ProcessPoolExecutor
            with Exec(max_workers=max_workers) as ex:
                # Submit all tasks with special handling for PDFs
                fut_map = {}
                for p in batch:
                    if str(p).lower().endswith('.pdf'):
                        # Submit PDF processing task
                        fut = ex.submit(
                            process_pdf_safely,
                            str(p),
                            root_directory,
                            stats,
                            max_chunk_size
                        )
                    else:
                        # Submit standard file processing task
                        fut = ex.submit(
                            safe_process, 
                            p, 
                            root_directory, 
                            max_chunk_size, 
                            stop_words, 
                            include_binary_detection, 
                            stats,
                            overlap,
                            max_file_size,
                            timeout,
                            progress_callback
                        )
                    fut_map[fut] = p
                
                # Process results as they complete
                for fut in as_completed(fut_map):
                    pth = fut_map[fut]
                    out = fut.result()
                    if out:
                        results.append((pth, out))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(pth),
                            "reason": "processing_failed"
                        })

        # Aggregate results into the output data structure
        for pth, (lib, docs) in results:
            if lib not in all_data:
                all_data[lib] = {
                    "docs_data": [],
                    "metadata": {
                        "library_name": lib,
                        "processed_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "source": "Derived from file structure",
                        "processor_version": "claude.beta.py 3.0" 
                    }
                }
            
            # Add document data
            all_data[lib]["docs_data"].extend(d.to_dict() for d in docs)
            
            # Update cache if enabled
            if use_cache:
                try:
                    processed_cache[str(pth)] = {
                        "mod_time": pth.stat().st_mtime,
                        "size": pth.stat().st_size,
                        "chunks": len(docs),
                        "last_processed": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                except OSError:
                    # If stat fails, skip caching this file
                    pass

        # Periodically save cache for large batches
        if use_cache and (i + batch_size) % (batch_size * 5) == 0:
            try:
                with open(cache_path, "w", encoding="utf-8") as c:
                    json.dump(processed_cache, c, indent=2)
                logger.info(f"Saved cache after processing {i+batch_size} files.")
            except Exception as e:
                logger.warning(f"Cache save error: {e}")
                
        # Check memory usage and trigger garbage collection if needed
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            if memory_info.rss > memory_limit:
                logger.warning(f"Memory usage ({memory_info.rss / 1024 / 1024:.1f} MB) exceeded limit. Triggering GC.")
                import gc
                gc.collect()
        except ImportError:
            pass  # psutil not available

    # Add overall processing metadata
    processing_time = time.time() - processing_start
    total_time = time.time() - start_time
    
    # Add processing information to the output
    metakey = "metadata"
    for lib in all_data:
        if metakey in all_data[lib]:
            all_data[lib][metakey].update({
                "processing_timestamp": datetime.now().isoformat(),
                "processing_time_seconds": processing_time,
                "total_time_seconds": total_time,
                "discovery_time_seconds": discovery_time,
                "total_files_processed": stats.processed_files,
                "total_files_skipped": stats.skipped_files,
                "total_files_error": stats.error_files,
                "total_chunks": stats.total_chunks,
                "max_chunk_size": max_chunk_size,
                "chunk_overlap": overlap,
                "valid_extensions": valid_extensions,
                "binary_detection": include_binary_detection
            })
            
            # Add PDF-specific stats if available
            if stats.pdf_files > 0:
                all_data[lib][metakey].update({
                    "pdf_files_processed": stats.pdf_files,
                    "tables_extracted": stats.tables_extracted,
                    "references_extracted": stats.references_extracted,
                    "scanned_pages_processed": stats.scanned_pages_processed,
                    "ocr_processed_files": stats.ocr_processed_files
                })

    # Add processing failures if requested
    if include_failed_files and (processing_failures or skipped_during_discovery):
        for lib in all_data:
            if metakey in all_data[lib]:
                all_data[lib][metakey]["processing_failures"] = processing_failures
                all_data[lib][metakey]["skipped_during_discovery"] = skipped_during_discovery

    # Write output JSON unless stats_only mode
    if not stats_only:
        try:
            # FIX: Make sure output directory exists, but properly handle drive letters
            # Get just the directory part of the output_file path
            outdir = os.path.dirname(output_file)
            
            # Only create the directory if it's not an empty string
            if outdir:
                # Fix for handling paths with multiple drive letters (e.g., "C:\path\C:\file.json")
                # Check if outdir contains multiple drive letters
                drive_pattern = re.compile(r'([A-Za-z]:)')
                drive_matches = drive_pattern.findall(outdir)
                
                if len(drive_matches) > 1:
                    # Path contains multiple drive letters, use only the first one
                    logger.warning(f"Path contains multiple drive letters: {outdir}")
                    first_drive_end = outdir.find(drive_matches[0]) + len(drive_matches[0])
                    second_drive_start = outdir.find(drive_matches[1])
                    
                    # Use just the first drive and its path
                    clean_outdir = outdir[:second_drive_start]
                    logger.info(f"Using cleaned directory path: {clean_outdir}")
                    
                    # Update the output_file path to use the correct directory
                    output_filename = os.path.basename(output_file)
                    output_file = os.path.join(clean_outdir, output_filename)
                    logger.info(f"Updated output file path: {output_file}")
                    
                    outdir = clean_outdir
                
                # Create the directory
                try:
                    os.makedirs(outdir, exist_ok=True)
                    logger.info(f"Ensured output directory exists: {outdir}")
                except Exception as dir_err:
                    logger.error(f"Error creating output directory: {dir_err}")
                    
                    # Fallback: Try to use the user's Documents folder
                    try:
                        import pathlib
                        docs_dir = os.path.join(str(pathlib.Path.home()), "Documents")
                        os.makedirs(docs_dir, exist_ok=True)
                        
                        # Update output file path to use Documents folder
                        output_filename = os.path.basename(output_file)
                        output_file = os.path.join(docs_dir, output_filename)
                        logger.warning(f"Using fallback output location: {output_file}")
                    except Exception as fallback_err:
                        logger.error(f"Error creating fallback output directory: {fallback_err}")
                        # Last resort: Try to use current directory
                        output_filename = os.path.basename(output_file)
                        output_file = output_filename
                        logger.warning(f"Using current directory for output: {output_file}")
                
            # Use the enhanced safe JSON writer instead of direct write
            success = write_json_safely(all_data, output_file)
            
            if success:
                logger.info(f"Created JSON output at {output_file}")
            else:
                logger.error(f"Failed to write JSON output to {output_file}")
                # Try alternative approach with simpler JSON structure
                try:
                    logger.info("Attempting alternative JSON writing approach...")
                    # Create a simplified version of the data with just the essential information
                    simplified_data = {}
                    for lib in all_data:
                        simplified_data[lib] = {
                            "metadata": all_data[lib]["metadata"],
                            "doc_count": len(all_data[lib].get("docs_data", [])),
                            "summary": f"Processed {len(all_data[lib].get('docs_data', []))} documents"
                        }
                    
                    temp_output = f"{output_file}.simple.json"
                    with open(temp_output, "w", encoding="utf-8") as f:
                        json.dump(simplified_data, f, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Created simplified JSON output at {temp_output}")
                except Exception as alt_err:
                    logger.error(f"Alternative JSON writing also failed: {alt_err}")
            
            if progress_callback:
                progress_callback(100, 100, "completed")
        except Exception as e:
            logger.error(f"Error writing final output: {e}", exc_info=True)
            if progress_callback:
                progress_callback(0, 0, "error")

    # Save final cache state
    if use_cache:
        try:
            with open(cache_path, "w", encoding="utf-8") as c:
                json.dump(processed_cache, c, indent=2)
            logger.info(f"Saved final cache to {cache_path}")
        except Exception as e:
            logger.warning(f"Final cache save error: {e}")

    # Log final statistics and return results
    final_stats = stats.to_dict()
    final_stats["total_duration_seconds"] = total_time
    final_stats["processing_duration_seconds"] = processing_time
    final_stats["discovery_duration_seconds"] = discovery_time
    
    if stats.processed_files > 0:
        final_stats["seconds_per_file"] = processing_time / stats.processed_files
        
    if stats.total_files > 0:
        final_stats["success_rate"] = stats.processed_files / stats.total_files * 100
    
    logger.info(f"Processing complete in {total_time:.2f}s")
    logger.info(f"Stats: {len(all_files)} files found, {stats.processed_files} processed, " +
                f"{stats.skipped_files} skipped, {stats.error_files} errors, " +
                f"{stats.total_chunks} chunks created")
    
    # PDF-specific statistics
    if stats.pdf_files > 0:
        logger.info(f"PDF Stats: {stats.pdf_files} PDFs processed, {stats.tables_extracted} tables extracted, " +
                    f"{stats.references_extracted} references extracted, {stats.ocr_processed_files} OCR processed")
    
    result = {
        "stats": final_stats,
        "data": all_data,
        "status": "completed",
        "message": f"Successfully processed {stats.processed_files} files",
        "output_file": output_file  # Return the potentially updated output file path
    }
    
    # Include failure information if requested
    if include_failed_files:
        result["processing_failures"] = processing_failures
        result["skipped_during_discovery"] = skipped_during_discovery
        
    return result    



# ----------------------------------------------------------------------------
# Flask Endpoints
# ----------------------------------------------------------------------------
@app.route("/")


@app.route("/test-modules")


@app.route("/diagnostics")

@app.route("/module-diagnostics-complete")


@app.route("/endpoint-dashboard")


@app.route("/api/upload-for-path-detection", methods=["POST"])
def upload_for_path_detection():
    if "files" not in request.files:
        return structured_error_response("NO_FILES_IN_REQUEST", "No files part in request.", 400)
    folder_name = request.form.get("folderName")
    if not folder_name:
        return structured_error_response("FOLDER_NAME_REQUIRED", "Folder name is required.", 400)
    logger.info(f"Processing uploads for folder: {folder_name}")
    safe_folder = secure_filename(folder_name)
    upload_dir = os.path.join(app.config["UPLOAD_FOLDER"], safe_folder)
    os.makedirs(upload_dir, exist_ok=True)
    files = request.files.getlist("files")
    for f in files:
        if f.filename:
            if not is_extension_allowed(f.filename):
                return structured_error_response("UNSUPPORTED_EXTENSION", f"File extension not allowed: {f.filename}", 400)
            if not is_mime_allowed(f):
                return structured_error_response("UNSUPPORTED_MIME_TYPE", f"Detected MIME not allowed for: {f.filename}", 400)
            filename = secure_filename(f.filename)
            file_path = os.path.join(upload_dir, filename)
            f.save(file_path)
            logger.debug(f"Saved uploaded file to {file_path}")
    return jsonify({
        "success": True,
        "message": "Files uploaded successfully",
        "fullPath": safe_folder
    })

@app.route("/api/detect-path", methods=["POST"])

# ============================================================================
# ENHANCED TASK COMPLETION STATS SHOWCASE SYSTEM
# ============================================================================
# Integration with existing main.py functions and CustomFileStats

# ----------------------------------------------------------------------------
# Enhanced Task Completion with Rich Stats
# ----------------------------------------------------------------------------

def emit_enhanced_task_completion(task_id, task_type="generic", output_file=None, 
                                stats=None, details=None, performance_metrics=None):
    """
    Enhanced task completion emission with comprehensive stats showcase.
    Integrates with existing emit_task_completion while adding rich analytics.
    
    Args:
        task_id: Unique identifier for the task
        task_type: Type of task 
        output_file: Optional path to the output file
        stats: CustomFileStats object or dict with statistics
        details: Optional additional details
        performance_metrics: Optional performance analytics
    """
    try:
        # Start with existing payload structure
        payload = {
            'task_id': task_id,
            'task_type': task_type,
            'status': 'completed',
            'progress': 100,
            'message': f"{task_type.replace('_', ' ').title()} completed successfully",
            'timestamp': time.time()
        }
        
        # Include output file if provided
        if output_file:
            payload['output_file'] = output_file
            
        # Enhanced stats processing with CustomFileStats integration
        if stats:
            processed_stats = process_completion_stats(stats, task_type)
            payload['stats'] = processed_stats
            payload['summary'] = generate_stats_summary(processed_stats, task_type)
            
        # Include additional details
        if details:
            payload['details'] = details
            
        # Add performance metrics if available
        if performance_metrics:
            payload['performance'] = performance_metrics
            
        # Generate insights and recommendations
        payload['insights'] = generate_task_insights(payload)
        
        # Emit the enhanced completion event
        socketio.emit('task_completed', payload)
        
        # Also emit a specialized stats showcase event
        socketio.emit('task_stats_showcase', {
            'task_id': task_id,
            'task_type': task_type,
            'stats': payload.get('stats', {}),
            'summary': payload.get('summary', {}),
            'insights': payload.get('insights', {}),
            'timestamp': time.time()
        })
        
        logger.info(f"Emitted enhanced task completion for {task_id} with full stats")
        
    except Exception as e:
        logger.error(f"Error emitting enhanced task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(task_id, task_type, output_file, stats, details)


def process_completion_stats(stats, task_type):
    """
    Process CustomFileStats or dict stats into a comprehensive format.
    
    Args:
        stats: CustomFileStats object or dictionary
        task_type: Type of task for context
        
    Returns:
        Comprehensive stats dictionary
    """
    try:
        # Handle CustomFileStats objects
        if hasattr(stats, 'to_dict') and callable(stats.to_dict):
            base_stats = stats.to_dict()
        elif isinstance(stats, dict):
            base_stats = stats
        else:
            # Try to convert object to dict
            try:
                base_stats = stats.__dict__ if hasattr(stats, '__dict__') else {'raw_stats': str(stats)}
            except (AttributeError, TypeError):
                base_stats = {'raw_stats': str(stats)}
        
        # Enhance stats with calculated metrics
        enhanced_stats = {
            **base_stats,
            'completion_metrics': calculate_completion_metrics(base_stats),
            'performance_analysis': analyze_performance(base_stats),
            'file_type_breakdown': analyze_file_types(base_stats),
            'efficiency_metrics': calculate_efficiency_metrics(base_stats),
            'quality_indicators': assess_quality_indicators(base_stats)
        }
        
        # Add task-specific enhancements
        if task_type == 'file_processing':
            enhanced_stats['processing_insights'] = analyze_file_processing(base_stats)
        elif task_type == 'pdf_processing':
            enhanced_stats['pdf_insights'] = analyze_pdf_processing(base_stats)
        elif task_type == 'scraping':
            enhanced_stats['scraping_insights'] = analyze_scraping_performance(base_stats)
            
        return enhanced_stats
        
    except Exception as e:
        logger.error(f"Error processing completion stats: {e}")
        return stats if isinstance(stats, dict) else {'error': str(e)}


def calculate_completion_metrics(stats):
    """Calculate comprehensive completion metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        error_files = stats.get('error_files', 0)
        skipped_files = stats.get('skipped_files', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        
        metrics = {
            'completion_rate': round((processed_files / total_files * 100) if total_files > 0 else 0, 2),
            'error_rate': round((error_files / total_files * 100) if total_files > 0 else 0, 2),
            'skip_rate': round((skipped_files / total_files * 100) if total_files > 0 else 0, 2),
            'processing_speed': round((processed_files / duration) if duration > 0 else 0, 2),
            'throughput_mb_per_sec': round((stats.get('total_bytes', 0) / (1024*1024) / duration) if duration > 0 else 0, 2),
            'average_file_size_mb': round((stats.get('total_bytes', 0) / processed_files / (1024*1024)) if processed_files > 0 else 0, 2)
        }
        
        # Performance rating
        if metrics['completion_rate'] >= 95 and metrics['error_rate'] <= 5:
            metrics['performance_rating'] = 'Excellent'
        elif metrics['completion_rate'] >= 85 and metrics['error_rate'] <= 15:
            metrics['performance_rating'] = 'Good'
        elif metrics['completion_rate'] >= 70:
            metrics['performance_rating'] = 'Fair'
        else:
            metrics['performance_rating'] = 'Needs Improvement'
            
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating completion metrics: {e}")
        return {'error': str(e)}


def analyze_performance(stats):
    """Analyze performance characteristics."""
    try:
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        memory_peak = stats.get('peak_memory_usage_mb', 0)
        memory_avg = stats.get('avg_memory_usage_mb', 0)
        processing_rate = stats.get('current_processing_rate', 0)
        
        analysis = {
            'duration_formatted': format_duration(duration),
            'memory_efficiency': 'High' if memory_peak < 1000 else 'Medium' if memory_peak < 2000 else 'Low',
            'memory_stability': 'Stable' if abs(memory_peak - memory_avg) < memory_avg * 0.5 else 'Variable',
            'processing_consistency': analyze_processing_consistency(stats),
            'resource_utilization': {
                'peak_memory_mb': memory_peak,
                'avg_memory_mb': memory_avg,
                'memory_variance': round(abs(memory_peak - memory_avg), 2),
                'processing_rate_files_per_sec': round(processing_rate, 2)
            }
        }
        
        # Performance recommendations
        recommendations = []
        if memory_peak > 2000:
            recommendations.append("Consider processing smaller batches to reduce memory usage")
        if processing_rate < 1:
            recommendations.append("Processing speed could be improved with optimization")
        if stats.get('error_rate_percent', 0) > 10:
            recommendations.append("High error rate - check input data quality")
            
        analysis['recommendations'] = recommendations
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing performance: {e}")
        return {'error': str(e)}


def analyze_file_types(stats):
    """Analyze file type distribution and processing success."""
    try:
        breakdown = {
            'total_file_types': 0,
            'most_common_type': 'N/A',
            'type_distribution': {},
            'success_by_type': {},
            'pdf_analysis': {}
        }
        
        # Extract file type information from speed profile if available
        speed_profile = stats.get('speed_profile', {})
        if 'extension_breakdown' in speed_profile:
            breakdown['type_distribution'] = speed_profile['extension_breakdown']
            breakdown['total_file_types'] = len(breakdown['type_distribution'])
            
            if breakdown['type_distribution']:
                breakdown['most_common_type'] = max(
                    breakdown['type_distribution'], 
                    key=breakdown['type_distribution'].get
                )
        
        # Error rates by extension
        if 'error_rates_by_extension' in speed_profile:
            breakdown['success_by_type'] = {
                ext: round(100 - rate, 2) 
                for ext, rate in speed_profile['error_rates_by_extension'].items()
            }
        
        # PDF-specific analysis
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            breakdown['pdf_analysis'] = {
                'total_pdfs': pdf_files,
                'tables_extracted': stats.get('tables_extracted', 0),
                'references_extracted': stats.get('references_extracted', 0),
                'ocr_processed': stats.get('ocr_processed_files', 0),
                'scanned_pages': stats.get('scanned_pages_processed', 0),
                'avg_tables_per_pdf': round(stats.get('tables_extracted', 0) / pdf_files, 2),
                'ocr_usage_rate': round(stats.get('ocr_processed_files', 0) / pdf_files * 100, 2)
            }
        
        return breakdown
        
    except Exception as e:
        logger.error(f"Error analyzing file types: {e}")
        return {'error': str(e)}


def calculate_efficiency_metrics(stats):
    """Calculate efficiency and optimization metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        total_bytes = stats.get('total_bytes', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        chunks = stats.get('total_chunks', 0)
        
        metrics = {
            'files_per_minute': round((processed_files / duration * 60) if duration > 0 else 0, 2),
            'mb_per_minute': round((total_bytes / (1024*1024) / duration * 60) if duration > 0 else 0, 2),
            'chunks_per_file': round((chunks / processed_files) if processed_files > 0 else 0, 2),
            'bytes_per_second': round((total_bytes / duration) if duration > 0 else 0, 2),
            'efficiency_score': 0
        }
        
        # Calculate efficiency score (0-100)
        completion_rate = (processed_files / total_files * 100) if total_files > 0 else 0
        error_rate = stats.get('error_rate_percent', 0)
        speed_factor = min(metrics['files_per_minute'] / 10, 10) * 10  # Normalize speed component
        
        metrics['efficiency_score'] = round(
            (completion_rate * 0.4) + 
            ((100 - error_rate) * 0.3) + 
            (speed_factor * 0.3), 2
        )
        
        # Efficiency grade
        if metrics['efficiency_score'] >= 90:
            metrics['efficiency_grade'] = 'A+'
        elif metrics['efficiency_score'] >= 80:
            metrics['efficiency_grade'] = 'A'
        elif metrics['efficiency_score'] >= 70:
            metrics['efficiency_grade'] = 'B'
        elif metrics['efficiency_score'] >= 60:
            metrics['efficiency_grade'] = 'C'
        else:
            metrics['efficiency_grade'] = 'D'
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating efficiency metrics: {e}")
        return {'error': str(e)}


def assess_quality_indicators(stats):
    """Assess quality indicators for the processing task."""
    try:
        indicators = {
            'data_integrity': 'Good',  # Default assumption
            'processing_reliability': 'High',
            'output_quality': 'Standard',
            'quality_score': 0,
            'quality_flags': []
        }
        
        error_rate = stats.get('error_rate_percent', 0)
        success_rate = stats.get('success_rate_percent', 0)
        
        # Assess data integrity
        if error_rate < 5:
            indicators['data_integrity'] = 'Excellent'
        elif error_rate < 15:
            indicators['data_integrity'] = 'Good'
        elif error_rate < 30:
            indicators['data_integrity'] = 'Fair'
        else:
            indicators['data_integrity'] = 'Poor'
            indicators['quality_flags'].append('High error rate detected')
        
        # Assess processing reliability
        if success_rate > 95:
            indicators['processing_reliability'] = 'Very High'
        elif success_rate > 85:
            indicators['processing_reliability'] = 'High'
        elif success_rate > 70:
            indicators['processing_reliability'] = 'Medium'
        else:
            indicators['processing_reliability'] = 'Low'
            indicators['quality_flags'].append('Low success rate')
        
        # Check for quality flags
        if stats.get('skipped_files', 0) > stats.get('total_files', 0) * 0.2:
            indicators['quality_flags'].append('High skip rate - check file compatibility')
            
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 100:
            indicators['quality_flags'].append(f'Large file processed: {largest_file_mb:.1f}MB')
        
        # Calculate overall quality score
        base_score = success_rate
        penalty = len(indicators['quality_flags']) * 5
        indicators['quality_score'] = max(0, round(base_score - penalty, 2))
        
        return indicators
        
    except Exception as e:
        logger.error(f"Error assessing quality indicators: {e}")
        return {'error': str(e)}


def analyze_file_processing(stats):
    """Analyze file processing specific insights."""
    try:
        insights = {
            'processing_pattern': 'Standard',
            'optimization_opportunities': [],
            'file_handling_efficiency': 'Good'
        }
        
        # Analyze processing patterns
        avg_file_size = stats.get('average_file_size', 0)
        if avg_file_size > 10 * 1024 * 1024:  # > 10MB
            insights['processing_pattern'] = 'Large File Processing'
            insights['optimization_opportunities'].append('Consider streaming for large files')
        elif avg_file_size < 1024:  # < 1KB
            insights['processing_pattern'] = 'Small File Processing'
            insights['optimization_opportunities'].append('Batch processing could improve efficiency')
        
        # Check chunk efficiency
        chunks_per_file = stats.get('total_chunks', 0) / max(stats.get('processed_files', 1), 1)
        if chunks_per_file > 20:
            insights['optimization_opportunities'].append('Many chunks per file - consider larger chunk sizes')
        elif chunks_per_file < 2:
            insights['optimization_opportunities'].append('Few chunks per file - files might be very small')
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing file processing: {e}")
        return {'error': str(e)}


def analyze_pdf_processing(stats):
    """Analyze PDF processing specific insights."""
    try:
        insights = {
            'pdf_complexity': 'Standard',
            'extraction_success': 'Good',
            'ocr_efficiency': 'N/A'
        }
        
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            tables_per_pdf = stats.get('tables_extracted', 0) / pdf_files
            refs_per_pdf = stats.get('references_extracted', 0) / pdf_files
            ocr_rate = stats.get('ocr_processed_files', 0) / pdf_files * 100
            
            # Assess PDF complexity
            if tables_per_pdf > 5 or refs_per_pdf > 50:
                insights['pdf_complexity'] = 'High - Rich content documents'
            elif tables_per_pdf > 2 or refs_per_pdf > 20:
                insights['pdf_complexity'] = 'Medium - Standard academic/business documents'
            else:
                insights['pdf_complexity'] = 'Low - Simple text documents'
            
            # Assess extraction success
            if tables_per_pdf > 3 and refs_per_pdf > 30:
                insights['extraction_success'] = 'Excellent - Rich data extracted'
            elif tables_per_pdf > 1 or refs_per_pdf > 10:
                insights['extraction_success'] = 'Good - Moderate extraction'
            else:
                insights['extraction_success'] = 'Basic - Limited structured content'
            
            # OCR efficiency
            if ocr_rate > 50:
                insights['ocr_efficiency'] = 'High OCR usage - Many scanned documents'
            elif ocr_rate > 20:
                insights['ocr_efficiency'] = 'Moderate OCR usage'
            elif ocr_rate > 0:
                insights['ocr_efficiency'] = 'Low OCR usage - Mostly digital PDFs'
            else:
                insights['ocr_efficiency'] = 'No OCR needed - All digital content'
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing PDF processing: {e}")
        return {'error': str(e)}


def analyze_scraping_performance(stats):
    """Analyze web scraping specific insights."""
    try:
        insights = {
            'scraping_efficiency': 'Standard',
            'download_performance': 'Good',
            'content_extraction': 'Standard'
        }
        
        # Add scraping-specific analysis based on available stats
        # This would be expanded based on scraping-specific metrics
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing scraping performance: {e}")
        return {'error': str(e)}


def analyze_processing_consistency(stats):
    """Analyze consistency of processing performance."""
    try:
        current_rate = stats.get('current_processing_rate', 0)
        avg_rate = stats.get('files_per_second', 0)
        
        if abs(current_rate - avg_rate) < avg_rate * 0.2:
            return 'Very Consistent'
        elif abs(current_rate - avg_rate) < avg_rate * 0.5:
            return 'Consistent'
        else:
            return 'Variable'
            
    except Exception:
        return 'Unknown'


def generate_stats_summary(stats, task_type):
    """Generate a human-readable summary of the stats."""
    try:
        completion_metrics = stats.get('completion_metrics', {})
        performance_analysis = stats.get('performance_analysis', {})
        efficiency_metrics = stats.get('efficiency_metrics', {})
        
        summary = {
            'headline': generate_headline_summary(stats, task_type),
            'key_metrics': {
                'files_processed': stats.get('processed_files', 0),
                'success_rate': f"{completion_metrics.get('completion_rate', 0)}%",
                'duration': performance_analysis.get('duration_formatted', 'Unknown'),
                'efficiency_grade': efficiency_metrics.get('efficiency_grade', 'N/A')
            },
            'highlights': generate_highlights(stats),
            'areas_for_improvement': generate_improvement_areas(stats)
        }
        
        return summary
        
    except Exception as e:
        logger.error(f"Error generating stats summary: {e}")
        return {'error': str(e)}


def generate_headline_summary(stats, task_type):
    """Generate a compelling headline summary."""
    try:
        processed = stats.get('processed_files', 0)
        total = stats.get('total_files', 0)
        duration = stats.get('duration_seconds', 0)
        
        if total > 0:
            success_rate = round((processed / total) * 100, 1)
            if success_rate >= 95:
                performance_word = "successfully"
            elif success_rate >= 80:
                performance_word = "efficiently"
            else:
                performance_word = "partially"
        else:
            performance_word = "completed"
            
        return f"{task_type.replace('_', ' ').title()} {performance_word} processed {processed} files in {format_duration(duration)}"
        
    except Exception:
        return f"{task_type.replace('_', ' ').title()} completed"


def generate_highlights(stats):
    """Generate key highlights from the processing."""
    highlights = []
    
    try:
        # Performance highlights
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['A+', 'A']:
            highlights.append(f"Excellent efficiency rating: {efficiency_grade}")
        
        # Processing speed highlights
        speed = stats.get('efficiency_metrics', {}).get('files_per_minute', 0)
        if speed > 60:
            highlights.append(f"High processing speed: {speed} files/minute")
        
        # PDF processing highlights
        pdf_files = stats.get('pdf_files', 0)
        tables = stats.get('tables_extracted', 0)
        if pdf_files > 0 and tables > 0:
            highlights.append(f"Extracted {tables} tables from {pdf_files} PDF files")
        
        # Memory efficiency highlights
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'High':
            highlights.append("Efficient memory usage maintained")
        
        # Large file handling
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 50:
            highlights.append(f"Successfully processed large file: {largest_file_mb:.1f}MB")
            
    except Exception as e:
        logger.debug(f"Error generating highlights: {e}")
    
    return highlights[:5]  # Limit to top 5 highlights


def generate_improvement_areas(stats):
    """Generate areas for improvement based on stats."""
    improvements = []
    
    try:
        # Error rate improvements
        error_rate = stats.get('completion_metrics', {}).get('error_rate', 0)
        if error_rate > 10:
            improvements.append(f"Reduce error rate from {error_rate}%")
        
        # Speed improvements
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['C', 'D']:
            improvements.append("Optimize processing speed")
        
        # Memory improvements
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'Low':
            improvements.append("Optimize memory usage")
        
        # Quality improvements
        quality_flags = stats.get('quality_indicators', {}).get('quality_flags', [])
        if quality_flags:
            improvements.extend(quality_flags[:2])  # Add top 2 quality issues
            
    except Exception as e:
        logger.debug(f"Error generating improvement areas: {e}")
    
    return improvements[:3]  # Limit to top 3 improvements


def generate_task_insights(payload):
    """Generate actionable insights from task completion data."""
    try:
        stats = payload.get('stats', {})
        task_type = payload.get('task_type', 'unknown')
        
        insights = {
            'performance_insights': [],
            'optimization_recommendations': [],
            'next_steps': [],
            'comparative_analysis': {}
        }
        
        # Performance insights
        completion_rate = stats.get('completion_metrics', {}).get('completion_rate', 0)
        if completion_rate == 100:
            insights['performance_insights'].append("Perfect completion rate achieved")
        elif completion_rate >= 95:
            insights['performance_insights'].append("Excellent completion rate with minimal failures")
        elif completion_rate >= 80:
            insights['performance_insights'].append("Good completion rate with room for improvement")
        else:
            insights['performance_insights'].append("Completion rate needs attention")
        
        # Processing efficiency insights
        efficiency_score = stats.get('efficiency_metrics', {}).get('efficiency_score', 0)
        if efficiency_score >= 90:
            insights['performance_insights'].append("Outstanding processing efficiency")
        elif efficiency_score >= 70:
            insights['performance_insights'].append("Good processing efficiency")
        else:
            insights['performance_insights'].append("Processing efficiency could be improved")
        
        # Optimization recommendations
        recommendations = stats.get('performance_analysis', {}).get('recommendations', [])
        insights['optimization_recommendations'].extend(recommendations)
        
        # Task-specific recommendations
        if task_type == 'file_processing':
            file_insights = stats.get('processing_insights', {})
            insights['optimization_recommendations'].extend(
                file_insights.get('optimization_opportunities', [])
            )
        
        # Next steps based on results
        error_files = stats.get('error_files', 0)
        if error_files > 0:
            insights['next_steps'].append(f"Review {error_files} failed files for common issues")
        
        output_file = payload.get('output_file')
        if output_file:
            insights['next_steps'].append(f"Review results in {os.path.basename(output_file)}")
        
        # Comparative analysis (placeholder for future enhancement)
        insights['comparative_analysis'] = {
            'vs_previous_runs': 'No comparison data available',
            'vs_benchmarks': 'Establishing baseline performance'
        }
        
        return insights
        
    except Exception as e:
        logger.error(f"Error generating task insights: {e}")
        return {'error': str(e)}


def format_duration(seconds):
    """Format duration in a human-readable way."""
    try:
        if seconds < 60:
            return f"{seconds:.1f} seconds"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"
    except Exception:
        return "Unknown duration"


# ----------------------------------------------------------------------------
# Integration with Existing Task Classes
# ----------------------------------------------------------------------------

def enhance_processing_task_completion(task):
    """
    Enhance ProcessingTask completion with rich stats.
    Call this in ProcessingTask completion logic.
    
    Args:
        task: ProcessingTask instance with stats
    """
    try:
        # Finalize stats
        if hasattr(task, 'stats') and hasattr(task.stats, 'finish_processing'):
            task.stats.finish_processing()
        
        # Generate performance metrics
        performance_metrics = {
            'memory_profile': getattr(task.stats, 'get_memory_profile', lambda: {})(),
            'speed_profile': getattr(task.stats, 'get_processing_speed_profile', lambda: {})(),
            'task_duration': time.time() - getattr(task, 'start_time', time.time()),
            'peak_memory_usage': getattr(task.stats, 'peak_memory_usage', 0)
        }
        
        # Emit enhanced completion
        emit_enhanced_task_completion(
            task_id=task.task_id,
            task_type=getattr(task, 'task_type', 'file_processing'),
            output_file=getattr(task, 'output_file', None),
            stats=task.stats,
            performance_metrics=performance_metrics
        )
        
    except Exception as e:
        logger.error(f"Error enhancing task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(
            task.task_id, 
            getattr(task, 'task_type', 'file_processing'),
            getattr(task, 'output_file', None),
            getattr(task, 'stats', None)
        )


# ----------------------------------------------------------------------------
# Frontend Integration Endpoints
# ----------------------------------------------------------------------------

@app.route("/api/task/<task_id>/stats", methods=["GET"])
def get_task_stats(task_id):
    """
    API endpoint to retrieve detailed task statistics.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON response with detailed task statistics
    """
    try:
        task = get_task(task_id)
        if not task:
            return structured_error_response(
                "TASK_NOT_FOUND", 
                f"Task {task_id} not found", 
                404
            )
        
        # Get basic task info
        task_info = {
            'task_id': task_id,
            'task_type': task.get('type', 'unknown'),
            'status': task.get('status', 'unknown'),
            'start_time': task.get('start_time'),
            'end_time': task.get('end_time')
        }
        
        # Get enhanced stats if available
        stats = None
        if hasattr(task, 'stats'):
            stats = process_completion_stats(task.stats, task_info['task_type'])
        elif 'stats' in task:
            stats = process_completion_stats(task['stats'], task_info['task_type'])
        
        response = {
            'task_info': task_info,
            'stats': stats,
            'summary': generate_stats_summary(stats, task_info['task_type']) if stats else None,
            'insights': generate_task_insights({'stats': stats, 'task_type': task_info['task_type']}) if stats else None
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error retrieving task stats for {task_id}: {e}")
        return structured_error_response(
            "STATS_RETRIEVAL_ERROR",
            f"Error retrieving stats: {str(e)}",
            500
        )


@app.route("/api/task/<task_id>/stats/export", methods=["GET"])
def export_task_stats(task_id):
    """
    Export detailed task statistics as downloadable JSON.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON file download with comprehensive stats
    """
    try:
        # Get comprehensive stats
        response = get_task_stats(task_id)
        if response.status_code != 200:
            return response
        
        stats_data = response.get_json()
        
        # Add export metadata
        export_data = {
            'export_info': {
                'exported_at': datetime.now().isoformat(),
                'export_version': '1.0',
                'task_id': task_id
            },
            **stats_data
        }
        
        # Create response with download headers
        json_output = json.dumps(export_data, indent=2, ensure_ascii=False)
        
        response = Response(
            json_output,
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename=task_{task_id}_stats.json',
                'Content-Type': 'application/json; charset=utf-8'
            }
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting task stats for {task_id}: {e}")
        return structured_error_response(
            "EXPORT_ERROR",
            f"Error exporting stats: {str(e)}",
            500
        )


# ----------------------------------------------------------------------------
# Task History and Analytics
# ----------------------------------------------------------------------------

# Global task history storage (in production, use a database)
task_history = []
task_history_lock = threading.Lock()

def add_task_to_history(task_id, task_type, stats, output_file=None):
    """
    Add completed task to history for analytics.
    
    Args:
        task_id: Task identifier
        task_type: Type of task
        stats: Task statistics
        output_file: Output file path if applicable
    """
    try:
        with task_history_lock:
            # Process stats for storage
            processed_stats = process_completion_stats(stats, task_type) if stats else {}
            
            history_entry = {
                'task_id': task_id,
                'task_type': task_type,
                'completed_at': datetime.now().isoformat(),
                'output_file': output_file,
                'stats': processed_stats,
                'summary': generate_stats_summary(processed_stats, task_type)
            }
            
            task_history.append(history_entry)
            
            # Keep only last 100 entries (in memory)
            if len(task_history) > 100:
                task_history.pop(0)
                
            logger.info(f"Added task {task_id} to history")
            
    except Exception as e:
        logger.error(f"Error adding task to history: {e}")


@app.route("/api/tasks/history", methods=["GET"])



@app.route("/api/tasks/analytics", methods=["GET"])

# -----------------------------------------------------------------------------
# File Path API Endpoints
# -----------------------------------------------------------------------------

@app.route("/api/verify-path", methods=["POST"])



@app.route("/api/create-directory", methods=["POST"])



@app.route("/api/get-output-filepath", methods=["POST"])
def api_get_output_filepath():
    """
    API endpoint to get a properly formatted output filepath.
    """
    data = request.get_json()
    filename = data.get('filename', '')
    directory = data.get('directory', '')
    
    # Use the get_output_filepath function for consistent handling
    try:
        # Make sure the filename has a .json extension
        if not filename.lower().endswith('.json'):
            filename += '.json'
            
        # If a directory is provided, use it as the base
        if directory:
            full_path = os.path.join(os.path.abspath(directory), filename)
        else:
            # Otherwise, use the default output folder
            full_path = os.path.join(DEFAULT_OUTPUT_FOLDER, filename)
            
        # Ensure the parent directory exists
        parent_dir = os.path.dirname(full_path)
        if not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
            
        return jsonify({
            "fullPath": full_path,
            "directory": os.path.dirname(full_path),
            "filename": os.path.basename(full_path)
        })
    except Exception as e:
        logger.error(f"Error generating output filepath: {e}")
        return structured_error_response("PATH_ERROR", f"Error generating output path: {str(e)}", 500)


@app.route("/api/check-file-exists", methods=["POST"])
def api_check_file_exists():
    """
    API endpoint to check if a file exists.
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({
            "status": "error",
            "message": "Path is required"
        }), 400
    
    path_str = data.get("path")
    if not path_str:
        return jsonify({
            "status": "error", 
            "message": "Empty path provided"
        }), 400
    
    try:
        # Normalize path
        norm_path = os.path.abspath(os.path.expanduser(path_str))
        
        # Check if file exists
        exists = os.path.isfile(norm_path)
        
        # Get additional info if it exists
        if exists:
            try:
                file_size = os.path.getsize(norm_path)
                modified_time = os.path.getmtime(norm_path)
                return jsonify({
                    "exists": True,
                    "path": norm_path,
                    "size": file_size,
                    "size_formatted": format_file_size(file_size),
                    "modified": modified_time,
                    "modified_formatted": format_timestamp(modified_time)
                })
            except Exception as detail_err:
                logger.warning(f"Error getting file details: {detail_err}")
                return jsonify({
                    "exists": True,
                    "path": norm_path
                })
        else:
            return jsonify({
                "exists": False,
                "path": norm_path
            })
    except Exception as e:
        logger.error(f"Error checking if file exists: {e}")
        return structured_error_response("CHECK_ERROR", f"Error checking file: {str(e)}", 500)


def format_file_size(size_bytes):
    """Format file size to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


def format_timestamp(timestamp):
    """Format timestamp to human-readable string."""
    try:
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return "Unknown"


@app.route("/api/get-default-output-folder", methods=["GET"])
def get_default_output_folder():
    """
    Get the default output folder path.
    """
    try:
        return jsonify({
            "path": DEFAULT_OUTPUT_FOLDER,
            "exists": os.path.isdir(DEFAULT_OUTPUT_FOLDER),
            "writable": os.access(DEFAULT_OUTPUT_FOLDER, os.W_OK)
        })
    except Exception as e:
        logger.error(f"Error getting default output folder: {e}")
        return structured_error_response("SERVER_ERROR", f"Could not retrieve default output folder: {str(e)}", 500)

@app.route("/api/process", methods=["POST"])


@app.route("/api/status/<task_id>")


@app.route("/api/download/<task_id>")


@app.route("/download/<path:filename>")


@app.route("/api/open/<task_id>")


@app.route("/api/open-file", methods=["POST"])
def open_arbitrary_file():
    """Open any file by path (for recent tasks history)."""
    data = request.json or {}
    file_path = data.get("path")
    
    if not file_path:
        return structured_error_response("PATH_REQUIRED", "File path is required.", 400)
    
    if not os.path.exists(file_path):
        return structured_error_response("FILE_NOT_FOUND", "File not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(file_path)
        else:
            try:
                subprocess.run(["xdg-open", file_path], check=False)
            except Exception:
                subprocess.run(["open", file_path], check=False)
                
        return jsonify({"success": True, "message": "File opened locally."})
    except Exception as e:
        logger.exception(f"Error opening file {file_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open file: {e}", 400)

task_registry = {}  # Or a shared task store object

def get_task(task_id):
    return task_registry.get(task_id)  # Customize if registry is class-based

def structured_error_response(code, message, status_code=400):
    response = jsonify({
        "error": {
            "code": code,
            "message": message
        }
    })
    response.status_code = status_code
    return response

   
@app.route("/api/start-playlists", methods=["POST"])


# ----------------------------------------------------------------------------
# Core Cancellation Infrastructure
# ----------------------------------------------------------------------------

# ============================================================================
# FIXED TASK CANCELLATION CHECK FUNCTION
# ============================================================================
# Corrected version that handles both dict objects and ProcessingTask instances

def check_task_cancellation(task_id: str) -> bool:
    """
    Thread-safe check if a task has been cancelled.
    Handles both dictionary objects (from active_tasks) and ProcessingTask instances.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if task should be cancelled
    """
    if not task_id:
        return False
        
    with tasks_lock:
        task = active_tasks.get(task_id)
        if not task:
            return False
        
        # Handle both dict objects and ProcessingTask instances
        try:
            if hasattr(task, 'get'):
                # task is a dictionary object
                return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
            elif hasattr(task, 'is_cancelled_flag'):
                # task is a ProcessingTask or BaseTask instance
                return getattr(task, 'is_cancelled_flag', False) or getattr(task, 'status', '') == 'cancelled'
            elif hasattr(task, 'status'):
                # task is an object with status attribute
                return getattr(task, 'status', '') == 'cancelled'
            else:
                # Fallback: treat as dict-like if it has keys
                if hasattr(task, '__getitem__'):
                    try:
                        return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
                    except:
                        return False
                return False
                
        except Exception as e:
            logger.debug(f"Error checking task cancellation for {task_id}: {e}")
            return False


# ============================================================================
# ENHANCED MARK TASK CANCELLED FUNCTION
# ============================================================================
# Updated to handle both dict and ProcessingTask objects

def mark_task_cancelled(task_id: str, reason: str = "Task cancelled by user") -> Tuple[bool, Dict[str, Any]]:
    """
    Unified function to mark a task as cancelled.
    Handles both dictionary objects and ProcessingTask instances.
    
    Args:
        task_id: The task ID to cancel
        reason: Reason for cancellation
        
    Returns:
        Tuple of (success, task_info)
    """
    with tasks_lock:
        task = active_tasks.get(task_id)
        
        if not task:
            return False, {"status": "not_found", "message": f"Task {task_id} not found"}
        
        try:
            # Handle dictionary objects (legacy format)
            if hasattr(task, 'get') and hasattr(task, 'update'):
                # Check if already in terminal state
                current_status = task.get('status', 'unknown')
                if current_status in ['completed', 'failed', 'cancelled']:
                    return True, {
                        "status": "already_finished", 
                        "message": f"Task already {current_status}",
                        "task_type": task.get('type', 'unknown')
                    }
                
                # Mark as cancelled - dictionary format
                task.update({
                    'status': 'cancelled',
                    'cancel_requested': True,
                    'end_time': time.time(),
                    'cancellation_reason': reason
                })
                
                return True, {
                    "status": "cancelled",
                    "message": reason,
                    "task_type": task.get('type', 'unknown'),
                    "task": task
                }
            
            # Handle ProcessingTask or BaseTask instances
            elif hasattr(task, 'status'):
                # Check if already in terminal state
                current_status = getattr(task, 'status', 'unknown')
                if current_status in ['completed', 'failed', 'cancelled']:
                    return True, {
                        "status": "already_finished",
                        "message": f"Task already {current_status}",
                        "task_type": getattr(task, 'task_type', 'unknown')
                    }
                
                # Call task's cancel method if available
                if hasattr(task, 'cancel') and callable(task.cancel):
                    try:
                        task.cancel()
                        logger.info(f"Called cancel() method for task {task_id}")
                    except Exception as e:
                        logger.error(f"Error calling cancel() for task {task_id}: {e}")
                        # Continue even if cancel() fails
                
                # Mark as cancelled - object format
                task.status = 'cancelled'
                if hasattr(task, 'is_cancelled_flag'):
                    task.is_cancelled_flag = True
                if hasattr(task, 'end_time'):
                    task.end_time = time.time()
                if hasattr(task, 'cancellation_reason'):
                    task.cancellation_reason = reason
                
                return True, {
                    "status": "cancelled",
                    "message": reason,
                    "task_type": getattr(task, 'task_type', 'unknown'),
                    "task": task
                }
            
            else:
                # Unknown task format
                logger.warning(f"Unknown task format for {task_id}: {type(task)}")
                return False, {
                    "status": "unknown_format",
                    "message": f"Unknown task format: {type(task)}"
                }
                
        except Exception as e:
            logger.error(f"Error marking task {task_id} as cancelled: {e}")
            return False, {
                "status": "error",
                "message": f"Error during cancellation: {str(e)}"
            }


# ============================================================================
# ENHANCED ProcessingTask CANCELLATION CHECK METHOD
# ============================================================================
# Add this method to the ProcessingTask class for internal cancellation checks

def _check_internal_cancellation(self) -> bool:
    """
    try:
        # CRITICAL: Check force cancellation first
        if is_force_cancelled(self.task_id if hasattr(self, 'task_id') else None):
            logger.warning(f"Task {getattr(self, 'task_id', 'unknown')} force cancelled")
            return True
        
    Internal method for ProcessingTask to check its own cancellation status.
    This avoids the need to go through the global check_task_cancellation function.
    
    Returns:
        bool: True if task should be cancelled
    """
    try:
        # Check internal cancellation flag first
        if hasattr(self, 'is_cancelled_flag') and self.is_cancelled_flag:
            return True
        
        # Check status
        if hasattr(self, 'status') and self.status == 'cancelled':
            return True
        
        # Also check the global task registry as a backup
        return check_task_cancellation(self.task_id)
        
    except Exception as e:
        logger.debug(f"Error in internal cancellation check: {e}")
        return False


# ============================================================================
# UPDATED STRUCTIFY PROGRESS CALLBACK
# ============================================================================
# Replace the progress callback in ProcessingTask with this corrected version

def _structify_progress_callback(self, processed_count: int, total_count: int, 
                               stage_message: str, current_file: Optional[str] = None):
    """
    Enhanced callback function with corrected cancellation checking.
    
    Args:
        processed_count: Number of items processed
        total_count: Total number of items to process
        stage_message: Current processing stage
        current_file: Optional current file being processed
    
    Raises:
        InterruptedError: If task was cancelled during processing
    """
    # Use internal cancellation check to avoid the 'get' attribute error
    if processed_count % self.cancellation_check_interval == 0:
        if self._check_internal_cancellation():
            logger.info(f"Task {self.task_id} cancelled during processing")
            raise InterruptedError("Task cancelled by user")
    
    # Calculate progress with better precision
    if total_count > 0:
        self.progress = min(int((processed_count / total_count) * 99), 99)  # Reserve 100% for completion
    else:
        self.progress = 0
    
    # Update CustomFileStats with comprehensive information
    if isinstance(self.stats, CustomFileStats):
        self.stats.total_files = total_count
        
        # Track processing milestones
        if processed_count == 1 and not hasattr(self, '_first_file_processed'):
            self._first_file_processed = time.time()
            self.performance_metrics['time_to_first_file'] = self._first_file_processed - self.start_time
        
        if processed_count == total_count // 2 and not hasattr(self, '_halfway_processed'):
            self._halfway_processed = time.time()
            self.performance_metrics['time_to_halfway'] = self._halfway_processed - self.start_time
    
    # Enhanced performance tracking
    current_time = time.time()
    elapsed_time = current_time - self.start_time
    
    # Track processing rate and detect bottlenecks
    if processed_count > 0 and elapsed_time > 0:
        current_rate = processed_count / elapsed_time
        
        # Detect processing bottlenecks
        if hasattr(self, '_last_rate_check') and current_rate < self._last_rate_check * 0.5:
            bottleneck = {
                'timestamp': current_time,
                'stage': stage_message,
                'rate_drop': self._last_rate_check - current_rate,
                'current_file': current_file
            }
            self.performance_metrics['bottlenecks_detected'].append(bottleneck)
            logger.warning(f"Processing bottleneck detected: rate dropped to {current_rate:.2f} files/sec")
        
        self._last_rate_check = current_rate
    
    # Adaptive chunk size optimization
    if self.adaptive_chunk_size and processed_count % 20 == 0:
        self._optimize_chunk_size(current_rate if 'current_rate' in locals() else 0)
    
    # Enhanced detailed progress tracking
    self.detailed_progress = {
        "processed_count": processed_count,
        "total_count": total_count,
        "stage": stage_message,
        "current_file": current_file,
        "progress_percent": self.progress,
        "timestamp": current_time,
        "elapsed_time": elapsed_time,
        "processing_rate": processed_count / elapsed_time if elapsed_time > 0 else 0,
        "estimated_completion": self._estimate_completion_time(processed_count, total_count, elapsed_time),
        "memory_usage_mb": self._get_current_memory_usage()
    }
    
    # Prepare enhanced message
    msg = f"Stage: {stage_message} ({processed_count}/{total_count})"
    if current_file:
        msg += f" - Current: {os.path.basename(current_file)}"
    
    # Add performance indicators to message
    if elapsed_time > 30:  # After 30 seconds, include rate information
        rate = processed_count / elapsed_time
        msg += f" - Rate: {rate:.1f} files/sec"
    
    # Enhanced details for emission
    details = {
        "current_stage_message": stage_message,
        "processed_count": processed_count,
        "total_count": total_count,
        "elapsed_time": elapsed_time,
        "processing_rate_files_per_sec": processed_count / elapsed_time if elapsed_time > 0 else 0,
        "estimated_completion_time": self.detailed_progress.get("estimated_completion"),
        "memory_usage_mb": self.detailed_progress.get("memory_usage_mb", 0)
    }
    
    if current_file:
        details["current_file_processing"] = os.path.basename(current_file)
    
    # Periodic memory and performance tracking
    if processed_count % 25 == 0:
        if hasattr(self.stats, 'track_memory_usage'):
            self.stats.track_memory_usage()
        
        # Record performance checkpoint
        checkpoint = {
            'processed_count': processed_count,
            'timestamp': current_time,
            'memory_mb': self._get_current_memory_usage(),
            'rate': processed_count / elapsed_time if elapsed_time > 0 else 0
        }
        self.performance_metrics['processing_checkpoints'].append(checkpoint)
    
    # Emit progress update with enhanced information
    self.emit_progress_update(progress=self.progress, message=msg, details=details)




# ============================================================================
# ENHANCED FORCE CANCELLATION SYSTEM
# ============================================================================

# Global force cancellation flag
FORCE_CANCEL_ALL = False
FORCE_CANCELLED_TASKS = set()

def force_cancel_all_tasks():
    """
    Force cancel ALL active tasks regardless of their state.
    This is a nuclear option to break out of stuck loops.
    """
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    
    logger.warning("[FORCE_CANCEL] Initiating force cancellation of ALL tasks")
    
    # Set global force cancel flag
    FORCE_CANCEL_ALL = True
    
    # Cancel all tasks in active_tasks
    with tasks_lock:
        cancelled_count = 0
        for task_id, task in list(active_tasks.items()):
            try:
                # Add to force cancelled set
                FORCE_CANCELLED_TASKS.add(task_id)
                
                # Try to set cancellation flags on the task object
                if hasattr(task, '__setattr__'):
                    try:
                        task.is_cancelled = True
                        task.is_cancelled_flag = True
                        task.status = 'cancelled'
                        task.cancelled = True
                    except:
                        pass
                
                # If it's a ProcessingTask, try to set its internal flag
                if hasattr(task, '_cancelled'):
                    task._cancelled = True
                
                # Emit cancellation event
                task_type = 'unknown'
                if hasattr(task, 'task_type'):
                    task_type = task.task_type
                elif isinstance(task, dict) and 'type' in task:
                    task_type = task['type']
                
                emit_task_cancelled(task_id, reason="Force cancelled due to system issue")
                cancelled_count += 1
                
                logger.info(f"[FORCE_CANCEL] Force cancelled task {task_id} (type: {task_type})")
                
            except Exception as e:
                logger.error(f"[FORCE_CANCEL] Error force cancelling task {task_id}: {e}")
        
        # Clear all active tasks
        active_tasks.clear()
        
    logger.warning(f"[FORCE_CANCEL] Force cancelled {cancelled_count} tasks")
    
    # Also emit a global cancellation event
    try:
        socketio.emit('all_tasks_cancelled', {
            'reason': 'Force cancellation due to system issue',
            'count': cancelled_count,
            'timestamp': time.time()
        })
    except:
        pass
    
    return cancelled_count

def is_force_cancelled(task_id=None):
    """
    Check if force cancellation is active or if a specific task was force cancelled.
    
    Args:
        task_id: Optional task ID to check. If None, checks global flag.
        
    Returns:
        bool: True if force cancelled
    """
    if FORCE_CANCEL_ALL:
        return True
    
    if task_id and task_id in FORCE_CANCELLED_TASKS:
        return True
        
    return False

def reset_force_cancel():
    """Reset force cancellation flags"""
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    FORCE_CANCEL_ALL = False
    FORCE_CANCELLED_TASKS.clear()
    logger.info("[FORCE_CANCEL] Force cancellation flags reset")

# Update check_task_cancellation to include force cancel check
def check_task_cancellation_enhanced(task_id: str) -> bool:
    """
    Enhanced version that checks for force cancellation first.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if the task is cancelled or force cancelled
    """
    # Check force cancellation first
    if is_force_cancelled(task_id):
        return True
    
    # Then check normal cancellation
    return check_task_cancellation(task_id)

# ============================================================================
# PLAYLIST CANCEL ENDPOINT  
# ============================================================================
# Playlist cancellation is handled by the generic cancel endpoint at /api/cancel/<task_id>
# The emit_cancellation_event function properly handles playlist-specific events

# ============================================================================
# EMERGENCY STOP ENDPOINT
# ============================================================================

@app.route("/api/emergency-stop", methods=["POST"])
def emergency_stop():
    """
    Emergency stop endpoint to force cancel all tasks.
    Use this when normal cancellation isn't working.
    """
    try:
        logger.warning("[EMERGENCY] Emergency stop requested")
        
        # Get current task count before cancellation
        task_count = len(active_tasks)
        
        # Force cancel all tasks
        cancelled_count = force_cancel_all_tasks()
        
        # Kill any stuck threads (be careful with this)
        try:
            # Get all threads
            import threading
            current_thread = threading.current_thread()
            for thread in threading.enumerate():
                if thread != current_thread and thread.name.startswith(('ProcessingTask', 'FileProcessor')):
                    logger.warning(f"[EMERGENCY] Attempting to stop thread: {thread.name}")
                    # Note: We can't forcefully kill threads in Python, but we can log them
        except Exception as e:
            logger.error(f"[EMERGENCY] Error enumerating threads: {e}")
        
        return jsonify({
            "status": "success",
            "message": "Emergency stop executed",
            "tasks_before": task_count,
            "tasks_cancelled": cancelled_count,
            "timestamp": time.time()
        }), 200
        
    except Exception as e:
        logger.error(f"[EMERGENCY] Error during emergency stop: {e}")
        return structured_error_response(
            "EMERGENCY_STOP_ERROR",
            f"Error during emergency stop: {str(e)}",
            500
        )







# ----------------------------------------------------------------------------
# Socket.IO Cancellation Handler
# ----------------------------------------------------------------------------



# ----------------------------------------------------------------------------
# Enhanced REST API Endpoint
# ----------------------------------------------------------------------------

@app.route("/api/cancel/<task_id>", methods=["POST"])
def cancel_task_api(task_id):
    """
    Enhanced REST cancellation endpoint with comprehensive error handling.
    Replaces existing implementation with improved idempotent behavior.
    """
    if not task_id:
        return structured_error_response("MISSING_TASK_ID", "Task ID is required", 400)
    
    logger.info(f"[CANCEL] REST API cancellation request for task: {task_id}")
    
    try:
        # Use unified cancellation logic
        success, task_info = mark_task_cancelled(task_id, "Task cancelled via REST API")
        
        if success:
            # Emit appropriate events
            task_type = task_info.get('task_type', 'unknown')
            reason = task_info.get('message', 'Task cancelled')
            emit_cancellation_event(task_id, task_type, reason)
            
            # Return success response
            return jsonify({
                "status": "success",
                "message": task_info['message'],
                "task_id": task_id,
                "task_type": task_type
            }), 200
        else:
            # Idempotent behavior for non-existent tasks
            emit_task_cancelled(task_id, reason="Task not found or already completed")
            return jsonify({
                "status": "success",
                "message": "Task not found or already completed",
                "task_id": task_id
            }), 200
            
    except Exception as e:
        logger.error(f"[CANCEL] REST API error for task {task_id}: {e}")
        return structured_error_response(
            "CANCELLATION_ERROR", 
            f"Error cancelling task: {str(e)}", 
            500
        )


# ----------------------------------------------------------------------------
# Task Execution Wrapper with Cancellation Support
# ----------------------------------------------------------------------------

def execute_task_with_cancellation(task_func, task_id: str, *args, **kwargs):
    """
    Universal task execution wrapper with built-in cancellation support.
    Implements consistent error handling and cleanup patterns.
    
    Args:
        task_func: The task function to execute
        task_id: Unique task identifier
        *args, **kwargs: Arguments for the task function
        
    Returns:
        Task execution result or None if cancelled
    """
    try:
        # Pre-execution cancellation check
        if check_task_cancellation(task_id):
            logger.info(f"[TASK] {task_id} cancelled before execution")
            return None
        
        logger.info(f"[TASK] Starting execution of {task_id}")
        
        # Execute the task with cancellation support
        result = task_func(task_id, *args, **kwargs)
        
        # Post-execution state management
        if not check_task_cancellation(task_id):
            with tasks_lock:
                task = active_tasks.get(task_id)
                if task and task.get('status') not in ['cancelled', 'failed']:
                    task.update({
                        'status': 'completed',
                        'end_time': time.time()
                    })
            
            emit_task_completion(task_id, task.get('type', 'unknown'))
            logger.info(f"[TASK] {task_id} completed successfully")
        
        return result
        
    except Exception as e:
        logger.exception(f"[TASK] {task_id} execution failed: {str(e)}")
        
        # Update task state on failure
        with tasks_lock:
            task = active_tasks.get(task_id)
            if task:
                task.update({
                    'status': 'failed',
                    'error': str(e),
                    'end_time': time.time()
                })
        
        emit_task_error(task_id, str(e))
        raise
    
    finally:
        # Schedule cleanup with delay for status queries
        schedule_task_cleanup(task_id, delay=30)


def schedule_task_cleanup(task_id: str, delay: int = 30) -> None:
    """
    Schedule task cleanup after a delay to allow final status queries.
    Non-blocking cleanup prevents resource leaks.
    
    Args:
        task_id: The task ID to clean up
        delay: Delay in seconds before cleanup
    """
    def cleanup_worker():
        try:
            time.sleep(delay)
            remove_task(task_id)
            logger.debug(f"[CLEANUP] Removed task {task_id} from active_tasks")
        except Exception as e:
            logger.error(f"[CLEANUP] Error removing task {task_id}: {e}")
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()


# ----------------------------------------------------------------------------
# Enhanced Task Loop Patterns
# ----------------------------------------------------------------------------

def cancellable_task_loop(task_id: str, work_items, progress_callback=None):
    """
    Generic cancellable task loop for processing work items.
    Implements consistent progress reporting and cancellation checking.
    
    Args:
        task_id: The task identifier
        work_items: Iterable of items to process
        progress_callback: Optional callback function for processing each item
        
    Yields:
        Processed items or raises StopIteration if cancelled
    """
    total_items = len(work_items) if hasattr(work_items, '__len__') else None
    processed_count = 0
    
    for item in work_items:
        # Check cancellation before processing each item
        if check_task_cancellation(task_id):
            logger.info(f"[TASK] {task_id} loop cancelled at item {processed_count}")
            return
        
        try:
            # Process the item
            if progress_callback:
                result = progress_callback(item)
            else:
                result = item
            
            processed_count += 1
            
            # Emit progress update
            if total_items:
                progress_percent = (processed_count / total_items) * 100
                emit_progress_update(
                    task_id, 
                    progress_percent, 
                    message=f"Processed {processed_count}/{total_items} items"
                )
            
            yield result
            
        except Exception as e:
            logger.error(f"[TASK] {task_id} error processing item {processed_count}: {e}")
            # Continue processing other items unless critically failed
            continue


# ----------------------------------------------------------------------------
# Task Status Monitoring
# ----------------------------------------------------------------------------





# ----------------------------------------------------------------------------
# Legacy Compatibility Functions
# ----------------------------------------------------------------------------



# ----------------------------------------------------------------------------
# PDF Download Endpoints MOVED TO web_scraper.py
# ----------------------------------------------------------------------------

@app.route("/api/download-pdf", methods=["POST"])


@app.route("/download-pdf/<path:pdf_path>")

@app.route("/download-file/<path:file_path>")


@app.route("/api/open-folder", methods=["POST"])
def open_folder():
    """Open a folder in the operating system's file explorer."""
    data = request.json or {}
    folder_path = data.get("path")
    
    if not folder_path:
        return structured_error_response("PATH_REQUIRED", "Folder path is required.", 400)
    
    if not os.path.exists(folder_path):
        return structured_error_response("FOLDER_NOT_FOUND", "Folder not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(folder_path)
        else:
            try:
                subprocess.run(["xdg-open", folder_path], check=False)
            except Exception:
                subprocess.run(["open", folder_path], check=False)
                
        return jsonify({"success": True, "message": "Folder opened locally."})
    except Exception as e:
        logger.exception(f"Error opening folder {folder_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open folder: {e}", 400)
# -----------------------------------------------------------------------------
# WEB SCRAPER ENDPOINTS - moved to web_scraper.py
# -----------------------------------------------------------------------------

@app.route("/api/scrape2", methods=["POST"])

@app.route("/api/scrape2/status/<task_id>")


@app.route("/api/scrape2/cancel/<task_id>", methods=["POST"])

# -----------------------------------------------------------------------------
# PDF PROCESSING ENDPOINTS
# -----------------------------------------------------------------------------

@app.route("/api/pdf/process", methods=["POST"])

    
@app.route("/api/pdf/extract-tables", methods=["POST"])

@app.route("/api/pdf/detect-type", methods=["POST"])

@app.route("/api/pdf/analyze", methods=["POST"])


@app.route("/api/pdf/batch-process", methods=["POST"])
def batch_process_pdfs_endpoint():
    """
    API endpoint to process multiple PDF files in a batch.
    
    Expected JSON input:
    {
        "pdf_files": ["path/to/file1.pdf", "path/to/file2.pdf"],
        "output_folder": "/path/to/output",
        "extract_tables": true,
        "use_ocr": true
    }
    
    Returns:
        Task ID for tracking the batch operation
    """
    if not request.is_json:
        return structured_error_response("INVALID_REQUEST", "JSON request expected", 400)
    
    data = request.get_json()
    pdf_files = data.get('pdf_files', [])
    output_folder = data.get('output_folder', DEFAULT_OUTPUT_FOLDER)
    extract_tables = data.get('extract_tables', True)
    use_ocr = data.get('use_ocr', True)
    
    if not pdf_files:
        return structured_error_response("FILES_REQUIRED", "List of PDF files is required", 400)
    
    try:
        # Validate files existence
        non_existent_files = [f for f in pdf_files if not os.path.isfile(f)]
        if non_existent_files:
            return structured_error_response(
                "FILES_NOT_FOUND", 
                f"Some PDF files not found: {', '.join(os.path.basename(f) for f in non_existent_files[:5])}" +
                (f" and {len(non_existent_files) - 5} more" if len(non_existent_files) > 5 else ""),
                400
            )
        
        # Ensure output directory exists
        try:
            os.makedirs(output_folder, exist_ok=True)
        except Exception as e:
            logger.error(f"Error creating output directory: {e}")
            return structured_error_response("OUTPUT_DIR_ERROR", f"Failed to create output directory: {str(e)}", 500)
        
        # Check if pdf_extractor module is available
        if 'pdf_extractor' not in sys.modules:
            try:
                import pdf_extractor
                pdf_extractor_available = True
            except ImportError:
                return structured_error_response("MODULE_ERROR", "PDF processing module not available", 500)
        
        # Create a unique task ID
        task_id = str(uuid.uuid4())
        
        # Create and register the task
        task_data = {
            "type": "batch_processing",
            "pdf_files": pdf_files,
            "output_folder": output_folder,
            "total_files": len(pdf_files),
            "processed_files": 0,
            "failed_files": 0,
            "start_time": time.time(),
            "status": "processing"
        }
        
        with tasks_lock:
            active_tasks[task_id] = task_data
        
        # Emit initial status
        try:
            socketio.emit("batch_processing_start", {
                "task_id": task_id,
                "total_files": len(pdf_files),
                "output_folder": output_folder,
                "timestamp": time.time()
            })
        except Exception as socket_err:
            logger.debug(f"Socket.IO start emission failed: {socket_err}")
        
        # Start batch processing in a background thread
        def batch_process_thread():
            try:
                if hasattr(pdf_extractor, 'batch_process_pdfs'):
                    # Use pdf_extractor's batch processing function
                    result = pdf_extractor.batch_process_pdfs(
                        pdf_files=pdf_files,
                        output_folder=output_folder,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr
                    )
                    
                    # Update task with results
                    with tasks_lock:
                        if task_id in active_tasks:
                            active_tasks[task_id]["status"] = "completed"
                            active_tasks[task_id]["end_time"] = time.time()
                            active_tasks[task_id]["processed_files"] = result.get("processed_files", 0)
                            active_tasks[task_id]["failed_files"] = result.get("failed_files", 0)
                            active_tasks[task_id]["results"] = result.get("results", [])
                    
                    # Emit completion event
                    try:
                        socketio.emit("batch_processing_complete", {
                            "task_id": task_id,
                            "status": "completed",
                            "output_folder": output_folder,
                            "processed_files": result.get("processed_files", 0),
                            "failed_files": result.get("failed_files", 0),
                            "total_files": result.get("total_files", 0),
                            "success_rate": result.get("success_rate", 0),
                            "processing_time": result.get("elapsed_seconds", 0),
                            "timestamp": time.time()
                        })
                    except Exception as socket_err:
                        logger.debug(f"Socket.IO completion emission failed: {socket_err}")
                else:
                    # Fallback to manual processing
                    processed = 0
                    failed = 0
                    results = []
                    
                    for i, pdf_file in enumerate(pdf_files):
                        try:
                            base_name = os.path.splitext(os.path.basename(pdf_file))[0]
                            output_path = os.path.join(output_folder, f"{base_name}_processed.json")
                            
                            start_time = time.time()
                            result = pdf_extractor.process_pdf(
                                pdf_path=pdf_file,
                                output_path=output_path,
                                extract_tables=extract_tables,
                                use_ocr=use_ocr,
                                return_data=True
                            )
                            elapsed = time.time() - start_time
                            
                            if result and result.get("status") == "success":
                                processed += 1
                                results.append({
                                    "pdf_file": pdf_file,
                                    "output_file": output_path,
                                    "success": True,
                                    "document_type": result.get("document_type", "unknown"),
                                    "page_count": result.get("page_count", 0),
                                    "elapsed_seconds": elapsed
                                })
                            else:
                                failed += 1
                                results.append({
                                    "pdf_file": pdf_file,
                                    "output_file": output_path,
                                    "success": False,
                                    "error": result.get("error", "Unknown error") if result else "Processing failed",
                                    "elapsed_seconds": elapsed
                                })
                            
                            # Update task progress
                            with tasks_lock:
                                if task_id in active_tasks:
                                    active_tasks[task_id]["processed_files"] = processed
                                    active_tasks[task_id]["failed_files"] = failed
                            
                            # Update progress
                            try:
                                progress = int((i + 1) / len(pdf_files) * 100)
                                socketio.emit("batch_processing_progress", {
                                    "task_id": task_id,
                                    "progress": progress,
                                    "processed": processed,
                                    "failed": failed,
                                    "total": len(pdf_files),
                                    "current_file": os.path.basename(pdf_file),
                                    "timestamp": time.time()
                                })
                            except Exception as socket_err:
                                logger.debug(f"Socket.IO progress emission failed: {socket_err}")
                                
                        except Exception as e:
                            logger.error(f"Error processing PDF {pdf_file}: {e}")
                            failed += 1
                            results.append({
                                "pdf_file": pdf_file,
                                "success": False,
                                "error": str(e),
                                "elapsed_seconds": time.time() - start_time
                            })
                    
                    # Update task with results
                    with tasks_lock:
                        if task_id in active_tasks:
                            active_tasks[task_id]["status"] = "completed"
                            active_tasks[task_id]["end_time"] = time.time()
                            active_tasks[task_id]["processed_files"] = processed
                            active_tasks[task_id]["failed_files"] = failed
                            active_tasks[task_id]["results"] = results
                    
                    # Calculate processing time
                    processing_time = time.time() - active_tasks[task_id]["start_time"] if task_id in active_tasks else 0
                    
                    # Emit completion event
                    try:
                        socketio.emit("batch_processing_complete", {
                            "task_id": task_id,
                            "status": "completed",
                            "output_folder": output_folder,
                            "processed_files": processed,
                            "failed_files": failed,
                            "total_files": len(pdf_files),
                            "success_rate": (processed / len(pdf_files) * 100) if pdf_files else 0,
                            "processing_time": processing_time,
                            "timestamp": time.time()
                        })
                    except Exception as socket_err:
                        logger.debug(f"Socket.IO completion emission failed: {socket_err}")
                    
            except Exception as e:
                logger.error(f"Error in batch processing: {e}", exc_info=True)
                
                # Update task status to error
                with tasks_lock:
                    if task_id in active_tasks:
                        active_tasks[task_id]["status"] = "error"
                        active_tasks[task_id]["error"] = str(e)
                        active_tasks[task_id]["end_time"] = time.time()
                
                # Emit error event
                try:
                    socketio.emit("batch_processing_error", {
                        "task_id": task_id,
                        "error": str(e),
                        "timestamp": time.time()
                    })
                except Exception as socket_err:
                    logger.debug(f"Socket.IO error emission failed: {socket_err}")
            
            finally:
                # Remove task from active tasks when finished
                remove_task(task_id)
        
        # Start thread
        thread = threading.Thread(target=batch_process_thread, daemon=True)
        thread.start()
        
        # Return immediate response
        return jsonify({
            "status": "processing",
            "message": f"Batch processing started for {len(pdf_files)} PDF files",
            "task_id": task_id,
            "output_folder": output_folder,
            "total_files": len(pdf_files)
        })
        
    except Exception as e:
        logger.error(f"Error initiating batch processing: {e}", exc_info=True)
        return structured_error_response("SERVER_ERROR", f"Batch processing error: {str(e)}", 500)

@app.route("/api/pdf/status/<task_id>", methods=["GET"])
def pdf_processing_status(task_id):
    """
    API endpoint to get the status of a PDF processing task.
    
    Args:
        task_id: The ID of the task to check
    """
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found", 404)
    
    # Calculate processing time
    processing_time = time.time() - task.get("start_time", time.time())
    if "end_time" in task:
        processing_time = task["end_time"] - task["start_time"]
    
    # Build response based on task type
    response = {
        "task_id": task_id,
        "status": task.get("status", "unknown"),
        "type": task.get("type", "unknown"),
        "processing_time": processing_time
    }
    
    # Add type-specific details
    if task.get("type") == "pdf_processing":
        response.update({
            "pdf_path": task.get("pdf_path", ""),
            "output_path": task.get("output_path", ""),
            "file_name": os.path.basename(task.get("pdf_path", ""))
        })
        
        # Add result details if available
        if "result" in task:
            result = task["result"]
            response.update({
                "document_type": result.get("document_type", "unknown"),
                "page_count": result.get("page_count", 0),
                "tables_count": len(result.get("tables", [])),
                "references_count": len(result.get("references", [])),
                "chunks_count": len(result.get("chunks", []))
            })
    
    elif task.get("type") == "batch_processing":
        response.update({
            "total_files": task.get("total_files", 0),
            "processed_files": task.get("processed_files", 0),
            "failed_files": task.get("failed_files", 0),
            "output_folder": task.get("output_folder", ""),
            "progress": int((task.get("processed_files", 0) + task.get("failed_files", 0)) / 
                           max(1, task.get("total_files", 1)) * 100)
        })
    
    # Add error if present
    if "error" in task:
        response["error"] = task["error"]
    
    return jsonify(response)

@app.route("/api/pdf/cancel/<task_id>", methods=["POST"])
def cancel_pdf_task(task_id):
    """
    API endpoint to cancel a running PDF processing task.
    
    Args:
        task_id: The ID of the task to cancel
    """
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found", 404)
    
    # Check if task is cancellable (not already completed/failed)
    if task.get("status") in ["completed", "failed", "cancelled"]:
        return structured_error_response("TASK_ALREADY_FINISHED", 
                                         f"Task already in state: {task.get('status')}", 400)
    
    # Update task status
    with tasks_lock:
        task["status"] = "cancelled"
        task["end_time"] = time.time()
    
    # Emit cancellation event
    try:
        event_name = "pdf_processing_cancelled" if task.get("type") == "pdf_processing" else "batch_processing_cancelled"
        socketio.emit(event_name, {
            "task_id": task_id,
            "timestamp": time.time()
        })
    except Exception as socket_err:
        logger.debug(f"Socket.IO cancellation emission failed: {socket_err}")
    
    # Note: The task will continue running in the background, but we'll ignore its results
    
    return jsonify({
        "status": "success",
        "message": f"Task {task_id} cancelled",
        "task_type": task.get("type", "unknown")
    })
       
@app.route("/api/pdf-capabilities", methods=["GET"])
def get_pdf_capabilities():
    """
    Get PDF processing capabilities of the server.
    
    Returns:
        JSON response with PDF processing capabilities
    """
    capabilities = {
        "pdf_extraction": pdf_extractor_available,
        "ocr": 'pytesseract' in sys.modules,
        "structify": structify_available,
        "pikepdf": pikepdf_available,
        "table_extraction": pdf_extractor_available and hasattr(pdf_extractor, 'extract_tables_from_pdf'),
        "document_detection": pdf_extractor_available and hasattr(pdf_extractor, 'detect_document_type'),
        "max_file_size": MAX_FILE_SIZE // (1024 * 1024)  # Convert to MB
    }
    
    return jsonify({
        "status": "success",
        "capabilities": capabilities
    })

# ----------------------------------------------------------------------------
# API Key Management 
# ----------------------------------------------------------------------------
 
@app.route("/api/keys", methods=["GET"])
def list_api_keys():
    """List all API keys"""
    try:
        keys = key_manager.get_all_keys()
        # Create a safe version without exposing the actual keys
        safe_keys = {}
        for key, data in keys.items():
            key_preview = f"{key[:8]}...{key[-4:]}"
            safe_keys[key_preview] = data
        return jsonify({"keys": safe_keys})
    except Exception as e:
        logger.error(f"Error listing API keys: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/keys/create", methods=["POST"])
def create_api_key():
    """Create a new API key"""
    try:
        data = request.get_json() or {}
        name = data.get("name", f"Key-{datetime.now().strftime('%Y%m%d')}")
        description = data.get("description", "Generated from API")
        
        key = key_manager.create_key(name, description)
        return jsonify({
            "key": key,
            "name": name,
            "message": "API key created successfully. Save this key as it won't be shown again."
        })
    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/keys/revoke", methods=["POST"])
def revoke_api_key():
    """Revoke an API key"""
    try:
        data = request.get_json() or {}
        key = data.get("key")
        
        if not key:
            return jsonify({"error": "Key is required"}), 400
            
        if key_manager.revoke_key(key):
            return jsonify({"message": "API key revoked successfully"})
        else:
            return jsonify({"error": "Invalid key"}), 404
    except Exception as e:
        logger.error(f"Error revoking API key: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/key-manager")
def key_manager_ui():
    """Serve the API key manager interface"""
    return render_template("key_manager.html")
     
     
# -----------------------------------------------------------------------------
# Academic API Helper Functions
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# Academic API Endpoints
# -----------------------------------------------------------------------------

@app.route("/shutdown", methods=["POST"])

@app.route("/api/academic/health", methods=["GET"])

@app.route("/api/academic/search", methods=["GET"])

@app.route("/api/academic/multi-source", methods=["GET"])

@app.route("/api/academic/details/<path:id>", methods=["GET"])

@app.route("/api/academic/download/<path:id>", methods=["GET"])

@app.route("/api/academic/citations/<path:id>", methods=["GET"])

@app.route("/api/academic/recommendations/<path:id>", methods=["GET"])

@app.route("/api/academic/bulk/download", methods=["POST"])


@app.route("/api/academic/analyze/<path:id>", methods=["GET"])

@app.route("/api/academic/extract", methods=["GET"])


# ----------------------------------------------------------------------------
# Main Entry Point
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    from flask_socketio import SocketIO
    import eventlet
    eventlet.monkey_patch()
    socketio = SocketIO(app, cors_allowed_origins="*")

    socketio.run(app, host=API_HOST, port=int(API_PORT), debug=API_DEBUG)

    if redis_integration_available:
        redis_cache = RedisCache(app)
        redis_rate_limiter = RedisRateLimiter(app)
        logger.info("Initialized Redis cache and rate limiter")
    else:
        logger.info("Using in-memory cache (Redis not available)")
    import argparse
    
    parser = argparse.ArgumentParser(description="NeuroGen Processing Server")
    
    parser.add_argument("--host", default=API_HOST, help=f"Host address to bind to (default: {API_HOST})")
    parser.add_argument("--port", default=API_PORT, help=f"Port to bind to (default: {API_PORT})")
    parser.add_argument("--debug", action="store_true", default=API_DEBUG, help="Enable debug mode")   
    parser.add_argument("-i", "--input", help="Root directory for input files (CLI mode)")
    parser.add_argument("-o", "--output", help="Path to output JSON file (CLI mode)")
    parser.add_argument("--threads", type=int, default=DEFAULT_NUM_THREADS, help="Number of threads to use (CLI mode)")
    
    args = parser.parse_args()
    
    if args.input:
        if args.debug:
            logging.getLogger().setLevel(logging.DEBUG)      
        output_filepath = args.output
        if not output_filepath:
            output_folder = os.path.dirname(os.path.abspath(args.input))
            output_filepath = os.path.join(output_folder, "output.json")
        
        logger.info(f"Running in CLI mode: Processing files from {args.input}")
        logger.info(f"Output will be saved to: {output_filepath}")
        
        if not structify_module:
            logger.error("Claude module not available. Cannot process files.")
            sys.exit(1)
        
        try:
            result = structify_module.process_all_files(
                root_directory=args.input,
                output_file=output_filepath,
                max_chunk_size=4096,
                executor_type="thread",
                max_workers=args.threads,
                stop_words=structify_module.DEFAULT_STOP_WORDS,
                use_cache=False,
                valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True
            )
            
            if result.get("stats"):
                stats = result["stats"]
                print(f"\nProcessing complete.")
                print(f"Files found: {stats.get('total_files', 0)}")
                print(f"Files processed: {stats.get('processed_files', 0)}")
                print(f"Files skipped: {stats.get('skipped_files', 0)}")
                print(f"Errors: {stats.get('error_files', 0)}")
                print(f"Total chunks: {stats.get('total_chunks', 0)}")
                print(f"Duration: {stats.get('duration_seconds', 0):.2f} seconds")
                print(f"Output: {output_filepath}")
            else:
                print(f"\nProcessing complete with unknown status.")
            
        except Exception as e:
            logger.error(f"Processing failed: {e}")
            sys.exit(1)
            
    else:
        logger.info(f"Starting NeuroGen Processor Server on {args.host}:{args.port}")
        
        if args.debug:
            logger.info("Debug mode enabled")        
        if structify_module:
            logger.info("Claude module available - PDF processing enabled")
            # Log detected capabilities
            capabilities = []
            if hasattr(structify_module, 'process_pdf'):
                capabilities.append("Direct PDF processing")
            if hasattr(structify_module, 'extract_tables_from_pdf'):
                capabilities.append("Table extraction")
            if hasattr(structify_module, 'detect_document_type'):
                capabilities.append("Document type detection")
            
            if capabilities:
                logger.info(f"Claude module capabilities: {', '.join(capabilities)}")
        else:
            logger.warning("Claude module not available - PDF processing capabilities will be limited")
        
        try:
            socketio.run(app, debug=args.debug, host=args.host, port=int(args.port))
        except Exception as e:
            logger.error(f"Server failed to start: {e}")
            sys.exit(1)