// app/(tabs)/stores/receipt-history.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

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

  // actor
  actorEmail: string | null;
  actorName: string;
  actorRole: string;

  // source label (movement vs new stock etc.)
  sourceLabel: string;

  items: ReceiptItem[];
  totalItems: number;
  totalQty: number;
  movementIds: string[];
  reportReceiptId?: string | null;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function shortId(id: string) {
  const s = norm(id);
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
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

// Parse date input: supports "YYYY-MM-DD" or "DD/MM/YYYY"
function parseDateInputToYMD(input: string): { y: number; m: number; d: number } | null {
  const s = norm(input);
  if (!s) return null;

  // YYYY-MM-DD
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const y = Number(m1[1]);
    const m = Number(m1[2]);
    const d = Number(m1[3]);
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
    return null;
  }

  // DD/MM/YYYY
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m2) {
    const d = Number(m2[1]);
    const m = Number(m2[2]);
    const y = Number(m2[3]);
    if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
    return null;
  }

  return null;
}

// Build EAT day range timestamps (Africa/Nairobi = +03:00)
function eatDayRange(input: string): { start: string; end: string } | null {
  const ymd = parseDateInputToYMD(input);
  if (!ymd) return null;

  const pad2 = (n: number) => String(n).padStart(2, "0");

  const y = ymd.y;
  const m = ymd.m;
  const d = ymd.d;

  const start = `${y}-${pad2(m)}-${pad2(d)}T00:00:00+03:00`;

  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const dt2 = new Date(dt.getTime() + 24 * 60 * 60 * 1000);

  const y2 = dt2.getUTCFullYear();
  const m2 = dt2.getUTCMonth() + 1;
  const d2 = dt2.getUTCDate();
  const end = `${y2}-${pad2(m2)}-${pad2(d2)}T00:00:00+03:00`;

  return { start, end };
}

