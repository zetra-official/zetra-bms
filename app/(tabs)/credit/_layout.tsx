// app/(tabs)/credit/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function CreditLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[creditId]" />
    </Stack>
  );
}