import os
import sys
import json
import time
import logging
import re
import hashlib
import tempfile
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from typing import Optional, Tuple, Dict, List, Set, Any, Union, Callable
from collections import Counter
from dataclasses import dataclass, field, asdict
from pathlib import Path
from functools import lru_cache
import threading
import traceback
# -----------------------------------------------------------------------------
# LOGGING SETUP
# -----------------------------------------------------------------------------
def setup_logging(log_level=logging.INFO, log_file=None):
    """
    Set up logging configuration for the application
    
    Args:
        log_level: Logging level (default: INFO)
        log_file: Optional log file path
        
    Returns:
        Configured logger instance
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




# Initialize logger with default settings
logger = setup_logging(logging.INFO)

# -----------------------------------------------------------------------------
# GLOBAL CONSTANTS AND CONFIG
# -----------------------------------------------------------------------------
DEFAULT_MAX_CHUNK_SIZE = 4096
DEFAULT_CHUNK_OVERLAP = 200
DEFAULT_VALID_EXTENSIONS = [
    ".py", ".html", ".css", ".yaml", ".yml",
    ".txt", ".md", ".js", ".gitignore", ".ts",
    ".json", ".csv", ".rtf", ".pdf", ".docx",
    ".pptx", ".xlsx", ".xml", ".sh", ".bat",
    ".java", ".c", ".cpp", ".h", ".cs", ".php",
    ".rb", ".go", ".rs", ".swift"
]

DEFAULT_STOP_WORDS: Set[str] = {
    "the", "and", "or", "for", "a", "an", "of", "in", "to", "from",
    "on", "at", "by", "this", "is", "are", "were", "was", "be", "as",
    "it", "that", "these", "those", "with", "can", "if", "not", "no",
    "your", "you", "i", "am", "our", "we", "they", "their", "me",
    "have", "has", "had", "also", "too", "very", "up", "out", "about",
    "so", "some", "any", "my", "his", "her", "he", "she", "when", "where",
    "what", "who", "why", "how", "which", "than", "then", "them", "but"
}

BINARY_SIGNATURES = {
    b'\xff\xd8\xff': '.jpg',       # JPEG
    b'\x89PNG\r\n\x1a\n': '.png',  # PNG
    b'GIF87a': '.gif',             # GIF 87a
    b'GIF89a': '.gif',             # GIF 89a
    b'PK\x03\x04': '.zip',         # ZIP
    b'%PDF': '.pdf',               # PDF
    b'\xd0\xcf\x11\xe0': '.doc',   # MS Office documents
    b'BM': '.bmp',                 # BMP
    b'\x00\x00\x01\x00': '.ico',   # ICO
    b'\x52\x61\x72\x21': '.rar',   # RAR
    b'\x1f\x8b\x08': '.gz',        # GZIP
    b'ID3': '.mp3',                # MP3
    b'\x00\x00\x00\x14ftyp': '.mp4', # MP4
    b'\x25\x50\x44\x46': '.pdf',   # Another PDF signature
}

# Performance tuning parameters
DEFAULT_PROCESS_TIMEOUT = 600  # seconds
DEFAULT_MEMORY_LIMIT = 1024 * 1024 * 1024  # 1GB - avoid OOM issues
OCR_RESOLUTION = 300           # DPI for OCR
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB - skip larger files by default
MAX_PDF_PAGES = 1000           # Skip PDFs with more pages than this

# Cache file with timestamp for better identification
CACHE_FILE = f"processed_cache_{datetime.now().strftime('%Y%m%d')}.json"

# Enhanced keyword lists with PDF-specific terms
WORD_PATTERN = re.compile(r"\b[A-Za-z0-9_]+\b")
FILE_TYPE_KEYWORDS: Dict[str, Set[str]] = {
    ".py": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", 
           "view", "controller", "api", "client", "server", "database", "class", "function", "method", "decorator", 
           "async", "generator", "exception"},
    ".js": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", 
           "view", "controller", "api", "client", "server", "database", "component", "function", "module", "export", 
           "import", "async", "promise"},
    ".ts": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", 
           "view", "controller", "api", "client", "server", "database", "component", "function", "module", "export", 
           "import", "async", "promise"},
    ".html": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", 
             "view", "controller", "api", "client", "server", "database", "header", "section", "article", "list", 
             "table", "form", "input"},
    ".md": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", 
           "view", "controller", "api", "client", "server", "database", "header", "section", "article", "list", 
           "table", "form", "input"},
    ".pdf": {"paper", "article", "research", "study", "abstract", "introduction", "methodology", "results", "discussion", 
            "conclusion", "references", "appendix", "figure", "table", "data", "analysis", "chapter", "section", 
            "subsection", "graph", "chart", "diagram", "report", "thesis", "dissertation", "author", "publication", 
            "journal", "conference", "proceedings", "volume", "issue", "doi", "preprint", "manuscript"}
}

DEFAULT_KEYWORDS = {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", 
                   "model", "view", "controller", "api", "client", "server", "database"}

PROGRAMMING_STOP_WORDS = {"def", "class", "function", "return", "import", "from", "var", "let", "const", "if", "else", 
                         "for", "while", "try", "except", "finally", "with", "as", "in", "true", "false", "none", 
                         "null", "undefined", "nan"}

# Regular expression patterns
CLASS_PATTERN = re.compile(r"class\s+(\w+)")
FUNCTION_PATTERN = re.compile(r"def\s+(\w+)")
JSON_SCHEMA_PATTERN = re.compile(r'"(title|type)":\s*"([^"]+)"')
HTML_TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
MARKDOWN_HEADING_PATTERN = re.compile(r"^#+\s+(.+)$", re.MULTILINE)

# Library availability flags - will be set during initialization
JAVA_AVAILABLE = False
TESSERACT_AVAILABLE = False
PDF_MODULE_INITIALIZED = False
USE_FITZ = False
USE_PYPDF2 = False
USE_TABULA = False
USE_OCR = False
USE_PDFPLUMBER = False

TEMP_OCR_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'temp')
os.makedirs(TEMP_OCR_DIR, exist_ok=True)

# In modules/Structify/claude.py

# Update or add this to the OCR configuration
OCR_CONFIG = {
    "language": "eng",  
    "timeout": 60,      # Maximum time for OCR processing per page (seconds)
    "resolution": 300,  # DPI for OCR
    "cleanup_delay": 1, # Seconds to wait before cleaning up temp files
    "temp_dir": TEMP_OCR_DIR  # Add this line to explicitly set temp directory
}
os.environ["TESSDATA_PREFIX"] = TEMP_OCR_DIR  # Set environment variable for Tesseract
section_name_cache: Dict[str, str] = {}

fallback_counts = {
    "process_pdf": 0,
    "extract_text_from_pdf": 0,
    "extract_tables_from_pdf": 0,
    "process_scanned_pdf": 0,
    "detect_document_type": 0,
    "identify_document_structure": 0
}
import tempfile
import os
import contextlib

# Store the original tempfile.mkdtemp and tempfile.mkstemp functions
original_mkdtemp = tempfile.mkdtemp
original_mkstemp = tempfile.mkstemp

@contextlib.contextmanager
def use_custom_temp_dir():
    """
    Context manager to temporarily override the tempfile module's temporary directory.
    This forces pytesseract and any other library using tempfile to use our custom directory.
    """
    try:
        # Override tempfile's temp directory functions
        def custom_mkdtemp(*args, **kwargs):
            kwargs['dir'] = TEMP_OCR_DIR
            return original_mkdtemp(*args, **kwargs)
            
        def custom_mkstemp(*args, **kwargs):
            kwargs['dir'] = TEMP_OCR_DIR
            return original_mkstemp(*args, **kwargs)
        
        # Apply the overrides
        tempfile.mkdtemp = custom_mkdtemp
        tempfile.mkstemp = custom_mkstemp
        
        # Also set the environment variable
        old_temp = os.environ.get('TEMP')
        old_tmp = os.environ.get('TMP')
        os.environ['TEMP'] = TEMP_OCR_DIR
        os.environ['TMP'] = TEMP_OCR_DIR
        
        yield
    finally:
        # Restore original functions
        tempfile.mkdtemp = original_mkdtemp
        tempfile.mkstemp = original_mkstemp
        
        # Restore environment variables
        if old_temp:
            os.environ['TEMP'] = old_temp
        if old_tmp:
            os.environ['TMP'] = old_tmp
            
# In claude.py
def initialize_ocr_environment():
    """Initialize the OCR environment with proper temp directory configuration."""
    if USE_OCR:
        try:
            # Ensure tessdata directory exists (not just temp directory)
            tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
            os.makedirs(tessdata_dir, exist_ok=True)
            
            # Properly set environment variable - make sure it has NO trailing slash
            os.environ["TESSDATA_PREFIX"] = os.path.abspath(tessdata_dir)
            
            # Install language files if needed
            install_tesseract_language_data()
            
            # Set both TEMP and TMP environment variables to same directory
            os.environ["TEMP"] = TEMP_OCR_DIR
            os.environ["TMP"] = TEMP_OCR_DIR
            
            logger.info(f"OCR environment initialized with TESSDATA_PREFIX={os.environ['TESSDATA_PREFIX']}")
            return True
        except Exception as e:
            logger.warning(f"Failed to initialize OCR environment: {e}")
            return False
    return False

def enhanced_ocr_processing(image_path, language='eng'):
    """
    Enhanced OCR processing with image preprocessing for better results.
    """
    try:
        import cv2
        import numpy as np
        from PIL import Image
        import pytesseract
        
        # Read the image
        img = cv2.imread(image_path)
        
        # Image preprocessing pipeline
        # 1. Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 2. Remove noise
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
        
        # 3. Threshold to binary
        _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # 4. Add border to avoid edge text loss
        bordered = cv2.copyMakeBorder(binary, 10, 10, 10, 10, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        
        # Save the preprocessed image
        preprocessed_path = f"{os.path.splitext(image_path)[0]}_preprocessed.png"
        cv2.imwrite(preprocessed_path, bordered)
        
        # Use Tesseract on preprocessed image with optimized settings
        config = f'--tessdata-dir "{os.path.join(TEMP_OCR_DIR, "tessdata")}" --oem 1 --psm 3 -l {language}'
        text = pytesseract.image_to_string(Image.open(preprocessed_path), config=config)
        
        # Also get confidence data
        data = pytesseract.image_to_data(Image.open(preprocessed_path), config=config, output_type=pytesseract.Output.DICT)
        
        # Calculate average confidence
        confidences = [conf for conf in data['conf'] if conf != -1]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        # Clean up the preprocessed image
        safely_remove_file(preprocessed_path)
        
        return {
            "text": text,
            "confidence": avg_confidence,
            "preprocessing_applied": True
        }
        
    except Exception as e:
        logger.error(f"Enhanced OCR processing failed: {e}")
        
        # Try fallback with basic OCR
        try:
            import pytesseract
            from PIL import Image
            text = pytesseract.image_to_string(Image.open(image_path))
            return {
                "text": text,
                "confidence": 0.0,
                "preprocessing_applied": False
            }
        except Exception as e2:
            logger.error(f"Fallback OCR also failed: {e2}")
            return {
                "text": "",
                "confidence": 0.0,
                "error": str(e2)
            }

def multi_engine_ocr(image_path):
    """
    Try multiple OCR engines with fallbacks.
    """
    result = {
        "text": "",
        "confidence": 0.0,
        "engine_used": None
    }
    
    # Try Tesseract first
    try:
        import pytesseract
        from PIL import Image
        
        tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
        config = f'--tessdata-dir "{tessdata_dir}" --oem 1 --psm 3'
        
        # First try with enhanced preprocessing
        enhanced_result = enhanced_ocr_processing(image_path)
        
        if enhanced_result["text"].strip():
            result["text"] = enhanced_result["text"]
            result["confidence"] = enhanced_result["confidence"]
            result["engine_used"] = "tesseract_enhanced"
            return result
            
        # Direct tesseract if enhanced processing failed
        text = pytesseract.image_to_string(Image.open(image_path), config=config)
        
        if text.strip():
            result["text"] = text
            result["confidence"] = 0.5  # Estimated confidence
            result["engine_used"] = "tesseract_basic"
            return result
    except Exception as e:
        logger.warning(f"Tesseract OCR failed: {e}")
    
    # Try Microsoft Azure OCR if available
    try:
        if 'azure.cognitiveservices.vision.computervision' in sys.modules:
            from azure.cognitiveservices.vision.computervision import ComputerVisionClient
            from azure.cognitiveservices.vision.computervision.models import OperationStatusCodes
            from msrest.authentication import CognitiveServicesCredentials
            
            # Check for Azure credentials in environment
            key = os.environ.get('AZURE_OCR_KEY')
            endpoint = os.environ.get('AZURE_OCR_ENDPOINT')
            
            if key and endpoint:
                client = ComputerVisionClient(endpoint, CognitiveServicesCredentials(key))
                
                # Read image file
                with open(image_path, "rb") as image_file:
                    read_response = client.read_in_stream(image_file, raw=True)
                
                # Get operation ID
                operation_id = read_response.headers["Operation-Location"].split("/")[-1]
                
                # Wait for results with timeout
                import time
                timeout = 30  # seconds
                start_time = time.time()
                
                while True:
                    read_result = client.get_read_result(operation_id)
                    if read_result.status not in [OperationStatusCodes.running, OperationStatusCodes.not_started]:
                        break
                    if time.time() - start_time > timeout:
                        break
                    time.sleep(1)
                
                # Extract text
                if read_result.status == OperationStatusCodes.succeeded:
                    text = ""
                    for page in read_result.analyze_result.read_results:
                        for line in page.lines:
                            text += line.text + "\n"
                    
                    if text.strip():
                        result["text"] = text
                        result["confidence"] = 0.8  # Azure OCR has higher confidence typically
                        result["engine_used"] = "azure_ocr"
                        return result
    except Exception as e:
        logger.warning(f"Azure OCR failed: {e}")
    
    # Return whatever result we have, possibly empty
    return result

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

    
def cleanup_temp_files(max_age_minutes=30):
    """Clean up temporary files older than specified age."""
    import os
    import glob
    import time
    
    current_time = time.time()
    max_age_seconds = max_age_minutes * 60
    
    # Clean main temp directory
    for pattern in ["*.png", "*.jpg", "*.tif", "*.bmp", "tmp*"]:
        for file_path in glob.glob(os.path.join(TEMP_OCR_DIR, pattern)):
            try:
                # Check file age
                file_age_seconds = current_time - os.path.getmtime(file_path)
                if file_age_seconds > max_age_seconds:
                    # Try to remove
                    os.remove(file_path)
                    logger.debug(f"Removed old temp file: {file_path}")
            except Exception:
                # Ignore errors during cleanup
                pass
    
    # Clean process-specific directories
    for dir_path in glob.glob(os.path.join(TEMP_OCR_DIR, "ocr_job_*")):
        try:
            dir_age_seconds = current_time - os.path.getmtime(dir_path)
            if dir_age_seconds > max_age_seconds:
                import shutil
                shutil.rmtree(dir_path, ignore_errors=True)
                logger.debug(f"Removed old temp directory: {dir_path}")
        except Exception:
            # Ignore errors during cleanup
            pass

def check_memory_usage():
    """Check memory usage and take action if needed."""
    try:
        import psutil
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_percent = process.memory_percent()
        
        # Log memory usage
        logger.debug(f"Current memory usage: {memory_info.rss / (1024*1024):.1f} MB ({memory_percent:.1f}%)")
        
        # If memory usage is high, trigger garbage collection
        if memory_percent > 75:
            logger.warning(f"High memory usage detected ({memory_percent:.1f}%). Running garbage collection.")
            import gc
            gc.collect()
    except ImportError:
        # psutil not available
        pass
    except Exception as e:
        logger.error(f"Error checking memory usage: {e}")

start_periodic_cleanup()
            
def patch_pytesseract_temp_dir():
    """
    Monkey patch pytesseract to use our custom temp directory.
    This is a direct fix for the temp file issues.
    """
    try:
        import pytesseract
        
        # Get the original run_tesseract method
        original_run_tesseract = pytesseract.pytesseract.run_tesseract
        
        # Create a wrapper that forces our temp directory
        def custom_run_tesseract(input_filename, output_filename_base, *args, **kwargs):
            # Override the temp environment variables just for this call
            old_temp = os.environ.get('TEMP')
            old_tmp = os.environ.get('TMP') 
            
            try:
                # Force temp directory for this operation
                os.environ['TEMP'] = TEMP_OCR_DIR
                os.environ['TMP'] = TEMP_OCR_DIR
                
                # Call original with our custom environment
                return original_run_tesseract(input_filename, output_filename_base, *args, **kwargs)
            finally:
                # Restore environment
                if old_temp:
                    os.environ['TEMP'] = old_temp
                if old_tmp:
                    os.environ['TMP'] = old_tmp
        
        # Replace the original method with our custom one
        pytesseract.pytesseract.run_tesseract = custom_run_tesseract
        
        # Also patch the temp folder directly
        pytesseract.pytesseract.TMP_FOLDER = TEMP_OCR_DIR
        
        logger.info(f"Successfully patched pytesseract to use temp directory: {TEMP_OCR_DIR}")
        return True
    except Exception as e:
        logger.warning(f"Failed to patch pytesseract: {e}")
        return False
# Add to the get_temp_file function in claude.py
def get_temp_file(suffix=".png"):
    """Generate a temporary file path in the dedicated OCR temp directory."""
    import uuid
    temp_filename = f"ocr_temp_{uuid.uuid4()}{suffix}"
    temp_path = os.path.join(TEMP_OCR_DIR, temp_filename)
    
    # Ensure the directory exists
    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
    
    # Return the absolute path
    return os.path.abspath(temp_path)

import os
import requests
import shutil

def install_tesseract_language_data():
    """Download and install Tesseract language data files if they don't exist."""
    # Define the destination directory (using the same TEMP_OCR_DIR from your code)
    tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    # Language file URL - use the official GitHub repository
    eng_lang_url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
    
    # Destination file path
    eng_file_path = os.path.join(tessdata_dir, "eng.traineddata")
    
    # Only download if the file doesn't exist
    if not os.path.exists(eng_file_path):
        try:
            logger.info(f"Downloading Tesseract English language data to {tessdata_dir}")
            response = requests.get(eng_lang_url, stream=True)
            response.raise_for_status()
            
            with open(eng_file_path, 'wb') as file:
                shutil.copyfileobj(response.raw, file)
                
            logger.info(f"Successfully downloaded Tesseract language data to {eng_file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to download Tesseract language data: {e}")
            return False
    else:
        logger.info(f"Tesseract language data already exists at {eng_file_path}")
        return True
    
def cleanup_temp_files():
    """Clean up any remaining temporary files in the OCR temp directory."""
    import os, glob, time
    
    temp_dir = TEMP_OCR_DIR
    if not os.path.exists(temp_dir):
        return
        
    # Get all temp files older than 30 minutes
    current_time = time.time()
    for file_path in glob.glob(os.path.join(temp_dir, "ocr_temp_*")):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 1800:  # 30 minutes
                safely_remove_file(file_path)
        except Exception as e:
            logger.debug(f"Error cleaning up temp file {file_path}: {e}")
            
import atexit
atexit.register(cleanup_temp_files)

