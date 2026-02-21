// app/ai/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

import { isProActiveForOrg } from "@/src/ai/subscription";
import { askZetraAIWithMeta, clearConversationMemoryForOrg } from "@/src/services/ai";
import { AiMessageBubble } from "@/src/components/AiMessageBubble";
import { supabase } from "@/src/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";
type ChatRole = "user" | "assistant";

type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
};

type ReqMsg = { role: "user" | "assistant"; text: string };

type ActionItem = {
  title: string;
  steps?: string[];
  priority?: "LOW" | "MEDIUM" | "HIGH";
  eta?: string;
};

type ToolKey = "ANALYZE" | "IMAGE" | "RESEARCH" | "AGENT" | null;

function clean(s: any) {
  return String(s ?? "").trim();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const INPUT_MAX = 12_000;

/**
 * ✅ ChatGPT-like Typing Engine (UI side)
 */
function isPunct(ch: string) {
  return ch === "." || ch === "!" || ch === "?" || ch === "," || ch === ";" || ch === ":";
}

function isHardPause(ch: string) {
  return ch === "\n" || ch === "." || ch === "!" || ch === "?";
}

const BASE_MS = 28;
const JITTER_MS = 18;
const SOFT_PAUSE_MS = 80;
const HARD_PAUSE_MS = 160;

const MIN_CHUNK = 1;
const MAX_CHUNK = 3;

function hasNextMoveHeading(text: string) {
  const t = clean(text).toUpperCase();
  return t.includes("NEXT MOVE");
}

function formatActions(actions: Array<{ title: string; steps?: string[]; priority?: string; eta?: string }>) {
  if (!Array.isArray(actions) || actions.length === 0) return "";
  const lines: string[] = [];
  lines.push("### ✅ ACTIONS");
  for (const a of actions) {
    const title = clean(a?.title);
    if (!title) continue;

    const metaBits: string[] = [];
    if (clean(a?.priority)) metaBits.push(`priority: ${clean(a.priority)}`);
    if (clean(a?.eta)) metaBits.push(`eta: ${clean(a.eta)}`);
    const meta = metaBits.length ? ` (${metaBits.join(" • ")})` : "";

    lines.push(`- **${title}**${meta}`);

    if (Array.isArray(a?.steps) && a.steps.length) {
      for (const step of a.steps) {
        const st = clean(step);
        if (st) lines.push(`  - ${st}`);
      }
    }
  }

  const out = lines.join("\n");
  return clean(out) ? out : "";
}

function packAssistantText(meta: { text: string; actions: any[]; nextMove?: string; footerNote?: string }) {
  const main = clean(meta?.text);
  const actionsBlock = formatActions(meta?.actions ?? []);
  const nextMove = clean(meta?.nextMove);
  const footerNote = clean(meta?.footerNote);

  const parts: string[] = [];
  if (main) parts.push(main);

  if (actionsBlock) {
    parts.push("");
    parts.push(actionsBlock);
  }

  if (nextMove && !hasNextMoveHeading(main)) {
    parts.push("");
    parts.push("🎯 NEXT MOVE");
    parts.push(nextMove);
  }

  if (footerNote) {
    parts.push("");
    parts.push(footerNote);
  }

  return clean(parts.join("\n"));
}

/**
 * ✅ A (DB Action Bridge)
 */
async function createTasksFromAiActions(args: {
  orgId: string;
  storeId?: string | null;
  actions: ActionItem[];
}): Promise<{ created: number; failed: number; errors: string[] }> {
  const orgId = clean(args.orgId);
  const storeId = clean(args.storeId ?? "") || null;
  const actions = Array.isArray(args.actions) ? args.actions : [];

  if (!orgId || actions.length === 0) return { created: 0, failed: 0, errors: [] };

  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const a of actions) {
    const title = clean(a?.title);
    if (!title) continue;

    const steps = Array.isArray(a?.steps) ? a.steps.map((s) => clean(s)).filter(Boolean) : [];
    const priority =
      a?.priority === "HIGH" || a?.priority === "MEDIUM" || a?.priority === "LOW" ? a.priority : null;
    const eta = clean(a?.eta) || null;

    const { error } = await supabase.rpc("create_task_from_ai", {
      p_org_id: orgId,
      p_title: title,
      p_store_id: storeId,
      p_steps: steps,
      p_priority: priority,
      p_eta: eta,
    });

    if (error) {
      failed++;
      errors.push(clean(error.message) || "Unknown task error");
    } else {
      created++;
    }
  }

  return { created, failed, errors };
}

