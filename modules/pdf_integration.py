"""
Enhanced PDF Processing Integration for app.main.py
--------------------------------------------------

This module integrates the enhanced PDF processing capabilities from pdf_integration.py and 
pdf_processing_endpoints.py into the main application (app.main.py).

Steps:
1. Import the necessary modules (pdf_integration, pdf_processing_endpoints)
2. Patch app.main.py's PDF processing functions with enhanced versions
3. Register the enhanced PDF processing endpoints with the Flask application
4. Add Socket.IO event handlers for real-time progress updates
"""

import os
import sys
import logging
import importlib
from typing import Dict, Any, Optional, Union
import time
import threading
import json

# Configure logging
logger = logging.getLogger(__name__)

def load_pdf_processor():
    """
    Load and initialize the PDF processor module.
    
    Returns:
        Tuple of (success_bool, capabilities_dict)
    """
    try:
        import pdf_processing
        
        # Initialize if the module has an initialize method
        if hasattr(pdf_processing, 'initialize'):
            init_result = pdf_processing.initialize()
            success = init_result.get('status', 'error') == 'success'
            capabilities = init_result.get('capabilities', {})
        else:
            # Basic capabilities check
            capabilities = {
                'pdf_processing_available': True,
                'ocr_available': hasattr(pdf_processing, 'extract_text_with_ocr'),
                'table_extraction': hasattr(pdf_processing, 'extract_tables'),
                'metadata_extraction': hasattr(pdf_processing, 'extract_metadata')
            }
            success = True
        
        return success, capabilities
    except ImportError:
        logger.warning("PDF processing module not available")
        return False, {"pdf_processing_available": False}
    except Exception as e:
        logger.error(f"Error loading PDF processor: {e}")
        return False, {"pdf_processing_available": False, "error": str(e)}

def load_pdf_endpoints():
    """
    Load the PDF processing endpoints module.
    
    Returns:
        PDF processing endpoints module or None if not available
    """
    try:
        import pdf_processing_endpoints
        return pdf_processing_endpoints
    except ImportError:
        logger.warning("PDF processing endpoints module not available")
        return None
    except Exception as e:
        logger.error(f"Error loading PDF processing endpoints: {e}")
        return None

def integrate_enhanced_pdf_processing(app=None, socketio=None):
    """
    Integrate enhanced PDF processing capabilities into app.main.py.
    
    Args:
        app: Flask application instance (optional)
        socketio: Socket.IO instance (optional)
        
    Returns:
        Dictionary with integration status
    """
    integration_results = {
        "pdf_integration_loaded": False,
        "pdf_endpoints_loaded": False,
        "patch_applied": False,
        "endpoints_registered": False,
        "module_capabilities": {}
    }
    
    logger.info("Starting enhanced PDF processing integration")
    
    # Step 1: Import pdf_integration module
    try:
        import pdf_integration
        integration_results["pdf_integration_loaded"] = True
        
        # Check PDF processing capabilities
        success, capabilities = pdf_integration.load_pdf_processor()
        integration_results["module_capabilities"] = capabilities
        
        if not success:
            logger.warning("PDF processing modules not fully available")
    except ImportError as e:
        logger.error(f"Could not import pdf_integration: {e}")
        return integration_results
    
    # Step 2: Import pdf_processing_endpoints module
    try:
        pdf_endpoints = pdf_integration.load_pdf_endpoints()
        if pdf_endpoints is None:
            logger.error("Failed to load PDF processing endpoints module")
        else:
            integration_results["pdf_endpoints_loaded"] = True
    except Exception as e:
        logger.error(f"Error loading PDF processing endpoints: {e}")
        return integration_results
    
    # Step 3: Patch existing functions in app.main.py if app is provided
    if app is not None:
        try:
            # Patch process_file function
            patch_process_file(app, pdf_endpoints)
            
            # Patch ScraperTask if available
            patch_scraper_task(app, pdf_endpoints)
            
            # Flag patch as applied
            integration_results["patch_applied"] = True
            logger.info("Successfully patched app.main.py functions")
        except Exception as e:
            logger.error(f"Error patching app.main.py functions: {e}")
    
    # Step 4: Register PDF processing endpoints with Flask app
    if app is not None and pdf_endpoints is not None:
        try:
            # Register the endpoints
            pdf_endpoints.register_pdf_endpoints(app, socketio)
            
            # Flag endpoints as registered
            integration_results["endpoints_registered"] = True
            logger.info("Successfully registered PDF processing endpoints")
        except Exception as e:
            logger.error(f"Error registering PDF processing endpoints: {e}")
    
    # Step 5: Register Socket.IO event handlers if socketio is provided
    if socketio is not None:
        try:
            register_socketio_handlers(socketio, pdf_endpoints)
            logger.info("Successfully registered Socket.IO event handlers")
        except Exception as e:
            logger.error(f"Error registering Socket.IO event handlers: {e}")
    
    # Final integration status
    integration_status = (
        integration_results["pdf_integration_loaded"] and 
        integration_results["pdf_endpoints_loaded"]
    )
    
    if integration_status:
        logger.info("Enhanced PDF processing successfully integrated")
    else:
        logger.warning("Enhanced PDF processing integration incomplete")
    
    return integration_results

