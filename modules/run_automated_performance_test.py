#!/usr/bin/env python3
"""
Automated performance test that simulates frontend interactions 
and captures both frontend and backend logs for analysis
"""

import requests
import time
import json
import threading
from datetime import datetime

def run_performance_test():
    """Run comprehensive performance test"""
    
    print("=== COMPREHENSIVE PERFORMANCE TEST ===\n")
    
    # Test configuration
    test_configs = [
        {
            "name": "Small JS Files Test",
            "input_dir": "/workspace/modules/static/js/modules/config",
            "expected_files": 3,
            "description": "Small set of configuration files"
        },
        {
            "name": "Medium JS Files Test", 
            "input_dir": "/workspace/modules/static/js/modules",
            "expected_files": 49,
            "description": "Full JS modules directory"
        },
        {
            "name": "Large Mixed Files Test",
            "input_dir": "/workspace/modules/blueprints/features",
            "expected_files": 10,
            "description": "Python blueprint files"
        }
    ]
    
    results = []
    
    for i, config in enumerate(test_configs):
        print(f"\n{'='*60}")
        print(f"TEST {i+1}: {config['name']}")
        print(f"Description: {config['description']}")
        print(f"Directory: {config['input_dir']}")
        print(f"Expected files: {config['expected_files']}")
        print('='*60)
        
        # Run individual test
        result = run_single_test(config)
        results.append({**config, **result})
        
        # Wait between tests
        if i < len(test_configs) - 1:
            print("\nWaiting 2 seconds before next test...")
            time.sleep(2)
    
    # Generate comprehensive analysis
    print("\n" + "="*80)
    print("COMPREHENSIVE ANALYSIS")
    print("="*80)
    
    analyze_all_results(results)
    
    return results

