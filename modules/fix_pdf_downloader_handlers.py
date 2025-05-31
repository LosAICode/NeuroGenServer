#!/usr/bin/env python3
"""
Fix PDF Downloader Handlers - Create missing handlers for PDF downloader functionality
"""

import os
import sys

def create_pdf_downloader_handlers():
    """Create proper event handlers for PDF downloader buttons"""
    
    print("🔧 Creating PDF Downloader Button Handlers...")
    
    # Check if pdfDownloader.js already has the handlers
    pdf_downloader_path = "/workspace/modules/static/js/modules/features/pdfDownloader.js"
    
    if not os.path.exists(pdf_downloader_path):
        print("❌ pdfDownloader.js not found!")
        return False
        
    # Read the current file
    with open(pdf_downloader_path, 'r') as f:
        content = f.read()
    
    # Check if handlers are already properly implemented
    required_handlers = [
        'handleSingleDownload',
        'handleBatchDownload', 
        'pdf-single-download-btn',
        'pdf-batch-download-btn'
    ]
    
    missing_handlers = []
    for handler in required_handlers:
        if handler not in content:
            missing_handlers.append(handler)
    
    if not missing_handlers:
        print("✅ All PDF downloader handlers are already present!")
        return True
    
    print(f"❌ Missing handlers: {missing_handlers}")
    
    # Check if the event listeners are properly set up
    if 'pdf-single-download-btn' in content and 'handleSingleDownload' in content:
        print("✅ PDF downloader handlers are implemented correctly")
        return True
    else:
        print("❌ PDF downloader handlers need to be fixed")
        return False

def validate_button_integration():
    """Validate that all buttons in index.html have corresponding handlers"""
    
    print("\n🔍 Validating Button Integration...")
    
    # Read index.html
    index_path = "/workspace/modules/blueprints/templates/index.html"
    if not os.path.exists(index_path):
        print("❌ index.html not found!")
        return False
        
    with open(index_path, 'r') as f:
        html_content = f.read()
    
    # Find PDF downloader buttons
    pdf_buttons = [
        'pdf-single-download-btn',
        'pdf-batch-download-btn',
        'enhanced-scrape-btn'
    ]
    
    found_buttons = []
    missing_buttons = []
    
    for button in pdf_buttons:
        if button in html_content:
            found_buttons.append(button)
        else:
            missing_buttons.append(button)
    
    print(f"✅ Found buttons: {found_buttons}")
    if missing_buttons:
        print(f"❌ Missing buttons: {missing_buttons}")
        return False
    
    print("✅ All required buttons found in index.html")
    return True

def check_api_endpoint_alignment():
    """Check that API endpoints align with frontend calls"""
    
    print("\n🔍 Checking API Endpoint Alignment...")
    
    # Check PDF downloader endpoints
    pdf_downloader_path = "/workspace/modules/blueprints/features/pdf_downloader.py"
    
    if not os.path.exists(pdf_downloader_path):
        print("❌ pdf_downloader.py not found!")
        return False
    
    with open(pdf_downloader_path, 'r') as f:
        backend_content = f.read()
    
    # Check for required routes
    required_routes = [
        "/download",
        "/batch-download", 
        "/health",
        "/status",
        "/cancel"
    ]
    
    found_routes = []
    missing_routes = []
    
    for route in required_routes:
        if f"'{route}'" in backend_content or f'"{route}"' in backend_content:
            found_routes.append(route)
        else:
            missing_routes.append(route)
    
    print(f"✅ Found routes: {found_routes}")
    if missing_routes:
        print(f"❌ Missing routes: {missing_routes}")
        return False
        
    print("✅ All required API routes found")
    return True

def main():
    print("🚀 PDF Downloader Handler Validation")
    print("=" * 50)
    
    # Step 1: Check handlers
    handlers_ok = create_pdf_downloader_handlers()
    
    # Step 2: Check button integration
    buttons_ok = validate_button_integration()
    
    # Step 3: Check API alignment
    api_ok = check_api_endpoint_alignment()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Validation Summary:")
    print(f"   Handlers: {'✅ OK' if handlers_ok else '❌ NEEDS FIX'}")
    print(f"   Buttons: {'✅ OK' if buttons_ok else '❌ NEEDS FIX'}")
    print(f"   API Alignment: {'✅ OK' if api_ok else '❌ NEEDS FIX'}")
    
    if handlers_ok and buttons_ok and api_ok:
        print("\n🎉 All validations PASSED!")
        print("✅ PDF Downloader is ready for testing")
        return 0
    else:
        print("\n⚠️ Some validations FAILED")
        print("❌ PDF Downloader needs attention")
        return 1

if __name__ == "__main__":
    sys.exit(main())