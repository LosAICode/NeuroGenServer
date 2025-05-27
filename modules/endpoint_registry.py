"""
NeuroGen Server Endpoint Registry
Complete list of all API endpoints for diagnostic checking
"""

ENDPOINT_REGISTRY = {
    # Core Routes
    "core": {
        "home": ("/", ["GET"]),
        "test_modules": ("/test-modules", ["GET"]),
        "diagnostics": ("/diagnostics", ["GET"]),
        "module_diagnostics_complete": ("/module-diagnostics-complete", ["GET"]),
        "endpoint_dashboard": ("/endpoint-dashboard", ["GET"]),
        "key_manager": ("/key-manager", ["GET"]),
        "shutdown": ("/shutdown", ["POST"])
    },
    
    # File Processing Endpoints
    "fileProcessor": {
        "process": ("/api/process", ["POST"]),
        "status": ("/api/status/<task_id>", ["GET"]),
        "download": ("/api/download/<task_id>", ["GET"]),
        "download_direct": ("/download/<path:filename>", ["GET"]),
        "open": ("/api/open/<task_id>", ["GET"]),
        "open_file": ("/api/open-file", ["POST"]),
        "open_folder": ("/api/open-folder", ["POST"]),
        "upload_path_detection": ("/api/upload-for-path-detection", ["POST"]),
        "detect_path": ("/api/detect-path", ["POST"])
    },
    
    # File System Utilities
    "fileSystem": {
        "verify_path": ("/api/verify-path", ["POST"]),
        "create_directory": ("/api/create-directory", ["POST"]),
        "get_output_filepath": ("/api/get-output-filepath", ["POST"]),
        "check_file_exists": ("/api/check-file-exists", ["POST"]),
        "get_default_output_folder": ("/api/get-default-output-folder", ["GET"])
    },
    
    # Playlist Downloader Endpoints
    "playlistDownloader": {
        "start": ("/api/start-playlists", ["POST"]),
        "cancel": ("/api/cancel/<task_id>", ["POST"])  # Uses generic cancel
    },
    
    # Web Scraper Endpoints
    "webScraper": {
        "scrape": ("/api/scrape2", ["POST"]),
        "status": ("/api/scrape2/status/<task_id>", ["GET"]),
        "cancel": ("/api/scrape2/cancel/<task_id>", ["POST"])
    },
    
    # PDF Processing Endpoints
    "pdfProcessor": {
        "process": ("/api/pdf/process", ["POST"]),
        "extract_tables": ("/api/pdf/extract-tables", ["POST"]),
        "detect_type": ("/api/pdf/detect-type", ["POST"]),
        "analyze": ("/api/pdf/analyze", ["POST"]),
        "batch_process": ("/api/pdf/batch-process", ["POST"]),
        "status": ("/api/pdf/status/<task_id>", ["GET"]),
        "cancel": ("/api/pdf/cancel/<task_id>", ["POST"]),
        "capabilities": ("/api/pdf-capabilities", ["GET"]),
        "download_pdf": ("/api/download-pdf", ["POST"]),
        "download_pdf_path": ("/download-pdf/<path:pdf_path>", ["GET"]),
        "download_file_path": ("/download-file/<path:file_path>", ["GET"])
    },
    
    # Academic Search Endpoints
    "academicSearch": {
        "health": ("/api/academic/health", ["GET"]),
        "search": ("/api/academic/search", ["GET"]),
        "multi_source": ("/api/academic/multi-source", ["GET"]),
        "details": ("/api/academic/details/<path:id>", ["GET"]),
        "download": ("/api/academic/download/<path:id>", ["GET"]),
        "citations": ("/api/academic/citations/<path:id>", ["GET"]),
        "recommendations": ("/api/academic/recommendations/<path:id>", ["GET"]),
        "bulk_download": ("/api/academic/bulk/download", ["POST"]),
        "analyze": ("/api/academic/analyze/<path:id>", ["GET"]),
        "extract": ("/api/academic/extract", ["GET"])
    },
    
    # Task Management Endpoints
    "taskManagement": {
        "stats": ("/api/task/<task_id>/stats", ["GET"]),
        "export_stats": ("/api/task/<task_id>/stats/export", ["GET"]),
        "history": ("/api/tasks/history", ["GET"]),
        "analytics": ("/api/tasks/analytics", ["GET"]),
        "cancel": ("/api/cancel/<task_id>", ["POST"]),
        "emergency_stop": ("/api/emergency-stop", ["POST"])
    },
    
    # API Key Management
    "apiKeys": {
        "list": ("/api/keys", ["GET"]),
        "create": ("/api/keys/create", ["POST"]),
        "revoke": ("/api/keys/revoke", ["POST"])
    }
}

def get_all_endpoints():
    """Get a flat list of all endpoints"""
    endpoints = []
    for category, routes in ENDPOINT_REGISTRY.items():
        for name, (path, methods) in routes.items():
            endpoints.append({
                "category": category,
                "name": name,
                "path": path,
                "methods": methods
            })
    return endpoints

def get_endpoint_count():
    """Get total count of endpoints"""
    return sum(len(routes) for routes in ENDPOINT_REGISTRY.values())

def get_endpoints_by_category(category):
    """Get endpoints for a specific category"""
    return ENDPOINT_REGISTRY.get(category, {})

def validate_endpoints_exist(app):
    """Validate that all registered endpoints exist in the Flask app"""
    missing = []
    for category, routes in ENDPOINT_REGISTRY.items():
        for name, (path, methods) in routes.items():
            # Check if route exists in Flask app
            rule_found = False
            for rule in app.url_map.iter_rules():
                # Handle parameterized routes
                if path.replace('<task_id>', '').replace('<path:filename>', '').replace('<path:pdf_path>', '').replace('<path:file_path>', '').replace('<path:id>', '') in rule.rule:
                    rule_found = True
                    break
            
            if not rule_found:
                missing.append({
                    "category": category,
                    "name": name,
                    "path": path,
                    "methods": methods
                })
    
    return missing