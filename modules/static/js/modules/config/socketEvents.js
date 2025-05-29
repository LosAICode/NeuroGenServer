/**
 * Socket.IO Events Configuration for Blueprint Architecture
 * 
 * Central location for all Socket.IO event names and payloads aligned with
 * Flask Blueprint real-time communication patterns.
 * 
 * @module config/socketEvents
 * @version 3.0.0
 */

/**
 * Socket.IO event names organized by Blueprint and direction
 */
export const SOCKET_EVENTS = Object.freeze({
  // Connection Events
  CONNECTION: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    RECONNECT: 'reconnect',
    RECONNECT_ATTEMPT: 'reconnect_attempt',
    RECONNECT_ERROR: 'reconnect_error',
    RECONNECT_FAILED: 'reconnect_failed',
    CONNECTION_ESTABLISHED: 'connection_established'
  },

  // Client -> Server Events
  CLIENT_TO_SERVER: {
    // General communication
    PING: 'ping',
    REQUEST_TASK_STATUS: 'request_task_status',
    CANCEL_TASK: 'cancel_task',
    PAUSE_TASK: 'pause_task',
    RESUME_TASK: 'resume_task',
    
    // File Processing Blueprint events
    FILE_PROCESS_REQUEST: 'file_process_request',
    
    // Playlist Downloader Blueprint events
    PLAYLIST_DOWNLOAD_REQUEST: 'playlist_download_request',
    
    // Web Scraper Blueprint events
    SCRAPE_REQUEST: 'scrape_request',
    
    // Academic Search Blueprint events
    ACADEMIC_SEARCH_REQUEST: 'academic_search_request',
    
    // PDF Processor Blueprint events
    PDF_PROCESSING_REQUEST: 'pdf_processing_request',
    
    // System events
    GET_SYSTEM_STATUS: 'get_system_status',
    GET_BLUEPRINT_STATUS: 'get_blueprint_status'
  },

  // Server -> Client Events (from Blueprint backends)
  SERVER_TO_CLIENT: {
    // General server events
    PONG: 'pong',
    SERVER_ERROR: 'server_error',
    BLUEPRINT_ERROR: 'blueprint_error',
    
    // Task Lifecycle Events (Blueprint agnostic)
    TASK_QUEUED: 'task_queued',
    TASK_STARTED: 'task_started',
    PROGRESS_UPDATE: 'progress_update', // Main progress event
    TASK_COMPLETED: 'task_completed',
    TASK_ERROR: 'task_error', // Main error event
    TASK_CANCELLED: 'task_cancelled',
    TASK_PAUSED: 'task_paused',
    TASK_RESUMED: 'task_resumed',
    
    // File Processing Blueprint Events
    FILE_FOUND: 'file_found',
    FILE_PROCESSED: 'file_processed',
    FILE_SKIPPED: 'file_skipped',
    FILE_ERROR: 'file_error',
    FILE_PROCESSING_STAGE: 'file_processing_stage',
    
    // Playlist Downloader Blueprint Events
    PLAYLIST_METADATA_FETCHED: 'playlist_metadata_fetched',
    PLAYLIST_VIDEO_FOUND: 'playlist_video_found',
    PLAYLIST_VIDEO_STARTED: 'video_started',
    PLAYLIST_VIDEO_PROGRESS: 'video_progress',
    PLAYLIST_VIDEO_COMPLETED: 'video_completed',
    PLAYLIST_VIDEO_ERROR: 'playlist_video_error',
    PLAYLIST_STAGE_PROGRESS: 'playlist_stage_progress',
    PLAYLIST_STARTED: 'playlist_started',
    PLAYLIST_COMPLETED: 'playlist_completed',
    PLAYLIST_ERROR: 'playlist_error',
    
    // Web Scraper Blueprint Events
    URL_SCRAPED: 'url_scraped',
    PDF_FOUND: 'pdf_found',
    PDF_DOWNLOAD_START: 'pdf_download_start',
    PDF_DOWNLOAD_PROGRESS: 'pdf_download_progress',
    PDF_DOWNLOAD_COMPLETE: 'pdf_download_complete',
    PDF_DOWNLOAD_ERROR: 'pdf_download_error',
    SCRAPER_STAGE_PROGRESS: 'scraper_stage_progress',
    
    // Academic Search Blueprint Events
    ACADEMIC_SEARCH_STARTED: 'academic_search_started',
    ACADEMIC_PAPER_FOUND: 'academic_paper_found',
    ACADEMIC_SEARCH_PROGRESS: 'academic_search_progress',
    ACADEMIC_SEARCH_COMPLETED: 'academic_search_completed',
    ACADEMIC_SEARCH_ERROR: 'academic_search_error',
    
    // PDF Processor Blueprint Events
    PDF_PROCESSING_STARTED: 'pdf_processing_started',
    PDF_PROCESSING_PROGRESS: 'pdf_processing_progress',
    PDF_TABLE_EXTRACTED: 'pdf_table_extracted',
    PDF_TEXT_EXTRACTED: 'pdf_text_extracted',
    PDF_PROCESSING_COMPLETED: 'pdf_processing_completed',
    PDF_PROCESSING_ERROR: 'pdf_processing_error',
    
    // System Events
    SYSTEM_STATUS: 'system_status',
    BLUEPRINT_STATUS: 'blueprint_status',
    MEMORY_WARNING: 'memory_warning',
    RATE_LIMIT_WARNING: 'rate_limit_warning',
    CROSS_PLATFORM_STATUS: 'cross_platform_status'
  }
});

