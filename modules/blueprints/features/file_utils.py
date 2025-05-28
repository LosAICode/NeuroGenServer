"""
File Utils Blueprint
Handles file system operations, path detection, and utility functions
"""

from flask import Blueprint, request, jsonify, send_from_directory
import logging
import os
import subprocess
import platform
from typing import List, Tuple
from werkzeug.utils import secure_filename

# Import necessary modules and functions
from blueprints.core.services import require_api_key
from blueprints.core.utils import (
    sanitize_filename, ensure_temp_directory, get_output_filepath,
    structured_error_response, normalize_path, detect_common_path_from_files
)

logger = logging.getLogger(__name__)

# Create the blueprint
file_utils_bp = Blueprint('file_utils', __name__, url_prefix='/api')

# Export the blueprint
__all__ = ['file_utils_bp']

@file_utils_bp.route('/upload-for-path-detection', methods=['POST'])
def upload_for_path_detection():
    if "files" not in request.files:
        return structured_error_response("NO_FILES_IN_REQUEST", "No files part in request.", 400)
    folder_name = request.form.get("folderName")
    if not folder_name:
        return structured_error_response("FOLDER_NAME_REQUIRED", "Folder name is required.", 400)
    logger.info(f"Processing uploads for folder: {folder_name}")
    safe_folder = secure_filename(folder_name)
    upload_dir = os.path.join(app.config["UPLOAD_FOLDER"], safe_folder)
    os.makedirs(upload_dir, exist_ok=True)
    files = request.files.getlist("files")
    for f in files:
        if f.filename:
            if not is_extension_allowed(f.filename):
                return structured_error_response("UNSUPPORTED_EXTENSION", f"File extension not allowed: {f.filename}", 400)
            if not is_mime_allowed(f):
                return structured_error_response("UNSUPPORTED_MIME_TYPE", f"Detected MIME not allowed for: {f.filename}", 400)
            filename = secure_filename(f.filename)
            file_path = os.path.join(upload_dir, filename)
            f.save(file_path)
            logger.debug(f"Saved uploaded file to {file_path}")
    return jsonify({
        "success": True,
        "message": "Files uploaded successfully",
        "fullPath": safe_folder
    })

# Note: detect-path, verify-path, and create-directory routes are already in file_processor.py

@file_utils_bp.route('/get-output-filepath', methods=['POST'])
def api_get_output_filepath():
    """
    API endpoint to get a properly formatted output filepath.
    """
    data = request.get_json()
    filename = data.get('filename', '')
    directory = data.get('directory', '')
    
    # Use the get_output_filepath function for consistent handling
    try:
        # Make sure the filename has a .json extension
        if not filename.lower().endswith('.json'):
            filename += '.json'
            
        # If a directory is provided, use it as the base
        if directory:
            full_path = os.path.join(os.path.abspath(directory), filename)
        else:
            # Otherwise, use the default output folder
            full_path = os.path.join(DEFAULT_OUTPUT_FOLDER, filename)
            
        # Ensure the parent directory exists
        parent_dir = os.path.dirname(full_path)
        if not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
            
        return jsonify({
            "fullPath": full_path,
            "directory": os.path.dirname(full_path),
            "filename": os.path.basename(full_path)
        })
    except Exception as e:
        logger.error(f"Error generating output filepath: {e}")
        return structured_error_response("PATH_ERROR", f"Error generating output path: {str(e)}", 500)

@file_utils_bp.route('/check-file-exists', methods=['POST'])
def api_check_file_exists():
    """
    API endpoint to check if a file exists.
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({
            "status": "error",
            "message": "Path is required"
        }), 400
    
    path_str = data.get("path")
    if not path_str:
        return jsonify({
            "status": "error", 
            "message": "Empty path provided"
        }), 400
    
    try:
        # Normalize path
        norm_path = os.path.abspath(os.path.expanduser(path_str))
        
        # Check if file exists
        exists = os.path.isfile(norm_path)
        
        # Get additional info if it exists
        if exists:
            try:
                file_size = os.path.getsize(norm_path)
                modified_time = os.path.getmtime(norm_path)
                return jsonify({
                    "exists": True,
                    "path": norm_path,
                    "size": file_size,
                    "size_formatted": format_file_size(file_size),
                    "modified": modified_time,
                    "modified_formatted": format_timestamp(modified_time)
                })
            except Exception as detail_err:
                logger.warning(f"Error getting file details: {detail_err}")
                return jsonify({
                    "exists": True,
                    "path": norm_path
                })
        else:
            return jsonify({
                "exists": False,
                "path": norm_path
            })
    except Exception as e:
        logger.error(f"Error checking if file exists: {e}")
        return structured_error_response("CHECK_ERROR", f"Error checking file: {str(e)}", 500)

def format_file_size(size_bytes):
    """Format file size to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


def format_timestamp(timestamp):
    """Format timestamp to human-readable string."""
    try:
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return "Unknown"

@file_utils_bp.route('/get-default-output-folder', methods=['GET'])
@require_api_key
def get_default_output_folder():
    """
    Get the default output folder path.
    """
    try:
        return jsonify({
            "path": DEFAULT_OUTPUT_FOLDER,
            "exists": os.path.isdir(DEFAULT_OUTPUT_FOLDER),
            "writable": os.access(DEFAULT_OUTPUT_FOLDER, os.W_OK)
        })
    except Exception as e:
        logger.error(f"Error getting default output folder: {e}")
        return structured_error_response("SERVER_ERROR", f"Could not retrieve default output folder: {str(e)}", 500)

