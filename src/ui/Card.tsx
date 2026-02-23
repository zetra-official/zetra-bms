import React from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { theme } from "./theme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** premium elevation on by default */
  elevated?: boolean;
};

export function Card({ children, style, elevated = true }: Props) {
  const base: ViewStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.card,
    padding: 16,
  };

  const shadow: ViewStyle =
    elevated
      ? Platform.select<ViewStyle>({
          ios: {
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
          },
          android: {
            elevation: 10,
          },
          default: {},
        }) || {}
      : {};

  return (
    <View style={[base, shadow, style as any]}>
      {children}
    </View>
  );
}