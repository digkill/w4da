//! WebSocket handling: one connection = one player in one room.

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use uuid::Uuid;

use crate::protocol::{ClientMsg, PlayerInfo, ServerMsg};
use crate::state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let id = Uuid::new_v4();

    // 1) First message must be Join.
    let (room_name, name) = loop {
        match receiver.next().await {
            Some(Ok(Message::Text(txt))) => match serde_json::from_str::<ClientMsg>(&txt) {
                Ok(ClientMsg::Join { room, name }) => break (room, name),
                Ok(ClientMsg::Ping) => {
                    let _ = sender.send(Message::Text(ServerMsg::Pong.to_json())).await;
                }
                Ok(_) => {
                    let _ = sender
                        .send(Message::Text(
                            ServerMsg::Error {
                                message: "expected join".into(),
                            }
                            .to_json(),
                        ))
                        .await;
                }
                Err(_) => { /* ignore malformed pre-join frames */ }
            },
            Some(Ok(Message::Close(_))) | Some(Err(_)) | None => return,
            _ => {}
        }
    };

    let room = state.get_or_create_room(&room_name);

    // 2) Capacity check.
    if room.players.len() >= state.capacity {
        let _ = sender
            .send(Message::Text(
                ServerMsg::RoomFull {
                    capacity: state.capacity,
                }
                .to_json(),
            ))
            .await;
        return;
    }

    // 3) Register + subscribe (subscribe before announcing so nothing is missed).
    let mut rx = room.tx.subscribe();
    let name = if name.trim().is_empty() {
        format!("Guest-{}", &id.to_string()[..4])
    } else {
        name.chars().take(24).collect()
    };
    room.players.insert(id, PlayerInfo { id, name: name.clone() });

    let existing: Vec<PlayerInfo> = room
        .players
        .iter()
        .filter(|p| *p.key() != id)
        .map(|p| p.value().clone())
        .collect();

    let _ = sender
        .send(Message::Text(
            ServerMsg::Welcome {
                id,
                room: room_name.clone(),
                capacity: state.capacity,
                players: existing,
            }
            .to_json(),
        ))
        .await;

    AppState::broadcast(&room, id, &ServerMsg::Joined { id, name });
    tracing::info!(%id, room = %room_name, "player joined ({}/{})", room.players.len(), state.capacity);

    // 4a) Outbound task: room broadcast -> this client (skip our own frames).
    let mut send_task = tokio::spawn(async move {
        while let Ok(env) = rx.recv().await {
            if env.from == id {
                continue;
            }
            if sender.send(Message::Text(env.json.to_string())).await.is_err() {
                break;
            }
        }
    });

    // 4b) Inbound task: this client -> room broadcast.
    let room_in = room.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(txt) => {
                    let Ok(cm) = serde_json::from_str::<ClientMsg>(&txt) else {
                        continue;
                    };
                    match cm {
                        ClientMsg::State(state) => {
                            AppState::broadcast(&room_in, id, &ServerMsg::State { id, state });
                        }
                        ClientMsg::Action { kind, data } => {
                            AppState::broadcast(
                                &room_in,
                                id,
                                &ServerMsg::Action { id, kind, data },
                            );
                        }
                        ClientMsg::Ping | ClientMsg::Join { .. } => { /* no-op after join */ }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 5) When either side ends, tear down and remove the player.
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    state.remove_player(&room_name, id);
    tracing::info!(%id, room = %room_name, "player left");
}
