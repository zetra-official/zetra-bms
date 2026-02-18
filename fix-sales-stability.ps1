# fix-sales-stability.ps1
# SAFE PATCH for ZETRA BMS:
# 1) Fix receipt route mismatch (recept vs receipt)
# 2) Patch route strings in sales screens
# 3) Detect duplicate route folders (app/sales vs app/(tabs)/sales)
# 4) Give clear next instructions for DB RPC get_products()

$ErrorActionPreference = "Stop"

function Write-Ok($m){ Write-Host "[OK]  $m" -ForegroundColor Green }
function Write-Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err($m){ Write-Host "[ERR]  $m" -ForegroundColor Red }

$root = Get-Location
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "_patch_backups\$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

Write-Host "Backup folder: $backup" -ForegroundColor Cyan

function Backup-File($path){
  if(Test-Path $path){
    $rel = Resolve-Path $path | ForEach-Object { $_.Path.Substring($root.Path.Length).TrimStart('\','/') }
    $dest = Join-Path $backup $rel
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -Force $path $dest
  }
}

$tabsSales = Join-Path $root "app\(tabs)\sales"
$plainSales = Join-Path $root "app\sales"

$hasTabsSales = Test-Path $tabsSales
$hasPlainSales = Test-Path $plainSales

Write-Ok ("Found app/(tabs)/sales: " + $hasTabsSales)
Write-Ok ("Found app/sales: " + $hasPlainSales)

if($hasTabsSales -and $hasPlainSales){
  Write-Warn "You have BOTH app/sales and app/(tabs)/sales. This can cause duplicate routes + 'Too many screens defined'."
  Write-Warn "Recommended: keep ONLY app/(tabs)/sales (DORA v1) and remove/move app/sales if it exists."
}

if(-not $hasTabsSales){
  Write-Err "Missing folder app/(tabs)/sales. Script expects sales screens there."
  exit 1
}

$recept = Join-Path $tabsSales "recept.tsx"
$receipt = Join-Path $tabsSales "receipt.tsx"

if(Test-Path $recept){
  Backup-File $recept
  if(Test-Path $receipt){
    Write-Warn "receipt.tsx already exists; NOT renaming recept.tsx to avoid overwrite."
    Write-Warn "You must manually decide which one is correct."
  } else {
    Rename-Item -Path $recept -NewName "receipt.tsx"
    Write-Ok "Renamed: app/(tabs)/sales/recept.tsx -> receipt.tsx"
  }
} else {
  Write-Ok "No recept.tsx found (good)."
}

$targets = @(
  (Join-Path $tabsSales "checkout.tsx"),
  (Join-Path $tabsSales "history.tsx"),
  (Join-Path $tabsSales "index.tsx"),
  (Join-Path $tabsSales "receipt.tsx"),
  (Join-Path $tabsSales "recept.tsx")
)

$replacements = @(
  @{ from = '"/(tabs)/sales/recept"';  to = '"/(tabs)/sales/receipt"' },
  @{ from = "'/(tabs)/sales/recept'";  to = "'/(tabs)/sales/receipt'" },
  @{ from = '"/sales/recept"';         to = '"/sales/receipt"' },
  @{ from = "'/sales/recept'";         to = "'/sales/receipt'" },

  @{ from = '"/sales/receipt"';        to = '"/(tabs)/sales/receipt"' },
  @{ from = "'/sales/receipt'";        to = "'/(tabs)/sales/receipt'" },
  @{ from = '"/sales/history"';        to = '"/(tabs)/sales/history"' },
  @{ from = "'/sales/history'";        to = "'/(tabs)/sales/history'" },
  @{ from = '"/sales/checkout"';       to = '"/(tabs)/sales/checkout"' },
  @{ from = "'/sales/checkout'";       to = "'/(tabs)/sales/checkout'" }
)

foreach($f in $targets){
  if(Test-Path $f){
    $raw = Get-Content $f -Raw
    $orig = $raw

    foreach($r in $replacements){
      $raw = $raw.Replace($r.from, $r.to)
    }

    if($raw -ne $orig){
      Backup-File $f
      Set-Content -Path $f -Value $raw -Encoding utf8
      Write-Ok "Patched routes: $(Split-Path $f -Leaf)"
    } else {
      Write-Warn "No change: $(Split-Path $f -Leaf)"
    }
  }
}

Write-Host ""
Write-Warn "NEXT: You still MUST fix Supabase RPC: get_products(). PS1 cannot create DB functions."
Write-Warn "Also if you still see duplicate sales tabs/screens, we must fix app/(tabs)/_layout.tsx (Tabs config)."

Write-Ok "DONE. Backup at: $backup"
Write-Host "Now run: npx expo start -c" -ForegroundColor Cyan
