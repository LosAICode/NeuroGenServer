"""
Blueprints Package
Central import location for all Flask blueprints
"""

# Core blueprints
from .core.routes import core_bp

# API blueprints
from .api.management import api_management_bp
from .api.analytics import analytics_bp

# Feature blueprints
from .features.file_processor import file_processor_bp
from .features.web_scraper import web_scraper_bp
from .features.playlist_downloader import playlist_downloader_bp
from .features.academic_search import academic_search_bp
from .features.pdf_processor import pdf_processor_bp
from .features.file_utils import file_utils_bp

# SocketIO events
from .socketio_events import register_socketio_events

# Export all blueprints
__all__ = [
    'core_bp',
    'api_management_bp',
    'analytics_bp',
    'file_processor_bp',
    'web_scraper_bp',
    'playlist_downloader_bp',
    'academic_search_bp',
    'pdf_processor_bp',
    'file_utils_bp',
    'register_socketio_events'
]