import os
import sys
import json
import time
import uuid
import logging
import traceback
from flask import Blueprint, request, jsonify, current_app
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create blueprint
pdf_scraper_bp = Blueprint('pdf_scraper', __name__)

# Import the web_scraper module
try:
    from web_scraper import (
        download_pdf,
        fetch_pdf_links,
        process_url,
        FilePathUtility
    )
    web_scraper_available = True
    logger.info("Web scraper module successfully imported")
except ImportError as e:
    web_scraper_available = False
    logger.error(f"Error importing web_scraper: {e}")
    # Create placeholder functions
    def download_pdf(*args, **kwargs):
        logger.error("web_scraper module not available")
        return None
    
    def fetch_pdf_links(*args, **kwargs):
        logger.error("web_scraper module not available")
        return []
    
    def process_url(*args, **kwargs):
        logger.error("web_scraper module not available")
        return {"error": "Web scraper module not available"}
    
    class FilePathUtility:
        @staticmethod
        def verify_and_create_directory(path):
            try:
                os.makedirs(path, exist_ok=True)
                return True, "Directory created", path
            except Exception as e:
                return False, str(e), ""

# Try to import structify_module
try:
    from structify_import import get_claude_module
    structify_module, components = get_claude_module()
    structify_available = structify_module is not None
    logger.info(f"Structify module available: {structify_available}")
except ImportError as e:
    structify_module = None
    components = {}
    structify_available = False
    logger.warning(f"Could not import structify_module: {e}")

# Get default output folder from environment or use a default path
DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER",
                                      os.path.join(os.path.expanduser("~"), "Documents", "NeuroGen"))

# Create default output folder if it doesn't exist
os.makedirs(DEFAULT_OUTPUT_FOLDER, exist_ok=True)

# Helper function for error responses
def error_response(message, status_code=400):
    response = jsonify({
        "status": "error",
        "error": message
    })
    response.status_code = status_code
    return response

@pdf_scraper_bp.route('/scrape-pdf', methods=['POST'])
def scrape_pdf():
    """
    Endpoint to download a PDF from a URL.
    
    Expected JSON payload:
    {
        "url": "https://example.com/paper.pdf",
        "folder": "/path/to/output/folder",
        "processFile": true  # Optional, whether to process the PDF after downloading
    }
    
    Returns:
        JSON response with download status and file paths
    """
    data = request.get_json()
    if not data:
        return error_response("No JSON data provided")
    
    url = data.get("url")
    if not url:
        return error_response("URL is required")
    
    # Get output folder with fallback to default
    output_folder = data.get("folder", DEFAULT_OUTPUT_FOLDER)
    
    # Ensure output directory exists
    success, message, path = FilePathUtility.verify_and_create_directory(output_folder)
    if not success:
        return error_response(f"Output directory error: {message}", 500)
    
    # Whether to process the PDF after downloading
    process_file = data.get("processFile", True)
    
    try:
        # Generate a unique task ID
        task_id = str(uuid.uuid4())
        
        # Download the PDF
        pdf_file = download_pdf(url, save_path=output_folder, emit_progress=True, task_id=task_id)
        
        if not pdf_file or not os.path.exists(pdf_file):
            return error_response("Failed to download PDF file")
        
        # Prepare response data
        response_data = {
            "status": "success",
            "message": "PDF downloaded successfully",
            "task_id": task_id,
            "url": url,
            "filePath": pdf_file,
            "fileName": os.path.basename(pdf_file),
            "fileSize": os.path.getsize(pdf_file),
            "outputFolder": output_folder
        }
        
        # Process the PDF if requested and structify_module is available
        if process_file and structify_available:
            try:
                # Generate output filename
                pdf_filename = os.path.basename(pdf_file)
                json_filename = f"{os.path.splitext(pdf_filename)[0]}_processed.json"
                json_path = os.path.join(output_folder, json_filename)
                
                # Process the PDF to JSON
                if hasattr(structify_module, 'process_pdf'):
                    # Use direct PDF processing if available
                    result = structify_module.process_pdf(
                        pdf_path=pdf_file,
                        output_path=json_path,
                        max_chunk_size=4096,
                        extract_tables=True,
                        use_ocr=True,
                        return_data=True
                    )
                else:
                    # Fall back to process_all_files
                    result = structify_module.process_all_files(
                        root_directory=os.path.dirname(pdf_file),
                        output_file=json_path,
                        file_filter=lambda f: f == pdf_file
                    )
                
                # Add the JSON file path to the response
                if os.path.exists(json_path):
                    response_data["jsonFile"] = json_path
                    logger.info(f"PDF processed to JSON: {json_path}")
            
            except Exception as e:
                logger.error(f"Error processing PDF to JSON: {e}")
                response_data["processingError"] = str(e)
        
        # Log to history
        try:
            from history_manager import add_to_history
            
            history_entry = {
                "type": "pdf_download",
                "url": url,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "filePath": pdf_file,
                "outputFolder": output_folder
            }
            
            if "jsonFile" in response_data:
                history_entry["jsonFile"] = response_data["jsonFile"]
                
            add_to_history(history_entry)
        except ImportError:
            logger.warning("Could not import history_manager, history not updated")
        except Exception as e:
            logger.error(f"Error adding to history: {e}")
        
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error in scrape_pdf endpoint: {e}")
        logger.error(traceback.format_exc())
        return error_response(f"PDF download error: {str(e)}", 500)


