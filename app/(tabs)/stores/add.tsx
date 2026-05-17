import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import SafeIcon from "@/src/ui/SafeIcon";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Input } from "../../../src/ui/Input";
import { Screen } from "../../../src/ui/Screen";
import { UI } from "../../../src/ui/theme";

function clean(s: any) {
  return String(s ?? "").trim();
}

function upper(s: any) {
  return clean(s).toUpperCase();
}

function num(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

type StoreType = "STANDARD" | "CAPITAL_RECOVERY" | "FIELD_PROCUREMENT" | "PRECISION_RETAIL";

type OrgPlanLimitsRow = {
  plan_id?: string;
  plan_code?: string;
  posts_per_store_month?: number;
  ai_enabled?: boolean;
  staff_per_org?: number;
  stores_per_org?: number;
  [k: string]: any;
};

export default function AddStoreScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole, refresh } = useOrg();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 1100;
  const contentMaxWidth = isDesktopWeb ? 980 : isWeb ? 760 : undefined;

  const canCreate = activeRole === "owner" || activeRole === "admin";
  const orgId = useMemo(() => clean(activeOrgId), [activeOrgId]);

  const [name, setName] = useState("");
  const [storeType, setStoreType] = useState<StoreType>("STANDARD");
  const [saving, setSaving] = useState(false);

  const storeTypes = useMemo(
    () => [
      {
        key: "STANDARD" as StoreType,
        title: "Standard Retail",
        icon: "cube-outline",
        color: "rgba(16,185,129,0.42)",
        bg: "rgba(16,185,129,0.12)",
        desc: "For daily sales, inventory, stock movement, products, and normal retail operations.",
      },
      {
        key: "CAPITAL_RECOVERY" as StoreType,
        title: "Capital Recovery",
        icon: "cash-outline",
        color: "rgba(251,191,36,0.42)",
        bg: "rgba(251,191,36,0.10)",
        desc: "For tracking capital, costs, real profit, recovery progress, and money protection.",
      },
      {
        key: "FIELD_PROCUREMENT" as StoreType,
        title: "Field Procurement",
        icon: "trail-sign-outline",
        color: "rgba(56,189,248,0.42)",
        bg: "rgba(56,189,248,0.10)",
        desc: "For field buying, cash advances, purchases, expenses, balances, and received stock.",
      },
      {
        key: "PRECISION_RETAIL" as StoreType,
        title: "Precision Retail",
        icon: "flask-outline",
        color: "rgba(168,85,247,0.42)",
        bg: "rgba(168,85,247,0.10)",
        desc: "For pharmacy, chemicals, beauty, food portions, and decimal quantities like 0.5 or 1.25.",
      },
    ],
    []
  );

  const guardPlanStoreLimit = async (): Promise<void> => {
    if (!orgId) return;

    const { data, error } = await supabase.rpc("_get_org_plan_limits_v1", {
      p_org_id: orgId,
    });

    if (error) return;

    const row = (Array.isArray(data) ? data?.[0] : data) as OrgPlanLimitsRow | null;
    const planCode = upper(row?.plan_code || "CURRENT");
    const storeLimit = num(row?.stores_per_org);

    if (storeLimit === null) return;

    const { data: storesData, error: storesErr } = await supabase.rpc("get_my_stores");
    if (storesErr) return;

    const stores = Array.isArray(storesData) ? (storesData as any[]) : [];
    const orgStores = stores.filter((s) => clean(s?.organization_id) === orgId);
    const currentCount = orgStores.length;

    if (currentCount >= storeLimit) {
      throw new Error(
        `UPGRADE_PLAN: Store limit reached. Plan ${planCode} allows ${storeLimit} store(s) per organization.`
      );
    }
  };

  const onSave = async () => {
    if (!canCreate) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    if (!orgId) {
      Alert.alert("Missing Org", "No organization selected.");
      return;
    }

    const storeName = clean(name);
    if (!storeName) {
      Alert.alert("Missing Store Name", "Weka jina la store.");
      return;
    }

    setSaving(true);

    try {
      await guardPlanStoreLimit();

      const { error } = await supabase.rpc("create_store", {
        p_org_id: orgId,
        p_store_name: storeName,
        p_store_type: storeType,
      });

      if (error) throw error;

      Alert.alert("Success ✅", "Store imeongezwa.");
      await refresh();
      router.back();
    } catch (e: any) {
      const msg = clean(e?.message ?? e);

      if (
        msg.toLowerCase().includes("upgrade_plan") &&
        msg.toLowerCase().includes("store limit")
      ) {
        const plan = msg.match(/Plan\s+([A-Z0-9_]+)/i)?.[1] || "CURRENT";
        const lim = msg.match(/allows\s+(\d+)/i)?.[1] || "—";

        Alert.alert(
          "Upgrade Required",
          `Umefika limit ya stores.\n\nPlan: ${plan}\nStores/Org allowed: ${lim}\n\nIli kuongeza store nyingine, tafadhali upgrade plan.`
        );
        return;
      }

      Alert.alert("Add store failed", msg || "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <ScrollView
        style={{ flex: 1, width: "100%" }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: isWeb ? 20 : 16,
          paddingBottom: Math.max(insets.bottom, 10) + 190,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
            gap: 14,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: isWeb ? 28 : 28,
                fontWeight: "900",
                color: UI.text,
              }}
            >
              Add Store
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 14 }}>
              Org: <Text style={{ color: UI.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
            </Text>
          </View>

          {!canCreate ? (
            <Card style={{ borderColor: UI.dangerBorder, backgroundColor: UI.dangerSoft }}>
              <Text style={{ color: UI.danger, fontWeight: "900" }}>
                No Access (Owner/Admin only)
              </Text>
            </Card>
          ) : null}

          <Card
            style={{
              gap: 14,
              padding: isWeb ? 18 : 14,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 13 }}>
              Store Type
            </Text>

            <View
              style={{
                flexDirection: isDesktopWeb ? "row" : "column",
                flexWrap: isDesktopWeb ? "wrap" : "nowrap",
                gap: 10,
              }}
            >
              {storeTypes.map((item) => {
                const active = storeType === item.key;

                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setStoreType(item.key)}
                    style={({ pressed }) => ({
                      flexBasis: isDesktopWeb ? "48.7%" : undefined,
                      minHeight: 104,
                      borderWidth: 1,
                      borderColor: active ? item.color : "rgba(255,255,255,0.10)",
                      backgroundColor: active ? item.bg : "rgba(255,255,255,0.035)",
                      borderRadius: 22,
                      padding: 14,
                      justifyContent: "center",
                      opacity: pressed ? 0.92 : 1,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 999,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? item.bg : "rgba(255,255,255,0.06)",
                          borderWidth: 1,
                          borderColor: active ? item.color : "rgba(255,255,255,0.10)",
                        }}
                      >
                        <SafeIcon name={item.icon as any} size={18} color={UI.text} />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text
                            style={{
                              color: UI.text,
                              fontWeight: "900",
                              fontSize: 16,
                              flexShrink: 1,
                            }}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>

                          {active ? (
                            <Text
                              style={{
                                color: UI.emerald,
                                fontWeight: "900",
                                fontSize: 11,
                              }}
                            >
                              SELECTED
                            </Text>
                          ) : null}
                        </View>

                        <Text
                          style={{
                            color: UI.muted,
                            fontWeight: "800",
                            marginTop: 6,
                            lineHeight: 18,
                            fontSize: 12,
                          }}
                          numberOfLines={3}
                        >
                          {item.desc}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: 2 }}>
              <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>
                Store Name
              </Text>

              <Input
                value={name}
                onChangeText={setName}
                placeholder="mfano: SMART MEN"
                autoCapitalize="characters"
              />
            </View>
          </Card>

          <View
            style={{
              flexDirection: isDesktopWeb ? "row" : "column",
              gap: 12,
            }}
          >
            <View style={{ flex: isDesktopWeb ? 1 : undefined }}>
              <Button
                title={saving ? "Saving..." : "Save Store"}
                variant="primary"
                onPress={onSave}
                disabled={!canCreate || saving}
              />
            </View>

            <View style={{ flex: isDesktopWeb ? 1 : undefined }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => router.back()}
                disabled={saving}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}