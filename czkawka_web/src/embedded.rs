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
/// - `/` or empty path         → `v2/index.html` (modern UI, the default entry point)
/// - `/classic` or `/classic/` → `index.html` (classic UI)
/// - `/classic/<file>`         → `<file>` (classic assets)
/// - `/v2/`                    → `v2/index.html` (modern UI alias)
/// - `/style.css`, `/app.js`, `/index.html` → the same files at the `web/` root
/// - anything else             → 404
pub(crate) async fn serve_static(uri: Uri) -> Response {
    let raw_path = uri.path().trim_start_matches('/');

    // The classic files stay at the `web/` root on purpose; only their URLs gain the `classic/`
    // prefix. A directory-like path still resolves to its index.html.
    let path = if raw_path.is_empty() {
        "v2/index.html".to_string()
    } else if let Some(rest) = raw_path.strip_prefix("classic/") {
        if rest.is_empty() {
            "index.html".to_string()
        } else {
            rest.to_string()
        }
    } else if raw_path == "classic" {
        "index.html".to_string()
    } else if raw_path.ends_with('/') {
        format!("{raw_path}index.html")
    } else {
        raw_path.to_string()
    };

    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_type(&path);
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
