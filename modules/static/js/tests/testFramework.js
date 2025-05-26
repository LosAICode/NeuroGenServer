/**
 * NeuroGen Processor - Testing Framework
 * 
 * Simple testing framework for module testing
 */

const tests = [];
let currentSuite = null;

/**
 * Define a test suite
 * @param {string} name - Suite name
 * @param {Function} fn - Suite function
 */
export function describe(name, fn) {
  currentSuite = name;
  console.group(`Test Suite: ${name}`);
  fn();
  console.groupEnd();
  currentSuite = null;
}

/**
 * Define a test case
 * @param {string} name - Test name
 * @param {Function} fn - Test function
 */
export function test(name, fn) {
  const testInfo = {
    suite: currentSuite,
    name,
    fn
  };
  
  tests.push(testInfo);
  runTest(testInfo);
}

/**
 * Run a test
 * @param {Object} testInfo - Test information
 */
function runTest(testInfo) {
  try {
    testInfo.fn();
    console.log(`%c✓ ${testInfo.name}`, 'color: green');
  } catch (error) {
    console.error(`%c✗ ${testInfo.name}`, 'color: red');
    console.error(error);
  }
}

/**
 * Assert that a condition is true
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message
 */
export function expect(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

/**
 * Run all tests
 */
export function runTests() {
  let passed = 0;
  let failed = 0;
  
  console.log('Running all tests...');
  
  tests.forEach(testInfo => {
    try {
      testInfo.fn();
      passed++;
      console.log(`%c✓ ${testInfo.suite}: ${testInfo.name}`, 'color: green');
    } catch (error) {
      failed++;
      console.error(`%c✗ ${testInfo.suite}: ${testInfo.name}`, 'color: red');
      console.error(error);
    }
  });
  
  console.log(`%cTests completed: ${passed} passed, ${failed} failed`, failed > 0 ? 'color: red' : 'color: green');
}

// Export test functions
export default {
  describe,
  test,
  expect,
  runTests
};