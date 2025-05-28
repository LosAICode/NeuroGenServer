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

def main():
    """Main entry point for CLI usage"""
    import argparse
    parser = argparse.ArgumentParser(description="Enhanced Claude file processor with parallel execution, PDF extraction, and custom tagging.")

    parser.add_argument("-i", "--input", default=DEFAULT_OUTPUT_PATH, help="Root directory for input files.")
    parser.add_argument("-o", "--output", default=os.path.join(DEFAULT_OUTPUT_FOLDER, "bulk_output.json"), help="Path to output JSON file.")
    parser.add_argument("--max-chunk-size", type=int, default=4096, help="Maximum chunk size in characters.")
    parser.add_argument("--threads", type=int, default=DEFAULT_NUM_THREADS, help="Number of threads to use for processing.")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode.")

    args = parser.parse_args()

    # Set up logging level based on debug flag
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Validate and adjust output file path
    output_filepath = get_output_filepath(args.output)

    # Log settings
    logger.info(f"Processing files from: {args.input}")
    logger.info(f"Output will be saved to: {output_filepath}")
    logger.info(f"Using {args.threads} threads and max chunk size of {args.max_chunk_size}")

    # Check if structify_module is available
    if not structify_available:
        logger.error("Claude module not available. Cannot process files.")
        sys.exit(1)

    # Process files
    result = structify_module.process_all_files(
        root_directory=args.input,
        output_file=output_filepath,
        max_chunk_size=args.max_chunk_size,
        executor_type="thread",
        max_workers=args.threads,
        stop_words=structify_module.DEFAULT_STOP_WORDS,
        use_cache=False,
        valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
        stats_only=False,
        include_binary_detection=True
    )
    
    logger.info(f"Processing completed. JSON output saved at: {output_filepath}")
    return result

def download_tessdata():
    """Download Tesseract language data if it doesn't exist"""
    tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        try:
            import requests
            logger.info("Downloading eng.traineddata...")
            url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
            r = requests.get(url, stream=True)
            r.raise_for_status()
            
            with open(eng_traineddata, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
            logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata}")
        except Exception as e:
            logger.error(f"Failed to download tessdata: {e}")

download_tessdata()

def ensure_tessdata_files():
    """Ensure tesseract language data files exist"""
    tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        source_path = r'C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata'
        if os.path.exists(source_path):
            try:
                import shutil
                shutil.copy2(source_path, eng_traineddata)
                logger.info(f"Copied eng.traineddata from {source_path} to {eng_traineddata}")
            except Exception as e:
                logger.warning(f"Failed to copy eng.traineddata: {e}")
                # Try to download if copy fails
                download_tessdata()
        else:
            # Try to download if source file doesn't exist
            download_tessdata()
    
    if os.path.exists(eng_traineddata):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata}")
    else:
        logger.warning(f"eng.traineddata not found at {eng_traineddata}")

ensure_tessdata_files()

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

