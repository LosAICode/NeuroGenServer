"""
PDF Downloader Blueprint
Dedicated module for handling PDF download operations
Separated from web scraper for better modularity
"""

from flask import Blueprint, request, jsonify, send_from_directory, abort
import logging
import uuid
import time
import os
import threading
import tempfile
import hashlib
import requests
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path

# Import necessary modules and utilities
from blueprints.core.services import (
    add_task, get_task, remove_task,
    structured_error_response, emit_task_error,
    BaseTask
)
from blueprints.core.utils import get_output_filepath, sanitize_filename
from blueprints.core.structify_integration import structify_module
from blueprints.features.pdf_processor import analyze_pdf_structure

# Import centralized download function
try:
    from centralized_download_pdf import enhanced_download_pdf
    centralized_download_available = True
except ImportError:
    centralized_download_available = False

# Try to import python-magic for file type detection
try:
    import magic
    magic_available = True
except ImportError:
    magic_available = False

# Default settings
DEFAULT_OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'downloads')

logger = logging.getLogger(__name__)

# Initialize logger if needed
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Create the blueprint
pdf_downloader_bp = Blueprint('pdf_downloader', __name__, url_prefix='/api/pdf')

# Export the blueprint
__all__ = ['pdf_downloader_bp', 'download_pdf_enhanced', 'batch_download_pdfs']


class PdfDownloadTask(BaseTask):
    """Task for managing PDF downloads"""
    
    def __init__(self, task_id: str):
        super().__init__(task_id)
        self.task_type = "pdf_download"
        self.downloads: Dict[str, Dict] = {}
        self.processing_queue = []
        self.completed_downloads = []
        self.failed_downloads = []
        
    def add_download(self, url: str, metadata: Dict = None):
        """Add a PDF to the download queue"""
        download_info = {
            'url': url,
            'status': 'queued',
            'progress': 0,
            'metadata': metadata or {},
            'added_time': time.time()
        }
        self.downloads[url] = download_info
        
    def start_download(self, url: str, output_folder: str, options: Dict = None):
        """Start downloading a specific PDF"""
        if url not in self.downloads:
            self.add_download(url)
            
        download_info = self.downloads[url]
        download_info['status'] = 'downloading'
        download_info['start_time'] = time.time()
        
        def progress_callback(progress: float, message: str):
            """Update download progress"""
            download_info['progress'] = progress
            download_info['message'] = message
            
            # Emit progress update
            self.emit_progress(progress, f"Downloading {os.path.basename(url)}: {message}")
            
        try:
            # Use centralized download if available
            if centralized_download_available:
                file_path = enhanced_download_pdf(
                    url=url,
                    save_path=output_folder,
                    task_id=self.task_id,
                    progress_callback=progress_callback,
                    timeout=options.get('timeout', 60),
                    max_file_size_mb=options.get('max_file_size_mb', 100),
                    max_retries=options.get('max_retries', 3)
                )
            else:
                # Fallback download implementation
                file_path = self._download_pdf_fallback(url, output_folder, progress_callback)
                
            if file_path and os.path.exists(file_path):
                download_info['status'] = 'completed'
                download_info['file_path'] = file_path
                download_info['end_time'] = time.time()
                download_info['progress'] = 100
                
                # Process with Structify if requested
                if options and options.get('process_with_structify', True):
                    self._process_with_structify(file_path, output_folder, options)
                    
                self.completed_downloads.append(download_info)
                logger.info(f"Successfully downloaded PDF: {file_path}")
                
            else:
                raise ValueError("Download failed - file not found")
                
        except Exception as e:
            logger.error(f"Error downloading PDF {url}: {e}")
            download_info['status'] = 'failed'
            download_info['error'] = str(e)
            download_info['end_time'] = time.time()
            self.failed_downloads.append(download_info)
            
    def _download_pdf_fallback(self, url: str, output_folder: str, progress_callback: Callable):
        """Fallback PDF download implementation"""
        try:
            os.makedirs(output_folder, exist_ok=True)
            
            # Convert arXiv abstract URLs to PDF URLs
            if 'arxiv.org/abs/' in url:
                url = url.replace('/abs/', '/pdf/') + '.pdf'
                logger.info(f"Converted arXiv abstract URL to PDF URL: {url}")
            
            # Generate filename
            url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
            filename = f"{os.path.basename(url) or 'document'}_{url_hash}.pdf"
            if not filename.endswith('.pdf'):
                filename += '.pdf'
            
            file_path = os.path.join(output_folder, filename)
            
            # Check if already exists
            if os.path.exists(file_path):
                logger.info(f"PDF already exists: {file_path}")
                progress_callback(100, "File already exists")
                return file_path
            
            # Download with proper headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (compatible; Academic-Scraper/1.0)',
                'Accept': 'application/pdf,*/*'
            }
            
            progress_callback(10, "Starting download...")
            
            response = requests.get(url, headers=headers, timeout=60, stream=True)
            response.raise_for_status()
            
            # Get content length for progress tracking
            content_length = response.headers.get('Content-Length')
            total_size = int(content_length) if content_length else 0
            
            progress_callback(20, "Downloading content...")
            
            # Write file in chunks
            downloaded_size = 0
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        
                        # Update progress
                        if total_size > 0:
                            progress = 20 + (downloaded_size / total_size * 70)
                            progress_callback(progress, f"Downloaded {downloaded_size // 1024}KB...")
            
            progress_callback(100, "Download completed")
            logger.info(f"Successfully downloaded PDF: {file_path}")
            return file_path
            
        except Exception as e:
            logger.error(f"Error downloading PDF {url}: {e}")
            return None
            
    def _process_with_structify(self, file_path: str, output_folder: str, options: Dict):
        """Process PDF with Structify module"""
        try:
            if not structify_module:
                logger.warning("Structify module not available for PDF processing")
                return
                
            json_filename = f"{os.path.splitext(os.path.basename(file_path))[0]}_processed.json"
            json_path = os.path.join(output_folder, json_filename)
            
            # Use existing Structify integration
            result = structify_module.process_all_files(
                root_directory=os.path.dirname(file_path),
                output_file=json_path,
                file_filter=lambda f: f == file_path
            )
            
            logger.info(f"PDF processed with Structify: {json_path}")
            
        except Exception as e:
            logger.error(f"Error processing PDF with Structify: {e}")


