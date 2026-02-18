// app/(tabs)/sales/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function SalesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      {/* Sales flow */}
      <Stack.Screen name="index" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="history" />

      {/* Top icons screens */}
      <Stack.Screen name="profit" />
      <Stack.Screen name="expenses" />

      {/* Receipt */}
      <Stack.Screen name="receipt" />
    </Stack>
  );
}