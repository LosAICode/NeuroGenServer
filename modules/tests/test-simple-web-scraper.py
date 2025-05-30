#!/usr/bin/env python3
"""
Simple test for web scraper functionality
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_web_scraper_simple():
    """Test the web scraper with a simple request"""
    print("Testing Web Scraper Module - Simple Test...")
    
    # Simple test configuration
    test_config = {
        "urls": [
            {
                "url": "https://httpbin.org/html",
                "setting": "title",
                "enabled": True
            }
        ],
        "download_directory": "/workspace/modules/downloads/simple_test",
        "outputFilename": "simple_test_results",
        "pdf_options": {
            "process_pdfs": False,
            "extract_tables": False,
            "use_ocr": False,
            "max_downloads": 1
        }
    }
    
    try:
        # Test health first
        print("\n1. Testing API health...")
        health_response = requests.get(f"{BASE_URL}/api/health")
        print(f"Health Status: {health_response.status_code}")
        
        # Test web scraper endpoint
        print("\n2. Testing web scraper endpoint...")
        response = requests.post(
            f"{BASE_URL}/api/scrape2",
            json=test_config,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Response Status: {response.status_code}")
        print(f"Response Text: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Success! Task ID: {result.get('task_id')}")
            
            # Check task status briefly
            if "task_id" in result:
                task_id = result["task_id"]
                time.sleep(2)
                
                status_response = requests.get(f"{BASE_URL}/api/scrape2/status/{task_id}")
                print(f"Status Check: {status_response.status_code}")
                if status_response.status_code == 200:
                    print(f"Task Status: {json.dumps(status_response.json(), indent=2)}")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception occurred: {e}")

if __name__ == "__main__":
    test_web_scraper_simple()