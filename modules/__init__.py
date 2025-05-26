"""
NeuroGen Processor Package Initialization

This file enables Python to recognize this directory as a package,
allowing for easier imports between modules.
"""

import os
import sys
import logging

# Add the parent directory to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
structify_dir = os.path.join(parent_dir, 'Structify')

# Add required directories to the path
for path in [parent_dir, current_dir, structify_dir]:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

# Set up package-level logger
logger = logging.getLogger(__name__)

# Version information
__version__ = "1.0.0"
__author__ = "NeuroGen"

# The list of modules that should be accessible when importing from this package
# This helps with wildcard imports
__all__ = ["app", "web_scraper"]

# Import commonly used modules for easy access
try:
    from . import app
    from . import web_scraper
except ImportError as e:
    logger.warning(f"Warning: Could not import submodule: {e}")

# Import claude from Structify
try:
    # Try different import strategies for claude
    try:
        # First try relative import if in a package
        from Structify import claude
    except ImportError:
        try:
            # Then try direct import if path is set
            import claude
        except ImportError:
            # Finally try absolute path import
            sys.path.append(structify_dir)
            import claude
    
    # Add to __all__ if successfully imported
    __all__.append("claude")
    logger.info("Successfully imported claude module")
except ImportError as e:
    logger.warning(f"Could not import claude module: {e}")