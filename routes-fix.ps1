# ZETRA BMS - ROUTES FIX (Customer vs Store)
# Run from project root:  powershell -ExecutionPolicy Bypass -File .\routes-fix.ps1

$ErrorActionPreference = "Stop"

function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail($m){ Write-Host "[FAIL] $m" -ForegroundColor Red }

$root = (Get-Location).Path
Info "Project root = $root"

# Resolve app/(tabs)/club path safely
$clubRoot = Join-Path $root "app\(tabs)\club"
if (-not (Test-Path $clubRoot)) {
  # fallback (some shells keep forward slashes)
  $clubRoot = Join-Path $root "app/(tabs)/club"
}
if (-not (Test-Path $clubRoot)) {
  Fail "Cannot find club folder. Expected: app\(tabs)\club"
  throw "Missing app/(tabs)/club"
}
Ok "Found club root: $clubRoot"

# Target folders
$customerOrdersDir = Join-Path $clubRoot "customer\orders"
$storeOrdersDir    = Join-Path $clubRoot "store\orders"

New-Item -ItemType Directory -Force -Path $customerOrdersDir | Out-Null
New-Item -ItemType Directory -Force -Path $storeOrdersDir    | Out-Null
Ok "Ensured folders:"
Info " - $customerOrdersDir"
Info " - $storeOrdersDir"

# Old paths (current problematic structure)
$oldCustomerDetail = Join-Path $clubRoot "orders\[orderId].tsx"
$oldStoreDetail    = Join-Path $clubRoot "orders\store\[orderId].tsx"

# New paths (fixed structure)
$newCustomerDetail = Join-Path $customerOrdersDir "[orderId].tsx"
$newStoreDetail    = Join-Path $storeOrdersDir "[orderId].tsx"

# Backup folder
$backupDir = Join-Path $root ".zetra-route-backup"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function SafeMove($from, $to) {
  if (-not (Test-Path $from)) {
    Warn "Not found (skip): $from"
    return
  }
  if (Test-Path $to) {
    Warn "Target already exists (no overwrite): $to"
    Warn "Leaving source as-is: $from"
    return
  }

  $base = Split-Path $from -Leaf
  $bak  = Join-Path $backupDir ("$base.$stamp.bak")
  Copy-Item -LiteralPath $from -Destination $bak -Force
  Ok "Backup created: $bak"

  $toDir = Split-Path $to -Parent
  New-Item -ItemType Directory -Force -Path $toDir | Out-Null

  Move-Item -LiteralPath $from -Destination $to -Force
  Ok "Moved: $from  -->  $to"
}

Info "Moving route files..."
SafeMove $oldCustomerDetail $newCustomerDetail
SafeMove $oldStoreDetail    $newStoreDetail

# ------------------------------------------------------------
# Auto update route strings in TS/TSX
# Replace ONLY what we need:
#   /club/orders/${orderId}         -> /club/customer/orders/${orderId}
#   /club/orders/store/${orderId}   -> /club/store/orders/${orderId}
# and similar string occurrences.
# ------------------------------------------------------------

Info "Updating route strings in .ts/.tsx (safe replace)..."

$searchRoots = @(
  (Join-Path $root "app"),
  (Join-Path $root "src")
) | Where-Object { Test-Path $_ }

if ($searchRoots.Count -eq 0) {
  Warn "No app/ or src/ folders found to scan. Skipping string replacements."
} else {
  $files = @()
  foreach ($sr in $searchRoots) {
    $files += Get-ChildItem -Path $sr -Recurse -File -Include *.ts, *.tsx -ErrorAction SilentlyContinue |
      Where-Object {
        $_.FullName -notmatch "\\node_modules\\" -and
        $_.FullName -notmatch "\\.expo\\" -and
        $_.FullName -notmatch "\\dist\\" -and
        $_.FullName -notmatch "\\build\\"
      }
  }

  $changed = 0
  foreach ($f in $files) {
    $p = $f.FullName
    $txt = Get-Content -LiteralPath $p -Raw -ErrorAction SilentlyContinue
    if ($null -eq $txt) { continue }

    $orig = $txt

    # Replace store route first (more specific)
    $txt = $txt.Replace("/club/orders/store/", "/club/store/orders/")

    # Replace generic customer route
    # NOTE: if you have both, store is already handled above
    $txt = $txt.Replace("/club/orders/", "/club/customer/orders/")

    if ($txt -ne $orig) {
      # Backup file once
      $bakPath = Join-Path $backupDir (($f.Name) + "." + $stamp + ".routes.bak")
      Copy-Item -LiteralPath $p -Destination $bakPath -Force

      Set-Content -LiteralPath $p -Value $txt -Encoding UTF8
      $changed++
      Ok "Updated: $p"
    }
  }

  Ok "Route-string updates done. Files changed: $changed"
}

Ok "DONE. Now restart expo:"
Info "  1) Stop metro (Ctrl+C)"
Info "  2) npx expo start -c"