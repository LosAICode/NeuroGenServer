#!/bin/bash

echo ""
echo "🚀 Starting NeuroGen Server on Port 5025"
echo "========================================="
echo ""

# Activate virtual environment if it exists
if [ -f "../../venv/bin/activate" ]; then
    echo "Activating virtual environment..."
    source ../../venv/bin/activate
fi

# Set environment variables
export API_PORT=5025
export API_HOST=0.0.0.0
export API_DEBUG=True

# Start the server
echo "Starting server on http://localhost:5025"
echo ""
python3 server.py --port 5025
