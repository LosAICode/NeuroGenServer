#!/usr/bin/env python3
"""Test script to verify file_utils routes are working"""

import sys
sys.path.insert(0, '/workspace/modules')

try:
    from app_new import create_app
    
    app, socketio = create_app()
    
    print("=== File Utils Routes ===")
    file_util_routes = []
    for rule in app.url_map.iter_rules():
        if any(path in rule.rule for path in ['/detect-path', '/verify-path', '/create-directory', 
                                             '/get-output-filepath', '/check-file-exists', 
                                             '/get-default-output-folder', '/open-file', '/open-folder',
                                             '/upload-for-path-detection']):
            file_util_routes.append(rule.rule)
            print(f"{rule.rule} -> {rule.endpoint} [{', '.join(rule.methods - {'HEAD', 'OPTIONS'})}]")
    
    print(f"\nFile Utils routes found: {len(file_util_routes)}")
    print(f"Total routes: {len(list(app.url_map.iter_rules()))}")
    print("✅ File utils blueprint loaded successfully")
    
except Exception as e:
    print(f"❌ Error loading file utils: {e}")
    import traceback
    traceback.print_exc()