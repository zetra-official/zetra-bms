import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Input } from "../../../src/ui/Input";
import { Screen } from "../../../src/ui/Screen";
import { UI } from "../../../src/ui/theme";

type Role = "admin" | "staff" | "cashier";

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

type StaffWithStoresRow = {
  membership_id?: string;
  user_id?: string;
  email?: string | null;
  role?: string | null;
  store_ids?: string[] | null;
  store_names?: string[] | null;
  [k: string]: any;
};

function mapAddStaffErrorMessage(e: any): { title: string; body: string } {
  const msg = clean(e?.message ?? e?.error_description ?? e?.details ?? e);
  const m = msg.toLowerCase();

  if (m.includes("upgrade_plan") && m.includes("staff limit")) {
    const plan =
      msg.match(/\bPlan:\s*([A-Z0-9_]+)/i)?.[1] ||
      msg.match(/\bPlan\s+([A-Z0-9_]+)\s+allows\b/i)?.[1] ||
      msg.match(/\bplan_code[:=]\s*([A-Z0-9_]+)/i)?.[1] ||
      "CURRENT";

    const lim =
      msg.match(/allows\s+(\d+)\s+staff/i)?.[1] ||
      msg.match(/\((\d+)\s+allowed\)/i)?.[1] ||
      msg.match(/limit\s*[:=]?\s*(\d+)/i)?.[1] ||
      "—";

    return {
      title: "Limit Reached",
      body:
        `Umefika limit ya users/staff.\n\n` +
        `Plan: ${plan}\nUsers/Staff per Org allowed: ${lim}\n\n` +
        `Ili kuongeza zaidi, tafadhali upgrade plan.`,
    };
  }

  if (m.includes("upgrade_plan") && (m.includes("staff is not allowed") || m.includes("free plan"))) {
    return {
      title: "Upgrade Required",
      body:
        "Plan yako haijaruhusu kuongeza mfanyakazi.\n\n" +
        "✅ FREE plan = Organization 1 + Store 1 + User 1 (Owner tu).\n\n" +
        "Ili kuongeza mfanyakazi/cashier, tafadhali upgrade kwenda LITE / STARTER / PRO.",
    };
  }

  if (m.includes("not found") && (m.includes("register") || m.includes("sign up"))) {
    return {
      title: "User Not Found",
      body:
        "Huyu email bado hajaji-register kwenye app.\n\n" +
        "Mwambie afanye Sign Up kwanza, kisha urudie kuongeza kwa email.",
    };
  }

  if (m.includes("already belongs to this organization")) {
    return {
      title: "Already Added",
      body: "User huyu tayari yupo kwenye organization hii.",
    };
  }

  return {
    title: "Add member failed",
    body: msg || "Unknown error",
  };
}

export default function AddStaffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orgId?: string }>();

  const { activeOrgId, activeOrgName, activeRole, refresh } = useOrg();
  const orgId = clean(params.orgId?.toString() || activeOrgId || "");

  const canManage = activeRole === "owner" || activeRole === "admin";

  const allowedRoles: Role[] = useMemo(() => {
    if (activeRole === "owner") return ["admin", "staff", "cashier"];
    return ["staff", "cashier"];
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
    const { data: subData, error: subErr } = await supabase.rpc("get_my_subscription", {
      p_org_id: orgId,
    });
    if (subErr) return;

    const subRow = (Array.isArray(subData) ? subData?.[0] : subData) as MySubRow | null;
    const planCode = upper(subRow?.plan_code || "FREE");

    const { data: plansData, error: plansErr } = await supabase.rpc("get_public_plans");
    if (plansErr) return;

    const plans = (plansData ?? []) as PlanRow[];
    const plan = plans.find((p) => upper(p?.code) === planCode) || null;

    const staffLimit =
      num((plan as any)?.staff_per_org) ??
      num((plan as any)?.max_staff) ??
      num((plan as any)?.maxStaff) ??
      null;

    if (staffLimit === null) return;

    const { data: staffData, error: staffErr } = await supabase.rpc("get_org_staff_with_stores", {
      p_org_id: orgId,
    });
    if (staffErr) return;

    const rows = Array.isArray(staffData) ? (staffData as StaffWithStoresRow[]) : [];

    const uniqueKeys = new Set<string>();
    for (const row of rows) {
      const membershipId = clean((row as any)?.membership_id);
      const userId = clean((row as any)?.user_id);
      const key = membershipId || userId;
      if (key) uniqueKeys.add(key);
    }

    const currentCount = uniqueKeys.size;

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
      // Limit check is enforced by DB/RPC to avoid counting removed/inactive staff incorrectly.
      const safeEmail = email.trim().toLowerCase();

      if (role === "cashier") {
        const { error } = await supabase.rpc("add_cashier_to_org_by_email_v1", {
          p_org_id: orgId,
          p_email: safeEmail,
        });
        if (error) throw error;
      } else {
        const payload = {
          p_org_id: orgId,
          p_email: safeEmail,
          p_role: role,
        };

        const { error } = await supabase.rpc("add_staff_to_org_by_email", payload);
        if (error) throw error;
      }

      Alert.alert(
        "Success ✅",
        `Member ameongezwa.\nEmail: ${safeEmail}\nRole: ${role.toUpperCase()}`
      );

      setEmail("");
      setRole(allowedRoles[0] ?? "staff");
    } catch (e: any) {
      const mapped = mapAddStaffErrorMessage(e);
      Alert.alert(mapped.title, mapped.body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} contentStyle={{ paddingBottom: 0 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 96,
          gap: 14,
        }}
      >
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

        <Card style={{ gap: 14 }}>
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
            * Muhimu: Mfanyakazi/Cashier lazima awe amesha-Register (Sign Up) kwanza.
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }}>Role</Text>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {allowedRoles.includes("admin") ? (
                <Button
                  title="ADMIN"
                  variant={role === "admin" ? "primary" : "secondary"}
                  onPress={() => setRole("admin")}
                  disabled={!canManage || saving}
                  style={{ flex: 1, minHeight: 56 }}
                />
              ) : null}

              {allowedRoles.includes("staff") ? (
                <Button
                  title="STAFF"
                  variant={role === "staff" ? "primary" : "secondary"}
                  onPress={() => setRole("staff")}
                  disabled={!canManage || saving}
                  style={{ flex: 1, minHeight: 56 }}
                />
              ) : null}
            </View>

            {allowedRoles.includes("cashier") ? (
              <Button
                title="CASHIER"
                variant={role === "cashier" ? "primary" : "secondary"}
                onPress={() => setRole("cashier")}
                disabled={!canManage || saving}
                style={{ width: "100%", minHeight: 56 }}
              />
            ) : null}
          </View>

          {role === "cashier" ? (
            <Card
              style={{
                gap: 8,
                backgroundColor: UI.emeraldSoft,
                borderColor: UI.emeraldBorder,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>
                CASHIER RULES
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                • Cashier ata-assigniwa store moja tu.
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                • Store moja itakuwa na cashier mmoja tu.
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800" }}>
                • Kazi kuu ya cashier ni kupokea malipo na kukamilisha mauzo.
              </Text>
            </Card>
          ) : null}
        </Card>

        <View style={{ gap: 12 }}>
          <Button
            title={saving ? "Saving..." : "Save Staff"}
            variant="primary"
            onPress={onSave}
            disabled={!canManage || saving}
            style={{ minHeight: 56 }}
          />

          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            disabled={saving}
            style={{ minHeight: 56 }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}