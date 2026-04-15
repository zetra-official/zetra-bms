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
      <Stack.Screen name="index" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="history" />

      <Stack.Screen name="cashier/index" />

      <Stack.Screen name="profit" />
      <Stack.Screen name="expenses" />

      <Stack.Screen name="receipt" />
      <Stack.Screen name="edit-receipt" />
    </Stack>
  );
}