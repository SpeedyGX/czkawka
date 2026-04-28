use std::sync::Arc;

use axum::extract::State;
use axum::response::Json;
use czkawka_core::common::consts::DEFAULT_THREAD_SIZE;
use czkawka_core::common::tool_data::{CommonData, DeleteMethod};
use czkawka_core::common::traits::Search;
use czkawka_core::re_exported::{FilterType, HashAlg};
use czkawka_core::tools::duplicate::{DuplicateFinder, DuplicateFinderParameters};
use czkawka_core::tools::similar_images::{SimilarImages, SimilarImagesParameters};
use czkawka_core::tools::similar_videos::{SimilarVideos, SimilarVideosParameters};
use serde::{Deserialize, Serialize};

use crate::scan_manager::ScanManager;

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
) -> Json<ScanResponse> {
    let (id, stop_flag, _rx) = state.scan_manager.create_scan().await;

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

    let manager = Arc::clone(&state.scan_manager);
    let id_clone = id.clone();

    // Crossbeam channel: the receiver must outlive ALL sender clones.
    let (tx, rx) = crossbeam_channel::unbounded::<czkawka_core::common::progress_data::ProgressData>();
    let rx: &'static crossbeam_channel::Receiver<czkawka_core::common::progress_data::ProgressData> =
        Box::leak(Box::new(rx));

    // Forward crossbeam progress → tokio broadcast (for WebSocket clients).
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
            let manager_for_error = Arc::clone(&manager);
            let id_for_error = id_clone.clone();

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let params = DuplicateFinderParameters::new(
                    checking_method,
                    hash_type,
                    req.use_cache.unwrap_or(true),
                    req.min_file_size.unwrap_or(1024),
                    req.max_file_size.unwrap_or(u64::MAX),
                    req.case_sensitive_name.unwrap_or(false),
                );
                let mut tool = DuplicateFinder::new(params);

                tool.set_included_paths(included.clone());
                tool.set_excluded_paths(excluded.clone());
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

                if !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    tool.search(&stop_flag, Some(&tx));
                }

                let status = if tool.get_stopped_search() {
                    crate::scan_manager::ScanStatus::Stopped
                } else {
                    crate::scan_manager::ScanStatus::Completed
                };

                // Serialise results to JSON – complete file data per group.
                let result_json = if matches!(status, crate::scan_manager::ScanStatus::Completed) {
                    Some(serialize_duplicate_results(&tool))
                } else {
                    None
                };

                // We are in a std thread with no tokio context, so create a fresh runtime.
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager.finish_scan(&id_clone, status, result_json).await;
                });
            }));

            if let Err(panic) = result {
                let msg = match panic.downcast_ref::<&str>() {
                    Some(s) => s.to_string(),
                    None => match panic.downcast_ref::<String>() {
                        Some(s) => s.clone(),
                        None => "Unknown error".to_string(),
                    },
                };
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager_for_error.finish_scan(&id_for_error, crate::scan_manager::ScanStatus::Failed(msg), None).await;
                });
            }
        })
        .expect("Failed to spawn scan thread");

    Json(ScanResponse {
        scan_id: id,
        status: "started".to_string(),
    })
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
        CheckingMethod::None | CheckingMethod::AudioTags | CheckingMethod::AudioContent => {
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
) -> Json<ScanResponse> {
    let (id, stop_flag, _rx) = state.scan_manager.create_scan().await;

    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();

    let manager = Arc::clone(&state.scan_manager);
    let id_clone = id.clone();

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
            let manager_for_error = Arc::clone(&manager);
            let id_for_error = id_clone.clone();

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let params = DuplicateFinderParameters::new(
                    czkawka_core::common::model::CheckingMethod::Hash,
                    czkawka_core::common::model::HashType::Blake3,
                    true,            // use_cache
                    1024,            // min_file_size
                    u64::MAX,        // max_file_size
                    false,           // case_sensitive_name
                );
                let mut tool = DuplicateFinder::new(params);

                tool.set_included_paths(included);
                tool.set_recursive_search(true);
                tool.set_dry_run(false);
                tool.set_delete_method(DeleteMethod::HardLink);

                if !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    tool.search(&stop_flag, Some(&tx));
                }

                let status = if tool.get_stopped_search() {
                    crate::scan_manager::ScanStatus::Stopped
                } else {
                    crate::scan_manager::ScanStatus::Completed
                };

                let result_json = if matches!(status, crate::scan_manager::ScanStatus::Completed) {
                    Some(serialize_duplicate_results(&tool))
                } else {
                    None
                };

                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager.finish_scan(&id_clone, status, result_json).await;
                });
            }));

            if let Err(panic) = result {
                let msg = match panic.downcast_ref::<&str>() {
                    Some(s) => s.to_string(),
                    None => match panic.downcast_ref::<String>() {
                        Some(s) => s.clone(),
                        None => "Unknown error".to_string(),
                    },
                };
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager_for_error.finish_scan(&id_for_error, crate::scan_manager::ScanStatus::Failed(msg), None).await;
                });
            }
        })
        .expect("Failed to spawn scan thread");

    Json(ScanResponse {
        scan_id: id,
        status: "started".to_string(),
    })
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
    pub(crate) recursive: Option<bool>,
}

