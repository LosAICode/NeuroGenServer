/**
 * NeuroGen Processor - Utils Module Tests
 */

import { describe, test, expect } from './testFramework.js';
import utils from '../modules/utils.js';

describe('Utils Module', () => {
  test('formatBytes should handle zero bytes', () => {
    expect(utils.formatBytes(0) === '0 Bytes', 'Should return "0 Bytes" for 0');
  });
  
  test('formatBytes should handle KB values', () => {
    expect(utils.formatBytes(1024) === '1 KB', 'Should convert 1024 bytes to 1 KB');
  });
  
  test('formatBytes should handle MB values', () => {
    expect(utils.formatBytes(1024 * 1024) === '1 MB', 'Should convert 1MB correctly');
  });
  
  test('formatDuration should handle seconds', () => {
    expect(utils.formatDuration(30) === '30.00 seconds', 'Should format 30 seconds correctly');
  });
  
  test('formatDuration should handle minutes', () => {
    expect(utils.formatDuration(90) === '1 minute 30 seconds', 'Should format 90 seconds as 1 minute 30 seconds');
  });
  
  test('escapeHtml should escape special characters', () => {
    const input = '<script>alert("test")</script>';
    const output = utils.escapeHtml(input);
    expect(!output.includes('<script>'), 'Should escape HTML tags');
    expect(output.includes('&lt;script&gt;'), 'Should convert < to &lt;');
  });
  
  test('sanitizeFilename should remove invalid characters', () => {
    const input = 'file:name?with*invalid/chars';
    const output = utils.sanitizeFilename(input);
    expect(!output.includes(':'), 'Should remove colon');
    expect(!output.includes('?'), 'Should remove question mark');
    expect(!output.includes('*'), 'Should remove asterisk');
    expect(!output.includes('/'), 'Should remove slash');
  });
});