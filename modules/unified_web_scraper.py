import os
import re
import sys
import json
import time
import hashlib
import logging
import requests
import tempfile
import traceback
import threading
import queue
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple, Set, Any, Union, Callable
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import uuid

# -----------------------------------------------------------------------------
# Logging Setup - Enhanced for better debugging
# -----------------------------------------------------------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Add console handler if none exists
if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(console_handler)
    
    # Add file handler for persistent logging
    try:
        log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web_scraper.log")
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(file_handler)
    except (PermissionError, IOError) as e:
        logger.warning(f"Could not create log file: {e}")

# Import structify_module and components with proper error handling
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    FileStats = components.get('FileStats')
    ProcessingTask = components.get('ProcessingTask')
    process_all_files = components.get('process_all_files')

    if structify_module:
        logger.info("Claude module is available for processing")
    else:
        logger.warning("Claude module not available")
except ImportError as e:
    logger.warning(f"Failed to import structify module: {e}")
    structify_module = None
    components = {}
    FileStats = None
    ProcessingTask = None
    process_all_files = None

# Try to import PDF extractor with proper error handling
try:
    from pdf_extractor import (
        process_pdf, 
        extract_tables_from_pdf, 
        detect_document_type
    )
    pdf_extractor_available = True
    logger.info("PDF extractor module is available")
