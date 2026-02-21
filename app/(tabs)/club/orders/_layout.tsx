import { theme } from "@/src/ui/theme";
import { Stack } from "expo-router";
import React from "react";
import { Platform } from "react-native";

export default function ClubOrdersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: Platform.OS === "android" ? "fade" : "default",
      }}
    />
  );
}