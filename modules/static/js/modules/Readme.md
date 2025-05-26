NeuroGen Server Frontend

A modular JavaScript frontend for the NeuroGen Server. This codebase integrates seamlessly with the backend (Flask+Socket.IO) to provide real-time progress updates, file processing, PDF downloads, and other neural data workflows.
Table of Contents

    Overview

    Folder Structure

    Initialization Flow

    Core Modules

    Feature Modules

    Utilities

    Import & Export Conventions

    Integration with index.js

    Error Handling

    Real-Time Progress & Socket.IO

    Troubleshooting

    Contributing

    Module Refactor Pull Request Template

Overview

The NeuroGen Server Frontend uses a modular architecture to keep the codebase clear, maintainable, and scalable. Each module has a single responsibility, exports consistently, and defers UI element references to a centralized uiRegistry.js.

Key goals:

    Predictable, safe module loading

    Clear boundaries between core modules, feature modules, and utilities

    Real-time progress from the backend’s Socket.IO events, displayed via progress bars or status messages

    Graceful error handling without crashing the UI

Folder Structure

/static/js/
  index.js                # Main entry script for the entire frontend
  modules/
    core/
      app.js              # High-level app orchestration
      moduleLoader.js     # Loads modules (dynamic or static)
      uiRegistry.js       # Safely manages DOM elements
      eventManager.js     # Central event dispatch system
      eventRegistry.js    # Provides event definitions & bindings
      stateManager.js     # Global front-end state management
      errorHandler.js     # Global error capturing & reporting
      themeManager.js     # Dark mode, color scheme, accessibility
    features/
      fileProcessor.js    # File processing & uploading
      webScraper.js       # Scraping functionalities (with progress)
      pdfProcessor.js     # PDF parsing (OCR, chunking)
      playlistDownloader.js  # Playlist logic
      academicSearch.js   # Academic search integr.
      historyManager.js   # Maintains user action history
      helpMode.js         # Onboarding / help overlay
    utils/
      ui.js               # UI helper utilities
      utils.js            # General-purpose utils
      fileHandler.js      # Helper for file read/write (where relevant)
      progressHandler.js  # Real-time progress updates
      socketHandler.js    # Sets up / listens to Socket.IO events
      debugTools.js       # Dev-only logging or debugging

Initialization Flow

    index.js

        Bootstraps the entire frontend by calling moduleLoader.js.

    Core Modules

        moduleLoader.js dynamically imports uiRegistry.js, eventRegistry.js, etc.

        uiRegistry registers DOM elements before feature modules load.

    Feature Modules

        Each feature module (fileProcessor.js, webScraper.js, etc.) is then imported.

        They set up any custom UI interactions, state watchers, or Socket.IO event listeners.

    Utils

        Utility modules are also loaded (some may be lazy-loaded if you prefer).

    Run App

        app.js or index.js calls any final initialization (e.g. hooking UI events to feature methods).

Core Modules

1. app.js

    Orchestrates top-level UI flows and advanced logic. Ties everything together once loaded.

2. moduleLoader.js

    Dynamically loads core, feature, and utility modules.

    Handles path resolution and error isolation.

3. uiRegistry.js

    Central registry for DOM elements.

    Exposes methods like registerCommonElements(), getElement(path).

    Minimizes repeated document.getElementById calls.

4. eventManager.js / eventRegistry.js

    Provide a simple event system.

    eventRegistry.js: the definitions / mapping.

    eventManager.js: logic for listening & triggering events.

5. stateManager.js

    Manages global front-end state (e.g. current tab, processing flags, theme).

6. errorHandler.js

    Captures uncaught exceptions or manual error calls.

    Optionally displays error modals or logs.

7. themeManager.js

    Toggles dark mode, color scheme, accessibility scaling, etc.

Feature Modules

1. fileProcessor.js

    Handles uploading and processing local files.

    Likely calls a back-end route or triggers a Socket.IO “start_task” event.

2. webScraper.js

    Scrapes external URLs, updates progress in real time.

    Possibly uses progressHandler.js or socketHandler.js for progress events.

3. pdfProcessor.js

    Deeper PDF logic (OCR, chunking). If it calls the back end, watch for socketio.emit('pdf_processing_progress', ...) events.

4. playlistDownloader.js

    Download & handle YouTube or other playlists. Integrates with the back end for concurrency.

5. academicSearch.js

    Ties to the “academicApiClient” or app.py routes for searching academic papers. Possibly triggers tasks for PDF download.

6. Others

    historyManager.js, helpMode.js — specialized functionalities that rely on or manipulate the uiRegistry, stateManager, or eventRegistry.

Utilities

1. ui.js

    UI-level helper methods (e.g. toggling visibility, styling updates).

2. utils.js

    General logic not specific to UI or tasks (string manipulations, date/time, etc.).

3. fileHandler.js

    Additional file read/write convenience, if the front end needs client-side file interactions.

4. progressHandler.js

    Single place to handle 'progress_update' events from Socket.IO.

    Typically updates progress bars (via uiRegistry) and text statuses.

