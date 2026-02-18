# ZETRA ROUTES FIX (Safe: creates missing routes ONLY, no overwrite)
# Run: powershell -ExecutionPolicy Bypass -File .\zetra-routes-fix.ps1

$ErrorActionPreference = "Stop"

function EnsureDir($p){ New-Item -ItemType Directory -Force -Path $p | Out-Null }
function WriteIfMissing($path, $content) {
  if (Test-Path $path) {
    Write-Host "[SKIP] Exists: $path" -ForegroundColor Yellow
    return
  }
  $dir = Split-Path $path -Parent
  EnsureDir $dir
  Set-Content -LiteralPath $path -Value $content -Encoding UTF8
  Write-Host "[OK]   Created: $path" -ForegroundColor Green
}

# detect correct "app/(tabs)/club" folder (windows may show backslashes)
$root = (Get-Location).Path
$club = Join-Path $root "app\(tabs)\club"
if (-not (Test-Path $club)) { $club = Join-Path $root "app/(tabs)/club" }
if (-not (Test-Path $club)) { throw "Missing: app/(tabs)/club" }

# IMPORTANT: if club/orders/[orderId].tsx is a stub redirecting to /club/customer,
# we still create customer/store routes to stop Unmatched Route immediately.
$customerCreate = @'
import { Redirect } from "expo-router";
export default function CustomerCreateAlias() {
  return <Redirect href="/(tabs)/club/orders/create" />;
}
'@

$customerDetail = @'
import { Redirect, useLocalSearchParams } from "expo-router";
export default function CustomerDetailAlias() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={"/(tabs)/club/orders/" + (orderId ?? "")} />;
}
'@

$storeDetail = @'
import { Redirect, useLocalSearchParams } from "expo-router";
export default function StoreDetailAlias() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={"/(tabs)/club/orders/" + (orderId ?? "")} />;
}
'@

# Create missing alias routes (these were missing in your sitemap)
WriteIfMissing (Join-Path $club "customer\orders\create\index.tsx") $customerCreate
WriteIfMissing (Join-Path $club "customer\orders\[orderId].tsx") $customerDetail
WriteIfMissing (Join-Path $club "store\orders\[orderId].tsx") $storeDetail

Write-Host "`nDONE. Now restart metro clean:" -ForegroundColor Cyan
Write-Host "  npx expo start -c" -ForegroundColor Cyan