# contentfetcher.py
# Enhanced download and file management utility to standardize behavior across all modules

import os
import re
import time
import json
import logging
import hashlib
import threading
import requests
from urllib.parse import urljoin, urlparse
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, List, Optional, Tuple, Any, Union, Callable

logger = logging.getLogger(__name__)

class ContentFetcher:
    """
    Unified content downloading and management utility that standardizes behavior
    across all NeuroGen.Server modules (File Scraper, Web Scraper, YouTube Downloader).
    
    Features:
    - Consistent file naming and output path resolution
    - Robust error handling with retries
    - Progress tracking and events
    - Unified history management
    """
    
    def __init__(self, default_output_folder=None, emit_socket_events=True):
        """
        Initialize the ContentFetcher with configuration.
        
        Args:
            default_output_folder: Default directory for downloads
            emit_socket_events: Whether to emit Socket.IO events
        """
        self.default_output_folder = default_output_folder or os.path.join(
            os.path.expanduser("~"), "Documents", "NeuroGen"
        )
        self.emit_socket_events = emit_socket_events
        
        # Ensure default folder exists
        os.makedirs(self.default_output_folder, exist_ok=True)
        
        # Create a requests session with retries
        self.session = self._create_requests_session()
        
        # Threading lock for thread safety
        self.lock = threading.RLock()
        
        # Import history module for consistent history tracking
        try:
            import history_manager
            self.history_manager = history_manager
            logger.info("History manager loaded successfully")
        except ImportError:
            logger.warning("History manager not available, history tracking disabled")
            self.history_manager = None
    
    def _create_requests_session(self):
        """Create a requests session with retry capabilities"""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        
        # Mount adapters with retry strategy
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set user agent for better compatibility
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Connection": "keep-alive"
        })
        
        return session
    
    def sanitize_filename(self, filename):
        """
        Sanitize a filename to remove unsafe characters.
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove unsafe characters
        sanitized = re.sub(r'[\\/*?:"<>|]', "", filename)
        
        # Limit length
        if len(sanitized) > 100:
            sanitized = sanitized[:100]
            
        # Ensure filename is not empty
        if not sanitized:
            sanitized = "unnamed"
            
        return sanitized
    
    def get_output_filepath(self, filename, folder_override=None, ensure_extension=None):
        """
        Generate a proper output file path ensuring the file has the right extension
        and the containing directory exists.
        
        Args:
            filename: Base filename
            folder_override: Override default output folder
            ensure_extension: File extension to enforce (e.g., '.json')
            
        Returns:
            Absolute path to properly named output file
        """
        # Handle None input
        if not filename:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"output_{timestamp}"
        
        # Remove the extension if it matches the ensure_extension
        if ensure_extension and filename.lower().endswith(ensure_extension.lower()):
            filename = filename[:-len(ensure_extension)]
        
        # Sanitize the filename
        sanitized_name = self.sanitize_filename(filename)
        
        # Add extension if needed
        if ensure_extension:
            if not ensure_extension.startswith('.'):
                ensure_extension = '.' + ensure_extension
            sanitized_name = sanitized_name + ensure_extension
        
        # Determine target folder
        if folder_override:
            target_folder = folder_override
        else:
            target_folder = self.default_output_folder
        
        # Make target folder absolute
        target_folder = os.path.abspath(target_folder)
        
        # Ensure target folder exists
        try:
            if not os.path.isdir(target_folder):
                os.makedirs(target_folder, exist_ok=True)
                logger.info(f"Created output directory: {target_folder}")
        except Exception as e:
            logger.error(f"Failed to create directory {target_folder}: {e}")
            # Fall back to default folder if we can't create the directory
            target_folder = self.default_output_folder
            try:
                os.makedirs(target_folder, exist_ok=True)
            except Exception as e2:
                logger.error(f"Failed to create fallback directory: {e2}")
                # Last resort: use temp directory
                import tempfile
                target_folder = tempfile.gettempdir()
        
        # Build the final path
        output_path = os.path.join(target_folder, sanitized_name)
        logger.info(f"Output file will be saved at: {output_path}")
        
        return output_path
    
    def get_filename_from_job(self, job_id, url, output_folder, default_extension=".json"):
        """
        Generate a consistent filename from a job ID and URL.
        Used to ensure the same file naming across all modules.
        
        Args:
            job_id: Unique job identifier
            url: Source URL
            output_folder: Output folder
            default_extension: Extension to add if none exists
            
        Returns:
            Tuple of (filename, full_path)
        """
        # Extract filename components
        parsed_url = urlparse(url)
        path = parsed_url.path
        
        # Get URL-derived name or use a default
        if path and path.strip('/'):
            url_name = os.path.basename(path.rstrip('/'))
            if not url_name:
                url_name = "document"
        else:
            url_name = "document"
        
        # Create a unique identifier from job ID and URL
        unique_id = hashlib.md5(f"{job_id}_{url}".encode()).hexdigest()[:8]
        
        # Combine components
        filename = f"{self.sanitize_filename(url_name)}_{unique_id}"
        
        # Add extension if not present
        if not any(filename.lower().endswith(ext) for ext in ['.json', '.pdf', '.txt']):
            filename += default_extension
        
        # Get full path
        full_path = os.path.join(output_folder, filename)
        
        return filename, full_path
    
    def download_file(self, url, output_folder, filename=None, emit_progress=True, task_id=None):
        """
        Download a file with progress tracking.
        
        Args:
            url: URL to download from
            output_folder: Directory to save the file
            filename: Optional filename override
            emit_progress: Whether to emit progress events
            task_id: Optional task ID for tracking
            
        Returns:
            Path to the downloaded file
        """
        logger.info(f"Downloading file from: {url}")
        
        # Create output directory if it doesn't exist
        os.makedirs(output_folder, exist_ok=True)
        
        # Determine filename
        if filename:
            # Use provided filename
            safe_filename = self.sanitize_filename(filename)
        else:
            # Extract and sanitize filename from URL
            parsed_url = urlparse(url)
            path = parsed_url.path
            url_filename = os.path.basename(path)
            
            if not url_filename:
                # Generate a generic filename with a hash
                url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
                url_filename = f"download_{url_hash}"
            
            safe_filename = self.sanitize_filename(url_filename)
        
        # Determine file extension based on URL or Content-Type
        file_ext = os.path.splitext(safe_filename)[1]
        if not file_ext:
            try:
                # Try to determine extension from Content-Type header
                head_response = self.session.head(url, timeout=10)
                content_type = head_response.headers.get('Content-Type', '')
                
                if 'application/pdf' in content_type:
                    file_ext = '.pdf'
                elif 'text/html' in content_type:
                    file_ext = '.html'
                elif 'text/plain' in content_type:
                    file_ext = '.txt'
                elif 'application/json' in content_type:
                    file_ext = '.json'
                else:
                    # Default extension
                    file_ext = '.bin'
            except Exception as e:
                logger.warning(f"Error determining file type: {e}")
                # Default to .bin
                file_ext = '.bin'
            
            # Add extension to filename
            safe_filename = os.path.splitext(safe_filename)[0] + file_ext
        
        # Create full file path
        file_path = os.path.join(output_folder, safe_filename)
        
        # Check if file already exists
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            logger.info(f"File already exists: {file_path}")
            return file_path
        
        # Emit initial progress update
        if emit_progress:
            self._emit_download_progress(task_id, url, 0, "starting", "Starting download...")
        
        # Download with retries
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Stream download to handle large files efficiently
                response = self.session.get(
                    url, 
                    stream=True, 
                    timeout=30
                )
                response.raise_for_status()
                
                # Get content length for progress tracking
                content_length = int(response.headers.get('Content-Length', 0))
                downloaded_bytes = 0
                
                # Download file in chunks
                with open(file_path, 'wb') as f:
                    for i, chunk in enumerate(response.iter_content(chunk_size=8192)):
                        if chunk:
                            f.write(chunk)
                            downloaded_bytes += len(chunk)
                            
                            # Update progress every 10 chunks
                            if emit_progress and i % 10 == 0 and content_length > 0:
                                progress = min(int(downloaded_bytes / content_length * 100), 99)
                                self._emit_download_progress(
                                    task_id, 
                                    url, 
                                    progress, 
                                    "downloading", 
                                    f"Downloading: {progress}%"
                                )
                
                # Verify the download was successful
                if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                    logger.info(f"File successfully downloaded to: {file_path}")
                    
                    # Final progress update
                    if emit_progress:
                        self._emit_download_progress(
                            task_id, 
                            url, 
                            100, 
                            "success", 
                            "Download complete", 
                            file_path
                        )
                    
                    return file_path
                else:
                    # File is empty or missing
                    logger.warning(f"Download produced an empty or missing file, retrying...")
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    
                    if attempt < max_retries - 1:
                        delay = (2 ** attempt) * 1.5
                        time.sleep(delay)
                    else:
                        raise ValueError("Download produced an empty file")
            
            except Exception as e:
                logger.warning(f"Download attempt {attempt+1}/{max_retries} failed: {e}")
                
                # Emit error progress
                if emit_progress:
                    self._emit_download_progress(
                        task_id, 
                        url, 
                        0, 
                        "error" if attempt == max_retries - 1 else "retrying", 
                        f"Download error: {str(e)}" if attempt == max_retries - 1 else f"Retrying ({attempt+1}/{max_retries})"
                    )
                
                if attempt < max_retries - 1:
                    # Exponential backoff
                    delay = (2 ** attempt) * 1.5
                    time.sleep(delay)
                else:
                    # Final attempt failed
                    raise ValueError(f"Failed to download file after {max_retries} attempts: {e}")
        
        # This line should not be reached due to the exception in the loop
        raise ValueError("Download failed for unknown reasons")
    
    def download_pdf(self, url, output_folder, filename=None, emit_progress=True, task_id=None):
        """
        Download a PDF file with PDF-specific verification.
        
        Args:
            url: URL to download from
            output_folder: Directory to save the PDF
            filename: Optional filename override
            emit_progress: Whether to emit progress events
            task_id: Optional task ID for tracking
            
        Returns:
            Path to the downloaded PDF
        """
        # Convert academic URLs (arXiv) to PDF URLs
        if "arxiv.org/abs/" in url:
            pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
            if not pdf_url.lower().endswith(".pdf"):
                pdf_url += ".pdf"
            logger.info(f"Converted arXiv URL to PDF URL: {pdf_url}")
        else:
            pdf_url = url
        
        # Generate filename if not provided
        if not filename:
            # Extract filename from URL or generate with hash
            url_hash = hashlib.md5(pdf_url.encode()).hexdigest()[:10]
            url_filename = pdf_url.split("/")[-1]
            
            if not url_filename or url_filename == pdf_url:
                url_filename = f"document_{url_hash}.pdf"
            elif not url_filename.lower().endswith('.pdf'):
                url_filename += '.pdf'
            
            filename = self.sanitize_filename(url_filename)
        elif not filename.lower().endswith('.pdf'):
            filename += '.pdf'
        
        # Download file
        file_path = self.download_file(
            pdf_url, 
            output_folder, 
            filename=filename,
            emit_progress=emit_progress,
            task_id=task_id
        )
        
        # Verify it's a valid PDF
        if not self._verify_pdf(file_path):
            if os.path.exists(file_path):
                os.remove(file_path)
            
            if emit_progress:
                self._emit_download_progress(
                    task_id, 
                    url, 
                    0, 
                    "error", 
                    "Invalid PDF file"
                )
            
            raise ValueError("Downloaded file is not a valid PDF")
        
        return file_path
    
    def _verify_pdf(self, file_path, min_size=1000):
        """
        Verify that a file is a valid PDF.
        
        Args:
            file_path: Path to the file
            min_size: Minimum file size in bytes
            
        Returns:
            True if the file is a valid PDF
        """
        try:
            # Check if file exists and has minimum size
            if not os.path.exists(file_path) or os.path.getsize(file_path) < min_size:
                return False
            
            # Check for PDF signature
            with open(file_path, 'rb') as f:
                header = f.read(5)
                return header == b'%PDF-'
        except Exception as e:
            logger.warning(f"Error verifying PDF: {e}")
            return False
    
    def _emit_download_progress(self, task_id, url, progress, status, message, file_path=None):
        """
        Emit a download progress event via Socket.IO.
        
        Args:
            task_id: Task ID for tracking
            url: URL being downloaded
            progress: Progress percentage (0-100)
            status: Current status (starting, downloading, success, error)
            message: Status message
            file_path: Optional path to downloaded file
        """
        if not self.emit_socket_events:
            return
        
        # Build event data
        event_data = {
            "task_id": task_id,
            "url": url,
            "progress": progress,
            "status": status,
            "message": message
        }
        
        # Add file path if available
        if file_path:
            event_data["file_path"] = file_path
        
        # Try to emit the event
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the event
            event_name = "pdf_download_progress" if url.endswith(".pdf") else "download_progress"
            socketio.emit(event_name, event_data)
        except (ImportError, AttributeError) as e:
            logger.debug(f"Socket.IO not available for event emission: {e}")
        except Exception as e:
            logger.warning(f"Error emitting download progress: {e}")
    
    def save_to_history(self, entry):
        """
        Save an entry to the history consistently across all modules.
        
        Args:
            entry: History entry dictionary
            
        Returns:
            True if successful, False otherwise
        """
        if not self.history_manager:
            logger.warning("History manager not available, history not saved")
            return False
        
        # Ensure entry has required fields
        if "type" not in entry:
            entry["type"] = "unknown"
        
        if "timestamp" not in entry:
            entry["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Add to history
        try:
            return self.history_manager.add_to_history(entry)
        except Exception as e:
            logger.error(f"Error saving to history: {e}")
            return False

# Create a global instance for shared use
content_fetcher = ContentFetcher()