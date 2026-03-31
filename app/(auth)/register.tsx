import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { supabase } from "../../src/supabase/supabaseClient";

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
    if (p.length < 6) {
      return Alert.alert("Weak password", "Use at least 6 characters.");
    }
    if (p !== confirm) {
      return Alert.alert("Mismatch", "Password and confirm do not match.");
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: e,
      password: p,
      options: {
        emailRedirectTo: "zetrabmsclean://login",
      },
    });

    if (error) {
      setLoading(false);
      return Alert.alert("Register Failed", error.message);
    }

    setLoading(false);

    Alert.alert(
      "Verify your email",
      "Account imeundwa. Tumejaribu kutuma verification email.\n\nFungua email yako, verify account, kisha login kuendelea."
    );
    router.replace("/(auth)/login");
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, backgroundColor: "#061018" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.12)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: -80,
            left: -60,
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.08)",
          }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 22,
              paddingVertical: 28,
            }}
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 28,
                padding: 22,
              }}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.22)",
                  backgroundColor: "rgba(16,185,129,0.10)",
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 12 }}>
                  Start Secure Access
                </Text>
              </View>

              <Text
                style={{
                  color: "white",
                  fontSize: 36,
                  lineHeight: 40,
                  fontWeight: "900",
                  marginBottom: 10,
                }}
              >
                Create Account
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.68)",
                  marginBottom: 24,
                  lineHeight: 23,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Start your business journey with ZETRA BMS and verify your email before first login.
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
              <GlassInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Create a password"
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

              <Text
                style={{
                  color: "rgba(255,255,255,0.48)",
                  marginTop: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Use at least 6 characters.
              </Text>

              <FieldLabel>Confirm Password</FieldLabel>
              <GlassInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                placeholder="Repeat your password"
                rightSlot={
                  <Pressable
                    onPress={() => setShowConfirm((v) => !v)}
                    hitSlop={10}
                    style={{ paddingLeft: 12, paddingVertical: 4 }}
                  >
                    <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 14 }}>
                      {showConfirm ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                }
              />

              <View
                style={{
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.22)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  borderRadius: 18,
                  padding: 14,
                  marginTop: 18,
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontWeight: "800",
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  After creating your account, verify your email first. Then login and continue to onboarding.
                </Text>
              </View>

              <Pressable
                onPress={onRegister}
                disabled={loading}
                style={{
                  backgroundColor: "#1DBA84",
                  paddingVertical: 17,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <Text style={{ color: "#07120F", fontWeight: "900", fontSize: 18 }}>
                  {loading ? "Creating..." : "Create account"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                style={{
                  marginTop: 18,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 16 }}>
                  Already have an account?{" "}
                  <Text style={{ color: "#34D399", fontWeight: "900" }}>Login</Text>
                </Text>
              </Pressable>

              <Text
                style={{
                  color: "rgba(255,255,255,0.42)",
                  fontSize: 12,
                  fontWeight: "700",
                  textAlign: "center",
                  marginTop: 18,
                  lineHeight: 18,
                }}
              >
                Protected account creation for your business workspace.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}