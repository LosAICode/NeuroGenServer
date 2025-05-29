"""
File Processor Blueprint
Handles all file processing related routes and functionality
"""

from flask import Blueprint, request, jsonify, send_file, current_app
from flask_socketio import emit
import os
import logging
import tempfile
import uuid
import threading
import time
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from blueprints.api.management import register_task, update_task_progress, complete_task
from blueprints.core.utils import ensure_temp_directory
from blueprints.core.services import ProcessingTask

logger = logging.getLogger(__name__)

# Constants - fallback values in case import from structify fails
DEFAULT_MAX_CHUNK_SIZE = 4096
DEFAULT_CHUNK_OVERLAP = 200
DEFAULT_STOP_WORDS = set(["the", "and", "or", "for", "a", "an", "of", "in", "to", "from",
    "on", "at", "by", "this", "is", "are", "were", "was", "be", "as",
    "it", "that", "these", "those", "with", "can", "if", "not", "no",
    "your", "you", "i", "am", "our", "we", "they", "their", "me",
    "have", "has", "had", "also", "too", "very", "up", "out", "about",
    "so", "some", "any", "my", "his", "her", "he", "she", "when", "where",
    "what", "who", "why", "how", "which", "than", "then", "them", "but"])
DEFAULT_VALID_EXTENSIONS = [".py", ".html", ".css", ".yaml", ".yml",
    ".txt", ".md", ".js", ".gitignore", ".ts",
    ".json", ".csv", ".rtf", ".pdf", ".docx",
    ".pptx", ".xlsx", ".xml", ".sh", ".bat",
    ".java", ".c", ".cpp", ".h", ".cs", ".php",
    ".rb", ".go", ".rs", ".swift"]
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
DEFAULT_PROCESS_TIMEOUT = 600  # seconds
DEFAULT_MEMORY_LIMIT = 1024 * 1024 * 1024  # 1GB
CACHE_FILE = "file_cache.json"
DEFAULT_OUTPUT_FOLDER = "downloads"

# Define FileStats class for compatibility
class FileStats:
    def __init__(self):
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.total_files = 0
        self.total_chunks = 0
        self.pdf_files = 0
        self.tables_extracted = 0
        self.references_extracted = 0
        self.scanned_pages_processed = 0
        self.ocr_processed_files = 0
    
    def to_dict(self):
        return {
            'processed_files': self.processed_files,
            'skipped_files': self.skipped_files,
            'error_files': self.error_files,
            'total_files': self.total_files,
            'total_chunks': self.total_chunks,
            'pdf_files': self.pdf_files,
            'tables_extracted': self.tables_extracted,
            'references_extracted': self.references_extracted,
            'scanned_pages_processed': self.scanned_pages_processed,
            'ocr_processed_files': self.ocr_processed_files
        }

# Create the blueprint
file_processor_bp = Blueprint('file_processor', __name__, url_prefix='/api')

