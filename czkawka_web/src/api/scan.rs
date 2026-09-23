use std::sync::Arc;
use std::sync::atomic::Ordering;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use czkawka_core::common::consts::DEFAULT_THREAD_SIZE;
use czkawka_core::common::tool_data::{CommonData, DeleteMethod};
use czkawka_core::common::traits::Search;
use czkawka_core::re_exported::{FilterType, HashAlg};
use czkawka_core::tools::duplicate::{DuplicateFinder, DuplicateFinderParameters};
use czkawka_core::tools::similar_images::{GeometricInvariance, SimilarImages, SimilarImagesParameters};
use czkawka_core::tools::similar_videos::{
    ALLOWED_AUDIO_LENGTH_RATIO, ALLOWED_AUDIO_SIMILARITY_PERCENT, ALLOWED_SKIP_FORWARD_AMOUNT, ALLOWED_VID_HASH_DURATION, DEFAULT_AUDIO_LENGTH_RATIO, DEFAULT_AUDIO_MAXIMUM_DIFFERENCE,
    DEFAULT_AUDIO_MIN_DURATION_SECONDS, DEFAULT_AUDIO_SIMILARITY_PERCENT, DEFAULT_SKIP_FORWARD_AMOUNT, DEFAULT_VID_HASH_DURATION, MAX_TOLERANCE, SimilarVideos, SimilarVideosParameters,
};
use serde::{Deserialize, Serialize};

use crate::scan_manager::{ScanManager, ScanStatus};

/// Try to read the inode of a file. Returns 0 on any error.
fn inode_of(path: &std::path::Path) -> u64 {
    match std::fs::metadata(path) {
        Ok(m) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                let ino = m.ino();
                tracing::debug!("inode_of OK {} -> {}", path.display(), ino);
                ino
            }
            #[cfg(not(unix))]
            {
                let _ = (&m,);
                0
            }
        }
        Err(e) => {
            tracing::warn!("inode_of FAIL {} -> {}", path.display(), e);
            0
        }
    }
}

/// Shared application state.
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) scan_manager: Arc<ScanManager>,
    pub(crate) tokio_handle: tokio::runtime::Handle,
}

// ---------------------------------------------------------------------------
// Shared request / response types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(crate) struct ScanResponse {
    pub(crate) scan_id: String,
    pub(crate) status: String,
}

#[derive(Deserialize)]
pub(crate) struct StopScanRequest {
    pub(crate) scan_id: String,
}

/// POST /api/scan/stop
pub(crate) async fn stop_scan_handler(
    State(state): State<AppState>,
    Json(req): Json<StopScanRequest>,
) -> Json<ScanResponse> {
    let stopped = state.scan_manager.stop_scan(&req.scan_id).await;
    Json(ScanResponse {
        scan_id: req.scan_id,
        status: if stopped { "stopped".to_string() } else { "not_found".to_string() },
    })
}

// ---------------------------------------------------------------------------
// Generic scan runner – encapsulates the common flow for all 4 scan endpoints.
// ---------------------------------------------------------------------------

type ToolResult = (ScanStatus, Option<serde_json::Value>);
type JsonError = (StatusCode, Json<serde_json::Value>);