/**
 * Blueprint-specific event mappings for easy access
 */
export const BLUEPRINT_EVENTS = Object.freeze({
  file_processor: {
    // Events specific to file processing Blueprint
    progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PROGRESS_UPDATE,
    started: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_STARTED,
    completed: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_COMPLETED,
    error: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_ERROR,
    file_found: SOCKET_EVENTS.SERVER_TO_CLIENT.FILE_FOUND,
    file_processed: SOCKET_EVENTS.SERVER_TO_CLIENT.FILE_PROCESSED,
    file_error: SOCKET_EVENTS.SERVER_TO_CLIENT.FILE_ERROR
  },
  
  playlist_downloader: {
    // Events specific to playlist downloader Blueprint
    progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PROGRESS_UPDATE,
    started: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_STARTED,
    completed: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_COMPLETED,
    error: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_ERROR,
    video_started: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_VIDEO_STARTED,
    video_progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_VIDEO_PROGRESS,
    video_completed: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_VIDEO_COMPLETED,
    stage_progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PLAYLIST_STAGE_PROGRESS
  },
  
  web_scraper: {
    // Events specific to web scraper Blueprint
    progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PROGRESS_UPDATE,
    started: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_STARTED,
    completed: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_COMPLETED,
    error: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_ERROR,
    url_scraped: SOCKET_EVENTS.SERVER_TO_CLIENT.URL_SCRAPED,
    pdf_found: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_FOUND,
    pdf_download_start: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_DOWNLOAD_START,
    pdf_download_progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_DOWNLOAD_PROGRESS,
    pdf_download_complete: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_DOWNLOAD_COMPLETE
  },
  
  academic_search: {
    // Events specific to academic search Blueprint
    progress: SOCKET_EVENTS.SERVER_TO_CLIENT.ACADEMIC_SEARCH_PROGRESS,
    started: SOCKET_EVENTS.SERVER_TO_CLIENT.ACADEMIC_SEARCH_STARTED,
    completed: SOCKET_EVENTS.SERVER_TO_CLIENT.ACADEMIC_SEARCH_COMPLETED,
    error: SOCKET_EVENTS.SERVER_TO_CLIENT.ACADEMIC_SEARCH_ERROR,
    paper_found: SOCKET_EVENTS.SERVER_TO_CLIENT.ACADEMIC_PAPER_FOUND
  },
  
  pdf_processor: {
    // Events specific to PDF processor Blueprint
    progress: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_PROCESSING_PROGRESS,
    started: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_PROCESSING_STARTED,
    completed: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_PROCESSING_COMPLETED,
    error: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_PROCESSING_ERROR,
    table_extracted: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_TABLE_EXTRACTED,
    text_extracted: SOCKET_EVENTS.SERVER_TO_CLIENT.PDF_TEXT_EXTRACTED
  }
});

/**
 * Event payload schemas for Blueprint communication
 */
