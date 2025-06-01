"""
SocketIO Events Central Registry
Handles all real-time communication events for the NeuroGen Server
"""

import logging
import time
import uuid
import threading
from typing import Dict, Any, Optional
from flask_socketio import emit, join_room, leave_room
from flask import request, current_app
from blueprints.api.management import register_task, update_task_progress, complete_task, api_task_registry

# Import task management functions
from blueprints.core.services import get_task, tasks_lock

# Import PDF and structify functions
from blueprints.core.ocr_config import pdf_extractor, pdf_extractor_available
from blueprints.core.structify_integration import structify_module, structify_available

logger = logging.getLogger(__name__)

# Event deduplication tracking
_emitted_events = {}  # {task_id: {event_type: timestamp}}
_emitted_completions = set()  # Track completed tasks to prevent duplicates

# Export main registration function and utilities
__all__ = ['register_socketio_events', 'safe_emit', 'get_socketio', 'emit_task_completion_unified', 'emit_progress_update_unified', 'emit_task_error_unified']

# Helper to get socketio instance
def get_socketio():
    """Get socketio instance from current app or return None"""
    try:
        return current_app.extensions.get('socketio')
    except:
        return None

# Helper to emit events safely
def safe_emit(event, data, **kwargs):
    """Safely emit an event using socketio from current app"""
    socketio = get_socketio()
    if socketio:
        socketio.emit(event, data, **kwargs)
    else:
        # Fallback to direct emit if we're in a request context
        try:
            emit(event, data, **kwargs)
        except:
            logger.warning(f"Could not emit {event} - no socketio instance available")

# =============================================================================
# UNIFIED TASK EVENT EMISSION FUNCTIONS (Centralized)
# =============================================================================

def emit_task_completion_unified(task_id: str, task_type: str = "generic", output_file: Optional[str] = None, 
                               stats: Optional[Dict] = None, details: Optional[Dict] = None) -> bool:
    """Centralized task completion emission with deduplication"""
    global _emitted_completions
    
    # Deduplication check
    if task_id in _emitted_completions:
        logger.debug(f"Task {task_id} completion already emitted - skipping duplicate")
        return True
    
    # Blueprint-aligned payload
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'status': 'completed',
        'progress': 100,
        'message': f"{task_type.replace('_', ' ').title()} completed successfully",
        'timestamp': time.time()
    }
    
    # Optional fields
    if output_file:
        payload['output_file'] = output_file
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if details:
        payload['details'] = details
    
    # Emit event
    success = safe_emit('task_completed', payload)
    if success:
        _emitted_completions.add(task_id)
        logger.info(f"Emitted unified task_completed for {task_id} ({task_type})")
    
    return success

def emit_progress_update_unified(task_id: str, progress: float, message: str = "", 
                               stats: Optional[Dict] = None, details: Optional[Dict] = None) -> bool:
    """Centralized progress update emission with deduplication"""
    global _emitted_events
    
    # Progress deduplication - only emit if progress changed significantly
    event_key = f"{task_id}:progress"
    if event_key in _emitted_events:
        last_progress = _emitted_events[event_key].get('progress', 0)
        if abs(last_progress - progress) < 1:  # Skip if less than 1% change
            return True
    
    # Blueprint-aligned payload
    payload = {
        'task_id': task_id,
        'progress': round(progress, 1),
        'message': message or f"Processing... {progress:.1f}%",
        'timestamp': time.time()
    }
    
    # Optional fields
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if details:
        payload['details'] = details
    
    # Emit event
    success = safe_emit('progress_update', payload)
    if success:
        _emitted_events[event_key] = {'progress': progress, 'timestamp': time.time()}
        logger.debug(f"Emitted progress_update for {task_id}: {progress:.1f}%")
    
    return success

