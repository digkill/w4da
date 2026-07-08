# W4DA Multiplayer Worker (Rust)

Realtime WebSocket game server for **w4da.com**. Players join **rooms of up to 10**
and their state/actions are relayed to everyone else in the same room. An
**external Postgres** stores scores/leaderboard (optional — the worker runs
multiplayer-only if `DATABASE_URL` is empty).

Stack: **Rust · axum (WebSocket) · sqlx (Postgres) · tokio · Docker**.

## Run with Docker

```bash
cp server/.env.example server/.env        # then set DATABASE_URL to your external DB
docker compose up --build                  # worker on http://localhost:8080
```

## Run locally (without Docker)

```bash
cd server
cp .env.example .env
cargo run
```

## Configuration (`server/.env`)

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP/WebSocket port |
| `ROOM_CAPACITY` | `10` | Max players per room |
| `DATABASE_URL` | *(empty)* | External Postgres DSN; empty = no persistence |
| `RUST_LOG` | `info` | `tracing` log filter |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness probe (`ok`) |
| GET | `/api/rooms` | List active rooms and player counts |
| GET | `/api/leaderboard` | Top 20 scores (empty if no DB) |
| POST | `/api/score` | Save a run: `{ name, score, kills, wave, time_survived }` |
| GET | `/ws` | WebSocket upgrade (multiplayer) |

## WebSocket protocol (JSON)

**Client → server** (first message must be `join`):

```jsonc
{ "t": "join",  "room": "arena", "name": "Wanhells" }
{ "t": "state", "x": 5, "z": -3, "heading": 1.2, "hp": 80, "anim": "Running" }
{ "t": "action", "kind": "shoot", "data": { "dir": 1.2 } }
{ "t": "ping" }
```

**Server → client:**

```jsonc
{ "t": "welcome", "id": "<uuid>", "room": "arena", "capacity": 10, "players": [...] }
{ "t": "joined",  "id": "<uuid>", "name": "Bob" }
{ "t": "state",   "id": "<uuid>", "x": 5, "z": -3, "heading": 1.2, "hp": 80, "anim": "Running" }
{ "t": "action",  "id": "<uuid>", "kind": "shoot", "data": {...} }
{ "t": "left",    "id": "<uuid>" }
{ "t": "room_full", "capacity": 10 }
```

Notes:
- A player's own `state`/`action` is **not** echoed back.
- Joining an 11th player into a full room returns `room_full` and closes.
- Empty rooms are dropped automatically.

## Frontend client

`src/net/multiplayer.ts` (`MultiplayerClient`) wraps this protocol. Point it at
the worker via `VITE_WS_URL` (see root `.env.example`).
