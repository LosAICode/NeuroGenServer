# At the top of app.py - Add proper logging setup first
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
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple, Set, Any, Union, Callable
from urllib.parse import urlencode
from functools import wraps
from datetime import datetime

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    
parent_dir = os.path.dirname(current_dir)
structify_dir = os.path.join(parent_dir, 'Structify')
modules_dir = current_dir  

for path in [parent_dir, current_dir, structify_dir]:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

logger = logging.getLogger(__name__)
        
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    if structify_module is None:
        logger.error("Failed to load structify_module: get_claude_module() returned None")
        # Set a flag to indicate it's not available
        structify_available = False
    else:
        structify_available = True
        FileStats = components.get('FileStats')
        ProcessingTask = components.get('ProcessingTask')
        process_all_files = components.get('process_all_files')
        logger.info("Successfully loaded structify_module and components")
except ImportError as e:
    logger.error(f"Could not import structify_module: {e}")
    structify_available = False
    # Define placeholder classes
    class FileStats: pass
    class ProcessingTask: pass
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
    ping_timeout=60,  # Increase ping timeout
    ping_interval=25,  # More frequent pings
    max_http_buffer_size=10e6  # 10MB buffer for large transfers
)

# Connection event handlers
@socketio.on('connect')
def handle_connect():
    logging.info(f"Client connected: {request.sid}")
    emit('connection_established', {'status': 'connected', 'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    logging.info(f"Client disconnected: {request.sid}")
    # Don't perform any actions that might prevent reconnection

# Add a ping/pong mechanism to keep connections alive
@socketio.on('ping')
def handle_ping(data):
    logging.debug(f"Ping received from {request.sid}: {data}")
    emit('pong', {'timestamp': time.time()})

# Request status handler
@socketio.on('request_status')
def handle_status_request(data):
    if 'task_id' in data:
        task_id = data['task_id']
        logging.info(f"Status request for task {task_id} from {request.sid}")
        
        # Get task data
        task = get_task(task_id)
        if task:
            # Convert stats for serialization if needed
            stats = task.stats
            if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                stats = stats.to_dict()
            elif hasattr(stats, '__dict__'):
                stats = stats.__dict__
            
            # Send current status
            emit('progress_update', {
                'task_id': task_id,
                'status': task.status,
                'progress': task.progress,
                'stats': stats,
                'message': f"Current progress: {task.progress}%"
            })
        else:
            emit('task_error', {
                'task_id': task_id,
                'error': f"Task with ID {task_id} not found"
            })

# Improved task completion emission
def emit_task_completion(task_id, output_file, stats, broadcast=False):
    """Emit task completion event without forcing disconnection."""
    try:
        data = {
            'task_id': task_id,
            'output_file': output_file,
            'stats': stats
        }
        
        # If stats object has to_dict method, use it
        if hasattr(stats, 'to_dict') and callable(stats.to_dict):
            data['stats'] = stats.to_dict()
        elif hasattr(stats, '__dict__'):
            # Fallback to __dict__
            data['stats'] = stats.__dict__
            
        socketio.emit('task_completed', data, broadcast=broadcast)
        logging.info(f"Task completion event emitted for task {task_id}")
    except Exception as e:
        logging.error(f"Error emitting task completion: {str(e)}")

# Progress update emission
def emit_progress(task_id, progress, message=None, stats=None):
    """Emit progress update with proper serialization."""
    try:
        data = {
            'task_id': task_id,
            'progress': progress,
            'message': message or f"Progress: {progress}%"
        }
        
        # Add stats if provided
        if stats:
            # If stats object has to_dict method, use it
            if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                data['stats'] = stats.to_dict()
            elif hasattr(stats, '__dict__'):
                # Fallback to __dict__
                data['stats'] = stats.__dict__
            elif isinstance(stats, dict):
                data['stats'] = stats
        
        socketio.emit('progress_update', data)
        logging.debug(f"Progress update emitted for task {task_id}: {progress}%")
    except Exception as e:
        logging.error(f"Error emitting progress update: {str(e)}")

# Error emission
def emit_task_error(task_id, error_message, details=None):
    """Emit task error with proper formatting."""
    try:
        data = {
            'task_id': task_id,
            'error': error_message
        }
        
        if details:
            data['details'] = details
            
        socketio.emit('task_error', data)
        logging.error(f"Task error emitted for task {task_id}: {error_message}")
    except Exception as e:
        logging.error(f"Error emitting task error: {str(e)}")

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
# Global Constants & Configuration
# ----------------------------------------------------------------------------
RESEARCH_DOMAINS = ["arxiv.org", "springer.com", "ieee.org", "researchgate.net", "academia.edu", "sciencedirect.com"]
# Better handling of output folder path and permissions
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER")
if not DEFAULT_OUTPUT_FOLDER:
    # Fallback to a directory we know should exist
    DEFAULT_OUTPUT_FOLDER = os.path.join(os.path.expanduser("~"), "Documents")
    logger.info(f"DEFAULT_OUTPUT_FOLDER not set in environment, using: {DEFAULT_OUTPUT_FOLDER}")

# Check if path exists and is writable
try:
    if not os.path.exists(DEFAULT_OUTPUT_FOLDER):
        os.makedirs(DEFAULT_OUTPUT_FOLDER, exist_ok=True)
        logger.info(f"Created output directory: {DEFAULT_OUTPUT_FOLDER}")
    
    # Test write permissions
    test_file = os.path.join(DEFAULT_OUTPUT_FOLDER, ".write_test")
    with open(test_file, 'w') as f:
        f.write("test")
    os.remove(test_file)
    logger.info(f"Verified write permissions for: {DEFAULT_OUTPUT_FOLDER}")
except (IOError, OSError, PermissionError) as e:
    logger.error(f"Cannot write to DEFAULT_OUTPUT_FOLDER {DEFAULT_OUTPUT_FOLDER}: {e}")
    # Try fallback to temp directory
    try:
        import tempfile
        DEFAULT_OUTPUT_FOLDER = tempfile.gettempdir()
        logger.warning(f"Falling back to temp directory: {DEFAULT_OUTPUT_FOLDER}")
    except Exception as e2:
        logger.critical(f"Could not set up fallback temp directory: {e2}")
DEFAULT_OUTPUT_PATH = os.environ.get("DEFAULT_OUTPUT_PATH", os.path.join(os.path.expanduser("~"), "Documents"))
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", "5"))
API_KEYS = os.environ.get("API_KEYS", "test_key,dev_key").split(",")
API_PORT = os.environ.get("API_PORT", "5025")
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_DEBUG = os.environ.get("API_DEBUG", "False").lower() in ("true", "1", "t")
API_URL = f"http://localhost:{API_PORT}/api/process"
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", "32")) * 1024 * 1024  # Default: 16MB
API_KEYS = os.environ.get("API_KEYS", "test_key,dev_key").split(",")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
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
           
def add_task(task_id, task):
    """Add a task to the active tasks dict."""
    with tasks_lock:
        active_tasks[task_id] = task
    logger.info(f"Added task {task_id} to active tasks.")

def get_task(task_id):
    """Get a task from the active tasks dict."""
    with tasks_lock:
        return active_tasks.get(task_id)

def remove_task(task_id):
    """Remove a task from the active tasks dict."""
    with tasks_lock:
        if task_id in active_tasks:
            del active_tasks[task_id]
            logger.info(f"Removed task {task_id} from active tasks.")

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


class CustomFileStats:
    """
    Enhanced tracking stats during processing tasks with comprehensive PDF metrics and 
    proper attribute initialization to prevent attribute errors.
    Includes JSON serialization support.
    """
    def __init__(self):
        # Core statistics
        self.total_files = 0
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.total_bytes = 0
        self.total_chunks = 0
        self.start_time = time.time()
        self.largest_file_bytes = 0
        self.largest_file_path = ""
        self.ocr_processed_files = 0
        self.extraction_errors = 0       
        
        # PDF-specific metrics
        self.pdf_files = 0
        self.tables_extracted = 0
        self.references_extracted = 0
        
        # Document type metrics
        self.pdf_scanned_count = 0
        self.pdf_academic_count = 0
        self.pdf_report_count = 0
        self.pdf_book_count = 0
        self.pdf_general_count = 0
        
        # Processing metrics
        self.total_processing_time = 0.0
        self.pdf_pages_processed = 0
        self.scanned_pages_processed = 0
        self.pdf_ocr_applied_count = 0
        
        # Performance metrics
        self.processing_start_time = time.time()
        self.processing_end_time = None
        self.avg_file_processing_time = 0.0
        self.total_ocr_time = 0.0
        self.total_extraction_time = 0.0

    def update_largest_file(self, file_path: str, file_size: int) -> None:
        """Update largest file information if current file is larger."""
        if file_size > self.largest_file_bytes:
            self.largest_file_bytes = file_size
            self.largest_file_path = file_path
            
    def update_pdf_metrics(self, document_type: str, tables_count: int = 0, 
                           references_count: int = 0, ocr_applied: bool = False,
                           processing_time: float = 0.0, pages_count: int = 0) -> None:
        """
        Update PDF-specific metrics based on document type and extracted features.
        Added processing_time parameter to track processing times.
        """
        self.pdf_files += 1
        self.tables_extracted += tables_count
        self.references_extracted += references_count
        self.total_processing_time += processing_time
        self.pdf_pages_processed += pages_count
        
        if ocr_applied:
            self.pdf_ocr_applied_count += 1
            self.ocr_processed_files += 1
            # Also increment scanned pages for backward compatibility
            self.scanned_pages_processed += (pages_count or 1)
            
        # Track document type counts
        if document_type == "scan":
            self.pdf_scanned_count += 1
        elif document_type == "academic_paper":
            self.pdf_academic_count += 1
        elif document_type == "report":
            self.pdf_report_count += 1
        elif document_type == "book":
            self.pdf_book_count += 1
        else:
            self.pdf_general_count += 1
    
    def finish_processing(self):
        """Record end time and calculate final stats."""
        self.processing_end_time = time.time()
        
        # Calculate average processing time if files were processed
        if self.processed_files > 0:
            self.avg_file_processing_time = self.total_processing_time / self.processed_files
    
    def to_dict(self):
        """Convert CustomFileStats to a dictionary for JSON serialization."""
        # Create a base dictionary with all attributes
        d = {attr: getattr(self, attr) for attr in dir(self) 
             if not attr.startswith('__') and not callable(getattr(self, attr))}
        
        # Calculate total processing duration if end_time is set
        if self.processing_end_time:
            d["total_duration_seconds"] = self.processing_end_time - self.processing_start_time
        else:
            d["total_duration_seconds"] = time.time() - self.processing_start_time
        
        # Add human-readable processed bytes
        d["human_readable_size"] = self._format_bytes(self.total_bytes)
        d["human_readable_largest_file"] = self._format_bytes(self.largest_file_bytes)
        
        # Add derived metrics for PDFs if we have any
        if self.pdf_files > 0:
            d["avg_tables_per_pdf"] = self.tables_extracted / self.pdf_files
            d["avg_references_per_pdf"] = self.references_extracted / self.pdf_files
            d["avg_processing_time_per_pdf"] = self.total_processing_time / self.pdf_files
            d["pdf_document_types"] = {
                "scanned": self.pdf_scanned_count,
                "academic": self.pdf_academic_count,
                "report": self.pdf_report_count,
                "book": self.pdf_book_count,
                "general": self.pdf_general_count
            }
        
        # Add completion percentage
        if self.total_files > 0:
            d["completion_percentage"] = (self.processed_files / self.total_files) * 100
        
        return d
    
    def _format_bytes(self, size):
        """Format bytes to human-readable format."""
        power = 2**10
        n = 0
        power_labels = {0: '', 1: 'K', 2: 'M', 3: 'G', 4: 'T'}
        while size > power:
            size /= power
            n += 1
        return f"{size:.2f} {power_labels.get(n, '')}B"
    
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
    
class BaseTask:
    """
    Base class for all processing tasks with enhanced progress reporting and error handling.
    Provides consistent interfaces for tasks across all tabs (File Processing, Playlist, Scraper).
    """
    def __init__(self, task_id):
        self.task_id = task_id
        self.progress = 0
        self.status = "pending"
        self.stats = {}
        self.error = None
        self.thread = None
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Minimum time between progress updates
        self.output_file = None
        self.start_time = time.time()
        self.last_update_time = time.time()

    def start(self):
        """
        Start the task in a background thread.
        Should be implemented by subclasses.
        """
        self.status = "processing"
        if hasattr(self, '_process'):
            self.thread = threading.Thread(target=self._process, daemon=True)
            self.thread.start()
        else:
            raise NotImplementedError("Subclasses must implement _process method")

    def emit_progress(self, progress, message=None, stats=None):
        """
        Emit progress updates with rate limiting.
        
        Args:
            progress (int): Progress percentage (0-100)
            message (str, optional): Status message
            stats (dict, optional): Processing statistics
        """
        now = time.time()
        if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
            self.progress = min(progress, 100)
            
            data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status
            }
            
            if message:
                data["message"] = message
                
            if stats:
                data["stats"] = stats
                
            socketio.emit("progress_update", data)
            self.last_emit_time = now
            self.last_update_time = now

    def emit_progress_with_details(self, progress, message=None, stats=None, details=None):
        """
        Emit progress update with optional details through Socket.IO.
        
        Args:
            progress (int): Progress percentage (0-100)
            message (str, optional): Status message
            stats (dict, optional): Processing statistics
            details (dict, optional): Additional task-specific details
        """
        now = time.time()
        # Rate-limit updates to avoid overwhelming clients
        if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
            self.progress = min(progress, 100)
            
            data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status
            }
            
            if message:
                data["message"] = message
                
            if stats:
                data["stats"] = stats
                
            if details:
                # Add any additional details (useful for PDF downloads, etc.)
                data.update(details)
                
            socketio.emit("progress_update", data)
            self.last_emit_time = now
            self.last_update_time = now

    def handle_error(self, error):
        """
        Handle errors in a standardized way with improved details.
        
        Args:
            error: The error to handle (can be string or exception)
        """
        self.error = str(error)
        self.status = "failed"
        logger.error(f"Task {self.task_id} error: {error}")
        
        # Include traceback in debug mode
        if logger.isEnabledFor(logging.DEBUG):
            import traceback
            tb = traceback.format_exc()
            logger.debug(tb)
            error_details = {
                "task_id": self.task_id,
                "error": self.error,
                "traceback": tb,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }
        else:
            error_details = {
                "task_id": self.task_id,
                "error": self.error,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }
        
        # Emit error event with details
        socketio.emit("task_error", error_details)

    def emit_completion(self):
        """
        Emit task completion event with final statistics.
        """
        completion_data = {
            "task_id": self.task_id,
            "status": "completed",
            "progress": 100,
            "stats": self.stats,
            "output_file": self.output_file,
            "duration_seconds": time.time() - self.start_time,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
        socketio.emit("task_completed", completion_data)
        logger.info(f"Task {self.task_id} completed successfully in {completion_data['duration_seconds']:.2f} seconds")

    def cancel(self):
        """
        Cancel the current task.
        """
        if self.thread and self.thread.is_alive():
            # Can't actually kill the thread, but we can set status
            self.status = "cancelled"
            
            # Emit cancellation event
            socketio.emit("task_cancelled", {
                "task_id": self.task_id,
                "message": "Task was cancelled",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            })
            
            logger.info(f"Task {self.task_id} cancelled")
            return True
        return False

    def get_elapsed_time(self):
        """
        Get the elapsed time since the task started.
        
        Returns:
            float: Elapsed time in seconds
        """
        return time.time() - self.start_time

    def get_estimated_time_remaining(self, progress):
        """
        Calculate the estimated time remaining based on current progress.
        
        Args:
            progress (float): Current progress percentage (0-100)
            
        Returns:
            float: Estimated time remaining in seconds or None if not enough data
        """
        if progress <= 0:
            return None
        
        elapsed = self.get_elapsed_time()
        if elapsed < 1 or progress < 1:
            return None
        
        # Calculate time per percentage point
        time_per_point = elapsed / progress
        
        # Estimated time for remaining percentage points
        remaining_percent = 100 - progress
        return time_per_point * remaining_percent

    def get_task_status(self):
        """
        Get a comprehensive status report of the task.
        
        Returns:
            dict: Status information including progress, elapsed time, etc.
        """
        elapsed = self.get_elapsed_time()
        estimated = self.get_estimated_time_remaining(self.progress)
        
        status_data = {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "elapsed_seconds": elapsed,
            "estimated_remaining_seconds": estimated,
            "stats": self.stats,
            "has_error": self.error is not None,
            "error": self.error,
            "output_file": self.output_file
        }
        
        return status_data

class ProcessingTask:
    """
    Enhanced task object for file processing with improved monitoring,
    progress reporting, and error handling capabilities.
    """
    def __init__(self, task_id, input_dir, output_file):
        self.task_id = task_id
        self.input_dir = input_dir
        self.output_file = output_file
        self.status = "pending"
        self.progress = 0
        self.error = None
        self.stats = CustomFileStats() if 'CustomFileStats' in globals() else {}
        self.thread = None
        self.start_time = time.time()
        self.last_update_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds between Socket.IO updates
        self.result = None
        logger.info(f"Created task {task_id} for input: {input_dir}, output: {output_file}")
        
    def start(self):
        """Start the processing task in a background thread."""
        self.status = "processing"
        self.thread = threading.Thread(target=self._process, daemon=True)
        self.thread.start()
        logger.info(f"Started task {self.task_id} in background thread")
    
    def _process(self):
        """
        Main processing function with enhanced error handling and PDF capabilities.
        """
        try:
            logger.info(f"Starting processing for task {self.task_id} - directory: {self.input_dir}")
            
            # Custom progress callback function with rate limiting for UI updates
            def progress_callback(current, total, stage):
                # Calculate progress percentage
                self.progress = min(int((current / max(1, total)) * 100), 99)
                
                # Log progress at debug level
                logger.debug(f"Progress: {self.progress}% - {stage}")
                
                # Emit progress update with rate limiting
                now = time.time()
                if (now - self.last_emit_time) > self.emit_interval:
                    self.emit_progress(stage)
                    self.last_emit_time = now
            
            # Process the files with optimized parameters
            self.result = structify_module.process_all_files(
                root_directory=self.input_dir,
                output_file=self.output_file,
                max_chunk_size=4096,
                executor_type="thread",
                max_workers=None,  # Auto-determine based on CPU count
                stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                use_cache=False,
                valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS if hasattr(structify_module, 'DEFAULT_VALID_EXTENSIONS') else None,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True,
                progress_callback=progress_callback
            )
            
            # Update status and stats
            self.status = "completed"
            self.progress = 100
            
            # Update task stats if available
            if isinstance(self.result, dict) and "stats" in self.result:
                if isinstance(self.stats, dict):
                    self.stats = self.result["stats"]
                elif hasattr(self.stats, '__dict__'):
                    # If we have a CustomFileStats object, update its attributes
                    for key, value in self.result["stats"].items():
                        setattr(self.stats, key, value)
            
            # Add additional stats regardless of result format
            additional_stats = {
                "processing_time": time.time() - self.start_time,
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "input_directory": self.input_dir,
                "output_file": self.output_file
            }
            
            # Apply additional stats based on stats type
            if isinstance(self.stats, dict):
                self.stats.update(additional_stats)
            else:
                # Apply to object attributes
                for key, value in additional_stats.items():
                    setattr(self.stats, key, value)
            
            # Final progress update
            self.emit_progress("completed")
            
            # Emit task completion event
            try:
                # Prepare stats - handle both dictionary and object types
                stats_data = self.stats.__dict__ if hasattr(self.stats, '__dict__') else self.stats
                
                socketio.emit("task_completed", {
                    "task_id": self.task_id,
                    "status": "completed",
                    "message": "Processing completed successfully",
                    "stats": stats_data,
                    "output_file": self.output_file
                })
            except Exception as socket_err:
                logger.debug(f"Socket.IO completion event emission failed: {socket_err}")
            
            logger.info(f"Processing task {self.task_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Error in processing task {self.task_id}: {e}", exc_info=True)
            self.handle_error(str(e))
        
        finally:
            # Remove task from active tasks when finished (success or failure)
            remove_task(self.task_id)
    
    def emit_progress(self, stage="processing"):
        """Emit a progress update via Socket.IO."""
        try:
            # Prepare stats data - handle both dictionary and object types
            stats_data = self.stats.__dict__ if hasattr(self.stats, '__dict__') else self.stats
            
            socketio.emit("progress_update", {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status,
                "message": f"{stage.capitalize()}: {self.progress}%",
                "stats": stats_data,
                "elapsed_time": time.time() - self.start_time
            })
        except Exception as e:
            logger.debug(f"Socket.IO event emission failed: {e}")
    
    def handle_error(self, error_msg):
        """Handle an error during processing."""
        logger.error(f"Error in task {self.task_id}: {error_msg}")
        self.status = "failed"
        self.error = error_msg
        
        # Emit error event
        try:
            socketio.emit("task_error", {
                "task_id": self.task_id,
                "status": "failed", 
                "error": self.error
            })
        except Exception as socket_err:
            logger.debug(f"Socket.IO error event emission failed: {socket_err}")
    
    def cancel(self):
        """
        Cancel the running task.
        Returns True if successfully cancelled, False otherwise.
        """
        if self.thread and self.thread.is_alive():
            self.status = "cancelled"
            
            # Cannot truly kill thread, but we can mark it as cancelled
            # and it will stop at the next progress callback
            try:
                socketio.emit("task_cancelled", {
                    "task_id": self.task_id,
                    "message": "Task was cancelled"
                })
            except Exception as e:
                logger.debug(f"Socket.IO cancel event emission failed: {e}")
                
            logger.info(f"Task {self.task_id} cancelled")
            remove_task(self.task_id)
            return True
        return False
    
    def get_status(self):
        """
        Get the full status of the task.
        Returns a dictionary with all task details.
        """
        # Prepare stats data - handle both dictionary and object types
        stats_data = self.stats.__dict__ if hasattr(self.stats, '__dict__') else self.stats
        
        return {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "input_dir": self.input_dir,
            "output_file": self.output_file,
            "stats": stats_data,
            "error": self.error,
            "elapsed_time": time.time() - self.start_time,
            "is_running": self.thread.is_alive() if self.thread else False
        }

class PlaylistTask(BaseTask):
    """
    Task object for processing YouTube playlists.
    """
    def __init__(self, task_id):
        super().__init__(task_id)
        self.playlists = []
        self.api_key = YOUTUBE_API_KEY
        self.root_directory = None
    
    def start(self, playlists, root_directory, output_file):
        self.playlists = playlists
        self.root_directory = root_directory
        self.output_file = output_file
        self.status = "processing"
        self.thread = threading.Thread(target=self._process, daemon=True)
        self.thread.start()
    
    def _process(self):
        try:
            stats = CustomFileStats()
            total_steps = len(self.playlists) + 1  # playlists + final JSON generation
            
            # Initial progress update
            self.emit_progress(
                progress=5,
                message="Initializing playlist processing...",
                stats=None
            )
            
            downloaded_playlists = []
            
            # Download each playlist
            for idx, playlist in enumerate(self.playlists, start=1):
                logger.info(f"Downloading playlist: {playlist['url']}")
                try:
                    with ThreadPoolExecutor(max_workers=min(10, os.cpu_count() or 1)) as executor:
                        results = download_all_playlists(self.api_key, [playlist])
                        downloaded_playlists.extend(results)
                    
                    progress = int((idx / total_steps) * 90)  # First 90% for downloads
                    self.emit_progress(
                        progress=progress,
                        message=f"Downloaded playlist {idx}/{len(self.playlists)}",
                        stats=None
                    )
                    
                except Exception as e:
                    logger.error(f"Error downloading playlist {playlist['url']}: {e}")
                    self.handle_error(f"Failed to download playlist {playlist['url']}: {str(e)}")
                    return
            
            # Generate final JSON
            self.emit_progress(
                progress=90,
                message="Generating JSON output...",
                stats=None
            )
            
            try:
                result = structify_module.process_all_files(
                    root_directory=self.root_directory,
                    output_file=self.output_file,
                    max_chunk_size=4096,
                    executor_type="thread",
                    max_workers=None,
                    stop_words=structify_module.DEFAULT_STOP_WORDS,
                    use_cache=False,
                    valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
                    ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                    stats_only=False,
                    include_binary_detection=True,
                    stats_obj=stats
                )
                
                self.status = "completed"
                self.stats = stats.to_dict()
                
                # Add playlist-specific stats
                self.stats["total_playlists"] = len(self.playlists)
                self.stats["total_videos"] = sum(len(p.get("videos", [])) for p in downloaded_playlists)
                
                socketio.emit("task_completed", {
                    "task_id": self.task_id,
                    "output_file": self.output_file,
                    "stats": self.stats
                })
                
                logger.info(f"Playlist task {self.task_id} completed successfully")
                
            except Exception as e:
                logger.error(f"Error generating JSON: {e}")
                self.handle_error(f"Failed to generate JSON output: {str(e)}")
                
        except Exception as e:
            self.handle_error(f"Unexpected error in playlist task: {str(e)}")

class ScraperTask(BaseTask):
    """
    Enhanced task object for web scraping with PDF download support:
      1) Download/extract each URL into a user-specified root directory.
      2) Run Structify on that directory to produce a final JSON.
      
    Features:
      - Parallel PDF downloading with controlled concurrency
      - Robust error handling and recovery
      - Detailed progress tracking with memory-efficient updates
      - Resource management and cleanup
      - Support for task cancellation
      - Advanced PDF processing options
    """
    def __init__(self, task_id):
        super().__init__(task_id)
        self.pdf_downloads = []  # Track PDF downloads
        self.output_folder = None
        self.root_directory = None
        self.url_configs = []
        self.is_cancelled = False
        self.processed_urls = 0
        self.successful_urls = 0
        self.failed_urls = 0
        self.pdf_downloads_count = 0
        self.running_futures = set()  # Track active futures for cancellation
        self.lock = threading.RLock()  # For thread-safe operations
        self.pdf_options = {}  # Store PDF processing options
        self.last_progress_time = 0  # For rate-limiting progress updates

    def start(self, url_configs, root_directory, output_file):
        """Start the scraping task in a background thread with enhanced tracking."""
        self.root_directory = os.path.abspath(root_directory)
        self.output_file = output_file
        self.url_configs = url_configs
        self.output_folder = root_directory
        self.status = "processing"
        self.processed_urls = 0
        self.successful_urls = 0
        self.failed_urls = 0
        
        # Create and start the worker thread
        self.thread = threading.Thread(
            target=self._scrape_and_structify,
            args=(url_configs, root_directory, output_file),
            daemon=True
        )
        self.thread.start()
        
        logger.info(f"Started scraping task {self.task_id} with {len(url_configs)} URLs")
        return self.task_id

    def _scrape_and_structify(self, url_configs, root_directory, output_file):
        """Core processing function with improved error handling and performance."""
        try:
            # Initialize tracking
            total_steps = len(url_configs) + 1  # one additional step for final processing
            current_step = 0
            stats = CustomFileStats()
            self.pdf_downloads_count = 0
            start_time = time.time()
            self.last_progress_time = time.time()

            # Validate dependencies
            if not structify_module:
                raise ImportError("Claude module not available for processing")

            # Ensure output directory exists
            os.makedirs(root_directory, exist_ok=True)
            logger.info(f"Ensured root directory exists: {root_directory}")

            # Initial progress update
            self.emit_progress(
                progress=5,
                message="Initializing scraper...",
                stats=self.stats,
                pdf_downloads=self.pdf_downloads
            )

            # Process URLs in parallel with controlled concurrency
            results = []
            successful_urls = 0
            failed_urls = 0
            
            # Dynamically adjust workers based on URL count and CPU resources
            max_workers = min(max(2, os.cpu_count() // 2), len(url_configs), 6)
            logger.info(f"Using {max_workers} workers for URL processing")
            
            # Add checkpoint/heartbeat monitoring
            self.last_progress_time = time.time()
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Create and track futures
                futures = {}
                for i, cfg in enumerate(url_configs):
                    if self.is_cancelled:
                        logger.info(f"Task {self.task_id} was cancelled during submission")
                        break
                        
                    future = executor.submit(
                        self._process_url_with_tracking,
                        cfg["url"],
                        cfg["setting"].lower(),
                        cfg.get("keyword", ""),
                        root_directory
                    )
                    futures[future] = i
                    with self.lock:
                        self.running_futures.add(future)
                
                # Process completed futures as they finish
                for fut in as_completed(futures):
                    if self.is_cancelled:
                        # Cancel any remaining futures if possible
                        for f in list(self.running_futures):
                            f.cancel()
                        break
                    
                    # Get result and update tracking
                    try:
                        res = fut.result()
                        with self.lock:
                            if fut in self.running_futures:
                                self.running_futures.remove(fut)
                                
                        # Update statistics
                        if res:
                            if "error" not in res:
                                successful_urls += 1
                                if "pdf_file" in res:
                                    self.pdf_downloads_count += 1
                            else:
                                failed_urls += 1
                        else:
                            failed_urls += 1
                            
                    except Exception as ex:
                        logger.error(f"Error processing URL: {ex}")
                        res = {"error": str(ex), "url": url_configs[futures[fut]].get("url", "unknown")}
                        failed_urls += 1
                    
                    # Update progress and add result
                    results.append(res)
                    current_step += 1
                    self.processed_urls = current_step
                    self.successful_urls = successful_urls
                    self.failed_urls = failed_urls
                    
                    # Update progress (with rate limiting handled in emit_progress)
                    self.emit_progress(
                        progress=int((current_step / total_steps) * 90),  # Max 90% for URL processing
                        message=f"Processed {current_step}/{len(url_configs)} URLs",
                        stats={"processed": current_step, "successful": successful_urls, "failed": failed_urls},
                        pdf_downloads=self.pdf_downloads
                    )
                    self.last_progress_time = time.time()
                    
                    # Check for memory issues and trigger garbage collection if needed
                    try:
                        import psutil
                        process = psutil.Process()
                        memory_info = process.memory_info()
                        memory_percent = process.memory_percent()
                        if memory_percent > 80:  # High memory usage
                            logger.warning(f"High memory usage detected ({memory_percent:.1f}%). Running garbage collection.")
                            import gc
                            gc.collect()
                    except ImportError:
                        pass  # psutil not available

            # Check if task was cancelled
            if self.is_cancelled:
                logger.info(f"Task {self.task_id} was cancelled during URL processing")
                self.status = "cancelled"
                self.emit_progress(
                    progress=100,
                    message="Task cancelled",
                    stats={"processed": current_step, "successful": successful_urls, "failed": failed_urls},
                    pdf_downloads=self.pdf_downloads
                )
                return

            # Final structify processing with improved error handling
            self.emit_progress(
                progress=90,
                message="Generating final JSON via Structify...",
                stats={"processed": current_step, "successful": successful_urls, "failed": failed_urls},
                pdf_downloads=self.pdf_downloads
            )

            # Get absolute path for output file
            final_json = os.path.abspath(output_file)
            
            # Enhanced progress callback for Structify
            def structify_progress_callback(current, total, stage):
                if self.is_cancelled:
                    return
                    
                # Calculate progress for the final 10%
                if total > 0:
                    percent = 90 + int((current / total) * 10)
                else:
                    percent = 95
                    
                self.emit_progress(
                    progress=min(percent, 99),
                    message=f"Processing final output: {stage}",
                    stats={"processed": len(url_configs), "successful": successful_urls, "failed": failed_urls},
                    pdf_downloads=self.pdf_downloads
                )
                self.last_progress_time = time.time()

            # Process all files in the root_directory with retry
            max_retries = 2
            for attempt in range(max_retries + 1):
                try:
                    # Process files with appropriate filtering
                    result = structify_module.process_all_files(
                        root_directory=root_directory,
                        output_file=final_json,
                        max_chunk_size=4096,
                        executor_type="thread",
                        max_workers=None,
                        stop_words=structify_module.DEFAULT_STOP_WORDS,
                        use_cache=False,
                        valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
                        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                        stats_only=False,
                        include_binary_detection=True,
                        progress_callback=structify_progress_callback,
                        stats_obj=stats
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    if attempt < max_retries:
                        logger.warning(f"Structify processing attempt {attempt+1} failed, retrying: {e}")
                        time.sleep(1)  # Brief delay before retry
                    else:
                        raise  # Re-raise on final attempt

            # Check again if task was cancelled
            if self.is_cancelled:
                logger.info(f"Task {self.task_id} was cancelled during final processing")
                self.status = "cancelled"
                self.emit_progress(
                    progress=100,
                    message="Task cancelled",
                    stats={"processed": current_step, "successful": successful_urls, "failed": failed_urls},
                    pdf_downloads=self.pdf_downloads
                )
                return

            # Update task status and stats
            self.stats = stats.to_dict()
            self.status = "completed"
            
            # Include detailed statistics
            processing_time = time.time() - start_time
            self.stats.update({
                "total_urls": len(url_configs),
                "successful_urls": successful_urls,
                "failed_urls": failed_urls,
                "pdf_downloads": self.pdf_downloads_count,
                "processing_time_seconds": processing_time,
                "urls_per_second": len(url_configs) / processing_time if processing_time > 0 else 0,
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
            })

            # Emit task_completed event with comprehensive info
            socketio.emit("task_completed", {
                "task_id": self.task_id,
                "output_file": final_json,
                "output_folder": root_directory,
                "stats": self.stats,
                "pdf_downloads": self.pdf_downloads,
                "message": f"Successfully processed {successful_urls} URLs with {self.pdf_downloads_count} PDF downloads"
            })
            
            logger.info(f"Scraping & structify completed in {processing_time:.2f}s. JSON at {final_json}")
            
        except Exception as e:
            logger.error(f"ScraperTask error: {str(e)}", exc_info=True)
            self.handle_error(f"ScraperTask error: {str(e)}")
            
        finally:
            # Ensure resources are cleaned up
            with self.lock:
                for future in list(self.running_futures):
                    future.cancel()
                self.running_futures.clear()
   
    def _process_url_with_tracking(self, url, setting, keyword, output_folder):
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
                                    
                                    # Get PDF options
                                    pdf_options = getattr(self, 'pdf_options', {})
                                    extract_tables = pdf_options.get('extract_tables', True)
                                    use_ocr = pdf_options.get('use_ocr', True)
                                    extract_structure = pdf_options.get('extract_structure', True)
                                    chunk_size = pdf_options.get('chunk_size', 4096)
                                    
                                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                                    apply_ocr = use_ocr or (doc_type == "scan")
                                    
                                    # Process PDF with enhanced capabilities
                                    pdf_result = structify_module.process_pdf(
                                        pdf_path=pdf_file,
                                        output_path=json_output,
                                        max_chunk_size=chunk_size,
                                        extract_tables=extract_tables,
                                        use_ocr=apply_ocr,
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
   
    def emit_progress(self, progress, message=None, stats=None, pdf_downloads=None):
        """Emit progress with rate limiting and memory efficiency."""
        now = time.time()
        if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
            self.progress = min(progress, 100)
            
            # Build minimal data payload
            data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status
            }
            
            if message:
                data["message"] = message
                
            if stats:
                data["stats"] = stats
                
            # Include PDF downloads with optional memory optimization
            if pdf_downloads:
                # If there are many PDF downloads, we might want to limit what we send
                if len(pdf_downloads) > 50:
                    # Send only the first few, the last few, and any in-progress or error states
                    active_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] in ("downloading", "processing", "error")]
                    completed_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] == "success"]
                    
                    # Take first 10, last 10, and all active ones
                    first_pdfs = pdf_downloads[:10]
                    last_pdfs = pdf_downloads[-10:] if len(pdf_downloads) > 10 else []
                    
                    # Combine with priority to active ones
                    selected_pdfs = list(set(first_pdfs + last_pdfs + active_pdfs))
                    
                    # Sort by original order
                    pdf_indices = {pdf["url"]: i for i, pdf in enumerate(pdf_downloads)}
                    selected_pdfs.sort(key=lambda pdf: pdf_indices.get(pdf.get("url", ""), 0))
                    
                    # Add summary
                    data["pdf_downloads"] = selected_pdfs
                    data["pdf_downloads_summary"] = {
                        "total": len(pdf_downloads),
                        "completed": len(completed_pdfs),
                        "active": len(active_pdfs),
                        "showing": len(selected_pdfs)
                    }
                else:
                    data["pdf_downloads"] = pdf_downloads
            
            # Send the update
            try:
                socketio.emit("progress_update", data)
                self.last_emit_time = now
                self.last_update_time = now
            except Exception as e:
                logger.debug(f"Socket.IO emission failed: {e}")
    
    def cancel(self):
        """
        Enhanced cancellation with resource cleanup.
        Returns True if successfully initiated cancellation.
        """
        if not self.is_cancelled and self.status != "completed":
            self.is_cancelled = True
            self.status = "cancelling"
            
            # Cancel any running futures
            with self.lock:
                for future in list(self.running_futures):
                    future.cancel()
            
            # Emit cancellation event
            try:
                socketio.emit("task_cancelled", {
                    "task_id": self.task_id,
                    "message": "Task cancellation requested"
                })
            except Exception as e:
                logger.debug(f"Socket.IO cancel emission failed: {e}")
                
            logger.info(f"Task {self.task_id} cancellation requested")
            return True
        return False
    
    def get_stats(self):
        """Get comprehensive statistics about the task."""
        # Create a detailed stats object including task-specific metrics
        stats = {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "elapsed_time": time.time() - self.start_time,
            "total_urls": len(self.url_configs),
            "processed_urls": self.processed_urls,
            "successful_urls": self.successful_urls,
            "failed_urls": self.failed_urls,
            "pdf_downloads_count": self.pdf_downloads_count,
            "pdf_downloads_status": self._get_pdf_download_stats()
        }
        
        # Include structify stats if available
        if self.stats:
            stats.update(self.stats)
            
        return stats
    
    def _get_pdf_download_stats(self):
        """Calculate PDF download statistics."""
        if not self.pdf_downloads:
            return {"total": 0}
            
        # Count by status
        statuses = {}
        for pdf in self.pdf_downloads:
            status = pdf.get("status", "unknown")
            statuses[status] = statuses.get(status, 0) + 1
            
        return {
            "total": len(self.pdf_downloads),
            "by_status": statuses
        }
        
        