def emit_task_error_unified(task_id: str, task_type: str, error_message: str, 
                          error_details: Optional[Dict] = None, stats: Optional[Dict] = None) -> bool:
    """Centralized task error emission"""
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'status': 'failed',
        'error': error_message,
        'timestamp': time.time()
    }
    
    # Optional fields
    if error_details:
        payload['error_details'] = error_details
    if stats:
        payload['stats'] = _serialize_stats(stats)
    
    success = safe_emit('task_error', payload)
    if success:
        logger.info(f"Emitted task_error for {task_id} ({task_type}): {error_message}")
    
    return success

def _get_blueprint_from_task_type(task_type: str) -> str:
    """Get Blueprint name from task type for consistent alignment"""
    blueprint_map = {
        'file_processing': 'file_processor',
        'playlist_download': 'playlist_downloader', 
        'web_scraping': 'web_scraper',
        'academic_search': 'academic_search',
        'pdf_processing': 'pdf_processor'
    }
    return blueprint_map.get(task_type, 'core')

def _serialize_stats(stats) -> Dict:
    """Serialize stats object to dict for JSON transmission"""
    if isinstance(stats, dict):
        return stats
    elif hasattr(stats, 'to_dict') and callable(stats.to_dict):
        return stats.to_dict()
    elif hasattr(stats, '__dict__'):
        return stats.__dict__
    else:
        return {'raw_stats': str(stats)}

# Utility functions for task management
def force_cancel_all_tasks():
    """Force cancel all active tasks"""
    cancelled_count = 0
    try:
        with tasks_lock:
            for task_id in list(api_task_registry.keys()):
                if api_task_registry[task_id].get('status') in ['pending', 'processing']:
                    api_task_registry[task_id]['status'] = 'cancelled'
                    api_task_registry[task_id]['cancel_requested'] = True
                    api_task_registry[task_id]['cancellation_reason'] = 'Emergency stop'
                    cancelled_count += 1
        logger.warning(f"Emergency stop: Cancelled {cancelled_count} active tasks")
    except Exception as e:
        logger.error(f"Error in force_cancel_all_tasks: {e}")
    return cancelled_count

def mark_task_cancelled(task_id: str, reason: str = "Task cancelled") -> tuple:
    """Mark a task as cancelled and return success status and task info"""
    try:
        with tasks_lock:
            if task_id in api_task_registry:
                task = api_task_registry[task_id]
                task['status'] = 'cancelled'
                task['cancel_requested'] = True
                task['cancellation_reason'] = reason
                task['cancelled_at'] = time.time()
                return True, task
            else:
                return False, {'status': 'not_found', 'message': f'Task {task_id} not found'}
    except Exception as e:
        logger.error(f"Error marking task {task_id} as cancelled: {e}")
        return False, {'status': 'error', 'message': str(e)}

def validate_pdf(pdf_path: str) -> dict:
    """Validate a PDF file"""
    import os
    
    validation_result = {
        'valid': False,
        'error': None,
        'file_size': 0,
        'exists': False
    }
    
    try:
        if not pdf_path:
            validation_result['error'] = 'No PDF path provided'
            return validation_result
            
        if not os.path.exists(pdf_path):
            validation_result['error'] = 'PDF file not found'
            return validation_result
            
        validation_result['exists'] = True
        validation_result['file_size'] = os.path.getsize(pdf_path)
        
        if not pdf_path.lower().endswith('.pdf'):
            validation_result['error'] = 'File is not a PDF'
            return validation_result
            
        validation_result['valid'] = True
        return validation_result
        
    except Exception as e:
        validation_result['error'] = str(e)
        return validation_result

