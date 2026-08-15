// app/(tabs)/staff/my-sales.tsx

import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrg } from "../../../src/context/OrgContext";
import { supabase } from "../../../src/supabase/supabaseClient";
import { formatMoney, useOrgMoneyPrefs } from "@/src/ui/money";

type MySalesRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string | null;

  total_sales: number | string | null;
  sales_count: number | string | null;

  commission_percent: number | string | null;

  /**
   * Legacy-compatible field.
   * Backend mpya inaweza kurudisha accrued_commission,
   * lakini tunaiacha commission_amount kama fallback.
   */
  commission_amount?: number | string | null;

  accrued_commission?: number | string | null;
  paid_commission?: number | string | null;
  remaining_commission?: number | string | null;
};

type MyPayoutProfileRow = {
  id: string;
  organization_id: string;
  membership_id: string;

  payment_method: string | null;

  mobile_network: string | null;
  mobile_number: string | null;

  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;

  account_holder_name: string | null;

  is_active: boolean | null;

  created_at: string | null;
  updated_at: string | null;
};

type MyCommissionHistoryRow = {
  payout_id: string;
  membership_id: string;

  period_key: string | null;

  sales_amount: number | string | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;

  paid_amount: number | string | null;
  remaining_amount: number | string | null;

  payment_method: string | null;
  payment_destination: string | null;

  reference: string | null;
  note: string | null;
  status: string | null;

  sent_at: string | null;
  received_at: string | null;
  received_note: string | null;
  created_at: string | null;
};

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  softCard: "#F8FAFC",

  border: "rgba(15,23,42,0.10)",

  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",

  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",

  danger: "#E11D48",
  warning: "#D97706",
};

function shortId(v: string) {
  if (!v) return "—";

  return v.length > 10
    ? `${v.slice(0, 8)}...`
    : v;
}

function toNum(v: any) {
  const n = Number(v ?? 0);

  return Number.isFinite(n)
    ? n
    : 0;
}

function initialsFromEmail(
  email: string | null,
  fallback = "ST"
) {
  if (!email) return fallback;

  const base =
    email.split("@")[0]?.trim() ?? "";

  const letters =
    base.replace(/[^a-zA-Z]/g, "");

  if (letters.length >= 2) {
    return letters.slice(0, 2).toUpperCase();
  }

  if (letters.length === 1) {
    return `${letters}T`.toUpperCase();
  }

  return fallback;
}

