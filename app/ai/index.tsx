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
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { Audio } from "expo-av";

import { useOrg } from "@/src/context/OrgContext";
import { Card } from "@/src/ui/Card";
import { Screen } from "@/src/ui/Screen";
import { UI } from "@/src/ui/theme";

import {
  getAiSubscriptionSnapshotForOrg,
  isProActiveForOrg,
} from "@/src/ai/subscription";
import { AiMessageBubble } from "@/src/components/AiMessageBubble";
import { supabase } from "@/src/supabase/supabaseClient";

type AiMode = "AUTO" | "SW" | "EN";
type ChatRole = "user" | "assistant";

type AttachedImage = {
  id: string;
  uri: string;
  dataUrl: string;
};

type ChatMsg = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
  images?: Array<{ id: string; uri: string }> | null;
  generatedImageUri?: string | null;
  imagePrompt?: string | null;
  autopilotAlerts?: AutopilotAlert[] | null;
  analysisIntent?: "ANALYSIS" | "FORECAST" | "COACH" | null;
};

type ReqMsg = { role: "user" | "assistant"; text: string };

type ActionItem = {
  title: string;
  steps?: string[];
  priority?: "LOW" | "MEDIUM" | "HIGH";
  eta?: string;
};

type ToolKey = "ANALYZE" | "IMAGE" | "RESEARCH" | "AGENT" | null;

type RetryPayload =
  | { kind: "chat"; text: string; history: ReqMsg[] }
  | { kind: "vision"; text: string; history: ReqMsg[]; images: AttachedImage[] }
  | { kind: "image"; prompt: string };

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

type AiBalanceRow = {
  plan_code?: string | null;
  ai_enabled?: boolean | null;
  credits_monthly?: number | null;
  credits_used?: number | null;
  credits_remaining?: number | null;
  period_start?: string | null;
  [k: string]: any;
};
type AutopilotAlert = {
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
};

type WorkerMeta = {
  role?: string;
  roleMeta?: any;
  analysisIntent?: "ANALYSIS" | "FORECAST" | "COACH";
  autopilotAlerts?: AutopilotAlert[];
  [k: string]: any;
};
function clean(s: any) {
  return String(s ?? "").trim();
}

function upper(s: any) {
  return clean(s).toUpperCase();
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function fmtNum(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toString();
}

function fmtChatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function buildAiContext(org: ReturnType<typeof useOrg>) {
  return {
    orgId: org.activeOrgId ?? null,
    activeOrgId: org.activeOrgId ?? null,
    orgName: org.activeOrgName ?? null,
    activeOrgName: org.activeOrgName ?? null,
    storeId: org.activeStoreId ?? null,
    activeStoreId: org.activeStoreId ?? null,
    storeName: org.activeStoreName ?? null,
    activeStoreName: org.activeStoreName ?? null,
    role: org.activeRole ?? null,
    activeRole: org.activeRole ?? null,
  };
}
const INPUT_MAX = 12_000;
const C: any = (UI as any)?.colors ?? UI;

const TYPEWRITER_MIN_CHUNK = 2;
const TYPEWRITER_MAX_CHUNK = 8;
const TYPEWRITER_BASE_DELAY = 18;
const TYPEWRITER_PUNCT_DELAY = 55;
const TYPEWRITER_LINE_DELAY = 80;
const AUTO_SCROLL_THROTTLE_MS = 120;

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

function getImageExtensionFromUri(uri: string) {
  const u = normalizeImageUrl(uri).toLowerCase();

  if (u.startsWith("data:image/png")) return "png";
  if (u.startsWith("data:image/jpeg") || u.startsWith("data:image/jpg")) return "jpg";
  if (u.startsWith("data:image/webp")) return "webp";

  if (u.includes(".png")) return "png";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "jpg";
  if (u.includes(".webp")) return "webp";

  return "png";
}

async function ensureLocalImageFile(uri: string) {
  const normalized = normalizeImageUrl(uri);
  if (!normalized) throw new Error("Image URI missing");

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error("No writable directory found");

  const ext = getImageExtensionFromUri(normalized);
  const target = `${baseDir}zetra_ai_${Date.now()}.${ext}`;

  if (normalized.startsWith("file://")) {
    return normalized;
  }

  if (normalized.startsWith("data:image/")) {
    const m = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/i);
    const b64 = clean(m?.[2]);
    if (!b64) throw new Error("Invalid base64 image data");

    await FileSystem.writeAsStringAsync(target, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return target;
  }

  if (/^https?:\/\//i.test(normalized)) {
    const out = await FileSystem.downloadAsync(normalized, target);
    return out.uri;
  }

  throw new Error("Unsupported image URI format");
}

function extractMarkdownImageUrl(raw: string) {
  const t = String(raw ?? "");
  const m = t.match(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|https?:\/\/[^)\s]+)\)/i);
  return clean(m?.[1]);
}

function stripMarkdownImageTag(raw: string) {
  const t = String(raw ?? "");
  return t
    .replace(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+|https?:\/\/[^)\s]+)\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
function isPunct(ch: string) {
  return ch === "." || ch === "!" || ch === "?" || ch === "," || ch === ";" || ch === ":";
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

  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n").trim();
}

function sanitizeAssistantText(raw: string) {
  return stripNextActionLines(raw);
}

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
function nextTypingText(step: number) {
  const dots = step % 4;
  return `AI inaandika${".".repeat(dots)}`;
}

function appendAtEnd(base: string, extra: string) {
  const a = String(base ?? "");
  const b = String(extra ?? "");
  if (!a.trim()) return b;
  if (!b.trim()) return a;
  return `${a}${b}`;
}

function getIntentLabel(intent?: "ANALYSIS" | "FORECAST" | "COACH" | null) {
  if (intent === "FORECAST") return "Forecast";
  if (intent === "COACH") return "Profit Coach";
  if (intent === "ANALYSIS") return "Analysis";
  return "Assistant";
}

