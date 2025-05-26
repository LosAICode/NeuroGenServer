"""
Structify Import Helper

This module provides standardized import functions for accessing the claude.py module
from any location in the project. It handles path resolution and provides consistent
fallback mechanisms.
"""

import os
import sys
import logging
import importlib.util
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, Union

# Set up logger
logger = logging.getLogger(__name__)

def setup_import_paths():
    """
    Set up the necessary import paths to ensure claude.py can be found regardless
    of where the script is run from.
    
    Returns:
        bool: True if setup was successful, False otherwise
    """
    # Track the current directory and possible locations for claude.py
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    
    potential_structify_dirs = [
        # Direct paths
        os.path.join(current_dir, 'Structify'),
        os.path.join(parent_dir, 'Structify'),
        # Sibling paths
        current_dir,
        parent_dir,
        # Module paths
        os.path.join(current_dir, 'modules'),
        os.path.join(parent_dir, 'modules'),
    ]
    
    # Add all potential directories to sys.path
    paths_added = 0
    for path in potential_structify_dirs:
        if os.path.exists(path) and path not in sys.path:
            sys.path.insert(0, path)
            paths_added += 1
            logger.debug(f"Added path to sys.path: {path}")
    
    return paths_added > 0

def find_claude_module_path() -> Optional[str]:
    """
    Find the file path to claude.py by searching in likely locations.
    
    Returns:
        Optional[str]: Path to claude.py if found, None otherwise
    """
    # Try different potential locations
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    
    potential_paths = [
        # Direct module file
        os.path.join(current_dir, 'claude.py'),
        os.path.join(parent_dir, 'claude.py'),
        # Inside Structify package
        os.path.join(current_dir, 'Structify', 'claude.py'),
        os.path.join(parent_dir, 'Structify', 'claude.py'),
        # Inside modules directory
        os.path.join(current_dir, 'modules', 'claude.py'),
        os.path.join(parent_dir, 'modules', 'claude.py'),
    ]
    
    for path in potential_paths:
        if os.path.isfile(path):
            logger.debug(f"Found claude.py at: {path}")
            return path
    
    return None

def import_claude_module() -> Tuple[Any, Dict[str, Any]]:
    """
    Import the claude module using a robust approach that handles various potential
    import locations and issues.
    
    Returns:
        Tuple[Any, Dict[str, Any]]: (claude_module, exported_items)
            - claude_module: The imported module or None if import failed
            - exported_items: Dictionary of key classes and functions from the module
    """
    # Set up import paths
    setup_import_paths()
    
    # Find the module file
    module_path = find_claude_module_path()
    
    structify_module = None
    exported_items = {}
    
    # Attempt 1: Try importing directly as a package
    if not structify_module:
        try:
            from Structify import claude as structify_module
            logger.info("Successfully imported claude.py module from Structify package")
        except ImportError as e1:
            logger.debug(f"Package import failed: {e1}")
    
    # Attempt 2: Try direct module import
    if not structify_module:
        try:
            import claude as structify_module
            logger.info("Successfully imported claude.py module directly")
        except ImportError as e2:
            logger.debug(f"Direct import failed: {e2}")
    
    # Attempt 3: Try module from modules directory
    if not structify_module:
        try:
            from modules import claude as structify_module
            logger.info("Successfully imported claude.py module from modules directory")
        except ImportError as e3:
            logger.debug(f"Modules directory import failed: {e3}")
    
    # Attempt 4: Import using importlib if we found the file but normal imports failed
    if not structify_module and module_path:
        try:
            spec = importlib.util.spec_from_file_location("claude", module_path)
            structify_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(structify_module)
            logger.info(f"Successfully imported claude.py module from file path: {module_path}")
        except Exception as e4:
            logger.debug(f"Importlib import failed: {e4}")
    
    # If module was successfully imported, extract key classes and functions
    if structify_module:
        # Export commonly used classes
        for class_name in ['FileStats', 'ProcessingTask', 'DocData', 'PDFDocument']:
            if hasattr(structify_module, class_name):
                exported_items[class_name] = getattr(structify_module, class_name)
        
        # Export commonly used functions
        for func_name in [
            'process_all_files', 'process_pdf', 'extract_tables_from_pdf',
            'detect_document_type', 'identify_document_structure', 'extract_text_from_pdf'
        ]:
            if hasattr(structify_module, func_name):
                exported_items[func_name] = getattr(structify_module, func_name)
        
        # Export default constants
        for const_name in ['DEFAULT_STOP_WORDS', 'DEFAULT_VALID_EXTENSIONS', 'DEFAULT_MAX_CHUNK_SIZE']:
            if hasattr(structify_module, const_name):
                exported_items[const_name] = getattr(structify_module, const_name)
    else:
        logger.warning("Failed to import claude.py module through any method")
    
    return structify_module, exported_items

