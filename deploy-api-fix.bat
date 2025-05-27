@echo off
echo ========================================
echo  URGENT: API Compatibility Fix for NeuroGenServer
echo ========================================
echo.
echo This fixes the "importModule is not a function" errors
echo.

cd /d "C:\Users\Los\Documents\GitHub\NeuroGenServer\NeuroGenServer\modules\static\js"

echo [1/3] Backing up current index.js...
copy index.js index.js.backup-api-fix
echo ✅ Backup created

echo.
echo [2/3] Deploying API-compatible version...
copy index.fixed.js index.js
echo ✅ Fixed index.js deployed

echo.
echo [3/3] Verification...
if exist index.js (
    echo ✅ index.js is in place
) else (
    echo ❌ ERROR: index.js missing
)

echo.
echo ========================================
echo IMMEDIATE ACTIONS REQUIRED:
echo ========================================
echo 1. STOP your server (Ctrl+C)
echo 2. START server: python app.py  
echo 3. REFRESH browser with Ctrl+F5
echo 4. CHECK console for "NeuroGen Server initialized successfully"
echo.
echo Expected fix:
echo • No more "importModule is not a function" errors
echo • All modules should load properly
echo • App.js compatibility restored
echo ========================================
pause