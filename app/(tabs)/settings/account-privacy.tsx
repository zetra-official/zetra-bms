import {useAccountCopy} from "@/src/i18n/accountLifecycle";
import {useLanguage} from "@/src/i18n/LanguageProvider";
import {RELEASE_FEATURES, accountReleaseMessage} from "@/src/release/safety";
import {useSystemMessageText} from "@/src/i18n/useSystemMessageText";
import {useCommonText} from "@/src/i18n/useCommonText";
// app/(tabs)/settings/account-privacy.tsx
import React, { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  ScrollView,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { useOrg } from "@/src/context/OrgContext";
import {
  clearCorruptSupabaseSession,
  supabase,
} from "@/src/supabase/supabaseClient";

const L = {
  bg: "#F3F7FC",
  card: "#FFFFFF",
  softCard: "#F8FAFC",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  emeraldBorder: "rgba(5,150,105,0.22)",
  danger: "#DC2626",
  dangerSoft: "rgba(220,38,38,0.08)",
  dangerBorder: "rgba(220,38,38,0.22)",
};

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
        color: L.muted,
        fontWeight: "900",
        fontSize: 12,
        letterSpacing: 0.8,
        marginBottom: 10,
        marginTop: 16,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function PremiumCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <Card
      style={{
        gap: 0,
        borderRadius: 24,
        borderColor: L.border,
        backgroundColor: L.card,
        overflow: "hidden",
        ...style,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -70,
          right: -60,
          width: 180,
          height: 180,
          borderRadius: 999,
          backgroundColor: "rgba(5,150,105,0.06)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -60,
          bottom: -90,
          width: 180,
          height: 180,
          borderRadius: 999,
          backgroundColor: "rgba(59,130,246,0.05)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.95)",
        }}
      />

      {children}
    </Card>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: L.border,
        marginLeft: 74,
      }}
    />
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  badge?: string;
  danger?: boolean;
}) {
  const iconBg = danger ? L.dangerSoft : L.emeraldSoft;
  const iconBorder = danger ? L.dangerBorder : L.emeraldBorder;
  const iconColor = danger ? L.danger : L.emerald;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 16,
          paddingHorizontal: 14,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: iconBg,
          borderWidth: 1,
          borderColor: iconBorder,
        }}
      >
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: danger ? L.danger : L.text,
            fontWeight: "900",
            fontSize: 15,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            style={{
              color: L.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 4,
              lineHeight: 17,
            }}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: "flex-end", gap: 8 }}>
        {badge ? (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: danger ? L.dangerBorder : L.border,
              backgroundColor: danger ? L.dangerSoft : L.softCard,
            }}
          >
            <Text
              style={{
                color: danger ? L.danger : L.text,
                fontWeight: "900",
                fontSize: 10,
                letterSpacing: 0.4,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}

        <Ionicons name="chevron-forward" size={18} color={L.faint} />
      </View>
    </Pressable>
  );
}

