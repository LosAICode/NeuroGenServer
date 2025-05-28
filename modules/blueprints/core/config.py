"""
Core Configuration Module
Centralized configuration constants and settings for the NeuroGen Server
"""

import os
from pathlib import Path

# =============================================================================
# PATH CONFIGURATION
# =============================================================================

# Base paths
BASE_DIR = Path(__file__).parent.parent.parent  # modules directory
PROJECT_ROOT = BASE_DIR.parent

# Output paths
DEFAULT_OUTPUT_FOLDER = os.environ.get(
    "DEFAULT_OUTPUT_FOLDER", 
    os.path.join(os.path.expanduser("~"), "Documents", "ProcessedFiles")
)
DEFAULT_OUTPUT_PATH = os.environ.get(
    "DEFAULT_OUTPUT_PATH", 
    os.path.join(os.path.expanduser("~"), "Documents")
)

# Temp directory
TEMP_DIR = os.path.join(BASE_DIR, 'temp')
TESSDATA_DIR = os.path.join(TEMP_DIR, 'tessdata')

# =============================================================================
# API CONFIGURATION
# =============================================================================

# API Keys
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
API_KEYS = os.environ.get("API_KEYS", "test_key,dev_key").split(",")

# Server settings
API_PORT = int(os.environ.get("API_PORT", "5025"))
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_DEBUG = os.environ.get("API_DEBUG", "False").lower() in ("true", "1", "t")
API_URL = f"http://localhost:{API_PORT}/api/process"

# =============================================================================
# PROCESSING CONFIGURATION
# =============================================================================

# Thread and processing limits
DEFAULT_NUM_THREADS = int(os.environ.get("DEFAULT_NUM_THREADS", "5"))
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", "32")) * 1024 * 1024  # 32MB default
DEFAULT_PROCESS_TIMEOUT = int(os.environ.get("DEFAULT_PROCESS_TIMEOUT", "600"))  # 10 minutes
DEFAULT_MEMORY_LIMIT = 1024 * 1024 * 1024  # 1GB

# Chunk processing
DEFAULT_MAX_CHUNK_SIZE = int(os.environ.get("DEFAULT_MAX_CHUNK_SIZE", "4096"))
DEFAULT_CHUNK_OVERLAP = int(os.environ.get("DEFAULT_CHUNK_OVERLAP", "200"))
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# =============================================================================
# FILE PROCESSING CONFIGURATION
# =============================================================================

# Valid file extensions
DEFAULT_VALID_EXTENSIONS = [
    ".py", ".html", ".css", ".yaml", ".yml",
    ".txt", ".md", ".js", ".gitignore", ".ts",
    ".json", ".csv", ".rtf", ".pdf", ".docx",
    ".pptx", ".xlsx", ".xml", ".sh", ".bat",
    ".java", ".c", ".cpp", ".h", ".cs", ".php",
    ".rb", ".go", ".rs", ".swift"
]

# Directories to ignore
IGNORE_DIRS = [
    "venv", "node_modules", ".git", "__pycache__", 
    "dist", "build", ".pytest_cache", "env",
    ".venv", ".idea", ".vscode", "__MACOSX"
]

# Stop words for text processing
DEFAULT_STOP_WORDS = set([
    "the", "and", "or", "for", "a", "an", "of", "in", "to", "from",
    "on", "at", "by", "this", "is", "are", "were", "was", "be", "as",
    "it", "that", "these", "those", "with", "can", "if", "not", "no",
    "your", "you", "i", "am", "our", "we", "they", "their", "me",
    "have", "has", "had", "also", "too", "very", "up", "out", "about",
    "so", "some", "any", "my", "his", "her", "he", "she", "when", "where",
    "what", "who", "why", "how", "which", "than", "then", "them", "but"
])

# =============================================================================
# OCR CONFIGURATION
# =============================================================================

# Tesseract paths (Windows)
TESSERACT_PATHS = [
    r'C:\Program Files\Tesseract-OCR\tesseract.exe',
    r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
    r'C:\Tesseract-OCR\tesseract.exe'
]

# Tesseract data URL
TESSDATA_URL = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"

# =============================================================================
# TASK MANAGEMENT CONFIGURATION
# =============================================================================

