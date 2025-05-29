# NeuroGen Server - Task Classes Refactoring Guide

## Current Architecture Analysis

### ✅ Progress Update (May 27, 2025)

**Completed:**
1. ✅ Task classes (`BaseTask`, `ProcessingTask`, `PlaylistTask`, `ScraperTask`) moved to `services.py`
2. ✅ Task management functions (`add_task`, `get_task`, `remove_task`) added to `services.py`
3. ✅ Global variables (`active_tasks`, `tasks_lock`) moved to `services.py`
4. ✅ Configuration constants added to `services.py`
5. ✅ `app_new.py` created as clean Flask Blueprint entry point
6. ✅ First 1000 lines of `app.refactor.py` analyzed and placement determined
7. ✅ Core utility modules created with templates:
   - `blueprints/core/utils.py` - General utilities
   - `blueprints/core/structify_integration.py` - Structify module management
   - `blueprints/core/ocr_config.py` - OCR and PDF configuration
   - `blueprints/core/cleanup.py` - Cleanup utilities
   - `blueprints/core/http_client.py` - HTTP client configuration
8. ✅ Core module `__init__.py` updated with proper exports

**In Progress:**
- Moving initialization code from `app.refactor.py` to new core modules
- Updating feature blueprints to import from core modules

### Validation Results

After analyzing the refactoring efforts with `socketio_events.py`, `file_processor.py`, and `playlist_downloader.py`, here's the assessment:

✅ **Strengths of Current Refactoring:**
1. **Clean separation of concerns** - SocketIO events centralized in one module
2. **Blueprint-based organization** - Feature-specific routing and logic
3. **Proper event emission helpers** - Reusable functions for progress updates
4. **Task classes properly centralized** - All in `services.py` with proper inheritance

⚠️ **Remaining Work:**
1. **Import updates needed** - Feature blueprints need to import from `services.py`
2. **Utility functions** - Need to be extracted to appropriate modules
3. **Route handlers** - Need to be moved from `app.refactor.py` to blueprints

## Recommended Architecture

### Option 1: Task Classes in `blueprints/core/services.py` ✅ (RECOMMENDED)

**Advantages:**
- Centralized task management system
- Clear inheritance hierarchy with `BaseTask`
- Shared by all feature blueprints
- Single source of truth for task logic

**Structure:**
```python
blueprints/
├── core/
│   ├── services.py          # BaseTask, TaskManager, ApiKeyManager, Limiter
│   └── routes.py            # Core routes
├── features/
│   ├── file_processor.py    # ProcessingTask imported from services
│   ├── playlist_downloader.py # PlaylistTask imported from services
│   └── web_scraper.py       # ScrapingTask imported from services
└── socketio_events.py       # Event handlers using task classes
```

### Option 2: Task Classes in Feature Modules ❌ (NOT RECOMMENDED)

**Why not:**
- Violates DRY principle - `BaseTask` would need duplication
- Circular dependency issues between modules
- Harder to maintain consistent task behavior

### Option 3: Separate Task Module ⚠️ (ALTERNATIVE)

**Structure:**
```python
blueprints/
├── core/
│   ├── services.py
│   ├── tasks.py            # NEW: All task classes here
│   └── routes.py
```

**Consider only if:**
- Task classes become very large (>1000 lines)
- Need complex task-specific utilities

## Implementation Plan

### Step 1: Consolidate Task Classes in `services.py`

```python
# blueprints/core/services.py

import threading
import time
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Union

class BaseTask(ABC):
    """Base class for all background processing tasks"""
    
    def __init__(self, task_id: str, task_type: str):
        self.task_id = task_id
        self.task_type = task_type
        self.progress = 0
        self.status = "pending"
        self.message = ""
        self.stats = {}
        self.error_message = None
        self.start_time = time.time()
        self.thread = None
        self.is_cancelled_flag = False
        
    @abstractmethod
    def process(self):
        """Override this method with actual processing logic"""
        pass
        
    def start(self):
        """Start task in background thread"""
        self.status = "processing"
        self.thread = threading.Thread(target=self._run)
        self.thread.daemon = True
        self.thread.start()
        
    def _run(self):
        """Internal run method with error handling"""
        try:
            self.process()
            if not self.is_cancelled_flag:
                self.status = "completed"
                self.progress = 100
        except Exception as e:
            self.status = "failed"
            self.error_message = str(e)
            logger.error(f"Task {self.task_id} failed: {e}")
            
    def cancel(self):
        """Cancel the task"""
        self.is_cancelled_flag = True
        self.status = "cancelled"


class ProcessingTask(BaseTask):
    """File processing task implementation"""
    
    def __init__(self, task_id: str, input_dir: str, output_path: str):
        super().__init__(task_id, "file_processing")
        self.input_dir = input_dir
        self.output_path = output_path
        
    def process(self):
        # Implementation moved from separate module
        pass


class PlaylistTask(BaseTask):
    """YouTube playlist download task"""
    
    def __init__(self, task_id: str):
        super().__init__(task_id, "playlist_download")
        self.playlists = []
        self.root_directory = None
        self.output_file = None
        
    def process(self):
        # Implementation moved from separate module
        pass


class TaskManager:
    """Centralized task management"""
    
    def __init__(self):
        self.tasks = {}
        self._lock = threading.Lock()
        
    def add_task(self, task_id: str, task: BaseTask):
        with self._lock:
            self.tasks[task_id] = task
            
    def get_task(self, task_id: str) -> Optional[BaseTask]:
        return self.tasks.get(task_id)
        
    def remove_task(self, task_id: str):
        with self._lock:
            self.tasks.pop(task_id, None)
```

