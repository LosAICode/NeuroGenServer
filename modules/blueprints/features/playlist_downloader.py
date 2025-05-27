"""
Playlist Downloader Blueprint
Handles YouTube playlist downloading functionality
"""

from flask import Blueprint, request, jsonify
from flask_socketio import emit
import logging
import uuid
import time

logger = logging.getLogger(__name__)

# Create the blueprint
playlist_downloader_bp = Blueprint('playlist_downloader', __name__, url_prefix='/api')

@playlist_downloader_bp.route('/start-playlists', methods=['POST'])
def start_playlist_download():
    """
    Start downloading a YouTube playlist
    
    Expected parameters:
    - playlist_url: YouTube playlist URL
    - quality: Video quality preference (optional)
    - format: Download format (mp4, mp3, etc.)
    - output_dir: Output directory (optional)
    
    Returns:
        JSON response with task details
    """
    try:
        data = request.get_json()
        
        # Extract parameters
        playlist_url = data.get('playlist_url')
        quality = data.get('quality', 'best')
        format_type = data.get('format', 'mp4')
        output_dir = data.get('output_dir', './downloads')
        
        # Validate required parameters
        if not playlist_url:
            return jsonify({"error": "playlist_url is required"}), 400
        
        # Basic URL validation for YouTube
        if 'youtube.com' not in playlist_url and 'youtu.be' not in playlist_url:
            return jsonify({"error": "Invalid YouTube URL"}), 400
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # TODO: Integrate with actual playlist downloading logic
        response = {
            "task_id": task_id,
            "status": "started",
            "playlist_url": playlist_url,
            "quality": quality,
            "format": format_type,
            "output_dir": output_dir,
            "message": "Playlist download task created successfully"
        }
        
        logger.info(f"Created playlist download task {task_id} for URL: {playlist_url}")
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error in start_playlist_download: {str(e)}")
        return jsonify({"error": str(e)}), 500


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