# file_path_utility.py

import os
import re
import logging
import platform
import tempfile
from pathlib import Path
from typing import Tuple, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Default output location when user selection is unavailable
DEFAULT_OUTPUT_FOLDER = os.environ.get(
    "DEFAULT_OUTPUT_FOLDER", 
    os.path.join(os.path.expanduser("~"), "Documents", "NeuroGen")
)

class FilePathUtility:
    """
    Utility class for handling output file paths consistently across all NeuroGen modules.
    This ensures all components (PDF processor, Web Scraper, Playlist Downloader) 
    use the same path handling logic.
    """
    
    @staticmethod
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
    
    @staticmethod
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
    
    @classmethod
    def get_output_filepath(cls, output_filename: str, folder_override: Optional[str] = None) -> str:
        """
        Ensure output file is saved to the correct directory with proper error handling.
        
        Args:
            output_filename: The desired output filename (with or without extension)
            folder_override: Override the default output folder. Defaults to None.
        
        Returns:
            Absolute path to the properly named output file
        """
        # Handle potential None input
        if not output_filename:
            output_filename = "output"
        
        # Strip .json extension if provided
        if output_filename.lower().endswith('.json'):
            output_filename = output_filename[:-5]
        
        # Sanitize the filename
        sanitized_name = cls.sanitize_filename(output_filename) + ".json"
        
        # Check if we have a full path in output_filename
        if os.path.dirname(output_filename):
            # User provided a path with the filename
            target_folder = os.path.dirname(output_filename)
            sanitized_name = cls.sanitize_filename(os.path.basename(output_filename)) + ".json"
        else:
            # Use override folder or default to the DEFAULT_OUTPUT_FOLDER
            target_folder = folder_override or DEFAULT_OUTPUT_FOLDER
        
        # Make sure target_folder is defined and is an absolute path
        if not target_folder or not isinstance(target_folder, str):
            logger.warning(f"Invalid target folder: {target_folder}, falling back to DEFAULT_OUTPUT_FOLDER")
            target_folder = DEFAULT_OUTPUT_FOLDER
        
        # Convert to absolute path
        target_folder = cls.normalize_path(target_folder)
        
        # If target folder doesn't exist, try to create it
        try:
            if not os.path.isdir(target_folder):
                os.makedirs(target_folder, exist_ok=True)
                logger.info(f"Created output directory: {target_folder}")
        except Exception as e:
            logger.warning(f"Could not create directory {target_folder}: {e}")
            # Fall back to DEFAULT_OUTPUT_FOLDER if we can't create the directory
            target_folder = DEFAULT_OUTPUT_FOLDER
            # Try to ensure this directory exists
            try:
                os.makedirs(target_folder, exist_ok=True)
            except Exception as e2:
                logger.error(f"Cannot create fallback directory {target_folder}: {e2}")
                # Last resort - use temp directory
                target_folder = tempfile.gettempdir()
        
        # Construct and ensure the final path
        final_output_path = os.path.join(target_folder, sanitized_name)
        
        logger.info(f"Output file will be saved at: {final_output_path}")
        return final_output_path
    
    @classmethod
    def verify_and_create_directory(cls, path: str) -> Tuple[bool, str, str]:
        """
        Verify if a directory exists, and create it if needed.
        
        Args:
            path: The directory path to verify/create
            
        Returns:
            Tuple of (success, message, path)
        """
        try:
            path = cls.normalize_path(path)
            
            # Check if directory exists
            if os.path.isdir(path):
                return True, "Directory exists", path
                
            # Get parent directory
            parent = os.path.dirname(path)
            
            # If parent doesn't exist, fail
            if not os.path.exists(parent):
                return False, "No valid parent directory found", ""
                
            # Try to create the directory
            try:
                os.makedirs(path, exist_ok=True)
                logger.info(f"Created directory: {path}")
                return True, "Directory created successfully", path
            except Exception as e:
                logger.error(f"Failed to create directory {path}: {e}")
                return False, f"Failed to create directory: {e}", parent
                
        except Exception as e:
            logger.error(f"Error verifying directory {path}: {e}")
            return False, f"Error verifying directory: {e}", ""
    
    @classmethod
    def check_file_exists(cls, file_path: str) -> bool:
        """
        Check if a file exists.
        
        Args:
            file_path: The file path to check
            
        Returns:
            True if file exists
        """
        try:
            file_path = cls.normalize_path(file_path)
            return os.path.isfile(file_path)
        except Exception as e:
            logger.error(f"Error checking if file exists {file_path}: {e}")
            return False
    
    @classmethod
    def detect_common_path_from_files(cls, files: list) -> Tuple[str, bool]:
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
            normalized_paths = [cls.normalize_path(p) for p in files]
            
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