function normalizeAutopilotAlerts(meta: any): AutopilotAlert[] {
  const arr = Array.isArray(meta?.autopilotAlerts) ? meta.autopilotAlerts : [];
  return arr
    .map((a: any) => ({
      level: a?.level === "critical" || a?.level === "warning" ? a.level : "info",
      title: clean(a?.title),
      message: clean(a?.message),
    }))
    .filter((a: AutopilotAlert) => a.title || a.message);
}
export default function AiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const org = useOrg();const aiContext = useMemo(() => buildAiContext(org), [
    org.activeOrgId,
    org.activeOrgName,
    org.activeStoreId,
    org.activeStoreName,
    org.activeRole,
  ]);

  const topPad = Math.max(insets.top, 10) + 8;

  const [mode, setMode] = useState<AiMode>("AUTO");
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const [proActive, setProActive] = useState(false);

  const [planCode, setPlanCode] = useState("FREE");
  const [planName, setPlanName] = useState("FREE");
  const [aiCreditsMonthly, setAiCreditsMonthly] = useState(0);
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState(0);
  const [aiCreditsUsed, setAiCreditsUsed] = useState(0);

  const [aiGateOpen, setAiGateOpen] = useState(false);
  const [aiGateReason, setAiGateReason] = useState("");

  const isOwner = org.activeRole === "owner";
  const planAllowsAi = !!proActive;
  const aiEnabled = planAllowsAi && isOwner;
  const currentPlanLabel = upper(planCode || planName || "FREE");

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const ownerOnlyReason = useMemo(() => {
    if (planAllowsAi && !isOwner) {
      return "AI ya ZETRA inaruhusiwa kwa OWNER pekee. Admin na Staff hawaruhusiwi kutumia AI.";
    }
    return "";
  }, [isOwner, planAllowsAi]);

  const defaultAiLockReason = useMemo(() => {
    if (ownerOnlyReason) return ownerOnlyReason;
    return `AI haipatikani kwenye kifurushi cha ${currentPlanLabel}.`;
  }, [currentPlanLabel, ownerOnlyReason]);

  const [toolOpen, setToolOpen] = useState(false);
  const [toolKey, setToolKey] = useState<ToolKey>(null);

  const [tasksOpen, setTasksOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [imgPreview, setImgPreview] = useState<{ open: boolean; uri: string }>({ open: false, uri: "" });
  const [autopilotCards, setAutopilotCards] = useState<AutopilotAlert[]>([]);
  const [lastAnalysisIntent, setLastAnalysisIntent] = useState<"ANALYSIS" | "FORECAST" | "COACH" | null>(null);
 

  const savePreviewImageToDevice = useCallback(async () => {
    try {
      const normalized = normalizeImageUrl(imgPreview.uri);
      if (!normalized) {
        Alert.alert("Image missing", "Hakuna picha ya ku-save.");
        return;
      }

      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission required", "Ruhusu gallery/media access ili ku-save picha.");
        return;
      }

      const localUri = await ensureLocalImageFile(normalized);
      await MediaLibrary.saveToLibraryAsync(localUri);

      Alert.alert("Saved", "Picha imehifadhiwa kwenye gallery.");
    } catch (e: any) {
      Alert.alert("Save failed", clean(e?.message) || "Imeshindikana ku-save picha.");
    }
  }, [imgPreview.uri]);

  const sharePreviewImage = useCallback(async () => {
    try {
      const normalized = normalizeImageUrl(imgPreview.uri);
      if (!normalized) {
        Alert.alert("Image missing", "Hakuna picha ya ku-share.");
        return;
      }

      const localUri = await ensureLocalImageFile(normalized);

      const canNativeShare = await Sharing.isAvailableAsync();
      if (canNativeShare) {
        await Sharing.shareAsync(localUri);
        return;
      }

      await Share.share({
        message: localUri,
      });
    } catch (e: any) {
      Alert.alert("Share failed", clean(e?.message) || "Imeshindikana ku-share picha.");
    }
  }, [imgPreview.uri]);

  const copyImagePromptFromMessage = useCallback(async (prompt: string) => {
    try {
      const value = clean(prompt);
      if (!value) {
        Alert.alert("Prompt missing", "Hakuna prompt ya kukopi.");
        return;
      }

      await Clipboard.setStringAsync(value);
      Alert.alert("Copied", "Prompt imekopiwa.");
    } catch (e: any) {
      Alert.alert("Copy failed", clean(e?.message) || "Imeshindikana kukopi prompt.");
    }
  }, []);

  


  const anim = useRef(new Animated.Value(0)).current;
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
const [recording, setRecording] = useState<Audio.Recording | null>(null);
const [recordingOn, setRecordingOn] = useState(false);
const [transcribing, setTranscribing] = useState(false);
const [recordingMs, setRecordingMs] = useState(0);
const [liveMeter, setLiveMeter] = useState(-160);
const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      ts: Date.now(),
    
        text:
  "Karibu ZETRA AI.\n\n" +
  "• Uliza maswali ya biashara (general)\n" +
  "• Nipe analysis, forecast, au profit coach ya store yako\n" +
  "• Au niambie unataka kufanya nini ndani ya ZETRA BMS, nitakuongoza hatua kwa hatua.\n\n" +
  "Tip: Andika Lugha yoyote unayotumia — nita-adapt automatically.",
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

  const activeReqTokenRef = useRef<string>("");
  const makeReqToken = () => uid();

  const netAbortRef = useRef<AbortController | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const userNearBottomRef = useRef(true);
  const autoScrollLockRef = useRef(false);
  const lastAutoScrollTsRef = useRef(0);

  const androidExtraLift = 50;

  const androidComposerLift = useMemo(() => {
    if (Platform.OS !== "android" || !keyboardVisible) return 0;
    return Math.max(0, keyboardHeight - Math.max(insets.bottom, 0) + androidExtraLift);
  }, [insets.bottom, keyboardHeight, keyboardVisible]);

  const openAiGate = useCallback((reason?: string) => {
    setAiGateReason(clean(reason) || "");
    setAiGateOpen(true);
  }, []);

  const requireAi = useCallback(
    (reason?: string) => {
      if (aiEnabled) return true;
      openAiGate(reason || defaultAiLockReason);
      return false;
    },
    [aiEnabled, defaultAiLockReason, openAiGate]
  );

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

const scrollToLatest = useCallback((animated = false, force = false) => {
    const now = Date.now();

    if (!force) {
      if (!userNearBottomRef.current) return;
      if (autoScrollLockRef.current) return;
      if (now - lastAutoScrollTsRef.current < AUTO_SCROLL_THROTTLE_MS) return;
    }

    lastAutoScrollTsRef.current = now;

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated });
      } catch {}
      scrollRafRef.current = null;
    });
  }, []);

  const useImagePromptAgainFromMessage = useCallback(
    (prompt: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

      const value = clean(prompt);
      if (!value) {
        Alert.alert("Prompt missing", "Hakuna prompt ya kutumia tena.");
        return;
      }

      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setPlusOpen(false);
      setAttachedImages([]);
      setInput(`create image: ${value}`);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    },
    [currentPlanLabel, ownerOnlyReason, requireAi, scrollToLatest]
  );

  const stopTyping = useCallback(() => {
    typingAbortRef.current.aborted = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, []);

  const patchMessageText = useCallback((id: string, nextText: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: nextText } : m)));
  }, []);
const handleListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Number(e.nativeEvent.contentOffset?.y ?? 0);

    // FlatList ni inverted, hivyo karibu na latest = offset ndogo
    userNearBottomRef.current = y <= 120;
    autoScrollLockRef.current = y > 180;
  }, []);
