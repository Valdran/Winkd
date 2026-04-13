// ── Contact / Buddy List ──

import type { UserProfile } from "./user";

export type ContactRequestStatus = "pending_outbound" | "pending_inbound" | "accepted" | "blocked";

export interface Contact extends UserProfile {
  /** Local unique key — same as winkdId */
  id: string;
  requestStatus: ContactRequestStatus;
  /** Unread message count for badge display */
  unreadCount: number;
  /** ISO 8601 timestamp of last message, or null */
  lastMessageAt: string | null;
}

export type ContactGroup = "online" | "away" | "busy" | "offline";

export interface GroupedContacts {
  online: Contact[];
  away: Contact[];
  busy: Contact[];
  offline: Contact[];
}