def patch_process_file(app, pdf_endpoints):
    """
    Patch the process_file function in app.main.py with the enhanced version.
    
    Args:
        app: Flask application instance
        pdf_endpoints: PDF processing endpoints module
    """
    # Get the original process_file function
    original_process_file = getattr(app, 'process_file', None)
    if original_process_file is None:
        # Try to get it from module's globals
        module_globals = globals()
        original_process_file = module_globals.get('process_file')
    
    if original_process_file is None:
        # Try to get it from app.main module
        try:
            from app.main import process_file as original_process_file
        except ImportError:
            pass
    
    if original_process_file is None:
        logger.warning("Could not find original process_file function")
        return
    
    # Create enhanced process_file function that wraps the original one
    def enhanced_process_file(file_path, output_path=None, max_chunk_size=4096, extract_tables=True, use_ocr=True):
        """
        Enhanced PDF processing function that uses pdf_endpoints.process_pdf_file.
        """
        logger.info(f"Enhanced process_file called for {file_path}")
        
        # For PDF files, use the enhanced PDF processing
        if file_path.lower().endswith('.pdf'):
            try:
                # Create a task for tracking
                task_id = str(pdf_endpoints.uuid.uuid4())
                task = pdf_endpoints.PDFProcessingTask(task_id, file_path, output_path)
                
                # Process the PDF file
                result = pdf_endpoints.process_pdf_file(
                    file_path=file_path,
                    output_path=output_path,
                    max_chunk_size=max_chunk_size,
                    extract_tables=extract_tables,
                    use_ocr=use_ocr,
                    task=task,
                    return_data=True
                )
                
                return result
            except Exception as e:
                logger.error(f"Enhanced PDF processing failed: {e}")
                # Fall back to original process_file
                return original_process_file(file_path, output_path, max_chunk_size, extract_tables, use_ocr)
        else:
            # For non-PDF files, use the original process_file
            return original_process_file(file_path, output_path, max_chunk_size, extract_tables, use_ocr)
    
    # Replace the original process_file with the enhanced version
    setattr(app, 'process_file', enhanced_process_file)
    
    # Also update the global process_file if it exists
    module_globals = globals()
    if 'process_file' in module_globals:
        module_globals['process_file'] = enhanced_process_file
    
    logger.info("Successfully patched process_file function")