# Task status values
TASK_STATUS = {
    'PENDING': 'pending',
    'INITIALIZING': 'initializing',
    'PROCESSING': 'processing',
    'COMPLETED': 'completed',
    'FAILED': 'failed',
    'CANCELLING': 'cancelling',
    'CANCELLED': 'cancelled'
}

# Progress update intervals
PROGRESS_UPDATE_INTERVAL = 2  # seconds
PROGRESS_EMIT_THROTTLE = 0.5  # minimum seconds between emissions

# Memory thresholds
MEMORY_WARNING_THRESHOLD = 3072  # 3GB warning
MEMORY_LIMIT_THRESHOLD = 4096  # 4GB limit
AUTO_GC_THRESHOLD = 2048  # 2GB for automatic garbage collection

# =============================================================================
# CLEANUP CONFIGURATION
# =============================================================================

# Cleanup intervals
TEMP_FILE_MAX_AGE_MINUTES = 30
TEMP_DIR_MAX_AGE_DAYS = 7
CLEANUP_INTERVAL_MINUTES = 60

# =============================================================================
# HTTP CLIENT CONFIGURATION
# =============================================================================

# Retry configuration
HTTP_MAX_RETRIES = 3
HTTP_BACKOFF_FACTOR = 0.3
HTTP_STATUS_FORCELIST = [500, 502, 503, 504]
HTTP_TIMEOUT = 30  # seconds

# User agent
USER_AGENT = "Mozilla/5.0 (compatible; NeuroGen/1.0)"

# =============================================================================
# RATE LIMITING CONFIGURATION
# =============================================================================

# Default rate limits
DEFAULT_RATE_LIMITS = ["100 per day", "10 per minute"]

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

# Log format
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# =============================================================================
# ERROR CODES
# =============================================================================

ERROR_CODES = {
    'TASK_NOT_FOUND': 'The specified task was not found',
    'INVALID_INPUT': 'Invalid input parameters',
    'PROCESSING_ERROR': 'An error occurred during processing',
    'PERMISSION_DENIED': 'Permission denied for this operation',
    'RESOURCE_LIMIT': 'Resource limit exceeded',
    'API_KEY_INVALID': 'Invalid or missing API key',
    'FILE_NOT_FOUND': 'File not found',
    'PATH_NOT_FOUND': 'Path not found',
    'UNSUPPORTED_FORMAT': 'Unsupported file format'
}

# =============================================================================
# ACADEMIC RESEARCH CONFIGURATION
# =============================================================================

# Research domains for academic search
RESEARCH_DOMAINS = [
    "arxiv.org",
    "semanticscholar.org", 
    "pubmed.ncbi.nlm.nih.gov",
    "scholar.google.com",
    "researchgate.net",
    "academia.edu",
    "biorxiv.org",
    "medrxiv.org",
    "ssrn.com",
    "philpapers.org"
]

# =============================================================================
# FEATURE FLAGS
# =============================================================================

FEATURES = {
    'ENABLE_OCR': os.environ.get('ENABLE_OCR', 'true').lower() == 'true',
    'ENABLE_PDF_EXTRACTION': os.environ.get('ENABLE_PDF_EXTRACTION', 'true').lower() == 'true',
    'ENABLE_TABLE_EXTRACTION': os.environ.get('ENABLE_TABLE_EXTRACTION', 'true').lower() == 'true',
    'ENABLE_ACADEMIC_SEARCH': os.environ.get('ENABLE_ACADEMIC_SEARCH', 'true').lower() == 'true',
    'ENABLE_RATE_LIMITING': os.environ.get('ENABLE_RATE_LIMITING', 'false').lower() == 'true',
    'ENABLE_MEMORY_MONITORING': os.environ.get('ENABLE_MEMORY_MONITORING', 'true').lower() == 'true'
}

# =============================================================================
# EXPORT ALL CONFIGURATION
# =============================================================================