export default function ReceiptHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orgId?: string; orgName?: string; actorEmail?: string }>();

  const orgId = norm(params.orgId);
  const orgName = norm(params.orgName) || "—";

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [dateQuery, setDateQuery] = useState<string>("");
  const [activeDateFilter, setActiveDateFilter] = useState<string>("");

  // receipt modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [showAllMovementIds, setShowAllMovementIds] = useState(false);

  // Stores map (org scoped)
  const [storeNameById, setStoreNameById] = useState<Record<string, string>>({});

  const loadStores = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name, name")
        .eq("organization_id", orgId);

      if (error) throw error;

      const next: Record<string, string> = {};
      for (const s of (data ?? []) as any[]) {
        const id = String(s.id ?? "");
        if (!id) continue;
        const nm = norm((s as any).store_name) || norm((s as any).name) || shortId(id);
        next[id] = nm;
      }
      setStoreNameById(next);
    } catch {
      // best-effort only
      setStoreNameById({});
    }
  }, [orgId]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const resolveStoreName = useCallback(
    (storeId: any) => {
      const id = norm(storeId);
      if (!id) return "—";
      return storeNameById[id] || shortId(id);
    },
    [storeNameById]
  );

  const [actorCache, setActorCache] = useState<Record<string, { email: string | null; name: string }>>({});

  const resolveActor = useCallback(
    async (uid: string) => {
      const id = norm(uid);
      if (!id) return { email: null as string | null, name: "—" };

      if (actorCache[id]) return actorCache[id];

      let email: string | null = null;
      let name = shortId(id);

      // profiles.display_name (safe)
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", id)
          .maybeSingle();

        if (!error) {
          const dn = norm((data as any)?.display_name);
          if (dn) name = dn;
        }
      } catch {
        // ignore
      }

      const next = { email, name };
      setActorCache((prev) => ({ ...prev, [id]: next }));
      return next;
    },
    [actorCache]
  );

  const load = useCallback(
    async (reset: boolean) => {
      if (!orgId) {
        Alert.alert("Missing", "No orgId provided.");
        return;
      }

      setLoading(true);
      try {
        const nextPage = reset ? 0 : page;
        const offset = nextPage * PAGE_SIZE;

        let q = supabase
          .from("transfer_receipts")
          .select("id, created_at, items, movement_ids, from_store_id, to_store_id, created_by, actor_email")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        const range = activeDateFilter ? eatDayRange(activeDateFilter) : null;
        if (activeDateFilter && !range) {
          // invalid date => ignore
        } else if (range) {
          q = q.gte("created_at", range.start).lt("created_at", range.end);
        }

        const { data, error } = await q.range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;

        if (reset) {
          setRows(data ?? []);
          setPage(1);
        } else {
          setRows((prev) => [...prev, ...(data ?? [])]);
          setPage((p) => p + 1);
        }
      } catch (e: any) {
        Alert.alert("Failed", e?.message ?? "Failed to load receipts");
      } finally {
        setLoading(false);
      }
    },
    [orgId, page, activeDateFilter]
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, activeDateFilter]);

  const dbRowToClientReceipt = useCallback(
    async (row: any): Promise<Receipt> => {
      const createdAt = row.created_at ?? new Date().toISOString();

      const itemsRaw = row.items ?? [];
      const items: ReceiptItem[] = Array.isArray(itemsRaw)
        ? itemsRaw.map((it: any) => ({
            product_id: String(it.product_id ?? ""),
            product_name: String(it.product_name ?? (it.name ?? "Product")),
            sku: it.sku ?? null,
            qty: Number(it.qty ?? 0),
          }))
        : [];

      const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

      const fromStoreName = resolveStoreName(row.from_store_id);
      const toStoreName = resolveStoreName(row.to_store_id);

      const actorId = String(row.created_by ?? "");
      const actorEmailDb = norm(row.actor_email) || null;

      // If DB has actor_email -> use it. Otherwise fallback.
      let actorEmail: string | null = actorEmailDb;
      let actorName = "—";

      if (actorEmailDb) {
        actorName = actorEmailDb;
      } else {
        const actor = await resolveActor(actorId);
        actorEmail = actor.email;
        actorName = actor.name || shortId(actorId);
      }

      // Transfer receipt = movement from FROM store always
      const sourceLabel = `Movement from ${fromStoreName}`;

      return {
        createdAt,
        organizationName: orgName ?? "—",
        fromStoreName,
        toStoreName,

        actorEmail,
        actorName: actorName || shortId(actorId) || "—",
        actorRole: "—",

        sourceLabel,

        items,
        totalItems: items.length,
        totalQty,
        movementIds: Array.isArray(row.movement_ids) ? row.movement_ids.map(String) : [],
        reportReceiptId: String(row.id ?? null),
      };
    },
    [orgName, resolveActor, resolveStoreName]
  );

  const buildReceiptText = useCallback((r: Receipt) => {
    const lines: string[] = [];

    lines.push("ZETRA BMS • Stock Transfer Receipt");
    lines.push("----------------------------------");
    lines.push(`Date/Time (EAT): ${fmtEAT(r.createdAt)}`);
    lines.push(`Organization: ${r.organizationName}`);
    lines.push(`From: ${r.fromStoreName}`);
    lines.push(`To: ${r.toStoreName}`);
    lines.push(`Source: ${r.sourceLabel}`);

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

  const shareReceipt = useCallback(async () => {
    if (!selectedReceipt) return;
    try {
      await Share.share({ message: buildReceiptText(selectedReceipt) });
    } catch {}
  }, [selectedReceipt, buildReceiptText]);

  const copyReceipt = useCallback(async () => {
    if (!selectedReceipt) return;
    try {
      await Clipboard.setStringAsync(buildReceiptText(selectedReceipt));
      Alert.alert("Copied ✅", "Receipt ime-copy (unaweza ku-paste WhatsApp/Email).");
    } catch {
      Alert.alert("Failed", "Imeshindikana ku-copy receipt.");
    }
  }, [selectedReceipt, buildReceiptText]);

  return (
    <Screen scroll>
      {/* Receipt modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          onPress={() => setModalOpen(false)}
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
                Transfer Receipt 🧾
              </Text>

              {selectedReceipt ? (
                <>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
                    Date/Time (EAT):{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {fmtEAT(selectedReceipt.createdAt)}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    FROM:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {selectedReceipt.fromStoreName}
                    </Text>
                    {"  "}→{"  "}
                    TO:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {selectedReceipt.toStoreName}
                    </Text>
                  </Text>

                  {/* ✅ Source */}
                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Source:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {selectedReceipt.sourceLabel}
                    </Text>
                  </Text>

                  <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                    Processed by:{" "}
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {selectedReceipt.actorEmail ? selectedReceipt.actorEmail : selectedReceipt.actorName}
                    </Text>{" "}
                    <Text style={{ color: theme.colors.faint, fontWeight: "900" }}>
                      ({selectedReceipt.actorRole})
                    </Text>
                  </Text>

                  {selectedReceipt.reportReceiptId ? (
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                      Receipt ID:{" "}
                      <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                        {selectedReceipt.reportReceiptId}
                      </Text>
                    </Text>
                  ) : null}

                  <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                    Items ({selectedReceipt.totalItems}) • Total Qty {selectedReceipt.totalQty}
                  </Text>

                  <View style={{ marginTop: 8, gap: 6 }}>
                    {selectedReceipt.items.map((it) => (
                      <Text key={it.product_id} style={{ color: theme.colors.text, fontWeight: "900" }}>
                        • {it.product_name} — {it.qty}
                      </Text>
                    ))}
                  </View>

                  <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                    Movement IDs
                  </Text>

                  <View style={{ marginTop: 8, gap: 6 }}>
                    {(showAllMovementIds ? selectedReceipt.movementIds : selectedReceipt.movementIds.slice(0, 3)).map(
                      (id, idx) => (
                        <Text key={`${id}-${idx}`} style={{ color: theme.colors.text, fontWeight: "800" }}>
                          {id}
                        </Text>
                      )
                    )}

                    {selectedReceipt.movementIds.length > 3 ? (
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
                          {showAllMovementIds ? "Hide IDs" : `Show all (${selectedReceipt.movementIds.length})`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Share Receipt" onPress={shareReceipt} variant="primary" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Copy" onPress={copyReceipt} variant="secondary" />
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Button title="Close" onPress={() => setModalOpen(false)} variant="secondary" />
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

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
          Receipt History
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface2,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Back</Text>
        </Pressable>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
          {orgName}
        </Text>

        <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
          Search by date
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Andika: <Text style={{ color: theme.colors.text }}>2026-02-24</Text> au{" "}
          <Text style={{ color: theme.colors.text }}>24/02/2026</Text>
        </Text>

        <TextInput
          value={dateQuery}
          onChangeText={setDateQuery}
          placeholder="YYYY-MM-DD or DD/MM/YYYY"
          placeholderTextColor="rgba(255,255,255,0.35)"
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

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Search"
              onPress={() => {
                const v = norm(dateQuery);
                if (!v) {
                  setActiveDateFilter("");
                  return;
                }
                const ok = eatDayRange(v);
                if (!ok) {
                  Alert.alert("Invalid date", "Tumia format: YYYY-MM-DD au DD/MM/YYYY");
                  return;
                }
                setActiveDateFilter(v);
              }}
              variant="primary"
              disabled={loading}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Clear Filter"
              onPress={() => {
                setDateQuery("");
                setActiveDateFilter("");
              }}
              variant="secondary"
              disabled={loading}
            />
          </View>
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Receipts
        </Text>

        {rows.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Hakuna risiti (au bado haijaloadi).
          </Text>
        ) : (
          rows.map((r: any) => {
            const createdAt = r.created_at ?? "";
            const itemsRaw = Array.isArray(r.items) ? r.items : [];
            const totalItems = itemsRaw.length;
            const totalQty = itemsRaw.reduce((s: number, it: any) => s + Number(it?.qty ?? 0), 0);

            const fromNm = resolveStoreName(r.from_store_id);
            const toNm = resolveStoreName(r.to_store_id);

            const by = norm(r.actor_email) || shortId(String(r.created_by ?? ""));

            return (
              <Pressable
                key={String(r.id)}
                onPress={async () => {
                  const receipt = await dbRowToClientReceipt(r);
                  setSelectedReceipt(receipt);
                  setShowAllMovementIds(false);
                  setModalOpen(true);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.xl,
                  padding: 12,
                  backgroundColor: theme.colors.card,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                  {fmtEAT(createdAt)} • {totalItems} items • Qty {totalQty}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                  From: {fromNm} → {toNm}
                </Text>

                <Text style={{ color: theme.colors.faint, fontWeight: "900", marginTop: 6 }}>
                  By: {by}
                </Text>
              </Pressable>
            );
          })
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={loading ? "Loading..." : "Refresh"}
              onPress={() => load(true)}
              disabled={loading}
              variant="primary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="More"
              onPress={() => load(false)}
              disabled={loading || rows.length < PAGE_SIZE}
              variant="secondary"
            />
          </View>
        </View>
      </Card>

      <View style={{ height: 24 }} />
    </Screen>
  );
}