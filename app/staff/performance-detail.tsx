import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrg } from "../../src/context/OrgContext";
import { supabase } from "../../src/supabase/supabaseClient";

type RangeKey =
  | "today"
  | "week"
  | "month"
  | "year"
  | "custom";

type PerformanceRow = {
  sale_id?: string | null;
  id?: string | null;

  sale_date?: string | null;
  sold_at?: string | null;
  created_at?: string | null;

  total_amount?: number | string | null;
  sale_amount?: number | string | null;
  sales_amount?: number | string | null;
  grand_total?: number | string | null;

  gross_profit?: number | string | null;
  profit_amount?: number | string | null;

  commission_amount?: number | string | null;
  net_profit_after_commission?: number | string | null;

  [key: string]: any;
};

const UI = {
  bg0: "#F3F7FC",
  card: "#FFFFFF",
  border: "rgba(15,23,42,0.10)",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  emerald: "#059669",
  emeraldSoft: "rgba(5,150,105,0.10)",
  danger: "#E11D48",
  dangerSoft: "rgba(225,29,72,0.06)",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatTZS(n: number) {
  return `TSh ${Math.round(toNum(n)).toLocaleString(
    "en-TZ"
  )}`;
}

function getSaleAmount(r: PerformanceRow) {
  return toNum(
    r.grand_total ??
      r.total_amount ??
      r.sale_amount ??
      r.sales_amount
  );
}

function getGrossProfit(r: PerformanceRow) {
  return toNum(
    r.gross_profit ??
      r.profit_amount
  );
}

function getCommissionAmount(r: PerformanceRow) {
  return Math.max(
    0,
    toNum(r.commission_amount)
  );
}

function getNetProfitAfterCommission(
  r: PerformanceRow
) {
  if (
    r.net_profit_after_commission !== null &&
    r.net_profit_after_commission !== undefined
  ) {
    return toNum(
      r.net_profit_after_commission
    );
  }

  const grossProfit = getGrossProfit(r);
  const commission = getCommissionAmount(r);

  return grossProfit - commission;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(
    d.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    d.getDate()
  ).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function isValidYmd(value: string) {
  const raw = String(value ?? "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {
    return false;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] = raw.split("-");

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const d = new Date(
    year,
    month - 1,
    day
  );

  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

function getRange(
  key: RangeKey,
  customFrom: string,
  customTo: string
) {
  const now = new Date();
  const to = ymd(now);
  const fromDate = new Date(now);

  if (key === "today") {
    return {
      from: to,
      to,
    };
  }

  if (key === "week") {
    fromDate.setDate(
      now.getDate() - 6
    );

    return {
      from: ymd(fromDate),
      to,
    };
  }

  if (key === "month") {
    fromDate.setDate(1);

    return {
      from: ymd(fromDate),
      to,
    };
  }

  if (key === "year") {
    fromDate.setMonth(0, 1);

    return {
      from: ymd(fromDate),
      to,
    };
  }

  return {
    from: customFrom.trim(),
    to: customTo.trim(),
  };
}

function formatDisplayDate(
  value?: string | null
) {
  const raw = String(
    value ?? ""
  ).trim();

  if (!raw) return "—";

  const d = new Date(raw);

  if (
    Number.isNaN(d.getTime())
  ) {
    return raw;
  }

  try {
    return d.toLocaleString();
  } catch {
    return raw;
  }
}

export default function StaffPerformanceDetailScreen() {
  const router = useRouter();

  const params =
    useLocalSearchParams<{
      membershipId?:
        | string
        | string[];
      userId?:
        | string
        | string[];
      email?:
        | string
        | string[];
    }>();

  const {
    activeOrgId,
    activeOrgName,
    activeRole,
  } = useOrg();

  const orgId = String(
    activeOrgId ?? ""
  ).trim();

  const membershipId = String(
    one(params.membershipId) ?? ""
  ).trim();

  const userId = String(
    one(params.userId) ?? ""
  ).trim();

  const email = String(
    one(params.email) ?? ""
  ).trim();

  const role = String(
    activeRole ?? ""
  )
    .trim()
    .toLowerCase();

  const canManage =
    role === "owner" ||
    role === "admin";

  const [
    rangeKey,
    setRangeKey,
  ] =
    useState<RangeKey>(
      "month"
    );

  const [
    customFrom,
    setCustomFrom,
  ] = useState("");

  const [
    customTo,
    setCustomTo,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    rows,
    setRows,
  ] =
    useState<
      PerformanceRow[]
    >([]);

  const range = useMemo(
    () =>
      getRange(
        rangeKey,
        customFrom,
        customTo
      ),
    [
      rangeKey,
      customFrom,
      customTo,
    ]
  );

  const customRangeReady =
    rangeKey !== "custom" ||
    (
      isValidYmd(range.from) &&
      isValidYmd(range.to)
    );

  const customRangeOrderValid =
    rangeKey !== "custom" ||
    (
      customRangeReady &&
      range.from <= range.to
    );

  const loadData =
    useCallback(
      async (
        opts?: {
          silent?: boolean;
          showValidationAlert?: boolean;
        }
      ) => {
        const silent =
          !!opts?.silent;

        const showValidationAlert =
          !!opts?.showValidationAlert;

        if (!canManage) {
          setRows([]);
          setError(
            "Owner/Admin only."
          );
          return;
        }

        if (!orgId) {
          setRows([]);
          setError(
            "No active organization."
          );
          return;
        }

        if (!membershipId) {
          setRows([]);
          setError(
            "Missing staff membership."
          );
          return;
        }

        if (
          rangeKey === "custom" &&
          !customRangeReady
        ) {
          setRows([]);

          if (
            showValidationAlert
          ) {
            Alert.alert(
              "Invalid Date",
              "Weka tarehe sahihi kwa format YYYY-MM-DD."
            );
          }

          return;
        }

        if (
          rangeKey === "custom" &&
          !customRangeOrderValid
        ) {
          setRows([]);

          if (
            showValidationAlert
          ) {
            Alert.alert(
              "Invalid Range",
              "Tarehe ya kuanzia haiwezi kuwa baada ya tarehe ya kuishia."
            );
          }

          return;
        }

        if (!silent) {
          setLoading(true);
        }

        setError(null);

        try {
          const {
            data,
            error: rpcError,
          } =
            await supabase.rpc(
              "get_staff_performance_detail_v1",
              {
                p_org_id:
                  orgId,
                p_membership_id:
                  membershipId,
                p_from_date:
                  range.from,
                p_to_date:
                  range.to,
              }
            );

          if (rpcError) {
            throw rpcError;
          }

          setRows(
            Array.isArray(data)
              ? (
                  data as PerformanceRow[]
                )
              : []
          );
        } catch (err: any) {
          setRows([]);

          setError(
            err?.message ??
              "Failed to load staff performance detail"
          );
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      },
      [
        canManage,
        orgId,
        membershipId,
        rangeKey,
        range.from,
        range.to,
        customRangeReady,
        customRangeOrderValid,
      ]
    );

  useEffect(() => {
    if (
      rangeKey === "custom" &&
      !customRangeReady
    ) {
      return;
    }

    if (
      rangeKey === "custom" &&
      !customRangeOrderValid
    ) {
      return;
    }

    void loadData({
      silent: true,
    });
  }, [
    loadData,
    rangeKey,
    customRangeReady,
    customRangeOrderValid,
  ]);

  const onRefresh =
    useCallback(
      async () => {
        setRefreshing(true);

        try {
          await loadData({
            silent: true,
            showValidationAlert: true,
          });
        } finally {
          setRefreshing(false);
        }
      },
      [loadData]
    );

  const totals =
    useMemo(() => {
      return rows.reduce(
        (acc, row) => {
          acc.sales +=
            getSaleAmount(
              row
            );

          acc.profit +=
            getGrossProfit(
              row
            );

          acc.commission +=
            getCommissionAmount(
              row
            );

          acc.netProfit +=
            getNetProfitAfterCommission(
              row
            );

          acc.receipts += 1;

          return acc;
        },
        {
          sales: 0,
          profit: 0,
          commission: 0,
          netProfit: 0,
          receipts: 0,
        }
      );
    }, [rows]);

  if (!canManage) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor:
            UI.bg0,
        }}
        edges={["top"]}
      >
        <View
          style={{
            flex: 1,
            padding: 18,
            justifyContent:
              "center",
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor:
                "rgba(225,29,72,0.25)",
              borderRadius: 22,
              backgroundColor:
                UI.dangerSoft,
              padding: 16,
              gap: 10,
            }}
          >
            <Text
              style={{
                color:
                  UI.danger,
                fontWeight:
                  "900",
                fontSize: 18,
              }}
            >
              No Access
            </Text>

            <Text
              style={{
                color:
                  UI.text,
                fontWeight:
                  "800",
                lineHeight: 21,
              }}
            >
              Hii report ni
              ya Owner/Admin
              tu.
            </Text>

            <Pressable
              onPress={() =>
                router.back()
              }
              style={{
                marginTop: 6,
                borderWidth: 1,
                borderColor:
                  UI.border,
                borderRadius: 18,
                backgroundColor:
                  UI.card,
                paddingVertical: 14,
                alignItems:
                  "center",
              }}
            >
              <Text
                style={{
                  color:
                    UI.text,
                  fontWeight:
                    "900",
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
        backgroundColor:
          UI.bg0,
      }}
      edges={["top"]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={
              onRefresh
            }
          />
        }
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 170,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection:
              "row",
            alignItems:
              "center",
            gap: 12,
          }}
        >
          <Pressable
            onPress={() =>
              router.back()
            }
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              borderWidth: 1,
              borderColor:
                UI.border,
              backgroundColor:
                UI.card,
              alignItems:
                "center",
              justifyContent:
                "center",
            }}
          >
            <Text
              style={{
                color:
                  UI.text,
                fontWeight:
                  "900",
                fontSize: 22,
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
                color:
                  UI.text,
                fontWeight:
                  "900",
                fontSize: 26,
              }}
            >
              Staff Report
            </Text>

            <Text
              style={{
                color:
                  UI.muted,
                fontWeight:
                  "800",
                marginTop: 4,
              }}
            >
              {activeOrgName ??
                "—"}{" "}
              •{" "}
              {email ||
                userId ||
                "Staff"}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection:
              "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {(
            [
              "today",
              "week",
              "month",
              "year",
              "custom",
            ] as RangeKey[]
          ).map((key) => {
            const active =
              rangeKey ===
              key;

            return (
              <Pressable
                key={key}
                onPress={() => {
                  setError(
                    null
                  );

                  setRangeKey(
                    key
                  );
                }}
                style={{
                  borderWidth: 1,
                  borderColor:
                    active
                      ? "rgba(52,211,153,0.35)"
                      : UI.border,
                  backgroundColor:
                    active
                      ? "rgba(52,211,153,0.10)"
                      : UI.card,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    color:
                      UI.text,
                    fontWeight:
                      "900",
                  }}
                >
                  {key.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rangeKey ===
        "custom" ? (
          <View
            style={{
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection:
                  "row",
                gap: 10,
              }}
            >
              <TextInput
                value={
                  customFrom
                }
                onChangeText={(
                  value
                ) => {
                  setCustomFrom(
                    value
                  );
                  setError(
                    null
                  );
                }}
                placeholder="From YYYY-MM-DD"
                placeholderTextColor={
                  UI.faint
                }
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor:
                    UI.border,
                  borderRadius: 18,
                  backgroundColor:
                    UI.card,
                  padding: 12,
                  color:
                    UI.text,
                  fontWeight:
                    "900",
                }}
              />

              <TextInput
                value={
                  customTo
                }
                onChangeText={(
                  value
                ) => {
                  setCustomTo(
                    value
                  );
                  setError(
                    null
                  );
                }}
                placeholder="To YYYY-MM-DD"
                placeholderTextColor={
                  UI.faint
                }
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor:
                    UI.border,
                  borderRadius: 18,
                  backgroundColor:
                    UI.card,
                  padding: 12,
                  color:
                    UI.text,
                  fontWeight:
                    "900",
                }}
              />
            </View>

            <Pressable
              onPress={() =>
                void loadData({
                  showValidationAlert:
                    true,
                })
              }
              disabled={loading}
              style={{
                borderWidth: 1,
                borderColor:
                  "rgba(52,211,153,0.30)",
                borderRadius: 18,
                backgroundColor:
                  UI.emeraldSoft,
                paddingVertical: 13,
                alignItems:
                  "center",
                opacity:
                  loading
                    ? 0.6
                    : 1,
              }}
            >
              <Text
                style={{
                  color:
                    UI.text,
                  fontWeight:
                    "900",
                }}
              >
                Apply Custom
                Range
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!!error ? (
          <View
            style={{
              borderWidth: 1,
              borderColor:
                "rgba(225,29,72,0.25)",
              borderRadius: 18,
              backgroundColor:
                UI.dangerSoft,
              padding: 14,
            }}
          >
            <Text
              style={{
                color:
                  UI.danger,
                fontWeight:
                  "900",
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            borderWidth: 1,
            borderColor:
              UI.border,
            borderRadius: 22,
            backgroundColor:
              UI.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text
            style={{
              color:
                UI.text,
              fontWeight:
                "900",
              fontSize: 18,
            }}
          >
            Summary
          </Text>

          <Text
            style={{
              color:
                UI.muted,
              fontWeight:
                "900",
            }}
          >
            Period:{" "}
            {range.from ||
              "—"}{" "}
            →{" "}
            {range.to ||
              "—"}
          </Text>

          <Text
            style={{
              color:
                UI.text,
              fontWeight:
                "900",
              fontSize: 20,
            }}
          >
            Sales:{" "}
            {formatTZS(
              totals.sales
            )}
          </Text>

          <Text
            style={{
              color:
                UI.text,
              fontWeight:
                "900",
            }}
          >
            Gross Profit:{" "}
            {formatTZS(
              totals.profit
            )}
          </Text>

          <Text
            style={{
              color:
                UI.text,
              fontWeight:
                "900",
            }}
          >
            Commission:{" "}
            {formatTZS(
              totals.commission
            )}
          </Text>

          <Text
            style={{
              color:
                UI.emerald,
              fontWeight:
                "900",
            }}
          >
            Net Profit After
            Commission:{" "}
            {formatTZS(
              totals.netProfit
            )}
          </Text>

          <Text
            style={{
              color:
                UI.muted,
              fontWeight:
                "900",
            }}
          >
            Receipts:{" "}
            {totals.receipts}
          </Text>
        </View>

        <Pressable
          onPress={() =>
            void loadData({
              showValidationAlert:
                true,
            })
          }
          disabled={loading}
          style={{
            borderWidth: 1,
            borderColor:
              UI.border,
            borderRadius: 18,
            backgroundColor:
              UI.card,
            paddingVertical: 14,
            alignItems:
              "center",
            opacity:
              loading
                ? 0.6
                : 1,
          }}
        >
          <Text
            style={{
              color:
                UI.text,
              fontWeight:
                "900",
            }}
          >
            {loading
              ? "Loading..."
              : "Refresh Report"}
          </Text>
        </Pressable>

        <Text
          style={{
            color:
              UI.text,
            fontWeight:
              "900",
            fontSize: 18,
          }}
        >
          Sales / Receipts
        </Text>

        {rows.length ===
        0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor:
                UI.border,
              borderRadius: 22,
              backgroundColor:
                UI.card,
              padding: 16,
            }}
          >
            <Text
              style={{
                color:
                  UI.text,
                fontWeight:
                  "900",
              }}
            >
              No sales found
            </Text>

            <Text
              style={{
                color:
                  UI.muted,
                fontWeight:
                  "800",
                marginTop: 6,
                lineHeight: 20,
              }}
            >
              Hakuna mauzo
              yaliyopatikana kwa
              mfanyakazi huyu
              kwenye range hii.
            </Text>
          </View>
        ) : (
          rows.map(
            (
              row,
              index
            ) => {
              const saleAmount =
                getSaleAmount(
                  row
                );

              const grossProfit =
                getGrossProfit(
                  row
                );

              const commission =
                getCommissionAmount(
                  row
                );

              const netProfit =
                getNetProfitAfterCommission(
                  row
                );

              const saleKey =
                String(
                  row.sale_id ??
                    row.id ??
                    `${membershipId}-${index}`
                );

              return (
                <View
                  key={
                    saleKey
                  }
                  style={{
                    borderWidth: 1,
                    borderColor:
                      UI.border,
                    borderRadius: 22,
                    backgroundColor:
                      UI.card,
                    padding: 16,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color:
                        UI.emerald,
                      fontWeight:
                        "900",
                      fontSize: 12,
                    }}
                  >
                    RECEIPT #
                    {index +
                      1}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    {formatDisplayDate(
                      row.sale_date ??
                        row.sold_at ??
                        row.created_at
                    )}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "900",
                    }}
                  >
                    Sales:{" "}
                    {formatTZS(
                      saleAmount
                    )}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "900",
                    }}
                  >
                    Gross Profit:{" "}
                    {formatTZS(
                      grossProfit
                    )}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.muted,
                      fontWeight:
                        "900",
                    }}
                  >
                    Commission:{" "}
                    {formatTZS(
                      commission
                    )}
                  </Text>

                  <Text
                    style={{
                      color:
                        UI.text,
                      fontWeight:
                        "900",
                    }}
                  >
                    Net Profit:{" "}
                    {formatTZS(
                      netProfit
                    )}
                  </Text>
                </View>
              );
            }
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}