# Route Mapping Guide for app.refactor.py

## Updated Status (May 27, 2025)
- **Total Routes**: 55
- **Routes Moved**: 25 (marked with @app.route decorator only)
- **Routes Remaining**: 30 (with full implementation)

### Core Routes → `blueprints/core/routes.py`
1. `/` - Home page - 
2. `/test-modules` - Module testing page
3. `/diagnostics` - System diagnostics
4. `/module-diagnostics-complete` - Module diagnostics page
5. `/endpoint-dashboard` - Endpoint dashboard
6. `/shutdown` - Server shutdown endpoint

Completed.  Please verify imports, logic, etc. 

### File Processor Routes → `blueprints/features/file_processor.py`
1. `/api/upload-for-path-detection` - Upload for path detection
2. `/api/detect-path` - Path detection
3. `/api/verify-path` - Path verification
4. `/api/create-directory` - Directory creation
5. `/api/get-output-filepath` - Output filepath resolution
6. `/api/check-file-exists` - File existence check
7. `/api/get-default-output-folder` - Default folder retrieval
8. `/api/process` - Main file processing
9. `/api/status/<task_id>` - Task status
10. `/api/download/<task_id>` - Download result
11. `/download/<path:filename>` - Direct file download
12. `/api/open/<task_id>` - Open result file
13. `/api/open-file` - Open arbitrary file
14. `/api/open-folder` - Open folder in explorer

### Playlist Downloader Routes → `blueprints/features/playlist_downloader.py`
1. `/api/start-playlists` - Start playlist download

### Web Scraper Routes → `blueprints/features/web_scraper.py`
1. `/api/scrape2` - Web scraping v2
2. `/api/scrape2/status/<task_id>` - Scraping status
3. `/api/scrape2/cancel/<task_id>` - Cancel scraping
4. `/api/download-pdf` - Download PDF from URL
5. `/download-pdf/<path:pdf_path>` - Download local PDF
6. `/download-file/<path:file_path>` - Download any file

### PDF Processing Routes → Create `blueprints/features/pdf_processor.py`
1. `/api/pdf/process` - Process PDF
2. `/api/pdf/extract-tables` - Extract tables from PDF
3. `/api/pdf/detect-type` - Detect PDF document type
4. `/api/pdf/analyze` - Analyze PDF structure
5. `/api/pdf/batch-process` - Batch process PDFs
6. `/api/pdf/status/<task_id>` - PDF processing status
7. `/api/pdf/cancel/<task_id>` - Cancel PDF processing
8. `/api/pdf-capabilities` - Get PDF processing capabilities

### API Key Management Routes → `blueprints/api/management.py`
1. `/api/keys` - List API keys
2. `/api/keys/create` - Create API key
3. `/api/keys/revoke` - Revoke API key
4. `/key-manager` - API key manager UI

### Task Management Routes → `blueprints/api/management.py`
1. `/api/task/<task_id>/stats` - Task statistics
2. `/api/task/<task_id>/stats/export` - Export task stats
3. `/api/tasks/history` - Task history
4. `/api/tasks/analytics` - Task analytics
5. `/api/emergency-stop` - Emergency stop all tasks
6. `/api/cancel/<task_id>` - Cancel specific task

### Academic Search Routes → `blueprints/features/academic_search.py`
1. `/api/academic/health` - Academic API health check
2. `/api/academic/search` - Academic search
3. `/api/academic/multi-source` - Multi-source search
4. `/api/academic/details/<path:id>` - Paper details
5. `/api/academic/download/<path:id>` - Download paper
6. `/api/academic/citations/<path:id>` - Get citations
7. `/api/academic/recommendations/<path:id>` - Get recommendations
8. `/api/academic/bulk/download` - Bulk download papers
9. `/api/academic/analyze/<path:id>` - Analyze paper
10. `/api/academic/extract` - Extract academic content
Status:  Validation Complete. 

## Routes Still in app.refactor.py (Line Numbers)

