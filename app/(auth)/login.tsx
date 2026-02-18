// app/(auth)/login.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useOrg();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    const e = email.trim();
    if (!e) return Alert.alert("Missing", "Email is required.");
    if (!password) return Alert.alert("Missing", "Password is required.");

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password,
    });

    if (error) {
      setLoading(false);
      return Alert.alert("Login Failed", error.message);
    }

    // ✅ Katiba: refresh canonical OrgContext then route
    try {
      await refresh();
    } catch (err: any) {
      console.log("refresh after login error:", err);
    }

    setLoading(false);

    // ✅ Always go tabs; AuthGate will redirect to onboarding if no store yet.
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 26, fontWeight: "900", marginBottom: 8 }}>
        ZETRA BMS
      </Text>
      <Text style={{ opacity: 0.7, marginBottom: 20 }}>Login</Text>

      <Text style={{ fontWeight: "700" }}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          marginTop: 8,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "700" }}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          marginTop: 8,
          marginBottom: 18,
        }}
      />

      <Pressable
        onPress={onLogin}
        disabled={loading}
        style={{
          backgroundColor: "black",
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900" }}>
          {loading ? "Loading..." : "Login"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(auth)/register")}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <Text style={{ textDecorationLine: "underline" }}>
          Create account (Register)
        </Text>
      </Pressable>
    </View>
  );
}