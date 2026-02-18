import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";

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

function parseDiscountFromNote(note: string | null | undefined) {
  const raw = String(note ?? "");
  const idx = raw.indexOf("DISCOUNT:");
  if (idx < 0) return null;

  const tag = raw.slice(idx).trim();

  const textMatch = tag.match(/DISCOUNT:\s*"(.*?)"/);
  const amtMatch = tag.match(/DISCOUNT_AMOUNT:\s*([0-9]+)/);
  const subMatch = tag.match(/SUBTOTAL:\s*([0-9]+)/);

  const discountText = (textMatch?.[1] ?? "").trim();
  const discountAmount = Number(amtMatch?.[1] ?? NaN);
  const subtotal = Number(subMatch?.[1] ?? NaN);

  const okAmt = Number.isFinite(discountAmount) ? discountAmount : 0;
  const okSub = Number.isFinite(subtotal) ? subtotal : NaN;

  return {
    discountText: discountText || "—",
    discountAmount: Math.max(0, Math.round(okAmt)),
    subtotal: Number.isFinite(okSub) ? Math.max(0, Math.round(okSub)) : null,
    tag,
  };
}

function stripDiscountTag(note: string | null | undefined) {
  const raw = String(note ?? "").trim();
  if (!raw) return null;
  const idx = raw.indexOf("DISCOUNT:");
  if (idx < 0) return raw;
  const before = raw.slice(0, idx).trim();
  return before || null;
}

function parseCustomerFromNote(note: string | null | undefined) {
  const raw = String(note ?? "");
  if (!raw.trim()) return { name: null as string | null, phone: null as string | null };

  const clean = stripDiscountTag(raw) ?? raw;

  const lines = String(clean)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  let name: string | null = null;
  let phone: string | null = null;

  for (const line of lines) {
    const m1 = line.match(/^(customer|mteja)\s*:\s*(.+)$/i);
    if (m1?.[2] && !name) name = String(m1[2]).trim();

    const m2 = line.match(/^(phone|simu|namba)\s*:\s*(.+)$/i);
    if (m2?.[2] && !phone) phone = String(m2[2]).trim();
  }

  return { name: name || null, phone: phone || null };
}

