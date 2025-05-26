# check_modules.py 

import os
import sys

def check_module_location():
    """Check if web_scraper.py exists in the expected locations"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check in current directory
    direct_path = os.path.join(current_dir, 'web_scraper.py')
    if os.path.exists(direct_path):
        print(f"Found web_scraper.py in current directory: {direct_path}")
    else:
        print(f"web_scraper.py not found in current directory")
    
    # Check in modules subdirectory
    modules_dir = os.path.join(current_dir, 'modules')
    modules_path = os.path.join(modules_dir, 'web_scraper.py')
    if os.path.exists(modules_path):
        print(f"Found web_scraper.py in modules directory: {modules_path}")
    else:
        print(f"web_scraper.py not found in modules directory")
    
    # Print Python path for reference
    print("\nPython path directories:")
    for p in sys.path:
        print(f"  {p}")

if __name__ == "__main__":
    check_module_location()