import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";

type SupplierRow = {
  id: string;
  organization_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function SuppliersScreen() {
  const router = useRouter();
  const { activeOrgId, activeOrgName } = useOrg() as any;

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SupplierRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const orgId = String(activeOrgId ?? "").trim();
      if (!orgId) throw new Error("No active organization.");

      const { data, error } = await supabase
        .from("suppliers")
        .select("id, organization_id, name, phone, email, address, created_at, updated_at")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setRows((data ?? []) as SupplierRow[]);
    } catch (e: any) {
      setRows([]);
      Alert.alert("Failed", e?.message ?? "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) =>
      `${r.name ?? ""} ${r.phone ?? ""} ${r.email ?? ""} ${r.address ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [q, rows]);

  return (
    <Screen scroll bottomPad={160}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 24 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: "900" }}>
              Suppliers
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "Organization"} • Stock source history
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            Search Supplier
          </Text>

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search supplier name, phone, email..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              color: theme.colors.text,
              fontWeight: "800",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}
          />

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Total suppliers: {filtered.length}
          </Text>
        </Card>

        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 20 }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading suppliers...
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Hakuna supplier bado. Supplier ataonekana baada ya ku-add stock na kujaza Supplier Name.
            </Text>
          </Card>
        ) : (
          filtered.map((s) => (
            <Pressable
              key={s.id}
              onPress={() =>
                router.push({
                  pathname: "/stores/supplier-detail",
                  params: {
                    supplierId: s.id,
                    supplierName: s.name,
                  },
                } as any)
              }
            >
              <Card style={{ gap: 8 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                  {s.name}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Phone: {s.phone || "—"} • Email: {s.email || "—"}
                </Text>

                <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                  Open supplier history ›
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}