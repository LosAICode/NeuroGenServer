"""
API Management Blueprint
Handles API key management, task management, and general API utilities
"""

from flask import Blueprint, request, jsonify, current_app
import logging
import uuid
import time
import threading
from datetime import datetime

# Import necessary modules and functions
from blueprints.core.services import (
    get_task, add_task, remove_task, active_tasks, tasks_lock
)

logger = logging.getLogger(__name__)

# Create the blueprint - this will be registered with the app
api_management_bp = Blueprint('api_management', __name__, url_prefix='/api')

# API-level task tracking (lightweight tracking for API responses)
# This is separate from the core task management in services.py
# TODO: In production, this should integrate with services.py task management
api_task_registry = {}
api_task_registry_lock = threading.Lock()

# Task history storage and lock for thread safety
task_history = []
task_history_lock = threading.Lock()

# Utility functions
def format_duration(seconds):
    """Format duration in seconds to human readable string"""
    if seconds < 60:
        return f"{seconds:.1f} seconds"
    elif seconds < 3600:
        return f"{seconds/60:.1f} minutes"
    else:
        return f"{seconds/3600:.1f} hours"

def structured_error_response(error_code, message, status_code):
    """Create a structured error response"""
    return jsonify({
        "error": {
            "code": error_code,
            "message": message
        }
    }), status_code

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
        with api_task_registry_lock:
            if task_id in api_task_registry:
                api_task_registry[task_id]['status'] = 'cancelled'
                api_task_registry[task_id]['cancelled_at'] = time.time()
        
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
        for task_id, task_info in api_task_registry.items():
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
    """
    Get task completion history with pagination.
    
    Query parameters:
        - limit: Number of results (default: 20, max: 100)
        - offset: Offset for pagination (default: 0)
        - task_type: Filter by task type (optional)
        
    Returns:
        JSON response with task history
    """
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = max(int(request.args.get('offset', 0)), 0)
        task_type_filter = request.args.get('task_type')
        
        with task_history_lock:
            # Filter by task type if specified
            filtered_history = task_history
            if task_type_filter:
                filtered_history = [
                    entry for entry in task_history 
                    if entry.get('task_type') == task_type_filter
                ]
            
            # Sort by completion time (most recent first)
            sorted_history = sorted(
                filtered_history, 
                key=lambda x: x.get('completed_at', ''), 
                reverse=True
            )
            
            # Apply pagination
            paginated_history = sorted_history[offset:offset + limit]
            
            response = {
                'history': paginated_history,
                'pagination': {
                    'total': len(sorted_history),
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < len(sorted_history)
                },
                'filters': {
                    'task_type': task_type_filter
                }
            }
            
            return jsonify(response)
            
    except Exception as e:
        logger.error(f"Error retrieving task history: {e}")
        return structured_error_response(
            "HISTORY_RETRIEVAL_ERROR",
            f"Error retrieving task history: {str(e)}",
            500
        )


@api_management_bp.route('/tasks/analytics', methods=['GET'])
def get_task_analytics():
    """
    Get aggregated analytics across all completed tasks.
    
    Returns:
        JSON response with analytics data
    """
    try:
        with task_history_lock:
            if not task_history:
                return jsonify({
                    'message': 'No task history available',
                    'analytics': {}
                })
            
            analytics = {
                'overview': calculate_overview_analytics(),
                'performance_trends': calculate_performance_trends(),
                'task_type_distribution': calculate_task_type_distribution(),
                'efficiency_analysis': calculate_efficiency_analysis(),
                'generated_at': datetime.now().isoformat()
            }
            
            return jsonify(analytics)
            
    except Exception as e:
        logger.error(f"Error generating task analytics: {e}")
        return structured_error_response(
            "ANALYTICS_ERROR",
            f"Error generating analytics: {str(e)}",
            500
        )


def calculate_overview_analytics():
    """Calculate overview analytics from task history."""
    try:
        total_tasks = len(task_history)
        task_types = set(entry.get('task_type', 'unknown') for entry in task_history)
        
        # Calculate averages
        total_files = sum(
            entry.get('stats', {}).get('processed_files', 0) 
            for entry in task_history
        )
        
        total_duration = sum(
            entry.get('stats', {}).get('duration_seconds', 0) 
            for entry in task_history
        )
        
        avg_completion_rate = sum(
            entry.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
            for entry in task_history
        ) / total_tasks if total_tasks > 0 else 0
        
        return {
            'total_tasks': total_tasks,
            'unique_task_types': len(task_types),
            'total_files_processed': total_files,
            'total_processing_time': format_duration(total_duration),
            'average_completion_rate': round(avg_completion_rate, 2),
            'average_files_per_task': round(total_files / total_tasks, 2) if total_tasks > 0 else 0
        }
        
    except Exception as e:
        logger.error(f"Error calculating overview analytics: {e}")
        return {'error': str(e)}


