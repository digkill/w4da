//! W4DA multiplayer worker: WebSocket game rooms (≤10 players) + score API.

mod db;
mod protocol;
mod state;
mod ws;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use state::AppState;

#[derive(Serialize)]
struct RoomStat {
    room: String,
    players: usize,
    capacity: usize,
}

async fn health() -> &'static str {
    "ok"
}

async fn rooms(State(state): State<Arc<AppState>>) -> Json<Vec<RoomStat>> {
    let list = state
        .rooms
        .iter()
        .map(|r| RoomStat {
            room: r.key().clone(),
            players: r.value().players.len(),
            capacity: state.capacity,
        })
        .collect();
    Json(list)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,w4da_worker=info".into()),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let capacity: usize = std::env::var("ROOM_CAPACITY")
        .ok()
        .and_then(|c| c.parse().ok())
        .unwrap_or(10);

    let pool = db::connect().await;
    let app_state = AppState::new(capacity, pool);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws::ws_handler))
        .route("/api/rooms", get(rooms))
        .route("/api/score", post(db::post_score))
        .route("/api/leaderboard", get(db::leaderboard))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(app_state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("W4DA worker listening on {addr} (room capacity {capacity})");
    axum::serve(listener, app).await?;
    Ok(())
}