# ----------------------------------------------------------------------------
# Flask Endpoints
# ----------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

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
def detect_path():
    data = request.json or {}
    folder_name = data.get("folderName")
    file_paths = data.get("filePaths", [])
    full_path = data.get("fullPath")
    if not folder_name:
        return structured_error_response("FOLDER_NAME_REQUIRED", "Folder name is required.", 400)
    if full_path:
        norm = os.path.abspath(full_path)
        if os.path.isdir(norm):
            logger.info(f"Verified direct full_path: {norm}")
            return jsonify({"fullPath": norm})
    candidate = Path(folder_name).resolve()
    if candidate.is_dir():
        logger.info(f"Using resolved absolute path: {candidate}")
        return jsonify({"fullPath": str(candidate)})
    if file_paths:
        try:
            normalized_paths = [os.path.abspath(p) for p in file_paths]
            common_base = os.path.commonpath(normalized_paths)
            if os.path.isdir(common_base):
                logger.info(f"Found common directory: {common_base}")
                return jsonify({"fullPath": common_base})
        except ValueError:
            pass
    standard_locs = [Path.cwd(), Path.home() / "Documents", Path.home() / "Desktop",
                     Path.home() / "Downloads", Path.home() / "OneDrive"]
    for base in standard_locs:
        potential = (base / folder_name).resolve()
        if potential.is_dir():
            logger.info(f"Found directory under {base}: {potential}")
            return jsonify({"fullPath": str(potential)})
    logger.warning("Could not automatically detect the folder path.")
    return structured_error_response("PATH_NOT_DETECTED", "Could not automatically detect the folder path.", 404)

