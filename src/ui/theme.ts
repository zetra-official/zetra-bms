// src/ui/theme.ts
// ZETRA Enterprise Clean Theme
// Premium business UI • calm • readable • international-grade

export const UI = {
  // ===== BACKGROUND =====
  background: "#EAF0F7",
  backgroundSoft: "#EDF2F8",

  // ===== TAB BAR =====
  tabBarBg: "#0B1F3A",

  // ===== SURFACES =====
  card: "#FFFFFF",
  cardStrong: "#FFFFFF",

  surface2: "#F8FAFC",
  surface3: "#EEF4FB",

  glass: "#FFFFFF",
  glassStrong: "#FFFFFF",

  // ===== TEXT =====
  text: "#111827",
  muted: "#5B6472",
  faint: "#8A94A6",

  inverseText: "#FFFFFF",

  // ===== BORDERS =====
  border: "#D7DEE8",
  borderSoft: "#E6EBF2",
  borderStrong: "#B8C4D3",

  // ===== PRIMARY =====
  primary: "#005BBB",

  primarySoft: "#EAF3FF",
  primaryBorder: "#7FB5FF",

  // ===== ACCENT =====
  accent: "#1D4ED8",

  accentSoft: "#EEF4FF",
  accentBorder: "#A8C7FF",

  // ===== SUCCESS =====
  emerald: "#0F9F6E",

  emeraldSoft: "#EAFBF4",
  emeraldBorder: "#8BE0BF",

  success: "#0F9F6E",
  successSoft: "#EAFBF4",
  successBorder: "#8BE0BF",

  // ===== DANGER =====
  danger: "#D92D20",

  dangerSoft: "#FEF3F2",
  dangerBorder: "#FDA29B",

  // ===== WARNING =====
  warning: "#B7791F",

  warningSoft: "#FFF8E6",
  warningBorder: "#FACC6B",

  // ===== SHADOW =====
  shadow: "rgba(15,23,42,0.06)",

  // disabled old atmospheric glows
  glowBlue: "transparent",
  glowEmerald: "transparent",
  glowViolet: "transparent",
  glowPink: "transparent",
} as const;

export const theme = {
  colors: {
    ...UI,
  },

  spacing: {
    page: 16,
    card: 16,
    row: 12,
    input: 12,
    gap: 12,
    section: 20,
  },

  radius: {
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14,
    xxl: 18,
    pill: 999,
  },
} as const;

export const colors = theme.colors;
export const spacing = theme.spacing;
export const radius = theme.radius;

export default theme;