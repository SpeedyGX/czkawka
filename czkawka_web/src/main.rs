mod api;
mod embedded;
mod scan_manager;
mod ws;

use std::io::IsTerminal;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;
use czkawka_core::common::config_cache_path::set_config_cache_path;
use tower_http::cors::CorsLayer;

use crate::api::scan::AppState;
use crate::scan_manager::ScanManager;

#[tokio::main]
async fn main() {
    // If launched by double-click (no terminal attached), re-exec in a terminal
    if !std::io::stdin().is_terminal() {
        let exe = std::env::current_exe().expect("failed to get current executable path");
        // Wrap in shell so terminal stays open if the binary crashes
        let wrapper = format!("{}; echo; read -p 'Press Enter to exit...'", exe.display());

        // Try common terminal emulators in order of preference
        // x-terminal-emulator is the Debian/Ubuntu standard symlink
        let terminals = [
            "x-terminal-emulator", // Debian/Ubuntu default
            "gnome-terminal",      // GNOME
            "konsole",             // KDE
            "xfce4-terminal",      // XFCE
            "lxterminal",          // LXDE/LXQt
            "xterm",               // Universal fallback
        ];

        for term in &terminals {
            // Use Command::new(term) directly - if the binary exists, spawn will succeed
            if let Ok(mut _child) = std::process::Command::new(term)
                .arg("-e")
                .arg("bash")
                .arg("-c")
                .arg(&wrapper)
                .spawn()
            {
                // Successfully launched in a terminal - exit the headless process
                // gnome-terminal/konsole daemonize, so we don't wait
                std::process::exit(0);
            }
        }

        // No terminal found - print a warning and continue running anyway
        eprintln!("Warning: Not running in a terminal. Cannot find a terminal emulator to launch.");
        eprintln!("The server will start but you may need to use 'kill' or system monitor to stop it.");
    }

    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Required by czkawka_core – sets up cache/config paths and image decoders.
    let _ = set_config_cache_path("Czkawka", "CzkawkaWeb");

    let state = AppState {
        scan_manager: Arc::new(ScanManager::new()),
    };

    let app = Router::new()
        // File browser
        .route("/api/browse", get(api::browse::handle_browse))
        // Scan endpoints
        .route("/api/scan/duplicates", post(api::scan::scan_duplicates))
        .route("/api/scan/hardlink", post(api::scan::scan_hardlink))
        .route("/api/scan/similar-images", post(api::scan::scan_similar_images))
        .route("/api/scan/similar-videos", post(api::scan::scan_similar_videos))
        .route("/api/scan/stop", post(api::scan::stop_scan_handler))
        // Preview
        .route("/api/preview/image", get(api::preview::image_preview))
        .route("/api/preview/video", get(api::preview::video_preview))
        // Results & progress
        .route("/api/results/{scan_id}", get(api::results::get_results))
        .route("/api/scan/progress/{scan_id}", get(ws::ws_handler))
        // File actions
        .route("/api/files/delete", post(api::actions::delete_files))
        .route("/api/files/hardlink", post(api::actions::hardlink_files))
        .layer(CorsLayer::permissive())
        .fallback(get(embedded::serve_static))
        .with_state(state);

    let port = std::env::var("CZKAWKA_PORT").ok().and_then(|p| p.parse::<u16>().ok()).unwrap_or(8095);
    let host = std::env::var("CZKAWKA_ADDRESS").unwrap_or_else(|_| "127.0.0.1".to_string());
    let addr: SocketAddr = format!("{}:{}", host, port).parse().expect("Invalid CZKAWKA_ADDRESS or CZKAWKA_PORT");
    tracing::info!("Czkawka Web Server starting on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.expect("Failed to bind to address");
    axum::serve(listener, app).await.expect("Server error");
}
