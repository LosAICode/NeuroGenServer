"""
Unified SocketIO Context Helper - v4.0 Blueprint Architecture
Provides comprehensive SocketIO emit functions with complete frontend-backend alignment
Eliminates legacy patterns and ensures consistent Blueprint-aligned communication
"""

import logging
import time
from typing import Dict, Any, Optional, Union, List
from flask import current_app

logger = logging.getLogger(__name__)

# Store the Flask app instance for use in background threads
_app_instance = None
_socketio_instance = None

def set_app_context(app, socketio):
    """Set the Flask app and SocketIO instances for use in background threads"""
    global _app_instance, _socketio_instance
    _app_instance = app
    _socketio_instance = socketio
    logger.info("Unified SocketIO context helper v4.0 initialized")

# =============================================================================
# CORE UNIFIED EMISSION FUNCTIONS
# =============================================================================

def emit_with_context(event: str, data: Dict[str, Any], room: Optional[str] = None, namespace: Optional[str] = None):
    """Unified SocketIO emit function with proper Flask application context"""
    global _app_instance, _socketio_instance
    
    if not _socketio_instance or not _app_instance:
        logger.warning(f"Cannot emit {event}: SocketIO context not initialized")
        return False
    
    try:
        # Use Flask application context
        with _app_instance.app_context():
            # Enhanced emission with Blueprint-aligned payload structure
            enhanced_data = _enhance_payload_for_blueprint_alignment(event, data)
            
            # Emit with proper parameters
            if room:
                _socketio_instance.emit(event, enhanced_data, room=room, namespace=namespace)
            else:
                _socketio_instance.emit(event, enhanced_data, namespace=namespace)
            return True
    except Exception as e:
        logger.error(f"Error emitting {event}: {e}")
        return False

