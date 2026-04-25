use axum::extract::State;
use axum::response::Json;
use serde_json::{json, Value};

use crate::api::scan::AppState;

/// GET /api/results/{scan_id}
pub(crate) async fn get_results(
    State(state): State<AppState>,
    axum::extract::Path(scan_id): axum::extract::Path<String>,
) -> Result<Json<Value>, (axum::http::StatusCode, &'static str)> {
    let scan_manager = &state.scan_manager;
    let scans = scan_manager.scans.lock().await;

    let scan = scans.get(&scan_id).ok_or((axum::http::StatusCode::NOT_FOUND, "scan_id not found"))?;

    let result = match &scan.result_json {
        Some(data) => json!({
            "status": format!("{:?}", scan.status),
            "results": data,
        }),
        None => json!({
            "status": format!("{:?}", scan.status),
            "results": null,
        }),
    };

    Ok(Json(result))
}
