import React from "react";
import { Platform, StyleSheet, Text, type TextStyle } from "react-native";

export const CHAT_MD_BOLD: TextStyle = { fontWeight: "700" };
export const CHAT_MD_ITALIC: TextStyle = { fontStyle: "italic" };
export const CHAT_MD_CODE: TextStyle = {
  fontFamily: Platform.select({
    web: "ui-monospace, SFMono-Regular, Menlo, monospace",
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
  backgroundColor: "rgba(0,0,0,0.06)",
  color: "#1D1C1D",
};

const CHAT_INLINE_MD_RE =
  /(\*\*((?:[^*]|\*(?!\*))+)\*\*)|(_((?:[^_]|\_(?!_))+)_)|(`([^`\n]+)`)/g;

export type RenderChatInlineMarkdownOptions = {
  /** Parent text style — nested spans inherit color/size on web. */
  baseStyle?: TextStyle;
};

function mdBoldStyle(base?: TextStyle): TextStyle {
  return base ? { ...base, ...CHAT_MD_BOLD } : CHAT_MD_BOLD;
}

function mdItalicStyle(base?: TextStyle): TextStyle {
  return base ? { ...base, ...CHAT_MD_ITALIC } : CHAT_MD_ITALIC;
}

function mdCodeStyle(base?: TextStyle): TextStyle {
  return base
    ? { ...base, ...CHAT_MD_CODE, color: CHAT_MD_CODE.color ?? base.color }
    : CHAT_MD_CODE;
}

/** Plain-text fallback for labels, tooltips, and one-line summaries. */
export function stripChatInlineMarkdown(text: string): string {
  if (!text) return "";
  if (!/\*\*|_|`/.test(text)) return text;

  const re = new RegExp(CHAT_INLINE_MD_RE.source, "g");
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out += text.slice(last, match.index);
    if (match[1] !== undefined) out += stripChatInlineMarkdown(match[2]);
    else if (match[3] !== undefined) out += stripChatInlineMarkdown(match[4]);
    else if (match[5] !== undefined) out += match[6];
    last = match.index + match[0].length;
  }
  if (last < text.length) out += text.slice(last);
  return out;
}

/** Parses **bold**, _italic_, `code` — supports nested combinations (e.g. **_both_**). */
export function renderChatInlineMarkdown(
  text: string,
  options?: RenderChatInlineMarkdownOptions,
): React.ReactNode[] {
  if (!text) return [];
  if (!/\*\*|_|`/.test(text)) return [text];

  const base = options?.baseStyle;
  const re = new RegExp(CHAT_INLINE_MD_RE.source, "g");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <Text key={k++} style={mdBoldStyle(base)}>
          {renderChatInlineMarkdown(match[2], options)}
        </Text>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <Text key={k++} style={mdItalicStyle(base)}>
          {renderChatInlineMarkdown(match[4], options)}
        </Text>,
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <Text key={k++} style={mdCodeStyle(base)}>
          {match[6]}
        </Text>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Text wrapper for inbox previews and thread bodies. */
export function ChatInlineMarkdownText({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}) {
  const baseStyle = StyleSheet.flatten(style);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {renderChatInlineMarkdown(text, { baseStyle })}
    </Text>
  );
}

const HIDDEN_MARKER: TextStyle = { color: "transparent" };

/**
 * Composer overlay — keeps marker characters in the layout (invisible) so the
 * caret in the transparent TextInput stays aligned with the formatted preview.
 */
export function renderChatComposerPreview(text: string): React.ReactNode[] {
  if (!text) return [];
  if (!/\*\*|_|`/.test(text)) return [text];

  const re = new RegExp(CHAT_INLINE_MD_RE.source, "g");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>**</Text>);
      nodes.push(
        <Text key={k++} style={CHAT_MD_BOLD}>
          {renderChatComposerPreview(match[2])}
        </Text>,
      );
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>**</Text>);
    } else if (match[3] !== undefined) {
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>_</Text>);
      nodes.push(
        <Text key={k++} style={CHAT_MD_ITALIC}>
          {renderChatComposerPreview(match[4])}
        </Text>,
      );
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>_</Text>);
    } else if (match[5] !== undefined) {
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>`</Text>);
      nodes.push(<Text key={k++} style={CHAT_MD_CODE}>{match[6]}</Text>);
      nodes.push(<Text key={k++} style={HIDDEN_MARKER}>`</Text>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Pending toolbar toggles only — styles full value without extra marker width. */
export function renderChatComposerPendingPreview(
  text: string,
  pending: { bold?: boolean; italic?: boolean; code?: boolean },
): React.ReactNode[] {
  if (!text) return [];
  if (pending.code) return [<Text style={CHAT_MD_CODE}>{text}</Text>];
  if (pending.bold) return [<Text style={CHAT_MD_BOLD}>{text}</Text>];
  if (pending.italic) return [<Text style={CHAT_MD_ITALIC}>{text}</Text>];
  return [text];
}