@pdf_scraper_bp.route('/fetch-pdf-links', methods=['POST'])
def get_pdf_links():
    """
    Extract PDF links from a webpage URL.
    
    Expected JSON payload:
    {
        "url": "https://example.com/page-with-pdfs",
        "maxPdfs": 10  # Optional, maximum number of PDFs to return
    }
    
    Returns:
        JSON response with list of PDF links found
    """
    data = request.get_json()
    if not data:
        return error_response("No JSON data provided")
    
    url = data.get("url")
    if not url:
        return error_response("URL is required")
    
    # Get max PDFs limit (default to 10 if not specified)
    max_pdfs = int(data.get("maxPdfs", 10))
    
    try:
        # Fetch PDF links from the webpage
        pdf_links = fetch_pdf_links(url)
        
        # Limit the number of links if needed
        if max_pdfs > 0 and len(pdf_links) > max_pdfs:
            pdf_links = pdf_links[:max_pdfs]
        
        # Format the response
        result = {
            "status": "success",
            "url": url,
            "count": len(pdf_links),
            "links": pdf_links
        }
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error in fetch_pdf_links endpoint: {e}")
        logger.error(traceback.format_exc())
        return error_response(f"Error fetching PDF links: {str(e)}", 500)


@pdf_scraper_bp.route('/process-pdf', methods=['POST'])
def process_pdf():
    """
    Process downloaded PDFs into structured JSON.
    
    Expected JSON payload:
    {
        "filePath": "/path/to/pdf/file.pdf",
        "outputPath": "/path/to/output/file.json",  # Optional
        "extractTables": true,  # Optional
        "useOcr": true  # Optional
    }
    
    Returns:
        JSON response with processing status and output file path
    """
    if not structify_available:
        return error_response("PDF processing module not available", 503)
    
    data = request.get_json()
    if not data:
        return error_response("No JSON data provided")
    
    file_path = data.get("filePath")
    if not file_path:
        return error_response("PDF file path is required")
    
    # Normalize path
    file_path = os.path.abspath(file_path)
    
    # Verify the file exists
    if not os.path.exists(file_path):
        return error_response(f"File not found: {file_path}", 404)
    
    # Get output path if provided, otherwise derive from input path
    output_path = data.get("outputPath")
    if not output_path:
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        output_path = os.path.join(os.path.dirname(file_path), f"{base_name}_processed.json")
    
    # Get processing options
    extract_tables = data.get("extractTables", True)
    use_ocr = data.get("useOcr", True)
    
    try:
        # Process the PDF file
        if hasattr(structify_module, 'process_pdf'):
            # Use direct PDF processing if available
            result = structify_module.process_pdf(
                pdf_path=file_path,
                output_path=output_path,
                max_chunk_size=4096,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                return_data=True
            )
            
            # Count tables and other elements
            tables_count = len(result.get("tables", [])) if result else 0
            chunks_count = len(result.get("chunks", [])) if result else 0
            references_count = len(result.get("references", [])) if result else 0
            
            response_data = {
                "status": "success",
                "message": "PDF processing complete",
                "inputFile": file_path,
                "outputFile": output_path,
                "tablesCount": tables_count,
                "chunksCount": chunks_count,
                "referencesCount": references_count
            }
        else:
            # Fall back to process_all_files
            result = structify_module.process_all_files(
                root_directory=os.path.dirname(file_path),
                output_file=output_path,
                file_filter=lambda f: f == file_path
            )
            
            response_data = {
                "status": "success",
                "message": "PDF processing complete (basic mode)",
                "inputFile": file_path,
                "outputFile": output_path
            }
        
        # Add to history if history_manager is available
        try:
            from history_manager import add_to_history
            
            history_entry = {
                "type": "pdf_processing",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "inputFile": file_path,
                "outputFile": output_path
            }
            
            add_to_history(history_entry)
        except ImportError:
            logger.warning("Could not import history_manager, history not updated")
        except Exception as e:
            logger.error(f"Error adding to history: {e}")
        
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Error in process_pdf endpoint: {e}")
        logger.error(traceback.format_exc())
        return error_response(f"PDF processing error: {str(e)}", 500)


def register_routes(app):
    """Register all routes with the Flask app"""
    app.register_blueprint(pdf_scraper_bp, url_prefix='/api')
    logger.info("PDF scraper routes registered")