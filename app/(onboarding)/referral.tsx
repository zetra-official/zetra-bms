import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { kv } from "@/src/storage/kv";
import { supabase } from "@/src/supabase/supabaseClient";

function clean(v: any) {
  return String(v ?? "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

const LIGHT = {
  bg: "#EAF2FA",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "rgba(15,23,42,0.10)",
  soft: "#F8FAFC",
  emerald: "#059669",
  emeraldSoft: "#ECFDF5",
  blue: "#0B63CE",
};

export default function OnboardingReferralScreen() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const normalizedCode = useMemo(() => upper(code), [code]);

  async function saveReferralCode(value: string) {
    try {
      if ((kv as any)?.setString) {
        await (kv as any).setString("zetra_onboarding_referral_code_v1", value);
        return;
      }
    } catch {}

    try {
      if ((kv as any)?.set) {
        await (kv as any).set("zetra_onboarding_referral_code_v1", value);
      }
    } catch {}
  }

  async function clearReferralCode() {
    try {
      if ((kv as any)?.remove) {
        await (kv as any).remove("zetra_onboarding_referral_code_v1");
        return;
      }
    } catch {}

    try {
      if ((kv as any)?.delete) {
        await (kv as any).delete("zetra_onboarding_referral_code_v1");
        return;
      }
    } catch {}

    try {
      if ((kv as any)?.setString) {
        await (kv as any).setString("zetra_onboarding_referral_code_v1", "");
      }
    } catch {}
  }

  async function markReferralDone() {
    try {
      if ((kv as any)?.setString) {
        await (kv as any).setString("zetra_onboarding_referral_done_v1", "1");
        return;
      }
    } catch {}

    try {
      if ((kv as any)?.set) {
        await (kv as any).set("zetra_onboarding_referral_done_v1", "1");
      }
    } catch {}
  }

  async function onSkip() {
    if (checking) return;

    setChecking(true);
    try {
      await clearReferralCode();
      await markReferralDone();
      router.replace("/(onboarding)/business" as any);
    } finally {
      setChecking(false);
    }
  }

  async function onContinue() {
    if (checking) return;

    const referralCode = normalizedCode;

    if (!referralCode) {
      return Alert.alert("Missing", "Weka ZGP code au bonyeza Skip.");
    }

    if (!referralCode.startsWith("ZGP-")) {
      return Alert.alert("Invalid code", "Referral code lazima ianze na ZGP-");
    }

    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("gp_apply_referral_code_v1", {
        p_referral_code: referralCode,
      });

      if (error) {
        return Alert.alert("Validation failed", error.message);
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.referral_id) {
        return Alert.alert(
          "Invalid code",
          "Hiyo ZGP code haijapatikana au partner si ACTIVE."
        );
      }

      await saveReferralCode(referralCode);
      await markReferralDone();
      router.replace("/(onboarding)/business" as any);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen
      scroll
      style={{ backgroundColor: LIGHT.bg } as any}
      contentStyle={{ backgroundColor: LIGHT.bg } as any}
    >
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 26 }}>
          Referral Code
        </Text>

        <Text
          style={{
            color: LIGHT.muted,
            fontWeight: "800",
            marginTop: 6,
            lineHeight: 20,
          }}
        >
          Ukiwa umesaidiwa na Growth Partner, weka code yake hapa. Ukiwa huna,
          unaweza kuendelea kwa Skip.
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card
          style={{
            backgroundColor: LIGHT.card,
            borderColor: LIGHT.border,
            borderWidth: 1,
            borderRadius: 26,
            shadowColor: "#0F172A",
            shadowOpacity: 0.10,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: LIGHT.emeraldSoft,
              borderWidth: 1,
              borderColor: "rgba(5,150,105,0.22)",
              marginBottom: 14,
            }}
          >
            <Text
              style={{
                color: LIGHT.emerald,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 0.5,
              }}
            >
              OPTIONAL PARTNER CODE
            </Text>
          </View>

          <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14 }}>
            ZGP Code (optional)
          </Text>

          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: LIGHT.border,
              backgroundColor: LIGHT.soft,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
            }}
          >
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="e.g. ZGP-42D0D8"
              placeholderTextColor={LIGHT.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!checking}
              style={{
                color: LIGHT.text,
                fontWeight: "900",
                fontSize: 14,
                paddingVertical: 0,
              }}
            />
          </View>

          <Text
            style={{
              color: LIGHT.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 10,
              lineHeight: 17,
            }}
          >
            Ukijaza code halali, account yako itaunganishwa na Growth Partner
            aliyekusaidia. Ukiskip, utaendelea bila referral.
          </Text>
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Button
          title={checking ? "Checking..." : "Continue"}
          onPress={onContinue}
          disabled={checking}
        />
      </View>

      <View style={{ marginTop: 10 }}>
        <Button
          title={checking ? "Please wait..." : "Skip"}
          onPress={onSkip}
          disabled={checking}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}