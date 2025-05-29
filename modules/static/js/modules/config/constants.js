/**
 * Global Constants Configuration for Blueprint Architecture
 * 
 * Central configuration for the NeuroGenServer Blueprint system.
 * All constants are frozen to prevent accidental modifications.
 * Optimized for Linux server → Windows client production deployment.
 * 
 * @module config/constants
 * @version 3.0.0
 */

// Determine environment
const ENV = (() => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development';
  }
  if (hostname.includes('staging') || hostname.includes('test')) {
    return 'staging';
  }
  return 'production';
})();

// Base configuration that other constants depend on
const BASE_CONFIG = {
  ENV,
  DEVELOPMENT: ENV === 'development',
  STAGING: ENV === 'staging',
  PRODUCTION: ENV === 'production',
  DEBUG_MODE: ENV === 'development' || window.location.search.includes('debug=true'),
  APP_VERSION: '3.0.0',
  APP_NAME: 'NeuroGenServer',
  BLUEPRINT_ARCHITECTURE: true
};

// API Configuration aligned with Flask Blueprint structure
const API_CONFIG = {
  API_BASE_URL: '/api',
  API_TIMEOUT: 30000, // 30 seconds
  API_RETRY_ATTEMPTS: 3,
  API_RETRY_DELAY: 1000, // 1 second
  API_RETRY_BACKOFF_MULTIPLIER: 2,
  API_MAX_RETRY_DELAY: 10000, // 10 seconds
  API_CONCURRENT_REQUESTS: 8, // Increased for Blueprint parallel processing
  API_RATE_LIMIT_PER_SECOND: 15,
  
  // Blueprint-specific timeouts
  BLUEPRINT_TIMEOUTS: {
    file_processor: 600000, // 10 minutes for file processing
    playlist_downloader: 1800000, // 30 minutes for playlists
    web_scraper: 900000, // 15 minutes for web scraping
    academic_search: 120000, // 2 minutes for academic searches
    pdf_processor: 300000, // 5 minutes for PDF processing
    management: 30000 // 30 seconds for management operations
  }
};

// Socket.IO Configuration optimized for Blueprint real-time communication
const SOCKET_CONFIG = {
  SOCKET_URL: window.location.origin,
  SOCKET_PATH: '/socket.io/',
  SOCKET_RECONNECTION_ATTEMPTS: 15, // Increased for production stability
  SOCKET_RECONNECTION_DELAY: 1000,
  SOCKET_RECONNECTION_DELAY_MAX: 8000, // Increased max delay
  SOCKET_TIMEOUT: 25000, // Increased timeout
  SOCKET_TRANSPORTS: ['websocket', 'polling'],
  SOCKET_UPGRADE_TIMEOUT: 15000,
  SOCKET_PING_INTERVAL: 25000,
  SOCKET_PING_TIMEOUT: 60000,
  SOCKET_PROGRESS_THROTTLE_MS: 250, // Optimized for Blueprint progress updates
  SOCKET_PROGRESS_DEDUPE_WINDOW: 100,
  
  // Blueprint-specific event namespaces
  BLUEPRINT_NAMESPACES: {
    file_processor: '/file-processor',
    playlist_downloader: '/playlist',
    web_scraper: '/scraper',
    academic_search: '/academic',
    pdf_processor: '/pdf',
    task_management: '/tasks'
  }
};

// Task Configuration for Blueprint task management
const TASK_CONFIG = {
  TASK_TIMEOUT_DEFAULT: 600000, // 10 minutes
  TASK_TIMEOUT_FILE_PROCESSING: 1800000, // 30 minutes
  TASK_TIMEOUT_PLAYLIST_DOWNLOAD: 3600000, // 1 hour
  TASK_TIMEOUT_WEB_SCRAPING: 1200000, // 20 minutes
  TASK_TIMEOUT_ACADEMIC_SEARCH: 300000, // 5 minutes
  TASK_TIMEOUT_PDF_PROCESSING: 900000, // 15 minutes
  
  TASK_PROGRESS_UPDATE_INTERVAL: 500, // 500ms for smoother updates
  TASK_STATUS_CHECK_INTERVAL: 2000, // 2 seconds
  TASK_MAX_RETRIES: 5, // Increased for production reliability
  TASK_RETRY_DELAY: 3000,
  TASK_CLEANUP_DELAY: 120000, // 2 minutes after completion
  TASK_HISTORY_MAX_SIZE: 200, // Increased for better tracking
  TASK_HISTORY_PERSIST: true,
  
  // Blueprint-specific task priorities
  TASK_PRIORITIES: {
    file_processor: 'high',
    playlist_downloader: 'medium',
    web_scraper: 'medium',
    academic_search: 'low',
    pdf_processor: 'high',
    management: 'critical'
  }
};

