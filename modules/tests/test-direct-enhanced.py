#!/usr/bin/env python3
"""
Direct test of enhanced academic search module
"""
import sys
sys.path.append('/workspace/modules')

from blueprints.features.academic_search_enhanced import search_academic_source_enhanced

print("Testing enhanced academic search directly...")

# Test each source
sources = ['arxiv', 'semantic', 'openalex']

for source in sources:
    print(f"\n📚 Testing {source.upper()}")
    print("-" * 40)
    
    try:
        results = search_academic_source_enhanced("machine learning", source, limit=3)
        print(f"Results: {len(results)}")
        
        if results:
            first = results[0]
            print(f"First result:")
            print(f"  Title: {first.get('title', 'N/A')[:60]}...")
            print(f"  Authors: {len(first.get('authors', []))}")
            print(f"  Abstract: {'Yes' if first.get('abstract') else 'No'}")
            print(f"  PDF URL: {'Yes' if first.get('pdf_url') else 'No'}")
        else:
            print("No results returned")
            
    except Exception as e:
        print(f"Error: {e}")