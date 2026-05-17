// app/(tabs)/settings/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { theme, UI } from "@/src/ui/theme";
import { useOrg } from "@/src/context/OrgContext";
import {
  AUTH_STORAGE_KEY,
  clearCorruptSupabaseSession,
  hardSignOutSupabase,
  supabase,
} from "@/src/supabase/supabaseClient";
import { kv } from "@/src/storage/kv";

function isDesktopWebEnv(width?: number) {
  if (Platform.OS !== "web") return false;

  const ua =
    typeof navigator !== "undefined" ? String(navigator.userAgent ?? "") : "";

  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(ua);

  if (isMobileUa) return false;

  if (typeof width === "number" && width > 0) {
    return width >= 1024;
  }

  return true;
}

function webIconFallback(name: keyof typeof Ionicons.glyphMap) {
  switch (name) {
    case "document-text-outline":
      return "R";
    case "people-outline":
      return "T";
    case "person-circle-outline":
      return "C";
    case "cash-outline":
      return "$";
    case "chatbubbles-outline":
      return "M";
    case "logo-whatsapp":
      return "W";
    case "business-outline":
      return "O";
    case "card-outline":
      return "B";
    case "globe-outline":
      return "G";
    case "sparkles-outline":
      return "AI";
    case "shield-checkmark-outline":
      return "S";
    case "shield-half-outline":
      return "P";
    case "log-out-outline":
      return ">";
    case "grid-outline":
      return "Z";
    case "chevron-forward":
      return ">";
    default:
      return "•";
  }
}

