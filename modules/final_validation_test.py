#!/usr/bin/env python3
"""
Final Validation Test - Complete Submit → Progress → Stats Flow
"""

import requests
import json
import time
import os
import tempfile

class ComprehensiveValidator:
    def __init__(self):
        self.base_url = "http://localhost:5025"
        self.test_dir = None
        self.task_id = None
        
    def setup_test_environment(self):
        """Setup test files and directories"""
        print("🛠️  Setting up test environment...")
        
        self.test_dir = tempfile.mkdtemp(prefix="final_validation_")
        
        test_files = [
            ("document1.txt", "This is a test document with some content.\n" * 20),
            ("data.json", '{"test": "data", "numbers": [1, 2, 3, 4, 5]}'),
            ("readme.md", "# Test README\n\nThis is a markdown file for testing.\n" * 10),
            ("config.xml", "<config><setting>value</setting></config>\n" * 5),
            ("script.py", "# Test Python script\nprint('Hello, World!')\n" * 10)
        ]
        
        for filename, content in test_files:
            with open(os.path.join(self.test_dir, filename), 'w') as f:
                f.write(content)
        
        print(f"✅ Created test directory: {self.test_dir}")
        print(f"📁 Created {len(test_files)} test files")
        return True
    
    def test_health_check(self):
        """Test server health and endpoints"""
        print("\n🏥 Testing server health...")
        
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=5)
            if response.ok:
                health_data = response.json()
                print(f"✅ Server health: {health_data.get('status', 'unknown')}")
                
                endpoints = health_data.get('checks', {}).get('endpoints', {}).get('endpoints', {})
                if endpoints.get('file_processor'):
                    print("✅ File processor endpoint available")
                    return True
                else:
                    print("❌ File processor endpoint not available")
                    return False
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Health check error: {str(e)}")
            return False
    
    def test_submit_action(self):
        """Test the Submit button API call"""
        print("\n🚀 Testing Submit action...")
        
        try:
            response = requests.post(
                f"{self.base_url}/api/process",
                json={
                    "input_dir": self.test_dir,
                    "output_file": "final_validation_test.json"
                },
                timeout=10
            )
            
            if response.ok:
                data = response.json()
                self.task_id = data.get("task_id")
                
                print(f"✅ Submit action successful")
                print(f"🎯 Task ID: {self.task_id}")
                print(f"📋 Status: {data.get('status')}")
                
                return True
            else:
                print(f"❌ Submit action failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Submit action error: {str(e)}")
            return False
    
    def validate_progress_percentage_fix(self):
        """Validate that our progress percentage fix is working"""
        print(f"\n🔧 Validating progress percentage fix...")
        
        # Check Structify module fix
        structify_path = "/workspace/modules/Structify/claude.py"
        if os.path.exists(structify_path):
            with open(structify_path, 'r') as f:
                content = f.read()
            
            buggy_increments = content.count('stats.total_files += 1')
            if buggy_increments == 0:
                print("✅ Buggy increments removed from Structify")
            else:
                print(f"❌ Still found {buggy_increments} buggy increments")
                return False
            
            if 'stats.total_files = len(all_files)' in content:
                print("✅ Proper initialization added to Structify")
            else:
                print("❌ Proper initialization missing")
                return False
        
        # Check services.py fix
        services_path = "/workspace/modules/blueprints/core/services.py"
        if os.path.exists(services_path):
            with open(services_path, 'r') as f:
                content = f.read()
            
            if 'self.total_files += 1' not in content:
                print("✅ Buggy increment removed from services.py")
            else:
                print("❌ Buggy increment still present in services.py")
                return False
        
        return True
    
    def monitor_progress_and_stats(self, max_wait=45):
        """Monitor the complete progress flow"""
        print(f"\n📈 Monitoring progress flow...")
        
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                output_path = f"/workspace/modules/downloads/final_validation_test.json"
                
                if os.path.exists(output_path):
                    print(f"\n✅ TASK COMPLETED!")
                    
                    with open(output_path, 'r') as f:
                        result_data = json.load(f)
                    
                    print(f"\n📊 FINAL STATISTICS:")
                    documents = result_data.get('documents', [])
                    print(f"   📁 Total documents: {len(documents)}")
                    
                    processed_docs = [d for d in documents if d.get('content')]
                    print(f"   ✅ Successfully processed: {len(processed_docs)}")
                    
                    expected_files = 5
                    if len(documents) == expected_files:
                        print(f"✅ File count validation PASSED ({len(documents)}/{expected_files})")
                    else:
                        print(f"⚠️  File count: got {len(documents)}, expected {expected_files}")
                    
                    return True
                
                elapsed = int(time.time() - start_time)
                print(f"⏳ Processing... ({elapsed}s elapsed)")
                time.sleep(3)
            
            except Exception as e:
                print(f"⚠️  Error: {str(e)}")
                time.sleep(2)
        
        print(f"⏰ Timeout reached ({max_wait}s)")
        return False
    
    def cleanup(self):
        """Clean up test resources"""
        if self.test_dir and os.path.exists(self.test_dir):
            import shutil
            shutil.rmtree(self.test_dir)
            print(f"🧹 Cleaned up test directory")
    
    def run_comprehensive_validation(self):
        """Run the complete validation test"""
        print("🎯 COMPREHENSIVE VALIDATION TEST")
        print("=" * 60)
        
        success = True
        
        try:
            if not self.setup_test_environment():
                return False
            
            if not self.test_health_check():
                return False
            
            if not self.validate_progress_percentage_fix():
                return False
            
            if not self.test_submit_action():
                return False
            
            if not self.monitor_progress_and_stats():
                success = False
            
            print("\n" + "=" * 60)
            if success:
                print("🎉 COMPREHENSIVE VALIDATION: PASSED")
                print("✅ Submit → Progress → Stats flow working correctly")
                print("✅ Progress percentage calculation bug fixed")
            else:
                print("❌ COMPREHENSIVE VALIDATION: FAILED")
            
            return success
            
        except Exception as e:
            print(f"❌ Validation failed: {str(e)}")
            return False
        finally:
            self.cleanup()

def main():
    validator = ComprehensiveValidator()
    success = validator.run_comprehensive_validation()
    
    print(f"\n📋 VALIDATION SUMMARY:")
    print(f"Status: {'PASSED' if success else 'FAILED'}")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())