# Enhanced process_pdf function with pdf_output_enhancer integration
def process_pdf(
    pdf_path: str,
    output_path: str = None,
    max_chunk_size: int = 4096,
    extract_tables: bool = True,
    use_ocr: bool = True,
    return_data: bool = False,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    memory_limit: int = DEFAULT_MEMORY_LIMIT,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancellation_event: Optional[threading.Event] = None
) -> Optional[Dict[str, Any]]:
    """
    Process a PDF file with enhanced features, robust error handling, progress reporting,
    and cancellation support.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Path to output JSON file (if None, derives from input filename)
        max_chunk_size: Maximum size of text chunks
        extract_tables: Whether to extract tables
        use_ocr: Whether to use OCR for scanned content
        return_data: Whether to return processed data
        timeout: Maximum processing time in seconds (0 for no timeout)
        memory_limit: Memory limit for processing in bytes
        progress_callback: Optional callback for progress reporting
        cancellation_event: Optional event to signal cancellation
        
    Returns:
        Optional[Dict[str, Any]]: Processed data if return_data=True, otherwise None
    """
    start_time = time.time()
    cancelled = False
    total_steps = 12  # Total steps in the processing pipeline
    current_step = 0
    timeout_thread = None
    processing_cancelled = threading.Event()
    _temp_files = []
    
    def update_progress(step_increment=1, message="Processing"):
        """Update progress and report via callback if provided"""
        nonlocal current_step
        current_step += step_increment
        progress = min(current_step / total_steps * 100, 99)
        
        if progress_callback:
            try:
                progress_callback(progress, message)
            except Exception as e:
                logger.debug(f"Error in progress callback: {e}")
    
    def check_cancellation():
        """Check if processing should be cancelled"""
        if cancellation_event and cancellation_event.is_set():
            nonlocal cancelled
            cancelled = True
            raise InterruptedError("PDF processing was cancelled")
    
    def check_timeout():
        """Check if processing has exceeded the timeout"""
        if timeout > 0 and time.time() - start_time > timeout:
            raise ProcessTimeoutError(f"PDF processing timed out after {timeout} seconds")
    
    def check_memory():
        """Check memory usage and collect garbage if needed"""
        try:
            import gc
            import psutil
            
            process = psutil.Process()
            memory_info = process.memory_info()
            
            if memory_info.rss > memory_limit:
                logger.warning(f"Memory usage ({memory_info.rss / (1024*1024):.1f} MB) exceeding limit. Running garbage collection.")
                gc.collect()
        except ImportError:
            # psutil not available
            pass
        except Exception as e:
            logger.debug(f"Error checking memory: {e}")
    
    # Set default output path if not provided
    if not output_path and not return_data:
        output_path = f"{os.path.splitext(pdf_path)[0]}_processed.json"
    
    # Track results for progress info
    tables = []
    references = []
    chunks = []
    page_count = 0
    extraction_time = 0
    doc_type = "unknown"
    
    try:
        logger.info(f"Starting PDF processing: {pdf_path}")
        update_progress(0, "Initializing")
        
        # Check if file exists and is a PDF
        if not os.path.isfile(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        if not pdf_path.lower().endswith('.pdf'):
            raise ValueError(f"File is not a PDF: {pdf_path}")
        
        # Check file size
        file_size = os.path.getsize(pdf_path)
        if file_size > MAX_FILE_SIZE:
            logger.warning(f"PDF file size ({file_size / (1024*1024):.1f} MB) exceeds recommended limit. Processing may be slow.")
        
        check_cancellation()
        
        # Attempt to use pdf_extractor if available
        if pdf_extractor_available and PDF_EXTRACTOR_CONFIG.get("always_use_module", True):
            try:
                update_progress(1, "Using PDF Extractor module")
                logger.info(f"Using pdf_extractor for {pdf_path}")
                
                # Report initial progress
                if progress_callback:
                    progress_callback(10, "Extracting with pdf_extractor")
                
                result = pdf_extractor.process_pdf(
                    pdf_path=pdf_path,
                    output_path=None,  # Don't write to file yet
                    max_chunk_size=max_chunk_size,
                    extract_tables=extract_tables,
                    use_ocr=use_ocr,
                    return_data=True  # Always get data for enhancement
                )
                
                # Check for cancellation
                check_cancellation()
                
                # Check if processing was successful
                if result and "error" not in result:
                    logger.info(f"Successfully processed PDF with pdf_extractor: {pdf_path}")
                    processing_time = time.time() - start_time
                    
                    # Update result with timing information
                    if result.get("processing_info"):
                        result["processing_info"]["total_time"] = processing_time
                    else:
                        result["processing_info"] = {"total_time": processing_time}
                    
                    # Apply enhanced output formatting if available
                    update_progress(4, "Enhancing output format")
                    
                    if pdf_enhancer_available:
                        try:
                            # Convert to enhanced format - wrap data in expected structure
                            all_data = {"pdf": {"docs_data": result.get("docs_data", [])}}
                            improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                            result["enhanced_format"] = improved_data
                            logger.info(f"Applied enhanced output formatting to {pdf_path}")
                            
                            update_progress(1, "Output formatting complete")
                            
                            # Write to output file if specified
                            if output_path:
                                update_progress(1, "Writing output file")
                                
                                # Ensure output directory exists
                                outdir = os.path.dirname(output_path)
                                if outdir and not os.path.exists(outdir):
                                    os.makedirs(outdir, exist_ok=True)
                                
                                # Write using enhancer's safe writer
                                pdf_output_enhancer.write_improved_output(improved_data, output_path)
                                logger.info(f"Wrote enhanced output to {output_path}")
                        except Exception as enhance_err:
                            logger.warning(f"Error applying enhanced formatting: {enhance_err}")
                            # Fall back to normal output format
                            if output_path:
                                write_json_safely(result, output_path)
                                logger.info(f"Wrote standard output to {output_path}")
                    else:
                        # Write standard output if enhancer not available
                        if output_path:
                            update_progress(1, "Writing standard output")
                            write_json_safely(result, output_path)
                            logger.info(f"Wrote standard output to {output_path}")
                    
                    # Final progress update
                    update_progress(2, "Processing complete")
                    
                    # Return result if requested
                    if return_data:
                        return result
                    return None
                    
                # If we get here, something went wrong with the pdf_extractor processing
                logger.warning(f"pdf_extractor processing did not produce expected results for {pdf_path}. Falling back to built-in method.")
                
                # Log fallback telemetry if configured
                if PDF_EXTRACTOR_CONFIG.get("collect_telemetry", True):
                    log_fallback_telemetry("process_pdf")
            except Exception as e:
                logger.warning(f"pdf_extractor processing failed: {e}. Falling back to built-in method.")
                
                # Log fallback telemetry if configured
                if PDF_EXTRACTOR_CONFIG.get("collect_telemetry", True):
                    log_fallback_telemetry("process_pdf")
        
        # Reset progress for fallback processing
        current_step = 2
        update_progress(0, "Initializing fallback processing")
        
        # Check if PDF libraries are initialized
        global PDF_MODULE_INITIALIZED
        if not PDF_MODULE_INITIALIZED:
            initialize_pdf_libraries()
            PDF_MODULE_INITIALIZED = True
        
        # Create stats object for tracking
        stats = FileStats()
        
        # 1. Detect document type for specialized processing
        update_progress(1, "Detecting document type")
        doc_type = detect_document_type(pdf_path)
        logger.info(f"Detected document type: {doc_type}")
        
        check_cancellation()
        check_timeout()
        check_memory()
        
        # 2. Special handling for scanned documents if OCR is enabled
        text = ""
        confidence = 1.0
        pdf_data = None
        ocr_applied = False
        has_scanned_content = False

        # First check if the document is a scan that needs OCR
        needs_ocr = doc_type == "scan"

        # If OCR is enabled, check whether the PDF is searchable first
        if use_ocr and needs_ocr:
            update_progress(1, "Checking if OCR is needed")
            # Only run the check if OCR would be applied
            is_searchable = is_searchable_pdf(pdf_path)
            if is_searchable:
                logger.info(f"PDF {pdf_path} is searchable - skipping OCR")
                needs_ocr = False

        # Apply OCR if needed and enabled
        if needs_ocr and use_ocr:
            update_progress(1, "Applying OCR to scanned document")
            logger.info(f"Applying OCR to scanned PDF: {pdf_path}")
            ocr_results = process_scanned_pdf(pdf_path)
            text = ocr_results.get("text", "")
            confidence = ocr_results.get("confidence", 0)
            ocr_applied = True
            has_scanned_content = True
            stats.scanned_pages_processed += ocr_results.get("pages_processed", 0)
            stats.ocr_processed_files += 1
            
            if not text or len(text.strip()) < 100:
                # Fall back to basic extraction if OCR fails
                logger.warning("OCR processing failed, falling back to basic extraction")
                text = extract_basic_text_from_pdf(pdf_path)
        else:
            # 3. Extract text with structure information
            update_progress(1, "Extracting text and structure")
            pdf_extract_start = time.time()
            
            if not USE_FITZ and not USE_PYPDF2 and not USE_PDFPLUMBER:
                # No PDF libraries available, use basic extraction
                logger.warning("No PDF extraction libraries available, using basic extraction")
                text = extract_basic_text_from_pdf(pdf_path)
            else:
                # Use full extraction with structure if libraries available
                pdf_data = extract_text_from_pdf(pdf_path)
                text = pdf_data.get("full_text", "")
                
                # Record extraction metrics
                page_count = pdf_data.get("page_count", 0)
                extraction_time = time.time() - pdf_extract_start
                has_scanned_content = pdf_data.get("has_scanned_content", False)
                
                # If structured extraction failed, fall back to basic
                if not text or len(text.strip()) < 100:
                    logger.warning("Structured extraction failed, falling back to basic extraction")
                    text = extract_basic_text_from_pdf(pdf_path)
            
        # Check for cancellation and timeout after potentially long extraction
        check_cancellation()
        check_timeout()
        check_memory()
        
        # Check if we have enough text content
        if not text or len(text.strip()) < 100:
            logger.warning(f"All extraction methods yielded minimal text from {pdf_path}")
            # Try one last time with the most basic method
            text = extract_basic_text_from_pdf(pdf_path)
            if not text or len(text.strip()) < 100:
                logger.error(f"Could not extract meaningful text from {pdf_path}")
                if return_data:
                    return {
                        "status": "error",
                        "error": "Could not extract meaningful text from PDF",
                        "file_path": pdf_path
                    }
                return None
        
        # 4. Extract tables if enabled
        if extract_tables and doc_type in ["academic_paper", "report", "book"]:
            update_progress(1, "Extracting tables")
            if USE_TABULA or USE_PDFPLUMBER:
                table_start = time.time()
                tables = extract_tables_from_pdf(pdf_path)
                if tables:
                    logger.info(f"Extracted {len(tables)} tables from PDF")
                    stats.tables_extracted += len(tables)
                else:
                    logger.info("No tables extracted from PDF")
                
                # Report progress with tables info
                if progress_callback:
                    progress_callback(current_step / total_steps * 100, 
                                    f"Extracted {len(tables)} tables")
            else:
                logger.info("Table extraction libraries not available")
        
        check_cancellation()
        check_timeout()
        check_memory()
        
        # 5. Extract document structure
        update_progress(1, "Analyzing document structure")
        structure = {}
        if pdf_data and pdf_data.get("structure"):
            structure = pdf_data.get("structure", {})
        elif text:
            # Generate structure from text if we don't have it
            structure = identify_document_structure(
                text, 
                pdf_data.get("structure", {}).get("headings", []) if pdf_data else None
            )
        
        # 6. Extract references for academic papers
        if doc_type == "academic_paper":
            update_progress(1, "Extracting references")
            references = extract_references(text)
            if references:
                logger.info(f"Extracted {len(references)} references from PDF")
                stats.references_extracted += len(references)
            else:
                logger.info("No references extracted from PDF")
        
        # 7. Detect language
        update_progress(0.5, "Detecting language")
        language = detect_language(text)
        
        check_cancellation()
        check_timeout()
        check_memory()
        
        # 8. Create enhanced document object with all data
        update_progress(0.5, "Creating document object")
        content_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        
        pdf_doc = PDFDocument(
            file_path=pdf_path,
            full_text=text,
            metadata=pdf_data.get("metadata", {}) if pdf_data else {},
            structure=structure,
            tables=tables,
            references=references,
            document_type=doc_type,
            content_hash=content_hash,
            page_count=page_count,
            has_scanned_content=has_scanned_content,
            ocr_applied=ocr_applied,
            ocr_confidence=confidence if ocr_applied else 1.0,
            language=language
        )
        
        # 9. Use intelligent chunking with full content preservation
        update_progress(1, "Creating intelligent chunks")
        chunks = chunk_document_intelligently(pdf_doc, max_chunk_size, 200)  # Increased overlap for better continuity
        
        # 10. Generate stop words hash for tag generation
        stop_hash = hashlib.md5(str(sorted(DEFAULT_STOP_WORDS)).encode()).hexdigest()
        
        # 11. Create DocData objects with robust error handling
        update_progress(1, "Creating DocData objects")
        docdatas = []
        sec_name = extract_section_name(pdf_path)
        file_stats = os.stat(pdf_path)
        
        # CRITICAL: Always ensure we have a full content chunk
        has_full_content = any(
            chunk.get("metadata", {}).get("chunk_type") == "full_content" 
            for chunk in chunks
        )
        
        if not has_full_content and text:
            # Add a full content chunk at the beginning
            chunks.insert(0, {
                "content": text,
                "metadata": {
                    "title": pdf_doc.metadata.get("title", ""),
                    "chunk_type": "full_content",
                    "source": pdf_path,
                    "document_type": doc_type,
                    "tables_count": len(tables),
                    "references_count": len(references)
                }
            })
        
        # Check for cancellation after potentially intensive chunking
        check_cancellation()
        check_memory()
        
        # Create DocData objects with error handling for each chunk
        for i, chunk in enumerate(chunks):
            try:
                # Create a unique label for each chunk
                chunk_type = chunk.get("metadata", {}).get("chunk_type", "")
                
                if chunk_type == "full_content":
                    label = f"{sec_name}_full"
                elif chunk_type == "table":
                    table_idx = chunk.get("metadata", {}).get("table_index", i)
                    label = f"{sec_name}_table_{table_idx + 1}"
                elif chunk_type == "references":
                    label = f"{sec_name}_references"
                elif chunk.get("metadata", {}).get("sections") and len(chunk["metadata"]["sections"]) > 0:
                    section = chunk["metadata"]["sections"][0]
                    label = f"{sec_name}: {section}"
                else:
                    label = f"{sec_name}_Part_{i + 1}"
                
                # Generate enriched tags with document type
                tags = generate_smart_tags(
                    sec_name, 
                    chunk["content"], 
                    stop_hash, 
                    pdf_path,
                    doc_type,
                    language
                )
                
                # Create additional metadata
                metadata = {
                    "document_type": doc_type,
                    "language": language,
                    "pdf_metadata": pdf_data.get("metadata", {}) if pdf_data else {},
                    "has_tables": len(tables) > 0,
                    "tables_count": len(tables),
                    "references_count": len(references),
                    "page_count": pdf_doc.page_count,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "ocr_applied": pdf_doc.ocr_applied,
                    "ocr_confidence": pdf_doc.ocr_confidence if pdf_doc.ocr_applied else None,
                    "content_length": len(chunk["content"]),
                    "chunk_type": chunk_type if chunk_type else "content"
                }
                
                # Add section information if available
                if "metadata" in chunk:
                    for k, v in chunk["metadata"].items():
                        if k not in metadata:
                            metadata[k] = v
                
                # Create the DocData object
                dd = DocData(
                    section_name=label,
                    content=chunk["content"],
                    file_path=pdf_path,
                    file_size=file_stats.st_size,
                    last_modified=datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    tags=list(tags),
                    is_chunked=(len(chunks) > 1),
                    content_hash=pdf_doc.content_hash,
                    metadata=metadata,
                    document_type=doc_type,
                    language=language,
                    chunk_index=i,
                    total_chunks=len(chunks),
                    confidence_score=pdf_doc.ocr_confidence if pdf_doc.ocr_applied else 1.0,
                    tables=tables if i == 0 and chunk_type == "full_content" else []
                )
                docdatas.append(dd)
                
            except Exception as chunk_error:
                logger.error(f"Error processing chunk {i}: {chunk_error}")
                # Create a simplified version of the chunk with error information
                try:
                    # Create minimal DocData with error information
                    dd = DocData(
                        section_name=f"{sec_name}_Part_{i+1}_Error",
                        content=chunk.get("content", "")[:1000] + "...[content truncated due to processing error]",
                        file_path=pdf_path,
                        file_size=file_stats.st_size,
                        last_modified=datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                        tags=["error", "processing_failed"],
                        is_chunked=True,
                        content_hash="",
                        metadata={"error": str(chunk_error)},
                        document_type=doc_type,
                        language=language,
                        chunk_index=i,
                        total_chunks=len(chunks)
                    )
                    docdatas.append(dd)
                except Exception as recovery_error:
                    logger.error(f"Failed to create error DocData: {recovery_error}")
        
        # Verify we have at least one DocData with full content
        has_full_content = any(
            d.metadata.get("chunk_type") == "full_content" 
            for d in docdatas
        )
        
        if not has_full_content and text:
            # Add a full content DocData if missing
            logger.warning("No full content DocData found. Adding one.")
            try:
                full_dd = DocData(
                    section_name=f"{sec_name}_full",
                    content=text,
                    file_path=pdf_path,
                    file_size=file_stats.st_size,
                    last_modified=datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    tags=["full_content", doc_type, language],
                    is_chunked=False,
                    content_hash=pdf_doc.content_hash,
                    metadata={
                        "document_type": doc_type,
                        "language": language,
                        "pdf_metadata": pdf_doc.metadata,
                        "has_tables": len(tables) > 0,
                        "tables_count": len(tables),
                        "references_count": len(references),
                        "page_count": pdf_doc.page_count,
                        "chunk_type": "full_content",
                        "ocr_applied": pdf_doc.ocr_applied,
                        "ocr_confidence": pdf_doc.ocr_confidence if pdf_doc.ocr_applied else None,
                        "content_length": len(text),
                        "note": "Added due to missing full content"
                    },
                    document_type=doc_type,
                    language=language,
                    chunk_index=len(docdatas),
                    total_chunks=len(docdatas) + 1,
                    confidence_score=pdf_doc.ocr_confidence if pdf_doc.ocr_applied else 1.0,
                    tables=tables
                )
                docdatas.append(full_dd)
            except Exception as full_error:
                logger.error(f"Failed to add full content DocData: {full_error}")
        
        check_cancellation()
        check_memory()
        
        # 12. Create the output structure
        update_progress(1, "Creating final output")
        result = {
            "status": "success",
            "docs_data": [d.to_dict() for d in docdatas],
            "metadata": {
                "file_path": pdf_path,
                "document_type": doc_type,
                "processing_timestamp": datetime.now().isoformat(),
                "processing_duration": time.time() - start_time,
                "page_count": pdf_doc.page_count,
                "chunks_count": len(chunks),
                "tables_count": len(tables),
                "tables": tables,
                "references_count": len(references),
                "references": references,
                "ocr_applied": pdf_doc.ocr_applied,
                "ocr_confidence": pdf_doc.ocr_confidence if pdf_doc.ocr_applied else None,
                "language": language,
                "content_hash": pdf_doc.content_hash,
                "total_text_length": len(text) if text else 0,
                "libraries_used": {
                    "fitz": USE_FITZ,
                    "pypdf2": USE_PYPDF2,
                    "pdfplumber": USE_PDFPLUMBER,
                    "tabula": USE_TABULA,
                    "ocr": USE_OCR
                }
            }
        }
        
        # Apply enhanced output formatting if available
        if pdf_enhancer_available:
            try:
                # Convert to enhanced format - wrap data in expected structure
                all_data = {"pdf": {"docs_data": result["docs_data"]}}
                improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                result["enhanced_format"] = improved_data
                logger.info(f"Applied enhanced output formatting to {pdf_path}")
            except Exception as enhance_err:
                logger.warning(f"Error applying enhanced formatting: {enhance_err}")
        
        # 13. Write output to file with robust error handling
        if output_path:
            outdir = os.path.dirname(output_path)
            if outdir and not os.path.exists(outdir):
                os.makedirs(outdir, exist_ok=True)
            
            update_progress(1, "Writing output file")
            try:
                # If enhancer is available, write using enhanced format
                if pdf_enhancer_available and "enhanced_format" in result:
                    pdf_output_enhancer.write_improved_output(result["enhanced_format"], output_path)
                    logger.info(f"Successfully wrote enhanced output to {output_path}")
                else:
                    # Otherwise use standard output format
                    write_json_safely(result, output_path)
                    logger.info(f"Successfully wrote standard output to {output_path}")
            except Exception as write_error:
                logger.error(f"Error writing output: {write_error}")
                
                # Try direct fallback method as last resort
                try:
                    fallback_output = f"{os.path.splitext(output_path)[0]}_fallback.json"
                    logger.info(f"Using direct fallback to {fallback_output}")
                    
                    # Create a simplified output
                    with open(fallback_output, "w", encoding="utf-8") as f:
                        simple_data = {
                            "metadata": {
                                "file_path": pdf_path,
                                "document_type": doc_type,
                                "processing_timestamp": datetime.now().isoformat(),
                                "error": f"Original output failed: {str(write_error)}"
                            },
                            "docs_data": [
                                {
                                    "section_name": sec_name,
                                    "content": text,
                                    "file_path": pdf_path,
                                    "metadata": {
                                        "chunk_type": "full_content_fallback",
                                        "document_type": doc_type
                                    }
                                }
                            ]
                        }
                        json.dump(simple_data, f, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Fallback output saved to: {fallback_output}")
                    
                    # Update the original result to indicate fallback was used
                    result["fallback_output"] = fallback_output
                    result["output_error"] = str(write_error)
                except Exception as fallback_error:
                    logger.error(f"Fallback output also failed: {fallback_error}")
                    result["output_error"] = f"All output methods failed: {str(fallback_error)}"
        
        # Final progress update
        update_progress(1, "Processing complete")
        
        # 14. Return data if requested
        if return_data:
            logger.info(f"PDF processing completed in {time.time() - start_time:.2f}s")
            return result
        
        logger.info(f"PDF processing completed in {time.time() - start_time:.2f}s")
        return None
            
    except ProcessTimeoutError as e:
        logger.error(f"Timeout processing PDF {pdf_path}: {e}")
        # Generate partial result if possible for timeout case
        if return_data:
            return {
                "status": "timeout",
                "error": str(e),
                "file_path": pdf_path,
                "processing_time": time.time() - start_time,
                "partial_result": {
                    "document_type": doc_type if 'doc_type' in locals() else "unknown",
                    "text_length": len(text) if 'text' in locals() else 0,
                    "tables_extracted": len(tables) if 'tables' in locals() else 0,
                    "text_sample": text[:1000] + "..." if 'text' in locals() and text else ""
                }
            }
        return None
        
    except InterruptedError as e:
        logger.info(f"PDF processing cancelled for {pdf_path}: {e}")
        if return_data:
            return {
                "status": "cancelled",
                "message": str(e),
                "file_path": pdf_path,
                "processing_time": time.time() - start_time
            }
        return None
        
    except Exception as e:
        logger.error(f"Error processing PDF {pdf_path}: {e}", exc_info=True)
        
        # Last resort emergency processing for return_data mode
        if return_data:
            # Try very basic extraction
            emergency_text = None
            try:
                emergency_text = extract_basic_text_from_pdf(pdf_path)
            except Exception:
                pass
                
            error_result = {
                "status": "error",
                "error": str(e),
                "file_path": pdf_path,
                "traceback": traceback.format_exc(),
                "processing_time": time.time() - start_time
            }
            
            if emergency_text:
                logger.info(f"Emergency fallback extraction successful with {len(emergency_text)} characters")
                error_result["emergency_extraction"] = {
                    "content": emergency_text,
                    "length": len(emergency_text)
                }
                
                # Add bare minimum docs_data for API compatibility
                error_result["docs_data"] = [
                    {
                        "section_name": os.path.basename(pdf_path),
                        "content": emergency_text,
                        "file_path": pdf_path,
                        "file_size": os.path.getsize(pdf_path),
                        "last_modified": datetime.fromtimestamp(os.path.getmtime(pdf_path)).strftime("%Y-%m-%d %H:%M:%S"),
                        "metadata": {
                            "extraction_method": "emergency_fallback"
                        }
                    }
                ]
            
            return error_result
        
        return None
    
    finally:
            # Perform any necessary cleanup
            try:
                # Update stats if stats object was provided
                if 'stats' in locals() and stats is not None:
                    stats.processed_files += 1
                    stats.pdf_files += 1
                    if 'tables' in locals() and tables:
                        stats.tables_extracted += len(tables)
                    if 'references' in locals() and references:
                        stats.references_extracted += len(references)
                    if 'doc_type' in locals() and doc_type == "scan" and 'ocr_applied' in locals() and ocr_applied:
                        stats.scanned_pages_processed += page_count if 'page_count' in locals() else 0
                        stats.ocr_processed_files += 1
                    
                    # Update total processing time
                    stats.total_processing_time += time.time() - start_time
                    
                # Clean up any temporary files
                for tmp_file in _temp_files:
                    try:
                        if os.path.exists(tmp_file):
                            safely_remove_file(tmp_file)
                    except Exception as cleanup_err:
                        logger.debug(f"Error cleaning up temp file {tmp_file}: {cleanup_err}")
                        
                # Kill timeout thread if it exists
                if timeout_thread and timeout_thread.is_alive():
                    processing_cancelled.set()
                    timeout_thread.join(0.1)
                
                # Log completion with timing information
                logger.info(f"PDF processing completed in {time.time() - start_time:.2f}s: {file_path}")
            
            except Exception as final_err:
                logger.error(f"Error in final cleanup for {file_path}: {final_err}")
def process_pdf_safely(
    file_path: str,
    root_directory: str,
    stats_obj,  # Remove the type annotation to avoid circular import
    max_chunk_size: int
) -> Optional[Tuple[str, List["DocData"]]]:  # Use string annotation for DocData
    """
    Process a PDF file with enhanced error recovery and improved output formatting.
    This is a helper function for process_all_files.
    
    Args:
        file_path: Path to the PDF
        root_directory: Root directory for relative path
        stats_obj: Statistics object to update
        max_chunk_size: Maximum chunk size
    
    Returns:
        Tuple of (primary_library, list_of_docdata) or None if processing failed
    """
    logger.info(f"Processing PDF safely: {file_path}")
    primary_lib = ""
    processing_start = time.time()
    
    # Setup timeout handling to ensure the function doesn't hang
    processing_cancelled = threading.Event()
    timeout_thread = None
    PDF_PROCESSING_TIMEOUT = 300  # 5 minutes timeout for PDF processing
    
    if PDF_PROCESSING_TIMEOUT > 0:
        def cancel_after_timeout():
            logger.warning(f"PDF processing timeout after {PDF_PROCESSING_TIMEOUT}s for {file_path}")
            processing_cancelled.set()
        
        timeout_thread = threading.Timer(PDF_PROCESSING_TIMEOUT, cancel_after_timeout)
        timeout_thread.daemon = True
        timeout_thread.start()
    
    try:
        # Try primary processor - pdf_extractor if available
        if 'pdf_extractor_available' in globals() and pdf_extractor_available:
            try:
                # Set a temporary output path
                temp_output = os.path.join(
                    os.path.dirname(file_path),
                    f"temp_{os.path.basename(file_path).replace('.pdf', '')}.json"
                )
                
                # Process with pdf_extractor
                result = pdf_extractor.process_pdf(
                    pdf_path=file_path,
                    output_path=temp_output,
                    max_chunk_size=max_chunk_size,
                    extract_tables=True,
                    use_ocr=True,
                    return_data=True
                )
                
                # Check if processing was cancelled
                if processing_cancelled.is_set():
                    stats_obj.error_files += 1
                    raise TimeoutError(f"PDF processing timed out after {PDF_PROCESSING_TIMEOUT}s")
                
                if result and "error" not in result:
                    # Apply enhanced output formatting if available
                    if 'pdf_enhancer_available' in globals() and pdf_enhancer_available:
                        try:
                            # First create the structure expected by pdf_output_enhancer
                            all_data = {"pdf": {"docs_data": result.get("docs_data", [])}}
                            
                            # Generate the enhanced format
                            improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                            
                            # Add enhanced format to the result
                            result["enhanced_format"] = improved_data
                            logger.info(f"Applied enhanced formatting to {file_path}")
                            
                            # If there's an output file, write the enhanced format
                            if temp_output:
                                try:
                                    pdf_output_enhancer.write_improved_output(improved_data, temp_output)
                                    logger.info(f"Wrote enhanced output to {temp_output}")
                                except Exception as write_err:
                                    logger.warning(f"Error writing enhanced output: {write_err}")
                                    # Fall back to standard output
                                    with open(temp_output, "w", encoding="utf-8") as f:
                                        json.dump(result, f, ensure_ascii=False, indent=2)
                        except Exception as enhance_err:
                            logger.warning(f"Error applying enhanced formatting: {enhance_err}")
                    
                    # Extract DocData objects from the pdf_extractor format
                    docdata_list = []
                    for chunk in result.get("chunks", []):
                        # Check if processing was cancelled
                        if processing_cancelled.is_set():
                            stats_obj.error_files += 1
                            raise TimeoutError(f"PDF processing timed out after {PDF_PROCESSING_TIMEOUT}s")
                            
                        # Convert chunk to DocData
                        content = chunk.get("content", "")
                        metadata = chunk.get("metadata", {})
                        
                        # Extract section name or create one
                        section_name = extract_section_name(file_path) if 'extract_section_name' in globals() else os.path.basename(file_path)
                        chunk_type = metadata.get("chunk_type", "")
                        chunk_index = metadata.get("chunk_index", 0)
                        
                        if chunk_type == "full_content":
                            label = f"{section_name}_full"
                        elif chunk_type == "table":
                            table_idx = metadata.get("table_index", chunk_index)
                            label = f"{section_name}_table_{table_idx + 1}"
                        elif chunk_type == "references":
                            label = f"{section_name}_references"
                        elif metadata.get("sections") and len(metadata["sections"]) > 0:
                            section = metadata["sections"][0]
                            label = f"{section_name}: {section}"
                        else:
                            label = f"{section_name}_Part_{chunk_index + 1}"
                        
                        # Get file stats
                        file_stats = os.stat(file_path)
                        
                        # Generate tags if the function is available
                        tags = set()
                        if 'generate_smart_tags' in globals() and 'DEFAULT_STOP_WORDS' in globals():
                            stop_hash = hashlib.md5(str(sorted(DEFAULT_STOP_WORDS)).encode()).hexdigest()
                            tags = generate_smart_tags(
                                section_name,
                                content,
                                stop_hash,
                                file_path,
                                result.get("document_type", "general"),
                                metadata.get("language", "en")
                            )
                        
                        # Create DocData object, adapting to available initialization parameters
                        try:
                            # Try full initialization with all parameters
                            dd = DocData(
                                section_name=label,
                                content=content,
                                file_path=file_path,
                                file_size=file_stats.st_size,
                                last_modified=datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                                tags=list(tags),
                                is_chunked=len(result.get("chunks", [])) > 1,
                                content_hash=result.get("content_hash", ""),
                                metadata=metadata,
                                document_type=result.get("document_type", "general"),
                                language=metadata.get("language", "en"),
                                chunk_index=chunk_index,
                                total_chunks=len(result.get("chunks", [])),
                                confidence_score=result.get("ocr_confidence", 1.0) if result.get("has_scanned_content") else 1.0,
                                tables=result.get("tables", []) if chunk_index == 0 and chunk_type == "full_content" else []
                            )
                        except TypeError:
                            # Fall back to simpler initialization if the DocData class has different parameters
                            dd = DocData(
                                file_path=file_path,
                                content=content,
                                chunks=[content],
                                metadata=metadata,
                                tags=tags
                            )
                            # Set relative path if possible
                            try:
                                dd.relative_path = os.path.relpath(file_path, root_directory)
                            except ValueError:
                                dd.relative_path = file_path
                        
                        docdata_list.append(dd)
                    
                    # Extract primary library name
                    try:
                        p = Path(file_path)
                        try:
                            rel = str(p.relative_to(Path(root_directory)))
                        except ValueError:
                            # Fall back if paths are on different drives
                            rel = str(p)
                        parts = rel.split(os.sep)
                        primary_lib = parts[0] if len(parts) > 1 else "root"
                    except Exception:
                        primary_lib = "root"
                    
                    # Update statistics
                    stats_obj.pdf_files += 1
                    stats_obj.processed_files += 1
                    stats_obj.total_chunks += len(docdata_list)
                    
                    # Check if there are tables and references
                    tables_count = len(result.get("tables", []))
                    references_count = len(result.get("references", []))
                    
                    if tables_count > 0:
                        stats_obj.tables_extracted += tables_count
                    
                    if references_count > 0:
                        stats_obj.references_extracted += references_count
                    
                    # Update OCR statistics
                    if result.get("has_scanned_content", False) and result.get("ocr_applied", False):
                        stats_obj.ocr_processed_files += 1
                        stats_obj.scanned_pages_processed += result.get("page_count", 0)
                    
                    # Clean up temporary file
                    try:
                        if os.path.exists(temp_output):
                            os.remove(temp_output)
                    except Exception as e:
                        logger.warning(f"Failed to remove temporary file {temp_output}: {e}")
                    
                    # Update processing time
                    stats_obj.total_processing_time += (time.time() - processing_start)
                    
                    logger.info(f"Successfully processed PDF via pdf_extractor: {file_path}")
                    return (primary_lib, docdata_list)
                else:
                    error_msg = result.get("error", "Unknown error") if result else "Processing failed"
                    logger.warning(f"pdf_extractor processing failed for {file_path}: {error_msg}")
            except Exception as e:
                if processing_cancelled.is_set():
                    logger.error(f"PDF processing timed out for {file_path}")
                else:
                    logger.error(f"Error using pdf_extractor for {file_path}: {e}")
        
        # Check if processing was cancelled
        if processing_cancelled.is_set():
            stats_obj.error_files += 1
            raise TimeoutError(f"PDF processing timed out after {PDF_PROCESSING_TIMEOUT}s")
        
        # Fallback to standard processing if pdf_extractor is not available or fails
        logger.info(f"Using standard PDF processing for {file_path}")
        
        # Check if required libraries are defined and available
        use_fitz = 'USE_FITZ' in globals() and globals()['USE_FITZ']
        use_pypdf2 = 'USE_PYPDF2' in globals() and globals()['USE_PYPDF2']
        use_pdfplumber = 'USE_PDFPLUMBER' in globals() and globals()['USE_PDFPLUMBER']
        use_ocr = 'USE_OCR' in globals() and globals()['USE_OCR']
        
        # First try with our built-in PDF processing
        if use_fitz or use_pypdf2 or use_pdfplumber:
            # 1. Detect document type
            doc_type = "general"
            if 'detect_document_type' in globals():
                doc_type = detect_document_type(file_path)
                logger.info(f"Detected document type: {doc_type}")
            
            # 2. Extract text with structure information
            pdf_data = {"full_text": "", "metadata": {}, "structure": {}, "page_count": 0}
            if 'extract_text_from_pdf' in globals():
                pdf_data = extract_text_from_pdf(file_path)
            txt = pdf_data.get("full_text", "")
            
            # 3. Check if extraction succeeded
            if not txt or len(txt.strip()) < 100:
                # Try OCR if it's a scanned document
                if doc_type == "scan" and use_ocr and 'process_scanned_pdf' in globals():
                    logger.info(f"Applying OCR to scanned PDF: {file_path}")
                    ocr_results = process_scanned_pdf(file_path)
                    txt = ocr_results.get("text", "")
                    stats_obj.ocr_processed_files += 1
                    stats_obj.scanned_pages_processed += ocr_results.get("pages_processed", 0)
                
                # If still no text, use basic extraction
                if not txt or len(txt.strip()) < 100 and 'extract_basic_text_from_pdf' in globals():
                    txt = extract_basic_text_from_pdf(file_path)
            
            # 4. If still no good text content, return None
            if not txt or len(txt.strip()) < 100:
                logger.error(f"Failed to extract meaningful text from {file_path}")
                stats_obj.error_files += 1
                return None
            
            # 5. Extract tables if available
            tables = []
            if 'extract_tables_from_pdf' in globals() and doc_type in ["academic_paper", "report", "book"]:
                tables = extract_tables_from_pdf(file_path)
                stats_obj.tables_extracted += len(tables)
            
            # 6. Extract references for academic papers
            references = []
            if 'extract_references' in globals() and doc_type == "academic_paper":
                references = extract_references(txt)
                stats_obj.references_extracted += len(references)
            
            # 7. Detect language
            language = "en"
            if 'detect_language' in globals():
                language = detect_language(txt)
            
            # 8. Extract file path info
            try:
                p = Path(file_path)
                try:
                    rel = str(p.relative_to(Path(root_directory)))
                except ValueError:
                    # Fall back if paths are on different drives
                    rel = str(p)
                parts = rel.split(os.sep)
                primary_lib = parts[0] if len(parts) > 1 else "root"
            except Exception:
                primary_lib = "root"
            
            # 9. Create content hash
            doc_hash = hashlib.md5(txt.encode("utf-8")).hexdigest()
            
            # Check if processing was cancelled
            if processing_cancelled.is_set():
                stats_obj.error_files += 1
                raise TimeoutError(f"PDF processing timed out after {PDF_PROCESSING_TIMEOUT}s")
            
            # Create a PDFDocument object for better processing if class is available
            pdf_doc = None
            chunks = []
            
            if 'PDFDocument' in globals():
                pdf_doc = PDFDocument(
                    file_path=file_path,
                    full_text=txt,
                    metadata=pdf_data.get("metadata", {}),
                    structure=pdf_data.get("structure", {}),
                    tables=tables,
                    references=references,
                    document_type=doc_type,
                    page_count=pdf_data.get("page_count", 0),
                    has_scanned_content=doc_type == "scan",
                    ocr_applied=doc_type == "scan" and use_ocr,
                    ocr_confidence=ocr_results.get("confidence", 1.0) if 'ocr_results' in locals() else 1.0,
                    language=language,
                    content_hash=doc_hash
                )
                
                # Use enhanced chunking with document structure awareness if available
                if 'chunk_document_intelligently' in globals():
                    chunks = chunk_document_intelligently(pdf_doc, max_chunk_size, 200)
                else:
                    # Basic chunking as fallback
                    chunks = []
                    for i in range(0, len(txt), max_chunk_size - 200):
                        chunks.append({
                            "content": txt[i:i + max_chunk_size],
                            "metadata": {
                                "chunk_index": len(chunks),
                                "chunk_type": "content_part"
                            }
                        })
            else:
                # Simple chunking as fallback if PDFDocument is not available
                chunks = []
                for i in range(0, len(txt), max_chunk_size - 200):
                    chunks.append({
                        "content": txt[i:i + max_chunk_size],
                        "metadata": {
                            "chunk_index": len(chunks),
                            "chunk_type": "content_part"
                        }
                    })
            
            # 10. Create DocData objects
            stats_obj.pdf_files += 1
            stats_obj.processed_files += 1
            stats_obj.total_chunks += len(chunks) + 1  # +1 for full content
            
            docdatas = []
            sec_name = os.path.basename(file_path)
            if 'extract_section_name' in globals():
                sec_name = extract_section_name(file_path)
            
            # Prepare tags if available
            tags = set()
            if 'generate_smart_tags' in globals() and 'DEFAULT_STOP_WORDS' in globals():
                stop_hash = hashlib.md5(str(sorted(DEFAULT_STOP_WORDS)).encode()).hexdigest()
                tags = generate_smart_tags(sec_name, txt, stop_hash, file_path, doc_type, language)
            
            # Always include a full content chunk first
            try:
                # Try full initialization with all parameters
                full_dd = DocData(
                    section_name=f"{sec_name}_full",
                    content=txt,
                    file_path=rel,
                    file_size=os.path.getsize(file_path),
                    last_modified=datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S"),
                    tags=tags,
                    is_chunked=len(chunks) > 0,
                    content_hash=doc_hash,
                    metadata={
                        "document_type": doc_type,
                        "language": language,
                        "has_tables": len(tables) > 0,
                        "tables_count": len(tables),
                        "references_count": len(references),
                        "page_count": pdf_data.get("page_count", 0),
                        "chunk_type": "full_content",
                        "extraction_method": "built_in"
                    },
                    document_type=doc_type,
                    language=language,
                    chunk_index=0,
                    total_chunks=len(chunks) + 1,  # +1 for the full content
                    confidence_score=1.0,
                    tables=tables
                )
            except TypeError:
                # Fall back to simpler initialization if the DocData class has different parameters
                full_dd = DocData(
                    file_path=file_path,
                    content=txt,
                    chunks=[txt],
                    metadata={
                        "document_type": doc_type,
                        "language": language,
                        "has_tables": len(tables) > 0,
                        "tables_count": len(tables),
                        "references_count": len(references),
                        "page_count": pdf_data.get("page_count", 0),
                        "chunk_type": "full_content",
                        "extraction_method": "built_in"
                    },
                    tags=tags
                )
                # Set relative path if possible
                full_dd.relative_path = rel
            
            docdatas.append(full_dd)
            
            # Check if processing was cancelled
            if processing_cancelled.is_set():
                stats_obj.error_files += 1
                raise TimeoutError(f"PDF processing timed out after {PDF_PROCESSING_TIMEOUT}s")
            
            # Add individual chunks
            for i, chunk in enumerate(chunks):
                chunk_content = chunk.get("content", "")
                chunk_metadata = chunk.get("metadata", {})
                
                # Create a unique label for the chunk
                chunk_type = chunk_metadata.get("chunk_type", "")
                if chunk_type == "table":
                    label = f"{sec_name}_table_{i+1}"
                elif chunk_type == "references":
                    label = f"{sec_name}_references"
                elif chunk_metadata.get("sections") and len(chunk_metadata["sections"]) > 0:
                    section = chunk_metadata["sections"][0]
                    label = f"{sec_name}: {section}"
                else:
                    label = f"{sec_name}_Part_{i+1}"
                
                # Create metadata
                metadata = {
                    "document_type": doc_type,
                    "language": language,
                    "has_tables": len(tables) > 0,
                    "tables_count": len(tables),
                    "references_count": len(references),
                    "page_count": pdf_data.get("page_count", 0),
                    "chunk_type": chunk_type or "content_part",
                    "extraction_method": "built_in",
                    "chunk_index": i,
                    "total_chunks": len(chunks) + 1  # +1 for the full content
                }
                
                # Add any additional metadata from the chunk
                for key, value in chunk_metadata.items():
                    if key not in metadata:
                        metadata[key] = value
                
                # Generate tags if the function is available
                chunk_tags = set()
                if 'generate_smart_tags' in globals() and 'DEFAULT_STOP_WORDS' in globals():
                    stop_hash = hashlib.md5(str(sorted(DEFAULT_STOP_WORDS)).encode()).hexdigest()
                    chunk_tags = generate_smart_tags(sec_name, chunk_content, stop_hash, file_path, doc_type, language)
                
                try:
                    # Try full initialization with all parameters
                    dd = DocData(
                        section_name=label,
                        content=chunk_content,
                        file_path=rel,
                        file_size=os.path.getsize(file_path),
                        last_modified=datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S"),
                        tags=chunk_tags,
                        is_chunked=True,
                        content_hash=doc_hash,
                        metadata=metadata,
                        document_type=doc_type,
                        language=language,
                        chunk_index=i + 1,  # +1 because full content is index 0
                        total_chunks=len(chunks) + 1,  # +1 for the full content
                        confidence_score=1.0,
                        tables=[]  # Empty tables for regular chunks
                    )
                except TypeError:
                    # Fall back to simpler initialization if the DocData class has different parameters
                    dd = DocData(
                        file_path=file_path,
                        content=chunk_content,
                        chunks=[chunk_content],
                        metadata=metadata,
                        tags=chunk_tags
                    )
                    # Set relative path if possible
                    dd.relative_path = rel
                
                docdatas.append(dd)
            
            # Apply enhanced output formatting if available
            if 'pdf_enhancer_available' in globals() and pdf_enhancer_available:
                try:
                    # Use to_dict method if available, otherwise manually construct dict
                    doc_dicts = []
                    for d in docdatas:
                        if hasattr(d, 'to_dict') and callable(d.to_dict):
                            doc_dicts.append(d.to_dict())
                        else:
                            # Manually create dict from attributes
                            doc_dict = {k: v for k, v in d.__dict__.items() 
                                     if not k.startswith('_') and not callable(v)}
                            doc_dicts.append(doc_dict)
                    
                    # Create the structure expected by pdf_output_enhancer
                    all_data = {"pdf": {"docs_data": doc_dicts}}
                    
                    # Generate the enhanced format
                    improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                    
                    # Store enhanced format in first DocData object's metadata for later use
                    if docdatas:
                        if not hasattr(docdatas[0], 'metadata') or docdatas[0].metadata is None:
                            docdatas[0].metadata = {}
                        docdatas[0].metadata["enhanced_format"] = improved_data
                        
                    logger.info(f"Applied enhanced formatting to built-in processed data for {file_path}")
                except Exception as enhance_err:
                    logger.warning(f"Error applying enhanced formatting to built-in processed data: {enhance_err}")
            
            # Update processing time
            stats_obj.total_processing_time += (time.time() - processing_start)
            
            logger.info(f"Successfully processed PDF with built-in methods: {file_path}")
            return (primary_lib, docdatas)
        else:
            # No suitable PDF libraries available
            logger.error(f"No PDF processing libraries available for {file_path}")
            stats_obj.error_files += 1
            return None
    except TimeoutError:
        logger.error(f"PDF processing timed out for {file_path}")
        stats_obj.error_files += 1
        return None
    except Exception as e:
        logger.error(f"All PDF processing methods failed for {file_path}: {e}")
        stats_obj.error_files += 1
        return None
    finally:
        # Cancel timeout thread if it exists
        if timeout_thread and timeout_thread.is_alive():
            timeout_thread.cancel()

def process_document(
    file_path: str,
    output_path: str = None,
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    return_data: bool = False,
    extract_tables: bool = True,
    use_ocr: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Process a single document file (supports text files and PDFs).
    Enhanced with advanced formatting options and metadata extraction.
    
    Args:
        file_path: Path to the document file
        output_path: Where to save JSON output (if None, derives from filename)
        max_chunk_size: Maximum character count per chunk
        return_data: Whether to return processed data
        extract_tables: Whether to extract tables from PDFs
        use_ocr: Whether to use OCR for scanned PDFs
        
    Returns:
        If return_data is True, returns a dictionary with processed data, otherwise None
    """
    start_time = time.time()
    
    try:
        # Check if file exists
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        # Handle PDFs with specialized function
        if file_path.lower().endswith('.pdf'):
            result = process_pdf(
                file_path, 
                output_path=output_path, 
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                return_data=True  # Always get data to apply enhanced formatting
            )
            
            # Apply enhanced output formatting if available
            if pdf_enhancer_available and result and "error" not in result:
                try:
                    # Create the structure expected by pdf_output_enhancer
                    all_data = {"pdf": {"docs_data": result.get("docs_data", [])}}
                    
                    # Generate the enhanced format
                    improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                    
                    # Add enhanced format to the result
                    result["enhanced_format"] = improved_data
                    logger.info(f"Applied enhanced formatting to PDF document: {file_path}")
                    
                    # If output_path is specified and we haven't written to it yet, 
                    # write the enhanced output
                    if output_path and not os.path.exists(output_path):
                        try:
                            # Ensure output directory exists
                            outdir = os.path.dirname(output_path)
                            if outdir and not os.path.exists(outdir):
                                os.makedirs(outdir, exist_ok=True)
                                
                            # Write enhanced output
                            pdf_output_enhancer.write_improved_output(improved_data, output_path)
                            logger.info(f"Wrote enhanced output to {output_path}")
                        except Exception as write_err:
                            logger.warning(f"Error writing enhanced output: {write_err}")
                            # Fall back to standard output
                            with open(output_path, "w", encoding="utf-8") as f:
                                json.dump(result, f, ensure_ascii=False, indent=2)
                            logger.info(f"Wrote standard output to {output_path}")
                except Exception as enhance_err:
                    logger.warning(f"Error applying enhanced formatting: {enhance_err}")
            
            # Return result if requested
            if return_data:
                return result
            return None
            
        # Set default output path if not provided
        if not output_path:
            base = os.path.splitext(file_path)[0]
            output_path = f"{base}_processed.json"
            
        logger.info(f"Processing document: {file_path} -> {output_path}")
        
        # Read text content
        text = read_file_text(file_path)
        if not text:
            logger.error(f"Could not extract text from {file_path}")
            if return_data:
                return {"error": "Could not extract text", "file_path": file_path}
            return None
        
        # Calculate content hash
        doc_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        
        # Detect language
        language = detect_language(text)
        
        # Get section name
        sec_name = extract_section_name(file_path)
        
        # Get document structure if possible
        structure = None
        try:
            # Try to identify document structure for better chunking
            structure = identify_document_structure(text)
        except Exception as struct_err:
            logger.debug(f"Error identifying document structure: {struct_err}")
        
        # Determine file type and document type
        ext = Path(file_path).suffix.lower()
        document_type = "general"
        
        # Try to determine document type based on content and extension
        if ext == ".md":
            document_type = "markdown"
        elif ext in [".html", ".htm"]:
            document_type = "html"
        elif ext in [".py", ".js", ".ts", ".java", ".cpp", ".cs"]:
            document_type = "code"
        elif ext in [".json", ".yaml", ".yml"]:
            document_type = "data"
        elif ext in [".txt", ".rtf"]:
            # Try to identify document type from content
            if re.search(r'\b(abstract|introduction|methodology|results|conclusion|references)\b', text, re.IGNORECASE):
                document_type = "article"
            elif re.search(r'\b(chapter|section)\s+\d+\b', text, re.IGNORECASE):
                document_type = "book"
            elif re.search(r'\b(dear|sincerely|regards|to whom it may concern)\b', text, re.IGNORECASE):
                document_type = "letter"
        
        # Choose chunking method based on document type and structure
        chunks = []
        if structure and structure.get("sections"):
            # Structure-aware chunking
            chunks = chunk_document_by_structure(text, structure, max_chunk_size)
        else:
            # Fall back to word-based chunking
            chunks = chunk_text_by_words(text, max_chunk_size)
        
        # Generate DocData objects
        docdatas = []
        total_chunks = len(chunks)
        stop_hash = hashlib.md5(str(sorted(DEFAULT_STOP_WORDS)).encode()).hexdigest()
        
        # Always include a full content chunk first
        full_dd = DocData(
            section_name=f"{sec_name}_full",
            content=text,
            file_path=file_path,
            file_size=os.path.getsize(file_path),
            last_modified=datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S"),
            tags=generate_smart_tags(sec_name, text, stop_hash, file_path, document_type, language),
            is_chunked=(total_chunks > 1),
            content_hash=doc_hash,
            metadata={
                "document_type": document_type,
                "file_type": ext[1:] if ext else "unknown",
                "language": language,
                "chunk_type": "full_content",
                "chunk_index": 0,
                "total_chunks": total_chunks + 1  # +1 for the full content
            },
            document_type=document_type,
            language=language,
            chunk_index=0,
            total_chunks=total_chunks + 1
        )
        docdatas.append(full_dd)
        
        # Process each chunk
        for i, chunk in enumerate(chunks):
            chunk_content = chunk if isinstance(chunk, str) else chunk.get("content", "")
            chunk_metadata = {} if isinstance(chunk, str) else chunk.get("metadata", {})
            
            # Create a label based on chunk metadata if available
            if isinstance(chunk, dict) and chunk.get("metadata", {}).get("sections"):
                section = chunk["metadata"]["sections"][0]
                label = f"{sec_name}: {section}"
            else:
                label = f"{sec_name}_Part_{i+1}"
            
            # Generate metadata
            metadata = {
                "document_type": document_type,
                "file_type": ext[1:] if ext else "unknown",
                "language": language,
                "chunk_index": i,
                "total_chunks": total_chunks + 1  # +1 for the full content
            }
            
            # Add any additional metadata from the chunk
            if not isinstance(chunk, str):
                for key, value in chunk_metadata.items():
                    metadata[key] = value
            
            dd = DocData(
                section_name=label,
                content=chunk_content,
                file_path=file_path,
                file_size=os.path.getsize(file_path),
                last_modified=datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S"),
                tags=generate_smart_tags(sec_name, chunk_content, stop_hash, file_path, document_type, language),
                is_chunked=True,
                content_hash=doc_hash,
                metadata=metadata,
                document_type=document_type,
                language=language,
                chunk_index=i+1,  # +1 for the full content
                total_chunks=total_chunks + 1  # +1 for the full content
            )
            docdatas.append(dd)
        
        # Create the output structure
        result = {
            "docs_data": [d.to_dict() for d in docdatas],
            "metadata": {
                "file_path": file_path,
                "file_type": ext[1:] if ext else "unknown",
                "document_type": document_type,
                "processing_timestamp": datetime.now().isoformat(),
                "processing_duration": time.time() - start_time,
                "chunks_count": len(docdatas),
                "language": language,
                "content_hash": doc_hash
            }
        }
        
        # Apply enhanced output formatting if available
        if pdf_enhancer_available:
            try:
                # Create the structure expected by pdf_output_enhancer
                all_data = {"document": {"docs_data": result["docs_data"]}}
                
                # Generate the enhanced format
                improved_data = pdf_output_enhancer.prepare_improved_output(all_data)
                
                # Add enhanced format to the result
                result["enhanced_format"] = improved_data
                logger.info(f"Applied enhanced formatting to document: {file_path}")
                
                # Write output to file with enhanced format
                if output_path:
                    outdir = os.path.dirname(output_path)
                    if outdir and not os.path.exists(outdir):
                        os.makedirs(outdir, exist_ok=True)
                    
                    # Write using enhanced output formatter
                    pdf_output_enhancer.write_improved_output(improved_data, output_path)
                    logger.info(f"Document processing complete. Enhanced output saved to: {output_path}")
            except Exception as enhance_err:
                logger.warning(f"Error applying enhanced formatting: {enhance_err}")
                
                # Fall back to standard output
                if output_path:
                    outdir = os.path.dirname(output_path)
                    if outdir and not os.path.exists(outdir):
                        os.makedirs(outdir, exist_ok=True)
                    
                    with open(output_path, "w", encoding="utf-8") as of:
                        json.dump(result, of, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Document processing complete. Standard output saved to: {output_path}")
        else:
            # Write standard output if enhancer not available
            if output_path:
                outdir = os.path.dirname(output_path)
                if outdir and not os.path.exists(outdir):
                    os.makedirs(outdir, exist_ok=True)
                
                with open(output_path, "w", encoding="utf-8") as of:
                    json.dump(result, of, ensure_ascii=False, indent=2)
                
                logger.info(f"Document processing complete. Output saved to: {output_path}")
        
        # Return data if requested
        if return_data:
            return result
        
        return None
            
    except Exception as e:
        logger.error(f"Error processing document {file_path}: {e}", exc_info=True)
        if return_data:
            return {
                "error": str(e), 
                "file_path": file_path,
                "processing_time": time.time() - start_time,
                "traceback": traceback.format_exc()
            }
        return None
    
def process_scanned_pdf(file_path: str) -> Dict[str, Any]:
    """
    Process scanned PDFs using OCR with robust temp file handling and error recovery.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Dictionary with extracted text, confidence scores and page info
    """
    start_time = time.time()
    logger.info(f"Starting OCR processing for: {os.path.basename(file_path)}")
    
    # Create a job-specific temp directory with unique ID
    job_id = uuid.uuid4().hex
    job_temp_dir = os.path.join(TEMP_OCR_DIR, f"ocr_job_{job_id}")
    os.makedirs(job_temp_dir, exist_ok=True)
    logger.info(f"Created job-specific temp directory for OCR: {job_temp_dir}")
    
    # Store original environment variables for restoration
    original_env = {
        "TEMP": os.environ.get('TEMP'),
        "TMP": os.environ.get('TMP')
    }
    
    # Set environment variables for this processing job
    os.environ['TEMP'] = job_temp_dir
    os.environ['TMP'] = job_temp_dir
    
    # Ensure tessdata directory is properly set
    tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
    os.environ['TESSDATA_PREFIX'] = tessdata_dir

    # Initialize result with defaults
    result = {
        "text": "",
        "confidence": 0.0,
        "pages_processed": 0,
        "success": False,
        "extraction_method": "ocr_failed",
        "processing_time": 0,
        "ocr_engine": None,
        "page_details": []
    }
    
    # Track temp files for cleanup
    temp_files = []
    
    try:
        # Check if OCR capabilities are available
        if not USE_OCR:
            logger.warning("OCR libraries not available. Using basic text extraction for scanned PDF.")
            text = extract_basic_text_from_pdf(file_path)
            result.update({
                "text": text,
                "success": bool(text.strip()),
                "extraction_method": "basic_extraction",
                "processing_time": time.time() - start_time
            })
            return result
        
        # Need PyMuPDF to convert PDF pages to images for OCR
        if not USE_FITZ:
            logger.warning("PyMuPDF required for OCR processing. Using basic extraction instead.")
            text = extract_basic_text_from_pdf(file_path)
            result.update({
                "text": text,
                "success": bool(text.strip()),
                "extraction_method": "basic_extraction",
                "processing_time": time.time() - start_time
            })
            return result
        
        # Process the PDF with OCR
        try:
            import fitz  # PyMuPDF
            import pytesseract
            from PIL import Image
            import cv2
            import numpy as np
            
            # Configure Tesseract with language and optimization settings
            tessconfig = f"--tessdata-dir {tessdata_dir} --dpi 300 --oem 1 --psm 3"
            logger.info(f"Using Tesseract config: {tessconfig}")
            
            with fitz.open(file_path) as doc:
                # Process a reasonable number of pages (limit for large documents)
                total_pages = len(doc)
                max_pages_to_process = min(total_pages, 50)  # Process up to 50 pages
                
                if total_pages > max_pages_to_process:
                    logger.warning(f"Document has {total_pages} pages; limiting OCR to first {max_pages_to_process} pages")
                
                # Prepare for text extraction
                text_content = []
                ocr_applied_pages = 0
                skipped_pages = 0
                total_confidence = 0.0
                page_confidences = []
                
                # Determine if we'll use enhanced OCR (attempt to detect cv2 availability)
                use_enhanced_ocr = 'cv2' in sys.modules
                if use_enhanced_ocr:
                    logger.info("Using enhanced OCR with image preprocessing")
                
                # Process each page in range
                for page_idx in range(max_pages_to_process):
                    page = doc[page_idx]
                    
                    # Check if page already has text content
                    page_text = page.get_text()
                    page_detail = {
                        "page_number": page_idx + 1,
                        "ocr_applied": False,
                        "text_length": len(page_text),
                        "confidence": None
                    }
                    
                    # If page has substantial text, use it directly (no OCR needed)
                    if len(page_text.strip()) >= 150:  # Threshold for "enough text"
                        text_content.append(page_text)
                        skipped_pages += 1
                        page_detail["extraction_method"] = "direct_extraction"
                        result["page_details"].append(page_detail)
                        continue
                    
                    # Page needs OCR - render to image
                    logger.info(f"Page {page_idx+1} appears to be scanned. Applying OCR.")
                    
                    # Create a unique filename in job temp directory
                    img_filename = f"page_{page_idx}_{uuid.uuid4().hex}.png"
                    img_path = os.path.join(job_temp_dir, img_filename)
                    temp_files.append(img_path)
                    
                    # Higher resolution for better OCR accuracy (but not too high to avoid memory issues)
                    zoom_factor = 2.0  # 2x zoom = 2x resolution
                    matrix = fitz.Matrix(zoom_factor, zoom_factor)
                    pix = page.get_pixmap(matrix=matrix)
                    pix.save(img_path)
                    
                    try:
                        # Apply OCR with appropriate preprocessing
                        if use_enhanced_ocr:
                            # Enhanced OCR with preprocessing pipeline
                            img = cv2.imread(img_path)
                            
                            # Image preprocessing pipeline
                            # 1. Convert to grayscale
                            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                            
                            # 2. Apply adaptive thresholding
                            binary = cv2.adaptiveThreshold(
                                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                cv2.THRESH_BINARY, 21, 12
                            )
                            
                            # 3. Denoise
                            denoised = cv2.fastNlMeansDenoising(binary, None, 10, 7, 21)
                            
                            # 4. Add border for better edge detection
                            bordered = cv2.copyMakeBorder(
                                denoised, 10, 10, 10, 10, 
                                cv2.BORDER_CONSTANT, value=[255, 255, 255]
                            )
                            
                            # Save preprocessed image
                            preprocessed_path = f"{os.path.splitext(img_path)[0]}_preprocessed.png"
                            cv2.imwrite(preprocessed_path, bordered)
                            temp_files.append(preprocessed_path)
                            
                            # Apply OCR to preprocessed image
                            ocr_data = pytesseract.image_to_data(
                                Image.open(preprocessed_path),
                                config=tessconfig,
                                output_type=pytesseract.Output.DICT
                            )
                            
                            ocr_text = pytesseract.image_to_string(
                                Image.open(preprocessed_path),
                                config=tessconfig
                            )
                            
                            # Calculate confidence
                            conf_values = [float(c) for c in ocr_data['conf'] if c != '-1']
                            page_confidence = sum(conf_values) / len(conf_values) if conf_values else 0
                            
                        else:
                            # Standard OCR without preprocessing
                            ocr_text = pytesseract.image_to_string(
                                Image.open(img_path),
                                config=tessconfig
                            )
                            
                            # Get confidence data
                            ocr_data = pytesseract.image_to_data(
                                Image.open(img_path),
                                config=tessconfig,
                                output_type=pytesseract.Output.DICT
                            )
                            
                            # Calculate confidence
                            conf_values = [float(c) for c in ocr_data['conf'] if c != '-1']
                            page_confidence = sum(conf_values) / len(conf_values) if conf_values else 0
                        
                        # Process results
                        if ocr_text.strip():
                            # OCR returned text
                            text_content.append(ocr_text)
                            total_confidence += page_confidence
                            ocr_applied_pages += 1
                            
                            # Update page details
                            page_detail.update({
                                "ocr_applied": True,
                                "text_length": len(ocr_text),
                                "confidence": page_confidence,
                                "extraction_method": "enhanced_ocr" if use_enhanced_ocr else "standard_ocr"
                            })
                            
                            page_confidences.append(page_confidence)
                            logger.debug(f"OCR success on page {page_idx+1}, confidence: {page_confidence:.1f}%")
                        else:
                            # OCR failed - use whatever text we got from direct extraction
                            text_content.append(page_text)
                            logger.debug(f"OCR returned empty result for page {page_idx+1}, using standard extraction")
                            page_detail["extraction_method"] = "ocr_failed_fallback"
                        
                        # Cleanup temp files for this page immediately to save space
                        for tmp in [img_path, preprocessed_path if use_enhanced_ocr else None]:
                            if tmp and os.path.exists(tmp):
                                try:
                                    safely_remove_file(tmp)
                                    temp_files.remove(tmp) if tmp in temp_files else None
                                except Exception as cleanup_err:
                                    logger.debug(f"Non-critical error during temp file cleanup: {cleanup_err}")
                        
                    except Exception as ocr_err:
                        logger.warning(f"OCR error on page {page_idx+1}: {ocr_err}")
                        # Fallback to using whatever text we got from direct extraction
                        text_content.append(page_text)
                        page_detail["extraction_method"] = "ocr_error_fallback"
                        
                        # Cleanup this page's temp files
                        try:
                            if os.path.exists(img_path):
                                safely_remove_file(img_path)
                        except Exception:
                            pass
                    
                    result["page_details"].append(page_detail)
            
            # Combine all text content
            full_text = "\n\n".join([t for t in text_content if t.strip()])
            
            # Calculate overall confidence score
            avg_confidence = total_confidence / ocr_applied_pages if ocr_applied_pages > 0 else 0.0
            
            # Use median confidence for more reliability (less affected by outliers)
            median_confidence = sorted(page_confidences)[len(page_confidences)//2] if page_confidences else 0.0
            
            # Update the result object
            result.update({
                "text": full_text,
                "confidence": avg_confidence,
                "median_confidence": median_confidence,
                "pages_processed": max_pages_to_process,
                "pages_with_ocr": ocr_applied_pages,
                "pages_skipped": skipped_pages,
                "success": bool(full_text.strip()),
                "extraction_method": "ocr" if ocr_applied_pages > 0 else "mixed",
                "ocr_engine": "tesseract_enhanced" if use_enhanced_ocr else "tesseract",
                "processing_time": time.time() - start_time
            })
            
            # If we got very little text, try fallback method
            if not full_text or len(full_text.strip()) < 200:
                logger.warning(f"OCR extracted minimal text from {file_path}. Trying fallback extraction.")
                fallback_text = extract_basic_text_from_pdf(file_path)
                
                if fallback_text and len(fallback_text.strip()) > len(full_text.strip()):
                    result.update({
                        "text": fallback_text,
                        "success": True,
                        "extraction_method": "fallback_extraction",
                        "confidence": 0.3,  # Low confidence for fallback method
                        "original_ocr_text": full_text  # Keep original OCR text for reference
                    })
            
            # Log statistics for diagnostics
            logger.info(f"OCR statistics for {os.path.basename(file_path)}: {ocr_applied_pages} pages OCR'd, " +
                         f"{skipped_pages} skipped, avg confidence: {avg_confidence:.1f}%")
            
            return result
        
        except ImportError as imp_err:
            logger.error(f"Import error during OCR processing: {imp_err}")
            result["error"] = f"Missing dependency: {str(imp_err)}"
            
            # Fallback to basic text extraction
            text = extract_basic_text_from_pdf(file_path)
            result.update({
                "text": text,
                "success": bool(text.strip()),
                "extraction_method": "import_error_fallback",
                "processing_time": time.time() - start_time,
                "error_details": str(imp_err)
            })
            return result
            
        except Exception as process_err:
            logger.error(f"Error during OCR processing: {process_err}", exc_info=True)
            result["error"] = str(process_err)
            
            # Attempt emergency fallback
            try:
                logger.info(f"Attempting emergency text extraction for {file_path}")
                text = extract_text_even_without_ocr(file_path)
                result.update({
                    "text": text,
                    "success": bool(text.strip()),
                    "extraction_method": "emergency_fallback",
                    "processing_time": time.time() - start_time,
                    "error_details": str(process_err)
                })
            except Exception as fallback_err:
                logger.error(f"Emergency fallback also failed: {fallback_err}")
                result["error_details"] = f"{str(process_err)} | Fallback error: {str(fallback_err)}"
            return result
    
    except Exception as e:
        logger.error(f"OCR processing failed for {file_path}: {e}", exc_info=True)
        
        # Set error information in result
        result.update({
            "error": str(e),
            "stacktrace": traceback.format_exc(), 
            "processing_time": time.time() - start_time
        })
        
        # Attempt to get at least some text
        try:
            text = extract_basic_text_from_pdf(file_path)
            if text:
                result.update({
                    "text": text,
                    "success": True,
                    "extraction_method": "error_recovery_extraction"
                })
        except Exception:
            pass
            
        return result
    
    finally:
        # Clean up all temporary files with proper error handling
        for tmp_file in temp_files:
            try:
                if os.path.exists(tmp_file):
                    safely_remove_file(tmp_file, max_retries=3, retry_delay=0.5)
                    logger.debug(f"Removed temp file {tmp_file}")
            except Exception as e:
                logger.debug(f"Failed to remove temp file {tmp_file}: {e}")
                
        # Schedule job temp directory for delayed cleanup
        try:
            # Create a separate thread for delayed cleanup
            def delayed_cleanup(dir_path, delay=30):
                time.sleep(delay)
                try:
                    if os.path.exists(dir_path):
                        import shutil
                        shutil.rmtree(dir_path, ignore_errors=True)
                        logger.debug(f"Cleaned up temp directory: {dir_path}")
                except Exception as e:
                    logger.debug(f"Failed to clean up temp directory {dir_path}: {e}")
            
            # Start the cleanup thread
            threading.Thread(target=delayed_cleanup, args=(job_temp_dir,), daemon=True).start()
            logger.debug(f"Scheduled delayed cleanup for {job_temp_dir}")
        except Exception as e:
            logger.debug(f"Failed to schedule directory cleanup: {e}")
            
        # Restore original environment variables
        for key, value in original_env.items():
            if value:
                os.environ[key] = value
                
        # Final log message
        duration = time.time() - start_time
        logger.info(f"OCR processing completed in {duration:.2f}s for {os.path.basename(file_path)}")
            
def patch_pytesseract_temp_handling():
    """
    Monkey patch pytesseract to ignore errors when cleaning up temp files.
    This allows OCR to continue even if temp file deletion fails.
    """
    try:
        import pytesseract
        
        # Store the original cleanup function
        original_cleanup = pytesseract.pytesseract.cleanup
        
        # Create a new cleanup function that ignores errors
        def safe_cleanup(temp_name):
            try:
                original_cleanup(temp_name)
            except Exception as e:
                # Log the error but don't raise it
                logger.debug(f"Ignored temp file cleanup error: {e}")
                pass
        
        # Replace the original cleanup function
        pytesseract.pytesseract.cleanup = safe_cleanup
        logger.info("Successfully patched pytesseract to ignore temp file deletion errors")
        return True
    except Exception as e:
        logger.warning(f"Failed to patch pytesseract temp handling: {e}")
        return False

def start_temp_file_cleanup_service():
    """
    Start a background thread that periodically cleans up temporary files.
    This separates file cleanup from the OCR process.
    """
    def cleanup_worker():
        while True:
            try:
                # Sleep first to allow current processes to finish
                time.sleep(1800)  # Run every 30 minutes
                
                # Clean up temp files
                cleanup_temp_files()
            except Exception as e:
                logger.error(f"Error in temp file cleanup service: {e}")
    
    # Start the background thread
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()
    logger.info("Started temp file cleanup service")

# Apply patches and start cleanup service
patch_pytesseract_temp_handling()
start_temp_file_cleanup_service()

# In claude.py
def safely_remove_file(file_path, max_retries=5, retry_delay=0.5, force=False):
    """
    Safely remove a file with retry logic and improved error handling for Windows.
    """
    if not file_path or not os.path.exists(file_path):
        return True  # Nothing to do
        
    for attempt in range(max_retries):
        try:
            os.remove(file_path)
            return True
        except PermissionError:
            # File might be locked or in use
            logger.debug(f"Permission error removing {file_path}, waiting {retry_delay}s (attempt {attempt+1}/{max_retries})")
            time.sleep(retry_delay * (attempt + 1))
        except Exception as e:
            logger.debug(f"Error removing {file_path}: {e}")
            time.sleep(retry_delay)
            
    # If all retries failed, schedule delayed removal
    try:
        def delayed_remove(path, delay=10):
            time.sleep(delay)
            try:
                if os.path.exists(path):
                    os.remove(path)
                    logger.debug(f"Successfully removed file with delayed removal: {path}")
            except Exception as e:
                logger.debug(f"Failed to remove file in delayed removal: {path}, {e}")
                
        # Start a separate thread for delayed removal
        thread = threading.Thread(target=delayed_remove, args=(file_path,), daemon=True)
        thread.start()
        logger.debug(f"Scheduled delayed removal for {file_path}")
        return True  # Consider it handled since we scheduled removal
    except Exception as e:
        logger.debug(f"Failed to schedule delayed removal for {file_path}: {e}")
        
    return False
                
def log_fallback_telemetry(function_name: str):
    """
    Track and log when fallbacks are used
    
    Args:
        function_name: Name of the function where fallback occurred
    """
    global fallback_counts
    if function_name in fallback_counts:
        fallback_counts[function_name] += 1
        # Log every 10th fallback for a function to avoid excessive logging
        if fallback_counts[function_name] % 10 == 0:
            logger.info(f"Fallback usage count for {function_name}: {fallback_counts[function_name]}")

def verify_system_configuration():
    """
    Verify system configuration and dependencies, providing clear guidance on fixing issues.
    """
    results = {
        "tesseract_installed": False,
        "tesseract_language_data": False,
        "java_installed": False,
        "pymupdf_installed": False,
        "pypdf2_installed": False,
        "pdfplumber_installed": False,
        "memory_available": 0,
        "temp_directory_writable": False,
        "overall_status": "failed",
        "issues": [],
        "recommendations": []
    }
    
    # Check Tesseract installation
    try:
        import pytesseract
        results["tesseract_installed"] = True
    except ImportError:
        results["issues"].append("Tesseract OCR not installed or pytesseract module missing")
        results["recommendations"].append("Install pytesseract: pip install pytesseract")
        results["recommendations"].append("Install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")
    
    # Check Tesseract language data
    if results["tesseract_installed"]:
        tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
        eng_file_path = os.path.join(tessdata_dir, "eng.traineddata")
        if os.path.exists(eng_file_path):
            results["tesseract_language_data"] = True
        else:
            results["issues"].append("Tesseract language data missing")
            results["recommendations"].append(f"Install language data to {tessdata_dir} using install_tesseract_language_data()")
    
    # Check Java installation for Tabula
    try:
        import jpype
        results["java_installed"] = True
    except ImportError:
        results["issues"].append("Java not available or jpype module missing")
        results["recommendations"].append("Install JPype: pip install JPype1")
        results["recommendations"].append("Install Java JRE or JDK")
    
    # Check PDF libraries
    try:
        import fitz
        results["pymupdf_installed"] = True
    except ImportError:
        results["issues"].append("PyMuPDF not installed")
        results["recommendations"].append("Install PyMuPDF: pip install PyMuPDF")
    
    try:
        import PyPDF2
        results["pypdf2_installed"] = True
    except ImportError:
        results["issues"].append("PyPDF2 not installed")
        results["recommendations"].append("Install PyPDF2: pip install PyPDF2")
    
    try:
        import pdfplumber
        results["pdfplumber_installed"] = True
    except ImportError:
        results["issues"].append("pdfplumber not installed")
        results["recommendations"].append("Install pdfplumber: pip install pdfplumber")
    
    # Check memory
    try:
        import psutil
        memory = psutil.virtual_memory()
        results["memory_available"] = memory.available / (1024 * 1024)  # MB
        
        if results["memory_available"] < 1000:  # Less than 1GB
            results["issues"].append(f"Low available memory: {results['memory_available']:.0f} MB")
            results["recommendations"].append("Close other applications to free up memory")
    except ImportError:
        results["issues"].append("psutil not installed, can't check memory")
        results["recommendations"].append("Install psutil: pip install psutil")
    
    # Check temp directory
    try:
        # Create a test file
        test_file = os.path.join(TEMP_OCR_DIR, "write_test.txt")
        with open(test_file, 'w') as f:
            f.write("test")
        
        # Remove the test file
        os.remove(test_file)
        results["temp_directory_writable"] = True
    except Exception as e:
        results["issues"].append(f"Temp directory not writable: {e}")
        results["recommendations"].append(f"Set permissions on {TEMP_OCR_DIR} directory")
    
    # Overall status
    if results["issues"]:
        results["overall_status"] = "issues_detected"
    else:
        results["overall_status"] = "ok"
    
    # Log results
    if results["overall_status"] == "ok":
        logger.info("System configuration verified successfully")
    else:
        logger.warning(f"System configuration issues detected: {len(results['issues'])} issues found")
        for issue in results["issues"]:
            logger.warning(f"Issue: {issue}")
        for rec in results["recommendations"]:
            logger.info(f"Recommendation: {rec}")
    
    return results

def run_configuration_wizard():
    """
    Interactive configuration wizard for first-time setup.
    """
    global TEMP_OCR_DIR
    print("\n==== PDF Processing System Configuration Wizard ====\n")
    
    # Check current configuration
    config_status = verify_system_configuration()
    
    if config_status["overall_status"] == "ok":
        print("✅ Great! Your system is properly configured.")
        return True
    
    print("The following issues were detected with your configuration:\n")
    for i, issue in enumerate(config_status["issues"], 1):
        print(f"{i}. ❌ {issue}")
    
    print("\nLet's fix these issues:")
    
    # Fix Tesseract and language data
    if "tesseract_installed" in config_status and not config_status["tesseract_installed"]:
        print("\n--- Installing Tesseract OCR ---")
        print("Tesseract must be installed manually:")
        print("1. Windows: https://github.com/UB-Mannheim/tesseract/wiki")
        print("2. macOS: brew install tesseract")
        print("3. Linux: apt install tesseract-ocr")
        
        print("\nAfter installation, install the Python binding:")
        print("pip install pytesseract")
        
        input("\nPress Enter when complete, or Ctrl+C to exit...")
    
    if "tesseract_language_data" in config_status and not config_status["tesseract_language_data"]:
        print("\n--- Installing Tesseract language data ---")
        install_tesseract_language_data()
    
    # Fix temp directory
    if "temp_directory_writable" in config_status and not config_status["temp_directory_writable"]:
        print("\n--- Setting up temporary directory ---")
        try:
            os.makedirs(TEMP_OCR_DIR, exist_ok=True)
            print(f"Created directory: {TEMP_OCR_DIR}")
            
            # Try to set permissions
            if os.name == 'posix':  # Linux/Mac
                try:
                    import stat
                    os.chmod(TEMP_OCR_DIR, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
                    print(f"Set permissions on {TEMP_OCR_DIR}")
                except Exception as e:
                    print(f"Error setting permissions: {e}")
                    print(f"Please manually set write permissions on {TEMP_OCR_DIR}")
        except Exception as e:
            print(f"Error creating temp directory: {e}")
            print("Please create the directory manually")
    
    # Verify configuration again
    print("\nVerifying configuration again...")
    new_config_status = verify_system_configuration()
    
    if new_config_status["overall_status"] == "ok":
        print("\n✅ Great! All issues have been resolved.")
        return True
    else:
        print("\n⚠️ Some issues still remain:")
        for i, issue in enumerate(new_config_status["issues"], 1):
            print(f"{i}. ❌ {issue}")
        
        print("\nPlease resolve these issues manually using the recommendations:")
        for rec in new_config_status["recommendations"]:
            print(f"• {rec}")
        
        return False
                
# -----------------------------------------------------------------------------
# CUSTOM EXCEPTIONS
# -----------------------------------------------------------------------------
class MetadataExtractionError(Exception):
    """Raised when metadata extraction fails"""
    pass

class BinaryFileError(Exception):
    """Raised when file is detected as binary and should be skipped"""
    pass

class PDFExtractionError(Exception):
    """Raised when PDF extraction fails"""
    pass

class OCRError(Exception):
    """Raised when OCR processing fails"""
    pass

class FileTooLargeError(Exception):
    """Raised when file exceeds maximum size limit"""
    pass

class ProcessTimeoutError(Exception):
    """Raised when processing exceeds timeout limit"""
    pass

class TableExtractionError(Exception):
    """Raised when table extraction fails"""
    pass

class InvalidConfigurationError(Exception):
    """Raised when invalid configuration is provided"""
    def __init__(self, message, config_data=None):
        super().__init__(message)
        self.config_data = config_data

class ManagedThread(threading.Thread):
    """Thread class with better management and cleanup."""
    def __init__(self, *args, **kwargs):
        self.result = None
        self._stop_event = threading.Event()
        self._completion_event = threading.Event()
        super().__init__(*args, **kwargs)
        
    def run(self):
        try:
            if self._target:
                self.result = self._target(*self._args, **self._kwargs)
        finally:
            # Signal completion
            self._completion_event.set()
            del self._target, self._args, self._kwargs
            
    def stop(self):
        """Signal the thread to stop."""
        self._stop_event.set()
        
    def stopped(self):
        """Check if stop was requested."""
        return self._stop_event.is_set()
        
    def join(self, timeout=None):
        """Join with better timeout handling."""
        # Wait for completion with timeout
        result = self._completion_event.wait(timeout)
        # Call original join with a short timeout
        super().join(0.1)
        return result        
# -----------------------------------------------------------------------------
# DATA CLASSES
# -----------------------------------------------------------------------------
@dataclass
class DocData:
    """Data structure for document chunks with metadata"""
    section_name: str
    content: str
    file_path: str
    file_size: int
    last_modified: str
    tags: List[str] = field(default_factory=list)
    is_chunked: bool = False
    content_hash: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    document_type: str = "general"
    language: str = "en"  # Default language
    creation_date: str = ""
    chunk_index: int = 0
    total_chunks: int = 1
    confidence_score: float = 1.0  # For OCR text
    tables: List[Dict] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


@dataclass
class PDFDocument:
    """Structure for enhanced PDF data"""
    file_path: str
    full_text: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    structure: Dict[str, Any] = field(default_factory=dict)
    tables: List[Dict[str, Any]] = field(default_factory=list)
    references: List[str] = field(default_factory=list)
    document_type: str = "general" 
    content_hash: str = ""
    chunks: List[Dict[str, Any]] = field(default_factory=list)
    page_count: int = 0
    has_scanned_content: bool = False
    ocr_applied: bool = False
    ocr_confidence: float = 0.0
    language: str = "en"
    images: List[Dict] = field(default_factory=list)
    
    def calculate_hash(self) -> None:
        """Calculate content hash if not already set"""
        if not self.content_hash and self.full_text:
            self.content_hash = hashlib.md5(self.full_text.encode("utf-8")).hexdigest()

    def get_text_stats(self) -> Dict[str, Any]:
        """Get statistics about the text content"""
        return {
            "text_length": len(self.full_text),
            "word_count": len(self.full_text.split()),
            "page_count": self.page_count,
            "tables_count": len(self.tables),
            "references_count": len(self.references),
            "ocr_applied": self.ocr_applied,
            "ocr_confidence": self.ocr_confidence if self.ocr_applied else None,
        }
# Try to import socketio for real-time progress updates
try:
    import socketio
except ImportError:
    # Create a dummy socketio
    class DummySocketIO:
        def emit(self, *args, **kwargs):
            pass
    socketio = DummySocketIO()

# -----------------------------------------------------------------------------
# INITIALIZATION FUNCTIONS
# -----------------------------------------------------------------------------
def initialize_pdf_module():
    """
    Initialize the PDF processing module with proper configuration of all dependencies.
    Sets global flags for dependency availability.
   
    Returns:
        bool: True if initialization was successful
    """
    global JAVA_AVAILABLE, TESSERACT_AVAILABLE, PDF_MODULE_INITIALIZED
   
    if PDF_MODULE_INITIALIZED:
        return True
   
    try:
        # Set up Java path
        java_result = setup_java_path()
        JAVA_AVAILABLE = java_result
       
        # Initialize PDF libraries
        initialize_pdf_libraries()
       
        # Check for Tesseract OCR
        tesseract_result = check_tesseract_availability()
        TESSERACT_AVAILABLE = tesseract_result
        
        # Initialize OCR environment with proper temp directory
        if TESSERACT_AVAILABLE:
            # Ensure OCR temp directory exists
            os.makedirs(TEMP_OCR_DIR, exist_ok=True)
            
            # Set environment variables for Tesseract
            os.environ["TESSDATA_PREFIX"] = TEMP_OCR_DIR
            os.environ["TEMP"] = TEMP_OCR_DIR
            os.environ["TMP"] = TEMP_OCR_DIR
            
            # Initialize OCR environment
            initialize_ocr_environment()
            
            # Patch pytesseract to force our temp directory
            patch_pytesseract_temp_dir()
            
            logger.info(f"OCR temp directory set to: {TEMP_OCR_DIR}")
       
        # Check external dependencies
        dependencies = check_external_dependencies()
       
        # Ensure our global flags are consistent with check results
        JAVA_AVAILABLE = dependencies.get("java", JAVA_AVAILABLE)
        TESSERACT_AVAILABLE = dependencies.get("tesseract", TESSERACT_AVAILABLE)
       
        # Log initialization status
        logger.info(f"PDF module initialized successfully")
        logger.info(f"Java available: {JAVA_AVAILABLE}")
        logger.info(f"Tesseract available: {TESSERACT_AVAILABLE}")
        
        PDF_MODULE_INITIALIZED = True
        return True
       
    except Exception as e:
        logger.error(f"PDF module initialization failed: {e}", exc_info=True)
        PDF_MODULE_INITIALIZED = False
        return False

PDF_EXTRACTOR_CONFIG = {
    "always_use_module": True,  # Set to False to always use built-in code
    "collect_telemetry": True,  # Track fallback usage statistics
    "max_fallback_ratio": 0.5,  # If fallbacks exceed this ratio, log a warning
    "warn_on_error": True       # Log warnings for module errors
}
   
def is_binary_file(file_path: str, check_bytes: int = 8192) -> bool:
    """
    Determine if a file is binary. PDFs are always treated as text since they are processed separately.
    Improved with multiple detection methods and better handling of edge cases.
    
    Args:
        file_path: Path to the file to check
        check_bytes: Number of bytes to check for binary content
        
    Returns:
        True if the file is detected as binary, False otherwise
    """
    # Skip PDFs - they're handled by special processing
    if file_path.lower().endswith(".pdf"):
        return False

    # Check extension against known binary extensions
    ext = Path(file_path).suffix.lower()
    known_bin = {".jpg", ".jpeg", ".png", ".gif", ".zip", ".exe", ".dll", ".so", ".pyc", 
                ".bin", ".dat", ".xlsx", ".docx", ".pptx", ".mp3", ".mp4", ".avi", 
                ".mov", ".wav", ".class", ".o", ".obj", ".jar", ".iso", ".dmg"}
    if ext in known_bin:
        logger.debug(f"Detected binary file by extension: {file_path}")
        return True

    # Check file size - don't try to read extremely large files
    try:
        size = os.path.getsize(file_path)
        if size <= 0:
            return False
        if size > MAX_FILE_SIZE:
            logger.warning(f"File {file_path} exceeds size limit ({size} bytes). Treating as binary.")
            return True
    except OSError as e:
        logger.warning(f"Could not determine size of {file_path}: {e}")
        return False  # Give the file the benefit of the doubt

    # Perform content-based detection
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(min(check_bytes, size))
            
            # Check for known binary signatures
            for sig, _ in BINARY_SIGNATURES.items():
                if chunk.startswith(sig):
                    logger.debug(f"Detected binary file by signature: {file_path}")
                    return True
                    
            # Check for null bytes (common in binary files)
            if b"\x00" in chunk:
                logger.debug(f"Detected binary file by null byte: {file_path}")
                return True
                
            # Check for high ratio of non-printable characters
            printable = sum(1 for b in chunk if (32 <= b < 127) or b in b" \t\r\n")
            printable_ratio = printable / len(chunk) if chunk else 0
            
            if printable_ratio < 0.7:  # If less than 70% is printable, consider binary
                logger.debug(f"Detected binary file by character ratio: {file_path} ({printable_ratio:.2f})")
                return True
                
        # Use magic module for MIME detection if available
        if 'magic' in sys.modules:
            try:
                import magic
                mime_type = magic.from_file(file_path, mime=True)
                
                # List of MIME types that are considered text
                text_mimes = [
                    'text/', 'application/json', 'application/xml', 'application/javascript',
                    'application/x-python', 'application/x-ruby', 'application/x-php'
                ]
                
                # Check if MIME type starts with any of the text patterns
                if not any(mime_type.startswith(tm) for tm in text_mimes):
                    logger.debug(f"Detected binary file by MIME type: {file_path} ({mime_type})")
                    return True
            except ImportError:
                pass  # magic not available, skip this check
            except Exception as e:
                logger.warning(f"Error checking MIME type: {e}")
                
        # If we got here, file appears to be text
        return False
        
    except Exception as e:
        logger.debug(f"Binary file check failed on {file_path}: {e}")
        # Be conservative - if we can't determine, assume it's not binary
        return False

def initialize_dependencies():
    """
    Initialize all dependencies with proper error handling and consistency.
    This resolves the Java configuration issues and ensures all modules
    are properly initialized in the correct order.
    
    Returns:
        Dict: Status of all dependencies
    """
    dependency_status = {
        "python_version": sys.version,
        "dependencies": {
            "structify_available": False,
            "web_scraper_available": False,
            "pdf_extractor_available": False,
            "java_available": False,
            "tesseract_available": False
        }
    }
    
    # First, initialize PDF module
    initialize_pdf_module()
    
    # Update dependency_status with the current state
    dependency_status["dependencies"]["java_available"] = JAVA_AVAILABLE
    dependency_status["dependencies"]["tesseract_available"] = TESSERACT_AVAILABLE
    
    # Try to check if web_scraper is available
    try:
        import web_scraper
        dependency_status["dependencies"]["web_scraper_available"] = True
        logger.info("Successfully imported web_scraper module")
    except ImportError as e:
        logger.warning(f"web_scraper module not available: {e}")
    
pdf_extractor_available = False
pdf_extractor = None  # Define placeholder variable

try:
    import pdf_extractor
    pdf_extractor_available = True
    logger.info("Successfully imported pdf_extractor module")
    
    # Initialize the module
    try:
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status['capabilities']}")
    except Exception as e:
        logger.warning(f"Failed to initialize pdf_extractor: {e}")
except ImportError as e:
    logger.warning(f"pdf_extractor module not available: {e}. Using built-in PDF processing.")
    
    # Create a minimal placeholder class for API compatibility
    class PDFExtractorPlaceholder:
        @staticmethod
        def process_pdf(*args, **kwargs):
            logger.warning("Using built-in PDF processing (pdf_extractor not available)")
            return None
            
        @staticmethod
        def extract_tables_from_pdf(*args, **kwargs):
            logger.warning("Using built-in table extraction (pdf_extractor not available)")
            return []
            
        @staticmethod
        def detect_document_type(*args, **kwargs):
            logger.warning("Using built-in document type detection (pdf_extractor not available)")
            return "general"
            
    pdf_extractor = PDFExtractorPlaceholder()

# In claude.py after importing pdf_extractor
if pdf_extractor_available:
    # Align global flags with pdf_extractor
    try:
        # Import these directly from pdf_extractor
        USE_FITZ = getattr(pdf_extractor, 'USE_FITZ', False)
        USE_PYPDF2 = getattr(pdf_extractor, 'USE_PYPDF2', False)
        USE_TABULA = getattr(pdf_extractor, 'USE_TABULA', False)
        USE_OCR = getattr(pdf_extractor, 'USE_OCR', False)
        USE_PDFPLUMBER = getattr(pdf_extractor, 'USE_PDFPLUMBER', False)
        
        # Log the alignment for debugging
        logger.debug(f"Aligned global flags with pdf_extractor: FITZ={USE_FITZ}, PYPDF2={USE_PYPDF2}, TABULA={USE_TABULA}, OCR={USE_OCR}, PDFPLUMBER={USE_PDFPLUMBER}")
    except Exception as e:
        logger.warning(f"Failed to align global flags with pdf_extractor: {e}")
        
def initialize_pdf_libraries():
    """Initialize all PDF processing libraries with proper error handling and auto-recovery."""
    global USE_FITZ, USE_PYPDF2, USE_TABULA, USE_OCR, USE_PDFPLUMBER
    
    # Try importing each library and set the appropriate flag
    # Store all import errors for diagnostic logging
    import_errors = {}
    
    # PyMuPDF for primary PDF processing
    try:
        import fitz  # PyMuPDF
        USE_FITZ = True
        FITZ_VERSION = fitz.version
        logger.info(f"PyMuPDF (fitz) version {FITZ_VERSION} detected")
    except ImportError as e:
        import_errors["PyMuPDF"] = str(e)
        logger.warning(f"PyMuPDF not available: {e}")
        USE_FITZ = False

    # PyPDF2 as fallback
    try:
        import PyPDF2  # fallback if fitz not available
        USE_PYPDF2 = True
        PYPDF2_VERSION = PyPDF2.__version__
        logger.info(f"PyPDF2 version {PYPDF2_VERSION} detected")
    except ImportError as e:
        import_errors["PyPDF2"] = str(e)
        logger.warning(f"PyPDF2 not available: {e}")
        USE_PYPDF2 = False

    # Tabula for table extraction - requires Java
    if JAVA_AVAILABLE:
        try:
            import tabula
            USE_TABULA = True
            logger.info("Tabula detected for table extraction")
            
            # Ensure JVM is configured properly
            try:
                import jpype
                if not jpype.isJVMStarted():
                    java_home = os.environ.get("JAVA_HOME")
                    if java_home:
                        jvm_path = jpype.getDefaultJVMPath()
                        logger.info(f"Starting JVM with path: {jvm_path}")
                        jpype.startJVM(jvm_path)
                    else:
                        logger.warning("Cannot start JVM: JAVA_HOME not set")
                else:
                    logger.info("JVM already started")
            except ImportError as e:
                import_errors["jpype"] = str(e)
                logger.warning(f"jpype not available: {e}")
        except ImportError as e:
            import_errors["tabula"] = str(e)
            logger.warning(f"Tabula not available: {e}")
            USE_TABULA = False
    else:
        logger.warning("Java not available. Tabula will not be used.")
        USE_TABULA = False

    # OCR capabilities
    try:
        import pytesseract
        from PIL import Image
        # Try to set Windows path if needed
        if os.name == 'nt':
            default_tesseract_paths = [
                r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                # Add more potential paths if needed
            ]
            for tesseract_path in default_tesseract_paths:
                if os.path.exists(tesseract_path):
                    pytesseract.pytesseract.tesseract_cmd = tesseract_path
                    logger.info(f"Set Tesseract path to {tesseract_path}")
                    break
            else:
                # If no path found, try to find it in PATH
                try:
                    import subprocess
                    where_result = subprocess.run(["where", "tesseract"], capture_output=True, text=True, check=False)
                    if where_result.returncode == 0:
                        tesseract_path = where_result.stdout.strip().split('\n')[0]
                        if os.path.exists(tesseract_path):
                            pytesseract.pytesseract.tesseract_cmd = tesseract_path
                            logger.info(f"Found Tesseract in PATH: {tesseract_path}")
                    else:
                        logger.warning("Tesseract not found in PATH")
                except Exception as e:
                    logger.warning(f"Error finding Tesseract in PATH: {e}")
        
        # Test OCR functionality
        test_image = Image.new('RGB', (60, 30), color='white')
        try:
            pytesseract.image_to_string(test_image)
            USE_OCR = True
            logger.info("OCR available with Tesseract and PIL/Pillow")
        except Exception as e:
            import_errors["tesseract_test"] = str(e)
            logger.warning(f"Tesseract installed but not working properly: {e}")
            USE_OCR = False
    except ImportError as e:
        import_errors["OCR"] = str(e)
        logger.warning(f"OCR libraries not available: {e}")
        USE_OCR = False

    # PDFPlumber for additional table extraction
    try:
        import pdfplumber
        USE_PDFPLUMBER = True
        logger.info("pdfplumber detected for table extraction")
    except ImportError as e:
        import_errors["pdfplumber"] = str(e)
        logger.warning(f"pdfplumber not available: {e}")
        USE_PDFPLUMBER = False

    # Check if we have at least one PDF extraction method available
    if not (USE_FITZ or USE_PYPDF2 or USE_PDFPLUMBER):
        logger.error("No PDF extraction libraries available. PDF processing will be limited to binary extraction.")
        
    # Log summary of available libraries
    logger.info(f"PDF libraries initialized: PyMuPDF={USE_FITZ}, PyPDF2={USE_PYPDF2}, Tabula={USE_TABULA}, OCR={USE_OCR}, PDFPlumber={USE_PDFPLUMBER}")
    
    # Return the state of PDF libraries
    return {
        "USE_FITZ": USE_FITZ,
        "USE_PYPDF2": USE_PYPDF2,
        "USE_TABULA": USE_TABULA,
        "USE_OCR": USE_OCR,
        "USE_PDFPLUMBER": USE_PDFPLUMBER,
        "import_errors": import_errors
    }

def initialize_pdf_module():
    """
    Initialize the PDF processing module with proper configuration of all dependencies.
    Sets global flags for dependency availability.
    
    Returns:
        bool: True if initialization was successful
    """
    global JAVA_AVAILABLE, TESSERACT_AVAILABLE, PDF_MODULE_INITIALIZED
    
    if PDF_MODULE_INITIALIZED:
        return True
    
    try:
        # Set up Java path
        java_result = setup_java_path()
        JAVA_AVAILABLE = java_result
        
        # Initialize PDF libraries
        initialize_pdf_libraries()
        
        # Check for Tesseract OCR
        tesseract_result = check_tesseract_availability()
        TESSERACT_AVAILABLE = tesseract_result
        
        # Initialize OCR environment with proper temp directory
        if TESSERACT_AVAILABLE:
            initialize_ocr_environment()
        
        # Check external dependencies
        dependencies = check_external_dependencies()
        
        # Ensure our global flags are consistent with check results
        JAVA_AVAILABLE = dependencies.get("java", JAVA_AVAILABLE)
        TESSERACT_AVAILABLE = dependencies.get("tesseract", TESSERACT_AVAILABLE)
        
        # Log initialization status
        logger.info(f"PDF module initialized successfully")
        logger.info(f"Java available: {JAVA_AVAILABLE}")
        logger.info(f"Tesseract available: {TESSERACT_AVAILABLE}")
        logger.info(f"OCR temp directory: {TEMP_OCR_DIR}")
        
        PDF_MODULE_INITIALIZED = True
        return True
        
    except Exception as e:
        logger.error(f"PDF module initialization failed: {e}", exc_info=True)
        PDF_MODULE_INITIALIZED = False
        return False
    
def check_tesseract_availability():
    """Check if Tesseract OCR is available and functioning."""
    try:
        import pytesseract
        from PIL import Image
        
        # Create a simple test image
        test_image = Image.new('RGB', (60, 30), color='white')
        
        # Try to use tesseract
        _ = pytesseract.image_to_string(test_image)
        
        logger.info("Tesseract OCR is available and functioning")
        return True
    except Exception as e:
        logger.warning(f"Tesseract OCR check failed: {e}")
        return False

def setup_java_path():
    """
    Set up Java path by checking multiple possible locations and properly updating
    both environment variables and global state.
    
    Returns:
        bool: True if Java was found and configured, False otherwise
    """
    java_found = False
    java_locations = [
        # Windows locations
        r"C:\Program Files\Java\jre1.8.0_441\bin",
        r"C:\Program Files\Java\latest\jre-1.8\bin",
        r"C:\Program Files (x86)\Java\jre1.8.0_441\bin",
        r"C:\Program Files (x86)\Java\latest\jre-1.8\bin",
        r"C:\Program Files\Java\jdk1.8.0_291\bin",
        r"C:\Program Files\Java\jdk-11\bin",
        r"C:\Program Files\Java\jdk-17\bin",
        # Unix-like locations
        "/usr/lib/jvm/java-8-openjdk/bin",
        "/usr/lib/jvm/java-11-openjdk/bin",
        "/usr/lib/jvm/java-17-openjdk/bin",
        "/usr/lib/jvm/default-java/bin",
        "/usr/bin",  # For system-wide Java
    ]
    
    # First check if JAVA_HOME is already set correctly
    if "JAVA_HOME" in os.environ and os.path.exists(os.environ["JAVA_HOME"]):
        # Check if java(.exe) exists in the bin directory
        java_exe = "java.exe" if os.name == 'nt' else "java"
        bin_dir = os.path.join(os.environ["JAVA_HOME"], "bin")
        if os.path.exists(os.path.join(bin_dir, java_exe)):
            # JAVA_HOME is valid, ensure bin is in PATH
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            logger.info(f"Using existing JAVA_HOME: {os.environ['JAVA_HOME']}")
            java_found = True
            return True
    
    # JAVA_HOME not set or invalid, check locations
    for location in java_locations:
        if os.path.exists(location):
            java_exe = os.path.join(location, "java.exe" if os.name == 'nt' else "java")
            if os.path.exists(java_exe):
                # Found Java, set environment variables
                parent_dir = os.path.dirname(location) if location.lower().endswith("bin") else location
                os.environ["JAVA_HOME"] = parent_dir
                
                # Add Java bin to PATH if not already there
                if location not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = location + os.pathsep + os.environ.get("PATH", "")
                
                logger.info(f"Java found at: {location}")
                java_found = True
                return True
    
    # If all else fails, try to find java(.exe) in PATH
    if not java_found:
        try:
            if os.name == 'nt':  # Windows
                import subprocess
                result = subprocess.run(["where", "java"], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout:
                    java_path = result.stdout.splitlines()[0]
                    if java_path.endswith("java.exe"):
                        bin_dir = os.path.dirname(java_path)
                        parent_dir = os.path.dirname(bin_dir)
                        os.environ["JAVA_HOME"] = parent_dir
                        logger.info(f"Java found in PATH: {bin_dir}")
                        java_found = True
                        return True
        except Exception as e:
            logger.warning(f"Failed to find Java in PATH: {e}")
    
    # Set global flag to indicate java status
    global JAVA_AVAILABLE
    JAVA_AVAILABLE = java_found
    
    if not java_found:
        logger.warning("Java installation not found. Table extraction with Tabula will not be available.")
    
    return java_found

def check_external_dependencies():
    """
    Check if required external dependencies are installed.
    Uses the same Java detection logic as setup_java_path().
    
    Returns:
        Dict[str, bool]: Status of each dependency
    """
    dependencies_status = {
        "tesseract": False,
        "java": False
    }
    
    # Check for tesseract
    try:
        if os.name == 'nt':  # Windows
            import pytesseract
            tesseract_path = pytesseract.pytesseract.tesseract_cmd if 'pytesseract' in globals() else r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            dependencies_status["tesseract"] = os.path.exists(tesseract_path)
        else:  # Unix-based
            import shutil
            dependencies_status["tesseract"] = shutil.which('tesseract') is not None
    except Exception as e:
        logger.warning(f"Error checking Tesseract availability: {e}")
    
    # Check for Java - using the same logic as setup_java_path()
    try:
        # First check JAVA_HOME environment variable
        if "JAVA_HOME" in os.environ and os.path.exists(os.environ["JAVA_HOME"]):
            java_exe = "java.exe" if os.name == 'nt' else "java"
            bin_dir = os.path.join(os.environ["JAVA_HOME"], "bin")
            if os.path.exists(os.path.join(bin_dir, java_exe)):
                dependencies_status["java"] = True
        
        # If not found via JAVA_HOME, check the executable in PATH
        if not dependencies_status["java"]:
            if os.name == 'nt':  # Windows
                import subprocess
                try:
                    result = subprocess.run(["where", "java"], capture_output=True, text=True, check=False)
                    dependencies_status["java"] = result.returncode == 0 and bool(result.stdout.strip())
                except Exception:
                    pass
            else:  # Unix-like systems
                import shutil
                dependencies_status["java"] = shutil.which('java') is not None
    except Exception as e:
        logger.warning(f"Error checking Java availability: {e}")
    
    # Use global Java flag if set
    if 'JAVA_AVAILABLE' in globals():
        dependencies_status["java"] = JAVA_AVAILABLE
    
    # Print status
    logger.info("External dependencies status:")
    for dep, status in dependencies_status.items():
        logger.info(f"  - {dep}: {'Available' if status else 'Not found'}")
    
    return dependencies_status

# -----------------------------------------------------------------------------
# OCR AND SCANNED DOCUMENT PROCESSING
# -----------------------------------------------------------------------------
# Import the pdf_output_enhancer module
try:
    import pdf_output_enhancer
    pdf_enhancer_available = True
    logger.info("Successfully imported pdf_output_enhancer module")
except ImportError as e:
    pdf_enhancer_available = False
    logger.warning(f"pdf_output_enhancer module not available: {e}. Enhanced output formatting will not be used.")
    
    # Try to load the module from local file
    try:
        import importlib.util
        import sys
        
        # Try to find pdf_output_enhancer.py in the same directory as this file
        module_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_output_enhancer.py")
        if os.path.exists(module_path):
            spec = importlib.util.spec_from_file_location("pdf_output_enhancer", module_path)
            pdf_output_enhancer = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(pdf_output_enhancer)
            sys.modules["pdf_output_enhancer"] = pdf_output_enhancer
            pdf_enhancer_available = True
            logger.info("Successfully loaded pdf_output_enhancer from local file")
    except Exception as local_err:
        logger.warning(f"Failed to load pdf_output_enhancer from local file: {local_err}")

def apply_enhanced_output_formatting():
    """
    Apply enhanced output formatting to the claude.py codebase.
    This function will patch the necessary functions to use pdf_output_enhancer.
    
    Usage:
        from claude import apply_enhanced_output_formatting
        apply_enhanced_output_formatting()
    
    Returns:
        bool: True if successfully applied, False otherwise
    """
    # Check if pdf_output_enhancer is available
    try:
        import pdf_output_enhancer
        pdf_enhancer_available = True
    except ImportError:
        pdf_enhancer_available = False
        # Try to load the module from local file
        try:
            import importlib.util
            
            # Try to find pdf_output_enhancer.py in the same directory as this file
            caller_frame = inspect.currentframe().f_back
            caller_filename = inspect.getframeinfo(caller_frame).filename
            module_dir = os.path.dirname(os.path.abspath(caller_filename))
            module_path = os.path.join(module_dir, "pdf_output_enhancer.py")
            
            if os.path.exists(module_path):
                spec = importlib.util.spec_from_file_location("pdf_output_enhancer", module_path)
                pdf_output_enhancer = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(pdf_output_enhancer)
                sys.modules["pdf_output_enhancer"] = pdf_output_enhancer
                pdf_enhancer_available = True
                logger.info("Successfully loaded pdf_output_enhancer from local file")
            else:
                logger.warning(f"pdf_output_enhancer.py not found in {module_dir}")
                return False
        except Exception as e:
            logger.error(f"Failed to load pdf_output_enhancer: {e}")
            return False
    
    # Get module globals
    current_module = sys.modules[__name__]
    module_globals = current_module.__dict__
    
    # Apply the patches using pdf_output_enhancer
    try:
        # Initialize the enhanced output format
        success = pdf_output_enhancer.init_improved_output_format(module_globals)
        
        if success:
            logger.info("Successfully applied enhanced output formatting")
            return True
        else:
            logger.warning("Failed to apply enhanced output formatting")
            return False
    except Exception as e:
        logger.error(f"Error applying enhanced output formatting: {e}")
        return False


                    
def is_searchable_pdf(file_path: str, text_threshold: int = 100) -> bool:
    """
    Check if a PDF already contains searchable text to avoid unnecessary OCR.
    
    Args:
        file_path: Path to the PDF file
        text_threshold: Minimum number of characters per page to consider searchable
        
    Returns:
        True if the PDF contains searchable text, False otherwise
    """
    # First see if PyMuPDF is available
    if USE_FITZ:
        try:
            import fitz
            searchable_pages = 0
            total_pages = 0
            
            with fitz.open(file_path) as doc:
                total_pages = len(doc)
                
                # Check first 5 pages (or all if fewer)
                for page_idx in range(min(5, total_pages)):
                    page = doc[page_idx]
                    text = page.get_text()
                    
                    # If page has substantial text, consider it searchable
                    if len(text.strip()) >= text_threshold:
                        searchable_pages += 1
                
                # If most checked pages have text, consider the PDF searchable
                if searchable_pages > 0 and searchable_pages / min(5, total_pages) >= 0.5:
                    logger.info(f"PDF {file_path} appears to be searchable ({searchable_pages}/{min(5, total_pages)} pages with text)")
                    return True
                    
                logger.info(f"PDF {file_path} appears to be non-searchable (only {searchable_pages}/{min(5, total_pages)} pages with text)")
                return False
                
        except Exception as e:
            logger.warning(f"Error checking if PDF is searchable using PyMuPDF: {e}")
            
    # Fall back to PyPDF2 if PyMuPDF is not available
    if USE_PYPDF2:
        try:
            import PyPDF2
            searchable_pages = 0
            
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                total_pages = len(reader.pages)
                
                # Check first 5 pages (or all if fewer)
                for page_idx in range(min(5, total_pages)):
                    text = reader.pages[page_idx].extract_text() or ""
                    
                    # If page has substantial text, consider it searchable
                    if len(text.strip()) >= text_threshold:
                        searchable_pages += 1
                
                # If most checked pages have text, consider the PDF searchable
                if searchable_pages > 0 and searchable_pages / min(5, total_pages) >= 0.5:
                    logger.info(f"PDF {file_path} appears to be searchable ({searchable_pages}/{min(5, total_pages)} pages with text)")
                    return True
                    
                logger.info(f"PDF {file_path} appears to be non-searchable (only {searchable_pages}/{min(5, total_pages)} pages with text)")
                return False
                
        except Exception as e:
            logger.warning(f"Error checking if PDF is searchable using PyPDF2: {e}")
    
    # If we couldn't determine, assume non-searchable to be safe
    logger.warning(f"Could not determine if PDF {file_path} is searchable. Assuming non-searchable.")
    return False

def extract_references(text: str) -> List[str]:
    """
    Extract academic references and citations from document text.
    
    Args:
        text: Full document text
        
    Returns:
        List of extracted references
    """
    references = []
    
    # Common patterns for reference sections
    ref_section_patterns = [
        re.compile(r'\b(references|bibliography|works cited|literature cited)\b', re.IGNORECASE),
    ]
    
    # Split text into lines
    lines = text.split('\n')
    
    # Find the references section
    in_references = False
    ref_start_idx = -1
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        # Check if we're at the references section
        if not in_references:
            for pattern in ref_section_patterns:
                if pattern.search(line):
                    in_references = True
                    ref_start_idx = i
                    break
        else:
            # Check if we've reached the end (another main section)
            if re.match(r'^([0-9]|appendix|table|figure|acknowledgements).*$', line, re.IGNORECASE):
                # Extract the references section
                ref_section = lines[ref_start_idx:i]
                references = process_references(ref_section)
                break
    
    # If we're still in the references section at the end of the document
    if in_references and ref_start_idx >= 0 and not references:
        ref_section = lines[ref_start_idx:]
        references = process_references(ref_section)
    
    return references

def process_references(ref_lines: List[str]) -> List[str]:
    """
    Process a list of lines from the references section to extract individual references.
    
    Args:
        ref_lines: Lines from the references section
        
    Returns:
        List of processed references
    """
    references = []
    current_ref = []
    
    # Skip the header line
    for line in ref_lines[1:]:
        line = line.strip()
        if not line:
            continue
            
        # Check if line starts a new reference
        starts_new_ref = bool(re.match(r'^\[\d+\]|\(\d+\)|^\d+\.|\[\w+\d*\]', line))
        
        # Also check for author pattern at start of line (lastname, initial.)
        author_pattern = bool(re.match(r'^[A-Z][a-z]+,\s+[A-Z]\.', line))
        
        if starts_new_ref or author_pattern:
            # Save previous reference if it exists
            if current_ref:
                references.append(" ".join(current_ref))
                current_ref = []
            
            current_ref.append(line)
        elif current_ref:
            # Continue previous reference
            current_ref.append(line)
    
    # Add the last reference
    if current_ref:
        references.append(" ".join(current_ref))
    
    return references

def detect_document_type(file_path: str, text: str = None) -> str:
    """
    Detect the type of PDF document to apply appropriate processing.
    
    Args:
        file_path: Path to the PDF file
        text: Document text if already extracted
        
    Returns:
        Document type (academic_paper, report, slides, scan, book, etc.)
    """
    if USE_FITZ:
        try:
            # Extract text if not provided
            if text is None:
                with fitz.open(file_path) as doc:
                    text = ""
                    for page in doc:
                        text += page.get_text()
            
            # Features to detect
            features = {
                "has_abstract": bool(re.search(r'\babstract\b', text[:2000], re.IGNORECASE)),
                "has_references": bool(re.search(r'\b(references|bibliography|works cited)\b', text, re.IGNORECASE)),
                "has_keywords": bool(re.search(r'\bkeywords\b', text[:2000], re.IGNORECASE)),
                "has_citations": len(re.findall(r'\(\w+\s+et\s+al\.,?\s+\d{4}\)|\[\d+\]', text)) > 2,
                "has_tables": bool(re.search(r'\btable\s+\d+\b', text, re.IGNORECASE)),
                "has_figures": bool(re.search(r'\bfigure\s+\d+\b', text, re.IGNORECASE)),
                "has_chapters": bool(re.search(r'\bchapter\s+\d+\b', text, re.IGNORECASE)),
                "has_toc": bool(re.search(r'\btable\s+of\s+contents\b', text[:5000], re.IGNORECASE)),
                "page_count": 0
            }
            
            # Get page count and check for text density
            with fitz.open(file_path) as doc:
                features["page_count"] = len(doc)
                
                # Check for very little text (possible scan)
                text_len = 0
                for page in doc:
                    page_text = page.get_text().strip()
                    text_len += len(page_text)
                
                features["text_density"] = text_len / features["page_count"] if features["page_count"] > 0 else 0
                features["low_text_ratio"] = features["text_density"] < 500  # Less than 500 chars per page
            
            # Determine document type based on features
            if features["low_text_ratio"]:
                return "scan"
            elif features["has_abstract"] and features["has_references"] and features["has_citations"]:
                return "academic_paper"
            elif features["has_chapters"] or features["has_toc"] or features["page_count"] > 50:
                return "book"
            elif features["has_tables"] and features["page_count"] > 15 and bool(re.search(r'executive\s+summary', text[:5000], re.IGNORECASE)):
                return "report"
            elif features["page_count"] < 30 and bool(re.search(r'(thesis|dissertation)', text[:5000], re.IGNORECASE)):
                return "thesis"
            elif features["page_count"] < 5 and len(re.findall(r'^\s*[\•\-\*]', text, re.MULTILINE)) > 10:
                return "slides"
            else:
                return "general"
        except Exception as e:
            logger.error(f"Error detecting document type: {e}")
            return "general"
    else:
        # Without PyMuPDF, do a simplified text-based detection
        if text is None:
            text = extract_basic_text_from_pdf(file_path)
        
        if len(text.strip()) < 500:
            return "scan"  # Very little text, might be a scan
        elif bool(re.search(r'\babstract\b', text[:2000], re.IGNORECASE)):
            return "academic_paper"
        elif bool(re.search(r'\bchapter\s+\d+\b', text, re.IGNORECASE)):
            return "book"
        else:
            return "general"

# -----------------------------------------------------------------------------
# Process specific subsets of files
# -----------------------------------------------------------------------------
def process_files_by_pattern(
    directory: str,
    pattern: str, 
    output_file: str = None, 
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    executor_type: str = "thread"
) -> Dict[str, Any]:
    """
    Process all files in a directory matching a specific pattern.
    
    Args:
        directory: Directory to search for files
        pattern: Glob pattern to match files (e.g., "*.pdf", "data/*.txt")
        output_file: Path to output JSON file (default: processed_<timestamp>.json)
        max_chunk_size: Maximum size of text chunks
        executor_type: Type of executor to use
        
    Returns:
        Dictionary with processing statistics
    """
    import fnmatch
    import glob
    
    # Create default output filename if not provided
    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(directory, f"processed_{timestamp}.json")
    
    # Find all matching files
    pattern_path = os.path.join(directory, pattern)
    matching_files = glob.glob(pattern_path, recursive=True)
    
    if not matching_files:
        logger.warning(f"No files found matching pattern: {pattern}")
        return {"stats": {"total_files": 0, "error": "No files found matching pattern"}}
    
    logger.info(f"Found {len(matching_files)} files matching pattern: {pattern}")
    
    # Create a file filter function
    def file_filter(filepath):
        return fnmatch.fnmatch(os.path.basename(filepath), os.path.basename(pattern))
    
    # Process the matching files
    return process_all_files(
        root_directory=directory,
        output_file=output_file,
        max_chunk_size=max_chunk_size,
        executor_type=executor_type,
        file_filter=file_filter
    )

def batch_process_pdfs(
    directory: str,
    output_dir: str = None,
    recursive: bool = True,
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    extract_tables: bool = True,
    use_ocr: bool = True,
    max_workers: int = None
) -> Dict[str, Any]:
    """
    Process all PDF files in a directory with individual outputs for each file.
    
    Args:
        directory: Directory containing PDF files
        output_dir: Directory for output JSON files (default: same as input)
        recursive: Whether to search subdirectories
        max_chunk_size: Maximum size of text chunks
        extract_tables: Whether to extract tables
        use_ocr: Whether to use OCR for scanned content
        max_workers: Maximum number of worker threads
        
    Returns:
        Dictionary with processing statistics
    """
    if not os.path.isdir(directory):
        raise ValueError(f"Directory not found: {directory}")
    
    # Use input directory as output directory if not specified
    if not output_dir:
        output_dir = directory
    else:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
    
    # Find all PDF files
    pdf_files = []
    if recursive:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.lower().endswith('.pdf'):
                    pdf_files.append(os.path.join(root, file))
    else:
        for file in os.listdir(directory):
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(directory, file))
    
    if not pdf_files:
        logger.warning(f"No PDF files found in {directory}")
        return {"stats": {"total_files": 0, "error": "No PDF files found"}}
    
    logger.info(f"Found {len(pdf_files)} PDF files to process")
    
    # Set up metrics
    stats = {
        "total_files": len(pdf_files),
        "processed_files": 0,
        "error_files": 0,
        "total_chunks": 0,
        "tables_extracted": 0,
        "references_extracted": 0,
        "start_time": time.time()
    }
    
    # Process files in parallel
    if max_workers is None:
        import multiprocessing
        max_workers = min(multiprocessing.cpu_count() * 2, 8)  # Reasonable default
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Create future tasks
        futures = {}
        for pdf_file in pdf_files:
            output_file = os.path.join(output_dir, os.path.basename(pdf_file).replace('.pdf', '_processed.json'))
            
            future = executor.submit(
                process_pdf,
                pdf_file,
                output_file,
                max_chunk_size,
                extract_tables,
                use_ocr,
                True  # Return data for statistics
            )
            futures[future] = pdf_file
        
        # Process results as they complete
        for future in as_completed(futures):
            pdf_file = futures[future]
            try:
                result = future.result()
                
                if result and 'error' not in result:
                    stats["processed_files"] += 1
                    
                    # Extract additional statistics from result
                    metadata = result.get("metadata", {})
                    stats["total_chunks"] += len(result.get("docs_data", []))
                    stats["tables_extracted"] += metadata.get("tables_count", 0)
                    stats["references_extracted"] += metadata.get("references_count", 0)
                    
                    logger.info(f"Processed: {pdf_file}")
                else:
                    error_msg = result.get("error", "Unknown error") if result else "Failed to process"
                    stats["error_files"] += 1
                    logger.error(f"Error processing {pdf_file}: {error_msg}")
            
            except Exception as e:
                stats["error_files"] += 1
                logger.error(f"Error processing {pdf_file}: {e}")
    
    # Calculate duration
    stats["duration_seconds"] = time.time() - stats.pop("start_time")
    
    # Calculate success rate
    if stats["total_files"] > 0:
        stats["success_rate"] = (stats["processed_files"] / stats["total_files"]) * 100
    
    logger.info(f"Batch processing complete: {stats['processed_files']}/{stats['total_files']} files processed successfully")
    
    return {"stats": stats}
# -----------------------------------------------------------------------------
# JSON AND FILE HANDLING FUNCTIONS
# -----------------------------------------------------------------------------
def write_json_safely(data: Dict[str, Any], output_path: str, chunk_size: int = 100000) -> bool:
    """
    Write large JSON content safely to avoid memory issues.
    Properly handles large text fields and provides multiple fallback methods.
    
    Args:
        data: The data to write as JSON
        output_path: Path to the output JSON file
        chunk_size: Size of chunks for large string values
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Create a temporary file
        temp_file = f"{output_path}.tmp"
        
        # First attempt: Standard JSON dump with large strings broken into chunks
        try:
            # Create a deep copy with chunked large strings to avoid memory issues
            def chunk_large_strings(obj):
                if isinstance(obj, dict):
                    return {k: chunk_large_strings(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [chunk_large_strings(item) for item in obj]
                elif isinstance(obj, str) and len(obj) > chunk_size:
                    # For large strings, break them into chunks for better memory management
                    chunks = [obj[i:i+chunk_size] for i in range(0, len(obj), chunk_size)]
                    # Join chunks with empty string to avoid modifying content
                    return "".join(chunks)
                else:
                    return obj
            
            # Process data to handle large strings
            processed_data = chunk_large_strings(data)
            
            # Write to temporary file first
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(processed_data, f, ensure_ascii=False, indent=2)
            
            # Rename to final output file
            if os.path.exists(temp_file):
                # Remove destination file if it exists
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(temp_file, output_path)
                return True
        except Exception as e:
            logging.warning(f"First attempt to write JSON failed: {e}")
            
            # Second attempt: Use iterative file writing
            try:
                with open(temp_file, 'w', encoding='utf-8') as f:
                    # Start the JSON object
                    f.write("{\n")
                    
                    # Write each key-value pair separately
                    for i, (key, value) in enumerate(data.items()):
                        f.write(f'  "{key}": ')
                        json.dump(value, f, ensure_ascii=False)
                        if i < len(data) - 1:
                            f.write(",\n")
                        else:
                            f.write("\n")
                    
                    # Close the JSON object
                    f.write("}\n")
                
                # Rename to final output file
                if os.path.exists(temp_file):
                    # Remove destination file if it exists
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    os.rename(temp_file, output_path)
                    return True
            except Exception as e2:
                logging.warning(f"Second attempt to write JSON failed: {e2}")
                
                # Third attempt: Simplify data structure
                try:
                    simplified_data = {}
                    for lib, lib_data in data.items():
                        simplified_data[lib] = {
                            "metadata": lib_data.get("metadata", {}),
                            "doc_count": len(lib_data.get("docs_data", [])),
                            "summary": f"Processed {len(lib_data.get('docs_data', []))} documents"
                        }
                    
                    with open(temp_file, 'w', encoding='utf-8') as f:
                        json.dump(simplified_data, f, ensure_ascii=False, indent=2)
                    
                    # Rename to final output file
                    if os.path.exists(temp_file):
                        # Rename with a different extension to indicate simplified content
                        simplified_path = f"{output_path}.simplified.json"
                        os.rename(temp_file, simplified_path)
                        logging.warning(f"Wrote simplified JSON to {simplified_path}")
                        return True
                except Exception as e3:
                    logging.error(f"All attempts to write JSON failed: {e3}")
                    return False
    except Exception as e:
        logging.error(f"Error in write_json_safely: {e}")
        return False

def verify_pdf_content_integrity(file_path: str, json_output_path: str) -> Dict[str, Any]:
    """
    Verify that PDF content was properly preserved in the JSON output.
    This function can be used to diagnose issues with content extraction and preservation.
    
    Args:
        file_path: Path to the original PDF file
        json_output_path: Path to the generated JSON output
        
    Returns:
        Dictionary with verification results
    """
    results = {
        "file_path": file_path,
        "json_path": json_output_path,
        "passed": False,
        "errors": [],
        "messages": []
    }
    
    try:
        # 1. Extract raw text from PDF using basic method
        raw_text = extract_basic_text_from_pdf(file_path)
        raw_text_length = len(raw_text)
        results["raw_text_length"] = raw_text_length
        results["messages"].append(f"Raw text extraction: {raw_text_length} characters")
        
        if raw_text_length < 100:
            results["errors"].append("Raw text extraction yielded very little content")
        
        # 2. Load the JSON output
        if not os.path.exists(json_output_path):
            results["errors"].append(f"JSON output file not found: {json_output_path}")
            return results
            
        with open(json_output_path, "r", encoding="utf-8") as f:
            try:
                json_data = json.load(f)
            except json.JSONDecodeError as e:
                results["errors"].append(f"Failed to parse JSON: {str(e)}")
                return results
        
        # 3. Check if docs_data exists and has content
        if "docs_data" not in json_data:
            results["errors"].append("No 'docs_data' found in JSON")
            return results
            
        docs_data = json_data.get("docs_data", [])
        if not docs_data:
            results["errors"].append("Empty 'docs_data' in JSON")
            return results
            
        results["chunk_count"] = len(docs_data)
        results["messages"].append(f"Found {len(docs_data)} chunks in JSON")
        
        # 4. Check total content length across all chunks
        total_content_length = sum(len(doc.get("content", "")) for doc in docs_data)
        results["total_json_content_length"] = total_content_length
        results["messages"].append(f"Total JSON content: {total_content_length} characters")
        
        # 5. Find the chunk with the most content
        max_chunk = max(docs_data, key=lambda x: len(x.get("content", "")), default={})
        max_chunk_length = len(max_chunk.get("content", ""))
        results["max_chunk_length"] = max_chunk_length
        results["messages"].append(f"Largest chunk: {max_chunk_length} characters")
        
        # 6. Check if full_text is included
        has_full_text = any(
            doc.get("metadata", {}).get("chunk_type") in ["full_document", "full_content", "full_content_backup"]
            for doc in docs_data
        )
        results["has_full_text_chunk"] = has_full_text
        
        if has_full_text:
            results["messages"].append("Found full text chunk ✓")
        else:
            results["errors"].append("No full text chunk found in the output")
        
        # 7. Check content ratio
        if raw_text_length > 0:
            ratio = total_content_length / raw_text_length
            results["content_ratio"] = ratio
            results["messages"].append(f"Content ratio (JSON/raw): {ratio:.2f}")
            
            if ratio < 0.9:
                results["errors"].append(f"Content ratio too low: {ratio:.2f}")
            
        # 8. Check character overlap between raw text and JSON content
        # Sample the beginning, middle and end of both texts
        def sample_text(text, size=100):
            if len(text) <= size * 3:
                return text
            return text[:size] + text[len(text)//2-size//2:len(text)//2+size//2] + text[-size:]
            
        raw_sample = sample_text(raw_text)
        json_sample = sample_text(max_chunk.get("content", ""))
        
        # Count matching characters
        overlap_count = sum(1 for c1, c2 in zip(raw_sample, json_sample) if c1 == c2)
        
        if min(len(raw_sample), len(json_sample)) > 0:
            overlap_ratio = overlap_count / min(len(raw_sample), len(json_sample))
            results["overlap_ratio"] = overlap_ratio
            results["messages"].append(f"Character overlap ratio: {overlap_ratio:.2f}")
            
            if overlap_ratio < 0.7:
                results["errors"].append(f"Low character overlap: {overlap_ratio:.2f}")
        
        # Final verdict
        results["passed"] = (
            has_full_text and 
            (raw_text_length > 0 and total_content_length / raw_text_length >= 0.9) and
            not results["errors"]
        )
        
    except Exception as e:
        results["errors"].append(f"Verification error: {str(e)}")
        
    return results

def write_final_output(all_data, output_file, stats_only=False):
    """
    Write the final JSON output with improved error handling.
    
    Args:
        all_data: The data to write as JSON
        output_file: Path to the output JSON file
        stats_only: Whether to only include statistics
        
    Returns:
        bool: True if successful, False otherwise
    """
    if stats_only:
        return True
        
    try:
        # Make sure output directory exists
        outdir = os.path.dirname(output_file)
        if outdir and not os.path.exists(outdir):
            os.makedirs(outdir, exist_ok=True)
            
        # Write JSON output using the safe writer
        success = write_json_safely(all_data, output_file)
        
        if success:
            logger.info(f"Created JSON output at {output_file}")
            return True
        else:
            logger.error(f"Failed to create JSON output at {output_file}")
            return False
            
    except Exception as e:
        logger.error(f"Error writing final output: {e}", exc_info=True)
        return False

def direct_pdf_to_json(pdf_path: str, output_file: str) -> bool:
    """
    Direct PDF to JSON conversion with minimal processing.
    This is a last resort function for when the enhanced processing fails.
    
    Args:
        pdf_path: Path to the PDF file
        output_file: Where to save the JSON output
        
    Returns:
        bool: True if successful
    """
    try:
        # Extract text directly
        text = extract_basic_text_from_pdf(pdf_path)
        
        # Get simple file stats
        file_stats = os.stat(pdf_path)
        filename = os.path.basename(pdf_path)
        
        # Create a minimal JSON structure
        data = {
            "metadata": {
                "file_path": pdf_path,
                "file_name": filename,
                "file_size": file_stats.st_size,
                "last_modified": datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "extraction_method": "direct_fallback",
                "processing_timestamp": datetime.now().isoformat()
            },
            "docs_data": [
                {
                    "section_name": filename,
                    "content": text,
                    "file_path": pdf_path,
                    "file_size": file_stats.st_size,
                    "last_modified": datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "tags": ["pdf", "direct_extraction"],
                    "is_chunked": False,
                    "metadata": {
                        "chunk_type": "full_content",
                        "extraction_method": "direct_fallback"
                    }
                }
            ]
        }
        
        # Write directly to file
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"Direct PDF to JSON conversion saved to: {output_file}")
        return True
        
    except Exception as e:
        logger.error(f"Direct PDF to JSON conversion failed: {e}")
        return False

def fix_pdf_content_extraction():
    """
    Apply all PDF content extraction fixes and test them.
    This function can be called to diagnose and apply fixes.
    """
    logger.info("Applying PDF content extraction fixes...")
    
    # 1. Detect if fixed methods have been applied
    fixes_needed = not hasattr(CustomJSONEncoder, 'iterencode')
    
    if fixes_needed:
        logger.info("Fixes are needed. Applying them now.")
        
        # Monitor memory usage
        try:
            import psutil
            process = psutil.Process()
            mem_before = process.memory_info().rss / (1024 * 1024)
            logger.info(f"Memory usage before fixes: {mem_before:.2f} MB")
        except ImportError:
            logger.info("psutil not available, memory monitoring disabled")
        
        # Apply fixes
        # 1. Fix the CustomJSONEncoder - added iterencode method
        # 2. Fix the chunk_document_intelligently function - ensures full content preservation
        # 3. Fix the process_pdf function - adds full content as first chunk
        # 4. Fix the extract_text_from_pdf function - adds multiple fallbacks
        # 5. Add the write_json_safely function - improved serialization
        # 6. Add the direct_pdf_to_json function - last resort backup
        
        logger.info("All fixes applied successfully")
        
        # Report memory usage after fixes
        try:
            if 'psutil' in sys.modules:
                mem_after = process.memory_info().rss / (1024 * 1024)
                logger.info(f"Memory usage after fixes: {mem_after:.2f} MB")
        except Exception:
            pass
    else:
        logger.info("Fixes have already been applied.")
    
    # Test the fixes on a sample PDF if available
    test_pdf_path = os.environ.get("TEST_PDF_PATH", "")
    if test_pdf_path and os.path.exists(test_pdf_path):
        logger.info(f"Testing fixes on sample PDF: {test_pdf_path}")
        
        # Generate test output path
        test_output = os.path.join(
            os.path.dirname(test_pdf_path),
            f"{os.path.splitext(os.path.basename(test_pdf_path))[0]}_test_fixed.json"
        )
        
        # Process the PDF with fixed method
        result = process_pdf(test_pdf_path, test_output, return_data=True)
        
        if result and "error" not in result:
            # Verify content integrity
            verification = verify_pdf_content_integrity(test_pdf_path, test_output)
            
            if verification["passed"]:
                logger.info("✅ PDF content extraction fixes verified successfully!")
                for msg in verification["messages"]:
                    logger.info(f"  ✓ {msg}")
            else:
                logger.warning("⚠️ PDF content verification found issues:")
                for err in verification["errors"]:
                    logger.warning(f"  ✗ {err}")
                for msg in verification["messages"]:
                    logger.info(f"  • {msg}")
                
                # Try direct fallback as last resort
                logger.info("Attempting direct fallback extraction...")
                direct_output = os.path.join(
                    os.path.dirname(test_pdf_path),
                    f"{os.path.splitext(os.path.basename(test_pdf_path))[0]}_direct_fallback.json"
                )
                
                direct_result = direct_pdf_to_json(test_pdf_path, direct_output)
                if direct_result:
                    logger.info(f"Direct fallback generated: {direct_output}")
                    direct_verification = verify_pdf_content_integrity(test_pdf_path, direct_output)
                    if direct_verification["passed"]:
                        logger.info("✅ Direct fallback extraction successful!")
                    else:
                        logger.warning("⚠️ Even direct extraction had issues. PDF may be problematic.")
        else:
            error_msg = result.get("error", "Unknown error") if result else "Processing failed"
            logger.error(f"❌ PDF processing failed: {error_msg}")
            
            # Try direct fallback
            logger.info("Attempting direct fallback after failure...")
            direct_output = os.path.join(
                os.path.dirname(test_pdf_path),
                f"{os.path.splitext(os.path.basename(test_pdf_path))[0]}_emergency_fallback.json"
            )
            
            direct_result = direct_pdf_to_json(test_pdf_path, direct_output)
            if direct_result:
                logger.info(f"Emergency fallback generated: {direct_output}")
    else:
        logger.info("No test PDF path set. Set TEST_PDF_PATH environment variable to test the fixes.")
        
    return True

def simple_pdf_to_json(pdf_path: str, output_file: str = None) -> Dict[str, Any]:
    """
    Process a PDF file using the simplest possible approach.
    This is the ultimate fallback for when all other methods fail.
    
    Args:
        pdf_path: Path to the PDF file
        output_file: Optional output file path
        
    Returns:
        Dictionary with processing results
    """
    start_time = time.time()
    logger.info(f"Starting simple PDF processing for {pdf_path}")
    
    try:
        # Generate default output file if not provided
        if not output_file:
            output_file = f"{os.path.splitext(pdf_path)[0]}_simple.json"
        
        # Step 1: Extract text using PyPDF2 (most reliable basic method)
        text = ""
        try:
            if USE_PYPDF2:
                with open(pdf_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    pages = []
                    for i, page in enumerate(reader.pages):
                        try:
                            page_text = page.extract_text() or ""
                            pages.append(page_text)
                        except Exception as e:
                            logger.warning(f"Error extracting page {i}: {e}")
                            pages.append("")
                    text = "\n\n".join(pages)
        except Exception as e:
            logger.error(f"PyPDF2 extraction failed: {e}")
            # Try PyMuPDF as backup
            if USE_FITZ:
                try:
                    import fitz
                    with fitz.open(pdf_path) as doc:
                        pages = []
                        for page in doc:
                            pages.append(page.get_text())
                        text = "\n\n".join(pages)
                except Exception as e2:
                    logger.error(f"PyMuPDF extraction also failed: {e2}")
            
        # Step 2: If text extraction completely failed, use a placeholder
        if not text:
            text = f"[PDF TEXT EXTRACTION FAILED - Content unavailable for {pdf_path}]"
            logger.error(f"All text extraction methods failed for {pdf_path}")
        
        # Step 3: Create basic metadata
        file_stats = os.stat(pdf_path)
        filename = os.path.basename(pdf_path)
        
        # Step 4: Create minimal result object
        result = {
            "metadata": {
                "file_path": pdf_path,
                "file_name": filename,
                "file_size": file_stats.st_size,
                "last_modified": datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "extraction_method": "simple_fallback",
                "processing_timestamp": datetime.now().isoformat(),
                "processing_time_seconds": time.time() - start_time
            },
            "docs_data": [
                {
                    "section_name": filename,
                    "content": text,
                    "file_path": pdf_path,
                    "file_size": file_stats.st_size,
                    "last_modified": datetime.fromtimestamp(file_stats.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "tags": ["pdf", "simple_extraction"],
                    "is_chunked": False,
                    "metadata": {
                        "chunk_type": "full_content",
                        "extraction_method": "simple_fallback"
                    }
                }
            ]
        }
        
        # Step 5: Write output directly
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(f"Simple PDF processing complete. Output saved to: {output_file}")
        except Exception as e:
            logger.error(f"Error writing JSON output: {e}")
            # Try with a safer filename if the original fails
            try:
                safe_output = os.path.join(
                    os.path.dirname(output_file), 
                    f"simple_output_{int(time.time())}.json"
                )
                with open(safe_output, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                logger.info(f"Output saved to alternative location: {safe_output}")
                result["output_file"] = safe_output
            except Exception as e2:
                logger.error(f"Failed to write to alternative location: {e2}")
        
        result["output_file"] = output_file
        return result
        
    except Exception as e:
        logger.error(f"Simple PDF processing failed with error: {e}", exc_info=True)
        return {
            "error": str(e),
            "file_path": pdf_path,
            "traceback": traceback.format_exc()
        }
        
# -----------------------------------------------------------------------------
# PDF TEXT EXTRACTION FUNCTIONS (CONTINUED)
# -----------------------------------------------------------------------------
def extract_text_from_pdf(file_path: str, page_range: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Extract text from PDF with structure information using pdf_extractor if available.
    Falls back to built-in methods if pdf_extractor is not available.
    """
    # Use pdf_extractor if available
    if pdf_extractor_available:
        try:
            return pdf_extractor.extract_text_from_pdf(file_path, page_range)
        except Exception as e:
            logger.warning(f"pdf_extractor.extract_text_from_pdf failed: {e}. Falling back to built-in method.")
    with TimingContext(f"PDF extraction for {os.path.basename(file_path)}"):
        # Check file size before processing
        try:
            file_size = os.path.getsize(file_path)
            if file_size > MAX_FILE_SIZE:
                logger.warning(f"PDF file {file_path} exceeds size limit ({file_size} bytes). Consider using page_range.")
        except OSError:
            logger.warning(f"Could not determine size of {file_path}")
            
        # Initialize result structure
        result = {
            "full_text": "",
            "text_content": [],
            "structure": {
                "title": None,
                "headings": [],
                "pages": []
            },
            "metadata": {},
            "extraction_time": 0,
            "page_count": 0,
            "has_scanned_content": False,
            "extraction_method": "unknown",
            "extraction_errors": []
        }
        
        extraction_attempts = 0
        
        # Try PyMuPDF first (most reliable)
        if USE_FITZ:
            extraction_attempts += 1
            try:
                import fitz
                with fitz.open(file_path) as doc:
                    # Extract document metadata
                    result["metadata"] = {
                        "title": doc.metadata.get("title", ""),
                        "author": doc.metadata.get("author", ""),
                        "subject": doc.metadata.get("subject", ""),
                        "keywords": doc.metadata.get("keywords", ""),
                        "creator": doc.metadata.get("creator", ""),
                        "producer": doc.metadata.get("producer", ""),
                        "creation_date": doc.metadata.get("creationDate", ""),
                        "modification_date": doc.metadata.get("modDate", ""),
                        "page_count": len(doc)
                    }
                    
                    result["page_count"] = len(doc)
                    result["extraction_method"] = "pymupdf"
                    
                    # Apply page range if specified
                    if page_range:
                        start_page, end_page = page_range
                        page_range_to_process = range(
                            max(0, start_page),
                            min(len(doc), end_page + 1)
                        )
                    else:
                        page_range_to_process = range(len(doc))
                    
                    # Check if document has too many pages
                    if len(doc) > MAX_PDF_PAGES and not page_range:
                        logger.warning(f"PDF {file_path} has {len(doc)} pages, exceeding limit of {MAX_PDF_PAGES}. Processing first 100 pages.")
                        page_range_to_process = range(min(100, len(doc)))
                    
                    # Try to extract document title from first page if not in metadata
                    if not result["metadata"]["title"] and len(doc) > 0:
                        first_page = doc[0]
                        # Get text from top of first page
                        top_text = first_page.get_text("text", clip=(0, 0, first_page.rect.width, first_page.rect.height * 0.2))
                        # Use first line as potential title
                        if top_text:
                            first_lines = top_text.strip().split('\n')
                            if first_lines:
                                candidate_title = first_lines[0].strip()
                                if 3 < len(candidate_title) < 200:  # Reasonable title length
                                    result["structure"]["title"] = candidate_title
                    
                    # Process each page in the range
                    scanned_page_count = 0
                    
                    for page_idx in page_range_to_process:
                        page = doc[page_idx]
                        page_text = page.get_text()
                        
                        # Check if page might be scanned (very little text content)
                        is_scanned_page = len(page_text.strip()) < 100 and has_images(page)
                        if is_scanned_page:
                            scanned_page_count += 1
                            
                        page_dict = {
                            "page_num": page_idx + 1,
                            "text": page_text,
                            "blocks": [],
                            "is_scanned": is_scanned_page
                        }
                        
                        # Extract text blocks with position data
                        try:
                            blocks = page.get_text("dict")["blocks"]
                            for block in blocks:
                                if "lines" in block:
                                    block_text = ""
                                    for line in block["lines"]:
                                        for span in line["spans"]:
                                            # Detect if text is a potential heading (based on font size)
                                            if span["size"] > 12:  # Adjust threshold as needed
                                                if len(span["text"].strip()) > 3:  # Avoid single characters
                                                    heading = {
                                                        "text": span["text"],
                                                        "page": page_idx + 1,
                                                        "font_size": span["size"],
                                                        "bold": span["font"].lower().find("bold") >= 0
                                                    }
                                                    result["structure"]["headings"].append(heading)
                                            
                                            block_text += span["text"] + " "
                                    
                                    if block_text.strip():
                                        page_dict["blocks"].append({
                                            "text": block_text.strip(),
                                            "bbox": block["bbox"],
                                            "type": "text"
                                        })
                        except Exception as e:
                            # If block extraction fails, continue with whole-page text
                            logger.debug(f"Error extracting blocks from page {page_idx+1}: {e}")
                            page_dict["blocks"].append({
                                "text": page_text,
                                "type": "text"
                            })
                        
                        # Attempt to identify tables (simplified approach)
                        tables = []
                        if hasattr(page, 'find_tables'):  # PyMuPDF v1.19.0+
                            try:
                                tables = page.find_tables()
                                for table in tables:
                                    cells = table.extract()
                                    page_dict["blocks"].append({
                                        "type": "table",
                                        "bbox": table.bbox,
                                        "rows": len(cells),
                                        "cols": len(cells[0]) if cells else 0,
                                        "data": cells
                                    })
                            except (AttributeError, Exception) as e:
                                logger.debug(f"Error extracting tables from page {page_idx+1}: {e}")
                        
                        result["structure"]["pages"].append(page_dict)
                        result["text_content"].append(page_text)
                    
                    # Update scanned content flag
                    result["has_scanned_content"] = scanned_page_count > 0
                    if scanned_page_count > 0:
                        logger.info(f"Detected {scanned_page_count} potentially scanned pages in {file_path}")
                    
                    # Join all text content
                    result["full_text"] = "\n".join(result["text_content"])
                    
                    # Verify we got some text
                    if not result["full_text"] or len(result["full_text"].strip()) < 50:
                        logger.warning(f"PyMuPDF extracted very little text from {file_path}. Will try alternative methods.")
                        raise ValueError("Insufficient text extracted")
                    
                    return result
                    
            except Exception as e:
                logger.error(f"PyMuPDF extraction failed for {file_path}: {e}")
                # Record the error and fall back to next method
                result["extraction_errors"].append(f"PyMuPDF: {str(e)}")
                result["extraction_method"] = "fallback"
        
        # Fall back to PyPDF2 if PyMuPDF failed or isn't available
        if (not result["full_text"] or len(result["full_text"].strip()) < 50) and USE_PYPDF2:
            extraction_attempts += 1
            try:
                import PyPDF2
                result["extraction_method"] = "pypdf2"
                
                with TimingContext("PyPDF2 extraction"):
                    text_parts = []
                    with open(file_path, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        result["page_count"] = len(reader.pages)
                        
                        # Apply page range if specified
                        if page_range:
                            start_page, end_page = page_range
                            page_range_to_process = range(
                                max(0, start_page), 
                                min(len(reader.pages), end_page + 1)
                            )
                        else:
                            page_range_to_process = range(len(reader.pages))
                            
                        # Check if document has too many pages
                        if len(reader.pages) > MAX_PDF_PAGES and not page_range:
                            logger.warning(f"PDF {file_path} has {len(reader.pages)} pages, exceeding limit of {MAX_PDF_PAGES}. Processing first 100 pages.")
                            page_range_to_process = range(min(100, len(reader.pages)))
                        
                        # Extract metadata
                        if hasattr(reader, 'metadata') and reader.metadata:
                            result["metadata"] = {
                                "title": reader.metadata.get("/Title", ""),
                                "author": reader.metadata.get("/Author", ""),
                                "subject": reader.metadata.get("/Subject", ""),
                                "creator": reader.metadata.get("/Creator", ""),
                                "producer": reader.metadata.get("/Producer", ""),
                                "page_count": len(reader.pages)
                            }
                        
                        # Process each page in the range
                        for page_idx in page_range_to_process:
                            page = reader.pages[page_idx]
                            
                            try:
                                content = page.extract_text() or ""
                                
                                # Check if page might be scanned
                                if len(content.strip()) < 100:
                                    result["has_scanned_content"] = True
                                    
                                text_parts.append(content)
                                
                                # Create basic page structure
                                result["structure"]["pages"].append({
                                    "page_num": page_idx + 1,
                                    "text": content,
                                    "blocks": [{"text": content, "type": "text"}]
                                })
                                
                                result["text_content"].append(content)
                                
                            except Exception as page_err:
                                logger.warning(f"Error extracting text from page {page_idx+1}: {page_err}")
                                result["text_content"].append("")
                                result["structure"]["pages"].append({
                                    "page_num": page_idx + 1,
                                    "text": "",
                                    "blocks": [],
                                    "error": str(page_err)
                                })
                        
                        result["full_text"] = "\n".join(text_parts)
            except Exception as e:
                logger.error(f"PyPDF2 extraction failed for {file_path}: {e}")
                result["extraction_errors"].append(f"PyPDF2: {str(e)}")
                result["full_text"] = ""
                result["extraction_method"] = "failed"
        
        # Final emergency fallback to pdfplumber if everything else failed
        if (not result["full_text"] or len(result["full_text"].strip()) < 50) and USE_PDFPLUMBER:
            extraction_attempts += 1
            try:
                logger.info(f"Trying pdfplumber extraction fallback for {file_path}")
                import pdfplumber
                
                text_parts = []
                with pdfplumber.open(file_path) as pdf:
                    result["page_count"] = len(pdf.pages)
                    
                    # Apply page range if specified
                    if page_range:
                        start_page, end_page = page_range
                        page_range_to_process = range(
                            max(0, start_page),
                            min(len(pdf.pages), end_page + 1)
                        )
                    else:
                        page_range_to_process = range(len(pdf.pages))
                    
                    # Process each page
                    for page_idx in page_range_to_process:
                        try:
                            page = pdf.pages[page_idx]
                            page_text = page.extract_text() or ""
                            text_parts.append(page_text)
                            
                            # Create basic page structure
                            result["structure"]["pages"].append({
                                "page_num": page_idx + 1,
                                "text": page_text,
                                "blocks": [{"text": page_text, "type": "text"}]
                            })
                            
                            result["text_content"].append(page_text)
                        except Exception as e:
                            logger.warning(f"pdfplumber error on page {page_idx}: {e}")
                    
                    result["full_text"] = "\n".join(text_parts)
                    result["extraction_method"] = "pdfplumber"
                    
            except Exception as e:
                logger.error(f"pdfplumber extraction failed for {file_path}: {e}")
                result["extraction_errors"].append(f"pdfplumber: {str(e)}")
        
        # EMERGENCY LAST RESORT: Pure binary read approach as absolute fallback
        if not result["full_text"] or len(result["full_text"].strip()) < 50:
            extraction_attempts += 1
            try:
                logger.warning(f"All structured extraction methods failed for {file_path}. Trying raw binary extraction.")
                
                # Read the PDF as binary and look for text
                with open(file_path, 'rb') as f:
                    binary_content = f.read()
                
                # Try to find text by decoding binary content
                try:
                    # Try utf-8 first
                    text = binary_content.decode('utf-8', errors='ignore')
                    
                    # Clean up binary junk
                    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]', '', text)
                    text = re.sub(r'[^\w\s\.,;:!?\'"-]', ' ', text)
                    
                    # Remove duplicate spaces
                    text = re.sub(r'\s+', ' ', text).strip()
                    
                    if len(text) > 100:  # If we got something substantial
                        result["full_text"] = text
                        result["text_content"] = [text]
                        result["extraction_method"] = "binary_fallback"
                        logger.info(f"Extracted {len(text)} characters via binary fallback from {file_path}")
                except Exception as e:
                    logger.error(f"Binary fallback extraction failed: {e}")
                    result["extraction_errors"].append(f"binary_fallback: {str(e)}")
            except Exception as e:
                logger.error(f"Emergency extraction failed: {e}")
                result["extraction_errors"].append(f"emergency: {str(e)}")
        
        # Final log message about extraction results
        if result["full_text"]:
            logger.info(f"Successfully extracted {len(result['full_text'])} characters from {file_path} using {result['extraction_method']} after {extraction_attempts} attempts")
        else:
            logger.error(f"Failed to extract text from {file_path} after {extraction_attempts} extraction attempts")
            
        # Record extraction time
        result["extraction_time"] = time.time() - result.get("start_time", time.time())
        result["extraction_attempts"] = extraction_attempts
        
        return result

def extract_basic_text_from_pdf(file_path: str) -> str:
    """
    Extract basic text from PDF using multiple methods for maximum reliability.
    Tries multiple libraries in sequence to ensure best possible text extraction.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Extracted text content as string
    """
    if pdf_extractor_available:
        try:
            # Use appropriate pdf_extractor function
            pdf_data = pdf_extractor.extract_text_from_pdf(file_path)
            return pdf_data.get("full_text", "")
        except Exception as e:
            logger.warning(f"pdf_extractor text extraction failed: {e}. Falling back to built-in method.")
    
    best_text = ""
    extraction_methods_tried = []
    
    # Try PyMuPDF (fitz) first as it's usually the most reliable
    if USE_FITZ:
        try:
            import fitz
            extraction_methods_tried.append("PyMuPDF")
            text = []
            with fitz.open(file_path) as doc:
                for page in doc:
                    try:
                        page_text = page.get_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with PyMuPDF: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with PyMuPDF")
        except Exception as e:
            logger.warning(f"PyMuPDF extraction failed: {e}")
    
    # Try PyPDF2 if it's available
    if USE_PYPDF2 and (not best_text or len(best_text.strip()) < 1000):  # If we don't have good text yet
        try:
            import PyPDF2
            extraction_methods_tried.append("PyPDF2")
            text = []
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with PyPDF2: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with PyPDF2")
        except Exception as e:
            logger.warning(f"PyPDF2 extraction failed: {e}")
    
    # Try pdfplumber as another alternative
    if USE_PDFPLUMBER and (not best_text or len(best_text.strip()) < 1000):
        try:
            import pdfplumber
            extraction_methods_tried.append("pdfplumber")
            text = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with pdfplumber: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with pdfplumber")
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}")
    
    # If we still don't have good text, try binary content extraction as last resort
    if not best_text or len(best_text.strip()) < 500:
        try:
            extraction_methods_tried.append("binary_fallback")
            # Read the PDF as binary and try to extract text
            with open(file_path, 'rb') as f:
                binary_content = f.read()
            
            # Try different encodings
            for encoding in ['utf-8', 'latin-1', 'cp1252']:
                try:
                    decoded = binary_content.decode(encoding, errors='ignore')
                    # Clean up binary junk
                    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]', '', decoded)
                    # Clean up remaining junk but keep basic punctuation
                    cleaned = re.sub(r'[^\w\s\.,;:!?\'"\-()]', ' ', cleaned)
                    # Remove duplicate spaces
                    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
                    
                    if len(cleaned) > len(best_text.strip()):
                        best_text = cleaned
                        logger.debug(f"Binary extraction with {encoding} yielded {len(best_text)} characters")
                except:
                    continue
            
            if best_text:
                logger.info(f"Extracted {len(best_text)} characters via binary fallback from {file_path}")
        except Exception as e:
            logger.error(f"Binary extraction fallback failed: {e}")
    
    # Report which methods were tried
    if extraction_methods_tried:
        logger.info(f"PDF text extraction methods tried: {', '.join(extraction_methods_tried)}")
    
    if not best_text:
        logger.warning(f"All text extraction methods failed for {file_path}")
        return ""
    
    return best_text



def has_images(page) -> bool:
    """
    Check if a PyMuPDF page contains images.
    
    Args:
        page: PyMuPDF page object
        
    Returns:
        True if page contains images, False otherwise
    """
    if not USE_FITZ:
        return False
        
    try:
        image_list = page.get_images(full=True)
        return len(image_list) > 0
    except Exception:
        return False

def extract_tables_from_pdf(file_path: str, limit: int = 50) -> List[Dict[str, Any]]:
    if pdf_extractor_available:
        try:
            return pdf_extractor.extract_tables_from_pdf(file_path, limit=limit)
        except Exception as e:
            logger.warning(f"pdf_extractor table extraction failed: {e}. Falling back to built-in method.")
    """
    Extract tables from PDF using tabula-py (if available) or PyMuPDF.
    
    Args:
        file_path: Path to the PDF file
        limit: Maximum number of tables to extract
        
    Returns:
        List of extracted tables with page numbers and data
    """
    tables = []
    
    # First try using PyMuPDF (more reliable)
    if USE_FITZ:
        try:
            logger.info(f"Attempting table extraction with PyMuPDF for {file_path}")
            pymupdf_tables = []
            with fitz.open(file_path) as doc:
                for page_num, page in enumerate(doc):
                    if hasattr(page, 'find_tables'):  # PyMuPDF v1.19.0+
                        try:
                            for i, table in enumerate(page.find_tables()):
                                if len(pymupdf_tables) >= limit:
                                    break
                                    
                                cells = table.extract()
                                # Convert cells to a more useful format
                                data = []
                                for row in cells:
                                    data.append({f"col_{j}": cell for j, cell in enumerate(row)})
                                
                                table_dict = {
                                    "table_id": len(pymupdf_tables) + 1,
                                    "page": page_num + 1,
                                    "rows": len(cells),
                                    "columns": [f"col_{j}" for j in range(len(cells[0]) if cells else 0)],
                                    "data": data,
                                    "extraction_method": "pymupdf"
                                }
                                pymupdf_tables.append(table_dict)
                        except Exception as e:
                            logger.debug(f"PyMuPDF table extraction failed for page {page_num+1}: {e}")
            
            if pymupdf_tables:
                logger.info(f"Extracted {len(pymupdf_tables)} tables from {file_path} using PyMuPDF")
                return pymupdf_tables
            
        except Exception as e:
            logger.warning(f"PyMuPDF table extraction failed for {file_path}: {e}")
    
    # Try using tabula-py if available
    if USE_TABULA:
        try:
            # First verify tabula is properly installed with Java
            import tabula
            import jpype
            
            # Check Java integration
            if not jpype.isJVMStarted():
                try:
                    logger.info("Starting JVM for tabula")
                    jpype.startJVM()
                except Exception as jvm_err:
                    logger.warning(f"Failed to start JVM: {jvm_err}")
            
            # Extract all tables from the PDF
            try:
                tabula_tables = tabula.read_pdf(file_path, pages='all', multiple_tables=True)
            except AttributeError as attr_err:
                if "'module' object has no attribute '_parse_pages'" in str(attr_err):
                    # Use alternative approach for newer tabula-py versions
                    tabula_tables = tabula.io.read_pdf(file_path, pages='all', multiple_tables=True)
                else:
                    raise
            
            # Process each table
            for i, table in enumerate(tabula_tables):
                if i >= limit:
                    logger.info(f"Reached table limit ({limit}). Skipping remaining tables.")
                    break
                    
                # Convert DataFrame to dict
                table_dict = {
                    "table_id": i + 1,
                    "page": 1,  # Default if page info not available
                    "rows": len(table),
                    "columns": list(table.columns),
                    "data": table.fillna('').to_dict(orient='records'),
                    "extraction_method": "tabula"
                }
                tables.append(table_dict)
            
            logger.info(f"Extracted {len(tables)} tables from {file_path} using tabula-py")
            if tables:
                return tables
                
        except Exception as e:
            logger.warning(f"Tabula extraction failed for {file_path}: {e}")
    
    logger.info(f"No tables extracted from {file_path} using available methods")
    return []
@dataclass
class FileStats:
    """Track stats for file processing."""
    def __init__(self):
        self.total_files = 0
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.binary_files = 0
        self.total_bytes = 0
        self.total_chunks = 0
        self.total_processing_time = 0
        self.start_time = time.time()
        
        # PDF specific stats
        self.pdf_files = 0
        self.tables_extracted = 0
        self.references_extracted = 0
        self.scanned_pages_processed = 0
        self.ocr_processed_files = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization with additional metrics"""
        # Create base dictionary from all attributes
        d = {k: v for k, v in self.__dict__.items() if not k.startswith('_')}
        
        # Calculate duration
        duration_seconds = time.time() - self.start_time
        d['duration_seconds'] = duration_seconds
        
        # Calculate derived metrics
        d['files_per_second'] = self.processed_files / duration_seconds if duration_seconds > 0 else 0
        d['average_file_size'] = self.total_bytes / self.processed_files if self.processed_files > 0 else 0
        d['error_rate'] = (self.error_files / self.total_files * 100) if self.total_files > 0 else 0
        
        # Remove internal fields
        d.pop('start_time', None)
        
        return d
# -----------------------------------------------------------------------------
# DOCUMENT STRUCTURE ANALYSIS
# -----------------------------------------------------------------------------
def identify_document_structure(text: str, headings: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Analyze document text to identify structural elements.
    
    Args:
        text: Full document text
        headings: List of potential headings detected by font size (optional)
        
    Returns:
        Document structure information
    """
    structure = {
        "sections": [],
        "potential_lists": [],
        "paragraphs": []
    }
    
    # Split text into lines
    lines = text.split('\n')
    current_section = {"title": "", "content": [], "level": 0}
    in_list = False
    list_items = []
    paragraph = []
    
    # Common section number patterns
    section_patterns = [
        re.compile(r'^\s*(\d+\.)\s+(.+)$'),  # 1. Section
        re.compile(r'^\s*(\d+\.\d+\.)\s+(.+)$'),  # 1.1. Subsection
        re.compile(r'^\s*(Chapter\s+\d+[.:])?\s*(.+)$', re.IGNORECASE),  # Chapter 1: Title
        re.compile(r'^\s*(Section\s+\d+[.:])?\s*(.+)$', re.IGNORECASE),  # Section 1: Title
    ]
    
    # Common list item patterns
    list_patterns = [
        re.compile(r'^\s*[\•\-\*]\s+(.+)$'),  # Bullet lists
        re.compile(r'^\s*(\d+\.|\d+\)|\(\d+\))\s+(.+)$'),  # Numbered lists
        re.compile(r'^\s*([a-z]\.|\([a-z]\))\s+(.+)$')  # Alphabetic lists
    ]
    
    # Generate synthetic headings from font detection (if available)
    synthetic_headings = {}
    if headings:
        for heading in headings:
            line_idx = -1
            for i, line in enumerate(lines):
                if heading["text"].strip() in line.strip():
                    line_idx = i
                    break
            
            if line_idx >= 0:
                synthetic_headings[line_idx] = heading
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            # End of paragraph
            if paragraph:
                structure["paragraphs"].append(" ".join(paragraph))
                paragraph = []
            continue
        
        # Check if line is a section heading
        is_heading = False
        for pattern in section_patterns:
            match = pattern.match(line)
            if match:
                # Save previous section if it exists
                if current_section["title"] and current_section["content"]:
                    structure["sections"].append(current_section)
                
                # Start new section
                prefix = match.group(1) if match.group(1) else ""
                title = match.group(2)
                level = 1 if '.' not in prefix else prefix.count('.')
                current_section = {
                    "title": line,
                    "clean_title": title.strip(),
                    "level": level,
                    "content": [],
                    "line_number": i
                }
                is_heading = True
                break
        
        # Use heading info from font detection as backup
        if not is_heading and i in synthetic_headings:
            heading = synthetic_headings[i]
            is_heading = True
            # Save previous section if it exists
            if current_section["title"] and current_section["content"]:
                structure["sections"].append(current_section)
            
            # Start new section
            level = 1
            if heading.get("font_size"):
                if heading["font_size"] >= 18:
                    level = 1
                elif heading["font_size"] >= 14:
                    level = 2
                else:
                    level = 3
            
            current_section = {
                "title": line,
                "clean_title": line,
                "level": level,
                "content": [],
                "line_number": i,
                "font_size": heading.get("font_size", 0)
            }
        
        if is_heading:
            # End any current paragraph
            if paragraph:
                structure["paragraphs"].append(" ".join(paragraph))
                paragraph = []
            continue
        
        # Check for list items
        is_list_item = False
        for pattern in list_patterns:
            match = pattern.match(line)
            if match:
                is_list_item = True
                
                # End any current paragraph
                if paragraph:
                    structure["paragraphs"].append(" ".join(paragraph))
                    paragraph = []
                
                if not in_list:
                    in_list = True
                    list_items = []
                
                list_items.append(line)
                current_section["content"].append(line)
                break
        
        if not is_list_item and in_list:
            # End of list
            in_list = False
            structure["potential_lists"].append(list_items)
            list_items = []
        
        if not is_heading and not is_list_item:
            # Regular paragraph content
            paragraph.append(line)
            current_section["content"].append(line)
    
    # Save the last section
    if current_section["title"]:
        structure["sections"].append(current_section)
    
    # Save the last paragraph
    if paragraph:
        structure["paragraphs"].append(" ".join(paragraph))
    
    # Save the last list
    if in_list and list_items:
        structure["potential_lists"].append(list_items)
    
    return structure

def detect_document_type(file_path: str, text: str = None) -> str:
    if pdf_extractor_available:
        try:
            return pdf_extractor.detect_document_type(file_path, text)
        except Exception as e:
            logger.warning(f"pdf_extractor document type detection failed: {e}. Falling back to built-in method.")
    
    """
    Detect the type of PDF document to apply appropriate processing.
    
    Args:
        file_path: Path to the PDF file
        text: Document text if already extracted
        
    Returns:
        Document type (academic_paper, report, slides, scan, book, etc.)
    """
    if USE_FITZ:
        try:
            import fitz
            # Extract text if not provided
            if text is None:
                with fitz.open(file_path) as doc:
                    text = ""
                    for page in doc:
                        text += page.get_text()
            
            # Features to detect
            features = {
                "has_abstract": bool(re.search(r'\babstract\b', text[:2000], re.IGNORECASE)),
                "has_references": bool(re.search(r'\b(references|bibliography|works cited)\b', text, re.IGNORECASE)),
                "has_keywords": bool(re.search(r'\bkeywords\b', text[:2000], re.IGNORECASE)),
                "has_citations": len(re.findall(r'\(\w+\s+et\s+al\.,?\s+\d{4}\)|\[\d+\]', text)) > 2,
                "has_tables": bool(re.search(r'\btable\s+\d+\b', text, re.IGNORECASE)),
                "has_figures": bool(re.search(r'\bfigure\s+\d+\b', text, re.IGNORECASE)),
                "has_chapters": bool(re.search(r'\bchapter\s+\d+\b', text, re.IGNORECASE)),
                "has_toc": bool(re.search(r'\btable\s+of\s+contents\b', text[:5000], re.IGNORECASE)),
                "page_count": 0
            }
            
            # Get page count and check for text density
            with fitz.open(file_path) as doc:
                features["page_count"] = len(doc)
                
                # Check for very little text (possible scan)
                text_len = 0
                for page in doc:
                    page_text = page.get_text().strip()
                    text_len += len(page_text)
                
                features["text_density"] = text_len / features["page_count"] if features["page_count"] > 0 else 0
                features["low_text_ratio"] = features["text_density"] < 500  # Less than 500 chars per page
            
            # Determine document type based on features
            if features["low_text_ratio"]:
                return "scan"
            elif features["has_abstract"] and features["has_references"] and features["has_citations"]:
                return "academic_paper"
            elif features["has_chapters"] or features["has_toc"] or features["page_count"] > 50:
                return "book"
            elif features["has_tables"] and features["page_count"] > 15 and bool(re.search(r'executive\s+summary', text[:5000], re.IGNORECASE)):
                return "report"
            elif features["page_count"] < 30 and bool(re.search(r'(thesis|dissertation)', text[:5000], re.IGNORECASE)):
                return "thesis"
            elif features["page_count"] < 5 and len(re.findall(r'^\s*[\•\-\*]', text, re.MULTILINE)) > 10:
                return "slides"
            else:
                return "general"
        except Exception as e:
            logger.error(f"Error detecting document type: {e}")
            return "general"
    else:
        # Without PyMuPDF, do a simplified text-based detection
        if text is None:
            text = extract_basic_text_from_pdf(file_path)
        
        if len(text.strip()) < 500:
            return "scan"  # Very little text, might be a scan
        elif bool(re.search(r'\babstract\b', text[:2000], re.IGNORECASE)):
            return "academic_paper"
        elif bool(re.search(r'\bchapter\s+\d+\b', text, re.IGNORECASE)):
            return "book"
        else:
            return "general"

def extract_references(text: str) -> List[str]:
    """
    Extract academic references and citations from document text.
    
    Args:
        text: Full document text
        
    Returns:
        List of extracted references
    """
    references = []
    
    # Common patterns for reference sections
    ref_section_patterns = [
        re.compile(r'\b(references|bibliography|works cited|literature cited)\b', re.IGNORECASE),
    ]
    
    # Split text into lines
    lines = text.split('\n')
    
    # Find the references section
    in_references = False
    ref_start_idx = -1
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        # Check if we're at the references section
        if not in_references:
            for pattern in ref_section_patterns:
                if pattern.search(line):
                    in_references = True
                    ref_start_idx = i
                    break
        else:
            # Check if we've reached the end (another main section)
            if re.match(r'^([0-9]|appendix|table|figure|acknowledgements).*$', line, re.IGNORECASE):
                # Extract the references section
                ref_section = lines[ref_start_idx:i]
                references = process_references(ref_section)
                break
    
    # If we're still in the references section at the end of the document
    if in_references and ref_start_idx >= 0 and not references:
        ref_section = lines[ref_start_idx:]
        references = process_references(ref_section)
    
    return references

def process_references(ref_lines: List[str]) -> List[str]:
    """
    Process a list of lines from the references section to extract individual references.
    
    Args:
        ref_lines: Lines from the references section
        
    Returns:
        List of processed references
    """
    references = []
    current_ref = []
    
    # Skip the header line
    for line in ref_lines[1:]:
        line = line.strip()
        if not line:
            continue
            
        # Check if line starts a new reference
        starts_new_ref = bool(re.match(r'^\[\d+\]|\(\d+\)|^\d+\.|\[\w+\d*\]', line))
        
        # Also check for author pattern at start of line (lastname, initial.)
        author_pattern = bool(re.match(r'^[A-Z][a-z]+,\s+[A-Z]\.', line))
        
        if starts_new_ref or author_pattern:
            # Save previous reference if it exists
            if current_ref:
                references.append(" ".join(current_ref))
                current_ref = []
            
            current_ref.append(line)
        elif current_ref:
            # Continue previous reference
            current_ref.append(line)
    
    # Add the last reference
    if current_ref:
        references.append(" ".join(current_ref))
    
    return references

# -----------------------------------------------------------------------------
# CHUNKING AND TEXT PROCESSING
# -----------------------------------------------------------------------------
def chunk_document_intelligently(doc_data: Union[Dict[str, Any], PDFDocument], max_chunk_size: int = 4096, overlap: int = 200) -> List[Dict[str, Any]]:
    """
    Chunk a document in a more intelligent way that preserves structure and includes tables.
    This enhanced version always includes the full document content and creates better chunks.
    
    Args:
        doc_data: Document data with structure information
        max_chunk_size: Maximum size of each chunk
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of document chunks with metadata
    """
    chunks = []
    
    # Convert PDFDocument to dict if needed
    if isinstance(doc_data, PDFDocument):
        doc_dict = {
            "full_text": doc_data.full_text,
            "metadata": doc_data.metadata,
            "structure": doc_data.structure,
            "document_type": doc_data.document_type,
            "file_path": doc_data.file_path,
            "tables": doc_data.tables,
            "references": doc_data.references
        }
    else:
        doc_dict = doc_data
    
    # Extract table information first as we'll need it for all paths
    tables = doc_dict.get("tables", [])
    table_chunks = []
    
    # Create dedicated chunks for tables if they exist
    if tables:
        for i, table in enumerate(tables):
            # Convert table to text representation
            table_text = f"Table {i+1}"
            if "page" in table:
                table_text += f" (Page {table['page']})"
            table_text += ":\n\n"
            
            # Format the table data
            if "data" in table and table["data"]:
                if isinstance(table["data"][0], dict):
                    # Handle dictionary data (column:value format)
                    header = " | ".join(table["data"][0].keys())
                    separator = "-" * len(header)
                    rows = [" | ".join(str(cell) for cell in row.values()) for row in table["data"]]
                    table_text += header + "\n" + separator + "\n" + "\n".join(rows)
                else:
                    # Handle list/matrix data
                    rows = []
                    for row in table["data"]:
                        rows.append(" | ".join(str(cell) for cell in row))
                    table_text += "\n".join(rows)
            
            table_chunks.append({
                "content": table_text,
                "metadata": {
                    "title": doc_dict.get("metadata", {}).get("title", ""),
                    "chunk_type": "table",
                    "table_index": i,
                    "page": table.get("page", 0),
                    "source": doc_dict.get("file_path", ""),
                    "document_type": doc_dict.get("document_type", "general")
                }
            })
    
    # CRITICAL: Always create a full text chunk first to ensure the complete content is preserved
    full_text = doc_dict.get("full_text", "")
    if full_text:
        # Create a full content chunk at the beginning
        full_content_chunk = {
            "content": full_text,
            "metadata": {
                "title": doc_dict.get("metadata", {}).get("title", ""),
                "chunk_type": "full_content",
                "source": doc_dict.get("file_path", ""),
                "document_type": doc_dict.get("document_type", "general"),
                "tables_count": len(tables)
            }
        }
        
        # If the full content is too large, we need to chunk it
        if len(full_text) > max_chunk_size:
            # Split the full content into reasonable chunks
            full_content_chunks = chunk_text_by_paragraphs(full_text, max_chunk_size, overlap)
            for i, content in enumerate(full_content_chunks):
                chunks.append({
                    "content": content,
                    "metadata": {
                        "title": doc_dict.get("metadata", {}).get("title", ""),
                        "chunk_type": "content_part",
                        "chunk_index": i,
                        "source": doc_dict.get("file_path", ""),
                        "document_type": doc_dict.get("document_type", "general"),
                        "tables_count": len(tables)
                    }
                })
                
            # Also include the full content as a separate chunk for reference
            # This ensures the complete content is always available
            chunks.insert(0, full_content_chunk)
        else:
            # If it's small enough, include the whole text
            chunks.append(full_content_chunk)
    
    # Now proceed with structure-based chunking for better navigation (if available)
    if "structure" in doc_dict and doc_dict["structure"].get("sections"):
        sections = doc_dict["structure"]["sections"]
        
        current_chunk = {
            "content": "",
            "metadata": {
                "title": doc_dict.get("metadata", {}).get("title", ""),
                "sections": [],
                "source": doc_dict.get("file_path", ""),
                "document_type": doc_dict.get("document_type", "general"),
                "tables_count": len(tables),
                "chunk_type": "structured"
            }
        }
        
        for section in sections:
            section_text = ""
            
            # Include section title with appropriate formatting
            if section.get("level", 1) == 1:
                section_text = f"\n\n## {section['title']}\n\n"
            elif section.get("level", 1) == 2:
                section_text = f"\n\n### {section['title']}\n\n"
            else:
                section_text = f"\n\n#### {section['title']}\n\n"
                
            # Add section content
            if isinstance(section.get("content", []), list):
                section_text += "\n".join(section["content"])
            else:
                section_text += section.get("content", "")
            
            # If adding this section would exceed max size, save current chunk and start new one
            if len(current_chunk["content"]) + len(section_text) > max_chunk_size:
                # Only save non-empty chunks
                if current_chunk["content"]:
                    chunks.append(current_chunk)
                
                # If the section itself is too large, we need to split it
                if len(section_text) > max_chunk_size:
                    # Split large section by paragraphs
                    section_chunks = chunk_text_by_paragraphs(section_text, max_chunk_size, overlap)
                    for i, sc in enumerate(section_chunks):
                        chunks.append({
                            "content": sc,
                            "metadata": {
                                "title": doc_dict.get("metadata", {}).get("title", ""),
                                "sections": [f"{section.get('clean_title', section.get('title', ''))} (part {i+1})"],
                                "source": doc_dict.get("file_path", ""),
                                "document_type": doc_dict.get("document_type", "general"),
                                "tables_count": len(tables),
                                "chunk_type": "structured"
                            }
                        })
                else:
                    # Start new chunk with this section
                    current_chunk = {
                        "content": section_text,
                        "metadata": {
                            "title": doc_dict.get("metadata", {}).get("title", ""),
                            "sections": [section.get("clean_title", section.get("title", ""))],
                            "source": doc_dict.get("file_path", ""),
                            "document_type": doc_dict.get("document_type", "general"),
                            "tables_count": len(tables),
                            "chunk_type": "structured"
                        }
                    }
            else:
                # Add section to current chunk
                current_chunk["content"] += section_text
                current_chunk["metadata"]["sections"].append(
                    section.get("clean_title", section.get("title", ""))
                )
        
        # Add the last chunk if not empty
        if current_chunk["content"]:
            chunks.append(current_chunk)
            
    # If no structure, but using only paragraph-based chunking from the full text
    elif len(chunks) == 0 and "full_text" in doc_dict:
        # Make sure we have at least one chunk with the full text
        full_content_chunk = {
            "content": full_text,
            "metadata": {
                "title": doc_dict.get("metadata", {}).get("title", ""),
                "chunk_type": "full_content",
                "source": doc_dict.get("file_path", ""),
                "document_type": doc_dict.get("document_type", "general"),
                "tables_count": len(tables)
            }
        }
        chunks.append(full_content_chunk)
        
        # Also create paragraph-based chunks for normal navigation
        text_chunks = chunk_text_by_paragraphs(doc_dict["full_text"], max_chunk_size, overlap)
        for i, chunk in enumerate(text_chunks):
            chunks.append({
                "content": chunk,
                "metadata": {
                    "title": doc_dict.get("metadata", {}).get("title", ""),
                    "chunk_type": "text",
                    "chunk_index": i,
                    "source": doc_dict.get("file_path", ""),
                    "document_type": doc_dict.get("document_type", "general"),
                    "tables_count": len(tables)
                }
            })
        
    # Combine with table chunks
    chunks.extend(table_chunks)
    
    # Add reference information if available
    references = doc_dict.get("references", [])
    if references and "full_text" in doc_dict:
        ref_text = "\n\n## References\n\n"
        for ref in references:
            ref_text += f"- {ref}\n"
        
        chunks.append({
            "content": ref_text,
            "metadata": {
                "title": doc_dict.get("metadata", {}).get("title", ""),
                "chunk_type": "references",
                "source": doc_dict.get("file_path", ""),
                "document_type": doc_dict.get("document_type", "general"),
                "references_count": len(references)
            }
        })
    
    # Add metadata about chunks to all chunks for better tracking
    total_chunks = len(chunks)
    for i, chunk in enumerate(chunks):
        chunk["metadata"]["total_chunks"] = total_chunks
        chunk["metadata"]["chunk_index"] = i
    
    # VALIDATION: Double-check that we have included the full content
    if full_text:
        # Check if we've already included a full content chunk
        has_full_content = any(
            chunk.get("metadata", {}).get("chunk_type") == "full_content" 
            for chunk in chunks
        )
        
        if not has_full_content:
            # Add a full content chunk if missing
            logger.warning("Full content chunk missing during validation, adding one")
            full_content_chunk = {
                "content": full_text,
                "metadata": {
                    "title": doc_dict.get("metadata", {}).get("title", ""),
                    "chunk_type": "full_content_backup",
                    "source": doc_dict.get("file_path", ""),
                    "document_type": doc_dict.get("document_type", "general"),
                    "tables_count": len(tables),
                    "validation_note": "Added due to content validation failure"
                }
            }
            chunks.insert(0, full_content_chunk)
            
            # Re-index chunks
            total_chunks = len(chunks)
            for i, chunk in enumerate(chunks):
                chunk["metadata"]["total_chunks"] = total_chunks
                chunk["metadata"]["chunk_index"] = i
    
    return chunks

def chunk_text_by_paragraphs(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    Chunk text by preserving paragraph structure.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of text chunks
    """
    if len(text) <= max_size:
        return [text]
    
    # Split text into paragraphs
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    current_chunk = []
    current_size = 0
    last_chunk_end = ""
    
    for para in paragraphs:
        para_size = len(para) + 2  # Account for paragraph separator
        
        # If this paragraph alone exceeds the max size, split it by sentences
        if para_size > max_size:
            # Add any existing paragraphs as a chunk
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                # Save end of this chunk for overlap in next chunk
                if overlap > 0:
                    last_chunk_end = "\n\n".join(current_chunk[-2:]) if len(current_chunk) > 1 else current_chunk[0]
                current_chunk = []
                current_size = 0
            
            # Split large paragraph by sentences
            sentences = re.split(r'(?<=[.!?])\s+', para)
            sentence_chunk = []
            sentence_chunk_size = 0
            
            # If we have content from the last chunk to overlap, add it first
            if overlap > 0 and last_chunk_end:
                sentence_chunk_size += min(len(last_chunk_end), overlap)
                
            for sentence in sentences:
                sentence_size = len(sentence) + 1  # Space after sentence
                
                # If this sentence alone exceeds max_size, split by words
                if sentence_size > max_size:
                    # Add existing sentences as a chunk
                    if sentence_chunk:
                        chunk_text = " ".join(sentence_chunk)
                        if overlap > 0 and last_chunk_end:
                            chunk_text = last_chunk_end[-overlap:] + "\n\n" + chunk_text
                            last_chunk_end = chunk_text[-min(len(chunk_text), overlap):]
                        chunks.append(chunk_text)
                        sentence_chunk = []
                        sentence_chunk_size = overlap if overlap > 0 else 0
                    
                    # Split long sentence by words
                    words = sentence.split()
                    word_chunk = []
                    word_chunk_size = 0
                    
                    # Add overlap if needed
                    if overlap > 0 and last_chunk_end:
                        word_chunk_size += min(len(last_chunk_end), overlap)
                    
                    for word in words:
                        word_size = len(word) + 1  # Space after word
                        
                        if word_chunk_size + word_size > max_size:
                            chunk_text = " ".join(word_chunk)
                            if overlap > 0 and last_chunk_end:
                                chunk_text = last_chunk_end[-overlap:] + " " + chunk_text
                                last_chunk_end = chunk_text[-min(len(chunk_text), overlap):]
                            chunks.append(chunk_text)
                            word_chunk = [word]
                            word_chunk_size = word_size + (overlap if overlap > 0 else 0)
                        else:
                            word_chunk.append(word)
                            word_chunk_size += word_size
                    
                    # Add remaining words
                    if word_chunk:
                        chunk_text = " ".join(word_chunk)
                        if overlap > 0 and last_chunk_end:
                            chunk_text = last_chunk_end[-overlap:] + " " + chunk_text
                            last_chunk_end = chunk_text[-min(len(chunk_text), overlap):]
                        chunks.append(chunk_text)
                
                # Normal sentence that fits within max_size
                elif sentence_chunk_size + sentence_size > max_size:
                    chunk_text = " ".join(sentence_chunk)
                    if overlap > 0 and last_chunk_end:
                        chunk_text = last_chunk_end[-overlap:] + " " + chunk_text
                        last_chunk_end = chunk_text[-min(len(chunk_text), overlap):]
                    chunks.append(chunk_text)
                    sentence_chunk = [sentence]
                    sentence_chunk_size = sentence_size + (overlap if overlap > 0 else 0)
                else:
                    sentence_chunk.append(sentence)
                    sentence_chunk_size += sentence_size
            
            # Add remaining sentences
            if sentence_chunk:
                chunk_text = " ".join(sentence_chunk)
                if overlap > 0 and last_chunk_end:
                    chunk_text = last_chunk_end[-overlap:] + " " + chunk_text
                    last_chunk_end = chunk_text[-min(len(chunk_text), overlap):]
                chunks.append(chunk_text)
            
        # Normal paragraph that would exceed chunk size limit
        elif current_size + para_size > max_size:
            chunk_text = "\n\n".join(current_chunk)
            if overlap > 0 and last_chunk_end:
                chunk_text = last_chunk_end[-overlap:] + "\n\n" + chunk_text
            chunks.append(chunk_text)
            current_chunk = [para]
            current_size = para_size
            # Save this paragraph for potential overlap
            if overlap > 0:
                last_chunk_end = para
        
        # Paragraph fits in current chunk
        else:
            current_chunk.append(para)
            current_size += para_size
    
    # Add the last chunk
    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        if overlap > 0 and last_chunk_end and chunks:  # Only add overlap if there are previous chunks
            chunk_text = last_chunk_end[-overlap:] + "\n\n" + chunk_text
        chunks.append(chunk_text)
    
    return chunks

def chunk_text_by_words(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    Chunk text into segments not exceeding max_size characters.
    Preserves paragraph structure when possible.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of text chunks
    """
    if len(text) <= max_size:
        return [text]
    
    # For very large texts, use dedicated large text chunker
    if len(text) > 1_000_000:  # 1MB+
        return chunk_large_text(text, max_size, overlap)

    # First try paragraph-based chunking
    return chunk_text_by_paragraphs(text, max_size, overlap)

def chunk_large_text(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    Efficiently chunk very large texts (multi-MB) into segments of size max_size.
    Optimized for speed and memory efficiency with large documents.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of text chunks
    """
    chunks = []
    start = 0
    last_chunk = ""
    
    while start < len(text):
        # If remaining text fits in chunk, add it all
        if start + max_size >= len(text):
            chunk_text = text[start:]
            if overlap > 0 and chunks:
                chunk_text = last_chunk[-overlap:] + chunk_text
            chunks.append(chunk_text)
            break
            
        end = start + max_size
        
        # Try to find a paragraph break
        par_break = text.rfind("\n\n", start, end)
        if par_break != -1 and par_break > start + (max_size // 2):
            chunks.append(text[start:par_break])
            # Save end of chunk for overlap
            if overlap > 0:
                last_chunk = text[par_break - overlap:par_break]
            start = par_break + 2
            continue
            
        # Try to find a line break
        line_break = text.rfind("\n", start, end)
        if line_break != -1 and line_break > start + (max_size // 2):
            chunks.append(text[start:line_break])
            # Save end of chunk for overlap
            if overlap > 0:
                last_chunk = text[line_break - overlap:line_break]
            start = line_break + 1
            continue
            
        # Try to find sentence boundaries
        sent_breaks = [
            text.rfind(". ", start, end),
            text.rfind("? ", start, end),
            text.rfind("! ", start, end),
            text.rfind(".\n", start, end),
            text.rfind("?\n", start, end),
            text.rfind("!\n", start, end)
        ]
        
        best_break = max(sent_breaks)
        if best_break != -1 and best_break > start + (max_size // 3):
            chunks.append(text[start:best_break + 1])
            # Save end of chunk for overlap
            if overlap > 0:
                last_chunk = text[best_break + 1 - overlap:best_break + 1]
            start = best_break + 1
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
            continue
            
        # Last resort: break on word boundary
        while end > start and not text[end].isspace():
            end -= 1
            
        if end > start:
            chunks.append(text[start:end])
            # Save end of chunk for overlap
            if overlap > 0:
                last_chunk = text[end - overlap:end]
            start = end
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
        else:
            # If we couldn't find a word boundary, just break at max_size
            chunks.append(text[start:start + max_size])
            # Save end of chunk for overlap
            if overlap > 0:
                last_chunk = text[start + max_size - overlap:start + max_size]
            start += max_size
    
    # Add overlap between chunks if requested
    if overlap > 0 and len(chunks) > 1:
        overlapped_chunks = [chunks[0]]
        for i in range(1, len(chunks)):
            # If previous chunk is long enough for overlap
            if len(chunks[i-1]) >= overlap:
                overlapped_chunks.append(chunks[i-1][-overlap:] + chunks[i])
            else:
                overlapped_chunks.append(chunks[i])
        return overlapped_chunks
    
    return chunks

def unify_whitespace(txt: str) -> str:
    """
    Normalize whitespace in text while preserving paragraph breaks.
    
    Args:
        txt: Input text
        
    Returns:
        Text with normalized whitespace
    """
    # Preserve paragraph breaks
    paragraphs = re.split(r'\n\s*\n', txt)
    normalized_paragraphs = []
    
    for para in paragraphs:
        # Replace all whitespace sequences with a single space within paragraphs
        normalized = re.sub(r'\s+', ' ', para.strip())
        normalized_paragraphs.append(normalized)
    
    # Rejoin with double newlines
    return "\n\n".join(normalized_paragraphs)

def detect_language(text: str) -> str:
    """
    Detect the language of text content.
    Simple implementation based on character frequency.
    
    Args:
        text: Text to analyze
        
    Returns:
        ISO language code (default 'en' if detection fails)
    """
    # This is a very simple language detection - 
    # could be replaced with langdetect or similar library
    
    # Only use a sample of text for efficiency
    sample = text[:1000].lower()
    if not sample:
        return 'en'
    
    # Common character sequences in different languages
    language_markers = {
        'en': ['the', 'and', 'that', 'have', 'for', 'not', 'with'],
        'es': ['el', 'la', 'que', 'de', 'en', 'y', 'a', 'los', 'del'],
        'fr': ['le', 'la', 'les', 'des', 'et', 'en', 'du', 'que', 'est'],
        'de': ['der', 'die', 'das', 'und', 'ist', 'von', 'für', 'nicht'],
        'it': ['il', 'la', 'che', 'di', 'e', 'è', 'un', 'per', 'non'],
        'pt': ['o', 'a', 'que', 'de', 'e', 'do', 'da', 'em', 'um'],
        'zh': ['的', '是', '不', '了', '在', '人', '有', '我', '他'],
        'ja': ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と'],
        'ru': ['и', 'в', 'не', 'на', 'что', 'с', 'по', 'как', 'от']
    }
    
    # Count occurrences of marker words
    scores = {lang: 0 for lang in language_markers}
    for lang, markers in language_markers.items():
        for marker in markers:
            count = sample.count(marker)
            scores[lang] += count
    
    # If a non-latin script is detected, prioritize those languages
    non_latin_chars = sum(1 for c in sample if ord(c) > 127)
    has_cyrillic = any(0x0400 <= ord(c) <= 0x04FF for c in sample)
    has_cjk = any(0x4E00 <= ord(c) <= 0x9FFF for c in sample)
    has_japanese = any(0x3040 <= ord(c) <= 0x30FF for c in sample)
    
    if has_cjk:
        scores['zh'] *= 2
    if has_japanese:
        scores['ja'] *= 2
    if has_cyrillic:
        scores['ru'] *= 2
    
    # Get language with highest score
    if any(scores.values()):
        best_language = max(scores.items(), key=lambda x: x[1])[0]
        return best_language
    else:
        return 'en'  # Default to English

 # -----------------------------------------------------------------------------
# FILE AND METADATA PROCESSING
# -----------------------------------------------------------------------------
def is_binary_file(file_path: str, check_bytes: int = 8192) -> bool:
    """
    Determine if a file is binary. PDFs are always treated as text since they are processed separately.
    
    Args:
        file_path: Path to the file to check
        check_bytes: Number of bytes to check for binary content
        
    Returns:
        True if the file is detected as binary, False otherwise
    """
    if file_path.lower().endswith(".pdf"):
        return False

    # Check extension against known binary extensions
    ext = Path(file_path).suffix.lower()
    known_bin = {".jpg", ".jpeg", ".png", ".gif", ".zip", ".exe", ".dll", ".so", ".pyc", ".bin", ".dat", 
                 ".xlsx", ".docx", ".pptx", ".mp3", ".mp4", ".avi", ".mov", ".wav", ".class"}
    if ext in known_bin:
        return True

    # Check file size - don't try to read extremely large files
    try:
        size = os.path.getsize(file_path)
        if size <= 0:
            return False
        if size > MAX_FILE_SIZE:
            logger.warning(f"File {file_path} exceeds size limit ({size} bytes). Treating as binary.")
            return True
    except OSError:
        logger.warning(f"Could not determine size of {file_path}")
        return True  # Err on the side of caution

    # Perform content-based detection
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(min(check_bytes, size))
            
            # Check for known binary signatures
            for sig, _ in BINARY_SIGNATURES.items():
                if chunk.startswith(sig):
                    return True
                    
            # Check for null bytes (common in binary files)
            if b"\x00" in chunk:
                return True
                
            # Check for high ratio of non-printable characters
            printable = sum(1 for b in chunk if (32 <= b < 127) or b in b" \t\r\n")
            if printable / len(chunk) < 0.8:
                return True
                
        return False
    except Exception as e:
        logger.debug(f"Binary file check failed on {file_path}: {e}")
        return True  # Err on the side of caution

def extract_metadata(file_path: str, root_directory: str) -> Tuple[str, str, int, str]:
    """
    Extract metadata from file_path relative to root_directory.
    
    Args:
        file_path: Path to the file
        root_directory: Root directory for relative path calculation
        
    Returns:
        Tuple: (primary_library, relative_path, size, last_modified)
        
    Raises:
        MetadataExtractionError: If metadata extraction fails
    """
    try:
        p = Path(file_path)
        rel = str(p.relative_to(Path(root_directory)))
        parts = rel.split(os.sep)
        primary_lib = parts[0] if len(parts) > 1 else "root"
        size = p.stat().st_size
        mtime = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        return primary_lib, rel, size, mtime
    except Exception as e:
        logger.error(f"Metadata extraction error for {file_path}: {e}")
        raise MetadataExtractionError(f"Failed to extract metadata from {file_path}: {e}")

def extract_section_name(file_path: str) -> str:
    """
    Extract a section name from a file with improved detection for different file types
    and enhanced error recovery.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Section name extracted from file
    """
    # Check cache first for better performance
    if file_path in section_name_cache:
        return section_name_cache[file_path]

    # Get base name and extension
    p = Path(file_path)
    ext = p.suffix.lower()
    name = p.stem
    
    # For very large files, just return the name without parsing content
    try:
        if os.path.getsize(file_path) > 10_000_000:  # 10MB
            section_name_cache[file_path] = name
            return name
    except OSError:
        # If can't get size, just continue with name
        section_name_cache[file_path] = name
        return name
    
    try:
        # Base extraction size limited to prevent reading entire large files
        max_chunk_size = 20_000  # First 20KB should be enough
        
        try:
            file_size = os.path.getsize(file_path)
            chunk_size = min(file_size, max_chunk_size)
        except OSError:
            chunk_size = max_chunk_size
        
        # Read content with proper error handling
        try:
            with open(file_path, "rb") as f:
                data = f.read(chunk_size)
                
            # Try to decode as text with multiple encodings
            text_content = None
            for encoding in ['utf-8', 'latin-1', 'cp1252']:
                try:
                    text_content = data.decode(encoding, errors='replace')
                    break
                except UnicodeDecodeError:
                    continue
                    
            if not text_content:
                # If no encoding worked, use latin-1 as a last resort
                text_content = data.decode('latin-1', errors='replace')
                
        except Exception as e:
            logger.debug(f"Failed to read file for section name extraction: {e}")
            section_name_cache[file_path] = name
            return name
        
        # Python files - extract class or function name
        if ext == ".py":
            # Look for class definition
            cm = CLASS_PATTERN.search(text_content)
            if cm:
                nm = f"{name}::{cm.group(1)}"
                section_name_cache[file_path] = nm
                return nm
                
            # Look for function definition
            fm = FUNCTION_PATTERN.search(text_content)
            if fm:
                nm = f"{name}::{fm.group(1)}"
                section_name_cache[file_path] = nm
                return nm
                
        # JSON files - extract schema title if present
        elif ext == ".json":
            jm = JSON_SCHEMA_PATTERN.search(text_content)
            if jm and jm.group(1) == "title":
                nm = jm.group(2)
                section_name_cache[file_path] = nm
                return nm
                
        # HTML files - extract title
        elif ext in [".html", ".htm"]:
            hm = HTML_TITLE_PATTERN.search(text_content)
            if hm:
                nm = hm.group(1).strip()
                section_name_cache[file_path] = nm
                return nm
                
        # Markdown files - extract first heading
        elif ext == ".md":
            mm = MARKDOWN_HEADING_PATTERN.search(text_content)
            if mm:
                nm = mm.group(1).strip()
                section_name_cache[file_path] = nm
                return nm
                
        # PDF files - try to get title from metadata or first page
        elif ext == ".pdf":
            if USE_FITZ:
                try:
                    import fitz
                    with fitz.open(file_path) as doc:
                        # Try metadata title first
                        title = doc.metadata.get("title", "")
                        if title:
                            section_name_cache[file_path] = title
                            return title
                            
                        # Get text from first page
                        if len(doc) > 0:
                            page = doc[0]
                            # Get text from top of first page
                            top_text = page.get_text("text", clip=(0, 0, page.rect.width, page.rect.height * 0.2))
                            if top_text:
                                lines = top_text.strip().split('\n')
                                if lines:
                                    first_line = lines[0].strip()
                                    if len(first_line) > 3 and len(first_line) < 100:  # Reasonable title length
                                        section_name_cache[file_path] = first_line
                                        return first_line
                except Exception as e:
                    logger.debug(f"Error extracting PDF title: {e}")
            elif USE_PYPDF2:
                try:
                    import PyPDF2
                    with open(file_path, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        if reader.metadata and reader.metadata.get('/Title'):
                            title = reader.metadata.get('/Title')
                            section_name_cache[file_path] = title
                            return title
                except Exception as e:
                    logger.debug(f"Error extracting PDF title with PyPDF2: {e}")
            
            # If no title was found in PDF, detect document type
            if hasattr(globals(), 'detect_document_type'):
                try:
                    doc_type = detect_document_type(file_path)
                    if doc_type != "general":
                        nm = f"{name} ({doc_type})"
                        section_name_cache[file_path] = nm
                        return nm
                except Exception as e:
                    logger.debug(f"Error detecting document type: {e}")
        
        # For source code files, try to find module/package name
        if ext in [".py", ".js", ".ts", ".java", ".c", ".cpp", ".cs"]:
            # Try to find package/module declaration
            package_patterns = [
                re.compile(r'package\s+([a-zA-Z0-9_.]+)', re.MULTILINE),  # Java, Kotlin
                re.compile(r'namespace\s+([a-zA-Z0-9_.]+)', re.MULTILINE),  # C#, C++
                re.compile(r'module\s+([a-zA-Z0-9_.]+)', re.MULTILINE)  # TypeScript
            ]
            
            for pattern in package_patterns:
                pm = pattern.search(text_content)
                if pm:
                    nm = f"{pm.group(1)}.{name}"
                    section_name_cache[file_path] = nm
                    return nm
    except Exception as e:
        logger.debug(f"Error extracting section name: {e}")
        
    # Default to filename if no other method succeeds
    section_name_cache[file_path] = name
    return name

def read_file_text(file_path: str, memory_limit: int = DEFAULT_MEMORY_LIMIT) -> str:
    """
    Read text from a file with enhanced error handling, format detection,
    and memory-efficient processing.
    
    Args:
        file_path: Path to the file
        memory_limit: Maximum memory to use for file reading
        
    Returns:
        Extracted text content
    """
    # Special handling for PDF files
    if file_path.lower().endswith('.pdf'):
        pdf_data = extract_text_from_pdf(file_path)
        return pdf_data.get("full_text", "")

    # Check file size to adapt reading strategy
    try:
        size = os.path.getsize(file_path)
        if size > memory_limit:
            logger.warning(f"File {file_path} exceeds memory limit ({size} bytes). Using streamed reading.")
            return read_large_file(file_path)
    except OSError as e:
        logger.error(f"Unable to get file size for {file_path}: {e}")
        # Continue anyway and try to read the file

    # Handle small files with direct reading
    try:
        # Try utf-8 first
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            # Try different encodings
            encodings_to_try = ['latin-1', 'cp1252', 'utf-16', 'utf-16-le', 'utf-16-be']
            for encoding in encodings_to_try:
                try:
                    with open(file_path, "r", encoding=encoding) as f:
                        return f.read()
                except UnicodeDecodeError:
                    continue
                    
            # If all encodings fail, try binary mode with decoding
            with open(file_path, "rb") as f:
                content = f.read()
                # Try multiple encodings again with binary content
                for encoding in encodings_to_try + ['utf-8']:
                    try:
                        return content.decode(encoding)
                    except UnicodeDecodeError:
                        continue
                
                # If all else fails, use replace for any decoding errors
                return content.decode('utf-8', errors='replace')
    except (UnicodeDecodeError, IOError) as e:
        logger.error(f"Error reading file {file_path}: {e}")
        # Last resort: try to read as binary and decode with replace
        try:
            with open(file_path, "rb") as f:
                content = f.read()
                return content.decode('utf-8', errors='replace')
        except Exception as e2:
            logger.error(f"Final fallback reading failed for {file_path}: {e2}")
            return ""
    except Exception as e:
        logger.error(f"Unexpected error reading {file_path}: {e}")
        return ""

def read_large_file(file_path: str) -> str:
    """
    Read a large text file in chunks to avoid memory issues.
    Enhanced with multiple encoding support and better error handling.
    
    Args:
        file_path: Path to the file
        
    Returns:
        File content as text
    """
    possible_encs = ["utf-8", "latin-1", "cp1252", "utf-16", "utf-16-le", "utf-16-be"]
    buffer_size = 1024 * 1024  # 1MB buffer
    
    # Try reading with different encodings
    for enc in possible_encs:
        try:
            content_parts = []
            with open(file_path, "r", encoding=enc, errors="replace") as f:
                while True:
                    chunk = f.read(buffer_size)
                    if not chunk:
                        break
                    content_parts.append(chunk)
            
            # Successfully read the file with this encoding
            logger.debug(f"Successfully read {file_path} with encoding {enc}")
            return "".join(content_parts)
        except Exception as e:
            logger.debug(f"Failed to read {file_path} with encoding {enc}: {e}")
            continue

    # If all encodings fail, try binary mode as a last resort
    try:
        logger.warning(f"All text-mode reading attempts failed for {file_path}. Trying binary mode.")
        content_parts = []
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(buffer_size)
                if not chunk:
                    break
                # Decode each chunk with replace option for invalid characters
                content_parts.append(chunk.decode("utf-8", errors="replace"))
        return "".join(content_parts)
    except Exception as e:
        logger.error(f"Binary mode reading failed for {file_path}: {e}")
        return ""


# -----------------------------------------------------------------------------
# PROCESS A SINGLE FILE
# -----------------------------------------------------------------------------
def process_file(
    file_path: str,
    root_directory: str,
    max_chunk_size: int,
    stop_words: Set[str],
    include_binary_detection: bool,
    stats: FileStats,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
    max_file_size: int = MAX_FILE_SIZE,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Optional[Tuple[str, List[DocData]]]:
    """
    Process a single file with enhanced PDF handling capabilities.
    
    Args:
        file_path: Path to the file
        root_directory: Root directory for relative path calculation
        max_chunk_size: Maximum size of text chunks
        stop_words: Set of words to ignore in tag generation
        include_binary_detection: Whether to detect and skip binary files
        stats: Statistics object to update
        overlap: Number of characters to overlap between chunks
        max_file_size: Maximum file size to process
        timeout: Maximum processing time per file in seconds
        progress_callback: Optional callback for progress reporting
        
    Returns:
        Tuple of (primary_library, list_of_docdata) or None if processing failed
    """
    start_time = time.time()
    
    # Skip binary files if enabled (except PDFs which are handled specially)
    if include_binary_detection and is_binary_file(file_path):
        stats.skipped_files += 1
        stats.binary_files_detected += 1
        raise BinaryFileError(f"Binary skip: {file_path}")

    # Extract basic file metadata
    try:
        primary_lib, rel_path, fsize, modtime = extract_metadata(file_path, root_directory)
        stats.update_largest_file(file_path, fsize)
        
        # Skip files that are too large (except PDFs which get special handling)
        if fsize > max_file_size and not file_path.lower().endswith('.pdf'):
            logger.warning(f"Skipping large file: {file_path} ({fsize} bytes > {max_file_size} bytes)")
            stats.skipped_files += 1
            raise FileTooLargeError(f"File too large: {file_path}")
            
    except MetadataExtractionError:
        stats.error_files += 1
        return None

    # Enhanced PDF processing
    if file_path.lower().endswith('.pdf'):
        # Track PDF files
        stats.pdf_files += 1
        
        try:
            # 1. Detect document type for specialized processing
            doc_type = detect_document_type(file_path)
            logger.info(f"Processing PDF: {file_path} (type: {doc_type})")
            
            # 2. Special handling for scanned documents
            if doc_type == "scan":
                logger.info(f"Applying OCR to scanned PDF: {file_path}")
                ocr_results = process_scanned_pdf(file_path)
                txt = ocr_results.get("text", "")
                confidence = ocr_results.get("confidence", 0)
                stats.scanned_pages_processed += ocr_results.get("pages_processed", 0)
                stats.ocr_processed_files += 1
                
                if not txt:
                    # Fall back to basic extraction if OCR fails
                    logger.warning("OCR processing failed, falling back to basic extraction")
                    pdf_data = extract_text_from_pdf(file_path)
                    txt = pdf_data.get("full_text", "")
            else:
                # 3. Extract text with structure information
                pdf_data = extract_text_from_pdf(file_path)
                txt = pdf_data.get("full_text", "")
            
            # Check if we need to abort due to timeout
            if time.time() - start_time > timeout:
                logger.warning(f"Processing timeout for {file_path}")
                stats.error_files += 1
                raise ProcessTimeoutError(f"Processing timeout for {file_path}")
                
            # 4. Extract tables for structured documents
            tables = []
            if doc_type in ["academic_paper", "report", "book"]:
                tables = extract_tables_from_pdf(file_path)
                stats.tables_extracted += len(tables)
                
            # 5. Extract document structure
            structure = identify_document_structure(
                txt, 
                pdf_data.get("structure", {}).get("headings", []) if 'pdf_data' in locals() else None
            )
            
            # 6. Extract references for academic papers
            references = []
            if doc_type == "academic_paper":
                references = extract_references(txt)
                stats.references_extracted += len(references)
            
            # 7. Detect language if content is available
            language = "en"  # Default to English
            if txt:
                language = detect_language(txt)
            
            # 8. Create enhanced document object
            pdf_doc = PDFDocument(
                file_path=rel_path,
                full_text=txt,
                metadata=pdf_data.get("metadata", {}) if 'pdf_data' in locals() else {},
                structure=structure,
                tables=tables,
                references=references,
                document_type=doc_type,
                page_count=pdf_data.get("page_count", 0) if 'pdf_data' in locals() else 0,
                has_scanned_content=doc_type == "scan",
                ocr_applied=doc_type == "scan",
                ocr_confidence=confidence if 'confidence' in locals() else 0.0,
                language=language
            )
            
            # 9. Calculate content hash
            pdf_doc.calculate_hash()
            doc_hash = pdf_doc.content_hash
            
            # 10. Use intelligent chunking based on structure
            enhanced_chunks = chunk_document_intelligently(pdf_doc, max_chunk_size, overlap)
            stats.total_chunks += len(enhanced_chunks)
            
            # 11. Create DocData objects with enriched metadata
            docdatas = []
            sec_name = extract_section_name(file_path)
            
            # Generate stop words hash for tag generation
            stop_hash = hashlib.md5(str(sorted(stop_words)).encode()).hexdigest()
            
            for i, chunk in enumerate(enhanced_chunks):
                # Create a unique label for each chunk
                if len(enhanced_chunks) == 1:
                    label = sec_name
                else:
                    # Use section information if available
                    if chunk.get("metadata", {}).get("sections") and i > 0:
                        section = chunk["metadata"]["sections"][0]
                        label = f"{sec_name}: {section}"
                    else:
                        label = f"{sec_name}_Part_{i+1}"
                
                # Generate enriched tags with document type
                tags = generate_smart_tags(
                    sec_name, 
                    chunk["content"], 
                    stop_hash, 
                    file_path,
                    doc_type,
                    language
                )
                
                # Create additional metadata
                metadata = {
                    "document_type": doc_type,
                    "language": language,
                    "pdf_metadata": pdf_data.get("metadata", {}) if 'pdf_data' in locals() else {},
                    "has_tables": len(tables) > 0,
                    "tables_count": len(tables),
                    "references_count": len(references),
                    "page_count": pdf_doc.page_count,
                    "chunk_index": i,
                    "total_chunks": len(enhanced_chunks),
                    "ocr_applied": pdf_doc.ocr_applied,
                    "ocr_confidence": pdf_doc.ocr_confidence if pdf_doc.ocr_applied else None,
                    "processing_time": time.time() - start_time
                }
                
                # Add section information if available
                if "metadata" in chunk:
                    metadata.update(chunk["metadata"])
                
                # Create the DocData object
                dd = DocData(
                    section_name=label,
                    content=chunk["content"],
                    file_path=rel_path,
                    file_size=fsize,
                    last_modified=modtime,
                    tags=list(tags),
                    is_chunked=(len(enhanced_chunks) > 1),
                    content_hash=doc_hash,
                    metadata=metadata,
                    document_type=doc_type,
                    language=language,
                    chunk_index=i,
                    total_chunks=len(enhanced_chunks),
                    confidence_score=pdf_doc.ocr_confidence if pdf_doc.ocr_applied else 1.0
                )
                docdatas.append(dd)
            
            # Update statistics
            stats.processed_files += 1
            stats.total_bytes += len(txt.encode("utf-8"))
            stats.total_processing_time += (time.time() - start_time)
            
            logger.info(f"Processed PDF in {time.time() - start_time:.2f}s: {len(docdatas)} chunks, {len(tables)} tables, {len(references)} references")
            
            if progress_callback:
                progress_callback(stats.processed_files, stats.total_files, "processing")
            
            return (primary_lib, docdatas)
        except ProcessTimeoutError:
            logger.error(f"Timeout processing PDF file: {file_path}")
            stats.error_files += 1
            return None
        except Exception as e:
            logger.error(f"Enhanced PDF processing failed for {file_path}: {e}")
            logger.debug(f"Falling back to basic processing for {file_path}")
            # Fall back to basic processing instead of returning None
    
    # Standard processing for non-PDF files or fallback for PDF
    try:
        # Check for timeout before doing expensive operations
        if time.time() - start_time > timeout:
            stats.error_files += 1
            raise ProcessTimeoutError(f"Timeout before processing file: {file_path}")
            
        # Read text content
        txt = read_file_text(file_path)
        if not txt:
            stats.error_files += 1
            return None

        # Update stats
        stats.total_bytes += len(txt.encode("utf-8"))
        
        # Calculate content hash
        doc_hash = hashlib.md5(txt.encode("utf-8")).hexdigest()
        
        # Detect language
        language = detect_language(txt)
        
        # Get section name
        sec_name = extract_section_name(file_path)

        # Chunk the text
        chunks = chunk_text_by_words(txt, max_chunk_size, overlap)
        stats.total_chunks += len(chunks)

        # Generate DocData objects
        docdatas = []
        total_chunks = len(chunks)
        stop_hash = hashlib.md5(str(sorted(stop_words)).encode()).hexdigest()

        for i, chunk in enumerate(chunks, start=1):
            # Check for timeout
            if time.time() - start_time > timeout:
                stats.error_files += 1
                raise ProcessTimeoutError(f"Timeout during chunking for {file_path}")
                
            label = sec_name if total_chunks == 1 else f"{sec_name}_Part_{i}"
            tags = generate_smart_tags(sec_name, chunk, stop_hash, file_path, "general", language)
            
            # Extract file type specific metadata
            ext = Path(file_path).suffix.lower()
            metadata = {
                "file_type": ext[1:] if ext else "unknown",
                "language": language,
                "chunk_index": i-1,
                "total_chunks": total_chunks,
                "processing_time": time.time() - start_time
            }
            
            dd = DocData(
                section_name=label,
                content=chunk,
                file_path=rel_path,
                file_size=fsize,
                last_modified=modtime,
                tags=list(tags),
                is_chunked=(total_chunks > 1),
                content_hash=doc_hash,
                metadata=metadata,
                language=language,
                chunk_index=i-1,
                total_chunks=total_chunks
            )
            docdatas.append(dd)

        stats.processed_files += 1
        stats.total_processing_time += (time.time() - start_time)
        
        if progress_callback:
            progress_callback(stats.processed_files, stats.total_files, "processing")

        return (primary_lib, docdatas)
    except ProcessTimeoutError:
        logger.error(f"Timeout processing file: {file_path}")
        stats.error_files += 1
        return None
    except Exception as e:
        logger.error(f"Error processing {file_path}: {e}")
        stats.error_files += 1
        return None

def safe_process(
    path: Path,
    root_directory: str,
    max_chunk_size: int,
    stop_words: Set[str],
    include_binary_detection: bool,
    stats: FileStats,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
    max_file_size: int = MAX_FILE_SIZE,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Optional[Tuple[str, List[DocData]]]:
    """
    Wrapper for process_file to catch errors gracefully.
    
    Args:
        path: Path to the file
        root_directory: Root directory
        max_chunk_size: Maximum chunk size
        stop_words: Words to ignore for tags
        include_binary_detection: Whether to detect binary files
        stats: Statistics object
        overlap: Chunk overlap size
        max_file_size: Maximum file size
        timeout: Processing timeout
        progress_callback: Progress callback function
        
    Returns:
        Tuple of (primary_library, list_of_docdata) or None if processing failed
    """
    file_path = str(path)
    
    try:
        # File size check
        file_size = path.stat().st_size
        if file_size > max_file_size:
            logging.info(f"Skipping large file: {path} ({file_size} bytes)")
            stats.skipped_files += 1
            return None
        
        # Set up timeout handling
        processing_cancelled = threading.Event()
        timeout_thread = None
        
        if timeout > 0:
            def cancel_after_timeout():
                processing_cancelled.set()
            
            timeout_thread = threading.Timer(timeout, cancel_after_timeout)
            timeout_thread.daemon = True
            timeout_thread.start()
        
        start_time = time.time()
        
        # Basic file processing logic would go here
        # In a real implementation, you would actually process the file
        # For this example, we'll just create a simple DocData object
        
        # Check for cancellation
        if processing_cancelled.is_set():
            stats.error_files += 1
            logging.warning(f"Processing timed out for {file_path}")
            raise ProcessTimeoutError(f"Processing timed out after {timeout}s")
        
        # Get relative path
        try:
            rel_path = os.path.relpath(path, root_directory)
        except ValueError:
            # Handle case where paths are on different drives
            rel_path = str(path)
        
        # Simple content reading with error handling
        try:
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as read_err:
            logging.warning(f"Error reading {file_path}: {read_err}, trying binary mode")
            try:
                with open(path, 'rb') as f:
                    binary_content = f.read()
                    # Check if file is likely binary
                    if include_binary_detection and b'\0' in binary_content[:1024]:
                        stats.binary_files += 1
                        stats.skipped_files += 1
                        logging.info(f"Skipping binary file: {file_path}")
                        return None
                    # Try to decode with a fallback
                    content = binary_content.decode('utf-8', errors='replace')
            except Exception as bin_err:
                logging.error(f"Error reading file in binary mode {file_path}: {bin_err}")
                stats.error_files += 1
                return None
        
        # Extract the library name from path
        primary_lib = Path(rel_path).parts[0] if len(Path(rel_path).parts) > 0 else "root"
        
        # Extract some basic metadata
        file_info = path.stat()
        metadata = {
            "file_name": path.name,
            "file_path": str(path),
            "file_size": file_info.st_size,
            "file_extension": path.suffix.lower(),
            "last_modified": datetime.fromtimestamp(file_info.st_mtime).isoformat(),
            "relative_path": rel_path
        }
        
        # Simple chunking
        chunks = []
        for i in range(0, len(content), max_chunk_size - overlap):
            chunk = content[i:i + max_chunk_size]
            chunks.append(chunk)
            stats.total_chunks += 1
        
        # Create DocData object
        docdata = DocData(
            section_name=os.path.basename(str(path)),
            content=content,
            file_path=str(path),
            file_size=file_info.st_size,
            last_modified=datetime.fromtimestamp(file_info.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            tags=list(set()) if isinstance(set(), set) else [],
            metadata=metadata
        )
        # Set chunks as an attribute
        docdata.chunks = chunks
        docdata.relative_path = rel_path
        
        # Update statistics
        stats.processed_files += 1
        stats.total_bytes += file_info.st_size
        stats.total_processing_time += (time.time() - start_time)
        
        if progress_callback:
            progress_callback(stats.processed_files, stats.total_files, "processing")
        
        return (primary_lib, [docdata])
    except ProcessTimeoutError:
        logging.error(f"Timeout processing file: {file_path}")
        stats.error_files += 1
        return None
    except Exception as e:
        logging.error(f"Error processing {file_path}: {e}")
        stats.error_files += 1
        return None
    finally:
        # Clean up timeout thread if it exists
        if timeout_thread and timeout_thread.is_alive():
            timeout_thread.cancel()


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
    stats_obj = None,  # Remove the type annotation to avoid circular import
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
    # Safely use setup_logging function
    if 'setup_logging' in globals():
        logger = setup_logging(log_level, log_file)
    else:
        # Fallback if setup_logging not available
        logger = logging.getLogger("file_processor")
        logger.setLevel(log_level)
        # Add a handler if necessary
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
            logger.addHandler(handler)
            # Add file handler if specified
            if log_file:
                file_handler = logging.FileHandler(log_file)
                file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
                logger.addHandler(file_handler)
    
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
    
    # Set total_files to the actual discovered count
    stats.total_files = len(all_files)
    
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
                    try:
                        out = fut.result()
                        if out:
                            results.append((pth, out))
                        else:
                            # Track processing failure
                            processing_failures.append({
                                "file_path": str(pth),
                                "reason": "processing_failed"
                            })
                    except Exception as fut_err:
                        # Handle exceptions from future
                        logger.error(f"Error in future for {pth}: {fut_err}")
                        processing_failures.append({
                            "file_path": str(pth),
                            "reason": f"future_error: {str(fut_err)}"
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
                
            # Use the enhanced safe JSON writer
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


# -----------------------------------------------------------------------------
# UTILITY CLASSES
# -----------------------------------------------------------------------------
class TimingContext:
    """Context manager for timing execution and logging duration"""
    def __init__(self, name: str):
        self.name = name
        self.start_time = None
        
    def __enter__(self):
        self.start_time = time.time()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        logger.debug(f"{self.name} completed in {duration:.2f} seconds")
        return False  # Don't suppress exceptions

class CustomJSONEncoder(json.JSONEncoder):
    """
    Custom JSON encoder that handles large text content safely.
    
    This encoder:
    1. Properly handles datetime objects
    2. Handles byte arrays with proper encoding detection
    3. Has special handling for DocData objects
    4. Provides fallbacks for non-serializable objects
    5. Can handle very large string content with memory efficiency
    6. Handles sets, tuples, and other Python-specific types
    """
    def default(self, obj):
        # Handle datetime objects
        if isinstance(obj, datetime):
            return obj.isoformat()
            
        # Handle byte arrays with encoding detection
        if isinstance(obj, bytes):
            try:
                # Try utf-8 first
                return obj.decode('utf-8')
            except UnicodeDecodeError:
                # Try other encodings
                for encoding in ['latin-1', 'cp1252', 'utf-16']:
                    try:
                        return obj.decode(encoding)
                    except UnicodeDecodeError:
                        continue
                # Fall back to printable ASCII representation if all else fails
                return ''.join(chr(c) if 32 <= c < 127 else f'\\x{c:02x}' for c in obj)
        
        # Handle DocData objects with special handling for content
        if hasattr(obj, 'to_dict') and callable(obj.to_dict):
            return obj.to_dict()
        
        # Handle sets by converting to lists
        if isinstance(obj, set):
            return list(obj)
            
        # Handle tuples by converting to lists
        if isinstance(obj, tuple):
            return list(obj)
            
        # Handle numpy arrays if present
        if 'numpy' in sys.modules and hasattr(sys.modules['numpy'], 'ndarray'):
            if isinstance(obj, sys.modules['numpy'].ndarray):
                return obj.tolist()
        
        # Handle Path objects
        if isinstance(obj, Path):
            return str(obj)
            
        # Default handling
        try:
            return super().default(obj)
        except TypeError:
            # Fallback for non-serializable objects
            return str(obj)
            
    def iterencode(self, obj, _one_shot=False):
        """
        Overriden iterencode to handle large string content more efficiently.
        Special handling for DocData objects to process content fields in chunks.
        """
        # Special handling for very large strings
        if isinstance(obj, str) and len(obj) > 50000:
            # For large strings, handle them in chunks
            yield '"'
            # Process string in chunks to avoid memory issues
            chunk_size = 16384  # 16KB chunks
            for i in range(0, len(obj), chunk_size):
                chunk = obj[i:i+chunk_size]
                # Escape backslashes and quotes
                chunk = chunk.replace('\\', '\\\\').replace('"', '\\"')
                # Replace newlines and carriage returns
                chunk = chunk.replace('\n', '\\n').replace('\r', '\\r')
                # Replace control characters
                chunk = re.sub(r'[\x00-\x1f]', lambda m: f'\\u{ord(m.group(0)):04x}', chunk)
                yield chunk
            yield '"'
        # Special handling for dictionaries that contain large content fields
        elif isinstance(obj, dict) and "content" in obj and isinstance(obj["content"], str) and len(obj["content"]) > 50000:
            # Start the object
            yield '{'
            
            first = True
            # Process all fields except content first
            for key, value in obj.items():
                if key != "content":
                    if first:
                        first = False
                    else:
                        yield ','
                    
                    # Handle the key
                    yield f'"{key}":'
                    
                    # Handle the value using the parent class implementation
                    for chunk in super().iterencode(value, _one_shot):
                        yield chunk
            
            # Now handle the content field
            if not first:
                yield ','
                
            yield '"content":'
            
            # Large content handling
            content = obj["content"]
            yield '"'
            
            # Process content in chunks for memory efficiency
            chunk_size = 16384  # 16KB chunks
            for i in range(0, len(content), chunk_size):
                chunk = content[i:i+chunk_size]
                # Escape backslashes and quotes
                chunk = chunk.replace('\\', '\\\\').replace('"', '\\"')
                # Replace newlines and carriage returns
                chunk = chunk.replace('\n', '\\n').replace('\r', '\\r')
                # Replace control characters
                chunk = re.sub(r'[\x00-\x1f]', lambda m: f'\\u{ord(m.group(0)):04x}', chunk)
                yield chunk
                
            yield '"'
            
            # Close the object
            yield '}'
        else:
            # For all other objects, use standard encoding
            for chunk in super().iterencode(obj, _one_shot):
                yield chunk
                
class ProcessingTask:
    """
    Task object for file processing with enhanced monitoring,
    progress reporting, and error handling capabilities.
    """
    def __init__(self, task_id, input_dir, output_file):
        self.task_id = task_id
        self.input_dir = input_dir
        self.output_file = output_file
        self.status = "pending"
        self.progress = 0
        self.error = None
        self.stats = {}
        self.thread = None
        self.start_time = time.time()
        self.last_update_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds between Socket.IO updates
        self._is_cancelled = False  # Flag for cancellation detection
        
    def start(self):
        """Start the processing task in a background thread."""
        self.status = "processing"
        self.thread = threading.Thread(target=self._process, daemon=True)
        self.thread.start()
    
    def _process(self):
        """Process the files in the input directory."""
        try:
            # Check if structify module is available
            if 'structify_module' not in globals() or structify_module is None:
                raise ImportError("Claude module not available for processing")
            
            # Validate input directory thoroughly
            if not os.path.exists(self.input_dir):
                raise ValueError(f"Input directory does not exist: {self.input_dir}")
            if not os.path.isdir(self.input_dir):
                raise ValueError(f"Input path is not a directory: {self.input_dir}")
                
            # Ensure parent directory for output file exists
            output_dir = os.path.dirname(self.output_file)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
                logger.info(f"Created output directory: {output_dir}")

            # Custom progress callback function with rate limiting for UI updates
            def progress_callback(current, total, stage):
                # Check for cancellation
                if self._is_cancelled:
                    logger.info(f"Task {self.task_id} was cancelled during processing")
                    raise InterruptedError("Task was cancelled")
                    
                # Calculate progress percentage
                self.progress = min(int((current / max(1, total)) * 100), 99)
                # Log progress at debug level
                logger.debug(f"Progress: {self.progress}% - {stage}")
                
                # Emit progress update with rate limiting
                now = time.time()
                if (now - self.last_emit_time) > self.emit_interval:
                    self.emit_progress_update(stage)
                    self.last_emit_time = now
            
            # Process the files with optimized parameters
            result = process_all_files(
                root_directory=self.input_dir,
                output_file=self.output_file,
                max_chunk_size=4096,
                executor_type="thread",
                max_workers=None,  # Auto-determine based on CPU count
                stop_words=DEFAULT_STOP_WORDS,
                use_cache=False,
                valid_extensions=DEFAULT_VALID_EXTENSIONS,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True,
                progress_callback=progress_callback
            )
            
            # Update status and stats
            self.status = "completed"
            self.progress = 100
            self.stats = result.get("stats", {})
            
            # Add additional stats
            self.stats.update({
                "processing_time": time.time() - self.start_time,
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "input_directory": self.input_dir,
                "output_file": self.output_file
            })
            
            # Final progress update
            self.emit_progress_update("completed")
            
            # Emit task completion event
            try:
                if 'socketio' in globals():
                    socketio.emit("task_completed", {
                        "task_id": self.task_id,
                        "status": "completed",
                        "stats": self.stats,
                        "output_file": self.output_file
                    })
            except Exception as socket_err:
                logger.debug(f"Socket.IO completion event emission failed: {socket_err}")
            
            logger.info(f"Processing task {self.task_id} completed successfully")
            
        except ImportError as e:
            logger.error(f"Module import error in task {self.task_id}: {e}", exc_info=True)
            self.status = "failed"
            self.error = f"Module import error: {str(e)}"
            
        except ValueError as e:
            logger.error(f"Input validation error in task {self.task_id}: {e}", exc_info=True)
            self.status = "failed"
            self.error = f"Input validation error: {str(e)}"
            
        except InterruptedError as e:
            logger.info(f"Task {self.task_id} was cancelled: {e}")
            self.status = "cancelled"
            self.error = str(e)
            
        except Exception as e:
            logger.error(f"Error in processing task {self.task_id}: {e}", exc_info=True)
            self.status = "failed"
            self.error = str(e)
            
        finally:
            # Emit error event if there was an error
            if self.error and self.status != "cancelled":
                try:
                    if 'socketio' in globals():
                        socketio.emit("task_error", {
                            "task_id": self.task_id,
                            "error": self.error
                        })
                except Exception as socket_err:
                    logger.debug(f"Socket.IO error event emission failed: {socket_err}")
                    
            # Remove task from active tasks when finished (success or failure)
            try:
                if 'remove_task' in globals():
                    remove_task(self.task_id)
            except Exception as e:
                logger.debug(f"Error removing task from active tasks: {e}")
    
    def emit_progress_update(self, stage="processing"):
        """Emit a progress update via Socket.IO."""
        try:
            if 'socketio' in globals():
                socketio.emit("progress_update", {
                    "task_id": self.task_id,
                    "progress": self.progress,
                    "status": self.status,
                    "message": f"{stage.capitalize()}: {self.progress}%",
                    "stats": self.stats,
                    "elapsed_time": time.time() - self.start_time
                })
        except Exception as e:
            logger.debug(f"Socket.IO event emission failed: {e}")
    
    def cancel(self):
        """
        Cancel the running task.
        Returns True if successfully cancelled, False otherwise.
        """
        if self.thread and self.thread.is_alive():
            # Set cancellation flag
            self._is_cancelled = True
            self.status = "cancelling"
            
            try:
                if 'socketio' in globals():
                    socketio.emit("task_cancelling", {
                        "task_id": self.task_id,
                        "message": "Task cancellation requested"
                    })
            except Exception as e:
                logger.debug(f"Socket.IO cancel event emission failed: {e}")
                
            logger.info(f"Task {self.task_id} cancellation requested")
            return True
        return False
    
    def get_status(self):
        """
        Get the full status of the task.
        Returns a dictionary with all task details.
        """
        return {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "input_dir": self.input_dir,
            "output_file": self.output_file,
            "stats": self.stats,
            "error": self.error,
            "elapsed_time": time.time() - self.start_time,
            "is_running": self.thread.is_alive() if self.thread else False,
            "is_cancelled": self._is_cancelled
        }
    
    def get_estimated_time(self):
        """
        Calculate estimated time to completion based on current progress.
        
        Returns:
            float: Estimated seconds remaining or None if not enough data
        """
        if self.progress <= 0 or self.progress >= 100:
            return None
            
        elapsed = time.time() - self.start_time
        if elapsed < 1:
            return None
            
        # Calculate time per percentage point
        time_per_percent = elapsed / self.progress
        
        # Estimate remaining time
        remaining_percent = 100 - self.progress
        return time_per_percent * remaining_percent
    



def read_file_text(file_path: str, memory_limit: int = DEFAULT_MEMORY_LIMIT) -> str:
    """
    Read text from a file with enhanced error handling and format detection.
    
    Args:
        file_path: Path to the file
        memory_limit: Maximum memory to use for file reading
        
    Returns:
        Extracted text content
    """
    # Special handling for PDF files
    if file_path.lower().endswith(".pdf"):
        pdf_data = extract_text_from_pdf(file_path)
        return pdf_data.get("full_text", "")

    # Check file size to adapt reading strategy
    try:
        size = os.path.getsize(file_path)
        if size > memory_limit:
            logger.warning(f"File {file_path} exceeds memory limit ({size} bytes). Using streamed reading.")
            return read_large_file(file_path)
    except OSError:
        logger.error(f"Unable to get file size for {file_path}")
        return ""

    # Handle small files with direct reading
    if size < 1024 * 1024:  # 1MB
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading small file {file_path}: {e}")
            try:
                # Try binary mode with decoding
                with open(file_path, "rb") as f:
                    content = f.read()
                    # Try multiple encodings
                    for encoding in ['utf-8', 'latin-1', 'cp1252', 'utf-16']:
                        try:
                            return content.decode(encoding)
                        except UnicodeDecodeError:
                            continue
                    # If all else fails, use replace for any decoding errors
                    return content.decode('utf-8', errors='replace')
            except Exception:
                return ""

    # For larger files, use buffered reading with multiple encoding attempts
    return read_large_file(file_path)

def read_large_file(file_path: str) -> str:
    """
    Read a large text file in chunks to avoid memory issues.
    
    Args:
        file_path: Path to the file
        
    Returns:
        File content as text
    """
    possible_encs = ["utf-8", "latin-1", "cp1252", "utf-16"]
    buffer_size = 1024 * 1024  # 1MB buffer
    content_parts = []
    
    for enc in possible_encs:
        try:
            content_parts = []
            with open(file_path, "r", encoding=enc, errors="replace") as f:
                while True:
                    chunk = f.read(buffer_size)
                    if not chunk:
                        break
                    content_parts.append(chunk)
            # Successfully read the file with this encoding
            return "".join(content_parts)
        except Exception:
            continue

    logger.error(f"Failed reading {file_path} with encodings {possible_encs}")
    return ""

@lru_cache(maxsize=256)
def generate_smart_tags(
    section_name: str,
    content: str,
    stop_words_hash: str,
    file_path: str,
    doc_type: str = "general",
    language: str = "en"
) -> Tuple[str, ...]:
    """
    Generate smart tags based on content analysis with enhanced PDF support.
    
    Args:
        section_name: Name of the document section
        content: Text content to analyze
        stop_words_hash: Hash of stop words (for cache invalidation)
        file_path: Path to the source file
        doc_type: Document type for PDF files
        language: Detected language code
        
    Returns:
        Tuple of generated tags
    """
    ext = Path(file_path).suffix.lower()
    base_tags = [section_name.lower()]
    if ext:
        base_tags.append(ext[1:])
    
    # Add document type for PDFs
    if ext == ".pdf" and doc_type != "general":
        base_tags.append(f"type:{doc_type}")
    
    # Add language tag if not English
    if language != "en":
        base_tags.append(f"lang:{language}")

    # Get keywords specific to this file type
    file_specific_kw = FILE_TYPE_KEYWORDS.get(ext, DEFAULT_KEYWORDS)

    # For very large content, sample from beginning, middle, and end
    if len(content) > 50_000:
        chunk = content[:15_000] + content[len(content)//2 - 7_500 : len(content)//2 + 7_500] + content[-15_000:]
    else:
        chunk = content
        
    lowered = chunk.lower()

    # Extract domain-specific keywords that appear in the content
    found_kws = {kw for kw in file_specific_kw if f" {kw} " in f" {lowered} " or f"\n{kw} " in f"\n{lowered} "}
    
    # Extract word frequency
    tokens = WORD_PATTERN.findall(lowered)
    freq = Counter(tokens)
    
    # Extend stop words with programming keywords
    all_stop = PROGRAMMING_STOP_WORDS.copy()
    
    # Extract most frequent meaningful terms
    freq_tags = set()
    for w, c in freq.most_common(30):  # Consider more terms for better coverage
        if len(w) > 2 and c > 1 and not w.isdigit() and w not in found_kws and w not in all_stop:
            freq_tags.add(w)
            if len(freq_tags) >= 15:  # Keep more tags for better context
                break

    # Special processing for PDF files - look for key indicators
    if ext == ".pdf":
        # Look for citation patterns
        citations = re.findall(r'\(\w+\s+et\s+al\.,?\s+\d{4}\)|\[\d+\]', lowered)
        if len(citations) > 3:
            found_kws.add("citations")
            
        # Look for mathematical content
        math_patterns = re.findall(r'[\$\\\[\]\(\)\{\}]+|\b[a-z]_[a-z0-9]|\b\d+\.\d+e[+-]\d+', lowered)
        if len(math_patterns) > 10:
            found_kws.add("mathematics")
            
        # Look for algorithm descriptions
        algo_patterns = re.findall(r'\balgorithm\b|\bprocedure\b|\bfunction\b|\binput\b|\boutput\b|\breturn\b', lowered)
        if len(algo_patterns) > 5:
            found_kws.add("algorithm")
            
        # Look for code listings
        code_patterns = re.findall(r'```|def\s+\w+\(|class\s+\w+[\(:]|\bfunction\s+\w+\(', lowered)
        if len(code_patterns) > 3:
            found_kws.add("code")
            
        # Check for research-specific terms
        research_patterns = ['methodology', 'hypothesis', 'experiment', 'statistical', 'significance', 'p-value']
        if sum(1 for term in research_patterns if term in lowered) >= 3:
            found_kws.add("research")

    # Combine all tag sources and sort for consistent output
    combined = set(base_tags) | found_kws | freq_tags
    return tuple(sorted(combined))


# -----------------------------------------------------------------------------
# CORE FILE PROCESSING FUNCTIONS
# -----------------------------------------------------------------------------
def process_file_for_api(
    file_path: str,
    output_format: str = "json",
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    extract_tables: bool = True,
    use_ocr: bool = True
) -> Dict[str, Any]:
    """
    Process a file and return data in a format suitable for API responses.
    Uses pdf_extractor for PDFs when available.
    """
    try:
        # Check if file exists
        if not os.path.isfile(file_path):
            return {"status": "error", "error": f"File not found: {file_path}"}
            
        # Process based on file type
        if file_path.lower().endswith('.pdf'):
            # Use pdf_extractor for PDFs if available
            if pdf_extractor_available:
                try:
                    result = pdf_extractor.process_pdf(
                        pdf_path=file_path, 
                        output_path=None,  # Don't write to disk
                        max_chunk_size=max_chunk_size,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True
                    )
                    
                    # Format output according to requested format
                    if output_format == "text" and result:
                        # Extract just the text content
                        if "full_text" in result:
                            return {
                                "status": "success",
                                "text": result["full_text"],
                                "metadata": result.get("metadata", {})
                            }
                        else:
                            return {
                                "status": "success",
                                "text": "\n\n".join(doc.get("content", "") for doc in result.get("docs_data", [])),
                                "metadata": result.get("metadata", {})
                            }
                    else:
                        # Return full JSON data
                        return {
                            "status": "success",
                            "data": result
                        }
                except Exception as e:
                    logger.error(f"pdf_extractor processing failed: {e}. Falling back to built-in method.")
            
            # Fallback to built-in processing for PDFs
            data = process_pdf(
                file_path, 
                output_path=None,  # Don't write to disk
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                return_data=True
            )
        else:
            data = process_document(
                file_path,
                output_path=None,  # Don't write to disk
                max_chunk_size=max_chunk_size,
                return_data=True
            )
            
        if not data:
            return {"status": "error", "error": "Processing failed"}
            
        if "error" in data:
            return {"status": "error", "error": data["error"]}
        
        # Format output according to requested format
        if output_format == "text":
            # Return just the text content
            chunks = [doc.get("content", "") for doc in data.get("docs_data", [])]
            return {
                "status": "success",
                "text": "\n\n".join(chunks),
                "metadata": data.get("metadata", {})
            }
        else:
            # Return full JSON data
            return {
                "status": "success",
                "data": data
            }
            
    except Exception as e:
        logger.error(f"API processing error for {file_path}: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}

if __name__ == "__main__":
    # Run configuration check and wizard if needed
    if not os.environ.get("SKIP_CONFIG_CHECK"):
        config_ok = verify_system_configuration()
        if config_ok["overall_status"] != "ok":
            if os.environ.get("AUTO_FIX_CONFIG") == "1":
                run_configuration_wizard()
            else:
                logger.warning("System configuration issues detected. Run with AUTO_FIX_CONFIG=1 to fix automatically.")    # Initialize all dependencies properly
    dependencies = initialize_dependencies()
    logger.info(f"Dependency initialization complete: {dependencies}")

    try:
        apply_enhanced_output_formatting()
    except Exception as e:
        print(f"Error applying enhanced output formatting: {e}")    
    # Start the server
    try:
        socketio.run(app, debug=args.debug, host=args.host, port=int(args.port))
    except Exception as e:
        logger.error(f"Server failed to start: {e}")
        sys.exit(1)