### Step 2: Update Feature Blueprints

```python
# blueprints/features/file_processor.py

from blueprints.core.services import ProcessingTask, TaskManager

# Get shared task manager instance
task_manager = TaskManager()

@file_processor_bp.route('/process', methods=['POST'])
def start_processing():
    # Create task using imported class
    task = ProcessingTask(task_id, input_dir, output_path)
    task_manager.add_task(task_id, task)
    task.start()
```

### Step 3: Update SocketIO Events

```python
# blueprints/socketio_events.py

from blueprints.core.services import TaskManager

def register_socketio_events(socketio, task_manager):
    """Register events with task manager access"""
    
    @socketio.on('cancel_task')
    def handle_cancel_task(data):
        task_id = data.get('task_id')
        task = task_manager.get_task(task_id)
        if task:
            task.cancel()
```

## Migration Steps

1. **Extract task classes from `app.py`**
   - Copy `BaseTask`, `ProcessingTask`, `PlaylistTask`, etc.
   - Remove Flask-specific dependencies
   - Keep only core task logic

2. **Add to `services.py`**
   - Place after existing `ApiKeyManager` and `Limiter` classes
   - Add `TaskManager` for centralized management
   - Import necessary dependencies

3. **Update imports in blueprints**
   - Remove undefined class references
   - Import from `blueprints.core.services`
   - Use shared `TaskManager` instance

4. **Test each module**
   - File processor functionality
   - Playlist downloader functionality
   - SocketIO event handling

## Benefits of This Approach

1. **Maintainability** - Single location for all task logic
2. **Reusability** - BaseTask shared across all features
3. **Testability** - Easy to unit test task classes
4. **Scalability** - Easy to add new task types
5. **Consistency** - All tasks follow same pattern

## Preventing Circular Imports

### Import Hierarchy Rules

To prevent circular imports, follow this strict hierarchy:

```
1. Core Utilities (no dependencies)
   ├── blueprints/core/utils.py
   ├── blueprints/core/http_client.py
   └── blueprints/core/cleanup.py

2. Core Services (depends on utilities only)
   ├── blueprints/core/services.py (BaseTask, TaskManager, etc.)
   ├── blueprints/core/structify_integration.py
   └── blueprints/core/ocr_config.py

3. Feature Blueprints (depends on core only)
   ├── blueprints/features/file_processor.py
   ├── blueprints/features/web_scraper.py
   ├── blueprints/features/playlist_downloader.py
   └── blueprints/features/academic_search.py

4. SocketIO Events (depends on features and core)
   └── blueprints/socketio_events.py

5. Main App (imports all blueprints)
   └── app_new.py
```

### Best Practices to Avoid Circular Imports

1. **Never import from higher layers**
   - Core modules should never import from features
   - Features should never import from socketio_events
   - Utils should never import from services

2. **Use dependency injection**
   ```python
   # Instead of importing TaskManager globally
   def register_socketio_events(socketio, task_manager):
       # Pass task_manager as parameter
   ```

3. **Lazy imports for optional dependencies**
   ```python
   def process_file():
       from blueprints.core.structify_integration import structify_module
       # Import only when needed
   ```

4. **Create interfaces/protocols**
   ```python
   # In core/interfaces.py
   from typing import Protocol
   
   class TaskInterface(Protocol):
       def start(self): ...
       def cancel(self): ...
   ```

## Remaining Tasks from app.refactor.py

### Functions to Move (Lines 1000+)

1. **Route Handlers** → Feature Blueprints
   - `/api/process` → `file_processor.py`
   - `/api/scrape` → `web_scraper.py`
   - `/api/playlist` → `playlist_downloader.py`

2. **Utility Functions** → `blueprints/core/utils.py`
   - `structured_error_response()`
   - `validate_api_key()`
   - `format_time_duration()`

3. **Academic API Routes** → `blueprints/features/academic_search.py`
   - All `/api/academic/*` routes
   - Academic search helper functions

4. **Task History** → `blueprints/api/management.py`
   - `/api/history` routes
   - Task tracking functions

