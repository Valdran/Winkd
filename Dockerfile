# ── Stage 1: Build web app ──
FROM node:20-bookworm-slim AS web-builder

WORKDIR /build
RUN corepack enable

COPY package.json turbo.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/core/package.json packages/core/package.json

RUN pnpm install

COPY apps/web apps/web
COPY packages/types packages/types
COPY packages/ui packages/ui
COPY packages/core packages/core

RUN pnpm --filter @winkd/web build

# ── Stage 2: Build server ──
FROM rust:1.88-slim-bookworm AS server-builder

WORKDIR /build

# Pre-build dependencies using a dummy binary for layer caching
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release
RUN rm -f src/main.rs target/release/deps/winkd_server*

# Copy real source and migrations, then build
COPY server/src ./src
COPY server/migrations ./migrations
RUN touch src/main.rs
RUN cargo build --release

# ── Stage 3: Runtime ──
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=server-builder /build/target/release/winkd-server .
COPY --from=web-builder /build/apps/web/dist ./web-dist

EXPOSE 8080
CMD ["./winkd-server"]
