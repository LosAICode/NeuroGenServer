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
    emit_task_completion,
    emit_task_error,
    emit_task_cancelled
)

# Import socketio context helper for proper emission
from socketio_context_helper import emit_with_context

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
    if not task_id:
        return False
        
    with tasks_lock:
        task = active_tasks.get(task_id)
        if not task:
            return False
        
        # Handle both dict objects and ProcessingTask instances
        try:
            if hasattr(task, 'get'):
                # task is a dictionary object
                return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
            elif hasattr(task, 'is_cancelled_flag'):
                # task is a ProcessingTask or BaseTask instance
                return getattr(task, 'is_cancelled_flag', False) or getattr(task, 'status', '') == 'cancelled'
            elif hasattr(task, 'status'):
                # task is an object with status attribute
                return getattr(task, 'status', '') == 'cancelled'
            else:
                # Fallback: treat as dict-like if it has keys
                if hasattr(task, '__getitem__'):
                    try:
                        return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
                    except:
                        return False
                return False
                
        except Exception as e:
            logger.debug(f"Error checking task cancellation for {task_id}: {e}")
            return False


# ============================================================================
# ENHANCED MARK TASK CANCELLED FUNCTION
# ============================================================================
# Updated to handle both dict and ProcessingTask objects

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
    with tasks_lock:
        task = active_tasks.get(task_id)
        
        if not task:
            return False, {"status": "not_found", "message": f"Task {task_id} not found"}
        
        try:
            # Handle dictionary objects (legacy format)
            if hasattr(task, 'get') and hasattr(task, 'update'):
                # Check if already in terminal state
                current_status = task.get('status', 'unknown')
                if current_status in ['completed', 'failed', 'cancelled']:
                    return True, {
                        "status": "already_finished", 
                        "message": f"Task already {current_status}",
                        "task_type": task.get('type', 'unknown')
                    }
                
                # Mark as cancelled - dictionary format
                task.update({
                    'status': 'cancelled',
                    'cancel_requested': True,
                    'end_time': time.time(),
                    'cancellation_reason': reason
                })
                
                return True, {
                    "status": "cancelled",
                    "message": reason,
                    "task_type": task.get('type', 'unknown'),
                    "task": task
                }
            
            # Handle ProcessingTask or BaseTask instances
            elif hasattr(task, 'status'):
                # Check if already in terminal state
                current_status = getattr(task, 'status', 'unknown')
                if current_status in ['completed', 'failed', 'cancelled']:
                    return True, {
                        "status": "already_finished",
                        "message": f"Task already {current_status}",
                        "task_type": getattr(task, 'task_type', 'unknown')
                    }
                
                # Call task's cancel method if available
                if hasattr(task, 'cancel') and callable(task.cancel):
                    try:
                        task.cancel()
                        logger.info(f"Called cancel() method for task {task_id}")
                    except Exception as e:
                        logger.error(f"Error calling cancel() for task {task_id}: {e}")
                        # Continue even if cancel() fails
                
                # Mark as cancelled - object format
                task.status = 'cancelled'
                if hasattr(task, 'is_cancelled_flag'):
                    task.is_cancelled_flag = True
                if hasattr(task, 'end_time'):
                    task.end_time = time.time()
                if hasattr(task, 'cancellation_reason'):
                    task.cancellation_reason = reason
                
                return True, {
                    "status": "cancelled",
                    "message": reason,
                    "task_type": getattr(task, 'task_type', 'unknown'),
                    "task": task
                }
            
            else:
                # Unknown task format
                logger.warning(f"Unknown task format for {task_id}: {type(task)}")
                return False, {
                    "status": "unknown_format",
                    "message": f"Unknown task format: {type(task)}"
                }
                
        except Exception as e:
            logger.error(f"Error marking task {task_id} as cancelled: {e}")
            return False, {
                "status": "error",
                "message": f"Error during cancellation: {str(e)}"
            }


# ============================================================================
# ENHANCED ProcessingTask CANCELLATION CHECK METHOD
# ============================================================================
# Add this method to the ProcessingTask class for internal cancellation checks

