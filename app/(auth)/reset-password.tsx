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
import {
  applySupabaseSessionFromInitialUrl,
  supabase,
} from "../../src/supabase/supabaseClient";

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

    const bootstrapRecovery = async () => {
      try {
        // 1) kwanza jaribu kuset session kutoka deep link ya email
        await applySupabaseSessionFromInitialUrl();

        // 2) kisha soma session ya sasa
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!alive) return;

        setRecoveryReady(!!session);
      } catch {
        if (!alive) return;
        setRecoveryReady(false);
      } finally {
        if (alive) setCheckingRecovery(false);
      }
    };

    void bootstrapRecovery();

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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                  SECURE PASSWORD RECOVERY
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
                Reset password
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.66)",
                  marginBottom: 24,
                  lineHeight: 22,
                  fontSize: 15,
                  fontWeight: "600",
                  maxWidth: 340,
                }}
              >
                Weka password mpya kwa account yako ya ZETRA BMS.
              </Text>

              {checkingRecovery ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.90)", fontWeight: "800" }}>
                    Checking reset session...
                  </Text>
                </View>
              ) : recoveryReady ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.18)",
                    backgroundColor: "rgba(16,185,129,0.08)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "800" }}>
                    Reset session ready ✅
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.18)",
                    backgroundColor: "rgba(239,68,68,0.09)",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.92)",
                      fontWeight: "800",
                      lineHeight: 20,
                    }}
                  >
                    Reset session haijapatikana. Rudi kwenye login, bonyeza Forgot Password, kisha
                    fungua link mpya kutoka email yako.
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
                  backgroundColor: "#22C58B",
                  paddingVertical: 17,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading || checkingRecovery || !recoveryReady ? 0.7 : 1,
                  marginTop: 20,
                  shadowColor: "#22C58B",
                  shadowOpacity: 0.16,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                }}
              >
                <Text
                  style={{
                    color: "#04110C",
                    fontWeight: "900",
                    fontSize: 17,
                    letterSpacing: 0.2,
                  }}
                >
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
                <Text
                  style={{
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                >
                  Back to <Text style={{ color: "#6EE7B7", fontWeight: "900" }}>Login</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}