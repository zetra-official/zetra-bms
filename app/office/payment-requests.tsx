// app/(tabs)/settings/subscription-requests.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/ui/Screen";
import { Card } from "@/src/ui/Card";
import { UI } from "@/src/ui/theme";
import { supabase } from "@/src/supabase/supabaseClient";

const INTERNAL_BILLING_EMAIL = "zetraofficialtz@gmail.com";

type RequestFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

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

function clean(value: any) {
  return String(value ?? "").trim();
}

function upper(value: any) {
  return clean(value).toUpperCase();
}

function fmtMoney(value: any) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "TZS 0";
  }

  return `TZS ${Math.round(amount).toLocaleString("en-US")}`;
}

function fmtDateTime(value: any) {
  const raw = clean(value);

  if (!raw) {
    return "—";
  }

  try {
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return raw;
  }
}

function statusTone(status: string) {
  const value = upper(status);

  if (value === "APPROVED") {
    return {
      borderColor: "rgba(16,185,129,0.35)",
      backgroundColor: "rgba(16,185,129,0.10)",
    };
  }

  if (value === "REJECTED") {
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
      style={({ pressed }) => ({
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
        opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
        flex: 1,
      })}
    >
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
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
      style={({ pressed }) => ({
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active
          ? UI.emeraldBorder
          : "rgba(255,255,255,0.10)",
        backgroundColor: active
          ? "rgba(16,185,129,0.14)"
          : "rgba(255,255,255,0.04)",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        style={{
          color: UI.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SubscriptionRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const [filter, setFilter] = useState<RequestFilter>("PENDING");

  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const isRefreshingRef = useRef(false);

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
          .order("submitted_at", {
            ascending: false,
          });

        if (activeFilter !== "ALL") {
          query = query.eq("status", activeFilter);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        setRequests((data ?? []) as RequestRow[]);
      } catch (error: any) {
        setRequests([]);

        setErrorText(
          clean(error?.message) ||
            "Imeshindikana kusoma subscription requests."
        );
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  const checkInternalAccess = useCallback(async () => {
    setCheckingAccess(true);

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        throw error;
      }

      const email = clean(data?.user?.email).toLowerCase();
      const ok = email === INTERNAL_BILLING_EMAIL;

      setAllowed(ok);

      if (!ok) {
        Alert.alert(
          "Restricted",
          "This screen is for ZETRA Office billing only."
        );

        router.replace("/office" as any);
        return;
      }

      await loadRequests("PENDING");
    } catch (error: any) {
      setAllowed(false);

      Alert.alert(
        "Restricted",
        clean(error?.message) ||
          "Unable to verify ZETRA Office access."
      );

      router.replace("/office" as any);
    } finally {
      setCheckingAccess(false);
    }
  }, [loadRequests, router]);

  useEffect(() => {
    void checkInternalAccess();
  }, [checkInternalAccess]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    void loadRequests();
  }, [allowed, filter, loadRequests]);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    const safeRefreshRequests = async () => {
      if (isRefreshingRef.current) {
        return;
      }

      isRefreshingRef.current = true;

      try {
        await loadRequests();
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const channel = supabase
      .channel(`office-payment-requests-${filter}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payment_requests",
        },
        () => {
          void safeRefreshRequests();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [allowed, filter, loadRequests]);

  const approveRequest = useCallback(
    async (requestId: string) => {
      setBusyId(requestId);

      try {
        const { error } = await supabase.rpc(
          "approve_subscription_payment_request_v1",
          {
            p_request_id: requestId,
            p_admin_note: "Approved by ZETRA office",
          }
        );

        if (error) {
          throw error;
        }

        Alert.alert(
          "Approved ✅",
          "Subscription request approved successfully."
        );

        isRefreshingRef.current = true;

        try {
          await loadRequests();
        } finally {
          isRefreshingRef.current = false;
        }
      } catch (error: any) {
        Alert.alert(
          "Approve failed",
          clean(error?.message) ||
            "Subscription request approval failed."
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
        Alert.alert(
          "Reason required",
          "Weka sababu ya kukataa request kwanza."
        );
        return;
      }

      setBusyId(requestId);

      try {
        const { error } = await supabase.rpc(
          "reject_subscription_payment_request_v1",
          {
            p_request_id: requestId,
            p_rejection_reason: reason,
            p_admin_note: "Rejected by ZETRA office",
          }
        );

        if (error) {
          throw error;
        }

        setRejectingId("");
        setRejectReason("");

        Alert.alert(
          "Rejected",
          "Subscription request rejected successfully."
        );

        isRefreshingRef.current = true;

        try {
          await loadRequests();
        } finally {
          isRefreshingRef.current = false;
        }
      } catch (error: any) {
        Alert.alert(
          "Reject failed",
          clean(error?.message) ||
            "Subscription request rejection failed."
        );
      } finally {
        setBusyId("");
      }
    },
    [loadRequests, rejectReason]
  );

  const renderItem = ({ item }: { item: RequestRow }) => {
    const status = upper(item.status);
    const tone = statusTone(status);

    const isBusy = busyId === item.id;
    const isRejecting = rejectingId === item.id;

    return (
      <Card
        style={{
          marginBottom: 12,
          borderWidth: 1,
          borderColor: tone.borderColor,
          backgroundColor: tone.backgroundColor,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 15,
              }}
            >
              {upper(item.plan_code)}
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {item.duration_months} month
              {item.duration_months > 1 ? "s" : ""}
            </Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: tone.borderColor,
              backgroundColor: tone.backgroundColor,
              borderRadius: 999,
              paddingVertical: 5,
              paddingHorizontal: 10,
            }}
          >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              {status}
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 14,
            gap: 7,
          }}
        >
          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Amount:{" "}
            <Text style={{ color: UI.text }}>
              {fmtMoney(item.submitted_amount)}
            </Text>
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Expected:{" "}
            <Text style={{ color: UI.text }}>
              {fmtMoney(item.expected_amount)}
            </Text>
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Payer:{" "}
            <Text style={{ color: UI.text }}>
              {clean(item.payer_name) || "—"}
            </Text>
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Phone:{" "}
            <Text style={{ color: UI.text }}>
              {clean(item.payer_phone) || "—"}
            </Text>
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Reference:{" "}
            <Text style={{ color: UI.text }}>
              {clean(item.transaction_reference) || "—"}
            </Text>
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Submitted:{" "}
            <Text style={{ color: UI.text }}>
              {fmtDateTime(item.submitted_at)}
            </Text>
          </Text>

          {item.approved_at ? (
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              Approved:{" "}
              <Text style={{ color: UI.text }}>
                {fmtDateTime(item.approved_at)}
              </Text>
            </Text>
          ) : null}

          {clean(item.rejection_reason) ? (
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              Rejection reason:{" "}
              <Text style={{ color: UI.text }}>
                {clean(item.rejection_reason)}
              </Text>
            </Text>
          ) : null}
        </View>

        {status === "PENDING" ? (
          isRejecting ? (
            <View
              style={{
                marginTop: 14,
                gap: 10,
              }}
            >
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

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <PrimaryButton
                  label={
                    isBusy
                      ? "PLEASE WAIT..."
                      : "CONFIRM REJECT"
                  }
                  onPress={() => {
                    void rejectRequest(item.id);
                  }}
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
            <View
              style={{
                marginTop: 14,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <PrimaryButton
                label={
                  isBusy
                    ? "PLEASE WAIT..."
                    : "APPROVE"
                }
                onPress={() => {
                  void approveRequest(item.id);
                }}
                disabled={!!busyId}
              />

              <PrimaryButton
                label="REJECT"
                danger
                onPress={() => {
                  setRejectingId(item.id);
                  setRejectReason("");
                }}
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
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={UI.text}
          />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 20,
            }}
          >
            Payment Requests
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              marginTop: 4,
            }}
          >
            Subscription payment approvals
          </Text>
        </View>

        <View
          style={{
            height: 42,
            paddingHorizontal: 14,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: UI.emeraldBorder,
            backgroundColor: "rgba(16,185,129,0.10)",
          }}
        >
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 12,
            }}
          >
            Office
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            Request History
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
            Review, approve or reject subscription payment requests.
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 14,
            }}
          >
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
              marginTop: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              Showing:{" "}
              <Text style={{ color: UI.text }}>
                {filter}
              </Text>
            </Text>

            <Pressable
              onPress={() => {
                if (isRefreshingRef.current) {
                  return;
                }

                isRefreshingRef.current = true;

                void loadRequests().finally(() => {
                  isRefreshingRef.current = false;
                });
              }}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Ionicons
                name="refresh-outline"
                size={19}
                color={UI.text}
              />
            </Pressable>
          </View>

          {checkingAccess || loading ? (
            <View
              style={{
                marginTop: 20,
                alignItems: "center",
                paddingVertical: 18,
              }}
            >
              <ActivityIndicator />

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  marginTop: 10,
                }}
              >
                Loading requests…
              </Text>
            </View>
          ) : errorText ? (
            <View
              style={{
                marginTop: 16,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
                backgroundColor: "rgba(239,68,68,0.08)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                Unable to load requests
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
                {errorText}
              </Text>
            </View>
          ) : requests.length === 0 ? (
            <View
              style={{
                marginTop: 18,
                paddingVertical: 18,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                  fontSize: 13,
                }}
              >
                No {filter.toLowerCase()} requests right now.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 16 }}>
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

      <View
        style={{
          height: 24 + Math.max(insets.bottom, 0),
        }}
      />
    </Screen>
  );
}