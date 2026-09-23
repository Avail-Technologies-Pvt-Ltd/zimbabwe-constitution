# 1-Click Dev Start (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  ZIMBABWEAN CONSTITUTION - 1-CLICK DEV START (.env dev)" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green

if (-not (Test-Path ".env.dev")) {
    Write-Host "Creating default .env.dev configuration..." -ForegroundColor Yellow
    @"
PORT=8000
HOST=0.0.0.0
APP_ENV=development
APP_TITLE="Constitution of Zimbabwe (Dev)"
AUTO_OPEN_BROWSER=true
"@ | Out-File -FilePath ".env.dev" -Encoding utf8
}

python scripts/serve.py
