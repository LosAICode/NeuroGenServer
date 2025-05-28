"""
Task Execution Module
Provides task execution utilities with cancellation support, cleanup scheduling, and task loops
"""

import logging
import time
import threading
from typing import Any, Callable, Iterable, Optional

# Import shared services and cancellation functions
from .services import (
    active_tasks,
    tasks_lock,
    emit_task_completion,
    emit_task_error,
    emit_progress_update,
    remove_task
)
from .cancellation import check_task_cancellation

logger = logging.getLogger(__name__)

# =============================================================================
# TASK EXECUTION WITH CANCELLATION
# =============================================================================

def execute_task_with_cancellation(task_func, task_id: str, *args, **kwargs):
    """
    Universal task execution wrapper with built-in cancellation support.
    Implements consistent error handling and cleanup patterns.
    
    Args:
        task_func: The task function to execute
        task_id: Unique task identifier
        *args, **kwargs: Arguments for the task function
        
    Returns:
        Task execution result or None if cancelled
    """
    # Implementation will be moved here
    pass


def schedule_task_cleanup(task_id: str, delay: int = 30) -> None:
    """
    Schedule task cleanup after a delay to allow final status queries.
    Non-blocking cleanup prevents resource leaks.
    
    Args:
        task_id: The task ID to clean up
        delay: Delay in seconds before cleanup
    """
    # Implementation will be moved here
    pass


# =============================================================================
# ENHANCED TASK LOOP PATTERNS
# =============================================================================

def cancellable_task_loop(task_id: str, work_items, progress_callback=None):
    """
    Generic cancellable task loop for processing work items.
    Implements consistent progress reporting and cancellation checking.
    
    Args:
        task_id: The task identifier
        work_items: Iterable of items to process
        progress_callback: Optional callback function for processing each item
        
    Yields:
        Processed items or raises StopIteration if cancelled
    """
    # Implementation will be moved here
    pass


# =============================================================================
# TASK MONITORING UTILITIES
# =============================================================================

def monitor_task_progress(task_id: str, check_interval: float = 1.0):
    """
    Monitor task progress in a separate thread.
    
    Args:
        task_id: The task identifier to monitor
        check_interval: How often to check progress (seconds)
    """
    def monitor_worker():
        while True:
            with tasks_lock:
                task = active_tasks.get(task_id)
                if not task:
                    break
                    
                status = task.get('status') if isinstance(task, dict) else getattr(task, 'status', None)
                if status in ['completed', 'failed', 'cancelled']:
                    break
            
            time.sleep(check_interval)
        
        logger.debug(f"Stopped monitoring task {task_id}")
    
    monitor_thread = threading.Thread(target=monitor_worker, daemon=True)
    monitor_thread.start()


def get_task_metrics(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Get performance metrics for a running or completed task.
    
    Args:
        task_id: The task identifier
        
    Returns:
        Dictionary of metrics or None if task not found
    """
    with tasks_lock:
        task = active_tasks.get(task_id)
        if not task:
            return None
        
        # Extract metrics based on task type
        if isinstance(task, dict):
            return {
                'status': task.get('status', 'unknown'),
                'start_time': task.get('start_time'),
                'end_time': task.get('end_time'),
                'progress': task.get('progress', 0),
                'error': task.get('error')
            }
        else:
            # Handle object-based tasks
            return {
                'status': getattr(task, 'status', 'unknown'),
                'start_time': getattr(task, 'start_time', None),
                'end_time': getattr(task, 'end_time', None),
                'progress': getattr(task, 'progress', 0),
                'error': getattr(task, 'error', None)
            }


# =============================================================================
# TASK BATCHING UTILITIES
# =============================================================================

def execute_tasks_in_batch(task_functions: List[Tuple[Callable, str, tuple, dict]], 
                          max_concurrent: int = 5) -> Dict[str, Any]:
    """
    Execute multiple tasks concurrently with cancellation support.
    
    Args:
        task_functions: List of (function, task_id, args, kwargs) tuples
        max_concurrent: Maximum number of concurrent tasks
        
    Returns:
        Dictionary mapping task_id to result or error
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    results = {}
    
    with ThreadPoolExecutor(max_workers=max_concurrent) as executor:
        # Submit all tasks
        future_to_task = {}
        for func, task_id, args, kwargs in task_functions:
            future = executor.submit(
                execute_task_with_cancellation,
                func, task_id, *args, **kwargs
            )
            future_to_task[future] = task_id
        
        # Collect results
        for future in as_completed(future_to_task):
            task_id = future_to_task[future]
            try:
                result = future.result()
                results[task_id] = {'status': 'success', 'result': result}
            except Exception as e:
                results[task_id] = {'status': 'error', 'error': str(e)}
    
    return results


# =============================================================================
# EXPORT PUBLIC INTERFACE
# =============================================================================

__all__ = [
    'execute_task_with_cancellation',
    'schedule_task_cleanup',
    'cancellable_task_loop',
    'monitor_task_progress',
    'get_task_metrics',
    'execute_tasks_in_batch'
]