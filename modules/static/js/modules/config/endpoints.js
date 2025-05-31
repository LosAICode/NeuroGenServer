/**
 * API Endpoints Configuration for Blueprint Architecture
 * 
 * Central location for all API endpoint definitions aligned with Flask Blueprint structure.
 * Based on analysis of current Blueprint routes and production requirements.
 * 
 * @module config/endpoints
 * @version 3.0.0
 */

/**
 * API endpoint definitions organized by Blueprint feature
 */
export const API_ENDPOINTS = Object.freeze({
  // File Processing Endpoints (features/file_processor.py)
  FILE_PROCESSING: {
    PROCESS: '/api/process',
    STATUS: '/api/status/:taskId',
    DOWNLOAD: '/api/download/:taskId',
    OPEN: '/api/open/:taskId',
    DETECT_PATH: '/api/detect-path',
    VERIFY_PATH: '/api/verify-path',
    CREATE_DIRECTORY: '/api/create-directory',
    OPEN_FILE: '/api/open-file',
    GET_OUTPUT_FILEPATH: '/api/get-output-filepath'
  },

  // Playlist Processing Endpoints (features/playlist_downloader.py)
  PLAYLIST: {
    START: '/api/start-playlists',
    CANCEL: '/api/cancel-playlists/:taskId',
    STATUS: '/api/status/:taskId',
    HEALTH: '/api/health'
  },

  // Web Scraping Endpoints (features/web_scraper.py)
  WEB_SCRAPER: {
    SCRAPE: '/api/scrape2',
    STATUS: '/api/scrape2/status/:taskId',
    CANCEL: '/api/scrape2/cancel/:taskId',
    HEALTH: '/api/health-enhanced',
    DOWNLOAD_PDF: '/api/download-pdf',
    DOWNLOAD_FILE: '/api/download-file/:filePath'
  },

  // Academic Search Endpoints (features/academic_search.py)
  ACADEMIC: {
    SEARCH: '/api/academic/search',
    HEALTH: '/api/academic/health',
    DOWNLOAD: '/api/academic/download'
  },

  // PDF Processing Endpoints (features/pdf_processor.py)
  PDF_PROCESSOR: {
    PROCESS: '/api/pdf-process/process',
    STATUS: '/api/pdf-process/status/:taskId',
    EXTRACT: '/api/pdf-process/extract',
    CAPABILITIES: '/api/pdf-process/capabilities',
    ANALYZE: '/api/pdf-process/analyze'
  },

  // PDF Downloader Endpoints (features/pdf_downloader.py)
  PDF_DOWNLOADER: {
    DOWNLOAD: '/api/pdf/download',
    BATCH_DOWNLOAD: '/api/pdf/batch-download',
    STATUS: '/api/pdf/status/:taskId',
    CANCEL: '/api/pdf/cancel/:taskId',
    HEALTH: '/api/pdf/health'
  },

  // Task Management Endpoints (api/management.py)
  TASK: {
    LIST: '/api/tasks',
    CANCEL: '/api/cancel/:taskId',
    ANALYTICS: '/api/analytics',
    EXPORT: '/api/export/:taskId'
  },

  // API Key Management (api/management.py)
  API_KEYS: {
    LIST: '/api/keys',
    CREATE: '/api/keys/create',
    REVOKE: '/api/keys/revoke'
  },

  // System Endpoints (core/routes.py)
  SYSTEM: {
    HOME: '/',
    HEALTH: '/health',
    DIAGNOSTICS: '/diagnostics',
    TEST_MODULES: '/test-modules',
    VERSION: '/api/version'
  },

  // Download Endpoints (general)
  DOWNLOAD: {
    FILE: '/download/:filename',
    TEMP: '/api/download/temp/:fileId'
  }
});

/**
 * Blueprint-specific endpoint validation based on actual route implementations
 */