def patch_scraper_task(app, pdf_endpoints):
    """
    Patch the ScraperTask class in app.main.py to use enhanced PDF processing.
    
    Args:
        app: Flask application instance
        pdf_endpoints: PDF processing endpoints module
    """
    # Try to get the ScraperTask class
    ScraperTask = getattr(app, 'ScraperTask', None)
    if ScraperTask is None:
        # Try to get it from module's globals
        module_globals = globals()
        ScraperTask = module_globals.get('ScraperTask')
    
    if ScraperTask is None:
        # Try to get it from app.main module
        try:
            from app.main import ScraperTask
        except ImportError:
            pass
    
    if ScraperTask is None:
        logger.warning("Could not find ScraperTask class")
        return
    
    # Store original methods
    original_process_url = getattr(ScraperTask, '_process_url_with_tracking', None)
    original_finalize = getattr(ScraperTask, '_finalize_results', None)
    
    if original_process_url is not None:
        # Create enhanced _process_url_with_tracking method
        def enhanced_process_url(self, url, setting, keyword, output_folder):
            # For PDF download and processing
            if setting.lower() == "pdf":
                try:
                    # Use original method to download the PDF
                    download_result = original_process_url(self, url, setting, keyword, output_folder)
                    
                    # If PDF download succeeded, process it with enhanced methods
                    if (download_result and 
                        "status" in download_result and 
                        download_result["status"] != "error" and 
                        "pdf_file" in download_result and 
                        os.path.exists(download_result["pdf_file"])):
                        
                        pdf_file = download_result["pdf_file"]
                        logger.info(f"Downloaded PDF {pdf_file}, applying enhanced processing")
                        
                        # Create output path
                        base_name = os.path.splitext(os.path.basename(pdf_file))[0]
                        json_path = os.path.join(output_folder, f"{base_name}_processed.json")
                        
                        # Get PDF options from the scraper task
                        pdf_options = getattr(self, 'pdf_options', {}) or {}
                        
                        # Create a task for tracking
                        task_id = str(pdf_endpoints.uuid.uuid4())
                        task = pdf_endpoints.PDFProcessingTask(task_id, pdf_file, json_path)
                        
                        # Process the PDF with enhanced methods
                        process_result = pdf_endpoints.process_pdf_file(
                            file_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=pdf_options.get('chunk_size', 4096),
                            extract_tables=pdf_options.get('extract_tables', True),
                            use_ocr=pdf_options.get('use_ocr', True),
                            task=task,
                            return_data=True
                        )
                        
                        # Enhance the original result with the processing results
                        if process_result and process_result.get("status") != "error":
                            download_result["json_file"] = json_path
                            download_result["document_type"] = process_result.get("document_type", "unknown")
                            download_result["tables_extracted"] = len(process_result.get("tables", []))
                            download_result["references_extracted"] = len(process_result.get("references", []))
                            download_result["chunks_count"] = len(process_result.get("chunks", []))
                            download_result["processing_complete"] = True
                            
                            # Update PDF downloads list for progress tracking
                            with getattr(self, 'pdf_downloads_lock', threading.Lock()):
                                for i, pdf in enumerate(getattr(self, 'pdf_downloads', [])):
                                    if pdf.get('filePath') == pdf_file:
                                        self.pdf_downloads[i].update({
                                            'jsonFile': json_path,
                                            'documentType': process_result.get('document_type', 'unknown'),
                                            'tablesExtracted': len(process_result.get('tables', [])),
                                            'referencesExtracted': len(process_result.get('references', [])),
                                            'status': 'success',
                                            'message': 'Download and processing complete'
                                        })
                                        break
                        
                        return download_result
                    else:
                        # If download failed or isn't a PDF, return the original result
                        return download_result
                except Exception as e:
                    logger.error(f"Error in enhanced PDF processing: {e}")
                    # Fall back to original method
                    return original_process_url(self, url, setting, keyword, output_folder)
            else:
                # For non-PDF settings, use the original method
                return original_process_url(self, url, setting, keyword, output_folder)
        
        # Replace the original method
        setattr(ScraperTask, '_process_url_with_tracking', enhanced_process_url)
        logger.info("Successfully patched ScraperTask._process_url_with_tracking method")
    
    if original_finalize is not None:
        # Create enhanced _finalize_results method
        def enhanced_finalize(self, all_results):
            # Additional PDF processing if needed
            for result_item in all_results:
                if result_item and isinstance(result_item, dict):
                    result = result_item.get('result', {})
                    if isinstance(result, dict) and result.get('pdf_file') and not result.get('processing_complete'):
                        pdf_file = result.get('pdf_file')
                        if os.path.exists(pdf_file):
                            try:
                                # Create output path
                                output_folder = os.path.dirname(pdf_file)
                                base_name = os.path.splitext(os.path.basename(pdf_file))[0]
                                json_path = os.path.join(output_folder, f"{base_name}_processed.json")
                                
                                # Get PDF options from the scraper task
                                pdf_options = getattr(self, 'pdf_options', {}) or {}
                                
                                # Process the PDF only if processing is enabled
                                if pdf_options.get('process_pdfs', True):
                                    # Create a task for tracking
                                    task_id = str(pdf_endpoints.uuid.uuid4())
                                    task = pdf_endpoints.PDFProcessingTask(task_id, pdf_file, json_path)
                                    
                                    # Process the PDF with enhanced methods
                                    process_result = pdf_endpoints.process_pdf_file(
                                        file_path=pdf_file,
                                        output_path=json_path,
                                        max_chunk_size=pdf_options.get('chunk_size', 4096),
                                        extract_tables=pdf_options.get('extract_tables', True),
                                        use_ocr=pdf_options.get('use_ocr', True),
                                        task=task,
                                        return_data=True
                                    )
                                    
                                    # Update the result with the processing results
                                    if process_result and process_result.get("status") != "error":
                                        result["json_file"] = json_path
                                        result["document_type"] = process_result.get("document_type", "unknown")
                                        result["tables_extracted"] = len(process_result.get("tables", []))
                                        result["references_extracted"] = len(process_result.get("references", []))
                                        result["chunks_count"] = len(process_result.get("chunks", []))
                                        result["processing_complete"] = True
                                        
                                        # Update PDF downloads list for progress tracking
                                        with getattr(self, 'pdf_downloads_lock', threading.Lock()):
                                            for i, pdf in enumerate(getattr(self, 'pdf_downloads', [])):
                                                if pdf.get('filePath') == pdf_file:
                                                    self.pdf_downloads[i].update({
                                                        'jsonFile': json_path,
                                                        'documentType': process_result.get('document_type', 'unknown'),
                                                        'tablesExtracted': len(process_result.get('tables', [])),
                                                        'referencesExtracted': len(process_result.get('references', [])),
                                                        'status': 'success',
                                                        'message': 'Download and processing complete'
                                                    })
                                                    break
                            except Exception as e:
                                logger.error(f"Error in PDF post-processing: {e}")
            
            # Call the original finalize method to complete the process
            return original_finalize(self, all_results)
        
        # Replace the original method
        setattr(ScraperTask, '_finalize_results', enhanced_finalize)
        logger.info("Successfully patched ScraperTask._finalize_results method")

