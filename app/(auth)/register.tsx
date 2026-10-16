import {useAuthText} from "@/src/i18n/useAuthText";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  const tr=useAuthText();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [webVerificationEmail, setWebVerificationEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const emailTrimmed = useMemo(() => email.trim(), [email]);

  const onRegister = async () => {
    const e = emailTrimmed.toLowerCase();
    const p = password;

    if (!e) {
      return Alert.alert(tr("Missing"), tr("Email is required."));
    }

    if (!e.includes("@") || !e.includes(".")) {
      return Alert.alert(
        tr("Invalid Email"),
        tr("Tafadhali tumia email address sahihi.")
      );
    }

    if (!p) {
      return Alert.alert(tr("Missing"), tr("Password is required."));
    }

    if (p.length < 6) {
      return Alert.alert(tr("Weak password"), tr("Use at least 6 characters."));
    }

    if (p !== confirm) {
      return Alert.alert(
        tr("Mismatch"),
        tr("Password and confirm password do not match.")
      );
    }

    setLoading(true);

    const emailRedirectTo =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : "https://regal-sunburst-e3cee8.netlify.app/verified.html";

    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: p,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setLoading(false);
      return Alert.alert(tr("Register Failed"), error.message);
    }

    const session = data?.session ?? null;
    const user = data?.user ?? null;

    setLoading(false);

    if (!user?.id) {
      return Alert.alert(
        tr("Register Failed"),
        tr("Account haikuweza kuundwa vizuri.")
      );
    }

    // ✅ reset onboarding referral state kwa account mpya
    try {
      const { kv } = await import("@/src/storage/kv");

      try {
        await (kv as any)?.remove?.("zetra_onboarding_referral_done_v1");
      } catch {}

      try {
        await (kv as any)?.remove?.("zetra_onboarding_referral_code_v1");
      } catch {}

      try {
        await (kv as any)?.delete?.("zetra_onboarding_referral_done_v1");
      } catch {}

      try {
        await (kv as any)?.delete?.("zetra_onboarding_referral_code_v1");
      } catch {}
    } catch {}

    // ✅ Safety fallback:
    // Ikiwa Confirm Email itakuwa OFF siku nyingine,
    // session inaweza kurudi moja kwa moja.
    if (session) {
      router.replace("/(onboarding)/referral");
      return;
    }

    // Confirm Email iko ON:
    // Web uses an in-page confirmation because browser Alert behavior
    // is not reliable enough for this critical verification step.
    if (Platform.OS === "web") {
      setWebVerificationEmail(e);
      return;
    }

    Alert.alert(
      tr("Verification email sent"),
      tr("auth.registrationEmailBody", { email: e }),
      [
        {
          text: tr("GO TO LOGIN"),
          onPress: () => {
            router.replace("/(auth)/login");
          },
        },
      ],
      {
        cancelable: false,
      }
    );
  };

  const content = (
    <View style={{ flex: 1, backgroundColor: "#061018", overflow: "hidden" }}>
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
                  {tr("START SECURE ACCESS")}</Text>
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
                {tr("Create account")}</Text>

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
                {tr("Create your secure ZETRA BMS account. Tutathibitisha email yako kabla ya kuendelea na business setup.")}</Text>

             <FieldLabel>{tr("Email")}</FieldLabel>
              <GlassInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
              />

              <Text
                style={{
                  color: "rgba(255,255,255,0.48)",
                  marginTop: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  fontWeight: "700",
                  lineHeight: 18,
                }}
              >
                {tr("Tutatuma verification link kwenye email hii. Hakikisha ni email sahihi unayoweza kufungua.")}</Text>

              <FieldLabel>{tr("Password")}</FieldLabel> 
              <GlassInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder={tr("Create a password")}
                rightSlot={
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    style={{ paddingLeft: 12, paddingVertical: 4 }}
                  >
                    <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 14 }}>
                      {showPassword ? tr("Hide") : tr("Show")}
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
                {tr("Use at least 6 characters.")}</Text>

              <FieldLabel>{tr("Confirm Password")}</FieldLabel>
              <GlassInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                placeholder={tr("Repeat your password")}
                rightSlot={
                  <Pressable
                    onPress={() => setShowConfirm((v) => !v)}
                    hitSlop={10}
                    style={{ paddingLeft: 12, paddingVertical: 4 }}
                  >
                    <Text style={{ color: "#34D399", fontWeight: "900", fontSize: 14 }}>
                      {showConfirm ? tr("Hide") : tr("Show")}
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
                  {tr("Baada ya kubonyeza Create account, tutatuma verification link kwenye email yako. Fungua email hiyo na uthibitishe account, kisha rudi ZETRA BMS na Login kuendelea na business setup.")}</Text>
              </View>

              {Platform.OS === "web" && webVerificationEmail ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.35)",
                    backgroundColor: "rgba(16,185,129,0.10)",
                    borderRadius: 20,
                    padding: 18,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      color: "#6EE7B7",
                      fontSize: 18,
                      fontWeight: "900",
                      marginBottom: 8,
                    }}
                  >
                    {tr("Verification email sent")}</Text>

                  <Text
                    style={{
                      color: "rgba(255,255,255,0.88)",
                      fontSize: 14,
                      fontWeight: "700",
                      lineHeight: 21,
                    }}
                  >
                    {tr("Account yako imeundwa. Tumetuma verification link kwenye:")}</Text>

                  <Text
                    style={{
                      color: "white",
                      fontSize: 15,
                      fontWeight: "900",
                      marginTop: 8,
                    }}
                  >
                    {webVerificationEmail}
                  </Text>

                  <Text
                    style={{
                      color: "rgba(255,255,255,0.68)",
                      fontSize: 13,
                      fontWeight: "700",
                      lineHeight: 20,
                      marginTop: 12,
                    }}
                  >
                    {tr("Fungua email yako na bonyeza Verify Account. Kama huioni, angalia Spam/Junk. Baada ya verification unaweza kurudi ZETRA BMS na kuendelea.")}</Text>

                  <Pressable
                    onPress={() => router.replace("/(auth)/login")}
                    style={{
                      backgroundColor: "#22C58B",
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 16,
                    }}
                  >
                    <Text
                      style={{
                        color: "#04110C",
                        fontSize: 15,
                        fontWeight: "900",
                      }}
                    >
                      {tr("Go to Login")}</Text>
                  </Pressable>
                </View>
              ) : (
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {loading ? (
                    <ActivityIndicator
                      size="small"
                      color="#04110C"
                      style={{ marginRight: 10 }}
                    />
                  ) : null}

                  <Text
                    style={{
                      color: "#04110C",
                      fontWeight: "900",
                      fontSize: 17,
                      letterSpacing: 0.2,
                    }}
                  >
                    {loading ? tr("Creating account...") : tr("Create account")}
                  </Text>
                </View>
              </Pressable>
              )}

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
                  {tr("Already have an account?")}{" "}
                  <Text style={{ color: "#6EE7B7", fontWeight: "900" }}>{tr("Login")}</Text>
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
                {tr("Protected account creation for your business workspace.")}</Text>
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
