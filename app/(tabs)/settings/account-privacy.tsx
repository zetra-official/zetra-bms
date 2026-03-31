// app/(tabs)/settings/account-privacy.tsx
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import {
  clearCorruptSupabaseSession,
  supabase,
} from "@/src/supabase/supabaseClient";

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
        color: "rgba(255,255,255,0.72)",
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
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(15,18,24,0.98)",
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
          backgroundColor: "rgba(16,185,129,0.05)",
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
          backgroundColor: "rgba(34,211,238,0.03)",
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
          backgroundColor: "rgba(255,255,255,0.08)",
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
        backgroundColor: "rgba(255,255,255,0.08)",
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
  const iconBg = danger ? "rgba(201,74,74,0.10)" : UI.emeraldSoft;
  const iconBorder = danger ? "rgba(201,74,74,0.22)" : UI.emeraldBorder;
  const iconColor = danger ? UI.danger : UI.emerald;

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
            color: danger ? UI.danger : UI.text,
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
              color: UI.muted,
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
              borderColor: danger ? "rgba(201,74,74,0.18)" : "rgba(255,255,255,0.10)",
              backgroundColor: danger ? "rgba(201,74,74,0.10)" : "rgba(255,255,255,0.05)",
            }}
          >
            <Text
              style={{
                color: danger ? UI.danger : UI.text,
                fontWeight: "900",
                fontSize: 10,
                letterSpacing: 0.4,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}

        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
      </View>
    </Pressable>
  );
}

