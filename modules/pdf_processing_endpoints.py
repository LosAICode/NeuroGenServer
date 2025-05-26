"""
Enhanced PDF Processing Endpoints
--------------------------------
This module provides optimized and consistent PDF processing endpoints
that leverage Claude, pdf_extractor, and pdf_output_enhancer modules.
"""

import os
import json
import time
import logging
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, Callable
import threading
import uuid
import tempfile
from flask import Blueprint, request, jsonify, current_app, send_file

# Set up logger
logger = logging.getLogger(__name__)

# Create Flask Blueprint for PDF processing
pdf_blueprint = Blueprint('pdf_processing', __name__)

# Try to import required modules with proper fallbacks
try:
    # Import Claude modules
    from structify_import import get_claude_module
    claude_module, claude_components = get_claude_module()
    if claude_module is None:
        logger.error("Failed to load Claude module")
        claude_available = False
    else:
        claude_available = True
        # Extract key components from Claude
        claude_process_pdf = getattr(claude_module, 'process_pdf', None)
        claude_extract_text_from_pdf = getattr(claude_module, 'extract_text_from_pdf', None)
        claude_extract_tables_from_pdf = getattr(claude_module, 'extract_tables_from_pdf', None)
        claude_detect_document_type = getattr(claude_module, 'detect_document_type', None)
        claude_process_scanned_pdf = getattr(claude_module, 'process_scanned_pdf', None)
        logger.info("Successfully loaded Claude module")
except (ImportError, AttributeError) as e:
    logger.error(f"Could not import Claude module: {e}")
    claude_available = False
    # Define placeholders if needed
    claude_process_pdf = None
    claude_extract_text_from_pdf = None
    claude_extract_tables_from_pdf = None
    claude_detect_document_type = None
    claude_process_scanned_pdf = None

