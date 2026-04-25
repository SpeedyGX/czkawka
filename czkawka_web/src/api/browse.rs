use std::collections::HashMap;

use axum::extract::Query;
use axum::response::Json;
use serde::Serialize;

#[derive(Serialize)]
struct BrowseEntry {
    name: String,
    #[serde(rename = "is_dir")]
    is_dir: bool,
    path: String,
}

/// GET /api/browse?path=/some/directory
///
/// Lists the contents of a directory. Returns a JSON structure with the
/// current path, parent path, entries sorted with directories first
/// (alphabetically, case-insensitive), and an optional error field.
pub(crate) async fn handle_browse(
    Query(params): Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let raw_path = params.get("path").map(String::as_str).unwrap_or("/");

    // Security: reject `..` path components to prevent directory traversal.
    if raw_path.split(std::path::MAIN_SEPARATOR).any(|c| c == "..") {
        return Json(serde_json::json!({
            "current_path": raw_path,
            "parent_path": null,
            "entries": [],
            "error": "Path traversal rejected"
        }));
    }

    let path = std::path::Path::new(raw_path);

    if !path.exists() {
        return Json(serde_json::json!({
            "current_path": raw_path,
            "parent_path": parent_path_str(path),
            "entries": [],
            "error": "Path does not exist"
        }));
    }

    if !path.is_dir() {
        return Json(serde_json::json!({
            "current_path": raw_path,
            "parent_path": parent_path_str(path),
            "entries": [],
            "error": "Not a directory"
        }));
    }

    let read_dir = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(e) => {
            let msg = match e.kind() {
                std::io::ErrorKind::PermissionDenied => "Permission denied",
                _ => "Failed to read directory",
            };
            return Json(serde_json::json!({
                "current_path": raw_path,
                "parent_path": parent_path_str(path),
                "entries": [],
                "error": msg
            }));
        }
    };

    let mut entries: Vec<BrowseEntry> = Vec::new();

    for entry in read_dir {
        match entry {
            Ok(e) => {
                let name = e.file_name().to_string_lossy().to_string();
                let is_dir = e.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                let full_path = e.path().to_string_lossy().to_string();
                entries.push(BrowseEntry { name, is_dir, path: full_path });
            }
            Err(e) => {
                tracing::warn!("Failed to read entry in {raw_path}: {e}");
            }
        }
    }

    // Sort: directories first (alphabetically, case-insensitive), then files.
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            // Reverse bool cmp so that `true` (dir) sorts before `false` (file).
            a.is_dir.cmp(&b.is_dir).reverse()
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    // Prepend parent-directory navigation entry ("..") when not at root.
    let mut display_entries = Vec::new();
    if let Some(parent) = path.parent() {
        if parent.as_os_str() != "" {
            display_entries.push(BrowseEntry {
                name: "..".to_string(),
                is_dir: true,
                path: parent.to_string_lossy().to_string(),
            });
        }
    }
    display_entries.extend(entries);

    Json(serde_json::json!({
        "current_path": path.to_string_lossy(),
        "parent_path": parent_path_str(path),
        "entries": display_entries,
        "error": null
    }))
}

/// Return the parent path as a string, or `None` when at the filesystem root
/// (where [`std::path::Path::parent`] yields an empty path).
fn parent_path_str(path: &std::path::Path) -> Option<String> {
    let parent = path.parent()?;
    let s = parent.to_string_lossy();
    if s.is_empty() { None } else { Some(s.to_string()) }
}
