// src/components/AiMessageBubble.tsx
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { UI } from "@/src/ui/theme";

type ChatRole = "user" | "assistant";
type ChatMsg = { id: string; role: ChatRole; text: string; ts: number };

/**
 * ✅ THEME BRIDGE
 * theme.ts exports UI as flat tokens (UI.background, UI.emeraldBorder, ...)
 * but some older code may use UI.colors.*.
 * This supports BOTH without changing theme.ts.
 */
const C: any = (UI as any)?.colors ?? UI;

function clean(s: any) {
  return String(s ?? "").trim();
}

function normalizeImageUri(uri: string) {
  const u = clean(uri);
  if (!u) return "";
  // IMPORTANT: data:image base64 sometimes has whitespace/newlines -> remove them
  if (u.startsWith("data:image/")) return u.replace(/\s+/g, "");
  return u;
}

/**
 * Footer badge extraction:
 * - Pulls ONLY a trailing "✅ Saved to Tasks: N" line (last non-empty line)
 * - Removes it from markdown body and renders a premium pill badge below.
 */
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

/**
 * NEXT MOVE parsing rules (safe + strict):
 * - Only split when "NEXT MOVE" appears as a standalone heading/line, not inside a sentence.
 * - Supports variants:
 *    "🎯 NEXT MOVE"
 *    "NEXT MOVE"
 *    "🎯 NEXT MOVE:"
 *    "### 🎯 NEXT MOVE"
 *    "**NEXT MOVE**"
 *
 * ✅ IMPORTANT FIX:
 * If ACTIONS appears after NEXT MOVE (some model replies do this),
 * we stop NEXT MOVE body before ACTIONS and keep ACTIONS in main.
 */
function splitNextMove(text: string) {
  const t = clean(text);
  if (!t) return { main: "", nextMoveBody: "" };

  const src = t.replace(/\r\n/g, "\n");

  // Heading-like NEXT MOVE line
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

  // Remove ONLY the first NEXT MOVE heading line at the start of afterRaw
  const oneNextMoveLine =
    /^([>\s]*)(#{1,6}\s*)?(\*\*)?\s*🎯?\s*NEXT\s+MOVE\s*:?\s*(\*\*)?\s*$/im;

  const afterNoHeading = afterRaw.replace(oneNextMoveLine, "").trim();

  if (!clean(afterNoHeading)) {
    return { main: before || src, nextMoveBody: "" };
  }

  // Detect ACTIONS heading inside the remaining text
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

/**
 * ✅ Remove "Link: data:image..." lines so base64 never floods UI.
 * - Also removes any standalone data:image line.
 */
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

    // Remove lines like: "Link: data:image/png;base64,..."
    if (lower.startsWith("link:") && lower.includes("data:image/")) continue;

    // Remove if the line itself is a data:image url (rare)
    if (lower.startsWith("data:image/")) continue;

    outLines.push(line);
  }

  return clean(outLines.join("\n"));
}

/**
 * ✅ Extract FIRST markdown image from text:
 * - Supports: ![alt](url)
 * - Works with http(s) or data:image/...base64,...
 * - Returns { body, imageUri }
 *
 * IMPORTANT:
 * If found, we remove that image markdown segment from body
 * so base64 never shows as text.
 */
function extractFirstMarkdownImage(fullText: string): { body: string; imageUri: string } {
  const t = clean(fullText);
  if (!t) return { body: "", imageUri: "" };

  // Capture URL inside (...) until first ')'
  const re = /!\[[^\]]*?\]\(\s*([^)]+?)\s*\)/m;

  const m = re.exec(t);
  if (!m?.[1]) return { body: fullText, imageUri: "" };

  const uri = normalizeImageUri(m[1]);
  if (!uri) return { body: fullText, imageUri: "" };

  // Remove only the matched markdown image segment
  const body = clean(t.replace(m[0], "").trim());
  return { body, imageUri: uri };
}

/**
 * ✅ Props supports BOTH calling styles:
 * 1) <AiMessageBubble msg={item} />
 * 2) <AiMessageBubble role="user" text="hello" />
 */
type Props =
  | { msg: ChatMsg; role?: never; text?: never }
  | { msg?: undefined; role: ChatRole; text: string };

