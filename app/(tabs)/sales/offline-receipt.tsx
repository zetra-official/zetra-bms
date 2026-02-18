// app/(tabs)/sales/offline-receipt.tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";

import { getQueuedSaleByClientId } from "../../../src/offline/salesQueue";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtTZS(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "currency",
      currency: "TZS",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `TZS ${Math.round(n).toLocaleString()}`;
  }
}

function shortId(id: string) {
  const s = (id ?? "").trim();
  if (!s) return "—";
  return s.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type OfflineDetail = {
  client_sale_id: string;
  store_id: string;
  created_at: string;

  status: "PENDING" | "SENDING" | "SYNCED" | "FAILED";
  last_error?: string | null;

  payload: any;
};

export default function OfflineReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ storeId?: string | string[]; clientSaleId?: string | string[] }>();

  const storeId = (one(params.storeId) ?? "").trim();
  const clientSaleId = (one(params.clientSaleId) ?? "").trim();

  const { activeOrgName, activeStoreName } = useOrg();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfflineDetail | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!storeId) throw new Error("Missing storeId");
      if (!clientSaleId) throw new Error("Missing clientSaleId");

      const found: any = await getQueuedSaleByClientId(storeId, clientSaleId);
      if (!found) throw new Error("Queued sale not found (maybe already synced/removed).");

      setDetail(found as any);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load offline receipt");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, clientSaleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const receiptNo = useMemo(() => shortId(clientSaleId), [clientSaleId]);

  const when = useMemo(() => {
    const t = detail?.created_at;
    if (!t) return "—";
    try {
      return new Date(t).toLocaleString();
    } catch {
      return String(t);
    }
  }, [detail?.created_at]);

  const payload = detail?.payload ?? null;
  const items = useMemo(() => (Array.isArray(payload?.items) ? payload.items : []), [payload?.items]);

  const subtotal = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const q = Math.trunc(Number(it?.qty ?? 0));
      const p = Number(it?.unit_price ?? 0);
      if (Number.isFinite(q) && q > 0 && Number.isFinite(p) && p > 0) sum += q * p;
    }
    return Math.round(sum);
  }, [items]);

  const discountType = String(payload?.discount_type ?? "").toUpperCase();
  const discountVal = toNum(payload?.discount_value ?? 0);

  const discountAmount = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (!(discountVal > 0)) return 0;

    if (discountType === "PERCENT") {
      const pct = Math.min(100, Math.max(0, discountVal));
      return Math.min(subtotal, Math.round((subtotal * pct) / 100));
    }
    if (discountType === "FIXED") {
      return Math.min(subtotal, Math.round(discountVal));
    }
    return 0;
  }, [subtotal, discountType, discountVal]);

  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  const totalQty = useMemo(() => {
    let q = 0;
    for (const it of items) q += Math.trunc(Number(it?.qty ?? 0));
    return q;
  }, [items]);

  const paymentMethod = String(payload?.payment_method ?? "CASH").toUpperCase();
  const paymentChannel = String(payload?.payment_channel ?? "").trim();
  const reference = String(payload?.reference ?? "").trim();

  const paidAmount = useMemo(() => {
    const p = toNum(payload?.paid_amount ?? 0);
    return Math.max(0, Math.min(total, p));
  }, [payload?.paid_amount, total]);

  const isCredit = useMemo(() => {
    if (paymentMethod === "CREDIT") return true;
    // partial payment => credit
    return paidAmount < total;
  }, [paymentMethod, paidAmount, total]);

  const due = useMemo(() => (isCredit ? Math.max(0, total - paidAmount) : 0), [isCredit, total, paidAmount]);

  const note = String(payload?.note ?? "").trim() || null;

  const shareReceipt = useCallback(async () => {
    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";

    const header = [
      "🧾 ZETRA BMS OFFLINE RECEIPT",
      `Receipt #${receiptNo}`,
      "STATUS: PENDING OFFLINE",
      "",
      `Business: ${org}`,
      `Store: ${store}`,
      `When: ${when}`,
      "",
      `Payment: ${paymentMethod}${paymentChannel ? ` (${paymentChannel})` : ""}`,
      reference ? `Reference: ${reference}` : null,
      "",
    ].filter(Boolean) as string[];

    const body =
      items.length === 0
        ? ["Items: —", ""]
        : [
            `Items (${items.length}) • Qty (${totalQty})`,
            ...items.map((it: any) => {
              const q = Math.trunc(Number(it?.qty ?? 0));
              const p = Number(it?.unit_price ?? 0);
              const lt = Math.round(q * p);
              const name = String(it?.name ?? it?.product_name ?? "Product");
              const sku = it?.sku ? ` (SKU: ${String(it.sku)})` : "";
              const unit = it?.unit ? ` ${String(it.unit)}` : "";
              return `- ${name}${sku} | ${q}${unit} × ${fmtTZS(p)} = ${fmtTZS(lt)}`;
            }),
            "",
          ];

    const money: string[] = [];
    money.push(`SUBTOTAL: ${fmtTZS(subtotal)}`);
    if (discountAmount > 0) {
      const dLabel =
        discountType === "PERCENT" ? `${discountVal}%` : discountType === "FIXED" ? fmtTZS(discountVal) : "";
      money.push(`DISCOUNT: -${fmtTZS(discountAmount)} ${dLabel ? `(${dLabel})` : ""}`);
    }
    money.push(`TOTAL: ${fmtTZS(total)}`);
    if (isCredit) {
      money.push(`PAID: ${fmtTZS(paidAmount)}`);
      money.push(`DUE (CREDIT): ${fmtTZS(due)}`);
    }
    money.push("");

    const footer = [
      note ? `NOTE: ${note}` : null,
      "",
      "⚠️ Offline sale — itatokea kwenye receipt ya kawaida baada ya sync (mtandao ukirudi).",
    ].filter(Boolean) as string[];

    const message = [...header, ...body, ...money, ...footer].join("\n");
    try {
      await Share.share({ message });
    } catch {
      // ignore
    }
  }, [
    activeOrgName,
    activeStoreName,
    receiptNo,
    when,
    paymentMethod,
    paymentChannel,
    reference,
    items,
    totalQty,
    subtotal,
    discountAmount,
    discountType,
    discountVal,
    total,
    isCredit,
    paidAmount,
    due,
    note,
  ]);

  return (
    <Screen scroll bottomPad={180}>
      <View style={{ flex: 1, gap: 14 }}>
        {/* Header */}
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
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "900", color: theme.colors.text }}>
              Offline Receipt
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Receipt #{receiptNo} • PENDING OFFLINE
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: "rgba(245,158,11,0.35)",
              backgroundColor: "rgba(245,158,11,0.12)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>OFFLINE</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading offline receipt...
            </Text>
          </View>
        ) : err ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
            <Button title="Retry" onPress={load} variant="primary" />
            <Button title="Back" onPress={() => router.back()} variant="secondary" />
          </Card>
        ) : (
          <>
            {/* Top meta */}
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Business</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {activeOrgName ?? "—"}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {activeStoreName ?? "—"}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>When</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{when}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Payment</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    {paymentMethod}
                    {paymentChannel ? ` • ${paymentChannel}` : ""}
                  </Text>
                </View>
              </View>

              {!!reference && (
                <View style={{ marginTop: 2 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Reference</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
                    {reference}
                  </Text>
                </View>
              )}

              {!!detail?.last_error && (
                <View style={{ marginTop: 2 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Last Sync Error</Text>
                  <Text style={{ color: theme.colors.dangerText, fontWeight: "900", marginTop: 6 }}>
                    {String(detail.last_error)}
                  </Text>
                </View>
              )}
            </Card>

            {/* Items */}
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Items ({items.length})
                </Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Qty ({totalQty})</Text>
              </View>

              {items.length === 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>No items found.</Text>
              ) : (
                items.map((it: any, idx: number) => {
                  const q = Math.trunc(Number(it?.qty ?? 0));
                  const p = Number(it?.unit_price ?? 0);
                  const lt = Math.round(q * p);

                  const name = String(it?.name ?? it?.product_name ?? "Product");
                  const sku = it?.sku ? String(it.sku) : null;
                  const unit = it?.unit ? String(it.unit) : null;

                  return (
                    <View
                      key={`${String(it?.product_id ?? "x")}-${idx}`}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 10,
                        paddingVertical: 12,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }} numberOfLines={1}>
                          {name}
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                          SKU: {sku ?? "—"}{unit ? ` • Unit: ${unit}` : ""}
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                          {q} × {fmtTZS(p)}
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtTZS(lt)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>

            {/* Totals */}
            <Card style={{ gap: 12 }}>
              <View
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: theme.radius.xl,
                  borderWidth: 1,
                  borderColor: "rgba(52,211,153,0.35)",
                  backgroundColor: "rgba(52,211,153,0.10)",
                }}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Subtotal</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
                  {fmtTZS(subtotal)}
                </Text>
              </View>

              {discountAmount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Discount</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                    -{fmtTZS(discountAmount)}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtTZS(total)}</Text>
              </View>

              {isCredit && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Paid</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtTZS(paidAmount)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Due (Credit)</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtTZS(due)}</Text>
                  </View>
                </>
              )}

              {!!note && (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Note</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>{note}</Text>
                </View>
              )}

              <Button title="Share Receipt" onPress={shareReceipt} variant="secondary" />
              <Button title="Back to History" onPress={() => router.replace("/(tabs)/sales/history")} variant="primary" />
              <Button title="Back" onPress={() => router.back()} variant="secondary" />

              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                ⚠️ Hii ni receipt ya OFFLINE. Itabadilika kuwa receipt ya kawaida baada ya sync.
              </Text>
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}