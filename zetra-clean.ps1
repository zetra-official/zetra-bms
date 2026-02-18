Write-Host "=== ZETRA TS CLEAN RESET START ===" -ForegroundColor Cyan

if (-not (Test-Path ".\package.json")) {
  Write-Host "ERROR: package.json haipo. Hakikisha uko root ya project." -ForegroundColor Red
  exit 1
}

Write-Host "Killing node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path ".\node_modules") {
  Write-Host "Removing node_modules..." -ForegroundColor Yellow
  Remove-Item ".\node_modules" -Recurse -Force
}

if (Test-Path ".\package-lock.json") { Remove-Item ".\package-lock.json" -Force }
if (Test-Path ".\yarn.lock") { Remove-Item ".\yarn.lock" -Force }
if (Test-Path ".\pnpm-lock.yaml") { Remove-Item ".\pnpm-lock.yaml" -Force }

if (Test-Path ".\.expo") {
  Remove-Item ".\.expo" -Recurse -Force
}

Write-Host "Clearing temp metro cache..." -ForegroundColor Yellow
Get-ChildItem $env:TEMP -Filter "metro-cache*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem $env:TEMP -Filter "haste-map*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

Write-Host "Reinstalling dependencies..." -ForegroundColor Cyan
npm install

Write-Host "=== ZETRA TS CLEAN RESET DONE ===" -ForegroundColor Green
Write-Host "NEXT: run -> npx expo start -c" -ForegroundColor Cyan