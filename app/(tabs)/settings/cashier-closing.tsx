// app/(tabs)/settings/cashier-closing.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";

import { useOrg } from "@/src/context/OrgContext";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { theme, UI } from "@/src/ui/theme";

type ClosingSaleRow = {
  sale_id?: string;
  sold_at?: string;
  status?: string | null;
  total_qty?: number | null;
  total_amount?: number | null;
  payment_method?: string | null;
  payment_channel?: string | null;
  paid_amount?: number | null;
  balance_amount?: number | null;
};

type PaymentSummary = {
  cash_total: number;
  mobile_total: number;
  bank_total: number;
  credit_collected_total: number;
  grand_paid_total: number;
  total_sales: number;
  total_balance: number;
};

type AnyRow = Record<string, any>;
type RangeKey = "today" | "week" | "month" | "custom";

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMondayLocal(d: Date) {
  const x = startOfDayLocal(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonthLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setDate(1);
  return x;
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputStart(input: string) {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;

  const out = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isFinite(out.getTime()) ? out : null;
}

function parseDateInputEnd(input: string) {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;

  const out = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isFinite(out.getTime()) ? out : null;
}

function safeWhenLabel(iso?: string) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSaleRow(r: AnyRow): ClosingSaleRow {
  const saleId =
    (r.sale_id ?? r.id ?? r.saleId ?? r.saleID ?? r.sale) != null
      ? String(r.sale_id ?? r.id ?? r.saleId ?? r.saleID ?? r.sale)
      : undefined;

  const soldAt =
    (r.sold_at ?? r.created_at ?? r.inserted_at ?? r.createdAt) != null
      ? String(r.sold_at ?? r.created_at ?? r.inserted_at ?? r.createdAt)
      : undefined;

  const statusRaw = r.status ?? r.sale_status ?? r.saleStatus ?? null;
  const status = statusRaw != null ? String(statusRaw) : null;

  const qty =
    r.total_qty ?? r.totalQty ?? r.qty ?? r.sum_qty ?? r.sumQty ?? r.items_qty ?? r.itemsQty;

  const amount =
    r.total_amount ??
    r.totalAmount ??
    r.amount ??
    r.sum_amount ??
    r.sumAmount ??
    r.total ??
    r.total_price ??
    r.totalPrice;

  return {
    sale_id: saleId,
    sold_at: soldAt,
    status,
    total_qty: qty == null ? null : toNum(qty),
    total_amount: amount == null ? null : toNum(amount),
    payment_method: r.payment_method != null ? String(r.payment_method) : null,
    payment_channel: r.payment_channel != null ? String(r.payment_channel) : null,
    paid_amount: r.paid_amount == null ? null : toNum(r.paid_amount),
    balance_amount: r.balance_amount == null ? null : toNum(r.balance_amount),
  };
}

function labelForRange(r: RangeKey) {
  if (r === "today") return "Today";
  if (r === "week") return "This Week";
  if (r === "month") return "This Month";
  return "Custom Range";
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: theme.colors.muted, fontWeight: "900", marginBottom: 6 }}>
      {children}
    </Text>
  );
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="rgba(255,255,255,0.35)"
      autoCapitalize="none"
      autoCorrect={false}
      multiline={props.multiline}
      style={{
        color: theme.colors.text,
        fontWeight: "800",
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: props.multiline ? 12 : 10,
        minHeight: props.multiline ? 96 : undefined,
        textAlignVertical: props.multiline ? "top" : "center",
      }}
    />
  );
}

function MetricCard({
  title,
  amount,
  subtitle,
}: {
  title: string;
  amount: string;
  subtitle?: string;
}) {
  return (
    <Card style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 18 }}>
        {amount}
      </Text>
      {!!subtitle && (
        <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
          {subtitle}
        </Text>
      )}
    </Card>
  );
}

