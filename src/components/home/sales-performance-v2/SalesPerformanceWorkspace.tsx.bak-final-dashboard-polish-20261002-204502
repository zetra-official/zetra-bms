import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, {
  G,
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import {
  loadSalesPerformance,
  type SalesPerformancePoint,
  type SalesPerformanceResult,
} from "./salesPerformanceDataEngine";

import {
  formatSalesPerformanceRange,
  type SalesPerformanceMode,
} from "./periodEngine";

import {
  loadSalesIntelligence,
  type SalesIntelligenceResult,
} from "./salesIntelligenceEngine";
import {
  getCrmIntelligence,
  type ZetraAiCrmIntelligence,
} from "../../../ai/business/crmRepository";

type Props = {
  storeId: string;
  organizationId?: string | null;
  formatValue: (value: number) => string;
  refreshKey?: number | string;
  onOpenCRM?: () => void;
};

type ChartPoint = {
  key: string;
  label: string;
  current: number;
  previous: number;
};

const BLUE = "#2563EB";
const BLUE_SOFT = "#EFF6FF";
const GREEN = "#16A34A";
const GREEN_SOFT = "#F0FDF4";
const AMBER = "#D97706";
const AMBER_SOFT = "#FFFBEB";
const RED = "#E11D48";
const RED_SOFT = "#FFF1F2";
const PURPLE = "#7C3AED";
const PURPLE_SOFT = "#F5F3FF";

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compactMoney(value: number): string {
  const amount = finite(value);
  const abs = Math.abs(amount);

  if (abs >= 1_000_000_000) {
    return `TSh ${(amount / 1_000_000_000).toFixed(
      abs >= 10_000_000_000 ? 0 : 1
    )}B`;
  }

  if (abs >= 1_000_000) {
    return `TSh ${(amount / 1_000_000).toFixed(
      abs >= 10_000_000 ? 0 : 1
    )}M`;
  }

  if (abs >= 1_000) {
    return `TSh ${(amount / 1_000).toFixed(
      abs >= 10_000 ? 0 : 1
    )}K`;
  }

  return `TSh ${Math.round(amount).toLocaleString()}`;
}

function percentText(value: number | null): string {
  if (value === null) return "New";
  const n = finite(value);
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(1)}%`;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  soft,
  valueColor = "#0F172A",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  soft: string;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 145,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E8EDF4",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{
            width: 29,
            height: 29,
            borderRadius: 9,
            backgroundColor: soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={icon}
            size={15}
            color={iconColor}
          />
        </View>

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: "#64748B",
            fontWeight: "800",
            fontSize: 10,
          }}
        >
          {title}
        </Text>
      </View>

      <Text
        numberOfLines={1}
        style={{
          color: valueColor,
          fontWeight: "900",
          fontSize: 18,
          marginTop: 9,
        }}
      >
        {value}
      </Text>

      {subtitle ? (
        <Text
          numberOfLines={1}
          style={{
            color: "#94A3B8",
            fontWeight: "700",
            fontSize: 8.5,
            marginTop: 3,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function SegmentButton({
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
        minWidth: 72,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active
          ? BLUE
          : pressed
            ? "#F1F5F9"
            : "#FFFFFF",
        borderWidth: active ? 0 : 1,
        borderColor: "#E2E8F0",
      })}
    >
      <Text
        style={{
          color: active ? "#FFFFFF" : "#475569",
          fontWeight: "900",
          fontSize: 10,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function buildPath(
  points: Array<{ x: number; y: number }>
): string {
  if (points.length === 0) return "";

  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");
}

function PerformanceChart({
  currentPoints,
  previousPoints,
  compare,
}: {
  currentPoints: SalesPerformancePoint[];
  previousPoints: SalesPerformancePoint[];
  compare: boolean;
}) {
  const width = 920;
  const height = 255;

  const padLeft = 66;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 42;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const merged: ChartPoint[] = currentPoints.map(
    (point, index) => ({
      key: point.key,
      label: point.shortLabel || point.label,
      current: finite(point.sales),
      previous: finite(previousPoints[index]?.sales),
    })
  );

  const maxValue = Math.max(
    1,
    ...merged.flatMap((point) =>
      compare
        ? [point.current, point.previous]
        : [point.current]
    )
  );

  const ceiling = maxValue * 1.12;

  const slot =
    merged.length > 0
      ? plotWidth / merged.length
      : plotWidth;

  const barWidth = Math.max(
    18,
    Math.min(58, slot * 0.42)
  );

  const currentLinePoints = merged.map(
    (point, index) => {
      const x =
        padLeft +
        slot * index +
        slot / 2;

      const y =
        padTop +
        plotHeight -
        (point.current / ceiling) * plotHeight;

      return { x, y };
    }
  );

  const previousLinePoints = merged.map(
    (point, index) => {
      const x =
        padLeft +
        slot * index +
        slot / 2;

      const y =
        padTop +
        plotHeight -
        (point.previous / ceiling) * plotHeight;

      return { x, y };
    }
  );

  const gridValues = [1, 0.75, 0.5, 0.25, 0];

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E8EDF4",
        backgroundColor: "#FFFFFF",
        padding: 10,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 18,
          paddingHorizontal: 8,
          paddingBottom: 4,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              backgroundColor: BLUE,
            }}
          />
          <Text
            style={{
              color: "#64748B",
              fontWeight: "800",
              fontSize: 9,
            }}
          >
            This period
          </Text>
        </View>

        {compare ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                width: 15,
                height: 2,
                backgroundColor: GREEN,
              }}
            />
            <Text
              style={{
                color: "#64748B",
                fontWeight: "800",
                fontSize: 9,
              }}
            >
              Previous period
            </Text>
          </View>
        ) : null}
      </View>

      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {gridValues.map((ratio) => {
          const y =
            padTop + plotHeight * (1 - ratio);

          return (
            <React.Fragment key={ratio}>
              <Line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E9EEF5"
                strokeWidth={1}
              />

              <SvgText
                x={padLeft - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontWeight="700"
                fill="#94A3B8"
              >
                {compactMoney(ceiling * ratio)
                  .replace("TSh ", "")}
              </SvgText>
            </React.Fragment>
          );
        })}

        {merged.map((point, index) => {
          const centerX =
            padLeft +
            slot * index +
            slot / 2;

          const barHeight =
            point.current <= 0
              ? 0
              : Math.max(
                  3,
                  (point.current / ceiling) *
                    plotHeight
                );

          return (
            <React.Fragment key={point.key}>
              <Rect
                x={centerX - barWidth / 2}
                y={
                  padTop +
                  plotHeight -
                  barHeight
                }
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={BLUE}
                opacity={0.18}
              />

              <SvgText
                x={centerX}
                y={height - 15}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#64748B"
              >
                {point.label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {currentLinePoints.length > 0 ? (
          <Path
            d={buildPath(currentLinePoints)}
            fill="none"
            stroke={BLUE}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {currentLinePoints.map((point, index) => (
          <Circle
            key={`current-${index}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill="#FFFFFF"
            stroke={BLUE}
            strokeWidth={3}
          />
        ))}

        {compare &&
        previousLinePoints.length > 0 ? (
          <Path
            d={buildPath(previousLinePoints)}
            fill="none"
            stroke={GREEN}
            strokeWidth={2.5}
            strokeDasharray="7 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {compare
          ? previousLinePoints.map(
              (point, index) => (
                <Circle
                  key={`previous-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill="#FFFFFF"
                  stroke={GREEN}
                  strokeWidth={2}
                />
              )
            )
          : null}
      </Svg>
    </View>
  );
}

function IntelligenceCard({
  icon,
  iconColor,
  soft,
  title,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  soft: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 190,
        minHeight: 128,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E8EDF4",
        backgroundColor: "#FFFFFF",
        padding: 13,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{
            width: 29,
            height: 29,
            borderRadius: 9,
            backgroundColor: soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={icon}
            size={15}
            color={iconColor}
          />
        </View>

        <Text
          style={{
            color: "#0F172A",
            fontWeight: "900",
            fontSize: 12,
          }}
        >
          {title}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        {children}
      </View>
    </View>
  );
}

export default function SalesPerformanceWorkspace({
  storeId,
  organizationId,
  formatValue,
  refreshKey,
  onOpenCRM,
}: Props) {
  const [mode, setMode] =
    React.useState<SalesPerformanceMode>("WEEKLY");

  const [compare, setCompare] =
    React.useState(true);

  const [result, setResult] =
    React.useState<SalesPerformanceResult | null>(
      null
    );

  const [loading, setLoading] =
    React.useState(false);

  const [crmIntelligence, setCrmIntelligence] =
    React.useState<ZetraAiCrmIntelligence | null>(
      null
    );

  const [crmLoading, setCrmLoading] =
    React.useState(false);

  const [crmError, setCrmError] =
    React.useState<string | null>(null);
  const [intelligence, setIntelligence] =
    React.useState<SalesIntelligenceResult | null>(null);

  const [intelligenceLoading, setIntelligenceLoading] =
    React.useState(false);

  const [intelligenceError, setIntelligenceError] =
    React.useState<string | null>(null);
  const [errorText, setErrorText] =
    React.useState<string | null>(null);

  const requestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const normalizedStoreId =
      String(storeId ?? "").trim();

    if (!normalizedStoreId) {
      setResult(null);
      return;
    }

    const requestId = ++requestRef.current;

    setLoading(true);
    setErrorText(null);

    try {
      const next =
        await loadSalesPerformance({
          storeId: normalizedStoreId,
          mode,
        });

      if (
        requestId !== requestRef.current
      ) {
        return;
      }

      setResult(next);
    } catch (error: any) {
      if (
        requestId !== requestRef.current
      ) {
        return;
      }

      setResult(null);

      setErrorText(
        error?.message ??
          "Sales Performance data unavailable."
      );
    } finally {
      if (
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }, [storeId, mode]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /*
   * FINAL SALES INTELLIGENCE LOAD
   *
   * Canonical sources:
   * - Payment mix: get_sales_channel_summary_v3
   * - Top products: get_product_profit_report_v3
   *
   * Runs only after Sales Performance has resolved the current range.
   */
  React.useEffect(() => {
    let cancelled = false;

    const normalizedOrgId =
      String(organizationId ?? "").trim();

    const normalizedStore =
      String(storeId ?? "").trim();

    if (
      !normalizedOrgId ||
      !normalizedStore ||
      !result?.currentRange
    ) {
      setIntelligence(null);
      setIntelligenceError(null);
      return;
    }

    const run = async () => {
      setIntelligenceLoading(true);
      setIntelligenceError(null);

      try {
        const next =
          await loadSalesIntelligence({
            orgId: normalizedOrgId,
            storeId: normalizedStore,
            range: result.currentRange,
            currentSalesRows:
              Array.isArray((result as any)?.currentRows)
                ? (result as any).currentRows
                : Array.isArray((result as any)?.current?.rows)
                  ? (result as any).current.rows
                  : [],
          });

        if (cancelled) return;

        setIntelligence(next);
      } catch (error: any) {
        if (cancelled) return;

        setIntelligence(null);

        setIntelligenceError(
          String(
            error?.message ||
              "Sales intelligence could not be loaded."
          )
        );
      } finally {
        if (!cancelled) {
          setIntelligenceLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    storeId,
    result?.currentRange?.from,
    result?.currentRange?.to,
  ]);
  /*
   * CANONICAL CRM INTELLIGENCE LOAD
   *
   * Source:
   * getCrmIntelligence()
   * -> get_ai_crm_intelligence_v1
   *
   * Uses the exact same current business-date range
   * selected by Sales Performance.
   */
  React.useEffect(() => {
    let cancelled = false;

    const normalizedOrgId =
      String(organizationId ?? "").trim();

    const normalizedStoreId =
      String(storeId ?? "").trim();

    const toBusinessDate = (
      value: unknown
    ): string => {
      if (!value) return "";

      if (value instanceof Date) {
        const year =
          value.getFullYear();

        const month =
          String(
            value.getMonth() + 1
          ).padStart(2, "0");

        const day =
          String(
            value.getDate()
          ).padStart(2, "0");

        return `${year}-${month}-${day}`;
      }

      const raw =
        String(value).trim();

      const direct =
        raw.match(
          /^(\d{4})-(\d{2})-(\d{2})/
        );

      if (direct) {
        return `${direct[1]}-${direct[2]}-${direct[3]}`;
      }

      const parsed =
        new Date(raw);

      if (
        Number.isNaN(
          parsed.getTime()
        )
      ) {
        return "";
      }

      const year =
        parsed.getFullYear();

      const month =
        String(
          parsed.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          parsed.getDate()
        ).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    const fromDate =
      toBusinessDate(
        result?.currentRange?.from
      );

    const toDate =
      toBusinessDate(
        result?.currentRange?.to
      );

    if (
      !normalizedOrgId ||
      !normalizedStoreId ||
      !fromDate ||
      !toDate
    ) {
      setCrmIntelligence(null);
      setCrmError(null);
      setCrmLoading(false);
      return;
    }

    const runCrm = async () => {
      setCrmLoading(true);
      setCrmError(null);

      try {
        const next =
          await getCrmIntelligence({
            organizationId:
              normalizedOrgId,
            storeId:
              normalizedStoreId,
            fromDate,
            toDate,
            topLimit: 5,
            inactiveDays: 30,
          });

        if (!cancelled) {
          setCrmIntelligence(next);
        }
      } catch (error: any) {
        if (!cancelled) {
          setCrmIntelligence(null);
          setCrmError(
            String(
              error?.message ||
                "Unable to load customer intelligence."
            )
          );
        }
      } finally {
        if (!cancelled) {
          setCrmLoading(false);
        }
      }
    };

    void runCrm();

    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    storeId,
    result?.currentRange?.from,
    result?.currentRange?.to,
    refreshKey,
  ]);
  const currentSales =
    result?.current.sales ?? 0;

  const previousSales =
    result?.previous.sales ?? 0;

  const difference =
    result?.difference.amount ?? 0;

  const differencePercent =
    result?.difference.percent ?? null;

  const positive =
    difference >= 0;

  const rangeLabel = result
    ? formatSalesPerformanceRange(
        result.currentRange
      )
    : "";

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(15,23,42,0.08)",
        backgroundColor: "#FFFFFF",
        padding: 16,
        gap: 14,
      }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: 280,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                backgroundColor: BLUE_SOFT,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="stats-chart"
                size={20}
                color={BLUE}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#0F172A",
                  fontWeight: "900",
                  fontSize: 18,
                }}
              >
                Sales Performance
              </Text>

              <Text
                style={{
                  color: "#64748B",
                  fontWeight: "600",
                  fontSize: 9.5,
                  marginTop: 2,
                }}
              >
                Visualize sales trends and compare performance over time.
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 7,
          }}
        >
          {(
            [
              ["DAILY", "Daily"],
              ["WEEKLY", "Weekly"],
              ["MONTHLY", "Monthly"],
            ] as const
          ).map(([value, label]) => (
            <SegmentButton
              key={value}
              label={label}
              active={mode === value}
              onPress={() => setMode(value)}
            />
          ))}

          <Pressable
            onPress={() =>
              setCompare((current) => !current)
            }
            style={({ pressed }) => ({
              minWidth: 92,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: compare
                ? BLUE
                : "#E2E8F0",
              backgroundColor: compare
                ? BLUE_SOFT
                : pressed
                  ? "#F1F5F9"
                  : "#FFFFFF",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            })}
          >
            <Ionicons
              name="git-compare-outline"
              size={14}
              color={
                compare ? BLUE : "#475569"
              }
            />

            <Text
              style={{
                color:
                  compare ? BLUE : "#475569",
                fontWeight: "900",
                fontSize: 10,
              }}
            >
              Compare
            </Text>
          </Pressable>

          <View
            style={{
              minHeight: 34,
              paddingHorizontal: 11,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color="#64748B"
            />

            <Text
              style={{
                color: "#475569",
                fontWeight: "800",
                fontSize: 9,
              }}
            >
              {rangeLabel || "Current period"}
            </Text>
          </View>
        </View>
      </View>

      {/* KPI STRIP */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 9,
        }}
      >
        <MetricCard
          title="Total Sales"
          value={formatValue(currentSales)}
          subtitle="selected period"
          icon="cash-outline"
          iconColor={BLUE}
          soft={BLUE_SOFT}
        />

        <MetricCard
          title="Previous Period"
          value={formatValue(previousSales)}
          subtitle={
            compare
              ? "comparison baseline"
              : "comparison available"
          }
          icon="time-outline"
          iconColor={PURPLE}
          soft={PURPLE_SOFT}
        />

        <MetricCard
          title="Difference"
          value={`${difference >= 0 ? "+" : "-"}${formatValue(
            Math.abs(difference)
          )}`}
          subtitle={percentText(
            differencePercent
          )}
          icon={
            positive
              ? "trending-up-outline"
              : "trending-down-outline"
          }
          iconColor={positive ? GREEN : RED}
          soft={
            positive
              ? GREEN_SOFT
              : RED_SOFT
          }
          valueColor={
            positive ? GREEN : RED
          }
        />

        <MetricCard
          title="Orders"
          value={String(
            result?.current.orders ?? 0
          )}
          subtitle="completed sales"
          icon="receipt-outline"
          iconColor={AMBER}
          soft={AMBER_SOFT}
        />

        <MetricCard
          title="Average Order Value"
          value={formatValue(
            result?.current
              .averageOrderValue ?? 0
          )}
          subtitle="sales ÷ orders"
          icon="calculator-outline"
          iconColor={PURPLE}
          soft={PURPLE_SOFT}
        />
      </View>

      {/* CHART */}
      {loading && !result ? (
        <View
          style={{
            height: 305,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E8EDF4",
          }}
        >
          <ActivityIndicator
            size="small"
            color={BLUE}
          />

          <Text
            style={{
              marginTop: 9,
              color: "#64748B",
              fontWeight: "700",
              fontSize: 10,
            }}
          >
            Loading live sales performance...
          </Text>
        </View>
      ) : errorText ? (
        <View
          style={{
            minHeight: 120,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#FECACA",
            backgroundColor: "#FFF7F7",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color={RED}
          />

          <Text
            style={{
              color: "#991B1B",
              fontWeight: "800",
              fontSize: 10,
              marginTop: 7,
              textAlign: "center",
            }}
          >
            {errorText}
          </Text>
        </View>
      ) : (
        <></>
      )}
      {/* LIVE SALES INTELLIGENCE */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 9,
        }}
      >
        <IntelligenceCard
          title="Sales by Payment Method"
          icon="card-outline"
          iconColor={BLUE}
          soft={BLUE_SOFT}
        >
          {intelligenceLoading && !intelligence ? (
            <View
              style={{
                minHeight: 230,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator
                size="small"
                color={BLUE}
              />
            </View>
          ) : intelligence?.paymentBreakdown?.items?.length ? (
            <View
              style={{
                minHeight: 230,
                paddingTop: 2,
              }}
            >
              {(() => {
                const paymentItems =
                  intelligence.paymentBreakdown.items;

                const paymentTotal =
                  paymentItems.reduce(
                    (sum, item) =>
                      sum +
                      Number(item.revenue || 0),
                    0
                  );

                const colorForPayment = (
                  key: string
                ) =>
                  key === "CASH"
                    ? "#18B981"
                    : key === "MOBILE"
                      ? "#3B9BF2"
                      : key === "BANK"
                        ? "#F2A93B"
                        : key === "CREDIT"
                          ? "#8B5CF6"
                          : "#F47C62";

                const compactPaymentMoney = (
                  value: number
                ) => {
                  const amount =
                    Math.abs(
                      Number(value || 0)
                    );

                  if (amount >= 1000000000) {
                    return `TSh ${(
                      amount / 1000000000
                    ).toFixed(
                      amount >= 10000000000
                        ? 1
                        : 2
                    )}B`;
                  }

                  if (amount >= 1000000) {
                    return `TSh ${(
                      amount / 1000000
                    ).toFixed(
                      amount >= 10000000
                        ? 1
                        : 2
                    )}M`;
                  }

                  if (amount >= 1000) {
                    return `TSh ${(
                      amount / 1000
                    ).toFixed(
                      amount >= 100000
                        ? 0
                        : 1
                    )}K`;
                  }

                  return `TSh ${Math.round(
                    amount
                  ).toLocaleString()}`;
                };

                const radius = 58;
                const circumference =
                  2 * Math.PI * radius;

                /*
                 * Small visual gap between payment
                 * segments. The financial percentage
                 * itself is never changed.
                 */
                const gapLength = 3.4;

                let cumulativeLength = 0;

                return (
                  <>
                    {/* PREMIUM SEGMENTED DONUT */}
                    <View
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 166,
                          height: 166,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Svg
                          width={166}
                          height={166}
                          viewBox="0 0 166 166"
                        >
                          <G
                            rotation="-90"
                            origin="83, 83"
                          >
                            <Circle
                              cx="83"
                              cy="83"
                              r={radius}
                              fill="none"
                              stroke="#EEF2F7"
                              strokeWidth="27"
                            />

                            {paymentItems.map(
                              (item) => {
                                const percent =
                                  Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      Number(
                                        item.percent ||
                                          0
                                      )
                                    )
                                  );

                                const rawLength =
                                  (percent / 100) *
                                  circumference;

                                const visibleLength =
                                  Math.max(
                                    0,
                                    rawLength -
                                      gapLength
                                  );

                                const offset =
                                  -cumulativeLength;

                                cumulativeLength +=
                                  rawLength;

                                if (
                                  visibleLength <= 0
                                ) {
                                  return null;
                                }

                                return (
                                  <Circle
                                    key={item.key}
                                    cx="83"
                                    cy="83"
                                    r={radius}
                                    fill="none"
                                    stroke={colorForPayment(
                                      item.key
                                    )}
                                    strokeWidth="27"
                                    strokeLinecap="round"
                                    strokeDasharray={`${visibleLength} ${
                                      circumference -
                                      visibleLength
                                    }`}
                                    strokeDashoffset={
                                      offset
                                    }
                                  />
                                );
                              }
                            )}
                          </G>
                        </Svg>

                        {/* CLEAN CENTER */}
                        <View
                          pointerEvents="none"
                          style={{
                            position:
                              "absolute",
                            width: 88,
                            height: 88,
                            borderRadius: 999,
                            backgroundColor:
                              "#FFFFFF",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            paddingHorizontal: 5,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                            style={{
                              color: "#0F172A",
                              fontSize: 14,
                              fontWeight: "900",
                              textAlign:
                                "center",
                              letterSpacing:
                                -0.2,
                            }}
                          >
                            {compactPaymentMoney(
                              paymentTotal
                            )}
                          </Text>

                          <Text
                            style={{
                              marginTop: 3,
                              color: "#64748B",
                              fontSize: 8.5,
                              fontWeight: "800",
                              textAlign:
                                "center",
                            }}
                          >
                            Total Sales
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* PAYMENT BREAKDOWN BELOW DONUT */}
                    <View
                      style={{
                        marginTop: 5,
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor:
                          "#EEF2F7",
                        flexDirection: "row",
                        flexWrap: "wrap",
                        rowGap: 9,
                      }}
                    >
                      {paymentItems.map(
                        (item) => {
                          const paymentColor =
                            colorForPayment(
                              item.key
                            );

                          return (
                            <View
                              key={item.key}
                              style={{
                                width: "50%",
                                paddingRight: 8,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection:
                                    "row",
                                  alignItems:
                                    "center",
                                  gap: 6,
                                }}
                              >
                                <View
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius:
                                      999,
                                    backgroundColor:
                                      paymentColor,
                                    flexShrink: 0,
                                  }}
                                />

                                <Text
                                  numberOfLines={1}
                                  style={{
                                    flex: 1,
                                    color:
                                      "#475569",
                                    fontSize: 8.5,
                                    fontWeight:
                                      "800",
                                  }}
                                >
                                  {item.label}
                                </Text>

                                <View
                                  style={{
                                    paddingHorizontal:
                                      6,
                                    paddingVertical:
                                      2,
                                    borderRadius:
                                      999,
                                    backgroundColor:
                                      `${paymentColor}12`,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color:
                                        paymentColor,
                                      fontSize: 7.5,
                                      fontWeight:
                                        "900",
                                    }}
                                  >
                                    {Number(
                                      item.percent ||
                                        0
                                    ).toFixed(1)}
                                    %
                                  </Text>
                                </View>
                              </View>

                              <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.75}
                                style={{
                                  marginTop: 4,
                                  marginLeft: 14,
                                  color:
                                    "#0F172A",
                                  fontSize: 9.5,
                                  fontWeight:
                                    "900",
                                }}
                              >
                                {formatValue(
                                  item.revenue
                                )}
                              </Text>
                            </View>
                          );
                        }
                      )}
                    </View>
                  </>
                );
              })()}
            </View>
          ) : (
            <View
              style={{
                minHeight: 230,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#64748B",
                  fontWeight: "700",
                  fontSize: 10,
                  lineHeight: 16,
                  textAlign: "center",
                }}
              >
                No verified payment activity
                for this period.
              </Text>
            </View>
          )}
        </IntelligenceCard>

        <IntelligenceCard
          title="Top Selling Products"
          icon="trophy-outline"
          iconColor={AMBER}
          soft={AMBER_SOFT}
        >
          {intelligenceLoading && !intelligence ? (
            <View
              style={{
                minHeight: 230,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator
                size="small"
                color={AMBER}
              />
            </View>
          ) : intelligence?.topProducts?.length ? (
            <View
              style={{
                minHeight: 230,
                paddingTop: 2,
              }}
            >
              {(() => {
                const topProducts =
                  intelligence.topProducts.slice(
                    0,
                    5
                  );

                const highestRevenue =
                  Math.max(
                    ...topProducts.map(
                      (product) =>
                        Number(
                          product.revenue || 0
                        )
                    ),
                    1
                  );

                return (
                  <View
                    style={{
                      gap: 10,
                    }}
                  >
                    {topProducts.map(
                      (product, index) => {
                        const revenue =
                          Number(
                            product.revenue || 0
                          );

                        const performance =
                          Math.max(
                            4,
                            Math.min(
                              100,
                              (revenue /
                                highestRevenue) *
                                100
                            )
                          );

                        return (
                          <View
                            key={
                              product.productId ||
                              `${product.productName}-${index}`
                            }
                            style={{
                              flexDirection: "row",
                              alignItems:
                                "center",
                              gap: 9,
                              minHeight: 36,
                            }}
                          >
                            {/* RANK */}
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 8,
                                backgroundColor:
                                  index === 0
                                    ? "#FEF3C7"
                                    : "#F8FAFC",
                                borderWidth: 1,
                                borderColor:
                                  index === 0
                                    ? "#FDE68A"
                                    : "#EEF2F7",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                flexShrink: 0,
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    index === 0
                                      ? "#B45309"
                                      : "#64748B",
                                  fontWeight:
                                    "900",
                                  fontSize: 9,
                                }}
                              >
                                {index + 1}
                              </Text>
                            </View>

                            {/* PRODUCT + PERFORMANCE */}
                            <View
                              style={{
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection:
                                    "row",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "space-between",
                                  gap: 8,
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    color:
                                      "#0F172A",
                                    fontWeight:
                                      "850",
                                    fontSize: 9.5,
                                  }}
                                >
                                  {
                                    product.productName
                                  }
                                </Text>

                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color:
                                      "#0F172A",
                                    fontWeight:
                                      "900",
                                    fontSize: 9,
                                    textAlign:
                                      "right",
                                  }}
                                >
                                  {formatValue(
                                    revenue
                                  )}
                                </Text>
                              </View>

                              <View
                                style={{
                                  flexDirection:
                                    "row",
                                  alignItems:
                                    "center",
                                  gap: 8,
                                  marginTop: 4,
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    width: 42,
                                    color:
                                      "#94A3B8",
                                    fontWeight:
                                      "750",
                                    fontSize: 8,
                                  }}
                                >
                                  {product.qtySold} sold
                                </Text>

                                {/* PERFORMANCE RAIL */}
                                <View
                                  style={{
                                    flex: 1,
                                    height: 6,
                                    borderRadius:
                                      999,
                                    backgroundColor:
                                      "#EAF2FF",
                                    overflow:
                                      "hidden",
                                  }}
                                >
                                  <View
                                    style={{
                                      width: `${performance}%`,
                                      height: "100%",
                                      borderRadius:
                                        999,
                                      backgroundColor:
                                        index === 0
                                          ? "#1687F8"
                                          : "#3B9BF2",
                                    }}
                                  />
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      }
                    )}
                  </View>
                );
              })()}
            </View>
          ) : (
            <View
              style={{
                minHeight: 230,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#64748B",
                  fontWeight: "700",
                  fontSize: 10,
                  lineHeight: 16,
                  textAlign: "center",
                }}
              >
                No verified product sales
                for this period.
              </Text>
            </View>
          )}
        </IntelligenceCard>

        <Pressable
          disabled={!onOpenCRM}
          onPress={onOpenCRM}
          accessibilityRole="button"
          accessibilityLabel="Open Customer Relationship Management"
          style={({ pressed, hovered }: any) => ({
            flex: 1,
            minWidth: 220,
            opacity: pressed ? 0.96 : 1,
            transform: [
              {
                translateY:
                  hovered && onOpenCRM
                    ? -2
                    : 0,
              },
            ],
          })}
        >
          {({ hovered }: any) => (
            <View
              style={{
                flex: 1,
                borderRadius: 16,
                borderWidth: 1,
                borderColor:
                  hovered && onOpenCRM
                    ? "#A78BFA"
                    : "#E9E5FF",
                backgroundColor:
                  hovered && onOpenCRM
                    ? "#FCFBFF"
                    : "#FFFFFF",
                padding: 14,
                shadowColor: "#7C3AED",
                shadowOpacity:
                  hovered && onOpenCRM
                    ? 0.10
                    : 0.04,
                shadowRadius:
                  hovered && onOpenCRM
                    ? 16
                    : 8,
                shadowOffset: {
                  width: 0,
                  height: 5,
                },
                elevation:
                  hovered && onOpenCRM
                    ? 3
                    : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      backgroundColor: PURPLE_SOFT,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="people-outline"
                      size={15}
                      color={PURPLE}
                    />
                  </View>

                  <Text
                    numberOfLines={1}
                    style={{
                      color: "#0F172A",
                      fontWeight: "900",
                      fontSize: 12,
                    }}
                  >
                    Customer Intelligence (CRM)
                  </Text>
                </View>


              </View>
          {crmLoading && !crmIntelligence ? (
            <View
              style={{
                minHeight: 150,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator
                size="small"
                color={PURPLE}
              />
            </View>
          ) : crmIntelligence ? (
            <View style={{ gap: 10 }}>
              {/* TOP CUSTOMER */}
              <View>
                <Text
                  style={{
                    color: "#94A3B8",
                    fontWeight: "800",
                    fontSize: 8.5,
                    textTransform: "uppercase",
                  }}
                >
                  Top Customer
                </Text>

                {crmIntelligence.topCustomers
                  .byPeriodSpend?.[0] ? (
                  <>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: "#0F172A",
                        fontWeight: "900",
                        fontSize: 13,
                        marginTop: 3,
                      }}
                    >
                      {
                        crmIntelligence
                          .topCustomers
                          .byPeriodSpend[0]
                          .fullName
                      }
                    </Text>

                    <Text
                      style={{
                        color: "#64748B",
                        fontWeight: "700",
                        fontSize: 8.5,
                        marginTop: 3,
                      }}
                    >
                      {formatValue(
                        crmIntelligence
                          .topCustomers
                          .byPeriodSpend[0]
                          .periodSpend
                      )}{" "}
                      ·{" "}
                      {
                        crmIntelligence
                          .topCustomers
                          .byPeriodSpend[0]
                          .periodPurchaseCount
                      }{" "}
                      purchases
                    </Text>
                  </>
                ) : (
                  <Text
                    style={{
                      color: "#64748B",
                      fontWeight: "700",
                      fontSize: 9,
                      marginTop: 3,
                    }}
                  >
                    No verified customer
                    purchases in this period.
                  </Text>
                )}
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: "#EEF2F7",
                }}
              />

              {/* CUSTOMER HEALTH */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 10,
                    backgroundColor: "#F0FDF4",
                    paddingHorizontal: 9,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#16A34A",
                      fontWeight: "900",
                      fontSize: 15,
                    }}
                  >
                    {
                      crmIntelligence
                        .periodSummary
                        .returningCustomers
                    }
                  </Text>

                  <Text
                    style={{
                      color: "#64748B",
                      fontWeight: "800",
                      fontSize: 7.5,
                      marginTop: 2,
                    }}
                  >
                    Returning
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 10,
                    backgroundColor: "#FFF7ED",
                    paddingHorizontal: 9,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#D97706",
                      fontWeight: "900",
                      fontSize: 15,
                    }}
                  >
                    {
                      crmIntelligence
                        .inactivity
                        .inactiveCustomers
                    }
                  </Text>

                  <Text
                    style={{
                      color: "#64748B",
                      fontWeight: "800",
                      fontSize: 7.5,
                      marginTop: 2,
                    }}
                  >
                    Inactive 30d
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 10,
                    backgroundColor: "#EFF6FF",
                    paddingHorizontal: 9,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#2563EB",
                      fontWeight: "900",
                      fontSize: 15,
                    }}
                  >
                    {
                      crmIntelligence
                        .periodSummary
                        .newCustomers
                    }
                  </Text>

                  <Text
                    style={{
                      color: "#64748B",
                      fontWeight: "800",
                      fontSize: 7.5,
                      marginTop: 2,
                    }}
                  >
                    New
                  </Text>
                </View>
              </View>

              {crmError ? (
                <Text
                  style={{
                    color: RED,
                    fontWeight: "700",
                    fontSize: 8,
                    lineHeight: 12,
                  }}
                >
                  {crmError}
                </Text>
              ) : null}

              {onOpenCRM ? (
                <View
                  style={{
                    marginTop: 2,
                    paddingTop: 9,
                    borderTopWidth: 1,
                    borderTopColor: "#EEF2F7",
                    flexDirection: "row",
                    justifyContent: "flex-end",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: PURPLE,
                        fontWeight: "900",
                        fontSize: 8.5,
                        letterSpacing: 0.15,
                      }}
                    >
                      Open CRM
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={11}
                      color={PURPLE}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                minHeight: 150,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
              }}
            >
              <Text
                style={{
                  color: crmError
                    ? RED
                    : "#64748B",
                  fontWeight: "700",
                  fontSize: 9,
                  lineHeight: 14,
                  textAlign: "center",
                }}
              >
                {crmError ||
                  "No verified customer intelligence for this period."}
              </Text>
            </View>
          )}
                    </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
