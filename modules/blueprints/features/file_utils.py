"""
File Utils Blueprint
Handles file system operations, path detection, and utility functions
"""

from flask import Blueprint, request, jsonify, send_from_directory
import logging
import os
import subprocess
import platform
from werkzeug.utils import secure_filename

# Import necessary modules and functions
from blueprints.core.services import require_api_key
from blueprints.core.utils import (
    sanitize_filename, ensure_temp_directory, get_output_filepath,
    structured_error_response, normalize_path
)

logger = logging.getLogger(__name__)

# Create the blueprint
file_utils_bp = Blueprint('file_utils', __name__, url_prefix='/api')

@file_utils_bp.route('/upload-for-path-detection', methods=['POST'])
def upload_for_path_detection():
    """
    Upload a file for path detection analysis
    """
    try:
        if 'file' not in request.files:
            return structured_error_response("NO_FILE", "No file provided", 400)
        
        file = request.files['file']
        if file.filename == '':
            return structured_error_response("NO_FILENAME", "No file selected", 400)
        
        # Secure the filename
        filename = secure_filename(file.filename)
        
        # Create temporary directory for uploaded file
        temp_dir = ensure_temp_directory()
        file_path = os.path.join(temp_dir, filename)
        
        # Save the uploaded file
        file.save(file_path)
        
        return jsonify({
            "status": "success",
            "message": "File uploaded successfully",
            "file_path": file_path,
            "filename": filename
        })
        
    except Exception as e:
        logger.error(f"Error uploading file for path detection: {e}")
        return structured_error_response("UPLOAD_ERROR", f"Failed to upload file: {str(e)}", 500)

# Note: detect-path, verify-path, and create-directory routes are already in file_processor.py

@file_utils_bp.route('/get-output-filepath', methods=['POST'])
def get_output_filepath_endpoint():
    """
    Generate an appropriate output file path based on input parameters
    """
    try:
        data = request.get_json()
        if not data:
            return structured_error_response("NO_DATA", "No JSON data provided", 400)
        
        # Get parameters
        root_dir = data.get('root_directory')
        filename = data.get('filename')
        extension = data.get('extension', '.json')
        
        if not root_dir:
            return structured_error_response("ROOT_DIR_REQUIRED", "Root directory is required", 400)
        
        if not filename:
            return structured_error_response("FILENAME_REQUIRED", "Filename is required", 400)
        
        # Generate output file path
        output_path = get_output_filepath(root_dir, filename, extension)
        
        return jsonify({
            "status": "success",
            "output_path": output_path,
            "directory": os.path.dirname(output_path),
            "filename": os.path.basename(output_path)
        })
        
    except Exception as e:
        logger.error(f"Error generating output filepath: {e}")
        return structured_error_response("FILEPATH_ERROR", f"Failed to generate output filepath: {str(e)}", 500)

@file_utils_bp.route('/check-file-exists', methods=['POST'])
def check_file_exists():
    """
    Check if a file exists at the specified path
    """
    try:
        data = request.get_json()
        if not data:
            return structured_error_response("NO_DATA", "No JSON data provided", 400)
        
        file_path = data.get('file_path')
        if not file_path:
            return structured_error_response("PATH_REQUIRED", "File path is required", 400)
        
        # Normalize the path
        normalized_path = normalize_path(file_path)
        
        # Check file existence and properties
        exists = os.path.exists(normalized_path)
        is_file = os.path.isfile(normalized_path) if exists else False
        
        result = {
            "status": "success",
            "file_path": normalized_path,
            "exists": exists,
            "is_file": is_file
        }
        
        if exists and is_file:
            try:
                result["size"] = os.path.getsize(normalized_path)
                result["modified_time"] = os.path.getmtime(normalized_path)
            except Exception as e:
                logger.warning(f"Could not get file stats: {e}")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error checking file existence: {e}")
        return structured_error_response("FILE_CHECK_ERROR", f"Failed to check file existence: {str(e)}", 500)

@file_utils_bp.route('/get-default-output-folder', methods=['GET'])
def get_default_output_folder():
    """
    Get the default output folder for the application
    """
    try:
        # Default output folder logic
        default_folder = os.path.join(os.path.expanduser("~"), "Documents", "NeuroGenServer")
        
        # Ensure the directory exists
        os.makedirs(default_folder, exist_ok=True)
        
        return jsonify({
            "status": "success",
            "default_folder": default_folder,
            "exists": os.path.exists(default_folder)
        })
        
    except Exception as e:
        logger.error(f"Error getting default output folder: {e}")
        return structured_error_response("DEFAULT_FOLDER_ERROR", f"Failed to get default output folder: {str(e)}", 500)

# Note: open-file route is already in file_processor.py

@file_utils_bp.route('/open-folder', methods=['POST'])
@require_api_key
def open_folder():
    """
    Open a folder in the default file manager
    """
    try:
        data = request.get_json()
        if not data:
            return structured_error_response("NO_DATA", "No JSON data provided", 400)
        
        folder_path = data.get('folder_path')
        if not folder_path:
            return structured_error_response("PATH_REQUIRED", "Folder path is required", 400)
        
        # Normalize and verify path
        normalized_path = normalize_path(folder_path)
        
        if not os.path.exists(normalized_path):
            return structured_error_response("FOLDER_NOT_FOUND", f"Folder not found: {normalized_path}", 404)
        
        if not os.path.isdir(normalized_path):
            return structured_error_response("NOT_A_FOLDER", f"Path is not a directory: {normalized_path}", 400)
        
        # Open folder with system file manager
        if platform.system() == "Windows":
            subprocess.call(["explorer", normalized_path])
        elif platform.system() == "Darwin":  # macOS
            subprocess.call(["open", normalized_path])
        else:  # Linux
            subprocess.call(["xdg-open", normalized_path])
        
        return jsonify({
            "status": "success",
            "message": "Folder opened successfully",
            "folder_path": normalized_path
        })
        
    except Exception as e:
        logger.error(f"Error opening folder: {e}")
        return structured_error_response("FOLDER_OPEN_ERROR", f"Failed to open folder: {str(e)}", 500)