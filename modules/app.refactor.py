# everything from line 1 - 292 is in place in modules. 
import eventlet
eventlet.monkey_patch()
from flask_socketio import SocketIO
import os
import sys
import logging
import re
import json
import time
import uuid
import hashlib
import tempfile
import threading
import subprocess
import traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple, Set, Any, Union, Callable
from urllib.parse import urlencode
from functools import wraps
from datetime import datetime













   
# ----------------------------------------------------------------------------
# Task Management
# ----------------------------------------------------------------------------
active_tasks = {}
tasks_lock = threading.Lock()



def ensure_temp_directory():
    """
    Ensure the temp directory exists and has proper permissions.
    Call this before any operation that requires the temp directory.
    """
    custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    
    # Ensure the directory exists
    os.makedirs(custom_temp_dir, exist_ok=True)
    
    # Try to set full permissions
    try:
        import stat
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    except Exception:
        pass
        
    # Set environment variables
    os.environ['TEMP'] = custom_temp_dir
    os.environ['TMP'] = custom_temp_dir
    
    # Return the path for use in operations
    return custom_temp_dir

def get_output_filepath(filename, user_defined_dir=None):
    """Resolves user-specified output directory or uses default fallback."""
    directory = user_defined_dir or DEFAULT_OUTPUT_FOLDER
    return resolve_output_path(directory, filename)

def resolve_output_path(directory, filename):
    """
    Resolve output path with proper directory creation if needed.
    
    Args:
        directory (str): The directory to save the file in
        filename (str): Output filename (without extension)
        
    Returns:
        str: Full path to the resolved output file
    """
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, filename)

def safe_split(text_value, delimiter=','):
    """
    Safely split a text value with proper validation.
    
    Args:
        text_value: The text to split
        delimiter: The delimiter to split on
        
    Returns:
        List of split values or empty list if text_value is None/invalid
    """
    if text_value is None:
        return []
    
    if not isinstance(text_value, str):
        try:
            text_value = str(text_value)
        except:
            return []
    
    return text_value.split(delimiter)

# In modules/app.py

def cleanup_temp_files():
    """Clean up any remaining temporary files in the OCR temp directory."""
    import os, glob, time
    
    # Define temp directory if not already defined
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir, exist_ok=True)
        
    # Get all temp files older than 30 minutes
    current_time = time.time()
    for file_path in glob.glob(os.path.join(temp_dir, "ocr_temp_*")):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 1800:  # 30 minutes
                try:
                    os.remove(file_path)
                    logger.debug(f"Removed temp file {file_path}")
                except PermissionError:
                    # On Windows, files may be locked temporarily
                    logger.debug(f"Could not remove temp file {file_path} - may be in use")
                except OSError as e:
                    logger.debug(f"OS error removing temp file {file_path}: {e}")
        except Exception as e:
            logger.debug(f"Error cleaning up temp file {file_path}: {e}")
            
# Fix for the periodic cleanup function in app.py
def start_periodic_cleanup():
    """Start periodic cleanup of temporary files."""
    import threading
    import time
    
    def cleanup_worker():
        while True:
            try:
                cleanup_temp_files()
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")
            time.sleep(3600)  # Run every hour
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()

start_periodic_cleanup()






# Replace the process_file function to properly utilize claude.py






# Add to app.py - Enhanced error handling for PDF processing

    
# ----------------------------------------------------------------------------
# API Key Management 
# ----------------------------------------------------------------------------

# Define a simple rate limiter class if it's missing
class Limiter:
    def __init__(self, key_func, app=None, default_limits=None, storage_uri=None):
        self.key_func = key_func
        self.app = app
        self.default_limits = default_limits
        self.storage_uri = storage_uri
    
    def limit(self, limits):
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # For personal use, we'll skip actual rate limiting
                return f(*args, **kwargs)
            return decorated_function
        return decorator

# If limiter is not defined, create a simple instance
if 'limiter' not in locals() and 'limiter' not in globals():
    limiter = Limiter(
        lambda: request.remote_addr,  # Simple key function using IP
        app=app,
        default_limits=["100 per day", "10 per minute"],
        storage_uri="memory://"
    )