# Import PDF Extractor module
try:
    import pdf_extractor
    pdf_extractor_available = True
    
    # Initialize PDF extractor
    try:
        init_status = pdf_extractor.initialize_module()
        logger.info(f"PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
    except Exception as e:
        logger.error(f"Error initializing PDF extractor: {e}")
        # Don't fail if initialization has issues, we'll handle at runtime
except ImportError as e:
    logger.error(f"pdf_extractor module not available: {e}")
    pdf_extractor_available = False

# Import PDF Output Enhancer module
try:
    import pdf_output_enhancer
    pdf_enhancer_available = True
    logger.info("Successfully imported pdf_output_enhancer module")
except ImportError as e:
    logger.error(f"pdf_output_enhancer module not available: {e}")
    pdf_enhancer_available = False

# Import optimized PDF processor if available
try:
    from pdf_processing import MemoryEfficientPDFProcessor
    optimized_pdf_available = True
    logger.info("Successfully imported optimized PDF processor")
except ImportError as e:
    logger.error(f"Optimized PDF processor not available: {e}")
    optimized_pdf_available = False

# Define task storage for tracking processing jobs
PROCESSING_TASKS = {}
TASK_LOCK = threading.Lock()

# Configure Socket.IO for real-time updates if available
sio = None

class PDFProcessingTask:
    """
    Task tracking for PDF processing with enhanced progress reporting and
    error handling.
    """
    def __init__(self, task_id: str, file_path: str, output_path: str = None):
        self.task_id = task_id
        self.file_path = file_path
        self.output_path = output_path
        self.status = "pending"
        self.progress = 0
        self.start_time = time.time()
        self.end_time = None
        self.error = None
        self.result = None
        self.logs = []
        self.cancelled = False
        
        # Register this task
        with TASK_LOCK:
            PROCESSING_TASKS[task_id] = self
    
    def log_message(self, message: str, level: str = "info"):
        """Add a log message to the task history"""
        timestamp = datetime.now().isoformat()
        log_entry = {"timestamp": timestamp, "message": message, "level": level}
        self.logs.append(log_entry)
        
        # Log to system logs as well
        if level == "error":
            logger.error(message)
        elif level == "warning":
            logger.warning(message)
        else:
            logger.info(message)
    
    def update_progress(self, value: int, message: str = ""):
        """Update task progress"""
        self.progress = min(value, 100)
        if message:
            self.log_message(message)
        
        # Emit progress update event if Socket.IO is available
        if sio:
            try:
                sio.emit('pdf_processing_progress', {
                    'task_id': self.task_id,
                    'progress': self.progress,
                    'message': message,
                    'status': self.status,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.error(f"Failed to emit Socket.IO event: {e}")
    
    def complete(self, result: Dict[str, Any] = None):
        """Mark task as completed"""
        self.status = "completed"
        self.progress = 100
        self.end_time = time.time()
        self.result = result
        self.log_message(f"Task completed in {self.elapsed_time:.2f}s")
        
        # Emit completion event if Socket.IO is available
        if sio:
            try:
                completion_data = {
                    'task_id': self.task_id,
                    'status': self.status,
                    'elapsed_time': self.elapsed_time,
                    'file_path': self.file_path,
                    'output_path': self.output_path,
                    'timestamp': time.time()
                }
                
                # Add result info if available
                if result:
                    completion_data.update({
                        'document_type': result.get('document_type', 'unknown'),
                        'page_count': result.get('page_count', 0),
                        'tables_count': len(result.get('tables', [])) if isinstance(result.get('tables'), list) else 0,
                        'chunks_count': len(result.get('chunks', [])) if isinstance(result.get('chunks'), list) else 0
                    })
                
                sio.emit('pdf_processing_complete', completion_data)
            except Exception as e:
                logger.error(f"Failed to emit Socket.IO event: {e}")
    
    def fail(self, error: str):
        """Mark task as failed"""
        self.status = "failed"
        self.end_time = time.time()
        self.error = error
        self.log_message(f"Task failed: {error}", "error")
        
        # Emit error event if Socket.IO is available
        if sio:
            try:
                sio.emit('pdf_processing_error', {
                    'task_id': self.task_id,
                    'status': self.status,
                    'error': self.error,
                    'file_path': self.file_path,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.error(f"Failed to emit Socket.IO event: {e}")
    
    def cancel(self):
        """Request task cancellation"""
        self.cancelled = True
        self.status = "cancelling"
        self.log_message("Task cancellation requested", "warning")
        
        # Emit cancellation event if Socket.IO is available
        if sio:
            try:
                sio.emit('pdf_processing_cancelled', {
                    'task_id': self.task_id,
                    'status': self.status,
                    'file_path': self.file_path,
                    'timestamp': time.time()
                })
            except Exception as e:
                logger.error(f"Failed to emit Socket.IO event: {e}")
        
        return True
    
    @property
    def elapsed_time(self) -> float:
        """Get the task elapsed time in seconds"""
        end = self.end_time if self.end_time else time.time()
        return end - self.start_time
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary for API responses"""
        return {
            "task_id": self.task_id,
            "file_path": self.file_path,
            "output_path": self.output_path,
            "status": self.status,
            "progress": self.progress,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "elapsed_time": self.elapsed_time,
            "error": self.error,
            "logs": self.logs[-10:],  # Return only the most recent logs
            "has_result": self.result is not None
        }

# ----------------------------- Core Processing Functions -----------------------------

def process_pdf_file(
    file_path: str,
    output_path: str = None,
    max_chunk_size: int = 4096,
    extract_tables: bool = True,
    use_ocr: bool = True,
    task: Optional[PDFProcessingTask] = None,
    return_data: bool = False,
    timeout: int = 300
) -> Dict[str, Any]:
    """
    Enhanced unified PDF processing function that consolidates Claude and
    PDF Extractor approaches with output enhancement via pdf_output_enhancer.
    
    Args:
        file_path: Path to the PDF file
        output_path: Path where to save the output JSON (if None, will be derived from file_path)
        max_chunk_size: Maximum size of text chunks
        extract_tables: Whether to extract tables
        use_ocr: Whether to apply OCR for scanned content
        task: Optional PDFProcessingTask for progress tracking
        return_data: Whether to return the processed data
        timeout: Maximum processing time in seconds
        
    Returns:
        Dictionary with processing results
    """
    # Validate input path
    if not os.path.exists(file_path):
        error_msg = f"File not found: {file_path}"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}
    
    # Create output path if not specified
    if not output_path:
        output_dir = os.path.dirname(file_path)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        output_path = os.path.join(output_dir, f"{base_name}_processed.json")
    
    if task:
        task.output_path = output_path
        task.log_message(f"Processing {file_path} -> {output_path}")
        task.update_progress(5, "Initializing")
    
    # First try to use PDF Extractor if available
    if pdf_extractor_available:
        try:
            if task:
                task.log_message("Using PDF Extractor module")
                task.update_progress(10, "Starting PDF Extractor")
            
            # Create a progress callback for PDF Extractor if task tracking is enabled
            progress_callback = None
            if task:
                def update_extractor_progress(current, total, stage):
                    if task.cancelled:
                        raise InterruptedError("Task cancelled")
                    progress = min(int((current / max(1, total)) * 90) + 10, 95)  # Scale to 10-95%
                    task.update_progress(progress, f"PDF Extractor: {stage}")
                progress_callback = update_extractor_progress
            
            # Process with PDF Extractor
            result = pdf_extractor.process_pdf(
                pdf_path=file_path,
                output_path=None,  # Don't save yet, we'll enhance first
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                return_data=True,
                timeout=timeout,
                progress_callback=progress_callback
            )
            
            # Check if processing was successful
            if result and (task is None or not task.cancelled):
                if task:
                    task.update_progress(95, "Enhancing output format")
                
                # Enhance the output with pdf_output_enhancer if available
                if pdf_enhancer_available:
                    try:
                        # Prepare data for enhancer
                        enhanced_data = pdf_output_enhancer.prepare_improved_output(result)
                        result["enhanced_format"] = enhanced_data
                        
                        # Save the enhanced output
                        if output_path:
                            # Ensure output directory exists
                            os.makedirs(os.path.dirname(output_path), exist_ok=True)
                            
                            # Write using enhancer's safe writer
                            pdf_output_enhancer.write_improved_output(enhanced_data, output_path)
                            if task:
                                task.log_message(f"Wrote enhanced output to {output_path}")
                    except Exception as enhance_err:
                        if task:
                            task.log_message(f"Error applying enhanced formatting: {enhance_err}", "warning")
                        logger.warning(f"Enhanced output formatting failed: {enhance_err}")
                        
                        # Fall back to direct JSON writing
                        if output_path:
                            try:
                                with open(output_path, "w", encoding="utf-8") as f:
                                    json.dump(result, f, ensure_ascii=False, indent=2)
                                if task:
                                    task.log_message(f"Wrote standard output to {output_path}")
                            except Exception as json_err:
                                if task:
                                    task.log_message(f"Error writing output: {json_err}", "error")
                else:
                    # Save standard output if enhancer not available
                    if output_path:
                        try:
                            with open(output_path, "w", encoding="utf-8") as f:
                                json.dump(result, f, ensure_ascii=False, indent=2)
                            if task:
                                task.log_message(f"Wrote standard output to {output_path}")
                        except Exception as json_err:
                            if task:
                                task.log_message(f"Error writing output: {json_err}", "error")
                
                # Mark as complete and return
                if task:
                    task.complete(result)
                
                # Complete the processing
                result["status"] = "success"
                result["output_path"] = output_path
                result["file_path"] = file_path
                
                if return_data:
                    return result
                else:
                    # Return minimal info if data not requested
                    return {
                        "status": "success",
                        "file_path": file_path,
                        "output_path": output_path,
                        "document_type": result.get("document_type", "unknown"),
                        "page_count": result.get("page_count", 0)
                    }
        except InterruptedError as e:
            if task:
                task.fail(f"Processing cancelled: {str(e)}")
            return {"status": "cancelled", "error": str(e), "file_path": file_path}
        except Exception as e:
            if task:
                task.log_message(f"PDF Extractor processing failed: {e}", "error")
                task.log_message("Falling back to Claude processor", "warning")
            logger.warning(f"PDF Extractor failed for {file_path}: {e}. Falling back to Claude.")
    else:
        if task:
            task.log_message("PDF Extractor not available. Using Claude processor.")
    
    # Fall back to Claude if PDF Extractor is not available or failed
    if claude_available and claude_process_pdf:
        try:
            if task:
                task.log_message("Using Claude PDF processor")
                task.update_progress(10, "Starting Claude processor")
            
            # Create a progress callback for Claude if task tracking is enabled
            progress_callback = None
            if task:
                def update_claude_progress(current, total, stage):
                    if task.cancelled:
                        raise InterruptedError("Task cancelled")
                    progress = min(int((current / max(1, total)) * 90) + 10, 95)  # Scale to 10-95%
                    task.update_progress(progress, f"Claude processor: {stage}")
                progress_callback = update_claude_progress
            
            # Process with Claude
            result = claude_process_pdf(
                pdf_path=file_path,
                output_path=None,  # Don't save yet, we'll enhance first
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                return_data=True,
                progress_callback=progress_callback
            )
            
            # Check if processing was successful
            if result and (task is None or not task.cancelled):
                if task:
                    task.update_progress(95, "Enhancing output format")
                
                # Enhance the output with pdf_output_enhancer if available
                if pdf_enhancer_available:
                    try:
                        # Prepare data for enhancer
                        enhanced_data = pdf_output_enhancer.prepare_improved_output(result)
                        result["enhanced_format"] = enhanced_data
                        
                        # Save the enhanced output
                        if output_path:
                            # Ensure output directory exists
                            os.makedirs(os.path.dirname(output_path), exist_ok=True)
                            
                            # Write using enhancer's safe writer
                            pdf_output_enhancer.write_improved_output(enhanced_data, output_path)
                            if task:
                                task.log_message(f"Wrote enhanced output to {output_path}")
                    except Exception as enhance_err:
                        if task:
                            task.log_message(f"Error applying enhanced formatting: {enhance_err}", "warning")
                        logger.warning(f"Enhanced output formatting failed: {enhance_err}")
                        
                        # Fall back to direct JSON writing
                        if output_path:
                            try:
                                with open(output_path, "w", encoding="utf-8") as f:
                                    json.dump(result, f, ensure_ascii=False, indent=2)
                                if task:
                                    task.log_message(f"Wrote standard output to {output_path}")
                            except Exception as json_err:
                                if task:
                                    task.log_message(f"Error writing output: {json_err}", "error")
                else:
                    # Save standard output if enhancer not available
                    if output_path:
                        try:
                            with open(output_path, "w", encoding="utf-8") as f:
                                json.dump(result, f, ensure_ascii=False, indent=2)
                            if task:
                                task.log_message(f"Wrote standard output to {output_path}")
                        except Exception as json_err:
                            if task:
                                task.log_message(f"Error writing output: {json_err}", "error")
                
                # Mark as complete and return
                if task:
                    task.complete(result)
                
                # Complete the processing
                result["status"] = "success"
                result["output_path"] = output_path
                result["file_path"] = file_path
                
                if return_data:
                    return result
                else:
                    # Return minimal info if data not requested
                    return {
                        "status": "success",
                        "file_path": file_path,
                        "output_path": output_path,
                        "document_type": result.get("document_type", "unknown"),
                        "page_count": result.get("page_count", 0)
                    }
        except InterruptedError as e:
            if task:
                task.fail(f"Processing cancelled: {str(e)}")
            return {"status": "cancelled", "error": str(e), "file_path": file_path}
        except Exception as e:
            if task:
                task.fail(f"Claude processing failed: {str(e)}")
            logger.error(f"Claude processing failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All processing methods failed: {str(e)}",
                "file_path": file_path
            }
    else:
        error_msg = "Neither PDF Extractor nor Claude are available for processing"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}
    
def extract_tables_from_pdf(
    file_path: str,
    page_range: Optional[tuple] = None,
    task: Optional[PDFProcessingTask] = None
) -> Dict[str, Any]:
    """
    Extract tables from a PDF file using the best available method.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        task: Optional PDFProcessingTask for progress tracking
        
    Returns:
        Dictionary with extracted tables
    """
    # Validate input path
    if not os.path.exists(file_path):
        error_msg = f"File not found: {file_path}"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}
    
    if task:
        task.log_message(f"Extracting tables from {file_path}")
        task.update_progress(10, "Initializing table extraction")
    
    # Try PDF Extractor first if available
    if pdf_extractor_available and hasattr(pdf_extractor, 'extract_tables_from_pdf'):
        try:
            if task:
                task.log_message("Using PDF Extractor for table extraction")
                task.update_progress(20, "Extracting tables with PDF Extractor")
            
            tables = pdf_extractor.extract_tables_from_pdf(file_path, page_range)
            
            if task:
                task.update_progress(90, f"Extracted {len(tables)} tables")
                task.complete({"tables": tables})
            
            return {
                "status": "success",
                "file_path": file_path,
                "tables": tables,
                "tables_count": len(tables),
                "extraction_method": "pdf_extractor"
            }
        except Exception as e:
            if task:
                task.log_message(f"PDF Extractor table extraction failed: {e}", "warning")
                task.log_message("Falling back to Claude table extractor", "warning")
            logger.warning(f"PDF Extractor table extraction failed for {file_path}: {e}. Falling back to Claude.")
    else:
        if task:
            task.log_message("PDF Extractor not available. Using Claude table extractor.")
    
    # Fall back to Claude if PDF Extractor is not available or failed
    if claude_available and claude_extract_tables_from_pdf:
        try:
            if task:
                task.log_message("Using Claude table extractor")
                task.update_progress(20, "Extracting tables with Claude")
            
            tables = claude_extract_tables_from_pdf(file_path, page_range)
            
            if task:
                task.update_progress(90, f"Extracted {len(tables)} tables")
                task.complete({"tables": tables})
            
            return {
                "status": "success",
                "file_path": file_path,
                "tables": tables,
                "tables_count": len(tables),
                "extraction_method": "claude"
            }
        except Exception as e:
            if task:
                task.fail(f"Claude table extraction failed: {str(e)}")
            logger.error(f"Claude table extraction failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All table extraction methods failed: {str(e)}",
                "file_path": file_path
            }
    else:
        error_msg = "Neither PDF Extractor nor Claude are available for table extraction"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}

def detect_document_type(
    file_path: str,
    task: Optional[PDFProcessingTask] = None
) -> Dict[str, Any]:
    """
    Detect the type of a PDF document using the best available method.
    
    Args:
        file_path: Path to the PDF file
        task: Optional PDFProcessingTask for progress tracking
        
    Returns:
        Dictionary with detected document type
    """
    # Validate input path
    if not os.path.exists(file_path):
        error_msg = f"File not found: {file_path}"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}
    
    if task:
        task.log_message(f"Detecting document type for {file_path}")
        task.update_progress(10, "Initializing document type detection")
    
    # Try PDF Extractor first if available
    if pdf_extractor_available and hasattr(pdf_extractor, 'detect_document_type'):
        try:
            if task:
                task.log_message("Using PDF Extractor for document type detection")
                task.update_progress(30, "Detecting with PDF Extractor")
            
            doc_type = pdf_extractor.detect_document_type(file_path)
            
            if task:
                task.update_progress(90, f"Detected document type: {doc_type}")
                task.complete({"document_type": doc_type})
            
            return {
                "status": "success",
                "file_path": file_path,
                "document_type": doc_type,
                "detection_method": "pdf_extractor"
            }
        except Exception as e:
            if task:
                task.log_message(f"PDF Extractor document type detection failed: {e}", "warning")
                task.log_message("Falling back to Claude document type detector", "warning")
            logger.warning(f"PDF Extractor document type detection failed for {file_path}: {e}. Falling back to Claude.")
    else:
        if task:
            task.log_message("PDF Extractor not available. Using Claude document type detector.")
    
    # Fall back to Claude if PDF Extractor is not available or failed
    if claude_available and claude_detect_document_type:
        try:
            if task:
                task.log_message("Using Claude document type detector")
                task.update_progress(30, "Detecting with Claude")
            
            doc_type = claude_detect_document_type(file_path)
            
            if task:
                task.update_progress(90, f"Detected document type: {doc_type}")
                task.complete({"document_type": doc_type})
            
            return {
                "status": "success",
                "file_path": file_path,
                "document_type": doc_type,
                "detection_method": "claude"
            }
        except Exception as e:
            if task:
                task.fail(f"Claude document type detection failed: {str(e)}")
            logger.error(f"Claude document type detection failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All document type detection methods failed: {str(e)}",
                "file_path": file_path
            }
    else:
        # Last resort: try a simplified type detection
        try:
            if task:
                task.log_message("Using simple document type detection")
                task.update_progress(30, "Simple detection")
            
            # Very basic detection
            doc_type = "general"
            
            # Try to extract some text
            text = ""
            try:
                with open(file_path, 'rb') as f:
                    # Try to read first 10KB to detect if it's a scan
                    import PyPDF2
                    reader = PyPDF2.PdfReader(f)
                    if len(reader.pages) > 0:
                        text = reader.pages[0].extract_text() or ""
                    
                    # If very little text, likely a scan
                    if len(text.strip()) < 100:
                        doc_type = "scan"
                    # Look for academic paper markers
                    elif "abstract" in text.lower()[:1000] and "references" in text.lower():
                        doc_type = "academic_paper"
                    # Look for book markers
                    elif len(reader.pages) > 50 or "chapter" in text.lower()[:5000]:
                        doc_type = "book"
            except Exception:
                # If we can't read it, default to general
                pass
            
            if task:
                task.update_progress(90, f"Detected document type: {doc_type}")
                task.complete({"document_type": doc_type})
            
            return {
                "status": "success",
                "file_path": file_path,
                "document_type": doc_type,
                "detection_method": "simple"
            }
        except Exception as e:
            if task:
                task.fail(f"Simple document type detection failed: {str(e)}")
            logger.error(f"Simple document type detection failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All document type detection methods failed: {str(e)}",
                "file_path": file_path
            }

def extract_text_from_pdf(
    file_path: str,
    page_range: Optional[tuple] = None,
    use_ocr: bool = False,
    task: Optional[PDFProcessingTask] = None
) -> Dict[str, Any]:
    """
    Extract text from a PDF file using the best available method.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        use_ocr: Whether to apply OCR for scanned content
        task: Optional PDFProcessingTask for progress tracking
        
    Returns:
        Dictionary with extracted text
    """
    # Validate input path
    if not os.path.exists(file_path):
        error_msg = f"File not found: {file_path}"
        if task:
            task.fail(error_msg)
        return {"status": "error", "error": error_msg, "file_path": file_path}
    
    if task:
        task.log_message(f"Extracting text from {file_path}")
        task.update_progress(10, "Initializing text extraction")
    
    # Try PDF Extractor first if available
    if pdf_extractor_available and hasattr(pdf_extractor, 'extract_text_from_pdf'):
        try:
            if task:
                task.log_message("Using PDF Extractor for text extraction")
                task.update_progress(20, "Extracting text with PDF Extractor")
            
            extracted_data = pdf_extractor.extract_text_from_pdf(file_path, page_range, use_ocr)
            
            if task:
                task.update_progress(90, f"Extracted {len(extracted_data.get('full_text', ''))} characters")
                task.complete(extracted_data)
            
            return {
                "status": "success",
                "file_path": file_path,
                "text": extracted_data.get("full_text", ""),
                "metadata": extracted_data.get("metadata", {}),
                "structure": extracted_data.get("structure", {}),
                "page_count": extracted_data.get("page_count", 0),
                "extraction_method": "pdf_extractor"
            }
        except Exception as e:
            if task:
                task.log_message(f"PDF Extractor text extraction failed: {e}", "warning")
                task.log_message("Falling back to Claude text extractor", "warning")
            logger.warning(f"PDF Extractor text extraction failed for {file_path}: {e}. Falling back to Claude.")
    else:
        if task:
            task.log_message("PDF Extractor not available. Using Claude text extractor.")
    
    # Fall back to Claude if PDF Extractor is not available or failed
    if claude_available and claude_extract_text_from_pdf:
        try:
            if task:
                task.log_message("Using Claude text extractor")
                task.update_progress(20, "Extracting text with Claude")
            
            extracted_data = claude_extract_text_from_pdf(file_path, page_range, use_ocr)
            
            if task:
                task.update_progress(90, f"Extracted {len(extracted_data.get('full_text', ''))} characters")
                task.complete(extracted_data)
            
            return {
                "status": "success",
                "file_path": file_path,
                "text": extracted_data.get("full_text", ""),
                "metadata": extracted_data.get("metadata", {}),
                "structure": extracted_data.get("structure", {}),
                "page_count": extracted_data.get("page_count", 0),
                "extraction_method": "claude"
            }
        except Exception as e:
            if task:
                task.fail(f"Claude text extraction failed: {str(e)}")
            logger.error(f"Claude text extraction failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All text extraction methods failed: {str(e)}",
                "file_path": file_path
            }
    else:
        # Very simple extraction fallback using PyPDF2
        try:
            if task:
                task.log_message("Using simple text extraction with PyPDF2")
                task.update_progress(20, "Simple text extraction")
            
            import PyPDF2
            text_content = []
            
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                page_count = len(reader.pages)
                
                # Apply page range if specified
                if page_range:
                    start_page, end_page = page_range
                    pages_to_process = range(
                        max(0, start_page),
                        min(page_count, end_page + 1)
                    )
                else:
                    pages_to_process = range(page_count)
                
                # Extract text from each page
                for i in pages_to_process:
                    if task and task.cancelled:
                        raise InterruptedError("Task cancelled")
                    
                    progress = 20 + int((i / len(pages_to_process)) * 70)
                    if task:
                        task.update_progress(progress, f"Processing page {i+1}/{len(pages_to_process)}")
                    
                    try:
                        page_text = reader.pages[i].extract_text() or ""
                        text_content.append(page_text)
                    except Exception as page_err:
                        logger.warning(f"Error extracting text from page {i+1}: {page_err}")
                        text_content.append("")
                
                # Join all text content
                full_text = "\n\n".join(text_content)
                
                if task:
                    task.update_progress(90, f"Extracted {len(full_text)} characters")
                    task.complete({"text": full_text, "page_count": page_count})
                
                return {
                    "status": "success",
                    "file_path": file_path,
                    "text": full_text,
                    "page_count": page_count,
                    "metadata": {"title": "", "author": ""},
                    "structure": {},
                    "extraction_method": "pypdf2_simple"
                }
        except InterruptedError as e:
            if task:
                task.fail(f"Processing cancelled: {str(e)}")
            return {"status": "cancelled", "error": str(e), "file_path": file_path}
        except Exception as e:
            if task:
                task.fail(f"Simple text extraction failed: {str(e)}")
            logger.error(f"Simple text extraction failed for {file_path}: {e}")
            return {
                "status": "error",
                "error": f"All text extraction methods failed: {str(e)}",
                "file_path": file_path
            }
            
def batch_process_pdfs(
    pdf_files: List[str],
    output_dir: str = None,
    max_chunk_size: int = 4096,
    extract_tables: bool = True,
    use_ocr: bool = True,
    max_workers: int = 4,
    task: Optional[PDFProcessingTask] = None
) -> Dict[str, Any]:
    """
    Process multiple PDF files in batch.
    
    Args:
        pdf_files: List of paths to PDF files
        output_dir: Directory where to save output files
        max_chunk_size: Maximum size of text chunks
        extract_tables: Whether to extract tables
        use_ocr: Whether to apply OCR for scanned content
        max_workers: Maximum number of worker threads
        task: Optional PDFProcessingTask for progress tracking
        
    Returns:
        Dictionary with batch processing results
    """
    import concurrent.futures
    
    # Validate input files
    valid_files = [f for f in pdf_files if os.path.exists(f) and os.path.isfile(f)]
    invalid_files = [f for f in pdf_files if f not in valid_files]
    
    if not valid_files:
        error_msg = "No valid PDF files provided for batch processing"
        if task:
            task.fail(error_msg)
        return {
            "status": "error", 
            "error": error_msg,
            "invalid_files": invalid_files
        }
    
    # Create output directory if not specified
    if not output_dir:
        output_dir = os.path.dirname(valid_files[0])
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    if task:
        task.log_message(f"Batch processing {len(valid_files)} PDF files")
        task.update_progress(5, f"Preparing batch processing of {len(valid_files)} files")
    
    # Initialize results
    results = {
        "status": "success",
        "processed_files": [],
        "failed_files": [],
        "invalid_files": invalid_files,
        "output_dir": output_dir,
        "total": len(pdf_files),
        "valid": len(valid_files),
        "succeeded": 0,
        "failed": 0,
        "invalid": len(invalid_files)
    }
    
    # Process files in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_file = {}
        
        # Submit all tasks
        for i, file_path in enumerate(valid_files):
            # Create output path
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            output_path = os.path.join(output_dir, f"{base_name}_processed.json")
            
            # Submit the task
            future = executor.submit(
                process_pdf_file,
                file_path=file_path,
                output_path=output_path,
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                task=None,  # No task tracking for individual files
                return_data=False
            )
            
            future_to_file[future] = file_path
        
        # Process results as they complete
        for i, future in enumerate(concurrent.futures.as_completed(future_to_file)):
            file_path = future_to_file[future]
            
            # Update progress
            if task:
                progress = 5 + int((i / len(valid_files)) * 90)
                task.update_progress(progress, f"Processed {i+1}/{len(valid_files)} files")
            
            try:
                # Get result
                result = future.result()
                
                # Check if processing was successful
                if result.get("status") == "success":
                    results["processed_files"].append({
                        "file_path": file_path,
                        "output_path": result.get("output_path"),
                        "document_type": result.get("document_type", "unknown"),
                        "page_count": result.get("page_count", 0)
                    })
                    results["succeeded"] += 1
                else:
                    results["failed_files"].append({
                        "file_path": file_path,
                        "error": result.get("error", "Unknown error")
                    })
                    results["failed"] += 1
            except Exception as e:
                # Add to failed files
                results["failed_files"].append({
                    "file_path": file_path,
                    "error": str(e)
                })
                results["failed"] += 1
    
    # Complete the task
    if task:
        task.update_progress(95, "Finalizing batch processing results")
        task.complete(results)
    
    return results

# ----------------------------- Task Management Functions -----------------------------

# ----------------------------- Task Management Functions -----------------------------

def get_task_status(task_id: str) -> Optional[Dict]:
    """Get status of a PDF processing task"""
    with TASK_LOCK:
        task = PROCESSING_TASKS.get(task_id)
        if task:
            return task.to_dict()
        return None

def cancel_task(task_id: str) -> bool:
    """Cancel a PDF processing task"""
    with TASK_LOCK:
        task = PROCESSING_TASKS.get(task_id)
        if task:
            return task.cancel()
        return False

def clean_old_tasks(max_age_hours: int = 24) -> int:
    """
    Clean up old completed tasks.
    
    Args:
        max_age_hours: Maximum age of tasks to keep in hours
        
    Returns:
        Number of tasks removed
    """
    removed = 0
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600
    
    with TASK_LOCK:
        task_ids_to_remove = []
        
        for task_id, task in PROCESSING_TASKS.items():
            # Only remove completed or failed tasks
            if task.status in ["completed", "failed"]:
                # Check if the task is older than max_age_hours
                if task.end_time and (current_time - task.end_time) > max_age_seconds:
                    task_ids_to_remove.append(task_id)
        
        # Remove the old tasks
        for task_id in task_ids_to_remove:
            del PROCESSING_TASKS[task_id]
            removed += 1
    
    return removed

def get_pdf_capabilities() -> Dict[str, Any]:
    """
    Get information about PDF processing capabilities.
    
    Returns:
        Dictionary with capabilities
    """
    capabilities = {
        "claude_available": claude_available,
        "pdf_extractor_available": pdf_extractor_available,
        "pdf_enhancer_available": pdf_enhancer_available,
        "optimized_pdf_available": optimized_pdf_available,
        "features": {
            "text_extraction": claude_available or pdf_extractor_available,
            "table_extraction": (claude_available and claude_extract_tables_from_pdf is not None) or 
                               (pdf_extractor_available and hasattr(pdf_extractor, 'extract_tables_from_pdf')),
            "document_type_detection": (claude_available and claude_detect_document_type is not None) or 
                                      (pdf_extractor_available and hasattr(pdf_extractor, 'detect_document_type')),
            "enhanced_output": pdf_enhancer_available,
            "batch_processing": True,
            "async_processing": True,
            "memory_efficient": optimized_pdf_available
        }
    }
    
    # Add PDF extractor capabilities if available
    if pdf_extractor_available and hasattr(pdf_extractor, 'get_capabilities'):
        try:
            extractor_capabilities = pdf_extractor.get_capabilities()
            capabilities["pdf_extractor_details"] = extractor_capabilities
        except Exception as e:
            logger.warning(f"Error getting PDF extractor capabilities: {e}")
    
    return capabilities

# ----------------------------- API Endpoints -----------------------------

@pdf_blueprint.route('/api/pdf/process', methods=['POST'])
def api_process_pdf():
    """API endpoint for processing a PDF file"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'file_path' not in data:
            return jsonify({'status': 'error', 'error': 'Missing file_path parameter'}), 400
        
        file_path = data['file_path']
        output_path = data.get('output_path')
        max_chunk_size = data.get('max_chunk_size', 4096)
        extract_tables = data.get('extract_tables', True)
        use_ocr = data.get('use_ocr', True)
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task for tracking
        task = PDFProcessingTask(task_id, file_path, output_path)
        
        # Start processing in a background thread
        def process_thread():
            process_pdf_file(
                file_path=file_path,
                output_path=output_path,
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                task=task
            )
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'task_id': task_id,
            'file_path': file_path,
            'message': 'PDF processing started'
        })
    
    except Exception as e:
        logger.error(f"Error in PDF processing API: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/extract-tables', methods=['POST'])
def api_extract_tables():
    """API endpoint for extracting tables from a PDF file"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'file_path' not in data:
            return jsonify({'status': 'error', 'error': 'Missing file_path parameter'}), 400
        
        file_path = data['file_path']
        
        # Parse page range if provided
        page_range = None
        if 'page_range' in data:
            try:
                page_range_str = data['page_range']
                
                # Handle different formats: "1,5" or "1-5"
                if ',' in page_range_str:
                    start, end = map(int, page_range_str.split(','))
                elif '-' in page_range_str:
                    start, end = map(int, page_range_str.split('-'))
                else:
                    start = end = int(page_range_str)
                
                # Adjust from 1-based to 0-based indexing
                page_range = (start - 1, end - 1)
            except Exception as e:
                return jsonify({'status': 'error', 'error': f'Invalid page_range format: {e}'}), 400
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task for tracking
        task = PDFProcessingTask(task_id, file_path)
        
        # Start processing in a background thread
        def process_thread():
            extract_tables_from_pdf(
                file_path=file_path,
                page_range=page_range,
                task=task
            )
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'task_id': task_id,
            'file_path': file_path,
            'message': 'Table extraction started'
        })
    
    except Exception as e:
        logger.error(f"Error in table extraction API: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/extract-text', methods=['POST'])
def api_extract_text():
    """API endpoint for extracting text from a PDF file"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'file_path' not in data:
            return jsonify({'status': 'error', 'error': 'Missing file_path parameter'}), 400
        
        file_path = data['file_path']
        use_ocr = data.get('use_ocr', False)
        
        # Parse page range if provided
        page_range = None
        if 'page_range' in data:
            try:
                page_range_str = data['page_range']
                
                # Handle different formats: "1,5" or "1-5"
                if ',' in page_range_str:
                    start, end = map(int, page_range_str.split(','))
                elif '-' in page_range_str:
                    start, end = map(int, page_range_str.split('-'))
                else:
                    start = end = int(page_range_str)
                
                # Adjust from 1-based to 0-based indexing
                page_range = (start - 1, end - 1)
            except Exception as e:
                return jsonify({'status': 'error', 'error': f'Invalid page_range format: {e}'}), 400
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task for tracking
        task = PDFProcessingTask(task_id, file_path)
        
        # Start processing in a background thread
        def process_thread():
            extract_text_from_pdf(
                file_path=file_path,
                page_range=page_range,
                use_ocr=use_ocr,
                task=task
            )
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'task_id': task_id,
            'file_path': file_path,
            'message': 'Text extraction started'
        })
    
    except Exception as e:
        logger.error(f"Error in text extraction API: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/detect-type', methods=['POST'])
def api_detect_document_type():
    """API endpoint for detecting PDF document type"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'file_path' not in data:
            return jsonify({'status': 'error', 'error': 'Missing file_path parameter'}), 400
        
        file_path = data['file_path']
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task for tracking
        task = PDFProcessingTask(task_id, file_path)
        
        # Start processing in a background thread
        def process_thread():
            detect_document_type(
                file_path=file_path,
                task=task
            )
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'task_id': task_id,
            'file_path': file_path,
            'message': 'Document type detection started'
        })
    
    except Exception as e:
        logger.error(f"Error in document type detection API: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/batch-process', methods=['POST'])
def api_batch_process_pdfs():
    """API endpoint for batch processing multiple PDF files"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data or 'pdf_files' not in data:
            return jsonify({'status': 'error', 'error': 'Missing pdf_files parameter'}), 400
        
        pdf_files = data['pdf_files']
        output_dir = data.get('output_dir')
        max_chunk_size = data.get('max_chunk_size', 4096)
        extract_tables = data.get('extract_tables', True)
        use_ocr = data.get('use_ocr', True)
        max_workers = data.get('max_workers', 4)
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Create task for tracking
        task = PDFProcessingTask(task_id, "batch", output_dir)
        
        # Start processing in a background thread
        def process_thread():
            batch_process_pdfs(
                pdf_files=pdf_files,
                output_dir=output_dir,
                max_chunk_size=max_chunk_size,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                max_workers=max_workers,
                task=task
            )
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'message': f'Batch processing started for {len(pdf_files)} files',
            'task_id': task_id,
            'output_dir': output_dir
        })
    
    except Exception as e:
        logger.error(f"Error in batch processing API: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
    
@pdf_blueprint.route('/api/pdf/task/<task_id>', methods=['GET'])
def api_get_task_status(task_id):
    """API endpoint for getting task status"""
    task_status = get_task_status(task_id)
    
    if task_status:
        return jsonify({
            'status': 'success',
            'task': task_status
        })
    else:
        return jsonify({'status': 'error', 'error': 'Task not found'}), 404

@pdf_blueprint.route('/api/pdf/task/<task_id>/cancel', methods=['POST'])
def api_cancel_task(task_id):
    """API endpoint for cancelling a task"""
    cancelled = cancel_task(task_id)
    
    if cancelled:
        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': 'Task cancellation requested'
        })
    else:
        return jsonify({'status': 'error', 'error': 'Task not found or already completed'}), 404

