@echo off
title Constitution Website - Django Dev Mode (.env.dev)
cd /d "%~dp0"

echo ===============================================================
echo   ZIMBABWEAN CONSTITUTION - DJANGO 1-CLICK DEV START
echo   Port: 8088
echo ===============================================================
echo.

:: Check Python
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

:: Run migrations
echo Checking database migrations...
python manage.py migrate --noinput

:: Open browser after 2 seconds
start /b cmd /c "timeout /t 2 >nul & start http://localhost:8088"

echo.
echo Starting Django Development Server at http://localhost:8088 ...
echo Press Ctrl+C to stop the server.
echo ===============================================================
python manage.py runserver 0.0.0.0:8088

pause