function formatHistoryDate(
  value?: string | null
) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  try {
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

export default function MySalesScreen() {
  const router = useRouter();

  const {
    activeOrgId,
    activeOrgName,
    activeRole,
  } = useOrg();

  const orgId =
    String(activeOrgId ?? "").trim();

  const roleLower =
    String(activeRole ?? "")
      .trim()
      .toLowerCase();

  const isStaff =
    roleLower === "staff";

  const money =
    useOrgMoneyPrefs(orgId);

  const currency =
    money.currency || "TZS";

  const locale =
    money.locale || "en-TZ";

  const fmtMoney = useCallback(
    (n: number) =>
      formatMoney(n, {
        currency,
        locale,
      }).replace(/\s+/g, " "),
    [currency, locale]
  );

  const [loading, setLoading] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [row, setRow] =
    useState<MySalesRow | null>(null);

  const [profile, setProfile] =
    useState<MyPayoutProfileRow | null>(null);

  const [historyRows, setHistoryRows] =
    useState<MyCommissionHistoryRow[]>([]);

  /**
   * =========================================================
   * LOAD DATA
   * =========================================================
   *
   * RPC name bado ina "_month_v1" kwa compatibility.
   * Lakini baada ya SQL tuliyorekebisha, backend ndiyo
   * source of truth ya cumulative commission.
   */
  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent =
        !!opts?.silent;

      if (!isStaff) {
        setRow(null);
        setProfile(null);
        setHistoryRows([]);
        setError("Staff only.");
        return;
      }

      if (!orgId) {
        setRow(null);
        setProfile(null);
        setHistoryRows([]);
        setError(
          "No active organization."
        );
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      setError(null);

      try {
        const [
          salesResult,
          profileResult,
          historyResult,
        ] = await Promise.all([
          supabase.rpc(
            "get_my_staff_sales_commission_month_v1",
            {
              p_org_id: orgId,
            }
          ),

          supabase.rpc(
            "get_my_commission_payout_profile_v1",
            {
              p_org_id: orgId,
            }
          ),

          supabase.rpc(
            "get_my_commission_history_v1",
            {
              p_org_id: orgId,
              p_limit: 50,
            }
          ),
        ]);

        if (salesResult.error) {
          throw salesResult.error;
        }

        if (profileResult.error) {
          throw profileResult.error;
        }

        if (historyResult.error) {
          throw historyResult.error;
        }

        const salesData =
          salesResult.data;

        const profileData =
          profileResult.data;

        const historyData =
          historyResult.data;

        const nextRow =
          Array.isArray(salesData)
            ? ((salesData[0] ??
                null) as MySalesRow | null)
            : (salesData as MySalesRow | null);

        const nextProfile =
          Array.isArray(profileData)
            ? ((profileData[0] ??
                null) as MyPayoutProfileRow | null)
            : (profileData as MyPayoutProfileRow | null);

        const nextHistory =
          Array.isArray(historyData)
            ? (historyData as MyCommissionHistoryRow[])
            : [];

        setRow(nextRow);
        setProfile(nextProfile);
        setHistoryRows(nextHistory);
      } catch (err: any) {
        setRow(null);

        setError(
          err?.message ??
            "Failed to load my staff commission information"
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [isStaff, orgId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData({
        silent: true,
      });
    }, [loadData])
  );

  const onRefresh =
    useCallback(async () => {
      setRefreshing(true);

      try {
        await loadData();
      } finally {
        setRefreshing(false);
      }
    }, [loadData]);

  /**
   * =========================================================
   * BASIC STAFF DATA
   * =========================================================
   */

  const email =
    useMemo(() => {
      const value =
        String(
          row?.email ?? ""
        ).trim();

      return value || null;
    }, [row]);

  const initials =
    useMemo(
      () =>
        initialsFromEmail(
          email,
          "ST"
        ),
      [email]
    );

  const totalSales =
    useMemo(
      () =>
        Math.max(
          0,
          toNum(row?.total_sales)
        ),
      [row]
    );

  const salesCount =
    useMemo(
      () =>
        Math.max(
          0,
          Math.trunc(
            toNum(row?.sales_count)
          )
        ),
      [row]
    );

  const commissionPercent =
    useMemo(
      () =>
        Math.max(
          0,
          toNum(
            row?.commission_percent
          )
        ),
      [row]
    );

  /**
   * =========================================================
   * CUMULATIVE COMMISSION
   * =========================================================
   *
   * Hakuna month reset hapa.
   *
   * accumulatedCommission
   *     = commission yote iliyozalishwa
   *
   * totalCashedOut
   *     = commission yote iliyolipwa
   *
   * unpaidBalance
   *     = balance inayodaiwa
   */

  const accumulatedCommission =
    useMemo(() => {
      if (
        row?.accrued_commission !=
        null
      ) {
        return Math.max(
          0,
          toNum(
            row.accrued_commission
          )
        );
      }

      return Math.max(
        0,
        toNum(
          row?.commission_amount
        )
      );
    }, [row]);

  const totalCashedOut =
    useMemo(() => {
      /**
       * Backend ndiyo source ya kwanza.
       */
      if (
        row?.paid_commission != null
      ) {
        return Math.max(
          0,
          toNum(
            row.paid_commission
          )
        );
      }

      /**
       * Fallback:
       * tukikosa paid_commission kutoka
       * dashboard, history ndiyo itumike.
       */
      return historyRows.reduce(
        (sum, h) => {
          const status =
            String(
              h.status ?? ""
            )
              .trim()
              .toUpperCase();

          const valid =
            status === "PAID" ||
            status === "SENT" ||
            status === "RECEIVED" ||
            status === "CONFIRMED";

          if (!valid) {
            return sum;
          }

          return (
            sum +
            Math.max(
              0,
              toNum(
                h.paid_amount
              )
            )
          );
        },
        0
      );
    }, [row, historyRows]);

  const unpaidBalance =
    useMemo(() => {
      /**
       * Backend ndiyo source of truth.
       */
      if (
        row?.remaining_commission !=
        null
      ) {
        return Math.max(
          0,
          toNum(
            row.remaining_commission
          )
        );
      }

      /**
       * Fallback.
       */
      return Math.max(
        0,
        accumulatedCommission -
          totalCashedOut
      );
    }, [
      row,
      accumulatedCommission,
      totalCashedOut,
    ]);

  const isSettled =
    accumulatedCommission > 0 &&
    unpaidBalance <= 0;

  /**
   * =========================================================
   * PAYOUT PROFILE
   * =========================================================
   */

  const hasPayoutProfile =
    !!profile?.id &&
    profile?.is_active !== false;

  const payoutMethod =
    useMemo(
      () =>
        String(
          profile?.payment_method ??
            ""
        )
          .trim()
          .toUpperCase(),
      [profile]
    );

  const payoutDestination =
    useMemo(() => {
      if (
        payoutMethod === "MOBILE"
      ) {
        return String(
          profile?.mobile_number ??
            ""
        ).trim();
      }

      if (
        payoutMethod === "BANK"
      ) {
        return String(
          profile?.bank_account_number ??
            ""
        ).trim();
      }

      return "";
    }, [
      profile,
      payoutMethod,
    ]);

  const payoutDisplay =
    useMemo(() => {
      if (
        payoutMethod === "MOBILE"
      ) {
        const network =
          String(
            profile?.mobile_network ??
              ""
          ).trim();

        if (
          network &&
          payoutDestination
        ) {
          return `${network} • ${payoutDestination}`;
        }

        return (
          payoutDestination ||
          network ||
          "Mobile"
        );
      }

      if (
        payoutMethod === "BANK"
      ) {
        const bank =
          String(
            profile?.bank_name ??
              ""
          ).trim();

        if (
          bank &&
          payoutDestination
        ) {
          return `${bank} • ${payoutDestination}`;
        }

        return (
          payoutDestination ||
          bank ||
          "Bank"
        );
      }

      return "—";
    }, [
      profile,
      payoutMethod,
      payoutDestination,
    ]);

  /**
   * =========================================================
   * ACCESS GUARD
   * =========================================================
   */

  if (!isStaff) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: UI.bg0,
        }}
        edges={["top"]}
      >
        <View
          style={{
            flex: 1,
            padding: 16,
            justifyContent:
              "center",
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor:
                "rgba(251,113,133,0.35)",
              borderRadius: 22,
              backgroundColor:
                "rgba(251,113,133,0.08)",
              padding: 16,
              gap: 10,
            }}
          >
            <Text
              style={{
                color: UI.danger,
                fontWeight: "900",
                fontSize: 18,
              }}
            >
              No Access
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "800",
                lineHeight: 22,
              }}
            >
              Hii screen ni ya STAFF
              tu.
            </Text>

            <Pressable
              onPress={() =>
                router.back()
              }
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor:
                  UI.border,
                borderRadius: 18,
                backgroundColor:
                  UI.softCard,
                paddingVertical: 14,
                alignItems:
                  "center",
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                }}
              >
                Back
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: UI.bg0,
      }}
      edges={["top"]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 170,
          gap: 12,
        }}
      >
        {/* =====================================================
            HEADER
        ===================================================== */}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
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
              borderRadius: 999,
              borderWidth: 1,
              borderColor: UI.border,
              backgroundColor:
                "#FFFFFF",
              alignItems: "center",
              justifyContent:
                "center",
            }}
          >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 18,
              }}
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={{
                fontSize: 26,
                fontWeight: "900",
                color: UI.text,
              }}
            >
              My Sales
            </Text>

            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                marginTop: 4,
              }}
            >
              My sales, accumulated
              commission and unpaid
              balance
            </Text>
          </View>
        </View>

        {/* =====================================================
            STAFF ACCOUNT
        ===================================================== */}

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor:
              UI.card,
            padding: 16,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                borderWidth: 1,
                borderColor:
                  "rgba(15,23,42,0.12)",
                backgroundColor:
                  UI.softCard,
                alignItems: "center",
                justifyContent:
                  "center",
              }}
            >
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 16,
                }}
              >
                {initials}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                }}
              >
                Staff Account
              </Text>

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  fontSize: 18,
                  marginTop: 4,
                }}
                numberOfLines={2}
              >
                {email ?? "—"}
              </Text>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor:
                  "rgba(52,211,153,0.30)",
                backgroundColor:
                  "rgba(52,211,153,0.10)",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  color: UI.emerald,
                  fontWeight: "900",
                }}
              >
                STAFF
              </Text>
            </View>
          </View>

          <View>
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Organization
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 18,
                marginTop: 4,
              }}
            >
              {activeOrgName ??
                "—"}
            </Text>
          </View>

          <Text
            style={{
              color: UI.faint,
              fontWeight: "800",
              lineHeight: 20,
            }}
          >
            Commission yako
            haifutwi mwezi
            unapobadilika. Kiasi
            ambacho hakijalipwa
            kitaendelea kubebwa
            mbele mpaka owner/admin
            afanye cash-out. Ukiwekewa
            rate 0%, sales zitaendelea
            kurekodiwa lakini
            commission mpya
            haitahesabiwa.
          </Text>
        </View>

        {/* =====================================================
            PAYOUT PROFILE
        ===================================================== */}

        <View
          style={{
            borderWidth: 1,
            borderColor:
              hasPayoutProfile
                ? "rgba(52,211,153,0.20)"
                : "rgba(251,113,133,0.30)",
            borderRadius: 22,
            backgroundColor:
              hasPayoutProfile
                ? "rgba(52,211,153,0.08)"
                : "rgba(251,113,133,0.08)",
            padding: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              color:
                hasPayoutProfile
                  ? UI.emerald
                  : UI.danger,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            {hasPayoutProfile
              ? "Payout Profile Ready"
              : "Payout Profile Missing"}
          </Text>

          {hasPayoutProfile ? (
            <>
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                  lineHeight: 20,
                }}
              >
                {payoutDisplay}
              </Text>

              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "800",
                }}
              >
                Account Holder
              </Text>

              <Text
                style={{
                  color: UI.text,
                  fontWeight: "900",
                }}
              >
                {String(
                  profile?.account_holder_name ??
                    ""
                ).trim() || "—"}
              </Text>

              {payoutMethod ===
              "MOBILE" ? (
                <>
                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "800",
                    }}
                  >
                    Network
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      profile?.mobile_network ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "800",
                    }}
                  >
                    Mobile Number
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      profile?.mobile_number ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>
                </>
              ) : null}

              {payoutMethod ===
              "BANK" ? (
                <>
                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "800",
                    }}
                  >
                    Bank
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      profile?.bank_name ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "800",
                    }}
                  >
                    Bank Account
                    Name
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      profile?.bank_account_name ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "800",
                    }}
                  >
                    Bank Account
                    Number
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {String(
                      profile?.bank_account_number ??
                        ""
                    ).trim() ||
                      "—"}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text
                style={{
                  color: UI.text,
                  fontWeight: "800",
                  lineHeight: 20,
                }}
              >
                Bado hujajaza
                sehemu ya kupokea
                commission kupitia
                Mobile Money au Bank.
              </Text>

              <Pressable
                onPress={() =>
                  router.push(
                    "/(tabs)/staff/payout-profile" as any
                  )
                }
                style={{
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor:
                    "rgba(5,150,105,0.24)",
                  backgroundColor:
                    "rgba(5,150,105,0.08)",
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems:
                    "center",
                }}
              >
                <Text
                  style={{
                    color:
                      UI.emerald,
                    fontWeight:
                      "900",
                  }}
                >
                  Setup Payout
                  Profile
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* =====================================================
            COMMISSION STATUS
        ===================================================== */}

        <View
          style={{
            borderWidth: 1,
            borderColor: isSettled
              ? "rgba(52,211,153,0.24)"
              : unpaidBalance > 0
                ? "rgba(245,158,11,0.24)"
                : UI.border,
            borderRadius: 22,
            backgroundColor:
              isSettled
                ? "rgba(52,211,153,0.08)"
                : unpaidBalance > 0
                  ? "rgba(245,158,11,0.07)"
                  : UI.card,
            padding: 16,
            gap: 10,
          }}
        >
          <Text
            style={{
              color: isSettled
                ? UI.emerald
                : UI.text,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            {isSettled
              ? "Commission Settled"
              : unpaidBalance > 0
                ? "Unpaid Commission Balance"
                : "Commission Status"}
          </Text>

          <View
            style={{
              gap: 6,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Accumulated Commission
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 20,
              }}
            >
              {fmtMoney(
                accumulatedCommission
              )}
            </Text>
          </View>

          <View
            style={{
              gap: 6,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Total Cashed Out
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 18,
              }}
            >
              {fmtMoney(
                totalCashedOut
              )}
            </Text>
          </View>

          <View
            style={{
              gap: 6,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Unpaid Balance
            </Text>

            <Text
              style={{
                color:
                  unpaidBalance > 0
                    ? UI.warning
                    : UI.emerald,
                fontWeight: "900",
                fontSize: 22,
              }}
            >
              {fmtMoney(
                unpaidBalance
              )}
            </Text>
          </View>

          <Text
            style={{
              color: UI.faint,
              fontWeight: "800",
              lineHeight: 20,
            }}
          >
            Unpaid balance itaendelea
            kubebwa mbele mpaka
            itakapofanyiwa cash-out.
            Kubadilika kwa mwezi
            hakutaifuta balance hii.
          </Text>
        </View>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {!!error ? (
          <View
            style={{
              borderWidth: 1,
              borderColor:
                "rgba(251,113,133,0.35)",
              borderRadius: 18,
              backgroundColor:
                "rgba(251,113,133,0.08)",
              padding: 12,
            }}
          >
            <Text
              style={{
                color: UI.danger,
                fontWeight: "900",
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* =====================================================
            SALES STATS
        ===================================================== */}

        <View
          style={{
            flexDirection: "row",
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor:
                UI.softCard,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              My Sales
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 18,
                marginTop: 6,
              }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {fmtMoney(totalSales)}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 18,
              backgroundColor:
                UI.softCard,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Sales Count
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 22,
                marginTop: 6,
              }}
            >
              {salesCount}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor:
                "rgba(52,211,153,0.20)",
              borderRadius: 18,
              backgroundColor:
                "rgba(52,211,153,0.08)",
              padding: 14,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Commission Rate
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 22,
                marginTop: 6,
              }}
            >
              {commissionPercent}%
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor:
                unpaidBalance > 0
                  ? "rgba(245,158,11,0.25)"
                  : "rgba(52,211,153,0.20)",
              borderRadius: 18,
              backgroundColor:
                unpaidBalance > 0
                  ? "rgba(245,158,11,0.08)"
                  : "rgba(52,211,153,0.08)",
              padding: 14,
            }}
          >
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
              }}
            >
              Unpaid Balance
            </Text>

            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 18,
                marginTop: 6,
              }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {fmtMoney(
                unpaidBalance
              )}
            </Text>
          </View>
        </View>

        {/* =====================================================
            REFRESH
        ===================================================== */}

        <Pressable
          onPress={() =>
            void loadData()
          }
          disabled={loading}
          style={{
            backgroundColor:
              UI.softCard,
            borderWidth: 1,
            borderColor: UI.border,
            paddingVertical: 14,
            borderRadius: 18,
            alignItems: "center",
            opacity: loading
              ? 0.65
              : 1,
          }}
        >
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            {loading
              ? "Loading..."
              : "Refresh My Sales"}
          </Text>
        </Pressable>

        {/* =====================================================
            INFO
        ===================================================== */}

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor:
              UI.card,
            padding: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: UI.text,
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            Info
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              lineHeight: 20,
            }}
          >
            Membership:{" "}
            {shortId(
              String(
                row?.membership_id ??
                  ""
              )
            )}
          </Text>

          <Text
            style={{
              color: UI.muted,
              fontWeight: "800",
              lineHeight: 20,
            }}
          >
            User:{" "}
            {shortId(
              String(
                row?.user_id ?? ""
              )
            )}
          </Text>

          <Text
            style={{
              color: UI.faint,
              fontWeight: "800",
              lineHeight: 20,
            }}
          >
            Commission mpya
            inaendelea kukusanyika
            kutokana na mauzo yako.
            Unpaid commission
            haifutwi mwisho wa mwezi;
            inaendelea kubebwa mbele
            mpaka cash-out ifanyike.
            Kila cash-out
            inahifadhiwa kwenye
            Commission History.
          </Text>
        </View>

        {/* =====================================================
            COMMISSION HISTORY
        ===================================================== */}

        <View
          style={{
            borderWidth: 1,
            borderColor: UI.border,
            borderRadius: 22,
            backgroundColor:
              UI.card,
            padding: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Text
              style={{
                color: UI.text,
                fontWeight: "900",
                fontSize: 16,
                flex: 1,
              }}
            >
              Commission History
            </Text>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor:
                  UI.softCard,
                borderWidth: 1,
                borderColor:
                  UI.border,
              }}
            >
              <Text
                style={{
                  color: UI.muted,
                  fontWeight: "900",
                  fontSize: 11,
                }}
              >
                {historyRows.length}
              </Text>
            </View>
          </View>

          {historyRows.length ===
          0 ? (
            <Text
              style={{
                color: UI.muted,
                fontWeight: "800",
                lineHeight: 20,
              }}
            >
              Hakuna payout history
              bado.
            </Text>
          ) : (
            historyRows.map(
              (h) => {
                const paid =
                  Math.max(
                    0,
                    toNum(
                      h.paid_amount
                    )
                  );

                const commission =
                  Math.max(
                    0,
                    toNum(
                      h.commission_amount
                    )
                  );

                const remaining =
                  Math.max(
                    0,
                    toNum(
                      h.remaining_amount
                    )
                  );

                const status =
                  String(
                    h.status ?? ""
                  )
                    .trim()
                    .toUpperCase() ||
                  "—";

                const destination =
                  String(
                    h.payment_destination ??
                      ""
                  ).trim();

                const method =
                  String(
                    h.payment_method ??
                      ""
                  )
                    .trim()
                    .toUpperCase();

                return (
                  <View
                    key={String(
                      h.payout_id
                    )}
                    style={{
                      borderWidth: 1,
                      borderColor:
                        UI.border,
                      borderRadius: 18,
                      backgroundColor:
                        UI.softCard,
                      padding: 12,
                      gap: 7,
                    }}
                  >
                    <View
                      style={{
                        flexDirection:
                          "row",
                        alignItems:
                          "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            UI.text,
                          fontWeight:
                            "900",
                          flex: 1,
                        }}
                      >
                        Cash-Out Record
                      </Text>

                      <View
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor:
                            status ===
                              "RECEIVED" ||
                            status ===
                              "CONFIRMED"
                              ? "rgba(52,211,153,0.10)"
                              : "rgba(245,158,11,0.10)",
                        }}
                      >
                        <Text
                          style={{
                            color:
                              status ===
                                "RECEIVED" ||
                              status ===
                                "CONFIRMED"
                                ? UI.emerald
                                : UI.warning,
                            fontWeight:
                              "900",
                            fontSize: 11,
                          }}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Commission at
                      Cash-Out:{" "}
                      {fmtMoney(
                        commission
                      )}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Paid:{" "}
                      {fmtMoney(paid)}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Remaining After
                      Cash-Out:{" "}
                      {fmtMoney(
                        remaining
                      )}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Record Period:{" "}
                      {String(
                        h.period_key ??
                          ""
                      ).trim() || "—"}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Reference:{" "}
                      {String(
                        h.reference ??
                          ""
                      ).trim() || "—"}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                      }}
                    >
                      Destination:{" "}
                      {method || "—"}
                      {destination
                        ? ` • ${destination}`
                        : ""}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.muted,
                        fontWeight:
                          "800",
                        lineHeight: 20,
                      }}
                    >
                      Transaction
                      Message:{" "}
                      {String(
                        h.note ?? ""
                      ).trim() || "—"}
                    </Text>

                    <Text
                      style={{
                        color:
                          UI.faint,
                        fontWeight:
                          "800",
                        lineHeight: 20,
                      }}
                    >
                      Date:{" "}
                      {formatHistoryDate(
                        h.created_at
                      )}
                    </Text>
                  </View>
                );
              }
            )
          )}
        </View>

        {/* =====================================================
            NO DATA
        ===================================================== */}

        {!row ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: UI.border,
              borderRadius: 22,
              backgroundColor:
                UI.card,
              padding: 16,
            }}
          >
            <Text
              style={{
                fontWeight: "900",
                color: UI.text,
              }}
            >
              No sales data yet
            </Text>

            <Text
              style={{
                marginTop: 6,
                color: UI.muted,
                fontWeight: "700",
                lineHeight: 20,
              }}
            >
              Bado hakuna staff
              sales data iliyohusishwa
              na membership yako.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}