def calculate_performance_trends():
    """Calculate performance trends over time."""
    try:
        if len(task_history) < 2:
            return {'message': 'Insufficient data for trend analysis'}
        
        # Sort by completion time
        sorted_history = sorted(
            task_history, 
            key=lambda x: x.get('completed_at', '')
        )
        
        # Calculate trend data
        recent_tasks = sorted_history[-5:]  # Last 5 tasks
        older_tasks = sorted_history[:-5] if len(sorted_history) > 5 else []
        
        if older_tasks:
            recent_avg_rate = sum(
                task.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
                for task in recent_tasks
            ) / len(recent_tasks)
            
            older_avg_rate = sum(
                task.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
                for task in older_tasks
            ) / len(older_tasks)
            
            trend = 'improving' if recent_avg_rate > older_avg_rate else 'declining'
            trend_magnitude = abs(recent_avg_rate - older_avg_rate)
        else:
            trend = 'stable'
            trend_magnitude = 0
        
        return {
            'trend_direction': trend,
            'trend_magnitude': round(trend_magnitude, 2),
            'recent_average_completion_rate': round(recent_avg_rate, 2) if recent_tasks else 0,
            'sample_size': len(recent_tasks)
        }
        
    except Exception as e:
        logger.error(f"Error calculating performance trends: {e}")
        return {'error': str(e)}


def calculate_task_type_distribution():
    """Calculate distribution of task types."""
    try:
        task_type_counts = {}
        task_type_performance = {}
        
        for entry in task_history:
            task_type = entry.get('task_type', 'unknown')
            task_type_counts[task_type] = task_type_counts.get(task_type, 0) + 1
            
            # Track performance by type
            completion_rate = entry.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
            if task_type not in task_type_performance:
                task_type_performance[task_type] = []
            task_type_performance[task_type].append(completion_rate)
        
        # Calculate average performance by type
        for task_type in task_type_performance:
            rates = task_type_performance[task_type]
            task_type_performance[task_type] = {
                'average_completion_rate': round(sum(rates) / len(rates), 2),
                'task_count': len(rates)
            }
        
        return {
            'distribution': task_type_counts,
            'performance_by_type': task_type_performance
        }
        
    except Exception as e:
        logger.error(f"Error calculating task type distribution: {e}")
        return {'error': str(e)}


def calculate_efficiency_analysis():
    """Calculate efficiency analysis across tasks."""
    try:
        efficiency_grades = {}
        efficiency_scores = []
        
        for entry in task_history:
            grade = entry.get('stats', {}).get('efficiency_metrics', {}).get('efficiency_grade', 'Unknown')
            score = entry.get('stats', {}).get('efficiency_metrics', {}).get('efficiency_score', 0)
            
            efficiency_grades[grade] = efficiency_grades.get(grade, 0) + 1
            if score > 0:
                efficiency_scores.append(score)
        
        avg_efficiency = sum(efficiency_scores) / len(efficiency_scores) if efficiency_scores else 0
        
        return {
            'grade_distribution': efficiency_grades,
            'average_efficiency_score': round(avg_efficiency, 2),
            'total_analyzed': len(efficiency_scores)
        }
        
    except Exception as e:
        logger.error(f"Error calculating efficiency analysis: {e}")
        return {'error': str(e)}


@api_management_bp.route('/task/<task_id>/stats', methods=['GET'])
def get_task_stats(task_id):
    """Get detailed statistics for a specific task"""
    try:
        if task_id not in api_task_registry:
            return jsonify({"error": "Task not found"}), 404
        
        task_info = api_task_registry[task_id]
        
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
        if task_id not in api_task_registry:
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
    with api_task_registry_lock:
        api_task_registry[task_id] = {
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
    with api_task_registry_lock:
        if task_id in api_task_registry:
            api_task_registry[task_id]['progress'] = progress
            api_task_registry[task_id]['last_updated'] = time.time()
            
            if status:
                api_task_registry[task_id]['status'] = status
            
            # Update any additional fields
            for key, value in kwargs.items():
                api_task_registry[task_id][key] = value
            
            logger.debug(f"Updated task {task_id}: {progress}% progress")


def complete_task(task_id, success=True, **kwargs):
    """Mark a task as completed"""
    with api_task_registry_lock:
        if task_id in api_task_registry:
            api_task_registry[task_id]['status'] = 'completed' if success else 'failed'
            api_task_registry[task_id]['completed_at'] = time.time()
            api_task_registry[task_id]['progress'] = 100 if success else api_task_registry[task_id].get('progress', 0)
            
            # Update any additional fields
            for key, value in kwargs.items():
                api_task_registry[task_id][key] = value
            
            logger.info(f"Task {task_id} completed with success={success}")


# Export utility functions for use by other blueprints
__all__ = ['register_task', 'update_task_progress', 'complete_task', 'api_task_registry']