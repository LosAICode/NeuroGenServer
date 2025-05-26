
# =============================================================================
# SECTION 1: IMPORTS AND INITIALIZATION
# =============================================================================

import os
import sys
import re
import time
import logging
import tempfile
import hashlib
import json
import traceback
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Union, Set, Callable
from datetime import datetime
from functools import lru_cache

# Set up enhanced logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Add console handler if none exists
if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(console_handler)

# Try to import required libraries with better error handling
# PyMuPDF for primary PDF processing
USE_FITZ = False
try:
    import fitz  # PyMuPDF
    USE_FITZ = True
    FITZ_VERSION = fitz.version
    logger.info(f"PyMuPDF (fitz) version {FITZ_VERSION} detected")
except ImportError:
    logger.warning("PyMuPDF not available. Install with: pip install pymupdf")
    fitz = None

# PyPDF2 as fallback
USE_PYPDF2 = False
try:
    import PyPDF2  # fallback if fitz not available
    USE_PYPDF2 = True
    PYPDF2_VERSION = PyPDF2.__version__
    logger.info(f"PyPDF2 version {PYPDF2_VERSION} detected")
except ImportError:
    logger.warning("PyPDF2 not available. Install with: pip install pypdf2")
    PyPDF2 = None

# pdfplumber for additional table extraction
USE_PDFPLUMBER = False
try:
    import pdfplumber
    USE_PDFPLUMBER = True
    logger.info("pdfplumber detected for table extraction")
except ImportError:
    logger.warning("pdfplumber not available. Install with: pip install pdfplumber")
    pdfplumber = None

# Tabula for table extraction
USE_TABULA = False
try:
    import tabula
    USE_TABULA = True
    logger.info("Tabula detected for table extraction")
    
    # Check for Java on Windows
    if os.name == 'nt':
        try:
            import jpype
            if not jpype.isJVMStarted():
                java_path = os.environ.get("JAVA_HOME")
                if java_path:
                    logger.info(f"Using Java from JAVA_HOME: {java_path}")
        except ImportError:
            logger.warning("jpype not available. Install with: pip install jpype1")
            USE_TABULA = False
except ImportError:
    logger.warning("Tabula not available. Install with: pip install tabula-py")
    tabula = None

# OCR capabilities
USE_OCR = False
try:
    import pytesseract
    # Try to set Windows path if needed
    if os.name == 'nt':  # Check if running on Windows
        default_tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(default_tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = default_tesseract_path
    
    # For image processing with OCR
    try:
        from PIL import Image
        USE_OCR = True
        logger.info("OCR available with Tesseract and PIL/Pillow")
    except ImportError:
        logger.warning("PIL/Pillow not available. Install with: pip install pillow")
except ImportError:
    logger.warning("Pytesseract not available. Install with: pip install pytesseract")
    pytesseract = None

# Library availability flags - will be set during initialization
PDF_MODULE_INITIALIZED = False

# =============================================================================
# SECTION 2: INITIALIZATION AND ENVIRONMENT SETUP
# =============================================================================

def setup_java_path():
    """
    Set up Java path by checking multiple possible locations.
    This is needed for Tabula table extraction.
    
    Returns:
        bool: True if Java was found and set up, False otherwise
    """
    java_locations = [
        # Standard Java install locations
        r"C:\Program Files\Java\jre1.8.0_441\bin",
        r"C:\Program Files\Java\jre-1.8\bin",
        r"C:\Program Files (x86)\Java\jre1.8.0_441\bin",
        r"C:\Program Files (x86)\Java\jre-1.8\bin",
        # Look for newer versions too
        r"C:\Program Files\Java\jre-11\bin",
        r"C:\Program Files\Java\jdk-11\bin",
        r"C:\Program Files\Java\jdk-17\bin",
    ]
    
    # First check if JAVA_HOME is already set correctly
    if "JAVA_HOME" in os.environ and os.path.exists(os.environ["JAVA_HOME"]):
        return True
        
    # Check the specific Java locations
    for location in java_locations:
        if os.path.exists(location):
            java_exe = os.path.join(location, "java.exe")
            if os.path.exists(java_exe):
                os.environ["JAVA_HOME"] = location
                logger.info(f"Java found at: {location}")
                
                # Add Java bin to PATH if not already there
                if location not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = location + os.pathsep + os.environ.get("PATH", "")
                
                return True
                
    # If all else fails, try to find java.exe in PATH
    try:
        import subprocess
        result = subprocess.run(["where", "java"], capture_output=True, text=True, check=True)
        if result.stdout:
            java_path = result.stdout.splitlines()[0]
            if java_path.endswith("java.exe"):
                os.environ["JAVA_HOME"] = os.path.dirname(java_path)
                logger.info(f"Java found in PATH: {os.environ['JAVA_HOME']}")
                return True
    except Exception as e:
        logger.warning(f"Failed to find Java in PATH: {e}")
        
    logger.warning("Java installation not found. Table extraction with Tabula will not be available.")
    return False

# Set up Java path if needed for Tabula
if USE_TABULA:
    setup_java_path()

class TimingContext:
    """Context manager for timing execution and logging duration"""
    def __init__(self, name: str):
        self.name = name
        self.start_time = None
        
    def __enter__(self):
        self.start_time = time.time()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        logger.debug(f"{self.name} completed in {duration:.2f} seconds")
        return False  # Don't suppress exceptions

# =============================================================================
# SECTION 3: PATH VALIDATION AND HANDLING FUNCTIONS
# =============================================================================

def initialize_pdf_libraries():
    """
    Initialize the PDF libraries and check their availability.
    Returns a dictionary of capabilities.
    """
    capabilities = {
        "pymupdf": False,
        "pypdf2": False,
        "pdfplumber": False,
        "tabula": False,
        "ocr": False
    }
    
    try:
        import fitz  # PyMuPDF
        capabilities["pymupdf"] = True
    except ImportError:
        pass
        
    try:
        import PyPDF2
        capabilities["pypdf2"] = True
    except ImportError:
        pass
        
    try:
        import pdfplumber
        capabilities["pdfplumber"] = True
    except ImportError:
        pass
        
    try:
        import tabula
        capabilities["tabula"] = True
    except ImportError:
        pass
        
    try:
        import pytesseract
        from PIL import Image
        capabilities["ocr"] = True
    except ImportError:
        pass
        
    return capabilities

def initialize_module():
    """
    Initialize the PDF extractor module.
    Returns status information.
    """
    capabilities = initialize_pdf_libraries()
    
    return {
        "status": "success", 
        "capabilities": capabilities,
        "initialized": True
    }
    
def validate_path(path, must_exist=True):
    """
    Validate and normalize a file or directory path.
    
    Args:
        path (str): Path to validate
        must_exist (bool): Whether the path must exist
        
    Returns:
        str: Normalized absolute path
        
    Raises:
        ValueError: If path is empty
        FileNotFoundError: If path doesn't exist and must_exist is True
    """
    if not path:
        raise ValueError("Path cannot be empty")
        
    # Convert to absolute path
    abs_path = os.path.abspath(os.path.normpath(path))
    
    # Check if it exists
    if must_exist and not os.path.exists(abs_path):
        raise FileNotFoundError(f"Path not found: {abs_path}")
    
    return abs_path

def ensure_directory_exists(path):
    """
    Ensure the directory exists, creating it if necessary.
    
    Args:
        path (str): Directory path
        
    Returns:
        str: Normalized absolute path
    """
    abs_path = os.path.abspath(os.path.normpath(path))
    os.makedirs(abs_path, exist_ok=True)
    return abs_path

def create_output_path(input_path, output_dir=None, suffix="_processed"):
    """
    Create an output path based on an input path.
    
    Args:
        input_path (str): Input file path
        output_dir (str, optional): Output directory. Defaults to the input directory.
        suffix (str, optional): Suffix to add to the filename. Defaults to "_processed".
        
    Returns:
        str: Output path
    """
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    if output_dir:
        ensure_directory_exists(output_dir)
        return os.path.join(output_dir, f"{base_name}{suffix}.json")
    else:
        return os.path.join(os.path.dirname(input_path), f"{base_name}{suffix}.json")

# =============================================================================
# SECTION 4: PDF TEXT EXTRACTION FUNCTIONS
# =============================================================================

def has_images(page) -> bool:
    """
    Check if a PyMuPDF page contains images.
    
    Args:
        page: PyMuPDF page object
        
    Returns:
        bool: True if page contains images, False otherwise
    """
    if not USE_FITZ:
        return False
        
    try:
        image_list = page.get_images(full=True)
        return len(image_list) > 0
    except Exception:
        return False

def extract_text_with_pymupdf(file_path: str, page_range: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Extract text from PDF using PyMuPDF (fitz) with enhanced structure preservation.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        
    Returns:
        Dict[str, Any]: Extracted text and metadata
    """
    if not USE_FITZ:
        raise ImportError("PyMuPDF not available")
    
    # Validate the file path
    file_path = validate_path(file_path)
    
    result = {
        "full_text": "",
        "text_content": [],
        "structure": {
            "title": None,
            "headings": [],
            "pages": []
        },
        "metadata": {},
        "page_count": 0,
        "has_scanned_content": False
    }
    
    try:
        with fitz.open(file_path) as doc:
            # Extract document metadata
            result["metadata"] = {
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", ""),
                "subject": doc.metadata.get("subject", ""),
                "keywords": doc.metadata.get("keywords", ""),
                "creator": doc.metadata.get("creator", ""),
                "producer": doc.metadata.get("producer", ""),
                "creation_date": doc.metadata.get("creationDate", ""),
                "modification_date": doc.metadata.get("modDate", ""),
                "page_count": len(doc)
            }
            
            result["page_count"] = len(doc)
            
            # Apply page range if specified
            if page_range:
                start_page, end_page = page_range
                page_range_to_process = range(
                    max(0, start_page),
                    min(len(doc), end_page + 1)
                )
            else:
                page_range_to_process = range(len(doc))
            
            # Try to extract document title from first page if not in metadata
            if not result["metadata"]["title"] and len(doc) > 0:
                first_page = doc[0]
                # Get text from top of first page
                top_text = first_page.get_text("text", clip=(0, 0, first_page.rect.width, first_page.rect.height * 0.2))
                # Use first line as potential title
                if top_text:
                    first_lines = top_text.strip().split('\n')
                    if first_lines:
                        candidate_title = first_lines[0].strip()
                        if 3 < len(candidate_title) < 200:  # Reasonable title length
                            result["structure"]["title"] = candidate_title
            
            # Process each page in the range
            scanned_page_count = 0
            
            for page_idx in page_range_to_process:
                page = doc[page_idx]
                page_text = page.get_text()
                
                # Check if page might be scanned (very little text content)
                is_scanned_page = len(page_text.strip()) < 100 and has_images(page)
                if is_scanned_page:
                    scanned_page_count += 1
                    
                page_dict = {
                    "page_num": page_idx + 1,
                    "text": page_text,
                    "blocks": [],
                    "is_scanned": is_scanned_page
                }
                
                # Extract text blocks with position data
                try:
                    blocks = page.get_text("dict")["blocks"]
                    for block in blocks:
                        if "lines" in block:
                            block_text = ""
                            for line in block["lines"]:
                                for span in line["spans"]:
                                    # Detect if text is a potential heading (based on font size)
                                    if span["size"] > 12:  # Adjust threshold as needed
                                        if len(span["text"].strip()) > 3:  # Avoid single characters
                                            heading = {
                                                "text": span["text"],
                                                "page": page_idx + 1,
                                                "font_size": span["size"],
                                                "bold": span["font"].lower().find("bold") >= 0
                                            }
                                            result["structure"]["headings"].append(heading)
                                    
                                    block_text += span["text"] + " "
                            
                            if block_text.strip():
                                page_dict["blocks"].append({
                                    "text": block_text.strip(),
                                    "bbox": block["bbox"],
                                    "type": "text"
                                })
                except Exception as e:
                    # If block extraction fails, continue with whole-page text
                    logger.debug(f"Error extracting blocks from page {page_idx+1}: {e}")
                    page_dict["blocks"].append({
                        "text": page_text,
                        "type": "text"
                    })
                
                # Attempt to identify tables (simplified approach)
                tables = []
                if hasattr(page, 'find_tables'):  # PyMuPDF v1.19.0+
                    try:
                        tables = page.find_tables()
                        for table in tables:
                            cells = table.extract()
                            page_dict["blocks"].append({
                                "type": "table",
                                "bbox": table.bbox,
                                "rows": len(cells),
                                "cols": len(cells[0]) if cells else 0,
                                "data": cells
                            })
                    except Exception as e:
                        logger.debug(f"Error extracting tables from page {page_idx+1}: {e}")
                
                result["structure"]["pages"].append(page_dict)
                result["text_content"].append(page_text)
            
            # Update scanned content flag
            result["has_scanned_content"] = scanned_page_count > 0
            if scanned_page_count > 0:
                logger.info(f"Detected {scanned_page_count} potentially scanned pages in {file_path}")
            
            # Join all text content
            result["full_text"] = "\n".join(result["text_content"])
            
        return result
    except Exception as e:
        logger.error(f"PyMuPDF extraction error: {e}")
        raise

def extract_text_with_pypdf2(file_path: str, page_range: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Extract text from PDF using PyPDF2 as a fallback method.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        
    Returns:
        Dict[str, Any]: Extracted text and metadata
    """
    if not USE_PYPDF2:
        raise ImportError("PyPDF2 not available")
    
    # Validate the file path
    file_path = validate_path(file_path)
    
    result = {
        "full_text": "",
        "text_content": [],
        "structure": {
            "title": None,
            "headings": [],
            "pages": []
        },
        "metadata": {},
        "page_count": 0,
        "has_scanned_content": False
    }
    
    text_parts = []
    with open(file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        result["page_count"] = len(reader.pages)
        
        # Apply page range if specified
        if page_range:
            start_page, end_page = page_range
            page_range_to_process = range(
                max(0, start_page), 
                min(len(reader.pages), end_page + 1)
            )
        else:
            page_range_to_process = range(len(reader.pages))
            
        # Extract metadata
        if hasattr(reader, 'metadata') and reader.metadata:
            result["metadata"] = {
                "title": reader.metadata.get("/Title", ""),
                "author": reader.metadata.get("/Author", ""),
                "subject": reader.metadata.get("/Subject", ""),
                "creator": reader.metadata.get("/Creator", ""),
                "producer": reader.metadata.get("/Producer", ""),
                "page_count": len(reader.pages)
            }
        
        # Process each page in the range
        for page_idx in page_range_to_process:
            page = reader.pages[page_idx]
            
            try:
                content = page.extract_text() or ""
                
                # Check if page might be scanned (very little text)
                if len(content.strip()) < 100:
                    result["has_scanned_content"] = True
                    
                text_parts.append(content)
                
                # Create basic page structure
                result["structure"]["pages"].append({
                    "page_num": page_idx + 1,
                    "text": content,
                    "blocks": [{"text": content, "type": "text"}]
                })
                
                result["text_content"].append(content)
                
            except Exception as page_err:
                logger.warning(f"Error extracting text from page {page_idx+1}: {page_err}")
                result["text_content"].append("")
                result["structure"]["pages"].append({
                    "page_num": page_idx + 1,
                    "text": "",
                    "blocks": [],
                    "error": str(page_err)
                })
    
    # Join all text content
    result["full_text"] = "\n".join(text_parts)
    
    return result

def extract_text_with_pdfplumber(file_path: str, page_range: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Extract text from PDF using pdfplumber as another fallback method.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        
    Returns:
        Dict[str, Any]: Extracted text and metadata
    """
    if not USE_PDFPLUMBER:
        raise ImportError("pdfplumber not available")
    
    # Validate the file path
    file_path = validate_path(file_path)
    
    result = {
        "full_text": "",
        "text_content": [],
        "structure": {
            "title": None,
            "headings": [],
            "pages": []
        },
        "metadata": {},
        "page_count": 0,
        "has_scanned_content": False
    }
    
    with pdfplumber.open(file_path) as pdf:
        result["page_count"] = len(pdf.pages)
        
        # Extract basic metadata from first page if available
        if len(pdf.pages) > 0:
            try:
                # Try to extract metadata using pdf.metadata
                if hasattr(pdf, 'metadata') and pdf.metadata:
                    result["metadata"] = {
                        "title": pdf.metadata.get("Title", ""),
                        "author": pdf.metadata.get("Author", ""),
                        "subject": pdf.metadata.get("Subject", ""),
                        "creator": pdf.metadata.get("Creator", ""),
                        "producer": pdf.metadata.get("Producer", ""),
                        "page_count": len(pdf.pages)
                    }
            except Exception as meta_err:
                logger.debug(f"Error extracting metadata with pdfplumber: {meta_err}")
        
        # Apply page range if specified
        if page_range:
            start_page, end_page = page_range
            page_range_to_process = range(
                max(0, start_page),
                min(len(pdf.pages), end_page + 1)
            )
        else:
            page_range_to_process = range(len(pdf.pages))
        
        # Process each page
        for page_idx in page_range_to_process:
            try:
                page = pdf.pages[page_idx]
                text = page.extract_text() or ""
                
                # Check if page might be scanned (very little text)
                if len(text.strip()) < 100:
                    result["has_scanned_content"] = True
                
                # Extract tables if available
                tables = []
                try:
                    page_tables = page.extract_tables()
                    if page_tables:
                        for i, table_data in enumerate(page_tables):
                            tables.append({
                                "type": "table",
                                "rows": len(table_data),
                                "cols": len(table_data[0]) if table_data and table_data[0] else 0,
                                "data": table_data
                            })
                except Exception as table_err:
                    logger.debug(f"Error extracting tables with pdfplumber on page {page_idx+1}: {table_err}")
                
                # Add page data to structure
                result["structure"]["pages"].append({
                    "page_num": page_idx + 1,
                    "text": text,
                    "blocks": [{"text": text, "type": "text"}] + tables
                })
                
                result["text_content"].append(text)
                
            except Exception as page_err:
                logger.warning(f"Error processing page {page_idx+1} with pdfplumber: {page_err}")
                result["text_content"].append("")
                result["structure"]["pages"].append({
                    "page_num": page_idx + 1,
                    "text": "",
                    "blocks": [],
                    "error": str(page_err)
                })
        
        # Join all text content
        result["full_text"] = "\n".join(result["text_content"])
    
    return result

def extract_text_from_pdf(file_path: str, page_range: Optional[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Enhanced text extraction from PDF files with structure preservation and fallback mechanisms.
    Tries multiple extraction methods until successful.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        
    Returns:
        Dict[str, Any]: Extracted text and metadata
    """
    # Initialize result structure
    result = {
        "full_text": "",
        "text_content": [],
        "structure": {
            "title": None,
            "headings": [],
            "pages": []
        },
        "metadata": {},
        "extraction_time": 0,
        "page_count": 0,
        "has_scanned_content": False,
        "extraction_method": "unknown",
        "start_time": time.time()
    }
    
    # Verify file exists and is accessible
    try:
        file_path = validate_path(file_path)
    except (FileNotFoundError, PermissionError, ValueError) as e:
        logger.error(f"File validation error: {e}")
        result["error"] = str(e)
        return result
    
    # Try multiple extraction methods with fallbacks
    extraction_methods = []
    
    # 1. Try PyMuPDF (primary method)
    if USE_FITZ:
        extraction_methods.append(("pymupdf", extract_text_with_pymupdf))
    
    # 2. Try PyPDF2 (fallback)
    if USE_PYPDF2:
        extraction_methods.append(("pypdf2", extract_text_with_pypdf2))
    
    # 3. Try pdfplumber (additional fallback)
    if USE_PDFPLUMBER:
        extraction_methods.append(("pdfplumber", extract_text_with_pdfplumber))
    
    # If no methods available, return empty result
    if not extraction_methods:
        logger.error("No PDF extraction libraries available")
        result["error"] = "No PDF extraction libraries available"
        return result
    
    # Try each method in sequence until one succeeds
    for method_name, method_func in extraction_methods:
        try:
            logger.debug(f"Attempting extraction with {method_name}")
            method_result = method_func(file_path, page_range)
            
            # Check if extraction produced meaningful text
            if method_result and method_result.get("full_text"):
                # Merge the method result with our result structure
                result.update(method_result)
                result["extraction_method"] = method_name
                logger.info(f"Successfully extracted text with {method_name}")
                break
            else:
                logger.debug(f"Extraction with {method_name} returned no text")
        except Exception as e:
            logger.warning(f"Extraction with {method_name} failed: {e}")
    
    # Check if extraction was successful
    if not result["full_text"]:
        logger.warning(f"All extraction methods failed for {file_path}")
        result["error"] = "Failed to extract text with all available methods"
    
    # Record extraction time
    result["extraction_time"] = time.time() - result["start_time"]
    
    return result

def extract_basic_text_from_pdf(file_path: str) -> str:
    """
    Extract basic text from PDF using multiple methods for maximum reliability.
    Tries multiple libraries in sequence to ensure best possible text extraction.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Extracted text content as string
    """
    best_text = ""
    extraction_methods_tried = []
    
    # Try PyMuPDF (fitz) first as it's usually the most reliable
    if USE_FITZ:
        try:
            import fitz
            extraction_methods_tried.append("PyMuPDF")
            text = []
            with fitz.open(file_path) as doc:
                for page in doc:
                    try:
                        page_text = page.get_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with PyMuPDF: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with PyMuPDF")
        except Exception as e:
            logger.warning(f"PyMuPDF extraction failed: {e}")
    
    # Try PyPDF2 if it's available
    if USE_PYPDF2 and (not best_text or len(best_text.strip()) < 1000):  # If we don't have good text yet
        try:
            import PyPDF2
            extraction_methods_tried.append("PyPDF2")
            text = []
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with PyPDF2: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with PyPDF2")
        except Exception as e:
            logger.warning(f"PyPDF2 extraction failed: {e}")
    
    # Try pdfplumber as another alternative
    if USE_PDFPLUMBER and (not best_text or len(best_text.strip()) < 1000):
        try:
            import pdfplumber
            extraction_methods_tried.append("pdfplumber")
            text = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text.append(page_text)
                    except Exception as e:
                        logger.debug(f"Error extracting text from page with pdfplumber: {e}")
            
            extracted_text = "\n\n".join(text)
            if len(extracted_text.strip()) > len(best_text.strip()):
                best_text = extracted_text
                logger.debug(f"Successfully extracted {len(best_text)} characters with pdfplumber")
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}")
    
    # If we still don't have good text, try binary content extraction as last resort
    if not best_text or len(best_text.strip()) < 500:
        try:
            extraction_methods_tried.append("binary_fallback")
            # Read the PDF as binary and try to extract text
            with open(file_path, 'rb') as f:
                binary_content = f.read()
            
            # Try different encodings
            for encoding in ['utf-8', 'latin-1', 'cp1252']:
                try:
                    decoded = binary_content.decode(encoding, errors='ignore')
                    # Clean up binary junk
                    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff]', '', decoded)
                    # Clean up remaining junk but keep basic punctuation
                    cleaned = re.sub(r'[^\w\s\.,;:!?\'"\-()]', ' ', cleaned)
                    # Remove duplicate spaces
                    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
                    
                    if len(cleaned) > len(best_text.strip()):
                        best_text = cleaned
                        logger.debug(f"Binary extraction with {encoding} yielded {len(best_text)} characters")
                except:
                    continue
            
            if best_text:
                logger.info(f"Extracted {len(best_text)} characters via binary fallback from {file_path}")
        except Exception as e:
            logger.error(f"Binary extraction fallback failed: {e}")
    
    # Report which methods were tried
    if extraction_methods_tried:
        logger.info(f"PDF text extraction methods tried: {', '.join(extraction_methods_tried)}")
    
    if not best_text:
        logger.warning(f"All text extraction methods failed for {file_path}")
        return ""
    
    return best_text

# =============================================================================
# SECTION 5: OCR AND SCAN PROCESSING FUNCTIONS
# =============================================================================

def process_scanned_pdf(file_path: str, max_pages: int = None) -> Dict[str, Any]:
    """
    Process a scanned PDF using OCR to extract text.
    
    Args:
        file_path: Path to the PDF file
        max_pages: Maximum number of pages to process
        
    Returns:
        Dict[str, Any]: OCR results
    """
    if not USE_OCR:
        logger.warning("OCR libraries not available. Cannot process scanned PDF.")
        return {"text": "", "success": False, "pages_processed": 0, "confidence": 0.0}
    
    if not USE_FITZ:
        logger.warning("PyMuPDF required for OCR processing.")
        return {"text": "", "success": False, "pages_processed": 0, "confidence": 0.0}
    
    # Verify file exists and is accessible
    try:
        file_path = validate_path(file_path)
    except (FileNotFoundError, PermissionError, ValueError) as e:
        logger.error(f"File validation error: {e}")
        return {"text": "", "success": False, "error": str(e), "pages_processed": 0, "confidence": 0.0}
        
    result = {
        "text": "",
        "confidence": 0.0,
        "pages_processed": 0,
        "success": False
    }
        
    try:
        text_content = []
        total_confidence = 0.0
        pages_processed = 0
        
        with fitz.open(file_path) as doc:
            # Limit page processing if requested
            total_pages = len(doc)
            pages_to_process = min(total_pages, max_pages) if max_pages else total_pages
            
            for page_num in range(pages_to_process):
                page = doc[page_num]
                # First try normal text extraction
                text = page.get_text()
                
                # If page has very little text, it might be scanned/image-based
                if len(text.strip()) < 100:
                    logger.info(f"Page {page_num+1} appears to be scanned. Applying OCR.")
                    # Convert page to image
                    pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))
                    
                    # Save to temporary file
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                        pix.save(tmp_file.name)
                        tmp_path = tmp_file.name
                    
                    try:
                        # Apply OCR
                        img = Image.open(tmp_path)
                        
                        # Use confidence if supported by Tesseract version
                        ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                        
                        # Extract text and calculate confidence
                        page_text = []
                        page_confidence = []
                        
                        for i, word_text in enumerate(ocr_data['text']):
                            if word_text.strip():
                                page_text.append(word_text)
                                if 'conf' in ocr_data:
                                    conf = float(ocr_data['conf'][i])
                                    if conf > 0:  # -1 means no confidence available
                                        page_confidence.append(conf)
                        
                        # Join the text and calculate average confidence
                        ocr_text = " ".join(page_text)
                        avg_confidence = sum(page_confidence) / len(page_confidence) if page_confidence else 0
                        
                        text_content.append(ocr_text)
                        total_confidence += avg_confidence
                        pages_processed += 1
                        
                    except Exception as ocr_err:
                        logger.error(f"OCR error on page {page_num+1}: {ocr_err}")
                        # Use whatever text we got from normal extraction as fallback
                        text_content.append(text)
                    finally:
                        # Clean up temp file
                        try:
                            os.unlink(tmp_path)
                        except:
                            pass
                else:
                    text_content.append(text)
                    
        # Calculate overall results
        result["text"] = "\n".join(text_content)
        result["confidence"] = total_confidence / pages_processed if pages_processed > 0 else 0.0
        result["pages_processed"] = pages_processed
        result["success"] = True
        
        return result
        
    except Exception as e:
        logger.error(f"OCR processing failed for {file_path}: {e}")
        return {"text": "", "success": False, "error": str(e), "pages_processed": 0, "confidence": 0.0}