/// Shared scan orchestration: semaphore, channel setup, thread spawn,
/// catch_unwind, and `finish_scan` via the stored tokio handle.
async fn run_scan<F>(
    state: &AppState,
    tool_fn: F,
) -> Result<Json<ScanResponse>, JsonError>
where
    F: FnOnce(&Arc<std::sync::atomic::AtomicBool>, &crossbeam_channel::Sender<czkawka_core::common::progress_data::ProgressData>) -> ToolResult
        + Send
        + 'static,
{
    let Ok(permit) = state.scan_manager.concurrent_scan_semaphore.clone().try_acquire_owned() else {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({"error": "A scan is already in progress"})),
        ));
    };

    let (id, stop_flag, _rx) = state.scan_manager.create_scan().await;

    let manager = Arc::clone(&state.scan_manager);
    let id_clone = id.clone();
    let handle = state.tokio_handle.clone();

    let (tx, rx) = crossbeam_channel::unbounded::<czkawka_core::common::progress_data::ProgressData>();
    let rx: &'static crossbeam_channel::Receiver<czkawka_core::common::progress_data::ProgressData> =
        Box::leak(Box::new(rx));

    let bcast_tx = state.scan_manager.scans.lock().await.get(&id).map(|s| s.progress_broadcast.clone());
    if let Some(bcast) = bcast_tx {
        std::thread::spawn(move || {
            while let Ok(progress) = rx.recv() {
                let _ = bcast.send(progress);
            }
        });
    }

    std::thread::Builder::new()
        .stack_size(DEFAULT_THREAD_SIZE)
        .spawn(move || {
            let _permit = permit;

            let manager_for_error = Arc::clone(&manager);
            let id_for_error = id_clone.clone();
            let handle_for_error = handle.clone();

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let (status, result_json) = tool_fn(&stop_flag, &tx);
                handle.block_on(async move {
                    manager.finish_scan(&id_clone, status, result_json).await;
                });
            }));

            if let Err(panic) = result {
                let msg = extract_panic_message(&panic);
                handle_for_error.block_on(async move {
                    manager_for_error.finish_scan(&id_for_error, ScanStatus::Failed(msg), None).await;
                });
            }
        })
        .expect("Failed to spawn scan thread");

    Ok(Json(ScanResponse {
        scan_id: id,
        status: "started".to_string(),
    }))
}

fn extract_panic_message(panic: &(dyn std::any::Any + Send)) -> String {
    match panic.downcast_ref::<&str>() {
        Some(s) => s.to_string(),
        None => match panic.downcast_ref::<String>() {
            Some(s) => s.clone(),
            None => "Unknown error".to_string(),
        },
    }
}

// ---------------------------------------------------------------------------
// Duplicates  POST /api/scan/duplicates
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct ScalableScanRequest {
    pub(crate) included_paths: Vec<String>,
    pub(crate) excluded_paths: Option<Vec<String>>,
    pub(crate) excluded_items: Option<String>,
    pub(crate) allowed_extensions: Option<String>,
    pub(crate) excluded_extensions: Option<String>,
    pub(crate) recursive: Option<bool>,
    pub(crate) min_file_size: Option<u64>,
    pub(crate) max_file_size: Option<u64>,
    pub(crate) use_cache: Option<bool>,
    pub(crate) checking_method: Option<String>,
    pub(crate) hash_type: Option<String>,
    pub(crate) case_sensitive_name: Option<bool>,
}

/// POST /api/scan/duplicates
pub(crate) async fn scan_duplicates(
    State(state): State<AppState>,
    Json(req): Json<ScalableScanRequest>,
) -> Result<Json<ScanResponse>, JsonError> {
    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();
    let excluded: Vec<_> = req.excluded_paths.unwrap_or_default().iter().map(std::path::PathBuf::from).collect();

    let checking_method = match req.checking_method.as_deref() {
        Some("Size") => czkawka_core::common::model::CheckingMethod::Size,
        Some("Name") => czkawka_core::common::model::CheckingMethod::Name,
        Some("SizeName") => czkawka_core::common::model::CheckingMethod::SizeName,
        _ => czkawka_core::common::model::CheckingMethod::Hash,
    };
    let hash_type = match req.hash_type.as_deref() {
        Some("CRC32") => czkawka_core::common::model::HashType::Crc32,
        Some("XXH3") => czkawka_core::common::model::HashType::Xxh3,
        _ => czkawka_core::common::model::HashType::Blake3,
    };

    run_scan(&state, move |stop_flag, tx| {
        let params = DuplicateFinderParameters::new(
            checking_method,
            hash_type,
            req.use_cache.unwrap_or(true),
            req.min_file_size.unwrap_or(1024),
            req.max_file_size.unwrap_or(u64::MAX),
            req.case_sensitive_name.unwrap_or(false),
        );
        let mut tool = DuplicateFinder::new(params);

        tool.set_included_paths(included);
        tool.set_excluded_paths(excluded);
        tool.set_recursive_search(req.recursive.unwrap_or(true));

        if let Some(ref excluded_items) = req.excluded_items {
            tool.set_excluded_items(excluded_items.split(',').map(String::from).collect());
        }
        if let Some(ref allowed_ext) = req.allowed_extensions {
            tool.set_allowed_extensions(allowed_ext.split(',').map(String::from).collect());
        }
        if let Some(ref excluded_ext) = req.excluded_extensions {
            tool.set_excluded_extensions(excluded_ext.split(',').map(String::from).collect());
        }

        tool.set_use_cache(req.use_cache.unwrap_or(true));

        if !stop_flag.load(Ordering::Relaxed) {
            tool.search(stop_flag, Some(tx));
        }

        let status = if tool.get_stopped_search() {
            ScanStatus::Stopped
        } else {
            ScanStatus::Completed
        };

        let result_json = if matches!(status, ScanStatus::Completed) {
            Some(serialize_duplicate_results(&tool))
        } else {
            None
        };

        (status, result_json)
    })
    .await
}

