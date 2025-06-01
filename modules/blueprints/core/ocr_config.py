"""
OCR Configuration Module
Handles OCR environment setup, Tesseract configuration, and PDF extraction
"""

import os
import sys
import stat
import logging
import shutil
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Global state for module availability
pdf_extractor_available = False
pdf_extractor = None
pytesseract_available = False
pikepdf_available = False

# Global paths
TEMP_DIR = None
TESSDATA_PREFIX = None

# Singleton pattern to prevent duplicate initialization
_ocr_initialized = False

# Handle pikepdf import
try:
    import pikepdf
    pikepdf_available = True
    logger.info("pikepdf available for PDF repair functions")
except ImportError:
    logger.warning("pikepdf not available. Some PDF repair functions will be limited.")
    pikepdf_available = False


def setup_ocr_environment() -> Dict[str, str]:
    """
    Set up OCR environment with proper paths and permissions.
    Uses singleton pattern to prevent duplicate initialization.
    
    Returns:
        Dictionary containing configuration paths
    """
    global TEMP_DIR, TESSDATA_PREFIX, _ocr_initialized
    
    # Singleton check - return existing config if already initialized
    if _ocr_initialized:
        logger.debug("OCR environment already initialized - skipping duplicate setup")
        return {
            'base_temp_dir': TEMP_DIR,
            'tessdata_dir': TESSDATA_PREFIX,
            'temp_env': TEMP_DIR
        }
    
    # Determine temp directory path (relative to this module)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    custom_temp_dir = os.path.join(base_dir, 'temp')
    
    # Set globals
    TEMP_DIR = custom_temp_dir
    
    # Create directories
    os.makedirs(custom_temp_dir, exist_ok=True)
    tessdata_dir = os.path.join(custom_temp_dir, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    # Set tessdata prefix
    TESSDATA_PREFIX = tessdata_dir
    
    # Set permissions
    try:
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
        logger.info(f"Set full permissions on temp directory: {custom_temp_dir}")
    except Exception as e:
        logger.warning(f"Could not set permissions on temp directory: {e}")
    
    # Set environment variables
    os.environ['TEMP'] = custom_temp_dir
    os.environ['TMP'] = custom_temp_dir
    os.environ['TESSDATA_PREFIX'] = os.path.abspath(tessdata_dir)
    
    logger.info(f"Set TESSDATA_PREFIX to: {os.environ['TESSDATA_PREFIX']}")
    logger.info(f"Set temp directory environment variables to: {custom_temp_dir}")
    
    # Configure pytesseract if available
    configure_pytesseract()
    
    # Ensure tessdata files exist
    ensure_tessdata_exists(tessdata_dir)
    
    # Mark as initialized to prevent duplicates
    _ocr_initialized = True
    logger.info("OCR environment initialized successfully (singleton)")
    
    return {
        'base_temp_dir': custom_temp_dir,
        'tessdata_dir': tessdata_dir,
        'temp_env': custom_temp_dir
    }


def configure_pytesseract():
    """Configure pytesseract with proper executable path"""
    global pytesseract_available
    
    try:
        import pytesseract
        pytesseract_available = True
        
        # Windows-specific paths
        if sys.platform == 'win32':
            tesseract_paths = [
                r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                r'C:\Tesseract-OCR\tesseract.exe'
            ]
            
            for path in tesseract_paths:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    logger.info(f"Set Tesseract command path to: {path}")
                    
                    # Also set TESSDATA_PREFIX to the tessdata directory
                    tessdata_path = os.path.join(os.path.dirname(path), 'tessdata')
                    if os.path.exists(tessdata_path):
                        os.environ['TESSDATA_PREFIX'] = tessdata_path
                    break
            else:
                logger.warning("Tesseract executable not found in standard locations")
        
    except ImportError:
        logger.warning("pytesseract not available, OCR functionality will be limited")
        pytesseract_available = False


def ensure_tessdata_exists(tessdata_dir: str):
    """
    Ensure tesseract language data files exist.
    
    Args:
        tessdata_dir: Directory to store tessdata files
    """
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        # Try to copy from system installation
        if sys.platform == 'win32':
            source_path = r'C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata'
            if os.path.exists(source_path):
                try:
                    shutil.copy2(source_path, eng_traineddata)
                    logger.info(f"Copied eng.traineddata from {source_path}")
                except Exception as e:
                    logger.warning(f"Failed to copy eng.traineddata: {e}")
                    download_tessdata(tessdata_dir)
            else:
                download_tessdata(tessdata_dir)
        else:
            download_tessdata(tessdata_dir)
    
    if os.path.exists(eng_traineddata):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata}")
    else:
        logger.warning(f"eng.traineddata not found at {eng_traineddata}")


