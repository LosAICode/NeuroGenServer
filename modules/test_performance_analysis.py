#!/usr/bin/env python3
"""Test script to analyze file processing performance bottleneck"""

import time
import logging
import sys
import os
import json

# Configure logging to show all debug messages
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Suppress some noisy logs
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('socketio').setLevel(logging.WARNING)

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the processing function
from blueprints.features.file_processor import process_all_files

def test_performance():
    """Test file processing performance with timing analysis"""
    
    print("=== FILE PROCESSING PERFORMANCE TEST ===\n")
    
    # Create test directory with sample files
    test_dir = "/tmp/perf_test"
    os.makedirs(test_dir, exist_ok=True)
    
    # Create test files
    print("Creating test files...")
    for i in range(5):
        with open(f"{test_dir}/test_{i}.txt", "w") as f:
            f.write(f"Test file {i}\n" * 100)
    
    # Output file
    output_file = "/tmp/perf_test_output.json"
    
    # Custom progress callback to track timing
    progress_calls = []
    def custom_progress_callback(processed, total, stage):
        call_time = time.time()
        progress_calls.append({
            'time': call_time,
            'processed': processed,
            'total': total,
            'stage': stage
        })
        print(f"Progress: {processed}/{total} ({stage}) at {call_time:.2f}")
    
    print("\nStarting file processing...")
    start_time = time.time()
    
    try:
        # Call process_all_files with minimal options to isolate the issue
        result = process_all_files(
            root_directory=test_dir,
            output_file=output_file,
            max_chunk_size=4096,
            executor_type="none",  # No threading to simplify analysis
            use_cache=False,
            progress_callback=custom_progress_callback,
            timeout=60
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"\n=== RESULTS ===")
        print(f"Total processing time: {duration:.2f} seconds")
        print(f"Files processed: {result['stats'].get('processed_files', 0)}")
        print(f"Status: {result.get('status', 'unknown')}")
        
        # Analyze progress callback frequency
        if len(progress_calls) > 1:
            print(f"\nProgress callback analysis:")
            print(f"Total callbacks: {len(progress_calls)}")
            
            # Calculate time between callbacks
            intervals = []
            for i in range(1, len(progress_calls)):
                interval = progress_calls[i]['time'] - progress_calls[i-1]['time']
                intervals.append(interval)
            
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                print(f"Average interval between callbacks: {avg_interval:.3f} seconds")
                print(f"Min interval: {min(intervals):.3f} seconds")
                print(f"Max interval: {max(intervals):.3f} seconds")
        
        # Check output file size
        if os.path.exists(output_file):
            file_size = os.path.getsize(output_file)
            print(f"\nOutput file size: {file_size} bytes")
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Cleanup
        import shutil
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)
        if os.path.exists(output_file):
            os.remove(output_file)

if __name__ == "__main__":
    test_performance()