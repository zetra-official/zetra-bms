# ZETRA - ROUTE STUBS FIX (redirect old routes to new routes)
# Run: powershell -ExecutionPolicy Bypass -File .\routes-stubs-fix.ps1

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

$root = (Get-Location).Path
$club = Join-Path $root "app\(tabs)\club"
if (-not (Test-Path $club)) { $club = Join-Path $root "app/(tabs)/club" }
if (-not (Test-Path $club)) { throw "Missing app/(tabs)/club" }

# OLD routes (existing links in app)
$oldOrdersDir = Join-Path $club "orders"
$oldOrdersCreate = Join-Path $oldOrdersDir "create\index.tsx"
$oldOrderDetail = Join-Path $oldOrdersDir "[orderId].tsx"
$oldStoreOrderDetail = Join-Path $oldOrdersDir "store\[orderId].tsx"

# NEW routes (your intended separation)
$newCustomerCreatePath = "/(tabs)/club/customer/orders/create"
$newCustomerDetailBase = "/(tabs)/club/customer/orders/"
$newStoreDetailBase    = "/(tabs)/club/store/orders/"

$stubCreate = @"
import { Redirect } from "expo-router";
export default function RouteStub() {
  return <Redirect href="$newCustomerCreatePath" />;
}
"@

$stubCustomerDetail = @"
import { Redirect, useLocalSearchParams } from "expo-router";
export default function RouteStub() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={"$newCustomerDetailBase" + (orderId ?? "")} />;
}
"@

$stubStoreDetail = @"
import { Redirect, useLocalSearchParams } from "expo-router";
export default function RouteStub() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={"$newStoreDetailBase" + (orderId ?? "")} />;
}
"@

WriteIfMissing $oldOrdersCreate $stubCreate
WriteIfMissing $oldOrderDetail  $stubCustomerDetail
WriteIfMissing $oldStoreOrderDetail $stubStoreDetail

Write-Host "`nDONE. Now restart metro with cache clear:" -ForegroundColor Cyan
Write-Host "  npx expo start -c" -ForegroundColor Cyan