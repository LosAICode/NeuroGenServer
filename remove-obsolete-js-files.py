#!/usr/bin/env python3
"""
Script to identify and safely remove obsolete JavaScript files from NeuroGenServer
for production deployment. This script analyzes the current file structure and 
creates a list of files that are safe to remove.

Usage: python remove-obsolete-js-files.py [--dry-run] [--backup]
"""

import os
import sys
import shutil
import datetime
from pathlib import Path

# Base directory for JavaScript files
JS_BASE_DIR = "/workspace/modules/static/js"

# Files to DEFINITELY remove (obsolete/redundant)
OBSOLETE_FILES = [
    # Legacy/backup files
    "index.original.js", "index.beta.js", "index.fixed.js", 
    "index.optimized.js", "index.optimized.v2.js",
    "main-original.js", "main.backup.js", "main.changes.js", "main.js",
    "main_part1.js", "main_part2.js", "main_part3.js", "main_part4.js",
    "main_part5.js", "main_part6.js", "main_part7.js", "legacy.js",
    
    # Debug/development files  
    "console-diagnostics.js", "diagnostic-helper.js", "diagnostics.js",
    "file-processor-debug.js", "quick-diagnostic.js", "performance-diagnostic.js",
    "simple-debug.js", "test-app-load.js", "test-module-loading.js",
    "validate-fix.js", "verify-enhancements.js", "log-capture.js",
    "module-diagnostics-enhanced.js",
    
    # Applied fix files (functionality integrated)
    "duplicate-load-fix.js", "file-input-fix.js", "fixImport.js",
    "fixModules.js", "fixThemePersistence.js", "index-end-fix.js",
    "module-init-fix.js", "performance-critical-fix.js", "performance-fix.js",
    "ses-deprecation-fix.js", "sw-fix.js", "themeFixScript.js",
    "url-param-fix.js", "sw.js",
    
    # Redundant/unused
    "socket-events.js", "playlist-cancel.js"
]

# Module backup files to remove
MODULE_OBSOLETE_FILES = [
    "modules/core/module-bridge.js.bak",
    "modules/core/moduleLoader.beta.js",
    "modules/core/moduleLoader.broken.bak", 
    "modules/core/moduleLoader.minimal.js",
    "modules/core/moduleLoader.optimized.js",
    "modules/core/moduleLoader.original.js",
    "modules/core/ui.beta.js",
    "modules/features/academicSearch.js.bak",
    "modules/features/fileProcessor.working.js",
    "modules/features/fileProcessorBeta.js",
    "modules/features/playlistDownloader.module.beta.js",
    "modules/features/playlistDownloader.module.js",
    "modules/features/playlist functions.js",  # Space in filename
    "modules/features/webScraper.js.bak",
    "modules/features/webScraper.original.js",
    "modules/utils/domUtils.js.bak",
    "modules/utils/progressHandler.beta.js",
    "modules/utils/progressHandler_fixed.js", 
    "modules/utils/socketHandler.working.js",
    "modules/utils/socketHandler_fixes.js",
    "modules/utils/ui.beta.js",
    "modules/utils/ui.js.bak.minimal"
]

# Directories to remove entirely
OBSOLETE_DIRS = [
    "modules/utils/backups",
    "modules/features/temp"
]

def get_file_size(file_path):
    """Get file size in bytes, return 0 if file doesn't exist"""
    try:
        return os.path.getsize(file_path)
    except (OSError, FileNotFoundError):
        return 0