def emit_enhanced_task_completion(task_id, task_type="generic", output_file=None, 
                                stats=None, details=None, performance_metrics=None):
    """
    Enhanced task completion emission with comprehensive stats showcase.
    Integrates with existing emit_task_completion while adding rich analytics.
    
    Args:
        task_id: Unique identifier for the task
        task_type: Type of task 
        output_file: Optional path to the output file
        stats: CustomFileStats object or dict with statistics
        details: Optional additional details
        performance_metrics: Optional performance analytics
    """
    try:
        # Start with existing payload structure
        payload = {
            'task_id': task_id,
            'task_type': task_type,
            'status': 'completed',
            'progress': 100,
            'message': f"{task_type.replace('_', ' ').title()} completed successfully",
            'timestamp': time.time()
        }
        
        # Include output file if provided
        if output_file:
            payload['output_file'] = output_file
            
        # Enhanced stats processing with CustomFileStats integration
        if stats:
            processed_stats = process_completion_stats(stats, task_type)
            payload['stats'] = processed_stats
            payload['summary'] = generate_stats_summary(processed_stats, task_type)
            
        # Include additional details
        if details:
            payload['details'] = details
            
        # Add performance metrics if available
        if performance_metrics:
            payload['performance'] = performance_metrics
            
        # Generate insights and recommendations
        payload['insights'] = generate_task_insights(payload)
        
        # Emit the enhanced completion event
        socketio.emit('task_completed', payload)
        
        # Also emit a specialized stats showcase event
        socketio.emit('task_stats_showcase', {
            'task_id': task_id,
            'task_type': task_type,
            'stats': payload.get('stats', {}),
            'summary': payload.get('summary', {}),
            'insights': payload.get('insights', {}),
            'timestamp': time.time()
        })
        
        logger.info(f"Emitted enhanced task completion for {task_id} with full stats")
        
    except Exception as e:
        logger.error(f"Error emitting enhanced task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(task_id, task_type, output_file, stats, details)


def process_completion_stats(stats, task_type):
    """
    Process CustomFileStats or dict stats into a comprehensive format.
    
    Args:
        stats: CustomFileStats object or dictionary
        task_type: Type of task for context
        
    Returns:
        Comprehensive stats dictionary
    """
    try:
        # Handle CustomFileStats objects
        if hasattr(stats, 'to_dict') and callable(stats.to_dict):
            base_stats = stats.to_dict()
        elif isinstance(stats, dict):
            base_stats = stats
        else:
            # Try to convert object to dict
            try:
                base_stats = stats.__dict__ if hasattr(stats, '__dict__') else {'raw_stats': str(stats)}
            except (AttributeError, TypeError):
                base_stats = {'raw_stats': str(stats)}
        
        # Enhance stats with calculated metrics
        enhanced_stats = {
            **base_stats,
            'completion_metrics': calculate_completion_metrics(base_stats),
            'performance_analysis': analyze_performance(base_stats),
            'file_type_breakdown': analyze_file_types(base_stats),
            'efficiency_metrics': calculate_efficiency_metrics(base_stats),
            'quality_indicators': assess_quality_indicators(base_stats)
        }
        
        # Add task-specific enhancements
        if task_type == 'file_processing':
            enhanced_stats['processing_insights'] = analyze_file_processing(base_stats)
        elif task_type == 'pdf_processing':
            enhanced_stats['pdf_insights'] = analyze_pdf_processing(base_stats)
        elif task_type == 'scraping':
            enhanced_stats['scraping_insights'] = analyze_scraping_performance(base_stats)
            
        return enhanced_stats
        
    except Exception as e:
        logger.error(f"Error processing completion stats: {e}")
        return stats if isinstance(stats, dict) else {'error': str(e)}


def calculate_completion_metrics(stats):
    """Calculate comprehensive completion metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        error_files = stats.get('error_files', 0)
        skipped_files = stats.get('skipped_files', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        
        metrics = {
            'completion_rate': round((processed_files / total_files * 100) if total_files > 0 else 0, 2),
            'error_rate': round((error_files / total_files * 100) if total_files > 0 else 0, 2),
            'skip_rate': round((skipped_files / total_files * 100) if total_files > 0 else 0, 2),
            'processing_speed': round((processed_files / duration) if duration > 0 else 0, 2),
            'throughput_mb_per_sec': round((stats.get('total_bytes', 0) / (1024*1024) / duration) if duration > 0 else 0, 2),
            'average_file_size_mb': round((stats.get('total_bytes', 0) / processed_files / (1024*1024)) if processed_files > 0 else 0, 2)
        }
        
        # Performance rating
        if metrics['completion_rate'] >= 95 and metrics['error_rate'] <= 5:
            metrics['performance_rating'] = 'Excellent'
        elif metrics['completion_rate'] >= 85 and metrics['error_rate'] <= 15:
            metrics['performance_rating'] = 'Good'
        elif metrics['completion_rate'] >= 70:
            metrics['performance_rating'] = 'Fair'
        else:
            metrics['performance_rating'] = 'Needs Improvement'
            
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating completion metrics: {e}")
        return {'error': str(e)}


def analyze_performance(stats):
    """Analyze performance characteristics."""
    try:
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        memory_peak = stats.get('peak_memory_usage_mb', 0)
        memory_avg = stats.get('avg_memory_usage_mb', 0)
        processing_rate = stats.get('current_processing_rate', 0)
        
        analysis = {
            'duration_formatted': format_duration(duration),
            'memory_efficiency': 'High' if memory_peak < 1000 else 'Medium' if memory_peak < 2000 else 'Low',
            'memory_stability': 'Stable' if abs(memory_peak - memory_avg) < memory_avg * 0.5 else 'Variable',
            'processing_consistency': analyze_processing_consistency(stats),
            'resource_utilization': {
                'peak_memory_mb': memory_peak,
                'avg_memory_mb': memory_avg,
                'memory_variance': round(abs(memory_peak - memory_avg), 2),
                'processing_rate_files_per_sec': round(processing_rate, 2)
            }
        }
        
        # Performance recommendations
        recommendations = []
        if memory_peak > 2000:
            recommendations.append("Consider processing smaller batches to reduce memory usage")
        if processing_rate < 1:
            recommendations.append("Processing speed could be improved with optimization")
        if stats.get('error_rate_percent', 0) > 10:
            recommendations.append("High error rate - check input data quality")
            
        analysis['recommendations'] = recommendations
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing performance: {e}")
        return {'error': str(e)}


def analyze_file_types(stats):
    """Analyze file type distribution and processing success."""
    try:
        breakdown = {
            'total_file_types': 0,
            'most_common_type': 'N/A',
            'type_distribution': {},
            'success_by_type': {},
            'pdf_analysis': {}
        }
        
        # Extract file type information from speed profile if available
        speed_profile = stats.get('speed_profile', {})
        if 'extension_breakdown' in speed_profile:
            breakdown['type_distribution'] = speed_profile['extension_breakdown']
            breakdown['total_file_types'] = len(breakdown['type_distribution'])
            
            if breakdown['type_distribution']:
                breakdown['most_common_type'] = max(
                    breakdown['type_distribution'], 
                    key=breakdown['type_distribution'].get
                )
        
        # Error rates by extension
        if 'error_rates_by_extension' in speed_profile:
            breakdown['success_by_type'] = {
                ext: round(100 - rate, 2) 
                for ext, rate in speed_profile['error_rates_by_extension'].items()
            }
        
        # PDF-specific analysis
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            breakdown['pdf_analysis'] = {
                'total_pdfs': pdf_files,
                'tables_extracted': stats.get('tables_extracted', 0),
                'references_extracted': stats.get('references_extracted', 0),
                'ocr_processed': stats.get('ocr_processed_files', 0),
                'scanned_pages': stats.get('scanned_pages_processed', 0),
                'avg_tables_per_pdf': round(stats.get('tables_extracted', 0) / pdf_files, 2),
                'ocr_usage_rate': round(stats.get('ocr_processed_files', 0) / pdf_files * 100, 2)
            }
        
        return breakdown
        
    except Exception as e:
        logger.error(f"Error analyzing file types: {e}")
        return {'error': str(e)}


def calculate_efficiency_metrics(stats):
    """Calculate efficiency and optimization metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        total_bytes = stats.get('total_bytes', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        chunks = stats.get('total_chunks', 0)
        
        metrics = {
            'files_per_minute': round((processed_files / duration * 60) if duration > 0 else 0, 2),
            'mb_per_minute': round((total_bytes / (1024*1024) / duration * 60) if duration > 0 else 0, 2),
            'chunks_per_file': round((chunks / processed_files) if processed_files > 0 else 0, 2),
            'bytes_per_second': round((total_bytes / duration) if duration > 0 else 0, 2),
            'efficiency_score': 0
        }
        
        # Calculate efficiency score (0-100)
        completion_rate = (processed_files / total_files * 100) if total_files > 0 else 0
        error_rate = stats.get('error_rate_percent', 0)
        speed_factor = min(metrics['files_per_minute'] / 10, 10) * 10  # Normalize speed component
        
        metrics['efficiency_score'] = round(
            (completion_rate * 0.4) + 
            ((100 - error_rate) * 0.3) + 
            (speed_factor * 0.3), 2
        )
        
        # Efficiency grade
        if metrics['efficiency_score'] >= 90:
            metrics['efficiency_grade'] = 'A+'
        elif metrics['efficiency_score'] >= 80:
            metrics['efficiency_grade'] = 'A'
        elif metrics['efficiency_score'] >= 70:
            metrics['efficiency_grade'] = 'B'
        elif metrics['efficiency_score'] >= 60:
            metrics['efficiency_grade'] = 'C'
        else:
            metrics['efficiency_grade'] = 'D'
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating efficiency metrics: {e}")
        return {'error': str(e)}


def assess_quality_indicators(stats):
    """Assess quality indicators for the processing task."""
    try:
        indicators = {
            'data_integrity': 'Good',  # Default assumption
            'processing_reliability': 'High',
            'output_quality': 'Standard',
            'quality_score': 0,
            'quality_flags': []
        }
        
        error_rate = stats.get('error_rate_percent', 0)
        success_rate = stats.get('success_rate_percent', 0)
        
        # Assess data integrity
        if error_rate < 5:
            indicators['data_integrity'] = 'Excellent'
        elif error_rate < 15:
            indicators['data_integrity'] = 'Good'
        elif error_rate < 30:
            indicators['data_integrity'] = 'Fair'
        else:
            indicators['data_integrity'] = 'Poor'
            indicators['quality_flags'].append('High error rate detected')
        
        # Assess processing reliability
        if success_rate > 95:
            indicators['processing_reliability'] = 'Very High'
        elif success_rate > 85:
            indicators['processing_reliability'] = 'High'
        elif success_rate > 70:
            indicators['processing_reliability'] = 'Medium'
        else:
            indicators['processing_reliability'] = 'Low'
            indicators['quality_flags'].append('Low success rate')
        
        # Check for quality flags
        if stats.get('skipped_files', 0) > stats.get('total_files', 0) * 0.2:
            indicators['quality_flags'].append('High skip rate - check file compatibility')
            
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 100:
            indicators['quality_flags'].append(f'Large file processed: {largest_file_mb:.1f}MB')
        
        # Calculate overall quality score
        base_score = success_rate
        penalty = len(indicators['quality_flags']) * 5
        indicators['quality_score'] = max(0, round(base_score - penalty, 2))
        
        return indicators
        
    except Exception as e:
        logger.error(f"Error assessing quality indicators: {e}")
        return {'error': str(e)}


def analyze_file_processing(stats):
    """Analyze file processing specific insights."""
    try:
        insights = {
            'processing_pattern': 'Standard',
            'optimization_opportunities': [],
            'file_handling_efficiency': 'Good'
        }
        
        # Analyze processing patterns
        avg_file_size = stats.get('average_file_size', 0)
        if avg_file_size > 10 * 1024 * 1024:  # > 10MB
            insights['processing_pattern'] = 'Large File Processing'
            insights['optimization_opportunities'].append('Consider streaming for large files')
        elif avg_file_size < 1024:  # < 1KB
            insights['processing_pattern'] = 'Small File Processing'
            insights['optimization_opportunities'].append('Batch processing could improve efficiency')
        
        # Check chunk efficiency
        chunks_per_file = stats.get('total_chunks', 0) / max(stats.get('processed_files', 1), 1)
        if chunks_per_file > 20:
            insights['optimization_opportunities'].append('Many chunks per file - consider larger chunk sizes')
        elif chunks_per_file < 2:
            insights['optimization_opportunities'].append('Few chunks per file - files might be very small')
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing file processing: {e}")
        return {'error': str(e)}


def analyze_pdf_processing(stats):
    """Analyze PDF processing specific insights."""
    try:
        insights = {
            'pdf_complexity': 'Standard',
            'extraction_success': 'Good',
            'ocr_efficiency': 'N/A'
        }
        
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            tables_per_pdf = stats.get('tables_extracted', 0) / pdf_files
            refs_per_pdf = stats.get('references_extracted', 0) / pdf_files
            ocr_rate = stats.get('ocr_processed_files', 0) / pdf_files * 100
            
            # Assess PDF complexity
            if tables_per_pdf > 5 or refs_per_pdf > 50:
                insights['pdf_complexity'] = 'High - Rich content documents'
            elif tables_per_pdf > 2 or refs_per_pdf > 20:
                insights['pdf_complexity'] = 'Medium - Standard academic/business documents'
            else:
                insights['pdf_complexity'] = 'Low - Simple text documents'
            
            # Assess extraction success
            if tables_per_pdf > 3 and refs_per_pdf > 30:
                insights['extraction_success'] = 'Excellent - Rich data extracted'
            elif tables_per_pdf > 1 or refs_per_pdf > 10:
                insights['extraction_success'] = 'Good - Moderate extraction'
            else:
                insights['extraction_success'] = 'Basic - Limited structured content'
            
            # OCR efficiency
            if ocr_rate > 50:
                insights['ocr_efficiency'] = 'High OCR usage - Many scanned documents'
            elif ocr_rate > 20:
                insights['ocr_efficiency'] = 'Moderate OCR usage'
            elif ocr_rate > 0:
                insights['ocr_efficiency'] = 'Low OCR usage - Mostly digital PDFs'
            else:
                insights['ocr_efficiency'] = 'No OCR needed - All digital content'
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing PDF processing: {e}")
        return {'error': str(e)}


def analyze_scraping_performance(stats):
    """Analyze web scraping specific insights."""
    try:
        insights = {
            'scraping_efficiency': 'Standard',
            'download_performance': 'Good',
            'content_extraction': 'Standard'
        }
        
        # Add scraping-specific analysis based on available stats
        # This would be expanded based on scraping-specific metrics
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing scraping performance: {e}")
        return {'error': str(e)}


def analyze_processing_consistency(stats):
    """Analyze consistency of processing performance."""
    try:
        current_rate = stats.get('current_processing_rate', 0)
        avg_rate = stats.get('files_per_second', 0)
        
        if abs(current_rate - avg_rate) < avg_rate * 0.2:
            return 'Very Consistent'
        elif abs(current_rate - avg_rate) < avg_rate * 0.5:
            return 'Consistent'
        else:
            return 'Variable'
            
    except Exception:
        return 'Unknown'


def generate_stats_summary(stats, task_type):
    """Generate a human-readable summary of the stats."""
    try:
        completion_metrics = stats.get('completion_metrics', {})
        performance_analysis = stats.get('performance_analysis', {})
        efficiency_metrics = stats.get('efficiency_metrics', {})
        
        summary = {
            'headline': generate_headline_summary(stats, task_type),
            'key_metrics': {
                'files_processed': stats.get('processed_files', 0),
                'success_rate': f"{completion_metrics.get('completion_rate', 0)}%",
                'duration': performance_analysis.get('duration_formatted', 'Unknown'),
                'efficiency_grade': efficiency_metrics.get('efficiency_grade', 'N/A')
            },
            'highlights': generate_highlights(stats),
            'areas_for_improvement': generate_improvement_areas(stats)
        }
        
        return summary
        
    except Exception as e:
        logger.error(f"Error generating stats summary: {e}")
        return {'error': str(e)}


def generate_headline_summary(stats, task_type):
    """Generate a compelling headline summary."""
    try:
        processed = stats.get('processed_files', 0)
        total = stats.get('total_files', 0)
        duration = stats.get('duration_seconds', 0)
        
        if total > 0:
            success_rate = round((processed / total) * 100, 1)
            if success_rate >= 95:
                performance_word = "successfully"
            elif success_rate >= 80:
                performance_word = "efficiently"
            else:
                performance_word = "partially"
        else:
            performance_word = "completed"
            
        return f"{task_type.replace('_', ' ').title()} {performance_word} processed {processed} files in {format_duration(duration)}"
        
    except Exception:
        return f"{task_type.replace('_', ' ').title()} completed"


def generate_highlights(stats):
    """Generate key highlights from the processing."""
    highlights = []
    
    try:
        # Performance highlights
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['A+', 'A']:
            highlights.append(f"Excellent efficiency rating: {efficiency_grade}")
        
        # Processing speed highlights
        speed = stats.get('efficiency_metrics', {}).get('files_per_minute', 0)
        if speed > 60:
            highlights.append(f"High processing speed: {speed} files/minute")
        
        # PDF processing highlights
        pdf_files = stats.get('pdf_files', 0)
        tables = stats.get('tables_extracted', 0)
        if pdf_files > 0 and tables > 0:
            highlights.append(f"Extracted {tables} tables from {pdf_files} PDF files")
        
        # Memory efficiency highlights
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'High':
            highlights.append("Efficient memory usage maintained")
        
        # Large file handling
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 50:
            highlights.append(f"Successfully processed large file: {largest_file_mb:.1f}MB")
            
    except Exception as e:
        logger.debug(f"Error generating highlights: {e}")
    
    return highlights[:5]  # Limit to top 5 highlights


def generate_improvement_areas(stats):
    """Generate areas for improvement based on stats."""
    improvements = []
    
    try:
        # Error rate improvements
        error_rate = stats.get('completion_metrics', {}).get('error_rate', 0)
        if error_rate > 10:
            improvements.append(f"Reduce error rate from {error_rate}%")
        
        # Speed improvements
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['C', 'D']:
            improvements.append("Optimize processing speed")
        
        # Memory improvements
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'Low':
            improvements.append("Optimize memory usage")
        
        # Quality improvements
        quality_flags = stats.get('quality_indicators', {}).get('quality_flags', [])
        if quality_flags:
            improvements.extend(quality_flags[:2])  # Add top 2 quality issues
            
    except Exception as e:
        logger.debug(f"Error generating improvement areas: {e}")
    
    return improvements[:3]  # Limit to top 3 improvements


def generate_task_insights(payload):
    """Generate actionable insights from task completion data."""
    try:
        stats = payload.get('stats', {})
        task_type = payload.get('task_type', 'unknown')
        
        insights = {
            'performance_insights': [],
            'optimization_recommendations': [],
            'next_steps': [],
            'comparative_analysis': {}
        }
        
        # Performance insights
        completion_rate = stats.get('completion_metrics', {}).get('completion_rate', 0)
        if completion_rate == 100:
            insights['performance_insights'].append("Perfect completion rate achieved")
        elif completion_rate >= 95:
            insights['performance_insights'].append("Excellent completion rate with minimal failures")
        elif completion_rate >= 80:
            insights['performance_insights'].append("Good completion rate with room for improvement")
        else:
            insights['performance_insights'].append("Completion rate needs attention")
        
        # Processing efficiency insights
        efficiency_score = stats.get('efficiency_metrics', {}).get('efficiency_score', 0)
        if efficiency_score >= 90:
            insights['performance_insights'].append("Outstanding processing efficiency")
        elif efficiency_score >= 70:
            insights['performance_insights'].append("Good processing efficiency")
        else:
            insights['performance_insights'].append("Processing efficiency could be improved")
        
        # Optimization recommendations
        recommendations = stats.get('performance_analysis', {}).get('recommendations', [])
        insights['optimization_recommendations'].extend(recommendations)
        
        # Task-specific recommendations
        if task_type == 'file_processing':
            file_insights = stats.get('processing_insights', {})
            insights['optimization_recommendations'].extend(
                file_insights.get('optimization_opportunities', [])
            )
        
        # Next steps based on results
        error_files = stats.get('error_files', 0)
        if error_files > 0:
            insights['next_steps'].append(f"Review {error_files} failed files for common issues")
        
        output_file = payload.get('output_file')
        if output_file:
            insights['next_steps'].append(f"Review results in {os.path.basename(output_file)}")
        
        # Comparative analysis (placeholder for future enhancement)
        insights['comparative_analysis'] = {
            'vs_previous_runs': 'No comparison data available',
            'vs_benchmarks': 'Establishing baseline performance'
        }
        
        return insights
        
    except Exception as e:
        logger.error(f"Error generating task insights: {e}")
        return {'error': str(e)}


def format_duration(seconds):
    """Format duration in a human-readable way."""
    try:
        if seconds < 60:
            return f"{seconds:.1f} seconds"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"
    except Exception:
        return "Unknown duration"


# ----------------------------------------------------------------------------
# Integration with Existing Task Classes
# ----------------------------------------------------------------------------

def enhance_processing_task_completion(task):
    """
    Enhance ProcessingTask completion with rich stats.
    Call this in ProcessingTask completion logic.
    
    Args:
        task: ProcessingTask instance with stats
    """
    try:
        # Finalize stats
        if hasattr(task, 'stats') and hasattr(task.stats, 'finish_processing'):
            task.stats.finish_processing()
        
        # Generate performance metrics
        performance_metrics = {
            'memory_profile': getattr(task.stats, 'get_memory_profile', lambda: {})(),
            'speed_profile': getattr(task.stats, 'get_processing_speed_profile', lambda: {})(),
            'task_duration': time.time() - getattr(task, 'start_time', time.time()),
            'peak_memory_usage': getattr(task.stats, 'peak_memory_usage', 0)
        }
        
        # Emit enhanced completion
        emit_enhanced_task_completion(
            task_id=task.task_id,
            task_type=getattr(task, 'task_type', 'file_processing'),
            output_file=getattr(task, 'output_file', None),
            stats=task.stats,
            performance_metrics=performance_metrics
        )
        
    except Exception as e:
        logger.error(f"Error enhancing task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(
            task.task_id, 
            getattr(task, 'task_type', 'file_processing'),
            getattr(task, 'output_file', None),
            getattr(task, 'stats', None)
        )


# ----------------------------------------------------------------------------
# Frontend Integration Endpoints
# ----------------------------------------------------------------------------

@app.route("/api/task/<task_id>/stats", methods=["GET"])
def get_task_stats(task_id):
    """
    API endpoint to retrieve detailed task statistics.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON response with detailed task statistics
    """
    try:
        task = get_task(task_id)
        if not task:
            return structured_error_response(
                "TASK_NOT_FOUND", 
                f"Task {task_id} not found", 
                404
            )
        
        # Get basic task info
        task_info = {
            'task_id': task_id,
            'task_type': task.get('type', 'unknown'),
            'status': task.get('status', 'unknown'),
            'start_time': task.get('start_time'),
            'end_time': task.get('end_time')
        }
        
        # Get enhanced stats if available
        stats = None
        if hasattr(task, 'stats'):
            stats = process_completion_stats(task.stats, task_info['task_type'])
        elif 'stats' in task:
            stats = process_completion_stats(task['stats'], task_info['task_type'])
        
        response = {
            'task_info': task_info,
            'stats': stats,
            'summary': generate_stats_summary(stats, task_info['task_type']) if stats else None,
            'insights': generate_task_insights({'stats': stats, 'task_type': task_info['task_type']}) if stats else None
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error retrieving task stats for {task_id}: {e}")
        return structured_error_response(
            "STATS_RETRIEVAL_ERROR",
            f"Error retrieving stats: {str(e)}",
            500
        )


@app.route("/api/task/<task_id>/stats/export", methods=["GET"])
def export_task_stats(task_id):
    """
    Export detailed task statistics as downloadable JSON.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON file download with comprehensive stats
    """
    try:
        # Get comprehensive stats
        response = get_task_stats(task_id)
        if response.status_code != 200:
            return response
        
        stats_data = response.get_json()
        
        # Add export metadata
        export_data = {
            'export_info': {
                'exported_at': datetime.now().isoformat(),
                'export_version': '1.0',
                'task_id': task_id
            },
            **stats_data
        }
        
        # Create response with download headers
        json_output = json.dumps(export_data, indent=2, ensure_ascii=False)
        
        response = Response(
            json_output,
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename=task_{task_id}_stats.json',
                'Content-Type': 'application/json; charset=utf-8'
            }
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting task stats for {task_id}: {e}")
        return structured_error_response(
            "EXPORT_ERROR",
            f"Error exporting stats: {str(e)}",
            500
        )


# ----------------------------------------------------------------------------
# Task History and Analytics
# ----------------------------------------------------------------------------

# Global task history storage (in production, use a database)
task_history = []
task_history_lock = threading.Lock()

def add_task_to_history(task_id, task_type, stats, output_file=None):
    """
    Add completed task to history for analytics.
    
    Args:
        task_id: Task identifier
        task_type: Type of task
        stats: Task statistics
        output_file: Output file path if applicable
    """
    try:
        with task_history_lock:
            # Process stats for storage
            processed_stats = process_completion_stats(stats, task_type) if stats else {}
            
            history_entry = {
                'task_id': task_id,
                'task_type': task_type,
                'completed_at': datetime.now().isoformat(),
                'output_file': output_file,
                'stats': processed_stats,
                'summary': generate_stats_summary(processed_stats, task_type)
            }
            
            task_history.append(history_entry)
            
            # Keep only last 100 entries (in memory)
            if len(task_history) > 100:
                task_history.pop(0)
                
            logger.info(f"Added task {task_id} to history")
            
    except Exception as e:
        logger.error(f"Error adding task to history: {e}")


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


@app.route("/api/open-file", methods=["POST"])
def open_arbitrary_file():
    """Open any file by path (for recent tasks history)."""
    data = request.json or {}
    file_path = data.get("path")
    
    if not file_path:
        return structured_error_response("PATH_REQUIRED", "File path is required.", 400)
    
    if not os.path.exists(file_path):
        return structured_error_response("FILE_NOT_FOUND", "File not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(file_path)
        else:
            try:
                subprocess.run(["xdg-open", file_path], check=False)
            except Exception:
                subprocess.run(["open", file_path], check=False)
                
        return jsonify({"success": True, "message": "File opened locally."})
    except Exception as e:
        logger.exception(f"Error opening file {file_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open file: {e}", 400)

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
    try:
        # CRITICAL: Check force cancellation first
        if is_force_cancelled(self.task_id if hasattr(self, 'task_id') else None):
            logger.warning(f"Task {getattr(self, 'task_id', 'unknown')} force cancelled")
            return True
        
    Internal method for ProcessingTask to check its own cancellation status.
    This avoids the need to go through the global check_task_cancellation function.
    
    Returns:
        bool: True if task should be cancelled
    """
    try:
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


# ============================================================================
# UPDATED STRUCTIFY PROGRESS CALLBACK
# ============================================================================
# Replace the progress callback in ProcessingTask with this corrected version

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
                    except:
                        pass
                
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
        socketio.emit('all_tasks_cancelled', {
            'reason': 'Force cancellation due to system issue',
            'count': cancelled_count,
            'timestamp': time.time()
        })
    except:
        pass
    
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
# Task Execution Wrapper with Cancellation Support
# ----------------------------------------------------------------------------

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
    try:
        # Pre-execution cancellation check
        if check_task_cancellation(task_id):
            logger.info(f"[TASK] {task_id} cancelled before execution")
            return None
        
        logger.info(f"[TASK] Starting execution of {task_id}")
        
        # Execute the task with cancellation support
        result = task_func(task_id, *args, **kwargs)
        
        # Post-execution state management
        if not check_task_cancellation(task_id):
            with tasks_lock:
                task = active_tasks.get(task_id)
                if task and task.get('status') not in ['cancelled', 'failed']:
                    task.update({
                        'status': 'completed',
                        'end_time': time.time()
                    })
            
            emit_task_completion(task_id, task.get('type', 'unknown'))
            logger.info(f"[TASK] {task_id} completed successfully")
        
        return result
        
    except Exception as e:
        logger.exception(f"[TASK] {task_id} execution failed: {str(e)}")
        
        # Update task state on failure
        with tasks_lock:
            task = active_tasks.get(task_id)
            if task:
                task.update({
                    'status': 'failed',
                    'error': str(e),
                    'end_time': time.time()
                })
        
        emit_task_error(task_id, str(e))
        raise
    
    finally:
        # Schedule cleanup with delay for status queries
        schedule_task_cleanup(task_id, delay=30)


def schedule_task_cleanup(task_id: str, delay: int = 30) -> None:
    """
    Schedule task cleanup after a delay to allow final status queries.
    Non-blocking cleanup prevents resource leaks.
    
    Args:
        task_id: The task ID to clean up
        delay: Delay in seconds before cleanup
    """
    def cleanup_worker():
        try:
            time.sleep(delay)
            remove_task(task_id)
            logger.debug(f"[CLEANUP] Removed task {task_id} from active_tasks")
        except Exception as e:
            logger.error(f"[CLEANUP] Error removing task {task_id}: {e}")
    
    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()


# ----------------------------------------------------------------------------
# Enhanced Task Loop Patterns
# ----------------------------------------------------------------------------

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
    total_items = len(work_items) if hasattr(work_items, '__len__') else None
    processed_count = 0
    
    for item in work_items:
        # Check cancellation before processing each item
        if check_task_cancellation(task_id):
            logger.info(f"[TASK] {task_id} loop cancelled at item {processed_count}")
            return
        
        try:
            # Process the item
            if progress_callback:
                result = progress_callback(item)
            else:
                result = item
            
            processed_count += 1
            
            # Emit progress update
            if total_items:
                progress_percent = (processed_count / total_items) * 100
                emit_progress_update(
                    task_id, 
                    progress_percent, 
                    message=f"Processed {processed_count}/{total_items} items"
                )
            
            yield result
            
        except Exception as e:
            logger.error(f"[TASK] {task_id} error processing item {processed_count}: {e}")
            # Continue processing other items unless critically failed
            continue


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
def open_folder():
    """Open a folder in the operating system's file explorer."""
    data = request.json or {}
    folder_path = data.get("path")
    
    if not folder_path:
        return structured_error_response("PATH_REQUIRED", "Folder path is required.", 400)
    
    if not os.path.exists(folder_path):
        return structured_error_response("FOLDER_NOT_FOUND", "Folder not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(folder_path)
        else:
            try:
                subprocess.run(["xdg-open", folder_path], check=False)
            except Exception:
                subprocess.run(["open", folder_path], check=False)
                
        return jsonify({"success": True, "message": "Folder opened locally."})
    except Exception as e:
        logger.exception(f"Error opening folder {folder_path}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open folder: {e}", 400)
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