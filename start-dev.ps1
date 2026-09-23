# 1-Click Django Dev Start (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  ZIMBABWEAN CONSTITUTION - DJANGO 1-CLICK DEV START (.env dev)" -ForegroundColor Green
Write-Host "  Port: 8088" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Green

python manage.py migrate --noinput

Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8088"
} | Out-Null

python manage.py runserver 0.0.0.0:8088
