// src/ui/Button.tsx
import React from "react";
import { Pressable, StyleProp, Text, ViewStyle } from "react-native";

import { theme } from "./theme";

type Variant = "primary" | "secondary";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  style,
}: Props) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: isPrimary ? theme.colors.primary : theme.colors.border,

          borderRadius: theme.radius.md,

          backgroundColor: isPrimary ? theme.colors.primary : "#FFFFFF",

          paddingVertical: 13,
          paddingHorizontal: 16,

          alignItems: "center",
          justifyContent: "center",

          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style as any,
      ]}
    >
      <Text
        style={{
          color: isPrimary ? theme.colors.inverseText : theme.colors.text,
          fontWeight: "700",
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}