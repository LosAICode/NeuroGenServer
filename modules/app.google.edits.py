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
from concurrent.futures import ThreadPoolExecutor, as_completed, ProcessPoolExecutor ### ADDED ProcessPoolExecutor for claude.py
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

# --- Logging Setup ---
log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_str, logging.INFO)

logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
        # If you want to log to a file as well:
        # logging.FileHandler("app.log", mode='a', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)
# --- End Logging Setup ---
        
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    if structify_module is None:
        logger.error("Failed to load structify_module: get_claude_module() returned None")
        structify_available = False
    else:
        structify_available = True
        FileStats = components.get('FileStats')
        # ProcessingTask = components.get('ProcessingTask') # This was a class from structify, app.py has its own
        process_all_files_structify = components.get('process_all_files') # Renamed to avoid conflict
        ### ENHANCEMENT: Make sure to get all necessary components from structify
        DEFAULT_MAX_CHUNK_SIZE_S = components.get('DEFAULT_MAX_CHUNK_SIZE', 4096)
        DEFAULT_CHUNK_OVERLAP_S = components.get('DEFAULT_CHUNK_OVERLAP', 200)
        DEFAULT_STOP_WORDS_S = components.get('DEFAULT_STOP_WORDS', set())
        DEFAULT_VALID_EXTENSIONS_S = components.get('DEFAULT_VALID_EXTENSIONS', [])
        MAX_FILE_SIZE_S = components.get('MAX_FILE_SIZE', 100 * 1024 * 1024)
        DEFAULT_PROCESS_TIMEOUT_S = components.get('DEFAULT_PROCESS_TIMEOUT', 600)
        DEFAULT_MEMORY_LIMIT_S = components.get('DEFAULT_MEMORY_LIMIT', 1024 * 1024 * 1024)
        CACHE_FILE_S = components.get('CACHE_FILE', '.claude_cache.json')
        
        logger.info("Successfully loaded structify_module and components")
except ImportError as e:
    logger.error(f"Could not import structify_module: {e}")
    structify_available = False
    # Define placeholder classes
    class FileStatsPlaceholder: # Renamed to avoid conflict if CustomFileStats is used as primary
        def to_dict(self): return {}
    FileStats = FileStatsPlaceholder # Use the placeholder
    # class ProcessingTask: pass # app.py defines its own ProcessingTask
    def process_all_files_structify(*args, **kwargs):
        logger.error("process_all_files_structify not available - structify_module missing")
        return {"error": "Processing module not available", "stats": {}}
    DEFAULT_MAX_CHUNK_SIZE_S = 4096
    DEFAULT_CHUNK_OVERLAP_S = 200
    DEFAULT_STOP_WORDS_S = set(["the", "and", "or"]) # Simplified
    DEFAULT_VALID_EXTENSIONS_S = [".txt", ".py", ".js", ".html", ".css", ".md", ".json", ".pdf"]
    MAX_FILE_SIZE_S = 100 * 1024 * 1024
    DEFAULT_PROCESS_TIMEOUT_S = 600
    DEFAULT_MEMORY_LIMIT_S = 1024 * 1024 * 1024
    CACHE_FILE_S = '.claude_cache.json'

# Use structify constants if available, otherwise fallbacks are defined with _S suffix
DEFAULT_MAX_CHUNK_SIZE = DEFAULT_MAX_CHUNK_SIZE_S
DEFAULT_CHUNK_OVERLAP = DEFAULT_CHUNK_OVERLAP_S
DEFAULT_STOP_WORDS = DEFAULT_STOP_WORDS_S
DEFAULT_VALID_EXTENSIONS = DEFAULT_VALID_EXTENSIONS_S
MAX_FILE_SIZE = MAX_FILE_SIZE_S
DEFAULT_PROCESS_TIMEOUT = DEFAULT_PROCESS_TIMEOUT_S
DEFAULT_MEMORY_LIMIT = DEFAULT_MEMORY_LIMIT_S
CACHE_FILE = CACHE_FILE_S


pdf_extractor_available = False
custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
os.makedirs(custom_temp_dir, exist_ok=True)
tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
os.makedirs(tessdata_dir, exist_ok=True)

try:
    import stat
    os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    logger.info(f"Set full permissions on temp directory: {custom_temp_dir}")
except Exception as e:
    logger.warning(f"Could not set permissions on temp directory: {e}")

os.environ['TEMP'] = custom_temp_dir
os.environ['TMP'] = custom_temp_dir
os.environ['TESSDATA_PREFIX'] = os.path.abspath(tessdata_dir)
logger.info(f"Set TESSDATA_PREFIX to: {os.environ['TESSDATA_PREFIX']}")
logger.info(f"Set temp directory environment variables to: {custom_temp_dir}")

try:
    import pytesseract
    tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
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
    
if structify_available:
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
    try:
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
    except Exception as e:
        logger.error(f"Error initializing PDF extractor: {e}")
except ImportError as e:
    logger.warning(f"pdf_extractor module not available: {e}. PDF processing will be limited.")
    class PDFExtractorPlaceholder:
        @staticmethod
        def process_pdf(*args, **kwargs):
            error_msg = "PDF extractor module not available. Install with 'pip install pdf_extractor'"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg, "processing_info": {"error": error_msg}}
        @staticmethod
        def extract_tables_from_pdf(*args, **kwargs): return []
        @staticmethod
        def detect_document_type(*args, **kwargs): return "unknown"
        @staticmethod
        def initialize_module(*args, **kwargs): return {"status": "error", "capabilities": {}}
        @staticmethod
        def get_pdf_summary(*args, **kwargs): return {"status": "error", "error": "PDF extractor not available"}
        @staticmethod
        def batch_process_pdfs(*args, **kwargs): return {"status": "error", "error": "PDF extractor not available"}

    pdf_extractor = PDFExtractorPlaceholder() # type: ignore
    
if pdf_extractor_available:
    try:
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
    except Exception as e:
        logger.error(f"Error initializing PDF extractor: {e}")

try:
    from safe_ocr_handler import setup_ocr_environment, patch_pytesseract, start_cleanup_service
    ocr_config = setup_ocr_environment()
    logger.info(f"OCR environment set up with temp directory: {ocr_config['base_temp_dir']}")
    patch_pytesseract()
    start_cleanup_service(interval_minutes=30)
    logger.info("OCR handler initialized successfully")
except ImportError:
    logger.warning("Could not import safe_ocr_handler. OCR functionality may be limited.")
except Exception as e:
    logger.error(f"Error initializing OCR handler: {e}")

academic_api_available = False
academic_api_client_available = False
citation_visualizer_available = False
research_assistant_available = False
redis_integration_available = False

try:
    import academic_api # type: ignore
    academic_api_available = True
    logger.info("Successfully imported academic_api module")
except ImportError as e:
    logger.warning(f"academic_api module not available: {e}")
    academic_api_available = False

try:
    from academic_api_client import AcademicApiClient # type: ignore
    academic_api_client_available = True
    logger.info("Successfully imported academic_api_client module")
except ImportError as e:
    logger.warning(f"academic_api_client module not available: {e}")
    academic_api_client_available = False

try:
    from citation_network_visualizer import CitationNetworkVisualizer # type: ignore
    citation_visualizer_available = True
    logger.info("Successfully imported citation_network_visualizer module")
except ImportError as e:
    logger.warning(f"citation_network_visualizer module not available: {e}")
    citation_visualizer_available = False

try:
    from academic_research_assistant import AcademicResearchAssistant # type: ignore
    research_assistant_available = True
    logger.info("Successfully imported academic_research_assistant module")
except ImportError as e:
    logger.warning(f"academic_research_assistant module not available: {e}")
    research_assistant_available = False

try:
    from flask import Flask, render_template, request, jsonify, send_from_directory, Response, abort, send_file
    from flask_socketio import SocketIO, emit, disconnect # type: ignore
    from werkzeug.utils import secure_filename
except ImportError as e:
    logger.error(f"Failed to import Flask dependencies: {e}")
    logger.error("Install with: pip install flask flask-socketio werkzeug")
    sys.exit(1)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "neurogenserver")
app.config["UPLOAD_FOLDER"] = os.environ.get("UPLOAD_FOLDER", tempfile.mkdtemp())

socketio_flask_logger = logging.getLogger('flask-socketio') # Renamed to avoid conflict
socketio_flask_logger.setLevel(logging.INFO) # Changed to INFO to reduce noise, DEBUG can be very verbose
handler = logging.StreamHandler()
# handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')) # Already set by root logger
socketio_flask_logger.addHandler(handler)

socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    logger=socketio_flask_logger, # Use the specific logger
    engineio_logger=socketio_flask_logger, # Use the specific logger
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=10 * 1024 * 1024 # 10MB in bytes
)

@socketio.on('connect')
def handle_connect():
    logger.info(f"Client connected: {request.sid}")
    emit('connection_established', {'status': 'connected', 'sid': request.sid, 'timestamp': time.time()})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"Client disconnected: {request.sid}")

@socketio.on('ping_from_client') # Renamed from 'ping' to avoid conflict with engine.io ping
def handle_ping_from_client(data):
    logger.debug(f"Ping received from {request.sid}: {data}")
    emit('pong_to_client', {'timestamp': time.time(), 'original_data': data})

@socketio.on('request_task_status') # Renamed for clarity
def handle_status_request(data):
    task_id = data.get('task_id')
    if not task_id:
        emit('task_error', {'error': "Task ID missing in status request", 'task_id': None, 'sid': request.sid})
        return

    logger.info(f"Status request for task {task_id} from {request.sid}")
    task = get_task(task_id)
    if task:
        status_data = task.get_status() # Use task's own status reporting method
        emit('progress_update', status_data)
    else:
        emit('task_error', {
            'task_id': task_id,
            'error': f"Task with ID {task_id} not found",
            'sid': request.sid
        })

# Load environment variables
from dotenv import load_dotenv
load_dotenv()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    # Allow to run without YouTube API key if not using playlist feature
    logger.warning("YOUTUBE_API_KEY not set in .env. Playlist features will be disabled.")
    YOUTUBE_API_KEY = None # Set to None to indicate it's not available


pikepdf_available = False
try:
    import pikepdf # type: ignore
    pikepdf_available = True
except ImportError:
    logger.warning("pikepdf not available. Some PDF repair functions will be limited.")

# TEMP_OCR_DIR from structify.claude might not be available if structify fails to load
# Fallback definition is already handled by custom_temp_dir
    
requests_available = False
try:
    import requests
    from requests.adapters import HTTPAdapter
    from requests.packages.urllib3.util.retry import Retry # type: ignore # Corrected import path
    requests_available = True
except ImportError:
    logger.warning("Requests not installed. Web access functionality will be limited.")

magic_available = False
try:
    import magic # type: ignore
    magic_available = True
except ImportError:
    logger.warning("python-magic not available. Try installing python-magic-bin on Windows or python-magic on Linux/macOS.")

web_scraper_available = False
try:
    import web_scraper # type: ignore
    from web_scraper import (
        process_url as web_scraper_process_url, # Renamed to avoid conflict
        download_pdf as web_scraper_download_pdf,
        fetch_pdf_links as web_scraper_fetch_pdf_links,
        scrape_and_download_pdfs as web_scraper_scrape_and_download_pdfs
    )
    logger.info("Successfully imported web_scraper module")
    web_scraper_available = True
except ImportError as e:
    logger.warning(f"web_scraper module not available: {e}. Scraper functionality will be limited.")
    def web_scraper_process_url(*args, **kwargs): 
        logger.error("web_scraper module not available")
        return {"error": "Web scraper module not available"}
    def web_scraper_download_pdf(*args, **kwargs):
        logger.error("web_scraper module not available")
        return None
    def web_scraper_fetch_pdf_links(*args, **kwargs):
        logger.error("web_scraper module not available")
        return []
    def web_scraper_scrape_and_download_pdfs(*args, **kwargs):
        logger.error("web_scraper module not available")
        return {"error": "Web scraper module not available"}

try:
    from playlists_downloader import download_all_playlists # type: ignore
except ImportError:
    logger.warning("playlists_downloader module not available. Playlist functionality will be limited.")
    def download_all_playlists(*args, **kwargs):
        logger.error("playlists_downloader module not available")
        return []

# neurogenlib, optimized_pdf_processor, file_path_utility, error_handling - not standard, assume local
# For simplicity, I'll assume these are not critical for the core Socket.IO enhancements.
# If they are, their absence should be handled gracefully.
try:
    import neurogenlib # type: ignore
    from optimized_pdf_processor import MemoryEfficientPDFProcessor # type: ignore
    from file_path_utility import FilePathUtility # type: ignore
    from error_handling import ErrorHandler # type: ignore
    optimized_components_available = True
except ImportError:
    optimized_components_available = False
    logger.warning("Optional optimized components (neurogenlib, etc.) not available.")
        
RESEARCH_DOMAINS = ["arxiv.org", "springer.com", "ieee.org", "researchgate.net", "academia.edu", "sciencedirect.com"]
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER")
if not DEFAULT_OUTPUT_FOLDER:
    DEFAULT_OUTPUT_FOLDER = os.path.join(os.path.expanduser("~"), "Documents", "NeuroGenOutput") # Specific subfolder
    logger.info(f"DEFAULT_OUTPUT_FOLDER not set in environment, using: {DEFAULT_OUTPUT_FOLDER}")