function escapeHtml(input: any) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function CashierClosingScreen() {
  const router = useRouter();
  const {
    activeOrgId,
    activeOrgName,
    activeStoreId,
    activeStoreName,
    activeRole,
  } = useOrg() as any;

  const money = useOrgMoneyPrefs(activeOrgId);
  const fmtMoney = useCallback((n: number) => money.fmt(Number(n || 0)), [money]);

  const netInfo = useNetInfo();
  const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isOffline = !isOnline;

  const [range, setRange] = useState<RangeKey>("today");

  const now = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toDateInputValue(startOfMonthLocal(now))
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toDateInputValue(endOfDayLocal(now))
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<ClosingSaleRow[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({
    cash_total: 0,
    mobile_total: 0,
    bank_total: 0,
    credit_collected_total: 0,
    grand_paid_total: 0,
    total_sales: 0,
    total_balance: 0,
  });

  const [closingNote, setClosingNote] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const isCashier = String(activeRole ?? "").toLowerCase() === "cashier";
  const canView = useMemo(() => {
    const r = String(activeRole ?? "").toLowerCase();
    return r === "owner" || r === "admin" || r === "staff" || r === "cashier";
  }, [activeRole]);

  const ranges = useMemo(() => {
    const n = new Date();
    return {
      today: {
        from: startOfDayLocal(n).toISOString(),
        to: endOfDayLocal(n).toISOString(),
      },
      week: {
        from: startOfWeekMondayLocal(n).toISOString(),
        to: endOfDayLocal(n).toISOString(),
      },
      month: {
        from: startOfMonthLocal(n).toISOString(),
        to: endOfDayLocal(n).toISOString(),
      },
    };
  }, []);

  const resolvedRange = useMemo(() => {
    if (range !== "custom") return ranges[range];

    const fromDate = parseDateInputStart(customFrom);
    const toDate = parseDateInputEnd(customTo);

    if (!fromDate || !toDate) return null;
    if (fromDate.getTime() > toDate.getTime()) return null;

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }, [customFrom, customTo, range, ranges]);

  const customRangeError = useMemo(() => {
    if (range !== "custom") return null;

    const fromDate = parseDateInputStart(customFrom);
    const toDate = parseDateInputEnd(customTo);

    if (!fromDate || !toDate) return "Tumia format ya tarehe: YYYY-MM-DD";
    if (fromDate.getTime() > toDate.getTime()) return "From Date haiwezi kuwa kubwa kuliko To Date";
    return null;
  }, [customFrom, customTo, range]);

  const load = useCallback(
    async (mode: "boot" | "refresh") => {
      setErr(null);
      if (mode === "boot") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      try {
        if (!activeStoreId) throw new Error("No active store selected.");
        if (!canView) throw new Error("No permission.");
        if (!resolvedRange) throw new Error("Invalid custom date range.");

        const access = await supabase.rpc("ensure_my_store_access", {
          p_store_id: activeStoreId,
        });
        if (access.error) throw access.error;

        const [salesRes, payRes] = await Promise.all([
          supabase.rpc("get_sales_v2", {
            p_store_id: activeStoreId,
            p_from: resolvedRange.from,
            p_to: resolvedRange.to,
          } as any),
          supabase.rpc("get_sales_payment_summary_v1", {
            p_store_id: activeStoreId,
            p_from: resolvedRange.from,
            p_to: resolvedRange.to,
          } as any),
        ]);

        if (salesRes.error) throw salesRes.error;
        if (payRes.error) throw payRes.error;

        const raw = (salesRes.data ?? []) as AnyRow[];
        const list = raw.map(normalizeSaleRow);

        list.sort((a, b) => {
          const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
          const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
          return tb - ta;
        });

        const payRow = Array.isArray(payRes.data) ? (payRes.data[0] ?? null) : payRes.data;

        setRows(list);
        setPaymentSummary({
          cash_total: toNum(payRow?.v_cash_total ?? payRow?.cash_total ?? 0),
          mobile_total: toNum(payRow?.v_mobile_total ?? payRow?.mobile_total ?? 0),
          bank_total: toNum(payRow?.v_bank_total ?? payRow?.bank_total ?? 0),
          credit_collected_total: toNum(
            payRow?.v_credit_collected_total ?? payRow?.credit_collected_total ?? 0
          ),
          grand_paid_total: toNum(payRow?.v_grand_paid_total ?? payRow?.grand_paid_total ?? 0),
          total_sales: toNum(payRow?.v_total_sales ?? payRow?.total_sales ?? 0),
          total_balance: toNum(payRow?.v_total_balance ?? payRow?.total_balance ?? 0),
        });
      } catch (e: any) {
        setRows([]);
        setPaymentSummary({
          cash_total: 0,
          mobile_total: 0,
          bank_total: 0,
          credit_collected_total: 0,
          grand_paid_total: 0,
          total_sales: 0,
          total_balance: 0,
        });
        setErr(e?.message ?? "Failed to load cashier closing");
      } finally {
        if (mode === "boot") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [activeStoreId, canView, resolvedRange]
  );

  useEffect(() => {
    void load("boot");
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load("refresh");
      return () => {};
    }, [load])
  );

  const applyCustomRange = useCallback(() => {
    setRange("custom");
    void load("refresh");
  }, [load]);

  const openReceipt = useCallback(
    (row: ClosingSaleRow) => {
      const saleId = String(row.sale_id ?? "").trim();
      if (!saleId) return;

      router.push({
        pathname: "/(tabs)/sales/receipt",
        params: { saleId },
      } as any);
    },
    [router]
  );

  const saleCount = rows.length;

  const totalQty = useMemo(() => {
    return rows.reduce((a, r) => a + toNum(r.total_qty ?? 0), 0);
  }, [rows]);

  const avgSale = useMemo(() => {
    if (saleCount <= 0) return 0;
    return paymentSummary.total_sales / saleCount;
  }, [paymentSummary.total_sales, saleCount]);

  const expectedDrawer = useMemo(() => {
    return paymentSummary.cash_total;
  }, [paymentSummary.cash_total]);

  const collectedNonCash = useMemo(() => {
    return paymentSummary.mobile_total + paymentSummary.bank_total;
  }, [paymentSummary.mobile_total, paymentSummary.bank_total]);

  const closingStatusLabel = useMemo(() => {
    if (!reviewed) return "OPEN";
    return "REVIEWED";
  }, [reviewed]);

  const rangeTextForPdf = useMemo(() => {
    if (range === "custom") {
      return `${customFrom || "—"} → ${customTo || "—"}`;
    }

    const label = labelForRange(range);
    const resolved = resolvedRange;
    if (!resolved) return label;
    return `${label} (${safeWhenLabel(resolved.from)} → ${safeWhenLabel(resolved.to)})`;
  }, [customFrom, customTo, range, resolvedRange]);

  const buildClosingHtml = useCallback(() => {
    const salesRowsHtml = rows
      .map((item, idx) => {
        const saleId = escapeHtml(String(item.sale_id ?? "").trim());
        const when = escapeHtml(safeWhenLabel(item.sold_at));
        const qty = escapeHtml(String(toNum(item.total_qty ?? 0)));
        const amount = escapeHtml(fmtMoney(toNum(item.total_amount ?? 0)));
        const method = escapeHtml(String(item.payment_method ?? "—").toUpperCase().trim() || "—");
        const channel = escapeHtml(String(item.payment_channel ?? "").trim());
        const paidIn = escapeHtml(fmtMoney(toNum(item.paid_amount ?? 0)));
        const balance = escapeHtml(fmtMoney(toNum(item.balance_amount ?? 0)));
        const status = escapeHtml(String(item.status ?? "COMPLETED").toUpperCase());

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${saleId || "—"}</td>
            <td>${when}</td>
            <td>${qty}</td>
            <td>${amount}</td>
            <td>${method}${channel ? ` • ${channel}` : ""}</td>
            <td>${paidIn}</td>
            <td>${balance}</td>
            <td>${status}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Cashier Closing</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              padding: 24px;
              color: #111827;
            }
            h1 {
              margin: 0 0 4px 0;
              font-size: 26px;
            }
            .sub {
              color: #4b5563;
              font-size: 12px;
              margin-bottom: 20px;
            }
            .section-title {
              margin-top: 22px;
              margin-bottom: 10px;
              font-size: 16px;
              font-weight: 700;
            }
            .grid {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
            }
            .grid td, .grid th {
              border: 1px solid #d1d5db;
              padding: 8px;
              font-size: 12px;
              vertical-align: top;
            }
            .grid th {
              background: #f3f4f6;
              text-align: left;
            }
            .pill {
              display: inline-block;
              padding: 6px 10px;
              border-radius: 999px;
              background: #ecfdf5;
              border: 1px solid #10b981;
              color: #065f46;
              font-size: 12px;
              font-weight: 700;
            }
            .note-box {
              border: 1px solid #d1d5db;
              background: #f9fafb;
              border-radius: 12px;
              padding: 12px;
              font-size: 12px;
              white-space: pre-wrap;
              line-height: 1.5;
            }
            .two-col {
              width: 100%;
              border-collapse: separate;
              border-spacing: 10px 10px;
            }
            .metric {
              border: 1px solid #d1d5db;
              border-radius: 12px;
              padding: 12px;
            }
            .metric-title {
              font-size: 11px;
              color: #6b7280;
              margin-bottom: 6px;
            }
            .metric-value {
              font-size: 18px;
              font-weight: 700;
              color: #111827;
            }
            .metric-sub {
              font-size: 11px;
              color: #6b7280;
              margin-top: 6px;
            }
            .footer {
              margin-top: 22px;
              font-size: 11px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <h1>Cashier Closing Summary</h1>
          <div class="sub">
            ${escapeHtml(activeOrgName ?? "—")} • ${escapeHtml(activeStoreName ?? "—")} • ${escapeHtml(activeRole ?? "—")}
          </div>

          <table class="grid">
            <tr>
              <th style="width: 180px;">Organization</th>
              <td>${escapeHtml(activeOrgName ?? "—")}</td>
            </tr>
            <tr>
              <th>Store</th>
              <td>${escapeHtml(activeStoreName ?? "—")}</td>
            </tr>
            <tr>
              <th>Role</th>
              <td>${escapeHtml(activeRole ?? "—")}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td><span class="pill">${escapeHtml(closingStatusLabel)}</span></td>
            </tr>
            <tr>
              <th>Range</th>
              <td>${escapeHtml(rangeTextForPdf)}</td>
            </tr>
            <tr>
              <th>Generated At</th>
              <td>${escapeHtml(new Date().toLocaleString())}</td>
            </tr>
          </table>

          <div class="section-title">Closing Summary</div>
          <table class="two-col">
            <tr>
              <td class="metric">
                <div class="metric-title">Sales Count</div>
                <div class="metric-value">${escapeHtml(String(saleCount))}</div>
              </td>
              <td class="metric">
                <div class="metric-title">Total Qty</div>
                <div class="metric-value">${escapeHtml(String(totalQty))}</div>
              </td>
            </tr>
            <tr>
              <td class="metric">
                <div class="metric-title">Total Sales</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.total_sales))}</div>
                <div class="metric-sub">Mauzo yote ya range hii</div>
              </td>
              <td class="metric">
                <div class="metric-title">Avg Sale</div>
                <div class="metric-value">${escapeHtml(fmtMoney(avgSale))}</div>
                <div class="metric-sub">Wastani kwa sale</div>
              </td>
            </tr>
          </table>

          <div class="section-title">Payment Breakdown</div>
          <table class="two-col">
            <tr>
              <td class="metric">
                <div class="metric-title">Cash</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.cash_total))}</div>
              </td>
              <td class="metric">
                <div class="metric-title">Mobile</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.mobile_total))}</div>
              </td>
            </tr>
            <tr>
              <td class="metric">
                <div class="metric-title">Bank</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.bank_total))}</div>
              </td>
              <td class="metric">
                <div class="metric-title">Credit Collected</div>
                <div class="metric-value">${escapeHtml(
                  fmtMoney(paymentSummary.credit_collected_total)
                )}</div>
              </td>
            </tr>
            <tr>
              <td class="metric">
                <div class="metric-title">Grand Paid In</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.grand_paid_total))}</div>
                <div class="metric-sub">Pesa iliyoingia kweli</div>
              </td>
              <td class="metric">
                <div class="metric-title">Outstanding</div>
                <div class="metric-value">${escapeHtml(fmtMoney(paymentSummary.total_balance))}</div>
                <div class="metric-sub">Balance / mikopo</div>
              </td>
            </tr>
          </table>

          <div class="section-title">Closing Review</div>
          <table class="two-col">
            <tr>
              <td class="metric">
                <div class="metric-title">Expected Cash Drawer</div>
                <div class="metric-value">${escapeHtml(fmtMoney(expectedDrawer))}</div>
                <div class="metric-sub">Cash inayotakiwa kuwepo</div>
              </td>
              <td class="metric">
                <div class="metric-title">Non-Cash Collected</div>
                <div class="metric-value">${escapeHtml(fmtMoney(collectedNonCash))}</div>
                <div class="metric-sub">Mobile + Bank</div>
              </td>
            </tr>
          </table>

          <div class="section-title">Closing Note</div>
          <div class="note-box">${escapeHtml(closingNote || "No closing note.")}</div>

          <div class="section-title">Sales Included in This Closing</div>
          <table class="grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Sale ID</th>
                <th>When</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid In</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${salesRowsHtml || `<tr><td colspan="9">No sales found for this range.</td></tr>`}
            </tbody>
          </table>

          <div class="footer">
            ZETRA Cashier Closing • Generated from app closing summary
          </div>
        </body>
      </html>
    `;
  }, [
    activeOrgName,
    activeRole,
    activeStoreName,
    avgSale,
    closingNote,
    closingStatusLabel,
    collectedNonCash,
    expectedDrawer,
    fmtMoney,
    paymentSummary.bank_total,
    paymentSummary.cash_total,
    paymentSummary.credit_collected_total,
    paymentSummary.grand_paid_total,
    paymentSummary.mobile_total,
    paymentSummary.total_balance,
    paymentSummary.total_sales,
    rangeTextForPdf,
    rows,
    saleCount,
    totalQty,
  ]);

  const handleShareClosingPdf = useCallback(async () => {
    if (sharingBusy) return;

    try {
      setSharingBusy(true);

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Unavailable", "Sharing haipatikani kwenye kifaa hiki.");
        return;
      }

      const html = buildClosingHtml();

      const file = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (!file?.uri) {
        throw new Error("PDF URI not returned");
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Cashier Closing PDF",
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Imeshindikana kutengeneza au kushare PDF.");
    } finally {
      setSharingBusy(false);
    }
  }, [buildClosingHtml, sharingBusy]);

  const SegButton = useCallback(
    ({ k, label }: { k: RangeKey; label: string }) => {
      const active = range === k;
      return (
        <Pressable
          onPress={() => setRange(k)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? theme.colors.emeraldBorder : theme.colors.border,
            backgroundColor: active ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>{label}</Text>
        </Pressable>
      );
    },
    [range]
  );

  const Header = useMemo(() => {
    return (
      <View style={{ gap: 14, paddingBottom: 10 }}>
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
              Cashier Closing
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              {activeOrgName ?? "—"} • {activeStoreName ?? "No store"} • {activeRole ?? "—"}
            </Text>
            <Text style={{ color: theme.colors.muted, fontWeight: "800", fontSize: 12 }}>
              {isOffline ? "OFFLINE" : "ONLINE"}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: reviewed ? theme.colors.emeraldBorder : theme.colors.border,
              backgroundColor: reviewed ? theme.colors.emeraldSoft : "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
              {closingStatusLabel}
            </Text>
          </View>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>Range</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <SegButton k="today" label="Today" />
            <SegButton k="week" label="Week" />
            <SegButton k="month" label="Month" />
            <SegButton k="custom" label="Custom" />
          </View>

          {range === "custom" && (
            <View style={{ gap: 10 }}>
              <View>
                <InputLabel>From Date</InputLabel>
                <InputBox
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View>
                <InputLabel>To Date</InputLabel>
                <InputBox
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              {!!customRangeError && (
                <Text style={{ color: theme.colors.danger, fontWeight: "800" }}>
                  {customRangeError}
                </Text>
              )}

              <Button
                title="Apply Custom Range"
                onPress={applyCustomRange}
                disabled={!!customRangeError}
                variant="secondary"
              />
            </View>
          )}

          <Button
            title={refreshing ? "Refreshing..." : "Refresh"}
            onPress={() => load("refresh")}
            disabled={refreshing || (range === "custom" && !!customRangeError)}
            variant="primary"
          />

          {!!err && (
            <Text style={{ color: theme.colors.danger, fontWeight: "800" }}>{err}</Text>
          )}
        </Card>

        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Closing Summary ({labelForRange(range)})
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard title="Sales Count" amount={String(saleCount)} />
          <MetricCard title="Total Qty" amount={String(totalQty)} />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard
            title="TOTAL SALES"
            amount={fmtMoney(paymentSummary.total_sales)}
            subtitle="Mauzo yote ya range hii"
          />
          <MetricCard
            title="AVG SALE"
            amount={fmtMoney(avgSale)}
            subtitle="Wastani kwa sale"
          />
        </View>

        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Payment Breakdown
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard title="Cash" amount={fmtMoney(paymentSummary.cash_total)} />
          <MetricCard title="Mobile" amount={fmtMoney(paymentSummary.mobile_total)} />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard title="Bank" amount={fmtMoney(paymentSummary.bank_total)} />
          <MetricCard
            title="Credit Collected"
            amount={fmtMoney(paymentSummary.credit_collected_total)}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard
            title="Grand Paid In"
            amount={fmtMoney(paymentSummary.grand_paid_total)}
            subtitle="Pesa iliyoingia kweli"
          />
          <MetricCard
            title="Outstanding"
            amount={fmtMoney(paymentSummary.total_balance)}
            subtitle="Balance / mikopo"
          />
        </View>

        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Closing Review
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard
            title="Expected Cash Drawer"
            amount={fmtMoney(expectedDrawer)}
            subtitle="Cash inayotakiwa kuwepo"
          />
          <MetricCard
            title="Non-Cash Collected"
            amount={fmtMoney(collectedNonCash)}
            subtitle="Mobile + Bank"
          />
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Closing Note
          </Text>

          <InputBox
            value={closingNote}
            onChangeText={setClosingNote}
            placeholder="andika maelezo ya closing hapa..."
            multiline
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                title={reviewed ? "Reviewed ✅" : "Mark as Reviewed"}
                onPress={() => {
                  if (reviewed) {
                    Alert.alert("Already reviewed", "Closing hii tayari imewekewa reviewed.");
                    return;
                  }
                  setReviewed(true);
                  Alert.alert(
                    "Reviewed ✅",
                    "Cashier Closing imewekwa reviewed kwa UI ya sasa."
                  );
                }}
                disabled={reviewed}
                variant="primary"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Button
                title={sharingBusy ? "Preparing PDF..." : "Share Closing PDF"}
                onPress={() => {
                  void handleShareClosingPdf();
                }}
                disabled={sharingBusy || loading}
                variant="secondary"
              />
            </View>
          </View>

          <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 12 }}>
            Hii screen ni ya cashier kufunga hesabu. History ni ya kuangalia rekodi; Closing ni ya
            ku-review summary ya pesa na mauzo kwa period husika.
          </Text>
        </Card>

        {!isCashier && (
          <Card style={{ gap: 8, borderColor: "rgba(245,158,11,0.30)" }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>Note</Text>
            <Text style={{ color: UI.muted, fontWeight: "800" }}>
              Hii screen imewekwa ndani ya Cashier Closing, lakini kwa sasa inasoma data ya store
              iliyochaguliwa kwenye range husika.
            </Text>
          </Card>
        )}

        <Text style={{ fontWeight: "900", fontSize: 16, color: theme.colors.text }}>
          Sales Included in This Closing
        </Text>

        <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
          Hizi ni sale records zilizoingia kwenye closing summary ya juu.
        </Text>

        {loading && (
          <View style={{ paddingTop: 10, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
              Loading closing data...
            </Text>
          </View>
        )}
      </View>
    );
  }, [
    SegButton,
    activeOrgName,
    activeRole,
    activeStoreName,
    applyCustomRange,
    avgSale,
    closingNote,
    closingStatusLabel,
    collectedNonCash,
    customFrom,
    customRangeError,
    customTo,
    err,
    expectedDrawer,
    fmtMoney,
    handleShareClosingPdf,
    isCashier,
    isOffline,
    load,
    loading,
    paymentSummary.bank_total,
    paymentSummary.cash_total,
    paymentSummary.credit_collected_total,
    paymentSummary.grand_paid_total,
    paymentSummary.mobile_total,
    paymentSummary.total_balance,
    paymentSummary.total_sales,
    range,
    refreshing,
    reviewed,
    router,
    saleCount,
    sharingBusy,
    totalQty,
  ]);

  return (
    <Screen scroll={false}>
      <FlatList
        style={{ flex: 1 }}
        data={loading ? [] : rows}
        keyExtractor={(item, idx) => String(item.sale_id ?? idx)}
        refreshing={refreshing}
        onRefresh={() => load("refresh")}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={Header}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const saleId = String(item.sale_id ?? "").trim();
          const when = safeWhenLabel(item.sold_at);
          const qty = toNum(item.total_qty ?? 0);
          const amount = toNum(item.total_amount ?? 0);
          const status = String(item.status ?? "COMPLETED").toUpperCase();
          const method = String(item.payment_method ?? "").toUpperCase().trim();
          const channel = String(item.payment_channel ?? "").trim();
          const paidAmount = toNum(item.paid_amount ?? 0);
          const balanceAmount = toNum(item.balance_amount ?? 0);

          return (
            <Pressable onPress={() => openReceipt(item)}>
              <Card style={{ marginBottom: 12, gap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <Text
                    style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16, flex: 1 }}
                    numberOfLines={1}
                  >
                    Sale {saleId ? saleId.slice(0, 8) : "—"}
                  </Text>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.emeraldBorder,
                      backgroundColor: theme.colors.emeraldSoft,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                      {status}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  When: <Text style={{ color: theme.colors.text }}>{when}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Qty: <Text style={{ color: theme.colors.text }}>{qty}</Text>
                  {"   "}•{"   "}
                  Amount: <Text style={{ color: theme.colors.text }}>{fmtMoney(amount)}</Text>
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Method: <Text style={{ color: theme.colors.text }}>{method || "—"}</Text>
                  {channel ? <Text style={{ color: theme.colors.text }}> • {channel}</Text> : null}
                </Text>

                <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                  Paid In: <Text style={{ color: theme.colors.text }}>{fmtMoney(paidAmount)}</Text>
                  {"   "}•{"   "}
                  Balance:{" "}
                  <Text style={{ color: theme.colors.text }}>{fmtMoney(balanceAmount)}</Text>
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: "800",
                    textDecorationLine: "underline",
                  }}
                >
                  Open Receipt
                </Text>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ paddingTop: 16, alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontWeight: "800" }}>
                No sales ({labelForRange(range)}).
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}