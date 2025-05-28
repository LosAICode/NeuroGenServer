#!/usr/bin/env python3
"""
Script to update imports to use the new config module instead of inline constants.
This shows how to replace the constants that can be removed.
"""

# Example of how to update imports in files that use these constants:

# OLD WAY (remove these lines):
"""
RESEARCH_DOMAINS = ["arxiv.org", "springer.com", "ieee.org", "researchgate.net", "academia.edu", "sciencedirect.com"]
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER", os.path.join(os.path.expanduser("~"), "Documents"))
DEFAULT_OUTPUT_PATH = os.environ.get("DEFAULT_OUTPUT_PATH", os.path.join(os.path.expanduser("~"), "Documents"))
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", "5"))
API_KEYS = os.environ.get("API_KEYS", "test_key,dev_key").split(",")
API_PORT = os.environ.get("API_PORT", "5025")
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_DEBUG = os.environ.get("API_DEBUG", "False").lower() in ("true", "1", "t")
API_URL = f"http://localhost:{API_PORT}/api/process"
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", "32")) * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

# Import from Structify.claude
try:
    from Structify.claude import (
        DEFAULT_MAX_CHUNK_SIZE,
        DEFAULT_STOP_WORDS,
        DEFAULT_VALID_EXTENSIONS,
        DEFAULT_CHUNK_OVERLAP,
        MAX_FILE_SIZE,
        DEFAULT_PROCESS_TIMEOUT,
        DEFAULT_MEMORY_LIMIT
    )
except ImportError:
    # Fallback values...
"""

# NEW WAY (add this import):
from blueprints.core.config import (
    RESEARCH_DOMAINS,
    DEFAULT_OUTPUT_FOLDER,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_NUM_THREADS,
    API_KEYS,
    API_PORT,
    API_HOST,
    API_DEBUG,
    API_URL,
    MAX_UPLOAD_SIZE,
    DEFAULT_MAX_CHUNK_SIZE,
    DEFAULT_STOP_WORDS,
    DEFAULT_VALID_EXTENSIONS,
    DEFAULT_CHUNK_OVERLAP,
    MAX_FILE_SIZE,
    DEFAULT_PROCESS_TIMEOUT,
    DEFAULT_MEMORY_LIMIT,
    Config  # Optional: use Config class for object-oriented access
)

# Or import everything:
# from blueprints.core.config import *

# Then use the constants as before:
print(f"Research domains: {RESEARCH_DOMAINS}")
print(f"Output folder: {DEFAULT_OUTPUT_FOLDER}")
print(f"API URL: {API_URL}")

# Or use the Config class:
config = Config()
print(f"API Port: {config.API_PORT}")
print(f"Max chunk size: {config.PROCESSING['DEFAULT_MAX_CHUNK_SIZE']}")