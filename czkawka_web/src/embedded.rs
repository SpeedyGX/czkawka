use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::Embed;

/// Compile-time embedded static files from the `web/` directory.
///
/// The `#[folder]` path is relative to the crate root (`czkawka_web/`),
/// which is where `cargo build` resolves paths from within the workspace.
#[derive(Embed)]
#[folder = "web/"]
struct Assets;

/// Serve a static file from the embedded archive.
///
/// Routing:
/// - `/` or empty path → `index.html`
/// - `/style.css`     → `style.css`
/// - `/app.js`        → `app.js`
/// - anything else    → 404
pub(crate) async fn serve_static(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Normalise: empty path or bare "/" maps to index.html.
    let path = if path.is_empty() || path == "/" { "index.html" } else { path };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_type(path);
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime)],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            b"404 Not Found".to_vec(),
        )
            .into_response(),
    }
}

/// Map file extension to MIME type.
///
/// Only the extensions actually used by the czkawka_web frontend are listed.
/// The fallback `application/octet-stream` is safe for any unlisted type.
fn mime_type(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") {
        "text/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else {
        "application/octet-stream"
    }
}
