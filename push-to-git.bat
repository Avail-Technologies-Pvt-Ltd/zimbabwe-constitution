@echo off
title 1-Click Push to Git - Avail Technologies
cd /d "%~dp0"

echo ===============================================================
echo   ZIMBABWEAN CONSTITUTION (DJANGO) - 1-CLICK PUSH TO GIT
echo   Target Repo: https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution
echo ===============================================================
echo.

:: 1. Ensure remote is set
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% neq 0 (
    git remote add origin https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution.git
    echo Remote configured: https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution.git
)

:: 2. Stage changes
echo Staging files...
git add -A

:: 3. Timestamped commit
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%

echo.
set /p COMMIT_MSG="Enter commit message (Press Enter for 'Update Django Constitution [%TIMESTAMP%]'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update Django Constitution [%TIMESTAMP%]

echo.
echo Committing changes...
git commit -m "%COMMIT_MSG%"

:: 4. Push to origin main
echo.
echo Pushing to GitHub (https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution)...
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===============================================================
    echo   SUCCESS! Changes pushed to GitHub repository.
    echo   Docker Hub workflow has been triggered automatically.
    echo ===============================================================
) else (
    echo.
    echo [ERROR] Push failed. If authentication is needed, please ensure
    echo you are logged into GitHub via Git Credential Manager or GitHub CLI.
)

echo.
pause
