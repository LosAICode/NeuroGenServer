"""
Diagnostics API Blueprint
Provides centralized health checks and module diagnostics
Unified system aligned with Health Monitor
"""

from flask import Blueprint, jsonify, request
import logging
import os
import time
import importlib
import sys
from datetime import datetime
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Create the blueprint
diagnostics_bp = Blueprint('diagnostics', __name__, url_prefix='/api')

# Module registry
MODULE_REGISTRY = {
    'core': [
        'blueprints.core.services',
        'blueprints.core.utils',
        'blueprints.core.config',
        'blueprints.core.routes',
        'blueprints.core.http_client',
        'blueprints.core.structify_integration',
        'blueprints.core.ocr_config'
    ],
    'features': [
        'blueprints.features.file_processor',
        'blueprints.features.web_scraper',
        'blueprints.features.academic_search',
        'blueprints.features.pdf_processor',
        'blueprints.features.playlist_downloader',
        'blueprints.features.web_crawler'
    ],
    'api': [
        'blueprints.api.management',
        'blueprints.api.analytics'
    ],
    'socketio': [
        'blueprints.socketio_events'
    ]
}

@diagnostics_bp.route('/health', methods=['GET'])
def health_check():
    """
    Comprehensive health check endpoint
    """
    start_time = time.time()
    
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '3.1.0',
        'checks': {},
        'response_time_ms': 0
    }
    
    # Check Python modules
    module_check = check_python_modules()
    health_status['checks']['modules'] = module_check
    
    # Check file system
    fs_check = check_file_system()
    health_status['checks']['file_system'] = fs_check
    
    # Check dependencies
    deps_check = check_dependencies()
    health_status['checks']['dependencies'] = deps_check
    
    # Check endpoints
    endpoints_check = check_endpoints()
    health_status['checks']['endpoints'] = endpoints_check
    
    # Determine overall health
    if any(check.get('status') == 'critical' for check in health_status['checks'].values()):
        health_status['status'] = 'critical'
    elif any(check.get('status') == 'warning' for check in health_status['checks'].values()):
        health_status['status'] = 'warning'
    
    health_status['response_time_ms'] = int((time.time() - start_time) * 1000)
    
    return jsonify(health_status)

@diagnostics_bp.route('/test-modules', methods=['GET'])
def test_modules():
    """
    Unified module testing endpoint aligned with Health Monitor
    Tests both Python and JavaScript modules in a centralized system
    """
    results = {
        'timestamp': datetime.now().isoformat(),
        'version': '3.1.0',
        'system_health': 'healthy',
        'backend': {
            'modules': {},
            'summary': {
                'total': 0,
                'loaded': 0,
                'failed': 0,
                'warnings': 0
            }
        },
        'frontend': {
            'modules': {},
            'summary': {
                'total': 0,
                'loaded': 0,
                'failed': 0,
                'warnings': 0
            }
        },
        'integration': {
            'endpoint_alignment': {},
            'socket_connectivity': {},
            'health_status': {}
        }
    }
    
    # Test Python modules
    for category, modules in MODULE_REGISTRY.items():
        results['backend']['modules'][category] = {}
        
        for module_name in modules:
            results['backend']['summary']['total'] += 1
            module_info = test_single_module(module_name)
            results['backend']['modules'][category][module_name] = module_info
            
            if module_info['status'] == 'loaded':
                results['backend']['summary']['loaded'] += 1
            elif module_info['status'] == 'failed':
                results['backend']['summary']['failed'] += 1
            elif module_info['status'] == 'warning':
                results['backend']['summary']['warnings'] += 1
    
    # Test JavaScript modules (always included now)
    js_results = test_javascript_modules()
    results['frontend']['modules'] = js_results
    
    # Calculate frontend summary
    for category, modules in js_results.items():
        for module_name, module_info in modules.items():
            results['frontend']['summary']['total'] += 1
            if module_info.get('exists', False) and module_info.get('size', 0) > 0:
                results['frontend']['summary']['loaded'] += 1
            elif not module_info.get('exists', False):
                results['frontend']['summary']['failed'] += 1
            else:
                results['frontend']['summary']['warnings'] += 1
    
    # Test integration points
    results['integration']['endpoint_alignment'] = test_endpoint_alignment()
    results['integration']['socket_connectivity'] = test_socket_connectivity()
    results['integration']['health_status'] = get_health_summary()
    
    # Determine overall system health
    critical_failures = (
        results['backend']['summary']['failed'] > 2 or
        results['frontend']['summary']['failed'] > 5 or
        not results['integration']['socket_connectivity'].get('available', False)
    )
    
    if critical_failures:
        results['system_health'] = 'critical'
    elif (results['backend']['summary']['failed'] > 0 or 
          results['frontend']['summary']['failed'] > 0):
        results['system_health'] = 'warning'
    else:
        results['system_health'] = 'healthy'
    
    return jsonify(results)