/// Helper: extract all duplicate groups from a completed [`DuplicateFinder`] into a JSON value.
fn serialize_duplicate_results(tool: &DuplicateFinder) -> serde_json::Value {
    use czkawka_core::common::model::CheckingMethod;

    let info = tool.get_information();
    let params = tool.get_params();

    let (summary, groups) = match params.check_method {
        CheckingMethod::Hash => {
            let summary = serde_json::json!({
                "groups": info.number_of_groups_by_hash,
                "files": info.number_of_duplicated_files_by_hash,
                "lost_space": info.lost_space_by_hash,
            });
            let groups: Vec<serde_json::Value> = tool
                .get_files_sorted_by_hash()
                .iter()
                .flat_map(|(size, hash_groups)| {
                    hash_groups.iter().map(move |group| {
                        serde_json::json!({
                            "size": size,
                            "files": group.iter().map(|entry| serde_json::json!({
                                "path": entry.path.to_string_lossy(),
                                "size": entry.size,
                                "modified_date": entry.modified_date,
                                "hash": entry.hash,
                                "inode": inode_of(&entry.path),
                            })).collect::<Vec<_>>(),
                        })
                    })
                })
                .collect();
            (summary, groups)
        }
        CheckingMethod::Size => {
            let summary = serde_json::json!({
                "groups": info.number_of_groups_by_size,
                "files": info.number_of_duplicated_files_by_size,
                "lost_space": info.lost_space_by_size,
            });
            let groups: Vec<serde_json::Value> = tool
                .get_files_sorted_by_size()
                .iter()
                .map(|(size, entries)| {
                    serde_json::json!({
                        "size": size,
                        "files": entries.iter().map(|entry| serde_json::json!({
                            "path": entry.path.to_string_lossy(),
                            "size": entry.size,
                            "modified_date": entry.modified_date,
                            "inode": inode_of(&entry.path),
                        })).collect::<Vec<_>>(),
                    })
                })
                .collect();
            (summary, groups)
        }
        CheckingMethod::Name => {
            let summary = serde_json::json!({
                "groups": info.number_of_groups_by_name,
                "files": info.number_of_duplicated_files_by_name,
            });
            let groups: Vec<serde_json::Value> = tool
                .get_files_sorted_by_names()
                .iter()
                .map(|(name, entries)| {
                    serde_json::json!({
                        "name": name,
                        "files": entries.iter().map(|entry| serde_json::json!({
                            "path": entry.path.to_string_lossy(),
                            "size": entry.size,
                            "modified_date": entry.modified_date,
                            "inode": inode_of(&entry.path),
                        })).collect::<Vec<_>>(),
                    })
                })
                .collect();
            (summary, groups)
        }
        CheckingMethod::SizeName => {
            let summary = serde_json::json!({
                "groups": info.number_of_groups_by_size_name,
                "files": info.number_of_duplicated_files_by_size_name,
                "lost_space": info.lost_space_by_size,
            });
            let groups: Vec<serde_json::Value> = tool
                .get_files_sorted_by_size_name()
                .iter()
                .map(|((size, name), entries)| {
                    serde_json::json!({
                        "size": size,
                        "name": name,
                        "files": entries.iter().map(|entry| serde_json::json!({
                            "path": entry.path.to_string_lossy(),
                            "size": entry.size,
                            "modified_date": entry.modified_date,
                            "inode": inode_of(&entry.path),
                        })).collect::<Vec<_>>(),
                    })
                })
                .collect();
            (summary, groups)
        }
        CheckingMethod::None | CheckingMethod::AudioTags | CheckingMethod::AudioContent | CheckingMethod::VideoAudioContent => {
            let summary = serde_json::json!({
                "groups": 0,
                "files": 0,
                "lost_space": 0,
            });
            (summary, Vec::new())
        }
    };

    serde_json::json!({
        "tool": "duplicates",
        "checking_method": format!("{:?}", params.check_method),
        "summary": summary,
        "groups": groups,
    })
}