5. socketHandler.js

    If you prefer all Socket.IO logic in one place, this file can set up socket.on('progress_update', ...).

    Then it either calls progressHandler.js or triggers events in eventRegistry.js.

6. debugTools.js

    Developer-specific logging or debug overlays.

Import & Export Conventions

    All modules use export default { ... } or named exports.

    Import Patterns:

    // In feature modules:
    import uiRegistry from '../core/uiRegistry.js';
    import progressHandler from '../utils/progressHandler.js';

    Consistently maintain relative paths:

        For a feature in features/, importing a core module from core/ => ../core/moduleName.js

        For a core module importing a utility => ../utils/utilName.js

Example (fileProcessor.js):

import uiRegistry from '../core/uiRegistry.js';
import { showError } from '../core/errorHandler.js';
import progressHandler from '../utils/progressHandler.js';

export default {
  init() {
    // ...
  },
  startProcessing() {
    // ...
  }
};

Integration with index.js

    index.js loads modules in sequence:

    import moduleLoader from './modules/core/moduleLoader.js';

// Then it calls something like: moduleLoader.loadModules([...coreList, ...featureList, ...utilsList]) .then(() => { // Application is ready // Possibly call some app.js method or run init on each feature }) .catch(err => console.error("Module loading failed:", err));

2. The **final** step might call `app.js`’s `initialize()` or any feature’s `init()` function to bind UI events.

