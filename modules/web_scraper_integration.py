# web_scraper_integration.py
# Enhances the Web Scraper to ensure PDF downloads work correctly and results are saved to history

import os
import sys
import time
import json
import logging
import threading
from datetime import datetime
from typing import Dict, List, Any, Optional, Union

# Set up logging
logger = logging.getLogger(__name__)

# Import ContentFetcher for standardized file handling
try:
    from contentfetcher import content_fetcher
except ImportError:
    logger.error("ContentFetcher not available. Please ensure contentfetcher.py is in the module path.")
    # Create a fallback implementation for testing
    class FallbackContentFetcher:
        def get_output_filepath(self, filename, folder_override=None, ensure_extension=None):
            return os.path.join(folder_override or os.getcwd(), filename)
        
        def save_to_history(self, entry):
            return False
        
        def download_pdf(self, url, output_folder, filename=None, emit_progress=True, task_id=None):
            raise NotImplementedError("PDF download not available without ContentFetcher")
    
    content_fetcher = FallbackContentFetcher()

class WebScraperIntegration:
    """
    Integration layer for Web Scraper module to ensure consistent behavior across
    the platform, fixing issues with PDF downloads and history tracking.
    """
    
    def __init__(self):
        """Initialize the integration layer."""
        self.socketio = None
        self.active_tasks = {}
        self.tasks_lock = threading.RLock()
    
    def init_socketio(self, socketio_instance):
        """
        Initialize the Socket.IO integration.
        
        Args:
            socketio_instance: Socket.IO instance from the Flask app
        """
        self.socketio = socketio_instance
        logger.info("WebScraperIntegration initialized with Socket.IO")
    
    def start_scraper_task(self, urls, download_directory, output_filename, pdf_options=None):
        """
        Start a web scraper task with proper integration.
        
        Args:
            urls: List of URL configurations
            download_directory: Directory to save downloaded files
            output_filename: Output JSON filename
            pdf_options: Options for PDF processing
            
        Returns:
            Task ID for tracking
        """
        try:
            # Import the improved web scraper if available
            try:
                from improved_web_scraper import WebScraperTask
                use_improved_scraper = True
                logger.info("Using improved WebScraperTask")
            except ImportError:
                # Fall back to original scraper
                from web_scraper import ScraperTask
                use_improved_scraper = False
                logger.info("Falling back to original ScraperTask")
            
            # Ensure output directory exists
            os.makedirs(download_directory, exist_ok=True)
            
            # Generate consistent output file path
            output_file = content_fetcher.get_output_filepath(
                output_filename,
                folder_override=download_directory,
                ensure_extension=".json"
            )
            
            # Generate task ID
            task_id = str(uuid.uuid4())
            
            # Create task based on available implementation
            if use_improved_scraper:
                task = WebScraperTask(task_id)
                
                # Define callbacks
                def progress_callback(progress_data):
                    if self.socketio:
                        self.socketio.emit("progress_update", progress_data)
                
                def completion_callback(completion_data):
                    if self.socketio:
                        self.socketio.emit("task_completed", completion_data)
                    
                    # Add to history
                    self._add_to_history(task, completion_data)
                
                def error_callback(error_data):
                    if self.socketio:
                        self.socketio.emit("task_error", error_data)
                
                # Start the task with proper callbacks
                task.start(
                    url_configs=urls,
                    output_folder=download_directory,
                    output_file=output_file,
                    max_scrape_workers=5,
                    max_pdf_workers=3,
                    pdf_options=pdf_options or {},
                    progress_callback=progress_callback,
                    completion_callback=completion_callback,
                    error_callback=error_callback
                )
            else:
                # Initialize and use the original ScraperTask
                task = ScraperTask(
                    task_id=task_id,
                    url_configs=urls,
                    output_folder=download_directory,
                    output_file=output_file
                )
                
                # Set PDF processing options
                task.pdf_options = pdf_options or {}
                
                # Start the task
                task.start()
                
                # Schedule a polling check for completion
                self._schedule_polling_check(task_id)
            
            # Store the task
            with self.tasks_lock:
                self.active_tasks[task_id] = task
            
            logger.info(f"Started web scraper task {task_id} with {len(urls)} URLs")
            logger.info(f"Output will be saved to: {output_file}")
            
            return {
                "task_id": task_id,
                "status": "processing",
                "message": "Web scraping started",
                "output_file": output_file,
                "output_folder": download_directory
            }
        
        except Exception as e:
            logger.error(f"Error starting web scraper task: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }
    
    def get_task_status(self, task_id):
        """
        Get the status of a web scraper task.
        
        Args:
            task_id: Task ID to check
            
        Returns:
            Dictionary with task status information
        """
        with self.tasks_lock:
            task = self.active_tasks.get(task_id)
        
        if not task:
            return {
                "status": "not_found",
                "error": f"Task ID {task_id} not found"
            }
        
        try:
            # Get status based on available method
            if hasattr(task, 'get_status'):
                return task.get_status()
            else:
                # Fallback status object for older implementations
                return {
                    "task_id": task_id,
                    "status": getattr(task, 'status', 'unknown'),
                    "progress": getattr(task, 'progress', 0),
                    "stats": getattr(task, 'stats', {}),
                    "error": getattr(task, 'error', None),
                    "output_file": getattr(task, 'output_file', None),
                    "output_folder": getattr(task, 'output_folder', None),
                    "pdf_downloads": getattr(task, 'pdf_downloads', [])
                }
        except Exception as e:
            logger.error(f"Error getting task status: {e}")
            return {
                "task_id": task_id,
                "status": "error",
                "error": f"Error getting status: {str(e)}"
            }
    
    def cancel_task(self, task_id):
        """
        Cancel a running web scraper task.
        
        Args:
            task_id: Task ID to cancel
            
        Returns:
            True if cancelled successfully, False otherwise
        """
        with self.tasks_lock:
            task = self.active_tasks.get(task_id)
        
        if not task:
            logger.warning(f"Task ID {task_id} not found for cancellation")
            return False
        
        try:
            # Cancel based on available method
            if hasattr(task, 'cancel'):
                result = task.cancel()
            else:
                # Fallback for older implementations
                task.is_cancelled = True
                task.status = "cancelled"
                result = True
            
            if result:
                logger.info(f"Task {task_id} cancelled successfully")
                
                # Emit cancellation event
                if self.socketio:
                    self.socketio.emit("task_cancelled", {
                        "task_id": task_id,
                        "message": "Task cancelled successfully"
                    })
                
                # Remove from active tasks with delay
                def delayed_remove():
                    time.sleep(10)  # Keep task around briefly for status queries
                    with self.tasks_lock:
                        if task_id in self.active_tasks:
                            del self.active_tasks[task_id]
                
                threading.Thread(target=delayed_remove, daemon=True).start()
            
            return result
        
        except Exception as e:
            logger.error(f"Error cancelling task: {e}")
            return False
    
    def _schedule_polling_check(self, task_id, interval=1.0, max_attempts=300):
        """
        Schedule a polling check for task completion.
        This is a fallback for older implementations that don't have callbacks.
        
        Args:
            task_id: Task ID to check
            interval: Polling interval in seconds
            max_attempts: Maximum number of attempts before giving up
        """
        def check_task_completion():
            attempts = 0
            while attempts < max_attempts:
                time.sleep(interval)
                attempts += 1
                
                with self.tasks_lock:
                    task = self.active_tasks.get(task_id)
                
                if not task:
                    logger.warning(f"Task {task_id} not found during polling")
                    return
                
                # Check task status
                status = task.status if hasattr(task, 'status') else getattr(task, 'status', None)
                
                if status in ["completed", "failed", "cancelled"]:
                    logger.info(f"Task {task_id} completed with status: {status}")
                    
                    # Emit completion event
                    if status == "completed" and self.socketio:
                        try:
                            completion_data = {
                                "task_id": task_id,
                                "status": "completed",
                                "stats": getattr(task, 'stats', {}),
                                "output_file": getattr(task, 'output_file', None),
                                "output_folder": getattr(task, 'output_folder', None)
                            }
                            
                            self.socketio.emit("task_completed", completion_data)
                            
                            # Add to history
                            self._add_to_history(task, completion_data)
                        except Exception as e:
                            logger.error(f"Error sending completion event: {e}")
                    
                    # Remove from active tasks with delay
                    def delayed_remove():
                        time.sleep(10)  # Keep task around briefly for status queries
                        with self.tasks_lock:
                            if task_id in self.active_tasks:
                                del self.active_tasks[task_id]
                    
                    threading.Thread(target=delayed_remove, daemon=True).start()
                    return
                
                # Emit progress update for polling
                if self.socketio:
                    try:
                        progress = getattr(task, 'progress', 0)
                        self.socketio.emit("progress_update", {
                            "task_id": task_id,
                            "progress": progress,
                            "status": status,
                            "message": f"Processing: {progress}%",
                            "stats": getattr(task, 'stats', {})
                        })
                    except Exception as e:
                        logger.debug(f"Error sending progress update: {e}")
            
            logger.warning(f"Max polling attempts reached for task {task_id}")
        
        # Start polling thread
        polling_thread = threading.Thread(target=check_task_completion, daemon=True)
        polling_thread.start()
        logger.debug(f"Started polling thread for task {task_id}")
    
    def _add_to_history(self, task, completion_data=None):
        """
        Add the task result to history.
        
        Args:
            task: Task object
            completion_data: Optional completion data dictionary
        """
        try:
            # Get data from completion_data or task object
            if completion_data:
                task_id = completion_data.get("task_id", "")
                status = completion_data.get("status", "")
                output_file = completion_data.get("output_file", "")
                stats = completion_data.get("stats", {})
            else:
                task_id = getattr(task, 'task_id', "")
                status = getattr(task, 'status', "")
                output_file = getattr(task, 'output_file', "")
                stats = getattr(task, 'stats', {})
            
            # Build history entry
            history_entry = {
                "type": "web_scraper",
                "task_id": task_id,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "output_file": output_file,
                "output_folder": getattr(task, 'output_folder', os.path.dirname(output_file) if output_file else ""),
                "status": status,
                "urls_processed": stats.get("processed_urls", 0),
                "urls_total": stats.get("total_urls", 0),
                "pdfs_downloaded": stats.get("pdf_downloads", 0),
                "processing_time": stats.get("duration_seconds", 0)
            }
            
            # Use ContentFetcher to save to history
            content_fetcher.save_to_history(history_entry)
            logger.info(f"Added task {task_id} to history")
            return True
        except Exception as e:
            logger.error(f"Error adding to history: {e}")
            return False
    
    def download_pdf(self, url, output_folder, task_id=None):
        """
        Download a PDF file with proper progress tracking.
        
        Args:
            url: URL to download from
            output_folder: Directory to save the PDF
            task_id: Optional task ID for tracking
            
        Returns:
            Path to the downloaded PDF
        """
        try:
            # Use ContentFetcher for consistent download behavior
            return content_fetcher.download_pdf(
                url=url,
                output_folder=output_folder,
                emit_progress=True,
                task_id=task_id
            )
        except Exception as e:
            logger.error(f"Error downloading PDF from {url}: {e}")
            
            # Emit error event
            if self.socketio:
                try:
                    self.socketio.emit("pdf_download_progress", {
                        "task_id": task_id,
                        "url": url,
                        "status": "error",
                        "message": f"Download error: {str(e)}"
                    })
                except Exception as socket_err:
                    logger.debug(f"Socket.IO emission failed: {socket_err}")
            
            raise

# Create a global instance for shared use
web_scraper_integration = WebScraperIntegration()

# Function to integrate with app.py
def integrate_with_app(app, socketio, add_custom_routes=True):
    """
    Integrate the enhanced web scraper with the Flask app.
    
    Args:
        app: Flask app instance
        socketio: Socket.IO instance
        add_custom_routes: Whether to add custom routes
        
    Returns:
        True if integration was successful
    """
    # Initialize Socket.IO integration
    web_scraper_integration.init_socketio(socketio)
    
    # Add custom routes if requested
    if add_custom_routes:
        @app.route('/api/scrape', methods=['POST'])
        def start_scraping():
            """Enhanced API endpoint for web scraping with proper integration."""
            data = app.request.get_json()
            if not data:
                return app.jsonify({
                    "status": "error",
                    "error": "No JSON data provided"
                }), 400
            
            urls = data.get("urls")
            download_directory = data.get("download_directory")
            output_filename = data.get("output_filename", "scraper_results.json")
            pdf_options = data.get("pdf_options", {})
            
            if not urls:
                return app.jsonify({
                    "status": "error",
                    "error": "URLs are required"
                }), 400
            
            if not download_directory:
                return app.jsonify({
                    "status": "error",
                    "error": "Download directory is required"
                }), 400
            
            # Start scraper task
            result = web_scraper_integration.start_scraper_task(
                urls=urls,
                download_directory=download_directory,
                output_filename=output_filename,
                pdf_options=pdf_options
            )
            
            return app.jsonify(result)
        
        @app.route('/api/scrape/status/<task_id>', methods=['GET'])
        def get_scraping_status(task_id):
            """Get the status of a scraper task."""
            status = web_scraper_integration.get_task_status(task_id)
            return app.jsonify(status)
        
        @app.route('/api/scrape/cancel/<task_id>', methods=['POST'])
        def cancel_scraping(task_id):
            """Cancel a running scraper task."""
            result = web_scraper_integration.cancel_task(task_id)
            
            if result:
                return app.jsonify({
                    "status": "success",
                    "message": "Task cancelled successfully"
                })
            else:
                return app.jsonify({
                    "status": "error",
                    "error": "Failed to cancel task"
                }), 400
        
        @app.route('/api/download-pdf', methods=['POST'])
        def download_pdf():
            """Enhanced PDF download endpoint."""
            data = app.request.get_json()
            if not data:
                return app.jsonify({
                    "status": "error",
                    "error": "No JSON data provided"
                }), 400
            
            url = data.get("url")
            output_folder = data.get("output_folder")
            
            if not url:
                return app.jsonify({
                    "status": "error",
                    "error": "URL is required"
                }), 400
            
            if not output_folder:
                return app.jsonify({
                    "status": "error",
                    "error": "Output folder is required"
                }), 400
            
            try:
                # Ensure output folder exists
                os.makedirs(output_folder, exist_ok=True)
                
                # Download PDF
                pdf_file = web_scraper_integration.download_pdf(
                    url=url,
                    output_folder=output_folder
                )
                
                # Add to history
                history_entry = {
                    "type": "pdf_download",
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "url": url,
                    "file_path": pdf_file,
                    "file_size": os.path.getsize(pdf_file),
                    "output_folder": output_folder
                }
                
                content_fetcher.save_to_history(history_entry)
                
                return app.jsonify({
                    "status": "success",
                    "message": "PDF downloaded successfully",
                    "file_path": pdf_file,
                    "file_name": os.path.basename(pdf_file),
                    "output_folder": output_folder
                })
            
            except Exception as e:
                logger.error(f"Error downloading PDF: {e}")
                return app.jsonify({
                    "status": "error",
                    "error": str(e)
                }), 500
    
    logger.info("Web scraper integration successfully applied")
    return True

# Function to monkey patch existing implementations
def enhance_existing_implementation():
    """
    Enhance existing web scraper implementations with fixes.
    This function attempts to patch the original web_scraper module
    to fix issues with PDF downloads and history tracking.
    
    Returns:
        True if patching was successful
    """
    try:
        # Try to import the original web_scraper
        import web_scraper
        
        # Patch the download_pdf function
        def enhanced_download_pdf(url, save_path, emit_progress=True, task_id=None, timeout=30):
            """Enhanced PDF download function with consistent behavior."""
            return content_fetcher.download_pdf(
                url=url,
                output_folder=save_path,
                emit_progress=emit_progress,
                task_id=task_id
            )
        
        # Store original function for reference
        web_scraper._original_download_pdf = web_scraper.download_pdf
        web_scraper.download_pdf = enhanced_download_pdf
        
        # Patch ScraperTask to save to history on completion
        if hasattr(web_scraper, 'ScraperTask'):
            original_finalize = web_scraper.ScraperTask._finalize_results
            
            def enhanced_finalize(self, all_results):
                """Enhanced finalize method that saves to history."""
                # Call original method
                result = original_finalize(self, all_results)
                
                # Save to history
                try:
                    history_entry = {
                        "type": "web_scraper",
                        "task_id": self.task_id,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "output_file": self.output_file,
                        "output_folder": self.output_folder,
                        "status": "completed",
                        "urls_processed": len(all_results),
                        "urls_total": len(self.url_configs),
                        "pdfs_downloaded": len(self.pdf_downloads) if hasattr(self, 'pdf_downloads') else 0,
                        "processing_time": time.time() - self.stats["start_time"] if hasattr(self, 'stats') else 0
                    }
                    
                    content_fetcher.save_to_history(history_entry)
                    logger.info(f"Added task {self.task_id} to history")
                except Exception as e:
                    logger.error(f"Error adding to history: {e}")
                
                return result
            
            # Apply the patched method
            web_scraper.ScraperTask._finalize_results = enhanced_finalize
        
        logger.info("Enhanced existing web_scraper implementation successfully")
        return True
    
    except ImportError:
        logger.warning("web_scraper module not available for enhancement")
        return False
    except Exception as e:
        logger.error(f"Error enhancing web_scraper: {e}")
        return False

# Apply enhancements to existing implementation
enhance_existing_implementation()