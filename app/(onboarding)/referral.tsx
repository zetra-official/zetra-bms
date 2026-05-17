import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
import { UI } from "@/src/ui/theme";
import { kv } from "@/src/storage/kv";
import { supabase } from "@/src/supabase/supabaseClient";

function clean(v: any) {
  return String(v ?? "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

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
    <Screen scroll>
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
          Referral Code
        </Text>

        <Text
          style={{
            color: UI.muted,
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
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            ZGP Code (optional)
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
              value={code}
              onChangeText={setCode}
              placeholder="e.g. ZGP-42D0D8"
              placeholderTextColor="rgba(255,255,255,0.40)"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!checking}
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 14,
                paddingVertical: 0,
              }}
            />
          </View>

          <Text
            style={{
              color: "rgba(255,255,255,0.60)",
              fontWeight: "800",
              fontSize: 12,
              marginTop: 10,
              lineHeight: 16,
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