@pdf_blueprint.route('/api/pdf/task/<task_id>/result', methods=['GET'])
def api_get_task_result(task_id):
    """API endpoint for getting task result"""
    task_status = get_task_status(task_id)
    
    if not task_status:
        return jsonify({'status': 'error', 'error': 'Task not found'}), 404
    
    if task_status['status'] != 'completed':
        return jsonify({'status': 'error', 'error': 'Task not completed yet'}), 400
    
    with TASK_LOCK:
        task = PROCESSING_TASKS.get(task_id)
        if task and task.result:
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'result': task.result
            })
        else:
            return jsonify({'status': 'error', 'error': 'Task result not available'}), 404

@pdf_blueprint.route('/api/pdf/tasks', methods=['GET'])
def api_get_tasks():
    """API endpoint for getting all tasks"""
    status_filter = request.args.get('status')
    
    with TASK_LOCK:
        tasks = []
        
        for task_id, task in PROCESSING_TASKS.items():
            # Apply status filter if provided
            if status_filter and task.status != status_filter:
                continue
            
            # Add basic task info
            tasks.append({
                'task_id': task_id,
                'file_path': task.file_path,
                'status': task.status,
                'progress': task.progress,
                'start_time': task.start_time,
                'elapsed_time': task.elapsed_time
            })
    
    return jsonify({
        'status': 'success',
        'tasks': tasks,
        'count': len(tasks),
        'timestamp': time.time()
    })

