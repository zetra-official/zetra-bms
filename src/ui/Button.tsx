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

  const bg = isPrimary ? theme.colors.emeraldSoft : theme.colors.card;
  const border = isPrimary ? theme.colors.emeraldBorder : theme.colors.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // ✅ IMPORTANT: remove android_ripple to stop flash
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: border,
          borderRadius: theme.radius.pill,
          backgroundColor: bg,
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
          transform: pressed ? [{ scale: 0.99 }] : [{ scale: 1 }],
        },
        style as any,
      ]}
    >
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
        {title}
      </Text>
    </Pressable>
  );
}