def download_pdf_enhanced(url: str, output_folder: str, options: Dict = None) -> Dict[str, Any]:
    """
    Enhanced PDF download function with task management
    
    Args:
        url: PDF URL to download
        output_folder: Directory to save the PDF
        options: Download and processing options
        
    Returns:
        Download result with file path and metadata
    """
    task_id = str(uuid.uuid4())
    download_task = PdfDownloadTask(task_id)
    add_task(task_id, download_task)
    
    try:
        download_task.start_download(url, output_folder, options or {})
        
        # Get download result
        if url in download_task.downloads:
            download_info = download_task.downloads[url]
            
            if download_info['status'] == 'completed':
                return {
                    'status': 'success',
                    'file_path': download_info['file_path'],
                    'download_time': download_info.get('end_time', 0) - download_info.get('start_time', 0),
                    'task_id': task_id
                }
            else:
                return {
                    'status': 'failed',
                    'error': download_info.get('error', 'Unknown error'),
                    'task_id': task_id
                }
        else:
            return {
                'status': 'failed',
                'error': 'Download not found in task',
                'task_id': task_id
            }
            
    except Exception as e:
        logger.error(f"Error in enhanced PDF download: {e}")
        return {
            'status': 'failed',
            'error': str(e),
            'task_id': task_id
        }
    finally:
        remove_task(task_id)


def batch_download_pdfs(urls: List[str], output_folder: str, options: Dict = None) -> str:
    """
    Download multiple PDFs in batch
    
    Args:
        urls: List of PDF URLs to download
        output_folder: Directory to save PDFs
        options: Download and processing options
        
    Returns:
        Task ID for tracking batch download progress
    """
    task_id = str(uuid.uuid4())
    download_task = PdfDownloadTask(task_id)
    add_task(task_id, download_task)
    
    # Add all URLs to the task
    for url in urls:
        download_task.add_download(url)
    
    def download_worker():
        """Background worker for batch downloads"""
        try:
            concurrent_downloads = options.get('concurrent_downloads', 3) if options else 3
            
            # Process downloads
            for i, url in enumerate(urls):
                try:
                    download_task.start_download(url, output_folder, options)
                    
                    # Update overall progress
                    overall_progress = ((i + 1) / len(urls)) * 100
                    download_task.emit_progress(
                        overall_progress, 
                        f"Downloaded {i + 1}/{len(urls)} PDFs"
                    )
                    
                except Exception as e:
                    logger.error(f"Error downloading {url}: {e}")
                    continue
            
            # Mark task as completed
            download_task.status = "completed"
            download_task.emit_completion({
                'total_downloads': len(urls),
                'successful_downloads': len(download_task.completed_downloads),
                'failed_downloads': len(download_task.failed_downloads),
                'output_folder': output_folder
            })
            
        except Exception as e:
            logger.error(f"Error in batch download worker: {e}")
            download_task.emit_error(str(e))
        finally:
            remove_task(task_id)
    
    # Start background worker
    thread = threading.Thread(target=download_worker)
    thread.daemon = True
    thread.start()
    
    return task_id


