"""
Core Services Module
Consolidated classes from main_part2_classes.py for better organization
"""

import os
import json
import uuid
import logging
import threading
import time
from datetime import datetime
from functools import wraps
from flask import request
from typing import Optional, Dict, Any, Union, List, Set
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# Import all constants from centralized config module
# ----------------------------------------------------------------------------
from .config import (
    # Domain and path configurations
    RESEARCH_DOMAINS,
    DEFAULT_OUTPUT_FOLDER,
    DEFAULT_OUTPUT_PATH,
    TEMP_DIR,
    
    # API configurations
    API_KEYS,
    API_PORT,
    API_HOST,
    API_DEBUG,
    API_URL,
    
    # Processing parameters
    DEFAULT_NUM_THREADS,
    MAX_UPLOAD_SIZE,
    DEFAULT_MAX_CHUNK_SIZE,
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_STOP_WORDS,
    DEFAULT_VALID_EXTENSIONS,
    MAX_FILE_SIZE,
    DEFAULT_PROCESS_TIMEOUT,
    DEFAULT_MEMORY_LIMIT,
    
    # Task management
    TASK_STATUS,
    ERROR_CODES,
    
    # Feature flags
    FEATURES,
    
    # Config class for object-oriented access
    Config
)
class Limiter:
    """Simple rate limiter for development use"""
    
    def __init__(self, key_func, app=None, default_limits=None, storage_uri=None):
        self.key_func = key_func
        self.app = app
        self.default_limits = default_limits
        self.storage_uri = storage_uri
    
    def limit(self, limits):
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # For personal use, we'll skip actual rate limiting
                return f(*args, **kwargs)
            return decorated_function
        return decorator


class ApiKeyManager:
    """API key manager for authentication"""
    
    def __init__(self, keys_file="api_keys.json"):
        self.keys_file = keys_file
        self.keys = {}
        self.load_keys()
        
        # Create a default key if no keys exist
        if not self.keys:
            self.create_key("default", "Default personal key")
    
    def load_keys(self):
        """Load API keys from file"""
        try:
            if os.path.exists(self.keys_file):
                with open(self.keys_file, 'r') as f:
                    self.keys = json.load(f)
                logger.info(f"Loaded {len(self.keys)} API keys")
            else:
                logger.info(f"No API keys file found at {self.keys_file}, will create new")
                self.keys = {}
        except Exception as e:
            logger.error(f"Error loading API keys: {e}")
            self.keys = {}
    
    def save_keys(self):
        """Save API keys to file"""
        try:
            with open(self.keys_file, 'w') as f:
                json.dump(self.keys, f, indent=2)
            logger.info(f"Saved {len(self.keys)} API keys")
            return True
        except Exception as e:
            logger.error(f"Error saving API keys: {e}")
            return False
    
    def create_key(self, name, description=""):
        """Create a new API key"""
        key = str(uuid.uuid4())
        self.keys[key] = {
            "name": name,
            "description": description,
            "created": datetime.now().isoformat(),
            "last_used": None,
            "active": True
        }
        self.save_keys()
        return key
    
    def revoke_key(self, key):
        """Revoke an API key"""
        if key in self.keys:
            self.keys[key]["active"] = False
            self.save_keys()
            return True
        return False
    
    def validate_key(self, key):
        """Check if a key is valid"""
        if key in self.keys and self.keys[key]["active"]:
            # Update last used timestamp
            self.keys[key]["last_used"] = datetime.now().isoformat()
            self.save_keys()
            return True
        return False
    
    def list_keys(self):
        """Get list of all keys (without exposing the actual keys)"""
        return [
            {
                "name": data["name"],
                "description": data["description"],
                "created": data["created"],
                "last_used": data["last_used"],
                "active": data["active"]
            }
            for data in self.keys.values()
        ]

