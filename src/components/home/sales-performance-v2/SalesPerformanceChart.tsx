import React from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import type {
  SalesPerformancePoint,
} from "./salesPerformanceDataEngine";

type Props = {
  currentPoints: SalesPerformancePoint[];
  previousPoints?: SalesPerformancePoint[];
  compare?: boolean;
  width?: number;
  height?: number;
  formatMoney?: (value: number) => string;
};

type HoveredPoint = {
  index: number;
  current: SalesPerformancePoint;
  previous?: SalesPerformancePoint;
} | null;

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compactMoney(value: number): string {
  const amount = finite(value);
  const abs = Math.abs(amount);

  if (abs >= 1_000_000_000) {
    return `TSh ${(amount / 1_000_000_000).toFixed(1)}B`;
  }

  if (abs >= 1_000_000) {
    return `TSh ${(amount / 1_000_000).toFixed(1)}M`;
  }

  if (abs >= 1_000) {
    return `TSh ${(amount / 1_000).toFixed(0)}K`;
  }

  return `TSh ${Math.round(amount)}`;
}

function exactMoney(value: number): string {
  return `TSh ${Math.round(
    finite(value)
  ).toLocaleString()}`;
}

function niceMax(value: number): number {
  const safe = Math.max(
    1,
    finite(value)
  );

  const exponent = Math.floor(
    Math.log10(safe)
  );

  const magnitude = Math.pow(
    10,
    exponent
  );

  const normalized =
    safe / magnitude;

  let nice = 1;

  if (normalized <= 1) {
    nice = 1;
  } else if (normalized <= 2) {
    nice = 2;
  } else if (normalized <= 5) {
    nice = 5;
  } else {
    nice = 10;
  }

  return nice * magnitude;
}

function buildSmoothPath(
  points: Array<{
    x: number;
    y: number;
  }>
): string {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path =
    `M ${points[0].x} ${points[0].y}`;

  for (
    let i = 0;
    i < points.length - 1;
    i++
  ) {
    const current = points[i];
    const next = points[i + 1];

    const middleX =
      (current.x + next.x) / 2;

    path +=
      ` C ${middleX} ${current.y},` +
      ` ${middleX} ${next.y},` +
      ` ${next.x} ${next.y}`;
  }

  return path;
}

