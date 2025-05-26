# BACKEND FIX: Enhanced emit_progress_update function for main_part1.py

def emit_progress_update(task_id, progress, status="processing", message=None, stats=None, details=None):
    """
    FIXED: Enhanced progress update emission with debugging and validation.
    
    Args:
        task_id: Unique identifier for the task
        progress: Progress value (0-100)
        status: Task status string
        message: Optional message for the UI
        stats: Optional statistics object or dict
        details: Optional additional details
    """
    try:
        # CRITICAL FIX: Add comprehensive debug logging
        print(f"BACKEND DEBUG: Emitting progress for {task_id}: {progress}%")
        print(f"BACKEND DEBUG: Socket connected clients: {len(socketio.server.manager.rooms.get('/', {})) if hasattr(socketio.server, 'manager') else 'unknown'}")
        
        # CRITICAL FIX: Validate and clamp progress value
        original_progress = progress
        progress = min(max(0, float(progress)), 100)
        
        if original_progress != progress:
            print(f"BACKEND DEBUG: Progress clamped from {original_progress} to {progress}")
        
        # CRITICAL FIX: Build standardized payload
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': status,
            'message': message or f"Progress: {progress}%",
            'timestamp': time.time(),
            'debug_info': {
                'backend_version': '1.2.0',
                'event_type': 'progress_update',
                'original_progress': original_progress
            }
        }
        
        # CRITICAL FIX: Enhanced stats processing with error handling
        if stats:
            try:
                if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                    payload['stats'] = stats.to_dict()
                elif isinstance(stats, dict):
                    payload['stats'] = stats
                elif hasattr(stats, '__dict__'):
                    payload['stats'] = stats.__dict__
                else:
                    payload['stats'] = {'raw_stats': str(stats)}
            except Exception as stats_error:
                print(f"BACKEND DEBUG: Error processing stats: {stats_error}")
                payload['stats'] = {'error': 'Failed to serialize stats'}
        
        # Include additional details if provided
        if details:
            payload['details'] = details
        
        print(f"BACKEND DEBUG: Final payload = {payload}")
        
        # CRITICAL FIX: Emit with error handling and confirmation
        try:
            socketio.emit('progress_update', payload)
            print(f"BACKEND DEBUG: Successfully emitted progress_update for {task_id}")
            
            # CRITICAL FIX: Force completion emission if progress reaches 100%
            if progress >= 100 and status != 'completed':
                print(f"BACKEND DEBUG: Progress at 100%, forcing completion for {task_id}")
                completion_payload = {
                    'task_id': task_id,
                    'task_type': 'generic',
                    'status': 'completed',
                    'progress': 100,
                    'message': f"Task {task_id} completed successfully",
                    'timestamp': time.time()
                }
                if stats:
                    completion_payload['stats'] = payload.get('stats', {})
                socketio.emit('task_completed', completion_payload)
                print(f"BACKEND DEBUG: Emitted task_completed for {task_id}")
                
        except Exception as emit_error:
            print(f"BACKEND DEBUG: Failed to emit progress_update: {emit_error}")
            logger.error(f"Error emitting progress_update: {emit_error}")
            
    except Exception as e:
        print(f"BACKEND DEBUG: Critical error in emit_progress_update: {e}")
        logger.error(f"Critical error in emit_progress_update: {e}")

# USAGE: Replace the existing emit_progress_update function in main_part1.py with this enhanced version
