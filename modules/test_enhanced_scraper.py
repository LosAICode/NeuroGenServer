#!/usr/bin/env python3
"""
Test script for the new Enhanced Web Scraper with 2 powerful options
"""

import sys
import os
import json
import requests
sys.path.append('/workspace/modules')

def test_enhanced_scraper():
    """Test the new 2-option web scraper system - CONSOLIDATED VERSION"""
    
    print("🧪 Testing Enhanced Web Scraper (2-Option System - Consolidated)")
    print("=" * 70)
    
    # Test URLs
    arxiv_pdf_url = "https://arxiv.org/pdf/2301.00001.pdf"  # Direct PDF
    arxiv_abstract_url = "https://arxiv.org/abs/2301.00001"  # Page with PDF links
    docs_url = "https://docs.python.org/3/tutorial/"  # Documentation site
    
    base_url = "http://localhost:5025"  # Adjust if different
    
    print("\n1. Testing Smart PDF Mode - Direct PDF")
    print("-" * 40)
    
    # Test 1: Smart PDF mode with direct PDF URL
    pdf_payload = {
        "scrape_mode": "smart_pdf",
        "url": arxiv_pdf_url,
        "download_directory": "test_enhanced_output/smart_pdf_direct",
        "pdf_options": {
            "process_pdfs": True,
            "extract_tables": True,
            "use_ocr": False
        }
    }
    
    try:
        print(f"   Sending payload: {pdf_payload}")
        response = requests.post(f"{base_url}/api/scrape2", json=pdf_payload)
        print(f"   Response status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Smart PDF (Direct): {result.get('message', 'Success')}")
            print(f"   PDFs Found: {result.get('pdfs_found', 0)}")
            print(f"   PDFs Processed: {result.get('pdfs_processed', 0)}")
        else:
            print(f"❌ Smart PDF (Direct) failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Smart PDF (Direct) error: {e}")
    
    print("\n2. Testing Smart PDF Mode - Page Discovery")
    print("-" * 40)
    
    # Test 2: Smart PDF mode with HTML page (should discover PDFs)
    discovery_payload = {
        "scrape_mode": "smart_pdf",
        "url": arxiv_abstract_url,
        "download_directory": "test_enhanced_output/smart_pdf_discovery",
        "pdf_options": {
            "process_pdfs": True,
            "extract_tables": False,
            "use_ocr": False
        }
    }
    
    try:
        response = requests.post(f"{base_url}/api/scrape2", json=discovery_payload)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Smart PDF (Discovery): {result.get('message', 'Success')}")
            print(f"   PDFs Found: {result.get('pdfs_found', 0)}")
            print(f"   PDFs Processed: {result.get('pdfs_processed', 0)}")
            if result.get('results'):
                for i, pdf_result in enumerate(result['results'][:3]):  # Show first 3
                    print(f"   PDF {i+1}: {pdf_result.get('title', 'Unknown')}")
        else:
            print(f"❌ Smart PDF (Discovery) failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Smart PDF (Discovery) error: {e}")
    
    print("\n3. Testing Full Website Mode - Documentation Crawler")
    print("-" * 40)
    
    # Test 3: Full Website mode with documentation site
    website_payload = {
        "scrape_mode": "full_website",
        "url": docs_url,
        "download_directory": "test_enhanced_output/full_website",
        "max_depth": 2,
        "max_pages": 10,  # Keep it small for testing
        "respect_robots": True,
        "output_format": "markdown"
    }
    
    try:
        response = requests.post(f"{base_url}/api/scrape2", json=website_payload)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Full Website: {result.get('message', 'Success')}")
            print(f"   Pages Crawled: {result.get('pages_crawled', 0)}")
            print(f"   PDFs Found: {result.get('pdfs_found', 0)}")
            print(f"   Max Depth: {result.get('max_depth_reached', 0)}")
            print(f"   Output Format: {result.get('output_format', 'unknown')}")
        else:
            print(f"❌ Full Website failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Full Website error: {e}")
    
    print("\n4. Testing Legacy Compatibility")
    print("-" * 40)
    
    # Test 4: Legacy mode should still work
    legacy_payload = {
        "urls": [{"url": arxiv_pdf_url, "setting": "pdf"}],
        "download_directory": "test_enhanced_output/legacy",
        "outputFilename": "legacy_test",
        "pdf_options": {"process_pdfs": True}
    }
    
    try:
        response = requests.post(f"{base_url}/api/scrape2", json=legacy_payload)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Legacy Mode: {result.get('message', 'Success')}")
        else:
            print(f"❌ Legacy Mode failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Legacy Mode error: {e}")
    
    print("\n" + "=" * 60)
    print("🏁 Enhanced Web Scraper Test Complete")
    print("\nTo view results, check the test_enhanced_output/ directory")

if __name__ == "__main__":
    test_enhanced_scraper()