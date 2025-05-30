#!/usr/bin/env python3
"""
Test the Web Scraper functionality
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_web_scraper():
    """Test the web scraper endpoint"""
    print("Testing Web Scraper Module...")
    
    # Test configuration
    test_config = {
        "urls": [
            {
                "url": "https://example.com",
                "setting": "metadata",
                "enabled": True
            }
        ],
        "download_directory": "/workspace/modules/downloads/test_scraping",
        "outputFilename": "test_scrape_results",
        "pdf_options": {
            "process_pdfs": True,
            "extract_tables": True,
            "use_ocr": False,
            "extract_structure": True,
            "max_downloads": 5
        }
    }
    
    # Make the request
    print(f"\nSending request to {BASE_URL}/api/scrape2")
    response = requests.post(
        f"{BASE_URL}/api/scrape2",
        json=test_config,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Response Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        # Check task status
        if "task_id" in result:
            task_id = result["task_id"]
            print(f"\nTask ID: {task_id}")
            print("Checking task status...")
            
            # Wait a moment then check status
            time.sleep(2)
            status_response = requests.get(f"{BASE_URL}/api/scrape2/status/{task_id}")
            
            if status_response.status_code == 200:
                status = status_response.json()
                print(f"Task Status: {json.dumps(status, indent=2)}")
            else:
                print(f"Failed to get status: {status_response.status_code}")
                print(status_response.text)
    else:
        print(f"Error: {response.text}")

def test_endpoints():
    """Test all web scraper related endpoints"""
    endpoints = [
        ("/api/health", "GET"),
        ("/api/test-modules", "GET"),
        ("/api/scrape2", "OPTIONS"),
        ("/api/download-pdf", "OPTIONS"),
    ]
    
    print("\nTesting Web Scraper Endpoints:")
    print("-" * 50)
    
    for endpoint, method in endpoints:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}")
        else:
            response = requests.options(f"{BASE_URL}{endpoint}")
        
        print(f"{method} {endpoint}: {response.status_code}")

if __name__ == "__main__":
    test_endpoints()
    print("\n" + "="*50 + "\n")
    test_web_scraper()