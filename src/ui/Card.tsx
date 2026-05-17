// src/ui/Card.tsx

import React, { useMemo } from "react";
import {
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  noPadding?: boolean;
  strong?: boolean;
};

export function Card({
  children,
  style,
  padding = 16,
  noPadding,
  strong,
}: Props) {
  const baseStyle = useMemo(
    () => ({
      borderRadius: 26,

      borderWidth: strong ? 1.4 : 1.15,

      borderColor: strong
        ? "rgba(59,130,246,0.30)"
        : "rgba(148,163,184,0.16)",

      backgroundColor: strong
        ? "#F4F8FF"
        : "#FCFDFF",

      padding: noPadding ? 0 : padding,

      shadowColor: "#0F172A",

      shadowOpacity:
        Platform.OS === "android"
          ? 0.16
          : 0.11,

      shadowRadius: 20,

      shadowOffset: {
        width: 0,
        height: 10,
      },

      elevation: 5,

      overflow: "hidden" as const,
    }),
    [noPadding, padding, strong]
  );

  return (
    <View
      style={[
        baseStyle,

        // soft premium glow layer
        {
          position: "relative",
        },

        style,
      ]}
    >
      {/* TOP LIGHT */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1.2,
          backgroundColor: "rgba(255,255,255,0.92)",
        }}
      />

      {/* SOFT BLUE GLOW */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -40,
          right: -30,
          width: 140,
          height: 140,
          borderRadius: 999,
          backgroundColor: "rgba(59,130,246,0.05)",
        }}
      />

      {/* SOFT BOTTOM LIGHT */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -50,
          left: -40,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.45)",
        }}
      />

      {children}
    </View>
  );
}