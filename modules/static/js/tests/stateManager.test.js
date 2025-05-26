/**
 * NeuroGen Processor - State Manager Tests
 */

import { describe, test, expect } from './testFramework.js';
import stateManager from '../modules/stateManager.js';

describe('State Manager Module', () => {
  test('getCurrentTaskId should return initialized value', () => {
    // Initial value should be null or from session storage
    const initialValue = stateManager.getCurrentTaskId();
    expect(initialValue === null || typeof initialValue === 'string', 'Initial value should be null or string');
  });
  
  test('setCurrentTaskId should update the task ID', () => {
    const testId = 'test-task-id-123';
    stateManager.setCurrentTaskId(testId);
    expect(stateManager.getCurrentTaskId() === testId, 'Task ID should be updated');
  });
  
  test('resetTaskState should clear task state', () => {
    // Set some values first
    stateManager.setCurrentTaskId('test-id');
    stateManager.setTaskType('test-type');
    stateManager.setOutputFile('test-file');
    stateManager.setCompletionTriggered(true);
    stateManager.setTaskCompleted(true);
    
    // Reset the state
    stateManager.resetTaskState();
    
    // Verify all values are reset
    expect(stateManager.getCurrentTaskId() === null, 'Task ID should be null');
    expect(stateManager.getTaskType() === null, 'Task type should be null');
    expect(stateManager.getOutputFile() === null, 'Output file should be null');
    expect(stateManager.isCompletionTriggered() === false, 'Completion triggered should be false');
    expect(stateManager.isTaskCompleted() === false, 'Task completed should be false');
  });
  
  test('isHelpMode and setHelpMode should work correctly', () => {
    // Initial value should be false
    expect(stateManager.isHelpMode() === false, 'Initial help mode should be false');
    
    // Set to true
    stateManager.setHelpMode(true);
    expect(stateManager.isHelpMode() === true, 'Help mode should be set to true');
    
    // Set back to false
    stateManager.setHelpMode(false);
    expect(stateManager.isHelpMode() === false, 'Help mode should be set to false');
  });
  
  test('isAppInitialized and setAppInitialized should work correctly', () => {
    // Initial state might be true or false depending on when test is run
    const initialValue = stateManager.isAppInitialized();
    
    // Toggle the value
    stateManager.setAppInitialized(!initialValue);
    expect(stateManager.isAppInitialized() === !initialValue, 'App initialized should be toggled');
    
    // Set back to initial value
    stateManager.setAppInitialized(initialValue);
  });
  
  test('Latest task data should be stored and retrieved', () => {
    const testData = { test: 'data', value: 123 };
    stateManager.setLatestTaskData(testData);
    
    const retrievedData = stateManager.getLatestTaskData();
    expect(retrievedData === testData, 'Latest task data should be the same reference');
    expect(retrievedData.test === 'data', 'Data property should match');
    expect(retrievedData.value === 123, 'Value property should match');
  });
});