def register_socketio_events(socketio):
    """Register all SocketIO event handlers"""
    
    # =============================================================================
    # CORE CONNECTION EVENTS
    # =============================================================================
    
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection establishment."""
        logger.info(f"Client connected: {request.sid}")
        emit('connection_established', {
            'status': 'connected', 
            'sid': request.sid, 
            'timestamp': time.time(),
            'server_version': '1.2.0'  # Include version for client compatibility checks
        })

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection."""
        logger.info(f"Client disconnected: {request.sid}")
    
    @socketio.on('join_room')
    def handle_join_room(data):
        room = data.get('room')
        if room:
            join_room(room)
            logger.info(f'Client joined room: {room}')
            emit('room_joined', {'room': room})
    
    @socketio.on('leave_room')
    def handle_leave_room(data):
        room = data.get('room')
        if room:
            leave_room(room)
            logger.info(f'Client left room: {room}')
            emit('room_left', {'room': room})
    
    @socketio.on('ping_from_client')
    def handle_ping_from_client(data):
        """
        Handle ping messages from clients to maintain connection and measure latency.
        
        Args:
            data: Client data with optional client_timestamp
        """
        logger.debug(f"Ping received from {request.sid}: {data}")
        response = {
            'timestamp': time.time(),
            'server_received_at': time.time(),
            'original_data': data
        }
        
        # Calculate round-trip time if client timestamp was provided
        if isinstance(data, dict) and 'client_timestamp' in data:
            response['client_server_diff'] = time.time() - data['client_timestamp']
            
        emit('pong_to_client', response)
        
    @socketio.on('emergency_stop')
    def handle_emergency_stop(data):
        """Socket.IO handler for emergency stop"""
        logger.warning("[EMERGENCY] Emergency stop via Socket.IO")
        
        try:
            cancelled_count = force_cancel_all_tasks()
            
            emit('emergency_stop_complete', {
                'status': 'success',
                'cancelled_count': cancelled_count,
                'timestamp': time.time()
            })
            
        except Exception as e:
            logger.error(f"[EMERGENCY] Socket.IO emergency stop error: {e}")
            emit('emergency_stop_error', {
                'error': str(e),
                'timestamp': time.time()
            })    
    # =============================================================================
    # TASK MANAGEMENT EVENTS
    # =============================================================================
    
    @socketio.on('request_status')
    def handle_status_request(data):
        """Handle status requests for specific tasks"""
        task_id = data.get('task_id')
        if task_id and task_id in api_task_registry:
            task_info = api_task_registry[task_id]
            emit('task_status', {
                'task_id': task_id,
                'status': task_info.get('status', 'unknown'),
                'progress': task_info.get('progress', 0),
                'message': task_info.get('message', ''),
                'stats': task_info.get('stats', {})
            })
        else:
            emit('task_status', {
                'task_id': task_id,
                'status': 'not_found',
                'error': 'Task not found'
            })
    
    @socketio.on('cancel_task')
    def handle_cancel_task(data):
        """Handle task cancellation requests"""
        task_id = data.get('task_id')
        if task_id and task_id in api_task_registry:
            api_task_registry[task_id]['status'] = 'cancelled'
            api_task_registry[task_id]['cancelled_at'] = time.time()
            
            emit('task_cancelled', {
                'task_id': task_id,
                'status': 'cancelled',
                'message': 'Task cancelled successfully'
            })
            logger.info(f'Task {task_id} cancelled via SocketIO')
        else:
            emit('task_error', {
                'task_id': task_id,
                'error': 'Task not found or already completed'
            })
    
    # =============================================================================
    # FILE PROCESSING EVENTS
    # =============================================================================
    
    @socketio.on('start_file_processing')
    def handle_start_file_processing(data):
        """Handle file processing start requests"""
        try:
            # Import the file processor blueprint function
            from blueprints.features.file_processor import start_file_processing_task
            
            task_id = start_file_processing_task(data)
            emit('task_started', {
                'task_id': task_id,
                'type': 'file_processing',
                'message': 'File processing started'
            })
            
        except Exception as e:
            logger.error(f"Error starting file processing: {e}")
            emit('task_error', {
                'type': 'file_processing',
                'error': str(e)
            })
    
    # =============================================================================
    # WEB SCRAPING EVENTS
    # =============================================================================
    
    @socketio.on('start_web_scraping')
    def handle_start_web_scraping(data):
        """Handle web scraping start requests"""
        try:
            from blueprints.features.web_scraper import start_web_scraping_task
            
            task_id = start_web_scraping_task(data)
            emit('task_started', {
                'task_id': task_id,
                'type': 'web_scraping',
                'message': 'Web scraping started'
            })
            
        except Exception as e:
            logger.error(f"Error starting web scraping: {e}")
            emit('task_error', {
                'type': 'web_scraping',
                'error': str(e)
            })
    
    # =============================================================================
    # PLAYLIST DOWNLOADER EVENTS
    # =============================================================================
    
    @socketio.on('start_playlist_download')
    def handle_start_playlist_download(data):
        """Handle playlist download start requests"""
        try:
            from blueprints.features.playlist_downloader import start_playlist_download_task
            
            task_id = start_playlist_download_task(data)
            emit('task_started', {
                'task_id': task_id,
                'type': 'playlist_download',
                'message': 'Playlist download started'
            })
            
        except Exception as e:
            logger.error(f"Error starting playlist download: {e}")
            emit('task_error', {
                'type': 'playlist_download',
                'error': str(e)
            })
            
    @socketio.on('request_task_status')
    def handle_status_request(data):
        """
        Handle requests for task status updates.
        
        Args:
            data: Dict with task_id to request status for
        """
        task_id = data.get('task_id')
        if not task_id:
            emit('task_error', {
                'error': "Task ID missing in status request", 
                'task_id': None, 
                'sid': request.sid
            })
            return

        logger.info(f"Status request for task {task_id} from {request.sid}")
        task = get_task(task_id)
        if task:
            try:
                # Call the task's own status reporting method if available
                if hasattr(task, 'get_status') and callable(task.get_status):
                    status_data = task.get_status()
                    emit('progress_update', status_data)
                else:
                    # Fallback for tasks without get_status method
                    status_data = {
                        'task_id': task_id,
                        'task_type': getattr(task, 'task_type', 'unknown'),
                        'status': getattr(task, 'status', 'unknown'),
                        'progress': getattr(task, 'progress', 0),
                        'message': getattr(task, 'message', 'Task status retrieved'),
                        'stats': getattr(task, 'stats', {}),
                        'timestamp': time.time()
                    }
                    
                    # If stats object has to_dict method, use it
                    if hasattr(status_data['stats'], 'to_dict'):
                        status_data['stats'] = status_data['stats'].to_dict()
                        
                    emit('progress_update', status_data)
            except Exception as e:
                logger.error(f"Error retrieving task status for {task_id}: {e}", exc_info=True)
                emit('task_error', {
                    'task_id': task_id,
                    'error': f"Error retrieving task status: {str(e)}",
                    'sid': request.sid
                })
        else:
            emit('task_error', {
                'task_id': task_id,
                'error': f"Task with ID {task_id} not found",
                'sid': request.sid
            })


    # ----------------------------------------------------------------------------
    # Legacy Compatibility Functions
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

    # =============================================================================
    # ACADEMIC SEARCH EVENTS
    # =============================================================================
    
    @socketio.on('start_academic_search')
    def handle_start_academic_search(data):
        """Handle academic search start requests"""
        try:
            from blueprints.features.academic_search import start_academic_search_task
            
            task_id = start_academic_search_task(data)
            emit('task_started', {
                'task_id': task_id,
                'type': 'academic_search',
                'message': 'Academic search started'
            })
            
        except Exception as e:
            logger.error(f"Error starting academic search: {e}")
            emit('task_error', {
                'type': 'academic_search',
                'error': str(e)
            })
    
    logger.info("SocketIO events registered successfully")

    # =============================================================================
    # PDF EVENTS
    # =============================================================================

    @socketio.on('pdf_download_start')
    def handle_pdf_download_start(data):
        """Handle PDF download start event."""
        logger.debug(f"PDF download start: {data}")
        
        url = data.get('url')
        task_id = data.get('task_id')
        
        if not url or not task_id:
            emit('pdf_download_error', {
                'error': 'Missing URL or task ID',
                'task_id': task_id
            })
            return
        
        # Get the task
        task = get_task(task_id)
        if not task:
            emit('pdf_download_error', {
                'error': 'Task not found',
                'task_id': task_id
            })
            return
        
        # Emit progress update
        emit('pdf_download_progress', {
            'task_id': task_id,
            'url': url,
            'progress': 0,
            'status': 'downloading',
            'message': 'Starting PDF download...'
        })

    @socketio.on('pdf_download_progress')
    def handle_pdf_download_progress(data):
        """Handle PDF download progress event."""
        logger.debug(f"PDF download progress: {data}")
        
        url = data.get('url')
        task_id = data.get('task_id')
        progress = data.get('progress', 0)
        
        if not url or not task_id:
            return
        
        # Emit progress update
        emit('pdf_download_progress', {
            'task_id': task_id,
            'url': url,
            'progress': progress,
            'status': 'downloading',
            'message': f'Downloading PDF: {progress}%'
        })

    @socketio.on('pdf_download_complete')
    def handle_pdf_download_complete(data):
        """Handle PDF download complete event."""
        logger.debug(f"PDF download complete: {data}")
        
        url = data.get('url')
        task_id = data.get('task_id')
        file_path = data.get('file_path')
        
        if not url or not task_id:
            return
        
        emit('pdf_download_progress', {
            'task_id': task_id,
            'url': url,
            'progress': 100,
            'status': 'success',
            'message': 'PDF download complete',
            'file_path': file_path
        })

    @socketio.on('pdf_download_error')
    def handle_pdf_download_error(data):
        """Handle PDF download error event."""
        logger.debug(f"PDF download error: {data}")
        
        url = data.get('url')
        task_id = data.get('task_id')
        error = data.get('error', 'Unknown error')
        
        if not url or not task_id:
            return
        
        # Emit error update
        emit('pdf_download_progress', {
            'task_id': task_id,
            'url': url,
            'progress': 0,
            'status': 'error',
            'message': f'PDF download failed: {error}'
        })

    def emit_progress(self, progress, message=None, stats=None, pdf_downloads=None):
        """Emit progress with rate limiting, memory efficiency, and enhanced PDF statistics."""
        now = time.time()
        if (now - self.last_emit_time) > self.emit_interval or progress >= 100:
            self.progress = min(progress, 100)
            
            # Build minimal data payload
            data = {
                "task_id": self.task_id,
                "progress": self.progress,
                "status": self.status
            }
            
            if message:
                data["message"] = message
                
            if stats:
                data["stats"] = stats
                
            if pdf_downloads:
                pdf_stats = {
                    "total": len(pdf_downloads),
                    "downloading": sum(1 for pdf in pdf_downloads if pdf.get("status") == "downloading"),
                    "processing": sum(1 for pdf in pdf_downloads if pdf.get("status") == "processing"),
                    "completed": sum(1 for pdf in pdf_downloads if pdf.get("status") == "success"),
                    "failed": sum(1 for pdf in pdf_downloads if pdf.get("status") == "error")
                }
                data["pdf_stats"] = pdf_stats
                
                if len(pdf_downloads) > 50:
                    active_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] in ("downloading", "processing", "error")]
                    completed_pdfs = [pdf for pdf in pdf_downloads if pdf["status"] == "success"]
                    
                    first_pdfs = pdf_downloads[:10]
                    last_pdfs = pdf_downloads[-10:] if len(pdf_downloads) > 10 else []
                    
                    selected_pdfs = list(set(first_pdfs + last_pdfs + active_pdfs))
                    
                    pdf_indices = {pdf["url"]: i for i, pdf in enumerate(pdf_downloads)}
                    selected_pdfs.sort(key=lambda pdf: pdf_indices.get(pdf.get("url", ""), 0))
                    
                    data["pdf_downloads"] = selected_pdfs
                    data["pdf_downloads_summary"] = {
                        "total": len(pdf_downloads),
                        "completed": len(completed_pdfs),
                        "active": len(active_pdfs),
                        "showing": len(selected_pdfs)
                    }
                else:
                    data["pdf_downloads"] = pdf_downloads
            
            try:
                safe_emit("progress_update", data)
                self.last_emit_time = now
                self.last_update_time = now
            except Exception as e:
                logger.debug(f"Socket.IO emission failed: {e}")
                
    @socketio.on('pdf_processing_request')
    def handle_pdf_processing_request(data):
        """Handle a request to process a PDF file via Socket.IO."""
        if not data or 'pdf_path' not in data:
            emit('pdf_processing_error', {
                'error': 'PDF path is required'
            })
            return
        
        pdf_path = data['pdf_path']
        output_dir = data.get('output_dir')
        extract_tables = data.get('extract_tables', True)
        use_ocr = data.get('use_ocr', True)
        
        try:
            # Validate the PDF file
            validation = validate_pdf(pdf_path)
            if not validation['valid']:
                emit('pdf_processing_error', {
                    'error': validation['error'],
                    'pdf_path': pdf_path
                })
                return
                
            # Generate a task ID
            task_id = str(uuid.uuid4())
            
            # Create a PDF processing task
            task = {
                "type": "pdf_processing",
                "pdf_path": pdf_path,
                "output_dir": output_dir,
                "extract_tables": extract_tables,
                "use_ocr": use_ocr,
                "task_id": task_id,
                "status": "pending",
                "start_time": time.time(),
                "validation": validation
            }
            
            # Add task to active tasks
            with tasks_lock:
                api_task_registry[task_id] = task
            
            # Emit initial status
            emit('pdf_processing_started', {
                'task_id': task_id,
                'pdf_path': pdf_path,
                'validation': validation
            })
            
            # Start processing in a background thread
            def process_thread():
                try:
                    # Update status to processing
                    with tasks_lock:
                        api_task_registry[task_id]["status"] = "processing"
                    
                    # Emit processing update
                    safe_emit('pdf_processing_update', {
                        'task_id': task_id,
                        'status': 'processing',
                        'message': 'Processing started'
                    })
                    
                    # Process the PDF
                    if pdf_extractor_available:
                        result = pdf_extractor.process_pdf(
                            pdf_path=pdf_path,
                            output_path=output_dir,
                            extract_tables=extract_tables,
                            use_ocr=use_ocr,
                            return_data=True
                        )
                    elif structify_available and hasattr(structify_module, 'process_pdf'):
                        result = structify_module.process_pdf(
                            pdf_path=pdf_path,
                            output_path=output_dir,
                            max_chunk_size=4096,
                            extract_tables=extract_tables,
                            use_ocr=use_ocr,
                            return_data=True
                        )
                    else:
                        result = {"status": "error", "error": "No PDF processing module available"}
                    
                    # Update task with result
                    with tasks_lock:
                        api_task_registry[task_id]["status"] = "completed" if result.get("status") == "success" else "error"
                        api_task_registry[task_id]["result"] = result
                        api_task_registry[task_id]["end_time"] = time.time()
                    
                    # Emit completion or error
                    if result.get("status") == "success":
                        safe_emit('pdf_processing_complete', {
                            'task_id': task_id,
                            'status': 'completed',
                            'result': result,
                            'processing_time': time.time() - task["start_time"]
                        })
                    else:
                        safe_emit('pdf_processing_error', {
                            'task_id': task_id,
                            'status': 'error',
                            'error': result.get("error", "Unknown error")
                        })
                except Exception as e:
                    logger.error(f"Error processing PDF {pdf_path}: {e}", exc_info=True)
                    
                    # Update task with error
                    with tasks_lock:
                        api_task_registry[task_id]["status"] = "error"
                        api_task_registry[task_id]["error"] = str(e)
                        api_task_registry[task_id]["end_time"] = time.time()
                    
                    # Emit error
                    safe_emit('pdf_processing_error', {
                        'task_id': task_id,
                        'status': 'error',
                        'error': str(e)
                    })
            
            # Start processing thread
            thread = threading.Thread(target=process_thread)
            thread.daemon = True
            thread.start()
            
        except Exception as e:
            logger.error(f"Error initiating PDF processing: {e}", exc_info=True)
            emit('pdf_processing_error', {
                'error': str(e),
                'pdf_path': pdf_path
            })
    def emit_pdf_download_progress(task_id, url, progress, status, file_path=None, error=None, details=None):
        """
        Emit PDF download progress via Socket.IO.
        
        Args:
            task_id: Task ID for the PDF download (can be subtask ID)
            url: URL being downloaded
            progress: Progress percentage (0-100)
            status: Status string (downloading, success, error)
            file_path: Optional path to saved file
            error: Optional error message if status is error
            details: Optional additional details
        """
        try:
            payload = {
                'task_id': task_id,
                'url': url,
                'progress': min(max(0, progress), 100),
                'status': status,
                'timestamp': time.time()
            }
            
            # Include optional data
            if file_path:
                payload['file_path'] = file_path
                
            if error:
                payload['error'] = error
                
            if details:
                payload['details'] = details
                
            safe_emit('pdf_download_progress', payload)
            if progress == 100 and status == 'success':
                logger.info(f"PDF download completed: {url} -> {file_path}")
            elif status == 'error':
                logger.warning(f"PDF download error for {url}: {error}")
            else:
                logger.debug(f"PDF download progress for {url}: {progress}%")
        except Exception as e:
            logger.error(f"Error emitting pdf_download_progress: {e}")

    # --- PDF processing progress events ---

    def emit_pdf_processing_progress(task_id, file_path, stage, progress, output_path=None, error=None):
        """
        Emit PDF processing progress via Socket.IO.
        
        Args:
            task_id: Task ID for processing
            file_path: Path to PDF being processed
            stage: Processing stage (e.g., "text_extraction", "table_extraction")
            progress: Progress percentage (0-100)
            output_path: Optional path to output file
            error: Optional error message
        """
        try:
            payload = {
                'task_id': task_id,
                'file_path': file_path,
                'stage': stage,
                'progress': min(max(0, progress), 100),
                'timestamp': time.time()
            }
            
            # Include optional data
            if output_path:
                payload['output_path'] = output_path
                
            if error:
                payload['error'] = error
                payload['status'] = 'error'
            else:
                payload['status'] = 'processing' if progress < 100 else 'completed'
                
            safe_emit('pdf_processing_progress', payload)
        except Exception as e:
            logger.error(f"Error emitting pdf_processing_progress: {e}")       
