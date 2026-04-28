use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::extract::Path;
use axum::response::IntoResponse;
use serde_json::json;
use tokio::sync::broadcast;

use crate::api::scan::AppState;
use crate::scan_manager::ScanStatus;

/// GET /api/scan/progress/{scan_id} – WebSocket upgrade
pub(crate) async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, scan_id))
}

async fn handle_socket(mut socket: WebSocket, state: AppState, scan_id: String) {
    // Subscribe to progress broadcast for this scan
    let mut rx = match state.scan_manager.subscribe_progress(&scan_id).await {
        Some(rx) => rx,
        None => {
            let msg = json!({"error": "scan_id not found"}).to_string();
            let _ = socket.send(Message::Text(msg.into())).await;
            return;
        }
    };

    let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(200));

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(progress) => {
                        let msg = json!({
                            "type": "progress",
                            "stage": format!("{:?}", progress.sstage),
                            "current": progress.entries_checked,
                            "total": progress.entries_to_check,
                            "current_size": progress.bytes_checked,
                            "total_size": progress.bytes_to_check,
                        });
                        if socket.send(Message::Text(msg.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("WebSocket lagged by {n} messages for scan {scan_id}");
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        let status = state.scan_manager.get_status(&scan_id).await;
                        let (status_str, reason) = match status {
                            Some(ScanStatus::Completed) => ("completed", None),
                            Some(ScanStatus::Failed(reason)) => ("failed", Some(reason)),
                            Some(ScanStatus::Stopped) => ("stopped", None),
                            _ => ("unknown", None),
                        };
                        let msg = if let Some(reason) = reason {
                            json!({"type": "completed", "status": status_str, "reason": reason})
                        } else {
                            json!({"type": "completed", "status": status_str})
                        };
                        let _ = socket.send(Message::Text(msg.to_string().into())).await;
                        break;
                    }
                }
            }
            _ = interval.tick() => {
                if let Some(status) = state.scan_manager.get_status(&scan_id).await {
                    match status {
                        ScanStatus::Completed => {
                            let msg = json!({"type": "completed", "status": "completed"});
                            let _ = socket.send(Message::Text(msg.to_string().into())).await;
                            break;
                        }
                        ScanStatus::Failed(reason) => {
                            let msg = json!({"type": "completed", "status": "failed", "reason": reason});
                            let _ = socket.send(Message::Text(msg.to_string().into())).await;
                            break;
                        }
                        ScanStatus::Stopped => {
                            let msg = json!({"type": "completed", "status": "stopped"});
                            let _ = socket.send(Message::Text(msg.to_string().into())).await;
                            break;
                        }
                        ScanStatus::Running => {}
                    }
                }
            }
            msg = socket.recv() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }
}
