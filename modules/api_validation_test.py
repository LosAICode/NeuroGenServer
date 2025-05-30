#!/usr/bin/env python3
"""
Comprehensive API Validation Test
Tests all critical endpoints after naming unification and module separation
"""

import requests
import json
import time
import threading
import sys
import os
from pathlib import Path

class APIValidationTest:
    def __init__(self, base_url="http://127.0.0.1:5025"):
        self.base_url = base_url
        self.results = {}
        self.server_thread = None
        
    def start_server(self):
        """Start the server in background"""
        def run_server():
            try:
                from app import run_server
                run_server(host='127.0.0.1', port=5025, debug=False)
            except Exception as e:
                print(f"Server error: {e}")
        
        self.server_thread = threading.Thread(target=run_server, daemon=True)
        self.server_thread.start()
        
        # Wait for server to start
        print("🚀 Starting server...")
        for i in range(30):  # Wait up to 30 seconds
            try:
                response = requests.get(f"{self.base_url}/health", timeout=1)
                if response.status_code == 200:
                    print("✅ Server is running")
                    return True
            except:
                time.sleep(1)
        return False
    
    def test_endpoint(self, endpoint, method='GET', data=None, expected_status=200):
        """Test a single endpoint"""
        try:
            url = f"{self.base_url}{endpoint}"
            
            if method == 'GET':
                response = requests.get(url, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, timeout=10)
            else:
                return False, f"Unsupported method: {method}"
            
            success = response.status_code == expected_status
            return success, f"Status: {response.status_code}, Expected: {expected_status}"
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}"
        except Exception as e:
            return False, f"Error: {str(e)}"
    
    def test_core_endpoints(self):
        """Test core system endpoints"""
        print("\n🔧 Testing Core Endpoints...")
        
        tests = [
            ("/", "GET", None, 200, "Home page"),
            ("/health", "GET", None, 200, "Health check"),
            ("/diagnostics", "GET", None, 200, "Diagnostics page"),
            ("/test-modules", "GET", None, 200, "Module test page"),
        ]
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_health_endpoints(self):
        """Test health and diagnostic endpoints"""
        print("\n🏥 Testing Health & Diagnostic Endpoints...")
        
        tests = [
            ("/api/health", "GET", None, 200, "API Health"),
            ("/api/test-modules", "GET", None, 200, "Module tests"),
            ("/api/health-monitor", "GET", None, 200, "Health monitor"),
            ("/api/health-enhanced", "GET", None, 200, "Enhanced health check"),
        ]
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_pdf_downloader_endpoints(self):
        """Test PDF downloader endpoints"""
        print("\n📄 Testing PDF Downloader Endpoints...")
        
        tests = [
            ("/api/pdf/health", "GET", None, 200, "PDF Downloader Health"),
            ("/api/pdf/capabilities", "GET", None, 200, "PDF Capabilities"),
        ]
        
        # Test download endpoint with invalid data (should return 400)
        tests.append(("/api/pdf/download", "POST", {}, 400, "PDF Download (no data)"))
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_web_scraper_endpoints(self):
        """Test web scraper endpoints"""
        print("\n🌐 Testing Web Scraper Endpoints...")
        
        tests = [
            ("/api/health-enhanced", "GET", None, 200, "Enhanced Health Check"),
        ]
        
        # Test scrape endpoint with invalid data (should return 400)
        tests.append(("/api/scrape2", "POST", {}, 400, "Web Scraper (no data)"))
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_academic_search_endpoints(self):
        """Test academic search endpoints"""
        print("\n🎓 Testing Academic Search Endpoints...")
        
        tests = [
            ("/api/academic/health", "GET", None, 200, "Academic Health"),
        ]
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_file_processor_endpoints(self):
        """Test file processor endpoints"""
        print("\n📁 Testing File Processor Endpoints...")
        
        tests = [
            ("/api/get-default-output-folder", "GET", None, 200, "Default Output Folder"),
        ]
        
        # Test process endpoint with invalid data (should return 400)
        tests.append(("/api/process", "POST", {}, 400, "File Process (no data)"))
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def test_api_management_endpoints(self):
        """Test API management endpoints"""
        print("\n🔑 Testing API Management Endpoints...")
        
        tests = [
            ("/api/keys", "GET", None, 200, "List API Keys"),
            ("/api/tasks/history", "GET", None, 200, "Task History"),
            ("/api/tasks/analytics", "GET", None, 200, "Task Analytics"),
        ]
        
        results = []
        for endpoint, method, data, expected, description in tests:
            success, message = self.test_endpoint(endpoint, method, data, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      {message}")
            results.append((endpoint, success, message))
        
        return results
    
    def run_validation(self):
        """Run complete API validation"""
        print("🔍 COMPREHENSIVE API VALIDATION TEST")
        print("=" * 50)
        
        # Start server
        if not self.start_server():
            print("❌ Failed to start server")
            return False
        
        # Run all tests
        all_results = []
        
        all_results.extend(self.test_core_endpoints())
        all_results.extend(self.test_health_endpoints())
        all_results.extend(self.test_pdf_downloader_endpoints())
        all_results.extend(self.test_web_scraper_endpoints())
        all_results.extend(self.test_academic_search_endpoints())
        all_results.extend(self.test_file_processor_endpoints())
        all_results.extend(self.test_api_management_endpoints())
        
        # Summary
        print("\n📊 VALIDATION SUMMARY")
        print("=" * 30)
        
        passed = sum(1 for _, success, _ in all_results if success)
        total = len(all_results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {total - passed}/{total}")
        print(f"📈 Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n❌ Failed Tests:")
            for endpoint, success, message in all_results:
                if not success:
                    print(f"  • {endpoint}: {message}")
        
        print(f"\n🎯 Overall Status: {'✅ PASS' if passed == total else '❌ FAIL'}")
        
        return passed == total

if __name__ == "__main__":
    # Change to modules directory
    modules_dir = Path(__file__).parent
    os.chdir(modules_dir)
    
    # Add to path
    sys.path.insert(0, str(modules_dir))
    
    # Run validation
    validator = APIValidationTest()
    success = validator.run_validation()
    
    sys.exit(0 if success else 1)