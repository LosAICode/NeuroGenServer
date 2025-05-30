#!/usr/bin/env python3
"""
Test script for Web Scraper module
Tests all components: backend, frontend integration, and features
"""

import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_web_scraper_endpoints():
    """Test all web scraper endpoints"""
    print("🧪 Testing Web Scraper Endpoints...\n")
    
    # Test 1: Basic scraping endpoint
    print("1. Testing /api/scrape2 endpoint...")
    test_data = {
        "urls": [
            {"url": "https://arxiv.org/abs/2301.00234", "setting": "pdf"},
            {"url": "https://example.com", "setting": "full"}
        ],
        "download_directory": "test_downloads",
        "outputFilename": "test_scraping",
        "pdf_options": {
            "process_pdfs": True,
            "extract_tables": True,
            "use_ocr": True,
            "max_downloads": 5
        }
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/scrape2", json=test_data)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Scraping started: Task ID = {result.get('task_id')}")
            print(f"   Output file: {result.get('output_file')}")
            return result.get('task_id')
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None

def test_academic_search():
    """Test academic search endpoint"""
    print("\n2. Testing Academic Search endpoint...")
    test_data = {
        "query": "machine learning transformers",
        "source": "arxiv",
        "max_results": 10
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/academic-search", json=test_data)
        if response.status_code == 200:
            results = response.json()
            print(f"✅ Academic search completed: {len(results.get('results', []))} papers found")
            return results
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None

def test_pdf_download():
    """Test PDF download endpoint"""
    print("\n3. Testing PDF Download endpoint...")
    test_data = {
        "url": "https://arxiv.org/pdf/2301.00234.pdf",
        "outputFolder": "test_downloads",
        "outputFilename": "test_paper",
        "processFile": True,
        "extractTables": True,
        "useOcr": False
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/download-pdf", json=test_data)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ PDF download completed")
            print(f"   File: {result.get('fileName')}")
            print(f"   Size: {result.get('fileSize', 0) / 1024:.1f} KB")
            return result
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None

def test_task_status(task_id):
    """Test task status endpoint"""
    print(f"\n4. Testing Task Status for {task_id}...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/scrape2/status/{task_id}")
        if response.status_code == 200:
            status = response.json()
            print(f"✅ Task Status:")
            print(f"   Status: {status.get('status')}")
            print(f"   Progress: {status.get('progress')}%")
            print(f"   Stats: {json.dumps(status.get('stats', {}), indent=2)}")
            return status
        else:
            print(f"❌ Failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None

def test_recursive_crawling():
    """Test recursive crawling functionality"""
    print("\n5. Testing Recursive Crawling...")
    from blueprints.features.web_crawler import WebCrawler
    
    crawler = WebCrawler(
        max_depth=2,
        max_pages=10,
        respect_robots=True
    )
    
    def progress_callback(data):
        print(f"   Crawled: {data['url']} (depth: {data['depth']}, total: {data['pages_crawled']})")
    
    def pdf_callback(pdf_info):
        print(f"   📄 PDF Found: {pdf_info['title']}")
    
    try:
        results = crawler.crawl(
            "https://arxiv.org/list/cs.LG/recent",
            progress_callback=progress_callback,
            pdf_callback=pdf_callback,
            stay_in_domain=True
        )
        
        print(f"\n✅ Crawling completed:")
        print(f"   Pages crawled: {results['stats']['pages_crawled']}")
        print(f"   PDFs found: {results['stats']['pdfs_found']}")
        print(f"   Duration: {results['stats']['duration']:.1f}s")
        
    except Exception as e:
        print(f"❌ Crawling failed: {e}")

def main():
    """Run all tests"""
    print("=" * 60)
    print("🌐 Web Scraper Module Test Suite")
    print("=" * 60)
    
    # Test basic endpoints
    task_id = test_web_scraper_endpoints()
    
    # Test academic search
    test_academic_search()
    
    # Test PDF download
    test_pdf_download()
    
    # Test task status if we have a task ID
    if task_id:
        time.sleep(2)  # Wait a bit for processing
        test_task_status(task_id)
    
    # Test recursive crawling (standalone)
    test_recursive_crawling()
    
    print("\n" + "=" * 60)
    print("✅ Web Scraper Test Suite Completed")
    print("=" * 60)

if __name__ == "__main__":
    main()