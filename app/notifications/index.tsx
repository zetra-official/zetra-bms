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

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
}

function formatItemMoney(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function sameId(a: any, b: any) {
  return clean(a) !== "" && clean(a) === clean(b);
}

function itemMetaLine(it: any) {
  const sku = firstNonEmpty(it?.sku, it?.product_sku);
  const barcode = firstNonEmpty(it?.barcode, it?.product_barcode);
  const category = firstNonEmpty(it?.category, it?.product_category);
  const unit = firstNonEmpty(it?.unit, it?.product_unit);
  const sellingPrice = firstNonEmpty(it?.selling_price, it?.unit_price, it?.price);

  const meta: string[] = [];
  if (sku) meta.push(`SKU ${sku}`);
  if (barcode) meta.push(`Barcode ${barcode}`);
  if (category) meta.push(`Category ${category}`);
  if (unit) meta.push(`Unit ${unit}`);
  if (sellingPrice) meta.push(`Sell ${formatItemMoney(sellingPrice)}`);

  return meta;
}

function prettyTypeLabel(v: any) {
  const t = clean(v).toUpperCase();
  if (!t) return "—";
  if (t === "STOCK_IN") return "Stock In";
  if (t === "TRANSFER_IN") return "Transfer In";
  if (t === "TRANSFER") return "Transfer";
  return t.replace(/_/g, " ");
}

function prettyDateTimeEAT(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function compactReceiptSummary(r: Receipt, items: any[]) {
  const first = items?.[0];
  const firstName =
    firstNonEmpty(first?.product_name, first?.name) ||
    (clean(first?.product_id) ? shortId(clean(first?.product_id)) : "Item");

  const more = Math.max(0, (items?.length ?? 0) - 1);
  const units = clampInt(r.total_units, 0);

  if ((items?.length ?? 0) <= 0) {
    return `${units} units`;
  }

  if (more <= 0) {
    return `${firstName} • ${units} pcs`;
  }

  return `${firstName} +${more} more • ${units} pcs`;
}

export default function NotificationsCenter() {
  const router = useRouter();
  const { activeStoreId, activeStoreName, stores } = useOrg();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mode: "ALL" = "ALL";

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

  // ✅ fallback product metadata cache for old notifications
  const [productMeta, setProductMeta] = useState<
    Record<
      string,
      {
        name?: string;
        sku?: string;
        barcode?: string;
        category?: string;
        unit?: string;
        selling_price?: number | string | null;
      }
    >
  >({});

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

 const pStoreId = useMemo(() => null, []);

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
      setRows([]);
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

  useEffect(() => {
    let alive = true;

    const ids = Array.from(
      new Set(
        (rows ?? [])
          .flatMap((r) => (Array.isArray(r.items) ? r.items : []))
          .map((it: any) => clean(it?.product_id))
          .filter(Boolean)
      )
    );

    const missing = ids.filter((id) => !productMeta[id]);
    if (missing.length === 0) return;

    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("products")
          .select("id, name, sku, barcode, category, unit, selling_price, price")
          .in("id", missing)
          .limit(500);

        if (e) return;
        if (!alive) return;

        const next: Record<
          string,
          {
            name?: string;
            sku?: string;
            barcode?: string;
            category?: string;
            unit?: string;
            selling_price?: number | string | null;
          }
        > = {};

        for (const row of (data ?? []) as any[]) {
          const id = clean(row?.id);
          if (!id) continue;

          next[id] = {
            name: clean(row?.name),
            sku: clean(row?.sku),
            barcode: clean(row?.barcode),
            category: clean(row?.category),
            unit: clean(row?.unit),
            selling_price: row?.selling_price ?? row?.price ?? null,
          };
        }

        if (Object.keys(next).length > 0) {
          setProductMeta((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, [rows, productMeta]);

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

  const groupedReceipts = useMemo(() => {
    const currentStoreId = clean(activeStoreId);

    if (!currentStoreId) {
      return {
        currentStore: [] as Receipt[],
        otherStores: filtered,
      };
    }

    const currentStore: Receipt[] = [];
    const otherStores: Receipt[] = [];

    for (const r of filtered) {
      if (clean(r.store_id) === currentStoreId) currentStore.push(r);
      else otherStores.push(r);
    }

    return { currentStore, otherStores };
  }, [filtered, activeStoreId]);

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
      const body0 = r.rows?.[0]?.body ?? {};
      const item0 = Array.isArray(r.items) && r.items.length > 0 ? r.items[0] : {};

      const explicit =
        firstNonEmpty(
          r.actor_name,
          body0?.actor_email,
          body0?.created_by_email,
          body0?.user_email,
          body0?.actor_name,
          body0?.created_by_name,
          item0?.actor_email,
          item0?.created_by_email,
          item0?.actor_name
        );

      if (explicit) return explicit;

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
      const tid = clean(r.store_id);
      const eventType = clean(r.event_type).toUpperCase();
      const title = clean(r.title).toUpperCase();
      const body0 = r.rows?.[0]?.body ?? {};
      const firstItem = Array.isArray(r.items) && r.items.length > 0 ? r.items[0] : null;

      const explicitSource =
        firstNonEmpty(
          body0?.source_type,
          body0?.source,
          body0?.entry_type,
          body0?.notification_type,
          firstItem?.source_type,
          firstItem?.source
        ).toUpperCase();

      const isSameStoreSource = sameId(sid, tid);
      const hasRealMovementSource = sid && !isSameStoreSource;

      if (hasRealMovementSource) {
        const nm = storeNameById[sid] ?? shortId(sid);
        return `Store Movement from ${nm}`;
      }

      if (explicitSource.includes("NEW_STOCK")) return "New Stock Received";
      if (explicitSource.includes("PURCHASE")) return "New Stock Received";
      if (explicitSource.includes("MANUAL")) return "New Stock Received";
      if (explicitSource.includes("TRANSFER")) return "Store Movement";
      if (title.includes("NEW STOCK")) return "New Stock Received";
      if (title.includes("STOCK AVAILABLE")) return "New Stock Received";
      if (eventType.includes("TRANSFER")) return "Store Movement";
      if (eventType.includes("STOCK_IN")) return "New Stock Received";

      return "Stock Received";
    },
    [storeNameById]
  );

  const routeLabel = useCallback(
    (r: Receipt) => {
      const tid = clean(r.store_id);
      const toNm = storeNameById[tid] ?? shortId(tid);
      const sid = clean(r.source_store_id);

      if (sid && !sameId(sid, tid)) {
        const fromNm = storeNameById[sid] ?? shortId(sid);
        return { from: fromNm, to: toNm };
      }

      return { from: "New Stock Entry", to: toNm };
    },
    [storeNameById]
  );

  const mergedItemsForReceipt = useCallback(
    (r: Receipt) => {
      const m = new Map<string, any>();

      for (const it of r.items ?? []) {
        const pid = clean(it?.product_id) || "__no_product__";
        const meta = productMeta[pid] ?? {};
        const prev = m.get(pid);
        const qty = clampInt(it?.qty, 0);

        const normalized = {
          ...it,
          product_id: pid !== "__no_product__" ? pid : "",
          product_name: firstNonEmpty(it?.product_name, it?.name, meta?.name),
          name: firstNonEmpty(it?.name, it?.product_name, meta?.name),
          sku: firstNonEmpty(it?.sku, it?.product_sku, meta?.sku),
          product_sku: firstNonEmpty(it?.product_sku, it?.sku, meta?.sku),
          barcode: firstNonEmpty(it?.barcode, it?.product_barcode, meta?.barcode),
          product_barcode: firstNonEmpty(it?.product_barcode, it?.barcode, meta?.barcode),
          category: firstNonEmpty(it?.category, it?.product_category, meta?.category),
          product_category: firstNonEmpty(it?.product_category, it?.category, meta?.category),
          unit: firstNonEmpty(it?.unit, it?.product_unit, meta?.unit),
          product_unit: firstNonEmpty(it?.product_unit, it?.unit, meta?.unit),
          selling_price:
            it?.selling_price ?? it?.unit_price ?? it?.price ?? meta?.selling_price ?? null,
          unit_price:
            it?.unit_price ?? it?.selling_price ?? it?.price ?? meta?.selling_price ?? null,
          price:
            it?.price ?? it?.selling_price ?? it?.unit_price ?? meta?.selling_price ?? null,
          qty,
        };

        if (!prev) {
          m.set(pid, normalized);
        } else {
          m.set(pid, {
            ...prev,
            qty: clampInt(prev.qty, 0) + qty,
          });
        }
      }

      return Array.from(m.values());
    },
    [productMeta]
  );

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
        const name =
          firstNonEmpty(it?.product_name, it?.name) ||
          (clean(it?.product_id) ? shortId(clean(it?.product_id)) : "Item");

        const sku = firstNonEmpty(it?.sku, it?.product_sku);
        const barcode = firstNonEmpty(it?.barcode, it?.product_barcode);
        const category = firstNonEmpty(it?.category, it?.product_category);
        const unit = firstNonEmpty(it?.unit, it?.product_unit);
        const qty = clampInt(it?.qty, 0);

        const sellingPrice = firstNonEmpty(it?.selling_price, it?.unit_price, it?.price);

        const extras: string[] = [];
        if (sku) extras.push(`SKU ${sku}`);
        if (barcode) extras.push(`Barcode ${barcode}`);
        if (category) extras.push(`Category ${category}`);
        if (unit) extras.push(`Unit ${unit}`);
        if (sellingPrice) extras.push(`Sell ${formatItemMoney(sellingPrice)}`);

        const extraText = extras.length ? ` • ${extras.join(" • ")}` : "";
        lines.push(`- ${name}${extraText} • Qty ${qty}`);
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
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.88)",
            padding: 18,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => setModalOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />

          <View
            style={{
              width: "100%",
              maxWidth: 560,
              alignSelf: "stretch",
              borderRadius: 28,
              backgroundColor: "rgba(10,14,22,0.985)",
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.42)",
              padding: 0,
              maxHeight: "84%",
              minHeight: 260,
              elevation: 30,
              overflow: "hidden",
            }}
          >
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
              alwaysBounceVertical={false}
            >
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.08)",
                  paddingBottom: 14,
                  marginBottom: 14,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.28)",
                      backgroundColor: "rgba(16,185,129,0.12)",
                    }}
                  >
                    <Ionicons name="receipt-outline" size={22} color={theme.colors.text} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22 }}>
                      Receipt
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
                      Stock movement / stock entry summary
                    </Text>
                  </View>
                </View>
              </View>

              {selected ? (
                <>
                  {(() => {
                    const { from, to } = routeLabel(selected);
                    const actor = actorLabel(selected);
                    const src = sourceLabel(selected);
                    const movementId = selected.movement_id ? selected.movement_id : selected.key;
                    const items = mergedItemsForReceipt(selected);
                    const actorKind = looksLikeEmail(actor) ? "Email" : "User";

                    return (
                      <>
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.08)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            borderRadius: 20,
                            padding: 14,
                            gap: 12,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
                                DATE / TIME (EAT)
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.text,
                                  fontWeight: "900",
                                  fontSize: 18,
                                  marginTop: 4,
                                }}
                              >
                                {prettyDateTimeEAT(selected.created_at)}
                              </Text>
                            </View>

                            <View
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: "rgba(16,185,129,0.24)",
                                backgroundColor: "rgba(16,185,129,0.10)",
                              }}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                                {prettyTypeLabel(selected.event_type)}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: "rgba(16,185,129,0.14)",
                              backgroundColor: "rgba(16,185,129,0.06)",
                              borderRadius: 18,
                              padding: 12,
                              gap: 10,
                            }}
                          >
                            <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>
                              ROUTE
                            </Text>

                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
                                  FROM
                                </Text>
                                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 17 }}>
                                  {from}
                                </Text>
                              </View>

                              <Ionicons name="arrow-forward" size={18} color={theme.colors.muted} />

                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
                                  TO
                                </Text>
                                <Text
                                  style={{
                                    color: theme.colors.text,
                                    fontWeight: "900",
                                    fontSize: 17,
                                    textAlign: "right",
                                  }}
                                >
                                  {to}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <View
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.08)",
                                backgroundColor: "rgba(255,255,255,0.025)",
                                borderRadius: 16,
                                padding: 12,
                              }}
                            >
                              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                SOURCE
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.text,
                                  fontWeight: "900",
                                  fontSize: 14,
                                  marginTop: 5,
                                }}
                              >
                                {src}
                              </Text>
                            </View>

                            <View
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.08)",
                                backgroundColor: "rgba(255,255,255,0.025)",
                                borderRadius: 16,
                                padding: 12,
                              }}
                            >
                              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                PROCESSED BY
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.text,
                                  fontWeight: "900",
                                  fontSize: 14,
                                  marginTop: 5,
                                }}
                                numberOfLines={2}
                              >
                                {actor}
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.muted,
                                  fontWeight: "800",
                                  fontSize: 11,
                                  marginTop: 4,
                                }}
                              >
                                {actorKind}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.08)",
                              backgroundColor: "rgba(255,255,255,0.025)",
                              borderRadius: 16,
                              padding: 12,
                              gap: 8,
                            }}
                          >
                            <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                              RECEIPT SUMMARY
                            </Text>

                            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                              {shortId(movementId)}
                            </Text>

                            <View style={{ flexDirection: "row", gap: 12 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                  PRODUCTS
                                </Text>
                                <Text
                                  style={{
                                    color: theme.colors.text,
                                    fontWeight: "900",
                                    fontSize: 17,
                                    marginTop: 2,
                                  }}
                                >
                                  {items.length}
                                </Text>
                              </View>

                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                  TOTAL UNITS
                                </Text>
                                <Text
                                  style={{
                                    color: theme.colors.text,
                                    fontWeight: "900",
                                    fontSize: 17,
                                    marginTop: 2,
                                  }}
                                >
                                  {clampInt(selected.total_units, 0)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        <View style={{ marginTop: 16 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                            Items
                          </Text>
                          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                            Product details included in this receipt
                          </Text>
                        </View>

                        <View style={{ marginTop: 10, gap: 10 }}>
                          {items.map((it: any, idx: number) => {
                            const name =
                              firstNonEmpty(it?.product_name, it?.name) ||
                              (clean(it?.product_id) ? shortId(clean(it?.product_id)) : "Item");

                            const qty = clampInt(it?.qty, 0);
                            const meta = itemMetaLine(it);

                            return (
                              <View
                                key={`${idx}`}
                                style={{
                                  borderWidth: 1,
                                  borderColor: "rgba(255,255,255,0.08)",
                                  backgroundColor: "rgba(255,255,255,0.03)",
                                  borderRadius: 18,
                                  padding: 14,
                                  gap: 10,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                  }}
                                >
                                  <Text
                                    style={{
                                      flex: 1,
                                      color: theme.colors.text,
                                      fontWeight: "900",
                                      fontSize: 17,
                                    }}
                                  >
                                    {name}
                                  </Text>

                                  <View
                                    style={{
                                      paddingHorizontal: 12,
                                      paddingVertical: 6,
                                      borderRadius: 999,
                                      borderWidth: 1,
                                      borderColor: "rgba(16,185,129,0.24)",
                                      backgroundColor: "rgba(16,185,129,0.10)",
                                    }}
                                  >
                                    <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                                      Qty {qty}
                                    </Text>
                                  </View>
                                </View>

                                {meta.length ? (
                                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                    {meta.map((x, i) => (
                                      <View
                                        key={`${idx}-${i}`}
                                        style={{
                                          paddingHorizontal: 10,
                                          paddingVertical: 6,
                                          borderRadius: 999,
                                          borderWidth: 1,
                                          borderColor: "rgba(255,255,255,0.08)",
                                          backgroundColor: "rgba(255,255,255,0.04)",
                                        }}
                                      >
                                        <Text style={{ color: theme.colors.text, fontWeight: "800", fontSize: 12 }}>
                                          {x}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>

                        <View style={{ marginTop: 16 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                            Audit IDs
                          </Text>
                          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                            Internal tracking references
                          </Text>
                        </View>

                        <View
                          style={{
                            marginTop: 10,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.08)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            borderRadius: 18,
                            padding: 14,
                            gap: 8,
                          }}
                        >
                          {selected.movement_id ? (
                            <View>
                              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                MOVEMENT ID
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.text,
                                  fontWeight: "800",
                                  fontSize: 14,
                                  marginTop: 4,
                                }}
                              >
                                {selected.movement_id}
                              </Text>
                            </View>
                          ) : null}

                          {(selected.rows ?? []).slice(0, 6).map((n, i) => (
                            <View key={n.id}>
                              <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11 }}>
                                NOTIFICATION ID {i + 1}
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.text,
                                  fontWeight: "800",
                                  fontSize: 14,
                                  marginTop: 4,
                                }}
                              >
                                {n.id}
                              </Text>
                            </View>
                          ))}

                          {(selected.rows ?? []).length > 6 ? (
                            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 2 }}>
                              +{(selected.rows ?? []).length - 6} more...
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                          <View style={{ flex: 1 }}>
                            <Pressable
                              onPress={shareSelected}
                              style={({ pressed }) => [
                                {
                                  paddingVertical: 14,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: theme.colors.emeraldBorder,
                                  backgroundColor: theme.colors.emeraldSoft,
                                  opacity: pressed ? 0.92 : 1,
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                                Share Receipt
                              </Text>
                            </Pressable>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Pressable
                              onPress={copySelected}
                              style={({ pressed }) => [
                                {
                                  paddingVertical: 14,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  backgroundColor: "rgba(255,255,255,0.05)",
                                  opacity: pressed ? 0.92 : 1,
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                                Copy
                              </Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={{ marginTop: 10 }}>
                          <Pressable
                            onPress={() => setModalOpen(false)}
                            style={({ pressed }) => [
                              {
                                paddingVertical: 14,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.card,
                                opacity: pressed ? 0.92 : 1,
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                              Close
                            </Text>
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
          </View>
        </View>
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

      <Card style={{ marginTop: 12, gap: 10 }}>
        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Notification Scope</Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.emeraldBorder,
            backgroundColor: "rgba(16,185,129,0.06)",
            borderRadius: theme.radius.lg,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
            Assigned Stores
          </Text>
          <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
            Active Store: <Text style={{ color: theme.colors.text }}>{activeStoreName ?? "—"}</Text>
          </Text>
          <Text style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6 }}>
            User ataona notifications zote za stores alizoassigniwa, hata kama hajaziswitch kwa sasa.
          </Text>
        </View>
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
                    backgroundColor: active ? theme.colors.emeraldSoft : theme.colors.card,
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
                backgroundColor: theme.colors.card,
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

        <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
          Notifications za stores zote ulizoassigniwa zinaonekana hapa, zikiwa zimegawanywa vizuri.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {groupedReceipts.currentStore.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
              Active Store ({groupedReceipts.currentStore.length})
            </Text>

            {groupedReceipts.currentStore.map((r) => {
              const targetStore = storeNameById[String(r.store_id)] ?? "Store";
              const isUnread = !r.is_read;
              const mvLabel = r.movement_id ? shortId(r.movement_id) : shortId(r.key);
              const mergedItems = mergedItemsForReceipt(r);
              const source = sourceLabel(r);
              const summary = compactReceiptSummary(r, mergedItems);

              return (
                <Pressable
                  key={r.key}
                  onPress={() => openReceipt(r)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
                >
                  <Card
                    style={{
                      borderColor: isUnread ? theme.colors.emeraldBorder : theme.colors.border,
                      backgroundColor: isUnread ? "rgba(16,185,129,0.07)" : theme.colors.card,
                      borderRadius: 18,
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}
                          numberOfLines={1}
                        >
                          {r.title}
                        </Text>

                        <Text
                          style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}
                          numberOfLines={1}
                        >
                          {targetStore}
                        </Text>

                        <Text
                          style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 4, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          {prettyTypeLabel(r.event_type)} • {fmtLocal(r.created_at)}
                        </Text>

                        <Text
                          style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}
                          numberOfLines={1}
                        >
                          {source}
                        </Text>

                        <Text
                          style={{ color: theme.colors.text, fontWeight: "800", marginTop: 6 }}
                          numberOfLines={1}
                        >
                          {summary}
                        </Text>

                        <Text
                          style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          Receipt: {mvLabel}
                        </Text>
                      </View>

                      {isUnread ? (
                        <View
                          style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                          }}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 11 }}>
                            NEW
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {groupedReceipts.otherStores.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
              Other Assigned Stores ({groupedReceipts.otherStores.length})
            </Text>

            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Hizi ni notifications za stores nyingine ulizoassigniwa ndani ya organization hii.
            </Text>

            {groupedReceipts.otherStores.map((r) => {
              const targetStore = storeNameById[String(r.store_id)] ?? "Store";
              const isUnread = !r.is_read;
              const mvLabel = r.movement_id ? shortId(r.movement_id) : shortId(r.key);
              const mergedItems = mergedItemsForReceipt(r);
              const source = sourceLabel(r);
              const summary = compactReceiptSummary(r, mergedItems);

              return (
                <Pressable
                  key={r.key}
                  onPress={() => openReceipt(r)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
                >
                  <Card
                    style={{
                      borderColor: isUnread ? theme.colors.emeraldBorder : theme.colors.border,
                      backgroundColor: isUnread ? "rgba(16,185,129,0.07)" : theme.colors.card,
                      borderRadius: 18,
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}
                          numberOfLines={1}
                        >
                          {r.title}
                        </Text>

                        <Text
                          style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}
                          numberOfLines={1}
                        >
                          {targetStore}
                        </Text>

                        <Text
                          style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 4, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          {prettyTypeLabel(r.event_type)} • {fmtLocal(r.created_at)}
                        </Text>

                        <Text
                          style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}
                          numberOfLines={1}
                        >
                          {source}
                        </Text>

                        <Text
                          style={{ color: theme.colors.text, fontWeight: "800", marginTop: 6 }}
                          numberOfLines={1}
                        >
                          {summary}
                        </Text>

                        <Text
                          style={{ color: theme.colors.faint, fontWeight: "800", marginTop: 6, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          Receipt: {mvLabel}
                        </Text>
                      </View>

                      {isUnread ? (
                        <View
                          style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: theme.colors.emeraldBorder,
                            backgroundColor: theme.colors.emeraldSoft,
                          }}
                        >
                          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 11 }}>
                            NEW
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {groupedReceipts.currentStore.length === 0 && groupedReceipts.otherStores.length === 0 ? (
          <Card
            style={{
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 15 }}>
              No notifications found
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
              Hakuna notifications kwa stores ulizoassigniwa kwa sasa.
            </Text>
          </Card>
        ) : null}
      </View>

      <View style={{ height: 40 }} />
    </Screen>
  );
}