function safeMsgFromProps(p: Props): ChatMsg {
  const now = Date.now();

  // style 1: msg provided
  if ((p as any)?.msg) {
    const m = (p as any).msg as ChatMsg;
    return {
      id: String(m?.id ?? `m_${now}`),
      role: (m?.role === "user" || m?.role === "assistant" ? m.role : "assistant") as ChatRole,
      text: String(m?.text ?? ""),
      ts: Number(m?.ts ?? now),
    };
  }

  // style 2: role/text provided
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
  // ✅ NEVER crash: normalize props into a safe msg
  const msg = useMemo(() => safeMsgFromProps(props), [props]);

  const isUser = msg.role === "user";

  // ✅ IMMERSIVE MODE:
  // - Assistant message: FULL WIDTH (no card/bubble)
  // - User message: keep compact bubble on the right (premium chat feel)

  const { main, nextMoveBody, savedBadge, imageUriMain, imageUriNext } = useMemo(() => {
    if (isUser)
      return {
        main: msg.text,
        nextMoveBody: "",
        savedBadge: "",
        imageUriMain: "",
        imageUriNext: "",
      };

    // 0) Strip base64 "Link:" lines early (prevents UI flood)
    const stripped = stripDataImageLinkLines(msg.text);

    // 1) Extract trailing saved badge line (if present)
    const a = splitFooterBadge(stripped);

    // 2) Split NEXT MOVE from remaining content
    const b = splitNextMove(a.text);

    // 3) Extract images separately (so base64 never appears as text)
    const mainImg = extractFirstMarkdownImage(b.main);
    const nextImg = extractFirstMarkdownImage(b.nextMoveBody);

    return {
      main: mainImg.body,
      nextMoveBody: nextImg.body,
      savedBadge: a.savedBadge,
      imageUriMain: mainImg.imageUri,
      imageUriNext: nextImg.imageUri,
    };
  }, [isUser, msg.text]);

  const markdownStyle = useMemo(
    () => ({
      body: {
        color: UI.text,
        fontSize: 16.5,
        lineHeight: 28,
        fontWeight: "600",
      },

      heading1: { color: UI.text, fontSize: 20, fontWeight: "900", marginTop: 14, marginBottom: 8 },
      heading2: { color: UI.text, fontSize: 18, fontWeight: "900", marginTop: 12, marginBottom: 8 },
      heading3: { color: UI.text, fontSize: 17, fontWeight: "900", marginTop: 10, marginBottom: 6 },

      strong: { fontWeight: "900" },
      em: { fontStyle: "italic", opacity: 0.95 },

      paragraph: { marginTop: 8, marginBottom: 8 },

      bullet_list: { marginTop: 8, marginBottom: 8 },
      ordered_list: { marginTop: 8, marginBottom: 8 },
      list_item: { marginTop: 6, marginBottom: 6 },

      bullet_list_icon: { color: C.emeraldBorder, marginRight: 10 },
      ordered_list_icon: { color: C.emeraldBorder, marginRight: 10, fontWeight: "900" },

      code_inline: {
        backgroundColor: "rgba(255,255,255,0.08)",
        borderColor: "rgba(255,255,255,0.15)",
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        fontWeight: "900",
      },

      fence: {
        backgroundColor: "rgba(0,0,0,0.45)",
        borderColor: "rgba(255,255,255,0.15)",
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        fontSize: 13,
        lineHeight: 20,
      },

      blockquote: {
        borderLeftColor: C.emeraldBorder,
        borderLeftWidth: 4,
        paddingLeft: 14,
        marginVertical: 10,
        opacity: 0.95,
      },
    }),
    []
  );

  // ✅ USER bubble styles (keep)
  const userBorder = "rgba(16,185,129,0.30)";
  const userBg = "rgba(16,185,129,0.16)";

  return (
    <View style={{ width: "100%" }}>
      {isUser ? (
        // ✅ USER: compact bubble right
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
            <Text style={{ color: UI.text, fontWeight: "900", lineHeight: 22, fontSize: 15.5 }}>
              {msg.text}
            </Text>
          </View>
        </View>
      ) : (
        // ✅ ASSISTANT: immersive full width (no card)
        <View style={{ alignItems: "flex-start", paddingVertical: 6 }}>
          {/* ✅ Main Image (if any) */}
          {!!clean(imageUriMain) && (
            <Image
              source={{ uri: imageUriMain }}
              style={{
                width: "100%",
                height: 280,
                borderRadius: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
              resizeMode="cover"
            />
          )}

          {/* ✅ Main Markdown (full width) */}
          <Markdown style={markdownStyle as any}>{main || ""}</Markdown>

          {/* ✅ NEXT MOVE (still shown, but not inside a big "card" that narrows text) */}
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
                <Image
                  source={{ uri: imageUriNext }}
                  style={{
                    width: "100%",
                    height: 260,
                    borderRadius: 16,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                  resizeMode="cover"
                />
              )}

              <Markdown style={markdownStyle as any}>{nextMoveBody}</Markdown>
            </View>
          )}

          {/* ✅ Saved Badge */}
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
  );
}