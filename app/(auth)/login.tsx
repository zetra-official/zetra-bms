// app/(auth)/login.tsx
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useOrg } from "../../src/context/OrgContext";
import {
  clearCorruptSupabaseSession,
  supabase,
} from "../../src/supabase/supabaseClient";

function isDisabledAccountMessage(message: unknown) {
  const msg = String(message ?? "").toLowerCase();

  return (
    msg.includes("disabled") ||
    msg.includes("deleted") ||
    msg.includes("deactivated") ||
    msg.includes("inactive") ||
    msg.includes("account disabled") ||
    msg.includes("account deleted")
  );
}

function isEmailNotVerified(user: any) {
  const confirmedAt =
    user?.email_confirmed_at ??
    user?.confirmed_at ??
    null;

  return !confirmedAt;
}

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useOrg();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailTrimmed = useMemo(() => email.trim(), [email]);

  const onForgotPassword = async () => {
    const e = emailTrimmed;

    if (!e) {
      Alert.alert(
        "Email required",
        "Andika email yako kwanza, kisha bonyeza Forgot Password."
      );
      return;
    }

    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e);
      if (error) throw error;

      Alert.alert(
        "Reset email sent",
        "Tumejaribu kutuma email ya kubadili password. Fungua email yako ufuate maelekezo."
      );
    } catch (err: any) {
      Alert.alert("Reset Failed", err?.message ?? "Failed to send reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  const onLogin = async () => {
    const e = emailTrimmed;
    if (!e) return Alert.alert("Missing", "Email is required.");
    if (!password) return Alert.alert("Missing", "Password is required.");

    setLoading(true);

    try {
      // 1) force-clear stale persisted auth
      await clearCorruptSupabaseSession();

      // 2) clear in-memory session too
      try {
        await supabase.auth.signOut();
      } catch (err: any) {
        console.log("pre-login signOut ignore:", err);
      }

      // 3) fresh login
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });

      if (error) {
        throw error;
      }

      // 4) ensure session exists
      let accessToken: string | null = data?.session?.access_token ?? null;

      if (!accessToken) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        accessToken = session?.access_token ?? null;
      }

      if (!accessToken) {
        throw new Error("Fresh session was not created after login.");
      }

      // 5) read current user first
      const {
        data: { user },
        error: getUserError,
      } = await supabase.auth.getUser();

      if (getUserError) {
        throw getUserError;
      }

      if (!user?.id) {
        throw new Error("Failed to load authenticated user after login.");
      }

      if (isEmailNotVerified(user)) {
        try {
          await supabase.auth.signOut();
        } catch (err: any) {
          console.log("unverified-account signOut ignore:", err);
        }

        await clearCorruptSupabaseSession();

        Alert.alert(
          "Verify your email",
          "Email yako bado haijaverify. Fungua email yako kwanza, kisha verify account ndipo uingie."
        );
        return;
      }

      // 6) check disabled status directly from profile
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("is_disabled, disabled_reason")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (profileRow?.is_disabled === true) {
        try {
          await supabase.auth.signOut();
        } catch (err: any) {
          console.log("disabled-account signOut ignore:", err);
        }

        await clearCorruptSupabaseSession();

        Alert.alert(
          "Account unavailable",
          "Account hii imezimwa au imeondolewa. Huwezi kuingia tena."
        );
        return;
      }

      // 7) force canonical refresh only after disabled-check passes
      await refresh();

      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err?.message ?? "Unknown login error";

      if (isDisabledAccountMessage(msg)) {
        try {
          await supabase.auth.signOut();
        } catch (signOutErr: any) {
          console.log("login disabled signOut ignore:", signOutErr);
        }

        await clearCorruptSupabaseSession();

        Alert.alert(
          "Account unavailable",
          "Account hii imezimwa au imeondolewa. Huwezi kuingia tena."
        );
        return;
      }

      Alert.alert("Login Failed", msg);
    } finally {
      setLoading(false);
    }
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
          Welcome Back
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", marginBottom: 22 }}>
          Login to continue managing your business with ZETRA BMS.
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
            marginBottom: 12,
          }}
        >
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Enter your password"
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

        <Pressable
          onPress={onForgotPassword}
          disabled={sendingReset}
          style={{ alignSelf: "flex-end", marginBottom: 18 }}
        >
          <Text style={{ color: "#34D399", fontWeight: "800" }}>
            {sendingReset ? "Sending..." : "Forgot Password?"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onLogin}
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
            {loading ? "Signing In..." : "Login"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/register")}
          style={{ marginTop: 16, alignItems: "center" }}
        >
          <Text style={{ color: "white" }}>
            Don&apos;t have an account?{" "}
            <Text style={{ color: "#34D399", fontWeight: "900" }}>Create account</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}