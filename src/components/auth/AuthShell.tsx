import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { AUTH } from "@/src/theme/authTheme";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const content = (
    <View style={{ flex: 1, backgroundColor: AUTH.bg }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -70,
          right: -50,
          width: 190,
          height: 190,
          borderRadius: 999,
          backgroundColor: "rgba(16,185,129,0.10)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 120,
          left: -80,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: "rgba(59,130,246,0.06)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -95,
          left: -45,
          width: 210,
          height: 210,
          borderRadius: 999,
          backgroundColor: "rgba(16,185,129,0.055)",
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : Platform.OS === "android"
            ? "height"
            : undefined
        }
        keyboardVerticalOffset={0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 20,
            paddingVertical: 32,
          }}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  if (Platform.OS === "web") return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {content}
    </TouchableWithoutFeedback>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: AUTH.cardBorder,
        backgroundColor: AUTH.card,
        borderRadius: 30,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 18,
        shadowColor: AUTH.shadow,
        shadowOpacity: 0.2,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
      }}
    >
      {children}
    </View>
  );
}