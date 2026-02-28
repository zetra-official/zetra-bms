import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { TimezonePicker } from "@/src/components/TimezonePicker";

function clean(s: any) {
  return String(s ?? "").trim();
}

export default function OnboardingBusinessScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("GENERAL");

  // ✅ Timezone (Required + Confirm)
  const [tz, setTz] = useState("Africa/Dar_es_Salaam");
  const [tzConfirmed, setTzConfirmed] = useState(false);

  const [busy, setBusy] = useState(false);

  const canContinue = useMemo(() => {
    const businessName = clean(name);
    const nextTz = clean(tz);
    return Boolean(businessName && nextTz && tzConfirmed && !busy);
  }, [name, tz, tzConfirmed, busy]);

  async function onContinue() {
    if (busy) return;

    const businessName = clean(name);
    if (!businessName) {
      Alert.alert("Missing", "Business name is required.");
      return;
    }

    const nextTz = clean(tz);
    if (!nextTz) {
      Alert.alert("Timezone", "Timezone haiwezi kuwa empty.");
      return;
    }

    if (!tzConfirmed) {
      Alert.alert(
        "Confirm timezone",
        "Tafadhali thibitisha timezone. Hii itaathiri reports, daily closing, na date cutoffs."
      );
      return;
    }

    setBusy(true);
    try {
      router.push(
        {
          pathname: "/(onboarding)/store",
          params: {
            businessName,
            businessType,
            timezone: nextTz,
          },
        } as any
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
          Business Setup
        </Text>
        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 18 }}>
          Weka jina la biashara + timezone ya reports/daily closing.
        </Text>
      </View>

      {/* Main Card */}
      <View style={{ marginTop: 14 }}>
        <Card>
          {/* Business name */}
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Business name
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={name}
              onChangeText={(v) => setName(v)}
              placeholder="e.g. JOFU QUALITY"
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 14,
                paddingVertical: 0,
              }}
              autoCapitalize="words"
            />
          </View>

          {/* Business type */}
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14, marginTop: 14 }}>
            Business type
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={businessType}
              onChangeText={(v) => setBusinessType(v)}
              placeholder="GENERAL / RETAIL / PHARMACY ..."
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 14,
                paddingVertical: 0,
              }}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {/* Divider */}
          <View
            style={{
              height: 1,
              backgroundColor: "rgba(255,255,255,0.10)",
              marginVertical: 16,
            }}
          />

          {/* Timezone picker (premium dropdown modal) */}
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Timezone (Required)
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
            Controls reports, daily closing, and date cutoffs (org-level).
          </Text>

          <View style={{ marginTop: 12 }}>
            <TimezonePicker
              value={tz}
              onChange={(next) => setTz(next)}
              title="Timezone"
              subtitle="Reports • Daily closing • Cutoffs"
              requireConfirm
              confirmed={tzConfirmed}
              onConfirmedChange={setTzConfirmed}
              confirmLabel="I confirm this timezone is correct for reports & daily closing."
            />
          </View>

          <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12, marginTop: 10, lineHeight: 16 }}>
            Note: Unaweza kubadilisha timezone baadaye kupitia More → Regional Settings (Owner/Admin only).
          </Text>
        </Card>
      </View>

      {/* Continue */}
      <View style={{ marginTop: 14 }}>
        <Button
          title={busy ? "Please wait..." : "Continue"}
          onPress={onContinue}
          disabled={!canContinue}
        />
      </View>

      {/* Small helper */}
      {!clean(name) ? (
        <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 12, marginTop: 10 }}>
          Tip: Andika jina la biashara kwanza, kisha chagua timezone na uthibitishe.
        </Text>
      ) : null}
    </Screen>
  );
}