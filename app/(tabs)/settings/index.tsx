// app/(tabs)/settings/index.tsx
import React, { useMemo } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { theme, UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
};

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(255,255,255,0.08)",
        marginVertical: 10,
      }}
    />
  );
}

function Row({ icon, title, subtitle, onPress, disabled }: RowProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* Icon tile (premium) */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: UI.emeraldSoft,
          borderWidth: 1,
          borderColor: UI.emeraldBorder,
        }}
      >
        <Ionicons name={icon} size={22} color={UI.emerald} />
      </View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 3,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Chevron */}
      <Ionicons
        name="chevron-forward"
        size={18}
        color="rgba(255,255,255,0.55)"
      />
    </Pressable>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
        color: "rgba(255,255,255,0.72)",
        fontWeight: "900",
        fontSize: 12,
        letterSpacing: 0.7,
        marginBottom: 10,
        marginTop: 14,
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

export default function MoreHome() {
  const router = useRouter();
  const org = useOrg();

  const orgSummary = useMemo(() => {
    const name = org.activeOrgName ?? "No organization";
    const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
    const store = org.activeStoreName ?? "—";
    return `${name} • ${role} • ${store}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const canManageStaff = org.activeRole === "owner" || org.activeRole === "admin";

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ paddingTop: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 26 }}>
          More
        </Text>
        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
          Quick shortcuts for organization, staff, and preferences.
        </Text>
      </View>

      {/* OPERATIONS */}
      <SectionTitle label="Operations" />
      <Card>
        <Row
          icon="people-outline"
          title="Staff Management"
          subtitle={
            canManageStaff
              ? "Add staff and assign stores"
              : "View only (Owner/Admin manages)"
          }
          disabled={!canManageStaff}
          onPress={() => router.push("/(tabs)/staff")}
        />
      </Card>

      {/* ORGANIZATION */}
      <SectionTitle label="Organization" />
      <Card>
        <Row
          icon="business-outline"
          title="Organization"
          subtitle={orgSummary}
          onPress={() => router.push("/(tabs)/settings/organization")}
        />
      </Card>

      {/* REGIONAL */}
      <SectionTitle label="Regional & Localization" />
      <Card>
        <Row
          icon="globe-outline"
          title="Regional Settings"
          subtitle="Language • Currency • Timezone • Date • Number"
          onPress={() => router.push("/(tabs)/settings/regional")}
        />
      </Card>

      {/* AI + SECURITY (grouped) */}
      <SectionTitle label="Preferences" />
      <Card>
        <Row
          icon="sparkles-outline"
          title="AI Preferences"
          subtitle="Language, tone, assistant behavior (coming next)"
          onPress={() =>
            Alert.alert(
              "Coming next",
              "AI Preferences itaingia kwenye hatua inayofuata (tunajenga Regional Settings kwanza)."
            )
          }
        />

        <Divider />

        <Row
          icon="shield-checkmark-outline"
          title="Security & Privacy"
          subtitle="Permissions, sensitive data rules (coming next)"
          onPress={() =>
            Alert.alert(
              "Coming next",
              "Security & Privacy settings tutaongeza baada ya Regional Settings kuanza kufanya kazi."
            )
          }
        />
      </Card>

      {/* Footer */}
      <View style={{ height: theme.spacing.xl }} />
      <Text
        style={{
          color: "rgba(255,255,255,0.48)",
          fontWeight: "800",
          fontSize: 12,
        }}
      >
        ZETRA • Global-grade foundation
      </Text>
    </Screen>
  );
}