def download_tessdata():
    """Download Tesseract language data if it doesn't exist"""
    if not TEMP_DIR:
        setup_ocr_environment()
    
    tessdata_dir = os.path.join(TEMP_DIR, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        try:
            import requests
            logger.info("Downloading eng.traineddata...")
            url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
            r = requests.get(url, stream=True)
            r.raise_for_status()
            
            with open(eng_traineddata, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
            logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata}")
        except Exception as e:
            logger.error(f"Failed to download tessdata: {e}")

def ensure_tessdata_files():
    """Ensure tesseract language data files exist"""
    if not TEMP_DIR:
        setup_ocr_environment()
        
    tessdata_dir = os.path.join(TEMP_DIR, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    if not os.path.exists(eng_traineddata):
        source_path = r'C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata'
        if os.path.exists(source_path):
            try:
                import shutil
                shutil.copy2(source_path, eng_traineddata)
                logger.info(f"Copied eng.traineddata from {source_path} to {eng_traineddata}")
            except Exception as e:
                logger.warning(f"Failed to copy eng.traineddata: {e}")
                # Try to download if copy fails
                download_tessdata()
        else:
            # Try to download if source file doesn't exist
            download_tessdata()
    
    if os.path.exists(eng_traineddata):
        logger.info(f"Confirmed eng.traineddata exists at: {eng_traineddata}")
    else:
        logger.warning(f"eng.traineddata not found at {eng_traineddata}")

ensure_tessdata_files()

def ensure_temp_directory():
    """
    Ensure the temp directory exists and has proper permissions.
    Call this before any operation that requires the temp directory.
    """
    custom_temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
    
    # Ensure the directory exists
    os.makedirs(custom_temp_dir, exist_ok=True)
    
    # Try to set full permissions
    try:
        import stat
        os.chmod(custom_temp_dir, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
    except Exception:
        pass
        
    # Set environment variables
    os.environ['TEMP'] = custom_temp_dir
    os.environ['TMP'] = custom_temp_dir
    
    # Return the path for use in operations
    return custom_temp_dir


def initialize_pdf_extractor():
    """Initialize PDF extractor module if available"""
    global pdf_extractor_available, pdf_extractor
    
    try:
        # First try to import the dedicated pdf_extractor module
        import pdf_extractor as pdf_ext
        pdf_extractor = pdf_ext
        pdf_extractor_available = True
        logger.info("Successfully imported pdf_extractor module")
        
        # Try to initialize the module
        try:
            init_status = pdf_extractor.initialize_module()
            logger.info(f"PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
        except Exception as e:
            logger.error(f"Error initializing PDF extractor: {e}")
            
    except ImportError as e:
        logger.warning(f"pdf_extractor module not available: {e}")
        logger.info("Using built-in PDF extractor implementation")
        
        # Create full implementation using available libraries
        pdf_extractor = _create_pdf_extractor_implementation()
        
        # Test the implementation
        try:
            init_status = pdf_extractor.initialize_module()
            pdf_extractor_available = True
            logger.info(f"Built-in PDF extractor initialized with capabilities: {init_status.get('capabilities', {})}")
        except Exception as e:
            logger.error(f"Error initializing built-in PDF extractor: {e}")
            pdf_extractor_available = False


def _create_pdf_extractor_implementation():
    """Create a full PDF extractor implementation using available libraries"""
    
    class PDFExtractorImplementation:
        """Full PDF extractor functionality using PyMuPDF, PyPDF2, and other libraries"""
        
        def __init__(self):
            self._setup_libraries()
        
        def _setup_libraries(self):
            """Set up available PDF processing libraries"""
            self.fitz_available = False
            self.pypdf_available = False
            self.tabula_available = False
            self.tesseract_available = False
            
            # Try PyMuPDF
            try:
                import fitz
                self.fitz_available = True
                self.fitz = fitz
                logger.info("PyMuPDF (fitz) available for PDF processing")
            except ImportError:
                logger.warning("PyMuPDF not available")
            
            # Try PyPDF2
            try:
                import PyPDF2
                self.pypdf_available = True
                self.PyPDF2 = PyPDF2
                logger.info("PyPDF2 available for PDF processing")
            except ImportError:
                logger.warning("PyPDF2 not available")
            
            # Try tabula for table extraction
            try:
                import tabula
                self.tabula_available = True
                self.tabula = tabula
                logger.info("Tabula available for table extraction")
            except ImportError:
                logger.warning("Tabula not available for table extraction")
            
            # Try pytesseract for OCR
            try:
                import pytesseract
                self.tesseract_available = True
                self.pytesseract = pytesseract
                logger.info("Pytesseract available for OCR")
            except ImportError:
                logger.warning("Pytesseract not available for OCR")
        
        def process_pdf(self, pdf_path, output_path=None, max_chunk_size=4096, 
                       extract_tables=True, use_ocr=True, return_data=False, timeout=300):
            """
            Process a PDF file with comprehensive extraction capabilities.
            
            Args:
                pdf_path: Path to the PDF file
                output_path: Path to output JSON file
                max_chunk_size: Maximum size of text chunks
                extract_tables: Whether to extract tables
                use_ocr: Whether to use OCR for scanned content
                return_data: Whether to return processed data
                timeout: Processing timeout in seconds
                
            Returns:
                Dictionary with processed data or None
            """
            try:
                import os
                import json
                from datetime import datetime
                
                if not os.path.exists(pdf_path):
                    return {"status": "error", "error": f"PDF file not found: {pdf_path}"}
                
                result = {
                    "status": "success",
                    "file_path": pdf_path,
                    "processed_at": datetime.now().isoformat(),
                    "text_content": "",
                    "tables": [],
                    "metadata": {},
                    "chunks": [],
                    "stats": {"pages": 0, "characters": 0, "tables_extracted": 0}
                }
                
                # Extract text using PyMuPDF if available
                if self.fitz_available:
                    text_content = self._extract_text_fitz(pdf_path)
                    result["text_content"] = text_content
                    result["stats"]["characters"] = len(text_content)
                
                # Fallback to PyPDF2
                elif self.pypdf_available:
                    text_content = self._extract_text_pypdf2(pdf_path)
                    result["text_content"] = text_content
                    result["stats"]["characters"] = len(text_content)
                
                else:
                    return {"status": "error", "error": "No PDF processing library available"}
                
                # Extract tables if requested and library is available
                if extract_tables and self.tabula_available:
                    tables = self._extract_tables_tabula(pdf_path)
                    result["tables"] = tables
                    result["stats"]["tables_extracted"] = len(tables)
                
                # Chunk the text
                if result["text_content"]:
                    result["chunks"] = self._chunk_text(result["text_content"], max_chunk_size)
                
                # Get metadata
                result["metadata"] = self._extract_metadata(pdf_path)
                
                # Save to file if output_path specified
                if output_path:
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, 'w', encoding='utf-8') as f:
                        json.dump(result, f, indent=2, ensure_ascii=False)
                
                if return_data:
                    return result
                else:
                    return {"status": "success", "output_path": output_path}
                    
            except Exception as e:
                logger.error(f"Error processing PDF {pdf_path}: {e}")
                return {"status": "error", "error": str(e)}
        
        def _extract_text_fitz(self, pdf_path):
            """Extract text using PyMuPDF"""
            try:
                doc = self.fitz.open(pdf_path)
                text_content = ""
                
                for page_num in range(len(doc)):
                    page = doc.load_page(page_num)
                    text = page.get_text()
                    text_content += f"\n--- Page {page_num + 1} ---\n{text}\n"
                
                doc.close()
                return text_content
                
            except Exception as e:
                logger.error(f"Error extracting text with PyMuPDF: {e}")
                return ""
        
        def _extract_text_pypdf2(self, pdf_path):
            """Extract text using PyPDF2"""
            try:
                text_content = ""
                with open(pdf_path, 'rb') as file:
                    pdf_reader = self.PyPDF2.PdfReader(file)
                    
                    for page_num, page in enumerate(pdf_reader.pages):
                        text = page.extract_text()
                        text_content += f"\n--- Page {page_num + 1} ---\n{text}\n"
                
                return text_content
                
            except Exception as e:
                logger.error(f"Error extracting text with PyPDF2: {e}")
                return ""
        
        def _extract_tables_tabula(self, pdf_path):
            """Extract tables using tabula"""
            try:
                tables = self.tabula.read_pdf(pdf_path, pages='all', multiple_tables=True)
                
                result_tables = []
                for i, table in enumerate(tables):
                    result_tables.append({
                        "table_index": i,
                        "data": table.to_dict('records'),
                        "columns": list(table.columns),
                        "shape": table.shape
                    })
                
                return result_tables
                
            except Exception as e:
                logger.error(f"Error extracting tables with tabula: {e}")
                return []
        
        def _chunk_text(self, text, max_chunk_size):
            """Split text into chunks"""
            chunks = []
            words = text.split()
            current_chunk = []
            current_size = 0
            
            for word in words:
                word_size = len(word) + 1  # +1 for space
                
                if current_size + word_size > max_chunk_size and current_chunk:
                    chunks.append(' '.join(current_chunk))
                    current_chunk = [word]
                    current_size = word_size
                else:
                    current_chunk.append(word)
                    current_size += word_size
            
            if current_chunk:
                chunks.append(' '.join(current_chunk))
            
            return [{"chunk_index": i, "content": chunk, "size": len(chunk)} 
                   for i, chunk in enumerate(chunks)]
        
        def _extract_metadata(self, pdf_path):
            """Extract PDF metadata"""
            try:
                if self.fitz_available:
                    doc = self.fitz.open(pdf_path)
                    metadata = doc.metadata
                    page_count = len(doc)
                    doc.close()
                    
                    return {
                        "title": metadata.get('title', ''),
                        "author": metadata.get('author', ''),
                        "subject": metadata.get('subject', ''),
                        "creator": metadata.get('creator', ''),
                        "producer": metadata.get('producer', ''),
                        "pages": page_count
                    }
                
                elif self.pypdf_available:
                    with open(pdf_path, 'rb') as file:
                        pdf_reader = self.PyPDF2.PdfReader(file)
                        metadata = pdf_reader.metadata or {}
                        
                        return {
                            "title": metadata.get('/Title', ''),
                            "author": metadata.get('/Author', ''),
                            "subject": metadata.get('/Subject', ''),
                            "creator": metadata.get('/Creator', ''),
                            "producer": metadata.get('/Producer', ''),
                            "pages": len(pdf_reader.pages)
                        }
                
                return {"pages": 0}
                
            except Exception as e:
                logger.error(f"Error extracting metadata: {e}")
                return {"pages": 0}
        
        def extract_tables_from_pdf(self, pdf_path, pages='all'):
            """
            Extract tables from PDF file.
            
            Args:
                pdf_path: Path to PDF file
                pages: Pages to extract from ('all' or list of page numbers)
                
            Returns:
                List of extracted tables
            """
            if not self.tabula_available:
                logger.warning("Tabula not available for table extraction")
                return []
            
            try:
                tables = self.tabula.read_pdf(pdf_path, pages=pages, multiple_tables=True)
                
                result_tables = []
                for i, table in enumerate(tables):
                    result_tables.append({
                        "table_index": i,
                        "data": table.to_dict('records'),
                        "columns": list(table.columns),
                        "shape": table.shape
                    })
                
                return result_tables
                
            except Exception as e:
                logger.error(f"Error extracting tables: {e}")
                return []
        
        def detect_document_type(self, file_path):
            """
            Detect document type based on file extension and content.
            
            Args:
                file_path: Path to the file
                
            Returns:
                String indicating document type
            """
            try:
                import os
                
                if not os.path.exists(file_path):
                    return "unknown"
                
                # Check file extension
                _, ext = os.path.splitext(file_path.lower())
                
                if ext == '.pdf':
                    # Try to determine if it's text-based or image-based
                    if self.fitz_available:
                        try:
                            doc = self.fitz.open(file_path)
                            if len(doc) > 0:
                                page = doc.load_page(0)
                                text = page.get_text().strip()
                                doc.close()
                                
                                if len(text) > 50:
                                    return "text_pdf"
                                else:
                                    return "image_pdf"
                            doc.close()
                        except:
                            pass
                    
                    return "pdf"
                
                elif ext in ['.doc', '.docx']:
                    return "word"
                elif ext in ['.txt', '.md']:
                    return "text"
                elif ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                    return "image"
                else:
                    return "unknown"
                    
            except Exception as e:
                logger.error(f"Error detecting document type: {e}")
                return "unknown"
        
        def initialize_module(self):
            """
            Initialize the PDF extractor module.
            
            Returns:
                Dictionary with initialization status and capabilities
            """
            capabilities = {
                "pymupdf_available": self.fitz_available,
                "pypdf2_available": self.pypdf_available,
                "tabula_available": self.tabula_available,
                "tesseract_available": self.tesseract_available,
                "text_extraction": self.fitz_available or self.pypdf_available,
                "table_extraction": self.tabula_available,
                "ocr_support": self.tesseract_available
            }
            
            return {
                "status": "success",
                "capabilities": capabilities,
                "initialized": True
            }
    
    return PDFExtractorImplementation()


def initialize_safe_ocr_handler():
    """Initialize safe OCR handler if available"""
    try:
        from safe_ocr_handler import setup_ocr_environment, patch_pytesseract, start_cleanup_service
        
        ocr_config = setup_ocr_environment()
        logger.info(f"OCR environment set up with temp directory: {ocr_config['base_temp_dir']}")
        
        # Patch pytesseract for better temp file handling
        patch_pytesseract()
        
        # Start the cleanup service
        start_cleanup_service(interval_minutes=30)
        
        logger.info("OCR handler initialized successfully")
        return True
        
    except ImportError:
        logger.warning("Could not import safe_ocr_handler. OCR functionality may be limited.")
        return False
    except Exception as e:
        logger.error(f"Error initializing OCR handler: {e}")
        return False


# Initialize modules on import
ocr_config = setup_ocr_environment()
initialize_pdf_extractor()
initialize_safe_ocr_handler()

# Ensure tessdata is available
ensure_tessdata_files()


# Export public interface
__all__ = [
    'setup_ocr_environment',
    'configure_pytesseract',
    'pdf_extractor',
    'pdf_extractor_available',
    'pytesseract_available',
    'pikepdf_available',
    'download_tessdata',
    'ensure_tessdata_files',
    'TEMP_DIR',
    'TESSDATA_PREFIX'
]