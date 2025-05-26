# safe_ocr_handler.py
# Add this file to your NeuroGen Server modules directory

import os
import sys
import time
import logging
import shutil
import threading
import uuid
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Define the main temp directory
BASE_TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')

# In setup_ocr_environment function, modify the tessdata directory handling

def setup_ocr_environment():
    """Setup OCR environment with proper temp directories and permissions"""
    # Ensure base temp directory exists
    os.makedirs(BASE_TEMP_DIR, exist_ok=True)
    
    # Create tessdata directory
    tessdata_dir = os.path.join(BASE_TEMP_DIR, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    # Set environment variables - IMPORTANT FIX: Use absolute path and ensure no trailing slash
    os.environ['TEMP'] = BASE_TEMP_DIR
    os.environ['TMP'] = BASE_TEMP_DIR
    # Fix the TESSDATA_PREFIX path by ensuring it's an absolute path with no trailing slash
    os.environ['TESSDATA_PREFIX'] = os.path.abspath(tessdata_dir)
    
    logger.info(f"Set TESSDATA_PREFIX to: {os.environ['TESSDATA_PREFIX']}")
    
    # Verify tessdata file exists and has correct path
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    if not os.path.exists(eng_traineddata):
        logger.warning(f"eng.traineddata not found at {eng_traineddata}")
        # Try to copy from Tesseract installation
        alt_locations = [
            r"C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata",
            r"C:\Program Files (x86)\Tesseract-OCR\tessdata\eng.traineddata"
        ]
        for alt_path in alt_locations:
            if os.path.exists(alt_path):
                try:
                    import shutil
                    shutil.copy2(alt_path, eng_traineddata)
                    logger.info(f"Copied eng.traineddata from {alt_path} to {eng_traineddata}")
                    break
                except Exception as e:
                    logger.warning(f"Failed to copy eng.traineddata: {e}")
    
    # Explicitly check if the file exists after all attempts
    if os.path.exists(eng_traineddata):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata}")
    else:
        logger.warning(f"eng.traineddata still not found at {eng_traineddata} after all attempts")
    
    # Return the setup configuration
    return {
        "base_temp_dir": BASE_TEMP_DIR,
        "tessdata_dir": tessdata_dir,
        "env_vars": {
            "TEMP": os.environ.get('TEMP'),
            "TMP": os.environ.get('TMP'),
            "TESSDATA_PREFIX": os.environ.get('TESSDATA_PREFIX')
        }
    }
    
def create_job_temp_dir():
    """Create a job-specific temporary directory for OCR processing"""
    job_id = uuid.uuid4().hex
    job_temp_dir = os.path.join(BASE_TEMP_DIR, f"job_{job_id}")
    os.makedirs(job_temp_dir, exist_ok=True)
    
    # Set job-specific environment variables
    original_env = {
        "TEMP": os.environ.get('TEMP'),
        "TMP": os.environ.get('TMP')
    }
    
    os.environ['TEMP'] = job_temp_dir
    os.environ['TMP'] = job_temp_dir
    
    return job_temp_dir, original_env

def safely_remove_file(file_path, max_retries=5, retry_delay=0.5):
    """
    Safely remove a file with retry logic and better error handling.
    
    Args:
        file_path: Path to the file to remove
        max_retries: Maximum number of removal attempts
        retry_delay: Delay between retries in seconds
        
    Returns:
        bool: True if file was removed successfully, False otherwise
    """
    if not file_path or not os.path.exists(file_path):
        return True  # Nothing to do
        
    for attempt in range(max_retries):
        try:
            os.remove(file_path)
            logger.debug(f"Successfully removed temp file: {file_path}")
            return True
        except PermissionError:
            # File might be locked or in use
            logger.debug(f"Permission error removing {file_path}, waiting {retry_delay}s (attempt {attempt+1}/{max_retries})")
            time.sleep(retry_delay * (attempt + 1))
        except Exception as e:
            logger.debug(f"Error removing {file_path}: {e}")
            time.sleep(retry_delay)
            
    # If all retries failed, schedule delayed removal
    try:
        # Create a separate thread for delayed removal
        def delayed_remove(path, delay=10):
            time.sleep(delay)
            try:
                if os.path.exists(path):
                    os.remove(path)
                    logger.debug(f"Successfully removed file with delayed removal: {path}")
            except Exception as e:
                logger.debug(f"Failed to remove file in delayed removal: {path}, {e}")
                
        thread = threading.Thread(target=delayed_remove, args=(file_path,), daemon=True)
        thread.start()
        logger.debug(f"Scheduled delayed removal for {file_path}")
    except Exception as e:
        logger.debug(f"Failed to schedule delayed removal for {file_path}: {e}")
        
    return False

