@echo off
title Constitution Website - Dev Mode (.env dev)
cd /d "%~dp0"

echo ===============================================================
echo   ZIMBABWEAN CONSTITUTION - 1-CLICK DEV START
echo ===============================================================
echo.

:: Check if .env.dev exists; create default if missing
if not exist ".env.dev" (
    echo Creating default .env.dev configuration...
    (
        echo PORT=8000
        echo HOST=0.0.0.0
        echo APP_ENV=development
        echo APP_TITLE="Constitution of Zimbabwe (Dev)"
        echo AUTO_OPEN_BROWSER=true
    ) > .env.dev
)

:: Check Python availability
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.8+ to run the local dev server.
    pause
    exit /b 1
)

echo Starting Development Server with .env.dev settings...
echo Local address: http://localhost:8000
echo.
python scripts\serve.py

pause
