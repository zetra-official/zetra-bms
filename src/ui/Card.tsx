// src/ui/Card.tsx
import React from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { UI } from "@/src/ui/theme";

/**
 * ✅ Premium glass card used across app
 * - Safe even if theme tokens differ (supports UI.colors.* or flat UI.*)
 * - Exports named component: Card
 */

const C: any = (UI as any)?.colors ?? UI;
const IS_WEB = Platform.OS === "web";

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;

  /** default padding = 16 */
  padding?: number;

  /** disables default padding */
  noPadding?: boolean;
};

export function Card({ children, style, padding = 16, noPadding }: Props) {
  return (
    <View
      style={[
        {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: C?.card ?? "rgba(255,255,255,0.05)",
          padding: noPadding ? 0 : padding,

          // subtle shadow/elevation
          shadowColor: "#000",
          shadowOpacity: IS_WEB ? 0 : 0.25,
          shadowRadius: IS_WEB ? 0 : 18,
          shadowOffset: IS_WEB ? { width: 0, height: 0 } : { width: 0, height: 10 },
          elevation: IS_WEB ? 0 : 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}