#!/usr/bin/env python3
"""
Comprehensive validation script for core frontend modules
Analyzes all modules in static/js/modules/core for architecture consistency,
integration patterns, and optimization opportunities
"""

import os
import json
import re
from typing import Dict, List, Any, Optional
from pathlib import Path

class CoreModulesAnalyzer:
    def __init__(self):
        self.core_modules_path = "/workspace/modules/static/js/modules/core"
        self.analysis_results = {
            "overview": {},
            "modules": {},
            "patterns": {},
            "optimization_opportunities": [],
            "integration_analysis": {},
            "recommendations": []
        }
        
        # Expected core module patterns
        self.expected_patterns = {
            "import_statements": r"import\s+.*?from\s+['\"].*?['\"];?",
            "export_statements": r"export\s+.*?;?",
            "class_definitions": r"class\s+\w+\s*{",
            "function_definitions": r"function\s+\w+\s*\(",
            "configuration_usage": r"CONFIG\.|CONSTANTS\.|API_ENDPOINTS\.",
            "error_handling": r"try\s*{|catch\s*\(|showNotification|errorHandler",
            "health_monitoring": r"healthMonitor|getHealthStatus|testConnectivity",
            "event_handling": r"addEventListener|on\(|emit\(|eventRegistry",
            "dom_manipulation": r"document\.|querySelector|getElementById",
            "module_exports": r"export\s+default|export\s+{",
            "version_info": r"@version|version\s*:",
            "documentation": r"\/\*\*|\*\s*@"
        }
    
    def analyze_file_structure(self, file_path: str) -> Dict[str, Any]:
        """Analyze the structure and patterns of a JavaScript file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            analysis = {
                "file": os.path.basename(file_path),
                "size": len(content),
                "lines": len(content.split('\n')),
                "patterns_found": {},
                "imports": [],
                "exports": [],
                "functions": [],
                "classes": [],
                "has_documentation": False,
                "has_error_handling": False,
                "has_health_monitoring": False,
                "has_configuration": False,
                "optimization_level": "unknown",
                "architecture_compliance": "unknown"
            }
            
            # Analyze patterns
            for pattern_name, pattern in self.expected_patterns.items():
                matches = re.findall(pattern, content, re.MULTILINE | re.IGNORECASE)
                analysis["patterns_found"][pattern_name] = len(matches)
                
                # Extract specific information
                if pattern_name == "import_statements":
                    analysis["imports"] = [match.strip() for match in matches[:10]]  # First 10
                elif pattern_name == "export_statements":
                    analysis["exports"] = [match.strip() for match in matches[:10]]
                elif pattern_name == "function_definitions":
                    analysis["functions"] = [match.strip() for match in matches[:10]]
                elif pattern_name == "class_definitions":
                    analysis["classes"] = [match.strip() for match in matches[:5]]
            
            # Determine characteristics
            analysis["has_documentation"] = analysis["patterns_found"]["documentation"] > 0
            analysis["has_error_handling"] = analysis["patterns_found"]["error_handling"] > 0
            analysis["has_health_monitoring"] = analysis["patterns_found"]["health_monitoring"] > 0
            analysis["has_configuration"] = analysis["patterns_found"]["configuration_usage"] > 0
            
            # Determine optimization level based on patterns
            optimization_score = 0
            if analysis["has_configuration"]:
                optimization_score += 2  # Configuration-driven
            if analysis["has_error_handling"]:
                optimization_score += 2  # Error handling
            if analysis["has_health_monitoring"]:
                optimization_score += 2  # Health monitoring
            if analysis["has_documentation"]:
                optimization_score += 1  # Documentation
            if analysis["patterns_found"]["module_exports"] > 0:
                optimization_score += 1  # Proper exports
            
            if optimization_score >= 6:
                analysis["optimization_level"] = "v4.0_ready"
            elif optimization_score >= 4:
                analysis["optimization_level"] = "v3.0_ready"
            elif optimization_score >= 2:
                analysis["optimization_level"] = "basic"
            else:
                analysis["optimization_level"] = "needs_work"
            
            return analysis
            
        except Exception as e:
            return {
                "file": os.path.basename(file_path),
                "error": str(e),
                "analysis_failed": True
            }
    
    def analyze_module_relationships(self) -> Dict[str, Any]:
        """Analyze how core modules interact with each other"""
        relationships = {
            "import_graph": {},
            "dependency_cycles": [],
            "isolated_modules": [],
            "hub_modules": [],
            "integration_score": 0
        }
        
        # This would require more complex analysis of import statements
        # For now, provide a basic structure
        core_modules = [
            "app.js", "moduleLoader.js", "stateManager.js", "errorHandler.js",
            "healthMonitor.js", "eventManager.js", "uiRegistry.js", "themeManager.js"
        ]
        
        for module in core_modules:
            relationships["import_graph"][module] = {
                "imports_from": [],
                "imported_by": [],
                "external_dependencies": []
            }
        
        return relationships
    
    def identify_optimization_opportunities(self) -> List[Dict[str, Any]]:
        """Identify optimization opportunities across core modules"""
        opportunities = []
        
        for module_name, analysis in self.analysis_results["modules"].items():
            if not analysis.get("analysis_failed", False):
                # Check for v4.0 optimization opportunities
                if analysis["optimization_level"] in ["basic", "needs_work"]:
                    opportunities.append({
                        "module": module_name,
                        "type": "architecture_upgrade",
                        "priority": "high",
                        "description": f"Upgrade {module_name} to v4.0 Blueprint architecture",
                        "benefits": [
                            "Configuration-driven endpoints",
                            "Enhanced error handling",
                            "Health monitoring integration",
                            "Better documentation"
                        ]
                    })
                
                # Check for configuration opportunities
                if not analysis["has_configuration"]:
                    opportunities.append({
                        "module": module_name,
                        "type": "configuration_integration",
                        "priority": "medium",
                        "description": f"Add centralized configuration support to {module_name}",
                        "benefits": ["Eliminate hardcoded values", "Easier maintenance"]
                    })
                
                # Check for error handling
                if not analysis["has_error_handling"]:
                    opportunities.append({
                        "module": module_name,
                        "type": "error_handling",
                        "priority": "medium", 
                        "description": f"Add enhanced error handling to {module_name}",
                        "benefits": ["Better user experience", "Easier debugging"]
                    })
                
                # Check for health monitoring
                if not analysis["has_health_monitoring"]:
                    opportunities.append({
                        "module": module_name,
                        "type": "health_monitoring",
                        "priority": "low",
                        "description": f"Add health monitoring support to {module_name}",
                        "benefits": ["Better system observability", "Proactive issue detection"]
                    })
        
        return opportunities
    
    def run_comprehensive_analysis(self) -> Dict[str, Any]:
        """Run complete analysis of all core modules"""
        print("🔍 Analyzing Core Frontend Modules")
        print("=" * 60)
        
        # Get list of all core modules
        try:
            core_files = [f for f in os.listdir(self.core_modules_path) if f.endswith('.js')]
            self.analysis_results["overview"] = {
                "total_modules": len(core_files),
                "analysis_timestamp": "2025-05-31",
                "analyzer_version": "1.0.0"
            }
            
            print(f"📁 Found {len(core_files)} core modules to analyze")
            
        except Exception as e:
            print(f"❌ Error accessing core modules directory: {e}")
            return self.analysis_results
        
        # Analyze each module
        optimized_count = 0
        ready_count = 0
        needs_work_count = 0
        
        for file_name in sorted(core_files):
            file_path = os.path.join(self.core_modules_path, file_name)
            print(f"\n🔍 Analyzing {file_name}...")
            
            analysis = self.analyze_file_structure(file_path)
            self.analysis_results["modules"][file_name] = analysis
            
            if not analysis.get("analysis_failed", False):
                # Print analysis summary
                opt_level = analysis["optimization_level"]
                print(f"   📊 Size: {analysis['size']} bytes, {analysis['lines']} lines")
                print(f"   🏗️  Optimization Level: {opt_level}")
                print(f"   ⚙️  Configuration: {'✅' if analysis['has_configuration'] else '❌'}")
                print(f"   🚨 Error Handling: {'✅' if analysis['has_error_handling'] else '❌'}")
                print(f"   🏥 Health Monitoring: {'✅' if analysis['has_health_monitoring'] else '❌'}")
                print(f"   📚 Documentation: {'✅' if analysis['has_documentation'] else '❌'}")
                
                # Count optimization levels
                if opt_level == "v4.0_ready":
                    optimized_count += 1
                    print(f"   ✅ Status: OPTIMIZED")
                elif opt_level in ["v3.0_ready", "basic"]:
                    ready_count += 1
                    print(f"   🟡 Status: READY FOR OPTIMIZATION")
                else:
                    needs_work_count += 1
                    print(f"   ❌ Status: NEEDS SIGNIFICANT WORK")
            else:
                needs_work_count += 1
                print(f"   ❌ Analysis failed: {analysis.get('error', 'Unknown error')}")
        
        # Analyze relationships
        print(f"\n🔗 Analyzing module relationships...")
        self.analysis_results["integration_analysis"] = self.analyze_module_relationships()
        
        # Identify optimization opportunities
        print(f"\n🎯 Identifying optimization opportunities...")
        self.analysis_results["optimization_opportunities"] = self.identify_optimization_opportunities()
        
        # Generate summary
        total_modules = len(core_files)
        self.analysis_results["summary"] = {
            "total_modules": total_modules,
            "optimized_modules": optimized_count,
            "ready_modules": ready_count,
            "needs_work_modules": needs_work_count,
            "optimization_rate": (optimized_count / total_modules) * 100 if total_modules > 0 else 0,
            "optimization_opportunities": len(self.analysis_results["optimization_opportunities"]),
            "overall_status": self.determine_overall_status(optimized_count, ready_count, needs_work_count, total_modules)
        }
        
        # Generate recommendations
        self.generate_recommendations()
        
        return self.analysis_results
    
    def determine_overall_status(self, optimized: int, ready: int, needs_work: int, total: int) -> str:
        """Determine overall status of core modules"""
        if optimized / total >= 0.8:
            return "excellent"
        elif (optimized + ready) / total >= 0.8:
            return "good"
        elif (optimized + ready) / total >= 0.6:
            return "fair"
        else:
            return "needs_improvement"
    
    def generate_recommendations(self):
        """Generate recommendations based on analysis"""
        summary = self.analysis_results["summary"]
        recommendations = []
        
        if summary["optimization_rate"] < 50:
            recommendations.append({
                "priority": "high",
                "category": "architecture",
                "title": "Core Module Architecture Upgrade",
                "description": "Apply v4.0 Blueprint architecture pattern to core modules",
                "action": "Systematically upgrade modules following the proven pattern established in feature modules"
            })
        
        if summary["optimization_opportunities"] > 10:
            recommendations.append({
                "priority": "medium",
                "category": "optimization",
                "title": "Batch Optimization Opportunity",
                "description": f"Found {summary['optimization_opportunities']} optimization opportunities",
                "action": "Prioritize and batch optimize modules for efficiency"
            })
        
        if summary["overall_status"] in ["fair", "needs_improvement"]:
            recommendations.append({
                "priority": "high",
                "category": "quality",
                "title": "Core Module Quality Improvement",
                "description": "Core modules need systematic improvement for production readiness",
                "action": "Implement comprehensive error handling, configuration management, and documentation"
            })
        
        self.analysis_results["recommendations"] = recommendations
    
    def print_summary_report(self):
        """Print a comprehensive summary report"""
        summary = self.analysis_results["summary"]
        
        print("\n" + "=" * 60)
        print("📊 CORE MODULES ANALYSIS SUMMARY")
        print("=" * 60)
        
        print(f"📁 Total Core Modules: {summary['total_modules']}")
        print(f"✅ Optimized Modules: {summary['optimized_modules']} ({summary['optimization_rate']:.1f}%)")
        print(f"🟡 Ready for Optimization: {summary['ready_modules']}")
        print(f"❌ Needs Significant Work: {summary['needs_work_modules']}")
        print(f"🎯 Optimization Opportunities: {summary['optimization_opportunities']}")
        print(f"🏆 Overall Status: {summary['overall_status'].upper()}")
        
        # Print top modules by optimization level
        optimized_modules = [
            name for name, analysis in self.analysis_results["modules"].items()
            if analysis.get("optimization_level") == "v4.0_ready"
        ]
        
        if optimized_modules:
            print(f"\n🌟 Well-Optimized Modules:")
            for module in optimized_modules[:5]:
                print(f"   ✅ {module}")
        
        # Print modules needing attention
        needs_attention = [
            name for name, analysis in self.analysis_results["modules"].items()
            if analysis.get("optimization_level") in ["needs_work", "basic"]
        ]
        
        if needs_attention:
            print(f"\n🔧 Modules Needing Optimization:")
            for module in needs_attention[:5]:
                print(f"   🔧 {module}")
        
        # Print top recommendations
        if self.analysis_results["recommendations"]:
            print(f"\n💡 TOP RECOMMENDATIONS:")
            for i, rec in enumerate(self.analysis_results["recommendations"][:3], 1):
                print(f"   {i}. {rec['title']} ({rec['priority']} priority)")
                print(f"      {rec['description']}")

def main():
    analyzer = CoreModulesAnalyzer()
    results = analyzer.run_comprehensive_analysis()
    
    # Print summary report
    analyzer.print_summary_report()
    
    # Save detailed results
    output_file = "/workspace/modules/core_modules_analysis_results.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n📝 Detailed analysis saved to: core_modules_analysis_results.json")
    
    # Determine exit code based on overall status
    overall_status = results["summary"]["overall_status"]
    if overall_status in ["excellent", "good"]:
        return 0
    else:
        return 1

if __name__ == "__main__":
    exit(main())