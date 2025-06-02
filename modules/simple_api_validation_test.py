#!/usr/bin/env python3
"""
Simple API Validation Test for SocketIO Events & Progress Completion

Tests the core API endpoints and validates the system is ready for SocketIO testing.
"""

import requests
import json
import time
import os
from datetime import datetime

class SimpleAPIValidator:
    def __init__(self, base_url='http://localhost:5025'):
        self.base_url = base_url
        self.test_results = {}
        
    def test_server_health(self):
        """Test server health endpoint"""
        print("🏥 Testing server health...")
        
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            health_data = response.json()
            
            status = health_data.get('status', 'unknown')
            print(f"📊 Server Status: {status}")
            print(f"⏱️ Response Time: {health_data.get('response_time_ms', 0)}ms")
            
            # Check modules
            modules = health_data.get('checks', {}).get('modules', {})
            print(f"🧩 Modules Loaded: {modules.get('total', 0)}")
            
            # Check endpoints
            endpoints = health_data.get('checks', {}).get('endpoints', {}).get('endpoints', {})
            endpoint_count = sum(1 for ep in endpoints.values() if ep)
            print(f"🔌 Active Endpoints: {endpoint_count}")
            
            self.test_results['server_health'] = {
                'status': status,
                'response_time': health_data.get('response_time_ms'),
                'modules_total': modules.get('total', 0),
                'endpoints_active': endpoint_count,
                'passed': status in ['healthy', 'warning']
            }
            
            return status in ['healthy', 'warning']
            
        except Exception as e:
            print(f"❌ Server health check failed: {e}")
            self.test_results['server_health'] = {'status': 'error', 'error': str(e), 'passed': False}
            return False
    
    def test_file_processor_endpoint(self):
        """Test File Processor API endpoint"""
        print("\n📁 Testing File Processor endpoint...")
        
        # Create test directory and file
        test_dir = "/workspace/modules/test_enhanced_output"
        os.makedirs(test_dir, exist_ok=True)
        
        test_file = os.path.join(test_dir, "simple_test.txt")
        with open(test_file, 'w') as f:
            f.write("Simple API validation test file.\nTesting SocketIO alignment.\n")
        
        try:
            payload = {
                'input_dir': test_dir,
                'output_file': 'api_validation_test.json'
            }
            
            response = requests.post(f"{self.base_url}/api/process", 
                                   json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                task_id = result.get('task_id')
                print(f"✅ File Processor endpoint working - Task ID: {task_id}")
                
                self.test_results['file_processor_endpoint'] = {
                    'status': 'success',
                    'task_id': task_id,
                    'response_code': response.status_code,
                    'passed': True
                }
                return True
            else:
                print(f"❌ File Processor endpoint failed - HTTP {response.status_code}")
                self.test_results['file_processor_endpoint'] = {
                    'status': 'failed',
                    'response_code': response.status_code,
                    'response_text': response.text,
                    'passed': False
                }
                return False
                
        except Exception as e:
            print(f"❌ File Processor endpoint test failed: {e}")
            self.test_results['file_processor_endpoint'] = {
                'status': 'error',
                'error': str(e),
                'passed': False
            }
            return False
    
    def test_web_scraper_endpoint(self):
        """Test Web Scraper API endpoint"""
        print("\n🌐 Testing Web Scraper endpoint...")
        
        try:
            payload = {
                'urls': ['https://httpbin.org/json'],
                'output_file': 'api_webscraper_test.json',
                'download_pdfs': False,
                'max_pdfs': 0
            }
            
            response = requests.post(f"{self.base_url}/api/scrape2", 
                                   json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                task_id = result.get('task_id')
                print(f"✅ Web Scraper endpoint working - Task ID: {task_id}")
                
                self.test_results['web_scraper_endpoint'] = {
                    'status': 'success',
                    'task_id': task_id,
                    'response_code': response.status_code,
                    'passed': True
                }
                return True
            else:
                print(f"❌ Web Scraper endpoint failed - HTTP {response.status_code}")
                self.test_results['web_scraper_endpoint'] = {
                    'status': 'failed',
                    'response_code': response.status_code,
                    'response_text': response.text,
                    'passed': False
                }
                return False
                
        except Exception as e:
            print(f"❌ Web Scraper endpoint test failed: {e}")
            self.test_results['web_scraper_endpoint'] = {
                'status': 'error',
                'error': str(e),
                'passed': False
            }
            return False
    
    def test_static_assets(self):
        """Test static asset availability"""
        print("\n📄 Testing static asset availability...")
        
        assets_to_test = [
            '/static/js/modules/config/endpoints.js',
            '/static/js/modules/config/socketEvents.js',
            '/static/js/modules/features/fileProcessor.js',
            '/static/js/modules/features/webScraper.js',
            '/static/js/modules/utils/progressHandler.js'
        ]
        
        available_assets = 0
        total_assets = len(assets_to_test)
        
        for asset in assets_to_test:
            try:
                response = requests.get(f"{self.base_url}{asset}", timeout=5)
                if response.status_code == 200:
                    available_assets += 1
                    print(f"✅ Available: {asset}")
                else:
                    print(f"❌ Missing: {asset} (HTTP {response.status_code})")
            except Exception as e:
                print(f"❌ Error loading: {asset} - {e}")
        
        success_rate = (available_assets / total_assets) * 100
        print(f"📊 Static Assets: {available_assets}/{total_assets} ({success_rate:.1f}%)")
        
        self.test_results['static_assets'] = {
            'available': available_assets,
            'total': total_assets,
            'success_rate': success_rate,
            'passed': success_rate >= 80
        }
        
        return success_rate >= 80
    
    def test_socketio_configuration(self):
        """Test SocketIO configuration endpoint"""
        print("\n🔌 Testing SocketIO configuration...")
        
        try:
            # Test main page load (should include SocketIO)
            response = requests.get(f"{self.base_url}/", timeout=10)
            
            if response.status_code == 200:
                content = response.text
                
                # Check for SocketIO script inclusion
                socketio_included = 'socket.io' in content
                print(f"📡 SocketIO Script Included: {'✅' if socketio_included else '❌'}")
                
                # Check for event configuration
                events_config = 'socketEvents' in content or 'SOCKET_EVENTS' in content
                print(f"📋 Event Configuration Present: {'✅' if events_config else '❌'}")
                
                # Check for progress handler
                progress_handler = 'progressHandler' in content
                print(f"📊 Progress Handler Present: {'✅' if progress_handler else '❌'}")
                
                success = socketio_included and events_config
                
                self.test_results['socketio_configuration'] = {
                    'socketio_included': socketio_included,
                    'events_config': events_config,
                    'progress_handler': progress_handler,
                    'passed': success
                }
                
                return success
            else:
                print(f"❌ Main page failed to load - HTTP {response.status_code}")
                self.test_results['socketio_configuration'] = {
                    'status': 'failed',
                    'response_code': response.status_code,
                    'passed': False
                }
                return False
                
        except Exception as e:
            print(f"❌ SocketIO configuration test failed: {e}")
            self.test_results['socketio_configuration'] = {
                'status': 'error',
                'error': str(e),
                'passed': False
            }
            return False
    
    def run_validation_tests(self):
        """Run all validation tests"""
        print("🚀 Starting Simple API Validation Tests")
        print("=" * 50)
        
        tests = [
            ('Server Health', self.test_server_health),
            ('File Processor Endpoint', self.test_file_processor_endpoint),
            ('Web Scraper Endpoint', self.test_web_scraper_endpoint),
            ('Static Assets', self.test_static_assets),
            ('SocketIO Configuration', self.test_socketio_configuration)
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                if result:
                    passed_tests += 1
            except Exception as e:
                print(f"❌ Test {test_name} crashed: {e}")
        
        # Generate summary
        success_rate = (passed_tests / total_tests) * 100
        
        print("\n" + "=" * 50)
        print("📊 VALIDATION SUMMARY")
        print("=" * 50)
        print(f"📋 Tests Passed: {passed_tests}/{total_tests}")
        print(f"📊 Success Rate: {success_rate:.1f}%")
        print("")
        
        for test_name, _ in tests:
            test_key = test_name.lower().replace(' ', '_')
            result = self.test_results.get(test_key, {})
            status = "✅ PASSED" if result.get('passed', False) else "❌ FAILED"
            print(f"   {status} {test_name}")
        
        print("\n" + "=" * 50)
        
        if success_rate >= 80:
            print("🎉 SYSTEM READY: API endpoints validated and ready for SocketIO testing")
            print("✅ Proceed with browser-based SocketIO validation using the HTML test framework")
        elif success_rate >= 60:
            print("⚠️ SYSTEM PARTIALLY READY: Core functionality working with some issues")
            print("🔧 Review failed tests before proceeding with SocketIO validation")
        else:
            print("❌ SYSTEM NOT READY: Critical issues identified")
            print("🚨 Resolve API endpoint issues before SocketIO testing")
        
        # Save report
        report_data = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'tests_passed': passed_tests,
                'total_tests': total_tests,
                'success_rate': success_rate
            },
            'test_results': self.test_results
        }
        
        report_file = f"api_validation_report_{int(time.time())}.json"
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2)
        
        print(f"📄 Detailed report saved to: {report_file}")
        print("=" * 50)
        
        return success_rate >= 80


if __name__ == "__main__":
    validator = SimpleAPIValidator()
    success = validator.run_validation_tests()
    
    if success:
        print("\n🎯 NEXT STEPS:")
        print("1. Open: http://localhost:5025/comprehensive_socketio_validation_test.html")
        print("2. Run the browser-based SocketIO validation tests")
        print("3. Test complete Submit → Progress → Stats flows")
        exit(0)
    else:
        print("\n🔧 REQUIRED ACTIONS:")
        print("1. Review and fix the failed API endpoint tests")
        print("2. Ensure all static assets are properly served")
        print("3. Re-run validation before SocketIO testing")
        exit(1)