export default function AccountPrivacyScreen() {
 const {language: releaseLanguage}=useLanguage();
 const blockedAccountMessage=accountReleaseMessage(releaseLanguage);
 const systemText=useSystemMessageText();
 const uiText=useCommonText();
 const accountText=useAccountCopy();
 const submitting=useRef(false);
  const router = useRouter();
  const org = useOrg();

  const orgName = org.activeOrgName ?? "No organization";
  const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
  const store = org.activeStoreName ?? "—";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/(tabs)/settings");
  }, [router]);

  const closeDeleteModal = useCallback(() => {
    if (submitting.current) return;
    setConfirmOpen(false);
    setDeleteConfirmation("");
  }, [deleting]);

  const onDeleteAccount = useCallback(() => {
    if (!RELEASE_FEATURES.accountLifecycle) {
      setFeedback(blockedAccountMessage);
      Alert.alert(accountText("title"), blockedAccountMessage);
      return;
    }
    if (submitting.current) return;
    setDeleteConfirmation("");
    setFeedback("");
    setConfirmOpen(true);
  }, [blockedAccountMessage, accountText]);

  const handleConfirmDelete = useCallback(async () => {
    if (!RELEASE_FEATURES.accountLifecycle) {
      setFeedback(blockedAccountMessage);
      return;
    }
    if (submitting.current) return;
    const confirmation = String(deleteConfirmation ?? "").trim();

    if (!confirmation) {
      setFeedback(accountText("confirm"));
      return;
    }

    if (confirmation.toUpperCase() !== "DISABLE") {
      setFeedback(accountText("confirm"));
      return;
    }

    setFeedback("");
    submitting.current=true;
    setDeleting(true);

    try {
      const { data, error } = await supabase.rpc("disable_my_account");

      if (error) throw error;

      const payload = data as any;

      if (payload?.ok !== true) {
        throw new Error(payload?.message || "Failed to disable account.");
      }

      setConfirmOpen(false);
      setDeleteConfirmation("");

      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.log("post-disable signOut ignore:", err);
      }

      try {
        await clearCorruptSupabaseSession();
      } catch (err) {
        console.log("clear auth storage ignore:", err);
      }

      router.replace("/(auth)/login");
      Alert.alert(
        accountText("done"),
        accountText("signedout"),
        [
          {
            text: uiText("OK"),
            onPress: () => {
              router.replace("/(auth)/login");
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err?.message || "Imeshindikana kuzima account kwa sasa.";
      console.log("disable-account client error:", msg, err);
      setFeedback(accountText("failed"));
    } finally {
      submitting.current=false;
      setDeleting(false);
    }
  }, [deleteConfirmation, router, uiText, systemText, accountText, blockedAccountMessage]);

  return (
    <Screen scroll>
      <View style={{ flex: 1, backgroundColor: L.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 }}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [
              {
                width: 42,
                height: 42,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: L.border,
                backgroundColor: L.card,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={L.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: L.text, fontWeight: "900", fontSize: 22 }}>
              {uiText("Account & Privacy")}</Text>
            <Text style={{ color: L.muted, fontWeight: "800", marginTop: 4 }}>
              {(org.activeOrgName ?? uiText("No organization"))} • {role} • {store}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <PremiumCard style={{ borderColor: L.emeraldBorder }}>
            <View style={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: L.emeraldSoft,
                    borderWidth: 1,
                    borderColor: L.emeraldBorder,
                  }}
                >
                  <Ionicons name="shield-checkmark-outline" size={24} color={L.emerald} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: L.text,
                      fontWeight: "900",
                      fontSize: 20,
                      lineHeight: 24,
                    }}
                  >
                    {uiText("Privacy & Account Safety")}</Text>

                  <Text
                    style={{
                      color: L.muted,
                      fontWeight: "800",
                      marginTop: 8,
                      lineHeight: 20,
                    }}
                  >
                    {accountText("explain")}</Text>
                </View>
              </View>
            </View>
          </PremiumCard>
        </View>

        <SectionTitle label={uiText("Privacy")} />
        <PremiumCard>
          <View style={{ padding: 16 }}>
            <Text style={{ color: L.text, fontWeight: "900", fontSize: 15 }}>
              {uiText("Current position")}</Text>

            <Text
              style={{
                color: L.muted,
                fontWeight: "800",
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              {accountText("unavailable")}</Text>

            <Text
              style={{
                color: L.muted,
                fontWeight: "800",
                marginTop: 10,
                lineHeight: 20,
              }}
            >
              {accountText("explain")}</Text>
          </View>
        </PremiumCard>

        <SectionTitle label={uiText("Danger Zone")} />
        <PremiumCard style={{ borderColor: L.dangerBorder }}>
          <Row
            icon="warning-outline"
            title={accountText("title")}
            subtitle={accountText("explain")}
            badge={uiText("Warning")}
            danger
            onPress={onDeleteAccount}
          />

          <Divider />

          <View style={{ padding: 16, paddingTop: 14 }}>
            <Text style={{ color: L.danger, fontWeight: "900", fontSize: 13 }}>
              {uiText("Warning")}</Text>

            <Text
              style={{
                color: L.muted,
                fontWeight: "800",
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              {accountText("explain")}</Text>
          </View>
        </PremiumCard>

        <View style={{ height: 28 }} />

        <Modal
          visible={confirmOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeDeleteModal}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(15,23,42,0.40)",
                padding: 16,
                justifyContent: "center",
              }}
            >
              <Pressable
                onPress={closeDeleteModal}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                }}
              />

              <View
                style={{
                  maxHeight: "90%",
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: L.dangerBorder,
                  backgroundColor: L.card,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: 16,
                    paddingBottom: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: L.border,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: L.danger, fontWeight: "900", fontSize: 20 }}>
                    {accountText("title")}</Text>

                  <Pressable
                    onPress={closeDeleteModal}
                    disabled={deleting}
                    style={({ pressed }) => ({
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: L.border,
                      backgroundColor: pressed ? "#EEF2F7" : L.softCard,
                      opacity: deleting ? 0.5 : 1,
                    })}
                  >
                    <Ionicons name="close" size={20} color={L.text} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                  {feedback ? <Text accessibilityRole="alert" style={{color:L.danger,marginBottom:12}}>{feedback}</Text> : null}
                  <Text
                    style={{
                      color: L.text,
                      fontWeight: "900",
                      fontSize: 16,
                      lineHeight: 22,
                    }}
                  >
                    {accountText("confirm")}</Text>

                  <Text
                    style={{
                      color: L.muted,
                      fontWeight: "800",
                      marginTop: 8,
                      lineHeight: 20,
                    }}
                  >
                    {accountText("explain")}</Text>

                  <View
                    style={{
                      marginTop: 14,
                      borderWidth: 1,
                      borderColor: L.border,
                      borderRadius: 18,
                      backgroundColor: L.softCard,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                    }}
                  >
                    <TextInput
                      value={deleteConfirmation}
                      onChangeText={(v) => setDeleteConfirmation(String(v ?? "").toUpperCase())}
                      placeholder={accountText("confirm")}
                      placeholderTextColor={L.faint}
                      secureTextEntry={false}
                      editable={!deleting}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={{
                        flex: 1,
                        color: L.text,
                        fontWeight: "800",
                        paddingVertical: 14,
                      }}
                    />

                    <View style={{ width: 20, marginLeft: 8 }} />
                  </View>

                  <Text
                    style={{
                      color: L.danger,
                      fontWeight: "800",
                      marginTop: 10,
                      lineHeight: 19,
                      fontSize: 12,
                    }}
                  >
                    {accountText("confirm")}</Text>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={closeDeleteModal}
                        disabled={deleting}
                        style={({ pressed }) => ({
                          paddingVertical: 14,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: L.border,
                          backgroundColor: pressed ? "#EEF2F7" : L.softCard,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: deleting ? 0.5 : pressed ? 0.92 : 1,
                        })}
                      >
                        <Text style={{ color: L.text, fontWeight: "900", fontSize: 15 }}>
                          {uiText("Cancel")}</Text>
                      </Pressable>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={() => {
                          void handleConfirmDelete();
                        }}
                        disabled={deleting}
                        style={({ pressed }) => ({
                          paddingVertical: 14,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: L.dangerBorder,
                          backgroundColor: L.dangerSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: deleting ? 0.75 : pressed ? 0.92 : 1,
                        })}
                      >
                        {deleting ? (
                          <ActivityIndicator color={L.danger} />
                        ) : (
                          <Text style={{ color: L.danger, fontWeight: "900", fontSize: 15 }}>
                            {accountText("title")}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Screen>
  );
}