# -----------------------------------------------------------------------------
# File Path API Endpoints
# -----------------------------------------------------------------------------

@app.route("/api/verify-path", methods=["POST"])
def verify_path():
    """
    Enhanced API endpoint to validate path with better error handling
    and permissions testing.
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
        
        # Check if it exists
        if os.path.exists(norm_path):
            if os.path.isdir(norm_path):
                # Check if it's writable
                writable = os.access(norm_path, os.W_OK)
                
                return jsonify({
                    "exists": True,
                    "isDirectory": True,
                    "fullPath": norm_path,
                    "canWrite": writable,
                    "parentPath": os.path.dirname(norm_path)
                })
            else:
                # It exists but is not a directory
                return jsonify({
                    "exists": True,
                    "isDirectory": False,
                    "fullPath": norm_path,
                    "parentPath": os.path.dirname(norm_path),
                    "canWrite": False
                })
        else:
            # Path doesn't exist, check parent directory
            parent_path = os.path.dirname(norm_path)
            parent_exists = os.path.isdir(parent_path)
            parent_writable = os.access(parent_path, os.W_OK) if parent_exists else False
            
            return jsonify({
                "exists": False,
                "isDirectory": False,
                "fullPath": norm_path,
                "parentPath": parent_path if parent_exists else None,
                "parentExists": parent_exists,
                "canCreate": parent_writable
            })
    except Exception as e:
        logger.error(f"Error verifying path {path_str}: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/create-directory", methods=["POST"])
def create_directory():
    """
    Create a directory at the specified path.
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
        
        # Check if path already exists
        if os.path.exists(norm_path):
            if os.path.isdir(norm_path):
                return jsonify({
                    "success": True,
                    "path": norm_path,
                    "message": "Directory already exists"
                })
            else:
                return jsonify({
                    "success": False,
                    "message": f"Path exists but is not a directory: {norm_path}"
                }), 400
        
        # Create the directory with parents
        os.makedirs(norm_path, exist_ok=True)
        
        # Verify it was created
        if os.path.isdir(norm_path):
            return jsonify({
                "success": True,
                "path": norm_path,
                "message": "Directory created successfully"
            })
        else:
            return jsonify({
                "success": False,
                "message": f"Failed to create directory: {norm_path}"
            }), 500
    except Exception as e:
        logger.error(f"Error creating directory {path_str}: {e}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


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
def start_processing():
    """
    API endpoint to start processing files in the specified directory.
    Handles JSON or form data input, validates parameters, and creates a processing task.
    
    Expected parameters:
    - input_dir: Directory containing files to process
    - output_file: Optional output filename or full path 
    - output_dir: Optional output directory (ignored if output_file has directory part)
    
    Returns:
        JSON response with task details and status
    """
    try:
        # Get the JSON data from the request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        
        # Ensure temp directory exists
        ensure_temp_directory()
        
        # Extract variables from the request
        input_dir = data.get("input_dir")
        output_file = data.get("output_file")  # Extract output file from request
        output_dir = data.get("output_dir")  # Optional, can be None
        
        # Log the received parameters
        logger.info(f"Processing request: input_dir={input_dir}, output_file={output_file}, output_dir={output_dir}")
        
        # Validate inputs
        if not input_dir:
            logger.warning("Request missing input_dir parameter")
            return jsonify({"error": "Input directory not specified"}), 400
        
        if not output_file:
            # Auto-generate output filename based on input directory if not provided
            output_file = "processed_" + os.path.basename(os.path.normpath(input_dir)) + ".json"
            logger.info(f"No output file specified, generated name: {output_file}")
        
        # Get the full output path
        final_output_path = get_output_filepath(output_file, output_dir)
        logger.info(f"Resolved output path: {final_output_path}")
        
        # Generate a unique task ID
        task_id = str(uuid.uuid4())
        
        # Create and start the processing task
        task = ProcessingTask(task_id, input_dir, final_output_path)
        add_task(task_id, task)
        task.start()
        
        # Return success response
        response = {
            "task_id": task_id,
            "status": "processing",
            "message": "Processing started",
            "input_dir": input_dir,
            "output_file": final_output_path
        }
        
        logger.info(f"Started processing task: {task_id} for input directory: {input_dir}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in start_processing: {str(e)}", exc_info=True)
        return jsonify({
            "error": f"Failed to start processing: {str(e)}",
            "status": "error"
        }), 500


def get_output_filepath(filename, user_defined_dir=None):
    """
    Resolves user-specified output directory or uses default fallback.
    
    Args:
        filename (str): The desired output filename (with or without extension)
        user_defined_dir (str, optional): Override the default output folder
    
    Returns:
        str: Absolute path to the properly named output file
    """
    # Handle potential None input
    if not filename:
        filename = "output"
    
    # Strip .json extension if provided
    if filename.lower().endswith('.json'):
        filename = filename[:-5]
    
    # Sanitize the filename
    sanitized_name = sanitize_filename(filename) + ".json"
    
    # Check if we have a full path in output_filename
    if os.path.dirname(filename):
        # User provided a path with the filename
        target_folder = os.path.dirname(filename)
        sanitized_name = sanitize_filename(os.path.basename(filename)) + ".json"
    else:
        # Use override folder or default to the DEFAULT_OUTPUT_FOLDER
        target_folder = user_defined_dir or DEFAULT_OUTPUT_FOLDER
    
    # Make sure target_folder is defined and is an absolute path
    if not target_folder or not isinstance(target_folder, str):
        logger.warning(f"Invalid target folder: {target_folder}, falling back to DEFAULT_OUTPUT_FOLDER")
        target_folder = DEFAULT_OUTPUT_FOLDER
    
    # Convert to absolute path
    target_folder = os.path.abspath(target_folder)
    
    # If target folder doesn't exist, try to create it
    try:
        if not os.path.isdir(target_folder):
            os.makedirs(target_folder, exist_ok=True)
            logger.info(f"Created output directory: {target_folder}")
    except Exception as e:
        logger.warning(f"Could not create directory {target_folder}: {e}")
        # Fall back to DEFAULT_OUTPUT_FOLDER if we can't create the directory
        target_folder = DEFAULT_OUTPUT_FOLDER
        # Try to ensure this directory exists
        try:
            os.makedirs(target_folder, exist_ok=True)
        except Exception as e2:
            logger.error(f"Cannot create fallback directory {target_folder}: {e2}")
            # Last resort - use temp directory
            import tempfile
            target_folder = tempfile.gettempdir()
    
    # Construct and ensure the final path
    final_output_path = os.path.join(target_folder, sanitized_name)
    
    logger.info(f"Output file will be saved at: {final_output_path}")
    return final_output_path


def resolve_output_path(directory, filename):
    """
    Resolve output path with proper directory creation if needed.
    
    Args:
        directory (str): The directory to save the file in
        filename (str): Output filename
        
    Returns:
        str: Full path to the resolved output file
    """
    # Create the directory if it doesn't exist
    if not os.path.exists(directory):
        try:
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Created directory: {directory}")
        except Exception as e:
            logger.warning(f"Could not create directory {directory}: {e}")
            # Fall back to DEFAULT_OUTPUT_FOLDER
            directory = DEFAULT_OUTPUT_FOLDER
            try:
                os.makedirs(directory, exist_ok=True)
            except Exception as e2:
                logger.error(f"Cannot create fallback directory {directory}: {e2}")
                # Last resort - use temp directory
                import tempfile
                directory = tempfile.gettempdir()
    
    # Return the full path
    return os.path.join(directory, filename)

@app.route("/api/status/<task_id>")
def task_status(task_id):
    """
    Get a comprehensive status report of the task.
    
    Args:
        task_id (str): The unique identifier for the task
        
    Returns:
        JSON response with task status information
    """
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    # Prepare the response data
    response_data = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "error": task.error,
        "start_time": task.start_time,
        "elapsed_seconds": time.time() - task.start_time
    }
    
    # Handle stats conversion for JSON serialization
    if task.stats:
        # If stats is a CustomFileStats object with to_dict method
        if hasattr(task.stats, 'to_dict') and callable(task.stats.to_dict):
            response_data["stats"] = task.stats.to_dict()
        # If stats is already a dict
        elif isinstance(task.stats, dict):
            response_data["stats"] = task.stats
        # Fall back to converting object attributes to dict
        elif hasattr(task.stats, '__dict__'):
            response_data["stats"] = {k: v for k, v in task.stats.__dict__.items() 
                                    if not k.startswith('__') and not callable(v)}
        else:
            # If we can't serialize it, set to empty dict
            response_data["stats"] = {}
            app.logger.warning(f"Could not serialize stats for task {task_id}, using empty dict")
    else:
        response_data["stats"] = {}
    
    # Add output file if available
    if hasattr(task, 'output_file') and task.output_file:
        response_data["output_file"] = task.output_file
    
    # Add estimated time remaining if progress is sufficient
    if task.progress > 0 and task.progress < 100:
        elapsed = time.time() - task.start_time
        if elapsed > 0:
            # Calculate time per percentage point
            time_per_point = elapsed / task.progress
            # Estimated time for remaining percentage points
            remaining_percent = 100 - task.progress
            response_data["estimated_seconds_remaining"] = time_per_point * remaining_percent
    
    # Add human-readable elapsed and estimated time
    response_data["elapsed_time_readable"] = format_time_duration(response_data["elapsed_seconds"])
    if "estimated_seconds_remaining" in response_data:
        response_data["estimated_time_remaining_readable"] = format_time_duration(
            response_data["estimated_seconds_remaining"]
        )
    
    return jsonify(response_data)

