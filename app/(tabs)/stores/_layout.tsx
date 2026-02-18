// app/(tabs)/stores/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function StoresLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // ✅ consistency (na kuzuia header zisizotarajiwa)
      }}
    />
  );
}