@pdf_downloader_bp.route('/download', methods=['POST'])
def api_download_pdf():
    """
    API endpoint to download a single PDF
    
    Expected JSON body:
    {
        "url": "https://example.com/paper.pdf",
        "output_folder": "path/to/output",
        "options": {
            "process_with_structify": true,
            "extract_tables": true,
            "use_ocr": true,
            "timeout": 60,
            "max_file_size_mb": 100
        }
    }
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url = data.get("url")
    output_folder = data.get("output_folder", DEFAULT_OUTPUT_FOLDER)
    options = data.get("options", {})
    
    if not url:
        return structured_error_response("URL_REQUIRED", "PDF URL is required.", 400)
    
    try:
        # Ensure output directory exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Download PDF
        result = download_pdf_enhanced(url, output_folder, options)
        
        if result['status'] == 'success':
            return jsonify({
                "status": "success",
                "message": "PDF downloaded successfully",
                "file_path": result['file_path'],
                "download_time": result.get('download_time', 0),
                "task_id": result['task_id']
            })
        else:
            return structured_error_response(
                "DOWNLOAD_FAILED", 
                result.get('error', 'Download failed'), 
                400
            )
            
    except Exception as e:
        logger.error(f"Error in PDF download API: {e}")
        return structured_error_response("DOWNLOAD_ERROR", f"Error: {str(e)}", 500)


@pdf_downloader_bp.route('/batch-download', methods=['POST'])
def api_batch_download():
    """
    API endpoint to download multiple PDFs
    
    Expected JSON body:
    {
        "urls": ["url1", "url2", "url3"],
        "output_folder": "path/to/output",
        "options": {
            "concurrent_downloads": 3,
            "process_with_structify": true,
            "extract_tables": true,
            "use_ocr": true
        }
    }
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    urls = data.get("urls", [])
    output_folder = data.get("output_folder", DEFAULT_OUTPUT_FOLDER)
    options = data.get("options", {})
    
    if not urls or not isinstance(urls, list):
        return structured_error_response("URLS_REQUIRED", "List of URLs is required.", 400)
    
    try:
        # Ensure output directory exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Start batch download
        task_id = batch_download_pdfs(urls, output_folder, options)
        
        return jsonify({
            "status": "started",
            "message": f"Batch download started for {len(urls)} PDFs",
            "task_id": task_id,
            "urls_count": len(urls),
            "output_folder": output_folder
        })
        
    except Exception as e:
        logger.error(f"Error in batch PDF download API: {e}")
        return structured_error_response("BATCH_DOWNLOAD_ERROR", f"Error: {str(e)}", 500)


@pdf_downloader_bp.route('/status/<task_id>', methods=['GET'])
def api_download_status(task_id):
    """Get the status of a PDF download task"""
    task = get_task(task_id)
    if not task or not isinstance(task, PdfDownloadTask):
        return structured_error_response("TASK_NOT_FOUND", f"PDF download task {task_id} not found.", 404)
    
    return jsonify({
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "downloads": {
            "total": len(task.downloads),
            "completed": len(task.completed_downloads),
            "failed": len(task.failed_downloads),
            "in_progress": len([d for d in task.downloads.values() if d['status'] == 'downloading'])
        },
        "error": task.error
    })


@pdf_downloader_bp.route('/cancel/<task_id>', methods=['POST'])
def api_cancel_download(task_id):
    """Cancel a PDF download task"""
    task = get_task(task_id)
    if not task or not isinstance(task, PdfDownloadTask):
        return structured_error_response("TASK_NOT_FOUND", f"PDF download task {task_id} not found.", 404)
    
    task.status = "cancelled"
    remove_task(task_id)
    
    return jsonify({
        "task_id": task_id,
        "status": "cancelled",
        "message": "PDF download task cancelled successfully."
    })


@pdf_downloader_bp.route('/health', methods=['GET'])
def health_check():
    """Health check for PDF downloader module"""
    return jsonify({
        "status": "healthy",
        "module": "pdf_downloader",
        "version": "1.0.0",
        "features": {
            "single_download": True,
            "batch_download": True,
            "progress_tracking": True,
            "structify_integration": structify_module is not None,
            "centralized_download": centralized_download_available
        },
        "endpoints": {
            "download": "/api/pdf/download",
            "batch_download": "/api/pdf/batch-download",
            "status": "/api/pdf/status/<task_id>",
            "cancel": "/api/pdf/cancel/<task_id>",
            "health": "/api/pdf/health"
        }
    })