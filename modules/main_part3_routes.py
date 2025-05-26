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
def get_task_history():
    """
    Get task completion history with pagination.
    
    Query parameters:
        - limit: Number of results (default: 20, max: 100)
        - offset: Offset for pagination (default: 0)
        - task_type: Filter by task type (optional)
        
    Returns:
        JSON response with task history
    """
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 20)), 100)
        offset = max(int(request.args.get('offset', 0)), 0)
        task_type_filter = request.args.get('task_type')
        
        with task_history_lock:
            # Filter by task type if specified
            filtered_history = task_history
            if task_type_filter:
                filtered_history = [
                    entry for entry in task_history 
                    if entry.get('task_type') == task_type_filter
                ]
            
            # Sort by completion time (most recent first)
            sorted_history = sorted(
                filtered_history, 
                key=lambda x: x.get('completed_at', ''), 
                reverse=True
            )
            
            # Apply pagination
            paginated_history = sorted_history[offset:offset + limit]
            
            response = {
                'history': paginated_history,
                'pagination': {
                    'total': len(sorted_history),
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < len(sorted_history)
                },
                'filters': {
                    'task_type': task_type_filter
                }
            }
            
            return jsonify(response)
            
    except Exception as e:
        logger.error(f"Error retrieving task history: {e}")
        return structured_error_response(
            "HISTORY_RETRIEVAL_ERROR",
            f"Error retrieving task history: {str(e)}",
            500
        )


@app.route("/api/tasks/analytics", methods=["GET"])
def get_task_analytics():
    """
    Get aggregated analytics across all completed tasks.
    
    Returns:
        JSON response with analytics data
    """
    try:
        with task_history_lock:
            if not task_history:
                return jsonify({
                    'message': 'No task history available',
                    'analytics': {}
                })
            
            analytics = {
                'overview': calculate_overview_analytics(),
                'performance_trends': calculate_performance_trends(),
                'task_type_distribution': calculate_task_type_distribution(),
                'efficiency_analysis': calculate_efficiency_analysis(),
                'generated_at': datetime.now().isoformat()
            }
            
            return jsonify(analytics)
            
    except Exception as e:
        logger.error(f"Error generating task analytics: {e}")
        return structured_error_response(
            "ANALYTICS_ERROR",
            f"Error generating analytics: {str(e)}",
            500
        )


def calculate_overview_analytics():
    """Calculate overview analytics from task history."""
    try:
        total_tasks = len(task_history)
        task_types = set(entry.get('task_type', 'unknown') for entry in task_history)
        
        # Calculate averages
        total_files = sum(
            entry.get('stats', {}).get('processed_files', 0) 
            for entry in task_history
        )
        
        total_duration = sum(
            entry.get('stats', {}).get('duration_seconds', 0) 
            for entry in task_history
        )
        
        avg_completion_rate = sum(
            entry.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
            for entry in task_history
        ) / total_tasks if total_tasks > 0 else 0
        
        return {
            'total_tasks': total_tasks,
            'unique_task_types': len(task_types),
            'total_files_processed': total_files,
            'total_processing_time': format_duration(total_duration),
            'average_completion_rate': round(avg_completion_rate, 2),
            'average_files_per_task': round(total_files / total_tasks, 2) if total_tasks > 0 else 0
        }
        
    except Exception as e:
        logger.error(f"Error calculating overview analytics: {e}")
        return {'error': str(e)}


def calculate_performance_trends():
    """Calculate performance trends over time."""
    try:
        if len(task_history) < 2:
            return {'message': 'Insufficient data for trend analysis'}
        
        # Sort by completion time
        sorted_history = sorted(
            task_history, 
            key=lambda x: x.get('completed_at', '')
        )
        
        # Calculate trend data
        recent_tasks = sorted_history[-5:]  # Last 5 tasks
        older_tasks = sorted_history[:-5] if len(sorted_history) > 5 else []
        
        if older_tasks:
            recent_avg_rate = sum(
                task.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
                for task in recent_tasks
            ) / len(recent_tasks)
            
            older_avg_rate = sum(
                task.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
                for task in older_tasks
            ) / len(older_tasks)
            
            trend = 'improving' if recent_avg_rate > older_avg_rate else 'declining'
            trend_magnitude = abs(recent_avg_rate - older_avg_rate)
        else:
            trend = 'stable'
            trend_magnitude = 0
        
        return {
            'trend_direction': trend,
            'trend_magnitude': round(trend_magnitude, 2),
            'recent_average_completion_rate': round(recent_avg_rate, 2) if recent_tasks else 0,
            'sample_size': len(recent_tasks)
        }
        
    except Exception as e:
        logger.error(f"Error calculating performance trends: {e}")
        return {'error': str(e)}


