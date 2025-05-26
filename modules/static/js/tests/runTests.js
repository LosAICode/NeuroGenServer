/**
 * NeuroGen Processor - Test Runner
 */

import { runTests } from './testFramework.js';
import './utils.test.js';
import './ui.test.js';
import './stateManager.test.js';
// Add more test imports here as they are created

console.log('Starting NeuroGen module tests...');
runTests();