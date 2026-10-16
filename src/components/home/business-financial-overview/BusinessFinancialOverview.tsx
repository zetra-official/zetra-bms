import {useLanguage} from "@/src/i18n/LanguageProvider";
import {localizedFinancialResult} from "@/src/i18n/presentation";
﻿import {useCommonText} from "@/src/i18n/useCommonText";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  Text,
  View,

  Platform,
} from "react-native";

import FinancialChart, {
  type FinancialTrendMetric,
} from "./FinancialChart";

import FinancialOverviewFullView from "./FinancialOverviewFullView";

import {
  loadFinancialComparison,
  type FinancialComparisonResult,
  type FinancialOverviewResult,
} from "./financialDataEngine";

import {
  buildFinancialBuckets,
  buildFinancialTrendBuckets,
  formatFinancialRange,
  resolveFinancialRange,
  toYMD,
  type FinancialDateRange,
  type FinancialPeriodMode,
} from "./periodEngine";

type Props = {
  storeIds: string[];
  enabled?: boolean;
};

const EMPTY_RESULT: FinancialOverviewResult = {
  range: {
    fromYMD: "",
    toYMD: "",
  },
  total: {
    sales: 0,
    expenses: 0,
    netProfit: 0,
    cogs: 0,
    orders: 0,
  },
  buckets: [],
};

const PERIOD_OPTIONS: {
  value: FinancialPeriodMode;
  label: string;
}[] = [
  {
    value: "THIS_MONTH",
    label: "This Month",
  },
  {
    value: "THREE_MONTHS",
    label: "3 Months",
  },
  {
    value: "SIX_MONTHS",
    label: "6 Months",
  },
  {
    value: "THIS_YEAR",
    label: "This Year",
  },
  {
    value: "CUSTOM",
    label: "Custom Range",
  },
];

const METRIC_OPTIONS: {
  value: FinancialTrendMetric;
  label: string;
  color: string;
  activeBackground: string;
}[] = [
  {
    value: "SALES",
    label: "Sales",
    color: "#2563EB",
    activeBackground: "#EFF6FF",
  },
  {
    value: "EXPENSES",
    label: "Expenses",
    color: "#F59E0B",
    activeBackground: "#FFFBEB",
  },
  {
    value: "NET_PROFIT",
    label: "Net Profit",
    color: "#16A34A",
    activeBackground: "#F0FDF4",
  },
];

function cleanStoreIds(
  values: string[]
) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) =>
          String(value ?? "").trim()
        )
        .filter(Boolean)
    )
  );
}

function periodTitle(
  mode: FinancialPeriodMode
) {
  return (
    PERIOD_OPTIONS.find(
      (item) =>
        item.value === mode
    )?.label ?? "This Month"
  );
}