def calculate_task_type_distribution():
    """Calculate distribution of task types."""
    try:
        task_type_counts = {}
        task_type_performance = {}
        
        for entry in task_history:
            task_type = entry.get('task_type', 'unknown')
            task_type_counts[task_type] = task_type_counts.get(task_type, 0) + 1
            
            # Track performance by type
            completion_rate = entry.get('stats', {}).get('completion_metrics', {}).get('completion_rate', 0)
            if task_type not in task_type_performance:
                task_type_performance[task_type] = []
            task_type_performance[task_type].append(completion_rate)
        
        # Calculate average performance by type
        for task_type in task_type_performance:
            rates = task_type_performance[task_type]
            task_type_performance[task_type] = {
                'average_completion_rate': round(sum(rates) / len(rates), 2),
                'task_count': len(rates)
            }
        
        return {
            'distribution': task_type_counts,
            'performance_by_type': task_type_performance
        }
        
    except Exception as e:
        logger.error(f"Error calculating task type distribution: {e}")
        return {'error': str(e)}


def calculate_efficiency_analysis():
    """Calculate efficiency analysis across tasks."""
    try:
        efficiency_grades = {}
        efficiency_scores = []
        
        for entry in task_history:
            grade = entry.get('stats', {}).get('efficiency_metrics', {}).get('efficiency_grade', 'Unknown')
            score = entry.get('stats', {}).get('efficiency_metrics', {}).get('efficiency_score', 0)
            
            efficiency_grades[grade] = efficiency_grades.get(grade, 0) + 1
            if score > 0:
                efficiency_scores.append(score)
        
        avg_efficiency = sum(efficiency_scores) / len(efficiency_scores) if efficiency_scores else 0
        
        return {
            'grade_distribution': efficiency_grades,
            'average_efficiency_score': round(avg_efficiency, 2),
            'total_analyzed': len(efficiency_scores)
        }
        
    except Exception as e:
        logger.error(f"Error calculating efficiency analysis: {e}")
        return {'error': str(e)}
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

@app.route("/api/process", methods=["POST"])
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

@app.route("/api/download/<task_id>")
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

@app.route("/download/<path:filename>")
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
def lstart_playlists():
    """
    Enhanced handler for starting playlist downloads with improved validation,
    error handling, and path resolution.
    
    The route delegates output path resolution to the PlaylistTask class
    for consistency and cleaner separation of concerns.
    
    Returns:
        JSON response with task details or error information
    """
    # Check if YouTube API key is configured
    if not YOUTUBE_API_KEY:
        logger.error("YouTube API key not configured")
        return structured_error_response(
            "API_KEY_MISSING", 
            "YouTube API key is not configured. Please set YOUTUBE_API_KEY in your .env file.",
            500
        )
    
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


def emit_cancellation_event(task_id: str, task_type: str, reason: str = "Task cancelled") -> None:
    """
    Unified event emission for cancellations.
    Handles all task types with appropriate events.
    
    Args:
        task_id: The task ID
        task_type: The type of task
        reason: Reason for cancellation
    """
    timestamp = time.time()
    base_payload = {
        "task_id": task_id,
        "timestamp": timestamp,
        "reason": reason
    }
    
    try:
        # Emit specific events for different task types
        if task_type == "pdf_processing":
            socketio.emit('pdf_processing_cancelled', base_payload)
        elif task_type == "scraping":
            socketio.emit('scraping_cancelled', base_payload)
        elif task_type == "playlist":
            socketio.emit('playlist_cancelled', base_payload)
        
        # Always emit the general cancellation event for frontend compatibility
        emit_task_cancelled(task_id, reason=reason)
        
        logger.info(f"[CANCEL] Emitted cancellation events for task {task_id} ({task_type})")
        
    except Exception as e:
        logger.error(f"[CANCEL] Failed to emit cancellation events for {task_id}: {e}")


# ----------------------------------------------------------------------------
# Socket.IO Cancellation Handler
# ----------------------------------------------------------------------------