def format_time_duration(seconds):
    """Format seconds into a human-readable duration string."""
    if seconds < 60:
        return f"{int(seconds)} seconds"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours} hour{'s' if hours != 1 else ''} {minutes} minute{'s' if minutes != 1 else ''}"

def format_time_duration(seconds):
    """Format seconds into a human-readable duration string."""
    if seconds < 60:
        return f"{int(seconds)} seconds"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours} hour{'s' if hours != 1 else ''} {minutes} minute{'s' if minutes != 1 else ''}"

@app.route("/api/download/<task_id>")
def download_result(task_id):
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    if task.status != "completed":
        return structured_error_response("TASK_INCOMPLETE", "Task is not completed yet.", 409)
    
    if not hasattr(task, 'output_file') or not task.output_file:
        return structured_error_response("FILE_NOT_FOUND", "No output file associated with this task.", 404)
    
    if not os.path.exists(task.output_file):
        return structured_error_response("FILE_NOT_FOUND", "Output file not found on server.", 404)
    
    try:
        return send_from_directory(
            os.path.dirname(task.output_file),
            os.path.basename(task.output_file),
            as_attachment=True,
            download_name=os.path.basename(task.output_file)
        )
    except Exception as e:
        logger.exception(f"Error downloading file {task.output_file}: {e}")
        return structured_error_response("FILE_READ_ERROR", f"Could not read output file: {e}", 500)

@app.route("/download/<path:filename>")
def download_file(filename):
    """Download any file from the default output folder."""
    safe_filename = secure_filename(filename)
    try:
        return send_from_directory(DEFAULT_OUTPUT_FOLDER, safe_filename, as_attachment=True)
    except FileNotFoundError:
        abort(404)
    except Exception as e:
        logger.exception(f"Error downloading file {filename}: {e}")
        abort(500)