class CustomFileStats:
    """
    Statistics tracked during file processing with custom extensions.
    Enhanced with thread safety, error handling, and comprehensive metrics.
    """
    def __init__(self):
        # Thread safety
        self._lock = threading.RLock()
        
        # Basic file metrics
        self.total_files = 0
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.total_bytes = 0
        self.total_chunks = 0
        
        # PDF-specific metrics
        self.pdf_files = 0
        self.tables_extracted = 0
        self.references_extracted = 0
        self.scanned_pages_processed = 0
        self.ocr_processed_files = 0
        
        # File type tracking
        self.binary_files_detected = 0  # Added to fix the missing attribute error
        
        # Extension tracking
        self._extension_counts = {}  # Track files by extension
        self._failed_extensions = {}  # Track failures by extension
        
        # Performance metrics
        self.total_processing_time = 0
        self.largest_file_bytes = 0
        self.largest_file_path = ""
        # Ensure start_time is a float, not a string
        self.start_time = float(time.time())
        
        # Memory metrics
        self.peak_memory_usage = 0
        self.memory_samples_count = 0
        self.avg_memory_usage = 0
        
        # Processing rate tracking
        self._last_progress_time = float(time.time())
        self._last_files_processed = 0
        self.current_processing_rate = 0  # files per second
        
        # Milestone tracking
        self._milestones = {
            "start_time": float(time.time()),
            "first_file_processed": None,
            "halfway_processed": None,
            "completion_time": None
        }
        
    def update_file_processed(self, file_path: str, file_size: int, is_binary: bool = False, 
                             is_pdf: bool = False, is_error: bool = False, 
                             is_skipped: bool = False) -> None:
        """
        Update statistics when a file is processed, with thread safety.
        
        Args:
            file_path: Path to the processed file
            file_size: Size of the file in bytes
            is_binary: Whether the file is binary
            is_pdf: Whether the file is a PDF
            is_error: Whether there was an error processing the file
            is_skipped: Whether the file was skipped
        """
        with self._lock:
            try:
                # Update total files count
                self.total_files += 1
                
                # Track file by extension
                ext = os.path.splitext(file_path)[1].lower()
                self._extension_counts[ext] = self._extension_counts.get(ext, 0) + 1
                
                # Update specific counters based on file type and processing outcome
                if is_error:
                    self.error_files += 1
                    self._failed_extensions[ext] = self._failed_extensions.get(ext, 0) + 1
                elif is_skipped:
                    self.skipped_files += 1
                else:
                    self.processed_files += 1
                    self.total_bytes += file_size
                    
                    # Update milestone tracking for first file
                    if self._milestones["first_file_processed"] is None:
                        self._milestones["first_file_processed"] = float(time.time())
                    
                    # Update milestone for halfway point
                    if self.processed_files == self.total_files // 2 and self.total_files > 1:
                        self._milestones["halfway_processed"] = float(time.time())
                
                # Track binary files
                if is_binary:
                    self.binary_files_detected += 1
                    
                # Track PDF files
                if is_pdf:
                    self.pdf_files += 1
                
                # Update largest file if applicable
                self.update_largest_file(file_path, file_size)
                
                # Update processing rate statistics
                current_time = float(time.time())
                time_diff = current_time - self._last_progress_time
                if time_diff >= 2.0:  # Only update rate every 2 seconds to smooth fluctuations
                    files_diff = self.processed_files - self._last_files_processed
                    self.current_processing_rate = files_diff / time_diff if time_diff > 0 else 0
                    self._last_progress_time = current_time
                    self._last_files_processed = self.processed_files
            except Exception as e:
                logger.error(f"Error in update_file_processed: {e}")
                # Continue despite errors
        
    def calculate_duration(self):
        """
        Calculate duration since start time with error handling.
        
        Returns:
            float: Duration in seconds
        """
        try:
            # Ensure start_time is a float before subtraction
            if not isinstance(self.start_time, (int, float)):
                try:
                    # Convert string to float if somehow it became a string
                    self.start_time = float(self.start_time)
                except (TypeError, ValueError):
                    # If conversion fails, reset start_time to current time
                    logger.error(f"Invalid start_time: {self.start_time}, type: {type(self.start_time)}")
                    self.start_time = float(time.time())
                    return 0.0
            
            current_time = float(time.time())
            duration = current_time - self.start_time
            
            # Sanity check - if result is negative or extremely large, something is wrong
            if duration < 0 or duration > 86400:  # More than 24 hours is suspicious
                logger.warning(f"Suspicious duration calculated: {duration}s. Resetting.")
                self.start_time = float(time.time())
                return 0.0
                
            return duration
        except Exception as e:
            # Handle error case - log and return fallback value
            logger.error(f"Error calculating duration: {e}. start_time={self.start_time}, type={type(self.start_time)}")
            # Return a fallback duration
            return 0.0

    def update_largest_file(self, file_path: str, file_size: int) -> None:
        """Update largest file information if current file is larger."""
        try:
            if file_size > self.largest_file_bytes:
                self.largest_file_bytes = file_size
                self.largest_file_path = file_path
        except Exception as e:
            logger.debug(f"Error updating largest file: {e}")
            
    def increment_chunks(self, count: int = 1) -> None:
        """
        Increment the total chunks counter with thread safety.
        
        Args:
            count: Number of chunks to add
        """
        with self._lock:
            try:
                self.total_chunks += count
            except Exception as e:
                logger.debug(f"Error incrementing chunks: {e}")
    
    def increment_pdf_metrics(self, tables: int = 0, references: int = 0, 
                             scanned_pages: int = 0, ocr_files: int = 0) -> None:
        """
        Update PDF-specific metrics with thread safety.
        
        Args:
            tables: Number of tables extracted
            references: Number of references extracted
            scanned_pages: Number of scanned pages processed
            ocr_files: Number of files processed with OCR
        """
        with self._lock:
            try:
                self.tables_extracted += tables
                self.references_extracted += references
                self.scanned_pages_processed += scanned_pages
                self.ocr_processed_files += ocr_files
            except Exception as e:
                logger.debug(f"Error incrementing PDF metrics: {e}")
            
    def track_memory_usage(self):
        """Track current memory usage of the process with enhanced error handling."""
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            
            # Update memory statistics with thread safety
            with self._lock:
                # Calculate running average
                self.memory_samples_count += 1
                self.avg_memory_usage = ((self.avg_memory_usage * (self.memory_samples_count - 1)) + memory_mb) / self.memory_samples_count
                
                # Update peak memory usage
                if memory_mb > self.peak_memory_usage:
                    self.peak_memory_usage = memory_mb
                    
                return memory_mb
        except ImportError:
            # psutil not available
            logger.debug("psutil not available for memory tracking")
            return 0
        except (AttributeError, PermissionError) as e:
            logger.debug(f"Permission or attribute error during memory tracking: {e}")
            return 0
        except Exception as e:
            logger.debug(f"Error tracking memory usage: {e}")
            return 0
            
    def finish_processing(self):
        """Finalize processing statistics with enhanced error handling."""
        try:
            # Record completion time
            self._milestones["completion_time"] = float(time.time())
            
            # Calculate final duration with error handling
            duration = self.calculate_duration()
            if duration > 0:  # Only update if we got a valid duration
                self.total_processing_time = duration
            
            # Perform any final calculations
            self.track_memory_usage()  # One final memory check
            
            # Log completion summary
            try:
                logger.info(f"Processing completed in {self.total_processing_time:.2f}s: "
                           f"{self.processed_files}/{self.total_files} files processed, "
                           f"{self.error_files} errors, {self.skipped_files} skipped")
            except Exception as log_err:
                logger.debug(f"Error logging completion summary: {log_err}")
                
        except Exception as e:
            logger.error(f"Error in finish_processing: {e}")
            # Continue processing despite errors
    
    def get_memory_profile(self) -> Dict[str, Any]:
        """
        Get detailed memory usage profile.
        
        Returns:
            Dictionary with memory usage statistics
        """
        try:
            with self._lock:
                profile = {
                    "peak_memory_mb": round(self.peak_memory_usage, 2),
                    "average_memory_mb": round(self.avg_memory_usage, 2),
                    "samples_count": self.memory_samples_count
                }
                
                return profile
        except Exception as e:
            logger.error(f"Error getting memory profile: {e}")
            return {"error": str(e)}
    
    def get_processing_speed_profile(self) -> Dict[str, Any]:
        """
        Get detailed processing speed profile.
        
        Returns:
            Dictionary with processing speed statistics
        """
        try:
            with self._lock:
                duration = self.calculate_duration()
                total_duration = duration if duration > 0 else 0.001  # Avoid division by zero
                
                profile = {
                    "current_rate_files_per_second": round(self.current_processing_rate, 2),
                    "average_rate_files_per_second": round(self.processed_files / total_duration, 2),
                    "average_bytes_per_second": round(self.total_bytes / total_duration, 2) if self.total_bytes > 0 else 0
                }
                
                # Calculate time to first file processing
                if self._milestones["first_file_processed"] is not None:
                    profile["time_to_first_file"] = round(
                        self._milestones["first_file_processed"] - self._milestones["start_time"], 2)
                
                # Calculate time to 50% completion
                if self._milestones["halfway_processed"] is not None:
                    profile["time_to_halfway"] = round(
                        self._milestones["halfway_processed"] - self._milestones["start_time"], 2)
                
                # Calculate breakdown by extension
                if self._extension_counts:
                    profile["extension_breakdown"] = {
                        ext: count for ext, count in sorted(
                            self._extension_counts.items(), 
                            key=lambda x: x[1], 
                            reverse=True
                        )
                    }
                
                # Calculate error rate by extension
                if self._failed_extensions:
                    profile["error_rates_by_extension"] = {}
                    for ext, failures in self._failed_extensions.items():
                        total = self._extension_counts.get(ext, 0)
                        if total > 0:
                            profile["error_rates_by_extension"][ext] = round(failures / total * 100, 2)
                
                return profile
        except Exception as e:
            logger.error(f"Error getting processing speed profile: {e}")
            return {"error": str(e)}
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary for JSON serialization with enhanced error handling.
        
        Returns:
            Dictionary with all statistics
        """
        try:
            # Calculate duration with error handling
            duration_seconds = self.calculate_duration()
            
            d = {
                # Basic file metrics
                'total_files': self.total_files,
                'processed_files': self.processed_files,
                'skipped_files': self.skipped_files,
                'error_files': self.error_files,
                'total_bytes': self.total_bytes,
                'total_chunks': self.total_chunks,
                
                # PDF-specific metrics
                'pdf_files': self.pdf_files,
                'tables_extracted': self.tables_extracted,
                'references_extracted': self.references_extracted,
                'scanned_pages_processed': self.scanned_pages_processed,
                'ocr_processed_files': self.ocr_processed_files,
                
                # File type tracking
                'binary_files_detected': self.binary_files_detected,
                
                # Performance metrics
                'total_processing_time': self.total_processing_time,
                'largest_file_bytes': self.largest_file_bytes,
                'largest_file_path': self.largest_file_path,
                'peak_memory_usage_mb': round(self.peak_memory_usage, 2) if self.peak_memory_usage > 0 else 0,
                'avg_memory_usage_mb': round(self.avg_memory_usage, 2) if self.avg_memory_usage > 0 else 0,
                'duration_seconds': duration_seconds,
                'current_processing_rate': round(self.current_processing_rate, 2),
                
                # Timestamp information
                'start_time_iso': datetime.fromtimestamp(float(self.start_time) if isinstance(self.start_time, (int, float, str)) else time.time()).isoformat(),
                'current_time_iso': datetime.now().isoformat()
            }
            
            # Add derived statistics with error handling
            if duration_seconds > 0:
                d['files_per_second'] = round(self.processed_files / duration_seconds, 2)
            else:
                d['files_per_second'] = 0
                
            if self.processed_files > 0:
                d['average_file_size'] = round(self.total_bytes / self.processed_files, 2)
            else:
                d['average_file_size'] = 0
                
            if self.total_files > 0:
                d['success_rate_percent'] = round(self.processed_files / self.total_files * 100, 2)
                d['error_rate_percent'] = round(self.error_files / self.total_files * 100, 2)
            else:
                d['success_rate_percent'] = 0
                d['error_rate_percent'] = 0
                
            # Add detailed profiles if metrics are available
            if self.memory_samples_count > 0:
                try:
                    d['memory_profile'] = self.get_memory_profile()
                except Exception as e:
                    logger.debug(f"Error getting memory profile for dict: {e}")
                    
            if self.processed_files > 0:
                try:
                    d['speed_profile'] = self.get_processing_speed_profile()
                except Exception as e:
                    logger.debug(f"Error getting speed profile for dict: {e}")
                
            return d
            
        except Exception as e:
            # Provide a minimal fallback dictionary if serialization fails
            logger.error(f"Error generating stats dictionary: {e}")
            return {
                'error': f"Stats serialization failed: {str(e)}",
                'total_files': self.total_files,
                'processed_files': self.processed_files,
                'error_files': self.error_files,
                'skipped_files': self.skipped_files
            }
            
    def __str__(self) -> str:
        """Return a string representation of the statistics with error handling."""
        try:
            return (f"Files: {self.processed_files}/{self.total_files} processed, "
                    f"{self.error_files} errors, {self.skipped_files} skipped. "
                    f"Duration: {self.calculate_duration():.2f}s")
        except Exception as e:
            return f"CustomFileStats (error displaying: {e})"

class BaseTask:
    """
    Base class for all background processing tasks with Socket.IO progress reporting.
    
    Attributes:
        task_id (str): Unique identifier for the task
        task_type (str): Type of task (e.g., "file_processing", "web_scraping")
        progress (int): Current progress value (0-100)
        status (str): Current status (pending, initializing, processing, completed, failed, cancelling, cancelled)
        message (str): Current status message
        stats (Union[CustomFileStats, Dict]): Statistics for the task
        error_message (Optional[str]): Error message if the task fails
        error_details (Optional[Dict]): Detailed error information
        thread (Optional[threading.Thread]): Background thread for processing
        is_cancelled_flag (bool): Flag indicating if the task has been cancelled
        start_time (float): Task start time
        last_emit_time (float): Time of last Socket.IO emission
        emit_interval (float): Minimum interval between progress updates
        output_file (Optional[str]): Path to the output file if applicable
    """
    
    def __init__(self, task_id: str, task_type: str = "generic"):
        """
        Initialize a new task.
        
        Args:
            task_id: Unique identifier for the task
            task_type: Type of task (default: "generic")
        """
        self.task_id = task_id
        self.task_type = task_type
        self.progress = 0
        self.status = "pending"  # pending, initializing, processing, completed, failed, cancelling, cancelled
        self.message = "Task initialized"
        self.stats = {}  # Can be CustomFileStats object or dict
        self.error_message = None
        self.error_details = None
        self.error = None
        
        self.thread = None
        self.is_cancelled_flag = False
        
        self.start_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds (Socket.IO rate limit)
        self.output_file = None  # For tasks that produce a single file

        # Advanced monitoring properties
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        self.memory_check_interval = 5  # seconds
        self.timeout_seconds = DEFAULT_PROCESS_TIMEOUT
        self.max_allowed_memory_mb = 4096  # 4GB default limit
        self.detailed_progress = {}
        self.retry_count = 0
        self.max_retries = 3
        
        logger.info(f"BaseTask {self.task_id} ({self.task_type}) created.")

    def _run_process(self):
        """Main thread function that runs the task's processing logic."""
        try:
            self.status = "initializing"
            self.emit_task_started()  # Emit start event
            
            # Start memory monitoring if implemented
            if hasattr(self, '_start_memory_monitoring') and callable(self._start_memory_monitoring):
                self._start_memory_monitoring()
            
            # Set up timeout handler if needed
            timeout_timer = None
            if self.timeout_seconds > 0:
                def timeout_handler():
                    if not self.is_cancelled_flag:
                        logger.warning(f"Task {self.task_id} timeout after {self.timeout_seconds}s")
                        self.is_cancelled_flag = True
                        self.status = "timeout"
                        self.handle_error(
                            f"Task timed out after {self.timeout_seconds} seconds", 
                            stage="timeout", 
                            details={"timeout_seconds": self.timeout_seconds}
                        )
                
                timeout_timer = threading.Timer(self.timeout_seconds, timeout_handler)
                timeout_timer.daemon = True
                timeout_timer.start()
            
            try:
                # Subclass's main logic goes here
                if hasattr(self, '_process_logic') and callable(self._process_logic):
                    self._process_logic()  # Call the actual processing method
                else:
                    raise NotImplementedError("Subclasses must implement _process_logic method")
            finally:
                # Cancel timeout timer if it exists
                if timeout_timer:
                    timeout_timer.cancel()
                
                # Stop memory monitoring if implemented
                if hasattr(self, '_stop_memory_monitoring') and callable(self._stop_memory_monitoring):
                    self._stop_memory_monitoring()

            # If task wasn't cancelled or failed during processing, mark as completed
            if self.status not in ["failed", "cancelled", "cancelling", "timeout"]:
                self.status = "completed"
                self.progress = 100
                self.emit_completion()

        except InterruptedError:
            # Handle explicit interruption
            logger.info(f"Task {self.task_id} ({self.task_type}) was interrupted")
            self.status = "cancelled"
            # No need to emit - cancel() should have handled it
            
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Unhandled error in task {self.task_id} ({self.task_type}): {e}", exc_info=True)
            self.handle_error(str(e), details={"traceback": traceback.format_exc()})
        finally:
            # Clean up task from active tasks if still there
            if self.task_id in active_tasks:
                remove_task(self.task_id)

    def start(self, *args, **kwargs):
        """
        Start the task in a background thread.
        
        Args:
            *args, **kwargs: Arguments for subclass-specific initialization
            
        Returns:
            Dict with task info and status
        """
        self.status = "queued"
        self.message = "Task queued for processing"
        self.emit_progress_update()  # Initial emit to show it's queued
        
        # Create and start background thread
        self.thread = threading.Thread(target=self._run_process, daemon=True)
        self.thread.name = f"{self.task_type}TaskThread-{self.task_id[:8]}"
        self.thread.start()
        logger.info(f"Task {self.task_id} ({self.task_type}) thread started.")
        
        # Return task info dictionary
        return {
            "task_id": self.task_id,
            "status": self.status,
            "task_type": self.task_type,
            "message": self.message
        }

    def emit_task_started(self):
        """Emit a task started event via Socket.IO."""
        self.status = "processing"  # Official start of processing
        self.message = "Task processing started."
        self.progress = 0  # Reset progress at actual start
        logger.info(f"Task {self.task_id} ({self.task_type}) started processing.")
        try:
            socketio.emit("task_started", {
                "task_id": self.task_id,
                "task_type": self.task_type,
                "status": self.status,
                "message": self.message,
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error emitting task_started for {self.task_id}: {e}")

    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None, 
                             stats_override: Optional[Union[CustomFileStats, Dict]] = None, 
                             details: Optional[Dict] = None):
        """
        Emit a progress update event via Socket.IO.
        
        Args:
            progress: Optional new progress value (0-100)
            message: Optional new status message
            stats_override: Optional stats override (instead of self.stats)
            details: Optional additional details for the UI
        """
        now = time.time()
        if progress is not None:
            self.progress = min(max(0, progress), 100)
        if message is not None:
            self.message = message
        
        # Rate limit emissions unless it's a final update (100%) or critical status change
        is_critical_update = self.progress == 100 or self.status in ["failed", "completed", "cancelled"]
        if not is_critical_update and (now - self.last_emit_time) < self.emit_interval:
            return

        # Prepare stats for serialization
        current_stats = stats_override if stats_override is not None else self.stats
        serialized_stats = {}
        if isinstance(current_stats, CustomFileStats):
            serialized_stats = current_stats.to_dict()
        elif isinstance(current_stats, dict):
            serialized_stats = current_stats.copy()  # Send a copy to avoid modification
        elif hasattr(current_stats, '__dict__'):
            serialized_stats = current_stats.__dict__.copy()

        # Add dynamic stats
        elapsed_seconds = round(now - self.start_time, 2)
        serialized_stats["elapsed_seconds"] = elapsed_seconds
        
        # Calculate estimated remaining time
        if 0 < self.progress < 100 and elapsed_seconds > 1:  # Avoid division by zero or too early estimates
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            serialized_stats["estimated_remaining_seconds"] = round(estimated_total_time - elapsed_seconds, 2)
        
        # Prepare payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "progress": self.progress,
            "status": self.status,
            "message": self.message,
            "stats": serialized_stats,
            "timestamp": now
        }
        if details:
            payload["details"] = details
        
        # Send event
        try:
            socketio.emit("progress_update", payload)
            self.last_emit_time = now
            logger.debug(f"Progress emitted for {self.task_id}: {self.progress}% - {self.message}")
        except Exception as e:
            logger.error(f"Error emitting progress_update for {self.task_id}: {e}")

    def handle_error(self, error_msg: str, stage: Optional[str] = None, details: Optional[Dict] = None):
        """
        Handle task error and emit error event.
        
        Args:
            error_msg: Error message
            stage: Optional processing stage where error occurred
            details: Optional error details
        """
        self.error_message = error_msg
        self.error_details = details or {}
        if stage:
            self.error_details["stage_at_failure"] = stage
        self.status = "failed"
        
        logger.error(f"Task {self.task_id} ({self.task_type}) failed: {error_msg}. Details: {self.error_details}")

        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()

        # Prepare and emit payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "error": self.error_message,
            "error_details": self.error_details,
            "stats": serialized_stats,
            "progress": self.progress,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_error", payload)
        except Exception as e:
            logger.error(f"Error emitting task_error for {self.task_id}: {e}")
        
        # Clean up task if error handling happens outside _run_process's finally block
        if self.task_id in active_tasks:
            remove_task(self.task_id)

    def emit_completion(self):
        """Emit task completion event via Socket.IO."""
        self.status = "completed"
        self.progress = 100
        self.message = "Task completed successfully."
        duration_seconds = round(time.time() - self.start_time, 2)
        
        logger.info(f"Task {self.task_id} ({self.task_type}) completed in {duration_seconds}s.")

        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            if hasattr(self.stats, 'finish_processing'):
                self.stats.finish_processing()  # Finalize stats object if method exists
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()
        
        serialized_stats["total_duration_seconds"] = duration_seconds  # Ensure this is in final stats

        # Prepare and emit payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "progress": self.progress,
            "stats": serialized_stats,
            "output_file": self.output_file,
            "duration_seconds": duration_seconds,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_completed", payload)
        except Exception as e:
            logger.error(f"Error emitting task_completed for {self.task_id}: {e}")

    def cancel(self) -> bool:
        """
        Cancel the task with improved force termination support.
        """
        if self.is_cancelled_flag or self.status in ["completed", "failed", "cancelled"]:
            logger.info(f"Task {self.task_id} already cancelled or finished. Current status: {self.status}")
            return False

        # Set cancellation flag
        self.is_cancelled_flag = True
        previous_status = self.status
        self.status = "cancelling"  # Intermediate state
        self.message = "Task cancellation in progress."
        logger.info(f"Attempting to cancel task {self.task_id} ({self.task_type}). Previous status: {previous_status}")
        
        # Thread termination support - more aggressive cancellation
        try:
            if self.thread and self.thread.is_alive():
                # The thread should check is_cancelled_flag, but if it's stuck
                # we need a way to interrupt it more forcefully
                import ctypes
                ctypes.pythonapi.PyThreadState_SetAsyncExc(
                    ctypes.c_long(self.thread.ident),
                    ctypes.py_object(InterruptedError)
                )
                logger.info(f"Sent InterruptedError to thread {self.thread.ident}")
        except Exception as e:
            logger.error(f"Error attempting to force thread cancellation: {e}")

        # Set final cancelled state
        self.status = "cancelled"
        self.message = "Task cancelled by user."
        
        # Emit cancellation event
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_cancelled", payload)
            logger.info(f"Emitted task_cancelled for {self.task_id}")
        except Exception as e:
            logger.error(f"Error emitting task_cancelled for {self.task_id}: {e}")
        
        # Remove task from active tasks
        if self.task_id in active_tasks:
            remove_task(self.task_id)
        return True

    def get_status(self) -> Dict[str, Any]:
        """
        Get comprehensive task status information for API requests.
        
        Returns:
            Dict with complete task status info
        """
        now = time.time()
        elapsed_seconds = round(now - self.start_time, 2)
        
        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()

        # Calculate estimated remaining time
        estimated_remaining_seconds = None
        if 0 < self.progress < 100 and elapsed_seconds > 1:
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            estimated_remaining_seconds = round(estimated_total_time - elapsed_seconds, 2)
        
        # Build comprehensive status info
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "error": self.error_message,
            "error_details": self.error_details,
            "output_file": self.output_file,
            "stats": serialized_stats,
            "start_time_iso": datetime.fromtimestamp(self.start_time).isoformat(),
            "current_time_iso": datetime.fromtimestamp(now).isoformat(),
            "elapsed_seconds": elapsed_seconds,
            "estimated_remaining_seconds": estimated_remaining_seconds,
            "is_running": self.thread.is_alive() if self.thread else False,
            "is_cancelled": self.is_cancelled_flag,
            "detailed_progress": self.detailed_progress
        }

    def _start_memory_monitoring(self):
        """Start a background thread to monitor memory usage."""
        def monitor_memory():
            try:
                import psutil
                process = psutil.Process()
                
                while self.memory_monitor_active:
                    try:
                        # Get memory usage
                        memory_info = process.memory_info()
                        memory_mb = memory_info.rss / (1024 * 1024)
                        
                        # Update stats
                        if hasattr(self.stats, 'peak_memory_usage'):
                            if memory_mb > self.stats.peak_memory_usage:
                                self.stats.peak_memory_usage = memory_mb
                            
                        # Check if memory usage is too high
                        if memory_mb > self.max_allowed_memory_mb:
                            logger.warning(f"Memory usage too high ({memory_mb:.1f}MB). Running garbage collection.")
                            import gc
                            gc.collect()
                            
                        # Sleep to prevent too frequent checks
                        time.sleep(self.memory_check_interval)
                    except Exception as e:
                        logger.debug(f"Error in memory monitoring: {e}")
                        time.sleep(self.memory_check_interval)
            except ImportError:
                logger.debug("psutil not available, memory monitoring disabled")
                
        # Start the monitoring thread
        self.memory_monitor_active = True
        self.memory_monitor_thread = threading.Thread(target=monitor_memory, daemon=True)
        self.memory_monitor_thread.start()

    def _stop_memory_monitoring(self):
        """Stop the memory monitoring thread."""
        if self.memory_monitor_active:
            self.memory_monitor_active = False
            if self.memory_monitor_thread:
                self.memory_monitor_thread.join(timeout=1.0)

# The ProcessingTask implementation doesn't need to change - it inherits the start() method from BaseTask

