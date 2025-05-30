#!/usr/bin/env python3
"""
Test Web Scraper Flow
Tests the complete flow: Download -> Process -> JSON output
"""
import requests
import json
import time
import os

BASE_URL = "http://localhost:5025"

def test_complete_web_scraper_flow():
    """Test the complete web scraper flow with output verification"""
    print("🔍 TESTING COMPLETE WEB SCRAPER FLOW")
    print("=" * 50)
    
    # Step 1: Create a test with a simple URL that should generate content
    test_config = {
        "urls": [
            {
                "url": "https://httpbin.org/html",
                "setting": "full",  # Use full content extraction
                "enabled": True
            }
        ],
        "download_directory": "/workspace/modules/downloads/flow_test",
        "outputFilename": "flow_test_results",
        "pdf_options": {
            "process_pdfs": False,
            "extract_tables": False,
            "use_ocr": False,
            "structure": True,
            "chunk_size": 4096,
            "max_downloads": 1
        }
    }
    
    print("1️⃣ Sending scraper request...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/scrape2",
            json=test_config,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ Request failed: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
        data = response.json()
        task_id = data.get('task_id')
        output_file = data.get('output_file')
        
        print(f"✅ Task created: {task_id}")
        print(f"📁 Expected output: {output_file}")
        
    except Exception as e:
        print(f"❌ Request error: {e}")
        return False
    
    # Step 2: Wait for processing and monitor
    print("\n2️⃣ Waiting for processing...")
    max_wait = 30  # seconds
    wait_interval = 2
    
    for i in range(0, max_wait, wait_interval):
        time.sleep(wait_interval)
        print(f"   ⏳ Waiting... ({i+wait_interval}s)")
        
        # Check if output directory was created
        output_dir = os.path.dirname(output_file)
        if os.path.exists(output_dir):
            print(f"   ✅ Output directory created: {output_dir}")
            break
    else:
        print(f"   ⚠️ Timeout waiting for output directory")
    
    # Step 3: Check what files were created
    print("\n3️⃣ Checking output files...")
    try:
        if os.path.exists(output_dir):
            files = os.listdir(output_dir)
            print(f"   📂 Files in output directory: {len(files)}")
            for file in files:
                file_path = os.path.join(output_dir, file)
                size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                print(f"      • {file} ({size} bytes)")
            
            # Check if the main JSON output exists
            if os.path.exists(output_file):
                size = os.path.getsize(output_file)
                print(f"   ✅ Main JSON output found: {size} bytes")
                
                # Try to read and validate JSON
                try:
                    with open(output_file, 'r') as f:
                        json_data = json.load(f)
                    print(f"   ✅ JSON is valid, contains {len(json_data)} top-level keys")
                    return True
                except json.JSONDecodeError as e:
                    print(f"   ❌ JSON is invalid: {e}")
                    return False
            else:
                print(f"   ❌ Main JSON output not found: {output_file}")
                # Check for alternative output files
                json_files = [f for f in files if f.endswith('.json')]
                if json_files:
                    print(f"   📄 Other JSON files found: {json_files}")
                return False
        else:
            print(f"   ❌ Output directory doesn't exist: {output_dir}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error checking outputs: {e}")
        return False

def test_file_processor_directly():
    """Test the file processor directly"""
    print("\n🔧 TESTING FILE PROCESSOR DIRECTLY")
    print("=" * 40)
    
    # Create a test directory with a simple file
    test_dir = "/workspace/modules/downloads/processor_test"
    os.makedirs(test_dir, exist_ok=True)
    
    # Create a simple test file
    test_file = os.path.join(test_dir, "test.txt")
    with open(test_file, 'w') as f:
        f.write("This is a test file for processing.\nIt contains some sample text.\n")
    
    print(f"✅ Created test file: {test_file}")
    
    # Call the file processor API
    processor_config = {
        "input_dir": test_dir,
        "output_file": "processor_test_output.json"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/process",
            json=processor_config,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            task_id = data.get('task_id')
            output_file = data.get('output_file')
            print(f"✅ File processor task created: {task_id}")
            print(f"📁 Output file: {output_file}")
            
            # Wait and check output
            time.sleep(5)
            if os.path.exists(output_file):
                size = os.path.getsize(output_file)
                print(f"✅ File processor output created: {size} bytes")
                return True
            else:
                print(f"❌ File processor output not found: {output_file}")
                return False
        else:
            print(f"❌ File processor failed: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ File processor error: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Testing Complete Web Scraper Flow")
    print("Testing the full pipeline: Web Scraper -> File Downloads -> JSON Processing")
    print("=" * 80)
    
    flow_success = test_complete_web_scraper_flow()
    processor_success = test_file_processor_directly()
    
    print("\n" + "=" * 80)
    print("📊 FLOW TEST RESULTS:")
    print(f"   Web Scraper Flow: {'✅ PASS' if flow_success else '❌ FAIL'}")
    print(f"   File Processor:   {'✅ PASS' if processor_success else '❌ FAIL'}")
    
    if flow_success and processor_success:
        print("🎉 ALL TESTS PASSED - JSON output generation is working!")
    else:
        print("🔧 ISSUES FOUND - JSON output generation needs debugging")
    print("=" * 80)