"""
Web Scraper Blueprint
Handles all web scraping related routes and functionality
"""

from flask import Blueprint, request, jsonify
from flask_socketio import emit
import logging
import uuid
import time

logger = logging.getLogger(__name__)

# Create the blueprint
web_scraper_bp = Blueprint('web_scraper', __name__, url_prefix='/api')

@web_scraper_bp.route('/scrape2', methods=['POST'])
def scrape2():
    """
    Enhanced endpoint for web scraping with PDF download support
    that fully integrates with the advanced frontend options.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url_configs = data.get("urls")
    download_directory = data.get("download_directory")
    output_filename = data.get("outputFilename", "").strip()
    
    # Get enhanced PDF options
    pdf_options = data.get("pdf_options", {})
    process_pdfs = pdf_options.get("process_pdfs", True)
    extract_tables = pdf_options.get("extract_tables", True)
    use_ocr = pdf_options.get("use_ocr", True)
    extract_structure = pdf_options.get("extract_structure", True)
    chunk_size = pdf_options.get("chunk_size", 4096)
    max_downloads = pdf_options.get("max_downloads", 10)  # Default to 10 PDFs
    
    if not url_configs or not isinstance(url_configs, list):
        return structured_error_response("URLS_REQUIRED", "A list of URLs is required.", 400)
    
    if not download_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Download directory is required.", 400)
    
    if not output_filename:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output filename is required.", 400)
    
    # Ensure output file has proper extension
    if not output_filename.lower().endswith('.json'):
        output_filename += '.json'
    
    # Convert to absolute path
    download_directory = os.path.abspath(download_directory)
    
    # Get properly formatted output path
    final_json = get_output_filepath(output_filename, folder_override=download_directory)
    
    # Validate and create download directory if it doesn't exist
    if not os.path.isdir(download_directory):
        try:
            os.makedirs(download_directory, exist_ok=True)
            logger.info(f"Created download directory: {download_directory}")
        except Exception as e:
            return structured_error_response("DIR_CREATION_FAILED", f"Could not create download directory: {e}", 500)
    
    # Log the request
    logger.info(f"Starting web scraping with {len(url_configs)} URLs to {download_directory}")
    logger.info(f"Output JSON will be saved to: {final_json}")
    logger.info(f"PDF options: process={process_pdfs}, tables={extract_tables}, ocr={use_ocr}, structure={extract_structure}, chunk_size={chunk_size}, max_downloads={max_downloads}")
    
    # Create and start the scraper task with enhanced options
    task_id = str(uuid.uuid4())
    scraper_task = ScraperTask(task_id)
    add_task(task_id, scraper_task)
    
    # Pass the enhanced options to the task
    scraper_task.pdf_options = {
        "process_pdfs": process_pdfs,
        "extract_tables": extract_tables,
        "use_ocr": use_ocr,
        "extract_structure": extract_structure,
        "chunk_size": chunk_size,
        "max_downloads": max_downloads
    }
    
    scraper_task.start(
        url_configs=url_configs,
        root_directory=download_directory,
        output_file=final_json
    )
    
    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "message": "Scraping started",
        "root_directory": download_directory,
        "output_file": final_json
    })
    


@web_scraper_bp.route('/scrape2/status/<task_id>', methods=['GET'])
def scrape2_status(task_id):
    """Get the status of a scraping task with PDF download information."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    # Build response with PDF downloads information
    response = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "stats": task.stats,
        "error": task.error,
        "output_file": task.output_file,
        "output_folder": task.output_folder
    }
    
    # Include PDF downloads information if available
    if hasattr(task, 'pdf_downloads') and task.pdf_downloads:
        response["pdf_downloads"] = task.pdf_downloads
    
    return jsonify(response)

