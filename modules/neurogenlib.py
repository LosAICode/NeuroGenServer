# neurogenlib.py - Integration library for NeuroGen components

import os
import sys
import logging
import json
import time
import threading
from typing import Dict, List, Any, Optional, Tuple, Callable, Union

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(console_handler)

# Attempt to import required components with fallbacks
# MemoryEfficientPDFProcessor
try:
    from optimized_pdf_processor import MemoryEfficientPDFProcessor
    pdf_processor_available = True
    logger.info("Memory-efficient PDF processor is available")
except ImportError:
    pdf_processor_available = False
    logger.warning("Memory-efficient PDF processor not available, using fallback")

# FilePathUtility
try:
    from file_path_utility import FilePathUtility
    file_util_available = True
    logger.info("File path utility is available")
except ImportError:
    file_util_available = False
    logger.warning("File path utility not available, using basic file handling")

# ErrorHandler
try:
    from error_handling import ErrorHandler
    error_handler_available = True
    logger.info("Error handler is available")
except ImportError:
    error_handler_available = False
    logger.warning("Error handler not available, using basic error handling")

# WebScraperTask
try:
    from improved_web_scraper import (
        WebScraperTask,
        start_scraper_task,
        get_scraper_task_status,
        cancel_scraper_task,
        integrate_with_original_scraper
    )
    web_scraper_available = True
    logger.info("Improved web scraper is available")
except ImportError:
    web_scraper_available = False
    logger.warning("Improved web scraper not available, will use original scraper")

# Try to import Structify components
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    structify_available = True
    logger.info("Structify module is available")
except ImportError:
    structify_module = None
    components = {}
    structify_available = False
    logger.warning("Structify module not available")

# Placeholder for the original web_scraper functions
web_scraper_original = None

def import_original_web_scraper():
    """Import the original web_scraper module"""
    global web_scraper_original
    try:
        import web_scraper
        web_scraper_original = web_scraper
        logger.info("Original web_scraper module imported")
        return web_scraper
    except ImportError:
        logger.warning("Original web_scraper module not available")
        return None