@pdf_blueprint.route('/api/pdf/tasks/clean', methods=['POST'])
def api_clean_tasks():
    """API endpoint for cleaning old tasks"""
    try:
        data = request.get_json() or {}
        max_age_hours = data.get('max_age_hours', 24)
        
        removed = clean_old_tasks(max_age_hours)
        
        return jsonify({
            'status': 'success',
            'removed_tasks': removed,
            'message': f'Removed {removed} old completed tasks'
        })
    
    except Exception as e:
        logger.error(f"Error cleaning tasks: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/capabilities', methods=['GET'])
def api_get_capabilities():
    """API endpoint for getting PDF processing capabilities"""
    try:
        capabilities = get_pdf_capabilities()
        
        return jsonify({
            'status': 'success',
            'capabilities': capabilities
        })
    
    except Exception as e:
        logger.error(f"Error getting capabilities: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@pdf_blueprint.route('/api/pdf/download/<path:file_path>', methods=['GET'])
def api_download_pdf_result(file_path):
    """API endpoint for downloading a processed PDF result file"""
    try:
        # Sanitize file path
        file_path = os.path.normpath(file_path)
        
        # Check if file exists
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return jsonify({'status': 'error', 'error': 'File not found'}), 404
        
        # Check if it's a JSON file
        if not file_path.lower().endswith('.json'):
            return jsonify({'status': 'error', 'error': 'Not a JSON file'}), 400
        
        # Send the file
        return send_file(file_path, mimetype='application/json', as_attachment=True)
    
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'error': str(e)}), 500
    
