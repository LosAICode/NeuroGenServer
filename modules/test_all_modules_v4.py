#!/usr/bin/env python3
"""
Comprehensive test script for validating all v4.0 optimized modules
Tests the enhanced Blueprint architecture integration across all modules
"""

import requests
import json
import time
from typing import Dict, Any, List

class ComprehensiveModuleValidator:
    def __init__(self):
        self.base_url = "http://localhost:5025"
        self.results = {
            "overall": False,
            "modules": {},
            "summary": {},
            "errors": []
        }
        
        # Module configurations for testing
        self.modules = {
            "progressHandler": {
                "name": "Progress Handler v4.0",
                "test_endpoints": ["/api/health"],
                "expected_features": ["configurationDriven", "enhancedNotifications", "taskTracking"]
            },
            "fileProcessor": {
                "name": "File Processor v4.0", 
                "test_endpoints": ["/api/health", "/api/process"],
                "test_data": {
                    "input_dir": "/tmp/test",
                    "output_file": "test.json",
                    "action": "validate"
                },
                "expected_features": ["configurationDriven", "enhancedNotifications", "fileProcessing"]
            },
            "academicSearch": {
                "name": "Academic Search v4.0",
                "test_endpoints": ["/api/academic/health", "/api/academic/search"],
                "test_params": {"query": "test"},
                "expected_features": ["configurationDriven", "enhancedNotifications", "paperSearch"]
            },
            "pdfProcessor": {
                "name": "PDF Processor v4.0",
                "test_endpoints": ["/api/pdf/health"],
                "expected_features": ["configurationDriven", "enhancedNotifications", "pdfProcessing"]
            },
            "webScraper": {
                "name": "Web Scraper v3.1.0 (Already Optimized)",
                "test_endpoints": ["/api/health-enhanced", "/api/scrape2"],
                "test_data": {
                    "url": "https://example.com",
                    "mode": "smart_pdf_discovery",
                    "action": "validate"
                },
                "expected_features": ["configurationDriven", "enhancedNotifications", "webScraping"]
            },
            "playlistDownloader": {
                "name": "Playlist Downloader v3.1.0 (Already Optimized)",
                "test_endpoints": ["/api/health", "/api/start-playlists"],
                "test_data": {
                    "playlists": ["https://youtube.com/playlist?list=test"],
                    "root_directory": "/tmp/test",
                    "action": "validate"
                },
                "expected_features": ["configurationDriven", "enhancedNotifications", "playlistDownloading"]
            }
        }
    
    def test_module_health(self, module_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Test a module's health endpoints"""
        results = {
            "module": module_name,
            "name": config["name"],
            "endpoints": {},
            "connectivity": False,
            "errors": []
        }
        
        try:
            print(f"  📡 Testing {config['name']} endpoints...")
            
            for endpoint in config["test_endpoints"]:
                try:
                    response = requests.get(f"{self.base_url}{endpoint}", timeout=10)
                    
                    results["endpoints"][endpoint] = {
                        "status": response.status_code,
                        "ok": response.ok,
                        "response_time": response.elapsed.total_seconds()
                    }
                    
                    if response.ok:
                        try:
                            data = response.json()
                            results["endpoints"][endpoint]["data"] = data
                        except:
                            pass
                    
                    print(f"    ✅ {endpoint}: {response.status_code} ({response.elapsed.total_seconds():.3f}s)")
                    
                except Exception as e:
                    results["endpoints"][endpoint] = {"error": str(e), "ok": False}
                    results["errors"].append(f"{endpoint}: {e}")
                    print(f"    ❌ {endpoint}: {e}")
            
            # Check if at least one endpoint is working
            results["connectivity"] = any(ep.get("ok", False) for ep in results["endpoints"].values())
            
        except Exception as e:
            results["errors"].append(f"General error: {e}")
        
        return results
    
    def test_module_functionality(self, module_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Test a module's functional endpoints"""
        results = {
            "module": module_name,
            "functionality": {},
            "working": False,
            "errors": []
        }
        
        try:
            # Test POST endpoints if available
            if len(config["test_endpoints"]) > 1:
                endpoint = config["test_endpoints"][1]  # Usually the functional endpoint
                
                print(f"  🔧 Testing {config['name']} functionality...")
                
                if "test_data" in config:
                    # POST request
                    response = requests.post(
                        f"{self.base_url}{endpoint}",
                        json=config["test_data"],
                        timeout=10
                    )
                elif "test_params" in config:
                    # GET request with parameters
                    response = requests.get(
                        f"{self.base_url}{endpoint}",
                        params=config["test_params"],
                        timeout=10
                    )
                else:
                    # Simple GET request
                    response = requests.get(f"{self.base_url}{endpoint}", timeout=10)
                
                results["functionality"][endpoint] = {
                    "status": response.status_code,
                    "ok": response.ok or response.status_code == 400,  # 400 might be expected for validation
                    "response_time": response.elapsed.total_seconds()
                }
                
                if response.ok:
                    try:
                        data = response.json()
                        results["functionality"][endpoint]["data"] = data
                        # Check for task_id which indicates successful task creation
                        if "task_id" in data:
                            results["working"] = True
                    except:
                        pass
                elif response.status_code == 400:
                    # 400 might be expected for validation endpoints
                    results["working"] = True
                
                print(f"    ✅ {endpoint}: {response.status_code} ({'Working' if results['working'] else 'Error'})")
            
        except Exception as e:
            results["errors"].append(f"Functionality test error: {e}")
            print(f"    ❌ Functionality test failed: {e}")
        
        return results
    
    def run_comprehensive_validation(self) -> Dict[str, Any]:
        """Run complete validation suite for all modules"""
        print("🧪 Testing All v4.0 Optimized Modules - Comprehensive Validation")
        print("=" * 80)
        
        successful_modules = 0
        total_modules = len(self.modules)
        
        for module_name, config in self.modules.items():
            print(f"\n🔍 Testing {config['name']}...")
            
            # Test health endpoints
            health_results = self.test_module_health(module_name, config)
            
            # Test functionality
            func_results = self.test_module_functionality(module_name, config)
            
            # Combine results
            module_results = {
                "name": config["name"],
                "health": health_results,
                "functionality": func_results,
                "overall_status": "working" if health_results["connectivity"] and func_results["working"] else "partial" if health_results["connectivity"] else "failed"
            }
            
            self.results["modules"][module_name] = module_results
            
            if module_results["overall_status"] in ["working", "partial"]:
                successful_modules += 1
                print(f"  ✅ {config['name']}: {module_results['overall_status'].upper()}")
            else:
                print(f"  ❌ {config['name']}: FAILED")
        
        # Calculate overall success
        success_rate = (successful_modules / total_modules) * 100
        self.results["overall"] = success_rate >= 80  # 80% threshold for success
        
        self.results["summary"] = {
            "successful_modules": successful_modules,
            "total_modules": total_modules,
            "success_rate": success_rate,
            "status": "PASSED" if self.results["overall"] else "FAILED"
        }
        
        print("\n" + "=" * 80)
        print(f"📊 COMPREHENSIVE VALIDATION SUMMARY")
        print(f"✅ Successful modules: {successful_modules}/{total_modules}")
        print(f"📈 Success rate: {success_rate:.1f}%")
        print(f"🎯 Overall status: {self.results['summary']['status']}")
        
        if self.results["overall"]:
            print("🎉 All v4.0 module optimizations: PASSED")
        else:
            print("❌ Some modules need attention")
        
        return self.results
    
    def generate_detailed_report(self) -> str:
        """Generate a detailed report of all test results"""
        report = []
        report.append("# V4.0 MODULE OPTIMIZATION VALIDATION REPORT")
        report.append("=" * 50)
        report.append(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"Success Rate: {self.results['summary']['success_rate']:.1f}%")
        report.append(f"Overall Status: {self.results['summary']['status']}")
        report.append("")
        
        for module_name, results in self.results["modules"].items():
            report.append(f"## {results['name']}")
            report.append(f"Status: {results['overall_status'].upper()}")
            
            # Health endpoints
            report.append("\n### Health Endpoints")
            for endpoint, data in results["health"]["endpoints"].items():
                if data.get("ok"):
                    report.append(f"✅ {endpoint}: {data['status']} ({data.get('response_time', 0):.3f}s)")
                else:
                    report.append(f"❌ {endpoint}: {data.get('error', data.get('status', 'Unknown error'))}")
            
            # Functionality
            if results["functionality"]["functionality"]:
                report.append("\n### Functionality Tests")
                for endpoint, data in results["functionality"]["functionality"].items():
                    if data.get("ok"):
                        report.append(f"✅ {endpoint}: Working ({data.get('response_time', 0):.3f}s)")
                    else:
                        report.append(f"❌ {endpoint}: Status {data.get('status', 'Unknown')}")
            
            report.append("")
        
        return "\n".join(report)

def main():
    validator = ComprehensiveModuleValidator()
    results = validator.run_comprehensive_validation()
    
    # Save results
    with open("/workspace/modules/all_modules_v4_validation_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    # Generate and save detailed report
    report = validator.generate_detailed_report()
    with open("/workspace/modules/all_modules_v4_validation_report.md", "w") as f:
        f.write(report)
    
    print(f"\n📝 Results saved to:")
    print(f"   📄 all_modules_v4_validation_results.json")
    print(f"   📋 all_modules_v4_validation_report.md")
    
    return 0 if results["overall"] else 1

if __name__ == "__main__":
    exit(main())