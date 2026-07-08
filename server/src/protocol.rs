//! Wire protocol shared between clients and the worker (JSON over WebSocket).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Transform + state a client reports each tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub x: f32,
    pub z: f32,
    #[serde(default)]
    pub heading: f32,
    #[serde(default)]
    pub hp: f32,
    #[serde(default)]
    pub anim: String,
}

/// Public info about a player in a room.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: Uuid,
    pub name: String,
}

/// Messages sent by the client.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum ClientMsg {
    /// Join a room (creates it if missing).
    Join { room: String, name: String },
    /// Per-tick transform/state update.
    State(PlayerState),
    /// Generic gameplay action (shoot, skill, kill, …).
    Action {
        kind: String,
        #[serde(default)]
        data: serde_json::Value,
    },
    /// Latency keep-alive.
    Ping,
}

/// Messages sent by the server.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum ServerMsg {
    /// Sent to a client right after it joins.
    Welcome {
        id: Uuid,
        room: String,
        capacity: usize,
        players: Vec<PlayerInfo>,
    },
    /// A new player joined the room.
    Joined { id: Uuid, name: String },
    /// Another player's transform/state.
    State {
        id: Uuid,
        #[serde(flatten)]
        state: PlayerState,
    },
    /// Another player's gameplay action.
    Action {
        id: Uuid,
        kind: String,
        data: serde_json::Value,
    },
    /// A player left the room.
    Left { id: Uuid },
    /// The room is full — the join was rejected.
    RoomFull { capacity: usize },
    /// Protocol / server error.
    Error { message: String },
    /// Reply to Ping.
    Pong,
}

impl ServerMsg {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{\"t\":\"error\"}".into())
    }
}
