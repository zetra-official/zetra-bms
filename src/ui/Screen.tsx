// src/ui/Screen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  AppState,
  StatusBar,
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

import { NotificationBell } from "@/src/ui/NotificationBell";
import { theme } from "./theme";

let NetInfo: any = null;
try {
  NetInfo = require("@react-native-community/netinfo");
} catch {
  NetInfo = null;
}

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
  const baseBg = theme.colors.background;
  const isWeb = Platform.OS === "web";

  const statusBarStyle =
    String(baseBg).toUpperCase() === "#0F172A" ||
    String(baseBg).toUpperCase() === "#020617"
      ? "light-content"
      : "dark-content";

  const TAB_BAR_BASE_HEIGHT = 56;
  const TAB_BAR_EXTRA_GAP = 12;

  const [isOffline, setIsOffline] = useState(false);
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    if (isWeb) return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setResumeTick((x) => x + 1);
    });

    return () => {
      try {
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
    if (isWeb) return typeof bottomPad === "number" ? bottomPad : 24;

    const tabBase = TAB_BAR_BASE_HEIGHT + TAB_BAR_EXTRA_GAP;
    return typeof bottomPad === "number" ? tabBase + bottomPad : tabBase;
  }, [bottomPad, isWeb]);

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
          borderColor: theme.colors.warningBorder,
          backgroundColor: theme.colors.warningSoft,
          borderRadius: theme.radius.pill,
          paddingVertical: 8,
          paddingHorizontal: 12,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: theme.colors.text,
            fontWeight: "800",
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
    >{Platform.OS !== "web" ? (
        <StatusBar
          barStyle={statusBarStyle as any}
          backgroundColor={baseBg}
          translucent={false}
        />
      ) : null}

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
              paddingHorizontal: isWeb ? 22 : 16,
              paddingBottom,
              minHeight: isWeb ? "100%" : undefined,
              backgroundColor: baseBg,
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
              paddingHorizontal: isWeb ? 22 : 16,
            },
            contentStyle,
          ]}
        >
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
              paddingHorizontal: isWeb ? 22 : 16,
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: baseBg }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {Root}
    </KeyboardAvoidingView>
  );
}