class ProcessingTask(BaseTask):
    """
    Enhanced task for processing files with comprehensive statistics and performance monitoring.
    Includes integrated cancellation handling to avoid AttributeError issues.
    
    Attributes:
        input_dir (str): Input directory to process
        output_file (str): Output file path
        stats (CustomFileStats): Enhanced statistics tracker
        memory_monitor_active (bool): Whether memory monitoring is active
        memory_monitor_thread (threading.Thread): Thread for memory monitoring
        progress (int): Progress percentage of the task (0-100)
        start_time (float): Task start timestamp
        performance_metrics (dict): Real-time performance tracking
        cancellation_check_interval (int): How often to check for cancellation (iterations)
    """
    
    def __init__(self, task_id: str, input_dir: str, output_file: str):
        """
        Initialize an enhanced file processing task with comprehensive monitoring.
        
        Args:
            task_id: Unique identifier for the task
            input_dir: Directory containing files to process
            output_file: Output file path for the processing results
        """
        super().__init__(task_id, task_type="file_processing")
        
        # Core task attributes
        self.input_dir = self._sanitize_path(input_dir)
        self.output_file = self._sanitize_path(output_file)
        self.stats = CustomFileStats()  # Enhanced stats object
        self.message = f"Preparing to process files in {self.input_dir}"
        self.progress = 0
        self.start_time = time.time()
        
        # Performance tracking
        self.performance_metrics = {
            'cpu_samples': [],
            'memory_samples': [],
            'io_samples': [],
            'processing_checkpoints': [],
            'bottlenecks_detected': []
        }
        
        # Enhanced memory monitoring
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        self.memory_check_interval = 3  # More frequent checks (3 seconds)
        self.memory_trend_data = []
        
        # Processing optimization settings
        self.batch_size = 50  # Process files in batches for better memory management
        self.cancellation_check_interval = 5  # Check every 10 files
        self.adaptive_chunk_size = True  # Dynamically adjust chunk size based on performance
        self.current_chunk_size = DEFAULT_MAX_CHUNK_SIZE
        
        # Enhanced error handling and retry logic
        self.retry_count = 0
        self.max_retries = 3
        self.last_error = None
        self.detailed_progress = {}
        self.processing_stages = []
        
        # Resource management with adaptive limits
        self.max_allowed_memory_mb = 4096  # 4GB default limit
        self.memory_warning_threshold = 3072  # 3GB warning threshold
        self.timeout_seconds = DEFAULT_PROCESS_TIMEOUT
        self.auto_gc_threshold = 2048  # Auto garbage collection at 2GB
        
        # Quality assurance
        self.quality_checks = {
            'file_integrity': True,
            'output_validation': True,
            'performance_monitoring': True,
            'error_analysis': True
        }
        
        # Verify and prepare environment
        self._verify_directories()
        self._initialize_performance_tracking()
        self.error = None

    def _check_internal_cancellation(self) -> bool:
        """
    try:
        # CRITICAL: Check force cancellation first
        if is_force_cancelled(self.task_id if hasattr(self, 'task_id') else None):
            logger.warning(f"Task {getattr(self, 'task_id', 'unknown')} force cancelled")
            return True
        
        Internal method for ProcessingTask to check its own cancellation status.
        This avoids the need to go through the global check_task_cancellation function
        and prevents AttributeError issues.
        
        Returns:
            bool: True if task should be cancelled
        """
        try:
            # Check internal cancellation flag first (fastest check)
            if hasattr(self, 'is_cancelled_flag') and self.is_cancelled_flag:
                logger.debug(f"Task {self.task_id} cancelled via is_cancelled_flag")
                return True
            
            # Check status attribute
            if hasattr(self, 'status') and self.status == 'cancelled':
                logger.debug(f"Task {self.task_id} cancelled via status")
                return True
            
            # Also check the global task registry as a backup
            # Use the corrected global function that handles object types properly
            try:
                with tasks_lock:
                    task = active_tasks.get(self.task_id)
                    if task:
                        # Handle both dict and object formats in the global check
                        if hasattr(task, 'get'):
                            # Dictionary format
                            return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
                        elif hasattr(task, 'is_cancelled_flag'):
                            # Object format
                            return getattr(task, 'is_cancelled_flag', False) or getattr(task, 'status', '') == 'cancelled'
                        elif hasattr(task, 'status'):
                            # Basic object with status
                            return getattr(task, 'status', '') == 'cancelled'
                    return False
            except Exception as e:
                logger.debug(f"Error in global cancellation check for {self.task_id}: {e}")
                return False
        
        except Exception as e:
            logger.debug(f"Error in internal cancellation check for {self.task_id}: {e}")
            return False

    def _sanitize_path(self, path: str) -> str:
        """Enhanced path sanitization with additional security checks."""
        if not path:
            return path
        
        # Normalize path separators and resolve relative paths
        normalized = os.path.normpath(os.path.abspath(path))
        
        # Convert to forward slashes for consistency
        normalized = normalized.replace('\\', '/')
        
        # Remove trailing slashes (except root)
        while normalized.endswith('/') and len(normalized) > 1:
            normalized = normalized[:-1]
        
        # Expand user directory if needed
        if normalized.startswith('~/') or normalized == '~':
            normalized = os.path.expanduser(normalized)
        
        # Security check: prevent path traversal attacks
        if '..' in normalized or normalized.startswith('/etc') or normalized.startswith('/sys'):
            logger.warning(f"Potentially unsafe path detected: {path}")
        
        return normalized

    def _verify_directories(self) -> bool:
        """Enhanced directory verification with detailed error reporting."""
        try:
            # Check input directory existence and accessibility
            if not os.path.exists(self.input_dir):
                self.handle_error(
                    f"Input directory does not exist: {self.input_dir}",
                    stage="initialization",
                    details={
                        "suggested_action": "Create the directory or specify an existing path",
                        "current_working_dir": os.getcwd(),
                        "absolute_path": os.path.abspath(self.input_dir)
                    }
                )
                return False
            
            if not os.path.isdir(self.input_dir):
                self.handle_error(
                    f"Input path is not a directory: {self.input_dir}",
                    stage="initialization",
                    details={"path_type": "file" if os.path.isfile(self.input_dir) else "unknown"}
                )
                return False
            
            # Check read permissions
            if not os.access(self.input_dir, os.R_OK):
                self.handle_error(
                    f"No read permission for input directory: {self.input_dir}",
                    stage="initialization",
                    details={"suggested_action": "Check directory permissions"}
                )
                return False
            
            # Check and create output directory
            output_dir = os.path.dirname(self.output_file)
            if output_dir and not os.path.exists(output_dir):
                try:
                    os.makedirs(output_dir, exist_ok=True)
                    logger.info(f"Created output directory: {output_dir}")
                except (OSError, PermissionError) as e:
                    self.handle_error(
                        f"Cannot create output directory: {output_dir}",
                        stage="initialization",
                        details={
                            "error": str(e),
                            "suggested_action": "Check permissions or specify a different output path",
                            "parent_dir_exists": os.path.exists(os.path.dirname(output_dir))
                        }
                    )
                    return False
            
            return True
            
        except Exception as e:
            self.handle_error(
                f"Error during directory verification: {str(e)}",
                stage="initialization",
                details={"exception_type": type(e).__name__}
            )
            return False

    def _initialize_performance_tracking(self):
        """Initialize comprehensive performance tracking systems."""
        try:
            # Record initial system state
            self.performance_metrics['initialization_time'] = time.time()
            self.performance_metrics['initial_memory'] = self._get_current_memory_usage()
            self.performance_metrics['system_info'] = self._gather_system_info()
            
            # Initialize adaptive processing parameters
            self._calibrate_processing_parameters()
            
            logger.debug(f"Performance tracking initialized for task {self.task_id}")
            
        except Exception as e:
            logger.warning(f"Error initializing performance tracking: {e}")

    def _gather_system_info(self) -> dict:
        """Gather system information for performance context."""
        try:
            import psutil
            return {
                'cpu_count': psutil.cpu_count(),
                'available_memory_gb': psutil.virtual_memory().available / (1024**3),
                'disk_free_gb': psutil.disk_usage(os.path.dirname(self.output_file)).free / (1024**3),
                'platform': os.name
            }
        except ImportError:
            return {'platform': os.name, 'psutil_available': False}
        except Exception as e:
            return {'error': str(e)}

    def _calibrate_processing_parameters(self):
        """Dynamically calibrate processing parameters based on system capabilities."""
        try:
            system_info = self.performance_metrics.get('system_info', {})
            available_memory = system_info.get('available_memory_gb', 4)
            
            # Adjust memory thresholds based on available memory
            if available_memory > 8:
                self.max_allowed_memory_mb = min(6144, int(available_memory * 0.75 * 1024))
                self.auto_gc_threshold = int(self.max_allowed_memory_mb * 0.6)
            elif available_memory > 4:
                self.max_allowed_memory_mb = min(3072, int(available_memory * 0.7 * 1024))
                self.auto_gc_threshold = int(self.max_allowed_memory_mb * 0.65)
            else:
                self.max_allowed_memory_mb = 2048
                self.auto_gc_threshold = 1536
            
            # Adjust batch size based on system capabilities
            if available_memory > 8:
                self.batch_size = 100
            elif available_memory > 4:
                self.batch_size = 75
            else:
                self.batch_size = 25
            
            logger.info(f"Calibrated processing parameters: max_memory={self.max_allowed_memory_mb}MB, "
                       f"batch_size={self.batch_size}, gc_threshold={self.auto_gc_threshold}MB")
            
        except Exception as e:
            logger.warning(f"Error calibrating processing parameters: {e}")

    def _get_current_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        try:
            import psutil
            return psutil.Process().memory_info().rss / (1024 * 1024)
        except ImportError:
            return 0.0
        except Exception:
            return 0.0

    def _start_memory_monitoring(self):
        """Enhanced memory monitoring with trend analysis and automatic optimization."""
        def monitor_memory():
            try:
                import psutil
                process = psutil.Process()
                
                while self.memory_monitor_active:
                    try:
                        # Get comprehensive memory information
                        memory_info = process.memory_info()
                        memory_mb = memory_info.rss / (1024 * 1024)
                        
                        # Update stats with enhanced tracking
                        if hasattr(self.stats, 'track_memory_usage'):
                            self.stats.track_memory_usage()
                        
                        # Enhanced memory management logic
                        if memory_mb > self.memory_warning_threshold:
                            logger.warning(f"High memory usage detected: {memory_mb:.1f}MB")
                            
                            # Automatic garbage collection on high memory
                            if memory_mb > self.auto_gc_threshold:
                                import gc
                                gc.collect()
                                self.performance_metrics['gc_events'] = self.performance_metrics.get('gc_events', 0) + 1
                        
                        time.sleep(self.memory_check_interval)
                        
                    except Exception as e:
                        logger.debug(f"Error in memory monitoring iteration: {e}")
                        time.sleep(self.memory_check_interval)
                        
            except ImportError:
                logger.debug("psutil not available, enhanced memory monitoring disabled")
            except Exception as e:
                logger.error(f"Error in memory monitoring thread: {e}")
        
        # Start enhanced monitoring thread
        self.memory_monitor_active = True
        self.memory_monitor_thread = threading.Thread(target=monitor_memory, daemon=True)
        self.memory_monitor_thread.start()
        logger.debug("Enhanced memory monitoring started")

    def _stop_memory_monitoring(self):
        """Stop memory monitoring and generate final memory report."""
        if self.memory_monitor_active:
            self.memory_monitor_active = False
            if self.memory_monitor_thread:
                self.memory_monitor_thread.join(timeout=2.0)

    def _structify_progress_callback(self, processed_count: int, total_count: int, 
                                   stage_message: str, current_file: Optional[str] = None):
        """
        Enhanced callback function with corrected cancellation checking.
        Uses internal cancellation check to avoid AttributeError.
        
        Args:
            processed_count: Number of items processed
            total_count: Total number of items to process
            stage_message: Current processing stage
            current_file: Optional current file being processed
        
        Raises:
            InterruptedError: If task was cancelled during processing
        """
        # Use internal cancellation check to avoid the 'get' attribute error
        if processed_count % self.cancellation_check_interval == 0:
            if self._check_internal_cancellation():
                logger.info(f"Task {self.task_id} cancelled during processing")
                raise InterruptedError("Task cancelled by user")
        
        # Calculate progress with better precision
        if total_count > 0:
            self.progress = min(int((processed_count / total_count) * 99), 99)  # Reserve 100% for completion
        else:
            self.progress = 0
        
        # Update CustomFileStats with comprehensive information
        if isinstance(self.stats, CustomFileStats):
            self.stats.total_files = total_count
            
            # Track processing milestones
            if processed_count == 1 and not hasattr(self, '_first_file_processed'):
                self._first_file_processed = time.time()
                self.performance_metrics['time_to_first_file'] = self._first_file_processed - self.start_time
            
            if processed_count == total_count // 2 and not hasattr(self, '_halfway_processed'):
                self._halfway_processed = time.time()
                self.performance_metrics['time_to_halfway'] = self._halfway_processed - self.start_time
        
        # Enhanced performance tracking
        current_time = time.time()
        elapsed_time = current_time - self.start_time
        
        # Enhanced detailed progress tracking
        self.detailed_progress = {
            "processed_count": processed_count,
            "total_count": total_count,
            "stage": stage_message,
            "current_file": current_file,
            "progress_percent": self.progress,
            "timestamp": current_time,
            "elapsed_time": elapsed_time,
            "processing_rate": processed_count / elapsed_time if elapsed_time > 0 else 0,
            "memory_usage_mb": self._get_current_memory_usage()
        }
        
        # Prepare enhanced message
        msg = f"Stage: {stage_message} ({processed_count}/{total_count})"
        if current_file:
            msg += f" - Current: {os.path.basename(current_file)}"
        
        # Add performance indicators to message
        if elapsed_time > 30:  # After 30 seconds, include rate information
            rate = processed_count / elapsed_time
            msg += f" - Rate: {rate:.1f} files/sec"
        
        # Enhanced details for emission
        details = {
            "current_stage_message": stage_message,
            "processed_count": processed_count,
            "total_count": total_count,
            "elapsed_time": elapsed_time,
            "processing_rate_files_per_sec": processed_count / elapsed_time if elapsed_time > 0 else 0,
            "memory_usage_mb": self.detailed_progress.get("memory_usage_mb", 0)
        }
        
        if current_file:
            details["current_file_processing"] = os.path.basename(current_file)
        
        # Periodic memory and performance tracking
        if processed_count % 25 == 0:
            if hasattr(self.stats, 'track_memory_usage'):
                self.stats.track_memory_usage()
            
            # Record performance checkpoint
            checkpoint = {
                'processed_count': processed_count,
                'timestamp': current_time,
                'memory_mb': self._get_current_memory_usage(),
                'rate': processed_count / elapsed_time if elapsed_time > 0 else 0
            }
            self.performance_metrics['processing_checkpoints'].append(checkpoint)
        
        # Emit progress update with enhanced information
        self.emit_progress_update(progress=self.progress, message=msg, details=details)

    def _calculate_processing_efficiency(self) -> dict:
        """Calculate comprehensive task-specific efficiency metrics."""
        try:
            duration = time.time() - self.start_time
            processed_files = getattr(self.stats, 'processed_files', 0)
            total_bytes = getattr(self.stats, 'total_bytes', 0)
            
            efficiency_metrics = {
                'files_per_second': processed_files / duration if duration > 0 else 0,
                'bytes_per_second': total_bytes / duration if duration > 0 else 0,
                'mb_per_second': (total_bytes / (1024 * 1024)) / duration if duration > 0 else 0,
                'overall_efficiency_score': 50  # Default neutral score
            }
            
            # Calculate overall efficiency score (0-100)
            if processed_files > 0 and duration > 0:
                # Base score on processing rate
                rate_score = min(100, efficiency_metrics['files_per_second'] * 20)
                # Base score on throughput
                throughput_score = min(100, efficiency_metrics['mb_per_second'] * 10)
                # Combine scores
                efficiency_metrics['overall_efficiency_score'] = round((rate_score + throughput_score) / 2, 2)
            
            return efficiency_metrics
            
        except Exception as e:
            logger.error(f"Error calculating processing efficiency: {e}")
            return {'error': str(e), 'overall_efficiency_score': 0}

    def _process_logic(self):
        """Enhanced process logic with comprehensive stats and corrected cancellation handling."""
        # Start enhanced monitoring systems
        self._start_memory_monitoring()
        
        try:
            # Validate prerequisites
            if not structify_available:
                self.handle_error("Structify module (claude.py) is not available.", stage="initialization")
                return
            
            # Record processing start
            processing_start_time = time.time()
            self.processing_stages.append({
                'stage': 'initialization', 
                'start_time': processing_start_time,
                'memory_mb': self._get_current_memory_usage()
            })
            
            # Emit enhanced initial progress
            logger.info(f"Task {self.task_id}: Starting enhanced file processing for directory: {self.input_dir}")
            self.message = f"Processing files in {self.input_dir} with enhanced analytics..."
            self.emit_progress_update(
                progress=1, 
                message=self.message,
                details={
                    'stage': 'initialization',
                    'batch_size': self.batch_size,
                    'chunk_size': self.current_chunk_size,
                    'memory_limit_mb': self.max_allowed_memory_mb
                }
            )
            
            # Set up enhanced timeout handler
            def timeout_handler():
                if not self._check_internal_cancellation():
                    logger.warning(f"Task {self.task_id} timeout after {self.timeout_seconds}s")
                    # Set internal cancellation flags
                    self.status = "cancelled"
                    if hasattr(self, 'is_cancelled_flag'):
                        self.is_cancelled_flag = True
                    self.handle_error(
                        f"Task timed out after {self.timeout_seconds} seconds",
                        stage="timeout",
                        details={
                            "timeout_seconds": self.timeout_seconds,
                            "files_processed": getattr(self.stats, 'processed_files', 0)
                        }
                    )
            
            # Start timeout timer
            timeout_timer = None
            if self.timeout_seconds > 0:
                timeout_timer = threading.Timer(self.timeout_seconds, timeout_handler)
                timeout_timer.daemon = True
                timeout_timer.start()
            
            try:
                # Select optimal processing function
                try:
                    from Structify.claude import process_all_files as direct_process_all_files
                    logger.info("Using direct import of process_all_files")
                    process_func = direct_process_all_files
                except ImportError:
                    logger.info("Using process_all_files from components")
                    process_func = process_all_files
                
                # Record processing stage
                self.processing_stages.append({
                    'stage': 'main_processing',
                    'start_time': time.time(),
                    'memory_mb': self._get_current_memory_usage()
                })
                
                # Enhanced processing call with optimized parameters
                logger.info(f"Starting main processing with batch_size={self.batch_size}, "
                           f"chunk_size={self.current_chunk_size}")
                
                result_data = process_func(
                    root_directory=self.input_dir,
                    output_file=self.output_file,
                    max_chunk_size=self.current_chunk_size,
                    executor_type="thread",
                    max_workers=min(DEFAULT_NUM_THREADS, self.batch_size // 10 + 1),
                    stop_words=DEFAULT_STOP_WORDS,
                    use_cache=False,
                    valid_extensions=DEFAULT_VALID_EXTENSIONS,
                    ignore_dirs="venv,node_modules,.git,__pycache__,dist,build,.pytest_cache",
                    stats_only=False,
                    include_binary_detection=True,
                    overlap=DEFAULT_CHUNK_OVERLAP,
                    max_file_size=MAX_FILE_SIZE,
                    timeout=self.timeout_seconds,
                    progress_callback=self._structify_progress_callback,
                    stats_obj=self.stats,
                    error_on_empty=False,
                    include_failed_files=True
                )
                
            finally:
                # Cancel timeout timer
                if timeout_timer:
                    timeout_timer.cancel()
                
                # Record processing completion
                self.processing_stages.append({
                    'stage': 'processing_complete',
                    'start_time': time.time(),
                    'memory_mb': self._get_current_memory_usage()
                })
            
            # Check for cancellation after processing
            if self._check_internal_cancellation():
                logger.info(f"Task {self.task_id} processing was cancelled.")
                self.status = "cancelled"
                return
            
            # Enhanced result validation and processing
            if self._validate_processing_results(result_data):
                # Finalize stats with enhanced information
                if hasattr(self.stats, 'finish_processing'):
                    self.stats.finish_processing()
                
                # Calculate comprehensive performance metrics
                end_time = time.time()
                task_duration = end_time - self.start_time
                
                performance_metrics = {
                    'task_duration': task_duration,
                    'processing_efficiency': self._calculate_processing_efficiency(),
                    'processing_stages': self.processing_stages,
                    'adaptive_optimizations': {
                        'final_chunk_size': self.current_chunk_size,
                        'final_batch_size': self.batch_size,
                        'gc_events': self.performance_metrics.get('gc_events', 0)
                    }
                }
                
                # Success case - emit enhanced completion
                self.status = "completed"
                self.progress = 100
                
                try:
                    # Try to use enhanced completion emission
                    emit_enhanced_task_completion(
                        task_id=self.task_id,
                        task_type=self.task_type,
                        output_file=self.output_file,
                        stats=self.stats,
                        performance_metrics=performance_metrics
                    )
                    
                    # Add to task history
                    add_task_to_history(
                        self.task_id,
                        self.task_type,
                        self.stats,
                        self.output_file
                    )
                    
                    logger.info(f"Task {self.task_id} completed with enhanced stats showcase")
                    
                except NameError:
                    # Fallback to standard completion if enhanced stats not available
                    logger.warning("Enhanced stats showcase not available, using standard completion")
                    emit_task_completion(
                        self.task_id,
                        self.task_type,
                        self.output_file,
                        self.stats
                    )
                except Exception as e:
                    logger.error(f"Error in enhanced task completion: {e}")
                    # Fallback to standard completion
                    emit_task_completion(
                        self.task_id,
                        self.task_type,
                        self.output_file,
                        self.stats
                    )
            
        except InterruptedError:
            # Handle cancellation gracefully
            logger.info(f"Task {self.task_id} processing cancelled via InterruptedError.")
            self.status = "cancelled"
            raise
            
        except Exception as e:
            # Enhanced error handling with performance context
            error_context = {
                "traceback": traceback.format_exc(),
                "performance_metrics": self.performance_metrics,
                "memory_at_error": self._get_current_memory_usage(),
                "processing_stages": self.processing_stages
            }
            
            logger.error(f"Enhanced error during _process_logic for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(
                str(e),
                stage="enhanced_processing_execution",
                details=error_context
            )
            
        finally:
            # Enhanced cleanup and final reporting
            self._stop_memory_monitoring()
            
            # Log comprehensive final stats
            try:
                final_duration = time.time() - self.start_time
                logger.info(f"Task {self.task_id} enhanced final stats: "
                           f"processed={getattr(self.stats, 'processed_files', 0)}, "
                           f"errors={getattr(self.stats, 'error_files', 0)}, "
                           f"skipped={getattr(self.stats, 'skipped_files', 0)}, "
                           f"pdfs={getattr(self.stats, 'pdf_files', 0)}, "
                           f"duration={final_duration:.2f}s, "
                           f"efficiency={self._calculate_processing_efficiency().get('overall_efficiency_score', 0)}")
            except Exception as e:
                logger.debug(f"Error logging enhanced final stats: {e}")

    def _validate_processing_results(self, result_data) -> bool:
        """Enhanced validation of processing results with detailed quality checks."""
        try:
            # Update task's output_file if modified by process_all_files
            if result_data and isinstance(result_data, dict) and "output_file" in result_data:
                self.output_file = result_data["output_file"]
            
            # Update stats object from result if needed
            if result_data and isinstance(result_data, dict) and "stats" in result_data:
                self._merge_stats_from_result(result_data["stats"])
            
            # Check for processing errors
            if result_data and isinstance(result_data, dict) and result_data.get("error"):
                error_msg = result_data["error"]
                self.handle_error(
                    error_msg,
                    stage="structify_processing_validation"
                )
                return False
            
            # Validate result data existence
            if not result_data:
                self.handle_error(
                    "No results returned from processing",
                    stage="result_validation"
                )
                return False
            
            # Enhanced output file validation
            return self._validate_output_file()
            
        except Exception as e:
            logger.error(f"Error validating processing results: {e}")
            self.handle_error(
                f"Error during result validation: {str(e)}",
                stage="validation_error"
            )
            return False

    def _merge_stats_from_result(self, result_stats):
        """Merge statistics from processing result into task stats."""
        try:
            if isinstance(self.stats, CustomFileStats) and isinstance(result_stats, dict):
                # Merge dict stats into CustomFileStats object
                for key, value in result_stats.items():
                    if hasattr(self.stats, key):
                        setattr(self.stats, key, value)
            elif hasattr(result_stats, 'to_dict'):
                # If result_stats is also a CustomFileStats object, use it directly
                self.stats = result_stats
            else:
                # Fallback for incompatible types
                logger.warning(f"Stats type mismatch: expected CustomFileStats, got {type(result_stats)}")
                self.stats = result_stats
                
        except Exception as e:
            logger.error(f"Error merging stats from result: {e}")

    def _validate_output_file(self) -> bool:
        """Enhanced output file validation with quality metrics."""
        try:
            if not os.path.exists(self.output_file):
                self.handle_error(
                    "Processing completed but output file was not created",
                    stage="output_validation"
                )
                return False
            
            # Check file size and content quality
            file_size = os.path.getsize(self.output_file)
            if file_size < 100:  # Less than 100 bytes is suspiciously small
                self.handle_error(
                    "Output file was created but appears to be empty or nearly empty",
                    stage="output_size_validation"
                )
                return False
            
            logger.info(f"Output file validation passed: {self.output_file} ({file_size} bytes)")
            return True
            
        except Exception as e:
            self.handle_error(
                f"Error validating output file: {str(e)}",
                stage="output_validation_error"
            )
            return False

    def emit_progress_update(self, progress=None, message=None, details=None):
        """Enhanced progress update emission with performance context."""
        if progress is not None:
            self.progress = progress
        
        # Add performance context to details
        if details is None:
            details = {}
        
        # Enhance details with current performance metrics
        details.update({
            'memory_usage_mb': self._get_current_memory_usage(),
            'current_chunk_size': self.current_chunk_size,
            'current_batch_size': self.batch_size,
            'gc_events': self.performance_metrics.get('gc_events', 0)
        })
        
        # Call parent class method if available
        if hasattr(super(), 'emit_progress_update'):
            super().emit_progress_update(progress=progress, message=message, details=details)
        
        # Enhanced logging with performance context
        if message and progress is not None:
            logger.info(f"Task {self.task_id} progress: {self.progress}% - {message}")

    def get_status(self):
        """Enhanced status information with comprehensive metrics."""
        elapsed_time = time.time() - self.start_time
        
        # Enhanced status information
        status_info = {
            "task_id": self.task_id,
            "status": self.status,
            "message": self.message,
            "progress": self.progress,
            "input_dir": self.input_dir,
            "output_file": self.output_file,
            "elapsed_time": elapsed_time,
            "start_time": self.start_time,
            "performance_metrics": {
                "memory_usage_mb": self._get_current_memory_usage(),
                "processing_rate": self.detailed_progress.get("processing_rate", 0),
                "current_chunk_size": self.current_chunk_size,
                "current_batch_size": self.batch_size,
                "gc_events": self.performance_metrics.get('gc_events', 0)
            }
        }
        
        # Add comprehensive stats if available
        if hasattr(self, 'stats') and self.stats:
            try:
                if hasattr(self.stats, 'to_dict'):
                    status_info["stats"] = self.stats.to_dict()
                else:
                    status_info["stats"] = self.stats
            except Exception as e:
                logger.debug(f"Error adding stats to status: {e}")
                status_info["stats"] = {"error": "Stats unavailable"}
        
        # Add error information if available
        if hasattr(self, 'error') and self.error:
            status_info["error"] = self.error
        
        return status_info
             
class PlaylistTask(BaseTask):
    """
    Task object for processing YouTube playlists with improved path handling and progress reporting.
    
    Features:
    - Inherits from BaseTask for consistent task management
    - Properly resolves output file paths to respect user input from the UI
    - Handles absolute/relative paths and ensures files are created in user-specified locations
    - Uses granular progress updates with proper stage tracking
    - Implements robust error handling and recovery mechanisms
    - Provides detailed status reporting and statistics
    - Supports proper cancellation and resource cleanup
    - Uses enhanced Socket.IO reporting for reliable progress updates
    - Memory-optimized processing for better performance
    - Comprehensive logging for traceability
    """
    def __init__(self, task_id: str, playlist_url: str = None, output_dir: str = None, 
                 include_audio: bool = True, include_video: bool = False):
        """
        Initialize a new playlist processing task.
        
        Args:
            task_id (str): Unique identifier for the task
            playlist_url (str, optional): URL of the playlist to process
            output_dir (str, optional): Directory to store downloaded files
            include_audio (bool): Whether to download audio files
            include_video (bool): Whether to download video files
        """
        # Initialize the parent class with task_id and task_type
        super().__init__(task_id, task_type="playlist_processing")
        
        # Playlist configuration
        self.playlists = []
        self.playlist_url = playlist_url
        self.api_key = YOUTUBE_API_KEY
        self.root_directory = output_dir or os.path.join(DEFAULT_OUTPUT_FOLDER, "playlists")
        self.output_file = None
        self.include_audio = include_audio
        self.include_video = include_video
        
        # Progress tracking enhancements
        self.current_stage = "initialization"
        self.stage_progress = 0
        self.detailed_progress = {}
        self.retries_count = 0
        self.max_retries = 3
        
        # Resource management
        self._cleanup_lock = threading.Lock()
        self._is_cleaning_up = False
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        
        # Set initial message and statistics
        self.message = f"Preparing to process playlists" + (f" from {playlist_url}" if playlist_url else "")
        self.stats = self._build_initial_stats()
        
        # Ensure output directory exists
        os.makedirs(self.root_directory, exist_ok=True)
        
        logger.info(f"PlaylistTask {self.task_id} created for {'single playlist' if playlist_url else 'multiple playlists'}")
    
    def start(self, playlists=None, root_directory=None, output_file=None):
        """
        Start the playlist download task.
        
        Can be called with explicit parameters to override those from __init__,
        or will use the values provided at initialization.
        
        Args:
            playlists (list, optional): List of playlist dictionaries with url and folder keys
            root_directory (str, optional): Base directory for download 
            output_file (str, optional): Path for the output JSON file
            
        Returns:
            Dict with task info and status
        """
        try:
            # Update parameters if provided
            if playlists is not None:
                self.playlists = playlists
            elif self.playlist_url:
                # Create a playlist entry from the URL provided in __init__
                self.playlists = [{
                    "url": self.playlist_url,
                    "folder": os.path.join(self.root_directory, "playlist_" + str(int(time.time())))
                }]
                
            if root_directory is not None:
                self.root_directory = root_directory
                
            # Handle output file path resolution
            if output_file is not None:
                self.output_file = self._resolve_output_file_path(output_file)
            else:
                # Generate default output path
                default_filename = "playlists.json"
                self.output_file = os.path.join(self.root_directory, default_filename)
                
            logger.info(f"Starting playlist task {self.task_id} with {len(self.playlists or [])} playlists")
            logger.info(f"Parameters: root_directory='{self.root_directory}', output_file='{self.output_file}'")
            
            # Validate parameters
            self._validate_parameters()
            
            # Create base directories
            self._ensure_directories_exist()
            
            # Start memory monitoring
            self._start_memory_monitoring()
            
            # Use parent class method to start the task
            base_result = super().start()
            
            # Merge with additional playlist-specific info
            return {
                **base_result,  # Include base task info
                "output_file": self.output_file,
                "root_directory": self.root_directory,
                "playlists_count": len(self.playlists)
            }
            
        except ValueError as ve:
            # Handle validation errors with clear message
            logger.error(f"Validation error in playlist task: {ve}")
            self.handle_error(f"Validation error: {str(ve)}", stage="initialization")
            return {"task_id": self.task_id, "status": "failed", "error": str(ve)}
            
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Error starting playlist task: {e}", exc_info=True)
            self.handle_error(f"Failed to start task: {str(e)}", stage="initialization")
            return {"task_id": self.task_id, "status": "failed", "error": str(e)}
    
    def _resolve_output_file_path(self, output_file):
        """
        Resolve the output file path properly to respect user input.
        
        Handles the case where a user might enter a complete path 
        (like C:\\Users\\Los\\Documents\\AgencySwarm.json) in the output field.
        
        Args:
            output_file: The original output file path
            
        Returns:
            A properly resolved output file path
        """
        logger.debug(f"Resolving output path from: output_file='{output_file}', root_directory='{self.root_directory}'")
        
        if not output_file:
            # Default to a filename in the root directory
            return os.path.join(self.root_directory, "playlists.json")
        
        # If output_file already has .json extension, keep it, otherwise add it
        has_extension = output_file.lower().endswith('.json')
        
        # CASE 1: Complete Windows path with drive letter - C:\path\to\file.json
        if re.match(r'^[A-Za-z]:', output_file):
            # User provided a Windows absolute path with drive letter
            # Check if this is a complete path with directory
            if os.path.dirname(output_file):
                # This is a complete path including directory, use as-is
                # Just ensure it has .json extension
                if not has_extension:
                    output_file += '.json'
                logger.info(f"Using complete Windows path: {output_file}")
                return output_file
        
        # CASE 2: Unix absolute path - /path/to/file.json
        if output_file.startswith('/'):
            # This is a Unix absolute path, use as-is
            # Just ensure it has .json extension
            if not has_extension:
                output_file += '.json'
            logger.info(f"Using Unix absolute path: {output_file}")
            return output_file
        
        # CASE 3: Path with separators but not absolute - subfolder/file.json
        if '\\' in output_file or '/' in output_file:
            # Extract just the filename to avoid path confusion
            filename = os.path.basename(output_file)
            # Ensure it has .json extension
            if not has_extension:
                filename += '.json'
            # Join with root directory
            result = os.path.join(self.root_directory, filename)
            logger.info(f"Extracted filename '{filename}' from path with separators, joined with root: {result}")
            return result
        
        # CASE 4: Just a filename - file.json
        # It's just a filename, add extension if needed and join with root directory
        if not has_extension:
            output_file += '.json'
        
        result = os.path.join(self.root_directory, output_file)
        logger.info(f"Using filename joined with root directory: {result}")
        return result
    
    def _validate_parameters(self):
        """
        Validate parameters to ensure they meet requirements.
        Raises ValueError if validation fails.
        """
        # Check if API key is set
        if not self.api_key:
            raise ValueError("YouTube API key is not set. Please configure your API key.")
        
        # Validate playlists list
        if not self.playlists or not isinstance(self.playlists, list):
            raise ValueError("No playlists provided or invalid playlist format.")
        
        # Check each playlist has required fields
        for idx, playlist in enumerate(self.playlists):
            if not isinstance(playlist, dict):
                raise ValueError(f"Playlist {idx+1} is not a valid dictionary.")
            
            if "url" not in playlist:
                raise ValueError(f"Playlist {idx+1} is missing the 'url' field.")
            
            if "folder" not in playlist:
                # Add default folder based on index
                playlist["folder"] = os.path.join(self.root_directory, f"playlist_{idx+1}")
                logger.info(f"Added default folder for playlist {idx+1}: {playlist['folder']}")
            
            # Validate URL format
            url = playlist["url"]
            if not url or 'list=' not in url:
                raise ValueError(f"Invalid playlist URL format: {url}")
    
    def _ensure_directories_exist(self):
        """
        Ensure all required directories exist.
        Creates directories as needed.
        """
        # Ensure root directory exists
        try:
            os.makedirs(self.root_directory, exist_ok=True)
            logger.info(f"Ensured root directory exists: {self.root_directory}")
            
            # Ensure output file directory exists
            output_dir = os.path.dirname(self.output_file)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                logger.info(f"Ensured output directory exists: {output_dir}")
                
            # Create playlist folders
            for playlist in self.playlists:
                if "folder" in playlist and playlist["folder"]:
                    os.makedirs(playlist["folder"], exist_ok=True)
                    logger.info(f"Ensured playlist directory exists: {playlist['folder']}")
        except Exception as e:
            logger.error(f"Error creating directories: {e}")
            raise ValueError(f"Failed to create required directories: {str(e)}")
    
    def _build_initial_stats(self):
        """
        Create initial stats dictionary for progress reporting
        """
        return {
            "total_playlists": len(self.playlists) if hasattr(self, 'playlists') and self.playlists else 0,
            "processed_playlists": 0,
            "empty_playlists": 0,
            "skipped_playlists": 0,
            "failed_playlists": 0,
            "total_videos": 0,
            "processed_videos": 0,
            "download_directory": self.root_directory,
            "output_file": self.output_file,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "include_audio": self.include_audio,
            "include_video": self.include_video,
            "estimated_completion_time": None,
            "memory_usage_mb": 0,
            "retries_count": 0
        }
    
    def _process_logic(self):
        """Main processing logic for the task, called by BaseTask._run_process"""
        try:
            # Import required modules from playlists_downloader.py
            from playlists_downloader import (
                download_all_playlists, 
                get_playlist_video_ids, 
                get_video_titles, 
                download_transcript
            )
            
            stats = CustomFileStats()
            
            # Calculate total progress allocation breakdown:
            # - 2% for initialization
            # - 88% for playlist downloading (distributed among playlists)
            # - 10% for final processing and JSON generation
            
            # Initialize our stats tracking if needed
            if not self.stats:
                self.stats = self._build_initial_stats()
            
            # Update to show directory validation - 1% progress
            self.emit_progress_update(
                progress=1,
                message="Validating directories...",
                stats_override=self.stats
            )
            
            # Prepare directories with another 1% progress
            try:
                # Ensure output directory exists
                output_dir = os.path.dirname(self.output_file)
                if output_dir:
                    os.makedirs(output_dir, exist_ok=True)
                    logger.info(f"Ensured output directory exists: {output_dir}")
            except Exception as dir_err:
                logger.error(f"Error creating output directory: {dir_err}")
                self.handle_error(f"Failed to create output directory: {str(dir_err)}", stage="directory_preparation")
                return
            
            # Progress update after directory preparation - 2% total now
            self.emit_progress_update(
                progress=2,
                message="Preparing to download playlists...",
                stats_override=self.stats
            )
            
            # Check if task has been cancelled before we start downloading
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} was cancelled before processing")
                return
            
            # Create a progress callback for download_all_playlists with rate limiting
            def progress_callback(stage, current, total, message):
                # Check for cancellation
                if self.is_cancelled_flag:
                    raise InterruptedError("Task cancelled")
                
                # Calculate overall progress based on stage and current/total
                if stage == 'init':
                    # Initialization stage (first 2%)
                    progress = 2 + (current / total) * 2
                    self.current_stage = "initialization"
                elif stage == 'video_ids':
                    # Video IDs retrieval stage (4% to 20%)
                    progress = 4 + (current / total) * 16
                    self.current_stage = "retrieving_videos"
                elif stage == 'titles':
                    # Titles retrieval stage (20% to 30%)
                    progress = 20 + (current / total) * 10
                    self.current_stage = "retrieving_titles"
                elif stage == 'download':
                    # Download stage (30% to 90%)
                    progress = 30 + (current / total) * 60
                    self.current_stage = "downloading_transcripts"
                elif stage == 'complete':
                    # Completion stage (90% to 95%)
                    progress = 90 + (current / total) * 5
                    self.current_stage = "finalizing"
                else:
                    # Unknown stage - just use current/total with 2-90% range
                    progress = 2 + (current / total) * 88
                    self.current_stage = stage
                
                # Update stage progress for detailed reporting
                self.stage_progress = current / total if total > 0 else 0
                
                # Update detailed progress data for status queries
                self.detailed_progress = {
                    "stage": stage,
                    "current": current,
                    "total": total,
                    "message": message,
                    "progress_percentage": self.stage_progress * 100
                }
                
                # Update our internal state and emit progress update
                self.emit_progress_update(
                    progress=int(progress),
                    message=message,
                    details=self.detailed_progress
                )
            
            # Download playlists with progress tracking and error handling
            try:
                # Main download process with automatic retry
                max_retries = self.max_retries
                retry_count = 0
                results = None
                
                while retry_count <= max_retries and results is None:
                    try:
                        # Actual download process
                        results = download_all_playlists(
                            self.api_key, 
                            self.playlists,
                            progress_callback=progress_callback
                        )
                    except Exception as download_err:
                        retry_count += 1
                        self.retries_count += 1
                        self.stats["retries_count"] = self.retries_count
                        
                        # Check if we should retry
                        if retry_count <= max_retries:
                            logger.warning(f"Error downloading playlists (attempt {retry_count}): {download_err}")
                            
                            # Backoff before retry
                            backoff_time = min(3 * retry_count, 10)  # Max 10 seconds backoff
                            
                            # Update progress with retry info
                            self.emit_progress_update(
                                progress=self.progress,
                                message=f"Retrying after error (attempt {retry_count}/{max_retries}). Waiting {backoff_time}s...",
                                details={"error": str(download_err), "retry_count": retry_count}
                            )
                            
                            # Backoff before retry
                            time.sleep(backoff_time)
                        else:
                            # Max retries reached, propagate error
                            raise download_err
                
                # Process completed successfully
                if results:
                    # Update stats with results
                    total_videos = sum(len(p.get("videos", [])) for p in results if p.get("status") == "completed")
                    self.stats["total_videos"] = total_videos
                    self.stats["processed_videos"] = total_videos
                    self.stats["processed_playlists"] = len([p for p in results if p.get("status") == "completed"])
                    self.stats["empty_playlists"] = len([p for p in results if p.get("status") == "empty"])
                    self.stats["skipped_playlists"] = len([p for p in results if p.get("status") == "skipped"])
                    self.stats["failed_playlists"] = len([p for p in results if p.get("status") in ["failed", "error"]])
                    
                    # Keep track of playlists data
                    self.playlists_data = results
                else:
                    logger.error("Download process returned empty results")
                    self.handle_error("Download process failed to return results", stage="download_complete")
                    return
                
            except InterruptedError:
                # Rethrow cancellation for BaseTask to handle
                raise
            except Exception as e:
                logger.error(f"Error downloading playlists: {e}", exc_info=True)
                self.handle_error(f"Failed to download playlists: {str(e)}", stage="download")
                return
            
            # Check if task has been cancelled
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} was cancelled during processing")
                raise InterruptedError("Task was cancelled")
            
            # Transition to final processing phase - 90% completion
            self.emit_progress_update(
                progress=90,
                message="Generating JSON output...",
                stats_override=self.stats
            )
            
            try:
                # Process all files with the improved file handling
                self.current_stage = "json_processing"
                
                # Update progress at 92% - file processing started
                self.emit_progress_update(
                    progress=92,
                    message="Processing downloaded files...",
                    stats_override=self.stats
                )
                
                # Check if process_all_files is available from Structify module
                if 'process_all_files' in globals() or hasattr(structify_module, 'process_all_files'):
                    # Use the process_all_files function if available
                    process_func = globals().get('process_all_files') or getattr(structify_module, 'process_all_files')
                    
                    # Process the files
                    result = process_func(
                        root_directory=self.root_directory,
                        output_file=self.output_file,
                        max_chunk_size=DEFAULT_MAX_CHUNK_SIZE,
                        executor_type="thread",
                        max_workers=DEFAULT_NUM_THREADS,
                        stop_words=DEFAULT_STOP_WORDS,
                        use_cache=False,
                        valid_extensions=DEFAULT_VALID_EXTENSIONS,
                        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                        stats_only=False,
                        include_binary_detection=True,
                        overlap=DEFAULT_CHUNK_OVERLAP,
                        max_file_size=MAX_FILE_SIZE,
                        timeout=DEFAULT_PROCESS_TIMEOUT,
                        progress_callback=self._structify_progress_callback,
                        stats_obj=stats
                    )
                    
                    # Update progress to 95% - processing almost done
                    self.emit_progress_update(
                        progress=95,
                        message="Finalizing JSON output...",
                        stats_override=self.stats
                    )
                    
                    # Update output file if it was changed during processing
                    if result and isinstance(result, dict) and "output_file" in result:
                        self.output_file = result["output_file"]
                        logger.info(f"Updated output file path from processing: {self.output_file}")
                else:
                    logger.warning("Structify module process_all_files not available, using direct JSON writing")
                    
                    # Create a simple JSON output
                    with open(self.output_file, 'w', encoding='utf-8') as f:
                        json.dump({
                            "playlists": self.playlists_data,
                            "stats": self.stats,
                            "status": "completed",
                            "message": "Generated without structify module"
                        }, f, indent=2)
                
                # Progress to 98% - final touches
                self.emit_progress_update(
                    progress=98,
                    message="Completing playlist download...",
                    stats_override=self.stats
                )
                
                # Mark the task as completed - BaseTask._run_process will handle completion
                self.status = "completed"
                
                # Merge our tracking stats with the file stats
                file_stats = stats.to_dict() if hasattr(stats, 'to_dict') else {}
                merged_stats = {**file_stats, **self.stats}
                self.stats = merged_stats
                
                logger.info(f"Playlist task {self.task_id} completed successfully")
                
            except Exception as e:
                logger.error(f"Error during file processing: {e}", exc_info=True)
                self.handle_error(f"Failed to process files: {str(e)}", stage="file_processing")
                
        except InterruptedError:
            # Let BaseTask handle the cancellation
            raise
        except Exception as e:
            logger.error(f"Unexpected error in playlist task: {e}", exc_info=True)
            self.handle_error(f"Unexpected error in playlist task: {str(e)}", stage="processing")
        finally:
            # Ensure cleanup happens even if there's an error
            self._cleanup_resources()
            self._stop_memory_monitoring()
    
    def _structify_progress_callback(self, processed_count, total_count, stage_message, current_file=None):
        """
        Callback function for structify module progress updates.
        Maps structify progress to our overall 90-98% range.
        
        Args:
            processed_count: Number of items processed
            total_count: Total number of items to process
            stage_message: Current processing stage
            current_file: Optional current file being processed
        """
        if self.is_cancelled_flag:
            raise InterruptedError("Task cancelled by user")

        # Calculate progress within the 92-98% range
        if total_count > 0:
            structify_progress = processed_count / total_count
            # Map to our range (92-98%)
            overall_progress = 92 + structify_progress * 6
            self.progress = min(int(overall_progress), 98)
        else:
            self.progress = 95  # Default progress if total_count is 0
        
        # Prepare message and details
        msg = f"Processing files: {stage_message} ({processed_count}/{total_count})"
        if current_file:
            msg += f" - Current: {os.path.basename(current_file)}"
        
        details = {
            "current_stage": "file_processing",
            "current_stage_message": stage_message,
            "processed_count": processed_count,
            "total_count": total_count
        }
        
        if current_file:
            details["current_file"] = os.path.basename(current_file)
        
        # Emit progress update
        self.emit_progress_update(progress=self.progress, message=msg, details=details)
    
    def _cleanup_resources(self):
        """Clean up resources to prevent leaks."""
        with self._cleanup_lock:
            if self._is_cleaning_up:
                return
                
            self._is_cleaning_up = True
            
            try:
                # Clean up temporary files
                try:
                    # Check for common temp file patterns in playlist folders
                    temp_patterns = ["*.tmp", "*.temp", "*_temp_*"]
                    temp_files_removed = 0
                    
                    for playlist in self.playlists:
                        if "folder" in playlist and os.path.exists(playlist["folder"]):
                            for pattern in temp_patterns:
                                try:
                                    import glob
                                    for temp_file in glob.glob(os.path.join(playlist["folder"], pattern)):
                                        try:
                                            if os.path.isfile(temp_file):
                                                os.remove(temp_file)
                                                temp_files_removed += 1
                                        except Exception:
                                            pass
                                except Exception:
                                    pass
                    
                    if temp_files_removed > 0:
                        logger.debug(f"Removed {temp_files_removed} temporary files during cleanup")
                except Exception:
                    pass  # Silently ignore temp file cleanup errors
                
                logger.debug(f"Resources cleaned up for task {self.task_id}")
            except Exception as e:
                logger.error(f"Error during resource cleanup: {e}")
            finally:
                self._is_cleaning_up = False
                
    def _start_memory_monitoring(self):
        """Start a background thread to monitor memory usage."""
        def monitor_memory():
            try:
                import psutil
                process = psutil.Process()
                
                while self.memory_monitor_active:
                    try:
                        # Get memory usage
                        memory_info = process.memory_info()
                        memory_mb = memory_info.rss / (1024 * 1024)
                        
                        # Update stats
                        if isinstance(self.stats, dict):
                            self.stats["memory_usage_mb"] = round(memory_mb, 1)
                            
                        # Check if memory usage is too high
                        if memory_mb > self.max_allowed_memory_mb:
                            logger.warning(f"Memory usage too high ({memory_mb:.1f}MB). Running garbage collection.")
                            import gc
                            gc.collect()
                            
                        # Sleep to prevent too frequent checks
                        time.sleep(self.memory_check_interval)
                    except Exception as e:
                        logger.debug(f"Error in memory monitoring: {e}")
                        time.sleep(self.memory_check_interval)
            except ImportError:
                logger.debug("psutil not available, memory monitoring disabled")
                
        # Start the monitoring thread
        self.memory_monitor_active = True
        self.memory_monitor_thread = threading.Thread(target=monitor_memory, daemon=True)
        self.memory_monitor_thread.start()

    def _stop_memory_monitoring(self):
        """Stop the memory monitoring thread."""
        if self.memory_monitor_active:
            self.memory_monitor_active = False
            if self.memory_monitor_thread:
                self.memory_monitor_thread.join(timeout=1.0)
    
    def get_detailed_status(self):
        """
        Get comprehensive status information about the task.
        Extends the base get_status with playlist-specific information.
        
        Returns:
            Dict with comprehensive status information
        """
        # Get base status from parent class
        base_status = self.get_status()
        
        # Add playlist-specific details
        playlist_status = {
            "playlists_count": len(self.playlists) if hasattr(self, 'playlists') and self.playlists else 0,
            "current_stage": self.current_stage,
            "stage_progress": self.stage_progress,
            "detailed_progress": self.detailed_progress,
            "retries_count": self.retries_count,
            "include_audio": self.include_audio,
            "include_video": self.include_video
        }
        
        # Merge base and playlist-specific status
        return {**base_status, **playlist_status}
    
