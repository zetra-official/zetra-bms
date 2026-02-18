// app/(auth)/register.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../src/supabase/supabaseClient";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getSessionWithRetry() {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { session: null, error };
    if (data.session) return { session: data.session, error: null };
    await sleep(250);
  }
  return { session: null, error: null };
}

export default function RegisterScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    const e = email.trim();
    const p = password;

    if (!e) return Alert.alert("Missing", "Email is required.");
    if (!p) return Alert.alert("Missing", "Password is required.");
    if (p.length < 6)
      return Alert.alert("Weak password", "Use at least 6 characters.");
    if (p !== confirm)
      return Alert.alert("Mismatch", "Password and confirm do not match.");

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: e,
      password: p,
    });

    if (error) {
      setLoading(false);
      return Alert.alert("Register Failed", error.message);
    }

    // ✅ wait a moment for session to become available
    const { session } = await getSessionWithRetry();
    setLoading(false);

    if (session) {
      // ✅ Let AuthGate drive: no store yet => onboarding
      router.replace("/(onboarding)");
      return;
    }

    Alert.alert(
      "Account created",
      "Tafadhali login kuendelea (session haijarudi)."
    );
    router.replace("/(auth)/login");
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 26, fontWeight: "900", marginBottom: 8 }}>
        ZETRA BMS
      </Text>
      <Text style={{ opacity: 0.7, marginBottom: 20 }}>Create account</Text>

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
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "700" }}>Confirm Password</Text>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
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
        onPress={onRegister}
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
          {loading ? "Creating..." : "Create account"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace("/(auth)/login")}
        style={{ marginTop: 14, alignItems: "center" }}
      >
        <Text style={{ textDecorationLine: "underline" }}>
          Already have an account? Login
        </Text>
      </Pressable>
    </View>
  );
}