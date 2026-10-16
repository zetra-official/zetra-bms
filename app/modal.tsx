import {useCommonText} from "@/src/i18n/useCommonText";
// app/modal.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";

export default function ModalScreen() {
 const uiText=useCommonText();
  const router = useRouter();

  return (
    <Screen scroll contentStyle={{ paddingTop: 18 }}>
      <View style={{ gap: 12 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            {uiText("Modal")}</Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
            {uiText("Hii ni modal ya template. Tumei-align na ZETRA UI (Screen/Card/theme) ili isilete errors.")}</Text>

          <View style={{ marginTop: 14, gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              style={{
                height: 44,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => router.back()}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{uiText("Close")}</Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
