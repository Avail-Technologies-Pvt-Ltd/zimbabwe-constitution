# 1-Click Push to Git (PowerShell) - Avail Technologies
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  ZIMBABWEAN CONSTITUTION (DJANGO) - 1-CLICK PUSH TO GIT" -ForegroundColor Green
Write-Host "  Target: https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Green

# Ensure remote
try {
    $remote = git remote get-url origin 2>$null
    if (-not $remote) {
        git remote add origin https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution.git
    }
} catch {
    git remote add origin https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution.git
}

Write-Host "Staging changes..." -ForegroundColor Cyan
git add -A

$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit. Pushing to origin main..." -ForegroundColor Yellow
    git push -u origin main
    exit 0
}

$defaultMsg = "Update Django Constitution [$(Get-Date -Format 'yyyy-MM-dd HH:mm')]"
$customMsg = Read-Host "Enter commit message (Press Enter for '$defaultMsg')"
$commitMsg = if ($customMsg -and $customMsg.Trim() -ne "") { $customMsg } else { $defaultMsg }

Write-Host "Committing: $commitMsg" -ForegroundColor Cyan
git commit -m $commitMsg

Write-Host "Pushing to origin main..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSUCCESS! Pushed to https://github.com/Avail-Technologies-Pvt-Ltd/zimbabwe-constitution" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Push failed. Check credentials or network." -ForegroundColor Red
}