@socketio.on('cancel_task')
def handle_cancel_task(data):
    """
    Enhanced Socket.IO handler with comprehensive error handling and logging.
    Idempotent behavior ensures consistent client state.
    """
    # Input validation
    if not isinstance(data, dict):
        emit('task_error', {
            'task_id': None,
            'error': "Invalid cancellation request format"
        })
        return

    task_id = data.get('task_id')
    if not task_id or not isinstance(task_id, str):
        emit('task_error', {
            'task_id': None,
            'error': "Missing or invalid task_id for cancellation"
        })
        return

    logger.info(f"[CANCEL] Socket.IO cancellation request for task: {task_id}")
    
    try:
        # Use unified cancellation logic
        success, task_info = mark_task_cancelled(task_id, "Task cancelled by user")
        
        if success:
            # Emit appropriate events
            task_type = task_info.get('task_type', 'unknown')
            reason = task_info.get('message', 'Task cancelled')
            emit_cancellation_event(task_id, task_type, reason)
        else:
            # Handle non-existent task with idempotent behavior
            logger.warning(f"[CANCEL] Task {task_id} not found - emitting force cancellation")
            emit_task_cancelled(task_id, reason="Task not found or already completed")
            
    except Exception as e:
        logger.error(f"[CANCEL] Error processing cancellation for {task_id}: {e}")
        emit('task_error', {
            'task_id': task_id,
            'error': f"Cancellation failed: {str(e)}"
        })


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

