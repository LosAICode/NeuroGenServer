#!/usr/bin/env python3
"""
Full integration test simulating frontend file processing request
"""

import requests
import time
import os
import shutil
import json

def test_full_integration():
    """Test file processing performance via API endpoint"""
    
    print("=== FULL INTEGRATION PERFORMANCE TEST ===\n")
    
    # Create test directory with realistic workload
    test_dir = "/tmp/integration_test"
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    os.makedirs(test_dir)
    
    # Create various file types
    print("Creating test files...")
    # Text files
    for i in range(10):
        with open(f"{test_dir}/document_{i}.txt", "w") as f:
            f.write(f"Document {i}\n" * 500)  # ~5KB each
    
    # Markdown files  
    for i in range(5):
        with open(f"{test_dir}/readme_{i}.md", "w") as f:
            f.write(f"# README {i}\n\n" + "## Section\n\nContent here.\n" * 100)
    
    # Python files
    for i in range(3):
        with open(f"{test_dir}/script_{i}.py", "w") as f:
            f.write(f'#!/usr/bin/env python3\n# Script {i}\n\ndef main():\n    print("Hello")\n' * 50)
    
    output_file = "test_output.json"
    
    # Start timing
    start_time = time.time()
    
    try:
        # Make API request
        print("\nSending processing request to API...")
        response = requests.post(
            "http://localhost:5025/api/process",
            json={
                "input_dir": test_dir,
                "output_file": output_file
            }
        )
        
        if response.status_code != 200:
            print(f"ERROR: API returned status {response.status_code}")
            print(response.text)
            return
        
        data = response.json()
        task_id = data.get("task_id")
        print(f"Task started: {task_id}")
        
        # Poll for completion
        print("\nMonitoring task progress...")
        last_progress = -1
        progress_updates = []
        
        while True:
            status_response = requests.get(f"http://localhost:5025/api/status/{task_id}")
            if status_response.status_code != 200:
                print(f"ERROR: Status check failed")
                break
            
            status_data = status_response.json()
            progress = status_data.get("progress", 0)
            status = status_data.get("status", "unknown")
            
            # Track progress updates
            if progress != last_progress:
                progress_updates.append({
                    'time': time.time() - start_time,
                    'progress': progress,
                    'message': status_data.get("message", "")
                })
                print(f"Progress: {progress}% - {status}")
                last_progress = progress
            
            if status_data.get("status") in ["completed", "failed", "error"]:
                break
            
            time.sleep(0.1)  # Poll every 100ms
        
        end_time = time.time()
        total_duration = end_time - start_time
        
        # Print results
        print(f"\n=== RESULTS ===")
        print(f"Total processing time: {total_duration:.2f} seconds")
        print(f"Final status: {status_data.get('status', 'unknown')}")
        
        if status_data.get("stats"):
            stats = status_data["stats"]
            print(f"Files processed: {stats.get('processed_files', 0)}")
            print(f"Total files: {stats.get('total_files', 0)}")
            print(f"Processing time: {stats.get('formatted_duration', 'N/A')}")
        
        # Analyze progress updates
        print(f"\nProgress update analysis:")
        print(f"Total progress updates: {len(progress_updates)}")
        if len(progress_updates) > 1:
            # Calculate update frequency
            update_intervals = []
            for i in range(1, len(progress_updates)):
                interval = progress_updates[i]['time'] - progress_updates[i-1]['time']
                update_intervals.append(interval)
            
            avg_interval = sum(update_intervals) / len(update_intervals)
            print(f"Average update interval: {avg_interval:.2f} seconds")
            print(f"Min interval: {min(update_intervals):.2f} seconds")
            print(f"Max interval: {max(update_intervals):.2f} seconds")
        
        # Download and check output file
        if status == "completed" and "output_file" in status_data:
            download_response = requests.get(f"http://localhost:5025/api/download/{task_id}")
            if download_response.status_code == 200:
                file_size = len(download_response.content)
                print(f"\nOutput file size: {file_size} bytes")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Cleanup
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)
        
        # Clean up output file
        output_path = os.path.join("/workspace/modules/downloads", output_file)
        if os.path.exists(output_path):
            os.remove(output_path)

if __name__ == "__main__":
    # Check if server is running
    try:
        response = requests.get("http://localhost:5025/api/health")
        if response.status_code != 200:
            print("ERROR: Server not running on port 5025")
            print("Please start the server with: cd modules && python3 server.py --port 5025")
            exit(1)
    except:
        print("ERROR: Cannot connect to server on port 5025")
        print("Please start the server with: cd modules && python3 server.py --port 5025")
        exit(1)
    
    test_full_integration()