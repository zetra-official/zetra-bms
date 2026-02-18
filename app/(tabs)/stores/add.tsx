// app/(tabs)/stores/add.tsx
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

export default function AddStoreScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName, activeRole, refresh } = useOrg();

  const canCreate = activeRole === "owner" || activeRole === "admin";
  const orgId = useMemo(() => (activeOrgId ?? "").trim(), [activeOrgId]);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!canCreate) {
      Alert.alert("No Access", "Owner/Admin only.");
      return;
    }

    if (!orgId) {
      Alert.alert("Missing Org", "No organization selected.");
      return;
    }

    const storeName = name.trim();
    if (!storeName) {
      Alert.alert("Missing Store Name", "Weka jina la store.");
      return;
    }

    setSaving(true);
    try {
      // ✅ Create store ONLY (no staff assignment here)
      const { error } = await supabase.rpc("create_store", {
        p_org_id: orgId,
        p_store_name: storeName,
      });

      if (error) throw error;

      Alert.alert("Success ✅", "Store imeongezwa.");
      await refresh(); // refresh OrgContext (stores list)
      router.back();
    } catch (e: any) {
      Alert.alert("Add store failed", e?.message ?? "Unknown error");
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

      {!canCreate && (
        <Card style={{ borderColor: UI.dangerBorder, backgroundColor: UI.dangerSoft }}>
          <Text style={{ color: UI.danger, fontWeight: "900" }}>
            No Access (Owner/Admin only)
          </Text>
        </Card>
      )}

      {/* ✅ ONE CARD ONLY: Store name */}
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