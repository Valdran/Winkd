// ── Contact Manager ──
// Handles contact list state, request flows, and QR code generation.

import type { Contact, GroupedContacts, UserStatus } from "@winkd/types";

export class ContactManager {
  private contacts = new Map<string, Contact>();

  addOrUpdate(contact: Contact): void {
    this.contacts.set(contact.id, contact);
  }

  remove(id: string): void {
    this.contacts.delete(id);
  }

  get(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  getAll(): Contact[] {
    return Array.from(this.contacts.values()).filter(
      (c) => c.requestStatus === "accepted",
    );
  }

  getGrouped(): GroupedContacts {
    const accepted = this.getAll();
    const activeStatuses: UserStatus[] = ["online", "away", "busy"];
    return {
      online: accepted.filter((c) => c.status === "online"),
      away: accepted.filter((c) => c.status === "away"),
      busy: accepted.filter((c) => c.status === "busy"),
      // Offline group = invisible or any status not in the active set
      offline: accepted.filter((c) => !activeStatuses.includes(c.status)),
    };
  }

  getPendingInbound(): Contact[] {
    return Array.from(this.contacts.values()).filter(
      (c) => c.requestStatus === "pending_inbound",
    );
  }

  /**
   * Generate the data string encoded in this user's QR code.
   * Format: winkd://add/<winkdId>
   */
  static qrPayload(winkdId: string): string {
    return `winkd://add/${encodeURIComponent(winkdId)}`;
  }

  /**
   * Parse a QR scan result back to a Winkd ID.
   * Returns null if the URL is not a valid winkd://add/ URI.
   */
  static parseQrPayload(raw: string): string | null {
    try {
      const url = new URL(raw);
      if (url.protocol !== "winkd:" || url.hostname !== "add") return null;
      return decodeURIComponent(url.pathname.slice(1));
    } catch {
      return null;
    }
  }
}
