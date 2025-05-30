#!/usr/bin/env python3
"""
Test the task management system directly
"""
import sys
sys.path.insert(0, '/workspace/modules')

import uuid
import time
from blueprints.core.services import ScraperTask, add_task, get_task, remove_task

def test_task_system():
    """Test task creation and retrieval"""
    print("Testing Task Management System...")
    
    # Create a task
    task_id = str(uuid.uuid4())
    print(f"Creating task with ID: {task_id}")
    
    task = ScraperTask(task_id)
    print(f"Task created: {task}")
    
    # Add to active tasks
    add_task(task_id, task)
    print("Task added to active tasks")
    
    # Try to retrieve it
    retrieved_task = get_task(task_id)
    if retrieved_task:
        print(f"Task retrieved successfully: {retrieved_task}")
        print(f"Task status: {retrieved_task.status}")
        print(f"Task type: {retrieved_task.task_type}")
    else:
        print("ERROR: Task not found after adding!")
    
    # Remove task
    removed = remove_task(task_id)
    print(f"Task removed: {removed}")
    
    # Try to retrieve again
    retrieved_task = get_task(task_id)
    if retrieved_task:
        print("ERROR: Task still exists after removal!")
    else:
        print("Task successfully removed from active tasks")

if __name__ == "__main__":
    test_task_system()