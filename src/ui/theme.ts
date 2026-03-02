// src/ui/theme.ts
// ZETRA Premium Dark Theme (DORA UI Standard)
//
// Exports:
// - UI: direct tokens (UI.text, UI.emeraldBorder, etc.)
// - theme: legacy-friendly tokens (theme.colors.*, theme.radius.*, theme.spacing.*)
// - colors/radius/spacing: convenient named exports
// - default export: theme (helps avoid wrong import patterns)

export const UI = {
  // Core
  background: "#0B0F14",
  tabBarBg: "#070A0E",

  // Surfaces
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",
  surface2: "rgba(255,255,255,0.04)",

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

// Convenience named exports (helps avoid "undefined" from wrong destructuring)
export const colors = theme.colors;
export const spacing = theme.spacing;
export const radius = theme.radius;

// Default export for safer imports: import theme from "@/src/ui/theme"
export default theme;