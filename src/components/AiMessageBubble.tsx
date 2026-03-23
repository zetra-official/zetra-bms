import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
// Native selectable text priority:
// tumetoa markdown renderer ili long-press ilete native text selection ya Android/iOS.
import { UI } from "@/src/ui/theme";

type ChatRole = "user" | "assistant";
type ChatMsg = { id: string; role: ChatRole; text: string; ts: number };

const C: any = (UI as any)?.colors ?? UI;

function clean(s: any) {
  return String(s ?? "").trim();
}

function normalizeImageUri(uri: string) {
  const u = clean(uri);
  if (!u) return "";
  if (u.startsWith("data:image/")) return u.replace(/\s+/g, "");
  return u;
}

function getImageExtensionFromUri(uri: string) {
  const u = normalizeImageUri(uri).toLowerCase();

  if (u.startsWith("data:image/png")) return "png";
  if (u.startsWith("data:image/jpeg") || u.startsWith("data:image/jpg")) return "jpg";
  if (u.startsWith("data:image/webp")) return "webp";

  if (u.includes(".png")) return "png";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "jpg";
  if (u.includes(".webp")) return "webp";

  return "png";
}

async function ensureLocalImageFile(uri: string) {
  const normalized = normalizeImageUri(uri);
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

function splitFooterBadge(fullText: string) {
  const t = clean(fullText);
  if (!t) return { text: "", savedBadge: "" };

  const src = t.replace(/\r\n/g, "\n");
  const lines = src.split("\n");

  let lastIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (clean(lines[i])) {
      lastIdx = i;
      break;
    }
  }

  if (lastIdx === -1) return { text: src, savedBadge: "" };

  const lastLine = clean(lines[lastIdx]);
  const savedRe = /^✅\s*Saved to Tasks:\s*\d+(\s*•\s*Failed:\s*\d+)?$/i;

  if (!savedRe.test(lastLine)) {
    return { text: src, savedBadge: "" };
  }

  const remaining = [...lines];
  remaining.splice(lastIdx, 1);

  return { text: clean(remaining.join("\n")), savedBadge: lastLine };
}

function splitNextMove(text: string) {
  const t = clean(text);
  if (!t) return { main: "", nextMoveBody: "" };

  const src = t.replace(/\r\n/g, "\n");

  const nextMoveRe =
    /^([>\s]*)(#{1,6}\s*)?(\*\*)?\s*🎯?\s*NEXT\s+MOVE\s*:?\s*(\*\*)?\s*$/gim;

  let match: RegExpExecArray | null = null;
  let foundIndex = -1;

  while ((match = nextMoveRe.exec(src)) !== null) {
    foundIndex = match.index;
    break;
  }

  if (foundIndex === -1) {
    return { main: src, nextMoveBody: "" };
  }

  const before = clean(src.slice(0, foundIndex));
  const afterRaw = src.slice(foundIndex);

  const oneNextMoveLine =
    /^([>\s]*)(#{1,6}\s*)?(\*\*)?\s*🎯?\s*NEXT\s+MOVE\s*:?\s*(\*\*)?\s*$/im;

  const afterNoHeading = afterRaw.replace(oneNextMoveLine, "").trim();

  if (!clean(afterNoHeading)) {
    return { main: before || src, nextMoveBody: "" };
  }

  const actionsRe =
    /^([>\s]*)(#{1,6}\s*)?(\*\*)?\s*✅?\s*ACTIONS\s*:?\s*(\*\*)?\s*$/im;

  const mActions = actionsRe.exec(afterNoHeading);

  if (!mActions || mActions.index < 0) {
    return { main: before, nextMoveBody: afterNoHeading };
  }

  const nmBody = clean(afterNoHeading.slice(0, mActions.index));
  const actionsAndRest = clean(afterNoHeading.slice(mActions.index));

  if (!clean(nmBody)) {
    const merged = clean([before, afterNoHeading].filter(Boolean).join("\n\n"));
    return { main: merged, nextMoveBody: "" };
  }

  const mainMerged = clean([before, actionsAndRest].filter(Boolean).join("\n\n"));
  return { main: mainMerged, nextMoveBody: nmBody };
}

function stripDataImageLinkLines(fullText: string) {
  const src = clean(fullText).replace(/\r\n/g, "\n");
  if (!src) return "";

  const outLines: string[] = [];
  for (const line of src.split("\n")) {
    const L = clean(line);
    if (!L) {
      outLines.push(line);
      continue;
    }

    const lower = L.toLowerCase();

    if (lower.startsWith("link:") && lower.includes("data:image/")) continue;
    if (lower.startsWith("data:image/")) continue;

    outLines.push(line);
  }

  return clean(outLines.join("\n"));
}

function extractRawDataImage(text: string) {
  const src = String(text ?? "");
  const start = src.indexOf("data:image/");
  if (start === -1) return "";

  let out = "";
  for (let i = start; i < src.length; i++) {
    const ch = src[i];

    const ok =
      /[A-Za-z0-9+/=:_;,\-.]/.test(ch);

    if (!ok) break;
    out += ch;
  }

  return normalizeImageUri(out);
}

function removeRawDataImage(text: string, uri: string) {
  const src = String(text ?? "");
  if (!uri) return clean(src);
  return clean(src.replace(uri, ""));
}

function extractFirstMarkdownImage(fullText: string): { body: string; imageUri: string } {
  const t = clean(fullText);
  if (!t) return { body: "", imageUri: "" };

  // 1) markdown image first
  const markdownRe = /!\[[^\]]*?\]\(\s*(data:image\/[^)\s]+|https?:\/\/[^)\s]+)\s*\)/im;
  const mm = markdownRe.exec(t);

  if (mm?.[1]) {
    const uri = normalizeImageUri(mm[1]);
    if (uri) {
      const body = clean(t.replace(mm[0], "").trim());
      return { body, imageUri: uri };
    }
  }

  // 2) fallback: raw data:image string anywhere in message
  const rawUri = extractRawDataImage(t);
  if (rawUri) {
    const withoutRaw = removeRawDataImage(t, rawUri)
      .replace(/!\[[^\]]*?\]\(\s*\)/g, "")
      .replace(/\(\s*\)/g, "")
      .trim();

    return {
      body: clean(withoutRaw),
      imageUri: rawUri,
    };
  }

  return { body: t, imageUri: "" };
}