# =============================================================================
# UTILITY FUNCTIONS FOR EMITTING PROGRESS UPDATES
# =============================================================================
def emit_task_started(task_id, task_type, message=None, stats=None, details=None):
    """
    Emit a task started event via Socket.IO.
    
    Args:
        task_id: Unique identifier for the task
        task_type: Type of task (e.g., "file_processing", "web_scraping")
        message: Optional message for the UI
        stats: Optional initial statistics
        details: Optional additional details for the UI
    """
    try:
        payload = {
            'task_id': task_id,
            'task_type': task_type,
            'status': 'processing',
            'message': message or f"{task_type.replace('_', ' ').title()} started",
            'timestamp': time.time()
        }
        
        # Include optional elements if provided
        if stats:
            payload['stats'] = stats if isinstance(stats, dict) else stats.__dict__
            
        if details:
            payload['details'] = details
            
        # Get socketio from current app
        socketio_instance = current_app.extensions.get('socketio')
        if socketio_instance:
            socketio_instance.emit('task_started', payload)
        else:
            emit('task_started', payload)
        logger.info(f"Emitted task_started for task {task_id} ({task_type})")
    except Exception as e:
        logger.error(f"Error emitting task_started: {e}")
def emit_progress_update(task_id, progress, status="processing", message=None, stats=None, details=None):
    """
    Emit a progress update event via Socket.IO.
    
    Args:
        task_id: Unique identifier for the task
        progress: Progress value (0-100)
        status: Task status string
        message: Optional message for the UI
        stats: Optional statistics object or dict
        details: Optional additional details
    """
    try:
        # Validate progress value
        progress = min(max(0, progress), 100)
        
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': status,
            'message': message or f"Progress: {progress}%",
            'timestamp': time.time()
        }
        
        # Process stats for serialization
        if stats:
            if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                payload['stats'] = stats.to_dict()
            elif isinstance(stats, dict):
                payload['stats'] = stats
            else:
                # Try to convert object to dict
                try:
                    payload['stats'] = stats.__dict__
                except (AttributeError, TypeError):
                    # Last resort: try to serialize the object if possible
                    payload['stats'] = {'raw_stats': str(stats)}
        
        # Include additional details if provided
        if details:
            payload['details'] = details
            
        safe_emit('progress_update', payload)
        logger.debug(f"Emitted progress_update for task {task_id}: {progress}%")
    except Exception as e:
        logger.error(f"Error emitting progress_update: {e}")