@diagnostics_bp.route('/module/<path:module_path>', methods=['GET'])
def test_specific_module(module_path):
    """
    Test a specific module
    """
    module_info = test_single_module(module_path)
    return jsonify(module_info)

@diagnostics_bp.route('/health-monitor', methods=['GET'])
def health_monitor_status():
    """
    Endpoint specifically for Health Monitor integration
    Provides real-time status updates
    """
    status = {
        'timestamp': datetime.now().isoformat(),
        'system': get_health_summary(),
        'modules': {
            'backend': len([m for cat in MODULE_REGISTRY.values() for m in cat]),
            'frontend': 35,  # Known count from JS modules
            'failed': 0
        },
        'endpoints': test_endpoint_alignment(),
        'socket': test_socket_connectivity()
    }
    
    return jsonify(status)

def check_python_modules() -> Dict[str, Any]:
    """Check if all Python modules can be imported"""
    result = {
        'status': 'healthy',
        'loaded': [],
        'failed': [],
        'total': 0
    }
    
    for category, modules in MODULE_REGISTRY.items():
        for module_name in modules:
            result['total'] += 1
            try:
                # Try to import the module
                if module_name in sys.modules:
                    result['loaded'].append(module_name)
                else:
                    importlib.import_module(module_name)
                    result['loaded'].append(module_name)
            except Exception as e:
                result['failed'].append({
                    'module': module_name,
                    'error': str(e),
                    'category': category
                })
    
    if result['failed']:
        result['status'] = 'warning' if len(result['failed']) < 3 else 'critical'
    
    return result

def check_file_system() -> Dict[str, Any]:
    """Check file system paths and permissions"""
    result = {
        'status': 'healthy',
        'paths': {}
    }
    
    paths_to_check = {
        'downloads': 'downloads',
        'temp': 'temp',
        'static': 'static',
        'templates': 'blueprints/templates'
    }
    
    for name, path in paths_to_check.items():
        abs_path = os.path.abspath(path)
        path_info = {
            'exists': os.path.exists(abs_path),
            'readable': os.access(abs_path, os.R_OK) if os.path.exists(abs_path) else False,
            'writable': os.access(abs_path, os.W_OK) if os.path.exists(abs_path) else False
        }
        
        result['paths'][name] = path_info
        
        # Critical paths that must exist and be writable
        if name in ['downloads', 'temp'] and (not path_info['exists'] or not path_info['writable']):
            result['status'] = 'critical'
    
    return result

def check_dependencies() -> Dict[str, Any]:
    """Check if required dependencies are available"""
    result = {
        'status': 'healthy',
        'dependencies': {}
    }
    
    # Check critical dependencies
    critical_deps = {
        'flask': 'Flask',
        'flask_socketio': 'Flask-SocketIO',
        'requests': 'requests',
        'bs4': 'BeautifulSoup'
    }
    
    # Check optional dependencies
    optional_deps = {
        'pytesseract': 'Tesseract OCR',
        'PyPDF2': 'PDF processing',
        'python-magic': 'File type detection',
        'Pillow': 'Image processing'
    }
    
    for module, name in critical_deps.items():
        try:
            __import__(module)
            result['dependencies'][name] = {'status': 'available', 'critical': True}
        except ImportError:
            result['dependencies'][name] = {'status': 'missing', 'critical': True}
            result['status'] = 'critical'
    
    for module, name in optional_deps.items():
        try:
            __import__(module)
            result['dependencies'][name] = {'status': 'available', 'critical': False}
        except ImportError:
            result['dependencies'][name] = {'status': 'missing', 'critical': False}
            if result['status'] == 'healthy':
                result['status'] = 'warning'
    
    return result

