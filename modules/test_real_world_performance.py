#!/usr/bin/env python3
"""Test script to simulate real-world file processing with SocketIO"""

import time
import logging
import sys
import os
import json
import threading

# Configure logging to show timing
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03d - %(name)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)

# Suppress some noisy logs
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the actual task class
from blueprints.core.services import ProcessingTask

class MockSocketIOContext:
    """Mock context for testing without actual SocketIO"""
    def __init__(self):
        self.emitted_events = []
        self.last_emit_time = 0
        
    def emit(self, event, data, **kwargs):
        current_time = time.time()
        if self.last_emit_time > 0:
            interval = current_time - self.last_emit_time
            if interval < 0.01:  # Less than 10ms between emits
                print(f"WARNING: Rapid emit detected - {interval*1000:.1f}ms since last emit")
        
        self.last_emit_time = current_time
        self.emitted_events.append({
            'time': current_time,
            'event': event,
            'data': data
        })

def test_processing_task_performance():
    """Test ProcessingTask performance with timing analysis"""
    
    print("=== PROCESSING TASK PERFORMANCE TEST ===\n")
    
    # Create test directory with more files
    test_dir = "/tmp/perf_test_large"
    os.makedirs(test_dir, exist_ok=True)
    
    # Create more test files to simulate real scenario
    print("Creating 20 test files...")
    for i in range(20):
        with open(f"{test_dir}/test_{i}.txt", "w") as f:
            # Create files with varying sizes
            content = f"Test file {i}\n" * (100 + i * 10)
            f.write(content)
    
    # Output file
    output_file = "/tmp/perf_test_task_output.json"
    
    # Mock SocketIO context
    mock_socketio = MockSocketIOContext()
    
    # Monkey patch emit functions
    import blueprints.socketio_events as socketio_events
    original_safe_emit = socketio_events.safe_emit
    
    def mock_safe_emit(event, data, **kwargs):
        mock_socketio.emit(event, data, **kwargs)
        return True
    
    socketio_events.safe_emit = mock_safe_emit
    
    print("\nStarting ProcessingTask...")
    start_time = time.time()
    
    try:
        # Create and run the task
        task = ProcessingTask("test-task-001", test_dir, output_file)
        
        # Monitor task in separate thread
        def monitor_task():
            while task.status == "processing":
                print(f"Task progress: {task.progress}% - {task.message}")
                time.sleep(0.5)
        
        monitor_thread = threading.Thread(target=monitor_task)
        monitor_thread.start()
        
        # Start the task (it runs in a thread)
        task.start()
        
        # Wait for task to complete
        while task.status == "processing":
            time.sleep(0.1)
        
        # Wait for monitoring to finish
        monitor_thread.join(timeout=1)
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"\n=== RESULTS ===")
        print(f"Total processing time: {duration:.2f} seconds")
        print(f"Task status: {task.status}")
        
        if hasattr(task, 'stats') and hasattr(task.stats, 'to_dict'):
            stats = task.stats.to_dict()
            print(f"Files processed: {stats.get('processed_files', 0)}")
            print(f"Total files: {stats.get('total_files', 0)}")
        
        # Analyze SocketIO emissions
        print(f"\nSocketIO emission analysis:")
        print(f"Total emissions: {len(mock_socketio.emitted_events)}")
        
        # Group emissions by event type
        event_counts = {}
        for event in mock_socketio.emitted_events:
            event_type = event['event']
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        print("\nEmissions by type:")
        for event_type, count in event_counts.items():
            print(f"  {event_type}: {count}")
        
        # Find rapid emissions
        rapid_emissions = 0
        for i in range(1, len(mock_socketio.emitted_events)):
            interval = mock_socketio.emitted_events[i]['time'] - mock_socketio.emitted_events[i-1]['time']
            if interval < 0.01:  # Less than 10ms
                rapid_emissions += 1
        
        if rapid_emissions > 0:
            print(f"\nWARNING: Found {rapid_emissions} rapid emissions (< 10ms apart)")
            print("This could be causing performance issues!")
        
        # Calculate average emission rate
        if len(mock_socketio.emitted_events) > 1:
            total_emit_time = mock_socketio.emitted_events[-1]['time'] - mock_socketio.emitted_events[0]['time']
            avg_rate = len(mock_socketio.emitted_events) / total_emit_time
            print(f"\nAverage emission rate: {avg_rate:.1f} events/second")
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Restore original function
        socketio_events.safe_emit = original_safe_emit
        
        # Cleanup
        import shutil
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)
        if os.path.exists(output_file):
            os.remove(output_file)

if __name__ == "__main__":
    test_processing_task_performance()