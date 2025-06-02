#!/usr/bin/env python3
"""
Comprehensive SocketIO Events & Progress Completion Validation Script

This script validates the complete Submit → Progress → Stats flow with aligned SocketIO events
by running real tests against the live server and monitoring event flows.
"""

import asyncio
import json
import time
import requests
import socketio
from datetime import datetime
import logging
import sys
import os

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SocketIOValidationTester:
    def __init__(self, base_url='http://localhost:5025'):
        self.base_url = base_url
        self.sio = socketio.AsyncClient()
        self.event_log = []
        self.test_results = {}
        self.active_tasks = {}
        
        # Expected events for validation
        self.expected_events = [
            'task_started',
            'progress_update', 
            'task_completed',
            'task_error',
            'connection_established',
            'url_scraped',
            'pdf_found',
            'file_processed'
        ]
        
        # Register event handlers
        self.setup_event_handlers()
    
    def setup_event_handlers(self):
        """Setup SocketIO event handlers for monitoring"""
        
        @self.sio.event
        async def connect():
            logger.info("✅ SocketIO connected successfully")
            self.log_event('connect', {'status': 'connected'})
        
        @self.sio.event
        async def disconnect():
            logger.warning("⚠️ SocketIO disconnected")
            self.log_event('disconnect', {'status': 'disconnected'})
        
        @self.sio.event
        async def connection_established(data):
            logger.info(f"🔗 Connection established: {data}")
            self.log_event('connection_established', data)
        
        @self.sio.event
        async def task_started(data):
            logger.info(f"🚀 Task started: {data.get('task_id')}")
            self.log_event('task_started', data)
            if data.get('task_id'):
                self.active_tasks[data['task_id']] = {
                    'status': 'started',
                    'start_time': time.time(),
                    'type': data.get('task_type', 'unknown')
                }
        
        @self.sio.event
        async def progress_update(data):
            task_id = data.get('task_id')
            progress = data.get('progress', 0)
            logger.info(f"📊 Progress update - Task: {task_id}, Progress: {progress}%")
            self.log_event('progress_update', data)
            
            if task_id and task_id in self.active_tasks:
                self.active_tasks[task_id]['progress'] = progress
                self.active_tasks[task_id]['last_update'] = time.time()
        
        @self.sio.event
        async def task_completed(data):
            task_id = data.get('task_id')
            logger.info(f"✅ Task completed: {task_id}")
            self.log_event('task_completed', data)
            
            if task_id and task_id in self.active_tasks:
                self.active_tasks[task_id]['status'] = 'completed'
                self.active_tasks[task_id]['end_time'] = time.time()
                self.active_tasks[task_id]['completion_data'] = data
        
        @self.sio.event
        async def task_error(data):
            task_id = data.get('task_id')
            error = data.get('error', 'Unknown error')
            logger.error(f"❌ Task error - Task: {task_id}, Error: {error}")
            self.log_event('task_error', data)
            
            if task_id and task_id in self.active_tasks:
                self.active_tasks[task_id]['status'] = 'error'
                self.active_tasks[task_id]['error'] = error
                self.active_tasks[task_id]['end_time'] = time.time()
        
        @self.sio.event
        async def url_scraped(data):
            logger.info(f"🌐 URL scraped: {data.get('url', 'unknown')}")
            self.log_event('url_scraped', data)
        
        @self.sio.event
        async def pdf_found(data):
            logger.info(f"📄 PDF found: {data.get('url', 'unknown')}")
            self.log_event('pdf_found', data)
        
        @self.sio.event
        async def file_processed(data):
            logger.info(f"📁 File processed: {data.get('file_path', 'unknown')}")
            self.log_event('file_processed', data)
    
    def log_event(self, event_name, data):
        """Log an event with timestamp"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'event': event_name,
            'data': data
        }
        self.event_log.append(log_entry)
    
    async def connect_socket(self):
        """Connect to SocketIO server"""
        try:
            await self.sio.connect(self.base_url)
            logger.info("🔌 Connected to SocketIO server")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to SocketIO: {e}")
            return False
    
    async def disconnect_socket(self):
        """Disconnect from SocketIO server"""
        try:
            await self.sio.disconnect()
            logger.info("🔌 Disconnected from SocketIO server")
        except Exception as e:
            logger.error(f"⚠️ Error disconnecting: {e}")
    
    def test_server_health(self):
        """Test server health and module availability"""
        logger.info("🏥 Testing server health...")
        
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            health_data = response.json()
            
            logger.info(f"📊 Server health: {health_data.get('status', 'unknown')}")
            
            self.test_results['server_health'] = {
                'status': health_data.get('status'),
                'response_time': health_data.get('response_time_ms'),
                'modules_loaded': health_data.get('checks', {}).get('modules', {}).get('total', 0),
                'endpoints_available': health_data.get('checks', {}).get('endpoints', {})
            }
            
            return health_data.get('status') in ['healthy', 'warning']
            
        except Exception as e:
            logger.error(f"❌ Server health check failed: {e}")
            self.test_results['server_health'] = {'status': 'error', 'error': str(e)}
            return False
    
    async def test_file_processor_flow(self):
        """Test File Processor Submit → Progress → Stats flow"""
        logger.info("📁 Testing File Processor flow...")
        
        # Create test directory and files if they don't exist
        test_dir = "/workspace/modules/test_enhanced_output"
        if not os.path.exists(test_dir):
            os.makedirs(test_dir, exist_ok=True)
            
        # Create a simple test file
        test_file = os.path.join(test_dir, "test_file.txt")
        with open(test_file, 'w') as f:
            f.write("This is a test file for SocketIO validation.\nLine 2 of test content.\n")
        
        try:
            # Start file processing task
            payload = {
                'input_dir': test_dir,
                'output_file': 'socketio_validation_test.json'
            }
            
            response = requests.post(f"{self.base_url}/api/process", 
                                   json=payload, timeout=30)
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
            
            result = response.json()
            task_id = result.get('task_id')
            
            if not task_id:
                raise Exception("No task_id returned from server")
            
            logger.info(f"📋 File Processor task started: {task_id}")
            
            # Monitor task progress
            start_time = time.time()
            timeout = 60  # 60 seconds timeout
            
            while time.time() - start_time < timeout:
                if task_id in self.active_tasks:
                    task = self.active_tasks[task_id]
                    
                    if task.get('status') == 'completed':
                        logger.info(f"✅ File Processor task completed successfully")
                        self.test_results['file_processor'] = {
                            'status': 'completed',
                            'task_id': task_id,
                            'duration': task.get('end_time', 0) - task.get('start_time', 0),
                            'final_progress': task.get('progress', 0),
                            'completion_data': task.get('completion_data', {})
                        }
                        return True
                    
                    elif task.get('status') == 'error':
                        error_msg = task.get('error', 'Unknown error')
                        logger.error(f"❌ File Processor task failed: {error_msg}")
                        self.test_results['file_processor'] = {
                            'status': 'error',
                            'error': error_msg,
                            'task_id': task_id
                        }
                        return False
                
                await asyncio.sleep(1)
            
            # Timeout
            logger.error("⏰ File Processor test timed out")
            self.test_results['file_processor'] = {
                'status': 'timeout',
                'task_id': task_id,
                'timeout_seconds': timeout
            }
            return False
            
        except Exception as e:
            logger.error(f"❌ File Processor test failed: {e}")
            self.test_results['file_processor'] = {
                'status': 'error',
                'error': str(e)
            }
            return False
    
    async def test_web_scraper_flow(self):
        """Test Web Scraper Submit → Progress → Stats flow"""
        logger.info("🌐 Testing Web Scraper flow...")
        
        try:
            # Start web scraping task with simple URL
            payload = {
                'urls': ['https://httpbin.org/json'],  # Simple test URL
                'output_file': 'socketio_webscraper_test.json',
                'download_pdfs': False,
                'max_pdfs': 0,
                'recursive': False,
                'max_depth': 1
            }
            
            response = requests.post(f"{self.base_url}/api/scrape2", 
                                   json=payload, timeout=30)
            
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
            
            result = response.json()
            task_id = result.get('task_id')
            
            if not task_id:
                raise Exception("No task_id returned from server")
            
            logger.info(f"🕷️ Web Scraper task started: {task_id}")
            
            # Monitor task progress
            start_time = time.time()
            timeout = 45  # 45 seconds timeout
            
            while time.time() - start_time < timeout:
                if task_id in self.active_tasks:
                    task = self.active_tasks[task_id]
                    
                    if task.get('status') == 'completed':
                        logger.info(f"✅ Web Scraper task completed successfully")
                        self.test_results['web_scraper'] = {
                            'status': 'completed',
                            'task_id': task_id,
                            'duration': task.get('end_time', 0) - task.get('start_time', 0),
                            'final_progress': task.get('progress', 0),
                            'completion_data': task.get('completion_data', {})
                        }
                        return True
                    
                    elif task.get('status') == 'error':
                        error_msg = task.get('error', 'Unknown error')
                        logger.error(f"❌ Web Scraper task failed: {error_msg}")
                        self.test_results['web_scraper'] = {
                            'status': 'error',
                            'error': error_msg,
                            'task_id': task_id
                        }
                        return False
                
                await asyncio.sleep(1)
            
            # Timeout
            logger.error("⏰ Web Scraper test timed out")
            self.test_results['web_scraper'] = {
                'status': 'timeout',
                'task_id': task_id,
                'timeout_seconds': timeout
            }
            return False
            
        except Exception as e:
            logger.error(f"❌ Web Scraper test failed: {e}")
            self.test_results['web_scraper'] = {
                'status': 'error',
                'error': str(e)
            }
            return False
    
    def validate_event_alignment(self):
        """Validate that all expected events were received"""
        logger.info("🔍 Validating SocketIO event alignment...")
        
        received_events = set(entry['event'] for entry in self.event_log)
        expected_events = set(self.expected_events)
        
        aligned_events = received_events.intersection(expected_events)
        missing_events = expected_events - received_events
        extra_events = received_events - expected_events
        
        alignment_score = (len(aligned_events) / len(expected_events)) * 100
        
        self.test_results['event_alignment'] = {
            'expected_events': list(expected_events),
            'received_events': list(received_events),
            'aligned_events': list(aligned_events),
            'missing_events': list(missing_events),
            'extra_events': list(extra_events),
            'alignment_score': alignment_score,
            'total_events_received': len(self.event_log)
        }
        
        logger.info(f"📊 Event alignment score: {alignment_score:.1f}%")
        logger.info(f"📊 Total events received: {len(self.event_log)}")
        
        if missing_events:
            logger.warning(f"⚠️ Missing events: {list(missing_events)}")
        
        if extra_events:
            logger.info(f"ℹ️ Extra events received: {list(extra_events)}")
        
        return alignment_score >= 80  # 80% or higher is considered good
    
    async def run_comprehensive_test(self):
        """Run the complete validation test suite"""
        logger.info("🚀 Starting Comprehensive SocketIO Validation Tests")
        logger.info("=" * 60)
        
        test_results = {
            'server_health': False,
            'socket_connection': False,
            'file_processor_flow': False,
            'web_scraper_flow': False,
            'event_alignment': False
        }
        
        # 1. Test server health
        test_results['server_health'] = self.test_server_health()
        if not test_results['server_health']:
            logger.error("❌ Server health check failed - aborting tests")
            return test_results
        
        # 2. Test SocketIO connection
        test_results['socket_connection'] = await self.connect_socket()
        if not test_results['socket_connection']:
            logger.error("❌ SocketIO connection failed - aborting tests")
            return test_results
        
        # Wait for connection to stabilize
        await asyncio.sleep(2)
        
        # 3. Test File Processor flow
        logger.info("\n" + "=" * 40)
        test_results['file_processor_flow'] = await self.test_file_processor_flow()
        
        # Wait between tests
        await asyncio.sleep(3)
        
        # 4. Test Web Scraper flow
        logger.info("\n" + "=" * 40)
        test_results['web_scraper_flow'] = await self.test_web_scraper_flow()
        
        # Wait for any remaining events
        await asyncio.sleep(3)
        
        # 5. Validate event alignment
        logger.info("\n" + "=" * 40)
        test_results['event_alignment'] = self.validate_event_alignment()
        
        # Disconnect
        await self.disconnect_socket()
        
        return test_results
    
    def generate_report(self, test_results):
        """Generate comprehensive test report"""
        logger.info("\n" + "=" * 60)
        logger.info("📊 COMPREHENSIVE VALIDATION REPORT")
        logger.info("=" * 60)
        
        # Test Results Summary
        passed_tests = sum(1 for result in test_results.values() if result)
        total_tests = len(test_results)
        success_rate = (passed_tests / total_tests) * 100
        
        logger.info(f"📋 Test Results Summary:")
        logger.info(f"   ✅ Tests Passed: {passed_tests}/{total_tests}")
        logger.info(f"   📊 Success Rate: {success_rate:.1f}%")
        logger.info("")
        
        # Detailed Results
        for test_name, result in test_results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            logger.info(f"   {status} {test_name.replace('_', ' ').title()}")
        
        logger.info("")
        
        # Event Statistics
        if self.event_log:
            event_types = {}
            for entry in self.event_log:
                event_types[entry['event']] = event_types.get(entry['event'], 0) + 1
            
            logger.info("📡 Event Statistics:")
            for event, count in sorted(event_types.items()):
                logger.info(f"   {event}: {count} events")
        
        logger.info("")
        
        # Active Tasks Summary
        if self.active_tasks:
            logger.info("📋 Task Summary:")
            for task_id, task in self.active_tasks.items():
                status = task.get('status', 'unknown')
                task_type = task.get('type', 'unknown')
                logger.info(f"   Task {task_id[:8]}... ({task_type}): {status}")
        
        logger.info("")
        
        # Overall Assessment
        if success_rate >= 80:
            logger.info("🎉 OVERALL ASSESSMENT: SocketIO Events & Progress Completion - EXCELLENT ALIGNMENT")
            logger.info("✅ System is production ready with comprehensive event flow validation")
        elif success_rate >= 60:
            logger.info("⚠️ OVERALL ASSESSMENT: SocketIO Events & Progress Completion - GOOD ALIGNMENT")
            logger.info("🔧 Minor issues identified - system functional but may need tuning")
        else:
            logger.info("❌ OVERALL ASSESSMENT: SocketIO Events & Progress Completion - NEEDS ATTENTION")
            logger.info("🚨 Significant issues identified - review required before production")
        
        # Save detailed report
        report_data = {
            'timestamp': datetime.now().isoformat(),
            'test_results': test_results,
            'detailed_results': self.test_results,
            'event_log': self.event_log,
            'active_tasks': self.active_tasks,
            'summary': {
                'tests_passed': passed_tests,
                'total_tests': total_tests,
                'success_rate': success_rate,
                'total_events': len(self.event_log)
            }
        }
        
        report_file = f"socketio_validation_report_{int(time.time())}.json"
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2)
        
        logger.info(f"📄 Detailed report saved to: {report_file}")
        logger.info("=" * 60)
        
        return success_rate


async def main():
    """Main test execution function"""
    tester = SocketIOValidationTester()
    
    try:
        # Run comprehensive tests
        test_results = await tester.run_comprehensive_test()
        
        # Generate report
        success_rate = tester.generate_report(test_results)
        
        # Exit with appropriate code
        exit_code = 0 if success_rate >= 80 else 1
        sys.exit(exit_code)
        
    except KeyboardInterrupt:
        logger.info("\n⚠️ Test interrupted by user")
        await tester.disconnect_socket()
        sys.exit(130)
    except Exception as e:
        logger.error(f"❌ Test execution failed: {e}")
        await tester.disconnect_socket()
        sys.exit(1)


if __name__ == "__main__":
    # Install required packages if needed
    try:
        import socketio
    except ImportError:
        logger.error("❌ python-socketio package required. Install with: pip install python-socketio")
        sys.exit(1)
    
    # Run tests
    asyncio.run(main())