# ----------------------------- Module Integration Functions -----------------------------

def setup_socketio(socketio_instance):
    """
    Set up Socket.IO for real-time updates.
    
    Args:
        socketio_instance: Socket.IO instance
    """
    global sio
    sio = socketio_instance
    logger.info("Socket.IO instance set up for real-time updates")

def register_pdf_endpoints(app, socketio_instance=None):
    """
    Register PDF processing endpoints with a Flask application.
    Make sure to override existing routes.
    """
    # Remove any existing routes for these paths
    # This is a hacky way but might be necessary
    for rule in list(app.url_map.iter_rules()):
        if rule.rule.startswith('/api/pdf/'):
            app.url_map._rules.remove(rule)
            app.url_map._rules_by_endpoint.pop(rule.endpoint, None)
    
    # Register the blueprint
    app.register_blueprint(pdf_blueprint)
    
    # Set up Socket.IO if provided
    if socketio_instance:
        setup_socketio(socketio_instance)
        
    # Add API capabilities to app config
    app.config['PDF_PROCESSING_CAPABILITIES'] = get_pdf_capabilities()
    
    logger.info("PDF processing endpoints registered successfully")
    
    return {
        "status": "success",
        "endpoints_registered": True,
        "capabilities": app.config['PDF_PROCESSING_CAPABILITIES']
    }