@app.route("/api/open/<task_id>")
def open_result_file(task_id):
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    if task.status != "completed":
        return structured_error_response("TASK_INCOMPLETE", "Task is not completed yet.", 409)
    
    if not hasattr(task, 'output_file') or not task.output_file:
        return structured_error_response("FILE_NOT_FOUND", "No output file associated with this task.", 404)
    
    if not os.path.exists(task.output_file):
        return structured_error_response("FILE_NOT_FOUND", "Output file not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(task.output_file)
        else:
            try:
                subprocess.run(["xdg-open", task.output_file], check=False)
            except Exception:
                subprocess.run(["open", task.output_file], check=False)
                
        return jsonify({"success": True, "message": "File opened locally."})
    except Exception as e:
        logger.exception(f"Error opening file {task.output_file}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open file: {e}", 400)

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

@app.route("/api/start-playlists", methods=["POST"])
def start_playlists():
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    raw_playlists = data.get("playlists")
    root_directory = data.get("root_directory")
    output_file = data.get("output_file")
    
    if not raw_playlists or not isinstance(raw_playlists, list):
        return structured_error_response("PLAYLISTS_REQUIRED", "A list of playlist URLs is required.", 400)
    
    if not root_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Root directory is required.", 400)
    
    if not output_file:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output file is required.", 400)
    
    # Ensure output file has proper extension
    if not output_file.lower().endswith('.json'):
        output_file += '.json'
    
    # Convert to absolute paths
    root_directory = os.path.abspath(root_directory)
    output_file = os.path.abspath(output_file)
    
    # Create playlist objects with secure folder names
    playlists = [
        {
            "url": url,
            "folder": os.path.join(root_directory, secure_filename(f"playlist_{idx+1}"))
        }
        for idx, url in enumerate(raw_playlists)
    ]
    
    # Ensure directories exist
    os.makedirs(root_directory, exist_ok=True)
    for playlist in playlists:
        os.makedirs(playlist["folder"], exist_ok=True)
    
    # Create and start the playlist task
    task_id = str(uuid.uuid4())
    playlist_task = PlaylistTask(task_id)
    add_task(task_id, playlist_task)
    playlist_task.start(playlists, root_directory, output_file)
    
    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "message": "Playlist processing started."
    })

# ----------------------------------------------------------------------------
# PDF Download Endpoints
# ----------------------------------------------------------------------------

@app.route("/api/download-pdf", methods=["POST"])
def api_download_pdf():
    """
    Enhanced API endpoint to download a PDF file from a URL to a user-specified folder.
    
    Expected JSON body:
    {
        "url": "https://example.com/paper.pdf",
        "outputFolder": User-selected download directory,
        "outputFilename": User-specified filename (without extension),
        "processFile": true,  # Whether to process the PDF to JSON
        "extractTables": true,  # Whether to extract tables
        "useOcr": true  # Whether to use OCR for scanned content
    }
    
    Returns:
        JSON response with download status, file path, etc.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url = data.get("url")
    output_folder = data.get("outputFolder", DEFAULT_OUTPUT_FOLDER)
    output_filename = data.get("outputFilename")
    process_file = data.get("processFile", True)
    extract_tables = data.get("extractTables", True)
    use_ocr = data.get("useOcr", True)
    
    if not url:
        return structured_error_response("URL_REQUIRED", "PDF URL is required.", 400)
    
    # Ensure output directory exists
    try:
        os.makedirs(output_folder, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creating output directory: {e}")
        return structured_error_response("OUTPUT_DIR_ERROR", f"Failed to create output directory: {str(e)}", 500)
    
    # Create a unique task ID for tracking this download
    download_id = str(uuid.uuid4())
    
    try:
        # Download the PDF using enhanced function
        logger.info(f"Starting PDF download from {url} to {output_folder}")
        
        # Use the enhanced download_pdf function from web_scraper
        pdf_file = download_pdf(url, output_folder)
        
        if pdf_file and os.path.exists(pdf_file):
            # Get file size and other metadata
            file_size = os.path.getsize(pdf_file)
            file_name = os.path.basename(pdf_file)
            
            response_data = {
                "status": "success",
                "message": "PDF downloaded successfully",
                "download_id": download_id,
                "url": url,
                "filePath": pdf_file,
                "fileName": file_name,
                "fileSize": file_size,
                "outputFolder": output_folder
            }
            
            # Process the PDF to JSON if requested
            if process_file and structify_module:
                json_file = None
                try:
                    # Generate a JSON filename based on user preference or PDF name
                    if output_filename:
                        json_filename = f"{output_filename}.json"
                    else:
                        json_filename = os.path.splitext(file_name)[0] + "_processed.json"
                        
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Detect document type to determine if OCR is needed
                    doc_type = None
                    if hasattr(structify_module, 'detect_document_type'):
                        try:
                            doc_type = structify_module.detect_document_type(pdf_file)
                            response_data["documentType"] = doc_type
                        except Exception as e:
                            logger.warning(f"Error detecting document type: {e}")
                    
                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                    apply_ocr = use_ocr or (doc_type == "scan")
                    
                    # Process with process_pdf if available
                    if hasattr(structify_module, 'process_pdf'):
                        result = structify_module.process_pdf(
                            pdf_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=4096,
                            extract_tables=extract_tables,
                            use_ocr=apply_ocr,
                            return_data=True
                        )
                        
                        json_file = json_path
                        
                        # Add summary metrics to response
                        if result:
                            response_data["processingDetails"] = {
                                "tablesExtracted": len(result.get("tables", [])),
                                "referencesExtracted": len(result.get("references", [])),
                                "pageCount": result.get("page_count", 0),
                                "chunksCreated": len(result.get("chunks", []))
                            }
                            
                    else:
                        # Fallback to process_all_files
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            max_chunk_size=4096,
                            executor_type="thread",
                            max_workers=None,
                            stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                            use_cache=False,
                            valid_extensions=[".pdf"],
                            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                            stats_only=False,
                            include_binary_detection=False,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        json_file = json_path
                    
                    # Add JSON file info to response
                    if json_file and os.path.exists(json_file):
                        response_data["jsonFile"] = json_file
                        logger.info(f"PDF processed to JSON: {json_file}")
                        
                        # Generate a quick PDF structure summary
                        summary = analyze_pdf_structure(pdf_file)
                        if summary and "error" not in summary:
                            response_data["pdfStructure"] = summary
                    
                except Exception as e:
                    logger.error(f"Error processing PDF to JSON: {e}")
                    response_data["processingError"] = str(e)
            
            return jsonify(response_data)
        else:
            return structured_error_response("DOWNLOAD_FAILED", "Failed to download PDF file.", 400)
            
    except Exception as e:
       logger.error(f"Error downloading PDF: {e}", exc_info=True)
       return structured_error_response("DOWNLOAD_ERROR", f"Error downloading PDF: {str(e)}", 500)

@app.route("/download-pdf/<path:pdf_path>")
def download_pdf_file(pdf_path):
    """
    Download or view a specific PDF file with enhanced security checks.
    
    Args:
        pdf_path: The path to the PDF file.
        
    Returns:
        The PDF file for download or viewing.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(pdf_path)
        
        # Define allowed directories (can be expanded based on application needs)
        allowed_dirs = [
            DEFAULT_OUTPUT_FOLDER,
            os.path.join(os.path.expanduser("~"), "Documents"),
            app.config.get("UPLOAD_FOLDER", tempfile.mkdtemp())
        ]
        
        # Check if the path is within any allowed directory
        is_allowed = any(os.path.commonpath([abs_path, allowed_dir]) == allowed_dir 
                        for allowed_dir in allowed_dirs if os.path.exists(allowed_dir))
        
        if not is_allowed:
            logger.warning(f"Attempted to access file outside allowed directories: {abs_path}")
            abort(403)  # Forbidden
        
        # Check if file exists
        if not os.path.exists(abs_path):
            logger.warning(f"PDF file not found: {abs_path}")
            abort(404)
        
        # Verify file is a PDF (optional but adds security)
        if not abs_path.lower().endswith('.pdf') and magic_available:
            mime = magic.from_file(abs_path, mime=True)
            if 'application/pdf' not in mime:
                logger.warning(f"File is not a PDF: {abs_path}, mime: {mime}")
                abort(400)  # Bad request
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for PDF content
        response = send_from_directory(
            directory,
            filename,
            mimetype='application/pdf',
            as_attachment=False  # Display in browser instead of downloading
        )
        
        # Add additional security headers
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        logger.info(f"Successfully served PDF file: {filename}")
        return response
        
    except Exception as e:
        logger.error(f"Error serving PDF file: {e}")
        abort(500)

@app.route("/download-file/<path:file_path>")
def download_file_attachment(file_path):
    """
    Force download of a specific file.
    
    Args:
        file_path: The path to the file.
        
    Returns:
        The file as an attachment for download.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(file_path)
        
        # Check if file exists
        if not os.path.exists(abs_path):
            abort(404)
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for attachment download
        return send_from_directory(
            directory, 
            filename,
            as_attachment=True,  # Force download instead of displaying
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file for download: {e}")
        abort(500)

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

@app.route("/api/scrape2", methods=["POST"])
def scrape2():
    """
    Enhanced endpoint for web scraping with PDF download support
    that fully integrates with the advanced frontend options.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url_configs = data.get("urls")
    download_directory = data.get("download_directory")
    output_filename = data.get("outputFilename", "").strip()
    
    # Get enhanced PDF options
    pdf_options = data.get("pdf_options", {})
    process_pdfs = pdf_options.get("process_pdfs", True)
    extract_tables = pdf_options.get("extract_tables", True)
    use_ocr = pdf_options.get("use_ocr", True)
    extract_structure = pdf_options.get("extract_structure", True)
    chunk_size = pdf_options.get("chunk_size", 4096)
    
    if not url_configs or not isinstance(url_configs, list):
        return structured_error_response("URLS_REQUIRED", "A list of URLs is required.", 400)
    
    if not download_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Download directory is required.", 400)
    
    if not output_filename:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output filename is required.", 400)
    
    # Ensure output file has proper extension
    if not output_filename.lower().endswith('.json'):
        output_filename += '.json'
    
    # Convert to absolute path
    download_directory = os.path.abspath(download_directory)
    
    # Get properly formatted output path
    final_json = get_output_filepath(output_filename, folder_override=download_directory)
    
    # Validate and create download directory if it doesn't exist
    if not os.path.isdir(download_directory):
        try:
            os.makedirs(download_directory, exist_ok=True)
            logger.info(f"Created download directory: {download_directory}")
        except Exception as e:
            return structured_error_response("DIR_CREATION_FAILED", f"Could not create download directory: {e}", 500)
    
    # Log the request
    logger.info(f"Starting web scraping with {len(url_configs)} URLs to {download_directory}")
    logger.info(f"Output JSON will be saved to: {final_json}")
    logger.info(f"PDF options: process={process_pdfs}, tables={extract_tables}, ocr={use_ocr}, structure={extract_structure}, chunk_size={chunk_size}")
    
    # Create and start the scraper task with enhanced options
    task_id = str(uuid.uuid4())
    scraper_task = ScraperTask(task_id)
    add_task(task_id, scraper_task)
    
    # Pass the enhanced options to the task
    scraper_task.pdf_options = {
        "process_pdfs": process_pdfs,
        "extract_tables": extract_tables,
        "use_ocr": use_ocr,
        "extract_structure": extract_structure,
        "chunk_size": chunk_size
    }
    
    scraper_task.start(
        url_configs=url_configs,
        root_directory=download_directory,
        output_file=final_json
    )
    
    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "message": "Scraping started",
        "root_directory": download_directory,
        "output_file": final_json
    })
    
@app.route("/api/scrape2/status/<task_id>")
def scrape2_status(task_id):
    """Get the status of a scraping task with PDF download information."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    # Build response with PDF downloads information
    response = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "stats": task.stats,
        "error": task.error,
        "output_file": task.output_file,
        "output_folder": task.output_folder
    }
    
    # Include PDF downloads information if available
    if hasattr(task, 'pdf_downloads') and task.pdf_downloads:
        response["pdf_downloads"] = task.pdf_downloads
    
    return jsonify(response)

@app.route("/api/scrape2/cancel/<task_id>", methods=["POST"])
def cancel_scrape2(task_id):
    """Cancel a scraping task."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    task.status = "cancelled"
    remove_task(task_id)
    
    return jsonify({
        "task_id": task_id,
        "status": "cancelled",
        "message": "ScraperTask cancelled successfully."
    })

# -----------------------------------------------------------------------------
# PDF PROCESSING ENDPOINTS
# -----------------------------------------------------------------------------

