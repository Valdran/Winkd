# ── Stage 1: Build ──
FROM rust:1.86-slim-bookworm AS builder

WORKDIR /build

# Pre-build dependencies using a dummy binary for layer caching
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release
RUN rm -f src/main.rs target/release/deps/winkd_server*

# Copy real source and build
COPY server/src ./src
RUN touch src/main.rs
RUN cargo build --release

# ── Stage 2: Runtime ──
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/target/release/winkd-server .

EXPOSE 8080
CMD ["./winkd-server"]