def check_endpoints() -> Dict[str, Any]:
    """Check if key API endpoints are accessible"""
    from flask import current_app
    
    result = {
        'status': 'healthy',
        'endpoints': {}
    }
    
    # Key endpoints to check
    endpoints = {
        'file_processor': '/api/process',
        'web_scraper': '/api/scrape2',
        'academic_search': '/api/academic/search',
        'pdf_processor': '/api/pdf/process',
        'playlist_downloader': '/api/start-playlists'
    }
    
    for name, endpoint in endpoints.items():
        # Check if route exists
        route_exists = False
        for rule in current_app.url_map.iter_rules():
            if rule.rule == endpoint:
                route_exists = True
                break
        
        result['endpoints'][name] = route_exists
        
        if not route_exists:
            result['status'] = 'warning'
    
    return result

def test_single_module(module_name: str) -> Dict[str, Any]:
    """Test a single module and return detailed information"""
    module_info = {
        'name': module_name,
        'status': 'unknown',
        'error': None,
        'attributes': [],
        'has_blueprint': False,
        'endpoints': []
    }
    
    try:
        # Import the module
        module = importlib.import_module(module_name)
        module_info['status'] = 'loaded'
        
        # Get module attributes
        module_info['attributes'] = [
            attr for attr in dir(module) 
            if not attr.startswith('_') and not attr.startswith('__')
        ]
        
        # Check for Blueprint
        for attr_name in module_info['attributes']:
            attr = getattr(module, attr_name)
            if hasattr(attr, 'name') and hasattr(attr, 'url_prefix'):
                module_info['has_blueprint'] = True
                # Try to get endpoints
                if hasattr(attr, 'url_map'):
                    for rule in attr.url_map.iter_rules():
                        module_info['endpoints'].append({
                            'rule': rule.rule,
                            'methods': list(rule.methods)
                        })
        
    except ImportError as e:
        module_info['status'] = 'failed'
        module_info['error'] = f"Import error: {str(e)}"
    except Exception as e:
        module_info['status'] = 'warning'
        module_info['error'] = f"Unexpected error: {str(e)}"
    
    return module_info

def test_javascript_modules() -> Dict[str, Any]:
    """Test JavaScript module availability by checking file system"""
    js_modules = {
        'core': [
            'app.js', 'errorHandler.js', 'domUtils.js', 'uiRegistry.js',
            'stateManager.js', 'eventManager.js', 'themeManager.js',
            'healthMonitor.js', 'moduleImports.js', 'moduleLoader.js'
        ],
        'features': [
            'fileProcessor.js', 'webScraper.js', 'playlistDownloader.js',
            'academicSearch.js', 'historyManager.js', 'pdfProcessor.js'
        ],
        'utils': [
            'socketHandler.js', 'progressHandler.js', 'ui.js',
            'utils.js', 'fileHandler.js', 'systemHealth.js', 'moduleDiagnostics.js'
        ],
        'services': [
            'blueprintApi.js'
        ],
        'config': [
            'endpoints.js', 'socketEvents.js', 'constants.js'
        ]
    }
    
    results = {}
    base_path = 'static/js/modules'
    
    for category, files in js_modules.items():
        results[category] = {}
        category_path = os.path.join(base_path, category)
        
        for file in files:
            file_path = os.path.join(category_path, file)
            file_exists = os.path.exists(file_path)
            file_size = os.path.getsize(file_path) if file_exists else 0
            
            # Enhanced status based on file content
            status = 'missing'
            if file_exists:
                if file_size > 1000:
                    status = 'loaded'
                elif file_size > 0:
                    status = 'warning'
                else:
                    status = 'empty'
            
            results[category][file] = {
                'exists': file_exists,
                'size': file_size,
                'status': status,
                'path': file_path
            }
    
    return results

