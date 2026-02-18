// app/modal.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { Card } from "@/ui/Card";
import { Screen } from "@/ui/Screen";
import { theme } from "@/ui/theme";

export default function ModalScreen() {
  const router = useRouter();

  return (
    <Screen scroll contentStyle={{ paddingTop: 18 }}>
      <View style={{ gap: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            Modal
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
            Hii ni modal ya template. Tumei-align na ZETRA UI (Screen/Card/theme) ili isilete errors.
          </Text>

          <View style={{ marginTop: 14, gap: 10 }}>
            <View
              style={{
                height: 44,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
              // Pressable bila Button ili tusitegemee file nyingine
              // Ukipenda, tutaiweka Button component ya src/ui/Button
              onTouchEnd={() => router.back()}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Close</Text>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  );
}