def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Thread-safe task status retrieval with comprehensive information.
    
    Args:
        task_id: The task identifier
        
    Returns:
        Task status dictionary or None if not found
    """
    with tasks_lock:
        task = active_tasks.get(task_id)
        if not task:
            return None
        
        # Return a copy to prevent external modification
        return {
            'task_id': task_id,
            'status': task.get('status', 'unknown'),
            'progress': task.get('progress', 0),
            'message': task.get('message', ''),
            'type': task.get('type', 'unknown'),
            'start_time': task.get('start_time'),
            'end_time': task.get('end_time'),
            'cancel_requested': task.get('cancel_requested', False),
            'error': task.get('error'),
            'cancellation_reason': task.get('cancellation_reason')
        }


@socketio.on('request_task_status')
def handle_task_status_request(data):
    """
    Enhanced task status request handler with comprehensive error handling.
    """
    task_id = data.get('task_id') if isinstance(data, dict) else None
    
    if not task_id:
        emit('task_error', {
            'error': "Task ID missing in status request",
            'task_id': None
        })
        return
    
    try:
        status = get_task_status(task_id)
        if status:
            emit('task_status_response', status)
        else:
            emit('task_error', {
                'task_id': task_id,
                'error': f"Task {task_id} not found"
            })
            
    except Exception as e:
        logger.error(f"[STATUS] Error retrieving status for {task_id}: {e}")
        emit('task_error', {
            'task_id': task_id,
            'error': f"Error retrieving task status: {str(e)}"
        })


# ----------------------------------------------------------------------------
# Legacy Compatibility Functions
# ----------------------------------------------------------------------------

def cancel_task_unified(task_id: str) -> Dict[str, Any]:
    """
    Legacy compatibility function for existing code.
    Delegates to the new unified system.
    
    Args:
        task_id: The task ID to cancel
        
    Returns:
        Status dictionary for backward compatibility
    """
    success, task_info = mark_task_cancelled(task_id)
    
    if success:
        task_type = task_info.get('task_type', 'unknown')
        emit_cancellation_event(task_id, task_type, task_info.get('message', 'Task cancelled'))
    
    return {
        "success": success,
        "status": task_info.get('status', 'error'),
        "message": task_info.get('message', 'Unknown error')
    }

# ----------------------------------------------------------------------------
# PDF Download Endpoints
# ----------------------------------------------------------------------------

@app.route("/api/download-pdf", methods=["POST"])
def api_download_pdf():
    """
    Enhanced API endpoint to download a PDF file from a URL to a user-specified folder.
    
    Expected JSON body:
    {
        "url": "https://example.com/paper.pdf",
        "outputFolder": User-selected download directory,
        "outputFilename": User-specified filename (without extension),
        "processFile": true,  # Whether to process the PDF to JSON
        "extractTables": true,  # Whether to extract tables
        "useOcr": true  # Whether to use OCR for scanned content
    }
    
    Returns:
        JSON response with download status, file path, etc.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url = data.get("url")
    output_folder = data.get("outputFolder", DEFAULT_OUTPUT_FOLDER)
    output_filename = data.get("outputFilename")
    process_file = data.get("processFile", True)
    extract_tables = data.get("extractTables", True)
    use_ocr = data.get("useOcr", True)
    
    if not url:
        return structured_error_response("URL_REQUIRED", "PDF URL is required.", 400)
    
    # Ensure output directory exists
    try:
        os.makedirs(output_folder, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creating output directory: {e}")
        return structured_error_response("OUTPUT_DIR_ERROR", f"Failed to create output directory: {str(e)}", 500)
    
    # Create a unique task ID for tracking this download
    download_id = str(uuid.uuid4())
    
    try:
        # Download the PDF using enhanced function
        logger.info(f"Starting PDF download from {url} to {output_folder}")
        
        # Use the enhanced download_pdf function from web_scraper
        pdf_file = download_pdf(url, output_folder)
        
        if pdf_file and os.path.exists(pdf_file):
            # Get file size and other metadata
            file_size = os.path.getsize(pdf_file)
            file_name = os.path.basename(pdf_file)
            
            response_data = {
                "status": "success",
                "message": "PDF downloaded successfully",
                "download_id": download_id,
                "url": url,
                "filePath": pdf_file,
                "fileName": file_name,
                "fileSize": file_size,
                "outputFolder": output_folder
            }
            
            # Process the PDF to JSON if requested
            if process_file and structify_module:
                json_file = None
                try:
                    # Generate a JSON filename based on user preference or PDF name
                    if output_filename:
                        json_filename = f"{output_filename}.json"
                    else:
                        json_filename = os.path.splitext(file_name)[0] + "_processed.json"
                        
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Detect document type to determine if OCR is needed
                    doc_type = None
                    if hasattr(structify_module, 'detect_document_type'):
                        try:
                            doc_type = structify_module.detect_document_type(pdf_file)
                            response_data["documentType"] = doc_type
                        except Exception as e:
                            logger.warning(f"Error detecting document type: {e}")
                    
                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                    apply_ocr = use_ocr or (doc_type == "scan")
                    
                    # Process with process_pdf if available
                    if hasattr(structify_module, 'process_pdf'):
                        result = structify_module.process_pdf(
                            pdf_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=4096,
                            extract_tables=extract_tables,
                            use_ocr=apply_ocr,
                            return_data=True
                        )
                        
                        json_file = json_path
                        
                        # Add summary metrics to response
                        if result:
                            response_data["processingDetails"] = {
                                "tablesExtracted": len(result.get("tables", [])),
                                "referencesExtracted": len(result.get("references", [])),
                                "pageCount": result.get("page_count", 0),
                                "chunksCreated": len(result.get("chunks", []))
                            }
                            
                    else:
                        # Fallback to process_all_files
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            max_chunk_size=4096,
                            executor_type="thread",
                            max_workers=None,
                            stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                            use_cache=False,
                            valid_extensions=[".pdf"],
                            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                            stats_only=False,
                            include_binary_detection=False,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        json_file = json_path
                    
                    # Add JSON file info to response
                    if json_file and os.path.exists(json_file):
                        response_data["jsonFile"] = json_file
                        logger.info(f"PDF processed to JSON: {json_file}")
                        
                        # Generate a quick PDF structure summary
                        summary = analyze_pdf_structure(pdf_file)
                        if summary and "error" not in summary:
                            response_data["pdfStructure"] = summary
                    
                except Exception as e:
                    logger.error(f"Error processing PDF to JSON: {e}")
                    response_data["processingError"] = str(e)
            
            return jsonify(response_data)
        else:
            return structured_error_response("DOWNLOAD_FAILED", "Failed to download PDF file.", 400)
            
    except Exception as e:
       logger.error(f"Error downloading PDF: {e}", exc_info=True)
       return structured_error_response("DOWNLOAD_ERROR", f"Error downloading PDF: {str(e)}", 500)

@app.route("/download-pdf/<path:pdf_path>")
def download_pdf_file(pdf_path):
    """
    Download or view a specific PDF file with enhanced security checks.
    
    Args:
        pdf_path: The path to the PDF file.
        
    Returns:
        The PDF file for download or viewing.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(pdf_path)
        
        # Define allowed directories (can be expanded based on application needs)
        allowed_dirs = [
            DEFAULT_OUTPUT_FOLDER,
            os.path.join(os.path.expanduser("~"), "Documents"),
            app.config.get("UPLOAD_FOLDER", tempfile.mkdtemp())
        ]
        
        # Check if the path is within any allowed directory
        is_allowed = any(os.path.commonpath([abs_path, allowed_dir]) == allowed_dir 
                        for allowed_dir in allowed_dirs if os.path.exists(allowed_dir))
        
        if not is_allowed:
            logger.warning(f"Attempted to access file outside allowed directories: {abs_path}")
            abort(403)  # Forbidden
        
        # Check if file exists
        if not os.path.exists(abs_path):
            logger.warning(f"PDF file not found: {abs_path}")
            abort(404)
        
        # Verify file is a PDF (optional but adds security)
        if not abs_path.lower().endswith('.pdf') and magic_available:
            mime = magic.from_file(abs_path, mime=True)
            if 'application/pdf' not in mime:
                logger.warning(f"File is not a PDF: {abs_path}, mime: {mime}")
                abort(400)  # Bad request
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for PDF content
        response = send_from_directory(
            directory,
            filename,
            mimetype='application/pdf',
            as_attachment=False  # Display in browser instead of downloading
        )
        
        # Add additional security headers
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        logger.info(f"Successfully served PDF file: {filename}")
        return response
        
    except Exception as e:
        logger.error(f"Error serving PDF file: {e}")
        abort(500)

@app.route("/download-file/<path:file_path>")
def download_file_attachment(file_path):
    """
    Force download of a specific file.
    
    Args:
        file_path: The path to the file.
        
    Returns:
        The file as an attachment for download.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(file_path)
        
        # Check if file exists
        if not os.path.exists(abs_path):
            abort(404)
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for attachment download
        return send_from_directory(
            directory, 
            filename,
            as_attachment=True,  # Force download instead of displaying
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file for download: {e}")
        abort(500)

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

@app.route("/api/scrape2", methods=["POST"])
def scrape2():
    """
    Enhanced endpoint for web scraping with PDF download support
    that fully integrates with the advanced frontend options.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url_configs = data.get("urls")
    download_directory = data.get("download_directory")
    output_filename = data.get("outputFilename", "").strip()
    
    # Get enhanced PDF options
    pdf_options = data.get("pdf_options", {})
    process_pdfs = pdf_options.get("process_pdfs", True)
    extract_tables = pdf_options.get("extract_tables", True)
    use_ocr = pdf_options.get("use_ocr", True)
    extract_structure = pdf_options.get("extract_structure", True)
    chunk_size = pdf_options.get("chunk_size", 4096)
    max_downloads = pdf_options.get("max_downloads", 10)  # Default to 10 PDFs
    
    if not url_configs or not isinstance(url_configs, list):
        return structured_error_response("URLS_REQUIRED", "A list of URLs is required.", 400)
    
    if not download_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Download directory is required.", 400)
    
    if not output_filename:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output filename is required.", 400)
    
    # Ensure output file has proper extension
    if not output_filename.lower().endswith('.json'):
        output_filename += '.json'
    
    # Convert to absolute path
    download_directory = os.path.abspath(download_directory)
    
    # Get properly formatted output path
    final_json = get_output_filepath(output_filename, folder_override=download_directory)
    
    # Validate and create download directory if it doesn't exist
    if not os.path.isdir(download_directory):
        try:
            os.makedirs(download_directory, exist_ok=True)
            logger.info(f"Created download directory: {download_directory}")
        except Exception as e:
            return structured_error_response("DIR_CREATION_FAILED", f"Could not create download directory: {e}", 500)
    
    # Log the request
    logger.info(f"Starting web scraping with {len(url_configs)} URLs to {download_directory}")
    logger.info(f"Output JSON will be saved to: {final_json}")
    logger.info(f"PDF options: process={process_pdfs}, tables={extract_tables}, ocr={use_ocr}, structure={extract_structure}, chunk_size={chunk_size}, max_downloads={max_downloads}")
    
    # Create and start the scraper task with enhanced options
    task_id = str(uuid.uuid4())
    scraper_task = ScraperTask(task_id)
    add_task(task_id, scraper_task)
    
    # Pass the enhanced options to the task
    scraper_task.pdf_options = {
        "process_pdfs": process_pdfs,
        "extract_tables": extract_tables,
        "use_ocr": use_ocr,
        "extract_structure": extract_structure,
        "chunk_size": chunk_size,
        "max_downloads": max_downloads
    }
    
    scraper_task.start(
        url_configs=url_configs,
        root_directory=download_directory,
        output_file=final_json
    )
    
    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "message": "Scraping started",
        "root_directory": download_directory,
        "output_file": final_json
    })
    
@app.route("/api/scrape2/status/<task_id>")
def scrape2_status(task_id):
    """Get the status of a scraping task with PDF download information."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    # Build response with PDF downloads information
    response = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "stats": task.stats,
        "error": task.error,
        "output_file": task.output_file,
        "output_folder": task.output_folder
    }
    
    # Include PDF downloads information if available
    if hasattr(task, 'pdf_downloads') and task.pdf_downloads:
        response["pdf_downloads"] = task.pdf_downloads
    
    return jsonify(response)

@app.route("/api/scrape2/cancel/<task_id>", methods=["POST"])
def cancel_scrape2(task_id):
    """Cancel a scraping task."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    task.status = "cancelled"
    remove_task(task_id)
    
    return jsonify({
        "task_id": task_id,
        "status": "cancelled",
        "message": "ScraperTask cancelled successfully."
    })