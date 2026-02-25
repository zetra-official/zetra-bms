// app/(tabs)/stores/movement.tsx
import { useNetInfo } from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

type InventoryRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  qty: number;
};

type SelectedItem = {
  product_id: string;
  qty: string; // typed by user
};

type ReceiptItem = {
  product_id: string;
  product_name: string;
  sku: string | null;
  qty: number;
};

type Receipt = {
  createdAt: string; // ISO
  organizationName: string;
  fromStoreName: string;
  toStoreName: string;

  actorEmail: string | null; // prefer showing this
  actorName: string; // display name / fallback
  actorRole: string;

  items: ReceiptItem[];
  totalItems: number;
  totalQty: number;
  movementIds: string[];
  reportReceiptId?: string | null;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function parsePositiveInt(s: string) {
  const n = Number(String(s ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

function fmtEAT(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function StoreMovementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromStoreId?: string;
    fromStoreName?: string;
  }>();

  const netInfo = useNetInfo();

  const {
    activeOrgId,
    activeOrgName,
    activeRole,
    activeStoreId,
    activeStoreName,
    stores,
  } = useOrg();

  // Stable online/offline
  const rawIsOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const [stableIsOnline, setStableIsOnline] = useState<boolean>(rawIsOnline);
  const netDebounceRef = useRef<any>(null);

  useEffect(() => {
    if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    netDebounceRef.current = setTimeout(() => {
      setStableIsOnline(rawIsOnline);
    }, 700);
    return () => {
      if (netDebounceRef.current) clearTimeout(netDebounceRef.current);
    };
  }, [rawIsOnline]);

  const isOffline = !stableIsOnline;

  const fromStoreId = useMemo(() => {
    return norm(params.fromStoreId) || norm(activeStoreId) || "";
  }, [params.fromStoreId, activeStoreId]);

  const fromStoreName = useMemo(() => {
    return norm(params.fromStoreName) || norm(activeStoreName) || "—";
  }, [params.fromStoreName, activeStoreName]);

  const withinOrgStores = useMemo(() => {
    const all = (stores ?? []) as any[];
    if (!activeOrgId) return all;
    return all.filter((s) => String(s.organization_id) === String(activeOrgId));
  }, [stores, activeOrgId]);

  const storeOrgMismatch = useMemo(() => {
    if (!fromStoreId || !activeOrgId) return false;
    const s = withinOrgStores.find((x: any) => String(x.store_id) === String(fromStoreId));
    if (!s) return false;
    return String(s.organization_id) !== String(activeOrgId);
  }, [fromStoreId, activeOrgId, withinOrgStores]);

  const isOwnerAdmin = useMemo(
    () => (["owner", "admin"] as const).includes((activeRole ?? "staff") as any),
    [activeRole]
  );

  // Staff movement flag
  const [staffMovementAllowed, setStaffMovementAllowed] = useState<boolean>(false);
  const [flagLoading, setFlagLoading] = useState(false);

  const loadMovementFlagForFromStore = useCallback(async () => {
    if (!fromStoreId) {
      setStaffMovementAllowed(false);
      return;
    }

    setFlagLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("stores")
        .select("id, staff_can_manage_movement")
        .eq("id", fromStoreId)
        .maybeSingle();

      if (e) throw e;

      const allowed = !!(data as any)?.staff_can_manage_movement;
      setStaffMovementAllowed(allowed);
    } catch {
      try {
        const { data: d2, error: e2 } = await supabase
          .from("stores")
          .select("id, allow_staff_movement")
          .eq("id", fromStoreId)
          .maybeSingle();

        if (e2) throw e2;

        const allowed2 = !!(d2 as any)?.allow_staff_movement;
        setStaffMovementAllowed(allowed2);
      } catch {
        setStaffMovementAllowed(false);
      }
    } finally {
      setFlagLoading(false);
    }
  }, [fromStoreId]);

  useEffect(() => {
    void loadMovementFlagForFromStore();
  }, [loadMovementFlagForFromStore]);

  const canMove = useMemo(() => {
    if (isOwnerAdmin) return true;
    return !!staffMovementAllowed;
  }, [isOwnerAdmin, staffMovementAllowed]);

  // TO store selection
  const [toStoreId, setToStoreId] = useState<string>("");

  const toStoreName = useMemo(() => {
    if (!toStoreId) return "—";
    const s = withinOrgStores.find((x: any) => String(x.store_id) === String(toStoreId));
    return s?.store_name ?? "—";
  }, [toStoreId, withinOrgStores]);

  // Inventory
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Inline qty selection map
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedItem>>({});

  const selectedList = useMemo(() => {
    const items = Object.values(selectedMap)
      .map((it) => {
        const r = rows.find((x) => String(x.product_id) === String(it.product_id));
        return {
          product_id: String(it.product_id),
          qty: String(it.qty ?? ""),
          product_name: r?.product_name ?? "Product",
          sku: r?.sku ?? null,
          available: Number(r?.qty ?? 0),
        };
      })
      .filter((x) => parsePositiveInt(x.qty) > 0)
      .sort((a, b) => String(a.product_name).localeCompare(String(b.product_name)));
    return items;
  }, [selectedMap, rows]);

  const selectedCount = selectedList.length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = `${r.product_name ?? ""} ${r.sku ?? ""} ${r.unit ?? ""} ${r.category ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const loadInventory = useCallback(async () => {
    setError(null);

    if (!fromStoreId) {
      setError("No FROM store selected (Active Store).");
      return;
    }

    if (storeOrgMismatch) {
      setError("FROM store haifanani na Organization. Tafadhali chagua store tena.");
      return;
    }

    if (isOffline) {
      setError("Offline: huwezi kufetch inventory. Washa mtandao kisha jaribu tena.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: e } = await supabase.rpc("get_store_inventory", {
        p_store_id: fromStoreId,
      });
      if (e) throw e;

      const next = (data ?? []) as InventoryRow[];
      setRows(next);

      // keep qtys only for existing products
      setSelectedMap((prev) => {
        const keep: Record<string, SelectedItem> = {};
        for (const [pid, it] of Object.entries(prev)) {
          const ok = next.some((x) => String(x.product_id) === String(pid));
          if (ok) keep[pid] = it;
        }
        return keep;
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [fromStoreId, storeOrgMismatch, isOffline]);

  useEffect(() => {
    if (!fromStoreId) return;
    if (isOffline) return;
    void loadInventory();
  }, [fromStoreId, isOffline, loadInventory]);

  const pickToStore = useCallback(
    (id: string) => {
      if (!id) return;
      if (String(id) === String(fromStoreId)) {
        Alert.alert("Not allowed", "TO store haiwezi kuwa sawa na FROM store.");
        return;
      }
      setToStoreId(id);
    },
    [fromStoreId]
  );

  const clearAllSelected = useCallback(() => {
    setSelectedMap({});
  }, []);

  // Inline qty handler
  const setInlineQty = useCallback((productId: string, qty: string) => {
    const pid = String(productId);
    const raw = String(qty ?? "");
    const n = parsePositiveInt(raw);

    setSelectedMap((prev) => {
      const next = { ...prev };

      if (!raw.trim() || n <= 0) {
        delete next[pid];
        return next;
      }

      next[pid] = { product_id: pid, qty: raw };
      return next;
    });
  }, []);

  // Actor display + email
  const [actorName, setActorName] = useState<string>("—");
  const [actorEmail, setActorEmail] = useState<string | null>(null);

  const loadActorIdentity = useCallback(async () => {
    try {
      const { data: userRes, error: ue } = await supabase.auth.getUser();
      if (ue) throw ue;

      const user = userRes?.user;
      const uid = user?.id;

      const email = norm(user?.email);
      setActorEmail(email || null);

      if (!uid) {
        setActorName("—");
        return;
      }

      // 1) profiles.display_name
      try {
        const { data, error: e } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", uid)
          .maybeSingle();

        if (!e) {
          const dn = norm((data as any)?.display_name);
          if (dn) {
            setActorName(dn);
            return;
          }
        }
      } catch {
        // ignore
      }

      // 2) user_metadata full_name
      const metaName = norm((user as any)?.user_metadata?.full_name);
      if (metaName) {
        setActorName(metaName);
        return;
      }

      // 3) fallback to email prefix
      if (email && email.includes("@")) {
        setActorName(email.split("@")[0]);
        return;
      }

      setActorName("—");
    } catch {
      setActorName("—");
      setActorEmail(null);
    }
  }, []);

  useEffect(() => {
    void loadActorIdentity();
  }, [loadActorIdentity]);

  // Receipt modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [showAllMovementIds, setShowAllMovementIds] = useState(false);

  const buildReceiptText = useCallback((r: Receipt) => {
    const lines: string[] = [];

    lines.push("ZETRA BMS • Stock Transfer Receipt");
    lines.push("----------------------------------");
    lines.push(`Date/Time (EAT): ${fmtEAT(r.createdAt)}`);
    lines.push(`Organization: ${r.organizationName}`);
    lines.push(`From: ${r.fromStoreName}`);
    lines.push(`To: ${r.toStoreName}`);

    const processedBy = r.actorEmail ? r.actorEmail : r.actorName;
    lines.push(`Processed by: ${processedBy} (${r.actorRole})`);
    lines.push("");

    if (r.reportReceiptId) {
      lines.push(`Receipt ID: ${r.reportReceiptId}`);
      lines.push("");
    }

    lines.push(`Items: ${r.totalItems} | Total Qty: ${r.totalQty}`);
    lines.push("");
    lines.push("Items:");
    for (const it of r.items) {
      const sku = it.sku ? ` • SKU ${it.sku}` : "";
      lines.push(`- ${it.product_name}${sku} • Qty ${it.qty}`);
    }

    lines.push("");
    lines.push("Movement IDs:");
    for (const id of r.movementIds) {
      lines.push(id);
    }

    return lines.join("\n");
  }, []);

  const onShareReceipt = useCallback(async () => {
    if (!lastReceipt) return;
    const text = buildReceiptText(lastReceipt);
    try {
      await Share.share({ message: text });
    } catch {
      // ignore
    }
  }, [lastReceipt, buildReceiptText]);

  const onCopyReceipt = useCallback(async () => {
    if (!lastReceipt) return;
    const text = buildReceiptText(lastReceipt);
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied ✅", "Receipt ime-copy (unaweza ku-paste WhatsApp/Email).");
    } catch {
      Alert.alert("Failed", "Imeshindikana ku-copy receipt.");
    }
  }, [lastReceipt, buildReceiptText]);

  const submit = useCallback(async () => {
    Keyboard.dismiss();

    if (isOffline) {
      Alert.alert("Offline", "Huwezi kufanya movement bila mtandao.");
      return;
    }

    if (!activeOrgId) {
      Alert.alert("Missing", "No active Organization.");
      return;
    }

    if (!fromStoreId) {
      Alert.alert("Missing", "Chagua FROM store (Active Store) kwanza.");
      return;
    }

    if (storeOrgMismatch) {
      Alert.alert("Mismatch", "FROM store haifanani na Organization. Tafadhali chagua store tena.");
      return;
    }

    if (!toStoreId) {
      Alert.alert("Missing", "Chagua TO store.");
      return;
    }

    if (String(toStoreId) === String(fromStoreId)) {
      Alert.alert("Invalid", "TO store haiwezi kuwa sawa na FROM store.");
      return;
    }

    if (!canMove) {
      Alert.alert(
        "No Access",
        "Huruhusiwi kufanya Stock Movement. Muombe Owner/Admin kuwasha ruhusa kwa store hii."
      );
      return;
    }

    if (selectedCount === 0) {
      Alert.alert("Missing", "Weka qty angalau item 1 (kwenye list).");
      return;
    }

    // Validate qty + availability
    const toMove: Array<{
      product_id: string;
      product_name: string;
      sku: string | null;
      qty: number;
      available: number;
    }> = [];

    for (const it of selectedList) {
      const qtyNum = parsePositiveInt(it.qty);
      const available = Number(it.available ?? 0);

      if (!qtyNum) {
        Alert.alert("Invalid qty", `Weka quantity sahihi kwa: ${it.product_name} (>= 1).`);
        return;
      }
      if (qtyNum > available) {
        Alert.alert(
          "Not enough stock",
          `${it.product_name}: Stock haitoshi. Available: ${available} | Unajaribu: ${qtyNum}`
        );
        return;
      }

      toMove.push({
        product_id: String(it.product_id),
        product_name: String(it.product_name),
        sku: it.sku ?? null,
        qty: qtyNum,
        available,
      });
    }

    setLoading(true);
    try {
      // ✅ SINGLE CALL (Batch)
      const payloadItems = toMove.map((x) => ({
        product_id: x.product_id,
        qty: x.qty,
        product_name: x.product_name,
        sku: x.sku,
      }));

      const { data: batchData, error: be } = await supabase.rpc("transfer_stock_batch_v1", {
        p_from_store_id: fromStoreId,
        p_to_store_id: toStoreId,
        p_items: payloadItems,
        p_note: null,
      });

      if (be) throw be;

      // Supabase may return array with one row
      const row = Array.isArray(batchData) ? (batchData[0] ?? null) : batchData;

      const movementIds: string[] = Array.isArray(row?.movement_ids)
        ? (row.movement_ids as any[]).map((x) => norm(x)).filter(Boolean)
        : [];

      if (movementIds.length === 0) {
        // still allow receipt from local items, but show warning
        // (should not happen if DB ok)
      }

      // Build receipt model (client)
      const createdAt = new Date().toISOString();
      const actorRole = String(activeRole ?? "—");
      const orgName = String(activeOrgName ?? "—");

      const totalQty = toMove.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
      const items: ReceiptItem[] = toMove.map((x) => ({
        product_id: x.product_id,
        product_name: x.product_name,
        sku: x.sku ?? null,
        qty: x.qty,
      }));

      // Save report to DB (optional): create_transfer_receipt_v1
      let reportReceiptId: string | null = null;
      try {
        const { data: rid, error: re } = await supabase.rpc("create_transfer_receipt_v1", {
          p_org_id: activeOrgId,
          p_from_store_id: fromStoreId,
          p_to_store_id: toStoreId,
          p_items: items.map((x) => ({
            product_id: x.product_id,
            product_name: x.product_name,
            sku: x.sku,
            qty: x.qty,
          })),
          p_movement_ids: movementIds,
          p_note: null,
        });

        if (!re) {
          reportReceiptId = norm(rid) || null;
        }
      } catch {
        reportReceiptId = null;
      }

      const receipt: Receipt = {
        createdAt,
        organizationName: orgName,
        fromStoreName: fromStoreName || "—",
        toStoreName: toStoreName || "—",
        actorEmail: actorEmail || null,
        actorName: actorName || "—",
        actorRole,
        items,
        totalItems: items.length,
        totalQty,
        movementIds,
        reportReceiptId,
      };

      setLastReceipt(receipt);
      setShowAllMovementIds(false);
      setReceiptModalOpen(true);

      // refresh UI
      clearAllSelected();
      await loadInventory();
    } catch (err: any) {
      Alert.alert("Failed", err?.message ?? "Movement failed.");
    } finally {
      setLoading(false);
    }
  }, [
    isOffline,
    activeOrgId,
    activeOrgName,
    activeRole,
    actorName,
    actorEmail,
    fromStoreId,
    fromStoreName,
    toStoreId,
    toStoreName,
    canMove,
    storeOrgMismatch,
    selectedCount,
    selectedList,
    clearAllSelected,
    loadInventory,
  ]);

  const toStores = useMemo(() => {
    return withinOrgStores.filter((s: any) => String(s.store_id) !== String(fromStoreId));
  }, [withinOrgStores, fromStoreId]);

  const processedByLabel = useMemo(() => {
    const em = norm(actorEmail);
    if (em) return em;
    const dn = norm(actorName);
    return dn || "—";
  }, [actorEmail, actorName]);

  return (
    <Screen scroll>
      {/* Receipt Modal */}
      <Modal
        visible={receiptModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setReceiptModalOpen(false)}
      >
        <Pressable
          onPress={() => setReceiptModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.88)",
            padding: 18,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => {}}
            onPressIn={() => {}}
            style={{
              width: "100%",
              maxWidth: 520,
              alignSelf: "stretch",
              borderRadius: theme.radius.xl,
              backgroundColor: "rgba(15,18,24,0.98)",
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.45)",
              padding: 14,
              maxHeight: "85%",
              minHeight: 240,
              elevation: 30,
              zIndex: 999,
            }}
          >
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 14 }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                Movement Success ✅
              </Text>

              {lastReceipt ? (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
                    Date/Time (EAT):{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {fmtEAT(lastReceipt.createdAt)}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    FROM:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {lastReceipt.fromStoreName}
                    </Text>
                    {"  "}→{"  "}
                    TO:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {lastReceipt.toStoreName}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Processed by:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {lastReceipt.actorEmail ? lastReceipt.actorEmail : lastReceipt.actorName}
                    </Text>{" "}
                    <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                      ({lastReceipt.actorRole})
                    </Text>
                  </Text>

                  {lastReceipt.reportReceiptId ? (
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                      Receipt ID:{" "}
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                        {lastReceipt.reportReceiptId}
                      </Text>
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 8 }}>
                      (Report save haikupatikana — movement bado imefanikiwa)
                    </Text>
                  )}

                  <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                    Items ({lastReceipt.totalItems}) • Total Qty {lastReceipt.totalQty}
                  </Text>

                  <View style={{ marginTop: 8, gap: 6 }}>
                    {lastReceipt.items.map((it) => (
                      <Text key={it.product_id} style={{ color: theme.colors.text, fontWeight: "900" }}>
                        • {it.product_name} — {it.qty}
                      </Text>
                    ))}
                  </View>

                  <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                    Movement IDs
                  </Text>

                  <View style={{ marginTop: 8, gap: 6 }}>
                    {(showAllMovementIds ? lastReceipt.movementIds : lastReceipt.movementIds.slice(0, 3)).map(
                      (id, idx) => (
                        <Text key={`${id}-${idx}`} style={{ color: theme.colors.text, fontWeight: "800" }}>
                          {id}
                        </Text>
                      )
                    )}

                    {lastReceipt.movementIds.length > 3 ? (
                      <Pressable
                        onPress={() => setShowAllMovementIds((v) => !v)}
                        style={{
                          marginTop: 6,
                          alignSelf: "flex-start",
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          borderRadius: theme.radius.lg,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface2,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                          {showAllMovementIds ? "Hide IDs" : `Show all (${lastReceipt.movementIds.length})`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Share Receipt" onPress={onShareReceipt} disabled={loading} variant="primary" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Copy" onPress={onCopyReceipt} disabled={loading} variant="secondary" />
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Button
                      title="Close"
                      onPress={() => setReceiptModalOpen(false)}
                      disabled={loading}
                      variant="secondary"
                    />
                  </View>
                </>
              ) : (
                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                  No receipt loaded.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {isOffline ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(245,158,11,0.45)",
            backgroundColor: "rgba(245,158,11,0.10)",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: theme.radius.lg,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            OFFLINE • Movement imezimwa (washa data/Wi-Fi)
          </Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
        Stock Movement
      </Text>

      {/* Last Receipt Summary Card */}
      {lastReceipt ? (
        <Card
          style={{
            borderColor: "rgba(52,211,153,0.45)",
            backgroundColor: "rgba(52,211,153,0.08)",
            gap: 8,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Last Receipt</Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            {fmtEAT(lastReceipt.createdAt)} •{" "}
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {lastReceipt.actorEmail ? lastReceipt.actorEmail : lastReceipt.actorName}
            </Text>{" "}
            <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
              ({lastReceipt.actorRole})
            </Text>
          </Text>

          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            FROM: <Text style={{ color: theme.colors.text }}>{lastReceipt.fromStoreName}</Text>
            {"   "}→{"   "}
            TO: <Text style={{ color: theme.colors.text }}>{lastReceipt.toStoreName}</Text>
          </Text>

          {lastReceipt.reportReceiptId ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Receipt ID:{" "}
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {lastReceipt.reportReceiptId}
              </Text>
            </Text>
          ) : null}

          <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 4 }}>
            Items ({lastReceipt.totalItems}) • Total Qty {lastReceipt.totalQty}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Open Receipt"
                onPress={() => setReceiptModalOpen(true)}
                disabled={loading}
                variant="primary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Clear"
                onPress={() => setLastReceipt(null)}
                disabled={loading}
                variant="secondary"
              />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Receipt History = CARD ONLY */}
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Receipt History
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Fungua history ya transfer receipts na utafute kwa tarehe (search by date).
        </Text>

        <View style={{ marginTop: 4 }}>
          <Button
            title="Open Receipt History"
            onPress={() => {
              if (!activeOrgId) {
                Alert.alert("Missing", "No active Organization.");
                return;
              }
              router.push({
                pathname: "/(tabs)/stores/receipt-history",
                params: {
                  orgId: activeOrgId,
                  orgName: activeOrgName ?? "",
                  actorEmail: processedByLabel,
                },
              } as any);
            }}
            disabled={!activeOrgId}
            variant="primary"
          />
        </View>
      </Card>

      {/* Header card */}
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {activeOrgName ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>Role</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {activeRole ?? "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>FROM</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {fromStoreName || "—"}
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>TO</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
          {toStoreName || "—"}
        </Text>

        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.card,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Permission</Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
            {isOwnerAdmin
              ? "Owner/Admin: allowed"
              : flagLoading
                ? "Checking staff permission..."
                : staffMovementAllowed
                  ? "Staff: allowed (switch ON)"
                  : "Staff: NOT allowed (switch OFF)"}
          </Text>

          {!isOwnerAdmin && !flagLoading && !staffMovementAllowed ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Muombe Owner/Admin aende Stores → store yako → awashe “Allow staff stock movement”.
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Refresh Inventory"}
              onPress={loadInventory}
              disabled={loading || isOffline || !fromStoreId}
              variant="primary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Back" onPress={() => router.back()} disabled={loading} variant="secondary" />
          </View>
        </View>
      </Card>

      {!!error && (
        <Card
          style={{
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      )}

      {/* TO Store picker */}
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Choose TO store
        </Text>

        {toStores.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Hakuna store nyingine ndani ya org hii.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {toStores.map((s: any) => {
              const id = String(s.store_id);
              const active = String(toStoreId) === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => pickToStore(id)}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? "rgba(52,211,153,0.55)" : theme.colors.border,
                    backgroundColor: theme.colors.surface2,
                    borderRadius: theme.radius.xl,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    minWidth: 180,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{s.store_name}</Text>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    {active ? "Selected ✓" : "Tap to select"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Card>

      {/* Move summary + button */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
            Ready to Move
          </Text>

          <Pressable
            onPress={clearAllSelected}
            disabled={loading || selectedCount === 0}
            style={{
              opacity: loading || selectedCount === 0 ? 0.5 : 1,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface2,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Clear</Text>
          </Pressable>
        </View>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Selected items:{" "}
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{selectedCount}</Text>
        </Text>

        <Button
          title={loading ? "Processing..." : `Move Stock (${selectedCount})`}
          onPress={submit}
          disabled={loading || isOffline || !canMove || selectedCount === 0}
          variant="primary"
        />

        {!isOwnerAdmin && !flagLoading && !staffMovementAllowed ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Staff: Movement imezimwa kwa store hii. Owner/Admin anaweza kuwasha.
          </Text>
        ) : null}
      </Card>

      {/* Product picker */}
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Choose products (FROM inventory)
        </Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tafuta product / SKU / category..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: "rgba(255,255,255,0.05)",
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: theme.colors.text,
            fontWeight: "800",
          }}
        />

        {filtered.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Hakuna items. Bonyeza “Refresh Inventory”.
          </Text>
        ) : (
          filtered.slice(0, 40).map((r) => {
            const pid = String(r.product_id);
            const currentQty = selectedMap[pid]?.qty ?? "";
            const isSelected = parsePositiveInt(currentQty) > 0;

            return (
              <View
                key={pid}
                style={{
                  borderWidth: 1,
                  borderColor: isSelected ? "rgba(52,211,153,0.55)" : theme.colors.border,
                  borderRadius: theme.radius.xl,
                  backgroundColor: theme.colors.card,
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {r.product_name}
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      SKU: <Text style={{ color: theme.colors.text }}>{r.sku ?? "—"}</Text>
                      {"   "}|{"   "}
                      QTY: <Text style={{ color: theme.colors.text }}>{r.qty}</Text>
                    </Text>

                    <Text
                      style={{
                        marginTop: 8,
                        fontWeight: "900",
                        color: isSelected ? theme.colors.emerald : theme.colors.faint,
                      }}
                    >
                      {isSelected ? "Selected ✓" : "Type qty to select"}
                    </Text>
                  </View>

                  <View style={{ width: 110 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 8 }}>
                      Qty
                    </Text>

                    <TextInput
                      value={currentQty}
                      onChangeText={(t) => setInlineQty(pid, t)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={{
                        borderWidth: 1,
                        borderColor: isSelected ? "rgba(52,211,153,0.55)" : theme.colors.border,
                        borderRadius: theme.radius.lg,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: theme.colors.text,
                        fontWeight: "900",
                        textAlign: "center",
                      }}
                    />

                    {isSelected ? (
                      <Pressable
                        onPress={() => setInlineQty(pid, "")}
                        style={{
                          marginTop: 10,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.lg,
                          backgroundColor: theme.colors.surface2,
                          paddingVertical: 8,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                          Clear
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })
        )}

        {filtered.length > 40 ? (
          <Text style={{ color: theme.colors.faint, fontWeight: "800" }}>
            Showing first 40 results. Refine search to narrow down.
          </Text>
        ) : null}
      </Card>

      <View style={{ height: 24 }} />
    </Screen>
  );
}