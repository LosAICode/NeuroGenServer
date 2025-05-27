"""
API Management Blueprint
Handles API key management, task management, and general API utilities
"""

from flask import Blueprint, request, jsonify
import logging
import uuid
import time

logger = logging.getLogger(__name__)

# Create the blueprint - this will be registered with the app
api_management_bp = Blueprint('api_management', __name__, url_prefix='/api')

# Global storage for active tasks (in production, this should be a database)
active_tasks = {}

@api_management_bp.route('/cancel/<task_id>', methods=['POST'])
def cancel_task(task_id):
    """
    Generic task cancellation endpoint
    Works for all task types (file processing, web scraping, playlist downloading)
    """
    try:
        if not task_id:
            return jsonify({"error": "task_id is required"}), 400
        
        # TODO: Implement actual task cancellation logic
        # For now, just mark as cancelled
        if task_id in active_tasks:
            active_tasks[task_id]['status'] = 'cancelled'
            active_tasks[task_id]['cancelled_at'] = time.time()
        
        response = {
            "task_id": task_id,
            "status": "cancelled",
            "message": "Task cancelled successfully"
        }
        
        logger.info(f"Cancelled task {task_id}")
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error cancelling task {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api_management_bp.route('/emergency-stop', methods=['POST'])
def emergency_stop():
    """Emergency stop all active tasks"""
    try:
        cancelled_tasks = []
        
        # Cancel all active tasks
        for task_id, task_info in active_tasks.items():
            if task_info['status'] in ['running', 'processing', 'downloading', 'scraping']:
                task_info['status'] = 'cancelled'
                task_info['cancelled_at'] = time.time()
                cancelled_tasks.append(task_id)
        
        response = {
            "message": "Emergency stop executed",
            "cancelled_tasks": cancelled_tasks,
            "total_cancelled": len(cancelled_tasks)
        }
        
        logger.warning(f"Emergency stop executed - cancelled {len(cancelled_tasks)} tasks")
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Error during emergency stop: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api_management_bp.route('/tasks/history', methods=['GET'])
def get_task_history():
    """Get history of all tasks"""
    try:
        # TODO: Implement actual task history from database
        # For now, return active tasks as history
        history = []
        
        for task_id, task_info in active_tasks.items():
            history.append({
                "task_id": task_id,
                "type": task_info.get('type', 'unknown'),
                "status": task_info.get('status', 'unknown'),
                "created_at": task_info.get('created_at'),
                "completed_at": task_info.get('completed_at'),
                "cancelled_at": task_info.get('cancelled_at')
            })
        
        return jsonify({
            "history": history,
            "total": len(history)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting task history: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api_management_bp.route('/tasks/analytics', methods=['GET'])
def get_task_analytics():
    """Get analytics about task performance"""
    try:
        # TODO: Implement actual analytics
        analytics = {
            "total_tasks": len(active_tasks),
            "by_status": {},
            "by_type": {},
            "average_duration": 0,
            "success_rate": 0
        }
        
        # Calculate basic stats from active tasks
        for task_info in active_tasks.values():
            status = task_info.get('status', 'unknown')
            task_type = task_info.get('type', 'unknown')
            
            analytics['by_status'][status] = analytics['by_status'].get(status, 0) + 1
            analytics['by_type'][task_type] = analytics['by_type'].get(task_type, 0) + 1
        
        return jsonify(analytics), 200
        
    except Exception as e:
        logger.error(f"Error getting task analytics: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api_management_bp.route('/task/<task_id>/stats', methods=['GET'])
def get_task_stats(task_id):
    """Get detailed statistics for a specific task"""
    try:
        if task_id not in active_tasks:
            return jsonify({"error": "Task not found"}), 404
        
        task_info = active_tasks[task_id]
        
        # Calculate duration if possible
        duration = None
        if task_info.get('completed_at') and task_info.get('created_at'):
            duration = task_info['completed_at'] - task_info['created_at']
        
        stats = {
            "task_id": task_id,
            "type": task_info.get('type', 'unknown'),
            "status": task_info.get('status', 'unknown'),
            "progress": task_info.get('progress', 0),
            "duration": duration,
            "created_at": task_info.get('created_at'),
            "started_at": task_info.get('started_at'),
            "completed_at": task_info.get('completed_at'),
            "error_count": task_info.get('error_count', 0),
            "custom_stats": task_info.get('stats', {})
        }
        
        return jsonify(stats), 200
        
    except Exception as e:
        logger.error(f"Error getting stats for task {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@api_management_bp.route('/task/<task_id>/stats/export', methods=['GET'])
def export_task_stats(task_id):
    """Export task statistics in various formats"""
    try:
        if task_id not in active_tasks:
            return jsonify({"error": "Task not found"}), 404
        
        export_format = request.args.get('format', 'json')
        
        if export_format not in ['json', 'csv']:
            return jsonify({"error": "Unsupported export format"}), 400
        
        # TODO: Implement actual export functionality
        return jsonify({"error": "Export functionality not implemented yet"}), 501
        
    except Exception as e:
        logger.error(f"Error exporting stats for task {task_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


# Utility functions for task management
def register_task(task_id, task_type, **kwargs):
    """Register a new task in the system"""
    active_tasks[task_id] = {
        'type': task_type,
        'status': 'created',
        'created_at': time.time(),
        'progress': 0,
        'error_count': 0,
        **kwargs
    }
    logger.info(f"Registered new task {task_id} of type {task_type}")


def update_task_progress(task_id, progress, status=None, **kwargs):
    """Update task progress and status"""
    if task_id in active_tasks:
        active_tasks[task_id]['progress'] = progress
        active_tasks[task_id]['last_updated'] = time.time()
        
        if status:
            active_tasks[task_id]['status'] = status
        
        # Update any additional fields
        for key, value in kwargs.items():
            active_tasks[task_id][key] = value
        
        logger.debug(f"Updated task {task_id}: {progress}% progress")


def complete_task(task_id, success=True, **kwargs):
    """Mark a task as completed"""
    if task_id in active_tasks:
        active_tasks[task_id]['status'] = 'completed' if success else 'failed'
        active_tasks[task_id]['completed_at'] = time.time()
        active_tasks[task_id]['progress'] = 100 if success else active_tasks[task_id].get('progress', 0)
        
        # Update any additional fields
        for key, value in kwargs.items():
            active_tasks[task_id][key] = value
        
        logger.info(f"Task {task_id} completed with success={success}")


# Export utility functions for use by other blueprints
__all__ = ['register_task', 'update_task_progress', 'complete_task', 'active_tasks']