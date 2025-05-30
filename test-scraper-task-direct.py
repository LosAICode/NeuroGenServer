#!/usr/bin/env python3
"""
Test ScraperTask directly to see if it's failing on start
"""
import sys
sys.path.insert(0, '/workspace/modules')

import uuid
import time
import os
from blueprints.core.services import ScraperTask, add_task, get_task, remove_task, active_tasks

def test_scraper_task_direct():
    """Test ScraperTask creation and start"""
    print("Testing ScraperTask directly...")
    
    # Create task
    task_id = str(uuid.uuid4())
    print(f"\nCreating task with ID: {task_id}")
    
    try:
        task = ScraperTask(task_id)
        print(f"Task created successfully")
        
        # Add to active tasks
        add_task(task_id, task)
        print(f"Task added to active tasks")
        
        # Check it's there
        print(f"Active tasks count: {len(active_tasks)}")
        print(f"Task in active_tasks: {task_id in active_tasks}")
        
        # Configure task
        url_configs = [{
            "url": "https://example.com",
            "setting": "text",
            "enabled": True
        }]
        root_dir = "/workspace/modules/downloads/test_direct"
        output_file = "test_direct_results"
        
        print(f"\nStarting task with config:")
        print(f"  URLs: {url_configs}")
        print(f"  Directory: {root_dir}")
        print(f"  Output: {output_file}")
        
        # Start the task
        result = task.start(
            url_configs=url_configs,
            root_scrape_directory=root_dir,
            output_json_file=output_file
        )
        
        print(f"\nStart result: {result}")
        
        # Check task is still there
        time.sleep(0.5)
        print(f"\nAfter start:")
        print(f"Active tasks count: {len(active_tasks)}")
        print(f"Task in active_tasks: {task_id in active_tasks}")
        
        # Check task status
        retrieved_task = get_task(task_id)
        if retrieved_task:
            print(f"Task status: {retrieved_task.status}")
            print(f"Task message: {retrieved_task.message}")
            print(f"Task thread: {getattr(retrieved_task, 'thread', None)}")
            if hasattr(retrieved_task, 'thread') and retrieved_task.thread:
                print(f"Thread alive: {retrieved_task.thread.is_alive()}")
        else:
            print("ERROR: Task not found after start!")
            
        # Wait a bit more and check again
        time.sleep(2)
        print(f"\nAfter 2 seconds:")
        print(f"Active tasks count: {len(active_tasks)}")
        print(f"Task in active_tasks: {task_id in active_tasks}")
        
        retrieved_task = get_task(task_id)
        if retrieved_task:
            print(f"Task status: {retrieved_task.status}")
            print(f"Task message: {retrieved_task.message}")
            print(f"Task error: {getattr(retrieved_task, 'error', None)}")
        
    except Exception as e:
        print(f"\nERROR during test: {e}")
        import traceback
        traceback.print_exc()
    
    # Check if output was created
    print(f"\nChecking output directory:")
    if os.path.exists(root_dir):
        print(f"Directory exists: {root_dir}")
        files = os.listdir(root_dir)
        print(f"Files: {files}")
    else:
        print(f"Directory does not exist: {root_dir}")

if __name__ == "__main__":
    test_scraper_task_direct()