@app.route("/api/pdf/process", methods=["POST"])
def process_pdf_endpoint():
    """
    API endpoint to process a PDF file using structured extraction capabilities.
    
    Expected JSON input:
    {
        "pdf_path": Path to PDF file,
        "output_dir": Output directory (optional),
        "extract_tables": Whether to extract tables (default: true),
        "use_ocr": Whether to use OCR for scanned content (default: true)
    }
    """
    if not request.is_json:
        return structured_error_response("INVALID_REQUEST", "JSON request expected", 400)
    
    data = request.get_json()
    pdf_path = data.get('pdf_path')
    output_dir = data.get('output_dir')
    extract_tables = data.get('extract_tables', True)
    use_ocr = data.get('use_ocr', True)
    
    if not pdf_path:
        return structured_error_response("PATH_REQUIRED", "PDF file path is required", 400)
    
    try:
        # Validate file existence
        if not os.path.isfile(pdf_path):
            return structured_error_response("FILE_NOT_FOUND", f"PDF file not found: {pdf_path}", 404)
        
        # Validate file is actually a PDF
        if not pdf_path.lower().endswith('.pdf'):
            return structured_error_response("INVALID_FILE", "File is not a PDF", 400)
            
        # Generate output path if needed
        if output_dir:
            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)
            base_name = os.path.splitext(os.path.basename(pdf_path))[0]
            output_path = os.path.join(output_dir, f"{base_name}_processed.json")
        else:
            output_path = None  # Will be derived in process_pdf
            
        # Generate a task ID for tracking
        task_id = str(uuid.uuid4())
        
        # Process the PDF in a background thread to avoid blocking
        def process_pdf_thread():
            try:
                # Add task to active_tasks for tracking
                task_data = {
                    "type": "pdf_processing",
                    "pdf_path": pdf_path,
                    "output_path": output_path,
                    "start_time": time.time(),
                    "status": "processing"
                }
                
                with tasks_lock:
                    active_tasks[task_id] = task_data
                
                # Emit initial status via SocketIO
                try:
                    socketio.emit("pdf_processing_start", {
                        "task_id": task_id,
                        "file_path": pdf_path,
                        "file_name": os.path.basename(pdf_path),
                        "status": "processing",
                        "timestamp": time.time()
                    })
                except Exception as socket_err:
                    logger.debug(f"Socket.IO emission failed: {socket_err}")
                
                # Process the PDF using either pdf_extractor or structify_module
                if pdf_extractor_available:
                    result = pdf_extractor.process_pdf(
                        pdf_path=pdf_path,
                        output_path=output_path,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True
                    )
                elif structify_available and hasattr(structify_module, 'process_pdf'):
                    result = structify_module.process_pdf(
                        pdf_path=pdf_path,
                        output_path=output_path,
                        max_chunk_size=4096,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True
                    )
                else:
                    result = {
                        "status": "error",
                        "error": "No PDF processing module available"
                    }
                
                # Update task status
                with tasks_lock:
                    if task_id in active_tasks:
                        active_tasks[task_id]["status"] = "completed" if result and result.get("status") == "success" else "error"
                        active_tasks[task_id]["end_time"] = time.time()
                        active_tasks[task_id]["result"] = result
                
                # Emit completion event via SocketIO
                try:
                    completion_data = {
                        "task_id": task_id,
                        "status": "completed" if result and result.get("status") == "success" else "error",
                        "file_path": pdf_path,
                        "output_path": result.get("output_file", output_path) if result else output_path,
                        "timestamp": time.time()
                    }
                    
                    if result:
                        # Add additional data for UI
                        completion_data.update({
                            "document_type": result.get("document_type", "unknown"),
                            "page_count": result.get("page_count", 0),
                            "tables_count": len(result.get("tables", [])),
                            "references_count": len(result.get("references", [])),
                            "chunks_count": len(result.get("chunks", [])),
                            "processing_time": result.get("processing_info", {}).get("elapsed_seconds", 0)
                        })
                        
                        if result.get("status") != "success":
                            completion_data["error"] = result.get("processing_info", {}).get("error", "Unknown error")
                    
                    socketio.emit("pdf_processing_complete", completion_data)
                except Exception as socket_err:
                    logger.debug(f"Socket.IO completion emission failed: {socket_err}")
                    
            except Exception as e:
                logger.error(f"Error processing PDF {pdf_path}: {e}", exc_info=True)
                
                # Update task status to error
                with tasks_lock:
                    if task_id in active_tasks:
                        active_tasks[task_id]["status"] = "error"
                        active_tasks[task_id]["error"] = str(e)
                        active_tasks[task_id]["end_time"] = time.time()
                
                # Emit error event
                try:
                    socketio.emit("pdf_processing_error", {
                        "task_id": task_id,
                        "file_path": pdf_path,
                        "error": str(e),
                        "timestamp": time.time()
                    })
                except Exception as socket_err:
                    logger.debug(f"Socket.IO error emission failed: {socket_err}")
                    
                # Remove task from active tasks when finished
                remove_task(task_id)
        
        # Start processing thread
        thread = threading.Thread(target=process_pdf_thread, daemon=True)
        thread.start()
        
        # Return immediate response with task ID
        return jsonify({
            "status": "processing",
            "message": "PDF processing started",
            "task_id": task_id,
            "pdf_file": pdf_path,
            "file_name": os.path.basename(pdf_path)
        })
        
    except Exception as e:
        logger.error(f"Error initiating PDF processing for {pdf_path}: {e}", exc_info=True)
        return structured_error_response("SERVER_ERROR", f"PDF processing error: {str(e)}", 500)
    
@app.route("/api/pdf/extract-tables", methods=["POST"])
def extract_pdf_tables():
    """
    API endpoint to extract tables from a PDF file.
    
    Expected JSON input:
    {
        "pdf_path": "path/to/file.pdf",
        "page_range": [1, 5]  # Optional
    }
    """
    if not request.is_json:
        return structured_error_response("INVALID_REQUEST", "JSON request expected", 400)
    
    data = request.get_json()
    pdf_path = data.get('pdf_path')
    page_range = data.get('page_range')
    
    if not pdf_path:
        return structured_error_response("PATH_REQUIRED", "PDF file path is required", 400)
    
    try:
        # Check if file exists
        if not os.path.isfile(pdf_path):
            return structured_error_response("FILE_NOT_FOUND", f"PDF file not found: {pdf_path}", 404)
        
        # Check if pdf_extractor module is available
        if 'pdf_extractor' not in sys.modules:
            try:
                import pdf_extractor
                pdf_extractor_available = True
            except ImportError:
                return structured_error_response("MODULE_ERROR", "PDF processing module not available", 500)
        
        # Convert page_range to tuple if provided
        page_range_tuple = None
        if page_range and isinstance(page_range, list) and len(page_range) == 2:
            page_range_tuple = (int(page_range[0]), int(page_range[1]))
        
        # Extract tables with progress tracking
        start_time = time.time()
        tables = pdf_extractor.extract_tables_from_pdf(pdf_path, page_range=page_range_tuple)
        processing_time = time.time() - start_time
        
        return jsonify({
            "status": "success",
            "pdf_path": pdf_path,
            "file_name": os.path.basename(pdf_path),
            "tables_count": len(tables),
            "tables": tables,
            "processing_time": processing_time
        })
        
    except Exception as e:
        logger.error(f"Error extracting tables from PDF {pdf_path}: {e}", exc_info=True)
        return structured_error_response("SERVER_ERROR", f"Table extraction error: {str(e)}", 500)

@app.route("/api/pdf/detect-type", methods=["POST"])
def detect_pdf_type():
    """
    API endpoint to detect the type of a PDF document.
    
    Expected JSON input:
    {
        "pdf_path": "path/to/file.pdf"
    }
    """
    if not request.is_json:
        return structured_error_response("INVALID_REQUEST", "JSON request expected", 400)
    
    data = request.get_json()
    pdf_path = data.get('pdf_path')
    
    if not pdf_path:
        return structured_error_response("PATH_REQUIRED", "PDF file path is required", 400)
    
    try:
        # Check if file exists
        if not os.path.isfile(pdf_path):
            return structured_error_response("FILE_NOT_FOUND", f"PDF file not found: {pdf_path}", 404)
        
        # Check if pdf_extractor module is available
        if 'pdf_extractor' not in sys.modules:
            try:
                import pdf_extractor
                pdf_extractor_available = True
            except ImportError:
                return structured_error_response("MODULE_ERROR", "PDF processing module not available", 500)
        
        # Detect document type
        start_time = time.time()
        doc_type = pdf_extractor.detect_document_type(pdf_path)
        processing_time = time.time() - start_time
        
        return jsonify({
            "status": "success",
            "pdf_path": pdf_path,
            "file_name": os.path.basename(pdf_path),
            "document_type": doc_type,
            "is_scanned": doc_type == "scan",
            "processing_time": processing_time
        })
        
    except Exception as e:
        logger.error(f"Error detecting PDF type for {pdf_path}: {e}", exc_info=True)
        return structured_error_response("SERVER_ERROR", f"Type detection error: {str(e)}", 500)

@app.route("/api/pdf/analyze", methods=["POST"])
def analyze_pdf_endpoint():
    """
    API endpoint to analyze a PDF file and return comprehensive information about it.
    
    Expected JSON input:
    {
        "pdf_path": "path/to/file.pdf"
    }
    
    Returns:
        JSON with comprehensive PDF analysis
    """
    if not request.is_json:
        return structured_error_response("INVALID_REQUEST", "JSON request expected", 400)
    
    data = request.get_json()
    pdf_path = data.get('pdf_path')
    
    if not pdf_path:
        return structured_error_response("PATH_REQUIRED", "PDF file path is required", 400)
    
    try:
        # Check if file exists
        if not os.path.isfile(pdf_path):
            return structured_error_response("FILE_NOT_FOUND", f"PDF file not found: {pdf_path}", 404)
        
        # Check if pdf_extractor module is available
        if 'pdf_extractor' not in sys.modules:
            try:
                import pdf_extractor
                pdf_extractor_available = True
            except ImportError:
                return structured_error_response("MODULE_ERROR", "PDF processing module not available", 500)
        
        # Generate a task ID for tracking expensive operations
        task_id = str(uuid.uuid4())
        
        # Use pdf_extractor's get_pdf_summary function if available
        start_time = time.time()
        
        if hasattr(pdf_extractor, 'get_pdf_summary'):
            summary = pdf_extractor.get_pdf_summary(pdf_path)
            processing_time = time.time() - start_time
            
            # Add additional metadata
            summary.update({
                "status": "success",
                "file_name": os.path.basename(pdf_path),
                "processing_time": processing_time,
                "task_id": task_id
            })
            
            return jsonify(summary)
        else:
            # Fallback to basic analysis
            doc_type = pdf_extractor.detect_document_type(pdf_path)
            basic_data = pdf_extractor.extract_text_from_pdf(pdf_path)
            
            analysis = {
                "status": "success",
                "task_id": task_id,
                "pdf_path": pdf_path,
                "file_name": os.path.basename(pdf_path),
                "file_size": os.path.getsize(pdf_path),
                "file_size_mb": round(os.path.getsize(pdf_path) / (1024 * 1024), 2),
                "analysis_timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "document_type": doc_type,
                "metadata": basic_data.get("metadata", {}),
                "page_count": basic_data.get("page_count", 0),
                "has_scanned_content": basic_data.get("has_scanned_content", False),
                "extraction_method": basic_data.get("extraction_method", "unknown"),
                "processing_time": time.time() - start_time
            }
            
            # Add text preview
            full_text = basic_data.get("full_text", "")
            if full_text:
                # Get first few paragraphs
                paragraphs = re.split(r'\n\s*\n', full_text)
                preview_text = "\n\n".join(paragraphs[:3]) if paragraphs else ""
                
                # Limit to a reasonable size
                if len(preview_text) > 500:
                    preview_text = preview_text[:497] + "..."
                    
                analysis["preview"] = preview_text
                analysis["text_length"] = len(full_text)
                analysis["word_count"] = len(re.findall(r'\b\w+\b', full_text))
                analysis["estimated_reading_time_mins"] = max(1, analysis["word_count"] // 200)
            
            return jsonify(analysis)
        
    except Exception as e:
        logger.error(f"Error analyzing PDF {pdf_path}: {e}", exc_info=True)
        return structured_error_response("SERVER_ERROR", f"PDF analysis error: {str(e)}", 500)

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

@socketio.on('pdf_download_start')
def handle_pdf_download_start(data):
    """Handle PDF download start event."""
    logger.debug(f"PDF download start: {data}")
    
    url = data.get('url')
    task_id = data.get('task_id')
    
    if not url or not task_id:
        emit('pdf_download_error', {
            'error': 'Missing URL or task ID',
            'task_id': task_id
        })
        return
    
    # Get the task
    task = get_task(task_id)
    if not task:
        emit('pdf_download_error', {
            'error': 'Task not found',
            'task_id': task_id
        })
        return
    
    # Emit progress update
    emit('pdf_download_progress', {
        'task_id': task_id,
        'url': url,
        'progress': 0,
        'status': 'downloading',
        'message': 'Starting PDF download...'
    })

@socketio.on('pdf_download_progress')
def handle_pdf_download_progress(data):
    """Handle PDF download progress event."""
    logger.debug(f"PDF download progress: {data}")
    
    url = data.get('url')
    task_id = data.get('task_id')
    progress = data.get('progress', 0)
    
    if not url or not task_id:
        return
    
    # Emit progress update
    emit('pdf_download_progress', {
        'task_id': task_id,
        'url': url,
        'progress': progress,
        'status': 'downloading',
        'message': f'Downloading PDF: {progress}%'
    })

@socketio.on('pdf_download_complete')
def handle_pdf_download_complete(data):
    """Handle PDF download complete event."""
    logger.debug(f"PDF download complete: {data}")
    
    url = data.get('url')
    task_id = data.get('task_id')
    file_path = data.get('file_path')
    
    if not url or not task_id:
        return
    
    emit('pdf_download_progress', {
        'task_id': task_id,
        'url': url,
        'progress': 100,
        'status': 'success',
        'message': 'PDF download complete',
        'file_path': file_path
    })

@socketio.on('pdf_download_error')
def handle_pdf_download_error(data):
    """Handle PDF download error event."""
    logger.debug(f"PDF download error: {data}")
    
    url = data.get('url')
    task_id = data.get('task_id')
    error = data.get('error', 'Unknown error')
    
    if not url or not task_id:
        return
    
    # Emit error update
    emit('pdf_download_progress', {
        'task_id': task_id,
        'url': url,
        'progress': 0,
        'status': 'error',
        'message': f'PDF download failed: {error}'
    })

def emit_progress(self, progress, message=None, stats=None, pdf_downloads=None):
    """Emit progress with rate limiting, memory efficiency, and enhanced PDF statistics."""
    now = time.time()
    if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
        self.progress = min(progress, 100)
        
        # Build minimal data payload
        data = {
            "task_id": self.task_id,
            "progress": self.progress,
            "status": self.status
        }
        
        if message:
            data["message"] = message
            
        if stats:
            data["stats"] = stats
            
        if pdf_downloads:
            pdf_stats = {
                "total": len(pdf_downloads),
                "downloading": sum(1 for pdf in pdf_downloads if pdf.get("status") == "downloading"),
                "processing": sum(1 for pdf in pdf_downloads if pdf.get("status") == "processing"),
                "completed": sum(1 for pdf in pdf_downloads if pdf.get("status") == "success"),
                "failed": sum(1 for pdf in pdf_downloads if pdf.get("status") == "error")
            }
            data["pdf_stats"] = pdf_stats
            
            if len(pdf_downloads) > 50:
                active_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] in ("downloading", "processing", "error")]
                completed_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] == "success"]
                
                first_pdfs = pdf_downloads[:10]
                last_pdfs = pdf_downloads[-10:] if len(pdf_downloads) > 10 else []
                
                selected_pdfs = list(set(first_pdfs + last_pdfs + active_pdfs))
                
                pdf_indices = {pdf["url"]: i for i, pdf in enumerate(pdf_downloads)}
                selected_pdfs.sort(key=lambda pdf: pdf_indices.get(pdf.get("url", ""), 0))
                
                data["pdf_downloads"] = selected_pdfs
                data["pdf_downloads_summary"] = {
                    "total": len(pdf_downloads),
                    "completed": len(completed_pdfs),
                    "active": len(active_pdfs),
                    "showing": len(selected_pdfs)
                }
            else:
                data["pdf_downloads"] = pdf_downloads
        
        try:
            socketio.emit("progress_update", data)
            self.last_emit_time = now
            self.last_update_time = now
        except Exception as e:
            logger.debug(f"Socket.IO emission failed: {e}")
            
