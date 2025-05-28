"""
Playlist Downloader Blueprint
Handles YouTube playlist downloading functionality
"""

from flask import Blueprint, request, jsonify
from flask_socketio import emit
import logging
import uuid
import time
import os

# Import necessary modules and functions
from blueprints.core.services import (
    get_task, add_task, remove_task, active_tasks, tasks_lock,
    ProcessingTask, PlaylistTask
)
from blueprints.core.utils import (
    sanitize_filename, ensure_temp_directory, get_output_filepath,
    structured_error_response, normalize_path
)

# Get YouTube API key from environment
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY', '')

logger = logging.getLogger(__name__)

# Create the blueprint
playlist_downloader_bp = Blueprint('playlist_downloader', __name__, url_prefix='/api')

@playlist_downloader_bp.route('/start-playlists', methods=['POST'])
def start_playlists():
    """
    Enhanced handler for starting playlist downloads with improved validation,
    error handling, and path resolution.
    
    The route delegates output path resolution to the PlaylistTask class
    for consistency and cleaner separation of concerns.
    
    Returns:
        JSON response with task details or error information
    """
    # Check if YouTube API key is configured
    if not YOUTUBE_API_KEY:
        logger.error("YouTube API key not configured")
        return structured_error_response(
            "API_KEY_MISSING", 
            "YouTube API key is not configured. Please set YOUTUBE_API_KEY in your .env file.",
            500
        )
    
    # Get and validate request JSON
    try:
        data = request.get_json()
        if not data:
            return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    except Exception as e:
        logger.error(f"Invalid JSON in request: {str(e)}")
        return structured_error_response("INVALID_JSON", f"Invalid JSON format: {str(e)}", 400)
    
    # Extract and validate required parameters
    raw_playlists = data.get("playlists")
    root_directory = data.get("root_directory")
    output_file = data.get("output_file")
    
    # Validate playlist URLs
    if not raw_playlists or not isinstance(raw_playlists, list):
        return structured_error_response("PLAYLISTS_REQUIRED", "A list of playlist URLs is required.", 400)
    
    # Validate each playlist URL format
    invalid_urls = [url for url in raw_playlists if not url or 'list=' not in url]
    if invalid_urls:
        return structured_error_response(
            "INVALID_PLAYLIST_URLS", 
            f"Found {len(invalid_urls)} invalid playlist URLs. Each URL must contain 'list=' parameter.",
            400,
            details={"invalid_urls": invalid_urls[:5]}  # Show up to 5 invalid URLs
        )
    
    # Validate root directory
    if not root_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Root directory is required.", 400)
    
    # Validate output file
    if not output_file:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output file is required.", 400)
    
    # Normalize root directory path
    try:
        root_directory = normalize_path(root_directory)
    except Exception as e:
        logger.error(f"Failed to normalize root directory path: {str(e)}")
        return structured_error_response(
            "INVALID_ROOT_DIR", 
            f"Invalid root directory path: {str(e)}", 
            400
        )
    
    # Create playlist configurations with sanitized folder names
    try:
        playlists = []
        for idx, url in enumerate(raw_playlists):
            # Create a folder name based on playlist index and extract playlist ID if possible
            playlist_id = None
            if 'list=' in url:
                try:
                    playlist_id = url.split('list=')[1].split('&')[0]
                    playlist_folder = f"playlist_{idx+1}_{playlist_id}"
                except:
                    playlist_folder = f"playlist_{idx+1}"
            else:
                playlist_folder = f"playlist_{idx+1}"
            
            # Sanitize the folder name and create full path
            sanitized_folder = secure_filename(playlist_folder)
            full_folder_path = os.path.join(root_directory, sanitized_folder)
            
            playlists.append({
                "url": url,
                "folder": full_folder_path,
                "playlist_id": playlist_id  # Store playlist ID for reference
            })
            
        logger.debug(f"Created {len(playlists)} playlist configurations")
    except Exception as e:
        logger.error(f"Failed to create playlist configurations: {str(e)}")
        return structured_error_response(
            "CONFIG_ERROR", 
            f"Failed to create playlist configurations: {str(e)}", 
            500
        )
    
    # Create task ID and instantiate playlist task
    task_id = str(uuid.uuid4())
    
    try:
        # Create task and register it in task manager
        playlist_task = PlaylistTask(task_id)
        add_task(task_id, playlist_task)
        logger.info(f"Created playlist task with ID: {task_id}")
        
        # Try to create root directory (PlaylistTask will handle playlist folders)
        try:
            os.makedirs(root_directory, exist_ok=True)
            logger.debug(f"Ensured root directory exists: {root_directory}")
        except Exception as dir_err:
            logger.error(f"Failed to create root directory: {str(dir_err)}")
            remove_task(task_id)  # Clean up task on failure
            return structured_error_response(
                "ROOT_DIR_CREATION_ERROR", 
                f"Failed to create root directory: {str(dir_err)}", 
                500
            )
        
        # Start the playlist task with the original output file parameter
        # The task will handle path resolution for consistency
        start_result = playlist_task.start(playlists, root_directory, output_file)
        
        # If task start returns an error status, clean up and return the error
        if start_result.get("status") == "failed":
            logger.error(f"Task start failed: {start_result.get('error')}")
            remove_task(task_id)
            return structured_error_response(
                "TASK_START_ERROR", 
                start_result.get("error", "Unknown task start error"), 
                500
            )
        
        # Include task info in response for client use
        response_data = {
            "task_id": task_id,
            "status": "processing",
            "message": "Playlist processing started",
            "playlists_count": len(playlists),
            "root_directory": root_directory,
            "output_file": start_result.get("output_file", "")
        }
        
        # Emit task creation event via Socket.IO for real-time updates
        try:
            # Use enhanced Socket.IO function if available
            if 'emit_task_started' in globals():
                emit_task_started(
                    task_id=task_id,
                    task_type="playlist_download",
                    message=f"Starting download of {len(playlists)} playlists",
                    details={"playlists_count": len(playlists)}
                )
            # Fallback to direct socketio emission
            else:
                socketio.emit('task_started', {
                    'task_id': task_id,
                    'task_type': "playlist_download",
                    'status': 'processing',
                    'message': f"Starting download of {len(playlists)} playlists",
                    'timestamp': time.time()
                })
        except Exception as socketio_err:
            # Log but don't fail if Socket.IO emission fails
            logger.error(f"Failed to emit task_started event: {str(socketio_err)}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Failed to start playlist task: {str(e)}", exc_info=True)
        # Ensure task is removed from task manager on failure
        remove_task(task_id)
        return structured_error_response(
            "TASK_CREATION_ERROR", 
            f"Failed to create and start playlist task: {str(e)}", 
            500
        )