export const BLUEPRINT_ROUTES = Object.freeze({
  // File Processor Blueprint
  file_processor: {
    endpoints: API_ENDPOINTS.FILE_PROCESSING,
    blueprint_name: 'file_processor',
    url_prefix: '/api',
    methods: {
      '/api/process': ['POST'],
      '/api/status/:taskId': ['GET'],
      '/api/download/:taskId': ['GET'],
      '/api/open/:taskId': ['GET'],
      '/api/detect-path': ['POST'],
      '/api/verify-path': ['POST'],
      '/api/create-directory': ['POST'],
      '/api/open-file': ['POST']
    }
  },

  // Playlist Downloader Blueprint
  playlist_downloader: {
    endpoints: API_ENDPOINTS.PLAYLIST,
    blueprint_name: 'playlist_downloader',
    url_prefix: '/api',
    methods: {
      '/api/start-playlists': ['POST'],
      '/api/cancel-playlists/:taskId': ['POST']
    }
  },

  // Web Scraper Blueprint
  web_scraper: {
    endpoints: API_ENDPOINTS.WEB_SCRAPER,
    blueprint_name: 'web_scraper',
    url_prefix: '/api',
    methods: {
      '/api/scrape2': ['POST'],
      '/api/scrape2/status/:taskId': ['GET'],
      '/api/scrape2/cancel/:taskId': ['POST'],
      '/api/health-enhanced': ['GET'],
      '/api/download-pdf': ['POST'],
      '/api/download-file/:filePath': ['GET']
    }
  },

  // Academic Search Blueprint
  academic_search: {
    endpoints: API_ENDPOINTS.ACADEMIC,
    blueprint_name: 'academic_search',
    url_prefix: '/api',
    methods: {
      '/api/academic/search': ['POST'],
      '/api/academic/health': ['GET'],
      '/api/academic/download': ['POST']
    }
  },

  // PDF Processor Blueprint
  pdf_processor: {
    endpoints: API_ENDPOINTS.PDF_PROCESSOR,
    blueprint_name: 'pdf_processor',
    url_prefix: '/api/pdf-process',
    methods: {
      '/api/pdf-process/process': ['POST'],
      '/api/pdf-process/status/:taskId': ['GET'],
      '/api/pdf-process/extract': ['POST'],
      '/api/pdf-process/capabilities': ['GET'],
      '/api/pdf-process/analyze': ['POST']
    }
  },

  // PDF Downloader Blueprint
  pdf_downloader: {
    endpoints: API_ENDPOINTS.PDF_DOWNLOADER,
    blueprint_name: 'pdf_downloader',
    url_prefix: '/api/pdf',
    methods: {
      '/api/pdf/download': ['POST'],
      '/api/pdf/batch-download': ['POST'],
      '/api/pdf/status/:taskId': ['GET'],
      '/api/pdf/cancel/:taskId': ['POST'],
      '/api/pdf/health': ['GET']
    }
  },

  // Management Blueprint
  management: {
    endpoints: { ...API_ENDPOINTS.TASK, ...API_ENDPOINTS.API_KEYS },
    blueprint_name: 'api_management',
    url_prefix: '/api',
    methods: {
      '/api/tasks': ['GET'],
      '/api/cancel/:taskId': ['POST'],
      '/api/analytics': ['GET'],
      '/api/keys': ['GET'],
      '/api/keys/create': ['POST'],
      '/api/keys/revoke': ['POST']
    }
  },

  // Core Routes Blueprint
  core: {
    endpoints: API_ENDPOINTS.SYSTEM,
    blueprint_name: 'core',
    url_prefix: '',
    methods: {
      '/': ['GET'],
      '/health': ['GET'],
      '/diagnostics': ['GET'],
      '/test-modules': ['GET']
    }
  }
});

/**
 * Cross-platform path handling for Linux server → Windows client downloads
 */
export const PATH_CONFIG = Object.freeze({
  // Windows path conversion patterns
  WINDOWS_DRIVE_PATTERN: /^[A-Za-z]:/,
  WINDOWS_PATH_SEPARATOR: '\\\\',
  LINUX_PATH_SEPARATOR: '/',
  
  // Default output paths by platform
  DEFAULT_WINDOWS_PATH: 'C:\\\\Users\\\\{username}\\\\Documents\\\\NeuroGen',
  DEFAULT_LINUX_PATH: '/home/{username}/Documents/NeuroGen',
  DEFAULT_MAC_PATH: '/Users/{username}/Documents/NeuroGen',
  
  // File naming patterns for cross-platform compatibility
  SAFE_FILENAME_REGEX: /[<>:"|?*]/g,
  MAX_FILENAME_LENGTH: 255,
  RESERVED_WINDOWS_NAMES: ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
});

/**
 * Helper function to build endpoint URL with parameters
 * @param {string} endpoint - Endpoint template
 * @param {Object} params - Parameters to replace
 * @returns {string} Built endpoint URL
 */
export function buildEndpoint(endpoint, params = {}) {
  let url = endpoint;
  
  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`:${key}`, encodeURIComponent(value));
  });
  
  return url;
}

