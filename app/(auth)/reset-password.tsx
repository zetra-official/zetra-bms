import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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

function clean(s: any) {
  return String(s ?? "").trim();
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
  rightSlot,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
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
        autoCapitalize="none"
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

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);

  const passwordStrengthText = useMemo(() => {
    if (!password) return "Enter a new password";
    if (password.length < 6) return "Too short";
    if (password.length < 8) return "Okay";
    return "Strong enough";
  }, [password]);

  useEffect(() => {
    let alive = true;

    const checkRecoverySession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!alive) return;

        if (session) {
          setRecoveryReady(true);
        } else {
          setRecoveryReady(false);
        }
      } catch {
        if (!alive) return;
        setRecoveryReady(false);
      } finally {
        if (alive) setCheckingRecovery(false);
      }
    };

    void checkRecoverySession();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryReady(true);
        setCheckingRecovery(false);
        return;
      }

      if (
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION") &&
        session
      ) {
        setRecoveryReady(true);
        setCheckingRecovery(false);
      }
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const onUpdatePassword = async () => {
    const p = password;
    const c = confirm;

    if (!recoveryReady) {
      Alert.alert(
        "Invalid reset session",
        "Link hii haijafunguka vizuri au session ya reset haijapatikana. Fungua email yako tena kisha bonyeza link ya reset upya."
      );
      return;
    }

    if (!p) {
      Alert.alert("Missing", "New password is required.");
      return;
    }

    if (p.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }

    if (p !== c) {
      Alert.alert("Mismatch", "Password and confirm do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: p,
      });

      if (error) throw error;

      Alert.alert(
        "Password updated",
        "Password yako imebadilishwa successfully. Sasa utaingia kwenye login."
      );

      router.replace("/(auth)/login");
    } catch (err: any) {
      Alert.alert("Update failed", clean(err?.message) || "Failed to update password.");
    } finally {
      setLoading(false);
    }
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
                  Secure Password Recovery
                </Text>
              </View>

              <Text
                style={{
                  color: "white",
                  fontSize: 34,
                  lineHeight: 38,
                  fontWeight: "900",
                  marginBottom: 10,
                }}
              >
                Reset Password
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.68)",
                  marginBottom: 22,
                  lineHeight: 23,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Weka password mpya kwa account yako ya ZETRA BMS.
              </Text>

              {checkingRecovery ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    Checking reset session...
                  </Text>
                </View>
              ) : !recoveryReady ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.22)",
                    backgroundColor: "rgba(239,68,68,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800", lineHeight: 20 }}>
                    Reset session haijapatikana. Rudi kwenye login, bonyeza Forgot Password, kisha
                    fungua link mpya kutoka email yako.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.22)",
                    backgroundColor: "rgba(16,185,129,0.10)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    Reset session ready ✅
                  </Text>
                </View>
              )}

              <FieldLabel>New Password</FieldLabel>
              <GlassInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Enter new password"
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
                  color: "rgba(255,255,255,0.50)",
                  marginTop: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {passwordStrengthText}
              </Text>

              <FieldLabel>Confirm New Password</FieldLabel>
              <GlassInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                placeholder="Repeat new password"
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

              <Pressable
                onPress={onUpdatePassword}
                disabled={loading || checkingRecovery || !recoveryReady}
                style={{
                  backgroundColor: "#1DBA84",
                  paddingVertical: 17,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading || checkingRecovery || !recoveryReady ? 0.7 : 1,
                  marginTop: 20,
                }}
              >
                <Text style={{ color: "#07120F", fontWeight: "900", fontSize: 18 }}>
                  {loading ? "Updating..." : "Save New Password"}
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
                  Back to <Text style={{ color: "#34D399", fontWeight: "900" }}>Login</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}