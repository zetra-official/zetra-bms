// src/components/AiMessageBubble.tsx
import React, { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { UI } from "@/src/ui/theme";

type ChatRole = "user" | "assistant";
type ChatMsg = { id: string; role: ChatRole; text: string; ts: number };

function clean(s: any) {
  return String(s ?? "").trim();
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
 * ✅ Extract FIRST markdown image from text:
 * - Supports: ![alt](url)
 * - Works with http(s) or data:image/...base64,...
 * - Returns { body, imageUri }
 *
 * IMPORTANT:
 * If found, we remove that image markdown line/segment from body
 * so base64 never shows as text.
 */
function extractFirstMarkdownImage(fullText: string): { body: string; imageUri: string } {
  const t = clean(fullText);
  if (!t) return { body: "", imageUri: "" };

  // Capture the URL inside (...) until the first ')'
  // This is safe for http(s) and data: URLs (including base64).
  // NOTE: markdown image syntax is usually one line, but we handle extra spaces.
  const re = /!\[[^\]]*?\]\(\s*([^)]+?)\s*\)/m;

  const m = re.exec(t);
  if (!m?.[1]) return { body: fullText, imageUri: "" };

  const uri = clean(m[1]);
  if (!uri) return { body: fullText, imageUri: "" };

  // Remove only the matched markdown image segment
  const body = clean(t.replace(m[0], "").trim());

  return { body, imageUri: uri };
}

export function AiMessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";

  const border = isUser ? "rgba(16,185,129,0.30)" : "rgba(255,255,255,0.12)";
  const bg = isUser ? "rgba(16,185,129,0.16)" : "rgba(255,255,255,0.05)";
  const align: "flex-start" | "flex-end" = isUser ? "flex-end" : "flex-start";

  const { main, nextMoveBody, savedBadge, imageUriMain, imageUriNext } = useMemo(() => {
    if (isUser)
      return {
        main: msg.text,
        nextMoveBody: "",
        savedBadge: "",
        imageUriMain: "",
        imageUriNext: "",
      };

    // 1) Extract trailing saved badge line (if present)
    const a = splitFooterBadge(msg.text);

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
        fontSize: 16,
        lineHeight: 26,
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
      bullet_list_icon: { color: UI.colors.emeraldBorder, marginRight: 10 },
      ordered_list_icon: { color: UI.colors.emeraldBorder, marginRight: 10, fontWeight: "900" },

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
        borderLeftColor: UI.colors.emeraldBorder,
        borderLeftWidth: 4,
        paddingLeft: 14,
        marginVertical: 10,
        opacity: 0.95,
      },
    }),
    []
  );

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: align }}>
      <View
        style={{
          maxWidth: "92%",
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,

          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        {isUser ? (
          <Text style={{ color: UI.text, fontWeight: "900", lineHeight: 22, fontSize: 15.5 }}>
            {msg.text}
          </Text>
        ) : (
          <>
            {/* ✅ Main Image (if any) */}
            {!!clean(imageUriMain) && (
              <Image
                source={{ uri: imageUriMain }}
                style={{
                  width: 260,
                  height: 260,
                  borderRadius: 14,
                  marginBottom: 10,
                }}
                resizeMode="cover"
              />
            )}

            {/* ✅ Main Markdown */}
            <Markdown style={markdownStyle as any}>{main || ""}</Markdown>

            {/* ✅ NEXT MOVE */}
            {!!clean(nextMoveBody) && (
              <View
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: UI.colors.emeraldBorder,
                  backgroundColor: "rgba(16,185,129,0.10)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: UI.text, fontWeight: "900", marginBottom: 6 }}>🎯 NEXT MOVE</Text>

                {/* ✅ Next Move Image (if any) */}
                {!!clean(imageUriNext) && (
                  <Image
                    source={{ uri: imageUriNext }}
                    style={{
                      width: 240,
                      height: 240,
                      borderRadius: 14,
                      marginBottom: 10,
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
          </>
        )}
      </View>
    </View>
  );
}