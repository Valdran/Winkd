// ── Presence Manager ──
// Tracks which users are connected and their current status.
// Phase 0: in-memory only. Phase 1: backed by Redis.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserStatus {
    Online,
    Away,
    Busy,
    Invisible,
}

#[derive(Debug, Clone)]
pub struct PresenceEntry {
    pub status: UserStatus,
    pub mood: String,
}

#[derive(Clone, Default)]
pub struct PresenceStore(Arc<RwLock<HashMap<String, PresenceEntry>>>);

impl PresenceStore {
    pub async fn set(&self, user_id: &str, entry: PresenceEntry) {
        self.0.write().await.insert(user_id.to_string(), entry);
    }

    pub async fn remove(&self, user_id: &str) {
        self.0.write().await.remove(user_id);
    }

    pub async fn get(&self, user_id: &str) -> Option<PresenceEntry> {
        self.0.read().await.get(user_id).cloned()
    }

    pub async fn online_count(&self) -> usize {
        self.0.read().await.len()
    }
}