export default function AccountPrivacyScreen() {
  const router = useRouter();
  const org = useOrg();

  const orgName = org.activeOrgName ?? "No organization";
  const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
  const store = org.activeStoreName ?? "—";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/(tabs)/settings");
  }, [router]);

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setConfirmOpen(false);
    setDeleteConfirmation("");
    setShowPassword(false);
  }, [deleting]);

  const onDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete Account",
      "Hii action ni ya mwisho kabisa na haitarudishwa nyuma.\n\nUtaandika DELETE kuthibitisha kufunga account yako.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            setDeleteConfirmation("");
            setShowPassword(false);
            setConfirmOpen(true);
          },
        },
      ]
    );
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const confirmation = String(deleteConfirmation ?? "").trim();

    if (!confirmation) {
      Alert.alert("Confirmation required", "Andika DELETE kuthibitisha.");
      return;
    }

    if (confirmation.toUpperCase() !== "DELETE") {
      Alert.alert("Confirmation failed", "Lazima uandike DELETE kuthibitisha.");
      return;
    }

    setDeleting(true);

    try {
      const { data, error } = await supabase.rpc("disable_my_account");

      if (error) {
        throw error;
      }

      const payload = data as any;

      if (payload?.ok !== true) {
        throw new Error(payload?.message || "Failed to disable account.");
      }

      closeDeleteModal();

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

      Alert.alert(
        "Account deleted",
        "Account yako imezimwa successfully. Huwezi kuingia tena.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(auth)/login");
            },
          },
        ]
      );
    } catch (err: any) {
      const msg =
        err?.message || "Imeshindikana kuzima account kwa sasa.";

      console.log("disable-account client error:", msg, err);
      Alert.alert("Delete failed", msg);
    } finally {
      setDeleting(false);
    }
  }, [closeDeleteModal, deleteConfirmation, router]);

  return (
    <Screen scroll>
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
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 22 }}>
            Account & Privacy
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            {orgName} • {role} • {store}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <PremiumCard
          style={{
            borderColor: "rgba(16,185,129,0.22)",
          }}
        >
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: UI.emeraldSoft,
                  borderWidth: 1,
                  borderColor: UI.emeraldBorder,
                }}
              >
                <Ionicons name="shield-checkmark-outline" size={24} color={UI.emerald} />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "900",
                    fontSize: 20,
                    lineHeight: 24,
                  }}
                >
                  Privacy & Account Safety
                </Text>

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    marginTop: 8,
                    lineHeight: 20,
                  }}
                >
                  Hapa ndipo tunaweka controls nyeti za account, usalama wa taarifa, na
                  Danger Zone kwa hatua za mwisho za account.
                </Text>
              </View>
            </View>
          </View>
        </PremiumCard>
      </View>

      <SectionTitle label="Privacy" />
      <PremiumCard>
        <View style={{ padding: 16 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            Current position
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            Kwa sasa app ina eneo maalum la Account & Privacy ili mtumiaji ajue wazi mahali
            pa controls nyeti. Hii ni hatua nzuri kabla ya kupeleka app kwa watu.
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 10,
              lineHeight: 20,
            }}
          >
            Delete Account sasa ipo na uthibitisho wa mwisho wa manual confirmation
            kabla ya action kufanyika.
          </Text>
        </View>
      </PremiumCard>

      <SectionTitle label="Danger Zone" />
      <PremiumCard
        style={{
          borderColor: "rgba(201,74,74,0.18)",
        }}
      >
        <Row
          icon="warning-outline"
          title="Delete Account"
          subtitle="Disable this account after final confirmation"
          badge="DANGER"
          danger
          onPress={onDeleteAccount}
        />

        <Divider />

        <View style={{ padding: 16, paddingTop: 14 }}>
          <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 13 }}>
            Warning
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            Hili eneo ni la mwisho kabisa. Ukithibitisha kwa kuandika DELETE, account
            itazimwa mara moja na action hii haiwezi kurudishwa nyuma.
          </Text>
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
              backgroundColor: "rgba(0,0,0,0.78)",
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
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(201,74,74,0.20)",
                backgroundColor: "rgba(15,18,24,0.98)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 20 }}>
                  Confirm Delete
                </Text>

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
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                    opacity: deleting ? 0.5 : 1,
                  })}
                >
                  <Ionicons name="close" size={20} color={UI.text} />
                </Pressable>
              </View>

              <View style={{ padding: 16 }}>
                <Text
                  style={{
                    color: UI.text,
                    fontWeight: "900",
                    fontSize: 16,
                    lineHeight: 22,
                  }}
                >
                  Andika DELETE kuthibitisha
                </Text>

                <Text
                  style={{
                    color: UI.muted,
                    fontWeight: "800",
                    marginTop: 8,
                    lineHeight: 20,
                  }}
                >
                  Hii ndiyo hatua ya mwisho. Ukiandika DELETE, account yako
                  itazimwa na hutoweza kuingia tena.
                </Text>

                <View
                  style={{
                    marginTop: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                  }}
                >
                  <TextInput
                    value={deleteConfirmation}
                    onChangeText={(v) => setDeleteConfirmation(String(v ?? "").toUpperCase())}
                    placeholder="Andika DELETE"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry={false}
                    editable={!deleting}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{
                      flex: 1,
                      color: UI.text,
                      fontWeight: "800",
                      paddingVertical: 14,
                    }}
                  />

                  <View style={{ width: 20, marginLeft: 8 }} />
                </View>

                <Text
                  style={{
                    color: UI.danger,
                    fontWeight: "800",
                    marginTop: 10,
                    lineHeight: 19,
                    fontSize: 12,
                  }}
                >
                  Ukikosea neno DELETE, action haitafanyika.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                  <View style={{ flex: 1 }}>
                    <Pressable
                      onPress={closeDeleteModal}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        paddingVertical: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: deleting ? 0.5 : pressed ? 0.92 : 1,
                      })}
                    >
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                        Cancel
                      </Text>
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
                        borderColor: "rgba(201,74,74,0.28)",
                        backgroundColor: "rgba(201,74,74,0.16)",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: deleting ? 0.75 : pressed ? 0.92 : 1,
                      })}
                    >
                      {deleting ? (
                        <ActivityIndicator color={UI.text} />
                      ) : (
                        <Text style={{ color: UI.danger, fontWeight: "900", fontSize: 15 }}>
                          Delete Now
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}