# =============================================================================
# SECTION 6: TABLE EXTRACTION FUNCTIONS
# =============================================================================

def extract_tables_from_pdf(file_path: str, page_range: Optional[Tuple[int, int]] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Extract tables from a PDF using multiple available libraries with fallbacks.
    
    Args:
        file_path: Path to the PDF file
        page_range: Optional tuple of (start_page, end_page) for partial extraction
        limit: Maximum number of tables to extract
        
    Returns:
        List[Dict[str, Any]]: List of extracted tables with page numbers and data
    """
    tables = []
    
    # Verify file exists and is accessible
    try:
        file_path = validate_path(file_path)
    except (FileNotFoundError, PermissionError, ValueError) as e:
        logger.error(f"File validation error: {e}")
        return []
    
    # 1. First try using PyMuPDF (more reliable)
    if USE_FITZ:
        try:
            logger.info(f"Attempting table extraction with PyMuPDF for {file_path}")
            pymupdf_tables = []
            with fitz.open(file_path) as doc:
                # Apply page range if specified
                if page_range:
                    start_page, end_page = page_range
                    pages_to_process = range(
                        max(0, start_page),
                        min(len(doc), end_page + 1)
                    )
                else:
                    pages_to_process = range(len(doc))
                    
                for page_num in pages_to_process:
                    page = doc[page_num]
                    if hasattr(page, 'find_tables'):  # PyMuPDF v1.19.0+
                        try:
                            for i, table in enumerate(page.find_tables()):
                                if len(pymupdf_tables) >= limit:
                                    break
                                    
                                cells = table.extract()
                                # Convert cells to a more useful format
                                data = []
                                for row in cells:
                                    data.append({f"col_{j}": cell for j, cell in enumerate(row)})
                                
                                table_dict = {
                                    "table_id": len(pymupdf_tables) + 1,
                                    "page": page_num + 1,
                                    "rows": len(cells),
                                    "columns": [f"col_{j}" for j in range(len(cells[0]) if cells else 0)],
                                    "data": data,
                                    "extraction_method": "pymupdf"
                                }
                                pymupdf_tables.append(table_dict)
                        except Exception as e:
                            logger.debug(f"PyMuPDF table extraction failed for page {page_num+1}: {e}")
            
            if pymupdf_tables:
                logger.info(f"Extracted {len(pymupdf_tables)} tables from {file_path} using PyMuPDF")
                return pymupdf_tables
            
        except Exception as e:
            logger.warning(f"PyMuPDF table extraction failed for {file_path}: {e}")
    
    # 2. Try using pdfplumber
    if USE_PDFPLUMBER:
        try:
            logger.info(f"Attempting table extraction with pdfplumber for {file_path}")
            plumber_tables = []
            with pdfplumber.open(file_path) as pdf:
                # Apply page range if specified
                if page_range:
                    start_page, end_page = page_range
                    pages_to_process = range(
                        max(0, start_page),
                        min(len(pdf.pages), end_page + 1)
                    )
                else:
                    pages_to_process = range(len(pdf.pages))
                    
                for page_idx in pages_to_process:
                    try:
                        page = pdf.pages[page_idx]
                        extracted_tables = page.extract_tables()
                        
                        for j, table_data in enumerate(extracted_tables):
                            if len(plumber_tables) >= limit:
                                break
                                
                            # Convert to same format as other methods
                            headers = table_data[0] if table_data and len(table_data) > 0 else []
                            data = []
                            if headers and len(table_data) > 1:
                                for row in table_data[1:]:
                                    data.append({
                                        headers[k] if k < len(headers) else f"col_{k}": cell
                                        for k, cell in enumerate(row)
                                    })
                            else:
                                # No headers, use default column names
                                for row in table_data:
                                    data.append({f"col_{k}": cell for k, cell in enumerate(row)})
                            
                            table_dict = {
                                "table_id": len(plumber_tables) + 1,
                                "page": page_idx + 1,
                                "rows": len(table_data),
                                "columns": headers or [f"col_{j}" for j in range(len(table_data[0]) if table_data and table_data[0] else 0)],
                                "data": data,
                                "extraction_method": "pdfplumber"
                            }
                            plumber_tables.append(table_dict)
                    except Exception as e:
                        logger.debug(f"pdfplumber error on page {page_idx+1}: {e}")
                
            if plumber_tables:
                logger.info(f"Extracted {len(plumber_tables)} tables from {file_path} using pdfplumber")
                return plumber_tables
                
        except Exception as e:
            logger.warning(f"pdfplumber table extraction failed for {file_path}: {e}")
    
    # 3. Try using tabula-py if available
    if USE_TABULA:
        try:
            # Check Java integration
            try:
                import jpype
                if not jpype.isJVMStarted():
                    logger.info("Starting JVM for tabula")
                    jpype.startJVM()
            except Exception as jvm_err:
                logger.warning(f"Failed to start JVM: {jvm_err}")
            
            # Extract all tables from the PDF
            logger.info(f"Attempting table extraction with tabula for {file_path}")
            
            # Prepare page range string for tabula
            pages_str = 'all'
            if page_range:
                start_page, end_page = page_range
                # Note: tabula uses 1-based page numbering
                pages_str = f"{start_page+1}-{end_page+1}"
            
            try:
                tabula_tables = tabula.read_pdf(file_path, pages=pages_str, multiple_tables=True)
            except AttributeError as attr_err:
                if "'module' object has no attribute '_parse_pages'" in str(attr_err):
                    # Use alternative approach for newer tabula-py versions
                    tabula_tables = tabula.io.read_pdf(file_path, pages=pages_str, multiple_tables=True)
                else:
                    raise
            
            # Process each table
            tabula_processed = []
            for i, table in enumerate(tabula_tables):
                if i >= limit:
                    logger.info(f"Reached table limit ({limit}). Skipping remaining tables.")
                    break
                    
                # Convert DataFrame to dict
                table_dict = {
                    "table_id": i + 1,
                    "page": 1,  # Default if page info not available
                    "rows": len(table),
                    "columns": list(table.columns),
                    "data": table.fillna('').to_dict(orient='records'),
                    "extraction_method": "tabula"
                }
                tabula_processed.append(table_dict)
            
            if tabula_processed:
                logger.info(f"Extracted {len(tabula_processed)} tables from {file_path} using tabula-py")
                return tabula_processed
                
        except Exception as e:
            logger.warning(f"Tabula extraction failed for {file_path}: {e}")
    
    logger.info(f"No tables extracted from {file_path} using available methods")
    return []

# =============================================================================
# SECTION 7: DOCUMENT TYPE DETECTION FUNCTIONS
# =============================================================================

def detect_document_type(file_path: str) -> str:
    """
    Detect the type of PDF document to apply appropriate processing.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        str: Document type: "academic_paper", "report", "scan", "book", or "general"
    """
    if USE_FITZ:
        try:
            # Extract a sample of text to analyze
            doc_text = ""
            with fitz.open(file_path) as doc:
                # Get page count and check overall structure
                page_count = len(doc)
                
                # Check first few pages for content (possible scan detection)
                pages_to_check = min(3, page_count)
                total_text_len = 0
                text_samples = []
                
                for i in range(pages_to_check):
                    page_text = doc[i].get_text().strip()
                    total_text_len += len(page_text)
                    text_samples.append(page_text)
                    
                    # Only collect a reasonable sample size
                    if len(doc_text) < 10000:
                        doc_text += page_text + "\n\n"
                
                # Calculate average text per page for scan detection
                avg_text_per_page = total_text_len / pages_to_check if pages_to_check > 0 else 0
                
                # Check if this is likely a scanned document
                if avg_text_per_page < 500:
                    # Very little text per page suggests a scan
                    return "scan"
                    
            # Analyze document features
            features = {
                "has_abstract": bool(re.search(r'\babstract\b', doc_text[:2000], re.IGNORECASE)),
                "has_references": bool(re.search(r'\b(references|bibliography|works cited)\b', doc_text, re.IGNORECASE)),
                "has_keywords": bool(re.search(r'\bkeywords\b', doc_text[:2000], re.IGNORECASE)),
                "has_citations": len(re.findall(r'\(\w+\s+et\s+al\.,?\s+\d{4}\)|\[\d+\]', doc_text)) > 2,
                "has_equations": len(re.findall(r'[^a-zA-Z0-9]?\w+[^a-zA-Z0-9]+\w+[^a-zA-Z0-9]?', doc_text)) > 5,
                "has_tables": bool(re.search(r'\btable\s+\d+\b', doc_text, re.IGNORECASE)),
                "has_figures": bool(re.search(r'\bfigure\s+\d+\b', doc_text, re.IGNORECASE)),
                "has_chapters": bool(re.search(r'\bchapter\s+\d+\b', doc_text, re.IGNORECASE)),
                "has_toc": bool(re.search(r'\btable\s+of\s+contents\b', doc_text[:5000], re.IGNORECASE)),
                "page_count": page_count
            }
            
            # Determine document type based on features
            if features["has_abstract"] and features["has_references"] and features["has_citations"]:
                return "academic_paper"
            elif features["has_chapters"] or features["has_toc"] or features["page_count"] > 50:
                return "book"
            elif features["has_tables"] and features["page_count"] > 15 and bool(re.search(r'executive\s+summary', doc_text[:5000], re.IGNORECASE)):
                return "report"
            elif features["page_count"] < 30 and bool(re.search(r'(thesis|dissertation)', doc_text[:5000], re.IGNORECASE)):
                return "thesis"
            elif features["page_count"] < 5 and len(re.findall(r'^\s*[\•\-\*]', doc_text, re.MULTILINE)) > 10:
                return "slides"
            else:
                return "general"
        except Exception as e:
            logger.error(f"Error detecting document type: {e}")
            return "general"
    else:
        # Without PyMuPDF, do a simplified text-based detection
        if not USE_PYPDF2:
            return "general"  # No libraries available
            
        try:
            # Get basic information using PyPDF2
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                page_count = len(reader.pages)
                
                # Extract a sample of text
                sample_text = ""
                for i in range(min(3, page_count)):
                    try:
                        page_text = reader.pages[i].extract_text() or ""
                        sample_text += page_text + "\n\n"
                    except:
                        pass
                
                # If very little text, might be a scan
                if len(sample_text.strip()) < 500:
                    return "scan"
                
                # Basic detection based on extracted text
                if (re.search(r'\babstract\b', sample_text[:2000], re.IGNORECASE) and 
                    re.search(r'\breferences\b', sample_text, re.IGNORECASE)):
                    return "academic_paper"
                elif re.search(r'\bchapter\s+\d+\b', sample_text, re.IGNORECASE) or page_count > 50:
                    return "book"
                elif page_count > 15 and re.search(r'executive\s+summary', sample_text[:5000], re.IGNORECASE):
                    return "report"
                else:
                    return "general"
        except Exception as e:
            logger.error(f"Error in fallback document type detection: {e}")
            return "general"

# =============================================================================
# SECTION 8: REFERENCE EXTRACTION FUNCTIONS
# =============================================================================

def extract_references(text: str) -> List[Dict[str, Any]]:
    """
    Extract academic references and citations from document text with enhanced detection
    and structured output format for better integration with NeuroGen Processor.
    
    This optimized function handles multiple reference formats, including:
    - Numbered references [1], [2], etc.
    - Author-year citations (Smith et al., 2020)
    - APA, MLA, Chicago, and IEEE style references
    - DOI and URL detection within references
    
    Args:
        text: Full document text from the PDF
        
    Returns:
        List[Dict[str, Any]]: List of extracted references with metadata
    """
    if not text or len(text) < 500:
        logger.debug("Text too short for reference extraction")
        return []
    
    # Initialize results with structured format
    structured_references = []
    
    # Enhanced patterns for reference sections with more flexibility
    ref_section_patterns = [
        # Standard headers
        re.compile(r'^\s*(References|Bibliography|Works\s+Cited|Literature\s+Cited|References\s+and\s+Notes)\s*$', re.IGNORECASE),
        # Numbered headers (e.g., "7. References")
        re.compile(r'^\s*\d+\.\s*(References|Bibliography|Works\s+Cited|Literature\s+Cited)\s*$', re.IGNORECASE),
        # Headers with formatting characters
        re.compile(r'^\s*[*#=_-]{0,3}\s*(References|Bibliography|Works\s+Cited|Literature\s+Cited)\s*[*#=_-]{0,3}\s*$', re.IGNORECASE)
    ]
    
    # Patterns that indicate the end of references section
    end_section_patterns = [
        re.compile(r'^\s*(appendix|acknowledgements|funding|supplementary|notes|tables|figures)\b', re.IGNORECASE),
        re.compile(r'^\s*\d+\.\s*(appendix|acknowledgements|funding|supplementary)\b', re.IGNORECASE)
    ]
    
    # Split text into lines and normalize
    lines = text.split('\n')
    normalized_lines = []
    for line in lines:
        line = line.strip()
        if line:  # Skip empty lines
            normalized_lines.append(line)
    
    # Find the references section using sliding window for fuzzy matching
    in_references = False
    ref_start_idx = -1
    reference_text = ""
    
    # Check if we're dealing with a document that has reference numbers in brackets/parentheses
    has_numbered_refs = len(re.findall(r'\[\d+\]|\(\d+\)', text)) > 5
    
    for i, line in enumerate(normalized_lines):
        # Check if we've found the start of references section
        if not in_references:
            # Try exact header match first
            header_match = False
            for pattern in ref_section_patterns:
                if pattern.match(line):
                    in_references = True
                    ref_start_idx = i
                    header_match = True
                    logger.debug(f"Found references section header: {line}")
                    break
            
            # If no exact match, try more flexible search within the line
            if not header_match:
                for pattern in ref_section_patterns:
                    if pattern.search(line) and (line.lower().startswith('reference') or 
                                               line.lower().startswith('bibliog') or
                                               'works cited' in line.lower()):
                        # This is likely a header with extra text
                        in_references = True
                        ref_start_idx = i
                        logger.debug(f"Found references section with flexible match: {line}")
                        break
        else:
            # Check if we've reached the end of references
            is_end = False
            
            # Check for explicit section endings
            for pattern in end_section_patterns:
                if pattern.match(line):
                    is_end = True
                    break
            
            # Check for likely new section (e.g., all caps heading)
            if not is_end and len(line) < 50 and line.isupper() and i > ref_start_idx + 3:
                is_end = True
            
            # If we found the end, process everything we've collected
            if is_end:
                logger.debug(f"Found end of references at line: {line}")
                break
            
            # Add this line to our reference section
            reference_text += line + "\n"
    
    # If we found a references section but didn't hit an end marker,
    # use everything from start index to the end
    if in_references and ref_start_idx >= 0 and not reference_text:
        reference_text = "\n".join(normalized_lines[ref_start_idx+1:])
    
    # Now process the collected reference text
    if reference_text:
        # Determine reference style based on content
        if has_numbered_refs or re.search(r'^\s*\[\d+\]|\(\d+\)', reference_text, re.MULTILINE):
            style = "numbered"
        elif re.search(r'\(\w+,\s+\d{4}\)|\(\w+\s+et\s+al\.,\s+\d{4}\)', reference_text):
            style = "author-year"
        else:
            style = "standard"
        
        # Process based on detected style
        if style == "numbered":
            raw_refs = extract_numbered_references(reference_text)
        elif style == "author-year":
            raw_refs = extract_author_year_references(reference_text)
        else:
            raw_refs = extract_standard_references(reference_text)
        
        # Convert raw references to structured format
        for i, ref in enumerate(raw_refs):
            # Skip references that are too short to be valid
            if len(ref) < 20:
                continue
                
            ref_id = i + 1
            structured_ref = {
                "ref_id": ref_id,
                "text": ref,
                "ref_type": classify_reference_type(ref),
                "style": style
            }
            
            # Try to extract more metadata
            extracted_data = extract_reference_metadata(ref)
            if extracted_data:
                structured_ref.update(extracted_data)
                
            structured_references.append(structured_ref)
    
    logger.info(f"Extracted {len(structured_references)} references")
    return structured_references

def extract_numbered_references(text: str) -> List[str]:
    """Extract references that use a numbered format like [1] or (1)."""
    # Find reference numbers with brackets or parentheses
    ref_pattern = re.compile(r'^\s*(?:\[(\d+)\]|\((\d+)\)|\d+\.)\s+(.+)$', re.MULTILINE)
    
    # Try to find all references using the pattern
    matches = ref_pattern.findall(text)
    if matches:
        # Organized by reference number
        refs_dict = {}
        current_ref = None
        
        # Split by lines to handle multi-line references
        lines = text.split('\n')
        for line in lines:
            # Check if line starts a new reference
            match = ref_pattern.match(line)
            if match:
                # Get reference number and start text
                ref_num = match.group(1) or match.group(2) or int(match.group(3))
                try:
                    ref_num = int(ref_num)
                except:
                    ref_num = 0
                    
                ref_text = match.group(3) if match.group(3) else line
                refs_dict[ref_num] = ref_text
                current_ref = ref_num
            elif current_ref is not None:
                # This is a continuation of the previous reference
                refs_dict[current_ref] += " " + line.strip()
        
        # Convert to ordered list
        return [refs_dict[key] for key in sorted(refs_dict.keys())]
    else:
        # Fallback if no matches - try to split by line breaks at plausible reference starts
        return extract_standard_references(text)

def extract_author_year_references(text: str) -> List[str]:
    """Extract references that use author-year format like (Smith, 2020)."""
    # Split text into potential references
    # Author-year references typically start with a last name
    ref_pattern = re.compile(r'^\s*([A-Z][a-z]+,\s+[A-Z]\.|[A-Z][a-z]+\s+[A-Z]\.)')
    
    references = []
    current_ref = ""
    
    # Process line by line
    lines = text.split('\n')
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        # Check if this starts a new reference
        if ref_pattern.match(line) and (current_ref == "" or len(current_ref) > 30):
            # Save previous reference if it exists
            if current_ref:
                references.append(current_ref)
            current_ref = line
        elif current_ref:
            # Continue previous reference
            current_ref += " " + line
    
    # Add the last reference
    if current_ref:
        references.append(current_ref)
    
    # If we didn't find any references with this method, try the standard approach
    if not references:
        return extract_standard_references(text)
        
    return references

def extract_standard_references(text: str) -> List[str]:
    """Extract references using general patterns when specific formats fail."""
    # Split text by one or more blank lines or reference indicators
    potential_refs = re.split(r'\n\s*\n|(?:\[\d+\]|\(\d+\)|\d+\.)\s+', text)
    
    references = []
    for ref in potential_refs:
        ref = ref.strip()
        if len(ref) > 30:  # Minimal length for a valid reference
            references.append(ref)
    
    # If we got too few or too many, try another approach
    if len(references) <= 1 or len(references) > 500:
        # Try splitting by lines and grouping
        lines = text.split('\n')
        
        current_ref = ""
        for line in lines:
            line = line.strip()
            if not line:
                if current_ref:
                    references.append(current_ref)
                    current_ref = ""
            else:
                # New reference typically starts with capital letter
                if current_ref and (
                    re.match(r'^[A-Z]', line) and 
                    len(current_ref) > 50 and 
                    not current_ref.endswith(':') and 
                    not current_ref.endswith(',')
                ):
                    references.append(current_ref)
                    current_ref = line
                else:
                    if current_ref:
                        current_ref += " " + line
                    else:
                        current_ref = line
        
        # Add the last reference
        if current_ref:
            references.append(current_ref)
    
    return references

def classify_reference_type(ref: str) -> str:
    """Classify the type of reference (article, book, webpage, etc.)."""
    ref_lower = ref.lower()
    
    if re.search(r'\b(journal|proceedings|conference|transactions|acta|archives)\b', ref_lower):
        return "article"
    elif re.search(r'\bdoi:|https?://doi.org\b', ref_lower):
        return "article"
    elif re.search(r'\bisbn\b|\bedition\b|\bpress\b|\bpublishers?\b|\bvolume\b', ref_lower):
        return "book"
    elif re.search(r'\bhttps?://(?!doi.org)\b|\burl\b|\bweb\b|\bonline\b|\bwebsite\b|\bretrieved\b', ref_lower):
        return "webpage"
    elif re.search(r'\bthesis\b|\bdissertation\b', ref_lower):
        return "thesis"
    elif re.search(r'\btech\s*(?:nical)?\s*report\b|\bworking\s*paper\b', ref_lower):
        return "report"
    else:
        return "unknown"

def extract_reference_metadata(ref: str) -> Dict[str, Any]:
    """Extract metadata from a reference string."""
    metadata = {}
    
    # Try to extract year
    year_match = re.search(r'\b(19|20)\d{2}\b', ref)
    if year_match:
        metadata["year"] = year_match.group(0)
    
    # Try to extract DOI
    doi_match = re.search(r'doi:([^\s,]+)|https?://doi.org/([^\s,]+)', ref, re.IGNORECASE)
    if doi_match:
        metadata["doi"] = doi_match.group(1) or doi_match.group(2)
    
    # Try to extract URL
    url_match = re.search(r'https?://(?!doi.org)[^\s,]+', ref)
    if url_match:
        metadata["url"] = url_match.group(0)
    
    # Try to extract authors
    # This is complex and prone to errors, but we'll make a basic attempt
    if ref.strip():
        first_part = ref.split(',')[0].strip()
        if len(first_part.split()) <= 3:  # Likely an author name
            metadata["first_author"] = first_part
    
    return metadata

def process_references(ref_lines: List[str]) -> List[str]:
    """
    Process a list of lines from the references section to extract individual references.
    
    Args:
        ref_lines: Lines from the references section
        
    Returns:
        List[str]: List of processed references
    """
    references = []
    current_ref = []
    
    # Skip the header line
    start_idx = 0
    for i, line in enumerate(ref_lines):
        if re.search(r'\b(references|bibliography|works cited|literature cited)\b', line, re.IGNORECASE):
            start_idx = i + 1
            break
    
    for line in ref_lines[start_idx:]:
        line = line.strip()
        if not line:
            continue
            
        # Check if line starts a new reference
        starts_new_ref = bool(re.match(r'^\[\d+\]|\(\d+\)|^\d+\.|\[\w+\d*\]', line))
        
        # Also check for author pattern at start of line (lastname, initial.)
        author_pattern = bool(re.match(r'^[A-Z][a-z]+,\s+[A-Z]\.', line))
        
        if starts_new_ref or author_pattern:
            # Save previous reference if it exists
            if current_ref:
                references.append(" ".join(current_ref))
                current_ref = []
            
            current_ref.append(line)
        elif current_ref:
            # Continue previous reference
            current_ref.append(line)
    
    # Add the last reference
    if current_ref:
        references.append(" ".join(current_ref))
    
    return references

# =============================================================================
# SECTION 9: DOCUMENT STRUCTURE ANALYSIS
# =============================================================================

def identify_document_structure(text: str, headings: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Analyze document text to identify structural elements like sections, lists, and paragraphs
    with enhanced accuracy and metadata for the NeuroGen Processor UI.
    
    This optimized function provides richer structure detection and metadata that directly
    integrates with the document visualization components in our UI/UX.
    
    Args:
        text: Full document text
        headings: List of potential headings detected by font size (optional)
        
    Returns:
        Dict[str, Any]: Comprehensive document structure information
    """
    logger.info("Analyzing document structure...")
    
    # Initialize enhanced structure with additional metadata
    structure = {
        "sections": [],
        "lists": [],
        "paragraphs": [],
        "metadata": {
            "section_count": 0,
            "list_count": 0,
            "paragraph_count": 0,
            "estimated_reading_time_mins": 0,
            "average_section_length": 0,
            "detected_languages": [],
            "has_toc": False,
            "has_references": False,
            "has_abstract": False,
            "has_equations": False,
            "has_figures": False
        },
        "toc": []
    }
    
    # Enhanced section header patterns with lookahead for better accuracy
    section_patterns = [
        # Numbered sections (1. Introduction, 1.1 Background, etc.)
        re.compile(r'^\s*(\d+(?:\.\d+)*)\.?\s+(.+?)(?:\s*\n|$)'),
        # Appendix sections (Appendix A: Materials)
        re.compile(r'^\s*(Appendix\s+[A-Z])(?:[\.:])?\s*(.+?)(?:\s*\n|$)', re.IGNORECASE),
        # Chapter headers (Chapter 1: Introduction)
        re.compile(r'^\s*(Chapter\s+\d+)(?:[\.:])?\s*(.+?)(?:\s*\n|$)', re.IGNORECASE),
        # Section headers (Section 1: Methodology) 
        re.compile(r'^\s*(Section\s+\d+)(?:[\.:])?\s*(.+?)(?:\s*\n|$)', re.IGNORECASE),
        # Part headers (Part I: Theory)
        re.compile(r'^\s*(Part\s+[IVX]+)(?:[\.:])?\s*(.+?)(?:\s*\n|$)', re.IGNORECASE),
        # Common unnumbered section headers in academic papers
        re.compile(r'^\s*(Abstract|Introduction|Methods?|Methodology|Results|Discussion|Conclusion|Acknowledgements|References|Bibliography)(?:[\s\.:]+(.+?))?(?:\s*\n|$)', re.IGNORECASE)
    ]
    
    # Enhanced list patterns covering more list formats
    list_patterns = [
        # Bullet lists with various bullet characters
        re.compile(r'^\s*([\•\-\*\○\◆\▪\■\★\✓\✔\➤\➢])\s+(.+)'),
        # Numbered lists with various formats (1., 1), (1))
        re.compile(r'^\s*(\d+\.|\d+\)|\(\d+\))\s+(.+)'),
        # Alphabetic lists with lowercase/uppercase letters
        re.compile(r'^\s*((?:[a-z]|[A-Z])\.|\([a-z]\)|\([A-Z]\))\s+(.+)'),
        # Roman numeral lists (i., ii., I., II.)
        re.compile(r'^\s*(?:([ivxIVX]+)\.|\(([ivxIVX]+)\))\s+(.+)')
    ]
    
    # Additional patterns to detect document features
    abstract_pattern = re.compile(r'^\s*(?:abstract|summary)\s*(?:[:\.\n]|$)', re.IGNORECASE)
    reference_pattern = re.compile(r'^\s*(?:references|bibliography|works cited)\s*(?:[:\.\n]|$)', re.IGNORECASE)
    toc_pattern = re.compile(r'^\s*(?:table\s+of\s+contents|contents|toc)\s*(?:[:\.\n]|$)', re.IGNORECASE)
    equation_pattern = re.compile(r'(?:\$\$.+?\$\$|\$.+?\$|\\\(.+?\\\)|\\\[.+?\\\])')
    figure_pattern = re.compile(r'(?:figure|fig\.)\s+\d+', re.IGNORECASE)
    
    # Text normalization to help with structure detection
    # Replace multiple spaces with a single space
    normalized_text = re.sub(r'\s+', ' ', text)
    # Word count for reading time estimation
    word_count = len(re.findall(r'\b\w+\b', normalized_text))
    
    # Split text into lines, preserving empty lines as they help with structure
    lines = text.split('\n')
    
    # Normalize line endings (some PDFs have inconsistent line breaks)
    normalized_lines = []
    current_line = ""
    
    for line in lines:
        line = line.rstrip()
        # Check if line ends with hyphen (possible word break)
        if line.endswith('-') and len(line) > 2:
            # Store without hyphen for continuation
            current_line += line[:-1]
        # Check if line is very short and doesn't end with punctuation
        elif len(line) < 40 and not re.search(r'[.,:;?!)]$', line) and current_line:
            # Likely continued from previous line
            current_line += line
        else:
            if current_line:
                normalized_lines.append(current_line)
                current_line = ""
            normalized_lines.append(line)
    
    # Add any remaining current line
    if current_line:
        normalized_lines.append(current_line)
    
    # Process the text for document feature detection
    has_abstract = bool(re.search(abstract_pattern, text[:int(len(text)/5)]))  # Check first fifth of document
    has_references = bool(re.search(reference_pattern, text[int(len(text)*3/4):]))  # Check last quarter
    has_toc = bool(re.search(toc_pattern, text[:int(len(text)/3)]))  # Check first third
    has_equations = bool(re.search(equation_pattern, text))
    has_figures = bool(re.search(figure_pattern, text))
    
    # Update metadata in structure
    structure["metadata"]["has_abstract"] = has_abstract
    structure["metadata"]["has_references"] = has_references
    structure["metadata"]["has_toc"] = has_toc
    structure["metadata"]["has_equations"] = has_equations
    structure["metadata"]["has_figures"] = has_figures
    
    # Initialize tracking variables
    current_section = {"title": "", "content": [], "level": 0, "id": "root"}
    in_list = False
    list_items = []
    paragraph = []
    
    # Generate mapping of line indices to heading info from font detection
    synthetic_headings = {}
    if headings:
        for heading in headings:
            # First try exact matching
            line_idx = -1
            for i, line in enumerate(normalized_lines):
                if heading.get("text", "").strip() and heading["text"].strip() in line.strip():
                    line_idx = i
                    break
            
            # If no exact match, try fuzzy matching
            if line_idx < 0 and heading.get("text"):
                for i, line in enumerate(normalized_lines):
                    # If this line is all uppercase or has a distinctive font size
                    if (line.isupper() and len(line) > 3 and len(line) < 100) or \
                       heading.get("font_size", 0) > 14:
                        # Compare with fuzzy matching
                        if len(heading["text"]) > 4 and len(line) > 4:
                            # Simple fuzzy match: is 50%+ of heading text in this line?
                            heading_words = re.findall(r'\b\w+\b', heading["text"].lower())
                            line_words = re.findall(r'\b\w+\b', line.lower())
                            common_words = [w for w in heading_words if w in line_words]
                            
                            if common_words and len(common_words) / len(heading_words) > 0.5:
                                line_idx = i
                                break
            
            if line_idx >= 0:
                synthetic_headings[line_idx] = heading
    
    section_id = 0  # For generating unique section IDs
    list_id = 0     # For generating unique list IDs
    
    # Detect sections, lists, and paragraphs
    for i, line in enumerate(normalized_lines):
        stripped_line = line.strip()
        
        # Skip processing if line is empty
        if not stripped_line:
            # End current paragraph if we have one
            if paragraph:
                structure["paragraphs"].append({
                    "text": " ".join(paragraph),
                    "line_start": i - len(paragraph),
                    "line_end": i - 1
                })
                paragraph = []
            continue
        
        # Check for document features
        if i < 20 and abstract_pattern.match(stripped_line):
            structure["metadata"]["has_abstract"] = True
        if i > len(normalized_lines) * 0.75 and reference_pattern.match(stripped_line):
            structure["metadata"]["has_references"] = True
        if i < 30 and toc_pattern.match(stripped_line):
            structure["metadata"]["has_toc"] = True
        
        # Check if line is a section heading
        is_heading = False
        
        # First check regex patterns
        for pattern in section_patterns:
            match = pattern.match(stripped_line)
            if match:
                # Save previous section if it exists
                if current_section["title"] and current_section["content"]:
                    structure["sections"].append(current_section)
                
                # Start new section
                section_id += 1
                prefix = match.group(1) if match.group(1) else ""
                title = match.group(2) if match.group(2) else prefix
                
                # Determine level from prefix
                if "." in prefix:
                    # For decimal numbering (e.g., 1.2.3)
                    level = len(prefix.split("."))
                elif prefix.lower().startswith(("chapter", "section")):
                    level = 1
                elif prefix.lower().startswith("appendix"):
                    level = 1
                elif prefix.lower().startswith("part"):
                    level = 1
                elif re.match(r'^\d+$', prefix):
                    level = 1
                else:
                    # Common unnumbered sections usually level 1
                    level = 1
                
                current_section = {
                    "id": f"section-{section_id}",
                    "title": stripped_line,
                    "clean_title": title.strip() if title else stripped_line,
                    "level": level,
                    "prefix": prefix,
                    "content": [],
                    "line_number": i,
                    "content_word_count": 0
                }
                
                # Add to TOC for UI navigation
                structure["toc"].append({
                    "id": f"section-{section_id}",
                    "title": title.strip() if title else stripped_line,
                    "level": level,
                    "line_number": i
                })
                
                is_heading = True
                break
        
        # Use font-based heading detection as backup
        if not is_heading and i in synthetic_headings:
            heading = synthetic_headings[i]
            
            # Save previous section if it exists
            if current_section["title"] and current_section["content"]:
                structure["sections"].append(current_section)
            
            # Determine heading level from font size
            section_id += 1
            level = 1
            if heading.get("font_size"):
                if heading["font_size"] >= 18:
                    level = 1
                elif heading["font_size"] >= 14:
                    level = 2
                else:
                    level = 3
            
            current_section = {
                "id": f"section-{section_id}",
                "title": stripped_line,
                "clean_title": stripped_line,
                "level": level,
                "prefix": "",
                "content": [],
                "line_number": i,
                "font_size": heading.get("font_size", 0),
                "content_word_count": 0
            }
            
            # Add to TOC
            structure["toc"].append({
                "id": f"section-{section_id}",
                "title": stripped_line,
                "level": level,
                "line_number": i
            })
            
            is_heading = True
        
        # Fallback heading detection for all caps lines that look like headers
        if not is_heading and len(stripped_line) < 100 and len(stripped_line) > 3:
            # Check for all caps with no punctuation inside
            if stripped_line.isupper() and not re.search(r'[.,:;?!]', stripped_line[:-1]):
                # Save previous section if it exists
                if current_section["title"] and current_section["content"]:
                    structure["sections"].append(current_section)
                
                section_id += 1
                level = 2  # Default for detected all-caps headings
                
                current_section = {
                    "id": f"section-{section_id}",
                    "title": stripped_line,
                    "clean_title": stripped_line,
                    "level": level,
                    "prefix": "",
                    "content": [],
                    "line_number": i,
                    "detected_via": "caps_heuristic",
                    "content_word_count": 0
                }
                
                # Add to TOC
                structure["toc"].append({
                    "id": f"section-{section_id}",
                    "title": stripped_line,
                    "level": level,
                    "line_number": i
                })
                
                is_heading = True
        
        if is_heading:
            # End any current paragraph when we hit a heading
            if paragraph:
                structure["paragraphs"].append({
                    "text": " ".join(paragraph),
                    "line_start": i - len(paragraph),
                    "line_end": i - 1
                })
                paragraph = []
            continue
        
        # Check for list items
        is_list_item = False
        list_match = None
        
        for pattern in list_patterns:
            match = pattern.match(stripped_line)
            if match:
                is_list_item = True
                list_match = match
                
                # End any current paragraph
                if paragraph:
                    structure["paragraphs"].append({
                        "text": " ".join(paragraph),
                        "line_start": i - len(paragraph),
                        "line_end": i - 1
                    })
                    paragraph = []
                
                if not in_list:
                    in_list = True
                    list_id += 1
                    list_items = []
                
                # Extract marker and content
                marker = ""
                content = ""
                
                if len(match.groups()) >= 2:
                    marker = match.group(1)
                    content = match.group(2)
                elif len(match.groups()) >= 3:  # For Roman numeral pattern
                    marker = match.group(1) or match.group(2)
                    content = match.group(3) if match.group(3) else stripped_line
                
                # Add item to current list
                list_items.append({
                    "marker": marker,
                    "content": content,
                    "line_number": i
                })
                
                # Also keep raw line in section content
                current_section["content"].append(stripped_line)
                break
        
        # Check if we're ending a list
        if not is_list_item and in_list:
            # Only end the list if this line doesn't look like a continuation
            # of the previous list item (indented or very short)
            if not stripped_line.startswith("    ") and len(stripped_line) > 20:
                in_list = False
                
                # Save the completed list
                if list_items:
                    # Determine list type
                    list_type = "unordered"
                    if list_items[0]["marker"] and re.match(r'\d+', list_items[0]["marker"]):
                        list_type = "ordered-numeric"
                    elif list_items[0]["marker"] and re.match(r'[a-zA-Z]', list_items[0]["marker"]):
                        list_type = "ordered-alpha"
                    elif list_items[0]["marker"] and re.match(r'[ivxIVX]+', list_items[0]["marker"]):
                        list_type = "ordered-roman"
                    
                    structure["lists"].append({
                        "id": f"list-{list_id}",
                        "items": list_items,
                        "type": list_type,
                        "line_start": list_items[0]["line_number"],
                        "line_end": list_items[-1]["line_number"],
                        "section_id": current_section["id"]
                    })
                
                list_items = []
        
        # Regular paragraph content
        if not is_heading and not is_list_item:
            paragraph.append(stripped_line)
            current_section["content"].append(stripped_line)
            
            # Update word count for current section
            word_count_in_line = len(re.findall(r'\b\w+\b', stripped_line))
            current_section["content_word_count"] = current_section.get("content_word_count", 0) + word_count_in_line
    
    # Save the last section
    if current_section["title"]:
        structure["sections"].append(current_section)
    
    # Save the last paragraph
    if paragraph:
        structure["paragraphs"].append({
            "text": " ".join(paragraph),
            "line_start": len(normalized_lines) - len(paragraph),
            "line_end": len(normalized_lines) - 1
        })
    
    # Save the last list
    if in_list and list_items:
        # Determine list type
        list_type = "unordered"
        if list_items[0]["marker"] and re.match(r'\d+', list_items[0]["marker"]):
            list_type = "ordered-numeric"
        elif list_items[0]["marker"] and re.match(r'[a-zA-Z]', list_items[0]["marker"]):
            list_type = "ordered-alpha"
        elif list_items[0]["marker"] and re.match(r'[ivxIVX]+', list_items[0]["marker"]):
            list_type = "ordered-roman"
        
        structure["lists"].append({
            "id": f"list-{list_id}",
            "items": list_items,
            "type": list_type,
            "line_start": list_items[0]["line_number"],
            "line_end": list_items[-1]["line_number"],
            "section_id": current_section["id"]
        })
    
    # Update structure metadata
    structure["metadata"]["section_count"] = len(structure["sections"])
    structure["metadata"]["list_count"] = len(structure["lists"])
    structure["metadata"]["paragraph_count"] = len(structure["paragraphs"])
    structure["metadata"]["estimated_reading_time_mins"] = max(1, int(word_count / 200))  # Avg reading speed
    
    # Calculate average section length if we have sections
    if structure["sections"]:
        total_words = sum(section.get("content_word_count", 0) for section in structure["sections"])
        structure["metadata"]["average_section_length"] = total_words / len(structure["sections"])
    
    # Detect languages (simple heuristic based on common words)
    detected_langs = []
    # English detection (common English words)
    eng_words = ['the', 'and', 'is', 'in', 'to', 'of', 'that', 'for', 'with', 'as']
    eng_count = sum(1 for word in eng_words if re.search(r'\b' + word + r'\b', normalized_text, re.IGNORECASE))
    if eng_count > 5:
        detected_langs.append("en")
    
    # French detection
    fr_words = ['le', 'la', 'les', 'et', 'en', 'un', 'une', 'des', 'est', 'pour']
    fr_count = sum(1 for word in fr_words if re.search(r'\b' + word + r'\b', normalized_text, re.IGNORECASE))
    if fr_count > 5:
        detected_langs.append("fr")
    
    # Spanish detection
    es_words = ['el', 'la', 'los', 'las', 'y', 'en', 'un', 'una', 'es', 'por']
    es_count = sum(1 for word in es_words if re.search(r'\b' + word + r'\b', normalized_text, re.IGNORECASE))
    if es_count > 5:
        detected_langs.append("es")
    
    # German detection
    de_words = ['der', 'die', 'das', 'und', 'in', 'von', 'mit', 'ist', 'für', 'nicht']
    de_count = sum(1 for word in de_words if re.search(r'\b' + word + r'\b', normalized_text, re.IGNORECASE))
    if de_count > 5:
        detected_langs.append("de")
    
    structure["metadata"]["detected_languages"] = detected_langs
    
    # Extract key phrases for the UI display (simple extraction of capitalized phrases)
    key_phrases = []
    phrase_pattern = re.compile(r'\b[A-Z][a-zA-Z\'\-]{3,}(?:\s+[A-Z][a-zA-Z\'\-]{3,}){1,2}\b')
    phrase_matches = phrase_pattern.findall(normalized_text)
    key_phrases = list(set(phrase_matches))[:10]  # Get unique phrases, limit to 10
    structure["metadata"]["key_phrases"] = key_phrases
    
    logger.info(f"Document structure analysis complete. Identified {len(structure['sections'])} sections, " +
                f"{len(structure['lists'])} lists, {len(structure['paragraphs'])} paragraphs.")
    
    return structure

# =============================================================================
# SECTION 10: CHUNKING FUNCTIONS
# =============================================================================

def chunk_document_by_structure(text: str, structure: Dict[str, Any], max_chunk_size: int, overlap: int = 200) -> List[Dict[str, Any]]:
    """
    Chunk a document using its detected structure for optimal semantic chunking.
    Enhanced with memory efficiency optimizations, improved metadata, and guaranteed
    complete content preservation.
    
    Args:
        text: Full document text
        structure: Document structure information
        max_chunk_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks (default: 200)
        
    Returns:
        List[Dict[str, Any]]: List of chunks with metadata
    """
    chunks = []
    sections = structure.get('sections', [])
    
    # Always process full content first, either as a whole or chunked
    # This ensures the complete document is always preserved
    full_content_chunk = {
        "content": text,
        "metadata": {
            "chunk_type": "full_content",
            "sections": ["Full document content"]
        }
    }
    
    # If full content fits within the limit, add it as a single chunk
    if len(text) <= max_chunk_size:
        chunks.append(full_content_chunk)
    else:
        # For larger documents, chunk the full content to ensure it's completely preserved
        logger.info(f"Full content too large ({len(text)} chars), chunking entire document")
        full_text_chunks = chunk_text_by_paragraphs(text, max_chunk_size, overlap)
        
        # Add each chunk with proper metadata identifying it as part of the full content
        for i, chunk_text in enumerate(full_text_chunks):
            chunks.append({
                "content": chunk_text,
                "metadata": {
                    "chunk_type": "full_content_part",
                    "part_index": i + 1,
                    "total_parts": len(full_text_chunks),
                    "sections": ["Full document content (part " + str(i+1) + "/" + str(len(full_text_chunks)) + ")"]
                }
            })
        
        # Log chunking results for monitoring
        logger.info(f"Split full content into {len(full_text_chunks)} parts")
    
    # If no structure detected, fall back to paragraph-based chunking
    if not sections:
        # Only do this if we haven't already chunked the full content
        if not any(chunk.get("metadata", {}).get("chunk_type") in ["full_content", "full_content_part"] for chunk in chunks):
            para_chunks = chunk_text_by_paragraphs(text, max_chunk_size, overlap)
            for i, chunk_text in enumerate(para_chunks):
                chunks.append({
                    "content": chunk_text,
                    "metadata": {
                        "chunk_type": "paragraph_based",
                        "chunk_index": i,
                        "total_chunks": len(para_chunks)
                    }
                })
        return chunks
    
    # Structure-based chunking for better semantic division
    current_chunk = {
        "content": "",
        "metadata": {
            "sections": [],
            "chunk_type": "structure_based"
        }
    }
    
    # Track processed sections for validation
    processed_sections = set()
    
    for i, section in enumerate(sections):
        # Skip empty sections
        if not section.get("title") and not section.get("content"):
            continue
            
        # Mark this section as processed
        section_id = section.get("id", f"section-{i}")
        processed_sections.add(section_id)
        
        section_text = ""
        
        # Add section title with formatting based on level
        if section.get("level", 1) == 1:
            section_text = f"\n\n## {section['title']}\n\n"
        elif section.get("level", 1) == 2:
            section_text = f"\n\n### {section['title']}\n\n"
        else:
            section_text = f"\n\n#### {section['title']}\n\n"
            
        # Add section content
        if section.get("content"):
            if isinstance(section["content"], list):
                section_text += "\n".join(section["content"])
            else:
                section_text += section["content"]
        
        # Check if adding this section would exceed max size
        if len(current_chunk["content"]) + len(section_text) > max_chunk_size:
            # Save the current chunk if it has content
            if current_chunk["content"]:
                chunks.append(current_chunk)
                
            # If the section itself is too large, split it
            if len(section_text) > max_chunk_size:
                # Split large section by paragraphs with overlap
                section_chunks = chunk_text_by_paragraphs(section_text, max_chunk_size, overlap)
                for j, sc in enumerate(section_chunks):
                    chunks.append({
                        "content": sc,
                        "metadata": {
                            "sections": [f"{section.get('clean_title', section.get('title', ''))} (part {j+1}/{len(section_chunks)})"],
                            "chunk_type": "oversized_section",
                            "section_index": i,
                            "section_id": section_id,
                            "part_index": j + 1,
                            "total_parts": len(section_chunks)
                        }
                    })
                
                # Log when splitting an oversized section
                logger.debug(f"Split oversized section '{section.get('title', '')}' into {len(section_chunks)} parts")
            else:
                # Start new chunk with this section
                current_chunk = {
                    "content": section_text,
                    "metadata": {
                        "sections": [section.get("clean_title", section.get("title", ""))],
                        "chunk_type": "structure_based",
                        "section_index": i,
                        "section_id": section_id
                    }
                }
        else:
            # Add section to current chunk
            current_chunk["content"] += section_text
            current_chunk["metadata"]["sections"].append(
                section.get("clean_title", section.get("title", ""))
            )
            # Track section IDs in metadata for easier retrieval
            if "section_ids" not in current_chunk["metadata"]:
                current_chunk["metadata"]["section_ids"] = []
            current_chunk["metadata"]["section_ids"].append(section_id)
    
    # Add the last chunk if not empty
    if current_chunk["content"]:
        chunks.append(current_chunk)
    
    # Check for any missed sections and log warning
    all_section_ids = {section.get("id", f"section-{i}") for i, section in enumerate(sections)}
    missed_sections = all_section_ids - processed_sections
    if missed_sections:
        logger.warning(f"Some sections may have been missed in chunking: {missed_sections}")
    
    # Ensure chunks have consistent metadata
    for i, chunk in enumerate(chunks):
        if "chunk_index" not in chunk["metadata"]:
            chunk["metadata"]["chunk_index"] = i
        if "total_chunks" not in chunk["metadata"]:
            chunk["metadata"]["total_chunks"] = len(chunks)
    
    # Verify we've captured all content
    all_content_length = sum(len(chunk["content"]) for chunk in chunks if chunk["metadata"].get("chunk_type") in 
                             ["full_content", "full_content_part"])
    
    # If we've lost content in the chunking process, add a safety full content chunk
    if all_content_length < len(text) * 0.9 and not any(c["metadata"].get("chunk_type") == "full_content" for c in chunks):
        logger.warning(f"Content loss detected during chunking. Adding safety full content chunks.")
        safety_chunks = chunk_text_by_paragraphs(text, max_chunk_size, overlap)
        for i, sc in enumerate(safety_chunks):
            chunks.append({
                "content": sc,
                "metadata": {
                    "chunk_type": "safety_full_content",
                    "part_index": i + 1,
                    "total_parts": len(safety_chunks),
                    "sections": ["Safety full content backup (part " + str(i+1) + "/" + str(len(safety_chunks)) + ")"]
                }
            })
    
    logger.info(f"Created {len(chunks)} chunks from document structure")
    return chunks

def chunk_text_by_paragraphs(text: str, max_size: int, overlap: int = 200) -> List[str]:
    """
    Chunk text into segments by paragraph boundaries with optimized memory usage.
    Enhanced to handle very large documents efficiently with improved overlap handling.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List[str]: List of text chunks
    """
    # If text fits in a single chunk, return it
    if len(text) <= max_size:
        return [text]
    
    # For very large texts, use a more memory-efficient approach
    if len(text) > 10_000_000:  # 10MB+
        return chunk_large_text(text, max_size, overlap)
    
    # Split text into paragraphs
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    current_chunk = []
    current_size = 0
    
    # Track the content of the last created chunk for overlap
    last_chunk_content = ""
    
    for para in paragraphs:
        para_size = len(para) + 2  # +2 for newlines between paragraphs
        
        # If adding this paragraph would exceed the max size
        if current_size + para_size > max_size:
            # Only save non-empty chunks
            if current_chunk:
                chunk_text = "\n\n".join(current_chunk)
                chunks.append(chunk_text)
                last_chunk_content = chunk_text
                
                # Start a new chunk with overlap from previous chunk if requested
                if overlap > 0:
                    # Calculate overlap from the end of the last chunk
                    overlap_text = last_chunk_content[-min(overlap, len(last_chunk_content)):]
                    
                    # Start new chunk with the overlap text as a preface
                    if overlap_text:
                        current_chunk = [overlap_text]
                        current_size = len(overlap_text)
                    else:
                        current_chunk = []
                        current_size = 0
                else:
                    current_chunk = []
                    current_size = 0
            
            # If the paragraph itself is too large, split it by sentences with overlap
            if para_size > max_size:
                logger.debug(f"Splitting large paragraph of {para_size} chars")
                # Try splitting by sentences first
                sentences = re.split(r'(?<=[.!?])\s+', para)
                
                # If any single sentence is too large, need to split by words
                if any(len(s) > max_size for s in sentences):
                    # Handle very large paragraphs by words
                    words = para.split()
                    word_chunk = []
                    word_size = 0
                    chunk_start_index = 0
                    
                    for i, word in enumerate(words):
                        word_with_space = word + " "
                        if word_size + len(word_with_space) > max_size:
                            # Save current word chunk if it exists
                            if word_chunk:
                                word_text = " ".join(word_chunk)
                                chunks.append(word_text)
                                last_chunk_content = word_text
                                
                                # Calculate word-based overlap for next chunk
                                if overlap > 0:
                                    # Find overlap words from end of last chunk
                                    overlap_size = 0
                                    overlap_word_count = 0
                                    
                                    # Count back words until we reach desired overlap size
                                    for j in range(len(word_chunk) - 1, -1, -1):
                                        overlap_size += len(word_chunk[j]) + 1  # +1 for space
                                        overlap_word_count += 1
                                        if overlap_size >= overlap:
                                            break
                                    
                                    # Determine start index for next chunk with overlap
                                    chunk_start_index = max(0, i - overlap_word_count)
                                    # Reset word chunk with overlap words
                                    word_chunk = words[chunk_start_index:i]
                                    word_size = sum(len(w) + 1 for w in word_chunk)
                                else:
                                    word_chunk = []
                                    word_size = 0
                            else:
                                # A single word is too large, forcefully split it
                                if len(word) > max_size:
                                    # This handles extremely long words by splitting them
                                    for k in range(0, len(word), max_size):
                                        word_segment = word[k:k+max_size]
                                        chunks.append(word_segment)
                                        last_chunk_content = word_segment
                                    
                                    word_chunk = []
                                    word_size = 0
                                else:
                                    # Start with this single word
                                    word_chunk = [word]
                                    word_size = len(word_with_space)
                        else:
                            word_chunk.append(word)
                            word_size += len(word_with_space)
                    
                    # Add any remaining words as the final chunk
                    if word_chunk:
                        word_text = " ".join(word_chunk)
                        chunks.append(word_text)
                        last_chunk_content = word_text
                else:
                    # Process sentence by sentence
                    sentence_chunk = []
                    sentence_size = 0
                    
                    for sentence in sentences:
                        sentence_with_space = sentence + " "
                        if sentence_size + len(sentence_with_space) > max_size:
                            # Save current sentence chunk
                            if sentence_chunk:
                                sentence_text = " ".join(sentence_chunk)
                                chunks.append(sentence_text)
                                last_chunk_content = sentence_text
                                
                                # Add overlap for next chunk if needed
                                if overlap > 0 and len(sentence_text) > 0:
                                    overlap_text = sentence_text[-min(overlap, len(sentence_text)):]
                                    # Start with overlap text if it exists
                                    sentence_chunk = [overlap_text, sentence]
                                    sentence_size = len(overlap_text) + len(sentence_with_space)
                                else:
                                    # Start fresh with current sentence
                                    sentence_chunk = [sentence]
                                    sentence_size = len(sentence_with_space)
                            else:
                                # Start with just this sentence
                                sentence_chunk = [sentence]
                                sentence_size = len(sentence_with_space)
                        else:
                            sentence_chunk.append(sentence)
                            sentence_size += len(sentence_with_space)
                    
                    # Add any remaining sentences
                    if sentence_chunk:
                        sentence_text = " ".join(sentence_chunk)
                        chunks.append(sentence_text)
                        last_chunk_content = sentence_text
            else:
                # Add paragraph to current chunk or start a new one
                # At this point we've already handled the previous chunk
                current_chunk = [para]
                current_size = para_size
        else:
            # Add paragraph to current chunk
            current_chunk.append(para)
            current_size += para_size
    
    # Add the final chunk if there's anything left
    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        chunks.append(chunk_text)
    
    # Log chunk statistics for monitoring
    avg_chunk_size = sum(len(c) for c in chunks) / max(1, len(chunks))
    logger.debug(f"Created {len(chunks)} chunks, average size: {avg_chunk_size:.0f} chars")
    
    # Validate that we're not missing content
    total_chunk_size = sum(len(chunk) for chunk in chunks)
    if total_chunk_size < len(text) * 0.9:  # Allow for some loss due to whitespace normalization
        logger.warning(f"Potential content loss! Original: {len(text)} chars, Chunked: {total_chunk_size} chars")
    
    return chunks

def chunk_large_text(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    Efficiently chunk very large texts (multi-MB) into segments of size max_size.
    Uses minimal memory by processing text in a streaming fashion with improved boundary detection.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List[str]: List of text chunks
    """
    logger.info(f"Using large text chunking for {len(text)} character text")
    chunks = []
    start = 0
    overlap_text = ""
    
    total_chars_processed = 0
    
    while start < len(text):
        # For progress tracking with large texts
        if len(text) > 100_000_000 and total_chars_processed % 10_000_000 < max_size:  # Log every ~10MB
            logger.info(f"Large text chunking progress: {total_chars_processed/len(text)*100:.1f}% complete")
        
        # If remaining text fits in chunk, add it all
        if start + max_size - len(overlap_text) >= len(text):
            chunk_text = overlap_text + text[start:]
            chunks.append(chunk_text)
            total_chars_processed = len(text)  # Mark as complete
            break
            
        end = start + max_size - len(overlap_text)
        
        # Try to find natural break points in descending order of preference
        
        # 1. Try to find a paragraph break (most preferred)
        par_breaks = [
            text.rfind("\n\n\n", start, end),  # Triple newline
            text.rfind("\n\n", start, end),    # Double newline
            text.rfind("\r\n\r\n", start, end) # Windows style paragraph
        ]
        best_par_break = max(par_breaks)
        
        if best_par_break != -1 and best_par_break > start + (max_size // 3):
            # We found a good paragraph break
            chunk_text = overlap_text + text[start:best_par_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_par_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the paragraph break
            start = best_par_break
            # Skip the paragraph break characters
            if text.startswith("\r\n\r\n", start):
                start += 4
            elif text.startswith("\n\n\n", start):
                start += 3
            elif text.startswith("\n\n", start):
                start += 2
            else:
                start += 1  # Safeguard
                
            continue
            
        # 2. Try to find a line break
        line_breaks = [
            text.rfind("\r\n", start, end),  # Windows style
            text.rfind("\n", start, end)     # Unix style
        ]
        best_line_break = max(line_breaks)
        
        if best_line_break != -1 and best_line_break > start + (max_size // 2):
            chunk_text = overlap_text + text[start:best_line_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_line_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the line break
            start = best_line_break
            # Skip the newline characters
            if text.startswith("\r\n", start):
                start += 2
            elif text.startswith("\n", start):
                start += 1
            else:
                start += 1  # Safeguard
                
            continue
            
        # 3. Try to find sentence boundaries
        sent_breaks = [
            text.rfind(". ", start, end),
            text.rfind("? ", start, end),
            text.rfind("! ", start, end),
            text.rfind(".\n", start, end),
            text.rfind("?\n", start, end),
            text.rfind("!\n", start, end),
            text.rfind("...", start, end),
            text.rfind(": ", start, end),
            text.rfind("; ", start, end)
        ]
        
        best_break = max(sent_breaks)
        if best_break != -1 and best_break > start + (max_size // 3):
            # Found a good sentence break
            # Include the punctuation in the current chunk
            punctuation_len = 1
            if text.startswith("...", best_break):
                punctuation_len = 3
                
            chunk_text = overlap_text + text[start:best_break + punctuation_len]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_break + punctuation_len
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the punctuation
            start = best_break + punctuation_len
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
            continue
            
        # 4. Last resort: break on word boundary
        # Start from end and work backwards to find a space
        word_break = end
        while word_break > start and not text[word_break-1].isspace():
            word_break -= 1
            
        if word_break > start + (max_size // 4):  # Ensure we have a reasonable chunk size
            chunk_text = overlap_text + text[start:word_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = word_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer to the next word
            start = word_break
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
        else:
            # Absolute fallback: hard break at max_size (minus overlap)
            logger.warning(f"Forced to use hard break at position {start + max_size - len(overlap_text)}")
            chunk_text = overlap_text + text[start:start + max_size - len(overlap_text)]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = start + max_size - len(overlap_text)
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            start += max_size - len(overlap_text)
    
    # Verification step
    total_output_size = sum(len(chunk) for chunk in chunks)
    expected_size = len(text) + (len(chunks) - 1) * overlap  # Account for overlap
    
    logger.info(f"Large text chunking complete. Created {len(chunks)} chunks with total size: {total_output_size} chars")
    
    # Warn if there's significant content loss
    if total_output_size < len(text) * 0.9:  # Allow for some minor loss due to boundary adjustments
        logger.warning(f"Potential content loss! Original: {len(text)} chars, Chunked: {total_output_size} chars")
    
    return chunks

def prepare_output_data(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prepare the data for output by removing or modifying chunking metadata
    that shouldn't be included in the final JSON file.
    
    Args:
        result: Raw processing result with all data
        
    Returns:
        Dict[str, Any]: Filtered output data ready for writing
    """
    # Create a deep copy to avoid modifying the original
    import copy
    output_data = copy.deepcopy(result)
    
    # Keep only essential chunk data for the full content
    if "chunks" in output_data:
        filtered_chunks = []
        
        # Always preserve at least one chunk with full content
        full_content_found = False
        
        for chunk in output_data["chunks"]:
            # Keep all content chunks, but simplify the metadata
            chunk_type = chunk.get("metadata", {}).get("chunk_type", "")
            
            # If it's a full content chunk or part, keep it with simplified metadata
            if chunk_type in ["full_content", "full_content_part"]:
                # Keep this chunk but simplify its metadata
                simplified_chunk = {
                    "content": chunk["content"],
                    "metadata": {
                        "chunk_type": chunk_type,
                        "document_type": chunk.get("metadata", {}).get("document_type", "unknown")
                    }
                }
                
                # Keep part information for multi-part content
                if chunk_type == "full_content_part":
                    simplified_chunk["metadata"]["part_index"] = chunk["metadata"].get("part_index", 0)
                    simplified_chunk["metadata"]["total_parts"] = chunk["metadata"].get("total_parts", 1)
                
                filtered_chunks.append(simplified_chunk)
                full_content_found = True
        
        # If no full content chunks were found, preserve at least one chunk
        if not full_content_found and output_data["chunks"]:
            # Take first chunk and mark it as full content
            first_chunk = output_data["chunks"][0]
            filtered_chunks.append({
                "content": first_chunk["content"],
                "metadata": {
                    "chunk_type": "preserved_content",
                    "document_type": first_chunk.get("metadata", {}).get("document_type", "unknown"),
                    "note": "Preserved as no full content chunks were found"
                }
            })
        
        # Replace original chunks with filtered version
        output_data["chunks"] = filtered_chunks
    
    # Also filter DocData objects if present
    if "docs_data" in output_data:
        filtered_docs = []
        full_content_found = False
        
        for doc in output_data["docs_data"]:
            chunk_type = doc.get("metadata", {}).get("chunk_type", "")
            
            if chunk_type in ["full_content", "full_content_part"]:
                # Keep only full content docs
                doc_copy = copy.deepcopy(doc)
                
                # Remove chunking-specific fields
                if "is_chunked" in doc_copy:
                    doc_copy["is_chunked"] = False
                
                if "metadata" in doc_copy:
                    # Keep only essential metadata
                    essential_metadata = {
                        "document_type": doc_copy["metadata"].get("document_type", "unknown"),
                        "language": doc_copy["metadata"].get("language", "en"),
                        "page_count": doc_copy["metadata"].get("page_count", 0),
                        "chunk_type": chunk_type
                    }
                    
                    # Add part information for multi-part content
                    if chunk_type == "full_content_part":
                        essential_metadata["part_index"] = doc_copy["metadata"].get("part_index", 0)
                        essential_metadata["total_parts"] = doc_copy["metadata"].get("total_parts", 1)
                    
                    # Add any tables count if available
                    if "tables_count" in doc_copy["metadata"]:
                        essential_metadata["tables_count"] = doc_copy["metadata"]["tables_count"]
                    
                    # Replace with simplified metadata
                    doc_copy["metadata"] = essential_metadata
                
                # Remove chunking fields
                for field in ["chunk_index", "total_chunks"]:
                    if field in doc_copy:
                        del doc_copy[field]
                
                filtered_docs.append(doc_copy)
                full_content_found = True
        
        # If there are no full content docs, preserve at least one
        if not full_content_found and output_data["docs_data"]:
            # Take the first doc and simplify it
            doc_copy = copy.deepcopy(output_data["docs_data"][0])
            
            # Mark as not chunked
            if "is_chunked" in doc_copy:
                doc_copy["is_chunked"] = False
            
            # Simplify metadata
            if "metadata" in doc_copy:
                essential_metadata = {
                    "document_type": doc_copy["metadata"].get("document_type", "unknown"),
                    "language": doc_copy["metadata"].get("language", "en"),
                    "page_count": doc_copy["metadata"].get("page_count", 0),
                    "chunk_type": "preserved_content",
                    "note": "Preserved as no full content docs were found"
                }
                doc_copy["metadata"] = essential_metadata
            
            # Remove chunking fields
            for field in ["chunk_index", "total_chunks"]:
                if field in doc_copy:
                    del doc_copy[field]
            
            filtered_docs.append(doc_copy)
        
        # Replace original docs with filtered version
        output_data["docs_data"] = filtered_docs
    
    # Update processing info to indicate chunking was performed but not included in output
    if "processing_info" in output_data:
        output_data["processing_info"]["chunking_performed"] = True
        output_data["processing_info"]["chunks_in_memory"] = len(result.get("chunks", []))
        output_data["processing_info"]["chunks_in_output"] = len(output_data.get("chunks", []))
    
    return output_data

def chunk_large_text(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    Efficiently chunk very large texts (multi-MB) into segments of size max_size.
    Uses minimal memory by processing text in a streaming fashion with improved boundary detection.
    
    Args:
        text: Text to chunk
        max_size: Maximum chunk size
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List[str]: List of text chunks
    """
    logger.info(f"Using large text chunking for {len(text)} character text")
    chunks = []
    start = 0
    overlap_text = ""
    
    total_chars_processed = 0
    
    while start < len(text):
        # For progress tracking with large texts
        if len(text) > 100_000_000 and total_chars_processed % 10_000_000 < max_size:  # Log every ~10MB
            logger.info(f"Large text chunking progress: {total_chars_processed/len(text)*100:.1f}% complete")
        
        # If remaining text fits in chunk, add it all
        if start + max_size - len(overlap_text) >= len(text):
            chunk_text = overlap_text + text[start:]
            chunks.append(chunk_text)
            total_chars_processed = len(text)  # Mark as complete
            break
            
        end = start + max_size - len(overlap_text)
        
        # Try to find natural break points in descending order of preference
        
        # 1. Try to find a paragraph break (most preferred)
        par_breaks = [
            text.rfind("\n\n\n", start, end),  # Triple newline
            text.rfind("\n\n", start, end),    # Double newline
            text.rfind("\r\n\r\n", start, end) # Windows style paragraph
        ]
        best_par_break = max(par_breaks)
        
        if best_par_break != -1 and best_par_break > start + (max_size // 3):
            # We found a good paragraph break
            chunk_text = overlap_text + text[start:best_par_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_par_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the paragraph break
            start = best_par_break
            # Skip the paragraph break characters
            if text.startswith("\r\n\r\n", start):
                start += 4
            elif text.startswith("\n\n\n", start):
                start += 3
            elif text.startswith("\n\n", start):
                start += 2
            else:
                start += 1  # Safeguard
                
            continue
            
        # 2. Try to find a line break
        line_breaks = [
            text.rfind("\r\n", start, end),  # Windows style
            text.rfind("\n", start, end)     # Unix style
        ]
        best_line_break = max(line_breaks)
        
        if best_line_break != -1 and best_line_break > start + (max_size // 2):
            chunk_text = overlap_text + text[start:best_line_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_line_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the line break
            start = best_line_break
            # Skip the newline characters
            if text.startswith("\r\n", start):
                start += 2
            elif text.startswith("\n", start):
                start += 1
            else:
                start += 1  # Safeguard
                
            continue
            
        # 3. Try to find sentence boundaries
        sent_breaks = [
            text.rfind(". ", start, end),
            text.rfind("? ", start, end),
            text.rfind("! ", start, end),
            text.rfind(".\n", start, end),
            text.rfind("?\n", start, end),
            text.rfind("!\n", start, end),
            text.rfind("...", start, end),
            text.rfind(": ", start, end),
            text.rfind("; ", start, end)
        ]
        
        best_break = max(sent_breaks)
        if best_break != -1 and best_break > start + (max_size // 3):
            # Found a good sentence break
            # Include the punctuation in the current chunk
            punctuation_len = 1
            if text.startswith("...", best_break):
                punctuation_len = 3
                
            chunk_text = overlap_text + text[start:best_break + punctuation_len]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = best_break + punctuation_len
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer past the punctuation
            start = best_break + punctuation_len
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
            continue
            
        # 4. Last resort: break on word boundary
        # Start from end and work backwards to find a space
        word_break = end
        while word_break > start and not text[word_break-1].isspace():
            word_break -= 1
            
        if word_break > start + (max_size // 4):  # Ensure we have a reasonable chunk size
            chunk_text = overlap_text + text[start:word_break]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = word_break
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            # Move start pointer to the next word
            start = word_break
            # Skip any whitespace
            while start < len(text) and text[start].isspace():
                start += 1
        else:
            # Absolute fallback: hard break at max_size (minus overlap)
            logger.warning(f"Forced to use hard break at position {start + max_size - len(overlap_text)}")
            chunk_text = overlap_text + text[start:start + max_size - len(overlap_text)]
            chunks.append(chunk_text)
            
            # Update progress tracking
            total_chars_processed = start + max_size - len(overlap_text)
            
            # Prepare overlap for next chunk
            if overlap > 0:
                overlap_text = chunk_text[-min(overlap, len(chunk_text)):]
            else:
                overlap_text = ""
                
            start += max_size - len(overlap_text)
    
    # Verification step
    total_output_size = sum(len(chunk) for chunk in chunks)
    expected_size = len(text) + (len(chunks) - 1) * overlap  # Account for overlap
    
    logger.info(f"Large text chunking complete. Created {len(chunks)} chunks with total size: {total_output_size} chars")
    
    # Warn if there's significant content loss
    if total_output_size < len(text) * 0.9:  # Allow for some minor loss due to boundary adjustments
        logger.warning(f"Potential content loss! Original: {len(text)} chars, Chunked: {total_output_size} chars")
    
    return chunks

def chunk_text_by_tokens(text: str, max_tokens: int, tokenizer=None, overlap_tokens: int = 0) -> List[str]:
    """
    Chunk text by approximate token count, useful for LLM context windows.
    Enhanced with better tokenizer estimation and improved overlap handling.
    
    Args:
        text: Text to chunk
        max_tokens: Maximum number of tokens per chunk
        tokenizer: Optional tokenizer function, defaults to approximate count
        overlap_tokens: Number of tokens to overlap between chunks
        
    Returns:
        List[str]: List of text chunks by token count
    """
    # Default approximate tokenizer with improved heuristics
    if tokenizer is None:
        def default_tokenizer(text):
            # More accurate approximate tokenization:
            # 1. Count words
            words = len(text.split())
            # 2. Count punctuation and special characters
            punctuation = sum(1 for c in text if c in '.,;:!?-+=()[]{}"/\\@#$%^&*<>~`|')
            # 3. Count newlines (each counts as ~1 token)
            newlines = text.count('\n')
            # 4. Estimate based on these factors
            return int(words + punctuation * 0.5 + newlines)
        tokenizer = default_tokenizer
    
    # If text is small enough, return it whole
    token_count = tokenizer(text)
    if token_count <= max_tokens:
        return [text]
    
    # For extremely large texts, use a character-based approach first
    if token_count > max_tokens * 100:  # Arbitrary threshold for very large texts
        logger.info(f"Very large text detected ({token_count} tokens), pre-chunking by characters first")
        # Estimate chars per token for this text
        chars_per_token = len(text) / token_count
        # Pre-chunk by characters to manageable pieces, then process by tokens
        char_chunks = chunk_text_by_paragraphs(text, int(max_tokens * chars_per_token * 1.5))
        
        # Process each character chunk separately
        final_chunks = []
        for char_chunk in char_chunks:
            # Process recursively, but now with a manageable size
            token_chunks = chunk_text_by_tokens(char_chunk, max_tokens, tokenizer, overlap_tokens)
            final_chunks.extend(token_chunks)
        return final_chunks
        
    # Split into paragraphs first for more semantic chunking
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    current_chunk = []
    current_tokens = 0
    last_chunk_text = ""  # For overlap calculation
    
    for para in paragraphs:
        para_tokens = tokenizer(para)
        
        # If a single paragraph is too large, we need to split it further
        if para_tokens > max_tokens:
            # If we have content in the current chunk, add it first
            if current_chunk:
                chunk_text = "\n\n".join(current_chunk)
                chunks.append(chunk_text)
                last_chunk_text = chunk_text
                current_chunk = []
                current_tokens = 0
            
            # Split paragraph by sentences
            sentences = re.split(r'(?<=[.!?])\s+', para)
            sent_chunk = []
            sent_tokens = 0
            
            # To track overlap between sentence chunks
            last_sentence_chunk = ""
            
            for sentence in sentences:
                sentence_tokens = tokenizer(sentence)
                
                # If a single sentence is too large, split by words
                if sentence_tokens > max_tokens:
                    # Add any accumulated sentences first
                    if sent_chunk:
                        sent_text = " ".join(sent_chunk)
                        chunks.append(sent_text)
                        last_sentence_chunk = sent_text
                        sent_chunk = []
                        sent_tokens = 0
                    
                    # Split sentence by spaces (words)
                    words = sentence.split()
                    word_chunk = []
                    word_tokens = 0
                    
                    # For overlap between word chunks
                    last_word_chunk = ""
                    
                    for word in words:
                        word_with_space = word + " "
                        word_token_count = tokenizer(word_with_space)
                        
                        if word_tokens + word_token_count > max_tokens:
                            # Add current word chunk
                            if word_chunk:
                                word_text = " ".join(word_chunk)
                                chunks.append(word_text)
                                last_word_chunk = word_text
                                
                                # Add overlap for next chunk if requested
                                if overlap_tokens > 0:
                                    # Calculate word-based overlap
                                    overlap_words = []
                                    overlap_token_count = 0
                                    
                                    # Add words from the end until we reach desired overlap
                                    for w in reversed(word_chunk):
                                        w_tokens = tokenizer(w + " ")
                                        if overlap_token_count + w_tokens <= overlap_tokens:
                                            overlap_words.insert(0, w)
                                            overlap_token_count += w_tokens
                                        else:
                                            break
                                    
                                    # Start new chunk with these overlap words
                                    word_chunk = overlap_words + [word]
                                    word_tokens = overlap_token_count + word_token_count
                                else:
                                    # Start fresh with this word
                                    word_chunk = [word]
                                    word_tokens = word_token_count
                            else:
                                # A single word exceeds max_tokens, handle specially
                                if len(word) > max_tokens * 4:  # Assuming 4 chars per token average
                                    # For extremely long words, split by characters
                                    logger.warning(f"Extremely long word found ({len(word)} chars), splitting by characters")
                                    char_chunks = [word[i:i+max_tokens*4] for i in range(0, len(word), max_tokens*4)]
                                    for i, char_chunk in enumerate(char_chunks):
                                        chunks.append(char_chunk)
                                        if i < len(char_chunks) - 1 and overlap_tokens > 0:
                                            # Add character-based overlap
                                            overlap_chars = min(len(char_chunk), int(overlap_tokens * 4))
                                            last_word_chunk = char_chunk[-overlap_chars:]
                                else:
                                    # For normal long words, keep them whole even if they exceed limit
                                    chunks.append(word)
                                    last_word_chunk = word
                                
                                word_chunk = []
                                word_tokens = 0
                        else:
                            word_chunk.append(word)
                            word_tokens += word_token_count
                    
                    # Add any remaining words
                    if word_chunk:
                        word_text = " ".join(word_chunk)
                        chunks.append(word_text)
                        last_word_chunk = word_text
                
                # If adding this sentence would exceed max tokens
                elif sent_tokens + sentence_tokens > max_tokens:
                    # Add the current sentence chunk
                    sent_text = " ".join(sent_chunk)
                    chunks.append(sent_text)
                    last_sentence_chunk = sent_text
                    
                    # Add overlap for next chunk if requested
                    if overlap_tokens > 0 and sent_chunk:
                        # Calculate sentence-based overlap
                        overlap_sentences = []
                        overlap_token_count = 0
                        
                        # Add sentences from the end until we reach desired overlap
                        for s in reversed(sent_chunk):
                            s_tokens = tokenizer(s + " ")
                            if overlap_token_count + s_tokens <= overlap_tokens:
                                overlap_sentences.insert(0, s)
                                overlap_token_count += s_tokens
                            else:
                                break
                        
                        # Start new chunk with these overlap sentences and the current sentence
                        sent_chunk = overlap_sentences + [sentence]
                        sent_tokens = overlap_token_count + sentence_tokens
                    else:
                        # Start fresh with this sentence
                        sent_chunk = [sentence]
                        sent_tokens = sentence_tokens
                else:
                    # Add sentence to current chunk
                    sent_chunk.append(sentence)
                    sent_tokens += sentence_tokens
            
            # Add any remaining sentences
            if sent_chunk:
                sent_text = " ".join(sent_chunk)
                chunks.append(sent_text)
                last_sentence_chunk = sent_text
                
        # If adding this paragraph would exceed max tokens
        elif current_tokens + para_tokens > max_tokens:
            # Add the current chunk
            chunk_text = "\n\n".join(current_chunk)
            chunks.append(chunk_text)
            last_chunk_text = chunk_text
            
            # Start a new chunk with overlap if requested
            if overlap_tokens > 0 and current_chunk:
                # Calculate paragraph-based overlap
                overlap_paragraphs = []
                overlap_token_count = 0
                
                # Add paragraphs from the end until we reach desired overlap
                for p in reversed(current_chunk):
                    p_tokens = tokenizer(p)
                    if overlap_token_count + p_tokens <= overlap_tokens:
                        overlap_paragraphs.insert(0, p)
                        overlap_token_count += p_tokens
                    else:
                        # If a paragraph is too large for complete overlap,
                        # split it and take the end portion
                        remaining_tokens = overlap_tokens - overlap_token_count
                        if remaining_tokens > 0:
                            # Estimate characters based on tokens
                            char_ratio = len(p) / p_tokens
                            char_count = int(remaining_tokens * char_ratio)
                            # Take the end portion of the paragraph
                            partial_p = p[-min(char_count, len(p)):]
                            overlap_paragraphs.insert(0, partial_p)
                            overlap_token_count += remaining_tokens
                        break
                
                # Start new chunk with overlap material and the current paragraph
                current_chunk = overlap_paragraphs + [para]
                current_tokens = overlap_token_count + para_tokens
            else:
                # Start fresh with this paragraph
                current_chunk = [para]
                current_tokens = para_tokens
        else:
            # Add paragraph to current chunk
            current_chunk.append(para)
            current_tokens += para_tokens
    
    # Add the final chunk if there's anything left
    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        chunks.append(chunk_text)
    
    # Verify chunk sizes are within limits
    for i, chunk in enumerate(chunks):
        chunk_tokens = tokenizer(chunk)
        if chunk_tokens > max_tokens * 1.1:  # Allow 10% overflow
            logger.warning(f"Chunk {i} exceeds token limit: {chunk_tokens} > {max_tokens} tokens")
    
    # Log statistics
    if chunks:
        avg_tokens = sum(tokenizer(c) for c in chunks) / len(chunks)
        logger.debug(f"Created {len(chunks)} token-based chunks, average tokens per chunk: {avg_tokens:.0f}")
    
    return chunks

# -----------------------------------------------------------------------------
# SECTION 11: MAIN PDF PROCESSING FUNCTIONS
# -----------------------------------------------------------------------------

def process_pdf(pdf_path: str, output_path: str = None, max_chunk_size: int = 4096, 
                extract_tables: bool = True, use_ocr: bool = True, 
                return_data: bool = False, timeout: int = 300) -> Optional[Dict[str, Any]]:
    """
    Process a PDF file with comprehensive extraction capabilities and robust error handling.
    Enhanced to ensure all content is properly chunked and preserved.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Path to output JSON file (if None, derives from input filename)
        max_chunk_size: Maximum size of text chunks
        extract_tables: Whether to extract tables (for PDFs)
        use_ocr: Whether to use OCR for scanned content
        return_data: Whether to return processed data
        timeout: Processing timeout in seconds (0 for no timeout)
        
    Returns:
        Dictionary with processed data if return_data=True, otherwise None
    """
    import time
    import json
    import threading
    import sys
    
    # Start tracking processing time
    start_time = time.time()
    
    # Validate PDF path - Enhanced error reporting
    try:
        pdf_path = validate_path(pdf_path)
    except (FileNotFoundError, PermissionError, ValueError) as e:
        logger.error(f"PDF validation error: {e}")
        if return_data:
            return {"error": str(e), "status": "error", "file_path": pdf_path}
        return None
    
    # Generate output path if not provided
    if not output_path:
        output_path = create_output_path(pdf_path)
    else:
        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir:
            ensure_directory_exists(output_dir)
    
    # Initialize result structure with enhanced metadata
    result = {
        "source_file": pdf_path,
        "output_file": output_path,
        "processing_info": {
            "start_time": datetime.now().isoformat(),
            "extract_tables": extract_tables,
            "use_ocr": use_ocr,
            "max_chunk_size": max_chunk_size,
            "libraries": {
                "pymupdf": USE_FITZ,
                "pypdf2": USE_PYPDF2,
                "pdfplumber": USE_PDFPLUMBER,
                "tabula": USE_TABULA,
                "ocr": USE_OCR
            }
        },
        "metadata": {},
        "structure": {},
        "chunks": [],
        "tables": [],
        "references": [],
        "has_scanned_content": False,
        "document_type": None,
        "status": "success",
        "page_count": 0,
        "full_text": ""  # Store full text for compatibility
    }
    
    # Track resources that need to be closed
    result["_resources_to_close"] = []
    
    # Setup timeout handling with event-based cancellation
    timeout_occurred = False
    processing_cancelled = threading.Event()
    
    def handle_timeout():
        nonlocal timeout_occurred
        timeout_occurred = True
        processing_cancelled.set()
        elapsed = time.time() - start_time
        logger.warning(f"PDF processing timeout after {elapsed:.2f} seconds: {pdf_path}")
        result["processing_info"]["timeout"] = True
        result["processing_info"]["elapsed_seconds"] = elapsed
        result["status"] = "timeout"
    
    # Setup timeout checking with Thread
    timeout_thread = None
    if timeout > 0:
        def check_timeout():
            while not processing_cancelled.is_set():
                if time.time() - start_time > timeout:
                    handle_timeout()
                    break
                time.sleep(1)  # Check every second
        
        timeout_thread = threading.Thread(target=check_timeout, daemon=True)
        timeout_thread.start()
    
    try:
        # Step 1: Detect document type for specialized processing
        try:
            doc_type = detect_document_type(pdf_path)
            result["document_type"] = doc_type
            logger.info(f"Detected document type: {doc_type} for {pdf_path}")
        except Exception as e:
            logger.warning(f"Failed to detect document type: {e}")
            doc_type = "general"
            result["document_type"] = doc_type
        
        # Check cancellation
        if processing_cancelled.is_set():
            raise InterruptedError("Processing timeout occurred")
        
        # Step 2: Extract text and basic structure
        logger.info(f"Extracting text from {pdf_path}")
        extracted_data = extract_text_from_pdf(pdf_path)
        
        # Check if extraction succeeded
        if not extracted_data or not extracted_data.get("full_text") or len(extracted_data.get("full_text", "").strip()) < 100:
            # If standard extraction failed and the document might be scanned
            if use_ocr and (not extracted_data or extracted_data.get("has_scanned_content") or 
                           (extracted_data.get("full_text") and len(extracted_data.get("full_text", "").strip()) < 100)):
                logger.info(f"Attempting OCR on {pdf_path}")
                ocr_result = process_scanned_pdf(pdf_path)
                if ocr_result and ocr_result.get("text") and len(ocr_result["text"].strip()) > 100:
                    # Replace or supplement extracted text with OCR result
                    if not extracted_data:
                        extracted_data = {
                            "full_text": ocr_result["text"],
                            "has_scanned_content": True,
                            "extraction_method": "ocr",
                            "page_count": ocr_result.get("pages_processed", 0)
                        }
                    else:
                        # Combine OCR with any text already extracted
                        if extracted_data.get("full_text"):
                            # If existing text is very minimal, replace it completely
                            if len(extracted_data["full_text"].strip()) < 100:
                                extracted_data["full_text"] = ocr_result["text"]
                            else:
                                # Otherwise supplement with OCR text
                                extracted_data["full_text"] += "\n\n[OCR TEXT]\n" + ocr_result["text"]
                        else:
                            extracted_data["full_text"] = ocr_result["text"]
                            
                        extracted_data["ocr_confidence"] = ocr_result.get("confidence", 0)
                        extracted_data["extraction_method"] = f"{extracted_data.get('extraction_method', 'unknown')}+ocr"
                        
                    logger.info(f"OCR successfully extracted text from {pdf_path}")
                else:
                    logger.warning(f"OCR failed to extract usable text from {pdf_path}")
        
        # Update results with extraction data
        if extracted_data:
            result["metadata"] = extracted_data.get("metadata", {})
            result["has_scanned_content"] = extracted_data.get("has_scanned_content", False)
            result["page_count"] = extracted_data.get("page_count", 0)
            result["structure"] = extracted_data.get("structure", {})
            result["extraction_method"] = extracted_data.get("extraction_method", "unknown")
            result["full_text"] = extracted_data.get("full_text", "")
            
            # Record extraction time
            result["processing_info"]["extraction_time"] = extracted_data.get("extraction_time", 0)
            
            # Check for cancellation
            if processing_cancelled.is_set():
                raise InterruptedError("Processing timeout occurred")
        else:
            # No text could be extracted
            logger.error(f"Failed to extract any usable text from {pdf_path}")
            result["status"] = "error"
            result["error"] = "No text could be extracted from the PDF"
            
            if return_data:
                return result
            save_results(result, output_path)
            return None
        
        # Step 3: Extract tables if requested and appropriate
        if extract_tables and doc_type not in ["scan"]:  # Don't waste time on scanned docs
            try:
                logger.info(f"Extracting tables from {pdf_path}")
                tables = extract_tables_from_pdf(pdf_path)
                result["tables"] = tables
                logger.info(f"Extracted {len(tables)} tables from {pdf_path}")
            except Exception as e:
                logger.warning(f"Table extraction failed: {e}")
                result["processing_info"]["table_extraction_error"] = str(e)
            
            # Check for cancellation
            if processing_cancelled.is_set():
                raise InterruptedError("Processing timeout occurred")
        
        # Step 4: Extract references if it's an academic paper
        if doc_type == "academic_paper" and extracted_data and extracted_data.get("full_text"):
            try:
                logger.info(f"Extracting references from {pdf_path}")
                references = extract_references(extracted_data["full_text"])
                result["references"] = references
                logger.info(f"Extracted {len(references)} references from {pdf_path}")
            except Exception as e:
                logger.warning(f"Reference extraction failed: {e}")
                result["processing_info"]["reference_extraction_error"] = str(e)
            
            # Check for cancellation
            if processing_cancelled.is_set():
                raise InterruptedError("Processing timeout occurred")
        
        # Step 5: Analyze document structure for better chunking
        full_text = extracted_data.get("full_text", "")
        if full_text:
            try:
                logger.info(f"Analyzing document structure for {pdf_path}")
                structure = identify_document_structure(
                    full_text, 
                    extracted_data.get("structure", {}).get("headings", [])
                )
                result["structure"] = structure
            except Exception as e:
                logger.warning(f"Structure analysis failed: {e}")
                result["processing_info"]["structure_analysis_error"] = str(e)
                structure = None
            
            # Check for cancellation
            if processing_cancelled.is_set():
                raise InterruptedError("Processing timeout occurred")
            
            # Step 6: Create chunks based on structure using enhanced chunking
            try:
                logger.info(f"Creating chunks for {pdf_path}")
                if structure and structure.get("sections"):
                    chunks = chunk_document_by_structure(full_text, structure, max_chunk_size)
                else:
                    # Use paragraph-based chunking as fallback
                    chunks = []
                    para_chunks = chunk_text_by_paragraphs(full_text, max_chunk_size)
                    for i, chunk_text in enumerate(para_chunks):
                        chunks.append({
                            "content": chunk_text,
                            "metadata": {
                                "chunk_type": "paragraph_based",
                                "chunk_index": i,
                                "total_chunks": len(para_chunks)
                            }
                        })
                
                # Ensure full content is always included
                has_full_content = any(
                    chunk.get("metadata", {}).get("chunk_type") == "full_content" 
                    for chunk in chunks
                )
                
                if not has_full_content and len(full_text) <= max_chunk_size * 2:
                    # Add a full content chunk if it's not too large
                    chunks.insert(0, {
                        "content": full_text,
                        "metadata": {
                            "chunk_type": "full_content",
                            "sections": ["Full document content"]
                        }
                    })
                
                # Add metadata to chunks
                for i, chunk in enumerate(chunks):
                    # If chunk is just a string, convert to dict format
                    if isinstance(chunk, str):
                        chunk = {
                            "content": chunk,
                            "metadata": {
                                "chunk_id": i + 1
                            }
                        }
                    else:
                        # Ensure metadata exists
                        if "metadata" not in chunk:
                            chunk["metadata"] = {}
                        chunk["metadata"]["chunk_id"] = i + 1
                        
                        # Add document type and page information
                        chunk["metadata"]["document_type"] = doc_type
                        chunk["metadata"]["page_count"] = result["page_count"]
                    
                    # Add page range info if available
                    if "structure" in result and "pages" in result["structure"]:
                        # Logic to determine which pages this chunk spans could be added here
                        pass
                    
                    result["chunks"].append(chunk)
                
                logger.info(f"Created {len(result['chunks'])} chunks from {pdf_path}")
                
                # Verify we're not missing any content
                total_content_size = sum(len(chunk.get("content", "")) for chunk in result["chunks"])
                if len(full_text) > 0 and total_content_size < len(full_text) * 0.9:
                    logger.warning(f"Possible content loss during chunking: original={len(full_text)}, chunked={total_content_size}")
                    # Add a backup full content chunk if needed
                    if len(full_text) <= max_chunk_size * 3:  # Only if manageable
                        logger.info("Adding backup full content chunk")
                        result["chunks"].append({
                            "content": full_text,
                            "metadata": {
                                "chunk_type": "full_content_backup",
                                "chunk_id": len(result["chunks"]) + 1,
                                "document_type": doc_type,
                                "note": "Added as content backup"
                            }
                        })
                
            except Exception as e:
                logger.warning(f"Chunking failed: {e}")
                result["processing_info"]["chunking_error"] = str(e)
                
                # Even if chunking fails, ensure we have at least the full content
                if full_text and not result["chunks"]:
                    logger.info("Adding emergency full content after chunking failure")
                    # Split if needed
                    if len(full_text) > max_chunk_size:
                        parts = [full_text[i:i+max_chunk_size] for i in range(0, len(full_text), max_chunk_size)]
                        for i, part in enumerate(parts):
                            result["chunks"].append({
                                "content": part,
                                "metadata": {
                                    "chunk_type": "emergency_content_part",
                                    "chunk_id": i + 1,
                                    "total_parts": len(parts),
                                    "document_type": doc_type,
                                    "note": "Emergency fallback after chunking failure"
                                }
                            })
                    else:
                        result["chunks"].append({
                            "content": full_text,
                            "metadata": {
                                "chunk_type": "emergency_content",
                                "chunk_id": 1,
                                "document_type": doc_type,
                                "note": "Emergency fallback after chunking failure"
                            }
                        })
        
        # Final processing steps
        result["processing_info"]["end_time"] = datetime.now().isoformat()
        result["processing_info"]["elapsed_seconds"] = time.time() - start_time
        result["processing_info"]["success"] = True
        
        # Save results to output file - include error handling
        if output_path:
            try:
                # Save the processed output - this now uses prepare_output_data internally
                save_results(result, output_path)
                logger.info(f"Saved processed PDF results to {output_path}")
            except Exception as save_error:
                logger.error(f"Error saving results: {save_error}")
                result["processing_info"]["save_error"] = str(save_error)
                
                # Emergency save attempt with simplified content
                try:
                    logger.info("Attempting emergency save with simplified content")
                    emergency_path = f"{output_path}.emergency.json"
                    emergency_data = {
                        "source_file": pdf_path,
                        "metadata": result.get("metadata", {}),
                        "document_type": result.get("document_type", "unknown"),
                        "extraction_method": result.get("extraction_method", "unknown"),
                        "processing_info": result.get("processing_info", {}),
                        "error": str(save_error),
                        "full_text_sample": result.get("full_text", "")[:10000] + "..." # First 10K chars
                    }
                    with open(emergency_path, "w", encoding="utf-8") as f:
                        json.dump(emergency_data, f, ensure_ascii=False, indent=2)
                    logger.info(f"Emergency save succeeded: {emergency_path}")
                except Exception as emergency_err:
                    logger.error(f"Emergency save also failed: {emergency_err}")
        
        # Return full data if requested, otherwise None
        return result if return_data else None
        
    except InterruptedError as timeout_err:
        # Handle timeout gracefully
        logger.warning(f"PDF processing interrupted: {timeout_err}")
        
        result["status"] = "timeout"
        result["processing_info"]["end_time"] = datetime.now().isoformat()
        result["processing_info"]["elapsed_seconds"] = time.time() - start_time
        result["processing_info"]["success"] = False
        result["processing_info"]["error"] = str(timeout_err)
        
        # Save partial results
        if output_path:
            try:
                save_results(result, output_path)
                logger.info(f"Saved partial results due to timeout to {output_path}")
            except Exception as save_error:
                logger.error(f"Error saving partial results: {save_error}")
        
        if return_data:
            return result
        return None
        
    except Exception as e:
        logger.error(f"PDF processing error: {e}", exc_info=True)
        
        # Create detailed error report
        result["status"] = "error"
        result["processing_info"]["end_time"] = datetime.now().isoformat()
        result["processing_info"]["elapsed_seconds"] = time.time() - start_time
        result["processing_info"]["success"] = False
        result["processing_info"]["error"] = str(e)
        result["processing_info"]["traceback"] = traceback.format_exc()
        
        # Try to save extracted content if available
        if not result.get("full_text") and "extracted_data" in locals() and extracted_data and extracted_data.get("full_text"):
            result["full_text"] = extracted_data["full_text"]
            
        # Save error report with whatever data was gathered
        if output_path:
            try:
                save_results(result, output_path)
                logger.info(f"Saved error report to {output_path}")
            except Exception as save_error:
                logger.error(f"Error saving error report: {save_error}")
        
        if return_data:
            return result
        return None
        
    finally:
        # Clean up resources and stop background processes
        try:
            # Stop timeout checking thread
            if timeout_thread and timeout_thread.is_alive():
                processing_cancelled.set()
                # Join with timeout to avoid hanging if thread doesn't terminate
                timeout_thread.join(0.5)  
                if timeout_thread.is_alive():
                    logger.warning(f"Timeout thread for {pdf_path} did not terminate gracefully")
            
            # Record final processing duration regardless of success/failure
            total_duration = time.time() - start_time
            if "processing_info" in result:
                result["processing_info"]["total_duration"] = total_duration
                
            # Log completion status
            if result.get("status") == "success":
                logger.info(f"PDF processing completed successfully in {total_duration:.2f}s: {pdf_path}")
            elif result.get("status") == "timeout":
                logger.warning(f"PDF processing timed out after {total_duration:.2f}s: {pdf_path}")
            else:
                logger.error(f"PDF processing failed after {total_duration:.2f}s: {pdf_path}")
                
            # Close any open resources
            for resource in result.pop("_resources_to_close", []):
                try:
                    if hasattr(resource, 'close'):
                        resource.close()
                except Exception as close_err:
                    logger.debug(f"Error closing resource: {close_err}")
                    
            # Return memory to system if large document was processed
            if sys.getsizeof(result.get("full_text", "")) > 10_000_000:  # 10MB
                logger.debug(f"Large document processed, suggesting garbage collection")
                result["full_text"] = result.get("full_text", "")[:1000] + "..." # Keep only summary in memory
                try:
                    import gc
                    gc.collect()
                except Exception:
                    pass
                    
            # Log memory usage if available
            try:
                import psutil
                process = psutil.Process()
                memory_info = process.memory_info()
                logger.debug(f"Memory usage after processing {pdf_path}: {memory_info.rss / (1024*1024):.1f} MB")
            except ImportError:
                pass
                
        except Exception as cleanup_err:
            # Even if cleanup fails, don't affect the main flow
            logger.warning(f"Error during cleanup: {cleanup_err}")

def save_results(result: Dict[str, Any], output_path: str) -> None:
    """
    Save processing results to a JSON file with robust error handling.
    Uses output preparation to filter chunking metadata for cleaner output.
    
    Args:
        result: Raw processing result with all data
        output_path: Path where to save the output JSON
    """
    try:
        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        # Prepare data for output by filtering out chunking metadata
        output_data = prepare_output_data(result)
        
        # Check if file is already being written
        if os.path.exists(output_path):
            # Create a backup copy just in case
            backup_path = f"{output_path}.bak"
            try:
                import shutil
                shutil.copy2(output_path, backup_path)
            except Exception as backup_err:
                logger.debug(f"Could not create backup: {backup_err}")
        
        # Save to temporary file first, then rename for atomicity
        temp_path = f"{output_path}.tmp"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        # Verify the file was written successfully
        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 10:
            # Replace the original file with the temporary file
            if os.path.exists(output_path):
                os.replace(temp_path, output_path)  # Atomic on most platforms
            else:
                os.rename(temp_path, output_path)
            logger.info(f"Successfully saved results to {output_path}")
        else:
            logger.error(f"Failed to write complete data to temporary file: {temp_path}")
            raise IOError(f"Failed to write data to {temp_path}")
            
    except Exception as e:
        logger.error(f"Error saving results to {output_path}: {e}")
        
        # Try saving to a temp location as fallback
        try:
            import tempfile
            temp_dir = tempfile.gettempdir()
            filename = os.path.basename(output_path)
            temp_path = os.path.join(temp_dir, f"pdf_extract_{int(time.time())}_{filename}")
            
            # Save emergency version with at least the metadata
            emergency_data = {
                "metadata": result.get("metadata", {}),
                "processing_info": result.get("processing_info", {}),
                "error": str(e),
                "error_time": datetime.now().isoformat()
            }
            
            # Add document type if available
            if "document_type" in result:
                emergency_data["document_type"] = result["document_type"]
            
            # Try to include at least some content
            if "full_text" in result and result["full_text"]:
                emergency_data["full_text"] = result["full_text"]
            elif "chunks" in result and result["chunks"]:
                # Add the first chunk's content
                emergency_data["sample_content"] = result["chunks"][0].get("content", "")
            
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(emergency_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Emergency results saved to temporary location: {temp_path}")
            
        except Exception as temp_err:
            logger.error(f"Failed to save emergency results to temp location: {temp_err}")
            
def batch_process_pdfs(pdf_files: List[str], output_folder: str, extract_tables: bool = True,
                      use_ocr: bool = True, max_chunk_size: int = 4096,
                      max_workers: int = None, timeout: int = 300) -> Dict[str, Any]:
    """
    Process multiple PDF files in batch mode with parallel execution.
    
    Args:
        pdf_files: List of PDF file paths
        output_folder: Folder for JSON outputs
        extract_tables: Whether to extract tables
        use_ocr: Whether to apply OCR for scanned content
        max_chunk_size: Maximum chunk size
        max_workers: Maximum number of parallel workers (None = auto)
        timeout: Timeout per file in seconds
        
    Returns:
        Dict[str, Any]: Batch processing results
    """
    import concurrent.futures
    import multiprocessing
    
    # Ensure output folder exists
    ensure_directory_exists(output_folder)
    
    # Initialize batch results
    batch_results = {
        "start_time": datetime.now().isoformat(),
        "total_files": len(pdf_files),
        "processed_files": 0,
        "failed_files": 0,
        "results": [],
        "output_folder": output_folder
    }
    
    # Determine number of workers
    if max_workers is None:
        # Use half the available cores, but at least 1 and at most 4
        max_workers = max(1, min(4, multiprocessing.cpu_count() // 2))
    
    logger.info(f"Starting batch processing of {len(pdf_files)} PDFs with {max_workers} workers")
    
    # Use a lock for thread-safe updates to batch_results
    from threading import Lock
    results_lock = Lock()
    
    # Process a single PDF file and update batch results
    def process_single_pdf(pdf_file):
        try:
            # Generate output filename
            base_name = os.path.splitext(os.path.basename(pdf_file))[0]
            output_path = os.path.join(output_folder, f"{base_name}_processed.json")
            
            # Process the PDF
            result = process_pdf(
                pdf_path=pdf_file,
                output_path=output_path,
                extract_tables=extract_tables,
                use_ocr=use_ocr,
                max_chunk_size=max_chunk_size,
                return_data=True,  # Need data for metrics
                timeout=timeout
            )
            
            # Create result entry
            file_result = {
                "pdf_file": pdf_file,
                "output_file": output_path,
                "success": False,
                "elapsed_seconds": 0
            }
            
            if result:
                # Extract success information and metrics
                file_result["success"] = result.get("status") == "success"
                file_result["status"] = result.get("status", "unknown")
                file_result["document_type"] = result.get("document_type", "unknown")
                file_result["page_count"] = result.get("page_count", 0)
                file_result["chunks_count"] = len(result.get("chunks", []))
                file_result["tables_count"] = len(result.get("tables", []))
                file_result["references_count"] = len(result.get("references", []))
                file_result["elapsed_seconds"] = result.get("processing_info", {}).get("elapsed_seconds", 0)
                
                if not file_result["success"]:
                    file_result["error"] = result.get("processing_info", {}).get("error", "Unknown error")
                
                # Update batch results atomically
                with results_lock:
                    if file_result["success"]:
                        batch_results["processed_files"] += 1
                    else:
                        batch_results["failed_files"] += 1
                    batch_results["results"].append(file_result)
            else:
                # No result returned
                file_result["error"] = "No result returned from processor"
                
                with results_lock:
                    batch_results["failed_files"] += 1
                    batch_results["results"].append(file_result)
            
            logger.info(f"Completed processing {pdf_file}: " + 
                       f"{'Success' if file_result['success'] else 'Failed'} " +
                       f"in {file_result['elapsed_seconds']:.2f}s")
            
            return file_result
            
        except Exception as e:
            logger.error(f"Error in batch processing for {pdf_file}: {e}")
            
            # Create error result
            file_result = {
                "pdf_file": pdf_file,
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
            
            # Update batch results atomically
            with results_lock:
                batch_results["failed_files"] += 1
                batch_results["results"].append(file_result)
                
            return file_result
    
    # Process files in parallel with progress tracking
    completed_files = 0
    total_files = len(pdf_files)
    
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_file = {executor.submit(process_single_pdf, pdf_file): pdf_file for pdf_file in pdf_files}
            
            # Process as they complete
            for future in concurrent.futures.as_completed(future_to_file):
                pdf_file = future_to_file[future]
                
                try:
                    # Get result (already handled by the worker function)
                    future.result()
                except Exception as e:
                    logger.error(f"Unhandled exception in worker for {pdf_file}: {e}")
                
                # Update progress
                completed_files += 1
                progress = int(completed_files / total_files * 100)
                logger.info(f"Batch progress: {completed_files}/{total_files} files ({progress}%)")
    
    except Exception as e:
        logger.error(f"Error in batch processing: {e}")
        batch_results["error"] = str(e)
    
    # Finalize batch results
    batch_results["end_time"] = datetime.now().isoformat()
    try:
        batch_results["elapsed_seconds"] = (
            datetime.fromisoformat(batch_results["end_time"]) - 
            datetime.fromisoformat(batch_results["start_time"])
        ).total_seconds()
    except Exception:
        # Fallback if datetime parsing fails
        batch_results["elapsed_seconds"] = time.time() - time.mktime(
            datetime.strptime(batch_results["start_time"].split(".")[0], "%Y-%m-%dT%H:%M:%S").timetuple()
        )
    
    # Add summary statistics
    batch_results["success_rate"] = (batch_results["processed_files"] / 
                                    max(1, batch_results["total_files"]) * 100)
    
    if batch_results["elapsed_seconds"] > 0:
        batch_results["files_per_second"] = batch_results["total_files"] / batch_results["elapsed_seconds"]
    else:
        batch_results["files_per_second"] = 0
    
    # Save batch results
    batch_results_file = os.path.join(output_folder, f"batch_results_{int(time.time())}.json")
    with open(batch_results_file, 'w', encoding='utf-8') as f:
        json.dump(batch_results, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Batch processing complete: " +
               f"{batch_results['processed_files']} succeeded, " +
               f"{batch_results['failed_files']} failed " +
               f"in {batch_results['elapsed_seconds']:.2f}s")
    
    return batch_results

# -----------------------------------------------------------------------------
# SECTION 12: UI INTEGRATION FUNCTIONS
# -----------------------------------------------------------------------------

def get_pdf_summary(pdf_path: str) -> Dict[str, Any]:
    """
    Get a concise summary of a PDF file for display in the NeuroGen UI.
    Enhanced with better error handling and richer metadata extraction.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dict[str, Any]: Summary information
    """
    try:
        # Validate file
        pdf_path = validate_path(pdf_path)
        
        # Get file statistics
        file_size = os.path.getsize(pdf_path)
        file_size_mb = file_size / (1024 * 1024)
        mod_time = os.path.getmtime(pdf_path)
        mod_date = datetime.fromtimestamp(mod_time).strftime("%Y-%m-%d %H:%M:%S")
        
        # Create base summary object
        summary = {
            "pdf_file": pdf_path,
            "file_size": file_size,
            "file_size_mb": round(file_size_mb, 2),
            "last_modified": mod_date,
            "file_name": os.path.basename(pdf_path),
            "success": True
        }
        
        # Try to extract basic information
        try:
            doc_type = detect_document_type(pdf_path)
            summary["document_type"] = doc_type
        except Exception as type_err:
            logger.debug(f"Document type detection failed: {type_err}")
            summary["document_type"] = "unknown"
        
        try:
            basic_data = extract_text_from_pdf(pdf_path)
            
            if basic_data:
                summary.update({
                    "page_count": basic_data.get("page_count", 0),
                    "has_scanned_content": basic_data.get("has_scanned_content", False),
                    "title": basic_data.get("metadata", {}).get("title", os.path.basename(pdf_path)),
                    "author": basic_data.get("metadata", {}).get("author", "Unknown"),
                    "created_date": basic_data.get("metadata", {}).get("creation_date", ""),
                    "extraction_method": basic_data.get("extraction_method", "unknown")
                })
                
                # Extract preview text
                if basic_data.get("full_text"):
                    # Get first few paragraphs
                    paragraphs = re.split(r'\n\s*\n', basic_data["full_text"])
                    preview_text = "\n\n".join(paragraphs[:3]) if paragraphs else ""
                    
                    # Limit to a reasonable size
                    if len(preview_text) > 500:
                        preview_text = preview_text[:497] + "..."
                        
                    summary["preview"] = preview_text
                    
                    # Calculate estimated reading time
                    word_count = len(re.findall(r'\b\w+\b', basic_data["full_text"]))
                    summary["word_count"] = word_count
                    summary["estimated_reading_time_mins"] = max(1, int(word_count / 200))
            else:
                # No extraction data available
                summary["extraction_error"] = "Unable to extract text"
                
        except Exception as extract_err:
            logger.warning(f"Error extracting data from PDF: {extract_err}")
            summary["extraction_error"] = str(extract_err)
        
        # Get table count if available
        try:
            if summary.get("document_type") in ["academic_paper", "report", "book"]:
                tables = extract_tables_from_pdf(pdf_path)
                summary["tables_count"] = len(tables)
        except Exception as table_err:
            logger.debug(f"Table detection failed: {table_err}")
        
        return summary
    except Exception as e:
        logger.error(f"Error generating PDF summary: {e}")
        return {
            "pdf_file": pdf_path,
            "error": str(e),
            "title": os.path.basename(pdf_path),
            "success": False
        }

def handle_pdf_progress_events(pdf_path: str, socketio=None, task_id: str = None) -> Callable:
    """
    Create a progress callback that emits Socket.IO events to update the NeuroGen UI.
    
    Args:
        pdf_path: Path to the PDF being processed
        socketio: Flask SocketIO instance for emitting events
        task_id: Current processing task ID
        
    Returns:
        Callable: Progress callback function to use during processing
    """
    if not socketio or not task_id:
        # Return a dummy callback if we can't emit events
        return lambda current, total, stage: None
    
    # Get file basename for display
    filename = os.path.basename(pdf_path)
    
    # Track last emission time to avoid flooding UI with updates
    last_emit_time = [0]  # Use list for mutable closure
    
    # Define progress callback function
    def progress_callback(current, total, stage):
        # Calculate progress percentage
        progress = min(int((current / max(1, total)) * 100), 99)
        
        # Rate limit emissions to max 5 per second
        current_time = time.time()
        if current_time - last_emit_time[0] < 0.2 and progress < 100:
            return
            
        last_emit_time[0] = current_time
        
        # Build event data
        event_data = {
            "task_id": task_id,
            "file_path": pdf_path,
            "filename": filename,
            "stage": stage,
            "progress": progress,
            "timestamp": current_time
        }
        
        # Add stage-specific details
        if stage == "extracting_text":
            event_data["message"] = f"Extracting text from {filename}"
        elif stage == "processing_tables":
            event_data["message"] = f"Extracting tables from {filename}"
        elif stage == "analyzing_structure":
            event_data["message"] = f"Analyzing document structure"
        elif stage == "ocr_processing":
            event_data["message"] = f"Applying OCR to {filename}"
        elif stage == "creating_chunks":
            event_data["message"] = f"Creating semantic chunks"
        else:
            event_data["message"] = f"Processing {filename}: {stage}"
            
        # Emit the event
        try:
            socketio.emit("pdf_processing_progress", event_data)
        except Exception as e:
            logger.debug(f"Socket emission error: {e}")
    
    return progress_callback

def create_pdf_viewer_data(pdf_path: str, json_path: str = None) -> Dict[str, Any]:
    """
    Create enhanced data for the PDF viewer in the NeuroGen UI.
    
    Args:
        pdf_path: Path to the PDF file
        json_path: Path to processed JSON (if available)
        
    Returns:
        Dict[str, Any]: Structured data for PDF viewer integration
    """
    try:
        # Get basic PDF summary
        summary = get_pdf_summary(pdf_path)
        
        # Initialize viewer-specific fields
        viewer_data = {
            "pdf_file": pdf_path,
            "json_file": json_path,
            "annotation_enabled": False,
            "toc": [],  # Table of contents
            "highlights": [],  # Text highlights
            "searchable": True,
            "viewer_type": "standard"  # or "enhanced" if we have structure data
        }
        
        # Check if processed JSON exists
        if json_path and os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    processed_data = json.load(f)
                    
                # Enhance summary with processed data
                if processed_data:
                    # Update basic information
                    summary.update({
                        "json_file": json_path,
                        "document_type": processed_data.get("document_type", summary.get("document_type")),
                        "tables_count": len(processed_data.get("tables", [])),
                        "references_count": len(processed_data.get("references", [])),
                        "chunks_count": len(processed_data.get("chunks", [])),
                        "extraction_method": processed_data.get("extraction_method", summary.get("extraction_method"))
                    })
                    
                    # Add document structure if available
                    if "structure" in processed_data and processed_data["structure"].get("toc"):
                        viewer_data["toc"] = processed_data["structure"]["toc"]
                        viewer_data["viewer_type"] = "enhanced"
                    elif "structure" in processed_data and processed_data["structure"].get("sections"):
                        # Build TOC from sections
                        toc = []
                        for section in processed_data["structure"]["sections"]:
                            if "title" in section and "id" in section:
                                toc.append({
                                    "id": section["id"],
                                    "title": section.get("clean_title", section["title"]),
                                    "level": section.get("level", 1),
                                    "line_number": section.get("line_number", 0)
                                })
                        viewer_data["toc"] = toc
                        viewer_data["viewer_type"] = "enhanced"
                    
                    # Get a better summary if available
                    if "structure" in processed_data and processed_data["structure"].get("sections"):
                        sections = processed_data["structure"]["sections"]
                        if sections:
                            # Use the first non-abstract section as summary
                            for section in sections:
                                if section.get("title", "").lower() not in ["abstract", "introduction", "title"]:
                                    content = section.get("content", [])
                                    if isinstance(content, list) and content:
                                        summary_text = " ".join(content[:3])  # First 3 content items
                                    else:
                                        summary_text = str(content)[:500]
                                        
                                    if summary_text:
                                        summary["preview"] = summary_text
                                    break
            except Exception as json_err:
                logger.warning(f"Error reading processed JSON: {json_err}")
        
        # Ensure we have a reasonable summary
        if "preview" not in summary or not summary["preview"]:
            summary["preview"] = f"PDF document with {summary.get('page_count', 0)} pages"
        
        # Merge summary with viewer data
        viewer_data.update(summary)
        
        return viewer_data
    except Exception as e:
        logger.error(f"Error creating PDF viewer data: {e}")
        return {
            "pdf_file": pdf_path,
            "json_file": json_path,
            "error": str(e),
            "title": os.path.basename(pdf_path),
            "preview": "Error loading PDF information",
            "success": False,
            "viewer_type": "standard"
        }

def get_pdf_extraction_status(pdf_path: str, json_path: str = None) -> Dict[str, Any]:
    """
    Check the extraction status of a PDF file, useful for the NeuroGen UI to display
    processing state and enable/disable features.
    
    Args:
        pdf_path: Path to the PDF file
        json_path: Path to processed JSON (if available)
    
    Returns:
        Dict[str, Any]: Status information
    """
    status = {
        "pdf_file": pdf_path,
        "json_file": json_path,
        "exists": os.path.exists(pdf_path),
        "processed": False,
        "processing_complete": False,
        "has_tables": False,
        "has_references": False,
        "has_chunks": False,
        "searchable": False,
        "needs_ocr": False,
        "error": None
    }
    
    # Check if PDF exists
    if not status["exists"]:
        status["error"] = "PDF file not found"
        return status
    
    # Check if processed JSON exists
    if json_path and os.path.exists(json_path):
        status["processed"] = True
        
        try:
            # Check json for completeness
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if data:
                status["processing_complete"] = data.get("status") == "success"
                status["has_tables"] = len(data.get("tables", [])) > 0
                status["has_references"] = len(data.get("references", [])) > 0
                status["has_chunks"] = len(data.get("chunks", [])) > 0
                status["searchable"] = bool(data.get("full_text"))
                status["has_error"] = data.get("status") == "error"
                status["document_type"] = data.get("document_type", "unknown")
                
                if status["has_error"]:
                    status["error"] = data.get("processing_info", {}).get("error", "Unknown error")
                
                # Check if OCR might be needed
                status["needs_ocr"] = data.get("has_scanned_content", False)
        except Exception as e:
            status["error"] = f"Error reading processed JSON: {str(e)}"
            status["processing_complete"] = False
    
    # If not processed, try to detect if OCR might be needed
    if not status["processed"]:
        try:
            doc_type = detect_document_type(pdf_path)
            status["document_type"] = doc_type
            
            # If it's a scan, it likely needs OCR
            status["needs_ocr"] = doc_type == "scan"
        except Exception:
            # If we can't detect, assume might need OCR to be safe
            status["needs_ocr"] = True
    
    return status

# -----------------------------------------------------------------------------
# SECTION 13: COMMAND-LINE AND API INTERFACES
# -----------------------------------------------------------------------------

def create_api_handlers(app=None, socketio=None):
    """
    Create API handlers for Flask integration with NeuroGen Processor.
    
    Args:
        app: Flask application instance
        socketio: Flask-SocketIO instance
        
    Returns:
        Dict[str, Callable]: Dictionary of API handler functions
    """
    if not app:
        logger.warning("No Flask app provided, API handlers will be returned but not registered")
        
    handlers = {}
    
    # Handler for processing a single PDF
    def process_pdf_handler():
        """API handler for processing a single PDF file"""
        try:
            # Check if request has JSON data
            if app.request.is_json:
                data = app.request.get_json()
            else:
                data = app.request.form.to_dict()
                
            # Get parameters from request
            pdf_path = data.get('pdf_path')
            output_dir = data.get('output_dir')
            extract_tables = data.get('extract_tables', True)
            use_ocr = data.get('use_ocr', True)
            
            # Validate PDF path
            if not pdf_path:
                return app.jsonify({
                    "status": "error",
                    "error": "PDF file path is required"
                }), 400
                
            # Validate parameters
            if isinstance(extract_tables, str):
                extract_tables = extract_tables.lower() == 'true'
            if isinstance(use_ocr, str):
                use_ocr = use_ocr.lower() == 'true'
                
            # Create output path
            if output_dir:
                base_name = os.path.splitext(os.path.basename(pdf_path))[0]
                output_path = os.path.join(output_dir, f"{base_name}_processed.json")
            else:
                output_path = None  # Will be derived in process_pdf
            
            # Generate a task ID
            import uuid
            task_id = str(uuid.uuid4())
            
            # Create SocketIO progress callback if possible
            progress_callback = None
            if socketio:
                progress_callback = handle_pdf_progress_events(pdf_path, socketio, task_id)
            
            # Process the PDF with a dedicated thread
            def process_thread():
                try:
                    result = process_pdf(
                        pdf_path=pdf_path,
                        output_path=output_path,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr,
                        return_data=True,
                        timeout=300
                    )
                    
                    # Emit completion event if socketio available
                    if socketio:
                        completion_data = {
                            "task_id": task_id,
                            "status": "completed" if result and result.get("status") == "success" else "error",
                            "file_path": pdf_path,
                            "output_path": output_path if output_path else result.get("output_file"),
                            "timestamp": time.time()
                        }
                        
                        if result:
                            completion_data.update({
                                "document_type": result.get("document_type", "unknown"),
                                "page_count": result.get("page_count", 0),
                                "tables_count": len(result.get("tables", [])),
                                "references_count": len(result.get("references", [])),
                                "chunks_count": len(result.get("chunks", [])),
                                "has_scanned_content": result.get("has_scanned_content", False),
                                "processing_time": result.get("processing_info", {}).get("elapsed_seconds", 0)
                            })
                            
                            if result.get("status") != "success":
                                completion_data["error"] = result.get("processing_info", {}).get("error", "Unknown error")
                        
                        socketio.emit("pdf_processing_complete", completion_data)
                        
                except Exception as e:
                    logger.error(f"Error in PDF processing thread: {e}")
                    
                    # Emit error event
                    if socketio:
                        socketio.emit("pdf_processing_error", {
                            "task_id": task_id,
                            "file_path": pdf_path,
                            "error": str(e),
                            "timestamp": time.time()
                        })
            
            # Start processing thread
            import threading
            processing_thread = threading.Thread(target=process_thread, daemon=True)
            processing_thread.start()
            
            # Return immediate response with task ID
            return app.jsonify({
                "status": "processing",
                "message": "PDF processing started",
                "task_id": task_id,
                "pdf_file": pdf_path,
                "output_file": output_path
            })
            
        except Exception as e:
            logger.error(f"Error in process_pdf_handler: {e}")
            return app.jsonify({
                "status": "error",
                "error": str(e)
            }), 500
    
    handlers['process_pdf'] = process_pdf_handler
    
    # Handler for extracting tables from a PDF
    def extract_tables_handler():
        """API handler for extracting tables from a PDF"""
        try:
            # Check if request has JSON data
            if app.request.is_json:
                data = app.request.get_json()
            else:
                data = app.request.form.to_dict()
                
            # Get parameters from request
            pdf_path = data.get('pdf_path')
            page_range = data.get('page_range')
            
            # Validate PDF path
            if not pdf_path:
                return app.jsonify({
                    "status": "error",
                    "error": "PDF file path is required"
                }), 400
                
            # Convert page_range if provided
            if page_range:
                if isinstance(page_range, str):
                    if ',' in page_range:
                        page_range = tuple(map(int, page_range.split(',')))
                    elif '-' in page_range:
                        page_range = tuple(map(int, page_range.split('-')))
                    else:
                        page_range = (int(page_range), int(page_range))
                elif isinstance(page_range, list) and len(page_range) == 2:
                    page_range = tuple(page_range)
            
            # Extract tables
            tables = extract_tables_from_pdf(pdf_path, page_range)
            
            return app.jsonify({
                "status": "success",
                "pdf_file": pdf_path,
                "tables_count": len(tables),
                "tables": tables
            })
            
        except Exception as e:
            logger.error(f"Error in extract_tables_handler: {e}")
            return app.jsonify({
                "status": "error",
                "error": str(e)
            }), 500
    
    handlers['extract_tables'] = extract_tables_handler
    
    # Handler for getting PDF summary
    def pdf_summary_handler():
        """API handler for getting a PDF summary"""
        try:
            # Check if request has JSON data
            if app.request.is_json:
                data = app.request.get_json()
            else:
                data = app.request.form.to_dict()
                
            # Get parameters from request
            pdf_path = data.get('pdf_path')
            
            # Validate PDF path
            if not pdf_path:
                return app.jsonify({
                    "status": "error",
                    "error": "PDF file path is required"
                }), 400
                
            # Get summary
            summary = get_pdf_summary(pdf_path)
            
            return app.jsonify({
                "status": "success",
                "summary": summary
            })
            
        except Exception as e:
            logger.error(f"Error in pdf_summary_handler: {e}")
            return app.jsonify({
                "status": "error",
                "error": str(e)
            }), 500
    
    handlers['pdf_summary'] = pdf_summary_handler
    
    # Handler for batch processing PDFs
    def batch_process_handler():
        """API handler for batch processing PDFs"""
        try:
            # Check if request has JSON data
            if app.request.is_json:
                data = app.request.get_json()
            else:
                data = app.request.form.to_dict()
                
            # Get parameters from request
            pdf_files = data.get('pdf_files', [])
            output_dir = data.get('output_dir')
            extract_tables = data.get('extract_tables', True)
            use_ocr = data.get('use_ocr', True)
            
            # Validate parameters
            if not pdf_files:
                return app.jsonify({
                    "status": "error",
                    "error": "PDF files list is required"
                }), 400
                
            if not output_dir:
                return app.jsonify({
                    "status": "error",
                    "error": "Output directory is required"
                }), 400
                
            if isinstance(extract_tables, str):
                extract_tables = extract_tables.lower() == 'true'
            if isinstance(use_ocr, str):
                use_ocr = use_ocr.lower() == 'true'
                
            # Generate a task ID
            import uuid
            task_id = str(uuid.uuid4())
            
            # Start batch processing in a thread
            def batch_thread():
                try:
                    result = batch_process_pdfs(
                        pdf_files=pdf_files,
                        output_folder=output_dir,
                        extract_tables=extract_tables,
                        use_ocr=use_ocr
                    )
                    
                    # Emit completion event if socketio available
                    if socketio:
                        socketio.emit("batch_processing_complete", {
                            "task_id": task_id,
                            "status": "completed",
                            "output_dir": output_dir,
                            "processed_files": result.get("processed_files", 0),
                            "failed_files": result.get("failed_files", 0),
                            "total_files": result.get("total_files", 0),
                            "processing_time": result.get("elapsed_seconds", 0),
                            "timestamp": time.time()
                        })
                        
                except Exception as e:
                    logger.error(f"Error in batch processing thread: {e}")
                    
                    # Emit error event
                    if socketio:
                        socketio.emit("batch_processing_error", {
                            "task_id": task_id,
                            "error": str(e),
                            "timestamp": time.time()
                        })
            
            # Start processing thread
            import threading
            batch_thread = threading.Thread(target=batch_thread, daemon=True)
            batch_thread.start()
            
            # Return immediate response with task ID
            return app.jsonify({
                "status": "processing",
                "message": f"Batch processing started for {len(pdf_files)} files",
                "task_id": task_id,
                "output_dir": output_dir
            })
            
        except Exception as e:
            logger.error(f"Error in batch_process_handler: {e}")
            return app.jsonify({
                "status": "error",
                "error": str(e)
            }), 500
    
    handlers['batch_process'] = batch_process_handler
    
    # Register handlers with Flask app if provided
    if app:
        app.route('/api/pdf/process', methods=['POST'])(handlers['process_pdf'])
        app.route('/api/pdf/extract-tables', methods=['POST'])(handlers['extract_tables'])
        app.route('/api/pdf/summary', methods=['POST'])(handlers['pdf_summary'])
        app.route('/api/pdf/batch-process', methods=['POST'])(handlers['batch_process'])
        
        logger.info("Registered PDF extractor API handlers with Flask app")
    
    return handlers

def run_command_line():
    """
    Run the PDF extractor from the command line with argument parsing.
    This function can be called directly for CLI usage.
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="PDF Extraction Module for NeuroGen Processor")
    
    # Create subcommands
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Single PDF processing command
    process_parser = subparsers.add_parser('process', help='Process a single PDF file')
    process_parser.add_argument("pdf_file", help="Path to PDF file to process")
    process_parser.add_argument("-o", "--output", help="Output JSON path (default: auto-generated)")
    process_parser.add_argument("--no-tables", action="store_true", help="Skip table extraction")
    process_parser.add_argument("--no-ocr", action="store_true", help="Skip OCR for scanned documents")
    process_parser.add_argument("--chunk-size", type=int, default=4096, help="Maximum chunk size")
    process_parser.add_argument("--timeout", type=int, default=300, help="Processing timeout in seconds")
    process_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    # Batch processing command
    batch_parser = subparsers.add_parser('batch', help='Batch process multiple PDF files')
    batch_parser.add_argument("input_dir", help="Directory containing PDF files to process")
    batch_parser.add_argument("-o", "--output-dir", help="Output directory for JSON files")
    batch_parser.add_argument("--pattern", default="*.pdf", help="File pattern to match (default: *.pdf)")
    batch_parser.add_argument("--no-tables", action="store_true", help="Skip table extraction")
    batch_parser.add_argument("--no-ocr", action="store_true", help="Skip OCR for scanned documents")
    batch_parser.add_argument("--chunk-size", type=int, default=4096, help="Maximum chunk size")
    batch_parser.add_argument("--max-workers", type=int, default=None, help="Maximum number of worker threads")
    batch_parser.add_argument("--timeout", type=int, default=300, help="Processing timeout per file")
    batch_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    # Table extraction command
    tables_parser = subparsers.add_parser('tables', help='Extract tables from a PDF file')
    tables_parser.add_argument("pdf_file", help="Path to PDF file to process")
    tables_parser.add_argument("-o", "--output", help="Output JSON path (default: auto-generated)")
    tables_parser.add_argument("--page-range", help="Page range to extract tables from (e.g., '1,5' or '1-5')")
    tables_parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    # Information command
    info_parser = subparsers.add_parser('info', help='Get PDF information')
    info_parser.add_argument("pdf_file", help="Path to PDF file to analyze")
    info_parser.add_argument("-o", "--output", help="Output JSON path (default: print to console)")
    
    # Parse arguments
    args = parser.parse_args()
    
    # Configure logging
    if hasattr(args, 'verbose') and args.verbose:
        logger.setLevel(logging.DEBUG)
        logger.debug("Verbose logging enabled")
    
    # No command specified
    if not args.command:
        parser.print_help()
        return 1
    
    # Process command
    if args.command == 'process':
        print(f"Processing PDF: {args.pdf_file}")
        print(f"Output: {args.output or 'auto-generated'}")
        print(f"Extract tables: {not args.no_tables}")
        print(f"Use OCR: {not args.no_ocr}")
        print(f"Chunk size: {args.chunk_size}")
        print(f"Timeout: {args.timeout} seconds")
        print("Processing...")
        
        start_time = time.time()
        result = process_pdf(
            pdf_path=args.pdf_file,
            output_path=args.output,
            extract_tables=not args.no_tables,
            use_ocr=not args.no_ocr,
            max_chunk_size=args.chunk_size,
            return_data=True,
            timeout=args.timeout
        )
        
        elapsed = time.time() - start_time
        
        if result:
            print(f"Processing completed in {elapsed:.2f} seconds")
            print(f"Document type: {result.get('document_type', 'unknown')}")
            print(f"Pages: {result.get('page_count', 0)}")
            print(f"Chunks: {len(result.get('chunks', []))}")
            print(f"Tables: {len(result.get('tables', []))}")
            print(f"References: {len(result.get('references', []))}")
            print(f"Output saved to: {result.get('output_file') or args.output}")
            
            return 0 if result.get("status") == "success" else 1
        else:
            print(f"Processing failed after {elapsed:.2f} seconds")
            return 1
    
    elif args.command == 'batch':
        # Find PDF files
        import glob
        import os
        
        pattern = os.path.join(args.input_dir, args.pattern)
        pdf_files = glob.glob(pattern)
        
        if not pdf_files:
            print(f"No PDF files found matching pattern: {pattern}")
            return 1
        
        print(f"Found {len(pdf_files)} PDF files in {args.input_dir}")
        print(f"Output directory: {args.output_dir or args.input_dir}")
        print(f"Extract tables: {not args.no_tables}")
        print(f"Use OCR: {not args.no_ocr}")
        print(f"Chunk size: {args.chunk_size}")
        print(f"Workers: {args.max_workers or 'auto'}")
        print(f"Timeout: {args.timeout} seconds per file")
        print("Processing...")
        
        # Process files
        output_dir = args.output_dir or args.input_dir
        start_time = time.time()
        
        result = batch_process_pdfs(
            pdf_files=pdf_files,
            output_folder=output_dir,
            extract_tables=not args.no_tables,
            use_ocr=not args.no_ocr,
            max_chunk_size=args.chunk_size,
            max_workers=args.max_workers,
            timeout=args.timeout
        )
        
        elapsed = time.time() - start_time
        
        # Show results
        print(f"Batch processing completed in {elapsed:.2f} seconds")
        print(f"Processed: {result.get('processed_files', 0)}/{result.get('total_files', 0)} files")
        print(f"Failed: {result.get('failed_files', 0)} files")
        success_rate = result.get('success_rate', 0)
        print(f"Success rate: {success_rate:.1f}%")
        
        if 'results' in result:
            print("\nDetailed results:")
            for file_result in result.get('results', []):
                status = "✓" if file_result.get('success', False) else "✗"
                print(f"{status} {os.path.basename(file_result.get('pdf_file', ''))} " + 
                      f"({file_result.get('elapsed_seconds', 0):.1f}s)")
        
        return 0 if success_rate > 50 else 1
    
    elif args.command == 'tables':
        print(f"Extracting tables from PDF: {args.pdf_file}")
        
        # Parse page range
        page_range = None
        if args.page_range:
            if ',' in args.page_range:
                page_range = tuple(map(int, args.page_range.split(',')))
            elif '-' in args.page_range:
                page_range = tuple(map(int, args.page_range.split('-')))
            else:
                page_range = (int(args.page_range), int(args.page_range))
        
        # Extract tables
        tables = extract_tables_from_pdf(args.pdf_file, page_range)
        
        print(f"Extracted {len(tables)} tables")
        
        # Save or print tables
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(tables, f, indent=2, ensure_ascii=False)
            print(f"Tables saved to: {args.output}")
        else:
            for i, table in enumerate(tables):
                print(f"\nTable {i+1} (Page {table.get('page', '?')}):")
                print("-" * 40)
                # Print table data
                if 'data' in table:
                    if isinstance(table['data'], list):
                        for row in table['data'][:5]:  # First 5 rows
                            if isinstance(row, dict):
                                print(" | ".join(str(v) for v in row.values()))
                            else:
                                print(" | ".join(str(cell) for cell in row))
                        if len(table['data']) > 5:
                            print("... more rows ...")
        
        return 0
    
    elif args.command == 'info':
        print(f"Getting information for PDF: {args.pdf_file}")
        
        # Get summary
        summary = get_pdf_summary(args.pdf_file)
        
        # Save or print information
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            print(f"Information saved to: {args.output}")
        else:
            print("\nPDF Information:")
            print("-" * 40)
            for key, value in summary.items():
                if key not in ('preview', 'extraction_error'):
                    print(f"{key}: {value}")
            
            if 'preview' in summary:
                print("\nPreview:")
                print("-" * 40)
                preview = summary['preview']
                if len(preview) > 500:
                    preview = preview[:497] + "..."
                print(preview)
        
        return 0
    
    return 0

# -----------------------------------------------------------------------------
# SECTION 14: MAIN ENTRY POINT AND MODULE INITIALIZATION
# -----------------------------------------------------------------------------

def module_status() -> Dict[str, Any]:
    """
    Get the status and capabilities of the PDF extractor module.
    Useful for diagnostics and feature detection.
    
    Returns:
        Dict[str, Any]: Module status information
    """
    return {
        "version": "1.0.0",
        "libraries": {
            "pymupdf": USE_FITZ,
            "pypdf2": USE_PYPDF2,
            "pdfplumber": USE_PDFPLUMBER,
            "tabula": USE_TABULA,
            "ocr": USE_OCR
        },
        "capabilities": {
            "text_extraction": True,
            "table_extraction": USE_TABULA or USE_PDFPLUMBER or USE_FITZ,
            "ocr": USE_OCR,
            "structure_analysis": True,
            "reference_extraction": True
        },
        "java_available": JAVA_AVAILABLE if 'JAVA_AVAILABLE' in globals() else False,
        "tesseract_available": TESSERACT_AVAILABLE if 'TESSERACT_AVAILABLE' in globals() else False,
        "module_initialized": PDF_MODULE_INITIALIZED if 'PDF_MODULE_INITIALIZED' in globals() else False
    }

def initialize_module() -> Dict[str, Any]:
    """
    Initialize the PDF extractor module and all its dependencies.
    
    Returns:
        Dict[str, Any]: Initialization status
    """
    global PDF_MODULE_INITIALIZED
    
    if PDF_MODULE_INITIALIZED:
        logger.info("PDF extractor module already initialized")
        return module_status()
    
    logger.info("Initializing PDF extractor module...")
    
    # Initialize PDF libraries
    libraries = initialize_pdf_libraries()
    
    # Setup Java path if needed
    if USE_TABULA and not JAVA_AVAILABLE:
        setup_java_path()
    
    # Set initialization flag
    PDF_MODULE_INITIALIZED = True
    
    # Return status
    return module_status()

def register_with_app(app=None, socketio=None) -> Dict[str, Any]:
    """
    Register the PDF extractor module with a Flask application.
    
    Args:
        app: Flask application instance
        socketio: Flask-SocketIO instance
        
    Returns:
        Dict[str, Any]: Registration status
    """
    # Initialize module
    initialize_module()
    
    # Create API handlers
    handlers = None
    if app:
        handlers = create_api_handlers(app, socketio)
    
    # Return status
    return {
        "status": "registered" if app else "not_registered",
        "app": bool(app),
        "socketio": bool(socketio),
        "module_status": module_status(),
        "handlers": list(handlers.keys()) if handlers else []
    }

def log_diagnostic_info():
    """
    Log diagnostic information about the PDF extractor module.
    Useful for debugging deployment issues.
    """
    import sys
    import platform
    
    logger.info("==== PDF Extractor Diagnostic Information ====")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Platform: {platform.platform()}")
    logger.info(f"System: {platform.system()} {platform.release()}")
    
    # Module status
    status = module_status()
    
    logger.info(f"Module version: {status['version']}")
    logger.info("Libraries:")
    for name, available in status["libraries"].items():
        logger.info(f"  - {name}: {'Available' if available else 'Not available'}")
    
    logger.info("Capabilities:")
    for capability, available in status["capabilities"].items():
        logger.info(f"  - {capability}: {'Yes' if available else 'No'}")
    
    # Java info
    if status.get("java_available", False):
        java_home = os.environ.get("JAVA_HOME", "Not set")
        logger.info(f"Java home: {java_home}")
    
    # Tesseract info
    if status.get("tesseract_available", False):
        try:
            import pytesseract
            tesseract_cmd = getattr(pytesseract.pytesseract, 'tesseract_cmd', 'Unknown')
            logger.info(f"Tesseract command: {tesseract_cmd}")
        except ImportError:
            logger.info("Tesseract reported as available but pytesseract not imported")
    
    # Path info
    logger.info(f"Current working directory: {os.getcwd()}")
    logger.info(f"Module directory: {os.path.dirname(os.path.abspath(__file__))}")
    
    logger.info("==============================================")

# Module entry point when run directly
if __name__ == "__main__":
    # Print banner
    print("=" * 80)
    print("PDF Extractor Module for NeuroGen Processor")
    print("=" * 80)
    
    # Initialize
    initialize_module()
    
    # Log diagnostic info
    log_diagnostic_info()
    
    # Run command line
    import sys
    sys.exit(run_command_line())