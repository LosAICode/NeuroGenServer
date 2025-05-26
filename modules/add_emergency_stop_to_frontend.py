"""
Add emergency stop handling to fileProcessor.js
"""

import os
import datetime

def add_emergency_stop_to_file_processor():
    """Add emergency stop handling to fileProcessor.js"""
    
    file_processor_path = '/workspace/modules/static/js/modules/features/fileProcessor.js'
    
    print("\n🔧 Adding Emergency Stop to fileProcessor.js")
    print("=" * 50)
    
    # Read the file
    print("\n📖 Reading fileProcessor.js...")
    with open(file_processor_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Find where to add the emergency stop handler (in the module definition)
    for i, line in enumerate(lines):
        if 'handleCancelClick(event)' in line:
            # Find the end of this function
            j = i
            brace_count = 0
            found_start = False
            while j < len(lines):
                if '{' in lines[j]:
                    brace_count += lines[j].count('{')
                    found_start = True
                if '}' in lines[j] and found_start:
                    brace_count -= lines[j].count('}')
                if brace_count == 0 and found_start:
                    # Insert emergency stop handler after this function
                    emergency_handler = '''
  /**
   * Handle emergency stop - force cancel without task ID
   * @param {string} reason - Reason for emergency stop
   */
  async emergencyStop(reason = "Emergency stop triggered") {
    try {
      console.warn("[EMERGENCY] Emergency stop triggered:", reason);
      
      // Update UI immediately
      this.updateEmergencyStopUI();
      
      // Force reset all state
      this.forceResetProcessingState();
      
      // Try Socket.IO first
      if (window.socket && window.socket.connected) {
        window.socket.emit('emergency_stop', {
          reason: reason,
          timestamp: Date.now()
        });
        
        // Listen for response
        window.socket.once('emergency_stop_complete', (data) => {
          console.log('[EMERGENCY] Stop complete:', data);
          this.showEmergencyStopComplete(data);
        });
        
        window.socket.once('emergency_stop_error', (data) => {
          console.error('[EMERGENCY] Stop error:', data);
          this.showError('Emergency stop encountered an error');
        });
      }
      
      // Also try REST API
      try {
        const response = await fetch('/api/emergency-stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        
        if (!response.ok) {
          throw new Error(`Emergency stop failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[EMERGENCY] REST API response:', result);
        
        // Show completion
        this.showEmergencyStopComplete(result);
        
      } catch (apiError) {
        console.error('[EMERGENCY] API Error:', apiError);
        // Still show UI as stopped
        this.showCancelled();
      }
      
    } catch (error) {
      console.error('[EMERGENCY] Error during emergency stop:', error);
      this.handleError(error, "Emergency stop error");
      // Force UI to cancelled state
      this.showCancelled();
    }
  },

  /**
   * Update UI for emergency stop
   */
  updateEmergencyStopUI() {
    // Update all buttons and status
    const cancelBtn = getElement('cancel-btn');
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.innerHTML = '<i class="fas fa-stop-circle"></i> EMERGENCY STOPPING...';
      cancelBtn.classList.add('btn-danger');
    }
    
    const progressStatus = getElement('progress-status');
    if (progressStatus) {
      progressStatus.textContent = "EMERGENCY STOP - Forcing cancellation...";
      progressStatus.classList.add('text-danger');
    }
    
    // Add emergency stop indicator
    const progressBar = getElement('progress-bar');
    if (progressBar) {
      progressBar.classList.add('bg-danger');
    }
  },

  /**
   * Show emergency stop completion
   * @param {Object} data - Completion data
   */
  showEmergencyStopComplete(data) {
    console.log('[EMERGENCY] Showing emergency stop completion:', data);
    
    // Clear all state
    this.forceResetProcessingState();
    
    // Show cancelled state with emergency message
    const cancelledContainer = getElement('cancelled-container');
    if (cancelledContainer) {
      const message = cancelledContainer.querySelector('.alert-warning');
      if (message) {
        message.innerHTML = `
          <h4 class="alert-heading">
            <i class="fas fa-stop-circle"></i> Emergency Stop Executed
          </h4>
          <p>All tasks have been forcefully cancelled.</p>
          <hr>
          <p class="mb-0">
            Cancelled Tasks: ${data.cancelled_count || 'Unknown'}<br>
            <small>You may need to refresh the page if issues persist.</small>
          </p>
        `;
        message.classList.remove('alert-warning');
        message.classList.add('alert-danger');
      }
    }
    
    this.showCancelled();
  },

'''
                    lines.insert(j + 1, emergency_handler)
                    print(f"✓ Added emergency stop handler after line {j+1}")
                    break
                j += 1
            break
    
    # Add keyboard shortcut for emergency stop
    keyboard_handler = '''
// Add keyboard shortcut for emergency stop (Ctrl+Shift+X)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'X') {
    e.preventDefault();
    if (window.fileProcessor && typeof window.fileProcessor.emergencyStop === 'function') {
      if (confirm('⚠️ EMERGENCY STOP ⚠️\\n\\nThis will forcefully cancel ALL running tasks!\\n\\nAre you sure?')) {
        window.fileProcessor.emergencyStop('Keyboard shortcut triggered');
      }
    }
  }
});

'''
    
    # Add at the end of the file
    lines.append('\n' + keyboard_handler)
    print("✓ Added keyboard shortcut handler (Ctrl+Shift+X)")
    
    # Write the updated file
    print("\n💾 Writing updated fileProcessor.js...")
    with open(file_processor_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    print("\n✅ Emergency stop functionality added to fileProcessor.js!")
    
    return True

def create_test_script():
    """Create a test script for emergency stop"""
    
    test_script = '''// Test Emergency Stop Functionality
// Paste this in browser console to test

// Test 1: Check if emergency stop function exists
console.log('Emergency stop available:', typeof window.fileProcessor?.emergencyStop === 'function');

// Test 2: Trigger emergency stop programmatically
function testEmergencyStop() {
    if (window.fileProcessor && typeof window.fileProcessor.emergencyStop === 'function') {
        console.log('Triggering emergency stop...');
        window.fileProcessor.emergencyStop('Test trigger');
    } else {
        console.error('Emergency stop not available');
    }
}

// Test 3: Check keyboard shortcut
console.log('Keyboard shortcut: Ctrl+Shift+X');

// Test 4: Direct API call
async function testEmergencyAPI() {
    try {
        const response = await fetch('/api/emergency-stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'API test' })
        });
        const result = await response.json();
        console.log('API Response:', result);
    } catch (error) {
        console.error('API Error:', error);
    }
}

// Test 5: Socket.IO emergency stop
function testSocketEmergency() {
    if (window.socket && window.socket.connected) {
        window.socket.emit('emergency_stop', {
            reason: 'Socket test',
            timestamp: Date.now()
        });
        console.log('Emergency stop emitted via Socket.IO');
    } else {
        console.error('Socket.IO not connected');
    }
}

console.log('Test functions available:');
console.log('- testEmergencyStop()');
console.log('- testEmergencyAPI()');
console.log('- testSocketEmergency()');
'''
    
    with open('/workspace/modules/test_emergency_stop.js', 'w') as f:
        f.write(test_script)
    
    print("\n📄 Test script saved to: test_emergency_stop.js")

def main():
    """Main execution"""
    try:
        print("🚀 Adding Emergency Stop to Frontend")
        
        if add_emergency_stop_to_file_processor():
            create_test_script()
            
            print("\n✅ Frontend emergency stop functionality added!")
            print("\n📝 Features added:")
            print("  1. emergencyStop() method in fileProcessor")
            print("  2. Emergency UI updates")
            print("  3. Keyboard shortcut: Ctrl+Shift+X")
            print("  4. Socket.IO and REST API integration")
            
            print("\n🧪 To test:")
            print("  1. Open browser console")
            print("  2. Copy contents of test_emergency_stop.js")
            print("  3. Run test functions")
            print("  4. Or press Ctrl+Shift+X during a stuck task")
            
            return 0
        else:
            print("\n❌ Failed to add frontend emergency stop")
            return 1
            
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main())