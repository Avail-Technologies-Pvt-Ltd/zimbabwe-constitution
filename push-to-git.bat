@echo off
title 1-Click Push to Git
cd /d "%~dp0"

echo ===============================================================
echo   ZIMBABWEAN CONSTITUTION - 1-CLICK PUSH TO GIT
echo ===============================================================
echo.

:: 1. Check Git Installation
git --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    pause
    exit /b 1
)

:: 2. Initialize Git if not already done
if not exist ".git" (
    echo Initializing new Git repository...
    git init
    git branch -M main
    echo.
)

:: 3. Check for remote origin
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [NOTICE] No remote 'origin' found.
    set /p REMOTE_URL="Enter your remote GitHub repository URL (e.g. https://github.com/user/repo.git): "
    if not "%REMOTE_URL%"=="" (
        git remote add origin %REMOTE_URL%
        echo Remote added: %REMOTE_URL%
    ) else (
        echo [WARNING] No remote configured. Commits will be made locally only.
    )
    echo.
)

:: 4. Stage all changes
echo Staging files...
git add -A

:: 5. Get current date/time for default commit message
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%

echo.
set /p COMMIT_MSG="Enter commit message (Press Enter for 'Update [%TIMESTAMP%]'): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update Constitution website [%TIMESTAMP%]

:: 6. Commit
echo.
echo Committing changes...
git commit -m "%COMMIT_MSG%"

:: 7. Push to Remote
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo Pushing to remote repository...
    for /f %%b in ('git branch --show-current') do set CURRENT_BRANCH=%%b
    if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

    git push -u origin %CURRENT_BRANCH%
    if %ERRORLEVEL% equ 0 (
        echo.
        echo ===============================================================
        echo   SUCCESSFULLY PUSHED TO GIT!
        echo   Branch: %CURRENT_BRANCH%
        echo   Docker Hub action workflow will trigger automatically.
        echo ===============================================================
    ) else (
        echo.
        echo [ERROR] Failed to push to remote. Please check credentials or network.
    )
) else (
    echo Changes committed locally. To push to GitHub later, run:
    echo   git remote add origin YOUR_REPO_URL
    echo   git push -u origin main
)

echo.
pause
