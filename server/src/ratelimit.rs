// ── Rate Limiter ──
// Simple fixed-window per-IP rate limiter backed by a tokio Mutex.
// Limits: login = 10/min, register = 5/min.
// No external dependencies — uses only the std + tokio primitives already present.

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Debug)]
struct Entry {
    count: u32,
    window_start: Instant,
}

#[derive(Clone, Debug)]
pub struct RateLimiter {
    entries: Arc<Mutex<HashMap<IpAddr, Entry>>>,
    limit: u32,
    window: Duration,
}

impl RateLimiter {
    pub fn new(limit: u32, window_secs: u64) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            limit,
            window: Duration::from_secs(window_secs),
        }
    }

    /// Returns `true` if the request is permitted, `false` if rate-limited.
    pub async fn check(&self, ip: IpAddr) -> bool {
        let mut map = self.entries.lock().await;
        let now = Instant::now();
        let entry = map
            .entry(ip)
            .or_insert_with(|| Entry { count: 0, window_start: now });

        if now.duration_since(entry.window_start) >= self.window {
            entry.count = 0;
            entry.window_start = now;
        }

        if entry.count >= self.limit {
            return false;
        }
        entry.count += 1;
        true
    }
}

/// Extract the real client IP from request headers, respecting common proxy headers.
/// Falls back to 127.0.0.1 when no header is present (development / direct connections).
pub fn extract_ip(headers: &axum::http::HeaderMap) -> IpAddr {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
        })
        .unwrap_or_else(|| "127.0.0.1".parse().expect("static IP"))
}
