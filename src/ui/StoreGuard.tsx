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
  message?: string;
};

export function StoreGuard({ children, message }: Props) {
  const router = useRouter();
  const { activeStoreId } = useOrg();

  if (!activeStoreId) {
    return (
      <Card
        style={{
          borderColor: UI.dangerBorder,
          backgroundColor: UI.dangerSoft,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 16 }}>
          Chagua Store kwanza
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
            router.push("/(tabs)/stores" as any);
          }}
        />

        <Button
          title="Nipo tayari (Refresh)"
          variant="secondary"
          onPress={() => {
            router.push("/(tabs)" as any);
          }}
        />
      </Card>
    );
  }

  return <>{children}</>;
}