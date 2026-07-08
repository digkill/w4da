# ---- Build stage ----
FROM rust:1.83-slim AS builder
WORKDIR /app

# Cache dependencies first.
COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release || true
RUN rm -rf src

# Build the real sources.
COPY src ./src
RUN cargo build --release

# ---- Runtime stage ----
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# TLS roots for connecting to the external Postgres.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/w4da-worker /usr/local/bin/w4da-worker

ENV PORT=8059
EXPOSE 8059
CMD ["w4da-worker"]
