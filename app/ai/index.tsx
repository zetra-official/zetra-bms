// app/ai/index.tsx

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";

import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

import { isProActiveForOrg } from "@/src/ai/subscription";
import { AiMessageBubble } from "@/src/components/AiMessageBubble";
import { supabase } from "@/src/supabase/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";
type ChatRole = "user" | "assistant";

type AttachedImage = {
  id: string;
  uri: string;
  dataUrl: string; // "data:image/jpeg;base64,..."
};

type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
  // ✅ A-4: keep lightweight refs for thumbnails + preview
  images?: Array<{ id: string; uri: string }> | null;
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
 * ✅ THEME BRIDGE (FIX)
 * Some builds export UI as flat tokens (UI.background, UI.emeraldBorder, ...)
 * but code uses UI.colors.*. This bridge supports BOTH without changing theme.ts.
 */
const C: any = (UI as any)?.colors ?? UI;

/**
✅ Normalize Worker BASE URL
*/
function normalizeWorkerBaseUrl(raw: any) {
  let u = clean(raw);
  if (!u) return "";
  u = u.replace(/\s+/g, "");
  u = u.replace(/\/+$/g, "");

  u = u.replace(/\/v1\/chat$/i, "");
  u = u.replace(/\/health$/i, "");
  u = u.replace(/\/vision$/i, "");
  u = u.replace(/\/image$/i, "");
  u = u.replace(/\/transcribe$/i, "");

  u = u.replace(/\/+$/g, "");
  return u;
}
const AI_WORKER_URL = normalizeWorkerBaseUrl(process.env.EXPO_PUBLIC_AI_WORKER_URL ?? "");

/**
✅ Image URL normalization
*/
function isDataImageUrl(u: string) {
  const t = clean(u).toLowerCase();
  return t.startsWith("data:image/");
}
function normalizeImageUrl(raw: string) {
  const u = clean(raw);
  if (!u) return "";
  if (isDataImageUrl(u)) return u.replace(/\s+/g, "");
  return u;
}

/**
✅ Robust fetch (Timeout + Retry + Better Error Body) + ✅ A-3 Abort
*/
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function safeClip(s: string, max = 900) {
  const t = clean(s);
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

async function readJsonOrText(res: Response): Promise<{ json: any | null; text: string }> {
  try {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => null);
      return { json: j, text: clean(j) ? JSON.stringify(j) : "" };
    }
  } catch {}
  const txt = await res.text().catch(() => "");
  return { json: null, text: txt };
}

/**
 * ✅ A-3 Abort support:
 * - If init.signal is provided, we mirror it into our internal timeout controller.
 */
async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts?: { timeoutMs?: number; retries?: number; tag?: string }
): Promise<{ status: number; ok: boolean; data: any | null; textBody: string }> {
  const timeoutMs = Math.max(2_000, Number(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(5, Number(opts?.retries ?? DEFAULT_RETRIES)));
  const tag = clean(opts?.tag) || "request";

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    // Mirror external abort -> internal controller.abort()
    const ext = init?.signal;
    const onExtAbort = () => controller.abort();
    try {
      if (ext) {
        if ((ext as any).aborted) controller.abort();
        else (ext as any).addEventListener?.("abort", onExtAbort);
      }
    } catch {}

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);

      try {
        if (ext) (ext as any).removeEventListener?.("abort", onExtAbort);
      } catch {}

      const { json, text } = await readJsonOrText(res);

      if (res.ok) {
        return {
          status: res.status,
          ok: true,
          data: json ?? (clean(text) ? { raw: text } : null),
          textBody: text,
        };
      }

      const bodyStr = clean((json as any)?.error) || clean((json as any)?.message) || safeClip(text);
      const shouldRetry = RETRYABLE_STATUS.has(res.status);

      if (!shouldRetry || attempt >= retries) {
        return { status: res.status, ok: false, data: json, textBody: bodyStr || text };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    } catch (e: any) {
      clearTimeout(t);

      try {
        if (ext) (ext as any).removeEventListener?.("abort", onExtAbort);
      } catch {}

      lastErr = e;

      const isAbort =
        e?.name === "AbortError" ||
        clean(e?.message).toLowerCase().includes("aborted") ||
        clean(e?.message).toLowerCase().includes("abort");
      const isNetwork =
        clean(e?.message).toLowerCase().includes("network request failed") ||
        clean(e?.message).toLowerCase().includes("failed to fetch");

      const shouldRetry = isAbort || isNetwork;

      if (!shouldRetry || attempt >= retries) {
        const msg = isAbort
          ? `${tag} aborted/timeout after ${Math.round(timeoutMs / 1000)}s`
          : clean(e?.message) || `${tag} failed`;
        return { status: 0, ok: false, data: null, textBody: msg };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    }
  }

  const fallback = clean(lastErr?.message) || `${opts?.tag || "request"} failed`;
  return { status: 0, ok: false, data: null, textBody: fallback };
}

/**
✅ ChatGPT-like Typing Engine (UI side)
*/
function isPunct(ch: string) {
  return ch === "." || ch === "!" || ch === "?" || ch === "," || ch === ";" || ch === ":";
}

/**
 * ✅ ACTIONS formatting (kept)
 */
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

/**
 * ✅ HARD STOP FOR "NEXT ACTION" / "NEXT MOVE"
 * Sometimes model/worker may include these lines. We remove them client-side
 * to guarantee they never appear in UI.
 */
function stripNextActionLines(raw: string) {
  const t = String(raw ?? "");
  if (!t.trim()) return "";
  const lines = t.split(/\r?\n/);

  const out: string[] = [];
  for (const line of lines) {
    const l = line ?? "";
    const tl = l.trim().toLowerCase();

    const isNextAction =
      tl.startsWith("next action:") ||
      tl.startsWith("next move:") ||
      tl.startsWith("next_action:") ||
      tl.startsWith("next_move:") ||
      tl.startsWith("next action :") ||
      tl.startsWith("next move :");

    if (isNextAction) continue;

    out.push(l);
  }

  // remove extra trailing blank lines
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n").trim();
}

