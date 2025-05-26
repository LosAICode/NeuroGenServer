"""
Structify Package Initialization

This file enables Python to recognize the Structify directory as a package,
making the claude.py module directly importable through standard Python import mechanisms.
"""

import os
import sys
import logging
import importlib.util
from pathlib import Path

# Set up package-level logger
logger = logging.getLogger(__name__)

# Version information
__version__ = "1.0.0"
__author__ = "NeuroGen"

# The list of modules that should be accessible when importing from this package
__all__ = ["claude"]

# Ensure the current directory and parent directory are in Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

# Add these paths only if they aren't already in sys.path
for path in [current_dir, parent_dir]:
    if path not in sys.path:
        sys.path.insert(0, path)
        logger.debug(f"Added {path} to sys.path")

# Define claude module path
claude_path = os.path.join(current_dir, "claude.py")

# Import the claude module with better error handling
try:
    if os.path.exists(claude_path):
        # Import directly from file path to ensure correct resolution
        spec = importlib.util.spec_from_file_location("claude", claude_path)
        claude = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(claude)
        logger.info("Successfully imported claude.py from Structify package")
    else:
        # Try normal import if file not found at expected location
        import claude
        logger.info("Imported claude module from system path")
except ImportError as e:
    logger.warning(f"Could not import claude module: {e}")
    claude = None
except Exception as e:
    logger.error(f"Error importing claude module: {e}")
    claude = None

# Export important classes and functions if claude module was successfully imported
if claude:
    # Export key classes and functions for easier access
    if hasattr(claude, 'FileStats'):
        FileStats = claude.FileStats
    
    if hasattr(claude, 'ProcessingTask'):
        ProcessingTask = claude.ProcessingTask
        
    if hasattr(claude, 'process_pdf'):
        process_pdf = claude.process_pdf
        
    if hasattr(claude, 'extract_tables_from_pdf'):
        extract_tables_from_pdf = claude.extract_tables_from_pdf
        
    if hasattr(claude, 'process_all_files'):
        process_all_files = claude.process_all_files
        
    # Export default constants
    if hasattr(claude, 'DEFAULT_STOP_WORDS'):
        DEFAULT_STOP_WORDS = claude.DEFAULT_STOP_WORDS
        
    if hasattr(claude, 'DEFAULT_VALID_EXTENSIONS'):
        DEFAULT_VALID_EXTENSIONS = claude.DEFAULT_VALID_EXTENSIONS