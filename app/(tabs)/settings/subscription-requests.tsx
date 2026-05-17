// app/(tabs)/settings/subscription-requests.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import {
  requestReadSMSPermission,
  startReadSMS,
} from "@maniac-tech/react-native-expo-read-sms";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

type OfficeTab = "REQUESTS" | "PARTNERS";
type RequestFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function clean(s: any) {
  return String(s ?? "").trim();
}

function upper(s: any) {
  return clean(s).toUpperCase();
}

function digitsOnly(s: any) {
  return clean(s).replace(/\D/g, "");
}

function isUsefulPhone(s: any) {
  const d = digitsOnly(s);
  return d.length >= 7;
}

function isUsefulName(s: any) {
  const v = clean(s);
  if (!v) return false;
  if (v.length < 4) return false;
  if (/^[A-Z]{1,4}$/i.test(v)) return false;
  return true;
}

type RequestRow = {
  id: string;
  organization_id: string;
  submitted_by: string;
  plan_code: string;
  duration_months: number;
  expected_amount: number;
  submitted_amount: number;
  transaction_reference: string;
  payer_phone: string;
  payer_name: string | null;
  raw_sms?: string | null;
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  approved_at: string | null;
  approved_by: string | null;
  updated_at?: string | null;
};

type OfficeSmsMatchRow = {
  id: string;
  sms_log_id: string;
  request_id: string | null;
  match_status: string | null;
  confidence_score: number | null;
  reference_match: boolean | null;
  amount_match: boolean | null;
  phone_match: boolean | null;
  time_match: boolean | null;
  decision_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  review_required: boolean | null;
  auto_approved: boolean | null;
  notes: string | null;
};

type ParsedPaymentRow = {
  provider_family?: string | null;
  provider_code?: string | null;
  country_code?: string | null;
  direction?: string | null;
  transaction_reference?: string | null;
  amount_value?: number | string | null;
  currency_code?: string | null;
  sender_phone?: string | null;
  sender_name?: string | null;
  raw_text?: string | null;
  parse_status?: string | null;
  confidence_score?: number | null;
  parse_notes?: string | null;
};

type ParsedPaymentResult = {
  parsedRef: string;
  parsedPhone: string;
  parsedAmt: string;
  parsedName: string;
  parsedScore: string;
  providerFamily: string;
  providerCode: string;
  currencyCode: string;
  countryCode: string;
  direction: string;
  parseStatus: string;
  parseNotes: string;
};

type PartnerSummaryRow = {
  total_partners?: number | null;
  active_partners?: number | null;
  total_referrals?: number | null;
  active_referrals?: number | null;
  total_earned_tzs?: number | null;
  total_paid_tzs?: number | null;
  total_unpaid_tzs?: number | null;
};

type PartnerListRow = {
  partner_id: string;
  user_id: string;
  email_snapshot: string;
  full_name_snapshot: string | null;
  phone_snapshot: string | null;
  referral_code: string;
  status: string;
  total_referrals: number | null;
  active_referrals: number | null;
  total_earned_tzs: number | null;
  total_paid_tzs: number | null;
  total_unpaid_tzs: number | null;
  created_at: string | null;
  activated_at: string | null;
};

type PartnerReferralRow = {
  referral_id: string;
  referred_user_id: string;
  referred_email_snapshot: string;
  referral_code_used: string;
  status: string;
  linked_at: string | null;
  ended_at: string | null;
  total_commission_tzs: number | null;
  paid_commission_tzs: number | null;
  unpaid_commission_tzs: number | null;
};

type PartnerCommissionRow = {
  commission_id: string;
  referral_id: string;
  referred_user_id: string;
  referred_email_snapshot: string;
  subscription_payment_request_id: string;

  payment_amount_tzs: number | null;
  monthly_charge_tzs?: number | null;
  months_paid_count?: number | null;
  commission_month_number?: number | null;

  commission_percent: number | null;
  commission_amount_tzs: number | null;
  payment_sequence_number: number | null;
  commission_status: string;

  earned_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  unlock_at?: string | null;

  payout_id: string | null;
  notes: string | null;
};

type PartnerPayoutRow = {
  payout_id: string;
  payout_amount_tzs: number | null;
  payout_status: string;
  payout_method: string;
  payout_reference: string | null;
  payout_note: string | null;
  payout_date: string | null;
  created_at: string | null;
};

type OfficePartnerPayoutProfileRow = {
  partner_id: string;
  email_snapshot: string | null;
  full_name_snapshot: string | null;
  payout_method: string | null;
  payout_phone: string | null;
  payout_account_name: string | null;
  payout_notes: string | null;
  payout_updated_at: string | null;
};

