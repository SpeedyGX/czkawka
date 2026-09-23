use std::collections::HashMap;
use std::path::Path;

use axum::body::{Body, Bytes};
use axum::extract::Path as PathParam;
use axum::extract::Query;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

/// Chunk size used when streaming a file body to the client (64 KiB).
const STREAM_CHUNK: u64 = 64 * 1024;

// ---------------------------------------------------------------------------
// GET /api/file/{name}
// ---------------------------------------------------------------------------

/// Outcome of parsing a `Range` request header against the file length.
enum RangeResolution {
    /// No (valid) range requested – serve the whole file with `200`.
    Full,
    /// A single satisfiable range – serve it with `206`.
    Partial { start: u64, end: u64 },
    /// A syntactically valid but unsatisfiable range – respond `416`.
    Unsatisfiable,
}

/// GET /api/file/{name}?path=/path/to/file
///
/// Streams a file from disk with a hand-rolled MIME map so files can be viewed
/// or played directly in the browser. Supports a single HTTP `Range` request so
/// video/audio seeking works, and never buffers the whole file in memory.
///
/// The `{name}` path segment is purely cosmetic: browsers use the last URL
/// segment as the tab title, so naming it after the file gives a useful tab
/// label. The real path always comes from the `path` query parameter.
///
/// Access control matches the rest of the API: the server is bound to localhost
/// with no authentication, and the existing trust model (the user picks the
/// paths) applies. `..` components are rejected to keep the endpoint from being
/// trivially turned into a directory-traversal reader.
pub(crate) async fn get_file(
    PathParam(_name): PathParam<String>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let Some(raw_path) = params.get("path") else {
        return (StatusCode::BAD_REQUEST, "missing path").into_response();
    };

    if raw_path.split(std::path::MAIN_SEPARATOR).any(|c| c == "..") {
        return (StatusCode::BAD_REQUEST, "path traversal rejected").into_response();
    }

    let metadata = match tokio::fs::metadata(raw_path).await {
        Ok(metadata) => metadata,
        Err(e) => {
            tracing::warn!("File request failed to stat {raw_path}: {e}");
            return (StatusCode::NOT_FOUND, "file not found").into_response();
        }
    };

    if metadata.is_dir() {
        return (StatusCode::BAD_REQUEST, "path is a directory").into_response();
    }

    let total = metadata.len();
    let content_type = mime_type(raw_path);

    let resolution = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map_or(RangeResolution::Full, |value| parse_range(value, total));

    let (status, start, length, content_range) = match resolution {
        RangeResolution::Full => (StatusCode::OK, 0, total, None),
        RangeResolution::Partial { start, end } => (
            StatusCode::PARTIAL_CONTENT,
            start,
            end - start + 1,
            Some(format!("bytes {start}-{end}/{total}")),
        ),
        RangeResolution::Unsatisfiable => {
            let mut response =
                (StatusCode::RANGE_NOT_SATISFIABLE, "range not satisfiable").into_response();
            let value = HeaderValue::from_str(&format!("bytes */{total}"))
                .expect("numeric Content-Range is always a valid header value");
            response.headers_mut().insert(header::CONTENT_RANGE, value);
            return response;
        }
    };

    let mut file = match tokio::fs::File::open(raw_path).await {
        Ok(file) => file,
        Err(e) => {
            tracing::warn!("File request failed to open {raw_path}: {e}");
            return (StatusCode::NOT_FOUND, "file not found").into_response();
        }
    };

    if start > 0
        && let Err(e) = file.seek(std::io::SeekFrom::Start(start)).await
    {
        tracing::warn!("File request failed to seek {raw_path}: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, "cannot read file").into_response();
    }

    let mut response = Response::new(Body::from_stream(stream_body(file, length)));
    *response.status_mut() = status;

    let out = response.headers_mut();
    out.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    out.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    out.insert(header::CONTENT_DISPOSITION, HeaderValue::from_static("inline"));
    let content_length = HeaderValue::from_str(&length.to_string())
        .expect("numeric Content-Length is always a valid header value");
    out.insert(header::CONTENT_LENGTH, content_length);
    if let Some(content_range) = content_range {
        let value = HeaderValue::from_str(&content_range)
            .expect("numeric Content-Range is always a valid header value");
        out.insert(header::CONTENT_RANGE, value);
    }

    response
}

/// Parse a single `Range` header value of the form `bytes=start-end`,
/// `bytes=start-` or `bytes=-suffix`. Multi-range requests and malformed
/// values fall back to serving the whole file, as the RFCs permit.
fn parse_range(value: &str, total: u64) -> RangeResolution {
    let Some(spec) = value.strip_prefix("bytes=") else {
        return RangeResolution::Full;
    };
    let spec = spec.trim();
    if spec.contains(',') {
        return RangeResolution::Full;
    }
    let Some((start_raw, end_raw)) = spec.split_once('-') else {
        return RangeResolution::Full;
    };

    if total == 0 {
        return RangeResolution::Unsatisfiable;
    }

    if start_raw.is_empty() {
        // Suffix range: the last N bytes of the file.
        let Ok(suffix) = end_raw.trim().parse::<u64>() else {
            return RangeResolution::Full;
        };
        if suffix == 0 {
            return RangeResolution::Unsatisfiable;
        }
        let length = suffix.min(total);
        return RangeResolution::Partial {
            start: total - length,
            end: total - 1,
        };
    }

    let Ok(start) = start_raw.trim().parse::<u64>() else {
        return RangeResolution::Full;
    };
    if start >= total {
        return RangeResolution::Unsatisfiable;
    }

    if end_raw.is_empty() {
        return RangeResolution::Partial { start, end: total - 1 };
    }

    let Ok(end) = end_raw.trim().parse::<u64>() else {
        return RangeResolution::Full;
    };
    if end < start {
        return RangeResolution::Full;
    }

    RangeResolution::Partial {
        start,
        end: end.min(total - 1),
    }
}

/// Stream `len` bytes from `file` without loading the whole file into memory.
fn stream_body(file: tokio::fs::File, len: u64) -> impl Stream<Item = std::io::Result<Bytes>> {
    futures_util::stream::try_unfold((file, len), |(mut file, remaining)| async move {
        if remaining == 0 {
            return Ok(None);
        }
        let capacity = remaining.min(STREAM_CHUNK) as usize;
        let mut buffer = vec![0u8; capacity];
        let read = file.read(&mut buffer).await?;
        if read == 0 {
            return Ok(None);
        }
        buffer.truncate(read);
        Ok(Some((Bytes::from(buffer), (file, remaining - read as u64))))
    })
}

/// Map a file extension to a MIME type. Hand-rolled on purpose (like
/// [`crate::embedded::mime_type`]) so no extra crate is pulled in.
fn mime_type(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase);

    match ext.as_deref() {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("mp3") => "audio/mpeg",
        Some("flac") => "audio/flac",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        Some("m4a") => "audio/mp4",
        Some("pdf") => "application/pdf",
        Some("txt" | "log") => "text/plain; charset=utf-8",
        Some("md") => "text/markdown; charset=utf-8",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        Some("csv") => "text/csv; charset=utf-8",
        Some("html" | "htm") => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}

// ---------------------------------------------------------------------------
// POST /api/files/open
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct OpenRequest {
    pub(crate) path: String,
    #[serde(default)]
    pub(crate) mode: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct OpenResponse {
    pub(crate) opened: bool,
    pub(crate) error: Option<String>,
}

#[derive(Clone, Copy)]
enum OpenMode {
    File,
    Folder,
}

/// POST /api/files/open
///
/// Opens a file with the OS default application, or reveals its containing
/// folder in the OS file manager.
///
/// **This only works when the server runs on the same machine as the user's
/// desktop session.** In Docker, in a remote/headless setup, or over SSH the
/// spawn either fails or launches something the user cannot see; the endpoint
/// still answers `200` with `opened: false` and an actionable `error` so the
/// frontend can surface it as a toast.
///
/// The opener is always a fixed program invoked with the path as an argument –
/// never a shell string – so a crafted path cannot inject commands.
pub(crate) async fn open_path(Json(req): Json<OpenRequest>) -> Json<OpenResponse> {
    let mode = match req.mode.as_deref() {
        None | Some("folder") => OpenMode::Folder,
        Some("file") => OpenMode::File,
        Some(other) => {
            return Json(OpenResponse {
                opened: false,
                error: Some(format!("unsupported mode '{other}', expected 'file' or 'folder'")),
            });
        }
    };

    let path = Path::new(&req.path);
    if req.path.is_empty() || !path.exists() {
        return Json(OpenResponse {
            opened: false,
            error: Some(format!("path does not exist: {}", req.path)),
        });
    }

    let file_arg = path.to_string_lossy().into_owned();
    let folder_arg = if path.is_dir() {
        file_arg.clone()
    } else {
        match path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent.to_string_lossy().into_owned(),
            _ => {
                return Json(OpenResponse {
                    opened: false,
                    error: Some(format!("cannot determine the containing folder of {}", req.path)),
                });
            }
        }
    };

    let (program, args) = opener_program(&file_arg, &folder_arg, mode);
    let mut command = std::process::Command::new(program);
    command.args(&args);

    match command.spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                if let Err(e) = child.wait() {
                    tracing::warn!("Opener process '{program}' failed: {e}");
                }
            });
            Json(OpenResponse {
                opened: true,
                error: None,
            })
        }
        Err(e) => {
            tracing::warn!("Failed to open {} with '{program}': {e}", req.path);
            Json(OpenResponse {
                opened: false,
                error: Some(format!(
                    "could not launch '{program}': {e}. Opening files only works when the server runs on the same machine as your desktop session (it does nothing useful in Docker or remote setups)."
                )),
            })
        }
    }
}

