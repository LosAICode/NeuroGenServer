# JavaScript Files Cleanup Plan for Production

## FILES TO REMOVE IMMEDIATELY (Safe to delete - obsolete/redundant)

### 1. Legacy/Backup Files (47 files)
```
/static/js/index.original.js
/static/js/index.beta.js  
/static/js/index.fixed.js
/static/js/index.optimized.js
/static/js/index.optimized.v2.js
/static/js/main-original.js
/static/js/main.backup.js
/static/js/main.changes.js
/static/js/main.js
/static/js/main_part1.js through main_part7.js (7 files)
/static/js/legacy.js

# Module backups
/static/js/modules/core/module-bridge.js.bak
/static/js/modules/core/moduleLoader.beta.js
/static/js/modules/core/moduleLoader.broken.bak
/static/js/modules/core/moduleLoader.minimal.js
/static/js/modules/core/moduleLoader.optimized.js
/static/js/modules/core/moduleLoader.original.js
/static/js/modules/core/ui.beta.js
/static/js/modules/features/academicSearch.js.bak
/static/js/modules/features/fileProcessor.working.js
/static/js/modules/features/fileProcessorBeta.js
/static/js/modules/features/playlistDownloader.module.beta.js
/static/js/modules/features/playlistDownloader.module.js
/static/js/modules/features/webScraper.js.bak
/static/js/modules/features/webScraper.original.js
/static/js/modules/utils/domUtils.js.bak
/static/js/modules/utils/progressHandler.beta.js
/static/js/modules/utils/progressHandler_fixed.js
/static/js/modules/utils/socketHandler.working.js
/static/js/modules/utils/socketHandler_fixes.js
/static/js/modules/utils/ui.beta.js
/static/js/modules/utils/ui.js.bak.minimal
/static/js/modules/utils/backups/ (entire directory)
```

### 2. Debug/Development Files (13 files)
```
/static/js/console-diagnostics.js
/static/js/diagnostic-helper.js
/static/js/diagnostics.js
/static/js/file-processor-debug.js
/static/js/quick-diagnostic.js
/static/js/performance-diagnostic.js
/static/js/simple-debug.js
/static/js/test-app-load.js
/static/js/test-module-loading.js
/static/js/validate-fix.js
/static/js/verify-enhancements.js
/static/js/log-capture.js
/static/js/module-diagnostics-enhanced.js
```

### 3. Applied Fix Files (15 files)
```
/static/js/duplicate-load-fix.js
/static/js/file-input-fix.js
/static/js/fixImport.js
/static/js/fixModules.js
/static/js/fixThemePersistence.js
/static/js/index-end-fix.js
/static/js/module-init-fix.js
/static/js/performance-critical-fix.js
/static/js/performance-fix.js
/static/js/ses-deprecation-fix.js
/static/js/sw-fix.js
/static/js/themeFixScript.js
/static/js/url-param-fix.js
/static/js/sw.js
/static/js/socket-events.js
```

### 4. Redundant/Unused Files (3 files)
```
/static/js/playlist-cancel.js (functionality moved to playlistDownloader.js)
/static/js/modules/features/playlist functions.js (space in filename, redundant)
/static/js/modules/features/temp/ (entire temp directory)
```

## FILES TO KEEP AND OPTIMIZE

### Core Production Files
```
/static/js/index.js - Main entry point
/static/js/module-manager.js - Module lifecycle
/static/js/modules/core/ - All current files
/static/js/modules/utils/ - All current files (minus backups)
/static/js/modules/features/ - All current files (minus redundant)
/static/js/tests/ - Testing framework
```

### Additional Development Files (Keep for now)
```
/static/js/index-simple.js - Alternative entry point
/static/js/module-diagnostics.js - System diagnostics
/static/js/modules/module-standardizer.js - Module standardization
```

## TOTAL FILES TO REMOVE: 78 files
## ESTIMATED SPACE SAVINGS: ~2.5MB

## IMPLEMENTATION PLAN
1. Create backup of entire js directory
2. Remove files in batches (legacy, debug, fix, redundant)
3. Test system functionality after each batch
4. Update test-modules route with accurate file counts
5. Update CLAUDE.md with cleaned structure

## RISK ASSESSMENT: LOW
All identified files are either:
- Backup/legacy versions of current files
- Debug tools not needed in production
- Fix files whose changes are integrated
- Redundant copies of existing functionality