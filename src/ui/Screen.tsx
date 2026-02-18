import React, { useEffect, useMemo, useState } from "react";
import {
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

// ✅ Optional NetInfo (safe: does NOT crash if package missing)
let NetInfo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require("@react-native-community/netinfo");
} catch {
  NetInfo = null;
}

const AbsoluteFill = {
  absoluteFillObject: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

type Props = {
  children: React.ReactNode;
  bottomPad?: number;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  bottomPad,
  scroll = false,
  style,
  contentStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const baseBg = theme.colors?.background ?? "#0B0F14";

  // ✅ Tab bar constants (match app/(tabs)/_layout.tsx)
  const TAB_BAR_BASE_HEIGHT = 56;
  const TAB_BAR_EXTRA_GAP = 12;

  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // ✅ Global offline indicator (does NOT affect routing / DB)
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    // If NetInfo not available, keep banner off (do nothing)
    if (!NetInfo?.addEventListener) return;

    const unsub = NetInfo.addEventListener((state: any) => {
      // state.isConnected: device connected to a network
      // state.isInternetReachable: internet reachable (can be null on some devices)
      const connected = !!state?.isConnected;

      const reachable =
        state?.isInternetReachable === null || state?.isInternetReachable === undefined
          ? true
          : !!state?.isInternetReachable;

      // Offline if not connected OR internet not reachable
      const offlineNow = !connected || !reachable;
      setIsOffline(offlineNow);
    });

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  const effectiveBottomPad = useMemo(() => {
    if (typeof bottomPad === "number") return bottomPad;
    if (keyboardOpen) return 12;
    return TAB_BAR_BASE_HEIGHT + TAB_BAR_EXTRA_GAP;
  }, [bottomPad, keyboardOpen]);

  const paddingTop = Math.max(insets.top, 10);
  const paddingBottom = Math.max(insets.bottom, 10) + effectiveBottomPad;

  // ✅ IMPORTANT:
  // If a screen passes its OWN ScrollView/FlatList/SectionList inside <Screen>,
  // do NOT apply paddings here (otherwise you get double bottom space / “overlay” look).
  const childCount = React.Children.count(children);
  const onlyChild =
    childCount === 1 && React.isValidElement(children) ? (children as any) : null;

  const childType = onlyChild?.type;
  const childIsScrollableRoot =
    !scroll &&
    onlyChild &&
    (childType === ScrollView || childType === FlatList || childType === SectionList);

  // ✅ Offline banner overlay (non-blocking touches)
  const OfflineBanner = useMemo(() => {
    if (!isOffline) return null;

    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: paddingTop,
          zIndex: 50,
          borderWidth: 1,
          borderColor: "rgba(245,158,11,0.45)",
          backgroundColor: "rgba(245,158,11,0.12)",
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 12 }}>
          OFFLINE • Mtandao haupatikani (data ya mwisho inaweza kuonekana)
        </Text>
      </View>
    );
  }, [isOffline, paddingTop]);

  const Root = (
    <View style={[{ flex: 1, backgroundColor: baseBg }, style]}>
      {/* Background overlay MUST NOT block touches */}
      <View
        pointerEvents="none"
        style={{
          ...AbsoluteFill.absoluteFillObject,
          backgroundColor: "transparent",
        }}
      />

      {/* ✅ Global offline banner */}
      {OfflineBanner}

      {scroll ? (
        <ScrollView
          style={{ flex: 1, backgroundColor: baseBg }}
          contentContainerStyle={[
            {
              // ✅ push content down a bit when banner is shown, so it doesn't overlap header
              paddingTop: paddingTop + (isOffline ? 44 : 0),
              paddingHorizontal: 16,
              paddingBottom,
              backgroundColor: baseBg,
            },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : childIsScrollableRoot ? (
        // ✅ Child already scrolls; don’t add extra padding wrappers.
        // ✅ Still protect header overlap by adding top spacer if offline banner is shown.
        <View style={[{ flex: 1, backgroundColor: baseBg }, contentStyle]}>
          {isOffline ? <View style={{ height: paddingTop + 44 }} /> : null}
          {children}
        </View>
      ) : (
        <View
          style={[
            {
              flex: 1,
              // ✅ push content down a bit when banner is shown
              paddingTop: paddingTop + (isOffline ? 44 : 0),
              paddingHorizontal: 16,
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

  // Android: no KeyboardAvoidingView
  if (Platform.OS === "android") return Root;

  // iOS: keep KeyboardAvoidingView
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      {Root}
    </KeyboardAvoidingView>
  );
}