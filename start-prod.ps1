# 1-Click Production Docker Start (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  ZIMBABWEAN CONSTITUTION - 1-CLICK DOCKER PROD START" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green

# Verify Docker is running
try {
    $dockerVer = docker --version
    Write-Host "Found Docker: $dockerVer" -ForegroundColor Cyan
} catch {
    Write-Host "[ERROR] Docker is not running or not in PATH!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop." -ForegroundColor Yellow
    exit 1
}

docker compose --env-file .env.prod up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nContainer started successfully!" -ForegroundColor Green
    Write-Host "Opening http://localhost:8080 in default browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:8080"
} else {
    Write-Host "`n[ERROR] Docker Compose failed to start container." -ForegroundColor Red
}
