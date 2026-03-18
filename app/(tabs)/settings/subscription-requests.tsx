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
import { useRouter } from "expo-router";
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

type RequestFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function clean(s: any) {
  return String(s ?? "").trim();
}

function upper(s: any) {
  return clean(s).toUpperCase();
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

type ParsedSmsRow = {
  parsed_reference?: string | null;
  parsed_amount?: number | string | null;
  parsed_phone?: string | null;
  parsed_name?: string | null;
  parse_confidence?: number | null;
};

function fmtMoneyTZS(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `TZS ${Math.round(n).toLocaleString("en-US")}`;
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

function isLikelyMpesaSms(text: string) {
  const t = clean(text).toLowerCase();
  if (!t) return false;

  return (
    t.includes("tsh") &&
    (t.includes("imethibitishwa") ||
      t.includes("umepokea") ||
      t.includes("umetuma") ||
      t.includes("kutoka") ||
      t.includes("kwenda")) &&
    t.includes("mnamo")
  );
}

function parseIncomingLibrarySms(payload: any): { sender: string; body: string } {
  if (typeof payload === "string") {
    const raw = clean(payload);

    // Common library shape: "[255760..., message body here]"
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
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const [rejectingId, setRejectingId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");

  const [filter, setFilter] = useState<RequestFilter>("PENDING");

  const [smsText, setSmsText] = useState("");
  const [smsSender, setSmsSender] = useState("");
  const [smsReference, setSmsReference] = useState("");
  const [smsAmount, setSmsAmount] = useState("");
  const [parsedPayerName, setParsedPayerName] = useState("");
  const [parseConfidence, setParseConfidence] = useState("");
  const [parsingSms, setParsingSms] = useState(false);

  const [ingestingSms, setIngestingSms] = useState(false);
  const [matchingSms, setMatchingSms] = useState(false);
  const [lastSmsLogId, setLastSmsLogId] = useState("");
  const [lastMatchId, setLastMatchId] = useState("");
  const [lastMatchRow, setLastMatchRow] = useState<OfficeSmsMatchRow | null>(null);

  const [smsPermissionGranted, setSmsPermissionGranted] = useState(false);
  const [officeListenerStarted, setOfficeListenerStarted] = useState(false);
  const [officeListenerStatus, setOfficeListenerStatus] = useState("OFF");
  const [officeAutoMode, setOfficeAutoMode] = useState(true);

  const lastProcessedFingerprintRef = useRef("");
  const autoHandlingRef = useRef(false);

  const titleRightLabel = useMemo(() => "Office", []);

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

  const parseSmsFromText = useCallback(
    async (rawTextArg?: string, silent?: boolean) => {
      const body = clean(rawTextArg ?? smsText);
      if (!body) {
        setParsedPayerName("");
        setParseConfidence("");
        return null;
      }

      setParsingSms(true);
      try {
        const { data, error } = await supabase.rpc("parse_tz_mpesa_sms_v1", {
          p_sms_text: body,
        });

        if (error) throw error;

        const row: ParsedSmsRow | null = Array.isArray(data)
          ? ((data?.[0] ?? null) as ParsedSmsRow | null)
          : ((data ?? null) as ParsedSmsRow | null);

        if (!row) {
          if (!silent) {
            Alert.alert("Parser", "SMS parser hakurudisha data.");
          }
          return null;
        }

        const parsedRef = upper(row.parsed_reference);
        const parsedPhone = clean(row.parsed_phone);
        const parsedAmt = normalizeAmountText(row.parsed_amount);
        const parsedName = clean(row.parsed_name);
        const parsedScore =
          row.parse_confidence === null || row.parse_confidence === undefined
            ? ""
            : fmtScore(row.parse_confidence);

        if (parsedRef) setSmsReference(parsedRef);
        if (parsedPhone) setSmsSender(parsedPhone);
        if (parsedAmt) setSmsAmount(parsedAmt);
        setParsedPayerName(parsedName);
        setParseConfidence(parsedScore);

        return {
          parsedRef,
          parsedPhone,
          parsedAmt,
          parsedName,
          parsedScore,
        };
      } catch (e: any) {
        if (!silent) {
          Alert.alert("Parser failed", e?.message ?? "Failed to parse SMS text.");
        }
        return null;
      } finally {
        setParsingSms(false);
      }
    },
    [smsText]
  );

  useEffect(() => {
    const body = clean(smsText);
    if (!body || body.length < 10) {
      setParsedPayerName("");
      setParseConfidence("");
      return;
    }

    const t = setTimeout(() => {
      void parseSmsFromText(body, true);
    }, 700);

    return () => clearTimeout(t);
  }, [smsText, parseSmsFromText]);

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
    void loadRequests();
  }, [authed, filter, loadRequests]);

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
        await loadRequests();
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
        await loadRequests();
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
        setLastMatchId("");
        setLastMatchRow(null);

        setSmsText(body);
        setSmsSender(sender);
        setSmsReference(reference);
        setSmsAmount(String(Math.round(amountNum)));

        if (!override) {
          Alert.alert("SMS ingested ✅", `Office SMS imehifadhiwa.\n\nSMS Log ID:\n${smsLogId}`);
        }

        return smsLogId;
      } catch (e: any) {
        Alert.alert("Ingest failed", e?.message ?? "Failed to ingest office SMS.");
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
        const { data, error } = await supabase.rpc("match_office_sms_v1", {
          p_sms_log_id: smsLogId,
        });

        if (error) throw error;

        const matchId = clean(data);
        setLastMatchId(matchId);
        await loadLatestMatchById(matchId);
        await loadRequests();

        if (!forcedSmsLogId) {
          Alert.alert("Match completed ✅", `Office SMS match imekamilika.\n\nMatch ID:\n${matchId}`);
        }

        return matchId;
      } catch (e: any) {
        Alert.alert("Match failed", e?.message ?? "Failed to run office SMS matcher.");
        return "";
      } finally {
        setMatchingSms(false);
      }
    },
    [lastSmsLogId, loadLatestMatchById, loadRequests]
  );

  const autoHandleOfficeSms = useCallback(
    async (senderInput: string, bodyInput: string) => {
      const sender = clean(senderInput);
      const body = clean(bodyInput);

      if (!body || !sender) return;
      if (!officeAutoMode) return;
      if (!isLikelyMpesaSms(body)) return;
      if (autoHandlingRef.current) return;

      const fingerprint = `${sender}||${body}`;
      if (lastProcessedFingerprintRef.current === fingerprint) return;

      autoHandlingRef.current = true;

      try {
        setSmsText(body);
        setSmsSender(sender);

        const parsed = await parseSmsFromText(body, true);

        const parsedRef = upper(parsed?.parsedRef);
        const parsedAmt = normalizeAmountText(parsed?.parsedAmt);
        const parsedPhone = clean(parsed?.parsedPhone);
        const parsedName = clean(parsed?.parsedName);
        const parsedScore = clean(parsed?.parsedScore);

        if (!parsedRef || !parsedAmt) {
          setOfficeListenerStatus("SMS RECEIVED • NOT M-PESA MATCHABLE");
          return;
        }

        setSmsReference(parsedRef);
        setSmsAmount(parsedAmt);
        if (parsedPhone) setSmsSender(parsedPhone);
        if (parsedName) setParsedPayerName(parsedName);
        if (parsedScore) setParseConfidence(parsedScore);

        const smsLogId = await ingestOfficeSms({
          body,
          sender: parsedPhone || sender,
        });

        if (!smsLogId) {
          setOfficeListenerStatus("AUTO INGEST FAILED");
          return;
        }

        const matchId = await runOfficeSmsMatch(smsLogId);

        if (!matchId) {
          setOfficeListenerStatus("AUTO MATCH FAILED");
          return;
        }

        lastProcessedFingerprintRef.current = fingerprint;
        setOfficeListenerStatus("AUTO MATCH COMPLETE");

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
          .eq("id", matchId)
          .maybeSingle();

        if (!error) {
          const row = (data ?? null) as OfficeSmsMatchRow | null;
          setLastMatchRow(row);

          if (row?.auto_approved) {
            Alert.alert(
              "Auto-approved ✅",
              "Office SMS imeingia, ime-match, na subscription imepitishwa moja kwa moja."
            );
          } else if (row?.review_required) {
            Alert.alert(
              "Review required",
              "SMS imeingia lakini inahitaji ukaguzi wa office kabla ya approval."
            );
          }
        }
      } finally {
        autoHandlingRef.current = false;
      }
    },
    [ingestOfficeSms, officeAutoMode, parseSmsFromText, runOfficeSmsMatch]
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
        (status: any, sms: any, error: any) => {
          const statusText = clean(status);

          if (statusText) {
            setOfficeListenerStatus(statusText);
          }

          if (error) {
            return;
          }

          if (
            statusText.toLowerCase().includes("start read sms successfully") ||
            statusText.toLowerCase() === "success"
          ) {
            const incoming = parseIncomingLibrarySms(sms);
            const sender = clean(incoming.sender);
            const body = clean(incoming.body);

            if (!body) return;

            setSmsText(body);
            if (sender) setSmsSender(sender);

            void autoHandleOfficeSms(sender, body);
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
      setOfficeListenerStatus("LISTENER ON");
      Alert.alert(
        "Office listener started ✅",
        "Simu hii ya office sasa inasikiliza SMS mpya za M-Pesa kwa auto ingest + auto match."
      );
    } catch (e: any) {
      setOfficeListenerStarted(false);
      setOfficeListenerStatus("LISTENER ERROR");
      Alert.alert("Office listener", e?.message ?? "Failed to start office SMS listener.");
    }
  }, [autoHandleOfficeSms]);

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
            Amount expected: <Text style={{ color: UI.text }}>{fmtMoneyTZS(item.expected_amount)}</Text>
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
            Amount submitted: <Text style={{ color: UI.text }}>{fmtMoneyTZS(item.submitted_amount)}</Text>
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
            Office SMS Live Listener
          </Text>

          <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12, marginTop: 8 }}>
            Simu hii ya office itasikiliza SMS mpya zinazoingia. ZETRA itachuja M-Pesa tu, kisha
            ifanye auto ingest + auto match.
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
              <Text style={{ color: UI.text }}>{smsPermissionGranted ? "GRANTED" : "NOT GRANTED"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Listener status: <Text style={{ color: UI.text }}>{clean(officeListenerStatus) || "OFF"}</Text>
            </Text>

            <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
              Auto mode: <Text style={{ color: UI.text }}>{officeAutoMode ? "ON" : "OFF"}</Text>
            </Text>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <PrimaryButton
              label={officeListenerStarted ? "LISTENER ACTIVE" : "START OFFICE LISTENER"}
              onPress={() => void startOfficeSmsListener()}
              disabled={!authed || officeListenerStarted || Platform.OS !== "android"}
            />
            <PrimaryButton
              label={officeAutoMode ? "AUTO MODE ON" : "AUTO MODE OFF"}
              onPress={() => setOfficeAutoMode((v) => !v)}
              danger={!officeAutoMode}
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
            Hapa tuna-test ingest + match ya SMS inayopokelewa na namba ya ofisi.
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
                Parser status:{" "}
                <Text style={{ color: UI.text }}>
                  {parsingSms ? "PARSING..." : clean(parseConfidence) ? "READY" : "WAITING"}
                </Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parsed payer name: <Text style={{ color: UI.text }}>{clean(parsedPayerName) || "—"}</Text>
              </Text>

              <Text style={{ color: UI.muted, fontWeight: "800", fontSize: 12 }}>
                Parse confidence: <Text style={{ color: UI.text }}>{clean(parseConfidence) || "—"}</Text>
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton
                label={parsingSms ? "PARSING..." : "PARSE SMS"}
                onPress={() => void parseSmsFromText(undefined, false)}
                disabled={parsingSms || ingestingSms || matchingSms || !clean(smsText)}
              />

              <PrimaryButton
                label={ingestingSms ? "INGESTING..." : "INGEST SMS"}
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
            <FilterPill label="ALL" active={filter === "ALL"} onPress={() => setFilter("ALL")} />
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
              onPress={() => void loadRequests()}
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

      <View style={{ height: 24 + Math.max(insets.bottom, 0) }} />
    </Screen>
  );
}