# Note: open-file route is already in file_processor.py
@file_utils_bp.route("/api/open-file", methods=["POST"])
@require_api_key
def open_arbitrary_file():
    """Open any file by path (for recent tasks history)."""
    data = request.json or {}
    file_path = data.get("path")
    
    if not file_path:
        return structured_error_response("PATH_REQUIRED", "File path is required.", 400)
    
    if not os.path.exists(file_path):
        return structured_error_response("FILE_NOT_FOUND", "File not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(file_path)
        else:
            try:
                subprocess.run(["xdg-open", file_path], check=False)
            except Exception:
                subprocess.run(["open", file_path], check=False)
                
        return jsonify({"success": True, "message": "File opened locally."})
    except Exception as e:
        logger.exception(f"Error opening file {file_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open file: {e}", 400)
@file_utils_bp.route('/open-folder', methods=['POST'])
@require_api_key
def open_folder():
    """Open a folder in the operating system's file explorer."""
    data = request.json or {}
    folder_path = data.get("path")
    
    if not folder_path:
        return structured_error_response("PATH_REQUIRED", "Folder path is required.", 400)
    
    if not os.path.exists(folder_path):
        return structured_error_response("FOLDER_NOT_FOUND", "Folder not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(folder_path)
        else:
            try:
                subprocess.run(["xdg-open", folder_path], check=False)
            except Exception:
                subprocess.run(["open", folder_path], check=False)
                
        return jsonify({"success": True, "message": "Folder opened locally."})
    except Exception as e:
        logger.exception(f"Error opening folder {folder_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open folder: {e}", 400)

def find_directory_in_standard_locations(folder_name: str) -> str:
    """
    Look for a folder name in standard locations.
    
    Args:
        folder_name: The name of the folder to find
        
    Returns:
        Full path if found, empty string otherwise
    """
    # Define standard locations based on OS
    if platform.system() == 'Windows':
        # Windows standard locations
        standard_locs = [
            os.getcwd(),
            os.path.join(os.path.expanduser('~'), 'Documents'),
            os.path.join(os.path.expanduser('~'), 'Desktop'),
            os.path.join(os.path.expanduser('~'), 'Downloads'),
            os.path.join(os.path.expanduser('~'), 'OneDrive', 'Documents')
        ]
    else:
        # Unix/Mac standard locations
        standard_locs = [
            os.getcwd(),
            os.path.join(os.path.expanduser('~'), 'Documents'),
            os.path.join(os.path.expanduser('~'), 'Desktop'),
            os.path.join(os.path.expanduser('~'), 'Downloads')
        ]
    
    # Look for folder in standard locations
    for base in standard_locs:
        try:
            potential = os.path.join(base, folder_name)
            if os.path.isdir(potential):
                logger.info(f"Found directory under {base}: {potential}")
                return potential
        except Exception as e:
            logger.debug(f"Error checking {base}: {e}")
    
    return ""

def get_parent_directory(path: str) -> str:
    """
    Get the nearest existing parent directory.
    
    Args:
        path: The path to check
        
    Returns:
        The closest existing parent directory or empty string
    """
    try:
        path = normalize_path(path)
        parent = path
        
        # Find the nearest existing parent
        while parent and not os.path.isdir(parent):
            parent = os.path.dirname(parent)
            
            # Break if we've reached the root
            if parent == os.path.dirname(parent):
                return ""
        
        return parent if parent and parent != path else ""
    except Exception as e:
        logger.error(f"Error finding parent directory: {e}")
        return ""

def verify_and_create_directory(path: str) -> Tuple[bool, str, str]:
    """
    Verify if a directory exists, and create it if requested.
    
    Args:
        path: The directory path to verify/create
        
    Returns:
        Tuple of (success, message, path)
    """
    try:
        path = normalize_path(path)
        
        # Check if directory exists
        if os.path.isdir(path):
            return True, "Directory exists", path
            
        # Get parent directory
        parent = get_parent_directory(path)
        
        # If parent doesn't exist, fail
        if not parent:
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

def check_file_exists(file_path: str) -> bool:
    """
    Check if a file exists.
    
    Args:
        file_path: The file path to check
        
    Returns:
        True if file exists
    """
    try:
        file_path = normalize_path(file_path)
        return os.path.isfile(file_path)
    except Exception as e:
        logger.error(f"Error checking if file exists {file_path}: {e}")
        return False

def is_extension_allowed(filename: str) -> bool:
    """Check if file extension is allowed."""
    ALLOWED_EXTENSIONS = {"txt", "pdf", "png", "jpg", "jpeg", "gif", "py", "js", "html", "css", "md", "doc", "docx", "xls", "xlsx"}
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    return ext in ALLOWED_EXTENSIONS

def is_mime_allowed(file_stream) -> bool:
    """Check if MIME type is allowed (if 'magic' is installed)."""
    if not magic_available:
        return True
    ALLOWED_MIME_TYPES = {
        "text/plain", "text/html", "application/pdf",
        "image/png", "image/jpeg", "text/css",
        "application/javascript", "application/json",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
    chunk = file_stream.read(1024)
    file_stream.seek(0)
    mime_type = magic.from_buffer(chunk, mime=True)
    return mime_type in ALLOWED_MIME_TYPES