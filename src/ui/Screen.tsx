import React, { useEffect, useMemo, useState } from "react";
import {
  AppState,
  FlatList,
  Keyboard,
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

  // ✅ Tab bar constants (match app/(tabs)/_layout.tsx)
  const TAB_BAR_BASE_HEIGHT = 56;
  const TAB_BAR_EXTRA_GAP = 12;

  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // ✅ Global offline indicator
  const [isOffline, setIsOffline] = useState(false);

  // ✅ Remount overlays on resume (fix "touch dead until reload")
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardOpen(true);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, []);

  const effectiveBottomPad = useMemo(() => {
    if (typeof bottomPad === "number") return bottomPad;

    if (Platform.OS === "web") {
      return 24;
    }

    if (keyboardOpen) {
      if (Platform.OS === "android") return 16;
      return 24;
    }

    return TAB_BAR_BASE_HEIGHT + TAB_BAR_EXTRA_GAP;
  }, [bottomPad, keyboardOpen]);

  // ✅ Stronger safe-area spacing for top headers
  const topInset = Math.max(insets.top, 10);
  const topContentPad = topInset + 8;
  const offlineExtra = isOffline ? 44 : 0;
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
    <View style={[{ flex: 1, backgroundColor: baseBg }, style]}>
      <View
        pointerEvents="none"
        style={{
          ...AbsoluteFillObject,
          backgroundColor: "transparent",
        }}
      />

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
          style={{ flex: 1, backgroundColor: baseBg }}
          contentContainerStyle={[
            {
              paddingTop: scrollableTopSpacer,
              paddingHorizontal: Platform.OS === "web" ? 20 : 16,
              paddingBottom,
              backgroundColor: baseBg,
            },
            contentStyle,
          ]}
          refreshControl={refreshControl as any}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : childIsScrollableRoot ? (
        <View style={[{ flex: 1, backgroundColor: baseBg }, contentStyle]}>
          {/* ✅ Critical fix:
              Every root FlatList/ScrollView/SectionList screen now starts BELOW safe area.
              This fixes History / Closing History jumping into the top status area. */}
          <View style={{ height: scrollableTopSpacer }} />
          {children}
        </View>
      ) : (
        <View
          style={[
            {
              flex: 1,
              paddingTop: scrollableTopSpacer,
              paddingHorizontal: Platform.OS === "web" ? 20 : 16,
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

  if (Platform.OS !== "ios") return Root;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      {Root}
    </KeyboardAvoidingView>
  );
}