**Ensure** `index.js` references the correct relative paths:  
```js
const CORE_MODULES = [
  './modules/core/errorHandler.js',
  './modules/core/uiRegistry.js',
  './modules/core/stateManager.js',
  // ...
];

Then the feature modules:

const FEATURE_MODULES = [
  './modules/features/fileProcessor.js',
  './modules/features/webScraper.js',
  // ...
];

Error Handling

    Error Handling Flow:

        A module method tries something → calls throw new Error("...") or passes to errorHandler.js.

        errorHandler.js either displays an alert, logs to console, or triggers an event in eventRegistry.

        The UI can show a modal or toast about the error if desired.

    Socket.IO Errors:

        The back end emits 'task_error', 'task_completed', 'progress_update'. On the front end, socketHandler.js or progressHandler.js listens for 'task_error' and passes that to errorHandler.handleError(...).

Real-Time Progress & Socket.IO

    Server: app.py or ProcessingTask calls socketio.emit('progress_update', {...}).

    Front End:

        Either socketHandler.js or progressHandler.js does:

        socket.on('progress_update', data => {
          // data.progress, data.message, ...
          uiRegistry.getElement('fileTab.progressBar').value = data.progress;
          uiRegistry.getElement('fileTab.progressStatus').textContent = data.message;
        });

    Ensure the correct references in uiRegistry.js:

        'fileTab.progressBar', 'fileTab.progressStatus', etc.

Troubleshooting

    Module Import Errors

        Verify each file has export default { ... } (or named exports).

        Check the relative path in the import statement.

        Confirm no duplicate function names cause syntax errors (like “redeclaration of function handleCancelClick”).

    uiRegistry.getUIElements is not a function

        Possibly you’re importing uiRegistry incorrectly (e.g., import(...) returns a Promise, or you typed uiRegistry.default... incorrectly).

        If you see that error, ensure a static import:

        import uiRegistry from '../core/uiRegistry.js';
        uiRegistry.getUIElements();

Contributing

When adding or updating a module:

    Stick to the export default { ... } pattern or consistent named exports.

    Use uiRegistry for DOM queries to avoid repeated document.getElementById.

    Log errors consistently via errorHandler.js.

    For new features, create them as feature modules in /features, with all logic localized.

Module Refactor Pull Request Template

Below is the recommended template (also posted in your docstrings) for making or reviewing changes:

[NeuroGen Refactor] <moduleName.js>: Standardized Exports, Improved Error Handling, UI Safety

### Module Refactored:
`<moduleName.js>`

---

**1. Initial Analysis**

| Aspect               | Summary                                                       |
|----------------------|---------------------------------------------------------------|
| Original Export Type | (default / named / mixed)                                     |
| State/UI/Event Deps  | Functions that interact with state, UI, or events             |
| Errors/Risks Found   | Risky patterns, missing error handling, etc.                 |

---

**2. Refactor Plan**

| Step                    | Details                                                         |
|-------------------------|-----------------------------------------------------------------|
| Export Normalization    | Converted all exports to `export default {...}` or named        |
| Dependency Isolation    | Abstracted UI, State, or Events properly                       |
| Error Handling Added    | Added try/catch, safe DOM lookups, async safeguards            |
| Code Documentation      | Added JSDoc on public methods                                  |

---

**3. Implementation Summary**

| Change              | Description                                                      |
|---------------------|------------------------------------------------------------------|
| 📦 Export Change    | `export default {}` used consistently                            |
| 🛡️ Error Handling   | Try/catch for async, UI checks                                   |
| 🖇️ UI Handling      | UI elements from `uiRegistry`, fallback warnings added            |
| 🔗 Event Handling   | Event listeners or eventRegistry usage (if applicable)           |
| 🧹 Code Cleanup     | Removed unused variables, optimized imports                       |

---

**4. Testing Checklist**

| Test Case                                       | Result (Pass/Fail) |
|-------------------------------------------------|---------------------|
| Module imports cleanly without syntax errors    | ✅ / ❌            |
| Module initializes properly                     | ✅ / ❌            |
| Dynamic imports load safely                     | ✅ / ❌            |
| All UI elements validated before use            | ✅ / ❌            |
| Debug logs show proper warnings/errors if issues| ✅ / ❌            |
| Old features still work                         | ✅ / ❌            |

---

**5. Post-Refactor Reflection**

- **Key Issues Found**: Summarize major problems in the original code.
- **Decisions Made**: Why you chose a particular export style or error strategy.
- **Future Maintenance Risks**: Potential pitfalls if devs don’t follow the standards.

---

**Notes**  
- **Follow** the NeuroGen Unified Plan standards.  
- **Review** by a second person if you affect multiple systems.  
- **Focus** on modular consistency and stable error handling.

---

**That’s it!** With this **README** your team should have a clear blueprint on how the **NeuroGen Server Frontend** modules operate, integrate with the back end, and handle real-time progress tasks.

Pending Issues: 

Advanced Plan of Action
1. Centralize & Verify Event Bindings
Observed Issue

Event unbound: delegate.body.input[type="file"].change...
Event bound: delegate.body.input[type="file"].change...
Event unbound: delegate.body.form.submit...
Event bound: delegate.body.form.submit...
...

Explanation: The system is rapidly binding/unbinding events for forms, file inputs, and socket events. This suggests that modules or the event manager are re-initializing multiple times (or forcibly unbinding prior handlers) each time the application or module re-initializes.
Action Steps

    Identify Re-Initialization Points

        Look through each core or feature module that calls eventRegistry.bindEvent(...) or something similar.

        Figure out if it is called in multiple places (e.g., initialize(), repeated calls in start() or load()).

    Consolidate Event Binding

        For each module, do event binding once. Possibly place it in a dedicated initEvents() method or inside a single initialize() method that is guaranteed to run only once.

        If your design requires re-binding after a module is destroyed, ensure the unbinding and rebinding logic is consistent.

    Document the Lifecycle

        Clarify that “Upon app load, modules do X, Y, Z.” Then any dynamic re-bind is only done when absolutely necessary (e.g., if user logs in/out).

    Implement a Check

        The event registry might store an internal flag or hash to see if the event is already bound. If it is, do not re-bind. If it changed, re-bind only the updated version.

2. Fix Missing or Incorrect Exports in fileHandler.js & Others
Observed Issue

Failed to import module /static/js/modules/features/academicSearch.js:
SyntaxError: The requested module '.../utils/fileHandler.js' doesn't provide an export named: 'downloadFile'

Explanation: The code in academicSearch.js likely does:

import { downloadFile } from '../utils/fileHandler.js';

But fileHandler.js does not actually export downloadFile. Possibly it’s spelled differently or never declared.
Action Steps

    Open fileHandler.js

        Check if downloadFile is implemented. If it is, confirm it’s exported properly, e.g. export function downloadFile(...) { ... }.

    Rename or Remove

        If the function is actually named something else (like fetchFile), either rename it to downloadFile or fix the academicSearch.js import statement.

    Repeat for debugTools.js

        The logs mention:

Failed to import module /static/js/modules/utils/debugTools.js: ...
doesn't provide an export named: 'getElement'

Possibly debugTools.js is importing uiRegistry incorrectly – or searching for getElement as a named export. If uiRegistry.js only has a default export, you can’t do:

import { getElement } from '../core/uiRegistry.js';

Instead, do:

        import uiRegistry from '../core/uiRegistry.js';
        // then call uiRegistry.getElement(...)

    Refactor & Test

        After you fix these mismatch exports, do a local test to ensure no “SyntaxError: The requested module doesn’t provide an export named ...” appears.

3. Resolve Invalid Selectors & UI Element References
Observed Issue

Invalid selector for historyContainer.#history-container: undefined
Invalid selector for taskHistoryList.#task-history-list: undefined
...
Event configuration missing required 'element' or 'selector' property ...

Explanation: Certain references in your code or UI registry are looking for elements that do not exist in the HTML or are incorrectly spelled. For example:

    uiRegistry might be calling document.getElementById('history-container'), but there’s no such ID in the DOM.

    Or you might have 'historyContainer.#history-container' which is a suspicious syntax if your code expects 'historyContainer' as a category and '#history-container' as the ID.

Action Steps

    Cross-Check uiRegistry.js with HTML

        For each “invalid selector” or “not found” error, search your HTML for an element with that ID or data-attribute. If it’s missing, add it.

        If you already have it, confirm the ID or data-action matches exactly.

    Correct the UI Registry Paths

        For instance, if uiRegistry expects registry.history.historyContainer, you must ensure the actual ID is 'history-container', or fix your code to use 'historyTab.historyContainer'.

    Normalize IDs

        In uiRegistry.js, you might define historyManager: { container: null, ... }. Then in the HTML, you have <div id="history-container">. Just confirm the mapping is correct in the register method.

4. Standardize Event Registration Logic in historyManager.js or Similar
Observed Issue

Invalid event configuration for historyManager.click:clearHistoryBtn:
Object { type: "custom", handler: ... }

Explanation: The event manager or registry complains that the config is missing 'element' or 'selector' property. Possibly the code has:

events: [
  { type: 'custom', handler: this.clearHistoryBtn } // missing 'selector' or 'element'
]

But the event registry expects something like:

{
  type: 'click',
  selector: '#clear-history-btn',
  handler: (e) => ...
}

Action Steps

    Open historyManager.js

        Confirm that your event config includes both type and selector. If you’re using “custom” events, ensure it’s recognized by eventRegistry.

    Make Sure #clear-history-btn Exists

        If uiRegistry.js is supposed to fill in registry.history.clearHistoryBtn, confirm that it’s actually defined or the ID exists in HTML.

    Update the Binding

        Possibly you want a “click” event on clearHistoryBtn. So do:

        {
          selector: '#clear-history-btn',
          type: 'click',
          handler: this.clearHistory // e.g. a function
        }

        The event registry can then bind it automatically.

5. Evaluate Double Socket Connections
Observed Issue

Socket session ID: CG_FNQqutHapoo9uAAAG
Socket.IO connected
Server acknowledged connection: ...
Socket session ID: 3ui2Nh66b7vRkfzJAAAH
Socket.IO connected

Explanation: The logs show multiple new session IDs. Possibly the page re-initializes the Socket.IO client multiple times if your code calls io(...) more than once or re-runs initialization logic.
Action Steps

    Check index.js or socketHandler.js

        Ensure you only run const socket = io(...) once on load. If the code is re-running, you might have two concurrent socket connections.

    Remove Duplicate Listeners

        If you do socket.on('connect', ...), see if it appears in multiple modules. Centralize it in socketHandler.js.

6. Provide Development Best Practices
Observed Issue

    Repeated “unbound / bound” or “missing export” points to potential team confusion about how modules are structured, or devs committing partial changes.

Action Steps

    Add ESLint / Prettier

        This can catch references to missing exports or variables.

    Use a “Front-End Setup” Wiki

        Document how to add new UI elements, how to handle new events, how to import from uiRegistry.js.

    Enforce Pull Request Template

        Team must fill in the “Refactor Plan” or “Implementation Summary” so these issues are caught before merging.

7. Step-by-Step “Fix & Validate” Procedure

    Disable All Optional Modules

        Temporarily comment out loading of academicSearch.js, debugTools.js, etc.

        Re-run the app and confirm no console errors.

    Reintroduce Modules One by One

        E.g. “Now let’s import academicSearch.js again.”

        Immediately fix any “doesn’t export X” or “invalid selector” errors as they appear.

    Check UI Elements

        For each “Cannot bind event for ...”, ensure the element ID or data attribute matches your code.

    Confirm Socket.IO

        Make sure only one socket connection is established.

        Listen for 'progress_update', 'task_error', 'task_completed' in a single place (like socketHandler.js or progressHandler.js).

    Push to a Dev Branch

        Let QA test. If stable, merge into main.

8. Ongoing Prevention

    Keep a consistent module template so devs know how to define events, how to do export default.

    Add test coverage for the front-end if possible (like a minimal Cypress or Jest test that checks for console errors).

    Use a standard naming for UI elements in uiRegistry (like '#history-container' → 'historyContainer').

Conclusion

Following these action steps will allow your AI Development team to systematically:

    Fix repeated unbind/rebind logs (by controlling when and how modules initialize events).

    Correct missing or mismatched exports in fileHandler.js or uiRegistry.js.

    Resolve invalid selectors or event configs (especially for history manager).

    Avoid multiple socket connections and re-initializations.

NeuroGen Server Frontend Implementation Plan
Based on the current console errors and the refactored socketHandler.js, we now have a clear path to resolve the remaining issues. This document outlines the step-by-step plan to get the NeuroGen Server frontend fully operational.
Phase 1: Fix Critical Export Issues
1. Deploy Updated socketHandler.js (CRITICAL)
The enhanced version of socketHandler.js we've created includes:

Proper exports with both named and default export patterns
Fixed circular dependency issues with consistent dynamic imports
Standardized module interface with JSDoc comments
Aligned event handling with backend Socket.IO events from app.py
Consistent path handling for imports

Implementation:
javascriptCopy// Deploy the enhanced socketHandler.js we've created
2. Fix uiRegistry.js Export Issues (CRITICAL)
This module needs exports that are compatible with how it's being imported elsewhere.
Implementation:
javascriptCopy// Add to end of uiRegistry.js
function getElement(selector, category = null) {
  // Implementation based on existing code
  if (category) {
    const elements = uiElements[category];
    return elements ? elements[selector] : null;
  }
  
  // Try to find in any category
  for (const category in uiElements) {
    if (uiElements[category][selector]) {
      return uiElements[category][selector];
    }
  }
  
  return null;
}

// Add named exports
export {
  initialize,
  registerElement,
  registerElements,
  getElement,
  getUIElements,
  // ... other methods
};

// Default export
export default {
  initialize,
  registerElement,
  registerElements,
  getElement,
  getUIElements,
  // ... other methods
};
3. Fix progressHandler.js Circular Dependency (CRITICAL)
Implementation:
javascriptCopy// Remove direct import at the top
// import socketHandler from './socketHandler.js';

// Use dynamic import where needed
async function startStatusPolling(taskId, callbacks) {
  try {
    const module = await import('./socketHandler.js');
    const socketHandler = module.default;
    if (socketHandler) {
      socketHandler.startStatusPolling(taskId, callbacks);
    }
  } catch (error) {
    console.error('Error importing socketHandler:', error);
    // Fallback implementation
  }
}
Phase 2: Fix Function Redeclaration Issues
4. Fix app.js handleCancelClick Redeclaration (HIGH)
Implementation:
javascriptCopy// In app.js
// Rename the function
function handleAppCancelClick() {
  // Existing implementation
}

// Update any references to use the new name
5. Fix fileProcessor.js handleCancelClick Redeclaration (HIGH)
Implementation:
javascriptCopy// In fileProcessor.js
// Rename the function
function handleFileProcessorCancelClick() {
  // Existing implementation
}

// Update any references to use the new name
Phase 3: Fix Import Path Issues
6. Standardize Import Paths (MEDIUM)
The error logs show inconsistent module import paths, mixing both relative paths with different directory levels.
Implementation:
javascriptCopy// Instead of mixing styles like:
import ui from './ui.js';
import webScraper from '../features/webScraper.js';

// Use consistent relative paths based on the actual directory structure:
import ui from './ui.js';
import webScraper from './webScraper.js';
7. Fix webScraper.js Imports (HIGH)
Implementation:
javascriptCopy// In webScraper.js, update import for progressHandler
import { trackProgress, setupTaskProgress } from '../utils/progressHandler.js';

// Replace with dynamic import to break circular dependency
async function setupTaskProgressTracking(taskId, options) {
  try {
    const module = await import('../utils/progressHandler.js');
    return module.default.setupTaskProgress(taskId, options);
  } catch (error) {
    console.error('Error importing progressHandler:', error);
    // Simplified fallback implementation
    return {
      updateProgress(progress, message) {
        // Basic implementation
      }
    };
  }
}
Phase 4: Fix UI Element References
8. Fix historyManager.js Selectors (MEDIUM)
Implementation:
javascriptCopy// In historyManager.js
// Ensure selectors have proper # prefix for IDs
// From:
const selectors = {
  historyContainer: 'history-container',
  taskHistoryList: 'task-history-list',
  // ...
};

// To:
const selectors = {
  historyContainer: '#history-container',
  taskHistoryList: '#task-history-list',
  // ...
};
9. Fix Event Configuration Format (MEDIUM)
Implementation:
javascriptCopy// From:
const events = [
  {
    type: 'custom', 
    handler: clearHistoryBtn
  },
  // ...
];

// To:
const events = [
  {
    selector: '#clear-history-btn',
    type: 'click',
    handler: clearHistoryBtn
  },
  // ...
];
Phase 5: Fix Module Loading Sequence
10. Update Module Loading Sequence in index.js (MEDIUM)
Implementation:
javascriptCopy// Reorder module loading sequence to ensure dependencies load first
const CORE_MODULES = [
  '/static/js/modules/core/errorHandler.js',
  '/static/js/modules/core/uiRegistry.js',
  '/static/js/modules/core/stateManager.js',
  '/static/js/modules/core/eventRegistry.js',
  '/static/js/modules/core/eventManager.js',
  '/static/js/modules/core/themeManager.js'
];

// Load utility modules before features that depend on them
const UTILITY_MODULES = [
  '/static/js/modules/utils/utils.js',
  '/static/js/modules/utils/ui.js',
  '/static/js/modules/utils/fileHandler.js',
  '/static/js/modules/utils/socketHandler.js',
  '/static/js/modules/utils/progressHandler.js'
];

const FEATURE_MODULES = [
  '/static/js/modules/core/app.js',
  '/static/js/modules/features/fileProcessor.js',
  '/static/js/modules/features/webScraper.js'
];
Phase 6: Add Graceful Error Recovery
11. Add Global Error Recovery in moduleLoader.js (MEDIUM)
Implementation:
javascriptCopy// Add to moduleLoader.js
function createFallbackModule(moduleName, error) {
  console.warn(`Creating fallback for module ${moduleName} due to error:`, error);
  
  // Generic module with basic functionality
  const fallbackModule = {
    initialized: false,
    initialize() {
      console.warn(`Using fallback implementation for ${moduleName}`);
      this.initialized = true;
      return true;
    },
    // Other common methods with safe implementations
    showError(error) {
      console.error(`[Fallback ${moduleName}] Error:`, error);
    }
  };
  
  // Make available globally for other modules
  window[moduleName] = fallbackModule;
  return fallbackModule;
}
Phase 7: Testing and Validation
12. Module Loading Test
Validate that all modules are loading without errors:
javascriptCopyasync function testModuleLoading() {
  const results = [];
  
  // Test core modules
  for (const modulePath of CORE_MODULES) {
    try {
      const module = await import(modulePath);
      results.push({
        path: modulePath,
        loaded: !!module,
        default: !!module.default,
        hasInitialize: typeof module.default?.initialize === 'function'
      });
    } catch (error) {
      results.push({
        path: modulePath,
        loaded: false,
        error: error.message
      });
    }
  }
  
  console.table(results);
}
13. Socket.IO Integration Test
Validate that Socket.IO events are correctly handled:
javascriptCopyfunction testSocketIntegration() {
  // Emit a test event
  socketHandler.emit('ping', { timestamp: Date.now() });
  
  // Create a mock task to test progress tracking
  const mockData = {
    task_id: 'test-task-' + Date.now(),
    progress: 50,
    message: 'Test progress update',
    stats: {
      total_files: 10,
      processed_files: 5
    }
  };
  
  // Mock a progress update
  if (typeof window.eventRegistry?.emit === 'function') {
    window.eventRegistry.emit('socket.progress_update', mockData);
  }
  
  console.log('Socket integration test complete');
}

classDiagram
    class app {
        +initialize()
        +configure()
        +route handlers
        +Socket.IO event handlers
    }
    
    class structify_module {
        +process_all_files()
        +process_pdf()
        +extract_tables_from_pdf()
        +detect_document_type()
        +DEFAULT_STOP_WORDS
        +DEFAULT_VALID_EXTENSIONS
    }
    
    class socketio {
        +SocketIO instance
        +emit()
        +on()
        +connect
        +disconnect
    }
    
    class neurogenlib {
        +utility functions
    }
    
    class web_scraper {
        +process_url()
        +download_pdf()
        +fetch_pdf_links()
        +scrape_and_download_pdfs()
    }
    
    class pdf_extractor {
        +process_pdf()
        +extract_tables_from_pdf()
        +detect_document_type()
        +initialize_module()
    }
    
    class playlists_downloader {
        +download_all_playlists()
    }
    
    class academic_api {
        +search_papers()
        +get_paper_details()
        +download_paper()
    }
    
    class academic_api_redis {
        +RedisCache
        +RedisRateLimiter
    }
    
    class citation_network_visualizer {
        +CitationNetworkVisualizer
    }
    
    class TaskManager {
        +ProcessingTask
        +PlaylistTask
        +ScraperTask
        +add_task()
        +get_task()
        +remove_task()
    }
    
    app --> structify_module : uses
    app --> socketio : configures
    app --> web_scraper : uses
    app --> pdf_extractor : uses
    app --> playlists_downloader : uses
    app --> academic_api : uses
    app --> academic_api_redis : optional caching
    app --> citation_network_visualizer : academic features
    app --> TaskManager : manages background tasks
    TaskManager --> socketio : emits progress events
    app --> neurogenlib : utility functions

    classDiagram
    class index.js {
        +Main entry point
        +Initialize app
        +Load core modules
        +Load feature modules
    }
    
    class app.js {
        +initialize()
        +setupEventListeners()
        +setupUI()
        +setupTabs()
    }
    
    class moduleLoader {
        +cache: Map
        +MODULE_LOCATIONS
        +INITIALIZATION_ORDER
        +initialize()
        +importModule()
        +importModules()
        +createFallbackModule()
        +getModuleName()
        +resolvePath()
    }
    
    class eventManager {
        +registerEvents()
        +on()
        +off()
        +emit()
        +setupDelegatedEvents()
    }
    
    class eventRegistry {
        +events: Map
        +registerEvent()
        +registerEvents()
        +on()
        +off()
        +emit()
    }
    
    class uiRegistry {
        +elements: Map
        +registerElement()
        +registerElements()
        +getElement()
        +updateElement()
    }
    
    class stateManager {
        +state: Object
        +subscribers: Map
        +getState()
        +setState()
        +subscribe()
    }
    
    class errorHandler {
        +handleError()
        +showError()
        +showSuccess()
    }
    
    class fileHandler {
        +uploadFile()
        +downloadFile()
        +handleFileSelection()
        +verifyPath()
        +createDirectory()
    }
    
    class socketHandler {
        +connect()
        +disconnect()
        +emit()
        +on()
        +startStatusPolling()
    }
    
    class fileProcessor {
        +processFiles()
        +cancelProcessing()
        +handleUpload()
    }
    
    class webScraper {
        +scrape()
        +handleScrapeForm()
        +cancelScraping()
    }
    
    class playlistDownloader {
        +downloadPlaylist()
        +handlePlaylistForm()
        +cancelDownload()
    }
    
    class academicSearch {
        +performSearch()
        +downloadPaper()
        +loadPaperDetails()
        +loadPaperCitations()
    }
    
    class debugTools {
        +toggleDebugPanel()
        +monitorSocketEvents()
        +interceptConsole()
        +toggleNetworkMonitoring()
    }
    
    class ui {
        +showToast()
        +showModal()
        +hideModal()
        +showLoading()
        +hideLoading()
    }
    
    index.js --> app.js : initializes
    index.js --> moduleLoader : uses to load modules
    app.js --> eventManager : uses events
    app.js --> uiRegistry : registers UI elements
    app.js --> fileProcessor : processes files
    app.js --> webScraper : handles scraping
    app.js --> playlistDownloader : downloads playlists
    app.js --> academicSearch : academic search features
    
    moduleLoader --> uiRegistry : provides fallback
    moduleLoader --> eventRegistry : provides fallback
    
    eventManager --> eventRegistry : uses registry
    uiRegistry --> errorHandler : reports errors
    
    fileProcessor --> socketHandler : monitors task progress
    webScraper --> socketHandler : monitors task progress
    playlistDownloader --> socketHandler : monitors task progress
    
    fileProcessor --> fileHandler : handles file operations
    academicSearch --> fileHandler : downloads papers
    
    debugTools --> socketHandler : monitors events
    debugTools --> stateManager : inspects state
    
    fileHandler --> ui : shows feedback
    socketHandler --> ui : shows connection status

    flowchart TB
    subgraph Frontend
        indexjs["index.js\n(Entry Point)"]
        appjs["app.js\n(Main App)"]
        moduleLoader["moduleLoader.js\n(Module Loading)"]
        socketHandler["socketHandler.js\n(Socket.IO Client)"]
        fileProcessor["fileProcessor.js\n(File Processing)"]
        webScraper["webScraper.js\n(Web Scraping)"]
        playlistDL["playlistDownloader.js\n(Playlist Downloads)"]
        academicSearch["academicSearch.js\n(Academic Search)"]
        ui["ui.js\n(UI Components)"]
    end
    
    subgraph Backend
        apppy["app.py\n(Main Server)"]
        structify["structify_module\n(File Processing)"]
        socket["socketio\n(Socket.IO Server)"]
        pdfExtractor["pdf_extractor\n(PDF Processing)"]
        webScraperBackend["web_scraper\n(Scraping Functions)"]
        playlistBackend["playlists_downloader\n(Playlist Handling)"]
        academicBackend["academic_api\n(Academic API)"]
        taskManager["TaskManager\n(Background Tasks)"]
    end
    
    %% Frontend connections
    indexjs --> appjs
    indexjs --> moduleLoader
    
    %% Backend connections
    apppy --> structify
    apppy --> socket
    apppy --> pdfExtractor
    apppy --> webScraperBackend
    apppy --> playlistBackend
    apppy --> academicBackend
    apppy --> taskManager
    
    %% Frontend to Backend connections
    socketHandler <--> socket: "Socket.IO connection"
    
    fileProcessor --> apppy: "POST /api/process"
    taskManager --> socketHandler: "emit('progress_update')"
    taskManager --> socketHandler: "emit('task_completed')"
    taskManager --> socketHandler: "emit('task_error')"
    
    webScraper --> apppy: "POST /api/scrape2"
    webScraper --> socketHandler: "monitors task progress"
    
    playlistDL --> apppy: "POST /api/start-playlists"
    playlistDL --> socketHandler: "monitors task progress"
    
    academicSearch --> apppy: "GET /api/academic/search"
    academicSearch --> apppy: "GET /api/academic/details/:id"
    academicSearch --> apppy: "GET /api/academic/download/:id"
    
    ui --> apppy: "GET /api/status/:task_id"

    flowchart TD
    classDef error fill:#f9d0c4,stroke:#f44336,stroke-width:2px
    classDef warning fill:#fff9c4,stroke:#ffb74d,stroke-width:2px
    
    academicSearch["academicSearch.js"]:::error
    debugTools["debugTools.js"]:::error
    fileHandler["fileHandler.js"]
    uiRegistry["uiRegistry.js"]:::warning
    historyManager["historyManager.js"]:::warning
    moduleLoader["moduleLoader.js"]
    
    academicSearch -->|"Import Error"| fileHandler
    academicSearch -->|"Missing downloadFile export"| error1["SyntaxError: The requested module doesn't provide an export named: 'downloadFile'"]:::error
    
    debugTools -->|"Import Error"| uiRegistry
    debugTools -->|"Missing getElement export"| error2["SyntaxError: The requested module doesn't provide an export named: 'getElement'"]:::error
    
    historyManager -->|"Missing Elements"| warning1["Invalid selector for historyContainer.#history-container: undefined"]:::warning
    
    uiRegistry -->|"Element Registration"| warning2["Element registration errors\nMissing UI elements"]:::warning

Module Issues Resolution Plan
1. Identified Issues from Console Errors

academicSearch.js import errors:

Unable to import downloadFile from fileHandler.js
Error: SyntaxError: The requested module 'http://localhost:5025/static/js/modules/utils/fileHandler.js' doesn't provide an export named: 'downloadFile'


debugTools.js import errors:

Unable to import getElement from uiRegistry.js
Error: SyntaxError: The requested module 'http://localhost:5025/static/js/modules/core/uiRegistry.js' doesn't provide an export named: 'getElement'


historyManager element registration issues:

Invalid selectors for history containers
Error: Invalid selector for historyContainer.#history-container: undefined


Fallback implementations being used:

System is creating fallbacks for both academicSearch and debugTools modules



2. Root Causes

Export Pattern Mismatches:

Some modules use default exports while others use named exports
Inconsistent import patterns between modules


Module Resolution Issues:

Path resolution in moduleLoader.js may have inconsistencies
MODULE_LOCATIONS mapping may not match actual file structure


Element Registration Timing:

UI elements may be registered before DOM is fully loaded
UI Registry might not have proper error handling for missing elements



3. Solution Strategy
Step 1: Fix Export Pattern in fileHandler.js
The fileHandler.js module needs to be modified to properly export the downloadFile function:
javascriptCopy// At the end of fileHandler.js
// Current: export default fileHandler;

// Add named exports alongside default export:
export const downloadFile = fileHandler.downloadFile;
export default fileHandler;
Step 2: Fix Export Pattern in uiRegistry.js
Similarly, modify uiRegistry.js to properly export the getElement function:
javascriptCopy// At the end of uiRegistry.js
// Current: export default uiRegistry;

// Add named exports alongside default export:
export const getElement = uiRegistry.getElement;
export const registerElement = uiRegistry.registerElement;
export default uiRegistry;
Step 3: Update ModuleLoader Path Resolution
Enhance the resolvePath function in moduleLoader.js to better handle module paths:
javascriptCopyresolvePath(modulePath) {
  console.log("Resolving path:", modulePath);
  
  // If the path already starts with http or /, it's absolute
  if (modulePath.startsWith('http') || modulePath.startsWith('/')) {
    return modulePath;
  }
  
  // Handle paths that start with 'modules/' - convert to absolute path
  if (modulePath.startsWith('modules/')) {
    return '/static/js/' + modulePath;
  }
  
  // For paths from index.js to modules, ensure they're properly resolved
  if (modulePath.startsWith('./modules/')) {
    // Convert to absolute path
    return '/static/js' + modulePath.substring(1);
  }
  
  // For relative paths within the same directory
  if (modulePath.startsWith('./') && !modulePath.includes('/')) {
    // Just get the filename
    const filename = modulePath.substring(2);
    
    // Get the module location from our mapping
    const location = this.MODULE_LOCATIONS[filename];
    if (location) {
      return `/static/js/modules/${location}/${filename}`;
    }
  }
  
  // For relative paths to parent directories
  if (modulePath.startsWith('../')) {
    // Extract the target directory and filename
    const parts = modulePath.split('/');
    const targetDir = parts[1]; // 'core', 'features', or 'utils'
    const filename = parts[2];
    
    if (targetDir && filename) {
      return `/static/js/modules/${targetDir}/${filename}`;
    }
  }
  
  // Default return the path unchanged
  return modulePath;
}
Step 4: Enhance Fallback Module Creation
Improve the fallback module creation to better match expected interfaces:
javascriptCopycreateFallbackModule(moduleName, error = null) {
  console.log(`Creating fallback for module ${moduleName}`);
  
  // Determine module type based on name or location
  let moduleType = 'unknown';
  
  if (moduleName.endsWith('.js')) {
    const fileName = moduleName;
    if (this.MODULE_LOCATIONS[fileName]) {
      moduleType = this.MODULE_LOCATIONS[fileName];
    }
  } else {
    // Check if it's in MODULE_LOCATIONS
    if (this.MODULE_LOCATIONS[`${moduleName}.js`]) {
      moduleType = this.MODULE_LOCATIONS[`${moduleName}.js`];
    }
  }
  
  // Create different types of fallbacks based on module type
  switch (moduleType) {
    case 'core':
      return this.createCoreFallback(moduleName);
    
    case 'features':
      return this.createFeatureFallback(moduleName);
      
    case 'utils':
      return this.createUtilityFallback(moduleName);
      
    default:
      // Generic fallback
      return {
        __isFallback: true,
        moduleName,
        error: error ? error.message : 'Module failed to load',
        
        initialize() {
          console.warn(`Using fallback implementation for ${moduleName}`);
          return true;
        }
      };
  }
}
Step 5: Fix historyManager UI Element Registration
Ensure historyManager.js properly registers its UI elements at the right time:
javascriptCopy// In historyManager.js
registerUIElements() {
  // Make sure elements exist in DOM before registering
  if (document.getElementById('history-container')) {
    registerElement('historyContainer', '#history-container');
  }
  
  if (document.getElementById('task-history-list')) {
    registerElement('taskHistoryList', '#task-history-list');
  }
  
  if (document.getElementById('download-history-list')) {
    registerElement('downloadHistoryList', '#download-history-list');
  }
  
  // ... etc for other elements
}
4. Implementation Order

First fix the export patterns in fileHandler.js and uiRegistry.js to resolve the import errors
Update moduleLoader.js path resolution to ensure modules are correctly located
Enhance fallback module creation in moduleLoader.js for more robust error handling
Fix UI element registration in historyManager.js
Test the entire system to ensure all errors are resolved

5. Validation Steps
After implementing each fix, verify that:

Console errors are reduced or eliminated
Module imports are working correctly
UI elements are properly registered and accessible
Features like academic search and debug tools are functioning properly

By following this systematic approach, the NeuroGen Server application should be properly connected and functional again.