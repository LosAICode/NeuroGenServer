@echo off
if "%1"=="" (
    echo.
    echo ❌ Usage: kill-port.bat [PORT_NUMBER]
    echo    Example: kill-port.bat 5000
    echo.
    pause
    exit /b 1
)

echo.
echo 🔍 Finding process using port %1...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%1 ^| findstr LISTENING') do (
    set PID=%%a
    goto :found
)

echo ❌ No process found listening on port %1
echo.
pause
exit /b 0

:found
echo ✅ Found process with PID: %PID%
echo.
echo 🛑 Killing process...
taskkill /PID %PID% /F

if %ERRORLEVEL% == 0 (
    echo.
    echo ✅ Successfully killed process on port %1
) else (
    echo.
    echo ❌ Failed to kill process. You may need to run as Administrator.
)

echo.
pause