def _check_internal_cancellation(self) -> bool:
    """
    Internal method for ProcessingTask to check its own cancellation status.
    This avoids the need to go through the global check_task_cancellation function.
    
    Returns:
        bool: True if task should be cancelled
    """
    try:
        # CRITICAL: Check force cancellation first
        if is_force_cancelled(self.task_id if hasattr(self, 'task_id') else None):
            logger.warning(f"Task {getattr(self, 'task_id', 'unknown')} force cancelled")
            return True
        
        # Check internal cancellation flag first
        if hasattr(self, 'is_cancelled_flag') and self.is_cancelled_flag:
            return True
        
        # Check status
        if hasattr(self, 'status') and self.status == 'cancelled':
            return True
        
        # Also check the global task registry as a backup
        return check_task_cancellation(self.task_id)
        
    except Exception as e:
        logger.debug(f"Error in internal cancellation check: {e}")
        return False


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
    # Use internal cancellation check to avoid the 'get' attribute error
    if processed_count % self.cancellation_check_interval == 0:
        if self._check_internal_cancellation():
            logger.info(f"Task {self.task_id} cancelled during processing")
            raise InterruptedError("Task cancelled by user")
    
    # Calculate progress with better precision
    if total_count > 0:
        self.progress = min(int((processed_count / total_count) * 99), 99)  # Reserve 100% for completion
    else:
        self.progress = 0
    
    # Update CustomFileStats with comprehensive information
    if isinstance(self.stats, CustomFileStats):
        self.stats.total_files = total_count
        
        # Track processing milestones
        if processed_count == 1 and not hasattr(self, '_first_file_processed'):
            self._first_file_processed = time.time()
            self.performance_metrics['time_to_first_file'] = self._first_file_processed - self.start_time
        
        if processed_count == total_count // 2 and not hasattr(self, '_halfway_processed'):
            self._halfway_processed = time.time()
            self.performance_metrics['time_to_halfway'] = self._halfway_processed - self.start_time
    
    # Enhanced performance tracking
    current_time = time.time()
    elapsed_time = current_time - self.start_time
    
    # Track processing rate and detect bottlenecks
    if processed_count > 0 and elapsed_time > 0:
        current_rate = processed_count / elapsed_time
        
        # Detect processing bottlenecks
        if hasattr(self, '_last_rate_check') and current_rate < self._last_rate_check * 0.5:
            bottleneck = {
                'timestamp': current_time,
                'stage': stage_message,
                'rate_drop': self._last_rate_check - current_rate,
                'current_file': current_file
            }
            self.performance_metrics['bottlenecks_detected'].append(bottleneck)
            logger.warning(f"Processing bottleneck detected: rate dropped to {current_rate:.2f} files/sec")
        
        self._last_rate_check = current_rate
    
    # Adaptive chunk size optimization
    if self.adaptive_chunk_size and processed_count % 20 == 0:
        self._optimize_chunk_size(current_rate if 'current_rate' in locals() else 0)
    
    # Enhanced detailed progress tracking
    self.detailed_progress = {
        "processed_count": processed_count,
        "total_count": total_count,
        "stage": stage_message,
        "current_file": current_file,
        "progress_percent": self.progress,
        "timestamp": current_time,
        "elapsed_time": elapsed_time,
        "processing_rate": processed_count / elapsed_time if elapsed_time > 0 else 0,
        "estimated_completion": self._estimate_completion_time(processed_count, total_count, elapsed_time),
        "memory_usage_mb": self._get_current_memory_usage()
    }
    
    # Prepare enhanced message
    msg = f"Stage: {stage_message} ({processed_count}/{total_count})"
    if current_file:
        msg += f" - Current: {os.path.basename(current_file)}"
    
    # Add performance indicators to message
    if elapsed_time > 30:  # After 30 seconds, include rate information
        rate = processed_count / elapsed_time
        msg += f" - Rate: {rate:.1f} files/sec"
    
    # Enhanced details for emission
    details = {
        "current_stage_message": stage_message,
        "processed_count": processed_count,
        "total_count": total_count,
        "elapsed_time": elapsed_time,
        "processing_rate_files_per_sec": processed_count / elapsed_time if elapsed_time > 0 else 0,
        "estimated_completion_time": self.detailed_progress.get("estimated_completion"),
        "memory_usage_mb": self.detailed_progress.get("memory_usage_mb", 0)
    }
    
    if current_file:
        details["current_file_processing"] = os.path.basename(current_file)
    
    # Periodic memory and performance tracking
    if processed_count % 25 == 0:
        if hasattr(self.stats, 'track_memory_usage'):
            self.stats.track_memory_usage()
        
        # Record performance checkpoint
        checkpoint = {
            'processed_count': processed_count,
            'timestamp': current_time,
            'memory_mb': self._get_current_memory_usage(),
            'rate': processed_count / elapsed_time if elapsed_time > 0 else 0
        }
        self.performance_metrics['processing_checkpoints'].append(checkpoint)
    
    # Emit progress update with enhanced information
    self.emit_progress_update(progress=self.progress, message=msg, details=details)

