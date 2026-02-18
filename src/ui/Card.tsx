// src/ui/Card.tsx
import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { theme } from "./theme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: Props) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.card,
          padding: 16,
        },
        style as any,
      ]}
    >
      {children}
    </View>
  );
}