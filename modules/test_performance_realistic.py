#!/usr/bin/env python3
"""
Test file processing performance on the actual codebase
"""

import requests
import time
import os

def test_real_codebase_performance():
    """Test file processing on actual project files"""
    
    print("=== REAL CODEBASE PERFORMANCE TEST ===\n")
    
    # Use the static/js directory which has many real JS files
    test_dir = "/workspace/modules/static/js/modules"
    
    # Verify directory exists
    if not os.path.exists(test_dir):
        print(f"ERROR: Test directory {test_dir} does not exist")
        return
    
    # Count files
    file_count = 0
    for root, dirs, files in os.walk(test_dir):
        for file in files:
            if file.endswith(('.js', '.json')):
                file_count += 1
    
    print(f"Found {file_count} JS/JSON files in {test_dir}")
    
    output_file = "real_test_output.json"
    
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
        poll_count = 0
        
        while True:
            poll_count += 1
            status_response = requests.get(f"http://localhost:5025/api/status/{task_id}")
            if status_response.status_code != 200:
                print(f"ERROR: Status check failed")
                break
            
            status_data = status_response.json()
            progress = status_data.get("progress", 0)
            status = status_data.get("status", "unknown")
            
            # Track progress updates
            if progress != last_progress:
                elapsed = time.time() - start_time
                progress_updates.append({
                    'time': elapsed,
                    'progress': progress,
                    'message': status_data.get("message", "")
                })
                print(f"[{elapsed:.1f}s] Progress: {progress}% - {status}")
                last_progress = progress
            
            if status in ["completed", "failed", "error"]:
                break
            
            time.sleep(0.1)  # Poll every 100ms
        
        end_time = time.time()
        total_duration = end_time - start_time
        
        # Print results
        print(f"\n=== RESULTS ===")
        print(f"Total processing time: {total_duration:.2f} seconds")
        print(f"Final status: {status}")
        print(f"Total API polls: {poll_count}")
        
        if status_data.get("stats"):
            stats = status_data["stats"]
            print(f"\nFile Processing Stats:")
            print(f"  Files processed: {stats.get('processed_files', 0)}")
            print(f"  Total files: {stats.get('total_files', 0)}")
            print(f"  Processing duration: {stats.get('formatted_duration', 'N/A')}")
            print(f"  Success rate: {stats.get('success_rate_percent', 0)}%")
            
            # Calculate processing rate
            if stats.get('processed_files', 0) > 0:
                rate = stats['processed_files'] / total_duration
                print(f"  Processing rate: {rate:.1f} files/second")
        
        # Analyze progress updates
        print(f"\nProgress update analysis:")
        print(f"  Total progress updates: {len(progress_updates)}")
        if len(progress_updates) > 1:
            # Show timing of updates
            print("\n  Progress timeline:")
            for update in progress_updates[:10]:  # Show first 10
                print(f"    {update['time']:.2f}s: {update['progress']}%")
            if len(progress_updates) > 10:
                print(f"    ... ({len(progress_updates) - 10} more updates)")
        
        # Performance analysis
        print(f"\nPerformance Analysis:")
        print(f"  Average time per file: {total_duration / file_count:.3f}s")
        print(f"  Files per second: {file_count / total_duration:.1f}")
        
        # Compare to expected performance
        expected_time = file_count * 0.05  # Expect 50ms per file
        if total_duration > expected_time * 3:
            print(f"\n⚠️  WARNING: Processing took {total_duration / expected_time:.1f}x longer than expected!")
            print(f"    Expected: ~{expected_time:.1f}s")
            print(f"    Actual: {total_duration:.1f}s")
        else:
            print(f"\n✅ Performance is within acceptable range")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up output file
        output_path = os.path.join("/workspace/modules/downloads", output_file)
        if os.path.exists(output_path):
            os.remove(output_path)
            print(f"\nCleaned up output file")

if __name__ == "__main__":
    test_real_codebase_performance()