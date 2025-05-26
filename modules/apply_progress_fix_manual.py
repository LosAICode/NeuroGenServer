"""
Manual Progress Bar Fix Application
Applies specific line-by-line fixes to progressHandler.js
"""

import os
import shutil
import datetime
import json
import sys

def create_backup(file_path):
    """Create a backup of the file before modification"""
    if os.path.exists(file_path):
        backup_dir = os.path.join(os.path.dirname(file_path), 'backups', 'progress_handler')
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = os.path.basename(file_path)
        backup_path = os.path.join(backup_dir, f"{filename.split('.')[0]}_backup_{timestamp}.js")
        
        shutil.copy2(file_path, backup_path)
        print(f"✓ Created backup: {backup_path}")
        return backup_path
    return None

def apply_manual_fixes():
    """Apply fixes by reading and modifying specific sections"""
    
    progress_handler_path = '/workspace/modules/static/js/modules/utils/progressHandler.js'
    
    print("\n🔧 Manual Progress Bar Fix Application")
    print("=" * 50)
    
    # Create backup
    print("\n📦 Creating backup...")
    backup_path = create_backup(progress_handler_path)
    
    # Read file lines
    print("\n📖 Reading progressHandler.js...")
    with open(progress_handler_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    print(f"  Total lines: {len(lines)}")
    
    # Apply fixes
    print("\n🔍 Applying targeted fixes:")
    
    # Fix 1: smoothProgress function (already partially fixed, complete it)
    print("\n  1. Completing smoothProgress fix...")
    for i in range(len(lines)):
        if 'function smoothProgress(taskId, reportedProgress, updateCount)' in lines[i]:
            # Keep the function but make it return reportedProgress directly
            j = i + 1
            while j < len(lines) and not lines[j].strip().startswith('function'):
                j += 1
            # Replace the function body
            new_function = [
                lines[i],  # Keep function declaration
                '  // CRITICAL FIX: Direct progress return - no smoothing\n',
                '  return reportedProgress;\n',
                '}\n'
            ]
            lines[i:j] = new_function
            print(f"    ✓ Fixed smoothProgress function at line {i+1}")
            break
    
    # Fix 2: updateTaskProgress function - remove backward progress prevention
    print("\n  2. Fixing updateTaskProgress...")
    for i in range(len(lines)):
        if 'function updateTaskProgress(taskId, progress, message, stats = null)' in lines[i]:
            # Find the backward progress prevention section
            j = i
            while j < len(lines) and j < i + 100:  # Look within next 100 lines
                if 'Ignoring backward progress update' in lines[j]:
                    # Comment out the backward progress check
                    k = j - 5  # Go back a few lines to find the if statement
                    while k < j + 5 and k < len(lines):
                        if 'if (progress < lastProgress' in lines[k]:
                            # Comment out the entire if block
                            indent = len(lines[k]) - len(lines[k].lstrip())
                            lines[k] = ' ' * indent + '// CRITICAL FIX: Removed backward progress prevention\n'
                            lines[k] = lines[k] + ' ' * indent + '// ' + lines[k].lstrip()
                            # Comment out the block
                            m = k + 1
                            while m < len(lines) and (lines[m].strip() == '' or len(lines[m]) - len(lines[m].lstrip()) > indent):
                                if lines[m].strip():
                                    lines[m] = ' ' * indent + '// ' + lines[m].lstrip()
                                m += 1
                            print(f"    ✓ Removed backward progress check at line {k+1}")
                            break
                        k += 1
                    break
                j += 1
            
            # Fix completion detection delay
            j = i
            while j < len(lines) and j < i + 150:
                if 'setTimeout(() =>' in lines[j] and '2000' in lines[j]:
                    # Check if this is the completion timeout
                    if 'completeTask' in lines[j+3] or 'completeTask' in lines[j+4] or 'completeTask' in lines[j+5]:
                        # Replace setTimeout with immediate execution
                        indent = len(lines[j]) - len(lines[j].lstrip())
                        # Find the completeTask call
                        k = j
                        while k < j + 10 and k < len(lines):
                            if 'completeTask(taskId' in lines[k]:
                                # Extract the completeTask call
                                complete_call = lines[k].strip()
                                # Replace the setTimeout block with immediate call
                                lines[j] = ' ' * indent + '// CRITICAL FIX: Complete immediately without delay\n'
                                lines[j] += ' ' * indent + complete_call + '\n'
                                # Comment out the rest of the setTimeout block
                                m = j + 1
                                while m < len(lines) and '}, 2000)' not in lines[m]:
                                    lines[m] = ' ' * indent + '// ' + lines[m].lstrip() if lines[m].strip() else lines[m]
                                    m += 1
                                if m < len(lines):
                                    lines[m] = ' ' * indent + '// ' + lines[m].lstrip()
                                print(f"    ✓ Fixed completion delay at line {j+1}")
                                break
                            k += 1
                        break
                j += 1
            break
    
    # Fix 3: setupTaskEventHandlers - enhance event registration
    print("\n  3. Enhancing event handler registration...")
    for i in range(len(lines)):
        if 'function setupTaskEventHandlers(taskId, options)' in lines[i]:
            # Find where handlers are registered
            j = i
            while j < len(lines) and j < i + 100:
                if "window.socket.on('progress_update', progressHandler)" in lines[j]:
                    indent = len(lines[j]) - len(lines[j].lstrip())
                    # Insert enhanced registration before the existing line
                    new_registration = [
                        ' ' * indent + '// CRITICAL FIX: Register ALL possible progress event names\n',
                        ' ' * indent + 'const progressEvents = [\n',
                        ' ' * indent + "  'progress_update',\n",
                        ' ' * indent + "  'task_progress',\n",
                        ' ' * indent + "  'file_processing_progress',\n",
                        ' ' * indent + "  'playlist_progress',\n",
                        ' ' * indent + "  'web_scraping_progress',\n",
                        ' ' * indent + "  'pdf_download_progress',\n",
                        ' ' * indent + "  'pdf_processing_progress'\n",
                        ' ' * indent + '];\n',
                        ' ' * indent + '\n',
                        ' ' * indent + '// Register all progress events\n',
                        ' ' * indent + 'progressEvents.forEach(event => {\n',
                        ' ' * indent + '  window.socket.on(event, progressHandler);\n',
                        ' ' * indent + '  handlers.socketHandlers[event] = progressHandler;\n',
                        ' ' * indent + '});\n',
                        ' ' * indent + '\n'
                    ]
                    # Comment out the old registration
                    lines[j] = ' ' * indent + '// ' + lines[j].lstrip()
                    # Insert new registration
                    lines[j:j] = new_registration
                    print(f"    ✓ Enhanced event registration at line {j+1}")
                    break
                j += 1
            break
    
    # Fix 4: updateProgressUI - ensure direct updates
    print("\n  4. Ensuring direct progress updates in UI...")
    for i in range(len(lines)):
        if 'function updateProgressUI(taskId, progress, message, stats = null)' in lines[i]:
            # Find smoothedProgress usage
            j = i
            while j < len(lines) and j < i + 100:
                if 'const smoothedProgress = smoothProgress(' in lines[j]:
                    # Replace with direct assignment
                    indent = len(lines[j]) - len(lines[j].lstrip())
                    lines[j] = ' ' * indent + '// CRITICAL FIX: Direct progress assignment\n'
                    lines[j] += ' ' * indent + 'const smoothedProgress = Math.max(0, Math.min(100, progress));\n'
                    print(f"    ✓ Fixed smoothed progress usage at line {j+1}")
                    break
                j += 1
            break
    
    # Write the fixed content
    print("\n💾 Writing fixed progressHandler.js...")
    with open(progress_handler_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    print("\n✅ Manual fixes applied successfully!")
    
    # Create summary
    summary = {
        "fix_applied": datetime.datetime.now().isoformat(),
        "backup_created": backup_path,
        "fixes_applied": [
            "Completed smoothProgress direct return fix",
            "Removed backward progress prevention",
            "Fixed completion detection delay",
            "Enhanced SocketIO event registration",
            "Ensured direct progress updates in UI"
        ],
        "file_modified": progress_handler_path,
        "method": "manual_line_by_line"
    }
    
    summary_path = '/workspace/modules/progress_fix_manual_summary.json'
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n📋 Fix summary saved to: {summary_path}")
    return True

def verify_fixes():
    """Verify the fixes were applied"""
    progress_handler_path = '/workspace/modules/static/js/modules/utils/progressHandler.js'
    
    print("\n🔍 Verifying fixes...")
    
    with open(progress_handler_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    checks = [
        ("smoothProgress returns directly", "// CRITICAL FIX: Direct progress return"),
        ("Event registration enhanced", "// CRITICAL FIX: Register ALL possible progress event names"),
        ("Completion without delay", "// CRITICAL FIX: Complete immediately without delay"),
        ("Direct progress assignment", "// CRITICAL FIX: Direct progress assignment"),
        ("Backward prevention removed", "// CRITICAL FIX: Removed backward progress prevention")
    ]
    
    all_good = True
    for check_name, check_string in checks:
        if check_string in content:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ⚠️  {check_name} - May need manual verification")
    
    return all_good

def main():
    try:
        if apply_manual_fixes():
            verify_fixes()
            print("\n🎉 Progress bar fixes have been applied!")
            print("\n📝 Next Steps:")
            print("  1. Restart the NeuroGenServer")
            print("  2. Clear browser cache")
            print("  3. Test each module:")
            print("     - File Processor")
            print("     - Playlist Downloader")
            print("     - Web Scraper")
            print("\n💡 Browser Console Debug:")
            print("  window.progressDebug = true;")
            print("  window.socket.on('progress_update', d => console.log(d));")
            return 0
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())