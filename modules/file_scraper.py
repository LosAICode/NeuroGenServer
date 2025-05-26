# file_scraper.py
# Enhanced file scraper module that fixes issues with filename/directory handling,
# progress tracking, and history integration

import os
import sys
import time
import uuid
import json
import logging
import threading
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple, Callable

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
    
    content_fetcher = FallbackContentFetcher()

class FileScraperTask:
    """
    Enhanced file processing task with robust progress tracking, error handling,
    and history integration.
    """
    
    def __init__(self, task_id, input_dir, output_file):
        """
        Initialize the task.
        
        Args:
            task_id: Unique task identifier
            input_dir: Input directory to process
            output_file: Output file path for JSON results
        """
        self.task_id = task_id
        self.input_dir = os.path.abspath(input_dir)
        
        # Resolve output file path properly
        self.output_file = content_fetcher.get_output_filepath(
            output_file,
            folder_override=os.path.dirname(output_file) if os.path.dirname(output_file) else None,
            ensure_extension=".json"
        )
        
        # Task status tracking
        self.status = "pending"
        self.progress = 0
        self.error = None
        
        # Statistics tracking
        self.stats = {
            "task_id": task_id,
            "start_time": time.time(),
            "input_directory": self.input_dir,
            "output_file": self.output_file,
            "files_found": 0,
            "files_processed": 0,
            "files_skipped": 0,
            "files_error": 0,
            "total_bytes": 0,
            "total_chunks": 0
        }
        
        # Execution control
        self.thread = None
        self.is_cancelled = False
        self.completion_event = threading.Event()
    
    def start(self):
        """Start the processing task in a background thread."""
        if self.status != "pending":
            logger.warning(f"Task {self.task_id} already started with status {self.status}")
            return
        
        self.status = "processing"
        self.thread = threading.Thread(target=self._process, daemon=True)
        self.thread.start()
        
        logger.info(f"Started file processing task {self.task_id} for directory: {self.input_dir}")
        logger.info(f"Output will be saved to: {self.output_file}")
    
    def _process(self):
        """Main processing function that runs in the background thread."""
        try:
            # Emit initial progress update
            self._emit_progress_update("Initializing...")
            
            # Import the structify_module
            try:
                from structify_import import get_claude_module
                structify_module, components = get_claude_module()
                
                if not structify_module:
                    raise ImportError("Failed to load structify_module")
                
                logger.info("Successfully loaded structify_module for processing")
            except ImportError as e:
                logger.error(f"Failed to import structify_module: {e}")
                self._handle_error(f"Failed to load file processing module: {e}")
                return
            
            # Create a progress callback function
            def progress_callback(current, total, stage="processing"):
                # Only update if the task is not cancelled
                if self.is_cancelled:
                    return
                
                # Calculate progress percentage
                self.progress = min(int((current / max(1, total)) * 100), 99)
                
                # Update stats
                if stage == "discovery":
                    self.stats["files_found"] = total
                elif stage == "processing":
                    self.stats["files_processed"] = current
                    self.stats["files_total"] = total
                
                # Emit progress update
                self._emit_progress_update(f"{stage.capitalize()}: {self.progress}%")
            
            # Process files with optimized parameters
            logger.info(f"Starting file processing for directory: {self.input_dir}")
            result = structify_module.process_all_files(
                root_directory=self.input_dir,
                output_file=self.output_file,
                max_chunk_size=4096,
                executor_type="thread",
                max_workers=None,  # Auto-determine based on CPU count
                stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                use_cache=False,
                valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS if hasattr(structify_module, 'DEFAULT_VALID_EXTENSIONS') else None,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True,
                progress_callback=progress_callback
            )
            
            # Check if task was cancelled
            if self.is_cancelled:
                logger.info(f"Task {self.task_id} was cancelled")
                self.status = "cancelled"
                self._emit_progress_update("Task cancelled")
                self.completion_event.set()
                return
            
            # Update status and stats
            self.status = "completed"
            self.progress = 100
            
            # Update statistics from result
            if result is None:
                logger.warning("Process returned None result. Using default stats.")
            else:
                if isinstance(result, dict) and "stats" in result:
                    self.stats.update(result["stats"])
            
            # Add additional stats
            processing_time = time.time() - self.stats["start_time"]
            self.stats.update({
                "status": "completed",
                "processing_time": processing_time,
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S")
            })
            
            # Final progress update
            self._emit_progress_update("Processing completed")
            
            # Emit task completion event
            self._emit_task_completed()
            
            # Add to history
            self._add_to_history()
            
            # Signal completion
            self.completion_event.set()
            
            logger.info(f"Processing task {self.task_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Error in processing task {self.task_id}: {e}", exc_info=True)
            self._handle_error(str(e))
    
    def _emit_progress_update(self, message="Processing..."):
        """Emit a progress update event via Socket.IO."""
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the event
            socketio.emit("progress_update", {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status,
                "message": message,
                "stats": self.stats,
                "elapsed_time": time.time() - self.stats["start_time"]
            })
        except (ImportError, AttributeError):
            logger.debug("Socket.IO not available for progress update")
        except Exception as e:
            logger.warning(f"Error emitting progress update: {e}")
    
    def _emit_task_completed(self):
        """Emit a task completion event via Socket.IO."""
        try:
            # Import socketio from app module if available
            from app import socketio
            
            # Emit the event
            socketio.emit("task_completed", {
                "task_id": self.task_id,
                "status": "completed",
                "stats": self.stats,
                "output_file": self.output_file,
                "message": "File processing complete"
            })
        except (ImportError, AttributeError):
            logger.debug("Socket.IO not available for completion event")
        except Exception as e:
            logger.warning(f"Error emitting completion event: {e}")
    
    def _handle_error(self, error_msg):
        """Handle an error during processing."""
        logger.error(f"Error in task {self.task_id}: {error_msg}")
        self.status = "failed"
        self.error = error_msg
        
        # Update stats
        self.stats["status"] = "failed"
        self.stats["error"] = error_msg
        self.stats["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Emit error event
        try:
            from app import socketio
            socketio.emit("task_error", {
                "task_id": self.task_id,
                "error": self.error,
                "stats": self.stats
            })
        except Exception as socket_err:
            logger.debug(f"Socket.IO error event emission failed: {socket_err}")
        
        # Signal completion even though there was an error
        self.completion_event.set()
    
    def _add_to_history(self):
        """Add the task result to history."""
        try:
            history_entry = {
                "type": "file_scraper",
                "task_id": self.task_id,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "input_directory": self.input_dir,
                "output_file": self.output_file,
                "status": self.status,
                "files_processed": self.stats.get("files_processed", 0),
                "files_found": self.stats.get("files_found", 0),
                "total_chunks": self.stats.get("total_chunks", 0),
                "processing_time": self.stats.get("processing_time", 0)
            }
            
            # Use ContentFetcher to save to history
            content_fetcher.save_to_history(history_entry)
            logger.info(f"Added task {self.task_id} to history")
        except Exception as e:
            logger.error(f"Error adding to history: {e}")
    
    def cancel(self):
        """
        Cancel the running task.
        Returns True if successfully cancelled, False otherwise.
        """
        if not self.thread or not self.thread.is_alive() or self.status in ["completed", "failed"]:
            logger.warning(f"Cannot cancel task {self.task_id} in state {self.status}")
            return False
        
        logger.info(f"Cancelling task {self.task_id}")
        self.is_cancelled = True
        self.status = "cancelled"
        
        # Emit cancellation event
        try:
            from app import socketio
            socketio.emit("task_cancelled", {
                "task_id": self.task_id,
                "message": "Task was cancelled",
                "stats": self.stats
            })
        except Exception as e:
            logger.debug(f"Socket.IO cancel event emission failed: {e}")
        
        # Signal completion for the cancelled task
        self.completion_event.set()
        return True
    
    def get_status(self):
        """
        Get the full status of the task.
        Returns a dictionary with all task details.
        """
        # Calculate elapsed time
        elapsed_time = time.time() - self.stats["start_time"]
        
        return {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "input_dir": self.input_dir,
            "output_file": self.output_file,
            "stats": self.stats,
            "error": self.error,
            "elapsed_time": elapsed_time,
            "is_running": self.thread.is_alive() if self.thread else False
        }
    
    def wait_for_completion(self, timeout=None):
        """
        Wait for the task to complete.
        
        Args:
            timeout: Maximum time to wait in seconds, or None for indefinite wait
            
        Returns:
            True if completed, False if timed out
        """
        return self.completion_event.wait(timeout)