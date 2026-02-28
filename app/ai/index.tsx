import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
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
✅ Robust fetch (Timeout + Retry + Better Error Body)
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

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(t);

      const { json, text } = await readJsonOrText(res);

      if (res.ok) {
        return {
          status: res.status,
          ok: true,
          data: json ?? (clean(text) ? { raw: text } : null),
          textBody: text,
        };
      }

      const bodyStr = clean(json?.error) || clean(json?.message) || safeClip(text);
      const shouldRetry = RETRYABLE_STATUS.has(res.status);

      if (!shouldRetry || attempt >= retries) {
        return { status: res.status, ok: false, data: json, textBody: bodyStr || text };
      }

      const backoff = 350 * (attempt + 1);
      await sleep(backoff);
      continue;
    } catch (e: any) {
      clearTimeout(t);
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
          ? `${tag} timeout after ${Math.round(timeoutMs / 1000)}s`
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

type AttachedImage = {
  id: string;
  uri: string;
  dataUrl: string; // "data:image/jpeg;base64,..."
};

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

export default function AiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();

  const topPad = Math.max(insets.top, 10) + 8;

  // ✅ KEYBOARD: real height so composer moves above keyboard (Android + iOS)
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const subShow = Keyboard.addListener("keyboardDidShow", (e: any) => {
      setKeyboardOpen(true);
      const h = Number(e?.endCoordinates?.height ?? 0);
      setKeyboardHeight(h > 0 ? h : 0);
    });
    const subHide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const safeBottomClosed = Math.max(insets.bottom, 10) + 10;

  // ✅ This is the magic: composer moves UP exactly above keyboard
  const composerBottom = useMemo(() => {
    if (!keyboardOpen) return safeBottomClosed;
    const kb = Math.max(0, keyboardHeight);
    return kb + Math.max(insets.bottom, 10) + 6;
  }, [keyboardOpen, keyboardHeight, insets.bottom, safeBottomClosed]);

  const [mode, setMode] = useState<AiMode>("AUTO");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const [proActive, setProActive] = useState(false);

  // ✅ Tools bottom sheet
  const [toolOpen, setToolOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>(null);

  // ✅ In-screen Tasks panel
  const [tasksOpen, setTasksOpen] = useState(false);

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
    async (msgId: string, fullText: string) => {
      stopTyping();
      stopTypingDots();
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
    const chronological = [...messages].reverse();
    const cleanedMsgs = chronological.filter((m) => m.role === "user" || m.role === "assistant");
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

      const mime = asset.mimeType || "image/jpeg";
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
  }, []);

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const startRecording = useCallback(async () => {
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
  }, [requireWorkerUrlOrAlert]);

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

      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          body: form,
        },
        { timeoutMs: 45_000, retries: 2, tag: "transcribe" }
      );

      const data = out.data;

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
    }
  }, [recording]);

  const toggleMic = useCallback(() => {
    if (recordingOn) {
      void stopRecordingAndTranscribe();
      return;
    }
    void startRecording();
  }, [recordingOn, startRecording, stopRecordingAndTranscribe]);

  /**
   ✅ Worker: /v1/chat
   */
  const callWorkerChat = useCallback(
    async (text: string, history: ReqMsg[]) => {
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
        },
        { timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES, tag: "chat" }
      );

      const data = out.data;

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
    async (text: string, images: AttachedImage[], history: ReqMsg[]) => {
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
        },
        { timeoutMs: 40_000, retries: 2, tag: "vision" }
      );

      const data = out.data;

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
    async (prompt: string) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

      const url = `${AI_WORKER_URL}/image`;
      const out = await fetchJsonWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ prompt }),
        },
        { timeoutMs: 60_000, retries: 2, tag: "image" }
      );

      const data = out.data;

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
✅ Quick chips (Copilot feel)
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

  const applyChipPrompt = useCallback((p: string) => {
    const t = clean(p);
    if (!t) return;
    setRetryCard({ visible: false, label: "", payload: null });
    lastPayloadRef.current = null;
    setInput(t);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /**
✅ Chips visibility (NOW: hides while keyboard open / typing)
*/
  const showChips = useMemo(() => {
    if (thinking) return false;
    if (keyboardOpen) return false;
    if (clean(input)) return false;
    if (toolOpen || tasksOpen) return false;
    return true;
  }, [input, keyboardOpen, thinking, toolOpen, tasksOpen]);

  /**
✅ MAIN SEND
*/
  const send = useCallback(async () => {
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

    const userMsg: ChatMsg = { id: uid(), role: "user", text, ts: Date.now() };
    const botId = uid();

    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

    const imagesToSend = attachedImages;
    setAttachedImages([]);

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    scrollToEndSoon();

    startTypingDots(botId);

    try {
      if (imagesToSend.length > 0) {
        const payload: RetryPayload = { kind: "vision", text, history, images: imagesToSend };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const res = await callWorkerVision(text, imagesToSend, history);

        const packed = packAssistantText({
          text: res.text,
          actions: res?.meta?.actions ?? [],
          nextMove: res?.meta?.nextMove ?? "",
          footerNote: "",
        });

        await typeOutChatGPTLike(botId, packed || res.text);
        return;
      }

      const imgIntent = detectImageIntent(text);
      if (imgIntent.isImage) {
        const p = clean(imgIntent.prompt) || text;

        const payload: RetryPayload = { kind: "image", prompt: p };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const url = await callWorkerImageGenerate(p);

        const reply = isDataImageUrl(url)
          ? `✅ Image generated\n\n![ZETRA Image](${url})`
          : `✅ Image generated\n\n![ZETRA Image](${url})\n\nLink: ${url}`;

        await typeOutChatGPTLike(botId, reply);
        return;
      }

      const payload: RetryPayload = { kind: "chat", text, history };
      lastPayloadRef.current = payload;
      setRetryCard({ visible: false, label: "", payload });

      const res = await callWorkerChat(text, history);

      let footerNote = "";
      if (proActive && clean(org.activeOrgId) && Array.isArray(res?.meta?.actions) && res.meta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: res.meta.actions as ActionItem[],
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
        actions: res?.meta?.actions ?? [],
        nextMove: res?.meta?.nextMove ?? "",
        footerNote,
      });

      await typeOutChatGPTLike(botId, packed || res.text);
    } catch (e: any) {
      stopTypingDots();

      patchMessageText(
        botId,
        "Samahani — kuna hitilafu kidogo.\n" +
          (e?.message ? `\nError: ${String(e.message)}` : "") +
          `\n\n[debug] EXPO_PUBLIC_AI_WORKER_URL(base) = ${AI_WORKER_URL || "EMPTY"}`
      );

      const last = lastPayloadRef.current;
      if (last) {
        setRetryCard({
          visible: true,
          label: "Network issue — Retry",
          payload: last,
        });
      }
    } finally {
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
    const p = retryCard.payload;
    if (!p || thinking) return;

    setRetryCard({ visible: false, label: "", payload: p });
    lastPayloadRef.current = p;

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
        const url = await callWorkerImageGenerate(p.prompt);
        const reply = isDataImageUrl(url)
          ? `✅ Image generated\n\n![ZETRA Image](${url})`
          : `✅ Image generated\n\n![ZETRA Image](${url})\n\nLink: ${url}`;
        await typeOutChatGPTLike(botId, reply);
        return;
      }

      if (p.kind === "vision") {
        const res = await callWorkerVision(p.text, p.images, p.history);
        const packed = packAssistantText({
          text: res.text,
          actions: res?.meta?.actions ?? [],
          nextMove: res?.meta?.nextMove ?? "",
          footerNote: "",
        });
        await typeOutChatGPTLike(botId, packed || res.text);
        return;
      }

      const res = await callWorkerChat(p.text, p.history);

      let footerNote = "";
      if (proActive && clean(org.activeOrgId) && Array.isArray(res?.meta?.actions) && res.meta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: res.meta.actions as ActionItem[],
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
        actions: res?.meta?.actions ?? [],
        nextMove: res?.meta?.nextMove ?? "",
        footerNote,
      });

      await typeOutChatGPTLike(botId, packed || res.text);
    } catch (e: any) {
      stopTypingDots();
      patchMessageText(
        botId,
        "Samahani — retry imegoma.\n" + (e?.message ? `\nError: ${String(e.message)}` : "") + "\n\nJaribu tena."
      );
      setRetryCard({ visible: true, label: "Retry failed — Try again", payload: p });
      lastPayloadRef.current = p;
    } finally {
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

  const TasksPill = (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        setTasksOpen(true);
      }}
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
            stopTypingDots();
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

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <ModePill k="AUTO" label="Auto" />
        <ModePill k="SW" label="Swahili" />
        <ModePill k="EN" label="English" />
        {TasksPill}
      </View>
    </View>
  );

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
    if (toolKey === "IMAGE") return "Tengeneza picha kwa prompt (OpenAI Image).";
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
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="text" size={18} color={UI.text} />
                <Text style={{ color: UI.text, fontWeight: "900" }}>Use as Text</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={async () => {
                try {
                  const p = clean(imagePrompt);
                  if (!p) return;

                  const userMsg: ChatMsg = { id: uid(), role: "user", text: `[Create Image] ${p}`, ts: Date.now() };
                  const botId = uid();
                  const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

                  setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
                  closeTool();
                  scrollToEndSoon();
                  startTypingDots(botId);

                  const payload: RetryPayload = { kind: "image", prompt: p };
                  lastPayloadRef.current = payload;
                  setRetryCard({ visible: false, label: "", payload });

                  const url = await callWorkerImageGenerate(p);

                  const reply = isDataImageUrl(url)
                    ? `✅ Image generated\n\n![ZETRA Image](${url})`
                    : `✅ Image generated\n\n![ZETRA Image](${url})\n\nLink: ${url}`;

                  await typeOutChatGPTLike(botId, reply);
                } catch (e: any) {
                  stopTypingDots();
                  Alert.alert("Image error", clean(e?.message) || "Failed to generate image");
                  const payload: RetryPayload = { kind: "image", prompt: clean(imagePrompt) };
                  lastPayloadRef.current = payload;
                  setRetryCard({
                    visible: true,
                    label: "Image failed — Retry",
                    payload,
                  });
                }
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
                <Text style={{ color: UI.text, fontWeight: "900" }}>Generate</Text>
              </View>
            </Pressable>
          </View>

          <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 10 }}>
            Note: “Generate” inaenda Cloudflare Worker → OpenAI Image.
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

  // ✅ List padding now respects composerBottom (so messages never hide under keyboard/composer)
  const listTopPad = useMemo(() => {
    const composerApprox = keyboardOpen ? 98 : showChips ? 150 : 108;
    return composerBottom + composerApprox;
  }, [composerBottom, keyboardOpen, showChips]);

  const listBottomPad = 12;
  const micActive = recordingOn || transcribing;

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
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

        {/* ✅ Retry card (follows composerBottom) */}
        {retryCard.visible ? (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: composerBottom + 78,
              zIndex: 80,
            }}
          >
            <Card style={{ padding: 12, borderRadius: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="warning-outline" size={18} color={UI.text} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: UI.text, fontWeight: "900" }} numberOfLines={1}>
                    {clean(retryCard.label) || "Network issue"}
                  </Text>
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
                    Tap Retry kuendelea bila kupoteza swali.
                  </Text>
                </View>

                <Pressable
                  onPress={() => void retryLast()}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    height: 38,
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
                    <Ionicons name="refresh" size={16} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Retry</Text>
                  </View>
                </Pressable>
              </View>
            </Card>
          </View>
        ) : null}

        {/* ✅ Composer (moves above keyboard 100%) */}
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
          {showChips ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {quickChips.map((c) => (
                <Pressable
                  key={c.k}
                  onPress={() => applyChipPrompt(c.prompt)}
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
                    <Ionicons name={c.icon as any} size={14} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900" }}>{c.label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {attachedImages.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {attachedImages.map((img) => (
                <View
                  key={img.id}
                  style={{
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="image" size={16} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", maxWidth: 140 }} numberOfLines={1}>
                    Image attached
                  </Text>
                  <Pressable onPress={() => removeAttachedImage(img.id)} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color={UI.faint} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

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
            <Pressable
              onPress={pickAndAttachImage}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: pressed ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.05)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <Ionicons name="image-outline" size={18} color={UI.text} />
            </Pressable>

            <Pressable
              onPress={toggleMic}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: micActive ? UI.colors.emeraldBorder : "rgba(255,255,255,0.12)",
                backgroundColor: micActive
                  ? "rgba(16,185,129,0.18)"
                  : pressed
                  ? "rgba(255,255,255,0.09)"
                  : "rgba(255,255,255,0.05)",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              <Ionicons name={recordingOn ? "mic" : transcribing ? "hourglass" : "mic-outline"} size={18} color={UI.text} />
            </Pressable>

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

        {/* Tool sheet */}
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

            <Pressable onPress={closeTool} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />

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

        {/* Tasks panel */}
        {tasksOpen && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.85)",
              zIndex: 1000,
            }}
          >
            <Pressable style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} onPress={() => setTasksOpen(false)} />

            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: UI.colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                paddingTop: 16,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 16),
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 18, flex: 1 }}>🧠 AI Tasks</Text>

                <Pressable onPress={() => setTasksOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={UI.text} />
                </Pressable>
              </View>

              <Text style={{ color: UI.muted, fontWeight: "800", lineHeight: 22 }}>
                Hapa utaona tasks zote zilizo-save na AI (PRO only).
                {"\n\n"}
                Tip: Tasks zina-save automatically kama una PRO active.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}