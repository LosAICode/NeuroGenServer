"""
Graceful Shutdown Script for NeuroGen Server
Sends a shutdown request to the running server
"""

import requests
import sys
import time

def shutdown_server(host='localhost', port=5025):
    """Send shutdown request to the server"""
    try:
        # Try to send shutdown request
        response = requests.post(f'http://{host}:{port}/shutdown', 
                               json={'secret': 'neurogen-shutdown-key'},
                               timeout=5)
        
        if response.status_code == 200:
            print("✅ Shutdown request sent successfully")
            print("🔄 Server is shutting down gracefully...")
            
            # Wait a moment for server to shut down
            time.sleep(2)
            
            # Check if server is still running
            try:
                requests.get(f'http://{host}:{port}/', timeout=1)
                print("⚠️  Server is still running. You may need to wait a moment or check for issues.")
            except:
                print("✅ Server has been shut down successfully")
                
        else:
            print(f"❌ Failed to shutdown server: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Is it running?")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    # Allow custom host/port
    host = sys.argv[1] if len(sys.argv) > 1 else 'localhost'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 5025
    
    print(f"🛑 Attempting to shutdown NeuroGen Server at {host}:{port}")
    shutdown_server(host, port)
