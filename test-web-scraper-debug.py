#!/usr/bin/env python3
"""
Debug test for the Web Scraper functionality
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_task_management():
    """Test task management endpoints"""
    print("Testing Task Management...")
    
    # First, check if there are any tasks
    response = requests.get(f"{BASE_URL}/api/tasks")
    if response.status_code == 200:
        print(f"Active tasks: {response.json()}")
    else:
        print(f"Failed to get tasks: {response.status_code}")

def test_scraper_with_immediate_check():
    """Test web scraper and immediately check status"""
    print("\nTesting Web Scraper with immediate status check...")
    
    # Simple test configuration
    test_config = {
        "urls": [
            {
                "url": "https://example.com",
                "setting": "text",  # Use text instead of metadata
                "enabled": True
            }
        ],
        "download_directory": "/workspace/modules/downloads/test_immediate",
        "outputFilename": "test_immediate_results"
    }
    
    # Make the request
    print(f"Sending request to {BASE_URL}/api/scrape2")
    response = requests.post(
        f"{BASE_URL}/api/scrape2",
        json=test_config,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Response Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if "task_id" in result:
            task_id = result["task_id"]
            
            # Try to get status immediately
            print(f"\nChecking status immediately for task {task_id}...")
            for i in range(10):  # Check 10 times with short delays
                time.sleep(0.5)
                status_response = requests.get(f"{BASE_URL}/api/scrape2/status/{task_id}")
                print(f"Attempt {i+1}: Status code: {status_response.status_code}")
                
                if status_response.status_code == 200:
                    status = status_response.json()
                    print(f"Status: {json.dumps(status, indent=2)}")
                    
                    # If task is completed or failed, break
                    if status.get("status") in ["completed", "failed", "cancelled"]:
                        break
                else:
                    print(f"Error: {status_response.text}")
    else:
        print(f"Error: {response.text}")

def test_direct_web_scraper_module():
    """Test if we can use the web_scraper module directly"""
    print("\nTesting direct web_scraper module import...")
    
    try:
        import sys
        sys.path.insert(0, '/workspace/modules')
        import web_scraper
        print("Successfully imported web_scraper module")
        
        # Try to scrape directly
        scraper = web_scraper.WebScraper()
        print(f"WebScraper object created: {scraper}")
        
    except Exception as e:
        print(f"Failed to import web_scraper: {e}")

def check_server_logs():
    """Check recent server logs"""
    print("\nChecking recent server logs...")
    try:
        with open('/workspace/modules/server.log', 'r') as f:
            lines = f.readlines()
            print("Last 20 lines of server.log:")
            for line in lines[-20:]:
                print(line.strip())
    except Exception as e:
        print(f"Failed to read server logs: {e}")

if __name__ == "__main__":
    test_task_management()
    print("\n" + "="*70 + "\n")
    test_scraper_with_immediate_check()
    print("\n" + "="*70 + "\n")
    test_direct_web_scraper_module()
    print("\n" + "="*70 + "\n")
    check_server_logs()