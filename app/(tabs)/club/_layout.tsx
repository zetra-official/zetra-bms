import { theme } from "@/src/ui/theme";
import { Stack } from "expo-router";
import React from "react";
import { Platform } from "react-native";

export default function ClubLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,

        // ✅ HARD FIX: no white flash when pushing/popping screens
        contentStyle: { backgroundColor: theme.colors.background },

        // ✅ smoother feel on Android (reduces “flash feel”)
        animation: Platform.OS === "android" ? "fade" : "default",
      }}
    />
  );
}