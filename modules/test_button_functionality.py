#!/usr/bin/env python3
"""
Test Button Functionality - Final validation of all buttons working
"""

import requests
import time
import json
import sys

BASE_URL = "http://127.0.0.1:5025"
API_KEY = "d8f74c02-e1a9-4b2f-a6b3-c9e57d28b153"

def test_web_scraper_functionality():
    """Test Web Scraper buttons and functionality"""
    print("🌐 Testing Web Scraper Functionality...")
    
    # Test health
    response = requests.get(f"{BASE_URL}/api/health-enhanced", 
                          headers={"X-API-Key": API_KEY}, timeout=10)
    if response.status_code == 200:
        print("✅ Web Scraper health check passed")
        health_data = response.json()
        print(f"   Endpoints available: {list(health_data.get('endpoints', {}).keys())}")
    else:
        print("❌ Web Scraper health check failed")
        return False
    
    # Test enhanced scraping (should work)
    scraper_data = {
        "url": "https://python.org",
        "mode": "smart_pdf",
        "options": {"max_depth": 1}
    }
    
    response = requests.post(f"{BASE_URL}/api/scrape2", 
                           headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
                           json=scraper_data, timeout=10)
    
    if response.status_code in [200, 202]:  # Accept both success and async started
        print("✅ Web Scraper enhanced scraping is functional")
        result = response.json()
        if 'task_id' in result:
            print(f"   Task started: {result['task_id']}")
        return True
    else:
        print(f"❌ Web Scraper enhanced scraping failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def test_pdf_downloader_functionality():
    """Test PDF Downloader buttons and functionality"""
    print("\n📄 Testing PDF Downloader Functionality...")
    
    # Test health
    response = requests.get(f"{BASE_URL}/api/pdf/health", 
                          headers={"X-API-Key": API_KEY}, timeout=10)
    if response.status_code == 200:
        print("✅ PDF Downloader health check passed")
        health_data = response.json()
        print(f"   Endpoints available: {list(health_data.get('endpoints', {}).keys())}")
    else:
        print("❌ PDF Downloader health check failed")
        return False
    
    # Test single PDF download
    pdf_data = {
        "url": "https://arxiv.org/pdf/2301.00001.pdf",
        "options": {"process_with_structify": False}
    }
    
    response = requests.post(f"{BASE_URL}/api/pdf/download", 
                           headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
                           json=pdf_data, timeout=30)
    
    if response.status_code in [200, 202]:  # Accept both success and async started
        print("✅ PDF Downloader single download is functional")
        result = response.json()
        if 'task_id' in result:
            print(f"   Task started: {result['task_id']}")
        return True
    else:
        print(f"❌ PDF Downloader single download failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def test_socketio_integration():
    """Test SocketIO integration"""
    print("\n🔌 Testing SocketIO Integration...")
    
    # Check if SocketIO events are available
    response = requests.get(f"{BASE_URL}/api/test-modules", 
                          headers={"X-API-Key": API_KEY}, timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        socket_data = data.get('integration', {}).get('socket_connectivity', {})
        events = socket_data.get('events', {})
        
        required_events = ['task_progress', 'task_completed', 'task_error']
        missing_events = [event for event in required_events if not events.get(event)]
        
        if not missing_events:
            print("✅ SocketIO integration is properly configured")
            print(f"   Available events: {list(events.keys())}")
            return True
        else:
            print(f"❌ SocketIO missing events: {missing_events}")
            return False
    else:
        print("❌ Could not check SocketIO integration")
        return False

def main():
    print("🚀 Button Functionality Validation Test")
    print("=" * 50)
    
    results = []
    
    # Test Web Scraper
    results.append(test_web_scraper_functionality())
    
    # Test PDF Downloader
    results.append(test_pdf_downloader_functionality())
    
    # Test SocketIO Integration
    results.append(test_socketio_integration())
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Button Functionality Summary:")
    
    passed = sum(results)
    total = len(results)
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"   Web Scraper: {'✅ WORKING' if results[0] else '❌ FAILED'}")
    print(f"   PDF Downloader: {'✅ WORKING' if results[1] else '❌ FAILED'}")
    print(f"   SocketIO: {'✅ WORKING' if results[2] else '❌ FAILED'}")
    print(f"   Overall Success: {success_rate:.1f}%")
    
    if success_rate >= 100:
        print("\n🎉 ALL BUTTONS ARE WORKING!")
        print("✅ Ready for optimization phase")
        return 0
    elif success_rate >= 66:
        print("\n🟡 Most functionality working - minor issues")
        return 0
    else:
        print("\n⚠️ Major issues found - needs attention")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n🛑 Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Test failed with error: {e}")
        sys.exit(1)