import React, { forwardRef } from "react";
import { TextInput, TextInputProps } from "react-native";
import { theme } from "./theme";

export const Input = forwardRef<TextInput, TextInputProps>(function Input(props, ref) {
  return (
    <TextInput
      ref={ref}
      {...props}
      placeholderTextColor="rgba(255,255,255,0.35)"
      style={[
        {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          backgroundColor: "rgba(255,255,255,0.05)",
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: theme.colors.text,
          fontWeight: "800",
        },
        props.style,
      ]}
    />
  );
});
