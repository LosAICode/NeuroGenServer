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
  
def analyze_pdf_structure(pdf_file: str) -> Dict[str, Any]:
    """
    Analyze a PDF file's structure and return a summary of its content.
    
    Args:
        pdf_file: Path to the PDF file
        
    Returns:
        Dict with PDF structure information
    """
    if not structify_module:
        return {"error": "Claude module not available for PDF analysis"}
    
    try:
        summary = {}
        
        # Detect document type
        if hasattr(structify_module, 'detect_document_type'):
            try:
                summary["document_type"] = structify_module.detect_document_type(pdf_file)
            except Exception as e:
                logger.warning(f"Error detecting document type: {e}")
                summary["document_type"] = "unknown"
        
        # Extract metadata using PyMuPDF if available
        if hasattr(structify_module, 'extract_text_from_pdf'):
            try:
                pdf_data = structify_module.extract_text_from_pdf(pdf_file)
                if pdf_data:
                    summary["metadata"] = pdf_data.get("metadata", {})
                    summary["page_count"] = pdf_data.get("page_count", 0)
                    summary["has_scanned_content"] = pdf_data.get("has_scanned_content", False)
            except Exception as e:
                logger.warning(f"Error extracting PDF metadata: {e}")
        
        # Extract tables if document type suggests it might have tables
        tables = []
        if hasattr(structify_module, 'extract_tables_from_pdf') and summary.get("document_type") in ["academic_paper", "report", "book"]:
            try:
                tables = structify_module.extract_tables_from_pdf(pdf_file)
                summary["tables_count"] = len(tables)
                if tables:
                    # Just include count and page location of tables, not full content
                    summary["tables_info"] = [
                        {"table_id": t.get("table_id"), "page": t.get("page"), "rows": t.get("rows"), "columns": len(t.get("columns", []))}
                        for t in tables[:10]  # Limit to first 10 tables
                    ]
            except Exception as e:
                logger.warning(f"Error extracting tables: {e}")
                summary["tables_count"] = 0
        
        # Extract structure if available
        if hasattr(structify_module, 'identify_document_structure') and pdf_data.get("full_text"):
            try:
                structure = structify_module.identify_document_structure(
                    pdf_data["full_text"],
                    pdf_data.get("structure", {}).get("headings", [])
                )
                if structure:
                    summary["sections_count"] = len(structure.get("sections", []))
                    # Include section titles for the first few sections
                    summary["section_titles"] = [
                        s.get("clean_title", s.get("title", "Untitled Section"))
                        for s in structure.get("sections", [])[:5]  # Limit to first 5 sections
                    ]
            except Exception as e:
                logger.warning(f"Error identifying document structure: {e}")
        
        # File stats
        try:
            file_size = os.path.getsize(pdf_file)
            summary["file_size_bytes"] = file_size
            summary["file_size_mb"] = round(file_size / (1024 * 1024), 2)
        except Exception as e:
            logger.warning(f"Error getting file stats: {e}")
        
        return summary
        
    except Exception as e:
        logger.error(f"Error analyzing PDF structure: {e}")
        return {"error": str(e)}

def extract_pdf_preview(pdf_file: str, max_preview_length: int = 2000) -> Dict[str, Any]:
    """
    Extract a preview of PDF content for display in the UI.
    
    Args:
        pdf_file: Path to the PDF file
        max_preview_length: Maximum length of text preview
        
    Returns:
        Dict with PDF preview information
    """
    if not structify_module:
        return {"error": "Claude module not available for PDF preview"}
    
    try:
        preview = {}
        
        # Extract basic text using PyMuPDF if available
        if hasattr(structify_module, 'extract_text_from_pdf'):
            pdf_data = structify_module.extract_text_from_pdf(pdf_file)
            if pdf_data and pdf_data.get("full_text"):
                text = pdf_data["full_text"]
                preview["title"] = pdf_data.get("metadata", {}).get("title", os.path.basename(pdf_file))
                preview["author"] = pdf_data.get("metadata", {}).get("author", "Unknown")
                preview["page_count"] = pdf_data.get("page_count", 0)
                
                # Create a short text preview
                if len(text) > max_preview_length:
                    preview["text_preview"] = text[:max_preview_length] + "..."
                else:
                    preview["text_preview"] = text
                
                # Extract first few headings if available
                if "structure" in pdf_data and "headings" in pdf_data["structure"]:
                    preview["headings"] = pdf_data["structure"]["headings"][:10]  # First 10 headings
                
                return preview
        
        # Fallback to simple metadata only if text extraction failed
        preview["title"] = os.path.basename(pdf_file)
        preview["text_preview"] = "PDF preview not available"
        
        return preview
        
    except Exception as e:
        logger.error(f"Error extracting PDF preview: {e}")
        return {"error": str(e), "text_preview": "Error generating preview"}


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
            except OSError:
                # If stat fails, process the file anyway
                pass
                
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
                except OSError:
                    # If stat fails, skip caching this file
                    pass

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