except ImportError as e:
    logger.warning(f"PDF extractor module not available: {e}")
    pdf_extractor_available = False
    # Create stub functions to prevent errors
    def process_pdf(*args, **kwargs):
        logger.error("PDF extractor not available but process_pdf was called")
        return {"error": "PDF extractor module not available"}
    
    def extract_tables_from_pdf(*args, **kwargs):
        logger.error("PDF extractor not available but extract_tables_from_pdf was called")
        return []
    
    def detect_document_type(*args, **kwargs):
        logger.error("PDF extractor not available but detect_document_type was called")
        return "unknown"

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
# Use environment variables or fall back to default paths
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER", 
                                      os.path.join(os.path.expanduser("~"), "Documents", "NeuroGen"))
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", "5"))
DEFAULT_TIMEOUT = int(os.environ.get("PDF_DOWNLOAD_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("PDF_MAX_RETRIES", "3"))
BACKOFF_FACTOR = float(os.environ.get("PDF_BACKOFF_FACTOR", "0.5"))
MAX_DOWNLOAD_SIZE = int(os.environ.get("MAX_DOWNLOAD_SIZE", "100")) * 1024 * 1024  # Default: 100MB

# Custom User-Agent to avoid bot detection
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": "1"  # Do Not Track
}

socketio = None

def init_socketio(socket_instance):
    """Initialize Socket.IO for real-time updates"""
    global socketio
    socketio = socket_instance

# -----------------------------------------------------------------------------
# Error Handling
# -----------------------------------------------------------------------------
class RetryableError(Exception):
    """Error that can be retried"""
    pass

class ErrorHandler:
    """
    Enhanced error handling with classification and recovery strategies.
    """
    @staticmethod
    def classify_error(error):
        """
        Classify an error to determine appropriate handling.
        
        Args:
            error: The error to classify
            
        Returns:
            Dictionary with error classification
        """
        error_str = str(error).lower()
        error_type = type(error).__name__
        
        # Classify based on error message content
        if "memory" in error_str or "allocation" in error_str:
            category = "memory"
            retryable = True
            recovery = "reduce_memory_usage"
        elif "timeout" in error_str or "timed out" in error_str:
            category = "timeout"
            retryable = True
            recovery = "increase_timeout"
        elif "permission" in error_str or "access" in error_str:
            category = "permissions"
            retryable = False
            recovery = "check_permissions"
        elif "network" in error_str or "connection" in error_str or "connectaborted" in error_type.lower():
            category = "network"
            retryable = True
            recovery = "retry_with_backoff"
        elif "not found" in error_str or "no such file" in error_str or "404" in error_str:
            category = "not_found"
            retryable = False
            recovery = "check_path"
        elif "corrupt" in error_str or "invalid" in error_str:
            category = "corrupt_file"
            retryable = False
            recovery = "repair_file"
        else:
            category = "general"
            retryable = isinstance(error, RetryableError)
            recovery = None
        
        return {
            "error_type": error_type,
            "category": category,
            "retryable": retryable,
            "recovery_strategy": recovery
        }
    
    @staticmethod
    def retry_with_backoff(func, max_attempts=3, base_delay=1.0, jitter=True):
        """
        Retry a function with exponential backoff.
        
        Args:
            func: Function to call
            max_attempts: Maximum number of retry attempts
            base_delay: Base delay between retries in seconds
            jitter: Whether to add random jitter to delay
            
        Returns:
            Function result or raises the last error
        """
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                return func()
            except Exception as e:
                last_error = e
                
                # Classify the error
                classification = ErrorHandler.classify_error(e)
                
                # Only retry if error is classified as retryable
                if classification["retryable"] and attempt < max_attempts - 1:
                    # Calculate delay with exponential backoff
                    delay = base_delay * (2 ** attempt)
                    
                    # Add jitter if requested (10% randomness)
                    if jitter:
                        import random
                        delay *= (0.9 + 0.2 * random.random())
                    
                    logger.info(f"Retrying after error: {e} (attempt {attempt+1}/{max_attempts}, delay: {delay:.2f}s)")
                    time.sleep(delay)
                else:
                    # Not retryable or last attempt
                    raise
        
        # This should not normally be reached due to the raise in the loop
        if last_error:
            raise last_error
        return None

# -----------------------------------------------------------------------------
# File Path Utility
# -----------------------------------------------------------------------------
class FilePathUtility:
    """
    Utility for file path operations with enhanced security and validation.
    """
    @staticmethod
    def get_output_filepath(output_filename, folder_override=None):
        """
        Ensure output file is saved to the correct directory.
        
        Args:
            output_filename: The desired output filename (with or without extension)
            folder_override: Override the default folder
        
        Returns:
            Absolute path to the properly named output file
        """
        # Handle empty filename
        if not output_filename:
            output_filename = f"output_{int(time.time())}"
        
        # Strip .json extension if provided
        if output_filename.lower().endswith('.json'):
            output_filename = output_filename[:-5]
        
        # Sanitize the filename
        sanitized_name = FilePathUtility.sanitize_filename(output_filename) + ".json"
        
        # Check if we have a full path in output_filename
        if os.path.dirname(output_filename):
            # User provided a path with the filename
            target_folder = os.path.dirname(output_filename)
            sanitized_name = FilePathUtility.sanitize_filename(os.path.basename(output_filename)) + ".json"
        else:
            # Use override folder or default to the DEFAULT_OUTPUT_FOLDER
            target_folder = folder_override or DEFAULT_OUTPUT_FOLDER
        
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
                target_folder = tempfile.gettempdir()
        
        # Construct and ensure the final path
        final_output_path = os.path.join(target_folder, sanitized_name)
        
        logger.info(f"Output file will be saved at: {final_output_path}")
        return final_output_path
        
    @staticmethod
    def sanitize_filename(filename):
        """
        Sanitize a filename by removing unsafe characters and limiting its length.
        
        Args:
            filename: The input filename to sanitize
            
        Returns:
            A sanitized version of the filename
        """
        # Replace unsafe characters with underscores
        sanitized = re.sub(r'[^\w\-. ]', '_', filename)
        
        # Remove leading/trailing periods and spaces
        sanitized = sanitized.strip('. ')
        
        # Limit length to 100 characters
        sanitized = sanitized[:100]
        
        # If the sanitization resulted in an empty string, use a default
        if not sanitized:
            sanitized = "untitled"
            
        return sanitized
    
    @staticmethod
    def verify_and_create_directory(path):
        """
        Verify if a directory exists, and create it if needed.
        
        Args:
            path: The directory path to verify/create
            
        Returns:
            Tuple of (success, message, path)
        """
        try:
            path = os.path.abspath(path)
            
            # Check if directory exists
            if os.path.isdir(path):
                return True, "Directory exists", path
                
            # Get parent directory
            parent = os.path.dirname(path)
            
            # If parent doesn't exist, fail
            if not os.path.isdir(parent):
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

# -----------------------------------------------------------------------------
# Requests Session with Retries
# -----------------------------------------------------------------------------
def create_session() -> requests.Session:
    """
    Create a requests session with retry capabilities.
    
    Returns:
        requests.Session: Configured session with retry strategy
    """
    session = requests.Session()
    
    retry_strategy = Retry(
        total=MAX_RETRIES,
        backoff_factor=BACKOFF_FACTOR,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"]
    )
    
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(HEADERS)
    
    return session

# Global session instance
session = create_session()

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------
def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename by removing unsafe characters and limiting its length.
    
    Args:
        filename (str): The input filename to sanitize
        
    Returns:
        str: A sanitized version of the filename
    """
    # Replace unsafe characters with underscores
    sanitized = re.sub(r'[^\w\-. ]', '_', filename)
    # Limit the length of the filename to prevent issues
    return sanitized[:100]

def emit_socket_event(event_name, data):
    """
    Try to emit a Socket.IO event if available.
    This provides real-time feedback to the UI without crashing if Socket.IO isn't available.
    
    Args:
        event_name (str): Name of the event to emit
        data (dict): Data to send with the event
    """
    # Use the global socketio instance if available
    global socketio
    
    try:
        if socketio:
            socketio.emit(event_name, data)
            logger.debug(f"Emitted {event_name} event: {data}")
            return True
        else:
            # Try to import from app module if available
            try:
                from app import socketio as app_socketio
                app_socketio.emit(event_name, data)
                logger.debug(f"Emitted {event_name} event using app.socketio")
                return True
            except (ImportError, AttributeError):
                logger.debug(f"Socket.IO not available for event emission")
                return False
    except Exception as e:
        logger.debug(f"Error emitting Socket.IO event: {e}")
        return False

def convert_arxiv_url(url: str) -> str:
    """
    Convert arXiv abstract URLs to PDF URLs if needed.
    
    Args:
        url (str): Original URL
        
    Returns:
        str: PDF URL
    """
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"):
            pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")
        return pdf_url
    return url

def verify_pdf_content(content: bytes, min_size: int = 1000) -> bool:
    """
    Verify that content is actually a PDF file by checking for PDF header
    and minimum file size.
    
    Args:
        content (bytes): The downloaded content
        min_size (int): Minimum file size in bytes
        
    Returns:
        bool: True if the content appears to be a valid PDF
    """
    # Check minimum size
    if len(content) < min_size:
        return False
        
    # Check for PDF magic number
    return content.startswith(b'%PDF-')

def generate_unique_filename(url: str, title: Optional[str] = None) -> str:
    """
    Generate a unique filename using a hash of the URL.
    Properly handles existing extensions to avoid double extensions.
    
    Args:
        url (str): The URL of the PDF
        title (str, optional): Document title if available
        
    Returns:
        str: Unique filename for the PDF
    """
    url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
    
    # If we have a title, use it for a more descriptive filename
    if title:
        sanitized_title = sanitize_filename(title)
        # Remove .pdf extension if it exists and add our own
        base_name = os.path.splitext(sanitized_title)[0]
        return f"{base_name}_{url_hash}.pdf"
    
    # Extract filename from URL if possible
    parsed_url = urlparse(url)
    path = parsed_url.path
    if path:
        filename = os.path.basename(path)
        # Remove .pdf extension if it exists and add our own with hash
        base_name = os.path.splitext(filename)[0]
        if base_name:
            sanitized_name = sanitize_filename(base_name)
            return f"{sanitized_name}_{url_hash}.pdf"
    
    # Default case
    return f"pdf_{url_hash}.pdf"

# -----------------------------------------------------------------------------
# Web Scraping Functions
# -----------------------------------------------------------------------------
def extract_html_text(url: str) -> str:
    """
    Extract text content from an HTML webpage.
    
    Args:
        url (str): The URL to extract text from
        
    Returns:
        str: The extracted text content
        
    Raises:
        ValueError: If the page can't be fetched or parsed
    """
    logger.info(f"Extracting HTML text from: {url}")
    try:
        # Set a longer timeout for larger pages
        response = session.get(url, timeout=15)
        
        # Try to detect encoding if not specified
        if response.encoding.lower() == 'iso-8859-1':
            # Try to detect encoding from content
            possible_encoding = response.apparent_encoding
            if possible_encoding and possible_encoding.lower() != 'iso-8859-1':
                response.encoding = possible_encoding
                logger.info(f"Detected encoding: {possible_encoding}")
    except Exception as e:
        logger.error(f"Error fetching HTML page: {e}")
        raise ValueError(f"Failed to fetch {url}: {e}")

    if response.status_code == 200:
        try:
            # Use lxml parser for better performance if available
            parser = "lxml" if "lxml" in sys.modules else "html.parser"
            soup = BeautifulSoup(response.text, parser)
            
            # Remove script, style and other non-content tags
            for tag in soup(["script", "style", "meta", "noscript", "svg", "iframe"]):
                tag.decompose()
                
            # Get text with reasonable spacing
            text = soup.get_text(separator="\n", strip=True)
            
            # Remove excessive whitespace and blank lines
            text = re.sub(r'\n\s*\n', '\n\n', text)
            text = re.sub(r' +', ' ', text)
            
            logger.info(f"Extracted text length: {len(text)}")
            return text
        except Exception as e:
            logger.error(f"Error parsing HTML: {e}")
            raise ValueError(f"Failed to parse HTML from {url}: {e}")
    else:
        raise ValueError(f"Failed to fetch page. Status {response.status_code}")

def convert_to_json(
    content: str,
    source_url: str,
    save_path: str = DEFAULT_OUTPUT_FOLDER
) -> str:
    """
    Convert extracted content into a JSON structure and save to disk.

    Args:
        content (str): The textual content to save.
        source_url (str): The original URL for reference.
        save_path (str): Output directory for the resulting JSON file.

    Returns:
        str: The fully qualified path to the JSON file.

    Raises:
        Exception: If writing fails for any reason.
    """
    # Create a base filename from the URL
    url_hash = hashlib.md5(source_url.encode()).hexdigest()[:10]
    filename = f"content_{url_hash}"
    
    # Ensure output directory exists
    os.makedirs(save_path, exist_ok=True)
    
    # Create full path with .json extension
    json_path = os.path.join(save_path, filename + ".json")
    json_path = os.path.abspath(json_path)

    data = {
        "source_url": source_url,
        "content": content,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        logger.info(f"Content saved: {json_path}")
        return json_path
    except Exception as e:
        logger.error(f"Error writing JSON: {e}")
        raise

def is_pdf_downloadable(url: str) -> bool:
    """
    Check if a URL is a downloadable PDF by sending a HEAD request.
    
    Args:
        url (str): The URL to check
        
    Returns:
        bool: True if the URL is a downloadable PDF
    """
    try:
        # For arXiv links, convert to PDF URL
        if "arxiv.org/abs/" in url:
            url = convert_arxiv_url(url)
        
        # Send HEAD request to check content type
        response = session.head(url, timeout=10)
        
        # Check if content type is PDF
        content_type = response.headers.get('Content-Type', '').lower()
        if 'application/pdf' in content_type:
            return True
            
        # Some servers don't set content type correctly for PDFs
        # Check if URL ends with .pdf
        if url.lower().endswith('.pdf'):
            return True
            
        return False
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error checking PDF downloadability for {url}: {e}")
        # If we can't check, assume it might be downloadable if URL looks like a PDF
        return url.lower().endswith('.pdf')

# -----------------------------------------------------------------------------
# PDF Download Functions
# -----------------------------------------------------------------------------
def download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER, emit_progress=True, task_id=None, timeout=DEFAULT_TIMEOUT) -> str:
    """
    Download a PDF from the given URL using streaming to save memory and report progress.
    Fully integrated with NeuroGen UI for real-time feedback.
    
    Args:
        url (str): The URL to download from
        save_path (str): Directory where the PDF will be saved
        emit_progress (bool): Whether to emit Socket.IO events for progress tracking
        task_id (str, optional): Task ID for progress tracking
        timeout (int): Request timeout in seconds
        
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
        
        # Emit error event
        if emit_progress:
            emit_socket_event("pdf_download_progress", {
                "task_id": task_id,
                "url": url,
                "status": "error",
                "message": f"Failed to create download directory: {str(e)}"
            })
        
        raise ValueError(f"Cannot create download directory: {e}")
    
    # Generate a unique filename from the URL
    url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:10]
    
    # Extract filename from the URL
    filename = os.path.basename(pdf_url.split('?')[0])  # Remove query parameters
    
    # Handle special case for empty filename
    if not filename:
        filename = "document.pdf"
    
    # Fix: Properly handle files with or without extensions to avoid double extension
    base_name, ext = os.path.splitext(filename)
    if not ext or ext.lower() != '.pdf':
        ext = '.pdf'
    
    # Create final filename with hash for uniqueness
    final_filename = f"{sanitize_filename(base_name)}_{url_hash}{ext}"
    file_path = os.path.join(save_path, final_filename)
    
    # If file already exists, return the path without downloading
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:  # Ensure it's not an empty file
        logger.info(f"PDF already exists: {file_path}")
        
        # Emit completion event for already existing file
        if emit_progress:
            emit_socket_event("pdf_download_progress", {
                "task_id": task_id,
                "url": url,
                "progress": 100,
                "status": "success",
                "message": "PDF already exists",
                "file_path": file_path
            })
        
        return file_path
    
    # Initial progress event
    if emit_progress:
        emit_socket_event("pdf_download_progress", {
            "task_id": task_id,
            "url": url,
            "progress": 0,
            "status": "downloading",
            "message": "Starting download..."
        })
    
    # Download with retries
    max_retries = MAX_RETRIES
    for attempt in range(max_retries):
        try:
            # Use streaming to handle large files efficiently
            response = session.get(
                pdf_url, 
                stream=True, 
                timeout=timeout, 
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/pdf,*/*",
                    "Connection": "keep-alive"
                }
            )
            response.raise_for_status()
            
            # Get content length for progress tracking
            content_length = int(response.headers.get('Content-Length', 0))
            
            # Check if content type indicates it's a PDF (if available)
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type and 'application/pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Content type not PDF: {content_type}. Checking content...")
                
                # Check first few bytes to see if it starts with %PDF
                first_chunk = next(response.iter_content(256), None)
                if not first_chunk or not first_chunk.startswith(b'%PDF-'):
                    if emit_progress:
                        emit_socket_event("pdf_download_progress", {
                            "task_id": task_id,
                            "url": url,
                            "status": "error",
                            "message": f"Content at {pdf_url} is not a PDF"
                        })
                    raise ValueError(f"Content at {pdf_url} is not a PDF")
            
            # Stream content to file with progress updates
            downloaded_bytes = 0
            last_progress_update = 0
            
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)
                        downloaded_bytes += len(chunk)
                        
                        # Calculate and emit progress
                        if emit_progress and content_length > 0:
                            progress = int(min(downloaded_bytes / content_length * 100, 99))
                            
                            # Only emit progress updates when they change significantly
                            if progress >= last_progress_update + 5 or progress >= 99:
                                emit_socket_event("pdf_download_progress", {
                                    "task_id": task_id,
                                    "url": url,
                                    "progress": progress,
                                    "status": "downloading",
                                    "message": f"Downloading: {progress}%"
                                })
                                last_progress_update = progress
            
            # Verify the file is a valid PDF and has content
            if not os.path.exists(file_path) or os.path.getsize(file_path) < 1000:
                if os.path.exists(file_path):
                    os.remove(file_path)
                
                if emit_progress:
                    emit_socket_event("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "status": "error",
                        "message": "Downloaded file is not a valid PDF (too small)"
                    })
                
                if attempt < max_retries - 1:
                    # Retry with a different approach
                    continue
                else:
                    raise ValueError("Downloaded file is not a valid PDF (too small)")
                
            logger.info(f"PDF successfully downloaded to: {file_path}")
            
            # Emit completion event
            if emit_progress:
                emit_socket_event("pdf_download_progress", {
                    "task_id": task_id,
                    "url": url,
                    "progress": 100,
                    "status": "success",
                    "message": "Download complete",
                    "file_path": file_path
                })
            
            return file_path
        except requests.exceptions.Timeout:
            logger.warning(f"Attempt {attempt+1}/{max_retries} timed out")
            
            if emit_progress:
                emit_socket_event("pdf_download_progress", {
                    "task_id": task_id,
                    "url": url,
                    "status": "downloading",
                    "message": f"Attempt {attempt+1} timed out, retrying..."
                })
                
            if attempt < max_retries - 1:
                # Exponential backoff
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"Failed to download PDF after {max_retries} timeout attempts")
                
                if emit_progress:
                    emit_socket_event("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "status": "error",
                        "message": "Download failed: Timeout"
                    })
                
                raise ValueError(f"Failed to download PDF from {pdf_url}: Timeout after {max_retries} attempts")
                
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}/{max_retries} failed: {e}")
            
            if emit_progress:
                emit_socket_event("pdf_download_progress", {
                    "task_id": task_id,
                    "url": url,
                    "status": "downloading",
                    "message": f"Attempt {attempt+1} failed, retrying..."
                })
                
            if attempt < max_retries - 1:
                # Exponential backoff
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                logger.error(f"Failed to download PDF after {max_retries} attempts: {e}")
                
                if emit_progress:
                    emit_socket_event("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "status": "error",
                        "message": f"Download failed: {str(e)}"
                    })
                
                raise ValueError(f"Failed to download PDF from {pdf_url}: {e}")

# -----------------------------------------------------------------------------
# PDF Link Extraction
# -----------------------------------------------------------------------------
def extract_page_title(html_content: str) -> Optional[str]:
    """
    Extract the title of a webpage from HTML content.
    
    Args:
        html_content (str): HTML content
        
    Returns:
        Optional[str]: Page title or None if not found
    """
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        title_tag = soup.find('title')
        if title_tag and title_tag.string:
            return title_tag.string.strip()
    except Exception as e:
        logger.warning(f"Error extracting page title: {e}")
    return None

def find_pdf_links(soup: BeautifulSoup, base_url: str) -> List[Dict[str, str]]:
    """
    Find all PDF links in a BeautifulSoup parsed page.
    
    Args:
        soup (BeautifulSoup): Parsed HTML
        base_url (str): Base URL for resolving relative links
        
    Returns:
        List[Dict[str, str]]: List of PDF link dictionaries with URL and title
    """
    pdf_links = []
    
    # Find direct PDF links (href ends with .pdf)
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        if href.lower().endswith('.pdf'):
            title = a_tag.get_text(strip=True) or None
            full_url = urljoin(base_url, href)
            pdf_links.append({"url": full_url, "title": title})
    
    # Find links to arXiv papers
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        if 'arxiv.org/abs/' in href or 'arxiv.org/pdf/' in href:
            title = a_tag.get_text(strip=True) or None
            full_url = urljoin(base_url, href)
            # Convert to PDF URL if it's an abstract URL
            if 'arxiv.org/abs/' in full_url:
                full_url = convert_arxiv_url(full_url)
            pdf_links.append({"url": full_url, "title": title})
    
    # Find DOI links that might lead to PDFs
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        if 'doi.org/' in href:
            title = a_tag.get_text(strip=True) or None
            full_url = urljoin(base_url, href)
            pdf_links.append({"url": full_url, "title": title})
    
    # Find other academic links that might contain PDFs
    academic_keywords = ['fulltext', 'pdf', 'download', 'article', 'paper']
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href'].lower()
        href_text = a_tag.get_text(strip=True).lower()
        
        academic_domains = [
            'researchgate.net', 'academia.edu', 'sciencedirect.com', 
            'springer.com', 'ieee.org', 'acm.org', 'jstor.org',
            'ssrn.com', 'tandfonline.com', 'wiley.com'
        ]
        
        if any(domain in href for domain in academic_domains):
            if any(keyword in href or keyword in href_text for keyword in academic_keywords):
                title = a_tag.get_text(strip=True) or None
                full_url = urljoin(base_url, a_tag['href'])
                pdf_links.append({"url": full_url, "title": title})
    
    # Remove duplicates while preserving order
    seen_urls = set()
    unique_links = []
    
    for link in pdf_links:
        if link["url"] not in seen_urls:
            seen_urls.add(link["url"])
            unique_links.append(link)
    
    return unique_links

def fetch_pdf_links(url: str) -> List[Dict[str, str]]:
    """
    Extract PDF URLs from a webpage.
    
    Args:
        url (str): The URL to scrape
        
    Returns:
        List[Dict[str, str]]: List of PDF link dictionaries with URL and title
    """
    logger.info(f"Fetching PDF links from: {url}")
    
    try:
        response = session.get(url, timeout=15)
        response.raise_for_status()
        
        html_content = response.text
        soup = BeautifulSoup(html_content, "html.parser")
        
        # Get page title if available
        page_title = extract_page_title(html_content)
        logger.debug(f"Page title: {page_title}")
        
        # Find PDF links
        pdf_links = find_pdf_links(soup, url)
        
        # If this is a direct PDF link, add it to the list
        if response.headers.get('Content-Type', '').lower().find('application/pdf') != -1:
            pdf_links.append({"url": url, "title": page_title})
        
        logger.info(f"Found {len(pdf_links)} potential PDF links on {url}")
        return pdf_links
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching {url}: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error while processing {url}: {e}")
        return []

def download_pdfs_concurrently(pdf_links, output_folder, max_workers=5, task_id=None):
    """
    Download multiple PDFs concurrently with integrated progress reporting.
    
    Args:
        pdf_links (List[Dict]): List of PDF link dictionaries
        output_folder (str): Directory to save PDFs
        max_workers (int): Maximum number of concurrent downloads
        task_id (str, optional): Task ID for progress tracking
        
    Returns:
        List[Dict]: List of results containing file paths and status
    """
    if not pdf_links:
        return []
    
    # Ensure output directory exists
    os.makedirs(output_folder, exist_ok=True)
    
    results = []
    
    emit_socket_event("progress_update", {
        "task_id": task_id,
        "message": f"Starting download of {len(pdf_links)} PDFs",
        "status": "processing"
    })
    
    with ThreadPoolExecutor(max_workers=min(max_workers, len(pdf_links))) as executor:
        # Submit download tasks
        future_to_link = {}
        for link in pdf_links:
            url = link["url"]
            future = executor.submit(download_pdf, url, output_folder, True, task_id)
            future_to_link[future] = link
        
        # Process results as they complete
        for future in as_completed(future_to_link):
            link = future_to_link[future]
            try:
                pdf_file = future.result()
                if pdf_file:
                    result = {
                        "url": link["url"],
                        "file_path": pdf_file,
                        "title": link.get("title", ""),
                        "status": "success"
                    }
                    results.append(result)
                    logger.info(f"Successfully downloaded: {pdf_file}")
            except Exception as exc:
                logger.error(f"Error downloading {link['url']}: {exc}")
                tb = traceback.format_exc()
                logger.debug(f"Traceback: {tb}")
                
                # Create error result
                error_result = {
                    "error": str(exc),
                    "url": link["url"],
                    "title": link.get("title", ""),
                    "status": "error"
                }
                results.append(error_result)
                
                # Emit error event
                emit_socket_event("pdf_download_progress", {
                    "task_id": task_id,
                    "url": link["url"],
                    "status": "error",
                    "message": f"Download failed: {str(exc)}"
                })
    
    # Emit completion summary
    emit_socket_event("progress_update", {
        "task_id": task_id,
        "message": f"Completed downloading {len(pdf_links)} PDFs with {sum(1 for r in results if r.get('status') == 'success')} successful",
        "status": "processing",
        "progress": 100
    })
    
    return results

# -----------------------------------------------------------------------------
# URL Processing Functions
# -----------------------------------------------------------------------------
def process_url(url: str, setting: str, keyword: str = "", output_folder: str = DEFAULT_OUTPUT_FOLDER, task_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Process a URL based on the specified setting with enhanced PDF processing capabilities.
    
    Args:
        url (str): The URL to process
        setting (str): One of 'full', 'metadata', 'title', 'keyword', or 'pdf'
        keyword (str): Optional keyword for keyword search mode
        output_folder (str): Directory where outputs should be saved
        task_id (str, optional): Task ID for progress tracking
        
    Returns:
        Dict[str, Any]: Results of the processing
    """
    logger.info(f"Processing URL: {url} with setting: {setting}")
    
    # Ensure output folder exists
    try:
        os.makedirs(output_folder, exist_ok=True)
        logger.info(f"Ensured output directory exists: {output_folder}")
    except Exception as e:
        logger.error(f"Error creating output directory {output_folder}: {e}")
        return {"error": str(e), "url": url, "setting": setting}
    
    # Track start time for performance monitoring
    start_time = time.time()
    
    try:
        # Handle PDF download mode
        if setting.lower() == "pdf":
            logger.info(f"PDF download mode for: {url}")
            
            # Emit progress event
            if task_id:
                emit_socket_event("pdf_download_progress", {
                    "task_id": task_id,
                    "url": url,
                    "progress": 0,
                    "status": "downloading",
                    "message": "Starting PDF download..."
                })
            
            # Download the PDF with advanced error handling
            try:
                pdf_file = download_pdf(url, save_path=output_folder, emit_progress=True, task_id=task_id)
                
                if not pdf_file or not os.path.exists(pdf_file):
                    raise ValueError(f"Failed to download PDF from {url}")
                
                # Generate output filenames
                pdf_filename = os.path.basename(pdf_file)
                json_filename = f"{os.path.splitext(pdf_filename)[0]}_processed.json"
                json_path = os.path.join(output_folder, json_filename)
                
                # Update progress to processing
                if task_id:
                    emit_socket_event("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "progress": 50,
                        "status": "processing",
                        "message": "PDF downloaded, processing content...",
                        "file_path": pdf_file
                    })
                
                # Process the PDF if structify_module is available
                if structify_module:
                    # Try direct PDF processing if available
                    if hasattr(structify_module, 'process_pdf') and pdf_extractor_available:
                        try:
                            # Detect document type for better processing
                            doc_type = None
                            if hasattr(structify_module, 'detect_document_type'):
                                try:
                                    doc_type = structify_module.detect_document_type(pdf_file)
                                    logger.info(f"Detected document type: {doc_type}")
                                except Exception as type_err:
                                    logger.warning(f"Error detecting document type: {type_err}")
                            
                            # Determine if OCR should be applied based on document type
                            apply_ocr = (doc_type == "scan")
                            
                            # Process with enhanced features
                            result = structify_module.process_pdf(
                                pdf_path=pdf_file,
                                output_path=json_path,
                                max_chunk_size=4096,
                                extract_tables=True,
                                use_ocr=apply_ocr,
                                return_data=True
                            )
                            
                            # Extract tables and references count
                            tables_count = len(result.get("tables", [])) if result else 0
                            references_count = len(result.get("references", [])) if result else 0
                            
                            # Emit completion event
                            if task_id:
                                emit_socket_event("pdf_download_progress", {
                                    "task_id": task_id,
                                    "url": url,
                                    "progress": 100,
                                    "status": "success",
                                    "message": "PDF processing complete",
                                    "file_path": pdf_file,
                                    "json_file": json_path,
                                    "document_type": doc_type,
                                    "tables_count": tables_count,
                                    "references_count": references_count
                                })
                            
                            # Return detailed result with enhanced metadata
                            return {
                                "status": "success",
                                "url": url,
                                "pdf_file": pdf_file,
                                "json_file": json_path,
                                "document_type": doc_type,
                                "tables_count": tables_count,
                                "references_count": references_count,
                                "processing_time": time.time() - start_time
                            }
                        except Exception as e:
                            logger.warning(f"Enhanced PDF processing failed, falling back: {e}")
                    
                    # Fallback to standard process_all_files if direct processing fails or isn't available
                    try:
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        # Emit completion event
                        if task_id:
                            emit_socket_event("pdf_download_progress", {
                                "task_id": task_id,
                                "url": url,
                                "progress": 100,
                                "status": "success",
                                "message": "PDF processing complete (standard)",
                                "file_path": pdf_file,
                                "json_file": json_path
                            })
                        
                        # Return standard result
                        return {
                            "status": "success",
                            "url": url,
                            "pdf_file": pdf_file,
                            "json_file": json_path,
                            "processing_time": time.time() - start_time
                        }
                    except Exception as e:
                        logger.error(f"Standard PDF processing failed: {e}")
                        raise
                else:
                    # No processing module available, just return download info
                    if task_id:
                        emit_socket_event("pdf_download_progress", {
                            "task_id": task_id,
                            "url": url,
                            "progress": 100,
                            "status": "success",
                            "message": "PDF downloaded (processing unavailable)",
                            "file_path": pdf_file
                        })
                    
                    return {
                        "status": "success",
                        "url": url,
                        "pdf_file": pdf_file,
                        "processing_time": time.time() - start_time
                    }
                
            except Exception as e:
                logger.error(f"Error processing PDF from {url}: {e}")
                
                # Emit error event
                if task_id:
                    emit_socket_event("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "status": "error",
                        "message": f"PDF processing error: {str(e)}"
                    })
                
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e),
                    "processing_time": time.time() - start_time
                }
                
        # Full content extraction
        elif setting.lower() == "full":
            logger.info(f"Full content extraction mode for: {url}")
            try:
                content = extract_html_text(url)
                json_path = convert_to_json(content, url, output_folder)
                
                return {
                    "status": "success",
                    "url": url,
                    "content_length": len(content),
                    "json_file": json_path,
                    "processing_time": time.time() - start_time
                }
            except Exception as e:
                logger.error(f"Error extracting full content from {url}: {e}")
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e),
                    "processing_time": time.time() - start_time
                }
                
        # Metadata extraction
        elif setting.lower() == "metadata":
            logger.info(f"Metadata extraction mode for: {url}")
            try:
                response = session.get(url, timeout=15)
                soup = BeautifulSoup(response.text, "html.parser")
                
                # Extract metadata
                metadata = {
                    "title": extract_page_title(response.text),
                    "description": None,
                    "keywords": None,
                    "links": []
                }
                
                # Description
                meta_desc = soup.find("meta", attrs={"name": "description"})
                if meta_desc:
                    metadata["description"] = meta_desc.get("content")
                
                # Keywords
                meta_keywords = soup.find("meta", attrs={"name": "keywords"})
                if meta_keywords:
                    keywords_content = meta_keywords.get("content")
                    if keywords_content:
                        metadata["keywords"] = [k.strip() for k in keywords_content.split(",")]
                
                # Links
                for link in soup.find_all("a", href=True):
                    href = link["href"]
                    if href and not href.startswith("#") and not href.startswith("javascript:"):
                        metadata["links"].append({
                            "href": urljoin(url, href),
                            "text": link.get_text(strip=True)[:100] or None
                        })
                
                # Save metadata to JSON
                url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
                json_path = os.path.join(output_folder, f"metadata_{url_hash}.json")
                
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=4)
                
                return {
                    "status": "success",
                    "url": url,
                    "metadata": metadata,
                    "json_file": json_path,
                    "processing_time": time.time() - start_time
                }
            except Exception as e:
                logger.error(f"Error extracting metadata from {url}: {e}")
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e),
                    "processing_time": time.time() - start_time
                }
                
        # Title extraction
        elif setting.lower() == "title":
            logger.info(f"Title extraction mode for: {url}")
            try:
                response = session.get(url, timeout=15)
                title = extract_page_title(response.text)
                
                return {
                    "status": "success",
                    "url": url,
                    "title": title,
                    "processing_time": time.time() - start_time
                }
            except Exception as e:
                logger.error(f"Error extracting title from {url}: {e}")
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e),
                    "processing_time": time.time() - start_time
                }
                
        # Keyword search
        elif setting.lower() == "keyword":
            logger.info(f"Keyword search mode for: {url}, keyword: {keyword}")
            if not keyword:
                return {
                    "status": "error",
                    "url": url,
                    "error": "Keyword not provided for keyword search mode",
                    "processing_time": time.time() - start_time
                }
                
            try:
                content = extract_html_text(url)
                
                # Find all occurrences of the keyword (case insensitive)
                keyword_lower = keyword.lower()
                content_lower = content.lower()
                
                # Find all positions of keyword
                positions = []
                start = 0
                
                while True:
                    pos = content_lower.find(keyword_lower, start)
                    if pos == -1:
                        break
                    positions.append(pos)
                    start = pos + len(keyword_lower)
                
                # Extract context around each occurrence
                context_size = 100  # Characters before and after the keyword
                occurrences = []
                
                for pos in positions:
                    # Get context
                    start_pos = max(0, pos - context_size)
                    end_pos = min(len(content), pos + len(keyword) + context_size)
                    
                    # Extract the context
                    context = content[start_pos:end_pos]
                    
                    # Add to occurrences
                    occurrences.append({
                        "position": pos,
                        "context": context
                    })
                
                # Save results to JSON
                url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
                keyword_hash = hashlib.md5(keyword.encode()).hexdigest()[:6]
                json_path = os.path.join(output_folder, f"keyword_{keyword_hash}_{url_hash}.json")
                
                result = {
                    "url": url,
                    "keyword": keyword,
                    "occurrences_count": len(occurrences),
                    "occurrences": occurrences
                }
                
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(result, f, indent=4)
                
                return {
                    "status": "success",
                    "url": url,
                    "keyword": keyword,
                    "occurrences_count": len(occurrences),
                    "json_file": json_path,
                    "processing_time": time.time() - start_time
                }
            except Exception as e:
                logger.error(f"Error searching for keyword in {url}: {e}")
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e),
                    "processing_time": time.time() - start_time
                }
        
        # Invalid setting
        else:
            logger.error(f"Invalid setting: {setting}")
            return {
                "status": "error",
                "url": url,
                "error": f"Invalid setting: {setting}. Valid settings are: full, metadata, title, keyword, pdf",
                "processing_time": time.time() - start_time
            }
    
    except Exception as e:
        # Catch any unhandled exceptions
        logger.error(f"Unexpected error processing {url}: {e}")
        
        # Emit error event
        if task_id:
            emit_socket_event("pdf_download_progress", {
                "task_id": task_id,
                "url": url,
                "status": "error",
                "message": f"Unexpected error: {str(e)}"
            })
            
        return {
            "status": "error",
            "url": url,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "processing_time": time.time() - start_time
        }

def process_multiple_urls(url_configs, output_folder=DEFAULT_OUTPUT_FOLDER, 
                         num_threads=DEFAULT_NUM_THREADS, 
                         progress_callback=None, task_id=None):
    """
    Process multiple URLs concurrently with progress tracking.
    
    Args:
        url_configs (List[Dict]): List of URL configuration dictionaries
        output_folder (str): Output directory for JSON files
        num_threads (int): Maximum number of concurrent threads
        progress_callback (Callable): Optional callback for progress updates
        task_id (str): Optional task ID for tracking
        
    Returns:
        List[Dict]: List of processing results
    """
    if not url_configs:
        return []
    
    total = len(url_configs)
    results = []
    processed = 0
    
    # Create thread pool
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        # Submit tasks
        futures = []
        for config in url_configs:
            url = config.get("url")
            setting = config.get("setting", "full")
            keyword = config.get("keyword", "")
            
            future = executor.submit(
                process_url, 
                url, 
                setting, 
                keyword, 
                output_folder,
                task_id
            )
            futures.append(future)
        
        # Process results as they complete
        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
                
                # Update progress if callback provided
                processed += 1
                if progress_callback:
                    progress_callback(processed, total)
                    
                # Emit progress via Socket.IO if task_id is provided
                if task_id:
                    try:
                        emit_socket_event("progress_update", {
                            "task_id": task_id,
                            "progress": int((processed / total) * 100),
                            "message": f"Processed {processed}/{total} URLs",
                            "status": "processing"
                        })
                    except Exception as e:
                        logger.debug(f"Socket.IO emission failed: {e}")
                
            except Exception as e:
                logger.error(f"Error processing URL: {e}")
                # Add error result
                results.append({
                    "error": str(e),
                    "status": "error"
                })
                
                # Update progress
                processed += 1
                if progress_callback:
                    progress_callback(processed, total)
    
    return results

# -----------------------------------------------------------------------------
# PDF Processor Class
# -----------------------------------------------------------------------------
class PDFProcessor:
    """
    Advanced PDF processor with OCR capabilities, memory optimization,
    and table extraction.
    """
    def __init__(self, options=None):
        """
        Initialize the PDF processor with options.
        
        Args:
            options: Dictionary of processing options
        """
        self.options = options or {}
        
        # Set default options
        self.options.setdefault("extract_tables", True)
        self.options.setdefault("use_ocr", True)
        self.options.setdefault("detect_document_type", True)
        self.options.setdefault("chunk_size", 4096)
        self.options.setdefault("max_pages", None)  # None = all pages
        
        # Internal state
        self.temp_files = []
        
        # Initialize OCR configuration
        self._init_ocr()
    
    def _init_ocr(self):
        """Initialize OCR configuration."""
        # Create a custom temporary directory if needed
        self.temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
        os.makedirs(self.temp_dir, exist_ok=True)
        
        # Set environment variables for OCR
        os.environ['TEMP'] = self.temp_dir
        os.environ['TMP'] = self.temp_dir
        
        # Configure Tesseract if pytesseract is available
        try:
            import pytesseract
            self.pytesseract_available = True
            
            # Try to find Tesseract executable
            tesseract_paths = [
                r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                r'/usr/bin/tesseract',
                r'/usr/local/bin/tesseract'
            ]
            
            for path in tesseract_paths:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    logger.info(f"Found Tesseract at: {path}")
                    break
        except ImportError:
            self.pytesseract_available = False
            logger.warning("pytesseract not available, OCR functionality will be limited")
    
    def process_pdf(self, pdf_path, output_path=None, options=None):
        """
        Process a PDF file with enhanced features.
        
        Args:
            pdf_path: Path to the PDF file
            output_path: Path for the output JSON file (optional)
            options: Processing options to override defaults (optional)
            
        Returns:
            dict: Processing results
        """
        # Start timing
        start_time = time.time()
        
# Merge options
        local_options = self.options.copy()
        if options:
            local_options.update(options)
        
        # Generate output path if not provided
        if not output_path:
            base_name = os.path.splitext(os.path.basename(pdf_path))[0]
            output_dir = os.path.dirname(pdf_path)
            output_path = os.path.join(output_dir, f"{base_name}_processed.json")
        
        try:
            # Log start of processing
            logger.info(f"Processing PDF: {pdf_path}")
            logger.info(f"Options: {local_options}")
            
            # Choose the best available method
            if structify_module and hasattr(structify_module, 'process_pdf'):
                # Detect document type if requested
                doc_type = "unknown"
                if local_options["detect_document_type"] and hasattr(structify_module, 'detect_document_type'):
                    try:
                        doc_type = structify_module.detect_document_type(pdf_path)
                        logger.info(f"Detected document type: {doc_type}")
                    except Exception as e:
                        logger.warning(f"Error detecting document type: {e}")
                
                # Determine if OCR should be applied
                use_ocr = local_options["use_ocr"] or doc_type == "scan"
                
                # Process the PDF with full integration
                result = structify_module.process_pdf(
                    pdf_path=pdf_path,
                    output_path=output_path,
                    max_chunk_size=local_options["chunk_size"],
                    extract_tables=local_options["extract_tables"],
                    use_ocr=use_ocr,
                    return_data=True
                )
                
                # Add processing metadata
                result.update({
                    "document_type": doc_type,
                    "processing_method": "structify_direct",
                    "processing_time": time.time() - start_time,
                    "ocr_applied": use_ocr
                })
                
                return result
            
            # Fallback to process_all_files if direct processing isn't available
            elif structify_module:
                logger.info("Falling back to process_all_files for PDF processing")
                
                result = structify_module.process_all_files(
                    root_directory=os.path.dirname(pdf_path),
                    output_file=output_path,
                    max_chunk_size=local_options["chunk_size"],
                    file_filter=lambda f: f == pdf_path
                )
                
                # Convert result structure if needed
                if isinstance(result, dict) and "stats" in result:
                    processed_result = {
                        "status": "success",
                        "output_file": output_path,
                        "stats": result["stats"],
                        "processing_method": "structify_general",
                        "processing_time": time.time() - start_time
                    }
                    return processed_result
                
                return {
                    "status": "success",
                    "output_file": output_path,
                    "processing_method": "structify_general",
                    "processing_time": time.time() - start_time
                }
            
            # Last resort - minimal processing if no other method is available
            else:
                logger.warning("No PDF processing module available, performing minimal processing")
                return self._minimal_pdf_processing(pdf_path, output_path, local_options)
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}")
            return {
                "status": "error",
                "error": str(e),
                "processing_time": time.time() - start_time
            }
        finally:
            # Clean up any temporary files
            self._cleanup_temp_files()
    
    def _minimal_pdf_processing(self, pdf_path, output_path, options):
        """
        Perform minimal PDF processing when no advanced modules are available.
        
        Args:
            pdf_path: Path to the PDF file
            output_path: Path for the output JSON file
            options: Processing options
            
        Returns:
            dict: Processing results
        """
        start_time = time.time()
        
        try:
            # Get PDF file info
            file_stats = os.stat(pdf_path)
            
            # Create minimal result structure
            result = {
                "status": "success",
                "file_path": pdf_path,
                "output_file": output_path,
                "file_info": {
                    "file_size": file_stats.st_size,
                    "created": file_stats.st_ctime,
                    "modified": file_stats.st_mtime
                },
                "processing_method": "minimal",
                "document_type": "unknown",
                "processing_time": time.time() - start_time
            }
            
            # Save result to JSON
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
            
            return result
            
        except Exception as e:
            logger.error(f"Error in minimal PDF processing: {e}")
            return {
                "status": "error",
                "error": str(e),
                "processing_time": time.time() - start_time
            }
    
    def extract_tables(self, pdf_path, output_dir=None, page_range=None):
        """
        Extract tables from a PDF file.
        
        Args:
            pdf_path: Path to the PDF file
            output_dir: Directory to save extracted tables (optional)
            page_range: Tuple of (start_page, end_page) to process (optional)
            
        Returns:
            list: Extracted tables
        """
        if not pdf_extractor_available:
            logger.warning("PDF extractor not available, table extraction not possible")
            return []
        
        try:
            # Use the pdf_extractor to extract tables
            tables = extract_tables_from_pdf(pdf_path, page_range)
            
            # Save tables to CSV files if output_dir is provided
            if output_dir and tables:
                os.makedirs(output_dir, exist_ok=True)
                base_name = os.path.splitext(os.path.basename(pdf_path))[0]
                
                for i, table in enumerate(tables):
                    if "data" in table:
                        csv_path = os.path.join(output_dir, f"{base_name}_table_{i+1}.csv")
                        
                        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                            import csv
                            writer = csv.writer(f)
                            
                            # Write headers if available
                            if "columns" in table:
                                writer.writerow(table["columns"])
                            
                            # Write data
                            for row in table["data"]:
                                writer.writerow(row)
                        
                        table["csv_file"] = csv_path
            
            return tables
            
        except Exception as e:
            logger.error(f"Error extracting tables from {pdf_path}: {e}")
            return []
    
    def _cleanup_temp_files(self):
        """Clean up temporary files created during processing."""
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as e:
                logger.debug(f"Error removing temp file {temp_file}: {e}")
        
        # Clear the list
        self.temp_files = []

# -----------------------------------------------------------------------------
# Main Scraping Functions
# -----------------------------------------------------------------------------
def scrape_and_download_pdfs(url: str, output_folder: str = DEFAULT_OUTPUT_FOLDER, task_id=None) -> Dict[str, Any]:
    """
    Scrape a webpage for PDF links and download them.
    Integrated with NeuroGen's UI for real-time progress reporting.
    
    Args:
        url (str): URL of the webpage to scrape
        output_folder (str): Folder to save PDFs
        task_id (str, optional): Task ID for progress tracking
        
    Returns:
        Dict[str, Any]: Results of the scraping and downloading
    """
    logger.info(f"Scraping for PDFs from: {url}")
    
    try:
        # Ensure output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Emit status update
        emit_socket_event("progress_update", {
            "task_id": task_id,
            "message": f"Analyzing page: {url}",
            "status": "processing"
        })
        
        # Get PDF links from the page
        pdf_links = fetch_pdf_links(url)
        
        if not pdf_links:
            logger.info(f"No PDF links found on {url}")
            
            # Emit status update
            emit_socket_event("progress_update", {
                "task_id": task_id,
                "message": f"No PDF links found on {url}",
                "status": "processing"
            })
            
            return {
                "status": "completed",
                "url": url,
                "message": "No PDF links found",
                "pdfs_found": 0,
                "pdfs_downloaded": 0
            }
        
        # Emit status update
        emit_socket_event("progress_update", {
            "task_id": task_id,
            "message": f"Found {len(pdf_links)} PDF links on {url}",
            "status": "processing"
        })
        
        # Download each PDF
        downloaded_pdfs = []
        failed_pdfs = []
        
        for idx, pdf_info in enumerate(pdf_links, 1):
            pdf_url = pdf_info["url"]
            try:
                # Emit status update
                emit_socket_event("progress_update", {
                    "task_id": task_id,
                    "message": f"Downloading PDF {idx}/{len(pdf_links)}: {pdf_info.get('title') or pdf_url}",
                    "status": "processing"
                })
                
                # Download the PDF
                pdf_path = download_pdf(pdf_url, output_folder, emit_progress=True, task_id=task_id)
                
                # Process the PDF if download was successful
                if pdf_path and os.path.exists(pdf_path):
                    # Generate JSON output filename
                    pdf_filename = os.path.basename(pdf_path)
                    json_filename = f"{os.path.splitext(pdf_filename)[0]}_processed.json"
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Emit status update
                    emit_socket_event("progress_update", {
                        "task_id": task_id,
                        "message": f"Processing PDF {idx}/{len(pdf_links)}: {pdf_filename}",
                        "status": "processing"
                    })
                    
                    # Process PDF to JSON if module is available
                    if structify_module:
                        try:
                            # First try using direct PDF processing if available
                            if hasattr(structify_module, 'process_pdf') and pdf_extractor_available:
                                try:
                                    # Detect document type for better processing
                                    doc_type = None
                                    if hasattr(structify_module, 'detect_document_type'):
                                        try:
                                            doc_type = structify_module.detect_document_type(pdf_path)
                                            logger.info(f"Detected document type: {doc_type}")
                                        except Exception as type_err:
                                            logger.warning(f"Error detecting document type: {type_err}")
                                    
                                    # Process with advanced features
                                    result = structify_module.process_pdf(
                                        pdf_path=pdf_path,
                                        output_path=json_path,
                                        max_chunk_size=4096,
                                        extract_tables=True,
                                        use_ocr=(doc_type == "scan"),
                                        return_data=True
                                    )
                                    
                                    # Extract metadata for tracking
                                    pdf_metadata = {
                                        "document_type": doc_type,
                                        "tables_count": len(result.get("tables", [])) if result else 0,
                                        "references_count": len(result.get("references", [])) if result else 0
                                    }
                                    
                                    downloaded_pdfs.append({
                                        "url": pdf_url,
                                        "file_path": pdf_path,
                                        "json_path": json_path,
                                        "title": pdf_info.get("title", ""),
                                        "metadata": pdf_metadata
                                    })
                                    
                                    logger.info(f"PDF processed with enhanced features: {pdf_path}")
                                    continue  # Skip the fallback processing
                                    
                                except Exception as e:
                                    logger.warning(f"Enhanced PDF processing failed, falling back: {e}")
                            
                            # Fallback to standard processing
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
        
        # Emit completion status
        emit_socket_event("progress_update", {
            "task_id": task_id,
            "message": f"Completed PDF downloads: {len(downloaded_pdfs)} successful, {len(failed_pdfs)} failed",
            "status": "processing",
            "progress": 100
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
        
        # Emit error status
        emit_socket_event("progress_update", {
            "task_id": task_id,
            "message": f"Error scraping PDFs: {str(e)}",
            "status": "error"
        })
        
        return {
            "status": "error",
            "url": url,
            "error": str(e)
        }

# -----------------------------------------------------------------------------
# Batch Processing Class
# -----------------------------------------------------------------------------
class BatchWebScraper:
    """
    Enhanced batch web scraper with advanced PDF processing capabilities,
    resource management, and progress tracking.
    """
    def __init__(self, task_id, output_folder=DEFAULT_OUTPUT_FOLDER):
        """Initialize the batch scraper with tracking information."""
        self.task_id = task_id
        self.output_folder = output_folder
        self.is_cancelled = False
        self.url_configs = []
        self.results = []
        self.pdf_downloads = []
        self.pdf_downloads_lock = threading.RLock()
        self.stats_lock = threading.RLock()
        self.running_futures = set()
        self.last_progress_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds between Socket.IO updates
        
        # Initialize PDF processing options
        self.pdf_options = {
            "process_pdfs": True,
            "extract_tables": True,
            "use_ocr": True,
            "extract_structure": True,
            "chunk_size": 4096
        }
        
        # Statistics tracking
        self.stats = {
            "task_id": task_id,
            "total_urls": 0,
            "processed_urls": 0,
            "successful_urls": 0,
            "failed_urls": 0,
            "pdf_downloads": 0,
            "tables_extracted": 0,
            "start_time": time.time(),
            "status": "initializing"
        }
        
        # Create an event to signal completion
        self.completion_event = threading.Event()
        self.completion_callback = None
    
    def start(self, url_configs, output_file):
        """
        Start the batch scraping process.
        
        Args:
            url_configs: List of URL config dictionaries
            output_file: Path to output JSON file
        """
        self.url_configs = url_configs
        self.output_file = output_file
        self.stats["total_urls"] = len(url_configs)
        self.stats["status"] = "processing"
        
        # Start processing thread
        self.thread = threading.Thread(target=self._process_urls, daemon=True)
        self.thread.start()
        
        return self.task_id
    
    def _process_urls(self):
        """
        Process all URLs concurrently with resource management.
        """
        try:
            # Calculate optimal number of workers based on URLs and system resources
            max_workers = min(max(2, os.cpu_count() // 2), len(self.url_configs), 8)
            logger.info(f"Processing {len(self.url_configs)} URLs with {max_workers} workers")
            
            # Emit initial progress
            self.emit_progress(5, f"Starting processing of {len(self.url_configs)} URLs")
            
            # Process in batches to avoid memory issues with large numbers of URLs
            results = []
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit URL processing tasks
                futures = {}
                for i, config in enumerate(self.url_configs):
                    if self.is_cancelled:
                        logger.info(f"Task {self.task_id} cancelled during submission")
                        break
                        
                    url = config["url"]
                    setting = config["setting"]
                    keyword = config.get("keyword", "")
                    
                    future = executor.submit(
                        self._process_url_with_tracking,
                        url,
                        setting,
                        keyword,
                        self.output_folder
                    )
                    
                    futures[future] = i
                    with self.stats_lock:
                        self.running_futures.add(future)
                
                # Process results as they complete
                for future in as_completed(futures):
                    if self.is_cancelled:
                        # Cancel any remaining futures
                        for f in list(self.running_futures):
                            f.cancel()
                        break
                    
                    try:
                        result = future.result()
                        with self.stats_lock:
                            if future in self.running_futures:
                                self.running_futures.remove(future)
                        
                        # Update statistics
                        with self.stats_lock:
                            self.stats["processed_urls"] += 1
                            if result and "error" not in result:
                                self.stats["successful_urls"] += 1
                                if "pdf_file" in result:
                                    self.stats["pdf_downloads"] += 1
                            else:
                                self.stats["failed_urls"] += 1
                        
                        # Add index and result
                        idx = futures[future]
                        results.append({
                            "url": self.url_configs[idx]["url"],
                            "setting": self.url_configs[idx]["setting"],
                            "result": result
                        })
                        
                        # Update progress
                        progress = int((self.stats["processed_urls"] / len(self.url_configs)) * 90)
                        self.emit_progress(
                            progress,
                            f"Processed {self.stats['processed_urls']}/{len(self.url_configs)} URLs"
                        )
                        
                    except Exception as e:
                        logger.error(f"Error processing URL: {e}")
                        
                        # Add error result
                        idx = futures[future]
                        results.append({
                            "url": self.url_configs[idx]["url"],
                            "setting": self.url_configs[idx]["setting"],
                            "result": {"error": str(e), "status": "error"}
                        })
                        
                        # Update statistics
                        with self.stats_lock:
                            self.stats["processed_urls"] += 1
                            self.stats["failed_urls"] += 1
            
            # Check if task was cancelled
            if self.is_cancelled:
                self.stats["status"] = "cancelled"
                self.emit_progress(100, "Task cancelled")
                return
            
            # Process PDFs further if needed
            self.emit_progress(90, "Processing downloaded PDFs...")
            try:
                self._process_downloaded_pdfs(results)
            except Exception as e:
                logger.error(f"Error in additional PDF processing: {e}")
            
            # Save final results
            self.emit_progress(95, "Saving results...")
            self._save_results(results)
            
            # Final statistics
            self.stats["end_time"] = time.time()
            self.stats["duration_seconds"] = self.stats["end_time"] - self.stats["start_time"]
            self.stats["status"] = "completed"
            
            # Final progress update
            self.emit_progress(
                100, 
                f"Completed: {self.stats['successful_urls']} successful, {self.stats['failed_urls']} failed"
            )
            
            # Signal completion
            self.completion_event.set()
            
        except Exception as e:
            logger.error(f"Error in batch processing: {e}")
            self.stats["status"] = "error"
            self.stats["error"] = str(e)
            self.emit_progress(100, f"Error: {str(e)}")
    
    def _process_url_with_tracking(self, url, setting, keyword, output_folder):
        """Process a single URL with enhanced tracking and error handling."""
        try:
            # Process based on setting, reusing the main process_url function
            return process_url(url, setting, keyword, output_folder, self.task_id)
        except Exception as e:
            logger.error(f"Error processing URL {url}: {e}")
            return {"error": str(e), "url": url, "status": "error"}
    
    def _process_downloaded_pdfs(self, results):
        """
        Perform additional processing on downloaded PDFs after all URLs are processed.
        This can include advanced OCR, table extraction, and structural analysis.
        """
        # Find all downloaded PDFs in results
        pdfs_to_process = []
        for result_item in results:
            result = result_item.get("result", {})
            if isinstance(result, dict) and "pdf_file" in result:
                pdf_file = result["pdf_file"]
                if os.path.exists(pdf_file) and os.path.isfile(pdf_file):
                    # Check if it already has a JSON file
                    if "json_file" not in result or not os.path.exists(result["json_file"]):
                        pdfs_to_process.append({
                            "pdf_file": pdf_file,
                            "result_item": result_item
                        })
        
        if not pdfs_to_process:
            logger.info("No PDFs require additional processing")
            return
        
        logger.info(f"Performing additional processing on {len(pdfs_to_process)} PDFs")
        
        # Process PDFs with optimal method based on available modules
        for i, pdf_item in enumerate(pdfs_to_process):
            if self.is_cancelled:
                break
                
            pdf_file = pdf_item["pdf_file"]
            result_item = pdf_item["result_item"]
            
            try:
                # Generate output filename
                base_name = os.path.splitext(os.path.basename(pdf_file))[0]
                json_path = os.path.join(self.output_folder, f"{base_name}_processed.json")
                
                # Update status to processing
                self._update_pdf_status(pdf_file, "processing", f"Advanced processing PDF {i+1}/{len(pdfs_to_process)}")
                
                # Determine best processing method
                processed = False
                
                # Try structify direct PDF processing first
                if structify_module and hasattr(structify_module, 'process_pdf'):
                    try:
                        # Detect document type if possible
                        doc_type = "unknown"
                        if hasattr(structify_module, 'detect_document_type'):
                            try:
                                doc_type = structify_module.detect_document_type(pdf_file)
                            except Exception as e:
                                logger.warning(f"Error detecting document type: {e}")
                        
                        # Process the PDF with appropriate OCR settings
                        result = structify_module.process_pdf(
                            pdf_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=self.pdf_options.get("chunk_size", 4096),
                            extract_tables=self.pdf_options.get("extract_tables", True),
                            use_ocr=self.pdf_options.get("use_ocr", True) or doc_type == "scan",
                            return_data=True
                        )
                        
                        # Update result item with processing results
                        result_item["result"]["json_file"] = json_path
                        result_item["result"]["document_type"] = doc_type
                        
                        # Update tables and references counts if available
                        if isinstance(result, dict):
                            result_item["result"]["tables_count"] = len(result.get("tables", []))
                            result_item["result"]["references_count"] = len(result.get("references", []))
                            
                            # Update global stats
                            with self.stats_lock:
                                self.stats["tables_extracted"] += len(result.get("tables", []))
                        
                        # Update PDF status
                        self._update_pdf_status(
                            pdf_file, 
                            "success", 
                            "Processing complete",
                            {
                                "jsonFile": json_path,
                                "documentType": doc_type,
                                "tablesExtracted": result_item["result"].get("tables_count", 0)
                            }
                        )
                        
                        processed = True
                        
                    except Exception as e:
                        logger.warning(f"Direct PDF processing failed: {e}, falling back...")
                
                # Fall back to general processing if direct method failed
                if not processed and structify_module:
                    try:
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        # Update result
                        result_item["result"]["json_file"] = json_path
                        
                        # Update PDF status
                        self._update_pdf_status(
                            pdf_file, 
                            "success", 
                            "Fallback processing complete",
                            {"jsonFile": json_path}
                        )
                        
                        processed = True
                        
                    except Exception as e:
                        logger.error(f"Fallback processing failed: {e}")
                
                # If processing still failed, update status
                if not processed:
                    self._update_pdf_status(pdf_file, "error", "Processing failed")
                
            except Exception as e:
                logger.error(f"Error in additional PDF processing for {pdf_file}: {e}")
                self._update_pdf_status(pdf_file, "error", f"Processing error: {str(e)}")
    
    def _update_pdf_status(self, pdf_file, status, message, additional_info=None):
        """Update the status of a PDF in the tracking list."""
        with self.pdf_downloads_lock:
            for i, pdf in enumerate(self.pdf_downloads):
                if pdf.get("filePath") == pdf_file:
                    pdf_update = {
                        "status": status,
                        "message": message
                    }
                    
                    # Add any additional information
                    if additional_info:
                        pdf_update.update(additional_info)
                    
                    # Add completion timestamp for terminal states
                    if status in ["success", "error"]:
                        pdf_update["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    # Update the PDF info
                    self.pdf_downloads[i].update(pdf_update)
                    return
            
            # If not found, this is a new PDF entry
            pdf_info = {
                "filePath": pdf_file,
                "status": status,
                "message": message
            }
            
            # Add additional info
            if additional_info:
                pdf_info.update(additional_info)
                
            # Add completion timestamp for terminal states
            if status in ["success", "error"]:
                pdf_info["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                
            self.pdf_downloads.append(pdf_info)
    
    def _save_results(self, results):
        """Save final results to output JSON file."""
        try:
            # Create output directory if it doesn't exist
            output_dir = os.path.dirname(self.output_file)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            
            # Fill in any missing results
            for i in range(len(self.url_configs)):
                if i >= len(results):
                    url = self.url_configs[i].get("url", "")
                    setting = self.url_configs[i].get("setting", "")
                    results.append({
                        "url": url,
                        "setting": setting,
                        "result": {"error": "Processing was not completed", "url": url}
                    })
            
            # Final results object
            final_result = {
                "task_id": self.task_id,
                "status": self.stats["status"],
                "stats": self.stats,
                "results": results,
                "pdf_downloads": self.pdf_downloads
            }
            
            # Write to output file
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(final_result, f, indent=2)
                
            logger.info(f"Results saved to {self.output_file}")
            
        except Exception as e:
            logger.error(f"Error saving results to {self.output_file}: {e}")
            
            # Try to save to an alternate location
            try:
                alt_output = os.path.join(tempfile.gettempdir(), f"scraper_results_{self.task_id}.json")
                with open(alt_output, 'w', encoding='utf-8') as f:
                    json.dump(final_result, f, indent=2)
                logger.info(f"Results saved to alternate location: {alt_output}")
                self.output_file = alt_output  # Update the output file path
            except Exception as e2:
                logger.error(f"Failed to save results to alternate location: {e2}")
    
    def emit_progress(self, progress, message=None, stats=None, details=None):
        """
        Emit progress update via Socket.IO with rate limiting and memory efficiency.
        
        Args:
            progress: Progress percentage (0-100)
            message: Optional status message
            stats: Optional statistics dictionary
            details: Optional additional details
        """
        now = time.time()
        # Rate limit updates to prevent overwhelming the client
        if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
            self.progress = min(progress, 100)
            
            # Build data payload
            data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.stats.get("status", "processing")
            }
            
            if message:
                data["message"] = message
                
            # Use the latest stats if not provided
            if stats is None:
                with self.stats_lock:
                    data["stats"] = self.stats.copy()
            else:
                data["stats"] = stats
                
            # Include PDF downloads with memory optimization for large lists
            with self.pdf_downloads_lock:
                pdf_downloads = self.pdf_downloads
                
                if len(pdf_downloads) > 50:
                    # For large lists, send summary and only active/recent items
                    active_pdfs = [pdf for pdf in pdf_downloads if pdf.get("status") in ("downloading", "processing", "error")]
                    recent_pdfs = pdf_downloads[-10:]  # Last 10 items
                    
                    # Combine lists and remove duplicates
                    selected_pdfs = []
                    seen_paths = set()
                    
                    for pdf in active_pdfs + recent_pdfs:
                        path = pdf.get("filePath", "")
                        if path and path not in seen_paths:
                            selected_pdfs.append(pdf)
                            seen_paths.add(path)
                    
                    # Send PDF summary stats
                    data["pdf_downloads_summary"] = {
                        "total": len(pdf_downloads),
                        "downloading": sum(1 for pdf in pdf_downloads if pdf.get("status") == "downloading"),
                        "processing": sum(1 for pdf in pdf_downloads if pdf.get("status") == "processing"),
                        "success": sum(1 for pdf in pdf_downloads if pdf.get("status") == "success"),
                        "error": sum(1 for pdf in pdf_downloads if pdf.get("status") == "error"),
                        "showing": len(selected_pdfs)
                    }
                    
                    data["pdf_downloads"] = selected_pdfs
                else:
                    # For smaller lists, send everything
                    data["pdf_downloads"] = pdf_downloads
            
            # Add additional details if provided
            if details:
                data.update(details)
            
            # Send the update
            emit_socket_event("progress_update", data)
            self.last_emit_time = now
    
    def log_message(self, message, level="info"):
        """Log a message with the appropriate level."""
        if level == "debug":
            logger.debug(message)
        elif level == "info":
            logger.info(message)
        elif level == "warning":
            logger.warning(message)
        elif level == "error":
            logger.error(message)
        else:
            logger.info(message)
    
    def cancel(self):
        """
        Cancel the current task.
        
        Returns:
            bool: True if cancellation was initiated, False otherwise
        """
        if self.is_cancelled:
            return False
            
        self.is_cancelled = True
        self.stats["status"] = "cancelling"
        
        # Cancel any running futures
        with self.stats_lock:
            for future in list(self.running_futures):
                future.cancel()
                
        # Emit cancellation event
        emit_socket_event("task_cancelled", {
            "task_id": self.task_id,
            "message": "Task cancellation requested"
        })
        
        logger.info(f"Task {self.task_id} cancellation requested")
        return True
    
    def get_status(self):
        """
        Get the current status of the task.
        
        Returns:
            dict: Current task status and statistics
        """
        with self.stats_lock:
            stats_copy = self.stats.copy()
            
        # Add derived stats
        stats_copy["elapsed_time"] = time.time() - stats_copy["start_time"]
        stats_copy["progress"] = self.progress if hasattr(self, 'progress') else 0
        stats_copy["is_cancelled"] = self.is_cancelled
        
        # Include basic PDF download stats
        with self.pdf_downloads_lock:
            stats_copy["pdf_downloads_count"] = len(self.pdf_downloads)
            
        return {
            "task_id": self.task_id,
            "status": stats_copy["status"],
            "progress": stats_copy["progress"],
            "stats": stats_copy,
            "output_file": getattr(self, 'output_file', None),
            "output_folder": self.output_folder
        }
    
    def wait_for_completion(self, timeout=None):
        """
        Wait for the task to complete.
        
        Args:
            timeout: Maximum time to wait in seconds
            
        Returns:
            bool: True if task completed, False if timed out
        """
        return self.completion_event.wait(timeout)

# -----------------------------------------------------------------------------
# Task Registry for managing multiple scraping tasks
# -----------------------------------------------------------------------------
class ScraperTaskRegistry:
    """
    Registry for managing and tracking multiple scraping tasks.
    Provides centralized access to task status and control.
    """
    def __init__(self):
        self.tasks = {}
        self.lock = threading.RLock()
        
    def register_task(self, task):
        """Register a new task."""
        with self.lock:
            self.tasks[task.task_id] = task
        return task.task_id
        
    def get_task(self, task_id):
        """Get a task by ID."""
        with self.lock:
            return self.tasks.get(task_id)
            
    def cancel_task(self, task_id):
        """Cancel a task by ID."""
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                return task.cancel()
            return False
            
    def get_status(self, task_id):
        """Get task status by ID."""
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                return task.get_status()
            return None
            
    def list_tasks(self):
        """List all tasks with basic status info."""
        with self.lock:
            return {
                task_id: {
                    "status": task.stats.get("status", "unknown"),
                    "progress": getattr(task, "progress", 0),
                    "start_time": task.stats.get("start_time"),
                    "urls_total": task.stats.get("total_urls", 0),
                    "urls_processed": task.stats.get("processed_urls", 0)
                }
                for task_id, task in self.tasks.items()
            }
            
    def clean_completed_tasks(self, max_age_hours=24):
        """Remove completed tasks older than the specified age."""
        with self.lock:
            now = time.time()
            to_remove = []
            
            for task_id, task in self.tasks.items():
                status = task.stats.get("status")
                if status in ["completed", "failed", "cancelled"]:
                    end_time = task.stats.get("end_time", task.stats.get("start_time", 0))
                    age_hours = (now - end_time) / 3600
                    
                    if age_hours > max_age_hours:
                        to_remove.append(task_id)
            
            # Remove the old tasks
            for task_id in to_remove:
                del self.tasks[task_id]
                
            return len(to_remove)

# Create a global registry instance
task_registry = ScraperTaskRegistry()

# -----------------------------------------------------------------------------
# API Functions for web application integration
# -----------------------------------------------------------------------------
def start_scraping_task(url_configs, output_folder=DEFAULT_OUTPUT_FOLDER, output_file=None, 
                      pdf_options=None, progress_callback=None, completion_callback=None):
    """
    Start a new scraping task and register it in the global registry.
    
    Args:
        url_configs: List of URL configurations
        output_folder: Folder to save results
        output_file: Optional specific output file path
        pdf_options: Options for PDF processing
        progress_callback: Optional callback for progress updates
        completion_callback: Optional callback when task completes
        
    Returns:
        str: Task ID
    """
    # Generate a task ID
    task_id = str(uuid.uuid4())
    
    # Create and initialize the task
    task = BatchWebScraper(task_id, output_folder)
    
    # Set up callbacks if provided
    if progress_callback:
        task.progress_callback = progress_callback
    
    if completion_callback:
        task.completion_callback = completion_callback
    
    # Set PDF options if provided
    if pdf_options:
        task.pdf_options.update(pdf_options)
    
    # Generate output file path if not provided
    if not output_file:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_folder, f"scraper_results_{timestamp}.json")
    
    # Register the task
    task_registry.register_task(task)
    
    # Start the task
    task.start(url_configs, output_file)
    
    return task_id

def get_task_status(task_id):
    """Get status of a task by ID."""
    return task_registry.get_status(task_id)

def cancel_task(task_id):
    """Cancel a task by ID."""
    return task_registry.cancel_task(task_id)

def list_all_tasks():
    """List all registered tasks."""
    return task_registry.list_tasks()

def clean_old_tasks(max_age_hours=24):
    """Clean up old completed tasks."""
    return task_registry.clean_completed_tasks(max_age_hours)

# -----------------------------------------------------------------------------
# Main Function
# -----------------------------------------------------------------------------
def main():
    """
    CLI entry point for the web scraper with enhanced argument parsing.
    
    Usage:
        python unified_web_scraper.py [URL setting [keyword]] ... [OPTIONS]
        
    Examples:
        python unified_web_scraper.py "https://example.com" full --output my_output.json
        python unified_web_scraper.py "https://arxiv.org/abs/2304.03589" pdf --threads 8
        python unified_web_scraper.py "https://example.org" keyword "AI" --output-dir "C:/Downloads"
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced web scraper with PDF download capabilities")
    
    # URL and settings arguments - will be parsed manually
    parser.add_argument("url_settings", nargs="*", help="URLs and settings in sequences: url1 setting1 [keyword1] url2 setting2 [keyword2]")
    
    # Optional global arguments
    parser.add_argument("-o", "--output", default="scraped_content.json", help="Output JSON filename")
    parser.add_argument("-d", "--output-dir", default=DEFAULT_OUTPUT_FOLDER, help="Output directory")
    parser.add_argument("-t", "--threads", type=int, default=DEFAULT_NUM_THREADS, help="Number of threads to use")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="Request timeout in seconds")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress display")
    
    args = parser.parse_args()
    
    # Set up logging based on verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.setLevel(logging.DEBUG)
    
    # Parse the URL settings and keywords
    url_configs = []
    i = 0
    while i < len(args.url_settings):
        if i + 1 >= len(args.url_settings):
            parser.error(f"Missing setting for URL: {args.url_settings[i]}")
        
        url = args.url_settings[i]
        setting = args.url_settings[i+1].lower()
        
        if setting == "keyword":
            if i + 2 >= len(args.url_settings):
                parser.error(f"Missing keyword for URL: {url}")
            keyword = args.url_settings[i+2]
            url_configs.append({"url": url, "setting": setting, "keyword": keyword})
            i += 3
        else:
            url_configs.append({"url": url, "setting": setting})
            i += 2
    
    if not url_configs:
        parser.error("At least one URL and setting is required")
    
    # Process URLs
    logger.info(f"Processing {len(url_configs)} URLs with {args.threads} threads")
    
    # Define progress callback for CLI
    def progress_callback(current, total):
        if not args.no_progress:
            print(f"Progress: {current}/{total} [{current/total*100:.1f}%]", end="\r")
    
    # Process the URLs
    results = process_multiple_urls(
        url_configs=url_configs,
        output_folder=args.output_dir,
        num_threads=args.threads,
        progress_callback=progress_callback
    )
    
    # Save the aggregated results
    output_file = FilePathUtility.get_output_filepath(args.output, folder_override=args.output_dir)
    
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {output_file}")
    except Exception as e:
        logger.error(f"Error saving results: {e}")
        print(f"\nError saving results: {e}")
        print(json.dumps(results, indent=2))
    
    # Print a summary
    success = sum(1 for res in results if "error" not in res)
    print(f"\nSummary: {success}/{len(results)} URLs processed successfully")
    
if __name__ == "__main__":
    main()