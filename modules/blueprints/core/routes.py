"""
Core Routes Blueprint
Handles basic application routes like home, diagnostics, etc.
"""

from flask import Blueprint, render_template, jsonify, request, current_app
import logging
import time
import sys
import os
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

# Create the blueprint
core_bp = Blueprint('core', __name__)

# Export the blueprint for app registration
__all__ = ['core_bp']


# =============================================================================
# ERROR HANDLERS
# =============================================================================

@core_bp.app_errorhandler(404)
def not_found(error):
    """Handle 404 Not Found errors"""
    from blueprints.core.utils import structured_error_response
    return structured_error_response("NOT_FOUND", "The requested resource was not found.", 404)


@core_bp.app_errorhandler(413)
def request_entity_too_large(error):
    """Handle 413 Request Entity Too Large errors"""
    from blueprints.core.utils import structured_error_response
    # Get max size from app config
    max_size = current_app.config.get('MAX_CONTENT_LENGTH', 32 * 1024 * 1024)
    max_size_mb = max_size / (1024 * 1024)
    return structured_error_response("REQUEST_TOO_LARGE", 
                                   f"File exceeds maximum allowed size of {max_size_mb}MB.", 413)


@core_bp.app_errorhandler(500)
def internal_server_error(error):
    """Handle 500 Internal Server errors"""
    from blueprints.core.utils import structured_error_response
    logger.error(f"Internal server error: {error}")
    return structured_error_response("SERVER_ERROR", "An internal server error occurred.", 500)

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
    """Enhanced module diagnostics endpoint for ES6 module system"""
    # Check if request wants JSON (API call) or HTML (browser visit)
    if request.headers.get('Accept', '').startswith('application/json') or request.args.get('format') == 'json':
        # Return JSON for API calls
        import json
        from datetime import datetime
        
        diagnostics = {
            'timestamp': datetime.now().isoformat(),
            'server': {
                'running': True,
                'port': 5025,
                'version': '1.2.3',
                'pythonVersion': sys.version
            },
            'modules': {
                'core': {},
                'utils': {},
                'features': {}
            },
            'endpoints': {},
            'issues': [],
            'recommendations': []
        }
        
        # Check module files exist
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        static_js_path = os.path.join(current_dir, 'static', 'js')
        modules_path = os.path.join(static_js_path, 'modules')
        
        # Define expected modules based on your system
        expected_modules = {
            'core': [
                'errorHandler.js', 'uiRegistry.js', 'stateManager.js',
                'eventRegistry.js', 'eventManager.js', 'themeManager.js',
                'module-bridge.js', 'ui.js', 'domUtils.js', 'app.js',
                'moduleLoader.js', 'index.js'
            ],
            'utils': [
                'socketHandler.js', 'progressHandler.js', 'ui.js',
                'utils.js', 'fileHandler.js', 'domUtils.js',
                'moduleDiagnostics.js', 'systemHealth.js', 'debugTools.js',
                'safeFileProcessor.js'
            ],
            'features': [
                'fileProcessor.js', 'webScraper.js', 'playlistDownloader.js',
                'academicSearch.js', 'academicScraper.js', 'academicApiClient.js',
                'historyManager.js', 'pdfProcessor.js', 'helpMode.js',
                'performanceOptimizer.js', 'keyboardShortcuts.js', 'dragDropHandler.js'
            ]
        }
        
        # Check each module
        for category, modules in expected_modules.items():
            category_path = os.path.join(modules_path, category)
            
            for module_name in modules:
                module_path = os.path.join(category_path, module_name)
                module_info = {
                    'name': module_name,
                    'exists': os.path.exists(module_path),
                    'path': f'/static/js/modules/{category}/{module_name}',
                    'size': 0,
                    'modified': None,
                    'syntaxValid': False,
                    'hasExports': False,
                    'hasImports': False
                }
                
                if module_info['exists']:
                    try:
                        stat = os.stat(module_path)
                        module_info['size'] = stat.st_size
                        module_info['modified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()
                        
                        # Basic syntax check
                        with open(module_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            # Check for basic module patterns
                            module_info['hasExports'] = 'export' in content
                            module_info['hasImports'] = 'import' in content
                            module_info['syntaxValid'] = True  # Basic check
                            
                            # Check for common issues
                            if 'ui =' in content and 'import ui' in content:
                                diagnostics['issues'].append({
                                    'module': f'{category}/{module_name}',
                                    'type': 'CONST_REASSIGNMENT',
                                    'message': 'Attempting to reassign imported constant'
                                })
                    except Exception as e:
                        module_info['error'] = str(e)
                        diagnostics['issues'].append({
                            'module': f'{category}/{module_name}',
                            'type': 'READ_ERROR',
                            'message': str(e)
                        })
                else:
                    diagnostics['issues'].append({
                        'module': f'{category}/{module_name}',
                        'type': 'MODULE_NOT_FOUND',
                        'message': f'Module file not found at {module_path}'
                    })
                
                diagnostics['modules'][category][module_name.replace('.js', '')] = module_info
        
        # Check critical files
        critical_files = {
            'index.js': os.path.join(static_js_path, 'index.js'),
            'index.html': os.path.join(current_dir, 'templates', 'index.html')
        }
        
        for name, path in critical_files.items():
            if not os.path.exists(path):
                diagnostics['issues'].append({
                    'file': name,
                    'type': 'CRITICAL_FILE_MISSING',
                    'message': f'Critical file missing: {path}'
                })
        
        # Check API endpoints - Import comprehensive endpoint registry
        try:
            from endpoint_registry import ENDPOINT_REGISTRY
            endpoints_to_check = ENDPOINT_REGISTRY
        except ImportError:
            # Fallback to basic endpoints if registry not available
            endpoints_to_check = {
                'fileProcessor': {
                    'process': ('/api/process', ['POST']),
                    'status': ('/api/status/<task_id>', ['GET']),
                    'download': ('/api/download/<task_id>', ['GET'])
                },
                'playlistDownloader': {
                    'start': ('/api/start-playlists', ['POST']),
                    'cancel': ('/api/cancel/<task_id>', ['POST'])
                },
                'webScraper': {
                    'scrape': ('/api/scrape2', ['POST']),
                    'status': ('/api/scrape2/status/<task_id>', ['GET']),
                    'cancel': ('/api/scrape2/cancel/<task_id>', ['POST'])
                },
                'academicSearch': {
                    'search': ('/api/academic/search', ['GET']),
                    'health': ('/api/academic/health', ['GET'])
                }
            }
        
        # Check if endpoints exist
        for feature, endpoints in endpoints_to_check.items():
            diagnostics['endpoints'][feature] = {}
            for name, (rule_pattern, methods) in endpoints.items():
                # Check if route exists in Flask app
                exists = False
                for rule in current_app.url_map.iter_rules():
                    if rule.rule == rule_pattern or (rule_pattern.replace('<task_id>', '') in rule.rule):
                        exists = True
                        break
                
                diagnostics['endpoints'][feature][name] = {
                    'url': rule_pattern,
                    'methods': methods,
                    'exists': exists
                }
                
                if not exists:
                    diagnostics['issues'].append({
                        'endpoint': f'{feature}.{name}',
                        'type': 'ENDPOINT_MISSING',
                        'message': f'API endpoint not found: {rule_pattern}'
                    })
        
        # Generate recommendations
        if diagnostics['issues']:
            issue_types = {}
            for issue in diagnostics['issues']:
                issue_type = issue['type']
                if issue_type not in issue_types:
                    issue_types[issue_type] = 0
                issue_types[issue_type] += 1
            
            if 'MODULE_NOT_FOUND' in issue_types:
                diagnostics['recommendations'].append({
                    'priority': 'HIGH',
                    'message': f"Found {issue_types['MODULE_NOT_FOUND']} missing modules",
                    'action': 'Check module file paths and ensure all files are present'
                })
            
            if 'CONST_REASSIGNMENT' in issue_types:
                diagnostics['recommendations'].append({
                    'priority': 'HIGH',
                    'message': 'Found attempts to reassign imported constants',
                    'action': 'Fix import statements and avoid reassigning imported modules'
                })
            
            if 'ENDPOINT_MISSING' in issue_types:
                diagnostics['recommendations'].append({
                    'priority': 'MEDIUM',
                    'message': f"Found {issue_types['ENDPOINT_MISSING']} missing API endpoints",
                    'action': 'Verify backend routes are properly defined'
                })
        
        # Add module loading sequence info
        diagnostics['moduleLoadingInfo'] = {
            'loadOrder': [
                'core/errorHandler', 'core/uiRegistry', 'core/stateManager',
                'core/eventRegistry', 'core/eventManager', 'core/themeManager',
                'utils/socketHandler', 'utils/progressHandler', 'utils/ui',
                'utils/utils', 'utils/fileHandler', 'features/fileProcessor',
                'features/webScraper', 'features/playlistDownloader',
                'features/academicSearch', 'features/historyManager'
            ],
            'entryPoint': '/static/js/index.js',
            'moduleSystem': 'ES6 modules with dynamic imports',
            'timeout': '15000ms per module'
        }
        
        # Add summary
        total_modules = sum(len(modules) for modules in expected_modules.values())
        found_modules = sum(1 for cat in diagnostics['modules'].values() 
                           for mod in cat.values() if mod.get('exists', False))
        
        # Count endpoints
        total_endpoints = sum(len(endpoints) for endpoints in endpoints_to_check.values())
        checked_endpoints = sum(1 for cat in diagnostics['endpoints'].values() 
                               for ep in cat.values() if ep.get('exists', False))
        missing_endpoints = sum(1 for cat in diagnostics['endpoints'].values() 
                               for ep in cat.values() if not ep.get('exists', False))
        
        diagnostics['summary'] = {
            'totalExpectedModules': total_modules,
            'foundModules': found_modules,
            'missingModules': total_modules - found_modules,
            'totalEndpoints': total_endpoints,
            'checkedEndpoints': checked_endpoints,
            'missingEndpoints': missing_endpoints,
            'issueCount': len(diagnostics['issues']),
            'health': 'HEALTHY' if not diagnostics['issues'] else 
                     ('WARNING' if len(diagnostics['issues']) < 5 else 'CRITICAL')
        }
        
        # Return as JSON response
        response = jsonify(diagnostics)
        response.headers['Content-Type'] = 'application/json'
        return response
    else:
        # Return HTML interface for browser visits
        return render_template("test_modules.html")


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
def shutdown_server():
    """Graceful shutdown endpoint"""
    try:
        # Check for secret key to prevent unauthorized shutdowns
        data = request.get_json() or {}
        secret = data.get('secret', '')
        
        if secret != 'neurogen-shutdown-key':
            return jsonify({"error": "Unauthorized"}), 403
        
        # Log shutdown request
        logger.info("Shutdown request received")
        
        # Cleanup function
        def cleanup_and_shutdown():
            # Give time for response to be sent
            time.sleep(1)
            
            # Log cleanup start
            logger.info("Starting cleanup process...")
            
            # Cancel any running threads or background tasks
            # Since there's no global task_manager, we'll do general cleanup
            try:
                # Try to get socketio from current app
                socketio = current_app.extensions.get('socketio')
                if socketio:
                    # Emit shutdown event to all connected clients
                    socketio.emit('server_shutdown', {
                        'message': 'Server is shutting down',
                        'timestamp': time.time()
                    })
                    
                    # Give clients time to disconnect
                    time.sleep(0.5)
                    
                    # Stop accepting new connections
                    socketio.stop()
                
            except Exception as e:
                logger.error(f"Error during socket cleanup: {e}")
            
            # Clean up any temp files
            try:
                import shutil
                import tempfile
                temp_dir = tempfile.gettempdir()
                # Clean up any NeuroGen temp files
                for item in os.listdir(temp_dir):
                    if item.startswith('neurogen_'):
                        item_path = os.path.join(temp_dir, item)
                        try:
                            if os.path.isfile(item_path):
                                os.unlink(item_path)
                            elif os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                        except:
                            pass
            except Exception as e:
                logger.error(f"Error during temp file cleanup: {e}")
            
            logger.info("Cleanup complete, shutting down...")
            
            # Shutdown the server
            func = request.environ.get('werkzeug.server.shutdown')
            if func is None:
                # For production servers (not werkzeug)
                logger.info("Using os._exit for shutdown")
                os._exit(0)
            else:
                logger.info("Using werkzeug shutdown")
                func()
        
        # Start cleanup in background thread
        import threading
        cleanup_thread = threading.Thread(target=cleanup_and_shutdown)
        cleanup_thread.daemon = True
        cleanup_thread.start()
        
        return jsonify({"message": "Server is shutting down gracefully"}), 200
        
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
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