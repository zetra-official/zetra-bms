import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";

type MovementRow = {
  id: string;
  organization_id: string;
  store_id: string;
  product_id: string;
  mode: string;
  amount: number;
  note?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_invoice_no?: string | null;
  created_at?: string | null;
};

type HistoryRange = "RECENT" | "TODAY" | "WEEK" | "MONTH" | "ALL";

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

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtDate(input?: string | null) {
  if (!input) return "—";
  try {
    return new Date(input).toLocaleString();
  } catch {
    return String(input);
  }
}

function isMapLink(v: string) {
  const s = String(v ?? "").trim().toLowerCase();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("geo:") ||
    s.includes("maps.google.") ||
    s.includes("maps.app.goo.gl")
  );
}

function isSameDay(d: Date, now = new Date()) {
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(d: Date, now = new Date()) {
  const diffMs = now.getTime() - d.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function isThisMonth(d: Date, now = new Date()) {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function SupplierDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    supplierId?: string | string[];
    supplierName?: string | string[];
  }>();

  const supplierId = String(one(params.supplierId) ?? "").trim();
  const supplierNameParam = String(one(params.supplierName) ?? "").trim();

  const { activeOrgId } = useOrg() as any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [rows, setRows] = useState<MovementRow[]>([]);

  const [name, setName] = useState(supplierNameParam);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("RECENT");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const orgId = String(activeOrgId ?? "").trim();
      if (!orgId) throw new Error("No active organization.");
      if (!supplierId) throw new Error("Missing supplier.");

      const supplierRes = await supabase
        .from("suppliers")
        .select("id, organization_id, name, phone, email, address, created_at, updated_at")
        .eq("id", supplierId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (supplierRes.error) throw supplierRes.error;

      const s = supplierRes.data as SupplierRow | null;
      setSupplier(s);

      setName(String(s?.name ?? supplierNameParam ?? "").trim());
      setPhone(String(s?.phone ?? "").trim());
      setEmail(String(s?.email ?? "").trim());
      setAddress(String(s?.address ?? "").trim());
      setEditingLocation(!String(s?.address ?? "").trim());

      const historyRes = await supabase.rpc("get_supplier_stock_history_v1", {
        p_supplier_id: supplierId,
      });

      if (historyRes.error) throw historyRes.error;

      setRows((historyRes.data ?? []) as any);
    } catch (e: any) {
      setRows([]);
      Alert.alert("Failed", e?.message ?? "Failed to load supplier detail");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, supplierId, supplierNameParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAdded = useMemo(() => {
    return rows
      .filter((r: any) => String(r.mode ?? "").toUpperCase() === "ADD")
      .reduce((sum, r: any) => sum + Number(r.amount ?? 0), 0);
  }, [rows]);

  const saveSupplier = useCallback(async () => {
    if (saving) return;

    const orgId = String(activeOrgId ?? "").trim();
    const cleanName = name.trim();

    if (!orgId) {
      Alert.alert("Missing", "No active organization.");
      return;
    }

    if (!supplierId) {
      Alert.alert("Missing", "Supplier haijapatikana.");
      return;
    }

    if (!cleanName) {
      Alert.alert("Missing", "Jina la supplier lazima liandikwe.");
      return;
    }

    setSaving(true);
    Keyboard.dismiss();

    try {
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: cleanName,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", supplierId)
        .eq("organization_id", orgId);

      if (error) throw error;

      Alert.alert("Success ✅", "Supplier information updated.");
      await load();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Failed to update supplier");
    } finally {
      setSaving(false);
    }
  }, [activeOrgId, address, email, load, name, phone, saving, supplierId]);

  const editSupplierLocation = useCallback(() => {
    Alert.alert("Supplier Location", "Unataka kubadilisha location link?", [
      { text: "Cancel", style: "cancel" },
      { text: "Edit Location", onPress: () => setEditingLocation(true) },
    ]);
  }, []);

  const openSupplierLocation = useCallback(async () => {
    const link = address.trim();

    if (!link) {
      Alert.alert("No Location", "Weka Google Maps link au location kwanza.");
      return;
    }

    if (!isMapLink(link)) {
      Alert.alert("Invalid Link", "Weka Google Maps link halali ili iweze kufunguka moja kwa moja.");
      return;
    }

    try {
      const ok = await Linking.canOpenURL(link);
      if (!ok) {
        Alert.alert("Cannot Open", "Simu imeshindwa kufungua location link hii.");
        return;
      }

      await Linking.openURL(link);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Imeshindikana kufungua location.");
    }
  }, [address]);

  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a: any, b: any) => {
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    if (historyRange === "RECENT") return sorted.slice(0, 5);
    if (historyRange === "ALL") return sorted;

    return sorted.filter((r: any) => {
      const d = new Date(r.created_at ?? "");
      if (Number.isNaN(d.getTime())) return false;

      if (historyRange === "TODAY") return isSameDay(d);
      if (historyRange === "WEEK") return isThisWeek(d);
      if (historyRange === "MONTH") return isThisMonth(d);

      return true;
    });
  }, [historyRange, rows]);

  const supplierTitle = name.trim() || supplier?.name || supplierNameParam || "Supplier";

  return (
    <Screen scroll bottomPad={180}>
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
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: "900" }}>
              Supplier Detail
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {supplierTitle}
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            Supplier Information
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Supplier Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Supplier name"
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

          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Phone Number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="mf: +255..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="phone-pad"
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

          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="supplier@example.com"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="email-address"
            autoCapitalize="none"
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

          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Address / Location</Text>

          {editingLocation ? (
            <>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Paste Google Maps link au andika location..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
                style={{
                  minHeight: 90,
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

              {!!address.trim() ? (
                <Button
                  title="Done Editing Location"
                  onPress={() => {
                    Keyboard.dismiss();
                    setEditingLocation(false);
                  }}
                  disabled={saving || loading}
                  variant="secondary"
                />
              ) : null}
            </>
          ) : (
            <Pressable
              onPress={() => {
                if (isMapLink(address)) {
                  void openSupplierLocation();
                  return;
                }
                setEditingLocation(true);
              }}
              onLongPress={editSupplierLocation}
              delayLongPress={500}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: isMapLink(address)
                  ? theme.colors.emeraldBorder
                  : theme.colors.border,
                backgroundColor: isMapLink(address)
                  ? theme.colors.emeraldSoft
                  : "rgba(255,255,255,0.06)",
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 14,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {isMapLink(address) ? "Open Supplier Location" : "Add Supplier Location"}
              </Text>

              <Text
                style={{
                  color: theme.colors.muted,
                  fontWeight: "800",
                  marginTop: 6,
                  lineHeight: 18,
                }}
                numberOfLines={2}
              >
                {address.trim()
                  ? address.trim()
                  : "Bonyeza hapa kuweka Google Maps link. Ukiweka link, bonyeza kawaida kufungua ramani; hold kubadilisha."}
              </Text>
            </Pressable>
          )}
          <Button
            title={saving ? "Saving..." : "Save Supplier Info"}
            onPress={saveSupplier}
            disabled={saving || loading}
            variant="primary"
          />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
            Stock Summary
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Total stock entries: {rows.length}
          </Text>

          <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
            Total qty added: {totalAdded}
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 6 }}>
            History Filter
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              ["RECENT", "Recent 5"],
              ["TODAY", "Today"],
              ["WEEK", "7 Days"],
              ["MONTH", "Month"],
              ["ALL", "All"],
            ].map(([key, label]) => {
              const active = historyRange === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setHistoryRange(key as HistoryRange)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
                    backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.emerald : theme.colors.text,
                      fontWeight: "900",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Showing: {visibleRows.length} entries
          </Text>
        </Card>

        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 20 }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading supplier history...
            </Text>
          </View>
        ) : visibleRows.length === 0 ? (
          <Card>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
              Hakuna stock history kwenye filter hii.
            </Text>
          </Card>
        ) : (
          visibleRows.map((r: any) => (
            <Card key={r.movement_id ?? r.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                    {r.product_name ?? "Product"}
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                    SKU: {r.sku ?? "—"} • Store: {r.store_name ?? "—"}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(52,211,153,0.30)",
                    backgroundColor: "rgba(52,211,153,0.10)",
                  }}
                >
                  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
                    {String(r.mode ?? "").toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                Qty: {Number(r.amount ?? 0)}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Invoice / Ref: {r.supplier_invoice_no || "—"}
              </Text>

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                Date: {fmtDate(r.created_at)}
              </Text>

              {!!String(r.note ?? "").trim() && (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Note: {String(r.note ?? "").trim()}
                </Text>
              )}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}