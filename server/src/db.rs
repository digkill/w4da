//! External MySQL (optional): score persistence + leaderboard.

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use sqlx::{mysql::MySqlPoolOptions, MySqlPool, Row};
use std::sync::Arc;
use std::time::Duration;

use crate::state::AppState;

/// Percent-encode a userinfo component (username/password) for the DSN.
fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Resolve the connection string: prefer `DATABASE_URL`, otherwise build a MySQL
/// DSN from Laravel-style `DB_*` vars (encoding the credentials).
fn resolve_dsn() -> Option<String> {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        if !url.trim().is_empty() {
            return Some(url);
        }
    }
    let host = std::env::var("DB_HOST").ok()?;
    let db = std::env::var("DB_DATABASE").ok()?;
    let user = std::env::var("DB_USERNAME").unwrap_or_default();
    let pass = std::env::var("DB_PASSWORD").unwrap_or_default();
    let port = std::env::var("DB_PORT").unwrap_or_else(|_| "3306".into());
    Some(format!(
        "mysql://{}:{}@{}:{}/{}",
        enc(&user),
        enc(&pass),
        host,
        port,
        db
    ))
}

/// Connect to the external DB and ensure the schema exists.
/// Returns None if no connection info is set (server still runs multiplayer-only).
pub async fn connect() -> Option<MySqlPool> {
    let dsn = match resolve_dsn() {
        Some(d) => d,
        None => {
            tracing::warn!("no DATABASE_URL / DB_* config — running without persistence");
            return None;
        }
    };

    let pool = match MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(8))
        .connect(&dsn)
        .await
    {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("failed to connect to MySQL: {e}");
            return None;
        }
    };

    if let Err(e) = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS scores (
            id             BIGINT AUTO_INCREMENT PRIMARY KEY,
            name           VARCHAR(64) NOT NULL,
            score          INT         NOT NULL DEFAULT 0,
            kills          INT         NOT NULL DEFAULT 0,
            wave           INT         NOT NULL DEFAULT 0,
            time_survived  INT         NOT NULL DEFAULT 0,
            created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        "#,
    )
    .execute(&pool)
    .await
    {
        tracing::error!("failed to init schema: {e}");
        return None;
    }

    tracing::info!("connected to MySQL and ensured schema");
    Some(pool)
}

#[derive(Debug, Deserialize)]
pub struct ScoreIn {
    pub name: String,
    #[serde(default)]
    pub score: i32,
    #[serde(default)]
    pub kills: i32,
    #[serde(default)]
    pub wave: i32,
    #[serde(default)]
    pub time_survived: i32,
}

#[derive(Debug, Serialize)]
pub struct ScoreRow {
    pub name: String,
    pub score: i32,
    pub kills: i32,
    pub wave: i32,
    pub time_survived: i32,
}

pub async fn post_score(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ScoreIn>,
) -> impl IntoResponse {
    let Some(pool) = state.db.as_ref() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "persistence disabled").into_response();
    };
    let name: String = body.name.chars().take(24).collect();
    match sqlx::query(
        "INSERT INTO scores (name, score, kills, wave, time_survived) VALUES (?,?,?,?,?)",
    )
    .bind(name)
    .bind(body.score.max(0))
    .bind(body.kills.max(0))
    .bind(body.wave.max(0))
    .bind(body.time_survived.max(0))
    .execute(pool)
    .await
    {
        Ok(_) => (StatusCode::CREATED, "ok").into_response(),
        Err(e) => {
            tracing::error!("insert score failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, "db error").into_response()
        }
    }
}

pub async fn leaderboard(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let Some(pool) = state.db.as_ref() else {
        return Json(Vec::<ScoreRow>::new()).into_response();
    };
    match sqlx::query(
        "SELECT name, score, kills, wave, time_survived FROM scores ORDER BY score DESC LIMIT 20",
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let out: Vec<ScoreRow> = rows
                .iter()
                .map(|r| ScoreRow {
                    name: r.get("name"),
                    score: r.get("score"),
                    kills: r.get("kills"),
                    wave: r.get("wave"),
                    time_survived: r.get("time_survived"),
                })
                .collect();
            Json(out).into_response()
        }
        Err(e) => {
            tracing::error!("leaderboard query failed: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, "db error").into_response()
        }
    }
}