def emit_task_completed(task_id, success=True, message=None, stats=None, socketio_instance=None):
    """
    Centralized function to emit task completion
    """
    try:
        if socketio_instance is None:
            from flask import current_app
            socketio_instance = current_app.socketio
        
        # Update task in management system
        complete_task(task_id, success=success, stats=stats)
        
        # Emit completion event
        payload = {
            'task_id': task_id,
            'status': 'completed' if success else 'failed',
            'message': message or ('Task completed successfully' if success else 'Task failed'),
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        event_name = 'task_completed' if success else 'task_failed'
        socketio_instance.emit(event_name, payload)
        logger.info(f"Emitted {event_name} for {task_id}")
        
    except Exception as e:
        logger.error(f"Error emitting task completion for {task_id}: {e}")

def emit_task_completion(task_id, task_type="generic", output_file=None, stats=None, details=None):
    """
    Emit a task completion event via Socket.IO.
    
    Args:
        task_id: Unique identifier for the task
        task_type: Type of task 
        output_file: Optional path to the output file
        stats: Optional final statistics object or dict
        details: Optional additional details
    """
    try:
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
            
        # Process stats for serialization
        if stats:
            if hasattr(stats, 'to_dict') and callable(stats.to_dict):
                payload['stats'] = stats.to_dict()
            elif isinstance(stats, dict):
                payload['stats'] = stats
            else:
                # Try to convert object to dict
                try:
                    payload['stats'] = stats.__dict__
                except (AttributeError, TypeError):
                    payload['stats'] = {'raw_stats': str(stats)}
        
        # Include additional details if provided
        if details:
            payload['details'] = details
            
        safe_emit('task_completed', payload)
        logger.info(f"Emitted task_completed for task {task_id}")
    except Exception as e:
        logger.error(f"Error emitting task_completed: {e}")

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
                except (AttributeError, TypeError):
                    payload['stats'] = {'raw_stats': str(stats)}
                    
        safe_emit('task_error', payload)
        logger.info(f"Emitted task_error for task {task_id}: {error_message}")
    except Exception as e:
        logger.error(f"Error emitting task_error: {e}")
        
def emit_task_cancelled(task_id, reason=None):
    """
    Emit a task cancellation event via Socket.IO.
    
    Args:
        task_id: Unique identifier for the task
        reason: Optional reason for cancellation
    """
    try:
        payload = {
            'task_id': task_id,
            'status': 'cancelled',
            'message': 'Task cancelled by user' if not reason else f"Task cancelled: {reason}",
            'timestamp': time.time()
        }
        
        safe_emit('task_cancelled', payload)
        logger.info(f"Emitted task_cancelled for task {task_id}")
    except Exception as e:
        logger.error(f"Error emitting task_cancelled: {e}")

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
            safe_emit('pdf_processing_cancelled', base_payload)
        elif task_type == "scraping":
            safe_emit('scraping_cancelled', base_payload)
        elif task_type == "playlist":
            safe_emit('playlist_cancelled', base_payload)
        
        # Always emit the general cancellation event for frontend compatibility
        emit_task_cancelled(task_id, reason=reason)
        
        logger.info(f"[CANCEL] Emitted cancellation events for task {task_id} ({task_type})")
        
    except Exception as e:
        logger.error(f"[CANCEL] Failed to emit cancellation events for {task_id}: {e}")

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

def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Thread-safe task status retrieval with comprehensive information.
    
    Args:
        task_id: The task identifier
        
    Returns:
        Task status dictionary or None if not found
    """
    with tasks_lock:
        task = api_task_registry.get(task_id)
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