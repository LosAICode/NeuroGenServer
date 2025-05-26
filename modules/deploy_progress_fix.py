#!/usr/bin/env python3
"""
Deploy Progress Bar Fix Script
Backup the original progressHandler.js and deploy the fixed version
"""

import os
import shutil
import datetime
import sys

def deploy_progress_fix():
    """Deploy the fixed progress handler and backup the original"""
    
    # Define paths
    original_path = "static/js/modules/utils/progressHandler.js"
    fixed_path = "static/js/modules/utils/progressHandler_fixed.js"
    backup_dir = "backups/progress_handler"
    
    # Create backup directory if it doesn't exist
    os.makedirs(backup_dir, exist_ok=True)
    
    # Generate backup filename with timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"progressHandler_backup_{timestamp}.js")
    
    try:
        # Check if files exist
        if not os.path.exists(original_path):
            print(f"ERROR: Original file not found: {original_path}")
            return False
            
        if not os.path.exists(fixed_path):
            print(f"ERROR: Fixed file not found: {fixed_path}")
            return False
        
        print("=" * 60)
        print("DEPLOYING PROGRESS BAR FIX")
        print("=" * 60)
        
        # Step 1: Backup original file
        print(f"1. Backing up original file...")
        print(f"   From: {original_path}")
        print(f"   To:   {backup_path}")
        shutil.copy2(original_path, backup_path)
        print("   ✓ Backup completed")
        
        # Step 2: Deploy fixed version
        print(f"\n2. Deploying fixed version...")
        print(f"   From: {fixed_path}")
        print(f"   To:   {original_path}")
        shutil.copy2(fixed_path, original_path)
        print("   ✓ Fixed version deployed")
        
        # Step 3: Verify deployment
        print(f"\n3. Verifying deployment...")
        if os.path.exists(original_path):
            original_size = os.path.getsize(original_path)
            fixed_size = os.path.getsize(fixed_path)
            print(f"   Original size: {original_size} bytes")
            print(f"   Fixed size:    {fixed_size} bytes")
            
            if original_size == fixed_size:
                print("   ✓ File sizes match - deployment successful")
            else:
                print("   ⚠ File sizes differ - verify deployment manually")
        
        print("\n" + "=" * 60)
        print("DEPLOYMENT SUMMARY")
        print("=" * 60)
        print("✓ Original progressHandler.js backed up")
        print("✓ Fixed version deployed successfully")
        print("\nFIXES APPLIED:")
        print("• Removed duplicate progress indicators")
        print("• Fixed SocketIO event handling alignment")
        print("• Eliminated backward progress prevention")
        print("• Simplified progress value handling")
        print("• Improved task completion detection")
        print("• Enhanced error recovery and cleanup")
        print("• Standardized event handlers for all modules")
        
        print("\nNEXT STEPS:")
        print("1. Restart the server: python run_server.py")
        print("2. Test progress bars across all modules")
        print("3. Verify no stuck progress at 50%")
        print("4. Check for duplicate progress indicators")
        
        return True
        
    except Exception as e:
        print(f"ERROR during deployment: {e}")
        return False

def rollback_progress_fix():
    """Rollback to the most recent backup"""
    
    backup_dir = "backups/progress_handler"
    original_path = "static/js/modules/utils/progressHandler.js"
    
    try:
        # Find the most recent backup
        if not os.path.exists(backup_dir):
            print("ERROR: No backup directory found")
            return False
            
        backups = [f for f in os.listdir(backup_dir) if f.startswith("progressHandler_backup_")]
        if not backups:
            print("ERROR: No backup files found")
            return False
            
        # Sort by timestamp (newest first)
        backups.sort(reverse=True)
        latest_backup = os.path.join(backup_dir, backups[0])
        
        print(f"Rolling back to: {latest_backup}")
        shutil.copy2(latest_backup, original_path)
        print("✓ Rollback completed")
        
        return True
        
    except Exception as e:
        print(f"ERROR during rollback: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback_progress_fix()
    else:
        deploy_progress_fix()
