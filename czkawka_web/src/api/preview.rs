use std::collections::HashMap;

use axum::extract::Query;
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use czkawka_core::common::image::get_dynamic_image_from_path;

/// GET /api/preview/image?path=/path/to/file.jpg&width=300&height=300
///
/// Returns a JPEG thumbnail of the given image file. The `width` and `height`
/// query parameters are optional and default to 300 each.
pub(crate) async fn image_preview(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let path = match params.get("path") {
        Some(p) => p.clone(),
        None => return (StatusCode::BAD_REQUEST, "missing path").into_response(),
    };

    if path.split(std::path::MAIN_SEPARATOR).any(|c| c == "..") {
        return (StatusCode::BAD_REQUEST, "path traversal rejected").into_response();
    }

    let width: u32 = params.get("width").and_then(|v| v.parse().ok()).unwrap_or(300);
    let height: u32 = params.get("height").and_then(|v| v.parse().ok()).unwrap_or(300);

    let path_for_error = path.clone();

    let result = tokio::task::spawn_blocking(move || {
        let loaded = match get_dynamic_image_from_path(&path, None) {
            Ok(img) => img,
            Err(e) => {
                tracing::warn!("Image preview failed to load {path}: {e}");
                return Err((StatusCode::NOT_FOUND, "cannot load image"));
            }
        };

        let resized = loaded.image.resize(width, height, image::imageops::FilterType::Lanczos3);

        let mut buf = std::io::Cursor::new(Vec::new());
        if resized.write_to(&mut buf, image::ImageFormat::Jpeg).is_err() {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "encode error"));
        }

        Ok(buf.into_inner())
    })
    .await;

    match result {
        Ok(Ok(data)) => {
            (StatusCode::OK, [(header::CONTENT_TYPE, "image/jpeg")], data).into_response()
        }
        Ok(Err((status, msg))) => (status, msg).into_response(),
        Err(_join_error) => {
            tracing::error!("Image preview blocking task panicked for {path_for_error}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal error",
            )
                .into_response()
        }
    }
}

/// GET /api/preview/video?path=/path/to/thumbnail.jpg
///
/// Serves a pre-generated video thumbnail (JPEG) from the cache directory.
/// The `path` is the full filesystem path to the thumbnail file as returned
/// in the similar-videos scan results (`thumbnail_path`).
pub(crate) async fn video_preview(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let Some(path) = params.get("path") else {
        return (StatusCode::BAD_REQUEST, "missing path").into_response();
    };

    if path.split(std::path::MAIN_SEPARATOR).any(|c| c == "..") {
        return (StatusCode::BAD_REQUEST, "path traversal rejected").into_response();
    }

    match tokio::fs::read(path).await {
        Ok(data) => {
            (StatusCode::OK, [(header::CONTENT_TYPE, "image/jpeg")], data).into_response()
        }
        Err(e) => {
            tracing::warn!("Video preview failed to read {path}: {e}");
            (StatusCode::NOT_FOUND, "thumbnail not found").into_response()
        }
    }
}
