#!/usr/bin/env python3
"""
Test Academic Implementation Details
Check the actual implementation of all three academic sources
"""
import sys
sys.path.append('/workspace/modules')

try:
    import academic_api
    print("✅ academic_api module loaded")
    
    # Check if search functions exist
    functions = ['search_arxiv', 'search_semantic_scholar', 'search_openalex']
    for func_name in functions:
        if hasattr(academic_api, func_name):
            func = getattr(academic_api, func_name)
            print(f"\n📚 Testing {func_name}:")
            
            # Try to call the function
            try:
                results = func("test query", limit=2)
                print(f"  ✅ Function exists and returns: {type(results)}")
                if results:
                    print(f"  • Got {len(results)} results")
                    if len(results) > 0:
                        first = results[0]
                        print(f"  • First result has keys: {list(first.keys())}")
                        print(f"  • Has PDF URL: {'pdf_url' in first}")
                        print(f"  • PDF URL: {first.get('pdf_url', 'N/A')[:50]}...")
                else:
                    print("  ⚠️ Function returned empty results")
            except Exception as e:
                print(f"  ❌ Error calling function: {e}")
        else:
            print(f"\n❌ {func_name} not found in academic_api")
            
except ImportError as e:
    print(f"❌ Could not import academic_api: {e}")

# Also check the blueprint implementation
print("\n" + "="*60)
print("Checking blueprint implementation:")

try:
    from blueprints.features.academic_search import search_academic_source
    print("✅ search_academic_source function imported")
    
    # Test each source
    for source in ['arxiv', 'semantic', 'openalex']:
        print(f"\n📚 Testing {source} via blueprint:")
        try:
            # Need to mock web_scraper since it's used in the function
            import types
            mock_scraper = types.SimpleNamespace()
            mock_scraper.fetch_pdf_links = lambda url: [
                {"url": f"https://example.com/paper1.pdf", "title": "Test Paper 1"},
                {"url": f"https://example.com/paper2.pdf", "title": "Test Paper 2"}
            ]
            mock_scraper.convert_arxiv_url = lambda url: url.replace('/abs/', '/pdf/') + '.pdf'
            
            # Temporarily replace web_scraper
            import blueprints.features.academic_search as acs
            original_scraper = getattr(acs, 'web_scraper', None)
            acs.web_scraper = mock_scraper
            acs.web_scraper_available = True
            
            results = search_academic_source("test", source, 2)
            if results:
                print(f"  ✅ Got {len(results)} results")
            else:
                print(f"  ⚠️ Got empty results")
                
            # Restore original
            if original_scraper:
                acs.web_scraper = original_scraper
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            
except ImportError as e:
    print(f"❌ Could not import blueprint: {e}")

print("\n" + "="*60)
print("CONCLUSION:")
print("="*60)
print("\nBased on the code analysis:")
print("1. ArXiv - ✅ Fully implemented with web scraping")
print("2. Semantic Scholar - ❌ Placeholder only (returns [])")
print("3. OpenAlex - ❌ Placeholder only (returns [])")
print("\nThe academic_api.py module has placeholder implementations")
print("but they are not connected to the blueprint endpoints.")