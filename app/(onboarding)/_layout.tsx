import { Stack } from "expo-router";
import React from "react";
import { View } from "react-native";
import { UI } from "@/src/ui/theme";

export default function OnboardingLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: UI.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: UI.background },
          animation: "slide_from_right",
        }}
      />
    </View>
  );
}