# =============================================================================
# FORCE CANCELLATION SYSTEM
# =============================================================================


# ============================================================================
# ENHANCED FORCE CANCELLATION SYSTEM
# ============================================================================

# Global force cancellation flag
FORCE_CANCEL_ALL = False
FORCE_CANCELLED_TASKS = set()

def force_cancel_all_tasks():
    """
    Force cancel ALL active tasks regardless of their state.
    This is a nuclear option to break out of stuck loops.
    """
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    
    logger.warning("[FORCE_CANCEL] Initiating force cancellation of ALL tasks")
    
    # Set global force cancel flag
    FORCE_CANCEL_ALL = True
    
    # Cancel all tasks in active_tasks
    with tasks_lock:
        cancelled_count = 0
        for task_id, task in list(active_tasks.items()):
            try:
                # Add to force cancelled set
                FORCE_CANCELLED_TASKS.add(task_id)
                
                # Try to set cancellation flags on the task object
                if hasattr(task, '__setattr__'):
                    try:
                        task.is_cancelled = True
                        task.is_cancelled_flag = True
                        task.status = 'cancelled'
                        task.cancelled = True
                    except Exception as e:
                        logger.debug(f"Could not set cancellation attributes on task {task_id}: {e}")
                
                # If it's a ProcessingTask, try to set its internal flag
                if hasattr(task, '_cancelled'):
                    task._cancelled = True
                
                # Emit cancellation event
                task_type = 'unknown'
                if hasattr(task, 'task_type'):
                    task_type = task.task_type
                elif isinstance(task, dict) and 'type' in task:
                    task_type = task['type']
                
                emit_task_cancelled(task_id, reason="Force cancelled due to system issue")
                cancelled_count += 1
                
                logger.info(f"[FORCE_CANCEL] Force cancelled task {task_id} (type: {task_type})")
                
            except Exception as e:
                logger.error(f"[FORCE_CANCEL] Error force cancelling task {task_id}: {e}")
        
        # Clear all active tasks
        active_tasks.clear()
        
    logger.warning(f"[FORCE_CANCEL] Force cancelled {cancelled_count} tasks")
    
    # Also emit a global cancellation event
    try:
        emit_with_context('all_tasks_cancelled', {
            'reason': 'Force cancellation due to system issue',
            'count': cancelled_count,
            'timestamp': time.time()
        })
    except Exception as e:
        logger.debug(f"Could not emit global cancellation event: {e}")
    
    return cancelled_count

def is_force_cancelled(task_id=None):
    """
    Check if force cancellation is active or if a specific task was force cancelled.
    
    Args:
        task_id: Optional task ID to check. If None, checks global flag.
        
    Returns:
        bool: True if force cancelled
    """
    if FORCE_CANCEL_ALL:
        return True
    
    if task_id and task_id in FORCE_CANCELLED_TASKS:
        return True
        
    return False

def reset_force_cancel():
    """Reset force cancellation flags"""
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    FORCE_CANCEL_ALL = False
    FORCE_CANCELLED_TASKS.clear()
    logger.info("[FORCE_CANCEL] Force cancellation flags reset")

# Update check_task_cancellation to include force cancel check
def check_task_cancellation_enhanced(task_id: str) -> bool:
    """
    Enhanced version that checks for force cancellation first.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if the task is cancelled or force cancelled
    """
    # Check force cancellation first
    if is_force_cancelled(task_id):
        return True
    
    # Then check normal cancellation
    return check_task_cancellation(task_id)


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
                emit_with_context('file_processing_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit file_processing_cancelled: {e}")
                
        elif task_type == 'playlist_download':
            try:
                emit_with_context('playlist_cancelled', {
                    'taskId': task_id,  # Note: Frontend expects camelCase
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit playlist_cancelled: {e}")
                
        elif task_type == 'web_scraping':
            try:
                emit_with_context('scraping_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit scraping_cancelled: {e}")
                
        elif task_type == 'pdf_processing':
            try:
                emit_with_context('pdf_processing_cancelled', {
                    'task_id': task_id,
                    'reason': reason,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.debug(f"Failed to emit pdf_processing_cancelled: {e}")
                
        elif task_type == 'batch_processing':
            try:
                emit_with_context('batch_processing_cancelled', {
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