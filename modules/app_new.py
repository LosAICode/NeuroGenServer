"""
NeuroGen Server - Refactored with Flask Blueprints
Clean, maintainable Flask application using Blueprint architecture
"""
import eventlet
eventlet.monkey_patch()

import os
import sys
import logging
from flask import Flask
from flask_socketio import SocketIO
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Validate critical environment variables
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    logger.warning("YOUTUBE_API_KEY not set in .env - YouTube functionality will be limited")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
structify_dir = os.path.join(current_dir, 'Structify')
modules_dir = current_dir  

for path in [parent_dir, current_dir, structify_dir]:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

def create_app():
    """Application factory"""
    app = Flask(__name__)
    
    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB max file size
    
    # Initialize SocketIO
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='eventlet',
        logger=True,
        engineio_logger=True
    )
    
    # Initialize core services
    from blueprints.core.services import ApiKeyManager, Limiter
    
    # Create API key manager
    api_key_manager = ApiKeyManager()
    
    # Create rate limiter (simple version for development)
    limiter = Limiter(
        lambda: '127.0.0.1',  # Use localhost for development
        app=app,
        default_limits=["100 per day", "10 per minute"]
    )
    
    # Store services in app context for access by blueprints
    app.api_key_manager = api_key_manager
    app.limiter = limiter
    app.socketio = socketio
    
    # Register Blueprints
    register_blueprints(app)
    
    # Register SocketIO events
    register_socketio_events(socketio)
    
    logger.info("NeuroGen Server application created successfully")
    return app, socketio


def register_blueprints(app):
    """Register all application blueprints"""
    
    # Core routes (home, diagnostics, etc.)
    from blueprints.core.routes import core_bp
    app.register_blueprint(core_bp)
    
    # Feature blueprints
    from blueprints.features.file_processor import file_processor_bp
    from blueprints.features.web_scraper import web_scraper_bp
    from blueprints.features.playlist_downloader import playlist_downloader_bp
    from blueprints.features.academic_search import academic_search_bp
    from blueprints.features.pdf_processor import pdf_processor_bp
    from blueprints.features.file_utils import file_utils_bp
    
    app.register_blueprint(file_processor_bp)
    app.register_blueprint(web_scraper_bp)
    app.register_blueprint(playlist_downloader_bp)
    app.register_blueprint(academic_search_bp)
    app.register_blueprint(pdf_processor_bp)
    app.register_blueprint(file_utils_bp)
    
    # API management
    from blueprints.api.management import api_management_bp
    app.register_blueprint(api_management_bp)
    
    logger.info("All blueprints registered successfully")


def register_socketio_events(socketio):
    """Register SocketIO event handlers"""
    # Import and register all SocketIO events from the centralized module
    from blueprints.socketio_events import register_socketio_events as register_events
    register_events(socketio)


def run_server(host='127.0.0.1', port=5025, debug=True):
    """Run the application server"""
    try:
        app, socketio = create_app()
        
        logger.info(f"Starting NeuroGen Server on {host}:{port}")
        logger.info(f"Debug mode: {debug}")
        
        # Run with SocketIO
        socketio.run(
            app,
            host=host,
            port=port,
            debug=debug,
            use_reloader=False  # Disable reloader to prevent issues with eventlet
        )
        
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        raise

# ----------------------------------------------------------------------------
# Error Handlers
# ----------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(error):
    return structured_error_response("NOT_FOUND", "The requested resource was not found.", 404)

@app.errorhandler(413)
def request_entity_too_large(error):
    return structured_error_response("REQUEST_TOO_LARGE", f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE/(1024*1024)}MB.", 413)

@app.errorhandler(500)
def internal_server_error(error):
    return structured_error_response("SERVER_ERROR", "An internal server error occurred.", 500)

if __name__ == '__main__':
    # Default configuration
    HOST = os.environ.get('HOST', '127.0.0.1')
    PORT = int(os.environ.get('PORT', 5025))
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    
    run_server(host=HOST, port=PORT, debug=DEBUG)