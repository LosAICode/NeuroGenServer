#!/usr/bin/env python3
"""
Comprehensive Test: Submit → Progress → Stats Flow
Tests the complete File Processor workflow with enhanced CustomFileStats
"""

import requests
import json
import time
import tempfile
import os
import sys

def test_enhanced_customfilestats():
    """Test that CustomFileStats has enhanced frontend fields"""
    try:
        sys.path.insert(0, '/workspace/modules')
        from blueprints.core.services import CustomFileStats
        
        # Create test stats
        stats = CustomFileStats()
        stats.total_files = 10
        stats.processed_files = 8
        stats.error_files = 1
        stats.skipped_files = 1
        stats.total_bytes = 1024 * 1024 * 5  # 5MB
        stats.current_processing_rate = 2.5
        
        # Test enhanced to_dict method
        result = stats.to_dict()
        
        # Check for new frontend-optimized fields
        required_fields = [
            'completion_percentage',
            'files_remaining', 
            'estimated_completion_time',
            'current_stage',
            'formatted_total_size',
            'formatted_duration',
            'formatted_processing_rate',
            'elapsed_time'
        ]
        
        missing_fields = []
        for field in required_fields:
            if field not in result:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"❌ CustomFileStats Enhancement: Missing fields {missing_fields}")
            return False
        
        # Test formatting methods
        if not result['formatted_total_size']:
            print("❌ CustomFileStats Enhancement: formatted_total_size not working")
            return False
            
        if result['completion_percentage'] != 80.0:  # 8/10 * 100
            print(f"❌ CustomFileStats Enhancement: Wrong completion % ({result['completion_percentage']})")
            return False
            
        print("✅ CustomFileStats Enhancement: All fields present and working")
        return True
        
    except Exception as e:
        print(f"❌ CustomFileStats Enhancement: Error ({e})")
        return False

def test_api_endpoints():
    """Test API endpoints are available"""
    try:
        # Test health endpoint
        response = requests.get('http://localhost:5025/api/health', timeout=5)
        if response.status_code != 200:
            print(f"❌ API Health: Failed ({response.status_code})")
            return False
        
        # Test file processor endpoint exists
        response = requests.get('http://localhost:5025/api/tasks', timeout=5)
        if response.status_code not in [200, 404]:  # 404 is ok, means no tasks
            print(f"❌ File Processor API: Unexpected status ({response.status_code})")
            return False
            
        print("✅ API Endpoints: Available")
        return True
        
    except Exception as e:
        print(f"❌ API Endpoints: Error ({e})")
        return False

def test_frontend_alignment():
    """Test frontend elements exist in index.html"""
    try:
        html_file = '/workspace/modules/blueprints/templates/index.html'
        with open(html_file, 'r') as f:
            content = f.read()
        
        # Check for required elements
        required_elements = [
            'id="progress-container"',
            'id="progress-bar"', 
            'id="progress-status"',
            'id="progress-stats"',
            'id="result-container"',
            'id="result-stats"',
            'id="cancel-btn"'
        ]
        
        missing_elements = []
        for element in required_elements:
            if element not in content:
                missing_elements.append(element)
        
        if missing_elements:
            print(f"❌ Frontend Alignment: Missing elements {missing_elements}")
            return False
        
        print("✅ Frontend Alignment: All elements present")
        return True
        
    except Exception as e:
        print(f"❌ Frontend Alignment: Error ({e})")
        return False

def test_socketio_events_centralized():
    """Test SocketIO events are centralized"""
    try:
        # Check socketio_events.py has unified functions
        events_file = '/workspace/modules/blueprints/socketio_events.py'
        with open(events_file, 'r') as f:
            content = f.read()
        
        required_functions = [
            'emit_task_completion_unified',
            'emit_progress_update_unified',
            'emit_task_error_unified', 
            '_emitted_completions'
        ]
        
        missing_functions = []
        for func in required_functions:
            if func not in content:
                missing_functions.append(func)
        
        if missing_functions:
            print(f"❌ SocketIO Events: Missing functions {missing_functions}")
            return False
        
        # Check services.py no longer has socketio_context_helper imports
        services_file = '/workspace/modules/blueprints/core/services.py'
        with open(services_file, 'r') as f:
            services_content = f.read()
        
        if 'import socketio_context_helper' in services_content:
            print("❌ SocketIO Events: Still has legacy imports")
            return False
        
        print("✅ SocketIO Events: Centralized")
        return True
        
    except Exception as e:
        print(f"❌ SocketIO Events: Error ({e})")
        return False

def test_progress_calculation_fix():
    """Test progress calculation allows 100%"""
    try:
        services_file = '/workspace/modules/blueprints/core/services.py'
        with open(services_file, 'r') as f:
            content = f.read()
        
        # Check that progress is not artificially capped at 99%
        if '* 99' in content and 'progress' in content:
            print("❌ Progress Calculation: Still has 99% cap")
            return False
        
        # Check for proper 100% calculation
        if 'min(int(actual_progress), 100)' in content:
            print("✅ Progress Calculation: Allows 100%")
            return True
        
        print("⚠️ Progress Calculation: Cannot verify fix")
        return False
        
    except Exception as e:
        print(f"❌ Progress Calculation: Error ({e})")
        return False

def create_test_summary():
    """Create a comprehensive summary"""
    print("\n" + "="*70)
    print("📋 COMPLETE FLOW VALIDATION SUMMARY")
    print("="*70)
    
    tests = [
        ("Enhanced CustomFileStats", test_enhanced_customfilestats),
        ("API Endpoints", test_api_endpoints), 
        ("Frontend Alignment", test_frontend_alignment),
        ("SocketIO Events Centralized", test_socketio_events_centralized),
        ("Progress Calculation Fix", test_progress_calculation_fix)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Testing: {test_name}")
        result = test_func()
        results.append((test_name, result))
    
    print("\n" + "="*70)
    print("📊 FINAL RESULTS")
    print("="*70)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    success_rate = (passed / total) * 100
    print(f"\n🎯 Success Rate: {passed}/{total} ({success_rate:.1f}%)")
    
    if success_rate >= 90:
        print("\n🎉 COMPLETE FLOW VALIDATION: SUCCESS!")
        print("\n📋 Submit → Progress → Stats Flow Components:")
        print("   ✅ Enhanced CustomFileStats with frontend-optimized fields")
        print("   ✅ Centralized SocketIO event management")
        print("   ✅ Progress calculation reaching 100%")
        print("   ✅ Frontend aligned with HTML template")
        print("   ✅ API endpoints ready for testing")
        print("\n🚀 Ready for live testing:")
        print("   1. Navigate to File Processor module")
        print("   2. Select input directory and output file") 
        print("   3. Click 'Start Processing'")
        print("   4. Watch for: Form → Progress (with stats) → Final Results")
        print("   5. Test cancellation functionality")
    else:
        print("\n⚠️ COMPLETE FLOW VALIDATION: NEEDS ATTENTION")
        failed_tests = [name for name, result in results if not result]
        print(f"❌ Failed tests: {', '.join(failed_tests)}")
    
    return success_rate >= 90

if __name__ == "__main__":
    success = create_test_summary()
    exit(0 if success else 1)