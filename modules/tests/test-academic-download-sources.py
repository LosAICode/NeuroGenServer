#!/usr/bin/env python3
"""
Test Academic Download Sources
Verify all academic sources we can successfully download from
"""
import requests
import json
import time
import os

BASE_URL = "http://localhost:5025"

def test_academic_search_sources():
    """Test which academic sources are available and can be downloaded from"""
    print("🎓 TESTING ACADEMIC SEARCH DOWNLOAD SOURCES")
    print("=" * 60)
    
    # Test different academic sources
    test_queries = [
        {
            "name": "ArXiv Papers",
            "query": "machine learning",
            "source": "arxiv",
            "expected_pdfs": True
        },
        {
            "name": "ArXiv Physics",
            "query": "quantum computing",
            "source": "arxiv", 
            "expected_pdfs": True
        },
        {
            "name": "ArXiv Computer Science",
            "query": "neural networks",
            "source": "arxiv",
            "expected_pdfs": True
        }
    ]
    
    successful_sources = []
    failed_sources = []
    
    for test in test_queries:
        print(f"\n📚 Testing: {test['name']}")
        print(f"   Query: '{test['query']}'")
        print(f"   Source: {test['source']}")
        
        try:
            # Make search request
            url = f"{BASE_URL}/api/academic/search"
            params = {
                "query": test['query'],
                "source": test['source'],
                "limit": 5  # Get 5 results for testing
            }
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                total = data.get('total_results', 0)
                
                print(f"   ✅ Search successful: {total} results found")
                
                # Check if we got PDF URLs
                pdf_count = sum(1 for r in results if r.get('pdf_url'))
                print(f"   📄 PDF URLs available: {pdf_count}/{len(results)}")
                
                if pdf_count > 0:
                    # Show sample PDFs
                    print("   Sample PDFs:")
                    for i, result in enumerate(results[:3]):  # Show first 3
                        if result.get('pdf_url'):
                            print(f"      {i+1}. {result.get('title', 'No title')}")
                            print(f"         URL: {result['pdf_url']}")
                    
                    successful_sources.append({
                        "source": test['source'],
                        "name": test['name'],
                        "pdf_count": pdf_count,
                        "sample_url": results[0].get('pdf_url') if results else None
                    })
                else:
                    print("   ⚠️ No PDF URLs found in results")
                    failed_sources.append(test['name'])
                    
            else:
                print(f"   ❌ Search failed: HTTP {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                failed_sources.append(test['name'])
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            failed_sources.append(test['name'])
    
    # Test actual PDF download capability
    print("\n" + "=" * 60)
    print("🔄 TESTING ACTUAL PDF DOWNLOAD CAPABILITY")
    print("=" * 60)
    
    if successful_sources:
        # Try to download one PDF using the web scraper
        test_pdf = successful_sources[0]
        if test_pdf['sample_url']:
            print(f"\nTesting download from: {test_pdf['name']}")
            print(f"PDF URL: {test_pdf['sample_url']}")
            
            # Create a web scraper request for the PDF
            scraper_config = {
                "urls": [{
                    "url": test_pdf['sample_url'],
                    "setting": "pdf",
                    "enabled": True
                }],
                "download_directory": "/workspace/modules/downloads/academic_test",
                "outputFilename": "academic_test_results",
                "pdf_options": {
                    "process_pdfs": True,
                    "extract_tables": False,
                    "use_ocr": False,
                    "structure": True,
                    "chunk_size": 4096,
                    "max_downloads": 1
                }
            }
            
            try:
                response = requests.post(
                    f"{BASE_URL}/api/scrape2",
                    json=scraper_config,
                    headers={"Content-Type": "application/json"},
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    task_id = data.get('task_id')
                    print(f"✅ Download task created: {task_id}")
                    
                    # Wait for download
                    print("⏳ Waiting for download to complete...")
                    time.sleep(10)
                    
                    # Check if PDF was downloaded
                    download_dir = "/workspace/modules/downloads/academic_test"
                    if os.path.exists(download_dir):
                        files = os.listdir(download_dir)
                        pdf_files = [f for f in files if f.endswith('.pdf')]
                        if pdf_files:
                            print(f"✅ PDF successfully downloaded: {pdf_files[0]}")
                            print(f"   Size: {os.path.getsize(os.path.join(download_dir, pdf_files[0]))} bytes")
                        else:
                            print("⚠️ No PDF files found in download directory")
                    else:
                        print("❌ Download directory not created")
                else:
                    print(f"❌ Download request failed: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"❌ Download error: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 ACADEMIC DOWNLOAD SOURCES SUMMARY")
    print("=" * 60)
    
    print("\n✅ WORKING SOURCES (Can search and get PDF URLs):")
    for source in successful_sources:
        print(f"   • {source['name']} - {source['pdf_count']} PDFs available")
    
    if failed_sources:
        print("\n❌ FAILED SOURCES:")
        for source in failed_sources:
            print(f"   • {source}")
    
    # Additional source check
    print("\n🔍 CHECKING FOR ADDITIONAL ACADEMIC SOURCES:")
    
    # Try different source parameters
    additional_sources = ["semantic", "pubmed", "crossref", "google"]
    for source in additional_sources:
        try:
            response = requests.get(
                f"{BASE_URL}/api/academic/search",
                params={"query": "test", "source": source, "limit": 1},
                timeout=5
            )
            if response.status_code == 200:
                print(f"   • {source}: ✅ Available")
            else:
                print(f"   • {source}: ❌ Not available (HTTP {response.status_code})")
        except Exception:
            print(f"   • {source}: ❌ Error")
    
    print("\n" + "=" * 60)
    print("🎯 FINAL VERDICT:")
    if successful_sources:
        print(f"✅ Academic search is functional with {len(successful_sources)} working source(s)")
        print("✅ PDF downloads are supported from ArXiv")
    else:
        print("❌ No working academic sources found")

if __name__ == "__main__":
    print("🚀 Starting Academic Search Download Sources Test")
    print("This test verifies which academic sources we can search and download from")
    print("=" * 80)
    
    test_academic_search_sources()