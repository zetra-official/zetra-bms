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
  // simple, safe validator (enough for UI)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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

  const onSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        p_org_id: orgId,
        p_email: email.trim().toLowerCase(),
        p_role: role,
      };

      const { data, error } = await supabase.rpc("add_staff_to_org_by_email", payload);
      if (error) throw error;

      // data could be membership_id (uuid) depending on your function
      Alert.alert(
        "Success ✅",
        `Mfanyakazi ameongezwa.\nEmail: ${payload.p_email}\nRole: ${role.toUpperCase()}`
      );

      await refresh();
      router.back();
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";

      // nice hint for the common case
      if (msg.toLowerCase().includes("not found")) {
        Alert.alert(
          "User Not Found",
          "Huyu email bado hajaji-register kwenye app.\n\nMwambie afanye Sign Up kwanza, kisha urudie kuongeza kwa email."
        );
        return;
      }

      Alert.alert("Add staff failed", msg);
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