def get_module_capabilities():
    """
    Get module capabilities.
    
    Returns:
        Dictionary with module capabilities
    """
    return {
        "version": "1.0.0",
        "name": "enhanced_pdf_endpoints",
        "description": "Enhanced PDF processing endpoints for NeuroGen Server",
        "author": "NeuroGen Team",
        "modules": {
            "claude_available": claude_available,
            "pdf_extractor_available": pdf_extractor_available,
            "pdf_enhancer_available": pdf_enhancer_available,
            "optimized_pdf_available": optimized_pdf_available
        },
        "endpoints": {
            "/api/pdf/process": "Process a PDF file",
            "/api/pdf/extract-tables": "Extract tables from a PDF file",
            "/api/pdf/extract-text": "Extract text from a PDF file",
            "/api/pdf/detect-type": "Detect PDF document type",
            "/api/pdf/batch-process": "Process multiple PDF files in batch",
            "/api/pdf/task/<task_id>": "Get task status",
            "/api/pdf/task/<task_id>/cancel": "Cancel a task",
            "/api/pdf/task/<task_id>/result": "Get task result",
            "/api/pdf/tasks": "Get all tasks",
            "/api/pdf/tasks/clean": "Clean old tasks",
            "/api/pdf/capabilities": "Get PDF processing capabilities",
            "/api/pdf/download/<file_path>": "Download a processed PDF result file"
        },
        "functions": {
            "process_pdf_file": "Process a PDF file",
            "extract_tables_from_pdf": "Extract tables from a PDF file",
            "extract_text_from_pdf": "Extract text from a PDF file",
            "detect_document_type": "Detect PDF document type",
            "batch_process_pdfs": "Process multiple PDF files in batch"
        }
    }