5. **WebSocket Handlers** → `blueprints/socketio_events.py`
   - Connection handlers
   - Progress update handlers
   - Task management events

## Core Modules Created ✅

All core utility modules have been created with proper templates:

1. **`blueprints/core/utils.py`** ✅
   - `setup_logging()` - Logging configuration
   - `sanitize_filename()` - Safe filename generation
   - `normalize_path()` - Path normalization
   - `safe_split()` - Safe string splitting
   - `ensure_temp_directory()` - Temp directory setup
   - `get_output_filepath()` - Output path resolution
   - `resolve_output_path()` - Path resolution with directory creation
   - `detect_common_path_from_files()` - Common path detection
   - `format_time_duration()` - Human-readable time formatting
   - `structured_error_response()` - API error responses

2. **`blueprints/core/structify_integration.py`** ✅
   - `initialize_structify()` - Module initialization
   - `process_file()` - File processing with structify
   - Global exports: `structify_module`, `structify_available`, `FileStats`, `process_all_files`

3. **`blueprints/core/ocr_config.py`** ✅
   - `setup_ocr_environment()` - OCR environment configuration
   - `configure_pytesseract()` - Tesseract path configuration
   - `ensure_tessdata_files()` - Language data management
   - `download_tessdata()` - Tessdata downloading
   - `initialize_pdf_extractor()` - PDF extractor setup
   - `initialize_safe_ocr_handler()` - Safe OCR handler setup

4. **`blueprints/core/cleanup.py`** ✅
   - `cleanup_temp_files()` - Remove old temp files
   - `cleanup_old_directories()` - Remove old temp directories
   - `start_periodic_cleanup()` - Periodic cleanup service
   - `stop_periodic_cleanup()` - Stop cleanup service
   - `cleanup_task_artifacts()` - Clean task-specific files

5. **`blueprints/core/http_client.py`** ✅
   - `create_session()` - Create HTTP session with retries
   - `get_session()` - Get global session instance
   - `download_file()` - Download files with retry logic
   - `make_request()` - Make HTTP requests
   - `test_connection()` - Test HTTP connectivity

6. **`blueprints/core/__init__.py`** ✅
   - Exports all public interfaces from core modules
   - Provides easy import path for other blueprints

## Migration Guide for app.refactor.py

### Lines 1-186: Initialization Code
Move to **`blueprints/core/structify_integration.py`** and **`blueprints/core/ocr_config.py`**:
- Structify module initialization → `structify_integration.py`
- OCR/Tesseract setup → `ocr_config.py`
- PDF extractor setup → `ocr_config.py`

### Lines 270-300: Utility Functions
Move to **`blueprints/core/utils.py`**:
- `setup_logging()` function

### Lines 458-504: CLI Main Function
Create new file **`cli.py`** at project root or move to a dedicated CLI module

### Lines 506-671: Cleanup & Utility Functions
Move to appropriate core modules:
- `download_tessdata()`, `ensure_tessdata_files()` → `ocr_config.py`
- `ensure_temp_directory()` → `utils.py`
- `get_output_filepath()`, `resolve_output_path()` → `utils.py`
- `safe_split()` → `utils.py`
- `cleanup_temp_files()`, `start_periodic_cleanup()` → `cleanup.py`

### Lines 672-797: Process File Function
Move to **`blueprints/core/structify_integration.py`**:
- Complete `process_file()` implementation

### Lines 800-913: Download PDF Function
Move to **`blueprints/features/web_scraper.py`** or create `blueprints/core/pdf_utils.py`

### Lines 914-1000: Path Utilities
Move to **`blueprints/core/utils.py`**:
- `sanitize_filename()`
- `normalize_path()`
- `detect_common_path_from_files()`

### Flask Routes (55 total routes)
**See ROUTE_MAPPING.md for complete route distribution**

#### Core Routes (6) → `blueprints/core/routes.py`
- `/`, `/test-modules`, `/diagnostics`, `/module-diagnostics-complete`, `/endpoint-dashboard`, `/shutdown`

#### File Processor Routes (14) → `blueprints/features/file_processor.py`
- All `/api/process`, `/api/verify-path`, `/api/download/*`, `/api/open/*` routes

#### Playlist Routes (1) → `blueprints/features/playlist_downloader.py`
- `/api/start-playlists`

#### Web Scraper Routes (6) → `blueprints/features/web_scraper.py`
- `/api/scrape2/*`, `/api/download-pdf`, `/download-pdf/*`

#### PDF Processing Routes (8) → Create new `blueprints/features/pdf_processor.py`
- All `/api/pdf/*` routes

#### Academic Routes (10) → `blueprints/features/academic_search.py`
- All `/api/academic/*` routes