def process_all_files(
    root_directory: str,
    output_file: str,
    max_chunk_size: int = DEFAULT_MAX_CHUNK_SIZE,
    executor_type: str = "thread",
    max_workers: Optional[int] = None,
    stop_words: Set[str] = DEFAULT_STOP_WORDS,
    use_cache: bool = False,
    valid_extensions: List[str] = DEFAULT_VALID_EXTENSIONS,
    ignore_dirs: str = "venv,node_modules,.git,__pycache__,dist,build",
    stats_only: bool = False,
    include_binary_detection: bool = True,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
    max_file_size: int = MAX_FILE_SIZE,
    timeout: int = DEFAULT_PROCESS_TIMEOUT,
    memory_limit: int = DEFAULT_MEMORY_LIMIT,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    stats_obj: Optional[FileStats] = None,
    file_filter: Optional[Callable[[str], bool]] = None,
    log_level: int = logging.INFO,
    log_file: Optional[str] = None,
    error_on_empty: bool = False,
    include_failed_files: bool = False
) -> Dict[str, Any]:
    """
    Process all files in the root_directory with enhanced PDF handling and error recovery.
    
    Args:
        root_directory: Base directory to process
        output_file: Path to output JSON file
        max_chunk_size: Maximum size of text chunks
        executor_type: Type of executor ("thread", "process", or "none")
        max_workers: Maximum number of worker threads/processes
        stop_words: Set of words to ignore in tag generation
        use_cache: Whether to use file caching
        valid_extensions: List of file extensions to process
        ignore_dirs: Comma-separated list of directories to ignore
        stats_only: Whether to only generate statistics
        include_binary_detection: Whether to detect and skip binary files
        overlap: Number of characters to overlap between chunks
        max_file_size: Maximum file size to process
        timeout: Maximum processing time per file in seconds
        memory_limit: Maximum memory usage before forcing garbage collection
        progress_callback: Optional callback for progress reporting
        stats_obj: Optional statistics object to use
        file_filter: Optional function to filter files
        log_level: Logging level
        log_file: Optional log file path
        error_on_empty: Whether to error if no files are found
        include_failed_files: Whether to include details of failed files in output
        
    Returns:
        Dictionary with statistics and processed data
    """
    # Setup logging with specified options
    global logger
    logger = setup_logging(log_level, log_file)
    
    start_time = time.time()
    stats = stats_obj if stats_obj else FileStats()
    
    # Create list of directories to ignore
    ig_list = [d.strip() for d in ignore_dirs.split(",") if d.strip()]
    rroot = Path(root_directory)
    
    # Track performance metrics
    discovery_start = time.time()
    
    # Find all files matching extensions
    all_files = []
    skipped_during_discovery = []
    try:
        for p in rroot.rglob("*"):
            # Skip ignored directories
            if any(ig in p.parts for ig in ig_list):
                continue
                
            # Only process files that match extensions
            if p.is_file() and any(p.suffix.lower() == ext.lower() for ext in valid_extensions):
                # Apply custom filter if provided
                if file_filter and not file_filter(str(p)):
                    continue
                
                # Skip files that are too large (except PDFs)
                try:
                    size = p.stat().st_size
                    if size > max_file_size and not p.suffix.lower() == '.pdf':
                        logger.info(f"Skipping large file during discovery: {p} ({size} bytes)")
                        skipped_during_discovery.append({
                            "file_path": str(p),
                            "size": size,
                            "reason": "file_too_large"
                        })
                        continue
                except OSError as e:
                    # Log error but continue processing other files
                    logger.warning(f"Error accessing file {p}: {e}")
                    skipped_during_discovery.append({
                        "file_path": str(p),
                        "reason": f"access_error: {str(e)}"
                    })
                    continue
                
                all_files.append(p)
    except Exception as e:
        logger.error(f"Error during file discovery: {e}", exc_info=True)
        return {
            "stats": stats.to_dict(),
            "data": {},
            "error": str(e),
            "skipped_files": skipped_during_discovery,
            "status": "failed"
        }

    discovery_time = time.time() - discovery_start
    logger.info(f"Found {len(all_files)} valid files in {root_directory} ({discovery_time:.2f}s)")
    
    # Check if any files were found
    if not all_files:
        message = f"No files found in {root_directory} matching the provided criteria"
        if error_on_empty:
            logger.error(message)
            return {
                "stats": stats.to_dict(),
                "data": {},
                "error": message,
                "skipped_files": skipped_during_discovery,
                "status": "failed"
            }
        else:
            logger.warning(message)
            return {
                "stats": stats.to_dict(),
                "data": {},
                "message": message,
                "skipped_files": skipped_during_discovery,
                "status": "completed"
            }
    
    if progress_callback:
        progress_callback(0, len(all_files), "discovery")

    # Load cache if enabled
    processed_cache = {}
    
    # FIX: Properly extract the directory part of the output_file
    # Use os.path.dirname to get just the directory part without any file components
    output_dir = os.path.dirname(output_file)
    # If output_dir is empty (meaning output_file is just a filename with no directory part),
    # use the current directory
    if not output_dir:
        output_dir = "."
    
    cache_path = os.path.join(output_dir, CACHE_FILE)
    
    if use_cache:
        if os.path.isfile(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as c:
                    processed_cache = json.load(c)
                logger.info(f"Loaded cache with {len(processed_cache)} entries")
            except Exception as e:
                logger.warning(f"Cache load error: {e}")

    # Filter files that need processing
    to_process = []
    for fpath in all_files:
        sp = str(fpath)
        
        # Skip unchanged files if they're in cache
        if use_cache and sp in processed_cache:
            try:
                mtime = fpath.stat().st_mtime
                old = processed_cache[sp].get("mod_time", 0)
                if old >= mtime:
                    stats.skipped_files += 1
                    logger.debug(f"Skipping unchanged file: {sp}")
                    continue
            except OSError as e:
                # If stat fails, process the file anyway
                logger.debug(f"Could not stat file {sp}, will process anyway: {e}")
                
        to_process.append(fpath)

    if not to_process:
        logger.info("No new or modified files to process.")
        return {
            "stats": stats.to_dict(),
            "data": {},
            "message": "No new or modified files to process",
            "skipped_files": skipped_during_discovery,
            "status": "completed"
        }

    # Determine optimal number of workers
    if max_workers is None:
        import multiprocessing
        cpunum = multiprocessing.cpu_count()
        if executor_type == "process":
            max_workers = max(1, cpunum - 1)
        else:
            max_workers = min(32, cpunum * 2)

    logger.info(f"Using {executor_type} executor with max_workers={max_workers}")

    # Track errors and processing failures
    processing_failures = []

    # Process files in batches
    processing_start = time.time()
    
    # Determine batch size based on file count
    batch_size = 100
    if len(to_process) <= 100:
        batch_size = 20
    elif len(to_process) <= 500:
        batch_size = 50
    elif len(to_process) <= 2000:
        batch_size = 100
    else:
        batch_size = 200
    
    # Enhanced data structure with additional metadata
    all_data = {}
    
    # Process in batches to manage memory usage
    for i in range(0, len(to_process), batch_size):
        batch = to_process[i:i+batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(to_process) + batch_size - 1) // batch_size
        logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} files)")
        
        results = []
        
        # Different processing strategies based on executor type
        if executor_type == "none":
            # Sequential processing
            for p in batch:
                # Special handling for PDFs
                if str(p).lower().endswith('.pdf'):
                    result = process_pdf_safely(str(p), root_directory, stats, max_chunk_size)
                    if result:
                        results.append((p, result))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(p),
                            "reason": "pdf_processing_failed"
                        })
                else:
                    # Standard processing for non-PDF files
                    r = safe_process(
                        p, root_directory, max_chunk_size, stop_words, 
                        include_binary_detection, stats, overlap, max_file_size, 
                        timeout, progress_callback
                    )
                    if r:
                        results.append((p, r))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(p),
                            "reason": "processing_failed"
                        })
                
                # Check memory usage and trigger garbage collection if needed
                try:
                    import psutil
                    process = psutil.Process()
                    memory_info = process.memory_info()
                    if memory_info.rss > memory_limit:
                        logger.warning(f"Memory usage ({memory_info.rss / 1024 / 1024:.1f} MB) exceeded limit. Triggering GC.")
                        import gc
                        gc.collect()
                except ImportError:
                    pass  # psutil not available
        else:
            # Parallel processing
            Exec = ThreadPoolExecutor if executor_type == "thread" else ProcessPoolExecutor
            with Exec(max_workers=max_workers) as ex:
                # Submit all tasks with special handling for PDFs
                fut_map = {}
                for p in batch:
                    if str(p).lower().endswith('.pdf'):
                        # Submit PDF processing task
                        fut = ex.submit(
                            process_pdf_safely,
                            str(p),
                            root_directory,
                            stats,
                            max_chunk_size
                        )
                    else:
                        # Submit standard file processing task
                        fut = ex.submit(
                            safe_process, 
                            p, 
                            root_directory, 
                            max_chunk_size, 
                            stop_words, 
                            include_binary_detection, 
                            stats,
                            overlap,
                            max_file_size,
                            timeout,
                            progress_callback
                        )
                    fut_map[fut] = p
                
                # Process results as they complete
                for fut in as_completed(fut_map):
                    pth = fut_map[fut]
                    out = fut.result()
                    if out:
                        results.append((pth, out))
                    else:
                        # Track processing failure
                        processing_failures.append({
                            "file_path": str(pth),
                            "reason": "processing_failed"
                        })

        # Aggregate results into the output data structure
        for pth, (lib, docs) in results:
            if lib not in all_data:
                all_data[lib] = {
                    "docs_data": [],
                    "metadata": {
                        "library_name": lib,
                        "processed_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "source": "Derived from file structure",
                        "processor_version": "claude.beta.py 3.0" 
                    }
                }
            
            # Add document data
            all_data[lib]["docs_data"].extend(d.to_dict() for d in docs)
            
            # Update cache if enabled
            if use_cache:
                try:
                    processed_cache[str(pth)] = {
                        "mod_time": pth.stat().st_mtime,
                        "size": pth.stat().st_size,
                        "chunks": len(docs),
                        "last_processed": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                except OSError as e:
                    # If stat fails, skip caching this file
                    logger.debug(f"Could not stat file {fpath} for caching: {e}")

        # Periodically save cache for large batches
        if use_cache and (i + batch_size) % (batch_size * 5) == 0:
            try:
                with open(cache_path, "w", encoding="utf-8") as c:
                    json.dump(processed_cache, c, indent=2)
                logger.info(f"Saved cache after processing {i+batch_size} files.")
            except Exception as e:
                logger.warning(f"Cache save error: {e}")
                
        # Check memory usage and trigger garbage collection if needed
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            if memory_info.rss > memory_limit:
                logger.warning(f"Memory usage ({memory_info.rss / 1024 / 1024:.1f} MB) exceeded limit. Triggering GC.")
                import gc
                gc.collect()
        except ImportError:
            pass  # psutil not available

    # Add overall processing metadata
    processing_time = time.time() - processing_start
    total_time = time.time() - start_time
    
    # Add processing information to the output
    metakey = "metadata"
    for lib in all_data:
        if metakey in all_data[lib]:
            all_data[lib][metakey].update({
                "processing_timestamp": datetime.now().isoformat(),
                "processing_time_seconds": processing_time,
                "total_time_seconds": total_time,
                "discovery_time_seconds": discovery_time,
                "total_files_processed": stats.processed_files,
                "total_files_skipped": stats.skipped_files,
                "total_files_error": stats.error_files,
                "total_chunks": stats.total_chunks,
                "max_chunk_size": max_chunk_size,
                "chunk_overlap": overlap,
                "valid_extensions": valid_extensions,
                "binary_detection": include_binary_detection
            })
            
            # Add PDF-specific stats if available
            if stats.pdf_files > 0:
                all_data[lib][metakey].update({
                    "pdf_files_processed": stats.pdf_files,
                    "tables_extracted": stats.tables_extracted,
                    "references_extracted": stats.references_extracted,
                    "scanned_pages_processed": stats.scanned_pages_processed,
                    "ocr_processed_files": stats.ocr_processed_files
                })

    # Add processing failures if requested
    if include_failed_files and (processing_failures or skipped_during_discovery):
        for lib in all_data:
            if metakey in all_data[lib]:
                all_data[lib][metakey]["processing_failures"] = processing_failures
                all_data[lib][metakey]["skipped_during_discovery"] = skipped_during_discovery

    # Write output JSON unless stats_only mode
    if not stats_only:
        try:
            # FIX: Make sure output directory exists, but properly handle drive letters
            # Get just the directory part of the output_file path
            outdir = os.path.dirname(output_file)
            
            # Only create the directory if it's not an empty string
            if outdir:
                # Fix for handling paths with multiple drive letters (e.g., "C:\path\C:\file.json")
                # Check if outdir contains multiple drive letters
                drive_pattern = re.compile(r'([A-Za-z]:)')
                drive_matches = drive_pattern.findall(outdir)
                
                if len(drive_matches) > 1:
                    # Path contains multiple drive letters, use only the first one
                    logger.warning(f"Path contains multiple drive letters: {outdir}")
                    first_drive_end = outdir.find(drive_matches[0]) + len(drive_matches[0])
                    second_drive_start = outdir.find(drive_matches[1])
                    
                    # Use just the first drive and its path
                    clean_outdir = outdir[:second_drive_start]
                    logger.info(f"Using cleaned directory path: {clean_outdir}")
                    
                    # Update the output_file path to use the correct directory
                    output_filename = os.path.basename(output_file)
                    output_file = os.path.join(clean_outdir, output_filename)
                    logger.info(f"Updated output file path: {output_file}")
                    
                    outdir = clean_outdir
                
                # Create the directory
                try:
                    os.makedirs(outdir, exist_ok=True)
                    logger.info(f"Ensured output directory exists: {outdir}")
                except Exception as dir_err:
                    logger.error(f"Error creating output directory: {dir_err}")
                    
                    # Fallback: Try to use the user's Documents folder
                    try:
                        import pathlib
                        docs_dir = os.path.join(str(pathlib.Path.home()), "Documents")
                        os.makedirs(docs_dir, exist_ok=True)
                        
                        # Update output file path to use Documents folder
                        output_filename = os.path.basename(output_file)
                        output_file = os.path.join(docs_dir, output_filename)
                        logger.warning(f"Using fallback output location: {output_file}")
                    except Exception as fallback_err:
                        logger.error(f"Error creating fallback output directory: {fallback_err}")
                        # Last resort: Try to use current directory
                        output_filename = os.path.basename(output_file)
                        output_file = output_filename
                        logger.warning(f"Using current directory for output: {output_file}")
                
            # Use the enhanced safe JSON writer instead of direct write
            success = write_json_safely(all_data, output_file)
            
            if success:
                logger.info(f"Created JSON output at {output_file}")
            else:
                logger.error(f"Failed to write JSON output to {output_file}")
                # Try alternative approach with simpler JSON structure
                try:
                    logger.info("Attempting alternative JSON writing approach...")
                    # Create a simplified version of the data with just the essential information
                    simplified_data = {}
                    for lib in all_data:
                        simplified_data[lib] = {
                            "metadata": all_data[lib]["metadata"],
                            "doc_count": len(all_data[lib].get("docs_data", [])),
                            "summary": f"Processed {len(all_data[lib].get('docs_data', []))} documents"
                        }
                    
                    temp_output = f"{output_file}.simple.json"
                    with open(temp_output, "w", encoding="utf-8") as f:
                        json.dump(simplified_data, f, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Created simplified JSON output at {temp_output}")
                except Exception as alt_err:
                    logger.error(f"Alternative JSON writing also failed: {alt_err}")
            
            if progress_callback:
                progress_callback(100, 100, "completed")
        except Exception as e:
            logger.error(f"Error writing final output: {e}", exc_info=True)
            if progress_callback:
                progress_callback(0, 0, "error")

    # Save final cache state
    if use_cache:
        try:
            with open(cache_path, "w", encoding="utf-8") as c:
                json.dump(processed_cache, c, indent=2)
            logger.info(f"Saved final cache to {cache_path}")
        except Exception as e:
            logger.warning(f"Final cache save error: {e}")

    # Log final statistics and return results
    final_stats = stats.to_dict()
    final_stats["total_duration_seconds"] = total_time
    final_stats["processing_duration_seconds"] = processing_time
    final_stats["discovery_duration_seconds"] = discovery_time
    
    if stats.processed_files > 0:
        final_stats["seconds_per_file"] = processing_time / stats.processed_files
        
    if stats.total_files > 0:
        final_stats["success_rate"] = stats.processed_files / stats.total_files * 100
    
    logger.info(f"Processing complete in {total_time:.2f}s")
    logger.info(f"Stats: {len(all_files)} files found, {stats.processed_files} processed, " +
                f"{stats.skipped_files} skipped, {stats.error_files} errors, " +
                f"{stats.total_chunks} chunks created")
    
    # PDF-specific statistics
    if stats.pdf_files > 0:
        logger.info(f"PDF Stats: {stats.pdf_files} PDFs processed, {stats.tables_extracted} tables extracted, " +
                    f"{stats.references_extracted} references extracted, {stats.ocr_processed_files} OCR processed")
    
    result = {
        "stats": final_stats,
        "data": all_data,
        "status": "completed",
        "message": f"Successfully processed {stats.processed_files} files",
        "output_file": output_file  # Return the potentially updated output file path
    }
    
    # Include failure information if requested
    if include_failed_files:
        result["processing_failures"] = processing_failures
        result["skipped_during_discovery"] = skipped_during_discovery
        
    return result    
# Helper functions for emitting Socket.IO events
def emit_task_error(task_id, error_message, error_details=None, stats=None):
    """
    Emit a task error event via Socket.IO.
    
    Args:
        task_id: Unique identifier for the task
        error_message: Error message string
        error_details: Optional additional error details
        stats: Optional statistics at time of error
    """
    try:
        payload = {
            'task_id': task_id,
            'status': 'failed',
            'error': error_message,
            'timestamp': time.time()
        }
        
        # Include error details if provided
        if error_details:
            payload['error_details'] = error_details
            
        # Process stats for serialization
        if stats:
            if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                payload['stats'] = stats.to_dict()
            elif isinstance(stats, dict):
                payload['stats'] = stats
            else:
                try:
                    payload['stats'] = stats.__dict__
                except:
                    payload['stats'] = str(stats)
        
        # Emit via Socket.IO
        emit('task_error', payload, broadcast=True, namespace='/')
        logger.error(f"Task {task_id} error: {error_message}")
    except Exception as e:
        logger.error(f"Error emitting task_error: {e}")

@file_processor_bp.route('/process', methods=['POST'])
def start_processing():
    """
    API endpoint to start processing files in the specified directory.
    Handles JSON or form data input, validates parameters, and creates a processing task.
    
    Expected parameters:
    - input_dir: Directory containing files to process
    - output_file: Optional output filename or full path 
    - output_dir: Optional output directory (ignored if output_file has directory part)
    
    Returns:
        JSON response with task details and status
    """
    try:
        # Get the JSON data from the request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form
        
        # Ensure temp directory exists
        ensure_temp_directory()
        
        # Extract variables from the request
        input_dir = data.get("input_dir")
        output_file = data.get("output_file")  # Extract output file from request
        output_dir = data.get("output_dir")  # Optional, can be None
        
        # Log the received parameters
        logger.info(f"Processing request: input_dir={input_dir}, output_file={output_file}, output_dir={output_dir}")
        
        # Validate inputs
        if not input_dir:
            logger.warning("Request missing input_dir parameter")
            return jsonify({"error": "Input directory not specified"}), 400
        
        if not output_file:
            # Auto-generate output filename based on input directory if not provided
            output_file = "processed_" + os.path.basename(os.path.normpath(input_dir)) + ".json"
            logger.info(f"No output file specified, generated name: {output_file}")
        
        # Get the full output path
        final_output_path = get_output_filepath(output_file, output_dir)
        logger.info(f"Resolved output path: {final_output_path}")
        
        # Generate a unique task ID
        task_id = str(uuid.uuid4())
        
        # Create and start the processing task
        task = ProcessingTask(task_id, input_dir, final_output_path)
        add_task(task_id, task)
        task.start()
        
        # Return success response
        response = {
            "task_id": task_id,
            "status": "processing",
            "message": "Processing started",
            "input_dir": input_dir,
            "output_file": final_output_path
        }
        
        logger.info(f"Started processing task: {task_id} for input directory: {input_dir}")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in start_processing: {str(e)}", exc_info=True)
        return jsonify({
            "error": f"Failed to start processing: {str(e)}",
            "status": "error"
        }), 500


def get_output_filepath(filename, user_defined_dir=None):
    """
    Resolves user-specified output directory or uses default fallback.
    
    Args:
        filename (str): The desired output filename (with or without extension)
        user_defined_dir (str, optional): Override the default output folder
    
    Returns:
        str: Absolute path to the properly named output file
    """
    # Handle potential None input
    if not filename:
        filename = "output"
    
    # Strip .json extension if provided
    if filename.lower().endswith('.json'):
        filename = filename[:-5]
    
    # Sanitize the filename
    sanitized_name = sanitize_filename(filename) + ".json"
    
    # Check if we have a full path in output_filename
    if os.path.dirname(filename):
        # User provided a path with the filename
        target_folder = os.path.dirname(filename)
        sanitized_name = sanitize_filename(os.path.basename(filename)) + ".json"
    else:
        # Use override folder or default to the DEFAULT_OUTPUT_FOLDER
        target_folder = user_defined_dir or DEFAULT_OUTPUT_FOLDER
    
    # Make sure target_folder is defined and is an absolute path
    if not target_folder or not isinstance(target_folder, str):
        logger.warning(f"Invalid target folder: {target_folder}, falling back to DEFAULT_OUTPUT_FOLDER")
        target_folder = DEFAULT_OUTPUT_FOLDER
    
    # Convert to absolute path
    target_folder = os.path.abspath(target_folder)
    
    # If target folder doesn't exist, try to create it
    try:
        if not os.path.isdir(target_folder):
            os.makedirs(target_folder, exist_ok=True)
            logger.info(f"Created output directory: {target_folder}")
    except Exception as e:
        logger.warning(f"Could not create directory {target_folder}: {e}")
        # Fall back to DEFAULT_OUTPUT_FOLDER if we can't create the directory
        target_folder = DEFAULT_OUTPUT_FOLDER
        # Try to ensure this directory exists
        try:
            os.makedirs(target_folder, exist_ok=True)
        except Exception as e2:
            logger.error(f"Cannot create fallback directory {target_folder}: {e2}")
            # Last resort - use temp directory
            import tempfile
            target_folder = tempfile.gettempdir()
    
    # Construct and ensure the final path
    final_output_path = os.path.join(target_folder, sanitized_name)
    
    logger.info(f"Output file will be saved at: {final_output_path}")
    return final_output_path


def resolve_output_path(directory, filename):
    """
    Resolve output path with proper directory creation if needed.
    
    Args:
        directory (str): The directory to save the file in
        filename (str): Output filename
        
    Returns:
        str: Full path to the resolved output file
    """
    # Create the directory if it doesn't exist
    if not os.path.exists(directory):
        try:
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Created directory: {directory}")
        except Exception as e:
            logger.warning(f"Could not create directory {directory}: {e}")
            # Fall back to DEFAULT_OUTPUT_FOLDER
            directory = DEFAULT_OUTPUT_FOLDER
            try:
                os.makedirs(directory, exist_ok=True)
            except Exception as e2:
                logger.error(f"Cannot create fallback directory {directory}: {e2}")
                # Last resort - use temp directory
                import tempfile
                directory = tempfile.gettempdir()
    
    # Return the full path
    return os.path.join(directory, filename)


@file_processor_bp.route('/status/<task_id>', methods=['GET'])
def task_status(task_id):
    """
    Get a comprehensive status report of the task.
    
    Args:
        task_id (str): The unique identifier for the task
        
    Returns:
        JSON response with task status information
    """
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    # Prepare the response data
    response_data = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "error": getattr(task, "error_message", None),
        "start_time": task.start_time,
        "elapsed_seconds": time.time() - task.start_time
    }
    
    # Handle stats conversion for JSON serialization
    if task.stats:
        # If stats is a CustomFileStats object with to_dict method
        if hasattr(task.stats, 'to_dict') and callable(task.stats.to_dict):
            response_data["stats"] = task.stats.to_dict()
        # If stats is already a dict
        elif isinstance(task.stats, dict):
            response_data["stats"] = task.stats
        # Fall back to converting object attributes to dict
        elif hasattr(task.stats, '__dict__'):
            response_data["stats"] = {k: v for k, v in task.stats.__dict__.items() 
                                    if not k.startswith('__') and not callable(v)}
        else:
            # If we can't serialize it, set to empty dict
            response_data["stats"] = {}
            app.logger.warning(f"Could not serialize stats for task {task_id}, using empty dict")
    else:
        response_data["stats"] = {}
    
    # Add output file if available
    if hasattr(task, 'output_file') and task.output_file:
        response_data["output_file"] = task.output_file
    
    # Add estimated time remaining if progress is sufficient
    if task.progress > 0 and task.progress < 100:
        elapsed = time.time() - task.start_time
        if elapsed > 0:
            # Calculate time per percentage point
            time_per_point = elapsed / task.progress
            # Estimated time for remaining percentage points
            remaining_percent = 100 - task.progress
            response_data["estimated_seconds_remaining"] = time_per_point * remaining_percent
    
    # Add human-readable elapsed and estimated time
    response_data["elapsed_time_readable"] = format_time_duration(response_data["elapsed_seconds"])
    if "estimated_seconds_remaining" in response_data:
        response_data["estimated_time_remaining_readable"] = format_time_duration(
            response_data["estimated_seconds_remaining"]
        )
    
    return jsonify(response_data)

def format_time_duration(seconds):
    """Format seconds into a human-readable duration string."""
    if seconds < 60:
        return f"{int(seconds)} seconds"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours} hour{'s' if hours != 1 else ''} {minutes} minute{'s' if minutes != 1 else ''}"