/**
 * Helper function to build URL with query parameters
 * @param {string} endpoint - Base endpoint
 * @param {Object} queryParams - Query parameters
 * @returns {string} URL with query string
 */
export function buildUrlWithQuery(endpoint, queryParams = {}) {
  const params = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      params.append(key, value);
    }
  });
  
  const queryString = params.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
}

/**
 * Get all endpoints for a specific Blueprint
 * @param {string} blueprint - Blueprint name
 * @returns {Object} Blueprint endpoints
 */
export function getBlueprintEndpoints(blueprint) {
  return BLUEPRINT_ROUTES[blueprint]?.endpoints || {};
}

/**
 * Get HTTP methods for a specific endpoint
 * @param {string} endpoint - Endpoint path
 * @returns {Array} HTTP methods
 */
export function getEndpointMethods(endpoint) {
  for (const blueprint of Object.values(BLUEPRINT_ROUTES)) {
    if (blueprint.methods[endpoint]) {
      return blueprint.methods[endpoint];
    }
  }
  
  // Fallback to smart detection
  if (endpoint.includes('/status/') || endpoint.includes('/health') || endpoint.includes('/download/')) {
    return ['GET'];
  }
  
  if (endpoint.includes('/cancel/') || endpoint.includes('/revoke')) {
    return ['POST']; // Some cancellations use POST instead of DELETE
  }
  
  return ['POST']; // Default for most processing endpoints
}

/**
 * Check if an endpoint requires authentication
 * @param {string} endpoint - Endpoint path
 * @returns {boolean} Requires authentication
 */
export function requiresAuth(endpoint) {
  const authRequired = [
    '/api/analytics',
    '/api/keys',
    '/api/tasks'
  ];
  
  return authRequired.some(path => endpoint.startsWith(path));
}

/**
 * Check if an endpoint supports file upload
 * @param {string} endpoint - Endpoint path
 * @returns {boolean} Supports file upload
 */
export function supportsFileUpload(endpoint) {
  const uploadEndpoints = [
    API_ENDPOINTS.FILE_PROCESSING.PROCESS,
    API_ENDPOINTS.PDF.PROCESS,
    API_ENDPOINTS.PDF.EXTRACT
  ];
  
  return uploadEndpoints.includes(endpoint);
}

/**
 * Get timeout for specific endpoint based on expected processing time
 * @param {string} endpoint - Endpoint path
 * @returns {number} Timeout in milliseconds
 */
export function getEndpointTimeout(endpoint) {
  // Long timeouts for processing endpoints
  if (endpoint.includes('/process') || endpoint.includes('/start-playlists') || endpoint.includes('/scrape')) {
    return 300000; // 5 minutes
  }
  
  if (endpoint.includes('/download/')) {
    return 120000; // 2 minutes
  }
  
  if (endpoint.includes('/status/')) {
    return 10000; // 10 seconds
  }
  
  // Default timeout
  return 30000; // 30 seconds
}

/**
 * Validate endpoint exists in Blueprint routes
 * @param {string} endpoint - Endpoint path
 * @returns {Object} Validation result
 */
export function validateEndpoint(endpoint) {
  for (const [blueprintName, blueprint] of Object.entries(BLUEPRINT_ROUTES)) {
    const methods = blueprint.methods;
    
    // Check exact match
    if (methods[endpoint]) {
      return {
        valid: true,
        blueprint: blueprintName,
        methods: methods[endpoint],
        endpoint: endpoint
      };
    }
    
    // Check pattern match (for :taskId parameters)
    for (const [pattern, methodList] of Object.entries(methods)) {
      const regex = new RegExp('^' + pattern.replace(/:taskId/g, '[^/]+') + '$');
      if (regex.test(endpoint)) {
        return {
          valid: true,
          blueprint: blueprintName,
          methods: methodList,
          pattern: pattern,
          endpoint: endpoint
        };
      }
    }
  }
  
  return {
    valid: false,
    endpoint: endpoint,
    error: 'Endpoint not found in any Blueprint'
  };
}

