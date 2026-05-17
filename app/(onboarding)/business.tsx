import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Text, TextInput, View, ActivityIndicator } from "react-native";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { TimezonePicker } from "@/src/components/TimezonePicker";
import { kv } from "@/src/storage/kv";

function clean(s: any) {
  return String(s ?? "").trim();
}

function safeEncode(s: any) {
  const v = clean(s);
  try {
    return encodeURIComponent(v);
  } catch {
    return v;
  }
}

export default function OnboardingBusinessScreen() {
  const router = useRouter();

  const [checkingGate, setCheckingGate] = useState(true);

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("GENERAL");

  const [tz, setTz] = useState("Africa/Dar_es_Salaam");
  const [tzConfirmed, setTzConfirmed] = useState(false);

  const [busy, setBusy] = useState(false);

  // ✅ HARD GUARD: lazima referral ipitie kwanza
  useEffect(() => {
    let alive = true;

    const checkReferralGate = async () => {
      try {
        let done = "";

        if ((kv as any)?.getString) {
          done = await (kv as any).getString(
            "zetra_onboarding_referral_done_v1"
          );
        } else if ((kv as any)?.get) {
          done = await (kv as any).get(
            "zetra_onboarding_referral_done_v1"
          );
        }

        if (!alive) return;

        if (!done) {
          router.replace("/(onboarding)/referral" as any);
          return;
        }

        setCheckingGate(false);
      } catch {
        router.replace("/(onboarding)/referral" as any);
      }
    };

    checkReferralGate();

    return () => {
      alive = false;
    };
  }, [router]);

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
      router.push({
        pathname: "/(onboarding)/store",
        params: {
          businessName: safeEncode(businessName),
          businessType: safeEncode(businessType),
          timezone: safeEncode(nextTz),
        },
      } as any);
    } finally {
      setBusy(false);
    }
  }

  // ⛔ Loader wakati tuna-check referral gate
  if (checkingGate) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0B0F14",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={{
        paddingTop: 12,
        paddingBottom: 28,
        backgroundColor: "#0B0F14",
      }}
    >
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 26 }}>
          Business Setup
        </Text>

        <Text
          style={{
            color: "rgba(255,255,255,0.72)",
            fontWeight: "800",
            marginTop: 6,
            lineHeight: 20,
          }}
        >
          Weka jina la biashara na timezone ya reports, daily closing, na date cutoffs.
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card
          style={{
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(15,18,24,0.98)",
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
            Business name
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
            }}
          >
            <TextInput
              value={name}
              onChangeText={(v) => setName(v)}
              placeholder="e.g. JOFU QUALITY"
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 14,
              }}
              autoCapitalize="words"
            />
          </View>

          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14, marginTop: 14 }}>
            Business type
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
            }}
          >
            <TextInput
              value={businessType}
              onChangeText={(v) => setBusinessType(v)}
              placeholder="GENERAL / RETAIL / PHARMACY ..."
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 14,
              }}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(255,255,255,0.10)",
              marginVertical: 16,
            }}
          />

          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
            Timezone (Required)
          </Text>

          <Text
            style={{
              color: "rgba(255,255,255,0.68)",
              fontWeight: "800",
              fontSize: 12,
              marginTop: 6,
            }}
          >
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
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Button
          title={busy ? "Please wait..." : "Continue"}
          onPress={onContinue}
          disabled={!canContinue}
        />
      </View>
    </Screen>
  );
}