class CustomFileStats:
    """
    Statistics tracked during file processing with custom extensions.
    Enhanced with thread safety, error handling, and comprehensive metrics.
    """
    def __init__(self):
        # Thread safety
        self._lock = threading.RLock()
        
        # Basic file metrics
        self.total_files = 0
        self.processed_files = 0
        self.skipped_files = 0
        self.error_files = 0
        self.total_bytes = 0
        self.total_chunks = 0
        
        # PDF-specific metrics
        self.pdf_files = 0
        self.tables_extracted = 0
        self.references_extracted = 0
        self.scanned_pages_processed = 0
        self.ocr_processed_files = 0
        
        # File type tracking
        self.binary_files_detected = 0  # Added to fix the missing attribute error
        
        # Extension tracking
        self._extension_counts = {}  # Track files by extension
        self._failed_extensions = {}  # Track failures by extension
        
        # Performance metrics
        self.total_processing_time = 0
        self.largest_file_bytes = 0
        self.largest_file_path = ""
        # Ensure start_time is a float, not a string
        self.start_time = float(time.time())
        
        # Memory metrics
        self.peak_memory_usage = 0
        self.memory_samples_count = 0
        self.avg_memory_usage = 0
        
        # Processing rate tracking
        self._last_progress_time = float(time.time())
        self._last_files_processed = 0
        self.current_processing_rate = 0  # files per second
        
        # Milestone tracking
        self._milestones = {
            "start_time": float(time.time()),
            "first_file_processed": None,
            "halfway_processed": None,
            "completion_time": None
        }
        
    def update_file_processed(self, file_path: str, file_size: int, is_binary: bool = False, 
                             is_pdf: bool = False, is_error: bool = False, 
                             is_skipped: bool = False) -> None:
        """
        Update statistics when a file is processed, with thread safety.
        
        Args:
            file_path: Path to the processed file
            file_size: Size of the file in bytes
            is_binary: Whether the file is binary
            is_pdf: Whether the file is a PDF
            is_error: Whether there was an error processing the file
            is_skipped: Whether the file was skipped
        """
        with self._lock:
            try:
                # Update total files count
                self.total_files += 1
                
                # Track file by extension
                ext = os.path.splitext(file_path)[1].lower()
                self._extension_counts[ext] = self._extension_counts.get(ext, 0) + 1
                
                # Update specific counters based on file type and processing outcome
                if is_error:
                    self.error_files += 1
                    self._failed_extensions[ext] = self._failed_extensions.get(ext, 0) + 1
                elif is_skipped:
                    self.skipped_files += 1
                else:
                    self.processed_files += 1
                    self.total_bytes += file_size
                    
                    # Update milestone tracking for first file
                    if self._milestones["first_file_processed"] is None:
                        self._milestones["first_file_processed"] = float(time.time())
                    
                    # Update milestone for halfway point
                    if self.processed_files == self.total_files // 2 and self.total_files > 1:
                        self._milestones["halfway_processed"] = float(time.time())
                
                # Track binary files
                if is_binary:
                    self.binary_files_detected += 1
                    
                # Track PDF files
                if is_pdf:
                    self.pdf_files += 1
                
                # Update largest file if applicable
                self.update_largest_file(file_path, file_size)
                
                # Update processing rate statistics
                current_time = float(time.time())
                time_diff = current_time - self._last_progress_time
                if time_diff >= 2.0:  # Only update rate every 2 seconds to smooth fluctuations
                    files_diff = self.processed_files - self._last_files_processed
                    self.current_processing_rate = files_diff / time_diff if time_diff > 0 else 0
                    self._last_progress_time = current_time
                    self._last_files_processed = self.processed_files
            except Exception as e:
                logger.error(f"Error in update_file_processed: {e}")
                # Continue despite errors
        
    def calculate_duration(self):
        """
        Calculate duration since start time with error handling.
        
        Returns:
            float: Duration in seconds
        """
        try:
            # Ensure start_time is a float before subtraction
            if not isinstance(self.start_time, (int, float)):
                try:
                    # Convert string to float if somehow it became a string
                    self.start_time = float(self.start_time)
                except (TypeError, ValueError):
                    # If conversion fails, reset start_time to current time
                    logger.error(f"Invalid start_time: {self.start_time}, type: {type(self.start_time)}")
                    self.start_time = float(time.time())
                    return 0.0
            
            current_time = float(time.time())
            duration = current_time - self.start_time
            
            # Sanity check - if result is negative or extremely large, something is wrong
            if duration < 0 or duration > 86400:  # More than 24 hours is suspicious
                logger.warning(f"Suspicious duration calculated: {duration}s. Resetting.")
                self.start_time = float(time.time())
                return 0.0
                
            return duration
        except Exception as e:
            # Handle error case - log and return fallback value
            logger.error(f"Error calculating duration: {e}. start_time={self.start_time}, type={type(self.start_time)}")
            # Return a fallback duration
            return 0.0

    def update_largest_file(self, file_path: str, file_size: int) -> None:
        """Update largest file information if current file is larger."""
        try:
            if file_size > self.largest_file_bytes:
                self.largest_file_bytes = file_size
                self.largest_file_path = file_path
        except Exception as e:
            logger.debug(f"Error updating largest file: {e}")
            
    def increment_chunks(self, count: int = 1) -> None:
        """
        Increment the total chunks counter with thread safety.
        
        Args:
            count: Number of chunks to add
        """
        with self._lock:
            try:
                self.total_chunks += count
            except Exception as e:
                logger.debug(f"Error incrementing chunks: {e}")
    
    def increment_pdf_metrics(self, tables: int = 0, references: int = 0, 
                             scanned_pages: int = 0, ocr_files: int = 0) -> None:
        """
        Update PDF-specific metrics with thread safety.
        
        Args:
            tables: Number of tables extracted
            references: Number of references extracted
            scanned_pages: Number of scanned pages processed
            ocr_files: Number of files processed with OCR
        """
        with self._lock:
            try:
                self.tables_extracted += tables
                self.references_extracted += references
                self.scanned_pages_processed += scanned_pages
                self.ocr_processed_files += ocr_files
            except Exception as e:
                logger.debug(f"Error incrementing PDF metrics: {e}")
            
    def track_memory_usage(self):
        """Track current memory usage of the process with enhanced error handling."""
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            
            # Update memory statistics with thread safety
            with self._lock:
                # Calculate running average
                self.memory_samples_count += 1
                self.avg_memory_usage = ((self.avg_memory_usage * (self.memory_samples_count - 1)) + memory_mb) / self.memory_samples_count
                
                # Update peak memory usage
                if memory_mb > self.peak_memory_usage:
                    self.peak_memory_usage = memory_mb
                    
                return memory_mb
        except ImportError:
            # psutil not available
            logger.debug("psutil not available for memory tracking")
            return 0
        except (AttributeError, PermissionError) as e:
            logger.debug(f"Permission or attribute error during memory tracking: {e}")
            return 0
        except Exception as e:
            logger.debug(f"Error tracking memory usage: {e}")
            return 0
            
    def finish_processing(self):
        """Finalize processing statistics with enhanced error handling."""
        try:
            # Record completion time
            self._milestones["completion_time"] = float(time.time())
            
            # Calculate final duration with error handling
            duration = self.calculate_duration()
            if duration > 0:  # Only update if we got a valid duration
                self.total_processing_time = duration
            
            # Perform any final calculations
            self.track_memory_usage()  # One final memory check
            
            # Log completion summary
            try:
                logger.info(f"Processing completed in {self.total_processing_time:.2f}s: "
                           f"{self.processed_files}/{self.total_files} files processed, "
                           f"{self.error_files} errors, {self.skipped_files} skipped")
            except Exception as log_err:
                logger.debug(f"Error logging completion summary: {log_err}")
                
        except Exception as e:
            logger.error(f"Error in finish_processing: {e}")
            # Continue processing despite errors
    
    def get_memory_profile(self) -> Dict[str, Any]:
        """
        Get detailed memory usage profile.
        
        Returns:
            Dictionary with memory usage statistics
        """
        try:
            with self._lock:
                profile = {
                    "peak_memory_mb": round(self.peak_memory_usage, 2),
                    "average_memory_mb": round(self.avg_memory_usage, 2),
                    "samples_count": self.memory_samples_count
                }
                
                return profile
        except Exception as e:
            logger.error(f"Error getting memory profile: {e}")
            return {"error": str(e)}
    
    def get_processing_speed_profile(self) -> Dict[str, Any]:
        """
        Get detailed processing speed profile.
        
        Returns:
            Dictionary with processing speed statistics
        """
        try:
            with self._lock:
                duration = self.calculate_duration()
                total_duration = duration if duration > 0 else 0.001  # Avoid division by zero
                
                profile = {
                    "current_rate_files_per_second": round(self.current_processing_rate, 2),
                    "average_rate_files_per_second": round(self.processed_files / total_duration, 2),
                    "average_bytes_per_second": round(self.total_bytes / total_duration, 2) if self.total_bytes > 0 else 0
                }
                
                # Calculate time to first file processing
                if self._milestones["first_file_processed"] is not None:
                    profile["time_to_first_file"] = round(
                        self._milestones["first_file_processed"] - self._milestones["start_time"], 2)
                
                # Calculate time to 50% completion
                if self._milestones["halfway_processed"] is not None:
                    profile["time_to_halfway"] = round(
                        self._milestones["halfway_processed"] - self._milestones["start_time"], 2)
                
                # Calculate breakdown by extension
                if self._extension_counts:
                    profile["extension_breakdown"] = {
                        ext: count for ext, count in sorted(
                            self._extension_counts.items(), 
                            key=lambda x: x[1], 
                            reverse=True
                        )
                    }
                
                # Calculate error rate by extension
                if self._failed_extensions:
                    profile["error_rates_by_extension"] = {}
                    for ext, failures in self._failed_extensions.items():
                        total = self._extension_counts.get(ext, 0)
                        if total > 0:
                            profile["error_rates_by_extension"][ext] = round(failures / total * 100, 2)
                
                return profile
        except Exception as e:
            logger.error(f"Error getting processing speed profile: {e}")
            return {"error": str(e)}
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary for JSON serialization with enhanced error handling.
        
        Returns:
            Dictionary with all statistics
        """
        try:
            # Calculate duration with error handling
            duration_seconds = self.calculate_duration()
            
            d = {
                # Basic file metrics
                'total_files': self.total_files,
                'processed_files': self.processed_files,
                'skipped_files': self.skipped_files,
                'error_files': self.error_files,
                'total_bytes': self.total_bytes,
                'total_chunks': self.total_chunks,
                
                # PDF-specific metrics
                'pdf_files': self.pdf_files,
                'tables_extracted': self.tables_extracted,
                'references_extracted': self.references_extracted,
                'scanned_pages_processed': self.scanned_pages_processed,
                'ocr_processed_files': self.ocr_processed_files,
                
                # File type tracking
                'binary_files_detected': self.binary_files_detected,
                
                # Performance metrics
                'total_processing_time': self.total_processing_time,
                'largest_file_bytes': self.largest_file_bytes,
                'largest_file_path': self.largest_file_path,
                'peak_memory_usage_mb': round(self.peak_memory_usage, 2) if self.peak_memory_usage > 0 else 0,
                'avg_memory_usage_mb': round(self.avg_memory_usage, 2) if self.avg_memory_usage > 0 else 0,
                'duration_seconds': duration_seconds,
                'current_processing_rate': round(self.current_processing_rate, 2),
                
                # Timestamp information
                'start_time_iso': datetime.fromtimestamp(float(self.start_time) if isinstance(self.start_time, (int, float, str)) else time.time()).isoformat(),
                'current_time_iso': datetime.now().isoformat()
            }
            
            # Add derived statistics with error handling
            if duration_seconds > 0:
                d['files_per_second'] = round(self.processed_files / duration_seconds, 2)
            else:
                d['files_per_second'] = 0
                
            if self.processed_files > 0:
                d['average_file_size'] = round(self.total_bytes / self.processed_files, 2)
            else:
                d['average_file_size'] = 0
                
            if self.total_files > 0:
                d['success_rate_percent'] = round(self.processed_files / self.total_files * 100, 2)
                d['error_rate_percent'] = round(self.error_files / self.total_files * 100, 2)
            else:
                d['success_rate_percent'] = 0
                d['error_rate_percent'] = 0
                
            # Add detailed profiles if metrics are available
            if self.memory_samples_count > 0:
                try:
                    d['memory_profile'] = self.get_memory_profile()
                except Exception as e:
                    logger.debug(f"Error getting memory profile for dict: {e}")
                    
            if self.processed_files > 0:
                try:
                    d['speed_profile'] = self.get_processing_speed_profile()
                except Exception as e:
                    logger.debug(f"Error getting speed profile for dict: {e}")
                
            return d
            
        except Exception as e:
            # Provide a minimal fallback dictionary if serialization fails
            logger.error(f"Error generating stats dictionary: {e}")
            return {
                'error': f"Stats serialization failed: {str(e)}",
                'total_files': self.total_files,
                'processed_files': self.processed_files,
                'error_files': self.error_files,
                'skipped_files': self.skipped_files
            }
            
    def __str__(self) -> str:
        """Return a string representation of the statistics with error handling."""
        try:
            return (f"Files: {self.processed_files}/{self.total_files} processed, "
                    f"{self.error_files} errors, {self.skipped_files} skipped. "
                    f"Duration: {self.calculate_duration():.2f}s")
        except Exception as e:
            return f"CustomFileStats (error displaying: {e})"

class BaseTask:
    """
    Base class for all background processing tasks with Socket.IO progress reporting.
    
    Attributes:
        task_id (str): Unique identifier for the task
        task_type (str): Type of task (e.g., "file_processing", "web_scraping")
        progress (int): Current progress value (0-100)
        status (str): Current status (pending, initializing, processing, completed, failed, cancelling, cancelled)
        message (str): Current status message
        stats (Union[CustomFileStats, Dict]): Statistics for the task
        error_message (Optional[str]): Error message if the task fails
        error_details (Optional[Dict]): Detailed error information
        thread (Optional[threading.Thread]): Background thread for processing
        is_cancelled_flag (bool): Flag indicating if the task has been cancelled
        start_time (float): Task start time
        last_emit_time (float): Time of last Socket.IO emission
        emit_interval (float): Minimum interval between progress updates
        output_file (Optional[str]): Path to the output file if applicable
    """
    
    def __init__(self, task_id: str, task_type: str = "generic"):
        """
        Initialize a new task.
        
        Args:
            task_id: Unique identifier for the task
            task_type: Type of task (default: "generic")
        """
        self.task_id = task_id
        self.task_type = task_type
        self.progress = 0
        self.status = "pending"  # pending, initializing, processing, completed, failed, cancelling, cancelled
        self.message = "Task initialized"
        self.stats = {}  # Can be CustomFileStats object or dict
        self.error_message = None
        self.error_details = None
        self.error = None
        
        self.thread = None
        self.is_cancelled_flag = False
        
        self.start_time = time.time()
        self.last_emit_time = 0
        self.emit_interval = 0.5  # Seconds (Socket.IO rate limit)
        self.output_file = None  # For tasks that produce a single file

        # Advanced monitoring properties
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        self.memory_check_interval = 5  # seconds
        self.timeout_seconds = DEFAULT_PROCESS_TIMEOUT
        self.max_allowed_memory_mb = 4096  # 4GB default limit
        self.detailed_progress = {}
        self.retry_count = 0
        self.max_retries = 3
        
        logger.info(f"BaseTask {self.task_id} ({self.task_type}) created.")

    def _run_process(self):
        """Main thread function that runs the task's processing logic."""
        try:
            self.status = "initializing"
            self.emit_task_started()  # Emit start event
            
            # Start memory monitoring if implemented
            if hasattr(self, '_start_memory_monitoring') and callable(self._start_memory_monitoring):
                self._start_memory_monitoring()
            
            # Set up timeout handler if needed
            timeout_timer = None
            if self.timeout_seconds > 0:
                def timeout_handler():
                    if not self.is_cancelled_flag:
                        logger.warning(f"Task {self.task_id} timeout after {self.timeout_seconds}s")
                        self.is_cancelled_flag = True
                        self.status = "timeout"
                        self.handle_error(
                            f"Task timed out after {self.timeout_seconds} seconds", 
                            stage="timeout", 
                            details={"timeout_seconds": self.timeout_seconds}
                        )
                
                timeout_timer = threading.Timer(self.timeout_seconds, timeout_handler)
                timeout_timer.daemon = True
                timeout_timer.start()
            
            try:
                # Subclass's main logic goes here
                if hasattr(self, '_process_logic') and callable(self._process_logic):
                    self._process_logic()  # Call the actual processing method
                else:
                    raise NotImplementedError("Subclasses must implement _process_logic method")
            finally:
                # Cancel timeout timer if it exists
                if timeout_timer:
                    timeout_timer.cancel()
                
                # Stop memory monitoring if implemented
                if hasattr(self, '_stop_memory_monitoring') and callable(self._stop_memory_monitoring):
                    self._stop_memory_monitoring()

            # If task wasn't cancelled or failed during processing, mark as completed
            if self.status not in ["failed", "cancelled", "cancelling", "timeout"]:
                self.status = "completed"
                self.progress = 100
                self.emit_completion()

        except InterruptedError:
            # Handle explicit interruption
            logger.info(f"Task {self.task_id} ({self.task_type}) was interrupted")
            self.status = "cancelled"
            # No need to emit - cancel() should have handled it
            
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Unhandled error in task {self.task_id} ({self.task_type}): {e}", exc_info=True)
            self.handle_error(str(e), details={"traceback": traceback.format_exc()})
        finally:
            # Clean up task from active tasks if still there
            if self.task_id in active_tasks:
                remove_task(self.task_id)

    def start(self, *args, **kwargs):
        """
        Start the task in a background thread.
        
        Args:
            *args, **kwargs: Arguments for subclass-specific initialization
            
        Returns:
            Dict with task info and status
        """
        self.status = "queued"
        self.message = "Task queued for processing"
        self.emit_progress_update()  # Initial emit to show it's queued
        
        # Create and start background thread
        self.thread = threading.Thread(target=self._run_process, daemon=True)
        self.thread.name = f"{self.task_type}TaskThread-{self.task_id[:8]}"
        self.thread.start()
        logger.info(f"Task {self.task_id} ({self.task_type}) thread started.")
        
        # Return task info dictionary
        return {
            "task_id": self.task_id,
            "status": self.status,
            "task_type": self.task_type,
            "message": self.message
        }

    def emit_task_started(self):
        """Emit a task started event via Socket.IO."""
        self.status = "processing"  # Official start of processing
        self.message = "Task processing started."
        self.progress = 0  # Reset progress at actual start
        logger.info(f"Task {self.task_id} ({self.task_type}) started processing.")
        try:
            socketio.emit("task_started", {
                "task_id": self.task_id,
                "task_type": self.task_type,
                "status": self.status,
                "message": self.message,
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error emitting task_started for {self.task_id}: {e}")

    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None, 
                             stats_override: Optional[Union[CustomFileStats, Dict]] = None, 
                             details: Optional[Dict] = None):
        """
        Emit a progress update event via Socket.IO.
        
        Args:
            progress: Optional new progress value (0-100)
            message: Optional new status message
            stats_override: Optional stats override (instead of self.stats)
            details: Optional additional details for the UI
        """
        now = time.time()
        if progress is not None:
            self.progress = min(max(0, progress), 100)
        if message is not None:
            self.message = message
        
        # Rate limit emissions unless it's a final update (100%) or critical status change
        is_critical_update = self.progress == 100 or self.status in ["failed", "completed", "cancelled"]
        if not is_critical_update and (now - self.last_emit_time) < self.emit_interval:
            return

        # Prepare stats for serialization
        current_stats = stats_override if stats_override is not None else self.stats
        serialized_stats = {}
        if isinstance(current_stats, CustomFileStats):
            serialized_stats = current_stats.to_dict()
        elif isinstance(current_stats, dict):
            serialized_stats = current_stats.copy()  # Send a copy to avoid modification
        elif hasattr(current_stats, '__dict__'):
            serialized_stats = current_stats.__dict__.copy()

        # Add dynamic stats
        elapsed_seconds = round(now - self.start_time, 2)
        serialized_stats["elapsed_seconds"] = elapsed_seconds
        
        # Calculate estimated remaining time
        if 0 < self.progress < 100 and elapsed_seconds > 1:  # Avoid division by zero or too early estimates
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            serialized_stats["estimated_remaining_seconds"] = round(estimated_total_time - elapsed_seconds, 2)
        
        # Prepare payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "progress": self.progress,
            "status": self.status,
            "message": self.message,
            "stats": serialized_stats,
            "timestamp": now
        }
        if details:
            payload["details"] = details
        
        # Send event
        try:
            socketio.emit("progress_update", payload)
            self.last_emit_time = now
            logger.debug(f"Progress emitted for {self.task_id}: {self.progress}% - {self.message}")
        except Exception as e:
            logger.error(f"Error emitting progress_update for {self.task_id}: {e}")

    def handle_error(self, error_msg: str, stage: Optional[str] = None, details: Optional[Dict] = None):
        """
        Handle task error and emit error event.
        
        Args:
            error_msg: Error message
            stage: Optional processing stage where error occurred
            details: Optional error details
        """
        self.error_message = error_msg
        self.error_details = details or {}
        if stage:
            self.error_details["stage_at_failure"] = stage
        self.status = "failed"
        
        logger.error(f"Task {self.task_id} ({self.task_type}) failed: {error_msg}. Details: {self.error_details}")

        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()

        # Prepare and emit payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "error": self.error_message,
            "error_details": self.error_details,
            "stats": serialized_stats,
            "progress": self.progress,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_error", payload)
        except Exception as e:
            logger.error(f"Error emitting task_error for {self.task_id}: {e}")
        
        # Clean up task if error handling happens outside _run_process's finally block
        if self.task_id in active_tasks:
            remove_task(self.task_id)

    def emit_completion(self):
        """Emit task completion event via Socket.IO."""
        self.status = "completed"
        self.progress = 100
        self.message = "Task completed successfully."
        duration_seconds = round(time.time() - self.start_time, 2)
        
        logger.info(f"Task {self.task_id} ({self.task_type}) completed in {duration_seconds}s.")

        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            if hasattr(self.stats, 'finish_processing'):
                self.stats.finish_processing()  # Finalize stats object if method exists
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()
        
        serialized_stats["total_duration_seconds"] = duration_seconds  # Ensure this is in final stats

        # Prepare and emit payload
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "progress": self.progress,
            "stats": serialized_stats,
            "output_file": self.output_file,
            "duration_seconds": duration_seconds,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_completed", payload)
        except Exception as e:
            logger.error(f"Error emitting task_completed for {self.task_id}: {e}")

    def cancel(self) -> bool:
        """
        Cancel the task with improved force termination support.
        """
        if self.is_cancelled_flag or self.status in ["completed", "failed", "cancelled"]:
            logger.info(f"Task {self.task_id} already cancelled or finished. Current status: {self.status}")
            return False

        # Set cancellation flag
        self.is_cancelled_flag = True
        previous_status = self.status
        self.status = "cancelling"  # Intermediate state
        self.message = "Task cancellation in progress."
        logger.info(f"Attempting to cancel task {self.task_id} ({self.task_type}). Previous status: {previous_status}")
        
        # Thread termination support - more aggressive cancellation
        try:
            if self.thread and self.thread.is_alive():
                # The thread should check is_cancelled_flag, but if it's stuck
                # we need a way to interrupt it more forcefully
                import ctypes
                ctypes.pythonapi.PyThreadState_SetAsyncExc(
                    ctypes.c_long(self.thread.ident),
                    ctypes.py_object(InterruptedError)
                )
                logger.info(f"Sent InterruptedError to thread {self.thread.ident}")
        except Exception as e:
            logger.error(f"Error attempting to force thread cancellation: {e}")

        # Set final cancelled state
        self.status = "cancelled"
        self.message = "Task cancelled by user."
        
        # Emit cancellation event
        payload = {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "message": self.message,
            "timestamp": time.time()
        }
        try:
            socketio.emit("task_cancelled", payload)
            logger.info(f"Emitted task_cancelled for {self.task_id}")
        except Exception as e:
            logger.error(f"Error emitting task_cancelled for {self.task_id}: {e}")
        
        # Remove task from active tasks
        if self.task_id in active_tasks:
            remove_task(self.task_id)
        return True

    def get_status(self) -> Dict[str, Any]:
        """
        Get comprehensive task status information for API requests.
        
        Returns:
            Dict with complete task status info
        """
        now = time.time()
        elapsed_seconds = round(now - self.start_time, 2)
        
        # Prepare serialized stats
        serialized_stats = {}
        if isinstance(self.stats, CustomFileStats):
            serialized_stats = self.stats.to_dict()
        elif isinstance(self.stats, dict):
            serialized_stats = self.stats.copy()
        elif hasattr(self.stats, '__dict__'):
            serialized_stats = self.stats.__dict__.copy()

        # Calculate estimated remaining time
        estimated_remaining_seconds = None
        if 0 < self.progress < 100 and elapsed_seconds > 1:
            estimated_total_time = (elapsed_seconds / self.progress) * 100
            estimated_remaining_seconds = round(estimated_total_time - elapsed_seconds, 2)
        
        # Build comprehensive status info
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "error": self.error_message,
            "error_details": self.error_details,
            "output_file": self.output_file,
            "stats": serialized_stats,
            "start_time_iso": datetime.fromtimestamp(self.start_time).isoformat(),
            "current_time_iso": datetime.fromtimestamp(now).isoformat(),
            "elapsed_seconds": elapsed_seconds,
            "estimated_remaining_seconds": estimated_remaining_seconds,
            "is_running": self.thread.is_alive() if self.thread else False,
            "is_cancelled": self.is_cancelled_flag,
            "detailed_progress": self.detailed_progress
        }

    def _start_memory_monitoring(self):
        """Start a background thread to monitor memory usage."""
        def monitor_memory():
            try:
                import psutil
                process = psutil.Process()
                
                while self.memory_monitor_active:
                    try:
                        # Get memory usage
                        memory_info = process.memory_info()
                        memory_mb = memory_info.rss / (1024 * 1024)
                        
                        # Update stats
                        if hasattr(self.stats, 'peak_memory_usage'):
                            if memory_mb > self.stats.peak_memory_usage:
                                self.stats.peak_memory_usage = memory_mb
                            
                        # Check if memory usage is too high
                        if memory_mb > self.max_allowed_memory_mb:
                            logger.warning(f"Memory usage too high ({memory_mb:.1f}MB). Running garbage collection.")
                            import gc
                            gc.collect()
                            
                        # Sleep to prevent too frequent checks
                        time.sleep(self.memory_check_interval)
                    except Exception as e:
                        logger.debug(f"Error in memory monitoring: {e}")
                        time.sleep(self.memory_check_interval)
            except ImportError:
                logger.debug("psutil not available, memory monitoring disabled")
                
        # Start the monitoring thread
        self.memory_monitor_active = True
        self.memory_monitor_thread = threading.Thread(target=monitor_memory, daemon=True)
        self.memory_monitor_thread.start()

    def _stop_memory_monitoring(self):
        """Stop the memory monitoring thread."""
        if self.memory_monitor_active:
            self.memory_monitor_active = False
            if self.memory_monitor_thread:
                self.memory_monitor_thread.join(timeout=1.0)

