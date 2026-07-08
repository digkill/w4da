//! Shared server state: rooms, players, broadcast fan-out.

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::protocol::{PlayerInfo, ServerMsg};

/// An envelope carried on a room's broadcast channel: who sent it + the JSON.
#[derive(Debug, Clone)]
pub struct Envelope {
    pub from: Uuid,
    pub json: Arc<str>,
}

/// A single game room (up to `capacity` players).
pub struct Room {
    pub tx: broadcast::Sender<Envelope>,
    pub players: DashMap<Uuid, PlayerInfo>,
}

impl Room {
    fn new() -> Self {
        // Buffer a healthy number of in-flight messages per room.
        let (tx, _rx) = broadcast::channel(512);
        Self {
            tx,
            players: DashMap::new(),
        }
    }
}

pub struct AppState {
    pub rooms: DashMap<String, Arc<Room>>,
    pub capacity: usize,
    pub db: Option<sqlx::MySqlPool>,
}

impl AppState {
    pub fn new(capacity: usize, db: Option<sqlx::MySqlPool>) -> Arc<Self> {
        Arc::new(Self {
            rooms: DashMap::new(),
            capacity,
            db,
        })
    }

    pub fn get_or_create_room(&self, name: &str) -> Arc<Room> {
        self.rooms
            .entry(name.to_string())
            .or_insert_with(|| Arc::new(Room::new()))
            .clone()
    }

    /// Broadcast a server message to a room, tagged with its origin.
    pub fn broadcast(room: &Room, from: Uuid, msg: &ServerMsg) {
        let env = Envelope {
            from,
            json: Arc::from(msg.to_json().as_str()),
        };
        // Err only means there are currently no subscribers — safe to ignore.
        let _ = room.tx.send(env);
    }

    /// Remove a player; drop the room if it became empty.
    pub fn remove_player(&self, room_name: &str, id: Uuid) {
        if let Some(room) = self.rooms.get(room_name).map(|r| r.clone()) {
            room.players.remove(&id);
            Self::broadcast(&room, id, &ServerMsg::Left { id });
            if room.players.is_empty() {
                self.rooms.remove(room_name);
            }
        }
    }
}
