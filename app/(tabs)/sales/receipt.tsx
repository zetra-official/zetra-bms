import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";

import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
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

  let cleaned = raw;

  const discountIdx = cleaned.indexOf("DISCOUNT:");
  if (discountIdx >= 0) {
    cleaned = cleaned.slice(0, discountIdx).trim();
  }

  cleaned = cleaned
    .split("\n")
    .map((x) => x.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^CASHIER_HANDOFF_ID\s*:/i.test(line)) return false;
      if (/^SPLIT_PAYMENT\s*:/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();

  return cleaned || null;
}
function parseSplitPaymentFromNote(note: string | null | undefined) {
  const raw = String(note ?? "");
  const m = raw.match(/SPLIT_PAYMENT:\s*CASH=([0-9]+)\s*\|\s*MOBILE=([0-9]+)\s*\|\s*BANK=([0-9]+)/i);

  if (!m) return null;

  const cash = Number(m[1] ?? 0);
  const mobile = Number(m[2] ?? 0);
  const bank = Number(m[3] ?? 0);

  return {
    cash: Number.isFinite(cash) ? Math.max(0, Math.round(cash)) : 0,
    mobile: Number.isFinite(mobile) ? Math.max(0, Math.round(mobile)) : 0,
    bank: Number.isFinite(bank) ? Math.max(0, Math.round(bank)) : 0,
  };
}
function parseCustomerFromNote(note: string | null | undefined) {
  const raw = String(note ?? "");
  if (!raw.trim()) return { name: null as string | null, phone: null as string | null };

  const clean = stripDiscountTag(raw) ?? "";

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

function darDateKey(input?: string | null) {
  if (!input) return null;

  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function isSameDayDar(input?: string | null) {
  const saleKey = darDateKey(input);
  const nowKey = darDateKey(new Date().toISOString());
  if (!saleKey || !nowKey) return false;
  return saleKey === nowKey;
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

  edited_at?: string | null;
  edited_by?: string | null;
  edited_by_name?: string | null;
  edit_count?: number | null;
  can_edit_same_day?: boolean | null;

  items?: Array<{
    product_id: string;
    product_name?: string | null;
    sku?: string | null;
    qty: number;
    unit_price?: number | null;
    line_total?: number | null;
  }>;
};

function MetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.07)",
        backgroundColor: "rgba(255,255,255,0.03)",
      }}
    >
      <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 11 }}>{label}</Text>
      <Text
        style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4, fontSize: 13 }}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function MoneyTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: highlight ? "rgba(52,211,153,0.26)" : "rgba(255,255,255,0.07)",
        backgroundColor: highlight ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
      }}
    >
      <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 11 }}>{label}</Text>
      <Text
        style={{
          color: theme.colors.text,
          fontWeight: "900",
          fontSize: 15,
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string | string[] }>();
  const saleId = (one(params.saleId) ?? "").trim();
  const { width } = useWindowDimensions();

  const { activeOrgId, activeOrgName, activeStoreName, activeRole } = useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const isDesktopWeb = Platform.OS === "web" && width >= 1180;
  const isWideWeb = Platform.OS === "web" && width >= 900;

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      if (!saleId) throw new Error("Missing saleId");

      const res = await supabase.rpc("get_sale_detail", { p_sale_id: saleId } as any);
      if (res.error) throw res.error;

      const d = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;

      setDetail(
        d
          ? ({
              ...d,
              edited_at: d?.edited_at ?? null,
              edited_by: d?.edited_by ?? null,
              edited_by_name: d?.edited_by_name ?? null,
              edit_count: d?.edit_count ?? 0,
              can_edit_same_day: d?.can_edit_same_day ?? false,
            } as any)
          : null
      );
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

  const computedQty = useMemo(
    () => items.reduce((a, it) => a + Number(it.qty ?? 0), 0),
    [items]
  );

const payLabel = (detail?.payment_method ?? "CASH").toUpperCase();
  const channelLabel = (detail?.payment_channel ?? "").trim();
  const referenceLabel = (detail?.reference ?? "").trim();

  const discountMeta = useMemo(() => parseDiscountFromNote(detail?.note), [detail?.note]);
  const splitPaymentMeta = useMemo(() => parseSplitPaymentFromNote(detail?.note), [detail?.note]);
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

  const dbCanEditSameDay = !!detail?.can_edit_same_day;
  const uiSameDayGuard = useMemo(() => isSameDayDar(detail?.created_at), [detail?.created_at]);
  const canEditSameDay = dbCanEditSameDay && uiSameDayGuard;

  const editCountLabel = useMemo(() => {
    const n = Number(detail?.edit_count ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }, [detail?.edit_count]);

  const editedByLabel = useMemo(() => {
    const name = String(detail?.edited_by_name ?? "").trim();
    const raw = String(detail?.edited_by ?? "").trim();

    if (name) return name;
    if (raw) return raw;
    return "—";
  }, [detail?.edited_by_name, detail?.edited_by]);

  const editedAtLabel = useMemo(() => {
    const t = String(detail?.edited_at ?? "").trim();
    if (!t) return "—";
    try {
      return new Date(t).toLocaleString();
    } catch {
      return t;
    }
  }, [detail?.edited_at]);

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

  const paymentTitle = useMemo(
    () => (splitPaymentMeta ? "SPLIT" : isCredit ? "CREDIT" : payLabel),
    [splitPaymentMeta, isCredit, payLabel]
  );

  const deleteSameDay = useCallback(async () => {
    if (!saleId) return;

    if (!canEditSameDay) {
      Alert.alert(
        "Delete closed",
        "Risiti hii haiwezi kufutwa. Same-day rule ni ya leo tu kwa timezone ya Africa/Dar_es_Salaam."
      );
      return;
    }

    if (deleting) return;

    const runDelete = async () => {
      try {
        setDeleting(true);

        const { data, error } = await supabase.rpc("delete_sale_same_day_v1", {
          p_sale_id: saleId,
        } as any);

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        const restoredQty = Number(row?.restored_qty ?? 0);

        Alert.alert("Deleted", `Receipt imefutwa vizuri. Stock restored: ${restoredQty}.`);

        router.replace("/(tabs)/sales/history");
      } catch (e: any) {
        Alert.alert("Delete failed", e?.message ?? "Failed to delete same-day receipt");
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(
        "Delete Same Day\n\nUkifuta risiti hii, items zote zitarudi store na sale itaondoka kabisa. Uko sure?"
      );

      if (!ok) return;

      await runDelete();
      return;
    }

    Alert.alert(
      "Delete Same Day",
      "Ukifuta risiti hii, items zote zitarudi store na sale itaondoka kabisa. Uko sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: runDelete,
        },
      ]
    );
  }, [saleId, canEditSameDay, deleting, router]);

  const shareReceipt = useCallback(async () => {
    if (!saleId) return;

    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";

    const header = [
     "🧾 ZETRA BMS INVOICE RECEIPT",
      `Store: ${store}`,
      `No. ${receiptNo}`,
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
if (splitPaymentMeta) {
      header.push(`Cash Paid: ${fmtMoney(splitPaymentMeta.cash)}`);
      header.push(`Mobile Paid: ${fmtMoney(splitPaymentMeta.mobile)}`);
      header.push(`Bank Paid: ${fmtMoney(splitPaymentMeta.bank)}`);
      header.push("");
    }
    if (customerName || customerPhone) {
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
              return `- ${name}${sku} | ${it.qty} × ${fmtMoney(unitPrice)} = ${fmtMoney(lineTotal)}`;
            }),
            "",
          ];

    const moneyBlock: string[] = [];

    if (discountMeta) {
      const subtotal = discountMeta.subtotal;
      if (typeof subtotal === "number") moneyBlock.push(`SUBTOTAL: ${fmtMoney(subtotal)}`);
      moneyBlock.push(
        `DISCOUNT: -${fmtMoney(discountMeta.discountAmount)} (${discountMeta.discountText})`
      );
      moneyBlock.push(`TOTAL (AFTER DISCOUNT): ${fmtMoney(computedTotal)}`);
      moneyBlock.push("");
    }

    if (isCredit) {
      if (!discountMeta) moneyBlock.push(`TOTAL: ${fmtMoney(computedTotal)}`);
      moneyBlock.push("");
      moneyBlock.push(`PAID: ${fmtMoney(paidAmount)}`);
      moneyBlock.push(`DUE (CREDIT): ${fmtMoney(dueAmount)}`);
      moneyBlock.push(`STATUS: ${dueAmount > 0 ? "OUTSTANDING" : "CLEARED"}`);
      moneyBlock.push("");
    }

    const footer = [
      !discountMeta && !isCredit ? `TOTAL MONEY IN: ${fmtMoney(computedTotal)}` : null,
      cleanNote ? "" : null,
      cleanNote ? `NOTE: ${cleanNote}` : null,
      "",
      "Thank you for shopping with us 🙏",
    ].filter(Boolean) as string[];

    const message = [...header, ...body, ...moneyBlock, ...footer].join("\n");

    try {
      await Share.share({ message });
    } catch {}
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
    splitPaymentMeta,
    cleanNote,
    paidAmount,
    dueAmount,
    fmtMoney,
  ]);

  const shareReceiptPdf = useCallback(async () => {
    if (!saleId) return;

    const org = activeOrgName ?? "—";
    const store = activeStoreName ?? "—";

    const itemsHtml =
      items.length === 0
        ? `<tr><td colspan="4">No items found.</td></tr>`
        : items
            .map((it) => {
              const unitPrice = Number(it.unit_price ?? 0);
              const lineTotal = Number(it.line_total ?? unitPrice * Number(it.qty ?? 0));
              return `
                <tr>
                  <td>
                    <strong>${String(it.product_name ?? "Product")}</strong><br/>
                    <span>SKU: ${String(it.sku ?? "—")}</span>
                  </td>
                  <td>${Number(it.qty ?? 0)}</td>
                  <td>${fmtMoney(unitPrice)}</td>
                  <td><strong>${fmtMoney(lineTotal)}</strong></td>
                </tr>
              `;
            })
            .join("");

    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            .top { border-bottom: 2px solid #10b981; padding-bottom: 14px; margin-bottom: 18px; }
            .store { color: #047857; font-size: 14px; font-weight: 800; letter-spacing: .4px; }
            h1 { margin: 6px 0 4px; font-size: 28px; }
            .no { color: #6b7280; font-weight: 700; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0; }
            .box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; }
            .label { color: #6b7280; font-size: 12px; font-weight: 700; }
            .value { margin-top: 4px; font-weight: 800; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th { text-align: left; background: #f3f4f6; padding: 10px; font-size: 12px; }
            td { border-bottom: 1px solid #e5e7eb; padding: 10px; vertical-align: top; }
            .total { margin-top: 18px; border: 1px solid #10b981; background: #ecfdf5; border-radius: 14px; padding: 14px; }
            .total-label { color: #047857; font-weight: 800; }
            .total-value { font-size: 24px; font-weight: 900; margin-top: 6px; }
            .footer { margin-top: 24px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="top">
            <div class="store">${store}</div>
            <h1>Invoice Receipt</h1>
            <div class="no">No. ${receiptNo}</div>
          </div>

          <div class="grid">
            <div class="box"><div class="label">Business</div><div class="value">${org}</div></div>
            <div class="box"><div class="label">Store</div><div class="value">${store}</div></div>
            <div class="box"><div class="label">When</div><div class="value">${when}</div></div>
            <div class="box"><div class="label">Payment</div><div class="value">${paymentTitle}</div></div>
            <div class="box"><div class="label">Sold By</div><div class="value">${soldByLabel}</div></div>
            ${
              customerName || customerPhone
                ? `<div class="box"><div class="label">Customer</div><div class="value">${customerName || "—"}${customerPhone ? `<br/><span>${customerPhone}</span>` : ""}</div></div>`
                : ""
            }
            ${channelLabel ? `<div class="box"><div class="label">Channel</div><div class="value">${channelLabel}</div></div>` : ""}
            ${referenceLabel ? `<div class="box"><div class="label">Reference</div><div class="value">${referenceLabel}</div></div>` : ""}
          </div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="total">
            <div class="total-label">Total Money In</div>
            <div class="total-value">${fmtMoney(computedTotal)}</div>
          </div>

          <div class="footer">Generated by ZETRA BMS • Thank you for shopping with us.</div>
        </body>
      </html>
    `;

    try {
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Invoice Receipt PDF",
      });
    } catch (e: any) {
      Alert.alert("PDF failed", e?.message ?? "Failed to create PDF invoice receipt.");
    }
  }, [
    saleId,
    activeOrgName,
    activeStoreName,
    receiptNo,
    items,
    fmtMoney,
    computedTotal,
    when,
    paymentTitle,
soldByLabel,
customerName,
customerPhone,
channelLabel,
referenceLabel,
  ]);
  const headerCard = (
    <Card
      style={{
        gap: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: isCredit ? "rgba(251,191,36,0.18)" : "rgba(52,211,153,0.18)",
        backgroundColor: "rgba(255,255,255,0.03)",
      }}
    >
      <View
        style={{
          flexDirection: isWideWeb ? "row" : "column",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <MetaBlock label="Business" value={activeOrgName ?? "—"} />
        <MetaBlock label="Store" value={activeStoreName ?? "—"} />
      </View>

      <View
        style={{
          flexDirection: isWideWeb ? "row" : "column",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <MetaBlock label="When" value={when} />
        <MetaBlock label="Sold By" value={soldByLabel} />
      </View>

      {(channelLabel || referenceLabel) && (
        <View
          style={{
            flexDirection: isWideWeb ? "row" : "column",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <MetaBlock label="Channel" value={channelLabel || "—"} />
          <MetaBlock label="Reference" value={referenceLabel || "—"} />
        </View>
      )}

      {(isCredit || !!customerName || !!customerPhone) && (
        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.07)",
            backgroundColor: "rgba(255,255,255,0.03)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
            Customer
          </Text>
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

      {(editCountLabel > 0 || dbCanEditSameDay || uiSameDayGuard) && (
        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: canEditSameDay ? "rgba(52,211,153,0.24)" : "rgba(255,255,255,0.07)",
            backgroundColor: canEditSameDay ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 11 }}>
            Edit Status
          </Text>

          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 4, fontSize: 13 }}>
            {canEditSameDay ? "Same-day edit allowed" : "Edit window closed"}
          </Text>

          {!uiSameDayGuard ? (
            <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
              Local guard: receipt si ya leo kwa timezone ya Africa/Dar_es_Salaam.
            </Text>
          ) : null}

          

          {editCountLabel > 0 && (
            <>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 8 }}>
                Edited by: <Text style={{ color: theme.colors.text }}>{editedByLabel}</Text>
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                Edited at: <Text style={{ color: theme.colors.text }}>{editedAtLabel}</Text>
              </Text>
              <Text style={{ color: theme.colors.muted, fontWeight: "800", marginTop: 4 }}>
                Edit count: <Text style={{ color: theme.colors.text }}>{editCountLabel}</Text>
              </Text>
            </>
          )}
        </View>
      )}

      {!!cleanNote && cleanNote.trim() && (
        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.07)",
            backgroundColor: "rgba(255,255,255,0.03)",
          }}
        >
          <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
            Note
          </Text>
          <Text style={{ color: theme.colors.text, fontWeight: "900", marginTop: 6 }}>
            {cleanNote}
          </Text>
        </View>
      )}
    </Card>
  );

  const itemsCard = (
    <Card style={{ gap: 8, padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 14 }}>
          Items ({items.length})
        </Text>
        <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 12 }}>Qty ({computedQty})</Text>
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
                alignItems: "center",
                gap: 10,
                paddingVertical: 9,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: "rgba(255,255,255,0.05)",
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text
                  style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}
                  numberOfLines={1}
                >
                  {it.product_name ?? "Product"}
                </Text>

                <Text
                  style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 11 }}
                  numberOfLines={1}
                >
                  SKU: {it.sku ?? "—"}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "900", fontSize: 11 }}>
                  {Number(it.qty ?? 0)} × {fmtMoney(unitPrice)}
                </Text>
              </View>

              <View
                style={{
                  minWidth: isDesktopWeb ? 140 : 96,
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}
                  numberOfLines={1}
                >
                  {fmtMoney(lineTotal)}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </Card>
  );

const totalsCard = (
    <Card style={{ gap: 10, padding: 12 }}>
      <View
        style={{
          flexDirection: isWideWeb ? "row" : "column",
          gap: 10,
        }}
      >
        {splitPaymentMeta ? (
          <>
            <MoneyTile label="Cash Paid" value={fmtMoney(splitPaymentMeta.cash)} />
            <MoneyTile label="Mobile Paid" value={fmtMoney(splitPaymentMeta.mobile)} />
            <MoneyTile label="Bank Paid" value={fmtMoney(splitPaymentMeta.bank)} />
            <MoneyTile
              label="Total Paid"
              value={fmtMoney(
                splitPaymentMeta.cash + splitPaymentMeta.mobile + splitPaymentMeta.bank
              )}
              highlight
            />
          </>
        ) : discountMeta ? (
          <>
            <MoneyTile label="Subtotal" value={fmtMoney(discountMeta.subtotal ?? computedTotal)} />
            <MoneyTile
              label={`Discount (${discountMeta.discountText})`}
              value={`-${fmtMoney(discountMeta.discountAmount)}`}
            />
            <MoneyTile label="Total After Discount" value={fmtMoney(computedTotal)} highlight />
          </>
        ) : isCredit ? (
          <>
            <MoneyTile label="Total" value={fmtMoney(computedTotal)} />
            <MoneyTile label="Paid" value={fmtMoney(paidAmount)} />
            <MoneyTile label="Due (Credit)" value={fmtMoney(dueAmount)} highlight />
          </>
        ) : (
          <MoneyTile label="Total Money In" value={fmtMoney(computedTotal)} highlight />
        )}
      </View>

      {isCredit ? (
        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: dueAmount > 0 ? "rgba(251,191,36,0.24)" : "rgba(52,211,153,0.24)",
            backgroundColor: dueAmount > 0 ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.08)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
            Status: {dueAmount > 0 ? "OUTSTANDING" : "CLEARED"}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          Alert.alert("Share Invoice Receipt", "Choose sharing option", [
            { text: "Share as Text", onPress: () => void shareReceipt() },
            { text: "Share as PDF", onPress: () => void shareReceiptPdf() },
            { text: "Cancel", style: "cancel" },
          ])
        }
        style={({ pressed }) => ({
          minHeight: 46,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(52,211,153,0.26)",
          backgroundColor: "rgba(52,211,153,0.10)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
          Share Invoice Receipt
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setShowMoreOptions((v) => !v)}
        style={({ pressed }) => ({
          minHeight: 42,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.04)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
          {showMoreOptions ? "Hide Options" : "More Options"}
        </Text>
      </Pressable>

      {showMoreOptions ? (
        <View style={{ gap: 8 }}>
          {canEditSameDay ? (
            <>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/sales/edit-receipt",
                    params: { saleId },
                  } as any)
                }
                style={({ pressed }) => ({
                  minHeight: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(52,211,153,0.20)",
                  backgroundColor: "rgba(52,211,153,0.07)",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  Edit Same Day
                </Text>
              </Pressable>

              <Pressable
                onPress={deleteSameDay}
                disabled={deleting}
                style={({ pressed }) => ({
                  minHeight: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  opacity: deleting ? 0.55 : pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
                  {deleting ? "Deleting..." : "Delete Same Day"}
                </Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            onPress={() => router.replace("/(tabs)/sales/history")}
            style={({ pressed }) => ({
              minHeight: 40,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.04)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
              Back to History
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => ({
          minHeight: 42,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.04)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 14,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
          Back
        </Text>
      </Pressable>
    </Card>
  );

  return (
    <Screen scroll bottomPad={150}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </Pressable>

         <View style={{ flex: 1, minWidth: 0 }}>
  <Text
    style={{
      fontSize: 24,
      fontWeight: "900",
      color: theme.colors.text,
      marginTop: 2,
    }}
  >
    Invoice Receipt
  </Text>

  <Text
    style={{
      color: theme.colors.muted,
      fontWeight: "800",
      fontSize: 12,
      marginTop: 2,
    }}
    numberOfLines={1}
  >
    No. {receiptNo}
  </Text>
</View>

          <View
            style={{
              paddingHorizontal: 11,
              paddingVertical: 7,
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
                fontSize: 12,
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
            <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{err}</Text>
            <Pressable
  onPress={load}
  style={({ pressed }) => ({
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.26)",
    backgroundColor: "rgba(52,211,153,0.10)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    opacity: pressed ? 0.92 : 1,
  })}
>
  <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
    Retry
  </Text>
</Pressable>
          </Card>
        ) : isDesktopWeb ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <View style={{ flex: 1.15, minWidth: 0, gap: 12 }}>
              {headerCard}
              {itemsCard}
            </View>

            <View style={{ width: 340, minWidth: 340, gap: 12 }}>
              {totalsCard}
            </View>
          </View>
        ) : (
          <>
            {headerCard}
            {itemsCard}
            {totalsCard}
          </>
        )}
      </View>
    </Screen>
  );
}