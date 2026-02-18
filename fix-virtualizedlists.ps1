# fix-virtualizedlists.ps1
# ZETRA BMS - FIX: VirtualizedLists nested inside ScrollView
# SAFE: creates backup before patching

$ErrorActionPreference = "Stop"

function Write-Ok($msg)  { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Warn($msg){ Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERR]  $msg" -ForegroundColor Red }

if (!(Test-Path ".\package.json")) {
  Write-Err "Run this script from the project root (where package.json is)."
  exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path (Get-Location) "_patch_backups\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Backup-File($path) {
  if (Test-Path $path) {
    $dest = Join-Path $backupDir ($path -replace "[:\\\/]", "_")
    Copy-Item -Force $path $dest
    Write-Ok "Backup: $path -> $dest"
  } else {
    Write-Warn "Missing (skip backup): $path"
  }
}

$screenFile    = "src\ui\Screen.tsx"
$salesIndex    = "app\(tabs)\sales\index.tsx"
$salesHistory  = "app\(tabs)\sales\history.tsx"
$salesCheckout = "app\(tabs)\sales\checkout.tsx"
$salesReceipt  = "app\(tabs)\sales\receipt.tsx"

Backup-File $screenFile
Backup-File $salesIndex
Backup-File $salesHistory
Backup-File $salesCheckout
Backup-File $salesReceipt

$screenDir = Split-Path -Parent $screenFile
if (!(Test-Path $screenDir)) {
  New-Item -ItemType Directory -Force -Path $screenDir | Out-Null
}

$screenContent = @"
import React from "react";
import { SafeAreaView, ScrollView, View, ViewStyle } from "react-native";
import { theme } from "./theme";

type ScreenProps = {
  children: React.ReactNode;
  bottomPad?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /** default true. Set false on screens that use FlatList/SectionList */
  scroll?: boolean;
};

export function Screen({
  children,
  bottomPad = 120,
  style,
  contentStyle,
  scroll = true,
}: ScreenProps) {
  const base: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.bg0,
  };

  const content: ViewStyle = {
    flex: 1,
    paddingHorizontal: theme.spacing.page,
    paddingTop: theme.spacing.page,
    paddingBottom: bottomPad,
    ...(contentStyle ?? {}),
  };

  return (
    <SafeAreaView style={[base, style]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={content}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={content}>{children}</View>
      )}
    </SafeAreaView>
  );
}
"@

Set-Content -Path $screenFile -Value $screenContent -Encoding UTF8
Write-Ok "Patched: $screenFile (adds scroll={false} option)"

function Add-ScrollFalse($path) {
  if (!(Test-Path $path)) {
    Write-Warn "Skip (missing): $path"
    return
  }

  $txt = Get-Content $path -Raw
  $orig = $txt

  if ($txt -notmatch "FlatList") {
    Write-Warn "No FlatList detected (no change): $path"
    return
  }

  if ($txt -match "<Screen(?![^>]*\bscroll=)([^>]*)>") {
    $txt = [regex]::Replace($txt, "<Screen(?![^>]*\bscroll=)([^>]*)>", "<Screen scroll={false}`$1>", 1)
  }

  if ($txt -ne $orig) {
    Set-Content -Path $path -Value $txt -Encoding UTF8
    Write-Ok "Patched: $path (Screen scroll={false})"
  } else {
    Write-Warn "No change: $path (maybe already patched)"
  }
}

Add-ScrollFalse $salesIndex
Add-ScrollFalse $salesHistory
Add-ScrollFalse $salesCheckout
Add-ScrollFalse $salesReceipt

Write-Ok "DONE. Backup at $backupDir"
Write-Host ""
Write-Host "NEXT: run:" -ForegroundColor Cyan
Write-Host "  npx expo start -c" -ForegroundColor Cyan
