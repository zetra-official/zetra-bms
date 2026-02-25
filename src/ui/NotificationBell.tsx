// src/ui/NotificationBell.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { supabase } from "@/src/supabase/supabaseClient";
import { theme } from "@/src/ui/theme";

type Props = {
  top?: number; // absolute top offset from Screen.tsx
  right?: number;
};

function clampCount(n: number) {
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  return i < 0 ? 0 : i;
}

export function NotificationBell({ top = 12, right = 16 }: Props) {
  const router = useRouter();
  const segments = useSegments();

  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);
  const pollRef = useRef<any>(null);

  const isInAuth = useMemo(() => segments?.[0] === "(auth)", [segments]);

  const loadCount = useCallback(async () => {
    if (isInAuth) return; // do not query while in auth group
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user?.id) {
        if (mountedRef.current) setCount(0);
        return;
      }

      const { data, error } = await supabase.rpc("get_my_unread_notifications_count", {
        p_store_id: null,
      });

      if (error) throw error;

      const n = clampCount(Number(data ?? 0));
      if (mountedRef.current) setCount(n);
    } catch {
      if (mountedRef.current) setCount((v) => (Number.isFinite(v) ? v : 0));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [isInAuth]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // initial + poll (lightweight)
  useEffect(() => {
    if (isInAuth) return;

    void loadCount();

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void loadCount();
    }, 30000); // 30s poll (safe)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isInAuth, loadCount]);

  // refresh badge on auth state change
  useEffect(() => {
    if (isInAuth) return;

    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        setCount(0);
        return;
      }
      void loadCount();
    });

    return () => {
      try {
        data.subscription.unsubscribe();
      } catch {}
    };
  }, [isInAuth, loadCount]);

  const openNotifications = useCallback(() => {
    if (isInAuth) return;

    // ✅ IMPORTANT: go to non-tab route
    router.push("/notifications");
  }, [router, isInAuth]);

  const badgeText = useMemo(() => {
    if (count <= 0) return "";
    if (count > 99) return "99+";
    return String(count);
  }, [count]);

  if (isInAuth) return null;

  return (
    <View
      style={{
        position: "absolute",
        top,
        right,
        zIndex: 60,
      }}
    >
      <Pressable
        onPress={openNotifications}
        style={({ pressed }) => [
          {
            width: 46,
            height: 46,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(20,24,31,0.55)",
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />

        {badgeText ? (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              borderRadius: 999,
              paddingHorizontal: 6,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.55)",
              backgroundColor: "rgba(52,211,153,0.18)",
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 11 }}>
              {badgeText}
            </Text>
          </View>
        ) : null}

        {loading && count <= 0 ? (
          <View
            style={{
              position: "absolute",
              bottom: -3,
              width: 18,
              height: 3,
              borderRadius: 99,
              backgroundColor: "rgba(52,211,153,0.45)",
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}