def _enhance_payload_for_blueprint_alignment(event: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Enhance payload to match frontend EVENT_PAYLOADS schema exactly"""
    enhanced_data = data.copy()
    
    # Ensure timestamp is always present
    if 'timestamp' not in enhanced_data:
        enhanced_data['timestamp'] = time.time()
    
    # Blueprint alignment based on event type
    if 'task_' in event or 'progress_' in event:
        # Extract blueprint from task_type if available
        task_type = enhanced_data.get('task_type', '')
        if task_type:
            enhanced_data['blueprint'] = _get_blueprint_from_task_type(task_type)
    
    # Ensure required fields for different event types
    if event in ['task_started', 'progress_update', 'task_completed', 'task_error']:
        required_fields = ['task_id', 'status']
        for field in required_fields:
            if field not in enhanced_data:
                enhanced_data[field] = 'unknown' if field == 'status' else ''
    
    return enhanced_data

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

def _serialize_stats(stats: Union[Dict, object]) -> Dict:
    """Serialize stats object to dict for JSON transmission"""
    if isinstance(stats, dict):
        return stats
    elif hasattr(stats, 'to_dict') and callable(stats.to_dict):
        return stats.to_dict()
    elif hasattr(stats, '__dict__'):
        return stats.__dict__
    else:
        return {'raw_stats': str(stats)}

# =============================================================================
# UNIFIED TASK LIFECYCLE EVENTS (Blueprint-aligned)
# =============================================================================

def emit_task_started_safe(task_id: str, task_type: str, message: Optional[str] = None, 
                         stats: Optional[Dict] = None, details: Optional[Dict] = None,
                         estimated_duration: Optional[float] = None):
    """Unified task started emission with complete Blueprint alignment"""
    
    # Blueprint-aligned payload matching frontend EVENT_PAYLOADS.TASK_STARTED schema
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'status': 'processing',
        'message': message or f"{task_type.replace('_', ' ').title()} started",
        'timestamp': time.time()
    }
    
    # Optional fields
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if details:
        payload['details'] = details
    if estimated_duration:
        payload['estimated_duration'] = estimated_duration
    
    success = emit_with_context('task_started', payload)
    if success:
        logger.info(f"Emitted unified task_started for {task_id} ({task_type})")
    return success

def emit_progress_update_safe(task_id: str, progress: float, task_type: str = 'unknown',
                            message: Optional[str] = None, details: Optional[Dict] = None, 
                            stats: Optional[Dict] = None, stage: Optional[str] = None,
                            estimated_remaining: Optional[float] = None):
    """Unified progress update emission with complete Blueprint alignment"""
    
    # Normalize progress value
    progress = min(max(0, progress), 100)
    
    # Blueprint-aligned payload matching frontend EVENT_PAYLOADS.PROGRESS_UPDATE schema
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'progress': progress,
        'status': 'completed' if progress >= 100 else 'processing',
        'message': message or f"Progress: {progress}%",
        'timestamp': time.time()
    }
    
    # Optional fields
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if details:
        payload['details'] = details
    if stage:
        payload['stage'] = stage
    if estimated_remaining:
        payload['estimated_remaining'] = estimated_remaining
    
    success = emit_with_context('progress_update', payload)
    if success:
        logger.debug(f"Emitted unified progress_update for {task_id}: {progress}%")
    return success

def emit_task_completion_safe(task_id: str, task_type: str = "generic", output_file: Optional[str] = None, 
                            output_files: Optional[List[str]] = None, stats: Optional[Dict] = None, 
                            details: Optional[Dict] = None, duration_seconds: Optional[float] = None,
                            success_count: Optional[int] = None, error_count: Optional[int] = None):
    """Unified task completion emission with complete Blueprint alignment"""
    
    # Blueprint-aligned payload matching frontend EVENT_PAYLOADS.TASK_COMPLETED schema
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
    if output_files:
        payload['output_files'] = output_files
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if details:
        payload['details'] = details
    if duration_seconds:
        payload['duration_seconds'] = duration_seconds
    if success_count is not None:
        payload['success_count'] = success_count
    if error_count is not None:
        payload['error_count'] = error_count
    
    success = emit_with_context('task_completed', payload)
    if success:
        logger.info(f"Emitted unified task_completed for {task_id} ({task_type})")
    return success

def emit_task_error_safe(task_id: str, task_type: str, error_message: str, 
                       error_code: Optional[str] = None, error_details: Optional[Dict] = None,
                       stats: Optional[Dict] = None, progress: float = 0,
                       retry_possible: Optional[bool] = None, suggested_action: Optional[str] = None):
    """Unified task error emission with complete Blueprint alignment"""
    
    # Blueprint-aligned payload matching frontend EVENT_PAYLOADS.TASK_ERROR schema
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'status': 'failed',
        'error': error_message,
        'progress': progress,
        'timestamp': time.time()
    }
    
    # Optional fields
    if error_code:
        payload['error_code'] = error_code
    if error_details:
        payload['error_details'] = error_details
    if stats:
        payload['stats'] = _serialize_stats(stats)
    if retry_possible is not None:
        payload['retry_possible'] = retry_possible
    if suggested_action:
        payload['suggested_action'] = suggested_action
    
    success = emit_with_context('task_error', payload)
    if success:
        logger.info(f"Emitted unified task_error for {task_id} ({task_type}): {error_message}")
    return success

def emit_task_cancelled_safe(task_id: str, task_type: str = 'unknown', reason: Optional[str] = None):
    """Unified task cancellation emission with Blueprint alignment"""
    payload = {
        'task_id': task_id,
        'task_type': task_type,
        'blueprint': _get_blueprint_from_task_type(task_type),
        'status': 'cancelled',
        'message': 'Task cancelled by user' if not reason else f"Task cancelled: {reason}",
        'timestamp': time.time()
    }
    
    success = emit_with_context('task_cancelled', payload)
    if success:
        logger.info(f"Emitted unified task_cancelled for {task_id} ({task_type})")
    return success

# =============================================================================
# BLUEPRINT-SPECIFIC UNIFIED EVENTS
# =============================================================================

def emit_file_processed_safe(task_id: str, file_path: str, file_size: int, 
                           processing_time: float, chunks_created: Optional[int] = None):
    """File Processor Blueprint-specific event"""
    payload = {
        'task_id': task_id,
        'file_path': file_path,
        'file_size': file_size,
        'processing_time': processing_time,
        'timestamp': time.time()
    }
    
    if chunks_created is not None:
        payload['chunks_created'] = chunks_created
    
    success = emit_with_context('file_processed', payload)
    if success:
        logger.debug(f"Emitted file_processed for {file_path}")
    return success

def emit_playlist_video_progress_safe(task_id: str, video_url: str, video_title: str,
                                    progress: float, downloaded_bytes: int, total_bytes: int,
                                    speed_bps: Optional[float] = None, eta_seconds: Optional[float] = None):
    """Playlist Downloader Blueprint-specific event"""
    payload = {
        'task_id': task_id,
        'video_url': video_url,
        'video_title': video_title,
        'progress': min(max(0, progress), 100),
        'downloaded_bytes': downloaded_bytes,
        'total_bytes': total_bytes,
        'timestamp': time.time()
    }
    
    if speed_bps is not None:
        payload['speed_bps'] = speed_bps
    if eta_seconds is not None:
        payload['eta_seconds'] = eta_seconds
    
    success = emit_with_context('playlist_video_progress', payload)
    if success:
        logger.debug(f"Emitted playlist_video_progress for {video_title}: {progress}%")
    return success

def emit_pdf_download_progress_safe(task_id: str, pdf_url: str, progress: float,
                                  downloaded_bytes: int, total_bytes: int,
                                  pdf_title: Optional[str] = None, speed_bps: Optional[float] = None):
    """Web Scraper Blueprint PDF download event"""
    payload = {
        'task_id': task_id,
        'pdf_url': pdf_url,
        'progress': min(max(0, progress), 100),
        'downloaded_bytes': downloaded_bytes,
        'total_bytes': total_bytes,
        'timestamp': time.time()
    }
    
    if pdf_title:
        payload['pdf_title'] = pdf_title
    if speed_bps is not None:
        payload['speed_bps'] = speed_bps
    
    success = emit_with_context('pdf_download_progress', payload)
    if success:
        logger.debug(f"Emitted pdf_download_progress for {pdf_url}: {progress}%")
    return success

def emit_academic_paper_found_safe(task_id: str, paper_id: str, title: str, authors: List[str],
                                  source: str, doi: Optional[str] = None, 
                                  arxiv_id: Optional[str] = None, pdf_url: Optional[str] = None):
    """Academic Search Blueprint-specific event"""
    payload = {
        'task_id': task_id,
        'paper_id': paper_id,
        'title': title,
        'authors': authors,
        'source': source,
        'timestamp': time.time()
    }
    
    if doi:
        payload['doi'] = doi
    if arxiv_id:
        payload['arxiv_id'] = arxiv_id
    if pdf_url:
        payload['pdf_url'] = pdf_url
    
    success = emit_with_context('academic_paper_found', payload)
    if success:
        logger.debug(f"Emitted academic_paper_found: {title}")
    return success

# =============================================================================
# SYSTEM AND CROSS-PLATFORM EVENTS
# =============================================================================

def emit_cross_platform_status_safe(server_platform: str, client_platform: str,
                                   path_conversion_active: bool, windows_client_support: bool):
    """Cross-platform status event"""
    payload = {
        'server_platform': server_platform,
        'client_platform': client_platform,
        'path_conversion_active': path_conversion_active,
        'windows_client_support': windows_client_support,
        'timestamp': time.time()
    }
    
    success = emit_with_context('cross_platform_status', payload)
    if success:
        logger.info(f"Emitted cross_platform_status: {server_platform} -> {client_platform}")
    return success

def emit_system_status_safe(status: str, message: str, details: Optional[Dict] = None):
    """System status event"""
    payload = {
        'status': status,
        'message': message,
        'timestamp': time.time()
    }
    
    if details:
        payload['details'] = details
    
    success = emit_with_context('system_status', payload)
    if success:
        logger.info(f"Emitted system_status: {status}")
    return success

# =============================================================================
# LEGACY COMPATIBILITY LAYER (for gradual migration)
# =============================================================================

# These functions maintain backward compatibility while using the new unified system
def emit_task_started(task_id: str, task_type: str, message: Optional[str] = None):
    """Legacy compatibility wrapper"""
    logger.warning("Using legacy emit_task_started - please migrate to emit_task_started_safe")
    return emit_task_started_safe(task_id, task_type, message)

def emit_progress_update(task_id: str, progress: float, message: Optional[str] = None):
    """Legacy compatibility wrapper"""
    logger.warning("Using legacy emit_progress_update - please migrate to emit_progress_update_safe")
    return emit_progress_update_safe(task_id, progress, message=message)

def emit_task_completed(task_id: str, output_file: Optional[str] = None):
    """Legacy compatibility wrapper"""
    logger.warning("Using legacy emit_task_completed - please migrate to emit_task_completion_safe")
    return emit_task_completion_safe(task_id, output_file=output_file)

def emit_task_error(task_id: str, error_message: str):
    """Legacy compatibility wrapper"""
    logger.warning("Using legacy emit_task_error - please migrate to emit_task_error_safe")
    return emit_task_error_safe(task_id, 'unknown', error_message)

# =============================================================================
# PROGRESS HANDLER INTEGRATION
# =============================================================================

class UnifiedProgressHandler:
    """Unified Progress Handler that integrates with all Blueprint modules"""
    
    def __init__(self, task_id: str, task_type: str):
        self.task_id = task_id
        self.task_type = task_type
        self.blueprint = _get_blueprint_from_task_type(task_type)
        self.last_progress = 0
        self.start_time = time.time()
        
    def emit_started(self, message: Optional[str] = None, stats: Optional[Dict] = None):
        """Emit task started event"""
        return emit_task_started_safe(
            self.task_id, self.task_type, message, stats
        )
    
    def emit_progress(self, progress: float, message: Optional[str] = None, 
                     details: Optional[Dict] = None, stats: Optional[Dict] = None,
                     stage: Optional[str] = None):
        """Emit progress update with deduplication"""
        # Only emit if progress changed significantly (>= 1% change)
        if abs(progress - self.last_progress) >= 1.0 or progress >= 100:
            self.last_progress = progress
            return emit_progress_update_safe(
                self.task_id, progress, self.task_type, message, details, stats, stage
            )
        return True
    
    def emit_completed(self, output_file: Optional[str] = None, 
                      output_files: Optional[List[str]] = None,
                      stats: Optional[Dict] = None, success_count: Optional[int] = None):
        """Emit task completion event"""
        duration = time.time() - self.start_time
        return emit_task_completion_safe(
            self.task_id, self.task_type, output_file, output_files, 
            stats, duration_seconds=duration, success_count=success_count
        )
    
    def emit_error(self, error_message: str, error_code: Optional[str] = None,
                  error_details: Optional[Dict] = None, retry_possible: bool = False):
        """Emit task error event"""
        return emit_task_error_safe(
            self.task_id, self.task_type, error_message, error_code,
            error_details, retry_possible=retry_possible
        )
    
    def emit_cancelled(self, reason: Optional[str] = None):
        """Emit task cancellation event"""
        return emit_task_cancelled_safe(self.task_id, self.task_type, reason)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_unified_progress_handler(task_id: str, task_type: str) -> UnifiedProgressHandler:
    """Factory function to create unified progress handler"""
    return UnifiedProgressHandler(task_id, task_type)

def validate_event_payload(event_name: str, payload: Dict) -> bool:
    """Validate payload against frontend schema"""
    # This could be enhanced with actual schema validation
    required_fields = {
        'task_started': ['task_id', 'task_type', 'blueprint', 'status'],
        'progress_update': ['task_id', 'task_type', 'blueprint', 'progress', 'status'],
        'task_completed': ['task_id', 'task_type', 'blueprint', 'status', 'progress'],
        'task_error': ['task_id', 'task_type', 'blueprint', 'status', 'error']
    }
    
    if event_name in required_fields:
        for field in required_fields[event_name]:
            if field not in payload:
                logger.warning(f"Missing required field '{field}' in {event_name} payload")
                return False
    return True

logger.info("Unified SocketIO Context Helper v4.0 loaded - Complete Blueprint alignment enabled")