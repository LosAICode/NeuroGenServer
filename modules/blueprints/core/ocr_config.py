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
    
    Returns:
        Dictionary containing configuration paths
    """
    global TEMP_DIR, TESSDATA_PREFIX
    
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


def download_tessdata(tessdata_dir: str):
    """
    Download Tesseract language data if it doesn't exist.
    
    Args:
        tessdata_dir: Directory to download tessdata files to
    """
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    
    try:
        import requests
        logger.info("Downloading eng.traineddata...")
        url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
        
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(eng_traineddata, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata}")
        
    except Exception as e:
        logger.error(f"Failed to download tessdata: {e}")


def initialize_pdf_extractor():
    """Initialize PDF extractor module if available"""
    global pdf_extractor_available, pdf_extractor
    
    try:
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
        pdf_extractor_available = False
        
        # Create placeholder implementation
        pdf_extractor = _create_pdf_extractor_placeholder()


def _create_pdf_extractor_placeholder():
    """Create a placeholder PDF extractor when module is not available"""
    
    class PDFExtractorPlaceholder:
        """Placeholder for PDF extractor functionality"""
        
        @staticmethod
        def process_pdf(*args, **kwargs):
            error_msg = "PDF extractor module not available. Install with 'pip install pdf_extractor'"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}
        
        @staticmethod
        def extract_tables_from_pdf(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return []
        
        @staticmethod
        def detect_document_type(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return "unknown"
        
        @staticmethod
        def initialize_module(*args, **kwargs):
            logger.error("PDF extractor module not available")
            return {"status": "error", "capabilities": {}}
    
    return PDFExtractorPlaceholder()


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


def download_tessdata():
    """Download Tesseract language data if it doesn't exist"""
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