@web_scraper_bp.route("/download-pdf", methods=["POST"])
def api_download_pdf():
    """
    Enhanced API endpoint to download a PDF file from a URL to a user-specified folder.
    
    Expected JSON body:
    {
        "url": "https://example.com/paper.pdf",
        "outputFolder": User-selected download directory,
        "outputFilename": User-specified filename (without extension),
        "processFile": true,  # Whether to process the PDF to JSON
        "extractTables": true,  # Whether to extract tables
        "useOcr": true  # Whether to use OCR for scanned content
    }
    
    Returns:
        JSON response with download status, file path, etc.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url = data.get("url")
    output_folder = data.get("outputFolder", DEFAULT_OUTPUT_FOLDER)
    output_filename = data.get("outputFilename")
    process_file = data.get("processFile", True)
    extract_tables = data.get("extractTables", True)
    use_ocr = data.get("useOcr", True)
    
    if not url:
        return structured_error_response("URL_REQUIRED", "PDF URL is required.", 400)
    
    # Ensure output directory exists
    try:
        os.makedirs(output_folder, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creating output directory: {e}")
        return structured_error_response("OUTPUT_DIR_ERROR", f"Failed to create output directory: {str(e)}", 500)
    
    # Create a unique task ID for tracking this download
    download_id = str(uuid.uuid4())
    
    try:
        # Download the PDF using enhanced function
        logger.info(f"Starting PDF download from {url} to {output_folder}")
        
        # Use the enhanced download_pdf function from web_scraper
        pdf_file = download_pdf(url, output_folder)
        
        if pdf_file and os.path.exists(pdf_file):
            # Get file size and other metadata
            file_size = os.path.getsize(pdf_file)
            file_name = os.path.basename(pdf_file)
            
            response_data = {
                "status": "success",
                "message": "PDF downloaded successfully",
                "download_id": download_id,
                "url": url,
                "filePath": pdf_file,
                "fileName": file_name,
                "fileSize": file_size,
                "outputFolder": output_folder
            }
            
            # Process the PDF to JSON if requested
            if process_file and structify_module:
                json_file = None
                try:
                    # Generate a JSON filename based on user preference or PDF name
                    if output_filename:
                        json_filename = f"{output_filename}.json"
                    else:
                        json_filename = os.path.splitext(file_name)[0] + "_processed.json"
                        
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Detect document type to determine if OCR is needed
                    doc_type = None
                    if hasattr(structify_module, 'detect_document_type'):
                        try:
                            doc_type = structify_module.detect_document_type(pdf_file)
                            response_data["documentType"] = doc_type
                        except Exception as e:
                            logger.warning(f"Error detecting document type: {e}")
                    
                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                    apply_ocr = use_ocr or (doc_type == "scan")
                    
                    # Process with process_pdf if available
                    if hasattr(structify_module, 'process_pdf'):
                        result = structify_module.process_pdf(
                            pdf_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=4096,
                            extract_tables=extract_tables,
                            use_ocr=apply_ocr,
                            return_data=True
                        )
                        
                        json_file = json_path
                        
                        # Add summary metrics to response
                        if result:
                            response_data["processingDetails"] = {
                                "tablesExtracted": len(result.get("tables", [])),
                                "referencesExtracted": len(result.get("references", [])),
                                "pageCount": result.get("page_count", 0),
                                "chunksCreated": len(result.get("chunks", []))
                            }
                            
                    else:
                        # Fallback to process_all_files
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            max_chunk_size=4096,
                            executor_type="thread",
                            max_workers=None,
                            stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                            use_cache=False,
                            valid_extensions=[".pdf"],
                            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                            stats_only=False,
                            include_binary_detection=False,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        json_file = json_path
                    
                    # Add JSON file info to response
                    if json_file and os.path.exists(json_file):
                        response_data["jsonFile"] = json_file
                        logger.info(f"PDF processed to JSON: {json_file}")
                        
                        # Generate a quick PDF structure summary
                        summary = analyze_pdf_structure(pdf_file)
                        if summary and "error" not in summary:
                            response_data["pdfStructure"] = summary
                    
                except Exception as e:
                    logger.error(f"Error processing PDF to JSON: {e}")
                    response_data["processingError"] = str(e)
            
            return jsonify(response_data)
        else:
            return structured_error_response("DOWNLOAD_FAILED", "Failed to download PDF file.", 400)
            
    except Exception as e:
       logger.error(f"Error downloading PDF: {e}", exc_info=True)
       return structured_error_response("DOWNLOAD_ERROR", f"Error downloading PDF: {str(e)}", 500)

@web_scraper_bp.route("/download-pdf/<path:pdf_path>")
def download_pdf_file(pdf_path):
    """
    Download or view a specific PDF file with enhanced security checks.
    
    Args:
        pdf_path: The path to the PDF file.
        
    Returns:
        The PDF file for download or viewing.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(pdf_path)
        
        # Define allowed directories (can be expanded based on application needs)
        allowed_dirs = [
            DEFAULT_OUTPUT_FOLDER,
            os.path.join(os.path.expanduser("~"), "Documents"),
            app.config.get("UPLOAD_FOLDER", tempfile.mkdtemp())
        ]
        
        # Check if the path is within any allowed directory
        is_allowed = any(os.path.commonpath([abs_path, allowed_dir]) == allowed_dir 
                        for allowed_dir in allowed_dirs if os.path.exists(allowed_dir))
        
        if not is_allowed:
            logger.warning(f"Attempted to access file outside allowed directories: {abs_path}")
            abort(403)  # Forbidden
        
        # Check if file exists
        if not os.path.exists(abs_path):
            logger.warning(f"PDF file not found: {abs_path}")
            abort(404)
        
        # Verify file is a PDF (optional but adds security)
        if not abs_path.lower().endswith('.pdf') and magic_available:
            mime = magic.from_file(abs_path, mime=True)
            if 'application/pdf' not in mime:
                logger.warning(f"File is not a PDF: {abs_path}, mime: {mime}")
                abort(400)  # Bad request
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for PDF content
        response = send_from_directory(
            directory,
            filename,
            mimetype='application/pdf',
            as_attachment=False  # Display in browser instead of downloading
        )
        
        # Add additional security headers
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        logger.info(f"Successfully served PDF file: {filename}")
        return response
        
    except Exception as e:
        logger.error(f"Error serving PDF file: {e}")
        abort(500)

