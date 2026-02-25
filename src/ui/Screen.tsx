import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ✅ Global offline indicator (does NOT affect routing / DB)
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e: any) => {
      setKeyboardOpen(true);
      const h = Number(e?.endCoordinates?.height ?? 0);
      setKeyboardHeight(h > 0 ? h : 0);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!NetInfo?.addEventListener) return;

    const unsub = NetInfo.addEventListener((state: any) => {
      const connected = !!state?.isConnected;

      const reachable =
        state?.isInternetReachable === null || state?.isInternetReachable === undefined
          ? true
          : !!state?.isInternetReachable;

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

    // ✅ KEYBOARD FIX:
    // When keyboard is open, add enough bottom padding so user can SCROLL
    if (keyboardOpen) {
      if (Platform.OS === "android") return Math.max(16, keyboardHeight) + 16;
      return 24;
    }

    // normal state: pad for tab bar
    return TAB_BAR_BASE_HEIGHT + TAB_BAR_EXTRA_GAP;
  }, [bottomPad, keyboardOpen, keyboardHeight]);

  const paddingTop = Math.max(insets.top, 10);
  const paddingBottom = Math.max(insets.bottom, 10) + effectiveBottomPad;

  const childCount = React.Children.count(children);
  const onlyChild =
    childCount === 1 && React.isValidElement(children) ? (children as any) : null;

  const childType = onlyChild?.type;
  const childIsScrollableRoot =
    !scroll &&
    onlyChild &&
    (childType === ScrollView || childType === FlatList || childType === SectionList);

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

  // Bell position: below offline banner area if offline, otherwise normal.
  const bellTop = useMemo(() => {
    return paddingTop + (isOffline ? 44 : 0);
  }, [paddingTop, isOffline]);

  const Root = (
    <View style={[{ flex: 1, backgroundColor: baseBg }, style]}>
      <View
        pointerEvents="none"
        style={{
          ...AbsoluteFill.absoluteFillObject,
          backgroundColor: "transparent",
        }}
      />

      {OfflineBanner}

      {/* ✅ Global Notification Bell */}
      <NotificationBell top={bellTop} />

      {scroll ? (
        <ScrollView
          style={{ flex: 1, backgroundColor: baseBg }}
          contentContainerStyle={[
            {
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
        <View style={[{ flex: 1, backgroundColor: baseBg }, contentStyle]}>
          {isOffline ? <View style={{ height: paddingTop + 44 }} /> : null}
          {children}
        </View>
      ) : (
        <View
          style={[
            {
              flex: 1,
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

  // ✅ No KeyboardAvoidingView here.
  // Android is handled by our keyboard-height padding.
  // iOS screens can handle their own KAV where needed.
  return Root;
}