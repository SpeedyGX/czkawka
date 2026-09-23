use axum::Json;

pub(crate) async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}
