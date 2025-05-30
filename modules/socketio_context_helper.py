"""
SocketIO Context Helper
Provides SocketIO emit functions that work properly with Flask application context
"""

import logging
from typing import Dict, Any, Optional
from flask import current_app

logger = logging.getLogger(__name__)

# Store the Flask app instance for use in background threads
_app_instance = None
_socketio_instance = None

def set_app_context(app, socketio):
    """Set the Flask app and SocketIO instances for use in background threads"""
    global _app_instance, _socketio_instance
    _app_instance = app
    _socketio_instance = socketio
    logger.info("SocketIO context helper initialized")

def emit_with_context(event: str, data: Dict[str, Any], broadcast: bool = True):
    """Emit SocketIO event with proper Flask application context"""
    global _app_instance, _socketio_instance
    
    if not _socketio_instance or not _app_instance:
        logger.warning(f"Cannot emit {event}: SocketIO context not initialized")
        return False
    
    try:
        # Use Flask application context
        with _app_instance.app_context():
            _socketio_instance.emit(event, data, broadcast=broadcast)
            return True
    except Exception as e:
        logger.error(f"Error emitting {event}: {e}")
        return False

def emit_task_started_safe(task_id: str, task_type: str, message: Optional[str] = None, stats: Optional[Dict] = None):
    """Safely emit task started event"""
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'status': 'processing',
        'message': message or f"{task_type.replace('_', ' ').title()} started",
        'timestamp': __import__('time').time()
    }
    
    if stats:
        payload['stats'] = stats
    
    success = emit_with_context('task_started', payload)
    if success:
        logger.info(f"Emitted task_started for {task_id}")
    return success

def emit_progress_update_safe(task_id: str, progress: int, message: Optional[str] = None, 
                            details: Optional[Dict] = None, stats: Optional[Dict] = None):
    """Safely emit progress update event"""
    payload = {
        'task_id': task_id,
        'progress': min(max(0, progress), 100),
        'status': 'processing',
        'message': message or f"Progress: {progress}%",
        'timestamp': __import__('time').time()
    }
    
    if details:
        payload['details'] = details
    if stats:
        payload['stats'] = stats
    
    success = emit_with_context('progress_update', payload)
    if success:
        logger.debug(f"Emitted progress_update for {task_id}: {progress}%")
    return success

def emit_task_completion_safe(task_id: str, task_type: str = "generic", output_file: Optional[str] = None, 
                            stats: Optional[Dict] = None, details: Optional[Dict] = None):
    """Safely emit task completion event"""
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'status': 'completed',
        'progress': 100,
        'message': f"{task_type.replace('_', ' ').title()} completed successfully",
        'timestamp': __import__('time').time()
    }
    
    if output_file:
        payload['output_file'] = output_file
    if stats:
        payload['stats'] = stats
    if details:
        payload['details'] = details
    
    success = emit_with_context('task_completed', payload)
    if success:
        logger.info(f"Emitted task_completed for {task_id}")
    return success

def emit_task_error_safe(task_id: str, error_message: str, error_details: Optional[Dict] = None):
    """Safely emit task error event"""
    payload = {
        'task_id': task_id,
        'status': 'failed',
        'error': error_message,
        'timestamp': __import__('time').time()
    }
    
    if error_details:
        payload['error_details'] = error_details
    
    success = emit_with_context('task_error', payload)
    if success:
        logger.info(f"Emitted task_error for {task_id}: {error_message}")
    return success

def emit_task_cancelled_safe(task_id: str, reason: Optional[str] = None):
    """Safely emit task cancellation event"""
    payload = {
        'task_id': task_id,
        'status': 'cancelled',
        'message': 'Task cancelled by user' if not reason else f"Task cancelled: {reason}",
        'timestamp': __import__('time').time()
    }
    
    success = emit_with_context('task_cancelled', payload)
    if success:
        logger.info(f"Emitted task_cancelled for {task_id}")
    return success