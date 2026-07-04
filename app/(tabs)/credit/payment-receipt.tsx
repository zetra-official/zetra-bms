import { useOrg } from "@/src/context/OrgContext";
import { supabase } from "@/src/supabase/supabaseClient";
import { Button } from "@/src/ui/Button";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { useOrgMoneyPrefs } from "@/src/ui/money";
import { theme } from "@/src/ui/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";

type AccountRow = {
  account_id: string;
  customer_name: string | null;
  phone?: string | null;
  balance: number | null;
};

type Txn = {
  id: string;
  kind: "SALE" | "PAYMENT" | string;
  amount: number;
  created_at: string | null;
  note: string | null;
  reference: string | null;
  method: string | null;
};

type TxnWithRunning = Txn & {
  running_after: number;
  signed_delta: number;
};

type OrgProfile = {
  business_name?: string | null;
  logo_url?: string | null;
  tin?: string | null;
  vrn?: string | null;
  registration_no?: string | null;
  email?: string | null;
  website?: string | null;
  tagline?: string | null;
  receipt_footer?: string | null;
};

type StoreProfile = {
  store_display_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  mobile_money_name?: string | null;
  mobile_money_number?: string | null;
  payment_instructions?: string | null;
};

function clean(x: any) {
  return String(x ?? "").trim();
}

