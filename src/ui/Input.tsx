// src/ui/Input.tsx
import React, { forwardRef } from "react";
import { I18nManager, Platform, TextInput, TextInputProps } from "react-native";

import { theme } from "./theme";

export const Input = forwardRef<TextInput, TextInputProps>(function Input(
  props,
  ref
) {
  const rtl = I18nManager.isRTL || (Platform.OS === "web" && typeof document !== "undefined" && document.documentElement.dir === "rtl");
  return (
    <TextInput
      ref={ref}
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
      placeholderTextColor="#64748B"
      selectionColor={theme.colors.primary}
      style={[
        {
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
          minHeight: 48,
          minWidth: 0,
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