export const EVENT_PAYLOADS = Object.freeze({
  // Client -> Server Payloads
  PING: {
    timestamp: 'number'
  },
  
  REQUEST_TASK_STATUS: {
    task_id: 'string',
    blueprint: 'string?'
  },
  
  CANCEL_TASK: {
    task_id: 'string',
    blueprint: 'string?',
    reason: 'string?'
  },
  
  FILE_PROCESS_REQUEST: {
    input_dir: 'string',
    output_file: 'string',
    options: 'object?'
  },
  
  PLAYLIST_DOWNLOAD_REQUEST: {
    playlists: 'array',
    root_directory: 'string',
    output_file: 'string',
    options: 'object?'
  },
  
  SCRAPE_REQUEST: {
    urls: 'array',
    output_file: 'string',
    download_pdfs: 'boolean?',
    max_pdfs: 'number?',
    recursive: 'boolean?',
    max_depth: 'number?'
  },
  
  ACADEMIC_SEARCH_REQUEST: {
    query: 'string',
    sources: 'array?',
    max_results: 'number?',
    download_pdfs: 'boolean?'
  },
  
  PDF_PROCESSING_REQUEST: {
    file_path: 'string',
    extract_tables: 'boolean?',
    extract_text: 'boolean?',
    ocr_enabled: 'boolean?'
  },
  
  // Server -> Client Payloads
  TASK_STARTED: {
    task_id: 'string',
    task_type: 'string',
    blueprint: 'string',
    status: 'string',
    message: 'string',
    timestamp: 'number',
    estimated_duration: 'number?'
  },
  
  PROGRESS_UPDATE: {
    task_id: 'string',
    task_type: 'string',
    blueprint: 'string',
    progress: 'number', // 0-100
    status: 'string',
    message: 'string',
    stats: 'object',
    timestamp: 'number',
    details: 'object?',
    stage: 'string?',
    estimated_remaining: 'number?'
  },
  
  TASK_COMPLETED: {
    task_id: 'string',
    task_type: 'string',
    blueprint: 'string',
    status: 'string',
    message: 'string',
    progress: 'number', // Should be 100
    stats: 'object',
    output_file: 'string?',
    output_files: 'array?', // For multiple files
    duration_seconds: 'number',
    timestamp: 'number',
    success_count: 'number?',
    error_count: 'number?'
  },
  
  TASK_ERROR: {
    task_id: 'string',
    task_type: 'string',
    blueprint: 'string',
    status: 'string',
    error: 'string',
    error_code: 'string?',
    error_details: 'object?',
    stats: 'object',
    progress: 'number',
    timestamp: 'number',
    retry_possible: 'boolean?',
    suggested_action: 'string?'
  },
  
  // Blueprint-specific payloads
  FILE_PROCESSED: {
    task_id: 'string',
    file_path: 'string',
    file_size: 'number',
    processing_time: 'number',
    chunks_created: 'number?',
    timestamp: 'number'
  },
  
  PLAYLIST_VIDEO_PROGRESS: {
    task_id: 'string',
    video_url: 'string',
    video_title: 'string',
    progress: 'number',
    downloaded_bytes: 'number',
    total_bytes: 'number',
    speed_bps: 'number?',
    eta_seconds: 'number?'
  },
  
  PDF_DOWNLOAD_PROGRESS: {
    task_id: 'string',
    pdf_url: 'string',
    pdf_title: 'string?',
    progress: 'number',
    downloaded_bytes: 'number',
    total_bytes: 'number',
    speed_bps: 'number?'
  },
  
  ACADEMIC_PAPER_FOUND: {
    task_id: 'string',
    paper_id: 'string',
    title: 'string',
    authors: 'array',
    source: 'string',
    doi: 'string?',
    arxiv_id: 'string?',
    pdf_url: 'string?'
  },
  
  CROSS_PLATFORM_STATUS: {
    server_platform: 'string', // 'linux', 'windows', 'mac'
    client_platform: 'string',
    path_conversion_active: 'boolean',
    windows_client_support: 'boolean'
  }
});

/**
 * Helper to create event payload with validation
 * @param {string} eventType - Event type
 * @param {Object} data - Event data
 * @returns {Object} Validated payload
 */
export function createEventPayload(eventType, data) {
  const schema = EVENT_PAYLOADS[eventType];
  if (!schema) {
    console.warn(`No schema defined for event type: ${eventType}`);
    return data;
  }
  
  const payload = {};
  Object.keys(schema).forEach(key => {
    const type = schema[key];
    const isOptional = type.endsWith('?');
    const actualType = isOptional ? type.slice(0, -1) : type;
    
    if (data[key] === undefined && !isOptional) {
      console.warn(`Missing required field '${key}' for event ${eventType}`);
    }
    
    if (data[key] !== undefined) {
      const valueType = Array.isArray(data[key]) ? 'array' : typeof data[key];
      if (valueType !== actualType && actualType !== 'object') {
        console.warn(`Type mismatch for field '${key}' in event ${eventType}: expected ${actualType}, got ${valueType}`);
      }
      payload[key] = data[key];
    }
  });
  
  return payload;
}

