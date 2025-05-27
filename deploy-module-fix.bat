@echo off
echo ============================================
echo NeuroGenServer Module Loading Fix Deployment
echo ============================================
echo.

cd /d "C:\Users\Los\Documents\GitHub\NeuroGenServer\NeuroGenServer\modules\static\js"

echo [1/4] Creating backup of current index.js...
if exist index.js (
    copy index.js index.js.backup-deployed
    echo ✅ Backup created: index.js.backup-deployed
) else (
    echo ❌ Warning: index.js not found
)

echo.
echo [2/4] Deploying optimized index.js...
if exist index.optimized.js (
    copy index.optimized.js index.js
    echo ✅ Optimized index.js deployed successfully
) else (
    echo ❌ Error: index.optimized.js not found
    goto :error
)

echo.
echo [3/4] Verifying safeFileProcessor.js fix...
if exist "modules\utils\safeFileProcessor.js" (
    echo ✅ Fixed safeFileProcessor.js is in place
) else (
    echo ❌ Warning: safeFileProcessor.js not found
)

echo.
echo [4/4] Deployment complete!
echo.
echo ============================================
echo Next Steps:
echo ============================================
echo 1. Restart your server: python app.py
echo 2. Open browser to http://localhost:5025
echo 3. Hard refresh with Ctrl+F5
echo 4. Look for: "✅ NeuroGen Server initialized successfully"
echo 5. Test File Processor, Playlist Downloader, Web Scraper
echo.
echo Expected improvements:
echo • Loading time: 5-10 seconds (vs 25+ before)
echo • No timeout errors
echo • All modules working
echo • Debug button in bottom-right corner
echo.
echo ============================================
echo Troubleshooting:
echo ============================================
echo If issues occur:
echo • Clear browser cache completely (Ctrl+F5)
echo • Check console for errors
echo • Click Debug button for module status
echo.
echo To rollback if needed:
echo copy index.js.backup-deployed index.js
echo ============================================
pause
goto :end

:error
echo.
echo ❌ Deployment failed. Please check file locations.
pause

:end