type MetricChip = {
  key: string;
  label: string;
  value: string;
  icon: string;
};

function extractMetricChips(fullText: string): { body: string; chips: MetricChip[] } {
  const src = clean(fullText).replace(/\r\n/g, "\n");
  if (!src) return { body: "", chips: [] };

  const lines = src.split("\n");
  const chips: MetricChip[] = [];
  const kept: string[] = [];

  const defs: Array<{
    key: string;
    label: string;
    icon: string;
    re: RegExp;
  }> = [
    { key: "sales", label: "Sales", icon: "S", re: /^sales\s*:\s*(.+)$/i },
    { key: "cogs", label: "COGS", icon: "C", re: /^cogs\s*:\s*(.+)$/i },
    { key: "expenses", label: "Expenses", icon: "E", re: /^expenses\s*:\s*(.+)$/i },
    { key: "profit", label: "Profit", icon: "P", re: /^profit\s*:\s*(.+)$/i },
    { key: "orders", label: "Orders", icon: "O", re: /^[🧾]?\s*orders\s*:\s*(.+)$/i },
    { key: "avg_order", label: "Avg/Order", icon: "A", re: /^[🛒]?\s*avg\/order\s*:\s*(.+)$/i },
    { key: "money_in", label: "Money In", icon: "M", re: /^[💵]?\s*money\s*in\s*:\s*(.+)$/i },
    { key: "margin", label: "Margin", icon: "%", re: /^[📊]?\s*margin\s*:\s*(.+)$/i },
  ];

  for (const line of lines) {
    const raw = line ?? "";
    const t = clean(raw);

    if (!t) {
      kept.push(raw);
      continue;
    }

    let matched = false;

    for (const d of defs) {
      const m = t.match(d.re);
      if (!m?.[1]) continue;

      const value = clean(m[1]);
      if (!value) break;

      if (!chips.some((c) => c.key === d.key)) {
        chips.push({
          key: d.key,
          label: d.label,
          value,
          icon: d.icon,
        });
      }

      matched = true;
      break;
    }

    if (!matched) kept.push(raw);
  }

  return {
    body: clean(kept.join("\n")),
    chips,
  };
}

type ParsedSection = {
  title: string;
  icon: string;
  body: string;
  tone: "danger" | "warning" | "info" | "success";
};

