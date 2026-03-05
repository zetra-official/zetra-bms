// app/(tabs)/staff/add.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Input } from "../../../src/ui/Input";
import { Screen } from "../../../src/ui/Screen";
import { UI } from "../../../src/ui/theme";

type Role = "admin" | "staff";

function isValidEmail(v: string) {
  const s = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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

type MySubRow = {
  plan_code?: string;
  status?: string;
  [k: string]: any;
};

type PlanRow = {
  code?: string;
  staff_per_org?: number;
  max_staff?: number;
  maxStaff?: number;
  [k: string]: any;
};

/**
 * ✅ Plan Guard message mapper
 * DB should raise something like:
 * - "UPGRADE_PLAN: Staff limit reached. Plan LITE allows 3 staff(s) per organization."
 * - "UPGRADE_PLAN: Staff is not allowed on FREE plan"
 */
function mapAddStaffErrorMessage(e: any): { title: string; body: string } {
  const msg = clean(e?.message ?? e?.error_description ?? e?.details ?? e);
  const m = msg.toLowerCase();

  if (m.includes("upgrade_plan") && m.includes("staff limit")) {
    const plan = msg.match(/Plan\s+([A-Z0-9_]+)/i)?.[1] || "CURRENT";
    const lim = msg.match(/allows\s+(\d+)/i)?.[1] || "—";
    return {
      title: "Limit Reached",
      body:
        `Umefika limit ya staff.\n\n` +
        `Plan: ${plan}\nStaff/Org allowed: ${lim}\n\n` +
        `Ili kuongeza staff zaidi, tafadhali upgrade plan.`,
    };
  }

  if (m.includes("upgrade_plan") && (m.includes("staff is not allowed") || m.includes("free plan"))) {
    return {
      title: "Upgrade Required",
      body:
        "Plan yako haijaruhusu kuongeza mfanyakazi (staff).\n\n" +
        "✅ FREE plan = Organization 1 + Store 1 + User 1 (Owner tu).\n\n" +
        "Ili kuongeza mfanyakazi, tafadhali upgrade kwenda LITE / STARTER / PRO.",
    };
  }

  // common: user not found (email not registered)
  if (m.includes("not found") && (m.includes("register") || m.includes("sign up"))) {
    return {
      title: "User Not Found",
      body:
        "Huyu email bado hajaji-register kwenye app.\n\n" +
        "Mwambie afanye Sign Up kwanza, kisha urudie kuongeza kwa email.",
    };
  }

  return {
    title: "Add staff failed",
    body: msg || "Unknown error",
  };
}

export default function AddStaffScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orgId?: string }>();

  const { activeOrgId, activeOrgName, activeRole, refresh } = useOrg();
  const orgId = (params.orgId?.toString() || activeOrgId || "").trim();

  const canManage = activeRole === "owner" || activeRole === "admin";

  const allowedRoles: Role[] = useMemo(() => {
    // owner can add admin or staff; admin can only add staff
    if (activeRole === "owner") return ["admin", "staff"];
    return ["staff"];
  }, [activeRole]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(allowedRoles[0] ?? "staff");
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (!canManage) {
      Alert.alert("No Access", "Owner/Admin only.");
      return false;
    }
    if (!orgId) {
      Alert.alert("Missing Org", "No organization selected.");
      return false;
    }
    if (!email.trim()) {
      Alert.alert("Missing Email", "Weka email ya mfanyakazi.");
      return false;
    }
    if (!isValidEmail(email)) {
      Alert.alert("Invalid Email", "Email sio sahihi. Tafadhali angalia.");
      return false;
    }
    return true;
  };

  const guardPlanStaffLimit = async (): Promise<void> => {
    // 1) subscription
    const { data: subData, error: subErr } = await supabase.rpc("get_my_subscription", {
      p_org_id: orgId,
    });
    if (subErr) return;

    const subRow = (Array.isArray(subData) ? subData?.[0] : subData) as MySubRow | null;
    const planCode = upper(subRow?.plan_code || "FREE");

    // 2) plan limits
    const { data: plansData, error: plansErr } = await supabase.rpc("get_public_plans");
    if (plansErr) return;

    const plans = (plansData ?? []) as PlanRow[];
    const plan = plans.find((p) => upper(p?.code) === planCode) || null;

    const staffLimit =
      num((plan as any)?.staff_per_org) ??
      num((plan as any)?.max_staff) ??
      num((plan as any)?.maxStaff) ??
      null;

    // If plan doesn't define limit, do not block.
    if (staffLimit === null) return;

    // 3) count staff (membership rows) via RPC
    const { data: staffData, error: staffErr } = await supabase.rpc("get_org_staff_with_stores", {
      p_org_id: orgId,
    });
    if (staffErr) return;

    const rows = Array.isArray(staffData) ? (staffData as any[]) : [];
    const currentCount = rows.length;

    if (currentCount >= staffLimit) {
      throw new Error(
        `UPGRADE_PLAN: Staff limit reached. Plan ${planCode} allows ${staffLimit} staff(s) per organization.`
      );
    }
  };

  const onSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      // ✅ Client-side guard (DB should ALSO enforce)
      await guardPlanStaffLimit();

      const payload = {
        p_org_id: orgId,
        p_email: email.trim().toLowerCase(),
        p_role: role,
      };

      const { error } = await supabase.rpc("add_staff_to_org_by_email", payload);
      if (error) throw error;

      Alert.alert(
        "Success ✅",
        `Mfanyakazi ameongezwa.\nEmail: ${payload.p_email}\nRole: ${role.toUpperCase()}`
      );

      await refresh();
      router.back();
    } catch (e: any) {
      const mapped = mapAddStaffErrorMessage(e);
      Alert.alert(mapped.title, mapped.body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      {/* TITLE */}
      <Text style={{ fontSize: 22, fontWeight: "900", color: UI.text }}>
        Ongeza Mfanyakazi
      </Text>

      <Text style={{ color: UI.muted, fontWeight: "700" }}>
        Org:{" "}
        <Text style={{ color: UI.text, fontWeight: "900" }}>
          {activeOrgName ?? "—"}
        </Text>
      </Text>

      {!canManage && (
        <Card
          style={{
            borderColor: UI.dangerBorder,
            backgroundColor: UI.dangerSoft,
          }}
        >
          <Text style={{ color: UI.danger, fontWeight: "900" }}>
            No Access (Owner/Admin only)
          </Text>
        </Card>
      )}

      <Card style={{ gap: 12 }}>
        <Text style={{ color: UI.muted, fontWeight: "800" }}>Email ya Mfanyakazi</Text>

        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="mfano: staff@jofuquality.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Text style={{ color: UI.muted, fontWeight: "700" }}>
          * Muhimu: Mfanyakazi lazima awe amesha-Register (Sign Up) kwanza.
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>Role</Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {allowedRoles.map((r) => {
            const active = role === r;
            return (
              <Button
                key={r}
                title={r.toUpperCase()}
                variant={active ? "primary" : "secondary"}
                onPress={() => setRole(r)}
                disabled={!canManage || saving}
                style={{ flex: 1 }}
              />
            );
          })}
        </View>
      </Card>

      <Button
        title={saving ? "Saving..." : "Save Staff"}
        variant="primary"
        onPress={onSave}
        disabled={!canManage || saving}
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