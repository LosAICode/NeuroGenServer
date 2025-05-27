"""
Comprehensive Module Diagnostics System for NeuroGen Server
Provides detailed analysis of module loading, dependencies, and health status
"""

import os
import sys
import json
import time
import traceback
import importlib
import importlib.util
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

class ModuleDiagnostics:
    def __init__(self, base_path: str = None):
        self.base_path = base_path or os.path.dirname(os.path.abspath(__file__))
        self.static_path = os.path.join(self.base_path, 'static', 'js')
        self.modules_path = os.path.join(self.static_path, 'modules')
        
        # Module categories
        self.module_categories = {
            'core': [
                'errorHandler', 'uiRegistry', 'stateManager', 
                'eventRegistry', 'eventManager', 'themeManager',
                'module-bridge', 'ui', 'domUtils', 'app'
            ],
            'utils': [
                'socketHandler', 'progressHandler', 'ui', 'utils',
                'fileHandler', 'domUtils', 'moduleDiagnostics',
                'systemHealth', 'debugTools'
            ],
            'features': [
                'fileProcessor', 'webScraper', 'playlistDownloader',
                'academicSearch', 'academicScraper', 'academicApiClient',
                'historyManager', 'pdfProcessor', 'helpMode',
                'performanceOptimizer', 'keyboardShortcuts', 'dragDropHandler'
            ]
        }
        
        # Known dependencies
        self.module_dependencies = {
            'fileProcessor': ['progressHandler', 'ui', 'errorHandler', 'historyManager'],
            'webScraper': ['progressHandler', 'socketHandler', 'ui'],
            'playlistDownloader': ['progressHandler', 'socketHandler'],
            'academicSearch': ['webScraper', 'ui', 'errorHandler'],
            'progressHandler': ['socketHandler'],
            'ui': ['domUtils', 'module-bridge'],
            'app': ['errorHandler', 'stateManager', 'eventManager']
        }
        
    def get_comprehensive_diagnostics(self) -> Dict[str, Any]:
        """Generate comprehensive diagnostics report"""
        start_time = time.time()
        
        report = {
            'timestamp': datetime.now().isoformat(),
            'environment': self._get_environment_info(),
            'moduleSystem': self._analyze_module_system(),
            'dependencies': self._analyze_dependencies(),
            'fileSystem': self._analyze_file_system(),
            'apiEndpoints': self._get_api_endpoints(),
            'recommendations': [],
            'executionTime': 0
        }
        
        # Add recommendations based on findings
        report['recommendations'] = self._generate_recommendations(report)
        report['executionTime'] = round((time.time() - start_time) * 1000, 2)
        
        return report
        
    def _get_environment_info(self) -> Dict[str, Any]:
        """Get environment and system information"""
        return {
            'python': {
                'version': sys.version,
                'executable': sys.executable,
                'path': sys.path
            },
            'server': {
                'basePath': self.base_path,
                'staticPath': self.static_path,
                'modulesPath': self.modules_path,
                'workingDir': os.getcwd()
            },
            'system': {
                'platform': sys.platform,
                'nodeEnv': os.environ.get('NODE_ENV', 'production')
            }
        }
        
    def _analyze_module_system(self) -> Dict[str, Any]:
        """Analyze the module system structure and health"""
        analysis = {
            'structure': {},
            'health': {},
            'issues': [],
            'statistics': {
                'total': 0,
                'found': 0,
                'missing': 0,
                'errors': 0
            }
        }
        
        for category, modules in self.module_categories.items():
            analysis['structure'][category] = {}
            
            for module in modules:
                module_info = self._analyze_module(category, module)
                analysis['structure'][category][module] = module_info
                
                # Update statistics
                analysis['statistics']['total'] += 1
                if module_info['exists']:
                    analysis['statistics']['found'] += 1
                else:
                    analysis['statistics']['missing'] += 1
                    
                if module_info['errors']:
                    analysis['statistics']['errors'] += 1
                    analysis['issues'].extend(module_info['errors'])
                    
        # Check for common issues
        analysis['health'] = self._check_module_health(analysis['structure'])
        
        return analysis
        
    def _analyze_module(self, category: str, module_name: str) -> Dict[str, Any]:
        """Analyze individual module"""
        module_path = os.path.join(self.modules_path, category, f"{module_name}.js")
        
        info = {
            'name': module_name,
            'category': category,
            'path': module_path,
            'relativePath': f'./modules/{category}/{module_name}.js',
            'exists': os.path.exists(module_path),
            'size': 0,
            'modified': None,
            'exports': [],
            'imports': [],
            'errors': [],
            'warnings': []
        }
        
        if info['exists']:
            try:
                # Get file stats
                stat = os.stat(module_path)
                info['size'] = stat.st_size
                info['modified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()
                
                # Analyze file content
                with open(module_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    info.update(self._analyze_js_content(content, module_name))
                    
            except Exception as e:
                info['errors'].append({
                    'type': 'READ_ERROR',
                    'message': str(e),
                    'traceback': traceback.format_exc()
                })
                
        else:
            info['errors'].append({
                'type': 'MODULE_NOT_FOUND',
                'message': f'Module file not found: {module_path}'
            })
            
        return info
        
    def _analyze_js_content(self, content: str, module_name: str) -> Dict[str, Any]:
        """Analyze JavaScript module content"""
        analysis = {
            'exports': [],
            'imports': [],
            'hasDefaultExport': False,
            'hasNamedExports': False,
            'hasInitMethod': False,
            'syntaxIssues': []
        }
        
        try:
            # Check for exports
            if 'export default' in content:
                analysis['hasDefaultExport'] = True
                analysis['exports'].append('default')
                
            # Find named exports
            import re
            named_exports = re.findall(r'export\s+(?:const|let|var|function|class)\s+(\w+)', content)
            if named_exports:
                analysis['hasNamedExports'] = True
                analysis['exports'].extend(named_exports)
                
            # Find export statements
            export_statements = re.findall(r'export\s*{\s*([^}]+)\s*}', content)
            for stmt in export_statements:
                exports = [e.strip() for e in stmt.split(',')]
                analysis['exports'].extend(exports)
                
            # Find imports
            import_patterns = [
                r"import\s+.*?\s+from\s+['\"]([^'\"]+)['\"]",
                r"import\s*\(['\"]([^'\"]+)['\"]\)",
                r"import\s+['\"]([^'\"]+)['\"]"
            ]
            
            for pattern in import_patterns:
                imports = re.findall(pattern, content)
                analysis['imports'].extend(imports)
                
            # Check for initialize method
            if re.search(r'initialize\s*[:=]\s*(?:async\s+)?function|\bfunction\s+initialize\b|initialize\s*\(', content):
                analysis['hasInitMethod'] = True
                
            # Check for common syntax issues
            self._check_syntax_issues(content, analysis)
            
        except Exception as e:
            analysis['syntaxIssues'].append({
                'type': 'ANALYSIS_ERROR',
                'message': str(e)
            })
            
        return analysis
        
    def _check_syntax_issues(self, content: str, analysis: Dict[str, Any]):
        """Check for common syntax issues"""
        lines = content.split('\n')
        
        # Check for common issues
        for i, line in enumerate(lines, 1):
            # Check for trailing commas in objects/arrays
            if re.search(r',\s*[}\]]', line):
                analysis['syntaxIssues'].append({
                    'line': i,
                    'type': 'TRAILING_COMMA',
                    'message': 'Possible trailing comma'
                })
                
            # Check for missing semicolons (simplified)
            if re.search(r'[^{};,\s]\s*$', line) and not re.search(r'(if|else|for|while|function|class|try|catch)\s*\(.*\)\s*$', line):
                if i < len(lines) and not lines[i].strip().startswith(('.', '[', '(', '{', '}', '+', '-', '*', '/')):
                    analysis['syntaxIssues'].append({
                        'line': i,
                        'type': 'MISSING_SEMICOLON',
                        'message': 'Possible missing semicolon'
                    })
                    
    def _analyze_dependencies(self) -> Dict[str, Any]:
        """Analyze module dependencies"""
        analysis = {
            'graph': {},
            'circular': [],
            'missing': [],
            'orphaned': []
        }
        
        # Build dependency graph
        for module, deps in self.module_dependencies.items():
            analysis['graph'][module] = {
                'dependencies': deps,
                'dependents': []
            }
            
        # Find dependents
        for module, info in analysis['graph'].items():
            for dep in info['dependencies']:
                if dep in analysis['graph']:
                    analysis['graph'][dep]['dependents'].append(module)
                    
        # Check for circular dependencies
        for module in analysis['graph']:
            circles = self._find_circular_deps(module, analysis['graph'])
            for circle in circles:
                if circle not in analysis['circular']:
                    analysis['circular'].append(circle)
                    
        # Find missing dependencies
        all_modules = set()
        for category, modules in self.module_categories.items():
            all_modules.update(modules)
            
        for module, info in analysis['graph'].items():
            for dep in info['dependencies']:
                if dep not in all_modules:
                    analysis['missing'].append({
                        'module': module,
                        'dependency': dep
                    })
                    
        # Find orphaned modules (no dependents and not entry points)
        entry_points = ['app', 'index']
        for module in all_modules:
            if module not in analysis['graph'] or not analysis['graph'].get(module, {}).get('dependents'):
                if module not in entry_points:
                    analysis['orphaned'].append(module)
                    
        return analysis
        
    def _find_circular_deps(self, module: str, graph: Dict, visited: set = None, path: list = None) -> List[List[str]]:
        """Find circular dependencies"""
        if visited is None:
            visited = set()
        if path is None:
            path = []
            
        if module in path:
            # Found a circle
            circle_start = path.index(module)
            return [path[circle_start:] + [module]]
            
        if module in visited:
            return []
            
        visited.add(module)
        path.append(module)
        
        circles = []
        if module in graph:
            for dep in graph[module]['dependencies']:
                circles.extend(self._find_circular_deps(dep, graph, visited, path.copy()))
                
        return circles
        
    def _analyze_file_system(self) -> Dict[str, Any]:
        """Analyze file system structure"""
        analysis = {
            'structure': {},
            'duplicates': [],
            'backups': [],
            'issues': []
        }
        
        # Scan module directories
        for category in self.module_categories:
            category_path = os.path.join(self.modules_path, category)
            if os.path.exists(category_path):
                analysis['structure'][category] = self._scan_directory(category_path)
                
        # Find duplicates and backups
        all_files = {}
        for category, files in analysis['structure'].items():
            for file in files:
                base_name = file['name'].replace('.bak', '').replace('.backup', '').replace('.original', '').replace('.beta', '')
                if base_name not in all_files:
                    all_files[base_name] = []
                all_files[base_name].append({
                    'category': category,
                    'file': file
                })
                
        for base_name, occurrences in all_files.items():
            if len(occurrences) > 1:
                analysis['duplicates'].append({
                    'baseName': base_name,
                    'occurrences': occurrences
                })
                
            for occ in occurrences:
                if any(ext in occ['file']['name'] for ext in ['.bak', '.backup', '.original', '.beta']):
                    analysis['backups'].append(occ)
                    
        return analysis
        
    def _scan_directory(self, path: str) -> List[Dict[str, Any]]:
        """Scan directory for files"""
        files = []
        try:
            for entry in os.listdir(path):
                if entry.endswith('.js'):
                    file_path = os.path.join(path, entry)
                    stat = os.stat(file_path)
                    files.append({
                        'name': entry,
                        'path': file_path,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        except Exception as e:
            pass
            
        return files
        
    def _get_api_endpoints(self) -> Dict[str, Any]:
        """Get API endpoints information"""
        return {
            'fileProcessor': {
                'process': '/api/process',
                'status': '/api/status/<task_id>',
                'download': '/api/download/<task_id>',
                'verifyPath': '/api/verify-path',
                'createDirectory': '/api/create-directory'
            },
            'playlistDownloader': {
                'start': '/api/start-playlists',
                'status': '/api/playlist/status/<task_id>',
                'cancel': '/api/playlist/cancel/<task_id>'
            },
            'webScraper': {
                'scrape': '/api/scrape2',
                'status': '/api/scrape2/status/<task_id>',
                'cancel': '/api/scrape2/cancel/<task_id>'
            },
            'academicSearch': {
                'health': '/api/academic/health',
                'search': '/api/academic/search',
                'multiSource': '/api/academic/multi-source',
                'details': '/api/academic/details/<id>',
                'download': '/api/academic/download/<id>',
                'citations': '/api/academic/citations/<id>',
                'recommendations': '/api/academic/recommendations/<id>',
                'bulkDownload': '/api/academic/bulk/download',
                'analyze': '/api/academic/analyze/<id>',
                'extract': '/api/academic/extract'
            }
        }
        
    def _check_module_health(self, structure: Dict[str, Any]) -> Dict[str, Any]:
        """Check overall module system health"""
        health = {
            'status': 'healthy',
            'issues': [],
            'criticalModules': {
                'missing': [],
                'errored': []
            }
        }
        
        # Critical modules that must exist
        critical_modules = [
            ('core', 'errorHandler'),
            ('core', 'moduleLoader'),
            ('core', 'app'),
            ('utils', 'socketHandler'),
            ('utils', 'progressHandler')
        ]
        
        for category, module in critical_modules:
            if category in structure and module in structure[category]:
                module_info = structure[category][module]
                if not module_info['exists']:
                    health['criticalModules']['missing'].append(f"{category}/{module}")
                    health['status'] = 'critical'
                elif module_info['errors']:
                    health['criticalModules']['errored'].append(f"{category}/{module}")
                    health['status'] = 'warning' if health['status'] != 'critical' else 'critical'
                    
        # Check for common issues
        total_modules = sum(len(modules) for modules in self.module_categories.values())
        found_modules = sum(1 for cat in structure.values() for mod in cat.values() if mod['exists'])
        
        if found_modules < total_modules * 0.8:
            health['issues'].append({
                'type': 'LOW_MODULE_COVERAGE',
                'message': f'Only {found_modules}/{total_modules} modules found',
                'severity': 'warning'
            })
            
        return health
        
    def _generate_recommendations(self, report: Dict[str, Any]) -> List[Dict[str, str]]:
        """Generate recommendations based on diagnostics"""
        recommendations = []
        
        # Check module system
        module_stats = report['moduleSystem']['statistics']
        if module_stats['missing'] > 0:
            recommendations.append({
                'priority': 'high',
                'category': 'modules',
                'message': f"Missing {module_stats['missing']} modules. Check file paths and build process.",
                'action': 'Verify module files exist in the correct directories'
            })
            
        if module_stats['errors'] > 0:
            recommendations.append({
                'priority': 'high',
                'category': 'errors',
                'message': f"Found {module_stats['errors']} modules with errors.",
                'action': 'Review error logs and fix syntax/import issues'
            })
            
        # Check dependencies
        if report['dependencies']['circular']:
            recommendations.append({
                'priority': 'medium',
                'category': 'dependencies',
                'message': f"Found {len(report['dependencies']['circular'])} circular dependencies.",
                'action': 'Refactor modules to break circular dependencies'
            })
            
        if report['dependencies']['missing']:
            recommendations.append({
                'priority': 'high',
                'category': 'dependencies',
                'message': f"Found {len(report['dependencies']['missing'])} missing dependencies.",
                'action': 'Install or create missing dependency modules'
            })
            
        # Check file system
        if report['fileSystem']['backups']:
            recommendations.append({
                'priority': 'low',
                'category': 'cleanup',
                'message': f"Found {len(report['fileSystem']['backups'])} backup files.",
                'action': 'Consider removing old backup files to reduce clutter'
            })
            
        # Performance recommendations
        if report['executionTime'] > 1000:
            recommendations.append({
                'priority': 'low',
                'category': 'performance',
                'message': 'Diagnostics took over 1 second to complete.',
                'action': 'Consider caching diagnostic results for better performance'
            })
            
        return recommendations

# Singleton instance
diagnostics = ModuleDiagnostics()

def get_diagnostics_report():
    """Get comprehensive diagnostics report"""
    return diagnostics.get_comprehensive_diagnostics()