function cryptoRandomFallback() {
  return `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}
function downloadHtmlPdfOnWeb(html: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1500);
  }, 500);

  return true;
}
export default function CreditPaymentReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ creditId?: string; paymentId?: string }>();

  const creditId = String(params.creditId ?? "").trim();
  const paymentId = String(params.paymentId ?? "").trim();

  const { activeOrgId, activeStoreName, activeStoreId } = useOrg();
  const money = useOrgMoneyPrefs(String(activeOrgId ?? ""));

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
const [account, setAccount] = useState<AccountRow | null>(null);
const [txns, setTxns] = useState<Txn[]>([]);
const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null);
const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("CASH");
  const [editReference, setEditReference] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    if (!creditId || !paymentId) {
      setErrMsg("Missing receipt params.");
      setLoading(false);
      return;
    }

    try {
      setErrMsg(null);
      setLoading(true);

      if (!activeStoreId) {
        setAccount(null);
        setTxns([]);
        setErrMsg("Missing activeStoreId. Chagua store kwanza.");
        return;
      }

      const { data: list, error: le } = await supabase.rpc(
        "get_store_credit_accounts_v2",
        { p_store_id: activeStoreId, p_status: "ALL" } as any
      );
      if (le) throw le;

      const row = ((list ?? []) as any[]).find((x) => {
        const id = x.account_id ?? x.credit_account_id ?? x.id;
        return String(id) === creditId;
      });

      setAccount(
        row
          ? {
              account_id: String(row.account_id ?? row.credit_account_id ?? row.id),
              customer_name: row.customer_name ?? row.full_name ?? row.name ?? null,
              phone: row.phone ?? row.normalized_phone ?? null,
              balance: Number(row.balance ?? row.balance_amount ?? 0),
            }
          : {
              account_id: creditId,
              customer_name: "Customer",
              phone: null,
              balance: 0,
            }
      );

      const { data: t, error: te } = await supabase.rpc(
        "get_credit_account_transactions_v2",
        { p_credit_account_id: creditId, p_limit: 200 } as any
      );
      if (te) throw te;

      const mapped: Txn[] = ((t ?? []) as any[]).map((x) => {
        const id = x.id ?? x.txn_id ?? x.transaction_id ?? cryptoRandomFallback();

        const kind =
          String(x.entry_type ?? x.kind ?? x.type ?? x.txn_type ?? x.entry_kind ?? "")
            .toUpperCase()
            .trim() || "TXN";

        const amountRaw = x.amount ?? x.delta ?? x.delta_amount ?? 0;
        const created_at =
          x.created_at ?? x.txn_date ?? x.transaction_date ?? x.inserted_at ?? null;

        const note = x.note ?? x.description ?? null;
        const reference = x.reference ?? x.ref ?? null;
        const method = x.payment_method ?? x.method ?? null;

        return {
          id: String(id),
          kind,
          amount: Number(amountRaw ?? 0),
          created_at,
          note,
          reference,
          method,
        };
      });

      mapped.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      setTxns(mapped);
    } catch (e: any) {
      setAccount(null);
      setTxns([]);
      setErrMsg(e?.message ?? "Failed to load payment receipt.");
    } finally {
      setLoading(false);
    }
  }, [creditId, paymentId, activeStoreId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
useEffect(() => {
  let alive = true;

  async function loadProfiles() {
    try {
      if (activeOrgId) {
        const { data } = await supabase
          .from("organization_profiles")
          .select("*")
          .eq("organization_id", activeOrgId)
          .maybeSingle();

        if (alive) setOrgProfile((data ?? null) as any);
      } else {
        setOrgProfile(null);
      }

      if (activeStoreId) {
        const { data } = await supabase
          .from("store_profiles")
          .select("*")
          .eq("store_id", activeStoreId)
          .maybeSingle();

        if (alive) setStoreProfile((data ?? null) as any);
      } else {
        setStoreProfile(null);
      }
    } catch {
      if (alive) {
        setOrgProfile(null);
        setStoreProfile(null);
      }
    }
  }

  void loadProfiles();

  return () => {
    alive = false;
  };
}, [activeOrgId, activeStoreId]);
  const txnsWithRunning: TxnWithRunning[] = useMemo(() => {
    if (!txns || txns.length === 0) return [];

    const chronological = [...txns].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    let run = 0;
    const computedChrono: TxnWithRunning[] = chronological.map((t) => {
      const k = String(t.kind).toUpperCase();
      const amt = Math.abs(Number(t.amount ?? 0));
      const signed = k === "PAYMENT" ? -amt : k === "SALE" ? +amt : +Number(t.amount ?? 0);
      run = run + signed;

      return { ...t, signed_delta: signed, running_after: run };
    });

    computedChrono.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return computedChrono;
  }, [txns]);

  const paymentTxn = useMemo(
    () => txnsWithRunning.find((t) => String(t.id) === paymentId) ?? null,
    [txnsWithRunning, paymentId]
  );

  const amountPaid = Math.abs(Number(paymentTxn?.amount ?? 0));
  const balanceAfter = Number(paymentTxn?.running_after ?? 0);
  const balanceBefore = Number(paymentTxn?.running_after ?? 0) + amountPaid;
  const when = paymentTxn?.created_at ? new Date(paymentTxn.created_at).toLocaleString() : "—";

  const paymentMethodLabel = String(paymentTxn?.method ?? "CASH").toUpperCase();
  const paymentReferenceLabel = paymentTxn?.reference ? String(paymentTxn.reference) : "—";
  const paymentIdLabel = paymentTxn?.id ? String(paymentTxn.id) : "—";
  const paymentNoteLabel = paymentTxn?.note ? String(paymentTxn.note) : "—";

  const receiptText = [
    "ZETRA BMS",
    "CREDIT PAYMENT RECEIPT",
    "",
    `Customer: ${account?.customer_name ?? "Customer"}`,
    `Phone: ${account?.phone ?? "No phone"}`,
    `Store: ${activeStoreName ?? "—"}`,
    `Date/Time: ${when}`,
    "",
    `Debt Before Payment: ${money.fmt(balanceBefore)}`,
    `Payment Paid: ${money.fmt(amountPaid)}`,
`Payment Date/Time: ${when}`,
    `Balance After Payment: ${money.fmt(balanceAfter)}`,
    "",
    `Method: ${paymentMethodLabel}`,
    `Reference: ${paymentReferenceLabel}`,
    `Payment ID: ${paymentIdLabel.length > 18 ? `${paymentIdLabel.slice(0, 18)}…` : paymentIdLabel}`,
    `Note: ${paymentNoteLabel}`,
  ].join("\n");

  const onShareReceipt = useCallback(async () => {
    try {
      await Share.share({
        title: "Credit Payment Receipt",
        message: receiptText,
      });
    } catch {}
  }, [receiptText]);

const onShareReceiptPdf = useCallback(async () => {
  const esc = (v: any) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const orgName = clean(orgProfile?.business_name) || "ZETRA BMS";
  const storeName = clean(storeProfile?.store_display_name) || activeStoreName || "—";
  const logoUrl = clean(orgProfile?.logo_url);

  const orgTin = clean(orgProfile?.tin);
  const orgVrn = clean(orgProfile?.vrn);
  const orgRegNo = clean(orgProfile?.registration_no);
  const orgEmail = clean(orgProfile?.email);
  const orgWebsite = clean(orgProfile?.website);
  const orgTagline = clean(orgProfile?.tagline);
  const footerText = clean(orgProfile?.receipt_footer) || "Thank you for your payment.";

  const storePhone = clean(storeProfile?.phone);
  const storeWhatsapp = clean(storeProfile?.whatsapp);
  const storeEmail = clean(storeProfile?.email);
  const storeAddress = clean(storeProfile?.address);
  const storeCity = clean(storeProfile?.city);
  const storeRegion = clean(storeProfile?.region);

  const storeBankName = clean(storeProfile?.bank_name);
  const storeAccountName = clean(storeProfile?.account_name);
  const storeAccountNumber = clean(storeProfile?.account_number);
  const storeMobileMoneyName = clean(storeProfile?.mobile_money_name);
  const storeMobileMoneyNumber = clean(storeProfile?.mobile_money_number);
  const storePaymentInstructions = clean(storeProfile?.payment_instructions);

  const orgIdentityHtml = [
    orgTin ? `TIN: ${esc(orgTin)}` : "",
    orgVrn ? `VRN: ${esc(orgVrn)}` : "",
    orgRegNo ? `Reg No: ${esc(orgRegNo)}` : "",
    orgEmail ? `Email: ${esc(orgEmail)}` : "",
    orgWebsite ? `Website: ${esc(orgWebsite)}` : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;•&nbsp; ");

  const storeLocationText = [storeAddress, storeCity, storeRegion].filter(Boolean).join(", ");

  const storeContactHtml = [
    storePhone ? `Phone: ${esc(storePhone)}` : "",
    storeWhatsapp ? `WhatsApp: ${esc(storeWhatsapp)}` : "",
    storeEmail ? `Email: ${esc(storeEmail)}` : "",
    storeLocationText ? `Location: ${esc(storeLocationText)}` : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  const allPaymentsHistoryHtml = `
  <div class="section-title">All Customer Payments History</div>
  <table class="summary-table">
    ${txnsWithRunning
      .filter((t) => String(t.kind).toUpperCase() === "PAYMENT")
      .map((t, index) => {
        const paid = Math.abs(Number(t.amount ?? 0));
        const paidAt = t.created_at ? new Date(t.created_at).toLocaleString() : "—";
        const method = String(t.method ?? "CASH").toUpperCase();

        return `
          <tr>
            <td>
              <b>${index + 1}. ${esc(paidAt)}</b><br/>
              <span class="muted">${esc(method)}${
          t.reference ? ` • Ref: ${esc(t.reference)}` : ""
        }</span>
            </td>
            <td class="right">
              <b>${esc(money.fmt(paid))}</b><br/>
              <span class="muted">Balance: ${esc(money.fmt(t.running_after))}</span>
            </td>
          </tr>
        `;
      })
      .join("")}
  </table>
`;

const paymentDetailsHtml =
    storeBankName ||
    storeAccountName ||
    storeAccountNumber ||
    storeMobileMoneyName ||
    storeMobileMoneyNumber ||
    storePaymentInstructions
      ? `
        <div class="section-title">Payment Details</div>
        <table class="info-table compact">
          <tr>
            <td>
              <span class="label">Bank</span>
              <div class="strong">${esc(
                [storeBankName, storeAccountName].filter(Boolean).join(" • ") || "—"
              )}</div>
              ${
                storeAccountNumber
                  ? `<div class="muted">Account No: ${esc(storeAccountNumber)}</div>`
                  : ""
              }
            </td>
            <td>
              <span class="label">Mobile Money</span>
              <div class="strong">${esc(storeMobileMoneyName || "—")}</div>
              ${
                storeMobileMoneyNumber
                  ? `<div class="muted">Lipa / Pay No: ${esc(storeMobileMoneyNumber)}</div>`
                  : ""
              }
            </td>
            <td>
              <span class="label">Instructions</span>
              <div>${esc(storePaymentInstructions || "—")}</div>
            </td>
          </tr>
        </table>
      `
      : "";

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Credit Payment Receipt ${esc(paymentIdLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      line-height: 1.35;
    }
    .page { width: 100%; background: #ffffff; }
    .topbar {
      display: table;
      width: 100%;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .brand { display: table-cell; vertical-align: top; width: 62%; }
    .doc-meta {
      display: table-cell;
      vertical-align: top;
      width: 38%;
      text-align: right;
      font-size: 9.5px;
      line-height: 1.45;
    }
    .logo-wrap {
      width: 92px;
      height: 92px;
      border: 1px solid #94a3b8;
      border-radius: 16px;
      overflow: hidden;
      display: inline-block;
      vertical-align: top;
      margin-right: 14px;
      background: #f8fafc;
    }
    .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
    .brand-info {
      display: inline-block;
      vertical-align: top;
      max-width: 72%;
      padding-top: 2px;
    }
    .brand-title {
      font-size: 21px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
    }
    .brand-sub {
      margin-top: 3px;
      font-size: 9.5px;
      font-weight: 800;
      color: #111827;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #0f172a;
    }
    .badge {
      display: inline-block;
      border: 1px solid #10b981;
      background: #ecfdf5;
      color: #047857;
      border-radius: 999px;
      padding: 4px 9px;
      font-weight: 900;
      margin-top: 5px;
      font-size: 9px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      margin: 11px 0 5px;
      padding-bottom: 4px;
      border-bottom: 1px solid #94a3b8;
      letter-spacing: 0.2px;
    }
    .info-table, .summary-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 6px;
    }
    .info-table td, .summary-table td {
      border: 1px solid #94a3b8;
      padding: 7px;
      vertical-align: top;
      word-break: break-word;
    }
    .info-table.compact td { padding: 6px; }
    .label {
      display: block;
      color: #111827;
      font-weight: 900;
      font-size: 8.5px;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .strong { font-weight: 900; color: #111827; }
    .muted { color: #111827; font-weight: 700; }
    .right { text-align: right; white-space: nowrap; }
    .summary-wrap {
      display: table;
      width: 100%;
      margin-top: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .summary-left {
      display: table-cell;
      width: 56%;
      vertical-align: top;
      padding-right: 10px;
    }
    .summary-right {
      display: table-cell;
      width: 44%;
      vertical-align: top;
    }
    .total-box {
      border: 1.5px solid #10b981;
      background: #ecfdf5;
      padding: 11px;
      text-align: right;
    }
    .total-label {
      color: #047857;
      font-weight: 900;
      font-size: 9px;
      text-transform: uppercase;
    }
    .total-value {
      font-size: 22px;
      font-weight: 900;
      margin-top: 3px;
      color: #0f172a;
    }
    .note {
      border: 1px solid #94a3b8;
      background: #f8fafc;
      padding: 8px;
      margin-top: 8px;
      font-size: 9px;
    }
    .sign-section {
      display: table;
      width: 100%;
      table-layout: fixed;
      border-spacing: 8px 0;
      margin-top: 13px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sign-box {
      display: table-cell;
      border: 1px solid #94a3b8;
      padding: 9px;
      vertical-align: bottom;
      height: 58px;
      font-size: 9px;
    }
    .sign-line {
      border-top: 1px solid #111827;
      margin-top: 20px;
      margin-bottom: 6px;
    }
    .terms {
      margin-top: 9px;
      border: 1px solid #94a3b8;
      background: #f8fafc;
      padding: 7px;
      font-size: 8.8px;
      color: #334155;
      font-weight: 700;
    }
    .footer {
      margin-top: 9px;
      padding-top: 7px;
      border-top: 1px solid #cbd5e1;
      color: #64748b;
      text-align: center;
      font-size: 8.8px;
      font-weight: 800;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="topbar">
      <div class="brand">
        ${logoUrl ? `<span class="logo-wrap"><img src="${esc(logoUrl)}" crossorigin="anonymous" /></span>` : ""}
        <span class="brand-info">
          <div class="brand-title">${esc(orgName)}</div>
          ${orgTagline ? `<div class="brand-sub">${esc(orgTagline)}</div>` : ""}
          ${orgIdentityHtml ? `<div class="brand-sub">${orgIdentityHtml}</div>` : ""}
          ${storeContactHtml ? `<div class="brand-sub">${storeContactHtml}</div>` : ""}
        </span>
      </div>

      <div class="doc-meta">
        <div class="doc-title">Credit Payment Receipt</div>
        <b>Payment ID:</b> ${esc(paymentIdLabel)}<br/>
        <b>Document Type:</b> Debt Payment<br/>
        <b>Date:</b> ${esc(when)}<br/>
        <b>Store:</b> ${esc(storeName)}<br/>
        <span class="badge">${esc(paymentMethodLabel)} • RECEIVED</span>
      </div>
    </div>

    <div class="section-title">Credit Payment Information</div>
    <table class="info-table">
      <tr>
        <td>
          <span class="label">Customer</span>
          <div class="strong">${esc(account?.customer_name ?? "Customer")}</div>
          <div class="muted">Phone: ${esc(account?.phone ?? "No phone")}</div>
        </td>
        <td>
          <span class="label">Payment</span>
          <div class="strong">${esc(paymentMethodLabel)}</div>
          <div class="muted">Reference: ${esc(paymentReferenceLabel)}</div>
        </td>
        <td>
          <span class="label">Store</span>
          <div class="strong">${esc(storeName)}</div>
        </td>
      </tr>
    </table>

    ${
      paymentNoteLabel && paymentNoteLabel !== "—"
        ? `<div class="note"><b>Note:</b><br/>${esc(paymentNoteLabel)}</div>`
        : ""
    }

    <div class="summary-wrap">
      <div class="summary-left">
        <div class="section-title">Debt Payment Summary</div>
        <table class="summary-table">
          <tr>
            <td><b>Debt Before Payment</b></td>
            <td class="right">${esc(money.fmt(balanceBefore))}</td>
          </tr>
        <tr>
  <td><b>Payment Paid</b></td>
  <td class="right">${esc(money.fmt(amountPaid))}</td>
</tr>
<tr>
  <td><b>Payment Date / Time</b></td>
  <td class="right">${esc(when)}</td>
</tr>
          <tr>
            <td><b>Balance After Payment</b></td>
            <td class="right"><b>${esc(money.fmt(balanceAfter))}</b></td>
          </tr>
        </table>
      </div>

      <div class="summary-right">
        <div class="total-box">
        <div class="total-label">Payment Paid</div>
<div class="total-value">${esc(money.fmt(amountPaid))}</div>
<div class="muted" style="margin-top:4px;">${esc(when)}</div>
        </div>
      </div>
    </div>

    <div class="sign-section">
      <div class="sign-box">
        <div class="sign-line"></div>
        <b>Received By</b><br/>
        <span>${esc(storeName)}</span>
      </div>

      <div class="sign-box">
        <div class="sign-line"></div>
        <b>Customer Signature</b><br/>
        <span>${esc(account?.customer_name ?? "Customer")}</span>
      </div>

      <div class="sign-box">
        <div class="sign-line"></div>
        <b>Business Stamp / Signature</b><br/>
        <span>${esc(storeName)}</span>
      </div>
    </div>

  ${allPaymentsHistoryHtml}

${paymentDetailsHtml}

<div class="terms">
      <b>Terms:</b> Hii ni risiti rasmi ya punguzo la deni la mteja. Tafadhali hifadhi risiti hii kwa kumbukumbu.
    </div>

    <div class="footer">
      ${esc(footerText)}
      ${
        storePhone || storeWhatsapp
          ? ` • Contact: ${esc([storePhone, storeWhatsapp].filter(Boolean).join(" / "))}`
          : ""
      }
      • Powered by ZETRA BMS
    </div>
  </div>
</body>
</html>
`;

  try {
    if (downloadHtmlPdfOnWeb(html)) return;

    const file = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Credit Payment Receipt PDF",
      });
    } else {
      await Print.printAsync({ uri: file.uri });
    }
  } catch (e: any) {
    Alert.alert("PDF failed", e?.message ?? "Failed to create PDF.");
  }
}, [
  orgProfile,
  storeProfile,
  activeStoreName,
  paymentIdLabel,
  when,
  paymentMethodLabel,
  paymentReferenceLabel,
  paymentNoteLabel,
  account?.customer_name,
  account?.phone,
  money,
  balanceBefore,
  amountPaid,
  balanceAfter,
txnsWithRunning,
]);

  const openEdit = useCallback(() => {
    setEditAmount(String(amountPaid || ""));
    setEditMethod(paymentMethodLabel || "CASH");
    setEditReference(paymentTxn?.reference ? String(paymentTxn.reference) : "");
    setEditNote(paymentTxn?.note ? String(paymentTxn.note) : "");
    setEditOpen(true);
  }, [amountPaid, paymentMethodLabel, paymentTxn?.reference, paymentTxn?.note]);

  const saveEdit = useCallback(async () => {
    const amt = Number(String(editAmount).replace(/[, ]+/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid", "Weka kiasi sahihi cha malipo.");
      return;
    }

    try {
      setSavingEdit(true);
      const { error } = await supabase.rpc("edit_credit_payment_v1", {
        p_payment_id: paymentId,
        p_amount: amt,
        p_method: editMethod,
        p_reference: editReference.trim() || null,
        p_note: editNote.trim() || null,
      } as any);

      if (error) throw error;

      setEditOpen(false);
      await load();
      Alert.alert("Updated", "Payment imebadilishwa vizuri.");
    } catch (e: any) {
      Alert.alert("Edit failed", e?.message ?? "Failed to edit payment.");
    } finally {
      setSavingEdit(false);
    }
  }, [editAmount, editMethod, editReference, editNote, paymentId, load]);

  const deletePayment = useCallback(() => {
    Alert.alert(
      "Delete Payment?",
      "Ukifuta payment hii, deni la mteja litarudi kuongezeka kulingana na kiasi cha payment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingPayment(true);
              const { error } = await supabase.rpc("delete_credit_payment_v1", {
                p_payment_id: paymentId,
              } as any);

              if (error) throw error;

              Alert.alert("Deleted", "Payment imefutwa vizuri.");
              router.replace({
                pathname: "/(tabs)/credit/[creditId]",
                params: { creditId },
              } as any);
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Failed to delete payment.");
            } finally {
              setDeletingPayment(false);
            }
          },
        },
      ]
    );
  }, [paymentId, router, creditId]);


  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: 18 }}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (errMsg) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: theme.colors.danger, fontWeight: "900" }}>{errMsg}</Text>
        </Card>
      </Screen>
    );
  }

  if (!paymentTxn) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
            Payment receipt not found.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll bottomPad={120}>
      <View style={{ gap: 14 }}>
        <View style={{ paddingTop: 6, paddingBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.22)",
                backgroundColor: "#FFFFFF",
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: "900" }}>
                Credit Payment Receipt
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Risiti ya punguzo la deni.
              </Text>
            </View>
          </View>
        </View>

        <Card
          style={{
            gap: 14,
            padding: 18,
            borderColor: "rgba(148,163,184,0.22)",
            backgroundColor: "#FFFFFF",
            shadowColor: "#0F172A",
            shadowOpacity: 0.08,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 3,
          }}
        >
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 20,
                letterSpacing: 0.6,
              }}
            >
              ZETRA BMS
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 1.2,
              }}
            >
              CREDIT PAYMENT RECEIPT
            </Text>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Customer
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {account?.customer_name ?? "Customer"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Phone
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {account?.phone ?? "No phone"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Store
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {activeStoreName ?? "—"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Date / Time
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {when}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Method
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentMethodLabel}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Reference
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentReferenceLabel}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "800", flex: 0.95 }}>
                Payment ID
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: "900",
                  flex: 1.4,
                  textAlign: "right",
                }}
              >
                {paymentIdLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.22)",
              borderRadius: theme.radius.xl,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#F8FAFC",
              }}
            >
             <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
  Payment Paid
</Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {money.fmt(balanceBefore)}
              </Text>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: "rgba(148,163,184,0.18)",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "rgba(16,185,129,0.08)",
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Paid Today
              </Text>
            <View style={{ alignItems: "flex-end" }}>
  <Text style={{ color: theme.colors.emerald, fontWeight: "900" }}>
    {money.fmt(amountPaid)}
  </Text>
  <Text style={{ color: theme.colors.faint, fontWeight: "800", fontSize: 11, marginTop: 3 }}>
    {when}
  </Text>
</View>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: "rgba(148,163,184,0.18)",
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: "900" }}>
                Balance After Payment
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "900" }}>
                {money.fmt(balanceAfter)}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 1,
              backgroundColor: "rgba(148,163,184,0.20)",
            }}
          />

          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 13 }}>
              THANK YOU
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontWeight: "800",
                fontSize: 12,
                textAlign: "center",
                lineHeight: 18,
              }}
            >
              Hii ni risiti rasmi ya punguzo la deni la mteja.
            </Text>
            <Text
              style={{
                color: theme.colors.faint,
                fontWeight: "800",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              {paymentTxn?.note ? String(paymentTxn.note) : "No extra note"}
            </Text>
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={onShareReceipt}
            style={({ pressed }) => ({
              minHeight: 56,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#059669",
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#059669",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
              Share Receipt
            </Text>
          </Pressable>

          <Button
            title="Share as PDF"
            onPress={onShareReceiptPdf}
            variant="secondary"
          />

          <Button
            title="Edit Payment"
            onPress={openEdit}
            variant="secondary"
          />

          <Button
            title={deletingPayment ? "Deleting..." : "Delete Payment"}
            onPress={deletePayment}
            variant="secondary"
          />

          <Button
            title="Back to Credit Detail"
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      </View>

      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.42)", justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setEditOpen(false)}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 18,
              gap: 12,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.22)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: "900" }}>
              Edit Payment
            </Text>

            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={theme.colors.faint}
              style={{
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "900",
                fontSize: 16,
              }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              {["CASH", "MOBILE", "BANK"].map((m) => {
                const active = editMethod === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setEditMethod(m)}
                    style={{
                      flex: 1,
                      minHeight: 46,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.emeraldBorder : "rgba(148,163,184,0.24)",
                      backgroundColor: active ? "rgba(16,185,129,0.10)" : "#FFFFFF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.emerald : theme.colors.text, fontWeight: "900" }}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={editReference}
              onChangeText={setEditReference}
              placeholder="Reference optional"
              placeholderTextColor={theme.colors.faint}
              style={{
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "900",
              }}
            />

            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Note optional"
              placeholderTextColor={theme.colors.faint}
              multiline
              style={{
                minHeight: 76,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: theme.colors.text,
                fontWeight: "800",
              }}
            />

            <Pressable
              onPress={saveEdit}
              disabled={savingEdit}
              style={{
                minHeight: 54,
                borderRadius: 18,
                backgroundColor: "#059669",
                alignItems: "center",
                justifyContent: "center",
                opacity: savingEdit ? 0.6 : 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setEditOpen(false)}
              style={{
                minHeight: 54,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.24)",
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 16 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}