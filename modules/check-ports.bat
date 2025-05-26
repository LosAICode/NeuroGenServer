@echo off
echo.
echo 🔍 Checking for processes using NeuroGen ports...
echo ================================================
echo.

REM Check default port 5000
echo Checking port 5000...
netstat -ano | findstr :5000
echo.

REM Check port 5025 (alternative)
echo Checking port 5025...
netstat -ano | findstr :5025
echo.

echo.
echo 🛑 To kill a process using a port:
echo    1. Note the PID (last column) from above
echo    2. Run: taskkill /PID [PID_NUMBER] /F
echo.
echo 💡 Or use the kill-port.bat script with the port number
echo.
pause