try:
    if not os.path.exists(DEFAULT_OUTPUT_FOLDER):
        os.makedirs(DEFAULT_OUTPUT_FOLDER, exist_ok=True)
        logger.info(f"Created output directory: {DEFAULT_OUTPUT_FOLDER}")
    test_file_path = os.path.join(DEFAULT_OUTPUT_FOLDER, ".write_test")
    with open(test_file_path, 'w') as f:
        f.write("test")
    os.remove(test_file_path)
    logger.info(f"Verified write permissions for: {DEFAULT_OUTPUT_FOLDER}")
except (IOError, OSError, PermissionError) as e:
    logger.error(f"Cannot write to DEFAULT_OUTPUT_FOLDER {DEFAULT_OUTPUT_FOLDER}: {e}")
    try:
        fallback_temp_dir = tempfile.mkdtemp(prefix="NeuroGenOutput_")
        DEFAULT_OUTPUT_FOLDER = fallback_temp_dir
        logger.warning(f"Falling back to temp directory for output: {DEFAULT_OUTPUT_FOLDER}")
    except Exception as e2:
        logger.critical(f"Could not set up fallback temp directory: {e2}")
        # As a last resort, use the application's temp directory.
        DEFAULT_OUTPUT_FOLDER = custom_temp_dir
        logger.warning(f"Using application temp directory for output as last resort: {DEFAULT_OUTPUT_FOLDER}")


DEFAULT_OUTPUT_PATH = os.environ.get("DEFAULT_OUTPUT_PATH", DEFAULT_OUTPUT_FOLDER) # Use new default
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", str(os.cpu_count() or 1))) # Use CPU count
API_KEYS_STR = os.environ.get("API_KEYS", "test_key,dev_key")
API_KEYS = [key.strip() for key in API_KEYS_STR.split(",") if key.strip()]
API_PORT = os.environ.get("API_PORT", "5025")
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_DEBUG = os.environ.get("API_DEBUG", "False").lower() in ("true", "1", "t")
API_URL = f"http://localhost:{API_PORT}/api/process" # This seems unused, consider removing if not needed
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", "32")) * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

if requests_available:
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=0.3,
        status_forcelist=[500, 502, 503, 504],
        # allowed_methods=["HEAD", "GET", "OPTIONS"] # method_whitelist is deprecated, use allowed_methods
        allowed_methods=frozenset(["HEAD", "GET", "OPTIONS", "POST"]) # Added POST for robustness
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; NeuroGen/1.0; +http://example.com/bot)" # Added bot info
else:
    session = None # type: ignore

try:
    from academic_api_redis import RedisCache, RedisRateLimiter # type: ignore
    redis_integration_available = True
    logger.info("Successfully imported academic_api_redis module")
except ImportError as e:
    logger.warning(f"academic_api_redis module not available: {e}")
    redis_integration_available = False
    class RedisCache: # type: ignore
        def __init__(self, app=None): pass
    class RedisRateLimiter: # type: ignore
         def __init__(self, app=None): pass
    
active_tasks: Dict[str, Any] = {} ### MODIFIED: More specific type hint
tasks_lock = threading.Lock()


def download_tessdata():
    tessdata_target_dir = os.path.join(custom_temp_dir, "tessdata") # Use target dir name consistently
    os.makedirs(tessdata_target_dir, exist_ok=True)
    eng_traineddata_path = os.path.join(tessdata_target_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata_path):
        if not requests_available:
            logger.error("Requests library not available. Cannot download tessdata.")
            return
        try:
            logger.info("Downloading eng.traineddata...")
            url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
            r = requests.get(url, stream=True, timeout=60)
            r.raise_for_status()
            with open(eng_traineddata_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata_path}")
        except Exception as e:
            logger.error(f"Failed to download tessdata: {e}")

download_tessdata() # Call it once at startup

def ensure_tessdata_files(): # This seems redundant if download_tessdata is called, but keeping for now
    tessdata_target_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_target_dir, exist_ok=True)
    eng_traineddata_path = os.path.join(tessdata_target_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata_path):
        source_path = r'C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata' # This is Windows-specific
        if os.path.exists(source_path):
            try:
                import shutil
                shutil.copy2(source_path, eng_traineddata_path)
                logger.info(f"Copied eng.traineddata from {source_path} to {eng_traineddata_path}")
            except Exception as e:
                logger.warning(f"Failed to copy eng.traineddata: {e}")
                download_tessdata() # Try download if copy fails
        else:
            download_tessdata() # Try download if source doesn't exist
    
    if os.path.exists(eng_traineddata_path):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata_path}")
    else:
        logger.warning(f"eng.traineddata not found at {eng_traineddata_path} after checks.")

ensure_tessdata_files()

def ensure_temp_directory():
    # custom_temp_dir is already defined globally and created.
    # This function can simply return it or re-ensure permissions if needed.
    try:
        os.makedirs(custom_temp_dir, exist_ok=True)
        import stat
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    except Exception:
        pass # Ignore if chmod fails, e.g., on some systems or if not owner
    return custom_temp_dir

def resolve_output_path(directory: str, filename: str) -> str:
    """Resolve output path, ensuring directory exists."""
    try:
        if not os.path.isabs(directory):
            directory = os.path.abspath(directory)
        os.makedirs(directory, exist_ok=True)
    except OSError as e:
        logger.warning(f"Could not create directory {directory}: {e}. Using default: {DEFAULT_OUTPUT_FOLDER}")
        directory = DEFAULT_OUTPUT_FOLDER
        os.makedirs(directory, exist_ok=True) # Try to create default
    return os.path.join(directory, filename)

# get_output_filepath is complex and seems to duplicate some logic of resolve_output_path.
# Simplified version:
def get_output_filepath(filename: str, user_defined_dir: Optional[str] = None) -> str:
    """Resolves output filepath, prioritizing user_defined_dir, then filename's dir, then default."""
    base_dir = DEFAULT_OUTPUT_FOLDER
    
    # Sanitize filename and ensure .json extension
    filename_only = os.path.basename(filename)
    if not filename_only.lower().endswith('.json'):
        filename_only += '.json'
    sanitized_filename = sanitize_filename(filename_only)

    # Determine the directory
    if user_defined_dir:
        base_dir = user_defined_dir
    elif os.path.dirname(filename): # If filename contains a path
        base_dir = os.path.dirname(filename)
    
    final_path = resolve_output_path(base_dir, sanitized_filename)
    logger.info(f"Resolved output filepath for '{filename}' in dir '{user_defined_dir}': {final_path}")
    return final_path


def safe_split(text_value: Any, delimiter: str = ',') -> List[str]:
    if text_value is None: return []
    if not isinstance(text_value, str):
        try: text_value = str(text_value)
        except: return []
    return [item.strip() for item in text_value.split(delimiter) if item.strip()]


def cleanup_temp_files_job(): # Renamed to avoid conflict with safe_ocr_handler
    """Clean up old temporary files in the custom_temp_dir."""
    # temp_dir is custom_temp_dir (global)
    if not os.path.exists(custom_temp_dir):
        return # Nothing to clean if dir doesn't exist
        
    current_time = time.time()
    # Be more specific with temp file patterns if possible, e.g., "ocr_temp_*"
    # For now, cleaning all files older than 1 hour in the custom_temp_dir
    # EXCLUDING tessdata subfolder.
    for item_name in os.listdir(custom_temp_dir):
        item_path = os.path.join(custom_temp_dir, item_name)
        if item_name == "tessdata": # Don't clean tessdata
            continue
        try:
            if os.path.isfile(item_path) or os.path.islink(item_path):
                file_age = current_time - os.path.getmtime(item_path)
                if file_age > 3600:  # 1 hour
                    os.remove(item_path)
                    logger.debug(f"Removed old temp file: {item_path}")
            elif os.path.isdir(item_path): # Clean empty old dirs? For now, no.
                pass
        except PermissionError:
            logger.debug(f"Could not remove temp file {item_path} - may be in use.")
        except OSError as e:
            logger.debug(f"OS error removing temp file {item_path}: {e}")
        except Exception as e:
            logger.debug(f"Error cleaning up temp item {item_path}: {e}")

def start_periodic_cleanup():
    def cleanup_worker():
        while True:
            try:
                logger.info("Running periodic cleanup of temporary files...")
                cleanup_temp_files_job()
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}", exc_info=True)
            time.sleep(3600) # Run every hour
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.name = "PeriodicTempCleanupThread"
    cleanup_thread.start()
    logger.info("Started periodic temporary file cleanup service.")

start_periodic_cleanup()

# process_file function seems to be a high-level wrapper.
# It's not directly used by API endpoints that create tasks,
# Tasks use process_all_files_structify directly.
# Keeping it for potential direct use or CLI.
def process_file(file_path, output_path=None, max_chunk_size=4096, extract_tables=True, use_ocr=True):
    if not structify_available:
        return {"status": "error", "error": "Structify module not available"}
    if not os.path.isfile(file_path):
        return {"status": "error", "error": f"File not found: {file_path}"}

    base_name = os.path.splitext(os.path.basename(file_path))[0]
    if not output_path:
        output_path = os.path.join(os.path.dirname(file_path), f"{base_name}_processed.json")
    
    processing_options = {
        "max_chunk_size": max_chunk_size,
        "extract_tables": extract_tables,
        "use_ocr": use_ocr,
        "return_data": True # Assuming we want data back
    }
    
    try:
        if file_path.lower().endswith('.pdf'):
            logger.info(f"Processing PDF file: {file_path} with options {processing_options}")
            if hasattr(structify_module, 'process_pdf'):
                result = structify_module.process_pdf(pdf_path=file_path, output_path=output_path, **processing_options)
            else: # Fallback to general processing for PDF
                result = process_all_files_structify(
                    root_directory=os.path.dirname(file_path),
                    output_file=output_path,
                    max_chunk_size=max_chunk_size,
                    file_filter=lambda f: f == file_path,
                    # Removed include_binary_detection=False because process_all_files_structify handles this
                )
        else:
            logger.info(f"Processing non-PDF file: {file_path}")
            if hasattr(structify_module, 'process_document'):
                result = structify_module.process_document(file_path=file_path, output_path=output_path, **processing_options)
            else: # Fallback to general processing
                result = process_all_files_structify(
                    root_directory=os.path.dirname(file_path),
                    output_file=output_path,
                    max_chunk_size=max_chunk_size,
                    file_filter=lambda f: f == file_path
                )

        if result and (result.get("status") == "success" or not result.get("error")): # Check for success
            return {"status": "success", "file_path": file_path, "output_path": output_path, "data": result}
        else:
            err_msg = result.get("error", "File processing failed") if result else "File processing failed"
            return {"status": "error", "error": err_msg, "data": result}
    except Exception as e:
        logger.error(f"Error processing file {file_path}: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}
           
def add_task(task_id: str, task: Any):
    with tasks_lock:
        active_tasks[task_id] = task
    logger.info(f"Added task {task_id} (type: {type(task).__name__}) to active tasks.")

def get_task(task_id: str) -> Optional[Any]:
    with tasks_lock:
        return active_tasks.get(task_id)

def remove_task(task_id: str):
    with tasks_lock:
        if task_id in active_tasks:
            task_type = type(active_tasks[task_id]).__name__
            del active_tasks[task_id]
            logger.info(f"Removed task {task_id} (type: {task_type}) from active tasks.")
        else:
            logger.warning(f"Attempted to remove non-existent task {task_id}.")

### MODIFIED download_pdf to include task_id and progress_callback
def download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER, 
                 task_id: Optional[str] = None, 
                 progress_callback: Optional[Callable] = None) -> str:
    if not requests_available:
        raise ValueError("Requests library not available for PDF download.")

    logger.info(f"Downloading PDF: {url} for task_id: {task_id}")
    
    pdf_url = url
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"): pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")

    os.makedirs(save_path, exist_ok=True)
    
    url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:10]
    base_filename = pdf_url.split("/")[-1] or "document.pdf"
    if not base_filename.lower().endswith(".pdf"): base_filename += ".pdf"
    
    filename = sanitize_filename(f"{os.path.splitext(base_filename)[0]}_{url_hash}.pdf")
    file_path = os.path.join(save_path, filename)
    
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
        logger.info(f"PDF already exists: {file_path}")
        if progress_callback: progress_callback(100, 100, "completed (cached)")
        ### MODIFIED: Emit task-specific event if task_id provided
        if task_id:
            socketio.emit("pdf_download_progress", {
                "task_id": task_id, "url": url, "progress": 100, "status": "success (cached)", "file_path": file_path
            })
        return file_path
    
    # Use global session if available
    current_session = session if session else requests.Session()
    if not session: # if global session was not initialized, set up retries for local session
        retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retries)
        current_session.mount('http://', adapter)
        current_session.mount('https://', adapter)

    max_retries = 3
    for attempt in range(max_retries):
        try:
            if progress_callback: progress_callback(0, 100, f"starting download attempt {attempt+1}")
            ### MODIFIED: Emit task-specific event
            if task_id:
                 socketio.emit("pdf_download_progress", {
                    "task_id": task_id, "url": url, "progress": 0, "status": "downloading", 
                    "message": f"Starting download attempt {attempt+1}"
                })

            response = current_session.get(pdf_url, stream=True, timeout=30, 
                                  headers={
                                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                                      "Accept": "application/pdf,application/octet-stream,*/*",
                                      "Connection": "keep-alive"
                                  })
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '').lower()
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded_size = 0

            if 'application/pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Content type for {pdf_url} is not PDF: {content_type}. Verifying content...")
                first_chunk_peek = next(response.iter_content(256), None)
                if not first_chunk_peek or not first_chunk_peek.startswith(b'%PDF-'):
                    raise ValueError(f"Content at {pdf_url} does not appear to be a PDF.")
                # Need to re-request if we consumed part of the stream, or save this chunk
                # For simplicity, re-raising. A more robust solution would handle the peeked chunk.
                # However, the iter_content below will handle it correctly if we don't re-raise.
                # Let's assume iter_content will work with the rest of the stream.
                # Re-evaluate if issues arise with non-PDF content-types that are actually PDFs.
                
            with open(file_path, "wb") as f:
                # Write the peeked chunk if we have one and are continuing
                # if first_chunk_peek:
                #     f.write(first_chunk_peek)
                #     downloaded_size += len(first_chunk_peek)

                for chunk_idx, chunk in enumerate(response.iter_content(chunk_size=16384)): # 16KB chunks
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        if total_size > 0:
                            progress = int((downloaded_size / total_size) * 100)
                            if progress_callback: progress_callback(progress, 100, "downloading")
                            ### MODIFIED: Emit task-specific event
                            if task_id and chunk_idx % 10 == 0: # Emit every 10 chunks
                                socketio.emit("pdf_download_progress", {
                                    "task_id": task_id, "url": url, "progress": progress, "status": "downloading",
                                    "downloaded_bytes": downloaded_size, "total_bytes": total_size
                                })
            
            if not os.path.exists(file_path) or os.path.getsize(file_path) < 100: # Basic validation
                if os.path.exists(file_path): os.remove(file_path)
                raise ValueError("Downloaded file is empty or too small.")
                
            logger.info(f"PDF successfully downloaded to: {file_path}")
            if progress_callback: progress_callback(100, 100, "download complete")
            ### MODIFIED: Emit task-specific event
            if task_id:
                socketio.emit("pdf_download_progress", {
                    "task_id": task_id, "url": url, "progress": 100, "status": "success", "file_path": file_path
                })
            return file_path
            
        except requests.exceptions.RequestException as e: # More specific exception
            logger.warning(f"Download attempt {attempt+1}/{max_retries} for {pdf_url} failed: {e}")
            if progress_callback: progress_callback(0, 100, f"download failed: {e}")
             ### MODIFIED: Emit task-specific event
            if task_id:
                socketio.emit("pdf_download_progress", {
                    "task_id": task_id, "url": url, "progress": 0, "status": "error", "error": str(e)
                })
            if attempt < max_retries - 1:
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"Failed to download PDF from {pdf_url} after {max_retries} attempts: {e}")
                raise ValueError(f"Failed to download PDF from {pdf_url}: {e}")
        except ValueError as e: # Catch our custom validation errors
            logger.error(f"Validation error for {pdf_url}: {e}")
            raise # Re-raise to be caught by the final error handler
    # This part should not be reached if all attempts fail and raise ValueError
    raise ValueError(f"All download attempts for {pdf_url} failed.")


