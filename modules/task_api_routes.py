"""
Task API Routes - Endpoints for task management and progress tracking
"""
import os
import json
import logging
import time
from flask import Blueprint, jsonify, request, current_app
from datetime import datetime

# Initialize logger
logger = logging.getLogger(__name__)

# Import task history module if available
try:
    from task_history import (
        generate_task_id,
        load_task_history,
        add_task,
        update_task_progress,
        get_task_progress,
        mark_task_complete,
        mark_task_failed,
        get_task_info,
        create_unique_task_dir,
        clear_old_tasks_from_progress_cache
    )
    task_history_available = True
    logger.info("Task history module loaded successfully")
except ImportError as e:
    task_history_available = False
    logger.error(f"Failed to import task_history module: {e}")
    # Define function stubs to prevent errors
    def generate_task_id(): 
        import uuid
        return str(uuid.uuid4())
    def load_task_history(): return []
    def add_task(*args, **kwargs): return {"task_id": generate_task_id()}
    def update_task_progress(*args, **kwargs): return {}
    def get_task_progress(*args, **kwargs): return {"progress": 0}
    def mark_task_complete(*args, **kwargs): return False
    def mark_task_failed(*args, **kwargs): return False
    def get_task_info(*args, **kwargs): return None
    def create_unique_task_dir(base_dir, task_name):
        import os, uuid
        dir_path = os.path.join(base_dir, f"{task_name}_{uuid.uuid4().hex[:8]}")
        os.makedirs(dir_path, exist_ok=True)
        return dir_path
    def clear_old_tasks_from_progress_cache(*args, **kwargs): pass

# Create Blueprint for task API routes
task_api = Blueprint('task_api', __name__)

@task_api.route('/api/history', methods=['GET'])
def get_history():
    """Get all task history"""
    try:
        history = load_task_history()
        return jsonify({
            "status": "success",
            "history": history
        })
    except Exception as e:
        logger.error(f"Error retrieving task history: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    """Get progress information for a specific task"""
    try:
        progress_data = get_task_progress(task_id)
        
        # If progress data is not available, return a default response
        if not progress_data:
            return jsonify({
                "status": "unknown",
                "task_id": task_id,
                "progress": 0,
                "message": "No progress data available for this task"
            })
        
        # Add task_id to the response
        progress_data["task_id"] = task_id
        
        return jsonify(progress_data)
    except Exception as e:
        logger.error(f"Error retrieving progress for task {task_id}: {e}")
        return jsonify({
            "status": "error",
            "task_id": task_id,
            "error": str(e)
        }), 500

@task_api.route('/api/task/<task_id>', methods=['GET'])
def get_task(task_id):
    """Get detailed information about a specific task"""
    try:
        task_info = get_task_info(task_id)
        
        if not task_info:
            return jsonify({
                "status": "error",
                "error": f"Task with ID {task_id} not found"
            }), 404
        
        return jsonify({
            "status": "success",
            "task": task_info
        })
    except Exception as e:
        logger.error(f"Error retrieving task info for {task_id}: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/task/<task_id>/cancel', methods=['POST'])
def cancel_task(task_id):
    """Cancel a running task"""
    try:
        # Check if we have the task in our registry
        task_info = get_task_info(task_id)
        
        if not task_info:
            return jsonify({
                "status": "error",
                "error": f"Task with ID {task_id} not found"
            }), 404
        
        # Mark the task as failed/canceled
        mark_task_failed(task_id, "Task canceled by user")
        
        # Also emit a Socket.IO event if available
        try:
            from flask_socketio import SocketIO
            socketio = current_app.extensions['socketio']
            socketio.emit('task_error', {
                'task_id': task_id,
                'error': 'Task canceled by user'
            })
        except (ImportError, KeyError, AttributeError) as e:
            logger.warning(f"Could not emit Socket.IO event: {e}")
        
        return jsonify({
            "status": "success",
            "message": f"Task {task_id} has been canceled"
        })
    except Exception as e:
        logger.error(f"Error canceling task {task_id}: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/task/create', methods=['POST'])
def create_task():
    """Create a new task and return its ID"""
    try:
        task_data = request.json
        
        if not task_data:
            return jsonify({
                "status": "error",
                "error": "No task data provided"
            }), 400
        
        # Generate task ID
        task_id = generate_task_id()
        
        # Extract required fields
        task_type = task_data.get('task_type', 'unknown')
        output_path = task_data.get('output_path', '')
        metadata = task_data.get('metadata', {})
        
        # Add task to history
        task_entry = add_task(task_type, task_id, output_path, metadata)
        
        return jsonify({
            "status": "success",
            "task_id": task_id,
            "task": task_entry
        })
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/task/<task_id>/update', methods=['POST'])
def update_task(task_id):
    """Update progress information for a task"""
    try:
        update_data = request.json
        
        if not update_data:
            return jsonify({
                "status": "error",
                "error": "No update data provided"
            }), 400
        
        # Extract progress information
        progress = update_data.get('progress', 0)
        message = update_data.get('message', '')
        data = update_data.get('data', {})
        
        # Update progress information
        updated = update_task_progress(task_id, progress, message, data)
        
        # Also emit a Socket.IO event if available
        try:
            from flask_socketio import SocketIO
            socketio = current_app.extensions['socketio']
            socketio.emit('progress_update', {
                'task_id': task_id,
                'progress': progress,
                'message': message,
                **data
            })
        except (ImportError, KeyError, AttributeError) as e:
            logger.warning(f"Could not emit Socket.IO event: {e}")
        
        return jsonify({
            "status": "success",
            "task_id": task_id,
            "updated": updated
        })
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/task/<task_id>/complete', methods=['POST'])
def complete_task(task_id):
    """Mark a task as completed"""
    try:
        completion_data = request.json or {}
        
        # Extract completion information
        output_path = completion_data.get('output_path', '')
        stats = completion_data.get('stats', {})
        
        # Mark task as complete
        completed = mark_task_complete(task_id, output_path, stats)
        
        # Also emit a Socket.IO event if available
        try:
            from flask_socketio import SocketIO
            socketio = current_app.extensions['socketio']
            socketio.emit('task_completed', {
                'task_id': task_id,
                'output_file': output_path,
                'stats': stats
            })
        except (ImportError, KeyError, AttributeError) as e:
            logger.warning(f"Could not emit Socket.IO event: {e}")
        
        return jsonify({
            "status": "success",
            "task_id": task_id,
            "completed": completed
        })
    except Exception as e:
        logger.error(f"Error completing task {task_id}: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@task_api.route('/api/task/<task_id>/fail', methods=['POST'])
def fail_task(task_id):
    """Mark a task as failed"""
    try:
        failure_data = request.json or {}
        
        # Extract failure information
        error_message = failure_data.get('error', 'Task failed')
        
        # Mark task as failed
        failed = mark_task_failed(task_id, error_message)
        
        # Also emit a Socket.IO event if available
        try:
            from flask_socketio import SocketIO
            socketio = current_app.extensions['socketio']
            socketio.emit('task_error', {
                'task_id': task_id,
                'error': error_message
            })
        except (ImportError, KeyError, AttributeError) as e:
            logger.warning(f"Could not emit Socket.IO event: {e}")
        
        return jsonify({
            "status": "success",
            "task_id": task_id,
            "failed": failed
        })
    except Exception as e:
        logger.error(f"Error marking task {task_id} as failed: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

def register_task_api(app):
    """Register the task API with the Flask app"""
    app.register_blueprint(task_api)
    logger.info("Task API routes registered")
    
    # Clean up old tasks from progress cache
    clear_old_tasks_from_progress_cache()
    
    return app