def structured_error_response(error_code, error_message, status_code=400, details=None):
    """
    Create a structured error response with consistent format.
    
    Args:
        error_code: String code for machine-readable error identification
        error_message: Human-readable error description
        status_code: HTTP status code to return
        details: Optional dict with additional error context
        
    Returns:
        Flask response with JSON error data
    """
    error_data = {
        "error": {
            "code": error_code,
            "message": error_message,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        },
        "status": "error"
    }
    
    # Add details if provided
    if details:
        error_data["error"]["details"] = details
    
    return jsonify(error_data), status_code
    
def format_output_path(root_directory, output_file):
    """
    Properly format the output path by ensuring we don't create paths with multiple drive letters.
    
    Args:
        root_directory (str): Root directory for the playlist download
        output_file (str): The target output filename (with or without path)
        
    Returns:
        str: A correctly formatted absolute path
    """
    # If output_file already has a drive letter, use it as is
    if re.match(r'^[A-Za-z]:', output_file):
        return output_file
        
    # Otherwise join with root directory
    return os.path.join(root_directory, os.path.basename(output_file))


# Socket.IO events for playlist downloader
def emit_download_progress(task_id, progress, current_video=None, downloaded=0, total=0):
    """Emit download progress update"""
    try:
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': 'downloading',
            'current_video': current_video,
            'downloaded': downloaded,
            'total': total,
            'timestamp': time.time()
        }
        
        emit('download_progress', payload, broadcast=True)
        logger.debug(f"Emitted download progress for task {task_id}: {progress}%")
        
    except Exception as e:
        logger.error(f"Error emitting download progress: {str(e)}")


def emit_download_completed(task_id, downloaded_files=None, stats=None):
    """Emit download completion event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'completed',
            'downloaded_files': downloaded_files or [],
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        emit('download_completed', payload, broadcast=True)
        logger.info(f"Emitted download completion for task {task_id}")
        
    except Exception as e:
        logger.error(f"Error emitting download completion: {str(e)}")


def emit_download_error(task_id, error_message, current_video=None):
    """Emit download error event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'error',
            'error': error_message,
            'current_video': current_video,
            'timestamp': time.time()
        }
        
        emit('download_error', payload, broadcast=True)
        logger.error(f"Emitted download error for task {task_id}: {error_message}")
        
    except Exception as e:
        logger.error(f"Error emitting download error: {str(e)}")