@file_processor_bp.route('/download/<task_id>', methods=['GET'])
def download_result(task_id):
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    if task.status != "completed":
        return structured_error_response("TASK_INCOMPLETE", "Task is not completed yet.", 409)
    
    if not hasattr(task, 'output_file') or not task.output_file:
        return structured_error_response("FILE_NOT_FOUND", "No output file associated with this task.", 404)
    
    if not os.path.exists(task.output_file):
        return structured_error_response("FILE_NOT_FOUND", "Output file not found on server.", 404)
    
    try:
        return send_from_directory(
            os.path.dirname(task.output_file),
            os.path.basename(task.output_file),
            as_attachment=True,
            download_name=os.path.basename(task.output_file)
        )
    except Exception as e:
        logger.exception(f"Error downloading file {task.output_file}: {e}")
        return structured_error_response("FILE_READ_ERROR", f"Could not read output file: {e}", 500)

@file_processor_bp.route("/download/<path:filename>")
def download_file(filename):
    """Download any file from the default output folder."""
    safe_filename = secure_filename(filename)
    try:
        return send_from_directory(DEFAULT_OUTPUT_FOLDER, safe_filename, as_attachment=True)
    except FileNotFoundError:
        abort(404)
    except Exception as e:
        logger.exception(f"Error downloading file {filename}: {e}")
        abort(500)
        
