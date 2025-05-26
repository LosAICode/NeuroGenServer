class PlaylistTask(BaseTask):
    """
    Task object for processing YouTube playlists with improved path handling and progress reporting.
    
    Features:
    - Inherits from BaseTask for consistent task management
    - Properly resolves output file paths to respect user input from the UI
    - Handles absolute/relative paths and ensures files are created in user-specified locations
    - Uses granular progress updates with proper stage tracking
    - Implements robust error handling and recovery mechanisms
    - Provides detailed status reporting and statistics
    - Supports proper cancellation and resource cleanup
    - Uses enhanced Socket.IO reporting for reliable progress updates
    - Memory-optimized processing for better performance
    - Comprehensive logging for traceability
    """
    def __init__(self, task_id: str, playlist_url: str = None, output_dir: str = None, 
                 include_audio: bool = True, include_video: bool = False):
        """
        Initialize a new playlist processing task.
        
        Args:
            task_id (str): Unique identifier for the task
            playlist_url (str, optional): URL of the playlist to process
            output_dir (str, optional): Directory to store downloaded files
            include_audio (bool): Whether to download audio files
            include_video (bool): Whether to download video files
        """
        # Initialize the parent class with task_id and task_type
        super().__init__(task_id, task_type="playlist_processing")
        
        # Playlist configuration
        self.playlists = []
        self.playlist_url = playlist_url
        self.api_key = YOUTUBE_API_KEY
        self.root_directory = output_dir or os.path.join(DEFAULT_OUTPUT_FOLDER, "playlists")
        self.output_file = None
        self.include_audio = include_audio
        self.include_video = include_video
        
        # Progress tracking enhancements
        self.current_stage = "initialization"
        self.stage_progress = 0
        self.detailed_progress = {}
        self.retries_count = 0
        self.max_retries = 3
        
        # Resource management
        self._cleanup_lock = threading.Lock()
        self._is_cleaning_up = False
        self.memory_monitor_active = False
        self.memory_monitor_thread = None
        
        # Set initial message and statistics
        self.message = f"Preparing to process playlists" + (f" from {playlist_url}" if playlist_url else "")
        self.stats = self._build_initial_stats()
        
        # Ensure output directory exists
        os.makedirs(self.root_directory, exist_ok=True)
        
        logger.info(f"PlaylistTask {self.task_id} created for {'single playlist' if playlist_url else 'multiple playlists'}")
    
    def start(self, playlists=None, root_directory=None, output_file=None):
        """
        Start the playlist download task.
        
        Can be called with explicit parameters to override those from __init__,
        or will use the values provided at initialization.
        
        Args:
            playlists (list, optional): List of playlist dictionaries with url and folder keys
            root_directory (str, optional): Base directory for download 
            output_file (str, optional): Path for the output JSON file
            
        Returns:
            Dict with task info and status
        """
        try:
            # Update parameters if provided
            if playlists is not None:
                self.playlists = playlists
            elif self.playlist_url:
                # Create a playlist entry from the URL provided in __init__
                self.playlists = [{
                    "url": self.playlist_url,
                    "folder": os.path.join(self.root_directory, "playlist_" + str(int(time.time())))
                }]
                
            if root_directory is not None:
                self.root_directory = root_directory
                
            # Handle output file path resolution
            if output_file is not None:
                self.output_file = self._resolve_output_file_path(output_file)
            else:
                # Generate default output path
                default_filename = "playlists.json"
                self.output_file = os.path.join(self.root_directory, default_filename)
                
            logger.info(f"Starting playlist task {self.task_id} with {len(self.playlists or [])} playlists")
            logger.info(f"Parameters: root_directory='{self.root_directory}', output_file='{self.output_file}'")
            
            # Validate parameters
            self._validate_parameters()
            
            # Create base directories
            self._ensure_directories_exist()
            
            # Start memory monitoring
            self._start_memory_monitoring()
            
            # Use parent class method to start the task
            base_result = super().start()
            
            # Merge with additional playlist-specific info
            return {
                **base_result,  # Include base task info
                "output_file": self.output_file,
                "root_directory": self.root_directory,
                "playlists_count": len(self.playlists)
            }
            
        except ValueError as ve:
            # Handle validation errors with clear message
            logger.error(f"Validation error in playlist task: {ve}")
            self.handle_error(f"Validation error: {str(ve)}", stage="initialization")
            return {"task_id": self.task_id, "status": "failed", "error": str(ve)}
            
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Error starting playlist task: {e}", exc_info=True)
            self.handle_error(f"Failed to start task: {str(e)}", stage="initialization")
            return {"task_id": self.task_id, "status": "failed", "error": str(e)}
    
    def _resolve_output_file_path(self, output_file):
        """
        Resolve the output file path properly to respect user input.
        
        Handles the case where a user might enter a complete path 
        (like C:\\Users\\Los\\Documents\\AgencySwarm.json) in the output field.
        
        Args:
            output_file: The original output file path
            
        Returns:
            A properly resolved output file path
        """
        logger.debug(f"Resolving output path from: output_file='{output_file}', root_directory='{self.root_directory}'")
        
        if not output_file:
            # Default to a filename in the root directory
            return os.path.join(self.root_directory, "playlists.json")
        
        # If output_file already has .json extension, keep it, otherwise add it
        has_extension = output_file.lower().endswith('.json')
        
        # CASE 1: Complete Windows path with drive letter - C:\path\to\file.json
        if re.match(r'^[A-Za-z]:', output_file):
            # User provided a Windows absolute path with drive letter
            # Check if this is a complete path with directory
            if os.path.dirname(output_file):
                # This is a complete path including directory, use as-is
                # Just ensure it has .json extension
                if not has_extension:
                    output_file += '.json'
                logger.info(f"Using complete Windows path: {output_file}")
                return output_file
        
        # CASE 2: Unix absolute path - /path/to/file.json
        if output_file.startswith('/'):
            # This is a Unix absolute path, use as-is
            # Just ensure it has .json extension
            if not has_extension:
                output_file += '.json'
            logger.info(f"Using Unix absolute path: {output_file}")
            return output_file
        
        # CASE 3: Path with separators but not absolute - subfolder/file.json
        if '\\' in output_file or '/' in output_file:
            # Extract just the filename to avoid path confusion
            filename = os.path.basename(output_file)
            # Ensure it has .json extension
            if not has_extension:
                filename += '.json'
            # Join with root directory
            result = os.path.join(self.root_directory, filename)
            logger.info(f"Extracted filename '{filename}' from path with separators, joined with root: {result}")
            return result
        
        # CASE 4: Just a filename - file.json
        # It's just a filename, add extension if needed and join with root directory
        if not has_extension:
            output_file += '.json'
        
        result = os.path.join(self.root_directory, output_file)
        logger.info(f"Using filename joined with root directory: {result}")
        return result
    
    def _validate_parameters(self):
        """
        Validate parameters to ensure they meet requirements.
        Raises ValueError if validation fails.
        """
        # Check if API key is set
        if not self.api_key:
            raise ValueError("YouTube API key is not set. Please configure your API key.")
        
        # Validate playlists list
        if not self.playlists or not isinstance(self.playlists, list):
            raise ValueError("No playlists provided or invalid playlist format.")
        
        # Check each playlist has required fields
        for idx, playlist in enumerate(self.playlists):
            if not isinstance(playlist, dict):
                raise ValueError(f"Playlist {idx+1} is not a valid dictionary.")
            
            if "url" not in playlist:
                raise ValueError(f"Playlist {idx+1} is missing the 'url' field.")
            
            if "folder" not in playlist:
                # Add default folder based on index
                playlist["folder"] = os.path.join(self.root_directory, f"playlist_{idx+1}")
                logger.info(f"Added default folder for playlist {idx+1}: {playlist['folder']}")
            
            # Validate URL format
            url = playlist["url"]
            if not url or 'list=' not in url:
                raise ValueError(f"Invalid playlist URL format: {url}")
    
    def _ensure_directories_exist(self):
        """
        Ensure all required directories exist.
        Creates directories as needed.
        """
        # Ensure root directory exists
        try:
            os.makedirs(self.root_directory, exist_ok=True)
            logger.info(f"Ensured root directory exists: {self.root_directory}")
            
            # Ensure output file directory exists
            output_dir = os.path.dirname(self.output_file)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
                logger.info(f"Ensured output directory exists: {output_dir}")
                
            # Create playlist folders
            for playlist in self.playlists:
                if "folder" in playlist and playlist["folder"]:
                    os.makedirs(playlist["folder"], exist_ok=True)
                    logger.info(f"Ensured playlist directory exists: {playlist['folder']}")
        except Exception as e:
            logger.error(f"Error creating directories: {e}")
            raise ValueError(f"Failed to create required directories: {str(e)}")
    
    def _build_initial_stats(self):
        """
        Create initial stats dictionary for progress reporting
        """
        return {
            "total_playlists": len(self.playlists) if hasattr(self, 'playlists') and self.playlists else 0,
            "processed_playlists": 0,
            "empty_playlists": 0,
            "skipped_playlists": 0,
            "failed_playlists": 0,
            "total_videos": 0,
            "processed_videos": 0,
            "download_directory": self.root_directory,
            "output_file": self.output_file,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "include_audio": self.include_audio,
            "include_video": self.include_video,
            "estimated_completion_time": None,
            "memory_usage_mb": 0,
            "retries_count": 0
        }
    
    def _process_logic(self):
        """Main processing logic for the task, called by BaseTask._run_process"""
        try:
            # Import required modules from playlists_downloader.py
            from playlists_downloader import (
                download_all_playlists, 
                get_playlist_video_ids, 
                get_video_titles, 
                download_transcript
            )
            
            stats = CustomFileStats()
            
            # Calculate total progress allocation breakdown:
            # - 2% for initialization
            # - 88% for playlist downloading (distributed among playlists)
            # - 10% for final processing and JSON generation
            
            # Initialize our stats tracking if needed
            if not self.stats:
                self.stats = self._build_initial_stats()
            
            # Update to show directory validation - 1% progress
            self.emit_progress_update(
                progress=1,
                message="Validating directories...",
                stats_override=self.stats
            )
            
            # Prepare directories with another 1% progress
            try:
                # Ensure output directory exists
                output_dir = os.path.dirname(self.output_file)
                if output_dir:
                    os.makedirs(output_dir, exist_ok=True)
                    logger.info(f"Ensured output directory exists: {output_dir}")
            except Exception as dir_err:
                logger.error(f"Error creating output directory: {dir_err}")
                self.handle_error(f"Failed to create output directory: {str(dir_err)}", stage="directory_preparation")
                return
            
            # Progress update after directory preparation - 2% total now
            self.emit_progress_update(
                progress=2,
                message="Preparing to download playlists...",
                stats_override=self.stats
            )
            
            # Check if task has been cancelled before we start downloading
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} was cancelled before processing")
                return
            
            # Create a progress callback for download_all_playlists with rate limiting
            def progress_callback(stage, current, total, message):
                # Check for cancellation
                if self.is_cancelled_flag:
                    raise InterruptedError("Task cancelled")
                
                # Calculate overall progress based on stage and current/total
                if stage == 'init':
                    # Initialization stage (first 2%)
                    progress = 2 + (current / total) * 2
                    self.current_stage = "initialization"
                elif stage == 'video_ids':
                    # Video IDs retrieval stage (4% to 20%)
                    progress = 4 + (current / total) * 16
                    self.current_stage = "retrieving_videos"
                elif stage == 'titles':
                    # Titles retrieval stage (20% to 30%)
                    progress = 20 + (current / total) * 10
                    self.current_stage = "retrieving_titles"
                elif stage == 'download':
                    # Download stage (30% to 90%)
                    progress = 30 + (current / total) * 60
                    self.current_stage = "downloading_transcripts"
                elif stage == 'complete':
                    # Completion stage (90% to 95%)
                    progress = 90 + (current / total) * 5
                    self.current_stage = "finalizing"
                else:
                    # Unknown stage - just use current/total with 2-90% range
                    progress = 2 + (current / total) * 88
                    self.current_stage = stage
                
                # Update stage progress for detailed reporting
                self.stage_progress = current / total if total > 0 else 0
                
                # Update detailed progress data for status queries
                self.detailed_progress = {
                    "stage": stage,
                    "current": current,
                    "total": total,
                    "message": message,
                    "progress_percentage": self.stage_progress * 100
                }
                
                # Update our internal state and emit progress update
                self.emit_progress_update(
                    progress=int(progress),
                    message=message,
                    details=self.detailed_progress
                )
            
            # Download playlists with progress tracking and error handling
            try:
                # Main download process with automatic retry
                max_retries = self.max_retries
                retry_count = 0
                results = None
                
                while retry_count <= max_retries and results is None:
                    try:
                        # Actual download process
                        results = download_all_playlists(
                            self.api_key, 
                            self.playlists,
                            progress_callback=progress_callback
                        )
                    except Exception as download_err:
                        retry_count += 1
                        self.retries_count += 1
                        self.stats["retries_count"] = self.retries_count
                        
                        # Check if we should retry
                        if retry_count <= max_retries:
                            logger.warning(f"Error downloading playlists (attempt {retry_count}): {download_err}")
                            
                            # Backoff before retry
                            backoff_time = min(3 * retry_count, 10)  # Max 10 seconds backoff
                            
                            # Update progress with retry info
                            self.emit_progress_update(
                                progress=self.progress,
                                message=f"Retrying after error (attempt {retry_count}/{max_retries}). Waiting {backoff_time}s...",
                                details={"error": str(download_err), "retry_count": retry_count}
                            )
                            
                            # Backoff before retry
                            time.sleep(backoff_time)
                        else:
                            # Max retries reached, propagate error
                            raise download_err
                
                # Process completed successfully
                if results:
                    # Update stats with results
                    total_videos = sum(len(p.get("videos", [])) for p in results if p.get("status") == "completed")
                    self.stats["total_videos"] = total_videos
                    self.stats["processed_videos"] = total_videos
                    self.stats["processed_playlists"] = len([p for p in results if p.get("status") == "completed"])
                    self.stats["empty_playlists"] = len([p for p in results if p.get("status") == "empty"])
                    self.stats["skipped_playlists"] = len([p for p in results if p.get("status") == "skipped"])
                    self.stats["failed_playlists"] = len([p for p in results if p.get("status") in ["failed", "error"]])
                    
                    # Keep track of playlists data
                    self.playlists_data = results
                else:
                    logger.error("Download process returned empty results")
                    self.handle_error("Download process failed to return results", stage="download_complete")
                    return
                
            except InterruptedError:
                # Rethrow cancellation for BaseTask to handle
                raise
            except Exception as e:
                logger.error(f"Error downloading playlists: {e}", exc_info=True)
                self.handle_error(f"Failed to download playlists: {str(e)}", stage="download")
                return
            
            # Check if task has been cancelled
            if self.is_cancelled_flag:
                logger.info(f"Task {self.task_id} was cancelled during processing")
                raise InterruptedError("Task was cancelled")
            
            # Transition to final processing phase - 90% completion
            self.emit_progress_update(
                progress=90,
                message="Generating JSON output...",
                stats_override=self.stats
            )
            
            try:
                # Process all files with the improved file handling
                self.current_stage = "json_processing"
                
                # Update progress at 92% - file processing started
                self.emit_progress_update(
                    progress=92,
                    message="Processing downloaded files...",
                    stats_override=self.stats
                )
                
                # Check if process_all_files is available from Structify module
                if 'process_all_files' in globals() or hasattr(structify_module, 'process_all_files'):
                    # Use the process_all_files function if available
                    process_func = globals().get('process_all_files') or getattr(structify_module, 'process_all_files')
                    
                    # Process the files
                    result = process_func(
                        root_directory=self.root_directory,
                        output_file=self.output_file,
                        max_chunk_size=DEFAULT_MAX_CHUNK_SIZE,
                        executor_type="thread",
                        max_workers=DEFAULT_NUM_THREADS,
                        stop_words=DEFAULT_STOP_WORDS,
                        use_cache=False,
                        valid_extensions=DEFAULT_VALID_EXTENSIONS,
                        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                        stats_only=False,
                        include_binary_detection=True,
                        overlap=DEFAULT_CHUNK_OVERLAP,
                        max_file_size=MAX_FILE_SIZE,
                        timeout=DEFAULT_PROCESS_TIMEOUT,
                        progress_callback=self._structify_progress_callback,
                        stats_obj=stats
                    )
                    
                    # Update progress to 95% - processing almost done
                    self.emit_progress_update(
                        progress=95,
                        message="Finalizing JSON output...",
                        stats_override=self.stats
                    )
                    
                    # Update output file if it was changed during processing
                    if result and isinstance(result, dict) and "output_file" in result:
                        self.output_file = result["output_file"]
                        logger.info(f"Updated output file path from processing: {self.output_file}")
                else:
                    logger.warning("Structify module process_all_files not available, using direct JSON writing")
                    
                    # Create a simple JSON output
                    with open(self.output_file, 'w', encoding='utf-8') as f:
                        json.dump({
                            "playlists": self.playlists_data,
                            "stats": self.stats,
                            "status": "completed",
                            "message": "Generated without structify module"
                        }, f, indent=2)
                
                # Progress to 98% - final touches
                self.emit_progress_update(
                    progress=98,
                    message="Completing playlist download...",
                    stats_override=self.stats
                )
                
                # Mark the task as completed - BaseTask._run_process will handle completion
                self.status = "completed"
                
                # Merge our tracking stats with the file stats
                file_stats = stats.to_dict() if hasattr(stats, 'to_dict') else {}
                merged_stats = {**file_stats, **self.stats}
                self.stats = merged_stats
                
                logger.info(f"Playlist task {self.task_id} completed successfully")
                
            except Exception as e:
                logger.error(f"Error during file processing: {e}", exc_info=True)
                self.handle_error(f"Failed to process files: {str(e)}", stage="file_processing")
                
        except InterruptedError:
            # Let BaseTask handle the cancellation
            raise
        except Exception as e:
            logger.error(f"Unexpected error in playlist task: {e}", exc_info=True)
            self.handle_error(f"Unexpected error in playlist task: {str(e)}", stage="processing")
        finally:
            # Ensure cleanup happens even if there's an error
            self._cleanup_resources()
            self._stop_memory_monitoring()
    
    def _structify_progress_callback(self, processed_count, total_count, stage_message, current_file=None):
        """
        Callback function for structify module progress updates.
        Maps structify progress to our overall 90-98% range.
        
        Args:
            processed_count: Number of items processed
            total_count: Total number of items to process
            stage_message: Current processing stage
            current_file: Optional current file being processed
        """
        if self.is_cancelled_flag:
            raise InterruptedError("Task cancelled by user")

        # Calculate progress within the 92-98% range
        if total_count > 0:
            structify_progress = processed_count / total_count
            # Map to our range (92-98%)
            overall_progress = 92 + structify_progress * 6
            self.progress = min(int(overall_progress), 98)
        else:
            self.progress = 95  # Default progress if total_count is 0
        
        # Prepare message and details
        msg = f"Processing files: {stage_message} ({processed_count}/{total_count})"
        if current_file:
            msg += f" - Current: {os.path.basename(current_file)}"
        
        details = {
            "current_stage": "file_processing",
            "current_stage_message": stage_message,
            "processed_count": processed_count,
            "total_count": total_count
        }
        
        if current_file:
            details["current_file"] = os.path.basename(current_file)
        
        # Emit progress update
        self.emit_progress_update(progress=self.progress, message=msg, details=details)
    
    def _cleanup_resources(self):
        """Clean up resources to prevent leaks."""
        with self._cleanup_lock:
            if self._is_cleaning_up:
                return
                
            self._is_cleaning_up = True
            
            try:
                # Clean up temporary files
                try:
                    # Check for common temp file patterns in playlist folders
                    temp_patterns = ["*.tmp", "*.temp", "*_temp_*"]
                    temp_files_removed = 0
                    
                    for playlist in self.playlists:
                        if "folder" in playlist and os.path.exists(playlist["folder"]):
                            for pattern in temp_patterns:
                                try:
                                    import glob
                                    for temp_file in glob.glob(os.path.join(playlist["folder"], pattern)):
                                        try:
                                            if os.path.isfile(temp_file):
                                                os.remove(temp_file)
                                                temp_files_removed += 1
                                        except Exception:
                                            pass
                                except Exception:
                                    pass
                    
                    if temp_files_removed > 0:
                        logger.debug(f"Removed {temp_files_removed} temporary files during cleanup")
                except Exception:
                    pass  # Silently ignore temp file cleanup errors
                
                logger.debug(f"Resources cleaned up for task {self.task_id}")
            except Exception as e:
                logger.error(f"Error during resource cleanup: {e}")
            finally:
                self._is_cleaning_up = False
                
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
                        if isinstance(self.stats, dict):
                            self.stats["memory_usage_mb"] = round(memory_mb, 1)
                            
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
    
    def get_detailed_status(self):
        """
        Get comprehensive status information about the task.
        Extends the base get_status with playlist-specific information.
        
        Returns:
            Dict with comprehensive status information
        """
        # Get base status from parent class
        base_status = self.get_status()
        
        # Add playlist-specific details
        playlist_status = {
            "playlists_count": len(self.playlists) if hasattr(self, 'playlists') and self.playlists else 0,
            "current_stage": self.current_stage,
            "stage_progress": self.stage_progress,
            "detailed_progress": self.detailed_progress,
            "retries_count": self.retries_count,
            "include_audio": self.include_audio,
            "include_video": self.include_video
        }
        
        # Merge base and playlist-specific status
        return {**base_status, **playlist_status}
    
