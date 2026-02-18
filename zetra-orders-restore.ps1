$ErrorActionPreference="Stop"

function EnsureDir($p){ New-Item -ItemType Directory -Force -Path $p | Out-Null }

$base = "app/(tabs)/club/orders"
if (-not (Test-Path $base)) { $base = "app\(tabs)\club\orders" }
if (-not (Test-Path $base)) { throw "Missing folder: app/(tabs)/club/orders" }

$orderTsx = Join-Path $base "_order.tsx"
$routeTsx = Join-Path $base "[orderId].tsx"

# 1) Create _order.tsx placeholder if missing (you will paste real screen code inside)
if (-not (Test-Path $orderTsx)) {
  Set-Content -Encoding UTF8 -Path $orderTsx -Value @"
import React from "react";
import { Text, View } from "react-native";

export default function OrderDetailScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>TODO: paste StaffOrderDetailScreen here (restored)</Text>
    </View>
  );
}
"@
  Write-Host "[OK] Created: $orderTsx" -ForegroundColor Green
} else {
  Write-Host "[SKIP] Exists: $orderTsx" -ForegroundColor Yellow
}

# 2) Force [orderId].tsx to be a simple re-export (prevents Redirect loops)
Set-Content -Encoding UTF8 -Path $routeTsx -Value @"
export { default } from "./_order";
"@
Write-Host "[OK] Updated: $routeTsx (now re-exports _order.tsx)" -ForegroundColor Green

Write-Host "`nNext: restart clean:" -ForegroundColor Cyan
Write-Host "  npx expo start -c" -ForegroundColor Cyan