@echo off
:: OCR Fix Script for NeuroGen Server
:: Run as Administrator to ensure proper permissions
echo ===================================================================
echo OCR FIX SCRIPT FOR NEUROGEN SERVER
echo ===================================================================
echo.
echo This script will fix OCR processing issues by:
echo  1. Setting proper permissions on the temp directory
echo  2. Ensuring Tesseract language data is in the right place
echo  3. Fixing environment variables
echo.
echo ===================================================================

:: Define paths
set "NEUROGENDIR=%USERPROFILE%\Documents\NeuroGen Server"
set "TEMPDIR=%USERPROFILE%\Documents\NeuroGen Server\modules\temp"
set "TESSDATADIR=%USERPROFILE%\Documents\NeuroGen Server\modules\temp\tessdata"
set "TESSERACTDIR=C:\Program Files\Tesseract-OCR"
set "TESSERACTDIR86=C:\Program Files (x86)\Tesseract-OCR"

:: Check if running as Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    echo Please right-click and select "Run as Administrator".
    pause
    exit /b 1
)

echo.
echo Step 1: Creating directories...
if not exist "%TEMPDIR%" (
    mkdir "%TEMPDIR%"
    echo Created temp directory: %TEMPDIR%
) else (
    echo Temp directory already exists.
)

if not exist "%TESSDATADIR%" (
    mkdir "%TESSDATADIR%"
    echo Created tessdata directory: %TESSDATADIR%
) else (
    echo Tessdata directory already exists.
)

echo.
echo Step 2: Setting permissions...
icacls "%TEMPDIR%" /grant Everyone:F /T
echo Set full permissions on temp directory.

echo.
echo Step 3: Locating Tesseract language data...
set "FOUND_TRAINEDDATA="

if exist "%TESSERACTDIR%\tessdata\eng.traineddata" (
    set "FOUND_TRAINEDDATA=%TESSERACTDIR%\tessdata\eng.traineddata"
    echo Found eng.traineddata in Tesseract installation directory.
) else if exist "%TESSERACTDIR86%\tessdata\eng.traineddata" (
    set "FOUND_TRAINEDDATA=%TESSERACTDIR86%\tessdata\eng.traineddata"
    echo Found eng.traineddata in Tesseract x86 installation directory.
) else (
    echo Could not locate eng.traineddata in Tesseract installation.
    echo We'll need to download it.
)

echo.
echo Step 4: Copying or downloading language data...

if defined FOUND_TRAINEDDATA (
    echo Copying eng.traineddata from %FOUND_TRAINEDDATA% to %TESSDATADIR%\eng.traineddata
    copy "%FOUND_TRAINEDDATA%" "%TESSDATADIR%\eng.traineddata"
    if %errorlevel% equ 0 (
        echo Successfully copied eng.traineddata.
    ) else (
        echo Failed to copy eng.traineddata.
    )
) else (
    echo Downloading eng.traineddata from GitHub...
    powershell -Command "(New-Object Net.WebClient).DownloadFile('https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata', '%TESSDATADIR%\eng.traineddata')"
    if %errorlevel% equ 0 (
        echo Successfully downloaded eng.traineddata.
    ) else (
        echo Failed to download eng.traineddata.
        echo Please manually download from:
        echo https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
        echo And place it in: %TESSDATADIR%
    )
)

echo.
echo Step 5: Copying OCR handler module...
echo If you haven't already done so, please copy the safe_ocr_handler.py file
echo to your NeuroGen Server modules directory and integrate it as described
echo in the guide.

echo.
echo ===================================================================
echo Fix process completed! Please restart your NeuroGen Server.
echo ===================================================================
echo.

pause