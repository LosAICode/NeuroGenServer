"""
Structify Module Integration
Handles initialization and management of the Structify PDF/document processing module
"""

import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Global module state
structify_module = None
structify_available = False
FileStats = None
process_all_files = None


def initialize_structify():
    """
    Initialize the Structify module and its components.
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    global structify_module, structify_available, FileStats, process_all_files
    
    try:
        from structify_import import get_claude_module
        structify_module, components = get_claude_module()
        
        if structify_module is None:
            logger.error("Failed to load structify_module: get_claude_module() returned None")
            structify_available = False
            return False
        
        # Extract components
        structify_available = True
        FileStats = components.get('FileStats')
        process_all_files = components.get('process_all_files')
        
        # Apply any module-specific configuration
        _configure_structify_module()
        
        logger.info("Successfully loaded structify_module and components")
        return True
        
    except ImportError as e:
        logger.error(f"Could not import structify_module: {e}")
        structify_available = False
        
        # Create placeholder implementations
        _create_placeholders()
        return False
    except Exception as e:
        logger.error(f"Unexpected error initializing structify: {e}")
        structify_available = False
        _create_placeholders()
        return False


def _configure_structify_module():
    """Apply configuration to the loaded structify module"""
    if not structify_module:
        return
    
    # Set custom temp directory if module supports it
    custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'temp')
    
    if hasattr(structify_module, 'TEMP_OCR_DIR'):
        structify_module.TEMP_OCR_DIR = custom_temp_dir
        logger.info(f"Set structify TEMP_OCR_DIR to: {custom_temp_dir}")
    
    if hasattr(structify_module, 'initialize_ocr_environment'):
        structify_module.initialize_ocr_environment()
        logger.info("Initialized structify OCR environment")
    
    if hasattr(structify_module, 'patch_pytesseract_temp_dir'):
        structify_module.patch_pytesseract_temp_dir()
        logger.info("Patched pytesseract temp directory")


def _create_placeholders():
    """Create placeholder implementations when structify is not available"""
    global FileStats, process_all_files
    
    class FileStats:
        """Placeholder FileStats class"""
        def __init__(self):
            self.total_files = 0
            self.processed_files = 0
            self.failed_files = 0
            
        def to_dict(self):
            return {
                'total_files': self.total_files,
                'processed_files': self.processed_files,
                'failed_files': self.failed_files
            }
    
    def process_all_files(*args, **kwargs):
        """Placeholder process_all_files function"""
        logger.error("process_all_files not available - structify_module missing")
        return {"status": "error", "error": "Processing module not available"}


def process_file(file_path: str, output_path: Optional[str] = None, 
                max_chunk_size: int = 4096, extract_tables: bool = True, 
                use_ocr: bool = True) -> Dict[str, Any]:
    """
    Process a file using structify module's enhanced capabilities.
    
    Args:
        file_path: Path to the file to process
        output_path: Output JSON path (if None, derives from input filename)
        max_chunk_size: Maximum chunk size for text processing
        extract_tables: Whether to extract tables (for PDFs)
        use_ocr: Whether to use OCR for scanned content
        
    Returns:
        Dictionary with success status and processing details
    """
    if not structify_module:
        return {"status": "error", "error": "Structify module not available"}
    
    try:
        # Check if file exists
        if not os.path.isfile(file_path):
            return {"status": "error", "error": f"File not found: {file_path}"}
        
        # Generate output path if not provided
        if not output_path:
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            output_dir = os.path.dirname(file_path)
            output_path = os.path.join(output_dir, f"{base_name}_processed.json")
        
        # Process based on file type
        if file_path.lower().endswith('.pdf'):
            # PDF processing logic
            if hasattr(structify_module, 'process_pdf'):
                # Detect document type if available
                doc_type = None
                if hasattr(structify_module, 'detect_document_type'):
                    try:
                        doc_type = structify_module.detect_document_type(file_path)
                        logger.info(f"Detected document type: {doc_type}")
                    except Exception as e:
                        logger.warning(f"Could not detect document type: {e}")
                
                # Process PDF with enhanced capabilities
                result = structify_module.process_pdf(
                    pdf_path=file_path,
                    output_path=output_path,
                    max_chunk_size=max_chunk_size,
                    extract_tables=extract_tables,
                    use_ocr=use_ocr and (doc_type == "scan" if doc_type else True),
                    return_data=True
                )
                
                if result:
                    # Extract metadata from result
                    metadata = {
                        "document_type": doc_type,
                        "tables_extracted": len(result.get("tables", [])),
                        "references_extracted": len(result.get("references", [])),
                        "page_count": result.get("page_count", 0)
                    }
                    
                    return {
                        "status": "success",
                        "message": "PDF processed successfully",
                        "output_path": output_path,
                        "metadata": metadata
                    }
                else:
                    return {"status": "error", "error": "PDF processing returned no data"}
            else:
                # Fallback to general file processing
                logger.warning("process_pdf not available, using general file processing")
        
        # General file processing logic (for PDFs without process_pdf or other files)
        if process_all_files:
            # Get file directory and create temporary output if needed
            file_dir = os.path.dirname(file_path)
            temp_output = output_path or os.path.join(file_dir, "temp_output.json")
            
            # Process single file using process_all_files with filter
            result = process_all_files(
                root_directory=file_dir,
                output_file=temp_output,
                max_chunk_size=max_chunk_size,
                executor_type="thread",
                max_workers=1,
                stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                use_cache=False,
                valid_extensions=[os.path.splitext(file_path)[1]],
                ignore_dirs="",
                stats_only=False,
                include_binary_detection=False,
                file_filter=lambda f: f == file_path
            )
            
            # Check if output was created
            if os.path.exists(temp_output):
                # If we used a different output path, rename it
                if temp_output != output_path and output_path:
                    os.rename(temp_output, output_path)
                
                return {
                    "status": "success",
                    "message": "File processed successfully",
                    "output_path": output_path or temp_output,
                    "stats": result if isinstance(result, dict) else None
                }
            else:
                return {"status": "error", "error": "Processing did not create output file"}
        else:
            return {"status": "error", "error": "No processing function available"}
            
    except Exception as e:
        logger.error(f"Error processing file {file_path}: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


# Initialize module on import
initialize_structify()


# Export public interface
__all__ = [
    'structify_module',
    'structify_available', 
    'FileStats',
    'process_all_files',
    'process_file'
]