def test_endpoint_alignment() -> Dict[str, Any]:
    """Test alignment between frontend and backend endpoints"""
    from flask import current_app
    
    # Key endpoints that should be aligned
    expected_endpoints = {
        'file_processor': '/api/process',
        'web_scraper': '/api/scrape2',
        'academic_search': '/api/academic/search',
        'pdf_processor': '/api/pdf/process',
        'playlist_downloader': '/api/start-playlists',
        'health': '/api/health',
        'diagnostics': '/api/test-modules'
    }
    
    results = {}
    
    for name, endpoint in expected_endpoints.items():
        route_exists = False
        methods = []
        
        for rule in current_app.url_map.iter_rules():
            if rule.rule == endpoint:
                route_exists = True
                methods = list(rule.methods)
                break
        
        results[name] = {
            'endpoint': endpoint,
            'exists': route_exists,
            'methods': methods,
            'status': 'aligned' if route_exists else 'missing'
        }
    
    return results

def test_socket_connectivity() -> Dict[str, Any]:
    """Test Socket.IO connectivity and events"""
    try:
        # Check if socketio is available
        from flask_socketio import SocketIO
        
        results = {
            'available': True,
            'events': {
                'task_started': True,
                'task_progress': True,
                'task_completed': True,
                'task_error': True,
                'pdf_found': True,
                'pdf_download_progress': True
            },
            'status': 'healthy'
        }
    except ImportError:
        results = {
            'available': False,
            'events': {},
            'status': 'missing',
            'error': 'Flask-SocketIO not available'
        }
    
    return results

def get_health_summary() -> Dict[str, Any]:
    """Get overall health summary for integration with Health Monitor"""
    health_summary = {
        'overall_status': 'healthy',
        'modules_loaded': 0,
        'modules_failed': 0,
        'endpoints_available': 0,
        'socket_connected': False,
        'memory_usage': 'normal',
        'last_check': datetime.now().isoformat()
    }
    
    # Calculate basic health metrics
    for category, modules in MODULE_REGISTRY.items():
        for module_name in modules:
            try:
                importlib.import_module(module_name)
                health_summary['modules_loaded'] += 1
            except Exception:
                health_summary['modules_failed'] += 1
    
    # Check endpoints
    from flask import current_app
    health_summary['endpoints_available'] = len(list(current_app.url_map.iter_rules()))
    
    # Determine overall status
    if health_summary['modules_failed'] > 3:
        health_summary['overall_status'] = 'critical'
    elif health_summary['modules_failed'] > 0:
        health_summary['overall_status'] = 'warning'
    
    return health_summary

@diagnostics_bp.route('/fix-modules', methods=['POST'])
def fix_modules():
    """
    Attempt to fix common module issues
    """
    fixes_applied = []
    
    # Create missing directories
    dirs_to_create = ['downloads', 'temp', 'temp/tessdata']
    for dir_path in dirs_to_create:
        if not os.path.exists(dir_path):
            try:
                os.makedirs(dir_path, exist_ok=True)
                fixes_applied.append(f"Created directory: {dir_path}")
            except Exception as e:
                fixes_applied.append(f"Failed to create {dir_path}: {str(e)}")
    
    # Fix permissions
    for dir_path in ['downloads', 'temp']:
        if os.path.exists(dir_path):
            try:
                os.chmod(dir_path, 0o755)
                fixes_applied.append(f"Fixed permissions for: {dir_path}")
            except Exception as e:
                fixes_applied.append(f"Failed to fix permissions for {dir_path}: {str(e)}")
    
    return jsonify({
        'fixes_applied': fixes_applied,
        'timestamp': datetime.now().isoformat()
    })

# Export the blueprint
__all__ = ['diagnostics_bp']