def cleanup_temp_directory(directory, max_age_minutes=30):
    """
    Clean up temporary files in a directory that are older than specified age.
    
    Args:
        directory: Directory to clean up
        max_age_minutes: Maximum age in minutes for files to keep
    """
    if not os.path.exists(directory):
        return
        
    try:
        # Get all files in the directory
        current_time = time.time()
        max_age_seconds = max_age_minutes * 60
        
        for item in os.listdir(directory):
            item_path = os.path.join(directory, item)
            
            # Skip directories named "tessdata"
            if os.path.isdir(item_path) and item == "tessdata":
                continue
                
            try:
                # Check if item is a file and its age
                if os.path.isfile(item_path):
                    file_age = current_time - os.path.getmtime(item_path)
                    if file_age > max_age_seconds:
                        safely_remove_file(item_path)
                
                # Check if item is a job directory
                elif os.path.isdir(item_path) and item.startswith("job_"):
                    dir_age = current_time - os.path.getmtime(item_path)
                    if dir_age > max_age_seconds:
                        try:
                            shutil.rmtree(item_path, ignore_errors=True)
                            logger.debug(f"Removed old job directory: {item_path}")
                        except Exception as e:
                            logger.debug(f"Failed to remove job directory {item_path}: {e}")
            except Exception as e:
                logger.debug(f"Error processing temp item {item_path}: {e}")
    except Exception as e:
        logger.warning(f"Error cleaning up temp directory {directory}: {e}")

def patch_pytesseract():
    """
    Patch pytesseract to handle temp files better and use our directories.
    
    Returns:
        bool: True if patched successfully, False otherwise
    """
    try:
        import pytesseract
        
        # Set tesseract command path explicitly
        tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
            logger.info(f"Set Tesseract command path to: {tesseract_path}")
        else:
            logger.warning(f"Tesseract executable not found at: {tesseract_path}")
        
        # Store original run_tesseract function
        original_run_tesseract = pytesseract.pytesseract.run_tesseract
        original_cleanup = pytesseract.pytesseract.cleanup
        
        # Custom run_tesseract function that uses our temp directory
        def patched_run_tesseract(input_filename, output_filename_base, *args, **kwargs):
            # Use our temp directory
            old_temp = os.environ.get('TEMP')
            old_tmp = os.environ.get('TMP')
            
            try:
                # Use our temp directory
                os.environ['TEMP'] = BASE_TEMP_DIR
                os.environ['TMP'] = BASE_TEMP_DIR
                
                # Make sure tessdata path is set correctly
                tessdata_dir = os.path.join(BASE_TEMP_DIR, "tessdata")
                os.environ['TESSDATA_PREFIX'] = tessdata_dir
                
                # Call original function
                return original_run_tesseract(input_filename, output_filename_base, *args, **kwargs)
            finally:
                # Restore environment
                if old_temp:
                    os.environ['TEMP'] = old_temp
                if old_tmp:
                    os.environ['TMP'] = old_tmp
        
        # Custom cleanup function that handles errors
        def patched_cleanup(temp_name):
            try:
                original_cleanup(temp_name)
            except Exception as e:
                logger.debug(f"Ignored pytesseract cleanup error: {e}")
        
        # Apply patches
        pytesseract.pytesseract.run_tesseract = patched_run_tesseract
        pytesseract.pytesseract.cleanup = patched_cleanup
        pytesseract.pytesseract.TMP_FOLDER = BASE_TEMP_DIR
        
        logger.info("Successfully patched pytesseract for better temp file handling")
        return True
    except ImportError:
        logger.warning("pytesseract not available, patching skipped")
        return False
    except Exception as e:
        logger.warning(f"Failed to patch pytesseract: {e}")
        return False

def start_cleanup_service(interval_minutes=60):
    """
    Start a background thread to periodically clean up temporary files.
    
    Args:
        interval_minutes: Interval between cleanups in minutes
    """
    def cleanup_worker():
        while True:
            try:
                cleanup_temp_directory(BASE_TEMP_DIR)
                logger.debug(f"Performed periodic cleanup of {BASE_TEMP_DIR}")
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
            
            # Sleep until next cleanup
            time.sleep(interval_minutes * 60)
    
    thread = threading.Thread(target=cleanup_worker, daemon=True)
    thread.start()
    logger.info(f"Started periodic cleanup service for {BASE_TEMP_DIR}")

# On module import, perform initial setup
setup_ocr_environment()
patch_pytesseract()
start_cleanup_service()