def run_single_test(config):
    """Run a single performance test"""
    
    output_file = f"test_{int(time.time())}.json"
    
    # Track metrics
    start_time = time.time()
    api_response_time = 0
    polling_count = 0
    backend_events = []
    
    try:
        # Make API request
        print("📡 Sending API request...")
        api_start = time.time()
        
        response = requests.post(
            "http://localhost:5025/api/process",
            json={
                "input_dir": config["input_dir"],
                "output_file": output_file
            }
        )
        
        api_response_time = time.time() - api_start
        
        if response.status_code != 200:
            return {
                "status": "error",
                "error": f"API returned {response.status_code}: {response.text}",
                "duration": 0
            }
        
        data = response.json()
        task_id = data.get("task_id")
        print(f"✅ Task started: {task_id}")
        print(f"📊 API response time: {api_response_time:.3f}s")
        
        # Poll for completion with detailed tracking
        print("🔄 Monitoring progress...")
        
        last_progress = -1
        progress_updates = []
        
        while True:
            polling_count += 1
            poll_start = time.time()
            
            status_response = requests.get(f"http://localhost:5025/api/status/{task_id}")
            poll_time = time.time() - poll_start
            
            if status_response.status_code != 200:
                print(f"❌ Status check failed: {status_response.status_code}")
                break
            
            status_data = status_response.json()
            progress = status_data.get("progress", 0)
            status = status_data.get("status", "unknown")
            
            # Track progress changes
            if progress != last_progress:
                elapsed = time.time() - start_time
                progress_updates.append({
                    'elapsed': elapsed,
                    'progress': progress,
                    'message': status_data.get("message", ""),
                    'poll_time': poll_time
                })
                print(f"  [{elapsed:.3f}s] Progress: {progress}% - {status} (poll: {poll_time:.3f}s)")
                last_progress = progress
            
            if status in ["completed", "failed", "error"]:
                break
            
            time.sleep(0.1)  # Poll every 100ms
        
        total_duration = time.time() - start_time
        
        # Analyze results
        print(f"\n📊 Test Results:")
        print(f"  Status: {status}")
        print(f"  Total duration: {total_duration:.3f}s")
        print(f"  API response time: {api_response_time:.3f}s")
        print(f"  Polling requests: {polling_count}")
        print(f"  Progress updates: {len(progress_updates)}")
        
        if status_data.get("stats"):
            stats = status_data["stats"]
            files_processed = stats.get('processed_files', 0)
            processing_rate = files_processed / total_duration if total_duration > 0 else 0
            
            print(f"  Files processed: {files_processed}")
            print(f"  Processing rate: {processing_rate:.1f} files/sec")
            print(f"  Success rate: {stats.get('success_rate_percent', 0)}%")
            
            # Performance analysis
            expected_files = config.get('expected_files', files_processed)
            if files_processed < expected_files * 0.9:
                print(f"  ⚠️ WARNING: Only processed {files_processed}/{expected_files} expected files")
        
        # Analyze progress update frequency
        if len(progress_updates) > 1:
            intervals = []
            for i in range(1, len(progress_updates)):
                interval = progress_updates[i]['elapsed'] - progress_updates[i-1]['elapsed']
                intervals.append(interval)
            
            avg_interval = sum(intervals) / len(intervals)
            min_interval = min(intervals)
            max_interval = max(intervals)
            rapid_updates = len([i for i in intervals if i < 0.1])
            
            print(f"  📈 Progress analysis:")
            print(f"    Average interval: {avg_interval:.3f}s")
            print(f"    Min interval: {min_interval:.3f}s")
            print(f"    Max interval: {max_interval:.3f}s")
            print(f"    Rapid updates (<100ms): {rapid_updates}")
            
            if rapid_updates > 0:
                print(f"    ⚠️ WARNING: {rapid_updates} rapid progress updates detected")
            else:
                print(f"    ✅ Good: No rapid updates detected")
        
        return {
            "status": status,
            "duration": total_duration,
            "api_response_time": api_response_time,
            "polling_count": polling_count,
            "progress_updates": len(progress_updates),
            "progress_intervals": intervals if len(progress_updates) > 1 else [],
            "files_processed": status_data.get("stats", {}).get('processed_files', 0),
            "processing_rate": files_processed / total_duration if total_duration > 0 else 0,
            "stats": status_data.get("stats", {})
        }
        
    except Exception as e:
        print(f"❌ Test error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "duration": time.time() - start_time
        }

