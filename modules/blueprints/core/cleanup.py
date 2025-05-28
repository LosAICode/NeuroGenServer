"""
Cleanup Utilities Module
Handles temporary file cleanup and periodic maintenance tasks
"""

import os
import glob
import time
import threading
import logging
from typing import Optional, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Global cleanup thread reference
_cleanup_thread: Optional[threading.Thread] = None
_cleanup_running = False


def cleanup_temp_files(temp_dir: Optional[str] = None, max_age_minutes: int = 30) -> int:
    """
    Clean up temporary files older than specified age.
    
    Args:
        temp_dir: Directory to clean (defaults to project temp dir)
        max_age_minutes: Maximum age of files in minutes before deletion
        
    Returns:
        Number of files cleaned up
    """
    if temp_dir is None:
        # Get default temp directory
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        temp_dir = os.path.join(base_dir, 'temp')
    
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir, exist_ok=True)
        return 0
    
    cleaned_count = 0
    current_time = time.time()
    max_age_seconds = max_age_minutes * 60
    
    # Patterns to clean
    patterns = [
        "ocr_temp_*",
        "tmp*",
        "*.tmp",
        "processing_*"
    ]
    
    for pattern in patterns:
        for file_path in glob.glob(os.path.join(temp_dir, pattern)):
            try:
                # Skip if it's a directory
                if os.path.isdir(file_path):
                    continue
                
                # Check file age
                file_age = current_time - os.path.getmtime(file_path)
                
                if file_age > max_age_seconds:
                    try:
                        os.remove(file_path)
                        logger.debug(f"Removed temp file: {file_path}")
                        cleaned_count += 1
                    except PermissionError:
                        # File may be locked on Windows
                        logger.debug(f"Could not remove temp file {file_path} - may be in use")
                    except OSError as e:
                        logger.debug(f"OS error removing temp file {file_path}: {e}")
                        
            except Exception as e:
                logger.debug(f"Error checking temp file {file_path}: {e}")
    
    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} temporary files")
    
    return cleaned_count


def cleanup_old_directories(base_dir: Optional[str] = None, max_age_days: int = 7) -> int:
    """
    Clean up old temporary directories.
    
    Args:
        base_dir: Base directory to clean
        max_age_days: Maximum age in days before deletion
        
    Returns:
        Number of directories cleaned up
    """
    if base_dir is None:
        base_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'temp'
        )
    
    if not os.path.exists(base_dir):
        return 0
    
    cleaned_count = 0
    current_time = time.time()
    max_age_seconds = max_age_days * 24 * 60 * 60
    
    # Look for temporary directories
    for item in os.listdir(base_dir):
        item_path = os.path.join(base_dir, item)
        
        if not os.path.isdir(item_path):
            continue
        
        # Skip if directory name doesn't look temporary
        if not any(item.startswith(prefix) for prefix in ['tmp', 'temp_', 'processing_']):
            continue
        
        try:
            # Check directory age
            dir_age = current_time - os.path.getmtime(item_path)
            
            if dir_age > max_age_seconds:
                # Try to remove directory and contents
                import shutil
                shutil.rmtree(item_path, ignore_errors=True)
                logger.info(f"Removed old temporary directory: {item_path}")
                cleaned_count += 1
                
        except Exception as e:
            logger.debug(f"Error cleaning directory {item_path}: {e}")
    
    return cleaned_count


def start_periodic_cleanup(interval_minutes: int = 60, max_file_age_minutes: int = 30) -> threading.Thread:
    """
    Start periodic cleanup of temporary files.
    
    Args:
        interval_minutes: How often to run cleanup (in minutes)
        max_file_age_minutes: Maximum age of files before deletion
        
    Returns:
        The cleanup thread that was started
    """
    global _cleanup_thread, _cleanup_running
    
    # Don't start multiple cleanup threads
    if _cleanup_running and _cleanup_thread and _cleanup_thread.is_alive():
        logger.warning("Cleanup thread already running")
        return _cleanup_thread
    
    _cleanup_running = True
    
    def cleanup_worker():
        """Worker function for cleanup thread"""
        logger.info(f"Starting periodic cleanup service (interval: {interval_minutes} minutes)")
        
        while _cleanup_running:
            try:
                # Run cleanup
                files_cleaned = cleanup_temp_files(max_age_minutes=max_file_age_minutes)
                
                # Also clean old directories weekly
                if datetime.now().weekday() == 0:  # Monday
                    dirs_cleaned = cleanup_old_directories()
                    if dirs_cleaned > 0:
                        logger.info(f"Weekly cleanup: removed {dirs_cleaned} old directories")
                
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
            
            # Sleep for the interval (check every minute if we should stop)
            for _ in range(interval_minutes):
                if not _cleanup_running:
                    break
                time.sleep(60)
        
        logger.info("Periodic cleanup service stopped")
    
    # Create and start the cleanup thread
    _cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True, name="CleanupWorker")
    _cleanup_thread.start()
    
    return _cleanup_thread


def stop_periodic_cleanup():
    """Stop the periodic cleanup thread if it's running."""
    global _cleanup_running, _cleanup_thread
    
    _cleanup_running = False
    
    if _cleanup_thread and _cleanup_thread.is_alive():
        logger.info("Stopping periodic cleanup service...")
        _cleanup_thread.join(timeout=5)
        if _cleanup_thread.is_alive():
            logger.warning("Cleanup thread did not stop gracefully")
    
    _cleanup_thread = None


def cleanup_task_artifacts(task_id: str, cleanup_dir: Optional[str] = None):
    """
    Clean up artifacts related to a specific task.
    
    Args:
        task_id: The task ID to clean up after
        cleanup_dir: Directory to clean (defaults to temp)
    """
    if cleanup_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        cleanup_dir = os.path.join(base_dir, 'temp')
    
    # Patterns that might contain task ID
    patterns = [
        f"*{task_id}*",
        f"task_{task_id}_*",
        f"processing_{task_id}_*"
    ]
    
    cleaned_count = 0
    
    for pattern in patterns:
        for file_path in glob.glob(os.path.join(cleanup_dir, pattern)):
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    cleaned_count += 1
                elif os.path.isdir(file_path):
                    import shutil
                    shutil.rmtree(file_path, ignore_errors=True)
                    cleaned_count += 1
            except Exception as e:
                logger.debug(f"Error cleaning task artifact {file_path}: {e}")
    
    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} artifacts for task {task_id}")


# Start cleanup service on module import (can be disabled if needed)
# Uncomment the following line to auto-start cleanup on import
# start_periodic_cleanup()


# Export public interface
__all__ = [
    'cleanup_temp_files',
    'cleanup_old_directories',
    'start_periodic_cleanup',
    'stop_periodic_cleanup',
    'cleanup_task_artifacts'
]