@web_scraper_bp.route("/download-file/<path:file_path>")
def download_file_attachment(file_path):
    """
    Force download of a specific file.
    
    Args:
        file_path: The path to the file.
        
    Returns:
        The file as an attachment for download.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(file_path)
        
        # Check if file exists
        if not os.path.exists(abs_path):
            abort(404)
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for attachment download
        return send_from_directory(
            directory, 
            filename,
            as_attachment=True,  # Force download instead of displaying
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file for download: {e}")
        abort(500)
@web_scraper_bp.route('/scrape2/cancel/<task_id>', methods=['POST'])
def cancel_scrape2(task_id):
    """Cancel a scraping task."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    task.status = "cancelled"
    remove_task(task_id)
    
    return jsonify({
        "task_id": task_id,
        "status": "cancelled",
        "message": "ScraperTask cancelled successfully."
    })



# Socket.IO events for web scraper
def emit_scraping_progress(task_id, progress, current_url=None, pages_scraped=0, total_pages=0):
    """Emit scraping progress update"""
    try:
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': 'scraping',
            'current_url': current_url,
            'pages_scraped': pages_scraped,
            'total_pages': total_pages,
            'timestamp': time.time()
        }
        
        emit('scraping_progress', payload, broadcast=True)
        logger.debug(f"Emitted scraping progress for task {task_id}: {progress}%")
        
    except Exception as e:
        logger.error(f"Error emitting scraping progress: {str(e)}")


def emit_scraping_completed(task_id, result_data=None, stats=None):
    """Emit scraping completion event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'completed',
            'result_data': result_data,
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        emit('scraping_completed', payload, broadcast=True)
        logger.info(f"Emitted scraping completion for task {task_id}")
        
    except Exception as e:
        logger.error(f"Error emitting scraping completion: {str(e)}")


def emit_scraping_error(task_id, error_message, current_url=None):
    """Emit scraping error event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'error',
            'error': error_message,
            'current_url': current_url,
            'timestamp': time.time()
        }
        
        emit('scraping_error', payload, broadcast=True)
        logger.error(f"Emitted scraping error for task {task_id}: {error_message}")
        
    except Exception as e:
        logger.error(f"Error emitting scraping error: {str(e)}")