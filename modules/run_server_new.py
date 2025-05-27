#!/usr/bin/env python3
"""
NeuroGen Server - New Startup Script
Uses the refactored Flask Blueprint architecture
"""

import os
import sys
import logging
from pathlib import Path

# Ensure we're in the right directory
current_dir = Path(__file__).parent.absolute()
os.chdir(current_dir)

# Add to Python path
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

def main():
    """Main startup function"""
    try:
        print("🚀 Starting NeuroGen Server (Blueprint Architecture)")
        print("=" * 50)
        
        # Import and run the new app
        from app_new import run_server
        
        # Configuration
        host = os.environ.get('HOST', '127.0.0.1')
        port = int(os.environ.get('PORT', 5025))
        debug = os.environ.get('DEBUG', 'True').lower() == 'true'
        
        print(f"📍 Server URL: http://{host}:{port}")
        print(f"🔧 Debug mode: {debug}")
        print(f"📁 Working directory: {current_dir}")
        print("=" * 50)
        
        # Start the server
        run_server(host=host, port=port, debug=debug)
        
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"💥 Error starting server: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()