const typeOutChatGPTLike = useCallback(
    async (msgId: string, fullText: string, reqToken?: string) => {
      stopTyping();
      stopTypingDots();
      typingAbortRef.current = { aborted: false };

      const myToken = clean(reqToken || "");
      const txt = String(fullText ?? "");

      if (!txt.trim()) {
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;
        patchMessageText(msgId, "Samahani — AI imerudisha jibu tupu. Jaribu tena.");
        return;
      }

      if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

      patchMessageText(msgId, "");

      const L = txt.length;
      const speedFactor = L > 1800 ? 0.55 : L > 1000 ? 0.68 : L > 600 ? 0.8 : 0.92;

      let i = 0;
      let lastPainted = 0;

      const tick = () => {
        if (typingAbortRef.current.aborted) return;
        if (myToken && activeReqTokenRef.current && myToken !== activeReqTokenRef.current) return;

        const remaining = txt.length - i;
        const randomChunk =
          TYPEWRITER_MIN_CHUNK + Math.floor(Math.random() * (TYPEWRITER_MAX_CHUNK - TYPEWRITER_MIN_CHUNK + 1));

        let chunk = Math.min(randomChunk, remaining);

        // kwa message ndefu, ongeza kasi bila kufanya screen icheze-cheze
        if (remaining > 1200) chunk = Math.max(chunk, 8);
        else if (remaining > 700) chunk = Math.max(chunk, 6);
        else if (remaining > 350) chunk = Math.max(chunk, 4);

        const nextI = Math.min(txt.length, i + chunk);
        const next = txt.slice(0, nextI);
        const lastChar = next.charAt(next.length - 1);

        i = nextI;

        // punguza rerender nyingi sana
        const shouldPaint =
          i === txt.length ||
          i - lastPainted >= 6 ||
          lastChar === "\n" ||
          lastChar === "." ||
          lastChar === "!" ||
          lastChar === "?";

        if (shouldPaint) {
          patchMessageText(msgId, next);
          lastPainted = i;
          scrollToLatest(false, false);
        }

        if (i >= txt.length) {
          patchMessageText(msgId, txt);
          scrollToLatest(false, true);
          return;
        }

        let delay = TYPEWRITER_BASE_DELAY * speedFactor;

        if (lastChar === "\n") delay += TYPEWRITER_LINE_DELAY;
        else if (lastChar === "." || lastChar === "!" || lastChar === "?") delay += TYPEWRITER_PUNCT_DELAY;
        else if (isPunct(lastChar)) delay += 28;

        typingTimerRef.current = setTimeout(tick, Math.max(10, Math.floor(delay)));
      };

      typingTimerRef.current = setTimeout(tick, Math.max(10, Math.floor(TYPEWRITER_BASE_DELAY * speedFactor)));
    },
    [patchMessageText, scrollToLatest, stopTyping, stopTypingDots]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
const onShow = Keyboard.addListener(showEvent, (e: any) => {
      const h = Number(e?.endCoordinates?.height ?? 0);
      setKeyboardVisible(true);
      setKeyboardHeight(h);
      scrollToLatest(false, true);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [scrollToLatest]);

  useEffect(() => {
  return () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    typingAbortRef.current.aborted = true;
    stopTypingDots();

    try {
      netAbortRef.current?.abort();
    } catch {}
    netAbortRef.current = null;

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
  };
}, [stopTypingDots]);

useEffect(() => {
  if (!recordingOn) {
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
    setLiveMeter(-160);
    setRecordingMs(0);
    return;
  }

  if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);

  waveformTimerRef.current = setInterval(() => {
    setLiveMeter(-95 + Math.random() * 70);
    setRecordingMs((prev) => prev + 80);
  }, 80);

  return () => {
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    waveformTimerRef.current = null;
  };
}, [recordingOn]);

  const loadAiBalance = useCallback(async (): Promise<{
    ok: boolean;
    remaining: number;
    used: number;
    monthly: number;
    error: string;
  }> => {
    const orgId = clean(org.activeOrgId);
    if (!orgId) {
      setAiCreditsRemaining(0);
      setAiCreditsUsed(0);
      return {
        ok: false,
        remaining: 0,
        used: 0,
        monthly: 0,
        error: "Missing orgId",
      };
    }

    try {
      const { data, error } = await supabase.rpc("ai_get_balance", {
        p_org_id: orgId,
      });

      if (error) {
        return {
          ok: false,
          remaining: 0,
          used: 0,
          monthly: 0,
          error: clean(error.message) || "Failed to load AI balance",
        };
      }

      const row = (Array.isArray(data) ? data?.[0] : data) as AiBalanceRow | null;

      const monthly = Math.max(0, Number(row?.credits_monthly ?? 0) || 0);
      const used = Math.max(0, Number(row?.credits_used ?? 0) || 0);
      const remaining = Math.max(0, Number(row?.credits_remaining ?? 0) || 0);

      setAiCreditsMonthly(monthly);
      setAiCreditsUsed(used);
      setAiCreditsRemaining(remaining);

      return {
        ok: true,
        remaining,
        used,
        monthly,
        error: "",
      };
    } catch (e: any) {
      return {
        ok: false,
        remaining: 0,
        used: 0,
        monthly: 0,
        error: clean(e?.message) || "Failed to load AI balance",
      };
    }
  }, [org.activeOrgId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        try {
          const orgId = org.activeOrgId ?? "";
          if (!orgId) {
            if (!cancelled) {
              setProActive(false);
              setPlanCode("FREE");
              setPlanName("FREE");
              setAiCreditsMonthly(0);
              setAiCreditsRemaining(0);
              setAiCreditsUsed(0);
            }
            return;
          }

          const [ok, snap] = await Promise.all([
            isProActiveForOrg(orgId),
            getAiSubscriptionSnapshotForOrg(orgId, { forceRefresh: true }),
          ]);

          if (cancelled) return;

          setProActive(!!ok);
          setPlanCode(upper(snap?.planCode || "FREE"));
          setPlanName(clean(snap?.planName || snap?.planCode || "FREE"));
          setAiCreditsMonthly(Number(snap?.aiCreditsMonthly ?? 0) || 0);

          await loadAiBalance();
        } catch {
          if (!cancelled) {
            setProActive(false);
            setPlanCode("FREE");
            setPlanName("FREE");
            setAiCreditsMonthly(0);
            setAiCreditsRemaining(0);
            setAiCreditsUsed(0);
          }
        }
      }

      void run();
      return () => {
        cancelled = true;
      };
    }, [loadAiBalance, org.activeOrgId])
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
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia image/vision tools.`)) {
      return;
    }

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
requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    } catch (e: any) {
      Alert.alert("Error", clean(e?.message) || "Image pick error");
    }
  }, [currentPlanLabel, ownerOnlyReason, requireAi]);

  const removeAttachedImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const startRecording = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia mic/voice.`)) {
      return;
    }

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
      // live waveform handled by local timer effect

      await rec.prepareToRecordAsync({
        android: {
          extension: ".m4a",
          outputFormat: 2, // MPEG_4
          audioEncoder: 3, // AAC
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          
        },
        ios: {
          extension: ".m4a",
          audioQuality: 1,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          outputFormat: "mpeg4aac",
        
        },
        web: {},
      });

      rec.setProgressUpdateInterval(80);
      await rec.startAsync();

      setRecordingMs(0);
      setLiveMeter(-160);
      setRecording(rec);
      setRecordingOn(true);
    } catch (e: any) {
      Alert.alert("Mic error", clean(e?.message) || "Failed to start recording");
      setRecording(null);
      setRecordingMs(0);
      setLiveMeter(-160);
      setRecordingOn(false);
    }
  }, [currentPlanLabel, ownerOnlyReason, requireAi, requireWorkerUrlOrAlert]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    try {
      if (!recording) return;
setTranscribing(true);
setInput("...");
      setRecordingOn(false);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordingMs(0);
      setLiveMeter(-160);

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
         type: "audio/m4a",
        } as any
      );

      const url = `${AI_WORKER_URL}/transcribe`;

      const abort = new AbortController();
      netAbortRef.current = abort;

     const out = await fetchJsonWithRetry(
  url,
  {
    method: "POST",
    headers: {
      "x-zetra-role": clean(org.activeRole),
    },
    body: form,
    signal: abort.signal,
  },
  { timeoutMs: 20_000, retries: 0, tag: "transcribe" }
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

    setInput("");
await (async () => {
  const directText = clean(text);
  if (!directText) return;

  const history = buildHistory();
  setRetryCard({ visible: false, label: "", payload: null });
  lastPayloadRef.current = null;

  setThinking(true);
  stopTyping();
  stopTypingDots();

  const reqToken = makeReqToken();
  activeReqTokenRef.current = reqToken;

  const abortDirect = new AbortController();
  netAbortRef.current = abortDirect;

  const userMsg: ChatMsg = {
    id: uid(),
    role: "user",
    text: directText,
    ts: Date.now(),
    images: null,
  };

  const botId = uid();
  const botPlaceholder: ChatMsg = {
    id: botId,
    role: "assistant",
    ts: Date.now(),
    text: "AI inaandika",
  };

  setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
  userNearBottomRef.current = true;
  autoScrollLockRef.current = false;
  scrollToLatest(false, true);
  startTypingDots(botId);

  try {
    const payload: RetryPayload = { kind: "chat", text: directText, history };
    lastPayloadRef.current = payload;
    setRetryCard({ visible: false, label: "", payload });

    const res = await callWorkerChat(directText, history, abortDirect.signal);

    if (reqToken !== activeReqTokenRef.current) return;

    const creditResult = await consumeAiCredits(1);

    let footerNote = creditResult.ok ? "" : "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.";
    const resMeta: any = (res as any)?.meta ?? null;
    const normalizedAlerts = normalizeAutopilotAlerts(resMeta);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === botId
          ? {
              ...m,
              autopilotAlerts: normalizedAlerts,
              analysisIntent: (resMeta?.analysisIntent as any) ?? null,
            }
          : m
      )
    );

    if (aiEnabled && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) {
      const result = await createTasksFromAiActions({
        orgId: org.activeOrgId!,
        storeId: org.activeStoreId ?? null,
        actions: resMeta.actions as ActionItem[],
      });

      if (result.created > 0) {
        footerNote = footerNote
          ? `${footerNote}\n\n✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`
          : `✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`;
      } else if (result.failed > 0) {
        const taskWarn =
          "⚠️ Actions zimeshindwa ku-save kwenye Tasks.\n" +
          "Tip: Hakikisha RPC `create_task_from_ai` ipo na una role ya owner/admin.";

        footerNote = footerNote ? `${footerNote}\n\n${taskWarn}` : taskWarn;
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
    scrollToLatest(false, true);
  }
})();
     requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    } catch (e: any) {
      Alert.alert("Transcribe error", clean(e?.message) || "Unknown transcribe error");
    } finally {
      setTranscribing(false);
      netAbortRef.current = null;
    }
  }, [
  currentPlanLabel,
  org.activeRole,
  recording,
  scrollToLatest,
  startTypingDots,
  stopTyping,
  stopTypingDots,
]);

  const toggleMic = useCallback(() => {
    if (!aiEnabled) {
      openAiGate(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia mic/voice.`);
      return;
    }
    if (recordingOn) {
      void stopRecordingAndTranscribe();
      return;
    }
    void startRecording();
  }, [aiEnabled, currentPlanLabel, openAiGate, ownerOnlyReason, recordingOn, startRecording, stopRecordingAndTranscribe]);

  const callWorkerChat = useCallback(
    async (text: string, history: ReqMsg[], signal?: AbortSignal) => {
      if (!requireWorkerUrlOrAlert()) throw new Error("Worker URL missing");

   const payload = {
        text,
        mode,
        history,
        roleHint: "AUTO",
        context: aiContext,
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
      aiContext,
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
          roleHint: "AUTO",
          context: aiContext,
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
      aiContext,
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
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        body: JSON.stringify({
            prompt,
            context: aiContext,
          }),
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
    [
      aiContext,
      requireWorkerUrlOrAlert,
    ]
  );

const quickChips = useMemo(
  () => [
    { k: "sales", label: "Sales", icon: "trending-up", prompt: "Nipe mikakati 10 ya kuongeza mauzo wiki hii." },
    { k: "stock", label: "Stock", icon: "cube", prompt: "Nisaidie kupunguza dead stock na kuongeza turnover." },
    { k: "pricing", label: "Pricing", icon: "pricetag", prompt: "Nipe strategy ya bei (pricing) ya bidhaa zangu." },
    { k: "marketing", label: "Marketing", icon: "megaphone", prompt: "Nipe plan ya marketing ya siku 7 kwa store yangu." },
    { k: "staff", label: "Staff", icon: "people", prompt: "Nipe mfumo wa kusimamia wafanyakazi na KPI za kila wiki." },
    { k: "reports", label: "Reports", icon: "bar-chart", prompt: "Ni report gani 5 za lazima kwa biashara ya retail?" },
    { k: "forecast", label: "Forecast", icon: "analytics", prompt: "Nipe analysis na forecast ya biashara yangu kwa siku 7 zijazo kwa store hii." },
    { k: "coach", label: "Profit Coach", icon: "sparkles", prompt: "Nifanyie profit coach ya store hii kwa kutumia sales, cogs na expenses za leo." },
  ],
  []
);

  const focusComposer = useCallback(() => {
   requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
  }, []);

  const clearComposer = useCallback(() => {
    setInput("");
    setAttachedImages([]);
   requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
  }, []);
  const applyChipPrompt = useCallback(
    (p: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kutumia AI prompts.`)) {
        return;
      }

      const t = clean(p);
      if (!t) return;
      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setPlusOpen(false);
      setInput(t);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
    },
    [currentPlanLabel, ownerOnlyReason, requireAi]
  );

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

  const consumeAiCredits = useCallback(
    async (credits: number): Promise<{ ok: boolean; error: string }> => {
      const orgId = clean(org.activeOrgId);
      if (!orgId) return { ok: false, error: "Missing orgId" };const n = Number(credits);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: "Invalid credits amount" };
      }

      try {
        const { error } = await supabase.rpc("ai_consume_credits", {
          p_org_id: orgId,
          p_credits: n,
        });

        if (error) {
          return {
            ok: false,
            error: clean(error.message) || "Failed to consume AI credits",
          };
        }

        await loadAiBalance();

        return { ok: true, error: "" };
      } catch (e: any) {
        return {
          ok: false,
          error: clean(e?.message) || "Failed to consume AI credits",
        };
      }
    },
    [loadAiBalance, org.activeOrgId]
  );

  const stopGenerating = useCallback(() => {
    activeReqTokenRef.current = `STOP_${uid()}`;
    stopTyping();
    stopTypingDots();

    try {
      netAbortRef.current?.abort();
    } catch {}
    netAbortRef.current = null;

    setThinking(false);
  }, [stopTyping, stopTypingDots]);

  const regenerateImageFromMessage = useCallback(
    async (prompt: string) => {
      if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

      const p = clean(prompt);
      if (!p || thinking) return;

      setRetryCard({ visible: false, label: "", payload: null });
      lastPayloadRef.current = null;
      setInput("");
      setAttachedImages([]);
      setThinking(true);

      stopTyping();
      stopTypingDots();

      const reqToken = makeReqToken();
      activeReqTokenRef.current = reqToken;

      const abort = new AbortController();
      netAbortRef.current = abort;

      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        text: `create image: ${p}`,
        ts: Date.now(),
        images: null,
      };

      const botId = uid();
      const botPlaceholder: ChatMsg = {
        id: botId,
        role: "assistant",
        ts: Date.now(),
        text: "AI inaandika",
      };

      setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
      userNearBottomRef.current = true;
      autoScrollLockRef.current = false;
      scrollToLatest(false, true);
      startTypingDots(botId);

      try {
        const payload: RetryPayload = { kind: "image", prompt: p };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const url = await callWorkerImageGenerate(p, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
          ? "✅ Image generated"
          : "✅ Image generated\n\n⚠️ AI image imetoka lakini credit deduction imeshindikana.";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  generatedImageUri: url,
                  imagePrompt: p,
                }
              : m
          )
        );

        await typeOutChatGPTLike(botId, reply, reqToken);
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
        scrollToLatest(false, true);
      }
    },
    [
      callWorkerImageGenerate,
      consumeAiCredits,
      currentPlanLabel,
      ownerOnlyReason,
      patchMessageText,
      requireAi,
      scrollToLatest,
      startTypingDots,
      stopTyping,
      stopTypingDots,
      thinking,
      typeOutChatGPTLike,
    ]
  );

  const send = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

    const text = clean(input);
    const hasImages = attachedImages.length > 0;

    if ((!text && !hasImages) || thinking) return;

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

    const reqToken = makeReqToken();
    activeReqTokenRef.current = reqToken;

    const abort = new AbortController();
    netAbortRef.current = abort;

    const imagesToSend = attachedImages;
    setAttachedImages([]);

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      text: text || (imagesToSend.length ? "📷 Image attached" : ""),
      ts: Date.now(),
      images: imagesToSend.length ? imagesToSend.map((x) => ({ id: x.id, uri: x.uri })) : null,
    };

    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };
setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    userNearBottomRef.current = true;
    autoScrollLockRef.current = false;
    scrollToLatest(false, true);
    startTypingDots(botId);

    try {
      if (reqToken !== activeReqTokenRef.current) return;

      if (imagesToSend.length > 0) {
        const payload: RetryPayload = { kind: "vision", text, history, images: imagesToSend };
        lastPayloadRef.current = payload;
        setRetryCard({ visible: false, label: "", payload });

        const res = await callWorkerVision(text, imagesToSend, history, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const packed = packAssistantText({
          text: res.text,
          actions: (res as any)?.meta?.actions ?? [],
          footerNote: creditResult.ok ? "" : "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.",
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

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
  ? "✅ Image generated"
  : "✅ Image generated\n\n⚠️ AI image imetoka lakini credit deduction imeshindikana.";

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          generatedImageUri: url,
          imagePrompt: p,
        }
      : m
  )
);

await typeOutChatGPTLike(botId, reply, reqToken);
return;
      }

      const payload: RetryPayload = { kind: "chat", text, history };
      lastPayloadRef.current = payload;
      setRetryCard({ visible: false, label: "", payload });

      const res = await callWorkerChat(text, history, abort.signal);

      if (reqToken !== activeReqTokenRef.current) return;

      const creditResult = await consumeAiCredits(1);

      let footerNote = creditResult.ok ? "" : "⚠️ AI response imefanikiwa lakini credit deduction imeshindikana.";
     const resMeta: any = (res as any)?.meta ?? null;
const normalizedAlerts = normalizeAutopilotAlerts(resMeta);

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          autopilotAlerts: normalizedAlerts,
          analysisIntent: (resMeta?.analysisIntent as any) ?? null,
        }
      : m
  )
);

