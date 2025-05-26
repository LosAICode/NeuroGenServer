import os
import json
import time
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# Path to the task history file
TASK_HISTORY_FILE = os.path.join(os.path.dirname(__file__), 'data', 'task_history.json')

# Ensure the data directory exists
os.makedirs(os.path.dirname(TASK_HISTORY_FILE), exist_ok=True)

# Task progress cache
_task_progress_cache = {}

def generate_task_id() -> str:
    """Generate a unique task ID"""
    return str(uuid.uuid4())

def load_task_history() -> List[Dict[str, Any]]:
    """Load task history from JSON file"""
    try:
        if os.path.exists(TASK_HISTORY_FILE):
            with open(TASK_HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading task history: {e}")
        return []

def save_task_history(history: List[Dict[str, Any]]) -> bool:
    """Save task history to JSON file"""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(TASK_HISTORY_FILE), exist_ok=True)
        
        # Save history data
        with open(TASK_HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2)
        return True
    except (IOError, PermissionError) as e:
        logger.error(f"Error saving task history: {e}")
        return False

def add_task(task_type: str, task_id: str, output_path: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Add a new task to history"""
    # Load current history
    history = load_task_history()
    
    # Create new task entry
    task_entry = {
        "task_id": task_id,
        "task_type": task_type,
        "output_path": output_path,
        "created_at": datetime.now().isoformat(),
        "timestamp": int(time.time()),
        "status": "in_progress",
        "metadata": metadata or {}
    }
    
    # Add to history
    history.append(task_entry)
    
    # Ensure history doesn't grow too large (keep last 100 entries)
    if len(history) > 100:
        history = sorted(history, key=lambda x: x.get("timestamp", 0), reverse=True)[:100]
    
    # Save updated history
    save_task_history(history)
    
    # Initialize progress tracking for this task
    _task_progress_cache[task_id] = {
        "progress": 0,
        "status": "in_progress",
        "message": "Task initialized",
        "updated_at": int(time.time())
    }
    
    return task_entry

def update_task_progress(task_id: str, progress: int, message: str = None, data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Update progress information for a task"""
    # Initialize if not in cache
    if task_id not in _task_progress_cache:
        _task_progress_cache[task_id] = {
            "progress": 0, 
            "status": "in_progress",
            "message": "Task initialized"
        }
    
    # Update progress data
    _task_progress_cache[task_id].update({
        "progress": min(max(0, progress), 100),  # Clamp between 0-100
        "updated_at": int(time.time())
    })
    
    # Update message if provided
    if message:
        _task_progress_cache[task_id]["message"] = message
    
    # Update additional data if provided
    if data:
        _task_progress_cache[task_id].update(data)
    
    return _task_progress_cache[task_id]

def get_task_progress(task_id: str) -> Dict[str, Any]:
    """Get current progress for a task"""
    return _task_progress_cache.get(task_id, {
        "progress": 0,
        "status": "unknown",
        "message": "Task not found in progress cache"
    })

def mark_task_complete(task_id: str, output_path: str, stats: Dict[str, Any] = None) -> bool:
    """Mark a task as completed in history"""
    history = load_task_history()
    
    # Find the task in history
    updated = False
    for task in history:
        if task.get("task_id") == task_id:
            task["status"] = "completed"
            task["completed_at"] = datetime.now().isoformat()
            task["duration"] = int(time.time()) - task.get("timestamp", int(time.time()))
            task["output_path"] = output_path  # Update in case it changed
            
            # Update stats if provided
            if stats:
                task["stats"] = stats
            
            updated = True
            break
    
    # If task was found and updated, save changes
    if updated:
        save_task_history(history)
        
        # Update progress cache
        if task_id in _task_progress_cache:
            _task_progress_cache[task_id].update({
                "progress": 100,
                "status": "completed",
                "message": "Task completed successfully",
                "updated_at": int(time.time())
            })
    
    return updated

def mark_task_failed(task_id: str, error_message: str) -> bool:
    """Mark a task as failed in history"""
    history = load_task_history()
    
    # Find the task in history
    updated = False
    for task in history:
        if task.get("task_id") == task_id:
            task["status"] = "failed"
            task["error"] = error_message
            task["failed_at"] = datetime.now().isoformat()
            task["duration"] = int(time.time()) - task.get("timestamp", int(time.time()))
            updated = True
            break
    
    # If task was found and updated, save changes
    if updated:
        save_task_history(history)
        
        # Update progress cache
        if task_id in _task_progress_cache:
            _task_progress_cache[task_id].update({
                "status": "failed",
                "message": error_message,
                "updated_at": int(time.time())
            })
    
    return updated

def get_task_info(task_id: str) -> Optional[Dict[str, Any]]:
    """Get detailed information about a specific task"""
    history = load_task_history()
    
    # Find task in history
    for task in history:
        if task.get("task_id") == task_id:
            # Merge with current progress data
            progress_data = get_task_progress(task_id)
            task["current_progress"] = progress_data
            return task
    
    return None

def clear_old_tasks_from_progress_cache(max_age_hours: int = 24):
    """Clean up old tasks from the progress cache"""
    current_time = int(time.time())
    max_age_seconds = max_age_hours * 3600
    
    tasks_to_remove = []
    for task_id, data in _task_progress_cache.items():
        last_update = data.get("updated_at", 0)
        if current_time - last_update > max_age_seconds:
            tasks_to_remove.append(task_id)
    
    # Remove old tasks
    for task_id in tasks_to_remove:
        _task_progress_cache.pop(task_id, None)
    
    if tasks_to_remove:
        logger.info(f"Cleared {len(tasks_to_remove)} old tasks from progress cache")

def create_unique_task_dir(base_dir: str, task_name: str) -> str:
    """Create a unique directory for task outputs based on task name"""
    # Sanitize task name for use in directory
    safe_name = "".join(c if c.isalnum() else "_" for c in task_name)
    safe_name = safe_name.strip("_")
    
    # Generate unique suffix
    unique_id = str(uuid.uuid4())[:8]
    dir_name = f"{safe_name}_{unique_id}"
    
    # Create full path
    output_dir = os.path.join(base_dir, dir_name)
    
    # Create directory
    try:
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"Created task directory: {output_dir}")
        return output_dir
    except (IOError, PermissionError) as e:
        logger.error(f"Failed to create task directory {output_dir}: {e}")
        # Fallback to base directory
        return base_dir
