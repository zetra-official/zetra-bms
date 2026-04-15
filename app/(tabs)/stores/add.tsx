import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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

  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 1100;
  const contentMaxWidth = isDesktopWeb ? 980 : isWeb ? 760 : undefined;

  const canCreate = activeRole === "owner" || activeRole === "admin";
  const orgId = useMemo(() => clean(activeOrgId), [activeOrgId]);

  const [name, setName] = useState("");
  const [storeType, setStoreType] = useState<"STANDARD" | "CAPITAL_RECOVERY">("STANDARD");
  const [saving, setSaving] = useState(false);

  const guardPlanStoreLimit = async (): Promise<void> => {
    if (!orgId) return;

    const { data, error } = await supabase.rpc("_get_org_plan_limits_v1", {
      p_org_id: orgId,
    });

    if (error) {
      // Do not hard-lock client if RPC fails. DB create_store should still enforce.
      return;
    }

    const row = (Array.isArray(data) ? data?.[0] : data) as OrgPlanLimitsRow | null;
    const planCode = upper(row?.plan_code || "CURRENT");
    const storeLimit = num(row?.stores_per_org);

    // If no limit returned, do not block on client side.
    if (storeLimit === null) return;

    const { data: storesData, error: storesErr } = await supabase.rpc("get_my_stores");
    if (storesErr) {
      // Let DB enforce if this fails
      return;
    }

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
      // Canonical client-side guard
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
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 28,
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
        <View
          style={{
            gap: 6,
            marginBottom: 2,
          }}
        >
          <Text
            style={{
              fontSize: isWeb ? 28 : 22,
              fontWeight: "900",
              color: UI.text,
            }}
          >
            Add Store
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 2 }}>
            Org:{" "}
            <Text style={{ color: UI.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
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
            marginTop: 4,
            padding: isWeb ? 18 : undefined,
          }}
        >
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: isWeb ? 13 : 12 }}>
            Store Type
          </Text>

          <View
            style={{
              flexDirection: isDesktopWeb ? "row" : "column",
              gap: 12,
            }}
          >
            <Pressable
              onPress={() => setStoreType("STANDARD")}
              style={({ pressed }) => ({
                flex: isDesktopWeb ? 1 : undefined,
                minHeight: isWeb ? 160 : 132,
                borderWidth: 1,
                borderColor:
                  storeType === "STANDARD"
                    ? "rgba(16,185,129,0.40)"
                    : "rgba(255,255,255,0.12)",
                backgroundColor:
                  storeType === "STANDARD"
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(255,255,255,0.04)",
                borderRadius: 20,
                padding: 16,
                justifyContent: "flex-start",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <SafeIcon name="cube-outline" size={18} color={UI.text} />
                </View>

                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  Standard
                </Text>
              </View>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  marginTop: 10,
                  lineHeight: 20,
                  fontSize: 12.5,
                }}
              >
                Inafaa kwa biashara za kawaida za store, inventory, mauzo ya kila siku, stock movement,
                bidhaa nyingi, na uendeshaji wa kawaida wa retail.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setStoreType("CAPITAL_RECOVERY")}
              style={({ pressed }) => ({
                flex: isDesktopWeb ? 1 : undefined,
                minHeight: isWeb ? 160 : 132,
                borderWidth: 1,
                borderColor:
                  storeType === "CAPITAL_RECOVERY"
                    ? "rgba(16,185,129,0.40)"
                    : "rgba(255,255,255,0.12)",
                backgroundColor:
                  storeType === "CAPITAL_RECOVERY"
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(255,255,255,0.04)",
                borderRadius: 20,
                padding: 16,
                justifyContent: "flex-start",
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <SafeIcon name="cash-outline" size={18} color={UI.text} />
                </View>

                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  Capital Recovery
                </Text>
              </View>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  marginTop: 10,
                  lineHeight: 20,
                  fontSize: 12.5,
                }}
              >
                Inafaa kwa biashara ya mtaji, gharama, na faida halisi ambapo lengo kuu ni kufuatilia
                kurudi kwa mtaji, ulinzi wa fedha, na hesabu ya faida kwa umakini zaidi.
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 2 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", marginBottom: 8 }}>
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
                marginTop: 2,
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
      </KeyboardAvoidingView>
    </Screen>
  );
}