// File Processing Configuration optimized for cross-platform deployment
const FILE_CONFIG = {
  MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB - increased for production
  MAX_BATCH_SIZE: 2000, // Increased batch size
  CHUNK_SIZE: 2 * 1024 * 1024, // 2MB chunks for better performance
  
  // Extended file support for production
  ALLOWED_EXTENSIONS: [
    // Programming languages
    '.py', '.js', '.ts', '.jsx', '.tsx', '.vue', '.java', '.c', '.cpp', '.cs', '.php',
    '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.r', '.m', '.h', '.hpp', '.dart',
    '.perl', '.lua', '.bash', '.powershell', '.vb', '.fs', '.clj', '.elm', '.hs',
    
    // Web technologies
    '.html', '.css', '.scss', '.sass', '.less', '.styl', '.xml', '.svg',
    
    // Configuration and data
    '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.properties',
    '.csv', '.tsv', '.sql', '.db', '.sqlite', '.log',
    
    // Documentation
    '.md', '.txt', '.rst', '.tex', '.rtf', '.adoc',
    
    // Office documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    
    // Archives
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'
  ],
  
  // Cross-platform path handling
  PATH_SEPARATORS: {
    windows: '\\\\',
    linux: '/',
    normalized: '/'
  },
  
  // Windows compatibility
  WINDOWS_RESERVED_NAMES: ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'],
  WINDOWS_INVALID_CHARS: /[<>:"|?*]/g,
  MAX_WINDOWS_PATH_LENGTH: 260,
  MAX_FILENAME_LENGTH: 255,
  
  // Default output paths for cross-platform deployment
  DEFAULT_OUTPUT_PATHS: {
    windows: 'C:\\\\Users\\\\{username}\\\\Documents\\\\NeuroGenServer',
    linux: '/home/{username}/Documents/NeuroGenServer',
    mac: '/Users/{username}/Documents/NeuroGenServer',
    fallback: './downloads'
  }
};

// UI Configuration optimized for Blueprint frontend
const UI_CONFIG = {
  TOAST_DURATION: 6000, // Increased for better user feedback
  TOAST_POSITION: 'top-right',
  MODAL_ANIMATION_DURATION: 250,
  DEBOUNCE_DELAY: 250, // Optimized for responsive UI
  THROTTLE_DELAY: 100,
  PROGRESS_BAR_ANIMATION_DURATION: 150,
  PROGRESS_BAR_UPDATE_THRESHOLD: 0.5, // More sensitive updates
  TAB_ANIMATION_DURATION: 200,
  LOADING_SPINNER_DELAY: 150,
  ERROR_MESSAGE_MAX_LENGTH: 750, // Increased for detailed error messages
  THEME_TRANSITION_DURATION: 300,
  MAX_VISIBLE_ITEMS_IN_LIST: 150, // Increased for better UX
  AUTOSAVE_INTERVAL: 20000, // 20 seconds for better data safety
  IDLE_TIMEOUT: 1800000, // 30 minutes
  
  // Blueprint-specific UI settings
  MODULE_LOAD_TIMEOUT: 15000, // 15 seconds for module loading
  MODULE_RETRY_ATTEMPTS: 3,
  BLUEPRINT_TAB_ORDER: [
    'file_processor',
    'web_scraper', 
    'academic_search',
    'playlist_downloader',
    'pdf_processor',
    'task_history'
  ]
};

// Storage Configuration for Blueprint state management
const STORAGE_CONFIG = {
  STORAGE_PREFIX: 'neurogen_v3_',
  STORAGE_VERSION: '3.0',
  STORAGE_QUOTA_WARNING_THRESHOLD: 0.85, // Warning at 85% usage
  
  SESSION_STORAGE_KEYS: [
    'current_task',
    'active_blueprint',
    'active_tab',
    'temp_form_data',
    'progress_state',
    'socket_state'
  ],
  
  LOCAL_STORAGE_KEYS: [
    'theme',
    'preferences',
    'task_history',
    'recent_paths',
    'api_keys',
    'debug_mode',
    'blueprint_settings',
    'cross_platform_paths'
  ],
  
  INDEXED_DB_NAME: 'NeuroGenServerDB',
  INDEXED_DB_VERSION: 3,
  INDEXED_DB_STORES: ['tasks', 'files', 'cache', 'blueprints', 'analytics']
};

// Performance Configuration for production deployment
const PERFORMANCE_CONFIG = {
  ENABLE_PERFORMANCE_MONITORING: BASE_CONFIG.DEVELOPMENT || BASE_CONFIG.STAGING,
  PERFORMANCE_SAMPLE_RATE: BASE_CONFIG.PRODUCTION ? 0.05 : 0.1, // 5% in production
  PERFORMANCE_BUFFER_SIZE: 200,
  LONG_TASK_THRESHOLD: 50, // milliseconds
  MEMORY_WARNING_THRESHOLD: 200 * 1024 * 1024, // 200MB
  MEMORY_CHECK_INTERVAL: 90000, // 1.5 minutes
  FPS_TARGET: 60,
  FPS_WARNING_THRESHOLD: 45, // Higher threshold for production
  
  // Blueprint-specific performance settings
  MODULE_CACHE_SIZE: 50, // Cache 50 modules
  MODULE_PRELOAD: true, // Preload critical modules
  LAZY_LOADING: true, // Enable lazy loading for non-critical modules
  WORKER_THREADS: navigator.hardwareConcurrency || 4
};

// Feature Flags for Blueprint modules
const FEATURE_FLAGS = {
  // Core Blueprint features
  ENABLE_FILE_PROCESSING: true,
  ENABLE_PLAYLIST_DOWNLOADER: true,
  ENABLE_WEB_SCRAPER: true,
  ENABLE_ACADEMIC_SEARCH: true,
  ENABLE_PDF_PROCESSOR: true,
  ENABLE_TASK_HISTORY: true,
  
  // Cross-platform features
  ENABLE_CROSS_PLATFORM_PATHS: true,
  ENABLE_WINDOWS_CLIENT_SUPPORT: true,
  ENABLE_LINUX_SERVER_OPTIMIZATION: true,
  
  // UI features
  ENABLE_DARK_MODE: true,
  ENABLE_KEYBOARD_SHORTCUTS: true,
  ENABLE_DRAG_DROP: true,
  ENABLE_REAL_TIME_UPDATES: true,
  ENABLE_PROGRESS_ANIMATIONS: true,
  
  // Advanced features
  ENABLE_BATCH_PROCESSING: true,
  ENABLE_CONCURRENT_DOWNLOADS: true,
  ENABLE_EXPORT_IMPORT: true,
  ENABLE_ANALYTICS: BASE_CONFIG.PRODUCTION,
  ENABLE_ERROR_REPORTING: true,
  ENABLE_SERVICE_WORKER: BASE_CONFIG.PRODUCTION,
  ENABLE_PWA_FEATURES: BASE_CONFIG.PRODUCTION,
  
  // Experimental features
  ENABLE_WEBGL_VISUALIZATIONS: false,
  ENABLE_VOICE_COMMANDS: false,
  ENABLE_COLLABORATION: false,
  ENABLE_AI_ASSISTANCE: false
};

// Validation Rules optimized for cross-platform deployment
const VALIDATION_CONFIG = {
  // Path validation for different platforms
  WINDOWS_PATH_REGEX: /^[a-zA-Z]:[\\\/](?:[^<>:"|?*]+[\\\/])*[^<>:"|?*]*$/,
  LINUX_PATH_REGEX: /^\/(?:[^\/\0]+\/)*[^\/\0]*$/,
  GENERIC_PATH_REGEX: /^[^\0]+$/,
  
  // URL validation
  URL_REGEX: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // Platform-specific validation
  YOUTUBE_PLAYLIST_REGEX: /(?:youtube\.com\/(?:playlist\?list=|watch\?.*&list=)|youtu\.be\/(?:playlist\?list=))([a-zA-Z0-9_-]+)/,
  ARXIV_PAPER_REGEX: /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/,
  DOI_REGEX: /10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/i,
  
  // File validation
  FILENAME_REGEX: /^[^<>:"/\\|?*\x00-\x1f]+$/,
  SAFE_FILENAME_REGEX: /^[a-zA-Z0-9._-]+$/,
  
  // Limits
  MAX_PATH_LENGTH: 260, // Windows MAX_PATH
  MAX_FILENAME_LENGTH: 255,
  MAX_URL_LENGTH: 2048,
  MAX_PLAYLIST_URLS: 100, // Increased for production
  MAX_SCRAPER_URLS: 200, // Increased for production
  MAX_CONCURRENT_TASKS: 10,
  
  // Cross-platform limits
  WINDOWS_MAX_PATH: 260,
  LINUX_MAX_PATH: 4096,
  MAX_DRIVE_LETTERS: 26
};

// Error Messages with cross-platform context
const ERROR_MESSAGES = {
  // Network errors
  NETWORK_ERROR: 'Network connection error. Please check your internet connection and try again.',
  TIMEOUT_ERROR: 'The operation timed out. The server may be busy, please try again in a moment.',
  SERVER_ERROR: 'Server error occurred. Our team has been notified. Please try again later.',
  CONNECTION_LOST: 'Connection to server lost. Attempting to reconnect...',
  
  // Validation errors
  VALIDATION_ERROR: 'Please check your input and try again.',
  INVALID_PATH: 'Invalid file path. Please enter a valid path for your operating system.',
  INVALID_WINDOWS_PATH: 'Invalid Windows path. Please use format: C:\\\\folder\\\\file.ext',
  INVALID_LINUX_PATH: 'Invalid Linux path. Please use format: /home/user/folder/file.ext',
  PATH_TOO_LONG: 'File path is too long. Maximum length is {maxLength} characters.',
  
  // File errors
  FILE_NOT_FOUND: 'The requested file could not be found.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is {maxSize}.',
  INVALID_FILE_TYPE: 'Invalid file type. Please select a supported file format.',
  PERMISSION_DENIED: 'You do not have permission to access this file or directory.',
  
  // Task errors
  TASK_CANCELLED: 'Task was cancelled by user.',
  TASK_FAILED: 'Task failed. Please check the error details and try again.',
  TASK_TIMEOUT: 'Task timed out. The operation took too long to complete.',
  MAX_TASKS_EXCEEDED: 'Maximum number of concurrent tasks reached. Please wait for existing tasks to complete.',
  
  // Storage errors
  QUOTA_EXCEEDED: 'Storage quota exceeded. Please free up some space or clear old data.',
  STORAGE_ERROR: 'Unable to save data. Please check your browser storage settings.',
  
  // Cross-platform errors
  PLATFORM_INCOMPATIBLE: 'This feature is not compatible with your operating system.',
  PATH_CONVERSION_ERROR: 'Unable to convert path for your operating system.',
  WINDOWS_CLIENT_ERROR: 'Error communicating with Windows client. Please check your system configuration.',
  
  // Generic errors
  SESSION_EXPIRED: 'Your session has expired. Please refresh the page.',
  BROWSER_NOT_SUPPORTED: 'Your browser is not supported. Please use a modern browser.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again or contact support.'
};

// Success Messages
const SUCCESS_MESSAGES = {
  TASK_COMPLETED: 'Task completed successfully!',
  FILE_UPLOADED: 'File uploaded and processing started.',
  FILE_PROCESSED: 'File processing completed successfully!',
  DOWNLOAD_STARTED: 'Download started. You can monitor progress below.',
  DOWNLOAD_COMPLETED: 'All downloads completed successfully!',
  SETTINGS_SAVED: 'Settings saved successfully!',
  CONNECTION_RESTORED: 'Connection to server restored.',
  TASK_STARTED: 'Task started successfully. Monitor progress below.',
  EXPORT_COMPLETE: 'Export completed! File is ready for download.',
  IMPORT_COMPLETE: 'Import completed successfully!',
  PATH_VALIDATED: 'Path validated and ready for use.',
  CROSS_PLATFORM_SUCCESS: 'Cross-platform operation completed successfully!'
};

// Keyboard Shortcuts
const KEYBOARD_SHORTCUTS = {
  // Global shortcuts
  NEW_TASK: 'Ctrl+N',
  CANCEL_TASK: 'Escape',
  SUBMIT_FORM: 'Ctrl+Enter',
  TOGGLE_THEME: 'Ctrl+Shift+T',
  TOGGLE_DEBUG: 'Ctrl+Shift+D',
  FOCUS_SEARCH: 'Ctrl+F',
  HELP: 'F1',
  REFRESH: 'F5',
  FULLSCREEN: 'F11',
  
  // Blueprint navigation
  NEXT_TAB: 'Ctrl+Tab',
  PREV_TAB: 'Ctrl+Shift+Tab',
  FILE_PROCESSOR: 'Ctrl+1',
  WEB_SCRAPER: 'Ctrl+2',
  ACADEMIC_SEARCH: 'Ctrl+3',
  PLAYLIST_DOWNLOADER: 'Ctrl+4',
  PDF_PROCESSOR: 'Ctrl+5',
  TASK_HISTORY: 'Ctrl+6',
  
  // Task management
  START_TASK: 'Ctrl+S',
  PAUSE_TASK: 'Ctrl+P',
  RESUME_TASK: 'Ctrl+R',
  CANCEL_ALL: 'Ctrl+Shift+X'
};

// Analytics Events for production monitoring
const ANALYTICS_EVENTS = {
  // Application lifecycle
  APP_LOADED: 'app_loaded',
  BLUEPRINT_LOADED: 'blueprint_loaded',
  MODULE_INITIALIZED: 'module_initialized',
  
  // Task events
  TASK_STARTED: 'task_started',
  TASK_COMPLETED: 'task_completed',
  TASK_FAILED: 'task_failed',
  TASK_CANCELLED: 'task_cancelled',
  TASK_TIMEOUT: 'task_timeout',
  
  // User interactions
  TAB_SWITCHED: 'tab_switched',
  THEME_CHANGED: 'theme_changed',
  FEATURE_USED: 'feature_used',
  SHORTCUT_USED: 'shortcut_used',
  
  // Performance events
  PERFORMANCE_WARNING: 'performance_warning',
  MEMORY_WARNING: 'memory_warning',
  SLOW_OPERATION: 'slow_operation',
  
  // Cross-platform events
  CROSS_PLATFORM_OPERATION: 'cross_platform_operation',
  WINDOWS_CLIENT_INTERACTION: 'windows_client_interaction',
  PATH_CONVERSION: 'path_conversion',
  
  // Error events
  ERROR_OCCURRED: 'error_occurred',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error'
};

// Combine all configurations
const CONSTANTS = Object.freeze({
  ...BASE_CONFIG,
  ...API_CONFIG,
  ...SOCKET_CONFIG,
  ...TASK_CONFIG,
  ...FILE_CONFIG,
  ...UI_CONFIG,
  ...STORAGE_CONFIG,
  ...PERFORMANCE_CONFIG,
  FEATURE_FLAGS: Object.freeze(FEATURE_FLAGS),
  VALIDATION: Object.freeze(VALIDATION_CONFIG),
  ERROR_MESSAGES: Object.freeze(ERROR_MESSAGES),
  SUCCESS_MESSAGES: Object.freeze(SUCCESS_MESSAGES),
  KEYBOARD_SHORTCUTS: Object.freeze(KEYBOARD_SHORTCUTS),
  ANALYTICS_EVENTS: Object.freeze(ANALYTICS_EVENTS)
});

// Export the frozen constants
export { CONSTANTS };

// Also export individual configurations for convenience
export {
  ENV,
  BASE_CONFIG,
  API_CONFIG,
  SOCKET_CONFIG,
  TASK_CONFIG,
  FILE_CONFIG,
  UI_CONFIG,
  STORAGE_CONFIG,
  PERFORMANCE_CONFIG,
  FEATURE_FLAGS,
  VALIDATION_CONFIG,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  KEYBOARD_SHORTCUTS,
  ANALYTICS_EVENTS
};