# Create fallback implementations of key classes
def create_fallback_classes():
    """
    Create fallback implementations of key classes for use when 
    the claude module cannot be imported.
    
    Returns:
        Dict[str, Any]: Dictionary of fallback class implementations
    """
    import time
    
    class FallbackFileStats:
        """Fallback implementation of FileStats"""
        def __init__(self):
            self.total_files = 0
            self.processed_files = 0
            self.skipped_files = 0
            self.error_files = 0
            self.total_bytes = 0
            self.total_chunks = 0
            self.largest_file_bytes = 0
            self.largest_file_path = ""
            self.start_time = time.time()
            
        def update_largest_file(self, file_path, file_size):
            """Update the largest file if this one is bigger"""
            if file_size > self.largest_file_bytes:
                self.largest_file_bytes = file_size
                self.largest_file_path = file_path
            
        def to_dict(self):
            """Convert to dictionary for serialization"""
            result = self.__dict__.copy()
            result["duration_seconds"] = time.time() - self.start_time
            return result
    
    class FallbackProcessingTask:
        """Fallback implementation of ProcessingTask"""
        def __init__(self, task_id, input_dir, output_file):
            self.task_id = task_id
            self.input_dir = input_dir
            self.output_file = output_file
            self.status = "pending"
            self.progress = 0
            self.error = None
            self.stats = {}
            self.thread = None
            self.start_time = time.time()
            self.last_update_time = time.time()
            self.last_emit_time = 0
            self.emit_interval = 0.5  # Seconds between updates
            
        def start(self):
            """Start the processing task in a background thread."""
            import threading
            self.status = "processing"
            self.thread = threading.Thread(target=self._process, daemon=True)
            self.thread.start()
            
        def _process(self):
            """Basic implementation that logs the error."""
            try:
                # Just a placeholder - real implementation would have more
                self.error = "ProcessingTask fallback implementation used - limited functionality"
                self.status = "failed"
                logger.error(f"Task {self.task_id} error: ProcessingTask is a fallback implementation")
            except Exception as e:
                self.error = str(e)
                self.status = "failed"
                logger.error(f"Error in fallback ProcessingTask: {e}")
            
        def emit_progress_update(self, stage="processing"):
            """Emit a progress update via Socket.IO if available."""
            try:
                if 'socketio' in globals():
                    socketio.emit("progress_update", {
                        "task_id": self.task_id,
                        "progress": self.progress,
                        "status": self.status,
                        "message": f"{stage.capitalize()}: {self.progress}%",
                        "stats": self.stats,
                        "elapsed_time": time.time() - self.start_time
                    })
            except Exception as e:
                logger.debug(f"Socket.IO event emission failed: {e}")
            
        def cancel(self):
            """Cancel implementation."""
            if self.thread and self.thread.is_alive():
                self.status = "cancelled"
                return True
            return False
    
    return {
        "FileStats": FallbackFileStats,
        "ProcessingTask": FallbackProcessingTask
    }

# Main function to get claude module and necessary classes/functions
def get_claude_module():
    """
    Main entry point to get the claude module and all necessary classes/functions.
    
    Returns:
        Tuple[Any, Dict[str, Any]]: (module, components)
            - module: The imported module or None
            - components: Dictionary of key classes and functions
    """
    # Try importing the module
    module, components = import_claude_module()
    
    # If module import failed, set up fallback implementations
    if not module:
        fallback_classes = create_fallback_classes()
        components.update(fallback_classes)
        logger.warning("Using fallback implementations for key classes")
    
    return module, components