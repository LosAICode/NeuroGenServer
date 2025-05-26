"""
NeuroGenServer Patcher Script for Windows

This script applies patches to NeuroGenServer to fix specific issues.
Run it from the modules directory.

Author: Claude AI
Date: May 18, 2025
"""

import os
import sys
import re
import shutil

# Directory paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
MODULES_DIR = CURRENT_DIR
STATIC_DIR = os.path.join(MODULES_DIR, 'static')
JS_DIR = os.path.join(STATIC_DIR, 'js')

# Files to modify
MAIN_PY = os.path.join(MODULES_DIR, 'main.py')
MAIN_JS = os.path.join(JS_DIR, 'main.js')
UTILS_PY = os.path.join(MODULES_DIR, 'utils.py')

# Patch files
PATCH_IMPORTS = os.path.join(MODULES_DIR, 'patch_imports.txt')
PATCH_CANCEL_ENDPOINT = os.path.join(MODULES_DIR, 'patch_cancel_endpoint.txt')
PATCH_CANCEL_METHOD = os.path.join(MODULES_DIR, 'patch_cancel_method.txt')
SOCKET_EVENTS_JS = os.path.join(JS_DIR, 'socket-events.js')
PLAYLIST_CANCEL_JS = os.path.join(JS_DIR, 'playlist-cancel.js')

def create_backup(file_path):
    """Create a backup of a file"""
    backup_path = file_path + '.backup'
    if not os.path.exists(backup_path):
        shutil.copy2(file_path, backup_path)
        print(f"Created backup: {backup_path}")
    return backup_path

def add_import_to_file(file_path, import_statement):
    """Add an import statement to a file after other imports"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Find the last import statement
    last_import_line = 0
    for i, line in enumerate(lines):
        if re.match(r'^\s*import\s+|^\s*from\s+\w+\s+import', line):
            last_import_line = i
    
    # Insert the new import after the last import
    lines.insert(last_import_line + 1, import_statement + '\n')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    print(f"Added import to {file_path}")

def create_setup_logging_fn(file_path):
    """Create the setup_logging function in utils.py"""
    code = '''
import logging
import os
import sys

def setup_logging(log_level=logging.INFO, log_file=None):
    """
    Set up logging configuration for the application
    
    Args:
        log_level: Logging level (default: INFO)
        log_file: Optional log file path
        
    Returns:
        Configured logger instance
    """
    # Create logger if it doesn't exist
    logger = logging.getLogger("file_processor")
    logger.setLevel(log_level)
    
    # Remove existing handlers to prevent duplicate logs
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger
'''
    
    # Check if file exists
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if setup_logging already exists
        if 'def setup_logging' in content:
            print(f"setup_logging already exists in {file_path}")
            return False
        
        # Append to existing file
        with open(file_path, 'a', encoding='utf-8') as f:
            f.write(code)
    else:
        # Create new file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(code)
    
    print(f"Created setup_logging function in {file_path}")
    return True

def fix_process_all_files(file_path):
    """Fix the setup_logging reference in process_all_files"""
    try:
        # Read the file content
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Fix the specific line with the error
        content = content.replace(
            "    # Setup logging with specified options\n    global logger\n    logger = setup_logging(log_level, log_file)",
            """    # Setup logging with specified options
    global logger
    # Safely use setup_logging function (imported from utils)
    if 'setup_logging' in globals():
        logger = setup_logging(log_level, log_file)
    else:
        # Fallback if setup_logging not available
        logger = logging.getLogger("file_processor")
        logger.setLevel(log_level)
        # Add a handler if necessary
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
            logger.addHandler(handler)
            # Add file handler if specified
            if log_file:
                file_handler = logging.FileHandler(log_file)
                file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
                logger.addHandler(file_handler)"""
        )
        
        # Write the updated content back to the file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Fixed setup_logging reference in process_all_files")
        return True
    except Exception as e:
        print(f"Error fixing process_all_files: {e}")
        return False

def add_endpoint_to_file(file_path, endpoint_code):
    """Add an endpoint (route) to a Flask application file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the last route definition
        last_route_pos = content.rfind('@app.route')
        
        if last_route_pos == -1:
            print(f"No routes found in {file_path}")
            return False
        
        # Find the end of the last route function
        route_start = content.rfind('\n', 0, last_route_pos) + 1
        next_empty_line = content.find('\n\n', last_route_pos)
        
        if next_empty_line == -1:
            # If there's no empty line, append at the end
            insert_pos = len(content)
        else:
            insert_pos = next_empty_line + 2  # +2 to get after the blank line
        
        # Insert the new endpoint before the next empty line
        content = content[:insert_pos] + '\n' + endpoint_code + '\n' + content[insert_pos:]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Added endpoint to {file_path}")
        return True
    except Exception as e:
        print(f"Error adding endpoint: {e}")
        return False

