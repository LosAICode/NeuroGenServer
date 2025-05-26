import os
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# Configuration
HISTORY_FILE = "history.json"
MAX_HISTORY_ENTRIES = 100
history_cache = []

def init_history_file():
    """Initialize the history file if it doesn't exist"""
    if not os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'w') as f:
                json.dump([], f)
            logger.info(f"Created history file: {HISTORY_FILE}")
            return True
        except Exception as e:
            logger.error(f"Failed to create history file: {e}")
            return False
    return True

def load_history() -> List[Dict[str, Any]]:
    """Load history from file"""
    global history_cache
    
    if not os.path.exists(HISTORY_FILE):
        init_history_file()
        return []
    
    try:
        with open(HISTORY_FILE, 'r') as f:
            history_cache = json.load(f)
        return history_cache
    except Exception as e:
        logger.error(f"Failed to load history: {e}")
        return []

def save_history(history: List[Dict[str, Any]]) -> bool:
    """Save history to file"""
    global history_cache
    
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
        history_cache = history
        return True
    except Exception as e:
        logger.error(f"Failed to save history: {e}")
        return False

def add_to_history(entry: Dict[str, Any]) -> bool:
    """Add an entry to the history"""
    global history_cache
    
    if not history_cache:
        load_history()
    
    # Ensure the entry has a timestamp
    if "timestamp" not in entry:
        entry["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Add the entry to the beginning of the list
    history_cache.insert(0, entry)
    
    # Truncate history if it exceeds the maximum
    if len(history_cache) > MAX_HISTORY_ENTRIES:
        history_cache = history_cache[:MAX_HISTORY_ENTRIES]
    
    # Save to file
    return save_history(history_cache)

def get_history() -> List[Dict[str, Any]]:
    """Get the history"""
    global history_cache
    
    if not history_cache:
        load_history()
    
    return history_cache

def clear_history() -> bool:
    """Clear the history"""
    global history_cache
    
    history_cache = []
    return save_history([])

def get_recent_history(limit: int = 10, task_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get recent history entries, optionally filtered by task type"""
    history = get_history()
    
    if task_type:
        history = [entry for entry in history if entry.get("type") == task_type]
    
    return history[:limit]

# Initialize the history on module import
init_history_file()
load_history()