function SafeIcon({
  name,
  size = 22,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color: string;
}) {
  if (Platform.OS === "web") {
    const label = webIconFallback(name);

    return (
      <View
        style={{
          minWidth: size + 10,
          height: size + 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color,
            fontSize: Math.max(11, size - 4),
            lineHeight: Math.max(12, size),
            fontWeight: "900",
            textAlign: "center",
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  return <Ionicons name={name} size={size} color={color} />;
}

function PageGlyph({
  text,
  color,
  size = 22,
}: {
  text: string;
  color: string;
  size?: number;
}) {
  return (
    <Text
      style={{
        color,
        fontSize: Math.max(11, size - 4),
        lineHeight: Math.max(12, size),
        fontWeight: "900",
        textAlign: "center",
        includeFontPadding: false,
      }}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

function getPageGlyph(name: keyof typeof Ionicons.glyphMap) {
  switch (name) {
    case "document-text-outline":
      return "R";
    case "people-outline":
      return "T";
    case "person-circle-outline":
      return "C";
    case "cash-outline":
      return "$";
    case "chatbubbles-outline":
      return "M";
    case "logo-whatsapp":
      return "W";
    case "business-outline":
      return "O";
    case "card-outline":
      return "B";
    case "globe-outline":
      return "G";
    case "sparkles-outline":
      return "AI";
    case "shield-checkmark-outline":
      return "S";
    case "shield-half-outline":
      return "P";
    case "log-out-outline":
      return ">";
    case "grid-outline":
      return "Z";
    case "chevron-forward":
      return ">";
    default:
      return "•";
  }
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  badge?: string;
  accent?: string;
  soft?: string;
};

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
       color: "#64748B",
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

function PremiumSectionCard({
  children,
  style,
  accent = "#10B981",
  glow = "rgba(16,185,129,0.10)",
}: {
  children: React.ReactNode;
  style?: any;
  accent?: string;
  glow?: string;
}) {
  return (
    <Card
      style={{
        gap: 0,
        borderRadius: 24,
       borderColor: `${accent}40`,
backgroundColor: "#FFFFFF",
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
         backgroundColor: `${accent}18`,
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
          backgroundColor: `${accent}10`,
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
         backgroundColor: "rgba(15,23,42,0.08)",
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
       backgroundColor: "rgba(15,23,42,0.08)",
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
  disabled,
  badge,
  accent = "#10B981",
  soft = "rgba(16,185,129,0.12)",
}: RowProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 16,
          paddingHorizontal: 14,
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
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
          backgroundColor: soft,
borderWidth: 1,
borderColor: `${accent}66`,
        }}
      >
        {Platform.OS === "web" ? (
          <PageGlyph text={getPageGlyph(icon)} size={22} color={accent} />
        ) : (
          <SafeIcon name={icon} size={22} color={accent} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }} numberOfLines={1}>
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
            numberOfLines={2}
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
              borderColor: "rgba(255,255,255,0.10)",
             backgroundColor: "#F8FAFC",
            }}
          >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 10,
                letterSpacing: 0.4,
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}

        {Platform.OS === "web" ? (
         <PageGlyph text=">" size={18} color="#64748B" /> 
        ) : (
          <SafeIcon name="chevron-forward" size={18} color="#64748B" />
        )}
      </View>
    </Pressable>
  );
}

function HeroContextCard({
  orgName,
  role,
  store,
}: {
  orgName: string;
  role: string;
  store: string;
}) {
  return (
    <PremiumSectionCard
      style={{
        borderColor: "rgba(16,185,129,0.22)",
        backgroundColor: "#FFFFFF",
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
            {Platform.OS === "web" ? (
              <PageGlyph text="Z" size={24} color={UI.emerald} />
            ) : (
              <SafeIcon name="grid-outline" size={24} color={UI.emerald} />
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <Text
              style={{
                color: "#64748B",
                fontWeight: "900",
                fontSize: 11,
                letterSpacing: 0.8,
              }}
            >
              BUSINESS COMMAND CENTER
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 30,
                lineHeight: 34,
                marginTop: 6,
                letterSpacing: 0.2,
              }}
              numberOfLines={2}
            >
              {orgName}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: UI.emeraldBorder,
              backgroundColor: UI.emeraldSoft,
              alignSelf: "flex-start",
              marginTop: 2,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
              {role}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Organization
            </Text>
            <Text
              style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}
              numberOfLines={1}
            >
              {orgName}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Role
            </Text>
            <Text
              style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}
              numberOfLines={1}
            >
              {role}
            </Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Active Store
            </Text>
            <Text
              style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}
              numberOfLines={1}
            >
              {store}
            </Text>
          </View>
        </View>
      </View>
    </PremiumSectionCard>
  );
}

function LogoutCard({
  onLogout,
  isWeb,
}: {
  onLogout: () => void;
  isWeb?: boolean;
}) {
  return (
    <PremiumSectionCard
      style={{
        borderColor: "rgba(201,74,74,0.18)",
      }}
    >
      <Pressable
        onPress={onLogout}
        // @ts-ignore
        onClick={onLogout}
        hitSlop={12}
        accessibilityRole="button"
        style={({ pressed }) => ({
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(201,74,74,0.10)",
            borderWidth: 1,
            borderColor: "rgba(201,74,74,0.22)",
          }}
        >
          {Platform.OS === "web" ? (
            <PageGlyph text=">" size={22} color={UI.danger} />
          ) : (
            <SafeIcon name="log-out-outline" size={22} color={UI.danger} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
            {isWeb ? "Browser Logout" : "Logout"}
          </Text>
          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Exit this account on this device
          </Text>
        </View>

        {Platform.OS === "web" ? (
          <PageGlyph text=">" size={18} color="rgba(255,255,255,0.45)" />
        ) : (
          <SafeIcon name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
        )}
      </Pressable>
    </PremiumSectionCard>
  );
}

export default function MoreHome() {
  const router = useRouter();
  const org = useOrg();
  const { width } = useWindowDimensions();

  const isDesktopWeb = isDesktopWebEnv(width);
  const isWeb = Platform.OS === "web";
  const loginRoute = isWeb ? "/login" : "/(auth)/login";

  const [isGrowthPartner, setIsGrowthPartner] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);

  const orgSummary = useMemo(() => {
    const name = org.activeOrgName ?? "No organization";
    const role = org.activeRole ? String(org.activeRole).toUpperCase() : "—";
    const store = org.activeStoreName ?? "—";
    return `${name} • ${role} • ${store}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const orgName = useMemo(() => org.activeOrgName ?? "No organization", [org.activeOrgName]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;

        if (!userId) {
          if (!mounted) return;
          setIsGrowthPartner(false);
          setPartnerStatus("");
          setPartnerCode("");
          return;
        }

        const { data, error } = await supabase
          .from("growth_partner_profiles")
          .select("status, referral_code")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;

        if (!mounted) return;

        if (data) {
          setIsGrowthPartner(true);
          setPartnerStatus(String(data.status ?? "").toUpperCase());
          setPartnerCode(String(data.referral_code ?? ""));
        } else {
          setIsGrowthPartner(false);
          setPartnerStatus("");
          setPartnerCode("");
        }
      } catch {
        if (!mounted) return;
        setIsGrowthPartner(false);
        setPartnerStatus("");
        setPartnerCode("");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const roleLabel = useMemo(
    () => (org.activeRole ? String(org.activeRole).toUpperCase() : "—"),
    [org.activeRole]
  );
  const storeLabel = useMemo(() => org.activeStoreName ?? "—", [org.activeStoreName]);

  const canManageStaff = org.activeRole === "owner" || org.activeRole === "admin";
  const canOpenStaffArea =
    org.activeRole === "owner" ||
    org.activeRole === "admin" ||
    org.activeRole === "staff";
  const canManageBilling = org.activeRole === "owner";
  const canViewStatement = org.activeRole === "owner";
  const isCashier = org.activeRole === "cashier";

 const doLogoutNow = useCallback(async () => {
    if (logoutBusy) return;

    setLogoutBusy(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = String(session?.user?.id ?? "").trim();

      if (userId) {
        await kv.setLastWorkspaceForUser(userId, {
          orgId: org.activeOrgId ?? null,
          storeId: org.activeStoreId ?? null,
        });
      }

      await hardSignOutSupabase();

      if (isWeb && typeof window !== "undefined") {
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem("sb-access-token");
          localStorage.removeItem("sb-refresh-token");
        } catch {}

        try {
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
        } catch {}

        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;

            const lower = String(k).toLowerCase();

            if (
              lower.startsWith("sb-") ||
              lower.includes("supabase") ||
              lower === AUTH_STORAGE_KEY.toLowerCase()
            ) {
              keysToRemove.push(k);
            }
          }

          for (const k of keysToRemove) {
            localStorage.removeItem(k);
          }
        } catch {}

        window.location.replace("/login");
        return;
      }

      router.replace(loginRoute as any);
    } catch (e: any) {
      Alert.alert("Logout failed", e?.message ?? "Unknown error");
      setLogoutBusy(false);
    }
   }, [isWeb, loginRoute, logoutBusy, org.activeOrgId, org.activeStoreId, router]);

  const onLogout = useCallback(() => {
    if (logoutBusy) return;

    if (isWeb) {
      void doLogoutNow();
      return;
    }

    Alert.alert("Logout", "Unataka kutoka kwenye account hii kwenye device hii?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          void doLogoutNow();
        },
      },
    ]);
  }, [doLogoutNow, isWeb, logoutBusy]);

  const openZetraSupportWhatsApp = useCallback(async () => {
    const message = encodeURIComponent(
      `Hello ZETRA Support, I need help with my ZETRA BMS account.\n\nOrganization: ${org.activeOrgName ?? "—"}\nRole: ${
        org.activeRole ? String(org.activeRole).toUpperCase() : "—"
      }\nStore: ${org.activeStoreName ?? "—"}`
    );

    const url = `https://wa.me/255758014675?text=${message}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Contact Support",
        "Imeshindikana kufungua WhatsApp. Tafadhali wasiliana na ZETRA Support kupitia +255758014675."
      );
    }
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  return (
    <Screen scroll bottomPad={120}>
      <View style={{ paddingTop: 6 }}>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 30 }}>
          More
        </Text>

        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            marginTop: 8,
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          Executive shortcuts for organization, reports, staff, billing, and preferences.
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        <HeroContextCard orgName={orgName} role={roleLabel} store={storeLabel} />
      </View>

      <SectionTitle label="Operations" />
      <PremiumSectionCard accent="#2563EB" glow="rgba(37,99,235,0.13)">
        <Row
          icon="document-text-outline"
          title="Business Statement"
          subtitle={
            canViewStatement
              ? "Generate date-range statement: sales, expenses, profit, balances"
              : "Owner only"
          }
          badge={canViewStatement ? "REPORTS" : "LOCKED"}
          disabled={!canViewStatement}
          onPress={() => router.push("/(tabs)/settings/business-statement")}
accent="#2563EB"
soft="rgba(37,99,235,0.13)"
        />

        <Divider />

        <Row
          icon="person-circle-outline"
          title="Customers"
          subtitle="View customer profiles, purchase history, call, SMS, and WhatsApp"
          badge="CRM"
          onPress={() => router.push("/customers")}
accent="#7C3AED"
soft="rgba(124,58,237,0.13)"
        />

        <Divider />

        <Row
          icon="people-outline"
          title="Staff Management"
          subtitle={
            canManageStaff
              ? "Add staff, assign stores, manage team access, and view staff sales"
              : org.activeRole === "staff"
                ? "Open your staff area and view My Sales"
                : "Owner/Admin manages staff access"
          }
          badge={
            canManageStaff
              ? "TEAM"
              : org.activeRole === "staff"
                ? "MY SALES"
                : "LOCKED"
          }
          disabled={!canOpenStaffArea}
          onPress={() => router.push("/(tabs)/staff")}
accent="#F59E0B"
soft="rgba(245,158,11,0.14)"
        />

        <Divider />

        <Row
          icon="cash-outline"
          title="Cashier Closing"
          subtitle={isCashier ? "Close your shift and review cashier totals" : "Cashier only"}
          badge={isCashier ? "CASHIER" : "LOCKED"}
          disabled={!isCashier}
          onPress={() => router.push("/(tabs)/settings/cashier-closing")}
accent="#EF4444"
soft="rgba(239,68,68,0.12)"
        />
      </PremiumSectionCard>

      <SectionTitle label="Communication" />
      <PremiumSectionCard accent="#06B6D4" glow="rgba(6,182,212,0.13)">
        <Row
          icon="chatbubbles-outline"
          title="Meeting Room"
          subtitle="Create rooms, invite members, and collaborate in real time"
          badge="LIVE"
          onPress={() => router.push("/(tabs)/settings/meeting-room")}
accent="#06B6D4"
soft="rgba(6,182,212,0.13)"
        />

        <Divider />

        <Row
          icon="logo-whatsapp"
          title="Contact Support"
          subtitle="Need help? Chat with ZETRA support on WhatsApp"
          badge="HELP"
          onPress={openZetraSupportWhatsApp}
accent="#22C55E"
soft="rgba(34,197,94,0.13)"
        />
      </PremiumSectionCard>

      <SectionTitle label="Organization" />
      <PremiumSectionCard accent="#8B5CF6" glow="rgba(139,92,246,0.13)">
        <Row
          icon="business-outline"
          title="Organization"
          subtitle={orgSummary}
          badge="WORKSPACE"
          onPress={() => router.push("/(tabs)/settings/organization")}
accent="#8B5CF6"
soft="rgba(139,92,246,0.13)"
        />

        <Divider />

        <Row
          icon="card-outline"
          title="Subscription & Billing"
          subtitle={
            canManageBilling
              ? "Manage plan, duration, activation, and subscription control"
              : "Owner only"
          }
          badge={canManageBilling ? "OWNER" : "LOCKED"}
          disabled={!canManageBilling}
          onPress={() => router.push("/(tabs)/settings/subscription")}
accent="#F97316"
soft="rgba(249,115,22,0.13)"
        />
      </PremiumSectionCard>

      <SectionTitle label="Regional & Localization" />
      <PremiumSectionCard accent="#0EA5E9" glow="rgba(14,165,233,0.13)">
        <Row
          icon="globe-outline"
          title="Regional Settings"
          subtitle="Language • Currency • Timezone • Date • Number"
          badge="GLOBAL"
          onPress={() => router.push("/(tabs)/settings/regional")}
accent="#0EA5E9"
soft="rgba(14,165,233,0.13)"
        />
      </PremiumSectionCard>

      {isGrowthPartner ? (
        <>
          <SectionTitle label="Growth Partner" />
          <PremiumSectionCard>
            <Row
              icon="people-outline"
              title="Partner Dashboard"
              subtitle={
                partnerCode
                  ? `Code: ${partnerCode} • Status: ${partnerStatus || "ACTIVE"}`
                  : `Status: ${partnerStatus || "ACTIVE"}`
              }
              badge={partnerStatus || "PARTNER"}
              onPress={() => router.push("/partner")}
            />
          </PremiumSectionCard>
        </>
      ) : null}

      <SectionTitle label="Preferences" />
      <PremiumSectionCard accent="#A855F7" glow="rgba(168,85,247,0.13)">
        <Row
          icon="sparkles-outline"
          title="AI Preferences"
          subtitle="Language, tone, assistant behavior (coming next)"
          badge="NEXT"
          onPress={() =>
            Alert.alert("Coming next", "AI Preferences itaingia kwenye hatua inayofuata.")
          }
        />

        <Divider />

        <Row
          icon="shield-checkmark-outline"
          title="Security & Privacy"
          subtitle="Permissions, sensitive data rules (coming next)"
          badge="NEXT"
          onPress={() =>
            Alert.alert(
              "Coming next",
              "Security & Privacy settings tutaongeza baada ya Reports flow kuwa stable."
            )
          }
        />
      </PremiumSectionCard>

      <SectionTitle label="Account & Privacy" />
      <PremiumSectionCard accent="#10B981" glow="rgba(16,185,129,0.13)">
        <Row
          icon="shield-half-outline"
          title="Account & Privacy"
          subtitle="Manage account safety, privacy controls, and Danger Zone"
          badge="SECURE"
          onPress={() => router.push("/(tabs)/settings/account-privacy")}
        />
      </PremiumSectionCard>

      <SectionTitle label="Account" />
      <LogoutCard onLogout={onLogout} isWeb={isDesktopWeb} />

      {logoutBusy ? (
        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            fontSize: 12,
            marginTop: 10,
          }}
        >
          Logging out...
        </Text>
      ) : null}

      <View style={{ height: theme.spacing.gap }} />

      <Text
        style={{
          color: "#94A3B8",
          fontWeight: "800",
          fontSize: 12,
        }}
      >
        ZETRA • Global-grade foundation
      </Text>
    </Screen>
  );
}