// app/(tabs)/sales/[handoffId].tsx

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { Screen } from "../../../src/ui/Screen";
import { theme } from "../../../src/ui/theme";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type PayMethod =
  | "CASH"
  | "MOBILE"
  | "BANK"
  | "SPLIT"
  | "CREDIT";

type CreditPaidVia =
  | "CASH"
  | "MOBILE"
  | "BANK";

type CashierHandoffRow = {
  id: string;

  organization_id: string;
  store_id: string;

  store_name?: string | null;

  cashier_membership_id?: string | null;

  source_membership_id?: string | null;
  source_user_id?: string | null;

  sold_by_membership_id?: string | null;
  sold_by_email?: string | null;

  cashier_email?: string | null;

  customer_name?: string | null;
  customer_phone?: string | null;

  items: any[] | null;

  subtotal: number | null;
  discount_amount: number | null;
  total: number | null;

  note: string | null;

  status: string | null;

  sale_id?: string | null;

  accepted_at?: string | null;
  completed_at?: string | null;
  created_at: string | null;
  updated_at?: string | null;

  item_count?: number | null;
};

function one(
  v: string | string[] | undefined
) {
  return Array.isArray(v)
    ? v[0]
    : v;
}

function fmtDateTimeLocal(
  input?: string | null
) {
  if (!input) return "—";

  try {
    const d = new Date(input);

    return new Intl.DateTimeFormat(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(d);
  } catch {
    return String(input);
  }
}

function toNum(v: any) {
  const n = Number(v);

  return Number.isFinite(n)
    ? n
    : 0;
}

function normalizeMoneyInput(
  raw: string
) {
  const digitsOnly =
    String(raw ?? "")
      .replace(/[^\d]/g, "");

  if (!digitsOnly) return "";

  return digitsOnly.replace(
    /^0+(?=\d)/,
    ""
  );
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v ?? "").trim()
  );
}

function normalizeHandoff(
  row: any
): CashierHandoffRow | null {
  if (!row) return null;

  return {
    id:
      String(row?.id ?? "")
        .trim(),

    organization_id:
      String(
        row?.organization_id ?? ""
      ).trim(),

    store_id:
      String(
        row?.store_id ?? ""
      ).trim(),

    store_name:
      row?.store_name ?? null,

    cashier_membership_id:
      row?.cashier_membership_id ??
      null,

    source_membership_id:
      row?.source_membership_id ??
      null,

    source_user_id:
      row?.source_user_id ?? null,

    sold_by_membership_id:
      row?.sold_by_membership_id ??
      null,

    sold_by_email:
      row?.sold_by_email ?? null,

    cashier_email:
      row?.cashier_email ?? null,

    customer_name:
      row?.customer_name ?? null,

    customer_phone:
      row?.customer_phone ?? null,

    items:
      Array.isArray(row?.items)
        ? row.items
        : [],

    subtotal:
      Number(row?.subtotal ?? 0),

    discount_amount:
      Number(
        row?.discount_amount ?? 0
      ),

    total:
      Number(row?.total ?? 0),

    note:
      row?.note ?? null,

    status:
      String(row?.status ?? "")
        .trim()
        .toUpperCase() || null,

    sale_id:
      row?.sale_id ?? null,

    accepted_at:
      row?.accepted_at ?? null,

    completed_at:
      row?.completed_at ?? null,

    created_at:
      row?.created_at ?? null,

    updated_at:
      row?.updated_at ?? null,

    item_count:
      Number(
        row?.item_count ??
          (
            Array.isArray(
              row?.items
            )
              ? row.items.length
              : 0
          )
      ),
  };
}

