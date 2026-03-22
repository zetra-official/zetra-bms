import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text } from "react-native";
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

  const canCreate = activeRole === "owner" || activeRole === "admin";
  const orgId = useMemo(() => clean(activeOrgId), [activeOrgId]);

  const [name, setName] = useState("");
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
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: "900", color: UI.text }}>Add Store</Text>

      <Text style={{ color: UI.muted, fontWeight: "700", marginTop: 6 }}>
        Org:{" "}
        <Text style={{ color: UI.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
      </Text>

      {!canCreate ? (
        <Card style={{ borderColor: UI.dangerBorder, backgroundColor: UI.dangerSoft }}>
          <Text style={{ color: UI.danger, fontWeight: "900" }}>
            No Access (Owner/Admin only)
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: 12, marginTop: 14 }}>
        <Text style={{ color: UI.muted, fontWeight: "800" }}>Store Name</Text>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="mfano: SMART MEN"
          autoCapitalize="characters"
        />
      </Card>

      <Button
        title={saving ? "Saving..." : "Save Store"}
        variant="primary"
        onPress={onSave}
        disabled={!canCreate || saving}
      />

      <Button
        title="Cancel"
        variant="secondary"
        onPress={() => router.back()}
        disabled={saving}
      />
    </Screen>
  );
}