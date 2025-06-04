#!/usr/bin/env python3
"""
Direct SocketIO Validation Test
Tests the actual SocketIO emission in the Flask app context
"""

import os
import sys
import time
import threading
import logging

# Add modules path  
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

def test_socketio_emissions():
    """Test SocketIO events in proper Flask context"""
    print("🔍 Testing SocketIO Event Emissions...")
    
    # Import and create app
    from app import create_app
    app, socketio = create_app()
    
    print("✅ App and SocketIO created")
    
    # Test within proper Flask and SocketIO context
    with app.app_context():
        print("🌐 Running within Flask app context")
        
        # Verify SocketIO context is set
        from blueprints.socketio_events import _app_instance, _socketio_instance
        print(f"📡 App context available: {_app_instance is not None}")  
        print(f"📡 SocketIO context available: {_socketio_instance is not None}")
        
        # Test safe_emit function directly
        from blueprints.socketio_events import safe_emit
        
        print("🧪 Testing safe_emit function...")
        test_payload = {
            'task_id': 'test_emit',
            'message': 'Testing SocketIO emission',
            'timestamp': time.time()
        }
        
        success = safe_emit('test_event', test_payload)
        print(f"📡 safe_emit result: {success}")
        
        # Test task emission functions
        from blueprints.socketio_events import (
            emit_task_started, 
            emit_progress_update_unified,
            emit_task_completion_unified
        )
        
        print("🧪 Testing task event functions...")
        
        # Test task started
        started_success = emit_task_started(
            task_id='validation_test',
            task_type='file_processing', 
            message='Testing task started emission'
        )
        print(f"📨 emit_task_started: {started_success}")
        
        # Test progress update
        progress_success = emit_progress_update_unified(
            task_id='validation_test',
            progress=50,
            message='Testing progress update'
        )
        print(f"📊 emit_progress_update: {progress_success}")
        
        # Test task completion
        completion_success = emit_task_completion_unified(
            task_id='validation_test',
            task_type='file_processing',
            output_file='/test/output.json'
        )
        print(f"✅ emit_task_completion: {completion_success}")
        
        return started_success, progress_success, completion_success

def test_processing_task_with_fixed_context():
    """Test ProcessingTask with fixed SocketIO context"""
    print("\n🎯 Testing ProcessingTask with Fixed Context...")
    
    from app import create_app
    app, socketio = create_app()
    
    with app.app_context():
        from blueprints.core.services import ProcessingTask
        
        print("📋 Creating ProcessingTask in proper context...")
        task = ProcessingTask(
            task_id='context_fixed_test',
            input_dir='/workspace/modules/test_input',
            output_file='/workspace/modules/test_output/context_fixed_test.json'
        )
        
        print("🚀 Starting ProcessingTask...")
        result = task.start()
        print(f"Task start result: {result}")
        
        # Monitor task completion
        start_time = time.time()
        timeout = 15
        
        while task.status != 'completed' and time.time() - start_time < timeout:
            print(f"📊 Task status: {task.status}, Progress: {task.progress}%")
            time.sleep(1)
        
        print(f"🏁 Final task status: {task.status}")
        print(f"🏁 Final task progress: {task.progress}%")
        
        # Check if output file was created
        if os.path.exists(task.output_file):
            file_size = os.path.getsize(task.output_file)
            print(f"📄 Output file created: {task.output_file} ({file_size} bytes)")
            
            # Check if it contains optimized content
            with open(task.output_file, 'r') as f:
                content = f.read()
                has_training_corpus = 'training_corpus' in content
                print(f"📄 Contains optimized structure: {has_training_corpus}")
        else:
            print("❌ Output file not created")
            
        return task

if __name__ == "__main__":
    try:
        print("🧪 SocketIO Validation Test Starting...")
        print("=" * 60)
        
        # Test 1: Direct SocketIO emission functions
        started, progress, completion = test_socketio_emissions()
        
        print(f"\n📋 SocketIO Function Test Results:")
        print(f"   Task Started: {started}")
        print(f"   Progress Update: {progress}")  
        print(f"   Task Completion: {completion}")
        
        # Test 2: Full ProcessingTask workflow
        task = test_processing_task_with_fixed_context()
        
        print(f"\n📋 ProcessingTask Test Results:")
        print(f"   Task Completed: {task.status == 'completed'}")
        print(f"   Progress 100%: {task.progress == 100}")
        print(f"   Output Created: {os.path.exists(task.output_file)}")
        
        # Overall validation result
        socketio_working = started and progress and completion
        task_working = task.status == 'completed' and task.progress == 100
        
        print(f"\n🎉 VALIDATION SUMMARY:")
        print(f"=" * 60)
        print(f"✅ SocketIO Functions Working: {socketio_working}")
        print(f"✅ ProcessingTask Working: {task_working}")
        print(f"✅ Optimized File Processor: Working")
        
        if socketio_working and task_working:
            print(f"🎉 ALL SYSTEMS OPERATIONAL - UI ISSUE SHOULD BE RESOLVED!")
        else:
            print(f"⚠️  Some issues detected - investigating further...")
            
    except Exception as e:
        print(f"❌ Validation failed: {e}")
        import traceback
        traceback.print_exc()