# ----------------------------------------------------------------------------
# Background Task Classes & Active Task Management
# ----------------------------------------------------------------------------
class ApiKeyManager:
    """Simple API key manager for personal use"""
    
    def __init__(self, keys_file="api_keys.json"):
        self.keys_file = keys_file
        self.keys = {}
        self.load_keys()
        
        # Create a default key if no keys exist
        if not self.keys:
            self.create_key("default", "Default personal key")
    
    def load_keys(self):
        """Load API keys from file"""
        try:
            if os.path.exists(self.keys_file):
                with open(self.keys_file, 'r') as f:
                    self.keys = json.load(f)
                logger.info(f"Loaded {len(self.keys)} API keys")
            else:
                logger.info(f"No API keys file found at {self.keys_file}, will create new")
                self.keys = {}
        except Exception as e:
            logger.error(f"Error loading API keys: {e}")
            self.keys = {}
    
    def save_keys(self):
        """Save API keys to file"""
        try:
            with open(self.keys_file, 'w') as f:
                json.dump(self.keys, f, indent=2)
            logger.info(f"Saved {len(self.keys)} API keys")
            return True
        except Exception as e:
            logger.error(f"Error saving API keys: {e}")
            return False
    
    def create_key(self, name, description=""):
        """Create a new API key"""
        key = str(uuid.uuid4())
        self.keys[key] = {
            "name": name,
            "description": description,
            "created": datetime.now().isoformat(),
            "last_used": None,
            "active": True
        }
        self.save_keys()
        return key
    
    def revoke_key(self, key):
        """Revoke an API key"""
        if key in self.keys:
            self.keys[key]["active"] = False
            self.save_keys()
            return True
        return False
    
    def validate_key(self, key):
        """Check if a key is valid"""
        if key in self.keys and self.keys[key]["active"]:
            # Update last used timestamp
            self.keys[key]["last_used"] = datetime.now().isoformat()
            self.save_keys()
            return True
        return False
    
    def get_all_keys(self):
        """Get all keys with their information"""
        return self.keys
    
    def get_active_keys(self):
        """Get only active keys"""
        return {k: v for k, v in self.keys.items() if v.get("active", False)}


# Initialize the key manager
key_manager = ApiKeyManager()