def analyze_all_results(results):
    """Analyze all test results for patterns and issues"""
    
    print("\n🔍 CROSS-TEST ANALYSIS:")
    
    # Performance comparison
    durations = [r['duration'] for r in results if r.get('duration', 0) > 0]
    rates = [r['processing_rate'] for r in results if r.get('processing_rate', 0) > 0]
    
    if durations:
        print(f"\n⏱️ Duration Analysis:")
        print(f"  Fastest test: {min(durations):.3f}s")
        print(f"  Slowest test: {max(durations):.3f}s")
        print(f"  Average duration: {sum(durations)/len(durations):.3f}s")
    
    if rates:
        print(f"\n⚡ Processing Rate Analysis:")
        print(f"  Fastest rate: {max(rates):.1f} files/sec")
        print(f"  Slowest rate: {min(rates):.1f} files/sec") 
        print(f"  Average rate: {sum(rates)/len(rates):.1f} files/sec")
    
    # Progress update analysis
    total_rapid_updates = 0
    total_progress_updates = 0
    
    for i, result in enumerate(results):
        if 'progress_intervals' in result and result['progress_intervals']:
            intervals = result['progress_intervals']
            rapid = len([i for i in intervals if i < 0.1])
            total_rapid_updates += rapid
            total_progress_updates += len(intervals)
            
            print(f"\n📈 Test {i+1} Progress Updates:")
            print(f"  Total updates: {len(intervals)}")
            print(f"  Rapid updates: {rapid}")
            print(f"  Update rate: {rapid/len(intervals)*100:.1f}% rapid" if intervals else "N/A")
    
    print(f"\n📊 OVERALL PROGRESS UPDATE ANALYSIS:")
    print(f"  Total progress updates: {total_progress_updates}")
    print(f"  Total rapid updates: {total_rapid_updates}")
    
    if total_progress_updates > 0:
        rapid_percentage = (total_rapid_updates / total_progress_updates) * 100
        print(f"  Rapid update rate: {rapid_percentage:.1f}%")
        
        if rapid_percentage > 10:
            print(f"  ⚠️ WARNING: High rapid update rate indicates throttling may need adjustment")
        elif rapid_percentage > 0:
            print(f"  ⚠️ CAUTION: Some rapid updates detected, monitor for performance impact")
        else:
            print(f"  ✅ EXCELLENT: No rapid updates detected, throttling working well")
    
    # Success rate analysis
    successful_tests = len([r for r in results if r.get('status') == 'completed'])
    print(f"\n✅ SUCCESS RATE: {successful_tests}/{len(results)} tests completed successfully")
    
    if successful_tests < len(results):
        failed_tests = [r for r in results if r.get('status') != 'completed']
        print(f"❌ Failed tests:")
        for i, test in enumerate(failed_tests):
            print(f"  - {test.get('name', f'Test {i+1}')}: {test.get('error', test.get('status'))}")
    
    # Performance threshold analysis
    print(f"\n🎯 PERFORMANCE THRESHOLDS:")
    
    for i, result in enumerate(results):
        test_name = result.get('name', f'Test {i+1}')
        duration = result.get('duration', 0)
        files = result.get('files_processed', 0)
        expected = result.get('expected_files', files)
        
        # Performance expectations (adjust based on file count)
        expected_duration = expected * 0.05  # 50ms per file
        
        if duration > expected_duration * 3:
            print(f"  🐌 {test_name}: SLOW - {duration:.2f}s (expected <{expected_duration:.2f}s)")
        elif duration > expected_duration * 1.5:
            print(f"  ⚠️ {test_name}: MODERATE - {duration:.2f}s (expected <{expected_duration:.2f}s)")  
        else:
            print(f"  ⚡ {test_name}: FAST - {duration:.2f}s (expected <{expected_duration:.2f}s)")

def check_backend_logs():
    """Analyze backend logs for performance issues"""
    
    print("\n📋 BACKEND LOG ANALYSIS:")
    
    try:
        with open("/workspace/modules/server_analysis.log", "r") as f:
            lines = f.readlines()
        
        # Look for performance-related log entries
        performance_indicators = [
            "Processing complete in",
            "files/sec",
            "memory usage",
            "Progress:",
            "rapid emit",
            "throttling"
        ]
        
        relevant_lines = []
        for line in lines:
            if any(indicator in line.lower() for indicator in performance_indicators):
                relevant_lines.append(line.strip())
        
        print(f"  Found {len(relevant_lines)} performance-related log entries")
        
        # Show recent entries
        if relevant_lines:
            print("  Recent performance logs:")
            for line in relevant_lines[-10:]:  # Show last 10
                print(f"    {line}")
        
    except FileNotFoundError:
        print("  ⚠️ Backend log file not found")
    except Exception as e:
        print(f"  ❌ Error reading backend logs: {e}")

if __name__ == "__main__":
    # Check server connectivity
    try:
        response = requests.get("http://localhost:5025/api/health", timeout=5)
        if response.status_code != 200:
            print("❌ Server health check failed")
            exit(1)
    except:
        print("❌ Cannot connect to server. Please start with: python3 server.py --port 5025")
        exit(1)
    
    print("✅ Server connectivity confirmed")
    
    # Run tests
    results = run_performance_test()
    
    # Check backend logs
    check_backend_logs()
    
    print(f"\n{'='*80}")
    print("TEST COMPLETION")
    print("="*80)
    print("✅ Comprehensive performance testing completed")
    print("📊 Check the HTML test page for detailed frontend analysis")
    print("📋 Backend logs have been analyzed above")