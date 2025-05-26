# scraper_core.py - Core functionality shared between app.py and web_scraper.py
import os
import re
import sys
import json
import time
import hashlib
import logging
import requests
import tempfile
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# -----------------------------------------------------------------------------
# Logging Setup
# -----------------------------------------------------------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(console_handler)

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER", 
                                      os.path.join(os.path.expanduser("~"), "Documents", "NeuroGen"))
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", "5"))
DEFAULT_TIMEOUT = int(os.environ.get("PDF_DOWNLOAD_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("PDF_MAX_RETRIES", "3"))
BACKOFF_FACTOR = float(os.environ.get("PDF_BACKOFF_FACTOR", "0.5"))

# Custom User-Agent to avoid bot detection
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "DNT": "1"  # Do Not Track
}

# -----------------------------------------------------------------------------
# Requests Session with Retries
# -----------------------------------------------------------------------------
def create_session() -> requests.Session:
    """Create a requests session with retry capabilities."""
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
    """Sanitize a filename by removing unsafe characters and limiting its length."""
    # Replace unsafe characters with underscores
    sanitized = re.sub(r'[^\w\-. ]', '_', filename)
    # Limit the length of the filename to prevent issues
    return sanitized[:100]

def get_output_filepath(output_filename, folder_override=None):
    """Ensure output file is saved to the correct directory."""
    # Strip .json extension if provided
    if output_filename.lower().endswith('.json'):
        output_filename = output_filename[:-5]
    
    # Sanitize the filename
    sanitized_name = sanitize_filename(output_filename) + ".json"
    
    # Use override folder or default to the DEFAULT_OUTPUT_FOLDER
    target_folder = folder_override or DEFAULT_OUTPUT_FOLDER
    
    # If target folder doesn't exist, create it
    if not os.path.isdir(target_folder):
        try:
            os.makedirs(target_folder, exist_ok=True)
            logger.info(f"Created output directory: {target_folder}")
        except Exception as e:
            logger.warning(f"Failed to create target folder {target_folder}: {e}")
            # Fall back to DEFAULT_OUTPUT_FOLDER
            target_folder = DEFAULT_OUTPUT_FOLDER
            os.makedirs(target_folder, exist_ok=True)
    
    # Construct and ensure the final path
    final_output_path = os.path.join(target_folder, sanitized_name)
    final_output_path = os.path.abspath(final_output_path)
    
    logger.info(f"Output file will be saved at: {final_output_path}")
    return final_output_path

def convert_arxiv_url(url: str) -> str:
    """Convert arXiv abstract URLs to PDF URLs if needed."""
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"):
            pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")
        return pdf_url
    return url

def verify_pdf_content(content: bytes, min_size: int = 1000) -> bool:
    """Verify that content is actually a PDF file by checking for PDF header
    and minimum file size."""
    # Check minimum size
    if len(content) < min_size:
        return False
        
    # Check for PDF magic number
    return content.startswith(b'%PDF-')

# Basic implementation to avoid circular imports - only emit events if socketio is available
def emit_socket_event(event_name, data):
    """Try to emit a Socket.IO event if available."""
    try:
        # This will be available only if we're in a Flask context
        from flask import current_app
        if hasattr(current_app, 'socketio'):
            current_app.socketio.emit(event_name, data)
            return True
    except (ImportError, RuntimeError):
        pass
    
    return False