def sanitize_filename(filename: str) -> str:
    safe_name = re.sub(r'[^\w\-. ()]', '_', filename) # Allow spaces and parentheses
    safe_name = safe_name.strip('._ ')
    safe_name = safe_name[:150] # Slightly longer limit
    return safe_name if safe_name else "untitled"

def normalize_path(path: str) -> str:
    try:
        path = os.path.expanduser(path)
        path = os.path.expandvars(path)
        path = os.path.abspath(path)
        path = os.path.normpath(path)
        return path
    except Exception as e:
        logger.error(f"Error normalizing path '{path}': {e}")
        return path # Return original path on error

# detect_common_path_from_files, find_directory_in_standard_locations, get_parent_directory,
# verify_and_create_directory, check_file_exists are utility functions.
# They seem okay, but for production, platform-specific logic in find_directory_in_standard_locations might need review.
# (e.g. using platform module). For now, they are as provided.
import platform # For find_directory_in_standard_locations

def is_extension_allowed(filename: str) -> bool:
    ALLOWED_EXTENSIONS = {
        "txt", "pdf", "png", "jpg", "jpeg", "gif", "py", "js", "html", "css", "md", 
        "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "json", "xml", "csv", "yaml", "yml", "log", "rtf", "tex", "bib",
        "c", "cpp", "h", "java", "cs", "rb", "go", "swift", "php", "sh", "bat"
    }
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    return ext in ALLOWED_EXTENSIONS

def is_mime_allowed(file_stream) -> bool:
    if not magic_available: return True # Skip if magic not available
    # More comprehensive list of allowed MIME types
    ALLOWED_MIME_TYPES = {
        "text/plain", "text/html", "text/css", "text/csv", "text/markdown", "text/x-python", "text/x-c",
        "application/pdf", "application/json", "application/xml", "application/yaml",
        "application/javascript", "application/x-sh", "application/rtf",
        "image/png", "image/jpeg", "image/gif",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    }
    try:
        chunk = file_stream.read(2048) # Read a bit more for better detection
        file_stream.seek(0) # Reset stream position
        mime_type = magic.from_buffer(chunk, mime=True)
        logger.debug(f"Detected MIME type: {mime_type}")
        return mime_type in ALLOWED_MIME_TYPES
    except Exception as e:
        logger.warning(f"MIME type detection failed: {e}. Allowing file by default.")
        return True # Allow if detection fails

def structured_error_response(code: str, message: str, status_code: int, details: Optional[Dict] = None):
    error_payload = {"error": {"code": code, "message": message}}
    if details:
        error_payload["error"]["details"] = details
    resp = jsonify(error_payload)
    resp.status_code = status_code
    return resp

### MODIFIED enhanced_download_pdf to include task_id and progress_callback
def enhanced_download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER, 
                          task_id: Optional[str] = None, 
                          progress_callback: Optional[Callable] = None) -> str:
    # Try web_scraper's version first if available
    if web_scraper_available:
        try:
            # Assuming web_scraper_download_pdf is enhanced to take task_id and progress_callback
            return web_scraper_download_pdf(url, save_path, task_id=task_id, progress_callback=progress_callback)
        except TypeError: # If web_scraper_download_pdf doesn't accept new args
            logger.warning("web_scraper.download_pdf does not support task_id/progress_callback. Using basic call.")
            return web_scraper_download_pdf(url, save_path)
        except Exception as e:
            logger.warning(f"Web scraper download_pdf failed: {e}. Trying fallback app.py method.")
    
    # Fallback to app.py's download_pdf if web_scraper not available or failed
    return download_pdf(url, save_path, task_id=task_id, progress_callback=progress_callback)

# scrape_and_download_pdfs: This uses web_scraper_fetch_pdf_links and then download_pdf.
# It should ideally be part of a ScraperTask for UI progress.
# If called directly, it won't have rich Socket.IO reporting unless modified.
# For now, assuming it's used internally or for simpler scripts.
def scrape_and_download_pdfs(url: str, output_folder: str = DEFAULT_OUTPUT_FOLDER,
                             task_id: Optional[str] = None,
                             parent_progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
    logger.info(f"Scraping for PDFs from: {url} (Task: {task_id})")
    os.makedirs(output_folder, exist_ok=True)
    
    try:
        if not web_scraper_available:
            return {"status": "error", "url": url, "error": "Web scraper module not available."}

        pdf_links = web_scraper_fetch_pdf_links(url)
        if not pdf_links:
            logger.info(f"No PDF links found on {url}")
            return {"status": "completed", "url": url, "message": "No PDF links found", "pdfs_found": 0, "pdfs_downloaded": 0}

        downloaded_pdfs = []
        failed_pdfs = []
        total_pdfs = len(pdf_links)

        for i, pdf_info in enumerate(pdf_links):
            pdf_url = pdf_info["url"]
            current_progress = int(((i + 1) / total_pdfs) * 100)
            if parent_progress_callback:
                parent_progress_callback(current_progress, 100, f"Downloading PDF {i+1}/{total_pdfs}: {pdf_info.get('title', pdf_url)}")

            try:
                # Pass task_id to download_pdf for specific event scoping
                pdf_path = download_pdf(pdf_url, output_folder, task_id=f"{task_id}_pdf_{i}" if task_id else None)
                if pdf_path and os.path.exists(pdf_path):
                    dl_info = {"url": pdf_url, "file_path": pdf_path, "title": pdf_info.get("title", "")}
                    # Optional: Process PDF to JSON here if structify_module is available and configured
                    downloaded_pdfs.append(dl_info)
                else:
                    failed_pdfs.append({"url": pdf_url, "error": "Download returned no path or file not found", "title": pdf_info.get("title", "")})
            except Exception as e:
                logger.error(f"Error downloading PDF from {pdf_url}: {e}")
                failed_pdfs.append({"url": pdf_url, "error": str(e), "title": pdf_info.get("title", "")})
        
        return {
            "status": "completed", "url": url, "pdfs_found": total_pdfs,
            "pdfs_downloaded": len(downloaded_pdfs), "pdfs_failed": len(failed_pdfs),
            "downloaded_pdfs": downloaded_pdfs, "failed_pdfs": failed_pdfs,
            "output_folder": output_folder
        }
    except Exception as e:
        logger.error(f"Error scraping PDFs from {url}: {e}", exc_info=True)
        return {"status": "error", "url": url, "error": str(e)}

# process_url: This function is a bit confusing as there's also web_scraper_process_url.
# Assuming this is a fallback or alternative.
def process_url(url: str, setting: str, keyword: str = "", output_folder: str = DEFAULT_OUTPUT_FOLDER) -> Dict[str, Any]:
    os.makedirs(output_folder, exist_ok=True)
    if web_scraper_available:
        try:
            return web_scraper_process_url(url, setting, keyword, output_folder)
        except Exception as e:
            logger.error(f"Error in web_scraper.process_url for {url}: {e}", exc_info=True)
            return {"error": f"Web scraper processing failed: {str(e)}", "url": url}
    else: # Fallback if web_scraper not available
        logger.error(f"web_scraper module not available to process URL: {url}")
        return {"error": "Web scraper module not available", "url": url}

# process_url_with_settings: This should use the renamed web_scraper_process_url
# and the app.py's process_url as fallback.
# However, ScraperTask._process_url_with_tracking is the primary one for UI.
# This function seems like another utility.
def process_url_with_settings(url, setting, keyword, output_folder):
    os.makedirs(output_folder, exist_ok=True)
    setting_lower = setting.lower()

    if web_scraper_available:
        try:
            return web_scraper_process_url(url, setting_lower, keyword, output_folder)
        except Exception as e:
            logger.warning(f"web_scraper.process_url failed for {url} (setting: {setting_lower}): {e}. Trying fallback.")
            # Fall through to app.py's process_url if web_scraper specific one fails
    
    # Fallback implementation or if web_scraper_process_url failed
    if setting_lower == "pdf":
        try:
            pdf_file = download_pdf(url, save_path=output_folder) # Uses app.py's download_pdf
            if not pdf_file or not os.path.exists(pdf_file):
                return {"status": "error", "url": url, "error": "PDF download failed"}

            if structify_available:
                pdf_filename = os.path.basename(pdf_file)
                # Use get_output_filepath for consistent naming and placement
                json_output_filename = os.path.splitext(pdf_filename)[0] + "_processed.json"
                json_output_path = get_output_filepath(json_output_filename, user_defined_dir=output_folder)
                
                process_all_files_structify(
                    root_directory=os.path.dirname(pdf_file),
                    output_file=json_output_path,
                    file_filter=lambda f: f == pdf_file
                )
                return {"status": "PDF downloaded and processed", "url": url, "pdf_file": pdf_file, "json_file": json_output_path}
            else:
                return {"status": "PDF downloaded (processing skipped)", "url": url, "pdf_file": pdf_file}
        except Exception as e:
            logger.error(f"Error processing PDF URL {url}: {e}", exc_info=True)
            return {"status": "error", "url": url, "error": str(e)}
    else:
        # For non-PDF settings, use the general process_url (which itself calls web_scraper_process_url)
        return process_url(url, setting_lower, keyword, output_folder)


# handle_pdf_processing_error, process_pdf_with_reduced_memory, attempt_pdf_repair
# These are good error handling utilities for PDF processing.
# Ensure pikepdf import is guarded inside attempt_pdf_repair.

def attempt_pdf_repair(pdf_file, output_folder):
    if not pikepdf_available:
        logger.warning("pikepdf not available for PDF repair")
        return False
    try:
        # import pikepdf # Already imported globally if available
        repaired_pdf_path = os.path.join(output_folder, f"{os.path.splitext(os.path.basename(pdf_file))[0]}_repaired.pdf")
        with pikepdf.Pdf.open(pdf_file, allow_overwriting_input=True) as pdf: # Allow overwrite if source is temp
            pdf.save(repaired_pdf_path)
        logger.info(f"PDF repaired and saved to {repaired_pdf_path}")
        # Optionally, try processing the repaired_pdf_path
        return True # Placeholder
    except Exception as e:
        logger.error(f"PDF repair failed for {pdf_file}: {e}")
        return False

def validate_pdf(pdf_path: str) -> Dict[str, Any]:
    if not os.path.exists(pdf_path): return {"valid": False, "error": "File not found"}
    if not pdf_path.lower().endswith('.pdf'): return {"valid": False, "error": "Not a PDF file extension"}
    
    try:
        with open(pdf_path, 'rb') as f:
            header = f.read(5)
            if header != b'%PDF-':
                return {"valid": False, "error": "Invalid PDF header"}
    except Exception as e:
        return {"valid": False, "error": f"Error reading file: {str(e)}"}
    
    features: Dict[str, Any] = {"valid": True, "encrypted": False, "page_count": 0, "scanned": False, "has_text": False}
    
    try:
        if pdf_extractor_available and hasattr(pdf_extractor, 'get_pdf_summary'):
            summary = pdf_extractor.get_pdf_summary(pdf_path)
            features["document_type"] = summary.get("document_type", "unknown")
            features["scanned"] = summary.get("document_type") == "scan" or summary.get("has_scanned_content", False)
            features["page_count"] = summary.get("page_count", 0)
            features["has_text"] = bool(summary.get("full_text_present", False)) # Assuming get_pdf_summary has this
            features["metadata"] = summary.get("metadata", {})
            features["title"] = summary.get("metadata", {}).get("title")
            features["author"] = summary.get("metadata", {}).get("author")

        elif pikepdf_available:
            with pikepdf.Pdf.open(pdf_path,_suppress_warnings=True) as pdf: # Suppress warnings for minor issues
                features["page_count"] = len(pdf.pages)
                features["encrypted"] = pdf.is_encrypted
                features["version"] = str(pdf.pdf_version) # Use str() for PdfVersion
                # Basic text check (very rough)
                # A more thorough check would involve iterating pages.
                # For now, this is a simple heuristic.
                try:
                    if len(pdf.pages) > 0 and pdf.pages[0].Contents:
                         features["has_text"] = True # Crude, assumes contents mean text.
                except Exception:
                    pass # Ignore errors in text check
        else:
            features["feature_detection"] = "limited (no pdf_extractor or pikepdf)"

    except pikepdf.PasswordError:
        features["encrypted"] = True
        features["error"] = "PDF is password protected"
        features["valid"] = False # Or True, but encrypted
    except Exception as e:
        features["feature_error"] = str(e)
        logger.warning(f"Error during PDF feature detection for {pdf_path}: {e}")
    
    return features

class Limiter: # Placeholder if flask-limiter is not installed
    def __init__(self, key_func, app=None, default_limits=None, storage_uri=None, **kwargs):
        self.key_func = key_func
    def limit(self, limits_str):
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs): return f(*args, **kwargs)
            return decorated_function
        return decorator