/// Return the fixed opener program and its arguments for the current platform.
#[cfg(target_os = "linux")]
fn opener_program(file_path: &str, folder_path: &str, mode: OpenMode) -> (&'static str, Vec<String>) {
    match mode {
        OpenMode::File => ("xdg-open", vec![file_path.to_string()]),
        OpenMode::Folder => ("xdg-open", vec![folder_path.to_string()]),
    }
}

#[cfg(target_os = "macos")]
fn opener_program(file_path: &str, folder_path: &str, mode: OpenMode) -> (&'static str, Vec<String>) {
    let _ = folder_path;
    match mode {
        OpenMode::File => ("open", vec![file_path.to_string()]),
        // `-R` reveals the file with it selected in Finder.
        OpenMode::Folder => ("open", vec!["-R".to_string(), file_path.to_string()]),
    }
}

#[cfg(target_os = "windows")]
fn opener_program(file_path: &str, folder_path: &str, mode: OpenMode) -> (&'static str, Vec<String>) {
    let _ = folder_path;
    match mode {
        OpenMode::File => (
            "cmd",
            vec![
                "/C".to_string(),
                "start".to_string(),
                String::new(),
                file_path.to_string(),
            ],
        ),
        OpenMode::Folder => ("explorer", vec![format!("/select,{file_path}")]),
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn opener_program(_file_path: &str, _folder_path: &str, _mode: OpenMode) -> (&'static str, Vec<String>) {
    // No known opener on this platform – the empty program name makes `spawn`
    // fail and the caller reports a graceful `opened: false`.
    ("", Vec::new())
}
