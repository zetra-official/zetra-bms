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
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const emailTrimmed = useMemo(() => email.trim(), [email]);
  const confirmEmailTrimmed = useMemo(() => confirmEmail.trim(), [confirmEmail]);

  const onRegister = async () => {
    const e = emailTrimmed;
    const ce = confirmEmailTrimmed;
    const p = password;

    if (!e) return Alert.alert("Missing", "Email is required.");
    if (!ce) return Alert.alert("Missing", "Confirm Email is required.");
    if (e.toLowerCase() !== ce.toLowerCase()) {
      return Alert.alert("Mismatch", "Email and confirm email do not match.");
    }
    if (!p) return Alert.alert("Missing", "Password is required.");
    if (p.length < 6) {
      return Alert.alert("Weak password", "Use at least 6 characters.");
    }
    if (p !== confirm) {
      return Alert.alert("Mismatch", "Password and confirm do not match.");
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
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

    const session = data?.session ?? null;
    const user = data?.user ?? null;

    setLoading(false);

    if (!user?.id) {
      return Alert.alert("Register Failed", "Account haikuweza kuundwa vizuri.");
    }

    // Email confirmation ikiwa OFF, user aende kwanza referral step, kisha onboarding.
    if (session) {
      router.replace("/(onboarding)/referral");
      return;
    }

    // fallback salama endapo backend itarudisha user bila session
    Alert.alert(
      "Continue to login",
      "Account imeundwa. Tafadhali login kuendelea na onboarding."
    );
    router.replace("/(auth)/login");
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
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : Platform.OS === "android"
              ? "height"
              : undefined
          }
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
                  START SECURE ACCESS
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
                Create account
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
                Start your business journey with ZETRA BMS and continue directly to business setup.
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

              <FieldLabel>Confirm Email</FieldLabel>
              <GlassInput
                value={confirmEmail}
                onChangeText={setConfirmEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Repeat your email"
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
                Tumia email sahihi kwa ajili ya password reset baadaye.
              </Text>

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
                  borderColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 18,
                  padding: 14,
                  marginTop: 18,
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.88)",
                    fontWeight: "800",
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  After creating your account, utaingia moja kwa moja kwenye onboarding ya business setup. Hakikisha email umeiandika sawa kwa sababu itatumika kusaidia password reset baadaye.
                </Text>
              </View>

              <Pressable
                onPress={onRegister}
                disabled={loading}
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
                <Text
                  style={{
                    color: "rgba(255,255,255,0.88)",
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                >
                  Already have an account?{" "}
                  <Text style={{ color: "#6EE7B7", fontWeight: "900" }}>Login</Text>
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
                Protected account creation for your business workspace.
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