def analyze_js_files():
    """Analyze the JavaScript directory and identify obsolete files"""
    
    if not os.path.exists(JS_BASE_DIR):
        print(f"ERROR: JavaScript directory not found: {JS_BASE_DIR}")
        return False
    
    print("=== NeuroGenServer JavaScript Files Cleanup Analysis ===")
    print(f"Base directory: {JS_BASE_DIR}")
    print(f"Analysis date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    total_files_to_remove = 0
    total_size_to_save = 0
    found_files = []
    missing_files = []
    
    # Check main directory obsolete files
    print("1. OBSOLETE FILES IN MAIN DIRECTORY:")
    for filename in OBSOLETE_FILES:
        file_path = os.path.join(JS_BASE_DIR, filename)
        if os.path.exists(file_path):
            size = get_file_size(file_path)
            found_files.append((file_path, size))
            total_files_to_remove += 1
            total_size_to_save += size
            print(f"   ✓ {filename} ({size:,} bytes)")
        else:
            missing_files.append(filename)
    
    # Check module obsolete files
    print("\n2. OBSOLETE MODULE FILES:")
    for relative_path in MODULE_OBSOLETE_FILES:
        file_path = os.path.join(JS_BASE_DIR, relative_path)
        if os.path.exists(file_path):
            size = get_file_size(file_path)
            found_files.append((file_path, size))
            total_files_to_remove += 1
            total_size_to_save += size
            print(f"   ✓ {relative_path} ({size:,} bytes)")
        else:
            missing_files.append(relative_path)
    
    # Check obsolete directories
    print("\n3. OBSOLETE DIRECTORIES:")
    for relative_path in OBSOLETE_DIRS:
        dir_path = os.path.join(JS_BASE_DIR, relative_path)
        if os.path.exists(dir_path):
            dir_size = sum(get_file_size(os.path.join(dirpath, filename))
                          for dirpath, dirnames, filenames in os.walk(dir_path)
                          for filename in filenames)
            dir_file_count = sum(len(filenames) 
                               for dirpath, dirnames, filenames in os.walk(dir_path))
            found_files.append((dir_path, dir_size))
            total_files_to_remove += dir_file_count
            total_size_to_save += dir_size
            print(f"   ✓ {relative_path}/ ({dir_file_count} files, {dir_size:,} bytes)")
        else:
            missing_files.append(relative_path + "/")
    
    # Summary
    print(f"\n=== CLEANUP SUMMARY ===")
    print(f"Files found for removal: {total_files_to_remove}")
    print(f"Total space to be freed: {total_size_to_save:,} bytes ({total_size_to_save/1024:.1f} KB)")
    print(f"Files already missing: {len(missing_files)}")
    
    if missing_files:
        print(f"\nAlready removed/missing files:")
        for missing in missing_files[:10]:  # Show first 10
            print(f"   - {missing}")
        if len(missing_files) > 10:
            print(f"   ... and {len(missing_files) - 10} more")
    
    return found_files

def create_backup(files_to_remove):
    """Create a backup of files before removal"""
    backup_dir = f"/workspace/js-backup-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    os.makedirs(backup_dir, exist_ok=True)
    
    print(f"\nCreating backup in: {backup_dir}")
    
    for file_path, size in files_to_remove:
        try:
            relative_path = os.path.relpath(file_path, JS_BASE_DIR)
            backup_path = os.path.join(backup_dir, relative_path)
            
            # Create backup directory structure
            os.makedirs(os.path.dirname(backup_path), exist_ok=True)
            
            if os.path.isdir(file_path):
                shutil.copytree(file_path, backup_path)
            else:
                shutil.copy2(file_path, backup_path)
            
            print(f"   ✓ Backed up: {relative_path}")
        except Exception as e:
            print(f"   ✗ Failed to backup {relative_path}: {e}")
    
    return backup_dir

def remove_files(files_to_remove, dry_run=True):
    """Remove the obsolete files"""
    if dry_run:
        print(f"\n=== DRY RUN MODE ===")
        print("The following files WOULD be removed:")
    else:
        print(f"\n=== REMOVING FILES ===")
    
    removed_count = 0
    removed_size = 0
    
    for file_path, size in files_to_remove:
        relative_path = os.path.relpath(file_path, JS_BASE_DIR)
        
        if dry_run:
            print(f"   WOULD REMOVE: {relative_path} ({size:,} bytes)")
        else:
            try:
                if os.path.isdir(file_path):
                    shutil.rmtree(file_path)
                else:
                    os.remove(file_path)
                print(f"   ✓ REMOVED: {relative_path} ({size:,} bytes)")
                removed_count += 1
                removed_size += size
            except Exception as e:
                print(f"   ✗ FAILED: {relative_path} - {e}")
    
    if not dry_run:
        print(f"\nRemoval complete: {removed_count} items, {removed_size:,} bytes freed")
    
    return removed_count, removed_size

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Remove obsolete JavaScript files")
    parser.add_argument('--dry-run', action='store_true', default=True,
                       help='Show what would be removed without actually removing (default)')
    parser.add_argument('--execute', action='store_true', 
                       help='Actually remove the files (use with caution)')
    parser.add_argument('--backup', action='store_true',
                       help='Create backup before removal')
    
    args = parser.parse_args()
    
    # Analyze files
    files_to_remove = analyze_js_files()
    
    if not files_to_remove:
        print("No obsolete files found. Directory is already clean!")
        return
    
    # Create backup if requested
    if args.backup and not args.dry_run:
        create_backup(files_to_remove)
    
    # Remove files
    dry_run = not args.execute
    remove_files(files_to_remove, dry_run=dry_run)
    
    if dry_run:
        print(f"\nTo actually remove files, run: python {sys.argv[0]} --execute")
        print("To create backup first, add: --backup")

if __name__ == "__main__":
    main()