/// POST /api/scan/similar-images
pub(crate) async fn scan_similar_images(
    State(state): State<AppState>,
    Json(req): Json<SimilarImagesRequest>,
) -> Json<ScanResponse> {
    let (id, stop_flag, _rx) = state.scan_manager.create_scan().await;

    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();
    let excluded: Vec<_> = req.excluded_paths.unwrap_or_default().iter().map(std::path::PathBuf::from).collect();

    let max_difference = req.similarity.unwrap_or(10);
    let hash_size = req.hash_size.unwrap_or(16);
    let hash_alg = match req.hash_alg.as_deref() {
        Some("Mean") => HashAlg::Mean,
        Some("VertGradient") => HashAlg::VertGradient,
        Some("Blockhash") => HashAlg::Blockhash,
        Some("DoubleGradient") => HashAlg::DoubleGradient,
        _ => HashAlg::Gradient,
    };
    let image_filter = match req.resize_filter.as_deref() {
        Some("Gaussian") => FilterType::Gaussian,
        Some("CatmullRom") => FilterType::CatmullRom,
        Some("Triangle") => FilterType::Triangle,
        Some("Nearest") => FilterType::Nearest,
        _ => FilterType::Lanczos3,
    };

    let manager = Arc::clone(&state.scan_manager);
    let id_clone = id.clone();

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
            let manager_for_error = Arc::clone(&manager);
            let id_for_error = id_clone.clone();

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let params = SimilarImagesParameters::new(
                    max_difference,
                    hash_size,
                    hash_alg,
                    image_filter,
                    false, // exclude_images_with_same_size
                    false, // exclude_images_with_same_resolution
                );
                let mut tool = SimilarImages::new(params);

                tool.set_included_paths(included);
                tool.set_excluded_paths(excluded);
                tool.set_recursive_search(req.recursive.unwrap_or(true));
                // Keep hard-linked files in results (set to true keeps them visible)
                tool.set_hide_hard_links(true);

                if !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    tool.search(&stop_flag, Some(&tx));
                }

                let status = if tool.get_stopped_search() {
                    crate::scan_manager::ScanStatus::Stopped
                } else {
                    crate::scan_manager::ScanStatus::Completed
                };

                let result_json = if matches!(status, crate::scan_manager::ScanStatus::Completed) {
                    Some(serialize_similar_images_results(&tool))
                } else {
                    None
                };

                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager.finish_scan(&id_clone, status, result_json).await;
                });
            }));

            if let Err(panic) = result {
                let msg = match panic.downcast_ref::<&str>() {
                    Some(s) => s.to_string(),
                    None => match panic.downcast_ref::<String>() {
                        Some(s) => s.clone(),
                        None => "Unknown error".to_string(),
                    },
                };
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager_for_error.finish_scan(&id_for_error, crate::scan_manager::ScanStatus::Failed(msg), None).await;
                });
            }
        })
        .expect("Failed to spawn scan thread");

    Json(ScanResponse {
        scan_id: id,
        status: "started".to_string(),
    })
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
}