@file_processor_bp.route('/open/<task_id>', methods=['GET'])
def open_result_file(task_id):
    task = get_task(task_id)
    if not task:
        return structured_error_response("TASK_NOT_FOUND", f"Task with ID {task_id} not found.", 404)
    
    if task.status != "completed":
        return structured_error_response("TASK_INCOMPLETE", "Task is not completed yet.", 409)
    
    if not hasattr(task, 'output_file') or not task.output_file:
        return structured_error_response("FILE_NOT_FOUND", "No output file associated with this task.", 404)
    
    if not os.path.exists(task.output_file):
        return structured_error_response("FILE_NOT_FOUND", "Output file not found on server.", 404)
    
    try:
        if os.name == "nt":  # Windows
            os.startfile(task.output_file)
        else:
            try:
                subprocess.run(["xdg-open", task.output_file], check=False)
            except Exception:
                subprocess.run(["open", task.output_file], check=False)
                
        return jsonify({"success": True, "message": "File opened locally."})
    except Exception as e:
        logger.exception(f"Error opening file {task.output_file}: {e}")
        return structured_error_response("OPEN_FAILED", f"Could not open file: {e}", 400)
@file_processor_bp.route("/api/open-file", methods=["POST"])
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

@file_processor_bp.route('/detect-path', methods=['POST'])
def detect_path():
    data = request.json or {}
    folder_name = data.get("folderName")
    file_paths = data.get("filePaths", [])
    full_path = data.get("fullPath")
    if not folder_name:
        return structured_error_response("FOLDER_NAME_REQUIRED", "Folder name is required.", 400)
    if full_path:
        norm = os.path.abspath(full_path)
        if os.path.isdir(norm):
            logger.info(f"Verified direct full_path: {norm}")
            return jsonify({"fullPath": norm})
    candidate = Path(folder_name).resolve()
    if candidate.is_dir():
        logger.info(f"Using resolved absolute path: {candidate}")
        return jsonify({"fullPath": str(candidate)})
    if file_paths:
        try:
            normalized_paths = [os.path.abspath(p) for p in file_paths]
            common_base = os.path.commonpath(normalized_paths)
            if os.path.isdir(common_base):
                logger.info(f"Found common directory: {common_base}")
                return jsonify({"fullPath": common_base})
        except ValueError:
            # commonpath can fail if paths are on different drives or invalid
            logger.debug("Could not find common path from provided file paths")
    standard_locs = [Path.cwd(), Path.home() / "Documents", Path.home() / "Desktop",
                     Path.home() / "Downloads", Path.home() / "OneDrive"]
    for base in standard_locs:
        potential = (base / folder_name).resolve()
        if potential.is_dir():
            logger.info(f"Found directory under {base}: {potential}")
            return jsonify({"fullPath": str(potential)})
    logger.warning("Could not automatically detect the folder path.")
    return structured_error_response("PATH_NOT_DETECTED", "Could not automatically detect the folder path.", 404)