export default function SalesPerformanceChart({
  currentPoints,
  previousPoints = [],
  compare = true,
  width = 900,
  height = 300,
  formatMoney,
}: Props) {
  const [hovered, setHovered] =
    React.useState<HoveredPoint>(null);

  const safeWidth = Math.max(
    520,
    finite(width)
  );

  const safeHeight = Math.max(
    240,
    finite(height)
  );

  const left = 64;
  const right = 24;
  const top = 22;
  const bottom = 44;

  const plotWidth =
    safeWidth - left - right;

  const plotHeight =
    safeHeight - top - bottom;

  const values = [
    ...currentPoints.map(
      (point) => finite(point.sales)
    ),
    ...(compare
      ? previousPoints.map(
          (point) => finite(point.sales)
        )
      : []),
  ];

  const maximum = niceMax(
    Math.max(
      1,
      ...values
    )
  );

  const count = Math.max(
    currentPoints.length,
    1
  );

  const slotWidth =
    plotWidth / count;

  const barWidth = Math.min(
    34,
    Math.max(
      10,
      slotWidth * 0.42
    )
  );

  const yForValue = (
    value: number
  ) =>
    top +
    plotHeight -
    (
      finite(value) /
      maximum
    ) *
      plotHeight;

  const xForIndex = (
    index: number
  ) =>
    left +
    slotWidth * index +
    slotWidth / 2;

  const currentLinePoints =
    currentPoints.map(
      (point, index) => ({
        x: xForIndex(index),
        y: yForValue(point.sales),
      })
    );

  const previousLinePoints =
    previousPoints
      .slice(
        0,
        currentPoints.length
      )
      .map(
        (point, index) => ({
          x: xForIndex(index),
          y: yForValue(point.sales),
        })
      );

  const currentPath =
    buildSmoothPath(
      currentLinePoints
    );

  const previousPath =
    buildSmoothPath(
      previousLinePoints
    );

  const areaPath =
    currentLinePoints.length > 0
      ? `${currentPath} L ${
          currentLinePoints[
            currentLinePoints.length - 1
          ].x
        } ${top + plotHeight} L ${
          currentLinePoints[0].x
        } ${top + plotHeight} Z`
      : "";

  const yTicks = [0, 1, 2, 3, 4];

  const displayMoney =
    formatMoney ??
    exactMoney;

  return (
    <View
      style={{
        width: "100%",
        position: "relative",
      }}
    >
      <Svg
        width={safeWidth}
        height={safeHeight}
      >
        <Defs>
          <LinearGradient
            id="salesAreaGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0%"
              stopColor="#2563EB"
              stopOpacity={0.22}
            />

            <Stop
              offset="100%"
              stopColor="#2563EB"
              stopOpacity={0.015}
            />
          </LinearGradient>

          <LinearGradient
            id="salesBarGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0%"
              stopColor="#3B82F6"
              stopOpacity={0.82}
            />

            <Stop
              offset="100%"
              stopColor="#93C5FD"
              stopOpacity={0.45}
            />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick) => {
          const ratio =
            tick / 4;

          const value =
            maximum * ratio;

          const y =
            top +
            plotHeight -
            plotHeight * ratio;

          return (
            <G key={`grid-${tick}`}>
              <Line
                x1={left}
                y1={y}
                x2={safeWidth - right}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth={1}
              />

              <SvgText
                x={left - 10}
                y={y + 4}
                fontSize={10}
                fill="#64748B"
                textAnchor="end"
                fontWeight="600"
              >
                {compactMoney(value)
                  .replace(
                    "TSh ",
                    ""
                  )}
              </SvgText>
            </G>
          );
        })}

        {currentPoints.map(
          (point, index) => {
            const x =
              xForIndex(index);

            const y =
              yForValue(
                point.sales
              );

            const barHeight =
              top +
              plotHeight -
              y;

            return (
              <G
                key={`bar-${point.key}`}
              >
                <Rect
                  x={
                    x -
                    barWidth / 2
                  }
                  y={y}
                  width={barWidth}
                  height={Math.max(
                    0,
                    barHeight
                  )}
                  rx={4}
                  fill="url(#salesBarGradient)"
                />

                <SvgText
                  x={x}
                  y={
                    safeHeight -
                    14
                  }
                  fontSize={10}
                  fill="#64748B"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {point.shortLabel}
                </SvgText>
              </G>
            );
          }
        )}

        {areaPath ? (
          <Path
            d={areaPath}
            fill="url(#salesAreaGradient)"
          />
        ) : null}

        {currentPath ? (
          <Path
            d={currentPath}
            fill="none"
            stroke="#2563EB"
            strokeWidth={2.5}
          />
        ) : null}

        {compare &&
        previousPath ? (
          <Path
            d={previousPath}
            fill="none"
            stroke="#14B8A6"
            strokeWidth={2}
            strokeDasharray="6 5"
            opacity={0.9}
          />
        ) : null}

        {currentLinePoints.map(
          (point, index) => (
            <Circle
              key={`current-dot-${index}`}
              cx={point.x}
              cy={point.y}
              r={
                hovered?.index ===
                index
                  ? 5
                  : 3.5
              }
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth={2}
            />
          )
        )}

        {compare
          ? previousLinePoints.map(
              (point, index) => (
                <Circle
                  key={`previous-dot-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill="#14B8A6"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              )
            )
          : null}
      </Svg>

      <View
        style={{
          position: "absolute",
          left,
          right,
          top,
          height: plotHeight,
          flexDirection: "row",
        }}
      >
        {currentPoints.map(
          (point, index) => (
            <Pressable
              key={`hit-${point.key}`}
              onHoverIn={() =>
                setHovered({
                  index,
                  current: point,
                  previous:
                    previousPoints[
                      index
                    ],
                })
              }
              onHoverOut={() =>
                setHovered(null)
              }
              onPress={() =>
                setHovered({
                  index,
                  current: point,
                  previous:
                    previousPoints[
                      index
                    ],
                })
              }
              style={{
                flex: 1,
                height: "100%",
              }}
            />
          )
        )}
      </View>

      {hovered ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            left: Math.min(
              Math.max(
                80,
                xForIndex(
                  hovered.index
                ) - 86
              ),
              safeWidth - 200
            ),
            width: 172,
            borderRadius: 10,
            backgroundColor:
              "#0F172A",
            paddingHorizontal: 12,
            paddingVertical: 10,
            shadowColor: "#000000",
            shadowOpacity: 0.16,
            shadowRadius: 12,
            shadowOffset: {
              width: 0,
              height: 6,
            },
            elevation: 5,
          }}
        >
          <Text
            style={{
              color: "#CBD5E1",
              fontSize: 10,
              fontWeight: "700",
              marginBottom: 7,
            }}
          >
            {hovered.current.label}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: 8,
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
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor:
                    "#3B82F6",
                }}
              />

              <Text
                style={{
                  color:
                    "#E2E8F0",
                  fontSize: 10,
                }}
              >
                Current
              </Text>
            </View>

            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: "800",
              }}
            >
              {displayMoney(
                hovered.current
                  .sales
              )}
            </Text>
          </View>

          {compare &&
          hovered.previous ? (
            <View
              style={{
                flexDirection:
                  "row",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: 8,
                marginTop: 6,
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
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor:
                      "#14B8A6",
                  }}
                />

                <Text
                  style={{
                    color:
                      "#E2E8F0",
                    fontSize: 10,
                  }}
                >
                  Previous
                </Text>
              </View>

              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                {displayMoney(
                  hovered.previous
                    .sales
                )}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          marginTop: 2,
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
              width: 18,
              height: 3,
              borderRadius: 2,
              backgroundColor:
                "#2563EB",
            }}
          />

          <Text
            style={{
              color: "#64748B",
              fontSize: 10,
              fontWeight: "700",
            }}
          >
            Current Period
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
                width: 18,
                height: 2,
                borderTopWidth: 2,
                borderStyle: "dashed",
                borderColor:
                  "#14B8A6",
              }}
            />

            <Text
              style={{
                color: "#64748B",
                fontSize: 10,
                fontWeight: "700",
              }}
            >
              Previous Period
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
