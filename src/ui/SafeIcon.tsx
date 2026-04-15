import React from "react";
import Svg, { Path, Circle, Rect, Polyline, Line } from "react-native-svg";

export type SafeIconName = string;

type Props = {
  name: SafeIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function normalizeName(name: string): string {
  const n = String(name ?? "").trim();

  const map: Record<string, string> = {
    // common direct mappings
    "search-outline": "search",
    "close-outline": "close",
    "close-circle": "close",
    "close-circle-outline": "close",

    "chevron-down-outline": "chevron-down",
    "chevron-up-outline": "chevron-up",
    "chevron-back": "chevron-left",
    "chevron-left-outline": "chevron-left",
    "arrow-back": "chevron-left",
    "arrow-back-outline": "chevron-left",

    "refresh-outline": "refresh",
    "sync-outline": "refresh",
    "reload-outline": "refresh",

    "card-outline": "card",
    "card": "card",
    "archive-outline": "archive",

    "checkmark-circle": "check-circle",
    "checkmark-circle-outline": "check-circle",

    "add-outline": "add",
    "add-circle-outline": "add",
    "plus": "add",
    "plus-outline": "add",

    "storefront": "storefront-outline",
    "ellipsis-horizontal-outline": "ellipsis-horizontal",
    "ellipsis-horizontal-circle-outline": "ellipsis-horizontal",

    "heart-circle-outline": "heart-outline",
    "chatbubble": "chatbubble-outline",
    "chatbubble-ellipses-outline": "chatbubble-outline",

    "send-outline": "paper-plane-outline",
    "paper-plane": "paper-plane-outline",

    "bookmark-outline": "bookmark-outline",
    "bookmark": "bookmark",

    "speedometer": "speedometer-outline",
    "hourglass": "hourglass-outline",
    "person-circle": "person-circle-outline",

    // app-wide safe fallbacks
    "analytics-outline": "analytics-outline",
    "sparkles-outline": "sparkles-outline",
    "trending-up-outline": "trending-up-outline",
    "cash-outline": "cash-outline",
    "wallet-outline": "cash-outline",
    "cube-outline": "cube-outline",
    "layers-outline": "layers-outline",
    "pulse-outline": "pulse-outline",
    "menu-outline": "menu-outline",
    "filter-outline": "filter-outline",
    "time-outline": "time-outline",
    "shield-checkmark-outline": "check-circle",
    "repeat-outline": "repeat-outline",
    "link-outline": "link-outline",
    "at-outline": "at-outline",
    "map-outline": "map-outline",
    "body-outline": "body-outline",
    "code-outline": "code-outline",
    "ellipse-outline": "ellipse-outline",
    "remove-outline": "remove-outline",
  };

  return map[n] ?? n;
}

export default function SafeIcon({
  name,
  size = 18,
  color = "#FFFFFF",
  strokeWidth = 2,
}: Props) {
  const n = normalizeName(name);

  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };

  if (n === "search") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="11" cy="11" r="7" {...common} />
        <Line x1="16.65" y1="16.65" x2="21" y2="21" {...common} />
      </Svg>
    );
  }

  if (n === "close") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="18" y1="6" x2="6" y2="18" {...common} />
        <Line x1="6" y1="6" x2="18" y2="18" {...common} />
      </Svg>
    );
  }

  if (n === "chevron-down") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="6 9 12 15 18 9" {...common} />
      </Svg>
    );
  }

  if (n === "chevron-up") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="6 15 12 9 18 15" {...common} />
      </Svg>
    );
  }

  if (n === "chevron-left") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="15 18 9 12 15 6" {...common} />
      </Svg>
    );
  }

  if (n === "refresh") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="23 4 23 10 17 10" {...common} />
        <Polyline points="1 20 1 14 7 14" {...common} />
        <Path
          d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"
          {...common}
        />
      </Svg>
    );
  }

  if (n === "card") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x="3" y="5" width="18" height="14" rx="2.5" {...common} />
        <Line x1="3" y1="10" x2="21" y2="10" {...common} />
      </Svg>
    );
  }

  if (n === "archive") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x="3" y="4" width="18" height="4" rx="1.5" {...common} />
        <Path d="M5 8h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" {...common} />
        <Line x1="10" y1="12" x2="14" y2="12" {...common} />
      </Svg>
    );
  }

  if (n === "check-circle") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9" {...common} />
        <Path d="M9 12l2 2 4-4" {...common} />
      </Svg>
    );
  }

  if (n === "add") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="12" y1="5" x2="12" y2="19" {...common} />
        <Line x1="5" y1="12" x2="19" y2="12" {...common} />
      </Svg>
    );
  }

  if (n === "storefront-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M4 10h16" {...common} />
        <Path d="M5 10l1-5h12l1 5" {...common} />
        <Path d="M6 10v8h12v-8" {...common} />
        <Path d="M10 18v-4h4v4" {...common} />
      </Svg>
    );
  }

  if (n === "ellipsis-horizontal") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="6" cy="12" r="1.6" fill={color} />
        <Circle cx="12" cy="12" r="1.6" fill={color} />
        <Circle cx="18" cy="12" r="1.6" fill={color} />
      </Svg>
    );
  }

  if (n === "heart-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"
          {...common}
        />
      </Svg>
    );
  }

  if (n === "heart") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"
          fill={color}
        />
      </Svg>
    );
  }

  if (n === "chatbubble-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.52-.27-3.62-.75L4 20l.75-4.88A8.47 8.47 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"
          {...common}
        />
      </Svg>
    );
  }

  if (n === "paper-plane-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M22 2L11 13" {...common} />
        <Path d="M22 2L15 22l-4-9-9-4 20-7z" {...common} />
      </Svg>
    );
  }

  if (n === "bookmark-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1z" {...common} />
      </Svg>
    );
  }

  if (n === "bookmark") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1z" fill={color} />
      </Svg>
    );
  }

  if (n === "speedometer-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M5 16a7 7 0 1 1 14 0" {...common} />
        <Line x1="12" y1="12" x2="16.5" y2="9.5" {...common} />
        <Circle cx="12" cy="16" r="1.2" fill={color} />
      </Svg>
    );
  }

  if (n === "hourglass-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M7 4h10" {...common} />
        <Path d="M7 20h10" {...common} />
        <Path d="M8 4c0 4 4 4 4 8s-4 4-4 8" {...common} />
        <Path d="M16 4c0 4-4 4-4 8s4 4 4 8" {...common} />
      </Svg>
    );
  }

  if (n === "person-circle-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9" {...common} />
        <Circle cx="12" cy="9" r="2.5" {...common} />
        <Path d="M7.5 18c1.2-2.1 3-3.2 4.5-3.2s3.3 1.1 4.5 3.2" {...common} />
      </Svg>
    );
  }

  if (n === "analytics-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Line x1="6" y1="20" x2="6" y2="10" {...common} />
        <Line x1="12" y1="20" x2="12" y2="4" {...common} />
        <Line x1="18" y1="20" x2="18" y2="14" {...common} />
      </Svg>
    );
  }

  if (n === "sparkles-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" {...common} />
        <Path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" {...common} />
        <Path d="M5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z" {...common} />
      </Svg>
    );
  }

  if (n === "trending-up-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="3 17 9 11 13 15 21 7" {...common} />
        <Polyline points="14 7 21 7 21 14" {...common} />
      </Svg>
    );
  }

  if (n === "cash-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x="3" y="6" width="18" height="12" rx="2" {...common} />
        <Circle cx="12" cy="12" r="2.5" {...common} />
        <Line x1="7" y1="12" x2="7.01" y2="12" {...common} />
        <Line x1="17" y1="12" x2="17.01" y2="12" {...common} />
      </Svg>
    );
  }

  if (n === "cube-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" {...common} />
        <Path d="M12 12l8-4.5" {...common} />
        <Path d="M12 12L4 7.5" {...common} />
        <Path d="M12 12v9" {...common} />
      </Svg>
    );
  }

  if (n === "layers-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="12 3 3 8 12 13 21 8 12 3" {...common} />
        <Polyline points="3 12 12 17 21 12" {...common} />
        <Polyline points="3 16 12 21 21 16" {...common} />
      </Svg>
    );
  }

  if (n === "pulse-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Polyline points="3 12 7 12 10 7 14 17 17 12 21 12" {...common} />
      </Svg>
    );
  }

  if (n === "time-outline") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9" {...common} />
        <Line x1="12" y1="7" x2="12" y2="12" {...common} />
        <Line x1="12" y1="12" x2="15.5" y2="14" {...common} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...common} />
    </Svg>
  );
}