type SaleDetail = {
  sale_id?: string;
  id?: string;
  created_at?: string;

  payment_method?: string | null;
  payment_channel?: string | null;
  reference?: string | null;

  note?: string | null;

  total_amount?: number | null;
  paid_amount?: number | null;

  customer_full_name?: string | null;
  customer_phone?: string | null;

  created_by?: string | null;
  sold_by_name?: string | null;
  sold_by_role?: string | null;

  items?: Array<{
    product_id: string;
    product_name?: string | null;
    sku?: string | null;
    qty: number;
    unit_price?: number | null;
    line_total?: number | null;
  }>;
};

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string | string[] }>();
  const saleId = (one(params.saleId) ?? "").trim();

  const { activeOrgName, activeStoreName, activeRole } = useOrg();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!saleId) throw new Error("Missing saleId");

      const res = await supabase.rpc(
        "get_sale_detail",
        { p_sale_id: saleId } as any
      );

      if (res.error) throw res.error;

      const d = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      setDetail(d as any);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load receipt");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const receiptNo = useMemo(() => shortId(saleId), [saleId]);

  const when = useMemo(() => {
    const t = detail?.created_at;
    if (!t) return "—";
    try {
      return new Date(t).toLocaleString();
    } catch {
      return String(t);
    }
  }, [detail?.created_at]);

  const items = detail?.items ?? [];

  const computedTotal = useMemo(() => {
    const dbTotal = Number(detail?.total_amount ?? NaN);
    if (Number.isFinite(dbTotal)) return dbTotal;
    return items.reduce((a, it) => a + Number(it.line_total ?? 0), 0);
  }, [detail?.total_amount, items]);

  const computedQty = useMemo(() => items.reduce((a, it) => a + Number(it.qty ?? 0), 0), [items]);

  const payLabel = (detail?.payment_method ?? "CASH").toUpperCase();
  const channelLabel = (detail?.payment_channel ?? "").trim();
  const referenceLabel = (detail?.reference ?? "").trim();

  const discountMeta = useMemo(() => parseDiscountFromNote(detail?.note), [detail?.note]);
  const cleanNote = useMemo(() => stripDiscountTag(detail?.note), [detail?.note]);

  const isCredit = useMemo(() => payLabel === "CREDIT", [payLabel]);

  const parsedCustomer = useMemo(() => parseCustomerFromNote(detail?.note), [detail?.note]);

  const customerName = useMemo(() => {
    const n = String(detail?.customer_full_name ?? "").trim();
    return n || parsedCustomer.name;
  }, [detail?.customer_full_name, parsedCustomer.name]);

  const customerPhone = useMemo(() => {
    const p = String(detail?.customer_phone ?? "").trim();
    return p || parsedCustomer.phone;
  }, [detail?.customer_phone, parsedCustomer.phone]);

  const soldByLabel = useMemo(() => {
    const name = String(detail?.sold_by_name ?? "").trim();
    const role = String(detail?.sold_by_role ?? "").trim();

    if (name && role) return `${role.toUpperCase()} • ${name}`;
    if (name) return name;

    const r = (activeRole ?? "staff").toUpperCase();
    return `${r} (You)`;
  }, [detail?.sold_by_name, detail?.sold_by_role, activeRole]);

  const paidAmount = useMemo(() => {
    if (!isCredit) return computedTotal;
    const p = Number(detail?.paid_amount ?? NaN);
    if (!Number.isFinite(p)) return 0;
    return Math.max(0, Math.min(computedTotal, p));
  }, [isCredit, detail?.paid_amount, computedTotal]);

  const dueAmount = useMemo(() => {
    if (!isCredit) return 0;
    return Math.max(0, computedTotal - Math.max(0, paidAmount));
  }, [isCredit, computedTotal, paidAmount]);

  const paymentTitle = useMemo(() => (isCredit ? "CREDIT" : payLabel), [isCredit, payLabel]);

  const shareReceipt = useCallback(async () => {
    if (!saleId) return;

    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";

    const header = [
      "🧾 ZETRA BMS RECEIPT",
      `Receipt #${receiptNo}`,
      `Payment: ${paymentTitle}`,
      channelLabel ? `Channel: ${channelLabel}` : null,
      referenceLabel ? `Reference: ${referenceLabel}` : null,
      "",
      `Business: ${org}`,
      `Store: ${store}`,
      `When: ${when}`,
      `Sold By: ${soldByLabel}`,
      "",
    ].filter(Boolean) as string[];

    if (isCredit) {
      header.push(`Customer: ${customerName || "—"}`);
      if (customerPhone) header.push(`Phone: ${customerPhone}`);
      header.push("");
    }

    const body =
      items.length === 0
        ? ["Items: —", ""]
        : [
            `Items (${items.length}) • Qty (${computedQty})`,
            ...items.map((it) => {
              const unitPrice = Number(it.unit_price ?? 0);
              const lineTotal = Number(it.line_total ?? unitPrice * Number(it.qty ?? 0));
              const name = it.product_name ?? "Product";
              const sku = it.sku ? ` (SKU: ${it.sku})` : "";
              return `- ${name}${sku} | ${it.qty} × ${fmtTZS(unitPrice)} = ${fmtTZS(lineTotal)}`;
            }),
            "",
          ];

    const moneyBlock: string[] = [];

    if (discountMeta) {
      const subtotal = discountMeta.subtotal;
      if (typeof subtotal === "number") moneyBlock.push(`SUBTOTAL: ${fmtTZS(subtotal)}`);
      moneyBlock.push(`DISCOUNT: -${fmtTZS(discountMeta.discountAmount)} (${discountMeta.discountText})`);
      moneyBlock.push(`TOTAL (AFTER DISCOUNT): ${fmtTZS(computedTotal)}`);
      moneyBlock.push("");
    }

    if (isCredit) {
      if (!discountMeta) moneyBlock.push(`TOTAL: ${fmtTZS(computedTotal)}`);
      moneyBlock.push("");
      moneyBlock.push(`PAID: ${fmtTZS(paidAmount)}`);
      moneyBlock.push(`DUE (CREDIT): ${fmtTZS(dueAmount)}`);
      moneyBlock.push(`STATUS: ${dueAmount > 0 ? "OUTSTANDING" : "CLEARED"}`);
      moneyBlock.push("");
    }

    const footer = [
      !discountMeta && !isCredit ? `TOTAL: ${fmtTZS(computedTotal)}` : null,
      cleanNote ? "" : null,
      cleanNote ? `NOTE: ${cleanNote}` : null,
      "",
      "Thank you for shopping with us 🙏",
    ].filter(Boolean) as string[];

    const message = [...header, ...body, ...moneyBlock, ...footer].join("\n");

    try {
      await Share.share({ message });
    } catch {
      // ignore
    }
  }, [
    saleId,
    activeOrgName,
    activeStoreName,
    receiptNo,
    paymentTitle,
    channelLabel,
    referenceLabel,
    when,
    soldByLabel,
    isCredit,
    customerName,
    customerPhone,
    items,
    computedQty,
    computedTotal,
    discountMeta,
    cleanNote,
    paidAmount,
    dueAmount,
  ]);

  return (
    <Screen scroll bottomPad={180}>
      <View style={{ flex: 1, gap: 14 }}>
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
            <Text style={{ fontSize: 28, fontWeight: "900", color: theme.colors.text }}>Receipt</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Receipt #{receiptNo}</Text>
          </View>

          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: isCredit ? "rgba(251,191,36,0.35)" : "rgba(52,211,153,0.35)",
              backgroundColor: isCredit ? "rgba(251,191,36,0.10)" : "rgba(52,211,153,0.10)",
            }}
          >
            <Text
              style={{
                color: isCredit ? "rgba(251,191,36,1)" : theme.colors.emerald,
                fontWeight: "900",
              }}
            >
              {paymentTitle}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 18, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Loading receipt...
            </Text>
          </View>
        ) : err ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.dangerText, fontWeight: "900" }}>{err}</Text>
            <Button title="Retry" onPress={load} variant="primary" />
          </Card>
        ) : (
          <>
            <Card
              style={{
                gap: 10,
                borderWidth: 1,
                borderColor: isCredit ? "rgba(251,191,36,0.22)" : "rgba(52,211,153,0.22)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Business</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{activeOrgName ?? "—"}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Store</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{activeStoreName ?? "—"}</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>When</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{when}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Sold By</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{soldByLabel}</Text>
                </View>
              </View>

              {(channelLabel || referenceLabel) && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Channel</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{channelLabel || "—"}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Reference</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{referenceLabel || "—"}</Text>
                  </View>
                </View>
              )}

              {(isCredit || !!customerName || !!customerPhone) && (
                <View style={{ marginTop: 2 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Customer</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
                    {customerName || "—"}
                  </Text>
                  {!!customerPhone && (
                    <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 6 }}>
                      Phone: {customerPhone}
                    </Text>
                  )}
                </View>
              )}

              {!!cleanNote && (
                <View style={{ marginTop: 2 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>Note</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>{cleanNote}</Text>
                </View>
              )}
            </Card>

            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                  Items ({items.length})
                </Text>
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Qty ({computedQty})</Text>
              </View>

              {items.length === 0 ? (
                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>No items found.</Text>
              ) : (
                items.map((it, idx) => {
                  const unitPrice = Number(it.unit_price ?? 0);
                  const lineTotal = Number(it.line_total ?? unitPrice * Number(it.qty ?? 0));

                  return (
                    <View
                      key={`${it.product_id}-${idx}`}
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
                          {it.product_name ?? "Product"}
                        </Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>SKU: {it.sku ?? "—"}</Text>

                        <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                          {Number(it.qty ?? 0)} × {fmtTZS(unitPrice)}
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
                        <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{fmtTZS(lineTotal)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>

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
                <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>Total Amount</Text>
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 20 }}>
                  {fmtTZS(computedTotal)}
                </Text>
              </View>

              <Button title="Share Receipt" onPress={shareReceipt} variant="secondary" />
              <Button
                title="Back to History"
                onPress={() => router.replace("/(tabs)/sales/history")}
                variant="primary"
              />
              <Button title="Back" onPress={() => router.back()} variant="secondary" />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}