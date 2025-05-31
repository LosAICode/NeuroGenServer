#!/usr/bin/env python3
"""
Test script for validating progressHandler v4.0 optimization
Tests the enhanced Blueprint architecture integration
"""

import requests
import json
import time
from typing import Dict, Any

class ProgressHandlerValidator:
    def __init__(self):
        self.base_url = "http://localhost:5025"
        self.results = {
            "overall": False,
            "tests": {},
            "errors": []
        }
    
    def test_health_endpoint(self) -> Dict[str, Any]:
        """Test health endpoint for progressHandler integration"""
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            
            result = {
                "status": response.status_code,
                "ok": response.ok,
                "response_time": response.elapsed.total_seconds()
            }
            
            if response.ok:
                health_data = response.json()
                result["data"] = health_data
                result["modules_loaded"] = health_data.get("modules", {}).get("loaded", 0)
                
            return result
            
        except Exception as e:
            return {"error": str(e), "ok": False}
    
    def test_module_diagnostics(self) -> Dict[str, Any]:
        """Test module diagnostics endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/test-modules", timeout=15)
            
            result = {
                "status": response.status_code,
                "ok": response.ok,
                "response_time": response.elapsed.total_seconds()
            }
            
            if response.ok:
                diag_data = response.json()
                result["data"] = diag_data
                result["frontend_modules"] = len(diag_data.get("frontend_modules", {}))
                result["backend_modules"] = len(diag_data.get("backend_modules", {}))
                
            return result
            
        except Exception as e:
            return {"error": str(e), "ok": False}
    
    def test_progress_handler_integration(self) -> Dict[str, Any]:
        """Test if progressHandler can handle a simple task creation"""
        try:
            # Test file processor endpoint as it should integrate with progressHandler
            test_data = {
                "input_dir": "/tmp/test",
                "output_file": "test_progress.json",
                "action": "validate"  # Just validate, don't actually process
            }
            
            response = requests.post(
                f"{self.base_url}/api/process",
                json=test_data,
                timeout=10
            )
            
            result = {
                "status": response.status_code,
                "ok": response.ok,
                "response_time": response.elapsed.total_seconds()
            }
            
            if response.ok:
                task_data = response.json()
                result["data"] = task_data
                result["task_id"] = task_data.get("task_id")
                
            return result
            
        except Exception as e:
            return {"error": str(e), "ok": False}
    
    def run_validation(self) -> Dict[str, Any]:
        """Run complete validation suite"""
        print("🧪 Testing ProgressHandler v4.0 Blueprint Architecture Integration")
        print("=" * 70)
        
        # Test 1: Health endpoint
        print("📡 Testing health endpoint...")
        health_result = self.test_health_endpoint()
        self.results["tests"]["health"] = health_result
        
        if health_result.get("ok"):
            print(f"✅ Health endpoint: {health_result['status']} ({health_result['response_time']:.3f}s)")
            if "modules_loaded" in health_result:
                print(f"   📦 Modules loaded: {health_result['modules_loaded']}")
        else:
            print(f"❌ Health endpoint failed: {health_result.get('error', 'Unknown error')}")
        
        # Test 2: Module diagnostics
        print("\n🔍 Testing module diagnostics...")
        diag_result = self.test_module_diagnostics()
        self.results["tests"]["diagnostics"] = diag_result
        
        if diag_result.get("ok"):
            print(f"✅ Module diagnostics: {diag_result['status']} ({diag_result['response_time']:.3f}s)")
            if "frontend_modules" in diag_result:
                print(f"   🎨 Frontend modules: {diag_result['frontend_modules']}")
            if "backend_modules" in diag_result:
                print(f"   ⚙️  Backend modules: {diag_result['backend_modules']}")
        else:
            print(f"❌ Module diagnostics failed: {diag_result.get('error', 'Unknown error')}")
        
        # Test 3: Progress handler integration
        print("\n📊 Testing progress handler integration...")
        progress_result = self.test_progress_handler_integration()
        self.results["tests"]["progress_integration"] = progress_result
        
        if progress_result.get("ok"):
            print(f"✅ Progress integration: {progress_result['status']} ({progress_result['response_time']:.3f}s)")
            if "task_id" in progress_result:
                print(f"   🎯 Task created: {progress_result['task_id']}")
        else:
            print(f"❌ Progress integration failed: {progress_result.get('error', 'Unknown error')}")
        
        # Calculate overall success
        successful_tests = sum(1 for test in self.results["tests"].values() if test.get("ok", False))
        total_tests = len(self.results["tests"])
        
        self.results["overall"] = successful_tests == total_tests
        self.results["success_rate"] = (successful_tests / total_tests) * 100 if total_tests > 0 else 0
        
        print("\n" + "=" * 70)
        print(f"📊 VALIDATION SUMMARY")
        print(f"✅ Successful tests: {successful_tests}/{total_tests}")
        print(f"📈 Success rate: {self.results['success_rate']:.1f}%")
        
        if self.results["overall"]:
            print("🎉 ProgressHandler v4.0 validation: PASSED")
        else:
            print("❌ ProgressHandler v4.0 validation: FAILED")
        
        return self.results

def main():
    validator = ProgressHandlerValidator()
    results = validator.run_validation()
    
    # Save results
    with open("/workspace/modules/progress_handler_validation_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📝 Results saved to progress_handler_validation_results.json")
    
    return 0 if results["overall"] else 1

if __name__ == "__main__":
    exit(main())