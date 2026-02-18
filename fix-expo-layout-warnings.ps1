# fix-expo-layout-warnings.ps1
# ZETRA BMS  CLEANUP: Remove duplicate Stack.Screen definitions
# SAFE: Creates backup before patching

$ErrorActionPreference = "Stop"

function OK($m){ Write-Host "[OK]  $m" -ForegroundColor Green }
function WARN($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function ERR($m){ Write-Host "[ERR] $m" -ForegroundColor Red }

if (!(Test-Path ".\package.json")) {
  ERR "Run this script from project root (package.json missing)."
  exit 1
}

$target = "app\(tabs)\sales\_layout.tsx"
if (!(Test-Path $target)) {
  ERR "Missing file: $target"
  exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = ".\_patch_backups\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$backupFile = Join-Path $backupDir "sales__layout.tsx.bak"
Copy-Item $target $backupFile -Force
OK "Backup created: $backupFile"

$content = Get-Content $target -Raw
$original = $content

if ($content -match "<Stack[^>]*>" -and $content -match "<Stack\.Screen") {
  $content = [regex]::Replace(
    $content,
    "(?s)<Stack(?<attrs>[^>]*)>.*?</Stack>",
    {
      param($m)
      $attrs = $m.Groups["attrs"].Value
      if ($attrs -notmatch "screenOptions") {
        $attrs = "$attrs screenOptions={{ headerShown: false }}"
      }
      "<Stack$attrs />"
    }
  )
  OK "Removed manual <Stack.Screen> definitions (file-based routing only)."
} else {
  WARN "No Stack.Screen blocks found  nothing changed."
}

if ($content -ne $original) {
  Set-Content -Path $target -Value $content -Encoding UTF8
  OK "Patched file saved."
} else {
  WARN "File already clean."
}

OK "DONE"
OK "Backup folder: $backupDir"
