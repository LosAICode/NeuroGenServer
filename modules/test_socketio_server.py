#!/usr/bin/env python3
"""
Comprehensive SocketIO Validation Test Server
Tests all SocketIO events and UI communication in live environment
"""

import os
import sys
import time
import threading
import requests
import json
from flask import Flask
from flask_socketio import SocketIO, emit
import socketio

# Add modules path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

def test_socketio_server():
    """Test the Flask server with SocketIO in live environment"""
    print("🧪 Starting Comprehensive SocketIO Validation...")
    
    # Import the app factory
    from app import create_app
    
    # Create app and socketio instances
    app, socketio_instance = create_app()
    
    print("✅ Flask app created successfully")
    print("✅ SocketIO instance initialized")
    
    # Test SocketIO context setup
    from blueprints.socketio_events import _app_instance, _socketio_instance
    print(f"📡 App instance set: {_app_instance is not None}")
    print(f"📡 SocketIO instance set: {_socketio_instance is not None}")
    
    # Create a test client for SocketIO
    test_client = socketio_instance.test_client(app)
    print("✅ SocketIO test client created")
    
    # Test basic SocketIO connection
    received_events = []
    
    @test_client.event
    def connect():
        print("🔗 SocketIO client connected successfully")
    
    @test_client.event 
    def disconnect():
        print("🔌 SocketIO client disconnected")
    
    @test_client.event
    def task_started(data):
        print(f"📨 Received task_started: {data}")
        received_events.append(('task_started', data))
    
    @test_client.event
    def progress_update(data):
        print(f"📊 Received progress_update: {data}")
        received_events.append(('progress_update', data))
    
    @test_client.event
    def task_completed(data):
        print(f"✅ Received task_completed: {data}")
        received_events.append(('task_completed', data))
    
    @test_client.event
    def task_error(data):
        print(f"❌ Received task_error: {data}")
        received_events.append(('task_error', data))
    
    # Connect the test client
    test_client.connect()
    
    return app, socketio_instance, test_client, received_events

def test_processing_task_events():
    """Test ProcessingTask SocketIO events in live environment"""
    print("\n🎯 Testing ProcessingTask SocketIO Events...")
    
    app, socketio_instance, client, events = test_socketio_server()
    
    # Start the socketio server in background
    def run_server():
        socketio_instance.run(app, host='127.0.0.1', port=5999, debug=False)
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    # Wait for server to start
    time.sleep(2)
    
    print("🚀 Server started on port 5999")
    
    # Test ProcessingTask with live SocketIO
    with app.app_context():
        from blueprints.core.services import ProcessingTask
        
        print("📋 Creating ProcessingTask...")
        task = ProcessingTask(
            task_id='live_socketio_test',
            input_dir='/workspace/modules/test_input',
            output_file='/workspace/modules/test_output/live_socketio_test.json'
        )
        
        print("🚀 Starting ProcessingTask...")
        result = task.start()
        print(f"Task started: {result}")
        
        # Wait for task completion
        timeout = 10
        start_time = time.time()
        while task.status != 'completed' and time.time() - start_time < timeout:
            time.sleep(0.5)
        
        print(f"📊 Final task status: {task.status}")
        print(f"📊 Final task progress: {task.progress}")
        
        # Check received events
        print(f"\n📨 Total events received: {len(events)}")
        for i, (event_type, data) in enumerate(events):
            print(f"  {i+1}. {event_type}: {data.get('task_id', 'N/A')} - {data.get('message', 'N/A')}")
        
        return task, events

if __name__ == "__main__":
    try:
        task, events = test_processing_task_events()
        
        print("\n🔍 SocketIO Validation Results:")
        print("=" * 50)
        
        # Analyze events
        event_types = [event[0] for event in events]
        
        has_started = 'task_started' in event_types
        has_progress = 'progress_update' in event_types  
        has_completed = 'task_completed' in event_types
        
        print(f"✅ Task Started Events: {has_started}")
        print(f"✅ Progress Update Events: {has_progress}")
        print(f"✅ Task Completed Events: {has_completed}")
        
        if has_started and has_progress and has_completed:
            print("🎉 ALL SOCKETIO EVENTS WORKING CORRECTLY!")
        else:
            print("⚠️  Some SocketIO events missing - investigating...")
            
        print(f"\n📈 Task Final Status: {task.status}")
        print(f"📈 Task Final Progress: {task.progress}%")
        
    except Exception as e:
        print(f"❌ SocketIO validation failed: {e}")
        import traceback
        traceback.print_exc()