function sanitizeAssistantText(raw: string) {
  // Add more sanitizers here if needed, but keep minimal.
  return stripNextActionLines(raw);
}

/**
 * ✅ IMPORTANT CHANGE:
 * - NEXT ACTION / NEXT MOVE removed completely (as per request)
 */
function packAssistantText(meta: { text: string; actions: any[]; footerNote?: string }) {
  const main = sanitizeAssistantText(clean(meta?.text));
  const actionsBlock = formatActions(meta?.actions ?? []);
  const footerNote = clean(meta?.footerNote);

  const parts: string[] = [];
  if (main) parts.push(main);

  if (actionsBlock) {
    parts.push("");
    parts.push(actionsBlock);
  }

  if (footerNote) {
    parts.push("");
    parts.push(footerNote);
  }

  return clean(parts.join("\n"));
}

/**
✅ A (DB Action Bridge) - remains (BMS feature)
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

/**
✅ detect image intent via normal Send()
*/
function detectImageIntent(rawText: string): { isImage: boolean; prompt: string } {
  const t = clean(rawText);
  if (!t) return { isImage: false, prompt: "" };

  const patterns: Array<{ re: RegExp; strip: (m: RegExpMatchArray) => string }> = [
    { re: /^\s*\[\s*create\s+image\s*\]\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*create\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*create\s+an\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*generate\s+image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*image\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
    { re: /^\s*draw\s*:\s*(.+)$/i, strip: (m) => clean(m[1]) },
  ];

  for (const p of patterns) {
    const m = t.match(p.re);
    if (m) {
      const prompt = p.strip(m);
      if (prompt) return { isImage: true, prompt };
      return { isImage: true, prompt: t };
    }
  }

  return { isImage: false, prompt: "" };
}

/**
✅ Typing dots loop for placeholder message (premium feel)
*/
function nextTypingText(step: number) {
  const dots = step % 4; // 0..3
  return `AI inaandika${".".repeat(dots)}`;
}

/**
✅ Retry payload (DISCRIMINATED UNION)
*/
type RetryPayload =
  | { kind: "chat"; text: string; history: ReqMsg[] }
  | { kind: "vision"; text: string; history: ReqMsg[]; images: AttachedImage[] }
  | { kind: "image"; prompt: string };

/**
✅ A-1 Tasks list row (DB)
*/
type TaskRow = {
  id: string;
  organization_id: string;
  store_id: string | null;
  title: string;
  steps: string[] | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | null;
  eta: string | null;
  status: string | null;
  created_at: string;
};

export default function AiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const topPad = Math.max(insets.top, 10) + 8;

  // ✅ Keyboard state (used for composer spacing)
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const subShow = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const subHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const [mode, setMode] = useState<AiMode>("AUTO");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const [proActive, setProActive] = useState(false);

  // ✅ AI Gate (LITE/FREE => AI disabled)
  const [aiGateOpen, setAiGateOpen] = useState(false);
  const [aiGateReason, setAiGateReason] = useState("");

  const aiEnabled = !!proActive;

  const openAiGate = useCallback(
    (reason?: string) => {
      setAiGateReason(clean(reason) || "");
      setAiGateOpen(true);
    },
    [setAiGateOpen]
  );

  const requireAi = useCallback(
    (reason?: string) => {
      if (aiEnabled) return true;
      openAiGate(reason || "AI haipatikani kwenye kifurushi chako (LITE/FREE).");
      return false;
    },
    [aiEnabled, openAiGate]
  );

  // ✅ Tools bottom sheet (kept for future)
  const [toolOpen, setToolOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>(null);

  // ✅ In-screen Tasks panel (Modal)
  const [tasksOpen, setTasksOpen] = useState(false);

  // ✅ NEW: Plus menu (ChatGPT-like)
  const [plusOpen, setPlusOpen] = useState(false);

  // ✅ A-1 Tasks data
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // ✅ A-4 image preview modal (fullscreen)
  const [imgPreview, setImgPreview] = useState<{ open: boolean; uri: string }>({ open: false, uri: "" });

  const anim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const { height: screenH } = Dimensions.get("window");

  const SHEET_MAX_H = Math.min(Math.round(screenH * 0.72), 640);
  const SHEET_MIN_H = 300;

  const sheetHeight = useMemo(() => {
    if (toolKey === "IMAGE") return Math.max(SHEET_MIN_H + 120, Math.min(SHEET_MAX_H, 560));
    if (toolKey === "RESEARCH") return Math.max(SHEET_MIN_H + 60, Math.min(SHEET_MAX_H, 560));
    if (toolKey === "AGENT") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    if (toolKey === "ANALYZE") return Math.max(SHEET_MIN_H + 40, Math.min(SHEET_MAX_H, 520));
    return SHEET_MIN_H;
  }, [toolKey, SHEET_MAX_H]);

  const [imagePrompt, setImagePrompt] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // 🎙️ Voice
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingOn, setRecordingOn] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

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

  const lastPayloadRef = useRef<RetryPayload | null>(null);
  const [retryCard, setRetryCard] = useState<{
    visible: boolean;
    label: string;
    payload: RetryPayload | null;
  }>({ visible: false, label: "", payload: null });

  const listRef = useRef<FlatList<ChatMsg>>(null);
  const inputRef = useRef<TextInput>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const typingDotsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingDotsStepRef = useRef(0);

  // ✅ A-2: request token to prevent stale responses from overwriting UI
  const activeReqTokenRef = useRef<string>("");
  const makeReqToken = () => uid();

  // ✅ A-3: abort in-flight network
  const netAbortRef = useRef<AbortController | null>(null);

  const stopTypingDots = useCallback(() => {
    if (typingDotsTimerRef.current) clearInterval(typingDotsTimerRef.current);
    typingDotsTimerRef.current = null;
  }, []);

  const startTypingDots = useCallback(
    (botId: string) => {
      stopTypingDots();
      typingDotsStepRef.current = 0;

      setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: nextTypingText(0) } : m)));

      typingDotsTimerRef.current = setInterval(() => {
        typingDotsStepRef.current += 1;
        const t = nextTypingText(typingDotsStepRef.current);
        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: t } : m)));
      }, 380);
    },
    [stopTypingDots]
  );

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

  const headerSubtitle = useMemo(() => {
    const orgName = org.activeOrgName ?? "—";
    const storeName = org.activeStoreName ?? "—";
    const role = org.activeRole ?? "—";
    return `${orgName} • ${storeName} • ${role}`;
  }, [org.activeOrgName, org.activeRole, org.activeStoreName]);

  const scrollToEndSoon = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        // FlatList is inverted, offset 0 is bottom
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch {}
    });
  }, []);

  const stopTyping = useCallback(() => {
    typingAbortRef.current.aborted = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, []);

  const patchMessageText = useCallback((id: string, nextText: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: nextText } : m)));
  }, []);

  const typeOutChatGPTLike = useCallback(
    async (msgId: string, fullText: string, reqToken?: string) => {
      stopTyping();
      stopTypingDots();
      typingAbortRef.current = { aborted: false };

      const myToken = clean(reqToken || "");
      const txt = String(fullText ?? "");
      if (!txt.trim()) {
        // ✅ A-2: ignore stale
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;
        patchMessageText(msgId, "Samahani — AI imerudisha jibu tupu. Jaribu tena.");
        return;
      }

      // ✅ A-2: ignore stale
      if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

      patchMessageText(msgId, "");

      const L = txt.length;
      const speedFactor = L > 1800 ? 0.72 : L > 1000 ? 0.82 : L > 600 ? 0.9 : 1.0;

      let i = 0;

      const tick = () => {
        if (typingAbortRef.current.aborted) return;

        // ✅ A-2: ignore stale
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

        const r = Math.random();
        const chunk = r < 0.78 ? 1 : r < 0.95 ? 2 : 3;

        const nextI = Math.min(txt.length, i + chunk);
        const next = txt.slice(0, nextI);
        const lastChar = next.charAt(next.length - 1);

        i = nextI;
        patchMessageText(msgId, next);
        scrollToEndSoon();

        if (i >= txt.length) return;

        let delay = (28 + Math.floor(Math.random() * 18)) * speedFactor;

        if (lastChar === "\n" || lastChar === "." || lastChar === "!" || lastChar === "?") delay += 160;
        else if (isPunct(lastChar)) delay += 80;

        typingTimerRef.current = setTimeout(tick, Math.max(12, Math.floor(delay)));
      };

      typingTimerRef.current = setTimeout(tick, Math.floor(28 * speedFactor));
    },
    [patchMessageText, scrollToEndSoon, stopTyping, stopTypingDots]
  );

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      typingAbortRef.current.aborted = true;
      stopTypingDots();

      // ✅ A-3 abort on unmount
      try {
        netAbortRef.current?.abort();
      } catch {}
      netAbortRef.current = null;
    };
  }, [stopTypingDots]);

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
    // messages are stored newest-first (we unshift), so reverse to chronological
    const chronological = [...messages].reverse();
    const cleanedMsgs = chronological.filter((m) => m.role === "user" || m.role === "assistant");
    // remove very first welcome assistant msg to avoid over-conditioning
    const withoutWelcome = cleanedMsgs.filter((m, idx) => !(idx === 0 && m.role === "assistant"));
    const last = withoutWelcome.slice(Math.max(0, withoutWelcome.length - 12));
    return last.map((m) => ({ role: m.role, text: m.text }));
  }, [messages]);

  const requireWorkerUrlOrAlert = useCallback(() => {
    if (!AI_WORKER_URL) {
      Alert.alert(
        "AI Worker URL missing",
        "Weka EXPO_PUBLIC_AI_WORKER_URL kwenye .env (base URL ya Cloudflare Worker), kisha restart Metro.\n\n" +
          "Mfano:\nhttps://zetra-ai-worker.jofreyjofreysanga.workers.dev"
      );
      return false;
    }
    return true;
  }, []);

  const pickAndAttachImage = useCallback(async () => {
    if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kutumia image/vision tools.")) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Ruhusu Photos/Media ili ku-attach picha.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri || !asset?.base64) {
        Alert.alert("Failed", "Imeshindikana kupata image base64. Jaribu tena.");
        return;
      }

      const mime = (asset as any).mimeType || "image/jpeg";
      const dataUrl = `data:${mime};base64,${asset.base64}`;

      setAttachedImages((prev) => [
        ...prev,
        {
          id: uid(),
          uri: asset.uri,
          dataUrl,
        },
      ]);

      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e: any) {
      Alert.alert("Error", clean(e?.message) || "Image pick error");
    }
  }, [requireAi]);

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const startRecording = useCallback(async () => {
    if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kutumia mic/voice.")) return;

    try {
      if (!requireWorkerUrlOrAlert()) return;

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Ruhusu Microphone ili AI isikie sauti.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();

      setRecording(rec);
      setRecordingOn(true);
    } catch (e: any) {
      Alert.alert("Mic error", clean(e?.message) || "Failed to start recording");
      setRecording(null);
      setRecordingOn(false);
    }
  }, [requireAi, requireWorkerUrlOrAlert]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    try {
      if (!recording) return;

      setTranscribing(true);
      setRecordingOn(false);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert("Error", "Recording URI missing.");
        setTranscribing(false);
        return;
      }

      const form = new FormData();
      form.append(
        "file",
        {
          uri,
          name: "voice.m4a",
          type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
        } as any
      );

      const url = `${AI_WORKER_URL}/transcribe`;

      // ✅ A-3 abort
      const abort = new AbortController();
      netAbortRef.current = abort;

      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          body: form,
          signal: abort.signal,
        },
        { timeoutMs: 45_000, retries: 2, tag: "transcribe" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const msg =
          clean(data?.error) || clean(data?.message) || clean(out.textBody) || `Transcription failed (${out.status})`;
        Alert.alert("Transcribe failed", msg);
        setTranscribing(false);
        return;
      }

      const text = clean(data?.text);
      if (!text) {
        Alert.alert("No text", "AI haikupata maneno. Jaribu tena ukikaribia mic.");
        setTranscribing(false);
        return;
      }

      setInput((prev) => (clean(prev) ? `${clean(prev)}\n${text}` : text));
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (e: any) {
      Alert.alert("Transcribe error", clean(e?.message) || "Unknown transcribe error");
    } finally {
      setTranscribing(false);
      netAbortRef.current = null;
    }
  }, [recording]);

  const toggleMic = useCallback(() => {
    if (!aiEnabled) {
      openAiGate("AI imezimwa kwenye LITE. Upgrade ili kutumia mic/voice.");
      return;
    }
    if (recordingOn) {
      void stopRecordingAndTranscribe();
      return;
    }
    void startRecording();
  }, [aiEnabled, openAiGate, recordingOn, startRecording, stopRecordingAndTranscribe]);

  /**
   ✅ Worker: /v1/chat
   */
  const callWorkerChat = useCallback(
    async (text: string, history: ReqMsg[], signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

      const payload = {
        text,
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
      };

      const url = `${AI_WORKER_URL}/v1/chat`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal,
        },
        { timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES, tag: "chat" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body
          ? `Chat request failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
          : `Chat request failed (${out.status})\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      if (!data?.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body ? `Chat failed\n${safeClip(body)}\n\n[debug] url=${url}` : `Chat failed\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      return {
        text: clean(data?.reply) || "No response",
        meta: data?.meta ?? null,
      };
    },
    [
      mode,
      org.activeOrgId,
      org.activeOrgName,
      org.activeRole,
      org.activeStoreId,
      org.activeStoreName,
      requireWorkerUrlOrAlert,
    ]
  );

  const callWorkerVision = useCallback(
    async (text: string, images: AttachedImage[], history: ReqMsg[], signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");
      const payload = {
        message: text,
        images: images.map((x) => x.dataUrl),
        meta: {
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
        },
      };

      const url = `${AI_WORKER_URL}/vision`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal,
        },
        { timeoutMs: 40_000, retries: 2, tag: "vision" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body
          ? `Vision request failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
          : `Vision request failed (${out.status})\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      return {
        text: clean(data?.reply) || "No response",
        meta: data?.meta ?? null,
      };
    },
    [
      mode,
      org.activeOrgId,
      org.activeOrgName,
      org.activeRole,
      org.activeStoreId,
      org.activeStoreName,
      requireWorkerUrlOrAlert,
    ]
  );

  const callWorkerImageGenerate = useCallback(
    async (prompt: string, signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

      const url = `${AI_WORKER_URL}/image`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ prompt }),
          signal,
        },
        { timeoutMs: 60_000, retries: 2, tag: "image" }
      );

      const data: any = out.data;

      if (!out.ok) {
        const body = clean(data?.error) || clean(data?.message) || clean(out.textBody);
        const msg = body
          ? `Image generation failed (${out.status})\n${safeClip(body)}\n\n[debug] url=${url}`
          : `Image generation failed (${out.status})\n\n[debug] url=${url}`;
        throw new Error(msg);
      }

      const urlRaw = clean(data?.url);
      const imgUrl = normalizeImageUrl(urlRaw);
      if (!imgUrl) throw new Error("No image URL returned");
      return imgUrl;
    },
    [requireWorkerUrlOrAlert]
  );

  /**
✅ Quick chips (will live inside + menu now)
*/
  const quickChips = useMemo(
    () => [
      { k: "sales", label: "Sales", icon: "trending-up", prompt: "Nipe mikakati 10 ya kuongeza mauzo wiki hii." },
      { k: "stock", label: "Stock", icon: "cube", prompt: "Nisaidie kupunguza dead stock na kuongeza turnover." },
      { k: "pricing", label: "Pricing", icon: "pricetag", prompt: "Nipe strategy ya bei (pricing) ya bidhaa zangu." },
      { k: "marketing", label: "Marketing", icon: "megaphone", prompt: "Nipe plan ya marketing ya siku 7 kwa store yangu." },
      { k: "staff", label: "Staff", icon: "people", prompt: "Nipe mfumo wa kusimamia wafanyakazi na KPI za kila wiki." },
      { k: "reports", label: "Reports", icon: "bar-chart", prompt: "Ni report gani 5 za lazima kwa biashara ya retail?" },
    ],
    []
  );

  const applyChipPrompt = useCallback(
    (p: string) => {
      if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kutumia AI prompts.")) return;

      const t = clean(p);
      if (!t) return;
      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setPlusOpen(false);
      setInput(t);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [requireAi]
  );

  /**
✅ A-1: Load tasks from DB (org-level)
*/
  const loadTasks = useCallback(async () => {
    const orgId = clean(org.activeOrgId);
    if (!orgId) {
      setTasks([]);
      setTasksError("No org selected.");
      return;
    }

    setTasksLoading(true);
    setTasksError("");

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,organization_id,store_id,title,steps,priority,eta,status,created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        setTasks([]);
        setTasksError(clean(error.message) || "Failed to load tasks");
        return;
      }

      const rows = (data as any[] | null) ?? [];
      setTasks(
        rows.map((r) => ({
          id: String(r.id),
          organization_id: String(r.organization_id),
          store_id: r.store_id ? String(r.store_id) : null,
          title: clean(r.title),
          steps: Array.isArray(r.steps) ? (r.steps as string[]) : null,
          priority: r.priority ?? null,
          eta: r.eta ?? null,
          status: r.status ?? null,
          created_at: String(r.created_at || ""),
        }))
      );
    } catch (e: any) {
      setTasks([]);
      setTasksError(clean(e?.message) || "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  }, [org.activeOrgId]);

  /**
✅ A-3: Stop generating (network + typing)
*/
  const stopGenerating = useCallback(() => {
    // invalidate token so stale responses don't patch UI
    activeReqTokenRef.current = `STOP_${uid()}`;

    // abort typing animation + dots
    stopTyping();
    stopTypingDots();

    // abort network
    try {
      netAbortRef.current?.abort();
    } catch {}
    netAbortRef.current = null;

    setThinking(false);
  }, [stopTyping, stopTypingDots]);

  /**
✅ MAIN SEND
*/
  const send = useCallback(async () => {
    if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kuendelea.")) return;

    const text = clean(input);
    if (!text || thinking) return;

    setRetryCard({ visible: false, label: "", payload: null });
    lastPayloadRef.current = null;

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
    stopTypingDots();

    // ✅ A-2 token for this request
    const reqToken = makeReqToken();
    activeReqTokenRef.current = reqToken;

    // ✅ A-3 abort controller for this request
    const abort = new AbortController();
    netAbortRef.current = abort;

    const imagesToSend = attachedImages;
    setAttachedImages([]);

    // ✅ A-4: include thumbnails on user message
    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      text,
      ts: Date.now(),
      images: imagesToSend.length ? imagesToSend.map((x) => ({ id: x.id, uri: x.uri })) : null,
    };

    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    scrollToEndSoon();
    startTypingDots(botId);

    try {
      // ✅ A-2: if stopped, ignore
      if (reqToken !== activeReqTokenRef.current) return;

      if (imagesToSend.length > 0) {
        const payload: RetryPayload = { kind: "vision", text, history, images: imagesToSend };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const res = await callWorkerVision(text, imagesToSend, history, abort.signal);

        // ✅ A-2: stale ignore
        if (reqToken !== activeReqTokenRef.current) return;

        const packed = packAssistantText({
          text: res.text,
          actions: (res as any)?.meta?.actions ?? [],
          footerNote: "",
        });

        await typeOutChatGPTLike(botId, packed || sanitizeAssistantText(res.text), reqToken);
        return;
      }

      const imgIntent = detectImageIntent(text);
      if (imgIntent.isImage) {
        const p = clean(imgIntent.prompt) || text;

        const payload: RetryPayload = { kind: "image", prompt: p };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const url = await callWorkerImageGenerate(p, abort.signal);

        // ✅ A-2: stale ignore
        if (reqToken !== activeReqTokenRef.current) return;

        const reply = isDataImageUrl(url)
          ? `✅ Image generated\n\n![ZETRA Image](${url})`
          : `✅ Image generated\n\n![ZETRA Image](${url})\n\nLink: ${url}`;

        await typeOutChatGPTLike(botId, reply, reqToken);
        return;
      }

      const payload: RetryPayload = { kind: "chat", text, history };
      lastPayloadRef.current = payload;
      setRetryCard({ visible: false, label: "", payload });

      const res = await callWorkerChat(text, history, abort.signal);

      // ✅ A-2: stale ignore
      if (reqToken !== activeReqTokenRef.current) return;

      let footerNote = "";
      const resMeta: any = (res as any)?.meta ?? null;

      // Tasks saving is still gated by proActive (your current “AI enabled” flag).
      if (proActive && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: resMeta.actions as ActionItem[],
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
        text: res.text,
        actions: resMeta?.actions ?? [],
        footerNote,
      });

      await typeOutChatGPTLike(botId, packed || sanitizeAssistantText(res.text), reqToken);
    } catch (e: any) {
      stopTypingDots();

      const msg = clean(e?.message);

      // ✅ A-3: if aborted, show clean stopped message (not scary errors)
      const isAbort =
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("canceled") ||
        msg.toLowerCase().includes("cancelled");

      if (reqToken !== activeReqTokenRef.current) return;

      patchMessageText(
        botId,
        isAbort
          ? "⛔ Umesimamisha AI.\n\nUkihitaji, tuma tena ujumbe."
          : "Samahani — kuna hitilafu kidogo.\n" +
              (e?.message ? `\nError: ${String(e.message)}` : "") +
              `\n\n[debug] EXPO_PUBLIC_AI_WORKER_URL(base) = ${AI_WORKER_URL || "EMPTY"}`
      );

      const last = lastPayloadRef.current;
      if (last && !isAbort) {
        setRetryCard({
          visible: true,
          label: "Network issue — Retry",
          payload: last,
        });
      }
    } finally {
      netAbortRef.current = null;
      setThinking(false);
      scrollToEndSoon();
    }
  }, [
    attachedImages,
    buildHistory,
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    input,
    org.activeOrgId,
    org.activeStoreId,
    patchMessageText,
    proActive,
    requireAi,
    scrollToEndSoon,
    startTypingDots,
    stopTyping,
    stopTypingDots,
    thinking,
    typeOutChatGPTLike,
  ]);

  /**
✅ Retry handler
*/
  const retryLast = useCallback(async () => {
    if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kuendelea.")) return;

    const p = retryCard.payload;
    if (!p || thinking) return;

    setRetryCard({ visible: false, label: "", payload: p });
    lastPayloadRef.current = p;

    // ✅ A-2 token for retry
    const reqToken = makeReqToken();
    activeReqTokenRef.current = reqToken;

    // ✅ A-3 abort controller for retry
    const abort = new AbortController();
    netAbortRef.current = abort;

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      ts: Date.now(),
      text: p.kind === "image" ? `[Retry Image] ${p.prompt}` : `[Retry] ${p.kind.toUpperCase()}`,
    };

    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

    setThinking(true);
    stopTyping();
    stopTypingDots();

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    scrollToEndSoon();
    startTypingDots(botId);

    try {
      if (p.kind === "image") {
        const url = await callWorkerImageGenerate(p.prompt, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const reply = isDataImageUrl(url)
          ? `✅ Image generated\n\n![ZETRA Image](${url})`
          : `✅ Image generated\n\n![ZETRA Image](${url})\n\nLink: ${url}`;
        await typeOutChatGPTLike(botId, reply, reqToken);
        return;
      }

      if (p.kind === "vision") {
        const res = await callWorkerVision(p.text, p.images, p.history, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const packed = packAssistantText({
          text: res.text,
          actions: (res as any)?.meta?.actions ?? [],
          footerNote: "",
        });
        await typeOutChatGPTLike(botId, packed || sanitizeAssistantText(res.text), reqToken);
        return;
      }

      const res = await callWorkerChat(p.text, p.history, abort.signal);

      if (reqToken !== activeReqTokenRef.current) return;

      let footerNote = "";
      const resMeta: any = (res as any)?.meta ?? null;

      if (proActive && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: resMeta.actions as ActionItem[],
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
        text: res.text,
        actions: resMeta?.actions ?? [],
        footerNote,
      });

      await typeOutChatGPTLike(botId, packed || sanitizeAssistantText(res.text), reqToken);
    } catch (e: any) {
      stopTypingDots();

      const msg = clean(e?.message);
      const isAbort =
        msg.toLowerCase().includes("aborted") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("canceled") ||
        msg.toLowerCase().includes("cancelled");

      if (reqToken !== activeReqTokenRef.current) return;

      patchMessageText(
        botId,
        isAbort
          ? "⛔ Retry imesimamishwa.\n\nUkihitaji, bonyeza Retry tena."
          : "Samahani — retry imegoma.\n" + (e?.message ? `\nError: ${String(e.message)}` : "") + "\n\nJaribu tena."
      );

      if (!isAbort) {
        setRetryCard({ visible: true, label: "Retry failed — Try again", payload: p });
      }
      lastPayloadRef.current = p;
    } finally {
      netAbortRef.current = null;
      setThinking(false);
      scrollToEndSoon();
    }
  }, [
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    org.activeOrgId,
    org.activeStoreId,
    patchMessageText,
    proActive,
    requireAi,
    retryCard.payload,
    scrollToEndSoon,
    startTypingDots,
    stopTyping,
    stopTypingDots,
    thinking,
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
          borderColor: active ? C.emeraldBorder : "rgba(255,255,255,0.12)",
          backgroundColor: active ? C.emeraldSoft : "rgba(255,255,255,0.06)",
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

  /**
   * ✅ TopBar simplified (chips moved into + menu)
   */
  const TopBar = (
    <View
      style={{
        paddingTop: topPad,
        paddingBottom: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
        backgroundColor: C.background,
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

        {proActive ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              height: 34,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: C.emeraldBorder,
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
        ) : (
          <Pressable
            onPress={() => openAiGate("AI imezimwa kwenye LITE. Upgrade ili kuifungua.")}
            hitSlop={10}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              height: 34,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
            })}
          >
            <Ionicons name="lock-closed-outline" size={14} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>LOCKED</Text>
          </Pressable>
        )}

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
            stopGenerating();
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
            setAttachedImages([]);
            setRetryCard({ visible: false, label: "", payload: null });
            lastPayloadRef.current = null;
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

      {/* ✅ Inline banner when AI is locked */}
      {!aiEnabled ? (
        <Pressable
          onPress={() => openAiGate("AI imezimwa kwenye LITE. Upgrade ili kuifungua.")}
          style={({ pressed }) => ({
            marginTop: 10,
            borderWidth: 1,
            borderColor: "rgba(245,158,11,0.30)",
            backgroundColor: pressed ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.10)",
            borderRadius: 18,
            paddingVertical: 10,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          })}
        >
          <Ionicons name="lock-closed-outline" size={16} color={UI.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>AI Locked (LITE)</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              AI haipatikani kwenye kifurushi cha LITE — bonyeza ku-upgrade.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={UI.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  /**
   * ✅ Renderer (IMMERSIVE WIDTH)
   * - Shows A-4 thumbnails for user messages (no AiMessageBubble changes)
   */
  const renderMsg = useCallback(({ item }: { item: ChatMsg }) => {
    const isUser = item.role === "user";
    const imgs = Array.isArray(item.images) ? item.images : [];
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        {isUser && imgs.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {imgs.map((x) => (
              <Pressable
                key={x.id}
                onPress={() => setImgPreview({ open: true, uri: x.uri })}
                style={({ pressed }) => ({
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Image source={{ uri: x.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        ) : null}

        <AiMessageBubble role={isUser ? "user" : "assistant"} text={item.text} />
      </View>
    );
  }, []);

  /**
   * ✅ Retry card
   */
  const RetryBanner = useMemo(() => {
    if (!retryCard.visible || !retryCard.payload) return null;
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Pressable
          onPress={() => void retryLast()}
          hitSlop={10}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: "rgba(245,158,11,0.45)",
            backgroundColor: pressed ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.10)",
            borderRadius: 18,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <Ionicons name="refresh" size={18} color={UI.text} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>{retryCard.label || "Retry"}</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
                Bonyeza kuretry request ya mwisho.
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={UI.muted} />
        </Pressable>
      </View>
    );
  }, [retryCard.label, retryCard.payload, retryCard.visible, retryLast]);

  /**
   * ✅ Attached images row (composer)
   */
  const AttachRow = useMemo(() => {
    if (!attachedImages.length) return null;

    return (
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {attachedImages.map((x) => (
            <View
              key={x.id}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="image" size={16} color={UI.text} />
              <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>Attached</Text>
              <Pressable
                onPress={() => removeAttachedImage(x.id)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.30)",
                })}
              >
                <Ionicons name="close" size={14} color={UI.text} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    );
  }, [attachedImages, removeAttachedImage]);

  const canSend = useMemo(() => {
    if (!aiEnabled) return false;
    if (thinking) return false;
    if (!clean(input)) return false;
    return true;
  }, [aiEnabled, input, thinking]);

  /**
   * ✅ Composer spacing (KEY FIX)
   * - Composer now goes DOWN to the bottom when keyboard is dismissed.
   * - Removed forced 10px that was pushing composer up unnecessarily.
   */
  const composerBottomPad = useMemo(() => {
    // keep safe-area only
    return Math.max(insets.bottom, 0);
  }, [insets.bottom]);

  /**
   * ✅ AI Locked Modal (LITE gate)
   */
  const AiLockedModal = (
    <Modal visible={aiGateOpen} transparent animationType="fade" onRequestClose={() => setAiGateOpen(false)}>
      <Pressable
        onPress={() => setAiGateOpen(false)}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 18 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.background,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(245,158,11,0.35)",
                  backgroundColor: "rgba(245,158,11,0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="lock-closed-outline" size={20} color={UI.text} />
              </View>
              <View>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Upgrade Required</Text>
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }}>AI imezimwa (LITE)</Text>
              </View>
            </View>

            <Pressable
              onPress={() => setAiGateOpen(false)}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Ionicons name="close" size={18} color={UI.text} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: UI.text, fontWeight: "900" }}>AI haipatikani kwenye kifurushi cha LITE.</Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
              {aiGateReason ||
                "Kwenye LITE: Organization 1 • Store 1 • Staff 3 • Club posts 50 • AI Disabled.\n\nIli kutumia ZETRA AI, tafadhali upgrade plan."}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => {
                setAiGateOpen(false);
                router.push("/settings/subscription");
              }}
              style={({ pressed }) => ({
                flex: 1,
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.45)",
                backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
              })}
            >
              <Ionicons name="sparkles" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Upgrade Plan</Text>
            </Pressable>

            <Pressable
              onPress={() => setAiGateOpen(false)}
              style={({ pressed }) => ({
                width: 110,
                height: 46,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  /**
   * ✅ + Menu (ChatGPT-like)
   */
  const PlusMenu = (
    <Modal visible={plusOpen} transparent animationType="fade" onRequestClose={() => setPlusOpen(false)}>
      <Pressable
        onPress={() => setPlusOpen(false)}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            padding: 14,
            paddingBottom: Math.max(insets.bottom, 10) + 14,
            maxHeight: "86%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Menu</Text>
            <Pressable
              onPress={() => setPlusOpen(false)}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Ionicons name="close" size={18} color={UI.text} />
            </Pressable>
          </View>

          {/* Language */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>AI Language</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <ModePill k="AUTO" label="Auto" />
              <ModePill k="SW" label="Swahili" />
              <ModePill k="EN" label="English" />
            </View>
          </View>

          {/* Quick prompts */}
          <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}>
            <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Quick prompts</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {quickChips.map((c) => (
                <Pressable
                  key={c.k}
                  onPress={() => applyChipPrompt(c.prompt)}
                  disabled={!aiEnabled}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    height: 36,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Ionicons name={c.icon as any} size={14} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Tasks */}
          <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}>
            <Pressable
              onPress={() => {
                if (!requireAi("AI imezimwa kwenye LITE. Upgrade ili kufungua Tasks panel.")) return;
                setPlusOpen(false);
                Keyboard.dismiss();
                setTasksOpen(true);
                void loadTasks();
              }}
              disabled={!aiEnabled}
              hitSlop={10}
              style={({ pressed }) => ({
                height: 48,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.45)",
                backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
              })}
            >
              <Ionicons name="checkbox-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Open Tasks</Text>
            </Pressable>
          </View>

          {!aiEnabled ? (
            <Pressable
              onPress={() => {
                setPlusOpen(false);
                openAiGate("AI imezimwa kwenye LITE. Upgrade ili kuifungua.");
              }}
              style={({ pressed }) => ({
                marginTop: 14,
                height: 48,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.35)",
                backgroundColor: pressed ? "rgba(245,158,11,0.16)" : "rgba(245,158,11,0.10)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
              })}
            >
              <Ionicons name="lock-closed-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>AI Locked — Upgrade</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

  /**
   * ✅ Composer
   */
  const Composer = (
    <View
      style={{
        paddingHorizontal: 14,
        paddingBottom: composerBottomPad,
        paddingTop: 10,
        backgroundColor: "transparent",
        opacity: aiEnabled ? 1 : 0.72,
      }}
    >
      {AttachRow}

      <View
        style={{
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(12,16,22,0.92)",
          borderRadius: 18,
          padding: 10,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* ✅ NEW: + menu (ChatGPT-like) */}
            <Pressable
              onPress={() => {
                if (!aiEnabled) {
                  openAiGate("AI imezimwa kwenye LITE. Upgrade ili kuendelea.");
                  return;
                }
                Keyboard.dismiss();
                setPlusOpen(true);
              }}
              disabled={!aiEnabled}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="add" size={20} color={UI.text} />
            </Pressable>

            <Pressable
              onPress={() => void pickAndAttachImage()}
              disabled={!aiEnabled}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name="image-outline" size={18} color={UI.text} />
            </Pressable>

            <Pressable
              onPress={toggleMic}
              disabled={!aiEnabled}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: recordingOn ? C.emeraldBorder : "rgba(255,255,255,0.12)",
                backgroundColor: recordingOn
                  ? "rgba(16,185,129,0.16)"
                  : pressed
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
              })}
            >
              <Ionicons name={recordingOn ? "mic" : "mic-outline"} size={18} color={UI.text} />
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={aiEnabled ? (transcribing ? "Transcribing..." : "Andika ujumbe...") : "AI imezimwa (LITE) — upgrade ili kutumia"}
              placeholderTextColor={UI.faint}
              multiline
              maxLength={INPUT_MAX}
              editable={aiEnabled}
              style={{
                minHeight: 40,
                maxHeight: 130,
                color: UI.text,
                fontWeight: "800",
                paddingHorizontal: 12,
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
              keyboardAppearance="dark"
              autoCorrect
              autoCapitalize="sentences"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {}}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
                {clean(input).length}/{INPUT_MAX.toLocaleString()}
              </Text>
              {thinking ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator />
                  <Text style={{ color: UI.muted, fontWeight: "900" }}>AI...</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => void send()}
            disabled={!canSend}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: canSend ? C.emeraldBorder : "rgba(255,255,255,0.12)",
              backgroundColor: canSend ? C.emeraldSoft : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              opacity: !canSend ? 0.55 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Ionicons name="send" size={18} color={UI.text} />
          </Pressable>
        </View>

        {/* ✅ Stop button near composer */}
        {thinking ? (
          <View style={{ marginTop: 10 }}>
            <Pressable
              onPress={stopGenerating}
              style={({ pressed }) => ({
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.35)",
                backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
              })}
            >
              <Ionicons name="stop-circle-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>STOP GENERATING</Text>
            </Pressable>
          </View>
        ) : !aiEnabled ? (
          <View style={{ marginTop: 10 }}>
            <Pressable
              onPress={() => openAiGate("AI imezimwa kwenye LITE. Upgrade ili kuifungua.")}
              style={({ pressed }) => ({
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.35)",
                backgroundColor: pressed ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
              })}
            >
              <Ionicons name="lock-closed-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>UPGRADE TO USE AI</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );

  /**
   * ✅ Tasks Panel (modal) — A-1 Real list
   */
  const TasksModal = (
    <Modal visible={tasksOpen} transparent animationType="fade" onRequestClose={() => setTasksOpen(false)}>
      <Pressable
        onPress={() => setTasksOpen(false)}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.60)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            padding: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 14,
            maxHeight: "86%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>Tasks</Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => void loadTasks()}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Ionicons name="refresh" size={18} color={UI.text} />
              </Pressable>

              <Pressable
                onPress={() => setTasksOpen(false)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Ionicons name="close" size={18} color={UI.text} />
              </Pressable>
            </View>
          </View>

          <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
            Org: {org.activeOrgName ?? "—"} • Showing latest tasks saved by AI (PRO) & manual.
          </Text>

          {tasksLoading ? (
            <View style={{ paddingTop: 16, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>Loading tasks...</Text>
            </View>
          ) : tasksError ? (
            <Card style={{ marginTop: 12, padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>Could not load tasks</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>{tasksError}</Text>
              <Pressable
                onPress={() => void loadTasks()}
                style={({ pressed }) => ({
                  marginTop: 12,
                  height: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.45)",
                  backgroundColor: pressed ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: UI.text, fontWeight: "900" }}>Retry</Text>
              </Pressable>
            </Card>
          ) : tasks.length === 0 ? (
            <Card style={{ marginTop: 12, padding: 14, borderRadius: 18 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>No tasks yet</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6 }}>
                Ukiona “✅ Saved to Tasks: N” chini ya jibu la AI — itatokea hapa.
              </Text>
            </Card>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(t) => t.id}
              style={{ marginTop: 12 }}
              refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={() => void loadTasks()} />}
              renderItem={({ item }) => {
                const pr = item.priority ? String(item.priority) : "—";
                const st = item.status ? String(item.status) : "—";
                const eta = item.eta ? String(item.eta) : "";
                const steps = Array.isArray(item.steps) ? item.steps : [];
                return (
                  <Card style={{ padding: 14, borderRadius: 18, marginBottom: 10 }}>
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{item.title || "Untitled"}</Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          height: 28,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>status: {st}</Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          height: 28,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.12)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>priority: {pr}</Text>
                      </View>

                      {eta ? (
                        <View
                          style={{
                            paddingHorizontal: 10,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.25)",
                            backgroundColor: "rgba(16,185,129,0.10)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: UI.muted, fontWeight: "900", fontSize: 12 }}>eta: {eta}</Text>
                        </View>
                      ) : null}
                    </View>

                    {steps.length ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 6 }}>Steps</Text>
                        {steps.slice(0, 6).map((s, idx) => (
                          <Text key={`${item.id}_s_${idx}`} style={{ color: UI.muted, fontWeight: "800", marginTop: 4 }}>
                            • {clean(s)}
                          </Text>
                        ))}
                        {steps.length > 6 ? (
                          <Text style={{ color: UI.faint, fontWeight: "800", marginTop: 6 }}>
                            +{steps.length - 6} more...
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Card>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ✅ A-4 fullscreen image preview
  const ImagePreviewModal = (
    <Modal
      visible={imgPreview.open}
      transparent
      animationType="fade"
      onRequestClose={() => setImgPreview({ open: false, uri: "" })}
    >
      <Pressable
        onPress={() => setImgPreview({ open: false, uri: "" })}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" }}
      >
        <Pressable onPress={() => {}} style={{ width: "92%", aspectRatio: 1, borderRadius: 18, overflow: "hidden" }}>
          <Image source={{ uri: imgPreview.uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        </Pressable>
        <View style={{ position: "absolute", top: Math.max(insets.top, 12) + 12, right: 16 }}>
          <Pressable
            onPress={() => setImgPreview({ open: false, uri: "" })}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
              backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="close" size={22} color={UI.text} />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: C.background }}>
        {TopBar}

        {/* ✅ KEYBOARD FIX ZONE: Chat area + Composer move together */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={{ flex: 1 }}>
            {RetryBanner}

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderMsg}
              inverted
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: 10,
                paddingBottom: 10,
              }}
            />

            {Composer}
          </View>
        </KeyboardAvoidingView>

        {TasksModal}
        {ImagePreviewModal}
        {PlusMenu}
        {AiLockedModal}

        {/* ✅ Tool sheet kept for future expansion (not used yet) */}
        {toolOpen ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                opacity: overlayOpacity,
                backgroundColor: "#000",
              }}
            />
            <Pressable style={{ flex: 1 }} onPress={closeTool} />
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: sheetHeight,
                transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
                backgroundColor: C.background,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                padding: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: UI.text, fontWeight: "900" }}>{toolKey || "Tool"}</Text>
                <Pressable
                  onPress={closeTool}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Ionicons name="close" size={18} color={UI.text} />
                </Pressable>
              </View>

              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 10 }}>
                Tool sheet placeholder — tutaijaza baadae (Analyze/Research/Image/Agent).
              </Text>

              {toolKey === "IMAGE" ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: UI.text, fontWeight: "900" }}>Image Prompt</Text>
                  <TextInput
                    value={imagePrompt}
                    onChangeText={setImagePrompt}
                    placeholder="Write an image prompt..."
                    placeholderTextColor={UI.faint}
                    style={{
                      marginTop: 10,
                      color: UI.text,
                      fontWeight: "800",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 44,
                    }}
                  />
                </View>
              ) : null}
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}