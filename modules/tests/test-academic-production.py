#!/usr/bin/env python3
"""
Production Academic Sources Test
Test all academic sources with production configuration
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules'))

import requests
import json
import time
from test_config import config, print_config

BASE_URL = config['BASE_URL']
TIMEOUT = config['TIMEOUT']
HEADERS = config['HEADERS']

def test_production_academic_sources():
    """Test all academic sources with production configuration"""
    print("🎓 PRODUCTION ACADEMIC SOURCES TEST")
    print("=" * 70)
    print_config()
    print("=" * 70)
    
    # Test each source
    sources = ["arxiv", "semantic", "openalex"]
    test_queries = {
        "arxiv": "quantum computing",
        "semantic": "machine learning transformers",  # More specific query
        "openalex": "covid-19 vaccine efficacy"  # Recent topic with lots of papers
    }
    
    results_summary = {}
    
    for source in sources:
        query = test_queries.get(source, "artificial intelligence")
        print(f"\n📚 Testing {source.upper()}")
        print("-" * 50)
        print(f"Query: '{query}'")
        
        try:
            # Make search request
            url = f"{BASE_URL}/api/academic/search"
            params = {
                "query": query,
                "source": source,
                "limit": 5
            }
            
            print(f"Request URL: {url}")
            print(f"Parameters: {params}")
            
            response = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
            
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Time: {response.elapsed.total_seconds():.2f}s")
            
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', [])
                total = data.get('total_results', 0)
                
                print(f"Results: {len(results)}/{total}")
                
                if results:
                    # Analyze results quality
                    quality_metrics = {
                        'has_titles': sum(1 for r in results if r.get('title') and not r['title'].startswith('Paper related to')) / len(results),
                        'has_authors': sum(1 for r in results if r.get('authors')) / len(results),
                        'has_abstracts': sum(1 for r in results if r.get('abstract')) / len(results),
                        'has_pdfs': sum(1 for r in results if r.get('pdf_url')) / len(results),
                        'has_dates': sum(1 for r in results if r.get('publication_date') or r.get('published_date')) / len(results),
                        'avg_abstract_length': sum(len(r.get('abstract', '')) for r in results) / len(results),
                        'metadata_fields': len(results[0].keys()) if results else 0
                    }
                    
                    print("\n📊 Quality Metrics:")
                    print(f"  • Real titles: {quality_metrics['has_titles']*100:.0f}%")
                    print(f"  • Has authors: {quality_metrics['has_authors']*100:.0f}%")
                    print(f"  • Has abstracts: {quality_metrics['has_abstracts']*100:.0f}%")
                    print(f"  • Has PDF URLs: {quality_metrics['has_pdfs']*100:.0f}%")
                    print(f"  • Has dates: {quality_metrics['has_dates']*100:.0f}%")
                    print(f"  • Avg abstract length: {quality_metrics['avg_abstract_length']:.0f} chars")
                    print(f"  • Metadata fields: {quality_metrics['metadata_fields']}")
                    
                    # Show sample result
                    print("\n📄 Sample Result:")
                    sample = results[0]
                    print(f"  Title: {sample.get('title', 'N/A')[:80]}...")
                    if sample.get('authors'):
                        print(f"  Authors: {', '.join(sample['authors'][:3])}...")
                    if sample.get('abstract'):
                        print(f"  Abstract: {sample['abstract'][:150]}...")
                    if sample.get('pdf_url'):
                        print(f"  PDF: {sample['pdf_url']}")
                    
                    # Determine if source is working
                    is_working = (
                        quality_metrics['has_titles'] >= 0.8 and
                        quality_metrics['has_pdfs'] >= 0.5 and
                        quality_metrics['metadata_fields'] >= 5
                    )
                    
                    results_summary[source] = {
                        'status': '✅ PRODUCTION READY' if is_working else '⚠️ PARTIAL',
                        'count': len(results),
                        'quality': quality_metrics,
                        'response_time': response.elapsed.total_seconds()
                    }
                else:
                    print("❌ No results returned")
                    results_summary[source] = {'status': '❌ NO RESULTS', 'count': 0}
            else:
                print(f"❌ HTTP Error: {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                results_summary[source] = {'status': f'❌ HTTP {response.status_code}', 'count': 0}
                
        except requests.exceptions.Timeout:
            print(f"❌ Request timeout after {TIMEOUT}s")
            results_summary[source] = {'status': '❌ TIMEOUT', 'count': 0}
        except Exception as e:
            print(f"❌ Exception: {type(e).__name__}: {e}")
            results_summary[source] = {'status': '❌ ERROR', 'count': 0}
        
        # Small delay between sources
        time.sleep(1)
    
    # Test multi-source search
    print("\n" + "=" * 70)
    print("📊 MULTI-SOURCE SEARCH TEST")
    print("=" * 70)
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/academic/multi-source",
            params={
                "query": "artificial intelligence ethics",
                "sources": ",".join(sources),
                "limit": 10
            },
            headers=HEADERS,
            timeout=TIMEOUT
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Multi-source search successful")
            print(f"Total results: {data.get('total_results', 0)}")
            print("Source distribution:")
            for src, count in data.get('source_distribution', {}).items():
                print(f"  • {src}: {count}")
        else:
            print(f"❌ Multi-source failed: HTTP {response.status_code}")
    except Exception as e:
        print(f"❌ Multi-source error: {e}")
    
    # Final Summary
    print("\n" + "=" * 70)
    print("🏆 PRODUCTION READINESS SUMMARY")
    print("=" * 70)
    
    production_ready = 0
    partial_ready = 0
    failed = 0
    
    for source, info in results_summary.items():
        status = info['status']
        print(f"\n{source.upper()}: {status}")
        
        if 'PRODUCTION READY' in status:
            production_ready += 1
            quality = info.get('quality', {})
            print(f"  ✅ Response time: {info.get('response_time', 0):.2f}s")
            print(f"  ✅ Results quality: Excellent")
            print(f"  ✅ PDF availability: {quality.get('has_pdfs', 0)*100:.0f}%")
        elif 'PARTIAL' in status:
            partial_ready += 1
            print(f"  ⚠️ Needs improvement in metadata quality")
        else:
            failed += 1
            print(f"  ❌ Not functional")
    
    print(f"\n📈 FINAL SCORE:")
    print(f"  • Production Ready: {production_ready}/3")
    print(f"  • Partially Ready: {partial_ready}/3")
    print(f"  • Failed: {failed}/3")
    
    if production_ready == 3:
        print("\n🎉 ALL SOURCES ARE PRODUCTION READY!")
    elif production_ready + partial_ready >= 2:
        print("\n✅ SYSTEM IS PRODUCTION READY (with some limitations)")
    else:
        print("\n⚠️ SYSTEM NEEDS MORE WORK FOR PRODUCTION")
    
    # Environment recommendations
    print("\n💡 CONFIGURATION RECOMMENDATIONS:")
    print("For production deployment, set these environment variables:")
    print("  export NEUROGEN_BASE_URL='https://your-domain.com'")
    print("  export OPENALEX_EMAIL='your-email@domain.com'")
    print("  export ACADEMIC_CACHE_ENABLED='true'")
    print("  export ACADEMIC_REQUEST_TIMEOUT='30'")

if __name__ == "__main__":
    print("🚀 NeuroGenServer Production Academic Test")
    print("Testing with configurable base URL and production settings")
    print("=" * 80)
    
    test_production_academic_sources()