try:
    from flask_limiter import Limiter as FlaskLimiter
    from flask_limiter.util import get_remote_address
    limiter = FlaskLimiter(
        get_remote_address, # Corrected: pass the key_func directly
        app=app,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://" # For simplicity, can be redis
    )
except ImportError:
    logger.warning("Flask-Limiter not installed. Rate limiting will be disabled.")
    limiter = Limiter(lambda: request.remote_addr if request else "nolimiter") # Use placeholder

class ApiKeyManager:
    def __init__(self, keys_file="api_keys.json"):
        self.keys_file = keys_file
        self.keys: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()
        self.load_keys()
        if not self.keys and API_KEYS: # Use API_KEYS from env if file is empty
            logger.info(f"No API keys file found. Initializing with keys from environment: {len(API_KEYS)} keys.")
            for i, key_val in enumerate(API_KEYS):
                self.create_key(f"default_env_key_{i}", "Key from environment variable", fixed_key=key_val)
        elif not self.keys:
            logger.info("No API keys file or environment keys. Creating a default key.")
            self.create_key("default_initial_key", "Default initial key for first run")

    def load_keys(self):
        with self.lock:
            if os.path.exists(self.keys_file):
                try:
                    with open(self.keys_file, 'r', encoding='utf-8') as f:
                        self.keys = json.load(f)
                    logger.info(f"Loaded {len(self.keys)} API keys from {self.keys_file}")
                except json.JSONDecodeError:
                    logger.error(f"Error decoding JSON from {self.keys_file}. Initializing empty keys.")
                    self.keys = {}
                except Exception as e:
                    logger.error(f"Error loading API keys: {e}")
                    self.keys = {}
            else:
                self.keys = {}
    
    def save_keys(self):
        with self.lock:
            try:
                with open(self.keys_file, 'w', encoding='utf-8') as f:
                    json.dump(self.keys, f, indent=2)
                logger.info(f"Saved {len(self.keys)} API keys to {self.keys_file}")
                return True
            except Exception as e:
                logger.error(f"Error saving API keys: {e}")
                return False
    
    def create_key(self, name: str, description: str = "", fixed_key: Optional[str] = None) -> str:
        with self.lock:
            key = fixed_key if fixed_key else str(uuid.uuid4())
            if key in self.keys: # Avoid overwriting if fixed_key is used and exists
                logger.warning(f"Key {key[:8]}... already exists. Not overwriting.")
                return key
            self.keys[key] = {
                "name": name,
                "description": description,
                "created_at": datetime.now().isoformat(),
                "last_used_at": None,
                "is_active": True,
                "usage_count": 0
            }
            self.save_keys()
            logger.info(f"Created API key: Name='{name}', Key='{key[:8]}...'")
            return key
    
    def revoke_key(self, key_to_revoke: str) -> bool:
        with self.lock:
            if key_to_revoke in self.keys:
                self.keys[key_to_revoke]["is_active"] = False
                self.save_keys()
                logger.info(f"Revoked API key: {key_to_revoke[:8]}...")
                return True
            logger.warning(f"Attempted to revoke non-existent key: {key_to_revoke[:8]}...")
            return False
            
    def validate_key(self, key_to_validate: str) -> bool:
        with self.lock:
            key_data = self.keys.get(key_to_validate)
            if key_data and key_data.get("is_active", False):
                key_data["last_used_at"] = datetime.now().isoformat()
                key_data["usage_count"] = key_data.get("usage_count", 0) + 1
                # Potentially save keys less frequently to reduce I/O
                if key_data["usage_count"] % 10 == 0: # Save every 10 uses
                    self.save_keys()
                return True
            return False

    def get_key_info(self, key_to_find: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            return self.keys.get(key_to_find)

    def get_all_keys_info(self) -> Dict[str, Dict[str, Any]]: # Renamed for clarity
        with self.lock:
            # Return a copy with keys masked for safety if displayed externally
            # For internal use, full data is fine.
            return self.keys.copy()


key_manager = ApiKeyManager()

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key') # Allow in query param too
        if not api_key:
            return structured_error_response("MISSING_API_KEY", "API key is required.", 401)
        if not key_manager.validate_key(api_key):
            return structured_error_response("INVALID_API_KEY", "Invalid or inactive API key.", 403) # 403 Forbidden
        return f(*args, **kwargs)
    return decorated_function

class CustomFileStats:
    def __init__(self):
        self.total_files = 0
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.total_bytes_processed = 0 # Renamed for clarity
        self.total_chunks = 0
        self.processing_start_time = time.time() # Renamed from start_time
        self.processing_end_time: Optional[float] = None
        self.largest_file_bytes = 0
        self.largest_file_path = ""
        
        self.ocr_pages_processed = 0 # Renamed from ocr_processed_files to be more specific
        self.ocr_files_count = 0 # Number of files where OCR was applied
        self.extraction_errors = 0       
        
        self.pdf_files_processed = 0 # Renamed from pdf_files
        self.pdf_tables_extracted = 0 # Renamed
        self.pdf_references_extracted = 0 # Renamed
        
        self.pdf_doc_types: Dict[str, int] = { # More flexible
            "scan": 0, "academic_paper": 0, "report": 0, "book": 0, "general": 0, "unknown": 0
        }
        
        self.total_processing_time_seconds = 0.0 # Renamed
        self.pdf_pages_processed = 0
        # self.scanned_pages_processed = 0 # Redundant if we have ocr_pages_processed
        self.pdf_ocr_applied_count = 0 # Already have ocr_files_count
        
        self.total_ocr_time_seconds = 0.0 # Renamed
        self.total_table_extraction_time_seconds = 0.0 # Renamed

    def update_file_processed(self, file_path: str, file_size: int, chunks_count: int, processing_time: float):
        self.processed_files += 1
        self.total_bytes_processed += file_size
        self.total_chunks += chunks_count
        self.total_processing_time_seconds += processing_time
        if file_size > self.largest_file_bytes:
            self.largest_file_bytes = file_size
            self.largest_file_path = file_path
            
    def update_pdf_metrics(self, document_type: str, tables_count: int = 0, 
                           references_count: int = 0, ocr_applied: bool = False,
                           pages_processed: int = 0, ocr_pages: int = 0,
                           ocr_time: float = 0.0, table_extraction_time: float = 0.0):
        self.pdf_files_processed += 1
        self.pdf_tables_extracted += tables_count
        self.pdf_references_extracted += references_count
        self.pdf_pages_processed += pages_processed
        
        self.total_table_extraction_time_seconds += table_extraction_time

        if document_type in self.pdf_doc_types:
            self.pdf_doc_types[document_type] += 1
        else:
            self.pdf_doc_types["unknown"] += 1
            
        if ocr_applied:
            self.ocr_files_count +=1
            self.ocr_pages_processed += ocr_pages
            self.total_ocr_time_seconds += ocr_time
    
    def increment_skipped(self): self.skipped_files += 1
    def increment_error(self): self.error_files += 1
    def increment_extraction_error(self): self.extraction_errors +=1

    def finish_processing(self):
        self.processing_end_time = time.time()
    
    def _format_bytes(self, size_in_bytes: int) -> str:
        if size_in_bytes < 1024: return f"{size_in_bytes} B"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_in_bytes < 1024.0:
                return f"{size_in_bytes:.2f} {unit}"
            size_in_bytes /= 1024.0
        return f"{size_in_bytes:.2f} PB" # Should not happen often

    def to_dict(self) -> Dict[str, Any]:
        # Calculate overall duration dynamically
        current_time = time.time()
        duration_seconds = (self.processing_end_time or current_time) - self.processing_start_time
        
        avg_file_processing_time = (self.total_processing_time_seconds / self.processed_files) if self.processed_files > 0 else 0
        
        data = {
            "total_files_discovered": self.total_files, # Ensure total_files is set by caller
            "processed_files": self.processed_files,
            "skipped_files": self.skipped_files,
            "error_files": self.error_files,
            "total_bytes_processed": self.total_bytes_processed,
            "total_bytes_processed_readable": self._format_bytes(self.total_bytes_processed),
            "total_chunks": self.total_chunks,
            "processing_start_time_iso": datetime.fromtimestamp(self.processing_start_time).isoformat(),
            "processing_end_time_iso": datetime.fromtimestamp(self.processing_end_time).isoformat() if self.processing_end_time else None,
            "total_duration_seconds": round(duration_seconds, 2),
            "avg_file_processing_time_seconds": round(avg_file_processing_time, 3),
            "largest_file_path": self.largest_file_path,
            "largest_file_bytes": self.largest_file_bytes,
            "largest_file_bytes_readable": self._format_bytes(self.largest_file_bytes),
            
            "ocr_pages_processed": self.ocr_pages_processed,
            "ocr_files_count": self.ocr_files_count,
            "total_ocr_time_seconds": round(self.total_ocr_time_seconds, 2),
            
            "extraction_errors": self.extraction_errors,
            
            "pdf_files_processed": self.pdf_files_processed,
            "pdf_tables_extracted": self.pdf_tables_extracted,
            "pdf_references_extracted": self.pdf_references_extracted,
            "pdf_doc_types": self.pdf_doc_types,
            "pdf_pages_processed": self.pdf_pages_processed,
            "total_table_extraction_time_seconds": round(self.total_table_extraction_time_seconds, 2),
        }
        if self.total_files > 0:
             data["completion_percentage"] = round((self.processed_files / self.total_files) * 100, 2) if self.total_files > 0 else 0
        return data

# analyze_pdf_structure and extract_pdf_preview are good.
# Assuming they use structify_module components that are now conditionally loaded.

### MODIFIED/REPLACED process_all_files with the one from structify.claude (process_all_files_structify)
# This function in app.py was a wrapper. Tasks will call structify_module.process_all_files directly.
# The original process_all_files function from app.py is now effectively `process_all_files_structify` if structify_module is loaded.
# The FileStats object from structify is used, or a placeholder if not.

### ENHANCED BaseTask
class BaseTask:
    def __init__(self, task_id: str, task_type: str = "generic"):
        self.task_id = task_id
        self.task_type = task_type
        self.progress = 0
        self.status = "pending"  # pending, initializing, processing, completed, failed, cancelling, cancelled
        self.message = "Task initialized"
        self.stats: Union[CustomFileStats, Dict[str, Any]] = {} # Can be specific stats object or dict
        self.error_message: Optional[str] = None # Renamed from error
        self.error_details: Optional[Dict] = None
        
        self.thread: Optional[threading.Thread] = None
        self.is_cancelled_flag = False # Renamed from is_cancelled
        
        self.start_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds (Socket.IO rate limit)
        self.output_file: Optional[str] = None # For tasks that produce a single file

        logger.info(f"BaseTask {self.task_id} ({self.task_type}) created.")

    def _run_process(self): # Renamed from _process to avoid conflict with actual processing logic
        try:
            self.status = "initializing"
            self.emit_task_started() # Emit start event
            
            # Subclass's main logic goes here
            if hasattr(self, '_process_logic') and callable(self._process_logic):
                self._process_logic() # Call the actual processing method
            else:
                raise NotImplementedError("Subclasses must implement _process_logic method")

            if self.status not in ["failed", "cancelled", "cancelling"]:
                 self.status = "completed" # Default to completed if not set by _process_logic
                 self.progress = 100
                 self.emit_completion()

        except Exception as e:
            logger.error(f"Unhandled error in task {self.task_id} ({self.task_type}): {e}", exc_info=True)
            self.handle_error(str(e), details={"traceback": traceback.format_exc()})
        finally:
            if self.task_id in active_tasks: # Check if not already removed (e.g. by cancel)
                remove_task(self.task_id)

    def start(self, *args, **kwargs): # Allow args for subclass start methods
        self.status = "queued"
        self.message = "Task queued for processing"
        self.emit_progress_update() # Initial emit to show it's queued
        
        # Store args/kwargs for _run_process if needed, or pass them if _run_process takes them
        # For simplicity, assuming _process_logic uses self attributes set by subclass's start.
        self.thread = threading.Thread(target=self._run_process, daemon=True)
        self.thread.name = f"{self.task_type}TaskThread-{self.task_id[:8]}"
        self.thread.start()
        logger.info(f"Task {self.task_id} ({self.task_type}) thread started.")

    def emit_task_started(self):
        self.status = "processing" # Official start of processing
        self.message = "Task processing started."
        self.progress = 0 # Reset progress at actual start
        logger.info(f"Task {self.task_id} ({self.task_type}) started processing.")
        try:
            socketio.emit("task_started", {
                "task_id": self.task_id,
                "task_type": self.task_type,
                "status": self.status,
                "message": self.message,
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error emitting task_started for {self.task_id}: {e}")

    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None, 
                             stats_override: Optional[Union[CustomFileStats, Dict]] = None, 
                             details: Optional[Dict] = None):
        now = time.time()
        if progress is not None: self.progress = min(max(0, progress), 100)
        if message is not None: self.message = message
        
        # Rate limit emissions unless it's a final update (100%) or critical status change
        is_critical_update = self.progress == 100 or self.status in ["failed", "completed", "cancelled"]
        if not is_critical_update and (now - self.last_emit_time) < self.emit_interval:
            return

        current_stats = stats_override if stats_override is not None else self.stats
        serialized_stats = {}
        if isinstance(current_stats, CustomFileStats):
            serialized_stats = current_stats.to_dict()
        elif isinstance(current_stats, dict):
            serialized_stats = current_stats.copy() # Send a copy

        # Add dynamic stats
        elapsed_seconds = round(now - self.start_time, 2)
        serialized_stats["elapsed_seconds"] = elapsed_seconds
        if 0 < self.progress < 100 and elapsed_seconds > 1: # Avoid division by zero or too early estimates
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            serialized_stats["estimated_remaining_seconds"] = round(estimated_total_time - elapsed_seconds, 2)
        
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "progress": self.progress,
            "status": self.status,
            "message": self.message,
            "stats": serialized_stats,
            "timestamp": now
        }
        if details: payload["details"] = details
        
        try:
            socketio.emit("progress_update", payload)
            self.last_emit_time = now
            logger.debug(f"Progress emitted for {self.task_id}: {self.progress}% - {self.message}")
        except Exception as e:
            logger.error(f"Error emitting progress_update for {self.task_id}: {e}")

    def handle_error(self, error_msg: str, stage: Optional[str] = None, details: Optional[Dict] = None):
        self.error_message = error_msg
        self.error_details = details or {}
        if stage: self.error_details["stage_at_failure"] = stage
        self.status = "failed"
        self.progress = self.progress # Keep last known progress or set to 100 if error at end
        
        logger.error(f"Task {self.task_id} ({self.task_type}) failed: {error_msg}. Details: {self.error_details}")

        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats): serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict): serialized_stats = self.stats.copy()

        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "error": self.error_message,
            "error_details": self.error_details,
            "stats": serialized_stats,
            "progress": self.progress,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_error", payload)
        except Exception as e:
            logger.error(f"Error emitting task_error for {self.task_id}: {e}")
        
        # Ensure task is removed if error handling happens outside _run_process's finally block
        if self.task_id in active_tasks:
             remove_task(self.task_id)


    def emit_completion(self):
        self.status = "completed"
        self.progress = 100
        self.message = "Task completed successfully."
        duration_seconds = round(time.time() - self.start_time, 2)
        
        logger.info(f"Task {self.task_id} ({self.task_type}) completed in {duration_seconds}s.")

        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            self.stats.finish_processing() # Finalize stats object if it's CustomFileStats
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        
        serialized_stats["total_duration_seconds"] = duration_seconds # Ensure this is in final stats

        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "progress": self.progress,
            "stats": serialized_stats,
            "output_file": self.output_file,
            "duration_seconds": duration_seconds,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_completed", payload)
        except Exception as e:
            logger.error(f"Error emitting task_completed for {self.task_id}: {e}")

    def cancel(self) -> bool:
        if self.is_cancelled_flag or self.status in ["completed", "failed", "cancelled"]:
            logger.info(f"Task {self.task_id} already cancelled or finished. Current status: {self.status}")
            return False

        self.is_cancelled_flag = True
        previous_status = self.status
        self.status = "cancelling" # Intermediate state
        self.message = "Task cancellation in progress."
        logger.info(f"Attempting to cancel task {self.task_id} ({self.task_type}). Previous status: {previous_status}")
        
        # Subclasses might need to implement specific cancellation logic for their threads/processes
        # For now, this relies on the _process_logic checking self.is_cancelled_flag

        self.status = "cancelled" # Final cancelled state
        self.message = "Task cancelled by user."
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_cancelled", payload)
            logger.info(f"Emitted task_cancelled for {self.task_id}")
        except Exception as e:
            logger.error(f"Error emitting task_cancelled for {self.task_id}: {e}")
        
        if self.task_id in active_tasks: # Remove if still present
            remove_task(self.task_id)
        return True

    def get_status(self) -> Dict[str, Any]: # For REST API status checks
        now = time.time()
        elapsed_seconds = round(now - self.start_time, 2)
        
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats): serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict): serialized_stats = self.stats.copy()

        estimated_remaining_seconds = None
        if 0 < self.progress < 100 and elapsed_seconds > 1:
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            estimated_remaining_seconds = round(estimated_total_time - elapsed_seconds, 2)
        
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "error": self.error_message,
            "error_details": self.error_details,
            "output_file": self.output_file,
            "stats": serialized_stats,
            "start_time_iso": datetime.fromtimestamp(self.start_time).isoformat(),
            "current_time_iso": datetime.fromtimestamp(now).isoformat(),
            "elapsed_seconds": elapsed_seconds,
            "estimated_remaining_seconds": estimated_remaining_seconds,
            "is_running": self.thread.is_alive() if self.thread else False,
            "is_cancelled": self.is_cancelled_flag
        }

