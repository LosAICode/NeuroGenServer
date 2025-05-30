#!/usr/bin/env python3
"""
Test All Academic Sources
Verify all three academic sources: ArXiv, Semantic Scholar, and OpenAlex
"""
import requests
import json

BASE_URL = "http://localhost:5025"

def test_all_academic_sources():
    """Test all three academic sources in detail"""
    print("🎓 TESTING ALL ACADEMIC SOURCES")
    print("=" * 60)
    
    # The three sources mentioned in the code
    sources = ["arxiv", "semantic", "openalex"]
    
    results = {}
    
    for source in sources:
        print(f"\n📚 Testing {source.upper()}")
        print("-" * 40)
        
        try:
            # Test with a common query
            response = requests.get(
                f"{BASE_URL}/api/academic/search",
                params={
                    "query": "machine learning",
                    "source": source,
                    "limit": 5
                },
                timeout=10
            )
            
            print(f"Response Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                results_count = len(data.get('results', []))
                total_count = data.get('total_results', 0)
                
                print(f"Results returned: {results_count}")
                print(f"Total results: {total_count}")
                
                # Check if we got actual content
                if results_count > 0:
                    first_result = data['results'][0]
                    has_pdf = bool(first_result.get('pdf_url'))
                    has_title = bool(first_result.get('title') and 
                                   not first_result['title'].startswith('Paper related to'))
                    has_abstract = bool(first_result.get('abstract'))
                    has_authors = bool(first_result.get('authors'))
                    
                    print(f"✓ Has PDF URL: {'Yes' if has_pdf else 'No'}")
                    print(f"✓ Has real title: {'Yes' if has_title else 'No'}")
                    print(f"✓ Has abstract: {'Yes' if has_abstract else 'No'}")
                    print(f"✓ Has authors: {'Yes' if has_authors else 'No'}")
                    
                    # Show sample result
                    print(f"\nSample result:")
                    print(f"  Title: {first_result.get('title', 'N/A')[:60]}...")
                    print(f"  PDF URL: {first_result.get('pdf_url', 'N/A')}")
                    
                    # Determine if this is a real implementation
                    is_real = has_pdf and has_title
                    results[source] = {
                        "status": "✅ WORKING" if is_real else "⚠️ PLACEHOLDER",
                        "has_pdf": has_pdf,
                        "has_content": has_title or has_abstract,
                        "count": results_count
                    }
                else:
                    results[source] = {
                        "status": "❌ NO RESULTS",
                        "has_pdf": False,
                        "has_content": False,
                        "count": 0
                    }
            else:
                print(f"Error response: {response.text[:200]}")
                results[source] = {
                    "status": "❌ ERROR",
                    "has_pdf": False,
                    "has_content": False,
                    "count": 0
                }
                
        except Exception as e:
            print(f"Exception: {e}")
            results[source] = {
                "status": "❌ EXCEPTION",
                "has_pdf": False,
                "has_content": False,
                "count": 0
            }
    
    # Test multi-source search
    print("\n" + "=" * 60)
    print("📊 TESTING MULTI-SOURCE SEARCH")
    print("=" * 60)
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/academic/multi-source",
            params={
                "query": "quantum computing",
                "sources": "arxiv,semantic,openalex",
                "limit": 10
            },
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            source_dist = data.get('source_distribution', {})
            print("✅ Multi-source search working!")
            print("Source distribution:")
            for src, count in source_dist.items():
                print(f"  {src}: {count} results")
        else:
            print(f"❌ Multi-source search failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Multi-source search error: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("🎯 ACADEMIC SOURCES SUMMARY")
    print("=" * 60)
    
    working_sources = []
    placeholder_sources = []
    
    for source, info in results.items():
        print(f"\n{source.upper()}: {info['status']}")
        if "WORKING" in info['status']:
            working_sources.append(source)
            print("  • Real implementation with PDF downloads")
            print(f"  • Returns {info['count']} results with content")
        elif "PLACEHOLDER" in info['status']:
            placeholder_sources.append(source)
            print("  • Placeholder implementation")
            print("  • Returns mock data only")
    
    print("\n" + "=" * 60)
    print("📢 FINAL ANSWER:")
    print("=" * 60)
    print(f"\n✅ FULLY WORKING SOURCES ({len(working_sources)}):")
    for src in working_sources:
        print(f"   • {src.upper()} - Full search and PDF download capability")
    
    if placeholder_sources:
        print(f"\n⚠️ PLACEHOLDER SOURCES ({len(placeholder_sources)}):")
        for src in placeholder_sources:
            print(f"   • {src.upper()} - Returns mock data, not real results")
    
    print(f"\n🎯 TOTAL ACADEMIC SOURCES: {len(results)} (but only {len(working_sources)} fully functional)")

if __name__ == "__main__":
    test_all_academic_sources()