export default function AiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const topPad = Math.max(insets.top, 10) + 8;
  const safeBottomWhenClosed = Math.max(insets.bottom, 10) + 10;

  const [mode, setMode] = useState<AiMode>("AUTO");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const [proActive, setProActive] = useState(false);

  // ✅ ChatGPT-style Tools + Bottom Sheet
  const [toolOpen, setToolOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>(null);

  const anim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const { height: screenH } = Dimensions.get("window");

  const SHEET_MAX_H = Math.min(Math.round(screenH * 0.72), 640);
  const SHEET_MIN_H = 300;

  const sheetHeight = useMemo(() => {
    if (toolKey === "IMAGE") return Math.max(SHEET_MIN_H + 80, Math.min(SHEET_MAX_H, 520));
    if (toolKey === "RESEARCH") return Math.max(SHEET_MIN_H + 60, Math.min(SHEET_MAX_H, 560));
    if (toolKey === "AGENT") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    if (toolKey === "ANALYZE") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    return SHEET_MIN_H;
  }, [toolKey, SHEET_MAX_H]);

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAttachedUris, setImageAttachedUris] = useState<string[]>([]);

  const openTool = useCallback(
    (k: Exclude<ToolKey, null>) => {
      Keyboard.dismiss();
      setToolKey(k);
      setToolOpen(true);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    },
    [anim]
  );

  const closeTool = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setToolOpen(false);
      setToolKey(null);
    });
  }, [anim]);

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.65] });
  const sheetTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight + 40, 0],
  });
  const sheetScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });

  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      ts: Date.now(),
      text:
        "Karibu ZETRA AI.\n\n" +
        "• Uliza maswali ya biashara (general)\n" +
        "• Au niambie unataka kufanya nini ndani ya ZETRA BMS, nitakuongoza hatua kwa hatua.\n\n" +
        "Tip: Andika Kiswahili au English — nita-adapt automatically.",
    },
  ]);

  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const headerSubtitle = useMemo(() => {
    const orgName = org.activeOrgName ?? "—";
    const storeName = org.activeStoreName ?? "—";
    const role = org.activeRole ?? "—";
    return `${orgName} • ${storeName} • ${role}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const scrollToEndSoon = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        // NOTE: inverted list => offset 0 is the “bottom” (near composer)
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch {}
    });
  }, []);

  useEffect(() => {
    const subShow = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardOpen(true);
      scrollToEndSoon();
    });
    const subHide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      scrollToEndSoon();
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [scrollToEndSoon]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      typingAbortRef.current.aborted = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        try {
          const orgId = org.activeOrgId ?? "";
          if (!orgId) {
            if (!cancelled) setProActive(false);
            return;
          }
          const ok = await isProActiveForOrg(orgId);
          if (!cancelled) setProActive(!!ok);
        } catch {
          if (!cancelled) setProActive(false);
        }
      }

      void run();
      return () => {
        cancelled = true;
      };
    }, [org.activeOrgId])
  );

  const buildHistory = useCallback((): ReqMsg[] => {
    const chronological = [...messages].reverse();
    const cleanedMsgs = chronological.filter((m) => m.role === "user" || m.role === "assistant");
    const withoutWelcome = cleanedMsgs.filter((m, idx) => !(idx === 0 && m.role === "assistant"));
    const last = withoutWelcome.slice(Math.max(0, withoutWelcome.length - 12));
    return last.map((m) => ({ role: m.role, text: m.text }));
  }, [messages]);

  const patchMessageText = useCallback((id: string, nextText: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: nextText } : m)));
  }, []);

  const stopTyping = useCallback(() => {
    typingAbortRef.current.aborted = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, []);

  const typeOutChatGPTLike = useCallback(
    async (msgId: string, fullText: string) => {
      stopTyping();
      typingAbortRef.current = { aborted: false };

      const txt = String(fullText ?? "");
      if (!txt.trim()) {
        patchMessageText(msgId, "Samahani — AI imerudisha jibu tupu. Jaribu tena.");
        return;
      }

      patchMessageText(msgId, "");

      const L = txt.length;
      const speedFactor = L > 1800 ? 0.72 : L > 1000 ? 0.82 : L > 600 ? 0.9 : 1.0;

      let i = 0;

      const tick = () => {
        if (typingAbortRef.current.aborted) return;

        const r = Math.random();
        const chunk = r < 0.78 ? MIN_CHUNK : r < 0.95 ? 2 : MAX_CHUNK;

        const nextI = Math.min(txt.length, i + chunk);
        const next = txt.slice(0, nextI);
        const lastChar = next.charAt(next.length - 1);

        i = nextI;
        patchMessageText(msgId, next);
        scrollToEndSoon();

        if (i >= txt.length) return;

        let delay = (BASE_MS + Math.floor(Math.random() * JITTER_MS)) * speedFactor;

        if (isHardPause(lastChar)) delay += HARD_PAUSE_MS;
        else if (isPunct(lastChar)) delay += SOFT_PAUSE_MS;

        typingTimerRef.current = setTimeout(tick, Math.max(12, Math.floor(delay)));
      };

      typingTimerRef.current = setTimeout(tick, Math.floor(BASE_MS * speedFactor));
    },
    [patchMessageText, scrollToEndSoon, stopTyping]
  );

  const send = useCallback(async () => {
    const text = clean(input);
    if (!text || thinking) return;

    if (text.length > INPUT_MAX) {
      const botMsg: ChatMsg = {
        id: uid(),
        role: "assistant",
        ts: Date.now(),
        text:
          `Ujumbe wako ni mrefu sana.\n` +
          `• Limit: ${INPUT_MAX.toLocaleString()} characters\n\n` +
          `Punguza au gawanya message vipande viwili.`,
      };
      setMessages((prev) => [botMsg, ...prev]);
      return;
    }

    const history = buildHistory();

    setInput("");
    setThinking(true);
    stopTyping();

    const userMsg: ChatMsg = { id: uid(), role: "user", text, ts: Date.now() };
    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "…" };

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    scrollToEndSoon();

    try {
      const meta = await askZetraAIWithMeta(text, {
        mode,
        history,
        context: {
          orgId: org.activeOrgId,
          activeOrgId: org.activeOrgId,
          activeOrgName: org.activeOrgName,
          activeStoreId: org.activeStoreId,
          activeStoreName: org.activeStoreName,
          activeRole: org.activeRole,
        },
      });

      let footerNote = "";
      if (proActive && clean(org.activeOrgId) && Array.isArray(meta.actions) && meta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: meta.actions as ActionItem[],
        });

        if (result.created > 0) {
          footerNote = `✅ Saved to Tasks: ${result.created}`;
          if (result.failed > 0) footerNote += ` • Failed: ${result.failed}`;
        } else if (result.failed > 0) {
          footerNote =
            "⚠️ Actions zimeshindwa ku-save kwenye Tasks.\n" +
            "Tip: Hakikisha RPC `create_task_from_ai` ipo na una role ya owner/admin.";
        }
      }

      const packed = packAssistantText({
        text: meta.text,
        actions: meta.actions ?? [],
        nextMove: meta.nextMove,
        footerNote,
      });

      await typeOutChatGPTLike(botId, packed || meta.text || "Samahani — AI imerudisha jibu tupu. Jaribu tena.");
    } catch (e: any) {
      patchMessageText(
        botId,
        "Samahani — kuna hitilafu kidogo.\n" +
          (e?.message ? `\nError: ${String(e.message)}` : "") +
          "\n\nTip: Kama ni timeout, jaribu tena.\nKama ni 500, angalia Worker logs (OpenAI key/model)."
      );
    } finally {
      setThinking(false);
      scrollToEndSoon();
    }
  }, [
    input,
    thinking,
    mode,
    buildHistory,
    org.activeOrgId,
    org.activeOrgName,
    org.activeRole,
    org.activeStoreId,
    org.activeStoreName,
    proActive,
    patchMessageText,
    scrollToEndSoon,
    stopTyping,
    typeOutChatGPTLike,
  ]);

  const ModePill = ({ k, label }: { k: AiMode; label: string }) => {
    const active = mode === k;
    return (
      <Pressable
        onPress={() => setMode(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          height: 34,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? UI.colors.emeraldBorder : "rgba(255,255,255,0.12)",
          backgroundColor: active ? UI.colors.emeraldSoft : "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Text style={{ color: UI.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  // ✅ Tasks pill (goes to /ai/tasks)
  const TasksPill = (
    <Pressable
      onPress={() => router.push("/ai/tasks")}
      hitSlop={10}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="checkbox-outline" size={16} color={UI.text} />
        <Text style={{ color: UI.text, fontWeight: "900" }}>Tasks</Text>
      </View>
    </Pressable>
  );

  const ProPill = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: UI.colors.emeraldBorder,
        backgroundColor: "rgba(16,185,129,0.12)",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
      }}
    >
      <Ionicons name="sparkles" size={14} color={UI.text} />
      <Text style={{ color: UI.text, fontWeight: "900" }}>PRO</Text>
    </View>
  );

  const TopBar = (
    <View
      style={{
        paddingTop: topPad,
        paddingBottom: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
        backgroundColor: UI.colors.background,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <Ionicons name="chevron-back" size={22} color={UI.text} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
            ZETRA AI
          </Text>
          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>

        {proActive ? ProPill : null}

        <Pressable
          onPress={() => router.push("/settings/subscription")}
          hitSlop={10}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            height: 44,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>Subscription</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            stopTyping();
            void clearConversationMemoryForOrg(org.activeOrgId);

            setMessages([
              {
                id: uid(),
                role: "assistant",
                ts: Date.now(),
                text:
                  "Karibu ZETRA AI.\n\n" +
                  "• Uliza maswali ya biashara (general)\n" +
                  "• Au niambie unataka kufanya nini ndani ya ZETRA BMS, nitakuongoza hatua kwa hatua.\n\n" +
                  "Tip: Andika Kiswahili au English — nita-adapt automatically.",
              },
            ]);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          hitSlop={10}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            height: 44,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.92 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <Text style={{ color: UI.text, fontWeight: "900" }}>Reset</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <ModePill k="AUTO" label="Auto" />
        <ModePill k="SW" label="Swahili" />
        <ModePill k="EN" label="English" />
        {TasksPill}
      </View>
    </View>
  );

  // ✅ Tool card: tighter + more “ChatGPT-like”
  const ToolCard = ({
    icon,
    title,
    subtitle,
    k,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    k: Exclude<ToolKey, null>;
  }) => {
    return (
      <Pressable
        onPress={() => openTool(k)}
        hitSlop={10}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: pressed ? "rgba(16,185,129,0.26)" : "rgba(255,255,255,0.12)",
          backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
          padding: 12,
          opacity: pressed ? 0.95 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: UI.colors.emeraldBorder,
              backgroundColor: "rgba(16,185,129,0.13)",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.1,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            }}
          >
            <Ionicons name={icon} size={19} color={UI.text} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14.5 }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2, fontSize: 12.5 }} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={UI.faint} />
        </View>
      </Pressable>
    );
  };

  const ToolsGrid = (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <ToolCard icon="analytics" title="Analyze" subtitle="Business insights" k="ANALYZE" />
        <ToolCard icon="color-wand" title="Create" subtitle="Image generator" k="IMAGE" />
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <ToolCard icon="search" title="Research" subtitle="Deep research mode" k="RESEARCH" />
        <ToolCard icon="sparkles" title="Agent" subtitle="Auto tasks & plans" k="AGENT" />
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
          Tip: Chagua tool, kisha tuma prompt. Chat bado ipo chini kwa maswali ya kawaida.
        </Text>
      </View>
    </View>
  );

  const SheetTitle = useMemo(() => {
    if (toolKey === "IMAGE") return "🎨 Create Image";
    if (toolKey === "RESEARCH") return "🔎 Deep Research";
    if (toolKey === "AGENT") return "🤖 Agent Mode";
    if (toolKey === "ANALYZE") return "📊 Analyze Business";
    return "Tool";
  }, [toolKey]);

  const SheetSubtitle = useMemo(() => {
    if (toolKey === "IMAGE") return "Tengeneza picha kwa prompt (UI-ready).";
    if (toolKey === "RESEARCH") return "Muulize swali, nitatoa uchambuzi wa kina.";
    if (toolKey === "AGENT") return "Nitaandaa plan + actions (PRO saves to Tasks).";
    if (toolKey === "ANALYZE") return "Sales/stock/strategy suggestions (general).";
    return "";
  }, [toolKey]);

  const SheetBody = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      {toolKey === "IMAGE" ? (
        <View>
          <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 8 }}>Prompt</Text>

          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={imagePrompt}
              onChangeText={setImagePrompt}
              placeholder="Mfano: Poster ya bidhaa, neon dark style, ZETRA…"
              placeholderTextColor={UI.faint}
              style={{ color: UI.text, fontWeight: "800", minHeight: 24, maxHeight: 140 }}
              multiline
              keyboardAppearance="dark"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                setImageAttachedUris((prev) => prev);
              }}
              hitSlop={10}
              style={({ pressed }) => ({
                flex: 1,
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="image" size={18} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900" }}>Attach</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                const p = clean(imagePrompt);
                if (!p) return;

                setInput(p);
                closeTool();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              hitSlop={10}
              style={({ pressed }) => ({
                flex: 1,
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: UI.colors.emeraldBorder,
                backgroundColor: UI.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="sparkles" size={18} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900" }}>Use Prompt</Text>
              </View>
            </Pressable>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 10 }}>
            Note: Hii ni UI layer. Wiring ya “image generation” tutaiunganisha hatua inayofuata bila kugusa chat core.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 8 }}>How to use</Text>

          <Card style={{ padding: 14, borderRadius: 16 }}>
            <Text style={{ color: UI.text, fontWeight: "800", lineHeight: 22 }}>
              {toolKey === "RESEARCH"
                ? "Andika swali la kina (mfano: ‘Ni strategy gani ya pricing kwa bidhaa X?’). Nitaandaa uchambuzi wa kina."
                : toolKey === "AGENT"
                ? "Nipe lengo. Nitatoa plan + actions. Kama una PRO, actions zitahifadhiwa kwenye Tasks kwa RPC create_task_from_ai."
                : toolKey === "ANALYZE"
                ? "Nipe context ya biashara yako (mauzo, stock, changamoto). Nitakupa insights + next move."
                : "Chagua tool kisha andika prompt."}
            </Text>
          </Card>

          <View style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => {
                const starter =
                  toolKey === "RESEARCH"
                    ? "Fanya deep research: ni mambo gani 10 yanayoongeza mauzo ya store ya bidhaa mchanganyiko Tanzania?"
                    : toolKey === "AGENT"
                    ? "Nisaidie kuandaa plan ya wiki 2: kuongeza mauzo na kupunguza stock dead — toa actions."
                    : toolKey === "ANALYZE"
                    ? "Nipe analysis: nina stores 3, stock inakaa muda mrefu. Nifanye nini kuongeza turnover?"
                    : "";

                if (!starter) return;
                setInput(starter);
                closeTool();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              hitSlop={10}
              style={({ pressed }) => ({
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: UI.colors.emeraldBorder,
                backgroundColor: UI.colors.emeraldSoft,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="flash" size={18} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900" }}>Use Starter Prompt</Text>
              </View>
            </Pressable>

            <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 10 }}>
              Tip: Ukibonyeza “Use Starter Prompt”, itaweka prompt kwenye input bila kutuma—utabonyeza Send ukiwa tayari.
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  // ✅ IMPORTANT: FlatList is inverted, so "space near composer" must be in paddingTop (not paddingBottom).
  const listTopPad = useMemo(() => {
    const composerApprox = keyboardOpen ? 116 : 150;
    const safe = keyboardOpen ? 10 : safeBottomWhenClosed;
    return safe + composerApprox;
  }, [keyboardOpen, safeBottomWhenClosed]);

  const listBottomPad = 12; // small breathing room on the other end

  // ✅ Floating composer bottom inset (ChatGPT-like)
  const composerBottom = useMemo(() => {
    return keyboardOpen ? 10 : safeBottomWhenClosed;
  }, [keyboardOpen, safeBottomWhenClosed]);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          {TopBar}

          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <AiMessageBubble msg={item} />}
            // ✅ FIX: inverted list => pad TOP to protect from absolute composer overlap
            contentContainerStyle={{ paddingTop: listTopPad, paddingBottom: listBottomPad }}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <View>
                {ToolsGrid}

                {thinking ? (
                  <View style={{ paddingHorizontal: 16, paddingTop: 8, alignItems: "flex-start" }}>
                    <Card style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <ActivityIndicator />
                        <Text style={{ color: UI.muted, fontWeight: "900" }}>AI inaandika...</Text>
                      </View>
                    </Card>
                  </View>
                ) : null}
              </View>
            }
          />

          {/* ✅ ChatGPT-like floating composer */}
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 16,
              paddingBottom: composerBottom,
              paddingTop: 10,
              zIndex: 50,
            }}
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.07)",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 10,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
            >
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Andika swali lako… / Type your question…"
                placeholderTextColor={UI.faint}
                style={{
                  flex: 1,
                  color: UI.text,
                  fontWeight: "800",
                  minHeight: 22,
                  maxHeight: 120,
                }}
                multiline
                keyboardAppearance="dark"
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => void send()}
              />

              <Pressable
                onPress={() => void send()}
                disabled={!clean(input) || thinking}
                hitSlop={10}
                style={({ pressed }) => {
                  const active = clean(input) && !thinking;
                  return {
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? UI.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                    backgroundColor: active ? "rgba(16,185,129,0.20)" : "rgba(255,255,255,0.05)",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !active ? 0.6 : pressed ? 0.92 : 1,
                    transform: [{ scale: pressed && active ? 0.985 : 1 }],
                    shadowColor: "#000",
                    shadowOpacity: active ? 0.18 : 0,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: active ? 6 : 0,
                  };
                }}
              >
                <Ionicons name="send" size={18} color={UI.text} />
              </Pressable>
            </View>
          </View>

          {toolOpen ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                zIndex: 999,
              }}
            >
              <Animated.View
                pointerEvents="auto"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.9)",
                  opacity: overlayOpacity,
                }}
              />

              <Pressable
                onPress={closeTool}
                style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              />

              <Animated.View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
                }}
              >
                <View
                  style={{
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: UI.colors.background,
                    overflow: "hidden",
                  }}
                >
                  <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
                    <View
                      style={{
                        width: 44,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: "rgba(255,255,255,0.18)",
                      }}
                    />
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "rgba(255,255,255,0.08)",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                        {SheetTitle}
                      </Text>
                      <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
                        {SheetSubtitle}
                      </Text>
                    </View>

                    <Pressable
                      onPress={closeTool}
                      hitSlop={10}
                      style={({ pressed }) => ({
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.92 : 1,
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      })}
                    >
                      <Ionicons name="close" size={18} color={UI.text} />
                    </Pressable>
                  </View>

                  <View style={{ height: sheetHeight }}>{SheetBody}</View>
                </View>
              </Animated.View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}