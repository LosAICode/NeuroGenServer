"""
Core Routes Blueprint
Handles basic application routes like home, diagnostics, etc.
"""

from flask import Blueprint, render_template, jsonify, request
import logging
import time

logger = logging.getLogger(__name__)

# Create the blueprint
core_bp = Blueprint('core', __name__)

@core_bp.route('/')
def home():
    """Main application page"""
    try:
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Error rendering home page: {str(e)}")
        return f"Error loading application: {str(e)}", 500


@core_bp.route('/diagnostics')
def diagnostics():
    """System diagnostics page"""
    try:
        return render_template('run_diagnostics.html')
    except Exception as e:
        logger.error(f"Error rendering diagnostics page: {str(e)}")
        return f"Error loading diagnostics: {str(e)}", 500


@core_bp.route('/test-modules')
def test_modules():
    """Module testing page"""
    try:
        return render_template('test_modules.html')
    except Exception as e:
        logger.error(f"Error rendering test modules page: {str(e)}")
        return f"Error loading test modules: {str(e)}", 500


@core_bp.route('/module-diagnostics-complete')
def module_diagnostics_complete():
    """Complete module diagnostics page"""
    try:
        return render_template('module_diagnostics_complete.html')
    except Exception as e:
        logger.error(f"Error rendering module diagnostics page: {str(e)}")
        return f"Error loading module diagnostics: {str(e)}", 500


@core_bp.route('/endpoint-dashboard')
def endpoint_dashboard():
    """Endpoint dashboard page"""
    try:
        return render_template('endpoint_dashboard.html')
    except Exception as e:
        logger.error(f"Error rendering endpoint dashboard: {str(e)}")
        return f"Error loading endpoint dashboard: {str(e)}", 500


@core_bp.route('/key-manager')
def key_manager():
    """API key management page"""
    try:
        return render_template('key_manager.html')
    except Exception as e:
        logger.error(f"Error rendering key manager: {str(e)}")
        return f"Error loading key manager: {str(e)}", 500


@core_bp.route('/shutdown', methods=['POST'])
def shutdown():
    """Shutdown the server"""
    try:
        logger.info("Shutdown request received")
        
        def shutdown_server():
            import os
            import signal
            os.kill(os.getpid(), signal.SIGTERM)
        
        # Schedule shutdown after response is sent
        import threading
        timer = threading.Timer(1.0, shutdown_server)
        timer.start()
        
        return jsonify({"message": "Server shutting down..."}), 200
        
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")
        return jsonify({"error": str(e)}), 500


# Health check endpoint
@core_bp.route('/health')
def health():
    """Basic health check"""
    try:
        return jsonify({
            "status": "healthy",
            "timestamp": time.time(),
            "service": "NeuroGen Server"
        }), 200
    except Exception as e:
        logger.error(f"Error in health check: {str(e)}")
        return jsonify({"error": str(e)}), 500