def register_socketio_handlers(socketio, pdf_endpoints):
    """
    Register Socket.IO event handlers for PDF processing.
    
    Args:
        socketio: Socket.IO instance
        pdf_endpoints: PDF processing endpoints module
    """
    @socketio.on('request_pdf_capabilities')
    def handle_pdf_capabilities_request():
        """Handle request for PDF processing capabilities"""
        try:
            # Get capabilities
            capabilities = pdf_endpoints.get_pdf_capabilities()
            socketio.emit('pdf_capabilities', capabilities)
        except Exception as e:
            logger.error(f"Error handling PDF capabilities request: {e}")
            socketio.emit('pdf_error', {'error': str(e)})
    
    @socketio.on('pdf_processing_request')
    def handle_pdf_processing_request(data):
        """Handle PDF processing request via Socket.IO"""
        try:
            # Validate input
            if not data or 'file_path' not in data:
                socketio.emit('pdf_error', {'error': 'Missing file_path parameter'})
                return
            
            file_path = data['file_path']
            output_path = data.get('output_path')
            extract_tables = data.get('extract_tables', True)
            use_ocr = data.get('use_ocr', True)
            max_chunk_size = data.get('max_chunk_size', 4096)
            
            # Generate task ID
            task_id = str(pdf_endpoints.uuid.uuid4())
            
            # Start processing in a background thread
            def process_thread():
                pdf_endpoints.process_pdf_file(
                    file_path=file_path,
                    output_path=output_path,
                    max_chunk_size=max_chunk_size,
                    extract_tables=extract_tables,
                    use_ocr=use_ocr,
                    task_id=task_id
                )
            
            thread = threading.Thread(target=process_thread)
            thread.daemon = True
            thread.start()
            
            # Send initial response
            socketio.emit('pdf_processing_started', {
                'task_id': task_id,
                'file_path': file_path,
                'message': 'PDF processing started'
            })
        except Exception as e:
            logger.error(f"Error handling PDF processing request: {e}")
            socketio.emit('pdf_error', {'error': str(e)})
    
    @socketio.on('pdf_status_request')
    def handle_pdf_status_request(data):
        """Handle PDF processing status request via Socket.IO"""
        try:
            # Validate input
            if not data or 'task_id' not in data:
                socketio.emit('pdf_error', {'error': 'Missing task_id parameter'})
                return
            
            task_id = data['task_id']
            
            # Get task status
            task_status = pdf_endpoints.get_task_status(task_id)
            
            if task_status:
                socketio.emit('pdf_status_update', task_status)
            else:
                socketio.emit('pdf_error', {'error': 'Task not found'})
        except Exception as e:
            logger.error(f"Error handling PDF status request: {e}")
            socketio.emit('pdf_error', {'error': str(e)})
    
    @socketio.on('pdf_cancel_request')
    def handle_pdf_cancel_request(data):
        """Handle PDF processing cancellation request via Socket.IO"""
        try:
            # Validate input
            if not data or 'task_id' not in data:
                socketio.emit('pdf_error', {'error': 'Missing task_id parameter'})
                return
            
            task_id = data['task_id']
            
            # Cancel task
            cancelled = pdf_endpoints.cancel_task(task_id)
            
            if cancelled:
                socketio.emit('pdf_cancelled', {'task_id': task_id})
            else:
                socketio.emit('pdf_error', {'error': 'Task not found or already completed'})
        except Exception as e:
            logger.error(f"Error handling PDF cancel request: {e}")
            socketio.emit('pdf_error', {'error': str(e)})
    
    logger.info("Socket.IO event handlers registered for PDF processing")

# Main integration function that should be called from app.main.py
def integrate_with_app(app, socketio=None):
    """
    Main integration function that should be called from app.main.py
    to integrate enhanced PDF processing capabilities.
    
    Args:
        app: Flask application instance
        socketio: Socket.IO instance (optional)
        
    Returns:
        Dictionary with integration status
    """
    return integrate_enhanced_pdf_processing(app, socketio)

def check_pdf_processing():
    """
    Check if PDF processing capabilities are available.
    
    Returns:
        Tuple of (success_bool, capabilities_dict)
    """
    try:
        success, capabilities = load_pdf_processor()
        return success, capabilities
    except Exception as e:
        logger.error(f"Error checking PDF processing capabilities: {e}")
        return False, {"pdf_processing_available": False, "error": str(e)}