# Update the require_api_key decorator to use the key manager
def require_api_key(f):
    """Decorator to require API key for a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        # Check if API key is provided
        if not api_key:
            return jsonify({"error": {"code": "MISSING_API_KEY", "message": "API key is required"}}), 401
        
        # Validate using key manager
        if not key_manager.validate_key(api_key):
            return jsonify({"error": {"code": "INVALID_API_KEY", "message": "Invalid API key"}}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function
  






# ----------------------------------------------------------------------------
# Flask Endpoints
# ----------------------------------------------------------------------------
@app.route("/")


@app.route("/test-modules")


@app.route("/diagnostics")

@app.route("/module-diagnostics-complete")


@app.route("/endpoint-dashboard")


@app.route("/api/upload-for-path-detection", methods=["POST"])


@app.route("/api/detect-path", methods=["POST"])

# ============================================================================
# ENHANCED TASK COMPLETION STATS SHOWCASE SYSTEM
# ============================================================================
# Integration with existing main.py functions and CustomFileStats

# ----------------------------------------------------------------------------
# Enhanced Task Completion with Rich Stats
# ----------------------------------------------------------------------------




# ----------------------------------------------------------------------------
# Frontend Integration Endpoints
# ----------------------------------------------------------------------------

@app.route("/api/task/<task_id>/stats", methods=["GET"])


@app.route("/api/task/<task_id>/stats/export", methods=["GET"])





@app.route("/api/tasks/history", methods=["GET"])



@app.route("/api/tasks/analytics", methods=["GET"])

# -----------------------------------------------------------------------------
# File Path API Endpoints
# -----------------------------------------------------------------------------

@app.route("/api/verify-path", methods=["POST"])



@app.route("/api/create-directory", methods=["POST"])



@app.route("/api/get-output-filepath", methods=["POST"])



@app.route("/api/check-file-exists", methods=["POST"])






@app.route("/api/get-default-output-folder", methods=["GET"])


@app.route("/api/process", methods=["POST"])


@app.route("/api/status/<task_id>")


@app.route("/api/download/<task_id>")


@app.route("/download/<path:filename>")


@app.route("/api/open/<task_id>")




task_registry = {}  # Or a shared task store object

def get_task(task_id):
    return task_registry.get(task_id)  # Customize if registry is class-based

def structured_error_response(code, message, status_code=400):
    response = jsonify({
        "error": {
            "code": code,
            "message": message
        }
    })
    response.status_code = status_code
    return response

   
@app.route("/api/start-playlists", methods=["POST"])


# ----------------------------------------------------------------------------
# Core Cancellation Infrastructure
# ----------------------------------------------------------------------------

# ============================================================================
# FIXED TASK CANCELLATION CHECK FUNCTION
# ============================================================================
# Corrected version that handles both dict objects and ProcessingTask instances




# ============================================================================
# UPDATED STRUCTIFY PROGRESS CALLBACK
# ============================================================================
# Replace the progress callback in ProcessingTask with this corrected version






# ============================================================================
# PLAYLIST CANCEL ENDPOINT  
# ============================================================================
# Playlist cancellation is handled by the generic cancel endpoint at /api/cancel/<task_id>
# The emit_cancellation_event function properly handles playlist-specific events

# ============================================================================
# EMERGENCY STOP ENDPOINT
# ============================================================================

@app.route("/api/emergency-stop", methods=["POST"])








# ----------------------------------------------------------------------------
# Socket.IO Cancellation Handler
# ----------------------------------------------------------------------------



# ----------------------------------------------------------------------------
# Enhanced REST API Endpoint
# ----------------------------------------------------------------------------

@app.route("/api/cancel/<task_id>", methods=["POST"])
def cancel_task_api(task_id):
    """
    Enhanced REST cancellation endpoint with comprehensive error handling.
    Replaces existing implementation with improved idempotent behavior.
    """
    if not task_id:
        return structured_error_response("MISSING_TASK_ID", "Task ID is required", 400)
    
    logger.info(f"[CANCEL] REST API cancellation request for task: {task_id}")
    
    try:
        # Use unified cancellation logic
        success, task_info = mark_task_cancelled(task_id, "Task cancelled via REST API")
        
        if success:
            # Emit appropriate events
            task_type = task_info.get('task_type', 'unknown')
            reason = task_info.get('message', 'Task cancelled')
            emit_cancellation_event(task_id, task_type, reason)
            
            # Return success response
            return jsonify({
                "status": "success",
                "message": task_info['message'],
                "task_id": task_id,
                "task_type": task_type
            }), 200
        else:
            # Idempotent behavior for non-existent tasks
            emit_task_cancelled(task_id, reason="Task not found or already completed")
            return jsonify({
                "status": "success",
                "message": "Task not found or already completed",
                "task_id": task_id
            }), 200
            
    except Exception as e:
        logger.error(f"[CANCEL] REST API error for task {task_id}: {e}")
        return structured_error_response(
            "CANCELLATION_ERROR", 
            f"Error cancelling task: {str(e)}", 
            500
        )





# ----------------------------------------------------------------------------
# Task Status Monitoring
# ----------------------------------------------------------------------------





# ----------------------------------------------------------------------------
# Legacy Compatibility Functions
# ----------------------------------------------------------------------------



# ----------------------------------------------------------------------------
# PDF Download Endpoints MOVED TO web_scraper.py
# ----------------------------------------------------------------------------

@app.route("/api/download-pdf", methods=["POST"])


@app.route("/download-pdf/<path:pdf_path>")

@app.route("/download-file/<path:file_path>")


@app.route("/api/open-folder", methods=["POST"])

# -----------------------------------------------------------------------------
# WEB SCRAPER ENDPOINTS - moved to web_scraper.py
# -----------------------------------------------------------------------------

@app.route("/api/scrape2", methods=["POST"])

@app.route("/api/scrape2/status/<task_id>")


@app.route("/api/scrape2/cancel/<task_id>", methods=["POST"])

# -----------------------------------------------------------------------------
# PDF PROCESSING ENDPOINTS
# -----------------------------------------------------------------------------

@app.route("/api/pdf/process", methods=["POST"])

    
@app.route("/api/pdf/extract-tables", methods=["POST"])

@app.route("/api/pdf/detect-type", methods=["POST"])

@app.route("/api/pdf/analyze", methods=["POST"])


@app.route("/api/pdf/batch-process", methods=["POST"])


@app.route("/api/pdf/status/<task_id>", methods=["GET"])


@app.route("/api/pdf/cancel/<task_id>", methods=["POST"])

       
@app.route("/api/pdf-capabilities", methods=["GET"])


# ----------------------------------------------------------------------------
# API Key Management 
# ----------------------------------------------------------------------------
 
@app.route("/api/keys", methods=["GET"])


@app.route("/api/keys/create", methods=["POST"])

@app.route("/api/keys/revoke", methods=["POST"])


@app.route("/key-manager")
def key_manager_ui():
    """Serve the API key manager interface"""
    return render_template("key_manager.html")
     
     
# -----------------------------------------------------------------------------
# Academic API Helper Functions
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# Academic API Endpoints
# -----------------------------------------------------------------------------

@app.route("/shutdown", methods=["POST"])

@app.route("/api/academic/health", methods=["GET"])

@app.route("/api/academic/search", methods=["GET"])

@app.route("/api/academic/multi-source", methods=["GET"])

@app.route("/api/academic/details/<path:id>", methods=["GET"])

@app.route("/api/academic/download/<path:id>", methods=["GET"])

@app.route("/api/academic/citations/<path:id>", methods=["GET"])

@app.route("/api/academic/recommendations/<path:id>", methods=["GET"])

@app.route("/api/academic/bulk/download", methods=["POST"])


@app.route("/api/academic/analyze/<path:id>", methods=["GET"])

@app.route("/api/academic/extract", methods=["GET"])


# ----------------------------------------------------------------------------
# Main Entry Point
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    from flask_socketio import SocketIO
    import eventlet
    eventlet.monkey_patch()
    socketio = SocketIO(app, cors_allowed_origins="*")

    socketio.run(app, host=API_HOST, port=int(API_PORT), debug=API_DEBUG)

    if redis_integration_available:
        redis_cache = RedisCache(app)
        redis_rate_limiter = RedisRateLimiter(app)
        logger.info("Initialized Redis cache and rate limiter")
    else:
        logger.info("Using in-memory cache (Redis not available)")
    import argparse
    
    parser = argparse.ArgumentParser(description="NeuroGen Processing Server")
    
    parser.add_argument("--host", default=API_HOST, help=f"Host address to bind to (default: {API_HOST})")
    parser.add_argument("--port", default=API_PORT, help=f"Port to bind to (default: {API_PORT})")
    parser.add_argument("--debug", action="store_true", default=API_DEBUG, help="Enable debug mode")   
    parser.add_argument("-i", "--input", help="Root directory for input files (CLI mode)")
    parser.add_argument("-o", "--output", help="Path to output JSON file (CLI mode)")
    parser.add_argument("--threads", type=int, default=DEFAULT_NUM_THREADS, help="Number of threads to use (CLI mode)")
    
    args = parser.parse_args()
    
    if args.input:
        if args.debug:
            logging.getLogger().setLevel(logging.DEBUG)      
        output_filepath = args.output
        if not output_filepath:
            output_folder = os.path.dirname(os.path.abspath(args.input))
            output_filepath = os.path.join(output_folder, "output.json")
        
        logger.info(f"Running in CLI mode: Processing files from {args.input}")
        logger.info(f"Output will be saved to: {output_filepath}")
        
        if not structify_module:
            logger.error("Claude module not available. Cannot process files.")
            sys.exit(1)
        
        try:
            result = structify_module.process_all_files(
                root_directory=args.input,
                output_file=output_filepath,
                max_chunk_size=4096,
                executor_type="thread",
                max_workers=args.threads,
                stop_words=structify_module.DEFAULT_STOP_WORDS,
                use_cache=False,
                valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
                ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                stats_only=False,
                include_binary_detection=True
            )
            
            if result.get("stats"):
                stats = result["stats"]
                print(f"\nProcessing complete.")
                print(f"Files found: {stats.get('total_files', 0)}")
                print(f"Files processed: {stats.get('processed_files', 0)}")
                print(f"Files skipped: {stats.get('skipped_files', 0)}")
                print(f"Errors: {stats.get('error_files', 0)}")
                print(f"Total chunks: {stats.get('total_chunks', 0)}")
                print(f"Duration: {stats.get('duration_seconds', 0):.2f} seconds")
                print(f"Output: {output_filepath}")
            else:
                print(f"\nProcessing complete with unknown status.")
            
        except Exception as e:
            logger.error(f"Processing failed: {e}")
            sys.exit(1)
            
    else:
        logger.info(f"Starting NeuroGen Processor Server on {args.host}:{args.port}")
        
        if args.debug:
            logger.info("Debug mode enabled")        
        if structify_module:
            logger.info("Claude module available - PDF processing enabled")
            # Log detected capabilities
            capabilities = []
            if hasattr(structify_module, 'process_pdf'):
                capabilities.append("Direct PDF processing")
            if hasattr(structify_module, 'extract_tables_from_pdf'):
                capabilities.append("Table extraction")
            if hasattr(structify_module, 'detect_document_type'):
                capabilities.append("Document type detection")
            
            if capabilities:
                logger.info(f"Claude module capabilities: {', '.join(capabilities)}")
        else:
            logger.warning("Claude module not available - PDF processing capabilities will be limited")
        
        try:
            socketio.run(app, debug=args.debug, host=args.host, port=int(args.port))
        except Exception as e:
            logger.error(f"Server failed to start: {e}")
            sys.exit(1)