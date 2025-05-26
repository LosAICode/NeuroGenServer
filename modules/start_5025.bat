@echo off
echo.
echo 🚀 Starting NeuroGen Server on Port 5025
echo =========================================
echo.

REM Activate virtual environment if it exists
if exist "..\..\venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call ..\..\venv\Scripts\activate.bat
)

REM Set environment variables
set API_PORT=5025
set API_HOST=0.0.0.0
set API_DEBUG=True

REM Start the server
echo Starting server on http://localhost:5025
echo.
python main.py --port 5025

pause
