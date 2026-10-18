import {CurrencyPickerAll} from '@/src/components/CurrencyPickerAll';
import {useMasterText} from '@/src/currency/masterMessages';
import {useCommonText} from "@/src/i18n/useCommonText";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { Button } from "@/src/ui/Button";
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

const LIGHT = {
  bg: "#EAF2FA",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "rgba(15,23,42,0.10)",
  soft: "#F8FAFC",
  emerald: "#10B981",
};

export default function OnboardingBusinessScreen() {
 const uiText = useCommonText();
  const router = useRouter();

  const currencyText=useMasterText();
  const [accountingCurrency,setAccountingCurrency]=useState<string|null>("TZS");
  const [checkingGate, setCheckingGate] = useState(true);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("GENERAL");
  const [tz, setTz] = useState("Africa/Dar_es_Salaam");
  const [tzConfirmed, setTzConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    const checkReferralGate = async () => {
      try {
        let done = "";

        if ((kv as any)?.getString) {
          done = await (kv as any).getString("zetra_onboarding_referral_done_v1");
        } else if ((kv as any)?.get) {
          done = await (kv as any).get("zetra_onboarding_referral_done_v1");
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
    if (!businessName) return Alert.alert(uiText("Missing"), uiText("Business name is required."));

    const nextTz = clean(tz);
    if (!nextTz) return Alert.alert(uiText("Timezone"), uiText("Timezone haiwezi kuwa empty."));

    if (!tzConfirmed) {
      Alert.alert(
        uiText("Confirm timezone"),
        uiText("Tafadhali thibitisha timezone. Hii itaathiri reports, daily closing, na date cutoffs.")
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
          accountingCurrency: accountingCurrency || "TZS",
        },
      } as any);
    } finally {
      setBusy(false);
    }
  }

  if (checkingGate) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: LIGHT.bg,
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
      style={{ backgroundColor: LIGHT.bg } as any}
      contentStyle={{
  paddingTop: 46,
  paddingBottom: 28,
  backgroundColor: LIGHT.bg,
}}
    >
      <Pressable
        onPress={() => router.replace("/(onboarding)/referral" as any)}
        style={{
          alignSelf: "flex-start",
          borderWidth: 1,
          borderColor: LIGHT.border,
          backgroundColor: LIGHT.card,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 999,
          marginBottom: 18,
        }}
      >
        <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 13 }}>
          {uiText("← Back")}</Text>
      </Pressable>

      <View style={{ marginTop: 0 }}>
        <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 26 }}>
          {uiText("Business Setup")}</Text>

        <Text
          style={{
            color: LIGHT.muted,
            fontWeight: "800",
            marginTop: 6,
            lineHeight: 20,
          }}
        >
          {uiText("Weka jina la biashara na timezone ya reports, daily closing, na date cutoffs.")}</Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <Card
          style={{
            borderColor: LIGHT.border,
            backgroundColor: LIGHT.card,
            borderRadius: 26,
            borderWidth: 1,
            overflow: "hidden",
            shadowColor: "#0F172A",
            shadowOpacity: 0.1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14 }}>
            {uiText("Business name")}</Text>

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
              value={name}
              onChangeText={setName}
              placeholder={uiText("e.g. JOFU QUALITY")}
              placeholderTextColor={LIGHT.faint}
              style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14 }}
              autoCapitalize="words"
            />
          </View>

          <View style={{marginTop:14,gap:8}}><CurrencyPickerAll title={currencyText("onboarding")} value={accountingCurrency} onChange={setAccountingCurrency}/><Text style={{color:LIGHT.muted,lineHeight:20}}>{currencyText("provisional")}</Text></View>
          <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14, marginTop: 14 }}>
            {uiText("Business type")}</Text>

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
              value={businessType}
              onChangeText={setBusinessType}
              placeholder={uiText("GENERAL / RETAIL / PHARMACY ...")}
              placeholderTextColor={LIGHT.faint}
              style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14 }}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={{ height: 1, backgroundColor: LIGHT.border, marginVertical: 16 }} />

          <Text style={{ color: LIGHT.text, fontWeight: "900", fontSize: 14 }}>
            {uiText("Timezone (Required)")}</Text>

          <Text style={{ color: LIGHT.muted, fontWeight: "800", fontSize: 12, marginTop: 6 }}>
            {uiText("Controls reports, daily closing, and date cutoffs (org-level).")}</Text>

          <View style={{ marginTop: 12 }}>
   <TimezonePicker
  value={tz}
  onChange={(next) => {
    setTz(next);
    setTzConfirmed(false);
  }}
  title={uiText("Timezone")}
  subtitle={uiText("Reports • Daily closing • Cutoffs")}
/>

<Pressable
  onPress={() => setTzConfirmed((v) => !v)}
  style={{
    marginTop: 12,
    borderWidth: 1,
    borderColor: tzConfirmed ? "rgba(16,185,129,0.45)" : LIGHT.border,
    backgroundColor: tzConfirmed ? "rgba(16,185,129,0.10)" : LIGHT.soft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  }}
>
  <View
    style={{
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: tzConfirmed ? LIGHT.emerald : LIGHT.faint,
      backgroundColor: tzConfirmed ? LIGHT.emerald : "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
      {tzConfirmed ? "✓" : ""}
    </Text>
  </View>

  <Text
    style={{
      flex: 1,
      color: LIGHT.text,
      fontWeight: "900",
      fontSize: 13.5,
      lineHeight: 19,
    }}
  >
    {uiText("I confirm this timezone is correct for reports & daily closing.")}</Text>
</Pressable>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 14 }}>
        <Button
          title={busy ? uiText("Please wait...") : uiText("Continue")}
          onPress={onContinue}
          disabled={!canContinue}
        />
      </View>
    </Screen>
  );
}