function fmtMoney(v: any, currencyCode?: string | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";

  const code = upper(currencyCode || "TZS");
  return `${code} ${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDateTime(v: any) {
  const s = clean(v);
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return s;
  }
}

function hasMoney(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function hasCount(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isReadyCommission(status: any) {
  const s = upper(status);
  return s === "EARNED" || s === "APPROVED";
}

function isLockedCommission(status: any) {
  return upper(status) === "LOCKED";
}

function isPaidCommission(status: any) {
  return upper(status) === "PAID";
}

function fmtBool(v: any) {
  if (v === true) return "YES";
  if (v === false) return "NO";
  return "—";
}

function fmtScore(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function normalizeAmountText(v: any) {
  const raw = clean(v).replace(/,/g, "");
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function statusTone(status: string) {
  const s = upper(status);
  if (s === "APPROVED") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.10)",
    };
  }
  if (s === "REJECTED") {
    return {
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.10)",
    };
  }
  return {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.10)",
  };
}

function partnerStatusTone(status: string) {
  const s = upper(status);

  if (s === "ACTIVE") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.12)",
      text: "ACTIVE",
    };
  }

  if (s === "SUSPENDED") {
    return {
      borderColor: "rgba(239,68,68,0.35)",
      backgroundColor: "rgba(239,68,68,0.12)",
      text: "SUSPENDED",
    };
  }

  if (s === "PENDING") {
    return {
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.12)",
      text: "PENDING",
    };
  }

  return {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    text: s || "UNKNOWN",
  };
}

function hasMoneySignal(text: string) {
  const t = clean(text).toLowerCase();
  return (
    t.includes("tsh") ||
    t.includes("tshs") ||
    t.includes("tzs") ||
    t.includes("amount") ||
    t.includes("kiasi") ||
    t.includes("salio") ||
    /\b\d[\d,]*\.\d{2}\b/.test(t) ||
    /\b\d[\d,]*\b/.test(t)
  );
}

function hasIncomingWords(text: string) {
  const t = clean(text).toLowerCase();
  return (
    t.includes("umepokea") ||
    t.includes("umelipwa") ||
    t.includes("received") ||
    t.includes("credited") ||
    t.includes("credit alert") ||
    t.includes("incoming payment") ||
    t.includes("imethibitishwa. umepokea") ||
    t.includes("imethibitishwa umepokea") ||
    t.includes("imeingia") ||
    t.includes("deposit received")
  );
}

function hasProviderSignal(text: string) {
  const t = clean(text).toLowerCase();
  return (
    t.includes("m-pesa") ||
    t.includes("mpesa") ||
    t.includes("vodacom") ||
    t.includes("airtel money") ||
    t.includes("airtelmoney") ||
    t.includes("tigopesa") ||
    t.includes("tigo pesa") ||
    t.includes("mixx") ||
    t.includes("halopesa") ||
    t.includes("halo pesa") ||
    t.includes("ezypesa") ||
    t.includes("tpb") ||
    t.includes("crdb") ||
    t.includes("nmb") ||
    t.includes("nbc") ||
    t.includes("bank") ||
    t.includes("benki")
  );
}

function hasUsefulReferenceSignal(text: string) {
  const t = upper(text);
  if (!t) return false;

  return (
    /(?:^|\s)(?:TID|TXN|TX|TRANS(?:ACTION)?|RECEIPT|REFERENCE|REF|KUMBUKUMBU|MUAMALA)\s*[:#-]?\s*[A-Z0-9._-]{6,}/i.test(
      t
    ) ||
    /\b[A-Z0-9]+(?:[._-][A-Z0-9]+)+\b/.test(t) ||
    /\b[A-Z]{2,}[0-9]{4,}[A-Z0-9._-]*\b/.test(t)
  );
}

function isLikelyOutgoingOrDebitSms(text: string) {
  const t = clean(text).toLowerCase();
  if (!t) return false;

  return (
    t.includes("imetolewa") ||
    t.includes("umehamisha") ||
    t.includes("umetuma") ||
    t.includes("umelipa") ||
    t.includes("debited") ||
    t.includes("debit") ||
    t.includes("sent to") ||
    t.includes("send money") ||
    t.includes("withdraw") ||
    t.includes("withdrawn") ||
    t.includes("cash out") ||
    t.includes("umetoa") ||
    t.includes("transfer kwenda") ||
    t.includes("to account") ||
    t.includes("kwa wakala") ||
    t.includes("umefanya malipo") ||
    t.includes("payment sent") ||
    t.includes("paid out") ||
    t.includes("kutoka ac:") ||
    t.includes("kwenda mpesa") ||
    t.includes("kutoka account") ||
    t.includes("from ac:") ||
    t.includes("from account") ||
    t.includes("makato") ||
    t.includes("withdrawal") ||
    t.includes("purchase completed")
  );
}

function isStrongIncomingPaymentSms(text: string) {
  const t = clean(text);
  if (!t) return false;

  const lowered = t.toLowerCase();

  if (isLikelyOutgoingOrDebitSms(lowered)) return false;

  const incoming = hasIncomingWords(lowered);
  const money = hasMoneySignal(lowered);
  const provider = hasProviderSignal(lowered);
  const reference = hasUsefulReferenceSignal(t);

  if (incoming && money && reference) return true;
  if (incoming && money && provider) return true;

  return false;
}

function shouldAutoProcessSms(text: string) {
  return isStrongIncomingPaymentSms(text);
}

function parseIncomingLibrarySms(payload: any): { sender: string; body: string } {
  if (typeof payload === "string") {
    const raw = clean(payload);

    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1);
      const firstComma = inner.indexOf(",");
      if (firstComma > -1) {
        const sender = clean(inner.slice(0, firstComma));
        const body = clean(inner.slice(firstComma + 1));
        return { sender, body };
      }
    }

    return { sender: "", body: raw };
  }

  if (payload && typeof payload === "object") {
    const sender =
      clean((payload as any)?.originatingAddress) ||
      clean((payload as any)?.address) ||
      clean((payload as any)?.sender) ||
      clean((payload as any)?.phoneNumber);

    const body =
      clean((payload as any)?.body) ||
      clean((payload as any)?.message) ||
      clean((payload as any)?.sms);

    return { sender, body };
  }

  return { sender: "", body: "" };
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          height: 46,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: disabled
            ? "rgba(255,255,255,0.10)"
            : danger
            ? "rgba(239,68,68,0.35)"
            : UI.emeraldBorder,
          backgroundColor: disabled
            ? "rgba(255,255,255,0.04)"
            : danger
            ? "rgba(239,68,68,0.10)"
            : "rgba(16,185,129,0.12)",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.55 : pressed ? 0.95 : 1,
          flex: 1,
        },
      ]}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? UI.emeraldBorder : "rgba(255,255,255,0.10)",
          backgroundColor: active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function SubscriptionRequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [errorText, setErrorText] = useState("");
  const isRefreshingRef = useRef(false);

  const [rejectingId, setRejectingId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");

  const [filter, setFilter] = useState<RequestFilter>("PENDING");
  const [officeTab, setOfficeTab] = useState<OfficeTab>(
    upper(clean(params?.tab)) === "PARTNERS" ? "PARTNERS" : "REQUESTS"
  );

  const [smsText, setSmsText] = useState("");
  const [smsSender, setSmsSender] = useState("");
  const [smsReference, setSmsReference] = useState("");
  const [smsAmount, setSmsAmount] = useState("");
  const [parsedPayerName, setParsedPayerName] = useState("");
  const [parseConfidence, setParseConfidence] = useState("");
  const [parsedProviderFamily, setParsedProviderFamily] = useState("");
  const [parsedProviderCode, setParsedProviderCode] = useState("");
  const [parsedCurrencyCode, setParsedCurrencyCode] = useState("");
  const [parsedCountryCode, setParsedCountryCode] = useState("");
  const [parsedDirection, setParsedDirection] = useState("");
  const [parsedStatus, setParsedStatus] = useState("");
  const [parsedNotes, setParsedNotes] = useState("");
  const [parsingSms, setParsingSms] = useState(false);

  const [ingestingSms, setIngestingSms] = useState(false);
  const [matchingSms, setMatchingSms] = useState(false);
  const [lastSmsLogId, setLastSmsLogId] = useState("");
  const [lastMatchId, setLastMatchId] = useState("");
  const [lastMatchRow, setLastMatchRow] = useState<OfficeSmsMatchRow | null>(null);

  const [smsPermissionGranted, setSmsPermissionGranted] = useState(false);
  const [officeListenerStarted, setOfficeListenerStarted] = useState(false);
  const [officeListenerStatus, setOfficeListenerStatus] = useState("OFF");

  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersBusy, setPartnersBusy] = useState(false);
  const [partnerSummary, setPartnerSummary] = useState<PartnerSummaryRow | null>(null);
  const [partners, setPartners] = useState<PartnerListRow[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerListRow | null>(null);
  const [partnerErrorText, setPartnerErrorText] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerFullName, setPartnerFullName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [partnerNotes, setPartnerNotes] = useState("");

  const [partnerDetailLoading, setPartnerDetailLoading] = useState(false);
  const [partnerReferrals, setPartnerReferrals] = useState<PartnerReferralRow[]>([]);
  const [partnerCommissions, setPartnerCommissions] = useState<PartnerCommissionRow[]>([]);
  const [partnerPayouts, setPartnerPayouts] = useState<PartnerPayoutRow[]>([]);
  const [partnerDetailErrorText, setPartnerDetailErrorText] = useState("");

  const [selectedPartnerPayoutProfile, setSelectedPartnerPayoutProfile] =
    useState<OfficePartnerPayoutProfileRow | null>(null);

  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>([]);
  const [payoutMethod, setPayoutMethod] = useState("MOBILE_MONEY");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [creatingPayout, setCreatingPayout] = useState(false);

  const titleRightLabel = useMemo(
    () => (officeTab === "PARTNERS" ? "Partners" : "Office"),
    [officeTab]
  );

  const resetParsedUi = useCallback(() => {
    setParsedPayerName("");
    setParseConfidence("");
    setParsedProviderFamily("");
    setParsedProviderCode("");
    setParsedCurrencyCode("");
    setParsedCountryCode("");
    setParsedDirection("");
    setParsedStatus("");
    setParsedNotes("");
  }, []);

  const loadRequests = useCallback(
    async (forcedFilter?: RequestFilter) => {
      const activeFilter = forcedFilter ?? filter;

      setLoading(true);
      setErrorText("");

      try {
        let query = supabase
          .from("subscription_payment_requests")
          .select(
            `
              id,
              organization_id,
              submitted_by,
              plan_code,
              duration_months,
              expected_amount,
              submitted_amount,
              transaction_reference,
              payer_phone,
              payer_name,
              raw_sms,
              status,
              admin_note,
              rejection_reason,
              submitted_at,
              approved_at,
              approved_by,
              updated_at
            `
          )
          .order("submitted_at", { ascending: false });

        if (activeFilter !== "ALL") {
          query = query.eq("status", activeFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        setRequests((data ?? []) as RequestRow[]);
      } catch (e: any) {
        setRequests([]);
        setErrorText(
          e?.message ??
            "Failed to load requests. Backend office-access SQL bado haijafungwa kikamilifu."
        );
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  const loadLatestMatchById = useCallback(async (matchId: string) => {
    const id = clean(matchId);
    if (!id) {
      setLastMatchRow(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("office_sms_matches")
        .select(
          `
            id,
            sms_log_id,
            request_id,
            match_status,
            confidence_score,
            reference_match,
            amount_match,
            phone_match,
            time_match,
            decision_reason,
            reviewed_by,
            reviewed_at,
            created_at,
            updated_at,
            review_required,
            auto_approved,
            notes
          `
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      setLastMatchRow((data ?? null) as OfficeSmsMatchRow | null);
    } catch (e: any) {
      setLastMatchRow(null);
      Alert.alert("Match result", e?.message ?? "Failed to load latest match result.");
    }
  }, []);

  const loadPartnersModule = useCallback(async () => {
    setPartnersLoading(true);
    setPartnerErrorText("");

    try {
      await supabase.rpc("gp_unlock_due_commissions_v1");

      const [{ data: summaryData, error: summaryError }, { data: listData, error: listError }] =
        await Promise.all([
          supabase.rpc("gp_office_dashboard_summary_v1"),
          supabase.rpc("gp_list_partners_v1"),
        ]);

      if (summaryError) throw summaryError;
      if (listError) throw listError;

      const summaryRow = Array.isArray(summaryData)
        ? ((summaryData?.[0] ?? null) as PartnerSummaryRow | null)
        : ((summaryData ?? null) as PartnerSummaryRow | null);

      setPartnerSummary(summaryRow ?? null);
      setPartners((Array.isArray(listData) ? listData : []) as PartnerListRow[]);
    } catch (e: any) {
      setPartnerSummary(null);
      setPartners([]);
      setPartnerErrorText(
        clean(e?.message) || "Failed to load Growth Partners dashboard."
      );
    } finally {
      setPartnersLoading(false);
    }
  }, []);


const loadSelectedPartnerDetail = useCallback(async (partnerId: string) => {
  const id = clean(partnerId);
  if (!id) {
    setPartnerReferrals([]);
    setPartnerCommissions([]);
    setPartnerPayouts([]);
    setPartnerDetailErrorText("");
    return;
  }

  setPartnerDetailLoading(true);
  setPartnerDetailErrorText("");

  try {
    await supabase.rpc("gp_unlock_due_commissions_v1");

    const [
      { data: referralsData, error: referralsError },
      { data: commissionsData, error: commissionsError },
      { data: payoutsData, error: payoutsError },
    ] = await Promise.all([
      supabase.rpc("gp_list_partner_referrals_v1", { p_partner_id: id }),
      supabase.rpc("gp_list_partner_commissions_v1", { p_partner_id: id }),
      supabase.rpc("gp_list_partner_payouts_v1", { p_partner_id: id }),
    ]);

    if (referralsError) throw referralsError;
    if (commissionsError) throw commissionsError;
    if (payoutsError) throw payoutsError;

    setPartnerReferrals(
      (Array.isArray(referralsData) ? referralsData : []) as PartnerReferralRow[]
    );

    const commissionRows = (Array.isArray(commissionsData)
      ? commissionsData
      : []) as PartnerCommissionRow[];

    commissionRows.sort((a, b) => {
      const aPaidAt = clean(a.paid_at);
      const bPaidAt = clean(b.paid_at);

      if (aPaidAt && bPaidAt) {
        return new Date(bPaidAt).getTime() - new Date(aPaidAt).getTime();
      }

      const aUnlock = clean(a.unlock_at);
      const bUnlock = clean(b.unlock_at);

      if (aUnlock && bUnlock) {
        return new Date(aUnlock).getTime() - new Date(bUnlock).getTime();
      }

      const aMonth = Number(a.commission_month_number ?? 0);
      const bMonth = Number(b.commission_month_number ?? 0);
      if (aMonth !== bMonth) return aMonth - bMonth;

      return (
        new Date(clean(b.earned_at) || 0).getTime() -
        new Date(clean(a.earned_at) || 0).getTime()
      );
    });

    setPartnerCommissions(commissionRows);

    setPartnerPayouts(
      (Array.isArray(payoutsData) ? payoutsData : []) as PartnerPayoutRow[]
    );
  } catch (e: any) {
    setPartnerReferrals([]);
    setPartnerCommissions([]);
    setPartnerPayouts([]);
    setPartnerDetailErrorText(
      clean(e?.message) || "Failed to load partner detail data."
    );
  } finally {
    setPartnerDetailLoading(false);
  }
}, []);

const loadSelectedPartnerPayoutProfile = useCallback(async (partnerId: string) => {
  const id = clean(partnerId);
  if (!id) {
    setSelectedPartnerPayoutProfile(null);
    return;
  }

  try {
    const { data, error } = await supabase.rpc("gp_office_get_partner_payout_profile_v1", {
      p_partner_id: id,
    });

    if (error) throw error;

    const row = Array.isArray(data)
      ? ((data?.[0] ?? null) as OfficePartnerPayoutProfileRow | null)
      : ((data ?? null) as OfficePartnerPayoutProfileRow | null);

    setSelectedPartnerPayoutProfile(row ?? null);

    if (clean(row?.payout_method)) {
      setPayoutMethod(upper(row?.payout_method));
    }
  } catch (e: any) {
    setSelectedPartnerPayoutProfile(null);
  }
}, []);

  const activatePartner = useCallback(async (partnerId: string) => {
  try {
    const { error } = await supabase.rpc("gp_set_partner_status_v1", {
      p_partner_id: partnerId,
      p_status: "ACTIVE",
      p_notes: null,
    });
    if (error) throw error;

    Alert.alert("Activated ✅", "Partner sasa yupo ACTIVE.");
    await loadPartnersModule();
    if (selectedPartner?.partner_id === partnerId) {
      await loadSelectedPartnerDetail(partnerId);
      await loadSelectedPartnerPayoutProfile(partnerId);
    }
  } catch (e: any) {
    Alert.alert("Activation failed", clean(e?.message));
  }
}, [loadPartnersModule, loadSelectedPartnerDetail, selectedPartner?.partner_id]);

const suspendPartner = useCallback(async (partnerId: string) => {
  try {
    const { error } = await supabase.rpc("gp_set_partner_status_v1", {
      p_partner_id: partnerId,
      p_status: "SUSPENDED",
      p_notes: null,
    });
    if (error) throw error;

    Alert.alert("Suspended ⚠️", "Partner ame-suspend.");
    await loadPartnersModule();
    if (selectedPartner?.partner_id === partnerId) {
      await loadSelectedPartnerDetail(partnerId);
      await loadSelectedPartnerPayoutProfile(partnerId);
    }
  } catch (e: any) {
    Alert.alert("Suspend failed", clean(e?.message));
  }
}, [loadPartnersModule, loadSelectedPartnerDetail, loadSelectedPartnerPayoutProfile, selectedPartner?.partner_id]);

const deletePartnerPermanently = useCallback(async (partner: PartnerListRow) => {
  const partnerId = clean(partner?.partner_id);
  if (!partnerId) return;

  Alert.alert(
    "Delete Growth Partner",
    `Unataka kumfuta kabisa ${clean(partner.full_name_snapshot) || clean(partner.email_snapshot) || "partner"}?\n\nReferral code yake haitafanya kazi tena na dashboard yake itaondoka.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: async () => {
          try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !enrolled) {
              Alert.alert("Biometric required", "Fingerprint/biometric haijawekwa kwenye kifaa hiki.");
              return;
            }

            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: "Confirm delete Growth Partner",
              cancelLabel: "Cancel",
              disableDeviceFallback: false,
            });

            if (!result.success) {
              Alert.alert("Cancelled", "Biometric verification failed.");
              return;
            }

            setPartnersBusy(true);

            const { error } = await supabase.rpc("gp_delete_partner_permanently_v1", {
              p_partner_id: partnerId,
            });

            if (error) throw error;

            if (selectedPartner?.partner_id === partnerId) {
              setSelectedPartner(null);
              setPartnerReferrals([]);
              setPartnerCommissions([]);
              setPartnerPayouts([]);
              setSelectedPartnerPayoutProfile(null);
            }

            Alert.alert("Deleted ✅", "Growth Partner amefutwa na code yake imezimwa.");
            await loadPartnersModule();
          } catch (e: any) {
            Alert.alert("Delete failed", clean(e?.message) || "Failed to delete partner.");
          } finally {
            setPartnersBusy(false);
          }
        },
      },
    ]
  );
}, [loadPartnersModule, selectedPartner?.partner_id]);

