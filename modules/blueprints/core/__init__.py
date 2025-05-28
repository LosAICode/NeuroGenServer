"""
Core Blueprint Module
Provides core functionality and utilities for the application
"""

# Import commonly used utilities
from .utils import (
    setup_logging,
    sanitize_filename,
    normalize_path,
    safe_split,
    ensure_temp_directory,
    get_output_filepath,
    resolve_output_path,
    format_time_duration,
    structured_error_response
)

from .services import (
    BaseTask,
    ProcessingTask,
    PlaylistTask,
    ScraperTask,
    ApiKeyManager,
    Limiter,
    CustomFileStats,
    add_task,
    get_task,
    remove_task,
    active_tasks,
    tasks_lock
)

from .cleanup import (
    cleanup_temp_files,
    start_periodic_cleanup,
    stop_periodic_cleanup
)

from .http_client import (
    get_session,
    download_file,
    make_request
)

from .structify_integration import (
    structify_module,
    structify_available,
    process_file
)

from .ocr_config import (
    setup_ocr_environment,
    pdf_extractor,
    pdf_extractor_available
)

__all__ = [
    # Utils
    'setup_logging',
    'sanitize_filename',
    'normalize_path',
    'safe_split',
    'ensure_temp_directory',
    'get_output_filepath',
    'resolve_output_path',
    'format_time_duration',
    'structured_error_response',
    
    # Services
    'BaseTask',
    'ProcessingTask',
    'PlaylistTask',
    'ScraperTask',
    'ApiKeyManager',
    'Limiter',
    'CustomFileStats',
    'add_task',
    'get_task',
    'remove_task',
    'active_tasks',
    'tasks_lock',
    
    # Cleanup
    'cleanup_temp_files',
    'start_periodic_cleanup',
    'stop_periodic_cleanup',
    
    # HTTP Client
    'get_session',
    'download_file',
    'make_request',
    
    # Structify
    'structify_module',
    'structify_available',
    'process_file',
    
    # OCR
    'setup_ocr_environment',
    'pdf_extractor',
    'pdf_extractor_available'
]