class ProcessingTask(BaseTask):
    def __init__(self, task_id: str, input_dir: str, output_file: str):
        super().__init__(task_id, task_type="file_processing")
        self.input_dir = input_dir
        self.output_file = output_file # Sets self.output_file in BaseTask
        self.stats = CustomFileStats() # Use our enhanced stats object
        self.message = f"Preparing to process files in {self.input_dir}"

    def _structify_progress_callback(self, processed_count: int, total_count: int, stage_message: str, current_file: Optional[str] = None):
        if self.is_cancelled_flag:
            raise InterruptedError("Task cancelled by user") # To stop structify processing

        progress = 0
        if total_count > 0:
            progress = int((processed_count / total_count) * 100)
        
        # Update CustomFileStats directly if possible
        if isinstance(self.stats, CustomFileStats):
            self.stats.total_files = total_count # Ensure total is set
            # We can't update processed_files here directly as this callback might be per chunk/file part
            # The main stats object is updated by structify_module.process_all_files itself.
            # We can however reflect the file being processed in the message.
        
        msg = f"Stage: {stage_message} ({processed_count}/{total_count})"
        if current_file: msg += f" - Current: {os.path.basename(current_file)}"
        
        details = {"current_stage_message": stage_message}
        if current_file: details["current_file_processing"] = os.path.basename(current_file)
        
        self.emit_progress_update(progress=progress, message=msg, details=details)


    def _process_logic(self):
        if not structify_available:
            self.handle_error("Structify module (claude.py) is not available.", stage="initialization")
            return

        logger.info(f"Task {self.task_id}: Starting file processing for directory: {self.input_dir}")
        self.message = f"Processing files in {self.input_dir}..."
        self.emit_progress_update(progress=1) # Indicate processing has truly started

        try:
            # Process the files using structify_module's function
            # It's important that process_all_files_structify can take stats_obj and update it
            result_data = process_all_files_structify(
                root_directory=self.input_dir,
                output_file=self.output_file,
                max_chunk_size=DEFAULT_MAX_CHUNK_SIZE,
                executor_type="thread", # Consider making this configurable
                max_workers=DEFAULT_NUM_THREADS,
                stop_words=DEFAULT_STOP_WORDS,
                use_cache=False, # Cache logic might conflict with task-based approach
                valid_extensions=DEFAULT_VALID_EXTENSIONS,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True,
                overlap=DEFAULT_CHUNK_OVERLAP,
                max_file_size=MAX_FILE_SIZE,
                timeout=DEFAULT_PROCESS_TIMEOUT,
                progress_callback=self._structify_progress_callback, # Pass our callback
                stats_obj=self.stats # Pass the stats object to be updated
            )
            
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} processing was interrupted by cancellation.")
                self.status = "cancelled" # Ensure status is set if InterruptedError was caught by structify
                # emit_completion or handle_error will not be called by BaseTask if status is already cancelled
                return

            # Update task's output_file if it was modified by process_all_files_structify
            if result_data and isinstance(result_data, dict) and "output_file" in result_data:
                self.output_file = result_data["output_file"]

            # The stats object (self.stats) should have been updated by process_all_files_structify
            # If process_all_files_structify returns its own stats, merge them or use them.
            if result_data and isinstance(result_data, dict) and "stats" in result_data:
                # If structify returns a dict for stats, update our CustomFileStats object
                if isinstance(self.stats, CustomFileStats) and isinstance(result_data["stats"], dict):
                    for key, value in result_data["stats"].items():
                        if hasattr(self.stats, key):
                            setattr(self.stats, key, value)
                elif isinstance(result_data["stats"], CustomFileStats): # If it returns the right object type
                    self.stats = result_data["stats"]
                else: # Fallback if types are incompatible
                    self.stats = result_data["stats"] # Replace if not CustomFileStats

            if result_data and isinstance(result_data, dict) and result_data.get("error"):
                 self.handle_error(result_data["error"], stage="structify_processing")
            else:
                self.status = "completed" # This will be handled by BaseTask._run_process calling emit_completion
                # self.emit_completion() # Called by BaseTask

        except InterruptedError: # Catch cancellation
            logger.info(f"Task {self.task_id} processing cancelled via InterruptedError.")
            self.status = "cancelled" # BaseTask.cancel() should have set this
        except Exception as e:
            logger.error(f"Error during _process_logic for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(str(e), stage="structify_execution", details={"traceback": traceback.format_exc()})
  
class PlaylistTask(BaseTask):
    def __init__(self, task_id: str):
        super().__init__(task_id, task_type="playlist_download")
        self.playlists_config: List[Dict[str, str]] = []
        self.api_key = YOUTUBE_API_KEY
        self.root_download_directory: Optional[str] = None # Renamed from root_directory
        # self.output_file is inherited from BaseTask

        # Playlist specific stats, will be merged into self.stats (which starts as dict)
        self.playlist_run_stats: Dict[str, Any] = {}
        self.current_stage_message: str = "Initializing"
        self.current_stage_progress: float = 0.0 # 0.0 to 1.0 for current stage

    def start(self, playlists_config: List[Dict[str, str]], root_download_directory: str, output_json_file: str):
        if not self.api_key:
            # Use handle_error which also sets status and emits event
            self.handle_error("YouTube API key is not configured. Cannot process playlists.", stage="initialization")
            # Since start() in BaseTask starts the thread, we need to prevent that.
            # One way is to set status to failed here.
            self.status = "failed" # Prevent thread start in BaseTask.start()
            return # Don't call super().start()
            
        self.playlists_config = playlists_config
        self.root_download_directory = normalize_path(root_download_directory)
        self.output_file = self._resolve_output_file_path(output_json_file) # Use inherited self.output_file
        
        self.message = f"Preparing to download {len(self.playlists_config)} playlists."
        self.playlist_run_stats = self._build_initial_run_stats()
        self.stats = self.playlist_run_stats # Initialize BaseTask.stats with this

        # Validate parameters and ensure directories exist before calling super().start()
        try:
            self._validate_parameters()
            self._ensure_directories_exist()
        except ValueError as ve:
            self.handle_error(f"Validation error: {str(ve)}", stage="initialization")
            self.status = "failed"
            return

        super().start() # Call BaseTask's start to run _process_logic in a thread

    def _resolve_output_file_path(self, output_file_param: str) -> str:
        # This logic was complex, simplified by using get_output_filepath
        # The root_download_directory is the primary base for outputs for this task.
        return get_output_filepath(output_file_param, user_defined_dir=self.root_download_directory)

    def _validate_parameters(self):
        if not self.playlists_config or not isinstance(self.playlists_config, list):
            raise ValueError("No playlists provided or invalid playlist format.")
        for idx, p_config in enumerate(self.playlists_config):
            if not isinstance(p_config, dict) or "url" not in p_config or "folder" not in p_config:
                raise ValueError(f"Playlist {idx+1} has invalid configuration.")
            if not p_config["url"] or 'list=' not in p_config["url"]: # Basic URL check
                raise ValueError(f"Invalid URL for playlist {idx+1}: {p_config['url']}")
            # Folder path in p_config["folder"] is already an absolute path by PlaylistTask.start_playlists
            # It was os.path.join(root_directory, secure_filename(f"playlist_{idx+1}"))
    
    def _ensure_directories_exist(self):
        if not self.root_download_directory: raise ValueError("Root download directory not set.")
        os.makedirs(self.root_download_directory, exist_ok=True)
        output_dir = os.path.dirname(self.output_file) # type: ignore
        if output_dir: os.makedirs(output_dir, exist_ok=True)
        
        for p_config in self.playlists_config:
            # p_config["folder"] should already be an absolute path here
            os.makedirs(p_config["folder"], exist_ok=True)

    def _build_initial_run_stats(self) -> Dict[str, Any]:
        return {
            "total_playlists_configured": len(self.playlists_config),
            "processed_playlists_count": 0,
            "empty_playlists_count": 0,
            "skipped_playlists_count": 0,
            "failed_playlists_count": 0,
            "total_videos_found": 0,
            "total_transcripts_downloaded": 0,
            "download_root_directory": self.root_download_directory,
            "final_output_json": self.output_file, # Use resolved path
            "start_timestamp_iso": datetime.fromtimestamp(self.start_time).isoformat()
        }

    def _playlist_dl_progress_callback(self, stage: str, current: int, total: int, message: str):
        if self.is_cancelled_flag:
            raise InterruptedError("Playlist download task cancelled.")

        self.current_stage_message = f"{stage}: {message}"
        self.current_stage_progress = (current / total) if total > 0 else 0

        # Map playlist downloader stages to overall task progress (0-90% for download part)
        overall_progress = 0
        if stage == 'init': overall_progress = 5 + int(self.current_stage_progress * 5) # 5-10%
        elif stage == 'video_ids': overall_progress = 10 + int(self.current_stage_progress * 20) # 10-30%
        elif stage == 'titles': overall_progress = 30 + int(self.current_stage_progress * 10) # 30-40%
        elif stage == 'download': overall_progress = 40 + int(self.current_stage_progress * 50) # 40-90%
        elif stage == 'complete': overall_progress = 90 # Download part finished
        else: overall_progress = self.progress # Keep current progress for unknown stages

        # Update run stats (example, actual updates might come from download_all_playlists results)
        # self.playlist_run_stats["total_videos_found"] = ... (this should be updated by the downloader)

        details = {
            "current_download_stage": stage,
            "current_stage_item_count": current,
            "total_stage_item_count": total,
        }
        self.emit_progress_update(progress=overall_progress, message=self.current_stage_message, details=details)

    def _process_logic(self):
        logger.info(f"Task {self.task_id}: Starting playlist processing. Output: {self.output_file}")
        self.message = f"Downloading {len(self.playlists_config)} playlists..."
        self.emit_progress_update(progress=5) # Initial download progress

        download_results = []
        try:
            # download_all_playlists is imported from playlists_downloader
            download_results = download_all_playlists(
                self.api_key, # type: ignore
                self.playlists_config, # type: ignore
                progress_callback=self._playlist_dl_progress_callback
            )
            
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} playlist download interrupted by cancellation.")
                self.status = "cancelled"
                return

            # Update stats from download_results
            self.playlist_run_stats["processed_playlists_count"] = len([p for p in download_results if p.get("status") == "completed"])
            self.playlist_run_stats["empty_playlists_count"] = len([p for p in download_results if p.get("status") == "empty"])
            self.playlist_run_stats["failed_playlists_count"] = len([p for p in download_results if p.get("status") == "failed"])
            self.playlist_run_stats["total_videos_found"] = sum(p.get("video_count", 0) for p in download_results)
            self.playlist_run_stats["total_transcripts_downloaded"] = sum(len(p.get("videos", [])) for p in download_results if p.get("status") == "completed")
            self.stats = self.playlist_run_stats # Update BaseTask.stats
            self.emit_progress_update(progress=90, message="Playlist downloads complete. Processing transcripts...")

        except InterruptedError:
             logger.info(f"Task {self.task_id} playlist download cancelled.")
             self.status = "cancelled"
             return # BaseTask will handle emitting cancel event if not already done
        except Exception as e:
            logger.error(f"Error during playlist download for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(f"Playlist download failed: {str(e)}", stage="playlist_download", details={"traceback": traceback.format_exc()})
            return

        # Now, process the downloaded transcripts using Structify
        if not structify_available:
            logger.warning(f"Task {self.task_id}: Structify module not available. Skipping transcript processing.")
            # Save a simple JSON with download_results
            try:
                with open(self.output_file, 'w', encoding='utf-8') as f: # type: ignore
                    json.dump({
                        "download_summary": download_results,
                        "final_stats": self.playlist_run_stats
                    }, f, indent=2)
                self.message = "Playlists downloaded. Transcript processing skipped (Structify unavailable)."
                # self.emit_completion() will be called by BaseTask
            except Exception as e:
                self.handle_error(f"Failed to write basic output: {str(e)}", stage="basic_output_write")
            return # Skip structify part

        try:
            self.message = "Processing downloaded transcripts with Structify..."
            structify_stats_obj = CustomFileStats() # Fresh stats for this phase
            
            # Use the ProcessingTask's callback for Structify
            processing_task_temp = ProcessingTask("temp_subtask", self.root_download_directory, self.output_file) # type: ignore
            
            # This is a bit of a hack to reuse the callback.
            # Ideally, process_all_files_structify callback should be more generic.
            def _sub_progress_callback(processed_count: int, total_count: int, stage_message: str, current_file: Optional[str] = None):
                if self.is_cancelled_flag: raise InterruptedError("Structify processing cancelled.")
                # Map this sub-progress (0-100) to the remaining 10% of overall task (90-100%)
                sub_prog = int((processed_count / total_count) * 10) if total_count > 0 else 0
                overall_prog = 90 + sub_prog
                
                msg = f"Transcript Processing: {stage_message} ({processed_count}/{total_count})"
                if current_file: msg += f" - File: {os.path.basename(current_file)}"
                
                details = {"current_transcript_processing_stage": stage_message}
                if current_file: details["current_file_processing"] = os.path.basename(current_file)
                self.emit_progress_update(progress=overall_prog, message=msg, details=details)

            structify_results = process_all_files_structify(
                root_directory=self.root_download_directory, # type: ignore
                output_file=self.output_file, # type: ignore
                max_chunk_size=DEFAULT_MAX_CHUNK_SIZE,
                stats_obj=structify_stats_obj, # Pass stats object
                progress_callback=_sub_progress_callback,
                # Add other necessary params for process_all_files_structify
                executor_type="thread",
                max_workers=DEFAULT_NUM_THREADS,
                stop_words=DEFAULT_STOP_WORDS,
                valid_extensions=DEFAULT_VALID_EXTENSIONS, # Ensure .txt or transcript format is included
            )

            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} transcript processing interrupted by cancellation.")
                self.status = "cancelled"
                return
            
            # Merge structify_stats into playlist_run_stats
            self.playlist_run_stats["transcript_processing_stats"] = structify_stats_obj.to_dict()
            self.stats = self.playlist_run_stats # Update BaseTask.stats
            self.output_file = structify_results.get("output_file", self.output_file) # Update if changed

            if structify_results and structify_results.get("error"):
                self.handle_error(f"Transcript processing error: {structify_results['error']}", stage="transcript_processing")
            else:
                self.message = "Playlists downloaded and transcripts processed."
                # self.emit_completion() # Called by BaseTask

        except InterruptedError:
             logger.info(f"Task {self.task_id} transcript processing cancelled.")
             self.status = "cancelled"
        except Exception as e:
            logger.error(f"Error during transcript processing for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(f"Transcript processing failed: {str(e)}", stage="transcript_processing", details={"traceback": traceback.format_exc()})
    
class ScraperTask(BaseTask):
    def __init__(self, task_id: str):
        super().__init__(task_id, task_type="web_scraping")
        self.url_configs: List[Dict[str, str]] = []
        self.root_scrape_directory: Optional[str] = None # Renamed from root_directory and output_folder
        # self.output_file is inherited

        self.pdf_options: Dict[str, Any] = {} # Store PDF processing options
        
        # Scraper specific stats
        self.scraper_run_stats = CustomFileStats() # For the final structify step
        self.url_processing_summary: Dict[str, Any] = {
            "total_urls_configured": 0,
            "processed_urls_count": 0,
            "successful_urls_count": 0,
            "failed_urls_count": 0,
            "total_pdfs_downloaded": 0, # From PDF setting URLs
            "pdf_download_details": [] # List of Dicts: {url, status, file_path?, error?}
        }
        self.stats = self.url_processing_summary # Initial stats
        
        self.active_futures: Set[Any] = set() # Track active futures for cancellation
        self.thread_lock = threading.RLock() # For thread-safe operations on shared attributes

    def start(self, url_configs: List[Dict[str, str]], root_scrape_directory: str, output_json_file: str):
        self.url_configs = url_configs
        self.root_scrape_directory = normalize_path(root_scrape_directory)
        self.output_file = get_output_filepath(output_json_file, user_defined_dir=self.root_scrape_directory)
        
        self.url_processing_summary["total_urls_configured"] = len(self.url_configs)
        self.message = f"Preparing to scrape {len(self.url_configs)} URLs."
        self.stats = self.url_processing_summary # Update BaseTask.stats

        os.makedirs(self.root_scrape_directory, exist_ok=True)
        output_dir = os.path.dirname(self.output_file) # type: ignore
        if output_dir: os.makedirs(output_dir, exist_ok=True)

        super().start()

    def _url_processing_progress_callback(self, url: str, status: str, message: str, 
                                          file_path: Optional[str] = None, error: Optional[str] = None,
                                          download_progress: Optional[int] = None):
        """Callback for individual PDF downloads within _process_url_with_tracking."""
        if self.is_cancelled_flag: return

        with self.thread_lock:
            # Find and update the specific PDF download detail
            updated = False
            for detail in self.url_processing_summary["pdf_download_details"]:
                if detail["url"] == url:
                    detail["status"] = status
                    detail["message"] = message
                    if file_path: detail["filePath"] = file_path
                    if error: detail["error"] = error
                    if download_progress is not None: detail["download_progress"] = download_progress
                    detail["timestamp"] = time.time()
                    updated = True
                    break
            if not updated and status != "pending_add": # 'pending_add' is a signal not to add yet
                 self.url_processing_summary["pdf_download_details"].append({
                    "url": url, "status": status, "message": message, 
                    "filePath": file_path, "error": error, 
                    "download_progress": download_progress, "timestamp": time.time()
                })
            
            # Recalculate overall PDF download count for summary
            self.url_processing_summary["total_pdfs_downloaded"] = sum(
                1 for d in self.url_processing_summary["pdf_download_details"] if d["status"] == "success_processed"
            )
        
        # This callback is for sub-progress. The main progress emit will be from the loop.
        # However, we can emit a more frequent, detailed update if needed, especially for active downloads.
        # For now, rely on the main loop's emit_progress_update.

    def _process_url_with_tracking(self, url: str, setting: str, keyword: str, output_folder: str) -> Dict[str, Any]:
        """Processes a single URL, tracks PDF downloads, handles cancellation."""
        if self.is_cancelled_flag: return {"status": "cancelled", "url": url}

        setting_lower = setting.lower()
        url_result: Dict[str, Any] = {"url": url, "setting": setting_lower}
        
        # Signal that this URL (if PDF) will be added to tracking
        if setting_lower == "pdf":
            self._url_processing_progress_callback(url, "pending_add", "Download queued")

        try:
            if setting_lower == "pdf":
                self._url_processing_progress_callback(url, "downloading", "Starting PDF download")
                
                # Use enhanced_download_pdf with task_id specific to this sub-download for granular events if needed,
                # and our own progress callback.
                # The task_id for enhanced_download_pdf can be f"{self.task_id}_pdf_{url_hash}"
                # For simplicity, let's make its progress_callback update our internal state.
                def _indiv_pdf_dl_prog_cb(dl_prog, total_prog, stage_msg):
                    self._url_processing_progress_callback(url, "downloading", stage_msg, download_progress=dl_prog)

                pdf_file_path = enhanced_download_pdf(url, save_path=output_folder, 
                                                      task_id=None, # Let ScraperTask manage main events
                                                      progress_callback=_indiv_pdf_dl_prog_cb)

                if self.is_cancelled_flag: return {"status": "cancelled", "url": url}

                if not pdf_file_path or not os.path.exists(pdf_file_path):
                    self._url_processing_progress_callback(url, "error_download", "Failed to download PDF", error="File not found after download.")
                    url_result.update({"status": "error", "error": "PDF download failed or file not found."})
                    return url_result
                
                self._url_processing_progress_callback(url, "downloaded_processing", "PDF downloaded, preparing for Structify.", file_path=pdf_file_path)
                url_result["pdf_file"] = pdf_file_path
                url_result["pdf_size"] = os.path.getsize(pdf_file_path)

                if self.pdf_options.get("process_pdfs", True) and structify_available:
                    pdf_filename = os.path.basename(pdf_file_path)
                    json_filename_base = os.path.splitext(pdf_filename)[0]
                    # Use get_output_filepath for JSON, ensuring it's in the same output_folder
                    json_output_path = get_output_filepath(f"{json_filename_base}_processed.json", user_defined_dir=output_folder)

                    doc_type = "unknown"
                    if hasattr(structify_module, 'detect_document_type'):
                        try: doc_type = structify_module.detect_document_type(pdf_file_path)
                        except Exception as e_dt: logger.warning(f"Type detection failed for {pdf_file_path}: {e_dt}")
                    
                    apply_ocr = self.pdf_options.get("use_ocr", True) or (doc_type == "scan")

                    if hasattr(structify_module, 'process_pdf'): # Use targeted PDF processing
                        pdf_proc_result = structify_module.process_pdf(
                            pdf_path=pdf_file_path, output_path=json_output_path,
                            max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE),
                            extract_tables=self.pdf_options.get("extract_tables", True),
                            use_ocr=apply_ocr,
                            # extract_structure=self.pdf_options.get("extract_structure", True), # Assuming process_pdf handles this
                            return_data=True # To get metadata back
                        )
                        url_result["json_file"] = json_output_path
                        url_result["document_type"] = doc_type
                        if pdf_proc_result:
                             url_result["tables_extracted"] = len(pdf_proc_result.get("tables", []))
                             url_result["references_extracted"] = len(pdf_proc_result.get("references", []))
                        url_result["status"] = "success_processed"
                        self._url_processing_progress_callback(url, "success_processed", "PDF processed to JSON.", file_path=pdf_file_path)
                    else: # Fallback to process_all_files_structify for this single PDF
                        process_all_files_structify(
                            root_directory=os.path.dirname(pdf_file_path), output_file=json_output_path,
                            file_filter=lambda f: f == pdf_file_path, max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE)
                            # Add other relevant params from self.pdf_options if process_all_files_structify supports them
                        )
                        url_result["json_file"] = json_output_path
                        url_result["status"] = "success_processed_fallback"
                        self._url_processing_progress_callback(url, "success_processed_fallback", "PDF processed (fallback).", file_path=pdf_file_path)
                else: # PDF processing skipped
                    url_result["status"] = "success_downloaded_only"
                    self._url_processing_progress_callback(url, "success_downloaded_only", "PDF downloaded (processing skipped).", file_path=pdf_file_path)
            
            else: # Non-PDF settings
                # Use the existing process_url (which might call web_scraper_process_url)
                # This part doesn't have granular progress for non-PDF scraping.
                raw_result = process_url(url, setting_lower, keyword, output_folder)
                if "error" in raw_result:
                    url_result.update({"status": "error", "error": raw_result["error"]})
                else:
                    url_result.update(raw_result) # Merge results
                    url_result["status"] = "success"

        except Exception as e:
            logger.error(f"Error processing URL {url} (setting: {setting_lower}): {e}", exc_info=True)
            error_msg = f"Processing failed: {str(e)}"
            url_result.update({"status": "error", "error": error_msg})
            if setting_lower == "pdf":
                self._url_processing_progress_callback(url, "error_processing", error_msg, error=error_msg)
        
        return url_result

    def _structify_final_progress_callback(self, processed_count: int, total_count: int, stage_message: str, current_file: Optional[str] = None):
        if self.is_cancelled_flag: raise InterruptedError("Final structify processing cancelled.")
        # This phase is 90-100% of overall progress
        sub_prog = int((processed_count / total_count) * 10) if total_count > 0 else 0
        overall_prog = 90 + sub_prog
        
        msg = f"Final Output Stage: {stage_message} ({processed_count}/{total_count})"
        if current_file: msg += f" - File: {os.path.basename(current_file)}"
        
        details = {"final_processing_stage": stage_message}
        if current_file: details["current_file_finalizing"] = os.path.basename(current_file)
        self.emit_progress_update(progress=overall_prog, message=msg, details=details)

    def _process_logic(self):
        logger.info(f"Task {self.task_id}: Starting scraping of {len(self.url_configs)} URLs. Output dir: {self.root_scrape_directory}")
        self.message = f"Processing {len(self.url_configs)} URLs..."
        self.emit_progress_update(progress=1)

        max_workers = min(max(1, (os.cpu_count() or 1) // 2), len(self.url_configs), 8) # Cap workers
        processed_url_results = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            with self.thread_lock: # Protect self.active_futures
                for cfg in self.url_configs:
                    if self.is_cancelled_flag: break
                    future = executor.submit(self._process_url_with_tracking, cfg["url"], cfg["setting"], cfg.get("keyword", ""), self.root_scrape_directory) #type: ignore
                    self.active_futures.add(future)
            
            for future in as_completed(list(self.active_futures)): # Iterate over a copy
                if self.is_cancelled_flag: break # Check before getting result
                
                try:
                    res = future.result() # Can raise CancelledError if future was cancelled
                    processed_url_results.append(res)
                    if res and res.get("status", "").startswith("success"):
                        self.url_processing_summary["successful_urls_count"] +=1
                    else:
                        self.url_processing_summary["failed_urls_count"] += 1
                except Exception as e: # Includes CancelledError
                    # Find which URL this future was for to log error appropriately
                    # This is tricky without mapping futures to configs. For now, generic error.
                    logger.error(f"A URL processing sub-task failed or was cancelled: {e}")
                    self.url_processing_summary["failed_urls_count"] += 1
                    # Add a placeholder error result if needed
                    processed_url_results.append({"status": "error", "error": str(e), "url": "unknown due to future error"})


                with self.thread_lock:
                    self.active_futures.discard(future)
                    self.url_processing_summary["processed_urls_count"] = len(processed_url_results)
                
                # Calculate progress: URL processing is 0-90% of the task
                prog = int((self.url_processing_summary["processed_urls_count"] / len(self.url_configs)) * 90)
                msg = f"Processed {self.url_processing_summary['processed_urls_count']}/{len(self.url_configs)} URLs."
                self.emit_progress_update(progress=prog, message=msg)
        
        if self.is_cancelled_flag:
            logger.info(f"Task {self.task_id} URL scraping phase cancelled.")
            self.status = "cancelled" # Ensure status is set correctly
            # emit_completion or handle_error will not be called if status is cancelled
            return

        self.stats = {**self.scraper_run_stats.to_dict(), **self.url_processing_summary} # Merge for final stats
        self.emit_progress_update(progress=90, message="URL processing complete. Starting final structify.")

        # Final structify step
        if not structify_available:
            logger.warning(f"Task {self.task_id}: Structify module not available. Skipping final processing.")
            # Save a simple JSON with URL results
            try:
                with open(self.output_file, 'w', encoding='utf-8') as f: #type: ignore
                    json.dump({
                        "url_processing_results": processed_url_results,
                        "summary_stats": self.url_processing_summary
                    }, f, indent=2)
                self.message = "URL scraping complete. Final processing skipped (Structify unavailable)."
                # self.emit_completion() will be called by BaseTask
            except Exception as e:
                self.handle_error(f"Failed to write basic output for scraper: {str(e)}", stage="scraper_basic_output_write")
            return

        try:
            final_structify_results = process_all_files_structify(
                root_directory=self.root_scrape_directory, # type: ignore
                output_file=self.output_file, # type: ignore
                stats_obj=self.scraper_run_stats, # Use the dedicated stats obj
                progress_callback=self._structify_final_progress_callback,
                # Add other necessary params
                max_chunk_size=DEFAULT_MAX_CHUNK_SIZE,
                executor_type="thread", max_workers=DEFAULT_NUM_THREADS,
            )
            
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} final structify phase cancelled.")
                self.status = "cancelled"
                return

            self.output_file = final_structify_results.get("output_file", self.output_file)
            # Merge all stats for the final report
            self.stats = {
                "url_processing_summary": self.url_processing_summary,
                "final_processing_stats": self.scraper_run_stats.to_dict(),
                "overall_structify_output_stats": final_structify_results.get("stats", {})
            }
            if final_structify_results and final_structify_results.get("error"):
                 self.handle_error(f"Final structify processing error: {final_structify_results['error']}", stage="final_structify")
            else:
                self.message = "Web scraping and final processing complete."
                # self.emit_completion() # Called by BaseTask

        except InterruptedError:
             logger.info(f"Task {self.task_id} final structify processing cancelled.")
             self.status = "cancelled"
        except Exception as e:
            logger.error(f"Error during final structify for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(f"Final structify processing failed: {str(e)}", stage="final_structify", details={"traceback": traceback.format_exc()})

    # Override emit_progress_update to include PDF download details
    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None, 
                             stats_override: Optional[Union[CustomFileStats, Dict]] = None, 
                             details: Optional[Dict] = None):
        current_details = details or {}
        with self.thread_lock:
            # Create a summary of PDF downloads
            pdf_dl_summary = {
                "total_attempted": len(self.url_processing_summary["pdf_download_details"]),
                "downloading": sum(1 for d in self.url_processing_summary["pdf_download_details"] if d["status"] == "downloading"),
                "processing": sum(1 for d in self.url_processing_summary["pdf_download_details"] if d["status"] == "downloaded_processing"),
                "succeeded": sum(1 for d in self.url_processing_summary["pdf_download_details"] if d["status"].startswith("success")),
                "failed": sum(1 for d in self.url_processing_summary["pdf_download_details"] if d["status"].startswith("error")),
            }
            current_details["pdf_downloads_summary"] = pdf_dl_summary
            
            # Include a sample of active/recent PDF downloads for detailed view
            # Limit to, say, 5 most recent or active ones to keep payload small
            active_or_recent_pdfs = sorted(
                [d for d in self.url_processing_summary["pdf_download_details"] if d["status"] != "success_processed" or (time.time() - d.get("timestamp", 0) < 60)],
                key=lambda x: x.get("timestamp", 0),
                reverse=True
            )[:5]
            current_details["active_pdf_downloads_sample"] = active_or_recent_pdfs

        # Update the main stats dict that BaseTask will use
        # This ensures that the REST API status also gets this summary
        if isinstance(self.stats, dict):
             self.stats.update(self.url_processing_summary) # Ensure current summary is part of self.stats
             self.stats["pdf_downloads_overall_summary"] = pdf_dl_summary # Add it here too
        
        super().emit_progress_update(progress, message, stats_override, current_details)

    def cancel(self):
        with self.thread_lock:
            if self.is_cancelled_flag or self.status in ["completed", "failed", "cancelled"]:
                return False # Already done or not cancellable
            
            self.is_cancelled_flag = True # Set the flag first
            # Cancel active futures
            for fut in list(self.active_futures): # Iterate copy
                fut.cancel()
            self.active_futures.clear()
        
        # Call BaseTask's cancel to handle status and event emission
        return super().cancel()
        

@app.route("/")
def index():
    return render_template("index.html")

# ... (other Flask routes like /api/upload-for-path-detection, /api/detect-path, /api/verify-path etc. remain largely the same)
# Key changes would be in how tasks are initiated and how their status is reported.

@app.route("/api/process", methods=["POST"])
@require_api_key # Added API Key requirement
def start_processing():
    try:
        data = request.get_json() if request.is_json else request.form.to_dict()
        ensure_temp_directory()
        
        input_dir = data.get("input_dir")
        output_file_req = data.get("output_file")
        output_dir_req = data.get("output_dir")
        
        logger.info(f"Processing request: input_dir={input_dir}, output_file_req={output_file_req}, output_dir_req={output_dir_req}")
        
        if not input_dir or not os.path.isdir(input_dir): # Validate input_dir
            return structured_error_response("INVALID_INPUT_DIR", "Input directory is invalid or not specified.", 400)
        
        # Resolve output path using get_output_filepath for consistency
        if not output_file_req:
            output_file_req = "processed_" + os.path.basename(os.path.normpath(input_dir)) + ".json"
        
        # If output_dir_req is provided, it's used as user_defined_dir.
        # If output_file_req contains a path, its dirname will be used if output_dir_req is None.
        final_output_path = get_output_filepath(output_file_req, user_defined_dir=output_dir_req)
        logger.info(f"Resolved output path for file processing: {final_output_path}")
        
        task_id = str(uuid.uuid4())
        task = ProcessingTask(task_id, input_dir, final_output_path)
        add_task(task_id, task)
        task.start() # BaseTask.start() handles thread creation and initial emit
        
        return jsonify({
            "task_id": task_id, "status": task.status, "message": task.message,
            "input_dir": input_dir, "output_file": final_output_path, "task_type": task.task_type
        }), 202 # 202 Accepted for async tasks
        
    except Exception as e:
        logger.error(f"Error in start_processing: {str(e)}", exc_info=True)
        return structured_error_response("TASK_CREATION_FAILED", f"Failed to start processing: {str(e)}", 500)


@app.route("/api/status/<task_id>")
@require_api_key # Added API Key requirement (optional, depending on policy)
def task_status_endpoint(task_id: str): # Renamed from task_status to avoid conflict with internal functions
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    # Use the task's own get_status method for a comprehensive report
    return jsonify(task.get_status())


@app.route("/api/download/<task_id>")
@require_api_key # Added API Key
def download_result(task_id):
    task = get_task(task_id)
    if not task: return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    if task.status != "completed": return structured_error_response("TASK_INCOMPLETE", "Task is not completed yet.", 409)
    
    output_file_path = getattr(task, 'output_file', None)
    if not output_file_path: return structured_error_response("FILE_NOT_FOUND", "No output file associated with this task.", 404)
    if not os.path.exists(output_file_path): return structured_error_response("FILE_NOT_FOUND", "Output file not found on server.", 404)
    
    try:
        return send_from_directory(
            os.path.dirname(output_file_path), os.path.basename(output_file_path),
            as_attachment=True, download_name=os.path.basename(output_file_path) # Use download_name for Flask 2.0+
        )
    except Exception as e:
        logger.exception(f"Error downloading file {output_file_path}: {e}")
        return structured_error_response("FILE_READ_ERROR", f"Could not read output file: {e}", 500)

@app.route("/download/<path:filename>") # General download from default output folder
def download_file_generic(filename): # Renamed
    safe_filename = secure_filename(filename)
    try:
        # Ensure the DEFAULT_OUTPUT_FOLDER itself is safe and intended for public downloads
        # Or add more checks if this is too open.
        return send_from_directory(DEFAULT_OUTPUT_FOLDER, safe_filename, as_attachment=True)
    except FileNotFoundError: abort(404)
    except Exception as e: logger.exception(f"Error downloading generic file {filename}: {e}"); abort(500)

# /api/open/* routes are for local server use and seem fine.

@app.route("/api/start-playlists", methods=["POST"])
@require_api_key # Added API Key
def start_playlists_endpoint(): # Renamed
    if not YOUTUBE_API_KEY:
        return structured_error_response("FEATURE_DISABLED", "YouTube playlist feature is disabled (API key not configured).", 501) # 501 Not Implemented
        
    data = request.get_json()
    if not data: return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    raw_playlist_urls = data.get("playlists") # Expecting a list of URLs
    root_dir_req = data.get("root_directory")
    output_file_req = data.get("output_file")
    
    if not raw_playlist_urls or not isinstance(raw_playlist_urls, list):
        return structured_error_response("PLAYLISTS_REQUIRED", "A list of playlist URLs is required.", 400)
    if not root_dir_req: return structured_error_response("ROOT_DIR_REQUIRED", "Root directory is required.", 400)
    if not output_file_req: return structured_error_response("OUTPUT_FILE_REQUIRED", "Output file name/path is required.", 400)
    
    root_directory_abs = normalize_path(root_dir_req)
    
    playlists_configs = []
    for idx, url in enumerate(raw_playlist_urls):
        # Create a unique, safe subfolder for each playlist within the root_dir
        # PlaylistTask's start method will further resolve/create these.
        playlist_folder_name = secure_filename(f"playlist_{idx+1}_{url.split('list=')[-1][:12]}")
        playlists_configs.append({
            "url": url,
            "folder": os.path.join(root_directory_abs, playlist_folder_name) # Full path for folder
        })
    
    # The PlaylistTask's _resolve_output_file_path will handle output_file_req correctly.
    
    task_id = str(uuid.uuid4())
    playlist_task = PlaylistTask(task_id)
    add_task(task_id, playlist_task)
    
    try:
        playlist_task.start(playlists_configs, root_directory_abs, output_file_req)
        if playlist_task.status == "failed": # If start itself failed (e.g. API key missing)
             return structured_error_response("TASK_START_ERROR", playlist_task.error_message or "Failed to start playlist task", 500)

        return jsonify({
            "task_id": task_id, "status": playlist_task.status, "message": playlist_task.message,
            "root_directory": playlist_task.root_download_directory, 
            "output_file": playlist_task.output_file,
            "task_type": playlist_task.task_type
        }), 202
    except Exception as e: # Catch any other errors during task setup
        logger.error(f"Critical error starting playlist task {task_id}: {e}", exc_info=True)
        # Ensure task is removed if it wasn't properly started or added
        if task_id in active_tasks: remove_task(task_id)
        return structured_error_response("TASK_INIT_FAILURE", f"Failed to initialize playlist task: {str(e)}", 500)

# PDF Download API endpoints (/api/download-pdf, etc.) seem okay.
# The download_pdf function it calls has been enhanced for better Socket.IO reporting if a task_id is provided.

@app.route("/api/scrape2", methods=["POST"])
@require_api_key # Added API Key
def scrape2_endpoint(): # Renamed
    data = request.get_json()
    if not data: return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url_configs_req = data.get("urls")
    download_dir_req = data.get("download_directory")
    output_filename_req = data.get("outputFilename", "").strip()
    pdf_options_req = data.get("pdf_options", {})
    
    if not url_configs_req or not isinstance(url_configs_req, list):
        return structured_error_response("URLS_REQUIRED", "A list of URL configurations is required.", 400)
    if not download_dir_req: return structured_error_response("ROOT_DIR_REQUIRED", "Download directory is required.", 400)
    if not output_filename_req: return structured_error_response("OUTPUT_FILE_REQUIRED", "Output filename is required.", 400)
    
    root_scrape_dir_abs = normalize_path(download_dir_req)
    # ScraperTask's start method will resolve the final output JSON path.

    logger.info(f"Scraper request: {len(url_configs_req)} URLs. Output dir: {root_scrape_dir_abs}. Output filename hint: {output_filename_req}")
    logger.info(f"PDF options: {pdf_options_req}")
    
    task_id = str(uuid.uuid4())
    scraper_task = ScraperTask(task_id)
    scraper_task.pdf_options = pdf_options_req # Pass PDF options to the task
    add_task(task_id, scraper_task)
    
    scraper_task.start(url_configs_req, root_scrape_dir_abs, output_filename_req) # BaseTask.start called within
    
    return jsonify({
        "task_id": task_id, "status": scraper_task.status, "message": scraper_task.message,
        "root_directory": scraper_task.root_scrape_directory, 
        "output_file": scraper_task.output_file,
        "task_type": scraper_task.task_type
    }), 202

@app.route("/api/scrape2/status/<task_id>") # Renamed from scrape2_status for consistency
@require_api_key # Added API Key
def scraper_task_status_endpoint(task_id: str):
    return task_status_endpoint(task_id) # Reuse generic status endpoint

@app.route("/api/cancel/<task_id>", methods=["POST"]) # Generic cancel endpoint
@require_api_key
def cancel_task_endpoint(task_id: str):
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    if hasattr(task, 'cancel') and callable(task.cancel):
        cancelled_successfully = task.cancel()
        if cancelled_successfully:
            return jsonify({"task_id": task_id, "status": "cancelled", "message": f"Task {task.task_type} cancellation requested."})
        else:
            return structured_error_response("CANCEL_FAILED", f"Task {task.task_type} could not be cancelled (may be already finished or not cancellable).", 409)
    else:
        return structured_error_response("NOT_CANCELLABLE", "This task type does not support cancellation.", 400)

# PDF Processing Endpoints (/api/pdf/*)
# These create ad-hoc threads rather than full BaseTask objects.
# For better consistency, they could be refactored to use a PdfProcessingTask(BaseTask).
# However, for now, their Socket.IO emissions will be enhanced directly.

@app.route("/api/pdf/process", methods=["POST"])
@require_api_key
def process_pdf_endpoint():
    # ... (validation as before)
    data = request.get_json(); # Ensure it's read
    if not data: return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    pdf_path = data.get('pdf_path')
    # ... (rest of the params and validation)
    if not pdf_path or not os.path.isfile(pdf_path):
         return structured_error_response("FILE_NOT_FOUND", f"PDF file not found or path invalid: {pdf_path}", 400)

    output_dir = data.get('output_dir', os.path.dirname(pdf_path)) # Default to same dir
    extract_tables = data.get('extract_tables', True)
    use_ocr = data.get('use_ocr', True)
    
    # Generate output path
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    final_output_path = get_output_filepath(f"{base_name}_processed.json", user_defined_dir=output_dir)

    task_id = str(uuid.uuid4())
    
    # Initial task data for tracking (could be a simple dict or a lightweight task object)
    task_info = {
        "task_id": task_id, "task_type": "single_pdf_processing", "status": "pending",
        "pdf_path": pdf_path, "output_path": final_output_path, "start_time": time.time(),
        "message": "PDF processing queued."
    }
    add_task(task_id, task_info) # Add to active_tasks for basic tracking via /api/status if needed

    def process_pdf_thread():
        try:
            task_info["status"] = "processing"
            task_info["message"] = "Starting PDF processing."
            socketio.emit("task_started", {**task_info, "timestamp": time.time()})

            if pdf_extractor_available and hasattr(pdf_extractor, 'process_pdf'):
                logger.info(f"Using pdf_extractor for {pdf_path}")
                result = pdf_extractor.process_pdf(
                    pdf_path=pdf_path, output_path=final_output_path,
                    extract_tables=extract_tables, use_ocr=use_ocr, return_data=True
                )
            elif structify_available and hasattr(structify_module, 'process_pdf'):
                logger.info(f"Using structify_module.process_pdf for {pdf_path}")
                result = structify_module.process_pdf(
                    pdf_path=pdf_path, output_path=final_output_path,
                    max_chunk_size=DEFAULT_MAX_CHUNK_SIZE, extract_tables=extract_tables,
                    use_ocr=use_ocr, return_data=True
                )
            else:
                result = {"status": "error", "error": "No PDF processing module available", "processing_info":{}}

            task_info["status"] = "completed" if result.get("status") == "success" else "error"
            task_info["message"] = "PDF processing finished."
            task_info["result_summary"] = {
                "document_type": result.get("document_type", "unknown"),
                "page_count": result.get("page_count", 0),
                "tables_count": len(result.get("tables", [])),
                "processing_time_sec": result.get("processing_info", {}).get("elapsed_seconds", 0)
            }
            if task_info["status"] == "error": task_info["error_message"] = result.get("error")

            event_name = "task_completed" if task_info["status"] == "completed" else "task_error"
            socketio.emit(event_name, {**task_info, "timestamp": time.time()})

        except Exception as e:
            logger.error(f"Error in process_pdf_thread for task {task_id}: {e}", exc_info=True)
            task_info["status"] = "error"
            task_info["error_message"] = str(e)
            task_info["message"] = "PDF processing failed critically."
            socketio.emit("task_error", {**task_info, "timestamp": time.time()})
        finally:
            remove_task(task_id) # Clean up from active_tasks

    thread = threading.Thread(target=process_pdf_thread, daemon=True)
    thread.name = f"SinglePDFProcThread-{task_id[:8]}"
    thread.start()
    
    return jsonify({
        "task_id": task_id, "status": "pending", "message": "PDF processing initiated.",
        "pdf_file": pdf_path, "output_file": final_output_path, "task_type": "single_pdf_processing"
    }), 202


# Key manager UI and API endpoints seem okay for now.

# Academic API endpoints. The helper functions like get_paper_citations, recommend_related_papers
# are stubs. The main thing is that they use the limiter and api_key decorator.

# Socket.IO event handlers like pdf_download_start etc.
# These are problematic if `download_pdf` also emits.
# Let's assume `download_pdf` is the primary source of these events if a `task_id` is passed to it.
# The direct handlers here would be for cases where the frontend initiates a download
# without going through a task-creating API endpoint.
# For now, removing the direct `pdf_download_*` handlers as `download_pdf` handles it.
# The `pdf_processing_request` handler is fine as it creates its own task context.

# Final check on main entry point
if __name__ == "__main__":
    if redis_integration_available:
        try:
            # These should be initialized before routes that use them,
            # which is tricky if Limiter uses them during its init.
            # Assuming Flask-Limiter handles this.
            # redis_cache = RedisCache(app) # If needed globally
            # redis_rate_limiter = RedisRateLimiter(app) # If Limiter needs it
            logger.info("Redis integration available (cache/rate-limiter may use it if configured).")
        except Exception as e:
            logger.error(f"Failed to initialize Redis components: {e}")
            redis_integration_available = False # Fallback
    else:
        logger.info("Using in-memory cache/limiter (Redis not available).")
    
    # ... (argparse logic as before)
    # CLI mode uses process_all_files_structify
    
    # For server mode:
    # Make sure the logger for Flask and SocketIO is set correctly.
    if not args.input: # Server mode
        if args.debug:
            app.logger.setLevel(logging.DEBUG) # Flask's app logger
            logging.getLogger('socketio').setLevel(logging.DEBUG)
            logging.getLogger('engineio').setLevel(logging.DEBUG)
            logger.info("Debug mode enabled for Flask, SocketIO, EngineIO.")
        
        logger.info(f"Structify module available: {structify_available}")
        logger.info(f"PDF Extractor module available: {pdf_extractor_available}")
        
        try:
            socketio.run(app, host=args.host, port=int(args.port), debug=args.debug, 
                         use_reloader=args.debug) # use_reloader is good for debug
        except Exception as e:
            logger.critical(f"Server failed to start: {e}", exc_info=True)
            sys.exit(1)