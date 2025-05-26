# improved_web_scraper.py

import os
import time
import logging
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Any, Optional, Tuple, Callable
import uuid

# Import error handling utilities
from error_handling import ErrorHandler, RetryableError
from file_path_utility import FilePathUtility

logger = logging.getLogger(__name__)

class WebScraperTask:
    """
    Enhanced Web Scraper task that decouples web scraping from PDF processing.
    Uses a producer-consumer pattern with queues to manage the workflow.
    """
    
    def __init__(self, task_id=None):
        self.task_id = task_id or str(uuid.uuid4())
        self.status = "pending"
        self.progress = 0
        self.stats = {
            "total_urls": 0,
            "processed_urls": 0,
            "successful_urls": 0,
            "failed_urls": 0,
            "pdf_downloads": 0,
            "pdf_downloads_successful": 0,
            "pdf_downloads_failed": 0,
            "start_time": time.time()
        }
        self.error = None
        self.output_folder = None
        self.output_file = None
        self.url_configs = []
        self.is_cancelled = False
        
        # Queues for the producer-consumer pattern
        self.scrape_queue = queue.Queue()  # For web scraping tasks
        self.pdf_queue = queue.Queue()     # For PDF downloading tasks
        self.result_queue = queue.Queue()  # For results
        
        # Threads and locks
        self.scrape_threads = []
        self.pdf_threads = []
        self.result_thread = None
        self.stats_lock = threading.RLock()
        
        # PDF tracking
        self.pdf_downloads = []
        self.pdf_downloads_lock = threading.RLock()
        
        # Event for signaling task completion
        self.completion_event = threading.Event()
        
        # Callbacks
        self.progress_callback = None
        self.completion_callback = None
        self.error_callback = None
    
    def start(self, url_configs, output_folder, output_file=None,
              max_scrape_workers=5, max_pdf_workers=3, pdf_options=None,
              progress_callback=None, completion_callback=None, error_callback=None):
        """
        Start the web scraping task with decoupled PDF processing.
        
        Args:
            url_configs: List of URL configuration dictionaries
            output_folder: Folder to save downloaded files
            output_file: JSON output file path (optional)
            max_scrape_workers: Maximum number of concurrent scraping workers
            max_pdf_workers: Maximum number of concurrent PDF download workers
            pdf_options: PDF processing options
            progress_callback: Function to call with progress updates
            completion_callback: Function to call on completion
            error_callback: Function to call on error
            
        Returns:
            The task ID
        """
        if self.status != "pending":
            logger.warning(f"Task {self.task_id} already started with status {self.status}")
            return self.task_id
        
        # Initialize task parameters
        self.url_configs = url_configs
        self.output_folder = os.path.abspath(output_folder)
        self.pdf_options = pdf_options or {}
        self.progress_callback = progress_callback
        self.completion_callback = completion_callback
        self.error_callback = error_callback
        
        # Ensure output folder exists
        os.makedirs(self.output_folder, exist_ok=True)
        
        # Set up output file path
        if output_file:
            self.output_file = FilePathUtility.get_output_filepath(
                output_file, folder_override=self.output_folder
            )
        else:
            # Generate default output filename
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            self.output_file = FilePathUtility.get_output_filepath(
                f"scraper_results_{timestamp}", folder_override=self.output_folder
            )
        
        # Update stats
        with self.stats_lock:
            self.stats["total_urls"] = len(url_configs)
            self.stats["output_folder"] = self.output_folder
            self.stats["output_file"] = self.output_file
        
        logger.info(f"Starting web scraper task {self.task_id} with {len(url_configs)} URLs")
        logger.info(f"Output folder: {self.output_folder}")
        logger.info(f"Output file: {self.output_file}")
        
        # Set up queues
        for i, config in enumerate(url_configs):
            self.scrape_queue.put((i, config))
        
        # Set status to processing
        self.status = "processing"
        
        # Start worker threads
        self._start_worker_threads(max_scrape_workers, max_pdf_workers)
        
        # Start result processor thread
        self.result_thread = threading.Thread(
            target=self._process_results,
            daemon=True
        )
        self.result_thread.start()
        
        # Return task ID for tracking
        return self.task_id
    
    def _start_worker_threads(self, max_scrape_workers, max_pdf_workers):
        """Start the worker threads for scraping and PDF downloading"""
        # Determine optimal number of workers based on URL count and CPU cores
        actual_scrape_workers = min(max_scrape_workers, len(self.url_configs), os.cpu_count() or 4)
        actual_pdf_workers = min(max_pdf_workers, os.cpu_count() or 2)
        
        logger.info(f"Starting {actual_scrape_workers} scraper threads and {actual_pdf_workers} PDF threads")
        
        # Start scraper threads
        for i in range(actual_scrape_workers):
            t = threading.Thread(
                target=self._scraper_worker,
                name=f"scraper-{i}",
                daemon=True
            )
            self.scrape_threads.append(t)
            t.start()
        
        # Start PDF download threads
        for i in range(actual_pdf_workers):
            t = threading.Thread(
                target=self._pdf_worker,
                name=f"pdf-{i}",
                daemon=True
            )
            self.pdf_threads.append(t)
            t.start()
    
    def _scraper_worker(self):
        """Worker thread for web scraping"""
        while not self.is_cancelled:
            try:
                # Get a URL config from the queue with timeout to check for cancellation
                try:
                    idx, config = self.scrape_queue.get(timeout=1)
                except queue.Empty:
                    # If queue is empty, check if task should finish
                    if self.scrape_queue.empty():
                        break
                    continue
                
                # Process the URL configuration
                try:
                    url = config.get("url", "")
                    setting = config.get("setting", "full").lower()
                    keyword = config.get("keyword", "")
                    
                    logger.info(f"Processing URL: {url} with setting {setting}")
                    
                    # Apply different behavior based on setting
                    if setting == "pdf":
                        # For PDFs, just enqueue for download but don't process yet
                        self.pdf_queue.put((idx, config))
                        
                        # Track in stats
                        with self.stats_lock:
                            self.stats["processed_urls"] += 1
                            
                        # Update progress
                        self._update_progress()
                    else:
                        # For non-PDF settings, process directly
                        result = self._process_url(url, setting, keyword)
                        
                        # Put the result in the result queue
                        self.result_queue.put((idx, config, result))
                        
                        # Update stats
                        with self.stats_lock:
                            self.stats["processed_urls"] += 1
                            if "error" not in result:
                                self.stats["successful_urls"] += 1
                            else:
                                self.stats["failed_urls"] += 1
                        
                        # Update progress
                        self._update_progress()
                
                except Exception as e:
                    logger.error(f"Error processing URL {config.get('url', '')}: {e}")
                    
                    # Put error result in the result queue
                    error_result = {"error": str(e), "url": config.get("url", "")}
                    self.result_queue.put((idx, config, error_result))
                    
                    # Update stats
                    with self.stats_lock:
                        self.stats["processed_urls"] += 1
                        self.stats["failed_urls"] += 1
                    
                    # Update progress
                    self._update_progress()
                
                finally:
                    # Mark the task as done
                    self.scrape_queue.task_done()
            
            except Exception as e:
                logger.error(f"Unexpected error in scraper worker: {e}")
                # Don't break the worker loop for unexpected errors
    
    def _pdf_worker(self):
        """Worker thread for PDF downloading and processing"""
        while not self.is_cancelled:
            try:
                # Get a PDF URL from the queue with timeout to check for cancellation
                try:
                    idx, config = self.pdf_queue.get(timeout=1)
                except queue.Empty:
                    # If queue is empty, check if task should finish
                    if self.pdf_queue.empty() and self.scrape_queue.empty():
                        break
                    continue
                
                # Process the PDF download
                try:
                    url = config.get("url", "")
                    
                    # Add to PDF downloads tracking
                    with self.pdf_downloads_lock:
                        pdf_info = {
                            "url": url,
                            "status": "downloading",
                            "message": "Starting download...",
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                        }
                        self.pdf_downloads.append(pdf_info)
                        pdf_index = len(self.pdf_downloads) - 1
                    
                    # Update progress with PDF download info
                    self._update_progress()
                    
                    # Download the PDF with retry logic
                    pdf_result = ErrorHandler.retry_with_backoff(
                        lambda: self._download_and_process_pdf(url, self.output_folder),
                        max_attempts=3,
                        base_delay=2.0,
                        jitter=True
                    )
                    
                    # Update PDF download status
                    with self.pdf_downloads_lock:
                        if pdf_index < len(self.pdf_downloads):
                            if "error" in pdf_result:
                                self.pdf_downloads[pdf_index].update({
                                    "status": "error",
                                    "message": pdf_result["error"],
                                    "error": pdf_result["error"],
                                    "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                                })
                                
                                # Update stats
                                with self.stats_lock:
                                    self.stats["pdf_downloads"] += 1
                                    self.stats["pdf_downloads_failed"] += 1
                            else:
                                self.pdf_downloads[pdf_index].update({
                                    "status": "success",
                                    "message": "Download and processing complete",
                                    "filePath": pdf_result.get("pdf_file", ""),
                                    "jsonFile": pdf_result.get("json_file", ""),
                                    "fileSize": pdf_result.get("pdf_size", 0),
                                    "documentType": pdf_result.get("document_type", ""),
                                    "tablesExtracted": pdf_result.get("tables_extracted", 0),
                                    "referencesExtracted": pdf_result.get("references_extracted", 0),
                                    "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                                })
                                
                                # Update stats
                                with self.stats_lock:
                                    self.stats["pdf_downloads"] += 1
                                    self.stats["pdf_downloads_successful"] += 1
                    
                    # Put result in the result queue
                    self.result_queue.put((idx, config, pdf_result))
                    
                    # Update stats
                    with self.stats_lock:
                        self.stats["processed_urls"] += 1
                        if "error" not in pdf_result:
                            self.stats["successful_urls"] += 1
                        else:
                            self.stats["failed_urls"] += 1
                    
                    # Update progress
                    self._update_progress()
                
                except Exception as e:
                    logger.error(f"Error downloading PDF from {config.get('url', '')}: {e}")
                    
                    # Update PDF download status if it exists
                    with self.pdf_downloads_lock:
                        pdf_index = next((i for i, pdf in enumerate(self.pdf_downloads) 
                                        if pdf.get("url") == config.get("url", "")), -1)
                        
                        if pdf_index >= 0:
                            self.pdf_downloads[pdf_index].update({
                                "status": "error",
                                "message": str(e),
                                "error": str(e),
                                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                            })
                    
                    # Put error result in the result queue
                    error_result = {"error": str(e), "url": config.get("url", "")}
                    self.result_queue.put((idx, config, error_result))
                    
                    # Update stats
                    with self.stats_lock:
                        self.stats["processed_urls"] += 1
                        self.stats["failed_urls"] += 1
                        self.stats["pdf_downloads"] += 1
                        self.stats["pdf_downloads_failed"] += 1
                    
                    # Update progress
                    self._update_progress()
                
                finally:
                    # Mark the task as done
                    self.pdf_queue.task_done()
            
            except Exception as e:
                logger.error(f"Unexpected error in PDF worker: {e}")
                # Don't break the worker loop for unexpected errors
    
    def _process_results(self):
        """Thread that processes and aggregates results"""
        all_results = []
        
        while not self.is_cancelled:
            try:
                # Check for completion
                if (self.scrape_queue.empty() and self.pdf_queue.empty() and 
                    self.result_queue.empty() and 
                    len(all_results) == len(self.url_configs)):
                    # All processing is done
                    logger.info(f"All URLs processed, generating final output")
                    self._finalize_results(all_results)
                    break
                
                # Get a result from the queue with timeout
                try:
                    idx, config, result = self.result_queue.get(timeout=1)
                    
                    # Store result at the correct index
                    while len(all_results) <= idx:
                        all_results.append(None)
                    
                    all_results[idx] = {
                        "url": config.get("url", ""),
                        "setting": config.get("setting", ""),
                        "result": result
                    }
                    
                    # Mark the task as done
                    self.result_queue.task_done()
                    
                except queue.Empty:
                    # No results yet, continue waiting
                    continue
            
            except Exception as e:
                logger.error(f"Unexpected error in result processor: {e}")
                # Don't break the worker loop for unexpected errors
    
    def _finalize_results(self, all_results):
        """Finalize all results and save to output file"""
        try:
            # Fill in any missing results with error placeholders
            for i in range(len(all_results)):
                if all_results[i] is None:
                    url = self.url_configs[i].get("url", f"url-{i}") if i < len(self.url_configs) else f"url-{i}"
                    all_results[i] = {
                        "url": url,
                        "setting": self.url_configs[i].get("setting", "") if i < len(self.url_configs) else "",
                        "result": {"error": "Processing was not completed", "url": url}
                    }
            
            # Calculate processing time
            processing_time = time.time() - self.stats["start_time"]
            
            # Update stats with final information
            with self.stats_lock:
                self.stats["status"] = "completed"
                self.stats["duration_seconds"] = processing_time
                self.stats["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                self.stats["results_count"] = len(all_results)
            
            # Create final output structure
            final_result = {
                "task_id": self.task_id,
                "status": "completed",
                "stats": self.stats,
                "results": all_results,
                "pdf_downloads": self.pdf_downloads
            }
            
            # Save to output file
            import json
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(final_result, f, indent=2)
            
            logger.info(f"Results saved to {self.output_file}")
            
            # Set progress to 100% and status to completed
            self.progress = 100
            self.status = "completed"
            
            # Update progress one last time
            self._update_progress()
            
            # Signal completion
            self.completion_event.set()
            
            # Call completion callback if provided
            if self.completion_callback:
                try:
                    self.completion_callback({
                        "task_id": self.task_id,
                        "status": "completed",
                        "output_file": self.output_file,
                        "output_folder": self.output_folder,
                        "stats": self.stats
                    })
                except Exception as e:
                    logger.error(f"Error in completion callback: {e}")
        
        except Exception as e:
            logger.error(f"Error finalizing results: {e}")
            self.error = str(e)
            self.status = "failed"
            
            # Signal completion even though there was an error
            self.completion_event.set()
            
            # Call error callback if provided
            if self.error_callback:
                try:
                    self.error_callback({
                        "task_id": self.task_id,
                        "error": str(e)
                    })
                except Exception as cb_error:
                    logger.error(f"Error in error callback: {cb_error}")
    
    def _update_progress(self):
        """Update the progress percentage and call progress callback if available"""
        with self.stats_lock:
            total_urls = max(1, self.stats["total_urls"])  # Avoid division by zero
            if total_urls > 0:
                self.progress = min(99, int((self.stats["processed_urls"] / total_urls) * 100))
            
            # When all URLs are processed, Structify will handle the final step
            if self.stats["processed_urls"] == total_urls:
                self.progress = 99  # Leave the last 1% for final processing
            
            progress_data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status,
                "message": f"Processed {self.stats['processed_urls']} of {total_urls} URLs",
                "stats": dict(self.stats),  # Create a copy to avoid thread issues
                "pdf_downloads": list(self.pdf_downloads)  # Create a copy to avoid thread issues
            }
        
        # Call progress callback if provided
        if self.progress_callback:
            try:
                self.progress_callback(progress_data)
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")
    
    def _process_url(self, url, setting, keyword=""):
        """
        Process a URL based on setting. This is a placeholder function.
        In a real implementation, this would call web_scraper.process_url.
        """
        try:
            if setting == "full":
                # Full text extraction
                return {"url": url, "setting": "full", "message": "Full text extracted"}
            
            elif setting == "metadata":
                # Just metadata
                return {"url": url, "setting": "metadata", "message": "Metadata extracted"}
            
            elif setting == "title":
                # Just title
                return {"url": url, "setting": "title", "message": "Title extracted"}
            
            elif setting == "keyword":
                # Keyword search
                return {"url": url, "setting": "keyword", "keyword": keyword, "message": "Keyword search completed"}
            
            else:
                return {"error": f"Unknown setting: {setting}", "url": url}
        
        except Exception as e:
            logger.error(f"Error processing URL {url}: {e}")
            return {"error": str(e), "url": url}
    
    def _download_and_process_pdf(self, url, output_folder):
        """
        Download and process a PDF. This is a placeholder function.
        In a real implementation, this would call download_pdf and then process_pdf.
        """
        try:
            # In a real implementation, this would use the actual download_pdf function
            pdf_file = f"{output_folder}/downloaded_{url.split('/')[-1]}.pdf"
            
            # Simulate PDF download
            import time
            time.sleep(1)  # Simulate network delay
            
            # Create a mock PDF file for testing
            with open(pdf_file, 'w') as f:
                f.write("Mock PDF content")
            
            # In a real implementation, this would process the PDF
            # For now, just return a success response
            return {
                "status": "success",
                "url": url,
                "pdf_file": pdf_file,
                "pdf_size": os.path.getsize(pdf_file),
                "document_type": "mock",
                "tables_extracted": 0,
                "references_extracted": 0
            }
        
        except Exception as e:
            logger.error(f"Error downloading/processing PDF from {url}: {e}")
            return {"error": str(e), "url": url}
    
    def wait_for_completion(self, timeout=None):
        """
        Wait for the task to complete, with an optional timeout.
        
        Args:
            timeout: Maximum time to wait in seconds, or None to wait indefinitely
            
        Returns:
            True if the task completed, False if it timed out
        """
        return self.completion_event.wait(timeout)
    
    def cancel(self):
        """
        Cancel the task.
        
        Returns:
            True if task was successfully cancelled
        """
        if self.status == "completed" or self.status == "failed":
            return False
        
        logger.info(f"Cancelling task {self.task_id}")
        self.is_cancelled = True
        self.status = "cancelled"
        
        # Signal completion
        self.completion_event.set()
        
        # Call error callback if provided
        if self.error_callback:
            try:
                self.error_callback({
                    "task_id": self.task_id,
                    "error": "Task cancelled by user"
                })
            except Exception as e:
                logger.error(f"Error in error callback: {e}")
        
        return True
    
    def get_status(self):
        """
        Get the current status of the task.
        
        Returns:
            Dictionary with task status information
        """
        with self.stats_lock:
            return {
                "task_id": self.task_id,
                "status": self.status,
                "progress": self.progress,
                "stats": dict(self.stats),  # Create a copy
                "error": self.error,
                "output_file": self.output_file,
                "output_folder": self.output_folder,
                "pdf_downloads": list(self.pdf_downloads)  # Create a copy
            }

# Example of how to use this class with a Flask or other web framework
def start_scraper_task(urls, download_directory, output_filename, pdf_options):
    """
    Start a web scraper task and return the task ID.
    
    Args:
        urls: List of URL configurations
        download_directory: Directory for downloaded files
        output_filename: Output JSON filename
        pdf_options: Options for PDF processing
        
    Returns:
        Task ID for tracking
    """
    # Create a new task
    task = WebScraperTask()
    
    # Progress callback that emits Socket.IO events if available
    def progress_callback(progress_data):
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the progress update event
            socketio.emit("progress_update", progress_data)
            
            # If there are PDF downloads, also emit PDF download progress for each
            if progress_data.get("pdf_downloads"):
                for pdf in progress_data["pdf_downloads"]:
                    if pdf.get("status") != "downloading":  # Only emit for non-downloading status
                        socketio.emit("pdf_download_progress", {
                            "task_id": progress_data["task_id"],
                            "url": pdf.get("url", ""),
                            "status": pdf.get("status", ""),
                            "message": pdf.get("message", ""),
                            "file_path": pdf.get("filePath", "")
                        })
        except (ImportError, AttributeError):
            # Socket.IO not available, log to console instead
            logger.debug(f"Progress update: {progress_data['progress']}%")
    
    # Completion callback
    def completion_callback(completion_data):
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the task completed event
            socketio.emit("task_completed", completion_data)
        except (ImportError, AttributeError):
            # Socket.IO not available, log to console instead
            logger.info(f"Task completed: {completion_data}")
    
    # Error callback
    def error_callback(error_data):
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the task error event
            socketio.emit("task_error", error_data)
        except (ImportError, AttributeError):
            # Socket.IO not available, log to console instead
            logger.error(f"Task error: {error_data}")
    
    # Start the task with callbacks
    task_id = task.start(
        url_configs=urls,
        output_folder=download_directory,
        output_file=output_filename,
        max_scrape_workers=5,
        max_pdf_workers=3,
        pdf_options=pdf_options,
        progress_callback=progress_callback,
        completion_callback=completion_callback,
        error_callback=error_callback
    )
    
    # Store the task in a global task registry for status queries
    # In a real implementation, this would use a proper task registry
    if not hasattr(start_scraper_task, "task_registry"):
        start_scraper_task.task_registry = {}
    start_scraper_task.task_registry[task_id] = task
    
    return task_id

def get_scraper_task_status(task_id):
    """
    Get the status of a scraper task.
    
    Args:
        task_id: The task ID to query
        
    Returns:
        Dictionary with task status or None if not found
    """
    if not hasattr(start_scraper_task, "task_registry"):
        return None
    
    task = start_scraper_task.task_registry.get(task_id)
    if not task:
        return None
    
    return task.get_status()

def cancel_scraper_task(task_id):
    """
    Cancel a scraper task.
    
    Args:
        task_id: The task ID to cancel
        
    Returns:
        True if successfully cancelled, False otherwise
    """
    if not hasattr(start_scraper_task, "task_registry"):
        return False
    
    task = start_scraper_task.task_registry.get(task_id)
    if not task:
        return False
    
    return task.cancel()

# Integration with the original web_scraper functions
# These implementations leverage the existing code from web_scraper.py

def integrate_with_original_scraper(task):
    """
    Integrate the WebScraperTask with the original web_scraper.py functions.
    This replaces the placeholder methods with actual implementations.
    
    Args:
        task: The WebScraperTask instance to modify
    """
    # Import the necessary functions from web_scraper
    from web_scraper import (
        process_url,
        download_pdf,
        extract_html_text,
        convert_to_json,
        sanitize_filename
    )
    
    # Override the _process_url method with the original implementation
    def process_url_impl(url, setting, keyword=""):
        """Implementation using original web_scraper.process_url"""
        return process_url(url, setting, keyword, task.output_folder, task.task_id)
    
    # Override the _download_and_process_pdf method with the original implementation
    def download_and_process_pdf_impl(url, output_folder):
        """Implementation using original web_scraper.download_pdf"""
        try:
            # First, download the PDF
            pdf_file = download_pdf(
                url=url,
                save_path=output_folder,
                emit_progress=True,
                task_id=task.task_id
            )
            
            # Get file size
            pdf_size = os.path.getsize(pdf_file) if os.path.exists(pdf_file) else 0
            
            # Process the PDF if requested
            process_pdfs = task.pdf_options.get("process_pdfs", True)
            if process_pdfs and pdf_file and os.path.exists(pdf_file):
                # Generate output filename
                pdf_filename = os.path.basename(pdf_file)
                output_json_name = os.path.splitext(pdf_filename)[0] + "_processed"
                json_path = os.path.join(output_folder, output_json_name + ".json")
                
                # Check if structify_module is available
                import sys
                structify_available = 'structify_module' in sys.modules
                
                if structify_available:
                    try:
                        # Import and use structify module
                        from structify_import import get_claude_module
                        structify_module, _ = get_claude_module()
                        
                        # Check for direct PDF processing capability
                        if hasattr(structify_module, 'process_pdf'):
                            # Get document type
                            doc_type = None
                            if hasattr(structify_module, 'detect_document_type'):
                                try:
                                    doc_type = structify_module.detect_document_type(pdf_file)
                                except Exception as type_err:
                                    logger.warning(f"Error detecting document type: {type_err}")
                            
                            # Process PDF directly
                            result = structify_module.process_pdf(
                                pdf_path=pdf_file,
                                output_path=json_path,
                                max_chunk_size=task.pdf_options.get("chunk_size", 4096),
                                extract_tables=task.pdf_options.get("extract_tables", True),
                                use_ocr=task.pdf_options.get("use_ocr", True) and doc_type == "scan",
                                return_data=True
                            )
                            
                            # Extract metadata for response
                            tables_count = len(result.get("tables", [])) if result else 0
                            references_count = len(result.get("references", [])) if result else 0
                            
                            return {
                                "status": "success",
                                "url": url,
                                "pdf_file": pdf_file,
                                "pdf_size": pdf_size,
                                "json_file": json_path,
                                "document_type": doc_type,
                                "tables_extracted": tables_count,
                                "references_extracted": references_count
                            }
                        else:
                            # Fallback to general processing
                            structify_module.process_all_files(
                                root_directory=output_folder,
                                output_file=json_path,
                                file_filter=lambda f: f == pdf_file
                            )
                            
                            return {
                                "status": "success",
                                "url": url,
                                "pdf_file": pdf_file,
                                "pdf_size": pdf_size,
                                "json_file": json_path
                            }
                    except Exception as e:
                        logger.error(f"Error in PDF processing: {e}")
                        # Return success for the download even if processing failed
                        return {
                            "status": "success_download_only",
                            "url": url,
                            "pdf_file": pdf_file,
                            "pdf_size": pdf_size,
                            "processing_error": str(e)
                        }
                else:
                    # No structify module available
                    return {
                        "status": "success_download_only",
                        "url": url,
                        "pdf_file": pdf_file,
                        "pdf_size": pdf_size
                    }
            else:
                # Download only
                return {
                    "status": "success_download_only",
                    "url": url,
                    "pdf_file": pdf_file,
                    "pdf_size": pdf_size
                }
        except Exception as e:
            logger.error(f"Error downloading PDF from {url}: {e}")
            return {"error": str(e), "url": url}
    
    # Patch the task methods
    task._process_url = process_url_impl
    task._download_and_process_pdf = download_and_process_pdf_impl
    
    return task