function MethodChip({
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
      hitSlop={8}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: "30%",

        minHeight: 46,

        paddingVertical: 10,
        paddingHorizontal: 8,

        borderRadius:
          theme.radius.pill,

        borderWidth: 1,

        borderColor: active
          ? theme.colors
              .emeraldBorder
          : theme.colors.border,

        backgroundColor: active
          ? theme.colors.emeraldSoft
          : "rgba(255,255,255,0.06)",

        alignItems: "center",
        justifyContent: "center",

        opacity:
          pressed ? 0.92 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        style={{
          color: active
            ? theme.colors.emerald
            : theme.colors.text,

          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({
  children,
}: {
  children: any;
}) {
  return (
    <Text
      style={{
        color: theme.colors.muted,
        fontWeight: "900",
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

function InputBox(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={
        props.onChangeText
      }
      placeholder={
        props.placeholder
      }
      placeholderTextColor="rgba(255,255,255,0.35)"
      keyboardType={
        props.keyboardType
      }
      multiline={
        props.multiline
      }
      style={{
        color: theme.colors.text,
        fontWeight: "800",

        borderWidth: 1,
        borderColor:
          theme.colors.border,

        backgroundColor:
          "rgba(255,255,255,0.06)",

        borderRadius: 16,

        paddingHorizontal: 12,

        paddingVertical:
          props.multiline
            ? 12
            : 10,

        minHeight:
          props.multiline
            ? 90
            : undefined,

        textAlignVertical:
          props.multiline
            ? "top"
            : "center",
      }}
    />
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

        borderWidth: 1,

        borderColor: highlight
          ? "rgba(52,211,153,0.28)"
          : theme.colors.border,

        backgroundColor: highlight
          ? "rgba(52,211,153,0.08)"
          : "rgba(255,255,255,0.04)",

        borderRadius: 14,

        paddingHorizontal: 10,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color:
            theme.colors.muted,

          fontWeight: "800",

          fontSize: 11,
        }}
      >
        {label}
      </Text>

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          color: highlight
            ? theme.colors.emerald
            : theme.colors.text,

          fontWeight: "900",

          marginTop: 3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function CashierHandoffDetailScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      handoffId?:
        | string
        | string[];
    }>();

  const handoffId =
    (
      one(params.handoffId) ??
      ""
    ).trim();

  const {
    activeOrgId,
    activeRole,
  } = useOrg() as any;

  const money =
    useOrgMoneyPrefs(
      activeOrgId
    );

  const fmtMoney =
    useCallback(
      (n: number) =>
        formatMoney(
          Number(n || 0),
          {
            currency:
              money.currency ||
              "TZS",

            locale:
              money.locale ||
              "en-TZ",
          }
        ).replace(
          /\s+/g,
          " "
        ),
      [
        money.currency,
        money.locale,
      ]
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    err,
    setErr,
  ] =
    useState<
      string | null
    >(null);

  const [
    row,
    setRow,
  ] =
    useState<
      CashierHandoffRow | null
    >(null);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    method,
    setMethod,
  ] =
    useState<PayMethod>(
      "CASH"
    );

  const [
    paidStr,
    setPaidStr,
  ] =
    useState("");

  const [
    creditPaidVia,
    setCreditPaidVia,
  ] =
    useState<CreditPaidVia>(
      "CASH"
    );

  const [
    channel,
    setChannel,
  ] =
    useState("");

  const [
    reference,
    setReference,
  ] =
    useState("");

  const [
    splitCashStr,
    setSplitCashStr,
  ] =
    useState("");

  const [
    splitMobileStr,
    setSplitMobileStr,
  ] =
    useState("");

  const [
    splitBankStr,
    setSplitBankStr,
  ] =
    useState("");

  const [
    note,
    setNote,
  ] =
    useState("");

  const isCashier =
    String(
      activeRole ?? ""
    )
      .trim()
      .toLowerCase() ===
    "cashier";

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setErr(null);

        try {
          if (!handoffId) {
            throw new Error(
              "Missing handoffId"
            );
          }

          if (
            !isUuid(
              handoffId
            )
          ) {
            throw new Error(
              "Invalid handoff route"
            );
          }

          const {
            data,
            error,
          } =
            await supabase.rpc(
              "get_cashier_handoff_by_id_v1",
              {
                p_handoff_id:
                  handoffId,
              }
            );

          if (error) {
            throw error;
          }

          const normalized =
            normalizeHandoff(
              Array.isArray(
                data
              )
                ? data[0]
                : data
            );

          if (
            !normalized?.id
          ) {
            throw new Error(
              "Handoff not found"
            );
          }

          setRow(
            normalized
          );
        } catch (e: any) {
          setErr(
            e?.message ??
              "Failed to load handoff"
          );

          setRow(null);
        } finally {
          setLoading(false);
        }
      },
      [handoffId]
    );

  useEffect(() => {
    void load();
  }, [load]);

  const status =
    String(
      row?.status ?? ""
    )
      .trim()
      .toUpperCase();

  const items =
    Array.isArray(
      row?.items
    )
      ? row.items
      : [];

  /*
    Default full-paid value
    for non-credit.
  */
  useEffect(() => {
    if (!row?.id) {
      return;
    }

    if (
      method === "CREDIT"
    ) {
      setPaidStr("0");
      return;
    }

    setPaidStr(
      String(
        Math.round(
          Number(
            row.total ?? 0
          )
        )
      )
    );
  }, [
    method,
    row?.id,
    row?.total,
  ]);

  const totalAmount =
    useMemo(
      () =>
        Math.max(
          0,
          Number(
            row?.total ?? 0
          )
        ),
      [row?.total]
    );

  const splitCashAmount =
    useMemo(
      () =>
        toNum(
          splitCashStr
        ),
      [splitCashStr]
    );

  const splitMobileAmount =
    useMemo(
      () =>
        toNum(
          splitMobileStr
        ),
      [splitMobileStr]
    );

  const splitBankAmount =
    useMemo(
      () =>
        toNum(
          splitBankStr
        ),
      [splitBankStr]
    );

  const splitTotalPaid =
    useMemo(
      () =>
        Math.max(
          0,
          splitCashAmount
        ) +
        Math.max(
          0,
          splitMobileAmount
        ) +
        Math.max(
          0,
          splitBankAmount
        ),
      [
        splitCashAmount,
        splitMobileAmount,
        splitBankAmount,
      ]
    );

  const paidAmount =
    useMemo(() => {
      if (
        method === "SPLIT"
      ) {
        return splitTotalPaid;
      }

      return toNum(
        paidStr
      );
    }, [
      method,
      paidStr,
      splitTotalPaid,
    ]);

  const balance =
    useMemo(
      () =>
        Math.max(
          0,
          totalAmount -
            Math.max(
              0,
              paidAmount
            )
        ),
      [
        totalAmount,
        paidAmount,
      ]
    );

  const showCreditPaidVia =
    method === "CREDIT" &&
    paidAmount > 0;

  const effectiveChannelMethod:
    | "MOBILE"
    | "BANK"
    | null =
    method === "MOBILE" ||
    method === "BANK"
      ? method
      : method ===
            "CREDIT" &&
          paidAmount > 0 &&
          (
            creditPaidVia ===
              "MOBILE" ||
            creditPaidVia ===
              "BANK"
          )
        ? creditPaidVia
        : null;

  const canAccept =
    useMemo(
      () =>
        isCashier &&
        !!row?.id &&
        status ===
          "PENDING" &&
        !saving,
      [
        isCashier,
        row?.id,
        saving,
        status,
      ]
    );

  const invalidReason =
    useMemo(() => {
      if (!isCashier) {
        return "Only cashier can complete this handoff.";
      }

      if (!row?.id) {
        return "Missing handoff.";
      }

      if (
        status !==
        "ACCEPTED"
      ) {
        return "Handoff must be ACCEPTED first.";
      }

      if (saving) {
        return "Saving...";
      }

      if (
        method ===
        "SPLIT"
      ) {
        if (
          splitTotalPaid <=
          0
        ) {
          return "Enter split payment amounts.";
        }

        if (
          Math.round(
            splitTotalPaid
          ) !==
          Math.round(
            totalAmount
          )
        ) {
          return "Split total must equal sale total.";
        }

        return null;
      }

      if (
        method ===
        "CREDIT"
      ) {
        if (
          !String(
            row.customer_name ??
              ""
          ).trim()
        ) {
          return "Customer name is required for credit.";
        }

        if (
          paidAmount < 0
        ) {
          return "Paid amount cannot be negative.";
        }

        if (
          paidAmount >
          totalAmount
        ) {
          return "Paid amount cannot exceed total.";
        }

        if (
          paidAmount > 0 &&
          !creditPaidVia
        ) {
          return "Select Paid Via.";
        }

        if (
          paidAmount > 0 &&
          (
            creditPaidVia ===
              "MOBILE" ||
            creditPaidVia ===
              "BANK"
          )
        ) {
          if (
            !channel.trim()
          ) {
            return "Payment channel is required.";
          }

          if (
            !reference.trim()
          ) {
            return "Reference / Transaction ID is required.";
          }
        }

        return null;
      }

      if (
        Math.round(
          paidAmount
        ) !==
        Math.round(
          totalAmount
        )
      ) {
        return "Non-credit sale must be fully paid.";
      }

      if (
        method ===
          "MOBILE" ||
        method === "BANK"
      ) {
        if (
          !channel.trim()
        ) {
          return "Payment channel is required.";
        }

        if (
          !reference.trim()
        ) {
          return "Reference / Transaction ID is required.";
        }
      }

      return null;
    }, [
      isCashier,
      row?.id,
      row?.customer_name,
      status,
      saving,
      method,
      splitTotalPaid,
      totalAmount,
      paidAmount,
      creditPaidVia,
      channel,
      reference,
    ]);

  const canComplete =
    !invalidReason;

  const selectMethod =
    useCallback(
      (
        next:
          PayMethod
      ) => {
        setMethod(next);

        setChannel("");
        setReference("");

        setSplitCashStr("");
        setSplitMobileStr("");
        setSplitBankStr("");

        if (
          next ===
          "CREDIT"
        ) {
          setPaidStr("0");

          setCreditPaidVia(
            "CASH"
          );

          return;
        }

        setPaidStr(
          String(
            Math.round(
              totalAmount
            )
          )
        );

        if (
          next ===
          "MOBILE"
        ) {
          setChannel(
            "M-PESA"
          );
        }
      },
      [totalAmount]
    );

  const selectCreditPaidVia =
    useCallback(
      (
        next:
          CreditPaidVia
      ) => {
        setCreditPaidVia(
          next
        );

        setChannel("");
        setReference("");

        if (
          next ===
          "MOBILE"
        ) {
          setChannel(
            "M-PESA"
          );
        }
      },
      []
    );

  const acceptNow =
    useCallback(
      async () => {
        if (
          !canAccept ||
          !row?.id
        ) {
          return;
        }

        setSaving(true);

        try {
          const {
            error,
          } =
            await supabase.rpc(
              "accept_cashier_handoff_v1",
              {
                p_handoff_id:
                  row.id,
              }
            );

          if (error) {
            throw error;
          }

          Alert.alert(
            "Accepted ✅",
            "Handoff imekubaliwa. Sasa unaweza kukamilisha mauzo."
          );

          await load();
        } catch (e: any) {
          Alert.alert(
            "Accept failed",
            e?.message ??
              "Failed to accept handoff"
          );
        } finally {
          setSaving(false);
        }
      },
      [
        canAccept,
        load,
        row?.id,
      ]
    );

  const completeNow =
    useCallback(
      async () => {
        if (
          invalidReason ||
          !row?.id
        ) {
          if (
            invalidReason
          ) {
            Alert.alert(
              "Blocked",
              invalidReason
            );
          }

          return;
        }

        setSaving(true);

        try {
          const splitNote =
            method ===
            "SPLIT"
              ? `SPLIT_PAYMENT: CASH=${splitCashAmount} | MOBILE=${splitMobileAmount} | BANK=${splitBankAmount}`
              : "";

          const creditNote =
            method ===
            "CREDIT"
              ? `CREDIT: PAID=${paidAmount} | BALANCE=${balance} | PAID_VIA=${
                  paidAmount > 0
                    ? creditPaidVia
                    : "NONE"
                }`
              : "";

          const finalNote =
            [
              splitNote,
              creditNote,
              note.trim(),
            ]
              .filter(Boolean)
              .join("\n");

          const {
            data,
            error,
          } =
            await supabase.rpc(
              "complete_cashier_handoff_v1",
              {
                p_handoff_id:
                  row.id,

                p_payment_method:
                  method,

                p_paid_amount:
                  method ===
                  "SPLIT"
                    ? splitTotalPaid
                    : paidAmount,

                p_payment_channel:
                  effectiveChannelMethod
                    ? channel.trim() ||
                      null
                    : null,

                p_reference:
                  effectiveChannelMethod
                    ? reference.trim() ||
                      null
                    : null,

                p_note:
                  finalNote ||
                  null,

                p_credit_paid_via:
                  method ===
                      "CREDIT" &&
                    paidAmount > 0
                    ? creditPaidVia
                    : null,
              }
            );

          if (error) {
            throw error;
          }

          const result =
            Array.isArray(
              data
            )
              ? data[0]
              : data;

          const saleId =
            String(
              result?.sale_id ??
                ""
            ).trim();

          Alert.alert(
            "Completed ✅",
            method ===
              "CREDIT"
              ? balance > 0
                ? `Sale imekamilika. Credit balance: ${fmtMoney(
                    balance
                  )}`
                : "Sale imekamilika. Hakuna balance iliyobaki."
              : "Sale imekamilika na risiti iko tayari."
          );

          if (saleId) {
            router.replace({
              pathname:
                "/(tabs)/sales/receipt",

              params: {
                saleId,
              },
            } as any);

            return;
          }

          await load();
        } catch (e: any) {
          Alert.alert(
            "Completion failed",
            e?.message ??
              "Failed to complete handoff"
          );
        } finally {
          setSaving(false);
        }
      },
      [
        invalidReason,
        row?.id,
        method,
        splitCashAmount,
        splitMobileAmount,
        splitBankAmount,
        splitTotalPaid,
        paidAmount,
        balance,
        creditPaidVia,
        note,
        effectiveChannelMethod,
        channel,
        reference,
        fmtMoney,
        router,
        load,
      ]
    );

  const openReceipt =
    useCallback(() => {
      const saleId =
        String(
          row?.sale_id ??
            ""
        ).trim();

      if (!saleId) {
        return;
      }

      router.push({
        pathname:
          "/(tabs)/sales/receipt",

        params: {
          saleId,
        },
      } as any);
    }, [
      router,
      row?.sale_id,
    ]);

  const goShiftOpening =
    useCallback(() => {
      const storeId =
        String(
          row?.store_id ??
            ""
        ).trim();

      const storeName =
        String(
          row?.store_name ??
            ""
        ).trim();

      if (!storeId) {
        Alert.alert(
          "Missing",
          "Store ya handoff haijapatikana."
        );

        return;
      }

      router.push({
        pathname:
          "/(tabs)/sales/shift-opening",

        params: {
          storeId,
          storeName,

          fromHandoff:
            "1",

          handoffId:
            row?.id ?? "",
        },
      } as any);
    }, [
      router,
      row?.id,
      row?.store_id,
      row?.store_name,
    ]);

  const goCashierClosing =
    useCallback(() => {
      router.push(
        "/(tabs)/settings/cashier-closing" as any
      );
    }, [router]);

  const pendingTone =
    useMemo(() => {
      if (
        status ===
        "PENDING"
      ) {
        return {
          border:
            theme.colors
              .emeraldBorder,

          bg:
            theme.colors
              .emeraldSoft,
        };
      }

      if (
        status ===
        "ACCEPTED"
      ) {
        return {
          border:
            "rgba(255,255,255,0.18)",

          bg:
            "rgba(255,255,255,0.06)",
        };
      }

      return {
        border:
          "rgba(255,255,255,0.12)",

        bg:
          "rgba(255,255,255,0.06)",
      };
    }, [status]);

  return (
    <Screen
      scroll
      bottomPad={180}
    >
      <View
        style={{
          flex: 1,
          gap: 14,
        }}
      >
        {/* HEADER */}

        <View
          style={{
            flexDirection:
              "row",

            alignItems:
              "center",

            gap: 10,
          }}
        >
          <Pressable
            onPress={() =>
              router.back()
            }
            style={{
              width: 44,
              height: 44,

              borderRadius:
                999,

              alignItems:
                "center",

              justifyContent:
                "center",

              borderWidth:
                1,

              borderColor:
                theme.colors
                  .border,

              backgroundColor:
                "rgba(255,255,255,0.06)",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={
                theme.colors
                  .text
              }
            />
          </Pressable>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={{
                fontSize: 26,

                fontWeight:
                  "900",

                color:
                  theme.colors
                    .text,
              }}
            >
              Cashier Handoff
            </Text>

            <Text
              style={{
                color:
                  theme.colors
                    .muted,

                fontWeight:
                  "800",
              }}
            >
              {row?.store_name ??
                "Store"}{" "}
              •{" "}
              {status ||
                "—"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View
            style={{
              paddingTop:
                18,

              alignItems:
                "center",
            }}
          >
            <ActivityIndicator />

            <Text
              style={{
                color:
                  theme.colors
                    .muted,

                fontWeight:
                  "800",

                marginTop:
                  8,
              }}
            >
              Loading handoff...
            </Text>
          </View>
        ) : err ? (
          <Card
            style={{
              gap: 10,
            }}
          >
            <Text
              style={{
                color:
                  theme.colors
                    .danger,

                fontWeight:
                  "900",
              }}
            >
              {err ===
              "Invalid handoff route"
                ? "This route is reserved for cashier handoff only."
                : err}
            </Text>

            <Button
              title={
                err ===
                "Invalid handoff route"
                  ? "Back"
                  : "Retry"
              }
              onPress={
                err ===
                "Invalid handoff route"
                  ? () =>
                      router.back()
                  : load
              }
              variant="primary"
            />
          </Card>
        ) : !row ? (
          <Card>
            <Text
              style={{
                color:
                  theme.colors
                    .muted,

                fontWeight:
                  "900",
              }}
            >
              Handoff
              haijapatikana.
            </Text>
          </Card>
        ) : (
          <>
            {/* SUMMARY */}

            <Card
              style={{
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection:
                    "row",

                  justifyContent:
                    "space-between",

                  gap: 10,
                }}
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      color:
                        theme.colors
                          .muted,

                      fontWeight:
                        "800",
                    }}
                  >
                    Handoff ID
                  </Text>

                  <Text
                    style={{
                      color:
                        theme.colors
                          .text,

                      fontWeight:
                        "900",

                      marginTop:
                        4,
                    }}
                  >
                    {String(
                      row.id
                    ).slice(
                      0,
                      8
                    )}
                    ...
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal:
                      12,

                    paddingVertical:
                      8,

                    borderRadius:
                      theme.radius
                        .pill,

                    borderWidth:
                      1,

                    borderColor:
                      pendingTone
                        .border,

                    backgroundColor:
                      pendingTone
                        .bg,
                  }}
                >
                  <Text
                    style={{
                      color:
                        theme.colors
                          .text,

                      fontWeight:
                        "900",
                    }}
                  >
                    {status}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection:
                    "row",

                  gap: 12,
                }}
              >
                <MoneyTile
                  label="Items"
                  value={String(
                    Number(
                      row.item_count ??
                        items.length
                    )
                  )}
                />

                <MoneyTile
                  label="Subtotal"
                  value={fmtMoney(
                    Number(
                      row.subtotal ??
                        0
                    )
                  )}
                />

                <MoneyTile
                  label="Total"
                  value={fmtMoney(
                    totalAmount
                  )}
                  highlight
                />
              </View>

              {!!Number(
                row.discount_amount ??
                  0
              ) && (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Discount:{" "}
                  {fmtMoney(
                    Number(
                      row.discount_amount ??
                        0
                    )
                  )}
                </Text>
              )}

              <Text
                style={{
                  color:
                    theme.colors
                      .muted,

                  fontWeight:
                    "800",
                }}
              >
                Created:{" "}
                {fmtDateTimeLocal(
                  row.created_at
                )}
              </Text>

              {!!row.accepted_at && (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Accepted:{" "}
                  {fmtDateTimeLocal(
                    row.accepted_at
                  )}
                </Text>
              )}

              {!!row.completed_at && (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Completed:{" "}
                  {fmtDateTimeLocal(
                    row.completed_at
                  )}
                </Text>
              )}
            </Card>

            {/* SALE INFORMATION */}

            <Card
              style={{
                gap: 12,

                borderColor:
                  "rgba(59,130,246,0.24)",

                backgroundColor:
                  "rgba(59,130,246,0.07)",
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",

                  fontSize:
                    16,
                }}
              >
                👤 Sale Information
              </Text>

              <View>
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Customer
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "900",

                    marginTop:
                      4,
                  }}
                >
                  {String(
                    row.customer_name ??
                      ""
                  ).trim() ||
                    "Walk-in Customer"}
                </Text>

                {!!String(
                  row.customer_phone ??
                    ""
                ).trim() && (
                  <Text
                    style={{
                      color:
                        theme.colors
                          .muted,

                      fontWeight:
                        "800",

                      marginTop:
                        3,
                    }}
                  >
                    {String(
                      row.customer_phone
                    ).trim()}
                  </Text>
                )}
              </View>

              <View
                style={{
                  height: 1,

                  backgroundColor:
                    "rgba(255,255,255,0.08)",
                }}
              />

              <View>
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Sold By / Staff
                </Text>

                <Text
                  style={{
                    color:
                      row.sold_by_email
                        ? theme
                            .colors
                            .emerald
                        : theme
                            .colors
                            .muted,

                    fontWeight:
                      "900",

                    marginTop:
                      4,
                  }}
                >
                  {String(
                    row.sold_by_email ??
                      ""
                  ).trim() ||
                    "No staff attribution"}
                </Text>
              </View>

              <View>
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Received By /
                  Cashier
                </Text>

                <Text
                  style={{
                    color:
                      row.cashier_email
                        ? theme
                            .colors
                            .emerald
                        : theme
                            .colors
                            .muted,

                    fontWeight:
                      "900",

                    marginTop:
                      4,
                  }}
                >
                  {String(
                    row.cashier_email ??
                      ""
                  ).trim() ||
                    (
                      status ===
                      "PENDING"
                        ? "Waiting for cashier"
                        : "—"
                    )}
                </Text>
              </View>
            </Card>

            {/* NOTE */}

            {!!String(
              row.note ??
                ""
            ).trim() && (
              <Card
                style={{
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "900",

                    fontSize:
                      16,
                  }}
                >
                  📝 Order Note
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "800",
                  }}
                >
                  {String(
                    row.note
                  ).trim()}
                </Text>
              </Card>
            )}

            {/* SHIFT */}

            <Card
              style={{
                gap: 10,

                borderColor:
                  "rgba(245,158,11,0.28)",

                backgroundColor:
                  "rgba(245,158,11,0.08)",
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",

                  fontSize:
                    16,
                }}
              >
                Shift Discipline
              </Text>

              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",
                }}
              >
                1. Fungua Shift Opening
              </Text>

              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",
                }}
              >
                2. Kubali handoff
              </Text>

              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",
                }}
              >
                3. Kamilisha sale
              </Text>

              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",
                }}
              >
                4. Cashier Closing
              </Text>

              <View
                style={{
                  flexDirection:
                    "row",

                  gap: 10,
                }}
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Button
                    title="Shift Opening"
                    onPress={
                      goShiftOpening
                    }
                    variant="secondary"
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Button
                    title="Cashier Closing"
                    onPress={
                      goCashierClosing
                    }
                    variant="secondary"
                  />
                </View>
              </View>
            </Card>

            {/* ITEMS */}

            <Card
              style={{
                gap: 10,
              }}
            >
              <Text
                style={{
                  color:
                    theme.colors
                      .text,

                  fontWeight:
                    "900",

                  fontSize:
                    16,
                }}
              >
                Items
              </Text>

              {items.length ===
              0 ? (
                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  No items found.
                </Text>
              ) : (
                items.map(
                  (
                    it: any,
                    idx: number
                  ) => {
                    const qty =
                      Number(
                        Number(
                          it?.qty ??
                            0
                        ).toFixed(
                          3
                        )
                      );

                    const unitPrice =
                      Number(
                        it?.unit_price ??
                          0
                      );

                    const lineTotal =
                      Number(
                        it?.line_total ??
                          qty *
                            unitPrice
                      );

                    return (
                      <View
                        key={`${String(
                          it?.product_id ??
                            idx
                        )}-${idx}`}
                        style={{
                          paddingVertical:
                            12,

                          borderTopWidth:
                            idx ===
                            0
                              ? 0
                              : 1,

                          borderTopColor:
                            "rgba(255,255,255,0.06)",

                          gap: 4,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              theme
                                .colors
                                .text,

                            fontWeight:
                              "900",
                          }}
                        >
                          {String(
                            it?.name ??
                              it?.product_name ??
                              "Product"
                          )}
                        </Text>

                        <Text
                          style={{
                            color:
                              theme
                                .colors
                                .muted,

                            fontWeight:
                              "800",
                          }}
                        >
                          SKU:{" "}
                          {String(
                            it?.sku ??
                              "—"
                          )}{" "}
                          • Qty:{" "}
                          {qty}
                        </Text>

                        <Text
                          style={{
                            color:
                              theme
                                .colors
                                .muted,

                            fontWeight:
                              "900",
                          }}
                        >
                          Unit:{" "}
                          {fmtMoney(
                            unitPrice
                          )}{" "}
                          • Line:{" "}
                          {fmtMoney(
                            lineTotal
                          )}
                        </Text>
                      </View>
                    );
                  }
                )
              )}
            </Card>

            {/* ACCEPT */}

            {status ===
              "PENDING" && (
              <Card
                style={{
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "900",

                    fontSize:
                      16,
                  }}
                >
                  Accept Handoff
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Ukibonyeza Accept,
                  handoff hii itawekwa
                  chini yako.
                </Text>

                <Button
                  title={
                    saving
                      ? "Accepting..."
                      : "Accept Handoff"
                  }
                  onPress={
                    acceptNow
                  }
                  disabled={
                    !canAccept
                  }
                  variant="primary"
                />
              </Card>
            )}

            {/* COMPLETE SALE */}

            {status ===
              "ACCEPTED" && (
              <Card
                style={{
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "900",

                    fontSize:
                      16,
                  }}
                >
                  💳 Complete Sale
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Cashier Receiving:
                  {" "}
                  <Text
                    style={{
                      color:
                        theme.colors
                          .emerald,

                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      row.cashier_email ??
                        ""
                    ).trim() ||
                      "Current Cashier"}
                  </Text>
                </Text>

                {/* PAYMENT METHOD */}

                <View
                  style={{
                    flexDirection:
                      "row",

                    flexWrap:
                      "wrap",

                    gap: 8,
                  }}
                >
                  <MethodChip
                    label="Cash"
                    active={
                      method ===
                      "CASH"
                    }
                    onPress={() =>
                      selectMethod(
                        "CASH"
                      )
                    }
                  />

                  <MethodChip
                    label="Mobile"
                    active={
                      method ===
                      "MOBILE"
                    }
                    onPress={() =>
                      selectMethod(
                        "MOBILE"
                      )
                    }
                  />

                  <MethodChip
                    label="Bank"
                    active={
                      method ===
                      "BANK"
                    }
                    onPress={() =>
                      selectMethod(
                        "BANK"
                      )
                    }
                  />

                  <MethodChip
                    label="Split"
                    active={
                      method ===
                      "SPLIT"
                    }
                    onPress={() =>
                      selectMethod(
                        "SPLIT"
                      )
                    }
                  />

                  <MethodChip
                    label="Credit"
                    active={
                      method ===
                      "CREDIT"
                    }
                    onPress={() =>
                      selectMethod(
                        "CREDIT"
                      )
                    }
                  />
                </View>

                {/* NORMAL / CREDIT PAID */}

                {method !==
                "SPLIT" ? (
                  <View>
                    <FieldLabel>
                      Paid (
                      {money.currency ||
                        "TZS"}
                      )
                    </FieldLabel>

                    <InputBox
                      value={
                        paidStr
                      }
                      onChangeText={(
                        v
                      ) => {
                        if (
                          method !==
                          "CREDIT"
                        ) {
                          return;
                        }

                        const next =
                          normalizeMoneyInput(
                            v
                          );

                        const n =
                          toNum(
                            next
                          );

                        if (
                          n >
                          totalAmount
                        ) {
                          setPaidStr(
                            String(
                              Math.round(
                                totalAmount
                              )
                            )
                          );

                          return;
                        }

                        setPaidStr(
                          next
                        );
                      }}
                      placeholder="0"
                      keyboardType="numeric"
                    />

                    {method !==
                      "CREDIT" && (
                      <Text
                        style={{
                          color:
                            theme
                              .colors
                              .faint,

                          fontWeight:
                            "800",

                          marginTop:
                            6,
                        }}
                      >
                        Non-credit
                        lazima ilipwe
                        full.
                      </Text>
                    )}

                    {method ===
                      "CREDIT" && (
                      <Text
                        style={{
                          color:
                            theme
                              .colors
                              .faint,

                          fontWeight:
                            "800",

                          marginTop:
                            6,
                        }}
                      >
                        Credit
                        inaruhusu
                        Paid = 0
                        au partial
                        payment.
                      </Text>
                    )}
                  </View>
                ) : null}

                {/* SPLIT */}

                {method ===
                  "SPLIT" && (
                  <>
                    <View>
                      <FieldLabel>
                        Cash Paid
                      </FieldLabel>

                      <InputBox
                        value={
                          splitCashStr
                        }
                        onChangeText={(
                          v
                        ) =>
                          setSplitCashStr(
                            normalizeMoneyInput(
                              v
                            )
                          )
                        }
                        placeholder="50000"
                        keyboardType="numeric"
                      />
                    </View>

                    <View>
                      <FieldLabel>
                        Mobile Paid
                      </FieldLabel>

                      <InputBox
                        value={
                          splitMobileStr
                        }
                        onChangeText={(
                          v
                        ) =>
                          setSplitMobileStr(
                            normalizeMoneyInput(
                              v
                            )
                          )
                        }
                        placeholder="100000"
                        keyboardType="numeric"
                      />
                    </View>

                    <View>
                      <FieldLabel>
                        Bank Paid
                      </FieldLabel>

                      <InputBox
                        value={
                          splitBankStr
                        }
                        onChangeText={(
                          v
                        ) =>
                          setSplitBankStr(
                            normalizeMoneyInput(
                              v
                            )
                          )
                        }
                        placeholder="120000"
                        keyboardType="numeric"
                      />
                    </View>
                  </>
                )}

                {/* TOTAL / PAID / BALANCE */}

                <View
                  style={{
                    flexDirection:
                      "row",

                    gap: 8,
                  }}
                >
                  <MoneyTile
                    label="Total"
                    value={fmtMoney(
                      totalAmount
                    )}
                  />

                  <MoneyTile
                    label="Paid"
                    value={fmtMoney(
                      paidAmount
                    )}
                  />

                  <MoneyTile
                    label="Balance"
                    value={fmtMoney(
                      balance
                    )}
                    highlight={
                      method ===
                        "CREDIT" &&
                      balance > 0
                    }
                  />
                </View>

                {/* CREDIT CUSTOMER */}

                {method ===
                  "CREDIT" && (
                  <View
                    style={{
                      borderWidth:
                        1,

                      borderColor:
                        "rgba(245,158,11,0.24)",

                      backgroundColor:
                        "rgba(245,158,11,0.08)",

                      borderRadius:
                        14,

                      padding: 12,

                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          theme
                            .colors
                            .muted,

                        fontWeight:
                          "800",
                      }}
                    >
                      Credit Customer
                    </Text>

                    <Text
                      style={{
                        color:
                          theme
                            .colors
                            .text,

                        fontWeight:
                          "900",
                      }}
                    >
                      {String(
                        row.customer_name ??
                          ""
                      ).trim() ||
                        "Customer name missing"}
                    </Text>

                    {!!String(
                      row.customer_phone ??
                        ""
                    ).trim() && (
                      <Text
                        style={{
                          color:
                            theme
                              .colors
                              .muted,

                          fontWeight:
                            "800",
                        }}
                      >
                        {String(
                          row.customer_phone
                        ).trim()}
                      </Text>
                    )}
                  </View>
                )}

                {/* CREDIT PAID VIA */}

                {showCreditPaidVia && (
                  <>
                    <Text
                      style={{
                        color:
                          theme.colors
                            .faint,

                        fontWeight:
                          "900",
                      }}
                    >
                      CREDIT MODE:
                      chagua njia ya
                      kiasi
                      kilichopokelewa.
                    </Text>

                    <View
                      style={{
                        flexDirection:
                          "row",

                        gap: 8,
                      }}
                    >
                      <MethodChip
                        label="Cash"
                        active={
                          creditPaidVia ===
                          "CASH"
                        }
                        onPress={() =>
                          selectCreditPaidVia(
                            "CASH"
                          )
                        }
                      />

                      <MethodChip
                        label="Mobile"
                        active={
                          creditPaidVia ===
                          "MOBILE"
                        }
                        onPress={() =>
                          selectCreditPaidVia(
                            "MOBILE"
                          )
                        }
                      />

                      <MethodChip
                        label="Bank"
                        active={
                          creditPaidVia ===
                          "BANK"
                        }
                        onPress={() =>
                          selectCreditPaidVia(
                            "BANK"
                          )
                        }
                      />
                    </View>
                  </>
                )}

                {/* CHANNEL + REF */}

                {!!effectiveChannelMethod && (
                  <>
                    <View>
                      <FieldLabel>
                        {effectiveChannelMethod ===
                        "MOBILE"
                          ? "Mobile Channel"
                          : "Bank Channel"}
                      </FieldLabel>

                      <InputBox
                        value={
                          channel
                        }
                        onChangeText={
                          setChannel
                        }
                        placeholder={
                          effectiveChannelMethod ===
                          "MOBILE"
                            ? "M-PESA"
                            : "NMB"
                        }
                        keyboardType="default"
                      />
                    </View>

                    <View>
                      <FieldLabel>
                        Reference /
                        Transaction ID
                      </FieldLabel>

                      <InputBox
                        value={
                          reference
                        }
                        onChangeText={
                          setReference
                        }
                        placeholder="TXN12345"
                        keyboardType="default"
                      />
                    </View>
                  </>
                )}

                {/* COMPLETION NOTE */}

                <View>
                  <FieldLabel>
                    Completion Note
                    (optional)
                  </FieldLabel>

                  <InputBox
                    value={
                      note
                    }
                    onChangeText={
                      setNote
                    }
                    placeholder="andika maelezo ya cashier completion..."
                    keyboardType="default"
                    multiline
                  />
                </View>

                {!!invalidReason && (
                  <Text
                    style={{
                      color:
                        theme.colors
                          .muted,

                      fontWeight:
                        "900",
                    }}
                  >
                    ⚠{" "}
                    {invalidReason}
                  </Text>
                )}

                <Button
                  title={
                    saving
                      ? "Completing..."
                      : method ===
                          "CREDIT"
                        ? "Complete Credit Sale"
                        : "Complete Sale"
                  }
                  onPress={
                    completeNow
                  }
                  disabled={
                    !canComplete
                  }
                  variant="primary"
                />
              </Card>
            )}

            {/* COMPLETED */}

            {status ===
              "COMPLETED" && (
              <Card
                style={{
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color:
                      theme.colors
                        .text,

                    fontWeight:
                      "900",

                    fontSize:
                      16,
                  }}
                >
                  Sale Completed
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Sold By:{" "}
                  <Text
                    style={{
                      color:
                        theme.colors
                          .text,

                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      row.sold_by_email ??
                        ""
                    ).trim() ||
                      "No staff attribution"}
                  </Text>
                </Text>

                <Text
                  style={{
                    color:
                      theme.colors
                        .muted,

                    fontWeight:
                      "800",
                  }}
                >
                  Received By:{" "}
                  <Text
                    style={{
                      color:
                        theme.colors
                          .emerald,

                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      row.cashier_email ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>
                </Text>

                <View
                  style={{
                    flexDirection:
                      "row",

                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Button
                      title="Open Receipt"
                      onPress={
                        openReceipt
                      }
                      disabled={
                        !String(
                          row.sale_id ??
                            ""
                        ).trim()
                      }
                      variant="primary"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Button
                      title="Cashier Closing"
                      onPress={
                        goCashierClosing
                      }
                      variant="secondary"
                    />
                  </View>
                </View>
              </Card>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}