function normalizeHeadingKey(line: string) {
  return clean(line)
    .toUpperCase()
    .replace(/^[#>*\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSectionMeta(line: string): Omit<ParsedSection, "body"> | null {
  const key = normalizeHeadingKey(line);

  if (key === "INSIGHTS") {
    return { title: "INSIGHTS", icon: "🔍", tone: "warning" };
  }
  if (key === "IDEAS") {
    return { title: "IDEAS", icon: "💡", tone: "info" };
  }
  if (key === "ACTIONS") {
    return { title: "ACTIONS", icon: "🚀", tone: "success" };
  }
  if (key === "FORECAST BASED ON LAST 7 DAYS" || key === "FORECAST") {
    return { title: "FORECAST", icon: "🔮", tone: "info" };
  }
  if (key === "PREDICTION RISKS") {
    return { title: "PREDICTION RISKS", icon: "🚨", tone: "danger" };
  }
  if (key === "SMART PREDICTIONS") {
    return { title: "SMART PREDICTIONS", icon: "🧠", tone: "success" };
  }

  return null;
}

function splitAssistantSections(text: string) {
  const src = clean(text).replace(/\r\n/g, "\n");
  if (!src) return { intro: "", sections: [] as ParsedSection[] };

  const lines = src.split("\n");
  const introLines: string[] = [];
  const sections: ParsedSection[] = [];

  let current: ParsedSection | null = null;

  for (const line of lines) {
    const meta = getSectionMeta(line);

    if (meta) {
      if (current) {
        current.body = clean(current.body);
        sections.push(current);
      }
      current = { ...meta, body: "" };
      continue;
    }

    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    } else {
      introLines.push(line);
    }
  }

  if (current) {
    current.body = clean(current.body);
    sections.push(current);
  }

  return {
    intro: clean(introLines.join("\n")),
    sections: sections.filter((s) => clean(s.body)),
  };
}

type Props =
  | { msg: ChatMsg; role?: never; text?: never }
  | { msg?: undefined; role: ChatRole; text: string };

function safeMsgFromProps(p: Props): ChatMsg {
  const now = Date.now();

  if ((p as any)?.msg) {
    const m = (p as any).msg as ChatMsg;
    return {
      id: String(m?.id ?? `m_${now}`),
      role: (m?.role === "user" || m?.role === "assistant" ? m.role : "assistant") as ChatRole,
      text: String(m?.text ?? ""),
      ts: Number(m?.ts ?? now),
    };
  }

  const role = (p as any)?.role;
  const text = (p as any)?.text;

  return {
    id: `m_${now}`,
    role: role === "user" ? "user" : "assistant",
    text: String(text ?? ""),
    ts: now,
  };
}

export function AiMessageBubble(props: Props) {
  const msg = useMemo(() => safeMsgFromProps(props), [props]);
  const isUser = msg.role === "user";

  const [viewer, setViewer] = useState<{ open: boolean; uri: string }>({
    open: false,
    uri: "",
  });

  const openViewer = useCallback((uri: string) => {
    const normalized = normalizeImageUri(uri);
    if (!normalized) return;
    setViewer({ open: true, uri: normalized });
  }, []);

  const closeViewer = useCallback(() => {
    setViewer({ open: false, uri: "" });
  }, []);

  const saveImageToDevice = useCallback(async (uri: string) => {
    try {
      const normalized = normalizeImageUri(uri);
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
  }, []);

  const shareImageFromUri = useCallback(async (uri: string) => {
    try {
      const normalized = normalizeImageUri(uri);
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
  }, []);

  const openImageActions = useCallback(
    (uri: string) => {
      const normalized = normalizeImageUri(uri);
      if (!normalized) return;

      Alert.alert("Image actions", "Chagua unachotaka kufanya.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open", onPress: () => openViewer(normalized) },
        { text: "Share", onPress: () => void shareImageFromUri(normalized) },
        { text: "Save", onPress: () => void saveImageToDevice(normalized) },
      ]);
    },
    [openViewer, saveImageToDevice, shareImageFromUri]
  );

  const {
    mainIntro,
    mainSections,
    nextMoveBody,
    savedBadge,
    imageUriMain,
    imageUriNext,
    metricChips,
  } = useMemo(() => {
    if (isUser) {
      return {
        mainIntro: msg.text,
        mainSections: [] as ParsedSection[],
        nextMoveBody: "",
        savedBadge: "",
        imageUriMain: "",
        imageUriNext: "",
        metricChips: [] as MetricChip[],
      };
    }

    const stripped = stripDataImageLinkLines(msg.text);
    const a = splitFooterBadge(stripped);
    const b = splitNextMove(a.text);

    const chipsMain = extractMetricChips(b.main);
    const mainImg = extractFirstMarkdownImage(chipsMain.body);
    const nextImg = extractFirstMarkdownImage(b.nextMoveBody);

    const sectioned = splitAssistantSections(mainImg.body);

    return {
      mainIntro: sectioned.intro,
      mainSections: sectioned.sections,
      nextMoveBody: nextImg.body,
      savedBadge: a.savedBadge,
      imageUriMain: mainImg.imageUri,
      imageUriNext: nextImg.imageUri,
      metricChips: chipsMain.chips,
    };
  }, [isUser, msg.text]);

const renderSelectableBlock = useCallback(
    (value: string, opts?: { strong?: boolean }) => {
      const src = String(value ?? "").replace(/\r\n/g, "\n");
      if (!clean(src)) return null;

      return src.split("\n").map((line, idx, arr) => (
        <Text
          key={`sel_${idx}`}
          selectable
          selectionColor="rgba(16,185,129,0.35)"
          style={{
            color: UI.text,
            fontSize: opts?.strong ? 15.5 : 16,
            lineHeight: opts?.strong ? 24 : 28,
            fontWeight: opts?.strong ? "900" : "700",
            marginBottom: idx === arr.length - 1 ? 0 : 6,
          }}
        >
          {line || " "}
        </Text>
      ));
    },
    []
  );

  const userBorder = "rgba(16,185,129,0.30)";
  const userBg = "rgba(16,185,129,0.16)";

  function sectionToneStyles(tone: ParsedSection["tone"]) {
    if (tone === "danger") {
      return {
        borderColor: "rgba(239,68,68,0.35)",
        bg: "rgba(239,68,68,0.10)",
      };
    }
    if (tone === "warning") {
      return {
        borderColor: "rgba(245,158,11,0.35)",
        bg: "rgba(245,158,11,0.10)",
      };
    }
    if (tone === "success") {
      return {
        borderColor: "rgba(16,185,129,0.35)",
        bg: "rgba(16,185,129,0.10)",
      };
    }
    return {
      borderColor: "rgba(59,130,246,0.35)",
      bg: "rgba(59,130,246,0.10)",
    };
  }

  const showMetricChips = metricChips.length >= 3;

  return (
    <>
      <View style={{ width: "100%" }}>
        {isUser ? (
          <View style={{ alignItems: "flex-end", paddingVertical: 6 }}>
            <View
              style={{
                maxWidth: "88%",
                borderWidth: 1,
                borderColor: userBorder,
                backgroundColor: userBg,
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 12,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              }}
            >
              {renderSelectableBlock(msg.text, { strong: true })}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: "flex-start", paddingVertical: 6 }}>
            {!!clean(imageUriMain) && (
              <View style={{ width: "100%", marginBottom: 12 }}>
                <Pressable
                  onPress={() => openViewer(imageUriMain)}
                  onLongPress={() => openImageActions(imageUriMain)}
                  style={({ pressed }) => ({
                    width: "100%",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    borderRadius: 16,
                    overflow: "hidden",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    opacity: pressed ? 0.96 : 1,
                  })}
                >
                  <Image
                    source={{ uri: imageUriMain }}
                    style={{
                      width: "100%",
                      height: 280,
                    }}
                    resizeMode="contain"
                  />
                </Pressable>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <Pressable
                    onPress={() => openViewer(imageUriMain)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Open</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void shareImageFromUri(imageUriMain)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                      backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Share</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void saveImageToDevice(imageUriMain)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.35)",
                      backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Text style={{ color: UI.text, fontWeight: "900" }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!!clean(mainIntro) && (
              <View style={{ width: "100%", marginBottom: showMetricChips ? 12 : 0 }}>
                {renderSelectableBlock(mainIntro)}
              </View>
            )}

            {showMetricChips && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 8 }}
                style={{ marginBottom: 12 }}
              >
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {metricChips.map((chip) => (
                    <View
                      key={chip.key}
                      style={{
                        width: 140,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: 18,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(16,185,129,0.12)",
                            borderWidth: 1,
                            borderColor: "rgba(16,185,129,0.20)",
                          }}
                        >
                          <Text style={{ color: UI.text, fontWeight: "900", fontSize: 14 }}>
                            {chip.icon}
                          </Text>
                        </View>

                        <Text
                          style={{ color: UI.muted, fontWeight: "900", fontSize: 12, flex: 1 }}
                          numberOfLines={1}
                        >
                          {chip.label}
                        </Text>
                      </View>

                      <Text
                        style={{
                          color: UI.text,
                          fontWeight: "900",
                          fontSize: 16,
                          marginTop: 10,
                        }}
                        numberOfLines={1}
                      >
                        {chip.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {!!mainSections.length && (
              <View style={{ width: "100%", marginTop: clean(mainIntro) ? 0 : 0 }}>
                {mainSections.map((section, idx) => {
                  const tone = sectionToneStyles(section.tone);

                  return (
                    <View
                      key={`${section.title}_${idx}`}
                      style={{
                        width: "100%",
                        borderWidth: 1,
                        borderColor: tone.borderColor,
                        backgroundColor: tone.bg,
                        borderRadius: 18,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        marginTop: idx === 0 ? 0 : 10,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <Text style={{ color: UI.text, fontSize: 17 }}>{section.icon}</Text>
                        <Text style={{ color: UI.text, fontWeight: "900", fontSize: 15 }}>{section.title}</Text>
                      </View>

                      {renderSelectableBlock(section.body)}
                    </View>
                  );
                })}
              </View>
            )}

            {!!clean(nextMoveBody) && (
              <View
                style={{
                  marginTop: 12,
                  width: "100%",
                  borderWidth: 1,
                  borderColor: C.emeraldBorder,
                  backgroundColor: "rgba(16,185,129,0.08)",
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 8 }}>🎯 NEXT MOVE</Text>

                {!!clean(imageUriNext) && (
                  <View style={{ marginBottom: 10 }}>
                    <Pressable
                      onPress={() => openViewer(imageUriNext)}
                      onLongPress={() => openImageActions(imageUriNext)}
                      style={({ pressed }) => ({
                        borderRadius: 16,
                        overflow: "hidden",
                        opacity: pressed ? 0.96 : 1,
                      })}
                    >
                      <Image
                        source={{ uri: imageUriNext }}
                        style={{
                          width: "100%",
                          height: 260,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                        }}
                        resizeMode="cover"
                      />
                    </Pressable>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <Pressable
                        onPress={() => openViewer(imageUriNext)}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: 42,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.14)",
                          backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        })}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900" }}>Open</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => void shareImageFromUri(imageUriNext)}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: 42,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.14)",
                          backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                          alignItems: "center",
                          justifyContent: "center",
                        })}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900" }}>Share</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => void saveImageToDevice(imageUriNext)}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: 42,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(16,185,129,0.35)",
                          backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                          alignItems: "center",
                          justifyContent: "center",
                        })}
                      >
                        <Text style={{ color: UI.text, fontWeight: "900" }}>Save</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {renderSelectableBlock(nextMoveBody)}
              </View>
            )}

            {!!clean(savedBadge) && (
              <View
                style={{
                  marginTop: 10,
                  alignSelf: "flex-start",
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.35)",
                  backgroundColor: "rgba(16,185,129,0.12)",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", fontSize: 12.5 }}>{savedBadge}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <Modal visible={viewer.open} transparent animationType="fade" onRequestClose={closeViewer}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <Pressable
            onPress={closeViewer}
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              zIndex: 5,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: UI.text, fontWeight: "900" }}>Close</Text>
          </Pressable>

          {!!clean(viewer.uri) && (
            <Image
              source={{ uri: viewer.uri }}
              style={{
                width: "100%",
                height: "78%",
                borderRadius: 18,
              }}
              resizeMode="contain"
            />
          )}

          <View
            style={{
              width: "100%",
              marginTop: 16,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Pressable
              onPress={() => void shareImageFromUri(viewer.uri)}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>Share</Text>
            </Pressable>

            <Pressable
              onPress={() => void saveImageToDevice(viewer.uri)}
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.35)",
                backgroundColor: pressed ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.12)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ color: UI.text, fontWeight: "900" }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}