#### API Management Routes (10) → `blueprints/api/management.py`
- `/api/keys/*`, `/api/task/*`, `/api/tasks/*`, `/api/cancel/*`, `/api/emergency-stop`

## Import Updates Required

### Feature Blueprints Should Import From Core:
```python
# blueprints/features/file_processor.py
from blueprints.core import (
    ProcessingTask, add_task, get_task, remove_task,
    structify_module, process_file,
    sanitize_filename, normalize_path
)

# blueprints/features/playlist_downloader.py
from blueprints.core import (
    PlaylistTask, add_task, get_task,
    sanitize_filename, ensure_temp_directory
)

# blueprints/features/web_scraper.py
from blueprints.core import (
    ScraperTask, add_task, get_task,
    get_session, download_file
)
```

## Functions Still in app.refactor.py

### Initialization Code (Lines 1-259)
**Location**: Should be moved to appropriate core modules
- Lines 1-26: Imports and eventlet monkey patching → `app_new.py`
- Lines 27-52: Structify module initialization → `blueprints/core/structify_integration.py`
- Lines 53-77: Temp directory and OCR setup → `blueprints/core/ocr_config.py`
- Lines 78-111: Pytesseract configuration → `blueprints/core/ocr_config.py`
- Lines 112-158: PDF extractor initialization → `blueprints/core/ocr_config.py`
- Lines 159-177: Safe OCR handler setup → `blueprints/core/ocr_config.py`
- Lines 178-259: Academic API imports → `blueprints/features/academic_search.py`

### Utility Functions (Lines 260-1036)
- `setup_logging()` (line 260) → `blueprints/core/utils.py`
- Error handlers (lines 310-318) → `blueprints/core/routes.py`
- `main()` CLI function (line 448) → separate `cli.py` file or remove
- `download_tessdata()` (line 496) → `blueprints/core/ocr_config.py`
- `ensure_tessdata_files()` (line 520) → `blueprints/core/ocr_config.py`
- `ensure_temp_directory()` (line 549) → `blueprints/core/utils.py`
- `get_output_filepath()` (line 573) → `blueprints/core/utils.py`
- `resolve_output_path()` (line 578) → `blueprints/core/utils.py`
- `safe_split()` (line 593) → `blueprints/core/utils.py`
- `cleanup_temp_files()` (line 617) → `blueprints/core/cleanup.py`
- `start_periodic_cleanup()` (line 645) → `blueprints/core/cleanup.py`
- `process_file()` (line 663) → `blueprints/core/structify_integration.py`
- `download_pdf()` (line 790) → `blueprints/features/web_scraper.py` or `blueprints/core/pdf_utils.py`
- `sanitize_filename()` (line 904) → `blueprints/core/utils.py`
- `normalize_path()` (line 929) → `blueprints/core/utils.py`
- `detect_common_path_from_files()` (line 957) → `blueprints/core/utils.py`
- `find_directory_in_standard_locations()` (line 995) → `blueprints/core/utils.py`
- `get_parent_directory()` (line 1036) → `blueprints/core/utils.py`

### Global Variables Still in app.refactor.py
- `active_tasks = {}` (line 445) → Already moved to `blueprints/core/services.py` ✅
- `tasks_lock = threading.Lock()` (line 446) → Already moved to `blueprints/core/services.py` ✅

### Routes Still in app.refactor.py (30 routes remaining)
See ROUTE_MAPPING.md for complete list and destinations.

## Current Status Summary

### ✅ Completed
1. Created all core utility modules with templates
2. Moved configuration constants to centralized config.py
3. Fixed circular imports (removed socketio_events from file_processor)
4. Cleaned up duplicate `active_tasks` in management.py (now `api_task_registry`)
5. Validated import hierarchy - no circular dependencies

### ⚠️ Issues Found
1. **Duplicate function**: `structured_error_response()` appears twice in app.refactor.py (lines 1139, 4038)
2. **Different implementations**: `is_force_cancelled()` in app.refactor.py uses different variables than services.py
3. **Missing imports**: Some functions in file_processor.py needed imports from core modules

### 📋 Next Steps

1. ⬜ Move initialization code from `app.refactor.py` lines 1-259
   - Eventlet setup → app_new.py
   - Structify init → structify_integration.py
   - OCR/PDF setup → ocr_config.py
   - Academic imports → academic_search.py

2. ⬜ Move utility functions from `app.refactor.py` lines 260-1036
   - All listed functions → their designated modules

3. ⬜ Move remaining 30 route handlers to designated blueprints
   - See ROUTE_MAPPING.md for exact line numbers

4. ⬜ Create missing `blueprints/features/pdf_processor.py`
   - For PDF-specific routes (8 routes)

5. ⬜ Deduplicate and reconcile duplicate functions

6. ⬜ Test complete refactored system

7. ⬜ Update `app_new.py` with proper initialization

8. ⬜ Remove `app.refactor.py` once migration complete