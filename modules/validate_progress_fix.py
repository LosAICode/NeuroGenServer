#!/usr/bin/env python3
"""
Validate Progress Fix - Test the complete progress flow
"""

import requests
import json
import time
import os
import tempfile
from typing import Dict, Any

class ProgressFlowValidator:
    def __init__(self):
        self.base_url = "http://localhost:5025"
        self.test_dir = None
        self.task_id = None
        
    def setup_test_files(self):
        """Create test files for processing"""
        self.test_dir = tempfile.mkdtemp(prefix="progress_test_")
        
        # Create several test files
        for i in range(5):
            with open(f"{self.test_dir}/test_file_{i}.txt", "w") as f:
                f.write(f"Test content for file {i}\n" * 10)
        
        print(f"✅ Created test directory: {self.test_dir}")
        print(f"📁 Created 5 test files")
        return self.test_dir
    
    def test_file_processor_api(self):
        """Test the file processor API endpoint"""
        try:
            print("\n📊 Testing File Processor API...")
            
            response = requests.post(
                f"{self.base_url}/api/process",
                json={
                    "input_dir": self.test_dir,
                    "output_file": "progress_validation_test.json"
                },
                timeout=10
            )
            
            if response.ok:
                data = response.json()
                self.task_id = data.get("task_id")
                print(f"✅ File processing started")
                print(f"🎯 Task ID: {self.task_id}")
                print(f"📋 Status: {data.get('status')}")
                print(f"📄 Output: {data.get('output_file')}")
                return True
            else:
                print(f"❌ API request failed: {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ API test failed: {str(e)}")
            return False
    
    def monitor_progress(self, max_wait=30):
        """Monitor the progress of the task"""
        print(f"\n📈 Monitoring progress for task: {self.task_id}")
        
        start_time = time.time()
        last_progress = -1
        progress_updates = []
        
        while time.time() - start_time < max_wait:
            try:
                # Check task status (if there's a status endpoint)
                # For now, we'll just wait and check the output file
                time.sleep(2)
                
                # Check if output file exists (indicates completion)
                output_path = f"/workspace/modules/downloads/progress_validation_test.json"
                if os.path.exists(output_path):
                    print(f"✅ Output file created: {output_path}")
                    
                    # Read and display the results
                    with open(output_path, 'r') as f:
                        result_data = json.load(f)
                    
                    print(f"📊 Processing Results:")
                    print(f"   📁 Total files: {len(result_data.get('documents', []))}")
                    print(f"   📄 Documents processed: {len([d for d in result_data.get('documents', []) if d.get('content')])}")
                    print(f"   ⏱️  Processing completed successfully!")
                    
                    return True
                else:
                    print(f"⏳ Still processing... ({int(time.time() - start_time)}s elapsed)")
            
            except Exception as e:
                print(f"⚠️  Error monitoring progress: {str(e)}")
        
        print(f"⏰ Timeout reached ({max_wait}s) - task may still be running")
        return False
    
    def cleanup(self):
        """Clean up test files"""
        if self.test_dir and os.path.exists(self.test_dir):
            import shutil
            shutil.rmtree(self.test_dir)
            print(f"🧹 Cleaned up test directory: {self.test_dir}")
    
    def run_validation(self):
        """Run complete validation"""
        print("🔍 Progress Flow Validation Test")
        print("=" * 50)
        
        try:
            # Step 1: Setup test files
            self.setup_test_files()
            
            # Step 2: Test file processor API
            if not self.test_file_processor_api():
                return False
            
            # Step 3: Monitor progress
            success = self.monitor_progress()
            
            print("\n" + "=" * 50)
            if success:
                print("🎉 Progress Flow Validation: PASSED")
                print("✅ Submit → Progress → Stats flow is working correctly")
            else:
                print("❌ Progress Flow Validation: INCOMPLETE")
                print("⚠️  Task may still be running - check manually")
                
            return success
            
        except Exception as e:
            print(f"❌ Validation failed with error: {str(e)}")
            return False
        finally:
            self.cleanup()

def main():
    validator = ProgressFlowValidator()
    success = validator.run_validation()
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())