# Main integration functions that tie all components together
class NeuroGenProcessor:
    """
    Integration layer that provides a unified interface to all NeuroGen components.
    This class ensures proper integration between components and graceful degradation
    to fallbacks when optimized components are unavailable.
    """
    
    def __init__(self):
        # Initialize components based on availability
        self.pdf_processor = MemoryEfficientPDFProcessor() if pdf_processor_available else None
        
        # Import original web_scraper if needed
        if not web_scraper_available:
            self.web_scraper = import_original_web_scraper()
        else:
            self.web_scraper = None  # Will use improved scraper instead
        
        # Task registry for tracking
        self.task_registry = {}
    
    def process_pdf(self, pdf_path, output_path=None, options=None):
        """
        Process a PDF file with memory efficiency.
        
        Args:
            pdf_path: Path to the PDF file
            output_path: Path for the output JSON (if None, derives from PDF filename)
            options: Dictionary of processing options
            
        Returns:
            Dictionary with processing results
        """
        options = options or {}
        
        try:
            # Ensure proper output path
            if output_path is None:
                if file_util_available:
                    # Use FilePathUtility for consistent path handling
                    output_folder = os.path.dirname(pdf_path)
                    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
                    output_path = FilePathUtility.get_output_filepath(
                        f"{base_name}_processed", folder_override=output_folder)
                else:
                    # Basic fallback
                    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
                    output_path = os.path.join(
                        os.path.dirname(pdf_path), f"{base_name}_processed.json")
            
            # Use the optimized PDF processor if available
            if pdf_processor_available:
                logger.info(f"Using memory-efficient PDF processor for {pdf_path}")
                return self.pdf_processor.process_pdf(
                    pdf_path=pdf_path,
                    output_path=output_path,
                    extract_tables=options.get('extract_tables', True),
                    use_ocr=options.get('use_ocr', True),
                    chunk_size=options.get('chunk_size', 4096)
                )
            
            # Fallback to Structify if available
            elif structify_available and hasattr(structify_module, 'process_pdf'):
                logger.info(f"Using Structify for PDF processing: {pdf_path}")
                return structify_module.process_pdf(
                    pdf_path=pdf_path,
                    output_path=output_path,
                    max_chunk_size=options.get('chunk_size', 4096),
                    extract_tables=options.get('extract_tables', True),
                    use_ocr=options.get('use_ocr', True)
                )
            
            # Fallback to original web_scraper if available
            elif self.web_scraper and hasattr(self.web_scraper, 'process_pdf'):
                logger.info(f"Using original web_scraper for PDF processing: {pdf_path}")
                return self.web_scraper.process_pdf(
                    pdf_path=pdf_path,
                    output_path=output_path,
                    options=options
                )
            
            else:
                raise ImportError("No PDF processing capability available")
                
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}")
            
            if error_handler_available:
                # Use enhanced error handler if available
                return ErrorHandler.handle_pdf_error(
                    pdf_file=pdf_path,
                    error=e,
                    output_folder=os.path.dirname(output_path) if output_path else None
                )
            else:
                # Basic error return
                return {
                    "status": "error",
                    "error": str(e),
                    "file_path": pdf_path
                }
    
    def start_web_scraper(self, urls, download_directory, output_filename, pdf_options=None):
        """
        Start a web scraper task with improved handling.
        
        Args:
            urls: List of URL configurations
            download_directory: Directory for downloaded files
            output_filename: Output JSON filename
            pdf_options: Options for PDF processing
            
        Returns:
            Task ID for tracking
        """
        pdf_options = pdf_options or {}
        
        try:
            # Ensure proper output directory
            if file_util_available:
                # Verify and create the download directory
                success, message, directory = FilePathUtility.verify_and_create_directory(download_directory)
                if not success:
                    logger.error(f"Failed to create download directory: {message}")
                    raise ValueError(f"Invalid download directory: {message}")
                
                # Get proper output file path
                output_path = FilePathUtility.get_output_filepath(
                    output_filename, folder_override=directory)
            else:
                # Basic directory creation
                os.makedirs(download_directory, exist_ok=True)
                directory = download_directory
                
                # Basic output path
                output_path = os.path.join(directory, 
                    f"{output_filename}.json" if not output_filename.lower().endswith('.json') else output_filename)
            
            # Use improved web scraper if available
            if web_scraper_available:
                logger.info("Using improved web scraper")
                task_id = start_scraper_task(
                    urls=urls,
                    download_directory=directory,
                    output_filename=output_path,
                    pdf_options=pdf_options
                )
                
                # Store in registry
                self.task_registry[task_id] = {
                    "type": "web_scraper",
                    "start_time": time.time(),
                    "urls": urls,
                    "download_directory": directory,
                    "output_file": output_path
                }
                
                return task_id
            
            # Fallback to original web_scraper
            elif self.web_scraper:
                logger.info("Using original web_scraper")
                
                # Generate a task ID
                task_id = f"task_{int(time.time())}_{os.getpid()}"
                
                # Start scraper in a thread to be non-blocking
                def scraper_thread():
                    try:
                        result = self.web_scraper.process_multiple_urls(
                            url_configs=urls,
                            output_folder=directory,
                            num_threads=pdf_options.get('num_threads', 5),
                            task_id=task_id
                        )
                        
                        # Save results
                        with open(output_path, 'w', encoding='utf-8') as f:
                            json.dump(result, f, indent=2)
                        
                        # Emit completion
                        try:
                            from app import socketio
                            socketio.emit("task_completed", {
                                "task_id": task_id,
                                "status": "completed",
                                "output_file": output_path,
                                "stats": self._compute_stats(result)
                            })
                        except (ImportError, AttributeError):
                            logger.debug("Socket.IO not available for completion notification")
                            
                    except Exception as e:
                        logger.error(f"Error in scraper thread: {e}")
                        
                        # Emit error
                        try:
                            from app import socketio
                            socketio.emit("task_error", {
                                "task_id": task_id,
                                "error": str(e)
                            })
                        except (ImportError, AttributeError):
                            logger.debug("Socket.IO not available for error notification")
                
                # Start the thread
                thread = threading.Thread(target=scraper_thread, daemon=True)
                thread.start()
                
                # Store in registry
                self.task_registry[task_id] = {
                    "type": "web_scraper_original",
                    "start_time": time.time(),
                    "thread": thread,
                    "urls": urls,
                    "download_directory": directory,
                    "output_file": output_path
                }
                
                return task_id
            
            else:
                raise ImportError("No web scraper capability available")
                
        except Exception as e:
            logger.error(f"Error starting web scraper: {e}")
            
            if error_handler_available:
                # Use enhanced error handler if available
                error_info = ErrorHandler.classify_error(e)
                return {
                    "status": "error",
                    "error": str(e),
                    "error_type": error_info["error_type"],
                    "error_category": error_info["category"]
                }
            else:
                # Basic error return
                return {
                    "status": "error",
                    "error": str(e)
                }
    
    def get_task_status(self, task_id):
        """
        Get the status of a task.
        
        Args:
            task_id: The task ID to query
            
        Returns:
            Dictionary with task status
        """
        # Check if task is in the registry
        task_info = self.task_registry.get(task_id)
        if not task_info:
            return {"status": "not_found", "task_id": task_id}
        
        # Different handling based on task type
        if task_info["type"] == "web_scraper" and web_scraper_available:
            # Use improved scraper status check
            return get_scraper_task_status(task_id)
        
        elif task_info["type"] == "web_scraper_original":
            # Check thread status
            thread = task_info.get("thread")
            if not thread:
                return {"status": "unknown", "task_id": task_id}
            
            # Check if thread is alive
            if thread.is_alive():
                return {
                    "status": "processing",
                    "task_id": task_id,
                    "progress": 50,  # No way to know actual progress
                    "message": "Processing URLs"
                }
            else:
                # Thread completed
                return {
                    "status": "completed",
                    "task_id": task_id,
                    "output_file": task_info.get("output_file"),
                    "download_directory": task_info.get("download_directory")
                }
        
        else:
            # Unknown task type
            return {"status": "unknown", "task_id": task_id}
    
    def cancel_task(self, task_id):
        """
        Cancel a task.
        
        Args:
            task_id: The task ID to cancel
            
        Returns:
            True if successfully cancelled, False otherwise
        """
        # Check if task is in the registry
        task_info = self.task_registry.get(task_id)
        if not task_info:
            return False
        
        # Different handling based on task type
        if task_info["type"] == "web_scraper" and web_scraper_available:
            # Use improved scraper cancellation
            return cancel_scraper_task(task_id)
        
        elif task_info["type"] == "web_scraper_original":
            # No good way to cancel threads in Python
            # We can only remove from registry
            self.task_registry.pop(task_id, None)
            
            # Try to emit cancellation event
            try:
                from app import socketio
                socketio.emit("task_cancelled", {
                    "task_id": task_id,
                    "message": "Task cancelled by user"
                })
            except (ImportError, AttributeError):
                logger.debug("Socket.IO not available for cancellation notification")
            
            return True
        
        else:
            # Unknown task type
            return False
    
    def _compute_stats(self, results):
        """Compute statistics from scraper results"""
        stats = {
            "total_urls": len(results),
            "successful_urls": sum(1 for r in results if r.get("status") == "success"),
            "failed_urls": sum(1 for r in results if r.get("status") != "success"),
            "pdf_downloads": sum(1 for r in results if r.get("status") == "success" and r.get("pdf_file")),
            "duration_seconds": 0
        }
        
        # Try to calculate duration
        for result in results:
            if result.get("processing_time"):
                stats["duration_seconds"] += result["processing_time"]
        
        return stats
        
# Initialize the global processor instance
neurogen_processor = NeuroGenProcessor()

# Convenience functions that use the processor instance
def process_pdf(pdf_path, output_path=None, options=None):
    """Process a PDF file with memory efficiency"""
    return neurogen_processor.process_pdf(pdf_path, output_path, options)

def start_web_scraper(urls, download_directory, output_filename, pdf_options=None):
    """Start a web scraper task"""
    return neurogen_processor.start_web_scraper(urls, download_directory, output_filename, pdf_options)

def get_task_status(task_id):
    """Get task status"""
    return neurogen_processor.get_task_status(task_id)

def cancel_task(task_id):
    """Cancel a task"""
    return neurogen_processor.cancel_task(task_id)