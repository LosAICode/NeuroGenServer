"""
File Processor Blueprint
Handles all file processing related routes and functionality
"""

from flask import Blueprint, request, jsonify, send_file
from flask_socketio import emit
import os
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Create the blueprint
file_processor_bp = Blueprint('file_processor', __name__, url_prefix='/api')

@file_processor_bp.route('/process', methods=['POST'])
def start_processing():
    """
    API endpoint to start processing files in the specified directory.
    Handles JSON or form data input, validates parameters, and creates a processing task.
    
    Expected parameters:
    - input_dir: Directory containing files to process
    - output_file: Optional output filename or full path 
    - output_dir: Optional output directory (ignored if output_file has directory part)
    
    Returns:
        JSON response with task details and status
    """
    try:
        # Get the JSON data from the request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        
        # Extract variables from the request
        input_dir = data.get("input_dir")
        output_file = data.get("output_file")
        output_dir = data.get("output_dir")
        
        # Log the received parameters
        logger.info(f"Processing request: input_dir={input_dir}, output_file={output_file}, output_dir={output_dir}")
        
        # Validate required parameters
        if not input_dir:
            return jsonify({"error": "input_dir is required"}), 400
            
        if not output_file:
            return jsonify({"error": "output_file is required"}), 400
        
        # Validate input directory exists
        if not os.path.exists(input_dir):
            return jsonify({"error": f"Input directory does not exist: {input_dir}"}), 400
        
        # Generate task ID
        import uuid
        task_id = str(uuid.uuid4())
        
        # For now, return a mock response until we integrate with the actual processing
        # TODO: Integrate with actual file processing logic
        response = {
            "task_id": task_id,
            "status": "started",
            "input_dir": input_dir,
            "output_file": output_file,
            "message": "File processing task created successfully"
        }
        
        logger.info(f"Created processing task {task_id}")
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error in start_processing: {str(e)}")
        return jsonify({"error": str(e)}), 500


@file_processor_bp.route('/status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Get the status of a processing task"""
    try:
        # TODO: Implement actual task status checking
        # For now, return a mock status
        response = {
            "task_id": task_id,
            "status": "processing",
            "progress": 50,
            "message": "Processing files...",
            "files_processed": 5,
            "total_files": 10
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error getting task status for {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@file_processor_bp.route('/download/<task_id>', methods=['GET'])
def download_result(task_id):
    """Download the processed result file"""
    try:
        # TODO: Implement actual file download
        # For now, return an error
        return jsonify({"error": "Download not implemented yet"}), 501
        
    except Exception as e:
        logger.error(f"Error downloading result for {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@file_processor_bp.route('/open/<task_id>', methods=['GET'])
def open_result(task_id):
    """Open the processed result file in the default application"""
    try:
        # TODO: Implement file opening
        return jsonify({"error": "Open file not implemented yet"}), 501
        
    except Exception as e:
        logger.error(f"Error opening result for {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@file_processor_bp.route('/detect-path', methods=['POST'])
def detect_path():
    """Detect and validate file paths"""
    try:
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        
        path = data.get('path') if data else None
        
        if not path:
            return jsonify({"error": "path is required"}), 400
        
        result = {
            "path": path,
            "exists": os.path.exists(path),
            "is_file": os.path.isfile(path) if os.path.exists(path) else False,
            "is_directory": os.path.isdir(path) if os.path.exists(path) else False
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error in detect_path: {str(e)}")
        return jsonify({"error": str(e)}), 500


@file_processor_bp.route('/verify-path', methods=['POST'])
def verify_path():
    """Verify if a path is valid and accessible"""
    try:
        data = request.get_json()
        path = data.get('path')
        
        if not path:
            return jsonify({"error": "path is required"}), 400
        
        result = {
            "path": path,
            "valid": os.path.exists(path),
            "readable": os.access(path, os.R_OK) if os.path.exists(path) else False,
            "writable": os.access(path, os.W_OK) if os.path.exists(path) else False
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error in verify_path: {str(e)}")
        return jsonify({"error": str(e)}), 500


# Socket.IO events for real-time updates
def emit_progress_update(task_id, progress, status="processing", message=None, stats=None):
    """Emit progress update to connected clients"""
    try:
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': status,
            'message': message or f"Progress: {progress}%",
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        emit('progress_update', payload, broadcast=True)
        logger.debug(f"Emitted progress update for task {task_id}: {progress}%")
        
    except Exception as e:
        logger.error(f"Error emitting progress update: {str(e)}")


def emit_task_completed(task_id, result_path=None, stats=None):
    """Emit task completion event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'completed',
            'result_path': result_path,
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        emit('task_completed', payload, broadcast=True)
        logger.info(f"Emitted task completion for task {task_id}")
        
    except Exception as e:
        logger.error(f"Error emitting task completion: {str(e)}")


def emit_task_error(task_id, error_message, error_details=None):
    """Emit task error event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'error',
            'error': error_message,
            'details': error_details,
            'timestamp': time.time()
        }
        
        emit('task_error', payload, broadcast=True)
        logger.error(f"Emitted task error for task {task_id}: {error_message}")
        
    except Exception as e:
        logger.error(f"Error emitting task error: {str(e)}")