/**
 * Get all events for a specific Blueprint
 * @param {string} blueprint - Blueprint name
 * @returns {Object} Blueprint events
 */
export function getBlueprintEvents(blueprint) {
  return BLUEPRINT_EVENTS[blueprint] || {};
}

/**
 * Check if event is a progress event
 * @param {string} eventName - Event name
 * @returns {boolean} Is progress event
 */
export function isProgressEvent(eventName) {
  return eventName.includes('progress') || 
         eventName === SOCKET_EVENTS.SERVER_TO_CLIENT.PROGRESS_UPDATE;
}

/**
 * Check if event is an error event
 * @param {string} eventName - Event name
 * @returns {boolean} Is error event
 */
export function isErrorEvent(eventName) {
  return eventName.includes('error') || 
         eventName.includes('failed') ||
         eventName === SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_ERROR;
}

/**
 * Check if event is a completion event
 * @param {string} eventName - Event name
 * @returns {boolean} Is completion event
 */
export function isCompletionEvent(eventName) {
  return eventName.includes('completed') || 
         eventName.includes('finished') ||
         eventName === SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_COMPLETED;
}

/**
 * Get Blueprint from task type
 * @param {string} taskType - Task type
 * @returns {string} Blueprint name
 */
export function getBlueprintFromTaskType(taskType) {
  const taskToBlueprintMap = {
    'file_processing': 'file_processor',
    'playlist_download': 'playlist_downloader',
    'web_scraping': 'web_scraper',
    'academic_search': 'academic_search',
    'pdf_processing': 'pdf_processor'
  };
  
  return taskToBlueprintMap[taskType] || 'unknown';
}

/**
 * Get event category for routing
 * @param {string} eventName - Event name
 * @returns {string} Event category
 */
export function getEventCategory(eventName) {
  if (eventName.includes('task') || eventName.includes('progress')) return 'task';
  if (eventName.includes('file')) return 'file';
  if (eventName.includes('playlist') || eventName.includes('video')) return 'playlist';
  if (eventName.includes('pdf')) return 'pdf';
  if (eventName.includes('scrape') || eventName.includes('url')) return 'scraper';
  if (eventName.includes('academic') || eventName.includes('paper')) return 'academic';
  if (eventName.includes('system') || eventName.includes('blueprint')) return 'system';
  if (eventName.includes('connection') || eventName.includes('connect')) return 'connection';
  return 'general';
}

/**
 * Create progress deduplication key
 * @param {string} taskId - Task ID
 * @param {number} progress - Progress value
 * @returns {string} Deduplication key
 */
export function createProgressDedupeKey(taskId, progress) {
  // Round progress to avoid excessive updates
  const roundedProgress = Math.floor(progress * 10) / 10; // Round to 1 decimal
  return `${taskId}_${roundedProgress}`;
}

/**
 * Export individual event groups for convenience
 */
export const CONNECTION_EVENTS = SOCKET_EVENTS.CONNECTION;
export const CLIENT_EVENTS = SOCKET_EVENTS.CLIENT_TO_SERVER;
export const SERVER_EVENTS = SOCKET_EVENTS.SERVER_TO_CLIENT;

// Commonly used events grouped by functionality
export const TASK_EVENTS = {
  STARTED: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_STARTED,
  PROGRESS: SOCKET_EVENTS.SERVER_TO_CLIENT.PROGRESS_UPDATE,
  COMPLETED: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_COMPLETED,
  ERROR: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_ERROR,
  CANCELLED: SOCKET_EVENTS.SERVER_TO_CLIENT.TASK_CANCELLED
};

// Cross-platform specific events
export const CROSS_PLATFORM_EVENTS = {
  STATUS: SOCKET_EVENTS.SERVER_TO_CLIENT.CROSS_PLATFORM_STATUS,
  PATH_CONVERSION: 'path_conversion_status',
  WINDOWS_CLIENT_READY: 'windows_client_ready',
  LINUX_SERVER_STATUS: 'linux_server_status'
};

// Export Blueprint-specific event collections
export const FILE_PROCESSOR_EVENTS = BLUEPRINT_EVENTS.file_processor;
export const PLAYLIST_EVENTS = BLUEPRINT_EVENTS.playlist_downloader;
export const SCRAPER_EVENTS = BLUEPRINT_EVENTS.web_scraper;
export const ACADEMIC_EVENTS = BLUEPRINT_EVENTS.academic_search;
export const PDF_EVENTS = BLUEPRINT_EVENTS.pdf_processor;