@socketio.on('pdf_processing_request')
def handle_pdf_processing_request(data):
    """Handle a request to process a PDF file via Socket.IO."""
    if not data or 'pdf_path' not in data:
        emit('pdf_processing_error', {
            'error': 'PDF path is required'
        })
        return
    
    pdf_path = data['pdf_path']
    output_dir = data.get('output_dir')
    extract_tables = data.get('extract_tables', True)
    use_ocr = data.get('use_ocr', True)
    
    try:
        # Validate the PDF file
        validation = validate_pdf(pdf_path)
        if not validation['valid']:
            emit('pdf_processing_error', {
                'error': validation['error'],
                'pdf_path': pdf_path
            })
            return
            
        # Generate a task ID
        task_id = str(uuid.uuid4())
        
        # Create a PDF processing task
        task = {
            "type": "pdf_processing",
            "pdf_path": pdf_path,
            "output_dir": output_dir,
            "extract_tables": extract_tables,
            "use_ocr": use_ocr,
            "task_id": task_id,
            "status": "pending",
            "start_time": time.time(),
            "validation": validation
        }
        
        # Add task to active tasks
        with tasks_lock:
            active_tasks[task_id] = task
        
        # Emit initial status
        emit('pdf_processing_started', {
            'task_id': task_id,
            'pdf_path': pdf_path,
            'validation': validation
        })
        
        # Start processing in a background thread
        def process_thread():
            try:
                # Update status to processing
                with tasks_lock:
                    active_tasks[task_id]["status"] = "processing"
                
                # Emit processing update
                socketio.emit('pdf_processing_update', {
                    'task_id': task_id,
                    'status': 'processing',
                    'message': 'Processing started'
                })
                
                # Process the PDF
                if pdf_extractor_available:
                    result = pdf_extractor.process_pdf(
                        pdf_path=pdf_path,
                        output_path=output_dir,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True
                    )
                elif structify_available and hasattr(structify_module, 'process_pdf'):
                    result = structify_module.process_pdf(
                        pdf_path=pdf_path,
                        output_path=output_dir,
                        max_chunk_size=4096,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True
                    )
                else:
                    result = {"status": "error", "error": "No PDF processing module available"}
                
                # Update task with result
                with tasks_lock:
                    active_tasks[task_id]["status"] = "completed" if result.get("status") == "success" else "error"
                    active_tasks[task_id]["result"] = result
                    active_tasks[task_id]["end_time"] = time.time()
                
                # Emit completion or error
                if result.get("status") == "success":
                    socketio.emit('pdf_processing_complete', {
                        'task_id': task_id,
                        'status': 'completed',
                        'result': result,
                        'processing_time': time.time() - task["start_time"]
                    })
                else:
                    socketio.emit('pdf_processing_error', {
                        'task_id': task_id,
                        'status': 'error',
                        'error': result.get("error", "Unknown error")
                    })
            except Exception as e:
                logger.error(f"Error processing PDF {pdf_path}: {e}", exc_info=True)
                
                # Update task with error
                with tasks_lock:
                    active_tasks[task_id]["status"] = "error"
                    active_tasks[task_id]["error"] = str(e)
                    active_tasks[task_id]["end_time"] = time.time()
                
                # Emit error
                socketio.emit('pdf_processing_error', {
                    'task_id': task_id,
                    'status': 'error',
                    'error': str(e)
                })
        
        # Start processing thread
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
    except Exception as e:
        logger.error(f"Error initiating PDF processing: {e}", exc_info=True)
        emit('pdf_processing_error', {
            'error': str(e),
            'pdf_path': pdf_path
        })
        
# -----------------------------------------------------------------------------
# Academic API Helper Functions
# -----------------------------------------------------------------------------

import academic_api
from academic_api_redis import RedisCache, RedisRateLimiter
from citation_network_visualizer import CitationNetworkVisualizer
from academic_research_assistant import AcademicResearchAssistant

def format_search_results(raw_results):
    """
    Format raw search results into a standardized Academic API response format.
    
    Args:
        raw_results: List of raw search results
        
    Returns:
        Formatted search results dict
    """
    formatted_results = []
    
    for result in raw_results:
        # Extract the required fields for each result
        formatted_result = {
            "id": result.get("identifier", result.get("id", str(uuid.uuid4()))),
            "title": result.get("title", "Unknown Title"),
            "authors": result.get("authors", []),
            "abstract": result.get("abstract", result.get("description", "")),
            "source": result.get("source", "unknown"),
            "pdf_url": result.get("pdf_url", "")
        }
        
        # Clean up fields
        if isinstance(formatted_result["abstract"], str) and len(formatted_result["abstract"]) > 500:
            formatted_result["abstract"] = formatted_result["abstract"][:497] + "..."
        
        formatted_results.append(formatted_result)
    
    return {
        "results": formatted_results,
        "total_results": len(formatted_results)
    }

def search_academic_source(query, source, limit):
    """
    Search for academic papers from a specific source.
    
    Args:
        query: Search query
        source: Source to search (arxiv, semantic, etc.)
        limit: Maximum number of results
        
    Returns:
        List of paper information dictionaries
    """
    if not web_scraper_available:
        logger.warning("Web scraper module not available for academic search")
        return []
    
    try:
        if source == "arxiv":
            # Construct the arXiv search URL
            search_url = f"https://arxiv.org/search/?query={query}&searchtype=all"
            
            # Use web_scraper to fetch PDF links
            pdf_links = web_scraper.fetch_pdf_links(search_url)
            
            results = []
            for i, link in enumerate(pdf_links[:limit]):
                # Convert abstract URLs to proper format
                url = link.get("url", "")
                if "arxiv.org/abs/" in url:
                    pdf_url = web_scraper.convert_arxiv_url(url)
                    paper_id = url.split("/")[-1]
                else:
                    pdf_url = url
                    paper_id = f"arxiv:{str(uuid.uuid4())[:8]}"
                
                results.append({
                    "id": paper_id,
                    "identifier": paper_id,
                    "title": link.get("title", f"Paper related to {query}"),
                    "authors": [],  # Would extract actual authors with proper parsing
                    "abstract": "",  # Would extract actual abstract with proper parsing
                    "pdf_url": pdf_url,
                    "source": "arxiv"
                })
            
            return results
        
        elif source == "semantic":
            # Implement Semantic Scholar search
            # This would be similar to arXiv but with Semantic Scholar URLs
            return []
            
        elif source == "openalex":
            # Implement OpenAlex search
            # This would use OpenAlex specific APIs or web scraping
            return []
            
        else:
            logger.warning(f"Unsupported academic source: {source}")
            return []
            
    except Exception as e:
        logger.error(f"Error searching academic source: {e}")
        return []

def get_paper_citations(paper_id, source, depth=1):
    """
    Get citation information for a specific paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform (arxiv, semantic, etc.)
        depth: Depth of citation analysis
        
    Returns:
        Dictionary with citation analysis
    """
    try:
        # Get paper details first
        paper_details = get_paper_details(paper_id, source)
        
        # Sample data structure for citation analysis
        analysis = {
            "paper_id": paper_id,
            "paper_title": paper_details.get("title", "Unknown Paper"),
            "total_citations": 0,  # Would be determined from actual data
            "citation_by_year": {},
            "top_citing_authors": [],
            "top_citing_venues": [],
            "citation_network": {
                "nodes": [],
                "links": []
            }
        }
        
        # In a real implementation, you would fetch actual citation data
        # Here we'll add the main paper as the central node for the network visualization
        if depth > 0:
            # Add the main paper as the central node
            analysis["citation_network"]["nodes"].append({
                "id": paper_id,
                "label": paper_details.get("title", "Unknown"),
                "type": "main",
                "year": paper_details.get("publication_date", "")[:4] if paper_details.get("publication_date") else ""
            })
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing citations: {e}")
        return {"error": f"Failed to analyze citations: {str(e)}"}

def recommend_related_papers(paper_id, source="arxiv", limit=5):
    """
    Recommend papers related to the given paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform
        limit: Maximum number of recommendations
        
    Returns:
        List of related paper dictionaries
    """
    try:
        # Get paper details first
        paper_details = get_paper_details(paper_id, source)
        
        # Extract keywords from the paper's title and abstract
        title = paper_details.get("title", "")
        abstract = paper_details.get("abstract", "")
        
        # In a real implementation, we would use NLP to extract keywords
        # and find related papers based on semantic similarity
        # Here we'll create sample recommendations
        
        recommendations = []
        for i in range(1, limit + 1):
            recommendations.append({
                "id": f"related_{i}_{paper_id}",
                "title": f"Related Paper {i} to {title[:30]}...",
                "authors": ["Researcher A", "Researcher B"],
                "abstract": f"This paper relates to the concepts in {title[:50]}...",
                "similarity_score": round(0.9 - (i * 0.1), 2),  # Decreasing similarity
                "shared_keywords": ["machine learning", "neural networks"],
                "publication_date": f"202{i}-01-01",
                "source": source,
                "pdf_url": f"https://example.com/related_{i}.pdf"
            })
        
        return recommendations
        
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        return []

# -----------------------------------------------------------------------------
# Academic API Endpoints
# -----------------------------------------------------------------------------

@app.route("/api/academic/health", methods=["GET"])
def academic_health_check():
    """Simple health check endpoint for Academic API."""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "web_scraper_available": web_scraper_available
    })

