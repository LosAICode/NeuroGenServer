#!/usr/bin/env python3
"""
Quick API Test - Validate specific fixes
"""

import requests
import time
import sys
import os
import threading

class QuickAPITest:
    def __init__(self, base_url="http://127.0.0.1:5025"):
        self.base_url = base_url
        self.api_key = "d8f74c02-e1a9-4b2f-a6b3-c9e57d28b153"  # Default key
        
    def start_server(self):
        """Start server in background"""
        def run():
            from app import run_server
            run_server(host='127.0.0.1', port=5025, debug=False)
        
        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        
        # Wait for startup
        for i in range(20):
            try:
                response = requests.get(f"{self.base_url}/health", timeout=1)
                if response.status_code == 200:
                    print("✅ Server started")
                    return True
            except:
                time.sleep(1)
        return False
    
    def test_endpoint(self, endpoint, method='GET', headers=None, expected=200):
        """Test single endpoint"""
        try:
            url = f"{self.base_url}{endpoint}"
            
            # Add API key header if needed
            if headers is None:
                headers = {}
            if '/api/' in endpoint and endpoint not in ['/api/health', '/api/health-enhanced']:
                headers['X-API-Key'] = self.api_key
            
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=5)
            else:
                response = requests.post(url, headers=headers, json={}, timeout=5)
            
            return response.status_code == expected, response.status_code
        except Exception as e:
            return False, str(e)
    
    def run_tests(self):
        """Run focused tests"""
        print("🔍 Quick API Validation")
        print("=" * 30)
        
        if not self.start_server():
            print("❌ Server failed to start")
            return False
        
        tests = [
            # Core health checks
            ("/health", "GET", None, 200, "Health check"),
            ("/api/health", "GET", None, 200, "API health"),
            
            # Fixed issues
            ("/api/pdf/health", "GET", None, 200, "PDF Downloader health"),
            ("/api/pdf-process/capabilities", "GET", None, 200, "PDF Processor capabilities"),
            ("/api/keys", "GET", None, 200, "API keys list"),
            ("/api/get-default-output-folder", "GET", None, 200, "Default output folder"),
            
            # Should return 400 for missing data
            ("/api/pdf/download", "POST", None, 400, "PDF download (no data)"),
            ("/api/scrape2", "POST", None, 400, "Web scraper (no data)"),
        ]
        
        passed = 0
        total = len(tests)
        
        for endpoint, method, headers, expected, description in tests:
            success, result = self.test_endpoint(endpoint, method, headers, expected)
            status = "✅" if success else "❌"
            print(f"  {status} {description}: {endpoint}")
            if not success:
                print(f"      Got: {result}, Expected: {expected}")
            else:
                passed += 1
        
        print(f"\n📊 Results: {passed}/{total} passed ({(passed/total)*100:.1f}%)")
        return passed == total

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.getcwd())
    
    tester = QuickAPITest()
    success = tester.run_tests()
    sys.exit(0 if success else 1)