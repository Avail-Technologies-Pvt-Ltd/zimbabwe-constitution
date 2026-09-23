@echo off
title Constitution Website - Production Docker Mode (.env.prod)
cd /d "%~dp0"

echo ===============================================================
echo   ZIMBABWEAN CONSTITUTION - 1-CLICK DOCKER PROD START
echo   Port: 8088
echo ===============================================================
echo.

:: Check Docker availability
docker --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running or not in PATH!
    echo Please make sure Docker Desktop is installed and running.
    pause
    exit /b 1
)

:: Check if .env.prod exists
if not exist ".env.prod" (
    echo Creating default .env.prod...
    (
        echo PORT=8088
        echo HOST=0.0.0.0
        echo APP_ENV=production
        echo APP_TITLE="Constitution of Zimbabwe"
        echo DOCKER_IMAGE=availtechnologies/zimbabwe-constitution:latest
        echo RESTART_POLICY=unless-stopped
    ) > .env.prod
)

echo Building and launching Production Docker container...
echo Port mapped to: http://localhost:8088
echo.

docker compose --env-file .env.prod up --build -d

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===============================================================
    echo   CONTAINER RUNNING SUCCESSFULLY!
    echo   Website available at: http://localhost:8088
    echo ===============================================================
    echo.
    echo Launching browser...
    start http://localhost:8088
) else (
    echo.
    echo [ERROR] Docker build/start failed! Check docker daemon.
)

pause
