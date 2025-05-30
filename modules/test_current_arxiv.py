#!/usr/bin/env python3
"""
Test script to validate current arXiv integration
Tests the existing web scraper functionality for arXiv URLs
"""

import sys
import os
sys.path.append('/workspace/modules')

def test_arxiv_pdf_discovery():
    """Test arXiv PDF link discovery from abstract page"""
    
    # Test URLs
    arxiv_abstract_url = "https://arxiv.org/abs/2301.00001"  # Example arXiv abstract
    arxiv_pdf_url = "https://arxiv.org/pdf/2301.00001.pdf"  # Direct PDF
    
    print("🧪 Testing Current arXiv Integration")
    print("=" * 50)
    
    # Test 1: Import the web scraper module
    print("\n1. Testing module imports...")
    try:
        from blueprints.features.web_scraper import process_url, fetch_pdf_links
        print("✅ Successfully imported web_scraper functions")
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        return False
    
    # Test 2: Test PDF link discovery on arXiv abstract page
    print("\n2. Testing PDF discovery from arXiv abstract page...")
    try:
        result = process_url(arxiv_abstract_url, "pdf", "", "test_output")
        print(f"✅ PDF discovery result: {result}")
        
        if 'pdf_links' in result and len(result['pdf_links']) > 0:
            print(f"✅ Found {len(result['pdf_links'])} PDF links")
            for i, link in enumerate(result['pdf_links']):
                print(f"   PDF {i+1}: {link}")
        else:
            print("⚠️  No PDF links found")
            
    except Exception as e:
        print(f"❌ PDF discovery failed: {e}")
        
    # Test 3: Test direct PDF URL handling
    print("\n3. Testing direct PDF URL handling...")
    try:
        # This should recognize it's already a PDF and download it
        result = process_url(arxiv_pdf_url, "pdf", "", "test_output")
        print(f"✅ Direct PDF result: {result}")
    except Exception as e:
        print(f"❌ Direct PDF handling failed: {e}")
        
    # Test 4: Test academic API integration
    print("\n4. Testing academic API integration...")
    try:
        import academic_api
        print("✅ Academic API module imported successfully")
        
        # Check if arXiv search is available
        if hasattr(academic_api, 'search_arxiv'):
            print("✅ arXiv search function available")
        else:
            print("⚠️  arXiv search function not found")
            
    except ImportError as e:
        print(f"❌ Academic API import failed: {e}")
        
    print("\n" + "=" * 50)
    print("🏁 arXiv Integration Test Complete")
    
    return True

if __name__ == "__main__":
    test_arxiv_pdf_discovery()