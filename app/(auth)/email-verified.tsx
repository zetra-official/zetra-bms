import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

export default function EmailVerifiedScreen() {
  const router = useRouter();

  const goLogin = () => {
    router.replace("/(auth)/login");
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#061018",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 32,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -70,
          right: -50,
          width: 180,
          height: 180,
          borderRadius: 999,
          backgroundColor: "rgba(16,185,129,0.08)",
        }}
      />

      <View
        style={{
          width: "100%",
          maxWidth: 520,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.045)",
          borderRadius: 30,
          paddingHorizontal: 22,
          paddingVertical: 26,
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 999,
            backgroundColor: "rgba(16,185,129,0.14)",
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.30)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <Text
            style={{
              color: "#6EE7B7",
              fontSize: 34,
              fontWeight: "900",
            }}
          >
            ✓
          </Text>
        </View>

        <Text
          style={{
            color: "#6EE7B7",
            fontWeight: "900",
            fontSize: 12,
            letterSpacing: 0.9,
            marginBottom: 10,
          }}
        >
          EMAIL VERIFIED
        </Text>

        <Text
          style={{
            color: "white",
            fontSize: 30,
            lineHeight: 36,
            fontWeight: "900",
            textAlign: "center",
          }}
        >
          Email verified successfully
        </Text>

        <Text
          style={{
            color: "rgba(255,255,255,0.68)",
            fontSize: 15,
            lineHeight: 23,
            fontWeight: "700",
            textAlign: "center",
            marginTop: 14,
          }}
        >
          Email yako imethibitishwa kwa mafanikio.
          Sasa unaweza kurudi ZETRA BMS na Login ili kuendelea
          na business setup yako.
        </Text>

        <View
          style={{
            marginTop: 20,
            width: "100%",
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.18)",
            backgroundColor: "rgba(16,185,129,0.08)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.88)",
              fontWeight: "800",
              fontSize: 13,
              lineHeight: 20,
              textAlign: "center",
            }}
          >
            Verification imekamilika. Ukilogin kwa mara ya kwanza,
            ZETRA BMS itakupeleka kwenye Referral na Business Setup.
          </Text>
        </View>

        <Pressable
          onPress={goLogin}
          accessibilityRole="button"
          style={({ pressed }) => ({
            width: "100%",
            marginTop: 22,
            backgroundColor: "#22C58B",
            paddingVertical: 17,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.88 : 1,
            cursor:
              Platform.OS === "web"
                ? ("pointer" as any)
                : undefined,
          })}
        >
          <Text
            style={{
              color: "#04110C",
              fontWeight: "900",
              fontSize: 17,
            }}
          >
            Continue to Login
          </Text>
        </Pressable>

        <Text
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 12,
            fontWeight: "700",
            textAlign: "center",
            marginTop: 16,
            lineHeight: 18,
          }}
        >
          ZETRA BMS • Secure Business Access
        </Text>
      </View>
    </View>
  );
}