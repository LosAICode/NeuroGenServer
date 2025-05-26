#!/usr/bin/env python3
"""
Start NeuroGen Server on Port 5025
Ensures all services run on the same port
"""

import os
import sys
import subprocess

def start_server():
    """Start the NeuroGen server on port 5025"""
    print("🚀 Starting NeuroGen Server on port 5025...")
    print("-" * 50)
    
    # Set environment variables
    os.environ['API_PORT'] = '5025'
    os.environ['API_HOST'] = '0.0.0.0'
    os.environ['API_DEBUG'] = 'True'
    
    # Change to modules directory
    modules_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(modules_dir)
    
    # Start the server
    try:
        subprocess.run([sys.executable, 'main.py', '--port', '5025'], check=True)
    except KeyboardInterrupt:
        print("\n✅ Server stopped gracefully")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    start_server()
