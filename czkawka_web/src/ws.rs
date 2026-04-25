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
                        let msg = json!({
                            "type": "completed",
                            "status": match status {
                                Some(ScanStatus::Completed) => "completed",
                                Some(ScanStatus::Failed(_)) => "failed",
                                Some(ScanStatus::Stopped) => "stopped",
                                _ => "unknown",
                            }
                        });
                        let _ = socket.send(Message::Text(msg.to_string().into())).await;
                        break;
                    }
                }
            }
            _ = interval.tick() => {
                if let Some(status) = state.scan_manager.get_status(&scan_id).await {
                    match status {
                        ScanStatus::Completed | ScanStatus::Failed(_) | ScanStatus::Stopped => {
                            let status_str = match status {
                                ScanStatus::Completed => "completed",
                                ScanStatus::Failed(_) => "failed",
                                ScanStatus::Stopped => "stopped",
                                _ => "unknown",
                            };
                            let msg = json!({"type": "completed", "status": status_str});
                            let _ = socket.send(Message::Text(msg.to_string().into())).await;
                            break;
                        }
                        _ => {}
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
