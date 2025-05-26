# history_integration.py
# Enhanced history integration to ensure proper history tracking and automatic refresh

import os
import sys
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

# Set up logging
logger = logging.getLogger(__name__)

# Import history manager for core functionality
try:
    import history_manager
except ImportError:
    logger.error("history_manager module not available")
    # Create a simple fallback implementation for testing
    class FallbackHistoryManager:
        def get_history(self):
            return []
        
        def add_to_history(self, entry):
            return False
        
        def clear_history(self):
            return True
    
    history_manager = FallbackHistoryManager()

class HistoryIntegration:
    """
    Enhanced history integration to ensure consistent tracking across all NeuroGen modules
    and to enable automatic refresh when the History tab is opened.
    """
    
    def __init__(self, history_file="history.json", max_entries=100):
        """
        Initialize the history integration.
        
        Args:
            history_file: Path to history JSON file
            max_entries: Maximum number of history entries to keep
        """
        self.history_file = history_file
        self.max_entries = max_entries
        self.socketio = None
        self.last_refresh_time = 0
        self.refresh_interval = 60  # seconds
        
        # Initialize history file if it doesn't exist
        self._init_history_file()
    
    def _init_history_file(self):
        """Initialize the history file if it doesn't exist."""
        if not os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'w', encoding='utf-8') as f:
                    json.dump([], f, indent=2)
                logger.info(f"Created history file: {self.history_file}")
                return True
            except Exception as e:
                logger.error(f"Failed to create history file: {e}")
                return False
        return True
    
    def init_socketio(self, socketio_instance):
        """
        Initialize Socket.IO integration for real-time history updates.
        
        Args:
            socketio_instance: Socket.IO instance from the Flask app
        """
        self.socketio = socketio_instance
        
        # Register Socket.IO event handlers
        if self.socketio:
            @self.socketio.on('request_history')
            def handle_history_request():
                self.emit_history_update()
            
            @self.socketio.on('active_tab')
            def handle_tab_change(data):
                if data.get('tab') == 'history':
                    self.emit_history_update(force=True)
        
        logger.info("History integration initialized with Socket.IO")
        return True
    
    def emit_history_update(self, force=False):
        """
        Emit a history update event via Socket.IO.
        
        Args:
            force: Whether to force an update even if within refresh interval
        """
        if not self.socketio:
            return False
        
        # Check if we should refresh (respect rate limiting)
        current_time = time.time()
        if not force and (current_time - self.last_refresh_time) < self.refresh_interval:
            logger.debug("History refresh skipped (rate limiting)")
            return False
        
        try:
            # Get latest history
            history = history_manager.get_history()
            
            # Emit history update
            self.socketio.emit("history_update", {
                "history": history,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            
            # Update refresh time
            self.last_refresh_time = current_time
            
            return True
        except Exception as e:
            logger.error(f"Error emitting history update: {e}")
            return False
    
    def add_to_history(self, entry):
        """
        Add an entry to the history with consistent typing.
        
        Args:
            entry: History entry dictionary
            
        Returns:
            bool: True if successful, False otherwise
        """
        # Ensure required fields exist
        if "type" not in entry:
            entry["type"] = "unknown"
            
        if "timestamp" not in entry:
            entry["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Add the entry
        try:
            success = history_manager.add_to_history(entry)
            
            # Emit update if successful
            if success and self.socketio:
                self.emit_history_update()
            
            return success
        except Exception as e:
            logger.error(f"Error adding to history: {e}")
            return False
    
    def add_web_scraper_to_history(self, task_id, output_file, stats):
        """
        Add web scraper result to history.
        
        Args:
            task_id: Task ID
            output_file: Output JSON file path
            stats: Task statistics
            
        Returns:
            bool: True if successful, False otherwise
        """
        entry = {
            "type": "web_scraper",
            "task_id": task_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "output_file": output_file,
            "urls_processed": stats.get("processed_urls", 0),
            "urls_successful": stats.get("successful_urls", 0),
            "pdf_downloads": stats.get("pdf_downloads", 0),
            "processing_time": stats.get("duration_seconds", 0),
            "status": "completed"
        }
        
        return self.add_to_history(entry)
    
    def add_file_scraper_to_history(self, task_id, input_dir, output_file, stats):
        """
        Add file scraper result to history.
        
        Args:
            task_id: Task ID
            input_dir: Input directory
            output_file: Output JSON file path
            stats: Task statistics
            
        Returns:
            bool: True if successful, False otherwise
        """
        entry = {
            "type": "file_scraper",
            "task_id": task_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "input_directory": input_dir,
            "output_file": output_file,
            "files_processed": stats.get("files_processed", 0),
            "total_chunks": stats.get("total_chunks", 0),
            "processing_time": stats.get("processing_time", 0),
            "status": "completed"
        }
        
        return self.add_to_history(entry)
    
    def add_playlist_to_history(self, task_id, output_file, stats):
        """
        Add YouTube playlist result to history.
        
        Args:
            task_id: Task ID
            output_file: Output JSON file path
            stats: Task statistics
            
        Returns:
            bool: True if successful, False otherwise
        """
        entry = {
            "type": "youtube_playlist",
            "task_id": task_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "output_file": output_file,
            "playlists_processed": stats.get("playlists_processed", 0),
            "total_videos": stats.get("total_videos", 0),
            "processing_time": stats.get("duration_seconds", 0),
            "status": "completed"
        }
        
        return self.add_to_history(entry)
    
    def get_history(self, limit=None, type_filter=None):
        """
        Get history entries with optional filtering and limiting.
        
        Args:
            limit: Maximum number of entries to return
            type_filter: Filter by entry type
            
        Returns:
            list: History entries
        """
        try:
            # Get all history
            history = history_manager.get_history()
            
            # Apply type filter if specified
            if type_filter:
                history = [entry for entry in history if entry.get("type") == type_filter]
            
            # Apply limit if specified
            if limit and isinstance(limit, int) and limit > 0:
                history = history[:limit]
            
            return history
        except Exception as e:
            logger.error(f"Error getting history: {e}")
            return []
    
    def get_recent_by_type(self, type_name, limit=5):
        """
        Get recent history entries by type.
        
        Args:
            type_name: Entry type to filter by
            limit: Maximum number of entries to return
            
        Returns:
            list: Recent history entries of the specified type
        """
        return self.get_history(limit=limit, type_filter=type_name)
    
    def clear_history(self):
        """
        Clear all history entries.
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            success = history_manager.clear_history()
            
            # Emit update if successful
            if success and self.socketio:
                self.emit_history_update(force=True)
            
            return success
        except Exception as e:
            logger.error(f"Error clearing history: {e}")
            return False

# Create a global instance for shared use
history_integration = HistoryIntegration()