// src/ui/theme.ts
// ZETRA Premium Dark Theme (DORA UI Standard)
// Exports:
// - theme: legacy-friendly tokens (theme.colors.*, theme.radius.*, theme.spacing.*)
// - UI: newer direct tokens (UI.text, UI.muted, UI.emeraldSoft, etc.)

export const UI = {
  // Core
  background: "#0B0F14",
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",

  // Text
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.68)",
  faint: "rgba(255,255,255,0.45)",

  // Borders
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",

  // Brand (Emerald)
  emerald: "rgba(16,185,129,1)",
  emeraldSoft: "rgba(16,185,129,0.16)",
  emeraldBorder: "rgba(16,185,129,0.45)",

  // Status
  danger: "rgba(239,68,68,1)",
  dangerSoft: "rgba(239,68,68,0.14)",
  dangerBorder: "rgba(239,68,68,0.45)",

  warning: "rgba(245,158,11,1)",
  warningSoft: "rgba(245,158,11,0.12)",

  // Extra surfaces
  surface2: "rgba(255,255,255,0.04)",

  // Tab bar
  tabBarBg: "#070A0E",
} as const;

export const theme = {
  colors: {
    // App backgrounds
    background: UI.background,
    tabBarBg: UI.tabBarBg,

    // Surfaces
    card: UI.card,
    cardStrong: UI.cardStrong,
    surface2: UI.surface2,

    // Text
    text: UI.text,
    muted: UI.muted,
    faint: UI.faint,

    // Borders
    border: UI.border,
    borderSoft: UI.borderSoft,

    // Brand
    emerald: UI.emerald,
    emeraldSoft: UI.emeraldSoft,
    emeraldBorder: UI.emeraldBorder,

    // Status
    danger: UI.danger,
    dangerSoft: UI.dangerSoft,
    dangerBorder: UI.dangerBorder,
    warning: UI.warning,
    warningSoft: UI.warningSoft,
  },

  // ✅ This fixes: theme.spacing.page undefined (caused "Cannot read property 'page' of undefined")
  spacing: {
    page: 16,
    card: 14,
    row: 12,
    input: 12,
    gap: 12,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 999,
  },
} as const;