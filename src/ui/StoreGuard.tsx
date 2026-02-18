// src/ui/StoreGuard.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useOrg } from "../context/OrgContext";
import { Button } from "./Button";
import { Card } from "./Card";
import { UI } from "./theme";

type Props = {
  children: React.ReactNode;
  /** Optional custom message */
  message?: string;
};

export function StoreGuard({ children, message }: Props) {
  const router = useRouter();
  const { activeStoreId } = useOrg();

  // ✅ If no active store selected/available, block and force selection
  if (!activeStoreId) {
    return (
      <Card
        style={{
          borderColor: "rgba(251,113,133,0.35)",
          backgroundColor: "rgba(251,113,133,0.08)",
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 16 }}>
          Chagua Store kwanza ✅
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "700", lineHeight: 20 }}>
          {message ??
            "Huwezi kuendelea bila kuchagua store. Nenda Stores uchague store unayotaka iwe active."}
        </Text>

        <View style={{ height: 6 }} />

        <Button
          title="Chagua Store"
          variant="primary"
          onPress={() => {
            // @ts-ignore (typed routes may complain sometimes)
            router.push("/(tabs)/stores");
          }}
        />

        <Button
          title="Nipo tayari (Refresh)"
          variant="secondary"
          onPress={() => {
            // @ts-ignore
            router.push("/(tabs)");
          }}
        />
      </Card>
    );
  }

  // ✅ OK, allow the screen
  return <>{children}</>;
}