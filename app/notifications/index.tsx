// app/notifications/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { theme } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";
import { useOrg } from "@/src/context/OrgContext";

type NotifRow = {
  id: string;
  organization_id: string;
  store_id: string;
  source_store_id: string | null;
  event_type: string;
  title: string;
  body: any;
  items: any;
  total_units: number;
  total_skus: number;
  actor_user_id: string;
  actor_name: string | null;
  ref_movement_id: string | null;
  created_by: string;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
};

type Receipt = {
  key: string; // movement_id preferred, fallback to notification id
  movement_id: string | null;
  organization_id: string;
  store_id: string;
  source_store_id: string | null;
  event_type: string;
  title: string;

  actor_user_id: string;
  actor_name: string | null;

  created_at: string; // newest timestamp among group
  total_units: number;
  total_skus: number;

  is_read: boolean;

  // raw rows inside this receipt
  rows: NotifRow[];

  // merged items
  items: any[];
};

function fmtLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString();
  } catch {
    return iso;
  }
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

function shortId(id: string) {
  if (!id) return "—";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function clean(s: any) {
  return String(s ?? "").trim();
}

function clampInt(n: any, fallback = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.floor(x);
}

/** Parse "YYYY-MM-DD" to Date at local midnight */
function parseYMD(s: string) {
  const t = clean(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [yy, mm, dd] = t.split("-").map((v) => Number(v));
  if (!yy || !mm || !dd) return null;
  const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function looksLikeEmail(s: string) {
  const t = clean(s).toLowerCase();
  return t.includes("@") && t.includes(".");
}

export default function NotificationsCenter() {
  const router = useRouter();
  const { activeStoreId, activeStoreName, stores } = useOrg();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"ALL" | "STORE">("ALL");

  // ✅ filters
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD
  const [preset, setPreset] = useState<"ALL" | "TODAY" | "7D" | "30D">("ALL");

  // ✅ current user (for showing YOUR email instead of UUID)
  const [myUserId, setMyUserId] = useState<string>("");
  const [myEmail, setMyEmail] = useState<string>("");

  // ✅ actor display cache (for other users => profiles.display_name)
  const [actorDisplay, setActorDisplay] = useState<Record<string, string>>({});

  // ✅ receipt modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Receipt | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = String(data?.user?.id ?? "");
        const em = String(data?.user?.email ?? "");
        if (!alive) return;
        setMyUserId(uid);
        setMyEmail(em);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const storeNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of stores ?? []) {
      map[String((s as any).store_id)] = String((s as any).store_name ?? "Store");
    }
    return map;
  }, [stores]);

  const pStoreId = useMemo(() => {
    if (mode === "STORE") return activeStoreId ?? null;
    return null;
  }, [mode, activeStoreId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc("get_my_notifications", {
        p_store_id: pStoreId,
        p_limit: 200,
      });
      if (e) throw e;

      setRows((data ?? []) as NotifRow[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pStoreId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    try {
      await supabase.rpc("mark_notification_read", { p_notification_id: id });
    } catch {
      // non-blocking
    }
  }, []);

  /** ✅ Prefetch profiles.display_name for actors (best-effort) */
  useEffect(() => {
    let alive = true;

    const ids = Array.from(new Set((rows ?? []).map((r) => clean(r.actor_user_id)).filter(Boolean)));
    const missing = ids.filter((id) => !actorDisplay[id]);
    if (missing.length === 0) return;

    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", missing)
          .limit(200);

        if (e) return;
        if (!alive) return;

        const next: Record<string, string> = {};
        for (const row of (data ?? []) as any[]) {
          const id = clean(row?.id);
          const dn = clean(row?.display_name);
          if (id && dn) next[id] = dn;
        }

        if (Object.keys(next).length > 0) {
          setActorDisplay((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /** ✅ Group notifications into one "receipt" per movement_id */
  const receipts: Receipt[] = useMemo(() => {
    const map = new Map<string, Receipt>();

    for (const n of rows ?? []) {
      const key = n.ref_movement_id ? `mv:${n.ref_movement_id}` : `n:${n.id}`;
      const itemsArr = Array.isArray(n.items) ? n.items : [];

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          movement_id: n.ref_movement_id ?? null,
          organization_id: n.organization_id,
          store_id: n.store_id,
          source_store_id: n.source_store_id ?? null,
          event_type: n.event_type,
          title: n.title,
          actor_user_id: n.actor_user_id,
          actor_name: n.actor_name ?? null,
          created_at: n.created_at,
          total_units: clampInt(n.total_units, 0),
          total_skus: clampInt(n.total_skus, 0),
          is_read: !!n.is_read,
          rows: [n],
          items: [...itemsArr],
        });
        continue;
      }

      existing.rows.push(n);

      if (new Date(n.created_at).getTime() > new Date(existing.created_at).getTime()) {
        existing.created_at = n.created_at;
      }

      existing.total_units += clampInt(n.total_units, 0);

      if (itemsArr.length > 0) {
        existing.items.push(...itemsArr);
      }

      existing.is_read = existing.is_read && !!n.is_read;
    }

    const out = Array.from(map.values()).map((r) => {
      const uniq = new Set<string>();
      for (const it of r.items ?? []) {
        const pid = clean(it?.product_id);
        if (pid) uniq.add(pid);
      }
      const computedSkus = uniq.size;
      return {
        ...r,
        total_skus: computedSkus > 0 ? computedSkus : clampInt(r.total_skus, 0),
      };
    });

    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return out;
  }, [rows]);

  /** Presets: TODAY / 7D / 30D set dateFrom/dateTo automatically */
  useEffect(() => {
    if (preset === "ALL") return;

    const now = new Date();
    const to = startOfDay(now);
    let from = startOfDay(now);

    if (preset === "TODAY") {
      from = startOfDay(now);
    } else if (preset === "7D") {
      from = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    } else if (preset === "30D") {
      from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    }

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };

    setDateFrom(fmt(from));
    setDateTo(fmt(to));
  }, [preset]);

  const filtered: Receipt[] = useMemo(() => {
    const qq = clean(q).toLowerCase();

    const df = dateFrom ? parseYMD(dateFrom) : null;
    const dt = dateTo ? parseYMD(dateTo) : null;

    const fromD = df ? startOfDay(df) : null;
    const toD = dt ? endOfDay(dt) : null;

    return (receipts ?? []).filter((r) => {
      if (fromD || toD) {
        const t = new Date(r.created_at);
        const okFrom = fromD ? t.getTime() >= fromD.getTime() : true;
        const okTo = toD ? t.getTime() <= toD.getTime() : true;
        if (!okFrom || !okTo) return false;
      }

      if (!qq) return true;

      const storeName = (storeNameById[String(r.store_id)] ?? "Store").toLowerCase();
      const sourceStoreName = (r.source_store_id
        ? storeNameById[String(r.source_store_id)] ?? ""
        : ""
      ).toLowerCase();

      const actorRaw = clean(r.actor_name).toLowerCase();
      const actorResolved = clean(actorDisplay[clean(r.actor_user_id)]).toLowerCase();
      const title = clean(r.title).toLowerCase();
      const type = clean(r.event_type).toLowerCase();
      const move = clean(r.movement_id).toLowerCase();

      const itemsText = (r.items ?? [])
        .map((it: any) => {
          const pid = clean(it?.product_id);
          const nm = clean(it?.product_name || it?.name);
          const sku = clean(it?.sku || it?.product_sku);
          return `${pid} ${nm} ${sku}`;
        })
        .join(" ")
        .toLowerCase();

      return (
        title.includes(qq) ||
        type.includes(qq) ||
        storeName.includes(qq) ||
        sourceStoreName.includes(qq) ||
        actorRaw.includes(qq) ||
        actorResolved.includes(qq) ||
        move.includes(qq) ||
        itemsText.includes(qq)
      );
    });
  }, [receipts, q, dateFrom, dateTo, storeNameById, actorDisplay]);

  const clearFilters = useCallback(() => {
    setQ("");
    setPreset("ALL");
    setDateFrom("");
    setDateTo("");
  }, []);

  const markReceiptRead = useCallback(
    async (r: Receipt) => {
      const ids = (r.rows ?? []).map((x) => x.id).filter(Boolean);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await markRead(id);
      }
    },
    [markRead]
  );

  const actorLabel = useCallback(
    (r: Receipt) => {
      const fromDb = clean(r.actor_name);
      if (fromDb) return fromDb;

      const uid = clean(r.actor_user_id);

      if (uid && myUserId && uid === myUserId && myEmail) return myEmail;

      const dn = clean(actorDisplay[uid]);
      if (dn) return dn;

      return shortId(uid);
    },
    [actorDisplay, myEmail, myUserId]
  );

  const sourceLabel = useCallback(
    (r: Receipt) => {
      const sid = clean(r.source_store_id);
      if (sid) {
        const nm = storeNameById[sid] ?? shortId(sid);
        return `Movement from ${nm}`;
      }
      return "New Stock Entry";
    },
    [storeNameById]
  );

  const routeLabel = useCallback(
    (r: Receipt) => {
      const toNm = storeNameById[clean(r.store_id)] ?? shortId(clean(r.store_id));
      const sid = clean(r.source_store_id);
      if (sid) {
        const fromNm = storeNameById[sid] ?? shortId(sid);
        return { from: fromNm, to: toNm };
      }
      return { from: "Stock Entry", to: toNm };
    },
    [storeNameById]
  );

  const mergedItemsForReceipt = useCallback((r: Receipt) => {
    const m = new Map<string, any>();
    for (const it of r.items ?? []) {
      const pid = clean(it?.product_id) || "__no_product__";
      const prev = m.get(pid);
      const qty = clampInt(it?.qty, 0);
      if (!prev) {
        m.set(pid, { ...it, qty });
      } else {
        m.set(pid, { ...prev, qty: clampInt(prev.qty, 0) + qty });
      }
    }
    return Array.from(m.values());
  }, []);

  const buildReceiptText = useCallback(
    (r: Receipt) => {
      const { from, to } = routeLabel(r);
      const actor = actorLabel(r);
      const src = sourceLabel(r);

      const items = mergedItemsForReceipt(r);
      const movementId = r.movement_id ? r.movement_id : r.key;

      const lines: string[] = [];
      lines.push("ZETRA BMS • Stock Movement Receipt");
      lines.push("----------------------------------");
      lines.push(`Date/Time (EAT): ${fmtEAT(r.created_at)}`);
      lines.push(`Type: ${clean(r.event_type) || "—"}`);
      lines.push(`From: ${from}`);
      lines.push(`To: ${to}`);
      lines.push(`Source: ${src}`);
      lines.push(`Receipt: ${shortId(movementId)}`);
      lines.push(`Processed by: ${actor}`);
      lines.push("");
      lines.push(`Items: ${items.length} | Total Units: ${clampInt(r.total_units, 0)}`);
      lines.push("");
      lines.push("Items:");
      for (const it of items) {
        const name = clean(it?.product_name || it?.name) || "Item";
        const sku = clean(it?.sku || it?.product_sku);
        const qty = clampInt(it?.qty, 0);
        const skuText = sku ? ` • SKU ${sku}` : "";
        lines.push(`- ${name}${skuText} • Qty ${qty}`);
      }

      lines.push("");
      lines.push("IDs:");
      if (r.movement_id) lines.push(`Movement ID: ${r.movement_id}`);
      for (const n of r.rows ?? []) lines.push(`Notification: ${n.id}`);

      return lines.join("\n");
    },
    [actorLabel, mergedItemsForReceipt, routeLabel, sourceLabel]
  );

  const shareSelected = useCallback(async () => {
    if (!selected) return;
    try {
      await Share.share({ message: buildReceiptText(selected) });
    } catch {
      // ignore
    }
  }, [buildReceiptText, selected]);

  const copySelected = useCallback(async () => {
    if (!selected) return;
    try {
      await Clipboard.setStringAsync(buildReceiptText(selected));
      Alert.alert("Copied ✅", "Receipt ime-copy (unaweza ku-paste WhatsApp/Email).");
    } catch {
      Alert.alert("Failed", "Imeshindikana ku-copy receipt.");
    }
  }, [buildReceiptText, selected]);

  const openReceipt = useCallback(
    async (r: Receipt) => {
      // Mark read first (stability: keep DB state correct)
      if (!r.is_read) {
        await markReceiptRead(r);
        // local optimistic update
        setRows((prev) =>
          (prev ?? []).map((n) => {
            if ((r.rows ?? []).some((x) => x.id === n.id)) {
              return { ...n, is_read: true, read_at: new Date().toISOString() } as any;
            }
            return n;
          })
        );
      }

      setSelected(r);
      setModalOpen(true);
    },
    [markReceiptRead]
  );

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
            }}
          >
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 14 }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                Receipt 🧾
              </Text>

              {selected ? (
                <>
                  {(() => {
                    const { from, to } = routeLabel(selected);
                    const actor = actorLabel(selected);
                    const src = sourceLabel(selected);
                    const movementId = selected.movement_id ? selected.movement_id : selected.key;
                    const items = mergedItemsForReceipt(selected);

                    return (
                      <>
                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 10 }}>
                          Date/Time (EAT):{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                            {fmtEAT(selected.created_at)}
                          </Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                          FROM:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{from}</Text>
                          {"  "}→{"  "}
                          TO:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{to}</Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                          Type:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                            {clean(selected.event_type) || "—"}
                          </Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                          Source:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{src}</Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                          Processed by:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{actor}</Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                          Receipt:{" "}
                          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                            {shortId(movementId)}
                          </Text>
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                          Items ({items.length}) • Total Units {clampInt(selected.total_units, 0)}
                        </Text>

                        <View style={{ marginTop: 8, gap: 6 }}>
                          {items.map((it: any, idx: number) => {
                            const name = clean(it?.product_name || it?.name) || "Item";
                            const sku = clean(it?.sku || it?.product_sku);
                            const qty = clampInt(it?.qty, 0);
                            return (
                              <Text key={`${idx}`} style={{ color: theme.colors.text, fontWeight: "900" }}>
                                • {name}
                                {sku ? ` • SKU ${sku}` : ""} — {qty}
                              </Text>
                            );
                          })}
                        </View>

                        <Text style={{ color: theme.colors.muted, fontWeight: "900", marginTop: 12 }}>
                          IDs
                        </Text>

                        <View style={{ marginTop: 8, gap: 6 }}>
                          {selected.movement_id ? (
                            <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                              Movement: {selected.movement_id}
                            </Text>
                          ) : null}
                          {(selected.rows ?? []).slice(0, 6).map((n) => (
                            <Text key={n.id} style={{ color: theme.colors.text, fontWeight: "800" }}>
                              Notification: {n.id}
                            </Text>
                          ))}
                          {(selected.rows ?? []).length > 6 ? (
                            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                              +{(selected.rows ?? []).length - 6} more...
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                          <View style={{ flex: 1 }}>
                            <Pressable
                              onPress={shareSelected}
                              style={({ pressed }) => [
                                {
                                  paddingVertical: 12,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: theme.colors.emeraldBorder,
                                  backgroundColor: theme.colors.emeraldSoft,
                                  opacity: pressed ? 0.92 : 1,
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                                Share Receipt
                              </Text>
                            </Pressable>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Pressable
                              onPress={copySelected}
                              style={({ pressed }) => [
                                {
                                  paddingVertical: 12,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  backgroundColor: "rgba(255,255,255,0.04)",
                                  opacity: pressed ? 0.92 : 1,
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Copy</Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={{ marginTop: 10 }}>
                          <Pressable
                            onPress={() => setModalOpen(false)}
                            style={({ pressed }) => [
                              {
                                paddingVertical: 12,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surface,
                                opacity: pressed ? 0.92 : 1,
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Close</Text>
                          </Pressable>
                        </View>
                      </>
                    );
                  })()}
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, paddingVertical: 6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "900", color: theme.colors.text }}>
          Notifications
        </Text>
      </View>

      {/* View mode */}
      <Card style={{ marginTop: 12, gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>View mode</Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => setMode("ALL")}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: mode === "ALL" ? theme.colors.emeraldBorder : theme.colors.border,
                backgroundColor: mode === "ALL" ? theme.colors.emeraldSoft : theme.colors.surface,
                opacity: pressed ? 0.92 : 1,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>All Stores</Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("STORE")}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: mode === "STORE" ? theme.colors.emeraldBorder : theme.colors.border,
                backgroundColor: mode === "STORE" ? theme.colors.emeraldSoft : theme.colors.surface,
                opacity: pressed ? 0.92 : 1,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>This Store</Text>
          </Pressable>
        </View>

        {mode === "STORE" ? (
          <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
            Active Store:{" "}
            <Text style={{ color: theme.colors.text }}>{activeStoreName ?? "—"}</Text>
          </Text>
        ) : null}
      </Card>

      {/* Search + Date filter */}
      <Card style={{ marginTop: 12, gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Search & Date</Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface2,
            borderRadius: theme.radius.lg,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Ionicons name="search" size={16} color={theme.colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search: store, type, movement id, sku, product..."
            placeholderTextColor={theme.colors.muted}
            style={{
              flex: 1,
              color: theme.colors.text,
              fontWeight: "800",
              paddingVertical: 0,
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={theme.colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Presets */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {(["ALL", "TODAY", "7D", "30D"] as const).map((k) => {
            const active = preset === k;
            const label = k === "ALL" ? "All Time" : k === "TODAY" ? "Today" : k;
            return (
              <Pressable
                key={k}
                onPress={() => setPreset(k)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
                    backgroundColor: active ? theme.colors.emeraldSoft : theme.colors.surface,
                    opacity: pressed ? 0.92 : 1,
                    alignItems: "center",
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom date range */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>From</Text>
            <TextInput
              value={dateFrom}
              onChangeText={(v) => {
                setPreset("ALL");
                setDateFrom(v);
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.muted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface2,
                borderRadius: theme.radius.lg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: theme.colors.text,
                fontWeight: "800",
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>To</Text>
            <TextInput
              value={dateTo}
              onChangeText={(v) => {
                setPreset("ALL");
                setDateTo(v);
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.muted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface2,
                borderRadius: theme.radius.lg,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: theme.colors.text,
                fontWeight: "800",
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={clearFilters}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                opacity: pressed ? 0.92 : 1,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Clear Filters</Text>
          </Pressable>

          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: "rgba(255,255,255,0.04)",
                opacity: pressed ? 0.92 : 1,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* Loading / Error */}
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <Card
          style={{
            marginTop: 12,
            borderColor: theme.colors.dangerBorder,
            backgroundColor: theme.colors.dangerSoft,
          }}
        >
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{error}</Text>
        </Card>
      ) : null}

      {/* List */}
      <View style={{ marginTop: 14, marginBottom: 6 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
          Receipts ({filtered.length})
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {(filtered ?? []).map((r) => {
          const targetStore = storeNameById[String(r.store_id)] ?? "Store";
          const isUnread = !r.is_read;

          const mvLabel = r.movement_id ? shortId(r.movement_id) : shortId(r.key);

          const mergedItems = (() => {
            const m = new Map<string, any>();
            for (const it of r.items ?? []) {
              const pid = clean(it?.product_id) || "__no_product__";
              const prev = m.get(pid);
              const qty = clampInt(it?.qty, 0);
              if (!prev) {
                m.set(pid, { ...it, qty });
              } else {
                m.set(pid, { ...prev, qty: clampInt(prev.qty, 0) + qty });
              }
            }
            return Array.from(m.values());
          })();

          const actor = actorLabel(r);
          const actorHint = looksLikeEmail(actor) ? "Email" : "User";
          const source = sourceLabel(r);

          return (
            <Pressable
              key={r.key}
              onPress={() => openReceipt(r)}
              style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
            >
              <Card
                style={{
                  borderColor: isUnread ? theme.colors.emeraldBorder : theme.colors.border,
                  backgroundColor: isUnread ? "rgba(16,185,129,0.08)" : theme.colors.card,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                      {r.title}
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      Store: <Text style={{ color: theme.colors.text }}>{targetStore}</Text>
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      Type: <Text style={{ color: theme.colors.text }}>{r.event_type}</Text>
                      {"  "}•{"  "}
                      Time: <Text style={{ color: theme.colors.text }}>{fmtLocal(r.created_at)}</Text>
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      Source: <Text style={{ color: theme.colors.text }}>{source}</Text>
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      Receipt: <Text style={{ color: theme.colors.text }}>{mvLabel}</Text>
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      {r.total_skus} Products • Total Units:{" "}
                      <Text style={{ color: theme.colors.text }}>{r.total_units}</Text>
                    </Text>

                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      By ({actorHint}): <Text style={{ color: theme.colors.text }}>{actor}</Text>
                    </Text>
                  </View>

                  {isUnread ? (
                    <View
                      style={{
                        alignSelf: "flex-start",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: theme.colors.emeraldBorder,
                        backgroundColor: theme.colors.emeraldSoft,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                        NEW
                      </Text>
                    </View>
                  ) : null}
                </View>

                {mergedItems.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Items</Text>

                    {mergedItems.slice(0, 8).map((it: any, idx: number) => {
                      const pid = clean(it?.product_id);
                      const name = clean(it?.product_name || it?.name);
                      const sku = clean(it?.sku || it?.product_sku);
                      const qty = clampInt(it?.qty, 0);

                      const left = name ? name : pid ? shortId(pid) : "Item";
                      const skuText = sku ? ` • SKU: ${sku}` : "";

                      return (
                        <Text key={idx} style={{ color: theme.colors.text, fontWeight: "800" }}>
                          • {left}
                          {skuText}  —  {qty} pcs
                        </Text>
                      );
                    })}

                    {mergedItems.length > 8 ? (
                      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                        +{mergedItems.length - 8} more...
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>(No items list)</Text>
                )}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </Screen>
  );
}