// ---------------------------------------------------------------------------
// Hardlink (scan)  POST /api/scan/hardlink
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct HardlinkScanRequest {
    pub(crate) included_paths: Vec<String>,
}

/// POST /api/scan/hardlink
///
/// Scans the given paths for duplicates using hash comparison and replaces
/// all duplicates with hardlinks pointing to the first-encountered copy.
pub(crate) async fn scan_hardlink(
    State(state): State<AppState>,
    Json(req): Json<HardlinkScanRequest>,
) -> Result<Json<ScanResponse>, JsonError> {
    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();

    run_scan(&state, move |stop_flag, tx| {
        let params = DuplicateFinderParameters::new(
            czkawka_core::common::model::CheckingMethod::Hash,
            czkawka_core::common::model::HashType::Blake3,
            true,
            1024,
            u64::MAX,
            false,
        );
        let mut tool = DuplicateFinder::new(params);

        tool.set_included_paths(included);
        tool.set_recursive_search(true);
        tool.set_dry_run(false);
        tool.set_delete_method(DeleteMethod::HardLink);

        if !stop_flag.load(Ordering::Relaxed) {
            tool.search(stop_flag, Some(tx));
        }

        let status = if tool.get_stopped_search() {
            ScanStatus::Stopped
        } else {
            ScanStatus::Completed
        };

        let result_json = if matches!(status, ScanStatus::Completed) {
            Some(serialize_duplicate_results(&tool))
        } else {
            None
        };

        (status, result_json)
    })
    .await
}

// ---------------------------------------------------------------------------
// Similar Images  POST /api/scan/similar-images
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct SimilarImagesRequest {
    pub(crate) included_paths: Vec<String>,
    pub(crate) excluded_paths: Option<Vec<String>>,
    pub(crate) similarity: Option<u32>,
    pub(crate) hash_size: Option<u8>,
    pub(crate) hash_alg: Option<String>,
    pub(crate) resize_filter: Option<String>,
    /// One of `off` (default), `mirror_flip`, `mirror_flip_rotate90`.
    pub(crate) geometric_invariance: Option<String>,
    pub(crate) recursive: Option<bool>,
}

/// POST /api/scan/similar-images
pub(crate) async fn scan_similar_images(
    State(state): State<AppState>,
    Json(req): Json<SimilarImagesRequest>,
) -> Result<Json<ScanResponse>, JsonError> {
    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();
    let excluded: Vec<_> = req.excluded_paths.unwrap_or_default().iter().map(std::path::PathBuf::from).collect();

    let max_difference = req.similarity.unwrap_or(10);
    let hash_size = req.hash_size.unwrap_or(16);
    // Unknown or missing values fall back to Mean, matching the Krokiet default.
    let hash_alg = match req.hash_alg.as_deref() {
        Some("Gradient") => HashAlg::Gradient,
        Some("BlockHash" | "Blockhash") => HashAlg::Blockhash,
        Some("VertGradient") => HashAlg::VertGradient,
        Some("DoubleGradient") => HashAlg::DoubleGradient,
        Some("Median") => HashAlg::Median,
        _ => HashAlg::Mean,
    };
    let image_filter = match req.resize_filter.as_deref() {
        Some("Gaussian") => FilterType::Gaussian,
        Some("CatmullRom") => FilterType::CatmullRom,
        Some("Triangle") => FilterType::Triangle,
        Some("Nearest") => FilterType::Nearest,
        _ => FilterType::Lanczos3,
    };

    let geometric_invariance = match req.geometric_invariance.as_deref() {
        Some("mirror_flip") => GeometricInvariance::MirrorFlip,
        Some("mirror_flip_rotate90") => GeometricInvariance::MirrorFlipRotate90,
        _ => GeometricInvariance::Off,
    };

    run_scan(&state, move |stop_flag, tx| {
        let params = SimilarImagesParameters::new(
            max_difference,
            hash_size,
            hash_alg,
            image_filter,
            false,
            false,
            geometric_invariance,
        );
        let mut tool = SimilarImages::new(params);

        tool.set_included_paths(included);
        tool.set_excluded_paths(excluded);
        tool.set_recursive_search(req.recursive.unwrap_or(true));
        tool.set_hide_hard_links(false);

        if !stop_flag.load(Ordering::Relaxed) {
            tool.search(stop_flag, Some(tx));
        }

        let status = if tool.get_stopped_search() {
            ScanStatus::Stopped
        } else {
            ScanStatus::Completed
        };

        let result_json = if matches!(status, ScanStatus::Completed) {
            Some(serialize_similar_images_results(&tool))
        } else {
            None
        };

        (status, result_json)
    })
    .await
}

