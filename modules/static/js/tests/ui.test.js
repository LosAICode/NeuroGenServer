/**
 * NeuroGen Processor - UI Module Tests
 */

import { describe, test, expect } from './testFramework.js';
import ui from '../modules/ui.js';

describe('UI Module', () => {
  test('updateProgressBarElement should handle null element', () => {
    // This should not throw an error
    ui.updateProgressBarElement(null, 50);
    expect(true, 'Should handle null element gracefully');
  });
  
  test('updateProgressStatus should handle null element', () => {
    // This should not throw an error
    ui.updateProgressStatus(null, 'Test message');
    expect(true, 'Should handle null element gracefully');
  });
  
  test('makeDraggable should handle null element', () => {
    // This should not throw an error
    ui.makeDraggable(null);
    expect(true, 'Should handle null element gracefully');
  });
  
  // Mock DOM elements for testing
  const mockProgressBar = () => {
    const element = document.createElement('div');
    element.style.width = '0%';
    element.setAttribute('aria-valuenow', '0');
    element.textContent = '0%';
    element.classList.add('progress-bar');
    return element;
  };
  
  test('updateProgressBarElement should update width and text', () => {
    // Skip if not in a browser environment
    if (typeof document === 'undefined') return;
    
    const element = mockProgressBar();
    ui.updateProgressBarElement(element, 50);
    
    expect(element.style.width === '50%', 'Should set width to 50%');
    expect(element.getAttribute('aria-valuenow') === '50', 'Should set aria-valuenow to 50');
    expect(element.textContent === '50%', 'Should set text content to 50%');
  });
  
  test('updateProgressBarElement should handle values over 100', () => {
    // Skip if not in a browser environment
    if (typeof document === 'undefined') return;
    
    const element = mockProgressBar();
    ui.updateProgressBarElement(element, 150);
    
    expect(element.style.width === '100%', 'Should cap width at 100%');
    expect(element.getAttribute('aria-valuenow') === '100', 'Should cap aria-valuenow at 100');
  });
  
  test('updateProgressStatus should update text content', () => {
    // Skip if not in a browser environment
    if (typeof document === 'undefined') return;
    
    const element = document.createElement('div');
    element.textContent = 'Old status';
    
    ui.updateProgressStatus(element, 'New status');
    
    // Since the animation is async, we need to check after a delay
    setTimeout(() => {
      expect(element.textContent === 'New status', 'Should update text content');
    }, 300);
  });
});