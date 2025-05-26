"""
Enhanced Cancellation Fix for NeuroGenServer
Adds force cancellation capability to break out of stuck loops
"""

import os
import re
import datetime
import shutil

def create_backup(file_path):
    """Create a backup of the file before modification"""
    if os.path.exists(file_path):
        backup_dir = os.path.join(os.path.dirname(file_path), 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = os.path.basename(file_path)
        backup_path = os.path.join(backup_dir, f"{filename.split('.')[0]}_backup_{timestamp}.py")
        
        shutil.copy2(file_path, backup_path)
        print(f"✓ Created backup: {backup_path}")
        return backup_path
    return None

def add_force_cancel_functionality():
    """Add force cancellation functionality to main.py"""
    
    main_py_path = '/workspace/modules/main.py'
    
    print("\n🔧 Adding Enhanced Cancellation Functionality")
    print("=" * 50)
    
    # Create backup
    print("\n📦 Creating backup...")
    backup_path = create_backup(main_py_path)
    
    # Read the file
    print("\n📖 Reading main.py...")
    with open(main_py_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find where to insert the new functionality (after the mark_task_cancelled function)
    insertion_point = content.find('def emit_cancellation_event(')
    if insertion_point == -1:
        print("❌ Could not find insertion point")
        return False
    
    # Enhanced cancellation code to insert
    enhanced_cancel_code = '''

# ============================================================================
# ENHANCED FORCE CANCELLATION SYSTEM
# ============================================================================

# Global force cancellation flag
FORCE_CANCEL_ALL = False
FORCE_CANCELLED_TASKS = set()

def force_cancel_all_tasks():
    """
    Force cancel ALL active tasks regardless of their state.
    This is a nuclear option to break out of stuck loops.
    """
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    
    logger.warning("[FORCE_CANCEL] Initiating force cancellation of ALL tasks")
    
    # Set global force cancel flag
    FORCE_CANCEL_ALL = True
    
    # Cancel all tasks in active_tasks
    with tasks_lock:
        cancelled_count = 0
        for task_id, task in list(active_tasks.items()):
            try:
                # Add to force cancelled set
                FORCE_CANCELLED_TASKS.add(task_id)
                
                # Try to set cancellation flags on the task object
                if hasattr(task, '__setattr__'):
                    try:
                        task.is_cancelled = True
                        task.is_cancelled_flag = True
                        task.status = 'cancelled'
                        task.cancelled = True
                    except:
                        pass
                
                # If it's a ProcessingTask, try to set its internal flag
                if hasattr(task, '_cancelled'):
                    task._cancelled = True
                
                # Emit cancellation event
                task_type = 'unknown'
                if hasattr(task, 'task_type'):
                    task_type = task.task_type
                elif isinstance(task, dict) and 'type' in task:
                    task_type = task['type']
                
                emit_task_cancelled(task_id, reason="Force cancelled due to system issue")
                cancelled_count += 1
                
                logger.info(f"[FORCE_CANCEL] Force cancelled task {task_id} (type: {task_type})")
                
            except Exception as e:
                logger.error(f"[FORCE_CANCEL] Error force cancelling task {task_id}: {e}")
        
        # Clear all active tasks
        active_tasks.clear()
        
    logger.warning(f"[FORCE_CANCEL] Force cancelled {cancelled_count} tasks")
    
    # Also emit a global cancellation event
    try:
        socketio.emit('all_tasks_cancelled', {
            'reason': 'Force cancellation due to system issue',
            'count': cancelled_count,
            'timestamp': time.time()
        })
    except:
        pass
    
    return cancelled_count

def is_force_cancelled(task_id=None):
    """
    Check if force cancellation is active or if a specific task was force cancelled.
    
    Args:
        task_id: Optional task ID to check. If None, checks global flag.
        
    Returns:
        bool: True if force cancelled
    """
    if FORCE_CANCEL_ALL:
        return True
    
    if task_id and task_id in FORCE_CANCELLED_TASKS:
        return True
        
    return False

def reset_force_cancel():
    """Reset force cancellation flags"""
    global FORCE_CANCEL_ALL, FORCE_CANCELLED_TASKS
    FORCE_CANCEL_ALL = False
    FORCE_CANCELLED_TASKS.clear()
    logger.info("[FORCE_CANCEL] Force cancellation flags reset")

# Update check_task_cancellation to include force cancel check
def check_task_cancellation_enhanced(task_id: str) -> bool:
    """
    Enhanced version that checks for force cancellation first.
    
    Args:
        task_id: The task ID to check
        
    Returns:
        bool: True if the task is cancelled or force cancelled
    """
    # Check force cancellation first
    if is_force_cancelled(task_id):
        return True
    
    # Then check normal cancellation
    return check_task_cancellation(task_id)

# ============================================================================
# EMERGENCY STOP ENDPOINT
# ============================================================================

@app.route("/api/emergency-stop", methods=["POST"])
def emergency_stop():
    """
    Emergency stop endpoint to force cancel all tasks.
    Use this when normal cancellation isn't working.
    """
    try:
        logger.warning("[EMERGENCY] Emergency stop requested")
        
        # Get current task count before cancellation
        task_count = len(active_tasks)
        
        # Force cancel all tasks
        cancelled_count = force_cancel_all_tasks()
        
        # Kill any stuck threads (be careful with this)
        try:
            # Get all threads
            import threading
            current_thread = threading.current_thread()
            for thread in threading.enumerate():
                if thread != current_thread and thread.name.startswith(('ProcessingTask', 'FileProcessor')):
                    logger.warning(f"[EMERGENCY] Attempting to stop thread: {thread.name}")
                    # Note: We can't forcefully kill threads in Python, but we can log them
        except Exception as e:
            logger.error(f"[EMERGENCY] Error enumerating threads: {e}")
        
        return jsonify({
            "status": "success",
            "message": "Emergency stop executed",
            "tasks_before": task_count,
            "tasks_cancelled": cancelled_count,
            "timestamp": time.time()
        }), 200
        
    except Exception as e:
        logger.error(f"[EMERGENCY] Error during emergency stop: {e}")
        return structured_error_response(
            "EMERGENCY_STOP_ERROR",
            f"Error during emergency stop: {str(e)}",
            500
        )

@socketio.on('emergency_stop')
def handle_emergency_stop(data):
    """Socket.IO handler for emergency stop"""
    logger.warning("[EMERGENCY] Emergency stop via Socket.IO")
    
    try:
        cancelled_count = force_cancel_all_tasks()
        
        emit('emergency_stop_complete', {
            'status': 'success',
            'cancelled_count': cancelled_count,
            'timestamp': time.time()
        })
        
    except Exception as e:
        logger.error(f"[EMERGENCY] Socket.IO emergency stop error: {e}")
        emit('emergency_stop_error', {
            'error': str(e),
            'timestamp': time.time()
        })

'''

    # Insert the enhanced cancellation code
    content = content[:insertion_point] + enhanced_cancel_code + '\n' + content[insertion_point:]
    
    # Now update the _check_internal_cancellation method to include force cancel check
    print("\n🔍 Updating _check_internal_cancellation method...")
    
    # Find and update the _check_internal_cancellation method
    internal_cancel_pattern = r'(def _check_internal_cancellation\(self\) -> bool:.*?""".*?\n)(.*?)(return False)'
    
    def update_internal_cancel(match):
        start = match.group(1)
        middle = match.group(2)
        end = match.group(3)
        
        # Add force cancel check at the beginning
        force_check = '''    try:
        # CRITICAL: Check force cancellation first
        if is_force_cancelled(self.task_id if hasattr(self, 'task_id') else None):
            logger.warning(f"Task {getattr(self, 'task_id', 'unknown')} force cancelled")
            return True
        
'''
        return start + force_check + middle + end
    
    content = re.sub(internal_cancel_pattern, update_internal_cancel, content, flags=re.DOTALL)
    
    # Update the progress callback to check force cancellation more frequently
    print("\n🔍 Updating progress callback for more frequent checks...")
    
    # Find the cancellation check interval setting
    interval_pattern = r'(self\.cancellation_check_interval = )(\d+)'
    content = re.sub(interval_pattern, r'\g<1>5', content)  # Check every 5 iterations instead of default
    
    # Write the updated content
    print("\n💾 Writing updated main.py...")
    with open(main_py_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("\n✅ Enhanced cancellation functionality added successfully!")
    
    return True

def create_emergency_stop_ui():
    """Create a simple emergency stop HTML/JS snippet for the frontend"""
    
    emergency_ui = '''
<!-- Emergency Stop Button - Add this to your main template -->
<div id="emergency-stop-container" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: none;">
    <button id="emergency-stop-btn" class="btn btn-danger btn-lg" onclick="emergencyStop()">
        <i class="fas fa-stop-circle"></i> EMERGENCY STOP
    </button>
</div>

<script>
// Emergency Stop Functionality
function showEmergencyStop() {
    const container = document.getElementById('emergency-stop-container');
    if (container) {
        container.style.display = 'block';
    }
}

function hideEmergencyStop() {
    const container = document.getElementById('emergency-stop-container');
    if (container) {
        container.style.display = 'none';
    }
}

async function emergencyStop() {
    if (!confirm('⚠️ EMERGENCY STOP ⚠️\\n\\nThis will forcefully cancel ALL running tasks!\\n\\nAre you sure?')) {
        return;
    }
    
    console.log('[EMERGENCY] Initiating emergency stop...');
    
    // Disable the button
    const btn = document.getElementById('emergency-stop-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping...';
    }
    
    try {
        // Try Socket.IO first
        if (window.socket && window.socket.connected) {
            window.socket.emit('emergency_stop', {
                timestamp: Date.now()
            });
            
            // Listen for response
            window.socket.once('emergency_stop_complete', (data) => {
                console.log('[EMERGENCY] Stop complete:', data);
                alert(`Emergency stop executed. ${data.cancelled_count} tasks cancelled.`);
                location.reload();
            });
            
            window.socket.once('emergency_stop_error', (data) => {
                console.error('[EMERGENCY] Stop error:', data);
                alert('Emergency stop encountered an error. Please refresh the page.');
            });
        }
        
        // Also try REST API
        const response = await fetch('/api/emergency-stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Emergency stop failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[EMERGENCY] REST API response:', result);
        
    } catch (error) {
        console.error('[EMERGENCY] Error:', error);
        alert('Emergency stop failed. Please refresh the page manually.');
    }
}

// Show emergency stop button if any task is running for more than 30 seconds
setInterval(() => {
    const progressBars = document.querySelectorAll('.progress-bar');
    let shouldShow = false;
    
    progressBars.forEach(bar => {
        const width = parseFloat(bar.style.width) || 0;
        if (width > 0 && width < 100) {
            shouldShow = true;
        }
    });
    
    if (shouldShow) {
        showEmergencyStop();
    } else {
        hideEmergencyStop();
    }
}, 5000); // Check every 5 seconds
</script>
'''
    
    # Save to file
    with open('/workspace/modules/emergency_stop_ui.html', 'w') as f:
        f.write(emergency_ui)
    
    print("\n📄 Emergency stop UI snippet saved to: emergency_stop_ui.html")
    print("   Add this to your main template (index.html) to enable the emergency stop button")

def main():
    """Main execution"""
    try:
        print("🚀 NeuroGenServer Enhanced Cancellation Fix")
        print("=" * 50)
        
        # Apply the fix
        if add_force_cancel_functionality():
            # Create UI snippet
            create_emergency_stop_ui()
            
            print("\n✅ Enhanced cancellation system installed!")
            print("\n📝 New features added:")
            print("  1. Force cancellation flag system")
            print("  2. /api/emergency-stop endpoint")
            print("  3. Socket.IO 'emergency_stop' event")
            print("  4. Enhanced internal cancellation checks")
            print("  5. Emergency stop UI button (see emergency_stop_ui.html)")
            
            print("\n🔧 Usage:")
            print("  - Normal cancel: Click cancel button or call /api/cancel/<task_id>")
            print("  - Emergency stop: Call /api/emergency-stop or use emergency button")
            print("  - Socket.IO: emit('emergency_stop', {})")
            
            print("\n⚠️  Important:")
            print("  - Emergency stop cancels ALL active tasks")
            print("  - Use only when normal cancellation fails")
            print("  - May require page refresh after use")
            
            return 0
        else:
            print("\n❌ Failed to apply enhanced cancellation fix")
            return 1
            
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main())