fn serialize_similar_images_results(tool: &SimilarImages) -> serde_json::Value {
    let info = tool.get_information();
    let hash_size = tool.get_params().hash_size;
    let max_bits = u32::from(hash_size) * u32::from(hash_size);
    let diff_to_pct = |diff: u32| (max_bits.saturating_sub(diff) * 100) / max_bits;

    let groups: Vec<serde_json::Value> = tool
        .get_similar_images()
        .iter()
        .map(|group| {
            let files: Vec<serde_json::Value> = group
                .iter()
                .map(|entry| {
                    serde_json::json!({
                        "path": entry.path.to_string_lossy(),
                        "size": entry.size,
                        "width": entry.width,
                        "height": entry.height,
                        "difference": entry.difference,
                        "similarity": diff_to_pct(entry.difference),
                        "inode": inode_of(&entry.path),
                    })
                })
                .collect();
            serde_json::json!({
                "similarity": group.first().map_or(0, |e| diff_to_pct(e.difference)),
                "files": files,
            })
        })
        .collect();

    serde_json::json!({
        "tool": "similar-images",
        "summary": {
            "groups": info.number_of_groups,
            "files": info.number_of_duplicates,
        },
        "groups": groups,
    })
}

// ---------------------------------------------------------------------------
// Similar Videos  POST /api/scan/similar-videos
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(crate) struct SimilarVideosRequest {
    pub(crate) included_paths: Vec<String>,
    pub(crate) excluded_paths: Option<Vec<String>>,
    pub(crate) tolerance: Option<i32>,
    pub(crate) skip_forward: Option<u32>,
    pub(crate) hash_duration: Option<u32>,
    pub(crate) crop_detect: Option<String>,
    pub(crate) generate_thumbnails: Option<bool>,
    pub(crate) recursive: Option<bool>,
    pub(crate) check_audio_content: Option<bool>,
    pub(crate) audio_similarity_percent: Option<f64>,
    pub(crate) audio_maximum_difference: Option<f64>,
    pub(crate) audio_length_ratio: Option<f64>,
    pub(crate) audio_min_duration_seconds: Option<u32>,
}