/// POST /api/scan/similar-videos
pub(crate) async fn scan_similar_videos(
    State(state): State<AppState>,
    Json(req): Json<SimilarVideosRequest>,
) -> Json<ScanResponse> {
    let (id, stop_flag, _rx) = state.scan_manager.create_scan().await;

    let included: Vec<_> = req.included_paths.iter().map(std::path::PathBuf::from).collect();
    let excluded: Vec<_> = req.excluded_paths.unwrap_or_default().iter().map(std::path::PathBuf::from).collect();

    let tolerance = req.tolerance.unwrap_or(10);
    let skip_forward = req.skip_forward.unwrap_or(15);
    let hash_duration = req.hash_duration.unwrap_or(10);
    let crop_detect = req.crop_detect.as_deref()
        .and_then(czkawka_core::tools::similar_videos::crop_detect_from_str_opt)
        .unwrap_or(czkawka_core::tools::similar_videos::DEFAULT_CROP_DETECT);
    let generate_thumbnails = req.generate_thumbnails.unwrap_or(true);

    let manager = Arc::clone(&state.scan_manager);
    let id_clone = id.clone();

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
            let manager_for_error = Arc::clone(&manager);
            let id_for_error = id_clone.clone();

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let params = SimilarVideosParameters::new(
                    tolerance,
                    false, // exclude_videos_with_same_size
                    false, // exclude_videos_with_same_resolution
                    skip_forward,
                    hash_duration,
                    crop_detect,
                    generate_thumbnails,
                    10,    // thumbnail_video_percentage_from_start
                    false, // generate_thumbnail_grid_instead_of_single
                    4,     // thumbnail_grid_tiles_per_side
                );
                let mut tool = SimilarVideos::new(params);

                tool.set_included_paths(included);
                tool.set_excluded_paths(excluded);
                tool.set_recursive_search(req.recursive.unwrap_or(true));
                // Keep hard-linked files in results (set to true keeps them visible)
                tool.set_hide_hard_links(true);

                if !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    tool.search(&stop_flag, Some(&tx));
                }

                let status = if tool.get_stopped_search() {
                    crate::scan_manager::ScanStatus::Stopped
                } else {
                    crate::scan_manager::ScanStatus::Completed
                };

                let result_json = if matches!(status, crate::scan_manager::ScanStatus::Completed) {
                    Some(serialize_similar_videos_results(&tool))
                } else {
                    None
                };

                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager.finish_scan(&id_clone, status, result_json).await;
                });
            }));

            if let Err(panic) = result {
                let msg = match panic.downcast_ref::<&str>() {
                    Some(s) => s.to_string(),
                    None => match panic.downcast_ref::<String>() {
                        Some(s) => s.clone(),
                        None => "Unknown error".to_string(),
                    },
                };
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async move {
                    manager_for_error.finish_scan(&id_for_error, crate::scan_manager::ScanStatus::Failed(msg), None).await;
                });
            }
        })
        .expect("Failed to spawn scan thread");

    Json(ScanResponse {
        scan_id: id,
        status: "started".to_string(),
    })
}

fn serialize_similar_videos_results(tool: &SimilarVideos) -> serde_json::Value {
    let info = tool.get_information();
    let max_bits = 1000u32; // HASH_SIZE^3 = 10×10×10 = 1000
    let diff_to_pct = |diff: u32| (max_bits.saturating_sub(diff) * 100) / max_bits;

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
        "summary": {
            "groups": info.number_of_groups,
            "files": info.number_of_duplicates,
        },
        "groups": groups,
    })
}
