"""
Centralized Enhanced PDF Download Function
All features consolidated in one place to prevent code breakage
"""

import os
import time
import hashlib
import logging
from typing import Optional, Callable
from blueprints.core.utils import sanitize_filename

logger = logging.getLogger(__name__)
DEFAULT_OUTPUT_FOLDER = "downloads"

def enhanced_download_pdf(url: str, save_path: str = DEFAULT_OUTPUT_FOLDER, 
                         task_id: Optional[str] = None, 
                         progress_callback: Optional[Callable] = None,
                         timeout: int = 60,
                         max_file_size_mb: int = 100,
                         max_retries: int = 3) -> str:
    """
    Centralized, enhanced PDF download function with all features consolidated.
    
    Args:
        url (str): The URL to download from
        save_path (str): Directory where the PDF will be saved
        task_id (Optional[str]): Task ID for progress tracking
        progress_callback (Optional[Callable]): Callback function for progress updates
        timeout (int): Download timeout in seconds (default: 60)
        max_file_size_mb (int): Maximum file size in MB (default: 100)
        max_retries (int): Maximum retry attempts (default: 3)
        
    Returns:
        str: The path to the downloaded PDF file
        
    Raises:
        ValueError: If the download fails
    """
    # Import requests here to ensure availability
    try:
        import requests
    except ImportError:
        raise ValueError("Requests library not available. Cannot download PDF.")
    
    logger.info(f"Starting enhanced PDF download: {url}")
    if task_id:
        logger.info(f"Task ID: {task_id}")
    
    def call_progress(progress: float, message: str):
        """Helper to call progress callback safely"""
        if progress_callback:
            try:
                progress_callback(progress, message)
            except Exception as e:
                logger.debug(f"Progress callback error: {e}")
    
    call_progress(0, "Starting PDF download...")
    
    # Convert arXiv abstract links to PDF links if needed
    if "arxiv.org/abs/" in url:
        pdf_url = url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
        if not pdf_url.lower().endswith(".pdf"):
            pdf_url += ".pdf"
        logger.info(f"Converted arXiv abstract URL to PDF URL: {pdf_url}")
    else:
        pdf_url = url
    
    call_progress(5, "Preparing download...")
    
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
        call_progress(100, "File already exists")
        return file_path
    
    call_progress(10, "Starting download...")
    
    # Enhanced download with progress tracking and file size checking
    for attempt in range(max_retries):
        try:
            call_progress(10 + (attempt * 10), f"Download attempt {attempt + 1}/{max_retries}")
            
            # Use streaming to handle large files efficiently
            response = requests.get(pdf_url, stream=True, timeout=timeout, 
                                  headers={
                                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                      "Accept": "application/pdf,*/*",
                                      "Connection": "keep-alive"
                                  })
            response.raise_for_status()
            
            # Check file size against limit
            content_length = response.headers.get('Content-Length')
            if content_length:
                file_size_mb = int(content_length) / (1024 * 1024)
                if file_size_mb > max_file_size_mb:
                    raise ValueError(f"File size ({file_size_mb:.1f}MB) exceeds limit ({max_file_size_mb}MB)")
                call_progress(25, f"File size: {file_size_mb:.1f}MB")
            
            # Check if content type indicates it's a PDF (if available)
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type and 'application/pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Content type not PDF: {content_type}. Checking content...")
                # Check first few bytes to see if it starts with %PDF
                first_chunk = next(response.iter_content(256), None)
                if not first_chunk or not first_chunk.startswith(b'%PDF-'):
                    raise ValueError(f"Content at {pdf_url} is not a PDF")
            
            call_progress(30, "Downloading file content...")
            
            # Stream content to file with progress tracking
            downloaded_bytes = 0
            total_bytes = int(content_length) if content_length else 0
            
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=16384):
                    if chunk:
                        f.write(chunk)
                        downloaded_bytes += len(chunk)
                        
                        # Update progress during download
                        if total_bytes > 0:
                            download_progress = min(90, 30 + (downloaded_bytes / total_bytes * 60))
                            call_progress(download_progress, f"Downloaded {downloaded_bytes // 1024}KB...")
            
            call_progress(95, "Verifying download...")
            
            # Verify the file is a valid PDF and has content
            if not os.path.exists(file_path) or os.path.getsize(file_path) < 1000:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise ValueError("Downloaded file is not a valid PDF (too small)")
                
            call_progress(100, "Download completed successfully")
            logger.info(f"PDF successfully downloaded to: {file_path}")
            return file_path
            
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                # Exponential backoff
                delay = (2 ** attempt) * 1.5
                logger.info(f"Retrying in {delay:.1f} seconds...")
                call_progress(10 + (attempt * 10), f"Retrying in {delay:.1f}s...")
                time.sleep(delay)
            else:
                call_progress(0, f"Download failed: {str(e)}")
                logger.error(f"Failed to download PDF after {max_retries} attempts: {e}")
                raise ValueError(f"Failed to download PDF from {pdf_url}: {e}")
    
    # This should never be reached, but just in case
    raise ValueError("Unexpected error in download logic")