# The ProcessingTask implementation doesn't need to change - it inherits the start() method from BaseTask

class ProcessingTask(BaseTask):
    """
    Enhanced task for processing files with comprehensive statistics and performance monitoring.
    Includes integrated cancellation handling to avoid AttributeError issues.
    
    Attributes:
        input_dir (str): Input directory to process
        output_file (str): Output file path
        stats (CustomFileStats): Enhanced statistics tracker
        memory_monitor_active (bool): Whether memory monitoring is active
        memory_monitor_thread (threading.Thread): Thread for memory monitoring
        progress (int): Progress percentage of the task (0-100)
        start_time (float): Task start timestamp
        performance_metrics (dict): Real-time performance tracking
        cancellation_check_interval (int): How often to check for cancellation (iterations)
    """
    
    def __init__(self, task_id: str, input_dir: str, output_file: str):
        """
        Initialize an enhanced file processing task with comprehensive monitoring.
        
        Args:
            task_id: Unique identifier for the task
            input_dir: Directory containing files to process
            output_file: Output file path for the processing results
        """
        super().__init__(task_id, task_type="file_processing")
        
        # Core task attributes
        self.input_dir = self._sanitize_path(input_dir)
        self.output_file = self._sanitize_path(output_file)
        self.stats = CustomFileStats()  # Enhanced stats object
        self.message = f"Preparing to process files in {self.input_dir}"
        self.progress = 0
        self.start_time = time.time()
        
        # Performance tracking
        self.performance_metrics = {
            'cpu_samples': [],
            'memory_samples': [],
            'io_samples': [],
            'processing_checkpoints': [],
            'bottlenecks_detected': []
        }
        
        # Enhanced memory monitoring
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        self.memory_check_interval = 3  # More frequent checks (3 seconds)
        self.memory_trend_data = []
        
        # Processing optimization settings
        self.batch_size = 50  # Process files in batches for better memory management
        self.cancellation_check_interval = 10  # Check every 10 files
        self.adaptive_chunk_size = True  # Dynamically adjust chunk size based on performance
        self.current_chunk_size = DEFAULT_MAX_CHUNK_SIZE
        
        # Enhanced error handling and retry logic
        self.retry_count = 0
        self.max_retries = 3
        self.last_error = None
        self.detailed_progress = {}
        self.processing_stages = []
        
        # Resource management with adaptive limits
        self.max_allowed_memory_mb = 4096  # 4GB default limit
        self.memory_warning_threshold = 3072  # 3GB warning threshold
        self.timeout_seconds = DEFAULT_PROCESS_TIMEOUT
        self.auto_gc_threshold = 2048  # Auto garbage collection at 2GB
        
        # Quality assurance
        self.quality_checks = {
            'file_integrity': True,
            'output_validation': True,
            'performance_monitoring': True,
            'error_analysis': True
        }
        
        # Verify and prepare environment
        self._verify_directories()
        self._initialize_performance_tracking()
        self.error = None

    def _check_internal_cancellation(self) -> bool:
        """
        Internal method for ProcessingTask to check its own cancellation status.
        This avoids the need to go through the global check_task_cancellation function
        and prevents AttributeError issues.
        
        Returns:
            bool: True if task should be cancelled
        """
        try:
            # Check internal cancellation flag first (fastest check)
            if hasattr(self, 'is_cancelled_flag') and self.is_cancelled_flag:
                logger.debug(f"Task {self.task_id} cancelled via is_cancelled_flag")
                return True
            
            # Check status attribute
            if hasattr(self, 'status') and self.status == 'cancelled':
                logger.debug(f"Task {self.task_id} cancelled via status")
                return True
            
            # Also check the global task registry as a backup
            # Use the corrected global function that handles object types properly
            try:
                with tasks_lock:
                    task = active_tasks.get(self.task_id)
                    if task:
                        # Handle both dict and object formats in the global check
                        if hasattr(task, 'get'):
                            # Dictionary format
                            return task.get('cancel_requested', False) or task.get('status') == 'cancelled'
                        elif hasattr(task, 'is_cancelled_flag'):
                            # Object format
                            return getattr(task, 'is_cancelled_flag', False) or getattr(task, 'status', '') == 'cancelled'
                        elif hasattr(task, 'status'):
                            # Basic object with status
                            return getattr(task, 'status', '') == 'cancelled'
                    return False
            except Exception as e:
                logger.debug(f"Error in global cancellation check for {self.task_id}: {e}")
                return False
        
        except Exception as e:
            logger.debug(f"Error in internal cancellation check for {self.task_id}: {e}")
            return False

    def _sanitize_path(self, path: str) -> str:
        """Enhanced path sanitization with additional security checks."""
        if not path:
            return path
        
        # Normalize path separators and resolve relative paths
        normalized = os.path.normpath(os.path.abspath(path))
        
        # Convert to forward slashes for consistency
        normalized = normalized.replace('\\', '/')
        
        # Remove trailing slashes (except root)
        while normalized.endswith('/') and len(normalized) > 1:
            normalized = normalized[:-1]
        
        # Expand user directory if needed
        if normalized.startswith('~/') or normalized == '~':
            normalized = os.path.expanduser(normalized)
        
        # Security check: prevent path traversal attacks
        if '..' in normalized or normalized.startswith('/etc') or normalized.startswith('/sys'):
            logger.warning(f"Potentially unsafe path detected: {path}")
        
        return normalized

    def _verify_directories(self) -> bool:
        """Enhanced directory verification with detailed error reporting."""
        try:
            # Check input directory existence and accessibility
            if not os.path.exists(self.input_dir):
                self.handle_error(
                    f"Input directory does not exist: {self.input_dir}",
                    stage="initialization",
                    details={
                        "suggested_action": "Create the directory or specify an existing path",
                        "current_working_dir": os.getcwd(),
                        "absolute_path": os.path.abspath(self.input_dir)
                    }
                )
                return False
            
            if not os.path.isdir(self.input_dir):
                self.handle_error(
                    f"Input path is not a directory: {self.input_dir}",
                    stage="initialization",
                    details={"path_type": "file" if os.path.isfile(self.input_dir) else "unknown"}
                )
                return False
            
            # Check read permissions
            if not os.access(self.input_dir, os.R_OK):
                self.handle_error(
                    f"No read permission for input directory: {self.input_dir}",
                    stage="initialization",
                    details={"suggested_action": "Check directory permissions"}
                )
                return False
            
            # Check and create output directory
            output_dir = os.path.dirname(self.output_file)
            if output_dir and not os.path.exists(output_dir):
                try:
                    os.makedirs(output_dir, exist_ok=True)
                    logger.info(f"Created output directory: {output_dir}")
                except (OSError, PermissionError) as e:
                    self.handle_error(
                        f"Cannot create output directory: {output_dir}",
                        stage="initialization",
                        details={
                            "error": str(e),
                            "suggested_action": "Check permissions or specify a different output path",
                            "parent_dir_exists": os.path.exists(os.path.dirname(output_dir))
                        }
                    )
                    return False
            
            return True
            
        except Exception as e:
            self.handle_error(
                f"Error during directory verification: {str(e)}",
                stage="initialization",
                details={"exception_type": type(e).__name__}
            )
            return False

    def _initialize_performance_tracking(self):
        """Initialize comprehensive performance tracking systems."""
        try:
            # Record initial system state
            self.performance_metrics['initialization_time'] = time.time()
            self.performance_metrics['initial_memory'] = self._get_current_memory_usage()
            self.performance_metrics['system_info'] = self._gather_system_info()
            
            # Initialize adaptive processing parameters
            self._calibrate_processing_parameters()
            
            logger.debug(f"Performance tracking initialized for task {self.task_id}")
            
        except Exception as e:
            logger.warning(f"Error initializing performance tracking: {e}")

    def _gather_system_info(self) -> dict:
        """Gather system information for performance context."""
        try:
            import psutil
            return {
                'cpu_count': psutil.cpu_count(),
                'available_memory_gb': psutil.virtual_memory().available / (1024**3),
                'disk_free_gb': psutil.disk_usage(os.path.dirname(self.output_file)).free / (1024**3),
                'platform': os.name
            }
        except ImportError:
            return {'platform': os.name, 'psutil_available': False}
        except Exception as e:
            return {'error': str(e)}

    def _calibrate_processing_parameters(self):
        """Dynamically calibrate processing parameters based on system capabilities."""
        try:
            system_info = self.performance_metrics.get('system_info', {})
            available_memory = system_info.get('available_memory_gb', 4)
            
            # Adjust memory thresholds based on available memory
            if available_memory > 8:
                self.max_allowed_memory_mb = min(6144, int(available_memory * 0.75 * 1024))
                self.auto_gc_threshold = int(self.max_allowed_memory_mb * 0.6)
            elif available_memory > 4:
                self.max_allowed_memory_mb = min(3072, int(available_memory * 0.7 * 1024))
                self.auto_gc_threshold = int(self.max_allowed_memory_mb * 0.65)
            else:
                self.max_allowed_memory_mb = 2048
                self.auto_gc_threshold = 1536
            
            # Adjust batch size based on system capabilities
            if available_memory > 8:
                self.batch_size = 100
            elif available_memory > 4:
                self.batch_size = 75
            else:
                self.batch_size = 25
            
            logger.info(f"Calibrated processing parameters: max_memory={self.max_allowed_memory_mb}MB, "
                       f"batch_size={self.batch_size}, gc_threshold={self.auto_gc_threshold}MB")
            
        except Exception as e:
            logger.warning(f"Error calibrating processing parameters: {e}")

    def _get_current_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        try:
            import psutil
            return psutil.Process().memory_info().rss / (1024 * 1024)
        except ImportError:
            return 0.0
        except Exception:
            return 0.0

    def _start_memory_monitoring(self):
        """Enhanced memory monitoring with trend analysis and automatic optimization."""
        def monitor_memory():
            try:
                import psutil
                process = psutil.Process()
                
                while self.memory_monitor_active:
                    try:
                        # Get comprehensive memory information
                        memory_info = process.memory_info()
                        memory_mb = memory_info.rss / (1024 * 1024)
                        
                        # Update stats with enhanced tracking
                        if hasattr(self.stats, 'track_memory_usage'):
                            self.stats.track_memory_usage()
                        
                        # Enhanced memory management logic
                        if memory_mb > self.memory_warning_threshold:
                            logger.warning(f"High memory usage detected: {memory_mb:.1f}MB")
                            
                            # Automatic garbage collection on high memory
                            if memory_mb > self.auto_gc_threshold:
                                import gc
                                gc.collect()
                                self.performance_metrics['gc_events'] = self.performance_metrics.get('gc_events', 0) + 1
                        
                        time.sleep(self.memory_check_interval)
                        
                    except Exception as e:
                        logger.debug(f"Error in memory monitoring iteration: {e}")
                        time.sleep(self.memory_check_interval)
                        
            except ImportError:
                logger.debug("psutil not available, enhanced memory monitoring disabled")
            except Exception as e:
                logger.error(f"Error in memory monitoring thread: {e}")
        
        # Start enhanced monitoring thread
        self.memory_monitor_active = True
        self.memory_monitor_thread = threading.Thread(target=monitor_memory, daemon=True)
        self.memory_monitor_thread.start()
        logger.debug("Enhanced memory monitoring started")

    def _stop_memory_monitoring(self):
        """Stop memory monitoring and generate final memory report."""
        if self.memory_monitor_active:
            self.memory_monitor_active = False
            if self.memory_monitor_thread:
                self.memory_monitor_thread.join(timeout=2.0)

    def _structify_progress_callback(self, processed_count: int, total_count: int, 
                                   stage_message: str, current_file: Optional[str] = None):
        """
        Enhanced callback function with corrected cancellation checking.
        Uses internal cancellation check to avoid AttributeError.
        
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

    def _calculate_processing_efficiency(self) -> dict:
        """Calculate comprehensive task-specific efficiency metrics."""
        try:
            duration = time.time() - self.start_time
            processed_files = getattr(self.stats, 'processed_files', 0)
            total_bytes = getattr(self.stats, 'total_bytes', 0)
            
            efficiency_metrics = {
                'files_per_second': processed_files / duration if duration > 0 else 0,
                'bytes_per_second': total_bytes / duration if duration > 0 else 0,
                'mb_per_second': (total_bytes / (1024 * 1024)) / duration if duration > 0 else 0,
                'overall_efficiency_score': 50  # Default neutral score
            }
            
            # Calculate overall efficiency score (0-100)
            if processed_files > 0 and duration > 0:
                # Base score on processing rate
                rate_score = min(100, efficiency_metrics['files_per_second'] * 20)
                # Base score on throughput
                throughput_score = min(100, efficiency_metrics['mb_per_second'] * 10)
                # Combine scores
                efficiency_metrics['overall_efficiency_score'] = round((rate_score + throughput_score) / 2, 2)
            
            return efficiency_metrics
            
        except Exception as e:
            logger.error(f"Error calculating processing efficiency: {e}")
            return {'error': str(e), 'overall_efficiency_score': 0}

    def _process_logic(self):
        """Enhanced process logic with comprehensive stats and corrected cancellation handling."""
        # Start enhanced monitoring systems
        self._start_memory_monitoring()
        
        try:
            # Validate prerequisites
            if not structify_available:
                self.handle_error("Structify module (claude.py) is not available.", stage="initialization")
                return
            
            # Record processing start
            processing_start_time = time.time()
            self.processing_stages.append({
                'stage': 'initialization', 
                'start_time': processing_start_time,
                'memory_mb': self._get_current_memory_usage()
            })
            
            # Emit enhanced initial progress
            logger.info(f"Task {self.task_id}: Starting enhanced file processing for directory: {self.input_dir}")
            self.message = f"Processing files in {self.input_dir} with enhanced analytics..."
            self.emit_progress_update(
                progress=1, 
                message=self.message,
                details={
                    'stage': 'initialization',
                    'batch_size': self.batch_size,
                    'chunk_size': self.current_chunk_size,
                    'memory_limit_mb': self.max_allowed_memory_mb
                }
            )
            
            # Set up enhanced timeout handler
            def timeout_handler():
                if not self._check_internal_cancellation():
                    logger.warning(f"Task {self.task_id} timeout after {self.timeout_seconds}s")
                    # Set internal cancellation flags
                    self.status = "cancelled"
                    if hasattr(self, 'is_cancelled_flag'):
                        self.is_cancelled_flag = True
                    self.handle_error(
                        f"Task timed out after {self.timeout_seconds} seconds",
                        stage="timeout",
                        details={
                            "timeout_seconds": self.timeout_seconds,
                            "files_processed": getattr(self.stats, 'processed_files', 0)
                        }
                    )
            
            # Start timeout timer
            timeout_timer = None
            if self.timeout_seconds > 0:
                timeout_timer = threading.Timer(self.timeout_seconds, timeout_handler)
                timeout_timer.daemon = True
                timeout_timer.start()
            
            try:
                # Select optimal processing function
                try:
                    from Structify.claude import process_all_files as direct_process_all_files
                    logger.info("Using direct import of process_all_files")
                    process_func = direct_process_all_files
                except ImportError:
                    logger.info("Using process_all_files from components")
                    process_func = process_all_files
                
                # Record processing stage
                self.processing_stages.append({
                    'stage': 'main_processing',
                    'start_time': time.time(),
                    'memory_mb': self._get_current_memory_usage()
                })
                
                # Enhanced processing call with optimized parameters
                logger.info(f"Starting main processing with batch_size={self.batch_size}, "
                           f"chunk_size={self.current_chunk_size}")
                
                result_data = process_func(
                    root_directory=self.input_dir,
                    output_file=self.output_file,
                    max_chunk_size=self.current_chunk_size,
                    executor_type="thread",
                    max_workers=min(DEFAULT_NUM_THREADS, self.batch_size // 10 + 1),
                    stop_words=DEFAULT_STOP_WORDS,
                    use_cache=False,
                    valid_extensions=DEFAULT_VALID_EXTENSIONS,
                    ignore_dirs="venv,node_modules,.git,__pycache__,dist,build,.pytest_cache",
                    stats_only=False,
                    include_binary_detection=True,
                    overlap=DEFAULT_CHUNK_OVERLAP,
                    max_file_size=MAX_FILE_SIZE,
                    timeout=self.timeout_seconds,
                    progress_callback=self._structify_progress_callback,
                    stats_obj=self.stats,
                    error_on_empty=False,
                    include_failed_files=True
                )
                
            finally:
                # Cancel timeout timer
                if timeout_timer:
                    timeout_timer.cancel()
                
                # Record processing completion
                self.processing_stages.append({
                    'stage': 'processing_complete',
                    'start_time': time.time(),
                    'memory_mb': self._get_current_memory_usage()
                })
            
            # Check for cancellation after processing
            if self._check_internal_cancellation():
                logger.info(f"Task {self.task_id} processing was cancelled.")
                self.status = "cancelled"
                return
            
            # Enhanced result validation and processing
            if self._validate_processing_results(result_data):
                # Finalize stats with enhanced information
                if hasattr(self.stats, 'finish_processing'):
                    self.stats.finish_processing()
                
                # Calculate comprehensive performance metrics
                end_time = time.time()
                task_duration = end_time - self.start_time
                
                performance_metrics = {
                    'task_duration': task_duration,
                    'processing_efficiency': self._calculate_processing_efficiency(),
                    'processing_stages': self.processing_stages,
                    'adaptive_optimizations': {
                        'final_chunk_size': self.current_chunk_size,
                        'final_batch_size': self.batch_size,
                        'gc_events': self.performance_metrics.get('gc_events', 0)
                    }
                }
                
                # Success case - emit enhanced completion
                self.status = "completed"
                self.progress = 100
                
                try:
                    # Try to use enhanced completion emission
                    emit_enhanced_task_completion(
                        task_id=self.task_id,
                        task_type=self.task_type,
                        output_file=self.output_file,
                        stats=self.stats,
                        performance_metrics=performance_metrics
                    )
                    
                    # Add to task history
                    add_task_to_history(
                        self.task_id,
                        self.task_type,
                        self.stats,
                        self.output_file
                    )
                    
                    logger.info(f"Task {self.task_id} completed with enhanced stats showcase")
                    
                except NameError:
                    # Fallback to standard completion if enhanced stats not available
                    logger.warning("Enhanced stats showcase not available, using standard completion")
                    emit_task_completion(
                        self.task_id,
                        self.task_type,
                        self.output_file,
                        self.stats
                    )
                except Exception as e:
                    logger.error(f"Error in enhanced task completion: {e}")
                    # Fallback to standard completion
                    emit_task_completion(
                        self.task_id,
                        self.task_type,
                        self.output_file,
                        self.stats
                    )
            
        except InterruptedError:
            # Handle cancellation gracefully
            logger.info(f"Task {self.task_id} processing cancelled via InterruptedError.")
            self.status = "cancelled"
            raise
            
        except Exception as e:
            # Enhanced error handling with performance context
            error_context = {
                "traceback": traceback.format_exc(),
                "performance_metrics": self.performance_metrics,
                "memory_at_error": self._get_current_memory_usage(),
                "processing_stages": self.processing_stages
            }
            
            logger.error(f"Enhanced error during _process_logic for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(
                str(e),
                stage="enhanced_processing_execution",
                details=error_context
            )
            
        finally:
            # Enhanced cleanup and final reporting
            self._stop_memory_monitoring()
            
            # Log comprehensive final stats
            try:
                final_duration = time.time() - self.start_time
                logger.info(f"Task {self.task_id} enhanced final stats: "
                           f"processed={getattr(self.stats, 'processed_files', 0)}, "
                           f"errors={getattr(self.stats, 'error_files', 0)}, "
                           f"skipped={getattr(self.stats, 'skipped_files', 0)}, "
                           f"pdfs={getattr(self.stats, 'pdf_files', 0)}, "
                           f"duration={final_duration:.2f}s, "
                           f"efficiency={self._calculate_processing_efficiency().get('overall_efficiency_score', 0)}")
            except Exception as e:
                logger.debug(f"Error logging enhanced final stats: {e}")

    def _validate_processing_results(self, result_data) -> bool:
        """Enhanced validation of processing results with detailed quality checks."""
        try:
            # Update task's output_file if modified by process_all_files
            if result_data and isinstance(result_data, dict) and "output_file" in result_data:
                self.output_file = result_data["output_file"]
            
            # Update stats object from result if needed
            if result_data and isinstance(result_data, dict) and "stats" in result_data:
                self._merge_stats_from_result(result_data["stats"])
            
            # Check for processing errors
            if result_data and isinstance(result_data, dict) and result_data.get("error"):
                error_msg = result_data["error"]
                self.handle_error(
                    error_msg,
                    stage="structify_processing_validation"
                )
                return False
            
            # Validate result data existence
            if not result_data:
                self.handle_error(
                    "No results returned from processing",
                    stage="result_validation"
                )
                return False
            
            # Enhanced output file validation
            return self._validate_output_file()
            
        except Exception as e:
            logger.error(f"Error validating processing results: {e}")
            self.handle_error(
                f"Error during result validation: {str(e)}",
                stage="validation_error"
            )
            return False

    def _merge_stats_from_result(self, result_stats):
        """Merge statistics from processing result into task stats."""
        try:
            if isinstance(self.stats, CustomFileStats) and isinstance(result_stats, dict):
                # Merge dict stats into CustomFileStats object
                for key, value in result_stats.items():
                    if hasattr(self.stats, key):
                        setattr(self.stats, key, value)
            elif hasattr(result_stats, 'to_dict'):
                # If result_stats is also a CustomFileStats object, use it directly
                self.stats = result_stats
            else:
                # Fallback for incompatible types
                logger.warning(f"Stats type mismatch: expected CustomFileStats, got {type(result_stats)}")
                self.stats = result_stats
                
        except Exception as e:
            logger.error(f"Error merging stats from result: {e}")

    def _validate_output_file(self) -> bool:
        """Enhanced output file validation with quality metrics."""
        try:
            if not os.path.exists(self.output_file):
                self.handle_error(
                    "Processing completed but output file was not created",
                    stage="output_validation"
                )
                return False
            
            # Check file size and content quality
            file_size = os.path.getsize(self.output_file)
            if file_size < 100:  # Less than 100 bytes is suspiciously small
                self.handle_error(
                    "Output file was created but appears to be empty or nearly empty",
                    stage="output_size_validation"
                )
                return False
            
            logger.info(f"Output file validation passed: {self.output_file} ({file_size} bytes)")
            return True
            
        except Exception as e:
            self.handle_error(
                f"Error validating output file: {str(e)}",
                stage="output_validation_error"
            )
            return False

    def emit_progress_update(self, progress=None, message=None, details=None):
        """Enhanced progress update emission with performance context."""
        if progress is not None:
            self.progress = progress
        
        # Add performance context to details
        if details is None:
            details = {}
        
        # Enhance details with current performance metrics
        details.update({
            'memory_usage_mb': self._get_current_memory_usage(),
            'current_chunk_size': self.current_chunk_size,
            'current_batch_size': self.batch_size,
            'gc_events': self.performance_metrics.get('gc_events', 0)
        })
        
        # Call parent class method if available
        if hasattr(super(), 'emit_progress_update'):
            super().emit_progress_update(progress=progress, message=message, details=details)
        
        # Enhanced logging with performance context
        if message and progress is not None:
            logger.info(f"Task {self.task_id} progress: {self.progress}% - {message}")

    def get_status(self):
        """Enhanced status information with comprehensive metrics."""
        elapsed_time = time.time() - self.start_time
        
        # Enhanced status information
        status_info = {
            "task_id": self.task_id,
            "status": self.status,
            "message": self.message,
            "progress": self.progress,
            "input_dir": self.input_dir,
            "output_file": self.output_file,
            "elapsed_time": elapsed_time,
            "start_time": self.start_time,
            "performance_metrics": {
                "memory_usage_mb": self._get_current_memory_usage(),
                "processing_rate": self.detailed_progress.get("processing_rate", 0),
                "current_chunk_size": self.current_chunk_size,
                "current_batch_size": self.batch_size,
                "gc_events": self.performance_metrics.get('gc_events', 0)
            }
        }
        
        # Add comprehensive stats if available
        if hasattr(self, 'stats') and self.stats:
            try:
                if hasattr(self.stats, 'to_dict'):
                    status_info["stats"] = self.stats.to_dict()
                else:
                    status_info["stats"] = self.stats
            except Exception as e:
                logger.debug(f"Error adding stats to status: {e}")
                status_info["stats"] = {"error": "Stats unavailable"}
        
        # Add error information if available
        if hasattr(self, 'error') and self.error:
            status_info["error"] = self.error
        
        return status_info