export default function BusinessFinancialOverview({
  storeIds,
  enabled = true,
}: Props) {
 const uiText=useCommonText();
 const {language}=useLanguage();
  const [periodMode, setPeriodMode] =
    useState<FinancialPeriodMode>(
      "THIS_MONTH"
    );

  const [selectedMetric, setSelectedMetric] =
    useState<FinancialTrendMetric>(
      "SALES"
    );

  const [result, setResult] =
    useState<FinancialOverviewResult>(
      EMPTY_RESULT
    );

  const [comparison, setComparison] =
    useState<FinancialComparisonResult | null>(
      null
    );

  const [loading, setLoading] =
    useState(false);

  const [errorText, setErrorText] =
    useState("");

  const [expanded, setExpanded] =
    useState(false);

  const [customRangeDraft, setCustomRangeDraft] =
    useState<FinancialDateRange>(() => {
      const today = toYMD(new Date());

      return {
        fromYMD: today,
        toYMD: today,
      };
    });

  const [appliedCustomRange, setAppliedCustomRange] =
    useState<FinancialDateRange>(() => {
      const today = toYMD(new Date());

      return {
        fromYMD: today,
        toYMD: today,
      };
    });

  const [customRangeError, setCustomRangeError] =
    useState("");

  const stableStoreIds =
    useMemo(
      () =>
        cleanStoreIds(storeIds),
      [storeIds]
    );

  const storeKey =
    useMemo(
      () =>
        stableStoreIds
          .slice()
          .sort()
          .join("|"),
      [stableStoreIds]
    );

  const anchorYMD =
    useMemo(
      () => toYMD(new Date()),
      []
    );

  const selectedRange =
    useMemo(
      () =>
        resolveFinancialRange(
          periodMode,
          anchorYMD,
          periodMode === "CUSTOM"
            ? appliedCustomRange
            : undefined
        ),
      [
        periodMode,
        anchorYMD,
        appliedCustomRange,
      ]
    );

  const buckets =
    useMemo(
      () =>
        buildFinancialTrendBuckets(
          periodMode,
          selectedRange
        ),
      [
        periodMode,
        selectedRange,
      ]
    );

  const updateCustomFrom = useCallback(
    (value: string) => {
      setCustomRangeDraft(
        (current) => ({
          ...current,
          fromYMD: value,
        })
      );

      setCustomRangeError("");
    },
    []
  );

  const updateCustomTo = useCallback(
    (value: string) => {
      setCustomRangeDraft(
        (current) => ({
          ...current,
          toYMD: value,
        })
      );

      setCustomRangeError("");
    },
    []
  );

  const applyCustomRange = useCallback(
    () => {
      try {
        const validated =
          resolveFinancialRange(
            "CUSTOM",
            anchorYMD,
            customRangeDraft
          );

        setAppliedCustomRange(
          validated
        );

        setPeriodMode(
          "CUSTOM"
        );

        setCustomRangeError("");
      } catch (error) {
        setCustomRangeError(
          error instanceof Error
            ? error.message
            : "Invalid custom financial range."
        );
      }
    },
    [
      anchorYMD,
      customRangeDraft,
    ]
  );

  const load =
    useCallback(
      async () => {
        if (
          !enabled ||
          !stableStoreIds.length
        ) {
          setResult({
            ...EMPTY_RESULT,
            range:
              selectedRange,
          });

          setComparison(null);
          setErrorText("");
          setLoading(false);

          return;
        }

        setLoading(true);
        setErrorText("");

        try {
          const nextComparison =
            await loadFinancialComparison(
              stableStoreIds,
              periodMode,
              selectedRange,
              buckets
            );

          /*
           * One verified comparison result powers both surfaces:
           * current data feeds the compact overview,
           * while previous-period buckets are also passed to the
           * compact TREND chart and Premium Full View.
           * No additional request is required.
           */
          setComparison(
            nextComparison
          );

          setResult(
            nextComparison.current
          );
        } catch (error: any) {
          setErrorText(
            String(
              error?.message ??
                error ??
                "Unable to load financial overview."
            )
          );
        } finally {
          setLoading(false);
        }
      },
      [
        enabled,
        storeKey,
        periodMode,
        selectedRange,
        buckets,
      ]
    );

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel =
    formatFinancialRange(
      selectedRange, language==='en'?'en-GB':language
    );

  const displayResult=useMemo(()=>localizedFinancialResult(language,result),[language,result]);
  const displayComparison=useMemo(()=>comparison?{...comparison,current:localizedFinancialResult(language,comparison.current),previous:localizedFinancialResult(language,comparison.previous),insight:{...comparison.insight,bestPeriod:comparison.insight.bestPeriod?localizedFinancialResult(language,{range:comparison.current.range,total:comparison.current.total,buckets:[comparison.insight.bestPeriod]}).buckets[0]:null,weakestPeriod:comparison.insight.weakestPeriod?localizedFinancialResult(language,{range:comparison.current.range,total:comparison.current.total,buckets:[comparison.insight.weakestPeriod]}).buckets[0]:null}}:null,[language,comparison]);
  const hasStores =
    stableStoreIds.length > 0;

  return (
    <View
      style={{
        width: "100%",
        borderWidth: 1,
        borderColor: "#E3EAF3",
        borderRadius: 15,
        backgroundColor: "#FFFFFF",
        padding: 13,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: 10,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text numberOfLines={1}
            style={{
              color: "#0F172A",
              fontSize: 13,
              fontWeight: "900",
              letterSpacing: -0.15,
            }}
          >
            {uiText("Business Financial Overview")}</Text>

          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              color: "#64748B",
              fontSize: 9,
              fontWeight: "700",
            }}
          >
            {rangeLabel}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >

          {/* EXPAND FINANCIAL WORKSPACE */}
          <Pressable
            onPress={() =>
              setExpanded(true)
            }
            accessibilityRole="button"
            accessibilityLabel={uiText("Open full financial overview")}
            {...({
              title: uiText("Open Full View"),
            } as any)}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: pressed
                ? "#1D4ED8"
                : "#93C5FD",
              backgroundColor: pressed
                ? "#DBEAFE"
                : "#EFF6FF",
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web"
                ? ({
                    cursor: "pointer",
                  } as any)
                : {}),
            })}
          >
            <View
              pointerEvents="none"
              style={{
                width: 20,
                height: 20,
                position: "relative",
              }}
            >
              <Text
                style={{
                  position: "absolute",
                  left: -1,
                  top: -3,
                  color: "#2563EB",
                  fontSize: 12,
                  lineHeight: 13,
                  fontWeight: "900",
                }}
              >
                ↖
              </Text>

              <Text
                style={{
                  position: "absolute",
                  right: -1,
                  top: -3,
                  color: "#2563EB",
                  fontSize: 12,
                  lineHeight: 13,
                  fontWeight: "900",
                }}
              >
                ↗
              </Text>

              <Text
                style={{
                  position: "absolute",
                  left: -1,
                  bottom: -3,
                  color: "#2563EB",
                  fontSize: 12,
                  lineHeight: 13,
                  fontWeight: "900",
                }}
              >
                ↙
              </Text>

              <Text
                style={{
                  position: "absolute",
                  right: -1,
                  bottom: -3,
                  color: "#2563EB",
                  fontSize: 12,
                  lineHeight: 13,
                  fontWeight: "900",
                }}
              >
                ↘
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 5,
          marginTop: 11,
        }}
      >
        {PERIOD_OPTIONS.filter(
          (option) =>
            option.value !== "CUSTOM"
        ).map(
          (option) => {
            const selected =
              option.value ===
              periodMode;

            return (
              <Pressable
                key={option.value}
                onPress={() =>
                  setPeriodMode(
                    option.value
                  )
                }
                style={{
                  paddingHorizontal:
                    9,
                  paddingVertical: 6,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor:
                    selected
                      ? "#2563EB"
                      : "#E2E8F0",
                  backgroundColor:
                    selected
                      ? "#EFF6FF"
                      : "#FFFFFF",
                }}
              >
                <Text
                  style={{
                    color:
                      selected
                        ? "#1D4ED8"
                        : "#64748B",
                    fontSize: 9,
                    fontWeight:
                      "800",
                  }}
                >
                  {uiText(option.label)}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      {!hasStores ? (
        <View
          style={{
            minHeight: 205,
            alignItems: "center",
            justifyContent:
              "center",
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: "#64748B",
              fontSize: 11,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            {uiText("No store is available for this financial view.")}</Text>
        </View>
      ) : loading ? (
        <View
          style={{
            minHeight: 205,
            alignItems: "center",
            justifyContent:
              "center",
            gap: 9,
          }}
        >
          <ActivityIndicator />

          <Text
            style={{
              color: "#64748B",
              fontSize: 10,
              fontWeight: "700",
            }}
          >
            {uiText("Loading verified finance data...")}</Text>
        </View>
      ) : errorText ? (
        <View
          style={{
            minHeight: 205,
            alignItems: "center",
            justifyContent:
              "center",
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              color: "#B91C1C",
              fontSize: 10,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            {errorText}
          </Text>

          <Pressable
            onPress={load}
            style={{
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 9,
              backgroundColor:
                "#0F172A",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 9,
                fontWeight: "900",
              }}
            >
              {uiText("Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
              padding: 4,
              borderRadius: 11,
              backgroundColor: "#F8FAFC",
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            {METRIC_OPTIONS.map(
              (option) => {
                const selected =
                  option.value ===
                  selectedMetric;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() =>
                      setSelectedMetric(
                        option.value
                      )
                    }
                    style={{
                      flex: 1,
                      minHeight: 32,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingHorizontal: 7,
                      paddingVertical: 7,
                      borderRadius: 8,
                      borderWidth:
                        selected ? 1 : 0,
                      borderColor:
                        selected
                          ? option.color
                          : "transparent",
                      backgroundColor:
                        selected
                          ? option.activeBackground
                          : "transparent",
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        backgroundColor:
                          option.color,
                      }}
                    />

                    <Text
                      numberOfLines={1}
                      style={{
                        color:
                          selected
                            ? option.color
                            : "#64748B",
                        fontSize: 9,
                        fontWeight: "900",
                      }}
                    >
                      {uiText(option.label)}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>

          <View
            style={{
              marginTop: 7,
              marginHorizontal: 1,
              paddingTop: 6,
              paddingBottom: 2,
              paddingHorizontal: 3,
              minHeight: 214,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E3ECF7",
              backgroundColor: "#F8FBFF",
              shadowColor: "#2563EB",
              shadowOpacity: 0.035,
              shadowRadius: 10,
              shadowOffset: {
                width: 0,
                height: 4,
              },
            }}
          >
            <FinancialChart
              mode="TREND"
              metric={selectedMetric}
              total={result.total}
              buckets={
                displayResult.buckets
              }
              previousBuckets={
                displayComparison?.previous?.buckets ??
                []
              }
              width={320}
              height={205}
              compact
            />
          </View>


        </>
      )}
      <FinancialOverviewFullView
        visible={expanded}
        onClose={() =>
          setExpanded(false)
        }
        result={displayResult}
        comparison={displayComparison}
        periodMode={periodMode}
        onPeriodChange={
          setPeriodMode
        }
        selectedMetric={
          selectedMetric
        }
        onMetricChange={
          setSelectedMetric
        }
        periodOptions={
          PERIOD_OPTIONS
        }
        metricOptions={
          METRIC_OPTIONS
        }
        rangeLabel={
          rangeLabel
        }
        periodLabel={uiText(periodTitle(
          periodMode
        ))}
        customRangeDraft={
          customRangeDraft
        }
        customRangeError={
          customRangeError
        }
        onCustomFromChange={
          updateCustomFrom
        }
        onCustomToChange={
          updateCustomTo
        }
        onApplyCustomRange={
          applyCustomRange
        }
        loading={loading}
        errorText={errorText}
      />

    </View>
  );
}











