"""
NeuroGen Server - Refactored with Flask Blueprints
Clean, maintainable Flask application using Blueprint architecture
"""

import os
import sys
import logging
from flask import Flask
from flask_socketio import SocketIO
import eventlet

# Monkey patch for async support
eventlet.monkey_patch()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

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
    
    app.register_blueprint(file_processor_bp)
    app.register_blueprint(web_scraper_bp)
    app.register_blueprint(playlist_downloader_bp)
    app.register_blueprint(academic_search_bp)
    
    # API management
    from blueprints.api.management import api_management_bp
    app.register_blueprint(api_management_bp)
    
    logger.info("All blueprints registered successfully")


def register_socketio_events(socketio):
    """Register SocketIO event handlers"""
    
    @socketio.on('connect')
    def handle_connect():
        logger.info('Client connected to SocketIO')
    
    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info('Client disconnected from SocketIO')
    
    @socketio.on('join_room')
    def handle_join_room(data):
        room = data.get('room')
        if room:
            from flask_socketio import join_room
            join_room(room)
            logger.info(f'Client joined room: {room}')
    
    @socketio.on('request_status')
    def handle_status_request(data):
        task_id = data.get('task_id')
        if task_id:
            # TODO: Implement status lookup and emit response
            logger.info(f'Status requested for task: {task_id}')
    
    logger.info("SocketIO events registered successfully")


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


if __name__ == '__main__':
    # Default configuration
    HOST = os.environ.get('HOST', '127.0.0.1')
    PORT = int(os.environ.get('PORT', 5025))
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    
    run_server(host=HOST, port=PORT, debug=DEBUG)