// ── StatusPill ──
// Clickable status selector pill (Online / Away / Busy / Invisible)

import React from "react";
import type { UserStatus } from "@winkd/types";
import { colors } from "../tokens/colors";

const PILL_STYLES: Record<UserStatus, React.CSSProperties> = {
  online: {
    background: "rgba(0,200,0,0.18)",
    borderColor: "rgba(0,180,0,0.45)",
    color: "#c0ffb0",
  },
  away: {
    background: "rgba(255,170,0,0.18)",
    borderColor: "rgba(220,140,0,0.45)",
    color: "#ffe8a0",
  },
  busy: {
    background: "rgba(220,40,40,0.18)",
    borderColor: "rgba(200,30,30,0.45)",
    color: "#ffb0b0",
  },
  invisible: {
    background: "rgba(170,170,170,0.14)",
    borderColor: "rgba(150,150,150,0.38)",
    color: colors.textGhost,
  },
};

const LABELS: Record<UserStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  invisible: "Invisible",
};

interface StatusPillProps {
  status: UserStatus;
  active?: boolean;
  onClick?: (status: UserStatus) => void;
}

export function StatusPill({ status, active, onClick }: StatusPillProps) {
  const base = PILL_STYLES[status];

  const style: React.CSSProperties = {
    ...base,
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    border: "1px solid",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
    filter: active ? "brightness(1.3)" : undefined,
    boxShadow: active ? "0 0 6px rgba(255,255,255,0.2)" : undefined,
    fontFamily: "'Segoe UI', Tahoma, sans-serif",
  };

  return (
    <button
      style={style}
      onClick={() => onClick?.(status)}
      aria-pressed={active}
    >
      {LABELS[status]}
    </button>
  );
}
