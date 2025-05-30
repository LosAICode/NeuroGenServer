#!/usr/bin/env python3
"""
Simple test for the Web Scraper functionality
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_web_scraper_simple():
    """Test the web scraper endpoint with a simple request"""
    print("Testing Web Scraper Module (Simple)...")
    
    # Simple test configuration
    test_config = {
        "urls": [
            {
                "url": "https://example.com",
                "setting": "full",
                "enabled": True
            }
        ],
        "download_directory": "/workspace/modules/downloads/test_scraping_simple",
        "outputFilename": "test_simple_results"
    }
    
    # Make the request
    print(f"\nSending request to {BASE_URL}/api/scrape2")
    print(f"Config: {json.dumps(test_config, indent=2)}")
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/scrape2",
            json=test_config,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nResponse Body: {json.dumps(result, indent=2)}")
            
            # Check if task_id is returned
            if "task_id" in result:
                task_id = result["task_id"]
                print(f"\nTask ID: {task_id}")
                
                # Wait a bit for processing
                print("\nWaiting 5 seconds for processing...")
                time.sleep(5)
                
                # Try different status endpoints
                status_endpoints = [
                    f"/api/scrape2/status/{task_id}",
                    f"/api/task/status/{task_id}",
                    f"/api/scraper/status/{task_id}"
                ]
                
                for endpoint in status_endpoints:
                    print(f"\nTrying status endpoint: {endpoint}")
                    status_response = requests.get(f"{BASE_URL}{endpoint}")
                    print(f"Status: {status_response.status_code}")
                    if status_response.status_code == 200:
                        print(f"Result: {json.dumps(status_response.json(), indent=2)}")
                        break
                    else:
                        print(f"Error: {status_response.text}")
                        
        else:
            print(f"\nError Response: {response.text}")
            
    except Exception as e:
        print(f"\nException occurred: {e}")

def test_available_endpoints():
    """Check what endpoints are available"""
    print("\nChecking available endpoints...")
    
    # Get the root page which might list endpoints
    response = requests.get(f"{BASE_URL}/")
    if response.status_code == 200:
        # Check if there's any endpoint listing in the HTML
        if "api" in response.text.lower():
            print("Found API references in the root page")
    
    # Check common API endpoints
    endpoints = [
        "/api/routes",
        "/api/endpoints", 
        "/api/docs",
        "/swagger",
        "/api/help"
    ]
    
    for endpoint in endpoints:
        response = requests.get(f"{BASE_URL}{endpoint}")
        if response.status_code == 200:
            print(f"\nFound endpoint documentation at {endpoint}")
            try:
                data = response.json()
                print(json.dumps(data, indent=2))
            except:
                print("(HTML response)")

if __name__ == "__main__":
    test_available_endpoints()
    print("\n" + "="*70 + "\n")
    test_web_scraper_simple()