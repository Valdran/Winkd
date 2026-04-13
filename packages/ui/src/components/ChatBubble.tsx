// ── ChatBubble ──
// A single message bubble in the chat view.
// Handles text, system messages, Winkd/Nudge banners.

import React from "react";
import type { Message } from "@winkd/types";
import { colors } from "../tokens/colors";

interface ChatBubbleProps {
  message: Message;
  /** true = sent by the local user */
  isMine: boolean;
}

export function ChatBubble({ message, isMine }: ChatBubbleProps) {
  if (message.type === "system") {
    return (
      <div style={systemStyle}>
        {message.body}
      </div>
    );
  }

  if (message.type === "winkd") {
    return (
      <div style={winkdBannerStyle}>
        💥 {isMine ? "You sent a Winkd!" : "Someone sent you a Winkd! Your window is shaking!"}
      </div>
    );
  }

  if (message.type === "nudge") {
    return (
      <div style={winkdBannerStyle}>
        🫸 {isMine ? "You nudged!" : "You were nudged!"}
      </div>
    );
  }

  if (message.type === "text") {
    const bubbleStyle: React.CSSProperties = {
      maxWidth: "72%",
      padding: "6px 10px",
      borderRadius: 8,
      ...(isMine
        ? {
            borderBottomRightRadius: 2,
            background: colors.bubbleMe,
            border: `1px solid ${colors.bubbleMeBorder}`,
            alignSelf: "flex-end",
          }
        : {
            borderBottomLeftRadius: 2,
            background: colors.bubbleThem,
            border: `1px solid ${colors.bubbleThemBorder}`,
            alignSelf: "flex-start",
          }),
      fontSize: 12,
      color: colors.textDark,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
      lineHeight: 1.4,
      wordBreak: "break-word",
    };

    return <div style={bubbleStyle}>{message.body}</div>;
  }

  return null;
}

const systemStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 10,
  color: "rgba(200,220,255,0.6)",
  fontStyle: "italic",
  padding: "4px 0",
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
};

const winkdBannerStyle: React.CSSProperties = {
  background: colors.winkdBanner,
  border: `1px solid ${colors.winkdBannerBorder}`,
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#6a3a00",
  textAlign: "center",
  alignSelf: "stretch",
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
};