def get_config():
    """Return all configuration as a dictionary"""
    return {
        'paths': {
            'base_dir': str(BASE_DIR),
            'project_root': str(PROJECT_ROOT),
            'default_output_folder': DEFAULT_OUTPUT_FOLDER,
            'default_output_path': DEFAULT_OUTPUT_PATH,
            'temp_dir': TEMP_DIR,
            'tessdata_dir': TESSDATA_DIR
        },
        'api': {
            'port': API_PORT,
            'host': API_HOST,
            'debug': API_DEBUG,
            'url': API_URL,
            'youtube_api_key': YOUTUBE_API_KEY
        },
        'processing': {
            'num_threads': DEFAULT_NUM_THREADS,
            'max_upload_size': MAX_UPLOAD_SIZE,
            'timeout': DEFAULT_PROCESS_TIMEOUT,
            'memory_limit': DEFAULT_MEMORY_LIMIT,
            'chunk_size': DEFAULT_MAX_CHUNK_SIZE,
            'chunk_overlap': DEFAULT_CHUNK_OVERLAP,
            'max_file_size': MAX_FILE_SIZE
        },
        'features': FEATURES
    }

# Create a configuration class for object-oriented access
class Config:
    """Configuration class for easy attribute access"""
    
    def __init__(self):
        # Paths
        self.BASE_DIR = BASE_DIR
        self.PROJECT_ROOT = PROJECT_ROOT
        self.DEFAULT_OUTPUT_FOLDER = DEFAULT_OUTPUT_FOLDER
        self.DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_PATH
        self.TEMP_DIR = TEMP_DIR
        
        # API
        self.YOUTUBE_API_KEY = YOUTUBE_API_KEY
        self.API_PORT = API_PORT
        self.API_HOST = API_HOST
        self.API_DEBUG = API_DEBUG
        
        # Processing
        self.DEFAULT_NUM_THREADS = DEFAULT_NUM_THREADS
        self.MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE
        self.DEFAULT_PROCESS_TIMEOUT = DEFAULT_PROCESS_TIMEOUT
        self.DEFAULT_MAX_CHUNK_SIZE = DEFAULT_MAX_CHUNK_SIZE
        
        # File extensions
        self.DEFAULT_VALID_EXTENSIONS = DEFAULT_VALID_EXTENSIONS
        self.IGNORE_DIRS = IGNORE_DIRS
        self.DEFAULT_STOP_WORDS = DEFAULT_STOP_WORDS
        
        # Features
        self.FEATURES = FEATURES
        
    def is_feature_enabled(self, feature_name):
        """Check if a feature is enabled"""
        return self.FEATURES.get(feature_name, False)

# Create singleton instance
config = Config()

__all__ = [
    # Path constants
    'BASE_DIR', 'PROJECT_ROOT', 'DEFAULT_OUTPUT_FOLDER', 'DEFAULT_OUTPUT_PATH',
    'TEMP_DIR', 'TESSDATA_DIR',
    
    # API constants
    'YOUTUBE_API_KEY', 'API_KEYS', 'API_PORT', 'API_HOST', 'API_DEBUG', 'API_URL',
    
    # Processing constants
    'DEFAULT_NUM_THREADS', 'MAX_UPLOAD_SIZE', 'DEFAULT_PROCESS_TIMEOUT',
    'DEFAULT_MEMORY_LIMIT', 'DEFAULT_MAX_CHUNK_SIZE', 'DEFAULT_CHUNK_OVERLAP',
    'MAX_FILE_SIZE',
    
    # File processing
    'DEFAULT_VALID_EXTENSIONS', 'IGNORE_DIRS', 'DEFAULT_STOP_WORDS',
    
    # OCR
    'TESSERACT_PATHS', 'TESSDATA_URL',
    
    # Task management
    'TASK_STATUS', 'PROGRESS_UPDATE_INTERVAL', 'PROGRESS_EMIT_THROTTLE',
    'MEMORY_WARNING_THRESHOLD', 'MEMORY_LIMIT_THRESHOLD', 'AUTO_GC_THRESHOLD',
    
    # Cleanup
    'TEMP_FILE_MAX_AGE_MINUTES', 'TEMP_DIR_MAX_AGE_DAYS', 'CLEANUP_INTERVAL_MINUTES',
    
    # HTTP Client
    'HTTP_MAX_RETRIES', 'HTTP_BACKOFF_FACTOR', 'HTTP_STATUS_FORCELIST',
    'HTTP_TIMEOUT', 'USER_AGENT',
    
    # Rate limiting
    'DEFAULT_RATE_LIMITS',
    
    # Logging
    'LOG_FORMAT', 'LOG_DATE_FORMAT',
    
    # Error codes
    'ERROR_CODES',
    
    # Academic research
    'RESEARCH_DOMAINS',
    
    # Features
    'FEATURES',
    
    # Functions and classes
    'get_config', 'Config', 'config'
]