/**
 * Convert Windows path to cross-platform format for Linux server
 * @param {string} windowsPath - Windows-style path
 * @returns {string} Sanitized path for Linux server
 */
export function sanitizePathForLinuxServer(windowsPath) {
  if (!windowsPath) return '';
  
  // Replace Windows path separators
  let sanitized = windowsPath.replace(/\\/g, '/');
  
  // Handle drive letters (C: becomes /mnt/c or similar)
  sanitized = sanitized.replace(/^([A-Za-z]):/, '/mnt/$1');
  
  // Remove invalid characters for Linux
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  
  return sanitized;
}

/**
 * Generate Windows-compatible filename from Linux server
 * @param {string} filename - Original filename
 * @returns {string} Windows-compatible filename
 */
export function sanitizeFilenameForWindows(filename) {
  if (!filename) return '';
  
  // Replace invalid Windows characters
  let sanitized = filename.replace(PATH_CONFIG.SAFE_FILENAME_REGEX, '_');
  
  // Check for reserved Windows names
  const baseName = sanitized.split('.')[0].toUpperCase();
  if (PATH_CONFIG.RESERVED_WINDOWS_NAMES.includes(baseName)) {
    sanitized = `${sanitized}_file`;
  }
  
  // Trim to max length
  if (sanitized.length > PATH_CONFIG.MAX_FILENAME_LENGTH) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, PATH_CONFIG.MAX_FILENAME_LENGTH - ext.length);
    sanitized = name + ext;
  }
  
  return sanitized;
}

/**
 * Export individual endpoint groups for convenience
 */
export const FILE_ENDPOINTS = API_ENDPOINTS.FILE_PROCESSING;
export const PLAYLIST_ENDPOINTS = API_ENDPOINTS.PLAYLIST;
export const SCRAPER_ENDPOINTS = API_ENDPOINTS.WEB_SCRAPER;
export const PDF_ENDPOINTS = API_ENDPOINTS.PDF;
export const TASK_ENDPOINTS = API_ENDPOINTS.TASK;
export const ACADEMIC_ENDPOINTS = API_ENDPOINTS.ACADEMIC;
export const SYSTEM_ENDPOINTS = API_ENDPOINTS.SYSTEM;

// Legacy compatibility exports for existing code
export const ENDPOINTS = {
  // File processing
  PROCESS: API_ENDPOINTS.FILE_PROCESSING.PROCESS,
  STATUS: API_ENDPOINTS.FILE_PROCESSING.STATUS,
  DOWNLOAD: API_ENDPOINTS.FILE_PROCESSING.DOWNLOAD,
  
  // Playlist
  START_PLAYLISTS: API_ENDPOINTS.PLAYLIST.START,
  CANCEL_PLAYLISTS: API_ENDPOINTS.PLAYLIST.CANCEL,
  
  // Web scraper
  SCRAPE: API_ENDPOINTS.WEB_SCRAPER.SCRAPE,
  SCRAPE_STATUS: API_ENDPOINTS.WEB_SCRAPER.STATUS,
  SCRAPE_CANCEL: API_ENDPOINTS.WEB_SCRAPER.CANCEL,
  SCRAPE_HEALTH: API_ENDPOINTS.WEB_SCRAPER.HEALTH,
  SCRAPE_DOWNLOAD_PDF: API_ENDPOINTS.WEB_SCRAPER.DOWNLOAD_PDF,
  
  // Academic
  ACADEMIC_SEARCH: API_ENDPOINTS.ACADEMIC.SEARCH,
  ACADEMIC_HEALTH: API_ENDPOINTS.ACADEMIC.HEALTH,
  
  // System
  HOME: API_ENDPOINTS.SYSTEM.HOME,
  HEALTH: API_ENDPOINTS.SYSTEM.HEALTH
};

// Note: buildUrlWithQuery is already exported as a named export above