### Core Routes → `blueprints/core/routes.py`
- `/` (line 2680)
- `/test-modules` (line 2684)
- `/diagnostics` (line 2933)
- `/module-diagnostics-complete` (line 2937)
- `/endpoint-dashboard` (line 2942)
Status:  Validation Complete. 

### File Processor Routes → `blueprints/features/file_processor.py`
- `/api/upload-for-path-detection` (line 2948)
- `/api/detect-path` (line 2976)
- `/api/verify-path` (line 3856)
- `/api/create-directory` (line 3860)
- `/api/get-output-filepath` (line 3864)
- `/api/check-file-exists` (line 3901)
- `/api/get-default-output-folder` (line 3977)
- `/api/process` (line 3992)
- `/api/status/<task_id>` (line 3995)
- `/api/download/<task_id>` (line 3998)
- `/download/<path:filename>` (line 4001)
- `/api/open/<task_id>` (line 4004)
- `/api/open-file` (line 4007)
- `/api/open-folder` (line 5009)

### Playlist Routes → `blueprints/features/playlist_downloader.py`
- `/api/start-playlists` (line 4049)

### Web Scraper Routes → `blueprints/features/web_scraper.py`
- `/api/scrape2` (line 5035)
- `/api/scrape2/status/<task_id>` (line 5368)
- `/api/scrape2/cancel/<task_id>` (line 5372)
- `/api/download-pdf` (line 4757)
- `/download-pdf/<path:pdf_path>` (line 4909)
- `/download-file/<path:file_path>` (line 4974)

### Task Management Routes → `blueprints/api/management.py`
- `/api/task/<task_id>/stats` (line 3696)
- `/api/task/<task_id>/stats/export` (line 3750)
- `/api/tasks/history` (line 3846)
- `/api/tasks/analytics` (line 3850)
- `/api/emergency-stop` (line 4497)
- `/api/cancel/<task_id>` (line 4556)

### Academic Search Routes → `blueprints/features/academic_search.py`
All academic routes need to be implemented in academic_search.py

## Remaining Functions to Move

### Functions Still in app.refactor.py

#### Utility Functions → `blueprints/core/utils.py`
- `structured_error_response()` (lines 1139, 4038) - DUPLICATE, needs deduplication
- Other utility functions listed in REFACTORING_GUIDE.md

#### Task History Function → `blueprints/api/management.py`
- `add_task_to_history()` (line 3810) - Task history tracking

#### Cancellation Function → Already in `blueprints/core/services.py` ✅
- `is_force_cancelled()` (line 4444) - But uses different variables than services.py version

### Task-Related Functions → `blueprints/core/services.py`
- `add_task()` - Already moved ✓
- `get_task()` - Already moved ✓
- `remove_task()` - Already moved ✓

### HTTP/Download Functions → `blueprints/core/http_client.py` or feature blueprints
- `download_pdf()` - PDF download logic (lines 800-913)
- Request session setup - Already in http_client.py ✓

### Academic API Functions → `blueprints/features/academic_search.py`
- All academic search implementation functions
- Paper analysis functions
- Citation network functions

### PDF Processing Functions → Create `blueprints/features/pdf_processor.py`
- PDF extraction functions
- Table extraction logic
- Document type detection

### WebSocket/SocketIO Handlers → `blueprints/socketio_events.py`
- All @socketio.on handlers should already be centralized

## Blueprint Creation Status

### Existing Blueprints
- ✅ `blueprints/core/routes.py`
- ✅ `blueprints/core/services.py`
- ✅ `blueprints/features/file_processor.py`
- ✅ `blueprints/features/playlist_downloader.py`
- ✅ `blueprints/features/web_scraper.py`
- ✅ `blueprints/features/academic_search.py`
- ✅ `blueprints/api/management.py`
- ✅ `blueprints/socketio_events.py`

### New Blueprint Needed
- ⬜ `blueprints/features/pdf_processor.py` - For PDF-specific routes

## Migration Priority

1. **High Priority**: Move all route handlers to appropriate blueprints
2. **Medium Priority**: Move supporting functions near their routes
3. **Low Priority**: Clean up imports and remove duplicate code