@app.route("/api/academic/search", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_search():
    """
    Search for academic papers matching a query.
    
    Query Parameters:
        query (required): The search term
        source (optional): Specify a source (arxiv, semantic, openalex)
        limit (optional): Maximum number of results (default: 10)
    """
    query = request.args.get("query", "")
    source = request.args.get("source", "arxiv").lower()
    limit = int(request.args.get("limit", "10"))
    
    # Validate query
    if not query:
        return jsonify({"error": {"code": "INVALID_QUERY", "message": "The query parameter is missing."}}), 400
        
    # Search cache key
    cache_key = f"academic_search:{source}:{query}:{limit}"
    
    # Check cache if we have a search_cache dictionary
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get results from academic source
        raw_results = search_academic_source(query, source, limit)
        
        # Format results
        formatted_results = format_search_results(raw_results)
        
        # Cache results if we have a search_cache dictionary
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in academic search: {e}")
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/multi-source", methods=["GET"])
@require_api_key
@limiter.limit("5 per minute")
def academic_multi_source_search():
    """
    Search multiple academic sources simultaneously and combine results.
    
    Query Parameters:
        query (required): The search term
        sources (optional): Comma-separated list of sources (default: all)
        limit (optional): Maximum results per source (default: 5)
    """
    query = request.args.get("query", "")
    sources_param = request.args.get("sources", "arxiv,semantic,openalex")
    limit = int(request.args.get("limit", "5"))
    
    # Validate query
    if not query:
        return jsonify({"error": {"code": "INVALID_QUERY", "message": "The query parameter is missing."}}), 400
        
    # Parse sources
    sources = [s.strip().lower() for s in sources_param.split(",")]
    
    # Cache key
    cache_key = f"academic_multi:{sources_param}:{query}:{limit}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        all_results = []
        
        # Process each source in parallel
        with ThreadPoolExecutor(max_workers=min(3, len(sources))) as executor:
            # Submit search tasks
            future_to_source = {
                executor.submit(search_academic_source, query, source, limit): source 
                for source in sources
            }
            
            # Process results as they complete
            for future in as_completed(future_to_source):
                source = future_to_source[future]
                try:
                    source_results = future.result()
                    all_results.extend(source_results)
                except Exception as e:
                    logger.error(f"Error in {source} search: {e}")
        
        # Format combined results
        formatted_results = format_search_results(all_results)
        
        # Add source distribution information
        source_counts = {}
        for result in all_results:
            source = result.get("source", "unknown")
            source_counts[source] = source_counts.get(source, 0) + 1
        
        formatted_results["source_distribution"] = source_counts
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in multi-source search: {e}")
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/details/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("20 per minute")
def academic_paper_details(id):
    """
    Get detailed information about a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
    """
    source = request.args.get("source", "arxiv").lower()
    
    # Cache key
    cache_key = f"academic_details:{source}:{id}"
    
    # Check cache
    cached_result = get_from_cache(details_cache, cache_key) if 'details_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get paper details
        if source == "arxiv":
            # Construct arXiv URL for the paper
            if not id.startswith("http"):
                paper_url = f"https://arxiv.org/abs/{id}"
            else:
                paper_url = id
            
            # Use web_scraper to get HTML content
            try:
                html_content = web_scraper.extract_html_text(paper_url)
                
                # For PDF URL
                pdf_url = web_scraper.convert_arxiv_url(paper_url)
                
                # In a real implementation, you would parse the HTML properly
                # Here we'll create a sample result with minimal info
                details = {
                    "id": id,
                    "title": f"Paper {id}",  # Would be extracted from HTML
                    "authors": ["Author A", "Author B", "Author C"],  # Would be extracted from HTML
                    "abstract": f"This is a detailed abstract for paper {id}...",  # Would be extracted from HTML
                    "publication_date": "2023-01-15",  # Would be extracted from HTML
                    "source": "arxiv",
                    "pdf_url": pdf_url,
                    "metadata": {
                        "categories": ["cs.AI", "cs.LG"],
                        "comments": "Published in Example Conference 2023",
                        "doi": f"10.1000/{id}"
                    }
                }
            except Exception as html_err:
                logger.error(f"Error extracting HTML for paper {id}: {html_err}")
                details = {
                    "id": id,
                    "title": f"Paper {id}",
                    "authors": [],
                    "abstract": "",
                    "publication_date": "",
                    "source": "arxiv",
                    "pdf_url": f"https://arxiv.org/pdf/{id}.pdf",
                    "metadata": {}
                }
        else:
            # Handle other sources
            details = {
                "id": id,
                "title": f"Paper from {source}",
                "authors": ["Unknown Author"],
                "abstract": "Abstract not available for this source yet.",
                "publication_date": "2023-01-01",
                "source": source,
                "pdf_url": "",
                "metadata": {}
            }
        
        # Add to cache
        if 'details_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(details_cache, cache_key, details)
        
        return jsonify(details)
        
    except Exception as e:
        logger.error(f"Error getting academic paper details: {e}")
        
        return jsonify({
            "error": {
                "code": "DETAILS_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/download/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("5 per minute")
def academic_download_paper(id):
    """
    Download the PDF for a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        filename (optional): Custom filename for the downloaded PDF
    """
    source = request.args.get("source", "arxiv").lower()
    filename = request.args.get("filename", "")
    
    try:
        # Handle arxiv IDs
        if source == "arxiv":
            # Convert ID to URL if needed
            if not id.startswith("http"):
                pdf_url = f"https://arxiv.org/pdf/{id}.pdf"
            else:
                pdf_url = id
        else:
            # For other sources, we would need proper URL handling
            return jsonify({
                "error": {
                    "code": "UNSUPPORTED_SOURCE",
                    "message": f"PDF download for source '{source}' is not supported yet."
                }
            }), 400
        
        if not web_scraper_available:
            return jsonify({
                "error": {
                    "code": "MODULE_ERROR",
                    "message": "Web scraper module not available for PDF download."
                }
            }), 500
        
        # Generate a task ID for tracking download progress
        task_id = str(uuid.uuid4())
        
        # Download the PDF using your existing function
        try:
            pdf_file = download_pdf(
                url=pdf_url,
                save_path=DEFAULT_OUTPUT_FOLDER,
                emit_progress=True,
                task_id=task_id
            )
            
            if pdf_file and os.path.exists(pdf_file):
                # Return download information
                return jsonify({
                    "status": "success",
                    "message": "PDF downloaded successfully",
                    "file_path": pdf_file,
                    "file_name": os.path.basename(pdf_file),
                    "file_size": os.path.getsize(pdf_file),
                    "task_id": task_id
                })
            else:
                return jsonify({
                    "error": {
                        "code": "DOWNLOAD_FAILED",
                        "message": "Failed to download PDF."
                    }
                }), 404
                
        except Exception as download_error:
            logger.error(f"Download error: {download_error}")
            return jsonify({
                "error": {
                    "code": "DOWNLOAD_ERROR",
                    "message": str(download_error)
                }
            }), 500
            
    except Exception as e:
        logger.error(f"Error in academic download endpoint: {e}")
        
        return jsonify({
            "error": {
                "code": "SERVER_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/citations/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_paper_citations(id):
    """
    Get citation analysis for a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        depth (optional): Depth of citation analysis (default: 1)
    """
    source = request.args.get("source", "arxiv").lower()
    depth = int(request.args.get("depth", "1"))
    
    # Cache key
    cache_key = f"academic_citations:{source}:{id}:{depth}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get citation analysis
        analysis = get_paper_citations(id, source, depth)
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, analysis)
        
        return jsonify(analysis)
        
    except Exception as e:
        logger.error(f"Error getting paper citations: {e}")
        
        return jsonify({
            "error": {
                "code": "CITATION_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/recommendations/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_paper_recommendations(id):
    """
    Get recommended papers related to a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        limit (optional): Maximum number of recommendations (default: 5)
    """
    source = request.args.get("source", "arxiv").lower()
    limit = int(request.args.get("limit", "5"))
    
    # Cache key
    cache_key = f"academic_recommendations:{source}:{id}:{limit}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get recommendations
        recommendations = recommend_related_papers(id, source, limit)
        
        # Format response
        result = {
            "paper_id": id,
            "source": source,
            "recommendation_count": len(recommendations),
            "recommendations": recommendations
        }
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, result)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting paper recommendations: {e}")
        
        return jsonify({
            "error": {
                "code": "RECOMMENDATION_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/bulk/download", methods=["POST"])
@require_api_key
@limiter.limit("3 per minute")
def academic_bulk_download():
    """
    Download multiple papers in bulk.
    
    Expected JSON body:
    {
        "paper_ids": ["paper_id_1", "paper_id_2", ...],
        "source": "arxiv"
    }
    """
    if not request.is_json:
        return jsonify({"error": {"code": "INVALID_REQUEST", "message": "Request must be JSON"}}), 400
    
    data = request.get_json()
    paper_ids = data.get("paper_ids", [])
    source = data.get("source", "arxiv")
    
    if not paper_ids:
        return jsonify({"error": {"code": "NO_PAPERS", "message": "No paper IDs provided"}}), 400
    
    try:
        # Use our existing bulk download function
        result = bulk_download_papers(paper_ids, source)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in bulk download: {e}")
        
        return jsonify({
            "error": {
                "code": "BULK_DOWNLOAD_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/analyze/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("5 per minute")
def academic_analyze_paper(id):
    """
    Comprehensive analysis of a paper: details, citations, and recommendations.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        include_citations (optional): Whether to include citation analysis (default: true)
        include_recommendations (optional): Whether to include recommendations (default: true)
    """
    source = request.args.get("source", "arxiv").lower()
    include_citations = request.args.get("include_citations", "true").lower() == "true"
    include_recommendations = request.args.get("include_recommendations", "true").lower() == "true"
    
    # Cache key
    cache_key = f"academic_analyze:{source}:{id}:{include_citations}:{include_recommendations}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get paper details
        details = None
        try:
            response = academic_paper_details(id)
            if response.status_code == 200:
                details = response.get_json()
        except Exception:
            # Try direct call if jsonify response doesn't work
            details = get_paper_details(id, source)
        
        if not details or "error" in details:
            return jsonify({
                "error": {
                    "code": "DETAILS_ERROR",
                    "message": "Failed to retrieve paper details"
                }
            }), 404
        
        result = {
            "paper_id": id,
            "source": source,
            "details": details
        }
        
        # Get citation analysis if requested
        if include_citations:
            try:
                citations = get_paper_citations(id, source)
                result["citations"] = citations
            except Exception as e:
                logger.warning(f"Failed to get citation analysis: {e}")
                result["citations"] = {"error": str(e)}
        
        # Get recommendations if requested
        if include_recommendations:
            try:
                recommendations = recommend_related_papers(id, source)
                result["recommendations"] = {
                    "recommendation_count": len(recommendations),
                    "recommendations": recommendations
                }
            except Exception as e:
                logger.warning(f"Failed to get recommendations: {e}")
                result["recommendations"] = {"error": str(e)}
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, result)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error analyzing paper: {e}")
        
        return jsonify({
            "error": {
                "code": "ANALYSIS_ERROR",
                "message": str(e)
            }
        }), 500

@app.route("/api/academic/extract", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_extract_from_url():
    """
    Extract papers from a URL and optionally download them.
    
    Query Parameters:
        url (required): URL to extract papers from
        download (optional): Whether to download extracted papers (default: false)
        output_folder (optional): Folder to save downloads (server default if not specified)
    """
    url = request.args.get("url")
    download = request.args.get("download", "false").lower() == "true"
    output_folder = request.args.get("output_folder", DEFAULT_OUTPUT_FOLDER)
    
    if not url:
        return jsonify({"error": {"code": "URL_REQUIRED", "message": "URL parameter is required"}}), 400
    
    try:
        # Ensure output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Use web_scraper to extract PDF links
        pdf_links = web_scraper.fetch_pdf_links(url)
        
        if not pdf_links:
            return jsonify({
                "status": "completed",
                "url": url,
                "message": "No PDF links found",
                "pdfs_found": 0
            })
        
        response = {
            "status": "completed",
            "url": url,
            "pdfs_found": len(pdf_links),
            "pdfs": []
        }
        
        # Process each PDF link
        for link in pdf_links:
            pdf_info = {
                "url": link.get("url"),
                "title": link.get("title", "Unknown")
            }
            
            # Download if requested
            if download:
                try:
                    pdf_file = web_scraper.download_pdf(
                        link.get("url"),
                        save_path=output_folder
                    )
                    
                    if pdf_file and os.path.exists(pdf_file):
                        pdf_info["file_path"] = pdf_file
                        pdf_info["file_size"] = os.path.getsize(pdf_file)
                        pdf_info["downloaded"] = True
                    else:
                        pdf_info["downloaded"] = False
                except Exception as e:
                    pdf_info["downloaded"] = False
                    pdf_info["error"] = str(e)
            
            response["pdfs"].append(pdf_info)
        
        # Update counts
        if download:
            response["pdfs_downloaded"] = sum(1 for pdf in response["pdfs"] if pdf.get("downloaded", False))
            response["output_folder"] = output_folder
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error extracting from URL: {e}")
        
        return jsonify({
            "error": {
                "code": "EXTRACTION_ERROR",
                "message": str(e)
            }
        }), 500


# ----------------------------------------------------------------------------
# Main Entry Point
# ----------------------------------------------------------------------------
if __name__ == "__main__":
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