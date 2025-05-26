#!/usr/bin/env python3
"""
Port Management Utility for NeuroGen Server
Helps find and kill processes using specific ports
"""

import subprocess
import sys
import platform
import os

def find_process_on_port(port):
    """Find process using a specific port"""
    system = platform.system()
    
    try:
        if system == "Windows":
            # Windows command
            cmd = f"netstat -ano | findstr :{port}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.stdout:
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'LISTENING' in line:
                        parts = line.split()
                        pid = parts[-1]
                        return pid
                        
        else:  # Linux/Mac
            # Linux/Mac command
            cmd = f"lsof -ti:{port}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.stdout:
                return result.stdout.strip()
                
    except Exception as e:
        print(f"Error finding process: {e}")
        
    return None

def kill_process(pid):
    """Kill a process by PID"""
    system = platform.system()
    
    try:
        if system == "Windows":
            cmd = f"taskkill /PID {pid} /F"
        else:
            cmd = f"kill -9 {pid}"
            
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error killing process: {e}")
        return False

def get_process_name(pid):
    """Get process name by PID"""
    system = platform.system()
    
    try:
        if system == "Windows":
            cmd = f'wmic process where ProcessId={pid} get Name'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                return lines[1].strip()
        else:
            cmd = f"ps -p {pid} -o comm="
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            return result.stdout.strip()
            
    except:
        return "Unknown"
        
    return "Unknown"

def main():
    print("🔍 NeuroGen Port Manager\n")
    print("=" * 50)
    
    # Check common ports
    ports = [5000, 5025, 8000, 8080]
    
    if len(sys.argv) > 1:
        # Use specified port
        try:
            ports = [int(sys.argv[1])]
        except ValueError:
            print(f"❌ Invalid port number: {sys.argv[1]}")
            sys.exit(1)
    
    found_processes = []
    
    for port in ports:
        print(f"\nChecking port {port}...")
        pid = find_process_on_port(port)
        
        if pid:
            process_name = get_process_name(pid)
            print(f"✅ Found process on port {port}:")
            print(f"   PID: {pid}")
            print(f"   Name: {process_name}")
            found_processes.append((port, pid, process_name))
        else:
            print(f"   No process found on port {port}")
    
    if found_processes:
        print("\n" + "=" * 50)
        print("🛑 Kill processes?\n")
        
        for port, pid, name in found_processes:
            response = input(f"Kill {name} (PID: {pid}) on port {port}? [y/N]: ")
            
            if response.lower() == 'y':
                if kill_process(pid):
                    print(f"✅ Successfully killed process {pid}")
                else:
                    print(f"❌ Failed to kill process {pid}")
                    print("   You may need to run as Administrator/sudo")
            else:
                print(f"⏭️  Skipped process {pid}")
    
    print("\n✅ Done!")
    
    # Suggest alternative ports
    if found_processes and len(sys.argv) > 1:
        port = int(sys.argv[1])
        print(f"\n💡 Alternative: Start NeuroGen on a different port:")
        print(f"   python main.py --port {port + 1}")

if __name__ == "__main__":
    main()
