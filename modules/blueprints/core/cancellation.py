"""
Task Cancellation Module
Handles task cancellation logic, force cancellation, and cancellation checks
"""

import logging
import time
import threading
from typing import Dict, Any, Tuple, Optional

# Import shared services
from .services import (
    active_tasks,
    tasks_lock,
    socketio,
    emit_task_completion,
    emit_task_error,
    emit_task_cancelled
)

logger = logging.getLogger(__name__)

# =============================================================================
# GLOBAL CANCELLATION STATE
# =============================================================================

# Global force cancellation flags
FORCE_CANCEL_ALL = False
FORCE_CANCELLED_TASKS = set()

# =============================================================================
# TASK CANCELLATION CHECK FUNCTIONS
# =============================================================================

def check_task_cancellation(task_id: str) -> bool:
    """
    Thread-safe check if a task has been cancelled.
    Handles both dictionary objects (from active_tasks) and ProcessingTask instances.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if task should be cancelled
    """
    # Implementation will be moved here
    pass


def mark_task_cancelled(task_id: str, reason: str = "Task cancelled by user") -> Tuple[bool, Dict[str, Any]]:
    """
    Unified function to mark a task as cancelled.
    Handles both dictionary objects and ProcessingTask instances.
    
    Args:
        task_id: The task ID to cancel
        reason: Reason for cancellation
        
    Returns:
        Tuple of (success, task_info)
    """
    # Implementation will be moved here
    pass


def _check_internal_cancellation(self) -> bool:
    """
    Internal method for ProcessingTask to check its own cancellation status.
    This avoids the need to go through the global check_task_cancellation function.
    
    Returns:
        bool: True if task should be cancelled
    """
    # Implementation will be moved here
    pass


# =============================================================================
# PROGRESS CALLBACK WITH CANCELLATION
# =============================================================================

def _structify_progress_callback(self, processed_count: int, total_count: int, 
                               stage_message: str, current_file: Optional[str] = None):
    """
    Enhanced callback function with corrected cancellation checking.
    
    Args:
        processed_count: Number of items processed
        total_count: Total number of items to process
        stage_message: Current processing stage
        current_file: Optional current file being processed
    
    Raises:
        InterruptedError: If task was cancelled during processing
    """
    # Implementation will be moved here
    pass


# =============================================================================
# FORCE CANCELLATION SYSTEM
# =============================================================================

def force_cancel_all_tasks():
    """
    Force cancel ALL active tasks regardless of their state.
    This is a nuclear option to break out of stuck loops.
    """
    # Implementation will be moved here
    pass


def is_force_cancelled(task_id=None):
    """
    Check if force cancellation is active or if a specific task was force cancelled.
    
    Args:
        task_id: Optional task ID to check. If None, checks global flag.
        
    Returns:
        bool: True if force cancelled
    """
    # Implementation will be moved here
    pass


def reset_force_cancel():
    """Reset force cancellation flags"""
    # Implementation will be moved here
    pass


def check_task_cancellation_enhanced(task_id: str) -> bool:
    """
    Enhanced version that checks for force cancellation first.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if the task is cancelled or force cancelled
    """
    # Implementation will be moved here
    pass


# =============================================================================
# CANCELLATION EVENT HELPERS
# =============================================================================

def emit_cancellation_event(task_id: str, task_type: str, reason: str = "Task cancelled"):
    """
    Emit appropriate cancellation event based on task type.
    
    Args:
        task_id: The task identifier
        task_type: Type of task for specialized events
        reason: Cancellation reason
    """
    try:
        # Emit generic task cancelled event
        emit_task_cancelled(task_id, reason)
        
        # Emit task-specific cancellation events
        if task_type == 'file_processing':
            try:
                socketio.emit('file_processing_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit file_processing_cancelled: {e}")
                
        elif task_type == 'playlist_download':
            try:
                socketio.emit('playlist_cancelled', {
                    'taskId': task_id,  # Note: Frontend expects camelCase
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit playlist_cancelled: {e}")
                
        elif task_type == 'web_scraping':
            try:
                socketio.emit('scraping_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit scraping_cancelled: {e}")
                
        elif task_type == 'pdf_processing':
            try:
                socketio.emit('pdf_processing_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit pdf_processing_cancelled: {e}")
                
        elif task_type == 'batch_processing':
            try:
                socketio.emit('batch_processing_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit batch_processing_cancelled: {e}")
                
    except Exception as e:
        logger.error(f"Error emitting cancellation events for {task_id}: {e}")


# =============================================================================
# EXPORT PUBLIC INTERFACE
# =============================================================================

__all__ = [
    'check_task_cancellation',
    'mark_task_cancelled',
    '_check_internal_cancellation',
    '_structify_progress_callback',
    'force_cancel_all_tasks',
    'is_force_cancelled',
    'reset_force_cancel',
    'check_task_cancellation_enhanced',
    'emit_cancellation_event',
    'FORCE_CANCEL_ALL',
    'FORCE_CANCELLED_TASKS'
]