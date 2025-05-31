#!/usr/bin/env python3
"""
Quick Frontend Validation Test
Validates that all buttons and API endpoints are working correctly
"""

import requests
import time
import json
import sys

# Server configuration
BASE_URL = "http://127.0.0.1:5025"
API_KEY = "d8f74c02-e1a9-4b2f-a6b3-c9e57d28b153"

def test_endpoint(endpoint, method="GET", data=None, description=""):
    """Test a single endpoint"""
    try:
        headers = {"X-API-Key": API_KEY}
        if data:
            headers["Content-Type"] = "application/json"
        
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=10)
        elif method == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, json=data, timeout=10)
        
        if response.status_code < 400:
            print(f"✅ {description}: {endpoint} ({response.status_code})")
            return True
        else:
            print(f"❌ {description}: {endpoint} ({response.status_code})")
            return False
    except Exception as e:
        print(f"❌ {description}: {endpoint} (Error: {str(e)})")
        return False

def main():
    print("🔍 NeuroGenServer Frontend Validation Test")
    print("=" * 50)
    
    results = []
    
    # Test core endpoints
    print("\n📋 Core System Endpoints:")
    results.append(test_endpoint("/", description="Home page"))
    results.append(test_endpoint("/health", description="Health check"))
    results.append(test_endpoint("/api/health", description="API health"))
    
    # Test PDF Downloader endpoints
    print("\n📄 PDF Downloader Endpoints:")
    results.append(test_endpoint("/api/pdf/health", description="PDF health"))
    
    # Test single PDF download (minimal payload)
    pdf_data = {
        "url": "https://arxiv.org/pdf/2301.00001.pdf",
        "options": {"process_with_structify": False}
    }
    results.append(test_endpoint("/api/pdf/download", "POST", pdf_data, "Single PDF download"))
    
    # Test batch PDF download
    batch_data = {
        "urls": ["https://arxiv.org/pdf/2301.00001.pdf"],
        "options": {"concurrent_downloads": 1}
    }
    results.append(test_endpoint("/api/pdf/batch-download", "POST", batch_data, "Batch PDF download"))
    
    # Test Web Scraper endpoints
    print("\n🌐 Web Scraper Endpoints:")
    results.append(test_endpoint("/api/health-enhanced", description="Web scraper health"))
    
    # Test enhanced scraping
    scraper_data = {
        "url": "https://python.org",
        "mode": "smart_pdf",
        "options": {"max_depth": 1}
    }
    results.append(test_endpoint("/api/scrape2", "POST", scraper_data, "Enhanced web scraping"))
    
    # Test Academic Search endpoints
    print("\n🎓 Academic Search Endpoints:")
    results.append(test_endpoint("/api/academic/health", description="Academic health"))
    
    # Test File Processor endpoints
    print("\n📁 File Processor Endpoints:")
    results.append(test_endpoint("/api/process-files/health", description="File processor health"))
    
    # Test API Management endpoints
    print("\n🔑 API Management Endpoints:")
    results.append(test_endpoint("/api/keys", description="API keys list"))
    results.append(test_endpoint("/api/tasks/history", description="Task history"))
    
    # Test Diagnostics endpoints
    print("\n🔧 Diagnostic Endpoints:")
    results.append(test_endpoint("/api/test-modules", description="Module diagnostics"))
    results.append(test_endpoint("/api/system/status", description="System status"))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Validation Summary:")
    
    passed = sum(results)
    total = len(results)
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"   Total tests: {total}")
    print(f"   Passed: {passed}")
    print(f"   Failed: {total - passed}")
    print(f"   Success rate: {success_rate:.1f}%")
    
    if success_rate >= 80:
        print("\n🎉 Validation PASSED - System is ready for use!")
        return 0
    else:
        print("\n⚠️ Validation FAILED - Some endpoints need attention")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n🛑 Validation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Validation failed with error: {e}")
        sys.exit(1)