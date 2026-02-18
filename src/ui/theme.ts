// src/ui/theme.tsx
export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  border: string;

  surface2: string;
  borderSoft: string;
  shadowSoft: string;

  text: string;
  muted: string;
  faint: string;

  primary: string;
  primaryText: string;

  tabBarBg: string;
  emerald: string;

  emeraldSoft: string;
  emeraldBorder: string;

  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  dangerText: string;
};

export type ThemeRadius = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
};

export type ThemeSpacing = {
  page: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
};

export type Theme = {
  colors: ThemeColors;
  radius: ThemeRadius;
  spacing: ThemeSpacing;
};

export const theme: Theme = {
  colors: {
    background: "#0B0F14",
    surface: "rgba(255,255,255,0.04)",
    card: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.12)",

    surface2: "rgba(255,255,255,0.03)",
    borderSoft: "rgba(255,255,255,0.08)",
    shadowSoft: "rgba(0,0,0,0.45)",

    text: "#FFFFFF",
    muted: "#9AA4B2",
    faint: "rgba(255,255,255,0.70)",

    primary: "#10B981",
    primaryText: "#06140F",

    tabBarBg: "rgba(0,0,0,0.45)",
    emerald: "#10B981",

    emeraldSoft: "rgba(16,185,129,0.16)",
    emeraldBorder: "rgba(16,185,129,0.35)",

    danger: "#EF4444",
    dangerSoft: "rgba(239,68,68,0.18)",
    dangerBorder: "rgba(239,68,68,0.35)",
    dangerText: "#FF6B6B",
  },

  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 999,
  },

  spacing: {
    page: 16,
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
};

export const UI = {
  ...theme.colors,
  colors: theme.colors,
  radius: theme.radius,
  spacing: theme.spacing,
  theme,
} as const;