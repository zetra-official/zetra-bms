// app/(auth)/register.tsx
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const emailTrimmed = useMemo(() => email.trim(), [email]);

  const onRegister = async () => {
    const e = emailTrimmed;
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

    // after sign up, user must verify email first
    const { session } = await getSessionWithRetry();

    if (session) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }

    setLoading(false);

    Alert.alert(
      "Verify your email",
      "Account imeundwa. Tumejaribu kutuma verification email.\n\nFungua email yako, verify account, kisha login kuendelea."
    );
    router.replace("/(auth)/login");
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 20,
        backgroundColor: "#0B0F14",
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.04)",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <Text style={{ color: "white", fontSize: 28, fontWeight: "900", marginBottom: 8 }}>
          Create Account
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", marginBottom: 22 }}>
          Start your business journey with ZETRA BMS.
        </Text>

        <Text style={{ color: "white", fontWeight: "800", marginBottom: 8 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            color: "white",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 16,
          }}
        />

        <Text style={{ color: "white", fontWeight: "800", marginBottom: 8 }}>Password</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderRadius: 14,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Create a password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              flex: 1,
              color: "white",
              paddingVertical: 14,
            }}
          />

          <Pressable onPress={() => setShowPassword((v) => !v)}>
            <Text style={{ color: "#34D399", fontWeight: "800" }}>
              {showPassword ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: "white", fontWeight: "800", marginBottom: 8 }}>
          Confirm Password
        </Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderRadius: 14,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            placeholder="Repeat your password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              flex: 1,
              color: "white",
              paddingVertical: 14,
            }}
          />

          <Pressable onPress={() => setShowConfirm((v) => !v)}>
            <Text style={{ color: "#34D399", fontWeight: "800" }}>
              {showConfirm ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.25)",
            backgroundColor: "rgba(16,185,129,0.08)",
            borderRadius: 16,
            padding: 12,
            marginBottom: 18,
          }}
        >
          <Text style={{ color: "white", fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
            After creating account, you will verify your email first before login.
          </Text>
        </View>

        <Pressable
          onPress={onRegister}
          disabled={loading}
          style={{
            backgroundColor: "#10B981",
            paddingVertical: 15,
            borderRadius: 16,
            alignItems: "center",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "#08110F", fontWeight: "900", fontSize: 15 }}>
            {loading ? "Creating..." : "Create account"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 16, alignItems: "center" }}
        >
          <Text style={{ color: "white" }}>
            Already have an account?{" "}
            <Text style={{ color: "#34D399", fontWeight: "900" }}>Login</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}