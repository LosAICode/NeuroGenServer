#!/usr/bin/env python3
"""
Test Routes
Check what routes are actually registered
"""
import requests
import json

BASE_URL = "http://localhost:5025"

def test_routes():
    """Test which routes are available"""
    print("🔍 TESTING AVAILABLE ROUTES")
    print("=" * 50)
    
    # Get diagnostics
    response = requests.get(f"{BASE_URL}/api/test-modules")
    if response.status_code == 200:
        data = response.json()
        
        # Check route analysis
        route_analysis = data.get('route_analysis', {})
        registered_routes = route_analysis.get('registered_routes', [])
        
        print(f"Total registered routes: {len(registered_routes)}")
        print("\nAcademic-related routes:")
        academic_routes = [r for r in registered_routes if 'academic' in r.lower()]
        for route in academic_routes:
            print(f"  {route}")
        
        print("\nAPI routes:")
        api_routes = [r for r in registered_routes if r.startswith('/api/')]
        for route in sorted(api_routes):
            print(f"  {route}")
    
    # Test specific endpoints
    print("\n" + "=" * 50)
    print("TESTING SPECIFIC ENDPOINTS")
    print("=" * 50)
    
    endpoints_to_test = [
        "/api/academic/search",
        "/api/academic-search", 
        "/api/academic/health",
        "/api/process",
        "/api/scrape2",
        "/api/pdf/process",
        "/api/start-playlists"
    ]
    
    for endpoint in endpoints_to_test:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
            status = "✅" if response.status_code < 500 else "❌"
            print(f"  {endpoint}: {status} {response.status_code}")
        except Exception as e:
            print(f"  {endpoint}: ❌ {e}")

if __name__ == "__main__":
    test_routes()