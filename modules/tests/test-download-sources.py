#!/usr/bin/env python3
"""
Test Download Sources
Tests what sources are available for downloads and which ones work
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_download_sources():
    """Test different download sources and capabilities"""
    print("🔍 TESTING DOWNLOAD SOURCES")
    print("=" * 50)
    
    # Test 1: Check available endpoints
    print("\n1️⃣ Available Endpoints:")
    health_response = requests.get(f"{BASE_URL}/api/health")
    if health_response.status_code == 200:
        health_data = health_response.json()
        endpoints = health_data.get('checks', {}).get('endpoints', {}).get('endpoints', {})
        for endpoint, status in endpoints.items():
            status_icon = "✅" if status else "❌"
            print(f"   {endpoint}: {status_icon}")
    
    # Test 2: Web Scraper (general web pages)
    print("\n2️⃣ Web Scraper Test:")
    test_configs = [
        {
            "name": "Simple HTML",
            "config": {
                "urls": [{"url": "https://httpbin.org/html", "setting": "title", "enabled": True}],
                "download_directory": "/workspace/modules/downloads/test_html",
                "outputFilename": "html_test"
            }
        },
        {
            "name": "Example.com", 
            "config": {
                "urls": [{"url": "https://example.com", "setting": "full", "enabled": True}],
                "download_directory": "/workspace/modules/downloads/test_example",
                "outputFilename": "example_test"
            }
        }
    ]
    
    for test in test_configs:
        print(f"   Testing {test['name']}...")
        try:
            response = requests.post(f"{BASE_URL}/api/scrape2", json=test['config'], timeout=10)
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ {test['name']}: Task {data.get('task_id', 'N/A')}")
                time.sleep(2)  # Wait for processing
            else:
                print(f"   ❌ {test['name']}: HTTP {response.status_code}")
        except Exception as e:
            print(f"   ❌ {test['name']}: {e}")
    
    # Test 3: Academic Search
    print("\n3️⃣ Academic Search Test:")
    try:
        # Try different academic endpoints
        academic_endpoints = [
            "/api/academic-search",
            "/api/academic/search", 
            "/api/academic/health"
        ]
        
        for endpoint in academic_endpoints:
            try:
                response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
                status = "✅" if response.status_code == 200 else "❌"
                print(f"   {endpoint}: {status} {response.status_code}")
            except Exception as e:
                print(f"   {endpoint}: ❌ {e}")
                
    except Exception as e:
        print(f"   Academic search error: {e}")
    
    # Test 4: PDF Processing
    print("\n4️⃣ PDF Processing Test:")
    try:
        response = requests.options(f"{BASE_URL}/api/download-pdf", timeout=5)
        if response.status_code == 200:
            print("   ✅ PDF endpoint available")
        else:
            print(f"   ❌ PDF endpoint: HTTP {response.status_code}")
    except Exception as e:
        print(f"   ❌ PDF processing: {e}")
    
    # Test 5: Playlist Downloads
    print("\n5️⃣ Playlist Downloads Test:")
    try:
        response = requests.options(f"{BASE_URL}/api/playlist", timeout=5)
        if response.status_code == 200:
            print("   ✅ Playlist endpoint available")
        else:
            print(f"   ❌ Playlist endpoint: HTTP {response.status_code}")
    except Exception as e:
        print(f"   ❌ Playlist downloads: {e}")
    
    # Test 6: Check module status
    print("\n6️⃣ Module Status:")
    try:
        response = requests.get(f"{BASE_URL}/api/test-modules", timeout=10)
        if response.status_code == 200:
            data = response.json()
            backend = data.get('backend', {}).get('summary', {})
            frontend = data.get('frontend', {}).get('summary', {})
            print(f"   Backend: {backend.get('loaded', 0)}/{backend.get('total', 0)} modules")
            print(f"   Frontend: {frontend.get('loaded', 0)}/{frontend.get('total', 0)} modules") 
            print(f"   Overall Health: {data.get('system_health', 'unknown')}")
        else:
            print(f"   ❌ Module diagnostics: HTTP {response.status_code}")
    except Exception as e:
        print(f"   ❌ Module status: {e}")

if __name__ == "__main__":
    print("🚀 Testing Download Sources and Capabilities")
    print("Server should be running on http://localhost:5025")
    print("=" * 60)
    
    test_download_sources()
    
    print("\n" + "=" * 60)
    print("🎯 SUMMARY:")
    print("- Web Scraper: Handles general web page downloads")
    print("- Academic Search: For research papers (if functional)")
    print("- PDF Processing: For PDF files specifically")
    print("- Playlist Downloads: For YouTube/media content")
    print("=" * 60)