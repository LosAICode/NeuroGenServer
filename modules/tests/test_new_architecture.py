#!/usr/bin/env python3
"""
Test Script for New Blueprint Architecture
Verifies that all endpoints work correctly
"""

import sys
import time
import requests
import threading
from pathlib import Path

# Add current directory to path
current_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(current_dir))

class ArchitectureTest:
    def __init__(self, base_url="http://127.0.0.1:5025"):
        self.base_url = base_url
        self.server_process = None
        self.results = {}
    
    def start_server(self):
        """Start the new server in a separate thread"""
        try:
            print("🚀 Starting server for testing...")
            from app import create_app
            
            def run_server():
                app, socketio = create_app()
                socketio.run(app, host='127.0.0.1', port=5025, debug=False)
            
            server_thread = threading.Thread(target=run_server, daemon=True)
            server_thread.start()
            
            # Wait for server to start
            time.sleep(3)
            print("✅ Server started")
            return True
            
        except Exception as e:
            print(f"❌ Failed to start server: {e}")
            return False
    
    def test_endpoint(self, method, path, data=None, expected_status=200):
        """Test a specific endpoint"""
        try:
            url = f"{self.base_url}{path}"
            
            if method.upper() == 'GET':
                response = requests.get(url, timeout=10)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, timeout=10)
            else:
                return False, f"Unsupported method: {method}"
            
            success = response.status_code == expected_status
            return success, {
                'status_code': response.status_code,
                'response_size': len(response.content),
                'content_type': response.headers.get('content-type', '')
            }
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}"
        except Exception as e:
            return False, f"Unexpected error: {str(e)}"
    
    def run_tests(self):
        """Run all endpoint tests"""
        print("🧪 Starting endpoint tests...")
        print("=" * 50)
        
        tests = [
            # Core routes
            ('GET', '/', 200, 'Home page'),
            ('GET', '/diagnostics', 200, 'Diagnostics page'),
            ('GET', '/test-modules', 200, 'Test modules page'),
            ('GET', '/health', 200, 'Health check'),
            
            # File processor
            ('POST', '/api/process', 400, 'File processing (no data)'),
            ('POST', '/api/detect-path', 400, 'Path detection (no data)'),
            
            # Web scraper
            ('POST', '/api/scrape2', 400, 'Web scraping (no data)'),
            
            # Academic search
            ('GET', '/api/academic/search', 400, 'Academic search (no query)'),
            ('GET', '/api/academic/health', 200, 'Academic health check'),
            
            # API management
            ('GET', '/api/tasks/history', 200, 'Task history'),
            ('GET', '/api/tasks/analytics', 200, 'Task analytics'),
            ('POST', '/api/emergency-stop', 200, 'Emergency stop'),
        ]
        
        passed = 0
        failed = 0
        
        for method, path, expected_status, description in tests:
            success, result = self.test_endpoint(method, path, expected_status=expected_status)
            
            if success:
                print(f"✅ {description}")
                passed += 1
            else:
                print(f"❌ {description} - {result}")
                failed += 1
            
            self.results[f"{method} {path}"] = {
                'success': success,
                'result': result,
                'description': description
            }
        
        print("=" * 50)
        print(f"📊 Test Results: {passed} passed, {failed} failed")
        
        return failed == 0
    
    def test_with_data(self):
        """Test endpoints with actual data"""
        print("\n🧪 Testing endpoints with data...")
        
        # Test file processing with data
        file_data = {
            "input_dir": "/tmp/test",
            "output_file": "test_output"
        }
        success, result = self.test_endpoint('POST', '/api/process', data=file_data, expected_status=400)
        print(f"{'✅' if success else '❌'} File processing with data: {result.get('status_code', 'error')}")
        
        # Test web scraping with data
        scrape_data = {
            "url": "https://example.com"
        }
        success, result = self.test_endpoint('POST', '/api/scrape2', data=scrape_data, expected_status=200)
        print(f"{'✅' if success else '❌'} Web scraping with data: {result.get('status_code', 'error')}")
        
        # Test academic search with query
        success, result = self.test_endpoint('GET', '/api/academic/search?query=test', expected_status=200)
        print(f"{'✅' if success else '❌'} Academic search with query: {result.get('status_code', 'error')}")
    
    def print_summary(self):
        """Print detailed test summary"""
        print("\n📋 Detailed Test Summary:")
        print("-" * 60)
        
        for endpoint, data in self.results.items():
            status = "✅ PASS" if data['success'] else "❌ FAIL"
            print(f"{status} {endpoint:30} {data['description']}")
        
        print("-" * 60)


def main():
    """Main test function"""
    print("🧪 NeuroGen Server - Blueprint Architecture Test")
    print("=" * 60)
    
    tester = ArchitectureTest()
    
    # Start server
    if not tester.start_server():
        print("❌ Could not start server for testing")
        return False
    
    try:
        # Run basic tests
        basic_success = tester.run_tests()
        
        # Run data tests
        tester.test_with_data()
        
        # Print summary
        tester.print_summary()
        
        if basic_success:
            print("\n🎉 Blueprint architecture is working correctly!")
            print("✅ Ready to replace the old app.py")
        else:
            print("\n⚠️ Some tests failed - check the issues above")
        
        return basic_success
        
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        return False
    except Exception as e:
        print(f"\n💥 Test error: {e}")
        return False


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)