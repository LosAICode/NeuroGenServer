"""
Core Utility Functions
General-purpose utilities used across the application
"""

import os
import re
import logging
import time
from typing import List, Tuple, Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Optional magic library for MIME detection
magic_available = False
try:
    import magic
    magic_available = True
    logger.info("python-magic available for MIME detection")
except ImportError:
    logger.warning("python-magic not available. Try installing python-magic-bin on Windows")
    magic_available = False


def setup_logging(log_level=logging.INFO, log_file=None):
    """
    Set up logging configuration for the application.
    
    Args:
        log_level: Logging level (default: INFO)
        log_file: Optional log file path
        
    Returns:
        Configured logger instance
    """
    # Create logger if it doesn't exist
    logger = logging.getLogger("file_processor")
    logger.setLevel(log_level)
    
    # Remove existing handlers to prevent duplicate logs
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


def sanitize_filename(filename: str) -> str:
    """
    Thoroughly sanitize a filename by removing unsafe characters and limiting its length.
    
    Args:
        filename: The filename to sanitize
        
    Returns:
        A sanitized filename safe for all operating systems
    """
    # Replace unsafe characters with underscores
    safe_name = re.sub(r'[^\w\-. ]', '_', filename)
    
    # Remove leading/trailing periods and spaces
    safe_name = safe_name.strip('. ')
    
    # Limit length to 100 characters
    safe_name = safe_name[:100]
    
    # If the sanitization resulted in an empty string, use a default
    if not safe_name:
        safe_name = "untitled"
    
    return safe_name


def normalize_path(path: str) -> str:
    """
    Normalize a path by resolving symlinks, user paths, environment variables.
    
    Args:
        path: The path to normalize
        
    Returns:
        A normalized absolute path
    """
    try:
        # Expand user directory (e.g., ~)
        path = os.path.expanduser(path)
        
        # Expand environment variables (e.g., $HOME)
        path = os.path.expandvars(path)
        
        # Resolve relative paths 
        path = os.path.abspath(path)
        
        # Normalize path separators for the OS
        path = os.path.normpath(path)
        
        return path
    except Exception as e:
        logger.error(f"Error normalizing path {path}: {e}")
        return path


def safe_split(text_value: Any, delimiter: str = ',') -> List[str]:
    """
    Safely split a text value with proper validation.
    
    Args:
        text_value: The text to split
        delimiter: The delimiter to split on
        
    Returns:
        List of split values or empty list if text_value is None/invalid
    """
    if text_value is None:
        return []
    
    if not isinstance(text_value, str):
        try:
            text_value = str(text_value)
        except:
            return []
    
    return text_value.split(delimiter)


def ensure_temp_directory() -> str:
    """
    Ensure the temp directory exists and has proper permissions.
    Call this before any operation that requires the temp directory.
    
    Returns:
        Path to the temp directory
    """
    # Get base directory (modules folder)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    custom_temp_dir = os.path.join(base_dir, 'temp')
    
    # Ensure the directory exists
    os.makedirs(custom_temp_dir, exist_ok=True)
    
    # Try to set full permissions
    try:
        import stat
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    except Exception:
        pass
    
    # Set environment variables
    os.environ['TEMP'] = custom_temp_dir
    os.environ['TMP'] = custom_temp_dir
    
    return custom_temp_dir


def get_output_filepath(filename: str, user_defined_dir: Optional[str] = None) -> str:
    """
    Resolves user-specified output directory or uses default fallback.
    
    Args:
        filename: Output filename
        user_defined_dir: Optional user-defined directory
        
    Returns:
        Full path to the output file
    """
    from blueprints.core.services import DEFAULT_OUTPUT_FOLDER
    
    directory = user_defined_dir or DEFAULT_OUTPUT_FOLDER
    return resolve_output_path(directory, filename)


def resolve_output_path(directory: str, filename: str) -> str:
    """
    Resolve output path with proper directory creation if needed.
    
    Args:
        directory: The directory to save the file in
        filename: Output filename
        
    Returns:
        Full path to the resolved output file
    """
    # Normalize the directory path
    directory = normalize_path(directory)
    
    # Create directory if it doesn't exist
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        logger.info(f"Created output directory: {directory}")
    
    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    
    return os.path.join(directory, safe_filename)


def detect_common_path_from_files(files: List[str]) -> Tuple[str, bool]:
    """
    Detect the common parent directory from a list of files.
    
    Args:
        files: List of file paths
        
    Returns:
        Tuple of (common_path, success_bool)
    """
    if not files:
        return "", False
    
    try:
        # Normalize all paths
        normalized_paths = [normalize_path(p) for p in files]
        
        # Find common path
        common_path = os.path.commonpath(normalized_paths)
        
        # Verify common path exists
        if os.path.isdir(common_path):
            return common_path, True
        
        # Try parent directory
        parent = os.path.dirname(common_path)
        if os.path.isdir(parent):
            return parent, True
        
        return common_path, False
        
    except ValueError:
        # This happens when paths have different drives (Windows) or root directories
        logger.warning("Could not find common path - paths on different drives or roots")
        return "", False
    except Exception as e:
        logger.error(f"Error detecting common path: {e}")
        return "", False


def format_time_duration(seconds: float) -> str:
    """
    Format seconds into a human-readable duration string.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Human-readable duration string
    """
    if seconds < 60:
        return f"{int(seconds)} seconds"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours} hour{'s' if hours != 1 else ''} {minutes} minute{'s' if minutes != 1 else ''}"



def structured_error_response(code: str, message: str, status_code: int = 400) -> dict:
    """
    Create a structured error response for API endpoints.
    
    Args:
        code: Error code for machine processing
        message: Human-readable error message
        status_code: HTTP status code
        
    Returns:
        Dictionary with error details
    """
    from flask import jsonify
    
    response = jsonify({
        "error": {
            "code": code,
            "message": message
        },
        "status": "error"
    })
    response.status_code = status_code
    return response


def cleanup_temp_files():
    """Clean up any remaining temporary files in the OCR temp directory."""
    import glob
    
    # Get temp directory
    temp_dir = ensure_temp_directory()
    
    # Get all temp files older than 30 minutes
    current_time = time.time()
    for file_path in glob.glob(os.path.join(temp_dir, "ocr_temp_*")):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 1800:  # 30 minutes
                try:
                    os.remove(file_path)
                    logger.debug(f"Removed temp file {file_path}")
                except PermissionError:
                    # On Windows, files may be locked temporarily
                    logger.debug(f"Could not remove temp file {file_path} - may be in use")
                except OSError as e:
                    logger.debug(f"OS error removing temp file {file_path}: {e}")
        except Exception as e:
            logger.debug(f"Error cleaning up temp file {file_path}: {e}")


def start_periodic_cleanup():
    """Start periodic cleanup of temporary files."""
    import threading
    import time
    
    def cleanup_worker():
        while True:
            try:
                cleanup_temp_files()
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
            time.sleep(3600)  # Run every hour
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()


# Export public interface
__all__ = [
    'setup_logging',
    'sanitize_filename',
    'normalize_path',
    'safe_split',
    'ensure_temp_directory',
    'get_output_filepath',
    'resolve_output_path',
    'detect_common_path_from_files',
    'format_time_duration',
    'structured_error_response',
    'cleanup_temp_files',
    'start_periodic_cleanup'
]