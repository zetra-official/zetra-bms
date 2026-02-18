import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

export default function OnboardingBusinessScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("GENERAL");
  const [busy, setBusy] = useState(false);

  async function onContinue() {
    setBusy(true);
    try {
      const businessName = name.trim();
      if (!businessName) return;

      // NOTE: typed-route warning inaweza kuhitaji 'as any' depending config
      router.push(
        {
          pathname: "/(onboarding)/store",
          params: { businessName, businessType },
        } as any
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 26, fontWeight: "800" }}>Business Setup</Text>
      <Text style={{ marginTop: 6, opacity: 0.7 }}>
        Weka jina la biashara na aina ya biashara
      </Text>

      <TextInput
        placeholder="Business name"
        value={name}
        onChangeText={setName}
        style={{ marginTop: 18, borderWidth: 1, borderRadius: 10, padding: 12 }}
      />

      <TextInput
        placeholder="Business type (e.g. RETAIL, PHARMACY...)"
        value={businessType}
        onChangeText={setBusinessType}
        style={{ marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 12 }}
      />

      <Pressable
        onPress={onContinue}
        disabled={busy || !name.trim()}
        style={{
          marginTop: 14,
          backgroundColor: "black",
          padding: 14,
          borderRadius: 10,
          opacity: busy || !name.trim() ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "800" }}>
          Continue
        </Text>
      </Pressable>
    </View>
  );
}