use axum::extract::State;
use axum::response::Json;
use serde::{Deserialize, Serialize};

use crate::api::scan::AppState;

#[derive(Deserialize)]
pub(crate) struct DeleteRequest {
    #[allow(dead_code)]
    pub(crate) scan_id: String,
    pub(crate) paths: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct DeleteResponse {
    pub(crate) deleted: usize,
    pub(crate) failed: usize,
}

/// POST /api/files/delete – delete files by path.
pub(crate) async fn delete_files(
    _state: State<AppState>,
    Json(req): Json<DeleteRequest>,
) -> Json<DeleteResponse> {
    let mut deleted = 0;
    let mut failed = 0;

    for path in &req.paths {
        match std::fs::remove_file(path) {
            Ok(_) => deleted += 1,
            Err(e) => {
                tracing::warn!("Failed to delete {path}: {e}");
                failed += 1;
            }
        }
    }

    Json(DeleteResponse { deleted, failed })
}

// ---------------------------------------------------------------------------
// Hardlink  POST /api/files/hardlink
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct HardlinkRequest {
    pub(crate) source_paths: Vec<String>,
    pub(crate) target_paths: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct HardlinkResponse {
    pub(crate) hardlinked: usize,
    pub(crate) skipped: usize,
    pub(crate) failed: usize,
    pub(crate) errors: Vec<String>,
}

/// POST /api/files/hardlink
///
/// Creates hardlinks from each source path to the corresponding target path.
/// If the target already exists it is removed first, then the hardlink is created.
pub(crate) async fn hardlink_files(
    _state: State<AppState>,
    Json(req): Json<HardlinkRequest>,
) -> Json<HardlinkResponse> {
    let mut hardlinked = 0;
    let mut skipped = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    let pairs = req.source_paths.len().min(req.target_paths.len());

    for i in 0..pairs {
        let source = &req.source_paths[i];
        let target = &req.target_paths[i];

        tracing::info!("Hardlink: {source} -> {target}");

        // If target already exists, remove it first so hard_link can succeed.
        if std::path::Path::new(target).exists() {
            tracing::info!("Target {target} exists, removing before hardlink");
            if let Err(e) = std::fs::remove_file(target) {
                tracing::warn!("Failed to remove existing target {target}: {e}");
                skipped += 1;
                errors.push(format!("cannot remove existing target {target}: {e}"));
                continue;
            }
        }

        match std::fs::hard_link(source, target) {
            Ok(_) => {
                tracing::info!("Hardlink succeeded: {source} -> {target}");
                hardlinked += 1;
            }
            Err(e) => {
                tracing::warn!("Failed to hardlink {source} -> {target}: {e}");
                failed += 1;
                errors.push(format!("{source} -> {target}: {e}"));
            }
        }
    }

    Json(HardlinkResponse {
        hardlinked,
        skipped,
        failed,
        errors,
    })
}
