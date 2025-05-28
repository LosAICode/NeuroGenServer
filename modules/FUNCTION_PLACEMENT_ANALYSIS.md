# Function Placement Analysis Report

## Web Scraper Blueprint Analysis

### ✅ Functions That Should STAY in web_scraper.py:
1. **scrape2()** - Main web scraping endpoint
2. **scrape2_status()** - Scraping task status 
3. **cancel_scrape2()** - Cancel scraping tasks
4. **emit_scraping_progress()** - SocketIO progress emissions
5. **emit_scraping_completed()** - SocketIO completion events
6. **emit_scraping_error()** - SocketIO error events

### ❌ Functions That Should MOVE FROM web_scraper.py:

#### → Move to pdf_processor.py:
1. **api_download_pdf()** - `/download-pdf` endpoint (lines 127-277)
   - Pure PDF downloading and processing functionality
   - Includes Structify integration, table extraction, OCR
2. **download_pdf_file()** - `/download-pdf/<path:pdf_path>` endpoint (lines 279-342)
   - PDF file serving with security checks

#### → Move to core/routes.py or new file_handler blueprint:
3. **download_file_attachment()** - `/download-file/<path:file_path>` endpoint (lines 344-377)
   - General file download functionality (not PDF-specific)

## App.refactor.py Routes Analysis

### Routes Already Migrated to Blueprints:
- ✅ **PDF routes** (lines 4551-4921): Already in pdf_processor.py
- ✅ **Academic routes** (lines 5016-5035): Already in academic_search.py  
- ✅ **File processing routes** (lines 3738-3753): Already in file_processor.py
- ✅ **Web scraping routes** (lines 4540-4545): Already in web_scraper.py

### Routes That Need Migration:

#### → Move to **core/routes.py**:
1. `@app.route("/")` (line 2680) - Home page
2. `@app.route("/test-modules")` (line 2683) - Module testing page
3. `@app.route("/diagnostics")` (line 2686) - Diagnostics page
4. `@app.route("/module-diagnostics-complete")` (line 2688) - Complete diagnostics
5. `@app.route("/endpoint-dashboard")` (line 2691) - Endpoint dashboard
6. `@app.route("/key-manager")` (line 4999) - API key management page
7. `@app.route("/shutdown", methods=["POST"])` (line 5014) - Server shutdown

#### → Move to **api/management.py**:
8. `@app.route("/api/task/<task_id>/stats", methods=["GET"])` (line 3442) - Task statistics
9. `@app.route("/api/task/<task_id>/stats/export", methods=["GET"])` (line 3496) - Export stats
10. `@app.route("/api/tasks/history", methods=["GET"])` (line 3592) - Task history
11. `@app.route("/api/tasks/analytics", methods=["GET"])` (line 3596) - Task analytics
12. `@app.route("/api/emergency-stop", methods=["POST"])` (line 4243) - Emergency stop
13. `@app.route("/api/cancel/<task_id>", methods=["POST"])` (line 4302) - Cancel tasks
14. `@app.route("/api/keys", methods=["GET"])` (line 4948) - API key listing
15. `@app.route("/api/keys/create", methods=["POST"])` (line 4963) - Create API keys
16. `@app.route("/api/keys/revoke", methods=["POST"])` (line 4981) - Revoke API keys

#### → Move to **core/utils.py** or new **file_utils** blueprint:
17. `@app.route("/api/upload-for-path-detection", methods=["POST"])` (line 2694) - File upload
18. `@app.route("/api/detect-path", methods=["POST"])` (line 2722) - Path detection
19. `@app.route("/api/verify-path", methods=["POST"])` (line 3602) - Path verification
20. `@app.route("/api/create-directory", methods=["POST"])` (line 3606) - Directory creation
21. `@app.route("/api/get-output-filepath", methods=["POST"])` (line 3610) - Output path
22. `@app.route("/api/check-file-exists", methods=["POST"])` (line 3647) - File existence
23. `@app.route("/api/get-default-output-folder", methods=["GET"])` (line 3723) - Default folder
24. `@app.route("/api/open-file", methods=["POST"])` (line 3753) - Open file
25. `@app.route("/api/open-folder", methods=["POST"])` (line 4511) - Open folder

#### → Move to **playlist_downloader.py**:
26. `@app.route("/api/start-playlists", methods=["POST"])` (line 3795) - Start playlist download

#### → Already exist in current blueprints (duplicates to remove):
27. `@app.route("/api/download-pdf", methods=["POST"])` (line 4503) - **DUPLICATE** in web_scraper.py
28. `@app.route("/download-pdf/<path:pdf_path>")` (line 4506) - **DUPLICATE** in web_scraper.py
29. `@app.route("/download-file/<path:file_path>")` (line 4508) - **DUPLICATE** in web_scraper.py

## Current Blueprint Status:

- **pdf_processor.py**: ✅ 8 routes (complete)
- **web_scraper.py**: ⚠️ 6 routes (needs 2 PDF routes moved OUT)
- **file_processor.py**: ✅ 9 routes (complete)
- **academic_search.py**: ✅ 10 routes (complete)
- **playlist_downloader.py**: ❌ Missing playlist start route
- **core/routes.py**: ❌ Missing 7 basic routes
- **api/management.py**: ❌ Missing 9 management routes
- **file_utils** (new): ❌ Missing 9 utility routes

## Priority Actions:

### High Priority:
1. **Move PDF routes from web_scraper.py to pdf_processor.py**
2. **Add missing route to playlist_downloader.py**
3. **Create file_utils blueprint for utility functions**

### Medium Priority:
4. **Move management routes to api/management.py**
5. **Move basic routes to core/routes.py**

### Low Priority:
6. **Remove duplicate routes from app.refactor.py after migration**