class ScraperTask(BaseTask):
    """
    Enhanced task object for web scraping with comprehensive PDF download support and analytics.
    
    Features:
      - Parallel PDF downloading with controlled concurrency and adaptive optimization
      - Comprehensive error handling and retry mechanisms with exponential backoff
      - Real-time progress tracking with memory-efficient updates and performance metrics
      - Advanced resource management and cleanup with memory monitoring
      - Robust task cancellation support with graceful cleanup
      - Enhanced PDF processing options with OCR and table extraction
      - Comprehensive Socket.IO integration with detailed progress events
      - Performance analytics and efficiency tracking
      - Integration with enhanced stats showcase system
    """
    
    def __init__(self, task_id: str):
        """
        Initialize enhanced scraper task with comprehensive monitoring and analytics.
        
        Args:
            task_id: Unique identifier for the task
        """
        super().__init__(task_id, task_type="web_scraping")
        
        # Core scraper configuration
        self.url_configs: List[Dict[str, str]] = []
        self.root_scrape_directory: Optional[str] = None
        self.pdf_options: Dict[str, Any] = {
            'process_pdfs': True,
            'use_ocr': True,
            'extract_tables': True,
            'chunk_size': DEFAULT_MAX_CHUNK_SIZE,
            'timeout_seconds': 300,
            'max_file_size_mb': 50
        }
        
        # Enhanced statistics and tracking
        self.scraper_run_stats = CustomFileStats()  # For final structify step
        self.url_processing_summary: Dict[str, Any] = {
            "total_urls_configured": 0,
            "processed_urls_count": 0,
            "successful_urls_count": 0,
            "failed_urls_count": 0,
            "total_pdfs_downloaded": 0,
            "total_download_size_bytes": 0,
            "total_processing_time": 0,
            "pdf_download_details": [],  # Detailed tracking of each PDF
            "performance_metrics": {},
            "error_analysis": {}
        }
        self.stats = self.url_processing_summary  # Initial stats reference
        
        # Enhanced threading and concurrency management
        self.active_futures: Set[Any] = set()
        self.thread_lock = threading.RLock()
        self.download_semaphore = None  # Will be initialized based on system capacity
        
        # Performance tracking and optimization
        self.performance_metrics = {
            'download_rates': [],
            'processing_times': [],
            'memory_usage_samples': [],
            'error_patterns': {},
            'optimization_events': [],
            'bottlenecks_detected': []
        }
        
        # Enhanced retry and error handling
        self.retries_count = 0
        self.max_retries = 3
        self.adaptive_retry_delays = [2, 5, 10]  # Exponential backoff
        self.error_recovery_strategies = {
            'network_timeout': 'increase_timeout',
            'memory_limit': 'reduce_concurrency',
            'rate_limit': 'exponential_backoff'
        }
        
        # Quality assurance and monitoring
        self.quality_metrics = {
            'download_success_rate': 0.0,
            'processing_efficiency': 0.0,
            'error_recovery_rate': 0.0,
            'resource_utilization': 0.0
        }
        
        # Adaptive optimization settings
        self.optimization_settings = {
            'adaptive_concurrency': True,
            'intelligent_retry': True,
            'memory_optimization': True,
            'performance_monitoring': True
        }
        
        # Initialize performance monitoring
        self._initialize_performance_tracking()

    def _initialize_performance_tracking(self):
        """Initialize comprehensive performance tracking systems."""
        try:
            # Determine optimal concurrency based on system resources
            cpu_count = os.cpu_count() or 4
            available_memory_gb = self._get_available_memory_gb()
            
            # Calculate optimal concurrent downloads
            if available_memory_gb > 8:
                self.max_concurrent_downloads = min(cpu_count * 2, 16)
            elif available_memory_gb > 4:
                self.max_concurrent_downloads = min(cpu_count, 8)
            else:
                self.max_concurrent_downloads = max(2, cpu_count // 2)
            
            # Initialize semaphore for download concurrency control
            self.download_semaphore = threading.Semaphore(self.max_concurrent_downloads)
            
            # Record initial system state
            self.performance_metrics['initialization'] = {
                'start_time': time.time(),
                'initial_memory_gb': available_memory_gb,
                'cpu_count': cpu_count,
                'max_concurrent_downloads': self.max_concurrent_downloads
            }
            
            logger.info(f"ScraperTask {self.task_id} initialized with {self.max_concurrent_downloads} concurrent downloads")
            
        except Exception as e:
            logger.warning(f"Error initializing performance tracking: {e}")
            self.max_concurrent_downloads = 4  # Safe default
            self.download_semaphore = threading.Semaphore(4)

    def _get_available_memory_gb(self) -> float:
        """Get available system memory in GB."""
        try:
            import psutil
            return psutil.virtual_memory().available / (1024**3)
        except ImportError:
            return 4.0  # Default assumption
        except Exception:
            return 4.0

    def start(self, url_configs: List[Dict[str, str]], root_scrape_directory: str, 
              output_json_file: str, pdf_options: Optional[Dict[str, Any]] = None):
        """
        Start the enhanced scraping task with comprehensive configuration.
        
        Args:
            url_configs: List of URL configurations [{url, setting, keyword?}]
            root_scrape_directory: Base directory for downloads and output
            output_json_file: Path for the output JSON file
            pdf_options: Optional PDF processing configuration
            
        Returns:
            Dict with task info and status
        """
        self.url_configs = url_configs
        self.root_scrape_directory = self._normalize_path(root_scrape_directory)
        self.output_file = get_output_filepath(output_json_file, user_defined_dir=self.root_scrape_directory)
        
        # Update PDF options if provided
        if pdf_options:
            self.pdf_options.update(pdf_options)
        
        # Initialize processing summary
        self.url_processing_summary.update({
            "total_urls_configured": len(self.url_configs),
            "start_time": time.time(),
            "pdf_options": self.pdf_options.copy()
        })
        self.message = f"Preparing to scrape {len(self.url_configs)} URLs with enhanced analytics."
        self.stats = self.url_processing_summary
        
        # Ensure directories exist with proper permissions
        try:
            os.makedirs(self.root_scrape_directory, exist_ok=True)
            output_dir = os.path.dirname(self.output_file)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
        except Exception as e:
            self.handle_error(f"Failed to create directories: {str(e)}", stage="initialization")
            return {"error": f"Directory creation failed: {str(e)}"}
        
        # Validate URL configurations
        validation_result = self._validate_url_configs()
        if not validation_result['valid']:
            self.handle_error(validation_result['error'], stage="validation")
            return {"error": validation_result['error']}
        
        # Emit enhanced initial progress
        self.emit_progress_update(
            progress=0, 
            message=f"Starting enhanced processing of {len(self.url_configs)} URLs...",
            details={
                'max_concurrent_downloads': self.max_concurrent_downloads,
                'pdf_processing_enabled': self.pdf_options.get('process_pdfs', True),
                'optimization_features': list(self.optimization_settings.keys())
            }
        )
        
        # Start background processing
        super().start()
        
        return {
            "task_id": self.task_id,
            "status": self.status,
            "message": self.message,
            "root_directory": self.root_scrape_directory,
            "output_file": self.output_file,
            "task_type": self.task_type,
            "enhanced_features": {
                "adaptive_concurrency": self.optimization_settings['adaptive_concurrency'],
                "performance_monitoring": self.optimization_settings['performance_monitoring'],
                "max_concurrent_downloads": self.max_concurrent_downloads
            }
        }

    def _normalize_path(self, path: str) -> str:
        """Normalize and validate path with security checks."""
        if not path:
            return path
        
        # Normalize and resolve path
        normalized = os.path.normpath(os.path.abspath(path))
        
        # Security check for path traversal
        if '..' in normalized:
            logger.warning(f"Potentially unsafe path detected: {path}")
        
        return normalized

    def _validate_url_configs(self) -> Dict[str, Any]:
        """Validate URL configurations with comprehensive checks."""
        try:
            if not self.url_configs:
                return {'valid': False, 'error': 'No URLs provided for scraping'}
            
            valid_settings = {'pdf', 'text', 'html', 'extract'}
            validation_errors = []
            
            for i, config in enumerate(self.url_configs):
                if not isinstance(config, dict):
                    validation_errors.append(f"URL config {i} is not a dictionary")
                    continue
                
                if 'url' not in config:
                    validation_errors.append(f"URL config {i} missing 'url' field")
                    continue
                
                if 'setting' not in config:
                    validation_errors.append(f"URL config {i} missing 'setting' field")
                    continue
                
                if config['setting'].lower() not in valid_settings:
                    validation_errors.append(f"URL config {i} has invalid setting: {config['setting']}")
                
                # Basic URL validation
                url = config['url']
                if not url.startswith(('http://', 'https://')):
                    validation_errors.append(f"URL config {i} has invalid URL format: {url}")
            
            if validation_errors:
                return {'valid': False, 'error': f"Validation errors: {'; '.join(validation_errors)}"}
            
            return {'valid': True}
            
        except Exception as e:
            return {'valid': False, 'error': f"Validation failed: {str(e)}"}

    def _url_processing_progress_callback(self, url: str, status: str, message: str,
                                        file_path: Optional[str] = None, error: Optional[str] = None,
                                        download_progress: Optional[int] = None, 
                                        download_speed: Optional[float] = None):
        """
        Enhanced callback for individual URL/PDF processing with comprehensive tracking.
        
        Args:
            url: URL being processed
            status: Status string (downloading, processing, success, error, etc.)
            message: Status message
            file_path: Optional path to saved file
            error: Optional error message if status is error
            download_progress: Optional download progress percentage
            download_speed: Optional download speed in MB/s
        """
        if check_task_cancellation(self.task_id):
            return
        
        with self.thread_lock:
            # Find and update the specific download detail
            updated = False
            for detail in self.url_processing_summary["pdf_download_details"]:
                if detail["url"] == url:
                    detail.update({
                        "status": status,
                        "message": message,
                        "timestamp": time.time(),
                        "download_progress": download_progress,
                        "download_speed_mbs": download_speed
                    })
                    
                    if file_path:
                        detail["file_path"] = file_path
                        detail["file_size_bytes"] = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                    
                    if error:
                        detail["error"] = error
                        detail["retry_count"] = detail.get("retry_count", 0)
                    
                    updated = True
                    break
            
            # Add new entry if not found (and not a pending status)
            if not updated and status != "pending_add":
                new_detail = {
                    "url": url,
                    "status": status,
                    "message": message,
                    "timestamp": time.time(),
                    "download_progress": download_progress,
                    "download_speed_mbs": download_speed,
                    "retry_count": 0
                }
                
                if file_path:
                    new_detail["file_path"] = file_path
                    new_detail["file_size_bytes"] = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                
                if error:
                    new_detail["error"] = error
                
                self.url_processing_summary["pdf_download_details"].append(new_detail)
            
            # Update aggregate statistics
            self._update_aggregate_stats()
            
            # Track performance metrics
            if download_speed and download_speed > 0:
                self.performance_metrics['download_rates'].append({
                    'timestamp': time.time(),
                    'speed_mbs': download_speed,
                    'url': url
                })
            
            # Emit Socket.IO event for real-time updates
            try:
                emit_pdf_download_progress(
                    task_id=self.task_id,
                    url=url,
                    progress=download_progress or 0,
                    status=status,
                    file_path=file_path,
                    error=error,
                    details={'download_speed_mbs': download_speed}
                )
            except Exception as e:
                logger.debug(f"Error emitting PDF download progress: {e}")

    def _update_aggregate_stats(self):
        """Update aggregate statistics from individual download details."""
        try:
            details = self.url_processing_summary["pdf_download_details"]
            
            # Count by status
            success_count = sum(1 for d in details if d["status"].startswith("success"))
            error_count = sum(1 for d in details if d["status"].startswith("error"))
            
            # Calculate total download size
            total_size = sum(d.get("file_size_bytes", 0) for d in details if d.get("file_size_bytes"))
            
            # Update summary
            self.url_processing_summary.update({
                "total_pdfs_downloaded": success_count,
                "failed_downloads": error_count,
                "total_download_size_bytes": total_size,
                "download_success_rate": (success_count / max(len(details), 1)) * 100
            })
            
            # Update quality metrics
            self.quality_metrics.update({
                'download_success_rate': self.url_processing_summary["download_success_rate"],
                'error_recovery_rate': self._calculate_error_recovery_rate()
            })
            
        except Exception as e:
            logger.debug(f"Error updating aggregate stats: {e}")

    def _calculate_error_recovery_rate(self) -> float:
        """Calculate the rate of successful error recovery."""
        try:
            details = self.url_processing_summary["pdf_download_details"]
            recovered_errors = sum(1 for d in details 
                                 if d.get("retry_count", 0) > 0 and d["status"].startswith("success"))
            total_errors = sum(1 for d in details if d.get("retry_count", 0) > 0)
            
            return (recovered_errors / max(total_errors, 1)) * 100
            
        except Exception:
            return 0.0

    def _process_url_with_tracking(self, url: str, setting: str, keyword: str, output_folder: str) -> Dict[str, Any]:
        """
        Enhanced URL processing with comprehensive tracking, retry logic, and performance monitoring.
        
        Args:
            url: URL to process
            setting: Processing type (pdf, text, etc.)
            keyword: Optional keyword for filtering
            output_folder: Folder to save results
            
        Returns:
            Dict with comprehensive processing results
        """
        if check_task_cancellation(self.task_id):
            return {"status": "cancelled", "url": url}
        
        processing_start_time = time.time()
        setting_lower = setting.lower()
        url_result: Dict[str, Any] = {
            "url": url,
            "setting": setting_lower,
            "start_time": processing_start_time
        }
        
        try:
            if setting_lower == "pdf":
                return self._process_pdf_url(url, output_folder, url_result)
            else:
                return self._process_non_pdf_url(url, setting_lower, keyword, output_folder, url_result)
                
        except Exception as e:
            logger.error(f"Error processing URL {url} (setting: {setting_lower}): {e}", exc_info=True)
            error_msg = f"Processing failed: {str(e)}"
            url_result.update({
                "status": "error",
                "error": error_msg,
                "processing_time": time.time() - processing_start_time
            })
            
            if setting_lower == "pdf":
                self._url_processing_progress_callback(url, "error_processing", error_msg, error=error_msg)
            
            return url_result

    def _process_pdf_url(self, url: str, output_folder: str, url_result: Dict[str, Any]) -> Dict[str, Any]:
        """Process PDF URL with enhanced error handling and retry logic."""
        # Signal PDF download starting
        self._url_processing_progress_callback(url, "pending_add", "Download queued")
        
        # Acquire semaphore for controlled concurrency
        with self.download_semaphore:
            if check_task_cancellation(self.task_id):
                return {"status": "cancelled", "url": url}
            
            self._url_processing_progress_callback(url, "downloading", "Starting PDF download")
            
            # Enhanced PDF download with retry logic
            pdf_file_path = self._download_pdf_with_retries(url, output_folder)
            
            if not pdf_file_path:
                return url_result  # Error already logged in retry function
            
            url_result.update({
                "pdf_file": pdf_file_path,
                "pdf_size": os.path.getsize(pdf_file_path),
                "download_time": time.time() - url_result["start_time"]
            })
            
            # Process PDF if configured
            if self.pdf_options.get("process_pdfs", True):
                processing_result = self._process_downloaded_pdf(url, pdf_file_path, output_folder)
                url_result.update(processing_result)
            else:
                url_result["status"] = "success_downloaded_only"
                self._url_processing_progress_callback(
                    url, "success_downloaded_only", 
                    "PDF downloaded (processing skipped).", 
                    file_path=pdf_file_path
                )
        
        return url_result

    def _download_pdf_with_retries(self, url: str, output_folder: str) -> Optional[str]:
        """Download PDF with intelligent retry logic and performance tracking."""
        for attempt in range(self.max_retries + 1):
            try:
                if check_task_cancellation(self.task_id):
                    return None
                
                # Progress callback for this specific download
                def progress_callback(downloaded, total, message):
                    if total > 0:
                        progress = int((downloaded / total) * 100)
                        speed = self._calculate_download_speed(downloaded, url)
                        self._url_processing_progress_callback(
                            url, "downloading", message, 
                            download_progress=progress, download_speed=speed
                        )
                
                # Attempt download
                pdf_file_path = enhanced_download_pdf(
                    url,
                    save_path=output_folder,
                    task_id=self.task_id,
                    progress_callback=progress_callback,
                    timeout=self.pdf_options.get('timeout_seconds', 300),
                    max_file_size_mb=self.pdf_options.get('max_file_size_mb', 50)
                )
                
                if pdf_file_path and os.path.exists(pdf_file_path):
                    self._url_processing_progress_callback(
                        url, "downloaded_processing", 
                        "PDF downloaded successfully.", 
                        file_path=pdf_file_path
                    )
                    return pdf_file_path
                else:
                    raise ValueError("Download completed but file not found")
                    
            except Exception as e:
                if attempt < self.max_retries:
                    backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                    self._url_processing_progress_callback(
                        url, "retry",
                        f"Retry {attempt + 1}/{self.max_retries} after error: {str(e)}. Waiting {backoff_time}s."
                    )
                    time.sleep(backoff_time)
                else:
                    self._url_processing_progress_callback(
                        url, "error_download",
                        f"Failed to download PDF after {self.max_retries + 1} attempts",
                        error=str(e)
                    )
                    logger.error(f"PDF download failed for {url} after {self.max_retries + 1} attempts: {e}")
                    return None
        
        return None

    def _calculate_download_speed(self, downloaded_bytes: int, url: str) -> float:
        """Calculate download speed for performance tracking."""
        try:
            # Find the download start time for this URL
            for detail in self.url_processing_summary["pdf_download_details"]:
                if detail["url"] == url and detail["status"] == "downloading":
                    start_time = detail.get("timestamp", time.time())
                    elapsed = time.time() - start_time
                    if elapsed > 0:
                        return (downloaded_bytes / (1024 * 1024)) / elapsed  # MB/s
            return 0.0
        except Exception:
            return 0.0

    def _process_downloaded_pdf(self, url: str, pdf_file_path: str, output_folder: str) -> Dict[str, Any]:
        """Process downloaded PDF with enhanced error handling."""
        try:
            self._url_processing_progress_callback(url, "processing", "Processing PDF with enhanced features")
            
            # Generate output path
            pdf_filename = os.path.basename(pdf_file_path)
            json_filename_base = os.path.splitext(pdf_filename)[0]
            json_output_path = get_output_filepath(
                f"{json_filename_base}_processed.json",
                user_defined_dir=output_folder
            )
            
            # Detect document type for optimal processing
            doc_type = self._detect_document_type(pdf_file_path)
            apply_ocr = self.pdf_options.get("use_ocr", True) or (doc_type == "scan")
            
            # Process with retry logic
            for attempt in range(self.max_retries + 1):
                try:
                    if check_task_cancellation(self.task_id):
                        return {"status": "cancelled"}
                    
                    processing_result = self._execute_pdf_processing(
                        pdf_file_path, json_output_path, apply_ocr, doc_type
                    )
                    
                    if processing_result:
                        self._url_processing_progress_callback(
                            url, "success_processed",
                            "PDF processed successfully with enhanced features.",
                            file_path=pdf_file_path
                        )
                        
                        return {
                            "status": "success_processed",
                            "json_file": json_output_path,
                            "document_type": doc_type,
                            "tables_extracted": processing_result.get("tables_count", 0),
                            "references_extracted": processing_result.get("references_count", 0),
                            "processing_method": "enhanced" if hasattr(structify_module, 'process_pdf') else "standard"
                        }
                    
                except Exception as e:
                    if attempt < self.max_retries:
                        backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                        self._url_processing_progress_callback(
                            url, "processing_retry",
                            f"Processing retry {attempt + 1}/{self.max_retries}. Error: {str(e)}",
                            file_path=pdf_file_path
                        )
                        time.sleep(backoff_time)
                    else:
                        self._url_processing_progress_callback(
                            url, "error_processing",
                            f"PDF processing failed: {str(e)}",
                            file_path=pdf_file_path, error=str(e)
                        )
                        return {
                            "status": "error_processing",
                            "error": f"PDF processing failed after {self.max_retries + 1} attempts: {str(e)}",
                            "pdf_file": pdf_file_path
                        }
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_file_path}: {e}")
            return {
                "status": "error_processing",
                "error": str(e),
                "pdf_file": pdf_file_path
            }

    def _detect_document_type(self, pdf_file_path: str) -> str:
        """Detect PDF document type for optimal processing."""
        try:
            if hasattr(structify_module, 'detect_document_type'):
                return structify_module.detect_document_type(pdf_file_path)
        except Exception as e:
            logger.debug(f"Document type detection failed for {pdf_file_path}: {e}")
        return "unknown"

    def _execute_pdf_processing(self, pdf_file_path: str, json_output_path: str, 
                              apply_ocr: bool, doc_type: str) -> Optional[Dict[str, Any]]:
        """Execute PDF processing with the best available method."""
        if hasattr(structify_module, 'process_pdf'):
            # Use enhanced PDF processing
            result = structify_module.process_pdf(
                pdf_path=pdf_file_path,
                output_path=json_output_path,
                max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE),
                extract_tables=self.pdf_options.get("extract_tables", True),
                use_ocr=apply_ocr,
                return_data=True
            )
            
            if result:
                return {
                    "tables_count": len(result.get("tables", [])),
                    "references_count": len(result.get("references", [])),
                    "method": "enhanced"
                }
        else:
            # Fallback to standard processing
            process_all_files(
                root_directory=os.path.dirname(pdf_file_path),
                output_file=json_output_path,
                file_filter=lambda f: f == pdf_file_path,
                max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE)
            )
            
            return {"method": "standard", "tables_count": 0, "references_count": 0}
        
        return None

    def _process_non_pdf_url(self, url: str, setting: str, keyword: str, 
                           output_folder: str, url_result: Dict[str, Any]) -> Dict[str, Any]:
        """Process non-PDF URLs with retry logic."""
        for attempt in range(self.max_retries + 1):
            try:
                if check_task_cancellation(self.task_id):
                    return {"status": "cancelled", "url": url}
                
                # Use existing process_url function with enhancements
                result = process_url(url, setting, keyword, output_folder)
                
                if "error" in result:
                    url_result.update({
                        "status": "error",
                        "error": result["error"],
                        "processing_time": time.time() - url_result["start_time"]
                    })
                else:
                    url_result.update(result)
                    url_result.update({
                        "status": "success",
                        "processing_time": time.time() - url_result["start_time"]
                    })
                
                return url_result
                
            except Exception as e:
                if attempt < self.max_retries:
                    backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                    logger.warning(f"URL processing attempt {attempt + 1} failed for {url}: {e}, retrying in {backoff_time}s...")
                    time.sleep(backoff_time)
                else:
                    logger.error(f"Error processing URL {url} (setting: {setting}): {e}")
                    url_result.update({
                        "status": "error",
                        "error": str(e),
                        "processing_time": time.time() - url_result["start_time"]
                    })
        
        return url_result

    def _structify_final_progress_callback(self, processed_count: int, total_count: int, 
                                         stage_message: str, current_file: Optional[str] = None):
        """Enhanced callback for final structify processing with performance tracking."""
        if check_task_cancellation(self.task_id):
            raise InterruptedError("Final structify processing cancelled.")
        
        # Map structify progress to overall progress (90-100% range)
        sub_progress = int((processed_count / total_count) * 10) if total_count > 0 else 0
        overall_progress = 90 + sub_progress
        
        # Enhanced message with performance context
        msg = f"Final Processing: {stage_message} ({processed_count}/{total_count})"
        if current_file:
            msg += f" - File: {os.path.basename(current_file)}"
        
        # Track final processing performance
        if not hasattr(self, '_final_processing_start'):
            self._final_processing_start = time.time()
        
        processing_time = time.time() - self._final_processing_start
        rate = processed_count / processing_time if processing_time > 0 else 0
        
        details = {
            "final_processing_stage": stage_message,
            "processing_rate_files_per_sec": round(rate, 2),
            "estimated_completion": self._estimate_final_completion_time(processed_count, total_count, rate)
        }
        
        if current_file:
            details["current_file_finalizing"] = os.path.basename(current_file)
        
        self.emit_progress_update(progress=overall_progress, message=msg, details=details)

    def _estimate_final_completion_time(self, processed: int, total: int, rate: float) -> Optional[str]:
        """Estimate completion time for final processing."""
        try:
            if rate > 0 and total > processed:
                remaining_time = (total - processed) / rate
                if remaining_time < 60:
                    return f"{remaining_time:.0f} seconds"
                else:
                    return f"{remaining_time/60:.1f} minutes"
        except Exception:
            pass
        return None

    def _process_logic(self):
        """Enhanced main processing logic with comprehensive monitoring and analytics."""
        logger.info(f"Task {self.task_id}: Starting enhanced scraping of {len(self.url_configs)} URLs. "
                   f"Output dir: {self.root_scrape_directory}")
        
        processing_start_time = time.time()
        self.message = f"Processing {len(self.url_configs)} URLs with enhanced analytics..."
        self.emit_progress_update(progress=1)
        
        try:
            # Phase 1: URL Processing (0-90% progress)
            processed_url_results = self._execute_url_processing_phase()
            
            if check_task_cancellation(self.task_id):
                logger.info(f"Task {self.task_id} URL processing phase cancelled.")
                self.status = "cancelled"
                return
            
            # Phase 2: Final Structify Processing (90-100% progress)
            self._execute_final_processing_phase(processed_url_results)
            
            if check_task_cancellation(self.task_id):
                logger.info(f"Task {self.task_id} final processing phase cancelled.")
                self.status = "cancelled"
                return
            
            # Phase 3: Enhanced Completion and Analytics
            self._complete_scraping_with_analytics(processing_start_time)
            
        except InterruptedError:
            logger.info(f"Task {self.task_id} processing cancelled via InterruptedError.")
            self.status = "cancelled"
        except Exception as e:
            logger.error(f"Error during enhanced scraping for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(f"Enhanced scraping failed: {str(e)}", stage="enhanced_scraping", 
                            details={"traceback": traceback.format_exc()})

    def _execute_url_processing_phase(self) -> List[Dict[str, Any]]:
        """Execute URL processing phase with adaptive concurrency."""
        # Determine optimal worker count based on URL types and system capacity
        pdf_count = sum(1 for cfg in self.url_configs if cfg.get("setting", "").lower() == "pdf")
        optimal_workers = min(
            self.max_concurrent_downloads,
            max(1, (os.cpu_count() or 1) // 2),
            len(self.url_configs),
            8  # Cap at 8 workers
        )
        
        logger.info(f"Starting URL processing with {optimal_workers} workers ({pdf_count} PDFs)")
        processed_url_results = []
        
        with ThreadPoolExecutor(max_workers=optimal_workers) as executor:
            # Submit all URL processing tasks
            with self.thread_lock:
                for cfg in self.url_configs:
                    if check_task_cancellation(self.task_id):
                        break
                    
                    future = executor.submit(
                        self._process_url_with_tracking,
                        cfg["url"], cfg["setting"], cfg.get("keyword", ""),
                        self.root_scrape_directory
                    )
                    self.active_futures.add(future)
            
            # Process completed futures
            for future in as_completed(list(self.active_futures)):
                if check_task_cancellation(self.task_id):
                    break
                
                try:
                    result = future.result()
                    processed_url_results.append(result)
                    
                    # Update counters
                    if result and result.get("status", "").startswith("success"):
                        self.url_processing_summary["successful_urls_count"] += 1
                    else:
                        self.url_processing_summary["failed_urls_count"] += 1
                    
                except Exception as e:
                    logger.error(f"URL processing task failed: {e}")
                    self.url_processing_summary["failed_urls_count"] += 1
                    processed_url_results.append({
                        "status": "error",
                        "error": str(e),
                        "url": "unknown_due_to_future_error"
                    })
                
                # Update progress and emit status
                with self.thread_lock:
                    self.active_futures.discard(future)
                    self.url_processing_summary["processed_urls_count"] = len(processed_url_results)
                
                # Calculate progress (0-90% for URL processing)
                progress = int((self.url_processing_summary["processed_urls_count"] / len(self.url_configs)) * 90)
                msg = f"Processed {self.url_processing_summary['processed_urls_count']}/{len(self.url_configs)} URLs."
                
                # Add performance metrics to progress update
                success_rate = (self.url_processing_summary["successful_urls_count"] / 
                              max(self.url_processing_summary["processed_urls_count"], 1)) * 100
                
                self.emit_progress_update(
                    progress=progress, 
                    message=msg,
                    details={
                        'success_rate': round(success_rate, 1),
                        'pdf_downloads': self.url_processing_summary["total_pdfs_downloaded"],
                        'processing_rate': self._calculate_current_processing_rate()
                    }
                )
        
        return processed_url_results

    def _calculate_current_processing_rate(self) -> float:
        """Calculate current processing rate for performance monitoring."""
        try:
            if hasattr(self, '_phase_start_time'):
                elapsed = time.time() - self._phase_start_time
                processed = self.url_processing_summary["processed_urls_count"]
                return processed / elapsed if elapsed > 0 else 0.0
            return 0.0
        except Exception:
            return 0.0

    def _execute_final_processing_phase(self, processed_url_results: List[Dict[str, Any]]):
        """Execute final structify processing phase."""
        # Update stats for final phase
        self.stats = {**self.scraper_run_stats.to_dict(), **self.url_processing_summary}
        self.emit_progress_update(progress=90, message="URL processing complete. Starting final structify.")
        
        if not structify_available:
            logger.warning(f"Task {self.task_id}: Structify module not available. Creating basic output.")
            self._create_basic_output(processed_url_results)
            return
        
        # Execute structify with retry logic
        try:
            self._final_processing_start = time.time()
            
            for attempt in range(self.max_retries + 1):
                try:
                    final_structify_results = process_all_files(
                        root_directory=self.root_scrape_directory,
                        output_file=self.output_file,
                        stats_obj=self.scraper_run_stats,
                        progress_callback=self._structify_final_progress_callback,
                        max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE),
                        executor_type="thread",
                        max_workers=min(DEFAULT_NUM_THREADS, 4)  # Conservative for final processing
                    )
                    
                    if final_structify_results:
                        self._finalize_processing_results(final_structify_results)
                        return
                    
                except Exception as e:
                    if attempt < self.max_retries:
                        backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                        logger.warning(f"Final structify attempt {attempt + 1} failed: {e}, retrying in {backoff_time}s...")
                        self.emit_progress_update(
                            progress=90,
                            message=f"Retrying final processing. Attempt {attempt + 1}/{self.max_retries + 1}."
                        )
                        time.sleep(backoff_time)
                    else:
                        raise
            
        except Exception as e:
            logger.error(f"Final structify processing failed for task {self.task_id}: {e}")
            self.handle_error(f"Final structify processing failed: {str(e)}", stage="final_structify",
                            details={"traceback": traceback.format_exc()})

    def _create_basic_output(self, processed_url_results: List[Dict[str, Any]]):
        """Create basic output when structify is not available."""
        try:
            basic_output = {
                "url_processing_results": processed_url_results,
                "summary_stats": self.url_processing_summary,
                "processing_metadata": {
                    "structify_available": False,
                    "processing_time": time.time() - self.url_processing_summary.get("start_time", time.time()),
                    "enhanced_features_used": list(self.optimization_settings.keys())
                }
            }
            
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(basic_output, f, indent=2, ensure_ascii=False)
            
            self.message = "URL scraping complete. Final processing skipped (Structify unavailable)."
            logger.info(f"Created basic output for scraper task {self.task_id}")
            
        except Exception as e:
            self.handle_error(f"Failed to write basic output: {str(e)}", stage="basic_output_write")

    def _finalize_processing_results(self, final_structify_results: Dict[str, Any]):
        """Finalize processing results and update statistics."""
        try:
            # Update output file path if changed
            self.output_file = final_structify_results.get("output_file", self.output_file)
            
            # Merge comprehensive stats
            self.stats = {
                "url_processing_summary": self.url_processing_summary,
                "final_processing_stats": self.scraper_run_stats.to_dict(),
                "structify_output_stats": final_structify_results.get("stats", {}),
                "performance_metrics": self.performance_metrics,
                "quality_metrics": self.quality_metrics
            }
            
            # Check for final processing errors
            if final_structify_results.get("error"):
                self.handle_error(
                    f"Final structify processing error: {final_structify_results['error']}", 
                    stage="final_structify"
                )
            else:
                self.message = "Enhanced web scraping and final processing complete."
                logger.info(f"Task {self.task_id} final processing completed successfully")
                
        except Exception as e:
            logger.error(f"Error finalizing processing results: {e}")
            self.handle_error(f"Error finalizing results: {str(e)}", stage="finalization")

    def _complete_scraping_with_analytics(self, processing_start_time: float):
        """Complete scraping task with comprehensive analytics and enhanced stats showcase."""
        try:
            # Calculate final performance metrics
            total_duration = time.time() - processing_start_time
            
            # Create comprehensive scraping statistics
            scraping_stats = {
                'urls_processed': self.url_processing_summary["processed_urls_count"],
                'urls_successful': self.url_processing_summary["successful_urls_count"],
                'urls_failed': self.url_processing_summary["failed_urls_count"],
                'pdfs_downloaded': self.url_processing_summary["total_pdfs_downloaded"],
                'total_download_size_bytes': self.url_processing_summary["total_download_size_bytes"],
                'download_success_rate': self.url_processing_summary.get("download_success_rate", 0),
                'total_processing_time': total_duration,
                'average_processing_time_per_url': total_duration / max(len(self.url_configs), 1),
                'processing_efficiency': self._calculate_scraping_efficiency(),
                'quality_metrics': self.quality_metrics,
                'performance_summary': self._generate_performance_summary()
            }
            
            # Calculate additional insights
            scraping_stats.update(self._generate_scraping_insights())
            
            try:
                # Use enhanced completion with comprehensive analytics
                emit_enhanced_task_completion(
                    task_id=self.task_id,
                    task_type="web_scraping",
                    output_file=self.output_file,
                    stats=scraping_stats,
                    performance_metrics={
                        'total_duration': total_duration,
                        'download_performance': self._analyze_download_performance(),
                        'processing_stages': self._get_processing_stages_summary(),
                        'optimization_effectiveness': self._evaluate_optimization_effectiveness()
                    }
                )
                
                # Add to task history
                add_task_to_history(self.task_id, "web_scraping", scraping_stats, self.output_file)
                
                logger.info(f"Task {self.task_id} completed with enhanced scraping analytics")
                
            except ImportError:
                # Fallback to standard completion
                logger.warning("Enhanced stats showcase not available, using standard completion")
                emit_task_completion(self.task_id, "web_scraping", self.output_file, scraping_stats)
            except Exception as e:
                logger.error(f"Error in enhanced scraping completion: {e}")
                # Fallback to standard completion
                emit_task_completion(self.task_id, "web_scraping", self.output_file, scraping_stats)
                
        except Exception as e:
            logger.error(f"Error completing scraping with analytics: {e}")
            # Ensure task is marked as completed even with analytics errors
            emit_task_completion(self.task_id, "web_scraping", self.output_file, self.stats)

    def _calculate_scraping_efficiency(self) -> Dict[str, float]:
        """Calculate comprehensive scraping efficiency metrics."""
        try:
            total_time = time.time() - self.url_processing_summary.get("start_time", time.time())
            processed_urls = self.url_processing_summary["processed_urls_count"]
            successful_urls = self.url_processing_summary["successful_urls_count"]
            
            efficiency = {
                'overall_success_rate': (successful_urls / max(processed_urls, 1)) * 100,
                'processing_speed_urls_per_minute': (processed_urls / max(total_time / 60, 0.1)),
                'download_efficiency': self.quality_metrics.get('download_success_rate', 0),
                'error_recovery_rate': self.quality_metrics.get('error_recovery_rate', 0),
                'resource_utilization': self._calculate_resource_utilization()
            }
            
            # Calculate overall efficiency score
            component_scores = [v for v in efficiency.values() if isinstance(v, (int, float))]
            efficiency['overall_efficiency_score'] = sum(component_scores) / len(component_scores) if component_scores else 0
            
            return efficiency
            
        except Exception as e:
            logger.error(f"Error calculating scraping efficiency: {e}")
            return {'overall_efficiency_score': 0, 'error': str(e)}

    def _calculate_resource_utilization(self) -> float:
        """Calculate resource utilization efficiency."""
        try:
            # Base calculation on concurrent downloads vs system capacity
            actual_concurrency = len(self.url_processing_summary["pdf_download_details"])
            max_concurrency = self.max_concurrent_downloads
            
            utilization = min((actual_concurrency / max_concurrency) * 100, 100) if max_concurrency > 0 else 0
            
            # Adjust for memory efficiency
            if self.performance_metrics.get('memory_usage_samples'):
                avg_memory = sum(self.performance_metrics['memory_usage_samples']) / len(self.performance_metrics['memory_usage_samples'])
                if avg_memory < 2048:  # Less than 2GB average
                    utilization *= 1.1  # Bonus for efficient memory usage
                elif avg_memory > 4096:  # More than 4GB average
                    utilization *= 0.9  # Penalty for high memory usage
            
            return min(utilization, 100)
            
        except Exception:
            return 50.0  # Default moderate score

    def _generate_performance_summary(self) -> Dict[str, Any]:
        """Generate comprehensive performance summary."""
        try:
            download_rates = self.performance_metrics.get('download_rates', [])
            
            summary = {
                'average_download_speed_mbs': 0,
                'peak_download_speed_mbs': 0,
                'total_bottlenecks_detected': len(self.performance_metrics.get('bottlenecks_detected', [])),
                'optimization_events_count': len(self.performance_metrics.get('optimization_events', [])),
                'concurrent_downloads_peak': self.max_concurrent_downloads
            }
            
            if download_rates:
                speeds = [rate['speed_mbs'] for rate in download_rates if rate.get('speed_mbs', 0) > 0]
                if speeds:
                    summary['average_download_speed_mbs'] = round(sum(speeds) / len(speeds), 2)
                    summary['peak_download_speed_mbs'] = round(max(speeds), 2)
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating performance summary: {e}")
            return {'error': str(e)}

    def _generate_scraping_insights(self) -> Dict[str, Any]:
        """Generate actionable insights from scraping performance."""
        insights = {
            'recommendations': [],
            'performance_highlights': [],
            'areas_for_improvement': []
        }
        
        try:
            # Success rate insights
            success_rate = self.url_processing_summary.get("download_success_rate", 0)
            if success_rate >= 95:
                insights['performance_highlights'].append("Excellent download success rate achieved")
            elif success_rate >= 80:
                insights['performance_highlights'].append("Good download success rate maintained")
            else:
                insights['areas_for_improvement'].append("Download success rate needs improvement")
                insights['recommendations'].append("Review failed URLs and consider retry strategies")
            
            # Performance insights
            avg_speed = self._generate_performance_summary().get('average_download_speed_mbs', 0)
            if avg_speed > 10:
                insights['performance_highlights'].append(f"High download speeds achieved: {avg_speed:.1f} MB/s")
            elif avg_speed > 5:
                insights['performance_highlights'].append(f"Good download performance: {avg_speed:.1f} MB/s")
            else:
                insights['areas_for_improvement'].append("Download speeds could be optimized")
                insights['recommendations'].append("Consider increasing concurrent downloads or checking network conditions")
            
            # Resource utilization insights
            resource_util = self._calculate_resource_utilization()
            if resource_util > 80:
                insights['performance_highlights'].append("Excellent resource utilization")
            elif resource_util < 50:
                insights['areas_for_improvement'].append("Underutilized system resources")
                insights['recommendations'].append("Consider increasing concurrency for better performance")
            
            return insights
            
        except Exception as e:
            logger.error(f"Error generating scraping insights: {e}")
            return {'error': str(e)}

    def _analyze_download_performance(self) -> Dict[str, Any]:
        """Analyze download performance patterns."""
        try:
            download_details = self.url_processing_summary["pdf_download_details"]
            
            analysis = {
                'successful_downloads': len([d for d in download_details if d["status"].startswith("success")]),
                'failed_downloads': len([d for d in download_details if d["status"].startswith("error")]),
                'average_retry_count': 0,
                'most_common_errors': {},
                'processing_time_distribution': {}
            }
            
            # Analyze retry patterns
            retry_counts = [d.get("retry_count", 0) for d in download_details]
            if retry_counts:
                analysis['average_retry_count'] = sum(retry_counts) / len(retry_counts)
            
            # Analyze error patterns
            error_types = {}
            for detail in download_details:
                if detail["status"].startswith("error") and detail.get("error"):
                    error_key = detail["error"][:50]  # First 50 chars for grouping
                    error_types[error_key] = error_types.get(error_key, 0) + 1
            
            analysis['most_common_errors'] = dict(sorted(error_types.items(), key=lambda x: x[1], reverse=True)[:3])
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing download performance: {e}")
            return {'error': str(e)}

    def _get_processing_stages_summary(self) -> List[Dict[str, Any]]:
        """Get summary of processing stages with timing."""
        return [
            {
                'stage': 'URL Processing',
                'duration': self.url_processing_summary.get("total_processing_time", 0),
                'urls_processed': self.url_processing_summary["processed_urls_count"]
            },
            {
                'stage': 'Final Structify',
                'duration': getattr(self, '_final_processing_duration', 0),
                'files_processed': getattr(self.scraper_run_stats, 'processed_files', 0)
            }
        ]

    def _evaluate_optimization_effectiveness(self) -> Dict[str, Any]:
        """Evaluate effectiveness of applied optimizations."""
        return {
            'adaptive_concurrency_used': self.optimization_settings.get('adaptive_concurrency', False),
            'retry_strategies_applied': len(self.performance_metrics.get('optimization_events', [])),
            'memory_optimizations': self.optimization_settings.get('memory_optimization', False),
            'overall_optimization_score': self._calculate_scraping_efficiency().get('overall_efficiency_score', 0)
        }

    # Override emit_progress_update to include enhanced PDF download tracking
    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None,
                           stats_override: Optional[Union[CustomFileStats, Dict]] = None,
                           details: Optional[Dict] = None):
        """Enhanced progress update emission with comprehensive PDF download tracking."""
        current_details = details or {}
        
        with self.thread_lock:
            # Create comprehensive PDF downloads summary
            pdf_details = self.url_processing_summary["pdf_download_details"]
            pdf_summary = {
                "total_attempted": len(pdf_details),
                "downloading": sum(1 for d in pdf_details if d["status"] == "downloading"),
                "processing": sum(1 for d in pdf_details if d["status"] in ["downloaded_processing", "processing"]),
                "succeeded": sum(1 for d in pdf_details if d["status"].startswith("success")),
                "failed": sum(1 for d in pdf_details if d["status"].startswith("error")),
                "total_size_mb": round(self.url_processing_summary["total_download_size_bytes"] / (1024*1024), 2),
                "success_rate": round(self.url_processing_summary.get("download_success_rate", 0), 1)
            }
            
            current_details["pdf_downloads_summary"] = pdf_summary
            
            # Include sample of recent/active downloads (limit for performance)
            active_or_recent = sorted(
                [d for d in pdf_details if d["status"] != "success_processed" or 
                 (time.time() - d.get("timestamp", 0) < 120)],  # Last 2 minutes
                key=lambda x: x.get("timestamp", 0),
                reverse=True
            )[:8]  # Limit to 8 most relevant
            
            current_details["active_pdf_downloads_sample"] = active_or_recent
            
            # Add performance metrics
            current_details["performance_metrics"] = {
                "processing_rate": self._calculate_current_processing_rate(),
                "average_download_speed": self._generate_performance_summary().get('average_download_speed_mbs', 0),
                "resource_utilization": round(self._calculate_resource_utilization(), 1)
            }
        
        # Update main stats for REST API access
        if isinstance(self.stats, dict):
            self.stats.update(self.url_processing_summary)
            self.stats["pdf_downloads_summary"] = pdf_summary
            self.stats["enhanced_metrics"] = current_details["performance_metrics"]
        
        # Call parent class method with enhanced details
        super().emit_progress_update(progress, message, stats_override, current_details)

    def cancel(self) -> bool:
        """Enhanced cancellation with comprehensive cleanup."""
        with self.thread_lock:
            if check_task_cancellation(self.task_id) or self.status in ["completed", "failed", "cancelled"]:
                return False
            
            # Mark as cancelled and cleanup futures
            mark_task_cancelled(self.task_id, "Task cancelled by user")
            
            # Cancel all active futures
            cancelled_count = 0
            for fut in list(self.active_futures):
                if fut.cancel():
                    cancelled_count += 1
            
            self.active_futures.clear()
            logger.info(f"Cancelled {cancelled_count} active futures for task {self.task_id}")
        
        # Call parent cancellation
        return super().cancel()

    def get_status(self) -> Dict[str, Any]:
        """Enhanced status information with comprehensive scraping metrics."""
        # Get base status from parent
        status_info = super().get_status()
        
        # Add scraping-specific enhancements
        with self.thread_lock:
            pdf_details = self.url_processing_summary["pdf_download_details"]
            
            # Create comprehensive PDF summary
            pdf_summary = {
                "total_attempted": len(pdf_details),
                "downloading": sum(1 for d in pdf_details if d["status"] == "downloading"),
                "processing": sum(1 for d in pdf_details if d["status"] in ["downloaded_processing", "processing"]),
                "succeeded": sum(1 for d in pdf_details if d["status"].startswith("success")),
                "failed": sum(1 for d in pdf_details if d["status"].startswith("error")),
                "total_size_mb": round(self.url_processing_summary["total_download_size_bytes"] / (1024*1024), 2)
            }
            
            # Get recent downloads for detailed view
            recent_downloads = sorted(pdf_details, key=lambda x: x.get("timestamp", 0), reverse=True)[:10]
        
        # Enhanced status with scraping-specific data
        status_info.update({
            "url_configs_count": len(self.url_configs),
            "pdf_downloads_summary": pdf_summary,
            "recent_pdf_downloads": recent_downloads,
            "urls_processed": self.url_processing_summary["processed_urls_count"],
            "urls_successful": self.url_processing_summary["successful_urls_count"],
            "urls_failed": self.url_processing_summary["failed_urls_count"],
            "processing_efficiency": self._calculate_scraping_efficiency(),
            "performance_metrics": {
                "average_download_speed_mbs": self._generate_performance_summary().get('average_download_speed_mbs', 0),
                "resource_utilization_percent": round(self._calculate_resource_utilization(), 1),
                "concurrent_downloads_active": sum(1 for d in pdf_details if d["status"] == "downloading")
            }
        })
        
        return status_info      
    

