#!/usr/bin/env python3
"""
Test Enhanced Academic Sources
Verify all three academic sources work with production implementations
"""
import requests
import json
import time

BASE_URL = "http://localhost:5025"

def test_enhanced_academic_sources():
    """Test all three academic sources with the new implementations"""
    print("🎓 TESTING ENHANCED ACADEMIC SOURCES")
    print("=" * 70)
    
    sources = ["arxiv", "semantic", "openalex"]
    test_queries = {
        "arxiv": "quantum computing",
        "semantic": "machine learning",
        "openalex": "neural networks"
    }
    
    detailed_results = {}
    
    for source in sources:
        query = test_queries.get(source, "artificial intelligence")
        print(f"\n📚 Testing {source.upper()}")
        print("-" * 50)
        print(f"Query: '{query}'")
        
        try:
            # Make the search request
            response = requests.get(
                f"{BASE_URL}/api/academic/search",
                params={
                    "query": query,
                    "source": source,
                    "limit": 3
                },
                timeout=20
            )
            
            print(f"Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                total = data.get('total_results', 0)
                
                print(f"Results returned: {len(results)}/{total}")
                
                if results:
                    # Analyze first result in detail
                    first = results[0]
                    print("\n📄 First Result Analysis:")
                    print(f"  • ID: {first.get('id', 'N/A')}")
                    print(f"  • Title: {first.get('title', 'N/A')[:60]}...")
                    print(f"  • Authors: {len(first.get('authors', []))} authors")
                    if first.get('authors'):
                        print(f"    - {', '.join(first['authors'][:3])}...")
                    print(f"  • Abstract: {'Yes' if first.get('abstract') else 'No'} ({len(first.get('abstract', ''))} chars)")
                    print(f"  • PDF URL: {'Yes' if first.get('pdf_url') else 'No'}")
                    if first.get('pdf_url'):
                        print(f"    - {first['pdf_url'][:60]}...")
                    
                    # Additional metadata
                    extra_fields = []
                    for field in ['publication_date', 'journal', 'doi', 'categories', 'relevance_score']:
                        if field in first and first[field]:
                            extra_fields.append(field)
                    
                    if extra_fields:
                        print(f"  • Extra metadata: {', '.join(extra_fields)}")
                    
                    # Store detailed results
                    detailed_results[source] = {
                        "status": "✅ WORKING",
                        "count": len(results),
                        "has_abstracts": sum(1 for r in results if r.get('abstract')) > 0,
                        "has_pdfs": sum(1 for r in results if r.get('pdf_url')) > 0,
                        "has_authors": sum(1 for r in results if r.get('authors')) > 0,
                        "sample_pdf": first.get('pdf_url', ''),
                        "metadata_quality": len(extra_fields)
                    }
                else:
                    print("⚠️ No results returned")
                    detailed_results[source] = {"status": "❌ NO RESULTS"}
            else:
                print(f"❌ Error: {response.text[:200]}")
                detailed_results[source] = {"status": f"❌ HTTP {response.status_code}"}
                
        except Exception as e:
            print(f"❌ Exception: {e}")
            detailed_results[source] = {"status": "❌ EXCEPTION"}
        
        # Small delay between requests
        time.sleep(1)
    
    # Test multi-source search
    print("\n" + "=" * 70)
    print("📊 TESTING MULTI-SOURCE SEARCH")
    print("=" * 70)
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/academic/multi-source",
            params={
                "query": "artificial intelligence",
                "sources": "arxiv,semantic,openalex",
                "limit": 5
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            source_dist = data.get('source_distribution', {})
            total_results = data.get('total_results', 0)
            
            print(f"✅ Multi-source search successful!")
            print(f"Total results: {total_results}")
            print("Source distribution:")
            for src, count in source_dist.items():
                print(f"  • {src}: {count} results")
        else:
            print(f"❌ Multi-source search failed: HTTP {response.status_code}")
            
    except Exception as e:
        print(f"❌ Multi-source search error: {e}")
    
    # Download test
    print("\n" + "=" * 70)
    print("💾 TESTING PDF DOWNLOAD CAPABILITY")
    print("=" * 70)
    
    # Find a PDF URL to test
    test_pdf_url = None
    test_source = None
    for source, info in detailed_results.items():
        if info.get('sample_pdf'):
            test_pdf_url = info['sample_pdf']
            test_source = source
            break
    
    if test_pdf_url:
        print(f"Testing download from {test_source.upper()}")
        print(f"PDF URL: {test_pdf_url[:80]}...")
        
        try:
            # Create a scraper task for the PDF
            scraper_config = {
                "urls": [{
                    "url": test_pdf_url,
                    "setting": "pdf",
                    "enabled": True
                }],
                "download_directory": f"/workspace/modules/downloads/academic_{test_source}_test",
                "outputFilename": f"{test_source}_test_results",
                "pdf_options": {
                    "process_pdfs": True,
                    "extract_tables": False,
                    "use_ocr": False,
                    "max_downloads": 1
                }
            }
            
            response = requests.post(
                f"{BASE_URL}/api/scrape2",
                json=scraper_config,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Download task created: {data.get('task_id')}")
            else:
                print(f"❌ Download failed: HTTP {response.status_code}")
                
        except Exception as e:
            print(f"❌ Download error: {e}")
    else:
        print("⚠️ No PDF URLs found to test download")
    
    # Final summary
    print("\n" + "=" * 70)
    print("🎯 ENHANCED ACADEMIC SOURCES SUMMARY")
    print("=" * 70)
    
    working_count = 0
    for source, info in detailed_results.items():
        status = info.get('status', '❌')
        print(f"\n{source.upper()}: {status}")
        
        if "WORKING" in status:
            working_count += 1
            print(f"  • Results with abstracts: {'Yes' if info.get('has_abstracts') else 'No'}")
            print(f"  • Results with PDFs: {'Yes' if info.get('has_pdfs') else 'No'}")
            print(f"  • Results with authors: {'Yes' if info.get('has_authors') else 'No'}")
            print(f"  • Metadata quality: {'High' if info.get('metadata_quality', 0) >= 3 else 'Basic'}")
    
    print(f"\n🏆 FINAL SCORE: {working_count}/3 sources fully functional")
    
    if working_count == 3:
        print("🎉 ALL ACADEMIC SOURCES ARE NOW PRODUCTION-READY!")
    elif working_count > 0:
        print(f"✅ {working_count} source(s) working, others need attention")
    else:
        print("❌ No sources working properly")

if __name__ == "__main__":
    print("🚀 Testing Enhanced Academic Search Sources")
    print("This test verifies the production-ready implementations")
    print("=" * 80)
    
    test_enhanced_academic_sources()