#app.py components for Playlist Downloader 
class PlaylistTask(BaseTask):
    """
    Task object for processing YouTube playlists with improved path handling and progress reporting.
    
    Features:
    - Properly resolves output file paths to respect user input from the UI
    - Handles absolute/relative paths and ensures files are created in user-specified locations
    - Fixes progress bar stuck at 5% issue with granular progress updates
    - Implements robust error handling and recovery mechanisms
    - Provides detailed status reporting and statistics
    - Supports proper cancellation and resource cleanup
    - Uses enhanced Socket.IO reporting for reliable progress updates
    """
    def __init__(self, task_id):
        super().__init__(task_id)
        self.playlists = []
        self.api_key = YOUTUBE_API_KEY
        self.root_directory = None
        self.output_file = None
        self.thread = None
        self.status = "initializing"
        self.progress = 0
        self.message = "Initializing..."
        self.stats = {}
        self.error = None
        self.cancelled = False
        self.completed = False
        
        # For tracking progress within stages
        self.current_stage = None
        self.stage_progress = 0
        
        # Enhanced tracking and management
        self.started_at = None
        self.completed_at = None
        self.last_update_time = time.time()
        self.update_interval = 0.5  # Seconds between progress updates
        self.retries_count = 0
        
        # Resource management
        self._cleanup_lock = threading.Lock()
        self._is_cleaning_up = False
        
        logger.info(f"Created PlaylistTask {task_id}")
    
    def start(self, playlists, root_directory, output_file):
        """
        Start the playlist download task.
        
        Args:
            playlists: List of playlist dictionaries with url and folder keys
            root_directory: Base directory for download
            output_file: Path for the output JSON file
            
        Returns:
            Dict with task info and status
        """
        try:
            # Record start time
            self.started_at = time.time()
            self.last_update_time = self.started_at
            
            logger.info(f"Starting playlist task {self.task_id} with {len(playlists or [])} playlists")
            logger.info(f"Initial parameters: root_directory='{root_directory}', output_file='{output_file}'")
            
            # Handle empty playlists array
            if not playlists or not isinstance(playlists, list) or len(playlists) == 0:
                raise ValueError("No playlists provided. Please enter at least one valid YouTube playlist URL.")
            
            # Store parameters
            self.playlists = playlists
            self.root_directory = root_directory
            
            # Handle output file path - this is critical for user experience
            self.output_file = self._resolve_output_file_path(output_file)
            logger.info(f"Using output file path: {self.output_file}")
            
            # Validate parameters before starting
            self._validate_parameters()
            
            # Create base directories
            self._ensure_directories_exist()
            
            # Update status and start processing thread
            self.status = "processing"
            self.thread = threading.Thread(target=self._process, daemon=True)
            self.thread.start()
            
            # CRITICAL FIX: Start at 0% progress instead of 5%
            # Use enhanced Socket.IO function
            try:
                emit_task_started(
                    task_id=self.task_id,
                    task_type="playlist_download",
                    message="Starting playlist processing...",
                    stats=self._build_initial_stats()
                )
            except Exception as emit_error:
                logger.warning(f"Failed to emit task started event: {emit_error}")
                # Continue execution - this is not critical
            
            return {
                "task_id": self.task_id,
                "status": "processing",
                "output_file": self.output_file,
                "root_directory": self.root_directory
            }
        except ValueError as ve:
            # Handle validation errors with clear message
            logger.error(f"Validation error in playlist task: {ve}")
            self.handle_error(f"Validation error: {str(ve)}")
            return {"task_id": self.task_id, "status": "failed", "error": str(ve)}
        except Exception as e:
            # Handle unexpected errors
            logger.error(f"Error starting playlist task: {e}", exc_info=True)
            self.handle_error(f"Failed to start task: {str(e)}")
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
                raise ValueError(f"Playlist {idx+1} is missing the 'folder' field.")
            
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
            "total_playlists": len(self.playlists),
            "processed_playlists": 0,
            "empty_playlists": 0,
            "skipped_playlists": 0,
            "failed_playlists": 0,
            "total_videos": 0,
            "processed_videos": 0,
            "download_directory": self.root_directory,
            "output_file": self.output_file,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "estimated_completion_time": None
        }
    
    def _process(self):
        """Background thread for processing playlists with enhanced progress tracking"""
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
            
            # Initialize our own stats tracking
            playlist_stats = self._build_initial_stats()
            self.stats = playlist_stats
            
            # Update to show directory validation - 1% progress
            self.emit_progress(
                progress=1,
                message="Validating directories...",
                stats=playlist_stats
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
                self.handle_error(f"Failed to create output directory: {str(dir_err)}")
                return
            
            # Progress update after directory preparation - 2% total now
            self.emit_progress(
                progress=2,
                message="Preparing to download playlists...",
                stats=playlist_stats
            )
            
            # Check if task has been cancelled before we start downloading
            if self.cancelled:
                logger.info(f"Task {self.task_id} was cancelled before processing")
                return
            
            # Create a progress callback for download_all_playlists with rate limiting
            def progress_callback(stage, current, total, message):
                # Check for cancellation
                if self.cancelled:
                    raise Exception("Task cancelled")
                
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
                
                # Check if we should emit update (rate limiting)
                now = time.time()
                should_update = (
                    # Major milestone or status change
                    abs(progress - self.progress) >= 5 or
                    # Initial update
                    progress == 0 or 
                    # Final update
                    progress == 100 or
                    # Enough time has passed since last update
                    (now - self.last_update_time) >= self.update_interval
                )
                
                # Update internal state
                self.progress = progress
                self.message = message
                
                # Only emit if we should (rate limiting)
                if should_update:
                    # Update timestamp
                    self.last_update_time = now
                    
                    # Emit progress update
                    self.emit_progress(
                        progress=progress,
                        message=message,
                        stats=playlist_stats
                    )
            
            # Download playlists with progress tracking and error handling
            try:
                # Main download process with automatic retry
                max_retries = 1
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
                        
                        # Check if we should retry
                        if retry_count <= max_retries:
                            logger.warning(f"Error downloading playlists (attempt {retry_count}): {download_err}")
                            
                            # Backoff before retry
                            backoff_time = min(3 * retry_count, 10)  # Max 10 seconds backoff
                            
                            # Update progress with retry info
                            self.emit_progress(
                                progress=self.progress,
                                message=f"Retrying after error (attempt {retry_count}/{max_retries}). Waiting {backoff_time}s...",
                                stats=playlist_stats
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
                    playlist_stats["total_videos"] = total_videos
                    playlist_stats["processed_videos"] = total_videos
                    playlist_stats["processed_playlists"] = len([p for p in results if p.get("status") == "completed"])
                    playlist_stats["empty_playlists"] = len([p for p in results if p.get("status") == "empty"])
                    playlist_stats["skipped_playlists"] = len([p for p in results if p.get("status") == "skipped"])
                    playlist_stats["failed_playlists"] = len([p for p in results if p.get("status") in ["failed", "error"]])
                else:
                    logger.error("Download process returned empty results")
                    self.handle_error("Download process failed to return results")
                    return
                
            except Exception as e:
                logger.error(f"Error downloading playlists: {e}", exc_info=True)
                self.handle_error(f"Failed to download playlists: {str(e)}")
                return
            
            # Check if task has been cancelled
            if self.cancelled:
                logger.info(f"Task {self.task_id} was cancelled during processing")
                return
            
            # Transition to final processing phase - 90% completion
            self.emit_progress(
                progress=90,
                message="Generating JSON output...",
                stats=playlist_stats
            )
            
            try:
                # Process all files with the improved file handling
                self.current_stage = "json_processing"
                
                # Update progress at 92% - file processing started
                self.emit_progress(
                    progress=92,
                    message="Processing downloaded files...",
                    stats=playlist_stats
                )
                
                # Check if structify_module is available
                if 'structify_module' not in globals() or structify_module is None:
                    logger.warning("Structify module not available, skipping JSON generation")
                    
                    # Write a simple JSON output ourselves
                    with open(self.output_file, 'w', encoding='utf-8') as f:
                        json.dump({
                            "playlists": results,
                            "stats": playlist_stats,
                            "status": "completed",
                            "message": "Generated without structify_module"
                        }, f, indent=2)
                    
                    # Skip to completion
                    self.emit_progress(
                        progress=98,
                        message="Created basic JSON output (structify_module not available)",
                        stats=playlist_stats
                    )
                else:
                    # Do the actual file processing with structify_module
                    result = structify_module.process_all_files(
                        root_directory=self.root_directory,
                        output_file=self.output_file,
                        max_chunk_size=4096,
                        executor_type="thread",
                        max_workers=None,
                        stop_words=structify_module.DEFAULT_STOP_WORDS,
                        use_cache=False,
                        valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS,
                        ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                        stats_only=False,
                        include_binary_detection=True,
                        stats_obj=stats
                    )
                    
                    # Update progress to 95% - processing almost done
                    self.emit_progress(
                        progress=95,
                        message="Finalizing JSON output...",
                        stats=playlist_stats
                    )
                    
                    # Update output file if it was changed during processing
                    if result and "output_file" in result:
                        self.output_file = result["output_file"]
                        logger.info(f"Updated output file path from processing: {self.output_file}")
                
                # Progress to 98% - final touches
                self.emit_progress(
                    progress=98,
                    message="Completing playlist download...",
                    stats=playlist_stats
                )
                
                # Mark the task as completed
                self.status = "completed"
                self.completed = True
                self.completed_at = time.time()
                
                # Calculate execution time
                execution_time = self.completed_at - self.started_at
                playlist_stats["execution_time_seconds"] = execution_time
                playlist_stats["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                
                # Merge our tracking stats with the file stats
                file_stats = stats.to_dict() if hasattr(stats, 'to_dict') else {}
                merged_stats = {**file_stats, **playlist_stats}
                self.stats = merged_stats
                
                # Jump to 100% for completion - use enhanced Socket.IO function
                emit_progress_update(
                    task_id=self.task_id,
                    task_type="playlist_download",
                    progress=100,
                    status="completed",
                    message="Task completed successfully",
                    stats=self.stats
                )
                
                # Emit completion event using enhanced Socket.IO function
                emit_task_completion(
                    task_id=self.task_id,
                    task_type="playlist_download",
                    output_file=self.output_file,
                    stats=self.stats
                )
                
                logger.info(f"Playlist task {self.task_id} completed successfully")
                
            except Exception as e:
                logger.error(f"Error generating JSON: {e}", exc_info=True)
                self.handle_error(f"Failed to generate JSON output: {str(e)}")
                
        except Exception as e:
            logger.error(f"Unexpected error in playlist task: {e}", exc_info=True)
            self.handle_error(f"Unexpected error in playlist task: {str(e)}")
        finally:
            # Ensure cleanup happens even if there's an error
            self._cleanup_resources()
    
    def handle_error(self, error_message, stage=None, details=None):
        """
        Handle task errors properly with enhanced error reporting.
        
        Args:
            error_message: Error message to report
            stage: Optional stage where error occurred
            details: Optional additional error details
        """
        self.error = error_message
        self.status = "failed"
        
        # Record completion time for failed task
        if not self.completed_at:
            self.completed_at = time.time()
        
        # Update statistics with error information
        try:
            if hasattr(self, 'stats') and isinstance(self.stats, dict):
                self.stats["error"] = error_message
                self.stats["failed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                
                # Add stage info if provided
                if stage:
                    self.stats["error_stage"] = stage
                    
                # Calculate execution time
                if self.started_at:
                    execution_time = time.time() - self.started_at
                    self.stats["execution_time_seconds"] = execution_time
        except Exception as stats_error:
            logger.error(f"Error updating stats with error info: {stats_error}")
        
        # Prepare detailed error info
        error_details = details or {}
        error_details.update({
            "task_id": self.task_id,
            "error": error_message,
            "stage": stage or self.current_stage,
            "progress": self.progress,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        })
        
        # Use enhanced Socket.IO function to emit error
        emit_task_error(
            task_id=self.task_id,
            task_type="playlist_download",
            error_message=error_message,
            error_details=error_details,
            stats=self.stats,
            progress=self.progress
        )
        
        logger.error(f"Task {self.task_id} failed: {error_message}")
        
        # Clean up resources
        self._cleanup_resources()
    
    def emit_progress(self, progress, message, stats=None):
        """
        Emit progress updates via Socket.IO with enhanced logging.
        
        Args:
            progress: Progress percentage (0-100)
            message: Status message
            stats: Optional stats dictionary to include
        """
        # Update our internal state
        self.progress = progress
        self.message = message
        
        # Only update stats if provided
        if stats is not None:
            self.stats = stats
            
            # Add timestamp to stats
            self.stats["last_update_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
            if self.started_at:
                self.stats["elapsed_time_seconds"] = int(time.time() - self.started_at)
        
        # Log progress update at appropriate level
        logger.debug(f"Progress update: {progress:.1f}% - {message}")
        
        # Use enhanced Socket.IO function to emit progress update
        details = {
            "current_stage": self.current_stage,
            "stage_progress": self.stage_progress
        }
        
        emit_progress_update(
            task_id=self.task_id,
            task_type="playlist_download",
            progress=progress,
            status=self.status,
            message=message,
            stats=self.stats,
            details=details
        )
    
    def cancel(self):
        """
        Cancel the task with proper cleanup and notification.
        
        Returns:
            Dict with status information
        """
        logger.info(f"Cancelling task {self.task_id}")
        
        # Mark as cancelled
        self.cancelled = True
        self.status = "cancelled"
        
        # Record cancel time
        cancel_time = time.time()
        
        # Update stats with cancellation information
        try:
            if hasattr(self, 'stats') and isinstance(self.stats, dict):
                self.stats["cancelled_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                self.stats["cancelled_stage"] = self.current_stage
                self.stats["cancelled_progress"] = self.progress
                
                # Calculate execution time until cancellation
                if self.started_at:
                    execution_time = cancel_time - self.started_at
                    self.stats["execution_time_seconds"] = execution_time
        except Exception as stats_error:
            logger.error(f"Error updating stats with cancellation info: {stats_error}")
        
        # Use enhanced Socket.IO function to emit cancellation
        emit_task_cancelled(
            task_id=self.task_id,
            task_type="playlist_download",
            reason="Cancelled by user",
            stats=self.stats
        )
        
        logger.info(f"Task {self.task_id} cancelled successfully")
        
        # Clean up resources
        self._cleanup_resources()
        
        # Return cancellation details
        return {
            "task_id": self.task_id,
            "status": "cancelled",
            "progress": self.progress,
            "stage": self.current_stage,
            "message": "Task cancelled by user",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    
    def _cleanup_resources(self):
        """Clean up resources to prevent leaks."""
        with self._cleanup_lock:
            if self._is_cleaning_up:
                return
                
            self._is_cleaning_up = True
            
            try:
                # Try to clean up any temporary files
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
    
    def get_status(self):
        """
        Get detailed status information about the task.
        
        Returns:
            Dict with comprehensive status information
        """
        # Calculate elapsed time
        elapsed = 0
        if self.started_at:
            elapsed = time.time() - self.started_at
        
        # Build detailed status response
        status_info = {
            "task_id": self.task_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "current_stage": self.current_stage,
            "stage_progress": self.stage_progress,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.started_at)) if self.started_at else None,
            "completed_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.completed_at)) if self.completed_at else None,
            "elapsed_seconds": int(elapsed),
            "error": self.error,
            "cancelled": self.cancelled,
            "completed": self.completed,
            "playlists_count": len(self.playlists) if self.playlists else 0,
            "root_directory": self.root_directory,
            "output_file": self.output_file
        }
        
        # Include stats if available
        if hasattr(self, 'stats') and self.stats:
            status_info["stats"] = self.stats
        
        return status_info
    
    
@app.route("/")
def index():
    return render_template("index.html")

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

# -----------------------------------------------------------------------------
# File Path API Endpoints
# -----------------------------------------------------------------------------

@app.route("/api/verify-path", methods=["POST"])
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


@app.route("/api/create-directory", methods=["POST"])
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


@app.route("/api/get-output-filepath", methods=["POST"])
def api_get_output_filepath():
    """
    API endpoint to get a properly formatted output filepath.
    """
    data = request.get_json()
    filename = data.get('filename', '')
    directory = data.get('directory', '')
    
    # Use the get_output_filepath function for consistent handling
    try:
        # Make sure the filename has a .json extension
        if not filename.lower().endswith('.json'):
            filename += '.json'
            
        # If a directory is provided, use it as the base
        if directory:
            full_path = os.path.join(os.path.abspath(directory), filename)
        else:
            # Otherwise, use the default output folder
            full_path = os.path.join(DEFAULT_OUTPUT_FOLDER, filename)
            
        # Ensure the parent directory exists
        parent_dir = os.path.dirname(full_path)
        if not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
            
        return jsonify({
            "fullPath": full_path,
            "directory": os.path.dirname(full_path),
            "filename": os.path.basename(full_path)
        })
    except Exception as e:
        logger.error(f"Error generating output filepath: {e}")
        return structured_error_response("PATH_ERROR", f"Error generating output path: {str(e)}", 500)


@app.route("/api/check-file-exists", methods=["POST"])
def api_check_file_exists():
    """
    API endpoint to check if a file exists.
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
        
        # Check if file exists
        exists = os.path.isfile(norm_path)
        
        # Get additional info if it exists
        if exists:
            try:
                file_size = os.path.getsize(norm_path)
                modified_time = os.path.getmtime(norm_path)
                return jsonify({
                    "exists": True,
                    "path": norm_path,
                    "size": file_size,
                    "size_formatted": format_file_size(file_size),
                    "modified": modified_time,
                    "modified_formatted": format_timestamp(modified_time)
                })
            except Exception as detail_err:
                logger.warning(f"Error getting file details: {detail_err}")
                return jsonify({
                    "exists": True,
                    "path": norm_path
                })
        else:
            return jsonify({
                "exists": False,
                "path": norm_path
            })
    except Exception as e:
        logger.error(f"Error checking if file exists: {e}")
        return structured_error_response("CHECK_ERROR", f"Error checking file: {str(e)}", 500)


def format_file_size(size_bytes):
    """Format file size to human-readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"


def format_timestamp(timestamp):
    """Format timestamp to human-readable string."""
    try:
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return "Unknown"


@app.route("/api/get-default-output-folder", methods=["GET"])
def get_default_output_folder():
    """
    Get the default output folder path.
    """
    try:
        return jsonify({
            "path": DEFAULT_OUTPUT_FOLDER,
            "exists": os.path.isdir(DEFAULT_OUTPUT_FOLDER),
            "writable": os.access(DEFAULT_OUTPUT_FOLDER, os.W_OK)
        })
    except Exception as e:
        logger.error(f"Error getting default output folder: {e}")
        return structured_error_response("SERVER_ERROR", f"Could not retrieve default output folder: {str(e)}", 500)
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

@app.route("/api/status/<task_id>")
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
        "error": task.error,
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

@app.route("/api/open/<task_id>")
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

@app.route("/api/start-playlists", methods=["POST"])
def start_playlists():
    """
    Enhanced handler for starting playlist downloads with improved validation,
    error handling, and path resolution.
    
    The route delegates output path resolution to the PlaylistTask class
    for consistency and cleaner separation of concerns.
    
    Returns:
        JSON response with task details or error information
    """
    # Get and validate request JSON
    try:
        data = request.get_json()
        if not data:
            return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    except Exception as e:
        logger.error(f"Invalid JSON in request: {str(e)}")
        return structured_error_response("INVALID_JSON", f"Invalid JSON format: {str(e)}", 400)
    
    # Extract and validate required parameters
    raw_playlists = data.get("playlists")
    root_directory = data.get("root_directory")
    output_file = data.get("output_file")
    
    # Validate playlist URLs
    if not raw_playlists or not isinstance(raw_playlists, list):
        return structured_error_response("PLAYLISTS_REQUIRED", "A list of playlist URLs is required.", 400)
    
    # Validate each playlist URL format
    invalid_urls = [url for url in raw_playlists if not url or 'list=' not in url]
    if invalid_urls:
        return structured_error_response(
            "INVALID_PLAYLIST_URLS", 
            f"Found {len(invalid_urls)} invalid playlist URLs. Each URL must contain 'list=' parameter.",
            400,
            details={"invalid_urls": invalid_urls[:5]}  # Show up to 5 invalid URLs
        )
    
    # Validate root directory
    if not root_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Root directory is required.", 400)
    
    # Validate output file
    if not output_file:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output file is required.", 400)
    
    # Normalize root directory path
    try:
        root_directory = normalize_path(root_directory)
    except Exception as e:
        logger.error(f"Failed to normalize root directory path: {str(e)}")
        return structured_error_response(
            "INVALID_ROOT_DIR", 
            f"Invalid root directory path: {str(e)}", 
            400
        )
    
    # Create playlist configurations with sanitized folder names
    try:
        playlists = []
        for idx, url in enumerate(raw_playlists):
            # Create a folder name based on playlist index and extract playlist ID if possible
            playlist_id = None
            if 'list=' in url:
                try:
                    playlist_id = url.split('list=')[1].split('&')[0]
                    playlist_folder = f"playlist_{idx+1}_{playlist_id}"
                except:
                    playlist_folder = f"playlist_{idx+1}"
            else:
                playlist_folder = f"playlist_{idx+1}"
            
            # Sanitize the folder name and create full path
            sanitized_folder = secure_filename(playlist_folder)
            full_folder_path = os.path.join(root_directory, sanitized_folder)
            
            playlists.append({
                "url": url,
                "folder": full_folder_path,
                "playlist_id": playlist_id  # Store playlist ID for reference
            })
            
        logger.debug(f"Created {len(playlists)} playlist configurations")
    except Exception as e:
        logger.error(f"Failed to create playlist configurations: {str(e)}")
        return structured_error_response(
            "CONFIG_ERROR", 
            f"Failed to create playlist configurations: {str(e)}", 
            500
        )
    
    # Create task ID and instantiate playlist task
    task_id = str(uuid.uuid4())
    
    try:
        # Create task and register it in task manager
        playlist_task = PlaylistTask(task_id)
        add_task(task_id, playlist_task)
        logger.info(f"Created playlist task with ID: {task_id}")
        
        # Try to create root directory (PlaylistTask will handle playlist folders)
        try:
            os.makedirs(root_directory, exist_ok=True)
            logger.debug(f"Ensured root directory exists: {root_directory}")
        except Exception as dir_err:
            logger.error(f"Failed to create root directory: {str(dir_err)}")
            remove_task(task_id)  # Clean up task on failure
            return structured_error_response(
                "ROOT_DIR_CREATION_ERROR", 
                f"Failed to create root directory: {str(dir_err)}", 
                500
            )
        
        # Start the playlist task with the original output file parameter
        # The task will handle path resolution for consistency
        start_result = playlist_task.start(playlists, root_directory, output_file)
        
        # If task start returns an error status, clean up and return the error
        if start_result.get("status") == "failed":
            logger.error(f"Task start failed: {start_result.get('error')}")
            remove_task(task_id)
            return structured_error_response(
                "TASK_START_ERROR", 
                start_result.get("error", "Unknown task start error"), 
                500
            )
        
        # Include task info in response for client use
        response_data = {
            "task_id": task_id,
            "status": "processing",
            "message": "Playlist processing started",
            "playlists_count": len(playlists),
            "root_directory": root_directory,
            "output_file": start_result.get("output_file", "")
        }
        
        # Emit task creation event via Socket.IO for real-time updates
        try:
            # Use enhanced Socket.IO function if available
            if 'emit_task_started' in globals():
                emit_task_started(
                    task_id=task_id,
                    task_type="playlist_download",
                    message=f"Starting download of {len(playlists)} playlists",
                    details={"playlists_count": len(playlists)}
                )
            # Fallback to direct socketio emission
            else:
                socketio.emit('task_started', {
                    'task_id': task_id,
                    'task_type': "playlist_download",
                    'status': 'processing',
                    'message': f"Starting download of {len(playlists)} playlists",
                    'timestamp': time.time()
                })
        except Exception as socketio_err:
            # Log but don't fail if Socket.IO emission fails
            logger.error(f"Failed to emit task_started event: {str(socketio_err)}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Failed to start playlist task: {str(e)}", exc_info=True)
        # Ensure task is removed from task manager on failure
        remove_task(task_id)
        return structured_error_response(
            "TASK_CREATION_ERROR", 
            f"Failed to create and start playlist task: {str(e)}", 
            500
        )

def structured_error_response(error_code, error_message, status_code=400, details=None):
    """
    Create a structured error response with consistent format.
    
    Args:
        error_code: String code for machine-readable error identification
        error_message: Human-readable error description
        status_code: HTTP status code to return
        details: Optional dict with additional error context
        
    Returns:
        Flask response with JSON error data
    """
    error_data = {
        "error": {
            "code": error_code,
            "message": error_message,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        },
        "status": "error"
    }
    
    # Add details if provided
    if details:
        error_data["error"]["details"] = details
    
    return jsonify(error_data), status_code
    
def format_output_path(root_directory, output_file):
    """
    Properly format the output path by ensuring we don't create paths with multiple drive letters.
    
    Args:
        root_directory (str): Root directory for the playlist download
        output_file (str): The target output filename (with or without path)
        
    Returns:
        str: A correctly formatted absolute path
    """
    # If output_file already has a drive letter, use it as is
    if re.match(r'^[A-Za-z]:', output_file):
        return output_file
        
    # Otherwise join with root directory
    return os.path.join(root_directory, os.path.basename(output_file))