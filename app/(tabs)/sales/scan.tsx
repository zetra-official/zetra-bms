// app/(tabs)/sales/scan.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function SalesScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);

  const scanLockRef = useRef(false);
  const unlockTimerRef = useRef<any>(null);
  const lastScannedValueRef = useRef<string>("");
  const lastScannedAtRef = useRef<number>(0);

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
    setTorchOn(true);
    void ensurePermission();
  }, [ensurePermission]);

  useEffect(() => {
    return () => {
      setTorchOn(false);
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, []);

  const close = useCallback(() => {
    setTorchOn(false);
    router.back();
  }, [router]);

  const onBarcodeScanned = useCallback(
    async (result: any) => {
      if (scanLockRef.current || busy) return;

      const ok = await ensurePermission();
      if (!ok) return;

      const v = cleanBarcode(result?.data);
      if (!v) return;

      const now = Date.now();
      const sameAsLast = lastScannedValueRef.current === v;
      const tooSoon = now - lastScannedAtRef.current < 900;

      // Zuia frame duplicates za barcode ile ile ndani ya muda mfupi sana.
      if (sameAsLast && tooSoon) return;

      scanLockRef.current = true;
      setBusy(true);
      setLast(v);

      lastScannedValueRef.current = v;
      lastScannedAtRef.current = now;

      try {
        Vibration.vibrate(10);
      } catch {}

      try {
        publishScanBarcode(v);
      } catch {}

      // Professional behavior:
      // baada ya capture, zima torch yenyewe kabla ya kufunga screen
      setTorchOn(false);

      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }

      unlockTimerRef.current = setTimeout(() => {
        scanLockRef.current = false;
        setBusy(false);
      }, 650);

      setTimeout(() => {
        router.back();
      }, 70);
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>Scan Barcode</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Elekeza camera kwenye barcode — itaongeza bidhaa moja kwa moja.
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => setTorchOn((prev) => !prev)}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: torchOn ? theme.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                backgroundColor: torchOn ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Ionicons
                name={torchOn ? "flashlight" : "flashlight-outline"}
                size={20}
                color={theme.colors.text}
              />
            </Pressable>

            <Pressable
              onPress={close}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
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
              enableTorch={torchOn}
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
                {busy ? "Captured ✅" : "Ready to scan"}
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Torch: <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{torchOn ? "ON" : "OFF"}</Text>
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