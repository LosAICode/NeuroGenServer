#!/usr/bin/env python3
"""
Simple test to verify the complete file processor flow
Tests: API submission -> Socket.IO events -> Completion with stats
"""

import requests
import socketio
import time
import json
import threading

# Configuration
API_URL = "http://localhost:5025"
TEST_DIR = "/workspace/modules/static/js/modules/config"
OUTPUT_FILE = "test_flow_simple.json"

# Global state
received_events = []
task_completed = threading.Event()
task_id = None

def test_file_processor_flow():
    """Test the complete flow of file processing with socket events"""
    
    print("🧪 Testing File Processor Complete Flow")
    print("="*50)
    
    # Initialize Socket.IO client
    sio = socketio.Client()
    
    @sio.on('connect')
    def on_connect():
        print("✅ Socket.IO connected")
    
    @sio.on('task_started')
    def on_task_started(data):
        print(f"🚀 Task started: {data.get('task_id')}")
        received_events.append(('task_started', data))
    
    @sio.on('progress_update')
    def on_progress_update(data):
        progress = data.get('progress', 0)
        message = data.get('message', '')
        print(f"📊 Progress: {progress}% - {message}")
        received_events.append(('progress_update', data))
    
    @sio.on('task_completed')
    def on_task_completed(data):
        print(f"✅ Task completed: {data.get('task_id')}")
        print(f"📊 Stats received: {json.dumps(data.get('stats', {}), indent=2)}")
        received_events.append(('task_completed', data))
        task_completed.set()
    
    @sio.on('task_error')
    def on_task_error(data):
        print(f"❌ Task error: {data.get('error')}")
        received_events.append(('task_error', data))
        task_completed.set()
    
    try:
        # Connect to Socket.IO
        print("🔌 Connecting to Socket.IO...")
        sio.connect(API_URL)
        time.sleep(1)  # Give it time to connect
        
        # Submit file processing task
        print(f"\n📤 Submitting task to process: {TEST_DIR}")
        response = requests.post(
            f"{API_URL}/api/process",
            json={
                "input_dir": TEST_DIR,
                "output_file": OUTPUT_FILE
            }
        )
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        task_id = data.get('task_id')
        print(f"✅ Task submitted: {task_id}")
        
        # Wait for completion
        print("\n⏳ Waiting for task completion...")
        if not task_completed.wait(timeout=30):
            print("❌ Timeout: Task did not complete within 30 seconds")
            return False
        
        # Analyze results
        print("\n📊 Event Summary:")
        print(f"Total events received: {len(received_events)}")
        
        # Check for completion event with stats
        completion_events = [e for e in received_events if e[0] == 'task_completed']
        if completion_events:
            completion_data = completion_events[0][1]
            stats = completion_data.get('stats', {})
            
            print("\n✅ SUCCESS: Task completed with stats!")
            print(f"📁 Files processed: {stats.get('processed_files', 'N/A')}")
            print(f"📏 Total size: {stats.get('formatted_total_size', 'N/A')}")
            print(f"⏱️ Duration: {stats.get('formatted_duration', 'N/A')}")
            print(f"📊 Success rate: {stats.get('success_rate_percent', 'N/A')}%")
            
            # Check output file
            output_path = completion_data.get('output_file')
            if output_path:
                import os
                if os.path.exists(output_path):
                    print(f"\n✅ Output file created: {output_path}")
                    print(f"📏 File size: {os.path.getsize(output_path)} bytes")
                else:
                    print(f"\n❌ Output file not found: {output_path}")
            
            return True
        else:
            print("\n❌ FAIL: No completion event received")
            return False
            
    except Exception as e:
        print(f"\n❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Disconnect
        if sio.connected:
            sio.disconnect()
            print("\n🔌 Socket.IO disconnected")

if __name__ == "__main__":
    success = test_file_processor_flow()
    
    print("\n" + "="*50)
    if success:
        print("✅ TEST PASSED: Complete flow working correctly!")
    else:
        print("❌ TEST FAILED: Issues detected in the flow")
    
    exit(0 if success else 1)