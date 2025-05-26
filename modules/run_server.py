"""
NeuroGen Server Runner with Graceful Shutdown Support
"""

import subprocess
import sys
import signal
import time
import requests
import os

class NeuroGenServer:
    def __init__(self):
        self.process = None
        self.port = 5000
        
    def start(self):
        """Start the NeuroGen server"""
        print("🚀 Starting NeuroGen Server...")
        
        # Change to modules directory
        modules_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(modules_dir)
        
        # Start the server
        self.process = subprocess.Popen(
            [sys.executable, 'main.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        # Monitor output
        print("📋 Server output:")
        print("-" * 50)
        
        try:
            while True:
                output = self.process.stdout.readline()
                if output:
                    print(output.strip())
                else:
                    break
        except KeyboardInterrupt:
            print("\n⚠️  Keyboard interrupt received")
            self.shutdown()
            
    def shutdown(self):
        """Gracefully shutdown the server"""
        print("\n🛑 Initiating graceful shutdown...")
        
        try:
            # Try HTTP shutdown first
            response = requests.post(
                f'http://localhost:{self.port}/shutdown',
                json={'secret': 'neurogen-shutdown-key'},
                timeout=5
            )
            
            if response.status_code == 200:
                print("✅ Shutdown request sent successfully")
                print("⏳ Waiting for server to shutdown...")
                
                # Wait for process to end
                self.process.wait(timeout=10)
                print("✅ Server shut down successfully")
                
        except requests.exceptions.ConnectionError:
            print("⚠️  Server not responding to HTTP, sending terminate signal...")
            self.process.terminate()
            
            try:
                self.process.wait(timeout=5)
                print("✅ Server terminated")
            except subprocess.TimeoutExpired:
                print("⚠️  Server not responding, forcing shutdown...")
                self.process.kill()
                print("✅ Server killed")
                
        except Exception as e:
            print(f"❌ Error during shutdown: {e}")
            if self.process:
                self.process.kill()

def signal_handler(signum, frame):
    """Handle system signals"""
    print(f"\n📌 Received signal {signum}")
    sys.exit(0)

if __name__ == "__main__":
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create and start server
    server = NeuroGenServer()
    
    try:
        server.start()
    except Exception as e:
        print(f"❌ Error: {e}")
        server.shutdown()
        sys.exit(1)
