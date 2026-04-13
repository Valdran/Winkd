// ── Avatar ──
// Square contact avatar with status dot. Supports image or initials fallback.

import React from "react";
import type { UserStatus } from "@winkd/types";
import { colors } from "../tokens/colors";

const GRADIENT_PAIRS: [string, string][] = [
  ["#4a90e2", "#1a5acc"],
  ["#7b5ea7", "#4a2d7a"],
  ["#e25c5c", "#a02020"],
  ["#3aab6e", "#1a7040"],
  ["#e2904a", "#a05020"],
  ["#4ac4e2", "#1a80a0"],
];

function gradientForInitials(initials: string): string {
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % GRADIENT_PAIRS.length;
  const [from, to] = GRADIENT_PAIRS[idx]!;
  return `linear-gradient(135deg, ${from}, ${to})`;
}

const STATUS_DOT_COLOR: Record<UserStatus, string> = {
  online: colors.online,
  away: colors.away,
  busy: colors.busy,
  invisible: colors.offline,
};

interface AvatarProps {
  displayName: string;
  avatarData?: string | null;
  status?: UserStatus;
  size?: number;
}

export function Avatar({ displayName, avatarData, status, size = 32 }: AvatarProps) {
  const initials = displayName
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  const dotSize = Math.round(size * 0.28);
  const dotOffset = -Math.round(dotSize * 0.2);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 5,
    position: "relative",
    flexShrink: 0,
    overflow: "visible",
    boxShadow: "0 1px 5px rgba(0,0,80,0.25)",
  };

  const innerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 5,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: avatarData ? undefined : gradientForInitials(initials || "??"),
    fontFamily: "'Segoe UI', Tahoma, sans-serif",
    fontSize: Math.round(size * 0.35),
    fontWeight: 700,
    color: colors.textWhite,
    userSelect: "none",
  };

  const dotStyle: React.CSSProperties = {
    position: "absolute",
    bottom: dotOffset,
    right: dotOffset,
    width: dotSize,
    height: dotSize,
    borderRadius: "50%",
    background: status ? STATUS_DOT_COLOR[status] : colors.offline,
    border: "1.5px solid rgba(20,50,100,0.6)",
  };

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {avatarData ? (
          <img
            src={avatarData}
            alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials || "?"
        )}
      </div>
      {status && <div style={dotStyle} />}
    </div>
  );
}