def update_class_method_in_file(file_path, class_name, method_name, new_code):
    """Update a class method in a file with new code"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the class
        class_pattern = r'class\s+' + re.escape(class_name) + r'\s*\(.*?\):'
        class_match = re.search(class_pattern, content, re.DOTALL)
        
        if not class_match:
            print(f"Class {class_name} not found in {file_path}")
            return False
        
        class_start = class_match.start()
        
        # Find the method within the class
        method_pattern = r'def\s+' + re.escape(method_name) + r'\s*\([^)]*\)\s*:'
        method_matches = list(re.finditer(method_pattern, content[class_start:]))
        
        if not method_matches:
            print(f"Method {method_name} not found in class {class_name}")
            return False
        
        method_match = method_matches[0]
        method_start = class_start + method_match.start()
        
        # Find the end of the method
        # Look for the next method or the end of the class
        next_method_pattern = r'def\s+\w+\s*\('
        next_method_match = re.search(next_method_pattern, content[method_start + len(method_match.group(0)):])
        
        if next_method_match:
            method_end = method_start + len(method_match.group(0)) + next_method_match.start()
        else:
            # If no next method, assume the rest of the file
            method_end = len(content)
        
        # Replace the method
        updated_content = content[:method_start] + new_code + content[method_end:]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        
        print(f"Replaced method {method_name} in class {class_name} in {file_path}")
        return True
    except Exception as e:
        print(f"Error updating class method: {e}")
        return False

def apply_patches():
    """Apply all patches"""
    try:
        # Create backups
        create_backup(MAIN_PY)
        create_backup(MAIN_JS)
        
        # 1. Add setup_logging function
        create_setup_logging_fn(UTILS_PY)
        
        # 2. Fix process_all_files in main.py
        fix_process_all_files(MAIN_PY)
        
        # 3. Add imports to main.py
        with open(PATCH_IMPORTS, 'r', encoding='utf-8') as f:
            imports = f.read()
        add_import_to_file(MAIN_PY, imports)
        
        # 4. Add cancel endpoint to main.py
        with open(PATCH_CANCEL_ENDPOINT, 'r', encoding='utf-8') as f:
            endpoint = f.read()
        add_endpoint_to_file(MAIN_PY, endpoint)
        
        # 5. Fix the BaseTask.cancel method
        with open(PATCH_CANCEL_METHOD, 'r', encoding='utf-8') as f:
            cancel_method = f.read()
        update_class_method_in_file(MAIN_PY, 'BaseTask', 'cancel', cancel_method)
        
        # 6. Update the HTML template to include socket-events.js and playlist-cancel.js
        # This was already done directly in the HTML file
        
        print("\nAll patches applied successfully!")
        print("\nNext steps:")
        print("1. Restart the NeuroGenServer application")
        print("2. Clear your browser cache (or use incognito mode)")
        print("3. Test the functionality")
        print("\nIf the issues persist, please restore the backups (.backup files)")
        
    except Exception as e:
        print(f"Error applying patches: {e}")
        print("Restoring from backups...")
        try:
            # Restore backups
            if os.path.exists(MAIN_PY + '.backup'):
                shutil.copy2(MAIN_PY + '.backup', MAIN_PY)
            if os.path.exists(MAIN_JS + '.backup'):
                shutil.copy2(MAIN_JS + '.backup', MAIN_JS)
            print("Backups restored.")
        except Exception as restore_error:
            print(f"Error restoring backups: {restore_error}")

if __name__ == "__main__":
    print("NeuroGenServer Patcher - Starting...")
    apply_patches()
