// app/(tabs)/stores/scan.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View, Vibration } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { theme } from "@/src/ui/theme";
import { publishScanBarcode } from "@/src/utils/scanBus";

function cleanBarcode(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "");
}

export default function StoreScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string>("");

  const granted = !!permission?.granted;

  const ensurePermission = useCallback(async () => {
    try {
      if (granted) return true;
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Camera Permission", "Ruhusa ya camera inahitajika ili kuscan barcode.");
        return false;
      }
      return true;
    } catch {
      Alert.alert("Camera", "Imeshindikana kuomba ruhusa ya camera.");
      return false;
    }
  }, [granted, requestPermission]);

  useEffect(() => {
    void ensurePermission();
  }, [ensurePermission]);

  const close = useCallback(() => {
    router.back();
  }, [router]);

  const onBarcodeScanned = useCallback(
    async (result: any) => {
      if (busy) return;

      const ok = await ensurePermission();
      if (!ok) return;

      const v = cleanBarcode(result?.data);
      if (!v) return;

      setBusy(true);
      setLast(v);

      try {
        Vibration.vibrate(8);
      } catch {}

      publishScanBarcode(v);

      setTimeout(() => {
        router.back();
        setTimeout(() => setBusy(false), 400);
      }, 50);
    },
    [busy, ensurePermission, router]
  );

  const cameraTypes = useMemo(
    () => [
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
      "code128",
      "code39",
      "itf14",
      "qr",
      "pdf417",
      "aztec",
      "datamatrix",
    ],
    []
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ padding: theme.spacing.page, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>Scan Item</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Scan → Inventory itaiweka item juu ili u-Adjust haraka.
            </Text>
          </View>

          <Pressable
            onPress={close}
            hitSlop={10}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: theme.spacing.page, paddingBottom: 18 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          {granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={onBarcodeScanned}
              barcodeScannerSettings={{ barcodeTypes: cameraTypes as any }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 18 }}>
              <Card style={{ width: "100%", padding: 16, gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Camera permission inahitajika
                </Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Bonyeza “Grant” kisha uruhusu camera.
                </Text>

                <Pressable
                  onPress={ensurePermission}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 12,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                      alignItems: "center",
                      opacity: pressed ? 0.92 : 1,
                      transform: pressed ? [{ scale: 0.995 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Grant Camera Permission</Text>
                </Pressable>
              </Card>
            </View>
          )}

          {/* scanning frame */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 18,
              right: 18,
              top: "32%",
              height: 140,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: "rgba(52,211,153,0.55)",
              backgroundColor: "rgba(0,0,0,0.05)",
            }}
          />

          {/* top hint */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              right: 14,
            }}
          >
            <Card style={{ padding: 12, gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {busy ? "Captured ✅" : "Ready"}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Last: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{last || "—"}</Text>
              </Text>
            </Card>
          </View>
        </View>
      </View>
    </Screen>
  );
}