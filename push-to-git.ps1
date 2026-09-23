# 1-Click Push to Git (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  ZIMBABWEAN CONSTITUTION - 1-CLICK PUSH TO GIT" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green

# Check git
try {
    git --version | Out-Null
} catch {
    Write-Host "[ERROR] Git is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}

# Init if needed
if (-not (Test-Path ".git")) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Check remote
$hasRemote = $false
try {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl) {
        $hasRemote = $true
        Write-Host "Remote origin: $remoteUrl" -ForegroundColor Cyan
    }
} catch {}

if (-not $hasRemote) {
    Write-Host "[NOTICE] No remote 'origin' configured." -ForegroundColor Yellow
    $userInputUrl = Read-Host "Enter your remote GitHub repository URL (or press Enter to skip)"
    if ($userInputUrl -and $userInputUrl.Trim() -ne "") {
        git remote add origin $userInputUrl.Trim()
        $hasRemote = $true
        Write-Host "Remote added: $userInputUrl" -ForegroundColor Green
    }
}

# Stage changes
Write-Host "Staging all changes..." -ForegroundColor Cyan
git add -A

# Check if there are changes to commit
$status = git status --porcelain
if (-not $status) {
    Write-Host "Working directory clean. No new changes to commit." -ForegroundColor Yellow
    if ($hasRemote) {
        $pushAnyway = Read-Host "Push existing commits to remote anyway? (y/N)"
        if ($pushAnyway -match "^[yY]") {
            $branch = git branch --show-current
            git push -u origin $branch
        }
    }
    exit 0
}

# Prompt commit message
$defaultMsg = "Update Constitution website [$(Get-Date -Format 'yyyy-MM-dd HH:mm')]"
$customMsg = Read-Host "Enter commit message (Press Enter for '$defaultMsg')"
$commitMsg = if ($customMsg -and $customMsg.Trim() -ne "") { $customMsg } else { $defaultMsg }

Write-Host "Committing: $commitMsg" -ForegroundColor Cyan
git commit -m $commitMsg

# Push if remote exists
if ($hasRemote) {
    $branch = git branch --show-current
    if (-not $branch) { $branch = "main" }
    Write-Host "Pushing to origin/$branch..." -ForegroundColor Cyan
    git push -u origin $branch
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nSUCCESS! Pushed changes to GitHub." -ForegroundColor Green
        Write-Host "GitHub Action workflow will automatically trigger to build & push to Docker Hub." -ForegroundColor Green
    } else {
        Write-Host "`n[ERROR] Push failed. Check your network or GitHub credentials." -ForegroundColor Red
    }
} else {
    Write-Host "Changes committed locally. Add a remote origin to push to GitHub." -ForegroundColor Yellow
}
