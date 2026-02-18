// src/ui/Screen.tsx
import React from "react";
import {
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";

type Props = {
  children: React.ReactNode;
  scroll?: boolean; // default true
  edges?: Edge[]; // default ["top"]
  style?: StyleProp<ViewStyle>;
  contentStyle?: ScrollViewProps["contentContainerStyle"];
  bottomPad?: number; // default 140
};

export function Screen({
  children,
  scroll = true,
  edges = ["top"],
  style,
  contentStyle,
  bottomPad = 140,
}: Props) {
  if (!scroll) {
    return (
      <SafeAreaView
        edges={edges}
        style={[{ flex: 1, backgroundColor: theme.colors.bg0 }, style as any]}
      >
        {children}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: theme.colors.bg0 }, style as any]}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg0 }}
        contentContainerStyle={[
          {
            padding: theme.spacing.page,
            paddingBottom: bottomPad,
            gap: theme.spacing.gap,
            flexGrow: 1,
          },
          contentStyle as any,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}