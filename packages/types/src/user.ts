// ── User / Identity ──

/** Four-digit numeric disambiguator, zero-padded. e.g. "4821" */
export type WinkdDiscriminator = string;

/** Full Winkd ID: "username#XXXX" */
export type WinkdId = `${string}#${WinkdDiscriminator}`;

export type UserStatus = "online" | "away" | "busy" | "invisible";

export interface UserProfile {
  winkdId: WinkdId;
  displayName: string;
  /** Free-text mood line shown under display name. Max 100 chars. */
  moodMessage: string;
  status: UserStatus;
  /** Base64-encoded avatar image, or null to use initials fallback */
  avatarData: string | null;
}

export interface OwnProfile extends UserProfile {
  /** Session token for WebSocket auth */
  sessionToken: string;
}
