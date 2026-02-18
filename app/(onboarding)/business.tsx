import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

export default function BusinessOnboardingScreen() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");

  const next = () => {
    const bn = businessName.trim();
    if (!bn) return;

    router.push({
      pathname: "/(onboarding)/store",
      params: { businessName: bn },
    });
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "900", marginBottom: 6 }}>
        Business Setup
      </Text>
      <Text style={{ opacity: 0.7, marginBottom: 18 }}>
        Enter your business name (DB will store UPPERCASE via trigger)
      </Text>

      <Text style={{ fontWeight: "700" }}>Business Name</Text>
      <TextInput
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="e.g. JOFU QUALITY"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          padding: 12,
          marginTop: 8,
          marginBottom: 16,
        }}
      />

      <Pressable
        onPress={next}
        style={{
          backgroundColor: "black",
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>Next</Text>
      </Pressable>
    </View>
  );
}