import React, { useEffect, useMemo, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SectionList,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "./theme";
import { NotificationBell } from "@/src/ui/NotificationBell";

// ✅ Optional NetInfo (safe: does NOT crash if package missing)
let NetInfo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require("@react-native-community/netinfo");
} catch {
  NetInfo = null;
}

const AbsoluteFillObject = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

type Props = {
  children: React.ReactNode;
  bottomPad?: number;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement | null;
};

export function Screen({
  children,
  bottomPad,
  scroll = false,
  style,
  contentStyle,
  refreshControl,
}: Props) {
  const insets = useSafeAreaInsets();
  const baseBg = theme.colors?.background ?? "#0B0F14";
  const isWeb = Platform.OS === "web";

  // ✅ Tab bar constants (match app/(tabs)/_layout.tsx)
  const TAB_BAR_BASE_HEIGHT = 56;
  const TAB_BAR_EXTRA_GAP = 12;

  // ✅ Global offline indicator
  const [isOffline, setIsOffline] = useState(false);

  // ✅ Remount overlays on resume (fix "touch dead until reload")
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    if (isWeb) return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setResumeTick((x) => x + 1);
      }
    });

    return () => {
      try {
        // @ts-ignore
        sub?.remove?.();
      } catch {}
    };
  }, [isWeb]);

  useEffect(() => {
    if (isWeb) return;
    if (!NetInfo?.addEventListener) return;

    const unsub = NetInfo.addEventListener((state: any) => {
      const connected = !!state?.isConnected;

      const reachable =
        state?.isInternetReachable === null ||
        state?.isInternetReachable === undefined
          ? true
          : !!state?.isInternetReachable;

      setIsOffline(!connected || !reachable);
    });

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [isWeb]);

  const effectiveBottomPad = useMemo(() => {
    if (isWeb) {
      return typeof bottomPad === "number" ? bottomPad : 24;
    }

    const tabBase = TAB_BAR_BASE_HEIGHT + TAB_BAR_EXTRA_GAP;

    // ✅ IMPORTANT:
    // bottomPad isi-replace tab bar space.
    // Iongezwe juu ya tab bar clearance ili content isikatwe chini.
    if (typeof bottomPad === "number") {
      return tabBase + bottomPad;
    }

    return tabBase;
  }, [bottomPad, isWeb]);

  // ✅ Stronger safe-area spacing for top headers
  const topInset = Math.max(insets.top, 10);
  const topContentPad = topInset + 8;
  const offlineExtra = !isWeb && isOffline ? 44 : 0;
  const scrollableTopSpacer = topContentPad + offlineExtra;

  const paddingBottom = Math.max(insets.bottom, 10) + effectiveBottomPad;

  const childCount = React.Children.count(children);
  const onlyChild =
    childCount === 1 && React.isValidElement(children) ? (children as any) : null;

  const childType = onlyChild?.type;
  const childIsScrollableRoot =
    !scroll &&
    onlyChild &&
    (childType === ScrollView ||
      childType === FlatList ||
      childType === SectionList);

  const OfflineBanner = useMemo(() => {
    if (!isOffline) return null;

    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: topContentPad,
          zIndex: 40,
          borderWidth: 1,
          borderColor: "rgba(245,158,11,0.45)",
          backgroundColor: "rgba(245,158,11,0.12)",
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 12,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "900",
            fontSize: 12,
          }}
        >
          OFFLINE • Mtandao haupatikani (data ya mwisho inaweza kuonekana)
        </Text>
      </View>
    );
  }, [isOffline, topContentPad]);

  const bellTop = useMemo(() => {
    return topContentPad + (isOffline ? 44 : 0);
  }, [topContentPad, isOffline]);

  const Root = (
    <View
      style={[
        {
          flex: 1,
          minHeight: 0,
          backgroundColor: baseBg,
          ...(isWeb
            ? {
                width: "100%",
                overflow: "hidden" as const,
              }
            : null),
        },
        style,
      ]}
    >
      {null}

      {OfflineBanner}

      {Platform.OS !== "web" ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 60,
            ...(Platform.OS === "android" ? { elevation: 60 } : null),
            width: 96,
            height: 96,
            alignItems: "flex-end",
            justifyContent: "flex-start",
          }}
        >
          <NotificationBell key={`bell-${resumeTick}`} top={bellTop} right={16} />
        </View>
      ) : null}

      {scroll ? (
        <ScrollView
          style={[
            {
              flex: 1,
              minHeight: 0,
              backgroundColor: baseBg,
            },
            isWeb
              ? ({
                  width: "100%",
                  overflow: "auto",
                  WebkitOverflowScrolling: "touch",
                } as any)
              : null,
          ]}
          contentContainerStyle={[
            {
              paddingTop: scrollableTopSpacer,
              paddingHorizontal: isWeb ? 20 : 16,
              paddingBottom,
              backgroundColor: baseBg,
              minHeight: isWeb ? "100%" : undefined,
            },
            contentStyle,
          ]}
          refreshControl={refreshControl as any}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : childIsScrollableRoot ? (
        <View
          style={[
            {
              flex: 1,
              minHeight: 0,
              backgroundColor: baseBg,
              paddingHorizontal: isWeb ? 20 : 16,
              paddingBottom,
            },
            contentStyle,
          ]}
        >
          {/* ✅ Root scrollable screens start below safe area and keep bottom-safe spacing. */}
          <View style={{ height: scrollableTopSpacer }} />
          {children}
        </View>
      ) : (
        <View
          style={[
            {
              flex: 1,
              minHeight: 0,
              paddingTop: scrollableTopSpacer,
              paddingHorizontal: isWeb ? 20 : 16,
              paddingBottom,
              backgroundColor: baseBg,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );

  if (isWeb || Platform.OS !== "ios") return Root;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      {Root}
    </KeyboardAvoidingView>
  );
}