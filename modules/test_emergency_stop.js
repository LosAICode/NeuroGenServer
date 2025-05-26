// Test Emergency Stop Functionality
// Paste this in browser console to test

// Test 1: Check if emergency stop function exists
console.log('Emergency stop available:', typeof window.fileProcessor?.emergencyStop === 'function');

// Test 2: Trigger emergency stop programmatically
function testEmergencyStop() {
    if (window.fileProcessor && typeof window.fileProcessor.emergencyStop === 'function') {
        console.log('Triggering emergency stop...');
        window.fileProcessor.emergencyStop('Test trigger');
    } else {
        console.error('Emergency stop not available');
    }
}

// Test 3: Check keyboard shortcut
console.log('Keyboard shortcut: Ctrl+Shift+X');

// Test 4: Direct API call
async function testEmergencyAPI() {
    try {
        const response = await fetch('/api/emergency-stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'API test' })
        });
        const result = await response.json();
        console.log('API Response:', result);
    } catch (error) {
        console.error('API Error:', error);
    }
}

// Test 5: Socket.IO emergency stop
function testSocketEmergency() {
    if (window.socket && window.socket.connected) {
        window.socket.emit('emergency_stop', {
            reason: 'Socket test',
            timestamp: Date.now()
        });
        console.log('Emergency stop emitted via Socket.IO');
    } else {
        console.error('Socket.IO not connected');
    }
}

console.log('Test functions available:');
console.log('- testEmergencyStop()');
console.log('- testEmergencyAPI()');
console.log('- testSocketEmergency()');
