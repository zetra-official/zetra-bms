import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
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
  const confirmedAt = user?.email_confirmed_at ?? user?.confirmed_at ?? null;
  return !confirmedAt;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: "white",
        fontWeight: "900",
        marginBottom: 8,
        fontSize: 14,
      }}
    >
      {children}
    </Text>
  );
}

function GlassInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  rightSlot,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  rightSlot?: React.ReactNode;
}) {
  return (
    <View
      style={{
        minHeight: 60,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 18,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize={autoCapitalize ?? "none"}
        keyboardType={keyboardType ?? "default"}
        autoCorrect={false}
        autoComplete={keyboardType === "email-address" ? "email" : secureTextEntry ? "password" : "off"}
        textContentType={secureTextEntry ? "password" : keyboardType === "email-address" ? "emailAddress" : "none"}
        style={{
          flex: 1,
          color: "white",
          fontSize: 16,
          fontWeight: "700",
          paddingVertical: 16,
        }}
      />
      {rightSlot}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useOrg();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginLockedRef = useRef(false);

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
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: "zetrabmsclean://reset-password",
      });

      if (error) throw error;

      Alert.alert(
        "Reset email sent",
        "Tumejaribu kutuma email ya kubadili password. Fungua email yako, bonyeza link, kisha rudi kwenye app kuweka password mpya."
      );
    } catch (err: any) {
      Alert.alert("Reset Failed", err?.message ?? "Failed to send reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  const onLogin = async () => {
    if (loginLockedRef.current || loading) return;

    const e = emailTrimmed;

    if (!e) {
      Alert.alert("Missing", "Email is required.");
      return;
    }

    if (!password) {
      Alert.alert("Missing", "Password is required.");
      return;
    }

    loginLockedRef.current = true;
    setLoading(true);

    try {
      await clearCorruptSupabaseSession();

      try {
        await supabase.auth.signOut();
      } catch (err: any) {
        console.log("pre-login signOut ignore:", err);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });

      if (error) throw error;

      let accessToken: string | null = data?.session?.access_token ?? null;

      if (!accessToken) {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        accessToken = session?.access_token ?? null;
      }

      if (!accessToken) {
        throw new Error("Fresh session was not created after login.");
      }

      const {
        data: { user },
        error: getUserError,
      } = await supabase.auth.getUser();

      if (getUserError) throw getUserError;
      if (!user?.id) throw new Error("Failed to load authenticated user after login.");

      if (isEmailNotVerified(user)) {
        try {
          await supabase.auth.signOut();
        } catch (err: any) {
          console.log("unverified-account signOut ignore:", err);
        }

        await clearCorruptSupabaseSession();

        Alert.alert(
          "Verify your email",
          "Email yako bado haijaverify. Fungua email yako, verify account, kisha login."
        );
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("is_disabled, disabled_reason")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

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

      if (
        String(msg).toLowerCase().includes("email not confirmed") ||
        String(msg).toLowerCase().includes("email_not_confirmed") ||
        String(msg).toLowerCase().includes("confirm your email")
      ) {
        Alert.alert(
          "Verify your email",
          "Email yako bado haijaverify. Fungua email yako kwanza, verify account, kisha login."
        );
        return;
      }

      Alert.alert("Login Failed", msg);
    } finally {
      loginLockedRef.current = false;
      setLoading(false);
    }
  };

  const content = (
    <View style={{ flex: 1, backgroundColor: "#061018" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -70,
            right: -50,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.08)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 120,
            left: -70,
            width: 140,
            height: 140,
            borderRadius: 999,
            backgroundColor: "rgba(59,130,246,0.05)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: -90,
            left: -40,
            width: 190,
            height: 190,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.05)",
          }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 20,
              paddingVertical: 32,
            }}
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.045)",
                borderRadius: 30,
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 18,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              }}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.18)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  marginBottom: 18,
                }}
              >
                <Text
                  style={{
                    color: "#6EE7B7",
                    fontWeight: "900",
                    fontSize: 11,
                    letterSpacing: 0.8,
                  }}
                >
                  SECURE BUSINESS ACCESS
                </Text>
              </View>

              <Text
                style={{
                  color: "white",
                  fontSize: 32,
                  lineHeight: 36,
                  fontWeight: "900",
                  marginBottom: 8,
                  letterSpacing: 0.2,
                }}
              >
                Welcome back
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.66)",
                  marginBottom: 26,
                  lineHeight: 22,
                  fontSize: 15,
                  fontWeight: "600",
                  maxWidth: 340,
                }}
              >
                Sign in to continue managing your business with ZETRA BMS.
              </Text>

              <FieldLabel>Email</FieldLabel>
              <GlassInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
              />

              <View style={{ height: 16 }} />

              <FieldLabel>Password</FieldLabel>
              <View
                {...(Platform.OS === "web"
                  ? {
                      onKeyDown: (e: any) => {
                        if (e?.key === "Enter") {
                          e.preventDefault?.();
                          void onLogin();
                        }
                      },
                    }
                  : {})}
              >
                <GlassInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Enter your password"
                  rightSlot={
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      style={{ paddingLeft: 12, paddingVertical: 4 }}
                    >
                      <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 14 }}>
                        {showPassword ? "Hide" : "Show"}
                      </Text>
                    </Pressable>
                  }
                />
              </View>

              <Pressable
                onPress={onForgotPassword}
                disabled={sendingReset}
                style={{
                  alignSelf: "flex-end",
                  marginTop: 12,
                  marginBottom: 22,
                }}
              >
                <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 15 }}>
                  {sendingReset ? "Sending..." : "Forgot Password?"}
                </Text>
              </Pressable>

              <Pressable
                onPress={onLogin}
                disabled={loading}
                accessibilityRole="button"
                style={{
                  backgroundColor: "#22C58B",
                  paddingVertical: 17,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading ? 0.7 : 1,
                  marginTop: 2,
                  shadowColor: "#22C58B",
                  shadowOpacity: 0.16,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                  cursor: Platform.OS === "web" ? ("pointer" as any) : undefined,
                }}
              >
                <Text
                  style={{
                    color: "#04110C",
                    fontWeight: "900",
                    fontSize: 17,
                    letterSpacing: 0.2,
                    userSelect: Platform.OS === "web" ? ("none" as any) : undefined,
                  }}
                >
                  {loading ? "Signing In..." : "Login"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/(auth)/register")}
                style={{
                  marginTop: 18,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                >
                  Don&apos;t have an account?{" "}
                  <Text style={{ color: "#6EE7B7", fontWeight: "900" }}>Create account</Text>
                </Text>
              </Pressable>

              <Text
                style={{
                  color: "rgba(255,255,255,0.38)",
                  fontSize: 12,
                  fontWeight: "700",
                  textAlign: "center",
                  marginTop: 16,
                  lineHeight: 18,
                }}
              >
                Secure sign-in for owners, admins, cashier, supervisor and staff.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
  );

  if (Platform.OS === "web") {
    return content;
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {content}
    </TouchableWithoutFeedback>
  );
}