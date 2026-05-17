// src/ui/Input.tsx
import React, { forwardRef } from "react";
import { TextInput, TextInputProps } from "react-native";

import { theme } from "./theme";

export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  props,
  ref
) {
  return (
    <TextInput
      ref={ref}
      {...props}
      placeholderTextColor="#8B95A7"
      selectionColor={theme.colors.primary}
      style={[
        {
          borderWidth: 1,
          borderColor: "#D7DFEA",

          borderRadius: 12,

          backgroundColor: "#FFFFFF",

          paddingHorizontal: 14,
          paddingVertical: 13,

          color: "#172033",

          fontWeight: "600",
          fontSize: 15,

          shadowOpacity: 0,
          elevation: 0,
        },
        props.style,
      ]}
    />
  );
});