/// POST /api/scan/similar-videos
pub(crate) async fn scan_similar_videos(
    State(state): State<AppState>,
    Json(req): Json<SimilarVideosRequest>,
) -> Result<Json<ScanResponse>, JsonError> {
    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();
    let excluded: Vec<_> = req.excluded_paths.unwrap_or_default().iter().map(std::path::PathBuf::from).collect();

    // Clamp every numeric option to the ranges enforced by `SimilarVideosParameters::new`,
    // so a malformed request cannot trip an assertion panic inside the worker thread.
    let tolerance = req.tolerance.unwrap_or(10).clamp(0, MAX_TOLERANCE);
    let skip_forward = req.skip_forward.unwrap_or(DEFAULT_SKIP_FORWARD_AMOUNT).clamp(*ALLOWED_SKIP_FORWARD_AMOUNT.start(), *ALLOWED_SKIP_FORWARD_AMOUNT.end());
    let hash_duration = req.hash_duration.unwrap_or(DEFAULT_VID_HASH_DURATION).clamp(*ALLOWED_VID_HASH_DURATION.start(), *ALLOWED_VID_HASH_DURATION.end());
    let crop_detect = req.crop_detect.as_deref()
        .and_then(czkawka_core::tools::similar_videos::crop_detect_from_str_opt)
        .unwrap_or(czkawka_core::tools::similar_videos::DEFAULT_CROP_DETECT);
    let check_audio_content = req.check_audio_content.unwrap_or(false);
    // Audio comparison does not use thumbnails, so default them off in audio mode.
    // An explicit caller value still wins.
    let generate_thumbnails = req.generate_thumbnails.unwrap_or(!check_audio_content);
    let audio_similarity_percent = req.audio_similarity_percent.unwrap_or(DEFAULT_AUDIO_SIMILARITY_PERCENT).clamp(*ALLOWED_AUDIO_SIMILARITY_PERCENT.start(), *ALLOWED_AUDIO_SIMILARITY_PERCENT.end());
    let audio_length_ratio = req.audio_length_ratio.unwrap_or(DEFAULT_AUDIO_LENGTH_RATIO).clamp(*ALLOWED_AUDIO_LENGTH_RATIO.start(), *ALLOWED_AUDIO_LENGTH_RATIO.end());
    let audio_maximum_difference = req.audio_maximum_difference.unwrap_or(DEFAULT_AUDIO_MAXIMUM_DIFFERENCE).max(0.0);
    let audio_min_duration_seconds = req.audio_min_duration_seconds.unwrap_or(DEFAULT_AUDIO_MIN_DURATION_SECONDS);

    run_scan(&state, move |stop_flag, tx| {
        let params = SimilarVideosParameters::new(
            tolerance,
            false,
            false,
            skip_forward,
            hash_duration,
            crop_detect,
            generate_thumbnails,
            10,
            false,
            4,
            check_audio_content,
            audio_similarity_percent,
            audio_maximum_difference,
            audio_length_ratio,
            audio_min_duration_seconds,
        );
        let mut tool = SimilarVideos::new(params);

        tool.set_included_paths(included);
        tool.set_excluded_paths(excluded);
        tool.set_recursive_search(req.recursive.unwrap_or(true));
        tool.set_hide_hard_links(false);

        if !stop_flag.load(Ordering::Relaxed) {
            tool.search(stop_flag, Some(tx));
        }

        let status = if tool.get_stopped_search() {
            ScanStatus::Stopped
        } else {
            ScanStatus::Completed
        };

        let result_json = if matches!(status, ScanStatus::Completed) {
            Some(serialize_similar_videos_results(&tool))
        } else {
            None
        };

        (status, result_json)
    })
    .await
}

fn serialize_similar_videos_results(tool: &SimilarVideos) -> serde_json::Value {
    let info = tool.get_information();
    let max_bits = 1000u32; // HASH_SIZE^3 = 10×10×10 = 1000
    let diff_to_pct = |diff: u32| (max_bits.saturating_sub(diff) * 100) / max_bits;
    // Audio-fingerprint rows carry `difference = 0`, so the derived percentage is not a
    // meaningful visual-similarity value; expose the active mode for the UI to label it.
    let mode = if matches!(tool.get_check_method(), czkawka_core::common::model::CheckingMethod::VideoAudioContent) {
        "audio"
    } else {
        "visual"
    };

    let groups: Vec<serde_json::Value> = tool
        .get_similar_videos()
        .iter()
        .map(|group| {
            let files: Vec<serde_json::Value> = group
                .iter()
                .map(|entry| {
                    serde_json::json!({
                        "path": entry.path.to_string_lossy(),
                        "size": entry.size,
                        "duration": entry.duration,
                        "codec": entry.codec,
                        "fps": entry.fps,
                        "width": entry.width,
                        "height": entry.height,
                        "bitrate": entry.bitrate,
                        "thumbnail_path": entry.thumbnail_path.as_ref().map(|p| p.to_string_lossy().to_string()),
                        "difference": entry.difference,
                        "similarity": diff_to_pct(entry.difference),
                        "inode": inode_of(&entry.path),
                    })
                })
                .collect();
            serde_json::json!({
                "similarity": group.first().map_or(0, |e| diff_to_pct(e.difference)),
                "files": files,
            })
        })
        .collect();

    serde_json::json!({
        "tool": "similar-videos",
        "mode": mode,
        "summary": {
            "groups": info.number_of_groups,
            "files": info.number_of_duplicates,
        },
        "groups": groups,
    })
}