@file_processor_bp.route('/verify-path', methods=['POST'])
def verify_path():
    """
    Enhanced API endpoint to validate path with better error handling
    and permissions testing.
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({
            "status": "error",
            "message": "Path is required"
        }), 400
    
    path_str = data.get("path")
    if not path_str:
        return jsonify({
            "status": "error", 
            "message": "Empty path provided"
        }), 400
    
    try:
        # Normalize path
        norm_path = os.path.abspath(os.path.expanduser(path_str))
        
        # Check if it exists
        if os.path.exists(norm_path):
            if os.path.isdir(norm_path):
                # Check if it's writable
                writable = os.access(norm_path, os.W_OK)
                
                return jsonify({
                    "exists": True,
                    "isDirectory": True,
                    "fullPath": norm_path,
                    "canWrite": writable,
                    "parentPath": os.path.dirname(norm_path)
                })
            else:
                # It exists but is not a directory
                return jsonify({
                    "exists": True,
                    "isDirectory": False,
                    "fullPath": norm_path,
                    "parentPath": os.path.dirname(norm_path),
                    "canWrite": False
                })
        else:
            # Path doesn't exist, check parent directory
            parent_path = os.path.dirname(norm_path)
            parent_exists = os.path.isdir(parent_path)
            parent_writable = os.access(parent_path, os.W_OK) if parent_exists else False
            
            return jsonify({
                "exists": False,
                "isDirectory": False,
                "fullPath": norm_path,
                "parentPath": parent_path if parent_exists else None,
                "parentExists": parent_exists,
                "canCreate": parent_writable
            })
    except Exception as e:
        logger.error(f"Error verifying path {path_str}: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@file_processor_bp.route("/api/create-directory", methods=["POST"])
def create_directory():
    """
    Create a directory at the specified path.
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({
            "status": "error",
            "message": "Path is required"
        }), 400
    
    path_str = data.get("path")
    if not path_str:
        return jsonify({
            "status": "error", 
            "message": "Empty path provided"
        }), 400
    
    try:
        # Normalize path
        norm_path = os.path.abspath(os.path.expanduser(path_str))
        
        # Check if path already exists
        if os.path.exists(norm_path):
            if os.path.isdir(norm_path):
                return jsonify({
                    "success": True,
                    "path": norm_path,
                    "message": "Directory already exists"
                })
            else:
                return jsonify({
                    "success": False,
                    "message": f"Path exists but is not a directory: {norm_path}"
                }), 400
        
        # Create the directory with parents
        os.makedirs(norm_path, exist_ok=True)
        
        # Verify it was created
        if os.path.isdir(norm_path):
            return jsonify({
                "success": True,
                "path": norm_path,
                "message": "Directory created successfully"
            })
        else:
            return jsonify({
                "success": False,
                "message": f"Failed to create directory: {norm_path}"
            }), 500
    except Exception as e:
        logger.error(f"Error creating directory {path_str}: {e}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
# =============================================================================
# BACKGROUND TASK PROCESSING
# =============================================================================

def start_file_processing_task(task_id, input_dir, output_file, output_dir=None):
    """
    Background task for processing files
    This runs in a separate thread to avoid blocking the main application
    """
    try:
        logger.info(f"Starting file processing task {task_id}")
        
        # Update task status to processing
        update_task_progress(task_id, 0, "processing", stats={'stage': 'initializing'})
        emit_progress_update(task_id, 0, "processing", "Initializing file processing...", 
                           socketio_instance=current_app.socketio)
        
        # Simulate file discovery
        time.sleep(1)
        emit_progress_update(task_id, 10, "processing", "Discovering files...", 
                           socketio_instance=current_app.socketio)
        
        # Get list of files to process
        files_to_process = []
        if os.path.isdir(input_dir):
            for root, dirs, files in os.walk(input_dir):
                for file in files:
                    if file.lower().endswith(('.txt', '.pdf', '.docx', '.md')):
                        files_to_process.append(os.path.join(root, file))
        
        total_files = len(files_to_process)
        if total_files == 0:
            emit_task_error(task_id, "No supported files found in directory", 
                          socketio_instance=current_app.socketio)
            return
        
        logger.info(f"Found {total_files} files to process")
        emit_progress_update(task_id, 20, "processing", f"Found {total_files} files to process", 
                           stats={'total_files': total_files}, 
                           socketio_instance=current_app.socketio)
        
        # Process files (simulate processing)
        processed_files = 0
        output_content = []
        
        for i, file_path in enumerate(files_to_process):
            try:
                # Update progress
                progress = 20 + (60 * i / total_files)  # Progress from 20% to 80%
                emit_progress_update(task_id, progress, "processing", 
                                   f"Processing {os.path.basename(file_path)}...", 
                                   stats={'processed_files': processed_files, 'total_files': total_files},
                                   socketio_instance=current_app.socketio)
                
                # Simulate file processing time
                time.sleep(0.5)
                
                # Read file content (basic text extraction)
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        output_content.append(f"\n\n=== {file_path} ===\n{content}")
                        processed_files += 1
                except Exception as file_error:
                    logger.warning(f"Could not read file {file_path}: {file_error}")
                    output_content.append(f"\n\n=== {file_path} ===\nError reading file: {file_error}")
                
            except Exception as e:
                logger.error(f"Error processing file {file_path}: {e}")
        
        # Write output file
        emit_progress_update(task_id, 80, "processing", "Writing output file...", 
                           socketio_instance=current_app.socketio)
        
        # Determine output path
        if output_dir and not os.path.isabs(output_file):
            output_path = os.path.join(output_dir, output_file)
        else:
            output_path = output_file
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Write the combined content
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# File Processing Results\n")
            f.write(f"# Total files processed: {processed_files}/{total_files}\n")
            f.write(f"# Processing completed at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("\n".join(output_content))
        
        # Final progress update
        emit_progress_update(task_id, 100, "completed", "File processing completed successfully!", 
                           stats={
                               'total_files': total_files,
                               'processed_files': processed_files,
                               'output_path': output_path,
                               'file_size': os.path.getsize(output_path)
                           },
                           socketio_instance=current_app.socketio)
        
        # Mark task as completed
        emit_task_completed(task_id, success=True, 
                          message="File processing completed successfully",
                          stats={
                              'total_files': total_files,
                              'processed_files': processed_files,
                              'output_path': output_path
                          },
                          socketio_instance=current_app.socketio)
        
        logger.info(f"File processing task {task_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Error in file processing task {task_id}: {str(e)}")
        emit_task_error(task_id, f"File processing failed: {str(e)}", 
                       socketio_instance=current_app.socketio)


# Export the blueprint and key functions
__all__ = [
    'file_processor_bp',
    'start_file_processing_task',
    'process_all_files',
    'get_output_filepath',
    'resolve_output_path',
    'format_time_duration'
]