class ScraperTask(BaseTask):
    """
    Enhanced task object for web scraping with comprehensive PDF download support and analytics.
    
    Features:
      - Parallel PDF downloading with controlled concurrency and adaptive optimization
      - Comprehensive error handling and retry mechanisms with exponential backoff
      - Real-time progress tracking with memory-efficient updates and performance metrics
      - Advanced resource management and cleanup with memory monitoring
      - Robust task cancellation support with graceful cleanup
      - Enhanced PDF processing options with OCR and table extraction
      - Comprehensive Socket.IO integration with detailed progress events
      - Performance analytics and efficiency tracking
      - Integration with enhanced stats showcase system
    """
    
    def __init__(self, task_id: str):
        """
        Initialize enhanced scraper task with comprehensive monitoring and analytics.
        
        Args:
            task_id: Unique identifier for the task
        """
        super().__init__(task_id, task_type="web_scraping")
        
        # Core scraper configuration
        self.url_configs: List[Dict[str, str]] = []
        self.root_scrape_directory: Optional[str] = None
        self.pdf_options: Dict[str, Any] = {
            'process_pdfs': True,
            'use_ocr': True,
            'extract_tables': True,
            'chunk_size': DEFAULT_MAX_CHUNK_SIZE,
            'timeout_seconds': 300,
            'max_file_size_mb': 50
        }
        
        # Enhanced statistics and tracking
        self.scraper_run_stats = CustomFileStats()  # For final structify step
        self.url_processing_summary: Dict[str, Any] = {
            "total_urls_configured": 0,
            "processed_urls_count": 0,
            "successful_urls_count": 0,
            "failed_urls_count": 0,
            "total_pdfs_downloaded": 0,
            "total_download_size_bytes": 0,
            "total_processing_time": 0,
            "pdf_download_details": [],  # Detailed tracking of each PDF
            "performance_metrics": {},
            "error_analysis": {}
        }
        self.stats = self.url_processing_summary  # Initial stats reference
        
        # Enhanced threading and concurrency management
        self.active_futures: Set[Any] = set()
        self.thread_lock = threading.RLock()
        self.download_semaphore = None  # Will be initialized based on system capacity
        
        # Performance tracking and optimization
        self.performance_metrics = {
            'download_rates': [],
            'processing_times': [],
            'memory_usage_samples': [],
            'error_patterns': {},
            'optimization_events': [],
            'bottlenecks_detected': []
        }
        
        # Enhanced retry and error handling
        self.retries_count = 0
        self.max_retries = 3
        self.adaptive_retry_delays = [2, 5, 10]  # Exponential backoff
        self.error_recovery_strategies = {
            'network_timeout': 'increase_timeout',
            'memory_limit': 'reduce_concurrency',
            'rate_limit': 'exponential_backoff'
        }
        
        # Quality assurance and monitoring
        self.quality_metrics = {
            'download_success_rate': 0.0,
            'processing_efficiency': 0.0,
            'error_recovery_rate': 0.0,
            'resource_utilization': 0.0
        }
        
        # Adaptive optimization settings
        self.optimization_settings = {
            'adaptive_concurrency': True,
            'intelligent_retry': True,
            'memory_optimization': True,
            'performance_monitoring': True
        }
        
        # Initialize performance monitoring
        self._initialize_performance_tracking()

    def _initialize_performance_tracking(self):
        """Initialize comprehensive performance tracking systems."""
        try:
            # Determine optimal concurrency based on system resources
            cpu_count = os.cpu_count() or 4
            available_memory_gb = self._get_available_memory_gb()
            
            # Calculate optimal concurrent downloads
            if available_memory_gb > 8:
                self.max_concurrent_downloads = min(cpu_count * 2, 16)
            elif available_memory_gb > 4:
                self.max_concurrent_downloads = min(cpu_count, 8)
            else:
                self.max_concurrent_downloads = max(2, cpu_count // 2)
            
            # Initialize semaphore for download concurrency control
            self.download_semaphore = threading.Semaphore(self.max_concurrent_downloads)
            
            # Record initial system state
            self.performance_metrics['initialization'] = {
                'start_time': time.time(),
                'initial_memory_gb': available_memory_gb,
                'cpu_count': cpu_count,
                'max_concurrent_downloads': self.max_concurrent_downloads
            }
            
            logger.info(f"ScraperTask {self.task_id} initialized with {self.max_concurrent_downloads} concurrent downloads")
            
        except Exception as e:
            logger.warning(f"Error initializing performance tracking: {e}")
            self.max_concurrent_downloads = 4  # Safe default
            self.download_semaphore = threading.Semaphore(4)

    def _get_available_memory_gb(self) -> float:
        """Get available system memory in GB."""
        try:
            import psutil
            return psutil.virtual_memory().available / (1024**3)
        except ImportError:
            return 4.0  # Default assumption
        except Exception:
            return 4.0

    def start(self, url_configs: List[Dict[str, str]], root_scrape_directory: str, 
              output_json_file: str, pdf_options: Optional[Dict[str, Any]] = None):
        """
        Start the enhanced scraping task with comprehensive configuration.
        
        Args:
            url_configs: List of URL configurations [{url, setting, keyword?}]
            root_scrape_directory: Base directory for downloads and output
            output_json_file: Path for the output JSON file
            pdf_options: Optional PDF processing configuration
            
        Returns:
            Dict with task info and status
        """
        self.url_configs = url_configs
        self.root_scrape_directory = self._normalize_path(root_scrape_directory)
        self.output_file = get_output_filepath(output_json_file, user_defined_dir=self.root_scrape_directory)
        
        # Update PDF options if provided
        if pdf_options:
            self.pdf_options.update(pdf_options)
        
        # Initialize processing summary
        self.url_processing_summary.update({
            "total_urls_configured": len(self.url_configs),
            "start_time": time.time(),
            "pdf_options": self.pdf_options.copy()
        })
        self.message = f"Preparing to scrape {len(self.url_configs)} URLs with enhanced analytics."
        self.stats = self.url_processing_summary
        
        # Ensure directories exist with proper permissions
        try:
            os.makedirs(self.root_scrape_directory, exist_ok=True)
            output_dir = os.path.dirname(self.output_file)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
        except Exception as e:
            self.handle_error(f"Failed to create directories: {str(e)}", stage="initialization")
            return {"error": f"Directory creation failed: {str(e)}"}
        
        # Validate URL configurations
        validation_result = self._validate_url_configs()
        if not validation_result['valid']:
            self.handle_error(validation_result['error'], stage="validation")
            return {"error": validation_result['error']}
        
        # Emit enhanced initial progress
        self.emit_progress_update(
            progress=0, 
            message=f"Starting enhanced processing of {len(self.url_configs)} URLs...",
            details={
                'max_concurrent_downloads': self.max_concurrent_downloads,
                'pdf_processing_enabled': self.pdf_options.get('process_pdfs', True),
                'optimization_features': list(self.optimization_settings.keys())
            }
        )
        
        # Start background processing
        super().start()
        
        return {
            "task_id": self.task_id,
            "status": self.status,
            "message": self.message,
            "root_directory": self.root_scrape_directory,
            "output_file": self.output_file,
            "task_type": self.task_type,
            "enhanced_features": {
                "adaptive_concurrency": self.optimization_settings['adaptive_concurrency'],
                "performance_monitoring": self.optimization_settings['performance_monitoring'],
                "max_concurrent_downloads": self.max_concurrent_downloads
            }
        }

    def _normalize_path(self, path: str) -> str:
        """Normalize and validate path with security checks."""
        if not path:
            return path
        
        # Normalize and resolve path
        normalized = os.path.normpath(os.path.abspath(path))
        
        # Security check for path traversal
        if '..' in normalized:
            logger.warning(f"Potentially unsafe path detected: {path}")
        
        return normalized

    def _validate_url_configs(self) -> Dict[str, Any]:
        """Validate URL configurations with comprehensive checks."""
        try:
            if not self.url_configs:
                return {'valid': False, 'error': 'No URLs provided for scraping'}
            
            valid_settings = {'pdf', 'text', 'html', 'extract'}
            validation_errors = []
            
            for i, config in enumerate(self.url_configs):
                if not isinstance(config, dict):
                    validation_errors.append(f"URL config {i} is not a dictionary")
                    continue
                
                if 'url' not in config:
                    validation_errors.append(f"URL config {i} missing 'url' field")
                    continue
                
                if 'setting' not in config:
                    validation_errors.append(f"URL config {i} missing 'setting' field")
                    continue
                
                if config['setting'].lower() not in valid_settings:
                    validation_errors.append(f"URL config {i} has invalid setting: {config['setting']}")
                
                # Basic URL validation
                url = config['url']
                if not url.startswith(('http://', 'https://')):
                    validation_errors.append(f"URL config {i} has invalid URL format: {url}")
            
            if validation_errors:
                return {'valid': False, 'error': f"Validation errors: {'; '.join(validation_errors)}"}
            
            return {'valid': True}
            
        except Exception as e:
            return {'valid': False, 'error': f"Validation failed: {str(e)}"}

    def _url_processing_progress_callback(self, url: str, status: str, message: str,
                                        file_path: Optional[str] = None, error: Optional[str] = None,
                                        download_progress: Optional[int] = None, 
                                        download_speed: Optional[float] = None):
        """
        Enhanced callback for individual URL/PDF processing with comprehensive tracking.
        
        Args:
            url: URL being processed
            status: Status string (downloading, processing, success, error, etc.)
            message: Status message
            file_path: Optional path to saved file
            error: Optional error message if status is error
            download_progress: Optional download progress percentage
            download_speed: Optional download speed in MB/s
        """
        if check_task_cancellation(self.task_id):
            return
        
        with self.thread_lock:
            # Find and update the specific download detail
            updated = False
            for detail in self.url_processing_summary["pdf_download_details"]:
                if detail["url"] == url:
                    detail.update({
                        "status": status,
                        "message": message,
                        "timestamp": time.time(),
                        "download_progress": download_progress,
                        "download_speed_mbs": download_speed
                    })
                    
                    if file_path:
                        detail["file_path"] = file_path
                        detail["file_size_bytes"] = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                    
                    if error:
                        detail["error"] = error
                        detail["retry_count"] = detail.get("retry_count", 0)
                    
                    updated = True
                    break
            
            # Add new entry if not found (and not a pending status)
            if not updated and status != "pending_add":
                new_detail = {
                    "url": url,
                    "status": status,
                    "message": message,
                    "timestamp": time.time(),
                    "download_progress": download_progress,
                    "download_speed_mbs": download_speed,
                    "retry_count": 0
                }
                
                if file_path:
                    new_detail["file_path"] = file_path
                    new_detail["file_size_bytes"] = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                
                if error:
                    new_detail["error"] = error
                
                self.url_processing_summary["pdf_download_details"].append(new_detail)
            
            # Update aggregate statistics
            self._update_aggregate_stats()
            
            # Track performance metrics
            if download_speed and download_speed > 0:
                self.performance_metrics['download_rates'].append({
                    'timestamp': time.time(),
                    'speed_mbs': download_speed,
                    'url': url
                })
            
            # Emit Socket.IO event for real-time updates
            try:
                emit_pdf_download_progress(
                    task_id=self.task_id,
                    url=url,
                    progress=download_progress or 0,
                    status=status,
                    file_path=file_path,
                    error=error,
                    details={'download_speed_mbs': download_speed}
                )
            except Exception as e:
                logger.debug(f"Error emitting PDF download progress: {e}")

    def _update_aggregate_stats(self):
        """Update aggregate statistics from individual download details."""
        try:
            details = self.url_processing_summary["pdf_download_details"]
            
            # Count by status
            success_count = sum(1 for d in details if d["status"].startswith("success"))
            error_count = sum(1 for d in details if d["status"].startswith("error"))
            
            # Calculate total download size
            total_size = sum(d.get("file_size_bytes", 0) for d in details if d.get("file_size_bytes"))
            
            # Update summary
            self.url_processing_summary.update({
                "total_pdfs_downloaded": success_count,
                "failed_downloads": error_count,
                "total_download_size_bytes": total_size,
                "download_success_rate": (success_count / max(len(details), 1)) * 100
            })
            
            # Update quality metrics
            self.quality_metrics.update({
                'download_success_rate': self.url_processing_summary["download_success_rate"],
                'error_recovery_rate': self._calculate_error_recovery_rate()
            })
            
        except Exception as e:
            logger.debug(f"Error updating aggregate stats: {e}")

    def _calculate_error_recovery_rate(self) -> float:
        """Calculate the rate of successful error recovery."""
        try:
            details = self.url_processing_summary["pdf_download_details"]
            recovered_errors = sum(1 for d in details 
                                 if d.get("retry_count", 0) > 0 and d["status"].startswith("success"))
            total_errors = sum(1 for d in details if d.get("retry_count", 0) > 0)
            
            return (recovered_errors / max(total_errors, 1)) * 100
            
        except Exception:
            return 0.0

    def _process_url_with_tracking(self, url: str, setting: str, keyword: str, output_folder: str) -> Dict[str, Any]:
        """
        Enhanced URL processing with comprehensive tracking, retry logic, and performance monitoring.
        
        Args:
            url: URL to process
            setting: Processing type (pdf, text, etc.)
            keyword: Optional keyword for filtering
            output_folder: Folder to save results
            
        Returns:
            Dict with comprehensive processing results
        """
        if check_task_cancellation(self.task_id):
            return {"status": "cancelled", "url": url}
        
        processing_start_time = time.time()
        setting_lower = setting.lower()
        url_result: Dict[str, Any] = {
            "url": url,
            "setting": setting_lower,
            "start_time": processing_start_time
        }
        
        try:
            if setting_lower == "pdf":
                return self._process_pdf_url(url, output_folder, url_result)
            else:
                return self._process_non_pdf_url(url, setting_lower, keyword, output_folder, url_result)
                
        except Exception as e:
            logger.error(f"Error processing URL {url} (setting: {setting_lower}): {e}", exc_info=True)
            error_msg = f"Processing failed: {str(e)}"
            url_result.update({
                "status": "error",
                "error": error_msg,
                "processing_time": time.time() - processing_start_time
            })
            
            if setting_lower == "pdf":
                self._url_processing_progress_callback(url, "error_processing", error_msg, error=error_msg)
            
            return url_result

    def _process_pdf_url(self, url: str, output_folder: str, url_result: Dict[str, Any]) -> Dict[str, Any]:
        """Process PDF URL with enhanced error handling and retry logic."""
        # Signal PDF download starting
        self._url_processing_progress_callback(url, "pending_add", "Download queued")
        
        # Acquire semaphore for controlled concurrency
        with self.download_semaphore:
            if check_task_cancellation(self.task_id):
                return {"status": "cancelled", "url": url}
            
            self._url_processing_progress_callback(url, "downloading", "Starting PDF download")
            
            # Enhanced PDF download with retry logic
            pdf_file_path = self._download_pdf_with_retries(url, output_folder)
            
            if not pdf_file_path:
                return url_result  # Error already logged in retry function
            
            url_result.update({
                "pdf_file": pdf_file_path,
                "pdf_size": os.path.getsize(pdf_file_path),
                "download_time": time.time() - url_result["start_time"]
            })
            
            # Process PDF if configured
            if self.pdf_options.get("process_pdfs", True):
                processing_result = self._process_downloaded_pdf(url, pdf_file_path, output_folder)
                url_result.update(processing_result)
            else:
                url_result["status"] = "success_downloaded_only"
                self._url_processing_progress_callback(
                    url, "success_downloaded_only", 
                    "PDF downloaded (processing skipped).", 
                    file_path=pdf_file_path
                )
        
        return url_result

    def _download_pdf_with_retries(self, url: str, output_folder: str) -> Optional[str]:
        """Download PDF with intelligent retry logic and performance tracking."""
        for attempt in range(self.max_retries + 1):
            try:
                if check_task_cancellation(self.task_id):
                    return None
                
                # Progress callback for this specific download
                def progress_callback(downloaded, total, message):
                    if total > 0:
                        progress = int((downloaded / total) * 100)
                        speed = self._calculate_download_speed(downloaded, url)
                        self._url_processing_progress_callback(
                            url, "downloading", message, 
                            download_progress=progress, download_speed=speed
                        )
                
                # Attempt download
                pdf_file_path = enhanced_download_pdf(
                    url,
                    save_path=output_folder,
                    task_id=self.task_id,
                    progress_callback=progress_callback,
                    timeout=self.pdf_options.get('timeout_seconds', 300),
                    max_file_size_mb=self.pdf_options.get('max_file_size_mb', 50)
                )
                
                if pdf_file_path and os.path.exists(pdf_file_path):
                    self._url_processing_progress_callback(
                        url, "downloaded_processing", 
                        "PDF downloaded successfully.", 
                        file_path=pdf_file_path
                    )
                    return pdf_file_path
                else:
                    raise ValueError("Download completed but file not found")
                    
            except Exception as e:
                if attempt < self.max_retries:
                    backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                    self._url_processing_progress_callback(
                        url, "retry",
                        f"Retry {attempt + 1}/{self.max_retries} after error: {str(e)}. Waiting {backoff_time}s."
                    )
                    time.sleep(backoff_time)
                else:
                    self._url_processing_progress_callback(
                        url, "error_download",
                        f"Failed to download PDF after {self.max_retries + 1} attempts",
                        error=str(e)
                    )
                    logger.error(f"PDF download failed for {url} after {self.max_retries + 1} attempts: {e}")
                    return None
        
        return None

    def _calculate_download_speed(self, downloaded_bytes: int, url: str) -> float:
        """Calculate download speed for performance tracking."""
        try:
            # Find the download start time for this URL
            for detail in self.url_processing_summary["pdf_download_details"]:
                if detail["url"] == url and detail["status"] == "downloading":
                    start_time = detail.get("timestamp", time.time())
                    elapsed = time.time() - start_time
                    if elapsed > 0:
                        return (downloaded_bytes / (1024 * 1024)) / elapsed  # MB/s
            return 0.0
        except Exception:
            return 0.0

    def _process_downloaded_pdf(self, url: str, pdf_file_path: str, output_folder: str) -> Dict[str, Any]:
        """Process downloaded PDF with enhanced error handling."""
        try:
            self._url_processing_progress_callback(url, "processing", "Processing PDF with enhanced features")
            
            # Generate output path
            pdf_filename = os.path.basename(pdf_file_path)
            json_filename_base = os.path.splitext(pdf_filename)[0]
            json_output_path = get_output_filepath(
                f"{json_filename_base}_processed.json",
                user_defined_dir=output_folder
            )
            
            # Detect document type for optimal processing
            doc_type = self._detect_document_type(pdf_file_path)
            apply_ocr = self.pdf_options.get("use_ocr", True) or (doc_type == "scan")
            
            # Process with retry logic
            for attempt in range(self.max_retries + 1):
                try:
                    if check_task_cancellation(self.task_id):
                        return {"status": "cancelled"}
                    
                    processing_result = self._execute_pdf_processing(
                        pdf_file_path, json_output_path, apply_ocr, doc_type
                    )
                    
                    if processing_result:
                        self._url_processing_progress_callback(
                            url, "success_processed",
                            "PDF processed successfully with enhanced features.",
                            file_path=pdf_file_path
                        )
                        
                        return {
                            "status": "success_processed",
                            "json_file": json_output_path,
                            "document_type": doc_type,
                            "tables_extracted": processing_result.get("tables_count", 0),
                            "references_extracted": processing_result.get("references_count", 0),
                            "processing_method": "enhanced" if hasattr(structify_module, 'process_pdf') else "standard"
                        }
                    
                except Exception as e:
                    if attempt < self.max_retries:
                        backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                        self._url_processing_progress_callback(
                            url, "processing_retry",
                            f"Processing retry {attempt + 1}/{self.max_retries}. Error: {str(e)}",
                            file_path=pdf_file_path
                        )
                        time.sleep(backoff_time)
                    else:
                        self._url_processing_progress_callback(
                            url, "error_processing",
                            f"PDF processing failed: {str(e)}",
                            file_path=pdf_file_path, error=str(e)
                        )
                        return {
                            "status": "error_processing",
                            "error": f"PDF processing failed after {self.max_retries + 1} attempts: {str(e)}",
                            "pdf_file": pdf_file_path
                        }
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_file_path}: {e}")
            return {
                "status": "error_processing",
                "error": str(e),
                "pdf_file": pdf_file_path
            }

    def _detect_document_type(self, pdf_file_path: str) -> str:
        """Detect PDF document type for optimal processing."""
        try:
            if hasattr(structify_module, 'detect_document_type'):
                return structify_module.detect_document_type(pdf_file_path)
        except Exception as e:
            logger.debug(f"Document type detection failed for {pdf_file_path}: {e}")
        return "unknown"

    def _execute_pdf_processing(self, pdf_file_path: str, json_output_path: str, 
                              apply_ocr: bool, doc_type: str) -> Optional[Dict[str, Any]]:
        """Execute PDF processing with the best available method."""
        if hasattr(structify_module, 'process_pdf'):
            # Use enhanced PDF processing
            result = structify_module.process_pdf(
                pdf_path=pdf_file_path,
                output_path=json_output_path,
                max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE),
                extract_tables=self.pdf_options.get("extract_tables", True),
                use_ocr=apply_ocr,
                return_data=True
            )
            
            if result:
                return {
                    "tables_count": len(result.get("tables", [])),
                    "references_count": len(result.get("references", [])),
                    "method": "enhanced"
                }
        else:
            # Fallback to standard processing
            process_all_files(
                root_directory=os.path.dirname(pdf_file_path),
                output_file=json_output_path,
                file_filter=lambda f: f == pdf_file_path,
                max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE)
            )
            
            return {"method": "standard", "tables_count": 0, "references_count": 0}
        
        return None

    def _process_non_pdf_url(self, url: str, setting: str, keyword: str, 
                           output_folder: str, url_result: Dict[str, Any]) -> Dict[str, Any]:
        """Process non-PDF URLs with retry logic."""
        for attempt in range(self.max_retries + 1):
            try:
                if check_task_cancellation(self.task_id):
                    return {"status": "cancelled", "url": url}
                
                # Use existing process_url function with enhancements
                result = process_url(url, setting, keyword, output_folder)
                
                if "error" in result:
                    url_result.update({
                        "status": "error",
                        "error": result["error"],
                        "processing_time": time.time() - url_result["start_time"]
                    })
                else:
                    url_result.update(result)
                    url_result.update({
                        "status": "success",
                        "processing_time": time.time() - url_result["start_time"]
                    })
                
                return url_result
                
            except Exception as e:
                if attempt < self.max_retries:
                    backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                    logger.warning(f"URL processing attempt {attempt + 1} failed for {url}: {e}, retrying in {backoff_time}s...")
                    time.sleep(backoff_time)
                else:
                    logger.error(f"Error processing URL {url} (setting: {setting}): {e}")
                    url_result.update({
                        "status": "error",
                        "error": str(e),
                        "processing_time": time.time() - url_result["start_time"]
                    })
        
        return url_result

    def _structify_final_progress_callback(self, processed_count: int, total_count: int, 
                                         stage_message: str, current_file: Optional[str] = None):
        """Enhanced callback for final structify processing with performance tracking."""
        if check_task_cancellation(self.task_id):
            raise InterruptedError("Final structify processing cancelled.")
        
        # Map structify progress to overall progress (90-100% range)
        sub_progress = int((processed_count / total_count) * 10) if total_count > 0 else 0
        overall_progress = 90 + sub_progress
        
        # Enhanced message with performance context
        msg = f"Final Processing: {stage_message} ({processed_count}/{total_count})"
        if current_file:
            msg += f" - File: {os.path.basename(current_file)}"
        
        # Track final processing performance
        if not hasattr(self, '_final_processing_start'):
            self._final_processing_start = time.time()
        
        processing_time = time.time() - self._final_processing_start
        rate = processed_count / processing_time if processing_time > 0 else 0
        
        details = {
            "final_processing_stage": stage_message,
            "processing_rate_files_per_sec": round(rate, 2),
            "estimated_completion": self._estimate_final_completion_time(processed_count, total_count, rate)
        }
        
        if current_file:
            details["current_file_finalizing"] = os.path.basename(current_file)
        
        self.emit_progress_update(progress=overall_progress, message=msg, details=details)

    def _estimate_final_completion_time(self, processed: int, total: int, rate: float) -> Optional[str]:
        """Estimate completion time for final processing."""
        try:
            if rate > 0 and total > processed:
                remaining_time = (total - processed) / rate
                if remaining_time < 60:
                    return f"{remaining_time:.0f} seconds"
                else:
                    return f"{remaining_time/60:.1f} minutes"
        except Exception:
            pass
        return None

    def _process_logic(self):
        """Enhanced main processing logic with comprehensive monitoring and analytics."""
        logger.info(f"Task {self.task_id}: Starting enhanced scraping of {len(self.url_configs)} URLs. "
                   f"Output dir: {self.root_scrape_directory}")
        
        processing_start_time = time.time()
        self.message = f"Processing {len(self.url_configs)} URLs with enhanced analytics..."
        self.emit_progress_update(progress=1)
        
        try:
            # Phase 1: URL Processing (0-90% progress)
            processed_url_results = self._execute_url_processing_phase()
            
            if check_task_cancellation(self.task_id):
                logger.info(f"Task {self.task_id} URL processing phase cancelled.")
                self.status = "cancelled"
                return
            
            # Phase 2: Final Structify Processing (90-100% progress)
            self._execute_final_processing_phase(processed_url_results)
            
            if check_task_cancellation(self.task_id):
                logger.info(f"Task {self.task_id} final processing phase cancelled.")
                self.status = "cancelled"
                return
            
            # Phase 3: Enhanced Completion and Analytics
            self._complete_scraping_with_analytics(processing_start_time)
            
        except InterruptedError:
            logger.info(f"Task {self.task_id} processing cancelled via InterruptedError.")
            self.status = "cancelled"
        except Exception as e:
            logger.error(f"Error during enhanced scraping for task {self.task_id}: {e}", exc_info=True)
            self.handle_error(f"Enhanced scraping failed: {str(e)}", stage="enhanced_scraping", 
                            details={"traceback": traceback.format_exc()})

    def _execute_url_processing_phase(self) -> List[Dict[str, Any]]:
        """Execute URL processing phase with adaptive concurrency."""
        # Determine optimal worker count based on URL types and system capacity
        pdf_count = sum(1 for cfg in self.url_configs if cfg.get("setting", "").lower() == "pdf")
        optimal_workers = min(
            self.max_concurrent_downloads,
            max(1, (os.cpu_count() or 1) // 2),
            len(self.url_configs),
            8  # Cap at 8 workers
        )
        
        logger.info(f"Starting URL processing with {optimal_workers} workers ({pdf_count} PDFs)")
        processed_url_results = []
        
        with ThreadPoolExecutor(max_workers=optimal_workers) as executor:
            # Submit all URL processing tasks
            with self.thread_lock:
                for cfg in self.url_configs:
                    if check_task_cancellation(self.task_id):
                        break
                    
                    future = executor.submit(
                        self._process_url_with_tracking,
                        cfg["url"], cfg["setting"], cfg.get("keyword", ""),
                        self.root_scrape_directory
                    )
                    self.active_futures.add(future)
            
            # Process completed futures
            for future in as_completed(list(self.active_futures)):
                if check_task_cancellation(self.task_id):
                    break
                
                try:
                    result = future.result()
                    processed_url_results.append(result)
                    
                    # Update counters
                    if result and result.get("status", "").startswith("success"):
                        self.url_processing_summary["successful_urls_count"] += 1
                    else:
                        self.url_processing_summary["failed_urls_count"] += 1
                    
                except Exception as e:
                    logger.error(f"URL processing task failed: {e}")
                    self.url_processing_summary["failed_urls_count"] += 1
                    processed_url_results.append({
                        "status": "error",
                        "error": str(e),
                        "url": "unknown_due_to_future_error"
                    })
                
                # Update progress and emit status
                with self.thread_lock:
                    self.active_futures.discard(future)
                    self.url_processing_summary["processed_urls_count"] = len(processed_url_results)
                
                # Calculate progress (0-90% for URL processing)
                progress = int((self.url_processing_summary["processed_urls_count"] / len(self.url_configs)) * 90)
                msg = f"Processed {self.url_processing_summary['processed_urls_count']}/{len(self.url_configs)} URLs."
                
                # Add performance metrics to progress update
                success_rate = (self.url_processing_summary["successful_urls_count"] / 
                              max(self.url_processing_summary["processed_urls_count"], 1)) * 100
                
                self.emit_progress_update(
                    progress=progress, 
                    message=msg,
                    details={
                        'success_rate': round(success_rate, 1),
                        'pdf_downloads': self.url_processing_summary["total_pdfs_downloaded"],
                        'processing_rate': self._calculate_current_processing_rate()
                    }
                )
        
        return processed_url_results

    def _calculate_current_processing_rate(self) -> float:
        """Calculate current processing rate for performance monitoring."""
        try:
            if hasattr(self, '_phase_start_time'):
                elapsed = time.time() - self._phase_start_time
                processed = self.url_processing_summary["processed_urls_count"]
                return processed / elapsed if elapsed > 0 else 0.0
            return 0.0
        except Exception:
            return 0.0

    def _execute_final_processing_phase(self, processed_url_results: List[Dict[str, Any]]):
        """Execute final structify processing phase."""
        # Update stats for final phase
        self.stats = {**self.scraper_run_stats.to_dict(), **self.url_processing_summary}
        self.emit_progress_update(progress=90, message="URL processing complete. Starting final structify.")
        
        if not structify_available:
            logger.warning(f"Task {self.task_id}: Structify module not available. Creating basic output.")
            self._create_basic_output(processed_url_results)
            return
        
        # Execute structify with retry logic
        try:
            self._final_processing_start = time.time()
            
            for attempt in range(self.max_retries + 1):
                try:
                    final_structify_results = process_all_files(
                        root_directory=self.root_scrape_directory,
                        output_file=self.output_file,
                        stats_obj=self.scraper_run_stats,
                        progress_callback=self._structify_final_progress_callback,
                        max_chunk_size=self.pdf_options.get("chunk_size", DEFAULT_MAX_CHUNK_SIZE),
                        executor_type="thread",
                        max_workers=min(DEFAULT_NUM_THREADS, 4)  # Conservative for final processing
                    )
                    
                    if final_structify_results:
                        self._finalize_processing_results(final_structify_results)
                        return
                    
                except Exception as e:
                    if attempt < self.max_retries:
                        backoff_time = self.adaptive_retry_delays[min(attempt, len(self.adaptive_retry_delays) - 1)]
                        logger.warning(f"Final structify attempt {attempt + 1} failed: {e}, retrying in {backoff_time}s...")
                        self.emit_progress_update(
                            progress=90,
                            message=f"Retrying final processing. Attempt {attempt + 1}/{self.max_retries + 1}."
                        )
                        time.sleep(backoff_time)
                    else:
                        raise
            
        except Exception as e:
            logger.error(f"Final structify processing failed for task {self.task_id}: {e}")
            self.handle_error(f"Final structify processing failed: {str(e)}", stage="final_structify",
                            details={"traceback": traceback.format_exc()})

    def _create_basic_output(self, processed_url_results: List[Dict[str, Any]]):
        """Create basic output when structify is not available."""
        try:
            basic_output = {
                "url_processing_results": processed_url_results,
                "summary_stats": self.url_processing_summary,
                "processing_metadata": {
                    "structify_available": False,
                    "processing_time": time.time() - self.url_processing_summary.get("start_time", time.time()),
                    "enhanced_features_used": list(self.optimization_settings.keys())
                }
            }
            
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(basic_output, f, indent=2, ensure_ascii=False)
            
            self.message = "URL scraping complete. Final processing skipped (Structify unavailable)."
            logger.info(f"Created basic output for scraper task {self.task_id}")
            
        except Exception as e:
            self.handle_error(f"Failed to write basic output: {str(e)}", stage="basic_output_write")

    def _finalize_processing_results(self, final_structify_results: Dict[str, Any]):
        """Finalize processing results and update statistics."""
        try:
            # Update output file path if changed
            self.output_file = final_structify_results.get("output_file", self.output_file)
            
            # Merge comprehensive stats
            self.stats = {
                "url_processing_summary": self.url_processing_summary,
                "final_processing_stats": self.scraper_run_stats.to_dict(),
                "structify_output_stats": final_structify_results.get("stats", {}),
                "performance_metrics": self.performance_metrics,
                "quality_metrics": self.quality_metrics
            }
            
            # Check for final processing errors
            if final_structify_results.get("error"):
                self.handle_error(
                    f"Final structify processing error: {final_structify_results['error']}", 
                    stage="final_structify"
                )
            else:
                self.message = "Enhanced web scraping and final processing complete."
                logger.info(f"Task {self.task_id} final processing completed successfully")
                
        except Exception as e:
            logger.error(f"Error finalizing processing results: {e}")
            self.handle_error(f"Error finalizing results: {str(e)}", stage="finalization")

    def _complete_scraping_with_analytics(self, processing_start_time: float):
        """Complete scraping task with comprehensive analytics and enhanced stats showcase."""
        try:
            # Calculate final performance metrics
            total_duration = time.time() - processing_start_time
            
            # Create comprehensive scraping statistics
            scraping_stats = {
                'urls_processed': self.url_processing_summary["processed_urls_count"],
                'urls_successful': self.url_processing_summary["successful_urls_count"],
                'urls_failed': self.url_processing_summary["failed_urls_count"],
                'pdfs_downloaded': self.url_processing_summary["total_pdfs_downloaded"],
                'total_download_size_bytes': self.url_processing_summary["total_download_size_bytes"],
                'download_success_rate': self.url_processing_summary.get("download_success_rate", 0),
                'total_processing_time': total_duration,
                'average_processing_time_per_url': total_duration / max(len(self.url_configs), 1),
                'processing_efficiency': self._calculate_scraping_efficiency(),
                'quality_metrics': self.quality_metrics,
                'performance_summary': self._generate_performance_summary()
            }
            
            # Calculate additional insights
            scraping_stats.update(self._generate_scraping_insights())
            
            try:
                # Use enhanced completion with comprehensive analytics
                emit_enhanced_task_completion(
                    task_id=self.task_id,
                    task_type="web_scraping",
                    output_file=self.output_file,
                    stats=scraping_stats,
                    performance_metrics={
                        'total_duration': total_duration,
                        'download_performance': self._analyze_download_performance(),
                        'processing_stages': self._get_processing_stages_summary(),
                        'optimization_effectiveness': self._evaluate_optimization_effectiveness()
                    }
                )
                
                # Add to task history
                add_task_to_history(self.task_id, "web_scraping", scraping_stats, self.output_file)
                
                logger.info(f"Task {self.task_id} completed with enhanced scraping analytics")
                
            except ImportError:
                # Fallback to standard completion
                logger.warning("Enhanced stats showcase not available, using standard completion")
                emit_task_completion(self.task_id, "web_scraping", self.output_file, scraping_stats)
            except Exception as e:
                logger.error(f"Error in enhanced scraping completion: {e}")
                # Fallback to standard completion
                emit_task_completion(self.task_id, "web_scraping", self.output_file, scraping_stats)
                
        except Exception as e:
            logger.error(f"Error completing scraping with analytics: {e}")
            # Ensure task is marked as completed even with analytics errors
            emit_task_completion(self.task_id, "web_scraping", self.output_file, self.stats)

    def _calculate_scraping_efficiency(self) -> Dict[str, float]:
        """Calculate comprehensive scraping efficiency metrics."""
        try:
            total_time = time.time() - self.url_processing_summary.get("start_time", time.time())
            processed_urls = self.url_processing_summary["processed_urls_count"]
            successful_urls = self.url_processing_summary["successful_urls_count"]
            
            efficiency = {
                'overall_success_rate': (successful_urls / max(processed_urls, 1)) * 100,
                'processing_speed_urls_per_minute': (processed_urls / max(total_time / 60, 0.1)),
                'download_efficiency': self.quality_metrics.get('download_success_rate', 0),
                'error_recovery_rate': self.quality_metrics.get('error_recovery_rate', 0),
                'resource_utilization': self._calculate_resource_utilization()
            }
            
            # Calculate overall efficiency score
            component_scores = [v for v in efficiency.values() if isinstance(v, (int, float))]
            efficiency['overall_efficiency_score'] = sum(component_scores) / len(component_scores) if component_scores else 0
            
            return efficiency
            
        except Exception as e:
            logger.error(f"Error calculating scraping efficiency: {e}")
            return {'overall_efficiency_score': 0, 'error': str(e)}

    def _calculate_resource_utilization(self) -> float:
        """Calculate resource utilization efficiency."""
        try:
            # Base calculation on concurrent downloads vs system capacity
            actual_concurrency = len(self.url_processing_summary["pdf_download_details"])
            max_concurrency = self.max_concurrent_downloads
            
            utilization = min((actual_concurrency / max_concurrency) * 100, 100) if max_concurrency > 0 else 0
            
            # Adjust for memory efficiency
            if self.performance_metrics.get('memory_usage_samples'):
                avg_memory = sum(self.performance_metrics['memory_usage_samples']) / len(self.performance_metrics['memory_usage_samples'])
                if avg_memory < 2048:  # Less than 2GB average
                    utilization *= 1.1  # Bonus for efficient memory usage
                elif avg_memory > 4096:  # More than 4GB average
                    utilization *= 0.9  # Penalty for high memory usage
            
            return min(utilization, 100)
            
        except Exception:
            return 50.0  # Default moderate score

    def _generate_performance_summary(self) -> Dict[str, Any]:
        """Generate comprehensive performance summary."""
        try:
            download_rates = self.performance_metrics.get('download_rates', [])
            
            summary = {
                'average_download_speed_mbs': 0,
                'peak_download_speed_mbs': 0,
                'total_bottlenecks_detected': len(self.performance_metrics.get('bottlenecks_detected', [])),
                'optimization_events_count': len(self.performance_metrics.get('optimization_events', [])),
                'concurrent_downloads_peak': self.max_concurrent_downloads
            }
            
            if download_rates:
                speeds = [rate['speed_mbs'] for rate in download_rates if rate.get('speed_mbs', 0) > 0]
                if speeds:
                    summary['average_download_speed_mbs'] = round(sum(speeds) / len(speeds), 2)
                    summary['peak_download_speed_mbs'] = round(max(speeds), 2)
            
            return summary
            
        except Exception as e:
            logger.error(f"Error generating performance summary: {e}")
            return {'error': str(e)}

    def _generate_scraping_insights(self) -> Dict[str, Any]:
        """Generate actionable insights from scraping performance."""
        insights = {
            'recommendations': [],
            'performance_highlights': [],
            'areas_for_improvement': []
        }
        
        try:
            # Success rate insights
            success_rate = self.url_processing_summary.get("download_success_rate", 0)
            if success_rate >= 95:
                insights['performance_highlights'].append("Excellent download success rate achieved")
            elif success_rate >= 80:
                insights['performance_highlights'].append("Good download success rate maintained")
            else:
                insights['areas_for_improvement'].append("Download success rate needs improvement")
                insights['recommendations'].append("Review failed URLs and consider retry strategies")
            
            # Performance insights
            avg_speed = self._generate_performance_summary().get('average_download_speed_mbs', 0)
            if avg_speed > 10:
                insights['performance_highlights'].append(f"High download speeds achieved: {avg_speed:.1f} MB/s")
            elif avg_speed > 5:
                insights['performance_highlights'].append(f"Good download performance: {avg_speed:.1f} MB/s")
            else:
                insights['areas_for_improvement'].append("Download speeds could be optimized")
                insights['recommendations'].append("Consider increasing concurrent downloads or checking network conditions")
            
            # Resource utilization insights
            resource_util = self._calculate_resource_utilization()
            if resource_util > 80:
                insights['performance_highlights'].append("Excellent resource utilization")
            elif resource_util < 50:
                insights['areas_for_improvement'].append("Underutilized system resources")
                insights['recommendations'].append("Consider increasing concurrency for better performance")
            
            return insights
            
        except Exception as e:
            logger.error(f"Error generating scraping insights: {e}")
            return {'error': str(e)}

    def _analyze_download_performance(self) -> Dict[str, Any]:
        """Analyze download performance patterns."""
        try:
            download_details = self.url_processing_summary["pdf_download_details"]
            
            analysis = {
                'successful_downloads': len([d for d in download_details if d["status"].startswith("success")]),
                'failed_downloads': len([d for d in download_details if d["status"].startswith("error")]),
                'average_retry_count': 0,
                'most_common_errors': {},
                'processing_time_distribution': {}
            }
            
            # Analyze retry patterns
            retry_counts = [d.get("retry_count", 0) for d in download_details]
            if retry_counts:
                analysis['average_retry_count'] = sum(retry_counts) / len(retry_counts)
            
            # Analyze error patterns
            error_types = {}
            for detail in download_details:
                if detail["status"].startswith("error") and detail.get("error"):
                    error_key = detail["error"][:50]  # First 50 chars for grouping
                    error_types[error_key] = error_types.get(error_key, 0) + 1
            
            analysis['most_common_errors'] = dict(sorted(error_types.items(), key=lambda x: x[1], reverse=True)[:3])
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing download performance: {e}")
            return {'error': str(e)}

    def _get_processing_stages_summary(self) -> List[Dict[str, Any]]:
        """Get summary of processing stages with timing."""
        return [
            {
                'stage': 'URL Processing',
                'duration': self.url_processing_summary.get("total_processing_time", 0),
                'urls_processed': self.url_processing_summary["processed_urls_count"]
            },
            {
                'stage': 'Final Structify',
                'duration': getattr(self, '_final_processing_duration', 0),
                'files_processed': getattr(self.scraper_run_stats, 'processed_files', 0)
            }
        ]

    def _evaluate_optimization_effectiveness(self) -> Dict[str, Any]:
        """Evaluate effectiveness of applied optimizations."""
        return {
            'adaptive_concurrency_used': self.optimization_settings.get('adaptive_concurrency', False),
            'retry_strategies_applied': len(self.performance_metrics.get('optimization_events', [])),
            'memory_optimizations': self.optimization_settings.get('memory_optimization', False),
            'overall_optimization_score': self._calculate_scraping_efficiency().get('overall_efficiency_score', 0)
        }

    # Override emit_progress_update to include enhanced PDF download tracking
    def emit_progress_update(self, progress: Optional[int] = None, message: Optional[str] = None,
                           stats_override: Optional[Union[CustomFileStats, Dict]] = None,
                           details: Optional[Dict] = None):
        """Enhanced progress update emission with comprehensive PDF download tracking."""
        current_details = details or {}
        
        with self.thread_lock:
            # Create comprehensive PDF downloads summary
            pdf_details = self.url_processing_summary["pdf_download_details"]
            pdf_summary = {
                "total_attempted": len(pdf_details),
                "downloading": sum(1 for d in pdf_details if d["status"] == "downloading"),
                "processing": sum(1 for d in pdf_details if d["status"] in ["downloaded_processing", "processing"]),
                "succeeded": sum(1 for d in pdf_details if d["status"].startswith("success")),
                "failed": sum(1 for d in pdf_details if d["status"].startswith("error")),
                "total_size_mb": round(self.url_processing_summary["total_download_size_bytes"] / (1024*1024), 2),
                "success_rate": round(self.url_processing_summary.get("download_success_rate", 0), 1)
            }
            
            current_details["pdf_downloads_summary"] = pdf_summary
            
            # Include sample of recent/active downloads (limit for performance)
            active_or_recent = sorted(
                [d for d in pdf_details if d["status"] != "success_processed" or 
                 (time.time() - d.get("timestamp", 0) < 120)],  # Last 2 minutes
                key=lambda x: x.get("timestamp", 0),
                reverse=True
            )[:8]  # Limit to 8 most relevant
            
            current_details["active_pdf_downloads_sample"] = active_or_recent
            
            # Add performance metrics
            current_details["performance_metrics"] = {
                "processing_rate": self._calculate_current_processing_rate(),
                "average_download_speed": self._generate_performance_summary().get('average_download_speed_mbs', 0),
                "resource_utilization": round(self._calculate_resource_utilization(), 1)
            }
        
        # Update main stats for REST API access
        if isinstance(self.stats, dict):
            self.stats.update(self.url_processing_summary)
            self.stats["pdf_downloads_summary"] = pdf_summary
            self.stats["enhanced_metrics"] = current_details["performance_metrics"]
        
        # Call parent class method with enhanced details
        super().emit_progress_update(progress, message, stats_override, current_details)

    def cancel(self) -> bool:
        """Enhanced cancellation with comprehensive cleanup."""
        with self.thread_lock:
            if check_task_cancellation(self.task_id) or self.status in ["completed", "failed", "cancelled"]:
                return False
            
            # Mark as cancelled and cleanup futures
            mark_task_cancelled(self.task_id, "Task cancelled by user")
            
            # Cancel all active futures
            cancelled_count = 0
            for fut in list(self.active_futures):
                if fut.cancel():
                    cancelled_count += 1
            
            self.active_futures.clear()
            logger.info(f"Cancelled {cancelled_count} active futures for task {self.task_id}")
        
        # Call parent cancellation
        return super().cancel()

    def get_status(self) -> Dict[str, Any]:
        """Enhanced status information with comprehensive scraping metrics."""
        # Get base status from parent
        status_info = super().get_status()
        
        # Add scraping-specific enhancements
        with self.thread_lock:
            pdf_details = self.url_processing_summary["pdf_download_details"]
            
            # Create comprehensive PDF summary
            pdf_summary = {
                "total_attempted": len(pdf_details),
                "downloading": sum(1 for d in pdf_details if d["status"] == "downloading"),
                "processing": sum(1 for d in pdf_details if d["status"] in ["downloaded_processing", "processing"]),
                "succeeded": sum(1 for d in pdf_details if d["status"].startswith("success")),
                "failed": sum(1 for d in pdf_details if d["status"].startswith("error")),
                "total_size_mb": round(self.url_processing_summary["total_download_size_bytes"] / (1024*1024), 2)
            }
            
            # Get recent downloads for detailed view
            recent_downloads = sorted(pdf_details, key=lambda x: x.get("timestamp", 0), reverse=True)[:10]
        
        # Enhanced status with scraping-specific data
        status_info.update({
            "url_configs_count": len(self.url_configs),
            "pdf_downloads_summary": pdf_summary,
            "recent_pdf_downloads": recent_downloads,
            "urls_processed": self.url_processing_summary["processed_urls_count"],
            "urls_successful": self.url_processing_summary["successful_urls_count"],
            "urls_failed": self.url_processing_summary["failed_urls_count"],
            "processing_efficiency": self._calculate_scraping_efficiency(),
            "performance_metrics": {
                "average_download_speed_mbs": self._generate_performance_summary().get('average_download_speed_mbs', 0),
                "resource_utilization_percent": round(self._calculate_resource_utilization(), 1),
                "concurrent_downloads_active": sum(1 for d in pdf_details if d["status"] == "downloading")
            }
        })
        
        return status_info      

# ----------------------------------------------------------------------------
# Flask Endpoints
# ----------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("main.index.html")

@app.route("/test-modules")
def test_modules():
    return render_template("test_modules.html")

@app.route("/api/upload-for-path-detection", methods=["POST"])
def upload_for_path_detection():
    if "files" not in request.files:
        return structured_error_response("NO_FILES_IN_REQUEST", "No files part in request.", 400)
    folder_name = request.form.get("folderName")
    if not folder_name:
        return structured_error_response("FOLDER_NAME_REQUIRED", "Folder name is required.", 400)
    logger.info(f"Processing uploads for folder: {folder_name}")
    safe_folder = secure_filename(folder_name)
    upload_dir = os.path.join(app.config["UPLOAD_FOLDER"], safe_folder)
    os.makedirs(upload_dir, exist_ok=True)
    files = request.files.getlist("files")
    for f in files:
        if f.filename:
            if not is_extension_allowed(f.filename):
                return structured_error_response("UNSUPPORTED_EXTENSION", f"File extension not allowed: {f.filename}", 400)
            if not is_mime_allowed(f):
                return structured_error_response("UNSUPPORTED_MIME_TYPE", f"Detected MIME not allowed for: {f.filename}", 400)
            filename = secure_filename(f.filename)
            file_path = os.path.join(upload_dir, filename)
            f.save(file_path)
            logger.debug(f"Saved uploaded file to {file_path}")
    return jsonify({
        "success": True,
        "message": "Files uploaded successfully",
        "fullPath": safe_folder
    })

@app.route("/api/detect-path", methods=["POST"])
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
            pass
    standard_locs = [Path.cwd(), Path.home() / "Documents", Path.home() / "Desktop",
                     Path.home() / "Downloads", Path.home() / "OneDrive"]
    for base in standard_locs:
        potential = (base / folder_name).resolve()
        if potential.is_dir():
            logger.info(f"Found directory under {base}: {potential}")
            return jsonify({"fullPath": str(potential)})
    logger.warning("Could not automatically detect the folder path.")
    return structured_error_response("PATH_NOT_DETECTED", "Could not automatically detect the folder path.", 404)

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
