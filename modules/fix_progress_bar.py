"""
NeuroGenServer Progress Bar Fix Deployment Script
Fixes the critical issue where progress bars get stuck at 50%
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

def apply_progress_handler_fix():
    """Apply the fix to progressHandler.js"""
    
    progress_handler_path = '/workspace/modules/static/js/modules/utils/progressHandler.js'
    
    print("\n🔧 NeuroGenServer Progress Bar Fix Deployment")
    print("=" * 50)
    
    # Check if file exists
    if not os.path.exists(progress_handler_path):
        print(f"❌ Error: progressHandler.js not found at {progress_handler_path}")
        return False
    
    # Create backup
    print("\n📦 Creating backup...")
    backup_path = create_backup(progress_handler_path)
    
    # Read the current file
    print("\n📖 Reading current progressHandler.js...")
    with open(progress_handler_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("\n🔍 Applying critical fixes:")
    
    # Fix 1: Remove progress smoothing function that causes stuck progress
    print("  1. Removing progress smoothing logic...")
    
    # Replace the smoothProgress function with a direct return
    smooth_progress_fix = '''// Advanced progress smoother for early progress indication
function smoothProgress(taskId, reportedProgress, updateCount) {
  // CRITICAL FIX: Direct progress return - no smoothing
  return reportedProgress;
}'''
    
    # Find and replace the smoothProgress function
    import re
    smooth_pattern = r'// Advanced progress smoother for early progress indication\s*\n\s*function smoothProgress\([^}]+\}(?:\s*\n\s*return reportedProgress;\s*\n\s*\})?'
    content = re.sub(smooth_pattern, smooth_progress_fix, content, flags=re.DOTALL)
    
    # Fix 2: Update the updateTaskProgress function to remove backward progress prevention
    print("  2. Fixing updateTaskProgress to allow all progress updates...")
    
    # Find the updateTaskProgress function and fix it
    update_task_pattern = r'(function updateTaskProgress\(taskId, progress, message, stats = null\) \{[^}]+?)// Store the last reported progress value to prevent UI flicker[^}]+?// Update last progress value\s*\n\s*state\.lastProgressValues\.set\(taskId, progress\);'
    
    update_task_fix = r'''\1// CRITICAL FIX: Accept all progress updates directly
  progress = Math.max(0, Math.min(100, Number(progress) || 0));
  
  // Update last progress value
  state.lastProgressValues.set(taskId, progress);'''
    
    content = re.sub(update_task_pattern, update_task_fix, content, flags=re.DOTALL)
    
    # Fix 3: Fix the completion detection to be immediate
    print("  3. Fixing completion detection for immediate response...")
    
    completion_pattern = r'// If progress reaches 100% or status is completed, mark as completed\s*\n\s*if[^}]+?setTimeout\(\(\) => \{[^}]+?\}, 2000\);[^}]+?\}'
    
    completion_fix = '''// If progress reaches 100% or status is completed, mark as completed
  if ((progress >= 100 || (stats && stats.status === "completed")) && 
      task.status !== 'completed' && 
      !state.completedTaskIds.has(taskId)) {
    
    // CRITICAL FIX: Complete immediately without delay
    console.log(`Task ${taskId} reached completion criteria - completing immediately`);
    completeTask(taskId, {
      ...task,
      output_file: task.outputPath || stats?.output_file || null
    });
  }'''
    
    content = re.sub(completion_pattern, completion_fix, content, flags=re.DOTALL)
    
    # Fix 4: Enhance event handler registration
    print("  4. Enhancing SocketIO event handler registration...")
    
    # Find setupTaskEventHandlers and enhance it
    event_handler_pattern = r'(function setupTaskEventHandlers\(taskId, options\) \{[^}]+?)// Register handlers\s*\n\s*window\.socket\.on\(\'progress_update\', progressHandler\);[^}]+?// Also register type-specific handlers if task type is provided'
    
    event_handler_fix = r'''\1// CRITICAL FIX: Register ALL possible progress event names
    const progressEvents = [
      'progress_update',
      'task_progress', 
      'file_processing_progress',
      'playlist_progress',
      'web_scraping_progress',
      'pdf_download_progress',
      'pdf_processing_progress'
    ];
    
    // Register all progress events
    progressEvents.forEach(event => {
      window.socket.on(event, progressHandler);
      handlers.socketHandlers[event] = progressHandler;
    });
    
    // Also register completion/error/cancel events
    window.socket.on('task_completed', completedHandler);
    window.socket.on('task_error', errorHandler);
    window.socket.on('task_cancelled', cancelledHandler);
    
    handlers.socketHandlers['task_completed'] = completedHandler;
    handlers.socketHandlers['task_error'] = errorHandler;
    handlers.socketHandlers['task_cancelled'] = cancelledHandler;
    
    // Also register type-specific handlers if task type is provided'''
    
    content = re.sub(event_handler_pattern, event_handler_fix, content, flags=re.DOTALL)
    
    # Fix 5: Update progress UI to use direct assignment
    print("  5. Fixing progress bar animation for direct updates...")
    
    animation_pattern = r'(function applyProgressBarAnimation\(progressBar, currentWidth, targetWidth\) \{[^}]+?)// Apply the animation'
    
    animation_fix = r'''\1// CRITICAL FIX: Direct width assignment for immediate update
  progressBar.style.width = `${targetWidth}%`;
  progressBar.setAttribute('aria-valuenow', targetWidth);
  progressBar.textContent = `${Math.round(targetWidth)}%`;
  
  // Apply the animation'''
    
    content = re.sub(animation_pattern, animation_fix, content, flags=re.DOTALL)
    
    # Write the fixed content
    print("\n💾 Writing fixed progressHandler.js...")
    with open(progress_handler_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("\n✅ Progress handler fixes applied successfully!")
    
    # Create a fix summary
    summary = {
        "fix_applied": datetime.datetime.now().isoformat(),
        "backup_created": backup_path,
        "fixes_applied": [
            "Removed progress smoothing that caused stuck at 50%",
            "Removed backward progress prevention",
            "Fixed completion detection to be immediate",
            "Enhanced SocketIO event registration for all event types",
            "Fixed progress bar animation for direct updates"
        ],
        "file_modified": progress_handler_path
    }
    
    summary_path = '/workspace/modules/progress_fix_summary.json'
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n📋 Fix summary saved to: {summary_path}")
    
    return True

def verify_fix():
    """Verify the fix was applied correctly"""
    progress_handler_path = '/workspace/modules/static/js/modules/utils/progressHandler.js'
    
    print("\n🔍 Verifying fix...")
    
    with open(progress_handler_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    checks = [
        ("Direct progress return in smoothProgress", "// CRITICAL FIX: Direct progress return - no smoothing"),
        ("Immediate completion detection", "// CRITICAL FIX: Complete immediately without delay"),
        ("Enhanced event registration", "// CRITICAL FIX: Register ALL possible progress event names"),
        ("Direct progress updates", "// CRITICAL FIX: Accept all progress updates directly"),
        ("Direct width assignment", "// CRITICAL FIX: Direct width assignment for immediate update")
    ]
    
    all_good = True
    for check_name, check_string in checks:
        if check_string in content:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ❌ {check_name} - NOT FOUND")
            all_good = False
    
    return all_good

def main():
    """Main execution"""
    try:
        # Apply the fix
        if apply_progress_handler_fix():
            # Verify the fix
            if verify_fix():
                print("\n🎉 SUCCESS: Progress bar fix deployed successfully!")
                print("\n📝 Next Steps:")
                print("  1. Restart the NeuroGenServer")
                print("  2. Test File Processor module")
                print("  3. Test Playlist Downloader module")
                print("  4. Test Web Scraper module")
                print("  5. Verify progress bars reach 100% properly")
                
                print("\n💡 Testing Commands:")
                print("  - Browser Console: window.progressDebug = true;")
                print("  - Monitor events: window.socket.on('progress_update', (data) => console.log('Progress:', data));")
                
                return 0
            else:
                print("\n⚠️ WARNING: Fix was applied but verification failed!")
                print("Please check the file manually.")
                return 1
        else:
            print("\n❌ ERROR: Failed to apply progress bar fix!")
            return 1
            
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())