const registerPartner = useCallback(async () => {
  const email = clean(partnerEmail).toLowerCase();
  const fullName = clean(partnerFullName);
  const phone = clean(partnerPhone);
  const notes = clean(partnerNotes);

  if (!email) {
    Alert.alert("Email required", "Weka email ya Growth Partner kwanza.");
    return;
  }

  setPartnersBusy(true);
  try {
    const { error } = await supabase.rpc("gp_register_partner_v1", {
      p_email: email,
      p_full_name: fullName || null,
      p_phone: phone || null,
      p_notes: notes || null,
    });

    if (error) throw error;

    setPartnerEmail("");
    setPartnerFullName("");
    setPartnerPhone("");
    setPartnerNotes("");

    Alert.alert(
      "Growth Partner added ✅",
      "Partner amesajiliwa successfully na referral code yake imetengenezwa."
    );

    await loadPartnersModule();
  } catch (e: any) {
    Alert.alert(
      "Register failed",
      clean(e?.message) || "Failed to register Growth Partner."
    );
  } finally {
    setPartnersBusy(false);
  }
}, [loadPartnersModule, partnerEmail, partnerFullName, partnerNotes, partnerPhone]);
  const parseSmsFromText = useCallback(
    async (rawTextArg?: string, silent?: boolean): Promise<ParsedPaymentResult | null> => {
      const body = clean(rawTextArg ?? smsText);

      if (!body) {
        resetParsedUi();
        return null;
      }

      setParsingSms(true);
      setParsedStatus("PARSING");
      setParsedNotes("");

      try {
        const { data, error } = await supabase.rpc("parse_incoming_payment_message_v1", {
          p_raw_text: body,
        });

        if (error) throw error;

        const row: ParsedPaymentRow | null = Array.isArray(data)
          ? ((data?.[0] ?? null) as ParsedPaymentRow | null)
          : ((data ?? null) as ParsedPaymentRow | null);

        if (!row) {
          setParsedStatus("NO_RESULT");
          setParsedNotes("Parser hakurudisha row.");
          if (!silent) {
            Alert.alert("Parser", "Payment parser hakurudisha data.");
          }
          return null;
        }

        const parsedRef = upper(row.transaction_reference);
        const parsedPhoneRaw = clean(row.sender_phone);
        const parsedAmt = normalizeAmountText(row.amount_value);
        const parsedNameRaw = clean(row.sender_name);
        const parsedScore =
          row.confidence_score === null || row.confidence_score === undefined
            ? ""
            : fmtScore(row.confidence_score);

        const providerFamily = upper(row.provider_family);
        const providerCode = upper(row.provider_code);
        const currencyCode = upper(row.currency_code || "TZS");
        const countryCode = upper(row.country_code);
        const direction = upper(row.direction);
        const parseStatus = upper(row.parse_status || "PARSED");
        const parseNotes = clean(row.parse_notes);

        const parsedPhone = isUsefulPhone(parsedPhoneRaw) ? parsedPhoneRaw : "";
        const parsedName = isUsefulName(parsedNameRaw) ? parsedNameRaw : "";

        if (parsedRef) setSmsReference(parsedRef);
        if (parsedPhone) setSmsSender(parsedPhone);
        if (parsedAmt) setSmsAmount(parsedAmt);

        setParsedPayerName(parsedName);
        setParseConfidence(parsedScore);
        setParsedProviderFamily(providerFamily);
        setParsedProviderCode(providerCode);
        setParsedCurrencyCode(currencyCode);
        setParsedCountryCode(countryCode);
        setParsedDirection(direction);
        setParsedStatus(parseStatus);
        setParsedNotes(parseNotes);

        return {
          parsedRef,
          parsedPhone,
          parsedAmt,
          parsedName,
          parsedScore,
          providerFamily,
          providerCode,
          currencyCode,
          countryCode,
          direction,
          parseStatus,
          parseNotes,
        };
      } catch (e: any) {
        const msg = clean(e?.message) || "Failed to parse incoming payment text.";
        setParsedStatus("FAILED");
        setParsedNotes(msg);
        if (!silent) {
          Alert.alert("Parser failed", msg);
        }
        return null;
      } finally {
        setParsingSms(false);
      }
    },
    [resetParsedUi, smsText]
  );

  

  

  const runBiometricGate = useCallback(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !enrolled) {
        Alert.alert(
          "Biometric required",
          "Fingerprint/biometric haijawekwa kwenye kifaa hiki. Tafadhali weka biometric kwanza."
        );
        router.back();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Approve office billing access",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        Alert.alert("Access denied", "Biometric verification failed.");
        router.back();
        return;
      }

      setAuthed(true);
      await loadRequests("PENDING");
    } catch {
      Alert.alert("Access denied", "Biometric verification failed.");
      router.back();
    }
  }, [loadRequests, router]);

  const checkInternalAccess = useCallback(async () => {
    setCheckingAccess(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const email = clean(data?.user?.email).toLowerCase();
      const ok = email === INTERNAL_BILLING_EMAIL;

      setAllowed(ok);

      if (!ok) {
        Alert.alert("Restricted", "This screen is for ZETRA office billing only.");
        router.back();
        return;
      }

      await runBiometricGate();
    } catch {
      Alert.alert("Restricted", "Unable to verify internal office access.");
      router.back();
    } finally {
      setCheckingAccess(false);
    }
  }, [router, runBiometricGate]);

  useEffect(() => {
    void checkInternalAccess();
  }, [checkInternalAccess]);

  useEffect(() => {
    if (!authed) return;

    if (officeTab === "REQUESTS") {
      void loadRequests();
      return;
    }

    void loadPartnersModule();
  }, [authed, filter, officeTab, loadPartnersModule, loadRequests]);

  useEffect(() => {
    if (!selectedPartner?.partner_id) {
      setPartnerReferrals([]);
      setPartnerCommissions([]);
      setPartnerPayouts([]);
      setPartnerDetailErrorText("");
      setSelectedPartnerPayoutProfile(null);
      setShowPayoutForm(false);
      setSelectedCommissionIds([]);
      setPayoutMethod("MOBILE_MONEY");
      setPayoutReference("");
      setPayoutNote("");
      return;
    }

    setShowPayoutForm(false);
    setSelectedCommissionIds([]);
    setPayoutMethod("MOBILE_MONEY");
    setPayoutReference("");
    setPayoutNote("");

    void loadSelectedPartnerDetail(selectedPartner.partner_id);
    void loadSelectedPartnerPayoutProfile(selectedPartner.partner_id);
  }, [loadSelectedPartnerDetail, loadSelectedPartnerPayoutProfile, selectedPartner?.partner_id]);

  useEffect(() => {
    if (!authed || !allowed) return;

    const safeRefreshPartners = async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        if (officeTab === "PARTNERS") {
          await loadPartnersModule();
          if (selectedPartner?.partner_id) {
            await loadSelectedPartnerDetail(selectedPartner.partner_id);
            await loadSelectedPartnerPayoutProfile(selectedPartner.partner_id);
          }
        }
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const safeRefreshRequests = async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        if (officeTab === "REQUESTS") {
          await loadRequests();
        }
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const requestsChannel = supabase
      .channel(`office-subscription-requests-${filter}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payment_requests",
        },
        safeRefreshRequests
      )
      .subscribe();

    const partnersChannel = supabase
      .channel("office-growth-partners")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_profiles",
        },
        safeRefreshPartners
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_referrals",
        },
        safeRefreshPartners
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_commissions",
        },
        safeRefreshPartners
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "growth_partner_payouts",
        },
        safeRefreshPartners
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(requestsChannel);
      void supabase.removeChannel(partnersChannel);
    };
  }, [
    authed,
    allowed,
    filter,
    officeTab,
    loadPartnersModule,
    loadRequests,
    loadSelectedPartnerDetail,
    loadSelectedPartnerPayoutProfile,
    selectedPartner?.partner_id,
  ]);

  const approveRequest = useCallback(
    async (requestId: string) => {
      setBusyId(requestId);
      try {
        const { error } = await supabase.rpc("approve_subscription_payment_request_v1", {
          p_request_id: requestId,
          p_admin_note: "Approved by ZETRA office",
        });

        if (error) throw error;

        Alert.alert("Approved ✅", "Subscription request approved successfully.");
        isRefreshingRef.current = true;
        try {
          await loadRequests();
        } finally {
          isRefreshingRef.current = false;
        }
      } catch (e: any) {
        Alert.alert(
          "Approve failed",
          e?.message ??
            "Approval failed. SQL-4 office-only hardening/access may still be required."
        );
      } finally {
        setBusyId("");
      }
    },
    [loadRequests]
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      const reason = clean(rejectReason);
      if (!reason) {
        Alert.alert("Reason required", "Weka sababu ya kukataa request kwanza.");
        return;
      }

      setBusyId(requestId);
      try {
        const { error } = await supabase.rpc("reject_subscription_payment_request_v1", {
          p_request_id: requestId,
          p_rejection_reason: reason,
          p_admin_note: "Rejected by ZETRA office",
        });

        if (error) throw error;

        setRejectingId("");
        setRejectReason("");
        Alert.alert("Rejected", "Subscription request rejected successfully.");
        isRefreshingRef.current = true;
        try {
          await loadRequests();
        } finally {
          isRefreshingRef.current = false;
        }
      } catch (e: any) {
        Alert.alert(
          "Reject failed",
          e?.message ??
            "Reject failed. SQL-4 office-only hardening/access may still be required."
        );
      } finally {
        setBusyId("");
      }
    },
    [loadRequests, rejectReason]
  );



  const ingestOfficeSms = useCallback(
    async (override?: { body?: string; sender?: string }) => {
      const body = clean(override?.body ?? smsText);

      if (!body) {
        Alert.alert("SMS body required", "Bandika message ya malipo kutoka kwenye simu ya ofisi.");
        return "";
      }

      let sender = clean(override?.sender ?? smsSender);
      let reference = upper(smsReference);
      let amountNum = Number(String(smsAmount).replace(/,/g, "").trim());

      if (!sender || !reference || !Number.isFinite(amountNum) || amountNum <= 0) {
        const parsed = await parseSmsFromText(body, true);

        sender = sender || clean(parsed?.parsedPhone);
        reference = reference || upper(parsed?.parsedRef);
        amountNum =
          Number.isFinite(amountNum) && amountNum > 0
            ? amountNum
            : Number(String(parsed?.parsedAmt ?? "").replace(/,/g, "").trim());
      }

      if (!sender) {
        Alert.alert("Sender required", "Parser hakupata sender phone. Weka namba ya sender wa SMS.");
        return "";
      }

      if (!reference) {
        Alert.alert(
          "Reference required",
          "Parser hakupata transaction/reference. Weka reference ya kwenye SMS."
        );
        return "";
      }

      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        Alert.alert("Amount required", "Parser hakupata amount sahihi. Weka kiasi halisi cha SMS.");
        return "";
      }

      setIngestingSms(true);
      try {
        const { data, error } = await supabase.rpc("ingest_office_sms_v1", {
          p_raw_text: body,
          p_sender_phone: sender,
          p_sms_reference: reference,
          p_sms_amount: amountNum,
          p_sms_received_at: new Date().toISOString(),
        });

        if (error) throw error;

        const smsLogId = clean(data);
        setLastSmsLogId(smsLogId);
        setSmsText(body);
        setSmsSender(sender);
        setSmsReference(reference);
        setSmsAmount(String(Math.round(amountNum)));
        setOfficeListenerStatus("SMS INGESTED • WAITING MANUAL REVIEW");

        Alert.alert(
          "SMS saved ✅",
          "Office SMS imehifadhiwa. Sasa linganisha na request ya user kwa kutumia jina, namba ya simu, na ushahidi wa muamala."
        );

        return smsLogId;
      } catch (e: any) {
        Alert.alert("Ingest failed", clean(e?.message) || "Failed to ingest office SMS.");
        return "";
      } finally {
        setIngestingSms(false);
      }
    },
    [parseSmsFromText, smsAmount, smsReference, smsSender, smsText]
  );

  const runOfficeSmsMatch = useCallback(
    async (forcedSmsLogId?: string) => {
      const smsLogId = clean(forcedSmsLogId ?? lastSmsLogId);

      if (!smsLogId) {
        Alert.alert("No SMS log", "Ingest office SMS kwanza kabla ya ku-run match.");
        return "";
      }

      setMatchingSms(true);
      try {
        const { data, error } = await supabase.rpc("match_office_sms_v2", {
          p_sms_log_id: smsLogId,
        });

        if (error) throw error;

        const matchId = clean(data);
        setLastMatchId(matchId);
        await loadLatestMatchById(matchId);

        isRefreshingRef.current = true;
        try {
          await loadRequests();
        } finally {
          isRefreshingRef.current = false;
        }

        Alert.alert(
          "Match completed ✅",
          "Matcher ime-run kwa review tu. Hakuna auto approve wala auto activation."
        );

        return matchId;
      } catch (e: any) {
        Alert.alert("Match failed", e?.message ?? "Failed to run office SMS V2 matcher.");
        return "";
      } finally {
        setMatchingSms(false);
      }
    },
    [lastSmsLogId, loadLatestMatchById, loadRequests]
  );

  const startOfficeSmsListener = useCallback(async () => {
    if (Platform.OS !== "android") {
      Alert.alert("Android only", "Office SMS listener inafanya kazi kwenye Android pekee.");
      return;
    }

    try {
      setOfficeListenerStatus("REQUESTING PERMISSION");
      const granted = await requestReadSMSPermission();

      if (!granted) {
        setSmsPermissionGranted(false);
        setOfficeListenerStatus("PERMISSION DENIED");
        Alert.alert(
          "Permission denied",
          "Tafadhali ruhusu READ_SMS / RECEIVE_SMS kwenye simu ya office."
        );
        return;
      }

      setSmsPermissionGranted(true);
      setOfficeListenerStatus("STARTING LISTENER");

      startReadSMS(
        async (status: any, sms: any, error: any) => {
          const statusText = clean(status);

          if (statusText) {
            setOfficeListenerStatus(statusText);
          }

          if (error) {
            return;
          }

          const incoming = parseIncomingLibrarySms(sms);
          const sender = clean(incoming?.sender);
          const body = clean(incoming?.body);

          if (!body) return;

          if (!shouldAutoProcessSms(body)) {
            setOfficeListenerStatus("IGNORED • NON PAYMENT SMS");
            return;
          }

          try {
            setOfficeListenerStatus("SMS RECEIVED • REVIEW MANUALLY");
            setSmsText(body);
            if (sender) setSmsSender(sender);

            const parsed = await parseSmsFromText(body, true);

            const parsedRef = upper(parsed?.parsedRef);
            const parsedAmt = normalizeAmountText(parsed?.parsedAmt);
            const parsedPhone = clean(parsed?.parsedPhone || sender);
            const parsedName = clean(parsed?.parsedName);
            const parsedScore = clean(parsed?.parsedScore);

            if (parsedRef) setSmsReference(parsedRef);
            if (parsedAmt) setSmsAmount(parsedAmt);
            if (parsedPhone) setSmsSender(parsedPhone);
            if (parsedName) setParsedPayerName(parsedName);
            if (parsedScore) setParseConfidence(parsedScore);
          } catch (err) {
            console.warn("LISTENER PARSE ERROR:", err);
            setOfficeListenerStatus("SMS RECEIVED • PARSE REVIEW NEEDED");
          }
        },
        (status: any, sms: any, error: any) => {
          const statusText = clean(status);
          const message =
            clean(error) ||
            clean(sms) ||
            statusText ||
            "Failed to start office SMS listener.";

          setOfficeListenerStarted(false);
          setOfficeListenerStatus(statusText || "LISTENER FAILED");
          Alert.alert("Office listener", message);
        }
      );

      setOfficeListenerStarted(true);
      setOfficeListenerStatus("LISTENER ON • MANUAL REVIEW MODE");
      Alert.alert(
        "Office listener started ✅",
        "Simu hii sasa inasoma SMS mpya na kuziweka kwa review ya manual tu."
      );
    } catch (e: any) {
      setOfficeListenerStarted(false);
      setOfficeListenerStatus("LISTENER ERROR");
      Alert.alert("Office listener", e?.message ?? "Failed to start office SMS listener.");
    }
  }, [parseSmsFromText]);

  const renderItem = ({ item }: { item: RequestRow }) => {
    const isBusy = busyId === item.id;
    const isRejecting = rejectingId === item.id;
    const tone = statusTone(item.status);
    const status = upper(item.status);

    return (
      <Card
        style={{
          marginBottom: 12,
          borderWidth: 1,
          borderColor: tone.borderColor,
          backgroundColor: tone.backgroundColor,
        }}
      >
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
          {upper(item.plan_code)} • {item.duration_months} month{item.duration_months > 1 ? "s" : ""}
        </Text>

        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 8 }}>
          Status: <Text style={{ color: UI.text }}>{status}</Text>
        </Text>

        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Organization ID: <Text style={{ color: UI.text }}>{item.organization_id}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Amount expected: <Text style={{ color: UI.text }}>{fmtMoney(item.expected_amount, "TZS")}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Amount submitted: <Text style={{ color: UI.text }}>{fmtMoney(item.submitted_amount, "TZS")}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Phone: <Text style={{ color: UI.text }}>{item.payer_phone || "—"}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Payer name: <Text style={{ color: UI.text }}>{clean(item.payer_name) || "—"}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Reference: <Text style={{ color: UI.text }}>{item.transaction_reference || "—"}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            RAW SMS: <Text style={{ color: UI.text }}>{clean(item.raw_sms) ? "ATTACHED" : "—"}</Text>
          </Text>

          {clean(item.raw_sms) ? (
            <View
              style={{
                marginTop: 4,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "800", fontSize: 12, lineHeight: 18 }}>
                {clean(item.raw_sms)}
              </Text>
            </View>
          ) : null}

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Submitted at: <Text style={{ color: UI.text }}>{fmtDateTime(item.submitted_at)}</Text>
          </Text>

          {item.approved_at ? (
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Approved at: <Text style={{ color: UI.text }}>{fmtDateTime(item.approved_at)}</Text>
            </Text>
          ) : null}

          {item.approved_by ? (
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Approved by: <Text style={{ color: UI.text }}>{item.approved_by}</Text>
            </Text>
          ) : null}

          {clean(item.admin_note) ? (
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Admin note: <Text style={{ color: UI.text }}>{clean(item.admin_note)}</Text>
            </Text>
          ) : null}

          {clean(item.rejection_reason) ? (
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Rejection reason: <Text style={{ color: UI.text }}>{clean(item.rejection_reason)}</Text>
            </Text>
          ) : null}

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Request ID: <Text style={{ color: UI.text }}>{item.id}</Text>
          </Text>
        </View>

        {status === "PENDING" ? (
          isRejecting ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Reason for rejection"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{
                  minHeight: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  color: UI.text,
                  paddingHorizontal: 12,
                  fontWeight: "800",
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <PrimaryButton
                  label={isBusy ? "Please wait..." : "CONFIRM REJECT"}
                  onPress={() => void rejectRequest(item.id)}
                  danger
                  disabled={isBusy}
                />
                <PrimaryButton
                  label="CANCEL"
                  onPress={() => {
                    setRejectingId("");
                    setRejectReason("");
                  }}
                  disabled={isBusy}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={isBusy ? "Please wait..." : "APPROVE"}
                onPress={() => void approveRequest(item.id)}
                disabled={!!busyId}
              />
              <PrimaryButton
                label="REJECT"
                onPress={() => {
                  setRejectingId(item.id);
                  setRejectReason("");
                }}
                danger
                disabled={!!busyId}
              />
            </View>
          )
        ) : null}
      </Card>
    );
  };

  const parserReady = parsingSms
    ? "PARSING..."
    : clean(parsedStatus)
    ? clean(parsedStatus)
    : clean(parseConfidence)
    ? "READY"
    : "WAITING";

  const selectedPartnerStatus = upper(selectedPartner?.status);
  const selectedPartnerTone = partnerStatusTone(selectedPartner?.status || "");
  const partnerCanActivate = !!selectedPartner && selectedPartnerStatus !== "ACTIVE";
  const partnerCanSuspend = !!selectedPartner && selectedPartnerStatus !== "SUSPENDED";

  const unpaidPartnerCommissions = useMemo(() => {
    return partnerCommissions.filter((row) => {
      const s = upper(row.commission_status);
      return s === "EARNED" || s === "APPROVED";
    });
  }, [partnerCommissions]);

  const selectedPayoutTotal = useMemo(() => {
    return selectedCommissionIds.reduce((sum, id) => {
      const row = unpaidPartnerCommissions.find((x) => x.commission_id === id);
      return sum + Number(row?.commission_amount_tzs ?? 0);
    }, 0);
  }, [selectedCommissionIds, unpaidPartnerCommissions]);

  const readyCommissionCount = unpaidPartnerCommissions.length;

  useEffect(() => {
    if (!showPayoutForm) return;

    const readyIds = unpaidPartnerCommissions
      .map((row) => clean(row.commission_id))
      .filter(Boolean);

    setSelectedCommissionIds((prev) => {
      const validPrev = prev.filter((id) => readyIds.includes(id));

      if (validPrev.length > 0 && validPrev.length === prev.length) {
        return validPrev;
      }

      return readyIds;
    });
  }, [showPayoutForm, unpaidPartnerCommissions]);

  const toggleCommissionSelection = useCallback((commissionId: string) => {
    const id = clean(commissionId);
    if (!id) return;

    setSelectedCommissionIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);
const createPartnerPayout = useCallback(async () => {
  if (!selectedPartner?.partner_id) {
    Alert.alert("Partner required", "Chagua partner kwanza.");
    return;
  }

  if (partnerDetailLoading) {
    Alert.alert("Please wait", "Partner detail bado inaload. Subiri kwanza.");
    return;
  }

  if (selectedCommissionIds.length === 0) {
    Alert.alert("Select commissions", "Chagua angalau commission moja ya kulipa.");
    return;
  }

  const method = clean(payoutMethod).toUpperCase();
  if (!method) {
    Alert.alert("Method required", "Weka payout method.");
    return;
  }

  const selectedRows = unpaidPartnerCommissions.filter((row) =>
    selectedCommissionIds.includes(row.commission_id)
  );

  if (selectedRows.length !== selectedCommissionIds.length) {
    Alert.alert(
      "Selection invalid",
      "Baadhi ya commission ulizochagua si READY tena. Refresh detail kisha jaribu tena."
    );
    return;
  }

  const totalAmount = selectedRows.reduce(
    (sum, row) => sum + Number(row.commission_amount_tzs ?? 0),
    0
  );

  Alert.alert(
    "Confirm payout",
    `Unakaribia kurekodi payout ya ${fmtMoney(totalAmount, "TZS")} kwa commission ${selectedCommissionIds.length}. Uendelee?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "CONFIRM",
        onPress: async () => {
          setCreatingPayout(true);
          try {
            const { error } = await supabase.rpc("gp_create_partner_payout_v2", {
              p_partner_id: selectedPartner.partner_id,
              p_commission_ids: selectedCommissionIds,
              p_payout_method: method,
              p_payout_reference: clean(payoutReference) || null,
              p_payout_note: clean(payoutNote) || null,
            });

            if (error) throw error;

            Alert.alert(
              "Payout recorded ✅",
              "Partner payout imehifadhiwa successfully."
            );

            setShowPayoutForm(false);
            setSelectedCommissionIds([]);
            setPayoutMethod("MOBILE_MONEY");
            setPayoutReference("");
            setPayoutNote("");

            await loadSelectedPartnerDetail(selectedPartner.partner_id);
            await loadSelectedPartnerPayoutProfile(selectedPartner.partner_id);
            await loadPartnersModule();
          } catch (e: any) {
            Alert.alert(
              "Payout failed",
              clean(e?.message) || "Failed to create partner payout."
            );
          } finally {
            setCreatingPayout(false);
          }
        },
      },
    ]
  );
}, [
  loadPartnersModule,
  loadSelectedPartnerDetail,
  loadSelectedPartnerPayoutProfile,
  partnerDetailLoading,
  payoutMethod,
  payoutNote,
  payoutReference,
  selectedCommissionIds,
  selectedPartner,
  unpaidPartnerCommissions,
]);
  const renderPartnerSection = () => (
    <>
      <Card>
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
          ZETRA Growth Partners
        </Text>

        <Text
          style={{
            color: UI.muted,
            fontWeight: "800",
            fontSize: 12,
            marginTop: 8,
            lineHeight: 18,
          }}
        >
          Hapa Office inasajili Growth Partner kwa email, inaona referral code, performance,
          monthly commission releases, paid, na unpaid totals.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <View
            style={{
              minWidth: "47%",
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.22)",
              backgroundColor: "rgba(16,185,129,0.08)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Total Partners
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {Number(partnerSummary?.total_partners ?? 0).toLocaleString("en-US")}
            </Text>
          </View>

          <View
            style={{
              minWidth: "47%",
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.22)",
              backgroundColor: "rgba(16,185,129,0.08)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Active Partners
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {Number(partnerSummary?.active_partners ?? 0).toLocaleString("en-US")}
            </Text>
          </View>

          <View
            style={{
              minWidth: "47%",
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Total Referrals
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {Number(partnerSummary?.total_referrals ?? 0).toLocaleString("en-US")}
            </Text>
          </View>

          <View
            style={{
              minWidth: "47%",
              flex: 1,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              Active Referrals
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
              {Number(partnerSummary?.active_referrals ?? 0).toLocaleString("en-US")}
            </Text>
          </View>

          <View
            style={{
              width: "100%",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 16,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11 }}>
              All Generated
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
              {fmtMoney(partnerSummary?.total_earned_tzs ?? 0, "TZS")}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
              Total Paid
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {fmtMoney(partnerSummary?.total_paid_tzs ?? 0, "TZS")}
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 11, marginTop: 4 }}>
              Ready Unpaid
            </Text>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
              {fmtMoney(partnerSummary?.total_unpaid_tzs ?? 0, "TZS")}
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Register Growth Partner
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            <TextInput
              value={partnerEmail}
              onChangeText={setPartnerEmail}
              
              placeholder="Email ya Growth Partner"
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              keyboardType="email-address"
              returnKeyType="next"
              blurOnSubmit={false}
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <TextInput
              value={partnerFullName}
              onChangeText={setPartnerFullName}
              
              placeholder="Full name (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              returnKeyType="next"
              blurOnSubmit={false}
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <TextInput
              value={partnerPhone}
              onChangeText={setPartnerPhone}
              
              placeholder="Phone (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="phone-pad"
              returnKeyType="next"
              blurOnSubmit={false}
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <TextInput
              value={partnerNotes}
              onChangeText={setPartnerNotes}
              
              placeholder="Notes (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              blurOnSubmit={false}
              style={{
                minHeight: 88,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                paddingVertical: 12,
                fontWeight: "800",
                textAlignVertical: "top",
              }}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={partnersBusy ? "ADDING..." : "ADD GROWTH PARTNER"}
                onPress={() => void registerPartner()}
                disabled={partnersBusy || !clean(partnerEmail)}
              />
            </View>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
              Partners List
            </Text>

            <Pressable
              onPress={() => {
                if (partnersLoading) return;
                void loadPartnersModule();
              }}
              style={({ pressed }) => [
                {
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Ionicons name="refresh-outline" size={18} color={UI.text} />
            </Pressable>
          </View>

          {partnersLoading ? (
            <View style={{ marginTop: 14 }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Loading Growth Partners…
              </Text>
            </View>
          ) : partnerErrorText ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
                backgroundColor: "rgba(239,68,68,0.08)",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Growth Partners backend not ready
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                {partnerErrorText}
              </Text>
            </View>
          ) : partners.length === 0 ? (
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 14 }}>
              No Growth Partners yet.
            </Text>
          ) : (
            <View style={{ marginTop: 14, gap: 12 }}>
              {partners.map((item) => (
                <Pressable
                  key={item.partner_id}
                  onPress={() => setSelectedPartner(item)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      padding: 12,
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                      {clean(item.full_name_snapshot) || clean(item.email_snapshot) || "Growth Partner"}
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Email: <Text style={{ color: UI.text }}>{clean(item.email_snapshot) || "—"}</Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Phone: <Text style={{ color: UI.text }}>{clean(item.phone_snapshot) || "—"}</Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Code: <Text style={{ color: UI.text }}>{clean(item.referral_code) || "—"}</Text>
                    </Text>

                    <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: partnerStatusTone(item.status).borderColor,
                          backgroundColor: partnerStatusTone(item.status).backgroundColor,
                        }}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                          {partnerStatusTone(item.status).text}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Referrals:{" "}
                      <Text style={{ color: UI.text }}>
                        {Number(item.total_referrals ?? 0).toLocaleString("en-US")}
                      </Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Active referrals:{" "}
                      <Text style={{ color: UI.text }}>
                        {Number(item.active_referrals ?? 0).toLocaleString("en-US")}
                      </Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Earned: <Text style={{ color: UI.text }}>{fmtMoney(item.total_earned_tzs ?? 0, "TZS")}</Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Paid: <Text style={{ color: UI.text }}>{fmtMoney(item.total_paid_tzs ?? 0, "TZS")}</Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                      Unpaid: <Text style={{ color: UI.text }}>{fmtMoney(item.total_unpaid_tzs ?? 0, "TZS")}</Text>
                    </Text>

                    <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
  Created: <Text style={{ color: UI.text }}>{fmtDateTime(item.created_at)}</Text>
</Text>

<View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
  <PrimaryButton
    label="DETAIL"
    onPress={() => setSelectedPartner(item)}
    disabled={partnersBusy}
  />

  <PrimaryButton
    label="DELETE"
    danger
    onPress={() => void deletePartnerPermanently(item)}
    disabled={partnersBusy}
  />
</View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </View>

      {selectedPartner ? (
        <View style={{ marginTop: 12 }}>
          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                Partner Detail
              </Text>

              <View
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selectedPartnerTone.borderColor,
                  backgroundColor: selectedPartnerTone.backgroundColor,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                  {selectedPartnerTone.text}
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Email: <Text style={{ color: UI.text }}>{clean(selectedPartner.email_snapshot)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Code: <Text style={{ color: UI.text }}>{clean(selectedPartner.referral_code)}</Text>
              </Text>

              <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selectedPartnerTone.borderColor,
                    backgroundColor: selectedPartnerTone.backgroundColor,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
                    {selectedPartnerTone.text}
                  </Text>
                </View>
              </View>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                All generated: <Text style={{ color: UI.text }}>{fmtMoney(selectedPartner.total_earned_tzs ?? 0, "TZS")}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Ready unpaid: <Text style={{ color: UI.text }}>{fmtMoney(selectedPartner.total_unpaid_tzs ?? 0, "TZS")}</Text>
              </Text>
            </View>

            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 14,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Preferred payout destination
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Method: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_method) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Phone: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_phone) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Receiver name: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_account_name) || "—"}</Text>
              </Text>

              {!!clean(selectedPartnerPayoutProfile?.payout_notes) ? (
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Partner note: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_notes)}</Text>
                </Text>
              ) : null}

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Updated at: <Text style={{ color: UI.text }}>{fmtDateTime(selectedPartnerPayoutProfile?.payout_updated_at)}</Text>
              </Text>
            </View>

            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.20)",
                backgroundColor: "rgba(16,185,129,0.08)",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Monthly commission rule
              </Text>
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                Sequence 1 = 25%. Sequence 2 mpaka 12 = 10% kwa mwezi husika. Office inaona row
                moja moja ya mwezi badala ya mkupuo usioeleweka.
              </Text>
            </View>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={selectedPartnerStatus === "ACTIVE" ? "ALREADY ACTIVE" : "ACTIVATE"}
                onPress={() => void activatePartner(selectedPartner.partner_id)}
                disabled={!partnerCanActivate}
              />
              <PrimaryButton
                label={selectedPartnerStatus === "SUSPENDED" ? "ALREADY SUSPENDED" : "SUSPEND"}
                danger
                onPress={() => void suspendPartner(selectedPartner.partner_id)}
                disabled={!partnerCanSuspend}
              />
            </View>

            <View style={{ marginTop: 10, gap: 8 }}>
              <PrimaryButton
                label={readyCommissionCount > 0 ? "RECORD PAYOUT" : "NO READY COMMISSIONS"}
                onPress={() => {
                  if (readyCommissionCount === 0) return;

                  setShowPayoutForm((prev) => {
                    const next = !prev;

                    if (next) {
                      const readyIds = unpaidPartnerCommissions
                        .map((row) => clean(row.commission_id))
                        .filter(Boolean);

                      setSelectedCommissionIds(readyIds);
                    }

                    return next;
                  });
                }}
                disabled={readyCommissionCount === 0}
              />
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Ready commissions: <Text style={{ color: UI.text }}>{readyCommissionCount}</Text>
              </Text>
            </View>

            {showPayoutForm ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.25)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  borderRadius: 16,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                  Create Payout
                </Text>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Selected commissions: <Text style={{ color: UI.text }}>{selectedCommissionIds.length}</Text>
                </Text>

                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                  Total payout: <Text style={{ color: UI.text }}>{fmtMoney(selectedPayoutTotal, "TZS")}</Text>
                </Text>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 14,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                    Destination to be used
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Method: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_method) || payoutMethod || "—"}</Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Phone: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_phone) || "—"}</Text>
                  </Text>

                  <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                    Receiver name: <Text style={{ color: UI.text }}>{clean(selectedPartnerPayoutProfile?.payout_account_name) || "—"}</Text>
                  </Text>
                </View>

                <TextInput
                  value={payoutMethod}
                  onChangeText={(v) => setPayoutMethod(upper(v))}
                  placeholder="Payout method, mfano MOBILE_MONEY"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  autoCapitalize="characters"
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={payoutReference}
                  onChangeText={setPayoutReference}
                  placeholder="Payout reference (optional)"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    fontWeight: "800",
                  }}
                />

                <TextInput
                  value={payoutNote}
                  onChangeText={setPayoutNote}
                  placeholder="Payout note (optional)"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  multiline
                  style={{
                    minHeight: 88,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: UI.text,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    fontWeight: "800",
                    textAlignVertical: "top",
                  }}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <PrimaryButton
                    label={creatingPayout ? "SAVING..." : "CONFIRM PAYOUT"}
                    onPress={() => void createPartnerPayout()}
                    disabled={
                      creatingPayout ||
                      partnerDetailLoading ||
                      selectedCommissionIds.length === 0 ||
                      readyCommissionCount === 0
                    }
                  />
                  <PrimaryButton
                    label="RESET ALL"
                    danger
                    onPress={() => {
                      const readyIds = unpaidPartnerCommissions
                        .map((row) => clean(row.commission_id))
                        .filter(Boolean);

                      setSelectedCommissionIds(readyIds);
                      setPayoutReference("");
                      setPayoutNote("");
                    }}
                    disabled={creatingPayout}
                  />
                </View>
              </View>
            ) : null}

            {partnerDetailLoading ? (
              <View style={{ marginTop: 14 }}>
                <ActivityIndicator />
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                  Loading partner detail…
                </Text>
              </View>
            ) : partnerDetailErrorText ? (
              <View
                style={{
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.25)",
                  backgroundColor: "rgba(239,68,68,0.08)",
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  Partner detail not ready
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                  {partnerDetailErrorText}
                </Text>
              </View>
            ) : (
              <>
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    Referrals
                  </Text>

                  {partnerReferrals.length === 0 ? (
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                      No referrals yet.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {partnerReferrals.map((row) => (
                        <View
                          key={row.referral_id}
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.10)",
                            backgroundColor: "rgba(255,255,255,0.04)",
                            borderRadius: 14,
                            padding: 12,
                            gap: 4,
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                            {clean(row.referred_email_snapshot) || "Customer"}
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Status: <Text style={{ color: UI.text }}>{upper(row.status)}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Linked: <Text style={{ color: UI.text }}>{fmtDateTime(row.linked_at)}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Total commission: <Text style={{ color: UI.text }}>{fmtMoney(row.total_commission_tzs ?? 0, "TZS")}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Unpaid: <Text style={{ color: UI.text }}>{fmtMoney(row.unpaid_commission_tzs ?? 0, "TZS")}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    Commissions
                  </Text>

                  {partnerCommissions.length === 0 ? (
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                      No commissions yet.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {partnerCommissions.map((row) => {
                        const rowStatus = upper(row.commission_status);
                        const isPaid = isPaidCommission(row.commission_status);
                        const isLocked = isLockedCommission(row.commission_status);
                        const isSelectable = isReadyCommission(row.commission_status);
                        const isSelected = selectedCommissionIds.includes(row.commission_id);

                        return (
                          <Pressable
                            key={row.commission_id}
                            disabled={!isSelectable}
                            onPress={() => toggleCommissionSelection(row.commission_id)}
                            style={({ pressed }) => [
                              {
                                opacity: !isSelectable ? 0.7 : pressed ? 0.92 : 1,
                              },
                            ]}
                          >
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor: isSelected
                                  ? "rgba(16,185,129,0.40)"
                                  : isLocked
                                  ? "rgba(245,158,11,0.25)"
                                  : isPaid
                                  ? "rgba(16,185,129,0.25)"
                                  : "rgba(255,255,255,0.10)",
                                backgroundColor: isSelected
                                  ? "rgba(16,185,129,0.10)"
                                  : isLocked
                                  ? "rgba(245,158,11,0.08)"
                                  : isPaid
                                  ? "rgba(16,185,129,0.08)"
                                  : "rgba(255,255,255,0.04)",
                                borderRadius: 14,
                                padding: 12,
                                gap: 4,
                              }}
                            >
                              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                                {clean(row.referred_email_snapshot) || "Customer commission"}
                              </Text>

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Status: <Text style={{ color: UI.text }}>{rowStatus || "—"}</Text>
                              </Text>

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Global sequence: <Text style={{ color: UI.text }}>{row.payment_sequence_number ?? "—"}</Text>
                              </Text>

                              {hasCount(row.commission_month_number) ? (
                                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                  Commission month: <Text style={{ color: UI.text }}>{row.commission_month_number}</Text>
                                </Text>
                              ) : null}

                              {hasCount(row.months_paid_count) ? (
                                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                  Months paid in package: <Text style={{ color: UI.text }}>{row.months_paid_count}</Text>
                                </Text>
                              ) : null}

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Total payment: <Text style={{ color: UI.text }}>{fmtMoney(row.payment_amount_tzs ?? 0, "TZS")}</Text>
                              </Text>

                              {hasMoney(row.monthly_charge_tzs) ? (
                                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                  Monthly charge base: <Text style={{ color: UI.text }}>{fmtMoney(row.monthly_charge_tzs ?? 0, "TZS")}</Text>
                                </Text>
                              ) : null}

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Commission: <Text style={{ color: UI.text }}>{fmtMoney(row.commission_amount_tzs ?? 0, "TZS")}</Text>
                              </Text>

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Percent: <Text style={{ color: UI.text }}>{row.commission_percent ?? 0}%</Text>
                              </Text>

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Unlock at:{" "}
                                <Text style={{ color: UI.text }}>
                                  {clean(row.unlock_at) ? fmtDateTime(row.unlock_at) : isLocked ? "WAITING RELEASE" : "—"}
                                </Text>
                              </Text>

                              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                Earned at: <Text style={{ color: UI.text }}>{fmtDateTime(row.earned_at)}</Text>
                              </Text>

                              {isPaid ? (
                                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                  Paid at: <Text style={{ color: UI.text }}>{fmtDateTime(row.paid_at)}</Text>
                                </Text>
                              ) : null}

                              {!!clean(row.notes) ? (
                                <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                                  Engine note: <Text style={{ color: UI.text }}>{clean(row.notes)}</Text>
                                </Text>
                              ) : null}

                              {isSelectable ? (
                                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                                  {isSelected ? "SELECTED FOR PAYOUT" : "TAP TO SELECT"}
                                </Text>
                              ) : isPaid ? (
                                <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                                  ALREADY PAID
                                </Text>
                              ) : isLocked ? (
                                <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                                  LOCKED UNTIL RELEASE DATE
                                </Text>
                              ) : (
                                <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12, marginTop: 4 }}>
                                  NOT READY
                                </Text>
                              )}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                    Payout History
                  </Text>

                  {partnerPayouts.length === 0 ? (
                    <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8 }}>
                      No payouts yet.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 10, gap: 10 }}>
                      {partnerPayouts.map((row) => (
                        <View
                          key={row.payout_id}
                          style={{
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.10)",
                            backgroundColor: "rgba(255,255,255,0.04)",
                            borderRadius: 14,
                            padding: 12,
                            gap: 4,
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                            {fmtMoney(row.payout_amount_tzs ?? 0, "TZS")}
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Method: <Text style={{ color: UI.text }}>{clean(row.payout_method) || "—"}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Status: <Text style={{ color: UI.text }}>{upper(row.payout_status)}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Reference: <Text style={{ color: UI.text }}>{clean(row.payout_reference) || "—"}</Text>
                          </Text>
                          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                            Date: <Text style={{ color: UI.text }}>{fmtDateTime(row.payout_date)}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                label="CLOSE"
                onPress={() => {
                  setShowPayoutForm(false);
                  setSelectedCommissionIds([]);
                  setPayoutMethod("MOBILE_MONEY");
                  setPayoutReference("");
                  setPayoutNote("");
                  setSelectedPartner(null);
                }}
              />
            </View>
          </Card>
        </View>
      ) : null}
    </>
  );

  return (
    <Screen scroll>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 2,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            {
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 20 }}>
            Subscription Requests
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
            ZETRA Office Billing
          </Text>
        </View>

        <View
          style={{
            minWidth: 42,
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: UI.emeraldBorder,
            backgroundColor: "rgba(16,185,129,0.10)",
            marginRight: 4,
          }}
        >
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{titleRightLabel}</Text>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Access status
          </Text>

          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Internal account:{" "}
              <Text style={{ color: UI.text }}>
                {allowed ? "ALLOWED" : checkingAccess ? "CHECKING…" : "DENIED"}
              </Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Biometric gate:{" "}
              <Text style={{ color: UI.text }}>
                {authed ? "PASSED" : checkingAccess ? "WAITING…" : "NOT VERIFIED"}
              </Text>
            </Text>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Office Workspace
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <FilterPill
              label="REQUESTS"
              active={officeTab === "REQUESTS"}
              onPress={() => setOfficeTab("REQUESTS")}
            />
            <FilterPill
              label="GROWTH PARTNERS"
              active={officeTab === "PARTNERS"}
              onPress={() => setOfficeTab("PARTNERS")}
            />
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 10 }}>
            Chagua eneo la kazi la Office: subscription requests au ZETRA Growth Partners.
          </Text>
        </Card>
      </View>

      {officeTab === "PARTNERS" ? (
        <View style={{ marginTop: 12 }}>
          {renderPartnerSection()}
        </View>
      ) : null}

      {officeTab === "REQUESTS" ? (
  <>
    <View style={{ marginTop: 12 }}>
      <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Office SMS Live Listener
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
            Simu hii ya office itasikiliza SMS mpya zinazoingia. SMS zitatumika kama ushahidi wa
            muamala, kisha office itafanya review na comparison manually.
          </Text>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.25)",
              backgroundColor: "rgba(16,185,129,0.08)",
              borderRadius: 16,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Platform: <Text style={{ color: UI.text }}>{Platform.OS.toUpperCase()}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              SMS permission:{" "}
              <Text style={{ color: UI.text }}>
                {smsPermissionGranted ? "GRANTED" : "NOT GRANTED"}
              </Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Listener status: <Text style={{ color: UI.text }}>{clean(officeListenerStatus) || "OFF"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Mode: <Text style={{ color: UI.text }}>MANUAL REVIEW ONLY</Text>
            </Text>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <PrimaryButton
              label={officeListenerStarted ? "LISTENER ACTIVE" : "START OFFICE LISTENER"}
              onPress={() => void startOfficeSmsListener()}
              disabled={!authed || officeListenerStarted || Platform.OS !== "android"}
            />
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Office SMS Test Console
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
            Hapa office ina-review SMS za malipo na kufanya matching manually. Parser/matcher ni
            helper tu, siyo lazima kwa approval ya mwisho.
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            <TextInput
              value={smsText}
              onChangeText={setSmsText}
              placeholder="Bandika SMS kamili ya malipo hapa"
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              style={{
                minHeight: 110,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                paddingVertical: 12,
                fontWeight: "800",
                textAlignVertical: "top",
              }}
            />

            <TextInput
              value={smsSender}
              onChangeText={setSmsSender}
              placeholder="Sender phone, mfano 255760663390"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <TextInput
              value={smsReference}
              onChangeText={(v) => setSmsReference(upper(v))}
              placeholder="Reference ya SMS, mfano DK45NAH49QM"
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="characters"
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <TextInput
              value={smsAmount}
              onChangeText={setSmsAmount}
              placeholder="Amount ya SMS, mfano 45000"
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="number-pad"
              style={{
                minHeight: 52,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                color: UI.text,
                paddingHorizontal: 12,
                fontWeight: "800",
              }}
            />

            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parser status: <Text style={{ color: UI.text }}>{parserReady}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parse engine status: <Text style={{ color: UI.text }}>{clean(parsedStatus) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Provider family: <Text style={{ color: UI.text }}>{clean(parsedProviderFamily) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Provider code: <Text style={{ color: UI.text }}>{clean(parsedProviderCode) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Country code: <Text style={{ color: UI.text }}>{clean(parsedCountryCode) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Direction: <Text style={{ color: UI.text }}>{clean(parsedDirection) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Currency: <Text style={{ color: UI.text }}>{clean(parsedCurrencyCode) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parsed payer name: <Text style={{ color: UI.text }}>{clean(parsedPayerName) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parse confidence: <Text style={{ color: UI.text }}>{clean(parseConfidence) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parse notes: <Text style={{ color: UI.text }}>{clean(parsedNotes) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Payment-like SMS:{" "}
                <Text style={{ color: UI.text }}>
                  {shouldAutoProcessSms(smsText) ? "YES" : clean(smsText) ? "NO" : "—"}
                </Text>
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={parsingSms ? "PARSING..." : "PARSE SMS"}
                onPress={() => void parseSmsFromText(undefined, false)}
                disabled={parsingSms || ingestingSms || matchingSms || !clean(smsText)}
              />

              <PrimaryButton
                label={ingestingSms ? "SAVING..." : "INGEST SMS"}
                onPress={() => void ingestOfficeSms()}
                disabled={ingestingSms || matchingSms}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={matchingSms ? "MATCHING..." : "RUN MATCH"}
                onPress={() => void runOfficeSmsMatch()}
                disabled={!clean(lastSmsLogId) || ingestingSms || matchingSms || parsingSms}
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 16,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Latest SMS Log ID: <Text style={{ color: UI.text }}>{clean(lastSmsLogId) || "—"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Latest Match ID: <Text style={{ color: UI.text }}>{clean(lastMatchId) || "—"}</Text>
            </Text>
          </View>

          {lastMatchRow ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.25)",
                backgroundColor: "rgba(16,185,129,0.08)",
                borderRadius: 16,
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 13 }}>
                Latest match result
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Match status: <Text style={{ color: UI.text }}>{clean(lastMatchRow.match_status) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Confidence score: <Text style={{ color: UI.text }}>{fmtScore(lastMatchRow.confidence_score)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Reference match: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.reference_match)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Amount match: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.amount_match)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Phone match: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.phone_match)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Time match: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.time_match)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Review required: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.review_required)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Auto approved: <Text style={{ color: UI.text }}>{fmtBool(lastMatchRow.auto_approved)}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Request ID: <Text style={{ color: UI.text }}>{clean(lastMatchRow.request_id) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Notes: <Text style={{ color: UI.text }}>{clean(lastMatchRow.notes) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Created at: <Text style={{ color: UI.text }}>{fmtDateTime(lastMatchRow.created_at)}</Text>
              </Text>
            </View>
          ) : null}
        </Card>
      </View>

      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
            Request history
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <FilterPill
              label="PENDING"
              active={filter === "PENDING"}
              onPress={() => setFilter("PENDING")}
            />
            <FilterPill
              label="APPROVED"
              active={filter === "APPROVED"}
              onPress={() => setFilter("APPROVED")}
            />
            <FilterPill
              label="REJECTED"
              active={filter === "REJECTED"}
              onPress={() => setFilter("REJECTED")}
            />
            <FilterPill
              label="ALL"
              active={filter === "ALL"}
              onPress={() => setFilter("ALL")}
            />
          </View>

          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Active filter: <Text style={{ color: UI.text }}>{filter}</Text>
            </Text>

            <Pressable
              onPress={() => {
                if (isRefreshingRef.current) return;
                isRefreshingRef.current = true;
                void loadRequests().finally(() => {
                  isRefreshingRef.current = false;
                });
              }}
              style={({ pressed }) => [
                {
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Ionicons name="refresh-outline" size={18} color={UI.text} />
            </Pressable>
          </View>

          {checkingAccess || loading ? (
            <View style={{ marginTop: 14 }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Loading requests…
              </Text>
            </View>
          ) : errorText ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
                backgroundColor: "rgba(239,68,68,0.08)",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Backend access not ready
              </Text>
              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
                {errorText}
              </Text>
            </View>
          ) : requests.length === 0 ? (
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 14 }}>
              No {filter.toLowerCase()} requests right now.
            </Text>
          ) : (
            <View style={{ marginTop: 14 }}>
              <FlatList
                data={requests}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                scrollEnabled={false}
              />
            </View>
          )}
        </Card>
      </View>
</>
    ) : null}
<View
        style={{
          height: 24 + Math.max(insets.bottom, 0),
        }}
      />
    </Screen>
  );
}
      