if (aiEnabled && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) {
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: resMeta.actions as ActionItem[],
        });

        if (result.created > 0) {
          footerNote = footerNote
            ? `${footerNote}\n\n✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`
            : `✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`;
        } else if (result.failed > 0) {
          const taskWarn =
            "⚠️ Actions zimeshindwa ku-save kwenye Tasks.\n" +
            "Tip: Hakikisha RPC `create_task_from_ai` ipo na una role ya owner/admin.";

          footerNote = footerNote ? `${footerNote}\n\n${taskWarn}` : taskWarn;
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
      scrollToLatest(false, true);
    }
  }, [
    aiEnabled,
    attachedImages,
    buildHistory,
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    consumeAiCredits,
    currentPlanLabel,
    input,
    org.activeOrgId,
    org.activeStoreId,
    ownerOnlyReason,
    patchMessageText,
    requireAi,
    scrollToLatest,
    startTypingDots,
    stopTyping,
    stopTypingDots,
    thinking,
    typeOutChatGPTLike,
  ]);

  const retryLast = useCallback(async () => {
    if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kuendelea.`)) return;

    const p = retryCard.payload;
    if (!p || thinking) return;

    setRetryCard({ visible: false, label: "", payload: p });
    lastPayloadRef.current = p;

    const reqToken = makeReqToken();
    activeReqTokenRef.current = reqToken;

    const abort = new AbortController();
    netAbortRef.current = abort;

  const userMsg: ChatMsg = {
  id: uid(),
  role: "user",
  ts: Date.now(),
  text: p.kind === "image" ? `create image: ${p.prompt}` : `[Retry] ${p.kind.toUpperCase()}`,
};

    const botId = uid();
    const botPlaceholder: ChatMsg = { id: botId, role: "assistant", ts: Date.now(), text: "AI inaandika" };

    setThinking(true);
    stopTyping();
    stopTypingDots();

    setMessages((prev) => [botPlaceholder, userMsg, ...prev]);
    userNearBottomRef.current = true;
    autoScrollLockRef.current = false;
    scrollToLatest(false, true);
    startTypingDots(botId);

    try {
      if (p.kind === "image") {
        const url = await callWorkerImageGenerate(p.prompt, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const reply = creditResult.ok
  ? "✅ Image generated"
  : "✅ Image generated\n\n⚠️ Retry image imetoka lakini credit deduction imeshindikana.";

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          generatedImageUri: url,
          imagePrompt: p.prompt,
        }
      : m
  )
);

await typeOutChatGPTLike(botId, reply, reqToken);
return;

await typeOutChatGPTLike(botId, reply, reqToken);
return;
      }

      if (p.kind === "vision") {
        const res = await callWorkerVision(p.text, p.images, p.history, abort.signal);

        if (reqToken !== activeReqTokenRef.current) return;

        const creditResult = await consumeAiCredits(1);

        const packed = packAssistantText({
          text: res.text,
          actions: (res as any)?.meta?.actions ?? [],
          footerNote: creditResult.ok ? "" : "⚠️ Retry vision imefanikiwa lakini credit deduction imeshindikana.",
        });
        await typeOutChatGPTLike(botId, packed || sanitizeAssistantText(res.text), reqToken);
        return;
      }

      const res = await callWorkerChat(p.text, p.history, abort.signal);

      if (reqToken !== activeReqTokenRef.current) return;

      const creditResult = await consumeAiCredits(1);

      let footerNote = creditResult.ok ? "" : "⚠️ Retry chat imefanikiwa lakini credit deduction imeshindikana.";
     const resMeta: any = (res as any)?.meta ?? null;
const normalizedAlerts = normalizeAutopilotAlerts(resMeta);

setMessages((prev) =>
  prev.map((m) =>
    m.id === botId
      ? {
          ...m,
          autopilotAlerts: normalizedAlerts,
          analysisIntent: (resMeta?.analysisIntent as any) ?? null,
        }
      : m
  )
);

if (aiEnabled && clean(org.activeOrgId) && Array.isArray(resMeta?.actions) && resMeta.actions.length) { 
        const result = await createTasksFromAiActions({
          orgId: org.activeOrgId!,
          storeId: org.activeStoreId ?? null,
          actions: resMeta.actions as ActionItem[],
        });

        if (result.created > 0) {
          footerNote = footerNote
            ? `${footerNote}\n\n✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`
            : `✅ Saved to Tasks: ${result.created}${result.failed > 0 ? ` • Failed: ${result.failed}` : ""}`;
        } else if (result.failed > 0) {
          const taskWarn =
            "⚠️ Actions zimeshindwa ku-save kwenye Tasks.\n" +
            "Tip: Hakikisha RPC `create_task_from_ai` ipo na una role ya owner/admin.";

          footerNote = footerNote ? `${footerNote}\n\n${taskWarn}` : taskWarn;
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

      patchMessageText(botId,
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
      scrollToLatest(false, true);
    }
  }, [
    aiEnabled,
    callWorkerChat,
    callWorkerImageGenerate,
    callWorkerVision,
    consumeAiCredits,
    currentPlanLabel,
    org.activeOrgId,
    org.activeStoreId,
    ownerOnlyReason,
    patchMessageText,
    requireAi,
    retryCard.payload,
    scrollToLatest,
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      {/* BACK */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={({ pressed }) => ({
          width: 46,
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
        <Ionicons name="chevron-back" size={22} color={UI.text} />
      </Pressable>

      {/* TITLE */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 }}>
        <Text
          style={{ color: UI.text, fontWeight: "900", fontSize: 18 }}
          numberOfLines={1}
        >
          ZETRA AI
        </Text>
      </View>

      {/* RESET */}
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
          "• Nipe analysis, forecast, au profit coach ya store yako\n" +
          "• Au niambie unataka kufanya nini ndani ya ZETRA BMS, nitakuongoza hatua kwa hatua.\n\n" +
          "Tip: Andika Lugha yoyote unayotumia — nita-adapt automatically.",
      },
    ]);
    setAttachedImages([]);
    setAutopilotCards([]);
    setLastAnalysisIntent(null);
    setRetryCard({ visible: false, label: "", payload: null });
    lastPayloadRef.current = null;
   requestAnimationFrame(() => {
        inputRef.current?.focus();
        scrollToLatest(false, true);
      });
  }}
        hitSlop={10}
        style={({ pressed }) => ({
          paddingHorizontal: 14,
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
        <Text style={{ color: UI.text, fontWeight: "900" }}>Reset</Text>
      </Pressable>
    </View>
  </View>
);

const renderMsg = useCallback(({ item }: { item: ChatMsg }) => {
  const isUser = item.role === "user";
  const imgs = Array.isArray(item.images) ? item.images : [];
  const alerts = Array.isArray(item.autopilotAlerts) ? item.autopilotAlerts : [];
  const msgTime = fmtChatTime(item.ts);
  const intentLabel = getIntentLabel(item.analysisIntent);

 const generatedImageUri = !isUser
  ? normalizeImageUrl(item.generatedImageUri || extractMarkdownImageUrl(item.text))
  : "";

const displayText = !isUser
  ? stripMarkdownImageTag(item.text)
  : item.text;

const imagePromptText = !isUser
  ? clean(item.imagePrompt)
  : "";

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: isUser ? "flex-end" : "flex-start",
          marginBottom: 6,
        }}
      >
        <View
          style={{
            paddingHorizontal: 10,
            height: 24,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isUser ? "rgba(16,185,129,0.28)" : "rgba(255,255,255,0.10)",
            backgroundColor: isUser ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
          }}
        >
          <Ionicons
            name={isUser ? "person-circle-outline" : "sparkles-outline"}
            size={12}
            color={UI.text}
          />
          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 11 }}>
            {isUser ? "You" : `ZETRA AI • ${intentLabel}`}
          </Text>
          {!!msgTime && (
            <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 10 }}>
              {msgTime}
            </Text>
          )}
        </View></View>

   {isUser && imgs.length ? (
  <View
    style={{
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 10,
      justifyContent: "flex-end",
    }}
  >
    {imgs.map((x, idx) => (
      <Pressable
        key={x.id}
        onPress={() => setImgPreview({ open: true, uri: x.uri })}
        style={({ pressed }) => ({
          width: 74,
          height: 74,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.04)",
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Image source={{ uri: x.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <View
          style={{
            position: "absolute",
            left: 6,
            bottom: 6,
            paddingHorizontal: 6,
            height: 18,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 10 }}>
            IMG {idx + 1}
          </Text>
        </View>
      </Pressable>
    ))}
  </View>
) : null}

      {!isUser && alerts.length ? (
        <Card style={{ padding: 14, borderRadius: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.25)",
                backgroundColor: "rgba(16,185,129,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={15} color={UI.text} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>
                {item.analysisIntent === "FORECAST"
                  ? "Autopilot Forecast Alerts"
                  : item.analysisIntent === "COACH"
                  ? "Autopilot Profit Coach"
                  : "Autopilot Business Alerts"}
              </Text>
              <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, marginTop: 2 }}>
                Smart highlights from this response
              </Text>
            </View>
          </View>

          {alerts.map((a, idx) => {
            const borderColor =
              a.level === "critical"
                ? "rgba(239,68,68,0.40)"
                : a.level === "warning"
                ? "rgba(245,158,11,0.40)"
                : "rgba(16,185,129,0.40)";

            const bg =
              a.level === "critical"
                ? "rgba(239,68,68,0.10)"
                : a.level === "warning"
                ? "rgba(245,158,11,0.10)"
                : "rgba(16,185,129,0.10)";

            const icon =
              a.level === "critical"
                ? "alert-circle"
                : a.level === "warning"
                ? "warning"
                : "checkmark-circle";

            return (
              <View
                key={`${item.id}_alert_${idx}`}
                style={{
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: bg,
                  borderRadius: 16,
                  padding: 12,
                  marginTop: idx === 0 ? 0 : 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name={icon as any} size={16} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", flex: 1 }}>{a.title}</Text>
                </View>

                {!!clean(a.message) && (
                  <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 6, lineHeight: 20 }}>
                    {a.message}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>
      ) : null}

      <View
        style={{
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {!!displayText ? (
          <View
            style={{
              maxWidth: "100%",
              borderRadius: 24,
              overflow: "hidden",
            }}
          >
            <AiMessageBubble role={isUser ? "user" : "assistant"} text={displayText} />
          </View>
        ) : null}

        {!isUser && !!generatedImageUri ? (
          <View
            style={{
              marginTop: displayText ? 10 : 0,
              width: Math.min(Dimensions.get("window").width * 0.72, 320),
            }}
          >
            <Pressable
              onPress={() => setImgPreview({ open: true, uri: generatedImageUri })}
              style={({ pressed }) => ({
                width: "100%",
                aspectRatio: 1,
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.04)",
                opacity: pressed ? 0.95 : 1,
              })}
            >
              <Image
                source={{ uri: generatedImageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </Pressable>

            {!!imagePromptText && (
              <View
                style={{
                  marginTop: 8,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={() => void copyImagePromptFromMessage(imagePromptText)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    })}
                  >
                    <Ionicons name="copy-outline" size={16} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Copy Prompt</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => useImagePromptAgainFromMessage(imagePromptText)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    })}
                  >
                    <Ionicons name="create-outline" size={16} color={UI.text} />
                    <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Use Again</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => void regenerateImageFromMessage(imagePromptText)}
                  style={({ pressed }) => ({
                    width: "100%",
                    height: 42,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.35)",
                    backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  })}
                >
                  <Ionicons name="refresh-outline" size={16} color={UI.text} />
                  <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Regenerate</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}, [
  regenerateImageFromMessage,
  copyImagePromptFromMessage,
  savePreviewImageToDevice,
  sharePreviewImage,
  useImagePromptAgainFromMessage,
]);

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
            borderRadius: 20,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.35)",
                backgroundColor: "rgba(245,158,11,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="refresh" size={16} color={UI.text} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: UI.text, fontWeight: "900" }}>{retryCard.label || "Retry"}</Text>
              <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
                Network ilikatika au request ilifail. Bonyeza kujaribu tena.
              </Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={UI.muted} />
        </Pressable>
      </View>
    );
  }, [retryCard.label, retryCard.payload, retryCard.visible, retryLast]);

 const AttachRow = useMemo(() => {
    if (!attachedImages.length) return null;

    return (
      <View style={{ paddingHorizontal: 6, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {attachedImages.map((x, idx) => (
            <View
              key={x.id}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: 16,
                paddingVertical: 8,
                paddingHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => setImgPreview({ open: true, uri: x.uri })}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  overflow: "hidden",
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Image source={{ uri: x.uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              </Pressable>

              <View>
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  Image {idx + 1}
                </Text>
                <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
                  Ready to send
                </Text>
              </View>

              <Pressable
                onPress={() => removeAttachedImage(x.id)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.30)",
                  marginLeft: 2,
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
    if (!clean(input) && attachedImages.length === 0) return false;
    return true;
  }, [aiEnabled, attachedImages.length, input, thinking]);

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
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 16 }}>
                  {ownerOnlyReason ? "Owner Only" : "Upgrade Required"}
                </Text>
                <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 2 }}>
                  {ownerOnlyReason ? "AI access restricted" : `AI locked (${currentPlanLabel})`}
                </Text>
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
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason
                ? "AI ya ZETRA ni ya OWNER pekee."
                : `AI haipatikani kwenye kifurushi cha ${currentPlanLabel}.`}
            </Text>
            <Text style={{ color: UI.muted, fontWeight: "800", marginTop: 8, lineHeight: 20 }}>
              {aiGateReason || defaultAiLockReason}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {!ownerOnlyReason ? (
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
            ) : null}

            <Pressable
              onPress={() => setAiGateOpen(false)}
              style={({ pressed }) => ({
                width: ownerOnlyReason ? "100%" : 110,
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
          maxHeight: "88%",
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
<View style={{ marginTop: 14 }}>
  <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Quick actions</Text>

  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
    <Pressable
      onPress={() => {
        setPlusOpen(false);
        void pickAndAttachImage();
      }}
      disabled={!aiEnabled}
      hitSlop={10}
      style={({ pressed }) => ({
        height: 42,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
      })}
    >
      <Ionicons name="image-outline" size={16} color={UI.text} />
      <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Attach Image</Text>
    </Pressable>

    {(clean(input) || attachedImages.length > 0) && !thinking ? (
      <Pressable
        onPress={() => {
          setPlusOpen(false);
          clearComposer();
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          height: 42,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(239,68,68,0.24)",
          backgroundColor: pressed ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.08)",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        })}
      >
        <Ionicons name="close-circle-outline" size={16} color={UI.text} />
        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>Clear</Text>
      </Pressable>
    ) : null}
  </View>
</View>
        {/* SUBSCRIPTION BUTTON */}
        <View style={{ marginTop: 14 }}>
          <Pressable
            onPress={() => {
              setPlusOpen(false);
              router.push("/settings/subscription");
            }}
            hitSlop={10}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
            })}
          >
            <Ionicons name="card-outline" size={18} color={UI.text} />
            <Text style={{ color: UI.text, fontWeight: "900" }}>Subscription</Text>
          </Pressable>
        </View>

        {/* MOVED CARDS */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>Current AI Status</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                paddingHorizontal: 12,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: aiEnabled ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.12)",
                backgroundColor: aiEnabled ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                {aiEnabled ? "AI ON" : "LOCKED"}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 12,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                Plan: {currentPlanLabel}
              </Text>
            </View>

            {planAllowsAi ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isOwner ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.35)",
                  backgroundColor: isOwner ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  AI: {isOwner ? "OWNER ONLY" : "NO ACCESS"}
                </Text>
              </View>
            ) : null}

            {aiEnabled ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.35)",
                  backgroundColor: "rgba(16,185,129,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12 }}>
                  Credits: {fmtNum(aiCreditsRemaining)} / {fmtNum(aiCreditsMonthly)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* AI LANGUAGE */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: UI.muted, fontWeight: "900", marginBottom: 8 }}>AI Language</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <ModePill k="AUTO" label="Auto" />
            <ModePill k="SW" label="Swahili" />
            <ModePill k="EN" label="English" />
          </View>
        </View>

        {/* QUICK PROMPTS */}
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

        {/* TASKS */}
        <View style={{ marginTop: 16, opacity: aiEnabled ? 1 : 0.55 }}>
          <Pressable
            onPress={() => {
              if (!requireAi(ownerOnlyReason || `AI haipatikani kwenye ${currentPlanLabel}. Upgrade ili kufungua Tasks panel.`)) {
                return;
              }
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
              openAiGate(defaultAiLockReason);
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
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason ? "AI Owner Only" : "AI Locked — Upgrade"}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Pressable>
  </Modal>
);

const Composer = (
  <View
    style={{
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: Math.max(insets.bottom, 0) + androidComposerLift,
      backgroundColor: "transparent",
      opacity: aiEnabled ? 1 : 0.76,
    }}
  >
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(10,14,20,0.96)",
        borderRadius: 28,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 10,
        shadowColor: "#000",
        shadowOpacity: 0.24,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
      }}
    >
      {AttachRow}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => {
            if (!aiEnabled) {
              openAiGate(defaultAiLockReason);
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
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
            opacity: !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
          })}
        >
          <Ionicons name="add" size={18} color={UI.text} />
        </Pressable>

        <View
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 22,
            justifyContent: "center",
            paddingHorizontal: 2,
          }}
        >
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={
              aiEnabled
                ? transcribing
                  ? "Transcribing voice..."
                  : attachedImages.length
                  ? "Add message about the image..."
                  : "Message ZETRA AI..."
                : ownerOnlyReason
                ? "AI ni ya OWNER pekee"
                : `AI imezimwa (${currentPlanLabel}) — upgrade ili kutumia`
            }
            placeholderTextColor={UI.faint}
            multiline
            maxLength={INPUT_MAX}
            editable={aiEnabled}
            style={{
              color: UI.text,
              fontWeight: "800",
              fontSize: 16,
              lineHeight: 22,
              minHeight: 24,
              maxHeight: 140,
              paddingHorizontal: 4,
              paddingTop: 8,
              paddingBottom: 8,
            }}
            keyboardAppearance="dark"
            autoCorrect
            autoCapitalize="sentences"
            returnKeyType="default"
            blurOnSubmit={false}
            textAlignVertical="top"
            onFocus={() => {
              if (Platform.OS === "android") {
                scrollToLatest(false, true);
              }
            }}
            onSubmitEditing={() => {}}
          />
        </View>

        <Pressable
          onPress={() => {
            if (recordingOn) {
              void stopRecordingAndTranscribe();
              return;
            }
            if (canSend) {
              void send();
              return;
            }
            toggleMic();
          }}
          disabled={recordingOn ? false : canSend ? !canSend : !aiEnabled}
          hitSlop={10}
          style={({ pressed }) => {
            const activeSend = recordingOn || canSend;

            return {
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1,
              borderColor: activeSend ? C.emeraldBorder : "rgba(255,255,255,0.10)",
              backgroundColor: activeSend
                ? C.emeraldSoft
                : pressed
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.05)",
              alignItems: "center",
              justifyContent: "center",
              opacity: !recordingOn && !canSend && !aiEnabled ? 0.55 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            };
          }}
        >
          <Ionicons
            name={recordingOn || canSend ? "arrow-up" : "mic-outline"}
            size={18}
            color={UI.text}
          />
        </Pressable>
      </View>

      <View
  style={{
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  }}
>
  {recordingOn ? (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 28,
      }}
    >
      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11, width: 64 }}>
        Listening...
      </Text>

      <View
        style={{
          flex: 1,
          height: 26,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 3,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 14 }).map((_, idx) => {
          const normalized = Math.max(0, Math.min(1, (liveMeter + 160) / 160));
          const base = [0.42, 0.62, 0.86, 0.58, 0.96, 0.48, 0.74];
          const factor = base[idx % base.length];
          const h = Math.max(6, Math.min(24, Math.round((6 + normalized * 18) * factor)));

          return (
            <View
              key={`bar_${idx}`}
              style={{
                width: 4,
                height: h,
                borderRadius: 999,
                backgroundColor:
                  idx % 3 === 0 ? "rgba(16,185,129,0.95)" : "rgba(255,255,255,0.75)",
              }}
            />
          );
        })}
      </View>

      <Text
        style={{
          color: UI.faint,
          fontWeight: "800",
          fontSize: 11,
          width: 36,
          textAlign: "right",
        }}
      >
        {(recordingMs / 1000).toFixed(1)}s
      </Text>
    </View>
  ) : (
    <>
      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
        {transcribing
          ? "Voice inachakatwa..."
          : attachedImages.length
          ? `${attachedImages.length} image attached`
          : "AI ready"}
      </Text>

      <Text style={{ color: UI.faint, fontWeight: "800", fontSize: 11 }}>
        {clean(input).length}/{INPUT_MAX.toLocaleString()}
      </Text>
    </>
  )}
</View>

      {thinking ? (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={stopGenerating}
            style={({ pressed }) => ({
              height: 42,
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
            onPress={() => openAiGate(defaultAiLockReason)}
            style={({ pressed }) => ({
              height: 42,
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
            <Text style={{ color: UI.text, fontWeight: "900" }}>
              {ownerOnlyReason ? "OWNER ONLY AI" : "UPGRADE TO USE AI"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  </View>
);

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
            Org: {org.activeOrgName ?? "—"} • Showing latest tasks saved by AI & manual.
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

  const ImagePreviewModal = (
    <Modal
      visible={imgPreview.open}
      transparent
      animationType="fade"
      onRequestClose={() => setImgPreview({ open: false, uri: "" })}
    >
      <Pressable
        onPress={() => setImgPreview({ open: false, uri: "" })}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "92%",
            aspectRatio: 1,
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <Image
            source={{ uri: imgPreview.uri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </Pressable>

        <View
          style={{
            position: "absolute",
            top: Math.max(insets.top, 12) + 12,
            right: 16,
          }}
        >
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

        {!!clean(imgPreview.uri) && (
          <View
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: Math.max(insets.bottom, 12) + 12,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => void sharePreviewImage()}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <Ionicons name="share-social-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Share</Text>
            </Pressable>

            <Pressable
              onPress={() => void savePreviewImageToDevice()}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <Ionicons name="download-outline" size={18} color={UI.text} />
              <Text style={{ color: UI.text, fontWeight: "900" }}>Save</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Modal>
  );

const Content = (
  <View style={{ flex: 1 }}>
    {RetryBanner}

   <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={renderMsg}
      inverted
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === "android"}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={10}
      scrollEventThrottle={16}
      onScroll={handleListScroll}
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: 12,
        paddingBottom: 16 + (Platform.OS === "android" ? androidComposerLift : 0),
      }}
    /> 

    {Composer}
  </View>
);

  return (
    <Screen scroll={false} contentStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: C.background }}>
        {TopBar}

        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
            {Content}
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1 }}>{Content}</View>
        )}

        {TasksModal}
        
        {ImagePreviewModal}
        {PlusMenu}
        {AiLockedModal}

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