# ----------------------------------------------------------------------------
# Global Task Management Variables
# ----------------------------------------------------------------------------
# Active tasks dictionary and lock for thread safety
active_tasks = {}
tasks_lock = threading.Lock()

# Task management functions
def add_task(task_id: str, task: BaseTask) -> None:
    """Add a task to the active tasks dictionary"""
    with tasks_lock:
        active_tasks[task_id] = task
        logger.info(f"Added task {task_id} to active tasks")

def get_task(task_id: str) -> Optional[BaseTask]:
    """Get a task from the active tasks dictionary"""
    with tasks_lock:
        return active_tasks.get(task_id)

def remove_task(task_id: str) -> bool:
    """Remove a task from the active tasks dictionary"""
    with tasks_lock:
        if task_id in active_tasks:
            del active_tasks[task_id]
            logger.info(f"Removed task {task_id} from active tasks")
            return True
        return False

# ----------------------------------------------------------------------------
# Authentication Decorator
# ----------------------------------------------------------------------------
def require_api_key(f):
    """Decorator to require API key for a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import request, jsonify
        
        # Get the API key manager from current app
        from flask import current_app
        if hasattr(current_app, 'api_key_manager'):
            key_manager = current_app.api_key_manager
        else:
            # If no key manager, allow access (development mode)
            return f(*args, **kwargs)
        
        api_key = request.headers.get('X-API-Key')
        
        # Check if API key is provided
        if not api_key:
            return jsonify({"error": {"code": "MISSING_API_KEY", "message": "API key is required"}}), 401
        
        # Validate using key manager
        if not key_manager.validate_key(api_key):
            return jsonify({"error": {"code": "INVALID_API_KEY", "message": "Invalid API key"}}), 401
            
        # Store the key info in the request context
        request.api_key_info = key_manager.get_key_info(api_key)
        
        return f(*args, **kwargs)
    return decorated_function